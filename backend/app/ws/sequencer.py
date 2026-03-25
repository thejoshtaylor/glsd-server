"""Server-side auto sequencer for GSD command sequences.

The sequencer enables AUTO-02 (sequential command execution with /clear between
steps) and AUTO-06 (auto-advance vs manual-advance behavior). A SequenceRegistry
owns asyncio.Event instances keyed by instance_id, enabling instance lifecycle
handlers to signal step completion without polling.

Key design constraints (from STATE.md):
- NEVER hold a DB session across the sequence loop -- each dispatch gets its own session
- ALWAYS call cleanup_instance() after await event.wait() -- prevents memory leak
- Signal completion for BOTH finished and errored outcomes
- Spawn run_sequence as an independent asyncio.Task (done in frontend_router)
"""
import asyncio
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt template registry
# ---------------------------------------------------------------------------

GSD_PROMPT_TEMPLATES: dict[str, str] = {
    "new-project": "/gsd:new-project",
    "define-requirements": "/gsd:define-requirements",
    "create-roadmap": "/gsd:create-roadmap",
    "research-phase": "/gsd:research-phase {{phase}}",
    "discuss-phase": "/gsd:discuss-phase {{phase}}",
    "plan-phase": "/gsd:plan-phase {{phase}}",
    "execute-phase": "/gsd:execute-phase {{phase}}",
    "verify-phase": "/gsd:verify-phase {{phase}}",
    "plan-phase-gaps": "/gsd:plan-phase {{phase}} --gaps",
    "plan-phase-reviews": "/gsd:plan-phase {{phase}} --reviews",
    "execute-plan": "/gsd:execute-plan {{phase}} {{plan}}",
    "check-plan": "/gsd:check-plan {{phase}}",
    "uat": "/gsd:uat {{phase}}",
    "quick": "/gsd:quick {{task}}",
    "clear": "/clear",
    "retro": "/gsd:retro",
    "close-milestone": "/gsd:close-milestone",
    "new-milestone": "/gsd:new-milestone {{name}}",
    "status": "/gsd:status",
}


def expand_prompt(command_id: str, params: dict) -> str:
    """Expand a command template with its params dict.

    Replaces ``{{key}}`` placeholders in the template with values from params.
    Falls back to the command_id itself if not in the template registry.
    """
    template = GSD_PROMPT_TEMPLATES.get(command_id, command_id)
    for key, value in params.items():
        template = template.replace("{{" + key + "}}", str(value))
    return template


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class ActiveSequence:
    """Represents a running command sequence for a specific node."""

    sequence_id: str
    node_id: str
    user_id: str
    steps: list[dict]
    current_step: int = 0
    auto_advance: bool = True
    project: str = ""
    work_dir: str = "."
    task: asyncio.Task | None = None
    advance_event: asyncio.Event = field(default_factory=asyncio.Event)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class SequenceRegistry:
    """In-memory registry of instance completion events and active sequences.

    Thread safety: all callers run in the same asyncio event loop (single Uvicorn
    worker constraint). No locking required for dict operations.
    """

    def __init__(self) -> None:
        # instance_id -> asyncio.Event (set when instance finishes or errors)
        self._completion_events: dict[str, asyncio.Event] = {}
        # (node_id, sequence_id) -> ActiveSequence
        self._active: dict[tuple[str, str], ActiveSequence] = {}

    def register_instance(self, instance_id: str) -> asyncio.Event:
        """Create and store a completion event for an instance.

        Must be called BEFORE dispatching the instance so the event is ready
        when signal_completion fires. Returns the event for awaiting.
        """
        ev = asyncio.Event()
        self._completion_events[instance_id] = ev
        return ev

    def signal_completion(self, instance_id: str) -> None:
        """Signal that an instance has reached a terminal state (finished or errored).

        Called by handle_instance_finished and handle_instance_error.
        No-op if the instance is not tracked (not part of a sequence).
        """
        ev = self._completion_events.get(instance_id)
        if ev is not None:
            ev.set()

    def cleanup_instance(self, instance_id: str) -> None:
        """Remove completion event after the sequencer has consumed it.

        CRITICAL: Must be called immediately after ``await event.wait()`` returns
        to prevent unbounded memory growth in long-running server processes.
        """
        self._completion_events.pop(instance_id, None)

    def cancel_all_for_node(self, node_id: str) -> list[str]:
        """Cancel all active sequences for a disconnected node.

        Pops sequences from _active, cancels their asyncio Tasks, and returns
        the list of cancelled sequence_ids for broadcast_sequence_error calls.
        """
        to_cancel = [(nid, sid) for (nid, sid) in list(self._active) if nid == node_id]
        cancelled: list[str] = []
        for key in to_cancel:
            seq = self._active.pop(key, None)
            if seq is None:
                continue
            if seq.task is not None and not seq.task.done():
                seq.task.cancel()
            cancelled.append(seq.sequence_id)
        return cancelled

    def get_active(self, node_id: str, sequence_id: str) -> "ActiveSequence | None":
        """Return an active sequence by (node_id, sequence_id), or None."""
        return self._active.get((node_id, sequence_id))

    def start(self, seq: ActiveSequence) -> None:
        """Register a new active sequence."""
        self._active[(seq.node_id, seq.sequence_id)] = seq

    def remove(self, node_id: str, sequence_id: str) -> None:
        """Remove a sequence from the active registry (called in run_sequence finally)."""
        self._active.pop((node_id, sequence_id), None)


# Module-level singleton — mirrors connection_manager and frontend_manager pattern.
sequence_registry = SequenceRegistry()


# ---------------------------------------------------------------------------
# Sequence coroutine
# ---------------------------------------------------------------------------


async def run_sequence(seq: ActiveSequence) -> None:
    """Execute a sequence of GSD commands with /clear between steps.

    Each step dispatches /clear (to reset Claude session context) then the
    actual command. Both dispatches wait for their instance to reach a terminal
    state via asyncio.Event signalled by handle_instance_finished /
    handle_instance_error.

    Imports are deferred inside the function to avoid circular imports at
    module load time (sequencer <-> frontend_manager <-> handlers <-> sequencer).
    """
    # Deferred imports to break circular dependency chain at module level.
    from app.database import get_session_maker
    from app.ws.commands import dispatch_execute
    from app.ws.frontend_manager import frontend_manager

    try:
        for i, step in enumerate(seq.steps):
            seq.current_step = i

            # Broadcast: this step has started.
            await frontend_manager.broadcast_sequence_step(
                seq.sequence_id,
                seq.node_id,
                seq.user_id,
                step_index=i,
                total_steps=len(seq.steps),
                command_id=step["command_id"],
                status="started",
                auto_advance=seq.auto_advance,
            )

            # 1. Dispatch /clear to reset Claude session context.
            async with get_session_maker()() as db:
                clear_instance_id = await dispatch_execute(
                    node_id=seq.node_id,
                    project=seq.project,
                    work_dir=seq.work_dir,
                    prompt="/clear",
                    user_id=seq.user_id,
                    db=db,
                )
            clear_ev = sequence_registry.register_instance(clear_instance_id)
            await clear_ev.wait()
            sequence_registry.cleanup_instance(clear_instance_id)

            # 2. Dispatch the actual GSD command.
            prompt = expand_prompt(step["command_id"], step.get("params", {}))
            async with get_session_maker()() as db:
                cmd_instance_id = await dispatch_execute(
                    node_id=seq.node_id,
                    project=seq.project,
                    work_dir=seq.work_dir,
                    prompt=prompt,
                    user_id=seq.user_id,
                    db=db,
                )
            cmd_ev = sequence_registry.register_instance(cmd_instance_id)
            await cmd_ev.wait()
            sequence_registry.cleanup_instance(cmd_instance_id)

            # Broadcast: this step has completed.
            await frontend_manager.broadcast_sequence_step(
                seq.sequence_id,
                seq.node_id,
                seq.user_id,
                step_index=i,
                total_steps=len(seq.steps),
                command_id=step["command_id"],
                status="completed",
                auto_advance=seq.auto_advance,
            )

            # AUTO-06: when auto_advance is False, pause between steps.
            if not seq.auto_advance and i < len(seq.steps) - 1:
                seq.advance_event.clear()
                await seq.advance_event.wait()

        # All steps completed successfully.
        await frontend_manager.broadcast_sequence_done(seq.sequence_id, seq.node_id, seq.user_id)

    except asyncio.CancelledError:
        from app.ws.frontend_manager import frontend_manager as fm
        await fm.broadcast_sequence_error(
            seq.sequence_id, seq.node_id, seq.user_id, reason="cancelled"
        )
        raise
    except Exception as exc:
        logger.error(
            "Sequence %s failed on step %d: %s", seq.sequence_id, seq.current_step, exc
        )
        from app.ws.frontend_manager import frontend_manager as fm
        await fm.broadcast_sequence_error(
            seq.sequence_id, seq.node_id, seq.user_id, reason=str(exc)
        )
    finally:
        sequence_registry.remove(seq.node_id, seq.sequence_id)

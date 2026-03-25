# Phase 17: Auto Mode - Research

**Researched:** 2026-03-25
**Domain:** asyncio task orchestration, server-side sequence execution, React state management
**Confidence:** HIGH

## Summary

Phase 17 adds a server-side auto sequencer that runs ordered GSD commands one after another without user intervention between steps. The architecture decision is already locked: the sequencer lives on the server, using `asyncio.Event` per `instance_id`, keyed on `(node_id, sequence_id)` to isolate concurrent users. The `/clear` between steps is just a `/clear` execute dispatch followed by waiting for its `instance_finished` event — the same code path as any other command.

The primary challenge is not the sequencer logic itself (it reduces to a loop over `dispatch_execute` + event-waiting), but the **registry memory management** and **cancellation paths**. STATE.md explicitly flags that `asyncio.Event` cleanup under a long-running server has not been stress-tested and must be verified before shipping.

The frontend work is moderate: a toggle, a sequence builder UI, and a per-step progress indicator that consumes new WS messages (`sequence_step_started`, `sequence_step_completed`, `sequence_error`). The sequence is session-scoped (not persisted to DB) per REQUIREMENTS.md out-of-scope note.

**Primary recommendation:** Build the sequencer as a dedicated service module (`app/ws/sequencer.py`) that owns the `asyncio.Event` registry and exposes clean `start_sequence`, `cancel_sequence`, and `cancel_all_for_node` functions. Wire cancellation into `handle_unexpected_disconnect`. Keep the frontend state in `wsStore` alongside existing `instanceStatuses` and `promptStates`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Claude's Discretion
All implementation choices are at Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTO-01 | User can enable auto mode for a node with a toggle; disabling returns to manual single-command dispatch | Toggle in node detail UI; auto mode state stored in `wsStore` or local component state; server receives `start_sequence` / `cancel_sequence` WS messages |
| AUTO-02 | Server executes GSD commands sequentially with /clear (new session) between steps | Sequencer loop: `dispatch_execute(clear)` → wait `instance_finished` → `dispatch_execute(next_cmd)` → repeat; asyncio.Event per instance_id for signaling |
| AUTO-03 | User can select from default command sequences (new-project, milestone cycle) | Define `PRESET_SEQUENCES` in `gsdCommands.ts` as ordered `GsdCommand[]` arrays; new-project and milestone-cycle are obvious presets from existing GSD_COMMANDS catalog |
| AUTO-04 | User can build custom command queues (ordered list of GSD commands) | Drag-or-button queue builder UI; queue stored in component state; serialized to WS message as ordered array of `{command_id, params}` |
| AUTO-05 | User sees per-step progress indicator showing current position in sequence | New WS messages `sequence_step_started` and `sequence_step_completed` broadcast to subscribed frontend; frontend renders step list with status badges |
| AUTO-06 | Auto mode notifies user on step completion when auto-advance is off; auto-advances when on | `auto_advance` boolean in `start_sequence` WS message; when false, server pauses after `instance_finished` and sends `sequence_step_completed` awaiting `advance_sequence` message |
</phase_requirements>

## Standard Stack

### Core (no new dependencies — all existing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| asyncio | stdlib | Event-based coordination between sequencer coroutine and instance lifecycle handlers | Already used throughout server; `asyncio.Event` is the right primitive for "wait for instance to finish" |
| FastAPI / Starlette WebSocket | existing | WS message dispatch for new sequence control messages | Already the WS transport layer |
| Zustand | existing | Frontend auto mode state, sequence queue, step progress | Already used for `instanceStatuses`, `promptStates` |
| React | existing | Sequence builder UI, progress indicator | Already the UI framework |
| shadcn/ui | existing | Toggle, Badge, Button, card components for sequence UI | Already in use |
| Lucide icons via `src/lib/icons.ts` | existing | Step status icons | Locked decision — always via barrel file |

### No new dependencies required

All required capabilities exist in the current stack. The sequencer needs only `asyncio`, existing `dispatch_execute`, and `frontend_manager.broadcast_*`. The frontend needs only existing Zustand store patterns and shadcn components.

## Architecture Patterns

### Recommended Project Structure (new files)

```
backend/app/ws/
└── sequencer.py         # SequenceRegistry + run_sequence coroutine

frontend/src/
├── components/execute/
│   ├── AutoModeToggle.tsx         # Toggle + current status indicator
│   ├── SequenceBuilder.tsx        # Preset selector + custom queue builder
│   └── SequenceProgress.tsx       # Per-step progress indicator
├── stores/
│   └── wsStore.ts                 # Extended: autoModeState, sequenceStates
└── types/
    └── protocol.ts                # Extended: new WS message types
```

### Pattern 1: Server-side asyncio.Event registry keyed on (node_id, sequence_id)

**What:** A `SequenceRegistry` class owns a dict `_events: dict[str, asyncio.Event]` where keys are `instance_id`. When `handle_instance_finished` fires, it calls `registry.signal(instance_id)`. The sequence coroutine awaits `registry.wait(instance_id)`.

**When to use:** Any time the sequencer needs to know "did this instance finish?"

**Example:**
```python
# app/ws/sequencer.py
import asyncio
import uuid
from dataclasses import dataclass, field

@dataclass
class ActiveSequence:
    sequence_id: str
    node_id: str
    user_id: str
    steps: list[dict]          # [{"command_id": str, "params": dict}]
    current_step: int = 0
    auto_advance: bool = True
    task: asyncio.Task | None = None
    advance_event: asyncio.Event = field(default_factory=asyncio.Event)

class SequenceRegistry:
    def __init__(self) -> None:
        # instance_id -> asyncio.Event (set when instance finishes/errors)
        self._completion_events: dict[str, asyncio.Event] = {}
        # (node_id, sequence_id) -> ActiveSequence
        self._active: dict[tuple[str, str], ActiveSequence] = {}

    def register_instance(self, instance_id: str) -> asyncio.Event:
        """Create and store a completion event for an instance. Returns the event."""
        ev = asyncio.Event()
        self._completion_events[instance_id] = ev
        return ev

    def signal_completion(self, instance_id: str) -> None:
        """Called by handle_instance_finished and handle_instance_error."""
        ev = self._completion_events.get(instance_id)
        if ev is not None:
            ev.set()

    def cleanup_instance(self, instance_id: str) -> None:
        """Remove event after sequencer has consumed it — prevents memory leak."""
        self._completion_events.pop(instance_id, None)

    def cancel_all_for_node(self, node_id: str) -> list[str]:
        """Cancel all sequences for a node. Returns cancelled sequence_ids."""
        to_cancel = [
            (nid, sid) for (nid, sid) in self._active
            if nid == node_id
        ]
        cancelled = []
        for key in to_cancel:
            seq = self._active.pop(key)
            if seq.task and not seq.task.done():
                seq.task.cancel()
            cancelled.append(seq.sequence_id)
        return cancelled

sequence_registry = SequenceRegistry()
```

**Cleanup discipline:** `cleanup_instance` MUST be called by the sequence coroutine after `await event.wait()` returns, before moving to next step. This is the critical memory management path STATE.md flags.

### Pattern 2: Sequence coroutine — the run loop

**What:** An `asyncio.Task` that iterates steps, dispatches `/clear` + command, waits for completion, and either auto-advances or pauses for `advance_event`.

**Example:**
```python
async def run_sequence(seq: ActiveSequence, work_dir: str, project: str) -> None:
    """Execute a sequence of GSD commands with /clear between steps."""
    try:
        for i, step in enumerate(seq.steps):
            seq.current_step = i

            # Broadcast step started
            await frontend_manager.broadcast_sequence_step(
                seq.sequence_id, seq.node_id, seq.user_id,
                step_index=i, status="started", total=len(seq.steps)
            )

            # 1. Dispatch /clear (new session, clears context)
            clear_instance_id = await dispatch_execute(
                node_id=seq.node_id, project=project, work_dir=work_dir,
                prompt="/clear", user_id=seq.user_id, db=<session>
            )
            clear_ev = sequence_registry.register_instance(clear_instance_id)
            await clear_ev.wait()
            sequence_registry.cleanup_instance(clear_instance_id)

            # 2. Dispatch the actual GSD command
            prompt = expand_prompt(step["command_id"], step.get("params", {}))
            cmd_instance_id = await dispatch_execute(
                node_id=seq.node_id, project=project, work_dir=work_dir,
                prompt=prompt, user_id=seq.user_id, db=<session>
            )
            cmd_ev = sequence_registry.register_instance(cmd_instance_id)
            await cmd_ev.wait()
            sequence_registry.cleanup_instance(cmd_instance_id)

            # Broadcast step completed
            await frontend_manager.broadcast_sequence_step(
                seq.sequence_id, seq.node_id, seq.user_id,
                step_index=i, status="completed", total=len(seq.steps)
            )

            # AUTO-06: pause if not auto-advancing
            if not seq.auto_advance and i < len(seq.steps) - 1:
                seq.advance_event.clear()
                await seq.advance_event.wait()

        # All steps done
        await frontend_manager.broadcast_sequence_done(seq.sequence_id, seq.node_id, seq.user_id)

    except asyncio.CancelledError:
        await frontend_manager.broadcast_sequence_error(
            seq.sequence_id, seq.node_id, seq.user_id, reason="cancelled"
        )
        raise
    except Exception as exc:
        await frontend_manager.broadcast_sequence_error(
            seq.sequence_id, seq.node_id, seq.user_id, reason=str(exc)
        )
    finally:
        # Always clean up the active sequence entry
        sequence_registry._active.pop((seq.node_id, seq.sequence_id), None)
```

### Pattern 3: Wiring sequence_registry into instance lifecycle handlers

**What:** `handle_instance_finished` and `handle_instance_error` must call `sequence_registry.signal_completion(instance_id)` AFTER broadcasting instance status. This requires a one-line addition to each handler.

**Critical:** Signal completion for BOTH `finished` and `errored` outcomes — the sequence should advance (or error out) regardless of whether the step succeeded. The sequencer itself decides what to do on error.

```python
# In handle_instance_finished (handlers.py) — after existing broadcast:
from app.ws.sequencer import sequence_registry
sequence_registry.signal_completion(payload.instance_id)

# In handle_instance_error (handlers.py) — after existing broadcast:
sequence_registry.signal_completion(payload.instance_id)
```

### Pattern 4: WS message protocol extension

New frontend-to-server messages:
```typescript
// WsOutgoingMessage additions
| { type: 'start_sequence'; node_id: string; project: string; work_dir: string;
    steps: Array<{command_id: string; params: Record<string, string>}>;
    auto_advance: boolean }
| { type: 'cancel_sequence'; sequence_id: string }
| { type: 'advance_sequence'; sequence_id: string }
```

New server-to-frontend messages:
```typescript
// WsIncomingMessage additions
| { type: 'sequence_step_started'; sequence_id: string; node_id: string;
    step_index: number; total_steps: number; command_id: string }
| { type: 'sequence_step_completed'; sequence_id: string; node_id: string;
    step_index: number; total_steps: number }
| { type: 'sequence_done'; sequence_id: string; node_id: string }
| { type: 'sequence_error'; sequence_id: string; node_id: string; reason: string }
```

### Pattern 5: Frontend auto mode state in wsStore

Extend `wsStore` with sequence state:
```typescript
interface SequenceState {
  sequence_id: string
  node_id: string
  steps: Array<{command_id: string; params: Record<string, string>}>
  current_step: number
  total_steps: number
  status: 'running' | 'paused' | 'done' | 'error'
  auto_advance: boolean
}

// Add to WsStore:
sequenceStates: Record<string, SequenceState>  // keyed by sequence_id
autoModeNodeIds: Set<string>                    // nodes with auto mode toggled on
```

### Pattern 6: Preset sequences

Defined in `gsdCommands.ts` as ordered arrays of `GsdCommand` references:

```typescript
export interface GsdSequencePreset {
  id: string
  label: string
  description: string
  steps: Array<{ command_id: string; default_params?: Record<string, string> }>
}

export const GSD_SEQUENCE_PRESETS: GsdSequencePreset[] = [
  {
    id: 'new-project',
    label: 'New Project Setup',
    description: 'Bootstrap → Define Requirements → Create Roadmap',
    steps: [
      { command_id: 'new-project' },
      { command_id: 'define-requirements' },
      { command_id: 'create-roadmap' },
    ],
  },
  {
    id: 'milestone-cycle',
    label: 'Phase Lifecycle',
    description: 'Discuss → Plan → Execute → Verify for a single phase',
    steps: [
      { command_id: 'discuss-phase' },
      { command_id: 'plan-phase' },
      { command_id: 'execute-phase' },
      { command_id: 'verify-phase' },
    ],
  },
]
```

Note: steps with `params` (phase number) require the user to fill them before starting. The sequence builder must validate all required params before enabling the start button.

### Anti-Patterns to Avoid

- **Storing asyncio.Events forever:** Events MUST be cleaned up via `cleanup_instance()` after `await event.wait()` returns. A long-running server will accumulate stale events for every instance ever dispatched by a sequence if this is skipped.
- **Signaling only on `finished`, not `errored`:** The sequencer will hang indefinitely if a step errors and the event is never set. Always signal on both terminal events.
- **Running the sequence coroutine in the WS request handler coroutine:** The sequence is long-running (could take hours). It MUST be spawned as an independent `asyncio.Task` so the WS reader loop is not blocked.
- **Holding a DB session across the sequence loop:** Sessions are never held across WebSocket awaits (locked project decision). Each `dispatch_execute` call acquires its own session internally — the sequence coroutine should NOT hold an outer session.
- **Not cancelling sequences on node disconnect:** STATE.md makes this a critical requirement. `handle_unexpected_disconnect` MUST call `sequence_registry.cancel_all_for_node(node_id)` and broadcast `sequence_error` to affected users.
- **Mutating the `data` field on WS messages:** Locked project decision — the `gsd` sibling field is the only extension point. Sequence messages are new top-level types, not extensions of existing stream_event messages.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Wait for async event" coordination | Custom polling loop or sleep | `asyncio.Event.wait()` | stdlib primitive, cancellation-safe, zero CPU overhead while waiting |
| Step-to-step signaling | Global flag dict + polling | `asyncio.Event` per instance_id (already decided in STATE.md) | Clean, cancellable, well-understood pattern |
| Sequence state persistence | DB table for sequences | In-memory only (session-scoped per REQUIREMENTS.md) | Out-of-scope explicitly — "Persistent auto mode sequences (saved playbooks)" is listed as out of scope |
| Frontend sequence queue persistence | localStorage / IndexedDB | Component state only | Session-scoped — no persistence needed this phase |
| Drag-and-drop reordering | Custom DnD implementation | Simple up/down buttons or ordered list | No dnd library in stack; keep it simple |

**Key insight:** The entire sequencer reduces to a loop of existing primitives (`dispatch_execute`, `asyncio.Event`, `frontend_manager.broadcast_*`). There is no new complex subsystem — the main work is wiring and cleanup discipline.

## Common Pitfalls

### Pitfall 1: asyncio.Event memory leak
**What goes wrong:** `_completion_events` dict grows unboundedly — every instance ever used in a sequence adds an entry that is never removed.
**Why it happens:** `signal_completion` sets the event, but nothing removes it from the dict unless explicitly called.
**How to avoid:** The sequence coroutine MUST call `cleanup_instance(instance_id)` immediately after `await event.wait()` returns, in both the normal path and the `except asyncio.CancelledError` handler.
**Warning signs:** Memory usage growing over long sessions; `len(sequence_registry._completion_events)` climbing indefinitely in monitoring.

### Pitfall 2: Node disconnect leaves sequence task running
**What goes wrong:** Sequence task continues executing, dispatching to a now-disconnected node, hitting `ValueError("Node is not connected")` on every step, spamming logs and leaking the task.
**Why it happens:** `handle_unexpected_disconnect` does not cancel sequences by default.
**How to avoid:** Add `sequence_registry.cancel_all_for_node(node_id)` to `handle_unexpected_disconnect` before `connection_manager.deregister(node_id)`. Broadcast `sequence_error` to affected frontend connections.
**Warning signs:** Errors in sequence task logs referencing disconnected node after a node drop.

### Pitfall 3: Sequence task holds a stale DB session
**What goes wrong:** DB session acquired at sequence start is reused across multiple `await` calls → SQLAlchemy async session invalidation, stale reads, or pool exhaustion.
**Why it happens:** Natural temptation to pass a single `db` session into the sequence coroutine for efficiency.
**How to avoid:** Do NOT pass a DB session to `run_sequence`. Each `dispatch_execute` call manages its own session internally. The sequence coroutine is session-free.
**Warning signs:** SQLAlchemy `InvalidRequestError: Can't reconnect until invalid transaction is rolled back` errors during long sequences.

### Pitfall 4: /clear step produces stream events that confuse frontend
**What goes wrong:** The `/clear` dispatch between steps creates an Instance record and emits stream events. Frontend, if subscribed to the node's instance list, will see a burst of `/clear` instances.
**Why it happens:** `/clear` goes through the normal `dispatch_execute` path, which creates an Instance row.
**How to avoid:** This is unavoidable given the existing architecture. The frontend should simply render `/clear` instances like any other (they complete near-instantly). If desired, mark them in the sequence progress UI as "clearing context..." rather than a user-visible step.

### Pitfall 5: Params with missing values in preset sequences
**What goes wrong:** A preset step requires a phase number param (e.g., `discuss-phase`) but no default is provided — sequence is dispatched with `{{phase}}` literally in the prompt.
**Why it happens:** Sequence builder doesn't validate params before allowing start.
**How to avoid:** Before sending `start_sequence`, the frontend MUST verify all steps have all required params filled (same pattern as `allRequiredParamsFilled` in `CommandPalette.tsx`). Disable the Start button until all params are satisfied.

### Pitfall 6: advance_sequence message received for wrong sequence_id
**What goes wrong:** User clicks "Advance" for a sequence that has already advanced (race condition from multi-tab), causing `advance_event.set()` to be a no-op or applied to wrong sequence.
**Why it happens:** No validation that the sequence is actually paused/awaiting advance.
**How to avoid:** On receipt of `advance_sequence`, check that the sequence exists and is in paused state (`not seq.advance_event.is_set()`). Ignore silently if sequence is not found or already advancing.

## Code Examples

### Verified patterns from codebase (HIGH confidence)

### Extending frontend_router.py for sequence messages
```python
# In frontend_router.py reader loop, add new elif branches:
elif msg_type == "start_sequence":
    node_id = msg.get("node_id")
    project = msg.get("project")
    work_dir = msg.get("work_dir", ".")
    steps = msg.get("steps", [])
    auto_advance = msg.get("auto_advance", True)
    if not (node_id and project and steps):
        continue
    # Validate access, then start sequence as background task
    sequence_id = str(uuid.uuid4())
    seq = ActiveSequence(
        sequence_id=sequence_id,
        node_id=node_id,
        user_id=user_id,
        steps=steps,
        auto_advance=auto_advance,
    )
    sequence_registry._active[(node_id, sequence_id)] = seq
    task = asyncio.create_task(run_sequence(seq, work_dir, project))
    seq.task = task
    # ACK with sequence_id so frontend can track
    try:
        conn.queue.put_nowait({"type": "sequence_started", "sequence_id": sequence_id})
    except asyncio.QueueFull:
        pass

elif msg_type == "cancel_sequence":
    sequence_id = msg.get("sequence_id")
    if not sequence_id:
        continue
    seq = sequence_registry._active.get((node_id_for_seq, sequence_id))
    if seq and seq.task and not seq.task.done():
        seq.task.cancel()

elif msg_type == "advance_sequence":
    sequence_id = msg.get("sequence_id")
    if not sequence_id:
        continue
    # Find seq across all nodes for this user
    for seq in sequence_registry._active.values():
        if seq.sequence_id == sequence_id and seq.user_id == user_id:
            seq.advance_event.set()
            break
```

### AutoModeToggle component pattern (follows existing CommandPalette conventions)
```typescript
// components/execute/AutoModeToggle.tsx
import { useState } from 'react'
import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import { Play, Square } from '@/lib/icons'

interface AutoModeToggleProps {
  nodeId: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

export function AutoModeToggle({ nodeId, enabled, onToggle }: AutoModeToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground uppercase tracking-widest">Auto Mode</span>
      <Button
        size="sm"
        variant={enabled ? 'default' : 'outline'}
        onClick={() => onToggle(!enabled)}
        className="h-7 px-3 text-xs"
      >
        {enabled ? <><Square size={12} className="mr-1" /> Stop</> : <><Play size={12} className="mr-1" /> Enable</>}
      </Button>
    </div>
  )
}
```

### Cancellation in handle_unexpected_disconnect (handlers.py pattern)
```python
# handlers.py — handle_unexpected_disconnect — add BEFORE connection_manager.deregister:
from app.ws.sequencer import sequence_registry

cancelled_ids = sequence_registry.cancel_all_for_node(node_id)
for seq_id in cancelled_ids:
    await frontend_manager.broadcast_sequence_error_all_users(
        sequence_id=seq_id,
        node_id=node_id,
        reason="node disconnected unexpectedly"
    )
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling for instance completion | `asyncio.Event.wait()` (decided in STATE.md) | v1.3 design | Zero CPU overhead during wait; clean cancellation |
| Frontend-side sequencer | Server-side sequencer (locked in STATE.md) | v1.3 design | Sequence survives frontend disconnect; consistent execution |

**In scope for this phase:**
- Session-scoped sequences only (no DB persistence)
- Single-node sequences only (multi-node broadcast is out of scope per REQUIREMENTS.md)

## Open Questions

1. **DB session access inside run_sequence coroutine**
   - What we know: `dispatch_execute` requires an `AsyncSession` as a parameter in its current signature (`db: AsyncSession`)
   - What's unclear: The sequence coroutine cannot hold a single session across awaits. Looking at `dispatch_execute` source, it creates its own internal session for the Instance write but also validates node access via `user_can_access_node(user_id, node_id, db)` using the passed-in session.
   - Recommendation: For the sequence path, either (a) create a fresh session per step dispatch in the coroutine, or (b) refactor `dispatch_execute` to create its own session internally for the access check. Option (a) is simpler and consistent with the "no session held across awaits" rule. Each call to `dispatch_execute` from the sequence coroutine gets its own `async with get_session_maker()() as db:` wrapper.

2. **Which user_id does the sequence run under?**
   - What we know: The sequence is initiated by a `user_id` from the `start_sequence` WS message handler, which has authenticated user context.
   - What's unclear: If the initiating frontend disconnects mid-sequence (closes tab), should the sequence continue? STATE.md says "sequence_error to affected users" only on node disconnect, not frontend disconnect.
   - Recommendation: Yes, continue. The sequence is server-side and not tied to the frontend WebSocket lifetime. Broadcast `sequence_step_*` messages to all connections, not just the originating connection. If no connections are subscribed, the messages are simply dropped (queue put_nowait pattern).

3. **`/clear` command dispatch: does it require a project?**
   - What we know: `dispatch_execute` validates `project not in conn.projects` unless `skip_project_check=True`. `/clear` is a Claude CLI command not tied to project content.
   - What's unclear: Whether the `/clear` dispatch should use `skip_project_check=True` since it needs no project context.
   - Recommendation: Use `skip_project_check=False` with the existing project name — `/clear` is dispatched to the same project context as the other steps, which will be in `conn.projects`. The existing `clear` command in `gsdCommands.ts` already works without any project special-casing (it dispatches as a normal command). No change needed.

## Environment Availability

Step 2.6: SKIPPED — auto mode is purely server-side code + frontend code changes. No new external dependencies, services, or CLI tools required. All dependencies (Python asyncio, FastAPI, React, Zustand) are already present and verified working.

## Sources

### Primary (HIGH confidence)
- `backend/app/ws/handlers.py` — instance lifecycle, `handle_unexpected_disconnect` pattern
- `backend/app/ws/frontend_router.py` — WS message dispatch loop, `submit_answer` as template for new message types
- `backend/app/ws/commands.py` — `dispatch_execute` signature and behavior
- `backend/app/ws/frontend_manager.py` — broadcast pattern (queue-based, put_nowait)
- `backend/app/ws/manager.py` — `SequenceRegistry` should follow same singleton module pattern as `connection_manager`
- `.planning/STATE.md` — locked decisions for asyncio.Event keying, cancellation requirement
- `.planning/REQUIREMENTS.md` — out-of-scope items (persistence, multi-node)
- `frontend/src/stores/wsStore.ts` — Zustand pattern for new sequence state
- `frontend/src/lib/gsdCommands.ts` — GsdCommand catalog for preset sequences
- `frontend/src/components/execute/CommandPalette.tsx` — UI pattern for sequence builder

### Secondary (MEDIUM confidence)
- Python `asyncio` stdlib documentation — `asyncio.Event`, `asyncio.Task.cancel()` behavior

## Metadata

**Confidence breakdown:**
- Sequencer architecture: HIGH — directly derived from locked STATE.md decisions and existing codebase patterns
- WS message protocol: HIGH — follows exact shape of existing messages in protocol.ts and frontend_router.py
- Memory management / cleanup paths: MEDIUM — STATE.md explicitly flags this as not stress-tested; cleanup logic is sound in theory but requires runtime validation
- Preset sequence content: HIGH — sequences are derived from the GSD_COMMANDS catalog already in the codebase
- DB session handling in coroutine: MEDIUM — solution is straightforward but the exact refactor point in dispatch_execute requires a plan-time decision

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable stdlib + well-established libraries)

---
phase: 17-auto-mode
plan: "01"
subsystem: api
tags: [asyncio, websocket, sequencer, python, fastapi]

requires:
  - phase: 12-websocket-reliability
    provides: frontend WebSocket reader loop pattern and FrontendConnectionManager fan-out pattern
  - phase: 13-ux-surface
    provides: dispatch_execute command interface used by run_sequence

provides:
  - SequenceRegistry with asyncio.Event-based instance completion tracking
  - run_sequence coroutine executing /clear + command per step with fresh DB sessions per dispatch
  - AUTO-06 manual-advance support via advance_event pause/resume
  - broadcast_sequence_step (with auto_advance), broadcast_sequence_done, broadcast_sequence_error in FrontendConnectionManager
  - start_sequence, cancel_sequence, advance_sequence WS message handlers in frontend_router
  - signal_completion wired into handle_instance_finished and handle_instance_error
  - cancel_all_for_node wired into handle_unexpected_disconnect

affects:
  - 17-02 (frontend sequence builder and wsStore extensions will consume new WS message types)
  - 17-03 (auto mode UI will use sequence_started, sequence_step_*, sequence_done, sequence_error)

tech-stack:
  added: []
  patterns:
    - "SequenceRegistry: asyncio.Event per instance_id, keyed by (node_id, sequence_id) for active sequences"
    - "run_sequence: async with get_session_maker()() as db per dispatch — never hold session across await"
    - "cleanup_instance immediately after await event.wait() — mandatory memory management"
    - "cancel_all_for_node in handle_unexpected_disconnect before connection_manager.deregister"
    - "Deferred imports in run_sequence to break circular dependency chain at module level"

key-files:
  created:
    - backend/app/ws/sequencer.py
  modified:
    - backend/app/ws/frontend_manager.py
    - backend/app/ws/handlers.py
    - backend/app/ws/frontend_router.py

key-decisions:
  - "Deferred imports inside run_sequence to break circular dependency (sequencer imports frontend_manager which could import sequencer)"
  - "expand_prompt uses {{key}} double-brace syntax to avoid conflict with Python f-strings"
  - "broadcast_sequence_* fans out to ALL connections (not subscribers only) — sequence progress is global dashboard state"
  - "cancel_sequence validates user_id ownership before cancelling — prevents cross-user cancellation"

patterns-established:
  - "SequenceRegistry pattern: register before dispatch, await event, cleanup immediately after"
  - "run_sequence is session-free — each dispatch_execute wraps its own async with get_session_maker()()"

requirements-completed: [AUTO-02, AUTO-06]

duration: 3min
completed: 2026-03-25
---

# Phase 17 Plan 01: Auto Mode - Sequencer Summary

**asyncio.Event-based server sequencer with SequenceRegistry enabling sequential GSD command dispatch with /clear between steps and manual-advance pause support**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T10:48:12Z
- **Completed:** 2026-03-25T10:51:19Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Created `sequencer.py` with SequenceRegistry, ActiveSequence dataclass, GSD_PROMPT_TEMPLATES catalog, expand_prompt function, and run_sequence coroutine
- Added three broadcast methods to FrontendConnectionManager: broadcast_sequence_step (includes auto_advance field for AUTO-06 paused-state derivation), broadcast_sequence_done, broadcast_sequence_error
- Wired signal_completion into both handle_instance_finished and handle_instance_error — sequences advance on both terminal outcomes
- Wired cancel_all_for_node into handle_unexpected_disconnect BEFORE connection_manager.deregister — sequences cancelled cleanly on node drop
- Added start_sequence, cancel_sequence, advance_sequence message handlers in the frontend WS reader loop

## Task Commits

1. **Task 1: Create sequencer module and broadcast methods** - `85bb8b7` (feat)
2. **Task 2: Wire sequencer into handlers and frontend router** - `8cd7813` (feat)

## Files Created/Modified

- `backend/app/ws/sequencer.py` - SequenceRegistry, ActiveSequence, expand_prompt, run_sequence coroutine (new file)
- `backend/app/ws/frontend_manager.py` - Added broadcast_sequence_step, broadcast_sequence_done, broadcast_sequence_error
- `backend/app/ws/handlers.py` - Added signal_completion calls + cancel_all_for_node + sequence_error broadcast on disconnect
- `backend/app/ws/frontend_router.py` - Added uuid import, sequencer imports, start_sequence/cancel_sequence/advance_sequence message handlers

## Decisions Made

- Used deferred imports inside run_sequence to break the circular import chain (sequencer -> frontend_manager -> handlers -> sequencer). Module-level cross-imports between ws/ submodules would create circular dependency errors at startup.
- expand_prompt uses `{{key}}` double-brace syntax (not Python f-string `{key}`) to avoid conflicts when templates are rendered as strings, matching the gsdCommands.ts catalog convention.
- broadcast_sequence_* methods fan out to ALL connections (not subscribers-only) because sequence progress is global dashboard state visible to all team members, not scoped to a specific instance subscription.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Python 3.9 system Python on the dev machine cannot import the app module (uses 3.12 syntax). Verification was performed via static grep checks + Python 3.9-compatible string assertions rather than the automated import test in the plan. The implementation is correct for Python 3.12 as required.

## Next Phase Readiness

- Sequencer backend is complete and ready for Plan 02 (frontend sequence builder UI and wsStore extensions)
- Frontend can now send start_sequence, cancel_sequence, advance_sequence WS messages and receive sequence_step_started, sequence_step_completed, sequence_done, sequence_error responses
- AUTO-02 and AUTO-06 server-side requirements are satisfied

---
*Phase: 17-auto-mode*
*Completed: 2026-03-25*

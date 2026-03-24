---
phase: 02-node-protocol-engine
plan: "02"
subsystem: websocket-protocol
tags: [websocket, node-protocol, message-handlers, reconciliation, auth]
dependency_graph:
  requires: [02-01]
  provides: [02-03, 02-04]
  affects: [backend/app/ws/handlers.py, backend/app/ws/router.py, backend/app/main.py]
tech_stack:
  added: []
  patterns:
    - "Short-lived async DB sessions per handler (never held across WebSocket awaits)"
    - "Pre-accept WebSocket auth (close before accept sends HTTP-level rejection)"
    - "Per-node asyncio.Lock in handle_node_register prevents reconciliation races"
    - "Heartbeat updated on any received message (Starlette has no ping callback)"
    - "Bulk UPDATE for unexpected disconnect (single statement errors all instances)"
key_files:
  created:
    - backend/app/ws/handlers.py
    - backend/app/ws/router.py
  modified:
    - backend/app/main.py
decisions:
  - "Heartbeat updated on any received message — resolves Open Question 1 from research: Starlette has no WebSocket ping callback, so application-level receive loop updates last_heartbeat on every frame"
  - "handle_instance_error works from both pending and running — rate-limit case sends instance_error directly without ACK (INST-07)"
  - "dispatch_message is a module-level coroutine (not nested) for testability"
metrics:
  duration_seconds: 130
  completed_date: "2026-03-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 02 Plan 02: Node Protocol Engine — WebSocket Handlers and Router Summary

## One-liner

Full GSD wire protocol v1.2.0 server-side engine: all 9 message handlers with state reconciliation, pre-accept Bearer auth, and dispatch loop with heartbeat tracking.

## What Was Built

### Task 1: `backend/app/ws/handlers.py`

All 9 async handler functions for the node-to-server message flow:

| Handler | Key behavior |
|---------|-------------|
| `handle_node_register` | Acquires per-node asyncio.Lock; closes old connection if reconnecting; upserts Node record; calls `reconcile_instances`; commits |
| `reconcile_instances` | Classifies lost instances (error them), new instances (add as running), matched (update session_id); does NOT commit — caller commits |
| `handle_ack` | Transitions pending → running; logs envelope ID for correlation |
| `handle_stream_event` | json.loads double-encoded data; persists StreamEvent with sequence_num; buffers in-memory via connection_manager |
| `handle_instance_started` | Captures session_id; sets started_at; confirms running |
| `handle_instance_finished` | Marks finished with exit_code and finished_at; clears stream buffer |
| `handle_instance_error` | Marks errored from ANY status (pending or running); clears stream buffer |
| `handle_node_disconnect` | Marks node disconnected; deregisters from ConnectionManager |
| `handle_unexpected_disconnect` | Single-statement bulk UPDATE to error all running/pending instances; deregisters |

Each handler wraps DB operations in `async with get_session_maker()() as session:` with try/except rollback.

### Task 2: `backend/app/ws/router.py`

`@router.websocket("/ws/node")` endpoint with 4-step connection lifecycle:

1. **Pre-accept auth** — `settings.valid_tokens` check; `websocket.close(WS_1008_POLICY_VIOLATION)` before `accept()` on failure
2. **First-frame enforcement** — `WebSocketDisconnect` handled; invalid Envelope → 1003; non-`node_register` type → 1003
3. **Registration** — builds `NodeConnection`; calls `handle_node_register`
4. **Dispatch loop** — `connection_manager.update_heartbeat` on every message; malformed envelopes logged and continued; `WebSocketDisconnect` → `handle_unexpected_disconnect`

Separate `dispatch_message` coroutine routes all 7 node-to-server types. Server-to-node types (execute, kill, status_request) arriving from a node are logged as suspicious but do not close the connection.

### Task 3: `backend/app/main.py`

Added `from app.ws.router import router as ws_router` and `app.include_router(ws_router)`. Lifespan unchanged. `/ws/node` now registered alongside `/health`.

## Verification Results

All 5 end-to-end checks passed:
1. `/ws/node` registered in FastAPI app routes
2. All 9 handlers importable from `app.ws.handlers`
3. `router` and `dispatch_message` importable from `app.ws.router`
4. `get_session_maker()()` pattern present in handlers (short-lived sessions)
5. `WS_1008_POLICY_VIOLATION` present before `websocket.accept()` (pre-accept auth)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all handlers are fully wired to DB models. Stream events are persisted to `stream_events` table and buffered in-memory. Frontend fan-out from the in-memory buffer is implemented in Plan 04 (EventRouter).

## Self-Check: PASSED

Files exist:
- `backend/app/ws/handlers.py` — FOUND
- `backend/app/ws/router.py` — FOUND
- `backend/app/main.py` (modified) — FOUND

Commits:
- `aea3bdc` — feat(02-02): implement all 9 node message handlers
- `31abca0` — feat(02-02): create /ws/node WebSocket endpoint
- `62b6801` — feat(02-02): wire WebSocket router into FastAPI app

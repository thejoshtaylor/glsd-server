---
phase: 04-dashboard-and-streaming
plan: 01
subsystem: backend-streaming
tags: [websocket, fan-out, asyncio, rest-api, streaming]
dependency_graph:
  requires: [03-auth-and-teams]
  provides: [frontend-ws-manager, node-rest-api, stream-fan-out]
  affects: [frontend-plans]
tech_stack:
  added: []
  patterns:
    - asyncio.Queue per-connection fan-out (maxsize=500 backpressure)
    - writer coroutine pattern with asyncio.create_task
    - put_nowait() with QueueFull exception handling for backpressure
key_files:
  created:
    - backend/app/ws/frontend_manager.py
    - backend/app/schemas/nodes.py
    - backend/app/routers/nodes.py
  modified:
    - backend/app/ws/frontend_router.py
    - backend/app/ws/handlers.py
    - backend/app/ws/health.py
    - backend/app/services/node_service.py
    - backend/app/main.py
decisions:
  - "FrontendConnectionManager uses asyncio.Queue(maxsize=500) per connection for backpressure protection"
  - "Writer coroutine drains queue independently so reader loop is never blocked by slow WebSocket sends"
  - "put_nowait() with QueueFull catch used in all fan-out methods — slow consumers drop events, not hang server"
  - "user_can_access_instance joins through Instance->Node->NodeTeam->TeamMember for team-scoped access"
  - "nodes router uses /api prefix consistent with auth and teams routers"
metrics:
  duration: "3m 26s"
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_created: 3
  files_modified: 5
---

# Phase 4 Plan 1: Backend Streaming Infrastructure and REST API Summary

**One-liner:** Per-connection asyncio.Queue fan-out (maxsize=500) with writer coroutine pattern, subscription-based stream forwarding, and team-scoped REST endpoints for nodes/instances/execute/kill.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | FrontendConnectionManager + upgraded frontend_router.py | 6db6148 | frontend_manager.py, frontend_router.py, node_service.py |
| 2 | Handler integration + stale push + REST endpoints | 7e04014 | handlers.py, health.py, schemas/nodes.py, routers/nodes.py, main.py |

## What Was Built

### FrontendConnectionManager (frontend_manager.py)

- `FrontendConnection` dataclass with `user_id`, `websocket`, `queue` (asyncio.Queue maxsize=500), `subscriptions` (set[str])
- `FrontendConnectionManager` with user_id -> list[FrontendConnection] registry (supports multiple tabs per user)
- `register` / `deregister` — lifecycle management with empty-list cleanup
- `subscribe` / `unsubscribe` — per-connection instance_id subscription tracking
- `fan_out_stream_event` — enqueues to all subscribed connections using put_nowait() + QueueFull handling
- `broadcast_node_status` — targeted (team_user_ids set) or global broadcast
- `broadcast_new_node_alert` — global broadcast for new unassigned nodes
- `broadcast_instance_status` — enqueues to connections subscribed to that instance

### Upgraded Frontend Router (frontend_router.py)

- Preserves existing ticket auth (atomic UPDATE...WHERE before accept)
- Creates FrontendConnection and registers with frontend_manager
- Dedicated writer coroutine: `asyncio.create_task(writer())` drains queue, sends JSON
- Reader loop handles `subscribe` (with team access validation + buffered event replay) and `unsubscribe` message types
- Cleanup in finally: writer_task.cancel() + frontend_manager.deregister(conn)

### Handler Integration (handlers.py)

- `handle_stream_event`: fan_out_stream_event after append_stream_event
- `handle_node_register`: broadcast_new_node_alert (new nodes only) + broadcast_node_status("connected")
- `handle_ack`: broadcast_instance_status("running")
- `handle_instance_finished`: broadcast_instance_status("finished")
- `handle_instance_error`: broadcast_instance_status("errored")
- `handle_node_disconnect`: broadcast_node_status("disconnected")
- `handle_unexpected_disconnect`: broadcast_node_status("disconnected")

### Stale Node Push (health.py)

- `_mark_node_stale`: broadcast_node_status("stale") after DB commit, before WebSocket close

### REST Endpoints (routers/nodes.py + schemas/nodes.py)

- `GET /api/nodes` — team-scoped node list
- `GET /api/nodes/{node_id}` — single node with 404 on no access
- `GET /api/instances` — team-scoped instance list with optional node_id filter
- `GET /api/instances/{instance_id}` — single instance with team access check
- `GET /api/instances/{instance_id}/stream` — persisted stream events ordered by sequence_num
- `POST /api/execute` — dispatch execute with PermissionError->403, ValueError->400
- `POST /api/instances/{instance_id}/kill` — dispatch kill with same error mapping
- All endpoints use `CurrentUser` + `DbSession` dependencies

### Added to node_service.py

- `user_can_access_instance(user_id, instance_id, db)` — joins Instance->Node->NodeTeam->TeamMember with limit(1)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all fan-out and REST endpoints are fully wired with real data sources.

## Self-Check: PASSED

Files created:
- FOUND: backend/app/ws/frontend_manager.py
- FOUND: backend/app/schemas/nodes.py
- FOUND: backend/app/routers/nodes.py

Commits:
- FOUND: 6db6148
- FOUND: 7e04014

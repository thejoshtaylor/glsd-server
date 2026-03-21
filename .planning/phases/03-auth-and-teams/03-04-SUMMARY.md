---
phase: 03-auth-and-teams
plan: "04"
subsystem: backend
tags: [multi-tenancy, authorization, websocket, node-service, team-scoped-queries]
dependency_graph:
  requires: ["03-02", "03-03"]
  provides: ["AUTH-05", "TEAM-05", "TEAM-06"]
  affects: [backend/app/ws/commands.py, backend/app/routers/health.py, backend/app/main.py]
tech_stack:
  added: []
  patterns:
    - "Team-scoped SQLAlchemy joins: Node -> NodeTeam -> TeamMember with .distinct() + .scalars().unique()"
    - "user_can_access_node guard pattern before command dispatch"
    - "Single-use WS ticket atomically consumed before websocket.accept() to prevent replay"
key_files:
  created:
    - backend/app/services/node_service.py
    - backend/app/ws/frontend_router.py
  modified:
    - backend/app/ws/commands.py
    - backend/app/routers/health.py
    - backend/app/main.py
decisions:
  - "user_can_access_node uses limit(1) on TeamMember join — existence check only, no row fetch"
  - "dispatch_kill received user_id + db as positional params (not keyword-only) for call-site clarity"
  - "handlers.py required no changes — node registration never set team_id on Node model (confirmed clean)"
  - "frontend_router.py uses get_session_maker() directly (not FastAPI Depends) because WS endpoints cannot use the standard dependency injection for pre-accept validation"
metrics:
  duration_minutes: 4
  completed_date: "2026-03-21"
  tasks_completed: 2
  files_changed: 5
---

# Phase 3 Plan 4: Multi-Tenancy Enforcement Summary

Multi-tenancy enforcement across all endpoints: team-scoped node queries, command dispatch ownership checks, health endpoint auth, and frontend WebSocket ticket validation.

## What Was Built

### Task 1: Node Service and Command Dispatch Team Ownership

Created `backend/app/services/node_service.py` with four team-scoped query functions:

- `list_nodes_for_user(user_id, db)` — joins Node -> NodeTeam -> TeamMember, returns nodes visible to user
- `user_can_access_node(user_id, node_id, db)` — limit(1) existence check for permission gate
- `get_node_for_user(user_id, node_id, db)` — single node fetch with team scope
- `list_instances_for_user(user_id, db)` — instances visible through node -> team membership chain

All join queries use `.distinct()` in the SELECT and `.scalars().unique()` on results to handle users belonging to multiple teams that share the same node.

Updated `backend/app/ws/commands.py`:
- `dispatch_execute` now requires `user_id: str` and `db: AsyncSession`
- `dispatch_kill` now requires `user_id: str` and `db: AsyncSession`
- Both functions call `user_can_access_node()` as the first guard, raising `PermissionError` on denial

Confirmed `backend/app/ws/handlers.py` was already clean — no `node.team_id` references existed (the column was removed in Plan 01).

### Task 2: Health Auth, Frontend WebSocket, and Router Wiring

Updated `backend/app/routers/health.py` to require `current_user: CurrentUser` — no unprotected REST endpoints remain.

Created `backend/app/ws/frontend_router.py`:
- `/ws/frontend?ticket=<uuid>` endpoint
- Validates single-use ticket via `validate_ws_ticket()` BEFORE `websocket.accept()`
- Commits ticket consumption atomically before accepting connection
- Rejects invalid/expired/used tickets with close code 1008 (Policy Violation)
- Phase 4 streaming loop placeholder with ack response

Updated `backend/app/main.py` to include `frontend_ws_router`. Final router set:
1. `health.router` — GET /health (now requires auth)
2. `auth.router` — /api/auth/* routes
3. `teams.router` — /api/teams/* routes
4. `ws_router` — /ws/node (node connections)
5. `frontend_ws_router` — /ws/frontend (browser connections)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 63d9e33 | feat(03-04): create node service and add team ownership to command dispatch |
| 2    | ddbfa21 | feat(03-04): add auth to health endpoint, create frontend WS endpoint, wire all routers |

## Known Stubs

`backend/app/ws/frontend_router.py` — The WebSocket message loop sends `{"type": "ack"}` for all received messages. This is an intentional Phase 4 placeholder; real subscription and event fan-out will be implemented in Phase 4 (EventRouter integration). The stub does not prevent the plan's goal (ticket auth enforcement) from being achieved.

## Self-Check: PASSED

- `backend/app/services/node_service.py` — FOUND
- `backend/app/ws/frontend_router.py` — FOUND
- `backend/app/ws/commands.py` — FOUND (user_id + db params verified)
- `backend/app/routers/health.py` — FOUND (current_user param verified)
- `backend/app/main.py` — FOUND (/ws/frontend route verified in routes list)
- Commit 63d9e33 — FOUND
- Commit ddbfa21 — FOUND

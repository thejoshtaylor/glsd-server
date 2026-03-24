---
phase: 03-auth-and-teams
verified: 2026-03-21T00:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 3: Auth and Teams Verification Report

**Phase Goal:** Users can register, log in, and manage teams — and every node, instance, and command is scoped to the authenticated user's team membership with no cross-team data leakage
**Verified:** 2026-03-21
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New user can register; personal team auto-created; JWT tokens returned | VERIFIED | `auth_service.register_user` creates User + Team + TeamMember in single `db.flush()` before issuing tokens |
| 2 | Expired access token can be refreshed; unauthenticated requests receive 401 | VERIFIED | `refresh_access_token` validates refresh token and returns new access token; `get_current_user` raises 401 on invalid/missing token |
| 3 | User can create team, invite member, assign node; invited user sees node; uninvited cannot | VERIFIED | `team_service.add_member`, `assign_node_to_team`, `list_nodes_for_user` all enforce membership via joins |
| 4 | Execute and kill commands rejected if user's team does not own target node | VERIFIED | `dispatch_execute` and `dispatch_kill` both call `user_can_access_node()` as first guard; raise `PermissionError` on denial |
| 5 | Frontend WebSocket authenticates via single-use ticket as query param | VERIFIED | `frontend_router.py` calls `validate_ws_ticket()` via atomic UPDATE…RETURNING BEFORE `websocket.accept()`; rejects with close code 1008 on failure |
| 6 | RefreshToken, WsTicket, NodeTeam models exist and are importable | VERIFIED | All three files exist with correct `__tablename__`, columns, FKs, and are exported from `models/__init__.py` |
| 7 | Alembic migration 0003 creates refresh_tokens, ws_tickets, node_teams and drops nodes.team_id | VERIFIED | Migration creates all three tables, migrates data via INSERT SELECT, drops FK constraint then column; downgrade reverses cleanly |
| 8 | get_current_user dependency decodes JWT access tokens and rejects invalid/expired tokens with 401 | VERIFIED | Uses `jwt.decode` with `algorithms=[...]` (list), catches `InvalidTokenError` (base class), validates `token_type == "access"` claim |
| 9 | Node model has no team_id column | VERIFIED | `node.py` has no `team_id` column or `ForeignKey("teams.team_id")`; `ForeignKey` import removed; `Optional` retained for `projects` field |
| 10 | Users can only see nodes belonging to their teams | VERIFIED | `node_service.list_nodes_for_user` joins Node → NodeTeam → TeamMember filtered by `user_id`; uses `.distinct()` + `.scalars().unique()` |
| 11 | Health endpoint requires authentication | VERIFIED | `health.py` has `current_user: CurrentUser` in `health_check` signature; no unprotected REST endpoints remain |
| 12 | Node registration handler does not reference removed team_id column | VERIFIED | `handlers.py` has zero references to `node.team_id` or `team_id =` assignment on Node objects |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/app/models/refresh_token.py` | VERIFIED | `class RefreshToken(Base)` with `__tablename__ = "refresh_tokens"`, columns: token_id, user_id (FK+index), token_hash, expires_at, revoked, created_at |
| `backend/app/models/ws_ticket.py` | VERIFIED | `class WsTicket(Base)` with `__tablename__ = "ws_tickets"`, columns: ticket_id, user_id (FK+index), expires_at, used, created_at |
| `backend/app/models/node_team.py` | VERIFIED | `class NodeTeam(Base)` with `__tablename__ = "node_teams"`, composite PK on (node_id, team_id), assigned_at |
| `backend/app/models/__init__.py` | VERIFIED | Exports NodeTeam, RefreshToken, WsTicket alongside all existing models; `__all__` updated |
| `backend/app/config.py` | VERIFIED | `jwt_refresh_token_expire_days: int = 7` present after `jwt_access_token_expire_minutes` |
| `backend/app/dependencies.py` | VERIFIED | `oauth2_scheme`, `get_current_user`, `CurrentUser` all defined; uses `algorithms=[settings.jwt_algorithm]` (list), `InvalidTokenError`, `token_type != "access"` check, `db.get(User, user_id)` lookup |
| `backend/app/schemas/auth.py` | VERIFIED | `RegisterRequest` (with field_validator for email), `TokenResponse`, `RefreshRequest`, `WsTicketResponse` |
| `backend/app/schemas/teams.py` | VERIFIED | `TeamCreate`, `TeamResponse` (from_attributes=True), `MemberAdd`, `MemberResponse`, `NodeAssign`, `NodeTeamResponse` (from_attributes=True) |
| `backend/alembic/versions/0003_auth_teams.py` | VERIFIED | Creates refresh_tokens, ws_tickets, node_teams; data migration INSERT SELECT; drops nodes_team_id_fkey then nodes.team_id; no `enum.create()` calls |
| `backend/app/services/auth_service.py` | VERIFIED | `register_user`, `authenticate_user`, `store_refresh_token`, `refresh_access_token` (with DB check), `revoke_refresh_token`, `create_ws_ticket`, `validate_ws_ticket` (atomic UPDATE…RETURNING); pwdlib PasswordHash; SHA-256 token hashing |
| `backend/app/routers/auth.py` | VERIFIED | 6 endpoints: register (201), login (OAuth2PasswordRequestForm), refresh, logout (CurrentUser), ws-ticket (CurrentUser), me (CurrentUser); wired to auth_service |
| `backend/app/services/team_service.py` | VERIFIED | `create_team`, `list_user_teams`, `get_team`, `_verify_owner`, `_verify_member`, `add_member`, `list_team_members`, `assign_node_to_team`, `list_team_nodes`, `remove_member` (last-owner guard); uses NodeTeam |
| `backend/app/routers/teams.py` | VERIFIED | 8 endpoints covering team CRUD + member + node management; all require CurrentUser; `NodeResponse` inline class |
| `backend/app/services/node_service.py` | VERIFIED | `list_nodes_for_user`, `user_can_access_node` (limit(1)), `get_node_for_user`, `list_instances_for_user`; all join through NodeTeam+TeamMember; use `.distinct()` + `.scalars().unique()` |
| `backend/app/ws/commands.py` | VERIFIED | `dispatch_execute` and `dispatch_kill` both have `user_id: str` and `db: AsyncSession` params; call `user_can_access_node()` first; raise `PermissionError` on denial |
| `backend/app/ws/frontend_router.py` | VERIFIED | `@router.websocket("/ws/frontend")`; `validate_ws_ticket()` called BEFORE `websocket.accept()`; session committed atomically; `websocket.close(code=1008)` on invalid ticket |
| `backend/app/routers/health.py` | VERIFIED | `current_user: CurrentUser` param in `health_check`; imports `CurrentUser` from `app.dependencies` |
| `backend/app/main.py` | VERIFIED | All 5 routers included: health.router, auth.router, teams.router, ws_router, frontend_ws_router |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dependencies.py` | `config.py` | `jwt.decode(..., settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])` | WIRED | Exact pattern present in `get_current_user` |
| `dependencies.py` | `models/user.py` | `db.get(User, user_id)` | WIRED | Pattern present in `get_current_user` |
| `routers/auth.py` | `services/auth_service.py` | `auth_service.*` calls | WIRED | All 6 endpoints delegate to `auth_service.*`; import confirmed |
| `auth_service.py` | `models/refresh_token.py` | `RefreshToken(...)` DB writes and reads | WIRED | `store_refresh_token` creates RefreshToken records; `refresh_access_token` queries them |
| `main.py` | `routers/auth.py` | `app.include_router(auth.router)` | WIRED | Explicit in `main.py` line 31 |
| `routers/teams.py` | `services/team_service.py` | `team_service.*` calls | WIRED | All 8 endpoints delegate to `team_service.*` |
| `team_service.py` | `models/node_team.py` | `NodeTeam(...)` creation + queries | WIRED | `assign_node_to_team` creates NodeTeam; `list_team_nodes` joins through NodeTeam |
| `main.py` | `routers/teams.py` | `app.include_router(teams.router)` | WIRED | Explicit in `main.py` line 33 |
| `ws/commands.py` | `services/node_service.py` | `user_can_access_node(user_id, node_id, db)` | WIRED | Called as first guard in both `dispatch_execute` and `dispatch_kill`; direct import from `app.services.node_service` |
| `node_service.py` | `models/node_team.py` | Node → NodeTeam → TeamMember join | WIRED | All four query functions join through `NodeTeam` |
| `ws/frontend_router.py` | `services/auth_service.py` | `validate_ws_ticket(ticket, session)` | WIRED | Called before `websocket.accept()`; commit atomically before accepting |
| `main.py` | `ws/frontend_router.py` | `app.include_router(frontend_ws_router)` | WIRED | Explicit in `main.py` line 34 |

---

## Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|-------------|------|-------------|--------|---------|
| AUTH-01 | 03-02 | User can register with email and password | SATISFIED | `POST /api/auth/register` → `register_user()` in `auth_service.py` |
| AUTH-02 | 03-02 | User can log in and receive JWT access + refresh tokens | SATISFIED | `POST /api/auth/login` → `authenticate_user()` + token creation in `auth.py` |
| AUTH-03 | 03-02 | User can refresh expired access token using refresh token | SATISFIED | `POST /api/auth/refresh` → `refresh_access_token()` with DB validation |
| AUTH-04 | 03-01 | Unauthenticated requests are rejected with 401 | SATISFIED | `get_current_user` dependency on all protected endpoints; health endpoint guarded in Plan 04 |
| AUTH-05 | 03-04 | Frontend WebSocket connections use JWT ticket auth | SATISFIED | `/ws/frontend?ticket=...` validates single-use ticket atomically before `websocket.accept()` |
| TEAM-01 | 03-02 | Every user has a personal team created on registration | SATISFIED | `register_user()` creates User + Team + TeamMember in single `db.flush()` atomically |
| TEAM-02 | 03-03 | User can create additional teams | SATISFIED | `POST /api/teams` → `create_team()` adds user as owner |
| TEAM-03 | 03-03 | User can invite other users to their teams | SATISFIED | `POST /api/teams/{id}/members` → `add_member()` with owner-only check |
| TEAM-04 | 03-03 | Nodes are assigned to teams | SATISFIED | `POST /api/teams/{id}/nodes` → `assign_node_to_team()` creates NodeTeam record |
| TEAM-05 | 03-04 | Users can only see and manage nodes belonging to their teams | SATISFIED | `node_service.list_nodes_for_user` and `user_can_access_node` enforce team-scoped access via joins |
| TEAM-06 | 03-04 | Execute/kill commands enforce team ownership validation | SATISFIED | Both `dispatch_execute` and `dispatch_kill` call `user_can_access_node()` first; raise PermissionError on denial |
| TEAM-07 | 03-01 | A node can be shared across multiple teams | SATISFIED | `node_teams` is a many-to-many junction table (composite PK on node_id + team_id); NodeTeam model supports multiple team assignments per node |

All 12 requirements (AUTH-01–05, TEAM-01–07) are SATISFIED. No orphaned requirements found — all 12 are accounted for in plan frontmatter and have supporting implementation.

---

## Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| `ws/frontend_router.py:50` | `# placeholder for Phase 4 streaming` + `ack` stub response | Info | Intentional and documented in 03-04-SUMMARY as Phase 4 work. The auth goal (ticket validation before accept) is fully implemented. The message-loop stub does not block Phase 3 goal. |

No blocker or warning-level anti-patterns found. The single info item is an acknowledged, scoped stub for Phase 4.

---

## Human Verification Required

### 1. Registration flow with personal team

**Test:** Call `POST /api/auth/register` with a new email/password, then call `GET /api/teams` with the returned access token.
**Expected:** The teams list contains exactly one team named `{email}'s Team` with the user as owner.
**Why human:** Atomic DB transaction behavior and token round-trip require a running server + DB.

### 2. Cross-team isolation

**Test:** Register two users (User A, User B). User A creates a team, assigns a node. Call `GET /api/teams/{id}/nodes` as User B.
**Expected:** 404 (team not found for User B), not 200 with the node.
**Why human:** Multi-user isolation requires live DB state with two authenticated sessions.

### 3. WS ticket single-use enforcement

**Test:** Obtain a ticket via `POST /api/auth/ws-ticket`. Connect to `/ws/frontend?ticket=...` successfully. Attempt to reconnect with the same ticket ID immediately.
**Expected:** Second connection is rejected with close code 1008.
**Why human:** Requires live WebSocket connection and timing; atomic UPDATE…RETURNING behavior needs DB to verify.

### 4. Command dispatch team ownership rejection

**Test:** Register a user with no team membership for a given node. Call dispatch_execute targeting that node (via any REST endpoint that wraps it once Phase 4 exposes it).
**Expected:** HTTP 403 or PermissionError propagated.
**Why human:** Requires a connected node and REST dispatch endpoint (Phase 4 adds the REST layer for dispatch).

---

## Gaps Summary

No gaps. All 12 must-haves verified across all three levels (exists, substantive, wired). All 12 requirements satisfied with direct implementation evidence.

The frontend WebSocket message loop is a documented, intentional Phase 4 stub — it does not affect Phase 3 goal achievement (ticket authentication enforcement is fully implemented and correctly ordered before `accept()`).

---

_Verified: 2026-03-21_
_Verifier: Claude (gsd-verifier)_

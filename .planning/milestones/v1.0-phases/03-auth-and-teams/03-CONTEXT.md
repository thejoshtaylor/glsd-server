# Phase 3: Auth and Teams - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers user registration, JWT authentication (access + refresh tokens), team CRUD, team membership management, multi-team node assignment, and service-layer multi-tenancy enforcement. Every node, instance, and command query is scoped to the authenticated user's team memberships with no cross-team data leakage. Frontend WebSocket authentication via short-lived single-use tickets. No dashboard UI, no stream rendering — purely the auth and authorization layer.

</domain>

<decisions>
## Implementation Decisions

### Authentication Flow
- DB-backed refresh tokens with `expires_at` and `revoked` columns — enables revocation on logout and password change
- Access token lifetime: 30 minutes (already configured in `config.py`)
- Refresh token lifetime: 7 days
- Frontend WebSocket ticket: `POST /api/auth/ws-ticket` returns a single-use UUID ticket valid for 30 seconds, stored in DB; frontend connects to `/ws/frontend?ticket=...`

### Team Management
- Direct-add members by email — `POST /api/teams/{id}/members` adds user immediately; no invite/accept flow for v1
- Two roles only: owner (can manage members, assign nodes) and member (can view nodes, dispatch commands)
- Personal team auto-created on registration, named "{email}'s Team", undeletable, user is always owner
- Nodes can belong to multiple teams via `node_teams` junction table (TEAM-07); any team member can dispatch commands to shared nodes

### Multi-Tenancy Enforcement
- Service-layer enforcement — all node/instance queries go through service functions that accept `user_id`, resolve team memberships, and filter; routers never query DB directly
- Node's team assignment checked at node registration — `node_register` payload includes `node_id`; server looks up which teams the node belongs to; stream events fan out only to team members
- Existing Phase 2 endpoints retrofitted with `Depends(get_current_user)` — node WS stays Bearer-token-based
- Instance visibility via joins: instance → node → node_teams → team_members — no instance visible unless requesting user shares a team with the node that ran it

### Claude's Discretion
- Internal service function signatures and organization
- Error message wording for auth failures
- Pydantic schema design for request/response models
- Test organization and fixtures

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/models/user.py` — User model with `user_id`, `email`, `hashed_password`, `created_at`
- `backend/app/models/team.py` — Team model with `team_id`, `name`, `owner_id`; TeamMember with composite PK `(team_id, user_id)`, `role` field
- `backend/app/config.py` — Settings with `jwt_secret_key`, `jwt_algorithm`, `jwt_access_token_expire_minutes` already defined
- `backend/app/dependencies.py` — `get_db` async generator, `DbSession` type alias
- `backend/app/database.py` — Async engine + session factory

### Established Patterns
- SQLAlchemy 2.0 `Mapped[]` typed columns with async sessions
- Pydantic-settings for configuration
- Router-based endpoint organization (`backend/app/routers/`)
- `asynccontextmanager` lifespan for startup/shutdown
- Per-node `asyncio.Lock` for reconnect serialization (established in Phase 2)

### Integration Points
- `main.py` — include auth and team routers
- `config.py` — add `jwt_refresh_token_expire_days` setting
- New Alembic migration for `refresh_tokens`, `ws_tickets`, `node_teams` tables
- `ws/manager.py` — add team-scoped fan-out logic for frontend connections
- Existing health router — add `Depends(get_current_user)`

</code_context>

<specifics>
## Specific Ideas

- PyJWT 2.x for JWT — do NOT use python-jose (abandoned, unpatched CVEs)
- pwdlib for password hashing — do NOT use passlib (abandoned, broken with bcrypt >= 5.0.0)
- `server-spec.md` specifies frontend WS auth via ticket pattern (REST-issued, query param)
- Node WS auth stays as-is (Bearer token in upgrade handshake) — no changes to Phase 2 node protocol

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

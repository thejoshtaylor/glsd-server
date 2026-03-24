# Phase 3: Auth and Teams - Research

**Researched:** 2026-03-21
**Domain:** FastAPI authentication (PyJWT, pwdlib), JWT access/refresh token lifecycle, DB-backed token revocation, WebSocket ticket auth, multi-tenancy with SQLAlchemy 2.0 async joins
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- DB-backed refresh tokens with `expires_at` and `revoked` columns — enables revocation on logout and password change
- Access token lifetime: 30 minutes (already configured in `config.py`)
- Refresh token lifetime: 7 days
- Frontend WebSocket ticket: `POST /api/auth/ws-ticket` returns a single-use UUID ticket valid for 30 seconds, stored in DB; frontend connects to `/ws/frontend?ticket=...`
- Direct-add members by email — `POST /api/teams/{id}/members` adds user immediately; no invite/accept flow for v1
- Two roles only: owner (can manage members, assign nodes) and member (can view nodes, dispatch commands)
- Personal team auto-created on registration, named "{email}'s Team", undeletable, user is always owner
- Nodes can belong to multiple teams via `node_teams` junction table (TEAM-07); any team member can dispatch commands to shared nodes
- Service-layer enforcement — all node/instance queries go through service functions that accept `user_id`, resolve team memberships, and filter; routers never query DB directly
- Node's team assignment checked at node registration — `node_register` payload includes `node_id`; server looks up which teams the node belongs to; stream events fan out only to team members
- Existing Phase 2 endpoints retrofitted with `Depends(get_current_user)` — node WS stays Bearer-token-based
- Instance visibility via joins: instance → node → node_teams → team_members — no instance visible unless requesting user shares a team with the node that ran it
- PyJWT 2.x for JWT — do NOT use python-jose (abandoned, unpatched CVEs)
- pwdlib for password hashing — do NOT use passlib (abandoned, broken with bcrypt >= 5.0.0)
- `server-spec.md` specifies frontend WS auth via ticket pattern (REST-issued, query param)
- Node WS auth stays as-is (Bearer token in upgrade handshake) — no changes to Phase 2 node protocol

### Claude's Discretion
- Internal service function signatures and organization
- Error message wording for auth failures
- Pydantic schema design for request/response models
- Test organization and fixtures

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can register with email and password | pwdlib PasswordHash.recommended().hash() for password; User model already exists; create personal team on registration |
| AUTH-02 | User can log in and receive JWT access + refresh tokens | PyJWT jwt.encode() with exp claim; DB-backed refresh token record inserted on login |
| AUTH-03 | User can refresh expired access token using refresh token | Validate refresh token against DB (exists, not revoked, not expired); issue new access token |
| AUTH-04 | Unauthenticated requests are rejected with 401 | get_current_user dependency with OAuth2PasswordBearer; jwt.decode() InvalidTokenError → 401 with WWW-Authenticate: Bearer |
| AUTH-05 | Frontend WebSocket connections use JWT ticket auth (REST-issued short-lived ticket as query param) | POST /api/auth/ws-ticket → UUID stored in ws_tickets table with 30s TTL; /ws/frontend?ticket=... validates and marks used before accept() |
| TEAM-01 | Every user has a personal team created on registration | Registration service creates Team + TeamMember(role=owner) in same transaction |
| TEAM-02 | User can create additional teams | POST /api/teams; creator auto-added as owner in team_members |
| TEAM-03 | User can invite other users to their teams | POST /api/teams/{id}/members; owner-only; look up user by email; direct-add pattern |
| TEAM-04 | Nodes are assigned to teams | POST /api/teams/{id}/nodes assigns node to team via node_teams junction; also handle assignment at node registration |
| TEAM-05 | Users can only see and manage nodes belonging to their teams | NodeService.list_nodes(user_id) joins node_teams → team_members; filters by user's team memberships |
| TEAM-06 | Execute/kill commands enforce team ownership validation | CommandBus checks node_teams → team_members before dispatch; raises 403 if user's teams don't include node |
| TEAM-07 | A node can be shared across multiple teams | node_teams junction table (many-to-many); Node.team_id single FK column from Phase 1 must be migrated away or supplemented |
</phase_requirements>

---

## Summary

Phase 3 builds the authentication and authorization layer on top of the Phase 1/2 foundation. The tech stack for this phase (PyJWT 2.x, pwdlib with Argon2) is already present in `requirements.txt` — no new package installs are needed. The core models (User, Team, TeamMember) and Settings fields (`jwt_secret_key`, `jwt_algorithm`, `jwt_access_token_expire_minutes`) are already scaffolded and waiting.

The critical new database objects are three tables: `refresh_tokens` (DB-backed revocable tokens), `ws_tickets` (single-use 30s WebSocket auth tickets), and `node_teams` (many-to-many junction replacing the single `nodes.team_id` FK). A single Alembic migration (0003) covers all three additions plus dropping or nullifying the legacy `nodes.team_id` column.

Multi-tenancy enforcement follows a strict service-layer pattern: no router queries the DB directly, all node/instance data flows through service functions that join through `node_teams → team_members` to scope results to the requesting user's team memberships. The `get_current_user` FastAPI dependency is the single choke point for auth enforcement and must be retrofitted to all existing endpoints (health router, future command endpoints).

**Primary recommendation:** Implement in four layers — (1) token infrastructure (PyJWT + pwdlib utilities + refresh_tokens table + get_current_user dependency), (2) auth routes (register, login, refresh, logout, ws-ticket), (3) team routes (CRUD + membership + node assignment), (4) multi-tenancy enforcement retrofitted to all data-access paths.

---

## Standard Stack

### Core (all already in requirements.txt — verified)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PyJWT | 2.9.0+ (latest: 2.12.1) | JWT encode/decode | Official FastAPI recommendation; python-jose is abandoned with unpatched CVEs |
| pwdlib[argon2] | 0.2.0+ | Password hashing | FastAPI's current docs use pwdlib; passlib is abandoned and broken with bcrypt 5.0.0 on Python 3.12+ |
| SQLAlchemy[asyncio] | 2.0.44+ | Async ORM for token/team queries | Established in Phase 1; Mapped[] typed columns |
| asyncpg | 0.31.0+ | Async PG driver | Established in Phase 1 |
| pydantic-settings | 2.x | Config (jwt_secret_key etc.) | Established in Phase 1 |
| FastAPI | 0.115+ | Router + dependency injection | OAuth2PasswordBearer + Depends() |
| python-multipart | 0.0.12+ | Form parsing for login endpoint | Required by FastAPI for OAuth2PasswordRequestForm |

### No New Packages Required

All packages for this phase are already declared in `backend/requirements.txt`. The `pwdlib[argon2]` extra was already specified — Argon2 hasher is available without any install changes.

---

## Architecture Patterns

### Recommended Module Structure (additions to existing backend)

```
backend/app/
├── routers/
│   ├── auth.py          # POST /api/auth/register, /login, /refresh, /logout, /ws-ticket
│   └── teams.py         # CRUD /api/teams, /api/teams/{id}/members, /api/teams/{id}/nodes
├── services/
│   ├── auth_service.py  # register_user(), authenticate_user(), create_tokens(), refresh_access_token()
│   ├── team_service.py  # create_team(), add_member(), assign_node(), list_nodes_for_user()
│   └── node_service.py  # list_nodes(user_id), get_node(user_id, node_id) — replaces direct DB queries
├── models/
│   ├── refresh_token.py # RefreshToken model
│   ├── ws_ticket.py     # WsTicket model
│   └── node_team.py     # NodeTeam junction model
├── schemas/
│   ├── auth.py          # RegisterRequest, LoginRequest, TokenResponse, RefreshRequest
│   └── teams.py         # TeamCreate, TeamResponse, MemberAdd, NodeAssign
└── dependencies.py      # get_current_user() — add here alongside existing get_db
```

### Pattern 1: PyJWT Token Creation

```python
# Source: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ + pyjwt.readthedocs.io
from datetime import datetime, timedelta, timezone
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError

def create_access_token(user_id: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    payload = {"sub": user_id, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

def create_refresh_token(user_id: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.jwt_refresh_token_expire_days
    )
    payload = {"sub": user_id, "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

def decode_token(token: str, settings: Settings) -> dict:
    # algorithms MUST be a list (security requirement — prevents algorithm confusion attacks)
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
```

**Critical:** `algorithms` in `jwt.decode()` must be a list, not a string. This is a security requirement — accepting any algorithm would allow attackers to switch to "none".

### Pattern 2: pwdlib Password Hashing

```python
# Source: https://frankie567.github.io/pwdlib/guide/ + FastAPI official docs
from pwdlib import PasswordHash

# Module-level singleton — PasswordHash.recommended() uses Argon2 by default
password_hasher = PasswordHash.recommended()

def hash_password(plain: str) -> str:
    return password_hasher.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return password_hasher.verify(plain, hashed)
    # Returns True/False; does NOT raise on wrong password
```

`pwdlib[argon2]` is already in requirements.txt. `PasswordHash.recommended()` returns an Argon2-backed instance.

### Pattern 3: get_current_user FastAPI Dependency

```python
# Source: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type", "")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except InvalidTokenError:
        # Catches both ExpiredSignatureError and all other JWT errors
        raise credentials_exception
    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user

# Type alias for injection into routes
CurrentUser = Annotated[User, Depends(get_current_user)]
```

### Pattern 4: DB-Backed Refresh Token

```python
# RefreshToken model
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    token_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(255))  # SHA-256 of the JWT string
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    revoked: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

**Important:** Store a hash of the refresh token (SHA-256 of the JWT string), not the raw token. On refresh: decode JWT, look up hash in DB, verify `revoked=False` and `expires_at > now()`, then issue new access token. On logout: set `revoked=True`.

On password change: bulk `UPDATE refresh_tokens SET revoked=True WHERE user_id=?` to invalidate all sessions.

### Pattern 5: Single-Use WebSocket Ticket

```python
# WsTicket model
class WsTicket(Base):
    __tablename__ = "ws_tickets"

    ticket_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID4
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

# REST endpoint issues ticket
@router.post("/api/auth/ws-ticket")
async def issue_ws_ticket(current_user: CurrentUser, db: DbSession) -> dict:
    ticket_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
    db.add(WsTicket(ticket_id=ticket_id, user_id=current_user.user_id, expires_at=expires_at))
    await db.commit()
    return {"ticket": ticket_id}

# In /ws/frontend endpoint — BEFORE websocket.accept()
async def frontend_ws_endpoint(websocket: WebSocket, ticket: str) -> None:
    async with get_session_maker()() as session:
        ws_ticket = await session.get(WsTicket, ticket)
        if (
            ws_ticket is None
            or ws_ticket.used
            or ws_ticket.expires_at < datetime.now(timezone.utc)
        ):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        # Mark used BEFORE accept() — prevents replay race
        ws_ticket.used = True
        await session.commit()
    await websocket.accept()
    # ... connection loop
```

**Critical ordering:** Mark ticket `used=True` and commit BEFORE calling `websocket.accept()`. If the accept() happens first and the commit fails, the ticket could be replayed.

### Pattern 6: node_teams Junction Table (TEAM-07)

```python
# NodeTeam junction model — replaces single team_id FK on Node
class NodeTeam(Base):
    __tablename__ = "node_teams"

    node_id: Mapped[str] = mapped_column(String(255), ForeignKey("nodes.node_id"), primary_key=True)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

The existing `nodes.team_id` nullable FK from Phase 1 migration (0001) must be handled. Options in Alembic migration 0003:
1. Migrate data: `INSERT INTO node_teams SELECT node_id, team_id FROM nodes WHERE team_id IS NOT NULL`
2. Drop the `team_id` column from `nodes` table

### Pattern 7: Multi-Tenancy Service Query

```python
# Source: SQLAlchemy 2.0 async join pattern
from sqlalchemy import select

async def list_nodes_for_user(user_id: str, db: AsyncSession) -> list[Node]:
    """Returns all nodes visible to the user via any team membership."""
    result = await db.execute(
        select(Node)
        .join(NodeTeam, Node.node_id == NodeTeam.node_id)
        .join(TeamMember, NodeTeam.team_id == TeamMember.team_id)
        .where(TeamMember.user_id == user_id)
        .distinct()  # Node may be in multiple teams the user is member of
    )
    return list(result.scalars().unique())  # .unique() required with joins on collections

async def user_can_access_node(user_id: str, node_id: str, db: AsyncSession) -> bool:
    """Returns True if user is a member of any team that owns this node."""
    result = await db.execute(
        select(TeamMember.user_id)
        .join(NodeTeam, TeamMember.team_id == NodeTeam.team_id)
        .where(TeamMember.user_id == user_id, NodeTeam.node_id == node_id)
        .limit(1)
    )
    return result.scalar() is not None
```

**Note on `.unique()`:** When using `select(Model).join(...)` with collection-type joins in SQLAlchemy 2.0 async, always call `.unique()` on the result before `.scalars()` to deduplicate rows caused by the join. Failing to do this raises a `sqlalchemy.exc.InvalidRequestError`.

### Anti-Patterns to Avoid

- **Direct DB queries in routers:** Routers must only call service functions; never `select(Node)` directly in a router handler.
- **python-jose or passlib:** Do not use either. They are abandoned. PyJWT and pwdlib are the locked choices.
- **`jwt.decode(token, key, algorithm="HS256")`:** The `algorithm` singular parameter is not valid in PyJWT 2.x — use `algorithms=["HS256"]` (list).
- **Accepting the WebSocket before marking ticket used:** Always commit `used=True` before `websocket.accept()`.
- **Holding DB session across WebSocket awaits:** Consistent with Phase 2 patterns — acquire short-lived sessions per discrete DB operation, not held for the WebSocket connection lifetime.
- **Using `nodes.team_id` for multi-tenancy:** This single-FK column only supports one team per node. Phase 3 replaces it with the `node_teams` junction table for TEAM-07.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom bcrypt/argon2 wrappers | `pwdlib[argon2]` (`PasswordHash.recommended()`) | Timing-safe comparison, automatic salt, algorithm agility |
| JWT signing/validation | Custom HMAC token strings | `PyJWT` (`jwt.encode`, `jwt.decode`) | Standard claims (exp, sub), algorithm confusion prevention, clock skew leeway support |
| Form-based login parsing | Manual `request.body()` parsing | `OAuth2PasswordRequestForm` from FastAPI | Standards-compliant OAuth2 form parsing; interoperates with OpenAPI docs UI |
| Bearer token extraction | Manual `Authorization` header parsing | `OAuth2PasswordBearer` dependency | Automatic extraction, integrated with FastAPI OpenAPI schema |

**Key insight:** The JWT + password hashing problem space has many subtle security requirements (timing attacks, algorithm confusion, clock skew). The locked library choices (PyJWT + pwdlib) handle all of these correctly. Do not implement alternatives.

---

## Alembic Migration Notes (Migration 0003)

The Phase 3 migration must:

1. Create `refresh_tokens` table
2. Create `ws_tickets` table
3. Create `node_teams` junction table
4. Migrate existing `nodes.team_id` data into `node_teams` (if any rows have non-null `team_id`)
5. Drop or nullify `nodes.team_id` column (it's superseded by `node_teams`)

**Alembic pitfall carried forward from Phase 2:** Do NOT call `enum.create()` explicitly — Alembic's transactional DDL fires `_on_table_create` automatically, causing `DuplicateObjectError`. Let `op.create_table()` create enums via column definition.

**Settings addition needed:** Add `jwt_refresh_token_expire_days: int = 7` to `Settings` in `config.py`.

---

## Common Pitfalls

### Pitfall 1: algorithms Parameter is a List

**What goes wrong:** `jwt.decode(token, key, algorithm="HS256")` raises `TypeError` — PyJWT 2.x requires `algorithms` (plural) as a list.
**Why it happens:** API changed from PyJWT 1.x to 2.x; training data may mix the two.
**How to avoid:** Always `jwt.decode(token, key, algorithms=["HS256"])`.
**Warning signs:** `TypeError: decode() got an unexpected keyword argument 'algorithm'`

### Pitfall 2: Catching the Wrong JWT Exception

**What goes wrong:** Code catches `jwt.ExpiredSignatureError` but misses malformed tokens, wrong-key errors, etc.
**Why it happens:** Developers focus on expiry but forget other invalid token states.
**How to avoid:** Catch the base `jwt.exceptions.InvalidTokenError` (which `ExpiredSignatureError` is a subclass of). All JWT validation failures flow through this single base class.
**Warning signs:** 500 errors on malformed tokens in production.

### Pitfall 3: node_teams Join Without .unique()

**What goes wrong:** `result.scalars()` raises `sqlalchemy.exc.InvalidRequestError` when a node appears in multiple teams the user belongs to.
**Why it happens:** SQLAlchemy 2.0 requires explicit deduplication when a join produces multiple rows for the same mapped object.
**How to avoid:** `result.scalars().unique()` or use `.distinct()` in the query.
**Warning signs:** Works in tests (one team per node) but fails in production with shared nodes.

### Pitfall 4: WebSocket Ticket Replay Race

**What goes wrong:** Two concurrent WebSocket connections with the same ticket both succeed if the "mark used" DB write races with the second connection's "check used" read.
**Why it happens:** Read-then-write pattern without a transaction.
**How to avoid:** Use `UPDATE ws_tickets SET used=True WHERE ticket_id=? AND used=False RETURNING *` in a single atomic query. If no row returned, reject. Or use `SELECT FOR UPDATE` in PostgreSQL.
**Warning signs:** Very rare in practice but testable with concurrent load.

### Pitfall 5: Personal Team Creation Not Atomic

**What goes wrong:** User row created, then team creation fails — user exists but has no team; service invariant broken.
**Why it happens:** Two separate DB operations without transaction wrapping.
**How to avoid:** Create User, Team, and TeamMember records in a single transaction in `register_user()`. Roll back all three if any fails.
**Warning signs:** Users who can log in but have no teams in the system.

### Pitfall 6: nodes.team_id vs node_teams Confusion

**What goes wrong:** After migration, code still reads `node.team_id` for authorization checks, bypassing the multi-team junction table.
**Why it happens:** The column exists from Phase 1 migration and wasn't removed.
**How to avoid:** Drop the `nodes.team_id` column in migration 0003 (after migrating data). Remove the field from the `Node` model. All authorization must go through `node_teams`.
**Warning signs:** TEAM-07 (node shared across teams) fails silently — only the original team can dispatch.

### Pitfall 7: Refresh Token Hash vs Raw Token

**What goes wrong:** Storing the raw JWT in the DB leaks the refresh token if the DB is compromised.
**Why it happens:** Simpler to store raw token string.
**How to avoid:** Store `hashlib.sha256(token.encode()).hexdigest()` in `token_hash`. On lookup, hash the incoming token and compare hashes.
**Warning signs:** DB dump exposes valid refresh tokens that can be used immediately.

---

## Code Examples

### Complete Login Flow

```python
# Source: FastAPI official docs + project patterns
@router.post("/api/auth/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    user = await auth_service.authenticate_user(form_data.username, form_data.password, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(user.user_id, settings)
    refresh_token = create_refresh_token(user.user_id, settings)
    await auth_service.store_refresh_token(user.user_id, refresh_token, settings, db)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, token_type="bearer")
```

### Authorization Guard on Command Dispatch

```python
# In existing commands.py dispatch_execute — add user_id parameter for TEAM-06
async def dispatch_execute(
    node_id: str,
    project: str,
    work_dir: str,
    prompt: str,
    user_id: str,         # NEW — required for team ownership check
    db: AsyncSession,     # NEW — required for team ownership check
    session_id: str | None = None,
) -> str:
    if not await node_service.user_can_access_node(user_id, node_id, db):
        raise PermissionError(f"User {user_id} does not have access to node {node_id}")
    # ... existing dispatch logic unchanged
```

### Refresh Token Endpoint

```python
@router.post("/api/auth/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    try:
        payload = jwt.decode(body.refresh_token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        token_type = payload.get("type")
        if token_type != "refresh" or user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token type")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    db_token = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,
        )
    )
    record = db_token.scalar_one_or_none()
    if record is None or record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token revoked or expired")

    new_access_token = create_access_token(user_id, settings)
    return TokenResponse(access_token=new_access_token, refresh_token=body.refresh_token, token_type="bearer")
```

---

## Existing Code Integration Points

### Files Requiring Modification

| File | Change |
|------|--------|
| `backend/app/config.py` | Add `jwt_refresh_token_expire_days: int = 7` to Settings |
| `backend/app/models/node.py` | Remove `team_id` FK column (replaced by `node_teams` junction) |
| `backend/app/dependencies.py` | Add `get_current_user()` dependency, `CurrentUser` type alias |
| `backend/app/main.py` | Include auth and teams routers; register `/ws/frontend` endpoint |
| `backend/app/routers/health.py` | Add `Depends(get_current_user)` to `health_check` endpoint |
| `backend/app/ws/commands.py` | Add `user_id` + `db` parameters to `dispatch_execute` and `dispatch_kill` for team ownership check |
| `backend/alembic/versions/` | New `0003_auth_teams.py` migration |

### New Files

| File | Purpose |
|------|---------|
| `backend/app/models/refresh_token.py` | RefreshToken ORM model |
| `backend/app/models/ws_ticket.py` | WsTicket ORM model |
| `backend/app/models/node_team.py` | NodeTeam junction ORM model |
| `backend/app/routers/auth.py` | Auth endpoints (register, login, refresh, logout, ws-ticket) |
| `backend/app/routers/teams.py` | Team CRUD + membership + node assignment endpoints |
| `backend/app/services/auth_service.py` | register_user, authenticate_user, store_refresh_token, revoke_refresh_tokens |
| `backend/app/services/team_service.py` | create_team, add_member, assign_node_to_team, list_user_teams |
| `backend/app/services/node_service.py` | list_nodes_for_user, user_can_access_node, get_node_for_user |
| `backend/app/schemas/auth.py` | RegisterRequest, TokenResponse, RefreshRequest, WsTicketResponse |
| `backend/app/schemas/teams.py` | TeamCreate, TeamResponse, MemberAdd, NodeAssign |
| `backend/app/ws/frontend_router.py` | /ws/frontend WebSocket endpoint with ticket validation |

---

## Open Questions

1. **Should `nodes.team_id` column be dropped or kept nullable?**
   - What we know: TEAM-07 requires `node_teams` junction; the column is nullable today (Phase 1)
   - What's unclear: Is there any code path (Phase 2 handlers) that still reads `node.team_id` for non-auth purposes?
   - Recommendation: Audit all references to `Node.team_id` in codebase; drop the column and FK in migration 0003 after migrating data. No Phase 2 handler appears to use it for logic (confirmed by reading handlers.py — only upserts the field, never reads it for routing).

2. **Token type claim in access token — should it be a standard claim or custom?**
   - What we know: PyJWT supports arbitrary claims in payload; FastAPI docs use `sub` + custom `username` claim
   - What's unclear: Whether using a `"type": "access"` custom claim is sufficiently robust
   - Recommendation: Use `"type": "access"` / `"type": "refresh"` custom claims. Validate in `get_current_user` that type is "access" to prevent a refresh token from being used as an access token.

---

## Sources

### Primary (HIGH confidence)
- PyJWT 2.12.1 official docs (pyjwt.readthedocs.io) — encode/decode API, exp claim, InvalidTokenError hierarchy
- FastAPI official security docs (fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) — OAuth2PasswordBearer, get_current_user pattern, pwdlib integration
- pwdlib official guide (frankie567.github.io/pwdlib/guide/) — PasswordHash.recommended(), hash/verify API
- SQLAlchemy 2.0 docs (docs.sqlalchemy.org) — async join patterns, .unique() requirement
- Project codebase (backend/app/) — existing models, config, dependencies, migration history

### Secondary (MEDIUM confidence)
- FastAPI WebSocket auth article (dev.to/hamurda) — ticket-before-accept pattern validation
- WebSearch: PyJWT + FastAPI + refresh token patterns — multiple consistent sources confirming patterns above

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already in requirements.txt; versions verified from PyPI/official docs
- Architecture: HIGH — patterns verified from official FastAPI docs + PyJWT docs; aligned with existing Phase 1/2 codebase patterns
- Pitfalls: HIGH — based on official PyJWT 2.x API (list vs string for algorithms), SQLAlchemy 2.0 documented behavior (.unique()), and project STATE.md accumulated pitfalls

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable libraries; PyJWT and pwdlib APIs are stable; SQLAlchemy 2.x API is frozen)

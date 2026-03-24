---
phase: 03-auth-and-teams
plan: "01"
subsystem: backend/auth-data-layer
tags: [auth, jwt, orm, alembic, schemas, dependencies]
dependency_graph:
  requires: []
  provides:
    - RefreshToken ORM model
    - WsTicket ORM model
    - NodeTeam junction ORM model
    - get_current_user FastAPI dependency
    - CurrentUser type alias
    - Auth Pydantic schemas
    - Teams Pydantic schemas
    - Alembic migration 0003
  affects:
    - backend/app/models/node.py (team_id removed)
    - backend/app/models/__init__.py (new exports added)
    - backend/app/config.py (jwt_refresh_token_expire_days added)
tech_stack:
  added: []
  patterns:
    - OAuth2PasswordBearer token extraction in FastAPI dependency
    - PyJWT decode with algorithms list (not string)
    - token_type claim validation to prevent refresh token misuse
    - Alembic data migration: nodes.team_id -> node_teams junction
key_files:
  created:
    - backend/app/models/refresh_token.py
    - backend/app/models/ws_ticket.py
    - backend/app/models/node_team.py
    - backend/app/schemas/auth.py
    - backend/app/schemas/teams.py
    - backend/alembic/versions/0003_auth_teams.py
  modified:
    - backend/app/models/node.py
    - backend/app/models/__init__.py
    - backend/app/config.py
    - backend/app/dependencies.py
decisions:
  - "Used str + field_validator for email in RegisterRequest because email-validator is not in requirements.txt"
  - "Migration 0003 uses explicit nodes_team_id_fkey constraint name matching PostgreSQL auto-generated name from migration 0001"
  - "No enum.create() calls in migration — enums are not created in 0003 (only in 0001); dropped nodes.team_id column has no enum"
metrics:
  duration: "4m"
  completed: "2026-03-21T18:05:46Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 4
---

# Phase 03 Plan 01: Auth and Teams Data Layer Summary

Auth data foundation: RefreshToken, WsTicket, NodeTeam ORM models plus get_current_user JWT dependency and Alembic migration 0003 replacing nodes.team_id with a node_teams junction table.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create new ORM models, update Node model, update config, create schemas | 0547737 | refresh_token.py, ws_ticket.py, node_team.py, node.py, __init__.py, config.py, auth.py, teams.py |
| 2 | Create get_current_user dependency and Alembic migration 0003 | 8175aed | dependencies.py, 0003_auth_teams.py |

## What Was Built

### New ORM Models

**RefreshToken** (`backend/app/models/refresh_token.py`): Stores hashed refresh tokens with expiry and revocation flag. `token_hash` stores SHA-256 hex digest so raw token is never persisted. Indexed on `user_id` for fast lookup during token rotation.

**WsTicket** (`backend/app/models/ws_ticket.py`): Short-lived single-use tickets for WebSocket frontend authentication. Single `used` flag prevents replay attacks. Indexed on `user_id`.

**NodeTeam** (`backend/app/models/node_team.py`): Many-to-many junction replacing `nodes.team_id`. Composite PK on (node_id, team_id). Supports nodes belonging to multiple teams.

### Updated Models/Config

**Node model**: `team_id` column and `ForeignKey("teams.team_id")` removed. `ForeignKey` import removed from `node.py`. `Optional` retained (used by `projects` field).

**Settings**: Added `jwt_refresh_token_expire_days: int = 7` after `jwt_access_token_expire_minutes`.

**models/__init__.py**: Added `NodeTeam`, `RefreshToken`, `WsTicket` imports and `__all__` exports.

### Pydantic Schemas

**auth.py**: `RegisterRequest` (email with field_validator + password), `TokenResponse` (access + refresh tokens), `RefreshRequest`, `WsTicketResponse`.

**teams.py**: `TeamCreate`, `TeamResponse` (from_attributes=True), `MemberAdd`, `MemberResponse`, `NodeAssign`, `NodeTeamResponse` (from_attributes=True).

### get_current_user Dependency

`OAuth2PasswordBearer(tokenUrl="/api/auth/login")` extracts Bearer token. `jwt.decode()` uses `algorithms=[settings.jwt_algorithm]` (list form, required by PyJWT). Validates `type == "access"` claim to prevent refresh tokens being used as access tokens. Catches `InvalidTokenError` (base class covering all JWT errors including expiry). Returns live `User` ORM instance or raises 401.

`CurrentUser = Annotated[User, Depends(get_current_user)]` for clean dependency injection in route handlers.

### Alembic Migration 0003

Creates `refresh_tokens`, `ws_tickets`, `node_teams` tables. Migrates existing `nodes.team_id` data to `node_teams` via INSERT SELECT. Drops FK constraint (`nodes_team_id_fkey`) then drops `nodes.team_id` column. Downgrade reverses all changes including restoring `team_id` column with data migration back from `node_teams`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Email validation without email-validator package**
- **Found during:** Task 1 - creating schemas/auth.py
- **Issue:** Plan specified `EmailStr` from Pydantic which requires `email-validator` package. Package is not in requirements.txt.
- **Fix:** Used `str` type with `@field_validator("email")` that checks for `@` and `.` after the domain separator. Email is also normalized to lowercase and stripped.
- **Files modified:** backend/app/schemas/auth.py
- **Commit:** 0547737

## Known Stubs

None — no UI components, no hardcoded placeholder data.

## Self-Check: PASSED

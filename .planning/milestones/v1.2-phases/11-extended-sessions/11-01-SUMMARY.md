---
phase: 11-extended-sessions
plan: 01
subsystem: auth
tags: [jwt, refresh-tokens, opaque-tokens, token-rotation, reuse-detection, postgres, sqlalchemy, alembic]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: RefreshToken model, auth_service, auth router, JWT token management
provides:
  - Opaque 32-byte hex refresh tokens (not JWT)
  - family_id column on refresh_tokens table (Alembic migration 0005)
  - Atomic token rotation via UPDATE...RETURNING SQL
  - Reuse detection that revokes entire token family on replay
  - Family-scoped logout revocation
  - Login cleanup of expired/revoked tokens
  - 60-minute access token lifetime (up from 30)
affects: [12-ws-reconnect, frontend-auth]

# Tech tracking
tech-stack:
  added: [secrets module (stdlib)]
  patterns:
    - Opaque refresh tokens stored as SHA-256 hash in DB
    - UPDATE...RETURNING for atomic single-statement token rotation
    - Token family grouping via family_id UUID for reuse detection
    - Login-time cleanup to keep refresh_tokens table lean

key-files:
  created:
    - backend/alembic/versions/0005_add_refresh_token_family.py
  modified:
    - backend/app/models/refresh_token.py
    - backend/app/services/auth_service.py
    - backend/app/routers/auth.py
    - backend/app/config.py

key-decisions:
  - "Opaque refresh tokens (secrets.token_hex(32)) not JWT — DB is authoritative, no decode needed"
  - "family_id UUID groups rotation chain — reuse of rotated token revokes entire family"
  - "0-second grace period (strict) — rotated token immediately invalid"
  - "Logout revokes family only (not all user tokens) — other devices stay logged in"
  - "cleanup_expired_tokens called at login keeps table lean without a separate cron job"

patterns-established:
  - "Atomic token rotation: UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=:h AND revoked=FALSE RETURNING user_id, family_id"
  - "Reuse detection: if token found but revoked, revoke family_id, raise 401"
  - "Family revocation: UPDATE refresh_tokens SET revoked=TRUE WHERE family_id=:fid"

requirements-completed: [SES-01, SES-02, SES-03, SES-04]

# Metrics
duration: 12min
completed: 2026-03-24
---

# Phase 11 Plan 01: Extended Sessions — Token Rotation Backend Summary

**Opaque hex refresh tokens with atomic UPDATE...RETURNING rotation, family-based reuse detection, and family-scoped logout revocation replacing the previous no-rotation JWT approach**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-24T00:00:00Z
- **Completed:** 2026-03-24T00:12:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Converted refresh tokens from JWT to opaque 32-byte hex format — DB lookup is authoritative, no decode needed
- Added `family_id` UUID column to `refresh_tokens` with Alembic migration (gen_random_uuid() backfill for existing rows)
- Implemented atomic rotation via `UPDATE...RETURNING` — single SQL statement revokes old token and returns user context
- Reuse detection: presenting a rotated-out token triggers family-wide revocation and 401 with "Refresh token reuse detected"
- Logout now revokes all tokens in the same family (device-scoped), not just the single token
- Login cleans up expired/revoked tokens for the user before issuing new ones
- Access token lifetime extended from 30 to 60 minutes (SES-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add family_id to RefreshToken model, create migration, update config** - `37bf47e` (feat)
2. **Task 2: Rewrite auth service for opaque tokens, atomic rotation, reuse detection, and family revocation** - `b564875` (feat)

## Files Created/Modified

- `backend/app/models/refresh_token.py` - Added `family_id: Mapped[str]` column (String(36), indexed)
- `backend/alembic/versions/0005_add_refresh_token_family.py` - Migration adding family_id with gen_random_uuid() backfill
- `backend/app/config.py` - Updated `jwt_access_token_expire_minutes` from 30 to 60 (SES-01)
- `backend/app/services/auth_service.py` - Rewrote token functions: opaque generation, atomic rotation, reuse detection, family revocation, cleanup
- `backend/app/routers/auth.py` - Updated login/refresh/logout endpoints to use new service functions

## Decisions Made

- Used `secrets.token_hex(32)` for opaque tokens — cryptographically secure, no expiry embedded, DB is authoritative
- Reuse detection path uses a second SELECT after the UPDATE returns no row — clean two-step logic without race conditions
- `cleanup_expired_tokens` called at login avoids need for a cron job at the cost of slight login overhead (acceptable for v1)
- `InvalidTokenError` import removed since JWT decode no longer appears in refresh path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `InvalidTokenError` import**
- **Found during:** Task 2 (auth service rewrite)
- **Issue:** `from jwt.exceptions import InvalidTokenError` became unused after removing JWT-based `refresh_access_token`
- **Fix:** Removed the import to prevent linting/import warnings
- **Files modified:** `backend/app/services/auth_service.py`
- **Verification:** File still imports correctly; `jwt` module retained for `create_access_token`
- **Committed in:** `b564875` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/cleanup)
**Impact on plan:** Minor cleanup; no behavior change or scope creep.

## Issues Encountered

None — the WebSocket ticket `UPDATE...RETURNING` pattern in the existing codebase was a direct template for the token rotation SQL.

## User Setup Required

None — no external service configuration required. The Alembic migration will run automatically on next container startup.

## Next Phase Readiness

- Backend token rotation fully implemented; `/api/auth/refresh` now returns both new access and new refresh tokens
- Plan 02 (frontend refresh flow) can now wire `refreshAccessToken` to store the rotated refresh token from the response
- The `family_id` column is indexed — reuse detection queries are efficient

---
*Phase: 11-extended-sessions*
*Completed: 2026-03-24*

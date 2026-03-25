# Phase 11: Extended Sessions - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement robust 1hr/7-day session lifecycle with atomic refresh token rotation, concurrent refresh deduplication, and reuse detection. Backend token mechanics and frontend refresh flow — no UI changes beyond login redirect behavior.

</domain>

<decisions>
## Implementation Decisions

### Token Rotation Mechanics
- Refresh tokens use opaque 32-byte hex format (not JWT) — DB lookup is authoritative, no need to decode
- Add `family_id` UUID column to `refresh_tokens` table — groups tokens in a rotation chain for reuse detection
- 0-second grace period (strict) — rotated token is immediately invalid; singleton guard (SES-05) prevents races
- Unlimited active refresh token families per user — each device/login creates a new family

### Frontend Refresh Behavior
- Access token stays in-memory only (current behavior) — refresh token in localStorage handles reloads
- Refresh failure redirects to login immediately (current behavior) — simple and predictable
- Proactive refresh at 80% of access token lifetime (~48 min mark) — avoids 401 races entirely
- Refresh on tab visibility if token is past 80% lifetime — prevents stale-tab 401 cascade

### Session Lifecycle Edge Cases
- Logout revokes current family only — other devices stay logged in; family_id scopes the revocation
- Each login creates a fresh token family — simple, no device tracking needed
- Old refresh tokens cleaned up on login + daily sweep of expired tokens — keeps table lean
- Same `/api/auth/refresh` endpoint returns both new access and new refresh tokens — frontend swaps atomically

### Claude's Discretion
- Internal implementation details of the singleton promise guard pattern
- Database migration ordering and naming
- Test structure and mocking approach
- Error message wording for token-related failures

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/services/auth_service.py` — token creation/validation; extend with rotation logic
- `backend/app/routers/auth.py` — `/api/auth/refresh` endpoint; modify to return rotated token
- `frontend/src/lib/api.ts` — token storage (`setTokens`/`clearTokens`), refresh interceptor; add singleton guard
- `backend/app/models/refresh_token.py` — RefreshToken model; add `family_id` column
- WebSocket ticket system already uses `UPDATE...RETURNING` atomic pattern — reuse for token rotation

### Established Patterns
- SHA-256 hashing for refresh token storage (never plaintext)
- asyncpg + SQLAlchemy 2 async for all DB operations
- PyJWT 2.x for JWT encoding/decoding (not python-jose)
- pwdlib for password hashing (not passlib)
- `utcnow()` helper for naive UTC datetimes

### Integration Points
- `backend/app/config.py` — `jwt_access_token_expire_minutes` (currently 30, change to 60) and `jwt_refresh_token_expire_days` (currently 7, keep)
- Frontend `api.ts` 401 interceptor — wrap with singleton promise guard before Phase 12 WS work
- `backend/app/routers/auth.py` logout endpoint — add family-scoped revocation

</code_context>

<specifics>
## Specific Ideas

- Use `UPDATE refresh_tokens SET revoked=true WHERE token_hash=:hash AND revoked=false RETURNING *` for atomic rotation (from STATE.md pitfall)
- Add `refreshPromise` singleton guard in `api.ts` BEFORE Phase 12 WS reconnect fix (from STATE.md pitfall)
- Always call `getAccessToken()` AFTER `await refreshAccessToken()` — never capture token in local var before async boundary (from STATE.md pitfall)

</specifics>

<deferred>
## Deferred Ideas

- httpOnly cookie for refresh token storage (SEC-01 — future requirement)
- Token reuse detection security alert notification (SEC-02 — future requirement)
- Session management UI for viewing/revoking active sessions (SEC-03 — future requirement)

</deferred>

---
phase: 11-extended-sessions
verified: 2026-03-25T05:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 11: Extended Sessions Verification Report

**Phase Goal:** Users stay authenticated across long sessions without unexpected logouts, and token rotation is safe against concurrent refresh calls
**Verified:** 2026-03-25T05:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Access tokens expire after 1 hour (config default is 60 minutes) | VERIFIED | `backend/app/config.py` line 14: `jwt_access_token_expire_minutes: int = 60  # SES-01: 1 hour access token` |
| 2 | Refresh tokens are opaque 32-byte hex strings, not JWTs | VERIFIED | `auth_service.py` line 49-51: `def create_refresh_token() -> str: return secrets.token_hex(32)` |
| 3 | Token rotation atomically revokes old token and issues new one in a single SQL statement | VERIFIED | `auth_service.py` lines 143-153: `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = :token_hash AND revoked = FALSE AND expires_at > now() RETURNING user_id, family_id` |
| 4 | Presenting a previously rotated refresh token revokes the entire token family | VERIFIED | `auth_service.py` lines 164-179: reuse path checks `existing.revoked`, then executes `UPDATE refresh_tokens SET revoked = TRUE WHERE family_id = :fid` |
| 5 | Logout revokes the current token family, not just the single token | VERIFIED | `auth_service.py` lines 188-198: `revoke_refresh_token_family` looks up `family_id` then revokes all tokens with that family_id; `auth.py` line 74 calls it |
| 6 | Login cleans up expired and revoked tokens for the user | VERIFIED | `auth.py` line 49: `await auth_service.cleanup_expired_tokens(user.user_id, db)` called before issuing new tokens |
| 7 | Concurrent 401 refresh calls are deduplicated into a single server request | VERIFIED | `api.ts` lines 77-83: `if (refreshPromise) return refreshPromise`; new promise only created when `refreshPromise` is null |
| 8 | The singleton guard resets on both success and failure (via .finally()) | VERIFIED | `api.ts` lines 79-82: `refreshPromise = _doRefresh().finally(() => { refreshPromise = null })` |
| 9 | Proactive refresh fires at 80% of access token lifetime (~48 min mark) | VERIFIED | `api.ts` line 46: `const refreshIn = remaining * 0.2  // fire when 20% remains (= 80% elapsed)` |
| 10 | Tab restore triggers a refresh if the token is past the 80% lifetime mark | VERIFIED | `api.ts` lines 115-126: `visibilitychange` listener with `elapsed / total >= 0.8` guard |
| 11 | After refreshAccessToken(), the access token is read fresh (not from a captured variable) | VERIFIED | `api.ts` line 95: `headers.set('Authorization', \`Bearer ${accessToken}\`)` reads module-level `accessToken` directly after `await refreshAccessToken()`, not a pre-captured local const |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/models/refresh_token.py` | RefreshToken model with family_id column | VERIFIED | Line 18: `family_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)` present |
| `backend/alembic/versions/0005_add_refresh_token_family.py` | Migration adding family_id column and index | VERIFIED | Contains `op.add_column`, `op.create_index`, `gen_random_uuid()::text`, and both `upgrade`/`downgrade` functions; `down_revision = "0004"` matches actual 0004 revision ID |
| `backend/app/config.py` | Updated access token lifetime | VERIFIED | Line 14: `jwt_access_token_expire_minutes: int = 60` |
| `backend/app/services/auth_service.py` | Opaque token generation, atomic rotation, reuse detection, family revocation | VERIFIED | All four functions present: `create_refresh_token`, `rotate_refresh_token`, `revoke_refresh_token_family`, `store_refresh_token` with family_id param; old `refresh_access_token` and `revoke_refresh_token` absent |
| `frontend/src/lib/api.ts` | Singleton promise guard, proactive refresh timer, visibility listener | VERIFIED | `refreshPromise`, `_doRefresh`, `scheduleProactiveRefresh`, `proactiveRefreshTimer`, `visibilitychange` listener, module-level init all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/app/services/auth_service.py` | `backend/app/models/refresh_token.py` | SQLAlchemy model and raw text() queries | VERIFIED | Imports `RefreshToken` from models; uses both ORM `select(RefreshToken)` and raw `text("UPDATE refresh_tokens...")` with `RETURNING user_id, family_id` |
| `backend/app/routers/auth.py` | `backend/app/services/auth_service.py` | function calls from endpoint handlers | VERIFIED | `login` calls `cleanup_expired_tokens`, `create_refresh_token`, `store_refresh_token`; `refresh` calls `rotate_refresh_token`; `logout` calls `revoke_refresh_token_family` |
| `frontend/src/lib/api.ts` | `/api/auth/refresh` | singleton-guarded fetch in `_doRefresh` | VERIFIED | `_doRefresh` line 62: `fetch('/api/auth/refresh', ...)` behind `refreshPromise` guard; stores both `data.access_token` and `data.refresh_token` via `setTokens` |
| `frontend/src/lib/api.ts` | `document.visibilitychange` | addEventListener at module load | VERIFIED | Line 115: `document.addEventListener('visibilitychange', ...)` at module level |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `backend/app/services/auth_service.py` | `row` (rotate_refresh_token) | `UPDATE refresh_tokens...RETURNING user_id, family_id` PostgreSQL query | Yes — UPDATE...RETURNING returns actual DB row | FLOWING |
| `backend/app/services/auth_service.py` | `existing` (reuse detection) | `select(RefreshToken).where(RefreshToken.token_hash == token_hash)` | Yes — ORM query against DB | FLOWING |
| `frontend/src/lib/api.ts` | `accessToken` / `refreshToken` | `_doRefresh` calls `setTokens(data.access_token, data.refresh_token)` from real server response | Yes — populated from `/api/auth/refresh` 200 response | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points available without starting the server. The backend is a FastAPI app requiring a live database; the frontend is a Vite/React SPA requiring a bundler. All wiring is verified statically.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SES-01 | 11-01-PLAN.md | Access token expires after 1 hour | SATISFIED | `config.py` line 14: `jwt_access_token_expire_minutes: int = 60` |
| SES-02 | 11-01-PLAN.md | Refresh token expires after 7 days and silently rotates on use | SATISFIED | `store_refresh_token` uses `jwt_refresh_token_expire_days` (7 days); `rotate_refresh_token` revokes old and issues new in one SQL call |
| SES-03 | 11-01-PLAN.md | Refresh token rotation uses atomic SQL (UPDATE...RETURNING) | SATISFIED | `auth_service.py` lines 143-153: single `UPDATE...RETURNING` statement |
| SES-04 | 11-01-PLAN.md | Reuse detection revokes all user refresh tokens when rotated-out token is replayed | SATISFIED | `auth_service.py` lines 164-179: revoked token triggers family-wide `UPDATE SET revoked=TRUE WHERE family_id=:fid` |
| SES-05 | 11-02-PLAN.md | Frontend uses singleton promise guard to deduplicate concurrent refresh calls | SATISFIED | `api.ts` lines 77-83: `refreshPromise` guard with `.finally()` reset |

No orphaned requirements found. All five SES-0x requirements claimed in plans are mapped in REQUIREMENTS.md Phase 11 and verified against implementation.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | No stubs, placeholders, empty implementations, or TODO markers found in any modified file |

Checked for: `TODO/FIXME`, empty returns (`return null`, `return {}`, `return []`), `console.log`-only implementations, hardcoded empty props. All clear.

Note: `refreshToken ?? localStorage.getItem('refresh_token')` in `getStoredRefreshToken()` is intentional fallback for page-load scenarios — not a stub.

### Human Verification Required

#### 1. Token Reuse Revocation Under Concurrent Load

**Test:** Use two browser tabs or two HTTP clients to simultaneously send the same refresh token to `/api/auth/refresh`. Verify that exactly one request succeeds (receives new tokens) and the second receives 401 "Refresh token reuse detected", and that no new valid tokens remain in the DB for the family.
**Expected:** One 200 response with new tokens; one 401 with reuse message; all tokens in the family are revoked in the DB.
**Why human:** Race condition behavior cannot be verified with static analysis. Requires live DB + concurrent HTTP clients.

#### 2. Proactive Refresh Timer Fires at 48-Minute Mark

**Test:** Set `jwt_access_token_expire_minutes` to a small value (e.g., 5 minutes), log in, and observe that `_doRefresh` is called approximately 4 minutes after login (80% elapsed).
**Expected:** Network tab shows a POST to `/api/auth/refresh` appearing at ~4 minutes without any user action or 401 error.
**Why human:** Requires running browser with real timers; cannot mock `setTimeout` behavior statically.

#### 3. Tab Restore Refresh Behavior

**Test:** Log in, minimize the browser tab for more than 48 minutes (or mock `Date.now` to simulate elapsed time), then restore the tab. Observe that a refresh call fires immediately.
**Expected:** POST to `/api/auth/refresh` on tab restore when token age exceeds 80% of lifetime; no 401 errors in subsequent API calls.
**Why human:** Requires real `visibilitychange` events and timer elapsed state in a running browser.

#### 4. Migration Applies Cleanly

**Test:** Run `alembic upgrade head` against a database that has migration 0004 applied (with existing refresh tokens in the table). Verify `family_id` column is added, existing rows receive UUID values, and the index is created.
**Expected:** Migration succeeds; `\d refresh_tokens` shows `family_id varchar(36) not null` with an index; existing rows have non-null UUIDs.
**Why human:** Requires a running PostgreSQL instance with `gen_random_uuid()` available.

### Gaps Summary

No gaps. All 11 observable truths are verified, all 5 artifacts are substantive and wired, all 4 key links are confirmed, and all 5 requirement IDs (SES-01 through SES-05) are fully satisfied by the implementation.

---

_Verified: 2026-03-25T05:00:00Z_
_Verifier: Claude (gsd-verifier)_

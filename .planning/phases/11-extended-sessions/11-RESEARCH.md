# Phase 11: Extended Sessions - Research

**Researched:** 2026-03-24
**Domain:** JWT refresh token rotation, atomic SQL, frontend singleton promise guard
**Confidence:** HIGH

## Summary

Phase 11 converts the existing JWT-based refresh token into an opaque 32-byte hex token, adds `family_id` grouping for reuse detection, implements atomic rotation via `UPDATE...RETURNING`, and wraps the frontend 401 interceptor in a singleton promise guard. All architecture decisions are locked in CONTEXT.md — research validates implementation patterns rather than exploring alternatives.

The current `auth_service.py` already stores hashed tokens and the WS ticket system already demonstrates the exact `UPDATE...RETURNING` atomic pattern needed. The current refresh path issues a new access token but does NOT rotate the refresh token — that is the core gap. The frontend `api.ts` already has a 401 retry loop but it calls `refreshAccessToken()` in a fire-and-forget way that can trigger duplicate concurrent refreshes.

**Primary recommendation:** Extend the existing `refresh_tokens` table with `family_id` (UUID, NOT NULL) and convert refresh token generation from `jwt.encode()` to `secrets.token_hex(32)`. All other changes are additive — no existing columns need modification.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Token Rotation Mechanics**
- Refresh tokens use opaque 32-byte hex format (not JWT) — DB lookup is authoritative, no need to decode
- Add `family_id` UUID column to `refresh_tokens` table — groups tokens in a rotation chain for reuse detection
- 0-second grace period (strict) — rotated token is immediately invalid; singleton guard (SES-05) prevents races
- Unlimited active refresh token families per user — each device/login creates a new family

**Frontend Refresh Behavior**
- Access token stays in-memory only (current behavior) — refresh token in localStorage handles reloads
- Refresh failure redirects to login immediately (current behavior) — simple and predictable
- Proactive refresh at 80% of access token lifetime (~48 min mark) — avoids 401 races entirely
- Refresh on tab visibility if token is past 80% lifetime — prevents stale-tab 401 cascade

**Session Lifecycle Edge Cases**
- Logout revokes current family only — other devices stay logged in; family_id scopes the revocation
- Each login creates a fresh token family — simple, no device tracking needed
- Old refresh tokens cleaned up on login + daily sweep of expired tokens — keeps table lean
- Same `/api/auth/refresh` endpoint returns both new access and new refresh tokens — frontend swaps atomically

### Claude's Discretion
- Internal implementation details of the singleton promise guard pattern
- Database migration ordering and naming
- Test structure and mocking approach
- Error message wording for token-related failures

### Deferred Ideas (OUT OF SCOPE)
- httpOnly cookie for refresh token storage (SEC-01 — future requirement)
- Token reuse detection security alert notification (SEC-02 — future requirement)
- Session management UI for viewing/revoking active sessions (SEC-03 — future requirement)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SES-01 | Access token expires after 1 hour (up from current ~30min) | Config change: `jwt_access_token_expire_minutes = 30` → `60`. Proactive refresh at 80% = ~48 min. |
| SES-02 | Refresh token expires after 7 days and silently rotates on use | Token already set to 7 days. Rotation requires opaque token switch + `UPDATE...RETURNING` in `refresh_access_token()`. |
| SES-03 | Refresh token rotation uses atomic SQL (UPDATE...RETURNING) to prevent race conditions | Exact pattern proven in `validate_ws_ticket()`. Same raw `text()` query pattern applies to refresh_tokens. |
| SES-04 | Reuse detection revokes all user refresh tokens when a rotated-out token is replayed | When `UPDATE...RETURNING` returns no rows for a non-revoked token, it means reuse: issue `UPDATE refresh_tokens SET revoked=true WHERE user_id=:uid`. |
| SES-05 | Frontend uses singleton promise guard to deduplicate concurrent refresh calls | `refreshPromise` module-level variable pattern in `api.ts` — if not null, await existing promise instead of issuing new fetch. |
</phase_requirements>

---

## Standard Stack

### Core (All Already In Use — No New Dependencies)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| SQLAlchemy 2 async | existing | ORM + raw text() for atomic SQL | `text()` already used in `validate_ws_ticket` |
| asyncpg | existing | PostgreSQL async driver | Required for SQLAlchemy async |
| PyJWT 2.x | existing | Access token encoding only | Refresh tokens switch to opaque hex — PyJWT no longer used for refresh |
| Python `secrets` | stdlib | `secrets.token_hex(32)` for opaque refresh tokens | Already used in `ws/protocol.py` |
| hashlib | stdlib | SHA-256 of opaque token for DB storage | Already used in `store_refresh_token` |
| Alembic | existing | DB migration for `family_id` column | Follows 0001-0004 pattern |

### Frontend (No New Packages)

| Pattern | Purpose | Notes |
|---------|---------|-------|
| Module-level `refreshPromise` | Singleton guard | Plain TypeScript, no library needed |
| `document.visibilitychange` | Tab-restore refresh trigger | Browser API, no library needed |
| `setInterval` | Proactive 80% lifetime refresh timer | Browser API, no library needed |

**Installation:** No new packages required for this phase.

---

## Architecture Patterns

### Opaque Refresh Token Generation

The current `create_refresh_token()` encodes a JWT with `sub`, `type`, and `exp`. Under the locked decision, refresh tokens become opaque 32-byte hex strings. Validation moves entirely to DB lookup.

```python
# Before (in auth_service.py)
def create_refresh_token(user_id: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {"sub": user_id, "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

# After
import secrets

def create_refresh_token() -> str:
    """Generate a cryptographically secure opaque 32-byte hex refresh token."""
    return secrets.token_hex(32)  # 64 hex chars; 256 bits of entropy
```

The `user_id` and `expires_at` move fully into the DB record. The `store_refresh_token` call must also accept and persist `family_id`.

---

### Atomic Token Rotation Pattern

The existing WS ticket atomic pattern in `validate_ws_ticket()` is the exact model:

```python
# Existing pattern (validate_ws_ticket) — proven atomic
result = await db.execute(
    text("""
        UPDATE ws_tickets
        SET used = TRUE
        WHERE ticket_id = :ticket_id
          AND used = FALSE
          AND expires_at > now()
        RETURNING user_id
    """),
    {"ticket_id": ticket_id},
)
row = result.fetchone()
```

The refresh rotation query follows the same pattern:

```python
# New rotate_refresh_token() atomic rotation
result = await db.execute(
    text("""
        UPDATE refresh_tokens
        SET revoked = TRUE
        WHERE token_hash = :token_hash
          AND revoked = FALSE
          AND expires_at > now()
        RETURNING user_id, family_id
    """),
    {"token_hash": hashlib.sha256(refresh_token_str.encode()).hexdigest()},
)
row = result.fetchone()
```

If `row is None`: the token either doesn't exist, is already revoked, or is expired. Distinguish reuse (token_hash exists but revoked=True) from expired by a separate lookup. If the hash exists and `revoked=True`, it's a reuse attack — revoke the entire family.

---

### Reuse Detection Pattern

After the atomic UPDATE returns no rows, check whether the token was seen before (indicating it was previously rotated out):

```python
# Reuse detection: if token_hash exists AND revoked=true, entire family is compromised
check = await db.execute(
    select(RefreshToken).where(RefreshToken.token_hash == token_hash)
)
existing = check.scalar_one_or_none()
if existing is not None and existing.revoked:
    # Reuse detected — revoke entire family
    await db.execute(
        text("""
            UPDATE refresh_tokens
            SET revoked = TRUE
            WHERE family_id = :family_id
        """),
        {"family_id": existing.family_id},
    )
    await db.commit()
    raise HTTPException(status_code=401, detail="Refresh token reuse detected")
```

This implements SES-04: presenting a rotated-out token revokes the entire family and forces re-login.

---

### Family ID Assignment

Every token in a rotation chain shares the same `family_id`. A new family starts on login or register:

```python
# On login/register: fresh family
family_id = str(uuid.uuid4())
await store_refresh_token(user_id, new_token, family_id, settings, db)

# On rotation: inherit family_id from the rotated token
new_token = create_refresh_token()
await store_refresh_token(user_id, new_token, existing_family_id, settings, db)
```

---

### Database Migration (0005)

The migration adds `family_id` as a UUID column to `refresh_tokens`. Because the column is NOT NULL but there are existing rows, use a two-step approach: add with a default, then (optionally) remove the default.

```python
# 0005_add_refresh_token_family.py
def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column(
            "family_id",
            sa.String(36),
            nullable=False,
            server_default=sa.text("gen_random_uuid()::text"),
        ),
    )
    op.create_index(
        "ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"], unique=False
    )
    # Remove server_default so new rows must supply family_id explicitly
    op.alter_column("refresh_tokens", "family_id", server_default=None)

def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "family_id")
```

`gen_random_uuid()` is available in PostgreSQL 13+ (pgcrypto extension not needed; it's a core function). This gives each existing row its own distinct family — existing tokens are unaffected.

---

### Config Change: Access Token Lifetime

In `config.py`, the default is `jwt_access_token_expire_minutes: int = 30`. Change the default to `60`:

```python
jwt_access_token_expire_minutes: int = 60  # SES-01: 1 hour
```

The frontend proactive refresh fires at 80% of token lifetime. Since the access token is a JWT, its `exp` claim can be decoded client-side without a signature check to compute the proactive timer.

---

### Frontend: Singleton Promise Guard (SES-05)

The current `refreshAccessToken()` in `api.ts` can be called concurrently because the `api()` function is not aware of an in-flight refresh. The guard pattern:

```typescript
// Module-level singleton
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise          // deduplicate concurrent callers
  refreshPromise = _doRefresh().finally(() => {
    refreshPromise = null                            // reset after completion
  })
  return refreshPromise
}

async function _doRefresh(): Promise<boolean> {
  const rt = getStoredRefreshToken()
  if (!rt) return false
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) { clearTokens(); return false }
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    clearTokens()
    return false
  }
}
```

All concurrent callers of `api()` that hit 401 simultaneously will share the same promise — only one fetch goes to the server. Because `setTokens()` updates both the in-memory `accessToken` and `localStorage`, all waiters see the new token when the guard resolves.

**Critical:** After `await refreshAccessToken()`, always read `getAccessToken()` fresh — never capture the token in a variable before the async boundary. The existing `api()` function does this correctly at line 51 (`headers.set('Authorization', \`Bearer ${accessToken}\`)`). This MUST remain as a read-through call, not a captured variable.

---

### Frontend: Proactive Refresh Timer

The access token lifetime is now 60 minutes. At 80% (48 min), the frontend proactively refreshes:

```typescript
// Decode JWT exp without verifying signature (safe for client-side timer only)
function getAccessTokenExpiry(): number | null {
  const token = getAccessToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp as number  // Unix timestamp in seconds
  } catch {
    return null
  }
}

function scheduleProactiveRefresh(): void {
  const exp = getAccessTokenExpiry()
  if (!exp) return
  const now = Math.floor(Date.now() / 1000)
  const lifetime = exp - now                       // remaining seconds
  const refreshAt = lifetime * 0.2                 // refresh when 20% remains (= 80% mark from issue)
  if (refreshAt <= 0) {
    refreshAccessToken()
    return
  }
  setTimeout(() => {
    refreshAccessToken().then((ok) => {
      if (ok) scheduleProactiveRefresh()           // reschedule for next rotation
    })
  }, refreshAt * 1000)
}
```

`scheduleProactiveRefresh()` is called once after `setTokens()` and re-arms itself on each successful rotation.

---

### Frontend: Tab Visibility Refresh

On `visibilitychange`, check if the token is past the 80% mark and refresh if so:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  const exp = getAccessTokenExpiry()
  if (!exp) return
  const now = Math.floor(Date.now() / 1000)
  const total = 60 * 60  // 3600s — known access token lifetime
  const issuedAt = exp - total
  const elapsed = now - issuedAt
  if (elapsed / total >= 0.8) {
    refreshAccessToken()
  }
})
```

This event listener should be registered once in `api.ts` at module load time, not inside React components.

---

### Logout: Family-Scoped Revocation

The current `revoke_refresh_token()` marks only the specific token hash as revoked. Under the new model, logout should revoke all tokens in the current family:

```python
async def revoke_refresh_token_family(refresh_token_str: str, db: AsyncSession) -> None:
    """Revoke all tokens in the same family as the provided token (logout)."""
    token_hash = hashlib.sha256(refresh_token_str.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored = result.scalar_one_or_none()
    if stored is not None:
        await db.execute(
            text("UPDATE refresh_tokens SET revoked = TRUE WHERE family_id = :fid"),
            {"family_id": stored.family_id},
        )
```

The router's `/logout` endpoint calls this instead of the single-token revoke.

---

### Token Cleanup on Login

On each successful login, expire (or delete) old revoked tokens for the user to keep the table lean:

```python
# After issuing new tokens in login handler / auth_service
await db.execute(
    text("""
        DELETE FROM refresh_tokens
        WHERE user_id = :uid
          AND (revoked = TRUE OR expires_at < now())
    """),
    {"uid": user_id},
)
```

This runs as part of the same transaction as the new token insert — no separate sweep needed for the immediate case. A separate daily sweep handles cross-user cleanup.

---

### Recommended File Change Summary

| File | Change |
|------|--------|
| `backend/app/models/refresh_token.py` | Add `family_id: Mapped[str]` column |
| `backend/alembic/versions/0005_add_refresh_token_family.py` | New migration — `family_id` column + index |
| `backend/app/services/auth_service.py` | Switch to opaque token generation; add atomic rotation; add reuse detection; add family-scoped revocation; add cleanup on login |
| `backend/app/routers/auth.py` | Update logout to use family-scoped revocation |
| `backend/app/config.py` | Change `jwt_access_token_expire_minutes` default from `30` to `60` |
| `frontend/src/lib/api.ts` | Add singleton promise guard; add `scheduleProactiveRefresh`; add `visibilitychange` listener |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cryptographically secure opaque tokens | Custom PRNG | `secrets.token_hex(32)` | stdlib, CSPRNG-backed, zero deps |
| Atomic read-modify-write | SELECT then UPDATE in app code | `UPDATE...RETURNING` single statement | SELECT-then-UPDATE has TOCTOU race; single statement is lock-safe in PostgreSQL |
| Concurrent request deduplication | Lock/mutex library | Module-level Promise singleton | JavaScript is single-threaded; a module-level variable is sufficient — no mutex needed |
| JWT decoding for timer | External JWT library | `atob(token.split('.')[1])` | Parsing `exp` for a timer is unverified read; no library needed |

---

## Common Pitfalls

### Pitfall 1: Capturing Access Token Before Async Boundary
**What goes wrong:** `const token = getAccessToken()` is captured, then `await refreshAccessToken()` runs and stores a NEW token, then `token` is sent — the request uses the old (401-causing) token.
**Why it happens:** JavaScript closures capture the value at time of assignment, not at time of use.
**How to avoid:** Always call `getAccessToken()` immediately before the `headers.set(...)` call, AFTER the await.
**Warning signs:** Intermittent 401 errors that loop; the second retry still fails.

### Pitfall 2: Two Separate SQL Writes for Token Rotation
**What goes wrong:** `SELECT` to read the token, then `UPDATE` to revoke it — two round trips. A concurrent request sees the token as not-revoked between the two statements and also succeeds.
**Why it happens:** Treating rotation as two separate operations rather than one atomic compare-and-swap.
**How to avoid:** Single `UPDATE...WHERE revoked=FALSE RETURNING *` — if no rows returned, rotation was lost to a concurrent caller.
**Warning signs:** Two new refresh tokens issued for the same session within milliseconds.

### Pitfall 3: Singleton Guard Not Resetting on Failure
**What goes wrong:** `refreshPromise` is set to a rejected or `false`-returning promise and never cleared. All subsequent calls to `refreshAccessToken()` instantly return the cached failure.
**Why it happens:** `.finally()` or reset not wired correctly.
**How to avoid:** Always reset `refreshPromise = null` in a `.finally()` block, not in `.then()` or `.catch()` only.
**Warning signs:** After a single failed refresh, the user can never refresh again until page reload.

### Pitfall 4: `gen_random_uuid()` Not Available
**What goes wrong:** Migration 0005 uses `gen_random_uuid()` as server_default but PostgreSQL version is < 13.
**Why it happens:** `gen_random_uuid()` became a core function in PostgreSQL 13 without pgcrypto.
**How to avoid:** Check PostgreSQL version, or use `uuid_generate_v4()` with pgcrypto, or backfill family_id from application code in a data migration step.
**Warning signs:** Migration fails with `function gen_random_uuid() does not exist`.

### Pitfall 5: Naive UTC vs Timezone-Aware Datetimes
**What goes wrong:** Comparing `stored.expires_at` (TIMESTAMP WITHOUT TIME ZONE, naive) with `datetime.now(timezone.utc)` (aware) raises a TypeError.
**Why it happens:** The existing `refresh_access_token()` already works around this with `.replace(tzinfo=timezone.utc)`. The new code must do the same, or use the `utcnow()` helper pattern used project-wide.
**How to avoid:** Use `datetime.now(timezone.utc)` consistently and strip tzinfo when comparing to naive DB values, OR use the `text()` SQL path (where `now()` is DB-side) to avoid Python comparison entirely.
**Warning signs:** `TypeError: can't compare offset-naive and offset-aware datetimes` in refresh endpoint.

### Pitfall 6: proactive refresh race with 401 interceptor
**What goes wrong:** Proactive refresh fires at 48 min. Simultaneously, a background TanStack Query refetch triggers at 50 min with the old token and gets a 401. The 401 interceptor also calls `refreshAccessToken()`. Without the singleton guard, two refresh calls go out.
**Why it happens:** The proactive timer and the 401 interceptor are independent code paths.
**How to avoid:** The singleton guard (SES-05) prevents the second call regardless of which path triggered first. Add the guard BEFORE adding the proactive timer.
**Warning signs:** Token rotation in rapid succession visible in server logs.

---

## Code Examples

### Verified Pattern: Atomic WS Ticket (Existing — Reuse for Refresh)
```python
# Source: backend/app/services/auth_service.py validate_ws_ticket()
result = await db.execute(
    text("""
        UPDATE ws_tickets
        SET used = TRUE
        WHERE ticket_id = :ticket_id
          AND used = FALSE
          AND expires_at > now()
        RETURNING user_id
    """),
    {"ticket_id": ticket_id},
)
row = result.fetchone()
if row is None:
    return None
return row[0]
```

### Verified Pattern: SHA-256 Token Hashing (Existing)
```python
# Source: backend/app/services/auth_service.py store_refresh_token()
token_hash = hashlib.sha256(token_str.encode()).hexdigest()
```

### Verified Pattern: secrets.token_hex (Existing)
```python
# Source: backend/app/ws/protocol.py new_msg_id()
return secrets.token_hex(16)  # Phase 11 uses token_hex(32) for 256-bit refresh tokens
```

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 11 |
|--------------|------------------|---------------------|
| JWT refresh tokens | Opaque tokens (DB-authoritative) | Eliminates risk of JWT secret leaking token validity; simpler validation path |
| Single token revocation on logout | Family-scoped revocation | Logout invalidates the chain, not just one token |
| No rotation | Rotate-on-use | Every use issues a fresh token; old tokens immediately invalid |
| SELECT then UPDATE | UPDATE...RETURNING | Removes TOCTOU race window entirely |

---

## Open Questions

1. **PostgreSQL version for `gen_random_uuid()`**
   - What we know: Available without pgcrypto in PostgreSQL 13+.
   - What's unclear: Minimum PostgreSQL version in production. Docker compose or deployment docs may specify.
   - Recommendation: Default to using `gen_random_uuid()` — it is PostgreSQL 13+ and the project is modern. If the migration fails in CI, fall back to a Python-side uuid4 default in the model definition and skip the server_default.

2. **`scheduleProactiveRefresh()` initial call site**
   - What we know: Must fire once on app load when a refresh token is already in localStorage (resume from prior session).
   - What's unclear: Whether to call it from `api.ts` module init, from `__root.tsx`, or from the login handler.
   - Recommendation: Call it from `setTokens()` so it arms on both login and successful refresh rotation. Also call it once on module load if `getStoredRefreshToken()` is non-null (covers tab restores before first API call).

3. **Daily cleanup sweep mechanism**
   - What we know: CONTEXT.md calls for a daily sweep of expired tokens across all users.
   - What's unclear: Whether to use a FastAPI startup background task, APScheduler, or a cron job.
   - Recommendation: This is Claude's discretion. A simple `asyncio` background task registered in `lifespan` is the lightest approach — no new dependency. Could be deferred to a follow-on task if it adds complexity to Phase 11 scope.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 11 is pure code and DB migration changes. No new external tools, services, or CLIs. PostgreSQL and asyncpg are already in use. No external service dependencies are introduced.

---

## Sources

### Primary (HIGH confidence — direct code inspection)
- `backend/app/services/auth_service.py` — current token creation, storage, and rotation behavior
- `backend/app/models/refresh_token.py` — current schema (no `family_id`, JWT-based tokens)
- `backend/app/routers/auth.py` — endpoint behavior, logout currently revokes only one token
- `backend/app/config.py` — `jwt_access_token_expire_minutes = 30` confirmed
- `backend/alembic/versions/0003_auth_teams.py` — migration style and column conventions
- `frontend/src/lib/api.ts` — 401 interceptor, current `refreshAccessToken()` (no singleton guard)
- `backend/app/ws/protocol.py` — `secrets.token_hex(16)` pattern confirmed in codebase

### Secondary (MEDIUM confidence)
- PostgreSQL docs: `gen_random_uuid()` is core in PostgreSQL 13+ (no pgcrypto needed) — standard knowledge, well-established
- OWASP Refresh Token Rotation guidance — reuse detection by family revocation is the standard recommendation

### Tertiary (LOW confidence — not independently verified in this session)
- `document.visibilitychange` behavior in iOS Safari tab restore — may have quirks; test on target browsers

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — atomic SQL pattern exists in codebase; singleton guard is well-understood JS pattern
- Pitfalls: HIGH — pitfalls documented in STATE.md and CONTEXT.md confirmed by code inspection

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain — JWT, PostgreSQL, TypeScript patterns)

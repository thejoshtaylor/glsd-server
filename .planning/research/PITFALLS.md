# Pitfalls Research

**Domain:** Ease-of-access additions to an existing FastAPI + React dashboard — JWT refresh rotation, WebSocket token refresh on reconnect, onboarding guide UX, simplified execute form
**Researched:** 2026-03-24
**Confidence:** HIGH (code-grounded; pitfalls derived directly from the existing codebase implementation rather than generic advice)

---

## Critical Pitfalls

### Pitfall 1: Refresh Token Rotation Creates a Replay Window Without Atomic DB Swap

**What goes wrong:**
Token rotation means: when `/api/auth/refresh` is called, issue a new refresh token AND revoke the old one in the same request. The current `refresh_access_token` in `auth_service.py` returns the same refresh token without rotation. When rotation is added, a naive implementation revokes the old token and inserts the new one as two separate DB writes. Under a mobile tab sleep + resume, a slow network retry, or a React StrictMode double-invoke, the client can call `/refresh` twice with the same token before the first call has committed. The second call sees the token as still valid (revoke hasn't committed yet), issues a second new token, and both tokens are now live with different claims. The old token is then marked revoked, but the second-issued token from the racy call is still active and orphaned from any local state.

**Why it happens:**
The existing code already handles single-use WS tickets correctly with `UPDATE...WHERE used=FALSE RETURNING` (atomic SQL). That pattern was not applied to refresh token rotation because the current system doesn't rotate. Developers adding rotation often reach for the simple "revoke old, insert new" approach without recognizing the race.

**How to avoid:**
Use a single atomic SQL statement for the rotation: `UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=:old_hash AND revoked=FALSE RETURNING user_id`. Only proceed with issuing the new token if `RETURNING` yields a row. If no row is returned, the token was already revoked — respond 401. This is exactly the same pattern as `validate_ws_ticket`. Add the new refresh token record in the same DB transaction before committing. Never revoke and insert in separate transactions.

**Warning signs:**
- Two simultaneous `/refresh` calls both return 200 with different access tokens
- A user gets logged out unexpectedly on mobile despite having a valid refresh token
- Database has two active (non-revoked) refresh tokens for the same user after a network blip

**Phase to address:** Phase 1 (Extended Sessions). The atomicity constraint must be designed in before any rotation code is written. Retrofitting it after the fact requires the same effort as doing it right the first time.

---

### Pitfall 2: WS Reconnect Token Refresh Race — Multiple Concurrent Refresh Calls

**What goes wrong:**
The current `useWebSocket` hook calls `/api/auth/ws-ticket` on each reconnect attempt. When the access token is expired, that call returns 401. The fix for INT-01 must: (1) detect the 401, (2) call `/api/auth/refresh`, (3) retry the ticket request. The race: the dashboard has a single WS connection (`useWebSocket` is mounted once in the layout), but the `api()` function in `api.ts` already has its own 401 → refresh → retry logic for REST calls. If any other REST query (TanStack Query invalidation fires on WS reconnect, which it does via `queryClient.invalidateQueries` in `wsStore.ts`) simultaneously detects a 401, both the WS reconnect path and the REST interceptor will call `/api/auth/refresh` concurrently. With rotation enabled, the first call rotates the token. The second call uses the now-invalidated old refresh token and gets a 401, which clears tokens and redirects to `/login` — logging the user out despite having a valid session.

**Why it happens:**
`api.ts` has a simple `refreshAccessToken()` function that is not guarded against concurrent calls. Each caller independently reads `getStoredRefreshToken()`, sends a refresh request, and writes back with `setTokens()`. There is no in-flight promise deduplication. With rotation, the first write invalidates the token the second caller just read.

**How to avoid:**
Add a singleton refresh promise to `api.ts`. When `refreshAccessToken()` is called while a refresh is already in-flight, return the existing promise instead of starting a new fetch. Example pattern:

```typescript
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  return refreshPromise
}
```

This ensures exactly one `/refresh` call runs at a time. All concurrent callers await the same result. Apply this fix in Phase 1 before rotation is enabled, because the bug is latent even without rotation — but rotation makes it catastrophic rather than merely suboptimal.

**Warning signs:**
- User is redirected to `/login` immediately after a tab comes back from sleep
- Network tab shows two simultaneous `POST /api/auth/refresh` requests on WS reconnect
- `clearTokens()` is called while the user still has a valid session (add a console.warn to detect this during development)

**Phase to address:** Phase 1 (Extended Sessions) — the singleton refresh guard must be in place before rotation is enabled. Also Phase 2 (WS Token Refresh) — the WS reconnect path must use the same guard.

---

### Pitfall 3: WS Ticket Fetch After Token Refresh Uses Stale In-Memory Token

**What goes wrong:**
`useWebSocket` reads the access token with `getAccessToken()` at the start of the `connect()` function. When the WS reconnect path detects a 401 from the ticket endpoint and refreshes the access token, `accessToken` in `api.ts` is updated in memory. However, if the reconnect path is written as:

```typescript
const accessToken = getAccessToken()  // captured before refresh
const refreshed = await refreshAccessToken()
// then uses old `accessToken` variable, not the updated in-memory value
const res = await fetch('/api/auth/ws-ticket', {
  headers: { Authorization: `Bearer ${accessToken}` }  // stale!
})
```

The ticket request after refresh still uses the old expired token because the local variable was captured before the refresh. The request will 401 again, triggering infinite reconnect attempts.

**Why it happens:**
JavaScript closure captures the value of `accessToken` at declaration time. `getAccessToken()` returns the current in-memory value — but the captured local variable does not update when `api.ts` writes a new value to its module-scoped `accessToken`.

**How to avoid:**
Always call `getAccessToken()` immediately before the fetch that uses it, never in a captured variable that may go stale across an async boundary. In the WS reconnect path: call `getAccessToken()` after awaiting `refreshAccessToken()`, not before. The ticket fetch helper should be written as:

```typescript
const token = getAccessToken()  // read AFTER refresh completes
const res = await fetch('/api/auth/ws-ticket', {
  headers: { Authorization: `Bearer ${token}` }
})
```

**Warning signs:**
- Browser Network tab shows the ws-ticket request after a refresh still sends an expired Bearer token
- WS reconnect loop runs indefinitely even after successful token refresh (401 on every ticket attempt)
- `reconnectAttempt` counter keeps climbing even though `/auth/refresh` is succeeding

**Phase to address:** Phase 2 (WS Token Refresh / INT-01 fix).

---

### Pitfall 4: Audit Page WS Fix (INT-02) Triggers Double Ticket Fetch on Tab Switch

**What goes wrong:**
INT-02 is that the audit page doesn't establish a WS connection on direct navigation. The fix is likely to ensure `useWebSocket` is mounted when the audit route is active. The current `useWebSocket` hook is already mounted in the dashboard layout (`routes/dashboard/route.tsx`), so all dashboard sub-routes should have it. The INT-02 bug is more specifically about the audit page not receiving live WS updates when navigated to directly (e.g., bookmark or deep link). A common fix attempt is to add a second `useWebSocket` call in the audit component itself "just to be safe." This causes two simultaneous WS connections for the same user, two ticket fetches, two `/ws/frontend` connections registered in `FrontendConnectionManager`, and broadcast duplication — every node status update fires twice.

**Why it happens:**
Developers diagnose "WS doesn't work on audit page" as "WS hook isn't running on audit page" and fix it by adding the hook to the component. The actual cause is usually that the WS hook effect deps array fires on mount but the access token isn't yet available (initial load from localStorage), or that the WS store state is initialized before the route is fully mounted.

**How to avoid:**
Keep `useWebSocket` in exactly one place: the dashboard layout. Debug INT-02 by instrumenting the existing hook to confirm whether it is connecting at all on direct navigation (check the Network tab for the `/ws/frontend` connection attempt). The likely real cause: `getAccessToken()` returns null on first render because the token hasn't been rehydrated from localStorage yet, so the `connect()` function returns early. Fix by adding token rehydration from localStorage before the first WS connect attempt, not by duplicating the hook.

**Warning signs:**
- Network tab shows two simultaneous `GET /ws/frontend?ticket=...` WebSocket connections for the same user
- Audit page receives every WS event twice (visible if logging WS messages to the console)
- `FrontendConnectionManager` logs show the same `user_id` with two registered connections

**Phase to address:** Phase 3 (Audit Page WS Fix / INT-02).

---

### Pitfall 5: 7-Day Refresh Token Accumulates Stale Records Without Cleanup

**What goes wrong:**
The current `RefreshToken` model has no index on `expires_at` and no cleanup job. With 30-minute access tokens, users rarely needed refresh tokens to persist long. With 7-day rotation, every login, every tab open, and every rotation event writes a new `refresh_tokens` row. Users who log in and out daily will accumulate ~7 revoked rows per week. This is manageable at small scale but compounds with the `token_hash` lookup on every refresh call — a full table scan if the index is missing. More importantly, if cleanup is never added, a year of usage produces thousands of rows per user, and the `WHERE token_hash = :hash AND revoked = FALSE` query degrades.

**Why it happens:**
The model was built for short-lived tokens where accumulation wasn't a concern. Token cleanup is treated as "later" work because it doesn't affect correctness immediately.

**How to avoid:**
Add a database migration that: (1) adds an index on `refresh_tokens(expires_at)` and (2) adds an index on `refresh_tokens(user_id, revoked)`. These are needed for the existing query `WHERE token_hash = :hash AND user_id = :user_id AND revoked = FALSE` to remain fast. In the same migration, add a cleanup trigger or background task that deletes rows where `expires_at < now() - interval '1 day'`. The simplest implementation: add a FastAPI startup hook that runs `DELETE FROM refresh_tokens WHERE expires_at < now()` on server start. A production system would use a periodic task (APScheduler or a cron), but the startup hook is sufficient for v1.

**Warning signs:**
- `refresh_tokens` table row count grows unboundedly — check with `SELECT COUNT(*) FROM refresh_tokens`
- Refresh endpoint latency increases as the table grows (missing index)
- Database size increases faster than expected relative to user count

**Phase to address:** Phase 1 (Extended Sessions). The migration with indexes and cleanup must ship with the 7-day token change, not as a follow-up.

---

### Pitfall 6: Frontend Token Storage Exposes Refresh Token to XSS via localStorage

**What goes wrong:**
The current `api.ts` stores the refresh token in `localStorage` (`localStorage.setItem('refresh_token', refresh)`). With 30-minute access tokens, a stolen refresh token gives an attacker 30-minute sessions indefinitely. With 7-day refresh tokens, a stolen refresh token is a 7-day persistent credential. Any XSS vulnerability anywhere in the application — including injected content from node output rendered in the stream panel — gives an attacker full persistent access.

**Why it happens:**
`localStorage` is the simplest storage mechanism and is already in use. The risk is proportional to token lifetime — short tokens make the tradeoff more acceptable. The jump to 7-day tokens changes the risk calculus significantly.

**How to avoid:**
The full fix (httpOnly cookies for refresh tokens) is a backend change with meaningful scope. For v1.2, the minimum viable mitigation is: ensure the stream panel renders node output as text (not as HTML) so injected script tags cannot execute. The codebase already uses React's JSX rendering for stream events (`AssistantText.tsx`, `ToolUse.tsx`), which escapes HTML by default — verify none of these components use `dangerouslySetInnerHTML`. Add this check to the "looks done but isn't" phase checklist. Defer httpOnly cookie migration to v1.3 as a dedicated security hardening milestone — it is a non-trivial change requiring CSRF token handling.

**Warning signs:**
- Any component using `dangerouslySetInnerHTML` with stream event data
- Node names, prompt text, or Claude output rendered via `innerHTML` assignment
- A future security audit flags the `localStorage` refresh token pattern

**Phase to address:** Phase 1 (Extended Sessions) — audit for `dangerouslySetInnerHTML` usage as a gate before enabling 7-day tokens. Flag httpOnly cookie migration as v1.3 scope.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `refreshPromise` singleton not added before rotation | Simpler initial implementation | Concurrent refresh calls revoke valid tokens on rotation; invisible during testing, catastrophic in production | Never — add the singleton guard atomically with rotation |
| Cleanup job deferred beyond v1.2 | Less scope | `refresh_tokens` table grows unboundedly; query degrades | Only acceptable if a cleanup migration with indexes ships in the same PR as 7-day tokens |
| Duplicate `useWebSocket` hook as INT-02 workaround | Appears to fix the symptom | Double WS connections; duplicated broadcast events; hard to debug | Never — fix the root cause (token rehydration timing) |
| Onboarding guide as a long prose document | Fast to write | Users don't read it; they try the first step and get stuck | Never — keep steps to 4-6 numbered actions maximum |
| Preset prompts hard-coded in the component | No backend work required | Useless presets if node projects differ from assumptions | Acceptable for v1.2 if presets are generic enough (e.g., "Explain the codebase") |
| `sessionId` field kept visible in simplified form | Preserves current functionality | Non-technical users are confused by session ID field | Hidden behind an "Advanced" toggle; never removed entirely |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FastAPI + SQLAlchemy async + rotation | Two separate DB writes for revoke + insert | Single transaction: atomic `UPDATE...RETURNING` to revoke, then `INSERT` for new token — both in same `AsyncSession` before `commit()` |
| TanStack Query + WS reconnect | Query invalidation on WS reconnect triggers REST 401 interceptor simultaneously with WS refresh | Singleton `refreshPromise` in `api.ts` deduplicates concurrent refresh attempts |
| WS ticket endpoint + expired access token | `useWebSocket` calls ticket endpoint without checking token freshness; 401 from ticket fetch is not retried with refreshed token | Explicit 401 handling in the WS connect path: detect 401, call `refreshAccessToken()`, re-read token with `getAccessToken()`, retry ticket fetch |
| `localStorage` refresh token + 7-day lifetime | Longer lifetime proportionally increases XSS impact | Audit all stream output rendering paths for `dangerouslySetInnerHTML` before enabling extended sessions |
| React `useEffect` + WS reconnect | Effect cleanup sets `unmounted = true`, but a queued `setTimeout` reconnect fires after unmount and calls `connect()`, which reads a stale closure | The existing code handles this via `if (unmounted) return` check inside `connect()` — preserve this guard when modifying the reconnect path |
| TanStack Router direct navigation + WS store | Store is initialized but WS connection has not been established yet when route component mounts | WS connection is managed in the layout route (`routes/dashboard/route.tsx`); direct navigation lands on the layout first, so the hook fires — INT-02 is likely a token rehydration timing issue, not a missing hook |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `refresh_tokens` table without `expires_at` index | Slow refresh endpoint as table grows | Add index in the same migration as 7-day token feature | Noticeable degradation above ~50k rows (small team: years; large team: months) |
| WS reconnect exponential backoff reset on tab focus | Reconnect delay stuck at 30s when user returns to a background tab | The existing code resets `reconnectAttempt.current = 0` on `ws.onopen` — preserve this; add a `visibilitychange` listener that triggers an immediate reconnect attempt when the tab becomes visible again | Every time a user switches away for >30s |
| Preset prompts causing large initial bundle | Presets embedded as a long array in the component file | Fine for v1.2; only becomes a concern if presets exceed ~100 items | Not a concern at expected scale |
| Onboarding guide with embedded code blocks not using monospace | Copyable command strings visually undetectable | Use `<code>` or monospace styling on all copyable commands; use the existing `--font-mono` CSS token | Always — incorrect rendering breaks the first-time user experience immediately |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Non-atomic refresh token rotation | Race condition allows concurrent calls to both succeed with different tokens; second token is orphaned but valid | Atomic `UPDATE...WHERE revoked=FALSE RETURNING` — same pattern as existing `validate_ws_ticket` |
| Refresh endpoint accepts used/rotated tokens without reuse detection | Token theft is silent — attacker reuses the rotated-away token before the legitimate client detects revocation | On rotation, if the presented token is already revoked, revoke ALL tokens for that user (reuse detection); log a security event. This is defense-in-depth — implement in Phase 1. |
| 7-day refresh token in `localStorage` with `dangerouslySetInnerHTML` in stream panel | XSS in stream output gives persistent 7-day access | Audit all JSX for `dangerouslySetInnerHTML` before enabling extended sessions; the React default (text nodes) is safe |
| WS ticket issued but never consumed (user navigates away before WS connects) | Tickets accumulate in `ws_tickets` table; not a security hole since they expire in 30s, but indicates a missing cleanup | Existing `validate_ws_ticket` handles expiry correctly; no action needed — just don't extend ticket lifetime |
| Logout does not revoke all user refresh tokens | User logs out but a stolen token (from another device) remains valid for 7 days | Current `revoke_refresh_token` only revokes the provided token. Add a `POST /api/auth/logout-all` endpoint that revokes all tokens for the user. Surface it in the UI as "Log out all devices." Not required for v1.2 MVP but flag as v1.3 scope. |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Onboarding guide with 10+ steps | Non-technical users abandon before completing setup; they cannot tell how far they are | Maximum 5-6 numbered steps. Group related actions (install + configure = one step). Show a clear end state ("your node will appear here") |
| Onboarding guide requires knowing a node ID before starting | First-time users have no node ID yet; the guide feels circular | Guide step 1 must be "generate a node ID" — provide the generation command, not "enter your node ID" |
| Simplified execute form hides session ID with no way to access it | Power users who use session continuity can no longer access the field | Hide session ID behind a visible "Advanced options" disclosure, not remove it. Label it "Resume previous session" with a plain-language tooltip |
| Preset prompts that match developer mental models, not user tasks | Non-technical users see "Run linter" and do not know what that means | Presets must be task-framed: "Explain this codebase to me", "Find and fix bugs in [project]", "Add tests for [project]". Avoid tool-framed presets |
| Copyable command in onboarding without a copy button | Users manually select and copy; on mobile this is error-prone; on desktop it feels unpolished | Use `navigator.clipboard.writeText()` behind a copy icon button next to each command block. The existing shadcn `Button` + Lucide `Copy` icon covers this with no new dependencies |
| Onboarding guide page accessible only from the nav — no contextual entry point | Users who connected their first node and are confused about what to do next have to discover the guide | Add a prompt in the empty state of the node grid ("No nodes yet? See the connection guide →") that links to the onboarding page |
| Silent WS reconnection — no user feedback during reconnect window | User dispatches an execute command while WS is reconnecting; the command is sent over REST but the subscription message cannot be sent (socket is null), so stream output never appears | Show a non-blocking banner when WS is disconnected: "Reconnecting... live updates paused." Disable the WS-dependent subscribe action on the execute form until the socket is OPEN. The existing `connected` state in `wsStore.ts` drives this |

---

## "Looks Done But Isn't" Checklist

- [ ] **Token rotation atomicity:** Confirm with a DB query that calling `/refresh` twice concurrently with the same refresh token produces exactly one new valid token and one 401, not two valid tokens.
- [ ] **Concurrent refresh deduplication:** Add a test that calls `refreshAccessToken()` twice simultaneously; assert only one network request is made and both callers receive the same result.
- [ ] **WS reconnect with expired token:** Expire the access token manually (or reduce `jwt_access_token_expire_minutes` to 0 in test env), disconnect the WS, wait for reconnect — verify the reconnect succeeds without user-visible logout.
- [ ] **Audit page INT-02:** Navigate directly to `/dashboard/audit` via the address bar (not via the nav link) with a fresh page load. Confirm the WS connection is established within 5 seconds and a subsequent node status change appears live.
- [ ] **Stale `refresh_tokens` cleanup:** After enabling 7-day tokens, verify the cleanup mechanism runs on server start and removes expired rows. `SELECT COUNT(*) FROM refresh_tokens WHERE expires_at < now()` should return 0 after restart.
- [ ] **`dangerouslySetInnerHTML` audit:** `grep -r dangerouslySetInnerHTML frontend/src/` must return zero results before 7-day tokens ship.
- [ ] **Onboarding guide usability:** Walk through the guide as a user who has never heard of GSD nodes. Can you get from step 1 to a connected node appearing in the dashboard without reading any external documentation?
- [ ] **Simplified form smoke test:** The session ID / advanced field must still be accessible (via disclosure or toggle). Dispatch an execute with a session ID to verify the resume-session flow still works end-to-end.
- [ ] **Preset prompts with empty project list:** Open the simplified form when a node has no configured projects. Confirm it degrades gracefully (no crash, appropriate placeholder or empty state).
- [ ] **Refresh token table indexes:** `\d refresh_tokens` in psql — confirm indexes exist on `(expires_at)` and `(user_id, revoked)` before deploying to production.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Non-atomic rotation causes token duplication in production | HIGH | Immediately add the atomic UPDATE...RETURNING guard; write a one-time migration that revokes all duplicate active tokens per user, forcing re-login; notify affected users |
| Concurrent refresh bug causes mass logout | MEDIUM | Deploy the singleton `refreshPromise` fix; affected users will see a login page — they re-authenticate with no data loss |
| Duplicate WS hook causes doubled audit entries or doubled stream events | LOW | Remove the extra hook from the component; test with a single WS connection; no data corruption since events are read-only on the frontend |
| Refresh token table grows large before index added | MEDIUM | Add index migration (non-blocking on PostgreSQL with `CREATE INDEX CONCURRENTLY`); run one-time cleanup of expired rows; zero downtime |
| Onboarding guide is abandoned as too complex | LOW | Shorten to ≤5 steps, add copy buttons, add contextual entry from empty state; no code changes needed to the rest of the system |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Non-atomic refresh token rotation | Phase 1: Extended Sessions | Concurrent refresh test returns exactly one valid token and one 401 |
| Concurrent refresh calls / refresh race | Phase 1: Extended Sessions | Single network request when two callers invoke `refreshAccessToken()` simultaneously |
| Stale token variable in WS reconnect path | Phase 2: WS Token Refresh | WS reconnects successfully after simulated token expiry; Network tab shows fresh Bearer token in ticket request |
| Duplicate WS hook from INT-02 misdiagnosis | Phase 3: Audit WS Fix | One WS connection in Network tab on direct navigation; no duplicated broadcast events |
| Missing `refresh_tokens` indexes and cleanup | Phase 1: Extended Sessions | `\d refresh_tokens` confirms indexes; row count stable after 24h of usage |
| `localStorage` XSS risk with 7-day tokens | Phase 1: Extended Sessions (audit gate) | `grep dangerouslySetInnerHTML frontend/src/` returns 0; logged as v1.3 httpOnly migration |
| Reuse detection absent from rotation | Phase 1: Extended Sessions | Presenting a rotated-away token returns 401 and revokes all user tokens |
| Onboarding guide too long / unclear | Phase 2: Onboarding Guide | Usability walkthrough by a non-technical observer completes without external help |
| Simplified form hides necessary fields | Phase 2: Execute Form | Session resume flow still works end-to-end; advanced field accessible |
| No WS reconnect feedback | Phase 2: WS Token Refresh | Disconnected banner appears within 1s; disappears on reconnect |

---

## Sources

- Codebase: `/backend/app/services/auth_service.py` — existing refresh token implementation (no rotation, no singleton guard)
- Codebase: `/backend/app/services/auth_service.py:validate_ws_ticket` — correct atomic pattern to replicate for rotation
- Codebase: `/frontend/src/lib/api.ts` — current `refreshAccessToken()` with no concurrency guard
- Codebase: `/frontend/src/hooks/useWebSocket.ts` — current reconnect path without token refresh on 401
- Codebase: `/frontend/src/stores/wsStore.ts` — `queryClient.invalidateQueries` on WS events (concurrent REST trigger)
- Codebase: `/backend/app/models/refresh_token.py` — no index on `expires_at`; no cleanup mechanism
- OWASP: Refresh token rotation and reuse detection — https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
- OWASP: Token storage in browsers — https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage
- Known issue INT-01 and INT-02: `/docs/PROJECT.md` — documented tech debt

---
*Pitfalls research for: v1.2 Ease of Access — JWT refresh rotation, WS token refresh, onboarding UX, simplified execute form*
*Researched: 2026-03-24*

# Project Research Summary

**Project:** GLSD Server v1.2 — Ease of Access
**Domain:** Remote node management dashboard — JWT auth hardening, WebSocket reliability, onboarding UX, execute form simplification
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

GLSD Server v1.2 is an additive milestone on a functioning FastAPI + React 19 dashboard. The base stack, auth system, WebSocket infrastructure, and UI component library are all already installed and validated — no new dependencies are required for any of the five milestone features. Research confirms this is primarily a logic completion milestone: the backend already has a `RefreshToken` model with a `revoked` boolean and `create_refresh_token`/`store_refresh_token` functions; the frontend already has `refreshAccessToken()` in `api.ts`; TanStack Router's layout route already provides the correct boundary for lifting `useWebSocket`. The gap between current state and the v1.2 target is measured in lines-of-code, not packages or migrations. The component count is 1 new file, 7 modified files, 0 DB migrations.

The recommended build order is sequential for the auth and WebSocket chain (backend rotation first, then frontend WS reconnect, then audit page WS fix) and parallel for the two independent UI features (onboarding guide page and simplified execute form). This order is dictated by a hard dependency: the WS token refresh fix (INT-01) must call `/auth/refresh` and expect a rotated response — if rotation is not in place, the reconnect fix will work intermittently on today's code and fail silently once rotation is enabled later.

The key risk is concurrency: refresh token rotation introduces three separate race conditions that must be designed out before the feature ships, not retrofitted after user reports. All three have concrete, established prevention patterns (atomic SQL `UPDATE...RETURNING`, singleton refresh promise, always-fresh `getAccessToken()` call after async boundaries). These are not speculative risks — they are confirmed code-level gaps in the existing `auth_service.py` and `api.ts` implementations. Addressing them in Phase 1 eliminates downstream risk in Phases 2 and 3.

## Key Findings

### Recommended Stack

No new packages are required for v1.2. All five features are implementable with the already-installed stack: `PyJWT>=2.9.0` and `SQLAlchemy[asyncio]>=2.0.44` on the backend; `@tanstack/react-router`, `@tanstack/react-query`, `zustand`, and scaffolded shadcn/ui components (`Tabs`, `Progress`, `Select`) on the frontend. The only configuration change is `jwt_access_token_expire_minutes: int = 30` to `60` in `config.py`. See STACK.md for the full feature-by-feature breakdown.

**Core technologies relevant to v1.2:**
- `PyJWT` + `SQLAlchemy async`: JWT creation/validation and `RefreshToken` DB model — rotation is additive to existing composable functions
- `useWebSocket.ts` custom hook: manages WS lifecycle with exponential backoff — patch in-place, do not replace with a library
- `TanStack Router` file-based routing: new onboarding route is a single new file; layout route is the correct WS hook boundary
- `shadcn/ui` (`Tabs`, `Select`, `Progress`): already scaffolded in v1.1, consumed for the first time in v1.2
- `navigator.clipboard.writeText()`: browser-native copy-to-clipboard — no npm package needed

### Expected Features

**Must have (table stakes — all required for v1.2 milestone):**
- Extended session duration (1hr access token + 7-day refresh rotation) — silent re-auth is baseline UX expectation; 15-minute tokens feel broken to users
- WebSocket reconnect refreshes expired token (INT-01) — reconnect with expired token currently reads as "app is broken" on tab resume
- Audit page WebSocket on direct navigation (INT-02) — bookmarks and deep links must work; this is table stakes for any web app
- Node onboarding guide page at `/dashboard/onboarding` — no-node users have no path to getting started without this
- Simplified execute form (preset prompts, project picker, plain-language labels) — blank form with machine-named fields fails non-technical users at first touch

**Should have (add after v1.2 validation):**
- Form state persistence for last-used node + project (localStorage) — eliminates repeated selection for returning users
- Onboarding checklist auto-completion detection (detect first node connect) — closes the "did it work?" loop
- Node-aware guide content showing real node IDs inline — reduces copy-paste errors from generic placeholders

**Defer to v2+:**
- Personalized saved prompt presets (per-user CRUD) — requires DB table, API endpoints, management UI
- Overlay onboarding tour (tooltip chain on dashboard) — wrong UX moment; static guide page covers same ground statelessly
- OAuth/SSO login — explicitly out of scope in PROJECT.md

### Architecture Approach

The v1.2 architecture impact is narrow: 1 new file, 7 modified files, 0 DB migrations. The existing system is a single-worker FastAPI backend behind Nginx with a React SPA using file-based TanStack Router. The WS architecture uses a two-stage auth pattern (REST ticket request then WS upgrade with single-use ticket UUID) that must not change. Token rotation is entirely server-side in `auth_service.py`. The WS reconnect fix is a 10-line addition to `useWebSocket.ts` plus a one-word export change in `api.ts`. Moving `useWebSocket()` to the dashboard layout route fixes INT-02 in 2 lines and makes all current and future dashboard routes automatically WS-enabled. See ARCHITECTURE.md for exact file locations, data flow diagrams, and the validated build order.

**Components and their change type:**
1. `backend/app/config.py` — Modified: access token expiry config (1-line change)
2. `backend/app/services/auth_service.py` — Modified: refresh token rotation logic (atomic revoke + insert)
3. `frontend/src/lib/api.ts` — Modified: export `refreshAccessToken` + singleton refresh promise guard
4. `frontend/src/hooks/useWebSocket.ts` — Modified: 401 retry path with token refresh before ticket re-fetch
5. `frontend/src/routes/dashboard/route.tsx` — Modified: move `useWebSocket()` to layout (INT-02 fix)
6. `frontend/src/components/execute/ExecuteForm.tsx` — Modified: preset prompts, project picker, label improvements
7. `frontend/src/routes/__root.tsx` — Modified: add onboarding nav link
8. `frontend/src/routes/dashboard/onboarding.tsx` — New: static step-by-step guide with copy-to-clipboard

### Critical Pitfalls

1. **Non-atomic refresh token rotation** — Use a single `UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=:hash AND revoked=FALSE RETURNING user_id` statement; only issue a new token if `RETURNING` yields a row. Two separate writes allow concurrent calls to produce two live tokens. This is the same pattern already used correctly in `validate_ws_ticket` — replicate it exactly.

2. **Concurrent refresh calls racing on rotation** — Add a singleton `refreshPromise: Promise<boolean> | null` guard in `api.ts`. Without it, a WS reconnect and a TanStack Query 401-intercept firing simultaneously will both call `/auth/refresh`; the second call presents the now-rotated-away token, gets a 401, clears all tokens, and the user is logged out. This guard must be in place before rotation is enabled.

3. **Stale access token variable in WS reconnect path** — Always call `getAccessToken()` after `await refreshAccessToken()` completes, never before. A local variable capturing the token before the async refresh boundary holds the expired value and causes an infinite 401 loop on ticket retry.

4. **Duplicate `useWebSocket` hook as INT-02 workaround** — Do not add `useWebSocket()` to `audit.tsx`. Adding it to the page component creates two simultaneous WS connections and duplicated broadcast events. Moving the hook to the layout (`route.tsx`) is the correct and complete fix.

5. **Missing DB indexes on `refresh_tokens` table** — Add indexes on `(expires_at)` and `(user_id, revoked)` in the same commit as 7-day tokens. Without these, query performance degrades as the table grows. Also add startup-time cleanup for expired rows (`DELETE FROM refresh_tokens WHERE expires_at < now()`). These ship with Phase 1, not as a follow-up.

## Implications for Roadmap

Based on the dependency analysis in ARCHITECTURE.md and the phase-to-pitfall mapping in PITFALLS.md, a 3-phase structure is recommended.

### Phase 1: Extended Sessions + Concurrency Safety
**Rationale:** Everything else depends on this. INT-01 (WS reconnect) calls `/auth/refresh` and expects a rotated response. The singleton `refreshPromise` guard must exist before any concurrent-refresh scenario is possible. DB indexes must ship with 7-day tokens. This phase has the highest risk concentration — building on rotation code that lacks the concurrency guard would make Phase 2 untestable in realistic browser conditions.
**Delivers:** Robust 1hr/7-day session lifecycle; atomic rotation; concurrent-refresh deduplication; DB indexes and expired-row cleanup; XSS pre-flight audit (`dangerouslySetInnerHTML` grep gate before enabling 7-day tokens)
**Addresses:** Extended session duration (FEATURES.md — Must Have)
**Files:** `config.py`, `auth_service.py`, `api.ts` (singleton guard + export)
**Avoids:** Non-atomic rotation race (Pitfall 1), concurrent refresh race (Pitfall 2), missing indexes (Pitfall 5), localStorage XSS audit gate (Pitfall 6)

### Phase 2: WebSocket Reliability (INT-01 + INT-02)
**Rationale:** With rotation live and the singleton guard in place, the WS reconnect fix is safe to implement. INT-02 (audit page) is a 2-line layout change. Both fixes land together as a "WS reliability" unit. The WS disconnection banner (non-blocking, driven by existing `wsStore.connected` state) should also land here — it directly addresses user confusion during the reconnect window.
**Delivers:** WS reconnect survives token expiry without user-visible logout; audit page works on direct navigation and bookmarks; optional: non-blocking "reconnecting" banner when WS is disconnected
**Addresses:** INT-01 and INT-02 (FEATURES.md — Must Have)
**Files:** `useWebSocket.ts` (401 retry block), `route.tsx` (layout-level hook)
**Avoids:** Stale token variable in retry path (Pitfall 3), duplicate hook misdiagnosis (Pitfall 4)

### Phase 3: UX Surface (Onboarding Guide + Execute Form)
**Rationale:** Both features are fully independent of the auth/WS chain and carry the lowest technical risk. They can be developed in parallel with Phases 1-2 if staffing allows, or sequentially after them. The onboarding guide should include a contextual entry point from the node grid empty state (a low-cost addition that significantly improves discoverability). The session ID field in the simplified execute form must remain accessible via an "Advanced options" disclosure — never removed entirely.
**Delivers:** `/dashboard/onboarding` step-by-step guide with copy-to-clipboard; simplified execute form with preset prompts, project picker, and plain-language labels; onboarding nav link in sidebar
**Addresses:** Onboarding guide page, simplified execute form (FEATURES.md — Must Have)
**Files:** `onboarding.tsx` (new), `__root.tsx` (nav link), `ExecuteForm.tsx`
**Avoids:** Onboarding guide too long/unclear — maximum 5-6 numbered steps, task-framed preset labels (Pitfall UX section); session ID field inaccessible (Pitfall UX section)

### Phase Ordering Rationale

- Phase 1 must precede Phase 2 because the WS reconnect retry path calls `/auth/refresh` — rotation semantics must be live and tested before the retry path is merged
- Phase 1's singleton `refreshPromise` guard must exist before Phase 2 because the WS reconnect and TanStack Query 401 interceptor can fire simultaneously on tab resume; without the guard, enabling the reconnect retry path with rotation active causes mass logout
- Phase 3 is fully independent and can be developed in parallel with Phases 1-2; the nav link and route should land after Phase 1 is stable so that a working auth session is guaranteed when users visit the onboarding page
- The PITFALLS.md "looks done but isn't" checklist should be treated as a Phase 1 exit gate — concurrent refresh deduplication and atomic rotation must be verified with targeted tests before Phase 2 builds on them

### Research Flags

Phases with well-documented patterns (research-phase not needed):
- **Phase 2 (WS Reliability):** Both INT-01 and INT-02 have precise root causes and fix locations identified in the codebase. Implementation is code completion with confirmed patterns, not design work requiring further research.
- **Phase 3 (UX Surface):** Static content, existing components, no new dependencies. Onboarding guide and execute form improvements follow established patterns. FEATURES.md includes curated preset prompt copy and UX pattern rationale.

Phases needing implementation-time verification (not additional research, but exit-gate testing):
- **Phase 1 (Extended Sessions):** The atomicity constraint and singleton guard patterns are well-understood, but correctness must be verified with concurrent-call testing before Phase 2 proceeds. The "looks done but isn't" checklist in PITFALLS.md defines the specific test assertions required.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Full source inspection confirmed all required packages are installed at compatible versions; no new dependencies identified; version compatibility table in STACK.md verified against package.json and requirements.txt |
| Features | HIGH | Five features crisply defined in PROJECT.md; table stakes vs. defer categorization grounded in existing user mental models, official auth patterns, and codebase constraints |
| Architecture | HIGH | Integration points confirmed by direct file inspection; component map (1 new file, 7 modified, 0 migrations) is based on actual code, not inference; build order validated against confirmed dependency chain |
| Pitfalls | HIGH | All six critical pitfalls are code-grounded — pointing to specific lines and functions in `auth_service.py`, `api.ts`, and `useWebSocket.ts`; not generic advice |

**Overall confidence:** HIGH

### Gaps to Address

- **httpOnly cookie migration for refresh tokens:** Research confirms the `localStorage` pattern is a known risk amplified by 7-day tokens. The v1.2 mitigation is an audit gate (`dangerouslySetInnerHTML` grep) not a structural fix. Schedule httpOnly cookie migration as a v1.3 security hardening milestone — it requires CSRF token handling and is a non-trivial scope addition that should not be squeezed into v1.2.
- **Token reuse detection (defense-in-depth):** PITFALLS.md recommends revoking all user tokens when a rotated-away token is presented (detecting potential session theft). This is beyond v1.2 MVP scope — flag for v1.3 alongside the httpOnly migration.
- **WS disconnection banner:** The `wsStore.connected` state already enables a non-blocking banner. This is a low-cost addition that prevents user confusion when executing with a disconnected socket. Consider including in Phase 2 even if not in the original v1.2 feature spec.
- **Visibility change reconnect trigger:** Adding a `visibilitychange` listener to trigger immediate WS reconnect when a backgrounded tab becomes visible is mentioned in PITFALLS.md. Not required for v1.2 but costs little to add during Phase 2 implementation.

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `/backend/app/services/auth_service.py` — rotation deferred with comment confirmed; composable `create_refresh_token` / `store_refresh_token` functions confirmed; atomic `validate_ws_ticket` pattern confirmed as the model to replicate
- `/backend/app/config.py` — `jwt_access_token_expire_minutes = 30` confirmed; `jwt_refresh_token_expire_days = 7` confirmed
- `/backend/app/models/refresh_token.py` — `revoked` field and `expires_at` confirmed; no index on `expires_at` confirmed
- `/frontend/src/lib/api.ts` — `refreshAccessToken` defined but not exported; no singleton concurrency guard
- `/frontend/src/hooks/useWebSocket.ts` — `if (!res.ok) return` at line 26 confirmed as INT-01 root cause
- `/frontend/src/routes/dashboard/route.tsx` — no `useWebSocket()` in layout confirmed as INT-02 root cause
- `/frontend/src/routes/dashboard/audit.tsx` — no `useWebSocket()` call confirmed
- `/frontend/package.json` — `tabs.tsx`, `progress.tsx`, `select.tsx` scaffolded; all required packages at current versions confirmed

### Secondary (HIGH confidence — official documentation)
- Auth0: Refresh Tokens — httpOnly cookie pattern, rotation semantics
- OWASP HTML5 Security Cheat Sheet — localStorage token storage risk assessment
- MDN Web Docs: `navigator.clipboard.writeText()` — browser support confirmed (Chrome 66+, Firefox 63+, Safari 13.1+)
- PyJWT 2.9.0 changelog — `jwt.encode()` / `jwt.decode()` API stable since 2.x

### Secondary (MEDIUM confidence — community and design sources)
- The Developer's Guide to Refresh Token Rotation (Descope) — rotation implementation patterns, reuse detection
- WebSocket Best Practices for Production Applications (WebSocket.org) — reconnect and auth token patterns
- Onboarding UX Best Practices 2025 (UX Design Institute) — dedicated page vs. modal wizard patterns
- Smart Interface Design Patterns: Onboarding UX — step count, checklist patterns, "first win" principle

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*

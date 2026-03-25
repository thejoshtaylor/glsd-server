# Stack Research

**Domain:** Ease of Access — extended JWT sessions, WS token refresh, onboarding page, simplified execute form
**Researched:** 2026-03-24
**Confidence:** HIGH

> **Scope note:** This document covers the v1.2 Ease of Access milestone only.
> The base stack (FastAPI, PostgreSQL, React 19, TanStack Router, Zustand, shadcn/ui, Tailwind v4)
> and the v1.1 cyberpunk UI additions are already validated and installed. This file addresses
> only what is NEW, CHANGED, or CONFIRMED NO-OP for the v1.2 features.

---

## Summary: No New npm or PyPI Packages Required

All five v1.2 features are implementable with what is already installed. The gaps are logic changes,
configuration value adjustments, and new route files — not dependency additions.

---

## What Is Already Installed (Relevant to v1.2)

| Package | Version | Relevance to v1.2 |
|---------|---------|-------------------|
| `PyJWT` | >=2.9.0 | JWT encode/decode — access + refresh token creation, already in use |
| `pwdlib[argon2]` | >=0.2.0 | Password hashing — no change needed |
| `pydantic-settings` | >=2.6.0 | `Settings` class in `config.py` — extend `jwt_access_token_expire_minutes` default only |
| `sqlalchemy[asyncio]` | >=2.0.44 | `RefreshToken` model exists; rotation adds UPDATE + INSERT in single transaction |
| `@tanstack/react-query` | ^5.95.2 | Query invalidation on token refresh — already wired in `api.ts` |
| `@tanstack/react-router` | ^1.168.3 | File-based routing — new onboarding route is a new file, no config change |
| `zustand` | ^5.0.12 | `wsStore` — no changes needed for INT-01 or INT-02 |
| `shadcn` (CLI) | ^4.1.0 | `Tabs` and `Progress` components are already scaffolded in `src/components/ui/` — no `npx shadcn add` needed |
| `lucide-react` | ^1.0.1 | Icons for onboarding page — existing barrel `icons.ts` pattern applies |
| `sonner` | ^2.0.7 | Toast for copy-to-clipboard confirmation on onboarding page |
| `date-fns` | ^4.1.0 | Already installed; not needed for v1.2 |

---

## Feature-by-Feature Stack Analysis

### 1. Extended JWT Sessions (1hr access + 7-day refresh rotation)

**What changes:** Two config defaults + one logic change in `auth_service.py`.

| File | Change | Notes |
|------|--------|-------|
| `backend/app/config.py` | `jwt_access_token_expire_minutes: int = 60` | Was 30. Change default; existing `SECRET_KEY` env var controls the actual secret. |
| `backend/app/services/auth_service.py` | `refresh_access_token()` — issue new refresh token, revoke old one atomically | The model and DB table already exist (`refresh_tokens`). Current implementation returns the same refresh token with no rotation. Add: `create_refresh_token()` + `store_refresh_token()` + `stored.revoked = True` inside the same request's DB transaction. |
| `backend/app/schemas/auth.py` | No change | `TokenResponse` already includes `refresh_token` field. |

**Why no new library:** `PyJWT` already handles JWT creation and validation. The `RefreshToken` SQLAlchemy model already has `revoked: bool` and `expires_at`. Rotation is a logic composition of functions that already exist.

**Alembic migration needed:** No — the `refresh_tokens` table schema is unchanged. The only behavioral difference is that a new row is inserted and the old row is marked `revoked=True` on each refresh call.

---

### 2. WebSocket Token Refresh on Reconnect (INT-01)

**Root cause:** `useWebSocket.ts` calls `getAccessToken()` at line 19 and passes it directly to the ws-ticket fetch. If the access token is expired, the ticket fetch returns 401 and the function returns early (line 26: `if (!res.ok) return`). No refresh is attempted. The reconnect loop then fires again after the backoff delay, hitting the same expired token.

**What changes:** One function in `frontend/src/hooks/useWebSocket.ts`.

| File | Change | Notes |
|------|--------|-------|
| `frontend/src/hooks/useWebSocket.ts` | Before fetching the ws-ticket, call `refreshAccessToken()` (already exported from `api.ts`) if `getAccessToken()` is present but stale | `refreshAccessToken()` is already implemented in `api.ts` — it calls `/api/auth/refresh`, calls `setTokens()` on success, and returns `boolean`. Import it and call it before the ws-ticket fetch. |

**Why no new library:** The refresh function, token storage, and retry path are already implemented in `api.ts`. This is a one-import, three-line change.

**Pattern:**
```typescript
// Before the ws-ticket fetch in connect():
const currentToken = getAccessToken()
if (currentToken) {
  // Proactively refresh if token may be near expiry, or attempt refresh on 401
}
// Alternative: attempt ticket fetch, handle 401 by refreshing then retrying once
```

The cleanest approach is: if the ticket fetch returns 401, call `refreshAccessToken()`, and if it succeeds, retry the ticket fetch once. This matches the pattern already used in `api()` for REST calls.

---

### 3. Audit Page WebSocket on Direct Navigation (INT-02)

**Root cause:** `useWebSocket()` is called only in `dashboard/index.tsx` (line 4, line 13). When a user navigates directly to `/dashboard/audit`, the dashboard index component never mounts, so the WebSocket is never established.

**What changes:** Move `useWebSocket()` call to a shared layout.

| File | Change | Notes |
|------|--------|-------|
| `frontend/src/routes/dashboard/route.tsx` | Call `useWebSocket()` in `DashboardLayout` | `DashboardLayout` is the layout component for all `/dashboard/*` routes. It renders an `<Outlet />` — any child route (index, audit, node detail, onboarding) mounts inside it. Adding `useWebSocket()` here ensures the socket is established regardless of which dashboard page is navigated to directly. |
| `frontend/src/routes/dashboard/index.tsx` | Remove `useWebSocket()` call | De-duplication — the layout now owns this. |

**Why no new library:** TanStack Router's layout route mechanism (`route.tsx`) is already the correct boundary for shared hooks. No additional routing package needed.

---

### 4. Onboarding Guide Page

**What's needed:** A new TanStack Router file-based route at `frontend/src/routes/dashboard/onboarding.tsx`.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Routing | New file `dashboard/onboarding.tsx` | TanStack Router file-based — `createFileRoute('/dashboard/onboarding')`. No router config change. |
| Layout | Inherits `DashboardLayout` from `route.tsx` | Sidebar + auth guard automatically applied. |
| UI components | `Tabs`, `Progress` (already in `src/components/ui/`), `Card`, `Badge`, `Button` | All scaffolded in v1.1. `Tabs` and `Progress` were noted as "scaffolded, not yet consumed" in PROJECT.md. This page consumes them. |
| Copy-to-clipboard | `navigator.clipboard.writeText()` — browser native API | No library. Show success toast via `sonner` (already installed). |
| Step-by-step instructions | Static content structured with `Tabs` | Steps are static markdown-equivalent content — no CMS, no MDX, no markdown parser needed. |
| Icons | Existing `icons.ts` barrel | Add `BookOpen`, `Copy`, `CheckCircle` to barrel if not already present — lucide-react already installed. |
| Nav entry | Add `<Link to="/dashboard/onboarding">` in `__root.tsx` sidebar nav | No router changes — just a new `<Link>` element. |

**No new packages needed.** The `Tabs` component required `npx shadcn add tabs` in v1.1 and is already present in `src/components/ui/tabs.tsx`. Same for `Progress`.

---

### 5. Simplified Execute Form with Presets and Project Picker

**What's needed:** Enhance `frontend/src/components/execute/ExecuteForm.tsx` — not a new component.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Preset prompts | Hardcoded array of `{ label: string, prompt: string }` objects in the component | No backend API needed for v1.2 presets. Static data is the right scope — dynamic presets are a future milestone feature if required. |
| Project picker styling | Replace bare `<select>` with shadcn `Select` component | `Select` is already in `src/components/ui/select.tsx` (installed v1.0). The current `ExecuteForm.tsx` uses a raw `<select>` element — upgrading to shadcn `Select` gives consistent cyberpunk styling and accessibility. |
| Plain-language labels | CSS/copy change — replace "Execute Command" header and raw placeholders | No library. Update label text in JSX. |
| Preset selector UX | shadcn `Select` for preset selection | Same component as project picker — shows a dropdown of preset options, fills textarea on selection. |
| Session ID field | Keep as optional advanced field | Simplification means hiding behind a disclosure or "Advanced" accordion — shadcn does not have a native Accordion but a simple `useState` toggle with a chevron icon (Lucide already installed) is sufficient without adding a new component. |

**No new packages needed.**

---

## Installation

No new installations required for v1.2.

```bash
# Nothing to install
# All required packages are already in frontend/package.json and backend/requirements.txt
```

---

## Configuration Changes (Not Code Library Changes)

| Location | Change | Why |
|----------|--------|-----|
| `backend/app/config.py` | `jwt_access_token_expire_minutes: int = 60` (was 30) | 1hr access token per v1.2 spec |
| `.env` (deployment) | No change required | `JWT_REFRESH_TOKEN_EXPIRE_DAYS` is already 7 — the default matches the v1.2 target |

---

## Alternatives Considered

| Feature | Considered | Rejected Because |
|---------|-----------|-----------------|
| Refresh token rotation | `authlib` library | PyJWT already handles all JWT operations; adding authlib for rotation logic would be an unnecessary dependency |
| Refresh token rotation | Redis token blocklist | Over-engineered for v1 — the `refresh_tokens` table with `revoked` boolean is already the correct approach for single-instance deployment |
| Onboarding content | MDX / `@mdx-js/react` | Static JSX is sufficient; MDX adds a parser dependency and build step for content that won't be edited by non-engineers |
| Onboarding content | Fetched from backend (DB-stored guide) | The guide describes how to connect a node — it is intrinsically tied to the server's own URL and configuration. Static content in the frontend is the right scope. |
| Preset prompts | Backend API endpoint returning presets | Premature generalization — static array in the component is simpler and the correct v1.2 scope |
| Copy to clipboard | `copy-to-clipboard` npm package | `navigator.clipboard.writeText()` is supported in all modern browsers and has no dependency cost |
| WS token refresh | `reconnecting-websocket` library | The existing custom `useWebSocket.ts` hook handles reconnect with exponential backoff correctly; adding a library would require replacing the hook entirely and loses the ws-ticket authentication flow |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `authlib` | Unnecessary for JWT + rotation; PyJWT covers all needs | PyJWT already installed |
| `react-markdown` or MDX | Onboarding content is static JSX — markdown parsing overhead is not justified | Plain JSX with shadcn Card/Tabs components |
| `copy-to-clipboard` npm package | 2KB dependency for one-liner browser API | `navigator.clipboard.writeText()` |
| `reconnecting-websocket` | Would replace the existing WS hook with a generic library that doesn't understand the ws-ticket auth pattern | Patch `useWebSocket.ts` directly |
| `axios` or similar HTTP client | `api.ts` already implements a typed fetch wrapper with 401 refresh logic | The existing `api()` function in `api.ts` |
| Additional shadcn components (accordion, collapsible) | Session ID "Advanced" toggle in execute form can be a simple `useState` + chevron | `useState` + `ChevronDown` Lucide icon already installed |

---

## Version Compatibility

All v1.2 changes operate within already-installed package versions. No compatibility concerns.

| Change | Operates Within |
|--------|----------------|
| Refresh token rotation logic | `PyJWT>=2.9.0` + `SQLAlchemy>=2.0.44` — both already installed and used for this exact purpose |
| `useWebSocket.ts` patch | `react@^19.2.4`, `zustand@^5.0.12` — no API surface change |
| New onboarding route | `@tanstack/react-router@^1.168.3` file-based routing — adding a file IS the config |
| `Tabs` component in onboarding | Already scaffolded in `src/components/ui/tabs.tsx` — no install |
| `Select` component in execute form | Already in `src/components/ui/select.tsx` — no install |

---

## Sources

- `/Users/josh/code/glsd-server/backend/app/services/auth_service.py` — Confirmed: `refresh_access_token()` exists with no rotation; `create_refresh_token()` and `store_refresh_token()` are both available as composable functions. `RevocationToken` model is in place.
- `/Users/josh/code/glsd-server/backend/app/config.py` — Confirmed: `jwt_access_token_expire_minutes: int = 30`; `jwt_refresh_token_expire_days: int = 7`.
- `/Users/josh/code/glsd-server/frontend/src/hooks/useWebSocket.ts` — Confirmed: INT-01 root cause at line 19 and 26 (no refresh before ticket fetch, early return on 401).
- `/Users/josh/code/glsd-server/frontend/src/routes/dashboard/route.tsx` — Confirmed: `DashboardLayout` renders `<Outlet />` — correct place for `useWebSocket()`.
- `/Users/josh/code/glsd-server/frontend/src/lib/api.ts` — Confirmed: `refreshAccessToken()` is implemented and exported; the 401-intercept pattern works for REST calls and is the model for WS fix.
- `/Users/josh/code/glsd-server/frontend/package.json` — Confirmed: `tabs.tsx`, `progress.tsx`, `select.tsx`, `dialog.tsx`, `tooltip.tsx` all scaffolded. `sonner`, `lucide-react`, `zustand`, `@tanstack/react-router` all installed at current versions.
- PyJWT 2.9.0 changelog — HIGH confidence: `jwt.encode()` / `jwt.decode()` API stable since 2.x.
- MDN Web Docs: `navigator.clipboard.writeText()` — HIGH confidence: supported in all modern browsers (Chrome 66+, Firefox 63+, Safari 13.1+).

---

*Stack research for: GLSD Server v1.2 Ease of Access*
*Researched: 2026-03-24*

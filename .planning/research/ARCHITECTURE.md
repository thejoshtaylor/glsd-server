# Architecture Research

**Domain:** GSD Server — v1.2 Ease of Access integration analysis
**Researched:** 2026-03-24
**Confidence:** HIGH (full source review of existing codebase)

---

## Context: What This Research Covers

This document answers: how do the four v1.2 feature areas integrate with the existing
architecture? It maps integration points, identifies what is new vs modified, and proposes
a build order based on dependency analysis.

---

## System Overview (Current State — v1.1)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TanStack Router + TanStack Query + Zustand)   │
│                                                                      │
│  Routes (file-based):                                                │
│  /login          /dashboard (auth guard)   /dashboard/$nodeId       │
│                  /dashboard/audit                                    │
│                                                                      │
│  Hooks:          Stores:         Lib:                                │
│  useWebSocket    wsStore         api.ts (token mgmt + fetch)         │
│  useVoiceRec                     queryClient.ts                      │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ HTTP + WebSocket
┌─────────────────────────▼───────────────────────────────────────────┐
│  Nginx (reverse proxy — /api + /ws + static assets)                  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│  FastAPI (single Uvicorn worker)                                      │
│                                                                      │
│  Routers: auth  nodes  teams  audit  transcribe  health              │
│  WS:      /ws/node (GSD nodes)    /ws/frontend (browser)            │
│  Services: auth_service  audit_service  team_service  node_service   │
│  WS layer: ConnectionManager + FrontendConnectionManager             │
│  Background: stale_node_scanner (asyncio task in lifespan)           │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ asyncpg (async only)
┌─────────────────────────▼───────────────────────────────────────────┐
│  PostgreSQL 16                                                        │
│  users  teams  team_members  nodes  instances  refresh_tokens        │
│  ws_tickets  stream_events  audit_log  node_teams                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Feature Integration Analysis

### Feature 1: Extended JWT Sessions (1hr access + 7-day refresh rotation)

#### Current state

`config.py`: `jwt_access_token_expire_minutes: int = 30` and
`jwt_refresh_token_expire_days: int = 7` (7-day already correct).

`auth_service.py` — `refresh_access_token()`: issues a new access token but returns the
same refresh token. Source comment: "Returns the same refresh token (no rotation) — rotation
is a v2 enhancement." The `RefreshToken` DB model already has `revoked: bool` and `expires_at`,
so the schema supports rotation without a migration.

`api.ts` — `refreshAccessToken()` already calls `setTokens(data.access_token, data.refresh_token)`,
which writes whatever the server returns to both memory and `localStorage`. Rotation is
transparent to the frontend as written.

#### Integration points — modified files

**`backend/app/config.py`** (1-line change):
Change `jwt_access_token_expire_minutes: int = 30` to `60`.

**`backend/app/services/auth_service.py`** — `refresh_access_token()`:
After validating the stored token, issue a new refresh JWT, insert a new `RefreshToken` row
via `store_refresh_token()`, mark the old record `revoked = True`, and return
`TokenResponse(access_token=new_access, refresh_token=new_refresh)`.
Both the revoke and the insert happen in the same SQLAlchemy session — no new transaction
management needed.

**No frontend changes. No DB migration.**

---

### Feature 2: WS Token Refresh on Reconnect (INT-01)

#### Current state

`useWebSocket.ts` — `connect()`:
1. Reads `getAccessToken()` (module-level variable in `api.ts`)
2. Calls `fetch('/api/auth/ws-ticket', { headers: { Authorization: Bearer ${token} } })`
3. If token is expired, the endpoint returns 401
4. **Bug:** `if (!res.ok) return` — silently abandons reconnect without attempting token refresh

The module-level `refreshAccessToken()` function in `api.ts` handles the full refresh dance
but is not exported, so `useWebSocket.ts` cannot call it.

#### Integration points — modified files

**`frontend/src/lib/api.ts`** — export `refreshAccessToken`:
Change `async function refreshAccessToken()` to
`export async function refreshAccessToken()`. One word change.

**`frontend/src/hooks/useWebSocket.ts`** — handle 401 on ticket fetch:
Import `refreshAccessToken` and add a retry block after the `!res.ok` check:

```typescript
if (res.status === 401) {
  const refreshed = await refreshAccessToken()
  if (!refreshed) return  // refresh token gone — let auth guard redirect
  const retryRes = await fetch('/api/auth/ws-ticket', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  })
  if (!retryRes.ok) return
  const { ticket } = await retryRes.json()
  // continue with ticket...
}
```

**No backend changes.**

---

### Feature 3: Audit Page WebSocket on Direct Navigation (INT-02)

#### Current state

`useWebSocket()` is called in `/dashboard/index.tsx` and `/dashboard/$nodeId.tsx` but NOT
in `/dashboard/audit.tsx`. Navigating directly to `/dashboard/audit` (bookmark, deep link,
or page refresh) means `wsStore.socket` is null for the entire session on that page. Node
status updates do not arrive, and navigating away to a node detail page causes a reconnect
delay.

#### Integration point — modified file (1 line)

**`frontend/src/routes/dashboard/route.tsx`** — add `useWebSocket()` to `DashboardLayout`:

```typescript
import { useWebSocket } from '@/hooks/useWebSocket'

function DashboardLayout() {
  useWebSocket()   // ADD: ensures WS is established for all dashboard children
  return <Outlet />
}
```

The hook already guards against duplicate connections
(`wsRef.current.readyState === WebSocket.OPEN`), so the existing calls in `index.tsx` and
`$nodeId.tsx` become redundant but harmless. They can be cleaned up later.

**No backend changes. No changes to `audit.tsx`.**

---

### Feature 4: Node Onboarding Guide Page

#### Current state

TanStack Router uses file-based routing under `frontend/src/routes/`. Adding a page requires
adding one file and one nav entry. The page is entirely static content — no new API endpoints,
no new stores, no backend changes.

Available shadcn components already scaffolded: `Dialog`, `Tooltip`, `Progress`, `Tabs` —
any of these can be used on the guide page without new dependencies.

#### Integration points

**New file: `frontend/src/routes/dashboard/onboarding.tsx`**
Route: `/dashboard/onboarding`. Content: step-by-step node setup guide with copyable commands.
Copy-to-clipboard is native browser API (`navigator.clipboard.writeText`) — no library needed.
The scaffolded `Tooltip` component can provide "Copied!" feedback.

**Modified: `frontend/src/routes/__root.tsx`** — add one `<Link to="/dashboard/onboarding">` in
the sidebar `<nav>` block alongside Dashboard and Audit Log.

**No backend changes.**

---

### Feature 5: Simplified Execute Form

#### Current state

`ExecuteForm.tsx` exposes:
- Project `<select>` — raw strings from `node.projects[]`
- Prompt `<textarea>` — free text, placeholder "Enter prompt..."
- Session ID `<Input>` — raw UUID input, label "Resume session ID (optional)"
- Voice button

Simplification targets (from v1.2 requirements): preset prompts, project picker improvements,
plain-language labels. The API payload shape (`node_id`, `project`, `work_dir`, `prompt`,
`session_id`) does not change.

#### Integration point — modified file

**`frontend/src/components/execute/ExecuteForm.tsx`** — local UI changes only:
- Add a preset prompts `<select>` or `<datalist>` that populates the textarea on selection
- Improve label copy (e.g. "Project" with a description tooltip rather than raw path)
- Rename "Resume session ID" to "Continue previous session" with an optional show/hide toggle
- The `Tabs` or `Dialog` components are already scaffolded if a two-panel UI is desired

**No backend changes. No new stores. No API shape changes.**

---

## Component Map: New vs Modified

| Component | File | Change Type | Notes |
|-----------|------|-------------|-------|
| Settings | `backend/app/config.py` | Modified | 1 line: 30 → 60 minutes |
| Auth service | `backend/app/services/auth_service.py` | Modified | Add rotation to `refresh_access_token()` |
| Auth router | `backend/app/routers/auth.py` | None | No changes needed |
| RefreshToken model | `backend/app/models/refresh_token.py` | None | Schema already supports rotation |
| Token lib | `frontend/src/lib/api.ts` | Modified | Export `refreshAccessToken` |
| WS hook | `frontend/src/hooks/useWebSocket.ts` | Modified | Handle 401 with refresh retry |
| Dashboard layout | `frontend/src/routes/dashboard/route.tsx` | Modified | Add `useWebSocket()` call |
| Audit page | `frontend/src/routes/dashboard/audit.tsx` | None | WS inherited from layout |
| Execute form | `frontend/src/components/execute/ExecuteForm.tsx` | Modified | Presets, label improvements |
| Onboarding page | `frontend/src/routes/dashboard/onboarding.tsx` | **New** | Static guide content |
| Root layout | `frontend/src/routes/__root.tsx` | Modified | Add onboarding nav link |

**New files: 1. Modified files: 7. DB migrations: 0.**

---

## Data Flow Changes

### Refresh Token Rotation (new behavior)

```
POST /api/auth/refresh { refresh_token: OLD_RT }
    │
    ▼ auth_service.refresh_access_token()
    ├─ jwt.decode(OLD_RT) → user_id
    ├─ SELECT refresh_tokens WHERE hash=sha256(OLD_RT) AND revoked=FALSE
    ├─ validate: not expired
    ├─ UPDATE refresh_tokens SET revoked=TRUE WHERE token_id=...
    ├─ create_refresh_token(user_id) → NEW_RT
    ├─ store_refresh_token(user_id, NEW_RT) → INSERT new row
    └─ return { access_token: NEW_AT, refresh_token: NEW_RT }

Client: setTokens(NEW_AT, NEW_RT) → localStorage.setItem('refresh_token', NEW_RT)
```

### WS Reconnect with Token Refresh (new path)

```
useWebSocket.connect()
  ├─ fetch POST /api/auth/ws-ticket  →  401 (access token expired)
  ├─ [NEW] refreshAccessToken()
  │     └─ fetch POST /api/auth/refresh  →  200 { NEW_AT, NEW_RT }
  │         └─ setTokens(NEW_AT, NEW_RT)
  ├─ fetch POST /api/auth/ws-ticket (retry)  →  200 { ticket }
  └─ new WebSocket(`/ws/frontend?ticket=${ticket}`)
```

### Audit Page WS Lifecycle (fixed)

```
Before (INT-02 present):
  Navigate to /dashboard/audit
  → DashboardLayout mounts (no WS hook)
  → AuditPage mounts
  → wsStore.socket === null for entire session

After (INT-02 fixed):
  Navigate to /dashboard/audit
  → DashboardLayout mounts
  → useWebSocket() called → ticket fetched → WS connected
  → AuditPage mounts
  → node_status_update events arrive → ['nodes'] query invalidated
```

---

## Architectural Patterns

### Two-Stage WS Auth: Ticket Retry Must Happen Before Handshake

The WS ticket pattern (REST auth → single-use UUID → WS URL param) is correct and must not
change. The v1.2 fix adds a token-refresh retry loop before stage 1 (the ticket request).
Never pass a refresh token to the WS handshake itself or as a WS message after connect.

### Layout-Level Hook Mounting

`useWebSocket` belongs at the highest shared layout boundary (`/dashboard/route.tsx`),
not at individual page level. This guarantees WS is alive for any dashboard route regardless
of navigation entry point. The hook's internal guard prevents duplicate connections.

### Rotation with Revoke-Then-Insert in Same Session

Both the `revoked = True` update and the new `RefreshToken` insert must happen in the same
SQLAlchemy session before commit. This prevents a window where both the old and new tokens
are simultaneously valid. The existing `refresh_access_token()` function already holds a
session passed from the router dependency — use it for both operations.

---

## Anti-Patterns to Avoid

### Sending Refresh Token Through the WS Handshake

Do not add a `refresh_token` query parameter to `/ws/frontend`. Tickets exist specifically
to avoid passing long-lived credentials in URLs. Fix token expiry in `connect()` before the
ticket request, not during or after the WS handshake.

### Per-Page useWebSocket Calls as the INT-02 Fix

Adding `useWebSocket()` to `audit.tsx` fixes INT-02 but leaves any future dashboard pages
vulnerable to the same bug. The correct fix is to move the call to the shared layout.

### DB Migration for Token Expiry Duration

The 1hr access token change is a config value only. Token expiry is embedded in the JWT
payload (`exp` claim) — it is not stored in PostgreSQL. No migration is needed.

### Deleting Old Refresh Token Records at Rotation

Keep revoked records. They provide audit trail for session compromise detection. Only set
`revoked = True`. Cleanup of old records can be a periodic job if storage becomes a concern,
but is out of scope for v1.2.

---

## Build Order

Auth changes must precede WS reconnect fix because the reconnect fix depends on the refresh
endpoint returning a rotated token (confirming the full refresh cycle works correctly).

```
Step 1: Extended sessions + token rotation (backend only)
  Files: config.py, auth_service.py
  Dependency: none — self-contained
  Test signal: POST /api/auth/refresh returns new refresh_token value each call

Step 2: WS token refresh on reconnect (frontend only)
  Files: api.ts (export), useWebSocket.ts (retry block)
  Dependency: Step 1 (rotation must be live before testing the full reconnect path)
  Test signal: Manually expire access token, verify WS reconnects without page reload

Step 3: Audit page WS fix (frontend layout)
  Files: dashboard/route.tsx
  Dependency: Step 2 (ensures reconnect is reliable for long-idle sessions)
  Test signal: Direct navigate to /dashboard/audit, confirm WS connected in store

Step 4: Onboarding guide page (frontend new route)
  Files: onboarding.tsx (new), __root.tsx (nav link)
  Dependency: none — fully independent, can be parallelized with steps 1-3
  Test signal: /dashboard/onboarding renders, nav link active

Step 5: Simplified execute form (frontend component)
  Files: ExecuteForm.tsx
  Dependency: none — independent UI change
  Test signal: Preset selection populates textarea, form still submits correctly
```

Steps 4 and 5 are independent of steps 1-3 and of each other. Steps 1 → 2 → 3 must be
sequential.

---

## Sources

- Source: `backend/app/services/auth_service.py` — rotation explicitly deferred with comment
- Source: `backend/app/config.py` — `jwt_access_token_expire_minutes = 30` confirmed
- Source: `backend/app/models/refresh_token.py` — `revoked` field confirmed, no migration needed
- Source: `frontend/src/hooks/useWebSocket.ts` — `if (!res.ok) return` is INT-01 root cause
- Source: `frontend/src/routes/dashboard/audit.tsx` — no `useWebSocket()` call confirms INT-02
- Source: `frontend/src/lib/api.ts` — `refreshAccessToken` defined but not exported
- Source: `frontend/src/routes/dashboard/route.tsx` — no WS hook in current layout

---

*Architecture research for: GLSD Server v1.2 Ease of Access*
*Researched: 2026-03-24*

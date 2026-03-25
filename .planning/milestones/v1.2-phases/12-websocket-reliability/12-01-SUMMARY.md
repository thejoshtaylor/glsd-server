---
phase: 12-websocket-reliability
plan: 01
subsystem: websocket
tags: [websocket, auth, reconnect, reliability, frontend, backend]
dependency_graph:
  requires: []
  provides: [WSR-01, WSR-02]
  affects: [frontend/src/hooks/useWebSocket.ts, backend/app/ws/frontend_router.py]
tech_stack:
  added: []
  patterns: [close-code-4001, singleton-refresh-guard, layout-level-ws]
key_files:
  created: []
  modified:
    - backend/app/ws/frontend_router.py
    - frontend/src/lib/api.ts
    - frontend/src/hooks/useWebSocket.ts
    - frontend/src/routes/dashboard/route.tsx
    - frontend/src/routes/dashboard/index.tsx
    - frontend/src/routes/dashboard/$nodeId.tsx
decisions:
  - "Close code 4001 used for auth failure (vs 1008) — client can distinguish auth vs network failures"
  - "refreshAccessToken called after refresh, getAccessToken() called after refresh to get fresh value — never capture token before async boundary"
  - "openSocket() extracted as local helper inside connect() to avoid WS setup duplication on 401 retry path"
  - "Layout-level useWebSocket() call in route.tsx — all /dashboard/* child routes get WS connection automatically"
metrics:
  duration: "8 minutes"
  completed: "2026-03-24"
  tasks: 2
  files: 6
requirements: [WSR-01, WSR-02]
---

# Phase 12 Plan 01: WebSocket Reliability Summary

**One-liner:** Auth-aware WS reconnect with close code 4001 and refresh token on expiry, plus layout-level WS connection for all dashboard routes including audit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Auth-aware WS reconnect with token refresh (WSR-01) | 19f194c | backend/app/ws/frontend_router.py, frontend/src/lib/api.ts, frontend/src/hooks/useWebSocket.ts |
| 2 | Move useWebSocket to layout route (WSR-02) | 9ac9b1d | frontend/src/routes/dashboard/route.tsx, frontend/src/routes/dashboard/index.tsx, frontend/src/routes/dashboard/$nodeId.tsx |

## What Was Built

### WSR-01: Auth-Aware WS Reconnect

Three coordinated changes fix the token-expiry reconnect failure (INT-01):

**Backend (`frontend_router.py`):** Changed close code from `1008` (Policy Violation) to `4001` (custom auth failure code). This gives the client a distinguishable signal for auth failure vs network disconnect.

**Frontend (`api.ts`):** Exported `refreshAccessToken()` function (was previously module-private). The singleton guard and `refreshPromise` deduplication from Phase 11 are preserved.

**Frontend (`useWebSocket.ts`):** Complete rewrite of `connect()` function with:
- Pre-connect check: if no access token, attempt `refreshAccessToken()` before giving up
- Ticket fetch 401 handling: refresh token and retry ticket fetch once with fresh token
- `openSocket(ticket)` local helper extracted to avoid duplicating WS setup code on retry path
- `onclose` handler: detects `event.code === 4001`, calls `refreshAccessToken()`, then reconnects with 500ms delay and resets backoff counter
- Normal exponential backoff (3s base, 30s max) unchanged for non-auth disconnects

### WSR-02: Layout-Level WS Connection

One-line change in `route.tsx` — `useWebSocket()` called in `DashboardLayout`. Removed duplicate calls from `index.tsx` and `$nodeId.tsx`. The `/dashboard/audit` page (and any future dashboard child routes) now automatically receive the WS connection on direct navigation.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Close code 4001 for auth failure | Distinguishable from 1008 (generic policy violation); custom codes 4000-4999 are application-defined per RFC 6455 |
| `getAccessToken()` called AFTER `refreshAccessToken()` | Never capture token in local var before async boundary — STATE.md pitfall |
| `openSocket()` local helper inside `connect()` | Avoids repeating WS setup logic in both normal and 401-retry paths |
| `useWebSocket()` in layout, not audit.tsx | Covers all dashboard child routes including future ones; audit.tsx already reads from wsStore |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or hardcoded values introduced.

## Self-Check: PASSED

- backend/app/ws/frontend_router.py: exists and contains `code=4001`
- frontend/src/lib/api.ts: exists and exports `refreshAccessToken`
- frontend/src/hooks/useWebSocket.ts: exists and references `refreshAccessToken` and `4001`
- frontend/src/routes/dashboard/route.tsx: contains `useWebSocket`
- frontend/src/routes/dashboard/index.tsx: contains 0 references to `useWebSocket`
- frontend/src/routes/dashboard/$nodeId.tsx: contains 0 references to `useWebSocket`
- Commits: 19f194c and 9ac9b1d verified in git log
- Frontend build: clean (tsc + vite, no TypeScript errors)

---
phase: quick
plan: 260324-wyk
subsystem: backend/ws, frontend/auth
tags: [bugfix, node-visibility, auth, stale-threshold]
dependency_graph:
  requires: []
  provides: [node-team-auto-assign, authReady-promise, stale-threshold-300s]
  affects: [backend/app/ws/handlers.py, backend/app/ws/health.py, frontend/src/lib/api.ts, frontend/src/routes/dashboard/route.tsx]
tech_stack:
  added: []
  patterns: [NodeTeam FK insert after session.flush, authReady module-level promise, async beforeLoad in TanStack Router]
key_files:
  created: []
  modified:
    - backend/app/ws/handlers.py
    - backend/app/ws/health.py
    - frontend/src/lib/api.ts
    - frontend/src/routes/dashboard/route.tsx
decisions:
  - Auto-assign to first team (select Team limit 1) — correct for single-admin setup; admin bootstrap always creates one team
  - authReady replaces bare fire-and-forget refresh block — single source of truth for module-load refresh
  - 300s stale threshold chosen as safe buffer above WS-ping keepalive cycle of 30s
metrics:
  duration: ~8 minutes
  completed: "2026-03-25T06:49:18Z"
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 260324-wyk: Fix Node Not Visible in Frontend / Fix Log

**One-liner:** Auto-assign new nodes to admin team via NodeTeam FK insert, export authReady promise to fix logout-on-refresh, increase stale threshold from 90s to 300s.

---

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Auto-assign new nodes to admin team; increase stale threshold | 8ccd680 | handlers.py, health.py |
| 2 | Fix logout-on-refresh by making route guard await auth refresh | 0532a8d | api.ts, route.tsx |

---

## What Was Done

### Task 1: Backend — Node Team Auto-Assign + Stale Threshold

**handlers.py:**
- Added `from app.models.node_team import NodeTeam` and `from app.models.team import Team` imports
- In `handle_node_register()`, inside the `is_new=True` block, after `session.add(node)`:
  - Call `await session.flush()` to satisfy the FK constraint on `node_teams.node_id`
  - Query `select(Team).limit(1)` to find the admin's personal team
  - Insert `NodeTeam(node_id=payload.node_id, team_id=first_team.team_id)` if a team exists
  - Log the assignment at INFO level

**health.py:**
- Changed `STALE_THRESHOLD_SECONDS = 90` to `STALE_THRESHOLD_SECONDS = 300`
- WS-level pings every 30s keep the TCP connection alive but do not update the application heartbeat; 300s gives 10x the ping interval as buffer

### Task 2: Frontend — authReady Promise + Async Route Guard

**api.ts:**
- Replaced the bare fire-and-forget module-level block (`if (getStoredRefreshToken()) { refreshAccessToken()... }`) with a named exported promise:
  ```typescript
  export const authReady: Promise<void> = getStoredRefreshToken()
    ? refreshAccessToken().then((ok) => { if (ok) scheduleProactiveRefresh() })
    : Promise.resolve()
  ```
- The old block fired but nobody awaited the result; the new export is awaitable by any consumer

**route.tsx:**
- Imported `authReady` from `@/lib/api`
- Changed `beforeLoad` to `async` and added `await authReady` before `getAccessToken()` check
- TanStack Router's `beforeLoad` supports async natively; the router waits for the promise before rendering

---

## Verification Results

All plan verification checks passed:
1. `NodeTeam` present in `backend/app/ws/handlers.py`
2. `300` present in `backend/app/ws/health.py`
3. `authReady` exported from `frontend/src/lib/api.ts`
4. `await authReady` present in `frontend/src/routes/dashboard/route.tsx`
5. `npx tsc --noEmit` — 0 errors
6. `npm run build` — build succeeded

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None.

---

## Self-Check: PASSED

- `backend/app/ws/handlers.py` — modified, NodeTeam/Team imports and flush+insert present
- `backend/app/ws/health.py` — modified, STALE_THRESHOLD_SECONDS=300
- `frontend/src/lib/api.ts` — modified, authReady exported
- `frontend/src/routes/dashboard/route.tsx` — modified, async beforeLoad with await authReady
- Commit 8ccd680 — verified in git log
- Commit 0532a8d — verified in git log

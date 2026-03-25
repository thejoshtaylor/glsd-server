---
phase: 11-extended-sessions
plan: 02
subsystem: auth
tags: [jwt, refresh-token, singleton, proactive-refresh, typescript, react]

# Dependency graph
requires:
  - phase: 11-extended-sessions-01
    provides: Backend refresh token rotation endpoint returning both new access_token and refresh_token

provides:
  - Singleton promise guard deduplicating concurrent refresh calls in api.ts
  - Proactive refresh timer firing at 80% of access token lifetime
  - Tab visibility listener refreshing stale tokens on tab restore
  - Module-level init re-arming refresh on page load with existing session

affects: [12-websocket-reconnect, auth, api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Singleton promise guard: refreshPromise = _doRefresh().finally(() => { refreshPromise = null })"
    - "Proactive timer: setTimeout at remaining*0.2 seconds (fires when 20% lifetime remains)"
    - "Tab restore check: elapsed/total >= 0.8 on visibilitychange"

key-files:
  created: []
  modified:
    - frontend/src/lib/api.ts

key-decisions:
  - "refreshPromise singleton guard prevents concurrent 401 retries from triggering multiple server-side rotations"
  - "scheduleProactiveRefresh called from setTokens — always rearmed on every token update (including from _doRefresh itself)"
  - "accessToken read fresh from module variable in api() 401 handler — never captured in local const before async boundary"
  - "total=3600 hardcoded in visibilitychange handler matches backend 1-hour access token lifetime"

patterns-established:
  - "Singleton guard pattern: store promise in module var, .finally() resets to null"
  - "Proactive timer: arm in setTokens, cancel in clearTokens — follows token lifecycle"

requirements-completed: [SES-05]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 11 Plan 02: Extended Sessions Summary

**Frontend refresh deduplication via singleton promise guard, proactive 80%-lifetime timer, and tab-restore visibility listener in api.ts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T04:32:03Z
- **Completed:** 2026-03-25T04:35:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `refreshPromise` singleton guard ensures concurrent 401 refresh calls share a single server request — prevents double-rotation under the strict 0-grace-period backend model
- Proactive refresh fires at 80% of access token lifetime (48-min mark for 1-hour tokens), preventing users from hitting 401s during normal usage
- Tab visibility listener triggers refresh when a restored tab has a token that is past 80% of its lifetime
- `setTokens` arms the proactive timer on every token update; `clearTokens` cancels it — timer follows token lifecycle exactly
- Module-level init on page load calls `refreshAccessToken()` then `scheduleProactiveRefresh()` if a stored refresh token exists

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Add singleton guard, proactive timer, visibility listener** - `c4b09f8` (feat)

## Files Created/Modified

- `frontend/src/lib/api.ts` - Singleton promise guard, `_doRefresh`, proactive refresh scheduler, visibility listener, module-level init

## Decisions Made

- Both tasks modify the same file and were implemented together in a single write, resulting in one commit that covers both tasks.
- `total = 60 * 60` (3600s) hardcoded in the visibility handler — matches the backend 1-hour access token lifetime set in Plan 01. Not read from a token claim to avoid complexity.
- `scheduleProactiveRefresh()` is called from `setTokens` which is called from `_doRefresh` after a successful refresh — this naturally re-arms the timer on every rotation without extra wiring.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled cleanly with zero errors (`npx tsc --noEmit` exit 0).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Frontend refresh deduplication is complete (SES-05 fully addressed)
- Phase 12 (WebSocket reconnect fix, INT-02) can now safely wire WS token refresh through `refreshAccessToken()` — the singleton guard prevents race conditions when both HTTP requests and WS reconnects attempt refresh simultaneously
- No blockers

---
*Phase: 11-extended-sessions*
*Completed: 2026-03-25*

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 13-ux-surface-01-PLAN.md
last_updated: "2026-03-25T06:55:00.000Z"
---

# STATE: GLSD Server

*Project memory. Updated at phase transitions and plan completions.*

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time
**Current focus:** Phase 14 — Project Management

---

## Current Position

Phase: 14
Plan: 2

## Performance Metrics

**Plans executed:** 29 (v1.0: 21, v1.1: 8)
**Phases completed:** 10 (v1.0: 7, v1.1: 3)
**Timeline:** 6 days (2026-03-20 → 2026-03-25)

---

## Accumulated Context

### Key Decisions Locked In

- **Single Uvicorn worker** — in-memory ConnectionManager cannot be shared across processes
- **asyncpg + SQLAlchemy 2 async** — blocking DB calls cascade into node timeouts; async-only
- **PyJWT 2.x + pwdlib** — python-jose and passlib are abandoned; do not use them
- **TanStackRouterVite first in plugins** — must precede react() and tailwindcss()
- **OKLCH tokens in `:root`/`.dark` only** — never in `@theme inline` block (avoids dark mode breakage bug #18296)
- **Lucide imports via `src/lib/icons.ts`** — direct paths only; barrel import slows dev server 5-8x
- **Naive UTC datetimes** — all DB columns use TIMESTAMP WITHOUT TIME ZONE; use `utcnow()` helper, never `datetime.now(timezone.utc)`
- **No `motion` library** — all animations via `tw-animate-css` and CSS `@keyframes` only
- **Admin bootstrap** — `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD` env vars seed admin on startup; flush User before Team (FK ordering)
- **skip_project_check=True** — bypass `conn.projects` check in `dispatch_execute` for project setup commands (clone/bootstrap) where project not yet registered on node
- **connect endpoint no-dispatch** — POST /api/projects/connect writes DB row only, no execute; `instance_id=None` in response
- **pg INSERT ON CONFLICT for project upsert** — re-registering same (node_id, name) pair updates work_dir; avoids UniqueConstraint error on reconnect

### Technical Pitfalls

- `@theme inline` bakes static values at build — add new tokens in `:root`/`.dark` raw CSS blocks only
- Animating `box-shadow` directly causes repaints — use pseudo-element opacity animation instead
- shadcn uses `data-slot` selectors — read component source before overriding; edit source directly
- Never add mount animations to stream output rows — causes animation queuing at >5 events/sec
- `SELECT DISTINCT` fails with JSON columns — use `.scalars().unique()` for Python-side dedup instead
- `session.add()` flush order is undefined — explicit `session.flush()` when FK ordering matters
- **v1.2 critical:** Refresh token rotation MUST use `UPDATE...RETURNING` (atomic); never two separate writes
- **v1.2 critical:** Add `refreshPromise` singleton guard in `api.ts` BEFORE Phase 12 WS reconnect fix
- **v1.2 critical:** Always call `getAccessToken()` AFTER `await refreshAccessToken()` — never capture token in local var before async boundary
- **v1.2 critical:** Move `useWebSocket()` to layout route (`route.tsx`) to fix INT-02 — do NOT add it to `audit.tsx`

### Blockers

*(none)*

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260324-jbe | Update root README, remove port exposures from docker-compose | 2026-03-24 | 86be4be | [260324-jbe-update-root-readme-remove-port-exposures](./quick/260324-jbe-update-root-readme-remove-port-exposures/) |
| 260324-pu8 | Add env variables for initial admin bootstrap on startup | 2026-03-25 | 4a2ce06 | [260324-pu8-add-env-variables-for-establishing-an-in](./quick/260324-pu8-add-env-variables-for-establishing-an-in/) |
| 260324-vml | Fix ExecuteForm TS null-safety errors for Docker build | 2026-03-25 | f39e628 | [260324-vml-fix-executeform-ts-null-safety-errors-fo](./quick/260324-vml-fix-executeform-ts-null-safety-errors-fo/) |
| 260324-wyk | Fix node not visible in frontend; fix logout-on-refresh; increase stale threshold | 2026-03-25 | 0532a8d | [260324-wyk-fix-node-not-visible-in-frontend-fix-log](./quick/260324-wyk-fix-node-not-visible-in-frontend-fix-log/) |
| 260325-009 | Fix node visibility: move NodeTeam auto-assign to run unconditionally after node upsert | 2026-03-25 | 5165704 | [260325-009-fix-node-visibility-frontend-not-showing](./quick/260325-009-fix-node-visibility-frontend-not-showing/) |

---
| Phase 11-extended-sessions P01 | 12 | 2 tasks | 5 files |
| Phase 11-extended-sessions P02 | 3min | 2 tasks | 1 files |
| Phase 12-websocket-reliability P01 | 8 | 2 tasks | 6 files |
| Phase 13-ux-surface P02 | 8 | 1 tasks | 1 files |
| Phase 13-ux-surface P01 | 8 | 2 tasks | 5 files |
| Phase 14-project-management P01 | 3min | 2 tasks | 8 files |

## Session Continuity

**Last session:** 2026-03-25T08:32:10Z
**Stopped at:** Completed 14-project-management-01-PLAN.md

Last activity: 2026-03-25 - Completed Phase 14 Plan 01: Backend project management layer (connect/clone/bootstrap endpoints, Project model, Alembic migration 0006, project_service, skip_project_check)

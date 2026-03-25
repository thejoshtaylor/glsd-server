---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: GSD Integration
status: roadmap_defined
stopped_at: Roadmap created — ready to plan Phase 14
last_updated: "2026-03-25T12:00:00.000Z"
---

# STATE: GLSD Server

*Project memory. Updated at phase transitions and plan completions.*

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time
**Current focus:** v1.3 GSD Integration — roadmap defined, ready to plan Phase 14

---

## Current Position

Phase: 14 — Project Management (not started)
Plan: —
Status: Ready to plan
Last activity: 2026-03-25 — v1.3 roadmap created

Progress bar: Phase 14 of 17 defined [ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░ ]

## Performance Metrics

**Plans executed:** 29 (v1.0: 21, v1.1: 8)
**Phases completed:** 13 (v1.0: 7, v1.1: 3, v1.2: 3)
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
- **v1.3: Additive stream enrichment only** — classification added as `gsd` sibling field on WS message; existing `data` field shape NEVER mutated
- **v1.3: AskUserQuestion via session-resume execute** — answer dispatch uses existing execute protocol with `session_id`; no new node-side protocol changes
- **v1.3: Auto sequencer on server, not frontend** — `asyncio.Event` per `instance_id`; keyed on `(node_id, sequence_id)` to isolate concurrent users
- **v1.3: Path validation on all project work_dir input** — `os.path.normpath` + reject `..`; never accept free-text path for dispatch

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
- **v1.3 critical:** Ship `InteractiveResponseUI` with status-aware teardown in the same PR — never ship prompt component without `instanceStatuses[instanceId]` nil-guard
- **v1.3 critical:** Broadcast `prompt_answered` to all user connections BEFORE forwarding `node_input` to node — prevents multi-tab duplicate submission
- **v1.3 critical:** Cancel all auto sequences for a node in `handle_unexpected_disconnect` — broadcast `sequence_error` to affected users

### Research Flags (v1.3)

- **Phase 15 (Stream Intelligence):** Freeform input wait — exact `system` event subtype for text-input blocking is MEDIUM confidence only. Capture raw NDJSON from a real `gsd discuss-phase` run before implementing the heuristic branch. Do not ship heuristic detection without this data.
- **Phase 17 (Auto Mode):** `asyncio.Event` registry memory management under long-running server not stress-tested. Verify cleanup paths on sequence cancellation before shipping.

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
| 260325-0bc | Fix SelectRootContext missing error in ExecuteForm; audit all frontend components | 2026-03-25 | ab0ca9c | [260325-0bc-fix-selectrootcontext-missing-error-and-](./quick/260325-0bc-fix-selectrootcontext-missing-error-and-/) |

---
| Phase 11-extended-sessions P01 | 12 | 2 tasks | 5 files |
| Phase 11-extended-sessions P02 | 3min | 2 tasks | 1 files |
| Phase 12-websocket-reliability P01 | 8 | 2 tasks | 6 files |
| Phase 13-ux-surface P02 | 8 | 1 tasks | 1 files |
| Phase 13-ux-surface P01 | 8 | 2 tasks | 5 files |

## Session Continuity

**Last session:** 2026-03-25T12:00:00Z
**Stopped at:** v1.3 roadmap created — ready to plan Phase 14

Last activity: 2026-03-25 - v1.3 GSD Integration roadmap defined (4 phases, 27 requirements mapped)

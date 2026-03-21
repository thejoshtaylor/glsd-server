---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-03-21T06:25:56.075Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# STATE: GLSD Server

*Project memory. Updated at phase transitions and plan completions.*

---

## Project Reference

**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time

**Current Focus:** Phase 01 — foundation

---

## Current Position

Phase: 01 (foundation) — COMPLETE (ready for verification)
Plan: 2 of 2 (all plans complete)

## Performance Metrics

**Plans executed:** 0
**Plans passed first try:** 0
**Repair cycles used:** 0

---

## Accumulated Context

### Key Decisions Locked In

- **Single Uvicorn worker** — in-memory ConnectionManager cannot be shared across processes; `--workers 1` enforced in Docker Compose from Phase 1
- **asyncpg + SQLAlchemy 2 async** — blocking DB calls in the event loop cascade into node timeouts; async-only patterns established in Phase 1 before any WebSocket code
- **Auth before `websocket.accept()`** — both `/ws/node` (Bearer token) and `/ws/frontend` (JWT ticket) validate credentials before accepting the WebSocket upgrade
- **Per-node asyncio.Lock** — prevents reconciliation race on concurrent reconnects; keyed by `node_id`
- **Stream events not persisted to DB** — only terminal state transitions written to PostgreSQL; stream events forwarded to frontend via asyncio queues only (STRM-05 resolved as frontend-side buffer)
- **PyJWT 2.x + pwdlib** — python-jose and passlib are abandoned; do not use them
- **EventRouter asyncio queue pattern** — per-connection asyncio queues with dedicated writer coroutines; never direct `websocket.send_text()` from EventRouter
- **alembic.ini static URL placeholder** — `sqlalchemy.url = %(DATABASE_URL)s` fails at configparser interpolation before env.py runs; use static placeholder, env.py overrides at runtime
- **Alembic enum lifecycle** — do NOT call `enum.create()` explicitly before `op.create_table()`; Alembic transactional DDL fires `_on_table_create` regardless of `create_type=False`, causing DuplicateObjectError; let `op.create_table()` create enums via column definition

### Architecture Notes

- Two WebSocket endpoints: `/ws/node` (GSD nodes) and `/ws/frontend` (browser clients)
- NodeRegistry: in-memory `node_id → WebSocket` map + PostgreSQL node metadata
- EventRouter: internal message bus; decouples routing from network I/O; team-scoped fan-out
- CommandBus: validates node connectivity + team ownership before dispatch
- Health Monitor: FastAPI lifespan background task; scans every 30s; marks stale at >90s

### Pitfalls to Watch

- `stream_event.data` is double-encoded JSON — always `json.loads(payload.data)` before inspection
- Multi-tenancy filters — every DB query for nodes/instances/users must include `WHERE team_id = ?`
- Pool size — default `pool_size=5, max_overflow=10` may be insufficient; make configurable via env var
- `node_id` binding — review server-spec for whether token-to-node_id binding is required

### Research Flags for Upcoming Phases

- **Phase 4** (EventRouter asyncio queue fan-out): nuanced async pattern — consider research pass before planning
- **Phase 4** (TanStack Router + TanStack Query + Zustand real-time integration): limited combined examples — consider research pass for useWebSocket hook design

### Todos

*(none yet)*

### Blockers

*(none)*

---

## Session Continuity

**Last session:** 2026-03-21T07:24:49Z
**Stopped at:** Completed 01-foundation/01-02-PLAN.md — Phase 01 all plans complete, ready for verification

---
*Last updated: 2026-03-21 after 01-02 execution*

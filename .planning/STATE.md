---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: Completed 06-frontend-production-deployment/06-01-PLAN.md
last_updated: "2026-03-23T23:03:28.925Z"
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 19
  completed_plans: 19
---

# STATE: GLSD Server

*Project memory. Updated at phase transitions and plan completions.*

---

## Project Reference

**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time

**Current Focus:** Phase 06 — frontend-production-deployment

---

## Current Position

Phase: 06 (frontend-production-deployment) — EXECUTING
Plan: 1 of 1

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
- **Atomic registration (03-02)** — User + Team + TeamMember created in single `db.flush()` within `register_user`; satisfies TEAM-01; session commit happens in get_db dependency
- **WS ticket atomic consumption (03-02)** — `validate_ws_ticket` uses raw SQL `UPDATE...WHERE...RETURNING` to prevent replay race; do not use read-then-write pattern
- **No refresh token rotation v1 (03-02)** — refresh endpoint returns same refresh token, issues new access token only; rotation is a v2 enhancement
- **Frontend CSS: index.css is shadcn target (04-02)** — shadcn init updates `src/index.css`; `src/main.css` created as copy so main.tsx imports it per plan spec; both contain Tailwind v4 `@import "tailwindcss"`
- **TanStackRouterVite first in plugins (04-02)** — must precede react() and tailwindcss() for route tree auto-generation; vite.config.ts enforces this order
- **tsconfig.json root needs paths for shadcn init (04-02)** — shadcn CLI reads root tsconfig.json for alias detection; both tsconfig.json and tsconfig.app.json require `paths: { "@/*": ["./src/*"] }`

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

**Last session:** 2026-03-23T23:03:28.919Z
**Stopped at:** Completed 06-frontend-production-deployment/06-01-PLAN.md

---
*Last updated: 2026-03-21 after 01-02 execution*

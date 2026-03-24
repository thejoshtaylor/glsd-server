---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: MVP
status: completed
stopped_at: Milestone v1.0 archived
last_updated: "2026-03-24T00:10:00.000Z"
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 21
  completed_plans: 21
---

# STATE: GLSD Server

*Project memory. Updated at phase transitions and plan completions.*

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-23)

**Core value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time
**Current focus:** v1.0 shipped — planning next milestone

---

## Current Position

Milestone: v1.0 (completed)
Next: `/gsd:new-milestone` to start v1.1

## Performance Metrics

**Plans executed:** 21
**Phases completed:** 7
**Timeline:** 4 days (2026-03-20 → 2026-03-23)

---

## Accumulated Context

### Key Decisions Locked In

- **Single Uvicorn worker** — in-memory ConnectionManager cannot be shared across processes; `--workers 1` enforced in Docker Compose from Phase 1
- **asyncpg + SQLAlchemy 2 async** — blocking DB calls in the event loop cascade into node timeouts; async-only patterns established in Phase 1 before any WebSocket code
- **Auth before `websocket.accept()`** — both `/ws/node` (Bearer token) and `/ws/frontend` (JWT ticket) validate credentials before accepting the WebSocket upgrade
- **Per-node asyncio.Lock** — prevents reconciliation race on concurrent reconnects; keyed by `node_id`
- **Stream events not persisted to DB** — only terminal state transitions written to PostgreSQL; stream events forwarded to frontend via asyncio queues only
- **PyJWT 2.x + pwdlib** — python-jose and passlib are abandoned; do not use them
- **EventRouter asyncio queue pattern** — per-connection asyncio queues with dedicated writer coroutines; never direct `websocket.send_text()` from EventRouter
- **alembic.ini static URL placeholder** — `sqlalchemy.url` uses static placeholder; env.py overrides at runtime
- **Alembic enum lifecycle** — let `op.create_table()` create enums via column definition; never call `enum.create()` explicitly
- **Atomic registration** — User + Team + TeamMember created in single `db.flush()`
- **WS ticket atomic consumption** — raw SQL `UPDATE...WHERE...RETURNING` to prevent replay race
- **No refresh token rotation v1** — rotation is a v2 enhancement
- **TanStackRouterVite first in plugins** — must precede react() and tailwindcss()

### Architecture Notes

- Two WebSocket endpoints: `/ws/node` (GSD nodes) and `/ws/frontend` (browser clients)
- NodeRegistry: in-memory `node_id -> WebSocket` map + PostgreSQL node metadata
- EventRouter: internal message bus; decouples routing from network I/O; team-scoped fan-out
- CommandBus: validates node connectivity + team ownership before dispatch
- Health Monitor: FastAPI lifespan background task; scans every 30s; marks stale at >90s

### Pitfalls to Watch

- `stream_event.data` is double-encoded JSON — always `json.loads(payload.data)` before inspection
- Multi-tenancy filters — every DB query for nodes/instances/users must include `WHERE team_id = ?`
- Pool size — default `pool_size=5, max_overflow=10` may be insufficient; make configurable via env var

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260323-sar | Create thorough README documentation for the repo | 2026-03-24 | 8ec96c8 | [260323-sar-create-thorough-readme-documentation-for](./quick/260323-sar-create-thorough-readme-documentation-for/) |

### Blockers

*(none)*

---

## Session Continuity

**Last session:** 2026-03-24
**Stopped at:** Completed quick task 260323-sar (README documentation)

---
*Last updated: 2026-03-24 after quick task 260323-sar completion*

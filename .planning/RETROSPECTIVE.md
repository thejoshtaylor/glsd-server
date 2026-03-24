# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-23
**Phases:** 7 | **Plans:** 21

### What Was Built
- Full GSD wire protocol v1.2.0 server with node lifecycle, reconciliation, health monitoring
- JWT auth with team-based multi-tenancy (personal teams, node ownership, cross-team isolation)
- Real-time React dashboard with WebSocket streaming, NDJSON rendering, execute/kill
- OpenAI Whisper voice-to-text for spoken prompt dispatch
- Append-only audit trail with filterable UI
- Production Docker Compose deployment (FastAPI + PostgreSQL + Nginx + React SPA)

### What Worked
- **Async-first from Phase 1** — establishing asyncpg + SQLAlchemy 2 async patterns before any WebSocket code prevented retrofitting
- **Auth before `websocket.accept()`** — validating credentials before upgrade is cleaner and more secure than post-accept auth
- **EventRouter asyncio queue pattern** — per-connection queues with dedicated writer coroutines cleanly decoupled routing from network I/O
- **Gap closure phases (6-7)** — running a milestone audit before completing identified real gaps that would have shipped as bugs
- **Protocol spec as source of truth** — having `protocol-spec.md` and `server-spec.md` made Phase 2 planning highly efficient

### What Was Inefficient
- **SUMMARY.md frontmatter gaps** — only 13/67 requirements listed in `requirements_completed` fields; documentation debt accumulated across all phases
- **Phase 5 plan count mismatch** — roadmap said "2/3 plans executed" even though all 3 completed; status tracking fell out of sync
- **shadcn init friction** — Phase 4 hit a blocking issue with shadcn CLI not detecting Tailwind config; workaround required manual investigation
- **Duplicate CSS files** — `index.css` and `main.css` both exist as shadcn artifacts; dead code that should have been cleaned up immediately

### Patterns Established
- Two WebSocket endpoints with different auth schemes (`/ws/node` Bearer token, `/ws/frontend` JWT ticket)
- Per-node asyncio.Lock for reconciliation race prevention
- Atomic registration (User + Team + TeamMember in single flush)
- WS ticket atomic consumption via raw SQL `UPDATE...WHERE...RETURNING`
- TanStackRouterVite must be first in Vite plugins array
- `alembic.ini` uses static placeholder URL; `env.py` overrides at runtime

### Key Lessons
1. **Run milestone audits before completion** — the audit found 6 gaps that required 2 additional phases; without it, v1.0 would have shipped with missing frontend deployment and no auth guards
2. **Stream events shouldn't skip persistence** — frontend-only buffer means stream history is lost on page refresh; revisit for v1.1
3. **WebSocket reconnect must handle token refresh** — INT-01 proves that WS reconnect logic needs to go through the same auth flow as REST calls
4. **Single-worker constraint is load-bearing** — in-memory ConnectionManager + EventRouter depend on it; horizontal scaling requires Redis pub/sub

### Cost Observations
- Sessions: ~10+ across 4 days
- Notable: 7 phases in 4 days is very fast; protocol spec + server spec as inputs made planning efficient

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 21 | First milestone — established all patterns |

### Top Lessons (Verified Across Milestones)

1. Run milestone audits — they catch real gaps (verified v1.0: found 6 gaps → 2 additional phases)
2. Async-first DB patterns prevent painful retrofitting (verified v1.0: zero async issues after Phase 1)

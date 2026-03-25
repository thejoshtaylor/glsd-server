# Milestones

## v1.1 Cyberpunk Beautification (Shipped: 2026-03-25)

**Phases completed:** 3 phases, 8 plans, 15 tasks

**Key accomplishments:**

- One-liner:
- glow-amber/glow-red CSS utilities, centralized 21-icon barrel module, four scaffolded shadcn components (dialog, tooltip, progress, tabs), and project-wide Lucide import migration to @/lib/icons
- NodeStatusBadge.tsx
- All three plain-text loading states replaced with Skeleton shimmer layouts that mirror each view's content shape — NodeGrid (3-card grid), InstanceList (4-row list), $nodeId route (title bar + info grid + tall panel).
- One-liner:
- One-liner:

---

## v1.0 MVP (Shipped: 2026-03-23)

**Phases completed:** 7 phases, 21 plans
**Timeline:** 4 days (2026-03-20 → 2026-03-23)
**Commits:** 106 | **LOC:** ~6,300 (3,600 Python + 2,700 TypeScript)

**Key accomplishments:**

1. Full GSD wire protocol v1.2.0 server — node lifecycle, command dispatch, state reconciliation, health monitoring
2. JWT authentication with team-based multi-tenancy — personal teams, node ownership, cross-team data isolation
3. Real-time React dashboard with WebSocket streaming, NDJSON rendering, execute/kill controls
4. OpenAI Whisper voice-to-text integration for spoken prompt dispatch
5. Append-only audit trail with filterable, paginated dashboard UI
6. Production Docker Compose deployment — FastAPI + PostgreSQL + Nginx serving React SPA

**Known Gaps (carried to v1.1):**

- INT-01 (High): WebSocket reconnect does not refresh expired access tokens
- INT-02 (Low): Audit page does not establish WebSocket connection on direct navigation
- 7 minor documentation/cleanup items (see v1.0-MILESTONE-AUDIT.md)

---

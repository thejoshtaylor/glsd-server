# Milestones

## v1.3 GSD Integration (Shipped: 2026-03-25)

**Phases completed:** 4 phases, 10 plans, 16 tasks

**Key accomplishments:**

- FastAPI project management layer with PostgreSQL persistence: connect/clone/bootstrap endpoints, path traversal validation, and idempotent upsert via INSERT ON CONFLICT
- React project management UI with ProjectManager panel, three action dialogs (connect/clone/bootstrap), and ExecuteForm work_dir resolution from DB via projectMap with fallback
- 1. [Rule 1 - Bug] Type alias syntax compatibility
- GsdClassification type
- asyncio.Event-based server sequencer with SequenceRegistry enabling sequential GSD command dispatch with /clear between steps and manual-advance pause support
- 1. [Rule 3 - Blocking] Applied 17-02 prerequisite changes to worktree

---

## v1.2 Ease of Access (Shipped: 2026-03-25)

**Phases completed:** 3 phases, 5 plans, 5 tasks

**Key accomplishments:**

- Opaque hex refresh tokens with atomic UPDATE...RETURNING rotation, family-based reuse detection, and family-scoped logout revocation replacing the previous no-rotation JWT approach
- Frontend refresh deduplication via singleton promise guard, proactive 80%-lifetime timer, and tab-restore visibility listener in api.ts
- One-liner:
- Onboarding page
- shadcn Select project picker, 5-option preset prompt selector, plain-language labels, and Advanced details disclosure replacing raw HTML form elements in ExecuteForm

---

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

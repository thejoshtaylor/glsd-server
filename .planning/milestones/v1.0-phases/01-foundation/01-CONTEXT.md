# Phase 1: Foundation - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the Docker Compose infrastructure, PostgreSQL database schema with all tables, Alembic migration pipeline, FastAPI application skeleton with async patterns, and environment-variable-based configuration. No business logic, no WebSocket handlers, no authentication — just the runnable skeleton that every subsequent phase builds on.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key areas include:
- FastAPI project structure and module layout
- SQLAlchemy model organization
- Alembic configuration approach
- Docker Compose service naming and networking
- Development vs production configuration split

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `protocol-spec.md` — Wire protocol v1.2.0 defining all message types and data models
- `server-spec.md` — Server backend specification with data models, WebSocket behavior, and state management
- `REQUIREMENTS.md` — Full requirements list with DEPLOY-01, DEPLOY-02, DEPLOY-03 mapped to this phase

### Established Patterns
- No existing code patterns yet — this is the first phase, greenfield project

### Integration Points
- Database schema must support all models from server-spec.md (nodes, instances, users, teams, team_members, audit_log)
- FastAPI app must be structured for WebSocket endpoint addition in Phase 2
- Alembic migrations run at container startup before app starts

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

# Phase 6: Frontend Production Deployment - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Serve the built React SPA alongside the FastAPI backend via Docker Compose. Add an Nginx service that serves static frontend assets and proxies API/WebSocket traffic to the backend. No new features — pure deployment infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml` — existing services: `api` (FastAPI on port 8000) and `db` (PostgreSQL 16)
- `backend/Dockerfile` — Python 3.12-slim, pip install, entrypoint.sh + gunicorn
- `frontend/package.json` — Vite 8, React 19, build script: `tsc -b && vite build`

### Established Patterns
- Backend runs via gunicorn with single UvicornWorker on port 8000
- Docker Compose uses `.env` file for configuration
- Backend has an `entrypoint.sh` that runs Alembic migrations before starting

### Integration Points
- API routes are at `/api/` prefix
- WebSocket endpoints: `/ws/node` and `/ws/frontend`
- Frontend dev currently runs standalone via `vite dev`
- No Nginx config exists yet — needs to be created

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---
phase: 06-frontend-production-deployment
plan: 01
subsystem: infra
tags: [docker, nginx, react, vite, spa, websocket, proxy]

# Dependency graph
requires:
  - phase: 04-dashboard-and-streaming
    provides: React SPA frontend source in frontend/ directory with Vite build setup
  - phase: 01-foundation
    provides: docker-compose.yml with api and db services
provides:
  - Multi-stage Dockerfile that builds the React SPA and serves it via Nginx
  - Nginx reverse proxy config for /api/ and /ws/ with WebSocket upgrade headers
  - Complete docker-compose.yml with db + api + frontend services
  - Single-command full-stack startup via docker-compose up
affects: [deployment, production, docker-compose]

# Tech tracking
tech-stack:
  added: [nginx:1.27-alpine, node:22-alpine (build stage)]
  patterns: [multi-stage Docker build, Nginx reverse proxy for SPA, WebSocket proxy with 86400s timeout]

key-files:
  created:
    - frontend/Dockerfile
    - frontend/nginx.conf
  modified:
    - docker-compose.yml

key-decisions:
  - "Nginx proxy uses Docker Compose service name 'api' for backend DNS — no hardcoded IPs"
  - "api port 8000 changed from ports (host-exposed) to expose (internal-only) — Nginx is sole entry point"
  - "proxy_read_timeout 86400s on /ws/ prevents Nginx from closing long-lived WebSocket connections"

patterns-established:
  - "Multi-stage build: node:22-alpine for npm ci + vite build, nginx:1.27-alpine for serving dist/"
  - "SPA fallback: try_files $uri $uri/ /index.html enables TanStack Router client-side routing"
  - "WebSocket proxy requires Upgrade + Connection headers and HTTP/1.1 — included in /ws/ location"

requirements-completed: [DEPLOY-01]

# Metrics
duration: 2min
completed: 2026-03-23
---

# Phase 06 Plan 01: Frontend Production Deployment Summary

**Nginx-based multi-stage Docker build that serves the React SPA on port 80 and proxies /api/ and /ws/ to the FastAPI backend — completing DEPLOY-01 single-command full-stack startup.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T23:01:06Z
- **Completed:** 2026-03-23T23:02:46Z
- **Tasks:** 2 of 2
- **Files modified:** 3

## Accomplishments

- Created `frontend/Dockerfile` as a two-stage build: Node 22-alpine installs deps and runs `tsc -b && vite build`; Nginx 1.27-alpine copies the `dist/` output and serves it
- Created `frontend/nginx.conf` with /api/ proxy, /ws/ WebSocket proxy (Upgrade headers + 86400s timeout), SPA try_files fallback, and gzip compression
- Updated `docker-compose.yml` to add `frontend` service on port 80 and change `api` from `ports: 8000:8000` to `expose: 8000` — Nginx becomes the sole host-exposed entry point

## Task Commits

1. **Task 1: Create frontend Dockerfile and Nginx config** - `c3a8309` (feat)
2. **Task 2: Add frontend service to Docker Compose** - `6ae6c70` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `frontend/Dockerfile` - Multi-stage build: Node build stage + Nginx serve stage
- `frontend/nginx.conf` - SPA server with /api/ and /ws/ proxy_pass to api:8000, gzip, try_files
- `docker-compose.yml` - Added frontend service (port 80), changed api to expose-only (port 8000 internal)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All created files verified present on disk. Both task commits (c3a8309, 6ae6c70) confirmed in git log.

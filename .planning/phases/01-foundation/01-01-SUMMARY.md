---
phase: 01-foundation
plan: 01
subsystem: backend-infrastructure
tags: [fastapi, sqlalchemy, alembic, pydantic-settings, asyncpg, python]
dependency_graph:
  requires: []
  provides:
    - async-db-session-factory
    - pydantic-settings-config
    - sqlalchemy-base-models
    - alembic-migration-config
    - health-endpoint
  affects: []
tech_stack:
  added:
    - fastapi[standard]>=0.115.0
    - uvicorn[standard]>=0.32.0
    - gunicorn>=23.0.0
    - pydantic-settings>=2.6.0
    - sqlalchemy[asyncio]>=2.0.44
    - asyncpg>=0.31.0
    - alembic>=1.18.0
    - PyJWT>=2.9.0
    - pwdlib[argon2]>=0.2.0
    - python-multipart>=0.0.12
    - openai>=1.50.0
    - httpx>=0.27.0
  patterns:
    - lazy-async-engine-initialization
    - get_db-dependency-with-commit-rollback
    - asynccontextmanager-lifespan
    - async_engine_from_config-nullpool-alembic
    - mapped-column-sqlalchemy-2x-typing
key_files:
  created:
    - backend/requirements.txt
    - backend/app/__init__.py
    - backend/app/main.py
    - backend/app/config.py
    - backend/app/database.py
    - backend/app/dependencies.py
    - backend/app/routers/__init__.py
    - backend/app/routers/health.py
    - backend/app/schemas/__init__.py
    - backend/app/schemas/health.py
    - backend/app/models/__init__.py
    - backend/app/models/node.py
    - backend/app/models/instance.py
    - backend/app/models/user.py
    - backend/app/models/team.py
    - backend/app/models/audit.py
    - backend/alembic.ini
    - backend/alembic/env.py
    - backend/alembic/script.py.mako
    - backend/alembic/versions/.gitkeep
  modified: []
decisions:
  - "Lazy engine initialization in database.py prevents Settings validation failure on import when no .env exists"
  - "JSON column for Node.projects instead of PostgreSQL ARRAY for reliable Alembic autogenerate compatibility"
  - "asynccontextmanager lifespan established in Phase 1 to avoid Phase 4 refactor when background tasks are added"
  - "NullPool in alembic/env.py prevents migration process hanging after completion"
metrics:
  duration: "3m"
  completed_date: "2026-03-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 20
  files_modified: 0
---

# Phase 01 Plan 01: FastAPI Backend Scaffold with Async Database Infrastructure Summary

**One-liner:** FastAPI app with lazy asyncpg engine, pydantic-settings config, six SQLAlchemy 2.x Mapped[] models, and async Alembic migration config connected via NullPool.

## What Was Built

Complete FastAPI backend scaffold establishing all async infrastructure patterns that subsequent phases build on. The app starts, passes through a lifespan context manager, and serves a `GET /health` endpoint that executes `SELECT 1` to verify database connectivity. All six SQLAlchemy models are defined with `Mapped[]` typing, and Alembic is configured for async migrations with all models imported for autogenerate detection.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Backend scaffold with config, database, and health endpoint | e87ac4a | config.py, database.py, dependencies.py, main.py, routers/health.py, requirements.txt |
| 2 | Six SQLAlchemy models and Alembic migration configuration | 458ed62 | models/node.py, models/instance.py, models/user.py, models/team.py, models/audit.py, alembic/env.py |

## Key Architecture Decisions

### Lazy Engine Initialization
`database.py` uses `_engine = None` with `get_engine()` / `get_session_maker()` lazy factory functions rather than creating the engine at module import time. This prevents Settings validation failures when the module is imported in contexts where no `.env` file exists (tests, linting, alembic invocations without the full environment).

### JSON vs PostgreSQL ARRAY for Node.projects
The research doc flagged uncertainty about whether Alembic autogenerate correctly handles `ARRAY(String)` on first run. Used `JSON` column instead — it is equally functional for storing a list of project name strings and is guaranteed to autogenerate correctly across all supported PostgreSQL versions.

### Lifespan Context Manager Established Early
`main.py` uses `asynccontextmanager` lifespan from day one. Phase 4 adds the health monitor background task as a single line inside the lifespan `yield` block. Using the deprecated `@app.on_event("startup")` pattern would have required a refactor at Phase 4.

### NullPool in Alembic env.py
Migrations are one-shot operations. Using the default connection pool in `async_engine_from_config` holds connections open after migrations complete, causing the process to hang. `pool.NullPool` ensures clean connection teardown. This is documented in the Alembic async cookbook.

### sys.path Injection in alembic/env.py
`alembic/env.py` inserts the `backend/` directory onto `sys.path` so `app.*` imports resolve when `alembic` is invoked from the `backend/` directory. Without this, `from app.models import ...` raises `ModuleNotFoundError`.

## Deviations from Plan

None — plan executed exactly as written.

The research doc listed JSON vs ARRAY as an open question (Open Question #1) and explicitly recommended falling back to JSON if ARRAY autogenerate had issues. The plan's action spec also specified JSON. No deviation — used JSON as planned.

## Known Stubs

None. All files are infrastructure/schema definitions. No data flows to UI from this plan — the health endpoint returns a static response once the DB connection is verified.

## Verification Results

- All Python files in `backend/app/` and `backend/alembic/` parse without syntax errors.
- All acceptance criteria verified via automated string-presence checks.
- No hardcoded secrets in any committed file — all configuration consumed from environment variables via pydantic-settings.
- `field_validator` on `Settings.database_url` enforces `postgresql+asyncpg://` scheme, preventing the silent asyncpg dialect mismatch pitfall.

## Self-Check: PASSED

Files verified to exist:
- backend/app/config.py: FOUND
- backend/app/database.py: FOUND
- backend/app/main.py: FOUND
- backend/app/dependencies.py: FOUND
- backend/app/routers/health.py: FOUND
- backend/app/models/node.py: FOUND
- backend/app/models/instance.py: FOUND
- backend/app/models/user.py: FOUND
- backend/app/models/team.py: FOUND
- backend/app/models/audit.py: FOUND
- backend/alembic/env.py: FOUND
- backend/alembic.ini: FOUND
- backend/requirements.txt: FOUND

Commits verified:
- e87ac4a: FOUND (Task 1)
- 458ed62: FOUND (Task 2)

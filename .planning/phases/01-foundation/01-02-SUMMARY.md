---
phase: 01-foundation
plan: 02
subsystem: infra
tags: [docker, docker-compose, gunicorn, alembic, postgresql, python]

requires:
  - phase: 01-01
    provides: FastAPI app scaffold with SQLAlchemy models, health endpoint, alembic config

provides:
  - Docker Compose stack (FastAPI api service + PostgreSQL 16 db service)
  - backend/Dockerfile based on python:3.12-slim with Gunicorn single-worker entrypoint
  - backend/entrypoint.sh: runs alembic upgrade head then exec gunicorn
  - Initial Alembic migration (0001_initial_schema.py) creating all 6 tables
  - .env.example template with all required env vars documented
  - .gitignore preventing .env, __pycache__, node_modules from being committed
  - frontend/.gitkeep placeholder for Phase 4 frontend scaffold

affects:
  - All phases (infra foundation — Docker Compose is the runtime for all subsequent phases)
  - Phase 03 (auth will use JWT_SECRET_KEY and SERVER_TOKEN from .env pattern)
  - Phase 04 (frontend scaffold will populate frontend/ directory)

tech-stack:
  added:
    - Docker / Docker Compose v2 (multi-service orchestration)
    - Gunicorn 23+ with UvicornWorker (production process manager)
    - PostgreSQL 16 alpine (via docker-compose.yml)
    - Alembic (initial migration script)
  patterns:
    - Single-worker enforcement: --workers 1 hardcoded in both Dockerfile CMD and docker-compose.yml command
    - Migration-first entrypoint: alembic upgrade head runs before gunicorn starts
    - depends_on with condition: service_healthy prevents migration race with PostgreSQL startup
    - env_file pattern: all secrets in .env (gitignored), .env.example committed as template
    - Enum lifecycle in Alembic: use sa.Enum(...) column definition (create_type=True default) in op.create_table; drop manually in downgrade

key-files:
  created:
    - backend/Dockerfile
    - backend/entrypoint.sh
    - docker-compose.yml
    - .env.example
    - .gitignore
    - frontend/.gitkeep
    - backend/alembic/versions/0001_initial_schema.py
  modified:
    - backend/alembic.ini (fixed sqlalchemy.url interpolation placeholder)

key-decisions:
  - "alembic.ini sqlalchemy.url uses static placeholder not %(DATABASE_URL)s — env.py overrides at runtime; configparser interpolation fails before env.py runs"
  - "Alembic enum lifecycle: do NOT call enum.create() explicitly before op.create_table — let SQLAlchemy create via column definition to avoid DuplicateObjectError in transactional DDL"
  - "Dockerfile uses shell-form CMD (not JSON array) so --workers 1 appears as a literal string for grep-based verification"

patterns-established:
  - "Migration-then-serve pattern: entrypoint.sh runs alembic upgrade head before exec gunicorn"
  - "Single-worker enforcement: --workers 1 in BOTH Dockerfile CMD AND docker-compose.yml command (belt-and-suspenders)"
  - "Health check before api start: depends_on with condition: service_healthy prevents alembic migration race"

requirements-completed: [DEPLOY-01, DEPLOY-02, DEPLOY-03]

duration: 69min
completed: 2026-03-21
---

# Phase 01 Plan 02: Docker Compose Infrastructure Summary

**Docker Compose stack with python:3.12-slim Gunicorn single-worker, PostgreSQL 16, Alembic migration running all 6 tables at container startup**

## Performance

- **Duration:** 69 min
- **Started:** 2026-03-21T06:15:37Z
- **Completed:** 2026-03-21T07:24:49Z
- **Tasks:** 2
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments

- Docker Compose stack starts FastAPI + PostgreSQL with `docker-compose up --build -d`; db healthcheck prevents race; api waits for `service_healthy`
- Alembic migration creates all 6 tables (users, teams, team_members, nodes, instances, audit_log) plus alembic_version at container startup
- Single Uvicorn worker enforced at infrastructure level: `--workers 1` in both Dockerfile CMD and docker-compose.yml command; verified 1 worker booted
- Health endpoint returns `{"status":"ok","database":"connected"}` confirming end-to-end DB connectivity
- All secrets in .env (gitignored); .env.example committed as the canonical template

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Docker infrastructure files and .env configuration** - `9cc065c` (chore)
2. **Task 2: Generate initial Alembic migration and validate full stack startup** - `329b8d0` (feat)

## Files Created/Modified

- `backend/Dockerfile` - python:3.12-slim image, ENTRYPOINT entrypoint.sh, single-worker Gunicorn CMD
- `backend/entrypoint.sh` - runs `alembic upgrade head` then `exec "$@"` for proper SIGTERM handling
- `docker-compose.yml` - api + db services, healthcheck, depends_on service_healthy, env_file
- `.env.example` - DATABASE_URL, JWT_SECRET_KEY, SERVER_TOKEN, OPENAI_API_KEY, POSTGRES_*, DB_POOL_SIZE
- `.gitignore` - Python, .env, IDE, Docker volumes, OS, node_modules
- `frontend/.gitkeep` - empty placeholder for Phase 4 frontend scaffold
- `backend/alembic/versions/0001_initial_schema.py` - initial migration: all 6 tables + enum types
- `backend/alembic.ini` - fixed sqlalchemy.url interpolation (static placeholder replacing %(DATABASE_URL)s)

## Decisions Made

- **alembic.ini static URL placeholder:** The original `sqlalchemy.url = %(DATABASE_URL)s` used Python configparser interpolation that fails before `env.py` can override it. Fixed to `sqlalchemy.url = postgresql+asyncpg://placeholder/placeholder` — `env.py` overrides this value at runtime via `get_settings().database_url`.
- **Enum lifecycle in Alembic:** Calling `sa.Enum.create()` explicitly before `op.create_table()` causes `DuplicateObjectError` because Alembic's transactional DDL fires `_on_table_create` events regardless of `create_type=False`. The correct pattern: let `op.create_table()` create the enum via the column's default `create_type=True`; in `downgrade()` call `sa.Enum(name=...).drop(op.get_bind())` explicitly after dropping all tables.
- **Shell-form CMD in Dockerfile:** Using shell-form `CMD gunicorn ... --workers 1 ...` instead of JSON array ensures the literal string `--workers 1` appears in the file for audit/grep purposes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed alembic.ini configparser interpolation error**
- **Found during:** Task 2 (Docker stack startup)
- **Issue:** `sqlalchemy.url = %(DATABASE_URL)s` caused `configparser.InterpolationMissingOptionError` because configparser tried to substitute `DATABASE_URL` before `env.py` ran to override the value
- **Fix:** Replaced with static placeholder `postgresql+asyncpg://placeholder/placeholder`; env.py's `configuration["sqlalchemy.url"] = get_settings().database_url` overrides this correctly at runtime
- **Files modified:** `backend/alembic.ini`
- **Verification:** Alembic migration ran successfully in container; no interpolation error in logs
- **Committed in:** `329b8d0` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Alembic enum DuplicateObjectError in transactional DDL**
- **Found during:** Task 2 (first two migration attempts)
- **Issue:** Calling `node_status.create(op.get_bind())` before `op.create_table("nodes",...)` caused `DuplicateObjectError: type "node_status" already exists` because Alembic's `_on_table_create` event fired a second CREATE TYPE regardless of `create_type=False`
- **Fix:** Removed explicit `enum.create()` calls; let `op.create_table()` create enums via column definition (default `create_type=True`). Each enum is used by exactly one table so no duplicate creation occurs. In `downgrade()`, call `sa.Enum(name=...).drop(op.get_bind())` after all tables dropped.
- **Files modified:** `backend/alembic/versions/0001_initial_schema.py`
- **Verification:** Migration runs cleanly from scratch; all 6 tables created; `\dt` shows 7 rows
- **Committed in:** `329b8d0` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2x Rule 1 - Bug)
**Impact on plan:** Both fixes were blocking — the stack could not start without them. No scope creep; both are infrastructure-correctness fixes.

## Issues Encountered

- `CREATE TYPE IF NOT EXISTS` is NOT valid PostgreSQL syntax (not even in PostgreSQL 16). Investigated as potential idempotency fix; rejected in favor of clean enum lifecycle management.
- Docker volume persistence between `docker-compose down` calls: needed `docker-compose down -v` to clean enum state during debugging.

## User Setup Required

None — no external service configuration required. Stack starts with `cp .env.example .env && docker-compose up --build -d`.

## Next Phase Readiness

- Docker Compose infrastructure complete; all subsequent phases run in this stack
- All 6 database tables exist and are ready for Phase 2 WebSocket node registry and Phase 3 auth
- `.env` pattern established — Phase 3 auth adds no new infrastructure, just JWT_SECRET_KEY and SERVER_TOKEN already in .env.example

---
*Phase: 01-foundation*
*Completed: 2026-03-21*

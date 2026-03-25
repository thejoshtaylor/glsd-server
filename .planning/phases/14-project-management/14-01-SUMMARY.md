---
phase: 14-project-management
plan: 01
subsystem: api
tags: [fastapi, postgresql, sqlalchemy, alembic, pydantic]

# Dependency graph
requires:
  - phase: 11-extended-sessions
    provides: JWT auth and DB session infrastructure
  - phase: 02-node-protocol-engine
    provides: Node model, dispatch_execute, ConnectionManager
provides:
  - Project ORM model with UniqueConstraint(node_id, name) and FK to nodes
  - Alembic migration 0006 for projects table
  - Pydantic schemas for project management endpoints
  - project_service with validate_work_dir, upsert_project, list_projects_for_node
  - REST endpoints: GET /api/nodes/{node_id}/projects, POST /api/projects/connect|clone|bootstrap
  - dispatch_execute skip_project_check parameter for setup commands
affects: [14-project-management, frontend project picker, execute form]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PostgreSQL INSERT ... ON CONFLICT for idempotent upsert (avoid UniqueConstraint errors)"
    - "os.path.normpath + split(os.sep) for path traversal validation"
    - "skip_project_check parameter on dispatch_execute for project setup bootstrapping"

key-files:
  created:
    - backend/app/models/project.py
    - backend/alembic/versions/0006_add_projects_table.py
    - backend/app/schemas/projects.py
    - backend/app/services/project_service.py
    - backend/app/routers/projects.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/ws/commands.py
    - backend/app/main.py

key-decisions:
  - "skip_project_check=True bypasses conn.projects check for clone/bootstrap — project doesn't exist on node yet during setup"
  - "connect endpoint writes DB row only, no execute dispatched (instance_id=None in response)"
  - "upsert via pg INSERT ON CONFLICT updates work_dir on re-register — idempotent by design"
  - "validate_work_dir uses os.path.normpath + split(os.sep) to reject .. traversal per STATE.md locked decision"

patterns-established:
  - "Project setup endpoints: validate access, validate path, dispatch (if needed), upsert DB row"
  - "PermissionError from dispatch_execute maps to 403, ValueError maps to 400"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03, PROJ-04]

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 14 Plan 01: Project Management Backend Summary

**FastAPI project management layer with PostgreSQL persistence: connect/clone/bootstrap endpoints, path traversal validation, and idempotent upsert via INSERT ON CONFLICT**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T08:29:06Z
- **Completed:** 2026-03-25T08:32:10Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Project ORM model with `UniqueConstraint("node_id", "name")` and `ForeignKey("nodes.node_id", ondelete="CASCADE")`
- Alembic migration 0006 creates projects table with FK, unique constraint, and index on node_id
- Three project action endpoints: connect (DB-only), clone (dispatches `git clone`), bootstrap (dispatches `/gsd:new-project`)
- `validate_work_dir` rejects directory traversal via `os.path.normpath` + `split(os.sep)` check
- `dispatch_execute` extended with `skip_project_check=True` for setup commands that run before project is in `conn.projects`

## Task Commits

Each task was committed atomically:

1. **Task 1: Project model, migration, service, and schemas** - `2d27e50` (feat)
2. **Task 2: Project router, dispatch_execute modification, and main.py registration** - `2808a9c` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `backend/app/models/project.py` - Project ORM model with node FK and unique constraint
- `backend/alembic/versions/0006_add_projects_table.py` - Migration creating projects table
- `backend/app/schemas/projects.py` - ConnectProjectRequest, CloneProjectRequest, BootstrapProjectRequest, ProjectResponse, ProjectActionResponse
- `backend/app/services/project_service.py` - validate_work_dir, upsert_project (pg INSERT ON CONFLICT), list_projects_for_node
- `backend/app/routers/projects.py` - 4 REST endpoints for project management
- `backend/app/models/__init__.py` - Added Project import and __all__ entry
- `backend/app/ws/commands.py` - Added skip_project_check parameter to dispatch_execute
- `backend/app/main.py` - Registered projects router

## Decisions Made
- `skip_project_check=True` on clone/bootstrap: the project doesn't exist in `conn.projects` (node's in-memory list) at setup time — the execute runs before the project is registered on the node side
- connect endpoint has `instance_id=None`: registering an existing folder needs no execution, just a DB row
- upsert via `pg_insert(...).on_conflict_do_update(...)`: re-registering same project (e.g., moved folder) updates work_dir cleanly without error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend project API complete, ready for Phase 14 Plan 02 (frontend project management UI)
- Migration 0006 must be applied to DB before use: `alembic upgrade head`

---
*Phase: 14-project-management*
*Completed: 2026-03-25*

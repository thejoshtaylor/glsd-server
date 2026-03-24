---
phase: 05-voice-and-audit
plan: "01"
subsystem: backend/audit
tags: [audit, postgresql, fastapi, alembic]
dependency_graph:
  requires: []
  provides: [audit-log-table, write-audit-log-helper, GET-/api/audit]
  affects: [backend/app/ws/commands.py, backend/app/ws/handlers.py, backend/app/main.py]
tech_stack:
  added: []
  patterns: [fire-and-forget-audit, team-scoped-query]
key_files:
  created:
    - backend/alembic/versions/0004_audit_log.py
    - backend/app/services/audit_service.py
    - backend/app/schemas/audit.py
    - backend/app/routers/audit.py
  modified:
    - backend/app/ws/commands.py
    - backend/app/ws/handlers.py
    - backend/app/main.py
decisions:
  - "0004 migration adds only ix_audit_log_event_type index — audit_log table already created in 0001 initial schema"
  - "node_id=None accepted in instance_finished and instance_error audit rows — instance_id sufficient for correlation in event-sourced handlers"
metrics:
  duration_seconds: 99
  completed_date: "2026-03-23T18:39:43Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 3
---

# Phase 05 Plan 01: Audit Log — Database, Service, and REST Endpoint Summary

**One-liner:** Append-only audit log with fire-and-forget write helper, execute/kill/instance event instrumentation, and team-scoped GET /api/audit endpoint.

## What Was Built

- **Alembic migration 0004** adds the `ix_audit_log_event_type` index to the `audit_log` table. The table itself was created in migration 0001 (initial schema); 0004 fills the gap of the missing event_type index.
- **`audit_service.write_audit_log`** is a fully fire-and-forget async helper: acquires its own short-lived session, inserts an `AuditLog` row, and on any exception rolls back, logs the error, and returns — never re-raises.
- **`schemas/audit.AuditLogResponse`** Pydantic model with `from_attributes=True` for ORM serialization.
- **`routers/audit.GET /api/audit`** requires `node_id` (enforces team-scope gate via `user_can_access_node`), optional `type` filter, pagination via `limit`/`offset`.
- **`ws/commands.py`** now calls `write_audit_log` after `dispatch_execute` (event_type="execute") and `dispatch_kill` (event_type="kill").
- **`ws/handlers.py`** now calls `write_audit_log` at the end of `handle_instance_finished` (event_type="instance_finished") and `handle_instance_error` (event_type="instance_error").
- **`main.py`** includes the new `audit.router`.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Alembic migration, audit service helper, and Pydantic schema | d587596 | 0004_audit_log.py, audit_service.py, schemas/audit.py |
| 2 | Wire audit into commands/handlers, create REST endpoint, register router | f94e5dd | commands.py, handlers.py, routers/audit.py, main.py |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration 0004 does not re-create audit_log table**

- **Found during:** Task 1
- **Issue:** The plan described migration 0004 as creating the `audit_log` table with all columns and 3 indexes. However, the initial schema migration (`0001_initial_schema.py`) already creates the `audit_log` table with `ix_audit_log_timestamp` and `ix_audit_log_node_id`. Re-running `op.create_table("audit_log", ...)` in migration 0004 would cause a PostgreSQL `DuplicateTable` error at `alembic upgrade head`.
- **Fix:** Migration 0004 only adds the missing `ix_audit_log_event_type` index, which was not present in 0001.
- **Files modified:** `backend/alembic/versions/0004_audit_log.py`
- **Commit:** d587596

## Key Decisions

- Migration 0004 adds only the `ix_audit_log_event_type` index — table already existed from 0001.
- `node_id=None` for `instance_finished` and `instance_error` audit rows (v1 simplicity — `instance_id` is sufficient for correlation; node lookup would require a DB query in a handler that just closed its session).

## Known Stubs

None.

## Self-Check

Files to verify:
- `backend/alembic/versions/0004_audit_log.py` — created
- `backend/app/services/audit_service.py` — created
- `backend/app/schemas/audit.py` — created
- `backend/app/routers/audit.py` — created
- `backend/app/ws/commands.py` — modified
- `backend/app/ws/handlers.py` — modified
- `backend/app/main.py` — modified

## Self-Check: PASSED

---
phase: quick
plan: 260324-pu8
subsystem: backend
tags: [config, bootstrap, admin, startup]
dependency_graph:
  requires: []
  provides: [initial-admin-seeding]
  affects: [backend/app/config.py, backend/app/main.py, backend/app/services/admin_bootstrap.py]
tech_stack:
  added: []
  patterns: [idempotent-startup-bootstrap, optional-env-config]
key_files:
  created:
    - backend/app/services/admin_bootstrap.py
  modified:
    - backend/app/config.py
    - backend/app/main.py
    - .env.example
decisions:
  - "Do not reuse register_user() in bootstrap — it raises HTTPException and returns TokenResponse, neither appropriate for startup context; inline the user+team+membership creation"
  - "No docker-compose.yml changes needed — env_file:.env already forwards all .env vars to the container"
  - "Bootstrap vars default to None via pydantic_settings; startup is a no-op when unset"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_changed: 4
---

# Quick Task 260324-pu8: Add Env Variables for Initial Admin Bootstrap Summary

**One-liner:** Optional INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD env vars trigger idempotent admin user + personal team creation at startup via a new ensure_initial_admin() service.

---

## What Was Built

Added support for seeding an initial admin user via environment variables, eliminating the need to manually hit the `/register` endpoint for the first deployment.

### Changes Made

**`backend/app/config.py`** — Added two optional fields to Settings:
- `initial_admin_email: str | None = None`
- `initial_admin_password: str | None = None`

**`backend/app/services/admin_bootstrap.py`** (new file) — `ensure_initial_admin(settings)` async function:
- Returns immediately if either env var is unset (no-op, default behavior unchanged)
- Queries for existing user by email — skips with log message if found (idempotent)
- Creates User + Team + TeamMember atomically within a single `session.begin()` transaction
- Logs "Created initial admin user: {email}" on success

**`backend/app/main.py`** — Lifespan startup now calls `await ensure_initial_admin(settings)` after creating the scanner task and before `yield`.

**`.env.example`** — Appended commented-out section documenting the two new optional vars.

---

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Config fields, bootstrap service, lifespan hook | 3675373 |
| 2 | Update .env.example | 4a2ce06 |

---

## Decisions Made

1. **Do not reuse `register_user()`** — that function raises `HTTPException` and returns `TokenResponse`, neither of which is appropriate in a startup context. The user+team+membership creation logic is replicated inline.
2. **No docker-compose.yml changes** — `env_file: .env` already passes all .env vars through to the container. Adding explicit `environment:` entries would cause empty-string values (not None) when vars are unset, breaking pydantic_settings' None detection.
3. **Optional fields default to None** — pydantic_settings correctly maps an absent/unset env var to `None` for `str | None` fields; startup is silently skipped when unconfigured.

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification

- All Python files parse without syntax errors (verified via ast.parse)
- Settings accepts INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD as optional fields
- admin_bootstrap.py exists with ensure_initial_admin() function
- main.py imports and calls ensure_initial_admin in lifespan
- .env.example documents both vars (commented out by default)

## Self-Check: PASSED

- `/Users/josh/code/glsd-server/backend/app/services/admin_bootstrap.py` — FOUND
- `/Users/josh/code/glsd-server/backend/app/config.py` — FOUND (contains initial_admin_email/password fields)
- `/Users/josh/code/glsd-server/backend/app/main.py` — FOUND (contains ensure_initial_admin call)
- `/Users/josh/code/glsd-server/.env.example` — FOUND (contains INITIAL_ADMIN_EMAIL entry)
- Commit 3675373 — FOUND
- Commit 4a2ce06 — FOUND

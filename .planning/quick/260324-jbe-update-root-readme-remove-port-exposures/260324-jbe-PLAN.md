---
quick_id: 260324-jbe
description: Update root README, remove port exposures from docker-compose, ensure clean build
tasks: 2
---

# Quick Plan: 260324-jbe

## Task 1: Update docker-compose.yml — remove port exposures

**Files:** `docker-compose.yml`
**Action:** Remove the `ports` mapping from the `frontend` service (80:80) and the `db` service (5432:5432). Keep `expose: ["8000"]` on the api service as-is (it's internal-only). The frontend and db services should use `expose` instead of `ports` so they're only reachable within the Docker network.
**Verify:** `docker compose config` succeeds without errors
**Done:** No `ports:` sections remain in docker-compose.yml

## Task 2: Create root README.md

**Files:** `README.md` (new)
**Action:** Write a concise README covering: what the project is, tech stack, prerequisites, how to build/run with docker compose, project structure, environment variables needed (.env), and links to protocol-spec.md and server-spec.md.
**Verify:** README.md exists at root and is well-structured
**Done:** README.md present with accurate project information

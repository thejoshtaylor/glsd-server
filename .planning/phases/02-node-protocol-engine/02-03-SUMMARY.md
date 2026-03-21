---
phase: 02-node-protocol-engine
plan: "03"
subsystem: backend/ws
tags: [command-dispatch, websocket, protocol, execute, kill, status_request]
dependency_graph:
  requires: [02-01]
  provides: [dispatch_execute, dispatch_kill, dispatch_status_request]
  affects: [03-REST-endpoints]
tech_stack:
  added: []
  patterns: [async-session-context-manager, connectivity-check-before-dispatch, DB-before-send]
key_files:
  created:
    - backend/app/ws/commands.py
  modified:
    - backend/app/ws/__init__.py
decisions:
  - "Persist Instance as pending BEFORE sending execute to node so DB has record even if send fails"
  - "dispatch_kill does NOT mark instance status — waits for terminal event from node (server-spec Section 4)"
  - "dispatch_status_request is fire-and-forget — node responds with node_register handled by router"
metrics:
  duration: "5 minutes"
  completed: "2026-03-21"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 02 Plan 03: Command Dispatch Module Summary

**One-liner:** Three async dispatch functions (execute, kill, status_request) with DB-before-send ordering and per-spec kill terminal-event semantics, exportable from `app.ws` for Phase 3 REST endpoints.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create command dispatch module | 5d56514 | backend/app/ws/commands.py |
| 2 | Export commands from ws package __init__.py | 5af35aa | backend/app/ws/__init__.py |

## What Was Built

`backend/app/ws/commands.py` — three async functions:

- **`dispatch_execute(node_id, project, work_dir, prompt, session_id)`** — validates node connected + project in `conn.projects`, generates UUID instance_id, persists `Instance(status=pending)` to DB before sending, sends execute envelope, handles disconnect-during-dispatch by marking instance errored. Returns instance_id.
- **`dispatch_kill(node_id, instance_id)`** — validates node connected, sends kill envelope. Does NOT update instance status (node sends terminal event after kill per server-spec Section 4). Returns True.
- **`dispatch_status_request(node_id)`** — validates node connected, sends status_request with no payload. Node responds with node_register handled by the WebSocket router. Returns True.

`backend/app/ws/__init__.py` — updated to re-export all three functions alongside existing manager exports. Phase 3 import path: `from app.ws import dispatch_execute, dispatch_kill`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no stub values or placeholder data in the dispatch functions.

## Self-Check: PASSED

- `backend/app/ws/commands.py` — EXISTS, verified importable
- `backend/app/ws/__init__.py` — EXISTS, verified exports
- Commit 5d56514 — EXISTS
- Commit 5af35aa — EXISTS

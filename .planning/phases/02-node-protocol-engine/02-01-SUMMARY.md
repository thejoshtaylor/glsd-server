---
phase: 02-node-protocol-engine
plan: "01"
subsystem: backend/ws
tags: [protocol, websocket, pydantic, sqlalchemy, alembic, token-rotation]
dependency_graph:
  requires: []
  provides: [ws-protocol-models, connection-manager, valid-tokens, stream-events-schema]
  affects: [02-02, 02-03, 02-04]
tech_stack:
  added: []
  patterns: [pydantic-v2-models, dataclass-registry, per-node-asyncio-lock, frozenset-token-rotation]
key_files:
  created:
    - backend/app/ws/__init__.py
    - backend/app/ws/protocol.py
    - backend/app/ws/manager.py
    - backend/app/models/stream_event.py
    - backend/alembic/versions/0002_add_stream_events.py
  modified:
    - backend/app/config.py
    - backend/app/models/__init__.py
decisions:
  - "StreamEvent model added to models package for use in handler persistence (Phase 2+)"
  - "MSG_TYPES dict maps all 10 type strings to Pydantic classes for dispatch"
  - "ConnectionManager is a plain class singleton — no async init required"
metrics:
  duration: "8 minutes"
  completed_date: "2026-03-21"
  tasks_completed: 3
  files_changed: 7
---

# Phase 02 Plan 01: Protocol Contracts, ConnectionManager, and stream_events Schema Summary

All protocol contracts, in-memory state management, token rotation config, and stream_events persistence layer established. Ten Pydantic v2 wire protocol models, ConnectionManager singleton with per-node asyncio locking, Settings.valid_tokens for token rotation, StreamEvent ORM model, and Alembic migration 0002.

## What Was Built

### Task 1: ws package — protocol.py and manager.py (commit 479d58c)

`backend/app/ws/protocol.py` — all 10 GSD wire protocol message types as Pydantic v2 models matching protocol-spec.md Section 3:
- `Envelope`, `InstanceSummary`
- `NodeRegisterPayload`, `AckPayload`, `StreamEventPayload`
- `InstanceStartedPayload`, `InstanceFinishedPayload`, `InstanceErrorPayload`
- `NodeDisconnectPayload`, `ExecutePayload`, `KillPayload`, `StatusRequestPayload`
- `new_msg_id()` using `secrets.token_hex(16)` (32-char hex)
- `MSG_TYPES` dict mapping all 10 type strings to payload classes

`backend/app/ws/manager.py` — `NodeConnection` dataclass and `ConnectionManager`:
- Per-node `asyncio.Lock` via `get_lock()`
- `register`, `deregister`, `get`, `update_heartbeat`, `all_connections`
- In-memory stream buffer: `append_stream_event`, `get_stream_events`, `clear_stream_events`
- `send_to_node` builds Envelope JSON and sends via WebSocket; returns bool

### Task 2: Token rotation + StreamEvent model (commit dfc4eea)

`backend/app/config.py` — `valid_tokens` property parses comma-separated `SERVER_TOKEN` into `frozenset[str]` for zero-downtime token rotation.

`backend/app/models/stream_event.py` — `StreamEvent` ORM model: BIGINT PK, `instance_id` FK to `instances`, `sequence_num` INT, `data` JSON, `created_at` timestamp.

`backend/app/models/__init__.py` — `StreamEvent` added to exports.

### Task 3: Alembic migration 0002 (commit 594fe3a)

`backend/alembic/versions/0002_add_stream_events.py` — creates `stream_events` table, composite index `ix_stream_events_instance_seq` on `(instance_id, sequence_num)`. Chains `down_revision = "0001"`.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- backend/app/ws/__init__.py: FOUND
- backend/app/ws/protocol.py: FOUND
- backend/app/ws/manager.py: FOUND
- backend/app/models/stream_event.py: FOUND
- backend/alembic/versions/0002_add_stream_events.py: FOUND
- Commits 479d58c, dfc4eea, 594fe3a: FOUND

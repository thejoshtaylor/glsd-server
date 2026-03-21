# Phase 2: Node Protocol Engine - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the complete server-side WebSocket protocol engine: node connection/authentication at `/ws/node`, all 10 message type handlers (7 outbound, 3 inbound), instance lifecycle state machine, state reconciliation on reconnect, staleness detection, token rotation, and stream event persistence. No frontend, no user auth, no dashboard — purely the node-facing execution engine.

</domain>

<decisions>
## Implementation Decisions

### Connection Manager Architecture
- `Dict[node_id, NodeConnection]` dataclass storing WebSocket reference + metadata (platform, version, projects, connected_at, last_heartbeat)
- `asyncio.Lock` per node_id for reconnect serialization — prevents RECON-05 concurrent reconciliation races
- Code organized in `backend/app/ws/` package: `manager.py` (ConnectionManager), `handlers.py` (message handlers), `protocol.py` (envelope/message Pydantic models)
- Stream events stored in-memory per instance for later frontend subscription (Phase 4), also persisted to DB for history

### Staleness Detection & Health
- Background asyncio task running in lifespan, scanning every 30 seconds — marks nodes stale after 90s no ping, errors their running instances
- Heartbeats tracked in both in-memory ConnectionManager AND database — in-memory for fast stale checks, DB for persistence across restarts
- Unexpected disconnects: WebSocket exception handler marks node disconnected + errors all running instances in a single DB transaction
- `stream_events` table (instance_id, sequence_num, data JSON, timestamp) for history replay in Phase 4

### Token Rotation & Security
- Comma-separated `SERVER_TOKEN` env var (e.g., `new_token,old_token`) — both accepted during grace period, admin removes old token when ready
- New/unknown node_id connections: log as warning + persist `first_seen` timestamp on Node record — alerting deferred to Phase 4 dashboard
- Server validates project exists on target node before dispatching execute (checks node's `projects` list from last `node_register`)
- Node WebSocket endpoint at `/ws/node` matching spec exactly; `/ws/frontend` reserved for Phase 4 browser connections

### Claude's Discretion
- Internal implementation details of the WebSocket read/write loop
- Error message formatting for protocol violations
- Logging verbosity and format
- Test structure and organization

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `protocol-spec.md` — Complete wire protocol v1.2.0 with all 10 message types, envelope format, sequence diagrams
- `server-spec.md` — Server backend spec: data models, command dispatch, event handling, reconciliation, health monitoring
- `backend/app/models/node.py` — Node model with NodeStatus enum (connected/stale/disconnected), JSON projects column
- `backend/app/models/instance.py` — Instance model with InstanceStatus enum (pending/running/finished/errored)
- `backend/app/database.py` — Lazy async engine + session factory pattern
- `backend/app/dependencies.py` — `get_db` async generator, `DbSession` type alias
- `backend/app/main.py` — FastAPI app with lifespan context manager (extension point for background tasks)

### Established Patterns
- SQLAlchemy 2.0 `Mapped[]` typed columns with async sessions
- Pydantic-settings for configuration (`backend/app/config.py`)
- `asynccontextmanager` lifespan for startup/shutdown
- Router-based endpoint organization (`backend/app/routers/`)

### Integration Points
- `main.py` lifespan — add stale node scanner background task
- `main.py` — include WebSocket router for `/ws/node`
- `config.py` — add `SERVER_TOKEN` parsing (comma-separated for rotation)
- Database models already exist — this phase uses them, may need migration for `stream_events` table

</code_context>

<specifics>
## Specific Ideas

- Protocol implementation must match `protocol-spec.md` exactly — nodes are already deployed at v1.2.0
- Envelope format: `{"type": "...", "id": "...", "payload": {...}}` — 32-char hex message IDs
- ACK correlation: ACK envelope reuses inbound execute envelope's ID
- Terminal event guarantee: exactly one of instance_finished or instance_error per instance (no dedup needed)
- Rate-limited execute: immediate instance_error with "rate limited", no ACK sent

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

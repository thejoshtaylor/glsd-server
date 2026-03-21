# Project Research Summary

**Project:** GLSD Server — WebSocket command-and-control plane for distributed Claude CLI nodes
**Domain:** Real-time WebSocket node management server with React dashboard
**Researched:** 2026-03-20
**Confidence:** HIGH

## Executive Summary

GLSD Server is a WebSocket-based command-and-control plane that manages a fleet of distributed GSD nodes (Go agents running Claude CLI). The server has two distinct client populations: GSD nodes that maintain long-lived outbound WebSocket connections and browser users who interact via a React dashboard. The recommended approach is a single FastAPI process with two separate WebSocket endpoints (`/ws/node` for nodes, `/ws/frontend` for browsers), an in-memory connection registry backed by PostgreSQL for durability, and a clean domain core (NodeRegistry, InstanceStore, EventRouter, CommandBus) that all transport layers share. The entire system is scoped to a single-instance Docker Compose deployment for v1.

The most important architectural decision is the single-worker constraint: the in-memory `ConnectionManager` mapping `node_id` to WebSocket objects cannot be shared across processes, so v1 must run exactly one Uvicorn worker. This is not a limitation to fix later — it is the correct v1 design, with a clear migration path to Redis pub/sub when horizontal scaling is needed. All other technology choices flow from the async-first requirement: FastAPI with asyncpg and SQLAlchemy 2 async for the backend, with React 19 + TanStack Query + Zustand for the frontend. The state split between TanStack Query (REST/server state) and Zustand (live WebSocket state) is the correct pattern for a real-time dashboard.

The primary risks cluster around async correctness and multi-tenancy enforcement. Blocking calls in the event loop cascade into node timeouts and are difficult to retrofit. Team ownership checks must be applied at every query from day one — a missing `WHERE team_id = ?` is invisible in single-tenant tests. The stream event data structure requires double JSON parsing (the outer envelope is JSON; the `data` field is a JSON-encoded NDJSON string), and getting this wrong at the start costs significant debugging time. Build the persistence layer and async database patterns before any WebSocket code to establish the correct patterns early.

---

## Key Findings

### Recommended Stack

The backend is FastAPI 0.115+ on Python 3.12 with asyncpg as the PostgreSQL driver (2-5x faster than alternatives under concurrent async load), SQLAlchemy 2.x async ORM, and Alembic for migrations. Authentication uses PyJWT 2.x and pwdlib — both are the FastAPI project's current recommendations; python-jose and passlib are abandoned and must not be used. Voice transcription uses the official `openai` Python SDK's async client for Whisper API calls. The deployment target is a single Uvicorn worker under Gunicorn, behind a reverse proxy for TLS termination.

The frontend is React 19 + TypeScript + Vite 8 with TanStack Router for type-safe routing, TanStack Query for REST server state, and Zustand 5 for real-time WebSocket state. UI is built with shadcn/ui on Tailwind CSS v4. The state split is deliberate and load-bearing: TanStack Query owns paginated node lists, instance history, and user/team data; Zustand owns live connection status, stream buffers, and pending command state.

**Core technologies:**
- FastAPI 0.115+: ASGI framework — first-class async WebSocket support, Pydantic v2 built-in, handles REST and WS on same port
- asyncpg 0.31+: PostgreSQL async driver — 2-5x faster than psycopg2/3 under concurrent WebSocket load
- SQLAlchemy 2.0+ async: ORM — fully typed `Mapped[]` API, async session management, shares Alembic migrations
- PyJWT 2.x: JWT auth — FastAPI's officially recommended replacement for abandoned python-jose
- pwdlib 0.2+: Password hashing — FastAPI's officially recommended replacement for abandoned passlib
- TanStack Query 5.x: Server state — REST caching, integrates with WebSocket via `queryClient.setQueryData()`
- Zustand 5.x: WebSocket state — lightweight, pairs cleanly with TanStack Query for live stream buffers
- React 19 + Vite 8: Frontend — latest stable React, 10-30x faster builds vs webpack

### Expected Features

The v1 MVP is well-defined by the project spec. The eight core features form a dependency chain from auth to execution to streaming output. Voice transcription via Whisper is explicitly called out as a v1 must-have, not a differentiator.

**Must have (table stakes):**
- Node registration with Bearer token auth — gate for all other node functionality
- Node list with live connected/stale/disconnected status — users must see fleet health at a glance
- Execute command dispatch with project selection — core value of the product
- Kill running instance — users need a stop mechanism
- Live stream output panel — streaming Claude CLI output in real time
- JWT-based user auth with team membership — nodes scoped to teams, no unauthenticated access
- Voice input via Whisper — explicitly required by PROJECT.md for v1
- Persistent PostgreSQL state with reconnect reconciliation — survive server restarts
- Audit trail for commands and events — append-only, low cost, required for ops

**Should have (differentiators):**
- NDJSON structured rendering — display assistant text, tool use, and errors distinctly rather than raw JSON
- Session resume via `session_id` capture — continue a previous Claude conversation from instance history
- Reconnect state reconciliation UI — surface "lost" vs "recovered" instances after node crash
- New node alert — security notice when an unrecognized node_id connects
- Rate limit visibility — distinguish "rate limited" errors from other instance failures

**Defer (v2+):**
- Instance history/output replay — unbounded storage growth risk; needs TTL policy decision
- Structured per-project cost dashboards — significant parsing and aggregation complexity
- Multi-team node assignment — single team per node covers all v1 use cases
- Token rotation UI — manual config change is acceptable for v1
- Real-time collaboration (multiple users watching same stream) — requires broadcast fan-out beyond v1 scope

### Architecture Approach

The system is organized as a single FastAPI process containing two transport gateways (Node WS and Frontend WS), a domain core (NodeRegistry, InstanceStore, EventRouter, CommandBus), a REST API layer, and a persistence layer backed by PostgreSQL. The EventRouter is the internal message bus: it receives events from the Node WS Gateway and pushes to per-connection asyncio queues on the Frontend WS Gateway, decoupling routing from network I/O. Stream events are never persisted to PostgreSQL — only terminal state (instance created, started, finished/errored) is written to the database, keeping DB load proportional to lifecycle transitions rather than streaming throughput.

**Major components:**
1. Node WS Gateway (`/ws/node`) — Bearer token auth before `accept()`, protocol envelope handling, ping/pong tracking
2. Frontend WS Gateway (`/ws/frontend`) — JWT auth, subscription management, asyncio queue per connection
3. NodeRegistry — in-memory `node_id → WebSocket` mapping + PostgreSQL node metadata, connection lifecycle, per-node locks for reconciliation safety
4. InstanceStore — instance lifecycle state machine, reconciliation algorithm (server-spec Section 6), session_id capture
5. EventRouter — team-scoped fan-out from node events to subscribed frontend queues; never writes to WebSockets directly
6. CommandBus — validates node is `connected` before dispatch, routes execute/kill/status_request to node connections
7. REST API Layer — login, node/instance CRUD, execute/kill dispatch, Whisper transcription endpoint
8. Persistence Layer — SQLAlchemy 2 async + asyncpg, shared connection pool, Alembic migrations
9. Health Monitor — FastAPI lifespan background task, scans `last_heartbeat` every 30s, marks stale nodes and errored instances

### Critical Pitfalls

1. **Multiple Uvicorn workers split the in-memory connection registry** — enforce `--workers 1` in `docker-compose.yml` from day one; document the constraint; never use auto-scaling worker configs like `tiangolo/uvicorn-gunicorn-fastapi`
2. **Blocking calls in the async event loop cascade into node timeouts** — use asyncpg/async SQLAlchemy, `httpx.AsyncClient` for OpenAI, `asyncio.sleep()` not `time.sleep()`; one 50ms blocking DB call starves all concurrent WebSocket message handling
3. **WebSocket auth accepted before `accept()` call** — validate Bearer token or JWT before calling `await websocket.accept()`; use close code 4001 on failure; FastAPI's `Depends(oauth2_scheme)` does not work cleanly here
4. **Reconciliation race on concurrent reconnects** — use a per-node `asyncio.Lock` keyed by `node_id`; acquire before any read-then-write in reconciliation; without this, rapid reconnects produce duplicate or inconsistent instance state
5. **`stream_event.data` is double-encoded JSON** — the `data` field is a JSON-encoded string containing NDJSON; always `json.loads(payload.data)` before any server-side inspection or frontend forwarding; define a Pydantic model for the inner Claude event structure
6. **Missing multi-tenancy filters at query level** — every DB query for nodes, instances, and users must include `WHERE team_id = ?`; this is invisible in single-tenant unit tests and can expose cross-team data silently

---

## Implications for Roadmap

The architecture research defines a clear dependency order of 11 build steps. The pitfalls research reinforces this order by identifying which mistakes are expensive to retrofit (async patterns, auth placement, single-worker constraint) vs. which can be addressed later (pool size tuning, stream rendering). The roadmap should follow the architectural build order closely.

### Phase 1: Foundation — Persistence Layer and Project Scaffold
**Rationale:** Every other component depends on the database schema and async session patterns. Establishing the correct async patterns (asyncpg, SQLAlchemy 2 async engine, `get_db` dependency) here prevents the most expensive pitfall (blocking event loop) from entering the codebase. Alembic migrations at startup eliminate schema drift.
**Delivers:** PostgreSQL schema (nodes, instances, users, teams, team_members, audit_log), SQLAlchemy async models with `Mapped[]` typing, Alembic migration runner, FastAPI project scaffold with Docker Compose (single worker enforced), pydantic-settings config.
**Addresses:** All persistent state features (audit trail, state survival across restarts)
**Avoids:** Blocking DB calls (establishes async-only patterns from start), connection pool exhaustion (configures pool explicitly), multiple-worker pitfall (Docker Compose locked to `--workers 1` here)
**Research flag:** Standard patterns — well-documented FastAPI + SQLAlchemy 2 async setup. Skip `/gsd:research-phase`.

### Phase 2: Node WebSocket Gateway and NodeRegistry
**Rationale:** The GSD wire protocol is the normative interface; get it right before building business logic on top. The two most critical security pitfalls (auth before `accept()`, per-node reconnect lock) must be addressed here. This phase can be tested with a real or mock GSD node independently of all user-facing features.
**Delivers:** `/ws/node` endpoint with pre-accept Bearer token validation, `node_register` first-frame enforcement, Envelope deserialization/serialization, NodeRegistry with in-memory connection map and DB upsert, connection lifecycle (connect/disconnect/status transitions), per-node `asyncio.Lock` for reconciliation safety.
**Addresses:** Node registration, node list with live status
**Avoids:** Auth accepted after `websocket.accept()`, reconciliation race condition, single-worker connection state split
**Research flag:** GSD wire protocol is normative (in-repo spec). No external research needed. Skip `/gsd:research-phase`.

### Phase 3: CommandBus, InstanceStore, and Instance Lifecycle
**Rationale:** With nodes connected and tracked, the core execution loop can be built. This phase implements the full execute → ack → instance_started → stream → finish/error lifecycle and the state reconciliation algorithm from server-spec Section 6.
**Delivers:** CommandBus (execute/kill/status_request dispatch with node connectivity validation), InstanceStore (instance lifecycle state machine, session_id capture, reconciliation logic), all inbound event handlers, REST endpoints for execute and kill (without frontend push yet), `projects` validation before dispatch.
**Addresses:** Execute command dispatch, kill running instance, persistent state reconciliation on reconnect
**Avoids:** `stream_event.data` double JSON encoding (define Pydantic Claude event model here), missing terminal event handlers (both `instance_finished` and `instance_error` paths)
**Research flag:** Standard patterns for the state machine; reconciliation algorithm is fully specified in server-spec.md. Skip `/gsd:research-phase`.

### Phase 4: Health Monitor and Stale Detection
**Rationale:** Stale node detection is a background concern that is trivial to add here (after core lifecycle) but expensive to retrofit. NAT-dropped connections never fire a disconnect event — only the background heartbeat monitor catches them.
**Delivers:** FastAPI lifespan background task scanning `last_heartbeat` every 30s, stale-node marking at >90s, cascading instance → `errored`/lost status for stale node's running instances, DB writes for status transitions.
**Addresses:** Health indicator staleness warning, error surfacing for lost instances
**Avoids:** Stale node detection not event-driven (zombie `running` instances), missing `lifespan` registration for the background task
**Research flag:** Standard asyncio background task pattern. Skip `/gsd:research-phase`.

### Phase 5: JWT Auth, User Management, and Team Scoping
**Rationale:** All human-facing features require auth. This phase establishes the JWT issuance/validation middleware, user CRUD, team management, and — critically — enforces team ownership at the query level on all existing endpoints. Multi-tenancy gaps are the most insidious security pitfall.
**Delivers:** `POST /api/auth/login` (JWT issue), user/team CRUD APIs, team-node association, JWT middleware on all protected routes, team ownership checks on execute/kill dispatch, every DB query filtered by `team_id`.
**Addresses:** JWT user auth, team membership and node scoping, node-to-team ownership enforcement
**Avoids:** Multi-tenancy gaps in queries (add team_id filters here across all queries), Whisper endpoint unauthenticated (JWT required in this phase), execute dispatch without team ownership check
**Research flag:** Standard JWT + FastAPI patterns. PyJWT 2.x auth is well-documented. Skip `/gsd:research-phase`.

### Phase 6: Frontend WebSocket Gateway and EventRouter
**Rationale:** The full real-time push path is built once the backend state machine is stable. The EventRouter's asyncio queue pattern (rather than direct `websocket.send_text()`) must be implemented here — it cannot be retrofitted cleanly.
**Delivers:** `/ws/frontend` endpoint with JWT pre-accept validation, EventRouter with per-connection asyncio queues and dedicated writer coroutines, subscription management (subscribe to node_id/instance_id), team-scoped event delivery (only route to connections with team access), short-lived WebSocket ticket endpoint (`POST /api/auth/ws-token`) for browser WS auth.
**Addresses:** Live stream forwarding to browser, team-scoped event visibility
**Avoids:** Blocking WebSocket write in EventRouter (asyncio queue pattern), cross-team data leakage via subscription (team membership validation on subscribe)
**Research flag:** EventRouter asyncio queue pattern has nuance. Consider `/gsd:research-phase` for the queue fan-out implementation if the team is new to this pattern.

### Phase 7: React Dashboard
**Rationale:** Build the UI once the full backend API surface is stable. The state split between TanStack Query and Zustand is the key architectural decision here.
**Delivers:** React 19 + TypeScript + Vite 8 SPA, TanStack Router with typed routes, TanStack Query for REST calls (node list, instance history, login), Zustand for WebSocket connection state and live stream buffers, node list with live status badges, execute/kill UI with proper button-disable-on-dispatch UX, live stream output panel, JWT login flow.
**Addresses:** Node list, per-node instance list, execute dispatch UI, kill UI, live stream output, error surfacing, health indicator
**Avoids:** Double-click execute dispatch (disable button on first click, re-enable on ack/error), showing stale node as "connected" (distinguish all three states visually), stream output rendered as raw NDJSON (parse `stream_event.data` in frontend)
**Research flag:** TanStack Router + TanStack Query + Zustand integration for real-time dashboards. Consider `/gsd:research-phase` for the useWebSocket hook pattern and real-time state sync architecture.

### Phase 8: Whisper Voice Input
**Rationale:** Voice transcription is a self-contained REST translation layer (audio → text → execute path). It has no upstream WebSocket dependencies and can be built after the execute path exists. Building it last allows the team to focus on the stateful core before adding the external API dependency.
**Delivers:** `POST /api/transcribe` (JWT required, 25 MB size guard), OpenAI async Whisper client (`AsyncOpenAI`), browser MediaRecorder integration, "Transcribing..." spinner UX, transcribed text populating the execute prompt field.
**Addresses:** Voice input via Whisper (v1 must-have per PROJECT.md)
**Avoids:** Unauthenticated Whisper endpoint (JWT required, tested), sync OpenAI client blocking event loop (use `AsyncOpenAI`), missing file size validation (return 413 before calling OpenAI)
**Research flag:** Whisper API integration is well-documented. Browser MediaRecorder codec variance (webm vs ogg) may need a quick check. Skip `/gsd:research-phase`.

### Phase 9: Audit Trail, Hardening, and Observability
**Rationale:** Cross-cutting concerns are added last once all paths exist. The audit log is append-only and non-blocking — it can be wired into all command/event paths in a single pass.
**Delivers:** `audit_log` writes on all execute/kill dispatch and terminal instance event paths, pending-instance timeout (no ack within 10s → mark `errored`), rate limit middleware on `/api/transcribe`, final security review against PITFALLS.md checklist, structured NDJSON stream rendering in frontend (tool use, text responses, error events rendered distinctly).
**Addresses:** Audit trail, error surfacing improvements, pending instance stuck state, NDJSON structured rendering
**Avoids:** Missing audit coverage on any command path
**Research flag:** Standard patterns. Skip `/gsd:research-phase`.

### Phase Ordering Rationale

- Persistence first: async DB patterns established before any WebSocket code prevents the most expensive retrofit
- Node gateway before auth: the GSD wire protocol can be validated against real nodes without any user-facing complexity
- CommandBus/InstanceStore before JWT: the execution lifecycle is testable as a node-to-server integration before adding the human auth layer
- Health monitor before user-facing features: stale detection is trivial to add here, nearly impossible to add after the fact without test coverage
- JWT auth before frontend WS: team scoping must be enforced before any browser client can subscribe to real-time events
- React after full backend API: avoids building UI against unstable API contracts
- Whisper last: purely additive, no structural dependencies on WebSocket state

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 6 (EventRouter):** asyncio queue fan-out with per-connection writer coroutines is a nuanced async pattern — worth a research pass if the team is new to Python asyncio concurrency
- **Phase 7 (React Dashboard):** TanStack Router v1 + TanStack Query v5 + Zustand v5 real-time integration has limited combined examples; useWebSocket hook design for live stream buffering warrants a focused research pass

Phases with standard patterns (skip research-phase):
- **Phase 1:** FastAPI + SQLAlchemy 2 async is well-documented with official examples
- **Phase 2:** GSD wire protocol is normative spec in-repo; FastAPI WebSocket auth pattern is documented
- **Phase 3:** State machine and reconciliation algorithm fully specified in server-spec.md
- **Phase 4:** asyncio background task via FastAPI lifespan is standard
- **Phase 5:** PyJWT + FastAPI JWT middleware is the current official pattern
- **Phase 8:** Whisper API integration is straightforward REST; file validation is standard
- **Phase 9:** Audit log writes and rate limiting are standard patterns

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core backend stack verified against official FastAPI docs and migration PRs; asyncpg performance delta confirmed against benchmarks; frontend stack verified against library release notes |
| Features | HIGH | Project has explicit spec documents (server-spec.md, protocol-spec.md, PROJECT.md); feature set derived from normative specs rather than inference |
| Architecture | HIGH | Architecture grounded in wire protocol spec and server spec; validated against FastAPI WebSocket patterns and SQLAlchemy async docs |
| Pitfalls | HIGH | Critical pitfalls verified against official documentation and known framework issues (abandoned libraries, multi-worker WebSocket state split are documented failure modes) |

**Overall confidence:** HIGH

### Gaps to Address

- **Stream event storage policy:** Research deliberately deferred the question of whether to persist `stream_event` data for replay. The current recommendation is not to persist stream events in v1. If instance history/replay is promoted to v1 scope, a storage design decision is needed (Redis Streams vs append-only file vs scoped PostgreSQL table with TTL) before Phase 3 begins.
- **Browser WebSocket audio codec variance:** Browser MediaRecorder produces `audio/webm` with Opus codec on Chrome/Firefox but `audio/ogg` on some configurations. Whisper supports both, but explicit `Content-Type` handling in the transcription endpoint should be validated during Phase 8 implementation.
- **Connection pool sizing:** The default `pool_size=5, max_overflow=10` (15 total connections) is explicitly flagged as dangerous under load in PITFALLS.md. The correct pool size depends on expected concurrent connected nodes and should be made a configurable environment variable rather than hardcoded.
- **`node_id` binding to token:** PITFALLS.md flags that a malicious node can impersonate another by sending a different `node_id` in `node_register`. The server spec should be reviewed for whether token-to-node_id binding is required or whether `node_id` is always trusted from the token's registered identity.

---

## Sources

### Primary (HIGH confidence)
- `server-spec.md` — normative server behavior, reconciliation algorithm (Section 6), security requirements (Section 9), Whisper integration (Section 8)
- `protocol-spec.md` — GSD Node Wire Protocol v1.2.0, message catalog, lifecycle flows
- `PROJECT.md` — explicit v1 scope, out-of-scope items, active requirements
- FastAPI official docs (https://fastapi.tiangolo.com/advanced/websockets/) — WebSocket auth patterns
- FastAPI PyJWT migration PR #11589 (https://github.com/fastapi/fastapi/pull/11589) — confirmed python-jose deprecation
- FastAPI full-stack template migration (https://github.com/fastapi/full-stack-fastapi-template/pull/1203) — confirmed pwdlib recommendation
- SQLAlchemy 2.0 async docs (https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html) — AsyncSession patterns

### Secondary (MEDIUM confidence)
- asyncpg vs psycopg comparison (https://fernandoarteaga.dev/blog/psycopg-vs-asyncpg/) — performance benchmarks
- TanStack Router vs React Router for dashboards (https://medium.com/ekino-france/tanstack-router-vs-react-router-v7-32dddc4fcd58) — routing decision rationale
- TestDriven.io FastAPI + Postgres + WebSockets (https://testdriven.io/blog/fastapi-postgres-websockets/) — architecture patterns
- WebSocket scaling with Redis (https://medium.com/@philipokiokio/broadcasting-websockets-messages-across-instances-and-workers-with-fastapi-9a66d42cb30a) — horizontal scaling migration path

### Tertiary (MEDIUM-LOW confidence)
- UX Strategies for Real-Time Dashboards — Smashing Magazine — dashboard UX patterns (auto-scroll, delta indicators)
- RMM feature analysis — DevOpsSchool — table stakes cross-reference from comparable category
- Multi-tenant auth best practices — Auth0 — team-scoped access control patterns

---
*Research completed: 2026-03-20*
*Ready for roadmap: yes*

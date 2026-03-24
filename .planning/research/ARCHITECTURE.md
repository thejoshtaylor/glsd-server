# Architecture Patterns

**Domain:** WebSocket node management server with real-time streaming dashboard
**Project:** GLSD Server
**Researched:** 2026-03-20
**Confidence:** HIGH (grounded in the wire protocol spec and server spec, validated against FastAPI WebSocket patterns)

---

## Recommended Architecture

The server has two fundamentally different client populations — GSD nodes (long-lived, outbound-connecting Go agents) and browser users (short-lived REST + WebSocket dashboard sessions) — connected through a central FastAPI process that holds all runtime state in memory and persists durable state to PostgreSQL.

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                          │
│  NodeList │ InstanceList │ StreamViewer │ VoiceInput            │
└────────────┬──────────────────────────────────────┬────────────┘
             │ REST (JWT)                            │ WS /ws/frontend
             ▼                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Process                            │
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────────────────────┐   │
│  │   HTTP / REST   │    │         WebSocket Layer          │   │
│  │  (JWT auth,     │    │  NodeConnManager  FrontendMgr    │   │
│  │   Whisper,      │    │  (node_id keyed)  (user keyed)   │   │
│  │   CRUD APIs)    │    └────────────┬─────────────────────┘   │
│  └────────┬────────┘                 │                          │
│           │                          │                          │
│           └──────────┬───────────────┘                          │
│                      ▼                                          │
│            ┌─────────────────┐                                  │
│            │  Domain Core    │                                  │
│            │  NodeRegistry   │                                  │
│            │  InstanceStore  │                                  │
│            │  EventRouter    │                                  │
│            │  CommandBus     │                                  │
│            └────────┬────────┘                                  │
│                     │                                           │
│            ┌────────▼────────┐                                  │
│            │  Persistence    │                                  │
│            │  (SQLAlchemy 2  │                                  │
│            │   async+asyncpg)│                                  │
│            └────────┬────────┘                                  │
└─────────────────────┼───────────────────────────────────────────┘
                      │
              ┌───────▼────────┐
              │  PostgreSQL    │
              │  (nodes,       │
              │   instances,   │
              │   users,       │
              │   teams,       │
              │   audit_log)   │
              └────────────────┘

Separately:
GSD Node 1 ──WSS──▶ FastAPI /ws/node
GSD Node 2 ──WSS──▶ FastAPI /ws/node
GSD Node N ──WSS──▶ FastAPI /ws/node

FastAPI ──HTTPS──▶ OpenAI Whisper API
```

---

## Component Boundaries

### 1. Node WebSocket Gateway (`/ws/node`)

**Responsibility:** Accept and authenticate GSD node connections. One connection handler per connected node. Owns the WebSocket lifecycle for that node's connection — reads frames, writes commands, handles ping/pong, detects drops.

**What it does:**
- Validates `Authorization: Bearer {token}` during HTTP upgrade (reject with 401/403 before upgrading)
- Enforces first-frame-is-`node_register` rule; closes connection if violated
- Deserializes inbound Envelope JSON and dispatches by `type` to the Domain Core
- Serializes and sends outbound Envelope JSON (execute, kill, status_request) received from the CommandBus
- Tracks last-ping timestamp; a background health monitor marks nodes stale if no ping arrives in >90s
- On disconnect (clean or drop): notifies NodeRegistry

**Communicates with:** NodeRegistry (register/deregister), InstanceStore (event forwarding), EventRouter (forward stream events to frontend), CommandBus (outbound command delivery)

**Does NOT own:** Node identity data (that lives in NodeRegistry), instance lifecycle state (InstanceStore), or any database writes (Persistence layer handles that)

---

### 2. Frontend WebSocket Gateway (`/ws/frontend`)

**Responsibility:** Push real-time events to authenticated browser sessions. Subscription-based: a frontend client subscribes to events for specific nodes or instances.

**What it does:**
- Validates JWT on connect (reject before upgrading)
- Maintains per-connection subscription state (which node_ids / instance_ids this browser tab cares about)
- Enforces team scoping: a user can only subscribe to nodes belonging to their teams
- Receives forwarded events from EventRouter and writes them to the browser WebSocket

**Communicates with:** EventRouter (receives events), NodeRegistry/InstanceStore (to validate subscription requests against team membership)

**Does NOT own:** Business logic, database writes, or the event routing decision itself

---

### 3. NodeRegistry (in-memory + persisted)

**Responsibility:** Single source of truth for node identity, connection status, and team membership. Hybrid: connection state lives in memory (the WebSocket object); durable node metadata lives in PostgreSQL.

**What it does:**
- Upserts node records on `node_register` (in memory and DB)
- Tracks `node_id → WebSocket connection` mapping for command dispatch
- Manages node status transitions: `connected` → `stale` → `disconnected`
- On disconnect: clears in-memory connection entry; writes status + timestamp to DB
- On reconnect: handles same `node_id` registering on a new WebSocket (replaces old connection ref)
- Exposes `get_connection(node_id)` for CommandBus to route commands

**Communicates with:** Node WebSocket Gateway (connection lifecycle events), InstanceStore (triggers reconciliation on reconnect), Persistence layer (reads/writes node table)

---

### 4. InstanceStore (in-memory + persisted)

**Responsibility:** Tracks all instance lifecycle state. This is the hottest component — every `stream_event` (potentially dozens per second per instance) passes through here.

**What it does:**
- Creates instance records when `execute` is dispatched (status: `pending`)
- Transitions state: `pending` → `running` (on `ack`) → `finished`/`errored` (on terminal event)
- Captures `session_id` from `instance_started`
- Handles state reconciliation on node reconnect (Section 6 of server-spec.md)
- Persists terminal state to DB; does NOT write stream events to DB (they are ephemeral)
- Exposes instance lookup by `instance_id` and by `node_id`

**Reconciliation logic lives here:** compare incoming `running_instances` list against in-memory tracked instances for a node_id; resolve discrepancies per the three-case algorithm in server-spec.md

**Communicates with:** NodeRegistry (triggered by reconnect), EventRouter (on state transitions that need frontend updates), Persistence layer (writes instance table), Node WebSocket Gateway (receives lifecycle events)

---

### 5. EventRouter

**Responsibility:** Fan-out layer. Routes inbound node events to the correct frontend WebSocket connections. This is the "message bus" within the single process.

**What it does:**
- Receives events from the Node WebSocket Gateway: `stream_event`, `instance_started`, `instance_finished`, `instance_error`, `node_register`, `node_disconnect`
- Looks up which frontend connections are subscribed to the relevant `node_id` or `instance_id`
- Pushes to each subscribed frontend connection's asyncio queue
- Handles team scoping: only routes to frontend connections that have team access to the node

**Key design decision:** EventRouter does NOT write to WebSockets directly. It pushes to per-connection asyncio queues. Each frontend connection has a writer task draining its queue. This decouples routing from network I/O and prevents a slow browser client from blocking event delivery to other clients.

**Communicates with:** Node WebSocket Gateway (source of events), Frontend WebSocket Gateway (destination queues), NodeRegistry (team membership lookups)

---

### 6. CommandBus

**Responsibility:** Deliver outbound commands (execute, kill, status_request) from the REST API or frontend to the correct node's WebSocket connection.

**What it does:**
- Accepts command requests: `(node_id, command_type, payload)`
- Validates the target node is `connected` (not `stale`/`disconnected`) before dispatching
- Looks up the live WebSocket connection from NodeRegistry
- Serializes Envelope and calls the node connection's send method
- Returns an error if the node is unreachable

**Communicates with:** NodeRegistry (connection lookup), Node WebSocket Gateway (writes to connection send channel), REST API handlers (command origin)

---

### 7. REST API Layer

**Responsibility:** Standard HTTP endpoints for the frontend SPA. Authentication, CRUD, and the Whisper transcription flow.

**Endpoints needed:**
- `POST /api/auth/login` — issue JWT
- `GET /api/nodes` — list nodes for user's teams
- `GET /api/nodes/{node_id}/instances` — list instances for a node
- `POST /api/nodes/{node_id}/execute` — dispatch execute command (optionally via Whisper)
- `POST /api/nodes/{node_id}/instances/{instance_id}/kill` — dispatch kill command
- `POST /api/transcribe` — audio → transcribed text (calls OpenAI Whisper API)
- `GET /api/teams` — list user's teams
- `POST /api/teams/{team_id}/nodes` — associate node with team

**Communicates with:** CommandBus (to dispatch node commands), Persistence layer (CRUD for users/teams/nodes/instances), OpenAI API client (Whisper transcription)

---

### 8. Persistence Layer (SQLAlchemy 2 async + asyncpg)

**Responsibility:** All durable reads and writes. Never holds connection state — that's in memory.

**What it owns:**
- `nodes` table: node_id, platform, version, projects[], team_id, first_seen, last_seen, status
- `instances` table: instance_id, node_id, project, session_id, status, started_at, finished_at, exit_code, error
- `users` table: user_id, email, hashed_password
- `teams` table: team_id, name
- `team_members` table: team_id, user_id, role
- `audit_log` table: timestamp, node_id, instance_id, event_type, actor, details (JSON)

**Connection pooling:** asyncpg via SQLAlchemy 2 async engine. Single connection pool shared across the process. Do not create new connections per request.

**Communicates with:** NodeRegistry, InstanceStore, REST API Layer

---

### 9. Health Monitor (background task)

**Responsibility:** Detect stale nodes without relying on explicit disconnect events.

**What it does:**
- Runs as a FastAPI lifespan background task (asyncio loop, checks every 30s)
- Iterates connected nodes; checks `last_heartbeat` timestamp
- Marks nodes `stale` if no ping received in >90 seconds
- On stale: marks all running instances for that node as `errored`/lost
- Writes status changes to DB

**Communicates with:** NodeRegistry, InstanceStore, Persistence layer

---

### 10. OpenAI Whisper Client

**Responsibility:** Single place that talks to OpenAI. Called only from the `POST /api/transcribe` endpoint.

**What it does:**
- Receives audio bytes from the REST handler
- POSTs to `https://api.openai.com/v1/audio/transcriptions` with model `whisper-1`
- Returns transcribed text string
- Validates file size (<25 MB) before calling the API

**Communicates with:** REST API Layer only. No other component is aware of it.

---

## Data Flow

### Flow 1: Node Connect and Register

```
Node                Node WS Gateway        NodeRegistry        InstanceStore       DB
 │                       │                      │                    │              │
 │──WSS upgrade──────────▶                      │                    │              │
 │                       │──validate token──────▶                    │              │
 │                       │◀─ok──────────────────│                    │              │
 │──node_register────────▶                      │                    │              │
 │                       │──upsert_node─────────▶                    │              │
 │                       │                      │──write node────────────────────────▶
 │                       │                      │──trigger reconcile─▶              │
 │                       │                      │                    │──resolve─────▶
```

### Flow 2: Execute Command (REST-triggered)

```
Browser          REST API         CommandBus      NodeRegistry     Node WS Gateway   Node
   │                │                 │               │                  │             │
   │──POST execute──▶                 │               │                  │             │
   │                │──dispatch───────▶               │                  │             │
   │                │                 │──get_conn─────▶                  │             │
   │                │                 │◀─connection───│                  │             │
   │                │                 │──send envelope─────────────────────▶           │
   │                │                 │                                  │──execute────▶
   │◀─202 Accepted──│                 │                                  │             │
```

### Flow 3: Stream Event Fan-Out

```
Node          Node WS Gateway    EventRouter    Frontend WS Gateway    Browser
 │                  │                │                 │                  │
 │──stream_event────▶                │                 │                  │
 │                  │──route_event───▶                 │                  │
 │                  │                │──push to queue──▶                  │
 │                  │                │                 │──write WS frame──▶
```

### Flow 4: Voice Transcription and Dispatch

```
Browser         REST API         Whisper Client      OpenAI API    CommandBus    Node
   │                │                  │                  │              │         │
   │──POST audio────▶                  │                  │              │         │
   │                │──transcribe───────▶                 │              │         │
   │                │                  │──POST audio──────▶              │         │
   │                │                  │◀─transcribed text─│             │         │
   │                │◀─text────────────│                  │              │         │
   │                │──dispatch(text)──────────────────────────────────────▶       │
   │                │                                     │              │──execute──▶
   │◀─instance_id───│                                     │              │         │
```

### Flow 5: Node Reconnect + Reconciliation

```
Node          Node WS Gateway    NodeRegistry      InstanceStore       DB
 │                  │                │                   │              │
 │──WSS upgrade─────▶                │                   │              │
 │──node_register───▶                │                   │              │
 │  (running_instances=[A,B,C])      │                   │              │
 │                  │──reconnect─────▶                   │              │
 │                  │                │──reconcile─────────▶             │
 │                  │                │                   │  A,B: update │
 │                  │                │                   │  C: add new  │
 │                  │                │                   │  D: mark err │
 │                  │                │                   │──write DB────▶
```

---

## Suggested Build Order

Dependencies determine order. Each step can be tested independently before the next builds on it.

### Step 1: Persistence Layer + Data Models

**Why first:** Every other component depends on it. Define PostgreSQL schema, SQLAlchemy models, async engine + connection pool, Alembic migrations. No business logic — just tables and queries.

**Deliverables:** Schema migrations, SQLAlchemy async models, session factory, basic CRUD functions for each table.

**Test:** Run migrations against a local Postgres container; verify all tables created.

---

### Step 2: Node WebSocket Gateway (auth + registration only)

**Why second:** This is the protocol boundary. Get the GSD wire protocol handling right before any business logic is layered on. Focus on: HTTP upgrade with Bearer token validation, first-frame enforcement, Envelope deserialization/serialization, ping/pong handling.

**Deliverables:** `/ws/node` endpoint that authenticates a node, deserializes `node_register`, and stores the connection. No state reconciliation yet.

**Test:** Connect a real GSD node (or mock); verify it registers and heartbeats are acknowledged.

---

### Step 3: NodeRegistry + In-Memory Connection State

**Why third:** Once nodes can connect, track them. Implement the `node_id → WebSocket` map, status transitions, and the upsert-to-DB path on register and disconnect.

**Deliverables:** NodeRegistry class, connection upsert on register, status transitions, DB writes.

**Test:** Register two nodes, disconnect one, verify status transitions and DB state.

---

### Step 4: CommandBus + Command Dispatch

**Why fourth:** Now that nodes are tracked, commands can be dispatched. Implement execute, kill, status_request dispatch through the connection registry.

**Deliverables:** CommandBus, REST endpoints for execute and kill (without frontend push yet), command validation (node connected? project exists?).

**Test:** Dispatch an execute to a real/mock node; verify ack received.

---

### Step 5: InstanceStore + Lifecycle Events

**Why fifth:** Command dispatch generates instance events. Implement instance creation, status transitions, reconciliation, and terminal event handling.

**Deliverables:** InstanceStore, all inbound event handlers (`ack`, `instance_started`, `stream_event` store, `instance_finished`, `instance_error`), state reconciliation on reconnect.

**Test:** Full execute → ack → instance_started → stream → finish lifecycle against a real node.

---

### Step 6: Health Monitor

**Why sixth:** Background health monitoring is independent of all user-facing flows. Build it once the core lifecycle is stable.

**Deliverables:** Lifespan background task, stale-node detection, stale-instance cleanup.

**Test:** Connect a node, block its heartbeats for 90+ seconds, verify it goes stale and instances are errored.

---

### Step 7: JWT Auth + User/Team REST APIs

**Why seventh:** Build the human-facing auth layer. JWT issue/validate, user registration, team management, node-to-team assignment.

**Deliverables:** `POST /api/auth/login`, user CRUD, team CRUD, team-node association, JWT middleware on all protected routes.

**Test:** Create user, login, get token, use token to list nodes.

---

### Step 8: Frontend WebSocket Gateway + EventRouter

**Why eighth:** The full real-time push path. Once the backend state machine works, expose it to browsers. Implement frontend WebSocket auth, subscription model, EventRouter fan-out with per-connection queues.

**Deliverables:** `/ws/frontend` endpoint, EventRouter, subscription management, team-scoped event delivery.

**Test:** Connect browser, subscribe to a node, execute a command, verify stream events arrive in browser.

---

### Step 9: React Dashboard

**Why ninth:** Build the UI once the full backend API is stable. SPA with node list, instance management, live output streaming, JWT login.

**Deliverables:** React app, useWebSocket hook, node/instance views, live stream display, auth flow.

**Test:** End-to-end: login, see nodes, dispatch execute via UI, see output stream in real time.

---

### Step 10: Whisper Integration

**Why tenth:** Voice transcription is a self-contained REST call. Build it last because it has no upstream dependencies — it's purely a translation layer (audio → text) that feeds the existing execute path.

**Deliverables:** `POST /api/transcribe`, OpenAI Whisper client, frontend MediaRecorder integration.

**Test:** Record audio in browser, transcribe, verify text arrives at node as prompt.

---

### Step 11: Audit Trail + Hardening

**Why last:** Cross-cutting concern. Log all command dispatches and events to `audit_log` table. Add rate limiting, command validation edge cases, token rotation support.

**Deliverables:** Audit log writes on all command/event paths, rate limit middleware, final security review.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Blocking WebSocket Write in Event Router

**What goes wrong:** EventRouter calls `await websocket.send_text(...)` directly for each subscriber while processing a node event. A slow or buffered browser connection blocks delivery to all other subscribers.

**Why bad:** Stream events arrive at high frequency. One lagging frontend client freezes the entire event fan-out loop.

**Instead:** EventRouter puts events into each subscriber's `asyncio.Queue`. Each frontend connection has a dedicated writer coroutine draining its queue. Slow clients fall behind their own queue without affecting others.

---

### Anti-Pattern 2: Writing Stream Events to PostgreSQL

**What goes wrong:** Every `stream_event` is persisted to the database. Claude CLI produces dozens of NDJSON lines per second per instance.

**Why bad:** At even modest load (10 concurrent instances x 20 events/second = 200 DB writes/second), the PostgreSQL write load becomes the primary bottleneck. Stream events are ephemeral — they don't need durability.

**Instead:** Forward stream events in memory (EventRouter → frontend queues). Store only terminal state in DB: instance created, started, finished/errored. If replay of output is required in future, that's a separate concern (Redis Streams, file log) scoped to a future phase.

---

### Anti-Pattern 3: Per-Request Database Connections

**What goes wrong:** A new asyncpg connection is opened for each WebSocket message or REST request.

**Why bad:** Connection setup overhead is non-trivial. Under WebSocket load (continuous stream events hitting the DB), connection churn exhausts the PostgreSQL `max_connections` limit.

**Instead:** Single SQLAlchemy async engine with a connection pool at application startup. All handlers share the pool. Pool size tuned at deployment time.

---

### Anti-Pattern 4: Mixing Sync and Async Database Calls

**What goes wrong:** SQLAlchemy sync ORM used alongside async route handlers (e.g., `session.query(...).all()` called from an `async def` handler).

**Why bad:** Sync DB calls block the asyncio event loop, negating all concurrency benefits. One 50ms DB query blocks ALL WebSocket message processing for that duration.

**Instead:** SQLAlchemy 2 async ORM throughout (`AsyncSession`, `select()`, `await session.execute(...)`). asyncpg as the driver. Alembic migrations kept separately (Alembic's sync is acceptable for migrations — they don't run in the hot path).

---

### Anti-Pattern 5: Single WebSocket Endpoint for Nodes and Frontend

**What goes wrong:** Nodes and browser clients share a single `/ws` endpoint with type-based routing inside the handler.

**Why bad:** Completely different auth mechanisms (Bearer token vs JWT), different message schemas, different connection lifecycles. Mixing them creates fragile conditionals throughout the handler.

**Instead:** Separate endpoints: `/ws/node` for GSD nodes, `/ws/frontend` for browser clients. Each has its own auth middleware and handler logic. They share only the Domain Core (NodeRegistry, InstanceStore) through dependency injection.

---

### Anti-Pattern 6: Storing Node Connection Objects in the Database

**What goes wrong:** WebSocket connection objects (or references to them) are stored in PostgreSQL rows or serialized to JSON.

**Why bad:** WebSocket connections are in-process objects tied to the current event loop. They cannot survive process restart, serialization, or cross-process communication. Attempting to do so causes silent failures and memory leaks.

**Instead:** In-memory dict `{node_id: WebSocket}` in NodeRegistry. PostgreSQL stores only serializable node metadata (status, timestamps, platform). When the process restarts, connections are rebuilt via node reconnection; DB reflects current truth.

---

## Scalability Considerations

The v1 architecture is intentionally single-process. All of the above applies to a single Uvicorn worker.

| Concern | At v1 (single process) | If horizontal scaling needed later |
|---------|----------------------|-------------------------------------|
| WebSocket connection state | In-memory dict in NodeRegistry | Redis hash for node→connection metadata; sticky routing so each node stays on one server |
| Event fan-out | In-process asyncio queues | Redis Pub/Sub per team or instance channel; each server subscribes and delivers to its local frontend clients |
| Database | Single async pool | Read replicas for dashboard queries; write primary for lifecycle events |
| Whisper | Synchronous HTTP call per request | Task queue (Celery/ARQ) if audio processing becomes a bottleneck |

v1 constraint from PROJECT.md: "Horizontal server scaling — single-instance server for v1." The above patterns are not premature optimization warnings — they are documented so the build avoids anti-patterns that would make horizontal scaling impossible later (e.g., anti-pattern 6 above).

---

## Sources

- [FastAPI WebSocket Advanced Usage — Official Docs](https://fastapi.tiangolo.com/advanced/websockets/) (HIGH confidence)
- [Advanced WebSocket Architectures in FastAPI for High Performance Real-Time Systems](https://hexshift.medium.com/how-to-incorporate-advanced-websocket-architectures-in-fastapi-for-high-performance-real-time-b48ac992f401) (MEDIUM confidence — verified patterns against official docs)
- [Developing a Real-time Dashboard with FastAPI, Postgres, and WebSockets — TestDriven.io](https://testdriven.io/blog/fastapi-postgres-websockets/) (MEDIUM confidence)
- [Building High-Performance Async APIs with FastAPI, SQLAlchemy 2.0, and Asyncpg — Leapcell](https://leapcell.io/blog/building-high-performance-async-apis-with-fastapi-sqlalchemy-2-0-and-asyncpg) (MEDIUM confidence)
- [WebSocket Notifications with FastAPI — Connection Management, Rooms, Reconnection](https://blog.greeden.me/en/2025/10/28/weaponizing-real-time-websocket-sse-notifications-with-fastapi-connection-management-rooms-reconnection-scale-out-and-observability/) (MEDIUM confidence)
- [Scalable WebSocket Architecture — Hathora](https://blog.hathora.dev/scalable-websocket-architecture/) (MEDIUM confidence)
- `server-spec.md` and `protocol-spec.md` in this repository (HIGH confidence — normative specs)

---

## v1.1 Frontend Theme Architecture: Cyberpunk UI Integration

**Domain:** Cyberpunk theme layer on existing React + shadcn/ui + Tailwind v4 frontend
**Researched:** 2026-03-24
**Confidence:** HIGH

This section documents how the cyberpunk theme system integrates with the existing frontend architecture for the v1.1 milestone.

### Theme Layer System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Theme Token Layer                           │
│  src/index.css — single source of truth for all CSS variables   │
│  :root/.dark { --cyber-* }    @theme inline { --color-cyber-* } │
│  @layer utilities { .cyber-* } @keyframes { glow-pulse, etc }   │
├─────────────────────────────────────────────────────────────────┤
│                   Component Layer                               │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  ui/ (CVA    │  │  nodes/  │  │ stream/  │  │ execute/ │    │
│  │  cyber vars) │  │  cards   │  │  panels  │  │  forms   │    │
│  └──────────────┘  └──────────┘  └──────────┘  └──────────┘    │
├─────────────────────────────────────────────────────────────────┤
│                    Layout / Route Layer                         │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  __root.tsx (sidebar + nav) — primary cyberpunk canvas │     │
│  └────────────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────────┤
│                    State / Data Layer (unchanged)               │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐       │
│  │ wsStore  │  │ TanStack     │  │ TanStack Router       │       │
│  │ (zustand)│  │ Query        │  │ (file-based routes)   │       │
│  └──────────┘  └──────────────┘  └──────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Files: Modify vs Leave Alone

| File | Action | What Changes |
|------|--------|--------------|
| `src/index.css` | **MODIFY (primary)** | Add cyberpunk tokens to `.dark`, `@theme inline`, `@layer utilities`, `@keyframes` |
| `routes/__root.tsx` | **MODIFY** | Sidebar: replace hardcoded `bg-gray-900`/`border-gray-800` with cyber tokens; gradient bg, glow nav active state |
| `components/ui/button.tsx` | **MODIFY** | Add `cyber` variant to CVA; add `cyber-ghost` for nav |
| `components/ui/badge.tsx` | **MODIFY** | Wire status colors through cyber token CSS vars |
| `components/ui/card.tsx` | **MODIFY** | Add glow border treatment via `box-shadow` CSS var |
| `components/ui/input.tsx` | **MODIFY** | Cyber focus ring (cyan glow vs default ring) |
| `components/ui/skeleton.tsx` | **MODIFY** | Shimmer color → cyber surface colors |
| `components/nodes/NodeCard.tsx` | **MODIFY** | Replace hardcoded `bg-gray-900`/`border-gray-800` with cyber tokens |
| `components/nodes/NodeStatusBadge.tsx` | **MODIFY** | Replace inline `bg-green-600/20 text-green-400` etc. with cyber semantic tokens |
| `components/nodes/NodeGrid.tsx` | **MODIFY** | Empty state styling |
| `components/stream/StreamPanel.tsx` | **MODIFY** | Header gradient, scroll-to-bottom button cyber style |
| `components/execute/ExecuteForm.tsx` | **MODIFY** | Replace raw `<textarea>`/`<select>` with proper shadcn Input/Select; apply cyber tokens |
| `routes/dashboard/index.tsx` | **MODIFY** | Page header typography, spacing |
| `routes/dashboard/$nodeId.tsx` | **MODIFY** | Panel borders, back button, metadata grid styling |
| `routes/dashboard/audit.tsx` | **MODIFY** | Table header, filter styling |
| `stores/wsStore.ts` | **NO CHANGE** | State logic unaffected by visual layer |
| `hooks/useWebSocket.ts` | **NO CHANGE** | Network logic unaffected |
| `hooks/useAutoScroll.ts` | **NO CHANGE** | Behavior unchanged |
| `lib/api.ts` | **NO CHANGE** | Network layer unchanged |

### New Files to Create

| File | Reason |
|------|--------|
| `components/ui/icon.tsx` | Thin Lucide wrapper enforcing consistent `size` and `strokeWidth={1.5}` |
| `components/ui/progress.tsx` | Add via `npx shadcn add progress` — needed for loading state polish |

### Tailwind v4 Token Architecture

The project already uses `@theme inline` in `index.css` to bridge CSS custom properties to Tailwind utilities. This is the correct v4 pattern. The cyberpunk migration extends this exact pattern:

**Step 1 — Define runtime CSS vars in `.dark` block:**
```css
.dark {
  --cyber-primary: oklch(0.72 0.25 200);          /* neon cyan */
  --cyber-secondary: oklch(0.68 0.30 320);         /* neon magenta */
  --cyber-accent: oklch(0.75 0.28 145);            /* neon green */
  --cyber-danger: oklch(0.65 0.28 25);             /* neon red-orange */
  --cyber-surface: oklch(0.12 0.02 250);           /* near-black blue-tinted */
  --cyber-surface-elevated: oklch(0.16 0.02 250);
  --cyber-border: oklch(0.72 0.25 200 / 25%);
  --cyber-glow-primary: 0 0 12px oklch(0.72 0.25 200 / 60%);
  --cyber-glow-secondary: 0 0 12px oklch(0.68 0.30 320 / 60%);
}
```

**Step 2 — Wire into `@theme inline` to generate utility classes:**
```css
@theme inline {
  /* ... existing mappings ... */
  --color-cyber-primary: var(--cyber-primary);
  --color-cyber-secondary: var(--cyber-secondary);
  --color-cyber-accent: var(--cyber-accent);
  --color-cyber-surface: var(--cyber-surface);
  --color-cyber-surface-elevated: var(--cyber-surface-elevated);
  --color-cyber-border: var(--cyber-border);
}
```

**Step 3 — Add gradient utilities in `@layer utilities`:**
```css
@layer utilities {
  .cyber-gradient-bg {
    background: linear-gradient(
      135deg,
      oklch(0.12 0.02 250) 0%,
      oklch(0.10 0.04 280) 100%
    );
  }
  .cyber-scanlines {
    background-image: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      oklch(0 0 0 / 4%) 2px,
      oklch(0 0 0 / 4%) 4px
    );
  }
}
```

**Step 4 — Animation keyframes in `@theme`:**
```css
@theme {
  --animate-glow-pulse: glow-pulse 2s ease-in-out infinite;
  --animate-status-ping: status-ping 1.5s cubic-bezier(0,0,0.2,1) infinite;
}

@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 4px var(--cyber-primary); }
  50%       { box-shadow: 0 0 16px var(--cyber-primary), 0 0 32px var(--cyber-primary); }
}

@keyframes status-ping {
  75%, 100% { transform: scale(1.5); opacity: 0; }
}
```

After these four steps, components use `bg-cyber-surface`, `text-cyber-primary`, `border-cyber-border`, `animate-glow-pulse` as standard Tailwind classes. No hardcoded oklch values in component files.

### CVA Cyber Variant Pattern

The button and badge already use class-variance-authority. Add a `cyber` variant alongside existing variants — do not replace `default`:

```typescript
// components/ui/button.tsx — add to buttonVariants
cyber: [
  "border border-cyber-primary/40",
  "bg-cyber-primary/10 text-cyber-primary",
  "hover:bg-cyber-primary/20 hover:border-cyber-primary/70",
  "hover:shadow-[var(--cyber-glow-primary)]",
  "transition-all duration-200",
].join(" "),
```

The `cyber` variant is opt-in per callsite. Existing uses of `variant="default"` and `variant="ghost"` remain unchanged.

### Icon Integration

`lucide-react` v1 is already installed and partially used (`Monitor`, `Clock`, `ArrowLeft`, `ArrowDown`, `LogOut`). The existing usage is inconsistent — some icons use `h-4 w-4`, some `h-3 w-3`. A thin `Icon` wrapper at `components/ui/icon.tsx` enforces `strokeWidth={1.5}` (lighter than Lucide's default 2 — better for cyberpunk aesthetic) and a consistent size scale:

```typescript
interface IconProps {
  icon: LucideIcon
  size?: 'xs' | 'sm' | 'md' | 'lg'  // maps to size-3 / size-3.5 / size-4 / size-5
  className?: string
}
```

All new icon additions go through this wrapper. Existing usages can be migrated in the same pass.

### Animation Layer

Three animation layers stack without conflict:

1. **tw-animate-css** (already imported): Handles entrance/exit — `animate-in fade-in slide-in-from-top-2` for panel transitions, toast notifications
2. **Custom `@keyframes`** in `@theme`: Handles ambient persistent animations — `animate-glow-pulse` on connected node status indicators, `animate-status-ping` for live instance running state
3. **Tailwind `transition-*` utilities**: Handles hover/focus micro-interactions — `transition-all duration-200` on card hover, button press

No CSS animation state lives in React (no `useState` for animation triggers). All animations are CSS-driven.

### No Theme State Required

The app is dark-only — `__root.tsx` hardcodes `bg-gray-950` and `text-gray-100`. The existing `@custom-variant dark (&:is(.dark *))` activates all `.dark` block tokens when `class="dark"` is on `<html>`. `next-themes` is installed but not wired up, which is correct — do not add a `ThemeProvider` wrapper.

Ensure `<html class="dark">` is present in `index.html` or set on document mount. All cyberpunk tokens activate automatically. Zero Zustand or React context is needed for theme state.

### Build Order for v1.1 Implementation

Dependencies between layers determine the correct sequence:

```
1. Token Foundation (src/index.css)
   Cyberpunk CSS vars, @theme wiring, @layer utilities, @keyframes
   — everything downstream depends on tokens existing first

2. Base Component Variants (button, badge, card, input, skeleton, icon wrapper)
   — route layouts compose these components

3. Root Layout + Navigation (__root.tsx)
   — pages inherit the sidebar/chrome

4. Domain Components (NodeCard, NodeStatusBadge, StreamPanel, ExecuteForm)
   — compose base components; can now apply cyber variants

5. Loading States + Micro-interactions (skeleton, progress, animate-in classes)
   — polish layer; safe to add after structure is correct

6. Typography + Spacing Pass (all dashboard routes)
   — final visual hierarchy sweep across all pages
```

### Frontend Theme Anti-Patterns

**Do not hardcode oklch/hex values in component files.** Every color must go through a `--cyber-*` token defined in `index.css`. Use arbitrary values (`bg-[#0a0a1a]`) only for truly one-off values with no token equivalent — and there should be none in a properly tokenized theme.

**Do not override `@theme inline` to change semantic shadcn tokens.** The `@theme inline` block inlines values at build time — it does not respond to dark/light context switching. Cyberpunk color overrides belong in the `:root` / `.dark` blocks (runtime variables), which is how `index.css` is already structured.

**Do not re-run `shadcn add` with a different style.** `components.json` is locked to `base-nova` (`@base-ui/react` primitives). Running `shadcn add` with a conflicting style will break existing components. New components (e.g., `progress`, `dialog`) must be added as `base-nova` and then styled via CSS variable overrides.

**Do not add animation CSS to individual component files.** All `@keyframes` belong in `index.css` under `@theme`. Component files only apply utility class names.

### Sources

- [Tailwind CSS v4 Theme Variables](https://tailwindcss.com/docs/theme) — `@theme inline` semantics, CSS custom property exposure — HIGH confidence
- [shadcn/ui Tailwind v4 Guide](https://ui.shadcn.com/docs/tailwind-v4) — CSS variable structure, dark mode pattern — HIGH confidence
- [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) — Tailwind v4 compatible animation library (already installed) — HIGH confidence
- [Lucide React sizing guide](https://lucide.dev/guide/react/basics/sizing) — strokeWidth prop, size defaults — HIGH confidence
- Codebase inspection: `frontend/src/index.css`, `__root.tsx`, `components/ui/button.tsx`, `NodeCard.tsx`, `StreamPanel.tsx`, `NodeStatusBadge.tsx`, `components.json` — HIGH confidence (direct source)

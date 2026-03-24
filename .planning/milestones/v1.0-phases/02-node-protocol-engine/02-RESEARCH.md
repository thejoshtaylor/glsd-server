# Phase 2: Node Protocol Engine - Research

**Researched:** 2026-03-21
**Domain:** FastAPI WebSocket protocol engine — GSD wire protocol v1.2.0
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `Dict[node_id, NodeConnection]` dataclass storing WebSocket reference + metadata (platform, version, projects, connected_at, last_heartbeat)
- `asyncio.Lock` per node_id for reconnect serialization — prevents RECON-05 concurrent reconciliation races
- Code organized in `backend/app/ws/` package: `manager.py` (ConnectionManager), `handlers.py` (message handlers), `protocol.py` (envelope/message Pydantic models)
- Stream events stored in-memory per instance for later frontend subscription (Phase 4), also persisted to DB for history
- Background asyncio task running in lifespan, scanning every 30 seconds — marks nodes stale after 90s no ping, errors their running instances
- Heartbeats tracked in both in-memory ConnectionManager AND database — in-memory for fast stale checks, DB for persistence across restarts
- Unexpected disconnects: WebSocket exception handler marks node disconnected + errors all running instances in a single DB transaction
- `stream_events` table (instance_id, sequence_num, data JSON, timestamp) for history replay in Phase 4
- Comma-separated `SERVER_TOKEN` env var (e.g., `new_token,old_token`) — both accepted during grace period, admin removes old token when ready
- New/unknown node_id connections: log as warning + persist `first_seen` timestamp on Node record — alerting deferred to Phase 4 dashboard
- Server validates project exists on target node before dispatching execute (checks node's `projects` list from last `node_register`)
- Node WebSocket endpoint at `/ws/node` matching spec exactly; `/ws/frontend` reserved for Phase 4 browser connections

### Claude's Discretion

- Internal implementation details of the WebSocket read/write loop
- Error message formatting for protocol violations
- Logging verbosity and format
- Test structure and organization

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NODE-01 | Server accepts inbound WebSocket connections from nodes at `wss://server/ws/node` | FastAPI WebSocket endpoint + router integration into main.py |
| NODE-02 | Server validates Bearer token during HTTP upgrade handshake (401/403 on failure) | Pre-accept token validation pattern; reject before `websocket.accept()` |
| NODE-03 | Server expects `node_register` as the first frame after WebSocket upgrade | First-frame enforcement in connection handler; close with error if not register |
| NODE-04 | Server tracks node state: `connected`, `stale`, `disconnected` | NodeStatus enum already exists in models/node.py; ConnectionManager tracks in-memory |
| NODE-05 | Server handles node reconnection gracefully (same `node_id`, new connection) | Per-node asyncio.Lock; upsert Node record on re-register; replace old connection ref |
| NODE-06 | Server responds to WebSocket pings with pongs (standard protocol behavior) | FastAPI/Starlette handles WS pongs automatically via underlying `websockets` library |
| NODE-07 | Server tracks `last_heartbeat` per node, marks stale after >90s no ping | Background lifespan task; ping event handler updates last_heartbeat timestamp |
| NODE-08 | Server handles `node_disconnect` frame and marks node as disconnected | `node_disconnect` handler in handlers.py; graceful path |
| NODE-09 | Server marks all instances as errored when node drops unexpectedly | Exception/disconnect handler; single DB transaction to bulk-error all running instances |
| RECON-01 | On reconnect, server compares node's `running_instances` with tracked instances | Reconciliation logic in node_register handler |
| RECON-02 | Instances in server but not in node's list are marked as errored/lost | Set errored on instances missing from reconnect payload |
| RECON-03 | Instances in node's list but not in server are added as running | Insert new Instance rows discovered from node's running_instances |
| RECON-04 | Instances in both are updated (session_id if changed, confirm running) | Update session_id; confirm status = running |
| RECON-05 | Per-node locking prevents concurrent reconnect races from corrupting state | `asyncio.Lock` per node_id in ConnectionManager |
| CMD-01 | Server can send `execute` command with server-generated `instance_id` (UUID) | `uuid.uuid4()` for instance_id; Envelope format from protocol.py |
| CMD-02 | Server can send `kill` command to terminate a running instance | KillCmd payload; send via ConnectionManager |
| CMD-03 | Server can send `status_request` to query current node state | Empty payload StatusRequest envelope |
| CMD-04 | Server validates project exists on target node before dispatching execute | Check node's `projects` list from ConnectionManager / DB |
| CMD-05 | Server validates target node is connected before dispatching commands | Check ConnectionManager has active WebSocket for node_id |
| INST-01 | Server tracks instance status: `pending`, `running`, `finished`, `errored` | InstanceStatus enum exists; Instance model exists |
| INST-02 | Server processes `ack` and marks instance as running | ACK handler; correlate via envelope id; update DB |
| INST-03 | Server processes `instance_started` and captures `session_id` | Handler updates Instance.session_id + started_at |
| INST-04 | Server forwards `stream_event` data to subscribed frontend clients | In-memory buffer for Phase 4; this phase: persist only (no frontend yet) |
| INST-05 | Server processes `instance_finished` with exit code | Handler marks finished; records exit_code + finished_at |
| INST-06 | Server processes `instance_error` with error message | Handler marks errored; records error + finished_at |
| INST-07 | Server correctly handles rate-limited execute (immediate `instance_error`, no ack) | Rate-limited path: no ACK, immediate instance_error transitions instance to errored |
| TOKN-01 | Server supports rotating `SERVER_TOKEN` without disconnecting live nodes | Comma-split SERVER_TOKEN; validate against set of tokens |
| TOKN-02 | During rotation, both old and new tokens are accepted in a grace period | Multi-token validation in upgrade handler |
| TOKN-03 | Admin can revoke old token after grace period | Restart with single-token SERVER_TOKEN; live connections unaffected (token validated at upgrade only) |

</phase_requirements>

---

## Summary

Phase 2 builds the core WebSocket engine that GSD nodes connect to. It is the most protocol-critical phase in the project: nodes at v1.2.0 are already deployed and will immediately begin connecting once the endpoint is live. Every implementation choice must match `protocol-spec.md` exactly — there is no opportunity to negotiate with the node side.

The phase is entirely server-side Python. The database models (`Node`, `Instance`, `AuditLog`) and async session infrastructure are already laid down from Phase 1. This phase adds: (1) the `backend/app/ws/` package (Pydantic protocol models, ConnectionManager, message handlers); (2) the `/ws/node` FastAPI WebSocket endpoint; (3) a health-monitor background task registered in the lifespan; (4) a new `stream_events` Alembic migration; and (5) token-rotation parsing in `config.py`.

The dominant implementation challenge is the long-lived WebSocket connection loop. FastAPI/Starlette's async WebSocket does not provide automatic per-connection coroutine management — the developer owns the `while True: receive / dispatch` loop and must safely handle disconnects, write errors, and re-entrancy around the asyncio.Lock during reconnect. All DB work must use short-lived sessions (one session per operation, not one session per connection) to avoid connection pool exhaustion.

**Primary recommendation:** Build the `ws/` package as three focused modules (`protocol.py` → Pydantic, `manager.py` → in-memory state, `handlers.py` → message dispatch to DB), integrate the router into `main.py`, then layer the health monitor as a lifespan background task. The ACK correlation detail (envelope ID echo) and the rate-limit path (no ACK before `instance_error`) are the most protocol-precise requirements and must be tested explicitly.

---

## Standard Stack

### Core (already installed — no new packages needed for this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.115+ | WebSocket endpoint, HTTP upgrade rejection | `WebSocket` type in route handlers; reject via `raise WebSocketException` or return before `accept()` |
| Starlette (bundled) | 0.40+ | Underlying WS transport; ping/pong auto-response | Starlette's `websockets` backend responds to WS-level pings natively — no application code needed for NODE-06 |
| Pydantic v2 | 2.x | `protocol.py` envelope + payload models | `model_validate()` for inbound frames; `model_dump(exclude_none=True)` for outbound |
| SQLAlchemy async | 2.0.44+ | DB operations in handlers | Short-lived `AsyncSession` per operation via `get_session_maker()()` context manager |
| asyncpg | 0.31.0 | PostgreSQL driver | Already selected; no change |
| Python asyncio | stdlib | `asyncio.Lock` per node, background tasks | `asyncio.create_task()` in lifespan for health monitor |

### New Package — None Required

All necessary packages are present in `requirements.txt`. This phase adds no new dependencies.

### Alembic Migration Required

A new migration is needed to add the `stream_events` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT autoincrement PK | |
| `instance_id` | VARCHAR(36) FK → instances.instance_id | |
| `sequence_num` | INTEGER | Per-instance ordering |
| `data` | JSON | Raw NDJSON payload from `stream_event.data` |
| `created_at` | TIMESTAMP | Server receive time |

Index on `(instance_id, sequence_num)` for replay queries.

**Migration file:** `backend/alembic/versions/0002_add_stream_events.py`

---

## Architecture Patterns

### Recommended Project Structure

```
backend/app/ws/
├── __init__.py          # exports: connection_manager, router
├── protocol.py          # Pydantic envelope + all 10 message payload models
├── manager.py           # ConnectionManager: in-memory state, per-node asyncio.Lock
├── handlers.py          # handle_node_register, handle_ack, handle_stream_event, ...
└── router.py            # FastAPI APIRouter with /ws/node endpoint
```

### Pattern 1: WebSocket Endpoint with Pre-Accept Auth (NODE-02)

Authentication MUST happen before `websocket.accept()`. FastAPI's `WebSocket` object is the connection before upgrade — calling `websocket.close()` on an unaccepted WebSocket sends an HTTP error response.

```python
# backend/app/ws/router.py
from fastapi import APIRouter, WebSocket, WebSocketException, status
from app.config import get_settings

router = APIRouter()

@router.websocket("/ws/node")
async def node_ws_endpoint(websocket: WebSocket):
    settings = get_settings()
    # Validate Bearer token BEFORE accept()
    auth = websocket.headers.get("authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    valid_tokens = {t.strip() for t in settings.server_token.split(",")}
    if token not in valid_tokens:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    # ... connection handling
```

**Important nuance:** FastAPI WebSocket routes cannot return HTTP 401/403 after the WebSocket upgrade request has been received — they can only close with a WS close code. The spec says nodes interpret an HTTP-level rejection (pre-upgrade) as a 401/403. However, in FastAPI, the WebSocket route handler receives the connection already at the upgrade stage. Use `websocket.close(code=1008)` for unauthorized connections before calling `accept()`, or use an HTTP middleware to reject at the TCP level.

**Verified approach (HIGH confidence):** Reject with `websocket.close()` before `accept()` — this sends an HTTP 403 response before the upgrade completes in Starlette. The node sees a failed upgrade and applies exponential backoff.

### Pattern 2: NodeConnection Dataclass

```python
# backend/app/ws/manager.py
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from fastapi import WebSocket

@dataclass
class NodeConnection:
    node_id: str
    websocket: WebSocket
    platform: str
    version: str
    projects: list[str]
    connected_at: datetime
    last_heartbeat: datetime
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
```

### Pattern 3: ConnectionManager (In-Memory Registry)

```python
# backend/app/ws/manager.py
class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, NodeConnection] = {}
        self._node_locks: dict[str, asyncio.Lock] = {}

    def get_lock(self, node_id: str) -> asyncio.Lock:
        if node_id not in self._node_locks:
            self._node_locks[node_id] = asyncio.Lock()
        return self._node_locks[node_id]

    def register(self, conn: NodeConnection) -> None:
        self._connections[conn.node_id] = conn

    def deregister(self, node_id: str) -> NodeConnection | None:
        return self._connections.pop(node_id, None)

    def get(self, node_id: str) -> NodeConnection | None:
        return self._connections.get(node_id)

    def update_heartbeat(self, node_id: str, ts: datetime) -> None:
        if conn := self._connections.get(node_id):
            conn.last_heartbeat = ts

    def all_connections(self) -> list[NodeConnection]:
        return list(self._connections.values())

connection_manager = ConnectionManager()  # module-level singleton
```

### Pattern 4: Protocol Pydantic Models

```python
# backend/app/ws/protocol.py
import secrets
from typing import Any
from pydantic import BaseModel

def new_msg_id() -> str:
    """Generate a 32-char hex message ID (16 random bytes)."""
    return secrets.token_hex(16)

class Envelope(BaseModel):
    type: str
    id: str
    payload: dict[str, Any] | None = None

# Outbound (node-to-server) payloads
class InstanceSummary(BaseModel):
    instance_id: str
    project: str
    session_id: str | None = None

class NodeRegisterPayload(BaseModel):
    node_id: str
    platform: str
    version: str
    projects: list[str]
    running_instances: list[InstanceSummary]

class AckPayload(BaseModel):
    instance_id: str

class StreamEventPayload(BaseModel):
    instance_id: str
    data: str  # double-encoded JSON — use json.loads(payload.data) to inspect

class InstanceStartedPayload(BaseModel):
    instance_id: str
    project: str
    session_id: str | None = None

class InstanceFinishedPayload(BaseModel):
    instance_id: str
    exit_code: int

class InstanceErrorPayload(BaseModel):
    instance_id: str
    error: str

class NodeDisconnectPayload(BaseModel):
    reason: str | None = None

# Inbound (server-to-node) payloads
class ExecutePayload(BaseModel):
    instance_id: str
    project: str
    work_dir: str
    prompt: str
    session_id: str | None = None

class KillPayload(BaseModel):
    instance_id: str

class StatusRequestPayload(BaseModel):
    pass  # empty payload
```

### Pattern 5: Message Dispatch Loop

```python
# backend/app/ws/router.py  (inner connection handler)
import json
from app.ws.protocol import Envelope

async def handle_connection(websocket: WebSocket, node_id_from_register: str):
    try:
        while True:
            raw = await websocket.receive_text()
            envelope = Envelope.model_validate_json(raw)
            await dispatch(envelope, websocket)
    except WebSocketDisconnect:
        await on_disconnect(node_id_from_register, unexpected=True)
    except Exception as exc:
        logger.error("WS error for node %s: %s", node_id_from_register, exc)
        await on_disconnect(node_id_from_register, unexpected=True)
```

### Pattern 6: Short-Lived DB Sessions in WebSocket Handlers

The `get_db` FastAPI dependency uses `Depends()` which is incompatible with raw WebSocket handlers called from a long-lived loop. Use the session maker directly:

```python
# backend/app/ws/handlers.py
from app.database import get_session_maker

async def handle_ack(payload: AckPayload) -> None:
    async with get_session_maker()() as session:
        try:
            instance = await session.get(Instance, payload.instance_id)
            if instance:
                instance.status = InstanceStatus.running
                await session.commit()
        except Exception:
            await session.rollback()
            raise
```

This is the established pattern from `dependencies.py`'s `get_db` — replicated manually inside handlers to avoid the Depends() injection chain.

### Pattern 7: Stale Node Background Task

```python
# backend/app/ws/health.py
import asyncio
from datetime import datetime, timezone, timedelta
from app.ws.manager import connection_manager

STALE_THRESHOLD_SECONDS = 90
SCAN_INTERVAL_SECONDS = 30

async def stale_node_scanner():
    while True:
        await asyncio.sleep(SCAN_INTERVAL_SECONDS)
        now = datetime.now(timezone.utc)
        for conn in connection_manager.all_connections():
            if conn.last_heartbeat:
                age = (now - conn.last_heartbeat).total_seconds()
                if age > STALE_THRESHOLD_SECONDS:
                    await mark_node_stale(conn.node_id)
```

Register in lifespan:

```python
# backend/app/main.py  (lifespan extension)
from app.ws.health import stale_node_scanner

@asynccontextmanager
async def lifespan(app: FastAPI):
    scanner_task = asyncio.create_task(stale_node_scanner())
    yield
    scanner_task.cancel()
    try:
        await scanner_task
    except asyncio.CancelledError:
        pass
    engine = get_engine()
    await engine.dispose()
```

### Pattern 8: Token Rotation (TOKN-01/02/03)

```python
# backend/app/config.py  (addition)
class Settings(BaseSettings):
    # ... existing fields ...
    server_token: str  # comma-separated: "new_token" or "new_token,old_token"

    @property
    def valid_tokens(self) -> frozenset[str]:
        return frozenset(t.strip() for t in self.server_token.split(",") if t.strip())
```

Token validation at upgrade uses `settings.valid_tokens`. Revoking the old token requires restarting the server with `SERVER_TOKEN=new_token_only` — already-connected nodes authenticated with the old token remain connected since validation happens only at upgrade time.

### Pattern 9: Outbound Envelope Sending

```python
# backend/app/ws/manager.py
import json

async def send_to_node(self, node_id: str, msg_type: str, payload: BaseModel | None) -> bool:
    conn = self._connections.get(node_id)
    if not conn:
        return False
    envelope = {
        "type": msg_type,
        "id": new_msg_id(),
    }
    if payload is not None:
        envelope["payload"] = payload.model_dump(exclude_none=True)
    await conn.websocket.send_text(json.dumps(envelope))
    return True
```

### Anti-Patterns to Avoid

- **Holding a DbSession for the connection lifetime:** SQLAlchemy async sessions are not thread-safe and pool connections are finite. One long-lived session per WebSocket = pool exhaustion under load. Each handler acquires and releases its own session.
- **Calling `websocket.send_text()` from multiple coroutines concurrently:** Concurrent writes to a WebSocket cause protocol errors. Use a single write path (one coroutine writes, others queue). For Phase 2 with low concurrency this is less critical but the manager's `send_to_node` should be the only write path.
- **Storing DbSession in ConnectionManager:** The manager is in-memory state; sessions belong to individual operations.
- **Using `json.loads()` on the outer envelope before Pydantic:** Let Pydantic's `model_validate_json()` parse the envelope in one step.
- **Calling `await websocket.accept()` inside the reconnect lock:** Accept happens before the lock. The lock wraps only the reconciliation logic triggered by `node_register`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket ping/pong response | Custom pong handler | FastAPI/Starlette built-in | Starlette's websockets lib responds to WS pings automatically; no application code needed |
| 32-char hex message IDs | Custom entropy function | `secrets.token_hex(16)` | Cryptographically random, exactly 32 hex chars — matches node's `NewMsgID()` |
| Server-generated UUIDs | Custom ID scheme | `str(uuid.uuid4())` | Standard UUID4 is what the spec calls "server-assigned UUID" |
| Pydantic JSON parsing | `json.loads()` + dict access | `model_validate_json()` | Catches schema violations; produces typed objects |
| asyncio task lifecycle | Manual task lists | `asyncio.create_task()` in lifespan | FastAPI lifespan is the correct lifecycle anchor for background tasks |

**Key insight:** The node already handles its own ping sending and backoff. The server's job is purely reactive — accept pings, respond with pongs (automatic), track the timestamp. Don't build complex heartbeat machinery on the server side.

---

## Common Pitfalls

### Pitfall 1: Pre-Accept Auth in FastAPI WebSocket Routes
**What goes wrong:** Calling `websocket.accept()` before validating the token means you must close with a WS close code instead of an HTTP 401/403. Nodes interpret WS close code 1008 as unauthorized and apply exponential backoff correctly.
**Why it happens:** FastAPI routes receive the WebSocket object after the HTTP upgrade request but before the upgrade is completed. There is no "return HTTP 401" from a WebSocket route function.
**How to avoid:** Always call `websocket.close(code=1008)` and `return` before `websocket.accept()` when the token is invalid. Do NOT call `accept()` first.
**Warning signs:** If you see nodes connecting and immediately disconnecting with WS errors rather than HTTP errors, auth rejection is happening post-accept.

### Pitfall 2: ACK Correlation — Envelope ID Reuse
**What goes wrong:** Generating a new random ID for the ACK envelope instead of echoing the `execute` envelope's `id`.
**Why it happens:** The `new_msg_id()` helper is used for all server-originated messages; developers forget that ACKs are node-originated and must echo the inbound ID.
**How to avoid:** In the ACK handler, explicitly set `ack_envelope.id = inbound_execute_envelope.id`. Document this in a code comment citing the protocol spec.
**Warning signs:** Server's ACK correlation logic fails to match ACKs to their execute commands.

### Pitfall 3: Rate-Limited Execute — No ACK Sent
**What goes wrong:** When a node sends `instance_error` with `"rate limited"` immediately after `execute`, server logic that waits for an ACK before marking the instance as running will deadlock or leave the instance in `pending` forever.
**Why it happens:** The normal flow is `execute → ack → instance_started → ... → terminal`. The rate-limit path skips both ACK and `instance_started`.
**How to avoid:** The `instance_error` handler must be able to transition an instance from `pending` directly to `errored` — not just from `running` to `errored`.
**Warning signs:** Instances stuck in `pending` status after rate-limit errors.

### Pitfall 4: Running Instances Left in `running` on Unexpected Disconnect (NODE-09)
**What goes wrong:** Node disconnects without sending terminal events for running instances. Server's instance table shows instances permanently in `running` status.
**Why it happens:** The `WebSocketDisconnect` exception exits the handler loop but nothing updates instance status.
**How to avoid:** The disconnect handler (both for clean `node_disconnect` and unexpected `WebSocketDisconnect`) must bulk-error all instances in `running` or `pending` status for that `node_id` in a single DB transaction.
**Warning signs:** Growing count of `running` instances for `disconnected` nodes.

### Pitfall 5: asyncio.Lock Scope During Reconnect (RECON-05)
**What goes wrong:** Per-node lock held for the entire WebSocket connection lifetime blocks legitimate reconnects during the lock period.
**Why it happens:** Lock scope is too broad.
**How to avoid:** Lock should wrap only the reconciliation logic inside the `node_register` handler — acquire lock, reconcile, release lock. The long-lived receive loop runs outside the lock.
**Warning signs:** New connection for a node hangs indefinitely because the lock is held by a previous connection's loop.

### Pitfall 6: DB Sessions Held Across `await websocket.receive_text()`
**What goes wrong:** Acquiring a DB session before entering the receive loop and holding it across `await websocket.receive_text()` calls. The session's connection sits idle in a transaction, eating pool capacity.
**Why it happens:** Developers pattern-match against normal FastAPI HTTP handlers where session lifetime = request lifetime.
**How to avoid:** Never acquire a DB session at the top of the WebSocket loop. Acquire + release per handler call using the context manager pattern.
**Warning signs:** PostgreSQL shows many idle-in-transaction connections; connection pool exhaustion under load.

### Pitfall 7: `stream_event.data` is Double-Encoded JSON
**What goes wrong:** Storing or forwarding `stream_event.data` as a raw string without noting it is itself JSON-encoded. Frontend/consumers receive a JSON string that must be parsed again.
**Why it happens:** The NDJSON line is already JSON; the node JSON-encodes it again as a string value inside the `data` field.
**How to avoid:** When persisting to `stream_events` table, store `json.loads(payload.data)` in the JSON column, not the raw string. Document in `StreamEventPayload` with a comment.
**Warning signs:** Consumers receiving `"{\\"type\\":\\"text\\"...}"` as a string instead of `{"type":"text"...}` as a parsed object.

---

## Code Examples

### Envelope Sending with Correct ID Handling

```python
# Source: protocol-spec.md Section 3.1.2 — ACK correlation requirement
import json, secrets

def new_msg_id() -> str:
    return secrets.token_hex(16)

# For server-originated commands (execute, kill, status_request)
def build_envelope(msg_type: str, payload: dict) -> str:
    return json.dumps({"type": msg_type, "id": new_msg_id(), "payload": payload})

# For ACK — must echo the inbound execute envelope's ID
def build_ack_envelope(execute_envelope_id: str, instance_id: str) -> str:
    # NOTE: id = execute_envelope_id, NOT new_msg_id()
    return json.dumps({
        "type": "ack",
        "id": execute_envelope_id,  # Protocol spec: ACK reuses execute envelope ID
        "payload": {"instance_id": instance_id}
    })
```

### State Reconciliation Logic

```python
# Source: server-spec.md Section 6
async def reconcile_instances(
    node_id: str,
    node_running: list[InstanceSummary],
    session: AsyncSession
) -> None:
    node_ids = {s.instance_id for s in node_running}

    # Fetch all non-terminal instances tracked for this node
    result = await session.execute(
        select(Instance).where(
            Instance.node_id == node_id,
            Instance.status.in_([InstanceStatus.pending, InstanceStatus.running])
        )
    )
    server_instances = {inst.instance_id: inst for inst in result.scalars()}
    server_ids = set(server_instances.keys())

    # In server but NOT in node's list → mark errored/lost
    for lost_id in server_ids - node_ids:
        server_instances[lost_id].status = InstanceStatus.errored
        server_instances[lost_id].error = "lost: node reconnected without this instance"
        server_instances[lost_id].finished_at = datetime.now(timezone.utc)

    # In node's list but NOT in server → add as running (server restart case)
    for summary in node_running:
        if summary.instance_id not in server_ids:
            session.add(Instance(
                instance_id=summary.instance_id,
                node_id=node_id,
                project=summary.project,
                session_id=summary.session_id,
                status=InstanceStatus.running,
            ))

    # In both → update session_id if changed
    for summary in node_running:
        if summary.instance_id in server_instances:
            inst = server_instances[summary.instance_id]
            if summary.session_id and inst.session_id != summary.session_id:
                inst.session_id = summary.session_id
            inst.status = InstanceStatus.running

    await session.commit()
```

### Bulk-Error Instances on Disconnect

```python
# Source: server-spec.md Section 7
from sqlalchemy import update

async def error_all_running_instances(node_id: str, session: AsyncSession) -> None:
    await session.execute(
        update(Instance)
        .where(
            Instance.node_id == node_id,
            Instance.status.in_([InstanceStatus.pending, InstanceStatus.running])
        )
        .values(
            status=InstanceStatus.errored,
            error="node disconnected unexpectedly",
            finished_at=datetime.now(timezone.utc)
        )
    )
    await session.commit()
```

### Execute Command Dispatch

```python
# Source: server-spec.md Section 4
import uuid, json

async def dispatch_execute(
    node_id: str,
    project: str,
    work_dir: str,
    prompt: str,
    session_id: str | None = None
) -> str:
    """Creates instance record, dispatches execute command, returns instance_id."""
    conn = connection_manager.get(node_id)
    if not conn:
        raise ValueError(f"Node {node_id} is not connected")
    if project not in conn.projects:
        raise ValueError(f"Project {project!r} not found on node {node_id}")

    instance_id = str(uuid.uuid4())

    # Persist pending instance BEFORE sending command
    async with get_session_maker()() as session:
        session.add(Instance(
            instance_id=instance_id,
            node_id=node_id,
            project=project,
            prompt=prompt,
            session_id=session_id,
            status=InstanceStatus.pending,
        ))
        await session.commit()

    payload = {"instance_id": instance_id, "project": project,
               "work_dir": work_dir, "prompt": prompt}
    if session_id:
        payload["session_id"] = session_id

    envelope = json.dumps({"type": "execute", "id": new_msg_id(), "payload": payload})
    await conn.websocket.send_text(envelope)
    return instance_id
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `websockets` lib directly | FastAPI `WebSocket` type | FastAPI 0.63+ | Integrated auth + dependency injection via HTTP upgrade handler |
| python-jose for JWT | PyJWT 2.x | FastAPI docs updated ~2024 | python-jose abandoned; PyJWT is the current standard |
| passlib for password hashing | pwdlib | FastAPI docs updated ~2024 | passlib abandoned; broke with bcrypt 5.0.0 |
| Manual ping/pong in app code | Starlette auto-pong | Starlette current | WS-level pings from nodes handled transparently |

**Not applicable to this phase:** JWT auth, password hashing — those are Phase 3.

---

## Open Questions

1. **Heartbeat update mechanism — how does the server know when a ping arrives?**
   - What we know: Starlette responds to WS pings automatically. The application receives no notification of individual pings — pings are handled at the transport layer.
   - What's unclear: There is no `on_ping` callback in FastAPI/Starlette's WebSocket API. `last_heartbeat` cannot be updated per-ping unless we track it differently.
   - Recommendation: Update `last_heartbeat` on any received message (any inbound frame resets the stale timer) OR use time of last successful `receive_text()` as a proxy. The stale threshold (90s) is generous; updating on any received message is sufficient and avoids needing a ping callback. Document this choice clearly.

2. **Alembic migration for `stream_events` — enum collision risk?**
   - What we know: The established pitfall (from STATE.md) is not calling `enum.create()` explicitly before `op.create_table()` — Alembic's DDL fires `_on_table_create` anyway, causing DuplicateObjectError.
   - What's unclear: `stream_events` uses no new enum types — only existing `instance_id` FK and JSON/INT/TIMESTAMP columns. No enum risk for this migration.
   - Recommendation: Straightforward migration, no enum complications. Follow the same style as `0001_initial_schema.py`.

3. **Command dispatch API surface for Phase 3 (REST endpoints)**
   - What we know: Phase 3 will expose REST endpoints (`POST /api/execute`, `POST /api/kill`) that call into the dispatch logic built here.
   - What's unclear: Whether the dispatch functions in Phase 2 should be designed as a thin service layer (importable by Phase 3 routers) or as inline WebSocket handler logic.
   - Recommendation: Expose `dispatch_execute()`, `dispatch_kill()`, `dispatch_status_request()` as standalone async functions in `backend/app/ws/manager.py` or a new `backend/app/ws/commands.py`. Phase 3 routers import and call them. This avoids rewriting dispatch logic in Phase 3.

---

## Sources

### Primary (HIGH confidence)
- `protocol-spec.md` (project file) — all 10 message types, envelope format, sequence diagrams, authentication handshake, heartbeat spec
- `server-spec.md` (project file) — data models, command dispatch, state reconciliation algorithm, health monitoring, token rotation
- `backend/app/models/node.py` — existing Node model with NodeStatus enum
- `backend/app/models/instance.py` — existing Instance model with InstanceStatus enum
- `backend/app/database.py` — async session pattern
- `backend/app/dependencies.py` — short-lived session pattern (get_db)
- `backend/app/config.py` — Settings/pydantic-settings pattern
- `backend/app/main.py` — lifespan extension point
- `.planning/STATE.md` — locked decisions: asyncio.Lock per node, stream events not persisted (contradicts CONTEXT.md; CONTEXT.md is authoritative and specifies DB persistence IS required)
- `.planning/phases/02-node-protocol-engine/02-CONTEXT.md` — all locked implementation decisions

### Secondary (MEDIUM confidence)
- FastAPI official docs: https://fastapi.tiangolo.com/advanced/websockets/ — WebSocket endpoint patterns
- FastAPI WebSocket auth patterns — https://dev.to/hamurda/how-i-solved-websocket-authentication-in-fastapi-and-why-depends-wasnt-enough-1b68

### Tertiary (LOW confidence — training data, not freshly verified)
- Starlette WebSocket auto-pong behavior (WS-level pings handled transparently by the `websockets` library backend)

---

## Metadata

**Confidence breakdown:**
- Protocol implementation: HIGH — spec is complete, normative, and in the repository
- Standard stack: HIGH — all packages already installed; no new decisions needed
- Architecture: HIGH — patterns derived directly from existing Phase 1 code + locked decisions from CONTEXT.md
- State reconciliation: HIGH — algorithm fully specified in server-spec.md Section 6
- Pitfalls: HIGH — most derived from spec details and STATE.md accumulated context; heartbeat tracking is MEDIUM (Starlette internals not freshly verified)

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable domain; FastAPI WebSocket API changes infrequently)

---

## Note on STATE.md vs CONTEXT.md Conflict

STATE.md (accumulated from Phase 1) records: "Stream events not persisted to DB — only terminal state transitions written to PostgreSQL." CONTEXT.md (Phase 2 user decisions) explicitly requires: "Stream events stored in-memory per instance for later frontend subscription (Phase 4), also persisted to DB for history" with a dedicated `stream_events` table. CONTEXT.md is the authoritative source for Phase 2 decisions. The planner must implement DB persistence for stream events.

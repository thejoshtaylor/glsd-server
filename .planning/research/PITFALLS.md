# Pitfalls Research

**Domain:** WebSocket server for distributed node management — Python FastAPI, real-time streaming, multi-tenancy
**Researched:** 2026-03-20
**Confidence:** HIGH (protocol spec is normative; framework pitfalls verified against official docs and community sources)

---

## Critical Pitfalls

### Pitfall 1: Multiple Uvicorn Workers Destroy In-Memory Connection State

**What goes wrong:**
The node connection registry (the dict mapping `node_id` to active WebSocket objects) is stored in a single Python process's memory. If you run `uvicorn --workers 4` or use Gunicorn with multiple workers, each worker process has its own completely independent copy of that dict. Node A connects to worker 1. The frontend asks worker 2 for Node A's status. Worker 2's registry is empty — it returns "not connected." Commands dispatched via worker 2 can never reach the node on worker 1.

**Why it happens:**
FastAPI tutorials commonly show `ConnectionManager` as a module-level singleton dict. In development this works because there's one process. In any multi-worker production config it silently breaks — no exception is raised, the registry just returns stale or empty data.

**How to avoid:**
For v1 (single Docker Compose instance), enforce exactly one Uvicorn worker in `docker-compose.yml`: `command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1`. Document this constraint explicitly. Do NOT use `--workers $(nproc)` or the `tiangolo/uvicorn-gunicorn-fastapi` Docker image (which auto-scales workers). If horizontal scaling is needed in future, migrate the connection registry to Redis pub/sub — but that is out of scope for v1.

**Warning signs:**
- Commands to nodes "randomly" fail to reach them
- Frontend shows node as disconnected even though the node logs show an active connection
- State is inconsistent across page refreshes

**Phase to address:** Core WebSocket infrastructure phase (the very first phase). Set `--workers 1` from day one. Never "fix later."

---

### Pitfall 2: Blocking Calls Inside the Async Event Loop

**What goes wrong:**
The FastAPI server handles all WebSocket connections on a single asyncio event loop. Any synchronous blocking call — a sync SQLAlchemy query, `time.sleep()`, a sync HTTP call to OpenAI, a sync file read — freezes the entire event loop. While one `stream_event` is being written to a blocking database query, every other connected node's messages are queued, heartbeat pongs are delayed, and nodes start timing out and reconnecting. Under load this cascades: one slow DB call causes multiple nodes to miss their 90-second pong window.

**Why it happens:**
Python's asyncio requires the developer to explicitly use async libraries. It is easy to accidentally call sync psycopg2 instead of asyncpg, or use the `requests` library instead of `httpx`, or use synchronous Whisper API calls. FastAPI won't warn you — it silently runs the blocking call and starves the event loop.

**How to avoid:**
- Use `asyncpg` / `SQLAlchemy 2.0 async` (`create_async_engine` with `asyncpg`) for all DB operations — never sync SQLAlchemy
- Use `httpx.AsyncClient` for all outbound HTTP (OpenAI Whisper API)
- Use `asyncio.sleep()` not `time.sleep()` in any timed logic
- Run any unavoidably blocking work (e.g., local file operations) in a thread executor: `await asyncio.get_event_loop().run_in_executor(None, blocking_fn)`
- In development, use `blockbuster` or `asyncio-event-loop-monitor` to detect accidental blocking calls

**Warning signs:**
- Node heartbeat timeouts cluster together (multiple nodes go stale simultaneously)
- WebSocket message latency spikes correlate with database query times
- `uvicorn` logs show handler taking many seconds for simple operations

**Phase to address:** Core WebSocket infrastructure phase. Choose async libraries during project setup; retrofitting is expensive.

---

### Pitfall 3: Node Authentication Accepted After `websocket.accept()`

**What goes wrong:**
If you call `await websocket.accept()` before validating the Bearer token, the WebSocket connection is fully established and consuming server resources (file descriptor, memory) for an unauthenticated client. An attacker can open thousands of unauthenticated connections and exhaust server file descriptors before any authentication runs.

**Why it happens:**
FastAPI's `WebSocket` object does not naturally map to the HTTP upgrade handshake model. The common pattern is to `accept()` then authenticate — but this is backwards. FastAPI's dependency injection on WebSocket routes also cannot raise HTTP 401/403 cleanly; raising `HTTPException` in a WebSocket dependency crashes the handler rather than returning a structured error response.

**How to avoid:**
Validate the `Authorization: Bearer {token}` header during the WebSocket route handler, **before** calling `await websocket.accept()`. If validation fails, call `await websocket.close(code=4001)` (use 4000-4999 for application close codes) instead of accepting. Do NOT use FastAPI's standard `Depends(oauth2_scheme)` for node WebSocket auth — nodes send a static Bearer token via `Authorization` header, validated against a database or config before upgrade. For the frontend WebSocket, validate JWT before accepting.

**Warning signs:**
- WebSocket endpoint accepts any connection without inspecting headers
- Server runs out of file descriptors under moderate load
- Authentication errors appear after `accept()` rather than before

**Phase to address:** Core WebSocket infrastructure phase. First line of the WebSocket handler must be auth validation.

---

### Pitfall 4: State Reconciliation Race on Concurrent Reconnect

**What goes wrong:**
A node reconnects and sends `node_register` with `running_instances`. The reconciliation logic reads the server's tracked instances for that node, diffs them, and writes updates. If two rapid reconnects arrive (e.g., a node briefly drops and reconnects within milliseconds — common in flaky networks), both `node_register` handlers may read the same stale snapshot simultaneously. The second reconciliation may re-add instances already marked as lost, or overwrite a correct `errored` state back to `running`.

**Why it happens:**
Asyncio's concurrency model means two coroutines can interleave at any `await` point. A `SELECT` then `UPDATE` sequence for reconciliation has multiple await points, and without explicit serialization, concurrent reconciliations for the same `node_id` will race.

**How to avoid:**
Maintain a per-node asyncio lock (`asyncio.Lock`) in the connection registry, keyed by `node_id`. Any coroutine processing a `node_register` must acquire the lock for that `node_id` before reading or writing reconciliation state. This ensures sequential processing of reconnects for the same node. Since all state changes are funneled through one lock per node, the lock is narrow (per-node, not global) and won't create contention across different nodes.

**Warning signs:**
- Instance status intermittently flips between `running` and `errored` without corresponding events
- Duplicate instances appear in tracking after a node reconnects
- Database constraint violations on instance upsert during high-frequency reconnects

**Phase to address:** State reconciliation phase. Write the lock before writing the reconciliation logic.

---

### Pitfall 5: Treating `stream_event` Data as Plain Text Instead of Nested JSON

**What goes wrong:**
The `stream_event` payload has a `data` field that is a **JSON-serialized string** — it contains a NDJSON line from Claude CLI, which is itself a JSON object encoded as a string. If the server forwards `data` to the frontend as-is (a raw string), the React frontend has to double-parse it. More critically, if the server needs to inspect or filter stream events (e.g., routing by `instance_id`, logging tool use events), it must parse `data` as JSON. Treating it as opaque text breaks any server-side stream processing.

**Why it happens:**
The protocol spec says "data: a single NDJSON line from Claude CLI, JSON-encoded as a string." The double encoding is deliberate — the outer WebSocket frame is JSON, and the inner NDJSON line is also JSON, stored as a string value. It's easy to miss this when reading the spec and assume `data` is already a structured object.

**How to avoid:**
In the `stream_event` handler, always parse `payload.data` as JSON before further processing: `claude_event = json.loads(payload.data)`. Define a typed Pydantic model for the Claude CLI event structure so parsing is validated. When forwarding to the frontend WebSocket, decide at design time whether to forward the raw string or the parsed object — pick one and be consistent.

**Warning signs:**
- Frontend receives stream events but cannot render them (JSON parse errors)
- Server-side stream event logging shows raw JSON strings where structured fields are expected
- `instance_id` extraction from stream events requires `json.loads` not direct attribute access

**Phase to address:** Stream event forwarding phase.

---

### Pitfall 6: SQLAlchemy Connection Pool Exhaustion Under WebSocket Load

**What goes wrong:**
Each WebSocket connection handler that does any database work holds an async SQLAlchemy session. The default `pool_size=5, max_overflow=10` means 15 total database connections. With many nodes connected and streaming, it's easy to exhaust the pool if sessions are not released promptly. Worse: a WebSocket handler that awaits a database session inside a long-lived loop (e.g., persisting every `stream_event`) holds a connection for the lifetime of the stream — which can be minutes.

**Why it happens:**
FastAPI's `Depends(get_db)` pattern works well for short HTTP request lifecycles. For WebSocket handlers with long-lived loops, the session stays open for the entire connection lifetime if not managed carefully.

**How to avoid:**
Do NOT inject a database session via `Depends` into the top-level WebSocket handler. Instead, open and close sessions per discrete operation: acquire session, execute query, commit, release. For `stream_event` persistence, consider buffering events in memory and batch-writing to the database (e.g., every N events or every 5 seconds), rather than writing each event individually. Configure `pool_size` and `max_overflow` based on expected concurrent nodes — with 20 connected nodes all actively streaming, a pool of 5 is dangerously small.

**Warning signs:**
- `QueuePool limit of size X overflow Y reached` errors in logs during peak load
- Database operations time out only when many nodes are connected
- `max_inactive_connection_lifetime` warnings from asyncpg

**Phase to address:** Database integration phase. Pool configuration must be explicit from the start.

---

### Pitfall 7: Stale Node Detection Is Not Event-Driven

**What goes wrong:**
The spec requires nodes stale after >90 seconds without a ping. A naive implementation runs a background task that polls all nodes every N seconds, checking `last_heartbeat`. At scale this is fine. But the common mistake is NOT running this background task at all and relying only on connection close events — meaning a node with a broken connection that hasn't formally closed (e.g., behind NAT that silently dropped the TCP connection) is never marked stale. Instances on that node stay in `running` state indefinitely.

**Why it happens:**
WebSocket disconnection events are not reliable in the presence of NAT and proxies. A TCP connection can appear open from the server side long after the client is unreachable. The server only discovers this when it tries to write to the dead connection.

**How to avoid:**
Run a dedicated asyncio background task (`asyncio.create_task`) at server startup that scans `last_heartbeat` for all connected nodes every 30 seconds (half the stale threshold). Nodes where `now() - last_heartbeat > 90s` are marked `stale` and their running instances marked `errored`. The Uvicorn ping/pong mechanism handles protocol-level keepalives but the **application** must track `last_heartbeat` separately via the `node_register` / incoming WebSocket ping frame handler.

**Warning signs:**
- Disconnected nodes remain in `connected` state in the dashboard
- Instances on crashed nodes never transition out of `running`
- No background task visible in the codebase for stale node detection

**Phase to address:** Node health monitoring phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store all node state in a Python dict (not persisted) | Simpler code, no DB schema for live connection state | Server restart loses all connected node knowledge; nodes reconcile on reconnect so this is recoverable, but running instance state may temporarily show wrong status | Acceptable for v1 — spec's reconciliation protocol handles recovery. Persistent "connected" state is not needed; PostgreSQL stores historical node and instance records |
| Sync SQLAlchemy for database queries | Familiar API, less boilerplate | Blocks event loop under any concurrent load; causes node timeouts | Never acceptable — use async from day one |
| Accept WebSocket then validate auth | Simpler handler flow | DoS attack surface; resource exhaustion on auth failure | Never acceptable |
| Skip per-node reconnect lock | Simpler code | Race conditions on concurrent reconnects; state corruption | Never acceptable |
| Write every stream_event to DB immediately | Simple, no buffering logic | DB connection pool exhaustion; high DB load during active streams | Acceptable in very early development only; must batch before production |
| No stale node background task (rely on disconnect events only) | Simpler startup | Instances on NAT-dropped connections stay `running` forever | Never acceptable in production |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenAI Whisper API | Sending audio via WebSocket message instead of REST | Audio must go via `POST /api/transcribe` REST endpoint. Binary audio does not belong in the JSON WebSocket protocol |
| OpenAI Whisper API | Not validating file size before sending | Enforce 25 MB limit server-side before calling OpenAI; return 413 to client immediately rather than letting OpenAI reject it |
| OpenAI Whisper API | Using sync `openai` client in async handler | Use `httpx.AsyncClient` directly or ensure the `openai` Python client's async methods are used: `await client.audio.transcriptions.create(...)` |
| OpenAI Whisper API | Assuming `webm` audio from browser is always valid | Browser MediaRecorder produces `audio/webm` with Opus codec — Whisper supports `webm` but be explicit about format; some browsers produce `audio/ogg` instead |
| PostgreSQL / asyncpg | Using sync `psycopg2` for "just one quick query" | All DB access must go through `asyncpg` / async SQLAlchemy; one sync query starves the event loop |
| Node WebSocket auth | Using FastAPI `OAuth2PasswordBearer` for node Bearer token | Nodes send `Authorization: Bearer {token}` on the HTTP upgrade header — validate this header directly before `websocket.accept()`, not via FastAPI's OAuth2 dependency |
| Uvicorn ping/pong | Assuming Uvicorn handles application heartbeat tracking | Uvicorn handles protocol-level pings; the application must separately track `last_heartbeat` per node to detect stale nodes |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Writing every `stream_event` to PostgreSQL | DB connection pool exhaustion; stream lag visible in frontend | Buffer events in memory; batch write every N events or every 5s | At ~5 concurrent actively-streaming nodes |
| Broadcasting stream events to all connected frontend clients (not just the subscribing user) | Unnecessary data sent to all frontend WebSocket connections | Track which frontend WebSocket is subscribed to which `instance_id`; only forward to that connection | At ~10 concurrent frontend users |
| Per-request DB session on WebSocket handlers | Connection pool exhausted on startup | Open sessions only for discrete operations, not for the handler lifetime | At ~15 concurrent nodes (default pool_size=5 + max_overflow=10 = 15 connections) |
| No index on `instances.node_id` | Slow reconciliation queries when a node reconnects | Add index on `instances.node_id` and `instances.status` from day one | At ~1000 total instance records |
| Synchronous Whisper API call blocking event loop | All WebSocket connections stall during transcription (1-5 seconds) | Use async OpenAI client; Whisper API calls are network I/O and must be awaited properly | At 1 concurrent transcription request if blocking |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting WebSocket before validating Bearer token | DoS via resource exhaustion; unauthenticated node data injection | Validate `Authorization: Bearer` header before `websocket.accept()`; close with code 4001 on failure |
| Frontend can subscribe to any `instance_id` without team membership check | Cross-team data leakage — one team's Claude output visible to another | Every stream subscription request must validate: (1) user is authenticated, (2) user's team owns the node that ran the instance |
| `node_id` accepted at face value from `node_register` — no binding to token | A malicious node can impersonate another node by sending a different `node_id` in `node_register` | Bind `node_id` to the auth token at registration: the first `node_register` for a token establishes the `node_id` for that token; subsequent `node_register` messages with a different `node_id` for the same token should be rejected |
| JWT secret in Docker Compose environment as plaintext | Secret exposed in `docker-compose.yml` committed to source control | Use Docker secrets or environment-specific `.env` files not committed to git |
| Dispatching `execute` command without checking team ownership of target node | User on Team A can execute against Team B's node | Before dispatching `execute`, verify: authenticated user's team == target node's team |
| No rate limiting on `/api/transcribe` | Unlimited OpenAI API spend via unauthenticated calls | Require JWT auth on transcription endpoint; add per-user rate limit |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing node as "connected" when it is actually stale | User dispatches command to stale node; command silently queues or fails with no feedback | Distinguish `connected` / `stale` / `disconnected` visually in dashboard; disable "Execute" button for non-`connected` nodes |
| No visual feedback on `execute` dispatch before `ack` arrives | User double-clicks, sending two execute commands | Disable the execute button on first click; re-enable only on `ack` or `instance_error` receipt |
| Stream output displayed as raw NDJSON lines | Claude CLI produces structured JSON events; raw lines are unreadable | Parse `stream_event.data` as JSON in the frontend; render assistant text, tool use, and error events appropriately |
| Instance state stuck at `pending` with no timeout | If `ack` never arrives (node crash mid-dispatch), instance shows `pending` forever | Implement a server-side timeout: if no `ack` within 10 seconds of dispatch, mark instance `errored` with reason "no ack received" |
| Whisper transcription provides no interim feedback | Audio upload + transcription takes 2-5 seconds with no progress indication | Show "Transcribing..." spinner immediately on audio send; disable submit until transcription completes |

---

## "Looks Done But Isn't" Checklist

- [ ] **Node reconnect handling:** Registering the new connection is not the same as running state reconciliation. Verify that reconnect triggers a full diff of `running_instances` against server state, not just an upsert of the node record.
- [ ] **Terminal event handling:** `instance_finished` and `instance_error` both set `finished_at` and transition instance status. Verify both paths are implemented — it's easy to implement only one.
- [ ] **`node_disconnect` vs connection drop:** These are two separate paths. `node_disconnect` is a graceful shutdown frame; connection drop is a WebSocket close event. Both must mark the node `disconnected` and handle instance state. Verify both paths exist.
- [ ] **Stale node background task is running:** Check that the health monitor task is started in the FastAPI `lifespan` handler, not just defined as a function. A defined-but-not-started task is a common mistake.
- [ ] **Stream events forwarded to frontend in real time:** Verify that stream events are forwarded immediately on receipt, not buffered until instance completes. Real-time streaming means forwarding each event as it arrives.
- [ ] **Multi-tenancy at every query:** Verify that every database query for nodes, instances, and users filters by `team_id`. A missing `WHERE team_id = ?` clause is invisible in unit tests that use single-tenant data.
- [ ] **`projects` field validated before dispatch:** The spec requires validating that the target project exists on the target node before dispatching `execute`. Verify this check is present — it's easy to skip and only surfaces as a confusing node-side error.
- [ ] **Whisper endpoint requires authentication:** The transcription endpoint calls the OpenAI API which costs money. Verify it requires a valid JWT before accepting audio.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Multi-worker in-memory state split-brain | HIGH | Redeploy with `--workers 1`; existing connections drop and reconnect; instances reconcile via `node_register` on reconnect |
| Blocking DB call causing node timeouts | MEDIUM | Identify blocking call, replace with async equivalent, redeploy; nodes reconnect with exponential backoff within 30s |
| Auth accepted after `websocket.accept()` | MEDIUM | Add pre-accept validation; redeploy; low operational impact unless actively exploited |
| Connection pool exhaustion | LOW | Increase `pool_size` in config, redeploy; or add event stream buffering to reduce DB connection hold time |
| Missing stale node detection background task | MEDIUM | Add task to `lifespan` handler, redeploy; stale instances must be manually reviewed and marked `errored` for instances that were orphaned before fix |
| Cross-team data access (security) | HIGH | Audit all queries for missing `team_id` filter; add integration tests asserting cross-team isolation; hotfix and redeploy |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Multiple workers destroying connection state | Core WebSocket infrastructure | `docker-compose.yml` has explicit `--workers 1`; integration test confirms node stays connected across reconnect |
| Blocking calls in event loop | Core WebSocket infrastructure | All imports are async libraries (asyncpg, httpx); `blockbuster` detects no blocking calls in handler smoke test |
| Auth accepted after websocket.accept() | Core WebSocket infrastructure | Test that missing/invalid Bearer token returns close code 4001 before `accept()` is called |
| Reconciliation race on concurrent reconnect | State reconciliation phase | Integration test: simulate rapid double-reconnect; verify instance state is consistent after both `node_register` messages |
| stream_event data as nested JSON | Stream event forwarding phase | Unit test: parse a `stream_event` fixture and assert `json.loads(payload.data)` yields a structured object |
| Connection pool exhaustion | Database integration phase | Load test: 20 concurrent nodes streaming; verify no pool exhaustion errors in DB logs |
| Stale node detection not event-driven | Node health monitoring phase | Integration test: silence a node's pings for 91s; verify node transitions to `stale` and its instances to `errored` |
| Multi-tenancy gaps in queries | Team/auth phase | Integration test with two teams; verify team A user cannot read team B nodes or instances |
| `execute` dispatch without team ownership check | Command dispatch phase | Integration test: user from team A calls execute targeting team B's node; verify 403 |
| Whisper endpoint unauthenticated | Whisper integration phase | Test: unauthenticated POST to `/api/transcribe` returns 401 before any OpenAI call |

---

## Sources

- FastAPI WebSocket official documentation: https://fastapi.tiangolo.com/advanced/websockets/
- FastAPI WebSocket auth pitfalls (pre-accept validation): https://dev.to/hamurda/how-i-solved-websocket-authentication-in-fastapi-and-why-depends-wasnt-enough-1b68
- WebSocket reconnection and state sync: https://websocket.org/guides/reconnection/
- FastAPI WebSocket scaling and multi-worker issues: https://websocket.org/guides/frameworks/fastapi/
- SQLAlchemy async connection pooling: https://docs.sqlalchemy.org/en/20/core/pooling.html
- FastAPI SQLAlchemy pool exhaustion: https://github.com/fastapi/fastapi/discussions/10450
- Asyncio blocking call detection: https://dev.to/cbornet/introducing-blockbuster-is-my-asyncio-event-loop-blocked-3487
- Multi-tenant session isolation: https://www.jit.io/blog/designing-secure-tenant-isolation-in-python-for-serverless-apps
- Uvicorn WebSocket ping/pong configuration: https://uvicorn.dev/settings/
- OpenAI Whisper API constraints: https://platform.openai.com/docs/guides/speech-to-text
- Protocol spec (normative): `protocol-spec.md` (GSD Node Wire Protocol v1.2.0)
- Server spec (normative): `server-spec.md`

---
*Pitfalls research for: WebSocket server managing distributed GSD nodes — Python FastAPI*
*Researched: 2026-03-20*

---
phase: 02-node-protocol-engine
verified: 2026-03-21T00:00:00Z
status: gaps_found
score: 29/30 must-haves verified
gaps:
  - truth: "Server forwards stream_event data to subscribed frontend clients (INST-04)"
    status: failed
    reason: "handlers.py buffers stream events in-memory via connection_manager.append_stream_event() but there is no frontend WebSocket endpoint and no fan-out mechanism. The buffer comment explicitly says 'Phase 4'. The requirement is claimed by Phase 2 but the forwarding path does not exist."
    artifacts:
      - path: "backend/app/ws/handlers.py"
        issue: "handle_stream_event() only buffers to _instance_streams; no code sends events to any frontend WebSocket connection"
    missing:
      - "Frontend WebSocket subscriber registry (Phase 4 will add this, but INST-04 is claimed by Phase 2)"
      - "Fan-out call from handle_stream_event to any frontend subscriber (even a no-op stub would clarify intent)"
      - "Either: move INST-04 to Phase 4 in REQUIREMENTS.md traceability table, or document in SUMMARY that INST-04 is intentionally deferred"
---

# Phase 2: Node Protocol Engine Verification Report

**Phase Goal:** GSD nodes can connect, authenticate, execute workloads, and the server correctly tracks all node and instance state — the full server-side execution engine works end-to-end with no user-facing UI
**Verified:** 2026-03-21
**Status:** gaps_found (1 gap)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Comma-separated SERVER_TOKEN parsed into frozenset of valid tokens | VERIFIED | `config.py:33-39` — `valid_tokens` property splits on comma, strips whitespace, returns frozenset |
| 2 | All 10 wire protocol message types have Pydantic models matching protocol-spec.md | VERIFIED | `protocol.py:83-94` — MSG_TYPES dict has exactly 10 entries covering all protocol types |
| 3 | ConnectionManager stores NodeConnection dataclass keyed by node_id with per-node asyncio.Lock | VERIFIED | `manager.py:24-92` — `_connections` dict + `_node_locks` dict + `get_lock()` lazy-creates locks |
| 4 | stream_events table exists with instance_id FK, sequence_num, data JSON, created_at | VERIFIED | `stream_event.py:10-19` + `0002_add_stream_events.py` migration chains from 0001 |
| 5 | Node connects to /ws/node with valid Bearer token and is accepted | VERIFIED | `router.py:46-53` — pre-accept auth with WS_1008_POLICY_VIOLATION on failure, accept() after |
| 6 | Invalid token is rejected before accept() with WS close code 1008 | VERIFIED | `router.py:49-51` — `websocket.close(code=status.WS_1008_POLICY_VIOLATION)` before accept |
| 7 | First frame must be node_register or connection is closed | VERIFIED | `router.py:68-71` — WS_1003_UNSUPPORTED_DATA close if first frame is not node_register |
| 8 | Reconnecting node_id triggers reconciliation: lost errored, new added, matched updated | VERIFIED | `handlers.py:87-143` — reconcile_instances() implements all three cases with set arithmetic |
| 9 | Unexpected disconnect bulk-errors all running/pending instances for that node | VERIFIED | `handlers.py:270-302` — single UPDATE statement targets pending+running, uses "node disconnected unexpectedly" message |
| 10 | node_disconnect frame marks node disconnected gracefully | VERIFIED | `handlers.py:253-267` — sets NodeStatus.disconnected, updates last_seen, deregisters from ConnectionManager |
| 11 | ACK handler marks instance running and correlates via envelope ID | VERIFIED | `handlers.py:146-161` — checks status == pending before transitioning, logs envelope_id |
| 12 | instance_started captures session_id | VERIFIED | `handlers.py:196-209` — sets session_id, started_at, confirms running status |
| 13 | instance_finished marks finished with exit_code | VERIFIED | `handlers.py:212-227` — sets finished, exit_code, finished_at, clears stream buffer |
| 14 | instance_error transitions from pending or running to errored | VERIFIED | `handlers.py:230-250` — sets errored unconditionally (works from both pending and running) |
| 15 | stream_event persists parsed data to stream_events table and buffers in-memory | VERIFIED | `handlers.py:164-193` — json.loads double-decode, COUNT for sequence_num, DB persist + memory buffer |
| 16 | dispatch_execute creates pending Instance, validates project, validates node connected, sends execute | VERIFIED | `commands.py:18-98` — connectivity check, project check, uuid4 instance_id, DB before send, error on send failure |
| 17 | dispatch_kill sends kill envelope to connected node | VERIFIED | `commands.py:101-127` — validates connectivity, sends kill, does NOT modify instance status |
| 18 | dispatch_status_request sends status_request envelope with empty payload | VERIFIED | `commands.py:130-152` — validates connectivity, sends None payload (fire-and-forget) |
| 19 | Disconnected node raises error on any dispatch | VERIFIED | `commands.py:35-37, 113-115, 139-141` — all three functions raise ValueError on None conn |
| 20 | Background scanner runs every 30 seconds | VERIFIED | `health.py:16,32` — SCAN_INTERVAL_SECONDS=30, asyncio.sleep in loop |
| 21 | Nodes with last_heartbeat older than 90 seconds are marked stale | VERIFIED | `health.py:15,46` — STALE_THRESHOLD_SECONDS=90, threshold comparison on conn.last_heartbeat |
| 22 | Running/pending instances on stale nodes are marked errored | VERIFIED | `health.py:69-80` — bulk UPDATE with status.in_([pending, running]) |
| 23 | Background task starts on startup and is cancelled on shutdown | VERIFIED | `main.py:15-23` — create_task in lifespan startup, cancel() + CancelledError catch in shutdown |
| 24 | Server forwards stream_event data to subscribed frontend clients (INST-04) | FAILED | `handlers.py:192` — only buffers in-memory with comment "Phase 4"; no frontend endpoint or fan-out exists |

**Score:** 23/24 observable truths verified (29/30 must-have artifacts/links also verified — see below)

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `backend/app/ws/protocol.py` | Envelope + 10 payload models + new_msg_id() + MSG_TYPES | VERIFIED | All exports present, MSG_TYPES has exactly 10 entries, secrets.token_hex(16) used |
| `backend/app/ws/manager.py` | ConnectionManager singleton + NodeConnection dataclass | VERIFIED | All methods present: get_lock, register, deregister, get, update_heartbeat, all_connections, send_to_node, stream buffer methods |
| `backend/app/config.py` | valid_tokens property on Settings | VERIFIED | @property with frozenset comprehension on server_token.split(",") |
| `backend/app/models/stream_event.py` | StreamEvent SQLAlchemy model | VERIFIED | BigInteger PK, instance_id FK to instances.instance_id, sequence_num, JSON data, created_at |
| `backend/alembic/versions/0002_add_stream_events.py` | Migration adding stream_events table | VERIFIED | down_revision="0001" (correct chain), create_table + create_index, no enum.create calls |
| `backend/app/ws/handlers.py` | All 7 node-to-server handlers + reconciliation + disconnect logic | VERIFIED | All 9 async functions present (7 handlers + reconcile + unexpected_disconnect) |
| `backend/app/ws/router.py` | FastAPI WebSocket endpoint at /ws/node with auth + message dispatch | VERIFIED | router = APIRouter(), @router.websocket("/ws/node"), dispatch_message function |
| `backend/app/main.py` | WebSocket router and health scanner wired in lifespan | VERIFIED | include_router(ws_router), create_task(stale_node_scanner()), cancel on shutdown |
| `backend/app/ws/commands.py` | dispatch_execute, dispatch_kill, dispatch_status_request | VERIFIED | All 3 async functions with correct validation and dispatch logic |
| `backend/app/ws/health.py` | stale_node_scanner + constants | VERIFIED | STALE_THRESHOLD_SECONDS=90, SCAN_INTERVAL_SECONDS=30, all 3 async functions |
| `backend/app/models/__init__.py` | StreamEvent exported | VERIFIED | Imports StreamEvent and includes it in __all__ |
| `backend/app/ws/__init__.py` | Commands exported from ws package | VERIFIED | dispatch_execute, dispatch_kill, dispatch_status_request in __all__ |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `manager.py` | `protocol.py` | `from app.ws.protocol import` | VERIFIED | `manager.py:10` — imports Envelope, new_msg_id |
| `stream_event.py` | `instance.py` | ForeignKey("instances.instance_id") | VERIFIED | `stream_event.py:15` |
| `router.py` | `handlers.py` | dispatch dict mapping types to handlers | VERIFIED | `router.py:131-169` — all 7 node-to-server types dispatched |
| `router.py` | `config.py` | get_settings().valid_tokens for Bearer auth | VERIFIED | `router.py:46-49` |
| `handlers.py` | `database.py` | get_session_maker()() for short-lived sessions | VERIFIED | Every handler uses this pattern with try/except/rollback |
| `main.py` | `router.py` | app.include_router(ws_router) | VERIFIED | `main.py:30` |
| `commands.py` | `manager.py` | connection_manager.get() + send_to_node() | VERIFIED | `commands.py:35, 75, 113, 119, 139, 144` |
| `commands.py` | `database.py` | get_session_maker()() for Instance records | VERIFIED | `commands.py:50, 78` |
| `health.py` | `manager.py` | connection_manager.all_connections() | VERIFIED | `health.py:45` |
| `health.py` | `database.py` | get_session_maker()() to update node/instance status | VERIFIED | `health.py:60` |
| `main.py` | `health.py` | asyncio.create_task in lifespan | VERIFIED | `main.py:15` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NODE-01 | 02-02 | Server accepts inbound WebSocket connections at /ws/node | SATISFIED | `router.py:36` — `@router.websocket("/ws/node")` |
| NODE-02 | 02-02 | Server validates Bearer token during HTTP upgrade | SATISFIED | `router.py:46-51` — pre-accept close with 1008 |
| NODE-03 | 02-02 | Server expects node_register as first frame | SATISFIED | `router.py:68-71` — close with 1003 on wrong first frame |
| NODE-04 | 02-01 | Server tracks node state: connected/stale/disconnected | SATISFIED | `handlers.py` sets NodeStatus on all transitions; health.py sets stale |
| NODE-05 | 02-02 | Server handles node reconnection gracefully | SATISFIED | `handlers.py:38-49` — closes old connection, deregisters, registers new |
| NODE-06 | 02-01 | Server responds to WebSocket pings with pongs | SATISFIED | Starlette handles WS-level pings automatically (per protocol; no application code needed) |
| NODE-07 | 02-04 | Server tracks last_heartbeat, marks stale after >90s | SATISFIED | `health.py` — 90s threshold, 30s scan interval |
| NODE-08 | 02-02 | Server handles node_disconnect frame | SATISFIED | `handlers.py:253-267` + `router.py:162-163` |
| NODE-09 | 02-02 | Server marks all instances errored when node drops | SATISFIED | `handlers.py:270-302` — bulk UPDATE on unexpected disconnect |
| RECON-01 | 02-02 | On reconnect, compare node's running_instances with tracked | SATISFIED | `handlers.py:99-143` — reconcile_instances() |
| RECON-02 | 02-02 | Instances in server but not node are marked errored/lost | SATISFIED | `handlers.py:113-118` — "lost: node reconnected without this instance" |
| RECON-03 | 02-02 | Instances in node but not server are added as running | SATISFIED | `handlers.py:121-135` — adds new Instance with running status |
| RECON-04 | 02-02 | Instances in both are updated (session_id, confirm running) | SATISFIED | `handlers.py:138-143` — updates session_id if changed, sets running |
| RECON-05 | 02-02 | Per-node locking prevents concurrent reconnect races | SATISFIED | `handlers.py:38` — `async with connection_manager.get_lock(payload.node_id):` |
| CMD-01 | 02-03 | Server sends execute with server-generated instance_id (UUID) | SATISFIED | `commands.py:47` — `str(uuid.uuid4())` |
| CMD-02 | 02-03 | Server sends kill command | SATISFIED | `commands.py:101-127` — sends KillPayload envelope |
| CMD-03 | 02-03 | Server sends status_request | SATISFIED | `commands.py:130-152` — sends with None payload |
| CMD-04 | 02-03 | Server validates project exists on node before execute | SATISFIED | `commands.py:40-44` — `if project not in conn.projects` |
| CMD-05 | 02-03 | Server validates node is connected before dispatch | SATISFIED | `commands.py:35-37, 113-115, 139-141` |
| INST-01 | 02-01 | Server tracks instance status: pending/running/finished/errored | SATISFIED | `instance.py` model (Phase 1) + all handlers transition status correctly |
| INST-02 | 02-02 | Server processes ack and marks instance running | SATISFIED | `handlers.py:146-161` |
| INST-03 | 02-02 | Server processes instance_started and captures session_id | SATISFIED | `handlers.py:196-209` |
| INST-04 | 02-02 | Server forwards stream_event data to frontend clients | BLOCKED | `handlers.py:192` — only buffers in-memory; no frontend WebSocket endpoint exists yet; forwarding deferred to Phase 4 |
| INST-05 | 02-02 | Server processes instance_finished with exit code | SATISFIED | `handlers.py:212-227` |
| INST-06 | 02-02 | Server processes instance_error with error message | SATISFIED | `handlers.py:230-250` |
| INST-07 | 02-02 | Server handles rate-limited execute (pending -> errored) | SATISFIED | `handlers.py:230-250` — sets errored regardless of current status (works from pending) |
| TOKN-01 | 02-01 | Server supports rotating SERVER_TOKEN without disconnecting nodes | SATISFIED | `config.py:33-39` — valid_tokens frozenset; live nodes authenticated, not re-checked |
| TOKN-02 | 02-01 | During rotation, old and new tokens both accepted | SATISFIED | `config.py:39` — comma-split means multiple tokens all valid simultaneously |
| TOKN-03 | 02-01 | Admin can revoke old token after grace period | SATISFIED | `config.py:34-38` (docstring) — remove token from SERVER_TOKEN and restart |

**Orphaned requirements check:** REQUIREMENTS.md traceability table maps INST-04 to Phase 2 with status "Complete" — this is inconsistent with the actual implementation which defers forwarding to Phase 4.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `handlers.py` | 192 | `# Buffer in-memory for real-time fan-out to frontend (Phase 4).` | Warning | Stream events are buffered but never forwarded; INST-04 is incomplete |
| `handlers.py` | 154-155 | `instance = await session.get(Instance, payload.instance_id)` / no else branch | Info | If instance not found, handler silently does nothing — acceptable for protocol robustness |

No blocker anti-patterns in command dispatch, connection management, or migration files. No placeholder returns, TODO stubs, or hardcoded empty data in user-visible code paths.

---

### Human Verification Required

#### 1. WebSocket Pre-Accept Rejection Behavior

**Test:** Connect a WebSocket client to `/ws/node` with an invalid Bearer token (or no Authorization header).
**Expected:** Server sends a WebSocket close frame with code 1008 (Policy Violation) before the upgrade completes; the HTTP response should be 403.
**Why human:** Whether Starlette/FastAPI sends an HTTP 403 vs a WebSocket 1008 close frame before accept() requires a live connection to verify. Code inspection confirms the correct close code is used but the actual HTTP vs WS behavior depends on runtime.

#### 2. Node Reconnect Reconciliation Under Concurrent Load

**Test:** Simulate two simultaneous reconnections from the same node_id.
**Expected:** Only one connection succeeds; the other is rejected gracefully; no duplicate reconciliation runs; instance state is consistent.
**Why human:** The per-node asyncio.Lock is correctly placed in handle_node_register, but concurrent behavior requires integration testing to verify no race conditions exist in practice.

#### 3. Stale Scanner Startup Grace Period

**Test:** Start the server and observe whether any nodes are immediately scanned.
**Expected:** The scanner sleeps 30 seconds before its first scan (sleep-first design).
**Why human:** The health.py code shows `await asyncio.sleep(SCAN_INTERVAL_SECONDS)` before the first `_scan_for_stale_nodes()` call, which is correct. Runtime confirmation requires observation.

---

### Gaps Summary

**One gap blocks full INST-04 satisfaction.** The `handle_stream_event` handler correctly parses double-encoded JSON and persists to the `stream_events` DB table, but the requirement also mandates forwarding to subscribed frontend clients. No frontend WebSocket endpoint exists in Phase 2 (correctly deferred to Phase 4), but the REQUIREMENTS.md traceability table marks INST-04 as "Phase 2 / Complete" — this is incorrect.

**Resolution options (only one needed):**
1. Update REQUIREMENTS.md to move INST-04 from Phase 2 to Phase 4 in the traceability table (matches implementation intent)
2. Add a stub `broadcast_stream_event()` no-op in Phase 2 that Phase 4 fills in, with a clear comment

All other 28 requirements in scope (NODE-01 through NODE-09, RECON-01 through RECON-05, CMD-01 through CMD-05, INST-01 through INST-03 and INST-05 through INST-07, TOKN-01 through TOKN-03) are **fully implemented and wired end-to-end**.

The core phase goal — nodes can connect, authenticate, execute workloads, and server tracks all node and instance state — is achieved. The gap is a requirements traceability error, not a missing execution capability.

---

_Verified: 2026-03-21_
_Verifier: Claude (gsd-verifier)_

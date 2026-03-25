# Architecture Research

**Domain:** GSD control plane — stream intelligence, interactive response UI, project management, auto mode
**Researched:** 2026-03-25
**Confidence:** HIGH — based on direct codebase analysis of all relevant backend and frontend files

---

## Context: What This Research Covers

This document answers the v1.3 integration questions: where does stream intelligence hook into the existing pipeline, where do project management models live, how does auto mode work, how does interactive response UI send input back to the node, and what wire protocol changes are needed.

---

## System Overview (v1.3 Integration Points)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       GSD Node (Go, outbound)                        │
│  Claude CLI → NDJSON → stream_event{data: JSON-encoded-string}       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ WebSocket /ws/node  (no changes v1.3)
┌──────────────────────────────▼──────────────────────────────────────┐
│                      Backend: FastAPI / Python                        │
│                                                                      │
│  ws/router.py  (no changes)                                          │
│    └─► ws/handlers.py::handle_stream_event()  [MODIFIED]             │
│          1. json.loads(payload.data)  ← unwrap double-encode         │
│          2. NEW: classify_stream_event(parsed_data)                  │
│             └─► if input_wait: broadcast_input_request()             │
│          3. persist → StreamEvent table (unchanged)                  │
│          4. connection_manager.append_stream_event() (unchanged)     │
│          5. frontend_manager.fan_out_stream_event() (unchanged)      │
│                                                                      │
│  ws/stream_intelligence.py  [NEW — pure classifier, no I/O]         │
│  ws/auto_sequencer.py       [NEW — asyncio task runner per sequence] │
│                                                                      │
│  ws/frontend_manager.py  [MODIFIED — 2 new broadcast methods]       │
│  ws/frontend_router.py   [MODIFIED — handle node_input msg type]    │
│                                                                      │
│  routers/projects.py     [NEW — project CRUD REST]                  │
│  routers/sequences.py    [NEW — auto sequence REST]                  │
│  models/project.py       [NEW]                                       │
│  models/auto_sequence.py [NEW]                                       │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ WebSocket /ws/frontend
┌──────────────────────────────▼──────────────────────────────────────┐
│                     Frontend: React 19 / TypeScript                   │
│                                                                      │
│  useWebSocket (layout route, no changes)                             │
│  wsStore.handleMessage()  [MODIFIED — new cases]                     │
│    stream_event      → streamBuffers[instanceId]  (unchanged)        │
│    NEW input_request → inputRequests[instanceId]                     │
│    NEW notification  → notifications[]                               │
│    NEW sequence_status → sequenceStatuses[sequenceId]               │
│                                                                      │
│  StreamPanel → StreamEventRenderer  [MODIFIED — detect interactive] │
│    NEW: InteractiveResponseUI (buttons/text → POST /api/execute)    │
│                                                                      │
│  NEW: CommandPalette (GSD commands, ~20 contextual buttons)         │
│  NEW: ProjectManager (create/connect/clone project on a node)       │
│  NEW: AutoModePanel (configure + trigger auto sequence)             │
│  NEW: NotificationBadge (badge + dropdown for attention events)     │
│  types/protocol.ts  [MODIFIED — 4 new WS message union variants]   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Map: New vs Modified

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Stream event handler | `ws/handlers.py` | Modified | Add classify hook + input_request broadcast; 2 lines added to finished/error handlers for sequencer |
| Stream classifier | `ws/stream_intelligence.py` | New | Pure function, no I/O, no await |
| Auto sequencer | `ws/auto_sequencer.py` | New | asyncio task runner + asyncio.Event notification dict |
| Frontend manager | `ws/frontend_manager.py` | Modified | Add `broadcast_input_request()` and `broadcast_notification()` |
| Frontend router | `ws/frontend_router.py` | Modified | Handle `node_input` message type in reader loop |
| Project model | `models/project.py` | New | Projects table with node_id FK |
| Auto sequence model | `models/auto_sequence.py` | New | AutoSequence + AutoSequenceRun tables |
| Projects router | `routers/projects.py` | New | CRUD REST endpoints |
| Sequences router | `routers/sequences.py` | New | Trigger and status REST endpoints |
| Projects schemas | `schemas/projects.py` | New | Pydantic schemas |
| Sequences schemas | `schemas/sequences.py` | New | Pydantic schemas |
| Alembic migration | `alembic/versions/xxxx_v1_3.py` | New | Creates projects, auto_sequences, auto_sequence_runs |
| `wsStore.ts` | Frontend | Modified | Add `inputRequests`, `notifications`, `sequenceStatuses` slices and new handleMessage cases |
| `types/protocol.ts` | Frontend | Modified | New incoming + outgoing WS message union variants |
| `StreamEventRenderer.tsx` | Frontend | Modified | Detect `AskUserQuestion` tool_use, render `InteractiveResponseUI` |
| `InteractiveResponseUI.tsx` | Frontend | New | Renders question as buttons/checkbox/text field |
| `CommandPalette.tsx` | Frontend | New | ~20 GSD commands as contextual execute triggers |
| `ProjectManager.tsx` | Frontend | New | Create/connect/clone project UI |
| `AutoModePanel.tsx` | Frontend | New | Configure and trigger auto sequences |
| `NotificationBadge.tsx` | Frontend | New | Badge + dropdown for input_request and completion events |

**New files: ~12 backend + 5 frontend. Modified files: 5 backend + 3 frontend. DB migrations: 1.**

---

## Integration Point 1: Stream Intelligence Pipeline Hook

**The hook point is `handle_stream_event` in `ws/handlers.py`, after `json.loads(payload.data)` and before the DB persist.**

Current flow (handlers.py lines 199-230):
```
parsed_data = json.loads(payload.data)
→ DB persist
→ in-memory buffer
→ fan-out to frontend
```

Modified flow:
```
parsed_data = json.loads(payload.data)
→ classification = classify_stream_event(parsed_data)   [NEW — sync, pure]
  if classification.requires_input:
    await frontend_manager.broadcast_input_request(      [NEW side-effect]
        payload.instance_id, classification
    )
→ DB persist                                             [unchanged]
→ in-memory buffer                                       [unchanged]
→ fan-out to frontend                                    [unchanged]
```

The classifier is a pure synchronous function — no DB, no await, no I/O. Called once per stream event. This keeps the hot-path change minimal and the classifier unit-testable in isolation.

**What the classifier detects in parsed Claude CLI NDJSON:**

| Detection Target | NDJSON Signal | Classification Result |
|-----------------|---------------|----------------------|
| `AskUserQuestion` tool use | `type == "tool_use" && name == "AskUserQuestion"` | `requires_input=True`, `input_type="buttons"`, `options=input.options` |
| Freeform input wait | `type == "system" && subtype == "input_required"` (verify exact subtype) | `requires_input=True`, `input_type="text"` |
| Successful completion | `type == "result" && subtype == "success"` | `is_completion=True`, `subtype="success"` |
| Error completion | `type == "result" && subtype == "error"` | `is_completion=True`, `subtype="error"` |

The exact system event subtype for freeform input wait requires verification against actual Claude CLI output — flag for phase-level research. `AskUserQuestion` is well-established from the existing `ndjson.ts` TypeScript types.

---

## Integration Point 2: Interactive Response UI — Wire Protocol for Sending Input

**Critical constraint:** The existing GSD wire protocol v1.2.0 has no message type for sending stdin/text input to a running Claude CLI instance. PROJECT.md "Out of Scope" states "Node-side changes — server consumes the existing node protocol as-is."

**Recommended approach for v1.3: Path A — answer as a new execute with session_id continuation. No protocol change needed.**

How it works:

1. Server detects `AskUserQuestion` in stream, broadcasts `input_request` WS message to frontend.
2. `InteractiveResponseUI` renders the question with clickable options.
3. User clicks an option.
4. Frontend sends `{ type: "node_input", instance_id, text: selectedOption }` over the frontend WebSocket.
5. `frontend_router.py` reader loop handles the new `node_input` message type:
   - Looks up instance by `instance_id` → gets `node_id`, `project`, `session_id`
   - Calls `dispatch_execute(node_id, project, work_dir, text, user_id, db, session_id=current_session_id)`
6. Normal execute → ack → stream flow continues (existing pipeline unchanged).

This is functionally equivalent to stdin — Claude CLI in `--continue` mode with the prior session_id will receive the answer and resume naturally.

**Why not add a new protocol message type in v1.3:** The node changes to support true stdin pipe-write are out of scope. Path A works with all existing node deployments and achieves the same UX. A true `input` protocol message can be added in v1.4 when node changes are in scope.

**New `frontend_router.py` message handler branch:**
```python
elif msg_type == "node_input":
    instance_id = msg.get("instance_id")
    text = msg.get("text")
    if not instance_id or not text:
        continue
    # Look up instance for node_id, project, session_id
    async with get_session_maker()() as db_session:
        instance = await db_session.get(Instance, instance_id)
        if instance is None:
            continue
        has_access = await user_can_access_instance(user_id, instance_id, db_session)
    if not has_access:
        continue
    # Dispatch as a new execute using the current session for continuity
    try:
        await dispatch_execute(
            instance.node_id, instance.project, instance.project,
            text, user_id, db, session_id=instance.session_id
        )
    except (ValueError, PermissionError):
        pass
```

---

## Integration Point 3: Project Management DB Schema

**The Node model already stores `projects: JSON` (list of strings from node self-report).** This is read-only from the server's perspective — it reflects what the node has configured. It is NOT the place to store server-managed projects.

**New `Project` model (server-managed):**
```
projects table
  id: UUID (PK)
  node_id: String(255) FK → nodes.node_id
  name: String(255)       — display name, should match node config project name
  path: String(1024)      — absolute path on node filesystem
  clone_url: String(1024, nullable) — GitHub URL if cloned
  created_at: DateTime
```

**Relationship to existing models:**
- `Instance.project` is a plain String — intentionally NOT an FK to `projects.id`. Instances are an immutable audit trail; they outlive project records.
- `Node.projects` (JSON array) is the node-reported list. New `projects` table is the server-managed authoritative list. On node reconnect, `node_register.projects` can be cross-referenced to detect drift.
- No migration changes to existing `instances`, `nodes`, or `stream_events` tables.

**New `AutoSequence` model:**
```
auto_sequences table
  id: UUID (PK)
  node_id: String(255) FK → nodes.node_id
  project: String(255)
  name: String(255)         — user-defined sequence name
  steps: JSON               — list of {prompt: str, clear_before: bool}
  created_by: String FK → users.user_id
  created_at: DateTime
  updated_at: DateTime
```

**New `AutoSequenceRun` model:**
```
auto_sequence_runs table
  id: UUID (PK)
  sequence_id: UUID FK → auto_sequences.id
  started_at: DateTime
  finished_at: DateTime (nullable)
  status: Enum (running, completed, errored, cancelled)
  current_step: Integer
  last_instance_id: String(36, nullable) — tracks which instance the sequencer is waiting on
```

---

## Integration Point 4: Auto Mode Sequencer — Server-Side

**The sequencer lives on the server, not the frontend.**

Reasons:
1. Frontend tab close or network drop must not abort a running sequence.
2. The sequencer needs `dispatch_execute()`, DB access, and audit logging — all server-side.
3. The sequencer observes `instance_finished` / `instance_error` which arrive at `handle_instance_finished` in `handlers.py`.

**Implementation: asyncio background task per run, coordinated via asyncio.Event.**

```python
# ws/auto_sequencer.py

_pending_steps: dict[str, asyncio.Event] = {}  # instance_id → event

def register_pending_step(instance_id: str) -> asyncio.Event:
    event = asyncio.Event()
    _pending_steps[instance_id] = event
    return event

def notify_step_complete(instance_id: str) -> None:
    """Called by handle_instance_finished and handle_instance_error."""
    event = _pending_steps.pop(instance_id, None)
    if event:
        event.set()

async def run_sequence(sequence_id: str, run_id: str, user_id: str) -> None:
    """Asyncio task — runs all steps in a sequence, one at a time."""
    # Load sequence steps
    # For each step:
    #   1. dispatch_execute(node_id, project, prompt, ...)
    #   2. event = register_pending_step(instance_id)
    #   3. await event.wait()   ← yields until handler fires
    #   4. check run status (was it errored?)
    #   5. advance step in DB
    # On completion: broadcast notification
```

**Changes to `ws/handlers.py` — two 1-line additions:**

In `handle_instance_finished()`:
```python
from app.ws.auto_sequencer import notify_step_complete
notify_step_complete(payload.instance_id)   # ADD before existing cleanup
```

In `handle_instance_error()`:
```python
notify_step_complete(payload.instance_id)   # ADD before existing cleanup
```

**The /clear between steps** is handled by the sequencer: when `clear_before=True` on a step, the sequencer dispatches a synthetic `/clear` execute before the real step prompt. This is purely a data concern in the steps JSON — no protocol change.

**Sequence tasks are started by `POST /api/sequences/{id}/run`:**
```python
run_task = asyncio.create_task(run_sequence(sequence_id, run_id, user_id))
```

**Orphan recovery on server restart:** `AutoSequenceRun` records with status `running` are detected at startup and marked `errored` (same pattern as instance reconciliation in `handle_node_register`).

---

## Wire Protocol Changes Summary

**Node↔Server protocol (GSD wire protocol v1.2.0): NO changes for v1.3.**

All new messages are frontend↔server only.

**New server→frontend WebSocket message types:**

`input_request` — sent when stream intelligence detects an interactive wait:
```json
{
  "type": "input_request",
  "instance_id": "<uuid>",
  "question": "<string>",
  "options": ["<opt1>", "<opt2>"] | null,
  "input_type": "buttons" | "text"
}
```

`notification` — sent on attention-needed events (input needed, sequence complete/error):
```json
{
  "type": "notification",
  "kind": "input_needed" | "sequence_complete" | "sequence_error" | "instance_finished",
  "node_id": "<string>",
  "instance_id": "<string>" | null,
  "message": "<string>"
}
```

`sequence_status` — sent when sequence step advances or completes:
```json
{
  "type": "sequence_status",
  "sequence_id": "<uuid>",
  "status": "running" | "completed" | "errored",
  "current_step": 0
}
```

**New frontend→server WebSocket message type:**

`node_input` — user's response to an interactive question:
```json
{
  "type": "node_input",
  "instance_id": "<uuid>",
  "text": "<user response text>"
}
```

**TypeScript changes — `types/protocol.ts`:**

`WsIncomingMessage` gains three new union variants (`input_request`, `notification`, `sequence_status`).
`WsOutgoingMessage` gains `node_input`.

---

## Data Flows

### Stream Intelligence Flow

```
Node
  │ stream_event { instance_id, data: "<json-string>" }
  ▼
ws/handlers.py::handle_stream_event()
  │ parsed_data = json.loads(payload.data)
  │
  ├─► classification = classify_stream_event(parsed_data)    [NEW sync call]
  │     if requires_input:
  │       await frontend_manager.broadcast_input_request(    [NEW]
  │           instance_id, classification
  │       )
  │       → all subscribed FrontendConnections get input_request msg queued
  │       → writer coroutines push to WebSocket
  │       → wsStore.handleMessage() → inputRequests[instanceId] set
  │       → StreamPanel re-renders → InteractiveResponseUI shown
  │
  ├─► StreamEvent DB persist (unchanged)
  ├─► connection_manager.append_stream_event() (unchanged)
  └─► frontend_manager.fan_out_stream_event() (unchanged)
```

### Interactive Response Flow

```
User clicks option in InteractiveResponseUI
  │
  ▼ ws.send({ type: "node_input", instance_id, text })
  │
  ▼ frontend_router.py reader loop — new elif branch
  │ looks up instance → node_id, project, session_id
  │ calls dispatch_execute(node_id, project, work_dir, text, user_id, db, session_id)
  │
  ▼ Normal execute → ack → stream_event flow (existing, unchanged)
```

### Auto Sequence Flow

```
POST /api/sequences/{id}/run
  │ create AutoSequenceRun record (status=running)
  │ asyncio.create_task(run_sequence(sequence_id, run_id, user_id))
  │
  ▼ run_sequence() asyncio task (background)
  │
  loop for each step:
    │ dispatch_execute(node_id, project, step.prompt, ...)
    │ event = register_pending_step(instance_id)
    │ await event.wait()    ← suspends here, yields event loop
    │    [later: handle_instance_finished() fires]
    │    [notify_step_complete(instance_id) sets event]
    │ advance current_step in DB, persist
  │
  on completion:
  └─► frontend_manager.broadcast_notification(sequence_complete, ...)
        → all connected team users get notification msg
        → wsStore notifications[] updated → NotificationBadge shows badge
```

---

## Architectural Patterns

### Pattern 1: Classify-Then-Fan-Out (stream intelligence integration)

**What:** The stream event handler calls a pure synchronous classifier immediately after parsing. Side-effects (broadcast) happen between classify and existing fan-out. The existing DB persist and fan-out are untouched.

**When to use:** Any new processing on stream events. The hook point is stable and the classifier is stateless.

**Trade-offs:** Adds one sync function call per stream event (negligible). The pure-function design makes it unit-testable without touching the event loop or DB.

### Pattern 2: asyncio.Event for Step Sequencing

**What:** Background task registers an `asyncio.Event` keyed by the current step's `instance_id`. The existing instance lifecycle handler sets the event when the terminal message arrives. The task waits with `await event.wait()` — this yields the event loop cleanly.

**When to use:** Anytime a background task must react to a node event without polling.

**Trade-offs:** In-memory dict is lost on server restart. The `AutoSequenceRun` DB record enables restart recovery (mark orphaned runs errored at startup). Not suitable for multi-process scaling, but single-process is the v1.3 target.

### Pattern 3: Input-as-Continue-Execute (Path A interactive response)

**What:** An interactive response to `AskUserQuestion` is dispatched as a new execute command with the current session_id, effectively continuing the Claude CLI conversation.

**When to use:** v1.3, while node-side changes remain out of scope.

**Trade-offs:** Creates a new `Instance` record per answer (minor audit noise). The UX is identical to true stdin from the user's perspective. Migrate to a proper `input` protocol message in v1.4 when node changes are in scope.

---

## Anti-Patterns

### Anti-Pattern 1: Sequencer on the Frontend

**What people do:** Put sequence step-advancement in a React effect or polling interval.

**Why it's wrong:** Tab close or network drop aborts the sequence. The frontend cannot persist state across reconnects. The server cannot observe instance lifecycle events from the frontend.

**Do this instead:** Server-side asyncio task. Frontend renders sequence state from DB via REST + WS push.

### Anti-Pattern 2: Classifying Stream Events on the Frontend

**What people do:** Scan `streamBuffers` in React for `AskUserQuestion` tool uses and show interactive UI from the store.

**Why it's wrong:** Notifications must fire even when the stream panel is not mounted. Other tabs will not receive the notification. The `input_request` WS message broadcast pattern covers all connected sessions simultaneously.

**Do this instead:** Classify on the server, broadcast `input_request` to all subscribed frontend connections. Frontend renders from `inputRequests[instanceId]` in wsStore.

### Anti-Pattern 3: FK from `Instance.project` to `projects.id`

**What people do:** Add a foreign key from `Instance.project` to the new `projects` table.

**Why it's wrong:** Instances are an immutable audit trail and must outlive project records. Project deletion would cascade-delete instance records or require `ON DELETE SET NULL`, losing the project name from history.

**Do this instead:** `Instance.project` stays a plain String column. It is a denormalized snapshot taken at dispatch time.

### Anti-Pattern 4: I/O in stream_intelligence.py

**What people do:** Add DB queries inside `classify_stream_event()` to look up instance context.

**Why it's wrong:** Called on every stream event. A DB round-trip per NDJSON line will create backpressure on the node connection and degrade stream throughput.

**Do this instead:** The classifier is pure — no I/O. If per-instance state is needed (e.g., "has this instance already received a question?"), maintain a lightweight in-memory dict keyed by `instance_id`, cleared in `handle_instance_finished` and `handle_instance_error`.

---

## Build Order (Dependency-Aware)

Dependencies run strictly top-to-bottom. Items at the same level are independent and can be parallelized.

```
Step 1: DB models + migration (project, auto_sequence, auto_sequence_run)
  Files: models/project.py, models/auto_sequence.py, alembic/versions/xxxx_v1_3.py
  Dependency: none — everything else may need these tables

Step 2a: stream_intelligence.py (pure classifier)
  Dependency: none — testable in isolation before handler modification

Step 2b: routers/projects.py + schemas/projects.py
  Dependency: Step 1 (models)

Step 2c: CommandPalette.tsx (frontend)
  Dependency: none — calls existing /api/execute only

Step 3: Modify handle_stream_event + frontend_manager broadcast methods
  Dependency: Step 2a (classifier must exist)
  Parallel: extend WsIncomingMessage TypeScript types at same time

Step 4a: InteractiveResponseUI + wsStore inputRequests slice
  Dependency: Step 3 (new WS message type must be defined)

Step 4b: auto_sequencer.py + notify hooks in handlers.py
  Dependency: Step 1 (models for run tracking)

Step 5a: frontend_router.py node_input handler
  Dependency: Step 4a (node_input message defined in WS protocol)

Step 5b: routers/sequences.py + schemas/sequences.py
  Dependency: Step 4b (sequencer must exist to be triggered)

Step 6: AutoModePanel.tsx
  Dependency: Step 5b (sequences REST endpoint)

Step 7: ProjectManager.tsx
  Dependency: Step 2b (projects REST endpoint)

Step 8: NotificationBadge.tsx
  Dependency: Step 3 (notification WS message in frontend_manager)
```

Steps 2a, 2b, and 2c are fully independent of each other. Steps 4a and 4b are independent. Steps 5a and 5b are independent.

---

## What Is NOT Changed

The following existing components require zero modification for v1.3:

- GSD wire protocol v1.2.0 node↔server messages (`ws/protocol.py`, `ws/router.py`)
- `connection_manager.py`
- Instance, Node, Team, User, AuditLog, StreamEvent, RefreshToken, WsTicket DB models
- JWT auth flow, ws-ticket endpoint
- Frontend `useWebSocket` hook
- Frontend `StreamPanel`, `StreamEventRenderer` rendering for non-interactive events (read-only extension)
- Frontend `ExecuteForm` (CommandPalette is a sibling, not a replacement)

---

## Sources

- Direct codebase analysis: `backend/app/ws/handlers.py` — stream event pipeline, instance lifecycle hooks
- Direct codebase analysis: `backend/app/ws/manager.py` — in-memory stream buffer, node connection registry
- Direct codebase analysis: `backend/app/ws/frontend_manager.py` — fan-out pattern, queue-based broadcast
- Direct codebase analysis: `backend/app/ws/frontend_router.py` — existing message handler structure (subscribe/unsubscribe reader loop)
- Direct codebase analysis: `backend/app/ws/protocol.py` — all 10 protocol message types confirmed
- Direct codebase analysis: `backend/app/ws/commands.py` — dispatch_execute() signature
- Direct codebase analysis: `backend/app/models/` — all existing models reviewed
- Direct codebase analysis: `frontend/src/stores/wsStore.ts` — existing Zustand slices
- Direct codebase analysis: `frontend/src/types/protocol.ts`, `types/ndjson.ts` — existing WS and NDJSON types
- Direct codebase analysis: `frontend/src/components/stream/StreamEventRenderer.tsx` — existing renderer structure
- Spec files: `protocol-spec.md` (v1.2.0 — 10 message types, no stdin support confirmed)
- Project context: `.planning/PROJECT.md` — "Node-side changes" out of scope for v1.3 confirmed

---

*Architecture research for: GLSD Server v1.3 GSD Integration*
*Researched: 2026-03-25*

# Pitfalls Research

**Domain:** Adding GSD-aware stream parsing, interactive question UI, project management, auto mode, and notifications to an existing NDJSON WebSocket relay — v1.3 GSD Integration
**Researched:** 2026-03-25
**Confidence:** HIGH (code-grounded; derived directly from the existing codebase architecture and the specific integration surface for v1.3)

---

## Critical Pitfalls

### Pitfall 1: Double-Encoded JSON Parsed Only Once — Silent Data Loss

**What goes wrong:**
The `stream_event` payload's `data` field is a JSON string containing another JSON object (protocol-spec Section 3.1.3: "data contains a JSON-serialized ClaudeEvent object as a string"). The existing `handle_stream_event` in `handlers.py` correctly calls `json.loads(payload.data)` to unwrap this. However, v1.3 stream intelligence code will add a second parsing layer to inspect event types (`AskUserQuestion`, `result`, `system`, etc.). If the new parser receives the already-decoded Python dict instead of a raw string, it works fine. But if any intermediate step re-serializes the dict and the parser is called on a string that hasn't been through the first `json.loads`, you get the raw string including escape sequences. In the frontend Zustand store, `handleMessage` in `wsStore.ts` calls `get().appendStreamEvent(msg.instance_id, msg.data as NdjsonEvent)` — if the server-side forward changes the shape of `data` (e.g., adding a wrapper or changing the forwarded value), the frontend cast `msg.data as NdjsonEvent` will silently accept a malformed value. TypeScript does not validate at runtime.

**Why it happens:**
Two layers of JSON encoding are easy to lose track of. Adding stream intelligence means touching `handle_stream_event` and the fan-out path. A developer writing GSD event classification touches the same data the frontend already depends on and inadvertently changes the forwarded shape without a type-system complaint.

**How to avoid:**
Parse once in `handle_stream_event`, attach the classification result as a separate field in the forwarded message, never re-wrap the parsed data. Define a typed backend schema for the enriched stream event and a matching TypeScript type in the frontend that both teams agree on before coding begins. In Python: `{"type": "stream_event", "instance_id": ..., "data": parsed_dict, "gsd": {"kind": "ask_user_question", ...}}`. In TypeScript: add a `gsd?: GsdClassification` field to the `WsIncomingMessage` type. The `data` field shape must not change — additive only.

**Warning signs:**
- Frontend stream panel shows garbled output after v1.3 deploy (escaped JSON strings appearing as raw text)
- `StreamEventRenderer` receives an object where it expected a specific `NdjsonEvent` union type
- `msg.data as NdjsonEvent` throws a runtime error when a new field is added to the message shape

**Phase to address:** Stream intelligence phase — establish the enriched message schema contract before writing any classification code.

---

### Pitfall 2: Input-Wait Detection Based on Message Content Alone Is Unreliable

**What goes wrong:**
Claude CLI emits structured NDJSON events but does not emit a dedicated "waiting for input" event type in the standard stream. GSD detects user prompts via heuristic matching on `assistant` message content and by checking for specific `system` subtypes. A common approach is to scan the last `assistant` text event for question-like patterns (ends with `?`, contains choice options, etc.) or to wait for a `result` event with a specific subtype. The problem: Claude CLI can emit an `assistant` event containing a question that is purely rhetorical (Claude summarizing what it asked in a previous turn), or it can pause mid-stream before emitting the question text. If the server treats every trailing question in an `assistant` event as an input-wait signal, it will fire false notifications and render phantom prompt UIs while Claude is still typing. If it waits for a `result` event to confirm the wait, it may have already forwarded all text events to the frontend with no signal that the last one requires a response.

**Why it happens:**
Claude CLI's NDJSON format was designed for display, not for program-to-program control flow detection. Input-wait state is implicit in the process (stdin is blocked), not explicit in the stream. Developers assume they can reconstruct the interactive state purely from output events.

**How to avoid:**
Use a two-signal approach: (1) GSD sends `AskUserQuestion` tool invocations in the stream when it wants structured input — look for a `tool_use` event where `name` is `AskUserQuestion` as the primary, reliable signal. (2) For freeform input waits (e.g., Claude pausing for a yes/no), use a debounced heuristic: no new `assistant` events for N seconds AND the last `assistant` text ends with a question mark or option list. N should be at least 3 seconds. Never fire the interactive UI on the first heuristic match alone — combine with the absence of subsequent events. Treat the heuristic as "probably waiting" and the `AskUserQuestion` tool call as "definitely waiting." These two states should drive different UI treatments.

**Warning signs:**
- Interactive prompt UI appears mid-stream while Claude is still generating text
- Users see question UI for completed instances (false positive from a question in the final summary)
- Notification fires while Claude is actively writing a multi-paragraph response

**Phase to address:** Stream intelligence phase — the classification logic must be designed with the two-signal approach from the start. Do not defer the debounce mechanism to a later phase.

---

### Pitfall 3: stdin Relay Through WebSocket Chain Has No Flow Control or Timeout

**What goes wrong:**
Sending user responses back to a running Claude CLI instance requires: (1) frontend sends a message to the backend via the frontend WebSocket, (2) backend forwards it to the node via the node WebSocket as a new protocol message type, (3) node writes to the Claude CLI subprocess stdin. The current protocol (v1.2.0) has no `stdin_input` message type. Adding it means adding a new server-to-node message. The failure mode: the frontend sends an `stdin_input` message, the backend forwards it, but the instance has already terminated (natural finish or kill in flight), the node writes to a closed stdin, and the write silently fails. The server has no acknowledgment mechanism for stdin delivery. The user thinks their answer was received; the instance is actually gone. Worse: if the user clicks a response button twice (double-click, network lag), two stdin writes are sent. Claude CLI does not deduplicate stdin.

**Why it happens:**
The existing protocol is fire-and-forget from the server side (no ACK for execute delivery to stdin is required because the node sends `ack` back). A new `stdin_input` type added ad-hoc without a corresponding ack mechanism inherits the same fire-and-forget semantics, which are acceptable for command dispatch but dangerous for interactive state transitions.

**How to avoid:**
The node must send an `ack` for every `stdin_input` message received, reusing the same envelope `id` correlation mechanism already defined in the protocol for `execute`. The frontend must disable the response button immediately on click (optimistic lock, not on ack receipt) to prevent double-submit. If no `ack` arrives within 5 seconds, the backend marks the input as failed and notifies the frontend. On the node side, the `stdin_input` handler must check that the target instance is still running before writing — if not running, respond with `instance_error` using a clear message like `"instance not running: cannot deliver stdin"`. The new protocol message type must be added to `MSG_TYPES` in `protocol.py` and the node's Go implementation simultaneously.

**Warning signs:**
- User answers a question but Claude continues to wait — no stdin was delivered
- Instance enters an unexpected state after a terminal event races with a stdin delivery
- Two `stdin_input` messages arrive for the same question (double-click)

**Phase to address:** stdin relay phase — the ACK requirement must be in the protocol design document before any implementation starts. Do not ship stdin relay without ack tracking.

---

### Pitfall 4: Auto Mode State Machine Has No Instance-Level Isolation

**What goes wrong:**
Auto mode dispatches a sequence of GSD commands with `/clear` between steps. The state machine is: dispatch command 1, wait for `instance_finished`, dispatch `/clear`, wait for finish, dispatch command 2, etc. The current `dispatch_execute` in `commands.py` creates a new instance ID per call and returns immediately. If auto mode is implemented as a backend asyncio task keyed on `node_id` only (not `node_id + sequence_id`), two users dispatching auto mode on the same node will have their state machines share instance-tracking state. User A's instance_finished event could advance User B's sequence. Or, if a node disconnects mid-sequence, the auto mode task is orphaned — the reconnect path does not know about in-flight auto sequences, so on reconnect the sequence is silently abandoned with no error to the user.

**Why it happens:**
Auto mode looks like "just run a loop of execute calls," so developers implement it as a simple `for` loop with `await wait_for_terminal_event(instance_id)`. The `wait_for_terminal_event` primitive is often implemented as an asyncio.Event per instance_id, which is correct for isolation. The cross-user collision only manifests when two users target the same node simultaneously, which doesn't happen in solo testing.

**How to avoid:**
Each auto mode sequence must have a unique `sequence_id` (a UUID). The state machine task must be keyed on `(node_id, sequence_id)` in a registry, not just `node_id`. The `wait_for_terminal_event` mechanism must use per-instance asyncio.Event or asyncio.Queue (one per `instance_id`), not a shared dict keyed on `node_id`. When a node disconnects, all auto mode sequences for that node must be cancelled and the user must receive a `sequence_error` notification. The sequence registry must be cleaned up on node disconnect in `handle_unexpected_disconnect`. Use the existing `_instance_streams` pattern in `ConnectionManager` as a model for per-instance state.

**Warning signs:**
- Auto mode completes steps out of order when two users both run it on the same node
- Node disconnect during auto mode leaves the UI in "running" state indefinitely
- A sequence continues after a kill command was sent to one of its instances

**Phase to address:** Auto mode phase — the sequence_id isolation design must be locked down before any implementation. Verify behavior with a two-user simultaneous test before declaring the phase complete.

---

### Pitfall 5: In-Memory Stream Buffer Not Cleared on New Instance for Same Session

**What goes wrong:**
`ConnectionManager._instance_streams` stores events per `instance_id`. Each auto mode step spawns a new instance ID, so each step's buffer is isolated. However, if a user calls `/clear` (dispatched as an execute command), the cleared instance also gets an `instance_finished` event. `handle_instance_finished` calls `connection_manager.clear_stream_events(instance_id)`. The next instance (command 2 in the sequence) starts accumulating in a fresh buffer. This is correct. But: if the user reopens the stream panel for the *previous* instance, `get_stream_events` returns an empty buffer (cleared at finish). If the DB was configured with `STREAM_EVENTS_PERSIST = False` (the current tech debt note in PROJECT.md: "Stream events not persisted to DB"), there is no replay source. The user sees a blank panel for a completed instance. This is confusing but not a corruption. The real danger: if `clear_stream_events` is called *before* all frontend queue writes have drained, a subscriber that receives the clear after an in-flight fan-out may show a partial event set.

**Why it happens:**
The fan-out path is: `fan_out_stream_event` puts events into per-connection queues, the writer coroutine drains them asynchronously. `clear_stream_events` is called synchronously in the terminal event handler, before the writer has necessarily drained the queue. There is no barrier between "event enqueued" and "event delivered."

**How to avoid:**
`clear_stream_events` in `handle_instance_finished` is safe because the queue is per-connection and the buffer is separate from the queue — the buffer is only for replay on new subscriptions, not for in-flight delivery. Verify this does not become a problem when the auto mode sequence replays buffered events to a newly subscribed frontend. The rule: clear the in-memory buffer only after confirming the instance is in a terminal state AND all subscribers have unsubscribed (or on a short delay after the terminal event). For v1.3, the immediate fix is to persist stream events to the DB — this removes the dependency on the in-memory buffer for history and makes replay reliable.

**Warning signs:**
- Reopening a completed instance stream shows no events despite the instance having produced output
- Auto mode history panel shows empty steps for instances that ran successfully
- A frontend subscription during the `/clear` step shows zero events despite the /clear producing stream output

**Phase to address:** Stream intelligence phase (relies on stream event history); also the tech debt note about stream event persistence should be resolved in this milestone.

---

### Pitfall 6: Interactive UI Renders Stale Question After Instance Terminates

**What goes wrong:**
When the stream parser detects an `AskUserQuestion` tool call, the frontend renders a response UI (buttons or text input). If the instance terminates before the user responds (e.g., timeout, kill, node disconnect), the response UI remains on screen. If the user then submits a response, the `stdin_input` message is sent to the backend, which tries to forward to a node for a dead instance. Depending on the error handling, the user either sees a silent failure or gets a generic error. The response UI never clears itself because it was driven by the stream event, and no "cancel the interactive prompt" message arrives.

**Why it happens:**
The interactive UI state is derived from the stream buffer (a `tool_use` event with name `AskUserQuestion`). The stream buffer is not retroactively modified when the instance terminates. The UI component checks stream events but does not subscribe to the `instance_status` state for the same instance.

**How to avoid:**
The interactive prompt component must subscribe to both the stream buffer (for the question content) and the `instanceStatuses` map in `wsStore` (for termination state). When `instanceStatuses[instanceId]` becomes `finished` or `errored`, the interactive prompt must be hidden and replaced with a "Claude finished before receiving your response" message. This is a single conditional on the render: `if (instanceStatus === 'finished' || instanceStatus === 'errored') return null`. Implement this in the same PR as the interactive prompt component — do not ship the prompt without the cleanup path.

**Warning signs:**
- Interactive buttons remain visible after stream ends
- Clicking a response button after instance finishes shows an error toast but leaves the UI unchanged
- Browser console shows `WebSocket is already in CLOSED state` error when submitting a response

**Phase to address:** Interactive question UI phase — the status-aware rendering must be part of the initial implementation, not a follow-up fix.

---

### Pitfall 7: Project Management Commands Require Path Validation on Remote Filesystem

**What goes wrong:**
Project management features (create project, connect existing folder, clone GitHub repo) require the backend to send commands that reference filesystem paths on the node. The `execute` command has a `work_dir` field. For project creation, the work_dir is the new directory. For connecting an existing folder, it is an existing path the user provides in the UI. The backend currently validates that `project` is in `conn.projects` (the list reported by the node). But `conn.projects` is a list of *project names*, not filesystem paths. The `work_dir` is passed through without validation. A user can enter `../../../../etc/passwd` as a work_dir, and the backend will forward it to the node. The node runs Claude CLI with that working directory. Whether this causes harm depends on the node environment, but it is a path traversal risk.

**Why it happens:**
The current `dispatch_execute` validation in `commands.py` checks project name membership but has no path sanitization: `if project not in conn.projects: raise ValueError(...)`. The `work_dir` field was designed to be provided by the server, not user-supplied. For v1.3 project management, `work_dir` will be user-supplied from the project form.

**How to avoid:**
For server-side project management, the backend must normalize and validate `work_dir` before forwarding: (1) reject any path containing `..` sequences after normalization, (2) require the path to start with a known safe prefix (configurable per team or node), or (3) accept only project-relative paths and resolve them to absolute paths on the node using a registered project root. The simplest safe approach for v1.3: require `work_dir` to match the project's registered root path (stored in the DB when the project is created) rather than accepting arbitrary user-provided paths. User-facing forms should present a project picker that resolves to the registered path, not a free-text path field.

**Warning signs:**
- `work_dir` field in the execute form accepts free-text input without validation
- A path containing `../` passes through `dispatch_execute` without error
- Node executes Claude CLI in an unexpected directory (check the `cwd` field in `instance_started` if added)

**Phase to address:** Project management phase — path validation must be a first-class requirement, not a hardening step.

---

### Pitfall 8: Notification System Cannot Distinguish Tabs — Duplicate Alerts

**What goes wrong:**
The notification requirement says "notify when nodes need input or complete work." The existing `FrontendConnectionManager` stores connections per `user_id` — a single user can have multiple connections (multiple tabs). When a notification is sent via `fan_out_stream_event` or `broadcast_instance_status`, it goes to all tabs. For status updates, this is correct — all tabs should know the node is done. For interactive prompts specifically, the user only needs to respond once. If the notification fires in all tabs and the user responds from tab A, tab B still shows the response UI. If the user then responds from tab B, a second `stdin_input` is sent. The node may have moved on; the second stdin write either errors or corrupts the next prompt.

**Why it happens:**
The fan-out model treats all connections for a user as equivalent. For read-only state updates, this is correct. For action-requiring prompts, it is wrong — exactly one response should be solicited.

**How to avoid:**
Introduce a concept of "claiming" an interactive prompt. When a user submits a response from any tab, the backend marks the prompt as `answered` for that `instance_id + prompt_sequence_number`. All subsequent tabs that try to render the response UI should check this `answered` state via a small REST endpoint or a new WebSocket message type (`prompt_answered`) broadcast to all of the user's connections. The simplest implementation: when `stdin_input` is received from the frontend, the backend broadcasts a `prompt_answered` message to all of the user's connections before forwarding to the node. Each tab's interactive UI component listens for this and hides itself. This is idempotent: if the user has only one tab, the broadcast goes to that one tab, which already submitted and will ignore the message.

**Warning signs:**
- Two browser tabs both show the interactive prompt for the same instance
- Submitting a response from one tab does not clear the prompt in the other tab
- Two `stdin_input` messages arrive at the backend within seconds of each other for the same prompt

**Phase to address:** Interactive question UI phase AND notification phase — must be designed together, as the fan-out model for prompts differs from status broadcasts.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Stream events not persisted to DB (existing tech debt) | Lower write volume, simpler handler | Auto mode history unavailable; reopened stream panels show blank; replay only works for live instances | Never acceptable for v1.3 — interactive history requires persistence |
| Heuristic-only input-wait detection (no `AskUserQuestion` tool signal) | Faster to implement | High false-positive rate; phantom prompts; broken user trust in interactive UI | Never — use the two-signal approach from day one |
| `stdin_input` without ack tracking | Simpler protocol extension | Silent delivery failures; users believe their response was received when it was not | Never — always require ack for interactive state transitions |
| Auto mode as a single background task per node (no sequence isolation) | Simpler code path | Cross-user state collision on shared nodes; orphaned tasks on disconnect | Never — sequence_id isolation adds trivial overhead and prevents a class of bugs |
| Project `work_dir` as free-text user input without validation | Faster project management form | Path traversal risk; Claude CLI runs in unexpected directories | Never for user-supplied paths — always validate or resolve from registered project roots |
| Interactive prompt component without status-aware cleanup | Faster initial render | Stale prompts after instance termination; user confusion and spurious stdin sends | Never — add the status check in the same PR as the prompt component |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| NDJSON stream enrichment + frontend fan-out | Changing the shape of the forwarded `data` field breaks the frontend `NdjsonEvent` union type silently | Add enrichment as a new sibling field (`gsd`) to the forwarded message; never mutate the existing `data` field shape |
| `stdin_input` → node protocol extension | Treating `stdin_input` as fire-and-forget like `kill` | Require a node-side `ack` using the same envelope `id` correlation; set a 5-second timeout; surface delivery failure to the user |
| Auto mode + `dispatch_execute` | Calling `dispatch_execute` in a loop and awaiting `asyncio.sleep` between polls | Use asyncio.Event per instance_id set by the terminal event handler; zero-polling, immediate wake on completion |
| Auto mode + node disconnect | No cleanup of in-flight auto sequences when `handle_unexpected_disconnect` fires | Register auto sequences in `ConnectionManager`; `handle_unexpected_disconnect` must cancel all sequences for the disconnected node |
| Project management + `conn.projects` validation | Assuming `conn.projects` is a list of filesystem paths | `conn.projects` is project *names*, not paths; filesystem paths must be resolved from a separate project registry in the DB |
| `FrontendConnectionManager` fan-out + interactive prompts | Broadcasting prompts to all user tabs creates duplicate response opportunities | Broadcast `prompt_answered` to all tabs immediately on first response receipt; interactive UI checks this state before rendering |
| GSD `AskUserQuestion` tool event + stream buffer | Tool events may appear in the replay buffer for a completed instance | Frontend interactive UI must check instance status, not just the presence of a tool_use event, before rendering response controls |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Auto mode polling with `asyncio.sleep(0.5)` for terminal events | CPU overhead, 500ms latency on each step transition | Use asyncio.Event per instance_id; set the event in the terminal event handler; `await event.wait()` has zero overhead | Immediately — polling is never appropriate for event-driven systems |
| Stream event classification on every raw event | CPU spike on high-volume streams (tool results can be large JSON objects) | Classify only on `type` field first; skip classification for `tool_result` events unless they contain a GSD signal; memoize classification results | Noticeable above ~50 events/second per instance |
| In-memory stream buffer growing unboundedly for long-running instances | Server memory grows proportionally to instance output volume | Implement stream event DB persistence (resolves existing tech debt); cap in-memory buffer at 1000 events and truncate oldest for display only | Long-running instances (GSD auto mode with many steps can produce thousands of events) |
| `fan_out_stream_event` with `gsd` classification field added to every message | Increased message size for all stream events, including high-frequency tool_result events | Only include `gsd` field when classification is non-null; omit the field entirely for events with no GSD signal | Marginal impact at current scale; more relevant if frontend processes many concurrent streams |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| User-supplied `work_dir` passed through without path normalization | Path traversal: Claude CLI executes in unintended directory on node | Validate `work_dir` against registered project roots; reject any path containing `../` after `os.path.normpath`; use the project registry as the authoritative source of valid paths |
| `stdin_input` delivered without authorization check | Any user on the same team can deliver stdin to another user's instance | The backend `stdin_input` relay must validate that the requesting user has team access to the instance's node, using the same `user_can_access_instance` check already in `frontend_router.py` |
| Notification content leaks instance details to wrong users | A notification about "node X needs input" reaches a user who is not on node X's team | Use `broadcast_node_status` pattern with `team_user_ids` filtering (already implemented in `frontend_manager.py:broadcast_node_status`) for all GSD-aware notifications |
| Auto mode sequence stores prompt history in-memory without access control | An auto sequence registered in a global dict is accessible by node_id, which could be guessed | Key auto sequence registry on `(user_id, sequence_id)` pairs, not `node_id` alone; never expose sequence state through unauthenticated endpoints |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Interactive prompt appears while Claude is still streaming | User answers a question that Claude hasn't finished asking; response context is wrong | Debounce the interactive prompt render: show only after 3+ seconds of no new `assistant` events following the `AskUserQuestion` tool call |
| Response buttons have no loading state after click | User clicks multiple times thinking the first click didn't register; multiple stdin writes sent | Disable button immediately on click; show a spinner; re-enable only if a `prompt_delivery_failed` event arrives |
| Auto mode has no step-level progress indicator | User has no idea how many steps remain or which step is running | Show step N of M in the auto mode panel header; update on each `instance_finished` event from the sequence |
| Project management form lets user type any folder path | User types a path that doesn't exist on the remote node; Claude CLI fails to start | Use a project picker that shows only registered projects (those already in `conn.projects`); show a "connect new folder" flow as a guided sub-form, not a free-text field |
| Notification fires for every `AskUserQuestion` in an auto sequence | Auto mode may ask questions at each step; user is flooded with notifications for a single auto run | Send a single "your auto sequence needs input" notification per sequence, not per question; batch questions from the same sequence |

---

## "Looks Done But Isn't" Checklist

- [ ] **Stream enrichment shape contract:** Confirm that `stream_event` messages forwarded to the frontend still have the exact same `data` field structure after GSD classification is added. Run the existing `StreamEventRenderer` with a v1.3 payload and verify no rendering regressions.
- [ ] **AskUserQuestion detection:** Verify classification fires on a `tool_use` event with `name === "AskUserQuestion"` and does NOT fire on `tool_use` events for other tool names (e.g., `Bash`, `Read`).
- [ ] **stdin relay ack:** Confirm that a `stdin_input` message to a terminated instance returns a `prompt_delivery_failed` event to the frontend within 5 seconds, not a silent hang.
- [ ] **Interactive prompt cleanup:** Kill a running instance while its interactive prompt is displayed. Confirm the prompt disappears and is replaced with a "session ended" message within 2 seconds.
- [ ] **Auto mode sequence isolation:** Run auto mode on the same node as two different users simultaneously. Confirm each sequence runs independently and terminal events from one do not advance the other's step counter.
- [ ] **Auto mode disconnect recovery:** Disconnect the node mid-sequence. Confirm the auto mode task is cancelled, the user receives an error notification, and the UI does not show "running" indefinitely.
- [ ] **Project path validation:** Submit an execute command with `work_dir = "../../../../etc"` through the project management form. Confirm the backend rejects it with a 400 error before forwarding to the node.
- [ ] **Multi-tab prompt claim:** Open two browser tabs on the same instance's detail page while an interactive prompt is active. Submit a response from tab A. Confirm tab B's prompt UI disappears within 2 seconds.
- [ ] **Notification team scoping:** Confirm that a "node needs input" notification for node X is NOT delivered to users who are not on node X's team, using the existing `team_user_ids` filtering in `broadcast_node_status`.
- [ ] **Stream event persistence:** After v1.3 ships, reopen a completed instance's stream panel. Confirm all events are visible (loaded from DB, not in-memory buffer which is cleared at instance termination).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stream enrichment breaks frontend rendering | MEDIUM | Revert the `data` field shape change; add enrichment as `gsd` field only; redeploy; no data loss since stream events are ephemeral |
| stdin relay fires twice from double-click | LOW | Add frontend button disable-on-click in the same deploy; if duplicate stdin causes Claude to receive unexpected input, kill the instance and re-run from auto sequence |
| Auto mode orphaned on disconnect | LOW | Add `handle_unexpected_disconnect` sequence cleanup; affected users see "sequence cancelled" notification; re-run the sequence manually |
| Path traversal via work_dir | HIGH | Add path normalization immediately; audit recent execute commands in the audit log for suspicious work_dir values; rotate node tokens if any unauthorized executions are suspected |
| Stale interactive prompts after instance termination | LOW | Add status-aware conditional in the prompt component; no data corruption; affected users simply see a stale UI until next page load |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Double-encoded JSON shape change breaks frontend | Stream intelligence phase | `StreamEventRenderer` renders correctly with enriched messages; no TypeScript errors in the enriched message types |
| Input-wait detection false positives | Stream intelligence phase | Manual test: heuristic does not fire during active Claude streaming; fires only after 3s silence following a question event |
| stdin relay without ack | stdin relay protocol phase | Delivery to terminated instance returns `prompt_delivery_failed` within 5s; delivery to live instance is confirmed by node ack within 1s |
| Auto mode cross-user state collision | Auto mode phase | Two-user simultaneous test; each sequence runs independently |
| Auto mode orphaned on disconnect | Auto mode phase | Node disconnect mid-sequence cancels sequence and notifies user within 5s |
| In-memory buffer gaps for completed instances | Stream intelligence phase (requires persistence) | Reopened stream panels show full event history for completed instances |
| Stale interactive prompt after termination | Interactive question UI phase | Kill-during-prompt test: prompt disappears within 2s |
| Multi-tab duplicate response | Interactive question UI phase | Two-tab test: tab B prompt hides after tab A submits |
| work_dir path traversal | Project management phase | Path with `../` rejected with 400 at `dispatch_execute` |
| Notification delivered to wrong team | Notification phase | Team-scoped notification test: non-team user receives no notification for node activity |

---

## Sources

- Codebase: `/backend/app/ws/handlers.py:handle_stream_event` — existing double-decode and fan-out path
- Codebase: `/backend/app/ws/frontend_router.py` — fan-out model, per-user multi-tab connections, `user_can_access_instance` pattern
- Codebase: `/backend/app/ws/frontend_manager.py` — `FrontendConnectionManager`, `team_user_ids` filtering in `broadcast_node_status`
- Codebase: `/backend/app/ws/commands.py:dispatch_execute` — `work_dir` passthrough without path validation, project name validation only
- Codebase: `/backend/app/ws/manager.py` — `_instance_streams` buffer; `clear_stream_events` called at terminal event
- Codebase: `/frontend/src/stores/wsStore.ts` — `streamBuffers` state, `instanceStatuses` map, `handleMessage` dispatch
- Codebase: `/frontend/src/types/ndjson.ts` — `NdjsonEvent` union type; `tool_use` event structure
- Codebase: `/frontend/src/components/stream/StreamPanel.tsx` — how stream events are consumed by the UI
- Protocol spec: `/protocol-spec.md` Section 3.1.3 — double-encoded `data` field; Section 3.2.1 execute ack correlation
- Project context: `/docs/PROJECT.md` — "Stream events not persisted to DB" tech debt flag; v1.3 feature targets

---
*Pitfalls research for: v1.3 GSD Integration — stream parsing, interactive UI, stdin relay, auto mode, project management, notifications*
*Researched: 2026-03-25*

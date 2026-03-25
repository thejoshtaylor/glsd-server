# Phase 16: Interactive Response and Notifications - Research

**Researched:** 2026-03-25
**Domain:** Frontend interactive UI (React + Zustand + WebSocket), browser Notifications API, Sonner toasts
**Confidence:** HIGH

## Summary

Phase 16 sits squarely on top of Phase 15's delivered infrastructure. The classifier already emits `gsd: "AskUserQuestion"` and `gsd: "completed"` on live stream events, and `instanceStatuses` in the Zustand store already tracks running/finished/errored status per instance. What's missing is the frontend rendering layer that intercepts classified events and renders interactive prompts, plus the notification machinery.

The answer submission path reuses the existing `POST /api/execute` endpoint with `session_id` populated — this is the "session-resume execute" pattern already locked in STATE.md. No new backend protocol is needed. The only backend addition is a `prompt_answered` broadcast to all user connections (via `frontend_manager`), plus the server must track a single "pending prompt" state per `instance_id` to implement multi-tab claiming.

Browser notifications use the Web Notifications API (standard, no library needed). Sonner is already installed at v2.0.7 and `<Toaster />` is already mounted in `__root.tsx`. Permission management is a small UI addition to the dashboard.

**Primary recommendation:** Implement `InteractiveResponseUI` as a component that renders BELOW the stream in `StreamPanel`, keyed on `instanceId`. It reads the latest `gsd`-classified event from `streamBuffers` and the instance's terminated status from `instanceStatuses`. Add a `promptState` map to `wsStore` (keyed by `instance_id`) to track claimed prompts. Backend adds `prompt_answered` broadcast + a thin in-memory claiming map in `frontend_manager`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Claude's Discretion
All implementation choices are at Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RESP-01 | User sees AskUserQuestion rendered as clickable option buttons (single-select) | AskUserQuestion `input.questions[].options` is an array of `{label, description}` objects; `multiSelect: false` = single-select. Render as radio-button-style buttons. |
| RESP-02 | User sees multi-select questions rendered as checkbox lists | Same `input.questions[]` array; `multiSelect: true` signals checkboxes needed. |
| RESP-03 | User can type freeform text responses when input wait is detected | `gsd: "freeform_wait"` on stream event triggers a `<textarea>` + submit button. Freeform wait is STUBBED in classifier — see Open Questions. |
| RESP-04 | User's answer is submitted as a session-resume execute dispatch to the node | POST `/api/execute` with `session_id` from the instance (already captured via `instance_started` handler). The prompt text is the selected option label(s). |
| RESP-05 | Multi-tab prompt claiming prevents duplicate answer submissions | Server tracks `prompt_claimed` state per `instance_id` in-memory. First tab to claim gets to submit; server broadcasts `prompt_answered` to all tabs on submission. |
| NOTF-01 | User receives browser notification when a node needs input | Web Notifications API: `new Notification(...)` when `gsd: "AskUserQuestion"` or `gsd: "freeform_wait"` arrives and `document.hidden === true`. |
| NOTF-02 | User receives browser notification when an instance completes or errors | Web Notifications API: triggered on `instance_status` WS message with `status: "finished"` or `status: "errored"`. |
| NOTF-03 | User sees in-app toast (Sonner) for completion and input-needed events | `toast()` from `sonner` package (already installed v2.0.7, Toaster already mounted). |
| NOTF-04 | User can manage notification permissions from the dashboard | `Notification.requestPermission()` + display current status (granted/denied/default) as a settings row on the dashboard index page. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sonner | 2.0.7 (installed) | In-app toasts | Already installed, `<Toaster />` already in `__root.tsx`, used in `VoiceButton.tsx` |
| Web Notifications API | Browser-native | Browser push notifications | No library needed; standard API with `Notification.permission` state machine |
| zustand | 5.0.12 (installed) | Prompt state (claimed/answered per instance) | Already used for `instanceStatuses`, `streamBuffers` — same pattern extends naturally |
| React 19 | installed | Component rendering | Project baseline |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | 5.x (installed) | Fetching `session_id` from instance if not in store | Use only if `session_id` is not reliably in `wsStore`; prefer reading from `streamBuffers` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web Notifications API | react-toastify, notistack | No benefit — native API is sufficient; no additional install needed |
| Zustand for prompt state | React Context | Zustand already used for WS state; consistent pattern; no prop-drilling |

**Installation:** No new packages required. All dependencies already installed.

---

## Architecture Patterns

### AskUserQuestion Input Shape (VERIFIED)

From `gist.github.com/bgauryy/0cdb9aa337d01ae5bd0c803943aa36bd` (HIGH confidence from gist + questioning.md in GSD codebase):

When `gsd: "AskUserQuestion"` arrives on a `stream_event`, the `data` field is a `tool_use` event:

```typescript
// data field on the stream_event WsIncomingMessage when gsd === "AskUserQuestion"
{
  type: "tool_use",
  name: "AskUserQuestion",
  input: {
    questions: Array<{
      question: string       // Full question text
      header: string         // Short label (max 12 chars)
      multiSelect: boolean   // false = single-select (RESP-01), true = checkboxes (RESP-02)
      options: Array<{
        label: string        // Displayed option text
        description: string  // Subtitle / explanation
      }>                     // 2–4 options
    }>                       // 1–4 questions (typically 1)
  }
}
```

### Answer Submission via Session-Resume Execute (LOCKED in STATE.md)

Answer dispatch reuses the existing execute protocol. The user's selected options are formatted into a prompt string, then posted to `/api/execute` with the instance's `session_id`:

```typescript
// Session ID comes from InstanceResponse.session_id (fetched via /api/instances/:id)
// or from the wsStore if we track it there

POST /api/execute {
  node_id: string,
  project: string,
  work_dir: string,
  prompt: "Option 1: Sub-second response",  // formatted answer
  session_id: instance.session_id,           // REQUIRED — resumes the paused session
}
```

The instance's `session_id` is set by the backend when `instance_started` arrives from the node (stored in the `Instance` DB row). It must be fetched from the REST API at submit time since it's not currently stored in wsStore.

### Multi-Tab Claiming Protocol (LOCKED in STATE.md)

STATE.md mandates: "Broadcast `prompt_answered` to all user connections BEFORE forwarding `node_input` to node — prevents multi-tab duplicate submission."

**Claiming flow:**
1. Frontend tab sends a `claim_prompt` WS message: `{ type: "claim_prompt", instance_id: string }`
2. Server checks an in-memory `prompt_claims: dict[str, str]` map (instance_id → user_id + conn_id)
3. If unclaimed: record claim, broadcast `prompt_claimed` to all connections with `{ type: "prompt_claimed", instance_id, claimed: true }`
4. If already claimed: reply with `{ type: "prompt_claimed", instance_id, claimed: false }` to that connection only
5. On answer submit: validate claim, broadcast `prompt_answered` to ALL user connections, then dispatch `node_input` to node
6. On instance termination: clear the claim entry

**Frontend state in wsStore:**
```typescript
promptStates: Record<string, 'pending' | 'claimed_by_me' | 'claimed_by_other' | 'answered'>
```

### Recommended Component Structure

```
frontend/src/
├── components/
│   ├── stream/
│   │   ├── StreamPanel.tsx          # Add <InteractiveResponseUI> below event list
│   │   ├── InteractiveResponseUI.tsx # New: reads gsd classification, renders prompt
│   │   └── ...existing files...
│   └── notifications/
│       └── NotificationSettings.tsx  # New: permission toggle for dashboard
├── hooks/
│   └── useNotifications.ts          # New: permission request, trigger logic
└── stores/
    └── wsStore.ts                   # Extend: add promptStates, handlePromptClaimed/Answered
```

### Pattern 1: InteractiveResponseUI Component

```typescript
// Source: codebase pattern from StreamPanel.tsx + ToolUse.tsx
interface InteractiveResponseUIProps {
  instanceId: string
  nodeId: string
}

export function InteractiveResponseUI({ instanceId, nodeId }: InteractiveResponseUIProps) {
  const instanceStatus = useWsStore(s => s.instanceStatuses[instanceId])
  const promptState = useWsStore(s => s.promptStates[instanceId])
  const events = useWsStore(s => s.streamBuffers[instanceId] ?? [])

  // CRITICAL nil-guard: never render prompt after instance terminated
  if (!instanceStatus || instanceStatus === 'finished' || instanceStatus === 'errored') {
    return null
  }
  if (promptState === 'answered') return null

  // Find the last AskUserQuestion event
  const askEvent = [...events].reverse().find(
    e => e.type === 'tool_use' && e.name === 'AskUserQuestion'
  ) as ToolUseEvent | undefined

  if (!askEvent) return null  // no pending question
  // render question UI...
}
```

**CRITICAL pitfall from STATE.md:** "Never ship prompt component without `instanceStatuses[instanceId]` nil-guard". If the instance has terminated but the stream buffer still has the `AskUserQuestion` event, the prompt must NOT be shown.

### Pattern 2: Sonner Toast Trigger

```typescript
// Source: VoiceButton.tsx pattern, sonner v2 API
import { toast } from 'sonner'

// In wsStore handleMessage, extend the 'instance_status' case:
case 'instance_status':
  // ... existing status update ...
  if (msg.status === 'finished') {
    toast.success('Instance completed', { description: msg.instance_id.slice(0, 8) })
  } else if (msg.status === 'errored') {
    toast.error('Instance errored', { description: msg.instance_id.slice(0, 8) })
  }
  break

// In stream_event case, when gsd is AskUserQuestion:
case 'stream_event':
  get().appendStreamEvent(msg.instance_id, msg.data as NdjsonEvent)
  if (msg.gsd === 'AskUserQuestion' || msg.gsd === 'freeform_wait') {
    toast.info('Input needed', { description: 'A node is waiting for your response' })
  }
  break
```

### Pattern 3: Browser Notification

```typescript
// Source: MDN Web Notifications API (browser-native)
// In useNotifications.ts hook:
export function useNotifications() {
  const permission = useRef(Notification.permission)

  const requestPermission = async () => {
    const result = await Notification.requestPermission()
    permission.current = result
    return result
  }

  const notify = (title: string, body: string) => {
    if (Notification.permission !== 'granted') return
    if (!document.hidden) return  // only notify when tab is unfocused
    new Notification(title, { body, icon: '/favicon.ico' })
  }

  return { permission: permission.current, requestPermission, notify }
}
```

### Pattern 4: Backend `prompt_answered` Broadcast

Extend `frontend_router.py` reader loop to handle `claim_prompt` and `submit_answer` messages. Extend `frontend_manager.py` with:

```python
# In FrontendConnectionManager:
_prompt_claims: dict[str, tuple[str, FrontendConnection]] = {}  # instance_id -> (user_id, conn)

async def claim_prompt(self, instance_id: str, conn: FrontendConnection) -> bool:
    """Attempt to claim a prompt for exclusive answer submission."""
    if instance_id in self._prompt_claims:
        return False  # already claimed
    self._prompt_claims[instance_id] = (conn.user_id, conn)
    return True

async def release_prompt(self, instance_id: str) -> None:
    """Release claim after answer submitted or instance terminated."""
    self._prompt_claims.pop(instance_id, None)

async def broadcast_prompt_answered(self, instance_id: str) -> None:
    """Broadcast prompt_answered to ALL user connections BEFORE forwarding node_input."""
    msg = {"type": "prompt_answered", "instance_id": instance_id}
    # fan out to all connections (not just subscribers)
    for user_conns in list(self._connections.values()):
        for c in user_conns:
            try:
                c.queue.put_nowait(msg)
            except asyncio.QueueFull:
                pass
    self.release_prompt(instance_id)
```

### Anti-Patterns to Avoid

- **Rendering prompt after instance terminates:** Always nil-guard `instanceStatuses[instanceId]`. If finished/errored, return null immediately.
- **Submitting without claim:** Always claim first; reject submit if not the claimed connection.
- **Triggering browser notification when tab is focused:** Check `document.hidden` before calling `new Notification(...)`.
- **Fetching `session_id` from the prompt's `input` field:** The `session_id` comes from the backend Instance record, not from the AskUserQuestion tool input. Use `GET /api/instances/:id` to fetch it.
- **Using `motion` library for prompt animations:** Use `tw-animate-css` or plain CSS `@keyframes` only (locked in STATE.md: "No motion library").
- **Animating stream output rows:** Never add mount animations to `InteractiveResponseUI` that would cause queuing at high event rates.
- **Direct lucide-react imports:** All icons via `src/lib/icons.ts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-app toast notifications | Custom toast component | `toast()` from `sonner` | Already installed, Toaster mounted, used in codebase |
| Browser push notifications | Service worker, push library | Web Notifications API directly | Built into all modern browsers; no library overhead |
| Multi-select UI | Custom checkbox component | shadcn Checkbox or native `<input type="checkbox">` | Shadcn components already in project; consistent styling |
| Answer HTTP dispatch | New endpoint | POST `/api/execute` with `session_id` | Locked decision: "session-resume execute — answer dispatch uses existing execute protocol" |

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is a greenfield feature phase with no rename/refactor component.

---

## Environment Availability

Step 2.6 SKIPPED — this phase is purely frontend code changes + minor backend Python additions. No external tools, databases, or CLI utilities beyond the project's own code.

---

## Common Pitfalls

### Pitfall 1: Prompt renders after instance terminates (STATE.md critical)
**What goes wrong:** The stream buffer retains the `AskUserQuestion` event even after `instance_finished` arrives. Without a guard, the prompt continues rendering on a dead instance.
**Why it happens:** `streamBuffers` is populated before `instanceStatuses` is updated; React renders stale.
**How to avoid:** In `InteractiveResponseUI`, check `instanceStatuses[instanceId]` first. If undefined, 'finished', or 'errored', return null immediately. This is the FIRST check before any other logic.
**Warning signs:** Prompt appears on HistoryStreamPanel or after KillButton was used.

### Pitfall 2: Multi-tab duplicate submission
**What goes wrong:** Two tabs both see the prompt and both dispatch an answer execute. The session receives two inputs.
**Why it happens:** Both tabs receive the same `stream_event` and both render the prompt independently.
**How to avoid:** Implement the claiming protocol. STATE.md mandates: broadcast `prompt_answered` to all user connections BEFORE forwarding `node_input` to the node. The claim must be registered server-side (not just frontend state) so it survives tab switching.
**Warning signs:** Instance receives garbled/doubled input and errors.

### Pitfall 3: `session_id` not available at submit time
**What goes wrong:** The frontend tries to submit the answer but doesn't have the instance's `session_id` to resume the Claude session.
**Why it happens:** `session_id` is stored in the backend Instance DB record (set via `handle_instance_started`), not currently in wsStore.
**How to avoid:** Fetch `GET /api/instances/:instanceId` just before submitting, or extend wsStore to capture `session_id` when `instance_started` events arrive via the stream (type: 'system', subtype: 'init'). The REST fetch approach is simpler and avoids store complexity.
**Warning signs:** `session_id: null` in execute dispatch → Claude starts a fresh session instead of answering the question.

### Pitfall 4: Browser notification permission request on page load
**What goes wrong:** Calling `Notification.requestPermission()` automatically on app load causes the browser to suppress the prompt (treated as auto-triggered, blocked in Firefox/Safari).
**Why it happens:** Browsers require notification permission requests to be triggered by user gesture.
**How to avoid:** Only call `requestPermission()` in response to a user clicking a "Enable Notifications" button in the notification settings UI.
**Warning signs:** Permission dialog never appears; `Notification.permission` stays 'default'.

### Pitfall 5: Freeform wait classification is STUBBED
**What goes wrong:** `gsd: "freeform_wait"` never fires in practice — the classifier has `if False:` gating the freeform branch (see `classifier.py` line 34).
**Why it happens:** The exact NDJSON event subtype for text-input blocking is unconfirmed (MEDIUM confidence, flagged in STATE.md Research Flags).
**How to avoid:** Implement the freeform UI component (RESP-03) but treat it as unreachable in practice until the classifier stub is enabled. Wire the UI to `gsd === "freeform_wait"` — it will render when the classifier is updated later. Do NOT make RESP-03 a blocking success criterion for this phase; note it in the plan.
**Warning signs:** RESP-03 test never triggers on real GSD runs.

### Pitfall 6: Sonner toast fires for every stream event replay
**What goes wrong:** When a new tab subscribes to an instance, buffered events are replayed with `gsd: null` (per `frontend_router.py` line ~126: "gsd: None because buffered events are historical"). Toast fires once per live event, not per replay.
**Why it happens:** Without checking that the event is real-time (not replayed), toast logic in `handleMessage` would fire for every replayed event on subscribe.
**How to avoid:** Toasts should only fire for events with `gsd !== null`. Since replayed events always have `gsd: null`, checking `if (msg.gsd !== null)` before firing toasts is sufficient.
**Warning signs:** Multiple toast popups appearing immediately when switching to an instance tab.

---

## Code Examples

### AskUserQuestion event as it arrives in wsStore

```typescript
// Source: protocol.ts + classifier.py verified behavior
// msg arriving in wsStore.handleMessage:
{
  type: "stream_event",
  instance_id: "abc123...",
  data: {
    type: "tool_use",
    name: "AskUserQuestion",
    input: {
      questions: [
        {
          question: "How should we handle the auth error?",
          header: "Auth Error",
          multiSelect: false,
          options: [
            { label: "Retry with backoff", description: "Exponential retry up to 3 times" },
            { label: "Fail immediately", description: "Surface error to user" },
            { label: "Skip and continue", description: "Log and move on" }
          ]
        }
      ]
    }
  },
  gsd: "AskUserQuestion"
}
```

### Extending wsStore for prompt state

```typescript
// Source: wsStore.ts existing patterns
interface WsStore {
  // ... existing fields ...
  promptStates: Record<string, 'pending' | 'claimed_by_me' | 'claimed_by_other' | 'answered'>
  setPromptState: (instanceId: string, state: WsStore['promptStates'][string]) => void
  handleMessage: (msg: WsIncomingMessage) => void
}

// In handleMessage, add new cases:
case 'prompt_claimed':
  get().setPromptState(msg.instance_id, msg.is_mine ? 'claimed_by_me' : 'claimed_by_other')
  break
case 'prompt_answered':
  get().setPromptState(msg.instance_id, 'answered')
  break
```

### WsOutgoingMessage extensions for prompt claiming

```typescript
// Source: protocol.ts existing pattern
export type WsOutgoingMessage =
  | { type: 'subscribe'; instance_id: string }
  | { type: 'unsubscribe'; instance_id: string }
  | { type: 'claim_prompt'; instance_id: string }           // new
  | { type: 'submit_answer'; instance_id: string; prompt: string; session_id: string }  // new
```

### WsIncomingMessage extensions

```typescript
// Source: protocol.ts existing pattern
export type WsIncomingMessage =
  | { type: 'stream_event'; instance_id: string; data: Record<string, unknown>; gsd: GsdClassification }
  | { type: 'node_status_update'; node_id: string; status: 'connected' | 'stale' | 'disconnected' }
  | { type: 'instance_status'; instance_id: string; status: 'pending' | 'running' | 'finished' | 'errored' }
  | { type: 'new_node_alert'; node_id: string }
  | { type: 'prompt_claimed'; instance_id: string; is_mine: boolean }  // new
  | { type: 'prompt_answered'; instance_id: string }                    // new
```

### Backend frontend_router.py reader extension (new message types)

```python
# Source: frontend_router.py existing elif chain
elif msg_type == "claim_prompt":
    instance_id = msg.get("instance_id")
    if instance_id:
        claimed = await frontend_manager.claim_prompt(instance_id, conn)
        try:
            conn.queue.put_nowait({
                "type": "prompt_claimed",
                "instance_id": instance_id,
                "is_mine": claimed,
            })
        except asyncio.QueueFull:
            pass
        if not claimed:
            # Notify the other tab that the prompt is already claimed
            # (they'll see prompt_claimed with is_mine=False)
            pass

elif msg_type == "submit_answer":
    instance_id = msg.get("instance_id")
    prompt = msg.get("prompt", "")
    session_id = msg.get("session_id")
    if instance_id and prompt and session_id:
        # Validate the submitting connection holds the claim
        claim = frontend_manager.get_prompt_claim(instance_id)
        if claim and claim[1] is conn:
            # Broadcast answered BEFORE forwarding to node
            await frontend_manager.broadcast_prompt_answered(instance_id)
            # Dispatch the answer as a session-resume execute
            # (requires fetching node_id + project from DB)
            await handle_submit_answer(user_id, instance_id, prompt, session_id)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom notification libraries (notistack, react-toastify) | Sonner + Web Notifications API | 2023-2024 | Simpler; less JS, fewer dependencies |
| Polling for question status | WS-pushed `gsd` classification | Phase 15 | Real-time; no polling |
| New node-side protocol for input | session_id resume on existing execute | Phase 15 locked decision | No node changes needed |

---

## Open Questions

1. **Freeform wait classification (STATE.md Research Flag, MEDIUM confidence)**
   - What we know: The classifier has a stub at `if False:` for `freeform_wait`; the NDJSON event subtype for text-input blocking is unconfirmed
   - What's unclear: Whether the freeform wait is a `system` event with `subtype: "input_required"` or some other shape
   - Recommendation: Implement the freeform UI component (RESP-03) but do NOT enable the classifier stub. Mark RESP-03 as "UI ready, classifier pending" in the plan. The component will be wired but won't render until a real GSD run can be captured.

2. **`session_id` availability at answer submit time**
   - What we know: `session_id` is in the `Instance` DB row; it's returned by `GET /api/instances/:id`
   - What's unclear: Whether it's worth adding `session_id` to wsStore or always fetching it
   - Recommendation: Fetch from REST API at submit time (`GET /api/instances/:instanceId`). This is a one-time call on answer submission, not a polling loop. Simpler than extending wsStore.

3. **Whether `node_input` exists as a node protocol message**
   - What we know: The protocol-spec.md only defines `execute` as the inbound command. STATE.md says "answer dispatch uses existing execute protocol with `session_id`"
   - What's unclear: Whether the node side handles a resumed session any differently from a new one
   - Recommendation: Use `POST /api/execute` with `session_id`. This is the locked approach — no node-side changes. The planner should not invent a new `node_input` message type.

---

## Sources

### Primary (HIGH confidence)
- `/Users/josh/code/glsd-server/backend/app/ws/classifier.py` — GSD classification values, stub status
- `/Users/josh/code/glsd-server/backend/app/ws/frontend_manager.py` — Fan-out, per-user connection model, broadcast patterns
- `/Users/josh/code/glsd-server/backend/app/ws/frontend_router.py` — Reader loop, subscribe/unsubscribe, WS message handling
- `/Users/josh/code/glsd-server/frontend/src/stores/wsStore.ts` — Store shape, handleMessage switch, instanceStatuses pattern
- `/Users/josh/code/glsd-server/frontend/src/components/stream/StreamPanel.tsx` — Where to insert InteractiveResponseUI
- `/Users/josh/.claude/get-shit-done/references/questioning.md` — AskUserQuestion schema description (header, question, options, multiSelect)
- `gist.github.com/bgauryy/0cdb9aa337d01ae5bd0c803943aa36bd` — AskUserQuestion JSON schema (questions array, multiSelect boolean, options with label/description)
- `/Users/josh/code/glsd-server/.planning/STATE.md` — Locked decisions: session-resume execute, prompt_answered broadcast ordering, nil-guard requirement
- `/Users/josh/code/glsd-server/frontend/node_modules/sonner/package.json` — Sonner v2.0.7 confirmed installed

### Secondary (MEDIUM confidence)
- WebSearch: AskUserQuestion tool schema (confirmed against GSD questioning.md and gist source)

### Tertiary (LOW confidence)
- Freeform wait NDJSON shape: classifier.py stub + STATE.md research flag (exact event subtype unconfirmed)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; existing usage verified in codebase
- Architecture: HIGH — session-resume execute locked in STATE.md; frontend_manager fan-out pattern is existing code
- Multi-tab claiming: HIGH — pattern is well-defined in STATE.md; implementation follows existing WS reader extension pattern
- AskUserQuestion schema: HIGH — verified in GSD questioning.md and external gist (confirmed `multiSelect`, `options[].label`, `options[].description`)
- Freeform wait: LOW — classifier is stubbed; NDJSON event shape unconfirmed (STATE.md research flag)
- Pitfalls: HIGH — all from direct codebase reading and STATE.md critical notes

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable stack)

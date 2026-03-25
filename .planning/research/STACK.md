# Stack Research

**Domain:** GSD Integration v1.3 — stream intelligence, interactive question UI, project management, auto mode, notifications
**Researched:** 2026-03-25
**Confidence:** HIGH (Claude Agent SDK schema verified against official docs + Go SDK source; existing stack verified against package.json and requirements.txt)

> **Scope note:** The base stack is locked and working as of v1.2. This document covers only what is
> NEW, CHANGED, or requires verification for the v1.3 GSD Integration milestone. Do not re-research
> FastAPI, SQLAlchemy, React 19, TanStack Router/Query, Zustand, shadcn/ui, or Tailwind v4.

---

## Summary: No New npm or PyPI Packages Required

All v1.3 features are implementable with the existing installed dependencies. The additions are:
- New SQLAlchemy models + Alembic migration
- New FastAPI routers and service modules
- Extended TypeScript types in `ndjson.ts` and `protocol.ts`
- Extended Zustand store in `wsStore.ts`
- New React components using already-installed shadcn/ui primitives

---

## Critical Finding: Claude CLI NDJSON Event Schema

This is the load-bearing discovery for stream intelligence. The GSD node already calls
`json.loads(payload.data)` in `handle_stream_event` — so `parsed_data` is already the parsed
NDJSON object. Stream intelligence is entirely an inspection problem on that dict.

### NDJSON Event Type Catalog

**Confidence: HIGH** — verified against official Claude Agent SDK docs, the TypeScript SDK reference,
the Go third-party SDK source, and the existing `ndjson.ts` types in the frontend.

Claude CLI running with `--output-format stream-json` (the mode the GSD node uses) emits exactly
these top-level message types:

#### 1. `system` — Session initialisation (first event per run)

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "<uuid>",
  "uuid": "<uuid>",
  "cwd": "/path/to/project",
  "model": "claude-sonnet-4-6",
  "tools": ["Bash", "Read", "Write", "Edit", "AskUserQuestion"],
  "permissionMode": "default",
  "apiKeySource": "env",
  "claude_code_version": "1.x.x"
}
```

Useful for: capturing `session_id` at the server when it differs from the one in `instance_started`.

#### 2. `assistant` — Claude's response turn

```json
{
  "type": "assistant",
  "uuid": "<uuid>",
  "session_id": "<uuid>",
  "parent_tool_use_id": null,
  "message": {
    "id": "msg_xxx",
    "type": "message",
    "role": "assistant",
    "model": "claude-sonnet-4-6",
    "content": [
      { "type": "text", "text": "I will help with that..." },
      {
        "type": "tool_use",
        "id": "toolu_xxx",
        "name": "Bash",
        "input": { "command": "ls -la", "description": "List files" }
      }
    ],
    "stop_reason": "tool_use",
    "usage": { "input_tokens": 100, "output_tokens": 50 }
  }
}
```

A single `assistant` message can contain multiple content blocks. `content` is an array.
`stop_reason` values: `"end_turn"`, `"tool_use"`, `"max_tokens"`, `null`.

#### 3. `user` — Tool results returned to Claude

```json
{
  "type": "user",
  "uuid": "<uuid>",
  "session_id": "<uuid>",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_xxx",
        "content": "file1.ts\nfile2.ts",
        "is_error": false
      }
    ]
  }
}
```

#### 4. `result` — Final event per run (terminal)

```json
{
  "type": "result",
  "subtype": "success",
  "session_id": "<uuid>",
  "is_error": false,
  "result": "Task completed successfully.",
  "num_turns": 5,
  "duration_ms": 12000,
  "duration_api_ms": 9000,
  "total_cost_usd": 0.0042,
  "usage": { "input_tokens": 1200, "output_tokens": 400 }
}
```

`result` subtypes: `"success"`, `"error_max_turns"`, `"error_during_execution"`, `"error_max_budget_usd"`.
This event is immediately followed by `instance_finished` or `instance_error` from the node protocol.

#### 5. `stream_event` — Partial token deltas (opt-in only)

Only emitted when the CLI is launched with `--include-partial-messages`. The GSD node does not
use this flag. These events will not appear in normal operation and can be ignored.

---

### AskUserQuestion: Detecting the Input-Waiting State

**Confidence: HIGH** — verified against official Agent SDK user-input documentation.

`AskUserQuestion` is a built-in Claude tool. When Claude calls it, the stream emits a standard
`assistant` message with a `tool_use` content block. **There is no special event type** for
input-waiting. Detection requires inspecting each `assistant` message's `content` array.

**Detection pattern (Python, in `handle_stream_event`):**

```python
if parsed_data.get("type") == "assistant":
    content = parsed_data.get("message", {}).get("content", [])
    for block in content:
        if block.get("type") == "tool_use" and block.get("name") == "AskUserQuestion":
            tool_use_id = block["id"]   # required for response
            questions = block["input"]["questions"]
            # → update instance state, fan out to frontend
```

**`AskUserQuestion` input schema** (the `block["input"]` value):

```json
{
  "questions": [
    {
      "question": "Which approach should I use?",
      "header": "Approach",
      "options": [
        { "label": "Refactor", "description": "Clean up the existing code" },
        { "label": "Rewrite", "description": "Start from scratch" }
      ],
      "multiSelect": false
    }
  ]
}
```

Constraints (from official docs): 1–4 questions per call, 2–4 options per question, `header` max 12 chars.

**Response format (tool_result sent back via stdin to the running Claude process):**

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_xxx",
        "content": "Refactor",
        "is_error": false
      }
    ]
  }
}
```

`is_error` is mandatory. Omitting it causes the CLI's internal state builder to duplicate
tool_results, producing 400 errors. For multi-select, join labels: `"Refactor, Add tests"`.

### Protocol Constraint: AskUserQuestion Responses Require Stdin Injection

**Confidence: MEDIUM** — from GitHub issue #16712, not officially documented in the protocol spec.

The GSD node protocol v1.2.0 has **no `inject_stdin` or `reply` message type**. The existing
`execute` command starts a new subprocess; it cannot inject a `tool_result` into a process
already running. Responding to `AskUserQuestion` in-stream requires writing the tool_result JSON
to the running subprocess's stdin.

**v1.3 approach:** The server detects `AskUserQuestion` events, records the pending question
on the instance, notifies the frontend. The user sees the question rendered as buttons.
**The actual response delivery** (injecting the tool_result into the node process's stdin)
requires either:

1. A new server-to-node protocol message type (`reply` or `inject_stdin`) — needs a node change
2. A new protocol v1.3.0 — deferred since "Node-side changes" are Out of Scope for v1.3

For v1.3: implement detection, UI rendering, and notification. Mark response dispatch as
needing protocol v1.3.0 in a future milestone.

---

## Backend: New SQLAlchemy Models

No new tables require new libraries. The existing `sqlalchemy[asyncio]>=2.0.44` + `asyncpg`
handle JSON columns and boolean fields natively.

### Extensions to `Instance` model

```python
# New columns via Alembic migration
awaiting_input: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
pending_question: Mapped[dict | None] = mapped_column(JSON, nullable=True)
# Stores: {"tool_use_id": "toolu_xxx", "questions": [...]}

auto_mode_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
auto_mode_sequence: Mapped[list | None] = mapped_column(JSON, nullable=True)
# Stores: ["gsd:plan", "gsd:implement", "gsd:test"] — slash command strings
auto_mode_step: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
```

### New `Project` model

```python
class Project(Base):
    __tablename__ = "projects"
    project_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    node_id: Mapped[str] = mapped_column(String(255), ForeignKey("nodes.node_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    work_dir: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)  # "existing" | "github_clone"
    github_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

Note: `node.projects` (the `ARRAY[String]` from `node_register`) lists project *names* as
reported by the node. The new `projects` table tracks server-managed metadata (work dirs,
clone sources) independently. They are correlated by `name` field.

---

## Backend: No New Python Dependencies

| v1.3 Capability | Implementation | Existing Dep |
|---|---|---|
| NDJSON stream parsing | `dict.get()` inspection on `parsed_data` | `json` (stdlib, already called) |
| Input-waiting state detection | Extend `handle_stream_event` | No dep — plain Python |
| Project management CRUD | New `app/routers/projects.py` + `app/services/project_service.py` | `fastapi`, `sqlalchemy` (existing) |
| Auto mode sequencing | New `app/services/auto_mode_service.py` with asyncio task | `asyncio` (stdlib) |
| Frontend notifications | Extend `frontend_manager.py` with new `broadcast_*` methods | No new dep |
| GitHub clone trigger | Dispatch `execute` command with `git clone` prompt to node | Existing protocol |

---

## Frontend: No New npm Packages

### New TypeScript Types (extend `frontend/src/types/ndjson.ts`)

The existing types partially cover the schema. Add:

```typescript
// Fully typed assistant message replacing the partial AssistantTextEvent
export type ContentBlockText = {
  type: 'text'
  text: string
}

export type ContentBlockToolUse = {
  type: 'tool_use'
  id: string          // tool_use_id — needed to send responses
  name: string
  input: Record<string, unknown>
}

export type AssistantMessageEvent = {
  type: 'assistant'
  uuid: string
  session_id: string
  parent_tool_use_id: string | null
  message: {
    id: string
    role: 'assistant'
    model: string
    content: Array<ContentBlockText | ContentBlockToolUse>
    stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | null
    usage?: { input_tokens: number; output_tokens: number }
  }
}

export type SystemInitEvent = {
  type: 'system'
  subtype: 'init'
  session_id: string
  uuid: string
  cwd: string
  model: string
  tools: string[]
  permissionMode: string
}

export type FullResultEvent = {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd'
  session_id: string
  is_error: boolean
  result?: string
  num_turns: number
  duration_ms: number
  total_cost_usd?: number
  usage?: { input_tokens: number; output_tokens: number }
}

// AskUserQuestion-specific types
export type AskUserQuestionOption = {
  label: string
  description: string
  preview?: string   // optional HTML fragment (opt-in, not used in v1.3)
}

export type AskUserQuestionItem = {
  question: string
  header: string     // max 12 chars
  options: AskUserQuestionOption[]
  multiSelect: boolean
}
```

Update the `NdjsonEvent` union to include `AssistantMessageEvent | SystemInitEvent | FullResultEvent`
and deprecate the narrower `AssistantTextEvent` (keep for backward compat during transition).

### New WebSocket Protocol Messages (extend `frontend/src/types/protocol.ts`)

```typescript
// Server → frontend: Claude is waiting for user input
export type InputRequiredMessage = {
  type: 'input_required'
  instance_id: string
  tool_use_id: string              // needed if/when response dispatch is added
  questions: AskUserQuestionItem[]
}

// Server → frontend: input state cleared (run resumed or finished)
export type InputClearedMessage = {
  type: 'input_cleared'
  instance_id: string
}
```

Add to the `WsIncomingMessage` union in `protocol.ts`.

### Zustand Store Extensions (extend `wsStore.ts`)

Add to `WsStore` interface:

```typescript
// Keyed by instance_id; value is null when no question pending
pendingQuestions: Record<string, { toolUseId: string; questions: AskUserQuestionItem[] } | null>

// Actions
setPendingQuestion: (
  instanceId: string,
  toolUseId: string,
  questions: AskUserQuestionItem[]
) => void
clearPendingQuestion: (instanceId: string) => void
```

Wire `setPendingQuestion` in `handleMessage` for `input_required` message type.
Wire `clearPendingQuestion` for `input_cleared` and `instance_status` with terminal statuses.

### Notification Strategy: Sonner + Browser Notification API

**In-app (primary):** `sonner` is already installed at v2.0.7. Use it:

```typescript
import { toast } from 'sonner'

toast('Node waiting for input', {
  description: `${nodeName}: ${questionCount} question(s) pending`,
  action: {
    label: 'Answer',
    onClick: () => navigate({ to: '/dashboard/instances/$instanceId', params: { instanceId } })
  }
})
```

**Browser notification (tab-unfocused users):** Use native `Notification` API — no library:

```typescript
if (document.visibilityState === 'hidden' && Notification.permission === 'granted') {
  new Notification('GSD Node waiting for input', {
    body: `${nodeName} needs a response`,
    tag: instanceId   // prevents duplicate notifications for same instance
  })
}
```

Request `Notification.permission` once after login. Store in Zustand or localStorage.
Gracefully degrade when permission is denied or `Notification` is unsupported.

**Not needed:** Web Push API + service worker + VAPID keys. Web Push enables notifications when
the browser tab is closed — overkill for a team tool where the tab is kept open. The combination
of Sonner toasts (in-tab) and Browser Notification API (tab-hidden) covers all practical cases.

### Interactive Question UI Components

Use already-installed primitives — no new shadcn components needed:

| Question type | Component | Already available |
|---|---|---|
| Single-select (2–4 options) | `Button` group or `RadioGroup` | `@base-ui/react` radio + Button |
| Multi-select | `Checkbox` list | `@base-ui/react` checkbox |
| Free-text | `Input` + `Button` | shadcn Input already in use |
| Modal wrapper | `Dialog` | scaffolded in v1.1, not yet consumed — this is the use |

The `Dialog` component (`src/components/ui/dialog.tsx`) was noted as scaffolded but unused.
AskUserQuestion response UI is the intended consumer.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|---|---|---|
| `xterm.js` or any terminal emulator | Explicitly out of scope; Claude CLI output is NDJSON not PTY | Parse NDJSON, render as structured React UI |
| `socket.io` | Already have raw WebSocket + EventRouter fan-out | Extend existing wsStore |
| `@anthropic-ai/claude-agent-sdk` on the server | Server is not an SDK consumer — it relays node streams | Inspect `parsed_data` dict directly in `handle_stream_event` |
| `react-toastify` / `react-hot-toast` | `sonner` v2 is already installed and in use | Existing `sonner` |
| Web Push API + service worker + VAPID | Over-engineered for a team dashboard with always-open tab | Browser `Notification` API (native, zero dep) |
| `celery` + `redis` for auto mode task queue | Auto mode sequences are per-instance, short-lived asyncio tasks | asyncio background tasks inside FastAPI |
| `redis` for session/state | PostgreSQL JSON columns handle instance state well; single-server deployment | Existing PostgreSQL |
| `httpx` upgrade or new HTTP client | No new external HTTP calls needed in v1.3 | Existing httpx for OpenAI Whisper unchanged |
| New shadcn component installs | Dialog, Progress, Tabs, Checkbox are all already scaffolded | Use scaffolded components already in `src/components/ui/` |

---

## Alternatives Considered

| Feature | Considered | Rejected Because |
|---|---|---|
| AskUserQuestion response dispatch (v1.3) | New `inject_stdin` protocol message | Node-side changes are Out of Scope for v1.3; defer to protocol v1.3.0 |
| Notification delivery | Novu / MagicBell / Knock (3rd-party notification services) | External SaaS dependency adds cost + complexity for a self-hosted tool; Browser Notification API + Sonner is sufficient |
| Auto mode task queue | Celery + Redis | Celery is for distributed workers across processes; auto mode is single-instance asyncio — no distribution needed |
| Project metadata | Re-using `node.projects` ARRAY column | That column reflects what the node reports; server-managed projects need work_dir + source metadata that don't belong in the node register payload |
| Stream intelligence | Separate microservice parsing NDJSON | `handle_stream_event` is already called per NDJSON line with `parsed_data` available; a separate service adds latency with no benefit |

---

## Version Compatibility

No version changes needed. All packages remain at their current locked versions.

| Package | Current Version | v1.3 Compatible | Notes |
|---|---|---|---|
| `fastapi[standard]` | >=0.115.0 | Yes | New routers follow existing pattern |
| `sqlalchemy[asyncio]` | >=2.0.44 | Yes | `JSON`, `Boolean`, `Integer` column types all supported |
| `alembic` | >=1.18.0 | Yes | Standard auto-generated migration |
| `sonner` | ^2.0.7 | Yes | `toast()` API stable |
| `zustand` | ^5.0.12 | Yes | Store extension is purely additive |
| `@base-ui/react` | ^1.3.0 | Yes | Checkbox, RadioGroup, Dialog all available |
| `@tanstack/react-query` | ^5.95.2 | Yes | Mutation patterns identical to existing |
| `lucide-react` | ^1.0.1 | Yes | New icons (Bell, MessageSquare) addable to icons.ts barrel |

---

## Installation

```bash
# Backend — nothing to install
# All required packages already in requirements.txt

# Frontend — nothing to install
# All required packages already in package.json

# Required: new Alembic migration
# cd backend && alembic revision --autogenerate -m "add_v1_3_instance_fields_and_projects"
```

---

## Sources

- Official Agent SDK user-input docs (AskUserQuestion schema, response format): https://platform.claude.com/docs/en/agent-sdk/user-input — HIGH confidence
- Official Agent SDK TypeScript reference (SDKMessage union types): https://platform.claude.com/docs/en/agent-sdk/typescript — HIGH confidence
- Official Agent SDK streaming docs (StreamEvent, message flow): https://platform.claude.com/docs/en/agent-sdk/streaming-output — HIGH confidence
- Official Claude CLI reference (--output-format stream-json flag): https://code.claude.com/docs/en/cli-reference — HIGH confidence
- Go SDK source confirming message type structs: https://pkg.go.dev/github.com/partio-io/claude-agent-sdk-go — MEDIUM confidence (third-party but closely mirrors official)
- GitHub issue #16712 (tool_result stdin injection constraint, `is_error` requirement): https://github.com/anthropics/claude-code/issues/16712 — MEDIUM confidence (community-reported, not in official docs)
- GitHub issue #24596 (stream-json event type documentation gaps): https://github.com/anthropics/claude-code/issues/24596 — confirms documentation is deliberately sparse in this area
- Existing codebase (v1.2 baseline): `backend/app/ws/handlers.py`, `backend/requirements.txt`, `frontend/src/types/ndjson.ts`, `frontend/src/stores/wsStore.ts`, `frontend/package.json` — HIGH confidence, read directly

---

*Stack research for: GLSD Server v1.3 GSD Integration*
*Researched: 2026-03-25*

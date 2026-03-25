# Phase 15: Stream Intelligence and Command Palette - Research

**Researched:** 2026-03-25
**Domain:** Claude CLI NDJSON stream classification + React command palette UI
**Confidence:** MEDIUM (stream event format for freeform waits is LOW confidence per STATE.md; all other areas HIGH)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked — discuss phase was skipped. All implementation choices are at Claude's discretion. Applicable project-wide locked decisions from STATE.md:
- Additive stream enrichment only — classification added as `gsd` sibling field on WS message; existing `data` field shape NEVER mutated
- AskUserQuestion via session-resume execute — answer dispatch uses existing execute protocol with `session_id`; no new node-side protocol changes

### Claude's Discretion
All implementation choices for this phase (command list, palette layout, classification heuristic, enrichment field structure).

### Deferred Ideas (OUT OF SCOPE)
None listed — discuss phase skipped.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRM-01 | Server detects AskUserQuestion tool_use events in NDJSON stream and classifies them | AskUserQuestion is a `tool_use` event with `name: "AskUserQuestion"` in the parsed NDJSON data — see Code Examples below |
| STRM-02 | Server detects freeform input waits (heuristic: running instance with silence after question) | LOW confidence — STATE.md flags this explicitly; see Pitfalls section |
| STRM-03 | Server detects command completion and surfaces instance status changes | `instance_finished` / `instance_error` already tracked; `result` NDJSON event with `subtype: "success"/"error"` is the in-stream completion signal |
| STRM-04 | Server enriches forwarded stream events with GSD classification metadata (additive field, not mutating data) | Enrichment happens in `handle_stream_event` before `fan_out_stream_event` call; add `gsd` field to WS message dict |
| CMD-01 | User can see ~20 GSD commands organized in 4 categories (Project, Phase Lifecycle, Execution, Milestone) | Static command registry — no API needed; define in a `gsdCommands.ts` constant |
| CMD-02 | User can click a command button to dispatch it to the selected node/project | Reuses existing `POST /api/execute` endpoint; same pattern as ExecuteForm |
| CMD-03 | User can fill parameters for parameterized commands (phase number, task description) via mini-forms before dispatch | Inline parameter form within the palette; no dialog required (or optional dialog) |
| CMD-04 | User can see command descriptions and "when to use" guidance in the palette | Part of the static command registry data structure |
</phase_requirements>

---

## Summary

Phase 15 has two distinct sub-systems: **stream intelligence** (server-side NDJSON classification) and **command palette** (frontend UI for dispatching GSD commands).

**Stream intelligence** works by inspecting the already-parsed NDJSON `data` dict in `handle_stream_event` before fan-out. The handler already calls `json.loads(payload.data)` to get `parsed_data`. Classification logic reads `parsed_data["type"]` and, for `tool_use`, checks `parsed_data["name"] == "AskUserQuestion"`. The enriched WS message sent to frontend adds a top-level `"gsd"` field alongside the existing `"type"`, `"instance_id"`, and `"data"` fields — no mutation of `data`. For `result` events (`parsed_data["type"] == "result"`), classify as `completed`. Freeform wait detection is MEDIUM/LOW confidence territory — the exact `system` event subtype is not confirmed.

**Command palette** is a frontend component that holds a static registry of ~20 GSD commands with category, description, and parameter schema. The user selects a command, fills any parameters (phase number, task description), and clicks dispatch — which calls `POST /api/execute` with the constructed prompt string. This follows exactly the same pattern as `ExecuteForm.tsx`. The component lives within the node detail page (`$nodeId.tsx`) alongside `ExecuteForm`.

**Primary recommendation:** Implement stream classification as a pure function in a new `backend/app/ws/classifier.py` module. Keep `handle_stream_event` clean — call `classify_stream_event(parsed_data)` and attach result to the WS message. For the command palette, define a static `src/lib/gsdCommands.ts` registry and build `CommandPalette.tsx` as a collapsible section in the node detail page left panel.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python dict inspection | stdlib | NDJSON classification | Data already parsed — no new deps needed |
| React + TypeScript | existing | Command palette UI | Project standard |
| TanStack Query useMutation | existing | Command dispatch | Same pattern as ExecuteForm execute mutation |
| shadcn/ui Dialog | existing | Parameter mini-forms | Already used in ProjectDialogs |
| shadcn/ui Button | existing | Command buttons | Project standard |
| shadcn/ui Tooltip | existing | "When to use" guidance on hover | Already installed |
| Zustand wsStore | existing | Stream event consumption | Project standard — no new store needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Tabs | existing | Category tabs in palette | If horizontal category layout preferred over vertical sections |
| Lucide icons (via icons.ts) | existing | Category/command icons | Add new icons for GSD categories to icons.ts |

**Installation:** No new packages required. Everything is in the existing stack.

---

## Architecture Patterns

### Recommended Project Structure

```
backend/app/ws/
├── classifier.py          # NEW: pure classify_stream_event() function
├── handlers.py            # MODIFIED: calls classifier, enriches fan-out message
├── frontend_manager.py    # MODIFIED: fan_out enriched message format

frontend/src/
├── lib/
│   └── gsdCommands.ts     # NEW: static GSD command registry
├── components/
│   └── execute/
│       ├── ExecuteForm.tsx        # existing
│       └── CommandPalette.tsx     # NEW: GSD command palette component
├── types/
│   ├── ndjson.ts          # MODIFIED: add GsdClassification type
│   └── protocol.ts        # MODIFIED: add gsd field to stream_event message type
```

### Pattern 1: Additive Stream Enrichment

**What:** `handle_stream_event` classifies parsed NDJSON data, then passes classification to `fan_out_stream_event` as an additional field in the WS message dict — existing `data` field is NOT mutated.

**When to use:** Every stream_event — classification is always present (may be `null` when unclassified).

**Example:**
```python
# backend/app/ws/classifier.py

from typing import Literal

GsdClassification = Literal["AskUserQuestion", "freeform_wait", "completed"] | None


def classify_stream_event(parsed_data: dict) -> GsdClassification:
    """Classify a parsed NDJSON event into a GSD interaction category.

    Returns None when the event does not match any known GSD classification.
    Caller attaches result as gsd field — does NOT mutate parsed_data.
    """
    event_type = parsed_data.get("type")

    # STRM-01: AskUserQuestion tool_use detection
    if event_type == "tool_use" and parsed_data.get("name") == "AskUserQuestion":
        return "AskUserQuestion"

    # STRM-03: Command completion detection via result event
    if event_type == "result":
        return "completed"

    # STRM-02: Freeform wait — LOW CONFIDENCE
    # TODO: Capture raw NDJSON from a real gsd discuss-phase run before
    # implementing this branch. See STATE.md Research Flags.
    # Placeholder: system event with subtype "input_required" (unverified)
    if event_type == "system" and parsed_data.get("subtype") == "input_required":
        return "freeform_wait"

    return None
```

```python
# backend/app/ws/handlers.py — modified handle_stream_event

from app.ws.classifier import classify_stream_event

async def handle_stream_event(payload: StreamEventPayload) -> None:
    parsed_data = json.loads(payload.data)

    # ... persist to DB unchanged (existing code) ...

    connection_manager.append_stream_event(payload.instance_id, parsed_data)

    # Classify AFTER persistence — classification is transport metadata only
    gsd_classification = classify_stream_event(parsed_data)

    # Fan out with additive gsd field — data field shape never mutated
    await frontend_manager.fan_out_stream_event(
        payload.instance_id, parsed_data, gsd=gsd_classification
    )
```

```python
# backend/app/ws/frontend_manager.py — modified fan_out_stream_event

async def fan_out_stream_event(
    self, instance_id: str, data: dict, gsd: str | None = None
) -> None:
    msg = {
        "type": "stream_event",
        "instance_id": instance_id,
        "data": data,
        "gsd": gsd,  # None when unclassified; never mutates data
    }
    # ... existing put_nowait loop ...
```

### Pattern 2: Static Command Registry

**What:** A TypeScript constant defining all ~20 GSD commands with their metadata. No backend involvement — commands are purely a UI concern until dispatch.

**When to use:** Command palette renders from this registry; dispatch calls POST /api/execute with the command's prompt.

**Example:**
```typescript
// frontend/src/lib/gsdCommands.ts

export type GsdCommandCategory = 'Project' | 'Phase Lifecycle' | 'Execution' | 'Milestone'

export interface GsdCommandParam {
  key: string
  label: string
  placeholder: string
  required: boolean
}

export interface GsdCommand {
  id: string
  category: GsdCommandCategory
  label: string
  description: string
  whenToUse: string
  /** Template string — use {{paramKey}} for substitution */
  promptTemplate: string
  params: GsdCommandParam[]
}

export const GSD_COMMANDS: GsdCommand[] = [
  // Project category
  {
    id: 'new-project',
    category: 'Project',
    label: 'New Project',
    description: 'Bootstrap a new GSD project structure',
    whenToUse: 'Use when starting a brand new project on this node',
    promptTemplate: '/gsd:new-project',
    params: [],
  },
  {
    id: 'discuss-phase',
    category: 'Phase Lifecycle',
    label: 'Discuss Phase',
    description: 'Discuss requirements for a phase before planning',
    whenToUse: 'Use to gather user decisions before running plan-phase',
    promptTemplate: '/gsd:discuss-phase {{phase}}',
    params: [
      { key: 'phase', label: 'Phase number', placeholder: '15', required: true },
    ],
  },
  {
    id: 'plan-phase',
    category: 'Phase Lifecycle',
    label: 'Plan Phase',
    description: 'Research and plan implementation for a phase',
    whenToUse: 'Use after discuss-phase to generate task plans',
    promptTemplate: '/gsd:plan-phase {{phase}}',
    params: [
      { key: 'phase', label: 'Phase number', placeholder: '15', required: true },
    ],
  },
  // ... more commands ...
]

export const GSD_COMMAND_CATEGORIES: GsdCommandCategory[] = [
  'Project',
  'Phase Lifecycle',
  'Execution',
  'Milestone',
]
```

### Pattern 3: CommandPalette Component

**What:** Collapsible section in the node detail page left panel. Shows commands grouped by category. Clicking a command either dispatches immediately (no params) or reveals an inline mini-form.

**When to use:** Rendered inside `$nodeId.tsx` left column, below `ExecuteForm` and `ProjectManager`.

**Example structure:**
```typescript
// frontend/src/components/execute/CommandPalette.tsx
// Props: node: NodeResponse, onInstanceCreated: (instanceId: string) => void
// State: selectedCommandId, paramValues
// On dispatch: build prompt from template + params, call POST /api/execute
// Same useMutation pattern as ExecuteForm.executeMutation
```

### Pattern 4: WS Protocol Extension

**What:** `WsIncomingMessage` type in `protocol.ts` extended to include optional `gsd` field on stream_event messages.

**Example:**
```typescript
// frontend/src/types/protocol.ts
export type GsdClassification = 'AskUserQuestion' | 'freeform_wait' | 'completed' | null

export type WsIncomingMessage =
  | {
      type: 'stream_event'
      instance_id: string
      data: Record<string, unknown>
      gsd: GsdClassification  // NEW — null when unclassified
    }
  | { type: 'node_status_update'; node_id: string; status: 'connected' | 'stale' | 'disconnected' }
  | { type: 'instance_status'; instance_id: string; status: 'pending' | 'running' | 'finished' | 'errored' }
  | { type: 'new_node_alert'; node_id: string }
```

### Anti-Patterns to Avoid

- **Mutating `parsed_data`** before passing to `fan_out_stream_event` — locked decision prohibits this; always use a separate `gsd` field at the WS message envelope level
- **Storing gsd classification in DB** — this is transport metadata only; the DB stores raw NDJSON unchanged
- **Making command palette a dialog/modal** — it should be an inline collapsible section, not a popup, consistent with existing ExecuteForm and ProjectManager panels
- **Direct lucide-react imports** in CommandPalette — always import through `src/lib/icons.ts`
- **Implementing freeform_wait without raw NDJSON evidence** — STATE.md explicitly flags this as a research gap; ship with a TODO stub

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command dispatch | Custom HTTP layer | Existing `POST /api/execute` + TanStack Query useMutation | Identical to ExecuteForm pattern — just a different prompt string |
| Template interpolation | Regex-based parser | Simple `str.replace` in TypeScript | `{{phase}}` substitution in a 20-command list does not warrant a library |
| Category tabs | Custom tab component | shadcn/ui Tabs (already installed) | Consistent styling, already in project |
| Parameter forms | Custom form builder | Inline controlled inputs per param | Command set is static; no dynamic schema needed |
| WS type extension | New WS message type | Additive field on existing `stream_event` — locked decision | No protocol changes on node side |

---

## Runtime State Inventory

> Skipped — this is a greenfield feature phase, not a rename/refactor/migration.

---

## Environment Availability

> Skipped — no new external dependencies. The phase adds Python code within the existing FastAPI/asyncio server and TypeScript within the existing React app. All required tools (Node.js, Python, uvicorn) are already running.

---

## Common Pitfalls

### Pitfall 1: Freeform Wait System Event Subtype is Unconfirmed

**What goes wrong:** Developer implements STRM-02 using a guessed `system.subtype` value (e.g., `"input_required"`) that does not match what Claude CLI actually emits. Freeform wait is never detected, or worse, wrong events are classified as freeform waits.

**Why it happens:** The exact `system` event subtype for text-input blocking is documented nowhere in official Claude CLI docs as of 2026-03-25. GitHub issue #24596 confirms stream-json event types are incompletely documented.

**How to avoid:** Capture raw NDJSON from a real `gsd discuss-phase` run (which is known to issue freeform text prompts) before implementing the heuristic. Log the raw `system` events. Only then implement the `subtype` check. STATE.md explicitly: "Do not ship heuristic detection without this data."

**Warning signs:** If you're writing `if subtype == "..."` based on guesswork rather than observed output, stop.

### Pitfall 2: Mutating the `data` Field in the WS Message

**What goes wrong:** Developer adds `gsd` classification by doing `parsed_data["gsd"] = classification` before passing to `fan_out_stream_event`. This mutates the `data` field shape — a locked decision violation.

**Why it happens:** It's the shortest code path.

**How to avoid:** Pass `gsd` as a separate argument to `fan_out_stream_event` and include it in the WS message envelope at the `msg` dict level, not inside `data`. The WS message shape becomes `{type, instance_id, data, gsd}`.

### Pitfall 3: CommandPalette Uses Barrel Import from lucide-react

**What goes wrong:** Importing icons directly from `lucide-react` in CommandPalette.tsx slows the dev server 5-8x.

**Why it happens:** Natural reflex when writing new components.

**How to avoid:** Only import from `src/lib/icons.ts`. Add any new icons needed (e.g., `Command`, `Layout`, `Zap`) to the barrel file first.

### Pitfall 4: Prompt Template with Missing Required Params Dispatched

**What goes wrong:** User clicks dispatch before filling a required param (e.g., phase number). The prompt sent is `/gsd:plan-phase {{phase}}` — literally with the template placeholder — causing a confused Claude session.

**Why it happens:** Dispatch button not properly gated on param completeness.

**How to avoid:** Gate the dispatch button with `canDispatch = allRequiredParamsFilled`. Mirror the `canExecute` guard in `ExecuteForm.tsx`.

### Pitfall 5: Re-buffered Stream Events Missing `gsd` Field on Replay

**What goes wrong:** When a frontend subscribes to an instance that is already streaming, buffered events are replayed from `connection_manager.get_stream_events()`. These replayed events are constructed in `frontend_router.py` and do NOT include the `gsd` field — causing TypeScript type errors or runtime `undefined` access.

**Why it happens:** The replay path in `frontend_router.py` constructs messages directly:
```python
conn.queue.put_nowait({
    "type": "stream_event",
    "instance_id": instance_id,
    "data": event,
})
```
This will be missing `gsd` after enrichment is added.

**How to avoid:** Either (a) store enriched events in the in-memory buffer (requires changing `connection_manager.append_stream_event` to store `{data, gsd}` tuples), OR (b) add `"gsd": None` to the replay message construction in `frontend_router.py`. Option (b) is simpler and correct — replayed events don't need live classification since they're historical context.

### Pitfall 6: AskUserQuestion Input Schema Assumptions

**What goes wrong:** Developer assumes the `input` dict on a `tool_use` event for AskUserQuestion always has `options`, `questions`, and `header`. In practice, some calls omit `options` (pure freeform question).

**Why it happens:** The schema from GitHub issue #27353 shows all fields, but they may be optional.

**How to avoid:** Classify based solely on `name == "AskUserQuestion"` — do NOT branch on `input` content for STRM-01. The Phase 16 response UI handles input schema differences. For Phase 15, classification only needs `"AskUserQuestion"`.

---

## Code Examples

### AskUserQuestion NDJSON Event Structure

From GitHub issue #27353 (MEDIUM confidence — field names confirmed; optionality uncertain):

```json
{
  "type": "tool_use",
  "name": "AskUserQuestion",
  "input": {
    "header": "Optional header text",
    "questions": [
      { "question": "The question text here" }
    ],
    "options": ["Option A", "Option B", "Option C"]
  }
}
```

Note: `options` may be absent for freeform text input. `header` may be absent.

### Result (Completion) NDJSON Event

Already modeled in `frontend/src/types/ndjson.ts`:

```json
{
  "type": "result",
  "subtype": "success",
  "result": "...",
  "cost_usd": 0.0042
}
```

Or on error:
```json
{
  "type": "result",
  "subtype": "error",
  "error": "..."
}
```

### System Event (api_retry — HIGH confidence, confirmed in official docs)

```json
{
  "type": "system",
  "subtype": "api_retry",
  "attempt": 1,
  "max_retries": 3,
  "retry_delay_ms": 500,
  "error_status": 529,
  "error": "rate_limit",
  "uuid": "...",
  "session_id": "..."
}
```

### GSD Command Prompt Template Expansion

```typescript
function expandPrompt(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replace(`{{${key}}}`, value),
    template
  )
}
// "/gsd:plan-phase {{phase}}" + { phase: "15" } => "/gsd:plan-phase 15"
```

### Enriched WS Message Shape

After Phase 15, the WS message sent to frontend for stream events:

```json
{
  "type": "stream_event",
  "instance_id": "abc-123",
  "data": { "type": "tool_use", "name": "AskUserQuestion", ... },
  "gsd": "AskUserQuestion"
}
```

For unclassified events:
```json
{
  "type": "stream_event",
  "instance_id": "abc-123",
  "data": { "type": "assistant", ... },
  "gsd": null
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Headless mode (`-p` flag) | Agent SDK / CLI with `--output-format stream-json` | 2025 | NDJSON stream from Claude CLI is now standard; `stream-json` is the canonical headless format |
| AskUserQuestion renders raw JSON | Should render interactive UI (bug open) | Still open (#27353) | Our classifier just needs to detect `name == "AskUserQuestion"`; the UI rendering is Phase 16's job |

**Deprecated/outdated:**
- "Headless mode" terminology: now called "Agent SDK via CLI" in official docs (same `-p` flag, new branding)

---

## Open Questions

1. **Freeform wait system event subtype**
   - What we know: Claude CLI emits `system` events with various `subtype` values. `api_retry` is confirmed. The subtype for text-input blocking is NOT confirmed.
   - What's unclear: Does `gsd discuss-phase` (which issues freeform text prompts) emit `system.subtype == "input_required"`, `"waiting_for_input"`, or something else? Or does it not use a `system` event at all?
   - Recommendation: Ship classifier with a clearly-marked placeholder for `freeform_wait`. Do not activate the branch until raw NDJSON is captured from a live `gsd discuss-phase` run. The STATE.md flag is explicit about this.

2. **GSD command list completeness**
   - What we know: The success criteria says "~20 GSD commands in 4 categories". The categories are Project, Phase Lifecycle, Execution, Milestone.
   - What's unclear: The exact set of GSD slash commands that should be in the palette — need to look at the GSD skills directory or CLAUDE.md in a GSD project for the definitive command list.
   - Recommendation: Research the actual available commands by reading `/gsd:` usage from the ROADMAP context or a running GSD project. The 20-command target is achievable with research/plan/execute/verify lifecycle commands across phases.

3. **Project context for palette dispatch**
   - What we know: Commands like `/gsd:plan-phase 15` need a `work_dir` to dispatch. The `dispatch_execute` function requires `project` + `work_dir`.
   - What's unclear: Should the palette auto-use the currently-selected project, or require the user to pick?
   - Recommendation: Auto-use the first/currently-selected project (same as ExecuteForm default). If no project is selected, show an informational state.

---

## Project Constraints (from CLAUDE.md)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- ALWAYS read a file before editing it
- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code — but nyquist_validation is false so no test wave required
- Use event sourcing for state changes
- Ensure input validation at system boundaries
- NEVER hardcode API keys, secrets, or credentials
- All Lucide icons via `src/lib/icons.ts` — never direct from `lucide-react`
- No `motion` library — animations via `tw-animate-css` and CSS `@keyframes` only
- OKLCH tokens in `:root`/`.dark` only — never in `@theme inline`
- Never add mount animations to stream output rows — animation queuing at >5 events/sec
- shadcn uses `data-slot` selectors — read component source before overriding; edit source directly
- Naive UTC datetimes everywhere — use `utcnow()` helper, never `datetime.now(timezone.utc)`

---

## Sources

### Primary (HIGH confidence)
- `/Users/josh/code/glsd-server/backend/app/ws/handlers.py` — existing handle_stream_event pattern; double-encoded JSON already parsed
- `/Users/josh/code/glsd-server/backend/app/ws/frontend_manager.py` — existing fan_out_stream_event signature; how enrichment plugs in
- `/Users/josh/code/glsd-server/backend/app/ws/frontend_router.py` — replay path that must be patched for Pitfall 5
- `/Users/josh/code/glsd-server/frontend/src/types/ndjson.ts` — existing NdjsonEvent union type; shows SystemEvent, ResultEvent, ToolUseEvent shapes
- `/Users/josh/code/glsd-server/frontend/src/types/protocol.ts` — WsIncomingMessage type to extend
- `/Users/josh/code/glsd-server/frontend/src/stores/wsStore.ts` — handleMessage dispatch logic; gsd field flows transparently
- `/Users/josh/code/glsd-server/.planning/STATE.md` — locked decisions and explicit research flags
- Official Claude Code docs (code.claude.com/docs/en/headless) — stream-json output format, system event types
- Official Claude Code docs (code.claude.com/docs/en/cli-reference) — CLI flags confirmed

### Secondary (MEDIUM confidence)
- GitHub issue #27353 (anthropics/claude-code) — AskUserQuestion input schema: `{questions, header, options}` fields
- GitHub issue #24596 (anthropics/claude-code) — confirms stream-json event types are incompletely documented; text_delta, input_json_delta confirmed
- Agent SDK streaming docs (platform.claude.com/docs/en/agent-sdk/streaming-output) — StreamEvent wrapper types, content_block_delta, tool_use streaming

### Tertiary (LOW confidence)
- Freeform wait `system.subtype` value — not found in any official source; inferred from common patterns but NOT verified

---

## Metadata

**Confidence breakdown:**
- STRM-01 (AskUserQuestion detection): HIGH — tool_use name field confirmed via GitHub issue #27353
- STRM-02 (freeform wait): LOW — exact system event subtype unconfirmed; STATE.md explicitly flags this
- STRM-03 (completion detection): HIGH — `result` event type already in ndjson.ts; `instance_finished` already handled
- STRM-04 (additive enrichment): HIGH — insertion point in handlers.py is clear; locked decision on field shape
- CMD-01 through CMD-04 (palette): HIGH — pattern established by ExecuteForm.tsx; static registry needs no new infrastructure

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable pattern — Claude CLI event format unlikely to change)

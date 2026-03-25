# Feature Research

**Domain:** GSD Control Plane — v1.3 GSD Integration milestone
**Researched:** 2026-03-25
**Confidence:** HIGH for GSD command set (local codebase inspected); HIGH for AskUserQuestion format (official Anthropic Agent SDK docs); MEDIUM for auto mode sequencing (inferred from GSD workflow files and Claude CLI docs); LOW for project management API (no existing implementation to inspect)

## Context

This is a subsequent milestone. The dashboard ships through v1.2 with JWT auth, WebSocket streaming, execute form, node management, voice input, audit log, and cyberpunk theming. This research covers ONLY the new v1.3 features:

- Project management on nodes (create, connect existing folder, clone GitHub repo)
- GSD command palette with contextual buttons for ~20 key commands
- Stream intelligence — parse NDJSON to detect AskUserQuestion, freeform input waits, command completion
- Interactive response UI — render questions as buttons, checkboxes, or text fields
- Notifications when nodes need input or complete work
- Auto mode — sequential GSD command execution with /clear between steps

**Key constraint:** All "project management" and "GSD commands" are dispatched through the existing `execute` protocol — the server sends an `execute` envelope with a `prompt` field containing the GSD slash command as text. The node side is not changed. There is no new wire protocol for project management or GSD commands.

**AskUserQuestion confirmed format** (from Anthropic Agent SDK docs, HIGH confidence):
```json
{
  "type": "tool_use",
  "name": "AskUserQuestion",
  "input": {
    "questions": [
      {
        "question": "Full question text to display",
        "header": "Short label (max 12 chars)",
        "options": [
          { "label": "Option A", "description": "Brief explanation" },
          { "label": "Option B", "description": "Brief explanation" }
        ],
        "multiSelect": false
      }
    ]
  }
}
```
Response must return the `questions` array plus an `answers` record (question text → selected label). For multi-select: join labels with `", "`. Free-text allowed as answer value.

**GSD commands confirmed** (from local `~/.claude/get-shit-done/` installation):
The GSD project is a set of Claude Code slash commands (`/gsd:*`) that implement a structured planning and execution workflow. Commands are invoked as prompts sent to Claude CLI — they are not separate executables.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users of a GSD control plane will assume exist. Missing these makes v1.3 feel like a minor polish update rather than a GSD-aware system.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| GSD command palette with one-click buttons | Users dispatch GSD commands repeatedly — typing `/gsd:next` or `/gsd:autonomous` into a text field every time defeats the purpose of a control panel | MEDIUM | ~20 buttons grouped by category. Each button populates and submits the execute form with the corresponding slash command as the prompt. Uses existing dispatch path unchanged. |
| AskUserQuestion detection and interactive UI | Claude CLI's GSD workflow issues `AskUserQuestion` tool calls for phase decisions and grey area questions — these block execution until answered. Without detection, the stream appears stuck with no indication that user input is needed | HIGH | Parse `tool_use` events from stream where `name === "AskUserQuestion"`. Extract `questions[].options`, render as clickable buttons. Send the answer back via a new execute (resume session). |
| Notification when node needs input | Users may be watching another tab when a node pauses for `AskUserQuestion`. Without notification, they miss the pause indefinitely | MEDIUM | Browser Notification API (`Notification.requestPermission()` + `new Notification(...)`). Also surface in-dashboard badge/alert. Trigger on AskUserQuestion detection. |
| Notification when instance completes | Users kick off long-running tasks and switch tabs. Without completion notification, they poll manually | LOW | Same mechanism as above. Trigger on `instance_finished`/`instance_error` WS events. Already available in the WS store — just need notification dispatch. |
| Session resume from instance list | GSD commands rely on session continuity for multi-turn workflows (e.g., autonomous phases build on prior context). Users must be able to resume the Claude session from a finished instance | LOW | Already partially built: `session_id` is tracked per instance. The execute form has a `session_id` field in Advanced. Need a "Resume Session" button on instance rows that pre-fills the session_id in the execute form. |
| Project list visible per node | GSD commands are project-scoped. Users need to see what projects exist on each node before issuing commands | LOW | Already exposed: `node.projects` array shown in the execute form project picker. May need explicit display in node detail header. |

### Differentiators (Competitive Advantage)

Features that make this a purpose-built GSD control plane, not just a generic Claude CLI relay.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto mode — sequential command execution | Users running a milestone with `/gsd:autonomous` followed by `/gsd:complete-milestone` need to chain commands without manual intervention between steps. Auto mode fires commands in sequence, using session resume to maintain context, with `/clear` or session break between independent commands | HIGH | Server-side: persist an "auto sequence" with step list, current position, and instance chain. Frontend: sequence builder UI (ordered list of commands + run button). Backend: after each instance_finished, dispatch next command automatically. No node-side changes. |
| AskUserQuestion rendered as interactive choice UI | Rendering questions as actual buttons/checkboxes rather than raw JSON in the stream makes GSD's autonomous-mode pauses actionable from the dashboard rather than requiring a separate terminal | HIGH | Extends stream parser. AskUserQuestion events are intercepted before reaching generic tool_use renderer. Rendered as a Card with question text, option buttons (single or multi-select), and a Submit button that dispatches the answer. |
| Freeform input wait detection | GSD's `discuss-phase` and other interactive workflows use Claude's built-in text input wait (user types at the prompt). The NDJSON stream shows this as the conversation waiting for a `user` turn. The dashboard should detect "waiting for input" state and offer a text field | MEDIUM | Detect `result` event with `subtype: "error"` containing "waiting for input" — or detect that the instance is `running` with no stream events for N seconds and the last assistant turn asked a question. Show a text field that submits a follow-up execute with the answer as the prompt. |
| GSD command categories and descriptions in palette | Users who are new to GSD don't know what each command does. A palette with categories (Project, Phase Lifecycle, Execution, Navigation) and one-line descriptions converts better than a raw button grid | LOW | Static metadata — category label, description, when to use. No backend changes. |
| Project management via GSD protocol | Dispatching project setup commands (create new project, connect existing folder, clone repo) as GSD-style prompts from the dashboard lets users bootstrap new workspaces without SSHing into the node | MEDIUM | Three command templates: (1) `/gsd:new-project` with project name/path arg, (2) connect a folder (custom prompt to run setup in a given directory), (3) clone + setup (prompt to git clone and run /gsd:new-project). All dispatched via existing execute. UI: a "New Project" form on the node detail page. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| xterm.js terminal emulation for stream | Feels like a "real terminal" — familiar to developers | PROJECT.md explicitly excludes this. Claude CLI output is NDJSON, not PTY bytes. An xterm.js pane would render raw JSON lines, not formatted output. The structured NDJSON renderer already gives richer display (collapsible tool use, cost summaries, assistant text formatting) than a raw terminal could. | Keep the structured NDJSON renderer. Add AskUserQuestion interactive overlay on top of it. |
| Node-side project file browser | Users want to pick a `work_dir` by browsing the remote filesystem | Requires a new node-side API (file tree endpoint) that doesn't exist in the v1.2.0 protocol. Out of scope — "Node-side changes" is explicitly Out of Scope in PROJECT.md. | Use the projects list from `node.projects` (already available). Users set up projects on the node side; the dashboard shows what's there. |
| Real-time cost budget enforcement | Kill execution when it exceeds a USD budget | No cost data in the wire protocol — the `result` event from Claude CLI contains `cost_usd` but only at the end of a run. Intra-run cost is unavailable without Claude API integration beyond what the GSD node provides. | Display cost from `result` event in the stream panel. Budget enforcement would require node-side changes. |
| Persistent auto mode sequences (saved playbooks) | Power users want to save their 5-step command chains | Requires a DB table, CRUD UI, and sequence management surface. Scope creep for v1.3. The auto mode sequencer should work for the session without persistence. | Ship session-scoped auto mode first. Persist sequences in a future v1.4 milestone if user demand justifies it. |
| Multi-node broadcast execution | Run the same GSD command on all connected nodes simultaneously | Tempting for updates/deployments but creates race conditions on shared repos, makes stream output attribution confusing, and makes session resume impossible (each node gets its own session_id). | Dispatch to nodes individually from the node list. Let users initiate per-node. |

---

## GSD Command Catalog

The GSD system is a set of Claude Code slash commands installed at `~/.claude/get-shit-done/commands/gsd/`. All commands are invoked by sending the slash command as the prompt text in an execute dispatch. The node runs Claude CLI with this prompt in the configured project directory.

### Project Commands (Project Bootstrap and Navigation)

| Command | Prompt Text | Description | When to Use |
|---------|-------------|-------------|-------------|
| New Project | `/gsd:new-project` | Initialize a new GSD-managed project in the work dir | Setting up a brand new project from scratch |
| New Milestone | `/gsd:new-milestone` | Define and research a new milestone | Starting a new feature milestone in an existing project |
| Map Codebase | `/gsd:map-codebase` | Generate codebase structure maps | Onboarding to an existing unfamiliar repo |
| Resume Work | `/gsd:resume-work` | Restore session state and continue from last position | Picking up after a break or session expiry |
| Progress | `/gsd:progress` | Show milestone progress and current phase status | Checking where work stands |

### Phase Lifecycle Commands (Discuss → Plan → Execute cycle)

| Command | Prompt Text | Description | When to Use |
|---------|-------------|-------------|-------------|
| Discuss Phase | `/gsd:discuss-phase` | Gather requirements and decisions for current phase | Before planning — establishes what to build |
| Plan Phase | `/gsd:plan-phase` | Generate step-by-step implementation plans | After discuss — breaks phase into tasks |
| Execute Phase | `/gsd:execute-phase` | Run the implementation plans for current phase | After plan — does the actual work |
| Verify Phase | `/gsd:verify-phase` | Check that phase goals were met | After execute — validates completion |
| Add Phase | `/gsd:add-phase` | Insert a new phase into the roadmap | When scope expands mid-milestone |

### Execution Commands (Autonomous and Batch)

| Command | Prompt Text | Description | When to Use |
|---------|-------------|-------------|-------------|
| Autonomous | `/gsd:autonomous` | Run all remaining phases automatically | Hands-off execution of a full milestone |
| Autonomous (from N) | `/gsd:autonomous --from <N>` | Run all phases starting from phase N | Resuming autonomous mode after a break |
| Next | `/gsd:next` | Detect state and advance to next logical step | Unsure what to do next — smart routing |
| Do | `/gsd:do <task>` | Route a freeform task description to the right command | Natural language task dispatch |
| Quick | `/gsd:quick <task>` | Execute a small, self-contained task directly | One-off fixes, small features |

### Milestone Lifecycle Commands (Ship and Archive)

| Command | Prompt Text | Description | When to Use |
|---------|-------------|-------------|-------------|
| Audit Milestone | `/gsd:audit-milestone` | Review all phases for completeness and debt | Before shipping — validates the milestone |
| Complete Milestone | `/gsd:complete-milestone` | Archive milestone files and prepare for next | After audit passes — closes the milestone |
| Workstreams | `/gsd:workstreams` | List and manage parallel workstreams | Multi-track work within a milestone |

### Utility Commands

| Command | Prompt Text | Description | When to Use |
|---------|-------------|-------------|-------------|
| Research Phase | `/gsd:research-phase` | Deep-dive research on a specific topic | Before adding a technically uncertain phase |
| Add Todo | `/gsd:add-todo <item>` | Capture a future task or idea | Noting something without losing flow |
| Debug | `/gsd:debug <issue>` | Systematic investigation of a bug or error | When something is broken |
| Help | `/gsd:help` | Show available commands and routing guide | New users, unknown command names |

**Total: ~20 commands across 4 categories** — matches the PROJECT.md target.

---

## Feature Dependencies

```
AskUserQuestion Detection (stream intelligence)
    └──required-by──> Interactive Question UI
                          (must detect before rendering)
    └──required-by──> Input-needed Notification
                          (must detect to trigger notification)

Instance session_id (already tracked in DB)
    └──required-by──> Session Resume button
                          (session_id pre-fills execute form)
    └──required-by──> Auto mode step chaining
                          (each step uses prior step's session_id to maintain context)

Execute dispatch (existing)
    └──required-by──> GSD Command Palette
                          (all commands are dispatched via execute with GSD slash command as prompt)
    └──required-by──> Auto mode
                          (each sequence step is an execute dispatch)
    └──required-by──> AskUserQuestion answer submission
                          (answer is a follow-up execute resuming the session)

Browser Notification API
    └──required-by──> Input-needed notification
    └──required-by──> Completion notification
                          (both use same permission grant + dispatch pattern)

Auto mode step state
    └──requires──> Instance terminal event (instance_finished/instance_error)
                       (auto mode listens for terminal event before advancing to next step)
    └──requires──> Session resume (session_id from prior step)
                       (carry context between auto mode steps)

Project management UI
    └──no-new-backend-deps──> Uses existing execute dispatch
                                   (project setup commands are prompts sent to Claude CLI)
```

### Dependency Notes

- **AskUserQuestion detection is the critical path for stream intelligence.** All interactive UI features (question rendering, input-needed notifications) depend on correctly parsing `tool_use` events with `name === "AskUserQuestion"` from the NDJSON stream. The existing stream parser handles `tool_use` generically — this needs a new case.
- **GSD command palette has no new dependencies.** Every command is dispatched via the existing execute path. The palette is purely a UI convenience layer over the existing form.
- **Auto mode requires a new server-side sequence state machine.** The execute dispatch and session resume are existing primitives, but the sequencer that chains them (listening for terminal events, advancing state, issuing next dispatch) is new backend logic.
- **Freeform input wait is lower confidence.** The detection heuristic (running instance + no events + last turn was a question) is inferred from Claude CLI behavior. May require empirical testing against real GSD workflow runs to tune the detection.
- **Notification permission must be requested proactively.** Browser notifications require an explicit user gesture to request permission. The UI must prompt the user to enable notifications (ideally on first use or via a settings toggle) — notifications silently fail if permission was never granted.

---

## MVP Definition (v1.3 GSD Integration)

### Launch With (v1.3)

Minimum that transforms the server from generic Claude CLI relay to GSD-aware control plane.

- [ ] GSD command palette — ~20 buttons in 4 categories, each dispatches the slash command as a prompt via existing execute — why essential: without this, users must hand-type every GSD command into the form text field, making the dashboard slower than a terminal
- [ ] AskUserQuestion stream detection + interactive UI — detect `tool_use.name === "AskUserQuestion"` in stream, render questions as option buttons, submit answer as session-resume execute — why essential: without this, GSD's discuss-phase and autonomous mode pause indefinitely when Claude asks a question; the dashboard is unusable for GSD workflows
- [ ] Completion + input-needed browser notifications — notify on `instance_finished`/`instance_error` and on AskUserQuestion detection — why essential: users need to know when to return; without this, long-running GSD tasks require tab-watching
- [ ] Session resume from instance list — "Resume" button on finished instances pre-fills session_id in execute form — why essential: GSD workflows span multiple sessions; session continuity is a core feature
- [ ] Project management commands — "New Project" form on node detail that dispatches `/gsd:new-project` (or clone+setup) — why essential: users must be able to bootstrap new workspaces from the dashboard, not just run commands in pre-existing ones

### Add After Validation (v1.x)

- [ ] Auto mode sequential execution — trigger: users report that chaining `/gsd:autonomous` → `/gsd:complete-milestone` requires manually watching for completion and re-dispatching
- [ ] Freeform input wait detection — trigger: empirical evidence that GSD discuss-phase blocks on text input in ways not covered by AskUserQuestion
- [ ] Auto mode sequence persistence — trigger: users want to save their standard 3-step command chains across sessions

### Future Consideration (v2+)

- [ ] Multi-workstream tracking — shows parallel GSD workstreams across nodes; deferred until base GSD integration is stable
- [ ] Cost tracking dashboard — aggregate cost_usd from result events; requires accumulation and storage beyond the current ephemeral stream buffer

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| GSD command palette | HIGH | MEDIUM | P1 |
| AskUserQuestion detection | HIGH | HIGH | P1 |
| AskUserQuestion interactive UI | HIGH | HIGH | P1 |
| Completion notifications | HIGH | LOW | P1 |
| Input-needed notifications | HIGH | LOW | P1 |
| Session resume from instance list | HIGH | LOW | P1 |
| Project management (new project / clone) | MEDIUM | MEDIUM | P1 |
| Auto mode sequential execution | HIGH | HIGH | P2 |
| Freeform input wait detection | MEDIUM | MEDIUM | P2 |
| Auto mode sequence persistence | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.3 launch — defines the milestone
- P2: High value, add after P1 features are stable
- P3: Nice to have, future milestone

---

## Implementation Notes by Feature

### GSD Command Palette

**Expected behavior:** On the node detail page, a collapsible "GSD Commands" panel shows ~20 buttons grouped into 4 categories: Project, Phase Lifecycle, Execution, Milestone Lifecycle. Clicking a button populates the execute form's prompt field with the slash command text and optionally submits immediately (or just fills the form so the user can review first). Parameterized commands (e.g., `/gsd:autonomous --from <N>`) render a mini-form with an input for the parameter before dispatching.

**Implementation approach:** New `GsdCommandPalette` component. Static metadata array defines commands (slug, prompt, category, description, parameters). Each button calls the same `executeMutation` as the execute form, setting `project` from the current node's project selection and `prompt` to the command text. No backend changes.

**Complexity:** MEDIUM — the dispatch path is existing, but the palette needs parameter handling and category layout.

### AskUserQuestion Detection + Interactive UI

**Expected behavior:** The stream parser (`StreamEventRenderer`) detects `tool_use` events where `name === "AskUserQuestion"`. Instead of rendering the generic collapsible JSON view, it renders a `QuestionCard` component: question text displayed prominently, options as clickable `Button` elements (shadcn), a "Submit" button. For `multiSelect: true`, options toggle between selected/unselected (checkbox behavior). Submit dispatches a follow-up execute to the same node/project/session with the answer encoded as text: `"[Answer to: {question}]: {selected_label}"`.

**NDJSON event format (confirmed from Anthropic docs):**
```json
{
  "type": "tool_use",
  "name": "AskUserQuestion",
  "input": {
    "questions": [
      {
        "question": "Which approach should I take?",
        "header": "Approach",
        "options": [
          { "label": "Option A", "description": "Description A" },
          { "label": "Option B", "description": "Description B" }
        ],
        "multiSelect": false
      }
    ]
  }
}
```

**Answer response format** (must pass back to Claude): the follow-up prompt must include the answers in a format Claude understands. Based on Agent SDK docs, answers are a record mapping question text to selected label. The prompt text should be: `"[Answering AskUserQuestion] {question text}: {selected label}"`.

**Complexity:** HIGH — requires extending the type system in `ndjson.ts`, a new component, and answer-dispatch logic. The answer routing (which session to resume, which node/project) must come from the active stream context.

**Important limitation:** This works for the Agent SDK `canUseTool` callback pattern. When running Claude CLI via `claude -p --output-format stream-json`, the AskUserQuestion appears as a `tool_use` event in the NDJSON stream. The GSD node runs Claude CLI in this mode. The response must be sent as a new execute with `session_id` to resume the conversation at the point of the question — not via a separate channel.

### Auto Mode Sequential Execution

**Expected behavior:** A new "Auto Mode" toggle on the node detail page. When enabled, the user builds a sequence of GSD commands (ordered list, drag to reorder). Clicking "Run Sequence" dispatches the first command. When that instance reaches `instance_finished`, the server automatically dispatches the next command in the sequence, using the same `session_id` to maintain context (or a fresh session if the user wants a clean state with `/clear`). The UI shows a progress indicator across the sequence steps.

**Server-side requirement:** A new in-memory (or DB-backed) `AutoSequence` object per active sequence: `{ node_id, project, steps: string[], current_step: int, session_id: string | null }`. When the server receives `instance_finished` for an instance that belongs to a sequence, it auto-dispatches the next step.

**`/clear` between steps:** GSD's `autonomous` command uses `/clear` internally between phases to reset context. For the server-side auto mode, "clear" means starting a new session (no `session_id`) rather than resuming the prior one — this is the distinction between independent commands vs. continued conversation.

**Complexity:** HIGH — new backend state machine, new frontend sequence builder, and coordination between WS events and dispatch logic.

### Notifications

**Expected behavior:** On first use, prompt user to enable browser notifications (explain why). Store permission state in `localStorage`. When `instance_finished` or `instance_error` arrives via WS, fire `new Notification("Claude finished", { body: "Node X — project Y completed" })`. When AskUserQuestion is detected in stream, fire `new Notification("Action required", { body: "Claude is waiting for your input on Node X" })`. In-dashboard: a badge on the node card or a toast via Sonner (already installed).

**Complexity:** LOW for basic notifications, MEDIUM for in-dashboard badge state management.

---

## Sources

- Anthropic Agent SDK documentation — Handle approvals and user input: https://platform.claude.com/docs/en/agent-sdk/user-input (HIGH confidence — AskUserQuestion format confirmed)
- Anthropic Agent SDK overview: https://platform.claude.com/docs/en/agent-sdk/overview (HIGH confidence — tool list, AskUserQuestion in built-in tools table)
- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference (HIGH confidence — stream-json flag, print mode flags)
- Local GSD installation `~/.claude/get-shit-done/commands/gsd/workstreams.md` — GSD command list (HIGH confidence — direct inspection)
- Local GSD installation `~/.claude/get-shit-done/workflows/autonomous.md` — autonomous mode workflow, AskUserQuestion usage pattern (HIGH confidence — direct inspection)
- Local GSD installation `~/.claude/get-shit-done/workflows/do.md` — command routing table with all `/gsd:*` commands (HIGH confidence — direct inspection)
- GLSD Server `protocol-spec.md` — wire protocol v1.2.0 (HIGH confidence — normative spec)
- GLSD Server `frontend/src/types/ndjson.ts` — existing stream event types (HIGH confidence — direct inspection)
- GLSD Server `frontend/src/components/stream/StreamEventRenderer.tsx` — existing renderer (HIGH confidence — direct inspection)
- Anthropic Claude Code CLI GitHub issues — stream-json and AskUserQuestion interaction patterns (MEDIUM confidence — community discussion)

---
*Feature research for: GLSD Server v1.3 GSD Integration*
*Researched: 2026-03-25*

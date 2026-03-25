# Requirements: GLSD Server

**Defined:** 2026-03-25
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time — the command-and-control plane that makes remote Claude instances usable.

## v1.3 Requirements

Requirements for GSD Integration milestone. Each maps to roadmap phases.

### Project Management

- [ ] **PROJ-01**: User can connect an existing folder on a node as a project
- [ ] **PROJ-02**: User can clone a GitHub repo into a chosen directory on a node
- [ ] **PROJ-03**: User can create a new project folder and bootstrap with /gsd:new-project
- [ ] **PROJ-04**: User can see a list of projects per node with project-scoped command dispatch

### GSD Command Palette

- [ ] **CMD-01**: User can see ~20 GSD commands organized in 4 categories (Project, Phase Lifecycle, Execution, Milestone)
- [ ] **CMD-02**: User can click a command button to dispatch it to the selected node/project
- [ ] **CMD-03**: User can fill parameters for parameterized commands (phase number, task description) via mini-forms before dispatch
- [ ] **CMD-04**: User can see command descriptions and "when to use" guidance in the palette

### Stream Intelligence

- [ ] **STRM-01**: Server detects AskUserQuestion tool_use events in NDJSON stream and classifies them
- [ ] **STRM-02**: Server detects freeform input waits (heuristic: running instance with silence after question)
- [ ] **STRM-03**: Server detects command completion and surfaces instance status changes
- [ ] **STRM-04**: Server enriches forwarded stream events with GSD classification metadata (additive field, not mutating data)

### Interactive Response UI

- [ ] **RESP-01**: User sees AskUserQuestion rendered as clickable option buttons (single-select)
- [ ] **RESP-02**: User sees multi-select questions rendered as checkbox lists
- [ ] **RESP-03**: User can type freeform text responses when input wait is detected
- [ ] **RESP-04**: User's answer is submitted as a session-resume execute dispatch to the node
- [ ] **RESP-05**: Multi-tab prompt claiming prevents duplicate answer submissions

### Notifications

- [ ] **NOTF-01**: User receives browser notification when a node needs input (AskUserQuestion or freeform wait)
- [ ] **NOTF-02**: User receives browser notification when an instance completes or errors
- [ ] **NOTF-03**: User sees in-app toast (Sonner) for completion and input-needed events
- [ ] **NOTF-04**: User can manage notification permissions from the dashboard

### Auto Mode

- [ ] **AUTO-01**: User can enable auto mode for a node with a toggle
- [ ] **AUTO-02**: Server executes GSD commands sequentially with /clear (new session) between steps
- [ ] **AUTO-03**: User can select from default command sequences for common workflows (new-project, milestone cycle)
- [ ] **AUTO-04**: User can build custom command queues (ordered list of GSD commands)
- [ ] **AUTO-05**: User sees per-step progress indicator showing current position in the sequence
- [ ] **AUTO-06**: Auto mode notifies user on step completion when auto mode is off; auto-advances when on

## Future Requirements

### Session Management

- **SESS-01**: User can resume a Claude session from a completed instance
- **SESS-02**: User can view session history across instances

### Cost Tracking

- **COST-01**: User can see cost_usd from result events per instance
- **COST-02**: User can see aggregated cost per project/milestone

### Multi-Workstream

- **WORK-01**: User can see parallel GSD workstreams across nodes
- **WORK-02**: User can manage workstream assignment from dashboard

## Out of Scope

| Feature | Reason |
|---------|--------|
| xterm.js terminal emulation | Claude CLI output is NDJSON, not PTY — structured renderer is richer |
| Node-side file browser | Requires new node API not in v1.2.0 protocol — out of scope |
| Real-time cost budget enforcement | No intra-run cost data in wire protocol — only available at end |
| Persistent auto mode sequences (saved playbooks) | Scope creep — ship session-scoped first, persist in v1.4 if needed |
| Multi-node broadcast execution | Race conditions on shared repos, stream attribution confusion |
| Node-side changes | Server consumes existing node protocol as-is |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROJ-01 | Phase 14 | Pending |
| PROJ-02 | Phase 14 | Pending |
| PROJ-03 | Phase 14 | Pending |
| PROJ-04 | Phase 14 | Pending |
| CMD-01 | Phase 15 | Pending |
| CMD-02 | Phase 15 | Pending |
| CMD-03 | Phase 15 | Pending |
| CMD-04 | Phase 15 | Pending |
| STRM-01 | Phase 15 | Pending |
| STRM-02 | Phase 15 | Pending |
| STRM-03 | Phase 15 | Pending |
| STRM-04 | Phase 15 | Pending |
| RESP-01 | Phase 16 | Pending |
| RESP-02 | Phase 16 | Pending |
| RESP-03 | Phase 16 | Pending |
| RESP-04 | Phase 16 | Pending |
| RESP-05 | Phase 16 | Pending |
| NOTF-01 | Phase 16 | Pending |
| NOTF-02 | Phase 16 | Pending |
| NOTF-03 | Phase 16 | Pending |
| NOTF-04 | Phase 16 | Pending |
| AUTO-01 | Phase 17 | Pending |
| AUTO-02 | Phase 17 | Pending |
| AUTO-03 | Phase 17 | Pending |
| AUTO-04 | Phase 17 | Pending |
| AUTO-05 | Phase 17 | Pending |
| AUTO-06 | Phase 17 | Pending |

**Coverage:**
- v1.3 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 — traceability complete after roadmap creation*

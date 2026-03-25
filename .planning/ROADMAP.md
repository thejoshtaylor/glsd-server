# ROADMAP: GLSD Server

**Project:** GLSD Server
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time
**Granularity:** Coarse
**Created:** 2026-03-20

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-23) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Cyberpunk Beautification** — Phases 8-10 (shipped 2026-03-25) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Ease of Access** — Phases 11-13 (shipped 2026-03-25) — [archive](milestones/v1.2-ROADMAP.md)
- 🔄 **v1.3 GSD Integration** — Phases 14-17 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-23</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-03-21
- [x] Phase 2: Node Protocol Engine (4/4 plans) — completed 2026-03-21
- [x] Phase 3: Auth and Teams (4/4 plans) — completed 2026-03-21
- [x] Phase 4: Dashboard and Streaming (5/5 plans) — completed 2026-03-23
- [x] Phase 5: Voice and Audit (3/3 plans) — completed 2026-03-23
- [x] Phase 6: Frontend Production Deployment (1/1 plan) — completed 2026-03-23
- [x] Phase 7: Audit UI & Dashboard Auth Guard (2/2 plans) — completed 2026-03-23

</details>

<details>
<summary>✅ v1.1 Cyberpunk Beautification (Phases 8-10) — SHIPPED 2026-03-25</summary>

- [x] Phase 8: Color System and Foundation (3/3 plans) — completed 2026-03-24
- [x] Phase 9: Component Upgrades and Icon Pass (3/3 plans) — completed 2026-03-25
- [x] Phase 10: Animations and Login Treatment (2/2 plans) — completed 2026-03-25

</details>

<details>
<summary>✅ v1.2 Ease of Access (Phases 11-13) — SHIPPED 2026-03-25</summary>

- [x] Phase 11: Extended Sessions (2/2 plans) — completed 2026-03-25
- [x] Phase 12: WebSocket Reliability (1/1 plan) — completed 2026-03-25
- [x] Phase 13: UX Surface (2/2 plans) — completed 2026-03-25

</details>

### v1.3 GSD Integration

- [x] **Phase 14: Project Management** — Users can register and manage GSD projects on nodes (completed 2026-03-25)
- [x] **Phase 15: Stream Intelligence and Command Palette** — Server classifies GSD stream events; users dispatch GSD commands from a palette (completed 2026-03-25)
- [ ] **Phase 16: Interactive Response and Notifications** — Users answer GSD questions inline and receive alerts when attention is needed
- [ ] **Phase 17: Auto Mode** — Users run sequential GSD command workflows that advance automatically

## Phase Details

### Phase 14: Project Management
**Goal**: Users can register GSD projects on nodes and dispatch commands scoped to a project
**Depends on**: Phase 13
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Success Criteria** (what must be TRUE):
  1. User can connect an existing folder on a node as a named project and see it in the project list
  2. User can clone a GitHub repo into a target directory on a node and have it registered as a project
  3. User can bootstrap a new project folder by dispatching /gsd:new-project from the project manager
  4. User can select a project from the execute form and commands dispatch with that project's working directory
**Plans**: 2 plans
Plans:
- [x] 14-01-PLAN.md — Backend: Project model, migration, service, schemas, router, dispatch_execute modification
- [x] 14-02-PLAN.md — Frontend: ProjectManager panel, action dialogs, ExecuteForm work_dir resolution
**UI hint**: yes

### Phase 15: Stream Intelligence and Command Palette
**Goal**: Server enriches forwarded stream events with GSD classification; users can dispatch any GSD command from a categorized palette without typing slash commands
**Depends on**: Phase 14
**Requirements**: STRM-01, STRM-02, STRM-03, STRM-04, CMD-01, CMD-02, CMD-03, CMD-04
**Success Criteria** (what must be TRUE):
  1. Forwarded stream events carry a `gsd` classification field (AskUserQuestion, freeform_wait, completed) without altering the existing `data` field shape
  2. User can open a command palette showing ~20 GSD commands organized in four categories (Project, Phase Lifecycle, Execution, Milestone)
  3. User can click any palette command and it dispatches immediately to the selected node and project
  4. User can fill in parameter fields (phase number, task description) for parameterized commands before dispatch
  5. Each palette command shows a description and guidance on when to use it
**Plans**: 2 plans
Plans:
- [x] 15-01-PLAN.md — Backend: Stream event classifier module, handler/manager/replay enrichment with gsd field
- [x] 15-02-PLAN.md — Frontend: Protocol type extension, GSD command registry, CommandPalette component
**UI hint**: yes

### Phase 16: Interactive Response and Notifications
**Goal**: Users can answer GSD questions directly in the stream view and receive browser and in-app alerts when a node needs input or completes work
**Depends on**: Phase 15
**Requirements**: RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, NOTF-01, NOTF-02, NOTF-03, NOTF-04
**Success Criteria** (what must be TRUE):
  1. When a GSD AskUserQuestion is detected, the stream view renders the question with clickable option buttons (single-select) or checkboxes (multi-select) in place of waiting for typed input
  2. When a freeform input wait is detected, the stream view renders a text input field the user can type into and submit
  3. Submitting an answer dispatches it as a session-resuming execute to the node; the interactive prompt clears immediately and does not reappear after instance termination
  4. If two tabs are open, only one can submit an answer — the other sees the prompt disappear on first submission
  5. User receives a browser notification (when tab is unfocused) and an in-app toast (Sonner) when a node needs input or an instance completes or errors
  6. User can grant or deny notification permissions from the dashboard without leaving the page
**Plans**: TBD
**UI hint**: yes

### Phase 17: Auto Mode
**Goal**: Users can run ordered GSD command sequences that advance step-by-step automatically, with progress visible at all times
**Depends on**: Phase 16
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06
**Success Criteria** (what must be TRUE):
  1. User can enable auto mode for a node with a toggle; disabling returns to manual single-command dispatch
  2. With auto mode on, the server executes each step in the sequence, issues /clear between steps, and advances to the next step automatically on completion
  3. User can select a default sequence (new-project, milestone cycle) or build a custom ordered queue of GSD commands
  4. User sees a per-step progress indicator showing which step is active, complete, or pending in the current sequence run
  5. When auto mode is off, the server notifies the user on each step completion and waits for manual advancement; when on, it auto-advances without prompting
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-21 |
| 2. Node Protocol Engine | v1.0 | 4/4 | Complete | 2026-03-21 |
| 3. Auth and Teams | v1.0 | 4/4 | Complete | 2026-03-21 |
| 4. Dashboard and Streaming | v1.0 | 5/5 | Complete | 2026-03-23 |
| 5. Voice and Audit | v1.0 | 3/3 | Complete | 2026-03-23 |
| 6. Frontend Production Deployment | v1.0 | 1/1 | Complete | 2026-03-23 |
| 7. Audit UI & Dashboard Auth Guard | v1.0 | 2/2 | Complete | 2026-03-23 |
| 8. Color System and Foundation | v1.1 | 3/3 | Complete | 2026-03-24 |
| 9. Component Upgrades and Icon Pass | v1.1 | 3/3 | Complete | 2026-03-25 |
| 10. Animations and Login Treatment | v1.1 | 2/2 | Complete | 2026-03-25 |
| 11. Extended Sessions | v1.2 | 2/2 | Complete | 2026-03-25 |
| 12. WebSocket Reliability | v1.2 | 1/1 | Complete | 2026-03-25 |
| 13. UX Surface | v1.2 | 2/2 | Complete | 2026-03-25 |
| 14. Project Management | v1.3 | 2/2 | Complete    | 2026-03-25 |
| 15. Stream Intelligence and Command Palette | v1.3 | 2/2 | Complete    | 2026-03-25 |
| 16. Interactive Response and Notifications | v1.3 | 0/? | Not started | — |
| 17. Auto Mode | v1.3 | 0/? | Not started | — |

---
*Roadmap created: 2026-03-20*
*Last updated: 2026-03-25 — Phase 15 planned (2 plans)*

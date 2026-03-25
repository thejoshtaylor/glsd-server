# Project Research Summary

**Project:** GLSD Server v1.3 GSD Integration
**Domain:** GSD-aware Claude CLI control plane — stream intelligence, interactive question UI, project management, auto mode, notifications
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

GLSD Server v1.3 transforms an already-working v1.2 Claude CLI relay into a GSD-aware control plane. The base stack (FastAPI, SQLAlchemy, React 19, TanStack Router/Query, Zustand, shadcn/ui) is locked and requires zero new dependencies — all v1.3 features are implemented by adding new modules, extending existing types, and writing one Alembic migration. The central technical discovery is that the existing `handle_stream_event` pipeline in `ws/handlers.py` already parses NDJSON via `json.loads(payload.data)`, making stream intelligence entirely a dict-inspection problem on the already-decoded `parsed_data`. No new parsing infrastructure is required.

The recommended approach is to add a pure synchronous classifier (`stream_intelligence.py`) called inline in `handle_stream_event` after parsing, a server-side asyncio sequencer for auto mode, and four new WebSocket message types for frontend-to-server communication. Interactive question responses are dispatched as session-resuming execute commands via the existing protocol — no node-side changes are needed. The node-to-server wire protocol v1.2.0 remains entirely unchanged for this milestone. All enrichment and new message types live exclusively in the frontend-to-server channel.

The primary risks are: (1) silently breaking the frontend stream renderer by changing the shape of the forwarded `data` field when adding GSD classification, which TypeScript will not catch at runtime; (2) false-positive input-wait detection if only heuristic scanning is used instead of the reliable `AskUserQuestion` tool-use signal; and (3) auto mode state machine isolation failures when two users target the same node simultaneously. All three risks have clear prevention strategies that must be built into the initial implementation — they are not safe to defer as hardening steps.

---

## Key Findings

### Recommended Stack

No new packages are required. The entire v1.3 milestone is built on the existing installed stack. The only required infrastructure change is a single Alembic migration creating three new tables (`projects`, `auto_sequences`, `auto_sequence_runs`). All Claude CLI NDJSON event types (`system`, `assistant`, `user`, `result`) are confirmed against official Agent SDK documentation with HIGH confidence. The `AskUserQuestion` detection pattern — inspecting `assistant` message content blocks for `tool_use` blocks where `name == "AskUserQuestion"` — is verified against the official Agent SDK user-input docs.

**Core technologies (existing, confirmed compatible):**
- `FastAPI + SQLAlchemy[asyncio]`: New routers and models follow identical patterns to existing code — no migration risk
- `asyncio` (stdlib): Auto mode sequencer uses `asyncio.Event` per instance_id — zero-polling, event-driven step advancement
- `sonner v2.0.7` (already installed): In-app toast notifications; no new toast library needed
- `Browser Notification API` (native, zero dep): Tab-unfocused notifications; Web Push / service worker explicitly not needed
- `@base-ui/react` Dialog, Checkbox, RadioGroup (already scaffolded): Interactive question UI components are all available

**Explicitly excluded:**
- xterm.js, socket.io, @anthropic-ai/claude-agent-sdk (server-side), Web Push API, Celery, Redis — all rejected with clear rationale in STACK.md

### Expected Features

**Must have (table stakes) — v1.3 launch:**
- GSD command palette (~20 buttons in 4 categories) — without this, users type every slash command manually
- AskUserQuestion detection + interactive button/checkbox UI — without this, GSD autonomous mode blocks indefinitely
- Completion and input-needed browser notifications — users cannot watch tabs indefinitely for long-running tasks
- Session resume from instance list — GSD workflows span multiple sessions; continuity is a core primitive
- Project management commands (new project, connect folder, clone GitHub repo)

**Should have — add after P1 features are stable (v1.x):**
- Auto mode sequential execution — high value, high complexity; defer until base GSD integration is solid
- Freeform input wait detection — lower confidence heuristic; add after empirical testing against real GSD workflow runs
- Auto mode sequence persistence — session-scoped first, DB-persisted if user demand justifies it

**Defer (v2+):**
- Multi-workstream tracking across nodes
- Cost tracking dashboard (requires aggregate storage beyond ephemeral stream buffer)

### Architecture Approach

The v1.3 architecture is additive by design: the hot path (`handle_stream_event` → DB persist → in-memory buffer → frontend fan-out) is unchanged. Stream intelligence inserts a single synchronous classify call between parsing and the existing pipeline. All new server-side state lives in new modules (`stream_intelligence.py`, `auto_sequencer.py`) rather than embedded in the existing handler. Four new frontend-to-server WebSocket message types (`input_request`, `notification`, `sequence_status`, `node_input`) cover all new communication needs. The node-to-server protocol is frozen at v1.2.0 for this milestone.

**Major components:**

1. `ws/stream_intelligence.py` — pure synchronous classifier; detects `AskUserQuestion`, completion events; no I/O, no await; unit-testable in isolation
2. `ws/auto_sequencer.py` — asyncio background task per sequence run; step advancement via `asyncio.Event` keyed on `instance_id`; keyed on `(node_id, sequence_id)` for multi-user isolation
3. `ws/frontend_manager.py` (modified) — two new broadcast methods: `broadcast_input_request()` and `broadcast_notification()`
4. `ws/frontend_router.py` (modified) — new `node_input` message handler; looks up instance, dispatches as session-resuming execute
5. `models/project.py` + `models/auto_sequence.py` — server-managed project registry and sequence state, independent of the `node.projects` JSON array
6. Frontend: `CommandPalette.tsx`, `InteractiveResponseUI.tsx`, `AutoModePanel.tsx`, `NotificationBadge.tsx`, `ProjectManager.tsx`

**Build order dependency chain:** DB models → classifier (parallel with project router and CommandPalette) → modified handler + WS types → interactive UI + sequencer (parallel) → node_input router + sequences router (parallel) → AutoModePanel → ProjectManager → NotificationBadge.

### Critical Pitfalls

1. **Forwarded `stream_event` shape change breaks frontend silently** — When adding GSD classification, add enrichment as a new sibling `gsd` field to the WS message; never mutate the existing `data` field. TypeScript's `as NdjsonEvent` cast will not catch runtime shape mismatches. Agree on the enriched message contract before writing any classification code.

2. **Input-wait detection false positives from heuristic-only approach** — Use two signals: (a) `AskUserQuestion` tool-use in stream = definitive; (b) no new `assistant` events for 3+ seconds after a question-ending turn = heuristic. Render interactive UI only on signal (a) for v1.3. Never fire notification on heuristic match alone.

3. **Auto mode state machine cross-user collision** — Key all sequence registry entries on `(node_id, sequence_id)`, not `node_id` alone. Use `asyncio.Event` per `instance_id` (not per node). Cancel all sequences for a node when `handle_unexpected_disconnect` fires; broadcast `sequence_error` to affected users.

4. **Stale interactive prompt after instance termination** — The `InteractiveResponseUI` component must subscribe to `instanceStatuses[instanceId]` in wsStore and render `null` when the instance reaches a terminal state. Implement this in the same PR as the prompt component — do not ship without it.

5. **Multi-tab duplicate response submission** — When `node_input` is received, broadcast a `prompt_answered` message to all of the user's connections before forwarding to the node. Each tab's interactive UI hides itself on receipt. Button must be disabled immediately on click (optimistic lock) regardless.

6. **`work_dir` path traversal via project management form** — Validate all user-supplied paths: reject any path containing `..` after `os.path.normpath`; resolve paths from registered project roots in the DB, not from free-text input.

---

## Implications for Roadmap

Based on the build-order dependency chain in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md, the following phase structure is recommended. Phases 2a/2b/2c can be parallelized; 4a/4b can be parallelized; 5a/5b can be parallelized.

### Phase 1: DB Foundation + Migration

**Rationale:** Everything else depends on the `projects`, `auto_sequences`, and `auto_sequence_runs` tables. This is a zero-risk phase — new tables only, no existing model changes. Must also resolve the existing tech debt of stream events not being persisted to DB (required for interactive history replay and auto mode step review).

**Delivers:** Three new SQLAlchemy models, one Alembic migration, stream event DB persistence enabled.

**Addresses:** Stream event persistence tech debt (PITFALLS.md Pitfall 5); foundational requirement for project management and auto mode phases.

**Avoids:** Starting feature phases before the data layer is stable.

### Phase 2: Stream Intelligence + GSD Command Palette

**Rationale:** Stream intelligence is the critical path for all interactive features. The classifier must exist before the handler can be modified. The command palette has zero new dependencies and can ship immediately as a pure UI addition. Can parallelize: classifier backend (2a), project router scaffolding (2b), command palette frontend (2c).

**Delivers:** `stream_intelligence.py` classifier; `handle_stream_event` hook; new WS message types in `frontend_manager.py`; `CommandPalette.tsx` with ~20 GSD commands; extended `protocol.ts` and `ndjson.ts` types.

**Addresses:** GSD command palette (FEATURES.md P1); stream enrichment without shape change (PITFALLS.md Pitfall 1); two-signal input-wait detection design (PITFALLS.md Pitfall 2).

**Avoids:** Adding I/O inside the classifier; mutating the forwarded `data` field shape.

**Research flag:** The exact NDJSON system event subtype for freeform input wait is unconfirmed — needs empirical testing against real Claude CLI output before implementing the heuristic branch.

### Phase 3: Interactive Question UI + Notifications

**Rationale:** Depends on Phase 2 WS message types and broadcast infrastructure. `input_request` and `notification` broadcast methods must exist before `InteractiveResponseUI` and `NotificationBadge` can be built.

**Delivers:** `InteractiveResponseUI.tsx` (buttons/checkbox/text rendering of `AskUserQuestion`); `frontend_router.py` `node_input` handler; session-resume execute dispatch; `NotificationBadge.tsx`; browser Notification API integration; Sonner toast integration for in-app alerts.

**Addresses:** AskUserQuestion detection + interactive UI (FEATURES.md P1); completion and input-needed notifications (FEATURES.md P1); stale prompt cleanup (PITFALLS.md Pitfall 6); multi-tab duplicate response (PITFALLS.md Pitfall 8); notification team scoping (PITFALLS.md security section).

**Avoids:** Shipping the prompt component without status-aware teardown; dispatching notifications to wrong team members.

### Phase 4: Session Resume + Project Management

**Rationale:** Session resume is a small, self-contained P1 feature (pre-fill `session_id` on instance row). Project management requires Phase 1 DB tables and can be built in parallel with Phase 3 interactive UI work. Both are independent of auto mode.

**Delivers:** "Resume Session" button on instance rows; `ProjectManager.tsx`; `routers/projects.py` CRUD; project picker resolving to registered DB paths (not free-text).

**Addresses:** Session resume (FEATURES.md P1); project management commands (FEATURES.md P1); `work_dir` path traversal prevention (PITFALLS.md Pitfall 7).

**Avoids:** Accepting free-text path input; skipping path normalization on `work_dir`.

### Phase 5: Auto Mode Sequential Execution

**Rationale:** Highest complexity feature; deferred until P1 features are stable. Requires Phase 1 models (AutoSequence, AutoSequenceRun), Phase 3 notification infrastructure, and Phase 4 session resume. The sequencer is server-side only — never on the frontend.

**Delivers:** `auto_sequencer.py`; `routers/sequences.py`; `AutoModePanel.tsx`; per-sequence asyncio task with `asyncio.Event` step advancement; node disconnect sequence cancellation; orphan recovery on server restart.

**Addresses:** Auto mode sequential execution (FEATURES.md P2); sequence isolation (PITFALLS.md Pitfall 4); auto mode + node disconnect (PITFALLS.md integration gotcha).

**Avoids:** Frontend-side sequencer; polling with `asyncio.sleep`; keying sequence registry on `node_id` alone.

**Research flag:** Verify `asyncio.Event` dict cleanup on sequence cancellation does not leak memory for long-running servers. Also verify two-user simultaneous sequence isolation empirically before declaring the phase complete.

### Phase Ordering Rationale

- Phases 1 → 2 → 3 are strictly ordered by dependency (models, then classifier, then UI that uses classifier output).
- Phase 4 (project management) is independent of Phases 3 and 5 but requires Phase 1 models; can start in parallel with Phase 3 once Phase 1 is complete.
- Phase 5 (auto mode) is explicitly deferred to after P1 features are stable, as recommended in FEATURES.md.
- The architecture's "additive only" pattern (new sibling fields, new modules, no hot-path modifications) is the organizing principle throughout — each phase adds without changing existing behavior.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Stream Intelligence):** Freeform input wait — the exact NDJSON `system` event subtype for text-input wait is not confirmed in official docs (MEDIUM confidence only). Run a real GSD discuss-phase and capture raw NDJSON output before implementing this branch.
- **Phase 5 (Auto Mode):** `asyncio.Event` registry memory management under long-running server conditions is not stress-tested. Verify cleanup paths are correct before shipping.

Phases with standard patterns (skip research-phase):
- **Phase 1 (DB Foundation):** Standard SQLAlchemy model + Alembic migration — well-documented, identical to existing models.
- **Phase 3 (Notifications):** Browser Notification API + Sonner — both well-documented; no novel patterns.
- **Phase 4 (Project Management):** Standard FastAPI CRUD + path validation — no novel patterns; path normalization is stdlib `os.path`.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified against existing `package.json` and `requirements.txt`; no new deps needed; NDJSON schema confirmed against official Agent SDK docs and Go SDK source |
| Features | HIGH | GSD command set inspected from local `~/.claude/get-shit-done/` installation; AskUserQuestion format confirmed from official Anthropic Agent SDK docs; auto mode design inferred from workflow files (MEDIUM for sequencing details) |
| Architecture | HIGH | Based on direct codebase analysis of all relevant backend and frontend files; build order validated against actual dependency graph |
| Pitfalls | HIGH | Code-grounded; derived directly from existing codebase architecture and specific integration surface; protocol constraints confirmed from `protocol-spec.md` |

**Overall confidence:** HIGH

### Gaps to Address

- **Freeform input wait NDJSON signal:** The exact `system` event subtype for text-input blocking is not confirmed in official docs. Resolve empirically by running a GSD discuss-phase and capturing raw stream output before implementing this detection branch. Do not ship the heuristic without this data.
- **AskUserQuestion response via session resume:** The v1.3 approach dispatches a new execute with `session_id` as the answer delivery mechanism (Path A). The exact prompt format that Claude accepts as a satisfactory answer to an in-flight `AskUserQuestion` needs empirical validation. Test against a real GSD workflow before finalizing the response dispatch format.
- **Stream event persistence tech debt:** PITFALLS.md and FEATURES.md both flag that stream events are currently not persisted to DB. This must be resolved in Phase 1, not deferred, because interactive history replay and auto mode step review both depend on it.
- **True stdin relay (v1.4):** True stdin injection into a running Claude CLI process requires node-side changes (new protocol message type). Explicitly deferred to v1.4. Protocol v1.3.0 design should be tracked as a future milestone dependency.

---

## Sources

### Primary (HIGH confidence)

- Official Agent SDK user-input docs — AskUserQuestion schema and response format: https://platform.claude.com/docs/en/agent-sdk/user-input
- Official Agent SDK TypeScript reference — SDKMessage union types: https://platform.claude.com/docs/en/agent-sdk/typescript
- Official Agent SDK streaming docs — StreamEvent, message flow: https://platform.claude.com/docs/en/agent-sdk/streaming-output
- Official Claude CLI reference — `--output-format stream-json` flag: https://code.claude.com/docs/en/cli-reference
- Local GSD installation — command catalog, autonomous workflow, do.md routing table: `~/.claude/get-shit-done/`
- Existing codebase (v1.2 baseline): `backend/app/ws/handlers.py`, `backend/app/ws/frontend_manager.py`, `backend/app/ws/frontend_router.py`, `backend/app/ws/commands.py`, `backend/app/ws/manager.py`, `backend/app/ws/protocol.py`, `backend/app/models/`, `frontend/src/stores/wsStore.ts`, `frontend/src/types/protocol.ts`, `frontend/src/types/ndjson.ts`, `frontend/src/components/stream/StreamEventRenderer.tsx`
- Protocol spec: `protocol-spec.md` v1.2.0 — 10 message types, no stdin support confirmed
- Project context: `.planning/PROJECT.md` — out-of-scope constraints confirmed

### Secondary (MEDIUM confidence)

- Go SDK source — message type structs confirming NDJSON schema: https://pkg.go.dev/github.com/partio-io/claude-agent-sdk-go
- GitHub issue #16712 — `tool_result` stdin injection constraint, `is_error` requirement: https://github.com/anthropics/claude-code/issues/16712
- GitHub issue #24596 — stream-json event type documentation gaps: https://github.com/anthropics/claude-code/issues/24596

---

*Research completed: 2026-03-25*
*Ready for roadmap: yes*

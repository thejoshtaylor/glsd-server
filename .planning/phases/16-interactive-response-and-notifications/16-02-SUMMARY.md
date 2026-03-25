---
phase: 16-interactive-response-and-notifications
plan: "02"
subsystem: frontend-interactive-response
tags: [interactive-ui, zustand, websocket, AskUserQuestion, multi-select, freeform, prompt-claiming]
dependency_graph:
  requires: [16-01, 16-03]
  provides: [interactive-response-ui, stream-panel-prompt-mount]
  affects:
    - frontend/src/components/stream/InteractiveResponseUI.tsx
    - frontend/src/components/stream/StreamPanel.tsx
    - frontend/src/lib/icons.ts
    - frontend/src/stores/wsStore.ts
    - frontend/src/types/protocol.ts
tech_stack:
  added: []
  patterns: [zustand-selector, ws-send-json, rest-fetch-session-id, css-only-animation]
key_files:
  created:
    - frontend/src/components/stream/InteractiveResponseUI.tsx
  modified:
    - frontend/src/components/stream/StreamPanel.tsx
    - frontend/src/lib/icons.ts
    - frontend/src/stores/wsStore.ts
    - frontend/src/types/protocol.ts
decisions:
  - "Single-select click triggers submit immediately (no extra Submit button) — consistent UX, one click per option"
  - "Multi-select requires explicit Submit button — user may want to select multiple before committing"
  - "claim_prompt dispatched before fetching session_id (optimistic) — avoids REST round-trip before claiming"
  - "isRunning guard in StreamPanel wraps component mount — redundant with internal nil-guard but prevents unnecessary mount cycles"
metrics:
  duration: 420s
  completed: "2026-03-25"
  tasks: 2
  files: 5
requirements: [RESP-01, RESP-02, RESP-03]
---

# Phase 16 Plan 02: Interactive Response UI Summary

InteractiveResponseUI component wired to wsStore promptStates and WS claim/submit protocol, rendering AskUserQuestion as single-select buttons or checkbox list, and freeform_wait as a textarea.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create InteractiveResponseUI component | 1c94ce7 | frontend/src/components/stream/InteractiveResponseUI.tsx, frontend/src/lib/icons.ts, frontend/src/stores/wsStore.ts, frontend/src/types/protocol.ts |
| 2 | Mount InteractiveResponseUI in StreamPanel | 3f23285 | frontend/src/components/stream/StreamPanel.tsx |

## What Was Built

### Task 1: InteractiveResponseUI component

`InteractiveResponseUI.tsx` (~190 lines):

**Nil-guards (in order):**
1. `instanceStatus` missing or terminal (`finished`/`errored`) → return null
2. `promptState === 'answered'` → return null
3. `!promptState` (no pending prompt) → return null

**Three render modes:**
- **Mode A (RESP-01):** `AskUserQuestion` with `multiSelect=false` — each option renders as a button; clicking selects AND immediately submits (single gesture, no second Submit button)
- **Mode B (RESP-02):** `AskUserQuestion` with `multiSelect=true` — options render as toggleable cards with Check icon for selected state; explicit Submit button required
- **Mode C (RESP-03):** `freeform_wait` — renders when `promptState === 'pending'` and no AskUserQuestion event found; shows textarea + Submit button

**Submit flow:**
1. `claim_prompt` sent via WS (server broadcasts `prompt_claimed`)
2. `GET /api/instances/:id` fetched to retrieve `session_id`
3. `submit_answer` sent via WS with `session_id`, `instance_id`, and formatted prompt text

**Multi-tab state:** `claimed_by_other` disables all controls with "Another tab is responding to this prompt" message.

**Styling:** Cyberpunk-consistent — `bg-card/30`, `border-primary/50 hover`, `animate-in fade-in duration-200` wrapper. No motion library — tw-animate-css only (STATE.md constraint honored).

**Icons added to icons.ts:** `MessageCircleQuestion`, `Send`, `Check`

**Prerequisite changes applied:** This worktree was based on `origin/main` which did not include the 16-01/16-03 protocol and store changes. These were applied as part of Task 1:
- `protocol.ts`: `GsdClassification` type, `gsd` field on `stream_event`, `prompt_claimed`/`prompt_answered` incoming types, `claim_prompt`/`submit_answer` outgoing types
- `wsStore.ts`: `promptStates` slice, `setPromptState`/`clearPromptState`, toast/notification triggers, `prompt_claimed`/`prompt_answered` switch cases

### Task 2: StreamPanel mount

`StreamPanel.tsx` updated:
- Import `InteractiveResponseUI` from `./InteractiveResponseUI`
- Mount `<InteractiveResponseUI instanceId={instanceId} nodeId={nodeId} />` below the events scroll area, wrapped in `{isRunning && ...}` guard

## Deviations from Plan

### Auto-applied from 16-01 and 16-03

The worktree was based on `origin/main` which did not include the 16-01 and 16-03 changes. These were prerequisites for the `promptStates` selectors used by `InteractiveResponseUI`. Applied as part of Task 1 commit (same deviation noted in 16-03 SUMMARY).

Files affected: `frontend/src/types/protocol.ts`, `frontend/src/stores/wsStore.ts`

## Known Stubs

The `freeform_wait` Mode C render path is wired but will not activate until the backend classifier enables the `freeform_wait` classification (stubbed with `if False:` per 16-01 SUMMARY). The UI code is correct and ready — it will render as soon as the backend stub is enabled.

## Self-Check: PASSED

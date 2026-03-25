---
phase: 16-interactive-response-and-notifications
plan: "01"
subsystem: backend-ws, frontend-store
tags: [websocket, prompt-claiming, multi-tab, zustand, protocol-types]
dependency_graph:
  requires: []
  provides: [prompt-claiming-backend, prompt-state-store]
  affects: [frontend/src/stores/wsStore.ts, frontend/src/types/protocol.ts, backend/app/ws/frontend_manager.py, backend/app/ws/frontend_router.py]
tech_stack:
  added: []
  patterns: [asyncio-queue-fan-out, zustand-state-slice, ws-message-union-extension]
key_files:
  created: []
  modified:
    - backend/app/ws/frontend_manager.py
    - backend/app/ws/frontend_router.py
    - frontend/src/types/protocol.ts
    - frontend/src/stores/wsStore.ts
decisions:
  - "claim_prompt is synchronous (dict ops only) — no async overhead on hot path"
  - "broadcast_prompt_answered fans out to ALL connections (not just subscribers) — every tab must see the answered state"
  - "broadcast_prompt_answered releases claim atomically within the method — no separate release call needed after"
  - "GsdClassification type added to protocol.ts alongside stream_event gsd field — enables type-safe prompt detection in wsStore"
metrics:
  duration: 185s
  completed: "2026-03-25"
  tasks: 2
  files: 4
requirements: [RESP-04, RESP-05]
---

# Phase 16 Plan 01: Backend Prompt Claiming Protocol and Frontend State Infrastructure Summary

Backend claim/answer dispatch with multi-tab exclusive-submit enforcement, extended WS protocol union types, and Zustand promptStates slice for pending/claimed/answered tracking.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Backend prompt claiming and answer submission | 4ca8b98 | backend/app/ws/frontend_manager.py, backend/app/ws/frontend_router.py |
| 2 | Extend WS protocol types and wsStore with prompt state management | 0477c8f | frontend/src/types/protocol.ts, frontend/src/stores/wsStore.ts |

## What Was Built

### Task 1: Backend claiming mechanism

`FrontendConnectionManager` now tracks an in-memory `_prompt_claims` dict (instance_id → (user_id, conn)).

New methods:
- `claim_prompt(instance_id, conn) -> bool` — synchronous; returns False if already claimed
- `get_prompt_claim(instance_id) -> tuple | None` — read-only access for submit validation
- `release_prompt(instance_id)` — removes claim entry
- `broadcast_prompt_answered(instance_id)` — fans out `prompt_answered` to ALL connections then releases claim
- `broadcast_prompt_claimed(instance_id, claimer_conn)` — claimer gets `is_mine: True`, all others get `is_mine: False`

`deregister` was extended to release any claims held by a disconnecting connection, preventing ghost claims when a tab closes.

`frontend_router.py` now handles two new message types:
- `claim_prompt` — calls `claim_prompt()`, broadcasts claimed or sends rejection to requester only
- `submit_answer` — validates claim ownership, broadcasts `prompt_answered` BEFORE dispatching to node (STATE.md locked ordering), fetches instance from DB, calls `dispatch_execute` with `session_id` for session resume

### Task 2: Frontend protocol types and wsStore

`protocol.ts` now exports `GsdClassification = 'AskUserQuestion' | 'freeform_wait' | 'completed' | null` and adds it to the `stream_event` incoming type. Two incoming types added (`prompt_claimed`, `prompt_answered`) and two outgoing types added (`claim_prompt`, `submit_answer`).

`wsStore.ts` extended with:
- `promptStates: Record<string, 'pending' | 'claimed_by_me' | 'claimed_by_other' | 'answered'>` — per-instance state
- `setPromptState` / `clearPromptState` actions
- `handleMessage` now sets `pending` on `AskUserQuestion`/`freeform_wait` stream events (only if not already claimed/answered to avoid clobbering), clears on instance termination, and handles `prompt_claimed`/`prompt_answered` messages

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None in this plan. The `freeform_wait` classification is stubbed in the backend classifier (`if False:` gate in classifier.py) but the frontend code correctly handles the `gsd === 'freeform_wait'` case — it will activate when the classifier stub is enabled.

## Self-Check: PASSED

All 4 modified files confirmed on disk. Both task commits (4ca8b98, 0477c8f) confirmed in git log.

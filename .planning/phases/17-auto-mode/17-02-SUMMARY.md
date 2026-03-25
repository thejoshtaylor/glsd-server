---
phase: 17-auto-mode
plan: "02"
subsystem: frontend
tags: [websocket, protocol, zustand, auto-mode, sequence]
dependency_graph:
  requires: [17-01]
  provides: [sequence-types, sequence-store, sequence-presets]
  affects: [frontend/src/types/protocol.ts, frontend/src/stores/wsStore.ts, frontend/src/lib/gsdCommands.ts]
tech_stack:
  added: []
  patterns: [discriminated-union-extension, zustand-slice, sequence-state-machine]
key_files:
  created: []
  modified:
    - frontend/src/types/protocol.ts
    - frontend/src/stores/wsStore.ts
    - frontend/src/lib/gsdCommands.ts
decisions:
  - "auto_advance field read from server WS messages, never hardcoded — enables correct paused state for manual-advance UI path"
  - "autoModeNodeIds stored as array not Set for Zustand serialization compatibility"
  - "sequence_started case is a no-op ACK — store populated on first step_started to avoid empty state"
metrics:
  duration: ~5min
  completed: 2026-03-25T10:49:35Z
  tasks_completed: 2
  files_modified: 3
---

# Phase 17 Plan 02: Auto Mode Protocol Types and Store Summary

Sequence WS message types, sequence state tracking in Zustand, and preset sequence definitions for new-project and milestone-cycle workflows — foundation layer for the auto mode UI in Plan 03.

## Tasks Completed

### Task 1: Extend protocol types and GSD command presets
- Added 5 union members to `WsIncomingMessage`: `sequence_started`, `sequence_step_started`, `sequence_step_completed`, `sequence_done`, `sequence_error`
- Both step messages include `auto_advance: boolean` field so wsStore can derive paused state without guessing
- Added 3 union members to `WsOutgoingMessage`: `start_sequence`, `cancel_sequence`, `advance_sequence`
- Exported `GsdSequencePreset` interface and `GSD_SEQUENCE_PRESETS` array with 2 presets:
  - `new-project` (3 steps: new-project, define-requirements, create-roadmap)
  - `milestone-cycle` (4 steps: discuss-phase, plan-phase, execute-phase, verify-phase)
- **Commit:** fe9b507

### Task 2: Extend wsStore with sequence state management
- Added `SequenceState` interface with all required fields including `auto_advance` and optional `error_reason`
- Extended `WsStore` interface with `sequenceStates: Record<string, SequenceState>` and `autoModeNodeIds: string[]`
- Added `toggleAutoMode` action (array-based, not Set, for Zustand serialization)
- Added `clearSequenceState` action for cleanup via destructuring
- Extended `handleMessage` switch with 5 sequence cases:
  - `sequence_started`: no-op ACK (store populated on first step)
  - `sequence_step_started`: upserts state, sets `status: 'running'`, reads `auto_advance` from message
  - `sequence_step_completed`: derives `status: 'running' | 'paused'` from `msg.auto_advance`
  - `sequence_done`: sets `status: 'done'`, fires `toast.success`
  - `sequence_error`: sets `status: 'error'`, stores `error_reason`, fires `toast.error`
- **Commit:** 8953762

## Verification Results

- `npx tsc --noEmit` passes with no errors
- 5 sequence message types in `protocol.ts` (sequence_started, step_started, step_completed, done, error)
- `auto_advance: boolean` in both step_started and step_completed types AND start_sequence outgoing (3 occurrences)
- `msg.auto_advance` read in both step_started and step_completed handlers
- All 3 new WsStore fields present: `sequenceStates`, `autoModeNodeIds`, `toggleAutoMode`
- `GSD_SEQUENCE_PRESETS` exported from gsdCommands.ts

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - this plan adds pure type/state layer; no UI rendering involved.

## Self-Check: PASSED

Files exist:
- frontend/src/types/protocol.ts: FOUND (contains sequence_step_started)
- frontend/src/stores/wsStore.ts: FOUND (contains sequenceStates)
- frontend/src/lib/gsdCommands.ts: FOUND (contains GSD_SEQUENCE_PRESETS)

Commits exist:
- fe9b507: feat(17-auto-mode-02): extend protocol types and add sequence presets
- 8953762: feat(17-auto-mode-02): extend wsStore with sequence state management

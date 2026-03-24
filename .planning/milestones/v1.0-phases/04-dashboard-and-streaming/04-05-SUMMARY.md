---
phase: 04-dashboard-and-streaming
plan: 05
subsystem: frontend
tags: [history-panel, alerts, stale-warning, session-resume, error-display, websocket]
dependency_graph:
  requires: [04-04]
  provides: [history-stream-panel, new-node-alerts, stale-warning, session-resume, error-display]
  affects: [frontend/src/routes/dashboard/$nodeId.tsx, frontend/src/routes/dashboard/index.tsx, frontend/src/stores/wsStore.ts]
tech_stack:
  added: []
  patterns: [rest-fetched-history, zustand-alert-state, dismissible-banner, conditional-panel-switching]
key_files:
  created:
    - frontend/src/components/stream/HistoryStreamPanel.tsx
    - frontend/src/components/alerts/NewNodeAlert.tsx
    - frontend/src/components/alerts/StaleWarning.tsx
  modified:
    - frontend/src/components/nodes/InstanceList.tsx
    - frontend/src/components/execute/ExecuteForm.tsx
    - frontend/src/stores/wsStore.ts
    - frontend/src/routes/dashboard/$nodeId.tsx
    - frontend/src/routes/dashboard/index.tsx
decisions:
  - "HistoryStreamPanel uses useQuery (TanStack Query) to fetch persisted stream events from REST; distinct from StreamPanel which reads live Zustand buffers"
  - "Panel switching logic: isLiveInstance = status is running|pending shows StreamPanel; finished|errored shows HistoryStreamPanel"
  - "newNodeAlerts stored as string[] in Zustand; dismissed per-node via filter; no auto-expiry in v1"
  - "defaultSessionId prop on ExecuteForm uses useEffect to sync when value changes, avoiding controlled/uncontrolled input conflict"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-23"
  tasks_completed: 3
  files_created: 3
  files_modified: 5
---

# Phase 04 Plan 05: History, Alerts, and Stale Warnings Summary

**One-liner:** REST-fetched history panel with session resume, dismissible new-node alerts, stale warning banners, and inline error display completing all DASH requirements.

## What Was Built

Three tasks completed (Task 3 auto-approved per auto_advance config). All acceptance criteria met.

### Task 1: History stream panel + error display + session resume wiring

- Created `HistoryStreamPanel.tsx`: fetches `GET /api/instances/{id}/stream` via TanStack Query's `useQuery`, renders each `StreamEventResponse.data` as `NdjsonEvent` using the existing `StreamEventRenderer`. Shows loading/error/empty states.
- Updated `InstanceList.tsx`:
  - Added `onResumeSession?: (sessionId: string) => void` prop
  - Added `inst.error` display in red text (`text-red-400`) below instance metadata for errored instances
  - Added "Resume" button (ghost variant, blue text) for `finished` or `errored` instances with a `session_id` — calls `onResumeSession(inst.session_id)` with `e.stopPropagation()` to prevent row click
  - Restructured row layout to two-row grid with badge + resume button grouped on the right
- Updated `ExecuteForm.tsx`: added `defaultSessionId?: string` prop with a `useEffect` that calls `setSessionId(defaultSessionId)` when the value changes — enables session resume pre-population
- Updated `$nodeId.tsx`:
  - Added `resumeSessionId` state, passed as `defaultSessionId` to `ExecuteForm`
  - Added `onResumeSession={setResumeSessionId}` to `InstanceList`
  - Added conditional panel rendering: `isLiveInstance` (running|pending) shows `StreamPanel`; finished|errored shows `HistoryStreamPanel`
  - Pre-imported `StaleWarning` for Task 2 (committed together)

### Task 2: New node alerts + stale warnings + WS store alert handling

- Updated `wsStore.ts`:
  - Added `newNodeAlerts: string[]` field initialized to `[]`
  - Added `dismissAlert: (nodeId: string) => void` action that filters the array
  - Added `new_node_alert` case in `handleMessage` that invalidates `['nodes']` query and pushes `msg.node_id` to `newNodeAlerts`
- Created `NewNodeAlert.tsx`: renders a dismissible blue banner per alert in `newNodeAlerts`. Uses `AlertTriangle` icon (lucide-react), X dismiss button, blue color scheme (`bg-blue-900/30`, `border-blue-700/50`, `text-blue-300`).
- Created `StaleWarning.tsx`: renders a yellow warning banner with "over 90 seconds" text. Uses `AlertTriangle` icon, yellow color scheme (`bg-yellow-900/30`, `border-yellow-700/50`, `text-yellow-300`).
- Updated `dashboard/index.tsx`: renders `<NewNodeAlerts />` above the page heading and `NodeGrid`.
- Confirmed `$nodeId.tsx` renders `{node.status === 'stale' && <StaleWarning nodeId={node.node_id} />}` after the node header.

### Task 3: Visual verification checkpoint

Auto-approved per `auto_advance: true` config. Backend and frontend are ready for manual end-to-end verification.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data flows are wired:
- `HistoryStreamPanel` fetches real data from `/api/instances/{id}/stream`
- `NewNodeAlerts` reads from live Zustand state populated by WS messages
- `StaleWarning` conditional on real node status from API

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| frontend/src/components/stream/HistoryStreamPanel.tsx | FOUND |
| frontend/src/components/alerts/NewNodeAlert.tsx | FOUND |
| frontend/src/components/alerts/StaleWarning.tsx | FOUND |
| Task 1 commit 7cf252b | FOUND |
| Task 2 commit 008f140 | FOUND |
| vite build succeeds | PASSED |

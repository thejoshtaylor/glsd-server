---
phase: 04-dashboard-and-streaming
plan: 04
subsystem: frontend
tags: [execute-form, stream-panel, websocket, ndjson, resizable, ux]
dependency_graph:
  requires: [04-03]
  provides: [execute-form, kill-button, stream-panel, ndjson-renderers, auto-scroll, resizable-layout]
  affects: [frontend/src/routes/dashboard/$nodeId.tsx, frontend/src/stores/wsStore.ts]
tech_stack:
  added: [react-resizable-panels]
  patterns: [zustand-ack-tracking, ws-subscribe-on-execute, auto-scroll-hook, resizable-split-panel]
key_files:
  created:
    - frontend/src/hooks/useAutoScroll.ts
    - frontend/src/components/execute/ExecuteForm.tsx
    - frontend/src/components/execute/KillButton.tsx
    - frontend/src/components/stream/StreamPanel.tsx
    - frontend/src/components/stream/StreamEventRenderer.tsx
    - frontend/src/components/stream/AssistantText.tsx
    - frontend/src/components/stream/ToolUse.tsx
    - frontend/src/components/stream/ToolResult.tsx
    - frontend/src/components/stream/SystemEvent.tsx
    - frontend/src/components/stream/ResultSummary.tsx
    - frontend/src/components/ui/resizable.tsx
  modified:
    - frontend/src/stores/wsStore.ts
    - frontend/src/routes/dashboard/$nodeId.tsx
    - frontend/src/components/nodes/InstanceList.tsx
decisions:
  - "instanceStatuses in Zustand tracks instance lifecycle from WS push, enabling ACK-aware button disable without API polling"
  - "pendingInstanceId cleared when status transitions beyond 'pending' (running/finished/errored = ACK received)"
  - "StreamPanel uses relative positioning for scroll-to-bottom button overlay"
  - "InstanceList made fully clickable (all statuses) via onSelectInstance prop for stream navigation"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_created: 11
  files_modified: 3
---

# Phase 04 Plan 04: Execute Form and Stream Panel Summary

**One-liner:** ACK-aware execute form with resizable split layout, kill button, and 5-renderer NDJSON stream panel with auto-scroll.

## What Was Built

Two tasks completed, all acceptance criteria met.

### Task 1: Auto-scroll hook + NDJSON event renderers + resizable component

- Installed `react-resizable-panels` via `npx shadcn@latest add resizable`, generating `frontend/src/components/ui/resizable.tsx`
- Created `useAutoScroll` hook that detects user scroll-up (when `scrollHeight - scrollTop - clientHeight >= 50`) and suppresses auto-scroll until the user returns to the bottom
- Created 5 typed NDJSON event renderers, each with distinct left-border color coding:
  - `AssistantText` — blue border, monospace pre-wrap text blocks
  - `ToolUse` — amber border, collapsible JSON input via chevron toggle
  - `ToolResult` — purple border, truncated result content with max-height scroll
  - `SystemEvent` — gray border, muted `[system:subtype]` label
  - `ResultSummary` — green (success) or red (error) border, optional cost display
- Created `StreamEventRenderer` with switch dispatch on `event.type`

### Task 2: ExecuteForm, KillButton, StreamPanel, resizable node detail layout

- Extended `wsStore.ts`:
  - Added `instanceStatuses: Record<string, string>` field and `setInstanceStatus` action
  - `handleMessage` now calls `setInstanceStatus` on `instance_status` WS messages and also updates TanStack Query cache via `queryClient.setQueryData`
- `ExecuteForm`: POST to `/api/execute` with node_id, project, work_dir, prompt, session_id. Execute button disabled during POST AND while `isAwaitingAck` (instance status undefined or `'pending'`). Shows "Awaiting ACK..." text. Sends WS `subscribe` after POST success.
- `KillButton`: POST to `/api/instances/{id}/kill` with `node_id` body. Uses destructive variant.
- `StreamPanel`: reads `streamBuffers[instanceId]` from Zustand, renders events with `StreamEventRenderer`, uses `useAutoScroll`, shows scroll-to-bottom button overlay when scrolled up, shows `KillButton` for running/pending instances.
- Updated `InstanceList` with `onSelectInstance?: (instanceId: string) => void` prop — all rows clickable with hover effect.
- Rewrote `$nodeId.tsx` with `ResizablePanelGroup` split layout (40% controls / 60% stream), `ResizableHandle withHandle` divider. Left panel: ExecuteForm + InstanceList. Right panel: StreamPanel when `activeInstanceId` set, else placeholder. WS subscribe sent on instance creation and selection.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written with one minor enhancement:

**Enhancement: StreamPanel uses `relative` container instead of `absolute` positioning context**
- The plan showed `absolute bottom-4 right-4` for the scroll button; wrapped the outer div with `relative` class so the absolute positioning works correctly within the flex column layout.

## Known Stubs

None — all data flows are wired. Stream panel reads from live Zustand buffers populated by WS events.

## Self-Check: PASSED

All created files verified present. Both task commits verified in git log.

| Check | Result |
|-------|--------|
| frontend/src/hooks/useAutoScroll.ts | FOUND |
| frontend/src/components/execute/ExecuteForm.tsx | FOUND |
| frontend/src/components/execute/KillButton.tsx | FOUND |
| frontend/src/components/stream/StreamPanel.tsx | FOUND |
| frontend/src/components/stream/StreamEventRenderer.tsx | FOUND |
| frontend/src/components/ui/resizable.tsx | FOUND |
| Task 1 commit c8a187d | FOUND |
| Task 2 commit 71ab10d | FOUND |

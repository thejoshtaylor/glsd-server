---
phase: 04-dashboard-and-streaming
plan: "03"
subsystem: frontend
tags: [websocket, zustand, tanstack-query, react, dashboard, nodes]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [ws-store, ws-hook, node-grid, node-detail, instance-list]
  affects: [04-04]
tech_stack:
  added: []
  patterns:
    - Zustand store with TanStack Query invalidation on WebSocket messages
    - useWebSocket hook with ticket-based auth and exponential backoff reconnect
    - StrictMode-safe WebSocket connection via wsRef guard
key_files:
  created:
    - frontend/src/stores/wsStore.ts
    - frontend/src/hooks/useWebSocket.ts
    - frontend/src/components/nodes/NodeStatusBadge.tsx
    - frontend/src/components/nodes/NodeCard.tsx
    - frontend/src/components/nodes/NodeGrid.tsx
    - frontend/src/components/nodes/InstanceList.tsx
    - frontend/src/routes/dashboard/$nodeId.tsx
  modified:
    - frontend/src/routes/dashboard/index.tsx
decisions:
  - "useWebSocket placed in dashboard routes rather than root layout — avoids connecting WS before auth, consistent with ticket-based auth pattern"
  - "instanceStatusStyle typed as Record<InstanceResponse['status'], string> for exhaustive type safety"
metrics:
  duration: "113s"
  completed: "2026-03-23T17:51:31Z"
  tasks_completed: 2
  files_changed: 8
requirements: [DASH-01, DASH-02]
---

# Phase 04 Plan 03: Node Dashboard with Live Status Badges — Summary

**One-liner:** Zustand WebSocket store with TanStack Query invalidation, ticket-based WS hook with exponential backoff, node grid with green/yellow/red status badges, and per-node instance list.

## What Was Built

### Task 1: Zustand WS Store + useWebSocket Hook

**`frontend/src/stores/wsStore.ts`** — Zustand store that manages:
- `socket` / `connected` state for the active WebSocket connection
- `streamBuffers` — per-instance NDJSON event buffers for Plan 04 stream panel
- `handleMessage` — routes incoming WS messages: invalidates `['nodes']` query on `node_status_update`, invalidates `['instances']` and `['instance', id]` on `instance_status`, buffers events on `stream_event`

**`frontend/src/hooks/useWebSocket.ts`** — Connects WebSocket on mount:
1. Fetches short-lived ticket from `/api/auth/ws-ticket` (POST with Bearer token)
2. Opens `ws://host/ws/frontend?ticket=<ticket>`
3. Parses all incoming messages and dispatches to `handleMessage`
4. Reconnects with exponential backoff (3s base, 30s max)
5. Guards against React StrictMode double-mount via `wsRef.current` check
6. Cleans up correctly on unmount (nullifies `onclose` to prevent reconnect loop)

### Task 2: Node Grid + Status Badges + Instance List + Dashboard Routes

**`NodeStatusBadge`** — Renders colored badges: green (`bg-green-600/20 text-green-400`) for connected, yellow for stale, red for disconnected.

**`NodeCard`** — Shows `node_id`, platform, version, project count, last heartbeat time. Links to `/dashboard/$nodeId` via TanStack Router `<Link>`.

**`NodeGrid`** — TanStack Query `useQuery({ queryKey: ['nodes'] })` fetching `/api/nodes`. Handles loading, error, empty states. Re-renders automatically when WS store invalidates the `['nodes']` query key.

**`InstanceList`** — TanStack Query `useQuery({ queryKey: ['instances', { nodeId }] })` fetching `/api/instances?node_id={nodeId}`. Shows instance project, truncated ID, created timestamp, prompt, and colored status badge.

**`dashboard/index.tsx`** — Calls `useWebSocket()` on mount to establish the live connection, renders `NodeGrid`.

**`dashboard/$nodeId.tsx`** — Fetches single node from `/api/nodes/{nodeId}`, calls `useWebSocket()`, shows node details and `InstanceList`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all components are wired to real API endpoints. The `streamBuffers` in `wsStore` are populated but not yet consumed (Plan 04 stream panel will consume them). This is intentional per the plan design.

## Self-Check: PASSED

Files exist:
- FOUND: frontend/src/stores/wsStore.ts
- FOUND: frontend/src/hooks/useWebSocket.ts
- FOUND: frontend/src/components/nodes/NodeStatusBadge.tsx
- FOUND: frontend/src/components/nodes/NodeCard.tsx
- FOUND: frontend/src/components/nodes/NodeGrid.tsx
- FOUND: frontend/src/components/nodes/InstanceList.tsx
- FOUND: frontend/src/routes/dashboard/index.tsx
- FOUND: frontend/src/routes/dashboard/$nodeId.tsx

Commits:
- 4362d94: feat(04-03): Zustand WS store + useWebSocket hook
- b451ac9: feat(04-03): node grid + status badges + instance list + dashboard routes

Build: `vite build` succeeded — 0 errors, 0 TypeScript errors.

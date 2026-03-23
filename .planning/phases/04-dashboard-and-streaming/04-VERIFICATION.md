---
phase: 04-dashboard-and-streaming
verified: 2026-03-23T00:00:00Z
status: passed
score: 15/15 requirements verified
re_verification: false
---

# Phase 4: Dashboard and Streaming Verification Report

**Phase Goal:** Users see their fleet in the browser, dispatch commands, and watch Claude CLI output stream live in real time
**Verified:** 2026-03-23
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Stream events from nodes are forwarded to subscribed frontend WebSocket connections | VERIFIED | `handlers.py:205` calls `frontend_manager.fan_out_stream_event` after `append_stream_event`; `frontend_manager.py` implements per-connection asyncio.Queue fan-out |
| 2 | Frontend clients can subscribe to an instance_id and receive live stream events | VERIFIED | `frontend_router.py:92-140` handles `subscribe` message type with team access validation + buffered replay; `useWebSocket.ts` fetches WS ticket and connects |
| 3 | Persisted stream events are queryable via REST for history replay | VERIFIED | `handlers.py:188-198` persists `StreamEventModel` to DB on every event; `routers/nodes.py:92-113` exposes `GET /api/instances/{id}/stream` ordered by `sequence_num`; `HistoryStreamPanel.tsx` fetches from this endpoint |
| 4 | Node status changes are pushed to frontend WebSocket connections | VERIFIED | `handlers.py:91-92` broadcasts on register; `handlers.py:283,319` on disconnect; `health.py:96` on stale — all call `frontend_manager.broadcast_node_status` |
| 5 | New node alerts are broadcast to all connected frontend users | VERIFIED | `handlers.py:91` calls `broadcast_new_node_alert` when `is_new=True`; `wsStore.ts:61-64` stores alerts; `NewNodeAlert.tsx` renders dismissible banners on dashboard |
| 6 | User sees fleet of nodes with live status badges | VERIFIED | `NodeGrid.tsx` uses TanStack Query `['nodes']`; `NodeStatusBadge.tsx` renders green/yellow/red; `wsStore.ts:46-47` invalidates `['nodes']` on `node_status_update` WS messages |
| 7 | User can dispatch execute commands | VERIFIED | `ExecuteForm.tsx` POSTs to `/api/execute` with `node_id, project, work_dir, prompt, session_id`; button disabled while `isPending` AND `isAwaitingAck` (ACK-aware) |
| 8 | User can kill a running instance | VERIFIED | `KillButton.tsx` POSTs to `/api/instances/{id}/kill` with `node_id`; `routers/nodes.py:146-165` dispatches via `dispatch_kill` |
| 9 | NDJSON renders distinctly by event type | VERIFIED | `StreamEventRenderer.tsx` switch-dispatches to 5 typed renderers: `AssistantText` (blue), `ToolUse` (amber), `ToolResult` (purple), `SystemEvent` (gray), `ResultSummary` (green/red) |
| 10 | Stream output auto-scrolls with user override | VERIFIED | `useAutoScroll.ts` detects user scroll-up when `scrollHeight - scrollTop - clientHeight >= 50`; scroll-to-bottom button overlay when `userScrolledUp` is true |
| 11 | User can browse past completed instances | VERIFIED | `HistoryStreamPanel.tsx` fetches persisted events from `GET /api/instances/{id}/stream`; `$nodeId.tsx:126-134` shows HistoryStreamPanel for `finished`/`errored` instances |
| 12 | User can resume a previous session | VERIFIED | `InstanceList.tsx:49-61` shows Resume button for `finished`/`errored` instances with `session_id`; calls `onResumeSession`; `$nodeId.tsx` passes `resumeSessionId` as `defaultSessionId` to `ExecuteForm`; `ExecuteForm.tsx:22-26` syncs via `useEffect` |
| 13 | User sees staleness warning when node has not pinged in >90s | VERIFIED | `health.py:96` pushes `stale` status to frontend; `$nodeId.tsx:91` renders `StaleWarning` when `node.status === 'stale'`; `StaleWarning.tsx` shows "over 90 seconds" yellow banner |
| 14 | User is alerted when a previously-unseen node_id connects | VERIFIED | `handlers.py:54,91` tracks `is_new` and calls `broadcast_new_node_alert`; `wsStore.ts:61-64` appends to `newNodeAlerts`; `NewNodeAlerts` renders on dashboard |
| 15 | User sees clear error messages when instances fail | VERIFIED | `InstanceList.tsx:44-46` renders `inst.error` in `text-red-400` for errored instances; `ResultSummary.tsx` shows red border for `subtype: 'error'` result events |

**Score:** 15/15 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/ws/frontend_manager.py` | FrontendConnectionManager with asyncio.Queue fan-out | VERIFIED | `FrontendConnection` dataclass with `queue(maxsize=500)`, `subscriptions`; all 5 methods present; module-level `frontend_manager` singleton |
| `backend/app/ws/frontend_router.py` | WS endpoint with subscription handling and writer coroutine | VERIFIED | Writer coroutine via `asyncio.create_task(writer())`; subscribe/unsubscribe handlers with team access check; buffered event replay on subscribe |
| `backend/app/routers/nodes.py` | REST endpoints for nodes, instances, stream, execute, kill | VERIFIED | 7 endpoints: `GET /api/nodes`, `GET /api/nodes/{id}`, `GET /api/instances`, `GET /api/instances/{id}`, `GET /api/instances/{id}/stream`, `POST /api/execute`, `POST /api/instances/{id}/kill` |
| `backend/app/schemas/nodes.py` | Pydantic response models | VERIFIED | `NodeResponse`, `InstanceResponse`, `StreamEventResponse`, `ExecuteRequest`, `ExecuteResponse`, `KillRequest` — all with `from_attributes=True` |
| `backend/app/services/node_service.py` | `user_can_access_instance` function | VERIFIED | Present at line 60 |
| `backend/app/main.py` | `nodes.router` included | VERIFIED | Line 33: `app.include_router(nodes.router)` |
| `frontend/src/stores/wsStore.ts` | Zustand WS store with TQ integration | VERIFIED | `socket`, `connected`, `streamBuffers`, `instanceStatuses`, `newNodeAlerts`, `handleMessage`, `appendStreamEvent`, `clearStreamBuffer`, `setInstanceStatus`, `dismissAlert` |
| `frontend/src/hooks/useWebSocket.ts` | WS hook with ticket auth and exponential backoff | VERIFIED | Fetches `/api/auth/ws-ticket`; exponential backoff (3s base, 30s max); StrictMode guard via `wsRef` |
| `frontend/src/components/nodes/NodeStatusBadge.tsx` | Green/yellow/red status badges | VERIFIED | `statusConfig` maps `connected`→green, `stale`→yellow, `disconnected`→red |
| `frontend/src/components/nodes/NodeGrid.tsx` | Node grid with TanStack Query | VERIFIED | `useQuery({ queryKey: ['nodes'] })` fetching `/api/nodes` |
| `frontend/src/components/nodes/InstanceList.tsx` | Instance list with error display and resume | VERIFIED | Clickable rows, `inst.error` display, Resume button for instances with `session_id` |
| `frontend/src/components/execute/ExecuteForm.tsx` | ACK-aware execute form | VERIFIED | POSTs to `/api/execute`; `isAwaitingAck` logic; "Awaiting ACK..." text; sends WS `subscribe` on success; `defaultSessionId` prop for session resume |
| `frontend/src/components/execute/KillButton.tsx` | Kill button | VERIFIED | POSTs to `/api/instances/{id}/kill` with `{ node_id }` body |
| `frontend/src/components/stream/StreamPanel.tsx` | Live stream panel with auto-scroll | VERIFIED | Reads `streamBuffers[instanceId]` from Zustand; `useAutoScroll`; scroll-to-bottom button; KillButton for running/pending |
| `frontend/src/components/stream/StreamEventRenderer.tsx` | NDJSON switch renderer | VERIFIED | Switch on `event.type` → 5 typed renderers |
| `frontend/src/components/stream/HistoryStreamPanel.tsx` | REST-fetched history panel | VERIFIED | `useQuery` fetching `/api/instances/{id}/stream`; renders `StreamEventRenderer` per event |
| `frontend/src/hooks/useAutoScroll.ts` | Auto-scroll with user override | VERIFIED | 50px threshold for scroll-up detection; `resetScroll` to re-enable |
| `frontend/src/components/ui/resizable.tsx` | shadcn/ui resizable panels | VERIFIED | File exists; `react-resizable-panels@^4.7.5` in `package.json` |
| `frontend/src/components/alerts/NewNodeAlert.tsx` | Dismissible new node banner | VERIFIED | Reads `newNodeAlerts` from Zustand; `dismissAlert` on X click |
| `frontend/src/components/alerts/StaleWarning.tsx` | Yellow stale warning banner | VERIFIED | "over 90 seconds" text; yellow color scheme |
| `frontend/src/routes/dashboard/index.tsx` | Dashboard with WS hook and alerts | VERIFIED | `useWebSocket()` called; `<NewNodeAlerts />` rendered above NodeGrid |
| `frontend/src/routes/dashboard/$nodeId.tsx` | Node detail with resizable split layout | VERIFIED | `ResizablePanelGroup` (40%/60% split); `StaleWarning` on stale; `StreamPanel`/`HistoryStreamPanel` switching; ExecuteForm + InstanceList in left panel |
| `frontend/vite.config.ts` | Proxy for `/api` and `/ws` | VERIFIED | Both proxy targets present; `TanStackRouterVite()` first in plugins |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `handlers.py` | `frontend_manager.py` | `fan_out_stream_event` after `append_stream_event` | WIRED | `handlers.py:204-205` — both calls present in sequence |
| `health.py` | `frontend_manager.py` | `broadcast_node_status` on stale detection | WIRED | `health.py:96` after session commit, before WebSocket close |
| `routers/nodes.py` | `services/node_service.py` | team-scoped service calls | WIRED | All endpoints use `list_nodes_for_user`, `get_node_for_user`, `list_instances_for_user`, `user_can_access_instance` |
| `wsStore.ts` | `queryClient.ts` | `invalidateQueries` on `node_status_update` | WIRED | `wsStore.ts:46-47` |
| `useWebSocket.ts` | `/api/auth/ws-ticket` | ticket fetch before connect | WIRED | `useWebSocket.ts:24` |
| `ExecuteForm.tsx` | `/api/execute` | POST with full payload | WIRED | `ExecuteForm.tsx:44` |
| `ExecuteForm.tsx` | `wsStore.ts` | `instanceStatuses` for ACK tracking | WIRED | `ExecuteForm.tsx:30-34` |
| `StreamPanel.tsx` | `wsStore.ts` | `streamBuffers[instanceId]` | WIRED | `StreamPanel.tsx:15` |
| `$nodeId.tsx` | `resizable.tsx` | `ResizablePanelGroup` split layout | WIRED | `$nodeId.tsx:101` |
| `HistoryStreamPanel.tsx` | `/api/instances/{id}/stream` | `useQuery` fetch | WIRED | `HistoryStreamPanel.tsx:13-14` |
| `InstanceList.tsx` | `ExecuteForm.tsx` | `onResumeSession` callback passing `session_id` | WIRED | `InstanceList.tsx:49-61`; `$nodeId.tsx:115` passes `setResumeSessionId`; `ExecuteForm.tsx:22-26` syncs via `useEffect` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STRM-01 | 04-01 | Server parses `stream_event.data` as double-encoded JSON | SATISFIED | `handlers.py:176`: `parsed_data = json.loads(payload.data)`; `StreamEventPayload.data` is typed as `str` (the inner JSON string) |
| STRM-02 | 04-01 | Server forwards parsed stream events to frontend WebSocket subscribers | SATISFIED | `handlers.py:205`: `await frontend_manager.fan_out_stream_event(payload.instance_id, parsed_data)` |
| STRM-03 | 04-04 | Frontend renders structured NDJSON (text responses, tool use, tool result, system events) | SATISFIED | `StreamEventRenderer.tsx` with 5 typed renderers; each has distinct styling |
| STRM-04 | 04-04 | Stream output panel auto-scrolls with user override | SATISFIED | `useAutoScroll.ts` + `StreamPanel.tsx` scroll-to-bottom overlay button |
| STRM-05 | 04-01 | Stream events are persisted for instance history/replay | SATISFIED | `handlers.py:188-198` persists `StreamEventModel` to DB; `GET /api/instances/{id}/stream` returns ordered events |
| DASH-01 | 04-03 | User sees list of all nodes with live status indicators | SATISFIED | `NodeGrid.tsx` + `NodeStatusBadge.tsx`; WS invalidates TQ cache on `node_status_update` |
| DASH-02 | 04-03 | User can view per-node instance list with lifecycle state | SATISFIED | `InstanceList.tsx` fetching `/api/instances?node_id=`; colored status badges |
| DASH-03 | 04-04 | User can dispatch execute command | SATISFIED | `ExecuteForm.tsx` with project dropdown, prompt textarea, session ID input, ACK-aware button |
| DASH-04 | 04-04 | User can kill a running instance | SATISFIED | `KillButton.tsx` visible when `isRunning`; dispatches to `/api/instances/{id}/kill` |
| DASH-05 | 04-04 | User sees live streaming output as Claude CLI produces it | SATISFIED | `StreamPanel.tsx` reads `streamBuffers` populated by WS `stream_event` messages |
| DASH-06 | 04-05 | User sees health staleness warning when node hasn't pinged in >90s | SATISFIED | `StaleWarning.tsx` rendered when `node.status === 'stale'` in `$nodeId.tsx:91` |
| DASH-07 | 04-05 | User is alerted when a previously-unseen node_id connects | SATISFIED | `broadcast_new_node_alert` → Zustand `newNodeAlerts` → `NewNodeAlerts` dismissible banners |
| DASH-08 | 04-05 | User sees clear error messages when instances fail (including rate limit) | SATISFIED | `InstanceList.tsx:44-46` shows `inst.error` in red; `ResultSummary.tsx` handles `subtype: 'error'` |
| DASH-09 | 04-05 | User can resume a previous Claude session via session_id | SATISFIED | Resume button in `InstanceList`, `onResumeSession` callback, `defaultSessionId` prop on `ExecuteForm` |
| DASH-10 | 04-05 | User can browse past completed instances and their full output | SATISFIED | `HistoryStreamPanel` fetches REST-persisted events; `$nodeId.tsx` shows it for `finished`/`errored` instances |

All 15 requirements mapped to Phase 4 are satisfied. REQUIREMENTS.md traceability table marks STRM-01, STRM-02, STRM-05 as "Pending" but that is a stale status in the requirements file — the actual code implements all three.

---

## Anti-Patterns Found

No blockers or stubs found. Specific scanned patterns:

| File | Pattern | Finding |
|------|---------|---------|
| `frontend/src/routes/dashboard/index.tsx` | Placeholder returns | None — renders `NewNodeAlerts` + `NodeGrid` with real data |
| `frontend/src/routes/dashboard/$nodeId.tsx` | Stub handlers | None — all callbacks wired to real state setters and API calls |
| `frontend/src/components/execute/ExecuteForm.tsx` | `onSubmit` only prevents default | None — `onClick` mutation calls real API endpoint |
| `frontend/src/components/stream/StreamPanel.tsx` | Hardcoded empty state | "Waiting for output..." is a valid empty state, not a stub — `streamBuffers[instanceId]` is populated by real WS events |
| `backend/app/ws/handlers.py` | Missing fan-out call | Not present — both `append_stream_event` and `fan_out_stream_event` called |
| `backend/app/routers/nodes.py` | Static response returns | Not present — all endpoints call real service layer or DB |

---

## Human Verification Required

### 1. End-to-End Stream Rendering

**Test:** Connect a real GSD node, dispatch an execute command, observe output in StreamPanel
**Expected:** NDJSON events appear with color-coded left borders as they stream; AssistantText blocks show in blue, tool use in amber
**Why human:** Requires live node connection; real-time rendering cannot be verified by static code analysis

### 2. Auto-Scroll User Override

**Test:** Start an instance that produces many stream events; scroll up while output is streaming
**Expected:** Auto-scroll pauses; scroll-to-bottom button appears; clicking it resumes auto-scroll
**Why human:** Interactive scroll behavior requires browser testing

### 3. Resizable Panel Drag

**Test:** On node detail page, drag the ResizableHandle between the control panel and stream panel
**Expected:** Panels resize fluidly; both panels remain usable at non-default sizes
**Why human:** UI drag interaction requires browser testing

### 4. WebSocket Reconnect

**Test:** Start the frontend, let it connect, then restart the backend
**Expected:** Frontend reconnects with exponential backoff (visible in browser network tab); existing state preserved
**Why human:** Requires controlled process restart

### 5. New Node Alert Dismiss

**Test:** Connect a new node (not previously seen); observe alert banner appears; click X
**Expected:** Banner disappears; does not reappear unless another new node connects
**Why human:** Requires live node connection to trigger the `broadcast_new_node_alert` path

---

## Gaps Summary

None. All 15 requirements verified. All key links wired. No stub artifacts found.

The only outstanding item is a stale status in `REQUIREMENTS.md` — STRM-01, STRM-02, STRM-05 are listed as "Pending" in the traceability table but are implemented. The REQUIREMENTS.md status column for these three should be updated to "Complete".

---

_Verified: 2026-03-23_
_Verifier: Claude (gsd-verifier)_

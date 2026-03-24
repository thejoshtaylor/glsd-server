# Phase 4: Dashboard and Streaming - Research

**Researched:** 2026-03-21
**Domain:** React/TypeScript SPA dashboard + FastAPI WebSocket fan-out + real-time NDJSON rendering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Frontend Project Setup**
- `frontend/` directory at repo root — standard monorepo layout with `src/`, `public/`
- Vite dev proxy — `vite.config.ts` proxies `/api/*` and `/ws/*` to `localhost:8000` during development
- shadcn/ui + Tailwind v4 component library — copy-owned components, dashboard-optimized
- Zustand for WebSocket/UI state (live node statuses, stream buffers) + TanStack Query for REST data (auth, teams, node lists, instance history)
- TanStack Router for client-side routing with full type safety

**Dashboard Layout & Navigation**
- Sidebar nav + main content — sidebar shows teams/nodes tree, main area shows selected node details and stream panel
- Node list as card grid — each node card shows status badge (green=connected, yellow=stale, red=disconnected), hostname, platform, project count, last heartbeat
- Stream output in right split panel — node list on left, stream output on right when instance selected; resizable divider
- Dark mode only for v1 — single theme, optimized for dashboard use

**Stream Rendering & NDJSON**
- Typed React components per NDJSON event type — `AssistantText`, `ToolUse`, `ToolResult`, `SystemEvent` with distinct styling
- Auto-scroll ON by default, disabled when user scrolls up, re-enabled at bottom (standard terminal behavior)
- Backend persists stream events to `stream_events` table (exists from Phase 2); frontend fetches history via REST `GET /api/instances/{id}/stream` for past instances
- Inline execute form — select node dropdown → select project dropdown → prompt textarea → Execute button; button disabled until ACK; loading spinner during pending

**Backend Stream Fan-out**
- Frontend subscribes by `instance_id` — sends `{"type": "subscribe", "instance_id": "..."}` after WS connect; server validates team access before accepting subscription
- Per-connection asyncio.Queue — consistent with Phase 2 EventRouter pattern; dedicated writer coroutine per frontend WS connection; never direct `websocket.send_text()` from event handler
- REST for static data, WS for live updates — `GET /api/nodes` (team-scoped), `GET /api/instances/{id}` (details), `GET /api/instances/{id}/stream` (persisted events); live status and stream via WS
- New node alert via WS push — when `node_register` arrives with unknown `node_id`, broadcast `{"type": "new_node_alert", ...}` to frontend connections of teams that own the node

### Claude's Discretion
- React component file organization and naming conventions
- Zustand store slice design
- TanStack Router route structure
- shadcn/ui component selection and customization
- CSS/Tailwind class organization
- Error boundary and loading state patterns

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRM-01 | Server parses `stream_event.data` as double-encoded JSON (NDJSON line) | Already implemented in `handlers.py::handle_stream_event` via `json.loads(payload.data)`; fan-out to frontend is the remaining gap |
| STRM-02 | Server forwards parsed stream events to frontend WebSocket subscribers | Fan-out from `handle_stream_event` to `FrontendConnectionManager`; per-connection asyncio.Queue pattern documented |
| STRM-03 | Frontend renders structured NDJSON (text responses, tool use, system events) | Typed React components per NDJSON `type` field; Claude CLI NDJSON schema documented below |
| STRM-04 | Stream output panel auto-scrolls with user override | `useRef` + `useEffect` scroll pattern; intersection observer for bottom detection |
| STRM-05 | Stream events are persisted for instance history/replay | Already persisted to `stream_events` table in `handle_stream_event`; REST endpoint needed to query and return them |
| DASH-01 | User sees a list of all nodes in their teams with live status indicators | `GET /api/nodes` REST + WS push for status changes; Zustand stores live status map |
| DASH-02 | User can view per-node instance list with lifecycle state | `GET /api/nodes/{id}/instances` or filter from instances endpoint |
| DASH-03 | User can dispatch an execute command (select node, project, enter prompt) | `POST /api/execute` → `dispatch_execute()`; button disabled until ACK arrives via WS |
| DASH-04 | User can kill a running instance from the dashboard | `POST /api/instances/{id}/kill` → `dispatch_kill()`; WS confirmation on terminal event |
| DASH-05 | User sees live streaming output as Claude CLI produces it | WS subscription + Zustand stream buffer + auto-scroll component |
| DASH-06 | User sees health staleness warning when node hasn't pinged in >90s | Stale badge driven by WS push from `stale_node_scanner`; or derived from `last_heartbeat` polling |
| DASH-07 | User is alerted when a previously-unseen `node_id` connects | `new_node_alert` WS push from `handle_node_register` when `node.first_seen == now()` (newly created) |
| DASH-08 | User sees clear error messages when instances fail (including rate limit) | `instance_error` payload carries error string; render in stream panel with red styling |
| DASH-09 | User can resume a previous Claude session via `session_id` | `session_id` field in execute form; populated from selected past instance |
| DASH-10 | User can browse past completed instances and their full output | `GET /api/instances` (list) + `GET /api/instances/{id}/stream` (events); history view in stream panel |
</phase_requirements>

---

## Summary

Phase 4 is the largest phase of the project: it builds the complete React frontend from scratch (no frontend files exist yet) and completes the backend WebSocket fan-out infrastructure that was stubbed in Phase 2. The two major workstreams are largely independent — backend fan-out and REST endpoints can be built and tested without the frontend, and the frontend can be scaffolded and built against mock data before the backend integration is wired.

The backend work is focused: `frontend_router.py` has a fully-working auth skeleton and just needs its stub replaced with subscription/fan-out logic. The fan-out pattern (per-connection `asyncio.Queue` with a dedicated writer coroutine) is already established by the node WS handler and must be replicated in `ConnectionManager` for frontend connections. The `stream_events` table is already populated by `handle_stream_event` — the only backend gap is the REST endpoint to query it for history replay and the REST endpoints for nodes/instances.

The frontend is greenfield. The CLAUDE.md stack choices (Vite 8 + React 19 + TanStack Router + TanStack Query + Zustand + shadcn/ui + Tailwind v4) are confirmed. The integration pattern between Zustand (for live WS state) and TanStack Query (for REST state) requires careful design: they should not fight over the same data. The canonical pattern is: TanStack Query owns initial fetches and cache; Zustand owns live delta updates from WS; components read from TanStack Query cache that Zustand pushes updates into via `queryClient.setQueryData()`.

**Primary recommendation:** Build backend fan-out and REST endpoints first (Wave 1), scaffold the React app and routing shell second (Wave 2), then implement each dashboard feature as a vertical slice: node list with live badges, execute form, stream panel with NDJSON rendering, history browser (Waves 3-5).

---

## Standard Stack

### Core Backend (already established)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| FastAPI | 0.115+ | WebSocket + REST endpoints | Already in use; no changes needed |
| asyncio | stdlib | Per-connection Queue + writer coroutines | Core fan-out mechanism |
| SQLAlchemy 2.x async | 2.0.44+ | Stream events history query | Already in use; `select(StreamEvent).where(...)` |

### Core Frontend
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | UI framework | Locked in CLAUDE.md |
| TypeScript | 5.x | Type safety | Locked in CLAUDE.md |
| Vite | 8.x | Build tool | Locked in CLAUDE.md; Rolldown bundler 10-30x faster than webpack |
| TanStack Router | 1.x | Client-side routing | Locked; full type safety for SPA routes |
| TanStack Query | 5.91.3 | REST data fetching + cache | Locked; integrates with Zustand via `queryClient.setQueryData()` |
| Zustand | 5.0.12 | WebSocket + UI state | Locked; lightweight, no boilerplate |
| Tailwind CSS | 4.x | Utility CSS | Locked; required for shadcn/ui v4 |
| shadcn/ui | current | Component library | Locked; copy-owned components |

### Supporting Frontend
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-router` | 1.x | Router package | Install with TanStack Router |
| `@tanstack/react-query` | 5.x | Query package | REST data management |
| `lucide-react` | current | Icons | shadcn/ui icon dependency |
| `clsx` + `tailwind-merge` | current | Class merging | Standard shadcn/ui utilities |

### Installation

```bash
# From repo root — scaffold Vite React TypeScript project
npm create vite@latest frontend -- --template react-ts
cd frontend

# Routing and data fetching
npm install @tanstack/react-router @tanstack/react-query

# State
npm install zustand

# Tailwind v4
npm install -D tailwindcss@^4 @tailwindcss/vite

# shadcn/ui — requires Tailwind v4 setup first
npx shadcn@latest init

# Icons (shadcn/ui dependency)
npm install lucide-react

# Class utilities
npm install clsx tailwind-merge
```

---

## Architecture Patterns

### Recommended Project Structure

```
frontend/
├── src/
│   ├── routes/              # TanStack Router file-based routes
│   │   ├── __root.tsx       # Root layout with sidebar
│   │   ├── index.tsx        # Redirect to /dashboard
│   │   ├── login.tsx        # Login page
│   │   └── dashboard/
│   │       ├── index.tsx    # Node grid
│   │       └── $nodeId.tsx  # Node detail + stream panel
│   ├── components/
│   │   ├── nodes/           # NodeCard, NodeStatusBadge, NodeGrid
│   │   ├── stream/          # StreamPanel, AssistantText, ToolUse, ToolResult, SystemEvent
│   │   ├── execute/         # ExecuteForm, ProjectSelect, KillButton
│   │   └── ui/              # shadcn/ui copy-owned components
│   ├── stores/
│   │   ├── wsStore.ts       # Zustand: WS connection, live node status, stream buffers
│   │   └── uiStore.ts       # Zustand: selected node, selected instance, scroll override
│   ├── hooks/
│   │   ├── useWebSocket.ts  # WS lifecycle: connect, reconnect, message dispatch
│   │   └── useAutoScroll.ts # Auto-scroll with user override detection
│   ├── lib/
│   │   ├── api.ts           # Typed REST client (fetch wrapper with auth headers)
│   │   ├── queryClient.ts   # TanStack Query client instance
│   │   └── wsClient.ts      # WebSocket singleton with ticket refresh
│   ├── types/
│   │   ├── ndjson.ts        # NDJSON event type discriminated union
│   │   ├── protocol.ts      # WS message types (subscribe, stream_event, node_status, etc.)
│   │   └── api.ts           # REST response shapes (Node, Instance, StreamEvent)
│   └── main.tsx             # App entry + RouterProvider + QueryClientProvider
├── vite.config.ts           # Proxy /api/* and /ws/* to localhost:8000
├── tsconfig.json
└── package.json
```

### Pattern 1: Vite Dev Proxy

Critical for development — the browser WS API cannot connect cross-origin without CORS complexity. All `/api/*` and `/ws/*` traffic proxies to the backend.

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
```

### Pattern 2: Zustand + TanStack Query Integration (CRITICAL)

The canonical pattern for "live REST data": TanStack Query fetches the initial snapshot; Zustand receives WS delta updates and pushes them into the Query cache via `queryClient.setQueryData()`. Components read exclusively from the Query cache — they never subscribe to both Zustand and Query for the same entity.

```typescript
// stores/wsStore.ts
import { create } from 'zustand'
import { queryClient } from '../lib/queryClient'
import type { NdjsonEvent } from '../types/ndjson'

interface WsStore {
  socket: WebSocket | null
  nodeStatuses: Record<string, 'connected' | 'stale' | 'disconnected'>
  streamBuffers: Record<string, NdjsonEvent[]>
  connect: (ticket: string) => void
  disconnect: () => void
  appendStreamEvent: (instanceId: string, event: NdjsonEvent) => void
}

export const useWsStore = create<WsStore>((set, get) => ({
  socket: null,
  nodeStatuses: {},
  streamBuffers: {},

  connect: (ticket: string) => {
    const ws = new WebSocket(`/ws/frontend?ticket=${ticket}`)

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === 'node_status_update') {
        // Push into Zustand AND invalidate Query cache so node list re-renders
        set((s) => ({
          nodeStatuses: { ...s.nodeStatuses, [msg.node_id]: msg.status },
        }))
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
      }

      if (msg.type === 'stream_event') {
        get().appendStreamEvent(msg.instance_id, msg.data)
      }

      if (msg.type === 'instance_status') {
        // Update instance in Query cache directly
        queryClient.setQueryData(
          ['instance', msg.instance_id],
          (old: unknown) => old ? { ...(old as object), status: msg.status } : old
        )
      }
    }

    ws.onopen = () => set({ socket: ws })
    ws.onclose = () => set({ socket: null })
    set({ socket: ws })
  },

  disconnect: () => {
    get().socket?.close()
    set({ socket: null })
  },

  appendStreamEvent: (instanceId, event) => {
    set((s) => ({
      streamBuffers: {
        ...s.streamBuffers,
        [instanceId]: [...(s.streamBuffers[instanceId] ?? []), event],
      },
    }))
  },
}))
```

### Pattern 3: Backend Frontend ConnectionManager

The existing `ConnectionManager` handles nodes. A parallel `FrontendConnectionManager` is needed for frontend WS connections. The per-connection `asyncio.Queue` pattern (from STATE.md) must be followed exactly — never call `websocket.send_text()` directly from a handler; always enqueue to a per-connection queue.

```python
# backend/app/ws/frontend_manager.py
import asyncio
from dataclasses import dataclass, field
from fastapi import WebSocket

@dataclass
class FrontendConnection:
    user_id: str
    websocket: WebSocket
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    subscriptions: set[str] = field(default_factory=set)  # instance_ids

class FrontendConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, list[FrontendConnection]] = {}  # user_id -> [connections]

    def register(self, conn: FrontendConnection) -> None:
        self._connections.setdefault(conn.user_id, []).append(conn)

    def deregister(self, conn: FrontendConnection) -> None:
        conns = self._connections.get(conn.user_id, [])
        if conn in conns:
            conns.remove(conn)

    def subscribe(self, conn: FrontendConnection, instance_id: str) -> None:
        conn.subscriptions.add(instance_id)

    async def fan_out_stream_event(self, instance_id: str, data: dict) -> None:
        """Enqueue stream event to all frontend connections subscribed to instance_id."""
        msg = {"type": "stream_event", "instance_id": instance_id, "data": data}
        for conns in self._connections.values():
            for conn in conns:
                if instance_id in conn.subscriptions:
                    await conn.queue.put(msg)

    async def broadcast_node_status(self, node_id: str, status: str, team_user_ids: set[str]) -> None:
        """Push node status update to all frontend connections of users in the team."""
        msg = {"type": "node_status_update", "node_id": node_id, "status": status}
        for user_id, conns in self._connections.items():
            if user_id in team_user_ids:
                for conn in conns:
                    await conn.queue.put(msg)

    async def broadcast_new_node_alert(self, node_id: str, team_user_ids: set[str]) -> None:
        """Alert frontend connections when an unrecognized node_id connects."""
        msg = {"type": "new_node_alert", "node_id": node_id}
        for user_id, conns in self._connections.items():
            if user_id in team_user_ids:
                for conn in conns:
                    await conn.queue.put(msg)

frontend_manager = FrontendConnectionManager()
```

### Pattern 4: Writer Coroutine per Frontend WS Connection

Each frontend WS connection gets a dedicated writer coroutine that drains its asyncio.Queue. This decouples event production (handlers.py) from WS I/O.

```python
# Replaces stub in frontend_router.py
@router.websocket("/ws/frontend")
async def frontend_ws_endpoint(websocket: WebSocket, ticket: str) -> None:
    # ... ticket auth (already implemented) ...

    conn = FrontendConnection(user_id=user_id, websocket=websocket)
    frontend_manager.register(conn)

    async def writer() -> None:
        while True:
            msg = await conn.queue.get()
            try:
                await websocket.send_text(json.dumps(msg))
            except Exception:
                break

    writer_task = asyncio.create_task(writer())

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            if msg.get("type") == "subscribe":
                instance_id = msg.get("instance_id")
                # Validate team access, then subscribe
                async with get_session_maker()() as session:
                    if await user_can_access_instance(user_id, instance_id, session):
                        frontend_manager.subscribe(conn, instance_id)
                        # Replay persisted events for live-but-already-started instances
                        events = connection_manager.get_stream_events(instance_id)
                        for event in events:
                            await conn.queue.put({"type": "stream_event", "instance_id": instance_id, "data": event})
    except WebSocketDisconnect:
        pass
    finally:
        writer_task.cancel()
        frontend_manager.deregister(conn)
```

### Pattern 5: NDJSON Event Type Discrimination

Claude CLI produces NDJSON lines with a `type` field. Each type renders differently in the stream panel.

```typescript
// types/ndjson.ts
export type AssistantTextEvent = {
  type: 'assistant'
  message: { content: Array<{ type: 'text'; text: string }> }
}

export type ToolUseEvent = {
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
}

export type ToolResultEvent = {
  type: 'tool_result'
  tool_use_id: string
  content: Array<{ type: 'text'; text: string }>
}

export type SystemEvent = {
  type: 'system'
  subtype: string
  [key: string]: unknown
}

export type ResultEvent = {
  type: 'result'
  subtype: 'success' | 'error'
  result?: string
  error?: string
  cost_usd?: number
}

export type NdjsonEvent =
  | AssistantTextEvent
  | ToolUseEvent
  | ToolResultEvent
  | SystemEvent
  | ResultEvent
```

### Pattern 6: Auto-Scroll with User Override

```typescript
// hooks/useAutoScroll.ts
import { useEffect, useRef, useState } from 'react'

export function useAutoScroll(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [userScrolledUp, setUserScrolledUp] = useState(false)

  // Detect user scroll — disable auto-scroll when user scrolls up
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
      setUserScrolledUp(!atBottom)
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll when content changes (only if not user-overridden)
  useEffect(() => {
    if (!userScrolledUp && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  return { containerRef, userScrolledUp, resetScroll: () => setUserScrolledUp(false) }
}
```

### Pattern 7: TanStack Router File-Based Routing

TanStack Router v1 supports both code-based and file-based routing. For dashboards, file-based routing is cleaner. The route tree must be generated before the dev server starts.

```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  ),
})
```

### Pattern 8: WS Ticket Lifecycle

The frontend must obtain a fresh ticket before each WS connection attempt. Tickets expire in 30s and are single-use.

```typescript
// lib/wsClient.ts
async function connectWithFreshTicket(): Promise<WebSocket> {
  const res = await fetch('/api/auth/ws-ticket', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  })
  const { ticket } = await res.json()
  return new WebSocket(`/ws/frontend?ticket=${ticket}`)
}
```

### Anti-Patterns to Avoid

- **Direct `websocket.send_text()` from handlers:** Always enqueue to the per-connection `asyncio.Queue`. Direct sends race with the writer coroutine and can raise `WebSocketState` errors.
- **Polling for node status:** Node status must update via WS push, not polling. The stale node scanner (`ws/health.py`) already updates node status in the DB — it must also push to frontend connections.
- **Storing JWT in localStorage:** Use `httpOnly` cookies for tokens OR `sessionStorage` (clears on tab close). The WS ticket approach already avoids the most dangerous exposure.
- **Reading `stream_events` table on every stream event:** Use the in-memory buffer (`connection_manager.get_stream_events()`) for live replay; only query the DB table for historical (finished) instances.
- **Fighting Zustand vs TanStack Query:** Never have both subscribe to the same entity. TanStack Query owns the REST-fetched data shape; Zustand pushes mutations into it via `setQueryData`.
- **`json.loads()` of already-parsed data:** `stream_event.data` is double-encoded — `json.loads(payload.data)` once in `handle_stream_event`. By the time it reaches the frontend via WS, it is already a parsed JSON object. Do NOT `json.loads()` again on the frontend.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Component primitives | Custom button, input, dialog, table | shadcn/ui (Button, Input, Dialog, Table, Card, Badge, Separator) | shadcn/ui components handle accessibility, focus management, keyboard navigation |
| CSS utility composition | Custom className merging | `clsx` + `tailwind-merge` via `cn()` helper | Tailwind class conflicts need `twMerge` deduplication |
| REST data fetching + caching | Custom fetch hooks | TanStack Query (`useQuery`, `useMutation`) | Handles stale-while-revalidate, error states, loading states, background refetch |
| Route-level code splitting | Manual lazy imports | TanStack Router built-in lazy loading | Router handles code splitting per route automatically |
| Form state for execute form | Custom form state | React state + controlled inputs (small form) or React Hook Form (if validation complex) | Execute form is 3 fields — plain useState is fine; RHF for anything with >5 fields or complex validation |
| Resizable panel layout | Custom drag-resize | shadcn/ui `ResizablePanelGroup` from `react-resizable-panels` | Handles drag handle, keyboard resize, panel size persistence |

**Key insight:** shadcn/ui already includes `ResizablePanelGroup` (`pnpx shadcn@latest add resizable`) — do not build the split panel from scratch.

---

## Critical Implementation Details

### STRM-01/STRM-02: Stream Fan-out Integration Point

`handlers.py::handle_stream_event` currently calls `connection_manager.append_stream_event(payload.instance_id, parsed_data)` at line 193. Phase 4 must add a call to `frontend_manager.fan_out_stream_event(payload.instance_id, parsed_data)` immediately after. This is the only integration change needed in `handlers.py`.

```python
# handlers.py — add after existing append_stream_event call
from app.ws.frontend_manager import frontend_manager

async def handle_stream_event(payload: StreamEventPayload) -> None:
    parsed_data = json.loads(payload.data)
    # ... existing DB persist + append_stream_event ...

    # Phase 4 addition: fan-out to subscribed frontend connections
    await frontend_manager.fan_out_stream_event(payload.instance_id, parsed_data)
```

### STRM-05: Stream Events Already Persisted

STATE.md records: "Stream events not persisted to DB — only terminal state transitions written to PostgreSQL; stream events forwarded to frontend via asyncio queues only (STRM-05 resolved as frontend-side buffer)."

**This is superseded by the actual code.** `handlers.py::handle_stream_event` DOES persist to the `stream_events` table (lines 169-190). The `stream_events` migration (`0002_add_stream_events.py`) and `StreamEvent` model both exist. STRM-05 is satisfied at the persistence layer. Phase 4 only needs to add the `GET /api/instances/{id}/stream` REST endpoint to expose the persisted events.

### DASH-07: New Node Alert Implementation

`handle_node_register` in `handlers.py` already logs a warning when `node is None` (line 58). Phase 4 must:
1. Detect new node (node was `None` before upsert = `first_seen == connected_at`)
2. Query which teams own that node (or, since new node has no team yet — alert all online users, or the team that pre-registered the node_id)
3. Call `frontend_manager.broadcast_new_node_alert()`

Note: for v1, nodes are not pre-assigned to teams at connection time — teams are assigned separately. A pragmatic approach: broadcast new_node_alert to all currently-connected frontend users (not team-scoped) since the node has no team ownership yet.

### DASH-06: Stale Node Push

`ws/health.py::stale_node_scanner` runs every 30s and marks nodes stale in the DB. Currently it does NOT push to frontend. Phase 4 must add a `frontend_manager.broadcast_node_status()` call when the scanner changes a node's status to `stale`.

### Node Status Real-Time Updates

Beyond the stale scanner, status changes occur in handlers: connected (node_register), disconnected (handle_node_disconnect, handle_unexpected_disconnect). Each of these handlers must also push node status updates to the frontend manager after their DB updates.

### DASH-09: Session Resume

The `dispatch_execute()` function already accepts `session_id: str | None`. The execute form must:
1. Show the optional "Resume session" input
2. Pre-populate it when user selects a past finished instance from the history view
3. Pass `session_id` in the `POST /api/execute` request body

---

## Backend REST Endpoints Required (New in Phase 4)

| Endpoint | Method | Purpose | Notes |
|----------|--------|---------|-------|
| `/api/nodes` | GET | List all nodes for current user (team-scoped) | Calls `list_nodes_for_user()` — already exists in node_service |
| `/api/nodes/{node_id}` | GET | Single node detail | Calls `get_node_for_user()` — already exists |
| `/api/instances` | GET | List instances for user (optionally filter by node_id) | Calls `list_instances_for_user()` — already exists |
| `/api/instances/{id}` | GET | Single instance detail | New query |
| `/api/instances/{id}/stream` | GET | Persisted stream events for an instance | Query `stream_events` table ordered by `sequence_num` |
| `/api/execute` | POST | Dispatch execute command | Calls `dispatch_execute()` — already exists |
| `/api/instances/{id}/kill` | POST | Dispatch kill command | Calls `dispatch_kill()` — already exists |

All service-layer functions already exist. Phase 4 only adds the router/schema layer.

---

## Common Pitfalls

### Pitfall 1: asyncio.Queue Backpressure
**What goes wrong:** A slow frontend WebSocket client (or one that has disconnected mid-drain) causes `queue.put()` to grow unbounded or block.
**Why it happens:** No queue size limit means a dead connection accumulates indefinitely.
**How to avoid:** Use `asyncio.Queue(maxsize=500)` and use `put_nowait()` with a try/except `QueueFull` to drop events if the client is too slow. Log dropped events.
**Warning signs:** Memory growth in long-running sessions.

### Pitfall 2: WS Ticket Race on Page Reload
**What goes wrong:** Page reloads quickly, ticket expires before WS connects, user sees auth error.
**Why it happens:** 30s ticket expiry is tight if the frontend requests the ticket and then does other work before connecting.
**How to avoid:** Request the ticket immediately before opening the WS connection. In `useWebSocket`, call `POST /api/auth/ws-ticket` then immediately open `new WebSocket(url)` in the same async chain.

### Pitfall 3: Multiple WS Connections on React StrictMode / HMR
**What goes wrong:** React StrictMode (dev only) mounts → unmounts → remounts components, creating two WS connections. HMR can have similar effects.
**Why it happens:** `useEffect` with WS setup runs twice in strict mode.
**How to avoid:** Store the WS in Zustand (singleton), check `socket !== null` before creating a new connection. The module-level singleton ensures only one connection exists.

### Pitfall 4: Tailwind v4 CSS Import Syntax
**What goes wrong:** Using `@tailwind base; @tailwind components; @tailwind utilities` (v3 syntax) causes build errors with v4.
**Why it happens:** Tailwind v4 changed the CSS directive syntax.
**How to avoid:** Tailwind v4 uses `@import "tailwindcss"` in the main CSS file. With the Vite plugin, no CSS directive is needed — just install `@tailwindcss/vite` and add the plugin.
**Warning signs:** Build errors mentioning unknown `@tailwind` directive.

### Pitfall 5: TanStack Router Route Tree Generation
**What goes wrong:** File-based routes are not picked up if the route tree isn't generated.
**Why it happens:** TanStack Router requires a code generation step (`tsr generate` or the Vite plugin) to produce `routeTree.gen.ts`.
**How to avoid:** Install `@tanstack/router-plugin` for Vite — it generates the route tree automatically on save. Add to `vite.config.ts` plugins.
**Warning signs:** Import error on `routeTree.gen.ts` file not found.

### Pitfall 6: Fan-out to Disconnected Frontend Connections
**What goes wrong:** Calling `fan_out_stream_event` after a frontend client disconnects raises `WebSocketState` errors or silently fails, leaving stale connections in the registry.
**Why it happens:** The `finally` block in `frontend_ws_endpoint` deregisters on clean disconnect, but exceptions during WS receive can bypass cleanup.
**How to avoid:** Wrap `websocket.send_text()` in the writer coroutine with try/except; on any exception, break the loop and let the outer try/finally handle cleanup. The writer coroutine pattern (Pattern 4 above) handles this correctly.

### Pitfall 7: Frontend Team Scoping
**What goes wrong:** `GET /api/nodes` returns nodes the user cannot see, or the execute form shows nodes from other teams.
**Why it happens:** Forgetting to pass `user_id` to `list_nodes_for_user()`.
**How to avoid:** All node/instance REST endpoints must call `list_nodes_for_user(current_user.user_id, db)` — never `select(Node)` without the team join filter. `node_service.py` already has the correct scoped queries.

---

## Code Examples

### shadcn/ui Resizable Panel (DASH split layout)
```typescript
// components/dashboard/DashboardLayout.tsx
import {
  ResizableHandle,
  ResizablePanelGroup,
  ResizablePanel,
} from '@/components/ui/resizable'

export function DashboardLayout() {
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={35} minSize={20}>
        <NodeGrid />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={65} minSize={30}>
        <StreamPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
```

### TanStack Query nodes fetch
```typescript
// hooks/useNodes.ts
import { useQuery } from '@tanstack/react-query'

export function useNodes() {
  return useQuery({
    queryKey: ['nodes'],
    queryFn: async () => {
      const res = await fetch('/api/nodes', {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
      if (!res.ok) throw new Error('Failed to fetch nodes')
      return res.json() as Promise<Node[]>
    },
    staleTime: 30_000,
  })
}
```

### NDJSON event renderer
```typescript
// components/stream/StreamEventRenderer.tsx
import type { NdjsonEvent } from '@/types/ndjson'

export function StreamEventRenderer({ event }: { event: NdjsonEvent }) {
  switch (event.type) {
    case 'assistant':
      return <AssistantText event={event} />
    case 'tool_use':
      return <ToolUse event={event} />
    case 'tool_result':
      return <ToolResult event={event} />
    case 'result':
      return <ResultSummary event={event} />
    default:
      return <SystemEvent event={event} />
  }
}
```

### Execute form mutation
```typescript
// hooks/useExecute.ts
import { useMutation } from '@tanstack/react-query'

export function useExecute() {
  return useMutation({
    mutationFn: async (payload: ExecuteRequest) => {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<{ instance_id: string }>
    },
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 directives (`@tailwind base`) | `@import "tailwindcss"` or Vite plugin (v4) | Tailwind v4.0 (2025) | CSS entrypoint syntax change; `@tailwindcss/vite` plugin handles it automatically |
| React Router v6 for SPAs | TanStack Router v1 for type-safe SPAs | 2024 | TanStack Router provides end-to-end type safety for routes, params, search params without requiring framework/SSR mode |
| Redux for WS state | Zustand + TanStack Query combination | 2024 | Zustand is idiomatic for WebSocket state; TanStack Query handles server state better than Redux |
| Create React App | Vite 8 with Rolldown | 2025 (CRA deprecated 2023) | 10-30x faster builds; Rolldown bundler in Vite 8 |

**Deprecated/outdated:**
- `passlib`: abandoned, broken with bcrypt >= 5.0.0 — already excluded from this project (pwdlib used instead)
- `python-jose`: abandoned, unpatched CVEs — already excluded (PyJWT used instead)
- Create React App: deprecated — use Vite

---

## Open Questions

1. **New node alert team scoping**
   - What we know: new nodes have no team assignment at connect time
   - What's unclear: who should receive the alert? All online users? Admins only?
   - Recommendation: for v1, broadcast `new_node_alert` to all connected frontend users (not team-scoped). Add team assignment as a Phase 5 enhancement.

2. **Node status push scope**
   - What we know: `broadcast_node_status` should push to users in teams that own the node
   - What's unclear: fetching all team user_ids for a node adds a DB query to every status change
   - Recommendation: cache the team membership as a set in `NodeConnection` at registration time, refreshed on node_register. Avoids per-event DB queries.

3. **Execute form `work_dir` field**
   - What we know: `dispatch_execute()` requires `work_dir` in addition to project; server-spec says work_dir is a valid path for the project
   - What's unclear: does the frontend know the work_dir per project? Nodes send `projects` as a list of names, not objects with work_dirs
   - Recommendation: make `work_dir` default to the project name (same convention as nodes typically use); or add an optional work_dir input in the execute form. This needs clarification before implementation.

4. **Access token storage**
   - What we know: frontend needs the JWT access token for REST and WS ticket requests
   - What's unclear: sessionStorage (cleared on tab close) vs memory variable
   - Recommendation: store in module-level memory variable in `lib/api.ts`; set on login, persist refresh token in `localStorage` to re-issue access tokens on page reload. Do NOT store access token in localStorage.

---

## Sources

### Primary (HIGH confidence)
- CLAUDE.md — authoritative stack decisions for this project (React 19, Vite 8, TanStack Router 1.x, TanStack Query 5.x, Zustand 5.x, shadcn/ui, Tailwind v4)
- `backend/app/ws/handlers.py` — confirms double-encoding, stream event persistence, in-memory buffer pattern
- `backend/app/ws/manager.py` — established ConnectionManager pattern to replicate for frontend connections
- `backend/app/ws/frontend_router.py` — confirmed ticket auth is complete; stub ready for Phase 4 replacement
- `backend/app/services/node_service.py` — confirms team-scoped service functions already exist
- `backend/app/ws/commands.py` — confirms `dispatch_execute()` and `dispatch_kill()` exist and accept correct params
- `.planning/STATE.md` — EventRouter asyncio.Queue pattern decision; single-worker constraint
- `protocol-spec.md` / `server-spec.md` — NDJSON type field schema, double-encoding spec

### Secondary (MEDIUM confidence)
- shadcn/ui docs (https://ui.shadcn.com/docs/tailwind-v4) — Tailwind v4 setup with shadcn/ui
- TanStack Router docs — file-based routing and route tree generation
- CLAUDE.md sources section — TanStack Query + WebSocket integration pattern reference

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — locked in CLAUDE.md, verified against existing codebase
- Architecture patterns: HIGH — derived from existing patterns in handlers.py and manager.py
- NDJSON event types: MEDIUM — based on Claude CLI output format knowledge; exact field names should be validated against real node output
- Pitfalls: HIGH — derived from actual existing code and STATE.md known issues

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable stack; React 19 / TanStack v5 API unlikely to break in 30 days)

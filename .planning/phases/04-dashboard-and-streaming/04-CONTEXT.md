# Phase 4: Dashboard and Streaming - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the complete React frontend application (scaffolded with Vite, shadcn/ui, Tailwind v4) and the backend stream fan-out infrastructure. Users see their node fleet in a dark-themed dashboard with live status badges, dispatch execute/kill commands via inline forms, and watch Claude CLI output stream in real time via typed NDJSON rendering. Backend adds REST endpoints for dashboard data, WebSocket subscription/fan-out to frontend clients, and stream event persistence for history replay. No voice input, no audit trail — those are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Frontend Project Setup
- `frontend/` directory at repo root — standard monorepo layout with `src/`, `public/`
- Vite dev proxy — `vite.config.ts` proxies `/api/*` and `/ws/*` to `localhost:8000` during development
- shadcn/ui + Tailwind v4 component library — copy-owned components, dashboard-optimized
- Zustand for WebSocket/UI state (live node statuses, stream buffers) + TanStack Query for REST data (auth, teams, node lists, instance history)
- TanStack Router for client-side routing with full type safety

### Dashboard Layout & Navigation
- Sidebar nav + main content — sidebar shows teams/nodes tree, main area shows selected node details and stream panel
- Node list as card grid — each node card shows status badge (green=connected, yellow=stale, red=disconnected), hostname, platform, project count, last heartbeat
- Stream output in right split panel — node list on left, stream output on right when instance selected; resizable divider
- Dark mode only for v1 — single theme, optimized for dashboard use

### Stream Rendering & NDJSON
- Typed React components per NDJSON event type — `AssistantText`, `ToolUse`, `ToolResult`, `SystemEvent` with distinct styling
- Auto-scroll ON by default, disabled when user scrolls up, re-enabled at bottom (standard terminal behavior)
- Backend persists stream events to `stream_events` table (exists from Phase 2); frontend fetches history via REST `GET /api/instances/{id}/stream` for past instances
- Inline execute form — select node dropdown → select project dropdown → prompt textarea → Execute button; button disabled until ACK; loading spinner during pending

### Backend Stream Fan-out
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/ws/manager.py` — ConnectionManager with `_instance_streams` buffer, `append_stream_event()`, `get_stream_events()`
- `backend/app/ws/frontend_router.py` — Stub with ticket auth, connection loop placeholder marked "Phase 4 will implement"
- `backend/app/services/node_service.py` — Team-scoped node/instance queries (`list_nodes_for_user`, `list_instances_for_user`)
- `backend/app/services/auth_service.py` — `create_ws_ticket()`, `validate_ws_ticket()`
- `backend/app/models/stream_event.py` — StreamEvent model (instance_id, sequence_num, data JSON, timestamp)
- `backend/app/ws/protocol.py` — Envelope and message Pydantic models
- `backend/app/ws/commands.py` — `dispatch_execute()`, `dispatch_kill()` with team ownership checks

### Established Patterns
- SQLAlchemy 2.0 async with `Mapped[]` typed columns
- FastAPI router-based endpoint organization
- Per-connection asyncio.Queue pattern (from STATE.md EventRouter decision)
- Service-layer enforcement of team scoping
- PyJWT ticket-based WebSocket auth

### Integration Points
- `frontend_router.py` — replace stub connection loop with subscription handling and fan-out
- `manager.py` — add frontend connection registry and fan-out methods
- `main.py` — add REST routers for nodes/instances endpoints
- `handlers.py` — hook stream event fan-out to frontend subscribers after node event processing

</code_context>

<specifics>
## Specific Ideas

- NDJSON stream events from Claude CLI contain `type` field: `assistant`, `tool_use`, `tool_result`, `system`, `result` — render each distinctly
- `stream_event.data` is double-encoded JSON — always `json.loads(payload.data)` before forwarding
- Frontend WS connects via `/ws/frontend?ticket=<uuid>` — ticket obtained from `POST /api/auth/ws-ticket`
- Node status badges update in real time via WS — no polling
- Past instance output browsable via REST endpoint that queries `stream_events` table

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

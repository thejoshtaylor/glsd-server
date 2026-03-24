# Phase 7: Audit UI & Dashboard Auth Guard - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an audit trail page to the dashboard and protect all dashboard routes with an authentication guard. Users can view, filter, and paginate audit log entries. Unauthenticated users are redirected to login.

</domain>

<decisions>
## Implementation Decisions

### Audit Page Layout
- Dedicated `/dashboard/audit` route with "Audit" link in sidebar nav — consistent with existing `/dashboard` and `/dashboard/$nodeId` pattern
- Dropdown/select at top of audit page listing user's nodes — required by API (`node_id` is mandatory param on `GET /api/audit`)
- Table columns: Timestamp, Event Type, Node, Instance ID, Details — matches AuditLog model fields
- Offset-based pagination with Next/Prev buttons — matches existing API `offset` param; simple and consistent

### Auth Guard
- TanStack Router `beforeLoad` on `/dashboard` route — single guard protects all dashboard child routes including `/dashboard/audit`
- Redirect to `/login` with `?redirect=` param preserving intended URL so user returns after login
- Check for access token in localStorage (`getAccessToken()`) — existing pattern from `__root.tsx`
- 401 response interceptor clears tokens and redirects to `/login` — catches expired tokens on API calls

### Audit Filtering & UX
- Dropdown select for event type filter with options: All, execute, kill, instance_finished, instance_error — matches the 4 event types in the API
- Empty state: simple "No audit entries found" message with muted text — consistent with dashboard patterns
- Loading state: skeleton rows in the table while fetching — shadcn/ui Skeleton component
- Timestamps: relative time ("2 min ago") with full timestamp on hover — standard dashboard pattern

### Claude's Discretion
None — all decisions captured above

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/routers/audit.py` — `GET /api/audit` endpoint already exists with `node_id`, `type`, `limit`, `offset` params
- `backend/app/schemas/audit.py` — `AuditLogResponse` Pydantic model
- `frontend/src/routes/__root.tsx` — Sidebar nav with "Dashboard" link, `getAccessToken()` check, logout button
- `frontend/src/routes/dashboard/index.tsx` — Dashboard page pattern with TanStack Router file-based routing
- `frontend/src/routes/dashboard/$nodeId.tsx` — Node detail page pattern
- `frontend/src/lib/api.ts` — `getAccessToken()`, `clearTokens()`, API helpers
- `frontend/src/components/ui/` — shadcn/ui components (Button, Skeleton, etc.)

### Established Patterns
- TanStack Router file-based routing: `routes/dashboard/index.tsx`, `routes/dashboard/$nodeId.tsx`
- TanStack Query for REST data fetching with `queryClient`
- Dark mode only (bg-gray-950, text-gray-100)
- shadcn/ui components for UI primitives
- Sidebar nav in `__root.tsx` with `<Link>` components

### Integration Points
- `__root.tsx` sidebar nav — add "Audit" link
- `routes/dashboard/` — add `audit.tsx` route file
- `routes/dashboard/` — add `route.tsx` with `beforeLoad` auth guard for all child routes
- `lib/api.ts` — add 401 interceptor logic

</code_context>

<specifics>
## Specific Ideas

- Audit API requires `node_id` — user must select a node first before seeing audit entries
- The 4 event types match commands/events: execute, kill, instance_finished, instance_error
- Auth guard should use TanStack Router's `beforeLoad` which runs before the component renders

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

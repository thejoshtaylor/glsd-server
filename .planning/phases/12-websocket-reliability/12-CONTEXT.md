# Phase 12: WebSocket Reliability - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix two WebSocket bugs: INT-01 (reconnect fails when access token expires) and INT-02 (audit page has no WebSocket on direct navigation). No new UI elements — silent reliability improvements.

</domain>

<decisions>
## Implementation Decisions

### WebSocket Reconnect Strategy (INT-01)
- Server closes WebSocket with a specific close code on expired/invalid ticket; client catches the close code to distinguish auth failure from network failure
- Reconnect flow: call `refreshAccessToken()` (uses Phase 11's singleton guard) → get new WS ticket → reconnect
- Keep current exponential backoff (500ms–30s) with no attempt cap — matches node reconnect behavior
- No new reconnection UI — silent reconnect only; UXE-01 (disconnect banner) is deferred to future

### Audit Page Direct Navigation (INT-02)
- Move `useWebSocket()` call to dashboard layout route (`route.tsx`) — all child routes get WS connection automatically
- Remove duplicate `useWebSocket()` calls from `dashboard/index.tsx` and `dashboard/$nodeId.tsx` — layout handles it
- No other changes needed to audit page — it already reads from wsStore; just needs the WS connection established

### Claude's Discretion
- Specific WebSocket close code number (e.g., 4001 for auth failure)
- Whether to add the close code to the backend WS handler or rely on existing behavior
- Error logging verbosity during reconnect attempts
- Test structure and approach

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/hooks/useWebSocket.ts` — current WS hook with reconnect logic; needs token refresh injection
- `frontend/src/lib/api.ts` — `refreshAccessToken()` with singleton guard (Phase 11), `getAccessToken()`, WS ticket endpoint
- `frontend/src/stores/wsStore.ts` — Zustand store for WS state; already consumed by audit page
- `backend/app/routers/auth.py` — `/api/auth/ws-ticket` endpoint for WS auth

### Established Patterns
- WS ticket system: short-lived (30s) single-use tickets obtained via REST, consumed atomically on WS upgrade
- `useRef` for reconnect state in useWebSocket hook
- Zustand stores for cross-component state sharing

### Integration Points
- `frontend/src/routes/dashboard/route.tsx` — layout route; `useWebSocket()` moves here
- `frontend/src/routes/dashboard/index.tsx` — remove `useWebSocket()` call
- `frontend/src/routes/dashboard/$nodeId.tsx` — remove `useWebSocket()` call
- `backend/app/services/node_connection_service.py` — WS connection handler; may need close code for auth failures

</code_context>

<specifics>
## Specific Ideas

- Move `useWebSocket()` to layout route (`route.tsx`) to fix INT-02 — do NOT add it to `audit.tsx` (from STATE.md pitfall)
- Always call `getAccessToken()` AFTER `await refreshAccessToken()` — never capture token in local var before async boundary (from STATE.md pitfall)

</specifics>

<deferred>
## Deferred Ideas

- WS disconnection banner with auto-reconnect countdown (UXE-01 — future requirement)

</deferred>

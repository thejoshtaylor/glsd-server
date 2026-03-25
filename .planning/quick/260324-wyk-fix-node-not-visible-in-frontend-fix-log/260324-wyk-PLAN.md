---
phase: quick
plan: 260324-wyk
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/ws/handlers.py
  - backend/app/ws/health.py
  - frontend/src/lib/api.ts
  - frontend/src/routes/dashboard/route.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Newly registered nodes appear in the admin's dashboard node list"
    - "Refreshing the browser while logged in does NOT redirect to /login"
    - "Idle nodes are not marked stale and disconnected within 90 seconds"
  artifacts:
    - path: "backend/app/ws/handlers.py"
      provides: "Auto-assign new nodes to admin personal team"
      contains: "NodeTeam"
    - path: "frontend/src/lib/api.ts"
      provides: "Auth-ready promise that route guards can await"
      contains: "authReady"
    - path: "frontend/src/routes/dashboard/route.tsx"
      provides: "Route guard that awaits auth refresh before redirecting"
      contains: "await"
    - path: "backend/app/ws/health.py"
      provides: "Increased stale threshold to 300s"
      contains: "300"
  key_links:
    - from: "backend/app/ws/handlers.py"
      to: "node_teams table"
      via: "NodeTeam insert on is_new=True"
      pattern: "NodeTeam.*node_id.*team_id"
    - from: "frontend/src/routes/dashboard/route.tsx"
      to: "frontend/src/lib/api.ts"
      via: "awaiting authReady promise"
      pattern: "await.*authReady"
---

<objective>
Fix three bugs: (1) new nodes invisible in frontend because no NodeTeam junction record is created on registration, (2) page refresh causes logout because route guard checks token synchronously before async refresh completes, (3) idle nodes falsely marked stale due to 90s threshold being too short for WS-ping-only keepalive.

Purpose: Make the deployed system actually usable -- nodes must be visible, sessions must survive refresh, and idle nodes must stay connected.
Output: Patched handlers.py, health.py, api.ts, and route.tsx.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/app/ws/handlers.py
@backend/app/ws/health.py
@frontend/src/lib/api.ts
@frontend/src/routes/dashboard/route.tsx
@backend/app/models/node_team.py
@backend/app/models/team.py
@backend/app/services/node_service.py
@backend/app/services/admin_bootstrap.py

<interfaces>
<!-- Key types the executor needs -->

From backend/app/models/node_team.py:
```python
class NodeTeam(Base):
    __tablename__ = "node_teams"
    node_id: Mapped[str] = mapped_column(String(255), ForeignKey("nodes.node_id"), primary_key=True)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

From backend/app/models/team.py:
```python
class Team(Base):
    __tablename__ = "teams"
    team_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))

class TeamMember(Base):
    __tablename__ = "team_members"
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), default="member")
```

From frontend/src/lib/api.ts:
```typescript
export function getAccessToken(): string | null
export async function refreshAccessToken(): Promise<boolean>
export function getStoredRefreshToken(): string | null
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Auto-assign new nodes to admin team and increase stale threshold</name>
  <files>backend/app/ws/handlers.py, backend/app/ws/health.py</files>
  <action>
**handlers.py -- Auto-assign new nodes to first available team (admin's personal team):**

In `handle_node_register()`, after `session.add(node)` inside the `if node is None` (is_new=True) block, add the following BEFORE `reconcile_instances`:

1. Add imports at top of file: `from app.models.node_team import NodeTeam` and `from app.models.team import Team`
2. Inside the `is_new` block, after `session.add(node)`, call `await session.flush()` to ensure the Node row exists (FK constraint on node_teams requires it).
3. Query for the first team: `first_team = (await session.execute(select(Team).limit(1))).scalar_one_or_none()`
4. If `first_team` is not None, add a NodeTeam record: `session.add(NodeTeam(node_id=payload.node_id, team_id=first_team.team_id))`
5. Log it: `logger.info("Auto-assigned new node %s to team %s", payload.node_id, first_team.name)`

This approach is simple and correct for the current single-admin setup. The admin bootstrap creates the first team, so `select(Team).limit(1)` will return their personal team. If no teams exist (edge case), the node is created without assignment (same as current behavior) and can be assigned later.

**health.py -- Increase stale threshold:**

Change `STALE_THRESHOLD_SECONDS = 90` to `STALE_THRESHOLD_SECONDS = 300`. This gives idle nodes 5 minutes of tolerance. The node client sends WS-level pings every 30s which keep the TCP connection alive, but these do not update the application-level heartbeat. 300s is a safe buffer.
  </action>
  <verify>
    <automated>cd /Users/josh/code/glsd-server && python -c "
from backend.app.ws.health import STALE_THRESHOLD_SECONDS
assert STALE_THRESHOLD_SECONDS == 300, f'Expected 300, got {STALE_THRESHOLD_SECONDS}'
print('Stale threshold OK')
" 2>/dev/null || cd /Users/josh/code/glsd-server/backend && python -c "
import sys; sys.path.insert(0, '.')
from app.ws.health import STALE_THRESHOLD_SECONDS
assert STALE_THRESHOLD_SECONDS == 300, f'Expected 300, got {STALE_THRESHOLD_SECONDS}'
print('Stale threshold OK')
" && grep -q "NodeTeam" app/ws/handlers.py && echo "NodeTeam import OK" && grep -q "flush" app/ws/handlers.py && echo "Flush present OK"</automated>
  </verify>
  <done>
    - handlers.py creates a NodeTeam record when is_new=True, linking to the first team in the DB
    - session.flush() called before NodeTeam insert to satisfy FK constraint
    - health.py STALE_THRESHOLD_SECONDS is 300
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix logout-on-refresh by making route guard await auth refresh</name>
  <files>frontend/src/lib/api.ts, frontend/src/routes/dashboard/route.tsx</files>
  <action>
**api.ts -- Export an auth-ready promise:**

1. After the existing module-level block (lines 129-134), create and export a promise that resolves when the initial refresh attempt completes:

```typescript
export const authReady: Promise<void> = getStoredRefreshToken()
  ? refreshAccessToken().then(() => {})
  : Promise.resolve()
```

2. Remove the existing module-level refresh block (lines 129-134) since authReady replaces it. The old code fires `refreshAccessToken()` but nobody awaits the result, which is the root cause.

NOTE: `refreshAccessToken()` already has a singleton guard (`refreshPromise`), so if the old block fires before this new code, they share the same promise -- no double-refresh. But cleaner to just remove the old block entirely and let `authReady` be the single source.

**route.tsx -- Await authReady before checking token:**

1. Import `authReady` from `@/lib/api`
2. Change `beforeLoad` to an async function that awaits `authReady` before checking `getAccessToken()`:

```typescript
beforeLoad: async ({ location }) => {
  await authReady
  if (!getAccessToken()) {
    throw redirect({
      to: '/login',
      search: { redirect: location.href },
    })
  }
},
```

TanStack Router's `beforeLoad` supports async functions natively -- it will wait for the promise to resolve before rendering the route.
  </action>
  <verify>
    <automated>cd /Users/josh/code/glsd-server && grep -q "authReady" frontend/src/lib/api.ts && echo "authReady exported OK" && grep -q "await authReady" frontend/src/routes/dashboard/route.tsx && echo "Route guard awaits OK" && cd frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - api.ts exports authReady promise that resolves after initial refresh attempt
    - route.tsx beforeLoad awaits authReady before checking getAccessToken()
    - TypeScript compiles without errors
    - Refreshing the browser while logged in no longer redirects to /login
  </done>
</task>

</tasks>

<verification>
1. Backend changes: `grep -q "NodeTeam" backend/app/ws/handlers.py` confirms auto-assign code exists
2. Backend changes: `grep -q "300" backend/app/ws/health.py` confirms threshold increase
3. Frontend changes: `grep -q "authReady" frontend/src/lib/api.ts` confirms promise export
4. Frontend changes: `grep -q "await authReady" frontend/src/routes/dashboard/route.tsx` confirms async guard
5. Build check: `cd frontend && npx tsc --noEmit` passes
6. Build check: `npm run build` in frontend succeeds (Docker build gate)
</verification>

<success_criteria>
- New nodes registered via WebSocket are auto-assigned to the admin's team and appear in the dashboard node list
- Browser refresh while authenticated does NOT redirect to /login
- Idle nodes are not marked stale for 5 minutes (up from 90 seconds)
- Both frontend and backend build successfully
</success_criteria>

<output>
After completion, create `.planning/quick/260324-wyk-fix-node-not-visible-in-frontend-fix-log/260324-wyk-SUMMARY.md`
</output>

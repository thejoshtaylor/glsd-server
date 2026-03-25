# Phase 14: Project Management - Research

**Researched:** 2026-03-25
**Domain:** Project registration, GitHub clone, new-project bootstrap, project-scoped command dispatch
**Confidence:** HIGH

## Summary

Phase 14 introduces a Project Management layer that sits between the node (which already reports a flat `projects: string[]` in `node_register`) and the execute form (which already picks a project from that list). The work is entirely server + frontend — no node-side protocol changes.

The existing model (`Node.projects` JSON column, `NodeConnection.projects` in-memory, `ExecuteForm` select) treats projects as opaque strings reported by the node. Phase 14 needs the server to be able to _write_ projects back to the node by dispatching GSD commands (`/gsd:new-project`, git clone), and to maintain a richer server-side project registry (work_dir per project name) so that `dispatch_execute` can resolve the correct `work_dir` automatically rather than defaulting to `work_dir = project`.

Three of the four requirements (PROJ-01 connect existing, PROJ-02 clone, PROJ-03 bootstrap) dispatch GSD commands through the existing `execute` endpoint. PROJ-04 (list + project-scoped dispatch) is UI and schema work: a `Project` table, project-select in `ExecuteForm`, and auto-resolved `work_dir` on execute.

**Primary recommendation:** Add a `projects` table (node_id, name, work_dir), three project-action API endpoints (connect/clone/bootstrap), and a `ProjectManager` panel on the node detail page. Re-use `dispatch_execute` for all node-side actions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting.

### Claude's Discretion
All implementation choices are at Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | User can connect an existing folder on a node as a project | New POST `/api/projects/connect` endpoint dispatches `/gsd:new-project` (or a no-op execute) scoped to the specified path; records project row in DB |
| PROJ-02 | User can clone a GitHub repo into a chosen directory on a node | New POST `/api/projects/clone` dispatches `git clone <url> <target>` as a bash execute; records project row after success |
| PROJ-03 | User can create a new project folder and bootstrap with /gsd:new-project | New POST `/api/projects/bootstrap` dispatches `/gsd:new-project` to the node with target work_dir; records project row |
| PROJ-04 | User can see a list of projects per node with project-scoped command dispatch | `GET /api/nodes/{node_id}/projects` returns DB project list; ExecuteForm updated to resolve `work_dir` from project row instead of defaulting `work_dir = project` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy 2 async | already pinned | New `Project` ORM model + async queries | Existing pattern — all DB work uses async SQLAlchemy |
| Alembic | already pinned | Migration `0006_add_projects_table.py` | All schema changes go through numbered Alembic migrations |
| FastAPI | already pinned | Three new REST endpoints + updated schemas | Existing router pattern |
| asyncpg | already pinned | DB driver | Do not switch |
| TanStack Query | already pinned | `useQuery` for project list, `useMutation` for all three actions | All frontend API calls use this |
| Zustand | already pinned | wsStore (no new stores needed) | Existing pattern |
| shadcn/ui + Tailwind | already pinned | Dialog, Form, Input, Select components | Existing UI library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pydantic v2 | already pinned | Request/response schemas for project endpoints | All FastAPI body/response models use Pydantic |
| os.path (stdlib) | stdlib | Path normalization + `..` rejection on server | STATE.md locked decision: path validation on all work_dir input |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB project table | Store projects only in Node.projects JSON | DB table enables work_dir mapping and richer metadata; JSON column is opaque list only |
| New dispatch commands | Generic execute endpoint for all three actions | New endpoints provide clear error responses and audit log event types |

**Installation:** No new packages needed — all dependencies are already present.

## Architecture Patterns

### Recommended Project Structure

**Backend additions:**
```
backend/app/
├── models/
│   └── project.py          # NEW: Project ORM model
├── schemas/
│   └── projects.py         # NEW: request/response Pydantic models
├── routers/
│   └── projects.py         # NEW: /api/projects/* endpoints
└── services/
    └── project_service.py  # NEW: DB queries for projects
```

**Frontend additions:**
```
frontend/src/
├── components/
│   └── projects/
│       ├── ProjectManager.tsx      # NEW: panel listing projects + action buttons
│       ├── ConnectProjectDialog.tsx # NEW: modal for PROJ-01
│       ├── CloneProjectDialog.tsx   # NEW: modal for PROJ-02
│       └── BootstrapProjectDialog.tsx # NEW: modal for PROJ-03
├── types/
│   └── api.ts              # EDIT: add ProjectResponse interface
└── routes/
    └── dashboard/
        └── $nodeId.tsx     # EDIT: add ProjectManager panel to left column
```

**No new route files** — ProjectManager lives inside the existing `$nodeId.tsx` page, same as `ExecuteForm` and `InstanceList`.

### Pattern 1: DB Project Model

**What:** A `projects` table that stores one row per registered project on a node — decoupled from the `Node.projects` JSON list (which is node-reported and read-only from the server's perspective).

**When to use:** Every project registration action (connect/clone/bootstrap) writes a row here. `GET /api/nodes/{node_id}/projects` reads from this table.

```python
# backend/app/models/project.py
from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base

class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("node_id", "name", name="uq_project_node_name"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    node_id: Mapped[str] = mapped_column(String(255), ForeignKey("nodes.node_id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    work_dir: Mapped[str] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

**Key constraint:** `UniqueConstraint("node_id", "name")` — one project name per node.

### Pattern 2: Project Action Endpoints

All three action endpoints (connect/clone/bootstrap) share the same structure:
1. Validate user has team access to node (use existing `user_can_access_node`)
2. Validate/normalize `work_dir` with `os.path.normpath` and reject `..`
3. Dispatch the appropriate command to the node via `dispatch_execute` (reuses existing infrastructure)
4. Write a `Project` row to the DB (upsert on conflict for idempotency)
5. Return the `instance_id` so the frontend can watch the stream

```python
# Pattern for all three action endpoints
@router.post("/api/projects/connect", response_model=ProjectActionResponse)
async def connect_project(body: ConnectProjectRequest, current_user: CurrentUser, db: DbSession):
    # 1. validate team access
    if not await user_can_access_node(current_user.user_id, body.node_id, db):
        raise HTTPException(403, "No access to node")
    # 2. validate path
    safe_dir = _validate_work_dir(body.work_dir)  # raises ValueError on ..
    # 3. dispatch execute
    instance_id = await dispatch_execute(
        body.node_id, body.name, safe_dir, body.prompt, current_user.user_id, db
    )
    # 4. record project
    await upsert_project(body.node_id, body.name, safe_dir, db)
    return ProjectActionResponse(instance_id=instance_id)
```

**Important:** `dispatch_execute` requires `project` to be in `conn.projects` (checked at line 53 of `commands.py`). For new projects that don't yet exist on the node, we need an **escape hatch**: bypass the project check for bootstrap/connect actions OR dispatch using a GSD command as the prompt and a known-existing project (or the node's first project). The cleanest solution is a separate dispatch path for project-setup commands that skips the project membership check.

**Resolution:** Add `skip_project_check: bool = False` parameter to `dispatch_execute`, or create a separate `dispatch_project_setup` function that skips step (c) — "validate project exists on node" — since the whole point of PROJ-01/02/03 is that the project doesn't exist yet.

### Pattern 3: Path Validation (locked decision)

From STATE.md: "Path validation on all project work_dir input — `os.path.normpath` + reject `..`; never accept free-text path for dispatch."

```python
# backend/app/services/project_service.py
import os

def validate_work_dir(raw: str) -> str:
    """Normalize path and reject directory traversal attempts."""
    normalized = os.path.normpath(raw)
    if ".." in normalized.split(os.sep):
        raise ValueError(f"Invalid work_dir: directory traversal not allowed: {raw!r}")
    return normalized
```

### Pattern 4: ExecuteForm work_dir Resolution

Currently `ExecuteForm` sends `work_dir: project` (project name used as work_dir). With Phase 14, the form should:
1. Fetch projects from `GET /api/nodes/{node_id}/projects` (returns `{name, work_dir}[]`)
2. Build a `projectMap: Record<string, string>` (name → work_dir)
3. When submitting execute, use `work_dir: projectMap[project] ?? project` (graceful fallback for node-reported projects not yet in DB)

```typescript
// In ExecuteForm, resolve work_dir from project record
const projectsQuery = useQuery({
  queryKey: ['projects', node.node_id],
  queryFn: () => api<ProjectResponse[]>(`/api/nodes/${node.node_id}/projects`),
})
const projectMap = Object.fromEntries(
  (projectsQuery.data ?? []).map((p) => [p.name, p.work_dir])
)
// In mutationFn:
work_dir: projectMap[project] ?? project,  // fallback to project name for legacy
```

### Pattern 5: ProjectManager UI Component

Lives in the left column of `$nodeId.tsx`, below the `ExecuteForm` and above `InstanceList`. Uses a `Dialog` (already in `ui/`) for each action form.

```tsx
// ProjectManager.tsx layout sketch
<div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
  <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest inline-flex items-center gap-1.5">
    <FolderOpen size={20} className="text-primary" />
    Projects
  </div>
  {/* Project list */}
  <div className="space-y-1">
    {projects.map(p => <ProjectRow key={p.name} project={p} />)}
  </div>
  {/* Action buttons */}
  <div className="flex gap-2">
    <ConnectProjectDialog nodeId={nodeId} onSuccess={refetch} />
    <CloneProjectDialog nodeId={nodeId} onSuccess={refetch} />
    <BootstrapProjectDialog nodeId={nodeId} onSuccess={refetch} />
  </div>
</div>
```

### Anti-Patterns to Avoid

- **Using `Node.projects` JSON as the source of truth for work_dirs:** That field is read-only — it's what the node reports. The server-side `projects` table is the source of truth for `name → work_dir` mappings.
- **Calling `dispatch_execute` for project-setup without skipping the project membership check:** The new project isn't in `conn.projects` yet — the standard dispatch will reject it. Use a project-setup-specific dispatch path.
- **Accepting raw `work_dir` paths without normalization:** Locked decision in STATE.md. Always normalize before storing or dispatching.
- **Rolling back the project row if the execute dispatch fails:** Prefer to write the project row even if the bootstrap instance errors — the user may retry with a fresh execute. Or upsert idempotently.
- **Creating a new Zustand store for projects:** Projects are server state, not real-time WS state. TanStack Query is correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path safety | Custom regex for `..` detection | `os.path.normpath` + `split(os.sep)` check | Handles platform path separators correctly |
| Dialog forms | Custom modal | shadcn `Dialog` + existing `Input`/`Button` | Project-wide convention; already imported |
| Execute dispatch | Direct WS send | `dispatch_execute` (or a variant) | Handles connection check, instance creation, audit log |
| Team access check | Custom query | `user_can_access_node` from `node_service` | Existing, tested function |

**Key insight:** Three of the four requirements are "send a GSD command to a node and record the result" — the heavy lifting is done by existing `dispatch_execute`. The new work is the registration layer on top.

## Common Pitfalls

### Pitfall 1: Project Membership Check Blocks New Project Registration
**What goes wrong:** `dispatch_execute` checks `project not in conn.projects` (line 53 commands.py) and raises `ValueError`. New projects by definition aren't in that list yet.
**Why it happens:** The existing check protects against typos on existing nodes, but it's a blocker for create-new-project flows.
**How to avoid:** Add a `skip_project_check: bool = False` parameter to `dispatch_execute` (or extract a `dispatch_project_setup` helper) for PROJ-01/02/03 actions only. PROJ-04 (normal execute with existing project) still uses the check.
**Warning signs:** 400 Bad Request "Project not found on node" from the connect/clone/bootstrap endpoints.

### Pitfall 2: work_dir vs project Name Conflation
**What goes wrong:** `ExecuteForm` currently sends `work_dir: project` (project name = work_dir). If the actual project lives at `/home/user/my-app` but its name is `my-app`, the node gets `work_dir: "my-app"` which may not resolve correctly depending on node CWD.
**Why it happens:** Phase 13 and earlier left `work_dir` as a placeholder.
**How to avoid:** Phase 14 is the right time to fix this. `ExecuteForm` must resolve `work_dir` from the `projects` table. Maintain the `project name == work_dir` fallback for backward compatibility with node-registered projects that have no DB row yet.
**Warning signs:** Claude CLI starts in wrong directory; imports fail; file operations target wrong path.

### Pitfall 3: UniqueConstraint Violation on Re-connect
**What goes wrong:** User connects a project, node disconnects + reconnects, user connects the same project again — duplicate row error.
**Why it happens:** No upsert logic.
**How to avoid:** Use `INSERT ... ON CONFLICT (node_id, name) DO UPDATE SET work_dir = excluded.work_dir` or SQLAlchemy `merge()` pattern. Never bare `session.add()` for project rows.

### Pitfall 4: Alembic Migration Ordering
**What goes wrong:** New migration references `nodes` table but Alembic generates it before `nodes` migration.
**Why it happens:** Alembic autogenerate can mis-order when FKs cross migration files.
**How to avoid:** Name the migration `0006_add_projects_table.py` and set `down_revision = "0005_..."` explicitly. Verify FK `ondelete="CASCADE"` so orphan rows are cleaned if a node is deleted.

### Pitfall 5: Dispatching Clone as Execute Prompt
**What goes wrong:** PROJ-02 clone is implemented by sending `git clone <url> <path>` as an execute prompt. If the node's rate limiter rejects the execute, or the project name doesn't exist yet (see Pitfall 1), the clone never starts.
**Why it happens:** Clone is a "system-level" command, not a GSD command — but the only dispatch path to a node is `execute`.
**How to avoid:** Use `dispatch_project_setup` (skip project check variant). Document that the instance stream shows the git output — user watches it via the existing stream panel.

### Pitfall 6: Frontend Dialog Closes Before Stream Starts
**What goes wrong:** Action dialog (connect/clone/bootstrap) closes on success but the user has no idea where to see progress.
**Why it happens:** The action returns an `instance_id` — the user needs to select it in the stream panel.
**How to avoid:** On dialog success, call `onInstanceCreated(instance_id)` (same callback `ExecuteForm` uses) so the stream panel auto-activates with the new instance.

## Code Examples

Verified patterns from codebase:

### Alembic Migration Pattern (from 0003_auth_teams.py style)
```python
# backend/alembic/versions/0006_add_projects_table.py
revision = "0006"
down_revision = "0005_add_refresh_token_family"
# ... standard alembic header ...

def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("node_id", sa.String(255), sa.ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("work_dir", sa.String(1024), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("node_id", "name", name="uq_project_node_name"),
    )
    op.create_index("ix_projects_node_id", "projects", ["node_id"])
```

### Existing Router Pattern to Follow (from routers/nodes.py)
```python
# New router registered in main.py: app.include_router(projects.router)
router = APIRouter(prefix="/api", tags=["projects"])

@router.get("/nodes/{node_id}/projects", response_model=list[ProjectResponse])
async def list_projects(node_id: str, current_user: CurrentUser, db: DbSession):
    if not await user_can_access_node(current_user.user_id, node_id, db):
        raise HTTPException(status_code=403, detail="No access to node")
    return await project_service.list_projects_for_node(node_id, db)
```

### TanStack Query Mutation Pattern (from ExecuteForm.tsx)
```typescript
const connectMutation = useMutation({
  mutationFn: async (body: ConnectProjectRequest) =>
    api<{ instance_id: string }>('/api/projects/connect', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ['projects', nodeId] })
    onInstanceCreated(data.instance_id)
    onSuccess?.()
  },
})
```

### Dialog Pattern (shadcn Dialog — already in ui/)
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
// Use controlled open state so we can close on success
const [open, setOpen] = useState(false)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| work_dir = project name (placeholder) | work_dir resolved from projects table | Phase 14 | Enables projects in non-standard paths |
| Projects = opaque string list from node | Projects = server-registered with work_dir metadata | Phase 14 | Enables project management UI |

## Open Questions

1. **What prompt to dispatch for PROJ-01 (connect existing)?**
   - What we know: PROJ-01 just needs to "register" an existing folder. There's no meaningful Claude work to do.
   - What's unclear: Should the endpoint record the project DB row WITHOUT dispatching any execute? Or dispatch a trivial health-check command to confirm the path exists on the node?
   - Recommendation: Write the DB row immediately on connect (no execute dispatch needed). The project list updates without streaming. Only PROJ-02 (clone) and PROJ-03 (bootstrap) need execute dispatch for their side-effecting work.

2. **How to handle PROJ-02 clone when git is not installed on node?**
   - What we know: The execute runs in the node's shell — git availability depends on node environment.
   - What's unclear: No way to check pre-flight from server.
   - Recommendation: Let it fail naturally; the stream shows the error. Document in UI as "requires git on node."

3. **Should projects be team-scoped or node-scoped?**
   - What we know: Nodes are team-scoped. Projects belong to nodes.
   - Recommendation: Projects inherit node's team scope. Query for projects always joins through node access check. No separate team column on `projects` table needed.

## Environment Availability

Step 2.6: SKIPPED — Phase 14 is purely server + frontend code changes. No new external tools or services are required beyond what is already running (PostgreSQL, the existing backend).

## Validation Architecture

Validation is SKIPPED — `nyquist_validation: false` in `.planning/config.json`.

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/app/ws/commands.py` — dispatch_execute validation logic (line 53, project membership check)
- Codebase: `backend/app/models/node.py` — existing Node model with JSON `projects` column
- Codebase: `backend/app/schemas/nodes.py` — ExecuteRequest shows `work_dir: str` as separate field
- Codebase: `frontend/src/components/execute/ExecuteForm.tsx` — current `work_dir: project` placeholder
- Codebase: `.planning/STATE.md` — locked decision: path validation on all work_dir input
- Codebase: `protocol-spec.md` — `node_register.projects: []string` is node-reported, not server-writable
- Codebase: `backend/alembic/versions/` — migration numbering convention (0001–0005)

### Secondary (MEDIUM confidence)
- Pattern inference from existing router/service/model split (nodes.py → node_service.py → node.py)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — patterns are directly derived from existing code; no speculation
- Pitfalls: HIGH — Pitfall 1 (project membership check) is a concrete blocker verified in source; others from pattern analysis
- UI patterns: HIGH — shadcn Dialog + TanStack Query mutations are established in the project

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable stack — no fast-moving dependencies)

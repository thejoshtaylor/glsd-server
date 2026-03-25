---
phase: 14-project-management
verified: 2026-03-25T09:00:00Z
status: passed
score: 12/12 must-haves verified
gaps:
  - truth: "User can select a project in ExecuteForm and commands dispatch with the correct work_dir from DB"
    status: failed
    reason: "Frontend production build fails — `const projects` is declared at line 108 but referenced at line 55 via allProjects, violating block-scoped const TDZ rules (TS2448 / TS2454)"
    artifacts:
      - path: "frontend/src/components/execute/ExecuteForm.tsx"
        issue: "Line 55: `const allProjects = [...new Set([...projects, ...dbProjectNames])]` uses `projects` before it is declared. `const projects = node.projects ?? []` appears at line 108. TypeScript errors: TS2448 and TS2454."
    missing:
      - "Move `const projects = node.projects ?? []` to before line 55 (e.g., after the useState/useEffect block, before projectsQuery)"
  - truth: "ExecuteForm falls back to project name as work_dir for node-reported projects not yet in DB"
    status: failed
    reason: "Same root cause as above — the allProjects merge and projectMap[project] ?? project fallback both depend on the broken build. The logic is correct in source but the file does not compile."
    artifacts:
      - path: "frontend/src/components/execute/ExecuteForm.tsx"
        issue: "Build fails before this logic executes at runtime. Same TS2448/TS2454 error blocks compilation."
    missing:
      - "Fix the declaration order (same fix as gap 1 — one-line move resolves both)"
human_verification:
  - test: "Verify ProjectManager panel renders and all three dialogs work end-to-end in browser"
    expected: "Connect shows project in list with no stream; Clone and Bootstrap show stream output; duplicate connect upserts without error"
    why_human: "Requires live node connection, DB migration applied, and browser interaction to verify"
  - test: "Verify ExecuteForm dispatches with correct work_dir after fix is applied"
    expected: "After selecting a DB-registered project, the execute POST body contains the DB work_dir, not the project name"
    why_human: "Requires live backend with projects in DB and a connected node to observe the dispatched payload"
---

# Phase 14: Project Management Verification Report

**Phase Goal:** Users can register GSD projects on nodes and dispatch commands scoped to a project
**Verified:** 2026-03-25T09:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/projects/connect creates a project row without dispatching execute | VERIFIED | `routers/projects.py` line 56-59: returns `instance_id=None`, no `dispatch_execute` call |
| 2 | POST /api/projects/clone dispatches git clone via execute and records project | VERIFIED | `routers/projects.py` line 77-100: builds `git clone {repo_url} {safe_dir}` prompt, calls `dispatch_execute(..., skip_project_check=True)`, then `upsert_project` |
| 3 | POST /api/projects/bootstrap dispatches /gsd:new-project via execute and records project | VERIFIED | `routers/projects.py` line 118-141: `prompt = "/gsd:new-project"`, calls `dispatch_execute(..., skip_project_check=True)`, then `upsert_project` |
| 4 | GET /api/nodes/{node_id}/projects returns project list from DB | VERIFIED | `routers/projects.py` line 27-37: calls `list_projects_for_node`, returns `list[ProjectResponse]` |
| 5 | All work_dir inputs are validated with os.path.normpath and .. rejection | VERIFIED | `services/project_service.py` line 18-26: `normalized = os.path.normpath(raw)`, `if ".." in normalized.split(os.sep): raise ValueError` |
| 6 | dispatch_execute with skip_project_check=True bypasses conn.projects membership check | VERIFIED | `ws/commands.py` line 58: `if not skip_project_check and project not in conn.projects:` |
| 7 | User can see a list of registered projects in the ProjectManager panel | VERIFIED | `ProjectManager.tsx` uses `useQuery(['projects', nodeId])` fetching from `/api/nodes/${nodeId}/projects`, renders each `p.name` and `p.work_dir` |
| 8 | User can connect an existing folder as a project via dialog | VERIFIED | `ConnectProjectDialog.tsx`: `useMutation` POSTs to `/api/projects/connect` with `{node_id, name, work_dir}`, calls `onSuccess` + invalidates query |
| 9 | User can clone a GitHub repo via dialog and watch stream output | VERIFIED | `CloneProjectDialog.tsx`: includes `repo_url` field, POSTs to `/api/projects/clone`, `onSuccess` forwards `instance_id` to `onInstanceCreated` |
| 10 | User can bootstrap a new project via dialog and watch stream output | VERIFIED | `BootstrapProjectDialog.tsx`: POSTs to `/api/projects/bootstrap`, `onSuccess` forwards `instance_id` |
| 11 | User can select a project in ExecuteForm and commands dispatch with the correct work_dir from DB | FAILED | Build error: `const projects` declared at line 108, referenced at line 55 — TypeScript TS2448/TS2454 |
| 12 | ExecuteForm falls back to project name as work_dir for node-reported projects not yet in DB | FAILED | Same root cause — `npm run build` exits non-zero due to TS2448/TS2454 in `ExecuteForm.tsx` |

**Score:** 10/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/models/project.py` | Project ORM model with UniqueConstraint(node_id, name) | VERIFIED | `class Project(Base)`, `__tablename__ = "projects"`, `UniqueConstraint("node_id", "name", name="uq_project_node_name")`, `ForeignKey("nodes.node_id", ondelete="CASCADE")` |
| `backend/alembic/versions/0006_add_projects_table.py` | Alembic migration creating projects table | VERIFIED | `revision = "0006"`, `down_revision = "0005"`, `op.create_table("projects", ...)`, `UniqueConstraint("node_id", "name", name="uq_project_node_name")`, index `ix_projects_node_id` |
| `backend/app/schemas/projects.py` | Pydantic request/response models | VERIFIED | All five classes present: `ConnectProjectRequest`, `CloneProjectRequest`, `BootstrapProjectRequest`, `ProjectResponse`, `ProjectActionResponse` |
| `backend/app/services/project_service.py` | DB queries for project CRUD and path validation | VERIFIED | `validate_work_dir`, `upsert_project` (pg INSERT ON CONFLICT), `list_projects_for_node` all present and substantive |
| `backend/app/routers/projects.py` | REST endpoints for project management | VERIFIED | `router = APIRouter(prefix="/api", tags=["projects"])`, 4 routes wired |
| `frontend/src/types/api.ts` | ProjectResponse interface | VERIFIED | `export interface ProjectResponse` at line 51, `export interface ProjectActionResponse` at line 59 |
| `frontend/src/components/projects/ProjectManager.tsx` | Panel listing projects with action buttons | VERIFIED | `export function ProjectManager`, `useQuery`, `queryKey: ['projects', nodeId]`, three dialogs rendered |
| `frontend/src/components/projects/ConnectProjectDialog.tsx` | Dialog form for connecting existing folder | VERIFIED | `export function ConnectProjectDialog`, `useMutation`, `/api/projects/connect` |
| `frontend/src/components/projects/CloneProjectDialog.tsx` | Dialog form for cloning a repo | VERIFIED | `export function CloneProjectDialog`, `useMutation`, `/api/projects/clone`, `repo_url` field |
| `frontend/src/components/projects/BootstrapProjectDialog.tsx` | Dialog form for bootstrapping new project | VERIFIED | `export function BootstrapProjectDialog`, `useMutation`, `/api/projects/bootstrap` |
| `frontend/src/components/execute/ExecuteForm.tsx` | Updated project select using DB projects with work_dir resolution | STUB/BROKEN | `projectsQuery`, `projectMap`, `projectMap[project] ?? project`, `allProjects` all present — but `const projects` declared at line 108 is used at line 55, causing TS2448/TS2454 build failure |
| `frontend/src/routes/dashboard/$nodeId.tsx` | ProjectManager panel integrated in left column | VERIFIED | `import { ProjectManager }` at line 8, `<ProjectManager nodeId={nodeId} onInstanceCreated={handleInstanceCreated} />` between ExecuteForm and Instances |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `routers/projects.py` | `ws/commands.py` | `dispatch_execute` with `skip_project_check=True` | WIRED | Lines 86 and 120: `dispatch_execute(..., skip_project_check=True)` present in both clone and bootstrap handlers |
| `routers/projects.py` | `services/project_service.py` | `upsert_project` and `list_projects_for_node` | WIRED | Both imported at lines 15-19, called in all four endpoints |
| `main.py` | `routers/projects.py` | `app.include_router(projects.router)` | WIRED | Line 9: `from app.routers import ... projects`, line 44: `app.include_router(projects.router)` |
| `ProjectManager.tsx` | `/api/nodes/{node_id}/projects` | `useQuery` with `queryKey ['projects', nodeId]` | WIRED | Line 17: `useQuery({ queryKey: ['projects', nodeId], queryFn: () => api(...) })` |
| `ConnectProjectDialog.tsx` | `/api/projects/connect` | `useMutation` POST | WIRED | Line 29: `api<ProjectActionResponse>('/api/projects/connect', { method: 'POST', ... })` |
| `$nodeId.tsx` | `ProjectManager.tsx` | import and render in left panel | WIRED | Line 8: `import { ProjectManager }`, line 124-127: `<ProjectManager nodeId={nodeId} onInstanceCreated={handleInstanceCreated} />` |
| `ExecuteForm.tsx` | `/api/nodes/{node_id}/projects` | `projectMap` for work_dir resolution | BROKEN | Code is present but file does not compile — `projects` used before declaration prevents build |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `ProjectManager.tsx` | `projects` (from `useQuery`) | `GET /api/nodes/${nodeId}/projects` → `list_projects_for_node` → `SELECT FROM projects WHERE node_id = ?` | Yes — `select(Project).where(...)` with real DB query | FLOWING |
| `ExecuteForm.tsx` | `projectMap` (from `projectsQuery`) | Same endpoint as above | Yes — source is real — but file does not compile | BROKEN |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend module imports without error | `python -c "from app.routers.projects import router"` | Not run (no Python env invoked) | SKIPPED — static analysis sufficient |
| Frontend build passes | `npm run build` | Exit non-zero; `TS2448: Block-scoped variable 'projects' used before its declaration` at `ExecuteForm.tsx:55` | FAIL |
| TypeScript strict check | `npx tsc --noEmit` | Exit 0 (no output) | PASS |

Note: `tsc --noEmit` passed but `tsc -b && vite build` failed. The `tsconfig` used by `tsc --noEmit` is more permissive than the project build config (`tsc -b`). The build is the authoritative check.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PROJ-01 | 14-01, 14-02 | User can connect an existing folder on a node as a project | SATISFIED | `POST /api/projects/connect` creates DB row; `ConnectProjectDialog` POSTs to it; ProjectManager lists result |
| PROJ-02 | 14-01, 14-02 | User can clone a GitHub repo into a chosen directory on a node | SATISFIED | `POST /api/projects/clone` dispatches `git clone`; `CloneProjectDialog` provides repo_url field; stream instance returned |
| PROJ-03 | 14-01, 14-02 | User can create a new project folder and bootstrap with /gsd:new-project | SATISFIED | `POST /api/projects/bootstrap` dispatches `/gsd:new-project`; `BootstrapProjectDialog` POSTs to it |
| PROJ-04 | 14-01, 14-02 | User can see a list of projects per node with project-scoped command dispatch | PARTIAL | Project list renders in ProjectManager (VERIFIED). Project-scoped dispatch via `projectMap[project] ?? work_dir` is implemented but blocked by build failure in `ExecuteForm.tsx` |

All four requirement IDs from both PLANs are accounted for. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/components/execute/ExecuteForm.tsx` | 55 | `const allProjects = [...new Set([...projects, ...])]` — `projects` not yet declared | Blocker | Prevents frontend production build; PROJ-04 project-scoped dispatch is non-functional |

### Human Verification Required

#### 1. Full Project Management UI Flow

**Test:** Apply migration (`cd backend && alembic upgrade head`), start backend and frontend, navigate to a node detail page.
1. Confirm ProjectManager panel appears between ExecuteForm and Instances in the left column.
2. Click Connect, fill name + work_dir, submit. Confirm project appears in list immediately with no stream started.
3. Click Clone, fill name + work_dir + repo_url, submit. Confirm an instance stream starts with git clone output.
4. Click New, fill name + work_dir, submit. Confirm an instance stream starts with /gsd:new-project output.
5. Register the same project name twice via Connect. Confirm no duplicate error (upsert behavior).

**Expected:** All five steps complete without errors; project list updates after each action.
**Why human:** Requires live node, DB migration, and browser interaction.

#### 2. ExecuteForm work_dir dispatch (after fix)

**Test:** After fixing the `projects` declaration order in `ExecuteForm.tsx`, run a command with a DB-registered project selected.
**Expected:** The execute POST body contains `work_dir` equal to the DB-stored path, not just the project name. Verify by observing the network request or backend log.
**Why human:** Requires a connected node and DB project row to observe the dispatched payload.

### Gaps Summary

One build-breaking bug was found in `frontend/src/components/execute/ExecuteForm.tsx`. The `const projects = node.projects ?? []` declaration at line 108 is referenced at line 55 (`const allProjects = [...new Set([...projects, ...dbProjectNames])]`). In JavaScript/TypeScript, `const` bindings are not hoisted — this violates the temporal dead zone rule and produces TypeScript errors TS2448 and TS2454.

The fix is a single-line move: relocate `const projects = node.projects ?? []` to before the `projectsQuery` declaration (i.e., before line 45). The `allProjects` merge logic, `projectMap` construction, and `projectMap[project] ?? project` fallback in `executeMutation` are all correctly written — the declaration order is the only issue.

This one bug accounts for both failing truths (#11 and #12) and blocks PROJ-04's project-scoped dispatch. All backend code (Plans 01) is fully verified. All other frontend components (ProjectManager, three dialogs, route integration) are verified. The overall backend layer is production-ready.

---

_Verified: 2026-03-25T09:00:00Z_
_Verifier: Claude (gsd-verifier)_

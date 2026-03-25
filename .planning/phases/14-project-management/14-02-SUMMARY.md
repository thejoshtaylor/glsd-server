---
phase: 14-project-management
plan: 02
subsystem: frontend
tags: [react, tanstack-query, shadcn, base-ui, project-management]

# Dependency graph
requires:
  - phase: 14-project-management
    plan: 01
    provides: REST endpoints for project management (connect/clone/bootstrap), ProjectResponse schema
  - phase: 11-extended-sessions
    provides: JWT auth, api() helper with token refresh
provides:
  - ProjectResponse and ProjectActionResponse TypeScript interfaces in frontend/src/types/api.ts
  - ProjectManager panel component with useQuery project list and three action dialogs
  - ConnectProjectDialog posting to /api/projects/connect
  - CloneProjectDialog posting to /api/projects/clone
  - BootstrapProjectDialog posting to /api/projects/bootstrap
  - ExecuteForm work_dir resolution via projectMap from DB (with fallback to project name)
  - ProjectManager integrated into node detail page left column
affects: [execute-form, node-detail-page, project-management-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useQuery with queryKey ['projects', nodeId] for project list fetching"
    - "useMutation + onSuccess callback invalidating projects query and forwarding instance_id"
    - "projectMap = Object.fromEntries(projects.map(p => [p.name, p.work_dir])) for work_dir resolution"
    - "allProjects = [...new Set([...nodeProjects, ...dbProjects])] to merge node-reported and DB projects"
    - "base-ui DialogTrigger render prop for custom trigger composition"

key-files:
  created:
    - frontend/src/components/projects/ProjectManager.tsx
    - frontend/src/components/projects/ConnectProjectDialog.tsx
    - frontend/src/components/projects/CloneProjectDialog.tsx
    - frontend/src/components/projects/BootstrapProjectDialog.tsx
  modified:
    - frontend/src/types/api.ts
    - frontend/src/lib/icons.ts
    - frontend/src/components/execute/ExecuteForm.tsx
    - frontend/src/routes/dashboard/$nodeId.tsx

key-decisions:
  - "Icons FolderOpen, GitBranch, Link, FolderPlus added to icons.ts barrel — required for project management UI (Lucide via icons.ts barrel rule)"
  - "allProjects merges node.projects and DB projects so ExecuteForm shows all available projects regardless of registration source"
  - "projectMap[project] ?? project fallback ensures backward compatibility: node-reported projects without DB rows still dispatch correctly"

requirements-completed: [PROJ-01, PROJ-02, PROJ-03, PROJ-04]

# Metrics
duration: 8min
completed: 2026-03-25
---

# Phase 14 Plan 02: Project Management Frontend Summary

**React project management UI with ProjectManager panel, three action dialogs (connect/clone/bootstrap), and ExecuteForm work_dir resolution from DB via projectMap with fallback**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-25T08:31:00Z
- **Completed:** 2026-03-25T08:39:58Z
- **Tasks:** 2 auto + 1 checkpoint (human-verify)
- **Files modified:** 8

## Accomplishments

- `ProjectResponse` and `ProjectActionResponse` TypeScript interfaces added to `frontend/src/types/api.ts`
- `FolderOpen`, `GitBranch`, `Link`, `FolderPlus` icons added to `icons.ts` barrel (following Lucide barrel import rule)
- `ProjectManager` panel: renders project list from `GET /api/nodes/{nodeId}/projects`, shows empty state, and renders three action dialog buttons
- `ConnectProjectDialog`: form (name + work_dir), posts to `/api/projects/connect`, `instance_id` is null so no stream triggered
- `CloneProjectDialog`: form (name + work_dir + repo_url), posts to `/api/projects/clone`, `instance_id` triggers `onInstanceCreated`
- `BootstrapProjectDialog`: form (name + work_dir), posts to `/api/projects/bootstrap`, `instance_id` triggers `onInstanceCreated`
- `ExecuteForm` updated: `projectsQuery` fetches DB projects, `projectMap` resolves `work_dir` from DB, `allProjects` merges node-reported and DB projects for unified select, `work_dir: projectMap[project] ?? project` in mutation
- `ProjectManager` integrated into node detail page between ExecuteForm and InstanceList
- TypeScript compilation: zero errors
- Frontend production build: success

## Task Commits

1. **Task 1: Types, ProjectManager panel, and three dialog components** - `024bb81` (feat)
2. **Task 2: Update ExecuteForm work_dir resolution and integrate ProjectManager** - `e04402d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `frontend/src/types/api.ts` — Added ProjectResponse and ProjectActionResponse interfaces
- `frontend/src/lib/icons.ts` — Added FolderOpen, GitBranch, Link, FolderPlus exports
- `frontend/src/components/projects/ProjectManager.tsx` — Project list panel with useQuery and three dialogs
- `frontend/src/components/projects/ConnectProjectDialog.tsx` — Dialog for connecting existing folder
- `frontend/src/components/projects/CloneProjectDialog.tsx` — Dialog for cloning a repo (includes repo_url field)
- `frontend/src/components/projects/BootstrapProjectDialog.tsx` — Dialog for bootstrapping new project
- `frontend/src/components/execute/ExecuteForm.tsx` — Added projectsQuery, projectMap, allProjects, updated work_dir dispatch
- `frontend/src/routes/dashboard/$nodeId.tsx` — Imported and rendered ProjectManager in left panel

## Decisions Made

- Icons added to `icons.ts` barrel rather than importing directly from `lucide-react` — per STATE.md locked decision: "Lucide imports via src/lib/icons.ts"
- `allProjects` merges `node.projects` (node-reported) and DB projects: users can select projects that are registered in DB but not yet reported by node (e.g., just connected/bootstrapped)
- `projectMap[project] ?? project` fallback: ensures node-reported projects without a DB row (legacy workflow) still dispatch without breaking

## Deviations from Plan

None - plan executed exactly as written. Icons were anticipated as missing from the plan note ("verify available icons before using — if not available use appropriate alternatives") and were added to icons.ts barrel per project convention rather than importing directly.

## Known Stubs

None - all data is wired to live API endpoints. ProjectManager calls `GET /api/nodes/{nodeId}/projects`, dialogs POST to their respective endpoints. ExecuteForm resolves work_dir from DB via projectMap.

## Checkpoint: Task 3 (human-verify)

Task 3 is a `checkpoint:human-verify` gate. Automated work (Tasks 1 and 2) is complete. The user must manually verify the project management UI works end-to-end in the browser per the Task 3 checklist in the plan.

## Self-Check: PASSED

- FOUND: frontend/src/types/api.ts
- FOUND: frontend/src/components/projects/ProjectManager.tsx
- FOUND: frontend/src/components/projects/ConnectProjectDialog.tsx
- FOUND: frontend/src/components/projects/CloneProjectDialog.tsx
- FOUND: frontend/src/components/projects/BootstrapProjectDialog.tsx
- FOUND: .planning/phases/14-project-management/14-02-SUMMARY.md
- FOUND commit: 024bb81 (Task 1)
- FOUND commit: e04402d (Task 2)

---
*Phase: 14-project-management*
*Completed: 2026-03-25*

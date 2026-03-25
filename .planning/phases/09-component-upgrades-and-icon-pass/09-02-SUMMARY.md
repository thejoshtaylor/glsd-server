---
phase: 09-component-upgrades-and-icon-pass
plan: "02"
subsystem: frontend
tags: [cyberpunk, oklch, badges, icons, ui]
dependency_graph:
  requires: ["09-01"]
  provides: ["OKLCH badge colors with glow", "section heading icons", "action button icons", "neon FAB"]
  affects: ["frontend/src/components/nodes/NodeStatusBadge.tsx", "frontend/src/components/nodes/InstanceList.tsx", "frontend/src/components/audit/AuditTable.tsx", "frontend/src/components/stream/StreamPanel.tsx", "frontend/src/routes/dashboard/index.tsx", "frontend/src/routes/dashboard/$nodeId.tsx", "frontend/src/routes/dashboard/audit.tsx", "frontend/src/components/execute/ExecuteForm.tsx"]
tech_stack:
  added: []
  patterns: ["OKLCH arbitrary value Tailwind classes", "always-on shadow glow badges", "LucideIcon typed config record"]
key_files:
  created: []
  modified:
    - frontend/src/components/nodes/NodeStatusBadge.tsx
    - frontend/src/components/nodes/InstanceList.tsx
    - frontend/src/components/audit/AuditTable.tsx
    - frontend/src/components/stream/StreamPanel.tsx
    - frontend/src/routes/dashboard/index.tsx
    - frontend/src/routes/dashboard/$nodeId.tsx
    - frontend/src/routes/dashboard/audit.tsx
    - frontend/src/components/execute/ExecuteForm.tsx
decisions:
  - "Always-on badge glow uses inline shadow-[...] class, NOT .glow-cyan (hover-only utility)"
  - "instanceStatusConfig typed as Record<status, {Icon, className}> rather than string-only record"
  - "Resume button uses text-primary instead of text-blue-400 for palette consistency"
metrics:
  duration: "~15 minutes"
  completed: "2026-03-24"
  tasks_completed: 2
  files_modified: 8
---

# Phase 09 Plan 02: Status Badge OKLCH Upgrade and Icon Pass Summary

All dashboard status badges upgraded from raw Tailwind semantic colors to OKLCH cyberpunk palette with always-on glow shadows and paired Lucide icons; all four section headings and the Execute button now show meaningful icons; scroll FAB migrated to neon cyan.

## What Was Built

### Task 1: Upgrade status badges with OKLCH colors, icons, and always-on glow

**NodeStatusBadge.tsx** — Replaced `statusConfig` with typed `satisfies Record<...>` pattern:
- `connected`: cyan `oklch(0.75 0.18 195)` with `Activity` icon
- `stale`: amber `oklch(0.75 0.15 85)` with `Clock` icon
- `disconnected`: red `oklch(0.65 0.22 25)` with `AlertTriangle` icon
- All three statuses have always-on `shadow-[0_0_6px_1px_oklch(...)]` glow

**InstanceList.tsx** — Replaced `instanceStatusStyle` string record with `instanceStatusConfig` typed record:
- `running`: cyan with `Activity` icon
- `pending`: amber with `Clock` icon
- `finished`: muted with `CheckCircle` icon (no glow, intentional)
- `errored`: red with `AlertTriangle` icon
- Resume button migrated from `text-blue-400` to `text-primary`

**AuditTable.tsx** — Replaced `EVENT_TYPE_COLORS` with category-mapped OKLCH palette:
- `execute` (command) = cyan `oklch(0.75 0.18 195)`
- `kill` (auth action) = magenta `oklch(0.70 0.25 330)`
- `instance_finished` (system) = muted (no glow)
- `instance_error` (error) = destructive `oklch(0.65 0.22 25)`

### Task 2: Add icons to section headings, action buttons, and fix scroll FAB

- `index.tsx`: `Server` icon (size 20, text-primary) added to "Nodes" heading; `text-white` → `text-foreground`
- `$nodeId.tsx`: `Layers` icon added to "Instances" heading
- `audit.tsx`: `Shield` icon added to "Audit Log" heading
- `ExecuteForm.tsx`: `Terminal` icon added to "Execute Command" heading; `Play` icon added to Execute button
- `StreamPanel.tsx`: FAB migrated from `bg-blue-600 hover:bg-blue-500 text-white` to `bg-primary hover:bg-primary/80 text-primary-foreground glow-cyan`
- All icons imported from `@/lib/icons`, never from `lucide-react` directly

## Verification Results

- `npm run build` passes with zero errors (pre-existing size/dynamic-import warnings only)
- Zero raw Tailwind color classes (`bg-green-600`, `bg-blue-600`, etc.) in badge components
- All heading icons use `size={20}` and `className="text-primary"`
- `glow-cyan` applied to scroll FAB
- All icon imports from `@/lib/icons`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b9f8f5b | feat(09-02): upgrade status badges with OKLCH colors, icons, and always-on glow |
| 2 | d6f9c8b | feat(09-02): add icons to section headings, action buttons, and fix scroll FAB |

## Deviations from Plan

**[Deviation] Worktree merged from main before execution**

- **Found during:** Setup (before Task 1)
- **Issue:** Worktree `agent-a51d6476` was on `worktree-agent-a51d6476` branch at commit `802682a`, missing all Phase 08 and Plan 09-01 commits (including `icons.ts` creation). Plan 02 depends on Plan 01 having run.
- **Fix:** `git merge chore/cleanup-docker-expose-and-root-files --no-edit` fast-forwarded to `eb8a436` bringing in all 20 missing commits.
- **Impact:** None — fast-forward merge, no conflicts.

No other deviations. Plan executed exactly as written after the merge.

## Known Stubs

None — all badge colors and icon assignments are wired to real data.

## Self-Check: PASSED

Files verified:
- `frontend/src/components/nodes/NodeStatusBadge.tsx` — FOUND
- `frontend/src/components/nodes/InstanceList.tsx` — FOUND
- `frontend/src/components/audit/AuditTable.tsx` — FOUND
- `frontend/src/components/stream/StreamPanel.tsx` — FOUND
- `frontend/src/routes/dashboard/index.tsx` — FOUND
- `frontend/src/routes/dashboard/$nodeId.tsx` — FOUND
- `frontend/src/routes/dashboard/audit.tsx` — FOUND
- `frontend/src/components/execute/ExecuteForm.tsx` — FOUND

Commits verified:
- `b9f8f5b` — FOUND (Task 1)
- `d6f9c8b` — FOUND (Task 2)

---
phase: 09-component-upgrades-and-icon-pass
plan: "01"
subsystem: ui
tags: [react, tailwind, shadcn, lucide-react, icons, css]

requires: []
provides:
  - glow-amber and glow-red CSS utility classes in @layer utilities
  - Centralized Lucide icon barrel at frontend/src/lib/icons.ts with 21 named exports
  - dialog.tsx, tooltip.tsx, progress.tsx, tabs.tsx shadcn components
  - button.tsx default variant retains glow-cyan class
affects:
  - 09-component-upgrades-and-icon-pass
  - Any plan importing Lucide icons (must use @/lib/icons)

tech-stack:
  added: []
  patterns:
    - "Lucide icons centralized in src/lib/icons.ts — hand-authored files import from @/lib/icons, never lucide-react directly"
    - "shadcn add may overwrite button.tsx — immediately restore glow-cyan to default variant"

key-files:
  created:
    - frontend/src/lib/icons.ts
    - frontend/src/components/ui/dialog.tsx
    - frontend/src/components/ui/tooltip.tsx
    - frontend/src/components/ui/progress.tsx
    - frontend/src/components/ui/tabs.tsx
  modified:
    - frontend/src/index.css
    - frontend/src/components/ui/button.tsx
    - frontend/src/routes/dashboard/$nodeId.tsx
    - frontend/src/routes/__root.tsx
    - frontend/src/components/execute/VoiceButton.tsx
    - frontend/src/components/alerts/NewNodeAlert.tsx
    - frontend/src/components/stream/ToolUse.tsx
    - frontend/src/components/nodes/NodeCard.tsx
    - frontend/src/components/stream/StreamPanel.tsx
    - frontend/src/components/execute/KillButton.tsx
    - frontend/src/components/alerts/StaleWarning.tsx

key-decisions:
  - "icons.ts barrel imports from lucide-react directly — this is the intended pattern; only hand-authored component files are migrated away from direct lucide-react imports"
  - "shadcn add dialog overwrites button.tsx — must immediately restore glow-cyan to default variant after any dialog scaffold"

patterns-established:
  - "Icon imports: all hand-authored components use import { Icon } from '@/lib/icons'"
  - "CSS glow utilities live inside @layer utilities, NOT @theme inline"

requirements-completed: [ICN-04, CMP-05, CMP-06, CMP-07, CMP-08]

duration: 3min
completed: 2026-03-25
---

# Phase 9 Plan 01: Component Upgrades and Icon Pass Summary

**glow-amber/glow-red CSS utilities, centralized 21-icon barrel module, four scaffolded shadcn components (dialog, tooltip, progress, tabs), and project-wide Lucide import migration to @/lib/icons**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T00:05:51Z
- **Completed:** 2026-03-25T00:08:32Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Added glow-amber (oklch 0.75 0.15 85) and glow-red (oklch 0.65 0.22 25) pseudo-element glow utilities to index.css inside @layer utilities
- Created frontend/src/lib/icons.ts barrel with 21 named Lucide re-exports for all project-wide icon usage
- Scaffolded dialog, tooltip, progress, and tabs shadcn components; restored glow-cyan to button.tsx default variant after dialog scaffold overwrote it
- Migrated all 9 hand-authored component files from direct lucide-react imports to @/lib/icons

## Task Commits

Each task was committed atomically:

1. **Task 1: Add glow-amber/glow-red CSS utilities + create icons.ts barrel** - `a313527` (feat)
2. **Task 2: Scaffold 4 shadcn components and restore button.tsx glow-cyan** - `2ef7529` (feat)
3. **Task 3: Migrate all hand-authored files from lucide-react to @/lib/icons** - `ec540f0` (feat)

## Files Created/Modified

- `frontend/src/index.css` - Added glow-amber and glow-red utility classes inside @layer utilities
- `frontend/src/lib/icons.ts` - New centralized Lucide icon barrel with 21 named exports
- `frontend/src/components/ui/dialog.tsx` - New shadcn dialog component
- `frontend/src/components/ui/tooltip.tsx` - New shadcn tooltip component
- `frontend/src/components/ui/progress.tsx` - New shadcn progress component
- `frontend/src/components/ui/tabs.tsx` - New shadcn tabs component
- `frontend/src/components/ui/button.tsx` - Restored glow-cyan to default variant after shadcn overwrite
- `frontend/src/routes/dashboard/$nodeId.tsx` - Migrated ArrowLeft to @/lib/icons
- `frontend/src/routes/__root.tsx` - Migrated LogOut to @/lib/icons
- `frontend/src/components/execute/VoiceButton.tsx` - Migrated Mic, Square to @/lib/icons
- `frontend/src/components/alerts/NewNodeAlert.tsx` - Migrated X, AlertTriangle to @/lib/icons
- `frontend/src/components/stream/ToolUse.tsx` - Migrated ChevronRight, ChevronDown, Wrench to @/lib/icons
- `frontend/src/components/nodes/NodeCard.tsx` - Migrated Monitor, Clock to @/lib/icons
- `frontend/src/components/stream/StreamPanel.tsx` - Migrated ArrowDown to @/lib/icons
- `frontend/src/components/execute/KillButton.tsx` - Migrated Square to @/lib/icons
- `frontend/src/components/alerts/StaleWarning.tsx` - Migrated AlertTriangle to @/lib/icons

## Decisions Made

- icons.ts itself must import from lucide-react — this is correct; the barrel is the abstraction layer. The overall verification grep of `src/` excluding `components/ui/` still finds 1 match (icons.ts itself), which is expected and intentional.
- shadcn add dialog overwrote button.tsx — Task 2 protocol of immediately restoring glow-cyan is validated and must be repeated for any future shadcn add that touches button.tsx.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npx shadcn add dialog -y` prompted interactively about overwriting button.tsx despite the `-y` flag. Used `echo "y" | npx shadcn add dialog` to force acceptance. This is a shadcn CLI quirk — the `-y` flag does not suppress per-file overwrite prompts.

## Known Stubs

None - all exports and components are fully wired. icons.ts exports are real Lucide icons. shadcn components are fully functional scaffolds.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All foundational assets ready for downstream Phase 9 plans
- icons.ts barrel available for any new components needing Lucide icons
- glow-amber and glow-red utilities available for status badge styling
- dialog, tooltip, progress, tabs components importable from components/ui/
- Build passes with zero errors

---
*Phase: 09-component-upgrades-and-icon-pass*
*Completed: 2026-03-25*

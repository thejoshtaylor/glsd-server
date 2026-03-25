---
phase: 15-stream-intelligence-and-command-palette
plan: "02"
subsystem: frontend
tags: [command-palette, gsd-commands, protocol-types, ui]
dependency_graph:
  requires: []
  provides: [command-palette-ui, gsd-command-registry, gsd-classification-type]
  affects: [frontend/src/types/protocol.ts, frontend/src/routes/dashboard/$nodeId.tsx]
tech_stack:
  added: []
  patterns: [static-registry, inline-param-forms, dispatch-mutation-pattern]
key_files:
  created:
    - frontend/src/lib/gsdCommands.ts
    - frontend/src/components/execute/CommandPalette.tsx
  modified:
    - frontend/src/types/protocol.ts
    - frontend/src/lib/icons.ts
    - frontend/src/routes/dashboard/$nodeId.tsx
decisions:
  - "Wrapped lucide Info icon in span for title tooltip — Lucide LucideProps does not expose title attribute"
metrics:
  duration: "2m 20s"
  completed: "2026-03-25"
  tasks: 2
  files: 5
---

# Phase 15 Plan 02: GSD Command Palette and Protocol Type Extensions Summary

GSD command palette with 19 categorized commands, inline param forms, dispatch via POST /api/execute, and GsdClassification type on protocol stream_event messages.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend protocol types and create GSD command registry | 3bf1b11 | protocol.ts, gsdCommands.ts |
| 2 | Build CommandPalette component and wire into node detail page | b354f3b | CommandPalette.tsx, icons.ts, $nodeId.tsx |

## What Was Built

**GsdClassification type** — Added to `protocol.ts` as a union of `'AskUserQuestion' | 'freeform_wait' | 'completed' | null`. Extended the `stream_event` WsIncomingMessage variant with a `gsd: GsdClassification` field, making backend stream classification data available to all frontend consumers without breaking existing code.

**GSD command registry** (`gsdCommands.ts`) — Static registry of 19 GSD commands organized into 4 categories:
- Project (4): new-project, define-requirements, create-roadmap, research-phase
- Phase Lifecycle (6): discuss-phase, plan-phase, execute-phase, verify-phase, plan-phase-gaps, plan-phase-reviews
- Execution (5): execute-plan, check-plan, uat, quick, clear
- Milestone (4): retro, close-milestone, new-milestone, status

Each command has `id`, `category`, `label`, `description`, `whenToUse`, `promptTemplate` (with `{{paramKey}}` syntax), and typed `params` array. Helper `expandPrompt` performs template substitution via `replaceAll`.

**CommandPalette component** — Collapsible panel with category tab buttons, scrollable command list per category, inline param forms for parameterized commands, and dispatch button. Dispatch gated on: node connected, project selected, all required params filled. Uses same `useMutation` pattern as ExecuteForm with pendingInstanceId tracking and WS subscribe on success.

**Node detail page integration** — CommandPalette inserted between ProjectManager and Instances sections in the left panel of `$nodeId.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lucide Info icon title prop not supported**
- **Found during:** Task 2 production build
- **Issue:** `title` is not a valid prop on Lucide icon components (`LucideProps` does not include it)
- **Fix:** Wrapped `<Info>` in a `<span title={cmd.whenToUse}>` — semantically equivalent, browser tooltip works
- **Files modified:** frontend/src/components/execute/CommandPalette.tsx
- **Commit:** b354f3b

## Verification Results

1. `npx tsc --noEmit` — exits 0, no type errors
2. `npm run build` — succeeds, 632KB JS bundle (warnings are pre-existing, not introduced here)
3. `GsdClassification` type present in protocol.ts with gsd field on stream_event
4. `CommandPalette` appears 2 times in $nodeId.tsx (import + usage)
5. No `lucide-react` imports in CommandPalette.tsx
6. `GSD_COMMANDS` exported from gsdCommands.ts

## Known Stubs

None — all commands are fully defined with real promptTemplates. Dispatch wires to the live `/api/execute` endpoint.

## Self-Check: PASSED

- [x] frontend/src/types/protocol.ts — GsdClassification present
- [x] frontend/src/lib/gsdCommands.ts — 19 commands, exports verified
- [x] frontend/src/components/execute/CommandPalette.tsx — exists, exports CommandPalette
- [x] frontend/src/lib/icons.ts — Command, Rocket, Info added
- [x] frontend/src/routes/dashboard/$nodeId.tsx — CommandPalette imported and rendered
- [x] Commits 3bf1b11 and b354f3b exist in git log

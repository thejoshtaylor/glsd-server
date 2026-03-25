---
phase: 13-ux-surface
plan: "01"
subsystem: frontend
tags: [onboarding, navigation, empty-state, ux, react, tanstack-router]
dependency_graph:
  requires: []
  provides: [onboarding-page, sidebar-nav-link, node-empty-state-cta]
  affects: [frontend/src/routes/__root.tsx, frontend/src/components/nodes/NodeGrid.tsx]
tech_stack:
  added: []
  patterns: [sonner-toast, navigator-clipboard, tanstack-router-file-routes, lucide-icons-barrel]
key_files:
  created:
    - frontend/src/routes/dashboard/onboarding.tsx
  modified:
    - frontend/src/lib/icons.ts
    - frontend/src/routes/__root.tsx
    - frontend/src/components/nodes/NodeGrid.tsx
    - frontend/src/routeTree.gen.ts
decisions:
  - "Used plain Link styled with text-primary for NodeGrid empty state CTA instead of Button asChild — Button uses @base-ui/react/button which has no asChild prop"
  - "BookOpen icon added inline to onboarding page h1 for visual context alongside the page title"
metrics:
  duration: "8 minutes"
  completed: "2026-03-24"
  tasks: 2
  files: 5
---

# Phase 13 Plan 01: Onboarding Page and Navigation Links Summary

Onboarding guide page at /dashboard/onboarding with 3 step cards and copy-to-clipboard buttons, sidebar Getting Started nav link with BookOpen icon, and styled empty-state card in NodeGrid replacing plain text.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add icon exports and create onboarding page route | 4396ba4 | icons.ts, onboarding.tsx |
| 2 | Add sidebar nav link and update NodeGrid empty state | 185b9b1 | __root.tsx, NodeGrid.tsx, routeTree.gen.ts |

## What Was Built

**Onboarding page** (`/dashboard/onboarding`):
- 3 numbered step cards using shadcn Card with `border-primary/15` treatment
- Step number badges: 20px cyan circle with dark text, `aria-hidden="true"`
- Each card has a `<pre>` code block with absolute-positioned CopyButton (ghost, sm)
- CopyButton: `navigator.clipboard.writeText()` + `toast.success("Copied!")` + 2s CheckCircle swap
- Static content — no data fetching

**Sidebar nav** (`__root.tsx`):
- BookOpen icon import added to existing LogOut import
- "Getting Started" link added as third nav item with `flex items-center gap-2` layout, same styling as Dashboard/Audit Log

**NodeGrid empty state** (`NodeGrid.tsx`):
- Replaced plain text "No nodes found. Assign nodes to your teams first." with a dashed-border Card
- Server icon (24px, muted-foreground), "No nodes connected" heading, body text, "View setup guide" link

## Decisions Made

- **Plain Link for NodeGrid CTA**: Button component uses `@base-ui/react/button` which has no `asChild` prop. Used a direct `Link` styled with `text-primary hover:underline` instead — same visual intent without the composability pattern.
- **BookOpen in page h1**: Added BookOpen icon to the onboarding page heading for visual richness and to match the sidebar icon context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Button asChild not supported**
- **Found during:** Task 2
- **Issue:** The plan specified `Button variant="link" asChild` with `Link` as child, but the Button component wraps `@base-ui/react/button` which has no `asChild` prop
- **Fix:** Used `Link` directly styled with Tailwind classes (`text-sm text-primary hover:underline underline-offset-4`)
- **Files modified:** `frontend/src/components/nodes/NodeGrid.tsx`
- **Commit:** 185b9b1

## Known Stubs

None — all three step commands are real CLI commands per the design spec (static placeholder strings are intentional per 13-UI-SPEC.md).

## Self-Check: PASS

- [x] `frontend/src/routes/dashboard/onboarding.tsx` exists
- [x] `frontend/src/lib/icons.ts` contains BookOpen and Copy
- [x] `frontend/src/routes/__root.tsx` contains Getting Started link
- [x] `frontend/src/components/nodes/NodeGrid.tsx` contains "No nodes connected"
- [x] Commits 4396ba4 and 185b9b1 exist
- [x] `npx tsc --noEmit` — zero errors
- [x] `npm run build` — succeeds

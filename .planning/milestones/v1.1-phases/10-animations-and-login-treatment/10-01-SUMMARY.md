---
phase: 10-animations-and-login-treatment
plan: 01
subsystem: frontend
tags: [animations, css, ui, accessibility]
dependency_graph:
  requires: []
  provides: [ANI-01, ANI-02, ANI-03, ANI-04, ANI-05]
  affects: [frontend/src/index.css, frontend/src/components/nodes/NodeCard.tsx, frontend/src/components/stream/StreamPanel.tsx, frontend/src/components/execute/VoiceButton.tsx, frontend/src/routes/login.tsx, frontend/src/routes/dashboard/index.tsx, frontend/src/routes/dashboard/audit.tsx, frontend/src/routes/dashboard/$nodeId.tsx]
tech_stack:
  added: []
  patterns: [CSS @keyframes animation, pseudo-element opacity animation, tw-animate-css fade-in, prefers-reduced-motion media query]
key_files:
  created: []
  modified:
    - frontend/src/index.css
    - frontend/src/components/nodes/NodeCard.tsx
    - frontend/src/components/stream/StreamPanel.tsx
    - frontend/src/components/execute/VoiceButton.tsx
    - frontend/src/routes/login.tsx
    - frontend/src/routes/dashboard/index.tsx
    - frontend/src/routes/dashboard/audit.tsx
    - frontend/src/routes/dashboard/$nodeId.tsx
decisions:
  - "Pulse glow uses opacity animation on a static pseudo-element box-shadow (not direct box-shadow animation) to avoid browser compositor issues"
  - "Reduced-motion block placed as absolute last rule in index.css to ensure it overrides all previous animation declarations"
  - "Fade-in applied to individual route components, not __root.tsx Outlet, so animation fires on every navigation"
metrics:
  duration: 112s
  completed: 2026-03-25
  tasks_completed: 3
  files_modified: 8
---

# Phase 10 Plan 01: CSS Animations and Route Fade-In Summary

**One-liner:** CSS animation system with glowPulse/liveDotPulse/pulseRing/glitch keyframes applied to NodeCard, StreamPanel, VoiceButton, and all route pages with reduced-motion compliance.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add @keyframes, animation utility classes, reduced-motion block to index.css | 9a2fe0b | frontend/src/index.css |
| 2 | Apply animation classes to NodeCard, StreamPanel, VoiceButton | 67b83be | NodeCard.tsx, StreamPanel.tsx, VoiceButton.tsx |
| 3 | Add fade-in transition classes to all route component root divs | 0f9d429 | login.tsx, dashboard/index.tsx, audit.tsx, $nodeId.tsx |

## What Was Built

### Task 1: CSS Foundation (index.css)

Added to `frontend/src/index.css` after the existing `@layer utilities` block:

- **`.pulse-glow-cyan`** — pseudo-element with static box-shadow animated via opacity (glowPulse, 2s infinite)
- **`.live-dot`** — inline-block cyan dot animated via opacity (liveDotPulse, 1.5s infinite)
- **`.pulse-ring-magenta`** — pseudo-element ring that scales+fades out (pulseRing, 1s infinite)
- **`.login-card-border`** — gradient border wrapper for the login card
- **`.glitch-once`** — one-shot glitch animation class

Four `@keyframes` defined: `glowPulse`, `liveDotPulse`, `pulseRing`, `glitch`

`@media (prefers-reduced-motion: reduce)` block added as the absolute last rule.

### Task 2: Component Animations

- **NodeCard.tsx**: Added `cn` import, conditionally applies `pulse-glow-cyan` when `node.status === 'connected'`
- **StreamPanel.tsx**: Added `<span className="live-dot ml-2" aria-hidden="true" />` inside header when `isRunning`
- **VoiceButton.tsx**: Appended `pulse-ring-magenta` to recording state className string

### Task 3: Route Fade-In Transitions

Added `animate-in fade-in duration-150 fill-mode-both` to the root div of:
- `routes/login.tsx`
- `routes/dashboard/index.tsx`
- `routes/dashboard/audit.tsx`
- `routes/dashboard/$nodeId.tsx` (main content div only, not loading skeleton or error state)

`__root.tsx` and `dashboard/route.tsx` were intentionally left untouched.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All animation classes are wired up to active component state conditions.

## Self-Check: PASSED

- frontend/src/index.css modified: FOUND
- frontend/src/components/nodes/NodeCard.tsx modified: FOUND
- frontend/src/components/stream/StreamPanel.tsx modified: FOUND
- frontend/src/components/execute/VoiceButton.tsx modified: FOUND
- frontend/src/routes/login.tsx modified: FOUND
- frontend/src/routes/dashboard/index.tsx modified: FOUND
- frontend/src/routes/dashboard/audit.tsx modified: FOUND
- frontend/src/routes/dashboard/$nodeId.tsx modified: FOUND
- Commit 9a2fe0b: FOUND (Task 1)
- Commit 67b83be: FOUND (Task 2)
- Commit 0f9d429: FOUND (Task 3)
- Build succeeds: PASSED (no errors, pre-existing chunk size warning only)
- 4 @keyframes in index.css: PASSED
- Reduced-motion block is last rule: PASSED
- No animate-in in __root.tsx: PASSED
- No animate-in in dashboard/route.tsx: PASSED

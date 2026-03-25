---
phase: 16-interactive-response-and-notifications
plan: "03"
subsystem: frontend-notifications
tags: [notifications, sonner, browser-api, zustand, dashboard]
dependency_graph:
  requires: [16-01]
  provides: [notification-settings-ui, toast-triggers, browser-notification-triggers]
  affects:
    - frontend/src/hooks/useNotifications.ts
    - frontend/src/stores/wsStore.ts
    - frontend/src/components/notifications/NotificationSettings.tsx
    - frontend/src/routes/dashboard/index.tsx
    - frontend/src/lib/icons.ts
    - frontend/src/types/protocol.ts
tech_stack:
  added: []
  patterns: [sonner-toast-triggers, web-notifications-api, document-hidden-guard]
key_files:
  created:
    - frontend/src/hooks/useNotifications.ts
    - frontend/src/components/notifications/NotificationSettings.tsx
  modified:
    - frontend/src/stores/wsStore.ts
    - frontend/src/routes/dashboard/index.tsx
    - frontend/src/lib/icons.ts
    - frontend/src/types/protocol.ts
decisions:
  - "Browser notifications gated on document.hidden — no noise when tab is active"
  - "Toast triggers use gsd === 'AskUserQuestion'/'freeform_wait' equality checks — null (replays) never matches, no extra guard needed"
  - "wsStore handles all notification side-effects — no React hooks needed at message dispatch point"
metrics:
  duration: 133s
  completed: "2026-03-25"
  tasks: 2
  files: 6
requirements: [NOTF-01, NOTF-02, NOTF-03, NOTF-04]
---

# Phase 16 Plan 03: Browser Notifications and In-App Toasts Summary

Sonner toasts and Web Notifications API integration for input-needed and completion events, with permission management UI on the dashboard.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create useNotifications hook and add toast + browser notification triggers to wsStore | ed46b41 | frontend/src/hooks/useNotifications.ts, frontend/src/stores/wsStore.ts, frontend/src/types/protocol.ts |
| 2 | Create NotificationSettings component and mount on dashboard | 2e95dfd | frontend/src/components/notifications/NotificationSettings.tsx, frontend/src/routes/dashboard/index.tsx, frontend/src/lib/icons.ts |

## What Was Built

### Task 1: useNotifications hook and wsStore triggers

`useNotifications.ts` (~25 lines) provides:
- `permission` — reactive state mirroring `Notification.permission`
- `requestPermission()` — async, updates state; intended for gesture-only use
- `notify(title, body)` — fires browser notification only if `Notification.permission === 'granted'` AND `document.hidden === true`

`wsStore.ts` updated with:
- `import { toast } from 'sonner'` at top
- `stream_event` case: `toast.info('Input needed', ...)` for `AskUserQuestion` and `freeform_wait` live events; browser `new Notification(...)` when `document.hidden`
- `instance_status` case: `toast.success('Instance completed', ...)` for `finished`; `toast.error('Instance errored', ...)` for `errored`; browser `new Notification(...)` in both when `document.hidden`
- Replay guard is implicit: equality checks against `'AskUserQuestion'`/`'freeform_wait'` never match `gsd: null` replayed events

`protocol.ts` updated with `GsdClassification` type and `prompt_claimed`/`prompt_answered` incoming message types (from 16-01 — worktree was on base branch).

### Task 2: NotificationSettings component and dashboard mount

`NotificationSettings.tsx` (~45 lines):
- Renders `null` if Notification API not available (SSR safety)
- Shows `Bell` icon (text-primary) when granted, `BellOff` (text-muted) otherwise
- Three states: `granted` → green "Active" label; `denied` → "Reset in browser settings" hint; `default` → "Enable" button
- Enable button calls `requestPermission()` — user gesture only, no auto-request on mount

`icons.ts` — `Bell` and `BellOff` added to the barrel export.

`dashboard/index.tsx` — `<NotificationSettings />` mounted between `<NewNodeAlerts />` and the Nodes heading.

## Deviations from Plan

### Auto-applied from 16-01

The worktree was based on `origin/main` which did not include the 16-01 changes (protocol.ts GsdClassification type, wsStore promptStates). These were applied as part of Task 1 since they are prerequisites for the `gsd` field comparison in wsStore toast triggers.

Files affected: `frontend/src/types/protocol.ts` (GsdClassification, prompt_claimed, prompt_answered, claim_prompt, submit_answer types), `frontend/src/stores/wsStore.ts` (promptStates slice, setPromptState, clearPromptState, prompt_claimed/prompt_answered switch cases).

## Known Stubs

None. All notification triggers are wired to real WebSocket events. The `freeform_wait` classification is stubbed in the backend classifier (per 16-01 SUMMARY), but the frontend code correctly handles `gsd === 'freeform_wait'` — it will activate when the backend stub is enabled.

## Self-Check: PASSED

- `frontend/src/hooks/useNotifications.ts` — exists
- `frontend/src/components/notifications/NotificationSettings.tsx` — exists
- Task commits ed46b41 and 2e95dfd confirmed in git log
- TypeScript: 0 errors
- toast triggers: 4 (`toast.info` x2, `toast.success` x1, `toast.error` x1)
- browser Notification triggers: 4 (one per event type)
- No toast on replays: `gsd === 'AskUserQuestion'` equality check confirmed

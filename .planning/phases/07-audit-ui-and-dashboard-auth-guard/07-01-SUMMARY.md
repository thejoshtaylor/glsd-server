---
phase: 07-audit-ui-and-dashboard-auth-guard
plan: 01
subsystem: frontend
tags: [auth, routing, ui-components, tanstack-router]
dependency_graph:
  requires: []
  provides: [dashboard-auth-guard, shadcn-table-select-skeleton, audit-log-type]
  affects: [frontend/src/routes/dashboard, frontend/src/lib/api, frontend/src/routes/login]
tech_stack:
  added: []
  patterns: [tanstack-router-beforeload-guard, shadcn-ui-components, 401-interceptor]
key_files:
  created:
    - frontend/src/routes/dashboard/route.tsx
    - frontend/src/components/ui/table.tsx
    - frontend/src/components/ui/select.tsx
    - frontend/src/components/ui/skeleton.tsx
  modified:
    - frontend/src/routes/login.tsx
    - frontend/src/lib/api.ts
    - frontend/src/types/api.ts
decisions:
  - "Use window.location.href for 401 redirect in api.ts to avoid importing TanStack Router into API utility"
  - "TanStack Router layout route (route.tsx) provides beforeLoad guard for all /dashboard/* children"
metrics:
  duration: ~8 minutes
  completed: 2026-03-23
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 7 Plan 1: Auth Guard and UI Components Summary

**One-liner:** Dashboard auth guard via TanStack Router beforeLoad with 401 interceptor, redirect-after-login, and shadcn Table/Select/Skeleton components installed.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Install shadcn Table, Select, Skeleton UI components | af7131d |
| 2 | Add dashboard auth guard, 401 interceptor, login redirect support | 1a85d78 |

## What Was Built

### Task 1: shadcn UI Components

Installed three shadcn/ui components needed by Plan 02 (audit page):
- `frontend/src/components/ui/table.tsx` — Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption
- `frontend/src/components/ui/select.tsx` — Select, SelectContent, SelectItem, SelectTrigger, SelectValue
- `frontend/src/components/ui/skeleton.tsx` — Skeleton

### Task 2: Auth Guard and Interceptors

**`frontend/src/routes/dashboard/route.tsx`** (new) — TanStack Router layout route with `beforeLoad` guard. Runs before any `/dashboard/*` child route renders. If no access token is present, throws `redirect` to `/login?redirect=<original_url>`.

**`frontend/src/routes/login.tsx`** (updated) — Added `validateSearch` to parse `{ redirect?: string }` from URL params. After successful login, navigates to `search.redirect || '/dashboard'` to return user to their intended destination.

**`frontend/src/lib/api.ts`** (updated) — Added 401 interceptor after the refresh token attempt. If both the original request and refresh fail with 401, `clearTokens()` is called and `window.location.href = '/login'` redirects the user. Uses `window.location.href` to avoid importing router into the API utility layer.

**`frontend/src/types/api.ts`** (updated) — Added `AuditLogResponse` interface matching the backend `AuditLogResponse` Pydantic schema for use in Plan 02.

## Verification

- TypeScript compilation: `npx tsc --noEmit` exits 0 (no errors)
- All three shadcn component files confirmed present
- `route.tsx` contains `beforeLoad` with `getAccessToken()` check and `throw redirect`
- `login.tsx` contains `validateSearch` and `Route.useSearch()` with `search.redirect` usage
- `api.ts` contains `if (res.status === 401)` block calling `clearTokens()` and redirecting

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functionality fully wired.

## Self-Check: PASSED

- `frontend/src/routes/dashboard/route.tsx` — FOUND
- `frontend/src/components/ui/table.tsx` — FOUND
- `frontend/src/components/ui/select.tsx` — FOUND
- `frontend/src/components/ui/skeleton.tsx` — FOUND
- Commit af7131d — FOUND
- Commit 1a85d78 — FOUND

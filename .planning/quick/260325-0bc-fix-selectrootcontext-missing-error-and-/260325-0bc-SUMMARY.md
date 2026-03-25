---
plan: 260325-0bc
status: complete
one_liner: "Replace unwrapped SelectTrigger/SelectValue with plain div to fix SelectRootContext error"
key-files:
  modified:
    - frontend/src/components/execute/ExecuteForm.tsx
---

# Quick Task 260325-0bc: Fix SelectRootContext Missing Error

## Problem

`ExecuteForm.tsx` lines 111-114 rendered `<SelectTrigger>` and `<SelectValue>` (Base UI components requiring `Select.Root` context) **outside** of a `<Select>` wrapper when `projects.length === 0`. This caused the runtime error:

> Base UI: SelectRootContext is missing. Select parts must be placed within \<Select.Root\>.

## Fix

Replaced the unwrapped Select parts with a plain styled `<div>` matching the select trigger appearance. No Select machinery is needed when there are no projects to choose from.

## Frontend Audit

All other Base UI component usages checked — no similar issues found:

| Component | Files Using It | Status |
|-----------|---------------|--------|
| Select | ExecuteForm.tsx, AuditFilters.tsx | Fixed / OK |
| Dialog | dialog.tsx consumers | OK |
| Tabs | tabs.tsx consumers | OK |
| Tooltip | tooltip.tsx consumers | OK |
| Progress | progress.tsx consumers | OK |

## Verification

- `npx tsc --noEmit` passes clean

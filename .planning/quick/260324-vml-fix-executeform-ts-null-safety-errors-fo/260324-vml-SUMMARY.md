---
quick_id: 260324-vml
one_liner: "Fix null-safety TypeScript errors in ExecuteForm Select onValueChange callbacks"
status: complete
key-files:
  modified:
    - frontend/src/components/execute/ExecuteForm.tsx
---

# Quick Task 260324-vml: Fix ExecuteForm TS null-safety errors for Docker build

## What Changed

The `onValueChange` callback on Radix/shadcn `Select` components passes `string | null`, but the React `useState<string>` setters expect `string`. Docker's `tsc -b` caught this (stricter than Vite dev mode).

### ExecuteForm.tsx — 2 fixes

1. **Line 116 (Project select):** Wrapped `setProject` in a null guard: `(val) => { if (val) setProject(val); }`
2. **Line 133 (Preset select):** Added early return on null: `(val) => { if (!val) return; setPreset(val); ... }`

## Verification

- `npx tsc -b` passes with zero errors
- `npx vite build` succeeds

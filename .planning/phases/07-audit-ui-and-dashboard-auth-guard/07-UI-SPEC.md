---
status: draft
phase: 07
phase_name: audit-ui-and-dashboard-auth-guard
created: 2026-03-23
design_system: shadcn/ui + Tailwind v4 (base-nova, neutral, cssVariables)
---

# UI-SPEC: Phase 07 — Audit UI & Dashboard Auth Guard

---

## 1. Design System

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui | components.json detected |
| Style | base-nova | components.json |
| Base color | neutral | components.json |
| CSS variables | true | components.json |
| Icon library | lucide-react | components.json + __root.tsx |
| CSS framework | Tailwind v4 | src/index.css `@import "tailwindcss"` |
| Font | Geist Variable | src/index.css `@fontsource-variable/geist` |
| Mode | Dark only | __root.tsx: `bg-gray-950`, no light mode toggle |
| Third-party registries | none | components.json `"registries": {}` |

**Registry Safety Gate:** No third-party registries declared. Gate not applicable.

---

## 2. Spacing Scale

Standard 8-point scale. All spacing uses multiples of 4px only.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon internal padding, tight inline gaps |
| sm | 8px | Component internal padding (badges, pills) |
| md | 16px | Section padding, card padding (`p-4`) |
| lg | 24px | Page section padding (`p-6`) |
| xl | 32px | Major layout gaps |
| 2xl | 48px | Between major page sections |

**Established pattern (from `$nodeId.tsx`):** `p-6` (24px) page padding, `space-y-4` (16px) vertical rhythm, `gap-4` (16px) grid gaps.

**Phase-specific:** Audit table rows use `py-3 px-4` (12px / 16px). Pagination controls use `gap-2` (8px) between buttons.

---

## 3. Typography

Exactly 3 sizes, exactly 2 weights. All sourced from established codebase patterns.

| Role | Size | Weight | Line-height | Class |
|------|------|--------|-------------|-------|
| Page heading | 20px (text-xl) | semibold (600) | 1.2 | `text-xl font-semibold text-white` |
| Body / table data | 14px (text-sm) | regular (400) | 1.5 | `text-sm text-gray-200` |
| Meta / muted labels | 14px (text-sm) | regular (400) | 1.5 | `text-sm text-gray-500` |

**Note:** `text-sm font-medium text-gray-300` (14px / 500) is used for sub-section labels (e.g., "Instances" heading in `$nodeId.tsx`). Phase 07 reuses this pattern for filter labels above the audit table.

---

## 4. Color Contract

Dark-only. All values are Tailwind utility classes matching the established `bg-gray-950` shell.

### 60 / 30 / 10 Split

| Role | Proportion | Color | Usage |
|------|-----------|-------|-------|
| Dominant surface | 60% | `bg-gray-950` | Page background (root layout) |
| Secondary surface | 30% | `bg-gray-900` / `bg-gray-800` | Sidebar (`bg-gray-900`), table rows on hover (`hover:bg-gray-800`), panel backgrounds |
| Accent | 10% | `bg-gray-800` active state / shadcn `primary` token | Active nav link (`[&.active]:bg-gray-800`), focused select/input ring |

### Semantic Colors

| Semantic | Color | Reserved For |
|----------|-------|--------------|
| Muted text | `text-gray-500` | Empty state messages, column labels, metadata |
| Body text | `text-gray-200` / `text-gray-300` | Table cell values, form labels |
| Heading text | `text-white` | Page headings, node ID labels |
| Border | `border-gray-800` / `border-gray-700` | Sidebar border, panel borders |
| Destructive | shadcn `destructive` token (`oklch(0.704 0.191 22.216)` in dark) | Error event type badge background only |
| Success/info | `text-green-400` / `text-blue-400` | Instance_finished badge / execute badge (consistent with existing NodeStatusBadge pattern) |

**Accent reserved for:** Active sidebar nav link background, focused filter select ring. Not used for decorative elements.

---

## 5. Component Inventory

All components either already exist in the repo or are standard shadcn primitives. No new installs required.

### Existing — Reuse as-is

| Component | Path | Used For |
|-----------|------|----------|
| `Button` | `@/components/ui/button` | Prev/Next pagination, filter reset |
| `Badge` | `@/components/ui/badge` | Event type badge in audit table |
| `Skeleton` | shadcn (not yet installed — see below) | Loading skeleton rows |
| `Link` | `@tanstack/react-router` | "Audit" nav link in sidebar |
| `Separator` | `@/components/ui/separator` | Section dividers if needed |

### New — Install via shadcn

| Component | Install Command | Used For |
|-----------|----------------|----------|
| `Skeleton` | `npx shadcn add skeleton` | Table row loading placeholders |
| `Select` | `npx shadcn add select` | Node filter dropdown, event type filter dropdown |
| `Table` | `npx shadcn add table` | Audit log entries display |

**Registry:** Official shadcn registry only. No third-party blocks.

### New — Build in Phase

| Component | Path | Description |
|-----------|------|-------------|
| `AuditTable` | `@/components/audit/AuditTable.tsx` | Table with columns: Timestamp, Event Type, Node, Instance ID, Details |
| `AuditFilters` | `@/components/audit/AuditFilters.tsx` | Node select + event type select, side by side at top of page |
| `AuditPage` | `routes/dashboard/audit.tsx` | Route component, composes AuditFilters + AuditTable + pagination |
| `DashboardRoute` | `routes/dashboard/route.tsx` | TanStack Router layout route with `beforeLoad` auth guard |

---

## 6. Layout & Interaction Patterns

### Audit Page Layout

```
/dashboard/audit
┌─────────────────────────────────────────────┐
│  p-6                                        │
│  <h2> Audit Log </h2>  (text-xl font-semibold)
│                                             │
│  ┌─────────────┐  ┌─────────────┐          │
│  │ Node select │  │ Type select │          │
│  └─────────────┘  └─────────────┘          │
│   gap-4 between selects                    │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ AuditTable (shadcn Table)           │   │
│  │ Timestamp | Event Type | Node | ... │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ← Prev    Page N of M    Next →           │
│  (flex justify-between, mt-4)              │
└─────────────────────────────────────────────┘
```

**Table column widths:** Timestamp 160px fixed, Event Type 140px fixed, Node 160px fixed, Instance ID 280px (truncate with `truncate` class, full value on hover title), Details flex-grow.

**Node select behavior:** Node list populated from `GET /api/nodes`. First node is selected by default (not blank), since API requires `node_id`. If user has no nodes, show disabled select with "No nodes available" and empty table with empty state copy.

**Pagination controls:** `limit=25` per page. Buttons: "Previous" (disabled when `offset === 0`), "Next" (disabled when returned rows < limit). No page number display — "Showing results" muted label between buttons is sufficient.

### Auth Guard Pattern

`routes/dashboard/route.tsx` — TanStack Router layout route:

```
beforeLoad: ({ location }) => {
  if (!getAccessToken()) {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
}
```

After login success, redirect to `search.redirect` if present, else `/dashboard`.

**401 interceptor in `lib/api.ts`:** On any API response with status 401, call `clearTokens()` and `navigate({ to: '/login' })`. Applies to all existing API calls (nodes, instances, audit) without per-route handling.

### Sidebar Nav Addition

Add "Audit" link to `__root.tsx` nav block, below "Dashboard":

```tsx
<Link
  to="/dashboard/audit"
  className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white [&.active]:bg-gray-800 [&.active]:text-white"
>
  Audit
</Link>
```

Exact same class string as the "Dashboard" link — no deviation.

---

## 7. States & Interaction Contracts

### Audit Table States

| State | Visual Specification |
|-------|---------------------|
| Loading | 8 skeleton rows. Each row: 5 cells, each `<Skeleton className="h-4 w-full" />`. Row height matches data row (py-3). |
| Empty (no node selected / API returns 0 rows) | Centered in table body: `text-sm text-gray-500` "No audit entries found." Single row spanning all columns. |
| Error (API call fails) | Centered in table body: `text-sm text-red-400` "Failed to load audit log. Check your connection and try again." |
| Data | Rows render with `hover:bg-gray-800` highlight. No row selection required. |

### Event Type Badge Colors

| Event Type | Badge variant / class |
|------------|----------------------|
| `execute` | `bg-blue-500/20 text-blue-400 border-blue-500/30` |
| `kill` | `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` |
| `instance_finished` | `bg-green-500/20 text-green-400 border-green-500/30` |
| `instance_error` | `bg-red-500/20 text-red-400 border-red-500/30` |

Use inline `className` on shadcn `Badge` with `variant="outline"` as base — override color via utility classes.

### Timestamp Display

- Default: relative time string (e.g., "2 min ago", "3 hours ago") — use `date-fns` `formatDistanceToNow()` with `{ addSuffix: true }`.
- Hover: `title` attribute set to full ISO 8601 string (e.g., "2026-03-23T14:32:01Z") for native browser tooltip.
- `date-fns` is assumed available (common dep); if not present, install via `npm install date-fns`.

### Filter Interaction

- Changing either select immediately triggers a new API call (reset offset to 0).
- Both selects are controlled components bound to query params via TanStack Router `useSearch()` — URL reflects filter state so it is shareable/bookmarkable.
- Node select is required (always has a value). Event type select has "All" as the first option (maps to no `type` param in API call).

---

## 8. Copywriting Contract

### Navigation

| Element | Copy |
|---------|------|
| Sidebar nav link | `Audit` |
| Page heading | `Audit Log` |

### Filter Labels

| Element | Copy |
|---------|------|
| Node select label (sr-only) | `Filter by node` |
| Event type select label (sr-only) | `Filter by event type` |
| Event type "all" option | `All event types` |
| Node select placeholder (no nodes) | `No nodes available` |

### Empty States

| Trigger | Copy |
|---------|------|
| No rows returned from API | `No audit entries found.` |
| Node has no audit entries for selected type | `No audit entries found for this filter.` |
| User has no nodes | `No nodes found. Connect a node to see audit entries.` |

### Error States

| Trigger | Copy |
|---------|------|
| API call to GET /api/audit fails | `Failed to load audit log. Check your connection and try again.` |
| API call to GET /api/nodes fails (can't populate node select) | `Could not load nodes. Refresh the page to retry.` |

### Pagination

| Element | Copy |
|---------|------|
| Previous button | `Previous` |
| Next button | `Next` |
| Results context label | `Showing {offset + 1}–{offset + count} results` (muted, `text-sm text-gray-500`) |

### Auth Guard Redirect

No visible copy. Silent redirect preserves URL as `?redirect=` param. After login, user is returned to their intended route without any notification.

---

## 9. Accessibility

- All interactive filter controls have `aria-label` or associated `<label>` (sr-only acceptable).
- Pagination buttons have `aria-disabled="true"` (not just `disabled`) when at boundary — ensures screen readers announce the disabled state.
- Event type badge text is the full event type string, not just a color indicator.
- Skeleton rows use `aria-busy="true"` on the `<tbody>` during loading.
- Instance ID cells: full UUID in `title` attribute, display truncated to 8 chars + `…` for scannability.

---

## 10. Pre-Population Sources

| Decision | Source |
|----------|--------|
| Dark-only color scheme (bg-gray-950 root) | Codebase: `__root.tsx` |
| Sidebar nav link class pattern | Codebase: `__root.tsx` |
| p-6 page padding, space-y-4 rhythm | Codebase: `dashboard/index.tsx`, `$nodeId.tsx` |
| text-xl font-semibold heading pattern | Codebase: `$nodeId.tsx` |
| TanStack Router `beforeLoad` auth guard | CONTEXT.md decisions |
| `?redirect=` param on login redirect | CONTEXT.md decisions |
| `getAccessToken()` + `clearTokens()` from `lib/api` | CONTEXT.md code_context |
| Offset-based pagination (Next/Prev) | CONTEXT.md decisions |
| Dropdown for node + event type filter | CONTEXT.md decisions |
| Table columns: Timestamp, Event Type, Node, Instance ID, Details | CONTEXT.md decisions |
| Skeleton loading rows | CONTEXT.md decisions |
| Relative timestamps with hover full value | CONTEXT.md decisions |
| shadcn/ui component library | components.json |
| Geist Variable font | src/index.css |
| lucide-react icon library | components.json |
| No third-party registries | components.json `"registries": {}` |
| 4 event type options (execute, kill, instance_finished, instance_error) | CONTEXT.md specifics |
| `routes/dashboard/route.tsx` for guard placement | CONTEXT.md integration points |
| Node select required (API mandates node_id) | CONTEXT.md specifics |

---

## 11. Out of Scope (Deferred)

Per CONTEXT.md `<deferred>` block: none deferred from discussion. The following are additionally excluded per REQUIREMENTS.md v2/out-of-scope sections:

- Export/download of audit log (v2 enhancement)
- Real-time audit log streaming (v2 enhancement)
- Per-user audit filtering (v2 enhancement)

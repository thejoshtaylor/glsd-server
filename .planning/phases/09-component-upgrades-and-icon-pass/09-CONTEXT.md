# Phase 9: Component Upgrades and Icon Pass - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade every status badge, icon-bearing button, and data-dense component with neon colors, meaningful Lucide icons, and polished loading states. Scaffold 4 new shadcn components. After this phase, every dashboard element uses the cyberpunk palette with consistent iconography and no plain "Loading..." text.

</domain>

<decisions>
## Implementation Decisions

### Status Badge Colors & Glow
- Node status badges: Connected = `oklch(0.75 0.18 195)` (cyan), Stale = `oklch(0.75 0.15 85)` (amber), Disconnected = `oklch(0.65 0.22 25)` (red/destructive)
- Reuse `glow-cyan` from Phase 8; add `glow-amber` and `glow-red` glow utility variants in index.css
- Audit event badges: category-based colors — command=cyan, auth=magenta, error=destructive, system=muted-foreground

### Icon Strategy
- Create `src/lib/icons.ts` re-exporting Lucide icons from direct paths (per STATE.md — barrel import slows dev 5-8x)
- 2-size system: `size={16}` for inline/buttons, `size={20}` for section headings
- Standard Lucide icon mapping: Execute=Play, Kill=Square, Voice=Mic, Filter=Filter, ScrollBottom=ArrowDown

### Loading States & shadcn Components
- Use existing `skeleton.tsx` (already installed) — compose into page-specific skeleton layouts
- Scroll-to-bottom FAB: replace `bg-blue-600` with `bg-primary glow-cyan`
- Scaffold 4 shadcn components via `npx shadcn add`: dialog, tooltip, progress, tabs
- Tooltip pattern: icon-only buttons get `<Tooltip>` wrapper; text buttons do not

### Claude's Discretion
- Specific Lucide icon choices for section headings (Nodes, Instances, Audit, etc.)
- Skeleton layout composition per page (number of skeleton rows, sizing)
- Instance state badge color mapping within the established palette
- Exact placement of icons within existing component layouts

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skeleton.tsx` in `components/ui/` (already installed)
- `badge.tsx` in `components/ui/` — already used for status display
- `glow-cyan` and `glow-magenta` utilities from Phase 8 (index.css)
- `lucide-react` already in dependencies
- 10 files already import from lucide-react (scattered direct imports)

### Established Patterns
- Phase 8 cyberpunk OKLCH palette in `:root`/`.dark` CSS variables
- `@theme inline` maps `--color-*` vars for Tailwind consumption
- Existing icon imports: direct from `lucide-react` package (e.g., `import { ChevronDown } from 'lucide-react'`)
- One loading state found: `$nodeId.tsx` line 75 — plain "Loading..." text

### Integration Points
- `frontend/src/lib/icons.ts` — new barrel module to create
- `frontend/src/components/ui/` — shadcn component target directory
- `frontend/src/index.css` — add glow-amber and glow-red utilities
- All component files with existing lucide imports need migration to icons.ts

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decided strategies.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

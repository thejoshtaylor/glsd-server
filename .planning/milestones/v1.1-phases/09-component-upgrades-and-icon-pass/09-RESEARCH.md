# Phase 9: Component Upgrades and Icon Pass - Research

**Researched:** 2026-03-24
**Domain:** React/TypeScript component styling — Lucide icons, shadcn/ui scaffolding, cyberpunk badge colors, skeleton loading states
**Confidence:** HIGH

## Summary

Phase 9 is a pure frontend styling and component pass. Every piece needed already exists in the repo: `lucide-react` 1.0.1 is installed, `skeleton.tsx` and `badge.tsx` are in `components/ui/`, the cyberpunk OKLCH palette is live in `index.css`, and `glow-cyan`/`glow-magenta` utilities are defined. The four shadcn components (dialog, tooltip, progress, tabs) are not yet scaffolded but `npx shadcn add` resolves each to a single new file with no surprises — except `dialog`, which also overwrites `button.tsx` with a minor change (removes the `glow-cyan` default from the `default` variant; this must be re-applied after scaffolding).

The "direct paths" decision in STATE.md means creating `src/lib/icons.ts` as a single re-export barrel for Lucide, consolidating all scattered per-file imports into one place. `lucide-react` 1.0.1 has no subpath exports in `package.json`, so proper individual file paths (`lucide-react/icons/play`) are not available. The centralized re-export approach confines the barrel import cost to a single file that Vite's dep-optimization handles once.

Loading states are straightforward: `Skeleton` is already installed and used in `AuditTable` and `AuditFilters`. The only plain-text loading state to replace is the three "Loading…" strings in `NodeGrid`, `InstanceList`, and `$nodeId.tsx` (line 75).

**Primary recommendation:** Work file-by-file in a fixed order — (1) CSS additions, (2) icons.ts creation + migration, (3) badge color upgrades, (4) loading skeleton replacements, (5) FAB fix, (6) shadcn scaffolding. This avoids import churn on concurrent edits.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Status Badge Colors & Glow**
- Node status badges: Connected = `oklch(0.75 0.18 195)` (cyan), Stale = `oklch(0.75 0.15 85)` (amber), Disconnected = `oklch(0.65 0.22 25)` (red/destructive)
- Reuse `glow-cyan` from Phase 8; add `glow-amber` and `glow-red` glow utility variants in index.css
- Audit event badges: category-based colors — command=cyan, auth=magenta, error=destructive, system=muted-foreground

**Icon Strategy**
- Create `src/lib/icons.ts` re-exporting Lucide icons from direct paths (per STATE.md — barrel import slows dev 5-8x)
- 2-size system: `size={16}` for inline/buttons, `size={20}` for section headings
- Standard Lucide icon mapping: Execute=Play, Kill=Square, Voice=Mic, Filter=Filter, ScrollBottom=ArrowDown

**Loading States & shadcn Components**
- Use existing `skeleton.tsx` (already installed) — compose into page-specific skeleton layouts
- Scroll-to-bottom FAB: replace `bg-blue-600` with `bg-primary glow-cyan`
- Scaffold 4 shadcn components via `npx shadcn add`: dialog, tooltip, progress, tabs
- Tooltip pattern: icon-only buttons get `<Tooltip>` wrapper; text buttons do not

### Claude's Discretion
- Specific Lucide icon choices for section headings (Nodes, Instances, Audit, etc.)
- Skeleton layout composition per page (number of skeleton rows, sizing)
- Instance state badge color mapping within the established palette
- Exact placement of icons within existing component layouts

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ICN-01 | All dashboard sections have meaningful Lucide icons in headings | Section headings found in `index.tsx` ("Nodes"), `$nodeId.tsx` ("Instances", "Execute Command"), `audit.tsx` ("Audit Log"); icons.ts provides the import source |
| ICN-02 | All action buttons display relevant icons (execute, kill, voice, filter) | Execute button in `ExecuteForm` has no icon; Kill has Square; Voice has Mic/Square; Filter selects in AuditFilters have no icon; icon mapping is locked in CONTEXT.md |
| ICN-03 | All status indicators pair icons with color (instance states, node states) | `NodeStatusBadge` has color only; `InstanceList` instanceStatusStyle has color only — both need icon added alongside existing `Badge` |
| ICN-04 | Icon imports use direct paths for tree-shaking via centralized icons module | Create `src/lib/icons.ts`; migrate 10 scattered import lines across 9 files |
| CMP-01 | Node status badges use neon colors with subtle glow (cyan=connected, amber=stale, red=disconnected) | `NodeStatusBadge.tsx` uses raw Tailwind green/yellow/red — replace with OKLCH values from CONTEXT.md; add glow utility classes |
| CMP-02 | Audit event type badges use cyberpunk-themed colors | `AuditTable.tsx` EVENT_TYPE_COLORS uses raw Tailwind blue/yellow/green/red — replace with palette mapping |
| CMP-03 | Loading states use skeleton components instead of plain text | Three plain-text loading states: `NodeGrid` line 12, `InstanceList` line 26, `$nodeId.tsx` line 75 |
| CMP-04 | Stream panel scroll FAB uses neon cyan with glow instead of generic blue | `StreamPanel.tsx` line 45: `bg-blue-600 hover:bg-blue-500` → `bg-primary hover:bg-primary/80 glow-cyan` |
| CMP-05 | New shadcn dialog component available for confirmations | `npx shadcn add dialog -y` — creates dialog.tsx, overwrites button.tsx (must restore glow-cyan default) |
| CMP-06 | New shadcn tooltip component available for icon-only buttons | `npx shadcn add tooltip -y` — creates tooltip.tsx only, no overwrites |
| CMP-07 | New shadcn progress component available for loading indicators | `npx shadcn add progress -y` — creates progress.tsx only, no overwrites |
| CMP-08 | New shadcn tabs component available for view switching | `npx shadcn add tabs -y` — creates tabs.tsx only, no overwrites |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lucide-react | 1.0.1 (installed) | SVG icon set | Already in deps; shadcn's `iconLibrary` is set to `lucide` in components.json |
| shadcn (CLI) | 4.1.0 (installed) | Component scaffolding | Project uses `base-nova` style; all existing UI components came from it |
| tailwindcss | 4.2.2 (installed) | Utility classes for color/glow | Phase 8 palette already in index.css |
| class-variance-authority | 0.7.1 (installed) | Badge variant composition | Already used in badge.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @base-ui/react | 1.3.0 (installed) | Headless primitives behind shadcn | Dialog and tooltip components use it; no direct usage needed in this phase |
| tw-animate-css | 1.4.0 (installed) | CSS animation classes | Skeleton shimmer uses `animate-pulse` from Tailwind; no new animation library needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Centralized icons.ts barrel | Direct lucide-react imports per file | Direct per-file imports already exist and work — icons.ts consolidates for maintainability and confines the single barrel import cost |
| shadcn add (CLI) | Hand-rolled components | Never hand-roll — shadcn generates base-ui-backed components that match the existing style and data-slot selectors |

**Installation:** No new packages needed. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── lib/
│   └── icons.ts           # NEW — centralized Lucide re-exports
├── components/ui/
│   ├── dialog.tsx         # NEW — scaffolded by shadcn
│   ├── tooltip.tsx        # NEW — scaffolded by shadcn
│   ├── progress.tsx       # NEW — scaffolded by shadcn
│   └── tabs.tsx           # NEW — scaffolded by shadcn
├── components/nodes/
│   └── NodeStatusBadge.tsx  # EDIT — neon colors + icons
├── components/audit/
│   └── AuditTable.tsx     # EDIT — cyberpunk event colors
├── components/stream/
│   └── StreamPanel.tsx    # EDIT — FAB neon cyan fix
├── routes/dashboard/
│   ├── index.tsx          # EDIT — Nodes heading icon + skeleton
│   ├── $nodeId.tsx        # EDIT — section icons + skeleton loading
│   └── audit.tsx          # EDIT — Audit Log heading icon
└── index.css              # EDIT — add glow-amber and glow-red utilities
```

### Pattern 1: Centralized Icon Re-exports (icons.ts)

**What:** A single file that imports every Lucide icon used across the project and re-exports them. All component files import from `@/lib/icons` instead of `lucide-react` directly.

**When to use:** Always, per STATE.md locked decision.

**Why it matters:** `lucide-react` 1.0.1 has no subpath exports — there is no `lucide-react/icons/Play` path. Vite optimizes the barrel import when it comes from a single known file. With 9 source files each importing from `lucide-react`, Vite must pre-bundle the icon set 9 times during dev. Centralizing to one file means one pre-bundle pass.

**Example:**
```typescript
// src/lib/icons.ts
// All Lucide icons used project-wide — import from here, never from lucide-react directly
export {
  // Navigation
  ArrowLeft,
  ArrowDown,
  LogOut,
  // Status / badges
  Monitor,
  Clock,
  Activity,
  // Actions
  Play,         // Execute
  Square,       // Kill / Stop recording
  Mic,          // Voice
  Filter,       // Audit filter
  // Alerts
  AlertTriangle,
  X,
  // Stream / tools
  ChevronRight,
  ChevronDown,
  Wrench,
  // Section headings (Claude's discretion — examples)
  Server,       // Nodes section
  Layers,       // Instances section
  Shield,       // Audit Log section
  Terminal,     // Execute section
} from 'lucide-react'
```

### Pattern 2: Badge With Inline OKLCH Colors

**What:** Pass cyberpunk OKLCH values as className overrides on the existing `Badge` variant="outline" component.

**When to use:** All status badges — node status and audit event type.

**Example:**
```tsx
// NodeStatusBadge.tsx — connected state
<Badge variant="outline" className="bg-[oklch(0.75_0.18_195/15%)] text-[oklch(0.75_0.18_195)] border-[oklch(0.75_0.18_195/30%)] glow-cyan">
  Connected
</Badge>

// Amber (stale) — add glow-amber after adding it to index.css
<Badge variant="outline" className="bg-[oklch(0.75_0.15_85/15%)] text-[oklch(0.75_0.15_85)] border-[oklch(0.75_0.15_85/30%)] glow-amber">
  Stale
</Badge>

// Red (disconnected)
<Badge variant="outline" className="bg-[oklch(0.65_0.22_25/15%)] text-[oklch(0.65_0.22_25)] border-[oklch(0.65_0.22_25/30%)] glow-red">
  Disconnected
</Badge>
```

### Pattern 3: Glow Utility for Static Elements (no hover)

**What:** The existing `glow-cyan` is hover-only (opacity 0 → 1 on hover). Status badges need a persistent subtle glow without requiring hover. Use a static `box-shadow` class instead of the utility, or add a `glow-cyan-static` variant.

**When to use:** Status badges (always-on glow) vs. buttons (hover-triggered glow).

**Recommendation (Claude's discretion):** For badge glows, apply a direct Tailwind `shadow-[0_0_6px_1px_oklch(0.75_0.18_195/40%)]` inline class rather than the hover utility. This keeps the existing glow utilities untouched and avoids adding a proliferation of static variants. For the scroll FAB button, `glow-cyan` (hover) is appropriate.

### Pattern 4: Skeleton Loading Replacement

**What:** Replace plain "Loading…" text divs with composed `Skeleton` layouts that match the content shape.

**When to use:** Any query `isLoading` guard that currently renders plain text.

**Example:**
```tsx
// NodeGrid — was: <div className="text-muted-foreground p-6">Loading nodes...</div>
// Replace with:
import { Skeleton } from '@/components/ui/skeleton'

if (isLoading) return (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
    {[0, 1, 2].map((i) => (
      <div key={i} className="p-4 rounded-lg border border-border space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    ))}
  </div>
)
```

### Pattern 5: shadcn Dialog Button Overwrite Recovery

**What:** `npx shadcn add dialog` overwrites `button.tsx`. The diff removes `glow-cyan` from the `default` variant's className. After scaffolding dialog, the `glow-cyan` class must be manually re-added to button.tsx.

**When to use:** Immediately after running `npx shadcn add dialog`.

**The exact change to re-apply:**
```tsx
// In button.tsx, default variant should read:
default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80 glow-cyan",
// shadcn add dialog removes the trailing `glow-cyan` — add it back
```

### Anti-Patterns to Avoid

- **Using raw Tailwind color classes (bg-green-600, bg-blue-500) in status badges:** These ignore the OKLCH cyberpunk palette. Always use OKLCH values matching the Phase 8 token set.
- **Adding `glow-cyan` hover utility to badges:** Status badges need always-on glow, not hover-triggered. Use inline `shadow-[...]` with Tailwind arbitrary values.
- **Adding icons to `@theme inline`:** Never add new tokens there — only in `:root`/`.dark` raw CSS blocks (STATE.md pitfall).
- **Animating box-shadow directly:** STATE.md forbids this. The existing glow utilities use pseudo-element opacity animation.
- **Running `npx shadcn add` without `--yes` in non-interactive context:** Include `-y` flag to skip confirmation prompts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal/confirm dialogs | Custom overlay + portal | `shadcn add dialog` | base-ui Dialog handles focus trap, aria-modal, scroll lock |
| Hover tooltips | Custom positioned div | `shadcn add tooltip` | base-ui Tooltip handles positioning, overflow clipping, keyboard dismiss |
| Progress bars | Custom div with width% | `shadcn add progress` | Handles aria-valuenow, indeterminate state, accessible labeling |
| Tab panels | Custom state + divs | `shadcn add tabs` | Keyboard nav (arrow keys), aria-selected, controlled/uncontrolled modes |
| Skeleton shimmer | CSS keyframe animation | `Skeleton` (already installed) | Already in components/ui/skeleton.tsx — just compose it |

**Key insight:** All four new components are scaffolded — they exist only as importable shells in this phase. They are not wired into the UI yet; they just need to be present in `components/ui/`.

---

## Common Pitfalls

### Pitfall 1: shadcn add dialog overwrites button.tsx and removes glow-cyan
**What goes wrong:** Running `npx shadcn add dialog` silently changes the `default` variant in button.tsx — removes `glow-cyan` class. Primary buttons lose their glow.
**Why it happens:** shadcn regenerates button.tsx as a dependency of dialog; it uses its canonical source not the project's modified version.
**How to avoid:** Scaffold dialog first, then immediately check the button.tsx diff and re-add `glow-cyan` to the default variant.
**Warning signs:** After adding dialog, primary buttons no longer glow on hover.

### Pitfall 2: OKLCH arbitrary values require underscores in Tailwind v4 JIT
**What goes wrong:** Writing `bg-[oklch(0.75 0.18 195/15%)]` with spaces inside brackets causes Tailwind to fail parsing.
**Why it happens:** Tailwind's JIT parser uses spaces as class separators.
**How to avoid:** Use underscores inside brackets: `bg-[oklch(0.75_0.18_195/15%)]`
**Warning signs:** Color class generates no CSS in devtools.

### Pitfall 3: glow utility on badges inside flex containers
**What goes wrong:** `glow-cyan` uses `position: relative; isolation: isolate` and a `::after` pseudo-element at `z-index: -1`. Inside a flex or grid container with `overflow: hidden`, the pseudo-element glow may be clipped.
**Why it happens:** Badge wraps in table cells and card headers that have overflow clipping.
**How to avoid:** For badge glows, prefer inline `shadow-[...]` (box-shadow on the element itself, not a pseudo-element). The glow utilities are designed for buttons/cards, not small badges.
**Warning signs:** Glow appears cut off or invisible in certain badge positions.

### Pitfall 4: icons.ts migration breaks select.tsx (shadcn-generated file)
**What goes wrong:** `select.tsx` imports `{ ChevronDownIcon, CheckIcon, ChevronUpIcon }` from `lucide-react`. Migrating this file to icons.ts is optional — shadcn may regenerate it and restore direct imports.
**Why it happens:** shadcn-generated files are owned by shadcn; they may be overwritten on future `shadcn add` runs.
**How to avoid:** Only migrate hand-authored component files to icons.ts. Leave shadcn-generated files (`select.tsx`, `dialog.tsx`, etc.) with their own imports. The icons.ts goal is to consolidate developer-authored components.
**Warning signs:** After running `shadcn add`, select.tsx has reverted to direct lucide-react imports.

### Pitfall 5: InstanceList and NodeGrid have loading text but no prop for `isLoading`
**What goes wrong:** `NodeGrid` and `InstanceList` both have internal `isLoading` guards from `useQuery` — they can be changed directly without prop changes. But `$nodeId.tsx` line 75 uses `isLoading` from a query and renders `<div className="p-6 text-muted-foreground">Loading...</div>` — this is at the route level, not inside a component.
**Why it happens:** The route-level loading guard does not use a dedicated loading component.
**How to avoid:** Replace the inline div with a skeleton layout matching the page's content shape (3-column grid of info cards or a single card skeleton).
**Warning signs:** If only the component-level guards are updated, the route-level loading state still shows plain text.

---

## Code Examples

Verified from codebase reading (no external sources needed — all patterns are in-project):

### glow-amber and glow-red CSS utilities (add to index.css @layer utilities)
```css
/* index.css — append inside @layer utilities */
.glow-amber {
    position: relative;
    isolation: isolate;
}
.glow-amber::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    background: transparent;
    box-shadow: 0 0 8px 2px oklch(0.75 0.15 85 / 60%);
    opacity: 0;
    transition: opacity 200ms ease-out;
    pointer-events: none;
    z-index: -1;
}
.glow-amber:hover::after,
.glow-amber:focus-visible::after {
    opacity: 1;
}

.glow-red {
    position: relative;
    isolation: isolate;
}
.glow-red::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    background: transparent;
    box-shadow: 0 0 8px 2px oklch(0.65 0.22 25 / 60%);
    opacity: 0;
    transition: opacity 200ms ease-out;
    pointer-events: none;
    z-index: -1;
}
.glow-red:hover::after,
.glow-red:focus-visible::after {
    opacity: 1;
}
```

### Scroll-to-bottom FAB fix (StreamPanel.tsx)
```tsx
// Before:
className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full p-2 shadow-lg"
// After:
className="absolute bottom-4 right-4 bg-primary hover:bg-primary/80 text-primary-foreground rounded-full p-2 shadow-lg glow-cyan"
```

### shadcn scaffolding command sequence
```bash
# From frontend/ directory — scaffold all 4 components
# dialog first (it overwrites button.tsx — restore glow-cyan after)
npx shadcn add dialog -y
# Then restore glow-cyan in button.tsx default variant
npx shadcn add tooltip -y
npx shadcn add progress -y
npx shadcn add tabs -y
```

### Icon size usage
```tsx
// Section headings (size 20)
import { Server } from '@/lib/icons'
<Server size={20} className="text-primary" />

// Inline / button icons (size 16)
import { Play } from '@/lib/icons'
<Play size={16} />
// Note: existing code uses className="h-4 w-4" (16px) — either approach works
// Prefer size prop for icons.ts-sourced icons for consistency
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw Tailwind green/yellow/red for status | OKLCH cyberpunk palette | Phase 8 (complete) | Status badges currently still use old approach — this phase fixes them |
| `bg-blue-600` scroll FAB | `bg-primary glow-cyan` | This phase | FAB was added before Phase 8 palette was in place |
| Scattered `from 'lucide-react'` imports | Centralized `@/lib/icons` | This phase | No behavioral change — build/dev performance improvement |

**Deprecated in this project:**
- Raw Tailwind semantic colors (green-600, blue-500, yellow-500) for status badges: replaced by OKLCH values
- Direct per-file `from 'lucide-react'` imports in hand-authored components: centralized to icons.ts

---

## Open Questions

1. **Instance state badge color mapping**
   - What we know: `pending`, `running`, `finished`, `errored` are the four states. Current colors: pending=blue, running=green, finished=muted, errored=red.
   - What's unclear: The CONTEXT.md marks this as Claude's discretion. A sensible mapping: running=cyan (active/primary), pending=amber (waiting), finished=muted (neutral), errored=destructive.
   - Recommendation: Use running=`oklch(0.75 0.18 195)` (cyan), pending=`oklch(0.75 0.15 85)` (amber), errored=`oklch(0.65 0.22 25)` (red), finished=muted-foreground (neutral). Mirrors the node status pattern.

2. **Icon-only buttons needing Tooltip wrappers**
   - What we know: VoiceButton is icon-only with a `title` attribute (accessible but not visually polished). After CMP-06 scaffolds tooltip.tsx, CONTEXT.md says icon-only buttons get `<Tooltip>` wrappers.
   - What's unclear: Whether this phase applies tooltips or just scaffolds the component. The success criteria say "scaffolded and importable" — this phase is scaffolding only.
   - Recommendation: Scaffold tooltip.tsx. Do NOT wire up Tooltip on VoiceButton or other icon-only buttons in this phase — that is deferred to wherever those components are aesthetically polished.

---

## Environment Availability

Step 2.6: No new external dependencies. All tools (node, npm, shadcn CLI) are already confirmed available from prior phases. `npx shadcn` is accessible at version 4.1.0 in the project's devDependencies.

---

## Validation Architecture

Step 4: nyquist_validation is `false` in `.planning/config.json` — this section is skipped.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on This Phase |
|-----------|---------------------|
| Do what has been asked; nothing more | Only touch files needed for ICN-01–04 and CMP-01–08 |
| NEVER create files unless absolutely necessary | Only create `icons.ts` (required by ICN-04) and 4 shadcn components (required by CMP-05–08) |
| ALWAYS prefer editing existing files | Edit existing badge/component files; scaffold only what shadcn generates |
| v1.1 is frontend-only | No backend changes whatsoever |
| No `motion` library | All visual effects via CSS (`box-shadow`, existing glow utilities) |
| OKLCH tokens in `:root`/`.dark` only | glow-amber and glow-red go in `@layer utilities`, not `@theme inline` |
| Lucide imports via `src/lib/icons.ts` | ICN-04 requires creating this file and migrating 9 source files |
| Keep files under 500 lines | icons.ts will be ~40 lines; no file approaches 500 lines in this phase |

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reading — all findings are from actual files in the repo
  - `frontend/src/index.css` — confirmed OKLCH palette, glow-cyan/magenta patterns
  - `frontend/src/components/ui/badge.tsx` — confirmed variant structure
  - `frontend/src/components/ui/skeleton.tsx` — confirmed already installed
  - `frontend/src/components/nodes/NodeStatusBadge.tsx` — confirmed current (non-OKLCH) colors
  - `frontend/src/components/nodes/InstanceList.tsx` — confirmed loading text and status colors
  - `frontend/src/components/nodes/NodeGrid.tsx` — confirmed loading text
  - `frontend/src/components/stream/StreamPanel.tsx` — confirmed bg-blue-600 FAB
  - `frontend/src/components/audit/AuditTable.tsx` — confirmed Skeleton already used, non-OKLCH event colors
  - `frontend/src/routes/dashboard/$nodeId.tsx` — confirmed loading text at line 75
  - `frontend/package.json` — confirmed lucide-react 1.0.1, shadcn 4.1.0
  - `frontend/components.json` — confirmed base-nova style, lucide iconLibrary
- `npx shadcn add [component] --dry-run` — confirmed what each scaffold creates/overwrites
- `lucide-react/package.json` — confirmed no subpath exports, version 1.0.1

### Secondary (MEDIUM confidence)
- STATE.md decision log — "barrel import slows dev 5-8x" (project-documented observation, not externally verified in this session)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from package.json and node_modules
- Architecture: HIGH — all patterns derived from direct codebase reading
- Pitfalls: HIGH — button.tsx overwrite verified via `--diff`; other pitfalls from direct code inspection

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable libraries; shadcn and lucide-react move slowly at these versions)

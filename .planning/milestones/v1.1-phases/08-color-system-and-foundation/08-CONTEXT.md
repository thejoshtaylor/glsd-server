# Phase 8: Color System and Foundation - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the cyberpunk color palette, glow utilities, and typography tokens that all v1.1 components inherit. After this phase, every dashboard view renders with void-black background, neon cyan primaries, magenta accents, faint cyan borders, and cyberpunk typography — all via CSS custom properties in `:root`/`.dark`.

</domain>

<decisions>
## Implementation Decisions

### Color Palette Values
- Void-black background: `oklch(0.10 0.01 250)` — L=0.10 with subtle blue chroma for visible undertone
- Neon cyan primary: `oklch(0.75 0.18 195)` — classic cyberpunk cyan, high chroma, good contrast on dark
- Neon magenta accent: `oklch(0.70 0.25 330)` — hot pink-magenta, high contrast with cyan
- Faint cyan borders: `oklch(0.75 0.18 195 / 15%)` — same cyan hue at 15% opacity for subtlety

### Glow Implementation
- Technique: Pseudo-element `::after` with opacity transition (avoids box-shadow repaint per STATE.md pitfall)
- Intensity: Medium — 8px spread, 60% opacity, 200ms ease-out
- Scope: Buttons and focus rings only in Phase 8; expand in Phase 9/10 as needed
- Utility classes: `glow-cyan` and `glow-magenta`

### Typography and Font Loading
- Orbitron display font: `@fontsource-variable/orbitron` npm package (consistent with existing Geist approach)
- Monospace: System monospace stack (`ui-monospace, SFMono-Regular, ...`) — zero load cost
- Heading letter-spacing: `0.1em` for uppercase section headings
- CSS cleanup: Keep `index.css` as single source, delete duplicate `main.css`

### Claude's Discretion
- Exact derived color values for card, popover, muted, secondary, etc. in the OKLCH palette
- Chart color mapping to cyberpunk palette
- Sidebar color tuning within the established palette
- Focus ring exact glow parameters

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- shadcn components: badge, button, card, input, resizable, select, separator, skeleton, sonner, table
- `@fontsource-variable/geist` already installed and configured
- `tw-animate-css` already installed for animation utilities
- `lucide-react` already installed

### Established Patterns
- OKLCH color system already in use (shadcn default grayscale)
- CSS variables in `:root` and `.dark` blocks (matches KEY DECISION — never in `@theme inline`)
- `@theme inline` block maps `--color-*` to CSS variables for Tailwind consumption
- `@custom-variant dark (&:is(.dark *))` for dark mode
- Geist Variable as sans-serif font via `@fontsource-variable`

### Integration Points
- `frontend/src/index.css` — all CSS variables and base styles live here
- `frontend/src/main.css` — duplicate of index.css (to be removed)
- `frontend/src/main.tsx` — entry point, check which CSS file is imported
- `@theme inline` block — must add `--font-mono` and `--font-heading` mappings for new tokens

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decided palette values.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

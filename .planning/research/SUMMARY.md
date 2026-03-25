# Project Research Summary

**Project:** GLSD Server v1.1 — Cyberpunk UI Beautification
**Domain:** Visual polish and theming for an existing React 19 + shadcn/ui + Tailwind v4 operations dashboard
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

GLSD Server is a feature-complete real-time node management dashboard with a FastAPI/PostgreSQL backend and a React 19 frontend. The v1.1 milestone is a pure visual uplift: converting the existing achromatic dark theme into a cyberpunk aesthetic using the technology stack already in place. The dashboard's data layer — WebSocket node management, instance lifecycle streaming, JWT auth, audit log, voice input — is fully built and must not regress. The entire cyberpunk visual transformation can be accomplished through targeted Tailwind v4 CSS variable overrides plus two small npm installs (`motion` and `@fontsource-variable/orbitron`). No architectural changes are required.

The recommended implementation sequence is color system first, components second, animations third. This order is non-negotiable: every other visual feature references OKLCH color tokens. Doing component work before the palette is set means touching every component twice. The color system change is also the lowest-risk entry point — overriding CSS variables in `.dark` propagates automatically to all 10 existing shadcn components without per-component edits.

The primary technical risks are infrastructure-level, not aesthetic. Tailwind v4's `@theme inline` has a confirmed bug (issue #18296) where dark-mode-responsive tokens silently bake to static values if added incorrectly. Animation choices on a real-time WebSocket dashboard require discipline: box-shadow keyframe animations cause continuous repaints that stack with live data updates, and entrance animations on stream output rows will visibly jank at greater than 5 events per second. Both pitfalls have clear prevention strategies and must be addressed at the phase level, not patched after the fact.

## Key Findings

### Recommended Stack

The existing stack requires only two new npm packages for v1.1. Everything else — Tailwind v4, shadcn/ui CLI, `tw-animate-css`, `class-variance-authority`, `lucide-react` — is already installed and correctly configured. No dev tooling changes are needed.

**Core technologies:**

- **`motion` (^12.38.0):** JS-driven animation for entrance/exit, spring physics, and AnimatePresence for unmounting elements. `tw-animate-css` handles CSS class-based transitions but cannot animate unmounting DOM elements or layout shifts. Import from `"motion/react"`. React 19 explicitly supported as of Motion v12.
- **`@fontsource-variable/orbitron` (^5.x):** Display/heading font for cyberpunk typography hierarchy. The canonical futuristic typeface; variable font covers the full weight range. Pairs with existing Geist body font. Self-hosted via Fontsource, consistent with how Geist is already loaded.
- **`@fontsource-variable/jetbrains-mono` (conditional):** Monospace for stream panel output. Only needed if stream panels require improved readability — Geist is proportional and unsuitable for aligned NDJSON output.
- **Tailwind v4 OKLCH CSS variables (no install):** The entire cyberpunk color system — neon palette, glow effects, gradient text, animation keyframes — is implemented via CSS variable overrides in `index.css`. Zero new packages needed.
- **shadcn CLI (already installed):** Four new components recommended — `dialog`, `tooltip`, `progress`, `tabs` — scaffolded via `npx shadcn add`. No npm installs.

GSAP, animejs, three.js, canvas particle systems, and third-party cyberpunk CSS frameworks are explicitly ruled out. They add bundle weight, create Tailwind utility conflicts, or carry commercial licenses incompatible with a revenue product.

### Expected Features

**Must have (table stakes — without these it reads as "dark mode," not "cyberpunk"):**

- Cyberpunk OKLCH color palette — void-black background (`oklch(0.07 0.008 280)`), neon cyan primary (`oklch(0.75 0.18 195)`), magenta accent (`oklch(0.65 0.26 330)`), faint cyan borders
- Neon glow utility classes — 3-layer `box-shadow` pattern for `.glow-cyan` and `.glow-magenta` in `@layer utilities`
- Status badge neon colors — `connected` = cyan, `stale` = amber, `disconnected` = red with glow; updates to `statusConfig` in `NodeStatusBadge.tsx` and `EVENT_TYPE_COLORS` in `AuditTable.tsx`
- Monospace font token — `--font-mono` applied to stream panels, instance IDs, audit timestamps, version strings
- Full Lucide icon coverage — approximately 15 icons mapped to existing components across the dashboard (see icon map in FEATURES.md)
- NodeCard connected pulse — CSS keyframe pulsing border-glow on connected nodes using pseudo-element pattern
- Stream panel live indicator — animated dot in StreamPanel header when `isRunning`
- Loading state polish — replace bare `<div className="p-6 text-gray-400">Loading...</div>` in `$nodeId.tsx` with skeleton components
- Scroll FAB cyberpunk color fix — one-liner update in `StreamPanel.tsx` from `bg-blue-600` to neon cyan with glow

**Should have (differentiators — meaningful polish, low regression risk):**

- Typography uppercase hierarchy — section headings as uppercase + tracked letters throughout dashboard
- Page enter animations — `animate-in fade-in` via `tw-animate-css` on route transitions (150ms)
- Login page cyberpunk treatment — CSS grid background, gradient border on Card, glow on title, one-shot glitch animation on successful login
- VoiceButton recording state — pulsing magenta ring while mic is active

**Defer (v2+):**

- `motion` for scroll-linked or gesture animations — only if product adds drag-reorder interactions
- Canvas grid background — only if performance budget is confirmed adequate on target hardware
- Gradient borders on resizable panels — medium complexity, lower priority than core palette work
- Full light/dark theme switcher — not in scope; lock to `.dark` for v1.1
- Scanline overlays — acceptable only on decorative areas with no readable text layered over them
- xterm.js terminal replacement — explicitly out-of-scope per PROJECT.md; Claude CLI output is NDJSON, not PTY

### Architecture Approach

The v1.1 milestone does not touch the backend architecture. The frontend is a React 19 SPA with TanStack Router, TanStack Query for REST state, Zustand for live WebSocket state, and shadcn/ui on Tailwind v4. This architecture is stable and v1.1 changes nothing in it.

The cyberpunk visual system is implemented as a CSS-variable layer in `index.css`. All shadcn components reference `--primary`, `--accent`, `--ring`, and `--border` tokens — updating those tokens in the `.dark` block is the single highest-leverage change in the entire milestone. Component-level edits are then surgical overrides for components that have hardcoded colors outside the token system.

**Major components relevant to v1.1 visual work:**

1. **`index.css` / Tailwind theme** — color token definitions, glow utilities, keyframe animations, font registrations; the foundation everything else builds on
2. **NodeCard** — highest-visibility surface; hosts the connected pulse animation and is the primary cyberpunk showcase component
3. **StreamPanel / HistoryStreamPanel** — real-time output rendering; requires monospace font upgrade; must not have entrance animations on stream rows
4. **NodeStatusBadge / InstanceRow** — status indicators; require neon color mapping in `statusConfig` and `EVENT_TYPE_COLORS`
5. **LoginPage** — first-impression surface; priority for full cyberpunk treatment including one-shot glitch animation
6. **AuditTable / AuditFilters** — data-dense; monospace for IDs and timestamps; icon additions
7. **VoiceButton / KillButton / ExecuteForm** — action surfaces; icon additions and recording state visual feedback

### Critical Pitfalls

1. **`@theme inline` breaks dark mode for new tokens** — Adding cyberpunk OKLCH tokens to the `@theme inline` block bakes static values at build time; dark/light toggling does not propagate. Prevention: Add new tokens as raw CSS variables in `:root` and `.dark` blocks only. Use `var(--token)` or Tailwind arbitrary values (`bg-[var(--cp-neon-cyan)]`). Address in Phase 1 before any component work.

2. **Animating `box-shadow` in continuous keyframes causes repaints** — On a real-time WebSocket dashboard, painting on every animation frame visually stutters when active streams are running. Prevention: Use pseudo-element opacity animation instead. Apply static `box-shadow` to a `::before` element and animate its `opacity`. GPU-composited; zero repaint. Hover glow transitions under 200ms are acceptable as-is.

3. **shadcn `data-slot` override confusion** — The Tailwind v4 era shadcn distribution uses `data-slot` attribute selectors to style component internals. Adding `className` overrides targets the outer wrapper only. Prevention: Read component source in `src/components/ui/` before touching any shadcn component; edit the source directly as intended.

4. **Entrance animations on high-frequency stream rows** — Stream output arrives multiple times per second during active runs. Adding `AnimatePresence` mount animations to stream rows causes animation queuing and CPU spikes. Prevention: Never add mount animations to the stream output view. Motion is appropriate for node/instance lists (human-paced), dialogs, and page transitions only.

5. **Lucide barrel imports slow dev server significantly** — Importing from the `lucide-react` barrel triggers resolution of approximately 1,600 icons in Vite's dev module graph, increasing cold start from under 1 second to 5-8 seconds. Prevention: Import from direct paths (`lucide-react/icons/terminal`) and centralize via `src/lib/icons.ts`. Establish this pattern at the start of icon work.

## Implications for Roadmap

The feature set, dependency graph, and pitfall-to-phase mapping from research point clearly to a 3-phase implementation sequence. The ordering is dictated by hard dependencies: color tokens must exist before component work, component structure must be stable before layering animations.

### Phase 1: Color System and Foundation

**Rationale:** Every subsequent visual feature references OKLCH tokens. Performing any component work before the palette is set means revisiting all color decisions twice. This phase also addresses the highest-risk technical pitfall (the `@theme inline` dark mode breakage) at a point where no other code depends on it yet.

**Delivers:** Void-black background and neon cyan/magenta palette live in `.dark` block; `.glow-cyan` / `.glow-magenta` utility classes; monospace font token (`--font-mono`); Orbitron heading font wired into `@theme inline`; base typography scale (uppercase, letter-spacing on headings); skeleton shimmer color override.

**Addresses features:** Cyberpunk OKLCH palette (P1), neon glow utilities (P1), void-black background (P1), monospace font (P1), typography hierarchy (P2)

**Avoids pitfalls:** `@theme inline` dark mode breakage — establish the CSS variable strategy here before any component references tokens; gradient text accessibility — set the fallback color pattern from the start.

**Research flag:** Standard patterns. Tailwind v4 OKLCH CSS variable overrides are well-documented in official docs and the shadcn theming guide. Skip deep research.

### Phase 2: Component Upgrades and Icon Pass

**Rationale:** With the color system in place, every shadcn component referencing `--primary`, `--accent`, `--ring`, `--border` is already cyberpunk. This phase applies targeted overrides to components with hardcoded colors outside the token system, adds the full Lucide icon set via `src/lib/icons.ts`, and upgrades loading states. Each component change must be a separate commit to preserve real-time behavior isolation.

**Delivers:** Status badges with neon colors and glow; full Lucide icon coverage centralized in `src/lib/icons.ts`; NodeCard connected pulse (CSS keyframe using pseudo-element pattern); stream panel live indicator; VoiceButton recording state; scroll FAB color fix; loading skeleton replacement; login page cyberpunk treatment; shadcn `dialog`, `tooltip`, `progress`, `tabs` components added via CLI.

**Addresses features:** Status badge neon colors (P1), full icon coverage (P1), NodeCard pulse (P1), stream live indicator (P1), scroll FAB fix (P1), loading state polish (P1), VoiceButton recording state (P2), login treatment (P2)

**Avoids pitfalls:** `data-slot` confusion — read component source before each touch; real-time regressions — live node smoke test after every component commit; Lucide barrel imports — `src/lib/icons.ts` established at the start.

**Research flag:** Standard patterns for icon centralization and shadcn source editing. The login page glitch animation is the highest-complexity item; a quick reference check on CSS keyframe glitch techniques during task planning is worthwhile.

### Phase 3: Animation Layer

**Rationale:** Animations are the highest regression-risk layer. Applying them after component structure is stable means any animation bug is trivially isolated to the animation change. This phase also installs `motion` for unmount animations (dialogs, page transitions) that `tw-animate-css` cannot handle.

**Delivers:** `npm install motion`; page enter fade animations on route transitions via `tw-animate-css`; dialog open/close with AnimatePresence; NodeCard entrance animation (Motion `initial/animate`) on the node list only; full `@media (prefers-reduced-motion: no-preference)` wrapping on all keyframe animations.

**Addresses features:** Page enter animations (P2)

**Avoids pitfalls:** AnimatePresence on high-frequency stream rows — explicitly excluded in scope; box-shadow keyframe repaints — pseudo-element pattern already established in Phase 1/2; reduced motion — wrapped at the CSS layer in this phase.

**Research flag:** Standard Motion/React animation patterns. All use cases here (page transitions, list entrance, dialog) are in official docs. Skip deep research.

### Phase Ordering Rationale

- **Color before components:** The OKLCH token system is a hard dependency. Every shadcn component that references `--primary`, `--accent`, `--ring`, or `--border` benefits automatically once the `.dark` block is updated. Reversing the order means re-examining every component color decision after the palette stabilizes.
- **Components before animations:** Structural component changes can silently break Zustand store bindings, TanStack Query subscriptions, and WebSocket event handlers. Adding animation wrappers to an already-stable component structure isolates regression risk entirely to the animation layer.
- **`tw-animate-css` before `motion`:** The existing CSS animation library handles all pure CSS effects (pulse, fade, slide). Install Motion only in Phase 3 when it is actually needed for unmount animations. This keeps Phase 1 and 2 dependency surfaces minimal.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (login page glitch animation):** The one-shot CSS keyframe glitch technique is somewhat niche. A 15-minute reference pass during task planning is worthwhile to confirm timing and property choices before implementation.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Tailwind v4 CSS variable overrides and OKLCH theming are extensively documented in official docs and the shadcn theming guide.
- **Phase 2 (icon integration):** Direct-path Lucide imports and `src/lib/icons.ts` pattern are established and benchmarked in published sources.
- **Phase 3:** Motion/React animation patterns are well-documented; all required use cases are covered in the official docs.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing packages verified against `frontend/package.json`; new packages confirmed via npm registry; Motion React 19 compatibility explicitly stated in Motion v12 documentation |
| Features | HIGH | Existing codebase inspected directly; shadcn/ui + Tailwind v4 OKLCH patterns verified via official docs; cyberpunk design patterns cross-referenced across multiple sources including usability critiques |
| Architecture | HIGH | Backend architecture is stable and unchanged for this milestone; frontend component map is grounded in the actual source tree |
| Pitfalls | HIGH | `@theme inline` bug confirmed via GitHub issue #18296; animation performance claims verified against MDN and browser vendor documentation; Lucide import benchmark sourced from published measurement with specific numbers |

**Overall confidence:** HIGH

### Gaps to Address

- **VoiceButton recording state implementation:** FEATURES.md flags this as MEDIUM complexity and notes the current VoiceButton state management needs to be confirmed before implementing the pulsing magenta ring. Read `VoiceButton.tsx` at the start of Phase 2 to verify the recording flag is accessible from the component's render context.
- **Gradient border on resizable panels (deferred to v1.x):** The pseudo-element gradient border technique on `ResizablePanelGroup` has a subtle z-index interaction with the resize handle. When this is undeferred, it needs a focused spike before full implementation.
- **`prefers-reduced-motion` plus manual toggle:** Research recommends a manual reduce-motion toggle in settings as a UX improvement but explicitly deferred it for v1.1. If accessibility requirements are stricter than assumed, revisit before Phase 3 ships. The OS-level `@media (prefers-reduced-motion)` wrapping in Phase 3 is the minimum viable implementation.

## Sources

### Primary (HIGH confidence)

- https://ui.shadcn.com/docs/theming — CSS variable structure, OKLCH semantics
- https://ui.shadcn.com/docs/tailwind-v4 — `@theme inline` pattern, v4 migration
- https://motion.dev/docs/react — React 19 compatibility, AnimatePresence, import path `"motion/react"`
- https://www.npmjs.com/package/motion — version 12.38.0 confirmed current as of 2026-03-24
- https://lucide.dev/guide/packages/lucide-react — individual import pattern, tree-shaking
- https://github.com/tailwindlabs/tailwindcss/issues/18296 — `@theme inline` dark mode bug confirmed
- https://tobiasahlin.com/blog/how-to-animate-box-shadow/ — box-shadow repaint analysis
- https://christopher.engineering/en/blog/lucide-icons-with-vite-dev-server — direct-path import benchmark (1,637 modules reduced to 35; 5.6s to 0.784s build time)

### Secondary (MEDIUM confidence)

- https://www.shadcn.io/theme/cyberpunk — OKLCH values for cyberpunk palette reference
- https://tweakcn.com/ — interactive shadcn theme generator with cyberpunk presets
- https://evilmartians.com/chronicles/better-dynamic-themes-in-tailwind-with-oklch-color-magic — OKLCH theming patterns for Tailwind
- https://interfaceingame.com/articles/cyberpunk-2077-ux-ui-critique/ — anti-patterns: when overdone effects hurt usability
- https://dev.to/raajaryan/react-animation-libraries-in-2025-what-companies-are-actually-using-3lik — bundle cost analysis for animation library selection

### Tertiary (LOW confidence)

- https://dev.to/sebyx07/introducing-cybercore-css-a-cyberpunk-design-framework-for-futuristic-uis-2e6c — cyberpunk component patterns for reference only; the framework itself is not being used

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*

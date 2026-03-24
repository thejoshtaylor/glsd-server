# Feature Research

**Domain:** Cyberpunk UI beautification — React dashboard (GLSD Server v1.1)
**Researched:** 2026-03-24
**Confidence:** HIGH (existing codebase inspected; shadcn/ui + Tailwind v4 OKLCH patterns verified via official docs; cyberpunk design patterns verified via multiple sources)

## Context

This is a subsequent milestone. The dashboard is already feature-complete (nodes, instances, streaming, audit log, voice input, JWT auth). This research covers ONLY visual polish, theming, iconography, and UX micro-improvements. No new data features are in scope.

**Existing stack constraints:**
- shadcn/ui components already in use: `badge`, `button`, `card`, `input`, `select`, `separator`, `skeleton`, `table`, `resizable`, `sonner`
- Tailwind v4 with OKLCH CSS variables (`:root` / `.dark` block already wired in `index.css`) — currently achromatic (zero chroma)
- Lucide React partially in use: `Monitor`, `Clock`, `ArrowLeft`, `ArrowDown` — ~15 more icons needed
- `tw-animate-css` already imported in `index.css` — available for animation utilities without adding a new dependency
- React 19, TanStack Router, TanStack Query, Zustand already present

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a "cyberpunk-themed" dashboard must have. Missing any of these means the aesthetic reads as "dark mode with blue accents" — not cyberpunk.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Neon accent color palette (cyan primary, magenta accent) | Cyberpunk aesthetic is defined by neon-on-void — the current achromatic gray palette is just dark mode | LOW | Override `--primary`, `--accent`, `--ring`, `--border` OKLCH vars in `.dark` block. Cyan: `oklch(0.75 0.18 195)`, magenta: `oklch(0.65 0.26 330)`. Propagates to all shadcn components automatically. |
| Void-black background (deeper than current gray-950) | Current `--background: oklch(0.145 0 0)` (gray) is not cyberpunk — needs near-black with blue undertone | LOW | Update to `oklch(0.07 0.008 280)`. Card at `oklch(0.11 0.01 280)`. One variable change in index.css. |
| Neon glow on interactive elements | Cyberpunk maps "alive/active" to neon light emission — static flat buttons break the aesthetic | LOW | CSS `box-shadow` with 3 layered shadows at increasing blur radius (4px / 12px / 24px) on Button primary hover/active. Add as `@layer utilities` `.glow-cyan` / `.glow-magenta` classes in index.css. |
| Status badges with semantic neon colors + glow | NodeStatusBadge and AuditTable event badges already exist but use generic Tailwind greens/reds — need cyberpunk palette | LOW | `connected` = cyan, `stale` = amber, `disconnected` = red. Update the inline `className` maps in `NodeStatusBadge.tsx` and `AuditTable.tsx`. Add faint box-shadow on each. |
| Monospace font for data fields | Cyberpunk UIs treat raw data (IDs, timestamps, command output) as a distinct typographic layer | LOW | Add `--font-mono` token pointing to Geist Mono (already loaded via `@fontsource-variable/geist`). Apply to stream panels, instance IDs, audit timestamps, version strings. |
| Full Lucide icon coverage | Bare text labels without icons reads unfinished in any modern dashboard; icons telegraph state at a glance in a monitoring context | MEDIUM | ~15 icons needed across existing components (see icon map below). All Lucide — already the project's icon library. Import individually to preserve tree-shaking. |
| Loading skeleton polish | Current skeletons use default shadcn gray shimmer — jarring against a cyberpunk palette | LOW | Override skeleton shimmer keyframe to use faint cyan tint. CSS only via `@keyframes` in index.css. |
| Replaced generic "Loading..." text with skeleton/spinner | `$nodeId.tsx` line 75: `<div className="p-6 text-gray-400">Loading...</div>` — plain text is visually broken | LOW | Replace with a skeleton card or a styled spinner. Pattern already exists in AuditTable. |

### Differentiators (Competitive Advantage)

Features that make the dashboard feel purpose-built and premium, not just "dark mode with a different primary color."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Animated neon pulse on connected node cards | Live heartbeat pulse makes node status immediately visceral — users register "alive" without reading text | LOW | CSS `@keyframes` pulsing `box-shadow` on NodeCard border when `status === 'connected'`. 2.5s cycle, subtle amplitude. No JS animation library. Use `will-change: box-shadow` for GPU compositing. |
| Stream panel "live" indicator (animated dot) | Users need a clear signal that output is actively streaming vs. viewing historical output | LOW | Pulsing dot (opacity + scale keyframe) in StreamPanel header when `isRunning`. One CSS keyframe, one element. Complement to the existing `KillButton` visibility. |
| VoiceButton active recording state | VoiceButton currently has no documented visual feedback for "mic is recording" — a real missing affordance | MEDIUM | Pulsing magenta ring around the mic icon while recording. Need to confirm current VoiceButton state management, but pattern is: CSS ring animation toggled by a CSS class applied when recording flag is true. |
| Page enter fade animation | Navigating from node list to node detail is currently instantaneous — feels abrupt for a polished app | LOW | `animate-in fade-in` via `tw-animate-css` utility class on route component root div. 150ms duration. `prefers-reduced-motion` handled by CSS media query. |
| Cyberpunk typography hierarchy | Section headings as uppercase + tracked letters ("NODES", "INSTANCES") conveys the aesthetic's brutalist-tech data terminal feel | LOW | `text-transform: uppercase` + `letter-spacing: 0.08em` on `h2`/`h3` elements. Applies to "Nodes", "Instances", "Stream" labels. No new font. |
| Login page cyberpunk treatment | Login is the first impression — current design is a plain white-ish card on a gray background | MEDIUM | Void-black full-height background, subtle CSS `repeating-linear-gradient` grid pattern, gradient border on the Card component, cyan title glow. Brief one-shot glitch animation on successful login before redirect (CSS keyframe, ~300ms, triggered by adding a class). |
| Scroll-to-bottom FAB color fix | StreamPanel's scroll FAB is `bg-blue-600` — generic, breaks the palette | LOW | Replace with neon cyan + glow. Already identified, trivial one-liner change in `StreamPanel.tsx`. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Scanline overlay on the entire UI | "Authentic" cyberpunk CRT feel | Users of Cyberpunk 2077 itself mod away the game's scanlines — they signal aesthetic effort but actively degrade text readability. Fails WCAG 1.4.3 contrast on text content. | Reserve scanlines for decorative-only elements (login background below the card, empty-state illustrations) where no readable text is layered over them |
| Glitch text animation on ambient UI labels | Dramatic, cinematic look | Continuous motion on headings and labels creates cognitive load — harmful for a monitoring dashboard where users need to read node IDs and statuses accurately. Photosensitive users risk seizure triggers at high frequency. | One-shot glitch only on deliberate events (login success, instance finished) — never ambient or looping on UI chrome |
| Glass morphism (backdrop-filter: blur) cards | Trendy in 2024-2025 dark UI design | `backdrop-filter: blur` causes GPU repaints on every scroll event, degrades performance on mid-tier hardware, and semantically conflicts with the "used future / gritty tech" cyberpunk aesthetic (glass = clean luxury tech, not dystopian system terminal) | Solid near-black card surfaces with gradient border + inner shadow achieve depth without blur overhead |
| Framer Motion / Motion for React | Widely used, smooth animations | Adds ~30KB to bundle for effects achievable with CSS alone. `tw-animate-css` is already imported and covers fade, slide, scale patterns. The dashboard's required animations (pulse, fade-in, spin) are all CSS-capable. | Use `tw-animate-css` utility classes and `@keyframes` in index.css. Escalate to Motion only if the product adds drag-reorder or scroll-linked animations (not in v1.1 scope) |
| Canvas particle / grid background | Immersive cyberpunk "rain" or animated grid effect | Continuous canvas render adds CPU/GPU overhead on every frame, interferes with pointer events if not carefully isolated, and visually competes with functional data content in a monitoring dashboard | Static CSS `repeating-linear-gradient` grid — zero JS, zero canvas, identical visual effect at rest |
| Full light/dark theme switcher | User customization | Multiplies CSS variable surface area, requires state persistence, significantly delays implementation. v1.1 ships one opinionated theme. | Single cyberpunk dark theme. Lock `html` to `.dark` class. Leave the existing light `:root` block dormant (does not affect UI when `.dark` is applied). |
| Per-component animation toggle in settings | Accessibility | Over-engineering for v1.1. The platform standard is `@media (prefers-reduced-motion)`. | Wrap all animation-activating `@keyframes` in `@media (prefers-reduced-motion: no-preference)` blocks. Handled at the CSS layer, no UI needed. |
| xterm.js terminal in stream panel | "Real terminal" feel | The project explicitly out-scoped this in PROJECT.md. Claude CLI output is NDJSON, not PTY. xterm.js adds ~700KB, ANSI escape handling, and cursor management that NDJSON doesn't need. | The existing `StreamEventRenderer` with structured rendering is the right approach — just apply cyberpunk typography and color to it |

---

## Feature Dependencies

```
Cyberpunk OKLCH color palette (CSS vars in index.css)
    └──required-by──> Neon glow effects (colors must exist before referencing in box-shadow)
    └──required-by──> Status badge colors (reference --color-primary, --color-destructive tokens)
    └──required-by──> Skeleton shimmer color
    └──required-by──> NodeCard connected pulse (border color sources from token)

Monospace font token (--font-mono)
    └──required-by──> Stream panel typography
    └──required-by──> Audit ID / timestamp column styling

Lucide icon imports
    └──required-by──> Navigation icon polish (icons must be imported before use)
    └──enhances──> Status readability (icon + color + glow is a stronger signal than color alone)

NodeCard connected pulse animation
    └──enhances──> Neon glow (pulse and static glow share the same CSS property, box-shadow)
    └──conflicts-with──> Page transition fade (avoid simultaneous card border + opacity animation)
```

### Dependency Notes

- **Color palette must be implemented first.** Every other visual feature references OKLCH tokens. Do the CSS variable rewrite before any component-level changes or you will fix per-component colors twice.
- **Lucide imports are tree-shaken.** Import individually (`import { Cpu } from 'lucide-react'`), never from a barrel re-export. The existing code already does this correctly — maintain the pattern.
- **`tw-animate-css` already available.** All pulse / fade / slide effects should use its utility classes or `@keyframes` defined in index.css. No new animation dependencies needed for v1.1.

---

## MVP Definition (v1.1 Cyberpunk Polish)

### Launch With (v1.1)

- [ ] Cyberpunk OKLCH color palette — override `--background`, `--card`, `--primary`, `--primary-foreground`, `--accent`, `--border`, `--ring` in `.dark` block of `index.css`
- [ ] Neon glow utility classes — `@layer utilities` `.glow-cyan` and `.glow-magenta` using 3-layer `box-shadow`
- [ ] Status badge neon colors — update `statusConfig` in `NodeStatusBadge.tsx` and `EVENT_TYPE_COLORS` in `AuditTable.tsx`
- [ ] Monospace font token — `--font-mono` added; apply to stream panel, audit ID/timestamp columns, instance IDs, version strings
- [ ] Full Lucide icon pass — all unlabeled sections, action buttons, metadata fields, instance status rows (see icon map below)
- [ ] NodeCard connected pulse — CSS `@keyframes` pulsing border-glow on connected nodes
- [ ] Stream panel live indicator — animated dot in StreamPanel header when `isRunning`
- [ ] VoiceButton recording state — pulsing magenta ring while mic is active
- [ ] Scroll FAB cyberpunk color — update `StreamPanel.tsx` scroll button from `bg-blue-600` to neon cyan with glow
- [ ] Typography hierarchy — uppercase + letter-spacing on section headings throughout dashboard
- [ ] Loading state replacement — replace `<div className="p-6 text-gray-400">Loading...</div>` in `$nodeId.tsx` with skeleton components
- [ ] Page enter animation — `animate-in fade-in` on dashboard route view transitions via `tw-animate-css`
- [ ] Login page cyberpunk treatment — grid CSS background, gradient border on Card, glow on title, one-shot glitch on success

### Add After Validation (v1.x)

- [ ] Gradient borders on the resizable panel — pseudo-element technique, medium complexity, lower priority than core palette work
- [ ] Scanline decoration on empty states — evaluate readability; only applies to illustrative areas without text

### Future Consideration (v2+)

- [ ] Motion (Framer Motion) for scroll-linked or gesture animations — only if product adds drag interactions
- [ ] Canvas grid background — only if performance budget is confirmed adequate on target hardware

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Cyberpunk OKLCH color palette | HIGH | LOW | P1 |
| Status badge neon colors | HIGH | LOW | P1 |
| Neon glow utility classes | HIGH | LOW | P1 |
| Void-black background update | HIGH | LOW | P1 |
| Full Lucide icon coverage | HIGH | MEDIUM | P1 |
| Monospace font for data fields | HIGH | LOW | P1 |
| NodeCard connected pulse | HIGH | LOW | P1 |
| Loading state polish | MEDIUM | LOW | P1 |
| Stream panel live indicator | MEDIUM | LOW | P1 |
| Scroll FAB color fix | MEDIUM | LOW | P1 |
| Typography uppercase hierarchy | MEDIUM | LOW | P2 |
| Page enter animations | MEDIUM | LOW | P2 |
| Login page cyberpunk treatment | MEDIUM | MEDIUM | P2 |
| VoiceButton recording state | MEDIUM | MEDIUM | P2 |
| Gradient borders on panels | LOW | MEDIUM | P3 |
| Scanline empty-state decoration | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Core aesthetic — without these it reads as "dark mode" not "cyberpunk"
- P2: Polish — meaningful improvement, low regression risk
- P3: Nice to have — defer if time-boxed

---

## Cyberpunk-Specific Implementation Notes

### Color Token Strategy (OKLCH)

The existing `index.css` uses OKLCH throughout. The current `.dark` block is achromatic — all chroma values are 0 or near-0. The cyberpunk transformation is a targeted surgical override of specific tokens in the `.dark` block only:

```css
/* Replaces achromatic .dark values — cyberpunk palette */
--background: oklch(0.07 0.008 280);        /* Void black with blue undertone */
--card: oklch(0.11 0.01 280);               /* Slightly lifted card surface */
--primary: oklch(0.75 0.18 195);            /* Neon cyan */
--primary-foreground: oklch(0.07 0.008 280); /* Void on cyan (legible) */
--accent: oklch(0.65 0.26 330);             /* Neon magenta */
--accent-foreground: oklch(0.07 0.008 280); /* Void on magenta */
--ring: oklch(0.75 0.18 195);               /* Cyan focus ring */
--border: oklch(0.75 0.18 195 / 18%);       /* Faint cyan border */
--destructive: oklch(0.65 0.22 25);         /* Red-orange (existing value fine) */
```

All shadcn components that reference `--primary`, `--accent`, `--ring`, `--border` update automatically. No component-level color changes needed beyond badge overrides.

### Neon Glow Pattern

3 shadow layers is the performance ceiling. Use `will-change: box-shadow` only on elements with `transition` (not on static elements):

```css
@layer utilities {
  .glow-cyan {
    box-shadow:
      0 0 4px oklch(0.75 0.18 195 / 60%),
      0 0 12px oklch(0.75 0.18 195 / 30%),
      0 0 24px oklch(0.75 0.18 195 / 12%);
  }
  .glow-magenta {
    box-shadow:
      0 0 4px oklch(0.65 0.26 330 / 60%),
      0 0 12px oklch(0.65 0.26 330 / 30%),
      0 0 24px oklch(0.65 0.26 330 / 12%);
  }
}
```

### Icon Map for Existing Components

| Component | Context | Recommended Icon |
|-----------|---------|-----------------|
| `DashboardPage` | "Nodes" section heading | `LayoutGrid` |
| `NodeDetailPage` | Platform field | `Cpu` |
| `NodeDetailPage` | Version field | `Tag` |
| `NodeDetailPage` | Projects field | `FolderOpen` |
| `InstanceList` | Running instance | `Activity` |
| `InstanceList` | Finished instance | `CheckCircle2` |
| `InstanceList` | Errored instance | `XCircle` |
| `InstanceList` | Pending instance | `Clock` (already imported) |
| `ExecuteForm` | Submit / run button | `Play` |
| `ExecuteForm` | Session ID field label | `RotateCcw` |
| `KillButton` | Stop action | `Square` |
| `VoiceButton` | Mic idle | `Mic` |
| `VoiceButton` | Mic recording | `MicOff` or pulsing `Mic` |
| `AuditPage` | Page heading | `ScrollText` |
| `AuditFilters` | Filter section | `Filter` |
| `StreamPanel` | Header | `Terminal` |
| `StaleWarning` | Warning alert | `AlertTriangle` |
| `LoginPage` | Form heading / logo area | `Shield` |

### Motion Budget

All animations require `@media (prefers-reduced-motion: no-preference)` wrapping:

```css
@media (prefers-reduced-motion: no-preference) {
  .animate-pulse-glow { animation: pulse-glow 2.5s ease-in-out infinite; }
  .animate-live-dot { animation: live-dot 1.5s ease-in-out infinite; }
}
```

Maximum durations: node pulse = 2.5s, live dot = 1.5s, page fade-in = 150ms, hover glow transition = 200ms, login glitch = 300ms (one-shot).

### Tailwind v4 `@theme inline` Pattern

The project already uses `@theme inline` to expose CSS vars to Tailwind utilities. Any new semantic color tokens added to `:root` / `.dark` must also be registered here:

```css
@theme inline {
  /* Add any new named tokens here to make them available as Tailwind classes */
  --color-neon-cyan: var(--neon-cyan);
  --color-neon-magenta: var(--neon-magenta);
}
```

---

## Sources

- [shadcn/ui Theming docs](https://ui.shadcn.com/docs/theming) — CSS variable structure, OKLCH semantics (HIGH confidence)
- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — `@theme inline` pattern, v4 migration (HIGH confidence)
- [React Cyberpunk Theme — shadcn.io](https://www.shadcn.io/theme/cyberpunk) — OKLCH values for cyberpunk palette reference (MEDIUM confidence)
- [tweakcn Theme Editor](https://tweakcn.com/) — Interactive shadcn theme generator with cyberpunk presets (MEDIUM confidence)
- [CYBERCORE CSS Framework](https://dev.to/sebyx07/introducing-cybercore-css-a-cyberpunk-design-framework-for-futuristic-uis-2e6c) — Cyberpunk component patterns: cut corners, ghost buttons, card hover glow (MEDIUM confidence)
- [Lucide React docs](https://lucide.dev/guide/packages/lucide-react) — Individual import pattern, tree-shaking (HIGH confidence)
- [Neon Glow Button — CSS box-shadow technique](https://seasparta618.medium.com/fantastic-css-effects-button-neon-button-using-box-shadow-6642ddee0c15) — 3-layer shadow pattern (MEDIUM confidence)
- [Skeleton Loading best practices](https://ironeko.com/posts/the-dos-and-donts-of-skeleton-loading-in-react) — When to use skeleton vs spinner (MEDIUM confidence)
- [Cyberpunk 2077 UI/UX Critique](https://interfaceingame.com/articles/cyberpunk-2077-ux-ui-critique/) — Anti-patterns: when overdone effects hurt usability (MEDIUM confidence)
- [React Animation Libraries 2025](https://dev.to/raajaryan/react-animation-libraries-in-2025-what-companies-are-actually-using-3lik) — Framer Motion bundle cost analysis; rationale for CSS-only approach (MEDIUM confidence)

---
*Feature research for: GLSD Server v1.1 Cyberpunk UI Beautification*
*Researched: 2026-03-24*

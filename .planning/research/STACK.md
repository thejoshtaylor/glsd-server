# Stack Research

**Domain:** Cyberpunk UI beautification — React 19 + Tailwind v4 + shadcn/ui dashboard
**Researched:** 2026-03-24
**Confidence:** HIGH

> **Scope note:** This document covers the v1.1 cyberpunk beautification milestone only.
> The full project stack (FastAPI backend, PostgreSQL, WebSocket architecture) is documented
> in the original v1.0 research. This file addresses only what is NEW or CHANGED for the UI polish milestone.

---

## What Is Already Installed (Do Not Re-Add)

Verify against `frontend/package.json` before any install command:

| Already Installed | Installed Version | Notes |
|-------------------|-------------------|-------|
| `lucide-react` | ^1.0.1 | Icons — v1.0 is the current major, no install needed |
| `tw-animate-css` | ^1.4.0 | CSS-only enter/exit animations — already covers basic class-based transitions |
| `shadcn` (CLI) | ^4.1.0 | Component scaffolding — already present, run `npx shadcn add` for new components |
| `tailwindcss` | ^4.2.2 | v4 with OKLCH color system, `@theme inline` already configured in `index.css` |
| `@fontsource-variable/geist` | ^5.2.8 | Body/UI font — keep as-is for body text and UI labels |
| `class-variance-authority` | ^0.7.1 | Component variant system — already wired in |
| `tailwind-merge` | ^3.5.0 | Class merging utility — already in use |
| `next-themes` | ^0.4.6 | Dark mode toggling — already in use |
| `sonner` | ^2.0.7 | Toast notifications — already in use |

---

## Recommended Stack Additions

### Core Technologies (New Installs Required)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `motion` | ^12.38.0 | JS-driven animations — entrance/exit, spring physics, layout transitions, AnimatePresence | `tw-animate-css` is CSS-class-only. It cannot animate unmounting elements, layout shifts, or spring-physics hover states. `motion` (formerly Framer Motion, import from `"motion/react"`) is the React ecosystem standard for these needs. React 19 explicitly supported. 30M+ weekly npm downloads. |
| `@fontsource-variable/orbitron` | ^5.x | Cyberpunk display/heading font | Orbitron is the canonical futuristic typeface — geometric, monoline, used across every major cyberpunk UI reference. Variable font means one import covers the full weight range. Pairs naturally with existing Geist body font. |

### Supporting Libraries (New Installs, Conditional)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fontsource-variable/jetbrains-mono` | ^5.x | Monospace font for code/stream output | Use only if the stream panels (`StreamPanel`, `HistoryStreamPanel`, `ToolUse`, `ToolResult`) need improved readability. JetBrains Mono is the highest-quality developer monospace with ligature support and strong cyberpunk aesthetic. Geist is proportional — not suitable for aligned NDJSON/tool output. |

### Development Tools

No new dev dependencies are needed. Vite + TypeScript + ESLint + `@tailwindcss/vite` handles everything.

---

## Installation

```bash
# From frontend/ directory
# Required
npm install motion @fontsource-variable/orbitron

# Conditional — add only if upgrading stream panel fonts
npm install @fontsource-variable/jetbrains-mono
```

---

## Cyberpunk Theme: Zero New Libraries Required

The cyberpunk color system, neon gradients, glow effects, and visual hierarchy are implemented entirely through **Tailwind v4 CSS custom properties in `index.css`**. No new package is needed.

### How: Override the `.dark` block in `index.css`

Tailwind v4 uses OKLCH throughout. The cyberpunk palette maps naturally to OKLCH's chroma axis — set high chroma values (0.15–0.25) for vivid neons:

```css
.dark {
  /* Deep cool-black base — slight blue undertone, not pure black */
  --background: oklch(0.08 0.02 270);

  /* Cyan primary — classic "tron blue" / cyberpunk neon */
  --primary: oklch(0.72 0.18 200);
  --primary-foreground: oklch(0.05 0.01 270);

  /* Magenta accent — neon pink complement to cyan */
  --accent: oklch(0.65 0.22 330);
  --accent-foreground: oklch(0.98 0 0);

  /* Cards with depth above background */
  --card: oklch(0.12 0.02 270);
  --card-foreground: oklch(0.92 0 0);

  /* Borders as subtle neon lines */
  --border: oklch(0.72 0.18 200 / 20%);
  --ring: oklch(0.72 0.18 200 / 60%);
}
```

### Glow animations via `@theme` keyframes

Define custom animations in the `@theme inline` block already present in `index.css`:

```css
@theme inline {
  /* ...existing vars... */
  --animate-glow-pulse: glow-pulse 2s ease-in-out infinite alternate;

  @keyframes glow-pulse {
    from { box-shadow: 0 0 4px oklch(0.72 0.18 200 / 50%), 0 0 8px oklch(0.72 0.18 200 / 25%); }
    to   { box-shadow: 0 0 10px oklch(0.72 0.18 200 / 80%), 0 0 24px oklch(0.72 0.18 200 / 40%); }
  }
}
```

Apply as a Tailwind utility: `className="animate-glow-pulse"`

### Gradient text (zero JS)

Tailwind v4's OKLCH gradient interpolation via `bg-linear-to-r/oklch` produces vivid neon gradients without mid-point color collapse:

```tsx
<h1 className="bg-linear-to-r/oklch from-cyan-400 to-pink-500 bg-clip-text text-transparent font-[Orbitron]">
  Node Control
</h1>
```

### Orbitron font wiring

In `index.css`, add the import and extend the `@theme inline` block:

```css
@import "@fontsource-variable/orbitron";

@theme inline {
  --font-heading: 'Orbitron Variable', sans-serif;
  /* ...existing vars... */
}
```

Then use `font-heading` as a Tailwind utility: `className="font-heading text-xl font-semibold"`

---

## shadcn/ui Component Additions (CLI Only — No New npm Package)

The `shadcn` CLI is already installed. New components are scaffolded as source files with no npm dependency:

```bash
# From frontend/ directory
npx shadcn add dialog
npx shadcn add tooltip
npx shadcn add progress
npx shadcn add tabs
```

**Currently in `src/components/ui/`:** badge, button, card, input, select, separator, skeleton, sonner, table, resizable

**Recommended additions:**

| Component | Rationale |
|-----------|-----------|
| `dialog` | Confirm modals for kill-instance action, node detail overlays |
| `tooltip` | Icon-only buttons need accessible labels (Lucide icons throughout the dashboard) |
| `progress` | Running instance state — animated progress bar for "running" status |
| `tabs` | Stream panel view switching (live stream vs history) |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `motion` (motion/react) | `react-spring` | react-spring has comparable physics-based API. Choose if you already have react-spring in other projects and want consistency. For net-new work, `motion` has 3x the weekly downloads, better docs, and is the de-facto standard in the shadcn/ui ecosystem. |
| `motion` | Keep only `tw-animate-css` | Acceptable if the scope is limited to CSS class-based transitions only (no unmount animations, no layout shifts, no spring hover). Not sufficient here — NodeCard list entrance, stream panel AnimatePresence, and interactive hover on cards all require JS-driven lifecycle animations. |
| `@fontsource-variable/orbitron` | Google Fonts CDN `@import url(...)` | CDN import works but adds external network dependency. Fontsource self-hosts fonts consistent with how Geist is already loaded — keeps all assets local, no GDPR font-request leakage. |
| OKLCH CSS vars in `index.css` | Third-party cyberpunk CSS framework (cybercore-css, etc.) | External cyberpunk CSS frameworks conflict with Tailwind's utility-first model and override shadcn/ui's token system, requiring CSS specificity fights. OKLCH variables in `index.css` integrate natively and are already the project's theming mechanism. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `gsap` (GreenSock) | Commercial license required for revenue products, 60KB+ bundle, over-engineered for dashboard micro-interactions | `motion` — covers all required patterns at ~25KB gzipped |
| `animejs` | No React lifecycle integration, no AnimatePresence equivalent for unmount animations | `motion` |
| `react-transition-group` | Low-level verbose API, no spring physics, predates modern React animation patterns | `motion` |
| Third-party cyberpunk CSS frameworks | Override shadcn/ui tokens, conflict with Tailwind utilities, unmaintained | Pure Tailwind v4 CSS variables + `@keyframes` in `index.css` |
| Raw `@radix-ui/*` packages | shadcn already wraps Radix; installing raw packages alongside creates version conflicts | `npx shadcn add [component]` |
| `three.js` / WebGL particle effects | 590KB+ bundle, GPU-dependent, accessibility issues, unjustifiable for a team ops dashboard | CSS `box-shadow` + `backdrop-filter` achieves neon glow at near-zero cost |
| `framer-motion` (the old package name) | The package was renamed to `motion`; `framer-motion` is a re-export shim. Installing both creates duplicate bundle entries | `npm install motion`, import from `"motion/react"` |

---

## Stack Patterns by Feature

**NodeCard entrance animations (list items mounting):**
- Use `motion` with `initial={{ opacity: 0, y: 8 }}` + `animate={{ opacity: 1, y: 0 }}`
- Reason: `tw-animate-css` cannot animate the mount phase of dynamically added list items without a JS transition wrapper

**Hover micro-interactions on cards:**
- Tailwind `hover:shadow-[0_0_12px_oklch(0.72_0.18_200/60%)]` for pure-CSS glow
- `motion` `whileHover={{ scale: 1.01 }}` for spring-physics scale feel on NodeCard
- Reason: CSS hover covers glow (zero JS overhead); spring physics on scale needs Motion for natural deceleration

**Dialog/panel exit animations:**
- `motion` `AnimatePresence` with `exit={{ opacity: 0, scale: 0.95 }}`
- Reason: CSS animations cannot run on elements that have been removed from the DOM; AnimatePresence defers unmount until exit animation completes

**Gradient text headings:**
- Tailwind v4 gradient utilities + Orbitron font, no JS
- Reason: Zero runtime cost, fully composable with Tailwind classes, correct tool for static gradient text

**Status badges (node connected/stale/disconnected):**
- Extend existing shadcn Badge component variants with cyberpunk colors via CVA
- Reason: CVA is already wired into the project; adding variant definitions is a one-line-per-status change in `badge.tsx`

**Stream/code output panels:**
- JetBrains Mono font via `@fontsource-variable/jetbrains-mono`
- Reason: Geist is proportional — NDJSON and tool call output requires a true monospace for alignment and scan readability

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `motion@^12.38.0` | React ^19.x | React 19 explicitly supported as of Motion v12 alpha; v12.38.0 (current as of 2026-03-24) is production-stable |
| `motion@^12.x` | `tw-animate-css@^1.4.0` | No package conflict. Operate in separate layers (JS vs CSS class). Do NOT apply `transition-*` Tailwind classes to the same element `motion` is animating — this causes jitter |
| `@fontsource-variable/orbitron` | Tailwind v4 `@theme inline` | Add `--font-heading: 'Orbitron Variable', sans-serif` in the `@theme inline` block. No Tailwind config file needed — Tailwind v4 reads CSS vars directly |
| `shadcn@^4.1.0` (CLI) | All added components | shadcn CLI v4 generates components that use the Tailwind v4 OKLCH token system natively; no config changes required |

---

## Sources

- https://www.npmjs.com/package/motion — version 12.38.0 confirmed current (2026-03-24)
- https://motion.dev/docs/react — React 19 compatibility confirmed; import path `"motion/react"`
- https://www.npmjs.com/package/@fontsource-variable/orbitron — package name and availability confirmed
- https://fontsource.org/fonts/jetbrains-mono — JetBrains Mono variable font via Fontsource confirmed
- https://tailwindcss.com/docs/theme — Tailwind v4 `@theme` block, OKLCH gradient interpolation (`bg-linear-to-r/oklch`)
- https://github.com/Wombosvideo/tw-animate-css — scope confirmed: CSS class-based only, no JS lifecycle awareness
- https://lucide.dev/guide/packages/lucide-react — lucide-react v1.0 confirmed current; brand icons removed in v1.0
- https://ui.shadcn.com/docs/components — dialog, tooltip, progress, tabs confirmed available via CLI
- https://evilmartians.com/chronicles/better-dynamic-themes-in-tailwind-with-oklch-color-magic — OKLCH theming patterns for Tailwind

---

*Stack research for: GLSD Server v1.1 Cyberpunk Beautification*
*Researched: 2026-03-24*

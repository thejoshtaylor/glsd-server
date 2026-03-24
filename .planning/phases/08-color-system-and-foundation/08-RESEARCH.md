# Phase 8: Color System and Foundation - Research

**Researched:** 2026-03-24
**Domain:** CSS custom properties, OKLCH color system, Tailwind CSS v4, fontsource variable fonts, pseudo-element glow patterns
**Confidence:** HIGH

## Summary

Phase 8 replaces the existing grayscale OKLCH shadcn defaults and scattered hardcoded `gray-*` Tailwind classes with a cyberpunk color palette defined entirely in CSS custom properties. The palette is fully decided: void-black background (`oklch(0.10 0.01 250)`), neon cyan primary (`oklch(0.75 0.18 195)`), neon magenta accent (`oklch(0.70 0.25 330)`), and faint cyan borders (`oklch(0.75 0.18 195 / 15%)`).

The project uses Tailwind CSS v4 with the `@theme inline` + `:root`/`.dark` split. A critical locked decision from STATE.md is that OKLCH tokens must live in `:root`/`.dark` raw CSS blocks only — never inside `@theme inline`. The `@theme inline` block only maps `--color-*` aliases that point to those CSS variables. Adding new tokens outside this split causes dark mode breakage (Tailwind v4 bug #18296).

The implementation has three distinct areas of work: (1) replace the CSS variable values in `index.css`, (2) add the Orbitron font import and new typography tokens, and (3) sweep all hardcoded `gray-*` Tailwind classes across routes and components — 22 occurrences in routes, 40 in components — replacing them with semantic CSS variable references. The `main.css` duplicate file must also be deleted and `main.tsx` updated to import `index.css` instead.

**Primary recommendation:** Edit `index.css` as the single source of truth. Install `@fontsource-variable/orbitron`, add its import, update `:root`/`.dark` OKLCH values, add `@theme inline` font/glow mappings, then sweep hardcoded gray classes. Add `.dark` class to `<html>` in `index.html` since the app has no theme switcher and is dark-mode-only.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Void-black background: `oklch(0.10 0.01 250)` — L=0.10 with subtle blue chroma for visible undertone
- Neon cyan primary: `oklch(0.75 0.18 195)` — classic cyberpunk cyan, high chroma, good contrast on dark
- Neon magenta accent: `oklch(0.70 0.25 330)` — hot pink-magenta, high contrast with cyan
- Faint cyan borders: `oklch(0.75 0.18 195 / 15%)` — same cyan hue at 15% opacity for subtlety
- Glow technique: Pseudo-element `::after` with opacity transition (avoids box-shadow repaint per STATE.md pitfall)
- Glow intensity: Medium — 8px spread, 60% opacity, 200ms ease-out
- Glow scope in Phase 8: Buttons and focus rings only; expand in Phase 9/10
- Glow utility classes: `glow-cyan` and `glow-magenta`
- Orbitron display font: `@fontsource-variable/orbitron` npm package
- Monospace: System monospace stack (`ui-monospace, SFMono-Regular, ...`) — zero load cost
- Heading letter-spacing: `0.1em` for uppercase section headings
- CSS cleanup: Keep `index.css` as single source, delete duplicate `main.css`

### Claude's Discretion
- Exact derived color values for card, popover, muted, secondary, etc. in the OKLCH palette
- Chart color mapping to cyberpunk palette
- Sidebar color tuning within the established palette
- Focus ring exact glow parameters

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLR-01 | Dashboard uses void-black background with blue undertone across all views | `oklch(0.10 0.01 250)` → `--background` in `.dark`; `__root.tsx` uses `bg-background` after gray sweep |
| CLR-02 | Primary interactive elements use neon cyan color throughout | `oklch(0.75 0.18 195)` → `--primary` in `.dark`; shadcn button/input/badge inherit via `bg-primary` |
| CLR-03 | Accent elements use neon magenta color throughout | `oklch(0.70 0.25 330)` → `--accent` (or dedicated `--accent-cyber`) in `.dark` |
| CLR-04 | Borders use faint cyan tint instead of neutral gray | `oklch(0.75 0.18 195 / 15%)` → `--border` in `.dark`; all `border-gray-*` swept to `border-border` |
| CLR-05 | Glow utility classes (cyan and magenta) available for interactive elements | `.glow-cyan` and `.glow-magenta` CSS classes using pseudo-element technique |
| CLR-06 | Focus rings use neon cyan across all focusable elements | `--ring` → neon cyan in `.dark`; `@layer base` already applies `outline-ring/50` globally |
| TYP-01 | Section headings use uppercase with letter-spacing | `text-uppercase tracking-widest` utility or `@layer components` heading rule; `0.1em` letter-spacing |
| TYP-02 | Data fields (IDs, timestamps, command output) render in monospace font | `--font-mono` token in `@theme inline`; existing `font-mono` usages already in components — just wire the token |
| TYP-03 | Heading font (Orbitron) used for page titles and major section headers | Install `@fontsource-variable/orbitron`; add `@import`; set `--font-heading` to `'Orbitron Variable'` in `@theme inline` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fontsource-variable/orbitron` | 5.2.8 | Orbitron variable font self-hosted | Matches existing `@fontsource-variable/geist` pattern; no CDN dependency |
| Tailwind CSS v4 | 4.2.2 (installed) | Utility CSS framework | Already in project |
| CSS custom properties (native) | — | Color token system | Already established pattern in `index.css` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tw-animate-css` | 1.4.0 (installed) | Glow animation keyframes if needed | Already installed; avoid adding motion library |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@fontsource-variable/orbitron` | Google Fonts CDN | CDN has privacy/latency tradeoffs; self-hosted is consistent with Geist approach |
| Pseudo-element glow | `box-shadow` direct | `box-shadow` triggers layout repaint on animation; pseudo-element opacity is GPU-composited |

**Installation:**
```bash
cd frontend && npm install @fontsource-variable/orbitron
```

**Version verification:** `@fontsource-variable/orbitron@5.2.8` confirmed via npm registry on 2026-03-24.

## Architecture Patterns

### CSS File Structure After Phase 8

The key architectural reality: `main.tsx` currently imports `main.css`, not `index.css`. Both files are identical. The correct outcome is:
1. Update `main.tsx` to import `./index.css`
2. Delete `main.css`
3. All future edits go to `index.css`

### Tailwind v4 Token Architecture (LOCKED)

```
@theme inline {
    /* Maps --color-* → CSS variable references ONLY */
    /* Maps --font-* → CSS variable references ONLY */
    /* NO raw color values here — Tailwind bakes these at build time */
}

:root {
    /* Light mode values — NOT used for this dark-only app */
    /* Still required by shadcn components that check :root */
}

.dark {
    /* ALL cyberpunk values live here */
    --background: oklch(0.10 0.01 250);
    --primary: oklch(0.75 0.18 195);
    --accent: oklch(0.70 0.25 330);
    --border: oklch(0.75 0.18 195 / 15%);
    ...
}
```

The app currently has NO dark mode class applied to `<html>`. The `__root.tsx` uses hardcoded `bg-gray-950` instead of `bg-background`. To make `.dark` CSS variables take effect across the app, `class="dark"` must be added to `<html lang="en">` in `frontend/index.html`. This is a one-line change that unlocks all `.dark { }` variable overrides.

### Pattern 1: OKLCH Derived Color Scale

**What:** Derive card, popover, muted, secondary, sidebar colors as lightness steps above the background.
**When to use:** For all the shadcn semantic tokens that need cyberpunk but aren't in the explicit locked palette.
**Example — discretionary token derivation:**
```css
/* Source: locked palette + derivation from void-black base */
.dark {
    --background:  oklch(0.10 0.01 250);   /* void-black */
    --card:        oklch(0.14 0.01 250);   /* +0.04L above background */
    --popover:     oklch(0.14 0.01 250);   /* same as card */
    --muted:       oklch(0.18 0.01 250);   /* +0.08L, subtle surface */
    --secondary:   oklch(0.16 0.01 250);   /* between card and muted */
    --sidebar:     oklch(0.12 0.01 250);   /* slightly lighter than bg */

    --foreground:          oklch(0.92 0.02 195);  /* near-white with cyan tint */
    --card-foreground:     oklch(0.92 0.02 195);
    --muted-foreground:    oklch(0.60 0.04 195);  /* dimmed cyan-tinted */
    --secondary-foreground: oklch(0.85 0.02 195);
    --primary-foreground:  oklch(0.10 0.01 250);  /* dark bg color on cyan buttons */
    --accent-foreground:   oklch(0.10 0.01 250);  /* dark bg color on magenta */

    /* Ring = focus ring = cyan */
    --ring: oklch(0.75 0.18 195);

    /* Input surfaces */
    --input: oklch(0.18 0.01 250 / 80%);
}
```

### Pattern 2: Pseudo-Element Glow Utility (LOCKED technique)

**What:** Glow effect on interactive elements via `::after` with `opacity` transition, not `box-shadow`.
**When to use:** `glow-cyan` on buttons, focus rings. `glow-magenta` for accent interactive elements.
**Example:**
```css
/* Source: locked decision from CONTEXT.md + STATE.md pitfall avoidance */
@layer utilities {
    .glow-cyan {
        position: relative;
        isolation: isolate;
    }
    .glow-cyan::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: transparent;
        box-shadow: 0 0 8px 2px oklch(0.75 0.18 195 / 60%);
        opacity: 0;
        transition: opacity 200ms ease-out;
        pointer-events: none;
        z-index: -1;
    }
    .glow-cyan:hover::after,
    .glow-cyan:focus-visible::after {
        opacity: 1;
    }

    .glow-magenta {
        position: relative;
        isolation: isolate;
    }
    .glow-magenta::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: transparent;
        box-shadow: 0 0 8px 2px oklch(0.70 0.25 330 / 60%);
        opacity: 0;
        transition: opacity 200ms ease-out;
        pointer-events: none;
        z-index: -1;
    }
    .glow-magenta:hover::after,
    .glow-magenta:focus-visible::after {
        opacity: 1;
    }
}
```

### Pattern 3: Font Token Registration

**What:** Register Orbitron and system mono in `@theme inline` so Tailwind utilities (`font-heading`, `font-mono`) work.
**Example:**
```css
/* Add to existing @theme inline block */
@import "@fontsource-variable/orbitron";

@theme inline {
    /* NEW — add alongside existing font-sans */
    --font-heading: 'Orbitron Variable', sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    /* existing entries remain unchanged */
}
```

Note: current `@theme inline` already declares `--font-heading: var(--font-sans)`. This must be **replaced** (not added alongside) to point to Orbitron Variable.

### Pattern 4: Section Heading Typography (TYP-01)

**What:** Uppercase + letter-spacing applied to section headings.
**When to use:** `<h2>`, `<h3>` elements that are section labels.
**Example — Tailwind utility approach (no new CSS needed):**
```tsx
<h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
  Nodes
</h2>
```
`tracking-widest` is `letter-spacing: 0.1em` in Tailwind — matches the locked `0.1em` value exactly.

### Gray Class Sweep Strategy

The 22 route + 40 component hardcoded `gray-*` occurrences must be replaced with semantic CSS variable utilities. Mapping:

| Hardcoded class | Semantic replacement |
|-----------------|---------------------|
| `bg-gray-950` | `bg-background` |
| `bg-gray-900` | `bg-card` or `bg-sidebar` |
| `bg-gray-900/50`, `bg-gray-800/50` | `bg-card/50` or `bg-muted/50` |
| `bg-gray-800` | `bg-muted` |
| `border-gray-800`, `border-gray-700` | `border-border` |
| `text-gray-100`, `text-gray-200` | `text-foreground` |
| `text-gray-300`, `text-gray-400` | `text-muted-foreground` |
| `text-gray-500`, `text-gray-600` | `text-muted-foreground` (or `opacity-50` variant) |
| `hover:bg-gray-800`, `hover:bg-gray-700/50` | `hover:bg-muted` |
| `text-white` | `text-foreground` |

### Anti-Patterns to Avoid

- **Putting OKLCH values in `@theme inline`:** Tailwind bakes these at compile time as static values — they will NOT respond to `.dark` class changes. All cyberpunk values go in `:root` / `.dark` only.
- **Using `box-shadow` transition on `.glow-*`:** Causes GPU repaint. Use `opacity` transition on `::after` pseudo-element with a static `box-shadow`.
- **Leaving `main.css` and importing it:** Two identical files will both be processed, doubling CSS. Delete `main.css` and update the import in `main.tsx`.
- **Not adding `.dark` to `<html>`:** Without the dark class on the root element, all `.dark { }` variable overrides are dead — `bg-background` will render white, not void-black.
- **Overriding shadcn components via external CSS selectors:** shadcn uses `data-slot` selectors internally. Override by editing the component source directly or using CSS variables at the token level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Self-hosted variable font | Custom font subsetting/hosting setup | `@fontsource-variable/orbitron` | Pre-built npm package with correct `font-face` declarations, axes config, and subset files |
| Monospace font stack | Custom font loading | System mono stack (`ui-monospace, SFMono-Regular, ...`) | Zero load cost, renders in user's preferred coding font, already in browser |
| Glow CSS framework | Custom glow component library | CSS `@layer utilities` with two classes | The pattern is 20 lines of CSS; no library needed |
| Dark mode toggle | ThemeProvider setup | `.dark` class on `<html>` in `index.html` | App is dark-mode-only; no switcher needed in Phase 8 |

**Key insight:** OKLCH is a perceptually uniform color space — chroma/lightness adjustments are predictable without a color picker tool. Deriving card/muted/secondary as L+0.04 / L+0.06 / L+0.08 above background produces harmonious dark surfaces automatically.

## Common Pitfalls

### Pitfall 1: Dark Class Not Applied
**What goes wrong:** All `.dark { }` CSS variable values are never active; app renders with `:root` (light) values — white background, gray text.
**Why it happens:** `index.html` has no `class="dark"` on `<html>`. The CSS variables are defined but the selector never matches.
**How to avoid:** Add `class="dark"` to `<html lang="en">` in `frontend/index.html` as the first task in the implementation.
**Warning signs:** App renders white/light after palette change.

### Pitfall 2: @theme inline Static Baking
**What goes wrong:** Cyberpunk colors added to `@theme inline` work in light mode but don't change in dark mode.
**Why it happens:** Tailwind v4 processes `@theme inline` at build time. Values are inlined as static constants, bypassing the CSS variable runtime mechanism.
**How to avoid:** OKLCH token values go ONLY in `:root { }` and `.dark { }` blocks. `@theme inline` only holds `var(--token-name)` references, never raw values.
**Warning signs:** Dark mode background is wrong color even though `.dark { }` has the right value.

### Pitfall 3: main.css Duplicate Import
**What goes wrong:** After editing `index.css`, changes have no visible effect because `main.tsx` still imports `main.css` (the old duplicate).
**Why it happens:** Two identical files exist. `main.tsx` imports `main.css`, not `index.css`.
**How to avoid:** First action: check `main.tsx` import, switch to `./index.css`, delete `main.css`.
**Warning signs:** CSS edits to `index.css` do nothing in the browser.

### Pitfall 4: font-heading @theme inline Conflict
**What goes wrong:** Orbitron does not appear on headings even after installation.
**Why it happens:** The existing `@theme inline` block already has `--font-heading: var(--font-sans)`. Adding a second `--font-heading` declaration is ignored; the first one wins or they conflict.
**How to avoid:** REPLACE the existing `--font-heading: var(--font-sans)` line with `--font-heading: 'Orbitron Variable', sans-serif`. Do not add a second declaration.
**Warning signs:** Headings still render in Geist.

### Pitfall 5: Glow on Transformed Elements
**What goes wrong:** The `::after` pseudo-element glow is clipped or appears behind content.
**Why it happens:** `overflow: hidden` on a parent clips the pseudo-element. The `z-index: -1` puts it behind the element's own background if `isolation: isolate` is not set.
**How to avoid:** Add `isolation: isolate` to the `.glow-cyan` / `.glow-magenta` base class. Ensure parent containers don't have `overflow: hidden` when glow is active.
**Warning signs:** Glow invisible or clipped at element edge.

### Pitfall 6: Incomplete Gray Sweep
**What goes wrong:** Some elements still render with Tailwind gray colors after the palette change, creating visual inconsistency.
**Why it happens:** 22 occurrences in routes, 40 in components — easy to miss files.
**How to avoid:** After color token changes, run a project-wide search for `gray-` across `frontend/src/` to catch any remaining instances. Sweep is part of the implementation, not an afterthought.
**Warning signs:** Some cards/panels still have visible gray (too blue-cold or too neutral) compared to void-black backgrounds.

## Code Examples

### Complete .dark Block (Cyberpunk Palette)
```css
/* Source: locked decisions from CONTEXT.md + derived discretionary tokens */
.dark {
    /* Core brand colors */
    --background:  oklch(0.10 0.01 250);   /* void-black with blue undertone */
    --foreground:  oklch(0.92 0.02 195);   /* near-white, cyan-tinted */

    /* Surface scale — derived as L steps above background */
    --card:        oklch(0.14 0.01 250);
    --card-foreground: oklch(0.92 0.02 195);
    --popover:     oklch(0.14 0.01 250);
    --popover-foreground: oklch(0.92 0.02 195);

    /* Primary = neon cyan */
    --primary:          oklch(0.75 0.18 195);
    --primary-foreground: oklch(0.10 0.01 250);

    /* Secondary = subtle surface */
    --secondary:          oklch(0.16 0.01 250);
    --secondary-foreground: oklch(0.85 0.02 195);

    /* Muted = low-emphasis surface */
    --muted:          oklch(0.18 0.01 250);
    --muted-foreground: oklch(0.60 0.04 195);

    /* Accent = neon magenta */
    --accent:          oklch(0.70 0.25 330);
    --accent-foreground: oklch(0.10 0.01 250);

    /* Destructive — keep existing or warm-red */
    --destructive: oklch(0.65 0.22 25);

    /* Border = faint cyan tint */
    --border: oklch(0.75 0.18 195 / 15%);
    --input:  oklch(0.75 0.18 195 / 10%);

    /* Ring = focus = neon cyan */
    --ring: oklch(0.75 0.18 195);

    /* Charts — cyberpunk mapped */
    --chart-1: oklch(0.75 0.18 195);   /* cyan */
    --chart-2: oklch(0.70 0.25 330);   /* magenta */
    --chart-3: oklch(0.75 0.18 270);   /* violet */
    --chart-4: oklch(0.80 0.15 145);   /* neon green */
    --chart-5: oklch(0.75 0.20 55);    /* amber */

    /* Sidebar — slightly distinct from main bg */
    --sidebar:          oklch(0.12 0.01 250);
    --sidebar-foreground: oklch(0.92 0.02 195);
    --sidebar-primary:  oklch(0.75 0.18 195);
    --sidebar-primary-foreground: oklch(0.10 0.01 250);
    --sidebar-accent:   oklch(0.16 0.01 250);
    --sidebar-accent-foreground: oklch(0.92 0.02 195);
    --sidebar-border:   oklch(0.75 0.18 195 / 15%);
    --sidebar-ring:     oklch(0.75 0.18 195);
}
```

### @theme inline Addition for New Font Tokens
```css
/* Source: Tailwind v4 docs — @theme inline for CSS variable aliases */
@theme inline {
    /* REPLACE existing --font-heading line */
    --font-heading: 'Orbitron Variable', sans-serif;
    /* ADD new mono token */
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                 'Liberation Mono', 'Courier New', monospace;
    /* all existing entries remain */
}
```

### Import Order in index.css
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import "@fontsource-variable/orbitron";  /* ADD */
```

### dark class on html element
```html
<!-- frontend/index.html -->
<html lang="en" class="dark">
```

### Glow Applied to shadcn Button
```tsx
// Source: shadcn button.tsx — edit source directly per STATE.md
// Add glow-cyan to the default variant className string
"bg-primary text-primary-foreground hover:bg-primary/90 glow-cyan",
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HSL color tokens | OKLCH color tokens | Tailwind v4 / shadcn v4 (2024) | Perceptually uniform; chroma stays consistent across lightness |
| `box-shadow` glow animation | Pseudo-element opacity animation | CSS performance best practice (2023+) | No layout repaint; GPU composited |
| CDN Google Fonts | `@fontsource-variable/*` npm packages | ~2022 | No CDN dependency; GDPR friendly; tree-shakeable |
| `@theme { }` raw values | `@theme inline { }` + `:root`/`.dark` split | Tailwind v4 (2025) | `inline` needed for CSS variable aliasing; raw values in CSS blocks for runtime theme switching |

**Deprecated/outdated:**
- `HSL` color tokens in shadcn: Replaced by OKLCH in shadcn v4. Do not add HSL values.
- `box-shadow` on transitions: Will trigger `filter` and `box-shadow` composite layers — use pseudo-element instead.
- Barrel Lucide imports (`import { X } from 'lucide-react'`): STATE.md locked decision — all Lucide imports go via `src/lib/icons.ts` direct paths.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install | Yes | v25.8.1 | — |
| npm | Package install | Yes | bundled with Node | — |
| `@fontsource-variable/orbitron` | TYP-03 | Not installed yet | 5.2.8 available | — |
| `@fontsource-variable/geist` | Existing font | Yes | 5.2.8 | — |
| Tailwind CSS v4 | All color/typography | Yes | 4.2.2 | — |
| `tw-animate-css` | Glow animation (if keyframe needed) | Yes | 1.4.0 | — |

**Missing dependencies with no fallback:**
- `@fontsource-variable/orbitron` — must be installed before font import in `index.css` will resolve.

**Missing dependencies with fallback:**
- None.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `frontend/src/index.css`, `frontend/src/main.tsx`, `frontend/src/main.css`, `frontend/index.html` — full file reads
- Direct codebase inspection: `frontend/src/routes/__root.tsx`, route files, component files — gray class audit
- `.planning/phases/08-color-system-and-foundation/08-CONTEXT.md` — locked decisions
- `.planning/STATE.md` — locked technical decisions and pitfalls (OKLCH in `:root`/`.dark` only, pseudo-element glow)
- `frontend/package.json` — confirmed installed packages and versions
- `npm view @fontsource-variable/orbitron` — confirmed version 5.2.8

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 `@theme inline` split pattern — inferred from existing `index.css` structure which already implements the pattern correctly

### Tertiary (LOW confidence)
- None — all findings verified against actual project files.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages verified against npm registry; existing pattern confirmed in codebase
- Architecture: HIGH — existing CSS architecture read directly; locked decisions from CONTEXT.md and STATE.md
- Pitfalls: HIGH — 3 of 6 pitfalls are directly observable in the current codebase (dark class missing, main.css import, font-heading conflict); remainder are from locked STATE.md decisions

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (Tailwind v4 stable; fontsource stable)

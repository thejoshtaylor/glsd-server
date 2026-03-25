# Phase 10: Animations and Login Treatment - Research

**Researched:** 2026-03-24
**Domain:** CSS animations, `@keyframes`, `prefers-reduced-motion`, cyberpunk login styling
**Confidence:** HIGH

## Summary

This phase adds CSS-only animations to five existing components and fully transforms the login page into a cyberpunk first-impression. All animation decisions are locked in CONTEXT.md: pseudo-element opacity animations for glow pulses (per the established pitfall that direct `box-shadow` animation causes repaints), JS class-toggle for the one-shot login glitch, and a single `@media (prefers-reduced-motion: reduce)` block in `index.css` that disables everything globally.

No new npm packages are required. The project already has `tw-animate-css` 1.4.0 installed, the OKLCH cyberpunk palette defined in `.dark {}`, and pseudo-element glow utilities (`glow-cyan`, `glow-magenta`) established in `index.css`. All work targets `frontend/` files only (v1.1 is frontend-only per STATE.md).

The shadcn Card component uses `ring-1 ring-foreground/10` for its border — not a CSS `border` property. The gradient border for the login card must therefore use a different technique: a `padding: 1px` wrapper div with a CSS gradient background (not `border-image`, which conflicts with rounded corners cross-browser). This is the most important non-obvious constraint this phase faces.

**Primary recommendation:** Define all `@keyframes` in `index.css` as named custom utilities, then conditionally apply CSS classes in each component based on their reactive state prop. Keep the reduced-motion block last in `index.css` so it overrides all animation rules.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Node card pulse: CSS `@keyframes` with pseudo-element `::after` opacity animation (per STATE.md pitfall — no direct box-shadow animation), 2s infinite ease-in-out, cyan glow on connected cards only
- Stream live dot: Small cyan dot with `@keyframes pulse` opacity 0.4→1.0, 1.5s infinite, positioned next to "Stream" heading when output is actively streaming
- Page transitions: CSS `@keyframes fadeIn` opacity 0→1, 150ms ease-out, applied to route wrapper component
- VoiceButton recording ring: `@keyframes pulseRing` on magenta `::after` pseudo-element, scale 1→1.15, 1s infinite, active only while `isRecording` is true
- Grid background: CSS `background-image` with repeating linear gradients forming subtle grid lines — faint cyan on void-black
- Card gradient border: `border-image` with `linear-gradient(135deg, oklch(0.75 0.18 195), oklch(0.70 0.25 330))` (cyan to magenta)
- Title glow: `text-shadow` with multiple layers — `0 0 10px`, `0 0 20px`, `0 0 40px` of neon cyan on Orbitron heading
- Glitch animation: CSS `@keyframes glitch` — 300ms one-shot, horizontal offset + color channel split (red/cyan text-shadow), triggered by JS class toggle after successful login
- Single `@media (prefers-reduced-motion: reduce)` block in index.css: `animation: none !important; transition: none !important` globally
- ALL animations and transitions disabled when reduced motion is enabled — no exceptions
- Glitch animation trigger: JS class toggle after successful login API response, removed after 300ms via `setTimeout`; skipped entirely under reduced motion

### Claude's Discretion

- Exact @keyframes values for each animation (specific opacity/scale/offset percentages per keyframe step)
- Grid background line thickness and spacing
- Glitch animation specific offset values and color channel split distances
- fadeIn placement (route component wrapper vs. outlet)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANI-01 | Connected node cards display subtle pulsing glow animation | Pseudo-element opacity `@keyframes` on NodeCard; trigger on `node.status === 'connected'` |
| ANI-02 | Stream panel shows animated live dot when output is actively streaming | Inline dot element with opacity keyframes, shown when `isRunning` is true in StreamPanel |
| ANI-03 | VoiceButton displays pulsing magenta ring while recording | `::after` pseudo-element scale keyframes, class applied when `state === 'recording'` |
| ANI-04 | Page transitions use fade-in animation on route changes | Wrapper div around `<Outlet />` in `__root.tsx` with `animate-in fade-in` or custom `@keyframes fadeIn` class |
| ANI-05 | All animations respect `prefers-reduced-motion` OS setting | Single `@media (prefers-reduced-motion: reduce)` block at end of `index.css` |
| LGN-01 | Login page uses cyberpunk grid background pattern | CSS `background-image: repeating-linear-gradient(...)` on login page wrapper div |
| LGN-02 | Login card has gradient border treatment | Wrapper div technique (padding: 1px + gradient background) — NOT `border-image` due to shadcn Card using `ring-*` not `border` |
| LGN-03 | Login title has neon glow effect | `text-shadow` multi-layer on the CardTitle, Orbitron font already loaded |
| LGN-04 | Successful login triggers brief glitch animation before redirect | JS class toggle after API success, `setTimeout(300ms)` then navigate; skip under reduced motion |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CSS `@keyframes` | native | Custom animations: pulse, pulseRing, fadeIn, glitch | Zero-dependency, full control, no runtime overhead |
| `tw-animate-css` | 1.4.0 (installed) | Tailwind animation utilities (`animate-in`, `fade-in`, `duration-*`) | Already present; provides `animate-in` + enter keyframes for page transitions |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `prefers-reduced-motion` media query | CSS Level 4 (universal browser support) | Disable all animation for accessibility | Required by ANI-05; single block in `index.css` covers all |
| OKLCH tokens | (project) | `--primary` (cyan), `--accent` (magenta) values in keyframes | Use CSS vars so colors stay in sync with theme |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pseudo-element opacity animation for glow pulse | Direct `box-shadow` animation | Direct box-shadow causes layout repaints; pseudo-element uses compositor path — locked decision |
| Gradient wrapper div for login card border | `border-image` | `border-image` conflicts with `border-radius` in most browsers; wrapper div is the correct approach |
| JS class toggle for glitch | CSS animation on `:focus` or form state | One-shot on-success semantics not achievable with pure CSS; JS `setTimeout` is correct |

**Installation:**

No new packages required. All tools are already installed.

## Architecture Patterns

### Files Changed

```
frontend/src/
├── index.css                    # @keyframes + reduced-motion block
├── routes/
│   ├── login.tsx                # Grid bg, card border wrapper, title glow, glitch trigger
│   └── __root.tsx               # fadeIn wrapper around <Outlet />
└── components/
    ├── nodes/NodeCard.tsx       # pulse-glow class on connected cards
    ├── stream/StreamPanel.tsx   # live dot element when isRunning
    └── execute/VoiceButton.tsx  # pulse-ring class when recording
```

### Pattern 1: Pseudo-Element Pulse (ANI-01, ANI-03)

**What:** CSS utility class adds a `::after` pseudo-element that oscillates opacity on an infinite keyframe, producing a glowing pulse without repainting the element itself.

**When to use:** Any "always-on" infinite glow state tied to a boolean condition (connected, recording).

**Example:**
```css
/* In index.css @layer utilities */
.pulse-glow-cyan {
  position: relative;
  isolation: isolate;
}
.pulse-glow-cyan::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: transparent;
  box-shadow: 0 0 10px 3px oklch(0.75 0.18 195 / 70%);
  animation: glowPulse 2s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.3; }
  50%       { opacity: 1; }
}
```

```tsx
/* NodeCard.tsx — conditional class */
<Card className={cn(
  "bg-card border-border hover:border-primary/30 transition-colors cursor-pointer",
  node.status === 'connected' && "pulse-glow-cyan"
)}>
```

### Pattern 2: Live Dot (ANI-02)

**What:** A small `<span>` element placed inline next to the "Stream" heading, visible only when `isRunning`, with an opacity keyframe.

**When to use:** Point-in-time status indicator that must appear/disappear based on reactive state.

**Example:**
```css
@keyframes liveDotPulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1.0; }
}
.live-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: oklch(0.75 0.18 195); /* cyan */
  animation: liveDotPulse 1.5s ease-in-out infinite;
  vertical-align: middle;
}
```

```tsx
/* StreamPanel.tsx */
{isRunning && <span className="live-dot ml-2" aria-hidden="true" />}
```

### Pattern 3: Page Transition (ANI-04)

**What:** A wrapper `<div>` around `<Outlet />` in `__root.tsx` receives a CSS class that applies the `enter` keyframe from tw-animate-css using the `animate-in fade-in` utility chain, or a custom `page-fade-in` class.

**When to use:** Route-level fade-in on mount. The `key` prop triggers re-mount on route change.

**Recommendation:** Use tw-animate-css `animate-in fade-in duration-150` classes directly — this leverages the already-imported library rather than re-declaring a custom keyframe.

```tsx
/* __root.tsx — inside RootLayout, around Outlet */
<main className="flex-1 overflow-hidden">
  <div className="animate-in fade-in duration-150 h-full">
    <Outlet />
  </div>
</main>
```

Note: tw-animate-css `animate-in` uses the `enter` keyframe which starts `opacity: var(--tw-enter-opacity, 1)`. Adding `fade-in` sets `--tw-enter-opacity: 0`. Duration 150 maps to `animation-duration: .15s` via `animation-duration-*` utility.

### Pattern 4: VoiceButton Pulse Ring (ANI-03)

**What:** A scale + opacity keyframe on a `::after` pseudo-element expanding outward from the button, in magenta. Class applied only when `state === 'recording'`.

**Example:**
```css
.pulse-ring-magenta {
  position: relative;
}
.pulse-ring-magenta::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 9999px;
  border: 2px solid oklch(0.70 0.25 330 / 80%);
  animation: pulseRing 1s ease-out infinite;
  pointer-events: none;
}
@keyframes pulseRing {
  0%   { transform: scale(1);    opacity: 1; }
  100% { transform: scale(1.15); opacity: 0; }
}
```

```tsx
/* VoiceButton.tsx — on the Button element */
className={cn(
  state === 'recording' ? 'border-red-500 text-red-400 pulse-ring-magenta' : ''
)}
```

### Pattern 5: Login Gradient Card Border (LGN-02)

**What:** The shadcn Card uses `ring-1 ring-foreground/10` — not `border`. `border-image` does not work with `border-radius`. The correct approach is a gradient wrapper div with `padding: 1px` that shows through as the "border".

**Example:**
```tsx
{/* Gradient border wrapper */}
<div className="login-card-border w-full max-w-sm">
  <Card className="bg-card border-0 ring-0">
    ...
  </Card>
</div>
```

```css
.login-card-border {
  border-radius: var(--radius);      /* match card radius (0.625rem) */
  padding: 1px;
  background: linear-gradient(135deg, oklch(0.75 0.18 195), oklch(0.70 0.25 330));
}
```

### Pattern 6: Glitch Animation (LGN-04)

**What:** A CSS `@keyframes glitch` that applies horizontal translate offsets and red/cyan text-shadow splits. Triggered by adding a class with JS after login success. A `setTimeout(300)` removes the class then calls `navigate()`.

**Reduced motion handling:** Check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` before toggling the class and before setting the timeout — if true, navigate immediately without any animation.

**Example:**
```css
@keyframes glitch {
  0%   { transform: translateX(0);    text-shadow: none; }
  20%  { transform: translateX(-4px); text-shadow: -3px 0 oklch(0.65 0.22 25), 3px 0 oklch(0.75 0.18 195); }
  40%  { transform: translateX(4px);  text-shadow: 3px 0 oklch(0.65 0.22 25), -3px 0 oklch(0.75 0.18 195); }
  60%  { transform: translateX(-2px); text-shadow: -2px 0 oklch(0.65 0.22 25); }
  80%  { transform: translateX(2px);  text-shadow: 2px 0 oklch(0.75 0.18 195); }
  100% { transform: translateX(0);    text-shadow: none; }
}
.glitch-once {
  animation: glitch 300ms linear 1 forwards;
}
```

```tsx
// In handleSubmit, after setTokens():
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (!reducedMotion) {
  setGlitching(true)  // adds 'glitch-once' class to the card
  setTimeout(() => {
    navigate({ to: search.redirect || '/dashboard' })
  }, 300)
} else {
  navigate({ to: search.redirect || '/dashboard' })
}
```

### Anti-Patterns to Avoid

- **Animating `box-shadow` directly:** Causes GPU repaint on every frame. Use pseudo-element with opacity animation instead. This is a locked STATE.md constraint.
- **`border-image` on rounded elements:** Does not work with `border-radius` cross-browser. Use gradient wrapper div.
- **Stream row mount animations:** Adding `animate-in` to `StreamEventRenderer` rows will queue at >5 events/sec and cause visual jitter. Never add mount animations to stream rows (STATE.md pitfall).
- **Reduced-motion block before animations:** If the `@media (prefers-reduced-motion: reduce)` block appears before `@keyframes` definitions, specificity wins on the keyframes. Put the reduced-motion block last in `index.css`.
- **`@theme inline` for new animation tokens:** Do not add custom animation tokens here (OKLCH dark mode bug #18296). Put keyframe values inline.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Enter/fade page transition | Custom `@keyframes fadeIn` | `tw-animate-css` `animate-in fade-in duration-150` | Library already defines and imports the `enter` keyframe; re-using it is zero extra CSS |
| Reduced motion detection in JS | Custom hook with matchMedia | `window.matchMedia('(prefers-reduced-motion: reduce)')` inline | One-time check at event time; no hook needed |

**Key insight:** The hard part of this phase is knowing what NOT to use — no motion library, no border-image on rounded corners, no direct box-shadow animation.

## Common Pitfalls

### Pitfall 1: `border-image` Breaks Border Radius

**What goes wrong:** Setting `border-image` on a div with `border-radius` causes corners to appear square in all browsers — `border-image` overrides `border-radius`.

**Why it happens:** The CSS spec. `border-image` replaces the border, including its rounded shape.

**How to avoid:** Use the gradient wrapper div pattern (padding: 1px, background: gradient, border-radius matching inner element). The Card's `ring-1` must also be removed/overridden so it doesn't show through.

**Warning signs:** Login card corners appear square in dev after applying gradient border.

### Pitfall 2: `animate-in` Fires Only on Mount

**What goes wrong:** Wrapping `<Outlet />` in a `<div className="animate-in fade-in ...">` but not changing the element's `key` on route change means the div only mounts once and never re-runs the animation.

**Why it happens:** React reuses the DOM element between renders. The animation plays at mount, then the element stays in the DOM.

**How to avoid:** For TanStack Router, the Outlet re-renders on route changes but the wrapper div stays mounted. The `key` approach requires getting the current route path and passing it as `key` to the wrapper. Alternatively, define the fade-in class on the page-level component divs directly (each route component's root div), not on the Outlet wrapper — this way each route's component mounts fresh on navigation.

**Warning signs:** Page transition only works on first load, not on subsequent route navigations.

**Recommended resolution:** Apply `animate-in fade-in duration-150` to the outermost `<div>` of each individual route component (`LoginPage`, `DashboardPage`, etc.) rather than on the Outlet wrapper. This mounts fresh on every navigation. The CONTEXT.md says "route wrapper component" — this is the per-route component's root element, which is the safer interpretation.

### Pitfall 3: Reduced Motion Block Placement

**What goes wrong:** If `@media (prefers-reduced-motion: reduce)` is added near the top of `index.css`, later `@keyframes` and `animation` declarations may override it due to cascade order.

**Why it happens:** CSS cascade — later rules win at equal specificity.

**How to avoid:** Place the reduced-motion block as the very last rule in `index.css`, after all `@layer utilities` blocks and `@keyframes` definitions.

**Warning signs:** Animations still play on a macOS system set to reduce motion.

### Pitfall 4: Glitch JS setTimeout + Navigation Race

**What goes wrong:** If the user's login triggers network activity or React state updates during the 300ms glitch window, the navigation may fire before or during teardown.

**Why it happens:** The `setTimeout(navigate, 300)` stores a closure over the navigate function. React strict mode may trigger double effects.

**How to avoid:** Store the timeout ref with `useRef` and clear it in cleanup if the component unmounts. Keep the 300ms window very short to minimize exposure.

**Warning signs:** Console errors about state updates on unmounted components.

### Pitfall 5: Pseudo-Element z-index on Card Link

**What goes wrong:** The `NodeCard` is wrapped in a `<Link>`. Adding a `pulse-glow-cyan` class with `z-index: -1` on the pseudo-element may cause the glow to appear beneath the card body but above adjacent elements, or clip at the link's stacking context.

**Why it happens:** `isolation: isolate` creates a new stacking context. If the Link or Card has its own stacking context, `z-index: -1` is relative to that context.

**How to avoid:** Test visually with the Card background opacity. The existing `glow-cyan` pattern (z-index: -1, isolation: isolate) already handles this correctly — reuse the same structural pattern.

## Code Examples

Verified patterns from project source:

### Existing glow-cyan pattern to extend for pulse
```css
/* Source: frontend/src/index.css (current) */
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
```
The pulse-glow-cyan variant sets `opacity` as the animation target (not `box-shadow`) and removes the hover trigger — opacity starts at 0.3 and cycles.

### tw-animate-css `animate-in fade-in` usage
```tsx
/* tw-animate-css provides: animate-in (applies `enter` keyframe), fade-in (sets --tw-enter-opacity: 0) */
/* Combined: element fades from opacity 0 to 1 on mount */
<div className="animate-in fade-in duration-150 fill-mode-both">
  {children}
</div>
```
`fill-mode-both` ensures the element starts invisible before the animation frame fires.

### Repeating gradient grid background
```css
/* LGN-01 — background-image with two perpendicular linear gradients */
background-image:
  repeating-linear-gradient(
    0deg,
    oklch(0.75 0.18 195 / 5%) 0px,
    oklch(0.75 0.18 195 / 5%) 1px,
    transparent 1px,
    transparent 40px
  ),
  repeating-linear-gradient(
    90deg,
    oklch(0.75 0.18 195 / 5%) 0px,
    oklch(0.75 0.18 195 / 5%) 1px,
    transparent 1px,
    transparent 40px
  );
```
The 5% opacity keeps lines subtle. The 40px spacing creates a fine grid. Both values are in Claude's discretion.

### Orbitron title glow
```tsx
/* LGN-03 — inline style or CSS class on CardTitle */
style={{
  textShadow: '0 0 10px oklch(0.75 0.18 195), 0 0 20px oklch(0.75 0.18 195 / 70%), 0 0 40px oklch(0.75 0.18 195 / 40%)'
}}
```
Orbitron Variable is already loaded via `@fontsource-variable/orbitron` and available as `font-heading` class.

### Reduced motion global override
```css
/* Must be LAST in index.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JS animation libraries (Framer Motion) | CSS `@keyframes` + tw-animate-css | v1.1 decision (2026-03-24) | Zero runtime bundle cost; no JSDOM teardown issues |
| `border-image` for gradient borders | Gradient wrapper div (padding: 1px) | Browser spec limitation (always) | Must use wrapper technique for rounded corners |

**Deprecated/outdated:**
- `animation: pulse` from Tailwind base: The project imports Tailwind v4 + tw-animate-css, which provides its own animation system. The base `animate-pulse` class (background-color oscillation) is still available but not appropriate for glow-ring animations — use custom `@keyframes` instead.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all changes are CSS and React TSX edits to existing files).

## Sources

### Primary (HIGH confidence)
- Project source code — `frontend/src/index.css`, `NodeCard.tsx`, `StreamPanel.tsx`, `VoiceButton.tsx`, `login.tsx`, `__root.tsx`
- `frontend/src/types/api.ts` — `NodeResponse.status` values confirmed as `'connected' | 'stale' | 'disconnected'`
- `frontend/node_modules/tw-animate-css/dist/tw-animate.css` — `fade-in`, `animate-in`, `fill-mode-*` utilities confirmed present
- `.planning/STATE.md` — "Animating box-shadow directly causes repaints" and "No motion library in v1.1" locked decisions
- `10-CONTEXT.md` — all technique choices verified

### Secondary (MEDIUM confidence)
- CSS spec: `border-image` incompatibility with `border-radius` — well-documented browser behavior, consistent across all modern browsers
- `prefers-reduced-motion` — CSS Level 4 media query, universal support in all modern browsers

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools verified installed in node_modules
- Architecture: HIGH — all component file paths verified, glow pattern already established
- Pitfalls: HIGH — border-image/border-radius limitation is spec-level; box-shadow animation pitfall is locked in STATE.md; animate-in key issue is a React mount lifecycle known pattern

**Research date:** 2026-03-24
**Valid until:** 2026-05-24 (stable CSS patterns, no external API dependencies)

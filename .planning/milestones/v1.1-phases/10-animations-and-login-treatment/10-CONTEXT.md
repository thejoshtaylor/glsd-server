# Phase 10: Animations and Login Treatment - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add tasteful CSS animations to connected node cards, stream live indicator, VoiceButton recording state, and page transitions. Transform the login page into a cyberpunk first-impression with grid background, gradient card border, neon-glowing title, and glitch animation on success. All animations respect `prefers-reduced-motion`.

</domain>

<decisions>
## Implementation Decisions

### Animation Technique & Timing
- Node card pulse: CSS `@keyframes` with pseudo-element `::after` opacity animation (per STATE.md pitfall — no direct box-shadow animation), 2s infinite ease-in-out, cyan glow on connected cards only
- Stream live dot: Small cyan dot with `@keyframes pulse` opacity 0.4→1.0, 1.5s infinite, positioned next to "Stream" heading when output is actively streaming
- Page transitions: CSS `@keyframes fadeIn` opacity 0→1, 150ms ease-out, applied to route wrapper component
- VoiceButton recording ring: `@keyframes pulseRing` on magenta `::after` pseudo-element, scale 1→1.15, 1s infinite, active only while `isRecording` is true

### Login Page Treatment
- Grid background: CSS `background-image` with repeating linear gradients forming subtle grid lines — faint cyan on void-black
- Card gradient border: `border-image` with `linear-gradient(135deg, oklch(0.75 0.18 195), oklch(0.70 0.25 330))` (cyan to magenta)
- Title glow: `text-shadow` with multiple layers — `0 0 10px`, `0 0 20px`, `0 0 40px` of neon cyan on Orbitron heading
- Glitch animation: CSS `@keyframes glitch` — 300ms one-shot, horizontal offset + color channel split (red/cyan text-shadow), triggered by JS class toggle after successful login

### Reduced Motion Compliance
- Single `@media (prefers-reduced-motion: reduce)` block in index.css: `animation: none !important; transition: none !important` globally
- ALL animations and transitions disabled when reduced motion is enabled — no exceptions
- Glitch animation trigger: JS class toggle after successful login API response, removed after 300ms via `setTimeout`; skipped entirely under reduced motion

### Claude's Discretion
- Exact @keyframes values for each animation (specific opacity/scale/offset percentages per keyframe step)
- Grid background line thickness and spacing
- Glitch animation specific offset values and color channel split distances
- fadeIn placement (route component wrapper vs. outlet)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tw-animate-css` already installed (Phase 8) — provides base animation utilities
- `glow-cyan` and `glow-magenta` pseudo-element utilities from Phase 8
- Orbitron font loaded via `@fontsource-variable/orbitron`
- Cyberpunk OKLCH palette fully established in `.dark {}` block

### Established Patterns
- All glow effects use `::after` pseudo-element with opacity transition (STATE.md pitfall)
- No `prefers-reduced-motion` handling exists yet — this phase adds it
- Login page: `frontend/src/routes/login.tsx`
- Route wrapper: `frontend/src/routes/__root.tsx` (Outlet component)
- VoiceButton: `frontend/src/components/execute/VoiceButton.tsx`
- NodeCard: `frontend/src/components/nodes/NodeCard.tsx`
- StreamPanel: `frontend/src/components/stream/StreamPanel.tsx`

### Integration Points
- `frontend/src/index.css` — add @keyframes definitions and reduced-motion media query
- `frontend/src/routes/login.tsx` — grid background, gradient border, title glow, glitch
- `frontend/src/routes/__root.tsx` — page transition wrapper on Outlet
- Component files — add animation classes conditionally based on state

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decided animation strategies.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

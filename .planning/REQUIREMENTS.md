# Requirements: GLSD Server

**Defined:** 2026-03-24
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time

## v1.1 Requirements

Requirements for the Cyberpunk Beautification milestone. Each maps to roadmap phases.

### Color System

- [x] **CLR-01**: Dashboard uses void-black background with blue undertone across all views
- [x] **CLR-02**: Primary interactive elements use neon cyan color throughout
- [x] **CLR-03**: Accent elements use neon magenta color throughout
- [x] **CLR-04**: Borders use faint cyan tint instead of neutral gray
- [x] **CLR-05**: Glow utility classes (cyan and magenta) available for interactive elements
- [x] **CLR-06**: Focus rings use neon cyan across all focusable elements

### Icons

- [x] **ICN-01**: All dashboard sections have meaningful Lucide icons in headings
- [x] **ICN-02**: All action buttons display relevant icons (execute, kill, voice, filter)
- [x] **ICN-03**: All status indicators pair icons with color (instance states, node states)
- [x] **ICN-04**: Icon imports use direct paths for tree-shaking via centralized icons module

### Typography

- [x] **TYP-01**: Section headings use uppercase with letter-spacing for cyberpunk feel
- [x] **TYP-02**: Data fields (IDs, timestamps, command output) render in monospace font
- [x] **TYP-03**: Heading font (Orbitron) used for page titles and major section headers

### Component Polish

- [x] **CMP-01**: Node status badges use neon colors with subtle glow (cyan=connected, amber=stale, red=disconnected)
- [x] **CMP-02**: Audit event type badges use cyberpunk-themed colors
- [x] **CMP-03**: Loading states use skeleton components instead of plain text
- [x] **CMP-04**: Stream panel scroll FAB uses neon cyan with glow instead of generic blue
- [x] **CMP-05**: New shadcn dialog component available for confirmations
- [x] **CMP-06**: New shadcn tooltip component available for icon-only buttons
- [x] **CMP-07**: New shadcn progress component available for loading indicators
- [x] **CMP-08**: New shadcn tabs component available for view switching

### Animations

- [x] **ANI-01**: Connected node cards display subtle pulsing glow animation
- [x] **ANI-02**: Stream panel shows animated live dot when output is actively streaming
- [x] **ANI-03**: VoiceButton displays pulsing magenta ring while recording
- [x] **ANI-04**: Page transitions use fade-in animation on route changes
- [x] **ANI-05**: All animations respect `prefers-reduced-motion` OS setting

### Login Page

- [ ] **LGN-01**: Login page uses cyberpunk grid background pattern
- [ ] **LGN-02**: Login card has gradient border treatment
- [ ] **LGN-03**: Login title has neon glow effect
- [ ] **LGN-04**: Successful login triggers brief glitch animation before redirect

## Future Requirements

Deferred to v1.x or v2+. Tracked but not in current roadmap.

### Visual Enhancements

- **VIS-01**: Gradient borders on resizable panels
- **VIS-02**: Scanline decoration on empty-state areas (no readable text overlay)
- **VIS-03**: Motion library for scroll-linked or gesture animations
- **VIS-04**: Canvas grid background animation
- **VIS-05**: Light/dark theme switcher
- **VIS-06**: Manual reduce-motion toggle in settings

## Out of Scope

| Feature | Reason |
|---------|--------|
| xterm.js terminal emulation | Claude CLI output is NDJSON, not PTY — explicitly out of scope per PROJECT.md |
| Glass morphism (backdrop-filter: blur) | GPU repaints on scroll, conflicts with cyberpunk "used future" aesthetic |
| Scanline overlay on text content | Fails WCAG contrast on readable text; decorative-only deferred to VIS-02 |
| Ambient glitch animations | Continuous motion on labels creates cognitive load on monitoring dashboard |
| Canvas particle effects | CPU/GPU overhead, competes with functional data content |
| Framer Motion / motion in v1.1 | `tw-animate-css` already covers all v1.1 animation needs; motion deferred to VIS-03 |
| Per-component animation toggles | Over-engineering; `prefers-reduced-motion` at CSS layer is sufficient |
| Backend changes | v1.1 is frontend-only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLR-01 | Phase 8 | Complete |
| CLR-02 | Phase 8 | Complete |
| CLR-03 | Phase 8 | Complete |
| CLR-04 | Phase 8 | Complete |
| CLR-05 | Phase 8 | Complete |
| CLR-06 | Phase 8 | Complete |
| ICN-01 | Phase 9 | Complete |
| ICN-02 | Phase 9 | Complete |
| ICN-03 | Phase 9 | Complete |
| ICN-04 | Phase 9 | Complete |
| TYP-01 | Phase 8 | Complete |
| TYP-02 | Phase 8 | Complete |
| TYP-03 | Phase 8 | Complete |
| CMP-01 | Phase 9 | Complete |
| CMP-02 | Phase 9 | Complete |
| CMP-03 | Phase 9 | Complete |
| CMP-04 | Phase 9 | Complete |
| CMP-05 | Phase 9 | Complete |
| CMP-06 | Phase 9 | Complete |
| CMP-07 | Phase 9 | Complete |
| CMP-08 | Phase 9 | Complete |
| ANI-01 | Phase 10 | Complete |
| ANI-02 | Phase 10 | Complete |
| ANI-03 | Phase 10 | Complete |
| ANI-04 | Phase 10 | Complete |
| ANI-05 | Phase 10 | Complete |
| LGN-01 | Phase 10 | Pending |
| LGN-02 | Phase 10 | Pending |
| LGN-03 | Phase 10 | Pending |
| LGN-04 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 — traceability complete after roadmap creation*

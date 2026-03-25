# ROADMAP: GLSD Server

**Project:** GLSD Server
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time
**Granularity:** Coarse
**Created:** 2026-03-20

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-23) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Cyberpunk Beautification** — Phases 8-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-23</summary>

- [x] Phase 1: Foundation (2/2 plans) — completed 2026-03-21
- [x] Phase 2: Node Protocol Engine (4/4 plans) — completed 2026-03-21
- [x] Phase 3: Auth and Teams (4/4 plans) — completed 2026-03-21
- [x] Phase 4: Dashboard and Streaming (5/5 plans) — completed 2026-03-23
- [x] Phase 5: Voice and Audit (3/3 plans) — completed 2026-03-23
- [x] Phase 6: Frontend Production Deployment (1/1 plan) — completed 2026-03-23
- [x] Phase 7: Audit UI & Dashboard Auth Guard (2/2 plans) — completed 2026-03-23

</details>

### v1.1 Cyberpunk Beautification (In Progress)

**Milestone Goal:** Transform the entire frontend into a polished, cyberpunk-themed experience with consistent neon colors, iconography, typography, and micro-interactions.

- [x] **Phase 8: Color System and Foundation** - OKLCH neon palette, glow utilities, and typography tokens that all other v1.1 work depends on (completed 2026-03-24)
- [x] **Phase 9: Component Upgrades and Icon Pass** - Status badges, full Lucide icon coverage, shadcn additions, loading states, and component-level cyberpunk overrides (completed 2026-03-25)
- [ ] **Phase 10: Animations and Login Treatment** - Page transitions, recording state feedback, NodeCard pulse, stream live indicator, login cyberpunk treatment, and reduced-motion compliance

## Phase Details

### Phase 8: Color System and Foundation
**Goal**: The entire dashboard renders with a cyberpunk color palette — void-black background, neon cyan primaries, magenta accents, and faint cyan borders — established via CSS variables that all downstream components inherit automatically
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: CLR-01, CLR-02, CLR-03, CLR-04, CLR-05, CLR-06, TYP-01, TYP-02, TYP-03
**Success Criteria** (what must be TRUE):
  1. All dashboard views display a void-black background with visible blue undertone (not pure black, not gray)
  2. Interactive elements (buttons, links, focus rings) appear in neon cyan throughout every screen
  3. Accent elements render in neon magenta and borders use a faint cyan tint instead of neutral gray
  4. A glow utility class is available and applied — interactive elements have a visible neon halo on hover/focus
  5. Section headings appear uppercase with letter-spacing; IDs, timestamps, and stream output render in monospace; page titles use the Orbitron display font
**Plans**: 3 plans
Plans:
- [x] 08-01-PLAN.md — CSS tokens, font installation, glow utilities, structural fixes
- [x] 08-02-PLAN.md — Gray sweep across route files + typography application
- [x] 08-03-PLAN.md — Gray sweep across component files + button glow application
**UI hint**: yes

### Phase 9: Component Upgrades and Icon Pass
**Goal**: Every status badge, icon-bearing button, and data-dense component in the dashboard has been upgraded with neon colors, meaningful Lucide icons, and polished loading states — with four new shadcn components available for future use
**Depends on**: Phase 8
**Requirements**: ICN-01, ICN-02, ICN-03, ICN-04, CMP-01, CMP-02, CMP-03, CMP-04, CMP-05, CMP-06, CMP-07, CMP-08
**Success Criteria** (what must be TRUE):
  1. Node status badges display cyan for connected, amber for stale, and red for disconnected — each with a subtle glow
  2. All dashboard section headings, action buttons (execute, kill, voice, filter), and status indicators show relevant Lucide icons
  3. Loading states display skeleton shimmer components instead of plain "Loading..." text
  4. The stream panel scroll-to-bottom button renders in neon cyan with glow (not generic blue)
  5. Dialog, tooltip, progress, and tabs shadcn components are scaffolded and importable from the UI library
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — CSS glow utilities, icons.ts barrel, shadcn scaffold, icon migration
- [x] 09-02-PLAN.md — Status badge OKLCH colors, section heading icons, action button icons, FAB fix
- [x] 09-03-PLAN.md — Skeleton loading states for NodeGrid, InstanceList, and $nodeId route
**UI hint**: yes

### Phase 10: Animations and Login Treatment
**Goal**: The dashboard has tasteful CSS animations that respect the OS reduce-motion setting, the login page delivers a full cyberpunk first-impression, and real-time feedback states (recording, streaming, connected nodes) are visually distinct
**Depends on**: Phase 9
**Requirements**: ANI-01, ANI-02, ANI-03, ANI-04, ANI-05, LGN-01, LGN-02, LGN-03, LGN-04
**Success Criteria** (what must be TRUE):
  1. Connected node cards display a subtle pulsing cyan glow border animation; stream panel shows an animated live dot when output is actively streaming
  2. VoiceButton shows a pulsing magenta ring while the microphone is recording
  3. Navigating between dashboard routes shows a fade-in page transition (~150ms)
  4. Login page renders a cyberpunk grid background, gradient card border, and neon-glowing title; successful login triggers a brief one-shot glitch animation before redirect
  5. All animations are absent (no motion, no pulse) when the OS has prefers-reduced-motion enabled
**Plans**: 2 plans
Plans:
- [ ] 10-01-PLAN.md — CSS keyframes, animation utilities, reduced-motion block, component animations, page fade-ins
- [ ] 10-02-PLAN.md — Login page cyberpunk treatment (grid bg, gradient border, title glow, glitch)
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 8 -> 9 -> 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-21 |
| 2. Node Protocol Engine | v1.0 | 4/4 | Complete | 2026-03-21 |
| 3. Auth and Teams | v1.0 | 4/4 | Complete | 2026-03-21 |
| 4. Dashboard and Streaming | v1.0 | 5/5 | Complete | 2026-03-23 |
| 5. Voice and Audit | v1.0 | 3/3 | Complete | 2026-03-23 |
| 6. Frontend Production Deployment | v1.0 | 1/1 | Complete | 2026-03-23 |
| 7. Audit UI & Dashboard Auth Guard | v1.0 | 2/2 | Complete | 2026-03-23 |
| 8. Color System and Foundation | v1.1 | 0/3 | Complete    | 2026-03-24 |
| 9. Component Upgrades and Icon Pass | v1.1 | 0/3 | Complete    | 2026-03-25 |
| 10. Animations and Login Treatment | v1.1 | 0/2 | Not started | - |

---
*Roadmap created: 2026-03-20*
*Last updated: 2026-03-25 — Phase 10 planned (2 plans)*

# ROADMAP: GLSD Server

**Project:** GLSD Server
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time
**Granularity:** Coarse
**Created:** 2026-03-20

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-23) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Cyberpunk Beautification** — Phases 8-10 (shipped 2026-03-25) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Ease of Access** — Phases 11-13 (in progress)

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

<details>
<summary>✅ v1.1 Cyberpunk Beautification (Phases 8-10) — SHIPPED 2026-03-25</summary>

- [x] Phase 8: Color System and Foundation (3/3 plans) — completed 2026-03-24
- [x] Phase 9: Component Upgrades and Icon Pass (3/3 plans) — completed 2026-03-25
- [x] Phase 10: Animations and Login Treatment (2/2 plans) — completed 2026-03-25

</details>

### 🚧 v1.2 Ease of Access (In Progress)

**Milestone Goal:** Make the dashboard approachable for non-technical users with guided onboarding, simplified controls, and longer secure sessions.

- [x] **Phase 11: Extended Sessions** - Robust 1hr/7-day session lifecycle with atomic rotation and concurrency safety (completed 2026-03-25)
- [x] **Phase 12: WebSocket Reliability** - WS reconnect survives token expiry; audit page works on direct navigation (completed 2026-03-25)
- [ ] **Phase 13: UX Surface** - Onboarding guide page and simplified execute form

## Phase Details

### Phase 11: Extended Sessions
**Goal**: Users stay authenticated across long sessions without unexpected logouts, and token rotation is safe against concurrent refresh calls
**Depends on**: Phase 10
**Requirements**: SES-01, SES-02, SES-03, SES-04, SES-05
**Success Criteria** (what must be TRUE):
  1. User remains logged in for at least 1 hour without re-authenticating
  2. Resuming the app after 6+ hours silently refreshes the session without a login redirect
  3. Two simultaneous refresh calls (e.g., tab restore + background query) result in exactly one new token pair, not a logged-out state
  4. Presenting a previously rotated refresh token revokes all of that user's refresh tokens and forces re-login
**Plans**: 2 plans
Plans:
- [x] 11-01-PLAN.md — Backend token rotation with atomic SQL, reuse detection, and family-scoped revocation
- [x] 11-02-PLAN.md — Frontend singleton promise guard, proactive refresh, and tab visibility refresh

### Phase 12: WebSocket Reliability
**Goal**: WebSocket connection recovers automatically after token expiry, and all dashboard routes including Audit work when navigated to directly
**Depends on**: Phase 11
**Requirements**: WSR-01, WSR-02
**Success Criteria** (what must be TRUE):
  1. Resuming a backgrounded tab with an expired access token restores the live WebSocket feed without a page reload or login redirect
  2. Navigating directly to /dashboard/audit (or bookmarking it) shows live audit events without requiring navigation from another dashboard page
**Plans**: 1 plan
Plans:
- [x] 12-01-PLAN.md — Auth-aware WS reconnect and layout-level WebSocket connection

### Phase 13: UX Surface
**Goal**: Non-technical users can discover how to connect a node and dispatch their first execution without needing external documentation
**Depends on**: Phase 11
**Requirements**: ONB-01, ONB-02, ONB-03, CTL-01, CTL-02, CTL-03, CTL-04
**Success Criteria** (what must be TRUE):
  1. A new user with zero nodes sees a link to the onboarding guide from the empty node list
  2. The onboarding page at /dashboard/onboarding shows numbered setup steps with one-click copy buttons for every CLI command
  3. The execute form presents a project picker, a preset prompt selector, and plain-language field labels without requiring prior knowledge of the API
  4. The onboarding guide is reachable from the main navigation at any time
**Plans**: 2 plans
Plans:
- [ ] 13-01-PLAN.md — Onboarding page, sidebar nav link, and empty-state CTA
- [ ] 13-02-PLAN.md — Execute form project picker, preset prompts, labels, and advanced disclosure

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 2/2 | Complete | 2026-03-21 |
| 2. Node Protocol Engine | v1.0 | 4/4 | Complete | 2026-03-21 |
| 3. Auth and Teams | v1.0 | 4/4 | Complete | 2026-03-21 |
| 4. Dashboard and Streaming | v1.0 | 5/5 | Complete | 2026-03-23 |
| 5. Voice and Audit | v1.0 | 3/3 | Complete | 2026-03-23 |
| 6. Frontend Production Deployment | v1.0 | 1/1 | Complete | 2026-03-23 |
| 7. Audit UI & Dashboard Auth Guard | v1.0 | 2/2 | Complete | 2026-03-23 |
| 8. Color System and Foundation | v1.1 | 3/3 | Complete | 2026-03-24 |
| 9. Component Upgrades and Icon Pass | v1.1 | 3/3 | Complete | 2026-03-25 |
| 10. Animations and Login Treatment | v1.1 | 2/2 | Complete | 2026-03-25 |
| 11. Extended Sessions | v1.2 | 2/2 | Complete    | 2026-03-25 |
| 12. WebSocket Reliability | v1.2 | 1/1 | Complete    | 2026-03-25 |
| 13. UX Surface | v1.2 | 0/2 | Not started | - |

---
*Roadmap created: 2026-03-20*
*Last updated: 2026-03-25 — Phase 13 plans created*

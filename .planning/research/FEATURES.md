# Feature Research

**Domain:** Ease of Access — remote node management dashboard (GLSD Server v1.2)
**Researched:** 2026-03-24
**Confidence:** HIGH (existing codebase inspected; JWT/WebSocket patterns verified via official docs and community sources; onboarding UX patterns verified via multiple sources)

## Context

This is a subsequent milestone. The dashboard already ships JWT auth, execute form, WebSocket streaming, audit log, voice input, node status tracking, and cyberpunk theming. This research covers ONLY the new v1.2 features:

- In-app node onboarding guide page (step-by-step, copyable commands)
- Simplified execute form (preset prompts, project picker, plain-language labels)
- Extended sessions (1hr access token + 7-day silent refresh token rotation)
- INT-01 fix: WebSocket reconnect refreshes expired tokens automatically
- INT-02 fix: Audit page establishes WebSocket on direct navigation

**Existing constraints:**
- Python FastAPI + PyJWT 2.x backend — refresh token rotation is additive, not a rewrite
- React 19 + TanStack Router + TanStack Query + Zustand frontend
- shadcn/ui components already installed: `dialog`, `tooltip`, `progress`, `tabs` (scaffolded but unconsumed — available for this milestone)
- WebSocket connection is managed client-side, currently does not re-fetch tokens on reconnect
- Audit page WebSocket is currently only established when navigating from within the SPA (not on direct URL load)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that non-technical users expect in a tool they're being asked to adopt. Missing these makes the tool feel hostile or incomplete for onboarding use cases.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Copyable command blocks in onboarding guide | Developers and non-developers both expect one-click copy for CLI commands — manually selecting monospace text is error-prone and frustrating | LOW | `navigator.clipboard.writeText()` with a copy icon button beside each code block. Show transient "Copied!" confirmation (1.5s, then reset). shadcn `Tooltip` or inline state. No library needed. |
| Step-by-step numbered flow in onboarding guide | Users absorb procedural instructions best as an ordered checklist — a wall of prose fails; random bullets fail. 3–5 steps is the established ceiling before cognitive load spikes. | LOW | `<ol>` with styled step numbers. GSD node setup has a natural sequence: install, authenticate, run — maps cleanly to 3–4 steps. Use existing `Card` component per step. |
| Visual "done" indicator on onboarding steps | Non-technical users need confirmation that each step worked before proceeding — ambiguity causes support requests | MEDIUM | The server already knows if a node has connected (node status tracking). Step 3/4 ("Node connects") can auto-check when a node for this team transitions to `connected`. Requires a query or WS event to detect. |
| Preset prompt options in execute form | Non-technical users can't construct Claude CLI prompts from scratch — blank text fields with no affordance cause form abandonment | LOW | A `<Select>` or segmented button group with 4–6 curated preset prompts. Selecting a preset populates the prompt textarea (editable after selection). Uses existing shadcn `Select` component. |
| Project picker (not free-text project field) | Typing a project path is fragile — typos silently dispatch to the wrong project. Non-technical users don't know project paths. | LOW | Replace the free-text project input with a `<Select>` populated from the node's `projects` array (already exposed in node state). Falls back to free-text if node has no projects listed. |
| Plain-language form labels | The current form labels `node_id`, `project`, `prompt` are machine field names — non-technical users need semantic labels | LOW | Rename labels: `node_id` → "Target Node", `project` → "Project", `prompt` → "What should Claude do?". Add helper text under each. Zero backend changes. |
| Session stays alive across a work session | Users expect not to be logged out mid-task. A 15-minute access token with no visible refresh feels like the app is broken. | MEDIUM | 1hr access token eliminates mid-task logouts. Silent refresh on a background interval (or on 401 intercept) keeps the session alive for 7 days without visible interruption. Standard pattern: Axios/fetch interceptor catches 401, calls `/auth/refresh`, retries. |
| WebSocket doesn't drop on tab sleep/resume | Browser tabs sleep after inactivity; WebSocket closes. Reconnecting to a disconnected socket with an expired token shows auth errors — feels broken | MEDIUM | INT-01: On reconnect, check token expiry before attempting WS upgrade. If expired, call `/auth/refresh` first, then connect. TanStack Query already manages token state — read from store before reconnect. |
| Audit page works on direct navigation | Users bookmark pages or share links. An audit page that loads blank on direct URL is a UX failure. | LOW | INT-02: The WS connection for the audit page's live updates must be established in a `useEffect` triggered by route mount, not by prior navigation state. Likely a missing `useEffect` dependency or a guard that assumes prior auth context. |

### Differentiators (Competitive Advantage)

Features that make this specific dashboard stand out for a team managing distributed Claude CLI nodes — not standard SaaS expected behavior, but meaningful for this use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Node-aware onboarding guide (shows real node_id for this team) | Generic "your-node-id-here" placeholders create copy-paste errors. Showing the actual registered node IDs — or the team's registration token — makes onboarding concrete and error-free. | MEDIUM | Requires reading team/node data from the API. If team has no nodes yet, show placeholder with a call-to-action. If team has nodes, show them inline. Already have the data; this is a display decision. |
| Preset prompts that match actual GSD use cases | Generic presets ("Summarize this", "Write a function") don't match Claude CLI / GSD workflows. Domain-specific presets ("Review the current git diff", "Explain this codebase") convert significantly better for this user base. | LOW | Static list curated for GSD workflows. No personalization needed at v1.2. Editable after selection so power users can still customize. |
| Form remembers last-used project and node | Non-technical users typically execute on the same node/project repeatedly. Restoring last selection eliminates repeated picking. | LOW | `localStorage` or Zustand persist. Read on mount, write on successful dispatch. No backend changes. Standard form persistence pattern. |
| Onboarding checklist with auto-completion detection | When a node connects for the first time after following the guide, mark the guide as complete — gives users a "first win" moment. Proven to increase engagement by closing the loop. | HIGH | Requires detecting first-ever node connection per user. Backend needs a flag or the frontend tracks "onboarding completed" in localStorage keyed to the user. Auto-detect via TanStack Query polling or the existing WS event stream. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-step wizard modal for onboarding | Wizards feel polished and guided | Modal wizards block the rest of the UI, can't be bookmarked or linked, and interrupt users who return partway through. For a technical setup flow (install CLI, run command, wait for connection), blocking modal UX is wrong — users need to leave the tab and come back. | Dedicated `/onboarding` route page that persists state across navigation. Accessible via sidebar nav link. Non-blocking. |
| OAuth / "Sign in with Google" for extended sessions | Avoids token management complexity | Explicitly out of scope in PROJECT.md — "OAuth/SSO login is out of scope for v1". Refresh token rotation achieves the same UX goal (stay logged in) without scope expansion. | 7-day refresh token rotation with silent renewal achieves the session durability goal. |
| Per-user preset customization / saved presets | Power users want to save their own prompts | Requires a new DB table, a management UI, and CRUD endpoints. Scope creep for v1.2 — the goal is lower the floor for non-technical users, not add a feature management surface. | Editable text field after preset selection. If users want to save a custom prompt, they use the text field directly. Defer custom saved presets to v2. |
| Onboarding tour overlays (tooltip chain on dashboard) | Overlay tours are a common SaaS pattern | A monitoring dashboard during active use is the wrong moment for a tour. Node detail pages, audit filters, and stream panels are state-dependent — overlaying them before a node is connected creates confusion about what the user is actually seeing. Additionally, the `dialog`, `tooltip` scaffolded components can support this, but the effort/value ratio is low when a dedicated guide page covers the same ground statelessly. | Static guide page at `/onboarding` that users visit deliberately. No overlay, no tooltip chain. |
| Access token stored in `localStorage` (extended duration) | Simple to implement | Long-lived tokens in `localStorage` are a XSS attack surface. Extending access token to 1hr already increases risk window vs. the current short-lived token. Storing 7-day refresh tokens in `localStorage` would be significantly worse. | Refresh tokens in `httpOnly` cookies (server sets `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict`). Access tokens in memory (Zustand store). This is the auth industry standard pattern. |
| Inline prompt history / replay in execute form | Power user convenience | Scope creep for v1.2. Adds storage, display, and UX complexity (which history? team-wide or per-user?). The audit log already shows command history — the answer is "go look at the audit page". | Audit page already covers command history. Link to it from the execute form if needed. |

---

## Feature Dependencies

```
Extended session (1hr access + 7-day refresh rotation)
    └──required-by──> WebSocket token refresh on reconnect (INT-01)
                          (INT-01 needs a valid refresh endpoint to call on reconnect)
    └──required-by──> Silent session renewal (frontend interceptor)
                          (interceptor calls /auth/refresh — endpoint must exist with rotation logic)

Node projects list (existing, already in node state)
    └──required-by──> Project picker Select component
                          (picker is populated from node.projects — empty if node has no projects)

Node connection status (existing, already tracked)
    └──enhances──> Onboarding guide auto-completion detection
                       (detect first node connect to close the loop)

TanStack Query token state (existing, in Zustand)
    └──required-by──> INT-01 WS token check on reconnect
                          (read token from store, check expiry, refresh if needed before WS connect)

Route-level useEffect (INT-02 fix)
    └──no-dependencies──> Standalone fix, isolated to AuditPage component
```

### Dependency Notes

- **Extended sessions must be implemented before INT-01.** The WS reconnect fix (INT-01) calls `/auth/refresh` on reconnect — that endpoint must support rotation semantics (issue new access + refresh pair, invalidate old refresh) before the client-side reconnect logic is safe to ship.
- **Project picker gracefully degrades.** If the selected node has no `projects` array (or it's empty), the picker falls back to a free-text input. The backend already exposes `projects` in node state — this is a frontend-only concern.
- **INT-02 is fully isolated.** The audit page WebSocket fix has no upstream dependencies. It can be built and shipped in any order relative to the other features.
- **Onboarding guide has no hard backend dependencies.** The guide content is mostly static markup with copyable commands. The node-aware enhancement (showing real node IDs) is additive — the page works without it.

---

## MVP Definition (v1.2 Ease of Access)

### Launch With (v1.2)

These are the five features defined in PROJECT.md as the milestone target. All are required.

- [ ] Node onboarding guide page at `/onboarding` — step-by-step, copyable command blocks, links to GSD node install, plain prose — why essential: the single biggest blocker for non-technical users is not knowing how to connect a node
- [ ] Simplified execute form — preset prompts via Select, project picker from node.projects, relabeled fields with helper text — why essential: blank form with machine-named fields fails non-technical users at first use
- [ ] Extended session duration — 1hr access token, 7-day httpOnly refresh token with rotation on every use — why essential: 15-minute access tokens with no silent renewal log users out mid-task, destroying trust in the tool
- [ ] INT-01: WebSocket reconnect refreshes expired token — call `/auth/refresh` before reconnect if token is expired — why essential: current behavior shows auth errors on tab resume, which reads as "the app is broken"
- [ ] INT-02: Audit page WebSocket on direct navigation — establish WS in `useEffect` on route mount, not on prior navigation — why essential: direct links and bookmarks are broken today; this is table stakes for a web app

### Add After Validation (v1.x)

- [ ] Form state persistence (last-used node + project in localStorage) — trigger: user feedback that they repeat the same selection every time
- [ ] Onboarding checklist auto-completion (detect first node connect) — trigger: onboarding drop-off metrics show users don't know if their setup worked
- [ ] Node-aware guide content (show real node IDs inline) — trigger: support requests indicating users copy wrong node IDs from generic placeholders

### Future Consideration (v2+)

- [ ] Personalized saved prompt presets (per-user CRUD) — defer: requires DB table, API endpoints, and management UI; the v1.2 curated preset list addresses the non-technical user need
- [ ] Overlay onboarding tour (tooltip chain on dashboard) — defer: only valuable after nodes are connected and users are actively using the dashboard; wrong moment for a setup tour

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Extended session duration (1hr + 7-day rotation) | HIGH | MEDIUM | P1 |
| INT-01: WS token refresh on reconnect | HIGH | LOW | P1 |
| Node onboarding guide page | HIGH | LOW | P1 |
| Simplified execute form (presets + picker) | HIGH | LOW | P1 |
| INT-02: Audit page WS on direct nav | MEDIUM | LOW | P1 |
| Form state persistence (localStorage) | MEDIUM | LOW | P2 |
| Onboarding auto-completion detection | MEDIUM | HIGH | P3 |
| Node-aware guide content | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Required for milestone — directly addresses the "Ease of Access" goal
- P2: High value, low cost — add in same phase if time allows
- P3: Additive enhancement — schedule for v1.3 or later

---

## Implementation Notes by Feature

### Node Onboarding Guide Page

**Expected behavior:** A dedicated route (`/onboarding`) accessible from the sidebar navigation. Static content with 3–4 numbered steps covering: install GSD node CLI, get the server URL and team token, run the node, verify connection. Each code block has a copy button (`navigator.clipboard.writeText`) with a transient "Copied!" state (1.5s). Steps use existing `Card` + `Badge` components. No backend API calls required for the static version.

**UX pattern:** "Getting Started" page, not modal wizard. Users can leave mid-flow and return. No overlay disruption. Content is instructional prose + code blocks, consistent with developer tool onboarding conventions (Vercel, Railway, Fly.io all use this pattern for infrastructure setup).

**Complexity note:** LOW. This is primarily a new route with static content and a clipboard utility. The highest complexity element is deciding whether to detect node connection state to mark steps as complete — that enhancement is P3 and should be deferred unless the base page ships quickly.

### Simplified Execute Form

**Expected behavior:** The existing `ExecuteForm` component gets three changes: (1) The `project` text input becomes a `Select` populated from `node.projects` (falls back to text input if empty). (2) A "Preset Prompts" `Select` appears above the prompt textarea — selecting a preset populates the textarea, which remains editable. (3) Field labels change: `node_id` → "Target Node", `project` → "Project", `prompt` → "What should Claude do?", with a `<p>` helper text element under each. No backend changes.

**Presets to include (curated for GSD/Claude CLI use cases):**
- "Review the current git diff and summarize changes"
- "Explain the main entry point of this codebase"
- "List all TODO comments in the project"
- "Write unit tests for the selected file"
- "Check for potential security issues"
- (Custom — leave field blank for free-form entry)

### Extended Session Duration + Silent Refresh

**Expected behavior:** Backend issues access tokens with 1hr expiry and refresh tokens with 7-day expiry, stored in `httpOnly; Secure; SameSite=Strict` cookies. Frontend never touches the refresh token directly. A fetch/axios interceptor catches 401 responses, calls `POST /auth/refresh` (which reads the httpOnly cookie automatically), receives a new access token in the response body, stores it in Zustand, and retries the original request. Refresh tokens are rotated on every use (new refresh token issued, old one invalidated) — the backend must track issued refresh tokens to support revocation.

**Key security pattern:** Access token in memory (Zustand), refresh token in httpOnly cookie. This is the OWASP-recommended pattern for SPAs. It eliminates the XSS attack surface for the refresh token.

**Backend changes required:** (1) Extend `ACCESS_TOKEN_EXPIRE_MINUTES` from current value to 60. (2) Add `REFRESH_TOKEN_EXPIRE_DAYS = 7`. (3) Set refresh token via `Set-Cookie` header on login + refresh responses. (4) Add `POST /auth/refresh` endpoint that reads the cookie, validates + rotates the refresh token, returns new access token. (5) Add `refresh_tokens` table (or store in Redis/PostgreSQL) for rotation tracking.

### INT-01: WebSocket Token Refresh on Reconnect

**Expected behavior:** The WS connection manager on the frontend checks if the stored access token is expired (or within a short window, e.g., 30s of expiry) before attempting a reconnect. If expired, it calls `POST /auth/refresh` first, updates the Zustand token state, then opens the WS connection with the fresh token. This resolves the current behavior where reconnect attempts with an expired token fail silently or show auth errors.

**Dependency:** Requires the `/auth/refresh` endpoint from the extended session feature above.

**Implementation pattern:** In the WS connection hook (wherever `useWebSocket` or equivalent lives), add a `refreshIfNeeded()` call in the reconnect logic before the `new WebSocket(url)` call. Use the token expiry timestamp from Zustand to decide without an extra network call.

### INT-02: Audit Page WebSocket on Direct Navigation

**Expected behavior:** Navigating directly to `/audit` (by URL, bookmark, or page refresh) establishes the WebSocket connection for live audit events. Currently this only works when navigating from within the SPA.

**Root cause pattern:** The WS connection for the audit page is likely initialized in a component that assumes an already-authenticated app shell has already established the connection, or the WS setup is conditional on prior navigation state. The fix is to ensure the audit page's `useEffect` (or equivalent TanStack Query setup) establishes its WS subscription on route mount unconditionally, with auth token available from Zustand (which is hydrated from localStorage or the auth check on app load).

---

## Sources

- [Auth0: Refresh Tokens — What Are They and When to Use Them](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) — httpOnly cookie pattern, rotation semantics (HIGH confidence — official Auth0 docs)
- [The Developer's Guide to Refresh Token Rotation — Descope](https://www.descope.com/blog/post/refresh-token-rotation) — Rotation implementation patterns, reuse detection (MEDIUM confidence)
- [WebSocket Best Practices for Production Applications — WebSocket.org](https://websocket.org/guides/best-practices/) — Reconnect + auth token patterns (MEDIUM confidence)
- [JWT Token Lifecycle Management — SkyCloak](https://skycloak.io/blog/jwt-token-lifecycle-management-expiration-refresh-revocation-strategies/) — Token expiry, refresh, revocation strategies (MEDIUM confidence)
- [Onboarding UX Best Practices 2025 — UX Design Institute](https://www.uxdesigninstitute.com/blog/ux-onboarding-best-practices-guide/) — Getting Started page patterns vs. modal wizard (MEDIUM confidence)
- [Getting Started Pattern — UX Patterns for Devs](https://uxpatterns.dev/patterns/getting-started) — Dedicated page vs. overlay patterns (MEDIUM confidence)
- [Dashboard Design UX Patterns — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards) — Preset/filter patterns in dashboard forms (MEDIUM confidence)
- [Onboarding UX — Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/onboarding-ux/) — Step count, checklist patterns, "first win" principle (MEDIUM confidence)

---
*Feature research for: GLSD Server v1.2 Ease of Access*
*Researched: 2026-03-24*

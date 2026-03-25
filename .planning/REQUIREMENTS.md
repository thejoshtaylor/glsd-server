# Requirements: GLSD Server

**Defined:** 2026-03-25
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time

## v1.2 Requirements

Requirements for the Ease of Access milestone. Each maps to roadmap phases.

### Session Security

- [ ] **SES-01**: Access token expires after 1 hour (up from current ~30min)
- [ ] **SES-02**: Refresh token expires after 7 days and silently rotates on use
- [ ] **SES-03**: Refresh token rotation uses atomic SQL (UPDATE...RETURNING) to prevent race conditions
- [ ] **SES-04**: Reuse detection revokes all user refresh tokens when a rotated-out token is replayed
- [ ] **SES-05**: Frontend uses singleton promise guard to deduplicate concurrent refresh calls

### WebSocket Reliability

- [ ] **WSR-01**: WebSocket reconnect refreshes expired access token before requesting new ticket (INT-01 fix)
- [ ] **WSR-02**: Audit page establishes WebSocket connection on direct navigation (INT-02 fix)

### Onboarding

- [ ] **ONB-01**: Dedicated /onboarding route with step-by-step node setup instructions
- [ ] **ONB-02**: All CLI commands on onboarding page have copy-to-clipboard buttons
- [ ] **ONB-03**: Empty node list displays link to onboarding guide

### Simplified Controls

- [ ] **CTL-01**: Execute form shows project picker dropdown populated from selected node's project list
- [ ] **CTL-02**: Execute form offers preset prompt selector that populates the prompt textarea (editable)
- [ ] **CTL-03**: Execute form uses plain-language field labels and contextual help text
- [ ] **CTL-04**: Navigation includes link to onboarding guide page

## Future Requirements

Deferred to v1.x or v2+. Tracked but not in current roadmap.

### Security Hardening

- **SEC-01**: Refresh token stored in httpOnly cookie instead of localStorage
- **SEC-02**: Token reuse detection triggers security alert notification
- **SEC-03**: Session management UI (view active sessions, revoke)

### UX Enhancements

- **UXE-01**: WS disconnection banner with auto-reconnect countdown
- **UXE-02**: Onboarding connection status indicator (live check if node connects)
- **UXE-03**: Prompt history/favorites for quick re-execution

## Out of Scope

| Feature | Reason |
|---------|--------|
| httpOnly cookie for refresh token | Requires CORS + cookie middleware changes; deferred to SEC-01 |
| OAuth/SSO login | JWT with email/password is sufficient for v1.x |
| Mobile app | Web dashboard only |
| Node-side changes | Server consumes existing node protocol as-is |
| Prompt templates library | Over-engineering; preset selector with editable textarea is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SES-01 | Phase 11 | Pending |
| SES-02 | Phase 11 | Pending |
| SES-03 | Phase 11 | Pending |
| SES-04 | Phase 11 | Pending |
| SES-05 | Phase 11 | Pending |
| WSR-01 | Phase 12 | Pending |
| WSR-02 | Phase 12 | Pending |
| ONB-01 | Phase 13 | Pending |
| ONB-02 | Phase 13 | Pending |
| ONB-03 | Phase 13 | Pending |
| CTL-01 | Phase 13 | Pending |
| CTL-02 | Phase 13 | Pending |
| CTL-03 | Phase 13 | Pending |
| CTL-04 | Phase 13 | Pending |

**Coverage:**
- v1.2 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-25*

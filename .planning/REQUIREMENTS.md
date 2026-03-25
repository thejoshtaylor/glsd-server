# Requirements: GLSD Server

**Defined:** 2026-03-25
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time

## v1.2 Requirements

Requirements for the Ease of Access milestone. Each maps to roadmap phases.

### Session Security

- [x] **SES-01**: Access token expires after 1 hour (up from current ~30min)
- [x] **SES-02**: Refresh token expires after 7 days and silently rotates on use
- [x] **SES-03**: Refresh token rotation uses atomic SQL (UPDATE...RETURNING) to prevent race conditions
- [x] **SES-04**: Reuse detection revokes all user refresh tokens when a rotated-out token is replayed
- [x] **SES-05**: Frontend uses singleton promise guard to deduplicate concurrent refresh calls

### WebSocket Reliability

- [x] **WSR-01**: WebSocket reconnect refreshes expired access token before requesting new ticket (INT-01 fix)
- [x] **WSR-02**: Audit page establishes WebSocket connection on direct navigation (INT-02 fix)

### Onboarding

- [x] **ONB-01**: Dedicated /onboarding route with step-by-step node setup instructions
- [x] **ONB-02**: All CLI commands on onboarding page have copy-to-clipboard buttons
- [x] **ONB-03**: Empty node list displays link to onboarding guide

### Simplified Controls

- [x] **CTL-01**: Execute form shows project picker dropdown populated from selected node's project list
- [x] **CTL-02**: Execute form offers preset prompt selector that populates the prompt textarea (editable)
- [x] **CTL-03**: Execute form uses plain-language field labels and contextual help text
- [x] **CTL-04**: Navigation includes link to onboarding guide page

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
| SES-01 | Phase 11 | Complete |
| SES-02 | Phase 11 | Complete |
| SES-03 | Phase 11 | Complete |
| SES-04 | Phase 11 | Complete |
| SES-05 | Phase 11 | Complete |
| WSR-01 | Phase 12 | Complete |
| WSR-02 | Phase 12 | Complete |
| ONB-01 | Phase 13 | Complete |
| ONB-02 | Phase 13 | Complete |
| ONB-03 | Phase 13 | Complete |
| CTL-01 | Phase 13 | Complete |
| CTL-02 | Phase 13 | Complete |
| CTL-03 | Phase 13 | Complete |
| CTL-04 | Phase 13 | Complete |

**Coverage:**
- v1.2 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-25*

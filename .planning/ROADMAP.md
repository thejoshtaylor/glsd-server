# ROADMAP: GLSD Server

**Project:** GLSD Server
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time
**Granularity:** Coarse
**Created:** 2026-03-20

---

## Phases

- [x] **Phase 1: Foundation** - Project scaffold, PostgreSQL schema, async DB patterns, Docker Compose deployment (completed 2026-03-21)
- [x] **Phase 2: Node Protocol Engine** - Full GSD wire protocol, node gateway, command dispatch, instance lifecycle, reconciliation, health monitoring (completed 2026-03-21)
- [ ] **Phase 3: Auth and Teams** - JWT user authentication, team multi-tenancy, ownership enforcement on all endpoints
- [ ] **Phase 4: Dashboard and Streaming** - Frontend WebSocket gateway, React dashboard, live stream output
- [ ] **Phase 5: Voice and Audit** - Whisper voice transcription, audit trail logging

---

## Phase Details

### Phase 1: Foundation

**Goal:** The server runs, the database schema exists, and all async infrastructure patterns are established correctly — every subsequent phase builds on this without retrofitting

**Depends on:** Nothing (first phase)

**Requirements:** DEPLOY-01, DEPLOY-02, DEPLOY-03

**Success Criteria** (what must be TRUE):
1. `docker-compose up` starts FastAPI + PostgreSQL with a single Uvicorn worker and no errors
2. All database tables (nodes, instances, users, teams, team_members, audit_log) exist after container startup via Alembic migrations
3. All secrets (SERVER_TOKEN, OPENAI_API_KEY, DB credentials, JWT secret) are consumed from environment variables with no hardcoded values
4. Connecting a second Uvicorn worker is blocked at the configuration level (single-worker constraint enforced in compose)

**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Backend scaffold: FastAPI app, config, database, models, Alembic, health endpoint
- [x] 01-02-PLAN.md — Docker infrastructure: Dockerfile, entrypoint, docker-compose, env config, migration generation

---

### Phase 2: Node Protocol Engine

**Goal:** GSD nodes can connect, authenticate, execute workloads, and the server correctly tracks all node and instance state — the full server-side execution engine works end-to-end with no user-facing UI

**Depends on:** Phase 1

**Requirements:** NODE-01, NODE-02, NODE-03, NODE-04, NODE-05, NODE-06, NODE-07, NODE-08, NODE-09, RECON-01, RECON-02, RECON-03, RECON-04, RECON-05, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, INST-01, INST-02, INST-03, INST-04, INST-05, INST-06, INST-07, TOKN-01, TOKN-02, TOKN-03

**Success Criteria** (what must be TRUE):
1. A GSD node connects to `wss://server/ws/node` with a valid Bearer token and is registered; a connection with an invalid token is rejected before the WebSocket handshake completes
2. An execute command dispatched to a connected node produces instance state transitions: `pending` -> `running` -> `finished` (or `errored`), all persisted in PostgreSQL
3. A node that drops unexpectedly (no `node_disconnect` frame) has all its running instances marked as errored, and reconnecting the same `node_id` triggers reconciliation that correctly classifies instances as lost, recovered, or running
4. A node that has not sent a ping in >90 seconds is marked as stale; its running instances are marked errored
5. Rotating the SERVER_TOKEN allows both old and new tokens to be accepted during a grace period, with no connected nodes disconnected

**Plans:** 4/4 plans complete

Plans:
- [x] 02-01-PLAN.md — Protocol contracts: Pydantic models, ConnectionManager, token rotation config, StreamEvent model + migration
- [x] 02-02-PLAN.md — WebSocket endpoint: /ws/node auth, message dispatch loop, all handlers, reconciliation, disconnect handling
- [x] 02-03-PLAN.md — Command dispatch: execute, kill, status_request functions as reusable service layer
- [x] 02-04-PLAN.md — Health monitor: stale node scanner background task with lifespan wiring

---

### Phase 3: Auth and Teams

**Goal:** Users can register, log in, and manage teams — and every node, instance, and command is scoped to the authenticated user's team membership with no cross-team data leakage

**Depends on:** Phase 2

**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, TEAM-01, TEAM-02, TEAM-03, TEAM-04, TEAM-05, TEAM-06, TEAM-07

**Success Criteria** (what must be TRUE):
1. A new user can register with email and password; a personal team is automatically created; the user receives JWT access and refresh tokens on login
2. An expired access token can be refreshed without re-login; unauthenticated requests to any protected endpoint receive 401
3. A user can create a team, invite another user, and assign a node to the team; invited user can then see that node; uninvited user cannot see it
4. Execute and kill commands are rejected if the requesting user's team does not own the target node
5. A frontend WebSocket connection authenticates via a short-lived JWT ticket issued from a REST endpoint (ticket as query param)

**Plans:** 1/4 plans executed

Plans:
- [x] 03-01-PLAN.md — Data layer: ORM models (RefreshToken, WsTicket, NodeTeam), Alembic migration, schemas, config, get_current_user dependency
- [ ] 03-02-PLAN.md — Auth service and routes: register (with personal team), login, refresh, logout, ws-ticket
- [ ] 03-03-PLAN.md — Team service and routes: team CRUD, member management, node assignment
- [ ] 03-04-PLAN.md — Multi-tenancy enforcement: node service, command dispatch auth, health auth, frontend WebSocket ticket endpoint

---

### Phase 4: Dashboard and Streaming

**Goal:** Users see their fleet in the browser, dispatch commands, and watch Claude CLI output stream live in real time

**Depends on:** Phase 3

**Requirements:** STRM-01, STRM-02, STRM-03, STRM-04, STRM-05, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10

**Success Criteria** (what must be TRUE):
1. The dashboard shows all nodes belonging to the user's teams with live connected/stale/disconnected status badges that update without a page refresh
2. User can select a node, choose a project, enter a prompt, and click Execute; the button is disabled until the instance is acknowledged; live Claude CLI output appears in the stream panel as it arrives
3. User can kill a running instance from the dashboard; the instance transitions to errored state and the UI reflects this immediately
4. The stream output panel renders structured NDJSON (assistant text, tool use, system events) distinctly rather than as raw JSON, and auto-scrolls with a user override
5. User sees a staleness warning when a node has not pinged in >90s; user is alerted when an unrecognized `node_id` connects for the first time; past completed instances and their output are browsable

**Plans:** TBD

---

### Phase 5: Voice and Audit

**Goal:** Users can speak prompts and have them transcribed into the execute prompt field; all commands and events are recorded in an append-only audit log

**Depends on:** Phase 4

**Requirements:** VOICE-01, VOICE-02, VOICE-03, VOICE-04, VOICE-05, AUDIT-01, AUDIT-02, AUDIT-03

**Success Criteria** (what must be TRUE):
1. User can click a record button, speak a prompt, and see the transcribed text appear in the execute prompt field ready to dispatch
2. Audio uploads over 25MB are rejected with a clear error before any call to OpenAI; the transcription endpoint requires authentication
3. Every execute and kill command dispatched is recorded in the audit log with node_id, instance_id, user_id, type, and timestamp
4. Every terminal instance event received (instance_finished, instance_error) is recorded in the audit log; the log is queryable and append-only

**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/2 | Complete   | 2026-03-21 |
| 2. Node Protocol Engine | 4/4 | Complete   | 2026-03-21 |
| 3. Auth and Teams | 1/4 | In Progress|  |
| 4. Dashboard and Streaming | 0/? | Not started | - |
| 5. Voice and Audit | 0/? | Not started | - |

---

## Requirement Coverage

**Total v1 requirements:** 67
**Mapped:** 67/67
**Unmapped:** 0

| Phase | Requirements |
|-------|-------------|
| 1 - Foundation | DEPLOY-01, DEPLOY-02, DEPLOY-03 |
| 2 - Node Protocol Engine | NODE-01-09, RECON-01-05, CMD-01-05, INST-01-07, TOKN-01-03 |
| 3 - Auth and Teams | AUTH-01-05, TEAM-01-07 |
| 4 - Dashboard and Streaming | STRM-01-05, DASH-01-10 |
| 5 - Voice and Audit | VOICE-01-05, AUDIT-01-03 |

---
*Roadmap created: 2026-03-20*
*Last updated: 2026-03-21 after Phase 3 planning*

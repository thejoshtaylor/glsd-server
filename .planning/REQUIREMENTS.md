# Requirements: GLSD Server

**Defined:** 2026-03-20
**Core Value:** Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Node Connection

- [x] **NODE-01**: Server accepts inbound WebSocket connections from nodes at `wss://server/ws/node`
- [x] **NODE-02**: Server validates Bearer token during HTTP upgrade handshake (401/403 on failure)
- [x] **NODE-03**: Server expects `node_register` as the first frame after WebSocket upgrade
- [x] **NODE-04**: Server tracks node state: `connected`, `stale`, `disconnected`
- [x] **NODE-05**: Server handles node reconnection gracefully (same `node_id`, new connection)
- [x] **NODE-06**: Server responds to WebSocket pings with pongs (standard protocol behavior)
- [x] **NODE-07**: Server tracks `last_heartbeat` per node, marks stale after >90s no ping
- [x] **NODE-08**: Server handles `node_disconnect` frame and marks node as disconnected
- [x] **NODE-09**: Server marks all instances as errored when node drops unexpectedly

### State Reconciliation

- [x] **RECON-01**: On reconnect, server compares node's `running_instances` with tracked instances
- [x] **RECON-02**: Instances in server but not in node's list are marked as errored/lost
- [x] **RECON-03**: Instances in node's list but not in server are added as running
- [x] **RECON-04**: Instances in both are updated (session_id if changed, confirm running)
- [x] **RECON-05**: Per-node locking prevents concurrent reconnect races from corrupting state

### Command Dispatch

- [x] **CMD-01**: Server can send `execute` command with server-generated `instance_id` (UUID)
- [x] **CMD-02**: Server can send `kill` command to terminate a running instance
- [x] **CMD-03**: Server can send `status_request` to query current node state
- [x] **CMD-04**: Server validates project exists on target node before dispatching execute
- [x] **CMD-05**: Server validates target node is connected before dispatching commands

### Instance Lifecycle

- [x] **INST-01**: Server tracks instance status: `pending`, `running`, `finished`, `errored`
- [x] **INST-02**: Server processes `ack` and marks instance as running
- [x] **INST-03**: Server processes `instance_started` and captures `session_id`
- [x] **INST-04**: Server forwards `stream_event` data to subscribed frontend clients
- [x] **INST-05**: Server processes `instance_finished` with exit code
- [x] **INST-06**: Server processes `instance_error` with error message
- [x] **INST-07**: Server correctly handles rate-limited execute (immediate `instance_error`, no ack)

### Stream Processing

- [ ] **STRM-01**: Server parses `stream_event.data` as double-encoded JSON (NDJSON line)
- [ ] **STRM-02**: Server forwards parsed stream events to frontend WebSocket subscribers
- [x] **STRM-03**: Frontend renders structured NDJSON (text responses, tool use, system events)
- [x] **STRM-04**: Stream output panel auto-scrolls with user override
- [ ] **STRM-05**: Stream events are persisted for instance history/replay

### Authentication

- [x] **AUTH-01**: User can register with email and password
- [x] **AUTH-02**: User can log in and receive JWT access + refresh tokens
- [x] **AUTH-03**: User can refresh expired access token using refresh token
- [x] **AUTH-04**: Unauthenticated requests are rejected with 401
- [x] **AUTH-05**: Frontend WebSocket connections use JWT ticket auth (REST-issued short-lived ticket as query param)

### Teams

- [x] **TEAM-01**: Every user has a personal team created on registration
- [x] **TEAM-02**: User can create additional teams
- [x] **TEAM-03**: User can invite other users to their teams
- [x] **TEAM-04**: Nodes are assigned to teams
- [x] **TEAM-05**: Users can only see and manage nodes belonging to their teams
- [x] **TEAM-06**: Execute/kill commands enforce team ownership validation
- [x] **TEAM-07**: A node can be shared across multiple teams

### Token Management

- [x] **TOKN-01**: Server supports rotating `SERVER_TOKEN` without disconnecting live nodes
- [x] **TOKN-02**: During rotation, both old and new tokens are accepted in a grace period
- [x] **TOKN-03**: Admin can revoke old token after grace period

### Dashboard

- [x] **DASH-01**: User sees a list of all nodes in their teams with live status indicators
- [x] **DASH-02**: User can view per-node instance list with lifecycle state
- [x] **DASH-03**: User can dispatch an execute command (select node, project, enter prompt)
- [x] **DASH-04**: User can kill a running instance from the dashboard
- [x] **DASH-05**: User sees live streaming output as Claude CLI produces it
- [x] **DASH-06**: User sees health staleness warning when node hasn't pinged in >90s
- [x] **DASH-07**: User is alerted when a previously-unseen `node_id` connects
- [x] **DASH-08**: User sees clear error messages when instances fail (including rate limit)
- [x] **DASH-09**: User can resume a previous Claude session via `session_id`
- [x] **DASH-10**: User can browse past completed instances and their full output

### Voice Input

- [ ] **VOICE-01**: User can record audio in the browser using MediaRecorder API
- [ ] **VOICE-02**: Audio is sent to server REST endpoint (`POST /api/transcribe`)
- [ ] **VOICE-03**: Server transcribes audio via OpenAI Whisper API (`whisper-1` model)
- [ ] **VOICE-04**: Transcribed text populates the prompt field for execute dispatch
- [ ] **VOICE-05**: Server enforces 25MB file size limit for audio uploads

### Audit Trail

- [ ] **AUDIT-01**: All commands dispatched are logged (node_id, instance_id, user_id, type, timestamp)
- [ ] **AUDIT-02**: All events received are logged (node_id, instance_id, type, timestamp, error details)
- [ ] **AUDIT-03**: Audit log is append-only and queryable

### Deployment

- [x] **DEPLOY-01**: Server runs via Docker Compose (FastAPI + PostgreSQL + React frontend)
- [x] **DEPLOY-02**: Single-worker Uvicorn configuration (in-memory connection registry constraint)
- [x] **DEPLOY-03**: Environment variable configuration for all secrets (SERVER_TOKEN, OPENAI_API_KEY, DB credentials, JWT secret)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhancements

- **ENH-01**: OAuth/SSO login (Google, GitHub)
- **ENH-02**: Per-project cost dashboards (parse Claude CLI cost fields from NDJSON)
- **ENH-03**: Output search/filter within stream panel
- **ENH-04**: Real-time collaboration (multiple users watching same instance)
- **ENH-05**: Kubernetes deployment
- **ENH-06**: Horizontal server scaling (Redis pub/sub for cross-worker WebSocket state)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile app | Web dashboard covers all use cases; responsive design for tablets |
| Node-side changes | Nodes are already deployed at v1.2.0; server consumes protocol as-is |
| xterm.js terminal emulation | Claude CLI output is NDJSON, not PTY; structured renderer is appropriate |
| In-browser audio editing | Voice input is transcribe-and-dispatch, not a recording studio |
| User-editable node configuration | Nodes configured via environment variables on the host |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NODE-01 | Phase 2 | Complete |
| NODE-02 | Phase 2 | Complete |
| NODE-03 | Phase 2 | Complete |
| NODE-04 | Phase 2 | Complete |
| NODE-05 | Phase 2 | Complete |
| NODE-06 | Phase 2 | Complete |
| NODE-07 | Phase 2 | Complete |
| NODE-08 | Phase 2 | Complete |
| NODE-09 | Phase 2 | Complete |
| RECON-01 | Phase 2 | Complete |
| RECON-02 | Phase 2 | Complete |
| RECON-03 | Phase 2 | Complete |
| RECON-04 | Phase 2 | Complete |
| RECON-05 | Phase 2 | Complete |
| CMD-01 | Phase 2 | Complete |
| CMD-02 | Phase 2 | Complete |
| CMD-03 | Phase 2 | Complete |
| CMD-04 | Phase 2 | Complete |
| CMD-05 | Phase 2 | Complete |
| INST-01 | Phase 2 | Complete |
| INST-02 | Phase 2 | Complete |
| INST-03 | Phase 2 | Complete |
| INST-04 | Phase 2 | Complete |
| INST-05 | Phase 2 | Complete |
| INST-06 | Phase 2 | Complete |
| INST-07 | Phase 2 | Complete |
| STRM-01 | Phase 4 | Pending |
| STRM-02 | Phase 4 | Pending |
| STRM-03 | Phase 4 | Complete |
| STRM-04 | Phase 4 | Complete |
| STRM-05 | Phase 4 | Pending |
| AUTH-01 | Phase 3 | Complete |
| AUTH-02 | Phase 3 | Complete |
| AUTH-03 | Phase 3 | Complete |
| AUTH-04 | Phase 3 | Complete |
| AUTH-05 | Phase 3 | Complete |
| TEAM-01 | Phase 3 | Complete |
| TEAM-02 | Phase 3 | Complete |
| TEAM-03 | Phase 3 | Complete |
| TEAM-04 | Phase 3 | Complete |
| TEAM-05 | Phase 3 | Complete |
| TEAM-06 | Phase 3 | Complete |
| TEAM-07 | Phase 3 | Complete |
| TOKN-01 | Phase 2 | Complete |
| TOKN-02 | Phase 2 | Complete |
| TOKN-03 | Phase 2 | Complete |
| DASH-01 | Phase 4 | Complete |
| DASH-02 | Phase 4 | Complete |
| DASH-03 | Phase 4 | Complete |
| DASH-04 | Phase 4 | Complete |
| DASH-05 | Phase 4 | Complete |
| DASH-06 | Phase 4 | Complete |
| DASH-07 | Phase 4 | Complete |
| DASH-08 | Phase 4 | Complete |
| DASH-09 | Phase 4 | Complete |
| DASH-10 | Phase 4 | Complete |
| VOICE-01 | Phase 5 | Pending |
| VOICE-02 | Phase 5 | Pending |
| VOICE-03 | Phase 5 | Pending |
| VOICE-04 | Phase 5 | Pending |
| VOICE-05 | Phase 5 | Pending |
| AUDIT-01 | Phase 5 | Pending |
| AUDIT-02 | Phase 5 | Pending |
| AUDIT-03 | Phase 5 | Pending |
| DEPLOY-01 | Phase 1 | Complete |
| DEPLOY-02 | Phase 1 | Complete |
| DEPLOY-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 67 total
- Mapped to phases: 67
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after roadmap creation*

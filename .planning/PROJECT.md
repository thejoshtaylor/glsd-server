# GLSD Server

## What This Is

A central management server for GSD nodes — remote agents that run Claude CLI instances. The server accepts inbound WebSocket connections from nodes, dispatches commands (execute, kill, status), streams real-time output, and provides a full web dashboard for team-based management. It includes voice-to-text input via OpenAI Whisper so users can speak prompts that get transcribed and dispatched to nodes.

## Core Value

Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time — the command-and-control plane that makes remote Claude instances usable.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] PostgreSQL persistence for node/instance/user/team state — Validated in Phase 1: Foundation (schema created, all 6 tables)
- [x] Docker Compose deployment — Validated in Phase 1: Foundation (single-command startup)
- [x] WebSocket server accepting node connections with Bearer token auth — Validated in Phase 2: Node Protocol Engine
- [x] Full GSD wire protocol implementation (all 10 message types) — Validated in Phase 2: Node Protocol Engine
- [x] Node state tracking (connected, stale, disconnected) — Validated in Phase 2: Node Protocol Engine
- [x] Instance lifecycle management (pending, running, finished, errored) — Validated in Phase 2: Node Protocol Engine
- [x] State reconciliation on node reconnect — Validated in Phase 2: Node Protocol Engine
- [x] Node health monitoring via WebSocket ping/pong heartbeats — Validated in Phase 2: Node Protocol Engine
- [x] Command dispatch: execute, kill, status_request — Validated in Phase 2: Node Protocol Engine
- [x] Team-based multi-tenancy (nodes belong to teams, users belong to teams, personal team by default) — Validated in Phase 3: Auth and Teams
- [x] JWT authentication for frontend users — Validated in Phase 3: Auth and Teams
- [x] Stream event forwarding to frontend in real time — Validated in Phase 4: Dashboard and Streaming
- [x] Full web dashboard: node list, instance management, live streaming output — Validated in Phase 4: Dashboard and Streaming
- [x] OpenAI Whisper voice transcription — Validated in Phase 5: Voice and Audit (human UAT pending for browser mic tests)
- [x] Audit trail logging for commands and events — Validated in Phase 5: Voice and Audit

### Active

<!-- Current scope. Building toward these. -->

(All v1 requirements complete)

### Out of Scope

- OAuth/SSO login — JWT with email/password is sufficient for v1
- Kubernetes deployment — Docker Compose is the v1 target
- Mobile app — web dashboard only
- Node-side changes — server consumes the existing node protocol as-is
- Horizontal server scaling — single-instance server for v1

## Context

- The GSD node implementation already exists (v1.2.0, written in Go). The server is the missing piece.
- Wire protocol is fully specified in `protocol-spec.md` — 10 message types, JSON over WebSocket.
- Server spec is in `server-spec.md` — covers WebSocket endpoint, data models, command dispatch, event handling, reconciliation, health monitoring, Whisper integration, security.
- Nodes connect outbound to the server (NAT-friendly). The server never connects to nodes.
- Each node has a stable hardware-derived `node_id`. Nodes reconnect with exponential backoff and send state snapshots on reconnect.
- Terminal event guarantee: exactly one of `instance_finished` or `instance_error` per instance (enforced by `sync.Once` on the node side).
- Stream events contain NDJSON lines from Claude CLI — the server must parse and forward these.

## Constraints

- **Tech stack**: Python FastAPI (backend), React (frontend), PostgreSQL (database)
- **Protocol compatibility**: Must implement the GSD wire protocol v1.2.0 exactly as specified — nodes are already deployed
- **Deployment**: Docker Compose for v1
- **Node behavior**: Nodes send WebSocket pings every 30s, expect pongs, reconnect with exponential backoff (500ms–30s) — server must handle all of this gracefully

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python FastAPI over Go | User preference for Python ecosystem | — Pending |
| PostgreSQL over in-memory | Need persistence across server restarts; nodes reconcile but user/team data must survive | — Pending |
| Team-based multi-tenancy | Nodes belong to teams, users can be on multiple teams, everyone gets a personal team | — Pending |
| JWT auth for frontend | Standard, well-understood, good library support in FastAPI | — Pending |
| Whisper in v1 | Voice input is a core feature, not a nice-to-have | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-21 after Phase 3: Auth and Teams completion*

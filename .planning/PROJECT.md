# GLSD Server

## What This Is

A central management server for GSD nodes — remote agents that run Claude CLI instances. The server accepts inbound WebSocket connections from nodes, dispatches commands (execute, kill, status), streams real-time output, and provides a full web dashboard for team-based management. It includes voice-to-text input via OpenAI Whisper so users can speak prompts that get transcribed and dispatched to nodes.

## Core Value

Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time — the command-and-control plane that makes remote Claude instances usable.

## Current State

Shipped v1.0 MVP with ~6,300 LOC (3,600 Python + 2,700 TypeScript).

**Tech stack:** Python 3.12 FastAPI + SQLAlchemy 2 async + asyncpg + PostgreSQL 16 (backend), React 19 + TanStack Router + TanStack Query + Zustand + shadcn/ui + Tailwind v4 (frontend), Nginx (reverse proxy), Docker Compose (deployment).

**Architecture:** Two WebSocket endpoints (`/ws/node` for GSD nodes, `/ws/frontend` for browser clients), in-memory ConnectionManager with PostgreSQL persistence, EventRouter with asyncio queue fan-out, single Uvicorn worker constraint.

**Known tech debt:** WebSocket reconnect doesn't refresh expired tokens (INT-01, high priority for v1.1). Audit page missing WebSocket on direct navigation (INT-02, low). 4 browser/mic features need human UAT.

## Requirements

### Validated

- ✓ PostgreSQL persistence for node/instance/user/team state — v1.0
- ✓ Docker Compose deployment (FastAPI + PostgreSQL + Nginx + React) — v1.0
- ✓ WebSocket server accepting node connections with Bearer token auth — v1.0
- ✓ Full GSD wire protocol v1.2.0 implementation (all 10 message types) — v1.0
- ✓ Node state tracking (connected, stale, disconnected) — v1.0
- ✓ Instance lifecycle management (pending, running, finished, errored) — v1.0
- ✓ State reconciliation on node reconnect — v1.0
- ✓ Node health monitoring via WebSocket ping/pong heartbeats — v1.0
- ✓ Command dispatch: execute, kill, status_request — v1.0
- ✓ Team-based multi-tenancy — v1.0
- ✓ JWT authentication for frontend users — v1.0
- ✓ Stream event forwarding to frontend in real time — v1.0
- ✓ Full web dashboard: node list, instance management, live streaming output — v1.0
- ✓ OpenAI Whisper voice transcription — v1.0 (human UAT pending for browser mic tests)
- ✓ Audit trail logging for commands and events — v1.0
- ✓ Frontend production deployment via Nginx in Docker Compose — v1.0
- ✓ Audit trail UI with filterable, paginated log — v1.0
- ✓ Dashboard auth guard redirecting unauthenticated users to login — v1.0

## Current Milestone: v1.1 Cyberpunk Beautification

**Goal:** Transform the entire frontend into a polished, cyberpunk-themed experience with intuitive controls, consistent iconography, gradients, and UX improvements.

**Target features:**
- Cyberpunk color theme with gradients across all views
- Lucide icon library integration with meaningful, consistent icons
- shadcn/ui component upgrades (buttons, cards, dialogs, tables)
- UX polish: loading states, transitions, micro-interactions
- Navigation flow improvements
- Consistent spacing, typography, and visual hierarchy across all screens

### Active

- [x] Cyberpunk color theme with gradients across all views — Phase 8
- [ ] Lucide icon integration with consistent, meaningful iconography
- [ ] shadcn/ui component upgrades across all screens
- [ ] UX polish: loading states, transitions, micro-interactions
- [ ] Navigation flow improvements
- [x] Consistent spacing, typography, and visual hierarchy — Phase 8 (foundation tokens)

### Out of Scope

- OAuth/SSO login — JWT with email/password is sufficient for v1
- Kubernetes deployment — Docker Compose is the v1 target
- Mobile app — web dashboard only
- Node-side changes — server consumes the existing node protocol as-is
- Horizontal server scaling — single-instance server for v1
- xterm.js terminal emulation — Claude CLI output is NDJSON, not PTY
- In-browser audio editing — voice input is transcribe-and-dispatch only

## Context

- The GSD node implementation already exists (v1.2.0, written in Go). The server is the missing piece — now shipped.
- Wire protocol is fully specified in `protocol-spec.md` — 10 message types, JSON over WebSocket.
- Server spec is in `server-spec.md`.
- Nodes connect outbound to the server (NAT-friendly). The server never connects to nodes.
- Each node has a stable hardware-derived `node_id`. Nodes reconnect with exponential backoff and send state snapshots on reconnect.
- Terminal event guarantee: exactly one of `instance_finished` or `instance_error` per instance (enforced by `sync.Once` on the node side).
- Stream events contain NDJSON lines from Claude CLI — the server parses and forwards these.

## Constraints

- **Tech stack**: Python FastAPI (backend), React (frontend), PostgreSQL (database)
- **Protocol compatibility**: Must implement the GSD wire protocol v1.2.0 exactly as specified — nodes are already deployed
- **Deployment**: Docker Compose for v1
- **Node behavior**: Nodes send WebSocket pings every 30s, expect pongs, reconnect with exponential backoff (500ms–30s) — server must handle all of this gracefully

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Python FastAPI over Go | User preference for Python ecosystem | ✓ Good — async FastAPI handles WS + REST cleanly |
| PostgreSQL over in-memory | Need persistence across server restarts | ✓ Good — asyncpg + SQLAlchemy 2 async performs well |
| Team-based multi-tenancy | Nodes belong to teams, users can be on multiple teams | ✓ Good — clean scoping throughout |
| JWT auth for frontend | Standard, well-understood, good library support | ✓ Good — PyJWT 2.x works well |
| Whisper in v1 | Voice input is a core feature, not a nice-to-have | ✓ Good — minimal integration effort |
| Single Uvicorn worker | In-memory ConnectionManager can't share across processes | ⚠️ Revisit for v2 horizontal scaling |
| asyncpg + SQLAlchemy 2 async | Blocking DB calls in event loop cascade into node timeouts | ✓ Good — async-only from day one |
| EventRouter asyncio queues | Per-connection queues with dedicated writer coroutines | ✓ Good — decouples routing from network I/O |
| Stream events not persisted to DB | Only terminal state transitions in PostgreSQL | ⚠️ Revisit — frontend-side buffer only |
| No refresh token rotation v1 | Simplicity; rotation is a v2 enhancement | ⚠️ Revisit for security hardening |

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
*Last updated: 2026-03-24 after Phase 8 completion*

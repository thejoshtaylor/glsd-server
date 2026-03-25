# GLSD Server

## What This Is

A purpose-built control plane for GSD (Get Shit Done) nodes — remote agents that run Claude CLI instances. The server accepts inbound WebSocket connections from nodes, dispatches commands (execute, kill, status), streams real-time output, and provides a polished cyberpunk-themed web dashboard for team-based management. It includes voice-to-text input via OpenAI Whisper, in-app onboarding for new users, secure long-lived sessions with automatic token rotation, and GSD-aware stream parsing that detects interactive prompts and renders them as clickable UI elements.

## Core Value

Reliably connect to distributed GSD nodes, dispatch Claude CLI executions, and stream results back to users in real time — the command-and-control plane that makes remote Claude instances usable.

## Current State

Shipped v1.2 Ease of Access with ~4,000 LOC TypeScript frontend + ~3,800 LOC Python backend. Starting v1.3 GSD Integration.

**Tech stack:** Python 3.12 FastAPI + SQLAlchemy 2 async + asyncpg + PostgreSQL 16 (backend), React 19 + TanStack Router + TanStack Query + Zustand + shadcn/ui + Tailwind v4 (frontend), Nginx (reverse proxy), Docker Compose (deployment).

**Frontend features (v1.2):** OKLCH cyberpunk color palette, Orbitron display font, Lucide icons throughout, skeleton loading states, CSS animations with reduced-motion compliance, onboarding guide page with copy-to-clipboard commands, simplified execute form with project picker and preset prompts, singleton refresh guard with proactive token refresh, auth-aware WebSocket reconnect.

**Known tech debt:** Hard-reload direct navigation redirects to login before async refresh resolves (pre-existing — beforeLoad checks in-memory token synchronously). 3 orphaned CSS glow utilities (glow-amber, glow-red, glow-magenta). 4 scaffolded shadcn components not yet consumed (dialog, tooltip, progress, tabs). Daily token cleanup sweep not implemented (login-time cleanup covers primary case).

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
- ✓ OpenAI Whisper voice transcription — v1.0
- ✓ Audit trail logging for commands and events — v1.0
- ✓ Frontend production deployment via Nginx in Docker Compose — v1.0
- ✓ Audit trail UI with filterable, paginated log — v1.0
- ✓ Dashboard auth guard redirecting unauthenticated users to login — v1.0
- ✓ Cyberpunk OKLCH color palette across all views — v1.1
- ✓ Lucide icon integration with consistent iconography — v1.1
- ✓ shadcn/ui component upgrades and skeleton loading states — v1.1
- ✓ CSS animations with reduced-motion compliance — v1.1
- ✓ Cyberpunk login page treatment — v1.1
- ✓ Typography system (Orbitron, monospace, uppercase headings) — v1.1
- ✓ Extended session duration (1hr access + 7-day refresh with rotation) — v1.2
- ✓ WebSocket token refresh on reconnect (INT-01 fix) — v1.2
- ✓ Audit page WebSocket on direct navigation (INT-02 fix) — v1.2
- ✓ Node onboarding guide page with copy-to-clipboard — v1.2
- ✓ Simplified execute form with project picker and preset prompts — v1.2

## Current Milestone: v1.3 GSD Integration

**Goal:** Transform the server from a generic Claude CLI relay into a purpose-built GSD control plane with project management, intelligent stream parsing, interactive question UIs, and autonomous command sequencing.

**Target features:**
- Project management on nodes (create, connect existing folder, clone GitHub repo)
- GSD command palette with contextual buttons for ~20 key commands
- Stream intelligence — parse NDJSON to detect AskUserQuestion, freeform input waits, command completion
- Interactive response UI — render questions as buttons, checkboxes, or text fields
- Notifications when nodes need input or complete work
- Auto mode — sequential GSD command execution with /clear between steps, default + custom sequences

### Active

### Out of Scope

- OAuth/SSO login — JWT with email/password is sufficient for v1
- Kubernetes deployment — Docker Compose is the v1 target
- Mobile app — web dashboard only
- Node-side changes — server consumes the existing node protocol as-is
- Horizontal server scaling — single-instance server for v1
- xterm.js terminal emulation — Claude CLI output is NDJSON, not PTY
- In-browser audio editing — voice input is transcribe-and-dispatch only
- httpOnly cookie for refresh token — deferred to future security hardening
- Prompt templates library — preset selector with editable textarea is sufficient

## Context

- The GSD node implementation already exists (v1.2.0, written in Go). The server is shipped through v1.2.
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
| Opaque refresh token rotation | Atomic SQL rotation with family-based reuse detection | ✓ Good — implemented in Phase 11 |
| OKLCH tokens in :root/.dark only | @theme inline bakes static values — dark mode bug #18296 | ✓ Good — v1.1 confirmed |
| Pseudo-element glow, not box-shadow | Direct box-shadow animation causes repaints | ✓ Good — smooth animations |
| Lucide via icons.ts barrel | Barrel import from lucide-react slows dev 5-8x | ✓ Good — centralized re-exports |
| No motion library in v1.1 | tw-animate-css + CSS @keyframes covers all needs | ✓ Good — zero extra deps |
| WS close code 4001 for auth failure | Distinguishes auth failure from network errors in reconnect logic | ✓ Good — clean client-side handling |
| useWebSocket in layout route | All dashboard child routes get WS automatically; prevents INT-02 class of bugs | ✓ Good — single call, full coverage |
| Native details/summary for disclosure | No extra component dep needed; keyboard-accessible out of the box | ✓ Good — zero overhead |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-25 after v1.2 Ease of Access milestone*

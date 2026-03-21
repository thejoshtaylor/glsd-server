# Feature Landscape

**Domain:** WebSocket-based node management dashboard with real-time streaming output, team-based multi-tenancy, and voice input
**Researched:** 2026-03-20
**Confidence:** HIGH (project has explicit spec documents; industry patterns are well-established)

---

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Node list with live status | Users must see which nodes are connected, stale, or disconnected at a glance | Low | `connected` / `stale` / `disconnected` — driven by WebSocket ping/pong; update in real time via frontend WebSocket |
| Per-node instance list | See what's currently running on each node and its lifecycle state | Low | `pending` / `running` / `finished` / `errored` states; table or card per node |
| Live stream output panel | Streaming Claude CLI output must appear in the browser as it arrives | Medium | NDJSON lines arrive as `stream_event` messages; parse and render progressively; auto-scroll with user override |
| Execute command dispatch | Users must be able to send a prompt to a selected node | Medium | Requires node selection, project selection, optional `session_id`, and prompt input; triggers `execute` over WebSocket |
| Kill running instance | Stop a runaway or unwanted execution | Low | Single button per running instance; sends `kill` command; wait for terminal event before marking done |
| JWT-based user auth | Login required; unauthenticated users must not see any data | Medium | Email + password; access token + refresh token; secure HttpOnly cookies or Authorization header |
| Team membership and node scoping | Nodes belong to teams; users only see nodes for their teams | Medium | Personal team as default; users on multiple teams; node–team association stored in DB |
| Node registration via Bearer token | Nodes authenticate on connect; rogue connections rejected | Low | Token validated during HTTP upgrade handshake; 401/403 before WebSocket established |
| Persistent state across server restarts | Reconnecting nodes must reconcile; user/team data must survive | Medium | PostgreSQL for all persistent state; reconciliation logic on `node_register` |
| Audit trail for commands and events | Who dispatched what execute/kill, and when | Low | Append-only log table: node_id, instance_id, user_id, command/event type, timestamp, error details |
| Error surfacing | Users must see when instances error, not just silence | Low | Display `instance_error.error` message inline in the stream panel; badge on node/instance cards |
| Health indicator staleness warning | Visual cue when a node hasn't sent a ping in >90s | Low | Derived from `last_heartbeat`; frontend polls or subscribes to node status events |

---

## Differentiators

Features that set this product apart. Not universally expected, but add meaningful value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Voice input via Whisper | Speak a prompt instead of typing; reduces friction for long prompts | Medium | Browser MediaRecorder → REST `POST /api/transcribe` → OpenAI `whisper-1` → populate prompt field; 25MB file limit, webm/wav/mp4 formats; new GPT-4o transcription models also available as upgrade path |
| Session resume (Claude conversation continuity) | Pick up a previous Claude conversation from an instance's `session_id` | Low | `session_id` captured from `instance_started`; surface in instance history; populate `session_id` in `execute` when user chooses to resume |
| NDJSON stream parsing and structured rendering | Display Claude CLI structured output (tool use, text responses, cost info) rather than raw JSON | High | `stream_event.data` is a JSON-encoded `ClaudeEvent`; parse to distinguish text responses from tool calls from system events; render each type distinctly |
| Reconnect state reconciliation UI | Show instances that were lost during a node crash vs. those still running after a server restart | Medium | Derived from reconciliation logic (Section 6 of server spec); surface "lost" vs. "recovered" instance badges |
| Multi-team node assignment | Nodes can be shared across teams (enterprise pattern) | Medium | Currently spec'd as one team per node; multi-team sharing is a natural extension; defer to v2 |
| Project-scoped execution | Select project from the node's configured project list | Low | `projects` array from `node_register`; populate dropdown; validate project exists before dispatching execute |
| New node alert | Notify admin when a previously-unseen `node_id` connects | Low | Security feature from server spec (Section 9); could be in-app banner or email |
| Rate limit visibility | Show when a node rejects an execute due to its local rate limiter | Low | `instance_error` with `error: "rate limited"` is distinct; surface with specific messaging rather than generic error |
| Token rotation without node downtime | Rotate `SERVER_TOKEN` without disconnecting live nodes | Medium | Accept old + new tokens in grace period; surface token status in admin panel |
| Output search / filter | Search within a stream output panel | Medium | Client-side text filter on buffered stream content; useful for long-running instances |
| Instance history / replay | Browse past completed instances and their full output | High | Requires persisting all `stream_event` data; storage grows unbounded without TTL policy; flag for phase research |

---

## Anti-Features

Features to explicitly NOT build in v1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| OAuth / SSO login | Adds auth provider dependency, token exchange complexity, callback URLs | JWT email/password is sufficient for v1; add SSO in v2 if enterprise demand exists |
| Kubernetes deployment | Adds Helm charts, ingress controllers, pod networking complexity out of scope for v1 | Docker Compose targets the actual v1 deployment environment; revisit if horizontal scaling needed |
| Mobile app | React web dashboard covers all use cases; native app is a separate product | Ensure the React dashboard is responsive enough for tablets; full mobile app is out of scope |
| Node-side changes | Nodes are already deployed at v1.2.0; changing the node breaks existing deployments | Server must consume the GSD wire protocol as-is; any extension requires a new protocol version |
| Horizontal server scaling | Stateful WebSocket connections require sticky sessions or shared connection state (Redis pub/sub); adds significant complexity | Single-instance server for v1; the architecture already acknowledges this in PROJECT.md |
| Full xterm.js terminal emulation | Overkill for Claude CLI output; adds ~700KB bundle, ANSI escape complexity, input handling | Claude CLI output is NDJSON, not a raw PTY; a styled `<pre>` or structured renderer is appropriate |
| In-browser audio editing / waveform visualization | Voice input is transcribe-and-dispatch, not a recording studio | MediaRecorder start/stop + upload is sufficient; no waveform visualization needed |
| User-editable node configuration | Modifying node projects or settings from the dashboard requires node-side changes | Nodes are configured via environment variables on the node host; server only reads reported state |
| Per-project cost dashboards | Requires parsing Claude CLI cost fields from NDJSON stream events and aggregating | Useful long-term but adds significant parsing and storage complexity; defer to v2 |
| Real-time collaboration (multiple users watching same instance) | Requires broadcast/fanout from the frontend WebSocket layer, adding pub/sub complexity | Single-user stream viewing per instance is sufficient for v1; broadcast is a v2 feature |

---

## Feature Dependencies

```
JWT auth
  → Team membership (users belong to teams)
    → Node scoping (nodes visible only to team members)
      → Execute dispatch (user must be authorized for node's team)
        → Kill (user must be authorized for node's team)
          → Voice input (transcribed text goes to execute)

Node registration + Bearer token auth
  → Node state tracking (connected/stale/disconnected)
    → Health monitoring via ping/pong
      → Stale detection and instance marking as errored/lost

Execute dispatch
  → Project selection (from node's projects list)
  → Instance lifecycle tracking (pending → running → finished/errored)
    → Live stream output (stream_event forwarding to frontend)
    → Session ID capture (from instance_started)
      → Session resume (reuse session_id in next execute)

Persistent PostgreSQL state
  → State reconciliation on reconnect
  → Audit trail
  → Instance history
```

---

## MVP Recommendation

Prioritize for v1 (minimum to be useful):

1. Node registration, Bearer token auth, node list with live status
2. Execute dispatch with project selection and prompt input
3. Kill running instance
4. Live stream output panel (raw NDJSON rendered as text; structured rendering deferred)
5. JWT auth with email/password and personal team
6. Voice input via Whisper (explicitly called out as v1 must-have in PROJECT.md)
7. Audit trail (append-only, non-blocking)
8. Persistent PostgreSQL state + reconnect reconciliation

Defer to v2:
- **Session resume**: Requires surfacing session IDs from instance history; low effort but not blocking
- **Structured NDJSON rendering**: Raw text is functional; structured rendering is an enhancement
- **Instance history / output replay**: Requires a storage policy decision (unbounded growth risk)
- **Multi-team node assignment**: Single team per node covers all v1 use cases
- **Token rotation UI**: Ops feature; manual config change is acceptable for v1

---

## Sources

- Project spec: `/server-spec.md` (Section 8 — Whisper integration, Section 9 — security, Section 6 — reconciliation)
- Protocol spec: `/protocol-spec.md` (message catalog, lifecycle flows)
- PROJECT.md: explicit "Out of Scope" and "Active" requirements
- [OpenAI Speech-to-Text API docs](https://platform.openai.com/docs/guides/speech-to-text) — Whisper-1 limits (25MB, formats), GPT-4o transcription models available as upgrade
- [Xterm.js](https://xtermjs.org/) — terminal emulation library; HIGH confidence it's overkill for NDJSON output
- [UX Strategies for Real-Time Dashboards — Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/) — real-time dashboard UX patterns (auto-scroll, delta indicators)
- [RMM feature analysis — DevOpsSchool](https://www.devopsschool.com/blog/top-10-remote-monitoring-management-rmm-tools-in-2025-features-pros-cons-comparison/) — table stakes from RMM/agent management category
- [Multi-tenant auth best practices — Auth0](https://auth0.com/docs/get-started/auth0-overview/create-tenants/multi-tenant-apps-best-practices) — team-scoped access control patterns
- [Claude Code session management](https://code.claude.com/docs/en/common-workflows) — session_id resume behavior
- [WebSocket scaling patterns — Medium/Syntal](https://medium.com/@sparknp1/10-websocket-scaling-patterns-for-real-time-dashboards-1e9dc4681741) — horizontal scaling complexity (rationale for single-instance v1)

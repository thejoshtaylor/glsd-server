# Phase 5: Voice and Audit - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds two capabilities: (1) voice-to-text input so users can speak prompts that get transcribed via OpenAI Whisper and populated into the execute form, and (2) an append-only audit log that records all commands dispatched and events received, queryable via REST API. No dashboard UI for audit in v1.

</domain>

<decisions>
## Implementation Decisions

### Voice Recording UX
- Toggle click behavior for record button (click to start, click to stop)
- Record button placed next to Execute button as a separate mic button
- Pulsing red dot + elapsed time counter during recording
- Toast error with "Try again" on transcription failure

### Audio & Transcription Configuration
- WebM/Opus format via MediaRecorder default — widest browser support, Whisper accepts it
- 60-second max recording duration to keep file sizes manageable
- Auto-detect language (no language param to Whisper) — simplest for most users
- Spinner overlay on prompt field while transcription is in progress

### Audit Log Scope & Access
- Team-scoped audit log — consistent with all other data access patterns
- REST endpoint `GET /api/audit?node_id=&type=&limit=` with pagination for querying
- No auto-deletion for v1 — append-only, let it grow
- No dashboard UI for audit in v1 — backend-only REST endpoint

### Claude's Discretion
- None — all decisions captured above

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/app/models/audit.py` — AuditLog model already exists with id, timestamp, node_id, instance_id, user_id, event_type, details(JSON) columns
- `frontend/src/components/execute/ExecuteForm.tsx` — Execute form where mic button and transcription overlay will be added
- `frontend/src/components/execute/KillButton.tsx` — Pattern for action buttons next to execute
- `backend/app/routers/nodes.py` — Pattern for team-scoped REST endpoints with pagination
- `backend/app/ws/handlers.py` — Where audit logging calls for events should be inserted
- `backend/app/schemas/nodes.py` — Pattern for Pydantic response models

### Established Patterns
- SQLAlchemy 2.0 async with `AsyncSession` and `Mapped[]` columns
- FastAPI routers with `CurrentUser` dependency for auth
- Team-scoping via node→node_team→team_member joins
- Pydantic v2 response models in schemas/
- React components with TanStack Query for data fetching
- Toast notifications pattern (to be used for transcription errors)

### Integration Points
- `POST /api/transcribe` — new router for voice transcription
- `GET /api/audit` — new router for audit log queries
- `ExecuteForm.tsx` — mic button integration point
- `handlers.py` — audit logging insertion points for all command/event handlers
- `routers/nodes.py` execute/kill endpoints — audit logging for dispatched commands
- Alembic migration for audit_log table (model exists but may need migration)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

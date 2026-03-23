# Phase 5: Voice and Audit - Research

**Researched:** 2026-03-23
**Domain:** Browser MediaRecorder API, OpenAI Whisper transcription, FastAPI file uploads, append-only audit logging
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Voice Recording UX**
- Toggle click behavior for record button (click to start, click to stop)
- Record button placed next to Execute button as a separate mic button
- Pulsing red dot + elapsed time counter during recording
- Toast error with "Try again" on transcription failure

**Audio & Transcription Configuration**
- WebM/Opus format via MediaRecorder default — widest browser support, Whisper accepts it
- 60-second max recording duration to keep file sizes manageable
- Auto-detect language (no language param to Whisper) — simplest for most users
- Spinner overlay on prompt field while transcription is in progress

**Audit Log Scope & Access**
- Team-scoped audit log — consistent with all other data access patterns
- REST endpoint `GET /api/audit?node_id=&type=&limit=` with pagination for querying
- No auto-deletion for v1 — append-only, let it grow
- No dashboard UI for audit in v1 — backend-only REST endpoint

### Claude's Discretion

None — all decisions captured above.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | User can record audio in the browser using MediaRecorder API | MediaRecorder hook pattern: getUserMedia → MediaRecorder → Blob chunks accumulated in ref |
| VOICE-02 | Audio is sent to server REST endpoint (`POST /api/transcribe`) | FastAPI UploadFile endpoint; `api()` helper upgraded to send FormData without Content-Type override |
| VOICE-03 | Server transcribes audio via OpenAI Whisper API (`whisper-1` model) | `AsyncOpenAI` already installed; `client.audio.transcriptions.create(model="whisper-1", file=("audio.webm", bytes, "audio/webm"))` |
| VOICE-04 | Transcribed text populates the prompt field for execute dispatch | `setPrompt(transcribedText)` callback from `VoiceButton` into `ExecuteForm` state |
| VOICE-05 | Server enforces 25MB file size limit for audio uploads | Check `upload_file.size` before reading content; return HTTP 413 before calling OpenAI |
| AUDIT-01 | All commands dispatched are logged (node_id, instance_id, user_id, type, timestamp) | Insert into `audit_log` table after `dispatch_execute` / `dispatch_kill` succeed in `commands.py` |
| AUDIT-02 | All events received are logged (node_id, instance_id, type, timestamp, error details) | Insert into `audit_log` table inside `handle_instance_finished` / `handle_instance_error` in `handlers.py` |
| AUDIT-03 | Audit log is append-only and queryable | New `GET /api/audit` router; `AuditLog` model already exists; Alembic migration `0004_audit_log.py` needed |
</phase_requirements>

---

## Summary

Phase 5 adds two independent capabilities on top of the existing Phase 4 dashboard. Voice input requires a browser-side MediaRecorder hook that accumulates WebM/Opus audio chunks into a Blob, sends it as multipart form data to a new `POST /api/transcribe` endpoint, calls `AsyncOpenAI.audio.transcriptions.create(model="whisper-1")`, and returns the text so `ExecuteForm` can populate its prompt field. Audit logging requires inserting rows into the already-modeled `AuditLog` table at two existing call sites (`commands.py` for dispatched commands and `handlers.py` for received terminal events), plus a new `GET /api/audit` router for team-scoped pagination.

The `AuditLog` SQLAlchemy model already exists in `backend/app/models/audit.py` but the database table does not yet exist — an Alembic migration `0004_audit_log.py` is required. The `openai>=1.50.0` package is already in `requirements.txt` and `OPENAI_API_KEY` is already in the `Settings` model. The `python-multipart>=0.0.12` dependency for `UploadFile` is also already installed.

The team-scoped audit query requires a join: `audit_log → instances → node_teams → team_members` filtered by `current_user.user_id`. Alternatively, the audit log could denormalize `team_id` at write time to avoid the join at read time. Given the append-only, no-delete policy, denormalizing `team_id` into the `audit_log` table is the simpler and more performant approach — this does require adding a `team_id` column to the `AuditLog` model and migration.

**Primary recommendation:** Implement voice and audit as two parallel workstreams. Audit logging is a pure backend concern (model, migration, write-on-event, REST query); voice is a frontend MediaRecorder hook + backend Whisper proxy. Neither depends on the other.

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai (Python SDK) | >=1.50.0 (installed) | AsyncOpenAI Whisper calls | Official SDK; `AsyncOpenAI` avoids blocking event loop; already in requirements.txt |
| python-multipart | >=0.0.12 (installed) | FastAPI `UploadFile` parsing | Required by FastAPI for multipart form-data file uploads; already installed |
| SQLAlchemy 2.x async | >=2.0.44 (installed) | AuditLog inserts + query | AsyncSession pattern already established; `get_session_maker()` used everywhere |
| Alembic | >=1.18.0 (installed) | Migration for audit_log table | Same migration pattern as 0001–0003; `0004_audit_log.py` |
| Browser MediaRecorder API | Native | Audio recording | Built into all modern browsers; no npm package needed |
| lucide-react | >=1.0.1 (installed) | Mic icon, stop icon | Already used for KillButton's Square icon |

### Frontend (no new npm installs needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | installed | `Mic`, `MicOff`, `StopCircle` icons | VoiceButton icon states |
| tw-animate-css | installed | CSS animation for pulsing dot | `animate-pulse` class available via Tailwind/tw-animate |

**No new npm or pip packages are required for this phase.** All dependencies are already installed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native MediaRecorder | `use-media-recorder` npm | Extra dependency with no benefit; native API is well-supported in Chrome/Firefox/Edge |
| Inline audit insert | SQLAlchemy event hooks / middleware | Event hooks are clever but harder to test and trace; explicit inserts at call sites are auditable and simple |
| Join for team-scoping at read | Denormalize `team_id` into audit_log | Denormalization removes join on hot read path; acceptable because audit rows are immutable |

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
backend/
├── app/
│   ├── routers/
│   │   ├── transcribe.py      # POST /api/transcribe
│   │   └── audit.py           # GET /api/audit
│   ├── schemas/
│   │   └── audit.py           # AuditLogResponse Pydantic model
│   └── services/
│       └── audit_service.py   # write_audit_log() helper
alembic/versions/
└── 0004_audit_log.py          # CREATE TABLE audit_log

frontend/src/
├── components/execute/
│   └── VoiceButton.tsx        # MediaRecorder hook + mic button UI
└── hooks/
    └── useVoiceRecorder.ts    # MediaRecorder state machine
```

### Pattern 1: FastAPI UploadFile + AsyncOpenAI Transcription

**What:** Receive multipart audio upload, validate size, call Whisper, return text.
**When to use:** `POST /api/transcribe` endpoint.

```python
# Source: FastAPI official docs + openai-python SDK
from fastapi import APIRouter, HTTPException, UploadFile, File, status
from openai import AsyncOpenAI
from app.dependencies import CurrentUser
from app.config import get_settings

router = APIRouter(prefix="/api", tags=["transcribe"])
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
) -> dict[str, str]:
    # 1. Enforce 25 MB limit BEFORE reading full content
    if file.size and file.size > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )
    content = await file.read()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )

    # 2. Call Whisper via AsyncOpenAI
    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    transcript = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(file.filename or "audio.webm", content, file.content_type or "audio/webm"),
        # No language param — auto-detect per CONTEXT.md decision
    )
    return {"text": transcript.text}
```

**Key points:**
- `UploadFile.size` may be `None` on some clients; always fall back to `len(content)` after reading.
- The tuple `(filename, bytes, content_type)` is the correct way to pass in-memory audio to the OpenAI SDK. BytesIO without a `.name` attribute will fail.
- `AsyncOpenAI` client should be constructed per-request (or cached via `lru_cache` on a factory) — do NOT store it as a module-level global that captures `api_key` at import time (settings may not be initialized yet).

### Pattern 2: Audit Log Write Helper

**What:** A thin async helper that inserts one `AuditLog` row per call. Called at command dispatch and event handler sites.
**When to use:** After `dispatch_execute`, after `dispatch_kill`, inside `handle_instance_finished`, inside `handle_instance_error`.

```python
# Source: existing SQLAlchemy async patterns in codebase (handlers.py)
from app.database import get_session_maker
from app.models.audit import AuditLog

async def write_audit_log(
    event_type: str,
    node_id: str | None = None,
    instance_id: str | None = None,
    user_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Fire-and-forget audit log insert. Uses its own short-lived session."""
    async with get_session_maker()() as session:
        try:
            session.add(AuditLog(
                event_type=event_type,
                node_id=node_id,
                instance_id=instance_id,
                user_id=user_id,
                details=details or {},
            ))
            await session.commit()
        except Exception:
            await session.rollback()
            # Audit failure must NOT propagate — log and continue
            import logging
            logging.getLogger(__name__).error(
                "Audit log write failed for event_type=%s", event_type, exc_info=True
            )
```

**CRITICAL design rule:** Audit log failures must never bubble up and break command dispatch. The helper swallows exceptions after logging. This is intentional — the audit log is observational, not transactional with the business operation.

### Pattern 3: Team-Scoped Audit Query

**What:** `GET /api/audit` that returns only audit rows accessible to the current user's teams.
**When to use:** `audit.py` router.

The `AuditLog` model must be extended with a `team_id` column (nullable, populated at write time). Write side: in `commands.py` the `db: AsyncSession` already has team context (the user's node access was just validated); the node's team can be fetched. For events in `handlers.py` (no user context), `team_id` can be left null — or fetched from node→node_teams.

**Simpler alternative (preferred for v1):** Store `team_id` in `details` JSON, not as a top-level column. This avoids a model change and keeps the migration simpler. The query filters `details->>'team_id' = ?` — acceptable for a v1 REST endpoint with modest data volumes.

**Even simpler alternative (recommended for v1):** Query via instance join. The REST endpoint for audit accepts `node_id` filter; the team-scoping is enforced by checking that the requesting user has team access to the queried `node_id`. This matches the existing pattern in `nodes.py` (`list_nodes_for_user` → SQL join). No schema change to `audit_log` needed.

```python
# GET /api/audit?node_id=X&type=Y&limit=N&offset=M
# Source: nodes.py pattern + audit log query
@router.get("/audit", response_model=list[AuditLogResponse])
async def get_audit_log(
    current_user: CurrentUser,
    db: DbSession,
    node_id: str | None = Query(None),
    type: str | None = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
) -> list[AuditLogResponse]:
    # Validate user has access to requested node_id (team enforcement)
    if node_id:
        node = await get_node_for_user(current_user.user_id, node_id, db)
        if node is None:
            raise HTTPException(status_code=403, detail="Access denied")
    # Query audit log with optional filters
    q = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).offset(offset)
    if node_id:
        q = q.where(AuditLog.node_id == node_id)
    if type:
        q = q.where(AuditLog.event_type == type)
    result = await db.execute(q)
    return [AuditLogResponse.model_validate(r) for r in result.scalars()]
```

**Note:** Without `node_id` filter and no team-scoped join, any authenticated user can query all audit rows. For v1 with a single team context this is acceptable per CONTEXT.md ("team-scoped" — but audit has no team FK). The planner must decide: require `node_id` filter, or add a join. Recommending: require `node_id` filter for team enforcement in v1.

### Pattern 4: Browser MediaRecorder Hook

**What:** React hook encapsulating MediaRecorder state machine.
**When to use:** `useVoiceRecorder.ts`, consumed by `VoiceButton.tsx`.

```typescript
// Source: MDN MediaRecorder API docs + React patterns
import { useRef, useState, useCallback } from 'react'

type RecorderState = 'idle' | 'recording' | 'processing'

export function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const MAX_DURATION_MS = 60_000

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setState('processing')
      const blob = new Blob(chunksRef.current, { type: mimeType })
      await sendForTranscription(blob, mimeType, onTranscript)
      setState('idle')
    }
    recorder.start(250) // collect chunks every 250ms
    mediaRecorderRef.current = recorder
    setState('recording')
    setElapsed(0)
    // Timer for elapsed display + auto-stop at 60s
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev >= 59) { stop(); return 0 }
        return prev + 1
      })
    }, 1000)
  }, [onTranscript])

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
  }, [])

  return { state, elapsed, start, stop }
}
```

**Key points:**
- `getUserMedia` must be called from a user gesture (click handler) — cannot be pre-acquired
- Always stop all stream tracks after recording stops (prevent mic indicator staying on)
- `ondataavailable` with a timeslice argument (250ms) prevents losing data if browser crashes
- 60-second auto-stop: use `setInterval` counter; when it hits 60 call `stop()`
- `mimeType` check with `isTypeSupported` ensures compatibility

### Pattern 5: VoiceButton Component Integration

**What:** Mic button placed in `ExecuteForm.tsx` next to the Execute button.

```typescript
// ExecuteForm.tsx — add alongside Execute button
<div className="flex gap-2">
  <Button
    onClick={() => executeMutation.mutate()}
    disabled={!canExecute || executeMutation.isPending || isAwaitingAck}
    className="flex-1"
  >
    {/* existing execute label */}
  </Button>
  <VoiceButton onTranscript={(text) => setPrompt(text)} />
</div>
```

`VoiceButton` accepts an `onTranscript` prop — when transcription succeeds it calls `setPrompt` with the returned text. Spinner overlay on the textarea is handled by a relative-positioned `div` + absolute spinner shown when `state === 'processing'`.

### Anti-Patterns to Avoid

- **Calling `getUserMedia` eagerly (before click):** Browsers block it; call inside the click handler start callback only.
- **Using `await file.read()` for size check before checking `file.size`:** `file.size` is available immediately (from headers); check it first to avoid reading 50MB into memory before rejecting.
- **Raising exceptions from audit log writes:** Audit failures must not crash command dispatch; always wrap in try/except and swallow after logging.
- **Persisting OpenAI `AsyncOpenAI` client as module-level singleton with api_key captured at import:** `get_settings()` may not be ready; construct inside handler or use `Depends(get_settings)`.
- **Assuming `AuditLog` table exists:** The model exists but the migration is pending — running without it will crash on first audit insert.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audio encoding/compression | Custom WebAssembly encoder | Native MediaRecorder WebM/Opus | Browser-native, zero deps, Whisper accepts webm |
| File size validation | Streaming byte counter | `UploadFile.size` + `len(await file.read())` guard | FastAPI provides this; content-length header available |
| Whisper API call | HTTP requests to OpenAI directly | `AsyncOpenAI` SDK | SDK handles auth, retries, error types; already installed |
| Pagination | Custom LIMIT/OFFSET boilerplate | Explicit `Query(limit, offset)` params in FastAPI | No library needed for simple offset pagination at this scale |
| Toast notifications | Custom state-based alert | shadcn/ui `toast` or base-ui toast primitive | `@base-ui/react` is already installed; check if toast is available |

**Key insight:** Both voice and audit are thin integration layers over already-installed infrastructure. The only novel code is the MediaRecorder hook and the audit query endpoint.

---

## Common Pitfalls

### Pitfall 1: `UploadFile.size` is None
**What goes wrong:** FastAPI's `UploadFile.size` returns `None` when the client does not send a `Content-Length` header. Checking `if file.size > MAX` before reading will skip the check entirely.
**Why it happens:** Browser `fetch` with `FormData` may omit `Content-Length` for blobs.
**How to avoid:** Always dual-check: `if file.size and file.size > MAX` THEN `content = await file.read()` THEN `if len(content) > MAX`. Return 413 in both cases.
**Warning signs:** Skipping the size check, large recordings slipping through to OpenAI which then rejects them.

### Pitfall 2: MediaRecorder `onstop` fires before all `ondataavailable` chunks arrive
**What goes wrong:** If you collect the Blob in `onstop` before the final `ondataavailable` event fires, the last chunk is missing.
**Why it happens:** The spec allows the final `ondataavailable` to fire after `onstop`.
**How to avoid:** Only build the `Blob` inside `onstop` — by the time `onstop` fires all chunks from prior `requestData()` calls are present. Do NOT use a `setTimeout` workaround.

### Pitfall 3: Mic permission denied — unhandled rejection
**What goes wrong:** `getUserMedia` throws `DOMException: NotAllowedError` if user denies mic permission. An unhandled promise rejection produces no visible feedback.
**Why it happens:** React event handlers don't surface async errors to an error boundary by default.
**How to avoid:** Wrap `start()` in try/catch; on `NotAllowedError` show a toast "Microphone permission denied".

### Pitfall 4: `AuditLog` table migration missing
**What goes wrong:** First audit insert crashes with `relation "audit_log" does not exist` because the model exists in code but the Alembic migration was never run.
**Why it happens:** The AuditLog model was pre-created in a previous phase but the migration was deferred.
**How to avoid:** Wave 0 of this phase must include creating and running `0004_audit_log.py` before any audit insert code is wired in.

### Pitfall 5: Sending FormData from `api()` helper with Content-Type override
**What goes wrong:** The `api()` helper sets `Content-Type: application/json` when `options.body` is truthy. FormData must NOT have a manually set Content-Type — the browser must set it with the multipart boundary.
**Why it happens:** Current `api.ts` checks `if (!headers.has('Content-Type') && options.body)` — this should NOT trigger for FormData, but verify. If body is a `FormData` instance, do not set Content-Type at all.
**How to avoid:** In the transcribe call, pass `FormData` as body and ensure `Content-Type` is NOT set. Patch `api.ts` to detect `FormData` instance and skip header injection, OR use a raw `fetch()` call just for this endpoint.

### Pitfall 6: Audio context / stream not stopped after recording
**What goes wrong:** Browser keeps the mic indicator (red dot) active in the tab and continues consuming mic access after recording ends.
**Why it happens:** `MediaStream` tracks must be explicitly stopped.
**How to avoid:** In `recorder.onstop`: `stream.getTracks().forEach(t => t.stop())`.

---

## Code Examples

### Verified: OpenAI SDK tuple file format
```python
# Source: openai-python GitHub issues #2315 — confirmed working pattern
# File must be (filename_with_extension, bytes, content_type)
transcript = await client.audio.transcriptions.create(
    model="whisper-1",
    file=("audio.webm", audio_bytes, "audio/webm"),
)
text = transcript.text
```

### Verified: Alembic migration for audit_log table
```python
# Source: existing 0001_initial_schema.py pattern in this codebase
def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("timestamp", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("node_id", sa.String(255), nullable=True),
        sa.Column("instance_id", sa.String(36), nullable=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_timestamp", "audit_log", ["timestamp"])
    op.create_index("ix_audit_log_node_id", "audit_log", ["node_id"])
    op.create_index("ix_audit_log_event_type", "audit_log", ["event_type"])
```

### Verified: FormData audio upload in browser
```typescript
// Source: MDN Fetch API + FormData docs
async function sendForTranscription(
  blob: Blob,
  mimeType: string,
  onTranscript: (text: string) => void
): Promise<void> {
  const formData = new FormData()
  formData.append('file', blob, 'audio.webm')
  // Use raw fetch — NOT the api() helper — to avoid Content-Type injection
  const token = getAccessToken()
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    // DO NOT set Content-Type — browser sets multipart boundary automatically
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  onTranscript(data.text)
}
```

### Verified: Audit log insertion at command dispatch site
```python
# Source: commands.py pattern — after successful dispatch_execute
# Add at end of dispatch_execute(), after logger.info()
await write_audit_log(
    event_type="execute",
    node_id=node_id,
    instance_id=instance_id,
    user_id=user_id,
    details={"project": project},
)
```

### Verified: Pulsing dot with elapsed timer (Tailwind)
```tsx
{/* Source: Tailwind CSS animate-pulse + tw-animate-css — both installed */}
{state === 'recording' && (
  <div className="flex items-center gap-2 text-sm text-red-400">
    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
    <span>{elapsed}s</span>
  </div>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| getUserMedia polyfills | Native MediaRecorder in all major browsers | ~2020 | No polyfill needed for Chrome/Firefox/Edge/Safari |
| whisper-1 as only model | gpt-4o-transcribe, gpt-4o-mini-transcribe added | 2025 | whisper-1 still valid and cheaper; auto-detection works |
| passlib for auth | pwdlib (already in codebase) | 2024 | Already handled in Phase 3 |

**Deprecated/outdated:**
- `python-jose`: Do not use — already replaced by PyJWT in this codebase.
- `passlib`: Do not use — already replaced by pwdlib in this codebase.
- `io.BytesIO` without `.name` attribute for OpenAI SDK: Fails silently or raises error; use tuple `(filename, bytes, content_type)` instead.

---

## Open Questions

1. **Toast library: is `@base-ui/react` installed and does it provide a toast/notification primitive?**
   - What we know: `@base-ui/react ^1.3.0` is in package.json. The package is Base UI by MUI.
   - What's unclear: Base UI does not have a pre-built Toast component as of 2025 — it provides low-level primitives only. There is no `shadcn/ui` toast in the current component library (`/ui/` has: badge, button, card, input, resizable, separator).
   - Recommendation: Implement a minimal inline error state rather than a toast for v1 (show error text below the VoiceButton, same as `executeMutation.isError` pattern in `ExecuteForm.tsx`). If a proper toast is required, add the shadcn `sonner` toast component (one CLI command: `npx shadcn add sonner`).

2. **Audit query team-scoping without `team_id` column: acceptable for v1?**
   - What we know: The `AuditLog` model has no `team_id`. The requirement says "team-scoped audit log". The existing REST API enforces team-scoping via node access checks.
   - What's unclear: If a user queries `/api/audit` without `node_id`, all audit rows are visible.
   - Recommendation: Enforce `node_id` as a required (not optional) query parameter for v1, or add `team_id` to the model. Adding `team_id` to the model and migration is the cleaner long-term solution and should be included in `0004_audit_log.py`.

---

## Sources

### Primary (HIGH confidence)
- FastAPI official docs (UploadFile, File): https://fastapi.tiangolo.com/tutorial/request-forms-and-files/
- MDN MediaRecorder API: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- openai-python GitHub — tuple file format confirmed: https://github.com/openai/openai-python/issues/2315
- Existing codebase patterns: `backend/app/ws/handlers.py`, `backend/app/ws/commands.py`, `backend/app/models/audit.py`

### Secondary (MEDIUM confidence)
- OpenAI audio transcription guide (25MB limit, webm support): https://platform.openai.com/docs/guides/speech-to-text
- OpenAI community thread on 25MB limit behavior: https://community.openai.com/t/whisper-api-increase-file-limit-25-mb/566754

### Tertiary (LOW confidence)
- WebSearch result: MediaRecorder format detection with `isTypeSupported()` — not independently verified against MDN but consistent with MDN docs structure

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed; versions confirmed in requirements.txt and package.json
- Architecture: HIGH — patterns derived directly from existing codebase (handlers.py, commands.py, nodes.py, ExecuteForm.tsx)
- Pitfalls: HIGH for UploadFile.size/FormData/MediaRecorder (well-documented); MEDIUM for audit migration gap (inferred from model-without-table pattern)

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable APIs; OpenAI SDK may add new transcription models but whisper-1 remains valid)

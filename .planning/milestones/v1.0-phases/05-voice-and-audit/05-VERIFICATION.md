---
phase: 05-voice-and-audit
verified: 2026-03-23T00:00:00Z
status: human_needed
score: 14/15 must-haves verified
re_verification: false
human_verification:
  - test: "End-to-end voice recording and transcription flow"
    expected: "User clicks mic button, grants mic permission, speaks a prompt, stops recording, spinner overlay appears on textarea, transcribed text populates the prompt field, spinner disappears"
    why_human: "Requires a live browser, microphone hardware, and a valid OPENAI_API_KEY configured in the environment. Cannot verify MediaRecorder API behavior, audio quality, or Whisper transcription output programmatically."
  - test: "Transcription error shows toast notification"
    expected: "When transcription fails (e.g., bad API key or 502), a sonner toast notification appears with the error message and 'Try again' guidance — no inline error text below the button"
    why_human: "Toast rendering requires a live browser session; cannot verify DOM rendering or toast dismissal behavior programmatically."
  - test: "Microphone permission denied shows toast notification"
    expected: "When user denies mic permission, a toast notification appears with 'Microphone permission denied' message"
    why_human: "Browser permission dialog behavior cannot be tested programmatically."
  - test: "60-second auto-stop enforced"
    expected: "Recording stops automatically at 60 seconds and proceeds to transcription without user interaction"
    why_human: "Requires a live browser session and 60 seconds of real time to verify timing behavior."
---

# Phase 5: Voice and Audit Verification Report

**Phase Goal:** Users can speak prompts and have them transcribed into the execute prompt field; all commands and events are recorded in an append-only audit log
**Verified:** 2026-03-23
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Every execute command dispatched produces an audit_log row with event_type='execute', node_id, instance_id, user_id | VERIFIED | `commands.py:109-115` calls `write_audit_log(event_type="execute", node_id=node_id, instance_id=instance_id, user_id=user_id, details=...)` after successful dispatch |
| 2  | Every kill command dispatched produces an audit_log row with event_type='kill', node_id, instance_id, user_id | VERIFIED | `commands.py:150-155` calls `write_audit_log(event_type="kill", ...)` after successful kill send |
| 3  | Every instance_finished event produces an audit_log row with event_type='instance_finished', instance_id | VERIFIED | `handlers.py:243-248` calls `write_audit_log(event_type="instance_finished", instance_id=payload.instance_id, details={"exit_code": payload.exit_code})` |
| 4  | Every instance_error event produces an audit_log row with event_type='instance_error', instance_id, error details | VERIFIED | `handlers.py:274-278` calls `write_audit_log(event_type="instance_error", instance_id=payload.instance_id, details={"error": payload.error})` |
| 5  | GET /api/audit returns audit rows filtered by node_id and type, scoped to the user's teams | VERIFIED | `routers/audit.py:13-51` — required `node_id` param, `user_can_access_node` gate, optional `type` filter, pagination |
| 6  | Audit log inserts never crash command dispatch or event handling | VERIFIED | `audit_service.py:43-51` — entire insert wrapped in try/except that rolls back, logs, and returns without re-raising |
| 7  | POST /api/transcribe accepts an audio file upload and returns transcribed text | VERIFIED | `routers/transcribe.py:16-57` — `UploadFile` param, reads content, calls `client.audio.transcriptions.create`, returns `{"text": transcript.text}` |
| 8  | Audio files over 25MB are rejected with HTTP 413 before calling OpenAI | VERIFIED | `routers/transcribe.py:27-39` — dual check: `file.size` header check before read, then `len(content)` check after read, both return HTTP_413 |
| 9  | The transcription endpoint requires authentication (401 without valid token) | VERIFIED | `routers/transcribe.py:19` — `current_user: CurrentUser = None` injects `get_current_user` dependency which raises 401 on invalid/missing token |
| 10 | Whisper API is called with model='whisper-1' and no language parameter | VERIFIED | `routers/transcribe.py:45-48` — `model="whisper-1"`, no `language=` parameter present |
| 11 | User clicks mic button, browser requests microphone permission, recording starts | ? HUMAN | `useVoiceRecorder.ts:61` calls `getUserMedia({audio: true})`; browser permission dialog requires live browser |
| 12 | During recording, a pulsing red dot and elapsed seconds counter are visible | VERIFIED (code) | `VoiceButton.tsx:42-46` — `animate-pulse` span with `bg-red-500` and `{elapsed}s` counter, rendered when `state === 'recording'` |
| 13 | After recording stops, a spinner overlay appears on the prompt textarea | VERIFIED (code) | `ExecuteForm.tsx:113-123` — `isTranscribing` state drives absolute-positioned spinner overlay with `animate-spin` SVG and "Transcribing..." text |
| 14 | Transcribed text populates the prompt textarea field | VERIFIED | `ExecuteForm.tsx:45-48` — `handleTranscript` calls `setPrompt(text)`, wired as `onTranscript={handleTranscript}` on `VoiceButton` |
| 15 | On transcription failure or mic permission denied, a toast notification appears | ? HUMAN | Code path exists: `VoiceButton.tsx:14-19` uses `toast.error(message, {description: 'Try again.', duration: 5000})`, Toaster rendered at `routes/__root.tsx:51`; live browser needed to verify toast renders |

**Score:** 13/15 truths fully verified programmatically; 2 need human verification (live browser + microphone). All automated checks pass.

---

## Required Artifacts

### Plan 05-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/alembic/versions/0004_audit_log.py` | Database table creation for audit_log | PARTIAL | File exists, adds `ix_audit_log_event_type` index. PLAN specified `contains: "create_table"` but table was already created in 0001. This is a correct deviation — re-creating would cause a DuplicateTable error. Functional end state is correct. |
| `backend/app/services/audit_service.py` | write_audit_log async helper | VERIFIED | Exports `write_audit_log`, fire-and-forget with try/except, never re-raises |
| `backend/app/schemas/audit.py` | AuditLogResponse Pydantic model | VERIFIED | `class AuditLogResponse(BaseModel)` with `model_config = {"from_attributes": True}` |
| `backend/app/routers/audit.py` | GET /api/audit endpoint | VERIFIED | `router = APIRouter(prefix="/api", tags=["audit"])`, required `node_id`, team scope gate |

### Plan 05-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/app/routers/transcribe.py` | POST /api/transcribe endpoint | VERIFIED | `async def transcribe_audio`, `MAX_AUDIO_BYTES`, dual 413 check, `whisper-1`, no language param, returns `{"text": transcript.text}` |

### Plan 05-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/hooks/useVoiceRecorder.ts` | MediaRecorder state machine hook (min 50 lines) | VERIFIED | 117 lines, exports `useVoiceRecorder` and `RecorderState`, full lifecycle: getUserMedia, MediaRecorder, 60s auto-stop, cleanup, FormData fetch |
| `frontend/src/components/execute/VoiceButton.tsx` | Mic toggle button with recording indicator (min 30 lines) | VERIFIED | 61 lines, exports `VoiceButton`, pulsing dot, elapsed timer, Mic/Square icons, toast.error for errors |
| `frontend/src/components/execute/ExecuteForm.tsx` | Execute form with integrated VoiceButton and spinner overlay | VERIFIED | Contains `VoiceButton`, `isTranscribing` state, spinner overlay, `handleTranscript`, `animate-spin` |

---

## Key Link Verification

### Plan 05-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/app/ws/commands.py` | `backend/app/services/audit_service.py` | `await write_audit_log` after dispatch | WIRED | Import at line 14; called at lines 109 and 150 (execute and kill) |
| `backend/app/ws/handlers.py` | `backend/app/services/audit_service.py` | `await write_audit_log` in terminal event handlers | WIRED | Import at line 17; called at lines 243 and 274 (instance_finished and instance_error) |
| `backend/app/main.py` | `backend/app/routers/audit.py` | `app.include_router` | WIRED | `from app.routers import audit, ...` at line 7; `app.include_router(audit.router)` at line 34 |

### Plan 05-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/app/routers/transcribe.py` | `openai AsyncOpenAI` | `client.audio.transcriptions.create` | WIRED | `AsyncOpenAI` imported, `transcriptions.create(model="whisper-1", ...)` called at line 45 |
| `backend/app/main.py` | `backend/app/routers/transcribe.py` | `app.include_router` | WIRED | `from app.routers import ..., transcribe` at line 7; `app.include_router(transcribe.router)` at line 35 |

### Plan 05-03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/src/components/execute/VoiceButton.tsx` | `frontend/src/hooks/useVoiceRecorder.ts` | `useVoiceRecorder` hook | WIRED | Imported at line 4; called at line 25 as `useVoiceRecorder(handleTranscript, handleError)` |
| `frontend/src/components/execute/ExecuteForm.tsx` | `frontend/src/components/execute/VoiceButton.tsx` | `VoiceButton` with `onTranscript` prop | WIRED | Imported at line 9; rendered at line 141 with `onTranscript={handleTranscript}` and `onStateChange={handleVoiceStateChange}` |
| `frontend/src/hooks/useVoiceRecorder.ts` | `POST /api/transcribe` | `fetch` with `FormData` | WIRED | `fetch('/api/transcribe', ...)` at line 16 inside `sendForTranscription`; `formData.append('file', blob, 'audio.webm')` at line 12 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUDIT-01 | 05-01 | All commands dispatched are logged (node_id, instance_id, user_id, type, timestamp) | SATISFIED | `commands.py` calls `write_audit_log` with node_id, instance_id, user_id for both execute and kill |
| AUDIT-02 | 05-01 | All events received are logged (node_id, instance_id, type, timestamp, error details) | SATISFIED | `handlers.py` calls `write_audit_log` in `handle_instance_finished` and `handle_instance_error`; note node_id=None for event handlers (instance_id sufficient for correlation, documented decision) |
| AUDIT-03 | 05-01 | Audit log is append-only and queryable | SATISFIED | `write_audit_log` only inserts (no update/delete); `GET /api/audit` endpoint with node_id, type filter, pagination |
| VOICE-01 | 05-03 | User can record audio in the browser using MediaRecorder API | SATISFIED (code) / HUMAN (runtime) | `useVoiceRecorder.ts` implements full MediaRecorder lifecycle; runtime behavior needs human verification |
| VOICE-02 | 05-02 | Audio is sent to server REST endpoint (POST /api/transcribe) | SATISFIED | `fetch('/api/transcribe', ...)` in `sendForTranscription`; endpoint exists and registered |
| VOICE-03 | 05-02 | Server transcribes audio via OpenAI Whisper API (whisper-1 model) | SATISFIED | `client.audio.transcriptions.create(model="whisper-1", ...)` in `routers/transcribe.py` |
| VOICE-04 | 05-03 | Transcribed text populates the prompt field for execute dispatch | SATISFIED | `handleTranscript` in `ExecuteForm.tsx` calls `setPrompt(text)` |
| VOICE-05 | 05-02 | Server enforces 25MB file size limit for audio uploads | SATISFIED | Dual check in `routers/transcribe.py`: header check + content-length check, both raise HTTP 413 |

All 8 requirements claimed by phase 5 plans are accounted for. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/alembic/versions/0004_audit_log.py` | 1-27 | Migration description says "Add audit_log table" but body only adds an index | Info | No functional impact — correct behavior. The PLAN's `must_haves` spec said `contains: "create_table"` but actual migration correctly only adds the missing index since table exists in 0001. Documented deviation, not a bug. |

No stubs, empty implementations, placeholders, TODO/FIXME comments, or unwired components found in the implementation.

---

## Human Verification Required

### 1. End-to-End Voice Recording and Transcription

**Test:** Start the application (`docker-compose up`), log in, navigate to a connected node's execute panel. Click the microphone button. Grant browser microphone permission. Speak a short prompt. Click the button again to stop recording.

**Expected:** (a) Pulsing red dot and elapsed seconds counter appear while recording. (b) After stopping, a spinner overlay with "Transcribing..." appears on the textarea. (c) Spoken text appears in the prompt field after transcription completes. (d) Spinner disappears.

**Why human:** Requires live browser, microphone hardware, running backend with a valid `OPENAI_API_KEY` in environment. Cannot verify MediaRecorder audio capture or Whisper API response programmatically.

### 2. Transcription Error Toast Notification

**Test:** With the application running, temporarily set `OPENAI_API_KEY` to an invalid value. Record a short audio clip and stop recording.

**Expected:** A sonner toast notification appears in the corner with the error message and "Try again." guidance. No inline error text appears below the microphone button.

**Why human:** Toast rendering requires a live browser DOM; cannot verify toast display, positioning, or dismissal timing programmatically.

### 3. Microphone Permission Denied Toast

**Test:** In browser settings, deny microphone access for the app origin, then click the mic button.

**Expected:** A toast notification appears with "Microphone permission denied" message.

**Why human:** Browser permission dialog and DOMException handling requires a live browser session.

### 4. 60-Second Auto-Stop

**Test:** Click the mic button and let recording run for 60 seconds without manually stopping.

**Expected:** Recording stops automatically at 60 seconds and proceeds to transcription (or returns to idle if no meaningful audio).

**Why human:** Requires waiting 60 real seconds in a live browser to verify the `useEffect` timer fires correctly.

---

## Gaps Summary

No functional gaps were found. All backend artifacts are substantive and correctly wired. All frontend artifacts are substantive and correctly wired. The only discrepancy from the PLAN `must_haves` specification is that migration 0004 does not contain `op.create_table("audit_log"` — but this is a correct and documented deviation (the table was already created in migration 0001; recreating it would cause a PostgreSQL DuplicateTable error). The functional end state is correct.

All automated checks pass. The 4 items flagged for human verification are UX/browser behaviors that cannot be verified programmatically: end-to-end recording flow, toast notification rendering, microphone permission denied handling, and 60-second auto-stop timing.

---

_Verified: 2026-03-23_
_Verifier: Claude (gsd-verifier)_

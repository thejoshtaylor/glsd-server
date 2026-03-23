---
phase: 05-voice-and-audit
plan: "02"
subsystem: api
tags: [openai, whisper, voice, transcription, fastapi, file-upload]

# Dependency graph
requires:
  - phase: 05-01
    provides: audit router pattern, main.py router registration
  - phase: 03-auth-and-teams
    provides: CurrentUser dependency, JWT auth pattern
  - phase: 01-foundation
    provides: config.py with openai_api_key, Settings/get_settings

provides:
  - POST /api/transcribe endpoint accepting audio file uploads up to 25 MB
  - OpenAI Whisper whisper-1 transcription with auto-detect language
  - Dual 25MB size enforcement (header check + post-read check)
  - 413 rejection for oversized files, 502 for Whisper API errors

affects: [05-03, frontend-voice-ui]

# Tech tracking
tech-stack:
  added: [openai AsyncOpenAI (already in requirements)]
  patterns:
    - Per-request AsyncOpenAI client construction (no module-level global)
    - Dual size validation (file.size header + len(content) post-read)
    - Audio file passed as (filename, bytes, content_type) tuple to OpenAI SDK

key-files:
  created:
    - backend/app/routers/transcribe.py
  modified:
    - backend/app/main.py

key-decisions:
  - "No language= parameter in Whisper call — auto-detect per CONTEXT.md decision"
  - "Per-request AsyncOpenAI client — avoids shared state in single-worker deployment"
  - "Dual size check — file.size header may be None; len(content) is authoritative"

patterns-established:
  - "Whisper client: AsyncOpenAI(api_key=settings.openai_api_key) constructed per request"
  - "Audio tuple format: (file.filename or 'audio.webm', content, file.content_type or 'audio/webm')"

requirements-completed: [VOICE-02, VOICE-03, VOICE-05]

# Metrics
duration: 1min
completed: "2026-03-23"
---

# Phase 5 Plan 02: Voice Transcription Endpoint Summary

**POST /api/transcribe endpoint using AsyncOpenAI Whisper whisper-1 with dual 25MB size enforcement and auto-detect language**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-23T18:41:35Z
- **Completed:** 2026-03-23T18:42:34Z
- **Tasks:** 1 of 1
- **Files modified:** 2

## Accomplishments

- Created `backend/app/routers/transcribe.py` with authenticated POST /api/transcribe endpoint
- Dual 25MB size validation: fast rejection via `file.size` header (when present) plus authoritative check via `len(content)` after read
- Whisper whisper-1 call with no language parameter (auto-detect per project decision), audio passed as (filename, bytes, content_type) tuple
- Proper error handling: 413 for oversized audio, 502 with logged error for Whisper API failures
- Registered transcribe.router in main.py alongside the existing audit router

## Task Commits

Each task was committed atomically:

1. **Task 1: Create POST /api/transcribe endpoint and register router** - `97d39c4` (feat)

**Plan metadata:** _(pending final docs commit)_

## Files Created/Modified

- `backend/app/routers/transcribe.py` - POST /api/transcribe endpoint with size validation, Whisper call, error handling
- `backend/app/main.py` - Added transcribe router import and include_router registration

## Decisions Made

- No `language=` parameter in Whisper call — auto-detect per CONTEXT.md user decision
- Per-request AsyncOpenAI client construction to avoid shared state across concurrent requests
- Dual size check retained as specified — `file.size` is an optional header-derived value, `len(content)` is authoritative

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan's automated verify assertion used `r.path == '/transcribe'` but the actual path is `/api/transcribe` due to the `prefix="/api"` on the router (consistent with all other routers). The route is correctly registered; this is a plan verification script issue, not an implementation issue.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required beyond `OPENAI_API_KEY` already tracked in Settings (config.py).

## Next Phase Readiness

- Transcription endpoint is live and authenticated — ready for frontend voice UI (05-03) to POST audio and receive text
- No blockers

---
*Phase: 05-voice-and-audit*
*Completed: 2026-03-23*

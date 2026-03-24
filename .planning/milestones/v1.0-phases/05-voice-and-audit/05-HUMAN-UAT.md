---
status: partial
phase: 05-voice-and-audit
source: [05-VERIFICATION.md]
started: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end recording flow
expected: Click mic button → browser asks for mic permission → pulsing red dot + elapsed counter visible → click to stop → spinner overlay on prompt field → transcribed text appears in prompt field
result: [pending]

### 2. Transcription error toast
expected: When transcription fails (e.g., network error or server error), a sonner toast notification appears with error message and "Try again." description (NOT an inline error paragraph)
result: [pending]

### 3. Mic permission denied toast
expected: When user denies microphone permission, a toast notification appears informing them mic access is required
result: [pending]

### 4. 60-second auto-stop
expected: Recording automatically stops after 60 seconds with elapsed counter reaching 60s
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

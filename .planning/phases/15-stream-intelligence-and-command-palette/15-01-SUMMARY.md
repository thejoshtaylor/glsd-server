---
phase: 15-stream-intelligence-and-command-palette
plan: "01"
subsystem: backend/ws
tags: [stream-classification, websocket, backend]
dependency_graph:
  requires: []
  provides: [gsd-classification-pipeline]
  affects: [backend/app/ws/handlers.py, backend/app/ws/frontend_manager.py, backend/app/ws/frontend_router.py]
tech_stack:
  added: []
  patterns: [pure-function-classifier, envelope-enrichment, replay-nil-guard]
key_files:
  created:
    - backend/app/ws/classifier.py
  modified:
    - backend/app/ws/handlers.py
    - backend/app/ws/frontend_manager.py
    - backend/app/ws/frontend_router.py
decisions:
  - "Used Optional[Literal[...]] instead of Literal[...] | None — local Python 3.9 does not support | union syntax for type aliases at module level"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-25"
  tasks_completed: 2
  files_modified: 4
---

# Phase 15 Plan 01: GSD Stream Event Classifier Summary

Server-side GSD stream event classification pipeline: pure `classify_stream_event` function routes AskUserQuestion tool_use and result events to named classification strings, with freeform_wait stubbed behind `if False` guard; every forwarded WS `stream_event` message now carries an additive `gsd` envelope field.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create stream event classifier module | 71480b6 | backend/app/ws/classifier.py |
| 2 | Integrate classifier into stream event pipeline and fix replay path | 4888281 | handlers.py, frontend_manager.py, frontend_router.py |

## What Was Built

### classifier.py (new)

Pure module with `classify_stream_event(parsed_data: dict) -> GsdClassification`:
- Returns `"AskUserQuestion"` for `tool_use` events where `name == "AskUserQuestion"` (STRM-01)
- Returns `"completed"` for `result` events (STRM-03)
- Freeform wait detection wrapped in `if False` with TODO comment (STRM-02 — unconfirmed event shape)
- Returns `None` for all other events
- Never mutates `parsed_data`

### handlers.py (modified)

Added `classify_stream_event` import and call between buffer append and fan-out:
```python
gsd_classification = classify_stream_event(parsed_data)
await frontend_manager.fan_out_stream_event(payload.instance_id, parsed_data, gsd=gsd_classification)
```

### frontend_manager.py (modified)

`fan_out_stream_event` now accepts `*, gsd: str | None = None` kwarg and includes it in the WS message envelope:
```python
msg = {"type": "stream_event", "instance_id": instance_id, "data": data, "gsd": gsd}
```
The `data` field is never mutated — `gsd` is a sibling field on the envelope only.

### frontend_router.py (modified)

Replay path (Pitfall 5 fix) now includes `"gsd": None` in buffered event dicts — historical events are not reclassified, they use `None` explicitly to maintain consistent WS message shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Type alias syntax compatibility**
- **Found during:** Task 1 verification
- **Issue:** `GsdClassification = Literal[...] | None` raises `TypeError` on Python 3.9 (local env). Project targets Python 3.12 in Docker but local interpreter is 3.9.6, causing verification failure.
- **Fix:** Changed to `Optional[Literal["AskUserQuestion", "freeform_wait", "completed"]]` — semantically equivalent and compatible with Python 3.9+. No behavior change.
- **Files modified:** backend/app/ws/classifier.py
- **Commit:** 71480b6

## Known Stubs

| File | Pattern | Reason |
|------|---------|--------|
| backend/app/ws/classifier.py:32-35 | `if False: if event_type == "system" and parsed_data.get("subtype") == "input_required": return "freeform_wait"` | STRM-02 freeform wait detection — exact system event subtype is UNCONFIRMED. Must capture raw NDJSON from a real `gsd discuss-phase` run before enabling. See STATE.md Research Flags. |

These stubs do NOT prevent the plan's goal: Phase 16 only needs AskUserQuestion classification (STRM-01) and completion detection (STRM-03), both of which are fully implemented.

## Self-Check: PASSED

---
phase: 02-node-protocol-engine
plan: 04
subsystem: backend/ws
tags: [health-monitor, background-task, stale-detection, lifespan]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [stale-node-scanner, health-monitor-lifespan]
  affects: [backend/app/ws/health.py, backend/app/main.py]
tech_stack:
  added: []
  patterns: [asyncio.create_task background loop, SQLAlchemy bulk update, asyncio.CancelledError shutdown]
key_files:
  created:
    - backend/app/ws/health.py
  modified:
    - backend/app/main.py
decisions:
  - "Scanner sleeps first then scans — 30s startup grace period before first check"
  - "Per-stale-node DB session (not one session per full scan) — limits transaction scope"
  - "Engine disposal after scanner cancel — allows scanner's last DB session to complete"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-21"
  tasks_completed: 2
  files_changed: 2
---

# Phase 02 Plan 04: Stale Node Health Monitor Summary

Stale node scanner background task with 90s threshold / 30s interval, wired into FastAPI lifespan with clean cancellation on shutdown.

## What Was Built

`backend/app/ws/health.py` — The health monitor background task:
- `STALE_THRESHOLD_SECONDS = 90`, `SCAN_INTERVAL_SECONDS = 30`
- `stale_node_scanner()` — infinite loop, sleeps 30s then scans; survives per-scan exceptions
- `_scan_for_stale_nodes()` — iterates `connection_manager.all_connections()`, detects nodes where `last_heartbeat < now - 90s`
- `_mark_node_stale(node_id)` — marks node `NodeStatus.stale` in DB, bulk-updates running/pending instances to `InstanceStatus.errored` with error `"node marked stale: no heartbeat received"`, closes WebSocket, deregisters from `connection_manager`

`backend/app/main.py` — FastAPI lifespan updated:
- `asyncio.create_task(stale_node_scanner())` on startup
- `scanner_task.cancel()` + `CancelledError` suppression on shutdown
- `engine.dispose()` after scanner stops

## Decisions Made

- Scanner sleeps before first scan — 30s grace period prevents false positives at startup
- Short-lived DB sessions per stale node — `get_session_maker()()` called once per node, not once per scan loop
- Shutdown order: cancel scanner first, then dispose engine — ensures any in-progress DB writes can complete

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: backend/app/ws/health.py (commit 4942542)
- FOUND: backend/app/main.py (commit f1f26dc)

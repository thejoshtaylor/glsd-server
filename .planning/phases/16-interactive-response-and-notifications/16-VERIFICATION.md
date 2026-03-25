---
phase: 16-interactive-response-and-notifications
verified: 2026-03-25T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 16: Interactive Response and Notifications Verification Report

**Phase Goal:** Users can answer GSD questions directly in the stream view and receive browser and in-app alerts when a node needs input or completes work
**Verified:** 2026-03-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | AskUserQuestion renders as clickable option buttons (single-select) or checkboxes (multi-select) in the stream view | VERIFIED | `InteractiveResponseUI.tsx` L117-179 handles `question.multiSelect` branching; single-select calls `handleSingleSelect` on click, multi-select toggles membership and shows Submit button |
| 2   | Freeform input wait renders a text input with submit button | VERIFIED | `InteractiveResponseUI.tsx` L182-218 Mode C: `<textarea>` with `freeformText` state, `handleFreeformSubmit` wired to Submit button |
| 3   | Submitting an answer dispatches as session-resuming execute; prompt clears immediately and does not reappear after termination | VERIFIED | `handleSubmit` at L56-83 sends `claim_prompt` then `submit_answer` via WS; nil-guard at L31-33 prevents render on `finished`/`errored`/`answered`; `wsStore.ts` L98-99 calls `clearPromptState` on termination |
| 4   | If two tabs are open, only one can submit; other sees prompt disappear on first submission | VERIFIED | `frontend_manager.py` L66-68 exclusive claim dict; `broadcast_prompt_answered` fans out to ALL connections before `dispatch_execute` (L191 before L207 in `frontend_router.py`); `wsStore.ts` L123-124 sets `answered` state on broadcast |
| 5   | User receives browser notification (tab unfocused) and Sonner toast when node needs input or instance completes/errors | VERIFIED | `wsStore.ts` L77-87 toasts + browser notifications on `AskUserQuestion`/`freeform_wait`; L101-111 toasts + browser notifications on `finished`/`errored`; all guarded by `document.hidden` for tab-unfocused constraint |
| 6   | User can grant/deny notification permissions from the dashboard without leaving the page | VERIFIED | `NotificationSettings.tsx` (45 lines) mounted in `dashboard/index.tsx` L15; shows permission state, Enable button calls `requestPermission` on user gesture only |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/app/ws/frontend_manager.py` | claim_prompt, release_prompt, get_prompt_claim, broadcast_prompt_answered, broadcast_prompt_claimed methods | VERIFIED | All 5 method signatures confirmed; `_prompt_claims` dict at L35; `deregister` cleans stale claims L55-57 |
| `backend/app/ws/frontend_router.py` | claim_prompt and submit_answer WS message handlers | VERIFIED | `elif msg_type == "claim_prompt"` at L155; `elif msg_type == "submit_answer"` at L171; 5 references total |
| `frontend/src/types/protocol.ts` | prompt_claimed and prompt_answered incoming; claim_prompt and submit_answer outgoing | VERIFIED | All 4 union members present at L8-9 (incoming) and L14-15 (outgoing) |
| `frontend/src/stores/wsStore.ts` | promptStates map, setPromptState, clearPromptState, handleMessage cases, toast/notification triggers | VERIFIED | 14 references to prompt state; toast imports and 4 toast calls; 4 `new Notification` calls; all switch cases present |
| `frontend/src/components/stream/InteractiveResponseUI.tsx` | Interactive prompt rendering for AskUserQuestion (single/multi) and freeform_wait | VERIFIED | 221 lines (exceeds min_lines 80); all three render modes; nil-guard; claim/submit wired |
| `frontend/src/components/stream/StreamPanel.tsx` | Mounts InteractiveResponseUI below event list | VERIFIED | Import at L5; `{isRunning && <InteractiveResponseUI ... />}` at L44-45 |
| `frontend/src/hooks/useNotifications.ts` | requestPermission, notify, permission state | VERIFIED | 23 lines; `Notification.requestPermission()` at L10; `document.hidden` guard at L18; exports `{ permission, requestPermission, notify }` |
| `frontend/src/components/notifications/NotificationSettings.tsx` | Notification permission toggle UI for dashboard | VERIFIED | 45 lines; all three permission states handled (granted/denied/default); Enable button triggers `requestPermission` on user gesture |
| `frontend/src/routes/dashboard/index.tsx` | Mounts NotificationSettings | VERIFIED | Import at L4; `<NotificationSettings />` at L15 |
| `frontend/src/lib/icons.ts` | Bell, BellOff, MessageCircleQuestion, Send exports | VERIFIED | All 4 icons confirmed at L29-33 |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `frontend/src/stores/wsStore.ts` | `frontend/src/types/protocol.ts` | WsIncomingMessage union includes prompt_claimed and prompt_answered | VERIFIED | Type-checked by `npx tsc --noEmit` (0 errors); switch cases at L120-125 match union types |
| `backend/app/ws/frontend_router.py` | `backend/app/ws/frontend_manager.py` | claim_prompt and broadcast_prompt_answered calls | VERIFIED | `frontend_manager.claim_prompt(instance_id, conn)` at L159; `await frontend_manager.broadcast_prompt_answered(instance_id)` at L191 |
| `frontend/src/components/stream/InteractiveResponseUI.tsx` | `frontend/src/stores/wsStore.ts` | useWsStore selector for promptStates, instanceStatuses, streamBuffers | VERIFIED | 4 `useWsStore` selectors at L21-24 |
| `frontend/src/components/stream/InteractiveResponseUI.tsx` | `frontend/src/lib/api.ts` | api() fetch for GET /api/instances/:id to get session_id | VERIFIED | `api<InstanceResponse>('/api/instances/${instanceId}')` at L64 |
| `frontend/src/components/stream/StreamPanel.tsx` | `frontend/src/components/stream/InteractiveResponseUI.tsx` | JSX mount below events list | VERIFIED | `<InteractiveResponseUI instanceId={instanceId} nodeId={nodeId} />` at L45 |
| `frontend/src/stores/wsStore.ts` | sonner | toast() calls in handleMessage | VERIFIED | `import { toast } from 'sonner'` at L2; 4 toast calls at L78, 83, 103, 108 |
| `frontend/src/hooks/useNotifications.ts` | Notification API | new Notification() and Notification.requestPermission() | VERIFIED | `Notification.requestPermission()` at L10; `new Notification(...)` at L19 |
| `frontend/src/routes/dashboard/index.tsx` | `frontend/src/components/notifications/NotificationSettings.tsx` | JSX mount | VERIFIED | Import at L4; `<NotificationSettings />` at L15 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `InteractiveResponseUI.tsx` | `promptState` | `wsStore.promptStates[instanceId]` set by `prompt_claimed`/`prompt_answered` WS messages from server | Yes — server broadcasts on real WS events from node execution | FLOWING |
| `InteractiveResponseUI.tsx` | `events` (stream buffer) | `wsStore.streamBuffers[instanceId]` populated by `stream_event` WS messages | Yes — live NdjsonEvent data from node agent | FLOWING |
| `InteractiveResponseUI.tsx` | `instance.session_id` | REST `GET /api/instances/:id` — DB-backed query | Yes — returns real InstanceResponse from database | FLOWING |
| `NotificationSettings.tsx` | `permission` | `useNotifications()` hook reading `Notification.permission` browser API | Yes — live browser permission state | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Backend Python syntax valid | `python3 -c "import ast; ast.parse(open('backend/app/ws/frontend_manager.py').read()); ast.parse(open('backend/app/ws/frontend_router.py').read()); print('OK')"` | `syntax OK` | PASS |
| TypeScript compiles without errors | `cd frontend && npx tsc --noEmit` | (no output = 0 errors) | PASS |
| broadcast_prompt_answered fires BEFORE dispatch_execute | Line ordering: L191 vs L207 in frontend_router.py | Broadcast at L191 precedes dispatch at L207 | PASS |
| All 5 claim methods exist in FrontendConnectionManager | `grep -c "def claim_prompt\|def release_prompt\|def get_prompt_claim\|broadcast_prompt_answered\|broadcast_prompt_claimed" backend/app/ws/frontend_manager.py` | `5` | PASS |
| Protocol union covers all 4 new message types | `grep -c "prompt_claimed\|prompt_answered\|claim_prompt\|submit_answer" frontend/src/types/protocol.ts` | `4` | PASS |
| Toast triggers in wsStore | `grep -c "toast\." frontend/src/stores/wsStore.ts` | `4` | PASS |
| Browser notifications in wsStore | `grep -c "new Notification" frontend/src/stores/wsStore.ts` | `4` | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| RESP-01 | 16-02-PLAN.md | User sees AskUserQuestion as clickable single-select option buttons | SATISFIED | `InteractiveResponseUI.tsx` L134-137: `handleSingleSelect` on click; `question.multiSelect === false` path renders buttons that submit immediately |
| RESP-02 | 16-02-PLAN.md | User sees multi-select questions rendered as checkbox lists | SATISFIED | `InteractiveResponseUI.tsx` L135-136: `toggleMultiOption` for multi-select; checkmark icon at L155-157; Submit button at L165-178 |
| RESP-03 | 16-02-PLAN.md | User can type freeform text responses when input wait is detected | SATISFIED | `InteractiveResponseUI.tsx` L182-218: textarea with `freeformText` state and Submit button wired to `handleFreeformSubmit` |
| RESP-04 | 16-01-PLAN.md | User's answer submitted as session-resume execute dispatch to node | SATISFIED | `frontend_router.py` L207-217: `dispatch_execute(session_id=session_id)` called with real session_id from DB; `InteractiveResponseUI.tsx` L72-77 sends `submit_answer` with `session_id` |
| RESP-05 | 16-01-PLAN.md | Multi-tab prompt claiming prevents duplicate submissions | SATISFIED | `frontend_manager.py` L65-68: exclusive `_prompt_claims` dict; second claim returns False; `broadcast_prompt_answered` releases claim after broadcast (L87); `claimed_by_other` state disables UI in `InteractiveResponseUI.tsx` L54, L111-113 |
| NOTF-01 | 16-03-PLAN.md | Browser notification when node needs input and tab unfocused | SATISFIED | `wsStore.ts` L79-81, L84-86: `new Notification()` on `AskUserQuestion`/`freeform_wait` gated by `document.hidden` |
| NOTF-02 | 16-03-PLAN.md | Browser notification when instance completes or errors and tab unfocused | SATISFIED | `wsStore.ts` L104-106, L109-111: `new Notification()` on `finished`/`errored` gated by `document.hidden` |
| NOTF-03 | 16-03-PLAN.md | In-app Sonner toast for completion and input-needed events (live only, no replays) | SATISFIED | `wsStore.ts` L77-87: toasts only on `msg.gsd === 'AskUserQuestion'` or `=== 'freeform_wait'` (null excluded for replays); L102-111: toasts on `finished`/`errored` |
| NOTF-04 | 16-03-PLAN.md | User can manage notification permissions from the dashboard | SATISFIED | `NotificationSettings.tsx` mounted in `dashboard/index.tsx`; shows all 3 permission states; Enable button triggers `requestPermission` on user gesture only |

**All 9 requirements satisfied. No orphaned requirements.**

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `InteractiveResponseUI.tsx` | 196, 200 | `placeholder` CSS class and textarea placeholder attribute | Info | Legitimate textarea placeholder text — not a stub indicator |

No blockers or warnings found. The `placeholder` attribute matches at L196 are HTML textarea `placeholder` (user-facing hint text), not code stubs. All `return null` calls are legitimate nil-guards (terminated instance, answered prompt, SSR-safety). No TODO/FIXME/HACK annotations. No empty handler stubs. No hardcoded empty arrays flowing to render.

---

### Human Verification Required

#### 1. Single-select button interaction

**Test:** Open a running instance that triggers an AskUserQuestion in the stream. Click one of the rendered option buttons.
**Expected:** Button highlights on click, prompt disappears immediately (claim + submit dispatched), node resumes with the selected option as the prompt.
**Why human:** Interactive WS flow through claim/submit/answered cycle requires a live node agent.

#### 2. Multi-tab claiming race

**Test:** Open two browser tabs with the same running instance that has a pending AskUserQuestion. Click an option in Tab 1 simultaneously with Tab 2.
**Expected:** Only one tab submits successfully. The other sees the prompt disappear (prompt_answered broadcast) without being able to submit.
**Why human:** Race condition behavior requires real concurrent WS connections.

#### 3. Browser notification on unfocused tab

**Test:** Grant notification permission from the dashboard. Switch to a different tab. Trigger a node that produces an AskUserQuestion.
**Expected:** OS-level browser notification appears with "Input needed" title.
**Why human:** Requires real browser notification API with focus state.

#### 4. Notification permission UI states

**Test:** On the dashboard, verify the notification settings widget shows the current permission state correctly across: default (Enable button), granted (green Active), denied (browser settings hint).
**Expected:** All three states render correctly and Enable button triggers the browser permission dialog.
**Why human:** Visual appearance and browser dialog behavior require manual inspection.

---

### Gaps Summary

No gaps found. All 6 success criteria from ROADMAP.md are fully implemented, all 9 requirement IDs (RESP-01 through RESP-05, NOTF-01 through NOTF-04) are satisfied with direct evidence in the codebase, and TypeScript and Python syntax both compile/parse without errors.

---

_Verified: 2026-03-25_
_Verifier: Claude (gsd-verifier)_

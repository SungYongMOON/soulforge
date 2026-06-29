# AX-WORK-EVENT-HOOK - ERP start/completion as canonical work events

Status: implementation slice
Date: 2026-06-28

## Goal

Make the ERP item action buttons the canonical work lifecycle surface:

- `open -> doing` via the ERP start button records a metadata-only work start event.
- `* -> done` via the ERP completion button records a metadata-only work completion event, writes the existing completion log, and optionally enriches the result from an attached Codex task conversation.
- Codex task conversations remain auxiliary evidence. They never decide that a task is complete.

Here `AX` means accumulated work-event metadata for later automation, procedure, workflow, skill, or knowledge candidate review. It does not mean a separate ERP product module.

## Current Implementation

- UI action buttons are defined in `static/app.js` as status transitions.
- The click handler posts `{ id, status }` to `POST /api/items/status`.
- `server.mjs` handles that route by calling `store.setItemStatus`, then appending a generic `event_log(kind='item_status')`.
- `store.setItemStatus` sets `done_at` only when entering `done` and clears it when leaving `done`.
- Completion already writes `completion_log` and may create a pending `ai_proposal(kind='completion_digest')` when local Ollama and Codex task messages are available.

## Target Behavior

Use the existing `event_log` and `completion_log` first. Do not add a new table until a real structured-query need appears.

Start button:

- Trigger: `from='open'`, `to='doing'`.
- Append `event_log(kind='work_started')`.
- Store only metadata: actor, item ref, project ref, from/to status, used refs, and a compact note.

Completion button:

- Trigger: `to='done'` and previous status is not `done`.
- Insert one `completion_log` row, snapshotting item metadata needed for later extraction: `completion_criteria`, `result`, and `log_ref`.
- Append `event_log(kind='work_completed')` with `used_refs=['items','completion_log']`; include `codex_thread_binding` and compact `completion_log_id`/`codex_thread_id` note metadata when a Codex task thread exists.
- If Codex task messages exist, run the existing completion digest path as non-blocking enrichment.
- If digest generation cannot run, record metadata-only hook status only when a Codex conversation exists.
- Store completion knowledge hints as structured JSON, for example `{"note":"..."}`, not a JSON scalar string.
- Completion digest proposals include item metadata, the Codex thread id, and the latest Codex message id/role/timestamp pointer.

## Boundaries

- No raw mail bodies, attachments, source documents, credentials, cookies, tokens, or secrets are copied into `event_log`, `completion_log`, or `ai_proposal`.
- Codex task message storage remains runtime DB state. Promotion/export surfaces should use digest/ref metadata only.
- Completion digest proposals stay pending; approval means acknowledgement unless a later slice explicitly defines another action.
- Reopen keeps the existing invariant that `done_at` is cleared and the latest `completion_log` row is removed.

## Minimal Code Plan

1. Add small server helpers for lifecycle events and post-completion enrichment.
2. Keep UI buttons unchanged.
3. In `/api/items/status`, call the start helper for `open -> doing`.
4. In `/api/items/status`, call the completion helper for `non-done -> done`.
5. Add event labels for the new lifecycle and hook-status events.
6. Add focused node tests for start, completion, idempotence, and pending-only digest behavior.

## Acceptance

- ERP start produces both `item_status` and `work_started` events.
- ERP completion produces `item_status`, `work_completed`, and one `completion_log` row.
- `completion_log` keeps completion criteria/result/log refs as a completion-time snapshot.
- `work_completed` points back to the completion log and, when present, the Codex task thread binding through metadata refs.
- Repeating `done` does not add another `completion_log` or `work_completed` event.
- Completion succeeds without local Ollama.
- If Codex messages exist but local Ollama is unavailable, completion still succeeds and records `completion_hook_skipped`.
- No new raw payload storage is introduced.

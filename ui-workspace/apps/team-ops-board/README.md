# Workspace Board — Owner perspective local Codex thread projection

The normal Board is a local, read-only, metadata-only projection of actual Codex
threads. It does not use the former synthetic Owner Inbox in its normal UI.

Visibility has one authority: a local owner enrollment record containing the
**exact `thread_id`**. Runtime `thread/list` is discovery/observation only. A
matching title, workspace, parent, prefix, age, or idle state never enrolls a
thread and never creates a card.

Every enrollment also carries an owner-provided `display_label` for the Board
card and detail title. It is local metadata only: app-server names and titles
are never used. Labels are NFKC-normalized, single-line, control-free, and
length-bounded; filesystem- or URL-like values are rejected.

## What the Board shows

- **Owner 현황**: only an explicit, metadata-only `result_ready` gate whose
  target is `owner`. Root rows, internal responsibility rows, idle, Stop, title,
  age, and LLM interpretation never create Owner attention.
- **조직도**: the two-company projection with expandable exact enrolled
  `parent_thread_id` edges, direct-child counts, and parent result roll-ups.
- **업무·기록**: current internal work, parent-targeted result delivery,
  browser-local Owner read receipts, accepted/closed history, and the separate
  AI Usage Meter aggregate entry.
- Current registered `manager`, `task`, `verifier`, and `continuation` rows,
  grouped by owner-provided `organization_group_id`; `parent_thread_id` is
  validated for exact parent existence and acyclicity before it reaches the
  browser.
- Safe status labels only: `실행 중`, `입력·승인 대기`, `하위 결과 도착/취합 중`,
  `Owner 확인 필요`, `관측 불가`, and history-only `수락·종료 이력`.
- Local-only health, partial coverage, last refresh, registered/unseen counts,
  result-gate health, and a generic unregistered discovery count.
- `실제 TASK · 조직 route 미확정 · 자동 라우팅 HOLD` until a separate exact
  binding is supplied. Enrollment is never route catalog or live-binding
  authority; `execution_ready` remains false by default.

The browser can acknowledge only an explicit Owner-targeted result or
escalation. The acknowledgement key includes `thread_id` and `updated_at`, so a
subsequent explicit lifecycle update reappears automatically. This changes
browser `localStorage` only; it never changes, archives, creates, deletes, or
messages a Codex thread.

## Local endpoint and privacy boundary

Vite exposes `GET /codex-threads.snapshot.json` only to loopback clients. The
adapter starts its own short-lived official `codex app-server` stdio client,
sends `initialize` then `initialized`, and cursor-paginates `thread/list`. It
prefers `useStateDbOnly`; a server that rejects that parameter is retried once
without it.

The client is bounded by page, item, protocol-byte, line-byte, timeout, cache,
and single-flight limits. It builds the response from an allowlist and discards
all other protocol fields before caching, logging, storage, or browser output.
In particular, it never expose previews, names/titles, turns, paths, git data,
descriptions, raw messages, prompts, reasoning, tool input/output, or secrets.
The Board does not inspect task workspace source code.

Default enrollment data is local-only and is not created by the adapter:

```text
guild_hall/state/operations/team_ops_board/thread_visibility.v1.json
```

Override that path only for local operations or tests with
`TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY`. Set
`TEAM_OPS_BOARD_LIVE_THREADS_DISABLED=1` or `disabled: true` in the local
registry to stop observation and enrollment writes immediately.

Override the local result-gate path only for local operations or tests with
`TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY`.

A separate, local metadata-only exact-binding file can be provided through
`TEAM_OPS_BOARD_EXACT_THREAD_BINDINGS`. Its `thread_id` and `route_id` must
match the enrollment exactly; an absent or invalid file produces `HOLD`, never
a guessed route or readiness claim.

## Exact enrollment CLI

The CLI is deliberately limited to local registry metadata. It has no Codex
thread create/delete/archive/send operation.

Card identity comes only from the exact local enrollment registry. Current
runtime metadata comes from the official local `codex app-server`.
Metadata-only `Stop`/`SubagentStop` evidence may be displayed as a safe stop
observation timestamp, but it is execution cessation only: it never becomes a
result, completion, parent acceptance, or Owner attention. The Board never
reads or projects prompt, reasoning, tool payload, runtime title, cwd, or
transcript content. Without an explicit result gate, idle and `notLoaded` stay
`관측 불가` and cannot be acknowledged.

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- register-existing `
  --thread-id <exact-thread-id> `
  --organization-group-id <group-id> `
  --thread-kind task `
  --display-label "Development1 release TASK" `
  --relationship primary `
  --parent-thread-id <nullable-exact-parent-thread-id> `
  --route-id <nullable-route-id> `
  --work-id <nullable-work-id>

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- rollover `
  --from-thread-id <prior-exact-id> --to-thread-id <new-exact-id> --next-lifecycle current

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- retire --thread-id <exact-thread-id>
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- history --thread-id <exact-thread-id>
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- validate
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- list
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- reconcile --live
```

`register-existing` is idempotent only for the same exact metadata. It forces
`metadata_only: true` and every raw flag to `false`. `rollover` moves a pending
exact enrollment to `accepted` or `current` and retains the prior enrollment as
metadata-only history. All writer operations use temporary-file plus rename
atomic replacement.

## Explicit result gate

Result/attention state has a separate local metadata-only registry:

```text
guild_hall/state/operations/team_ops_board/thread_result_gate.v1.json
```

It is append-only by exact `event_id`, idempotent for an identical retry, and
rejects a conflicting duplicate. An event has only an exact `thread_id`, event
type, target, target exact parent ID where applicable, timestamp, and false raw
flags. It cannot store a message, preview, prompt, reasoning, tool I/O, cwd, or
path.

The deterministic lifecycle is:

```text
started -> result_ready(target: parent | owner) -> accepted -> closed
```

`result_ready(target: parent)` must name the enrolled exact structural parent.
It rolls up only to that parent as `하위 결과 도착/취합 중`. A parent-targeted
result does not enter Owner 현황. `result_ready(target: owner)` is the sole
source of `Owner 확인 필요`. `accepted` and `closed` remove the descendant from
current work and retain it in Board history; neither action touches the Codex
thread.

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- emit `
  --event-id <exact-event-id> --thread-id <exact-thread-id> `
  --event-type started --target none --occurred-at <ISO-8601>

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- emit `
  --event-id <exact-event-id> --thread-id <exact-thread-id> `
  --event-type result_ready --target parent --target-thread-id <exact-parent-thread-id> `
  --occurred-at <ISO-8601>

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- validate
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- disable
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- enable
```

`TEAM_OPS_BOARD_RESULT_GATES_DISABLED=1` or local `disabled: true` makes the
gate fail closed. The Board then shows no gate-derived attention or completion.
This is local rollback only; it is not a route/task writer and does not archive
or delete anything.

## Running and verification

```powershell
npm.cmd --prefix ui-workspace run team-ops-app:dev -- --host 127.0.0.1 --port 4192 --strictPort
npm.cmd --prefix ui-workspace run team-ops-app:test
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run test:live-threads
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run typecheck
npm.cmd --prefix ui-workspace run team-ops-app:build
```

The app-server adapter tests cover handshake/initialization, pagination,
`useStateDbOnly` fallback, redaction, exact-ID joining, bounded cache/failure
behavior, and no prefix fallback. Enrollment tests cover atomic writes,
idempotency, rollover/history, parent-lineage validation, disable gates, and
reconciliation. Result-gate tests cover the deterministic synthetic
parent/three-child/Owner canary, duplicate-event idempotency, no-start failure,
accepted/closed history, raw-field rejection, atomic CLI writes, and emergency
disable. Frontend tests cover normalization, polling refresh, Owner-only
attention, acknowledgement hide/reappear/restore, exact organization-tree
controls, and narrow-safe layout boundaries.

## AI Usage Meter stays separate

The Board also makes one credential-free same-origin request for
`/ai-usage-meter.snapshot.json`. This is an aggregate, metadata-only panel
owned by the AI Usage Meter; it does not infer or display guessed per-thread
usage attribution. Unknown, unreconciled, or protected input remains
`UNMEASURED / UNKNOWN`.

This Board projection is validated-private local tooling. It is not a route
resolver, Codex runtime authority, task-status authority, deployment, or
production control surface.

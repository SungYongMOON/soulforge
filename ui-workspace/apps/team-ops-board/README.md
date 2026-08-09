# Workspace Board — Owner perspective local Codex thread projection

The normal Board is a local, read-only, metadata-only projection of actual Codex
threads. It does not use the former synthetic Owner Inbox in its normal UI.

Visibility has one authority: a local enrollment record containing the
**exact `thread_id`**. The adapter may append a new child record only from an
exact active parent-child edge returned by the official local app-server or an
exact fresh `SubagentStart` identity already validated by the Meter. A matching
title, workspace, prefix, age, or idle state never enrolls a thread and never
creates a card.

Every enrollment also carries an owner-provided `display_label` for the Board
card and detail title. It is local metadata only: app-server names and titles
are never used. Labels are NFKC-normalized, single-line, control-free, and
length-bounded; filesystem- or URL-like values are rejected.

## What the Board shows

- **Owner 현황**: only an explicit, metadata-only `result_ready` gate whose
  target is `owner`. Root rows, internal responsibility rows, idle, Stop, title,
  age, and LLM interpretation never create Owner attention.
- **LIVE STATUS 연결 표시**: `활성 세션`은 현재 `active`와 `waiting`만
  합산한다. 파란 `결과 확인`은 별도 작업 gate이며 연결 여부가 아니다.
  각 행의 원형 표시와 보조 문구는 실제 실행 관측을 초록(연결),
  주황(응답 대기), 회색(연결 종료/미확인)으로 따로 표시한다.
- **조직도**: an exact enrolled `parent_thread_id` topology with two persistent
  display scopes. `실시간만` shows only actionable execution, approval-wait,
  and result-confirmation nodes plus every exact company/CEO/manager ancestor;
  `전체 조직` retains all fixed company/CEO/manager anchors. Two actionable
  TASKs therefore show both TASK nodes and each exact responsibility path,
  without title-based or inferred ancestry.
- **업무·기록**: current internal work, parent-targeted result delivery,
  browser-local Owner read receipts, accepted/closed history, and the separate
  AI Usage Meter aggregate entry.
- **시스템 토폴로지**: Watchtower W1의 local read-only health projection.
  장치 종류는 입력·감독·연산·저장·판단·출력의 외곽 도형으로, 상태는
  정상(초록)·열화/신선도(주황)·미감시 구조(파랑)·정지(빨강)로 분리한다.
  각 간선은 source의 오른쪽 OUT에서 target의 왼쪽 IN으로만 연결되며,
  노드 선택은 직접 연결된 1-hop 경로만 강조한다. 간선은 구조 방향이며
  per-edge receipt가 없는 현재 전송 중 상태를 추정하지 않는다.
  `unmonitored` 공급자 관계는 관측된 공급자 health가 아니라 구조/카탈로그
  관계다. 노드는 색만으로 표시하지 않고 `관측 미구성`과 safe reason을
  함께 보이며, 이는 Claude·Antigravity의 현재 성공·정상이나 독립적 공급자
  증거를 뜻하지 않는다. `REFRESHING`, `HOLD`, 또는 `STALE`은 보존된 토폴로지
  snapshot을 표시할 수 있으나, 그 snapshot도 공급자 성공이나 per-edge receipt를
  주장하지 않는다. projection은 마지막 성공/실패의 age를 텍스트로 표시하며,
  `null` age는 해당 기록이 없음을 뜻한다.
- Current registered `manager`, `task`, `verifier`, and `continuation` rows,
  grouped by owner-provided `organization_group_id`; `parent_thread_id` is
  validated for exact parent existence and acyclicity before it reaches the
  browser.
- Safe status labels only: `실행 중`, `입력·승인 대기`, `결과 확인`, `응답 종료 · 결과 미확정`, `상태 신호 없음`, `상태 관측 오류`, `하위 결과 도착/취합 중`,
  `Owner 확인 필요`, and history-only `수락·종료 이력`.
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

### Optional local tailnet Host allowlist

Development and preview keep Vite's default Host policy unless the local process
environment supplies `TEAM_OPS_BOARD_ALLOWED_HOSTS`. It accepts exactly one
canonical lowercase `.ts.net` FQDN. The value is not normalized or split:
unset, blank, or malformed input (including a wildcard, IP literal, scheme,
port, path, multiple values, empty label, uppercase form, or oversize name)
results in no custom host exception.

This setting changes only Vite Host-header allowance. It does not change the
loopback bind, expose a network service, or override any read-only pilot
disable. Keep actual host, account, and device values out of tracked files and
documentation.

The client is bounded by page, item, protocol-byte, line-byte, timeout, cache,
and single-flight limits. It builds the response from an allowlist and discards
all other protocol fields before caching, logging, storage, or browser output.
In particular, it never expose previews, names/titles, turns, paths, git data,
descriptions, raw messages, prompts, reasoning, tool input/output, or secrets.
The Board does not inspect task workspace source code.

Live refresh uses two validated buffers. A candidate lifecycle refresh is
checked off-screen and replaces the displayed snapshot only when its source is
available; a transient reconciliation `hold`/`0/0` candidate keeps the last
validated snapshot visible. Automatic polling is single-flight, does not show
the manual-refresh busy state, and commits accepted candidates through a
non-blocking UI transition so scrolling, selection, and organization-graph
interaction remain available during observation.

Default enrollment data is local-only. Existing organization roots remain
explicitly registered; eligible exact child TASK records can be appended by the
adapter's single awaited writer:

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

## Organization governance projection

The organization surface is projected from this ignored, local metadata-only
governance source, not from fixed company or group constants in the Board:

```text
_workmeta/system/bindings/organization_governance_overlay.v1.json
```

It defines organization IDs, exact parent IDs, organization kinds, display
labels and order, lifecycle, branch membership, and separate role bindings.
Individual Codex manager/responsibility IDs are not duplicated in that file:
the current exact enrollment registry supplies those roster rows and their
`parent_thread_id` edges. `전체 조직` combines both sources to show every
current company, CEO, team manager, and responsibility. TASK/verifier nodes
remain transient and appear only when they have an exact live, waiting, stop,
or result signal.
The provider validates and projects that source to the Board's existing
read-only catalog contract on every refresh. A source rename, reorder, or new
organization therefore appears without a Board code change or an LLM call. A
missing, invalid, disabled, candidate-only, or unknown current enrollment group
is `HOLD`; the Board never invents a company, hierarchy position, or route.

Use `TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY` to select another local
governance source for an operation or test. The local CLI is read-only and
validates strict metadata-only fields and enrollment membership before
reporting success:

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:organization -- validate
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:organization -- validate --registry <local-enrollment-registry>
```

Manual Board catalog upsert/retire/init commands are disabled while governance
is active. `SOULFORGE_ORGANIZATION_GOVERNANCE_DISABLED=1` is the repo-level
emergency stop. An explicit
`SOULFORGE_ORGANIZATION_GOVERNANCE_ROLLBACK_LEGACY=1` may expose the previous
ignored catalog only as a visible `HOLD` rollback projection; it never promotes
that cache to organization authority. Neither mode creates, routes, alters,
archives, or messages a Codex thread.

## Lifecycle receipt read-only signal

The Board can consume the AI Usage Meter's ignored local exact-ID lifecycle
snapshot at:

```text
guild_hall/state/operations/ai_usage_meter/lifecycle/current.json
```

This is the same identity-bearing contract emitted by `lifecycle-snapshot
--include-identities`. The Board validates its strict keys, zero raw-field
counts, lifecycle/event pairing, timestamps, duplicate identities, freshness,
and the Meter emergency-disable control before use. It never reads receipt
history, a transcript, a title, a path, or a worktree.

On normal refresh, the Board asks the Meter-owned reconciler to inspect only
the configured `CODEX_HOME/sessions` metadata for currently enrolled exact
IDs, then to refresh the ignored Meter snapshot. It is bounded to 200 IDs,
debounced for 15 seconds, single-flight, and stops waiting after 2 seconds.
The Board neither parses nor projects JSONL raw content itself. A disabled,
missing, invalid, timed-out, or failed source remains fail-closed (`hold` /
unknown); the Board stays usable and never writes Task, ERP, enrollment, or
result-gate state. A partial scan may retain only already validated exact
observations; it cannot infer a missing identity.

An exact enrolled `agent_id` is preferred; otherwise an exact enrolled
`session_id` is used. A non-matching identity is discarded. `started` becomes
an `active` signal, `waiting_on_approval` becomes `waiting`, and
`observed_at_stop` or `ended` becomes `stopped` and is presented as `응답 종료 · 결과 미확정`; it proves only that the latest response/turn ended, not that the TASK completed. The former `관측 불가` label is presented as `상태 신호 없음`: the thread is registered but the Board has no fresh exact lifecycle evidence that proves execution, waiting, or result delivery. A source error is shown separately as `상태 관측 오류`. The Codex sidebar blue dot is an unread/new-activity presentation signal and is never used as runtime, result, or completion evidence.
`input_received` is not running evidence. Missing, corrupt, disabled, or stale
snapshots add no runtime evidence and leave the row unknown. A stop-only child
is not retained as a blue topology result: blue requires an explicit result
delivery gate. This prevents a response turn ending from being presented as
completion, acceptance, unread work, or Owner attention.

The health strip reports lifecycle source availability and exact matched/seen
identity counts only. Local test overrides are
`TEAM_OPS_BOARD_LIFECYCLE_SNAPSHOT` and
`TEAM_OPS_BOARD_LIFECYCLE_DISABLE_CONTROL`; automatic reconciliation can be
explicitly disabled only with `TEAM_OPS_BOARD_AUTO_LIFECYCLE_RECONCILE=false`.

## Automatic exact child enrollment

The Board does not rely on a manager remembering a registration instruction.
On refresh it merges two allowlisted structural sources: the official local
app-server's exact `thread_id`/`parentThreadId` edge for an `active` or already
`idle` child, and the Meter's
validated, fresh `SubagentStart` `session_id`/`agent_id` identity. Both feed the
same atomic enrollment writer; there is no second receipt writer.

Accepting an exact `idle` child closes the race where a short TASK starts and
ends between 10-second polls. It enrolls identity and hierarchy only; `idle`
is never treated as completion or result evidence.

A new child is appended only when its exact parent is already `current` or
`accepted` and that parent's organization is active. The child inherits only
the exact `organization_group_id`; `route_id` and `work_id` remain `null`, the
kind is `task`, the relationship is `child`, and every raw-content flag is
`false`. Replays are idempotent. Existing, history, retired, malformed,
conflicting, terminal, stale, unlinked, or inactive-organization identities are
never revived or rewritten.

`TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED=1` stops app-server child enrollment.
`TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED=1` independently stops the
persisted receipt bridge. Missing or partial structural coverage stays visible
as `HOLD`; this is not a claim that Codex exposes every internal task-creation
event.

## Read-only pilot

`TEAM_OPS_BOARD_READ_ONLY_PILOT=1` is the single explicit fail-closed pilot
mode. Only the exact string `1` enables it. Within the Board process it composes
the existing auto-enrollment, subagent receipt, lifecycle reconciliation, and
result-gate disables. The result-gate atomic writer also rejects the pilot env,
including when invoked through its separate CLI.

The pilot keeps Claude official quota reading off unless the same process also
sets the exact opt-in `TEAM_OPS_BOARD_CLAUDE_QUOTA_READ=1`. That opt-in reuses
only an existing credential for `GET https://api.anthropic.com/api/oauth/usage`,
with a 6-second timeout, a minimum 120-second attempt cadence, and no login,
credential write, response persistence, or provider mutation. Schema v2 adds
only redacted `claude_status` metadata (`state`, safe `outcome`, attempt and
last-success times, and source-owned freshness). The normalized last successful
quota stays in process memory across a failed attempt and is visibly
`STALE`/error; a new process has no retained value. Missing v2 status, legacy v1,
and unavailable values remain `UNKNOWN`/disabled and are never fabricated as
zero or green. The common Meter ledger's Claude usage row remains an independent
read-only projection and never supplies or replaces official quota values.

The pilot does not probe Antigravity's local RPC or read/write its quota cache.
This mode does not start collectors, expose a public service, or prove provider
health, live execution, E2E behavior, or task completion. All other pilot write
and probe disables remain unchanged.

## Exact enrollment CLI

The CLI is deliberately limited to local registry metadata. It has no Codex
thread create/delete/archive/send operation.

Card identity comes only from the exact local enrollment registry. Current
runtime metadata comes from the official local `codex app-server`.
Metadata-only `Stop`/`SubagentStop` evidence may be retained as a safe stop
observation timestamp, but it is execution cessation only and does not create a
blue result node in the live organization map. A blue node requires an explicit
result-delivery gate for the exact upper thread; Stop alone never becomes
completion, parent acceptance, or Owner attention. The Board never
reads or projects prompt, reasoning, tool payload, runtime title, cwd, or
transcript content. Without an explicit result gate, idle and `notLoaded` stay
`상태 신호 없음`.

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
behavior, lifecycle source fail-closed behavior, and no prefix fallback.
Enrollment tests cover atomic writes,
idempotency, rollover/history, parent-lineage validation, disable gates, and
reconciliation. Result-gate tests cover the deterministic synthetic
parent/three-child/Owner canary, duplicate-event idempotency, no-start failure,
accepted/closed history, raw-field rejection, atomic CLI writes, and emergency
disable. Frontend tests cover normalization, double-buffered single-flight
polling, non-blocking refresh transitions, Owner-only
attention, acknowledgement hide/reappear/restore, exact organization-tree
controls, exact-ID usage-history controls, and narrow-safe layout boundaries.

## AI Usage Meter stays separate

The Board exposes a credential-free same-origin loopback endpoint at
`/ai-usage-meter.snapshot.json?read_only=1`. `read_only=1` is mandatory. A
diagnostics refresh may add `refresh=1`, which only re-reads the local meter
projection. The adapter resolves the current/accepted enrollment registry once,
caps the exact safe IDs at 100, and validates only the existing bounded ledger
projection. It does not spawn a CLI, invoke a collector, command, `--apply`,
lifecycle reconciliation, writer, provider login, or network operation. It
never scans a global Meter snapshot or derives an ID from a title, path, or
transcript.

The endpoint returns only a validated metadata-only aggregate envelope. A
failed, missing, invalid, or untrustworthy exact scope is `UNMEASURED / HOLD`,
never a zero-usage assertion. The selected-node diagnostics refresh uses only
this path plus the existing safe Watchtower read-only refresh.

The Work surface alone shows the resulting KST day/week/month/all-time
controls plus project/work/task rankings. It also renders compact horizontal
comparisons for Meter `project_id` totals and exact-linked organization totals.
The organization comparison joins only top TASK rows whose exact `task_id`
matches a current/history Board enrollment; every unmatched row and bounded
long tail remains visible as `미연결·기타`. Ranking rows contain their
respective exact IDs and reconciled metrics. A task row may add the safe Board
display label only when its exact `task_id` matches a current/history enrolled
thread; unmatched rows remain their exact ID or `unassigned`. The Board does
not infer or display guessed attribution, raw session content, paths, titles,
prompts, or tool data.

This Board projection is validated-private local tooling. It is not a route
resolver, Codex runtime authority, task-status authority, deployment, or
production control surface.

### Claude ledger evidence and selected-node diagnostics

The Board accepts legacy history v2, but renders its Claude provider evidence
as `UNKNOWN`. A validated v3 Claude `provider_rows` entry derived only from
ledger `source.kind` remains visible as last-known ledger evidence regardless
of the separate collection-attempt state. Its freshness is calculated from
`latest_usage_at` against `reference_at` and the explicit adapter threshold:
fresh values say `원장 근거`; stale values retain the last-known value/time but
show prominent `STALE` and are never green/current. The collection attempt has
its own state, reason, time, and freshness line and cannot upgrade or erase a
valid ledger fact. v2 or no valid row stays `UNKNOWN`; zero appears only for a
fresh successful `available_empty` collection window with no provider row.
Aggregate generation time and official Claude quota never substitute for
ledger freshness, token evidence, health, live, or E2E state.

Selecting a topology node opens an inspector that preserves the selected node
across a safe refresh when it still exists, switches on another node, and closes
through explicit unselect, pane click, or Escape. It supplies state/reason,
evidence scope/time, what the evidence proves and does not prove, and direct or
all structural paths. Structural edges and paths are catalog relationships only:
they never prove a live service, E2E path, receipt, provider health, or result.
The only actions are read-only refresh, evidence view, and direct/all path
views. Mutation guidance is exactly `Owner 승인 필요`; there is no execution
action. The inspector supports keyboard focus and the mobile layout.

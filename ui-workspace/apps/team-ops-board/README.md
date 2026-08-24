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
  정상 이외의 모든 노드는 `추적 필요` 큐에서 고정 사유, 근거 소유자,
  마지막 점검/다음 Watchtower 점검/다음 근거 기한 및 복구 가능 범위를 함께 보여준다.
  W1 추적 계약은 `topology_health.v2`이며 producer와 Board를 함께 배포해야 한다. `다음
  점검`은 Watchtower의 5분 재검사, `근거 기한`은 원천 증거 시각과 probe period로 계산한
  별도 마감이다. 이 큐는 복구 버튼이나
  실행 권한을 제공하지 않는다.
  장치 종류는 입력·감독·연산·저장·판단·출력의 외곽 도형으로, 상태는
  정상(초록)·열화/신선도(주황)·미감시 구조(파랑)·정지(빨강)로 분리한다.
  각 간선은 source의 오른쪽 OUT에서 target의 왼쪽 IN으로만 연결되며,
  노드 선택은 직접 연결된 1-hop 경로만 강조한다. 간선은 구조 방향이며
  per-edge receipt가 없는 현재 전송 중 상태를 추정하지 않는다.
  The scheduled Board worker also hosts a separate five-minute evidence and
  bounded-recovery companion. It validates Watchtower execution, five-field
  metadata ledgers, and `_workmeta` payload policy into independent sanitized
  receipts. Safe task restart is possible only for ignored-local exact task
  bindings with matching action digests and successful pre/post verification;
  provider login, deletion, acknowledgement, upload, routing, external send,
  and partial mail backlogs remain manual/HOLD.
  Every non-green tracking row includes an immediate read-only diagnosis refresh
  and a sanitized recovery-history view. The latter reports whether the existing
  five-minute recovery companion succeeded, denied, or failed an allowlisted
  action; it never grants a new browser-side repair authority.
  A healthy Hiworks collector may also carry a separate `retrying` or `held`
  advisory with a sanitized item count and next attempt time. This keeps
  collector liveness green without hiding unresolved delivery work. Gray nodes
  are summarized as evidence-unconnected structural, provider-evidence, or
  on-demand entries; they are not treated as failed programs.
  Edge evidence is also split into observed receipts, absent receipt channels,
  state-observation-only controls, and structural-only relations. A declared
  line is never presented as live delivery.
  `unmonitored` 공급자 관계는 관측된 공급자 health가 아니라 구조/카탈로그
  관계다. 노드는 색만으로 표시하지 않고 `관측 미구성`과 safe reason을
  함께 보이며, 이는 Claude·Antigravity의 현재 성공·정상이나 독립적 공급자
  증거를 뜻하지 않는다. `REFRESHING`, `HOLD`, 또는 `STALE`은 보존된 토폴로지
  snapshot을 표시할 수 있으나, 그 snapshot도 공급자 성공이나 per-edge receipt를
  주장하지 않는다. projection은 마지막 성공/실패의 age를 텍스트로 표시하며,
  `null` age는 해당 기록이 없음을 뜻한다. 같은 화면 아래의 선언 구조 렌즈는
  별도 근거이며 W1 health와 합쳐지지 않는다(아래 `AX declared-structure
  federation lens` 참조).
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

Each major panel on the Fleet, organization, work/history, and system-topology
surfaces also has a presentation-only `접기` / `펼치기` control. The first visit
shows every panel. The browser stores only a versioned allowlist of collapsed
panel identifiers in `localStorage`, so manual refreshes and accepted live data
updates keep the Owner's layout preference. Invalid, unknown, or inaccessible
storage fails open to the fully expanded layout. This preference does not stop
polling, change any snapshot, or grant runtime/repair authority.

## Local endpoint and privacy boundary

### Agent Runtime read projection

The Board registers `GET /agent-runtime.snapshot.json?read_only=1` for loopback
clients only. The exact query is required, non-GET methods return `405`, and
non-loopback callers return `403`. Responses are JSON with `Cache-Control:
no-store` and `X-Content-Type-Options: nosniff`.

The endpoint consumes the provider-neutral Agent Runtime read Module. Its Hermes
Adapter requests only `session.active_list` with `metadata_only: true`; it never
calls session history, free-form status, usage, activation, or the Hermes state
database. Unknown fields and raw-bearing keys such as title, preview, messages,
prompt, reasoning, tool bodies, cwd, paths, or credentials fail closed before a
projection reaches the browser.

The default 4192 runtime deliberately supplies neither an authorized Hermes
transport nor exact Bot-to-session bindings. The three Owner cards also have no
canonical `bot_id` yet. Therefore the current endpoint and UI return a fixed
`HOLD`/`UNKNOWN` projection; display labels are never used to infer identity.
Transport failure or a later refresh failure discards any prior positive state,
so a stale `working` value is never retained. This wiring is a read-only,
fail-closed integration surface, not a claim that live Hermes Bot status is
currently connected.

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
sets the exact opt-in `TEAM_OPS_BOARD_CLAUDE_QUOTA_READ=1`. The scheduled
companion additionally requires its ignored local gate before it reuses only an
existing credential for `GET https://api.anthropic.com/api/oauth/usage`. It
never initiates login, writes credentials, persists a provider response, or
mutates the provider. The last accepted sanitized receipt stays separate from
attempt evidence and becomes visibly `STALE` after its freshness window.
HTTP 429 is recorded as the fixed safe class `rate_limited`, not as malformed
content. A rate-limited attempt starts a 30-minute local backoff; invocations
during that window return `backoff_active` without another provider GET or a
fabricated attempt row. The scheduled companion and read-only Board adapter
resolve the ignored local quota gate and sanitized receipt from the stable
`SOULFORGE_AI_USAGE_PROJECT_ROOT`, not from the active code worktree. A Board
worktree switch therefore cannot silently orphan Claude quota state. This does
not enable quota access by itself, store credentials, or persist provider
responses. When the sanitized OAuth source reports a percentage but explicitly
omits its reset timestamp, the Board retains that percentage and displays only
the reset as unknown; it never invents a reset time.
The gated quota collector runs from the five-minute companion cycle and its
backoff check happens before credential access or provider I/O. Missing legacy
status and unavailable values remain `UNKNOWN`/disabled and are never
fabricated as zero or green. The common Meter ledger's Claude usage row remains
an independent read-only projection and never supplies or replaces official
quota values.

Codex quota rendering reconciles the latest event-carried sample with bounded
recent local session samples (up to 12 files within 4 days). The reader inspects
bounded tails, selects the freshest valid rate-limit observation timestamp via
`selectCodexRateLimitObservation`, and falls back closed to null when no valid
observation exists. While the currently observed reset is still in the future, a
premature next-window sample with a later reset and lower utilization cannot
replace the current window. Once the current reset has actually passed, the newer
window is eligible normally. This prevents a transient `100% 남음` display
without delaying a real reset or stalling behind an active session that has not
yet emitted a quota row.

The scheduled read-only Board enables one exact Antigravity quota gate. That
gate sends only an empty JSON object to the running Antigravity language
server's loopback-only quota-summary method and retains only sanitized group
labels, weekly/five-hour remaining percentages, and reset times. It does not
read the screen, UI Automation tree, OCR, session or credential material,
project payloads, or account details. The cache is resolved from the stable
`SOULFORGE_AI_USAGE_PROJECT_ROOT`, never from the active code worktree, so a
Board deployment cannot orphan the last-good observation. A failed local read
retains that last good value as `STALE`, or reports an explicit
`app_running_source_unavailable`/`app_absent` status when no last good exists.
If the current Antigravity version rejects that loopback method, the same exact
gate may invoke the installed Antigravity CLI only after the desktop app is
independently observed running, as
`agy.exe --print /usage --output-format text --print-timeout 30s`. The child
is resolved only from the regular, non-symlink
`<LOCALAPPDATA>/agy/bin/agy.exe` installation and inherits only the bounded OS
environment needed by that CLI. Its output must be exactly four tab-separated
Gemini and Claude/GPT weekly/five-hour rows. Reset times must remain inside the
source-owned window; anything extra, reordered, malformed, implausibly dated,
or bearing another label fails closed. Raw CLI output is neither returned nor
persisted. The interactive `/usage` (alias `/quota`) surface remains the manual
operator cross-check.

This mode does not start Antigravity, expose a public service, or prove provider
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
metadata-only history. A stable-role rollover also keeps the replacement in the
prior role's hierarchy position and reparents direct pending/accepted/current
children to the new exact ID; history and retired children remain attached to
their historical parent. All writer operations use temporary-file plus rename
atomic replacement.

The scheduled usage companion keeps the global completed-session collection
independent from Board enrollment. Its active-session supplement unions the
validated lifecycle identities with session files whose write metadata is fresh
inside the bounded active window. This closes the short interval before a new
exact TASK reaches the Board registry without changing Board visibility or
organization attribution; no title, prompt, transcript content, or route is
used to enroll the TASK.

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

### Windows read-only runtime wrapper

The Board owns one Windows-only Scheduled Task for its approved read-only
runtime. Registration stores only the Node executable, this integrated runtime
module, and the internal scheduled-worker action. The task carries exactly one
trigger: a single time trigger repeating every `PT5M`, registered with the
repetition duration omitted, which is how Task Scheduler stores unbounded
repetition. Inspection reads that stored duration back as blank or `PT0S` and
normalizes it to the documented `indefinite` value before comparing. The
trigger's only effect is to re-enter the same desired-state gate. The task
runs only for the current interactive user without a stored password, uses
limited privilege, and ignores a second concurrent start. It is not a service
and carries no boot or logon trigger; there is no second task, watchdog, or
repair process. Whether a trigger opportunity actually starts the Board is
decided entirely by the recorded desired state, described below.

```powershell
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-register
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-status
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-run
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-stop
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-fault
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs recover
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-unregister
```

At execution time the scheduled controller derives the canonical owner checkout
from Git's common directory, derives the existing loopback Serve Host from the
local read-only Serve status JSON, and assembles the Board's existing private
default bindings in process memory before it owns one Board child. None of
those values enter the task action,
task metadata, repository, or logs. Scheduled mode starts from required OS
variables only and replaces, rather than inherits, every Board binding. The
Git and Tailscale preflight helpers each have a dedicated 15-second timeout;
the local runtime control request timeout remains 3 seconds. A preflight failure
before the Board child starts exits fail-closed and writes only a sanitized
`controller_preflight` termination receipt, without a path, command output,
stack, or raw error message.

The scheduled environment enables only the local read-only Antigravity quota gate;
it carries no screen-reading flag and no protected value or CLI command in task
arguments or XML. Claude quota access is OFF by default. An exact
`TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ=1` on `task-run` is transferred to the
attested scheduled worker over a local run-ID handshake and exists only in
process memory; unset, blank, and malformed values remain OFF. The intent and
resulting child flag never enter task arguments, XML, state records, or logs.

The runtime remains fixed to strict loopback `127.0.0.1:4192`. Registration
leaves it stopped. Only `task-run` atomically records manual Owner intent and a
monotonic epoch before requesting execution. Duplicate start and stop are
idempotent. An explicit stop records `stop_requested` before graceful shutdown,
then records `stopped`, so the controller cannot restart it. While intent
remains `running`, the controller records a metadata-only receipt and restarts
only its Board child after an unexpected exit or non-ready observation, with at
most three retries and a one-second backoff. Each child owns a new runtime
generation and heartbeat.

### Collection liveness evidence

Three collection surfaces were latest-only, so a stopped, wedged, or rejected
collector left no trace an Owner could read after the fact. Each now keeps its
existing latest file plus one bounded append-only history file. Retention is
deterministic newest-N with the oldest row evicted, the file count per surface
is fixed at two, and every write is atomic.

Reads are bounded as well as writes. Every history reader inspects the directory
entry first and refuses anything that is not a regular, non-symlink file inside a
fixed byte budget, before a single byte is parsed.

A history is an audit record, not a cache, so the reader distinguishes a
genuinely missing history from a present but untrustworthy one. Missing is a
safe first write. Present-but-invalid — unreadable, oversized, symlinked,
non-regular, malformed JSON, wrong schema, wrong keys, or holding even one
invalid row — is preserved byte-for-byte at its existing path. The append is not
attempted, no partial filtering happens, and no replacement record is produced,
because salvaging the good rows or restarting from empty would destroy exactly
the trace an Owner needs to reconstruct what went wrong. One invalid row
invalidates the whole stored history, since a partially valid audit log cannot
be told apart from a truncated or tampered one.

The core operation is never blocked by this. Latest and history are written
independently: the quota attempt receipt and the producer cycle receipt still
update atomically so current liveness stays visible, while the history append
returns a bounded `preserved` outcome with a fixed reason to its caller. The
runtime lifecycle append is best effort in the same way — a preserved history
leaves start, ready, stop, fatal, and restart behaviour completely unchanged.

The Claude quota collector distinguishes a rejected credential from a malformed
response. HTTP 401/403 is the fixed result `auth_rejected`; the Board reports
that re-login is required and never initiates a login. Every gate-passing
attempt, success or failure, writes `provider_quota.attempt.v1.json` and appends
to `provider_quota.attempt-history.v1.json` (50 rows) with exactly
`{provider, attempted_at, result, result_class}`. A disabled gate made no
attempt and is deliberately not recorded. The accepted quota snapshot keeps its
own separate file and meaning: attempt evidence answers whether collection ran,
never what the value is, and can never promote a value to current.
HTTP 429 is the separate fixed result/class `rate_limited`; the Board explains
`조회 제한 · 자동 재시도`, keeps the last good value stale, and suppresses
further provider requests for the bounded backoff window.

The Board therefore separates the last attempt from the last good value. The
provider-limits root gained the `claude_quota_attempt` field, so its contract is
now v4 rather than a widened v3: a strict v3 consumer is not handed a shape its
contract never described. Reading stays compatible in the direction that matters,
because the reader never branches on the root version - it revalidates the inner
`claude_official` contract. A retained v2 or v3 payload therefore normalizes
exactly as before, and its absent attempt field reads as `null`/UNKNOWN rather
than as a pass. When the quota is stale or unknown the numeric
gauge and the remaining-percentage reading are suppressed; the last-good
percentage remains visible in the row note, explicitly marked as not a current
value.

The usage producer companion writes a sanitized cycle receipt before any child
starts, and again on completion with a duration and one status per lane over a
fixed lane vocabulary, to `producer_health/cycle.json` and a 50-row
`cycle-history.json`. Idle stays healthy: no new usage remains a successful
attempt, not a failure.

Every collector child now carries a bounded 180-second timeout. The bound is
deliberately loose rather than tight: the Codex lane has been observed taking
about 78 seconds live, so a tighter bound would kill healthy work. A slow sweep
may therefore outrun the five-minute interval and skip one overlapping tick,
which is correct and self-correcting - the trigger simply returns the in-flight
sweep. What cannot happen is a permanent wedge, because every child is bounded,
so the sweep always terminates and always releases single-flight for the next
interval. A timed-out lane fails closed as `collector_timeout`, does not falsify
a sibling lane, and does not hold the next cycle. The per-lane heartbeats remain
the authority for lane freshness, and Meter hook health remains authoritative
for hook health.

The runtime keeps its 10-second latest heartbeat for liveness and its separate
termination receipt for last-good exit evidence. `lifecycle-history.v1.json`
adds up to 100 rows of material transitions only — start, ready, requested stop,
handled fatal, restart recovery, child restart, child exhaustion. The heartbeat
is deliberately never appended to it. A row carries an exact
`{observed_at, event, failure_class}` and no identity of any kind: no run id, pid,
or hash. An ordered sequence of material events already answers whether the
runtime restarted, crashed, or was told to stop, so a correlatable identifier
would add a receipt field without adding an answer. Desired-state and task
authority are unchanged.

No receipt in any of these surfaces carries a path, command line, run, session or
thread ID, pid, stdout/stderr, stack, raw session content, provider payload, or
credential. Result and lane tokens come from closed sets, and history rows are
validated against exact-key schemas on both write and read.

The recorded desired state, not the Scheduler, remains the single authority.
Every scheduled invocation — manual `task-run` or the repeating trigger — first
reads the desired record and, for anything other than `running`, returns
immediately without deriving bindings, opening a port, or owning a Board child.
That gate is the whole of the guarantee, and it cuts exactly two ways:

- `stopped`, `stop_requested`, or `recovery_needed` desired intent: a
  five-minute tick is a no-op. The controller exits at the gate and the Board is
  not started.
- `running` desired intent: a five-minute tick permits a gated relaunch. This is
  deliberate and it is the point of the trigger. It applies after the controller
  process itself exits — including once its bounded child retries and the
  Scheduler's `RestartOnFailure` retries are exhausted — and it applies after a
  reboot, at the next trigger opportunity, because the desired record survives
  the reboot. So with `running` recorded, the Board can come back without a
  manual `task-run`. `IgnoreNew` discards a tick that arrives while the Board is
  already healthy. Windows records that exact overlap as `0x800710E0`; the
  public status normalizes it to the existing `running` class only when the
  inspected task is both `Running` and exact `IgnoreNew`. The same result in
  every other context remains a failure.

The desired record is intent and the only thing the gate reads; `runtime_health`
is a separate computed observation of what is actually there. `task-status`
reports `runtime_health: recovery_needed` when the recorded intent is `running`,
the task is `Ready`, and no live runtime is observed. That is an observation
label, not a stored intent and not a block: `desired_state` still reads
`running`, so the next trigger opportunity may relaunch the Board. Only an
explicit `task-stop` — which records `stop_requested` and then `stopped` — turns
the relaunch opportunity back into a no-op.

Registration itself never starts the Board: `task-register` records the
`stopped` intent before the task can exist, and the trigger's start boundary is
set in the future, so no start opportunity exists at registration time.

A task registered before this trigger existed is reported as `definition_hold`
and refuses `task-run`. Removal is deliberately one step wider than execution:
`task-unregister` accepts this exact action, owner, and settings with either
the exact relaunch trigger or exactly zero triggers — the earlier triggerless
registration — so that legacy shape can still be removed and re-registered
instead of becoming permanently stuck. A single trigger that does not match
the exact relaunch definition is neither shape and is refused by every
operation, the same as more than one trigger.

Before stop, stale-record recovery, or task removal can delete runtime
evidence, the wrapper atomically writes one metadata-only termination receipt
in its existing OS-local runtime root. The receipt contains only desired/task
state, monotonic epoch, heartbeat freshness, redacted last-result class,
dependency availability, and one of `normal_stop`, `handled_error`,
`native_crash`, `external_termination`, `dependency_loss`, or `unknown`.
Capture failure is HOLD and blocks removal. It contains no task name, process
identifier, host, path, credential, account, or raw result/error.

When the controller replaces an exited Board child it also retains bounded
child exit evidence in that same receipt: `child_exit_code` (a numeric exit
code, otherwise null), `child_signal_class` (one of `sigint`, `sigterm`,
`sigkill`, `spawn_error`, `other`), and `child_failure_class` (only an existing
safe failure class, otherwise null). This keeps the schema version unchanged;
receipts written before these fields existed stay valid, and a present field
must match the bounded shape exactly or the record fails closed. Raw exit text,
signal strings, identifiers, paths, and stacks are never persisted, and the
child's standard output and error streams remain ignored.

The Board runtime deliberately exits on an unhandled rejection, so its
five-minute usage and Claude-quota companions contain every collector failure
at their own boundary. A rejected sweep becomes a fail-closed hold carrying only
an existing or minimal sanitized code, both interval timers keep their
independent cadence, and a failed lane receipt write no longer aborts the sweep
or falsifies a sibling lane — that lane simply keeps its prior value and ages
out fail-closed. A collector failure can therefore no longer terminate the
runtime process.

The earlier `runtime_worker_absent` evidence established an architecture gap:
the task had zero restart policy and no desired-state, LastTaskResult, or
termination-receipt evidence. Its ready marker and last heartbeat excluded a
normal stop and a handled JavaScript error, but the exact terminating event was
not captured. That prior root cause remains `UNKNOWN / non-reproduced`; native
crash, external termination, and dependency loss must not be claimed without
the new receipt and ordering evidence. `task-fault` is a bounded local
acceptance-only worker fault used after a natural-survival interval to prove the
same intent epoch recovers through the approved Scheduler policy. There is no
force kill, service, boot/logon trigger, elevation, firewall, LAN/public bind,
provider call, or Tailscale configuration mutation.

This controller closes the missing child-lifetime-owner gap without adding a
service or second watchdog. A controller-process exit after its bounded retries
are exhausted is now met by the repeating trigger's next gated relaunch
opportunity rather than by an indefinite `Ready` task; the Board still does not
claim that Task Scheduler's `RestartOnFailure` setting alone proves recovery,
and recovery is only claimed from an observed ready runtime. The Board UI owns
no repair button for this surface: when the Board itself is down it cannot be
its own recovery owner.

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

## Classic Watchtower and Engineering Engine topology surfaces

The System page keeps the original five-lane Watchtower W1 ReactFlow surface and
adds a second, fully expanded Engineering Engine surface using the same node
shapes, icon placement, text hierarchy, directed curves, minimap, controls, and
read-only inspector. There is no provider-sector folding or semantic drill-down.
The page intentionally shows only Watchtower and Engineering Engine; Knowledge
and Notebook remain available through the federation endpoint but are not rendered
in this operational view.

Vite exposes `GET /topology-federation.snapshot.json` to loopback clients only.
The adapter reads one fixed tracked repo path:

```text
guild_hall/watchtower/topology/federated_topology.v1.json
```

There is no glob, directory discovery, query parameter, or alternate source. The
adapter re-runs the pure Watchtower federation contract
(`guild_hall/watchtower/topology_federation.mjs`) on the artifact's own provider
fragments and then compares the recomposed result against the file: exact v1 root
keys, `soulforge.ax_topology.federation.v1`, `declared_structure` projection kind,
the source-set digest, the full topology digest, and the canonical bytes of the
flattened namespaced node/edge set. A tampered digest, an edited flattened node,
an invented edge, a fragment claiming `execute_repair` or runtime-mutation
authority, an unreadable file, and unparsable bytes all fail closed.

The envelope is `ready`, `stale`, or `unavailable` with a safe lowercase reason
code and no path, message, or stack leakage. A failed re-read retains the last
validated structure as explicit `stale`; it never presents a retained structure as
a current success. `/topology-health.snapshot.json` and W1 health behavior are
unchanged.

The federation remains the sole authority for Engineering Engine node and edge
identity. The classic Engine builder accepts exactly the tracked 33 module nodes
and 151 provider-local `imports` edges, lays all of them out in five semantic lanes,
and never assigns W1 health or delivery evidence to them. Engine runtime stays
`UNKNOWN`; runtime authority and repair execution authority stay `false`.

Cross-provider edges are not supported by the v1 contract and are never inferred.
The page states `Watchtower와 Engineering Engine 사이 연결 계약 미선언`
instead of drawing a false bridge. All Watchtower edges retain their independent W1
delivery verdicts, while all Engine edges remain declared-structure-only.

Tests are deterministic and synthetic and never need the running 4192 service:
`src/server/topology-federation-adapter.test.mjs` covers artifact validation,
digest and projection-mismatch rejection, forbidden authority claims, fail-closed
reads, stale retention, and the loopback/method/path guards;
`src/core/topology-federation-view.test.mjs` covers the source projection;
`src/core/topology-engine-classic-view.test.mjs` covers exact Engine totals,
deterministic collision-free full expansion, original shape vocabulary, provider
exclusion, and authority refusal; `src/core/topology-federation-ui-boundary.test.mjs`
and `src/core/topology-ui-boundary.test.mjs` cover the two classic read-only graph
surfaces, visible directed edges, controls, and accessibility boundaries.

## AI Usage Meter stays separate

The Board exposes a credential-free same-origin loopback endpoint at
`/ai-usage-meter.snapshot.json?read_only=1`. `read_only=1` is mandatory. A
diagnostics refresh may add `refresh=1`, which bypasses the validated in-memory
cache to re-read the local meter projection while joining any existing in-flight
computation without starting duplicates. Normal polling inside the 60-second TTL
returns the validated cache. Exact enrollment and emergency-disable prerequisites
are evaluated on every request before returning cache or joining in-flight work,
with in-flight scope mismatches failing closed to `HOLD`. The adapter resolves the
current/accepted enrollment registry once per request, caps the exact safe IDs at
100, and validates only the existing bounded ledger projection. It does not spawn
a CLI, invoke a collector, command, `--apply`, lifecycle reconciliation, writer,
provider login, or network operation. It never scans raw session trees or derives
an ID from a title, path, or transcript.

The endpoint returns only a validated metadata-only aggregate envelope. The
read-only usage projection aggregates all recorded local provider usage (Codex,
Claude, Antigravity) across total/model/provider/daily series so that local usage
is comprehensively represented without omitting unregistered sessions, while
enrollment registry availability remains mandatory to open the projection and
Board display labels/organization grouping join only on exact enrolled thread IDs.
A failed, missing, invalid, disabled, or empty enrollment registry remains
`UNMEASURED / HOLD`, never an exposed projection or zero-usage assertion. The
selected-node diagnostics refresh uses only this path plus the existing safe
Watchtower read-only refresh.

The Work surface shows the resulting KST day/week/month/all-time controls plus
project/work/task rankings. It also renders compact horizontal comparisons for
Meter `project_id` totals and exact-linked organization totals. The organization
comparison joins only top TASK rows whose exact `task_id` matches a
current/history Board enrollment; every unmatched row and bounded long tail
remains visible as `미연결·기타` / `미등록 TASK`. Ranking rows contain their
respective exact IDs and reconciled metrics. A task row adds the safe Board
display label only when its exact `task_id` matches an enrolled thread;
unmatched rows remain their exact ID or `unassigned`. The Board does not infer
or display guessed attribution, raw session content, paths, titles, prompts,
or tool data.

The `UsageTrendChart` renders a daily token trend with an accessible range toggle (`최근 7일` default, `최근 30일` history) across model and provider tabs alongside a truthful textual basis label (` · 토큰 관측일 기준` for complete coverage, ` · 토큰 관측일 우선 · 미근거 항목은 시작일 기준` for partial coverage, and omitted when fallback to v3 without matches). The 7-day default allows recent activity (such as ~1.3B daily volume) to remain visibly substantial without visual compression from older multi-billion-token peaks in the 30-day window, while preserving the full 30-day history on demand. Daily token series and Antigravity request overlays slice to the active range. Selecting a legend series dynamically rescales the chart's vertical axis to that series' peak within the active range rather than retaining the global stacked aggregate maximum, preserving stable series colors, dynamic tick stride (all 7 days for 7-day range, stride 5 + last for 30-day range), tooltip hit-grid navigation, keyboard focus, and the secondary AG request overlay. The tooltip is clamped to the plot edge opposite the active date (including the midpoint), keeps the active guide clear, and never intercepts the chart controls.

This Board projection is validated-private local tooling. It is not an official
provider billing/quota authority, route resolver, Codex runtime authority,
task-status authority, deployment, or production control surface.

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
The only actions are read-only refresh, evidence view, direct/all path views,
and — for the exact allowlisted non-green source/consumer nodes — a `진단`
connection check. Mutation guidance is exactly `Owner 승인 필요`; there is no
execution action. The inspector supports keyboard focus and the mobile layout.

`진단` is a separate read-only evidence lens over snapshots the Board already
holds: the local read-only W1 topology-health projection it refreshes through
the existing loopback path, plus the existing sanitized provider-limit and
Antigravity quota projections. It adds no server route, provider RPC, external
account call, credential read, browser or desktop automation, and it never
promotes a node's health, color, shape, layout, or edge meaning.

The result separates 계정 연결 (`확인됨` / `실패 신호` / `확인 불가` /
`해당 없음`), 로컬 수집·소스 (`정상` / `주의` / `확인 불가`), the last safe
observation time with `안전 관측` / `보존 관측` / `관측 없음`, and the evidence
owners plus explicit limits. Only a provider-issued, currently fresh quota
receipt can reach 계정 연결 `확인됨`, and only a provider-scope health failure
can reach `실패 신호`. A live local collector, a readable OneDrive/PLAUD/Codex
session source, or sanitized Hiworks/Slack/Gmail producer evidence proves local
availability only and stays 계정 연결 `확인 불가`. `consumer_timeline` has no
account surface and no deployed consumer receipt, so it stays `해당 없음` with
`runtime_not_deployed`. Unknown or malformed node IDs fail closed, and missing
evidence stays `확인 불가` instead of becoming a pass or a fault.

## Codex Lifecycle Retention Phase 3 Read-only Projection

The Board exposes `GET /codex-retention.snapshot.json` exclusively to loopback clients (`127.0.0.1`, `::1`).
- **Endpoint**: `/codex-retention.snapshot.json` (GET-only, non-GET returns 405 Method Not Allowed).
- **Core Module**: `src/core/codex-retention-projection.mjs` stable-reads `<ownerRoot>/guild_hall/state/operations/soulforge_activity/reports/codex_retention/current.json`.
- **Sanitization & Safety**: Strictly validates `soulforge.codex_thread_manager.codex_retention_automation_report.v1`, SHA-256 digest, generated_at ISO timestamp, and summary metrics. Zero raw path exposure, zero raw logs/prompts/reasoning exposure.
- **Bounded Age Windows**: `period_seconds: 86400` (24h), `grace_seconds: 3600` (1h). Computes status: `current`, `late`, `stale`, or `unavailable`.
- **Authority Boundary**: Enforces `{ read_only: true, runtime_authority: false, repair_authority: false, destructive_authority: false }`. Destructive action count and local automation install count are strictly 0.

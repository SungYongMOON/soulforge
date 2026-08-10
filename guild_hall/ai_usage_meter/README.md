# Soulforge AI 사용량 미터 v1

Soulforge 전체에서 Codex 작업의 토큰과 계산 크레딧을 `회사 → 팀 → 프로젝트 → 업무 → 에이전트 → turn`으로 추적하는 로컬 우선 미터기다. SE 전용 도구가 아니며, 개발1팀·AI 기반시스템 회사·별도 프로젝트가 같은 이벤트 규격을 사용한다.

## 무엇을 측정하는가

세 공급자가 같은 usage-event 원장에 기록된다. `source.kind`와
`measurement.token_confidence`는 1:1로 고정된다:
`codex_session_jsonl`→`exact_cumulative_delta`,
`claude_session_jsonl`→`exact_per_message`(같은 `message.id` 중복 관측을
제거한 메시지 단위 정확 계측, `collect-claude`),
`antigravity_conversation_db`→`request_count_only`(토큰 없음, 요청 수만,
`collect-antigravity`). 크레딧은 Codex rate card 단위로만 계산하며
비-Codex 이벤트는 통화 혼합을 막기 위해 항상 `rate_unknown`이다.
Claude 이벤트의 프로젝트 귀속은 세션 작업 폴더의 말단 슬러그에서
파생되고(`bindings/claude_project_binding.json`으로 재지정 가능), 경로
원문은 이벤트에 저장하지 않는다.

- Codex session JSONL의 누적 카운터를 turn별 증분으로 변환한다.
- 입력, 캐시 입력, cache-write 입력, 출력, reasoning 출력과 관찰된 usage 증가 구간 수를 기록한다. 이 구간 수는 실제 API 요청 수가 아니라 모델 순환의 하한 proxy다.
- 부모와 서브에이전트 session을 연결해 같은 root turn과 `work_id`로 묶는다.
- 버전이 고정된 rate card로 모델·service tier별 크레딧을 계산한다.
- cache-write token은 관찰하되 Codex 공식 규칙에 따라 크레딧을 부과하지 않는다.
- 프로젝트, 업무, 모델, reasoning effort, node, 역할, 에이전트별로 집계한다.
- exact Codex lifecycle 훅, Stop/SubagentStop usage 관찰, 과거 로그 백필, JSON, CSV, 로컬 HTML, MCP 조회를 같은 원장 위에서 제공한다.

원문 prompt, reasoning 내용, 도구 인자·결과, 메일·파일 본문은 저장하지 않는다. 저장 이벤트에는 `privacy` 경계가 명시된다.

## 정확도와 한계

| 값 | 의미 |
| --- | --- |
| 토큰 | Codex가 기록한 누적 토큰 카운터의 turn 간 정확한 차이 |
| 크레딧 | `rate_card.v1.json`의 요금제·날짜 경계와 공개 요율을 적용한 계산값 |
| 명시 귀속 | 로컬 binding으로 지정한 `work_id/project/team/role` |
| 파생 귀속 | 부모–자식 lineage 또는 기본 project binding에서 계산한 값 |
| 주간 한도 % | 로그에 관찰된 안전한 snapshot일 뿐, OpenAI의 공식 사용량 원장을 대체하지 않음 |

이 미터기는 OpenAI 결제·주간 한도 원장 자체가 아니다. 동봉 rate card는 현재 Owner의 Plus/Pro/Business token-pricing 경계인 2026-04-02 이후에 적용하며, GPT-5.6 계열·GPT-5.5·GPT-5.4를 계산한다. 경계 이전 기록, 알려지지 않은 모델, 다른 요금제의 미확정 경계는 토큰은 보존하되 크레딧을 `rate_unknown`으로 둔다. Enterprise 등 다른 요금제에 배포할 때는 해당 요금제의 공식 전환일을 가진 별도 versioned rate card를 사용한다. 한 turn 안의 개별 MCP 호출에 토큰을 임의 배분하지 않는다. MCP가 자체 provider usage를 제공한다면 별도 adapter가 같은 usage-event 규격을 생산해야 한다.

일반 ChatGPT 사용량은 계측 대상이 아니다. 일반 ChatGPT는 저장소 접근이 필요 없는 조사·요구사항 정리·대안 비교를 Codex 밖으로 라우팅해 Codex 크레딧을 줄이는 보조 선택지다.

## 빠른 사용

준비 상태 확인:

```powershell
npm run guild-hall:ai-usage-meter -- doctor
```

전체 과거 로그 읽기 전용 집계:

```powershell
npm run guild-hall:ai-usage-meter -- collect
```

특정 Codex thread를 실제 업무에 연결:

```powershell
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
npm run guild-hall:ai-usage-meter -- bind `
  --state-root $meterState `
  --thread-id <thread-id> `
  --work-id <work-id> `
  --project-id <project-id> `
  --team-id <team-id> `
  --role executor
```

실제 로드된 instruction chain을 원문 없이 digest·bytes로 확인:

```powershell
$repoRoot = (Resolve-Path .).Path
npm run guild-hall:ai-usage-meter -- instruction-manifest `
  --cwd $repoRoot `
  --approved-root $repoRoot `
  --model-id gpt-5.6-sol `
  --reasoning-effort xhigh `
  --disable-feature hooks `
  --disable-feature multi_agent
```

`--apply --state-root <local path>`를 추가하면 manifest를 `instruction_manifests/<YYYY-MM>/`에 저장한다. allowlist 밖 source는 읽거나 digest를 추정하지 않고 `prohibited/unknown`으로 남긴다.

실행·품질·tool·actual replay 증거 JSON을 검증한 뒤 저장:

```powershell
npm run guild-hall:ai-usage-meter -- evidence-record `
  --kind work_run `
  --input <metadata-only-json-path>

$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
npm run guild-hall:ai-usage-meter -- evidence-record `
  --kind work_run `
  --input <metadata-only-json-path> `
  --state-root $meterState `
  --apply
```

`kind`는 `work_run`, `quality_result`, `tool_event`, `replay_receipt`를 지원한다. 각 증거는 lifecycle authority가 아닌 계측 projection이며 prompt·reasoning·tool argument/output 원문을 저장하지 않는다.

주간 요약:

```powershell
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
npm run guild-hall:ai-usage-meter -- report `
  --state-root $meterState `
  --from 2026-08-03T00:00:00+09:00 `
  --to 2026-08-10T00:00:00+09:00
```

사람이 보는 로컬 화면과 CSV:

```powershell
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
npm run guild-hall:ai-usage-meter -- dashboard `
  --state-root $meterState

npm run guild-hall:ai-usage-meter -- csv `
  --state-root $meterState `
  --output (Join-Path $meterState 'usage-by-work.csv') `
  --group-by work
```

HTML 기본 경로는 `guild_hall/state/operations/ai_usage_meter/dashboard.html`이다. `guild_hall/state/**`는 Git 제외 로컬 상태다.

## 자동 계측

### Phase B feature-OFF observation contract

Phase B keeps hook delivery and token projection as independent metadata-only
health lanes. Each lane has its own state, reason, and `source_observed_at`;
report `generated_at` is aggregation time and never refreshes source freshness.
Every Stop observation can be classified in memory as exactly `observed`,
`pending_jsonl`, `unsupported`, or `failed`. These dry-run results are not a
canonical ledger, completion authority, backfill, provider probe, or runtime
activation.

Pending JSONL reconciliation is a pure plan: the same stable identity and
payload digest is a no-op, while a different payload for that identity places
the entire plan on `HOLD` before any canonical write. An active turn without a
Stop remains `UNKNOWN`; subagent evidence remains `coverage_partial`. Hook
manifest drift inspection reports only expected/observed digests and counts and
does not edit `.codex/hooks.json`.

`backfill-plan` is the feature-OFF, read-only token-recovery planner. It emits
only stable identity/event digests, candidate/replay/active/conflict/malformed
counts, token totals and time bounds, plus source, canonical, and plan digests.
Input order does not change the plan. Divergent source or canonical observations
are quarantined without selecting a winner; malformed inputs are excluded, and
active turns keep completeness `UNKNOWN`. The command rejects `--apply`, never
writes a ledger, and always returns `apply_allowed=false`; a future partial apply
requires a separate Owner gate bound to the exact quarantine, source, canonical,
and plan digests.

저장소의 [`.codex/hooks.json`](../../.codex/hooks.json)은 정확히 `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `PermissionRequest`, `Stop`에서 비차단 metadata-only 훅을 실행한다. `TurnStart`, `TurnEnd`, `Waiting`은 설치하지 않는다. 훅 실패는 Codex 답변을 막지 않고 `health/latest.json`에 안전한 reason code만 남긴다. 동시 hook 결과의 감사 이력은 `health/history/<YYYY-MM>/`에 별도 보존된다. usage 원장 잠금이 바쁘면 `deferred`와 `pending/`으로 남고 다음 성공 실행에서 자동 병합된다.

- `SessionStart`/`SubagentStart`는 `started` receipt다.
- `UserPromptSubmit`은 `input_received` receipt일 뿐 running 전환이 아니다.
- `PermissionRequest`는 `waiting_on_approval` receipt다.
- `Stop`/`SubagentStop`은 `observed_at_stop`과 `result_pending`이며 PASS·complete가 아니다. 이후 JSONL `task_complete`가 관찰될 때만 usage event가 complete로 승격될 수 있다.
- `SessionEnd`는 `ended` + `result_pending` receipt일 뿐 업무 성공·완료 판단이 아니다.

Hook input에서는 `hook_event_name`, session/turn/agent ID, agent type, reason, permission mode, `stop_hook_active`만 받는다. prompt, 마지막 assistant message, tool input/output, transcript path, agent transcript path, cwd 및 기타 원문/secret은 즉시 버리고 receipt·health·snapshot에 저장하지 않는다. parent lineage와 timestamp는 hook input에서 만들지 않고 JSONL `session_meta`/task lifecycle만 authority로 읽는다. malformed input은 `hold` reason code로 닫고 hook stdout은 항상 `{}`다.

프로젝트 hook의 state root는 입력 `cwd`나 linked worktree 경로로 결정하지 않는다. `--state-root`, `SOULFORGE_AI_USAGE_METER_STATE_ROOT`가 있으면 그 값을 우선하고, 없으면 runtime의 `git rev-parse --git-common-dir`에서 검증한 non-bare common checkout root를 사용한다. 그러므로 main checkout과 linked worktree는 같은 local meter state와 emergency disable marker를 공유한다. common root가 없거나 unsafe하면 임의 workspace state를 만들지 않고 `CODEX_HOME/usage-meter`로 fallback하며 health에 `hook_common_root_*` reason code를 남긴다. 이 경로 자체는 receipt나 snapshot에 저장하지 않는다.

프로젝트 hook은 빠른 관찰 경로일 뿐이며, Codex managed worktree에서 해당 프로젝트 hook이 실제로 실행된다는 coverage를 주장하지 않는다. hook receipt가 없거나 stale하면 `lifecycle-reconcile`이 정확한 `CODEX_HOME/sessions` JSONL의 `session_meta`, `task_started`, `task_complete`, `sub_agent_activity`만 다시 읽는 metadata-only fallback이다. 이 fallback은 prompt, assistant message, reasoning, tool I/O, `cwd`, transcript path, secret을 저장하거나 출력하지 않는다.

`lifecycle-reconcile`의 기본은 read-only이며, `--thread-id <exact ID>`는 해당 ID만, 무필터 호출은 기본 200개 UUID-native session group만 읽고 `coverage.next_after_thread_id` cursor를 돌려 bounded sweep을 이어 간다. `--apply`만 Git-ignored `lifecycle/jsonl/current.json`에 strict `source=jsonl_metadata` snapshot(coverage, health, staleness, exact parent link)을 저장하고, Board 호환 `lifecycle/current.json`에는 root의 active/stopped를 `SessionStart`/`Stop`, 확인된 child의 active/stopped를 `SubagentStart`/`SubagentStop`으로 mirror한다. 두 projection 모두 `result_pending`이며 PASS·업무 완료 권한이 아니다. emergency disable이 있으면 producer는 JSONL을 읽거나 state를 쓰지 않는다.

Exact `--thread-id` scope에서는 같은 accepted set에 명시된 child ID만 agent-link projection과 lineage conflict 검사의 대상이다. 상위 session에 관측됐지만 scope에 등록되지 않은 descendant는 저장·표시·health 판정에서 제외한다. 반대로 선택된 child ID의 parent가 둘 이상이면 기존처럼 `jsonl_parent_lineage_conflict`로 fail-closed 한다. 등록은 됐지만 로컬 session 파일이 없는 ID는 coverage의 `missing_exact_thread_count`와 `partial`로 남기되, 성공한 collector 자체의 hook health는 `ok`와 같은 reason code로 분리해 표시한다.

```powershell
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
npm.cmd run guild-hall:ai-usage-meter -- lifecycle-reconcile `
  --thread-id <exact-thread-id> `
  --state-root $meterState `
  --apply
```

Codex는 프로젝트 훅이 새로 생기거나 바뀌면 신뢰 검토를 요구할 수 있다. 새 작업에서 프로젝트 신뢰와 훅 목록을 확인한 뒤 실제 turn 하나를 종료하고, 다음 두 항목을 확인한다.

1. `health/latest.json`의 `status`가 `ok`인가. `deferred`이면 다음 hook 또는 backfill 뒤 `pending/`이 0인지 확인하고, `hold`이면 안전한 reason code를 확인한다.
2. `events/<YYYY-MM>/`에 해당 thread/turn 이벤트가 정확히 하나인가.

종료 직전 로그가 아직 완전하지 않으면 `observed_at_stop`으로 기록한다. 이후 완전한 로그를 백필하면 같은 event ID의 현재본을 승격하고 이전본은 `revisions/`에 보존하므로 중복 합산되지 않는다.

### Lifecycle local snapshot

모든 receipt는 Git-ignored local meter state의 `lifecycle/receipts/<YYYY-MM>/`에 stable receipt ID로 저장된다. 같은 allowlisted hook payload를 재전송하면 collector 시간만 달라도 최초 receipt를 replay하여 duplicate count를 0으로 유지한다. `lifecycle/current.json`은 local-only per-identity latest projection이며, exact identity는 session/turn/agent ID, agent type, lifecycle/result state, collector timestamp, source event만 포함한다.

JSONL fallback의 strict provenance snapshot은 별도로 `lifecycle/jsonl/current.json`에만 둔다. `source=jsonl_metadata`, task/agent-link identity, session-meta parent link, coverage/health/staleness와 raw field count `0`만 허용하며, Board는 JSONL이나 이 snapshot의 경로·원문을 직접 읽지 않는다.

기본 CLI 출력은 aggregate-only다. exact identity가 필요한 향후 local consumer만 명시적으로 opt-in하며, 이 출력은 현재 App Server `notLoaded` 상태에서 live authority, Task Engine writer, Board enrollment, 업무 완료 signal이 아니다.

```powershell
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
npm.cmd run guild-hall:ai-usage-meter -- lifecycle-snapshot --state-root $meterState

npm.cmd run guild-hall:ai-usage-meter -- lifecycle-snapshot `
  --state-root $meterState `
  --include-identities `
  --output (Join-Path $meterState 'lifecycle\board-followup.local.json')
```

## 팀원·다른 프로젝트 배포

핵심 수집기는 표준 Node.js ESM이며 특정 모델이나 MCP에 의존하지 않는다.

- Node 22 이상과 읽기 가능한 `CODEX_HOME/sessions`가 필요하다.
- `CODEX_HOME`을 지정하지 않으면 사용자 홈의 `.codex`를 사용한다.
- [config.example.json](./config.example.json)을 private 위치에 복사하고 조직·팀·프로젝트 path binding만 바꾼다.
- `SOULFORGE_AI_USAGE_METER_CONFIG`로 private config 경로를 전달할 수 있다.
- 기본 원장은 PC 로컬이며 중앙 전송은 없다.
- 다른 저장소에서는 이 모듈과 동일한 hook command를 배포하거나, 향후 npm/plugin packaging으로 감싸되 이벤트 규격은 유지한다.

경로를 코드에 하드코딩하지 않았으므로 Windows·macOS·Linux의 Node 환경에서 사용할 수 있다. 프로젝트별 `.codex/hooks.json`은 각 저장소에서 별도 신뢰가 필요하다.

## Workspace Board read-only projection

The existing `team-ops-board` remains a read-only client. Its diagnostics
request is only `/ai-usage-meter.snapshot.json?read_only=1`; an optional
`refresh=1` means re-read the existing local projection, not collect new data.
It falls back to `UNMEASURED / UNKNOWN` when the local projection is absent or
invalid. The projection is strict and allowlisted: no session IDs, session
paths, source references, prompt/reasoning content, tool arguments/output, or
raw evidence records are copied into it. A read-only load never invokes a
collector, command, `--apply`, lifecycle reconciliation, writer, provider
login, or network operation.

```powershell
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
$boardSnapshot = Join-Path (Resolve-Path .).Path 'ui-workspace\apps\team-ops-board\public\ai-usage-meter.snapshot.json'
npm.cmd run guild-hall:ai-usage-meter -- board-snapshot `
  --state-root $meterState `
  --output $boardSnapshot
```

The generated Board asset is local-only and Git-ignored. It exposes totals,
role and model/effort breakdowns, execution/coordination/review, fan-out,
retry/timeout, hook health, and coverage. It is not an ERP, Task Engine, or
usage writer.

The current Board asset remains aggregate-only. A later local consumer that
needs exact Codex correlation can explicitly read the lifecycle snapshot with
`--include-identities`; it must preserve the strict key allowlist above and may
not treat a receipt as a live task or result authority.

### Exact-thread usage history sidecar

`board-history-snapshot` is a separate local-only contract for a Board that
already has an accepted set of exact Codex thread IDs. It does not change the
current Board v1 default UI contract. The current additive schema is
`soulforge.ai_usage_board_history_snapshot.v3`; existing v2 input remains
accepted as legacy history, but supplies no provider or Claude evidence. v3
keeps the v2 root fields (`schema_version`, `generated_at`, `timezone`,
`reference_at`, `top_n`, `current`, `windows`, `activity`, and `rate_limit`)
and adds `provider_rows` plus `claude_collection`. `current` is the same scoped
Board v1 aggregate, preserving total, role, model/effort, fan-out,
retry/timeout, and coverage.

`windows` contains deterministic `Asia/Seoul` calendar day/week/month,
rolling 24-hour/7-day/30-day, and all-time windows. Each window has totals and
reconciled project/work/task/model breakdowns as bounded `top` plus `other`;
`task_id` is the exact Codex thread ID, `model_id` is the safe model ID from
the event model block, and unknown or unbound values become `unassigned`.
The strict runtime validator rejects different duplicate event IDs, non-exact
window boundaries, invalid ranking, and any top-plus-other sum mismatch. It
does not expose `thread_id`, title, session/source/path, prompt/message,
reasoning, or tool fields.

`activity` is a fixed 40-day KST daily series (zero-filled, ending at the
`reference_at` date; last row must equal `calendar_day` totals) plus a fixed
24-slot KST hourly histogram whose turn/token sums must equal all-time totals.
`rate_limit` is `null` or the latest event-carried provider rate-limit
observation (`limit_id`, nullable `plan_type`, `used_percent`, nullable
`window_minutes`/`resets_at_epoch_s`, `observed_at`) — observed values only,
never a locally computed estimate. The v2 static AJV mirror remains available;
the v3 mirror is `ai_usage_board_history_snapshot.v3.schema.json`.

`provider_rows` are compact `{provider, turns, total_tokens, latest_usage_at}`
rows. Provider attribution comes exclusively from the ledger event
`source.kind`; a `model_id` prefix, display name, path, or inferred provider is
not an attribution source. `claude_collection` is a strict redacted ephemeral
envelope with one of `observed`, `available_empty`, `missing`, `partial`,
`error`, or `unknown`, an attempt timestamp, an explicit
`freshness_threshold_seconds`, a freshness result, and safe counts only. It
proves only a Claude collector attempt/source observation. It never proves
provider availability, health, live or E2E status, aggregate health, or ledger
freshness. `provider_daily` is a fixed 30-day KST series. Each provider entry
carries nullable exact `total_tokens` separately from nullable Meter `credits`.
`token_unknown_turns` distinguishes request-count-only events from a date with
no provider event; neither state is projected as zero exact tokens.
Aggregate `generated_at` is not Claude collection/value freshness. A valid v3
Claude provider row remains last-known ledger evidence
even when the separate collection attempt is missing, partial, error, stale,
or unknown. Ledger-value freshness is calculated independently from the row's
`latest_usage_at` against `reference_at` and the explicit threshold: fresh rows
render as `원장 근거`, while stale rows retain their last-known value/time with
a prominent `STALE` label and never become current or green. A fresh collection
attempt cannot refresh an old ledger row. v2 or a missing/invalid provider row
remains `UNKNOWN`; only a fresh successful `available_empty` attempt with no
provider row may display zero for its proven collection window.

`collect-claude` treats collection state `error` as a command failure before
any apply/persistence step. Automation receives a nonzero exit and, at most,
the strict redacted collection envelope; raw issues, source references, and
paths are not returned in the error payload. `missing` and `partial` remain
distinct successful command results whose state still limits what they prove.

`--include-provider <source.kind>` (repeatable, on `board-snapshot` and
`board-history-snapshot`) unions ALL events of that non-Codex provider into
the scoped set: Codex events stay gated by exact thread IDs, while local-owned
Claude/Antigravity transcripts are included wholesale. Without the flag the
behavior is unchanged (Codex exact scope only).

For an exact-thread projection, global meter coverage and tool retry/timeout
observations are not borrowed into the scoped result because their records are
not exact-thread-bound. Coverage remains partial and retry/timeout fields stay
present but zero unless an exact-thread evidence source is added later; this is
intentional to avoid inferring or double-counting coordination activity.

```powershell
$acceptedThreadIds = @('<exact-thread-id-1>', '<exact-thread-id-2>')
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
$threadArgs = $acceptedThreadIds | ForEach-Object { @('--thread-id', $_) }

npm.cmd run guild-hall:ai-usage-meter -- usage-projection `
  --read-only=1 `
  --state-root $meterState `
  --include-provider claude_session_jsonl `
  @threadArgs
```

The Board diagnostics server directly performs the same bounded, exact-ID
read-only load. It requires `read_only=1`, validates the existing meter
ledger/history projection, and may re-read it for a refresh; it does not spawn
the CLI above. It must never collect, apply, reconcile, write, scan all
sessions, or infer an ID from a title, path, prompt, or message. A failed,
unavailable, or untrustworthy projection remains `HOLD`/unknown rather than a
zero-usage assertion. The separate safe Watchtower read-only refresh may run
alongside this diagnostics read only path, without strengthening its structural
topology evidence.

## Emergency local control

The repository-local lifecycle collector can be stopped without removing any
installed lifecycle hook. The marker is inside the Git-ignored meter state
root; repeated disable/enable calls are idempotent and the hook remains
non-blocking.

`disable`/`enable` is run without `--state-root` from any normal or linked
worktree resolves the same canonical common-checkout marker used by the hook.
Use an explicit state root only for an intentional local override or recovery
operation.

```powershell
$meterState = Join-Path (Resolve-Path .).Path 'guild_hall\state\operations\ai_usage_meter'
npm.cmd run guild-hall:ai-usage-meter -- disable --state-root $meterState
npm.cmd run guild-hall:ai-usage-meter -- enable --state-root $meterState
```

`disable` records health `disabled`. `enable` clears the marker and records
health `ok`; the next lifecycle hook resumes normal metadata-only collection.

## MCP 연결

[mcp_adapter.mjs](./mcp_adapter.mjs)는 기존 MCP SDK server와 `zod` 인스턴스를 주입받아 세 도구를 등록한다.

- `usage_meter_summary`: 기간·조직·팀·프로젝트·업무·모델·에이전트 필터 집계
- `usage_meter_work_detail`: 한 `work_id`의 안전한 turn metadata
- `usage_meter_bind_work`: thread/turn을 `work_id/project/team/role`에 연결

```js
import { registerUsageMeterMcpTools } from "./guild_hall/ai_usage_meter/mcp_adapter.mjs";

registerUsageMeterMcpTools(server, { stateRoot, z });
```

MCP 응답에서는 session source 경로와 원문 필드를 제외한다. 중앙 집계가 필요하면 각 PC에서 생성한 redacted usage event 또는 aggregate만 전송하고, 원본 Codex session 파일은 보내지 않는다.

## 실행·품질 증거

token 사용량과 원인을 분리하기 위해 `work_id`로 연결되는 additive event를 사용한다.

- `ai_work_run.v1`: task/risk, model/effort, topology, 지침 manifest, 비용 포함 범위
- `ai_quality_result.v1`: hard gate·oracle·PASS/FAIL/HOLD
- `ai_tool_event.v1`: tool 종류·소요 시간·timeout·retry·preflight receipt
- `instruction_manifest.v1`: loaded source digest·bytes·model-visible 포함 여부
- `ai_usage_replay_receipt.v1`: actual replay source/parsed/HOLD/binding/lineage/role count·계산 합계·ledger digest

동일 instruction chain/prompt manifest는 관찰 시각만 달라도 최초 레코드를 유지한 채 `replayed`가 된다. replay receipt는 source coverage, turn별 persistence 결과, binding 상한, ledger digest 변화를 서로 대조하며, evidence ledger의 기존 lock은 stale로 추정해 자동 탈취하지 않고 `evidence_ledger_busy`로 닫는다.

work-run의 model/effort는 launcher 요청값이다. provider-effective 관찰 근거가 없으면 실제 적용값으로 승격하지 않고 `requested_only_not_verified`로 해석한다.

instruction probe는 Codex의 model-visible prompt를 메모리에서 확인하지만 그 내용을 manifest에 복사하지 않는다. 비용 비교는 품질 hard gate PASS 후에만 하며, executor/reviewer operational credits와 controller·offline oracle·experiment evaluator 비용을 분리한다.

## 검증

```powershell
npm run validate:ai-usage-meter
```

현재 public 수락 fixture와 로컬 검증은 다음을 포함한다.

- 과거 Outlook 관찰 토큰 tuple로 구성한 합성 7-turn reference: 입력 `40,613,609`, 캐시 입력 `39,543,808`, 출력 `56,362`, 계산 크레딧 `670.294225`
- 부모 책임자 turn과 depth 2 이상 executor 서브에이전트 lineage 연결
- 진행 중 부모 누락 시 직전 turn 오귀속 방지와 self-root → ancestor-root 승격
- 누적 snapshot 중복 제거와 turn delta
- continuation model metadata + 최신 단조 token snapshot 병합
- continuation source rollover의 direct·pending 단조 승격과 revision 보존
- 부모 continuation 전체 관찰 합성 후 SubagentStop lineage 귀속
- stale self-root 백필은 ancestor 귀속을 보존한 채 약한 관찰은 replay하고 더 강한 전체 측정 snapshot은 단조 재기반하며, 일반 token/lineage 회귀는 conflict로 분리
- scoped collect의 authoritative full coverage snapshot 보존
- cache-write 무료 계산과 exact-turn binding 우선순위
- Stop 잠정치 → complete 승격, 현재 합계 중복 0
- exact seven-hook lifecycle receipt mapping, malformed input `hold`, deterministic duplicate receipt replay, raw content/flag stored count `0`
- aggregate default lifecycle snapshot과 explicit per-identity local projection의 strict allowlist/latest reducer
- normal/linked worktree common-root receipt convergence, shared emergency disable, override precedence, and unsafe common-root local fallback
- 월 경계 stable-event 중복 방지와 저장 진입점 schema/privacy 차단
- lock 경합 시 durable pending 기록과 다음 실행 자동 회수
- replay-safe local ledger와 revision 보존
- prompt/reasoning/tool payload 비수집
- 한 손상 session을 격리한 전수 백필 coverage 보고
- MCP safe-detail, HTML, formula-safe CSV 출력

위 Outlook public test는 계산식·7-turn 합산·명시 `work_id` grouping과 관찰값의 수치 재현을 검증한다. 실제 과거 session replay, 자동 lineage 복원, 역할별 귀속, 누락·중복 배제는 metadata-only private replay receipt가 있을 때만 별도 검증으로 보고한다. 원문 prompt·메일·reasoning·tool payload는 receipt에 복사하지 않는다.

## 운영 판단

미터기를 먼저 관찰하고 나서 지침·모델을 바꾼다. 높은 사용량이 보이면 다음 순서로 원인을 분리한다.

1. `by_work`에서 실제 작업과 조정·재시도 turn을 분리한다.
2. `by_agent`와 root/child lineage로 fan-out을 확인한다.
3. `by_model`·`by_reasoning_effort`로 모델 배치를 확인한다.
4. `unassigned_project_turns`, `credit_unknown_turns`, `incomplete_measurement_turns`가 0인지 확인한다.
5. 같은 품질 기준에서만 지침 축약, context 정리, 재시도 감소, 모델 하향을 비교한다.

루트 `AGENTS.md`에 계측 규칙을 더 복제하지 않는다. 자동 계측은 hook, 의미 귀속은 binding, 상세 계약은 이 문서와 architecture 문서가 소유한다.

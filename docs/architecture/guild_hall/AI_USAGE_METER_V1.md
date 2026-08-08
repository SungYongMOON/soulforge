# Soulforge AI Usage Meter v1

## 결정

Soulforge는 AI 사용량 계측을 SE 보조 기능이나 특정 회사의 개별 대시보드가 아니라 `guild_hall` 소유의 cross-project 운영 계층으로 둔다. 첫 adapter는 Codex session 로그와 lifecycle hook이며, 다른 팀원·프로젝트·MCP는 같은 usage-event 규격을 사용한다.

기존 `soulforge.ai_work_record_event.v1`은 작업 lifecycle 기록으로 유지한다. 토큰 필드를 그 schema에 추가하지 않고 `soulforge.ai_usage_event.v1`을 additive event로 생성한 뒤 `work_id`로 연결한다.

## 해결하려는 문제

큰 지침, 오래된 context, manager–executor fan-out, 반복 검증, 도구 재시도, 모델 배치가 동시에 존재하면 사용자는 어느 요소가 비용을 만들었는지 알 수 없다. 모델을 먼저 낮추거나 `AGENTS.md`를 감으로 줄이면 품질 저하와 잘못된 원인 제거가 생길 수 있다.

따라서 순서는 다음으로 고정한다.

```text
측정 → 업무·조직·lineage 귀속 → 이상 구간 확인 → 원인 분류 → 한 변수씩 최적화 → 재측정
```

## 요구사항과 구현

| ID | 요구사항 | v1 구현 |
| --- | --- | --- |
| U1 | turn별 입력·캐시·출력 측정 | 누적 token counter를 baseline과 비교 |
| U2 | 부모·자식 중복 없이 한 업무로 귀속 | session parent와 시간 구간으로 root turn 해석 |
| U3 | 조직·팀·프로젝트·업무·역할별 조회 | config 및 local binding + summary dimensions |
| U4 | 계산 근거가 재현 가능 | 버전 고정 rate card와 component별 계산 |
| U5 | 원문·reasoning·tool payload 비수집 | line marker 선별 후 safe field만 event로 투영 |
| U6 | 훅 실패가 업무를 막지 않음 | exact Codex lifecycle receipt + Stop/SubagentStop usage observation, all non-blocking health record |
| U7 | 재처리·부분 로그에 안전 | stable event ID, replay, monotonic upgrade, revision 보존 |
| U8 | 과거 로그 하나가 깨져도 전체 수집 | per-session HOLD와 coverage issue count |
| U9 | 팀원이 자기 Codex에서 사용 | 표준 Node, `CODEX_HOME`, private config, project hook |
| U10 | 비기술 사용자 모니터링 | JSON, CSV, self-contained local HTML |
| U11 | MCP와 연결 | read summary/detail + explicit work binding adapter |

## Additive 실행·품질 증거

token event 하나에 실행 문맥을 얇게 압축하지 않고, 같은 `work_id`로 연결하는 metadata-only event를 분리한다.

| 규격 | 역할 | authority 경계 |
| --- | --- | --- |
| `ai_usage_event.v1` | turn token·rate-card 계산·lineage | 사용량 관찰 |
| `ai_work_run.v1` | task/risk, model/effort, topology, instruction manifest, 비용 포함 범위 | `non_authoritative_measurement_projection` |
| `ai_quality_result.v1` | deterministic/human/model oracle의 hard gate·점수·HOLD | 업무 완료 권한 없음 |
| `ai_tool_event.v1` | tool 단계·시간·timeout·retry·preflight 연결 | argument·output 원문 비저장 |
| `instruction_manifest.v1` | 실제 instruction source의 digest·bytes·model-visible 포함 여부 | source/prompt 원문 비저장 |
| `ai_usage_replay_receipt.v1` | source manifest, parsed/HOLD, binding·lineage·role count, 계산 합계, ledger digest | actual replay claim의 private 근거 |
| `ai_usage_lifecycle_receipt.v1` | Codex lifecycle의 시작·입력·승인대기·종료 관찰 | local-only metadata projection, 업무 완료·PASS authority 아님 |

`instruction_manifest` probe는 Codex가 만든 model-visible prompt input을 메모리에서 해시·포함 여부 확인에만 사용한다. prompt 내용, 지침 원문, 메일·파일 본문을 manifest나 ledger에 복사하지 않는다. 명시적 allowlist 밖의 instruction source는 digest를 추정하지 않고 `prohibited/unknown`으로 남긴다.

`ai_work_run.v1`의 `model_id`와 `reasoning_effort`는 launcher 요청값이다. provider-effective 값으로 주장하려면 별도 usage/runtime 관찰 근거가 필요하며, 그 근거가 없으면 `requested_only_not_verified` claim ceiling을 유지한다.

## 호출 topology

```text
Codex root turn ───────────────┐
  └─ SubagentStop child turn ──┼─> session parser
Stop root turn ────────────────┘       │
historical backfill ────────────────────┤
                                       v
                           ai_usage_event.v1
                              │ work_id
                ┌─────────────┼─────────────┐
                v             v             v
          local snapshot   HTML / CSV    MCP query
```

MCP는 Codex token source가 아니다. MCP는 `work_id`를 전달하고 안전한 집계를 조회한다. MCP provider가 별도 token usage를 반환하는 경우에만 후속 source adapter가 그 값을 event로 변환한다.

## 측정 의미

`input_tokens`는 cached와 cache-write를 포함하는 provider total이다. `uncached_input_tokens`는 다음 식으로 계산한다.

```text
input - cached_input - cache_write_input
```

`reasoning_output_tokens`는 `output_tokens`의 부분집합이므로 크레딧 계산에 다시 더하지 않는다. 모델 호출 수는 누적 total usage가 증가한 snapshot 횟수이며 API request ID가 없는 로그에서는 관찰된 호출 하한으로 해석한다.

크레딧은 다음 component의 합이다.

```text
uncached input + cached input + output
```

`cache_write_input_tokens`는 입력 partition과 관찰성에는 남기되 Codex rate card의 무료 cache-write 규칙에 따라 계산 component는 `0`이다. 요율, 요금제별 token-pricing 전환일, 모델별 service-tier multiplier는 rate card에 고정한다. 동봉 카드는 Plus/Pro/Business의 2026-04-02 전환 경계를 사용하며 GPT-5.4 Fast는 2배, GPT-5.5·GPT-5.6 Fast는 2.5배를 적용한다. 경계 이전은 과거 token counter가 있어도 메시지 기반 legacy 요율을 억지로 환산하지 않고 `rate_unknown`으로 남긴다. 새 모델·요율·요금제 경계 변경은 새 rate-card ID로 추가하고 과거 event의 계산 근거를 revision 없이 덮어쓰지 않는다.

## 귀속 우선순위

1. thread+turn exact local binding
2. thread-wide local binding
3. root thread+turn binding 상속
4. cwd project binding
5. config default 또는 `unassigned`

binding은 원문이 아니라 opaque thread/turn/work ID와 조직 metadata만 저장한다. CEO, manager, executor, reviewer가 하나의 업무를 수행하면 서로 다른 turn을 같은 `work_id`에 연결한다. 비용을 한 역할에 임의 전가하지 않고 role/agent breakdown을 함께 유지한다.

## 저장 경계

기본 Soulforge runtime root:

```text
guild_hall/state/operations/ai_usage_meter/
├─ events/<YYYY-MM>/<event_id>.json
├─ revisions/<event_id>/<digest>.json
├─ pending/<event_id>/<observation_id>.json
├─ bindings.v1.json
├─ instruction_manifests/<YYYY-MM>/<manifest_id>.json
├─ work_runs/<YYYY-MM>/<event_id>.json
├─ quality_results/<YYYY-MM>/<event_id>.json
├─ tool_events/<YYYY-MM>/<event_id>.json
├─ receipts/<YYYY-MM>/<receipt_id>.json
├─ lifecycle/receipts/<YYYY-MM>/<receipt_id>.json
├─ lifecycle/current.json
├─ lifecycle/jsonl/current.json
├─ current.json
├─ dashboard.html
├─ health/latest.json
└─ health/history/<YYYY-MM>/<observation_id>.json
```

전체 root는 local-only이며 public Git에 포함하지 않는다. central aggregation은 v1에서 활성화하지 않는다. 전사 집계를 추가할 때도 event의 privacy 필드가 통과한 redacted metadata만 허용하고 raw session JSONL은 PC 밖으로 전송하지 않는다.

## Lifecycle receipt와 local projection

설치하는 Codex hook event는 아래 일곱 개뿐이다. `TurnStart`, `TurnEnd`, `Waiting` 같은 이름은 설치하거나 추정하지 않는다.

| Codex hook event | receipt lifecycle state | 경계 |
| --- | --- | --- |
| `SessionStart`, `SubagentStart` | `started` | 시작 관찰일 뿐 실행 결과가 아님 |
| `UserPromptSubmit` | `input_received` | 입력 receipt일 뿐 running 전환이 아님 |
| `PermissionRequest` | `waiting_on_approval` | 승인 대기 관찰일 뿐 승인·실행 결과가 아님 |
| `Stop`, `SubagentStop` | `observed_at_stop` + `result_pending` | stop은 PASS·complete가 아님; token 관찰은 JSONL의 별도 authority만 사용 |
| `SessionEnd` | `ended` + `result_pending` | session 종료 receipt일 뿐 업무 완료·성공 판정이 아님 |

Hook stdin은 `hook_event_name`, `session_id`, `turn_id`, `agent_id`, `agent_type`, `reason`, `permission_mode`, `stop_hook_active`만 allowlist한다. `prompt`, `last_assistant_message`, tool input/output, transcript path, agent transcript path, `cwd`와 기타 원문·secret은 즉시 버리고 receipt, health, snapshot에 저장하지 않는다. malformed/unsupported input은 안전한 reason code의 `health/latest.json` `hold`로만 남기며 hook의 stdout은 항상 `{}`다.

Receipt는 `receipt_id`, source event, lifecycle/result state, allowlisted identity/context, collector clock의 `observed_at`, 그리고 raw content/flag stored count가 모두 `0`인 privacy metadata만 가진다. ID는 allowlisted payload로 결정되므로 같은 hook 재전송은 timestamp가 달라도 최초 receipt를 replay하고 중복 합산하지 않는다.

parent lineage, lifecycle timestamp, usage completion은 hook input에서 만들지 않는다. Stop/SubagentStop usage 관찰은 JSONL의 `session_meta`, `task_started`, `task_complete`, `sub_agent_activity`만 authority로 읽으며, child의 parent는 JSONL `session_meta`에서만 찾는다. 따라서 hook path·cwd·title을 parent/turn/time 추정에 쓰지 않는다.

`lifecycle/current.json`은 Git-ignored local-only per-identity latest projection이다. exact identity는 local state 안에서만 허용되며 `session_id`, `turn_id`, `agent_id`, `agent_type`, `lifecycle_state`, `result_state`, `observed_at`, `source_event` 외 키를 갖지 않는다. `lifecycle-snapshot --state-root <local-state>`의 기본 출력은 aggregate-only이고, exact identity가 필요한 후속 local consumer는 명시적으로 `--include-identities`를 추가한다. 이 snapshot은 현재 App Server가 `notLoaded`인 PC에서 live authority, Task Engine writer, Board enrollment, 업무 완료 signal로 승격되지 않는다.

Hook의 state root는 hook input의 `cwd`나 worktree path에서 추정하지 않는다. explicit `--state-root`, 그 다음 `SOULFORGE_AI_USAGE_METER_STATE_ROOT`를 우선하고, 둘 다 없으면 runtime에서 `git rev-parse --git-common-dir`의 resolved non-bare common `.git` directory를 검증해 canonical main checkout의 `guild_hall/state/operations/ai_usage_meter`를 사용한다. 따라서 normal checkout과 linked worktree는 receipt·emergency disable marker를 하나의 local ledger에서 공유한다. common root가 unavailable, bare, malformed, 또는 unsafe이면 임의 worktree path를 쓰지 않고 `CODEX_HOME/usage-meter`로 fallback하며 health에는 `hook_common_root_*` reason code만 남긴다. 이 runtime path는 receipt 또는 snapshot에 저장하지 않는다.

프로젝트 hook은 fast path일 뿐 Codex managed worktree에서 project hook 실행 coverage를 주장하지 않는다. hook이 없거나 stale한 session/worktree는 `lifecycle-reconcile`이 정확한 `CODEX_HOME/sessions`에서 `session_meta`, `task_started`, `task_complete`, `sub_agent_activity`만 metadata-only로 다시 읽는다. `task_started`만 있으면 `active`, 대응 `task_complete`가 있으면 `stopped + result_pending`이며 PASS·업무 완료 판정은 아니다. child agent ID와 parent link는 `sub_agent_activity` 및 child의 exact `session_meta.parent_thread_id`가 함께 확인될 때만 둔다. path, cwd, transcript, prompt, message, reasoning, tool I/O, secret은 memory 밖으로 투영·저장·출력하지 않는다.

fallback의 strict versioned snapshot은 Git-ignored `lifecycle/jsonl/current.json`에 `source=jsonl_metadata`, exact identity/parent link, coverage, health, staleness, raw content/flag count `0`만 저장한다. `--thread-id`는 exact scoped read이고, unscoped scan은 bounded UUID-native session group과 safe `next_after_thread_id` cursor를 사용한다. `--apply`일 때만 compatible lifecycle receipt를 current v1 projection에 mirror한다: root active/stopped는 `SessionStart`/`Stop`, confirmed child active/stopped는 `SubagentStart`/`SubagentStop`; 모두 `result_pending`이다. Board는 existing `lifecycle/current.json` v1만 read-only로 소비하며 JSONL/path/raw source를 읽지 않는다. repository emergency disable이 있으면 fallback producer는 읽기·쓰기 모두 하지 않는다.

## Exact-thread Board usage-history sidecar

Current-status Board v1 (`soulforge.ai_usage_board_snapshot.v1`) remains the
default read-only projection. The additive
`soulforge.ai_usage_board_history_snapshot.v2` sidecar is a separate,
local-only output and never changes that v1 root shape. It nests the same
scope-matched current snapshot so total, role, model/effort, fan-out,
retry/timeout, and coverage remain available without a second aggregation
rule.

The history sidecar requires a non-empty explicit exact thread-ID set at load
or CLI time. `board-history-snapshot --thread-id <exact ID>` filters the
persisted meter events before both `current` and every history window are
built; no Board consumer may call it as a global ledger view. Its only new
identity label is `task_id`, which is the exact Codex thread ID. Project/work/
task IDs must match the safe opaque-ID grammar; unknown or unbound values are
`unassigned`. Titles, messages, session/source/path values, prompts, reasoning,
tool data, and raw evidence are excluded by the strict key validator.

`windows` is fixed to `Asia/Seoul`: calendar day/week/month use local
half-open boundaries; rolling 24-hour/7-day/30-day windows end at
`reference_at`; all-time has null bounds. Each window has total tokens,
compute credits, turns, and unknown-credit turns plus project/work/task/model
breakdowns as deterministic `top_n` rows and `other` (`model_id` is the safe
opaque model ID from the event's model block; unknown maps to `unassigned`).
The validator requires each `top + other` sum to equal the window total,
all-time to equal nested current totals, exact replay-only duplicate IDs,
deterministic rank order, and the expected time boundaries. Retry/timeout are
preserved only in the nested current activity counters and never become
additional usage turns or credits.

The event ledger accepts three provider sources with a pinned
kind↔confidence pairing: `codex_session_jsonl`/`exact_cumulative_delta`,
`claude_session_jsonl`/`exact_per_message` (duplicate `message.id`
observations collapse to one event; project attribution derives from the
session working-folder leaf slug, overridable via the local
`bindings/claude_project_binding.json`, and raw paths never enter events),
and `antigravity_conversation_db`/`request_count_only` (zero-token request
counts). Non-Codex events always carry `credits.status: "rate_unknown"` so
Codex-credit sums never mix currencies; any USD estimate is a display-layer
conversion, never a ledger value. Board snapshot loaders accept
`--include-provider <kind>` to union local-owned non-Codex events with the
exact Codex thread scope; without the flag behavior is unchanged.

v2 adds two root fields with the same metadata-only rule. `activity` carries a
fixed 40-entry KST `daily` series (consecutive dates ending at `reference_at`'s
date, zero-filled) and a fixed 24-entry KST `hourly` histogram (`hour`, turns,
total tokens over the full scoped ledger). The validator pins the last daily
row to equal `calendar_day` totals, bounds the daily sum by all-time totals,
and requires the hourly sum to equal all-time turns/tokens. `rate_limit` is
`null` or the latest event-carried `rate_limit_snapshot` (safe `limit_id`,
nullable safe `plan_type`, `used_percent` 0–1000, nullable window minutes and
reset epoch seconds) plus `observed_at` from that event's start time — an
observation of the provider-reported quota window, never a computed local
estimate.
For an exact-thread sidecar, global coverage and work-only tool observations are
not borrowed into that scope: coverage stays partial and retry/timeout remain
zero until an exact-thread evidence source exists. This avoids inferred or
double-counted coordination activity.

Board automation is a local read/refresh consumer, not a meter writer: debounce
and single-flight per state root, snapshot a bounded accepted exact-ID set,
then run scoped `collect --apply`, scoped `lifecycle-reconcile --apply`, scoped
`board-snapshot`, and scoped `board-history-snapshot` in order. It returns the
last validated local sidecar without blocking the UI, applies per-stage
timeouts, and retains a safe stale/HOLD state after a failure. It must not
broaden a scoped failure into an all-session collection or derive IDs from
title/path/prompt content.

## 복원·오류 처리

- 동일 event 재처리는 `replayed`이며 합계가 늘지 않는다.
- token counter가 증가하고 측정 상태가 같거나 강해지면 현재본을 갱신하고 이전본을 revision으로 보존한다.
- token counter 감소, turn identity 변경, 상태 후퇴는 conflict로 중단한다.
- 부모의 현재 turn이 아직 보이지 않으면 자식은 직전 부모 turn을 추측하지 않고 자신을 잠정 root로 둔다. 실제 부모 turn이 관찰되면 self-root에서 ancestor-root로만 단조 승격한다.
- 이어쓰기 파일에서 model metadata와 최신 token snapshot이 나뉘면, 서로 모순되지 않는 경우에만 풍부한 metadata와 큰 단조 counter를 결합해 rate card를 다시 적용한다.
- 같은 thread·turn의 source file이 continuation 과정에서 바뀌어도 token 또는 상태가 단조 전진할 때만 현재본을 승격하고 이전 source 관찰은 revision으로 보존한다.
- SubagentStop은 부모 session의 모든 발견 가능한 continuation 관찰과 hook이 가리킨 현재 transcript를 함께 합성한 뒤 lineage를 정한다.
- 이미 ancestor-root로 승격된 사건에 부모 active turn이 빠진 후속 백필이 self-root 관찰을 제시하면 기존 lineage·업무 귀속을 유지한다. 약하거나 같은 관찰은 replay하고, token·완료 상태가 비감소하는 더 강한 관찰은 그 관찰의 usage/status/time/source/model/credits 전체 snapshot을 기존 귀속 위에 단조 재기반한다. counter나 credit component를 필드별 `max`로 합성하지 않으며, 일반 token 감소나 동일 lineage의 회귀는 계속 conflict다.
- ledger lock을 제한 시간 안에 얻지 못한 hook event는 고유 `pending/` 파일에 남고 다음 성공 실행에서 stable event ID로 병합된다.
- 전체 sessions-root 무필터 수집만 `coverage/latest.json`을 갱신한다. 특정 파일·기간·업무·thread 수집은 scoped receipt만 반환하고 전체 coverage 최신값을 덮어쓰지 않는다.
- 손상된 과거 session은 issue로 격리하고 parsed/total session coverage를 함께 보고한다.
- hook 오류는 `health/latest.json`을 `hold`로 갱신하지만 Codex 응답 완료를 막지 않는다. 동시 실행에서 나중의 성공이 오류를 숨기지 않도록 모든 결과는 `health/history/`에 고유한 원자 기록으로 남긴다.
- 알려지지 않은 모델은 `rate_unknown`이며 크레딧 합계의 미확인 turn 수에 나타난다.
- work/quality/tool/manifest/replay receipt는 stable ID 기준으로 재실행하면 `replayed`이며, 같은 ID의 payload가 다르면 conflict로 중단한다. instruction manifest는 같은 chain/prompt identity의 후속 `observed_at`만 달라진 경우 최초 관찰 레코드를 유지하며 replay하고, 그 밖의 필드가 달라지면 conflict다.
- replay receipt는 `전체 source = 선택 manifest + 제외/HOLD`, `parsed turn = created + updated + replayed + pending + conflict`, turn-bound count 상한, ledger mutation과 before/after digest 변화를 함께 만족해야 valid다.
- evidence ledger lock은 stale 여부를 추측해 자동 탈취하지 않는다. 제한 시간 안에 기존 lock이 사라지지 않으면 `evidence_ledger_busy`로 fail-closed하고, owner가 writer 부재를 별도로 확인한 뒤 복구한다.

## 검증 기준

v1 acceptance는 다음을 모두 요구한다.

- 과거 Outlook 관찰 토큰 tuple로 구성한 합성 7-turn reference가 `670.294225`를 재현한다.
- 실제 과거 Outlook session replay와 역할 귀속을 주장하려면 source session 수·digest, parsed turn 수, 제외/HOLD, binding·lineage·role 귀속, 계산 합계를 담은 metadata-only private replay receipt가 있어야 한다.
- executor child가 depth와 무관하게 책임자 최초 turn을 root로 갖는다.
- 진행 중 부모가 보이지 않는 자식은 직전 부모 turn으로 오귀속되지 않고, 부모 관찰 뒤 정확한 root로 승격된다.
- cache-write token은 관찰되지만 계산 크레딧은 `0`이다.
- reasoning token 중복 계산이 없다.
- 부분 Stop event가 complete로 승격되어도 현재 event는 하나다.
- 같은 stable event가 월 경계를 바꾸어 관찰돼도 현재 event는 하나다.
- continuation의 model metadata와 최신 token counter가 안전하게 결합된다.
- continuation source rollover가 직접 저장과 pending 회수 경로에서 같은 stable event를 단조 승격한다.
- 부모 continuation 중 오래된 파일에 active turn이 없어도 현재 부모 transcript의 정확한 root로 귀속된다.
- scoped 재수집 뒤에도 authoritative full coverage snapshot이 유지되고 stale self-root 백필은 ancestor-root를 되돌리지 않으면서 더 강한 완료 측정값을 잃지 않는다.
- prompt, reasoning content, tool payload가 event·MCP·HTML·CSV에 없다.
- exact seven-hook lifecycle receipt가 allowlisted field만 저장하고, malformed input은 non-blocking `hold` reason code로 끝난다.
- 같은 lifecycle receipt ID의 재전송은 collector timestamp가 달라도 replay되어 receipt·snapshot duplicate count가 `0`이다.
- lifecycle aggregate 기본 출력에는 exact identity가 없고, local-only opt-in identity projection은 strict key allowlist/latest reducer 및 raw content/flag stored count `0`을 만족한다.
- malformed timestamp와 schema 밖 필드는 원장에 기록되지 않는다.
- CSV 자유 문자열은 spreadsheet formula로 실행되지 않게 중화한다.
- 전수 백필이 문제 session을 명시하고 나머지를 계속 집계한다.
- 새 PC는 Node, project hook, private config만으로 doctor와 collect를 실행할 수 있다.
- fresh session A/B에서 cwd·global instruction·model·effort·fixture를 고정하고, 각 variant의 loaded instruction source digest·bytes·prompt digest·truncation 상태를 기록할 수 있다.
- quality hard gate가 PASS인 후에만 operational executor/reviewer 크레딧을 비교하고 controller·offline oracle·experiment evaluator 비용은 별도 범위로 보고한다.

## 운영 최적화 원칙

계측 전에는 `AGENTS.md` 축약이나 모델 일괄 하향을 비용 해결책으로 적용하지 않는다. 품질 acceptance를 고정한 상태에서 다음 항목을 한 번에 하나씩 바꾼다.

- 불필요한 manager relay와 자식 fan-out
- 같은 자료의 반복 읽기와 중복 검증
- 긴 task에 누적된 stale context
- 과도한 reasoning effort 또는 상위 모델 배치
- 불명확한 acceptance로 발생한 재작업
- 명시 binding 부족으로 생긴 `unassigned`

일반 ChatGPT 라우팅은 저장소·로컬 접근이 필요 없는 조사와 전략 검토를 Codex 밖에서 수행하는 보조 수단이다. ChatGPT 사용량을 이 원장에 합치는 기능으로 해석하지 않는다.

## 후속 확장

v1 이후 별도 owner gate가 필요한 항목은 중앙 집계 service, 예산 경보, App Server streaming adapter, non-Codex provider adapter, npm/plugin 배포, 조직 SSO/ACL이다. 이 항목들은 현재 local meter의 정확도를 전제로 하며, v1 hook이나 event schema를 우회해 원문을 수집할 권한을 갖지 않는다.

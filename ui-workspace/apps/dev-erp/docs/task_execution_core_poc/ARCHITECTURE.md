# Task Execution Core POC 아키텍처

- 상태: `public_synthetic / feature_off / implementation_candidate`
- 범위: Task 실행 eligibility, 단일 claim, 실행 상태, append-only 사건, 실행 영수증
- 비범위: UI, 실제 Linear writer, 외부 발송, 운영 scheduler, Context Graph/RAG
- 주장 한계: 이 문서는 현재 POC 코드의 구조를 설명한다. 운영 TaskDriver 또는 production schema의 수락 문서가 아니다.

## 1. 소스 권위와 해석 순서

설계 판단에는 다음 우선순위를 적용한다.

1. `2026-08-20_01_GPT프로젝트_공통_업무운영_지침_v3.1`
   - 현재 실제 업무 운영규칙의 기준이다.
   - Linear가 Official Task의 정본이고, Work Brief·Waiting·Done 확인·외부 조치 제한을 소유한다.
2. `2026-08-19_Soulforge_업무상태_인터페이스_Agent_Control_구조_검토안_v0.1`
   - TaskDriver, Dispatcher, AgentRun, Event Ledger, Context/Evidence에 관한 설계·실험 기록이다.
   - 이 문서의 제안은 POC에서 시험할 수 있지만 확정 운영규칙으로 승격하지 않는다.
3. `README_Task_Ledger.md`
   - 존재하더라도 초기 역사적 프로토타입 참고자료다.
   - 현재 Linear 중심 운영을 대체하거나 우선하지 않는다.
4. 이 POC의 코드와 테스트
   - 합성 환경에서 실제로 구현·검증된 동작만 증명한다.
   - 상위 운영규칙을 변경하거나 아직 열린 설계안을 확정하지 않는다.

Drive 문서의 식별자, 원문, private 업무자료는 public POC에 복사하지 않는다.

## 2. 배치 결정

독립 최상위 프로젝트를 만들지 않고 기존 Task Engine 개발면인
`ui-workspace/apps/dev-erp/` 안에 격리한다.

```text
ui-workspace/apps/dev-erp/
  src/
    task_execution_core.mjs
    task_execution_sqlite_event_store.mjs
    task_execution_fixture_adapters.mjs
  test/
    task_execution_core.test.mjs
  docs/task_execution_core_poc/
    IMPLEMENTATION_PLAN.md
    ARCHITECTURE.md
    NEXT_DECISIONS.md

docs/architecture/workspace/examples/task_execution_core_poc/
  task_execution_core.synthetic.json
```

이 위치를 택한 이유는 다음과 같다.

- 이 모듈은 SE 규칙을 판정하는 `engineering_engine`이 아니라 Official Task의 실행 수명주기를 다룬다.
- 기존 dev-ERP의 Task Engine 방향과 가까우면서도 production route, `core_item`, 기존 `event_log`, UI에 연결하지 않을 수 있다.
- SQLite 객체 이름에 `_poc`를 붙여 live schema와 혼동하거나 암묵적으로 migration하지 않는다.
- 향후 SE 판단, Context/Evidence, RAG가 입력 또는 근거를 공급할 수는 있지만 이번 POC는 어느 엔진도 호출하거나 변경하지 않는다.

전체 비전에서 이 POC의 위치는 아래 한 칸이다.

```text
Linear Official Task (업무 상태 정본)
            |
            v  read-only
Task Execution Core (eligibility + claim + run + receipt)
            |
            v  reference/digest only
Event / Evidence projection 후보
```

Source 원문 정본, Task 상태 정본, 실행 증거를 한 저장소로 합치지 않는 것이 핵심이다.

## 3. Deep Module Interface

외부 호출면은 세 함수로 제한한다.

```js
const core = createTaskExecutionCore({
  taskProvider,
  eventStore,
  executors,
  clock,
});

await core.ingestEvent(eventEnvelope);
await core.dispatch({ task_ref, idempotency_key });
await core.readExecution({ task_ref });
```

| Interface | 책임 | 내부에 숨기는 것 | 외부 효과 |
| --- | --- | --- | --- |
| `ingestEvent` | provider 사건을 정규화해 한 번 기록 | exact envelope 검사, 세 시각 보존, event ID 생성, duplicate/conflict 판정 | 격리 EventStore 기록만 |
| `dispatch` | Official Task 한 건의 실행 가능성부터 영수증까지 닫음 | guard 순서, 실행 basis digest, 원자 claim, 상태 전이, retry 판정, Waiting/receipt 정규화 | Mock Executor 호출과 격리 EventStore 기록만 |
| `readExecution` | Task별 최신 실행 projection과 사건 이력 읽기 | SQLite 질의, JSON 복원, 순서 정렬 | 없음 |

호출자는 SQLite 테이블, claim transaction, 상태 event 작성 순서를 알 필요가 없다. 반대로 Core는
Linear transport나 실행기 구현을 알지 않고 아래 interface만 요구한다.

## 4. Domain Model

v0는 별도 class hierarchy 대신 검증된 JSON reference와 SQLite row로 개념을 모델링한다.

| 개념 | 현재 표현 | 현재 보장 | 현재 미보장 |
| --- | --- | --- | --- |
| `TaskRef` | `provider + task_id` | provider는 `linear` 또는 `candidate`, task ID는 비어 있지 않음 | 실제 Linear 객체 존재성은 Provider 책임 |
| `ProjectRef` | Provider가 반환한 Task의 `project_ref` | execution basis digest와 AgentRun projection에 포함 | 별도 shape·존재성 검증과 receipt 투영 없음 |
| `WorkBriefRevisionRef` | `revision_id + sha256 digest` 중심 reference | revision ID와 digest 형식 존재, execution basis와 receipt에 결속 | digest를 Work Brief 내용에서 재계산하지 않음; provider/task 필드 전체 shape 검증 없음 |
| `SourceRef` | Work Brief `inputs`와 `source_refs`의 reference | Work Brief 배열이 비어 있지 않음을 확인 | source 존재성·revision·권한·본문 검증 없음 |
| `EvidenceRef` | Executor 결과의 `evidence_refs` | 배열을 receipt에 복사 | reference shape·근거 등급·존재성 검증 없음 |
| `TaskEvent` | provider event envelope | provider event ID, idempotency key, 세 시각, payload digest, TaskRef를 append-only 보존 | raw provider payload 저장·검증 없음 |
| `AgentRun` | task별 실행 current projection | 상태, claim/start/end 시각, dispatch/execution identity, task별 활성 run 1개 | lease·heartbeat·resume·recovery owner 없음 |
| `ExecutionReceipt` | run당 immutable JSON receipt | outcome, 결과, artifact/evidence refs, 완료조건, Work Brief revision, 효과 0 선언 | Official Task Done 승인 또는 외부 artifact 검증 없음 |
| `WaitingInfo` | Waiting receipt 내부 구조 | `reason`, `required_input`, `next_action_owner`, 선택 날짜, manager decision 여부 | 답변 수신·해소·resume 규칙 없음 |

AgentRun 상태는 다음 여섯 개다.

```text
claimed -> running -> waiting
                   -> succeeded
                   -> failed
                   -> cancelled
```

현재 `waiting`은 terminal이 아니라 활성 상태다. receipt는 남지만 `ended_at`은 비어 있고 같은 Task의
두 번째 claim을 막는다.

## 5. Adapter seam

### LinearTaskProvider

최소 interface는 `readTask(taskRef)`다. 현재 구현은 `FixtureLinearTaskProvider`뿐이며 합성 객체를
복제해 반환한다. write, status transition, webhook acknowledgement는 제공하지 않는다.

### Executor

최소 interface는 `execute({ operation_id, task, work_brief })`다. Core는 `executor_ref`로 등록된
Executor를 찾는다. 현재 `MockExecutor`는 합성 success, Waiting, failure, cancellation, crash만 재현한다.

### EventStore

현재 Core가 사용하는 최소 동작은 다음과 같다.

- `appendProviderEvent(event)`
- `findDispatch(idempotencyKey, taskKey)`
- `claim(run, claimedEvent)`
- `markRunning(runId, at, runningEvent)`
- `complete(runId, status, receipt, at, terminalEvent)`
- `readTaskExecution(taskKey)`

현재 adapter는 Node의 `node:sqlite`를 사용하는 `SqliteEventStore`다. 테스트는 `:memory:`를 사용하며
운영 DB, existing dev-ERP DB, migration과 연결하지 않는다. `clock`도 주입받으므로 Core가 직접 시스템
시각을 읽지 않는다.

## 6. SQLite 저장 구조와 불변식

| Table | 역할 | 주요 불변식 |
| --- | --- | --- |
| `task_execution_event_poc` | provider TaskEvent ledger | event ID PK, idempotency key unique, provider+provider event ID unique, UPDATE/DELETE trigger 거부 |
| `task_execution_agent_run_poc` | AgentRun current projection | 상태 enum, dispatch key unique, execution key unique, monotonic `run_order`, task별 활성 `claimed/running/waiting` 1개 |
| `task_execution_agent_run_event_poc` | AgentRun 상태 event ledger | run+sequence unique, idempotency key unique, UPDATE/DELETE trigger 거부 |
| `task_execution_receipt_poc` | ExecutionReceipt | run당 1개, UPDATE/DELETE trigger 거부 |

append-only는 provider event, run event, receipt에 적용된다. `agent_run_poc`는 사건에서 읽기 쉬운 현재
상태를 제공하는 projection이므로 `claimed -> running -> outcome` 전이에 따라 UPDATE된다.

다음 묶음은 각각 `BEGIN IMMEDIATE` transaction 하나에서 수행된다.

- provider event duplicate 확인 + append
- AgentRun claim + `claimed` event append
- current run을 `running`으로 변경 + `running` event append
- current run outcome 변경 + terminal/waiting event append + receipt append

동일 provider identity 또는 idempotency key가 재수신되면 같은 payload digest는 `duplicate` no-op,
다른 digest는 `PROVIDER_EVENT_CONFLICT`다. raw payload 대신 digest만 저장한다.

## 7. Dispatcher 폐루프

Dispatcher는 다음 순서로 fail-closed 판단한다.

1. 호출자 또는 Provider가 반환한 Candidate TaskRef면 claim·Executor 없이
   `CANDIDATE_NOT_EXECUTABLE`로 종료한다. 호출자 Candidate는 Provider도 읽지 않는다.
2. Provider가 반환한 TaskRef가 요청 TaskRef와 exact match이고 `task_class=official`이어야 한다.
3. status가 exact `Todo`가 아니면 실행하지 않는다.
4. Work Brief가 없거나 최소 필드·revision digest 형식·TaskRef 결속을 통과하지 못하면 실행하지 않는다.
5. policy gate가 `approved`이고 `authority_ref`가 있어야 한다.
6. `executor_ref`가 있고 등록된 Executor가 `execute`를 제공해야 한다.
7. Task, Project, Work Brief revision, Executor, authority로 execution basis digest를 만든다.
8. EventStore에서 claim과 `claimed` event를 원자적으로 기록한다.
9. 동일 Task의 활성 run이 있으면 새 Executor 호출 없이 거절한다.
10. 동일 dispatch key가 이미 receipt를 가졌으면 Waiting을 포함해 기존 결과를 replay한다.
11. 동일 dispatch key의 run에 receipt가 없으면 자동 재실행하지 않고 `RUN_RECOVERY_REQUIRED`로 hold한다.
12. 동일 Task의 동일 dispatch key는 최초 accepted execution basis와 receipt를 식별한다. 이후
    Work Brief·Executor·authority가 바뀌었으면 새 실행에 새 key가 필요하며, 기존 key는 provider를
    다시 읽지 않고 기존 receipt를 재생한다. 다른 Task가 같은 key를 쓰면 `IDEMPOTENCY_CONFLICT`다.
13. 새 claim만 `running`으로 전이하고 Executor를 한 번 호출한다.
14. Waiting/succeeded/failed/cancelled 결과를 검증하고 run event와 immutable receipt를 함께 기록한다.

모든 dispatch 응답과 receipt는 `official_task_mutated=false`다. `succeeded`여도
`official_task_done=false`이며 Linear status를 변경하지 않는다.

## 8. Crash, replay, Waiting 의미

- Executor가 throw하면 Core는 raw message를 버리고 `EXECUTOR_CRASHED`만 반환한다.
- crash 시 run은 `running`, receipt는 없음으로 남는다.
- 같은 dispatch key 재호출은 Executor를 다시 부르지 않고 `RUN_RECOVERY_REQUIRED`로 멈춘다.
- 다른 dispatch key도 기존 `running` run 때문에 `ACTIVE_AGENT_RUN_EXISTS`로 막힌다.
- receipt가 있는 같은 dispatch key 재호출은 Waiting을 포함해 같은 run과 receipt를 반환하고
  Executor 호출은 0이다.
- Waiting은 구조화된 다음 입력과 행동 주체를 남기지만 자동 resume하지 않는다.

이 동작은 중복 실행 방지 쪽으로 fail-closed한 것이다. crash 복구나 Waiting 해소를 완료하는 운영
workflow는 아직 없다.

모든 provider/store seam 오류는 raw exception을 버리고 stable Core error로 바뀐다. failed/cancelled
reason code는 통제된 대문자 토큰만 허용한다. AgentRun과 receipt는 authority ref, dispatch
idempotency key, execution basis digest를 함께 보존한다.

## 9. 권한과 효과 0 경계

이 Core가 갖지 않는 권한은 명시적이다.

- Candidate를 Official Task로 승격하지 않는다.
- Linear 상태, 담당자, Work Brief, 관계, Done을 변경하지 않는다.
- Gmail 발송, Slack 게시, 공유권한 변경, 파일 이동을 하지 않는다.
- SE 판단, manager 결정, 완료 승인, source truth를 생성하지 않는다.
- Context/Evidence ref를 수락·승격하거나 graph를 변경하지 않는다.

receipt에는 아래 effect count가 항상 0으로 기록된다.

```json
{
  "linear_writes": 0,
  "gmail_sends": 0,
  "slack_posts": 0,
  "sharing_changes": 0
}
```

다만 이것은 현재 Mock Executor와 feature-OFF POC의 계약이다. Core가 임의의 Executor process를
sandbox하는 기능은 없으므로 production Executor를 등록하기 전에 별도 capability/authorization guard와
실제 effect receipt가 필요하다.

## 10. 제한과 비주장

- 실제 Linear read/write, webhook, polling, revision reconciliation을 검증하지 않았다.
- Work Brief digest는 제공값의 형식만 확인하며 본문에서 직접 계산하지 않는다.
- SourceRef, EvidenceRef, artifact ref의 존재성·권한·revision을 확인하지 않는다.
- Waiting reply ingest, resume/new-run 선택, crash recovery, heartbeat, lease, timeout을 구현하지 않았다.
- 같은 execution basis는 DB에서 unique다. 같은 Work Brief·Executor·authority에 대한 별도 승인 rerun
  정책과 API는 구현하지 않았다.
- 잘못된 Executor outcome이 `running` 이후 발견되는 경우까지 닫는 recovery 경로는 없다.
- provider event의 세 시각은 분리 저장하지만 상호 시간 순서를 판정하지 않는다.
- POC `SqliteEventStore`는 `:memory:`만 허용하며 파일 기반 persistence를 거부한다. 다중 process
  경합, backup/restore, migration, retention은 구현·검증하지 않았다.
- `readExecution`은 monotonic `run_order`의 최신 run과 그 run의 event만 반환하며 task 전체 run
  history 조회 API가 아니다.
- POC MockExecutor receipt의 `external_effects=0`은 arbitrary Executor에 대한 기술적 sandbox
  증명이 아니다.
- 기존 dev-ERP Event Ledger, `core_item`, TaskDriver, Dispatcher, ERP projection에 통합하지 않았다.
- 완전한 Context Graph/RAG/Wiki, 자동 Task discovery, 복수 Agent orchestration을 구현하지 않았다.
- 합성 POC 통과는 operational activation, phase acceptance, production readiness를 뜻하지 않는다.

운영 통합 전 결정할 질문은 [NEXT_DECISIONS.md](./NEXT_DECISIONS.md)에 한정해 둔다.
Linear 이력·Comment·Waiting·Evidence의 장기 복원 범위는
[LINEAR_BACKUP_SCOPE_REVIEW.md](./LINEAR_BACKUP_SCOPE_REVIEW.md)에 별도로 정리한다.

## 11. CandidateExecutionCoordinator 별도 구조

2026-08-24 추가된 아래 세 Module은 이 문서의 `TaskExecutionCore`와 SQLite EventStore를
수정하거나 감싸지 않는다. 별도의 feature-OFF, in-memory 구조로 candidate selection부터
replaceable Executor 호출 직전·직후까지의 결속과 custody를 합성 packet으로 검증한다.

```text
GPT/ingress `AI 실행 후보` marker
  -> prevalidated candidate packet (prefilter only)
  -> RoleCapabilityMatcher (exact Role + Capability + actor/agent/Bot binding)
  -> AssignmentPolicy (`responsible_ceo_triage`)
  -> CandidateExecutionCoordinator (claim/custody/slot/replay/receipt)
  -> replaceable Executor Adapter (feature-OFF Hermes bot-submit Adapter 포함)
```

`AI 실행 후보`는 candidate prefilter marker일 뿐이다. marker나 connector readback은 Official
Task, `Todo`, Work Brief revision, action, authority, Role, Capability, assignment, dispatch 또는
completion 권위를 만들지 않는다.

### 11.1 Role/Capability와 배정 seam

`RoleCapabilityMatcher`는 exact prevalidated Work/Task contract, versioned Role snapshot,
versioned Capability snapshot만 받는다. Required Role의 exact action 책임과 explicit
`actor_ref -> performing_agent_id -> bot_ref -> executor_ref` binding을 확인하고, required
Capability가 모두 있는 active candidate만 반환한다. 라벨, 표시명, 유사 Role, 인접 candidate,
runtime availability에서 의미를 추론하지 않는다. Responsible actor가 required Capability를
충족하지 못하면 다른 candidate가 있어도 `HOLD`다.

`AssignmentPolicy`는 matcher와 분리된 Module이다. 현재 구현된 policy mode는
`responsible_ceo_triage` 하나이며 exact responsible actor candidate 한 건만 선택한다.
`recommendation_only`, ranking, fallback, 자동 배정은 구현되지 않았다.

### 11.2 Coordinator 불변식

- candidate, Official `Todo` task, Work Brief revision, action, authority와 assignment packet이
  exact하게 일치해야 Executor를 찾는다.
- claim natural key는 exact TaskRef + immutable Work Brief revision + action이다. 같은 packet의
  재호출은 idempotency key가 달라도 `NO_OP`; 같은 claim의 다른 packet이나 한 key의 다른
  claim은 `HOLD`다.
- parent decomposition은 caller가 제공한 opaque `coverage_refs`의 exact union을 자식에게
  이전한다. sibling overlap, 누락/초과, unknown ancestry, 다른 authority는 `HOLD`이고,
  child custody는 parent/task/claim/authority/coverage/assignment/decomposition lineage의
  immutable fingerprint를 보존한다. 이후 child dispatch나 child→grandchild decomposition에서
  하나라도 바뀌면 Executor 호출 전 `HOLD`한다. decomposed parent는 재실행하지 않는다.
  같은 규칙을 child→grandchild에 반복하며 coverage의
  업무 의미는 추론하지 않는다.
- active slot key는 `performing_agent_id`다. 한 agent는 한 run만 active지만 다른 agent는
  병렬로 실행할 수 있다. Waiting/HOLD와 성공/실패 settle은 slot을 해제하되 coverage custody는
  유지한다.
- successor는 같은 packet fingerprint와 latest Waiting/HOLD receipt exact ID에만 허용한다.
  successor는 새 run/attempt/fencing epoch를 만들며 attribution 변경 같은 divergent replay는
  `HOLD`다. 수동 timeout HOLD 뒤 늦은 결과도 fencing으로 거부한다.
- Executor outcome은 closed metadata-only shape만 받는다. raw/path/secret-bearing packet 또는
  outcome은 저장·반환하지 않고 `HOLD`하며, receipt는 exact responsible role, actor,
  performing agent, Bot, Executor attribution과 ref만 보존한다.

Execution/decomposition receipt와 `inspect()`는 항상 Official Done/mutation false를 유지한다.
Execution receipt는 Executor가 제공한 exact `external_effect_evidence`를 검증·복사한다.
Synthetic Executor는 관찰된 0을, Hermes Adapter는 측정하지 못한 count를 literal `UNKNOWN`으로
기록한다. Effect field는 nonnegative safe integer 또는 literal `UNKNOWN`만 허용하고 `null`은
거부한다. Decomposition의 아래 effect 0은 Coordinator 내부 동작에만 해당한다.

```json
{
  "linear_writes": 0,
  "network_calls": 0,
  "filesystem_writes": 0,
  "shell_commands": 0
}
```

이 숫자는 현재 in-memory decomposition 경계이며 arbitrary Executor의 sandbox 증명이 아니다.

### 11.3 Adapter와 현재 HOLD

첫 임시 canary adapter는 (1) 별도 승인된 Codex Linear connector로 marker/합성 issue를
create/read하는 transport와 (2) feature-OFF `HermesBotSubmitExecutor`다. Hermes Adapter는 exact
binding과 executable identity/digest를 검사하고 Work Brief를 승인 resolver에서 일시적으로 받아
UTF-8 stdin으로만 전달하며, accepted/completed JSONL을 metadata-only result/evidence ref로 바꾼다.
Host timeout·pre-ACK timeout·session/model/request mismatch·executable drift는 재시도 없이
`HOLD/UNKNOWN`이다. 현재 실제 command/Bot canary는 실행되지 않았다. Connector 출력은 candidate
관찰·transport receipt일 뿐 Task, Role, Capability, assignment, result 또는 completion authority가
아니다.

주입형 `runCommand`는 trusted test seam이며 그 결과는 production execution evidence가 아니다.
live canary는 주입 없이 repository default runner를 사용해야 한다. Default runner의 direct child
abort/kill은 best-effort이고 Windows descendant process-tree 종료는 아직 증명하지 않았으므로 host
deadline은 성공·실패를 추론하지 않고 항상 `HERMES_TIMEOUT_UNKNOWN`으로 남긴다.

영구 구조에서는 Soulforge-owned ingress/Linear adapter, organization Role/Capability source,
Hermes Executor transport, persistent claim/run/decomposition/receipt ledger, scheduler와
Task/4192 projection adapter가 이 seam에 결속되어야 한다. live Linear adapter/label creation,
live Role/Capability source, Hermes dispatch, persistent ledger, scheduler, writer cutover,
automatic assignment와 4192 result projection은 각각 별도 검증·승인 전 `HOLD`다.

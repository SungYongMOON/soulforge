# Task Execution Core POC 구현계획

- 상태: `public_synthetic / feature_off / implementation_candidate`
- 목적: Linear의 Official Task를 변경하지 않은 채, 안전한 단일 실행 claim과
  `AgentRun -> Waiting|Succeeded|Failed|Cancelled -> ExecutionReceipt` 폐루프를 합성 자료로 검증한다.
- 우선 소스: `2026-08-20_01_GPT프로젝트_공통_업무운영_지침_v3.1`
- 검토 소스: `2026-08-19_Soulforge_업무상태_인터페이스_Agent_Control_구조_검토안_v0.1`
- 역사 참고: `README_Task_Ledger.md`
- 주장 한계: 이 POC는 운영 TaskDriver, Dispatcher, AgentRun, Linear 연동 또는 dev-ERP schema
  migration의 수락 증거가 아니다.
- Linear 백업 데이터 범위·구조 검토는 [LINEAR_BACKUP_SCOPE_REVIEW.md](./LINEAR_BACKUP_SCOPE_REVIEW.md)에
  별도로 정리하며 자동 백업 구현은 하지 않는다.

## ASSUMPTIONS

- Owner의 이번 요청은 합성 fixture와 격리 SQLite를 사용하는 public POC 구현을 승인한다.
- Drive v3.1이 현재 운영규칙이며, 기존 public 후보 문서와 충돌하면 v3.1을 우선한다.
- 실제 Linear·Gmail·Slack·ERP·MCP·scheduler에는 연결하지 않는다.
- TDD의 사전 합의 seam은 `LinearTaskProvider`, `Executor`, `EventStore`, 그리고 이들을 감싼
  Task Execution Core Interface다.
- `occurred_at`, `received_at`, `ingested_at`은 호출자가 제공하며 Core는 시스템 시계를 읽지 않는다.

## 현재 확정 운영규칙

1. Linear가 현재 Official Task 상태, 우선순위, 담당, 기한, Work Brief, 관계와 완료조건의 정본이다.
2. Gmail과 Slack은 Source/Evidence 및 협업 공간이며 별도 Todo/Waiting/Done 정본이 아니다.
3. Official Task 흐름은 `Todo -> In Progress -> Waiting -> Done`이다.
4. Work Brief는 목적, 배경/근거, 입력자료, 실행 지시, 제약, 완료조건, 예상 산출물,
   완료보고 방식, Source, Handoff를 갖는다.
5. Waiting은 최소 `reason`, `required_input`, `next_action_owner`, 선택적 회신/기한,
   `manager_decision_required`를 남긴다.
6. Agent 또는 실행기가 성공해도 Official Task는 자동 Done이 아니다. 완료조건, 산출물,
   Evidence, 외부조치, 후속조치와 승인을 별도로 확인한다.
7. 초안·검토·정리 요청만으로 외부 발송, 파일 이동, 공유권한 변경, 중요 상태 변경을 하지 않는다.
8. 근거가 부족하면 추정으로 상태나 과제 귀속을 확정하지 않는다.

## 아직 검토 중인 설계안

- Snapshot + append-only Event + Reconciliation으로 Linear 이력을 장기 보존하는 구조
- Candidate와 Official Task 분리 및 policy/approval Gate 뒤 자동 실행
- Dispatcher의 원자 claim, AgentRun heartbeat/recovery/retry
- `claimed|running|waiting|succeeded|failed|cancelled` AgentRun 상태
- 동일 Task에 활성 AgentRun 하나만 허용하는 규칙
- AgentRun 결과를 ERP Event Ledger와 Context/Evidence projection에 연결하는 방식
- 장기적으로 Linear를 계속 Task 정본으로 쓸지 dev-ERP Task Engine으로 이관할지

위 항목은 Drive 문서에서도 `검토 중/미구현/확정 원칙 아님`이다. POC는 행동을 검증하지만
운영규칙으로 승격하지 않는다.

## 이번 POC 구현 범위

### 배치

```text
ui-workspace/apps/dev-erp/
  docs/task_execution_core_poc/
    IMPLEMENTATION_PLAN.md
    ARCHITECTURE.md
    NEXT_DECISIONS.md
  src/
    task_execution_core.mjs
    task_execution_sqlite_event_store.mjs
    task_execution_fixture_adapters.mjs
  test/
    task_execution_core.test.mjs

docs/architecture/workspace/examples/task_execution_core_poc/
  task_execution_core.synthetic.json
```

### 외부 Interface

```js
const core = createTaskExecutionCore({ taskProvider, eventStore, executors });

await core.ingestEvent(eventEnvelope);
await core.dispatch({ task_ref, idempotency_key });
await core.readExecution({ task_ref });
```

`dispatch` 뒤에 eligibility, claim, 상태 전이, Waiting 검증, receipt, retry 멱등을 숨긴다.
테스트와 caller는 내부 테이블이나 private helper를 직접 사용하지 않는다.

### Domain Model

- `TaskRef`, `ProjectRef`, `WorkBriefRevisionRef`, `SourceRef`, `EvidenceRef`
- `TaskEvent`: provider event identity, idempotency key, 세 시각, digest, typed refs
- `AgentRun`: task/brief/executor/execution basis와 실행 상태
- `ExecutionReceipt`: 결과, artifact/evidence refs, 완료조건 충족 여부, Official Task 변경 0
- `WaitingInfo`: 사유, 필요 입력, 다음 행동 주체, 선택적 날짜, manager decision 여부

### Adapter

- `FixtureLinearTaskProvider`: 합성 JSON을 읽기만 하며 write method가 없다.
- `MockExecutor`: 성공·Waiting·실패·crash를 합성하고 호출 횟수를 관찰할 수 있다.
- `SqliteEventStore`: `node:sqlite`와 `:memory:` DB를 사용해 append-only event, 원자 claim,
  current AgentRun projection, immutable receipt를 검증한다.

### Dispatcher 실행조건

모두 만족할 때만 claim한다.

1. provider가 확인한 Official Task
2. exact status `Todo`
3. 유효한 Work Brief와 immutable revision ref/digest
4. 지정된 Executor가 등록됨
5. policy/approval Gate가 통과했고 authority ref가 있음
6. 같은 Task에 활성 AgentRun이 없음

Candidate와 Gate 실패는 Executor 호출과 AgentRun 생성이 모두 0이다.

### 저장 불변식

- provider event와 run event는 append-only이며 UPDATE/DELETE를 trigger로 거부한다.
- `occurred_at`, `received_at`, `ingested_at`을 분리한다.
- 같은 provider event/key + 같은 digest는 duplicate no-op이다.
- 같은 provider event/key + 다른 digest는 conflict다.
- claim과 claim event는 `BEGIN IMMEDIATE` transaction 하나로 기록한다.
- task별 `claimed|running|waiting` 활성 run은 최대 하나다.
- terminal receipt가 있으면 같은 idempotency key 재호출은 Executor를 다시 부르지 않는다.
- 같은 Task의 dispatch key는 최초 accepted execution basis를 식별한다. 이후 Work Brief·Executor·
  authority가 바뀌었으면 새 실행에 새 key를 사용하며, 기존 key는 provider 재조회 없이 기존 receipt를 재생한다.
- crash 뒤 terminal receipt가 없으면 자동 재실행하지 않고 recovery-required로 멈춘다.

### 자동 테스트

1. Official Todo + Work Brief -> claim -> Mock Executor -> succeeded receipt
2. 입력 부족 -> Waiting + Next Action Owner
3. 동일 Task 중복 claim 차단
4. retry/crash 시 Executor 중복 호출 방지
5. AgentRun succeeded만으로 Official Task Done이 되지 않음
6. 동일 provider event 재수신 시 ledger 중복 append 방지
7. Candidate는 provider/executor 실행 0
8. Event UPDATE/DELETE 거부와 세 시각 보존

## 이번 POC에서 의도적으로 제외할 항목

- Gmail/Slack 자동 Task Discovery
- Candidate 자동 승인 또는 Official Task 승격
- 실제 Linear read/write, Webhook, polling, reconciliation
- Gmail/Slack 실제 발송, 파일 이동, 공유권한 변경
- dev-ERP `core_item`, 기존 `event_log`, server route, MCP, scheduler 변경
- ERP <-> Linear 양방향 writer
- live DB migration 및 existing dev-ERP DB에 POC table 설치
- 완전한 Context Graph/RAG/Wiki/TaskDriver 구현
- 복수 Agent 자율 orchestration, heartbeat lease, terminal retry/resume
- 실제 project 자료·개인정보·credential·provider payload 사용

## 문서 간 충돌 또는 결정이 필요한 질문

1. Drive v3.1은 Linear를 Official Task SoR로 확정하지만 public lifecycle 후보는 dev-ERP
   `core_item` current truth를 target으로 둔다. POC는 Linear를 우선하고 dev-ERP에는 실행 증거만 둔다.
   장기 owner는 별도 결정이 필요하다.
2. 기존 마스터플랜은 P5~P8 뒤 P9 one-project pilot과 P10 및 별도 AgentRun gate 전에는
   operational AgentRun을 금지한다. 이번 구현은 public-synthetic feature-OFF 하네스이며
   어느 phase acceptance, pilot 또는 activation도 아니다.
3. Linear의 Work Brief exact revision/digest를 어떤 provider field 조합으로 고정할지 미결정이다.
4. Waiting을 active run으로 계속 유지할지, 해소 뒤 resume/new run 중 무엇을 쓸지 미결정이다.
5. AgentRun succeeded 뒤 Official Task Done을 승인하는 owner/gate는 미결정이다.

## 구현 순서

1. 합성 fixture와 첫 성공 test를 작성해 실제 RED를 확인한다.
2. Core Interface와 Fixture Provider/Mock Executor 최소 구현으로 GREEN을 만든다.
3. Waiting, duplicate claim, crash/retry, succeeded-not-Done을 한 slice씩 추가한다.
4. SQLite EventStore와 provider-event idempotency, append-only trigger를 연결한다.
5. ARCHITECTURE와 NEXT_DECISIONS를 실제 코드 결과에 맞춰 작성한다.
6. focused test, dev-ERP test, root relevant validator, Level 2 independent review를 수행한다.

## 2026-08-24 CandidateExecutionCoordinator 구조 조각

- 상태: `public_synthetic / feature_off / in_memory / green_not_operational`
- 관계: 기존 `TaskExecutionCore`, `_poc` SQLite table, provider/run event와 receipt 의미를
  변경하거나 wrapper로 감싸지 않는 sibling foundation이다.
- marker 경계: GPT/ingress `AI 실행 후보`는 prefilter candidate marker만 만든다. marker가
  Role/Capability, assignment, dispatch, result 또는 completion authority가 되지 않는다.

### 구현 파일과 Interface

```text
src/role_capability_matcher.mjs
src/assignment_policy.mjs
src/candidate_execution_coordinator.mjs
test/role_capability_matcher.test.mjs
test/assignment_policy.test.mjs
test/candidate_execution_coordinator.test.mjs
```

```js
const match = matchRoleCapabilities({
  work_task_contract,
  role_snapshot,
  capability_snapshot,
});
const assignment = assignCandidate({ matcher_result: match, policy });
const coordinator = createCandidateExecutionCoordinator({
  executors,
  feature_enabled: false,
});

await coordinator.recordDecomposition(decomposition_packet);
await coordinator.dispatch(dispatch_packet);
coordinator.holdRun(hold_packet);
coordinator.inspect();
```

### GREEN으로 닫힌 합성 계약

1. exact Role/action/Capability와 explicit actor→performing agent→Bot→Executor binding만
   candidate가 된다. Label이나 가까운 candidate로 추론하지 않는다.
2. `responsible_ceo_triage`는 exact responsible actor candidate 하나만 배정하며 자동 fallback이나
   auto-assign을 하지 않는다.
3. candidate/task/assignment의 TaskRef, Work Brief revision, action과 authority가 exact match일
   때만 dispatch한다.
4. parent-child-grandchild decomposition은 opaque coverage ref의 exact custody transfer만
   수행한다. sibling overlap, coverage gap/extra, unknown ancestry와 decomposed-parent 재실행은
   `HOLD`다.
5. performing agent별 active slot 하나를 유지하면서 다른 agent의 병렬 실행은 허용한다.
   Waiting/HOLD settle은 slot을 해제하고 coverage custody를 유지한다.
6. same exact claim+packet replay는 `NO_OP`; divergent replay, idempotency collision과 잘못된
   successor는 `HOLD`다. successor는 latest Waiting/HOLD receipt에 exact 결속된 새 attempt다.
7. raw/path/secret을 거부하고 metadata-only attribution/result/artifact/evidence ref만 receipt에
   남긴다. Official Done/mutation은 false다. Synthetic Executor effect는 관찰된 0이고 Hermes
   Adapter의 미측정 effect는 literal `UNKNOWN`이다. effect field는 nonnegative safe integer 또는
   literal `UNKNOWN`만 허용하며 `null`은 거부한다.

Focused evidence는 21/21, Hermes bot-submit Executor evidence는 16/16, 기존 Task Execution Core
evidence는 28/28, adjacent Agent
Observation evidence는 295/295다. 이 수치는 현재 통합 slice의 test evidence이며 live canary,
runtime wiring, persistent concurrency 또는 production readiness 증거가 아니다.

### Adapter 순서와 중단선

첫 임시 canary transport는 별도 승인된 Codex Linear connector와 feature-OFF bounded Hermes
default command runner다. 주입형 `runCommand`는 trusted test seam일 뿐 production evidence가
아니며 live canary는 반드시 default runner를 사용해야 한다. Windows에서는 direct child kill만
best-effort로 관찰했고 descendant process-tree 종료는 미확정이므로 host timeout은 항상
`HERMES_TIMEOUT_UNKNOWN`으로 둔다. Connector readback은 transport/observation receipt일 뿐 Task, organization,
assignment 또는 result authority가 아니다. 구조 GREEN 이전이나 exact Bot/session binding이 없는
상태에서 live issue를 만들거나 Hermes로 dispatch하지 않는다.

영구 adapter는 Soulforge-owned candidate ingress/Linear transport, versioned organization
Role/Capability source, Hermes Executor transport, durable ledger, scheduler와 writer/projection
surface로 분리한다. 다음 항목은 구현하지 않았고 계속 `HOLD`다.

- live Linear adapter와 `AI 실행 후보` label create/apply
- live Role/Capability source binding
- Hermes Executor/dispatch와 exact session binding
- persistent claim/run/decomposition/receipt ledger와 multi-process fencing
- scheduler, writer cutover, automatic assignment
- 4192 result/delivery/attribution projection
- Official Task Done 승인 또는 외부 effect

# Task Execution Core POC — 다음 결정

- 상태: `owner_review_needed / operational_observation_pending`
- 목적: Chat에서 실제 업무를 운영하며 확인해야 할 질문만 남긴다.
- 한계: 아래 항목은 확정 규칙이 아니며 실제 Linear 쓰기 또는 자동 실행을 승인하지 않는다.

## 1. Linear Work Brief의 immutable revision은 무엇으로 식별할 것인가?

- 결정 질문: Linear의 어떤 field 조합과 canonicalization으로 `WorkBriefRevisionRef.revision_id`와
  digest를 만들고, 본문·attachment·comment 변경 중 무엇을 새 revision으로 볼 것인가?
- 실제 운영에서 볼 것: 업무지시 수정 빈도, 수정 위치, 실행 직전/직후 편집, 같은 Task의 재작업 패턴.
- 결정 전 기본값: provider가 고정한 revision ID와 digest가 없으면 dispatch하지 않는다.

## 2. 실행 Gate와 외부 효과 Gate의 authority owner는 누구인가?

- 결정 질문: 누가 `authority_ref`를 발급하며, 로컬 분석 실행 승인과 메일·Slack·공유권한 같은 외부
  효과 승인을 분리할 것인가?
- 실제 운영에서 볼 것: manager 결정이 필요한 작업 종류, 기존 승인 흔적의 위치, 대리 승인 가능 범위.
- 결정 전 기본값: 명시적 실행 Gate가 없으면 실행하지 않고, 외부 효과는 항상 0으로 유지한다.

## 3. Waiting 해소 뒤 같은 AgentRun을 resume할 것인가, 새 run을 claim할 것인가?

- 결정 질문: reply/필요 입력을 어떤 event와 revision으로 결속하고, 기존 operation을 재개할지 새
  idempotency key로 다시 실행할지 누가 결정하는가?
- 실제 운영에서 볼 것: Waiting 답변 경로, 평균 대기 시간, 답변 중 Work Brief 변경 여부,
  `next_action_owner` 인계 패턴.
- 결정 전 기본값: 기존 SQLite `TaskExecutionCore` POC에서는 Waiting이 활성 run으로 남아 새
  claim을 막고 자동 resume하지 않는다. 별도 in-memory `CandidateExecutionCoordinator`는
  Waiting/HOLD에서 performing-agent slot을 해제하고 coverage custody를 유지하며, latest
  Waiting/HOLD receipt에 exact 결속된 새 successor attempt만 허용한다. 어느 쪽도 live resume
  운영정책이나 persistent recovery를 승인하지 않는다.

## 4. AgentRun succeeded 뒤 Official Task Done은 누가 어떤 조건으로 승인하는가?

- 결정 질문: 완료조건, artifact/evidence, 외부조치, 후속조치를 누가 검토하며 어느 증거로 Linear Done
  writer를 별도 승인할 것인가?
- 실제 운영에서 볼 것: 실행 성공 후 추가 검토가 필요한 사례, Done 되돌림, 후속 Task 생성 패턴.
- 결정 전 기본값: `succeeded`는 실행기 결과일 뿐이며 `official_task_done=false`를 유지한다.

## 5. Linear와 dev-ERP 중 Official Task current-state owner는 누구이며 Event Ledger는 어디에 두는가?

- 결정 질문: 현재 운영지침의 Linear Official SoR와 public lifecycle 후보의 dev-ERP `core_item`
  target 중 무엇을 current-state 정본으로 둘지, 다른 쪽을 projection/mirror/migration target 중
  무엇으로 볼지, 단일 writer·ID/status crosswalk·conflict reconciliation·cutover 기준을 어떻게 정할 것인가?
- 함께 결정할 것: POC table을 폐기하고 기존 dev-ERP event surface에 합칠지, 별도 execution
  ledger로 유지할지, Linear snapshot·AgentRun·Receipt·Context/Evidence를 어떤 키로 reconcile할지.
- 실제 운영에서 볼 것: 필요한 조회 단위, 보존 기간, task별 run history, 상태 충돌, cross-PC 복구,
  `core_item`/event reader와 중복되는 field.
- 결정 전 기본값: Linear와 dev-ERP task writer를 모두 열지 않고, `_poc` SQLite를 production DB에
  migration하지 않은 채 feature-OFF 격리를 유지한다.

## 6. Candidate prefilter와 live organization source는 누가 소유하는가?

- 현재 확정 경계: GPT/ingress `AI 실행 후보`는 prefilter marker일 뿐이다. Codex Linear
  connector의 create/read 결과도 transport/observation receipt이며 Role, Capability, assignment,
  execution 또는 completion authority가 아니다.
- 결정 질문: permanent ingress/Linear adapter가 exact Official Todo, Work Brief revision과 marker를
  어떤 immutable source receipt로 만들고, versioned Role/Capability snapshot을 어떤 organization
  owner가 공급·폐기·갱신할 것인가?
- 결정 전 기본값: label creation/application과 live Role/Capability source binding은 `HOLD`다.
  저장소의 matcher에는 합성 prevalidated snapshot만 넣는다.

## 7. 첫 Hermes Executor와 persistent coordinator owner는 무엇인가?

- 현재 확정 경계: 첫 임시 canary transport 후보는 별도 승인된 Codex Linear connector와 향후
  독립 검토된 bounded Hermes command다. 현재 public 저장소에는 Hermes Executor/dispatch adapter,
  exact live session binding 또는 canary receipt가 없다.
- 결정 질문: permanent Hermes Adapter가 exact Bot/session, timeout/fencing, result/delivery ref를
  어떻게 결속하고, claim/run/decomposition/receipt ledger와 multi-process slot을 어느 durable
  store와 sole coordinator가 소유할 것인가?
- 결정 전 기본값: in-memory process 하나의 합성 behavior만 인정한다. Hermes dispatch,
  persistent ledger, scheduler와 automatic assignment은 `HOLD`다.

## 8. Task writer와 4192 projection은 어떤 gate 뒤에 연결하는가?

- 결정 질문: Official Done과 external effect를 계속 별도 승인하면서 어느 accepted P5→P8/P9
  receipt 뒤 writer cutover를 허용할지, 4192가 result/delivery/attribution을 어떤 ledger ref로
  읽고 connector self-report를 authority로 오해하지 않게 할지 정해야 한다.
- 결정 전 기본값: writer cutover, Linear/dev-ERP mutation, 4192 result projection과 live canary는
  모두 `HOLD`다. Coordinator receipt는 `official_task_done=false`,
  `official_task_mutated=false`, external effects 0을 유지한다.

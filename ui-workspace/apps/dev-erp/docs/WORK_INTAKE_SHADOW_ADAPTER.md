# 업무 발견 Shadow 합성 어댑터

이 app-local 조각은 범위가 고정된 Gmail 사건과 현재 Linear 관측을 받아 비정본 후보,
판단·노출 기록, 비교용 평가를 연결한다. 실제 reader·모델·발송·Forge·서버·예약에는
연결하지 않았다. 모든 호출과 저장의 provenance는 `synthetic`이다.
현재 결과는 합성 계약 검증이며 실제 업무 발견률·모델 성능·사용효과의 증거가 아니다.

## 진입점과 사용 순서

| 모듈 | 진입점 | 반환/역할 |
|---|---|---|
| `work_intake_documents.mjs` | `validateWorkIntakeDocuments({action, manifest, documents})` | 역할별 문서 ID·판본·필수 절·권한 ref 검증 |
| `work_intake_adapter.mjs` | `runWorkIntake(input, {judge})` | 주입된 합성 judge와 검증된 사건/Linear 관측으로 immutable 결과 |
| `work_intake_store.mjs` | `createWorkIntakeStore({directory, repositoryRoot, project_ref})` | 명시적으로 준비된 별도 합성 control 디렉터리의 영속 기록 |
| `work_intake_evaluation.mjs` | `evaluateWorkIntakeRun(run, evaluationInput)` | 별도 작성된 합성 기대결과와 판정 비교 |
| 같은 평가 모듈 | `compareWorkIntakeEvaluations(reports, {vary_dimensions})` | 동일 source snapshot/case set 비교; 변경 차원 명시 필요 |

최소 연결은 문서 검증 → `runWorkIntake` → `store.commitResult(result)` →
`evaluateWorkIntakeRun` → `store.commitEvaluation(evaluation)` 순서다.
평가가 실패해도 이미 저장된 실패 시도/판단은 삭제하지 않는다.
`store.inspect()`는 재시작 후 판단 capsule, 회차 영수증, cursor, 노출 확인 상태,
평가 보고서를 반환한다. `store.close()`로 닫는다. 외부 결과 객체를 복사하거나
JSON으로 조작하면 in-process brand가 사라지므로 신규 저장/평가 요청으로 받지 않는다.
저장 후 재시작 시에는 core cycle을 다시 검증하고 장부를 재구성한다.

실행 가능한 연결 예시는 `test/work_intake_integration.test.mjs`와
`test/work_intake_test_helpers.mjs`에 있다. 테스트 helper는 공개 안전한 합성 문장만
포함하며 실제 자료의 sample이나 승인된 운영 binding이 아니다.

## 입력과 분류

- 입력의 필드 목록은 adapter의 `INPUT_KEYS`, `READ_KEYS`, `EVENT_KEYS`, `LINEAR_KEYS`가 소유한다.
- action은 `hourly_intake`, `source_index`, `backlog`를 구별한다. 역할별 필수 문서와
  필요한 절을 manifest에서 지정한다. Queue 표식이나 버전을 다른 문서에 복제하지 않는다.
- 기본 Shadow의 Gmail+Linear 필수 읽기, `live_only`, A0 effect0 계약은 그대로 소비한다.
  여기서 내부 cycle의 `live_only`는 합성 입력이 시험하는 기존 계약 모드다.
  outer `synthetic`을 떼어 실제 live 관측으로 주장할 수 없다. `live`와 `replay` 입력은 보류한다.
- source/scope/event/revision, 원본 SHA256, 발생·관찰시각, project 결속 ref, 검색창과
  source coverage, Linear 현재 상태/범위를 명시한다. 수신이 늦은 자료는 관찰창으로 선택하고 발생시각을 보존한다.
- 의미 분류는 주입된 judge에 맡긴다. 키워드 분류기는 없다. 현재 허용되는 receipt는
  `SCRIPTED_SYNTHETIC`뿐이다. 실제 provider/model 판본·읽기권한·원본 bytes hash 증명 포트는 미결속이다.
- NEW는 새 목표 후보, FOLLOW_UP은 열린 공식 업무의 후속, EVIDENCE는 기존 업무의 근거,
  NO_ACTION은 새 행동 없음, HOLD는 불충분/실패다. 기존 업무와 일치하는 NEW,
  존재하지 않는 업무의 후속, 완료된 업무의 FOLLOW_UP, 범위 밖 근거를 거부한다.
- 부분조회·미조회·접근불가·파싱실패·구본·반증·불명판본·project 불명·자기 echo를 별도 reason으로 보존한다.
  필수 출처 실패는 관련 판단/cursor를 중지하고 실패 시도를 분모에서 제거하지 않는다.
  선택 출처 실패는 독립된 필수 출처의 의미 판정을 자동 취소하지 않는다.
- facts의 텍스트는 bounded 합성 judge 입력으로만 사용한다. 저장 결과에는 텍스트 대신
  입력 fingerprint·판본 hash·locator refs·enum·의미 digest·판정 receipt를 남긴다.

## 동일성, 정정과 저장

| 값 | 의미 |
|---|---|
| `event_revision_sha256` | caller가 고정한 원본 source 판본의 hash; 의미 변화와 동일하지 않음 |
| `input_sha256` | run ID와 문서 검증을 포함한 실제 입력 fingerprint |
| `snapshot_sha256` | source·Linear·권한·기간을 고정한 비교 기준; run ID/통제할 문서 정책 차원은 별도 |
| `task_identity` | project와 judge가 제시한 목표 의미 hash의 결합; 공식 Task ID/수락 권한 아님 |
| `semantic_digest` | 분류·목표·행동의 의미판본; 원본 bytes 변경과 별도 |
| 노출 키 | project·목표·의미판본·수신자·목적지; 원본이 바뀌어도 의미 같으면 반복 억제 |

`event.correction`은 null 또는 `{supersedes_cycle_ref, category}`다. 정확한 이전 cycle과
기존 core의 correction category가 필요하며, 없는 대상을 정정하면 해당 회차의 판단을 적용하지 않는다.
명시 정정이 없어도 나중의 상충/실패 관측은 이전 후보의 노출을 막는다.
이 검사는 정식 업무 수락이나 source 정본 승격을 만들지 않는다.

새 store의 source cursor는 null에서 시작한다. 관측된 `before`가 저장 cursor와 같아야
`after`를 적용한다. 판단·실패 시도·cursor는 SQLite FULL synchronous transaction으로 묶인다.
cursor 충돌·구관측·판정그룹 실패는 기록하되 활성 후보로 적용하지 않는다.
같은 run ID와 같은 전체 결과는 replay, 같은 ID의 다른 입력/판정은 conflict다.
실패 후 재시도는 새 run ID를 사용한다. 무제한 보관/복구 정책은 이 조각의 범위가 아니며
10,000회 한도를 넘으면 중지한다. DB 접근을 독점하는 운영 보안/DR 주장은 하지 않는다.
일반 JSON 실패는 입력 fingerprint와 함께 저장한다. 순환 객체·accessor·exotic 값처럼
안전하게 읽고 fingerprint할 수 없는 프로그래밍 입력은 입력 단계 HOLD만 반환하며
영속 시도 분모에 포함하지 않는다. 관측하지 못한 원본 hash를 만들어 채우지 않는다.

## 노출과 ACK 불명

`reserveExposure({attempt_ref, recipient_ref, destination_ref, permission_ref, observed_at},
{checkAccess})`는 해당 immutable 요청의 digest와 결속된 현재 접근 확인을 요구한다.
예약이 먼저 `ACK_UNKNOWN`으로 영속화되며 실제 발송은 하지 않는다. 확인 불명 상태에서는
자동 재예약/재전송하지 않는다. 서로 다른 store 인스턴스도 같은 키를 중복 예약할 수 없다.

`reconcileExposure({exposure_key, reservation_ref, state, evidence_ref, observed_at},
{verifyReadback})`는 exact 요청 digest에 대한 별도 확인 포트를 요구한다.
state는 `ACKNOWLEDGED`, `NOT_DELIVERED`, `ACK_UNKNOWN`이다.
현재 예약의 미전달이 확인된 경우만 새로운 예약을 허용한다. 이전 예약의 ACK/미전달
응답으로 새 예약의 상태를 바꾸지 않는다. 실제 전달 adapter와 권한 포트는 미결속이다.

## 평가와 한계

합성 기대결과는 별도 작성자 ref, frozen timestamp, source snapshot hash, development/evaluation
partition을 요구한다. 이 선언만으로 실제 사람 gold가 되지는 않는다. 전체 시도 → 읽기 실패 →
판정 가능 → 후보 → 채택 → 실행 → 검증 → 사용의 분모와 UNKNOWN을 유지한다.
receipt self-readback의 REQUIRED/PENDING/PASS와 business effect 확인, HOLD 기록 성공을 구별한다.
Issue 생성 수나 PASS 문자열로 사용효과를 만들지 않는다. 비용·토큰은 관측 ref가 없으면 UNKNOWN이다.

기존 `shadow_evaluator`의 평가와 이번 정확 분류/과잉보류/미탐/잘못된 과제/반복노출을 함께 보여준다.
저장 실패/충돌 여부는 평가 점수와 별도다. 비교는 같은 입력/케이스로 고정하며 정책·문서·모델·prompt
차이는 `vary_dimensions`에 명시해야 한다. 실제 Chat 결과나 과거 replay를 live로 변환하지 않는다.

P4 합류는 기존 `createFeedbackRequestProvider({resolveRequest,currentAuthority,now})`의
`prepare(item)`/`authorize(action,item,execution)`를 그대로 소비한다.
발견 결과는 source/scope/revision/result/echo 관측의 공급자일 뿐, 공식 위임 packet이나
현재 authority assertion을 발급하지 않는다. P4가 부르는 `semantic_sha256`의 의미는
그 provider 계약이 소유하므로 본 adapter의 의미 digest로 무조건 치환하지 않는다.
Forge의 `accepted_context_ref`/`engine_finding_refs` 필수 조건도 바꾸지 않았다.

## 검증

저장소 root에서 `node --test ui-workspace/apps/dev-erp/test/work_intake_*.test.mjs`를 실행한다.
기존 core 회귀는 `npm --prefix ui-workspace/apps/dev-erp run validate:voice-first-shadow`,
UI 필수 검사는 `npm run ui:done:check`다. Node의 내장 SQLite를 사용하며 기존 앱과 같은
Node 실행 환경을 따른다. 실제 source/model/cost/utility/배포 검증으로 확대하지 않는다.

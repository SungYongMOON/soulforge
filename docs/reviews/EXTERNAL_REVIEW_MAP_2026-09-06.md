# External review map — 2026-09-06 (GPT cross-review: EXT-19–34, CE-06)

Status: `reference_only`. Nothing in this file is canon. On 2026-09-06 the Owner
pasted two GPT replies: one continuing the 09-05 product-planning cross-review
(EXT-19–34), one from the external execution-plan advisory thread delivering a
synthetic training-corpus package (CE-06). This map records the 총괄(Owner
위임)의 판정 for both, continuing the key table in
[`EXTERNAL_REVIEW_MAP_2026-09-05.md`](EXTERNAL_REVIEW_MAP_2026-09-05.md) §5–§6
(EXT-01–18, CE-01–05).

Owner of this folder: `docs/reviews/README.md` (non-canon review records). Canon
owners are unchanged: `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`.

기준 커밋: `d0f95448` (main, 2026-09-06). The disposition column reflects a
decision, not a landed change; see the 상태 column for what has and has not
been applied in this repository.

## 1. EXT-19–34: reply to the product-planning cross-review

These sixteen findings answer GPT's review of the 작업대(요청 접수)·소나 인텔
관측 신호·선행조건 설계 draft (v1/v2 사본, non-repo brief and spec documents —
cited here as `<handoff package>` since neither the brief nor the spec is
tracked in this repository). None of the 반영 위치 cells below are repository
paths unless marked otherwise; they name the section of the non-repo document
the disposition lands in, for when that document is committed.

| Key | GPT 지적 | 판정 | 우리 대응 | 반영 위치 | 상태 |
| --- | --- | --- | --- | --- | --- |
| EXT-19 | 로드맵 2-2·3-4 세 창의 범위가 불명확 | 정정 수용 | 작업대(2-2) 범위 = 생성·수정 요청 + 후보 판본·진행·근거 조회. 3-4 = 관계·감시·문의 이력 투영. 발송은 1-5 승인 경로가 맡는다 (작업대는 발송 권한이 없다). | `<handoff package>` — 로드맵 2-2/3-4 행, 작업대 명세 §5·§6 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-20 | 2-2 요청서에 쓰기 권한이 딸려 있는 것처럼 읽힘 | 정정 수용 | 새 계약 문서 `CONTRACT_INTAKE_RUNE_BINDING_V0`을 세운다: 요청자·과제·Rune 업무·입력 revision·Blueprint 판본을 한 요청서에 결속하고, 서버가 그 결속을 매번 재검사한다. 요청서 자체에는 Task 생성·수락·승격·발송 권한이 없다. 결속이 안 되면 `UNMAPPED_WORK_CANDIDATE`. | `<handoff package>` — 계약 문서(작업대 lane 커밋 1보다 먼저 고정) | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-21 | 2-1 "폐건물" 판정 기준이 근거 없이 계산될 수 있음 | 정정 수용 | 관측이 충분하고 신선할 때만 계산한다. 승인 보류 항목과 아직 도래하지 않은 단계는 제외하고, 자동 로그만으로는 세지 않는다. 근거가 부족하면 판정하지 않고 `UNKNOWN`(안개)으로 둔다. 14/30/60일 문턱은 확정 규칙이 아니라 운영 가설로만 표기한다. | `<handoff package>` — 작업대 명세 §5d | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-22 | 3-1~3-4 소나 인텔 예측이 관측 편향을 감출 수 있음 | 정정 수용 | 명칭을 "예측"에서 "공개자료 기반 관측 신호 점수"로 바꾼다. 점수마다 근거·관측시각·소스 커버리지·미확인 여부를 함께 적고, 관측되지 않은 사건을 0점으로 바꿔치지 않는다. 중복 사건 병합, 소스별 커버리지, 날짜, 결측을 점수보다 먼저 표시한다. | `<handoff package>` — 설계 §4·§6 지표 정의 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-23 | 1-1~1-5·2-1~2-3의 선행조건이 한 단위로 묶여 있음 | 정정 수용 | 표시·접수·모델 호출·실자료 연결·발송 다섯을 서로 다른 행동으로 분리해 활성화한다. 각 행동은 자기 권한과 자기 시험 증거가 있을 때만 켠다(다른 행동이 켜졌다고 같이 켜지지 않는다). | `<handoff package>` — 설계 §7 구현 순서 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-24 | 1-1 변형 B가 무엇을 실제로 켰는지 불명확 | 정정 일부 수용 | 최소 플래그(`-EnableMcp -EnableMcpReviewRead`)만 켰음을 영수증으로 기록한다 — 이 두 플래그는 이미 이 저장소에 존재한다(CHANGELOG.md, `ui-workspace/apps/dev-erp/docs/RUNTIME_MAINTENANCE_RUNBOOK_20260618.md`; 활성화 영수증은 `local-recovery/erp-019-cutover-20260906/`, private). GPT가 요구한 롤백 검증(이전 팩·바인딩·데이터 호환)은 runbook에 "전환 수락 조건" 절로 별도 추가한다 — 이 추가는 아직 하지 않았다. | 플래그 존재: `CHANGELOG.md`(09-06 항목), `ui-workspace/apps/dev-erp/docs/RUNTIME_MAINTENANCE_RUNBOOK_20260618.md`(기존, 이번 커밋 아님). "전환 수락 조건" 절: `<handoff package>` | 플래그는 기존 커밋에 있음(이 커밋 아님); runbook "전환 수락 조건" 절은 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-25 | 4-1 D36 합성 투영이 운영 승격과 섞여 보임 | 동의 | 합성 투영·시험 채택과 운영 writer 활성화·정본 승격을 서로 다른 결정으로 기록한다. | `<handoff package>` — 브리프 §9(이미 그렇게 반영됨, non-repo) | 브리프 §9에 기록됨(repo 미반영); 운영 writer 활성화·정본 승격은 D36 gate 통과 뒤 별도 결정 |
| EXT-26 | 2-2 작업대가 Vigil 탭과 같은 것인지 불명확 | 동의 | 작업대 = Vigil(포트 4192) 탭 위에 얹힌 접수 창이다. 접수 외의 권한(감시·집행·수락)은 그대로 기존 소유자에게 남긴다. | `<handoff package>` — 계약 §5 | 코드 변경 없음(권한 이관 자체가 없으므로); 표기 정합만 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-27 | 2-1과 2-2를 동시에 만들면 순서가 꼬일 수 있음 | 정정 수용 | 방·업무·산출물 연결과 요청·상태 계약(= EXT-20의 `CONTRACT_INTAKE_RUNE_BINDING_V0`)을 먼저 고정한 뒤 병행한다. 조회 → 접수 → 후보 조회 세 경로를 통합 시험으로 함께 검증한다. | `<handoff package>` — 작업대 명세 §5·§6 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-28 | 설계 §2·§6에 있는 기능이 실제 담당 모듈과 연결되어 있지 않음 | 정정 수용 | §6 부록의 후보 수정·판본·상태·근거·관계·문의 이력을 2-2(작업대)·3-4(관계·감시·문의 이력 투영) 담당 모듈과 명시적으로 연결하고, 그 연결 자체를 검증 대상으로 삼는다. | `<handoff package>` — 설계 §2·§6 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-29 | 설계 §3의 "유일한 쓰기"가 모든 단계를 한 권한으로 뭉뚱그림 | 정정 수용 | 접수·실행·후보 보관·수락·발송을 서로 다른 상태·권한으로 구분한다. `events.jsonl`은 원문·경로·비밀을 제외한 상태 투영만 남긴다(원문·경로·비밀 자체는 쓰지 않는다). | `<handoff package>` — 설계 §3 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-30 | 설계 §5d의 폐건물·복구 표시가 근거 없이 뜰 수 있음 | 정정 수용 | 요청 접수·수행 중·수락 완료 세 상태를 각각 영수증과 근거로만 표시한다(추정으로 다음 상태를 앞당기지 않는다). | `<handoff package>` — 계약 §6 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-31 | 설계 §5e의 12종 파츠 분류가 과도하게 세분화됨 | 동의(조건부) | 표시 투영으로만 한정한다(집행 권한을 만들지 않는다). 항목 ID·적용성·근거는 보존하고, 매핑되지 않는 항목은 `UNKNOWN`으로 둔다. 사전 규모는 이미 정정된 대로 task 250 + 특수 3(253이 아니다)을 그대로 쓴다. | `<handoff package>` — 설계 §5e | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-32 | 설계 §4·§6의 지표 8개가 기간·출처·결측을 표시하지 않음 | 정정 수용 | 지표마다 기간·출처·중복 처리 방식·결측을 표시한다. 과거 시점으로 검증되기 전까지는 확정값이 아니라 관측 신호로만 다룬다. | `<handoff package>` — 설계 §4·§6 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-33 | 설계 §7의 구현 순서가 로드맵 우선순위와 안 맞을 수 있음 | 정정 수용 | 로드맵의 위임 결정(총괄 위임)에 맞추고, 표시·접수·모델 호출·실자료 연결·발송 다섯을 나눠 각 단계의 선행 증거와 결합시험을 적는다. | `<handoff package>` — 설계 §7 | 반영 예정(작업대·어댑터 lane 커밋 1) |
| EXT-34 | §5f가 Owner 브리프 §15~§18과 어긋나 보임 | 정정 수용 | GPT는 §5f가 없는 v1 사본을 읽었다. v2 사본(Drive id `1gEZLWxTvxrQu7-ZP5jvJR7Tirtd-EGtX`)에는 §5f가 있다. 결론은 v1 검토와 동일하게 유지: 방(room)은 Rune이 결속한 Task Instance의 표시일 뿐이고, 슬롯·Step·Action은 참조이며, 결속이 안 되면 Task를 새로 만들지 않는다. | v2 사본 Drive id `1gEZLWxTvxrQu7-ZP5jvJR7Tirtd-EGtX` §5f (non-repo) | 재검토 요청만 함(회신 05 §c); repo 반영 대상 없음 — 결론 불변 확인 |

## 2. CE-06: training-corpus package (execution-plan advisory thread)

| Key | 내용 | 판정 | 총괄 답 | 반영 위치 | 상태 |
| --- | --- | --- | --- | --- | --- |
| CE-06 | 훈련 코퍼스 v0.1 수신: 합성 LAB01(SE 문서) · LAB02(FPGA/수신모듈 결함) · LAB03(보안 공격 시험); 평가자 정답은 `30_EVALUATOR_ONLY`로 분리; 공개 Source Index 10건 동봉 | 수신 기록 | 다음 판은 **C안**(공개 프로젝트 기반 + 가상 고객·계약·변경·시험실패·회의록 6개월 revision)으로 만든다. 회로/FPGA 합성 과제는 소나 수신기와의 유사성을 낮추기 위해 **산업용 DAQ·초음파 계측장치**로 바꾼다. 공개 기반 소스는 **OpenTitan UART**부터 쓴다. 사이클 T2a의 합성 source와 B1~B8 canary 절차는 LAB01·LAB03을 쓴다(LAB02는 이번 사이클에서 쓰지 않는다). | Drive `Soulforge_기획·검토/Secure_External_Work_Execution/40_CANARY_TESTS/Training_Corpus_2026-09-06` (non-repo, Owner 계정 전용) | 판단 완료(Q1~Q3); T2a 합성 source·B1~B8 canary(CE-01~05) 연결 설계는 반영 예정 |

## 3. 판정 요약

- EXT-19~34(16건): 동의 3(EXT-25, EXT-26, EXT-31 — EXT-31은 조건부) · 정정 수용 12(EXT-19, 20, 21, 22, 23, 27, 28, 29, 30, 32, 33, 34) · 정정 일부 수용 1(EXT-24).
- CE-06(1건): 수신 기록. 반박이나 채택 거부는 없다.
- 이 표에 적힌 "반영 위치"는 대부분 이 저장소 밖의 브리프·명세·설계 문서(`<handoff package>`)를 가리킨다. 저장소 안에서 실제로 바뀐 것은 EXT-24의 플래그 존재 확인(기존 커밋)뿐이며, 그 외에는 코드·설정 변경이 없다. "반영 예정"은 다음 작업대·어댑터 lane 커밋 1에서 이 판정을 그 non-repo 문서와 이 저장소 양쪽에 반영한다는 뜻이다.

## 4. Rules that stay in force

- 이 폴더는 비정본이다. 판정은 참고이고, 정본 반영은 `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`가 정한 owner 문서에서만 일어난다.
- `<handoff package>`로 표시된 반영 위치는 이 저장소에 없는 문서를 가리킨다. 그 문서가 커밋되기 전에는 이 표의 "반영 예정" 항목이 코드나 설정에 이미 적용된 것으로 읽지 않는다.
- 새 폴더 트리나 제2 정본을 만들지 않는다. 키는 EXT/CE만 쓴다.

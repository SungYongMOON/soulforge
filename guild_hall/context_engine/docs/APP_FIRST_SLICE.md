# APP 첫 slice — 실제 구현 집중과 독립 v1 query

> 보존 기록: 이 문서는 후보 브랜치(로컬 tag `codex/cleanup/20260911/context-manager`, `c6c5870c`) 기준이다.
> 2026-09-12 main 통합에서는 dev-ERP 연결(원위치 호환 export, caller import 교체, 행보관 `--accepted-context`)을
> CTX-S0-G2로 보류했다. main의 dev-ERP는 HPP 팩 명세를 바꾸지 않도록 기존 `accepted_context_*` 사본을 그대로 쓰며,
> 아래의 "원위치 호환 export", caller 표, APP1-G1의 export identity는 main에서는 성립하지 않는다.
> main의 `app_boundary` 시험은 옛 dev-ERP 사본의 공개 이름·종류·상수·거부 응답이 APP과 같은지만 확인한다.

Owner 계획 v0.7 §19.18의 고정 home과 책임을 적용한다. 이 문서는 구현 집중의
범위와 재현 경계를 설명하며 전체 APP/운영 완료를 주장하지 않는다.

## 실제 구현 위치

| 이전 dev-ERP src 파일 | 실제 APP 구현 |
| --- | --- |
| accepted_context_query.mjs | src/guards/accepted_context_query.mjs |
| accepted_context_reader.mjs | src/runtime/accepted_context_reader.mjs |
| accepted_context_typed_memory.mjs | src/guards/accepted_context_typed_memory.mjs |
| accepted_context_pack.mjs | src/runtime/accepted_context_pack.mjs |
| accepted_context_synthetic_runtime.mjs | src/adapters/accepted_context_synthetic_runtime.mjs |
| accepted_context_project_runtime.mjs | src/adapters/accepted_context_project_runtime.mjs |

원위치에는 호환 export만 남았다. APP이 이전 구현을 다시 export하는 facade가 아니다.
`src/app.mjs`의 공개 factory/CLI가 실제 APP adapter와 공통 검사를 조립한다.
기존 입력·default-off·팩 출력 계약을 유지하며 출력에 조합 필드를 더해 T4 digest를 바꾸지 않는다.

실제 기본 알고리즘 연결:

- preparation/pinned_pdf_v1: 기존 shared PDF extractor에 승인된 bytes/hash와 명시 profile 전달.
- representation/accepted_typed_v1: 검증된 membership/typed record의 결과 투영.
- retrieval/bm25_v1: 권한 검사 후 공급된 문서 chunks에 기존 shared BM25 실행.
- memory/ranked_decision_v1: 기존 결정·제약·정정 우선 비교 및 source 순서.
- assembly/bounded_pack_v1: 검증된 fact/evidence 조립.

ACL/project/currentness/source 검증, 충돌 proof 우선, 최종 evidence/path/read/문자 상한은
공통 src가 소유한다. `profiles/default_v1.mjs`는 위 실제 export ID와 비교되는 기본 조합이다.
아직 외부 전략 registry, 임의 코드 injection 또는 두 번째 전략을 도입하지 않았다.

## Harness와 caller

다음 실제 test body를 `tests/`로 옮겼다: accepted_context_query/reader 및
context_memory_t0/t1/t2/t3/t3_timing/t4/t4_report/t5/t5_parallel_io/t5_restore_boundaries.
실험/보고의 실제 body는 `harness/`의 context_memory_harness, context_memory_baseline,
context_memory_t4_experiment, context_memory_t4_report, context_memory_t5_report에 둔다.
합성 accepted/read/T2/T3/T5 fixture와 PDF 생성기는 `harness/fixtures/`에 둔다.
기존 위치는 명령/개발자 import 호환 진입점이며 독립 시험으로 중복 계수하지 않는다.
고정 source/gold/원답안은 기존 `docs/architecture/workspace/examples/context-memory`에 남는다.

다음 caller는 등록 모듈 ID로 가장하지 않는다.

| 실제 caller | 공개 API와 검사 |
| --- | --- |
| ui-workspace/apps/dev-erp/server.mjs | createContextEngineRuntime; accepted_context_http.test.mjs의 실제 서버/로그인/default-off |
| src/accepted_context_http.mjs | makeUniformNotAvailable; 세션·same-origin은 ERP adapter 소유 |
| src/work_intake_context.mjs | createAcceptedContextReader; work_intake_context.test.mjs의 실제 RUNE pass |
| tools/haengbogwan_context_packet.mjs | accepted-context 분기만 APP factory에 위임; legacy Store/mail 경로 보존 |

`dev_erp_task_execution_surface`는 Candidate Execution 범위를 그대로 유지한다.
새 APP은 shared/product_id:null이고 등록된 caller declaration이 없어 catalog caller 목록은 빈다.
module-operability/catalog 검사를 약화시키지 않는다.

## 실제 dependency와 source-to-context

APP의 required dependencies는 engineering_engine, path_registry, rag, shared와
RAG의 실제 정적 import로 함께 필요한 knowledge_access다. 공통 validator/RAG/SE/RUNE
소유 코드를 복사·이관하지 않는다. exact file closure와 dependency manifest 버전은
`release/runtime-closure.json`에 기록한다. knowledge_access 코드의 포함이 ledger 쓰기 권한은 아니다.

| 단계 | 현재 증거/한계 |
| --- | --- |
| source 읽기·PDF 추출 | 실제 pinned PDF/body/table/locator/digest, APP preparation adapter 경유 |
| 의미 후보 생성 | 준비된 accepted typed records를 읽음. 일반 자연어 자동 후보 생성 미구현 |
| 관계·판본 검사 | 기존 shared candidate/acceptance/identity와 APP common guards 재사용 |
| 검토·수락 | 기존 수락 snapshot을 조회. harness의 합성 승인을 운영 승인으로 옮기지 않음 |
| 지속 갱신 | APP의 승인 snapshot→새 derived generation update는 다음 필수 slice. T5 helper의 NO_OP rebuild를 대체 완료로 부르지 않음 |
| 조립 | 실제 APP public entry→reader/BM25/memory/assembly→bounded pack |
| RUNE 소비 | 기존 ERP RUNE caller의 integration test; 설치된 운영 RUNE 전환 아님 |

T5 helper의 frozen T4 읽기, interpreter-only cache, 합성 actor/SE/receipt 생성과 domain assertions는
runtime에 옮기지 않았다. 현재 synthetic adapter의 평가 HOLD/4 receipt 가정도 generic update
계약으로 승격하지 않는다. source custody·SE accepted bytes·canonical lineage·30의 수락/정정
기록은 재생성 원본이며 파생 projection과 함께 삭제하거나 다시 쓰지 않는다.

## 첫 slice 검증 gate

아래 validator의 expected exit는0이며 status는 실제 task receipt에서 확정한다.
작성자 구현/검사와 manager의 fresh independent review를 구분한다.

| gate_id | outcome | validator / structured expectation | owner |
| --- | --- | --- | --- |
| APP1-G1 | 실제 본문 집중·호환 | app_boundary.test.mjs; default-off·export identity·실제 query 동등 | implementation |
| APP1-G2 | 공통 검사 보존 | APP tests와 외부 HTTP/RUNE/CLI 관련 tests; denied body0·기존 결과 | implementation |
| APP1-G3 | runtime 역의존 차단 | app_boundary.test.mjs + runtime closure; harness/gold/ERP import0 | implementation |
| APP1-G4 | 정확한 등록·deps | 기존 module-operability/product-composition + verify_module.mjs; 신규 context_engine1개만 | implementation |
| APP1-G5 | exact tracked lane | 기존 build_source_lane CLI;3receipt·listed byte hash 일치 | implementation |
| APP1-G6 | 독립 설치 query | verify_installation.mjs; own cwd·checkout read denied·state/설치 writes denied·same pack digest | implementation |
| APP1-G7 | 고정 평가 보존 | 기존 T4 freeze/report hash·format guards; 데이터 diff0 | implementation |
| APP1-G8 | 최종 판단 | fresh V와 manager 통합; 독립 검토 없는 production 주장0 | manager |

## 이어서 해야 할 같은 목표의 필수 gate

1. 승인 source snapshot과 별도 검증된 accepted-record snapshot에서 **전체 대상**의 새 derived
   generation을 만든다. T4/helper/gold fallback 금지. 미지원/실패/검토대기 coverage를 계수한다.
2. 행동이 다른 두 전략을 같은 public query에서 실행하고 producer/parser/chunking/representation/
   traversal/memory/assembly/code/config/harness pins를 분리한다. 라벨만 바꾸는 교체는 불충분하다.
3. immutable generation과 기대 prior/CAS·locking·현재 ACL·요청별 pin을 묶어 single current가
   검증된 code+data pair만 선택하도록 한다. in-flight/mixed/tampered/foreign 조합은 거부한다.
4. 별도 설치 v1→v2→v1에서 같은 caller 코드와 기존판 가용성을 유지하며 필요한 reload를 시험한다.
   source/수락/정정 기록은 그대로 두고 호환된 code+derived data를 선택해 rollback한다.
5. 고정 입력/답안을 유지하고 독립 판본의 revised harness로 old/new 응답을 공정하게 재평가한다.
   교체 가능성이나 출력 차이를 품질 채택으로 치환하지 않는다.

매니저의 한정 읽기 근거: shared/io.mjs의 atomic byte write는 재사용 가능하지만 CAS/lock/fsync/
request pin/ACL을 제공하지 않는다. private_target_binding_control_store_core의 Suite/9-target 계약과
workflow state adapter를 APP generic store로 복사·호출하지 않는다. 이 선례의 설치/전환 시험은
아직 수행하지 않았다. commit point 이전 실패와 성공 후 cleanup/readback 실패를 같은 HOLD로
해석하지 않도록 후속 negative gate에 포함한다.

전체 W7·historical query·실자료 canary·운영 활성화는 현재 제한 그대로 유지한다.

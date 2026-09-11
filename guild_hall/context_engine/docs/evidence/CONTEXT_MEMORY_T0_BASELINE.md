# World Tree 맥락·메모리 T0 시험 바닥

> 보존 기록: 이 문서는 후보 브랜치 `codex/context-memory-build`(로컬 보존 tag `codex/cleanup/20260911/context-manager`, `c6c5870c`) 제작 당시 `ui-workspace/apps/dev-erp/docs/`에 쓴 증거다. 2026-09-12 main 통합에서는 dev-ERP 연결(shim·행보관 `--accepted-context`)을 CTX-S0-G2로 보류했다. 시험 본체는 `guild_hall/context_engine/tests`에 있고, dev-ERP CLI를 거치던 T3–T5 시험은 APP CLI(`src/app.mjs`)를 쓰도록 옮겼다. 본문의 경로·명령은 당시 기준이며, dev-ERP 시험 래퍼를 가리키던 링크만 APP 위치로 고쳤다.

상태: 공개 합성 시험 구현·직접검증. 매니저의 fresh 독립검토와 통합 전이다.
제품 assembler, 운영 writer, 새 schema/workflow/canon 또는 실프로젝트 binding을 만들지 않았다.

## ASSUMPTIONS

- T0는 질문 24개의 명세를 유지하고 핵심 Q01/Q05/Q07/Q09/Q11/Q12와 Q02/Q03/Q21 경계만 실행한다. 나머지 15개는 후속 단계에서 실행한다.
- P-A/P-B/T-A1과 모든 source 본문은 공개 합성이다. source의 `state`는 현재 snapshot 상태이며 과거 시점 회수는 아직 실행하지 않았다.
- 시작 예산은 Unicode code point 12,000자 / 근거 12개 / 경로 6개 / 추가 원문 조회 2회이다. 토큰으로 환산하지 않는다.
- gold는 위임된 가역 시험 설계의 구체화다. Q03의 요구는 본문 없이 거부하는 것이므로 `HOLD`와 균일한 `NOT_AVAILABLE`은 동일한 거부 결과로 평가하고, envelope 일치 여부는 별도로 남긴다.

기획 기준은 `1eb064bf17a283ff1952de2d26b72274a0328130`, 실제 baseline 코드 HEAD는
`d8afb1090c8595b43482d3039a55df4a805beb22`이다. 통합계획 v0.1 §19.2–19.6의
SHA256은 `959114335d8358562f38a0bf50900aa848f30de028554786ff8cbecfce6dedc3`이며,
추가 결정 `SF-CONTEXT-MEMORY-PROGRESS-GATE-20260910`을 적용했다. 원문 재조사는 하지 않았다.

## 파일과 재현

- [runtime.json](../../../../docs/architecture/workspace/examples/context-memory/runtime.json): source 35개, 질문 24개, actor/purpose/시점/입력 source refs와 고정 예산. gold가 없다.
- [evaluation.json](../../../../docs/architecture/workspace/examples/context-memory/evaluation.json): 질문별 기대 상태·포함/제외 근거·rubric, 평가 전용 반례 5개.
- [digests.json](../../../../docs/architecture/workspace/examples/context-memory/digests.json): 두 JSON 파일의 정확한 byte digest와 source별 revision/locator/body digest. 변경 시 의도적으로 갱신하고 검토해야 한다.
- [context_memory_baseline.mjs](../../harness/context_memory_baseline.mjs): 기존 reader/query용 test-only 입력 변환. 합성 수락 snapshot/ACL/provider만 구성하며 gold를 import하지 않는다.
- [context_memory_harness.mjs](../../harness/context_memory_harness.mjs): fixture 검증, 일반 실행 입력 allowlist, 평가, JSON 보고. 후속 실행기는 `runSuite(fixture, execute)`의 `execute(input)` seam으로 연결한다.
- [context_memory_t0.test.mjs](../../tests/context_memory_t0.test.mjs): 입력·예산·oracle 경계와 실제 baseline 관측 회귀 검사.

저장소 루트에서 실행한다.

```text
node --test ui-workspace/apps/dev-erp/test/context_memory_t0.test.mjs
node ui-workspace/apps/dev-erp/test/context_memory_harness.mjs
```

첫 명령의 PASS는 **하니스가 실패를 정확하게 관측했다**는 의미도 포함한다.
두 번째 명령의 exit 0은 측정 완료이며 제품 질문 전체의 통과가 아니다.
보고는 모든 질문의 기대/실제, 누락·제외 ref, 측정값, 미실행 이유와 실행별 input/query/result digest를 포함한다.
실행 시간은 매 실행 측정하며, 고정 fixture 선택·query 결과 digest의 replay와 별도로 다룬다.

일반 실행기에 전달하는 값은 `fixture_id`, `request`, `budget`, `sources`뿐이다.
평가 파일과 숨긴 반례는 전달하지 않는다. 명시적 `mode: oracle`에서만 `oracle_refs`를
전달할 수 있으며 일반 모드의 oracle 전달은 거부한다. 파일은 평가 전용으로 분리했지만
동일 저장소에 있으므로 이것은 입력 누출 방지이며, 적대적 실행기에 대한 파일시스템 격리는 아니다.
자기검사를 blind 독립 의미평가로 부르지 않는다.

독립검토 후 oracle 조건 결속을 수정했다. oracle 허용 여부는 평가기가 고정한 실행조건으로
판정하며, 실행 결과의 `mode`가 다르면 `MODE_MISMATCH`로 평가를 거부한다. 일반 baseline에서
oracle 사용을 보고하면 `ORACLE_MISUSE`도 남기고 점수는 NOT_RUN으로 둔다. 실행기가
`mode: oracle`로 자신의 결과를 재분류할 수 없다. 해당 callback 재현 회귀시험을 포함한
T0 검사 17개가 통과했다(수정 전 추가 검사 2개 실패 확인).

## 실제로 연결한 경로와 범위

```text
고정 질문 → test-only 요청 변환 → createAcceptedContextReader
 → fresh pointer/source/ACL provider 관측 → createAcceptedContextQuery
 → metadata hits / status / cursor / digest → 평가 전용 비교
```

snapshot/receipt는 기존 query 시험의 구조를 재사용한 합성 입력이다. T0에서 실제
candidate acceptance gate를 통과시켜 만든 수락 이력이 아니며, 별도로 기존 기반 시험에서
candidate→acceptance→query 통합을 검증했다. fixture의 paragraph locator는 source 명세에
있지만 production reader는 source span/revision만 반환한다. **원문 해소·의미답변·실제 caller
설정·MCP·설치본 연결은 NOT_RUN**이다. `used_refs`는 `null`로 유지한다.

P-B 미끼는 합성 corpus에 포함한다. nominal P-A snapshot의 partition 구성은 시험 준비이며
실제 검색 전 필터 성능으로 계산하지 않는다. 별도 P-B 요청을 production reader/query에
넣어 거부와 accepted-bundle IO 0을 확인한다. 원문 body reader 자체가 없으므로 추가 원문
조회 0은 metadata-only 경로의 관측이며, 실제 원문 접근권한 통과의 증거가 아니다.

## 기존 코드·owner 대응표

| 요구 | 기존 owner / 실행면 | T0 재사용 또는 남은 것 |
|---|---|---|
| 프로젝트·사건·근거 관계 | `docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md`, Master Map M14 | 용어·source span 의미 재사용, typed 업무 의미 연결은 T1 |
| producer 근거·판본·시점 | `guild_hall/engineering_engine/core/validators/project_context_generation_candidate.mjs` | 기존 candidate 기반 시험 실행; 하니스는 exported digest 함수 재사용 |
| 수락·CAS·재생 | `guild_hall/engineering_engine/core/validators/project_context_acceptance_gate.mjs` | 기존 acceptance 기반 시험 실행; 새 writer 없음 |
| exact scope/actor/purpose/현재 membership 조회 | `src/accepted_context_query.mjs` → `createAcceptedContextQuery` | 실제 호출. 단일 `as_of`, `max_units`만 지원 |
| fresh provider·수락판본 재확인 | `src/accepted_context_reader.mjs` → `createAcceptedContextReader` | 실제 호출. metadata-only, body locator reader 없음 |
| Rune 소비자 | `src/work_intake_context.mjs` → `createWorkIntakeContextConsumer` | 기존 소비자 seam 확인; T0에서 file-backed 설정·typed packet 호출 NOT_RUN |
| 기존 맥락 꾸러미 | `tools/haengbogwan_context_packet.mjs` → `buildContextPacketForProject` | 다른 기존 경로. T0 reader baseline 성공과 합쳐 제품 성공으로 계산하지 않음 |
| 프로젝트 맥락 생성/재생 | `tools/haengbogwan_project_context.mjs` → `buildProjectContextPlan`, `runProjectContextRebuild` | owner 확인만. write/apply 호출 없음 |
| 담당자 기억 주입 | `src/store.mjs` → `memoryForInjection`, `retrieveMemoryItems` | 기존 project isolation 시험 실행. NULL 일반항목 호환은 프로젝트 사실 공유 허가가 아님 |
| 기억 장부 | `tools/memory_ledger.mjs` | import/export 실행 안 함; 운영 장부 변경 없음 |

`kernel/`의 해당 identity/generation export는 기존 core validator 호환 진입점이다.
위 도구의 존재만으로 live caller 지원을 주장하지 않는다.

## 질문별 관측

아래 기대는 평가 명세의 응답 의미다. `R`은 포함·제외 ref의 기계적 회수 평가이며,
`S`는 상태 의미 평가다. 모든 의미답변·utilization·prose rubric은 NOT_RUN이다.

| 질문 | 기대 | 실제 metadata 응답 | R / S 또는 다음 단계 |
|---|---|---|---|
| Q01 exact 업무 식별 | OK, S-TASK | OK, S-TASK | PASS / PASS; typed identity 답변 없음 |
| Q02 타프로젝트 미끼 | OK, S-TASK·S-CURRENT, S-LURE 제외 | OK, 해당 2개 | PASS / PASS; P-B 직접 요청은 거부 |
| Q03 권한 | 본문 없이 거부 | NOT_AVAILABLE, hit 0, bundle IO 0 | PASS / PASS; envelope 차이만 있음 |
| Q04 프로젝트 누락 | HOLD, fallback 없음 | NOT_RUN | T3 |
| Q05 최신 결정 | OK, S-CURRENT, S-OLD 제외 | OK, S-CURRENT | PASS / PASS; 결정문 생성 없음 |
| Q06 과거 결정 | OK, 당시 S-OLD | NOT_RUN | T1/T2 |
| Q07 폐기 결정 | OK, S-CURRENT만 | OK, S-CURRENT | PASS / PASS; 정정 설명 없음 |
| Q08 최신성 부족 | HOLD, S-STALE | NOT_RUN | T1/T2 |
| Q09 원문 위치 | OK, S-EXACT revision/paragraph:7 | OK, revision/span만 | PASS / PASS; locator 해소 미구현 |
| Q10 원문 없음 | NOT_AVAILABLE | NOT_RUN | T1/T2 |
| Q11 충돌 | HOLD, 양쪽 근거 | OK, S-CONFLICT-A/B | PASS / FAIL |
| Q12 coverage 부족 | HOLD, S-COVERAGE | OK, S-COVERAGE | PASS / FAIL |
| Q13 선행 관계 | OK, 검토된 관계만 | NOT_RUN | T3 |
| Q14 기존 업무·결과 | OK, exact 관계 | NOT_RUN | T3 |
| Q15 남은 약속 | OK, 미해소 약속 | NOT_RUN | T3 |
| Q16 절차 없음 | HOLD, workflow gap | NOT_RUN | T3 |
| Q17 실패 경험 | OK, 적용 가능한 실패 | NOT_RUN | T3 |
| Q18 기억 우선순위 | OK, 유효 결정·제약 | NOT_RUN | T3 |
| Q19 개인 선호 | OK, 선호/사실 구별 | NOT_RUN | T3 |
| Q20 기억 불필요 | OK, 추가 기억 없음 | NOT_RUN | T4 |
| Q21 예산·절사 | HOLD, 필수 충돌+detail 10개 | OK, 부록+충돌+detail 9개 | FAIL / FAIL |
| Q22 동일 입력 | OK, 결정론 결과 일치 | NOT_RUN | T3; 실행 9건의 개별 replay는 일치 |
| Q23 회수 후 오용 | 회수와 활용 분리 | NOT_RUN | T4; 평가 반례에서 R PASS / 활용 FAIL 검출 |
| Q24 절차 개선 목적 | OK, 다양한 성공·실패 | NOT_RUN | T4 |

실행 9건: R 8 PASS / 1 FAIL, S 6 PASS / 3 FAIL. 재조회 9건 동일.
출력 995–8,392자, 근거 0–12개, 경로 0개, 추가 원문 조회 0회. Q21은 count 한도는
지키지만 단순 span 순서 때문에 S-APPENDIX가 들어가고 S-DETAIL-10이 누락된다.
cursor는 있어도 의미 있는 제외 사유·필수 충돌 정책은 없다. 추가 반례로 네 예산 차원의
초과/계측 누락을 각각 거부하는 평가 검사를 실행했다. 하니스가 초과를 검출하는 것과
production reader가 전체 pack 예산을 강제하는 것은 별개다.

Q02/Q07의 무효 근거, Q12 부족을 부재로 꾸미는 반례, Q23 회수 성공/활용 실패,
일반 실행의 oracle 오용을 평가 전용 반례로 검출했다. 실제 모델 의미평가는 실행하지 않았다.
A 요청만/B 관련도 recall/C typed recall/D oracle 비교는 모두 NOT_RUN이다.
모델 호출 0; 실행기 요청은 Astra/medium, 실제 관측 모델·effort·tier·tokens·cost는 UNKNOWN이다.

## 직접검증과 남은 gate

| 실제 명령 | exit / 결과 |
|---|---|
| 신규 `node --test .../context_memory_t0.test.mjs` | 0, 17 PASS / 0 FAIL / 0 SKIP (oracle 검토 수정 포함) |
| 기존 query·reader·memory isolation·generation candidate·acceptance gate 5파일 `node --test` | 0, 55 PASS / 0 FAIL / 0 SKIP |
| `node .../context_memory_harness.mjs` | 0, 위 baseline 실패/NOT_RUN 측정 |
| `git diff --check` | 0 |
| `npm.cmd run ui:done:check` | 1, renderer-core의 `tsx` 미설치로 첫 validate 단계 중단. 후속 lint/docs/build/theme 미실행 |

UI 전역 gate의 의존성 실패는 이 T0 코드 실패와 분리하며 통과로 표시하지 않는다.
직접검사는 독립검토가 아니다. 독립검토는 매니저의 fresh task가 소유한다.
공유 CHANGELOG/색인 반영은 매니저 통합 범위이며 이 slice에서는 편집하지 않았다.

## T1에 넘길 정확한 다음 결함

1. Q09의 `source_span_ref + exact source_revision_ref`를 기존 source owner의 실제 locator 해소에 연결한다. 현재는 fixture에 locator가 있어도 query 출력에서 사용할 수 없다.
2. Q01 업무 identity, Q05/Q07 결정·정정, Q11 충돌, Q12 요청 coverage를 typed 근거와 결속한다. snapshot acceptance의 `coverage_complete`는 질문의 과거 전체 coverage를 보증하지 않는다.
3. `valid_at`/`known_at` 두 요청 시점을 현재 단일 `as_of`에 접는 제한을 해소할 최소 기존 계약 연결을 정한다. Q06은 그 전 실행 성공으로 표시하지 않는다.
4. 이후 T3가 위 typed 근거로 상태·설명·예산·제외 사유를 조립한다. 제품 코드 수정은 본 T0에 포함하지 않았다.

규칙 강화 체크: 오류와 미실행, 안전 거부의 envelope 차이와 실제 권한 실패를 분리한다.
새 전역 규칙은 추가하지 않았다. 지식 트리거 확인: 기존 계획과 코드 근거의 재사용 메타데이터만 기록하며 지식·정본 승격은 하지 않는다.

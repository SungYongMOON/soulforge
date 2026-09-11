# T2 — 실제 합성 후보·검토·수락 판본과 source readback 연결

> 보존 기록: 이 문서는 후보 브랜치 `codex/context-memory-build`(로컬 보존 tag `codex/cleanup/20260911/context-manager`, `c6c5870c`) 제작 당시 `ui-workspace/apps/dev-erp/docs/`에 쓴 증거다. 2026-09-12 main 통합에서는 dev-ERP 연결(shim·행보관 `--accepted-context`)을 CTX-S0-G2로 보류했다. 시험 본체는 `guild_hall/context_engine/tests`에 있고, dev-ERP CLI를 거치던 T3–T5 시험은 APP CLI(`src/app.mjs`)를 쓰도록 옮겼다. 본문의 경로·명령은 당시 기준이며, dev-ERP 시험 래퍼를 가리키던 링크만 APP 위치로 고쳤다.

## 범위와 결과

T2는 기존 `authenticFixture`의 실제 P4 candidate 및 context candidate builder,
등록된 사람 검토 계약의 **합성 영수증**, 실제 acceptance gate/in-memory store를 거쳐
T1 `accepted_context_reader`의 exact UTF-8 SHA256 + paragraph source readback까지 연결한다.
T0의 손으로 만든 accepted snapshot이나 evaluator gold를 수락 입력으로 사용하지 않는다.
운영 코드 수정은 없으며 모든 저장은 새 메모리 store에 한정한다.
합성 검토 영수증은 실제 사람 승인이나 운영 writer 권한을 뜻하지 않는다.

추가 파일은 `test/helpers/context_memory_t2_fixture.mjs`, `test/context_memory_t2.test.mjs`와 이 문서다.
재사용 API는 `createT2Fixture()` 및 `readT2Pages(x, generationFixture)`로 T3 합성 시험에 제공한다.
helper는 runtime import용이 아니다. source binding은 candidate membership에서 만들며 query hits에서 역으로 생성하지 않는다.

## 실제 연결 증거

| 단계 | 실행 결과 |
| --- | --- |
| G1 후보 → 검토 → 수락 | 저장 전 조회 거부; 수락 후 project membership 7개와 exact source proof 조회 |
| 정정 후보 도착 | caller의 current source metadata를 G2 producer/revision set으로 바꾸면 G1 최신 조회 거부; pointer는 G1 유지 |
| 미검토·거부·잘못된 검토 | review 누락, rejected, G1 review 재사용, required membership 검토 누락 모두 수락 실패; 이력·pointer 불변 |
| G2 별도 수락 | 다른 decision ref와 corrected candidate digest로 수락; `timeline-span:corrected`만 현재 근거로 노출 |
| 이전 판본 | G1 manifest/receipt 그대로 보존; G2의 `timeline-span:1`은 `excluded_historical` |
| 재생 | fresh store 재실행의 candidate, manifest, receipt, 전체 페이지가 동일; G2 이후 G1/G2 submission replay도 pointer를 되돌리지 않음 |
| 경쟁 writer | 같은 prior를 소비하는 별도 submission의 첫 수락 후 두 번째는 CAS/prior/epoch HOLD; 추가 판본 없음 |
| 중간 실패 | source-first/pointer-first 불일치 구간은 두 판본 모두 조회 거부; 나머지 입력 전환 후 G2 조회 복구 |
| 읽기 도중 변경 | source/ACL/pointer 변경, provider 예외, G2 manifest+G1 receipt 혼합은 빈 `NOT_AVAILABLE`; source IO 전 실패는 본문 읽기 0 |
| 원문 삭제·bytes drift | metadata query의 `ok`와 별개로 `source_readback.complete=false`, `SOURCE_UNAVAILABLE`/`REVISION_MISMATCH`; 확인 성공으로 취급하면 안 됨 |
| 권한·예산 | 다른 project/actor/purpose/null project/invalid budget 거부; common은 명시 grant 필요; 각 query 최대 본문 2회 |

페이지 검사는 2+2+2+1개의 원문을 **별도 query 4회**로 읽는다. 이것은 한 요청의 2회 예산으로 7개를 확인한 결과가 아니다.
7-hit 단일 query에서는 2개만 확인되고 나머지 5개는 `BUDGET_EXCEEDED`다.
T3는 응답 전체의 추가 원문 2회 예산을 별도로 지켜야 한다.

## 고정 합성 입력과 재생 digest

`sha256Canonical({g1: request, g2: request, reviews: [G1 review, G2 review], bodies: entries})`
입력 digest는 시험에서 고정 검증한다:
`77d6e3f2df3b8ac24ae5750d09ef115b7afe7e47eb5cfe716845905b182ed69f`.
본문은 기존 source ref content hash와 일치하는 공개 합성 문자열뿐이다.

| 산출 digest (SHA256) | G1 | G2 |
| --- | --- | --- |
| candidate review | `3086d077abb777dbe094f3ffdf7fa9889c5380f0a906eb44724c4d9156415900` | `18427a048c1b05044e8ec765a56f1d81d94fdbc2ecf10607be91f89279767d59` |
| manifest | `d31c4e01557d2429ee8163e419ca0d68cf54e8b07c003a2ac4b69c02f455eaf1` | `08872913864bc1963ae6a5141303f584bf0c659c3aa8303102da473e099c7466` |
| receipt | `5ef6c168f6a62933bcaf7af184db7d929763c865ce838f4cbab16fb06abd0850` | `534267d688558442df9547df8f039d94e1624640f57dd5ce87056ae945ed581b` |
| pages | `0d574bea1068f7066f785d83c2619ecd66e9dba855ddf5e99ac766f89c541dfd` | `6d8d1b47cf9c631473284827aa0b97524ef7cc5e185c9ddfa79cd4e780d6c887` |

## 검증과 다음 입력

실행 명령(저장소 root):

```text
node --test ui-workspace/apps/dev-erp/test/context_memory_t2.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t1.test.mjs ui-workspace/apps/dev-erp/test/accepted_context_reader.test.mjs ui-workspace/apps/dev-erp/test/accepted_context_query.test.mjs guild_hall/engineering_engine/engines/systems_engineering/tests/project_context_generation_candidate.test.mjs guild_hall/engineering_engine/engines/systems_engineering/tests/project_context_acceptance_gate.test.mjs
```

최초 T2 실행은 시험의 잘못된 결과 필드명 때문에 14 PASS / 1 FAIL(exit 1)이었다.
실제 `reviewer_receipt`의 decision ref/digest로 수정 후 위 영향 시험은 **84 PASS / 0 FAIL / 0 SKIP(exit 0)**.
그중 T2는 15개다. UI/canon/path 전체 검사는 의존성 설치 없이 manager 통합 gate로 넘긴다.
입력 digest 고정 단언 추가 후 T2만 다시 실행해 15 PASS / 0 FAIL / 0 SKIP(exit 0)을 확인했다.
비작성 보조 에이전트 1명의 정적 독립 검토는 bounded synthetic connection에 ACCEPT였다.
검토자는 시험을 재실행하지 않았으며 실행 결과와 독립 검토를 구분한다.
이는 구현 측 기존 보조 에이전트의 참고 검토다. 최종 독립 검토는 manager가 commit 회수 후
새 Astra/high 작업에서 수행하며 아직 완료되지 않았다.
T0 24개 기대 판정과 핵심6(Q01/Q05/Q07/Q09/Q11/Q12) 범위는 유지하며 이 시험으로 의미 질문 coverage를 새로 PASS로 올리지 않는다.

아직 끊긴 한 지점은 실제 요청 → typed decision/conflict/coverage를 포함한 bounded Context Pack 조립이다.
T3는 이 실제 수락 fixture를 재사용하되 핵심6의 의미 입력과 assembler 변환을 연결해야 한다.
T1 optional `valid_at`/`known_at`은 현재 판본의 membership 필터다.
저장소는 exact-ref G1 조회를 보존하지만 reader는 current-only이므로 과거 판본 요청을 거부한다.
별도 과거 시점 판본 선택 API는 없으며, G2의 superseded 상태를 날짜 필터만으로 G1처럼 복원하지 않는다.

이 시험은 단일 프로세스 동기 in-memory CAS와 consumer 전환 구간을 확인한다.
디스크 영속화, 프로세스 crash/Map 쓰기 중 atomicity, 다중 프로세스 writer 경쟁,
자동 correction 발견·producer metadata 갱신, 실제 human review, T3 전체 assembler,
W7 모델 비교, 실자료 canary와 운영 수락은 확인하지 않았다.
요청 profile은 Astra/medium이며 실제 모델·사용량·tier는 UNKNOWN, fallback은 없다.

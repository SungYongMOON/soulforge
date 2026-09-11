# T5 — 프로젝트 저장 구조의 실제 PDF 근거와 복구

> 보존 기록: 이 문서는 후보 브랜치 `codex/context-memory-build`(로컬 보존 tag `codex/cleanup/20260911/context-manager`, `c6c5870c`) 제작 당시 `ui-workspace/apps/dev-erp/docs/`에 쓴 증거다. 2026-09-12 main 통합에서는 dev-ERP 연결(shim·행보관 `--accepted-context`)을 CTX-S0-G2로 보류했고, 같은 시험은 `guild_hall/context_engine/src/app.mjs` CLI로 실행한다. 본문의 경로·명령은 당시 기준이다.

상태: 공개 합성 물리 경로에 한해 독립 재검토 수락·manager 통합.
실자료 canary, 전체 W7, 독립 APP 설치·전략 교체·전체 데이터 재생성은 완료가 아니다.

기준은 Plan 17의 `Project context data store — Owner adoption 2026-09-10`이다.
실행계획 v0.7의 SHA256은
`b01fba2a92d150a21291399588f5fa5007fbcb67ec3369853a7af1215057c3b1`이다.
§19.13 D/E의 raw-to-context 구분을 적용한다. §19.18의 승인 APP home
`guild_hall/context_engine` 집중·독립 설치·두 전략 교체는 manager의 다음 직렬 leaf다.
이 변경에는 파일 이동이나 두 번째 APP home을 섞지 않았다.

ASSUMPTIONS: T4 원문·질문·gold·소비 답안·평가를 그대로 보존한다.
새 PDF는 그 문장을 문서 표현으로 바꾼 공개 합성 파생물이다. PDF마다 새 raw-byte
hash와 별도 exact source ref를 사용하며 JSON source identity를 재사용하지 않는다.
합성 수락/SE fixture는 실행 증거이며 실제 사람 승인이나 공학 산출물 수락이 아니다.

## 실제 연결과 raw-to-context 한계

기존 `haengbogwan_context_packet.mjs --accepted-context` →
`createSyntheticAcceptedContextRuntime`의 opt-in project binding →
`accepted_context_project_runtime.mjs` → 기존 accepted reader →
`searchSourceTextCorpus` → reviewed typed projection → 기존 bounded pack → stdout.
default-off와 기존 flat synthetic/metadata-only 경로를 유지했다.

| 단계 | 실제 코드·증거 | 구현/미구현 구분 |
| --- | --- | --- |
| 원문 수집 | 기존 frozen T4 공개 source + `context_memory_t5_documents.py` | 제공자 재수집·실메일 분류 없음 |
| 실제 원문 추출 | `project_document_ingest.mjs` → `project_document_extract.py`, explicit `pdfplumber-tables-v1` | raw PDF를 파싱해 page/paragraph/word/table/row/column/cell/bbox를 생성. OCR·선 없는 표 미지원 |
| 의미 후보 생성 | `context_memory_t5_fixture.mjs`가 frozen T4 records를 읽어 추출 문단과 대조 | 일반 메일/PDF 자연어에서 결정·관계를 자동 생성하는 기능은 **미구현**. 준비된 JSON을 의미 추출 성공이라 부르지 않음 |
| 관계/판본 검사 | 기존 candidate/acceptance validators, `createT3Fixture`의 실제 G1→G2 및 exact source pin | 기존 종류·시점·정정·관계 계약 검사. 다단계 GraphRAG·자동 ontology 수락 아님 |
| 검토·수락 | 기존 `createInMemoryAcceptedContextGenerationStore.acceptCandidate`와 합성 review receipt | 실제 validator를 통과한 합성 수락. 운영 사람 검토·sole writer 기동 없음 |
| 지속 저장·갱신 | 명시적 `materializeT5`, `rebuildT5Document`, `persistT5Pack` 준비 writer | 파일-backed 합성 generation 형성/중단/동일판본 재생. 지속 수집 daemon·일반 의미 축적 writer는 **미구현** |
| 질의 조립 | project runtime, accepted reader/pack, 기존 BM25 함수 | PDF 원본·추출·index·typed 판본/권한 검사 후 bounded 팩. parser·수락·복구를 query에서 호출하지 않음 |
| 소비 | `t5-query-run.json`, `t5-consumer-responses.json` | 24회 실제 CLI 결과와 fresh native 소비 2회. RUNE 운영 연결·독립 최종검토 아님 |

`readTypedMemory`의 입력은 검토된 구조화 기록이다. PDF proof는 그 기록의 문장이
실제 PDF 문단에 존재하는지 확인한다. 어휘 검색과 이 의미 수락 단계를 합치지 않는다.
문단 대조는 줄바꿈 공백을 제거하며, parser는 source에 없는 단어/의미를 추정하지 않는다.

## 다음 APP 집중 시 소유 경계

이 표는 현재 파일의 책임을 분리한 인계다. 승인된 §19.18 트리를 다시 설계하거나
이번 변경에서 이동하지 않는다. `strategies/` 임시안은 사용하지 않는다.

| 현재 코드 | 책임/다음 leaf 경계 |
| --- | --- |
| accepted_context_pack/typed_memory | app-owned assembly/memory 알고리즘. source truth나 업무 규칙 owner 아님 |
| accepted_context_project_runtime 및 synthetic runtime의 context 연결 | app-owned runtime/adapters/guards 후보. 테스트 전용 filesystem binding과 실제 설치 binding의 분리는 다음 leaf |
| accepted_context_reader/query | context 조회의 권한·현재성 orchestration. 공통 exact-ref/acceptance validator를 복사하지 않고 외부 계약으로 사용 |
| haengbogwan_context_packet | ERP/강도담 caller. APP 집중 후 호출 어댑터 책임이며 내부 알고리즘을 이중 소유하지 않음 |
| guild_hall/rag/project_document_ingest/extract, source_text_index | 기존 reusable PDF/BM25 dependency. context-specific profile/chunk mapping은 APP preparation/retrieval 책임과 구분. 범용 호출자·closed default 호환을 보존 |
| engineering_engine의 identity/candidate/acceptance, shared canonical digest | shared validator dependency. 이 slice는 기존 검사를 재사용하며 source/수락 권한을 APP에 복사하지 않음 |
| T5 fixture/report/tests와 frozen T4 자료 | 개발 harness/test만. runtime은 이 파일이나 gold를 import하지 않음 |
| synthetic recovery pattern/SE compiled variant | 외부 backup/SE owner 계약. test helper가 공개 합성 dependency 증명에만 사용. 운영 policy 확대0 |

APP manifest/dependency closure, 격리 설치, code+state/output/cache 전환,
두 전략 v1→v2→v1과 호환 대상 전체 재생성/rollback은 다음 한정 leaf에서 검증한다.

## 저장·판본과 사용한 폴더

`accepted-context-synthetic-*` 이름의 자기 소유 OS 임시 root만 허용한다.
caller는 기존 CLI에 root와 exact binding byte SHA256을 명시한다.
binding이 승인 fs-key와 exact project ref, 각 asset의 역할/경로/hash/class/actor/purpose를
고정한다. 상대경로 탈출, link, 다른 owner 위치, 다른 project binding을 거부한다.
estate materializer는 변경하지 않았다. 읽기 전용23경로 export를 fixture가 형성한다.

| 위치 | 실제 역할 |
| --- | --- |
| 00_프로젝트_안내 | current accepted pointer, source revision set, ACL, dependency manifest. current가 20/30/40/필요60의 generation manifest 및 별도 저장한50팩의 generation/ref를 묶음 |
| 10_입력자료/DOCUMENT | 원본 exact source refs와 source asset refs. 원본 PDF는 source-custody owner에 유지 |
| 20_문서검색/본문·표_추출 | 실제 pdfplumber 결과와 parser/version/digest |
| 20_문서검색/검색_색인 | 실제 추출 문단 기반 chunks, 원본 revision set, accepted generation. 기존 BM25 검색에 사용 |
| 20_문서검색/원문위치·추출품질 | 원본/추출/index 결속과 한계. 실제 paragraph/table/cell 위치를 typed evidence와 대조 |
| 30_프로젝트맥락/사건·관계 | 현재 accepted manifest/review receipt와 별도 generations의 이전 accepted bundle. 00이 보존 refs를 결속하며 복구 대상에 포함. 현재-only query는 이를 과거 답변으로 재생하지 않음 |
| 30_프로젝트맥락/결정·약속·제약 | 별도 reviewed typed records, upstream JSON digest, PDF/extraction/accepted generation refs |
| 30_프로젝트맥락/업무가지·프로젝트요약 | exact task/generation/coverage. 의미 상태는30이 소유 |
| 40_기억관리 | 30의 typed refs만 갖는 회수 projection, policy ref, frozen T4 평가 ref/hash. 두 번째 결정 정본이나 gold 복사 없음 |
| 50_업무맥락/업무별_맥락꾸러미·선택근거 | query가 반환한 project-only 팩을 별도 fixture writer만 저장. 00 current의 pack ref/accepted generation에 결속. query는 기존 저장 팩의 일치만 검사하며 원문처럼 재주입하지 않음 |
| 60_업무경험/결과·검토·실패·재작업의_연결 | 실제 parser assertion 실패·수정 재실행·결과·작성자 확인 receipt 4개 연결. raw transcript/숨은 추론 없음. T4의 도메인 실패 기억과 별도 |

23개 중 source-kind 부모와 MAIL/SLACK/BUZZ/VOICE 폴더에는 해당 source가 없어
가짜 payload를 채우지 않는다. 이 소스들에 대한 연결 완료를 주장하지 않는다.
common source/추출/projection은 별도 common owner에 남고 project query와 분리된다.
common 팩을50의 project-only writer에 넣으면 거부한다.

별도 `_workspaces/P-A/<stage>/<artifact>/Rev_A`는 compiled
`system_dev_common_no_grade`의 SRR/SSRS 번호·이름을 참조한다. variant hash와
accepted bytes hash는 별도 `_workmeta/P-A/lineage` fixture에 결속한다.
이는 번호별 bytes 보존 검사이며 해당 PDF를 실제 요구사항 문서로 수락하는 검사가 아니다.
target lineage에 context/run/evaluation body를 넣지 않는다. 실제 target root는 접근하지 않았다.

## 문서 proof·권한·효과

원문은 4개의 새 PDF이며 각각2쪽이다. current/conflict는2행×2열 표,
old/common은 원래 기록이1개라1행×2열 표다. 임의 기록을 추가하지 않았다.
생성기, font hash, reportlab version, invariant PDF metadata와 재생 hash는
`t5-document-generation.json`에 있다. current PDF의 raw SHA256은
`4ae6e0be174da1ba5134ac6f4f4c8937895f8964590bdecc450c1e14d29afd96`이다.
4개 PDF의8쪽을 Poppler로 렌더해 본문/표를 확인했다.

기존 PyMuPDF default request/result의 closed shape는 유지한다. 새 trusted second
argument만 absolute interpreter와 고정 pdfplumber profile을 받는다. shell이나 runtime
discovery를 사용하지 않는다. 신규 profile의 digest는 raw source hash, engine/version,
profile와 전체 페이지 text/geometry에 결속한다. 실제 interpreter는 명시적으로 제공하며
특정 PC 경로를 제품 코드에 고정하지 않았다.

각 derived asset도 payload다. current ACL/project/purpose/data-class를 그 asset의
open 전에 검사한다. FD stat/read/close 뒤에는 binding/current/source/ACL과 읽은 파일의
identity·size·mtime/ctime witness를 다시 확인한다. 늦은 철회·파일 변경 시 팩을 억제하고
실제 attempts/loads/bytes를 보존한다. OS read 자체를 취소하거나 파일시스템 snapshot을
보장하는 구현은 아니다.
이 synthetic adapter에서는 grant가 추가돼도 `public_synthetic` 이외 class를 읽지 않는다.
live class/설치 허용을 이 옵션으로 우회할 수 없다.

한 팩은 newline 포함12,000 Unicode 문자, 근거12(이전판본 refs 포함), 경로6,
추가 원문 읽기2 이하이다. 원문과 derived payload의 실제 IO를 각각 계측한다.
문서 판본은 `document_generations`에 한 번 두고 evidence가 번호로 참조한다.
소수 bbox는 integer-only canonical digest와 호환되도록 point 단위 decimal string으로 보존한다.
필수 proof가 예산에 들어오지 않으면 팩 전체를 HOLD하며 한도를 올리지 않는다.

24개 공개 CLI 실행에서 최대9,912자, 원문 최대2회/108,776 bytes를 관측했다.
일반2-source 팩은 derived15회 읽기이며, 별도 저장한50팩 검사는 추가 derived IO다.
parser 준비 읽기·수락·파일 생성은 query metrics에 섞지 않는다. query 전후 파일
inventory/hash 불변과 task/writer/persistent write/external/model effects0을 검사했다.
native 소비2회는 query의 model_calls0과 별개이며 실제 token/tier/cost는 UNKNOWN이다.

## 정정·재생·이동·복구

- 기존 실제 G1→G2 수락 후 물리 fixture를 조회한다. old24V는 retained history로 남고
  G2의28V/30V 미해소 충돌 양쪽을 보존한다. current-only 역사 질의는 HOLD, 원문 IO0이다.
- source bytes 변경·부재 또는 source/extraction/index/typed generation 혼합은 정상
  근거로 반환하지 않는다. index/추출이 남았다는 이유로 원본을 확인했다고 하지 않는다.
- 재생성 probe는 실제 PDF를 다시 파싱하고 index chunks를 다시 만든다. extraction 후,
  index 후, publish 직전 중단을 넣어 current accepted pointer 보존과 query HOLD를 확인한다.
  동일 bytes의 재생은 전체 bound asset parity 뒤 `REPLAY_NO_OP`다. 새 의미 수락은 하지 않는다.
- locator-only 이동은 자기 소유 scratch 안의 source와 binding/dependency locator만
  바꾼다. source identity, index 의미판본과 pack digest가 유지되고 이동 후 복구도 재생된다.
- 복구는 기존 synthetic canary의 create-only·manifest/hash-readback 패턴을 test helper에
  한정해 사용한다. 운영 ingress/recovery policy와 collector allowlist는 변경하지 않았다.
  프로젝트 폴더만 복사하거나, 원본 dependency를 manifest에서 제거하거나, backup bytes를
  바꾸거나, fresh restore actor/class/scope 권한이 없으면 실패한다.
  source originals·accepted SE bytes·canonical lineage·receipt dependency까지 복원한 뒤
  모든 bound asset과 SE-relative bytes를 해소하고 실제 CLI pack digest 재생으로 확인한다.

## 원질문24개와 관찰 한계

`t5-query-run.json`은 원질문과 frozen T4 질문을 모두 보존하고 physical 실행,
회수 fact IDs, 활용, 의미 수락을 분리한다. 아래 P는 물리 실행 관찰이며 원질문 전체 PASS가 아니다.

| 질문 | T5 delta와 남은 범위 |
| --- | --- |
| Q01 | P: exact project/task. frozen Power-unit 매핑이며 원래 Sensor fixture 재실행 아님 |
| Q02 | P: foreign exact project 거부. T4 D oracle의30V 부족은 불변 |
| Q03 | P: 미승인 actor, payload IO0 |
| Q04 | P: project 미지정, fallback0 |
| Q05 | P: 새 PDF의 정정 근거. T4 conflict-free 별도 variant는 여기서 NOT_RUN |
| Q06 | P: current-only HOLD, 역사 답변 NOT_RUN |
| Q07 | P: old24V 대체. 원래 isolation-bypass 세부 사례 NOT_RUN |
| Q08 | P: future cutoff stale/미확인. live mail freshness NOT_RUN |
| Q09 | P: 실제 PDF page/paragraph/table/cell/bbox와 attachment 주장. 숫자 측정/minute6/paragraph7 NOT_RUN |
| Q10 | P: 원본 부재/변경을 retained index로 확인 처리하지 않음 |
| Q11 | P:28V/30V 양쪽 proof와 conflict |
| Q12 | P: coverage 부족 보존. T4 안전한6/6 설명과 envelope 문제 불변 |
| Q13 | P: reviewed depends_on/C-LIMIT 근거. 다단계 탐색 아님 |
| Q14 | P: 기존 exact task/result 연결. 새 공식 Task 생성0 |
| Q15 | P+새 소비: person:A 약속·시점, actor-a 동일인 추정 거부. fulfilled 약속 제외 fixture NOT_RUN, 전체 HOLD |
| Q16 | P: 승인 procedure 부재 명시. 발명/승격0 |
| Q17 | P: T4 극성 실패 적용성. 원래 isolation setup 동등성은 미확정 |
| Q18 | P: 결정·충돌·제약·선행 근거. 품질 우월성 주장 없음 |
| Q19 | P: 명시 common grant의 preference만, project팩 영구복사 거부 |
| Q20 | P: REQUEST_ONLY, 원문0. 새로운 의미 소비 비교 없음 |
| Q21 | P+새 소비:4근거 압력에서 충돌 양쪽·실제 제외사유 전달. 시편 근거 부족 인정. supply issue를 별도 gap으로 해석한 부분과 원래10관측stress 미실행으로 전체 PASS 아님 |
| Q22 | P: 같은 요청의 pack digest·순서 재생 |
| Q23 | P: frozen32V 매핑, 새 허가0. 원래75C 사례와 새 의미 소비는 NOT_RUN |
| Q24 | P: 수행/검토 목적 분리. procedure/Workflow 수락 없음 |

fresh native 소비자는 Q15/Q21 각각의 query+pack만 받았고 tools/files/network를 금지했다.
gold·다른 답안을 주지 않았으며 재호출하지 않았다. 답안 원문 내용과 작성자 관찰은
`t5-consumer-responses.json`에 분리했다. 이를 독립 최종검토나 전체W7 채택으로 부르지 않는다.

## 검증 gate와 재현

각 gate의 owner는 작성자이며 최종 비작성 검토 owner는 manager다.
deterministic gate의 expected exit는0이다. 증거는 아래 직접 test assertions/결과다.

| gate_id | outcome | validator_id / structured expectation | evidence_ref | status |
| --- | --- | --- | --- | --- |
| T5-G1 | 실제 PDF+profile proof | project_document_pdf_profile.test.mjs /5 PASS | 동일 test·생성 manifest | pass |
| T5-G2 |23폴더 실제 사용/owner 보존 | context_memory_t5.test.mjs / real CLI·owner-negative | 같은 test | pass |
| T5-G3 | pre-payload admission/IO 진실성 | 같은 test / denial·실제FD timing | 같은 test | pass |
| T5-G4 | bounded pack/읽기전용 | 같은 test / character/evidence/path/source budget·inventory equality | 같은 test | pass |
| T5-G5 | 정정/중단/혼합판본/재생 | 같은 test / exact accepted pointer·digest·HOLD | 같은 test | pass |
| T5-G6 | dependency 복구 | 같은 test / 누락·tamper·권한거부·CLI replay | 같은 test | pass |
| T5-G7 | frozen T4 보존 | T4/report tests + T5 report / frozen digest equality | t5-query-run.json | pass |
| T5-G8 |24coverage/2소비 한계 기록 | manual_evidence /24 rows,2 observed responses,no whole-question acceptance | t5-consumer-responses.json | pass |
| T5-G9 | 광역/실제default runtime/최종V | canon·UI·PyMuPDF default·fresh V | 아래 작성자 환경 한계 및 통합 결과 | partial: default 환경 HOLD |

실행자가 명시적인 사용 가능 Python을 `SOULFORGE_TEST_PDF_PYTHON`과
PDF adapter test의 `SOULFORGE_PDF_TEST_PYTHON`에 설정한다. 의존성 설치는 하지 않는다.

```text
node --test ui-workspace/apps/dev-erp/test/context_memory_t5.test.mjs
node ui-workspace/apps/dev-erp/test/context_memory_t5_report.mjs
node --test guild_hall/rag/project_document_pdf_profile.test.mjs
node --test guild_hall/rag/project_document_ingest.test.mjs
npm.cmd run validate:path-policy
npm.cmd run validate:canon
npm.cmd run ui:done:check
```

관찰된 결과:
- T1/T2/T3/timing/T4/report/accepted reader/query/기존CLI/PDF profile+당시T5 통합:127 PASS,0 FAIL,0 SKIP,exit0.
- 이후 전체 T5:31 PASS,0 FAIL,0 SKIP,exit0. 번호는 중복 시험을 더한 독립 총계가 아니다.
- 실제 rebuild와 SE compiled-path 결속 후 관련6개 재검사:6 PASS,exit0.
- 00의50팩 판본 및30의 이전 수락 bundle 보존을 추가한 뒤 실제 child CLI/G1→G2/복구3개 재검사:3 PASS,exit0.
- 합성 class를 grant로 넓히지 못하는 경계와 복구 재검사:5 PASS,exit0.
- 기존 default PyMuPDF test:7 PASS/5 FAIL/0 SKIP,exit1. 고정 repo venv가 없으며
  positive extraction 선행 단계에서 실패했다. default shape mock와 새 실제 profile 검사 성공과 구분한다.
- path-policy:6 PASS/1 Windows symlink SKIP, 위반0,exit0.
- canon:exit1, `yaml` 미설치. UI:exit1, `tsx` 미설치. 성공/skip으로 바꾸지 않았다.
- PDF4종8쪽 render exit0, 직접 시각 확인. `git diff --check` exit0.

공유 CHANGELOG/README/AX CURRENT는 manager에게 delta로 반환한다. 이 문서는
scoped 결과이며 공유 owner 문서를 대신하지 않는다. secret/private source/운영 writer/
collector/서비스/설치팩/공식 Task/외부발송/push 변경은0이다.

### 독립 검토와 수정

독립 검토는 기존 130개 시험과 24개 CLI 재현을 통과했으나 추가 부정 시험에서
세 결함을 찾아 최초 판정을 REVISE로 남겼다. `be074a7d`는 병렬 derived 읽기와
FD close가 모두 끝난 뒤 실패 계측을 확정하고, 복구 시 pinned asset scope에 현재
권한을 적용하며 저장된 dependency 목록과 episode 영수증의 실제 ref/hash를 대조한다.
독립 재검토가 새 경계 4개와 기존 T5 31개를 실행해 35 PASS/0 FAIL/0 SKIP로
세 지적을 닫았다. 이는 공개 합성 물리 slice의 수락이며 위 미구현 범위를 해소하지 않는다.
통합 작업면의 `validate:canon`은 138개 검사/오류0, `ui:done:check`는 통과했다.
통합 후 T5 31개·새 경계 4개·PDF profile 5개는 40 PASS/0 FAIL/0 SKIP였다.
작성자 환경의 yaml/tsx 부재와 통합 결과를 구분하며, 실제 default PyMuPDF 환경은
설치하거나 재검사하지 않아 HOLD를 유지한다.

지식 트리거 확인: 메타데이터 기록 — 실제 원문 파싱, 준비된 의미 projection, folder parity와
dependency 복구, 회수와 활용의 다른 주장 한계를 ref로 남긴다.
규칙 강화 체크: raw-to-context 자동 축적·지속 writer·독립 APP 전환 미구현을 명시하고,
준비된 typed JSON과 새 PDF의 source identity를 분리했다.

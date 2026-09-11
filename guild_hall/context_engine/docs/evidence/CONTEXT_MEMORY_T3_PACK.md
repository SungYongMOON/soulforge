# T3 — 읽기 전용 Context Pack의 실제 CLI 연결

> 보존 기록: 이 문서는 후보 브랜치 `codex/context-memory-build`(로컬 보존 tag `codex/cleanup/20260911/context-manager`, `c6c5870c`) 제작 당시 `ui-workspace/apps/dev-erp/docs/`에 쓴 증거다. 2026-09-12 main 통합에서는 dev-ERP 연결(shim·행보관 `--accepted-context`)을 CTX-S0-G2로 보류했다. 시험 본체는 `guild_hall/context_engine/tests`에 있고, dev-ERP CLI를 거치던 T3–T5 시험은 APP CLI(`src/app.mjs`)를 쓰도록 옮겼다. 본문의 경로·명령은 당시 기준이며, dev-ERP 시험 래퍼를 가리키던 링크만 APP 위치로 고쳤다.

상태: 공개 합성 입력에서 구현·작성자 직접검증. 매니저의 fresh 독립검토와 통합 전이다.
실자료 canary, 운영 배치, 모델의 의미 활용 평가는 수행하지 않았다.

## 연결과 입력

기존 `tools/haengbogwan_context_packet.mjs --accepted-context` →
`createSyntheticAcceptedContextRuntime.contextPack` → 내부 `createAcceptedContextPack` →
기존 `createAcceptedContextReader.query` → 수락 판본/ACL/현재 source 검사 →
exact 원문 문단의 typed assertion → 근거·정정·충돌·부족을 담은 JSON 응답으로 연결했다.
기존 CLI의 ledger 경로와 metadata-only reader 기본 응답은 유지한다.
명시적 contextPack reader만 검증된 typed 주장 문자열을 반환하며 그 응답의 metadata-only 경계는 false로 표시한다.
`haengbogwan_project_context`, Store `memoryForInjection/retrieveMemoryItems`는 수정하지 않았다.

ASSUMPTIONS: typed source는 자유문에서 모델이 추출한 답이 아니라 프로젝트·업무·종류·주장·관계·시점이
명시된 공개 합성 JSON 문단이다. 현재 수락된 membership의 정확한 source bytes를 읽은 뒤만 해석한다.
수락 gate는 기존 실제 candidate/review/store를 사용하며 합성 사람 검토 영수증을 만든다.
이는 운영 사람 승인이나 업무 진실의 독립 평가를 뜻하지 않는다.

별도 준비 명령은 test helper에서만 candidate/G1/G2 수락과 임시 파일을 만든다.
런타임/CLI는 test helper나 수락 writer를 import하지 않는다.

```powershell
$prepared = node ui-workspace/apps/dev-erp/test/helpers/context_memory_t3_fixture.mjs | ConvertFrom-Json
$request = $prepared.request | ConvertTo-Json -Depth 20 -Compress
node ui-workspace/apps/dev-erp/tools/haengbogwan_context_packet.mjs --accepted-context --synthetic-root $prepared.root --binding-sha256 $prepared.bindingSha256 --input $request
```

준비 파일은 OS 임시 폴더 바로 아래 `accepted-context-synthetic-*` 새 디렉터리에만 둔다.
runtime는 root, binding byte SHA256, actor, source filename allowlist와 크기/link/FD identity를 검사한다.
운영 모드·자동 discovery·기본 workmeta fallback은 없다. 옵션 누락/legacy 혼합은 거부한다.
`--input`은 32 KiB 이하 inline JSON만 받는다.

요청은 기존 exact actor/project/generation/scope/purpose/as_of/valid_at/known_at와
`task_ref`, `memory_purpose: work|procedure_review`, `requested_kinds`,
`memory_mode: recall|off`, 전체 예산을 명시한다. 별도 Q번호/fixture 정답 입력은 없다.
`purpose`는 ACL 권한이며 `memory_purpose`는 그 권한 안에서의 선택 용도다.

## 소비 가능한 예시와 source proof

공개 입력/출력은 `docs/architecture/workspace/examples/context-memory/`의
`t3-sources.json`, `t3-request.json`, `t3-cli-example.json`에 있다.
source 파일은 preparation 함수의 exact bytes와 일치함을 시험한다.
example은 실제 CLI stdout 한 건이며 metrics는 그 실행의 관측값이다.

- P-A exact project ref의 T-A1 업무로 식별한다. 동명이름 P-B로 옮기지 않는다.
- 24 V 이전 결정은 retained history이며 현재 facts에서 제외된다.
- 정정의 28 V와 별도 회의의 30 V는 양쪽 근거를 보존하고 `DISPUTED`로 표기한다.
- 전류 2 A 제약, 미해소 제출 약속, 극성 실패 경험과 적용 관계를 제공한다.
- metadata acceptance coverage가 완전하더라도 읽지 않은 자료의 의미 coverage는 완전하다고 하지 않는다.
  따라서 기본 예시는 `PARTIAL / INSUFFICIENT`이며 최종 시험 전압을 임의 선택하지 않는다.

| exact source | locator | UTF-8 SHA256 |
| --- | --- | --- |
| `timeline-span:corrected`, revision `10000000-0000-4000-8000-000000000901` | `paragraph:1` | `57a2ad6614db79c07c33f44a7b2b88b82934e19a181ac87c3ee5429421d21932` |
| `timeline-span:2`, revision `10000000-0000-4000-8000-000000000101` | `paragraph:1` | `e5701024f0ff737f77cf40660b5e4f55cfc491e64a1b9e712aa59289646e494b` |

팩 digest: `sha256:68d5e0d95e771cbea08ded8da84ef78d704109c28674ff2a38a58d345f9f496e`.
정책판본·전체 요청·수락 판본·근거 판본·선택 순서·제외/부족에 결속한다.
elapsed/bytes/관측 token 계측은 digest 밖이다. 재실행 elapsed 차이를 의미 변화로 세지 않는다.

## 예산·효과·경계

- 전체 한 팩: Unicode code point 12,000자(최종 CLI newline 포함), 근거 12개,
  경로 6개, 추가 source 읽기 2회. history exact refs도 근거 예산에 포함한다.
- 예시: 7,799자, 현재 근거 7개 + retained history 1개, 관계 2개,
  reader 호출 2회(첫 metadata-only), source attempts 2 / loads 2 / bytes 4,344.
  tokens는 UNKNOWN이며 문자에서 환산하지 않는다.
- source provider는 승인 뒤만 lazy read한다. 권한/다른 프로젝트/누락 프로젝트 거부의
  실제 query source counter는 0이다. 전체 본문을 미리 읽어 감춘 카운터가 아니다.
  준비 단계는 별도: 합성 수락 판본 2개, 임시 파일 9개 생성이다.
- 정정 span 우선, 그 뒤 exact span 순으로 최대 두 source를 선택한다. 확인된 typed 항목은
  충돌 양쪽 → 정정 → 결정 → 제약 등 고정 순서로 선택한다.
  lexical/vector/자연어 관련도 랭킹을 구현했다고 주장하지 않는다.
- metadata는 한 번에 최대 100 membership이다. 더 있으면 page-limit 부족을 보고한다.
  여러 페이지를 몰래 읽어 source 예산을 초기화하지 않는다.
- 미조회 source의 잠재 충돌, 필수 충돌 근거 부족, path 절사와 정보 부족을 명시한다.
  전체 proof가 출력 예산에 안 들어가면 facts를 통째로 보류하고 withheld 수와 부족을 반환한다.
  지원 출력 예산은 1,200~12,000자이며 더 작은/잘못된 예산은 입력 거부다.
- common은 ACL의 명시 scope grant와 exact project binding 안에서 preference만 허용한다.
  project가 NULL인 fact/decision을 common 사실로 승격하지 않는다. 기존 일반 메모리 store는 불변이다.
- 과거 cutoff 요청은 `HISTORICAL_ACCEPTED_QUERY_UNSUPPORTED` HOLD, source IO 0.
  미래/늦은 cutoff는 stale/미확인으로 표시하며 facts에도 currentness 한계를 표시한다.
- source 삭제/bytes drift/locator 문제는 verified 사실로 쓰지 않는다. query 도중 ACL/source/pointer 변경은
  facts와 민감한 판본 metadata를 억제하며 실제 시도 수를 보존한다.
- query 자체의 task mutation/writer/persistent write/외부발송/model call은 모두 0이다.
  계측은 이 read-only adapter 범위이며 임의 외부 provider의 내부 effect를 감사한 수치는 아니다.

## 질문별 실행 범위

PASS는 작성자 deterministic assertion의 통과다. 독립 의미평가가 아니다.

| 질문 | 실행/한계 |
| --- | --- |
| Q01 | PASS — 실제 CLI exact project/task 식별 |
| Q02 | PASS — 다른 exact project 요청과 typed project 불일치 거부 |
| Q03 | PASS — purpose/actor/회수된 ACL 거부, 실제 body IO 0 |
| Q04 | PASS — 누락 project HOLD, fallback 0 |
| Q05 | PASS — G2의 28 V 결정과 exact source; 충돌 시 단독 정답으로 사용하지 않음 |
| Q06 | HOLD 동작 PASS — 과거판본 의미 재생은 NOT_RUN(current-only reader) |
| Q07 | PASS — G1 이전결정 제외·retained history·G2 correction 관계 |
| Q08 | PASS — 늦은 cutoff stale/미확인 |
| Q09 | PASS — 실제 CLI 근거의 byte SHA/paragraph/typed record 재확인 |
| Q10 | PASS — 파일 부재·bytes drift·provider 실패, verified 오인 0 |
| Q11 | PASS — 같은 주체·키의 다른 유효값 양쪽 근거·DISPUTED |
| Q12 | PASS — 없는 exact task/미조회 source를 과거 부재로 오인하지 않음 |
| Q13 | NOT_RUN — 선행 업무의 의미 source/fixture를 아직 추가하지 않음 |
| Q14 | NOT_RUN — 중복 업무/결과의 의미 source/fixture를 아직 추가하지 않음 |
| Q15 | PASS — 미해소 약속의 source/subject/time/state |
| Q16 | PASS — 요청된 procedure가 없으면 명시 부족; 절차 발명 0 |
| Q17 | PASS — 합성 적용 조건과 관계가 있는 실패 포함 |
| Q18 | PASS — 충돌/유효성 우선 결정적 선택; 정량 유용성 평가는 T4 |
| Q19 | PASS — preference 분리·명시 common grant·NULL project decision 거부 |
| Q20 | PASS(입력 계약) — explicit off로 source IO 0, 추가 기억 없음; 자연어 충분성 판정/답안 비교는 NOT_RUN(T4) |
| Q21 | PASS — read/evidence/history/path/출력 예산과 mandatory proof HOLD |
| Q22 | PASS — 동일 요청 및 fresh G1→G2 재생의 pack digest 일치 |
| Q23 | NOT_RUN — 회수된 기억의 최종 답안 활용은 T4 의미평가 소유 |
| Q24 | PASS(선택 계약) — work의 소수 실패와 procedure_review의 다양한 성공·실패 구분; 절차 개선 품질은 T4 |

## 실행 검증과 인계

```text
node --test ui-workspace/apps/dev-erp/test/context_memory_t3.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t2.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t1.test.mjs ui-workspace/apps/dev-erp/test/accepted_context_reader.test.mjs ui-workspace/apps/dev-erp/test/accepted_context_query.test.mjs ui-workspace/apps/dev-erp/test/haengbogwan_context_packet.test.mjs
```

영향 묶음: exit 0, 70 PASS / 0 FAIL / 0 SKIP(T3 12개였던 시점).
추가로 history 근거 예산, 전체 팩 source counter, 변경된 typed 의미 입력과 기존 metadata 호환을
보강한 후 T3 파일만 재실행: exit 0, 15 PASS / 0 FAIL / 0 SKIP.
마지막 typed assertion 응답 경계 표시 수정 후 T1/T3 직접 재검사: exit 0, 34 PASS / 0 FAIL / 0 SKIP.
첫 T3 실행은 11 PASS / 1 FAIL이었다. 작은 출력 예산의 fallback digest가 `undefined` 값을
canonicalize하던 결함을 고친 뒤 통과했다. 실패를 정상 결과로 세지 않았다.

`npm.cmd run ui:done:check`: exit 1, renderer-core `tsx` 미설치.
`npm.cmd run validate:canon`: exit 1, `yaml` 미설치.
`npm.cmd run validate:path-policy`: exit 0, 6 PASS / 1 Windows symlink SKIP, 위반 0.
`git diff --check`: exit 0. 의존성 설치는 하지 않았으며 UI/canon은 manager 통합 gate다.
기존 synthetic default-off/runtime session 직접검사도 2 PASS(exit 0)였으며 운영 서버는 기동하지 않았다.

매니저 공유 delta: CHANGELOG/AX CURRENT에 위 기존 CLI→accepted reader→bounded typed pack 연결,
default-off/synthetic-only, 15개 T3 직접검사와 UI/canon dependency HOLD를 통합한다.
공용 CHANGELOG/README/AX CURRENT는 이 작업자가 수정하지 않았다.

아직 끊긴 한 지점: T4의 실제 최종 답변 소비 및 동일 모델·예산 비교평가.
T4는 고정 t3-request/source bytes와 CLI pack을 C 조건 입력으로 재사용할 수 있다.
Q13/Q14 source fixture, 과거판본 API, A/B/D 비교, Q20 충분성·Q23 활용·Q24 개선 품질은
구현된 것으로 취급하지 않는다. 승인된 실자료 canary는 후속 T5다.

요청 profile은 gpt-6-astra/medium, 관측 model/usage/tier/cost는 UNKNOWN, fallback none, Ultra n/a.
보조 agent 1명은 별도 파일의 CLI/runtime 구현을 담당했다. 독립 수락 검토자가 아니다.
최종 fresh review는 manager 책임이며 이 납품을 그 대기로 멈추지 않는다.
지식 트리거 확인: 메타데이터 기록 — 기존 source/candidate refs와 검증 결과만 재사용.
규칙 강화 체크: source IO와 합성 준비 effect, 문자 예산과 토큰, acceptance coverage와 의미 coverage를 분리했다.

## 독립검토 후 T3 비동기 파일 경계 수정

첫 구현의 독립검토에서 발견한 세 결함을 같은 범위에서 수정했다.
원문 EOF 직후 파일 변경을 놓치던 문제, source FD stat 대기 중 ACL 철회 뒤에도
본문을 읽던 문제, EOF 이후 binding/ACL 변경 시 실제 읽기 계측을 잃던 문제다.
검토자의 REVISE를 독립 수락으로 바꾸어 표기하지 않는다.

수정은 `accepted_context_synthetic_runtime.mjs`의 명시적 Context Pack 경로에만 적용했다.
원문 open/stat await 뒤와 각 body read 직전/직후에 binding byte pin 및
ACL/source revision/pointer/accepted-generation snapshot을 재확인한다.
읽은 source만 inode/device/mode/link count/size/mtimeNs/ctimeNs witness로 추적하고
FD·경로의 witness를 읽기 후와 최종 반환 직전에 비교한다. source 본문을 다시 읽거나
선택하지 않은 source를 미리 읽지 않는다. drift를 감지하면 후속 source 읽기를 중단한다.

opt-in 팩 실패는 사실·근거·판본 식별자를 억제한 `NOT_AVAILABLE`와 실제
attempts/loads/bytes, `source_body_loaded`를 반환한다. 실패 digest는 null이며
유효한 source proof로 오해할 digest를 만들지 않는다. 일반 metadata query/catalogue의
실패 envelope는 변경하지 않았다. 전체 source 읽기 최대 2회와 출력 예산은 유지한다.

회귀검사 `test/context_memory_t3_timing.test.mjs`는 실제 `node:fs/promises.open`과
FD stat/read/close를 수행한다. wrapper는 실제 결과를 위조하지 않고 지정 await 직후에만
공개 합성 source 또는 binding/ACL 파일을 변경한다. CLI 검사는 기존 `main(argv)`의
입력 변환·runtime·reader·stdout까지 통과한다. 운영 서비스는 기동하지 않는다.

- 수정 전 최초 5개 timing 검사: exit 1, 0 PASS / 5 FAIL. source 변경 후 PARTIAL 반환,
  ACL-before-read에서 실제 1,967 bytes 읽기, binding/ACL-after-read에서 계측 누락을 재현했다.
- 수정 후 같은 5개: exit 0, 5 PASS. 두 추가 사례(동일 크기 변경, close 직후 변경)를 포함한
  timing + T3 + T1 + accepted reader + 기존 CLI 영향검사: exit 0, 52 PASS / 0 FAIL / 0 SKIP.
- 기존 synthetic default-off/runtime session 검사: exit 0, 2 PASS. `git diff --check`: exit 0.
- 최종 timing 파일 직접검사: exit 0, 7 PASS. stat 중 ACL 철회는 actual bytes/loads 0,
  EOF 뒤 변경은 실제 먼저 읽은 1,967 bytes/1 load/1 attempt를 보존하며 팩은 억제한다.

```text
node --test ui-workspace/apps/dev-erp/test/context_memory_t3_timing.test.mjs
node --test ui-workspace/apps/dev-erp/test/context_memory_t3_timing.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t3.test.mjs ui-workspace/apps/dev-erp/test/context_memory_t1.test.mjs ui-workspace/apps/dev-erp/test/accepted_context_reader.test.mjs ui-workspace/apps/dev-erp/test/haengbogwan_context_packet.test.mjs
node --test --test-name-pattern="synthetic binding is OFF|HTTP checks session" ui-workspace/apps/dev-erp/test/accepted_context_http.test.mjs
```

한계: 이 adapter는 파일시스템 snapshot/lock이 아니다. 이미 제출한 OS read를 취소하거나
최종 동기 검사 이후의 외부 쓰기를 막는 권한을 만들지 않는다. 내용 판본은 최초 제한된 read의
SHA256으로 확인하고 이후 변경은 파일시스템 witness로 감지하므로, 모든 witness까지 보존하는
악의적 파일시스템 변경에 대한 원자적 보장은 주장하지 않는다. 추가 원문조회/운영 쓰기는 0이다.
정상 합성 팩의 의미 source/요청/gold를 바꾸지 않았다. 요청 profile은 이번 권한 경계 수정에 한해
Astra/high이며 observed model/usage/tier는 UNKNOWN, 구버전 profile guard HOLD와 전역 정책은 불변이다.
매니저가 같은 reviewer 과제에 최종 독립 재검증을 요청한다.

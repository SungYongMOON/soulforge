# Context Engine

프로젝트의 승인된 입력·수락 기록을 검사하고, 허용된 근거·기억·충돌·부족을
한정된 Context Pack으로 반환하는 APP이다. 독립 APP home은 Owner 계획 v0.7
§19.18의 고정 구조를 따른다. 운영 서비스나 새로운 수락 권한을 만들지 않는다.

현재 범위는 T0–T5 구현 집중, 명시적 전체 입력 snapshot의
새 파생 세대 생성과 고정된 code/data 선택이다. 후보 브랜치에서 승인된 공개 합성 범위의
독립 설치·두 전략 전환·구판 복구와 하니스 재평가를 독립 검토했다(설치 영수증은 private).
일반 자동 의미 축적·실자료·운영·전략 품질 채택은 별도이며 현재 HOLD다.

## main 통합 상태 (2026-09-12)

- 들어온 것: `src`·`algorithms`·`profiles`·`release`·`harness`·`tests`와 T0–T5 증거
  ([docs/evidence](docs/evidence/)). 합성 시험 184건 중 146 PASS·3 SKIP(0.5.0 기준)이다. T5 35건은
  `SOULFORGE_TEST_PDF_PYTHON`(pdfplumber pin 해석기)이 없어 fixture 준비에서 멈추므로 **main에서는 아직 실행되지
  않았다(NOT_RUN)**. 통과 여부는 해석기를 준비해 실제로 돌린 뒤에만 말할 수 있다.
- 검증 명령: `npm run validate:context-engine`(T5 밖 시험 + `verify_module`), `npm run validate:context-engine-t5`
  (`SOULFORGE_TEST_PDF_PYTHON` 필요). 둘 다 아직 `done:check`·CI에 연결하지 않았다. CI가 도는 Linux에서의 실행을
  확인한 뒤 연결한다.
- 보류한 것: dev-ERP caller 연결(`accepted_context_*` shim, `server.mjs`·`work_intake_context.mjs`
  import 교체, 행보관 `--accepted-context` 분기). dev-ERP 파일은 HPP 팩 명세의 import 폐포에
  들어가므로 연결하면 이 APP runtime 전체가 운영 팩에 실린다. release gate 전에는 싣지 않으며,
  dev-ERP는 기존 사본을 유지한다. 이전 T3–T5 시험은 같은 요청을 이 APP CLI로 실행한다.
- `observed_context_query`(0.3.2/0.3.3)는 KVDS 관찰 사례 전용 adapter다. gap 코드가 고정된
  단어 포함 점수기라 일반 맥락 경로로 쓰지 않는다. 대체 전까지 격리 상태로 둔다.
- 도구 분담(2026-09-12): D41(`PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` §8.2)이 Neo4j Community와
  Neo4j GraphRAG(벡터·키워드 결합 검색 포함)를 맥락 검색에 채택했다. 색인은 과제별로 분리한 제안층이며,
  색인 안의 같은 대상 합치기는 허용하지만 정본 ID는 자동으로 합치지 않는다. 같은 날 Owner는 제작 채팅에서
  "도구로 되는 기능은 중복이니 개발하지 말고 도구를 쓰라"고 지시했다. 그래서 그래프 저장·대상/관계 추출·색인 안
  합치기·벡터/키워드/그래프 확장 검색은 따로 만들지 않고 연결한다(아직 미연결). 현재 `bm25_v1`과 typed relations
  1-hop을 비교 기준판 A로만 두는 것은 이 제작 트랙의 판단이다. 과제 격리·권한·판본·시점·원문 대조·예산은 이
  APP의 고정 계약으로 남는다.

| 경계 | 소유 |
| --- | --- |
| `src/app.mjs` | 공개 호출·CLI 진입점 |
| `src/runtime`, `src/guards`, `src/adapters` | 요청 조립·공통 권한/현재성/상한 검사·외부 reader 연결 |
| `algorithms/preparation` | 승인 pin을 받는 공유 PDF parser 호출. 자동 의미 생성 아님 |
| `algorithms/representation`, `retrieval`, `memory`, `assembly` | 검사된 입력의 투영·검색·선택·조립 방법 |
| `profiles` | 고정 기본 조합. source/ACL/상한을 override하지 않음 |
| `harness`, `tests` | 개발 실험·합성 준비·회귀. 설치 runtime에 포함하지 않음 |
| `docs`, `release` | 호출/소유 경계와 기존 source-lane builder를 위한 명시 closure·검사 |

최초 구현 집중 이력은 [첫 APP slice](docs/APP_FIRST_SLICE.md), 현재 생성·전환 계약은
[세대 전환](docs/GENERATION_TRANSITION.md), 설치 방법과
증명 범위는 [release 안내](release/README.md)를 따른다.
프로젝트 데이터·state/output/cache·gold·credentials는 APP 설치 경로 밖에 둔다.

0.3.2의 `createObservedContextQuery`는 Owner가 해당 작업에 허용한 실제 자료
읽기·후보 판단을 위한 별도 read-only API다. task authority/corpus pin,
exact actor/project/purpose와 fresh authority를 검사한다. 결과는 출처가
결속된 observed/review_pending 상황·결정후보·약속후보·기존업무와 gap이며
accepted generation은 null이다. 기존 수락 query/생성/선택 guard나
syntheticOnly 계약을 완화하지 않는다. 자료의 문장이 실행 지시나 수락
권한이 되지 않으며 후보 판단을 실제 업무 생성·canon 수락으로 승격하지 않는다.

0.3.3은 digest를 포함한 최종 관찰 응답의 12,000자 상한과 실제 source
read의 maxBytes+1 sentinel 상한을 강제한다. 커지는 원본을 전부 읽은 뒤
거부하지 않으며 기존 관찰 Pack의 의미·수락 상태는 변경하지 않는다.

`createExactSourceReadback`은 기존 accepted reader의 `readSourceRevision`
provider에 연결하는 명시적 로컬 파일 reader다. Caller가 exact binding·원본
root/path·data class와 매번 새로 검사하는 권한 판정을 제공해야 한다. 읽기
전후 권한 판본, 파일 identity와 byte hash를 확인하며 root 밖 경로·링크·
초과 크기·판본 변경을 거부한다. 자료 탐색, 원본 변경, 수락, 모델 호출이나
새 Context store를 만들지 않는다. 기존 generation/수락 receipt/ACL 검사는
그대로 남으며 실제 actor·source grant가 없으면 실제 연결 완료가 아니다.

## 원본 문서 준비 (0.4.0~0.5.0)

`prepareSourceDocuments({ grant, roots, now, previousCoverage })`는 수집 lane이 이미 보관한 항목 중
exact grant(`soulforge.context_source_grant.v1`)에 적힌 항목만 읽어 `soulforge.context_source_document.v1`
문서(제목·본문 단위·출처 locator·발생 시각·말한 사람·사실 항목)로 바꾼다. 항목 탐색, 과제 귀속 추측,
원문 이동·복제, 쓰기는 하지 않는다. 과제 귀속은 grant만 정한다.

- grant: 정확한 과제 ref, 목적 `context_preparation`, 허용 자료 등급, 유효기간, source별 root 이름과 항목.
  항목 판본 정책은 `exact`(고정 판본) 또는 `latest_in_custody`(그 항목에 대해 보관된 최신 판본)다.
  root 이름을 실제 경로로 잇는 표는 신뢰된 설정(`roots`)이 주며 grant에는 경로가 없다.
- 연결됨(합성 원본으로만 검증):
  - Linear(`linear-custody-v1`): 이슈·댓글·변경 이력을 create-only 원본에서 읽고 파일마다 해시를 다시 계산해 대조한다.
  - 음성(`voice-session-v1`): `sessions/<날짜>/<세션>/`의 manifest와 `transcript.jsonl`을 발언 단위로 바꾼다. 발언 시각은
    녹음 시작+오프셋, 알게 된 시각은 가져온 시각이다. 화자 라벨은 검증되지 않은 제공자 표시라 해시 ref로만 쓴다.
    grant `scope`로 여러 과제가 섞인 녹음의 해당 구간만 받는다.
  - 메일(`mail-event-v1`): 수집기 이벤트 싱크의 행을 머리글·새 본문·인용 이력으로 나눈다. 본문 정규화는 gateway의
    `mailBodyTextFromRecord`를 재사용하고, 같은 달 파일의 다른 메일은 이 메일의 판본에 영향을 주지 않는다.
  - 문서(`document-file-v1`): UTF-8 텍스트·Markdown을 문단·제목 절 단위로 바꾼다. 파일 시각은 신뢰하지 않아 `valid_at`은
    null이다. PDF는 고정 PDF 준비와 해석기 binding 연결 전이라 `pdf_preparation_not_connected`, HWP/HWPX·Office는
    `unsupported_document_format`으로 보고한다.
- 경로 조각은 실제 파일 이름(한글·공백)을 받되 구분자·제어문자·`.`/`..`·Windows 예약 문자·끝 점/공백과
  비밀 파일 이름은 거부한다.
- 실자료 등급은 거부한다(`real_source_preparation_not_admitted`). P1 비유출 증거와 source별 grant 검증 gate가
  생기기 전에는 `public_synthetic`만 받는다.
- `doc_key`는 과제·종류·root·항목·합성 판본·adapter profile의 해시다. 같은 입력은 같은 키(재실행 no-op)가 되고,
  댓글처럼 딸린 판본이 바뀌면 새 키(변경 무효화)가 된다. coverage 기록과 `detectSourceChanges`가 추가·변경·삭제·
  불변·사용불가를 나눈다.

## 작업 맥락 보조 역할 — 구현 계획

Owner가 정의한 최종 역할은 새 요청과 작업 목적을 받아 관련 과거 기록을
찾고 확인하여 배경·진행·제출 이력·자료·방법·미확인 사항을 근거와 함께
반환하는 것이다. 상위 업무 agent가 전체 작업을 수행하고, 맥락 보조는
그 판단에 필요한 정보를 준비한다. 같은 로컬 모델 서버를 사용할 수
있지만 요청 문맥·도구·한도는 분리하고 상위 대화를 복제하지 않는다.

현재의 observed query는 제한된 문구 선택이며 위 의미 기반 조사 과정의
완료 증거가 아니다. 권한·출처·판본·수락 조회와 설치·복구 기반을 유지하고,
의미 추출·현재 자료 연결·검색 계획·추가 조회·정보 종합을 별도로 연결하고
실제 업무 결과로 검증해야 한다. 관련 계획과 현재/미완료 상태는
`docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`가 소유한다.
프로필·호스트·Bot Chat 등 실제 신원은 private 계획/설정에만 둔다.

## 공개 호출

```text
node guild_hall/context_engine/src/app.mjs --root <approved-synthetic-root> --binding-sha256 <exact-pin> --request-json '<request-json>' --synthetic-only
```

`createContextEngineRuntime({root,bindingSha256,syntheticOnly})`를 사용하며 기본은 off다.
일반 query가 parser 준비·수락·persistent writer·복구를 자동 호출하지 않는다.
`--operation update`는 승인된 source snapshot과 별도 수락 기록 snapshot에서
새 파생 세대를 만들고, `--operation select`는 예상 이전 pin과 배타 lock 아래
code/data를 하나의 current로 선택한다. 모든 실행은 명시적 synthetic binding만 받는다.
두 전략의 기계적 차이와 실제 소비 응답의 품질 평가는 별도로 판정한다.

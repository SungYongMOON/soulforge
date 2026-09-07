# sonar-intel — 소나 인텔 플랫폼 (Goal #1 + 제한된 Goal #2 관측)

내부 전용 인텔 도구: 소나 도메인(SAS/MBES/SSS/FLS + 보조센서 + 부품) 관련 뉴스·논문을
자동 수집해 대시보드에서 본다. LLM 호출 0회. 무의존(zero-dependency) Node 서버 +
vanilla JS, World Tree(코드 dev-erp, 포트 4300, `ui-workspace/apps/dev-erp`)와 같은 계열의 무의존 패턴을 따른다.

정본 계획은 [`docs/SONAR_INTEL_MASTER_PLAN_V1.md`](docs/SONAR_INTEL_MASTER_PLAN_V1.md)다.
이 README는 실행 방법만 다루고, 스코프·아키텍처·팀 구성 판단은 계획서를 따른다.

## v1 Goal #1 범위

- `server.mjs` — 대시보드(수집 현황 + 시그널 피드) HTTP 서버. 읽기 전용: store만 읽는다.
- `src/collectors/news_rss.mjs` — Google News RSS(키워드별) + Defense News RSS.
- `src/collectors/arxiv.mjs` — arXiv API(ToU 준수: 요청 간 3초 이상, 동시 접속 1개).
- `src/collectors/source_contract.mjs` — 네 신규 소스의 공식 조건 판본·확인일, 계정/상품
  권리, 예산 경계, 재배포 제한. 문서 확인과 실제 계정 승인을 구분한다.
- `src/collectors/papers.mjs` — OpenAlex works cursor와 Semantic Scholar bulk token
  수집·정규화·저장. 실제 계정 승인이 없는 기본 설정은 HTTP 0회다.
- `src/collectors/budget_journal.mjs` — 매 시도 전 잔액을 예약하는 app-owned working 원장.
  재시도도 차감하며 만료 시 자동 충전하지 않는다. 원장 lock의 자동 탈취는 없다.
- `src/store.mjs` — CORE DB. `node:sqlite`(무플래그로 동작하면) 우선, 안 되면 자동으로
  append-only JSONL로 대체(동일 인터페이스). 모든 엔티티는 안정 ID를 가지며 `erpMapping`은
  예약된 nullable 필드(Goal #1에서는 항상 null).
- `src/analysis/` — CORE 자료의 제한된 공출현·UTC 주간 차이. 별도 배치에서 계산하며
  조회 요청은 저장된 분석본만 읽는다. 종합 점수·군집·버스트·LLM 해설은 미제공.
- `export/` — CSV/JSON 스냅샷 writer. dev-erp DB를 직접 열지 않고, dev-erp도 `intel.db`를
  열지 않는다 — 결합 없는 파일 교환만.
- `config/keywords.json`, `config/sources.json` — 계획서(§3/§4)는 `.yaml`을 언급하지만,
  YAML 파서가 외부 라이브러리라서 무의존 원칙상 JSON으로 관리한다. 키워드는 코드에
  하드코딩하지 않고 이 두 파일만 읽는다.

## 실행

```bash
# 의존성 없음 - npm install 불필요
node ui-workspace/apps/sonar-intel/server.mjs
# 또는
npm --prefix ui-workspace/apps/sonar-intel start
```

브라우저에서 `http://127.0.0.1:4420` 접속(대시보드).

위 기동은 설치 lane의 운영 계약을 따른다. checkout의 개발 검증은 `--port 0`
(자동 임시 포트)와 synthetic `--data-dir`를 지정한다. 테스트는 운영 4420을 사용하지 않는다.

수집은 서버가 아니라 별도 CLI로 수동 실행한다(스케줄러 미등록 — 아래 "스케줄 없음" 참고):

```bash
npm --prefix ui-workspace/apps/sonar-intel run collect
npm --prefix ui-workspace/apps/sonar-intel run export:snapshot   # export/*.csv, *.json
```

## 포트

기본 `4420`, loopback(`127.0.0.1`)만 바인딩하며 이 host는 flag/env로 바꿀 수 없다(사내
단독 사용자 도구 — 팀 접속 표면을 열지 않는다). 이 저장소의 다른 확정 포트(dev-erp 4300/4310,
dev-erp-mcp 4311, Vigil 4192, team-ops-board 4791)와 겹치지 않는지 확인한 값이다. 필요하면
`--port` 또는 `SONAR_INTEL_PORT`로 바꾼다.

## 소스 on/off

`config/sources.json`에서 소스별로 `enabled` 스위치를 끄고 켠다. Goal #1은 `news_rss`
(google_news, defense_news)와 `arxiv`만 `enabled: true`다. `openalex`/`semantic_scholar`
(Goal #2), `epo_ops`/`kipris`(Goal #3)는 기본 `false`다. 두 논문 수집 코드는 구현됐고,
특허 수집기는 미구현이다. 네 소스의 현재 계정/상품 권리는 모두 미확인이다.
`enabled:true`만으로 새 소스가 호출되지 않는다. 정확한 상품·현재 약관 digest·권리/예산
증거 digest·허용 목적·저장/분석 범위·유효기간을 함께 확인해야 한다. Semantic Scholar는
업무 인텔 목적의 확대 이용허가 증거도 필요하며, 키 발급 이력을 승인으로 대신하지 않는다.

실행 예산은 공식 공개 한도를 복사한 기본값이 아니다. `budgetObservation`의 계정 관측
시각·만료 시각·단위·현재 잔액·보수적 요청당 비용 상한·잔여 시도 수를 공급하고, 요청 전
`budget-<source>.json`에 차감한다. OpenAlex 응답의 잔액/소비/초기화까지 남은 초로 한도를
더 줄인다. 초기화 경계를 넘거나 관측이 바뀌면 별도 대조가 필요하다. 현재 CLI는 비밀
파일을 읽지 않으며 Semantic Scholar 키는 승인된 호출자가 라이브러리 인자로 주입해야 한다.
실제 키 주입·계정 검증·수집 활성화는 수행하지 않았다.

논문 수집은 실행당 최대 4페이지·400건, 응답당 2 MiB, 요청 10초·전체 60초, 최대 2회
재시도로 제한한다. 페이지/건수 경계는 `bounded_partial`과 중단 이유를 반환한다. 429/5xx는
Retry-After와 제한된 backoff를 따르며, 긴 대기·권한 회수·401/403·예산 불명/소진은 종료한다.
OpenAlex는 5xx에서도 유효한 예산 응답 헤더가 필요하다. 헤더 없는 gateway 503은
첫 예약 시도 뒤 `provider_budget_headers_invalid`로 종료하며 자동 재시도하지 않는다.
이름·제목으로 엔티티를 합치지 않고 source ID와 허용된 DOI 필드만 정규화한다. 전문·요약·
PDF·저자 정보는 이 수집 단위에서 가져오지 않는다.

## 데이터 위치

`data/`(이 앱 폴더 안, gitignore 처리) — SW와 데이터가 한 몸이라는 계획서 설계다.
`data/intel.db`(sqlite 백엔드) 또는 `data/intel.jsonl`(JSONL 폴백), 수집 실행마다
`data/last_run.json`에 최근 실행 요약(소스별 fetched/stored/deduped, 시각)을 남긴다.
공개 저장소에는 실제 경로 대신 `<TARGET_SOULFORGE_ROOT>` 같은 자리표시자만 쓴다.
수집/분석/usage 영수증은 app-owned working 상태이며 accepted canonical bytes나 그 lineage가
아니다. legacy workspace·current canonical workspace·프로젝트 metadata로 이식하지 않는다.
신규 출처 기록에는 계약 digest·허용 범위·source ID·관측 필드 digest를 묶은 provenance를
저장한다. 기존 CORE bytes에 이 계약을 소급해 채우지 않는다. 기존 CSV/ERP 교환은 신규
출처의 권리·정본 수락 계약을 운반하지 못하므로 해당 출처가 있으면 export를 거부한다.

서버는 CORE를 `readOnly`로 연다. 데이터가 없어도 디렉터리·DB를 만들지 않고 빈 상태를
표시한다. JSONL CORE는 서버 기동 시 읽은 상태이며 SQLite는 현재 DB 조회다.
수집 실행 메타데이터와 분석본은 두 백엔드 모두 조회할 때 파일 크기·형식을 확인해 다시
읽는다. 분석본 교체 중에는 하나의 열린 파일에서만 읽어 서로 다른 판본을 섞지 않는다.

## 제한된 Goal #2 읽기 기능

기존 CORE의 로컬 자료를 다음과 같이 분석한다. UTC 기준 시각을 반드시 지정하며 새
수집·키 요청·외부 호출은 발생하지 않는다. `analysis.json`만 원자 교체하고 CORE는 보존한다.

```bash
npm --prefix ui-workspace/apps/sonar-intel run analyze -- --data-dir <existing_data_dir> --as-of <UTC_ISO_timestamp>
```

- `GET /api/analysis`: 기준 시각·자료 판본 digest·규칙·출처별 관측/꺼짐/실패·제외 수·주간 차이.
- `GET /api/relations?keyword=sas&days=14&min=1`: 7/14/28일 기간의 선택 용어 이웃을
  알파벳 순으로 최대 12개 표시. `min`은 함께 등장한 고유 자료 수의 하한이다.
- `GET /api/evidence?id=<event_id>[,<event_id>...]`: 근거 최대 50건.
  원래 CORE ID·출처·검증된 HTTP(S) 링크를 함께 반환한다. 링크를 서버가 fetch하지 않는다.
- 화면은 관계·근거 요청에 `corpus`/`asOf`를 붙여 분석본을 고정한다. 배치가 새 분석본을
  발행하면 이전 화면의 요청은 409와 다시 읽기 안내를 받아 다른 판본의 근거를 섞지 않는다.
- 기존 `/api/signals`는 논문·뉴스 유형 필터로 읽는다. 검색어 이력은 관계 근거와 구분한다.
- 화면은 관측 범위, 키워드 관계, 주간 차이, 근거 자료를 제공한다. 직접 텍스트를 모두
  escape하며 출처 링크는 자격증명·비공개 호스트·비HTTP 주소를 거부한다. 조회는 loopback의
  정확한 Host/Origin/Fetch-Metadata 경계를 검사하고 변경 요청은 405로 거부한다.

관계는 **제목·요약의 직접 용어 일치**다. 검색어 union(`keywordsMatched`)은 사용하지
않는다. 문자·숫자 경계로 `Simulation`의 IMU 같은 오탐을 막되, 약어·풀네임·포함 용어의
동일 개념 여부나 인과관계는 판단하지 않는다. 새 논문은 provenance가 검증된 DOI만 병합하고
기존 CORE의 임의 meta에서 DOI를 추정하지 않는다. 추적 매개변수를 제거한 URL과 버전 없는 전체 arXiv ID도 중복 기준으로
사용하며 충돌은 그룹 전체를 제외한다. Google News 중계 URL과 출판사 URL이 같은 사건인지
확인하지 못하므로 사건 단위 완전 중복 제거를 주장하지 않는다.

발행일과 수집일은 분리한다. 잘못되거나 없는 발행일은 주간·기간 집계에서 제외하며 수집일로
대체하지 않는다. 이번 주 일부와 지난주 전체의 **현재 수집 자료 수 차이**만 보여 준다.
기간 완전성·증감률·버스트·과거 시점 backtest·P90/입력/규칙 변경 기여도는 미확인이다.
미구현·권리 미확인·꺼짐·수집 실패·성공했지만 결과 없음은 별개 상태다. 미관측 출처와
날짜 없는 빈 분석은 `null`/확인 불가이며 점수 0으로 바꾸지 않는다. 자료/계약/관측 상태와
규칙을 같은 digest로 묶어 해당 분석본의 근거가 일치하도록 한다.

상한은 CORE 5,000행, 설정 용어 64개, 자료당 용어 16개, 기간당 간선 512개, JSONL 입력·
분석본 각각 16 MiB다. 상한을 넘으면 분석본을 발행하지 않는다(자료당 용어 초과는 제외 수에
표시). npm 배치는 Node heap 192 MiB로 실행하며 실행 5초 초과 시 결과를 발행하지 않는다.
분석본과 최대 256 KiB의 수집 실행 메타데이터는 매 조회에 읽힌다. 서버 재기동 없이
화면의 `최신 결과 다시 읽기`로 기준 시각·후속 수집 경고·새 분석본을 갱신한다. 이 버튼은
조회만 하며 분석 배치를 실행하지 않는다. 예정된 8개 관측 프로필은 아직 미구현이다.

## ToU(약관) 준수 — arXiv

arXiv API 공식 약관(info.arxiv.org/help/api/tou.html): 요청 간 최소 3초, 동시 접속 1개.
`src/rate_gate.mjs`가 모든 arXiv 요청을 하나의 큐로 직렬화하고 시작 시각 사이 최소
3000ms 간격을 강제한다. 모든 요청에 설명적 User-Agent를 붙인다(개인 이메일 등 연락처는
넣지 않는다). Google News/Defense News RSS는 공식 rate limit 문서가 없는 비공식/공개
피드라 요청을 순차 처리하고 키워드 사이 짧은 간격(기본 250ms)을 둔다.

## 스케줄 없음 (의도적)

계획서 §6은 뉴스 6시간마다·arXiv 주 1회 주기를 정하지만, 이 bounded 작업은 Windows
예약작업을 등록하지 않는다. `npm run collect`는 사람 또는 미래 스케줄러가 호출하는
온디맨드 진입점이다.

## 구현 메모

- `node:sqlite`는 이 앱 개발 시점의 저장소 Node(24.15.0, `node --version`으로 확인)에서
  플래그 없이 정상 동작해 `store.mjs`의 1순위 백엔드다. Node 22.x 일부 버전은 이 모듈이
  `--experimental-sqlite` 플래그 뒤에 있었으므로, `store.mjs`는 기동 시 `node:sqlite` import를
  시도하고 실패하면 자동으로 JSONL 백엔드로 대체한다(코드 경로 하나, 별도 설정 불필요).
  `store.backendName`으로 현재 사용 중인 백엔드를 확인할 수 있다(대시보드 상단에도 표시).
- RSS(뉴스)와 Atom(arXiv) 파서는 정규식 기반 최소 구현이다 — `feedparser`/`xml2js`류
  외부 라이브러리를 쓰지 않기 위한 선택이며, 두 표준 피드 형식의 정규 태그 구조에서만
  검증됐다(임의 확장 XML은 대상 아님).

## 테스트

```bash
npm --prefix ui-workspace/apps/sonar-intel test
```

RSS/Atom 파싱, store dedupe/ID 안정성, rate-limit 게이트와 분석은 오프라인 fixture로 검증한다.
분석 테스트는 입력 순서 독립성, 중복/충돌, UTC 경계, 검색어 오탐, 출처 실패/꺼짐,
상한, 실제 CLI 반복 결과 동일성, 실제 임시 HTTP 조회, CORE 무변경을 확인한다.
새 수집기는 실제 loopback HTTP fixture에서 페이지·중복·timeout·재시도·권한 회수·예산
만료·크기 상한을 시험하고 native SQLite 저장부터 분석/API까지 확인한다. query credential,
redirect·예외·callback 진단에 인증값이 나타나지 않는 시험도 포함한다.
수동 브라우저 재현은 `node tools/browser_fixture.mjs`다. 출력된 임시 URL에서 A 근거를 열고,
stdin `replace` → 기존 관계 버튼의 409 안내 → 최신 결과 다시 읽기 → signal 관계와 B 근거를
확인한 뒤 stdin `finish`로 요청별 판본·상태와 CORE 보존을 temp 영수증에 기록한다.
이 fixture의 계정은 합성이며 외부 수집 endpoint를 사용할 수 없다.
실 네트워크 호출은 기본적으로 건너뛰며, 아래로 명시 실행한다.

```bash
SONAR_INTEL_NETWORK=1 npm --prefix ui-workspace/apps/sonar-intel test
```

루트 게이트: `npm run validate:sonar-intel`.

## 남은 것 (Goal #2/#3)

- Goal #2 후속: 실제 계정/상품·허용 목적·예산·키 주입 연결의 별도 확인, 버스트·주간
  브리핑·상세 관측 프로필. 두 논문 수집 코드와 제한된 공출현·주간 차이는 구현됨.
- 군집과 종합 순위: 기준 구현 대조·규모 gate 및 시간 분리 backtest 전까지 보류.
- Goal #3: EPO OPS 수집기, KIPRIS 수집기. 코드 구현과 실제 계정/상품/권리 확인은 별개다.
- 팀 봇 4종(sonar-research/backend/frontend/verifier) 운영 루프(계획서 §8)는 이 bounded
  코딩 작업의 범위 밖이다.

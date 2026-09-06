# sonar-intel — 소나 인텔 플랫폼 (v1 Goal #1)

내부 전용 인텔 도구: 소나 도메인(SAS/MBES/SSS/FLS + 보조센서 + 부품) 관련 뉴스·논문을
자동 수집해 대시보드에서 본다. LLM 호출 0회. 무의존(zero-dependency) Node 서버 +
vanilla JS, World Tree(코드 dev-erp, 포트 4300, `ui-workspace/apps/dev-erp`)와 같은 계열의 무의존 패턴을 따른다.

정본 계획은 [`docs/SONAR_INTEL_MASTER_PLAN_V1.md`](docs/SONAR_INTEL_MASTER_PLAN_V1.md)다.
이 README는 실행 방법만 다루고, 스코프·아키텍처·팀 구성 판단은 계획서를 따른다.

## v1 Goal #1 범위

- `server.mjs` — 대시보드(수집 현황 + 시그널 피드) HTTP 서버. 읽기 전용: store만 읽는다.
- `src/collectors/news_rss.mjs` — Google News RSS(키워드별) + Defense News RSS.
- `src/collectors/arxiv.mjs` — arXiv API(ToU 준수: 요청 간 3초 이상, 동시 접속 1개).
- `src/store.mjs` — CORE DB. `node:sqlite`(무플래그로 동작하면) 우선, 안 되면 자동으로
  append-only JSONL로 대체(동일 인터페이스). 모든 엔티티는 안정 ID를 가지며 `erpMapping`은
  예약된 nullable 필드(Goal #1에서는 항상 null).
- `src/analysis/` — 스텁만(M4 공출현 그래프는 Goal #2).
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
(Goal #2), `epo_ops`/`kipris`(Goal #3, KIPRIS는 ServiceKey 발급 대기)는 아직 `false`이며
어떤 코드도 이들을 호출하지 않는다.

## 데이터 위치

`data/`(이 앱 폴더 안, gitignore 처리) — SW와 데이터가 한 몸이라는 계획서 설계다.
`data/intel.db`(sqlite 백엔드) 또는 `data/intel.jsonl`(JSONL 폴백), 수집 실행마다
`data/last_run.json`에 최근 실행 요약(소스별 fetched/stored/deduped, 시각)을 남긴다.
공개 저장소에는 실제 경로 대신 `<TARGET_SOULFORGE_ROOT>` 같은 자리표시자만 쓴다.

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

RSS/Atom 파싱, store dedupe/ID 안정성, rate-limit 게이트는 오프라인 fixture로 검증한다.
실 네트워크 호출은 기본적으로 건너뛰며, 아래로 명시 실행한다.

```bash
SONAR_INTEL_NETWORK=1 npm --prefix ui-workspace/apps/sonar-intel test
```

루트 게이트: `npm run validate:sonar-intel`.

## 남은 것 (Goal #2/#3)

- Goal #2: OpenAlex + Semantic Scholar 수집기, `src/analysis/`의 공출현 그래프·버스트 감지,
  주간 브리핑.
- Goal #3: EPO OPS 수집기, KIPRIS 수집기(ServiceKey 발급 후).
- 팀 봇 4종(sonar-research/backend/frontend/verifier) 운영 루프(계획서 §8)는 이 bounded
  코딩 작업의 범위 밖이다 — 이번 세션은 코드를 직접 구현·실행·검증한 단일 에이전트다.

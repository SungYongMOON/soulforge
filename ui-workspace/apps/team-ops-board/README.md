# Workspace Board — Owner perspective local Codex thread projection

## RAG 실제 DB 읽기 화면

전용 미리보기의 `/rag-operations.html`은 기존 Context Engine의 `inspectGraphDatabase`
읽기 작업으로 실제 로컬 Neo4j를 조회한다. `/rag-operations.json`은 loopback GET만 받고,
프로젝트는 기존 운영 읽기 설정의 allowlist만 받는다. 클라이언트가 DB 주소·Cypher·파일 경로·
worker operation을 지정할 수 없다. 일반 운영 `/`의 배포나 데이터 쓰기를 활성화하지 않는다.

- DB: 현재 적재 판본, 청크 수, 임베딩 속성이 있는 청크 수, 벡터 색인 상태·차원,
  미귀속·잔여 노드와 적재 잠금 수를 읽는다. 잔여 노드는 자동 삭제 대상이 아니다.
- 준비 기록: Path Registry pin과 과제 binding에서 정확한 현재 pointer·manifest·coverage를
  읽는다. pointer/coverage digest와 과제 신원이 맞지 않거나 조회 중 바뀌면 확인 불가다.
  문서별 청크·임베딩·무결성 수치는 저장 기록이며 문서별 실 DB 재검증이 아니다.
- 이력: 판본 ID 역순 최대 12개와 최근 30일 Graph Sync 영수증 최대 1,500개/과제를 읽는다.
  실행 영수증은 파일당 256KiB·새 읽기 합계 8MiB/과제로 제한하고 변경되지 않은 파일의
  정규화 결과를 재사용한다. 선택한 기간 이전이나 미보존 구간의 추세를 복원하지 않는다.
  직접 디렉터리 열거는 2,048개까지이며 초과·손상·읽기 실패를 부분/확인 불가로 표시한다.
  판본 파일 수정 시각을 임베딩 실행 시각으로 바꾸지 않는다.
- `qwen` 등 모델명·digest는 저장된 판본 기록이고 현재 DB의 색인 차원은 실조회 값이다.
  재임베딩 기록과 일반 추출·재사용 판본을 구분한다. 값이 없는 항목은 0으로 만들지 않는다.
- DB 조회는 60초 캐시·단일 진행 요청을 공유한다. 검증된 기존 worker의 `inspect`만 호출하며,
  새 모델 호출, 재임베딩, graph sync, 색인 생성·갱신·삭제는 하지 않는다. 결과에 자격증명,
  원문·벡터 배열·host 경로를 싣지 않는다. 조회는 동시 writer에 대한 원자적 snapshot이 아니다.

`src/server/rag-operations-adapter.mjs`가 최소 읽기 결합을, `src/rag-operations.tsx`가
자료·청크 / 임베딩·판본 / 처리 이력 화면을 소유한다. 질문별 그래프와 기억 생성·회수 기록은
이 집계에서 만들어내지 않는다. 현재 화면은 RAG 전체 품질 또는 production-ready 수락이 아니다.

## 운영 UX 미리보기

운영자용 [사용 설명서](public/operations-manual.html)는 미리보기의
`/operations-manual.html`에서 제공하며 모든 메뉴의 상단에서 열 수 있다.
왼쪽 고정 목차는 읽는 항목을 표시하며, 좁은 화면에서는 펼침·접기를 제공한다.
스크롤 위치의 백분율·진행 막대와 현재 항목 번호를 표시하고, 접힌 목차에도 위치를 유지한다.
상태별 뜻·다음 행동, 수집과 검색 포함의 차이, 기간·분모·부분 집계,
RAG 품질 점검, 모델 연결·메모리·사용량, 파일·검색·기억 기능과 용어 대조표를 담는다.
화면은 수집을 `모은 자료`, 같은 본문 버전의 현재 검색 목록 포함을 `검색에 포함`,
집계 연결 부족을 `포함 여부 모름`으로 표시한다. 메일 등 수량 연결이 부족한 이유는
그래프 아래에 직접 표시하고 재처리 실패로 오인하지 않게 한다.
기술적 판본은 `처리 버전`, custody는 `보관`, 토폴로지는 `시스템 연결도`로 표시한다.
DB residue는 이전 버전 전체가 아니라 저장 임시 표시가 남은 노드이며, 추출 중 제외한
중복·관계 수는 현재 DB의 삭제 대상 수가 아니다. 표시 변경은 집계·복구 권한을 바꾸지 않는다.

지도·목록·상세의 상태 배지는 `operation-status.mjs`의 정상 / 진행 중 / 보류 / 이상 /
일부 확인 / 미확인으로 통일한다. 확인 범위(연결·수집·보관·표본·DB)는 별도이며 건수와
마지막 검사 설명은 상세 근거에만 둔다. 정상은 표시된 범위의 판단이지 업무 전체 성공이 아니다.
원천 연결은 기존 60초 캐시에서 고정된 Linear·Slack·Gmail 호스트의 인증서 검증 TLS 접속과
기존 Buzz binding의 loopback `_liveness` GET을 확인한다. 임의 호스트·리디렉션·인증정보는
받지 않으며 연결당 3초 이내다. Linear는 최신 health와 일치하는 30분 이내 실제 API 조회
영수증을 추가 대조한다. TLS만 되면 일부 확인이며 계정 인증·자료 접근 성공으로 표시하지
않는다. PLAUD·Hiworks는 최신 목록 조회·수집 기록으로 연결을 간접 확인하고 방식·시각을
상세에 표시한다. OneDrive 클라우드 동기화 등 근거 없는 연결은 미확인으로 유지한다.

지도에서 메일 노드는 최근 회차의 실패·보류를 기본 표시하고, 과거 실패 장부는 선택 상세의
조사 참고용 기록으로 둔다. 당시 메일 전달 성공이나 재전송 필요를 추정하지 않는다.
`custody-checks.mjs`는 기존 수집 영수증 validator와 Path Registry의 data root를 재사용해
Linear 현행 인덱스가 지정한 파일의 형식·식별자·내용 SHA-256을 독립 대조한다. Buzz에는
현행 객체 인덱스가 없으므로 종류별 최대 16개 객체·객체별 최대 2개 판본을 검사하는 표본
검사로 명시한다. 최대 1,024파일·합계 32MiB·파일당 8MiB·폴더당 512항목, 60초 캐시와
진행 중 요청을 공유한다. 재분석·네트워크·원문 출력·디스크 쓰기는 없으며 링크와 읽기 중
변경을 거부한다. 한도·부분 읽기·빈 범위는 전체 통과로 표시하지 않는다. 새 예약 감시기를
추가하지 않고 4194의 기존 읽기 갱신에서 수행한다.
Neo4j의 실조회·판본·색인, 준비 기록과 모델 API 관측도 지도에 연결하되 검색·추론 성공으로
승격하지 않는다. 직접 실행 근거가 없는 외부 원천·에이전트 기능은 검사 미연결로 남긴다.

RAG 추세는 기존 과제별 최근 30일 실행 영수증을 재사용한다. 1일·7일·30일을 선택하며,
1일은 KST 시간별, 7일·30일은 날짜별 마지막 관측을
과제별로 선택해 문서·청크·임베딩 보유량과 대기·실패를 표시하며 반복 검사를 신규 처리량으로
합산하지 않는다. 전 과제의 근거가 없는 시간대와 검증되지 않은 DB 수량은 선을 연결하지
않는다. 파일 수정 시각을 실행 시각으로 쓰거나 관측 사이의 수량을 복원하지 않는다.
과제 표시명은 허용된 저장소의 `project_identity.json`에서 코드·fs key를 대조해 읽는다.
이름은 표시용 메타데이터이며 candidate 안내의 정본 수락을 뜻하지 않는다. 원래 코드·검색
범위·폴더 경로를 유지하고, 이름이 없으면 명칭 미확인으로 표시한다. 실제 명칭을 코드에
하드코딩하거나 외부로 보내지 않는다.

운영 알림은 현재 이상, 실제 처리 보류, 검사 실패만 집계한다. 최신 검증 영수증으로 확인된
PLAUD 순차 처리는 수집 현황에 `처리 중`으로 표시한다. 현재 실행을 막지 않는 메일 과거
기록과 관측 미연결은 알림에 합산하지 않으며 토폴로지·서비스별 검사 기록에서 확인한다.
PLAUD의 오래되거나 실패한 근거는 진행 상태로 승격하지 않는다. 원인·영향·다음 조치는
알림의 기본 내용이며, 이 UI 분류는 원본 상태·복구 정책·처리 주기를 변경하지 않는다.

### 운영자 판단을 위한 화면 순서

첫 화면은 **AI 자원 → 운영 판단 → 자료 수집·전처리·RAG → 로컬 모델** 순서다.
한도와 사용 추이는 같은 윗층에 두고, 넓은 화면의 가용 폭을 사용한다. 핵심 수치를 접지 않는다.
운영 판단은 확인 필요, 진행·대기, 과거 이력을 분리한다. 수집 검사 통과·RAG 판본 대조·모델
API 응답은 각자의 분모와 근거 범위로 표시하며 하나의 전체 건강 점수로 합치지 않는다.

`/rag-operations.json?view=overview`는 기존 base/detail reader와 60초 캐시를 재사용한다.
DB inspector는 동일 캐시에서 한 번만 실행되며, 과제 상세는 최대 3개씩 읽는다. 준비·청크·
임베딩·대기·실패·중복·출처 누락·DB 잔여 수치를 구분하고 부분 관측은 하한/미확인으로 둔다.
과제 행은 같은 과제의 RAG 상세로 이어진다. 수집 자료 전체를 RAG 대상으로 가정하지 않는다.

로컬 모델은 기존 metadata GET의 접속·적재·메모리 수치를 보여준다. 모델별 호출·입출력
토큰은 현재 선택 판본의 생성 기록이며, 서버 전체 누적이나 실시간 처리율이 아니다.
호스트별 사용량으로 임의 귀속하지 않고, 계측되지 않은 값은 0으로 만들지 않는다.

`/operations-incidents.json`은 pinned root 안의 Linear health와 메일 상태/최근 이벤트 64KiB만
읽는다. 메일의 최신 회차 실패·보류가 0이고 남은 실패가 과거 장부에만 있으면 과거 이력으로
분리한다. 당시 메일 전달 성공을 증명하거나 재전달·삭제·실패 장부 정리를 수행하지 않는다.
관측 시각과 상호 일관성 검사를 통과한 값만 사용한다. UI 테마 선택은 이 브라우저에 저장한다.

### 시각 중심 운영 현황

한도는 추가 항목을 접지 않고 제공된 모든 창을 5시간·주간별로 기본 표시한다. 남은 비율과
KST 초기화 시각·남은 시간을 같은 줄에서 읽고, 현재 근거가 없으면 미확인으로 둔다.
운영 현황의 모델 범례에도 선택 기간별 측정 토큰을 표시해 핵심 수치를 추가 클릭에 숨기지 않는다.
부분·미측정 표시와 제공자의 실제 창 구분은 유지하며 세부 근거 패널은 보조 확인용이다.

검토 콘솔의 Codex 한도는 설치된 CLI의 공식 `account/rateLimits/read`를 사용한다
([App Server 계약](https://learn.chatgpt.com/docs/app-server)). 조회 시 짧게 기동한 helper에
initialize/read만 보내며 12초·1MiB 응답 제한, 60초 캐시·동시 요청 병합을 적용한다.
thread/turn/login/reset 또는 모델 호출을 만들지 않는다. `/codex-live-limits.json`은
loopback·같은 Origin GET만 허용하고 한도 창·소진율·초기화 시각만 투영한다.
기존 provider snapshot은 별도 fallback이며 오래된 관측은 현재 한도로 표시하지 않는다.
Antigravity의 Gemini 한도는 공유 그룹 값이며 Flash 개별 한도로 해석하지 않는다.

`/operations-sources.json`은 pinned Path Registry와 기존 파일 접근 경계를 재사용한다.
새 수집기는 없으며 기존 화면 갱신에 맞춰 60초 캐시를 사용한다. 원천마다 서로 다른
기록을 탭으로 표시하고 전체 수집량으로 합산하지 않는다.

| 원천 | 투영 근거 | 표시 기준·제한 |
| --- | --- | --- |
| PLAUD | 기존 recording index | 등록일·현재 라이브러리 |
| Slack | 허용 과제별 continuous state | 메시지 작성일·중복 제거·원문/actor/token 제외 |
| Linear | 기존 object index | 현재 이슈 최종 수정일·전체 변경 이력 아님 |
| 메일 | 최근 30일 continuous receipts | 실행별 신규 등록 합계·KST 수집일·미계측/실패 건수는 null |
| DOC | team_files의 보호된 디렉터리 reader | 수정일·최대 32폴더/깊이 3/폴더당 200항목·파일 본문 미조회 |

원장 JSON은 파일당 8MiB를 넘으면 읽지 않는다. 부분 범위의 빈 날짜는 0이 아닌 미확인이다.
메일 이력은 고정 receipt 폴더의 이름 최대 10,000개와 기간 내 최대 6,000개 파일만 다룬다.
파일당 256KiB, 한 조회의 신규 읽기 32MiB, 8개 동시 읽기 제한을 적용한다. 기존 60초 화면
캐시 아래에서 파일 identity·크기·mtime·ctime이 같은 정규화 결과만 재사용하며 링크와
변경된 파일은 재검사한다. run ID·시간·schema와 신규+중복=전체 수치를 확인하고 중복 run을
더하지 않는다. 기간 합계·일별 막대·날짜 상세·최근 자료는 같은 집계에서 나온다. 메일 본문,
제목, 계정 정보는 읽거나 반환하지 않으며 계측 이전 날짜와 불명확한 실행은 0으로 만들지 않는다.
자료 패널은 종합표를 기본으로 열어 모든 원천의 기준·최근 기록·확인량과 작은 막대를 함께
보인다. 1일·7일·30일 선택에 맞춰 KST 시간·날짜 축을 맞추며 원천의 관측 종료일 밖은 미확인이다.
수치는 그 공통 기간에 실제 제공된 값만 합산하고 원천 간 합계는 만들지 않는다.
막대 높이는 행별 상대 크기이며 원천 간 절대량 비교를 뜻하지 않는다. 원천·날짜 클릭은
기존 상세로 이어진다. 테두리는 수집·보관 확인량, 채움은 같은 자료·본문 판본을 현재 RAG
판본에서 확인한 수량이다. Linear의 ID·본문 digest, Slack의 채널·시각·revision ref를
해시로 결합하고 현재 DB와 일치하는 판본의 준비 메타데이터를 대조한다. 재사용된 과거
준비 파일도 현재 manifest가 지정한 같은 과제의 exact hash ref일 때만 인정한다.
메타데이터 읽기는 문서당 1MiB·과제당 16MiB로 제한하며 원문은 반환하지 않는다.
같은 자료가 여러 과제에 반영돼도 한 번만 세며 댓글·첨부의 전체 처리 완료는 주장하지
않는다. 개별 ID가 없는 메일 일별 합계는 RAG와 날짜만으로 결합하지 않고 사선·미확인으로
표시한다. 빈 채움은 대기·실패 판정이 아니며 RAG 대상 밖 자료도 포함될 수 있다.
최근 기록은 원천마다 1건씩 보여 특정 원천이 다른 원천을 가리지 않게 한다.
구조·진단은 현재 health reason을 원인으로 사용하고 recovery history와 구분한다.
자동 조치 비대상·조회 실패·실행 시도·사후 검증은 서로 다른 상태로 남긴다.
검사 결과 다시 읽기는 저장된 검사의 재조회이며 복구나 새 검사를 실행하지 않는다.
PLAUD의 최신 실제 수집 영수증이 목록 완주·원본 보관 통과와 실패/미확인 0을 확인하고
남은 사유가 후속 처리 대기뿐이면 구조·진단에서 처리 대기로 구분한다. 이 근거는 15분
이내의 동일 run이어야 하며 더 새로운 실패 근거를 덮지 않는다. 전체 RAG 성공이나 자동
복구 검증을 뜻하지 않는다. 공급자 ID 전환 시 미대조 후보를 모두 새 녹음으로 세지 않는다.

첫 화면은 문장형 안내/큰 빈 카드 대신 창별 잔여 한도, 짧은 주의 목록, 기존 7일·30일
모델/제공자별 사용 추이, PLAUD 등록일별 막대, 모델 상태 행과 최근 자료로 구성한다.
한도·날짜·모델·자료를 선택하면 해당 근거가 옆에 열리며, 지도는 모델 상세 목록보다 먼저 보인다.
원래 사용량 화면, RAG, 근거 검색과 실제 폴더/파일 미리보기는 유지한다.

- `operations-dashboard-view.mjs`는 제공자의 실제 `window_minutes`로 Codex 창을 식별하고
  미터/실시간 관측의 같은 창을 중복 집계하지 않는다. 없는 5시간 창을 가정하지 않으며
  만료·오래된 값은 현재 잔량이 아니다. 서로 다른 창/계정의 비율은 합산하지 않는다.
- 사용 추이는 기존 `UsageTrendChart`와 원장을 재사용한다. 첫 화면의 짧은 표시만 `compact`
  옵션으로 바꾸며 AG 요청 수는 토큰과 다른 축/단위로 유지한다. 부분 계측은 표시하고
  세부 귀속/집계 설명은 해당 정보 패널과 펼침에 둔다.
- 등록 추이는 기존 PLAUD 라이브러리 index의 KST 등록일 기준이다. index 생성 시각에서
  끝나는 최근 30일을 보존 범위로 읽고 선택 기간만 표시한다. 마지막 날은 부분 날짜다.
  등록량 자체는 전체 수집량·전사 완료량·RAG 완료량이 아니다.
  중복 신원·날짜 누락·미래 시각은 제외하고 일부 집계로 표시한다. 불확실한 빈 구간은 0이 아니다.
  날짜별 열람에는 기간 내 메타데이터 최대 500개만 제공하며 제한 여부를 함께 반환한다.
- 주의 목록은 기존 보존 검사와 모델 서버 API 관측을 구분한다. 모델 등록·적재·추론 성공을
  합친 건강 점수를 만들지 않으며 활동 관측 실패도 작업 0개로 표시하지 않는다.

공유 한도/호스트 관측은 기존 설치 Board의 읽기 endpoint를 사용한다. 미리보기 HTML만
응답하고 그 원천이 내려가 있으면 해당 값은 확인 불가다. 새 수집기를 우회 생성하지 않고
설치 runtime의 소유권 검사와 기존 등록 작업을 통해 관측 연결을 복구한다.

### 로컬 모델 접속 상태

현황과 구조·진단 화면의 `로컬 모델 서버` 패널은 서버 API 응답, 모델 등록,
메모리 적재와 실제 추론 검사를 분리한다. `GET /local-model-status.json`은
고정 메타데이터 GET만 사용하며 LLM·임베딩 요청, 모델 적재/해제·시작/중지·다운로드를 하지 않는다.

- PC 응답 서버와 별도 Ollama는 private 실행 설정의 `TEAM_OPS_LOCAL_MODEL_HOST`,
  `TEAM_OPS_LOCAL_OLLAMA_HOST`로 지정한 loopback origin만 읽는다.
- 과제 RAG 모델은 pinned Path Registry의 기존 `graph_index_binding.unified.json`에서
  모델·호스트·허용 HTTPS origin을 읽는다. 같은 호스트/transport는 한 번만 조회한다.
  `TEAM_OPS_REMOTE_MODEL_LABEL`은 표시 이름이며 연결 권한이나 장치 신원을 만들지 않는다.
- Ollama의 version/tags/ps, OpenAI 호환 서버의 health/models를 읽는다.
  모델 목록만으로 GPU 적재량을 추정하지 않는다. ps의 빈 목록은 미적재이며 서버 중단이 아니다.
  API 응답은 추론 성공이 아니고, 타임아웃·접속 거부만으로 원격 장치 자체의 종료를 단정하지 않는다.
- 기존 화면의 60초 갱신 주기와 60초 요청 캐시를 사용한다. host 최대 10개,
  목록 최대 100개·요청별 5초 제한이며 일부 목록/설정 실패는 별도로 표시한다.
  캐시 재사용 전 binding을 다시 확인한다. 클라이언트는 조회 주소나 명령을 지정할 수 없다.
- 기존 모델 HTTP transport의 proxy·redirect 거부를 재사용한다. 브라우저에는 모델명과
  상태 메타데이터만 반환하며 실제 host 주소·경로·자격증명·전체 응답은 반환하지 않는다.

`/operations-console.html`은 `operations-preview.config.ts`에서 제공하는 별도 읽기 전용
미리보기다. 운영 현황, 전체 구조·진단, 데이터 공간, 사용 이력, RAG 처리, 질문·근거,
기억·맥락을 같은 탐색 안에서 유지한다. 기존 `/`, 운영 지도,
조직·업무 화면을 교체하지 않는다. 이 미리보기의 운영 lane 전환은 별도다.

- `src/core/operations-console-view.mjs`는 기존 topology·recovery·Graph Sync projection을
  재사용한다. source grant → 준비기는 코드 입력 계약이며 실제 custody 전달 성공이 아니다.
  보존된 검사 결과는 검사 시각과 함께 표시하고, 새 관측 읽기 실패는 현재 정상으로 올리지 않는다.
- 첫 화면은 Codex·Claude 및 사용 가능한 AG의 남은 한도, 관측·초기화 시각을 분리한다.
  초기화가 지났거나 오래된 값은 당시 잔량만 보존한다. 활성 작업은 기존 runtime/thread
  관측으로만 표시하고, 연결 끊김을 유휴나 작업 중으로 추정하지 않는다.
- PLAUD 라이브러리 등록 기록과 선택 과제의 현재 RAG 판본에 포함된 출처별 문서를 보여준다.
  등록 시각·DB 반영 시각·파일 수정 시각은 다른 의미다. RAG 문서 목록을 도착순으로 꾸미지 않는다.
- 주요 데이터 공간은 허용된 `data_root`의 기존 PLAUD·Slack·팀 문서·메일·과제 및
  선택 과제의 문서 검색·기억·맥락 위치에 고정한다. 기존 reader의 직접 자식 200개 검사,
  60초 캐시와 64개 폴더 캐시 한도, 보호 이름·링크 차단을 유지한다. 각 공간의 펼침을 유지한다.
- 파일 선택은 별도 GET에서만 원문을 읽는다. 경로 표 pin, 경로 요소, 링크·다중 hardlink,
  파일 identity를 확인하고 텍스트는 512KB, 이미지·문서는 8MB까지 읽는다. HTML은 실행하지
  않고 텍스트로 표시한다. PDF·PPTX·XLSX는 기존 문서 추출기와 private 파생 캐시를 재사용해
  최대 256KB 텍스트를 표시한다. 서식·전체 페이지 재현이 아니며 미지원·실패를 표시한다.
  파일 원문·경로는 외부로 전송하지 않으며 별도 창도 같은 loopback 미리보기만 연다.
- 서비스별 실제 폴더 참조는 현재 공급되지 않아 자동 연결하지 않는다. 이 경우 이유를
  명시하고 허용 위치 탐색으로 이동한다. 이름이나 폴더 관습으로 연결을 만들어내지 않는다.
- 기존 사용량 차트·기간별 집계를 재사용한다. 날짜·모델 선택은 해당 측정 행을 열고,
  기간별 작업 집계는 별개로 둔다. 모델/날짜 → TASK 귀속은 현재 계약에 없으므로 추정하지 않는다.
- 전체 구조는 기존 노드·연결 정의를 유지한다. 선택한 직접 관계 강조와 지원 그룹 접기는
  화면에만 적용한다. 검사 근거 진단은 저장된 health/recovery를 다시 읽고 범위·현재 판단·
  입력/출력·오류·복구 검증을 설명하며 새로운 probe나 복구를 실행하지 않는다.
- 질문·근거의 명시적인 POST만 기존 `askEstateGraph` 단어 검색을 호출한다. 고정 lexical
  모드·허용 과제·현재 판본·최대 12개 결과·기존 조사 예산 6회를 적용한다. 원문 질문이나
  결과를 새로 저장하지 않고 기존 private 조사 원장에 호출 메타데이터만 기록한다.
  선택 근거 분포와 문서→청크 소속을 보여주며 실제 DB 엣지 탐색 기록으로 주장하지 않는다.
- 기억·맥락은 기존 과제 저장 공간을 읽는다. 빈 공간·읽기 실패·분류 근거 미제공을 구분하며
  단기·장기·추론 기억을 새로 생성하지 않는다. 3D, 새 수집·진단 실행·자동 복구·LLM 호출은 없다.

`src/server/operations-spaces-adapter.mjs`는 고정 공간·최근 등록·파일 미리보기·수동 검색의
최소 결합을 소유한다. 요청은 직접 loopback, 허용 Host와 같은 Origin만 받는다.
`operations-workspace.tsx`와 `operations-system.tsx`가 이 UX를 표시한다. 원래 운영 설치본의
수집·검색·권한·저장 계약과 스케줄은 변경하지 않는다.

검증은 Board test/typecheck, UI workspace acceptance, 전용 미리보기 build와 실제 브라우저의
현황·진단·준비기 입력·폴더 다중 펼침·사용량 선택으로 수행한다. 실제 캡처는 private
`local-recovery/`에 보관한다. 전체 운영 연결 또는 업무 성공을 수락한 결과는 아니다.

## 운영 지도 첫 화면 후보

진단 표시는 원래 health 계약을 바꾸지 않고 `이상 신호 / 처리 보류·재시도 / 관측·검사 문제 /
미확인 / 정상 관측`으로 해석을 구분한다. 읽기 한도·경로 접근 오류를 프로그램 정지라고 쓰지
않으며 정상 수집기의 보류 건수도 별도 표시한다. 지도에서 수집 감독·원장 검증·Gmail 출력은
실제 중간 노드로 표시하고, 검증 요청은 자료 전달선과 구분한다. 생략한 노드를 건너뛴 가짜
자료 연결은 만들지 않는다.

2026-09-14 화면 피드백 반영: 기본 진입은 기존 Board `/`의 대시보드(실시간 현황)이며 토큰·기간·모델별 그래프와
기존 진단을 유지한다. 운영 지도·디렉터리는 같은 주 메뉴 안의 하위 화면으로 연다.
사용량·진단은 스레드 목록의 로딩 게이트 밖에서 자기 근거로 표시하므로, 스레드 관측 오류가
독립적으로 읽힌 그래프를 숨기지 않는다. 검토용 4194는 한정된 GET snapshot만 운영 4192에서
읽으며 갱신 강제 인자·임의 목적지·writer 요청을 중계하지 않는다(10초 캐시).

지도는 실제 노드의 역할별 박스·원통·원형과 얇은 자료 간선으로 표시한다. 같은 원천의
수집·보관을 같은 행에 놓고, 감시·백업·운영 원장은 지원 영역에서 따로 펼친다. 노드 선택 시
직접 연결만 강조하고 오른쪽에 근거를 연다. 집계된 단계 간선을 실제 연결로 바꾸지 않으며,
현재 전달 연결이 없는 맥락 엔진 입력·에이전트 응답은 여전히 분리돼 있다. 노드의 크기와
포트는 동일한 도형 치수로 고정하고, 비동기 원천이 도착하면 전체 노드를 다시 맞춰 보여준다.

`/operations-map.html`은 운영 지도와 디렉터리 두 탭의 읽기 전용 후보다. 기존 `/`와
`/forge-world.html`은 그대로 유지한다. `operations-preview.config.ts`로 별도 loopback
4194 미리보기를 실행하며 운영 4192 설치본·DB·예약작업은 이 변경으로 갱신되지 않는다.

| 재사용 원천 | 표시 및 변경 범위 |
| --- | --- |
| federation / unified topology view | 기존 stable ID·구조 간선·exact-ID 건강 overlay, 화면 전용 단계 묶음 |
| Watchtower 저장 snapshot | `/operations-health.snapshot.json`은 기존 adapter의 snapshot-only 모드; 새 probe 없음 |
| recovery projection v3 | 마지막 조치와 사후 검증 통과 시각을 별도 표시 |
| AI Usage Meter | 기존 등록 TASK 범위 누적·부분 측정값과 시각, 60초 cadence |
| Context Engine 구현 계약 | 청킹·임베딩·Neo4j·검색·맥락 조립; 영수증 없는 실행은 미확인 |
| 기존 Graph Sync 영수증 | 명시된 과제의 최신 회차만, 60초 캐시; DB 되읽기 확인 없이 처리 완료로 표시하지 않음 |
| Path Registry root table | 기존 pin·root 해석을 재사용한 직접 자식 메타데이터 탐색 |

첫 버전은 필터·펼치기·이동·팬/줌을 화면 메모리에서만 적용한다. 구조 간선에는 전달 중
효과가 없고, 등록과 현재 건강 및 근거 신선도는 다른 축이다. 요약 간선은 등록된 data
관계의 원래 노드·방향을 보존하며 개별 노드 상세에는 다른 관계도 보존한다. 일부 준비 단계가 연결돼 있어도
원본 보관에서 맥락 엔진 준비기로 이어지는 전달을 증명하지 않는다. 복구 성공 영수증도
현재 건강으로 승격하지 않는다. 원천 없는 수치·읽기 실패·부분 범위는 0이나 전체로 바꾸지 않는다.

미리보기 실행(앱 폴더): `node ../../node_modules/vite/bin/vite.js --config operations-preview.config.ts`.
선택적인 연결은 명시적 환경값으로만 주입하며 주소 기본값이나 디스크 자동 발견은 없다:

- `TEAM_OPS_DIRECTORY_ROOT_TABLE`, `TEAM_OPS_DIRECTORY_ROOT_TABLE_SHA256`: 기존 private root table과 pin.
- `TEAM_OPS_GRAPH_RECEIPTS_ROOT`, `TEAM_OPS_GRAPH_PROJECTS`: 기존 회차 영수증 root와 쉼표 구분 과제 allowlist.
- `TEAM_OPS_RESPONSE_AGENT_LABEL`: Owner가 지정한 응답 에이전트 표시명(상태·연결 근거는 아님).
- 기존 `SOULFORGE_STATE_ROOT` / `SOULFORGE_OWNER_ROOT`: Watchtower·사용량 상태 위치.

예약 실행은 임의 환경변수를 자식에게 넘기지 않으므로, 운영 설치에서는 같은 다섯 읽기 설정을
`<state_root>/operations/team_ops_board/operations_read_config.json`에 둘 수 있다. 설정은 위
`TEAM_OPS_*` 다섯 키의 문자열만 허용하며 명시적 환경값이 우선한다. 파일 부재는 미연결,
손상·알 수 없는 키는 시작 거부다. 수집기·writer·프로세스 플래그는 이 설정에 넣을 수 없다.

디렉터리는 파일 본문을 열지 않고, `secret_owner_root`·보호 이름·경로 이탈·ADS·링크를
거부한다. 직접 자식 최대 200개, 깊이 24, 캐시 64폴더/60초이며 제한에 걸리거나 읽기 실패가
있으면 partial이다. 폴더 크기는 미집계다. 새 기능은 기존 federation provider의 안정 ID,
노드·연결, 별도 관측 공급자를 등록하면 같은 화면으로 들어오며 기본 분류는 관측·지원이다.
맥락 엔진 전용 표시 정의는 `src/core/operations-map-view.mjs`의 작은 구현 계약 목록이다.
현재 이 목록은 federation 등록·실행 정상 또는 운영 배포를 주장하지 않는다.

검증: 앱 typecheck/test, `npm run ui:done:check`, 브라우저 지도·상세·그룹·검색·디렉터리 확인.
실제 화면 캡처와 host-local 실행 설정은 private local-recovery에만 보관한다.

## 세계와 작업대 개발 후보

`/forge-world.html`은 같은 빌드에 포함된 2.5D 해안 기지의 읽기 화면이다. Soulforge 개발과
프로젝트 부지를 분리하고, `/project-coverage.snapshot.json`이 고정된 메타데이터 파일을
읽는다. 관측 미연결·구판·상충은 그대로 표시하며 셀 수를 고유 슬롯 수로 세지 않는다.
현재 구성의 과제는 `SOULFORGE`, `P26-014`이고 생산 파일이 없으면 미확인이다.
관측 시각을 새로 읽은 시각으로 갱신하지 않는다. 사옥 사진은 외형 참고이며 원본 이미지나
지도 화면을 배포 자산에 넣지 않는다. `forge-world.html`은 Vite의 명시적 진입점이므로
개발·설치용 빌드 모두 같은 JS/CSS 번들을 사용한다.

작업대의 `workbench-intake-record`와 `workbench-intake-store`는 접수와 업무 결속을 분리하고
원자적인 create-only 기록·멱등 재생을 제공한다. 최대 256개/기록 32KiB의 제한이 있는
저장 범위에서 수정 요청은 같은 요청자·과제·제품·WP·단계·산출물·종류의 기존 parent를
지목하고 판본 번호를 하나 올려야 한다. 같은 parent의 다음 판본은 하나만 저장하고,
동일 요청 재시도는 기존 판본을 돌려준다. 비교와 쓰기는 같은 저장 잠금 안에서 수행한다.
Windows 잠금 삭제 경합으로 새 잠금 열기가 거부되면 정본 검증을 다시 통과한 동일 요청만
읽기 전용으로 재생한다. 권한 오류를 재시도하거나 잠금 없이 새 기록을 쓰지 않는다.
이는 parent 수락이나 실행 완료를 뜻하지 않는다. 이 구현은
초기 저장소다. `workbench-intake-adapter`는 별도 서버가 현재 인증·CSRF·과제 근거와
명시적 격리 저장 root를 공급해야 한다. 기본 OFF 또는 read-only pilot에서는 POST가
405이며 이 Vite 설정에 접수 writer를 자동 등록하지 않는다. 요청의 `RECORDED`와
서버 저장 확인은 실행·외부 송신·사람 수락을 뜻하지 않는다. 실제 현재 근거 공급자와
실행 조정기 연결, 운영 배치, 전원 손실 내구성은 이 초기 저장소 시험의 주장 밖이다.

검증: `validate:forge-world`, `validate:workbench-intake`, Board build와 기존 read-only 경계.

The normal Board is a local, read-only, metadata-only projection of actual Codex
threads. It does not use the former synthetic Owner Inbox in its normal UI.

Visibility has one authority: a local enrollment record containing the
**exact `thread_id`**. The adapter may append a new child record only from an
exact active parent-child edge returned by the official local app-server or an
exact fresh `SubagentStart` identity already validated by the Meter. A matching
title, workspace, prefix, age, or idle state never enrolls a thread and never
creates a card.

Every enrollment also carries an owner-provided `display_label` for the Board
card and detail title. It is local metadata only: app-server names and titles
are never used. Labels are NFKC-normalized, single-line, control-free, and
length-bounded; filesystem- or URL-like values are rejected.

## What the Board shows

- **Owner 현황**: only an explicit, metadata-only `result_ready` gate whose
  target is `owner`. Root rows, internal responsibility rows, idle, Stop, title,
  age, and LLM interpretation never create Owner attention.
- **LIVE STATUS 연결 표시**: `활성 세션`은 현재 `active`와 `waiting`만
  합산한다. 파란 `결과 확인`은 별도 작업 gate이며 연결 여부가 아니다.
  각 행의 원형 표시와 보조 문구는 실제 실행 관측을 초록(연결),
  주황(응답 대기), 회색(연결 종료/미확인)으로 따로 표시한다.
- **조직도**: an exact enrolled `parent_thread_id` topology with two persistent
  display scopes. `실시간만` shows only actionable execution, approval-wait,
  and result-confirmation nodes plus every exact company/CEO/manager ancestor;
  `전체 조직` retains all fixed company/CEO/manager anchors. Two actionable
  TASKs therefore show both TASK nodes and each exact responsibility path,
  without title-based or inferred ancestry.
- **업무·기록**: current internal work, parent-targeted result delivery,
  browser-local Owner read receipts, accepted/closed history, and the separate
  AI Usage Meter aggregate entry.
- **Watch strip (기본 OFF, `?watch=1`)**: `guild_hall/watch_panel_contract`를
  단일 원천으로 소비하는 9-domain full-coverage 건강 스트립. `main.tsx`에서
  lazy 로드로 gate되어 flag 없는 기본 Board는 strip 모듈 체인을 아예 로드하지
  않는다(토글은 리로드 필요). 무증거 domain은 `unknown`으로 렌더되며(무증거≠정상),
  실공급자 3/9 — `connector_freshness`(receipt-expiry projection),
  `hpp_host`(host-stats, 측정≠단언), `hermes_runtime`(agent-runtime envelope;
  clock-less source-asserted hold 생존) — 는 source-asserted 값만 번역한다
  (`src/core/watch-panel-view.mjs`, `src/core/watch-evidence-suppliers.mjs`,
  검증 `npm run validate:watch-panel-board`). 표시 전용: probe·writer·요청
  filing 없음.
- **시스템 토폴로지**: Watchtower W1의 local read-only health projection.
  정상 이외의 모든 노드는 `추적 필요` 큐에서 고정 사유, 근거 소유자,
  마지막 점검/다음 Watchtower 점검/다음 근거 기한 및 복구 가능 범위를 함께 보여준다.
  W1 추적 계약은 `topology_health.v2`이며 producer와 Board를 함께 배포해야 한다. `다음
  점검`은 Watchtower의 5분 재검사, `근거 기한`은 원천 증거 시각과 probe period로 계산한
  별도 마감이다. 이 큐는 복구 버튼이나
  실행 권한을 제공하지 않는다.
  장치 종류는 입력·감독·연산·저장·판단·출력의 외곽 도형으로, 상태는
  정상(초록)·열화/신선도(주황)·미감시 구조(파랑)·정지(빨강)로 분리한다.
  각 간선은 source의 오른쪽 OUT에서 target의 왼쪽 IN으로만 연결되며,
  노드 선택은 직접 연결된 1-hop 경로만 강조한다. 간선은 구조 방향이며
  per-edge receipt가 없는 현재 전송 중 상태를 추정하지 않는다.
  The scheduled Board worker also hosts a separate five-minute evidence and
  bounded-recovery companion. It validates Watchtower execution, five-field
  metadata ledgers, and `_workmeta` payload policy into independent sanitized
  receipts. Safe task restart is possible only for ignored-local exact task
  bindings with matching action digests and successful pre/post verification;
  provider login, deletion, acknowledgement, upload, routing, external send,
  and partial mail backlogs remain manual/HOLD.
  Every non-green tracking row includes an immediate read-only diagnosis refresh
  and a sanitized recovery-history view. The latter reports whether the existing
  five-minute recovery companion succeeded, denied, or failed an allowlisted
  action; it never grants a new browser-side repair authority.
  A healthy Hiworks collector may also carry a separate `retrying` or `held`
  advisory with a sanitized item count and next attempt time. This keeps
  collector liveness green without hiding unresolved delivery work. Gray nodes
  are summarized as evidence-unconnected structural, provider-evidence, or
  on-demand entries; they are not treated as failed programs.
  Edge evidence is also split into observed receipts, absent receipt channels,
  state-observation-only controls, and structural-only relations. A declared
  line is never presented as live delivery.
  `unmonitored` 공급자 관계는 관측된 공급자 health가 아니라 구조/카탈로그
  관계다. 노드는 색만으로 표시하지 않고 `관측 미구성`과 safe reason을
  함께 보이며, 이는 Claude·Antigravity의 현재 성공·정상이나 독립적 공급자
  증거를 뜻하지 않는다. `REFRESHING`, `HOLD`, 또는 `STALE`은 보존된 토폴로지
  snapshot을 표시할 수 있으나, 그 snapshot도 공급자 성공이나 per-edge receipt를
  주장하지 않는다. projection은 마지막 성공/실패의 age를 텍스트로 표시하며,
  `null` age는 해당 기록이 없음을 뜻한다. 같은 화면 아래의 선언 구조 렌즈는
  별도 근거이며 W1 health와 합쳐지지 않는다(아래 `AX declared-structure
  federation lens` 참조).
- Current registered `manager`, `task`, `verifier`, and `continuation` rows,
  grouped by owner-provided `organization_group_id`; `parent_thread_id` is
  validated for exact parent existence and acyclicity before it reaches the
  browser.
- Safe status labels only: `실행 중`, `입력·승인 대기`, `결과 확인`, `응답 종료 · 결과 미확정`, `상태 신호 없음`, `상태 관측 오류`, `하위 결과 도착/취합 중`,
  `Owner 확인 필요`, and history-only `수락·종료 이력`.
- Local-only health, partial coverage, last refresh, registered/unseen counts,
  result-gate health, and a generic unregistered discovery count.
- `실제 TASK · 조직 route 미확정 · 자동 라우팅 HOLD` until a separate exact
  binding is supplied. Enrollment is never route catalog or live-binding
  authority; `execution_ready` remains false by default.

The browser can acknowledge only an explicit Owner-targeted result or
escalation. The acknowledgement key includes `thread_id` and `updated_at`, so a
subsequent explicit lifecycle update reappears automatically. This changes
browser `localStorage` only; it never changes, archives, creates, deletes, or
messages a Codex thread.

Each major panel on the Fleet, organization, work/history, and system-topology
surfaces also has a presentation-only `접기` / `펼치기` control. The first visit
shows every panel. The browser stores only a versioned allowlist of collapsed
panel identifiers in `localStorage`, so manual refreshes and accepted live data
updates keep the Owner's layout preference. Invalid, unknown, or inaccessible
storage fails open to the fully expanded layout. This preference does not stop
polling, change any snapshot, or grant runtime/repair authority.

## 대장간 첫 화면 (forge map)

The first tab is `대장간`, the default landing surface. It answers one question
in a single read-only screen: **is our own structure actually running right
now** — is anything coming in, what is broken, where the custody copies sit, and
how many tokens were spent. The agent organization chart and the Codex thread
board stay where they were (조직도 / 업무 현황·이력 tabs); Buzz is the surface
that shows agents, so the first screen does not repeat them.

The layout reuses the three bands of the 총괄 forge map: 사람의 물길
(Buzz → Hermes 봇 → Tongs → World Tree → Vigil), 자료의 물길
(Tributary → Heartwood → Reliquary, with Hearth alongside), and 받치는 것
(Bellows · 외부 작업 사이클 · Rune · Quench). Each part is one box coloured by
its live state.

`src/core/forge-map-view.mjs` is the whole calculation: a pure function with no
fetch, timer, file, or writer. It owns the node→part map, so a new Watchtower
node must be given a home there (a paired test walks the tracked
`guild_hall/watchtower/topology.mjs` node list and fails when one is
unmapped). A node the map does not know is **not** hidden: it lands in a `기타`
box whose count is shown on screen.

| 부품 | 근거 | Watchtower 노드 |
| --- | --- | --- |
| Buzz | 없음 (회색) | — |
| Hermes 봇 | topology | `src_agent_runtime` |
| Tongs | `/tongs.snapshot.json` | — |
| World Tree | topology | `consumer_timeline` |
| Vigil | topology | `consumer_board`, `watchtower_self`, `codex_retention_report` |
| Tributary | topology | `src_hiworks`, `src_plaud`, `src_slack`, `src_onedrive`, `src_gmail`, `src_linear`, `src_buzz`, `ingress_supervisor`, `mail_forwarder`, `slack_batch`, `local_activity`, `linear_collect`, `buzz_collect`, `voice_label_worker` |
| Heartwood | topology | `store_mail_events`, `store_voice_custody`, `store_slack_custody`, `store_activity_outbox`, `store_usage_ledger`, `store_linear_custody`, `store_buzz_custody` |
| Reliquary | topology | `backup_buzz_server`, `backup_agent_runtime`, `store_backup_generations` |
| Hearth | topology | `src_codex`, `src_claude`, `src_antigravity`, `usage_codex_collector`, `usage_claude_collector`, `usage_antigravity_collector`, `usage_meter` |
| Bellows | `/scheduled-tasks.snapshot.json` | — |
| 외부 작업 사이클 | `/secure-work.snapshot.json` | — |
| Rune | 없음 (회색) | — |
| Quench | topology | `gate_five_field`, `store_workmeta` |

A part's colour is a deterministic priority fold over its contributing states:

```text
hold > down > stale > degraded > unknown > ok
```

`unknown` outranking `ok` is the point of the screen. A part whose every node is
`unmonitored`, or which has no evidence supplier at all, stays grey — never
green (plan 08 §Health model: missing evidence is `unknown`, not green). The
Watchtower node vocabulary is folded into this one by mapping `unmonitored` to
`unknown` only; `ok`≙plan-08 `healthy` and `down`≙plan-08 `unavailable`. A state
string this screen does not recognise is raised to `hold`, never silently
ignored. Two parts (Buzz, Rune) and one supplier (Tongs, until its lane writes a
heartbeat) are grey today, which is the honest answer: Vigil has no probe for
them yet.

Alongside the map: 고장·주의 (degraded/down/stale nodes with reason codes and
their part name), 자원 (host-stats CPU/memory/disk/uptime), 토큰·크레딧 (the AI
usage meter's own day/week/all-time totals and its own per-provider daily row —
this surface invents no new arithmetic, it reuses the usage tab's functions),
저장·백업 (storage map state, honestly `unknown · storage_map_binding_unconfigured`
until the private binding pair exists, plus the World Tree submission-pending
count), and the Bellows table. Selecting a part opens a read-only inspector with
that part's nodes and reason codes; the only navigation is back to the existing
시스템 토폴로지 tab. The surface polls its own four snapshots every 60 seconds and
holds no writer, action request, or repair control.

### Bellows scheduled-task read projection

`GET /scheduled-tasks.snapshot.json` (`src/server/scheduled-tasks-adapter.mjs`)
is loopback-only, GET-only (`405` otherwise, `403` for a remote caller),
`no-store` + `nosniff`. On Windows it runs exactly one PowerShell structured
query behind a 60-second TTL cache and a single-flight guard: `Get-ScheduledTask
| Where-Object { … } | ForEach-Object { Get-ScheduledTaskInfo … } |
ConvertTo-Json`; on any other platform it never spawns anything and returns a
fixed `unavailable`. A non-zero exit, a spawn failure, a timeout, oversized
output, or a JSON payload that does not match the expected five-field shape is
the same fail-closed `unavailable` (`scheduled_tasks_output_malformed` covers a
parse failure, a missing or extra field, a wrong field type, or a name that
fails its own shape check) — a partial list is never reported as `ready`.

Only tasks whose name starts with `Soulforge-`, `Buzz`, or `Hermes` are
projected; every other scheduled task on the host is dropped, since the name
alone can describe the Owner's unrelated software. A well-formed name outside
that prefix set is ordinary filtering and is simply excluded, not a fault. The
projection carries **name, status, last run, last result, next run, a derived
`healthy` boolean and a count of same-named entries collapsed into this row**
— nothing else. The PowerShell script selects only five fields (`TaskName`,
`State`, `LastRunTime`, `LastTaskResult`, `NextRunTime`) and never selects
`Actions` (command line and arguments), `Principal` (the run-as account),
`Author`, `TaskPath`, or `HostName` — the guarantee is a fixed five-field
allowlist chosen on the PowerShell side, plus a strict name pattern and prefix
check on the Node side, not the absence of a parsing step to exploit. Task
names arrive already reduced to their leaf form by `Get-ScheduledTask` itself,
and run times are folded to a locale-free `YYYY-MM-DD HH:MM` (an unparsable
time becomes `null`, never a passed-through string). `healthy` is true only
for last results `0`, `267009` (running) and `267011` (not yet run) on a task
that is not `Disabled`; an unreadable result code is not green. The adapter
contains no create/delete/run/end/change verb.

An earlier CSV-parsing implementation (`schtasks /query /fo csv /v`) could
silently lose rows — an unescaped `"` in another task's command-line column
made the parser merge several physical lines into one, which then failed its
own name check and was dropped without moving `state` away from `ready`. The
current PowerShell object pipeline has no console text to parse, so that
failure mode does not apply; a permission explanation (a lower-integrity shell
seeing fewer tasks) was considered and ruled out on this host — the same
non-elevated process enumerates the full allowlisted set.

### Tongs heartbeat and 외부 작업 사이클 read projections

`GET /tongs.snapshot.json` (`src/server/tongs-heartbeat-adapter.mjs`) and
`GET /secure-work.snapshot.json` (`src/server/secure-work-status-adapter.mjs`)
each read exactly one file under the resolved state root — `operations/tongs/
heartbeat.json` and `operations/secure_work/status.json` — with the same state
root precedence every other adapter uses (`SOULFORGE_STATE_ROOT` >
`SOULFORGE_OWNER_ROOT` > this checkout's `guild_hall/state`). Those files are
written by their own lanes; Vigil only reads them. Both endpoints keep the same
loopback/GET/`no-store`/`nosniff` guards and a 30-second TTL cache, and neither
holds a writer verb.

Three states, and the difference between the last two matters: `ready` when the
document validates, `unknown` when the file is simply absent (no evidence, grey
on the map), and `unavailable` when a file exists but breaks its schema (an
observed fault, amber on the map).

The Tongs projection carries `status` (`listening` / `starting` / `stopped`), the
observation time, an age, a freshness boolean against a 900-second window, and
the listening loopback port as an integer. `pid` and the `listen` host string are
validated and then dropped — a non-loopback listen address is a schema violation
rather than a value to display. A stale heartbeat keeps its last known status and
is shown as `낡음`, never as current; a future timestamp is never called fresh.

The 외부 작업 사이클 projection carries the observation time and a
state→count map only. `last_job` and `last_receipt_ref` are shape-checked and
then discarded: this panel answers "how many, in which stage", never "which
one".

## 디자인 토큰(한 원천)

`src/design/design-system.mjs`가 색 역할·타이포그래피·도형 어휘·간격/반경/
입체/모션·테마 정책의 유일한 원천이다(UX 재설계 지시서 v1 §3, S1). 순수
데이터 + 순수 함수만 담고 fetch·DOM·타이머·writer가 없다 — 기존
`src/core/*.mjs`와 같은 경계다. (이 파일은 원래 `tokens.mjs`였다 — 파일명의
`token` 부분 문자열이 `.gitignore`의 `*token*` secret deny와 path-policy의
secret-like-path 스킵에 동시에 걸려 실제로는 스캔되지 않고 있었다. 2026-09-06
fresh review로 `design-system.*`/`lint-literal-colors.*`로 이름을 바꿔 그
경계를 벗어났다 — "토큰"이라는 말 자체는 계속 쓴다.)

- `src/design/design-system.mjs` — 원천. 토큰 이름은 역할을 말하고 색 이름을
  쓰지 않는다(`--sf-accent`는 되지만 `--sf-orange`는 안 된다 — 이 규칙은 값에도
  적용된다, 예: 도형 어휘 값). 이 파일이 literal color를 가져도 되는 유일한
  파일이다.
- `src/design/emit-css.mjs` — `design-system.mjs` 값을 `:root` +
  `[data-theme="light"]` CSS 커스텀 프로퍼티 문자열로 렌더링하는 순수 함수와,
  그 결과를 커밋된 `src/design/design-system.generated.css`에 쓰는 CLI
  (`node src/design/emit-css.mjs --write`)다.
- `src/design/palette.mjs` — 같은 토큰에서 파생한 Canvas 세계 팔레트
  (`worldFills`, `semanticStrokes`, `forgeColor(role, theme)`). 이 파일도
  literal color가 없다 — 전부 `design-system.mjs`를 재노출한다.
- `src/design/FONTS.md` — IBM Plex Sans KR/Mono self-host 방침과 폴백 스택.
  이 lane은 폰트 파일을 내려받지 않는다.

`npm run validate:design-system`(구문 검사 3개 + `node --test
src/design/*.test.mjs`)가 로컬 빠른 루프다. 같은 테스트가 이 앱의 기본
`npm test` glob에도 들어 있어(`src/design/*.test.mjs`) `validate:team-ops-app`
→ `done:check` 경로로 CI에서도 돈다 — 두 경로 모두 같은 테스트 파일을 돈다.
고정하는 계약: 토큰 이름(과 값)에 색 단어 없음, 생성된 CSS의 모든 `--sf-*`
변수가 토큰과 왕복 일치, 팔레트 값이 토큰 값과 같음, `[data-theme="light"]`가
기존 토큰만 재정의, 그리고 `src/design/**` 안 literal color(hex 또는
rgba·hsla 함수)가 `design-system.mjs` 바깥에 없음(`lint-literal-colors.test.mjs`
— 저장소 전체 검사는 이후 단계의 `lint:tokens`가 넓힌다).

테마 극성은 Vigil(team-ops-board, 포트 4192) 전용이다 — dark-first 2-state
(`:root`=dark 기본값, `[data-theme="light"]`=명시적 override, OS의
prefers-color-scheme에는 반응하지 않는다). World Tree(코드 dev-erp, 포트
4300)의 문서 화면은 이 극성을 쓰지 않는다 — 별도의 light 전용 스타일시트(S8)를
쓴다.

이 토큰은 아직 `App.tsx`나 `team-ops.css`에 배선돼 있지 않다(그 배선과 기존
literal hex 치환은 각각 후속 단계 몫이다). S1은 원천만 만든다.

## Local endpoint and privacy boundary

### Storage & Backup Map read projection

The Board registers exact loopback-only `GET /storage-map.snapshot.json` through
`src/server/storage-map-adapter.mjs`. Non-GET requests return `405`, remote
callers return `403`, and the endpoint has no writer or repair surface. It is
default-OFF: both `TEAM_OPS_STORAGE_MAP_BINDING` and
`TEAM_OPS_STORAGE_MAP_BINDING_SHA256` must be present at Vite process start.
The first value names an absolute local binding file and the second pins its
exact bytes; the binding in turn pins the snapshot bytes and exact Path Registry
snapshot digest. Stable-file identity checks reject symlink, hardlink and read
race drift.

Only the exact `soulforge.watch_storage_map.v0` /
`backup_readiness_overlay` envelope, complete registry-driven rows, recomputed
aggregate and top-level `observed_at` may reach the browser. Schema/digest/raw/
path/timestamp drift becomes a fixed metadata-only `unavailable` response with
no local path or exception text. Without the private binding pair the endpoint
stays unconfigured; this server seam does not fabricate a public-seed snapshot
or claim actual backup readiness.

### Agent Runtime read projection

The Board registers `GET /agent-runtime.snapshot.json?read_only=1` for loopback
clients only. The exact query is required, non-GET methods return `405`, and
non-loopback callers return `403`. Responses are JSON with `Cache-Control:
no-store` and `X-Content-Type-Options: nosniff`.

The endpoint consumes the provider-neutral Agent Runtime read Module. Its Hermes
Adapter requests only `session.active_list` with `metadata_only: true`; it never
calls session history, free-form status, usage, activation, or the Hermes state
database. Unknown fields and raw-bearing keys such as title, preview, messages,
prompt, reasoning, tool bodies, cwd, paths, or credentials fail closed before a
projection reaches the browser.

An unconfigured manual 4192 or 4193 runtime deliberately supplies neither an
authorized Hermes transport nor exact Bot-to-session bindings. With the optional
environment values absent, the endpoint and UI return a fixed `HOLD`/`UNKNOWN`
projection.
The tracked roster assigns Owner-approved public-safe identities to `제품 총괄`
(`bot-hermes-default`) and the prestart candidate `MSH 음탐기 핵심부품 3종 착수준비 팀장`
(`bot-hermes-msh-vds2093-core3-prestart-manager`). The MSH candidate keeps a null
durable-session binding until an exact project-specific Hermes session receipt is
approved, so it remains `UNKNOWN/HOLD` rather than implying readiness. `Ox 제작자`
and `Ox 검토자` remain explicitly unbound. These public `bot_id` values are
UI/runtime identities only. They are not routes, projects, authority grants, or
long-term context handles. Display labels are never used to infer identity, and
only the exact `bot_id` can match a live row.

An optional local binding is enabled only when both
`TEAM_OPS_HERMES_AGENT_RUNTIME_URL` and
`TEAM_OPS_HERMES_AGENT_RUNTIME_BINDINGS` pass their complete validation. The URL
must be exact loopback HTTP on an explicit port from 1024 through 65535 and end
at `/api/agent-runtime/active-sessions`, with no user information, query, or
fragment. The bindings value must name an absolute local regular non-symlink
file. That file must be a stable, bounded, metadata-only
`soulforge.team_ops_board.agent_runtime_bindings.v1` document containing only
`bot_id`, `agent_id`, `display_label`, and nullable `hermes_session_key` rows;
all non-null identities must be unique. No local URL, path, session key, or
credential value belongs in this repository. The `agent_id` and durable Hermes
session bindings for both tracked cards therefore remain local ignored runtime
data rather than tracked identity metadata.

The upstream read succeeds only for HTTP 200 JSON with `no-store`, `nosniff`,
and the exact `hermes.agent_runtime_active_sessions.v1` read-only root. It accepts
at most 64 rows with the seven allowlisted session fields and the observed
states `working`, `starting`, `waiting`, or `idle`. A truncated, malformed,
oversized, raw-bearing, or otherwise non-exact response becomes fixed `HOLD`.
Missing, one-sided, or invalid configuration never creates a partial binding or
performs a fetch. Transport failure discards prior positive state, so stale
`working` is never retained.

Vite reads and validates the two optional values at process startup. After the
Owner supplies or changes both local values, the 4192 development or 4193
preview process must be restarted before the new binding can be considered.
This wiring remains a read-only, fail-closed integration surface; it does not
install or restart Hermes, add credentials, or grant provider mutation.

The Owner-approved Scheduled Task Pilot is narrower and deterministic. Its
controller supplies the fixed local read endpoint
`http://127.0.0.1:9120/api/agent-runtime/active-sessions` together with the
binding path derived under the validated owner root at
`guild_hall/state/operations/team_ops_board/agent_runtime_binding.v1.json`.
Both values are rebuilt together in process memory; caller-supplied replacements
cannot override them. The manual worker environment boundary forwards either
Agent Runtime value only when its value is already a string and still drops
unrelated values. A missing binding file, a one-sided manual configuration, or
an unavailable listener remains the same fail-closed `HOLD`; no title, cwd,
credential, or secret is used to derive or complete the pair.

### ERP pending review read projection (검사 중)

The Board registers `GET /erp-pending-reviews.snapshot.json?read_only=1` for
loopback clients only: exact query, `405` for non-GET, `403` for remote
callers, `no-store` and `nosniff` (the same base guards as the Agent Runtime
endpoint), plus one guard specific to this endpoint — a request carrying any
proxy-passage marker header (`X-Forwarded-For`, `X-Forwarded-Host`,
`X-Forwarded-Proto`, `Forwarded`, `Tailscale-User-Login`) is rejected `403`
even from a loopback socket, checked before the method. Tailscale Serve can
proxy a tailnet peer's request to this host's `127.0.0.1`, so a loopback
socket address alone no longer proves the caller is the Owner's own local
process (Level 2 review finding M1). It feeds the owner-surface panel
"검사 중 · ERP 제출 대기" (Team Pilot plan 18 §12: one read-only panel plus one
safe link, no writer). The panel never approves, completes, or changes a task;
acceptance stays a human action on the ERP loopback screen, and Linear `done`
stays a human click.

Two modes, both honest:

- **Link-only (default).** Without `TEAM_OPS_ERP_REVIEW_TOKEN_FILE` the endpoint
  returns a fixed `soulforge.erp_pending_review_read_projection.v1` HOLD with
  `hold_code: ERP_REVIEW_UNCONFIGURED`, zero counts, and the safe link
  `http://127.0.0.1:4300/?view=mod:reviews` (the ERP web "검사 중" filter; it only
  opens in a browser on the Main Node itself). No upstream request is made.
- **Read and link.** When `TEAM_OPS_ERP_REVIEW_TOKEN_FILE` names an absolute local
  one-line credential file that the Owner placed under the private lane
  credential root (the Board never learns that root; a shape check only:
  regular non-symlink file, 16-512 bytes, no BOM, exactly one line, no
  whitespace), the adapter performs one bearer `GET /api/mcp/reviews/pending`
  against `TEAM_OPS_ERP_REVIEW_URL` (optional; default
  `http://127.0.0.1:4300/api/mcp/reviews/pending`, loopback http on an explicit
  port only). The file is re-read before every upstream read, so placing,
  rotating, or removing it needs no Board restart; the value goes into the
  Authorization header and nowhere else. Because each bearer read is audited by
  the ERP as an `mcp_tool_call` event, the adapter serves a cached projection for
  60 seconds and the panel polls every 5 minutes ("다시 읽기 (최대 60초 캐시)"
  manual button, which surfaces the cache honestly rather than bypassing it).

The transport itself still reads the exact ERP envelope and validates every
row (proposal and work-session ids, refs, submitter, timestamps, item status;
submission summaries and item titles are validated then discarded so raw work
text never reaches this process). None of that per-row detail leaves the
adapter, though: the projection this endpoint serves to the Board carries
**counts and a status distribution only** — proposal/work-session counts, an
unaccepted count, an unknown-status count, a pending total, the observed-at
time, and the safe ERP link. There is no username, item id, project id,
proposal id, or work-session id anywhere in the response (Level 2 review
finding M1). A `ready` snapshot whose own `erp_link.url` fails the loopback
check is treated as `ERP_REVIEW_RESPONSE_MALFORMED` rather than silently
rendered with the default link substituted in (M6). Every failure becomes a
fixed hold code shown in the panel with a Korean reason and without any path,
token, or exception text: `ERP_REVIEW_CREDENTIAL_MISSING`,
`ERP_REVIEW_CREDENTIAL_INVALID`, `ERP_REVIEW_CREDENTIAL_PATH_INVALID`,
`ERP_REVIEW_URL_INVALID`, `ERP_REVIEW_DISCONNECTED`, `ERP_REVIEW_TIMEOUT`,
`ERP_REVIEW_UNAUTHORIZED` (expired/revoked token or non-admin account),
`ERP_REVIEW_ROUTE_DISABLED` (the ERP runs without `DEV_ERP_MCP_REVIEW_READ=1`,
which only the Owner/cutover session turns on), `ERP_REVIEW_RATE_LIMITED`,
`ERP_REVIEW_RESPONSE_MALFORMED`, `ERP_REVIEW_RESPONSE_OVERSIZE`. Names,
titles, and item/project identifiers stay behind the ERP's own loopback
"검사 중" filter (post-login, Owner surface) — this Board panel only ever
answers "how many, and what state", never "which one".

"검사 중" means: `ai_proposal` rows still `pending` plus MCP work-session
submissions whose task is not yet `done`/`archived`. An older ERP envelope
without `item_status` is accepted and counted as "상태 미확인" rather than as
pending. The ERP MCP token has no per-tool scope, so the Owner should issue a
dedicated admin token labelled for the Board and revoke it independently; the
transport source is pinned by tests to this single GET path. The scheduled
controller and the manual worker forward `TEAM_OPS_ERP_REVIEW_TOKEN_FILE` and
`TEAM_OPS_ERP_REVIEW_URL` only when they are already strings in the Owner's
environment and never derive them.

Vite exposes `GET /codex-threads.snapshot.json` only to loopback clients. The
adapter starts its own short-lived official `codex app-server` stdio client,
sends `initialize` then `initialized`, and cursor-paginates `thread/list`. It
prefers `useStateDbOnly`; a server that rejects that parameter is retried once
without it.

### Optional local tailnet Host allowlist

Development and preview keep Vite's default Host policy unless the local process
environment supplies `TEAM_OPS_BOARD_ALLOWED_HOSTS`. It accepts exactly one
canonical lowercase `.ts.net` FQDN. The value is not normalized or split:
unset, blank, or malformed input (including a wildcard, IP literal, scheme,
port, path, multiple values, empty label, uppercase form, or oversize name)
results in no custom host exception.

This setting changes only Vite Host-header allowance. It does not change the
loopback bind, expose a network service, or override any read-only pilot
disable. Keep actual host, account, and device values out of tracked files and
documentation.

The client is bounded by page, item, protocol-byte, line-byte, timeout, cache,
and single-flight limits. It builds the response from an allowlist and discards
all other protocol fields before caching, logging, storage, or browser output.
In particular, it never expose previews, names/titles, turns, paths, git data,
descriptions, raw messages, prompts, reasoning, tool input/output, or secrets.
The Board does not inspect task workspace source code.

Live refresh uses two validated buffers. A candidate lifecycle refresh is
checked off-screen and replaces the displayed snapshot only when its source is
available; a transient reconciliation `hold`/`0/0` candidate keeps the last
validated snapshot visible. Automatic polling is single-flight, does not show
the manual-refresh busy state, and commits accepted candidates through a
non-blocking UI transition so scrolling, selection, and organization-graph
interaction remain available during observation.

Default enrollment data is local-only. Existing organization roots remain
explicitly registered; eligible exact child TASK records can be appended by the
adapter's single awaited writer:

```text
guild_hall/state/operations/team_ops_board/thread_visibility.v1.json
```

Override that path only for local operations or tests with
`TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY`. When that variable is absent, the
default path itself follows the shared `SOULFORGE_STATE_ROOT` /
`SOULFORGE_OWNER_ROOT` override described under the Windows runtime wrapper,
so the enrollment, result-gate, and organization-catalog CLIs run from a
checkout and a relocated Board serve the same registry. Set
`TEAM_OPS_BOARD_LIVE_THREADS_DISABLED=1` or `disabled: true` in the local
registry to stop observation and enrollment writes immediately.

Override the local result-gate path only for local operations or tests with
`TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY`.

A separate, local metadata-only exact-binding file can be provided through
`TEAM_OPS_BOARD_EXACT_THREAD_BINDINGS`. Its `thread_id` and `route_id` must
match the enrollment exactly; an absent or invalid file produces `HOLD`, never
a guessed route or readiness claim.

## Organization governance projection

The organization surface is projected from this ignored, local metadata-only
governance source, not from fixed company or group constants in the Board:

```text
_workmeta/system/bindings/organization_governance_overlay.v1.json
```

It defines organization IDs, exact parent IDs, organization kinds, display
labels and order, lifecycle, branch membership, and separate role bindings.
Individual Codex manager/responsibility IDs are not duplicated in that file:
the current exact enrollment registry supplies those roster rows and their
`parent_thread_id` edges. `전체 조직` combines both sources to show every
current company, CEO, team manager, and responsibility. TASK/verifier nodes
remain transient and appear only when they have an exact live, waiting, stop,
or result signal.
The provider validates and projects that source to the Board's existing
read-only catalog contract on every refresh. A source rename, reorder, or new
organization therefore appears without a Board code change or an LLM call. A
missing, invalid, disabled, candidate-only, or unknown current enrollment group
is `HOLD`; the Board never invents a company, hierarchy position, or route.

Use `TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY` to select another local
governance source for an operation or test. The local CLI is read-only and
validates strict metadata-only fields and enrollment membership before
reporting success:

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:organization -- validate
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:organization -- validate --registry <local-enrollment-registry>
```

Manual Board catalog upsert/retire/init commands are disabled while governance
is active. `SOULFORGE_ORGANIZATION_GOVERNANCE_DISABLED=1` is the repo-level
emergency stop. An explicit
`SOULFORGE_ORGANIZATION_GOVERNANCE_ROLLBACK_LEGACY=1` may expose the previous
ignored catalog only as a visible `HOLD` rollback projection; it never promotes
that cache to organization authority. Neither mode creates, routes, alters,
archives, or messages a Codex thread.

## Lifecycle receipt read-only signal

The Board can consume the AI Usage Meter's ignored local exact-ID lifecycle
snapshot at:

```text
guild_hall/state/operations/ai_usage_meter/lifecycle/current.json
```

This is the same identity-bearing contract emitted by `lifecycle-snapshot
--include-identities`. The Board validates its strict keys, zero raw-field
counts, lifecycle/event pairing, timestamps, duplicate identities, freshness,
and the Meter emergency-disable control before use. It never reads receipt
history, a transcript, a title, a path, or a worktree.

On normal refresh, the Board asks the Meter-owned reconciler to inspect only
the configured `CODEX_HOME/sessions` metadata for currently enrolled exact
IDs, then to refresh the ignored Meter snapshot. It is bounded to 200 IDs,
debounced for 15 seconds, single-flight, and stops waiting after 2 seconds.
The Board neither parses nor projects JSONL raw content itself. A disabled,
missing, invalid, timed-out, or failed source remains fail-closed (`hold` /
unknown); the Board stays usable and never writes Task, ERP, enrollment, or
result-gate state. A partial scan may retain only already validated exact
observations; it cannot infer a missing identity.

An exact enrolled `agent_id` is preferred; otherwise an exact enrolled
`session_id` is used. A non-matching identity is discarded. `started` becomes
an `active` signal, `waiting_on_approval` becomes `waiting`, and
`observed_at_stop` or `ended` becomes `stopped` and is presented as `응답 종료 · 결과 미확정`; it proves only that the latest response/turn ended, not that the TASK completed. The former `관측 불가` label is presented as `상태 신호 없음`: the thread is registered but the Board has no fresh exact lifecycle evidence that proves execution, waiting, or result delivery. A source error is shown separately as `상태 관측 오류`. The Codex sidebar blue dot is an unread/new-activity presentation signal and is never used as runtime, result, or completion evidence.
`input_received` is not running evidence. Missing, corrupt, disabled, or stale
snapshots add no runtime evidence and leave the row unknown. A stop-only child
is not retained as a blue topology result: blue requires an explicit result
delivery gate. This prevents a response turn ending from being presented as
completion, acceptance, unread work, or Owner attention.

The health strip reports lifecycle source availability and exact matched/seen
identity counts only. Local test overrides are
`TEAM_OPS_BOARD_LIFECYCLE_SNAPSHOT` and
`TEAM_OPS_BOARD_LIFECYCLE_DISABLE_CONTROL`; automatic reconciliation can be
explicitly disabled only with `TEAM_OPS_BOARD_AUTO_LIFECYCLE_RECONCILE=false`.

## Automatic exact child enrollment

The Board does not rely on a manager remembering a registration instruction.
On refresh it merges two allowlisted structural sources: the official local
app-server's exact `thread_id`/`parentThreadId` edge for an `active` or already
`idle` child, and the Meter's
validated, fresh `SubagentStart` `session_id`/`agent_id` identity. Both feed the
same atomic enrollment writer; there is no second receipt writer.

Accepting an exact `idle` child closes the race where a short TASK starts and
ends between 10-second polls. It enrolls identity and hierarchy only; `idle`
is never treated as completion or result evidence.

A new child is appended only when its exact parent is already `current` or
`accepted` and that parent's organization is active. The child inherits only
the exact `organization_group_id`; `route_id` and `work_id` remain `null`, the
kind is `task`, the relationship is `child`, and every raw-content flag is
`false`. Replays are idempotent. Existing, history, retired, malformed,
conflicting, terminal, stale, unlinked, or inactive-organization identities are
never revived or rewritten.

`TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED=1` stops app-server child enrollment.
`TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED=1` independently stops the
persisted receipt bridge. Missing or partial structural coverage stays visible
as `HOLD`; this is not a claim that Codex exposes every internal task-creation
event.

## Read-only pilot

`TEAM_OPS_BOARD_READ_ONLY_PILOT=1` is the single explicit fail-closed pilot
mode. Only the exact string `1` enables it. Within the Board process it composes
the existing auto-enrollment, subagent receipt, lifecycle reconciliation, and
result-gate disables. The result-gate atomic writer also rejects the pilot env,
including when invoked through its separate CLI.

The pilot keeps Claude official quota reading off unless the same process also
sets the exact opt-in `TEAM_OPS_BOARD_CLAUDE_QUOTA_READ=1`. The scheduled
companion additionally requires its ignored local gate before it reuses only an
existing credential for `GET https://api.anthropic.com/api/oauth/usage`. It
never initiates login, writes credentials, persists a provider response, or
mutates the provider. The last accepted sanitized receipt stays separate from
attempt evidence and becomes visibly `STALE` after its freshness window.
HTTP 429 is recorded as the fixed safe class `rate_limited`, not as malformed
content. A rate-limited attempt starts a 30-minute local backoff; invocations
during that window return `backoff_active` without another provider GET or a
fabricated attempt row. The scheduled companion and read-only Board adapter
resolve the ignored local quota gate and sanitized receipt from the stable
`SOULFORGE_AI_USAGE_PROJECT_ROOT`, not from the active code worktree. A Board
worktree switch therefore cannot silently orphan Claude quota state. This does
not enable quota access by itself, store credentials, or persist provider
responses. When the sanitized OAuth source reports a percentage but explicitly
omits its reset timestamp, the Board retains that percentage and displays only
the reset as unknown; it never invents a reset time.
The gated quota collector runs from the five-minute companion cycle and its
backoff check happens before credential access or provider I/O. Missing legacy
status and unavailable values remain `UNKNOWN`/disabled and are never
fabricated as zero or green. The common Meter ledger's Claude usage row remains
an independent read-only projection and never supplies or replaces official
quota values.

Codex quota rendering reconciles the latest event-carried sample with bounded
recent local session samples (up to 12 files within 4 days). The reader inspects
bounded tails, selects the freshest valid rate-limit observation timestamp via
`selectCodexRateLimitObservation`, and falls back closed to null when no valid
observation exists. While the currently observed reset is still in the future, a
premature next-window sample with a later reset and lower utilization cannot
replace the current window. Once the current reset has actually passed, the newer
window is eligible normally. This prevents a transient `100% 남음` display
without delaying a real reset or stalling behind an active session that has not
yet emitted a quota row.

The scheduled read-only Board enables one exact Antigravity quota gate. That
gate sends only an empty JSON object to the running Antigravity language
server's loopback-only quota-summary method and retains only sanitized group
labels, weekly/five-hour remaining percentages, and reset times. It does not
read the screen, UI Automation tree, OCR, session or credential material,
project payloads, or account details. The cache is resolved from the stable
`SOULFORGE_AI_USAGE_PROJECT_ROOT`, never from the active code worktree, so a
Board deployment cannot orphan the last-good observation. A failed local read
retains that last good value as `STALE`, or reports an explicit
`app_running_source_unavailable`/`app_absent` status when no last good exists.
If the current Antigravity version rejects that loopback method, the same exact
gate may invoke the installed Antigravity CLI only after the desktop app is
independently observed running, as
`agy.exe --print /usage --output-format text --print-timeout 30s`. The child
is resolved only from the regular, non-symlink
`<LOCALAPPDATA>/agy/bin/agy.exe` installation and inherits only the bounded OS
environment needed by that CLI. Its output must be exactly four tab-separated
Gemini and Claude/GPT weekly/five-hour rows. Reset times must remain inside the
source-owned window; anything extra, reordered, malformed, implausibly dated,
or bearing another label fails closed. Raw CLI output is neither returned nor
persisted. The interactive `/usage` (alias `/quota`) surface remains the manual
operator cross-check.

This mode does not start Antigravity, expose a public service, or prove provider
health, live execution, E2E behavior, or task completion. All other pilot write
and probe disables remain unchanged.

## Exact enrollment CLI

The CLI is deliberately limited to local registry metadata. It has no Codex
thread create/delete/archive/send operation.

Card identity comes only from the exact local enrollment registry. Current
runtime metadata comes from the official local `codex app-server`.
Metadata-only `Stop`/`SubagentStop` evidence may be retained as a safe stop
observation timestamp, but it is execution cessation only and does not create a
blue result node in the live organization map. A blue node requires an explicit
result-delivery gate for the exact upper thread; Stop alone never becomes
completion, parent acceptance, or Owner attention. The Board never
reads or projects prompt, reasoning, tool payload, runtime title, cwd, or
transcript content. Without an explicit result gate, idle and `notLoaded` stay
`상태 신호 없음`.

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- register-existing `
  --thread-id <exact-thread-id> `
  --organization-group-id <group-id> `
  --thread-kind task `
  --display-label "Development1 release TASK" `
  --relationship primary `
  --parent-thread-id <nullable-exact-parent-thread-id> `
  --route-id <nullable-route-id> `
  --work-id <nullable-work-id>

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- rollover `
  --from-thread-id <prior-exact-id> --to-thread-id <new-exact-id> --next-lifecycle current

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- retire --thread-id <exact-thread-id>
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- history --thread-id <exact-thread-id>
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- validate
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- list
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:enrollment -- reconcile --live
```

`register-existing` is idempotent only for the same exact metadata. It forces
`metadata_only: true` and every raw flag to `false`. `rollover` moves a pending
exact enrollment to `accepted` or `current` and retains the prior enrollment as
metadata-only history. A stable-role rollover also keeps the replacement in the
prior role's hierarchy position and reparents direct pending/accepted/current
children to the new exact ID; history and retired children remain attached to
their historical parent. All writer operations use temporary-file plus rename
atomic replacement.

The scheduled usage companion keeps the global completed-session collection
independent from Board enrollment. Its active-session supplement unions the
validated lifecycle identities with session files whose write metadata is fresh
inside the bounded active window. This closes the short interval before a new
exact TASK reaches the Board registry without changing Board visibility or
organization attribution; no title, prompt, transcript content, or route is
used to enroll the TASK.

## Explicit result gate

Result/attention state has a separate local metadata-only registry:

```text
guild_hall/state/operations/team_ops_board/thread_result_gate.v1.json
```

It is append-only by exact `event_id`, idempotent for an identical retry, and
rejects a conflicting duplicate. An event has only an exact `thread_id`, event
type, target, target exact parent ID where applicable, timestamp, and false raw
flags. It cannot store a message, preview, prompt, reasoning, tool I/O, cwd, or
path.

The deterministic lifecycle is:

```text
started -> result_ready(target: parent | owner) -> accepted -> closed
```

`result_ready(target: parent)` must name the enrolled exact structural parent.
It rolls up only to that parent as `하위 결과 도착/취합 중`. A parent-targeted
result does not enter Owner 현황. `result_ready(target: owner)` is the sole
source of `Owner 확인 필요`. `accepted` and `closed` remove the descendant from
current work and retain it in Board history; neither action touches the Codex
thread.

```powershell
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- emit `
  --event-id <exact-event-id> --thread-id <exact-thread-id> `
  --event-type started --target none --occurred-at <ISO-8601>

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- emit `
  --event-id <exact-event-id> --thread-id <exact-thread-id> `
  --event-type result_ready --target parent --target-thread-id <exact-parent-thread-id> `
  --occurred-at <ISO-8601>

npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- validate
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- disable
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run threads:result-gate -- enable
```

`TEAM_OPS_BOARD_RESULT_GATES_DISABLED=1` or local `disabled: true` makes the
gate fail closed. The Board then shows no gate-derived attention or completion.
This is local rollback only; it is not a route/task writer and does not archive
or delete anything.

## Running and verification

```powershell
npm.cmd --prefix ui-workspace run team-ops-app:dev -- --host 127.0.0.1 --port 4192 --strictPort
npm.cmd --prefix ui-workspace run team-ops-app:test
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run test:live-threads
npm.cmd --prefix ui-workspace --workspace @soulforge/team-ops-board run typecheck
npm.cmd --prefix ui-workspace run team-ops-app:build
```

### Windows read-only runtime wrapper

The Board owns one Windows-only Scheduled Task for its approved read-only
runtime. Registration stores only the Node executable, this integrated runtime
module, and the internal scheduled-worker action. The task carries exactly one
trigger: a single time trigger repeating every `PT5M`, registered with the
repetition duration omitted, which is how Task Scheduler stores unbounded
repetition. Inspection reads that stored duration back as blank or `PT0S` and
normalizes it to the documented `indefinite` value before comparing. The
trigger's only effect is to re-enter the same desired-state gate. The task
runs only for the current interactive user without a stored password, uses
limited privilege, and ignores a second concurrent start. It is not a service
and carries no boot or logon trigger; there is no second task, watchdog, or
repair process. Whether a trigger opportunity actually starts the Board is
decided entirely by the recorded desired state, described below.

```powershell
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-register
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-status
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-run
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-stop
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-fault
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs recover
node ui-workspace/apps/team-ops-board/ops/team-ops-board-runtime.mjs task-unregister
```

At execution time the scheduled controller derives the canonical owner checkout
from Git's common directory, derives the existing loopback Serve Host from the
local read-only Serve status JSON, and assembles the Board's existing private
default bindings in process memory before it owns one Board child. None of
those values enter the task action,
task metadata, repository, or logs. Scheduled mode starts from required OS
variables only and replaces, rather than inherits, every Board binding. The
Agent Runtime pair follows that same rule: the controller fixes the approved
loopback URL and derives the ignored binding filename under the Board state root,
overwriting any caller attempt. This environment-only propagation does not
change the Scheduled Task definition or action digest. The
Git and Tailscale preflight helpers each have a dedicated 15-second timeout;
the local runtime control request timeout remains 3 seconds. A preflight failure
before the Board child starts exits fail-closed and writes only a sanitized
`controller_preflight` termination receipt, without a path, command output,
stack, or raw error message.

The scheduled environment enables only the local read-only Antigravity quota gate;
it carries no screen-reading flag and no protected value or CLI command in task
arguments or XML. Claude quota access is OFF by default. An exact
`TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ=1` on `task-run` is transferred to the
attested scheduled worker over a local run-ID handshake and exists only in
process memory; unset, blank, and malformed values remain OFF. The intent and
resulting child flag never enter task arguments, XML, state records, or logs.

The runtime remains fixed to strict loopback `127.0.0.1:4192`. Registration
leaves it stopped. Only `task-run` atomically records manual Owner intent and a
monotonic epoch before requesting execution. Duplicate start and stop are
idempotent. An explicit stop records `stop_requested` before graceful shutdown,
then records `stopped`, so the controller cannot restart it. While intent
remains `running`, the controller records a metadata-only receipt and restarts
only its Board child after an unexpected exit or non-ready observation, with at
most three retries and a one-second backoff. Each child owns a new runtime
generation and heartbeat.

#### Owner-root and state-root override

By default the scheduled controller derives the owner root from Git as
described above and reads and writes every Board binding under that
checkout's `guild_hall/state/operations/`. Two environment variables, read by
the controller from its own process environment through
`guild_hall/shared/soulforge_state_root.mjs`, relocate that state to a
directory that is not a Git checkout:

| Variable | Meaning |
| --- | --- |
| `SOULFORGE_OWNER_ROOT` | Absolute path to a checkout-like root. Its `guild_hall/state` subtree becomes the state root; the root itself stays the owner root for the `_workmeta` governance overlay and the recovery companion's `_workmeta` checks. Git is not consulted. |
| `SOULFORGE_STATE_ROOT` | Absolute path that replaces `<owner root>/guild_hall/state` directly. Every operations binding (`team_ops_board`, `ai_usage_meter`, `watchtower`, `provider_quota`, `soulforge_activity`) resolves under `<state root>/operations/`. When it is set without `SOULFORGE_OWNER_ROOT`, the owner root is this module tree's own root (an installed lane), so the `_workmeta` overlay reports missing/hold. |

Precedence, highest first:

1. A file-specific explicit flag or environment variable (`--registry`,
   `TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY`,
   `TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY`,
   `TEAM_OPS_BOARD_ORGANIZATION_CATALOG`, `TEAM_OPS_BOARD_WATCHTOWER_POINTER`,
   `SOULFORGE_AI_USAGE_METER_STATE_ROOT`, ...). Inside the Board child these
   are the values the controller assembled, exactly as before.
2. `SOULFORGE_STATE_ROOT`.
3. `SOULFORGE_OWNER_ROOT`; inside the Board child the controller-supplied
   `SOULFORGE_AI_USAGE_PROJECT_ROOT` plays this role.
4. The Git-derived owner root (scheduled controller) or this checkout (`vite`
   dev mode and the enrollment, result-gate, and organization CLIs).

The override fails closed. A variable that is set but empty, relative,
missing, or not a directory stops the scheduled controller before any Board
child is forked, with the sanitized failure class
`owner_root_override_invalid` in the `controller_preflight` receipt, and makes
`vite.config.ts`, the CLIs, and the quota-cache resolver throw
`soulforge_root_override_invalid` (also a sanitized failure class); nothing
falls back to Git or to the checkout, and the message names only the variable
and the reason. Values are trimmed first, a driveless `\path` spelling is
refused on Windows (`drive_or_unc_required`), and with `SOULFORGE_OWNER_ROOT`
alone the controller additionally requires `<owner root>/guild_hall/state` to
exist as a directory before it forks, so an owner root without a state tree
cannot make the child create an empty one. The roots must be real
directories, not junctions, symlinks, or `subst` drives: the recovery
companion and the retention writer refuse reparse points downstream. With
neither variable set every path is byte-identical to the previous derivation;
the only visible difference is that the Board child now receives
`SOULFORGE_STATE_ROOT` (equal to `<owner root>/guild_hall/state`) and
`TEAM_OPS_BOARD_ORGANIZATION_CATALOG`
(`<state root>/operations/team_ops_board/organization_catalog.v1.json`, the
same value its adapter would derive) explicitly, so its adapters and both
companions bind from one value instead of re-deriving it from their own
module tree. The AI usage meter CLI and the Codex retention refresh honour
the same two variables (`guild_hall/ai_usage_meter/README.md`,
`.workflow/codex_thread_manager_v0/README.md`), so one shared state root
moves the whole cluster together. The variables are process environment only:
they never enter the Scheduled Task definition, action digest, state records,
or logs, and this documentation activates nothing by itself.

### Collection liveness evidence

Three collection surfaces were latest-only, so a stopped, wedged, or rejected
collector left no trace an Owner could read after the fact. Each now keeps its
existing latest file plus one bounded append-only history file. Retention is
deterministic newest-N with the oldest row evicted, the file count per surface
is fixed at two, and every write is atomic.

Reads are bounded as well as writes. Every history reader inspects the directory
entry first and refuses anything that is not a regular, non-symlink file inside a
fixed byte budget, before a single byte is parsed.

A history is an audit record, not a cache, so the reader distinguishes a
genuinely missing history from a present but untrustworthy one. Missing is a
safe first write. Present-but-invalid — unreadable, oversized, symlinked,
non-regular, malformed JSON, wrong schema, wrong keys, or holding even one
invalid row — is preserved byte-for-byte at its existing path. The append is not
attempted, no partial filtering happens, and no replacement record is produced,
because salvaging the good rows or restarting from empty would destroy exactly
the trace an Owner needs to reconstruct what went wrong. One invalid row
invalidates the whole stored history, since a partially valid audit log cannot
be told apart from a truncated or tampered one.

The core operation is never blocked by this. Latest and history are written
independently: the quota attempt receipt and the producer cycle receipt still
update atomically so current liveness stays visible, while the history append
returns a bounded `preserved` outcome with a fixed reason to its caller. The
runtime lifecycle append is best effort in the same way — a preserved history
leaves start, ready, stop, fatal, and restart behaviour completely unchanged.

The Claude quota collector distinguishes a rejected credential from a malformed
response. HTTP 401/403 is the fixed result `auth_rejected`; the Board reports
that re-login is required and never initiates a login. Every gate-passing
attempt, success or failure, writes `provider_quota.attempt.v1.json` and appends
to `provider_quota.attempt-history.v1.json` (50 rows) with exactly
`{provider, attempted_at, result, result_class}`. A disabled gate made no
attempt and is deliberately not recorded. The accepted quota snapshot keeps its
own separate file and meaning: attempt evidence answers whether collection ran,
never what the value is, and can never promote a value to current.
HTTP 429 is the separate fixed result/class `rate_limited`; the Board explains
`조회 제한 · 자동 재시도`, keeps the last good value stale, and suppresses
further provider requests for the bounded backoff window.

The Board therefore separates the last attempt from the last good value. The
provider-limits root gained the `claude_quota_attempt` field, so its contract is
now v4 rather than a widened v3: a strict v3 consumer is not handed a shape its
contract never described. Reading stays compatible in the direction that matters,
because the reader never branches on the root version - it revalidates the inner
`claude_official` contract. A retained v2 or v3 payload therefore normalizes
exactly as before, and its absent attempt field reads as `null`/UNKNOWN rather
than as a pass. When the quota is stale or unknown the numeric
gauge and the remaining-percentage reading are suppressed; the last-good
percentage remains visible in the row note, explicitly marked as not a current
value.

The usage producer companion writes a sanitized cycle receipt before any child
starts, and again on completion with a duration and one status per lane over a
fixed lane vocabulary, to `producer_health/cycle.json` and a 50-row
`cycle-history.json`. Idle stays healthy: no new usage remains a successful
attempt, not a failure.

Every collector child now carries a bounded 180-second timeout. The bound is
deliberately loose rather than tight: the Codex lane has been observed taking
about 78 seconds live, so a tighter bound would kill healthy work. A slow sweep
may therefore outrun the five-minute interval and skip one overlapping tick,
which is correct and self-correcting - the trigger simply returns the in-flight
sweep. What cannot happen is a permanent wedge, because every child is bounded,
so the sweep always terminates and always releases single-flight for the next
interval. A timed-out lane fails closed as `collector_timeout`, does not falsify
a sibling lane, and does not hold the next cycle. The per-lane heartbeats remain
the authority for lane freshness, and Meter hook health remains authoritative
for hook health.

The runtime keeps its 10-second latest heartbeat for liveness and its separate
termination receipt for last-good exit evidence. `lifecycle-history.v1.json`
adds up to 100 rows of material transitions only — start, ready, requested stop,
handled fatal, restart recovery, child restart, child exhaustion. The heartbeat
is deliberately never appended to it. A row carries an exact
`{observed_at, event, failure_class}` and no identity of any kind: no run id, pid,
or hash. An ordered sequence of material events already answers whether the
runtime restarted, crashed, or was told to stop, so a correlatable identifier
would add a receipt field without adding an answer. Desired-state and task
authority are unchanged.

No receipt in any of these surfaces carries a path, command line, run, session or
thread ID, pid, stdout/stderr, stack, raw session content, provider payload, or
credential. Result and lane tokens come from closed sets, and history rows are
validated against exact-key schemas on both write and read.

The recorded desired state, not the Scheduler, remains the single authority.
Every scheduled invocation — manual `task-run` or the repeating trigger — first
reads the desired record and, for anything other than `running`, returns
immediately without deriving bindings, opening a port, or owning a Board child.
That gate is the whole of the guarantee, and it cuts exactly two ways:

- `stopped`, `stop_requested`, or `recovery_needed` desired intent: a
  five-minute tick is a no-op. The controller exits at the gate and the Board is
  not started.
- `running` desired intent: a five-minute tick permits a gated relaunch. This is
  deliberate and it is the point of the trigger. It applies after the controller
  process itself exits — including once its bounded child retries and the
  Scheduler's `RestartOnFailure` retries are exhausted — and it applies after a
  reboot, at the next trigger opportunity, because the desired record survives
  the reboot. So with `running` recorded, the Board can come back without a
  manual `task-run`. `IgnoreNew` discards a tick that arrives while the Board is
  already healthy. Windows records that exact overlap as `0x800710E0`; the
  public status normalizes it to the existing `running` class only when the
  inspected task is both `Running` and exact `IgnoreNew`. The same result in
  every other context remains a failure.

The desired record is intent and the only thing the gate reads; `runtime_health`
is a separate computed observation of what is actually there. `task-status`
reports `runtime_health: recovery_needed` when the recorded intent is `running`,
the task is `Ready`, and no live runtime is observed. That is an observation
label, not a stored intent and not a block: `desired_state` still reads
`running`, so the next trigger opportunity may relaunch the Board. Only an
explicit `task-stop` — which records `stop_requested` and then `stopped` — turns
the relaunch opportunity back into a no-op.

Registration itself never starts the Board: `task-register` records the
`stopped` intent before the task can exist, and the trigger's start boundary is
set in the future, so no start opportunity exists at registration time.

A task registered before this trigger existed is reported as `definition_hold`
and refuses `task-run`. Removal is deliberately one step wider than execution:
`task-unregister` accepts this exact action, owner, and settings with either
the exact relaunch trigger or exactly zero triggers — the earlier triggerless
registration — so that legacy shape can still be removed and re-registered
instead of becoming permanently stuck. A single trigger that does not match
the exact relaunch definition is neither shape and is refused by every
operation, the same as more than one trigger.

Before stop, stale-record recovery, or task removal can delete runtime
evidence, the wrapper atomically writes one metadata-only termination receipt
in its existing OS-local runtime root. The receipt contains only desired/task
state, monotonic epoch, heartbeat freshness, redacted last-result class,
dependency availability, and one of `normal_stop`, `handled_error`,
`native_crash`, `external_termination`, `dependency_loss`, or `unknown`.
Capture failure is HOLD and blocks removal. It contains no task name, process
identifier, host, path, credential, account, or raw result/error.

When the controller replaces an exited Board child it also retains bounded
child exit evidence in that same receipt: `child_exit_code` (a numeric exit
code, otherwise null), `child_signal_class` (one of `sigint`, `sigterm`,
`sigkill`, `spawn_error`, `other`), and `child_failure_class` (only an existing
safe failure class, otherwise null). This keeps the schema version unchanged;
receipts written before these fields existed stay valid, and a present field
must match the bounded shape exactly or the record fails closed. Raw exit text,
signal strings, identifiers, paths, and stacks are never persisted, and the
child's standard output and error streams remain ignored.

The Board runtime deliberately exits on an unhandled rejection, so its
five-minute usage and Claude-quota companions contain every collector failure
at their own boundary. A rejected sweep becomes a fail-closed hold carrying only
an existing or minimal sanitized code, both interval timers keep their
independent cadence, and a failed lane receipt write no longer aborts the sweep
or falsifies a sibling lane — that lane simply keeps its prior value and ages
out fail-closed. A collector failure can therefore no longer terminate the
runtime process.

The earlier `runtime_worker_absent` evidence established an architecture gap:
the task had zero restart policy and no desired-state, LastTaskResult, or
termination-receipt evidence. Its ready marker and last heartbeat excluded a
normal stop and a handled JavaScript error, but the exact terminating event was
not captured. That prior root cause remains `UNKNOWN / non-reproduced`; native
crash, external termination, and dependency loss must not be claimed without
the new receipt and ordering evidence. `task-fault` is a bounded local
acceptance-only worker fault used after a natural-survival interval to prove the
same intent epoch recovers through the approved Scheduler policy. There is no
force kill, service, boot/logon trigger, elevation, firewall, LAN/public bind,
provider call, or Tailscale configuration mutation.

This controller closes the missing child-lifetime-owner gap without adding a
service or second watchdog. A controller-process exit after its bounded retries
are exhausted is now met by the repeating trigger's next gated relaunch
opportunity rather than by an indefinite `Ready` task; the Board still does not
claim that Task Scheduler's `RestartOnFailure` setting alone proves recovery,
and recovery is only claimed from an observed ready runtime. The Board UI owns
no repair button for this surface: when the Board itself is down it cannot be
its own recovery owner.

The app-server adapter tests cover handshake/initialization, pagination,
`useStateDbOnly` fallback, redaction, exact-ID joining, bounded cache/failure
behavior, lifecycle source fail-closed behavior, and no prefix fallback.
Enrollment tests cover atomic writes,
idempotency, rollover/history, parent-lineage validation, disable gates, and
reconciliation. Result-gate tests cover the deterministic synthetic
parent/three-child/Owner canary, duplicate-event idempotency, no-start failure,
accepted/closed history, raw-field rejection, atomic CLI writes, and emergency
disable. Frontend tests cover normalization, double-buffered single-flight
polling, non-blocking refresh transitions, Owner-only
attention, acknowledgement hide/reappear/restore, exact organization-tree
controls, exact-ID usage-history controls, and narrow-safe layout boundaries.

## Classic Watchtower and Engineering Engine topology surfaces

The System page keeps the original five-lane Watchtower W1 ReactFlow surface and
adds a second, fully expanded Engineering Engine surface using the same node
shapes, icon placement, text hierarchy, directed curves, minimap, controls, and
read-only inspector. There is no provider-sector folding or semantic drill-down.
The page intentionally shows only Watchtower and Engineering Engine; Knowledge
and Notebook remain available through the federation endpoint but are not rendered
in this operational view.

Vite exposes `GET /topology-federation.snapshot.json` to loopback clients only.
The adapter reads one fixed tracked repo path:

```text
guild_hall/watchtower/topology/federated_topology.v1.json
```

There is no glob, directory discovery, query parameter, or alternate source. The
adapter re-runs the pure Watchtower federation contract
(`guild_hall/watchtower/topology_federation.mjs`) on the artifact's own provider
fragments and then compares the recomposed result against the file: exact v1 root
keys, `soulforge.ax_topology.federation.v1`, `declared_structure` projection kind,
the source-set digest, the full topology digest, and the canonical bytes of the
flattened namespaced node/edge set. A tampered digest, an edited flattened node,
an invented edge, a fragment claiming `execute_repair` or runtime-mutation
authority, an unreadable file, and unparsable bytes all fail closed.

The envelope is `ready`, `stale`, or `unavailable` with a safe lowercase reason
code and no path, message, or stack leakage. A failed re-read retains the last
validated structure as explicit `stale`; it never presents a retained structure as
a current success. `/topology-health.snapshot.json` and W1 health behavior are
unchanged.

The federation remains the sole authority for Engineering Engine node and edge
identity. The classic Engine builder accepts exactly the tracked 33 module nodes
and 151 provider-local `imports` edges, lays all of them out in five semantic lanes,
and never assigns W1 health or delivery evidence to them. Engine runtime stays
`UNKNOWN`; runtime authority and repair execution authority stay `false`.

Cross-provider edges are not supported by the v1 contract and are never inferred.
The page states `Watchtower와 Engineering Engine 사이 연결 계약 미선언`
instead of drawing a false bridge. All Watchtower edges retain their independent W1
delivery verdicts, while all Engine edges remain declared-structure-only.

Tests are deterministic and synthetic and never need the running 4192 service:
`src/server/topology-federation-adapter.test.mjs` covers artifact validation,
digest and projection-mismatch rejection, forbidden authority claims, fail-closed
reads, stale retention, and the loopback/method/path guards;
`src/core/topology-federation-view.test.mjs` covers the source projection;
`src/core/topology-engine-classic-view.test.mjs` covers exact Engine totals,
deterministic collision-free full expansion, original shape vocabulary, provider
exclusion, and authority refusal; `src/core/topology-federation-ui-boundary.test.mjs`
and `src/core/topology-ui-boundary.test.mjs` cover the two classic read-only graph
surfaces, visible directed edges, controls, and accessibility boundaries.

## AI Usage Meter stays separate

The Board exposes a credential-free same-origin loopback endpoint at
`/ai-usage-meter.snapshot.json?read_only=1`. `read_only=1` is mandatory. A
diagnostics refresh may add `refresh=1`, which bypasses the validated in-memory
cache to re-read the local meter projection while joining any existing in-flight
computation without starting duplicates. Normal polling inside the 60-second TTL
returns the validated cache. Exact enrollment and emergency-disable prerequisites
are evaluated on every request before returning cache or joining in-flight work,
with in-flight scope mismatches failing closed to `HOLD`. The adapter resolves the
current/accepted enrollment registry once per request, caps the exact safe IDs at
100, and validates only the existing bounded ledger projection. It does not spawn
a CLI, invoke a collector, command, `--apply`, lifecycle reconciliation, writer,
provider login, or network operation. It never scans raw session trees or derives
an ID from a title, path, or transcript.

The endpoint returns only a validated metadata-only aggregate envelope. The
read-only usage projection aggregates all recorded local provider usage (Codex,
Claude, Antigravity) across total/model/provider/daily series so that local usage
is comprehensively represented without omitting unregistered sessions, while
enrollment registry availability remains mandatory to open the projection and
Board display labels/organization grouping join only on exact enrolled thread IDs.
A failed, missing, invalid, disabled, or empty enrollment registry remains
`UNMEASURED / HOLD`, never an exposed projection or zero-usage assertion. The
selected-node diagnostics refresh uses only this path plus the existing safe
Watchtower read-only refresh.

The Work surface shows the resulting KST day/week/month/all-time controls plus
project/work/task rankings. It also renders compact horizontal comparisons for
Meter `project_id` totals and exact-linked organization totals. The organization
comparison joins only top TASK rows whose exact `task_id` matches a
current/history Board enrollment; every unmatched row and bounded long tail
remains visible as `미연결·기타` / `미등록 TASK`. Ranking rows contain their
respective exact IDs and reconciled metrics. A task row adds the safe Board
display label only when its exact `task_id` matches an enrolled thread;
unmatched rows remain their exact ID or `unassigned`. The Board does not infer
or display guessed attribution, raw session content, paths, titles, prompts,
or tool data.

The `UsageTrendChart` renders a daily token trend with an accessible range toggle (`최근 7일` default, `최근 30일` history) across model and provider tabs alongside a truthful textual basis label (` · 토큰 관측일 기준` for complete coverage, ` · 토큰 관측일 우선 · 미근거 항목은 시작일 기준` for partial coverage, and omitted when fallback to v3 without matches). The 7-day default allows recent activity (such as ~1.3B daily volume) to remain visibly substantial without visual compression from older multi-billion-token peaks in the 30-day window, while preserving the full 30-day history on demand. Daily token series and Antigravity request overlays slice to the active range. Selecting a legend series dynamically rescales the chart's vertical axis to that series' peak within the active range rather than retaining the global stacked aggregate maximum, preserving stable series colors, dynamic tick stride (all 7 days for 7-day range, stride 5 + last for 30-day range), tooltip hit-grid navigation, keyboard focus, and the secondary AG request overlay. The tooltip is clamped to the plot edge opposite the active date (including the midpoint), keeps the active guide clear, and never intercepts the chart controls.

This Board projection is validated-private local tooling. It is not an official
provider billing/quota authority, route resolver, Codex runtime authority,
task-status authority, deployment, or production control surface.

### Claude ledger evidence and selected-node diagnostics

The Board accepts legacy history v2, but renders its Claude provider evidence
as `UNKNOWN`. A validated v3 Claude `provider_rows` entry derived only from
ledger `source.kind` remains visible as last-known ledger evidence regardless
of the separate collection-attempt state. Its freshness is calculated from
`latest_usage_at` against `reference_at` and the explicit adapter threshold:
fresh values say `원장 근거`; stale values retain the last-known value/time but
show prominent `STALE` and are never green/current. The collection attempt has
its own state, reason, time, and freshness line and cannot upgrade or erase a
valid ledger fact. v2 or no valid row stays `UNKNOWN`; zero appears only for a
fresh successful `available_empty` collection window with no provider row.
Aggregate generation time and official Claude quota never substitute for
ledger freshness, token evidence, health, live, or E2E state.

Selecting a topology node opens an inspector that preserves the selected node
across a safe refresh when it still exists, switches on another node, and closes
through explicit unselect, pane click, or Escape. It supplies state/reason,
evidence scope/time, what the evidence proves and does not prove, and direct or
all structural paths. Structural edges and paths are catalog relationships only:
they never prove a live service, E2E path, receipt, provider health, or result.
The only actions are read-only refresh, evidence view, direct/all path views,
and — for the exact allowlisted non-green source/consumer nodes — a `진단`
connection check. Mutation guidance is exactly `Owner 승인 필요`; there is no
execution action. The inspector supports keyboard focus and the mobile layout.

`진단` is a separate read-only evidence lens over snapshots the Board already
holds: the local read-only W1 topology-health projection it refreshes through
the existing loopback path, plus the existing sanitized provider-limit and
Antigravity quota projections. It adds no server route, provider RPC, external
account call, credential read, browser or desktop automation, and it never
promotes a node's health, color, shape, layout, or edge meaning.

The result separates 계정 연결 (`확인됨` / `실패 신호` / `확인 불가` /
`해당 없음`), 로컬 수집·소스 (`정상` / `주의` / `확인 불가`), the last safe
observation time with `안전 관측` / `보존 관측` / `관측 없음`, and the evidence
owners plus explicit limits. Only a provider-issued, currently fresh quota
receipt can reach 계정 연결 `확인됨`, and only a provider-scope health failure
can reach `실패 신호`. A live local collector, a readable OneDrive/PLAUD/Codex
session source, or sanitized Hiworks/Slack/Gmail producer evidence proves local
availability only and stays 계정 연결 `확인 불가`. `consumer_timeline` has no
account surface and no deployed consumer receipt, so it stays `해당 없음` with
`runtime_not_deployed`. Unknown or malformed node IDs fail closed, and missing
evidence stays `확인 불가` instead of becoming a pass or a fault.

## World Tree host adapter

The existing world HTML, CSS and page module are shared with World Tree's
`forge_world_http.mjs` adapter. In that host the page reads the authenticated,
project-filtered `/api/forge-world/coverage` endpoint and links to the same-origin
workbench. The standalone Board retains its own read-only snapshot endpoint and
does not advertise an unavailable workbench link. No copy of the world renderer,
coverage policy, project truth or acceptance authority is introduced.

## Codex Lifecycle Retention Phase 3 Read-only Projection

The Board exposes `GET /codex-retention.snapshot.json` exclusively to loopback clients (`127.0.0.1`, `::1`).
- **Endpoint**: `/codex-retention.snapshot.json` (GET-only, non-GET returns 405 Method Not Allowed).
- **Core Module**: `src/core/codex-retention-projection.mjs` stable-reads `<ownerRoot>/guild_hall/state/operations/soulforge_activity/reports/codex_retention/current.json`.
- **Sanitization & Safety**: Strictly validates `soulforge.codex_thread_manager.codex_retention_automation_report.v1`, SHA-256 digest, generated_at ISO timestamp, and summary metrics. Zero raw path exposure, zero raw logs/prompts/reasoning exposure.
- **Bounded Age Windows**: `period_seconds: 86400` (24h), `grace_seconds: 3600` (1h). Computes status: `current`, `late`, `stale`, or `unavailable`.
- **Authority Boundary**: Enforces `{ read_only: true, runtime_authority: false, repair_authority: false, destructive_authority: false }`. Destructive action count and local automation install count are strictly 0.

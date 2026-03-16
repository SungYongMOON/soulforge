# Codex App Server 설계 시작 체크리스트

## 목적

- 새 agent, thread lane, multi-instance worker 설계를 시작할 때 바로 사용할 수 있는 실전 체크리스트를 남긴다.
- 이 문서는 현재 build / run 기준의 운영 체크리스트다.
- 이 문서는 제품 보장 문서나 sandbox security proof 문서가 아니다.

## 시작 전에 고르는 3가지

### 1) 1EA / multi-thread 로 시작

- 기준: 빠르게 역할 분리와 지시 분리부터 보고 싶을 때
- 적합: role/style, precedence, 작은 concurrency

### 2) 2EA / multi-instance 로 시작

- 기준: failure domain, event stream, 분리 배치가 더 중요할 때
- 적합: 병렬 dispatch, 분리 workspace, shared contamination 비교

### 3) 파일 / 도구 baseline 부터 시작

- 기준: sandbox, read/write, shell startup 이 먼저 불안할 때
- 적합: `command/exec` vs `turn/start` 원인분리

## 새 에이전트 설계 시작 체크리스트

### 0. 이번 설계의 질문을 한 줄로 고정

- [ ] 이번 설계에서 확인할 1차 질문을 한 줄로 썼다
  - 예: role/style 분리가 되는가
  - 예: shared workspace contamination 이 생기는가
  - 예: 2EA 가 1EA 보다 해석이 쉬운가
- [ ] 이번 라운드에서 바꿀 축을 1개만 정했다
- [ ] 이번 라운드에서 바꾸지 않을 축을 적었다
  - 예: model, cwd, sandbox, output schema
- [ ] 이번 build / run 기준의 관측이라는 점을 적었다

### 1. 구조 선택

- [ ] 1EA / multi-thread 로 갈지 정했다
- [ ] 2EA / multi-instance 로 갈지 정했다
- [ ] 왜 이 구조를 고르는지 적었다
  - 1EA: role/style, precedence, 작은 concurrency
  - 2EA: failure domain, event stream, 분리 workspace, shared contamination 비교

### 2. lane / agent 정의

- [ ] agent 수를 정했다
- [ ] 각 agent 이름을 정했다
- [ ] 각 agent 의 역할을 1문장으로 적었다
- [ ] 각 agent 의 입력 / 출력 / 금지사항을 적었다
- [ ] 각 agent 의 성공 조건을 적었다

### 3. role / style 설계

- [ ] role/style 분리의 1차 source 를 `developer instruction` 으로 두었다
- [ ] 각 agent 의 첫 줄 header 를 고정했다
- [ ] 각 agent 의 필수 섹션을 정했다
  - 예: `위험:`
  - 예: `실행:`
  - 예: `실패모드:` / `검증:`
  - 예: `대안 1/2/3` / `추천:`
- [ ] 다른 agent 태그를 출력하지 말라는 규칙을 넣었다
- [ ] 충돌 prompt 가 와도 유지해야 할 최소 구조를 정했다

### 4. 공통 변수 고정

- [ ] model 을 고정했다
- [ ] cwd 를 고정했다
- [ ] sandbox policy 를 고정했다
- [ ] outputSchema 사용 여부를 정했다
- [ ] host-side verification 방식을 정했다
- [ ] `PASS / FAIL / BLOCKED / INCONCLUSIVE` 기준을 미리 적었다
- [ ] blocked 조건을 미리 적었다
  - 예: init 실패, `turn/completed` 부재, timeout, JSON parse 실패

### 5. workspace 설계

- [ ] workspace 를 분리할지 shared 로 둘지 정했다
- [ ] readableRoots 를 적었다
- [ ] writableRoots 를 적었다
- [ ] networkAccess 여부를 적었다
- [ ] private 경로와 shared 경로를 구분했다
- [ ] history contamination 과 workspace contamination 을 다른 축으로 보겠다고 적었다

### 6. baseline 먼저

- [ ] host-side preflight 를 먼저 하기로 했다
- [ ] fixture 파일 / expected path / writable path 를 확인하기로 했다
- [ ] `command/exec` baseline 을 먼저 볼지 정했다
- [ ] `turn/start` baseline 을 먼저 볼지 정했다
- [ ] 허용 read/write baseline 과 forbidden probe 를 분리했다
- [ ] host-side verification 예시를 적었다
  - 예: 파일 존재, 내용 일치, JSON parse, expected token

### 7. prompt 설계

- [ ] baseline prompt 를 만들었다
- [ ] conflict prompt 를 만들었다
- [ ] follow-up prompt 를 만들었다
- [ ] 공통 task prompt 는 agent 간 동일하게 유지했다
- [ ] persona/style 실험에서는 파일 읽기 의존을 최소화했다
- [ ] structured reply 가 필요하면 outputSchema 를 같이 걸었다

### 8. precedence 설계

- [ ] 무엇과 무엇의 precedence 를 볼지 정했다
  - 예: `developer instruction` vs user prompt
  - 예: 1EA vs 2EA 에서 precedence 흔들림 비교
- [ ] override string 또는 강한 충돌 지시를 만들었다
- [ ] follow-up 에서 원래 구조로 복귀하는지 보기로 했다
- [ ] evaluator false negative 가능성을 메모했다

### 9. contamination 설계

- [ ] history contamination 체크 방식을 정했다
  - `thread/read(includeTurns=true)` 저장
- [ ] workspace contamination 체크 방식을 정했다
  - shared relay / private leakage / host-side verification
- [ ] 둘을 같은 뜻으로 해석하지 않겠다고 적었다

### 10. concurrency 설계

- [ ] turn 을 순차로 기다릴지, 먼저 모두 dispatch 할지 정했다
- [ ] parallel dispatch 가 목적이면 모든 turn id 를 먼저 확보하기로 했다
- [ ] `started_at`, `first_event_at`, `completed_at`, `timeout` 을 남기기로 했다
- [ ] `event_interleaving_observed` 기준을 정했다
- [ ] `starvation_suspected` 기준을 정했다
- [ ] 2EA 인 경우 `cross-instance forbidden probe` 를 후속 실험 후보에 넣었다

### 11. 필수 산출물

- [ ] raw JSON-RPC log
- [ ] app-server stderr log
- [ ] per-turn final reply 원문
- [ ] host-side verification JSON
- [ ] 사람이 읽는 요약 보고서
- [ ] `thread/read(includeTurns=true)` 결과
- [ ] contamination / precedence / concurrency 판정 JSON

### 12. 이번 라운드 종료 조건

- [ ] 지금 라운드가 문서화 가능 상태인지 기준을 적었다
- [ ] 다음 라운드에서 볼 질문을 1개만 남기기로 했다
- [ ] 결과를 팁 문서에 반영할지, 가이드 문서에 반영할지 정했다
- [ ] disposable lab 은 마지막에 정리하기로 했다

## 가장 실용적인 시작 순서

### A. 새 role 에이전트 설계일 때

1. 역할 2~4개 정의
2. `developer instruction` 템플릿 작성
3. baseline / conflict / follow-up 3라운드 설계
4. `thread/read` 로 history 확인
5. evaluator false negative 보정

### B. 파일 접근 / 작업 에이전트일 때

1. host-side preflight
2. `command/exec` baseline
3. `turn/start` baseline
4. forbidden probe
5. contamination 확인

### C. 2EA 분리형 에이전트일 때

1. separate workspace
2. shared workspace
3. cross-instance forbidden probe
4. 큰 fan-out concurrency

## 앞으로 이 체크리스트를 쓰는 방식

1. 역할을 만들 때는 `DEVELOPER_INSTRUCTION_TIPS.md` 를 먼저 본다.
2. 구조를 정할 때는 `CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md` 와 `CODEX_APP_SERVER_MULTI_INSTANCE_GUIDE.md` 를 본다.
3. 항상 질문 하나만 먼저 닫는다.
   role/style, baseline, contamination, precedence, concurrency 를 한 번에 섞지 않는다.

## 기본 템플릿

- 에이전트 이름:
- 역할 1문장:
- 첫 줄 헤더:
- 필수 섹션:
- 이번 라운드 질문 1개:

예시:

- 에이전트 이름: `BUILDER-A`
- 역할 1문장: 구현 가능한 단계를 가장 빨리 제안하는 실행가
- 첫 줄 헤더: `BUILDER-A / EXECUTOR`
- 필수 섹션: `실행:`
- 이번 라운드 질문 1개: 충돌 prompt 에도 실행 구조를 유지하는가

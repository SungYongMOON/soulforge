# Repository Improvement Plan v0

## 목적

- 이 문서는 2026-03-29 감리 결과를 바탕으로 Soulforge 저장소를 어떤 순서로 개선할지 저장해 둔다.
- 목표는 설계를 뒤엎는 것이 아니라, 이미 강한 owner boundary 를 더 쉽게 운영하고 더 안전하게 검증하게 만드는 것이다.

## 한 줄 요약

- 1차는 `누가 어떤 모드로 쓰는지`를 문서와 코드에서 같게 만든다.
- 2차는 `저장소가 스스로 틀린 것을 잡게` 만든다.
- 3차는 `자동화와 큰 파일을 덜 깨지게` 만든다.

## 기본 관점

Soulforge 개선은 아래 세 층을 같이 봐야 한다.

1. owner root
   - `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `guild_hall`, `_workspaces`
2. ontology-style knowledge base
   - 개체와 관계를 public 문서에서 설명하고, project-local instance 는 `_workmeta/<project_code>/ontology/` 에 둔다.
3. harness
   - validator, fixture, smoke, acceptance, CI 같은 자동 점검 표면

## 쉬운 말로 본 핵심 문제

### 1. 지금은 `public-only`가 진짜 public-only 가 아니다

- 문서에는 public clone 만 받는다고 적혀 있다.
- 그런데 실제 doctor/checklist 는 mail/telegram env 같은 운영 파일도 사실상 요구한다.
- 먼저 이 모순을 없애야 한다.

### 2. 규칙 문서는 많은데 자동 검사기가 약하다

- 사람이 문서를 읽으면 이해할 수 있다.
- 하지만 저장소가 스스로 `index`, `ref`, `readiness`, `boundary` 오류를 잡는 표면은 아직 약하다.
- 그래서 루트 canon validator 와 루트 acceptance 가 필요하다.

### 3. 자동화 프롬프트가 너무 많은 일을 맡고 있다

- `night_watch` 같은 자동화가 git sync, retry, doctor 재시도, 보고서 기록까지 프롬프트에 많이 싣고 있다.
- 기계가 잘하는 건 스크립트로 빼고, AI 는 판단에 집중하게 해야 한다.

## 1차 계획

### 목표

- 문서, doctor, ontology vocabulary 를 먼저 같은 기준으로 맞춘다.

### 할 일

1. bootstrap 프로필을 3개로 나눈다.
   - `public-only`
   - `operator`
   - `owner-with-state`
2. `doctor` 가 프로필별로 다른 필수 항목을 검사하게 바꾼다.
3. ontology-style 기준에서 핵심 개체와 관계를 더 읽기 쉽게 정리한다.
4. 루트 canon validator 첫 버전을 만든다.

### ontology KB 포함 범위

- `Species`, `Class`, `Unit`, `Workflow`, `Party`, `Mission`, `Monster`, `Artifact`, `Event`
- 아래 관계를 public 문서에서 더 분명히 적는다.
  - `workflow guides mission`
  - `party assigns unit`
  - `monster triggers mission`
  - `mission consumes artifact`
  - `mission produces artifact`

### harness 포함 범위

- `guild-hall:doctor` 를 profile-aware 하게 만든다.
- `npm run canon:validate` 를 추가해 최소한 아래를 잡게 한다.
  - `index.yaml` entry path 존재 여부
  - mission 의 `workflow_id`, `party_id` 참조 무결성
  - `workflow_id: null` 같은 예외가 readiness 규칙과 맞는지

### 끝났다고 보는 기준

- `public-only` 환경이 private companion 없이도 문서와 코드 기준으로 성립한다.
- doctor 가 프로필별 판정을 다르게 내린다.
- 최소 validator 가 catalog/ref/readiness 오류를 잡는다.

## 2차 계획

### 목표

- 좋은 로컬 절차를 저장소 게이트로 승격한다.

### 할 일

1. 루트 validate 표면을 만든다.
   - `npm run validate`
   - `npm run validate:canon`
   - `npm run validate:ui`
   - `npm run done:check`
2. UI, canon, gateway/mail_fetch 검증을 한 번에 묶는다.
3. GitHub Actions 를 추가해 PR 과 main 에서 자동으로 검증한다.
4. `SECURITY.md` 와 짧은 기여/검증 가이드를 추가한다.

### ontology KB 포함 범위

- 문서 규칙만 있는 relation 을 validator 규칙으로 승격한다.
- owner boundary 위반과 public/private 혼선을 자동으로 잡는 방향으로 확장한다.

### harness 포함 범위

- 루트 acceptance harness
- UI fixture/schema harness 와 루트 canon harness 연결
- PR/main CI gate

### 끝났다고 보는 기준

- PR 에서 최소 검증이 자동으로 돈다.
- 루트 canon 과 UI 와 mail_fetch 검증이 같은 입구에서 관리된다.
- 외부 협업자가 봐도 보안 신고와 기본 검증 흐름을 이해할 수 있다.

## 3차 계획

### 목표

- 자동화와 운영 코드를 덜 깨지게 만들고, 상태가 쌓여도 비용이 덜 들게 만든다.

### 할 일

1. `night_watch` Stage 0 preflight 를 프롬프트에서 빼고 스크립트로 분리한다.
2. `gateway` 의 dedupe/index 방식을 개선해 매번 전체 상태를 훑지 않게 한다.
3. `doctor`, `gateway`, `town_crier`, `night_watch` 공통 path/state helper 를 정리한다.
4. 책임이 큰 파일을 기능별로 나눈다.
5. Node/Python 버전 계약과 저장소 hygiene 를 정리한다.

### ontology KB 포함 범위

- `_workmeta/<project_code>/ontology/` 를 어떻게 남길지 최소 예시를 보강한다.
- ontology candidate 가 `_workmeta` 에서 `guild_hall/state/operations/soulforge_activity/**` 로 carry-forward 되는 흐름을 더 분명히 한다.

### harness 포함 범위

- preflight harness
- gateway state/index harness
- shared runtime utility
- validator 테스트와 acceptance 보강

### 끝났다고 보는 기준

- automation 프롬프트는 판단 중심으로 가벼워진다.
- gateway intake 비용이 상태 크기에 덜 민감해진다.
- 경로 처리와 상태 기록 규칙이 한 군데로 모인다.
- 큰 파일이 더 읽기 쉽고 수정하기 쉬워진다.

## 우선순위

1. `public-only` 거짓말 없애기
2. 루트 canon validator 추가
3. `night_watch` preflight 분리
4. CI 와 공개 보안 절차 추가
5. 큰 파일과 state 접근 구조 정리

## 이번 계획을 한 문장으로

- Soulforge 는 `owner root 가 truth 를 소유하고`, `ontology KB 가 개체와 관계를 설명하고`, `harness 가 둘 사이 drift 를 자동으로 막는 저장소`로 정리한다.

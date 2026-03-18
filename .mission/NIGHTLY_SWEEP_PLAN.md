# Nightly Sweep Plan

## 목적

- 이 문서는 Soulforge의 `nightly sweep` 를 어떻게 정의할지에 대한 owner-local planning note 다.
- nightly sweep 는 밤 동안 프로젝트 전체를 점검하고, 다음 날 owner 가 볼 수 있는 판단 재료를 남기는 local operating layer 로 본다.

## 한 줄 정의

- `nightly sweep` 는 mission, repo boundary, UI workspace, dependency/runtime health 를 밤에 훑고 advisory report 를 남기는 운영층이다.

## 현재 phase 해석

- 아직 architecture canon 으로 잠근 것은 아니다.
- 우선은 운영 정의와 체크 항목을 owner-local draft 로 정리한다.
- 실제 구현이나 scheduler 연결은 이후 phase 에서 다룬다.

## 경계

- nightly sweep 는 top-level canonical root 가 아니다.
- nightly sweep 는 승격 authority 를 가지지 않는다.
- nightly sweep 는 최종 readiness owner 가 아니다.
- nightly sweep 는 `mission_check` 같은 readiness logic 을 재사용할 수 있지만, 공식 `ready / blocked / completed` 판정을 대신하지 않는다.
- nightly sweep 는 raw run truth 나 local binding dump 를 tracked mission surface 로 복제하지 않는다.

## 권장 역할

### 1. mission governance 검사

- `.mission/index.yaml` 와 각 mission surface 를 읽는다.
- active mission 과 blocked mission 을 우선 점검한다.
- 필요하면 completed sample 도 current contract 와의 mismatch 관점에서 다시 본다.
- `mission_check` 계열 검사 로직을 돌려 advisory result 를 만든다.
- mission level hint, blocker kind, promotion review needed 같은 메타 아이디어를 계산할 수 있다.

### 2. repo boundary 검사

- tracked tree 에 `_workspaces/<project_code>/` 실자료가 섞이지 않았는지 본다.
- `.mission`, `docs/architecture`, 각 owner README 간에 명백한 boundary drift 가 없는지 본다.
- 문서 링크나 public-safe contract 가 깨지지 않았는지 본다.

### 3. UI workspace 건강검사

- 현재 저장소의 UI check surface 는 아래 명령을 중심으로 본다.
  - `npm run ui:validate`
  - `npm run ui:lint:all`
  - `npm run ui:docs:check`
  - `npm run ui:smoke:theme-pack`
- 필요하면 다음도 확장 후보로 본다.
  - `npm run ui:build`
  - `npm run ui:done:check`

### 4. dependency / runtime risk 검사

- JS workspace 가 있으므로 dependency risk 신호를 별도 lane 으로 둘 수 있다.
- 초기에는 아래 수준만 권장한다.
  - lockfile 존재 여부와 package workspace 기본 무결성 확인
  - install/build/lint 실패가 dependency breakage 로 보이는지 분류
  - 필요시 `npm audit` 같은 보안 신호를 future option 으로 검토
- 외부 네트워크나 대규모 install 을 당연한 기본값으로 두지는 않는다.

## 아침에 보고받을 항목

### 반드시 봐야 하는 것

- 새로 `blocked` 또는 `failed` 로 읽히는 mission
- 전날 대비 blocker 가 늘어난 mission
- current lane artifact split 이 빠진 mission
- owner boundary 위반 신호
- UI validate / lint / docs check 실패
- dependency 또는 runtime breakage 의심 신호

### 보면 좋은 것

- `promotion review needed` 로 읽히는 mission 후보
- historical mismatch 로 남겨둘 수 있는 blocked sample
- completed 이지만 current contract 기준으로 재검토가 필요한 sample
- 향후 종합 기능에서 볼 만한 mission level 변화 힌트

## 매일 체크 권장 순서

1. mission surface 존재와 상태 일관성 확인
2. `mission_check` 계열 readiness 재검토
3. blocked reason 분류
   - `historical_mismatch`
   - `mission_surface_gap`
   - `canon_gap`
   - `runtime_gap`
4. project boundary / docs link 검사
5. UI validate / lint / smoke 검사
6. dependency/runtime risk 신호 분류
7. owner 가 볼 advisory report 작성

## 권장 출력 형태

- nightly sweep 의 owner-facing report 는 local-only `reports/` 아래에 남기는 쪽이 자연스럽다.
- nightly sweep 자체의 시간순 trace 는 local-only `log/` 아래에 남길 수 있다.
- 예시:
  - `_workspaces/<project_code>/.project_agent/reports/nightly_report/<date>.md`
  - `_workspaces/<project_code>/.project_agent/reports/nightly_report/latest.md`
  - `_workspaces/<project_code>/.project_agent/log/nightly_sweep/<date>.md`
  - `_workspaces/<project_code>/.project_agent/log/nightly_sweep/latest.md`
- 아침에 owner 가 보는 briefing 은 별도 morning report contract 로 분리할 수 있다.
- 현재 연결 문서는 [`MORNING_PROJECT_REPORT_CONTRACT.md`](/Users/seabotmoon-air/Workspace/Soulforge/.mission/MORNING_PROJECT_REPORT_CONTRACT.md) 이다.
- tracked repo 에는 실제 report dump 를 두지 않는다.
- tracked repo 쪽에는 필요하면 public-safe sample report example 만 둔다.

## 권장 report 섹션

1. Executive snapshot
   - active / blocked / completed counts
   - 새 red flag 수
2. Mission review needed
   - 즉시 사람이 봐야 하는 mission
3. Promotion review candidates
   - 승격 검토 후보
4. Boundary and docs health
   - owner boundary / link / contract 문제
5. UI workspace health
   - validate / lint / docs / smoke 결과
6. Dependency and runtime risk
   - build/install/audit 계열 신호
7. Tomorrow actions
   - 다음날 사람이 직접 판단할 일

## 지금 추천하는 최소 시작안

- nightly sweep v0 에서는 아래만 먼저 한다.
  - mission surface 검사
  - `mission_check` 기반 advisory review
  - UI `validate`, `lint:all`, `docs:check`
  - local report 작성
- 아래는 v1 이후로 미룬다.
  - build / done check
  - dependency audit
  - 종합 기능 연동

## 아직 미정인 것

- nightly sweep 가 readiness 상태 변경을 제안만 할지, 별도 suggestion surface 를 둘지
- 어떤 mission 까지 sweep 대상에 포함할지
- dependency audit 을 기본값으로 넣을지
- UI build 를 매일 필수로 돌릴지
- future 종합 기능이 어떤 메타를 실제로 읽을지

## ASSUMPTIONS

- nightly sweep 는 `보고`와 `제안` 중심이고, `판정`과 `승격`은 owner 수동 판단으로 남긴다.
- Soulforge 현재 저장소 기준으로 mission 검사와 UI workspace 검사가 nightly sweep 의 가장 현실적인 출발점이라고 본다.

# Vision And Goals

## 목적

- 이 문서는 Soulforge가 왜 존재하는지, 무엇을 향해 구조를 쌓는지, 어느 상태를 성공으로 볼지를 명시한다.
- `REPOSITORY_PURPOSE.md` 가 owner 경계와 저장소 범위를 고정한다면, 이 문서는 운영 관점의 북극성을 고정한다.

## 한 줄 비전

- Soulforge는 사람이 한 번 수동으로 해낸 일을 reusable canon, held mission, local run truth 로 분해해 다시 자동화 가능한 운영 자산으로 바꾸는 저장소다.

## 무엇을 만들고 있는가

Soulforge는 단순한 agent catalog 나 workflow 예시 묶음이 아니다. 목표는 아래 세 층이 같은 언어로 이어지는 구조를 만드는 것이다.

1. reusable canon
2. held mission
3. project-local run truth

즉:

- reusable behavior 는 `.registry/skills/`, `.workflow/`, `.party/` 에 남기고
- 지금 들고 있는 실제 실행 계획은 `.mission/` 이 소유하고
- 실제 현장 실행 흔적은 `_workmeta/<project_code>/runs/<run_id>/` 아래에 남기는 구조를 목표로 한다.

## 왜 이 구조가 필요한가

- 수동으로 잘 된 작업이 나중에 자동화 후보가 되어야 한다.
- 자동화가 실패하면 다시 사람이 회수하고, 그 기록을 다시 canon promotion 재료로 써야 한다.
- public repo 에 올려도 되는 구조/문서/정본과 local runtime truth 를 섞지 않아야 한다.
- UI 는 이 정본에서 파생되어야 하고, 정본을 대신하면 안 된다.

## 목표 상태

```mermaid
flowchart TD
  H["human-guided manual work"] --> M[".mission/<mission_id>"]
  M --> R["project-local runs/<run_id>"]
  R --> L["curated lesson / promotion decision"]
  L --> C["skill / workflow / party canon"]
  C --> A["automation or autohunt lane"]
  A --> M2["new mission generation"]
```

## 현재 핵심 목표

### 1. owner 경계 고정

- `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces` 가 무엇을 소유하는지 흔들리지 않게 한다.

### 2. 수동 절차를 mission 으로 승격

- 사람이 직접 수행한 건도 `mission` 으로 보고, readiness 와 run truth 를 분리해서 남긴다.

### 3. reusable skill / workflow / party 축 강화

- 반복되는 행동은 skill 로
- 반복되는 절차는 workflow 로
- 반복되는 팀 조합은 party 로 올린다.

### 4. 길마 lane 확립

- guild master / administrator lane 이 request review, mission readiness review, authoring lane, promotion 판단을 맡는 운영 기본선을 만든다.

### 5. 자동화는 mission 위에 올린다

- autohunt, nightly sweep, runner preflight 같은 자동 운영은 mission 을 생성·검사·실행하는 상위 운영층으로 둔다.

## 성공 조건

아래가 반복 가능해지면 Soulforge는 목표에 가까워진다.

1. 사람이 수동으로 작업한다.
2. 그 작업을 mission + run truth 로 남긴다.
3. reusable 부분을 skill/workflow/party 로 승격한다.
4. 같은 종류의 요청을 mission 으로 다시 생성한다.
5. `mission_check` 같은 readiness gate 를 통과한다.
6. runner/autohunt 가 자동으로 재실행한다.

## 비목표

- 모든 runtime 구현을 지금 당장 옮기는 것
- `_workspaces` 를 public tracked data root 로 만드는 것
- UI 를 정본보다 먼저 완성하는 것
- 한번의 사례만으로 universal standard 를 성급하게 고정하는 것

## 현재 phase 감각

- `.workflow` 는 reusable procedure canon 이다.
- `.mission` 은 실제로 들고 있는 실행 계획이다.
- `run` 은 project-local execution attempt 다.
- 수동 절차도 mission 이고, 자동 절차도 mission 이다.
- 자동화는 mission 위에서 돌고, mission 을 대신하는 새 owner 가 아니다.

## 다음에 계속 채워야 하는 것

- 어떤 mission 이 default operating lane 이 되는지
- 어떤 조건이면 manual mission 을 autohunt 대상으로 올리는지
- guild master lane 이 current default 인지 universal standard 인지
- `mission_check` 와 future nightly sweep 의 owner 경계


# Autohunt Model

## 목적

- 이 문서는 `_workmeta/<project_code>/autohunt/` 가 자동사냥 운영 계층으로 무엇을 소유하는지 고정한다.
- workflow, party, runner, mailbox routing 의 책임을 섞지 않는다.

## 한 줄 정의

- `autohunt/` 는 mail 또는 dispatch source 를 monster 로 분해하고, 그 monster 를 어떤 workflow 와 party 로 자동 처리할지 정하는 local operating policy surface 다.

## 관계도

```mermaid
flowchart TD
  MB["mailbox / incoming request"] --> MR["autohunt/mailbox_rules.yaml"]
  MR --> MT["monster_type"]
  MT --> RT["autohunt/routing.yaml"]
  RT --> WF["workflow_id"]
  RT --> PT["party_id"]
  WF --> RUN["runner"]
  PT --> RUN
  RUN --> RAW["runs/<run_id>/ raw truth"]
  RUN --> ESC["human escalation"]
  ESC --> LEARN["manual hunt notes / workflow promotion"]
```

## 시퀀스

```mermaid
sequenceDiagram
  participant MB as mailbox
  participant AH as autohunt
  participant RUN as runner
  participant SA as sub-agent
  participant RAW as runs/<run_id>
  MB->>AH: incoming request
  AH->>AH: classify monster_type
  AH->>AH: route to workflow_id + party_id
  AH->>RUN: dispatch_request
  RUN->>SA: resolved run packet
  SA-->>RUN: execution result
  RUN->>RAW: save raw truth
  RUN-->>AH: success or escalation
```

## 책임

- `workflow` 는 절차와 step 순서를 소유한다.
- `party` 는 slot 과 unit composition 을 소유한다.
- `autohunt` 는 어떤 monster 를 어떤 workflow / party 로 자동 보낼지 소유한다.
- `autohunt` 는 필요하면 runner 로 넘길 dispatch request 를 만든다.
- `runner` 는 workflow 와 party 를 읽어 실제 sub-agent execution 을 수행한다.
- human `guild master` 는 실패한 hunt 의 escalation 을 받고, manual hunt 기록과 canon promotion 판단을 맡는 상위 운영 주체가 될 수 있다.
- raw truth 는 언제나 `runs/<run_id>/` 아래에 남긴다.

## 최소 파일

- `policy.yaml`
  - auto mode, retry, escalation, manual hunt capture policy
- `routing.yaml`
  - `monster_type -> workflow_id + party_id`
- `mailbox_rules.yaml`
  - mailbox input 을 어떤 monster type 으로 읽을지

## 초기 운영값

- `mode: supervised`
- known monster 는 자동 실행
- unknown monster 는 바로 human escalation
- 실패는 1회만 재시도
- manual hunt 기록은 남기되 자동 승격은 하지 않음

## human escalation lane

- supervised autohunt 의 기본 human receiver 는 future `guild master` unit 를 상정한다.
- 이 lane 에서는 사람이 직접 hunt 를 수행하고, 그 흔적을 workflow/skill/tool promotion 재료로 남긴다.
- Soulforge 전용 `skill creator` 나 `skill checker` 같은 authoring aid 가 필요해지면, 우선 이 human guild-master lane 아래에서 운용하는 것을 기본안으로 본다.

## tracked mirror 와 local runtime

- tracked sample 은 `docs/architecture/workspace/examples/<project_code>/_workmeta/autohunt/` 아래에 둔다.
- actual operating state, queue, pending monster, retry counter, local override 는 `_workmeta/<project_code>/autohunt/` 아래에만 둔다.

## 경계

- `autohunt/` 는 top-level canonical root 가 아니다.
- `autohunt/` 는 local operating layer 이며, tracked repo 에는 public-safe sample 과 문서만 둔다.
- host-local mailbox endpoint, secrets, queue snapshot, actual run dump 는 tracked sample 에 두지 않는다.


# MAIL_TO_MISSION_HANDOFF_V0

## 목적

- 이 문서는 current-default v0 에서 `mail intake -> held mission` handoff 를 어디까지 tracked surface 로 올릴지 잠그는 workspace contract draft 다.
- 목표는 실제 메일 연동을 넓히는 것이 아니라, 첫 `mail -> .mission/**` write 를 public-safe 형태로 재현 가능하게 만드는 것이다.

## 한 줄 정의

- v0 에서는 workspace intake inbox 의 몬스터가 dungeon/stage assignment 를 마친 뒤, workflow selection 이 아직 끝나지 않았더라도 `.mission/<mission_id>/` 에 tracked draft mission 을 만들 수 있다.

## 경계

- raw mailbox payload, live mailbox cursor, attachment binary, private message body 전체는 `_workspaces/**/.project_agent/**` 아래에 남긴다.
- `.mission/**` 는 raw mail dump owner 가 아니라, mail intake 로부터 파생된 held mission draft 와 readiness pointer 를 소유한다.
- 이 contract 는 `MAIL_INTAKE_REQUEST_V0` 와 `WORKSPACE_INTAKE_INBOX_V0`, `DUNGEON_ASSIGNMENT_REQUEST_V0` 뒤에서만 적용한다.
- `workflow_id` 가 아직 확정되지 않아도 first tracked handoff 는 허용한다.
- 다만 `workflow_id` 가 비어 있으면 `readiness.yaml` 은 반드시 `blocked` 로 남고, blocker owner 를 명시해야 한다.

## v0 handoff 최소 필드

### intake 에서 확보해야 하는 값

- `source_kind`
  - 고정값: `mail`
- `source_ref`
  - 예: `synthetic-mail-2026-03-19-001`
- `mailbox_id`
  - 예: `synthetic_inbox`
- `received_at`
- `title`
- `request_summary`
- `project_code`
- `stage`
- `automation_possibility`

### first tracked mission draft 에서 써야 하는 값

- `mission_id`
- `status`
  - `blocked` 또는 `ready`
- `project_code`
- `party_id`
- `unit_assignments`
- `request_mode`
  - v0 기본값: `mail_intake`
- `monster_type`
  - v0 기본값: `mail_intake_request`
- `input_refs.source_mail`
- `input_refs.mailbox_payload`

### `ready` 전에 추가로 resolve 해야 하는 값

- `workflow_id`
- execution 직전 확인이 필요한 attachment/version note

## tracked surface 매핑

### `.mission/<mission_id>/mission.yaml`

- `mission_id`
- `kind: mission`
- `status`
- `title`
- `summary`
- `project_code`
- `workflow_id`
  - unresolved 상태에서는 `null` 허용
- `party_id`
- `request_mode`
- `monster_type`
- `unit_assignments`
- `input_refs`
- `run_refs`

### `.mission/<mission_id>/readiness.yaml`

- `mission_id`
- `kind: mission_readiness`
- `status`
- `summary`
- `checks`
- `blockers`
- `latest_run_id`

### `.mission/<mission_id>/dispatch_request.yaml`

- `request.source`
- `request.request_mode`
- `request.monster_type`
- `request.workflow_id`
- `request.party_id`
- `request.project_code`
- `request.source_ref`
- `request.automation_possibility`
- `request.stage`
- `request.summary`

## v0 규칙

- first tracked write 는 `mail -> blocked mission draft` 여도 충분하다.
- `workflow_id: null` 은 current-default v0 에서 오직 first handoff 단계에서만 허용한다.
- `workflow_id: null` 인 mission 은 `readiness.yaml` 에서 `workflow_present: missing` 으로 드러나야 한다.
- `battle_event` 생성과 `mission_close` 는 workflow selection 과 execution evidence 이후에만 가능하다.

## sample handoff

```yaml
mission_id: play_loop_mail_intake_demo_project_001
status: blocked
source_kind: mail
source_ref: synthetic-mail-2026-03-19-001
mailbox_id: synthetic_inbox
received_at: 2026-03-19T08:40:00+09:00
title: Demo Project Kickoff Deck Refresh Intake
request_summary: Accept the bounded kickoff deck refresh request as a held mission draft and keep execution blocked until workflow selection and attachment confirmation are explicit.
project_code: demo_project
stage: 1-1 kickoff alignment
automation_possibility: manual_assist_needed
party_id: guild_master_cell
unit_assignments:
  intake_owner: guild_master
  reviewer: guild_master
workflow_id: null
request_mode: mail_intake
monster_type: mail_intake_request
input_refs:
  source_mail: synthetic-mail-2026-03-19-001
  mailbox_payload: _workspaces/demo_project/.project_agent/autohunt/mailbox_payload_sample.yaml
```

## 연결 문서

- [`MAIL_INTAKE_REQUEST_V0.md`](../../../docs/architecture/workspace/MAIL_INTAKE_REQUEST_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](../../../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`DUNGEON_ASSIGNMENT_REQUEST_V0.md`](../../../docs/architecture/workspace/DUNGEON_ASSIGNMENT_REQUEST_V0.md)
- [`MISSION_MODEL.md`](../../../docs/architecture/workspace/MISSION_MODEL.md)
- [`MISSION_MANUAL_DRAFT.md`](../../../docs/architecture/workspace/MISSION_MANUAL_DRAFT.md)
- [`MAILBOX_CONCRETE_CONTRACT_V0.md`](../../../docs/architecture/workspace/MAILBOX_CONCRETE_CONTRACT_V0.md)
- [`BATTLE_LOG_STORAGE_PLAN.md`](../../../docs/architecture/workspace/BATTLE_LOG_STORAGE_PLAN.md)
- [`PLAY_LOOP_V0.md`](../../../.mission/PLAY_LOOP_V0.md)

## ASSUMPTIONS

- v0 의 첫 성공은 workflow canon 확장이 아니라, mail intake 결과가 public-safe held mission draft 로 넘어가는 경계를 안정적으로 재현하는 데 있다고 본다.
- attachment binary 와 mailbox concrete state 는 계속 local-only owner 로 남긴다.

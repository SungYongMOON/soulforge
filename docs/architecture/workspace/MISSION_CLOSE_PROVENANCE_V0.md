# MISSION_CLOSE_PROVENANCE_V0

## 목적

- 이 문서는 current-default v0 에서 `mission_close provenance` 를 어디에 어떤 최소 필드로 남길지 잠그는 workspace contract draft 다.
- universal standard 가 아니라, 실제로 써보면서 보정할 v0 lock 으로 둔다.
- raw evidence owner 와 owner-facing pointer 를 분리해 nightly anomaly review 가 가능하도록 한다.

## 한 줄 정의

- current-default v0 에서는 raw `mission_close` 근거는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 아래에 두고, owner-facing pointer 는 `.mission/<mission_id>/readiness.yaml` 의 `terminal_provenance` 블록으로 남기는 것을 기본으로 본다.

## 경계

- raw evidence owner 는 계속 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 다.
- `.mission/<mission_id>/readiness.yaml` 은 raw dump owner 가 아니라, terminal 상태를 읽기 위한 owner-facing pointer surface 다.
- `terminal_provenance` 는 raw truth 를 복제하지 않고, nightly review 와 readiness 확인에 필요한 최소 참조만 남긴다.
- `project_code` 는 이미 `.mission/<mission_id>/mission.yaml` 에서 resolve 가능하므로 provenance 최소 필드에서 중복 요구하지 않는다.

## v0 최소 필드

- `closed_via`
  - 고정값: `mission_close`
- `closed_at`
  - terminal transition 시각
- `terminal_result`
  - 예: `completed`, `blocked`, `failed`
- `run_id`
  - raw evidence 가 들어 있는 local run truth id
- `battle_event_id`
  - mission-level terminal battle outcome 을 가리키는 event id

## sample YAML

```yaml
terminal_provenance:
  closed_via: mission_close
  closed_at: 2026-03-19T09:12:00+09:00
  terminal_result: completed
  run_id: demo_project_run_2026_03_19_001
  battle_event_id: battle-2026-03-19-0001
```

## why this is enough for v0

- `closed_via` 로 direct terminal write 와 `mission_close` 경유를 구분할 수 있다.
- `closed_at` 으로 readiness 시점과 nightly review 시점을 비교할 수 있다.
- `terminal_result` 로 `.mission` 상태와 battle outcome 이 어긋나는지 볼 수 있다.
- `run_id` 로 raw run truth owner 를 `_workspaces/.../runs/<run_id>/` 에서 역추적할 수 있다.
- `battle_event_id` 로 mission-level battle outcome 과 readiness terminal pointer 를 대조할 수 있다.

## nightly 가 이 pointer 로 보는 것

- terminal mission 인데 `terminal_provenance` 자체가 없음
- `closed_via` 가 `mission_close` 가 아니거나 비어 있음
- `terminal_result` 와 readiness status 가 다름
- `run_id` 가 가리키는 raw evidence 가 없음
- `battle_event_id` 가 가리키는 mission-level battle outcome 이 없음

## 지금 하지 않는 것

- schema level universal standard 승격
- sample mission readiness YAML 일괄 개편
- raw evidence path 전체를 `.mission` 에 중복 기록
- `project_code`, `workflow_id`, `party_id` 를 provenance 최소 필드에 다시 복제

## ASSUMPTIONS

- current-default v0 에서는 `run_id` 와 `battle_event_id` 만으로 nightly review 와 역추적에 충분하다고 본다.
- `terminal_result` enum 의 상세값은 기존 readiness / battle_event 해석을 따른다.
- 이 문서는 workspace contract draft 이며, 실제 사용 후 구조 정본 문서로 승격할지 다시 판단한다.

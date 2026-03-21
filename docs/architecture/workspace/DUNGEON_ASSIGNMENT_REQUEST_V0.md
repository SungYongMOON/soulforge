# DUNGEON_ASSIGNMENT_REQUEST_V0

## 목적

- 이 문서는 `workspace intake inbox` 에서 만들어진 몬스터들을 실제 project dungeon / stage inbox 로 배치하는 다음 호출을 잠근다.
- mail intake 단계와 project/state resolve 단계를 분리해, 프로젝트 규칙이 미확정이어도 monster materialization 을 먼저 열 수 있게 한다.

## 한 줄 정의

- `dungeon_assignment_request` 는 `workspace intake inbox` 의 몬스터를 읽고, project 정보와 current state 를 근거로 어느 dungeon/stage inbox 로 보낼지 결정하는 호출이다.

## 입력 최소 필드

- `action`
  - 고정값: `dungeon_assignment_request`
- `workspace_intake_inbox_ref`
- `monster_ids`
  - 일부만 먼저 배치할 수도 있다
- `project_catalog_ref`
  - optional
- `project_state_refs`
  - optional
- `assignment_owner`

## 출력 최소 필드

- `request_id`
- `status`
  - 예: `assigned`, `partially_assigned`, `blocked`
- `assignment_results`
  - monster 별 result
- `remaining_monster_ids`
- `blocked_reasons`

## v0 규칙

- project/stage 를 resolve 하지 못한 몬스터는 `workspace intake inbox` 에 남겨도 된다.
- assignment 는 monster 단위로 부분 성공을 허용한다.
- assignment 이후에야 project-local inbox 와 `.mission/**` handoff 가 가능하다.
- assignment 결과는 `gateway` current state 에도 반영되어야 한다.
  - 각 monster 는 `assignment_status`, `assigned_project_code`, `assigned_stage`, `assigned_target_inbox_ref` 를 현재 상태로 가진다.
  - project 쪽 monster record 가 실제로 materialize 되면 `project_monster_ref`, `transferred_at` 도 함께 채운다.
  - 전역 event stream 에는 `assigned_to_dungeon`, `assignment_blocked`, `monster_reassigned`, `transferred_to_project` 같은 semantic event 를 남긴다.
  - project 쪽 monster record 는 같은 `monster_id` 를 `source_monster_id` 로 보관해 1:1 reconciliation 을 가능하게 해야 한다.

## sample response

```yaml
request_id: dungeon_assignment_hiworks_2026_03_19_001
status: partially_assigned
assignment_results:
  - monster_id: monster_hiworks_2026_03_19_001_a
    result: assigned
    project_code: project_000_000
    stage: se_stage_2
    target_inbox_ref: _workspaces/project_000_000/.../stage_inbox/se_stage_2/monster_hiworks_2026_03_19_001_a
  - monster_id: monster_hiworks_2026_03_19_001_b
    result: blocked
    project_code: null
    stage: null
    target_inbox_ref: null
    reason: project keyword 는 잡혔지만 current project catalog 와 정확히 매핑되지 않았다.
remaining_monster_ids:
  - monster_hiworks_2026_03_19_001_b
blocked_reasons:
  - unresolved project mapping
```

## 연결 문서

- [`WORKSPACE_INTAKE_INBOX_V0.md`](../../../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`MAIL_TO_MISSION_HANDOFF_V0.md`](../../../docs/architecture/workspace/MAIL_TO_MISSION_HANDOFF_V0.md)

## ASSUMPTIONS

- actual project catalog 와 SE stage resolver 는 뒤에서 보강될 것이므로, v0 는 partial assignment 와 blocked 잔류를 허용하는 모델로 본다.

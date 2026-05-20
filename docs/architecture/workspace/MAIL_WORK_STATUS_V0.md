# MAIL_WORK_STATUS_V0

## 목적

- 이 문서는 mail-derived work item 의 현재 진행 상태를 local-only projection 으로 묶는 `mail_work_status` contract 를 잠근다.
- 목표는 raw mail 이 아니라 metadata-only join 결과를 통해 `후보 -> 몬스터 -> project -> mission -> battle -> completion mark` 흐름을 한 눈에 보이게 하는 것이다.

## 한 줄 정의

- `mail_work_status` 는 `mail_candidate`, `workspace intake inbox`, project-local monster, private mission index, battle event metadata 를 `monster_id` 중심으로 조인한 local-only 현재 상태 projection 이다.

## world model

```text
mail rumor -> candidate note -> gateway monster -> project monster
-> mission -> battle_log -> completion mark
```

## output

- canonical local output:
  - `guild_hall/state/gateway/mail_work_status/latest.json`
- owner:
  - `guild_hall/state/gateway/**`
- tracked public repo 대상이 아니다.

## source surface

- `guild_hall/state/gateway/mail_candidate/queue/pending/*.json`
- `guild_hall/state/gateway/intake_inbox/*/inbox.json`
- `guild_hall/state/gateway/intake_inbox/*/monsters.json`
- `_workmeta/<project_code>/monsters/*.yaml`
- `_workmeta/<project_code>/missions/index.yaml`
- `_workmeta/<project_code>/log/events/**/battle_events.jsonl`

읽지 않는 것:

- raw mailbox payload
- full mail body / HTML
- attachment binary / URL payload
- token / cookie / session / credential file

## projection shape

### root

- `schema_version`
- `kind`
- `generated_at`
- `count`
- `counts`
- `entries`
- `boundary.raw_payload_copied`

### row minimum fields

- `mail_source_ref`
- `candidate_id`
- `inbox_id`
- `monster_id`
- `project_code`
- `project_monster_ref`
- `mission_id`
- `mission_ref`
- `battle_event_id`
- `terminal_result`
- `work_status`
- `status_reason`
- `refs`
- `updated_at`
- `boundary.raw_payload_copied`

## status enum

- `candidate_pending`
  - candidate note 만 있고 gateway monster 가 아직 materialize 되지 않았다.
- `monster_pending_assignment`
  - gateway monster 는 있지만 project transfer 전이다.
- `assigned_to_project`
  - project monster 는 materialize 되었지만 mission/battle terminal 상태는 아직 아니다.
- `mission_blocked`
  - private mission surface 가 `blocked` 이고 terminal battle evidence 는 아직 없다.
- `mission_ready`
  - private mission surface 가 `ready` 이고 terminal battle evidence 는 아직 없다.
- `completed`
- `completed_with_follow_up`
- `blocked`
- `failed`
- `unknown`

## reconciliation order

1. `candidate_id` 와 `mail_source_ref` 는 `mail_candidate.source_event.event_id` 기준으로 찾는다.
2. gateway current state 는 `workspace intake inbox` 의 `inbox.json` / `monsters.json` 조합을 기준으로 읽는다.
3. project current state 는 `_workmeta/<project_code>/monsters/<monster_id>.yaml` 의 `source_monster_id` 또는 `monster_id` 를 기준으로 붙인다.
4. mission current state 는 project-local `missions/index.yaml` 의 `mission_ref` / `mission_id` 를 기준으로 붙인다.
5. terminal result 는 가능한 경우 latest `battle_events.jsonl` event 가 우선한다.
6. battle evidence 가 없더라도 terminal mission state 가 `completed` 또는 `failed` 면 completion mark 로 투영할 수 있다.

## v0 rules

1. completion mark 는 raw mail 이 아니라 battle evidence 또는 terminal mission state 에서만 나온다.
2. `mail_candidate` 는 pre-monster note 이므로 완료 truth owner 가 아니다.
3. 같은 mail source 에서 여러 monster 가 나오면 `candidate_id` 가 여러 row 에 반복될 수 있다.
4. project-local monster 가 실제로 materialize 되면 gateway current state 는 `transferred` 로 sync-back 되어야 한다.
5. projection 은 metadata-only summary 이다. `refs` 는 pointer surface 만 들고 raw payload 는 복사하지 않는다.
6. stale `latest.json` 을 읽을 수 있으므로 refresh surface 를 별도로 둔다.

## sample

```json
{
  "schema_version": "soulforge.gateway.mail_work_status.v1",
  "kind": "mail_work_status_projection",
  "generated_at": "2026-05-20T02:10:00.000Z",
  "count": 3,
  "counts": {
    "candidate_pending": 1,
    "monster_pending_assignment": 1,
    "completed_with_follow_up": 1
  },
  "entries": [
    {
      "mail_source_ref": "mail_evt_001",
      "candidate_id": "mail_candidate_mail_evt_001",
      "inbox_id": null,
      "monster_id": null,
      "project_code": null,
      "project_monster_ref": null,
      "mission_id": null,
      "mission_ref": null,
      "battle_event_id": null,
      "terminal_result": null,
      "work_status": "candidate_pending",
      "status_reason": "candidate status pending_review",
      "refs": {
        "candidate_ref": "guild_hall/state/gateway/mail_candidate/queue/pending/mail_candidate_mail_evt_001.json"
      },
      "updated_at": "2026-05-20T02:00:00.000Z",
      "boundary": {
        "raw_payload_copied": false
      }
    }
  ],
  "boundary": {
    "raw_payload_copied": false
  }
}
```

## 관련 문서

- [`MAIL_CANDIDATE_QUEUE_V0.md`](../../../docs/architecture/workspace/MAIL_CANDIDATE_QUEUE_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](../../../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`DUNGEON_ASSIGNMENT_REQUEST_V0.md`](../../../docs/architecture/workspace/DUNGEON_ASSIGNMENT_REQUEST_V0.md)
- [`MAIL_TO_MISSION_HANDOFF_V0.md`](../../../docs/architecture/workspace/MAIL_TO_MISSION_HANDOFF_V0.md)
- [`BATTLE_LOG_STORAGE_PLAN.md`](../../../docs/architecture/workspace/BATTLE_LOG_STORAGE_PLAN.md)

## ASSUMPTIONS

- current-default v0 는 local-only projection 과 reconciliation 을 먼저 잠그고, explicit completion mutation command 는 별도 slice 로 추가한다.
- battle event 의 latest terminal truth 는 project-local monthly `battle_events.jsonl` 기준으로 읽는다.

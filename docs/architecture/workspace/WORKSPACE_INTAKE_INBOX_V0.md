# WORKSPACE_INTAKE_INBOX_V0

## 목적

- 이 문서는 project/stage assignment 전에 mail 로부터 뽑힌 몬스터들을 잠시 담아두는 `workspace intake inbox` staging surface 를 잠근다.
- project 정보와 SE 단계 resolve 규칙이 아직 불완전해도, mail -> monster materialization 을 먼저 안정화하는 것이 목적이다.

## 한 줄 정의

- `workspace intake inbox` 는 project 무관한 배치 전 대기장이다.
- mail 1건은 inbox container 1개가 되고, 그 안에 `monsters[]` 가 들어간다.
- v0 의 실제 위치는 `guild_hall/state/gateway/intake_inbox/` 로 고정한다.

## 경계

- 이 inbox 는 최종 project inbox 가 아니다.
- 이 inbox 는 dungeon/stage assignment 가 끝나기 전의 staging surface 다.
- known monster 와 `unknown_monster` 는 모두 여기에 들어간다.
- `.mission/**` 는 이 inbox 단계 뒤에서만 시작한다.
- `gateway` 는 project code 가 아니라 workspace-level ingress/staging site 다.

## 권장 파일

- `guild_hall/state/gateway/intake_inbox/<inbox_id>/inbox.json`
- `guild_hall/state/gateway/intake_inbox/<inbox_id>/monsters.json`
- `guild_hall/state/gateway/intake_inbox/<inbox_id>/history.jsonl`
- `guild_hall/state/gateway/log/monster_events/YYYY/YYYY-MM.jsonl`

## logging storage model

- `inbox.json`, `monsters.json` 은 현재 상태 cache 다.
- `history.jsonl` 은 mail 1건 inbox container 의 append-only local change log 다.
- `monster_events/YYYY/YYYY-MM.jsonl` 은 workspace-level append-only global event stream 이다.
- source of truth 는 `JSON` current state + `JSONL` event log 조합으로 본다.
- `CSV` 는 source of truth 로 쓰지 않고, family count, daily volume, unknown ratio 같은 파생 분석 export 로만 쓴다.
- 분석이 커져도 먼저 monthly `JSONL` partition 을 유지하고, 반복 질의가 늘면 `SQLite` 또는 `DuckDB` 파생 view 를 추가하는 쪽을 기본안으로 본다.

## logging minimum fields

### `inbox.json`

- `workspace_intake_inbox_id`
- `source_ref`
- `event_ref`
- `raw_ref`
- `received_at`
- `mailbox_id`
- `subject`
- `from`
- `to`
- `cc`
- `body_excerpt`
- `assignment_status`
- `monster_count`
- `monster_ids`
- `linked_existing_count`
- `linked_existing_monster_ids`
- `resolution_status`
- `created_at`
- `updated_at`

### `history.jsonl`

- `event_type`
- `at`
- `inbox_id`
- `source_ref`
- `monster_id`
  - optional, inbox-level event 에서는 생략 가능
- `changes`
  - changed field name list
- `before`
  - changed field subset only
- `after`
  - changed field subset only
- `change_source`
  - optional, 예: `auto_rule`, `manual_review`

### `monster_events/YYYY/YYYY-MM.jsonl`

- `event_type`
- `at`
- `inbox_id`
- `source_ref`
- `monster_id`
  - optional, inbox-level event 에서는 생략 가능
- `monster_family`
- `monster_name`
- `work_pattern`
- `due_state`
- `known_status`
- `assignment_status`
- `assigned_project_code`
- `assigned_stage`
- `assigned_target_inbox_ref`
- `project_monster_ref`
- `transferred_at`
- `dedupe_key`
- `mail_role`
- `change_source`
  - optional
- `reason_code`
  - optional

## logging rules

1. 전역 `monster_events` 는 analytics source stream 이므로 append-only 로 유지한다.
2. per-inbox `history.jsonl` 은 "어떤 mail 이 어떻게 monster 로 바뀌었는가" 를 복구할 수 있어야 한다.
3. 전역 log 에는 attachment binary, full body dump, giant snapshot 을 반복 저장하지 않는다.
4. 변경 이벤트는 가능하면 changed subset 만 남기고, full current state 는 `inbox.json` 과 `monsters.json` 이 맡는다.
5. `CSV` 나 `SQLite` export 는 언제든 다시 만들 수 있어야 하므로, 전역 `monster_events` 를 기준으로 파생한다.
6. `monster_id` 는 intake 와 project 쪽을 잇는 stable cross-surface key 다. 배치와 이동 후에도 바꾸지 않는다.
7. `assignment_status: transferred` 인 monster 는 `project_monster_ref` 와 `transferred_at` 를 반드시 가진다.
8. project 쪽 monster record 는 `captured` 이후에도 삭제하지 않고 상태만 바꾼다.
9. reconciliation 기본식은 `project-side monster record count == gateway transferred monster count` 다.
10. mail 은 먼저 기존 monster match 를 본다. `match_existing_monster_id` 또는 `dedupe_key` 가 맞으면 새 monster 를 만들지 않는다.

## 최소 구조

### inbox container

- `workspace_intake_inbox_id`
- `source_kind`
  - v0 기본값: `mail`
- `source_ref`
- `event_ref`
- `raw_ref`
- `attachment_refs`
- `received_at`
- `mailbox_id`
- `intake_owner`
- `subject`
- `from`
- `to`
- `cc`
- `body_excerpt`
- `assignment_status`
  - 예: `pending_dungeon_assignment`, `partially_assigned`, `assigned`, `not_required`
- `resolution_status`
  - 예: `created_only`, `linked_existing_only`, `mixed`, `empty`
- `monsters`
- `linked_existing_monster_ids`

### monster 최소 필드

- `monster_id`
- `monster_family`
  - 모르면 `unknown_monster`
- `monster_name`
  - v0 에서는 optional
- `work_pattern`
  - v0 에서는 optional
- `objective`
- `d_day`
  - optional
- `due_state`
  - 예: `no_due`, `scheduled`, `at_risk`, `missed`
- `known_status`
  - 예: `known`, `unknown`
- `source_refs`
- `last_mail_at`
- `mail_touch_count`
- `last_mail_role`
- `project_hints`
- `stage_hints`
- `assignment_status`
  - 예: `pending_dungeon_assignment`, `assigned`, `blocked`, `transferred`
- `assigned_project_code`
- `assigned_stage`
- `assigned_target_inbox_ref`
- `project_monster_ref`
- `transferred_at`
- `dedupe_key`
- `assignment_block_reason`
- `assignment_updated_at`
- `unresolved_reason`
- `mission_ref`
  - v0 기본값: `null`

## v0 규칙

1. request-bearing mail 1건은 inbox container 1개가 된다.
2. mail 안의 요청이 여러 개면 몬스터도 여러 마리다.
3. 기존 monster 와 match 된 mail 요청은 새 monster 를 만들지 않고 `linked_existing_monster_ids` 로만 남긴다.
4. 새로 materialize 된 monster 는 known/unknown 과 상관없이 모두 inbox container 안에 남긴다.
5. project/stage resolve 가 안 되어도 저장은 허용한다.
6. 새 monster 가 하나도 없으면 inbox `assignment_status` 는 `not_required` 일 수 있다.

## sample

```yaml
workspace_intake_inbox_id: hiworks_2026_03_19_001
source_kind: mail
source_ref: hiworks_2026_03_19_001
event_ref: guild_hall/state/gateway/mailbox/company/mail/events/hiworks/2026/2026-03.jsonl#event_id=hiworks_2026_03_19_001
raw_ref: guild_hall/state/gateway/mailbox/company/mail/raw/hiworks/2026/2026-03.jsonl#message_id=002801dcb212$b79a2400$26ce6c00$@sonartech.com
attachment_refs:
  - guild_hall/state/gateway/mailbox/company/mail/attachments/hiworks/example_attachment_001
received_at: 2026-03-19T09:12:00+09:00
mailbox_id: company_mailbox
intake_owner: gateway
subject: 음탐기영상처리장치 IPS 검토를 위한 배선식별자 작성 요청
from:
  - name: 조영남
    address: joyn128@sonartech.com
to:
  - name: 윤정운
    address: jwyun@cotstech.com
cc:
  - name: 문성용
    address: seabot.moon@sonartech.com
body_excerpt: 내부 케이블 제작 전 IPS 검토 요청용 배선 식별자 자료 작성을 부탁드립니다.
assignment_status: pending_dungeon_assignment
monsters:
  - monster_id: monster_hiworks_2026_03_19_001_a
    monster_family: goblin
    monster_name: null
    work_pattern: artifact_authoring
    objective: IPS 검토 요청용 배선 식별자 자료를 작성한다.
    d_day: null
    due_state: no_due
    known_status: known
    project_hints:
      - 음탐기영상처리장치
    stage_hints: []
    assignment_status: pending_dungeon_assignment
    assigned_project_code: null
    assigned_stage: null
    assigned_target_inbox_ref: null
    project_monster_ref: null
    transferred_at: null
    assignment_block_reason: null
    assignment_updated_at: null
    unresolved_reason: project catalog 와 stage resolver 가 아직 적용되지 않았다.
    mission_ref: null
  - monster_id: monster_hiworks_2026_03_19_001_b
    monster_family: unknown_monster
    monster_name: null
    work_pattern: null
    objective: 내부 케이블 관련 추가 검토 요청 범위를 확인한다.
    d_day: null
    due_state: no_due
    known_status: unknown
    project_hints:
      - 음탐기영상처리장치
    stage_hints: []
    assignment_status: pending_dungeon_assignment
    assigned_project_code: null
    assigned_stage: null
    assigned_target_inbox_ref: null
    project_monster_ref: null
    transferred_at: null
    assignment_block_reason: null
    assignment_updated_at: null
    unresolved_reason: 아직 canonical pattern 으로 이름이 잠기지 않았다.
    mission_ref: null
```

## 연결 문서

- [`MAIL_INTAKE_REQUEST_V0.md`](../../../docs/architecture/workspace/MAIL_INTAKE_REQUEST_V0.md)
- [`DUNGEON_ASSIGNMENT_REQUEST_V0.md`](../../../docs/architecture/workspace/DUNGEON_ASSIGNMENT_REQUEST_V0.md)
- [`examples/guild_hall/state/gateway/README.md`](../../../docs/architecture/workspace/examples/guild_hall/state/gateway/README.md)
- [`MONSTER_CANDIDATE_CONTRACT_V0.md`](../../../docs/architecture/workspace/MONSTER_CANDIDATE_CONTRACT_V0.md)

## ASSUMPTIONS

- v0 에서는 `gateway` 를 단일 workspace-level ingress/staging site 로 고정하고, 그 아래 `mailbox/`, `intake_inbox/`, `log/` 가 함께 자랄 수 있다고 본다.

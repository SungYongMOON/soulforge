# Soulforge Snapshot v0

## 목적

- `soulforge_snapshot.json` 은 `Guild Master 작전판` 과 외부 host 가 읽는 read-only 상태 투영물이다.
- 목표는 원본 owner root 를 직접 훑지 않고도 현재 dungeon, mission, gateway 상태를 파악하게 하는 것이다.
- 이 문서는 snapshot 의 field 계약과 보안 경계를 고정한다.

## owner

- producer: `guild_hall/snapshot`
- local output: `guild_hall/state/snapshot/soulforge_snapshot.json`
- output tracking: local-only, public Git 에 올리지 않음

## top-level fields

| field | 의미 |
| --- | --- |
| `schema_version` | `soulforge.snapshot.v0` |
| `generated_at` | snapshot 생성 시각 |
| `source` | producer, mode, privacy mode |
| `repo` | 현재 repo branch 와 dirty count 요약 |
| `active_slice` | 현재 큰 개발 방향 pointer |
| `roots` | owner root 존재 여부와 tracking policy |
| `projects` | `_workspaces` / `_workmeta` project surface 요약 |
| `missions` | tracked `.mission/index.yaml` 기반 mission summary |
| `gateway` | gateway local state 존재 여부와 count 수준 요약 |
| `private_state` | private-state presence 와 continuity surface 요약 |
| `operation_board` | 작전판이 원본 재계산 없이 소비할 public-safe projection |
| `source_observations` | snapshot freshness 판정용 metadata-only source fingerprint |
| `next_actions` | 작전판이 바로 보여줄 다음 개발/운영 action 후보 |
| `diagnostics` | snapshot 생성 중 발견한 warning/error |

## privacy rules

- snapshot 은 owner root 의 원본 내용을 복제하지 않는다.
- `_workspaces/**` 실제 파일 내용은 읽지 않는다.
- `_workmeta/**` 는 project code, expected surface 존재 여부, count 만 읽는다.
- `private-state/**` 는 존재 여부와 continuity surface 여부만 읽는다.
- mailbox raw, attachment, token, credential, session, cookie 값은 읽지 않는다.
- gateway pending monster 는 `intake_inbox/*/monsters.json` 의 derived monster field 만 제한적으로 읽고, mail body/html/source quote/raw ref/attachment ref/provider id 는 제외한다.
- `.mission/index.yaml` 은 public-safe tracked mission summary 이므로 읽을 수 있다.

## freshness

- snapshot 은 `source_observations.fingerprint` 를 포함한다.
- fingerprint 는 원본 내용을 복제하지 않고, source 별 metadata signal 만 해시한다.
- fresh 판정은 저장된 snapshot 의 fingerprint 와 현재 local observation fingerprint 가 같은지로만 결정한다.
- 저장된 snapshot 에 현재 `operation_board` projection schema 가 없으면 재생성 대상이다.
- mismatch 가 있으면 UI 나 외부 host 는 snapshot 을 현재 상태로 표시하지 않아야 한다.
- freshness check 는 아래 source 를 v0 관측 대상으로 둔다.
  - public repo git metadata
  - `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`
  - `.mission/index.yaml`
  - `_workspaces` shallow project directory surface
  - `_workmeta` project metadata surface
  - `guild_hall/state/gateway` state surface
  - `private-state` continuity surface

## project summary

`projects[*]` 는 아래 최소 field 를 가진다.

| field | 의미 |
| --- | --- |
| `project_code` | project/dungeon code |
| `workspace.present` | `_workspaces/<project_code>` 존재 여부 |
| `workspace.mode` | `local_only` |
| `workmeta.present` | `_workmeta/<project_code>` 존재 여부 |
| `workmeta.contract_present` | project contract file 존재 여부 |
| `workmeta.bindings_count` | binding file count |
| `workmeta.report_surfaces` | report directory names |
| `workmeta.mission_artifacts_present` | mission artifact folder 존재 여부 |

## mission summary

`missions.items[*]` 는 `.mission/index.yaml` 에 있는 public-safe field 만 담는다.

- `mission_id`
- `title`
- `project_code`
- `status`
- `readiness_status`
- `workflow_id_present`
- `party_id`

## gateway summary

`gateway` 는 아래처럼 count 와 presence 중심으로만 남긴다.

- `state_root_present`
- `intake_inbox_present`
- `intake_inbox_count`
- `monster_index_present`
- `pending_monsters.count`
- `pending_monsters.by_assignment_status`
- `pending_monsters.by_display_group`
- `pending_monsters.by_family`
- `pending_monsters.by_due_state`
- `pending_monsters.by_known_status`
- `pending_monsters.display_limit`
- `pending_monsters.items[*]`
  - `monster_id`
  - `inbox_id`
  - `monster_family`
  - `monster_name`
  - `work_pattern`
  - `objective_summary`
  - `due_state`
  - `d_day`
  - `known_status`
  - `assignment_status`
  - `display_group`
  - `display_group_label`
  - `display_group_rank`
  - `assigned_project_code`
  - `assigned_stage`
  - `project_hint_count`
  - `stage_hint_count`
  - `mail_touch_count`
  - `last_mail_role`
  - `mission_ref_present`
- `mail_fetch_state_present`
- `mailbox_surfaces.company_present`
- `mailbox_surfaces.personal_present`

`pending_monsters.items` 는 `pending_dungeon_assignment` 와 `blocked` 상태만 최대 24건 display sample 로 담는다.
`display_group` 은 이미 snapshot 에 들어가는 sanitized field 만 사용해 `blocked`, `due_watch`, `assigned_route`, `routing_hints`, `needs_identification`, `open_intake` 로 분류한다.
이 display sample 은 작전판 표시용 요약이며, source mail subject/from/to/cc/body/html/source_quote/raw/attachment 값의 원문 복제 경로가 아니다.

## operation board projection

`operation_board` 는 Operation Board 가 `projects`, `missions`, `gateway.pending_monsters`, `next_actions`, `diagnostics` 를 다시 분류하지 않고 읽을 수 있는 public-safe projection 이다.
새 원본을 읽지 않으며, snapshot 에 이미 들어온 sanitized field 만 재조립한다.

- `schema_version`: `soulforge.operation_board_projection.v0`
- `summary`: project, mission, pending monster, next action, diagnostics count
- `sections.dungeon_map.items[*]`: project code, workspace/workmeta/contract presence, mission count, pending monster count, `surface_status`
- `sections.mission_board.items[*]`: mission summary 와 `display_group` / `display_group_label` / `display_group_rank`
- `sections.monster_gate.groups[*]`: PR #8 이후 pending monster `display_group` 별 `total` 과 display sample `items`
- `sections.action_queue.items[*]`: next action id/status/summary/rank

`operation_board.privacy.mode` 는 `public_safe_snapshot_projection` 이며, mail body/html/source quote/raw ref/attachment ref/provider id/secret 값은 포함하지 않는다.

## 실행

```bash
npm run guild-hall:snapshot
npm run guild-hall:snapshot:check-fresh
npm run guild-hall:snapshot:json
npm run validate:snapshot
```

## 다음 연결

- UI 는 이 snapshot 을 읽어 `Dungeon Map` 과 `Mission Board` 를 먼저 만든다.
- OpenClaw 같은 외부 host 는 원본 private root 대신 이 snapshot 을 읽는 방향으로 연결한다.
- battle log 와 promotion board 는 이 snapshot 이 안정된 뒤 별도 slice 로 구체화한다.

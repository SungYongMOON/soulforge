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
| `knowledge_lane` | knowledge/NotebookLM/ontology lane 의 metadata-only owner-gated 상태 |
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
- `knowledge_lane` 은 알려진 helper/doc/workflow/fixture path 의 존재 여부와 known private/local evidence surface count 만 담는다.
- NotebookLM auth/session 값, query/answer/source payload, private report prose, private evidence filename, ontology candidate statement, owner decision, graph mutation payload, registry promotion claim 은 포함하지 않는다.

## freshness

- snapshot 은 `source_observations.fingerprint` 를 포함한다.
- fingerprint 는 원본 내용을 복제하지 않고, source 별 metadata signal 만 해시한다.
- fresh 판정은 저장된 snapshot 의 fingerprint 와 현재 local observation fingerprint 가 같은지, 그리고 저장된 `knowledge_lane` owner-gated state/blockers/evidence support 가 현재 파생 support 와 같은지로 결정한다.
- 저장된 snapshot 에 현재 `operation_board` projection schema 가 없으면 재생성 대상이다.
- freshness check 는 저장된 snapshot 과 현재 snapshot 의 `knowledge_lane` state/blockers/evidence/claim ceiling 도 검증한다. 저장본이 `observed` 보다 강한 claim ceiling 이거나 현재 blocker/evidence support 와 맞지 않으면 stale 로 실패한다.
- mismatch 가 있으면 UI 나 외부 host 는 snapshot 을 현재 상태로 표시하지 않아야 한다.
- freshness check 는 아래 source 를 v0 관측 대상으로 둔다.
  - public repo git metadata
  - `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`
  - `.mission/index.yaml`
  - `_workspaces` shallow project directory surface
  - `_workmeta` project metadata surface
  - `guild_hall/state/gateway` state surface
  - knowledge lane helper/workflow/fixture/evidence metadata surface
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

## knowledge lane summary

`knowledge_lane` 은 knowledge access, NotebookLM bridge, sourcebound workflow, ontology review lane 을 작전판에 보여주기 위한 metadata-only 상태다.
이 surface 는 owner/review gate 의 입력 상태를 보여줄 뿐, knowledge validation, ontology acceptance, graph update, owner decision, registry promotion 을 주장하지 않는다.

- `schema_version`: `soulforge.knowledge_lane_status.v0`
- `owner_gated.state`: `blocked_missing_surface`, `awaiting_metadata_evidence`, `owner_review_required` 중 하나
- `helper`: `guild_hall/knowledge_access` helper, CLI, ledger, NotebookLM bridge, test presence
- `workflows`: knowledge access event capture / sourcebound knowledge packet workflow presence and template counts
- `fixtures`: public synthetic NotebookLM bridge fixture presence and file count
- `ontology`: public ontology review/model doc presence and sourcebound ontology template presence
- `public_surface_count`: public helper/doc/workflow/fixture/ontology metadata surface count. This is not evidence.
- `evidence.present`
- `evidence.total_surface_count`: private/local metadata evidence surface count only
- `evidence.private_surface_count`
- `evidence.counts.project_knowledge_access_surface_count`
- `evidence.counts.project_procedure_capture_surface_count`
- `evidence.counts.project_ontology_surface_count`
- `evidence.counts.system_knowledge_access_entry_count`
- `evidence.counts.system_procedure_capture_entry_count`
- `evidence.counts.local_activity_surface_present`
- `evidence.counts.private_activity_mirror_present`
- `claim_ceiling`: always `observed` in snapshot v0. `source_supported`, `validated_private`, `canon_candidate`, `canon_entry`, and other stronger states are invalid here.
- `blockers[*]`: sanitized blocker id/severity/summary only
- `next_owner_review_action`: next safe owner-review step

`owner_gated.state` 는 `blocked_missing_surface`, `awaiting_metadata_evidence`, `owner_review_required` 만 허용한다.
Validation/freshness 는 blocker/evidence 조합보다 강한 state 를 거부한다.
예를 들어 public helper/docs/workflows 만 있고 private/local metadata evidence 가 없으면 state 는 `awaiting_metadata_evidence` 이고 `evidence.total_surface_count` 는 `0` 이다.

`knowledge_lane.evidence` 는 private/local directory presence 와 counts 만 사용하며 public helper/docs/workflows/fixtures 를 evidence 로 더하지 않는다.
Knowledge access entry counts exclude auth/session-shaped file names such as auth, session, token, cookie, credential, and secret files.
Private report prose, NotebookLM payloads, private filenames, ontology candidate statements, owner decisions, graph mutation payloads, and registry promotion claims stay outside the snapshot.

## operation board projection

`operation_board` 는 Operation Board 가 `projects`, `missions`, `gateway.pending_monsters`, `knowledge_lane`, `next_actions`, `diagnostics` 를 다시 분류하지 않고 읽을 수 있는 public-safe projection 이다.
새 원본을 읽지 않으며, snapshot 에 이미 들어온 sanitized field 만 재조립한다.

- `schema_version`: `soulforge.operation_board_projection.v0`
- `summary`: project, mission, pending monster, knowledge lane state/count, next action, diagnostics count
- `sections.dungeon_map.items[*]`: project code, workspace/workmeta/contract presence, mission count, pending monster count, `surface_status`
- `sections.mission_board.items[*]`: mission summary 와 `display_group` / `display_group_label` / `display_group_rank`
- `sections.monster_gate.groups[*]`: PR #8 이후 pending monster `display_group` 별 `total` 과 display sample `items`
- `sections.knowledge_lane`: owner-gated state, helper/workflow/fixture presence, evidence counts, claim ceiling, blockers, next owner review action
- `sections.action_queue.items[*]`: next action id/status/summary/rank

`operation_board.privacy.mode` 는 `public_safe_snapshot_projection` 이며, mail body/html/source quote/raw ref/attachment ref/provider id/secret 값과 NotebookLM payload, private report prose, ontology candidate statement, owner decision 은 포함하지 않는다.

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

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
| `next_actions` | 작전판이 바로 보여줄 다음 개발/운영 action 후보 |
| `diagnostics` | snapshot 생성 중 발견한 warning/error |

## privacy rules

- snapshot 은 owner root 의 원본 내용을 복제하지 않는다.
- `_workspaces/**` 실제 파일 내용은 읽지 않는다.
- `_workmeta/**` 는 project code, expected surface 존재 여부, count 만 읽는다.
- `private-state/**` 는 존재 여부와 continuity surface 여부만 읽는다.
- mailbox raw, attachment, token, credential, session, cookie 값은 읽지 않는다.
- `.mission/index.yaml` 은 public-safe tracked mission summary 이므로 읽을 수 있다.

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
- `mail_fetch_state_present`
- `mailbox_surfaces.company_present`
- `mailbox_surfaces.personal_present`

## 실행

```bash
npm run guild-hall:snapshot
npm run guild-hall:snapshot:json
npm run validate:snapshot
```

## 다음 연결

- UI 는 이 snapshot 을 읽어 `Dungeon Map` 과 `Mission Board` 를 먼저 만든다.
- OpenClaw 같은 외부 host 는 원본 private root 대신 이 snapshot 을 읽는 방향으로 연결한다.
- battle log 와 promotion board 는 이 snapshot 이 안정된 뒤 별도 slice 로 구체화한다.

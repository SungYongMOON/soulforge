# guild_hall/snapshot

## 목적

- `snapshot/` 은 Soulforge 전체 운영 상태를 UI 와 외부 host 가 읽기 쉬운 read-only JSON 으로 투영한다.
- 원본 owner root 를 대체하지 않고, `Guild Master 작전판` 이 읽을 sanitized metadata surface 만 만든다.

## 포함 대상

- `producer.mjs`
  - owner root, mission, project mount, gateway 상태, pending monster summary, knowledge lane metadata status, battle log aggregate 를 read-only 로 요약하고 source observation fingerprint 를 만든다.
- `cli.mjs`
  - snapshot 생성, JSON 출력, local state write, shape check, freshness check entrypoint
- `snapshot.test.mjs`
  - private 파일 내용이 snapshot 에 섞이지 않는지 확인하는 최소 test

## 출력

- 기본 출력 위치는 `guild_hall/state/snapshot/soulforge_snapshot.json` 이다.
- 이 경로는 local-only state 이며 public Git 으로 추적하지 않는다.
- `source_observations` 는 snapshot 이 본 원본 surface 의 metadata-only fingerprint 를 담는다.
- `knowledge_lane` 은 knowledge/NotebookLM/ontology lane 의 helper/workflow/fixture presence, private/local evidence count, owner-gated state, and `observed` claim ceiling 만 담는다.
- `battle_log` 는 `_workmeta/*/log/events/**/battle_events.jsonl` 의 event/result/bottleneck/mode/automation/project/intervention count 와 latest timestamp 만 담는다.

## 경계

- `_workspaces`, `_workmeta`, `private-state` 는 존재 여부와 project code 같은 metadata 만 읽는다.
- secret, token, credential, session, cookie 값은 읽지 않는다.
- 메일 원문, attachment, raw mailbox payload, 실제 프로젝트 파일 내용은 읽지 않는다.
- pending monster summary 는 `intake_inbox/*/monsters.json` 의 derived monster field 만 제한적으로 읽고 body/html/source quote/raw/attachment field 는 복제하지 않는다.
- mission summary 는 tracked `.mission/index.yaml` 에 있는 public-safe 필드만 읽는다.
- knowledge lane summary 는 known public helper/doc/workflow/fixture path 와 known private/local evidence surface count 만 읽는다.
- public helper/docs/workflows/fixtures 는 `knowledge_lane.evidence` count 에 더하지 않는다. private/local metadata evidence 가 없으면 state 는 `awaiting_metadata_evidence` 이고 evidence count 는 `0` 이다.
- knowledge access entry count 는 auth/session-shaped file names such as auth, session, token, cookie, credential, and secret files 를 제외한다.
- NotebookLM auth/session data, query/answer/source payloads, private report prose, private evidence filenames, ontology candidate statements, owner decisions, graph mutation payloads, registry promotion claims 는 복제하지 않는다.
- battle log event row 의 `event_id`, `mission_id`, `stage`, row-level `source_ref`, `party_id`, `unit_id`, `loop_id`, `next_action_note`, rendered latest/daily markdown prose 는 복제하지 않는다.
- `battle_log` 와 `battle_log.projects[*]` 는 허용된 aggregate key 외의 추가 field 를 validation 에서 거부한다.
- freshness check 는 저장된 snapshot 의 `source_observations.fingerprint` 와 현재 원본 metadata fingerprint 를 비교하고, 저장된 `knowledge_lane` 의 owner-gated state/blockers/evidence support 가 현재 파생 support 와 다르거나 `observed` 보다 강한 claim ceiling 을 담으면 실패한다.

## 실행

```bash
npm run guild-hall:snapshot
npm run guild-hall:snapshot:check-fresh
npm run guild-hall:snapshot:json
npm run validate:snapshot
```

## 관련 경로

- [`../state/README.md`](../state/README.md)
- [`../../docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md`](../../docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md)

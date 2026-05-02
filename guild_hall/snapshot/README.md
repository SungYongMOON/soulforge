# guild_hall/snapshot

## 목적

- `snapshot/` 은 Soulforge 전체 운영 상태를 UI 와 외부 host 가 읽기 쉬운 read-only JSON 으로 투영한다.
- 원본 owner root 를 대체하지 않고, `Guild Master 작전판` 이 읽을 sanitized metadata surface 만 만든다.

## 포함 대상

- `producer.mjs`
  - owner root, mission, project mount, gateway 상태를 read-only 로 요약한다.
- `cli.mjs`
  - snapshot 생성, JSON 출력, local state write, shape check entrypoint
- `snapshot.test.mjs`
  - private 파일 내용이 snapshot 에 섞이지 않는지 확인하는 최소 test

## 출력

- 기본 출력 위치는 `guild_hall/state/snapshot/soulforge_snapshot.json` 이다.
- 이 경로는 local-only state 이며 public Git 으로 추적하지 않는다.

## 경계

- `_workspaces`, `_workmeta`, `private-state` 는 존재 여부와 project code 같은 metadata 만 읽는다.
- secret, token, credential, session, cookie 값은 읽지 않는다.
- 메일 원문, attachment, raw mailbox payload, 실제 프로젝트 파일 내용은 읽지 않는다.
- mission summary 는 tracked `.mission/index.yaml` 에 있는 public-safe 필드만 읽는다.

## 실행

```bash
npm run guild-hall:snapshot
npm run guild-hall:snapshot:json
npm run validate:snapshot
```

## 관련 경로

- [`../state/README.md`](../state/README.md)
- [`../../docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md`](../../docs/architecture/guild_hall/SOULFORGE_SNAPSHOT_V0.md)

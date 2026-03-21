# guild_hall/state

## 목적

- `guild_hall/state/` 는 `guild_hall/` 공용 운영 owner 들의 local-only 현재 상태를 둔다.
- tracked source 와 public-safe example 은 이 경로에 두지 않는다.

## 포함 대상

- `gateway/`
  - mailbox, intake_inbox, local bindings, monster event log, local outbound mail env, outbound snapshot, send log
- `doctor/`
  - bootstrap doctor local status
- `town_crier/`
  - queue, Telegram env, send log, runner state
- `night_watch/`
  - nightly review state 가 생기면 이 아래에서 materialize
- `dungeon_assignment/`
  - assignment state 가 생기면 이 아래에서 materialize

## 규칙

- 이 경로 아래 실자료는 Git 으로 추적하지 않는다.
- public repo 로는 추적하지 않는다.
- 다른 PC 에서 필요하면 선택된 파생 기록만 별도 private state repo 또는 별도 복사로 옮긴다.
- public-safe mirror sample 은 `docs/architecture/workspace/examples/guild_hall/state/` 아래에 둔다.

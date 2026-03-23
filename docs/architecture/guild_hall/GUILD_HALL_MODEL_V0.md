# GUILD_HALL_MODEL_V0

## 목적

- 이 문서는 `guild_hall/` root 의 owner 경계와 local state 위치를 고정한다.
- `guild_hall` 은 cross-project 운영만 맡고, 실제 프로젝트 현장은 계속 `_workspaces/<project_code>/` 가 맡는다는 기준을 잠근다.

## 한 줄 정의

- `guild_hall` 은 `gateway`, `town_crier`, `night_watch`, `dungeon_assignment` 를 묶는 cross-project operations root 다.

## owner 경계

- `guild_hall/gateway/`
  - mail fetch 와 intake staging source owner
- `guild_hall/town_crier/`
  - notify queue / Telegram transport source owner
- `guild_hall/night_watch/`
  - nightly review / morning briefing cross-project 운영 자리
- `guild_hall/dungeon_assignment/`
  - gateway intake monster 를 project/stage 로 라우팅하는 cross-project 운영 자리
- `_workspaces/<project_code>/`
  - project-side monster record, runs, battle log, morning report 같은 실제 현장 owner

## local state

- `guild_hall/state/gateway/**`
  - mailbox, intake_inbox, notify policy, monster event log
- `guild_hall/state/town_crier/**`
  - queue, state, telegram env, send log
- `guild_hall/state/night_watch/**`
  - night watch local state placeholder
- `guild_hall/state/dungeon_assignment/**`
  - assignment local state placeholder

## v0 규칙

1. `guild_hall/state/**` 는 local-only state 이며 public repo 에 올리지 않는다.
2. `gateway` 자동 알림은 v0 에서 `monster_created` 하나만 남긴다.
3. `town_crier` 는 어떤 알림을 보낼지 결정하지 않고, queue 에 들어온 notify request 를 Telegram 으로 보내기만 한다.
4. project-side monster 상태는 `guild_hall` 이 아니라 `_workmeta/<project_code>/monsters/` 가 소유한다.

## 관련 경로

- [`../../README.md`](../../README.md)
- [`../../../guild_hall/README.md`](../../../guild_hall/README.md)
- [`../workspace/GATEWAY_MAIL_FETCH_V0.md`](../workspace/GATEWAY_MAIL_FETCH_V0.md)
- [`../workspace/GATEWAY_NOTIFY_V0.md`](../workspace/GATEWAY_NOTIFY_V0.md)
- [`../workspace/NOTIFY_MODEL_V0.md`](../workspace/NOTIFY_MODEL_V0.md)

## ASSUMPTIONS

- v0 에서는 `night_watch` 와 `dungeon_assignment` 의 tracked source 자리만 먼저 만들고, 실제 state 기능은 이후 단계에서 채운다고 본다.


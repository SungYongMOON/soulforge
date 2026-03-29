# guild_hall/gateway

## 목적

- `gateway/` 는 cross-project ingress owner 다.
- mail fetch 와 mail intake 를 통해 몬스터를 materialize 하고, project assignment 전 staging 을 맡는다.
- future outbound mail slot 은 `mail_send/` 아래에서 placeholder 로 관리한다.

## 포함 대상

- `cli.mjs`
  - intake / update / notify canonical entrypoint
- `message_rendering.mjs`
  - gateway notification text, monster label, 문장 정규화 helper
- `monster_index.mjs`
  - intake inbox dedupe manifest cache helper

## state

- local state 는 `guild_hall/state/gateway/**` 아래에만 둔다.
- mailbox, intake inbox, gateway local bindings, monster event log, local outbound mail env, outbound snapshot, send log 는 이 경로 아래에서 자란다.
- `guild_hall/state/gateway/intake_inbox/_index/monster_index.json` 은 `dedupe_key` lookup 가속을 위한 local manifest cache 이고, `monsters.json` current state 에서 다시 만들 수 있다.

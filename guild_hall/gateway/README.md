# guild_hall/gateway

## 목적

- `gateway/` 는 cross-project ingress owner 다.
- mail fetch 와 mail intake 를 통해 몬스터를 materialize 하고, project assignment 전 staging 을 맡는다.

## state

- local state 는 `guild_hall/state/gateway/**` 아래에만 둔다.
- mailbox, intake inbox, gateway local bindings, monster event log 는 이 경로 아래에서 자란다.

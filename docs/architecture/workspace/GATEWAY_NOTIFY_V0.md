# GATEWAY_NOTIFY_V0

## 목적

- 이 문서는 Soulforge clone 만으로 최소 Telegram outbound notify 를 다시 세팅할 수 있게 `gateway` 와 `town_crier` 의 경계를 잠근다.
- full Telegram channel gateway 를 옮기는 대신, `town_crier` queue 와 Telegram send adapter 만 Soulforge tracked source 로 둔다.
- gateway event on/off 는 local `guild_hall/state/gateway/bindings/notify_policy.yaml` 이 소유하고, 실제 전송은 `town_crier` 가 맡는다.

## tracked source 위치

- `guild_hall/town_crier/telegram_send.py`
- `guild_hall/town_crier/telegram_notify.env.example`
- `guild_hall/town_crier/runtime.mjs`
- `guild_hall/town_crier/cli.mjs`

## local runtime 위치

- default env file: `guild_hall/state/town_crier/telegram_notify.env`
- default policy file: `guild_hall/state/gateway/bindings/notify_policy.yaml`
- notify queue/state/log 는 `guild_hall/state/town_crier/**` 아래에서 local-only 로 materialize 한다.

## 실행 명령

```bash
npm run guild-hall:town-crier:send -- --text "gateway ready"
npm run guild-hall:notify:gateway -- --event monster_created --on
npm run guild-hall:notify:emit -- --scope gateway --event monster_created --text "monster ready"
```

## 경계

- tracked source 는 `town_crier` queue/transport 와 gateway notify resolver 만 포함한다.
- gateway local policy 는 tracked example 이 아니라 local-only `guild_hall/state/gateway/**` 아래에 둔다.
- full Telegram conversational gateway, session state, channel runtime 은 현재 Soulforge 범위에 포함하지 않는다.
- 실제 bot token/chat id 는 local env 만 사용한다.
- gateway 자동 Telegram 알림은 v0 에서 `monster_created` 하나만 남긴다.
- brief 표시 규칙은 [`NOTIFY_BRIEF_FORMAT_V0.md`](../../../docs/architecture/workspace/NOTIFY_BRIEF_FORMAT_V0.md) 에서 따로 잠근다.

## 관련 경로

- [`MULTI_PC_DEVELOPMENT_V0.md`](../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`NOTIFY_MODEL_V0.md`](../../../docs/architecture/workspace/NOTIFY_MODEL_V0.md)
- [`NOTIFY_BRIEF_FORMAT_V0.md`](../../../docs/architecture/workspace/NOTIFY_BRIEF_FORMAT_V0.md)
- [`guild_hall/town_crier/README.md`](../../../guild_hall/town_crier/README.md)

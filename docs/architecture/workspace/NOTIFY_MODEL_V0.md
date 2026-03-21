# NOTIFY_MODEL_V0

## 목적

- 이 문서는 Soulforge v0 알림의 owner 경계와 공용 notify request shape 를 잠근다.
- `gateway`, `mission`, 이후 `workflow`, `nightly_sweep` 같은 다른 owner 가 같은 Telegram outbound adapter 를 재사용할 수 있게 최소 기준을 고정한다.

## 한 줄 정의

- 알림은 owner 가 "보낼지 말지"를 결정하고, `town_crier` transport 는 queue 를 읽어 "어디로 보낼지"만 해결한다.

## owner 경계

- `gateway`
  - local-only notify policy owner
  - `guild_hall/state/gateway/bindings/notify_policy.yaml`
- `mission`
  - tracked notify toggle owner
  - `.mission/<mission_id>/mission.yaml`
- `town_crier`
  - Telegram outbound transport owner
  - local env, queue, send adapter 만 맡는다

## gateway notify policy

### 위치

- `guild_hall/state/gateway/bindings/notify_policy.yaml`

### 최소 shape

```yaml
kind: gateway_notify_policy
scope: gateway
channels:
  telegram:
    enabled: true
    env_file: guild_hall/state/town_crier/telegram_notify.env
events:
  monster_created:
    telegram: false
updated_at: null
```

### v0 gateway event set

- `monster_created`

## mission notify toggle

### 위치

- `.mission/<mission_id>/mission.yaml`

### 최소 shape

```yaml
notifications:
  telegram:
    mission_blocked: false
    mission_ready: false
    mission_closed: false
    mission_failed: false
```

### v0 mission event set

- `mission_blocked`
- `mission_ready`
- `mission_closed`
- `mission_failed`

## 공용 notify request shape

```yaml
request_id: string
owner_scope: gateway | mission
channel: telegram
event: string
text: string
created_at: string
source_ref: optional
mission_id: optional
mission_file: optional
```

## v0 규칙

1. `gateway` 알림 설정은 tracked tree 가 아니라 local `guild_hall/state/gateway/**` owner 에 둔다.
2. `mission` 알림 설정은 held mission plan owner 인 `mission.yaml` 안에 둔다.
3. Telegram bot token / chat id 는 항상 local env 에만 둔다.
4. `gateway` 와 `mission` 은 직접 Telegram 을 호출하지 않고 notify request 를 `town_crier` queue 에 적재한다.
5. `gateway` 는 v0 에서 `monster_created` event 하나만 자동 적재한다.
6. `mission` 은 v0 에서 `emit` 명령 또는 future hook 기반으로 시작하고, file watcher 는 쓰지 않는다.
7. 같은 Telegram destination 을 PC 단위로 재사용하고, mission 별 별도 chat id 는 v0 범위에 넣지 않는다.

## 연결 문서

- [`GATEWAY_NOTIFY_V0.md`](../../../docs/architecture/workspace/GATEWAY_NOTIFY_V0.md)
- [`NOTIFY_BRIEF_FORMAT_V0.md`](../../../docs/architecture/workspace/NOTIFY_BRIEF_FORMAT_V0.md)
- [`MISSION_MODEL.md`](../../../docs/architecture/workspace/MISSION_MODEL.md)
- [`INSTALLATION_MANUAL_V0.md`](../../../docs/architecture/workspace/INSTALLATION_MANUAL_V0.md)
- [`examples/guild_hall/state/gateway/README.md`](../../../docs/architecture/workspace/examples/guild_hall/state/gateway/README.md)

## ASSUMPTIONS

- v0 Telegram destination 은 PC 별 하나면 충분하다고 본다.
- future `workflow` / `nightly_sweep` 는 같은 transport 와 비슷한 toggle model 을 재사용할 수 있다고 본다.

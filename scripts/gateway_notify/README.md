# gateway_notify

이 폴더는 얇은 launcher 묶음이다.
canonical source 는 `guild_hall/town_crier/` 아래에 있고, 이 경로는 top-level 진입점만 제공하는 wrapper 로 남긴다.

## 포함 범위

- `telegram_send.py`
- `runtime.mjs`
  - canonical `guild_hall/town_crier/*` 로 위임하는 wrapper

## 기본 실행

```bash
python3 scripts/gateway_notify/telegram_send.py --text "gateway ready"
npm run notify:gateway -- --event monster_created --on
```

## 주의

- 실제 token/chat id 는 local env file 에만 둔다.
- full Telegram channel runtime/state 는 이 캡슐 범위가 아니다.
- canonical local runtime 은 `guild_hall/state/town_crier/` 아래에 둔다.

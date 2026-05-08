# guild_hall/activity

## 목적

- `activity/` 는 Soulforge 전체 recent-context 장부를 쓰고 재생성하는 구현 surface 다.
- active write target 은 local-only `guild_hall/state/operations/soulforge_activity/**` 이며 public Git 에 올리지 않는다.

## 명령

```bash
npm run guild-hall:activity:log -- --scope healer --action manual_note --summary "short public-safe summary"
npm run guild-hall:activity:refresh -- --json
```

## 경계

- `summary`, `next_action`, `refs` 같은 public-safe metadata 만 기록한다.
- raw mail body, HTML body, secret, token, cookie, session, attachment binary 는 기록하지 않는다.
- project 상세 근거는 각 owner surface 에 두고, activity event 는 이어받기용 요약만 남긴다.

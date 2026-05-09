# guild_hall/activity

## 목적

- `activity/` 는 Soulforge 전체 recent-context 장부를 쓰고 재생성하는 구현 surface 다.
- active write target 은 local-only `guild_hall/state/operations/soulforge_activity/**` 이며 public Git 에 올리지 않는다.

## 명령

```bash
npm run guild-hall:activity:log -- --scope healer --action manual_note --summary "short public-safe summary"
npm run guild-hall:activity:refresh -- --json
npm run guild-hall:activity:sync -- --json
```

`sync` 는 24시간 PC 가 `private-state` 의 activity mirror 를 pull 한 뒤 local/private activity event ledger 를 `entry_id` 기준으로 병합하고, 양쪽 `latest_context.json` 을 재생성한 다음 변경이 있으면 `private-state` 에 commit/push 한다.
대상 `private-state` 는 Soulforge root 바로 아래 nested repo 이고 현재 branch 가 `main` 일 때만 실행한다.

## 경계

- `summary`, `next_action`, `refs` 같은 public-safe metadata 만 기록한다.
- raw mail body, HTML body, secret, token, cookie, session, attachment binary 는 기록하지 않는다.
- project 상세 근거는 각 owner surface 에 두고, activity event 는 이어받기용 요약만 남긴다.
- `sync` 는 mailbox raw, attachment payload, secret file, `_workspaces`, `_workmeta` 를 읽지 않는다.
- `sync` 는 activity JSONL row 를 읽더라도 allowlist 된 event 필드만 mirror 한다. legacy row 의 unknown field 는 복사하지 않고, malformed JSONL row 는 원본 ledger 안에 그대로 보존하되 다른 surface 로 복제하지 않는다.
- `sync` 는 `log/**` markdown/report file 을 mirror 하지 않는다. 상세 report 취합은 별도 sanitizer/allowlist 가 생길 때까지 v0 범위 밖이다.

# guild_hall/healer

## 목적

- `healer/` 는 24시간 PC 가 스스로 repo 상태와 기본 검증을 점검하고 결과를 activity surface 에 남기는 구현 surface 다.
- 기본 출력은 local-only `guild_hall/state/operations/soulforge_activity/**` 에 저장한다.

## 명령

```bash
npm run guild-hall:healer:run -- --json
```

자주 돌리는 가벼운 점검에서는 아래처럼 일부 검증을 건너뛸 수 있다.

```bash
npm run guild-hall:healer:run -- --skip-validate --json
```

실패 시 `town_crier` queue 로 Telegram brief 요청을 남기려면 아래처럼 실행한다.

```bash
npm run guild-hall:healer:run -- --skip-validate --notify-on-failure --json
```

## 운영 권장

- 24시간 PC 에서는 자주 도는 감시를 Codex heartbeat 가 아니라 launchd + healer script 로 둔다.
- light run 은 30분 또는 60분 주기로 `--skip-validate` 를 붙여 gateway 상태와 activity 기록만 빠르게 확인한다.
- full run 은 하루 1회 `npm run validate` 까지 포함해 저장소 기본 무결성을 확인한다.
- 실패 Telegram 알림은 report path 와 짧은 실패 요약만 보내고, mail body/html/attachment/secret 값은 포함하지 않는다.
- rollout 기준은 [`../../docs/architecture/bootstrap/ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md`](../../docs/architecture/bootstrap/ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md) 를 따른다.
- 전략 방향과 owner-intent gap 점검은 healer 가 아니라 [`../../docs/architecture/guild_hall/ALWAYS_ON_STRATEGIC_REVIEW_V0.md`](../../docs/architecture/guild_hall/ALWAYS_ON_STRATEGIC_REVIEW_V0.md) 의 `night_watch` / `ouroboros_strategic_review_harness_v0` 층에서 다룬다.

## 기본 점검

- `git status --short --branch`
- `npm run validate`
- `npm run guild-hall:gateway:fetch:healthcheck -- --json`
  - JSON `status` 가 `WARN` 또는 `CRITICAL` 이면 command exit code 가 0 이어도 healer 점검은 실패로 기록한다.
- `--notify-on-failure`
  - healer 실패 시 `town_crier` queue 에 짧은 실패 요약과 report ref 만 적재한다.

## 경계

- healer 는 자동 커밋, 자동 푸시, merge, reset, stash 를 하지 않는다.
- 실패한 점검은 `carry_forward: true` 로 activity log 에 남기고, 다음 사람이 고칠 수 있게 report path 만 연결한다.
- raw mail body, secret, token, attachment binary 는 report 나 event 에 기록하지 않는다.

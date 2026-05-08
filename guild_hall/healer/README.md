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

## 기본 점검

- `git status --short --branch`
- `npm run validate`
- `npm run guild-hall:gateway:fetch:healthcheck -- --json`
  - JSON `status` 가 `WARN` 또는 `CRITICAL` 이면 command exit code 가 0 이어도 healer 점검은 실패로 기록한다.

## 경계

- healer 는 자동 커밋, 자동 푸시, merge, reset, stash 를 하지 않는다.
- 실패한 점검은 `carry_forward: true` 로 activity log 에 남기고, 다음 사람이 고칠 수 있게 report path 만 연결한다.
- raw mail body, secret, token, attachment binary 는 report 나 event 에 기록하지 않는다.

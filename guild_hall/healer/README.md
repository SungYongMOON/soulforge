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

개발 PC 처럼 launchd 설치나 private-state mirror 가 아직 준비되지 않은 환경에서는 7개 운영 점검만 잠시 건너뛸 수 있다.

```bash
npm run guild-hall:healer:run -- --skip-always-on-checks --json
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
- `npm run guild-hall:snapshot`
  - gateway healthcheck 뒤에 local snapshot 을 갱신해서 자주 바뀌는 gateway metadata 때문에 freshness 알림이 반복되지 않게 한다.
- 7개 24시간 PC 점검:
  - 최신 지도 점검: local snapshot 과 `latest_context.json` 이 낡지 않았는지 본다.
  - 자동작업 생존 점검: launchd plist 와 `launchctl` 로 always-on job 이 설치/로드됐는지 본다.
  - 쓰레기 파일 위치 점검: 루트 근처의 임시 TODO, patch, scratch 파일 후보를 파일명 기준으로 찾는다.
  - 보고서 신선도 점검: activity report 와 `latest_context.json` 이 최근 것인지 본다.
  - 저장소 동기화 점검: public repo, `_workmeta`, `private-state` 의 branch/dirty/upstream 상태를 읽기 전용으로 본다.
  - 비밀/원문 유출 점검: 이번 변경 파일명에 secret/raw/mail/runtime 후보가 있는지 본다. 파일 내용은 읽지 않는다.
  - 복구 가능성 점검: active activity context, `_workmeta`, `private-state`, `NIGHT_WORK_HANDOFF` 같은 이어받기 표면이 있는지 본다.
- `--notify-on-failure`
  - healer 실패 시 `town_crier` queue 에 짧은 실패 요약과 report ref 만 적재한다.

## 경계

- healer 는 자동 커밋, 자동 푸시, merge, reset, stash 를 하지 않는다.
- 실패한 점검과 경고 점검은 `carry_forward: true` 로 activity log 에 남기고, 다음 사람이 고칠 수 있게 report path 만 연결한다.
- 메일 후보를 실제 monster/mission 으로 해결하는 루프는 이 healer 점검의 해결 범위가 아니며 later addition 으로 둔다.
- raw mail body, secret, token, attachment binary 는 report 나 event 에 기록하지 않는다.

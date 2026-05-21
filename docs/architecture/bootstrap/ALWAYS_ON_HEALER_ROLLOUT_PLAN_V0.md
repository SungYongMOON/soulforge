# Always-On Healer Rollout Plan v0

## 목적

- 이 문서는 24시간 운영 PC 의 healer/doctor/nightly 계열 자동화를 어떻게 늘릴지에 대한 public-safe rollout 기준이다.
- 목표는 메일 수집과 Telegram 전송은 계속 lightweight script 로 운영하고, LLM 은 필요한 보고나 triage 때만 쓰게 만드는 것이다.
- MacBook Air 같은 portable dev PC 가 pull 후 다음 구현/배포 경계를 바로 알 수 있게 한다.

## 현재 운영 상태 기준

2026-05-11 기준 현재 확인된 운영 구분은 아래와 같다.

| 항목 | 권장/현재 주기 | LLM 사용 | 역할 |
| --- | --- | --- | --- |
| `ai.soulforge.gateway.mail-fetch` | 5분 | no | `mail_fetch/cli.py --once` 로 메일 수집 |
| `ai.soulforge.gateway.mail-healthcheck` | 5분 | no | mail fetch stale/fail/partial 상태 판정 |
| `ai.soulforge.town-crier` | 1분 | no | `town_crier` queue 를 Telegram 으로 전송 |
| Codex `Soulforge 운영 감시` heartbeat | 4시간 | yes | clean `main` fast-forward pull, 운영 상태 확인, activity sync 결과를 Codex thread 에 짧게 보고 |
| Codex `always-on activity sync` | 09:00, 18:00 | yes | low-reasoning dedicated fallback 으로 local activity ledger / `private-state` mirror 동기화 |

운영 원칙:

- mail fetch, mail healthcheck, town_crier 는 LLM 을 호출하지 않는다.
- Codex heartbeat 는 비용이 있으므로 짧은 주기 감시에 쓰지 않는다. 2026-05-15 기준 기본 운영 주기는 60분에서 4시간으로 낮췄다.
- Codex heartbeat 는 운영 점검 전에 public repo 가 clean `main` 이면 `git pull --ff-only origin main` 을 먼저 시도한다. GitHub/DNS/network 실패처럼 일시 장애일 수 있는 실패는 최대 3회까지 재시도하되, 60초 후 1회와 180초 후 1회만 추가 시도한다. 모두 실패하면 local-only 복구 대상이 아니므로 stale/blocker 로 보고하고, private/mail runtime 원문은 읽지 않는다.
- 24시간 PC 가 `owner-with-state` 조건을 갖추면 `_workmeta/main` 도 주기적으로 pull 해서 shared metadata plane 최신 상태를 유지하고, 이 PC 에서 생긴 metadata 변경은 clean/main 조건에서 commit/push 할 수 있다.
- 자주 도는 감시는 launchd + deterministic script 로 처리한다.
- LLM 은 하루 1회 morning report, 장애 triage, owner 가 요청한 해석 작업에만 가깝게 둔다.

## 추천 target state

### 1. Healer light

- 목적: 운영 node 가 살아 있고 gateway 상태가 정상인지 가볍게 확인한다.
- 권장 주기: 30분 또는 60분.
- 권장 명령:

```bash
npm run guild-hall:healer:run -- --skip-validate --json
```

- 포함 점검:
  - `git status --short --branch`
  - `gateway:fetch:healthcheck`
  - 최신 지도/snapshot freshness
  - launchd always-on job 생존 상태
  - 임시 TODO/scratch/patch 파일 위치 후보
  - activity report / `latest_context.json` 신선도
  - public repo, `_workmeta`, `private-state` 동기화 상태
  - 변경 파일명 기준 secret/raw/mail/runtime 유출 후보
  - active/private 이어받기 표면과 `NIGHT_WORK_HANDOFF` 존재 여부
  - healer report/activity event 기록
- 제외 점검:
  - root validation
  - UI build/lint
  - dependency audit
- 실패 처리:
  - activity log 에 `carry_forward: true` 로 남긴다.
  - Telegram 알림은 실패 요약과 report path 만 보낸다.
  - raw mail body, HTML body, attachment, secret 값은 읽거나 전송하지 않는다.

### 2. Healer full

- 목적: 하루 1회 저장소 기본 무결성을 확인한다.
- 권장 주기: 매일 새벽 1회.
- 권장 명령:

```bash
npm run guild-hall:healer:run -- --json
```

- 현재 포함 점검:
  - `git status --short --branch`
  - `npm run validate`
  - `gateway:fetch:healthcheck`
  - Healer light 의 7개 24시간 PC 점검
- 향후 단계적으로 추가할 후보:
  - `npm run validate:gateway`
  - `npm run ui:done:check`
- 추가 기준:
  - nightly 실행 시간이 안정적일 것
  - false positive 가 낮을 것
  - 실패 원인이 owner action 으로 이어질 수 있을 것

### 3. Doctor drift check

- 목적: 이 PC 가 여전히 expected bootstrap profile 과 remote/private-state 상태를 유지하는지 확인한다.
- 권장 주기: 부팅 시 또는 하루 1회.
- 권장 명령:

```bash
npm run guild-hall:doctor -- --profile owner-with-state --remote --json
```

- `--live` 는 실제 외부 연결 확인이 필요할 때만 수동 또는 별도 낮은 빈도로 실행한다.
- doctor 는 live mail body 나 Telegram message 를 보내지 않는다.

### 4. Dependency risk check

- 목적: dependency/runtime breakage 신호를 조기에 분류한다.
- 권장 주기: 주 1회 advisory.
- v0 에서 하지 않는 것:
  - 매일 `npm audit` 강제 실행
  - 매일 대규모 install/update
  - 자동 dependency upgrade
- v0 에서 할 수 있는 것:
  - lockfile 존재와 workspace 기본 무결성 확인
  - `validate`, `ui:build`, `ui:done:check` 실패가 dependency breakage 로 보이는지 분류
  - 보안 audit 은 weekly report 의 optional signal 로만 기록

### 5. Morning report

- 목적: owner 가 아침에 볼 decision summary 를 만든다.
- 권장 주기: 하루 1회.
- LLM 사용 가능 위치:
  - healer/doctor/night_watch 의 sanitized report
  - activity `latest_context.json`
  - public-safe mission/snapshot summary
- LLM 금지 입력:
  - secret/token/password/cookie/credential 값
  - raw mail body, HTML body, attachment 원문
  - `_workspaces` 실자료
  - `_workmeta` raw truth 중 공개 가능성이 확인되지 않은 내용

## 구현 순서

### Phase 0. 문서 동기화

- 이 문서를 public repo 에 commit/push 한다.
- MacBook Air 는 pull 후 이 문서를 기준으로 구현 branch 를 만든다.

### Phase 1. repo 구현

MacBook Air 또는 portable dev PC 에서 수행한다.

1. `guild_hall/healer` 에 light/full 운영 의도를 더 명확히 노출한다.
2. healer 실패 시 `town_crier` queue 로 Telegram 알림 request 를 넣는 옵션을 추가한다.
3. public-safe LaunchAgent template 또는 generator 를 추가한다.
4. template 은 실제 token/chat id 값을 포함하지 않는다.
5. `npm run validate:activity` 와 관련 healer test 를 통과시킨다.
6. 범위가 gateway/town_crier 까지 닿으면 `npm run validate:gateway` 도 실행한다.
7. public repo 에 commit/push 한다.

### Phase 2. 24시간 PC 배포

always-on node 에서 수행한다.

1. public repo 를 clean `main` 으로 맞춘다.
2. `git pull --ff-only origin main` 으로 최신 구현을 받는다.
3. `npm run guild-hall:doctor -- --profile owner-with-state --remote --json` 를 실행한다.
4. `npm run guild-hall:healer:run -- --skip-validate --json` 를 수동 smoke 로 1회 실행한다.
5. `npm run guild-hall:healer:run -- --json` 를 수동 smoke 로 1회 실행한다.
6. LaunchAgent 를 설치한다.
7. `launchctl list | rg 'ai\\.soulforge'` 로 등록 상태를 확인한다.
8. 실패 알림 smoke 는 secret 값을 출력하지 않는 방식으로만 확인한다.

권장 명령:

```bash
npm run guild-hall:always-on:install -- --local-root <actual Soulforge root> --json
npm run guild-hall:always-on:verify -- --local-root <actual Soulforge root> --check-launchctl --json
```

이번 7개 점검 반영 절차:

1. 운영 clone 이 `main` 이고 public worktree 가 clean 인지 확인한다.
2. public repo 를 `git pull --ff-only origin main` 으로 최신화한다.
3. `_workmeta` 가 연결된 owner-with-state PC 라면 `_workmeta` 도 `git pull --ff-only origin main` 으로 최신화한다.
4. local snapshot 을 `npm run guild-hall:snapshot` 으로 갱신한다.
5. LaunchAgent 를 아래 명령으로 설치하거나 갱신한다.

```bash
npm run guild-hall:always-on:install -- --local-root "$(pwd)" --json
```

6. 설치 상태를 아래 명령으로 확인한다.

```bash
npm run guild-hall:always-on:verify -- --local-root "$(pwd)" --check-launchctl --json
```

7. healer light 를 먼저 실행한다.

```bash
npm run guild-hall:healer:run -- --skip-validate --notify-on-failure --json
```

8. healer full 을 한 번 실행한다.

```bash
npm run guild-hall:healer:run -- --notify-on-failure --json
```

9. 첫 실행에서 경고가 남으면 `latest_context.json` 또는 healer report 의
   `Next Action` 을 기준으로 처리한다. 메일 후보를 monster/mission 으로
   실제 해결하는 루프는 이 반영 절차의 성공 기준이 아니라 later addition
   으로 둔다.

### Phase 3. LLM 감시 축소

- healer light/full 이 안정되면 Codex `Soulforge 운영 감시` heartbeat 를 daily report 계층으로 더 낮추거나 pause 한다.
- morning report 만 LLM 이 읽는 구조로 이동한다.
- 장애 발생 시에는 deterministic alert 가 먼저 Telegram 으로 알리고, LLM triage 는 owner 가 요청하거나 daily report 에서만 실행한다.

## mail candidate handoff 정책

- 다른 PC 로 넘기는 것은 메일 원문이 아니라 `mail_candidate` 의 body-safe activity summary 다.
- `guild-hall:activity:sync` 는 sync 전에 pending candidate 를 `mail_candidate_summary` activity event 로 투영한다.
- 시간당 heartbeat 의 activity sync 또는 09:00/18:00 dedicated activity sync 가 성공하면 다른 PC 는 private-state pull 로 새 후보 존재를 알 수 있다.
- activity sync 실행 자체가 GitHub/DNS/network 계열 문제로 실패하면 같은 재시도 정책을 적용한다. 재시도 후에도 실패하면 다음 정기 실행까지 기다리고, owner 에게는 `stale_sync_blocked` 와 마지막 안전 상태만 보고한다.
- 실제 메일 원문, HTML body, attachment, mailbox cursor 는 24시간 PC 의 local `guild_hall/state/gateway/**` 에 남긴다.
- 후보를 실제 monster/intake request 로 승격하는 작업은 원문과 local runtime 을 가진 24시간 PC 에서 수행하는 것을 기본값으로 본다.
- 메일 후보를 monster/mission 으로 실제 해결하는 자동 루프는 본 healer 7개 점검의 성공 기준에 포함하지 않고, later addition 으로 따로 구현한다.

## MacBook Air 와 24시간 PC 역할 분리

| 작업 | 권장 위치 | 이유 |
| --- | --- | --- |
| 코드/문서 수정 | MacBook Air | 운영 node 를 건드리지 않고 branch/test/commit 가능 |
| test/validate | MacBook Air | 실패와 반복 실행이 운영 mail/town_crier 에 영향 없음 |
| public repo commit/push | MacBook Air | primary dev 흐름에 맞춤 |
| LaunchAgent 실제 설치 | 24시간 PC | `~/Library/LaunchAgents` 는 machine-local 설정 |
| env/secret 연결 | 24시간 PC | token/chat id 는 local secret 이며 public repo 에 기록하지 않음 |
| live smoke | 24시간 PC | 실제 mail/Telegram runtime 은 운영 node 에 있음 |

## 저장 경계

- 기능 코드, public-safe template, 운영 문서는 public `Soulforge` repo 에 둔다.
- LaunchAgent 실제 설치 파일은 `~/Library/LaunchAgents/` 아래 local 설정이다.
- Telegram token, chat id, mail credential 은 `guild_hall/state/**` local env 에만 둔다.
- healer/doctor 결과 report 는 local-only `guild_hall/state/operations/soulforge_activity/**` 에 둔다.
- cross-PC continuity mirror 는 nested private repo `private-state/` 의 허용된 activity surface 만 사용한다.
- public repo 에 raw mail, attachment, secret, `_workspaces/<project_code>/` 실자료를 올리지 않는다.

## 완료 기준

- MacBook Air 가 public repo pull 만으로 healer rollout 방향과 역할 분리를 이해할 수 있다.
- 24시간 PC 에서는 별도 긴 설명 없이 이 문서를 따라 수동 smoke 와 LaunchAgent 배포를 진행할 수 있다.
- 자주 도는 감시는 LLM 없이 실행되고, LLM 은 daily/advisory/report 계층에만 남는다.

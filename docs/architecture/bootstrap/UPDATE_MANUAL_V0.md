# UPDATE_MANUAL_V0

## 목적

- 이 문서는 이미 설치된 Soulforge 를 다른 PC 에서 최신 상태로 맞출 때의 표준 절차를 잠근다.
- public repo 와 nested `private-state/` repo 를 어떤 순서로 확인하고 갱신할지 고정한다.

## 한 줄 정의

- 업데이트는 `doctor --remote` 로 현재 상태를 먼저 확인하고, behind 인 repo 만 `git pull --rebase origin main` 으로 갱신한 뒤, `skills:sync` 와 `doctor` 로 마무리한다.

## Chapter 1. 적용 대상

- `public-only`
  - public `Soulforge` repo 만 갱신한다.
- `owner-with-state`
  - public `Soulforge` 와 nested `private-state/` repo 둘 다 확인한다.
  - 필요하면 작업한 PC 에서 `private-state/` 로 continuity data 를 sync 한 뒤 push 할 수 있다.

## Chapter 2. 기본 원칙

1. 업데이트 전에는 먼저 `guild-hall:doctor -- --profile <profile> --remote` 로 최신 상태를 확인한다.
2. private repo 가 local Git repo 만 있고 `origin` remote 가 없으면, pull 전에 먼저 remote 를 연결한다.
3. behind 인 repo 만 pull 한다.
3. local env, token, password, cookie, session, credential JSON 은 업데이트 절차에서 읽거나 바꾸지 않는다.
4. public repo 는 코드/문서/public-safe sample 만 갱신한다.
5. protected business data 는 `private-state/` repo 에서만 갱신한다.
6. pull 뒤에는 필수 Soulforge skill 을 다시 sync 한다.
7. 마지막에는 `guild-hall:doctor -- --profile <profile>` 로 safe readiness 를 다시 확인한다.
8. 외부 자격증명까지 다시 확인할 필요가 있을 때만 `--live` 를 수행한다.

## Chapter 3. `public-only` 업데이트 절차

```bash
cd Soulforge
npm run guild-hall:doctor -- --profile public-only --remote
git pull --rebase origin main
npm run skills:sync -- shield_wall record_stitch skill_check
npm run guild-hall:doctor -- --profile public-only
```

필요할 때만:

```bash
npm run guild-hall:doctor -- --profile public-only --live
```

## Chapter 4. `owner-with-state` 업데이트 절차

```bash
cd Soulforge
npm run guild-hall:doctor -- --profile owner-with-state --remote
git pull --rebase origin main

cd private-state
git pull --rebase origin main

cd ..
npm run skills:sync -- shield_wall record_stitch skill_check
npm run guild-hall:doctor -- --profile owner-with-state
```

`private-state/` 가 이미 nested Git repo 인데 `origin` remote 가 비어 있으면, 먼저 아래처럼 연결한다.

```bash
cd Soulforge/private-state
git remote add origin <private-state-repo-url>
git fetch origin main
git switch -C main --track origin/main
```

필요할 때만:

```bash
npm run guild-hall:doctor -- --profile owner-with-state --live
```

## Chapter 5. 판단 기준

- `doctor --remote` 결과에서 `behind=0` 이면 pull 할 필요가 없다.
- public repo 가 behind 면 public repo 만 pull 한다.
- `owner-with-state` 에서 private repo 가 behind 면 `private-state/` 도 pull 한다.
- ahead 만 있고 behind 가 없으면 먼저 local change 를 검토하고, 자동 pull 대신 상태를 보고한다.

## Chapter 6. AI handoff 규칙

- AI 는 먼저 `doctor --remote` 를 수행하고 before 상태를 보고한다.
- AI 는 behind 인 repo 만 pull 한다.
- AI 는 secret 파일을 읽지 않는다.
- AI 는 업데이트 후 `skills:sync` 와 `doctor` 를 자동으로 수행한다.
- AI 는 pull 여부와 before/after ahead/behind 만 짧게 보고한다.

## Chapter 7. continuity data 동기화

다른 PC 에서 이어서 작업해야 하면, 작업을 마친 owner PC 에서 active continuity data 를 nested `private-state/` 로 먼저 동기화한 뒤 private GitHub 에 push 해야 한다.

```bash
cd Soulforge
rsync -a guild_hall/state/gateway/intake_inbox/ private-state/guild_hall/state/gateway/intake_inbox/
rsync -a guild_hall/state/gateway/log/monster_events/ private-state/guild_hall/state/gateway/log/monster_events/
rsync -a guild_hall/state/gateway/mailbox/outbound/ private-state/guild_hall/state/gateway/mailbox/outbound/
rsync -a guild_hall/state/gateway/log/mail_send/ private-state/guild_hall/state/gateway/log/mail_send/
rsync -a _workspaces/ private-state/_workspaces/

cd private-state
git add .
git commit -m "chore: continuity data sync"
git push origin main
```

위 push 는 메인 PC 에서만 가능한 작업이 아니라, `owner-with-state` 조건이 맞고 private repo remote/auth 가 준비된 다른 owner PC 에서도 같은 방식으로 수행할 수 있다.

대상 PC 에서는 그다음에만:

```bash
cd Soulforge/private-state
git pull --rebase origin main

cd ..
rsync -a private-state/guild_hall/state/gateway/intake_inbox/ guild_hall/state/gateway/intake_inbox/
rsync -a private-state/guild_hall/state/gateway/log/monster_events/ guild_hall/state/gateway/log/monster_events/
rsync -a private-state/guild_hall/state/gateway/mailbox/outbound/ guild_hall/state/gateway/mailbox/outbound/
rsync -a private-state/guild_hall/state/gateway/log/mail_send/ guild_hall/state/gateway/log/mail_send/
rsync -a private-state/_workspaces/ _workspaces/
```

## Chapter 8. 관련 명령

- 상태 확인:
  - `npm run guild-hall:doctor -- --profile <profile> --remote`
- public repo 갱신:
  - `git pull --rebase origin main`
- private repo 갱신:
  - `cd private-state && git pull --rebase origin main`
- 필수 skill sync:
  - `npm run skills:sync -- shield_wall record_stitch skill_check`
- 최종 safe 확인:
  - `npm run guild-hall:doctor -- --profile <profile>`
- 최종 live 확인:
  - `npm run guild-hall:doctor -- --profile <profile> --live`

## Chapter 8. 연결 문서

- [`README.md`](README.md)
- [`BOOTSTRAP_PROFILES_V0.md`](BOOTSTRAP_PROFILES_V0.md)
- [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)

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

## Chapter 2. 기본 원칙

1. 업데이트 전에는 먼저 `guild-hall:doctor -- --profile <profile> --remote` 로 최신 상태를 확인한다.
2. behind 인 repo 만 pull 한다.
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

## Chapter 7. 관련 명령

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


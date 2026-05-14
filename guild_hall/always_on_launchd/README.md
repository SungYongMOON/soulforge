# guild_hall/always_on_launchd

## 목적

- `always_on_launchd/` 는 24시간 PC 에 필요한 deterministic launchd job 배포 표면이다.
- tracked repo 에서는 public-safe plist generator 와 verify helper 만 소유하고, 실제 설치 위치는 각 Mac 의 `~/Library/LaunchAgents/` 아래 local 설정으로 둔다.

## 포함 대상

- `launchd.mjs`
  - mail-fetch, mail-healthcheck, town-crier, healer light/full plist renderer 와 installer
- `cli.mjs`
  - render / install / verify entrypoint
- `launchd.test.mjs`
  - plist render/install/verify helper test

## 명령

```bash
npm run guild-hall:always-on:render -- --local-root /path/to/Soulforge --json
npm run guild-hall:always-on:install -- --local-root /path/to/Soulforge --json
npm run guild-hall:always-on:verify -- --local-root /path/to/Soulforge --check-launchctl --json
```

## 기본 job set

- `ai.soulforge.gateway.mail-fetch`
- `ai.soulforge.gateway.mail-healthcheck`
- `ai.soulforge.town-crier`
- `ai.soulforge.healer.light`
- `ai.soulforge.healer.full`

`night_watch` 는 launchd plist 가 아니라 Codex local automation lane 이 current-default 다.

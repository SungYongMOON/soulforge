# guild_hall/always_on_launchd

## 목적

- `always_on_launchd/` 는 24시간 PC 에 필요한 deterministic launchd job 배포 표면이다.
- tracked repo 에서는 public-safe plist generator 와 verify helper 만 소유하고, 실제 설치 위치는 각 Mac 의 `~/Library/LaunchAgents/` 아래 local 설정으로 둔다.

## 포함 대상

- `launchd.mjs`
  - mail-fetch, mail-healthcheck, town-crier, healer light/full plist renderer 와 installer
  - interval job은 GUI launchd domain의 `StartInterval` spawn이 보류돼도 멈추지
    않도록 one-shot 명령을 단일 persistent loop 안에서 순차 실행한다.
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

## interval job 운영 방식

- 실제 수집기·전송기 명령은 기존 one-shot 계약을 유지한다.
- LaunchAgent는 `RunAtLoad + KeepAlive`로 한 번 시작한 뒤 명령 완료 후 각 job의
  간격만큼 기다려 다음 실행을 시작한다. 앞 실행이 끝나기 전에는 겹쳐 실행하지 않는다.
- one-shot 명령이 실패해도 실패 상태를 stderr에 남기고 다음 간격에 재시도한다.
- `gateway.mail-fetch` plist는 PLAUD 메일 trigger 생성을 명시적으로 활성화한다.
- mail-fetch와 healthcheck는 전체 JSON 대신 bounded operator summary만 stdout에
  남겨 장기 로그가 mailbox cursor 전체를 반복 축적하지 않게 한다.
- 설치 후에는 `launchctl kickstart -k gui/$(id -u)/<label>`로 한 번 시작하고,
  `launchctl print gui/$(id -u)/<label>`에서 계속 `running`인지 확인한다.

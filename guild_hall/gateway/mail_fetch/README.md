# gateway_mail_fetch

이 폴더는 Soulforge `gateway` ingress 아래에서 메일을 수집하는 tracked source capsule 이다.
원본은 `Seabot_AI/dev/email-fetch` 였고, 다른 PC 에서 Soulforge 만 clone 해도 같은 수집 코드를 materialize 할 수 있게 최소 범위만 옮겼다.

## 포함 범위

- `collector/`: 실제 수집/정규화/저장 본체
- `spec/`: event/cursor schema 와 connector contract
- `tests/`: collector 회귀 테스트
- `runbooks/`: 모니터링/상태 복구 절차
- `policies/`: 보존/보안 정책
- `cli.py`: Soulforge gateway 기본 경로를 쓰는 실행 진입점
- `healthcheck.py`: runtime summary 기반 이상 감지 + Telegram alert 진입점
- `state_backup.py`, `state_restore.py`, `retention_cleanup.py`: state/retention 운영 launcher
- `email_fetch.env.example`: 다른 PC bootstrap 용 local env 예시

## Soulforge 기본 경로

- mailbox root: `guild_hall/state/gateway/mailbox/`
- runtime root: `guild_hall/state/gateway/log/mail_fetch/`
- default env file: `guild_hall/state/gateway/mailbox/state/email_fetch.env`

## 기본 실행

```bash
python3 scripts/gateway_mail_fetch/cli.py --once --json
python3 scripts/gateway_mail_fetch/healthcheck.py --json
```

## 주의

- 실제 토큰, 비밀번호, Telegram 자격증명은 local env file 에만 둔다.
- `guild_hall/state/**` 실자료는 GitHub 에 올리지 않는다.

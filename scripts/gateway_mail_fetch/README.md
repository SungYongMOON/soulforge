# gateway_mail_fetch

이 폴더는 얇은 launcher 묶음이다.
canonical source 는 `guild_hall/gateway/mail_fetch/` 아래에 있고, 이 경로는 top-level 진입점만 제공하는 wrapper 로 남긴다.

## 포함 범위

- `cli.py`, `healthcheck.py`, `state_backup.py`, `state_restore.py`, `retention_cleanup.py`
  - canonical `guild_hall/gateway/mail_fetch/*` 로 위임하는 wrapper

## canonical 위치

- source: `guild_hall/gateway/mail_fetch/`
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

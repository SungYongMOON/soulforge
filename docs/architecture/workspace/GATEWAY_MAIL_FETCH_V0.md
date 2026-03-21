# GATEWAY_MAIL_FETCH_V0

## 목적

- 이 문서는 Soulforge clone 만으로 메일 수집 edge 를 다시 세팅할 수 있게 `gateway mail fetch` 캡슐의 tracked source 와 local runtime 경계를 잠근다.
- 수집기는 `guild_hall/state/gateway/` 아래 mailbox raw/events/attachments 를 materialize 하고, 이후 `guild-hall:gateway:intake` 가 그 결과를 monster intake 로 소비한다고 본다.

## tracked source 위치

- 실행 캡슐: `guild_hall/gateway/mail_fetch/`
- launcher: `guild_hall/gateway/mail_fetch/cli.py`
- healthcheck: `guild_hall/gateway/mail_fetch/healthcheck.py`
- env example: `guild_hall/gateway/mail_fetch/email_fetch.env.example`
- collector tests: 같은 캡슐 아래에 둔다.
- spec/runbook/policy 정본: `docs/architecture/guild_hall/gateway/mail_fetch/` 아래에 둔다.

## local runtime 위치

- mailbox root: `guild_hall/state/gateway/mailbox/`
- runtime root: `guild_hall/state/gateway/log/mail_fetch/`
- default env file: `guild_hall/state/gateway/mailbox/state/email_fetch.env`

## mailbox materialization shape

```text
guild_hall/state/gateway/
├── mailbox/
│   ├── company/
│   │   ├── mail/
│   │   │   ├── raw/
│   │   │   ├── events/
│   │   │   └── attachments/
│   │   └── ads/
│   │       └── events/
│   ├── personal/
│   │   └── mail/
│   │       ├── raw/
│   │       ├── events/
│   │       └── attachments/
│   └── state/
│       └── email_fetch.env
├── bindings/
│   └── notify_policy.yaml
└── log/
    └── mail_fetch/
        ├── state/
        ├── logs/
        └── monitor/
```

## 실행 명령

```bash
npm run guild-hall:gateway:fetch -- --once --json
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

## 경계

- tracked source 는 Soulforge 가 소유한다.
- 실제 mailbox dump, token, password, last cursor, run summary 는 `guild_hall/state/gateway/**` local runtime 이 소유한다.
- 외부 별도 저장소의 runtime/state/token 파일을 전제로 두지 않는다.

## 관련 경로

- [`MULTI_PC_DEVELOPMENT_V0.md`](../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`MAIL_INTAKE_REQUEST_V0.md`](../../../docs/architecture/workspace/MAIL_INTAKE_REQUEST_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](../../../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`guild_hall/gateway/mail_fetch/README.md`](../../../guild_hall/gateway/mail_fetch/README.md)
- [`docs/architecture/guild_hall/gateway/mail_fetch/README.md`](../../../docs/architecture/guild_hall/gateway/mail_fetch/README.md)

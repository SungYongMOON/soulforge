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

Env 파일의 경로 값은 절대 경로면 그대로 사용하고, 상대 경로면 env 파일이 있는 디렉터리를 기준으로 해석한다.
운영 node 에서는 PC별 실행 위치 혼선을 줄이기 위해 `EMAIL_FETCH_RUNTIME_DIR` 와 `EMAIL_FETCH_INBOX_ROOT` 에 절대 경로를 권장한다.

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

## Telegram mail brief

- `mail_received` gateway notify 가 켜져 있으면 fetch pipeline 은 dedupe 를 통과한 fresh event 마다 `town_crier` queue 에 Telegram brief request 를 적재한다.
- brief 는 한국어 문장형으로 만들고, Siri 가 읽어도 자연스럽게 들리도록 `NOTIFY_BRIEF_FORMAT_V0.md` 규칙을 따른다.
- brief 에는 source, subject, 첫 발신자, 첨부 개수, 수신 시각, 다음 행동만 포함한다.
- mail body, HTML body, attachment 원문/파일명/URL, raw row, secret 값은 Telegram text 에 포함하지 않는다.

## Hiworks POP3 long line

- Hiworks POP3 메시지는 Python `poplib` 기본 라인 제한보다 긴 body/HTML/encoded attachment 라인을 반환할 수 있다.
- 수집기는 Hiworks `RETR` 응답만 별도 reader 로 읽고, 기본 한 줄 허용치는 `HIWORKS_POP3_MAX_LINE_BYTES=10485760` 이다.
- 이 값은 raw mail/body 를 터미널에 출력하지 않고, 수집 실패 시 operator summary 에는 sanitized error code/count 만 남긴다.

## Hiworks POP3 cursor

- Hiworks POP3 수집은 `last_uidl` 이 현재 mailbox 에 남아 있으면 그 이후 메시지만 후보로 본다.
- `seen_uidls` 는 dedupe 보조 window 로 유지하되, window 밖의 오래된 UIDL 이 새 메일보다 먼저 재수집되지 않도록 `last_uidl` 진행선을 우선한다.
- pipeline 은 dedupe 를 통과한 fresh event 의 raw row 만 materialize 한다.

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

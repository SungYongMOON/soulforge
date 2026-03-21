# MAIL_SEND_V0

## 목적

- 이 문서는 Soulforge clone 기준의 outbound mail placeholder 위치를 잠근다.
- 현재 v0 범위에서는 실제 SMTP sender runner 는 구현하지 않지만, local-only 설정 자리와 send record 저장 위치는 먼저 확보한다.

## tracked source 위치

- owner capsule: `guild_hall/gateway/mail_send/`
- tracked example env: `guild_hall/gateway/mail_send/mail_send.env.example`

## local state 위치

- actual local env: `guild_hall/state/gateway/mailbox/state/mail_send.env`
- outbound snapshot root: `guild_hall/state/gateway/mailbox/outbound/`
- send log root: `guild_hall/state/gateway/log/mail_send/`

## 현재 상태

- slot-only
- 아직 `guild-hall:gateway:send-mail` 같은 실행 명령은 없다.
- 실제 비밀값은 local-only env 에만 넣는다.
- 향후 발송 기능은 snapshot 1건 + append-only send log 1건을 같이 남긴다.

## 기본 shape

```env
EMAIL_SEND_ENABLED=false
EMAIL_SEND_PROVIDER=hiworks

HIWORKS_SMTP_HOST=
HIWORKS_SMTP_PORT=
HIWORKS_SMTP_USERNAME=
HIWORKS_SMTP_PASSWORD=
HIWORKS_SMTP_USE_SSL=
HIWORKS_SMTP_USE_STARTTLS=
HIWORKS_SMTP_FROM=
```

## 저장 shape

### outbound snapshot

```text
guild_hall/state/gateway/mailbox/outbound/YYYY/YYYY-MM/<message_id>.json
```

```json
{
  "message_id": "mail_send_demo_001",
  "provider": "hiworks",
  "status": "sent",
  "sent_at": "2026-03-21T17:10:00+09:00",
  "from": "seabot.moon@sonartech.com",
  "to": ["seabot.moon@sonartech.com"],
  "cc": [],
  "bcc": [],
  "subject": "[Soulforge sample] SMTP test",
  "body_text": "Soulforge mail_send.env SMTP sample test.",
  "attachment_refs": [],
  "source_ref": null
}
```

### send log

```text
guild_hall/state/gateway/log/mail_send/YYYY/YYYY-MM.jsonl
```

```json
{
  "event_type": "mail_sent",
  "at": "2026-03-21T17:10:00+09:00",
  "message_id": "mail_send_demo_001",
  "provider": "hiworks",
  "status": "sent",
  "snapshot_ref": "guild_hall/state/gateway/mailbox/outbound/2026/2026-03/mail_send_demo_001.json",
  "from": "seabot.moon@sonartech.com",
  "to_count": 1,
  "attachment_count": 0
}
```

## 기록 원칙

- 발송 본문과 수신자 목록의 current snapshot 은 `mailbox/outbound/**` 가 owner 다.
- append-only 송신 이력은 `log/mail_send/**` 가 owner 다.
- 정본 계약은 구조화된 JSON/JSONL 이고, 사람이 읽기 좋은 문장 가공은 이후 formatter surface 가 맡는다.

## 관련 경로

- [`../../../guild_hall/gateway/mail_send/README.md`](../../../guild_hall/gateway/mail_send/README.md)
- [`../../../guild_hall/gateway/mail_send/mail_send.env.example`](../../../guild_hall/gateway/mail_send/mail_send.env.example)
- [`examples/guild_hall/state/gateway/outbound/README.md`](examples/guild_hall/state/gateway/outbound/README.md)
- [`examples/guild_hall/state/gateway/log/mail_send/README.md`](examples/guild_hall/state/gateway/log/mail_send/README.md)
- [`GATEWAY_MAIL_FETCH_V0.md`](GATEWAY_MAIL_FETCH_V0.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
- [`PRIVATE_STATE_REPO_V0.md`](PRIVATE_STATE_REPO_V0.md)

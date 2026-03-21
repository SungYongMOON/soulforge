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
- 외부 발송 ledger 기준은 먼저 잠그고, 실제 sender runner 는 이후 별도 단계에서 붙인다.

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
  "send_id": "mail_send_demo_001",
  "provider": "hiworks",
  "provider_message_id": "<smtp-demo-001@hiworks.example>",
  "status": "sent",
  "result": "sent",
  "generated_by": "guild_hall/gateway/mail_send",
  "approved_by": "manual_owner",
  "approved_at": "2026-03-21T17:09:30+09:00",
  "sent_at": "2026-03-21T17:10:00+09:00",
  "retry_of": null,
  "mission_ref": null,
  "monster_ref": null,
  "from": "seabot.moon@sonartech.com",
  "to": ["seabot.moon@sonartech.com"],
  "cc": [],
  "bcc": [],
  "recipient_summary": {
    "to_count": 1,
    "cc_count": 0,
    "bcc_count": 0
  },
  "subject": "[Soulforge sample] SMTP test",
  "subject_fingerprint": "sha256:demo-fingerprint",
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
  "send_id": "mail_send_demo_001",
  "provider": "hiworks",
  "provider_message_id": "<smtp-demo-001@hiworks.example>",
  "status": "sent",
  "result": "sent",
  "snapshot_ref": "guild_hall/state/gateway/mailbox/outbound/2026/2026-03/mail_send_demo_001.json",
  "generated_by": "guild_hall/gateway/mail_send",
  "approved_by": "manual_owner",
  "from": "seabot.moon@sonartech.com",
  "to_count": 1,
  "attachment_count": 0,
  "retry_of": null
}
```

## 기록 원칙

- 발송 본문과 수신자 목록의 current snapshot 은 `mailbox/outbound/**` 가 owner 다.
- append-only 송신 이력은 `log/mail_send/**` 가 owner 다.
- 정본 계약은 구조화된 JSON/JSONL 이고, 사람이 읽기 좋은 문장 가공은 이후 formatter surface 가 맡는다.

## 최소 ledger 필드

- `send_id`
  - 재사용하지 않는 outbound 발송 단위 식별자
- `provider_message_id`
  - 외부 메일 서버가 돌려준 provider-side 식별자
- `generated_by`
  - 초안을 만든 owner/capsule
- `approved_by`
  - 외부 발송을 승인한 주체
- `approved_at`
  - 승인 시각
- `recipient_summary`
  - `to/cc/bcc` count 요약
- `subject_fingerprint`
  - 제목 기준 dedupe/추적용 fingerprint
- `result`
  - `sent` / `failed` 같은 발송 결과
- `retry_of`
  - 재시도면 원래 `send_id`, 아니면 `null`

## v0 운영 규칙

- 같은 `send_id` 는 재사용하지 않는다.
- 외부 발송은 approval metadata 없이 정본 ledger 로 승격하지 않는다.
- 재시도는 새 `send_id` 를 만들고 `retry_of` 로 연결한다.

## 관련 경로

- [`../../../guild_hall/gateway/mail_send/README.md`](../../../guild_hall/gateway/mail_send/README.md)
- [`../../../guild_hall/gateway/mail_send/mail_send.env.example`](../../../guild_hall/gateway/mail_send/mail_send.env.example)
- [`examples/guild_hall/state/gateway/outbound/README.md`](examples/guild_hall/state/gateway/outbound/README.md)
- [`examples/guild_hall/state/gateway/log/mail_send/README.md`](examples/guild_hall/state/gateway/log/mail_send/README.md)
- [`GATEWAY_MAIL_FETCH_V0.md`](GATEWAY_MAIL_FETCH_V0.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
- [`PRIVATE_STATE_REPO_V0.md`](PRIVATE_STATE_REPO_V0.md)

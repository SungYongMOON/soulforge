# guild_hall/gateway/mail_send

## 목적

- `mail_send/` 는 `guild_hall/gateway/` owner 아래의 outbound mail placeholder capsule 이다.
- 현재 v0 범위에서는 실제 발송 runner 를 두지 않지만, local-only SMTP 설정 자리와 send record 저장 위치는 먼저 잠근다.

## 포함 대상

- `mail_send.env.example`
  - future SMTP/outbound mail local env 의 tracked example
- send record 계약 정본은 `docs/architecture/workspace/MAIL_SEND_V0.md` 를 본다.

## local state

- 실제 비밀값은 `guild_hall/state/gateway/mailbox/state/mail_send.env` 에만 둔다.
- outbound snapshot 은 `guild_hall/state/gateway/mailbox/outbound/**` 아래에 둔다.
- append-only send log 는 `guild_hall/state/gateway/log/mail_send/**` 아래에 둔다.
- 이 경로 아래 실자료는 Git 으로 추적하지 않는다.

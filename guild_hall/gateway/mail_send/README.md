# guild_hall/gateway/mail_send

## 목적

- `mail_send/` 는 `guild_hall/gateway/` owner 아래의 outbound mail capsule 이다.
- local-only SMTP 설정을 사용해 plain text 또는 HTML mail 을 발송하고, send record 를 local state 에 남긴다.

## 포함 대상

- `mail_send.env.example`
  - SMTP/outbound mail local env 의 tracked example
- `send_mail.py`
  - `guild-hall:gateway:send-mail` 실행 표면
  - `text/html` alternative body 를 지원한다.
  - secret 값은 출력하지 않고 local env 에서만 읽는다.
- send record 계약 정본은 `docs/architecture/workspace/MAIL_SEND_V0.md` 를 본다.

## local state

- 실제 비밀값은 `guild_hall/state/gateway/mailbox/state/mail_send.env` 에만 둔다.
- outbound snapshot 은 `guild_hall/state/gateway/mailbox/outbound/**` 아래에 둔다.
- append-only send log 는 `guild_hall/state/gateway/log/mail_send/**` 아래에 둔다.
- 이 경로 아래 실자료는 Git 으로 추적하지 않는다.

## usage

```bash
npm run guild-hall:gateway:send-mail -- \
  --to seabot.moon@sonartech.com \
  --subject "[Soulforge] report" \
  --body-text-file /path/to/report.txt \
  --body-html-file /path/to/report.html \
  --json
```

HTML 본문을 넣으면 runner 는 `multipart/alternative` 메일로 보내며, 텍스트 본문은 복사용 fallback 으로 함께 포함한다.

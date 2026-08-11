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
- owner 문체, 초안 승인, Outlook 수동 발송 규칙은
  `docs/architecture/workspace/MAIL_SEND_STYLE_POLICY_V0.md` 를 본다.

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

외부 업무 메일은 기본적으로 `draft_only` 에서 시작한다. 실제 발송은 현재 요청에서 owner 가 수신자, 제목, 본문, 첨부, 발송 방식을 명시 승인한 경우에만 진행한다.

## Hiworks to Gmail owner bridge

- `hiworks_gmail_forwarder.py` is a separate, non-destructive bridge for the
  owner mailbox only. It does not alter `mail_fetch`, PST/AX custody, or the
  Company Mail MCP/tunnel.
- The legacy filename and scheduled-task name are retained only to preserve the
  installed runtime binding. The implementation no longer creates wrapper mail
  or calls Hiworks SMTP.
- `--initialize` records hashes of currently visible POP3 UIDLs and imports no
  mail. `--apply` sends the exact RFC 822 bytes of later UIDLs to Gmail
  `users.messages.import`, requests the `INBOX` label, and never calls POP3
  `DELE`.
- The existing UIDL baseline is reused during the transition, so changing the
  delivery mode does not automatically backfill older POP3 messages.
- Local state/logs contain fixed route identifiers, hashed message identifiers,
  and operational counts, not mail subjects, bodies, or attachment names.
- Each five-minute cycle writes a sanitized cycle event, which is the current
  heartbeat evidence for a future supervisor. The scheduled-task runner pins
  the collector script SHA-256; revalidate and update that pin deliberately
  whenever the collector changes.
- The five-minute interactive task starts through a repository-owned
  `wscript.exe //B //NoLogo` launcher so its PowerShell worker remains fully
  backgrounded without changing the runner arguments or task cadence.

## Gmail original-message importer

- `gmail_original_importer.py` imports an explicitly selected source-custody
  EML, or exact bytes supplied by the approved continuous collector, into
  `seabot.moon@gmail.com` through Gmail `users.messages.import`.
- It uploads the original RFC 822 bytes with `internalDateSource=dateHeader`,
  `neverMarkSpam=true`, and the `INBOX` label so Gmail can render the original
  MIME body and attachments and order the message from its original `Date`
  header.
- `--preview` is write-free and emits the exact message metadata plus a
  content-derived approval token. `--apply` refuses to write without that
  token and refuses a second import after a private receipt exists.
- `--authorize` requests only OpenID email identity plus the restricted
  `gmail.insert` scope and rejects any account other than the fixed owner Gmail.
  It can use either a desktop client JSON or the existing private mail-fetch env
  as the OAuth client source; it never reuses the mail-fetch refresh token.
- OAuth client/token JSON and import receipts must stay under an owner-provided
  private config/state root outside tracked Git. The importer never changes
  the Hiworks POP3 mailbox, forwarder baseline, PST, AX custody, or MCP/tunnel.

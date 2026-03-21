# examples/guild_hall/state/gateway/log/mail_send

- `log/mail_send/` 는 보낸 메일 append-only event log 의 public-safe mirror sample 을 둔다.
- 실제 local state 정본은 `guild_hall/state/gateway/log/mail_send/**` 아래에서 materialize 한다.
- snapshot 본문은 `outbound/**` 가 owner 이고, 이 경로는 `result`, `snapshot_ref`, `generated_by`, `approved_by`, `retry_of` 같은 요약 이력만 남긴다.

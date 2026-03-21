# examples/guild_hall/state/gateway/outbound

- `outbound/` 는 보낸 메일 snapshot 의 public-safe mirror sample 을 둔다.
- 실제 local state 정본은 `guild_hall/state/gateway/mailbox/outbound/**` 아래에서 materialize 한다.
- 예시 snapshot 은 `subject`, `from`, `to`, `status`, `source_ref` 가 어떻게 남는지 보여준다.

# mail_candidate

- 이 경로는 `guild-hall:gateway:fetch` 가 fresh mail event 를 업무화 검토 후보로 적재하는 local-only queue 의 public-safe mirror sample 이다.
- 실제 운영 데이터는 `guild_hall/state/gateway/mail_candidate/**` 에만 존재해야 한다.
- queue item 은 body/html/raw/첨부명/첨부 URL 없이 source event pointer 와 최소 검토 메타데이터만 보여준다.
- `requests/` 는 `guild-hall:gateway:mail-candidate:promote` 가 생성하는 `mail_intake_request` public-safe sample 을 보여준다.

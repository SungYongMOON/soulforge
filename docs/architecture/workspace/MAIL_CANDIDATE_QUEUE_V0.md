# MAIL_CANDIDATE_QUEUE_V0

## 목적

- 이 문서는 `mail_fetch -> mail_candidate queue -> mail_intake_request` 사이의 local-only 후보 큐 경계를 잠근다.
- `mail_candidate` 는 fresh mail event 를 바로 monster 로 만들지 않고, 업무화 검토가 필요한 메일 후보로 보류하는 staging surface 다.
- raw mail body, HTML body, attachment 원문, attachment URL, secret 값은 후보 큐 item 에 넣지 않는다.

## owner

- tracked source owner: `guild_hall/gateway/mail_fetch/`
- local runtime owner: `guild_hall/state/gateway/mail_candidate/**`
- public-safe sample owner: `docs/architecture/workspace/examples/guild_hall/state/gateway/mail_candidate/**`

## local runtime shape

```text
guild_hall/state/gateway/mail_candidate/
└── queue/
    └── pending/
        └── <candidate_id>.json
```

## 생성 시점

`guild-hall:gateway:fetch` 는 아래 조건을 모두 만족한 event 만 후보 큐에 쓴다.

1. connector 가 가져온 뒤 normalize/dedupe 를 통과한 fresh event 다.
2. event 가 mailbox event JSONL 에 materialize 됐다.
3. classification bucket 이 `mail` 이다.
4. `ingest_status` 가 `failed` 가 아니다.
5. dry-run 이 아니다.

`ads`, `quarantine`, duplicate event 는 업무화 후보 큐에 넣지 않는다.

## queue item 필드

필수 current-default 필드는 아래다.

- `schema_version`: `mail_candidate.queue_item.v1`
- `candidate_id`
- `status`: current-default `pending_review`
- `created_at`, `updated_at`
- `created_by`: current-default `gateway_mail_fetch`
- `review_reason`: current-default `fresh_mail_event`
- `source_event`
  - `event_id`
  - `source`
  - `workspace`
  - `event_file`
  - `received_at`
  - `ingested_at`
- `mail_summary`
  - `subject`
  - `from`
  - `to_count`
  - `cc_count`
  - `attachment_count`
  - `attachment_types`
  - `classification`
- `business_review`
  - `required`
  - `status`
  - `next_action`
  - `intake_request_status`

## 제외 필드

아래 값은 candidate item 에 넣지 않는다.

- `body_text`
- `body_html`
- raw provider payload
- attachment filename
- attachment URL
- downloaded attachment local path
- token, password, cookie, credential

## 후속 처리

- 사람이 후보를 검토하거나 future adapter 가 `mail_intake_request` 를 만들 수 있다.
- `mail_candidate` item 은 monster current state 가 아니다.
- monster 로 materialize 된 뒤의 current state 는 기존 `guild_hall/state/gateway/intake_inbox/**` 계약을 따른다.

## public-safe sample

- [`examples/guild_hall/state/gateway/mail_candidate/`](examples/guild_hall/state/gateway/mail_candidate/)

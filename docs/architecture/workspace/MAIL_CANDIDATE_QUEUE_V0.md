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

- 사람이 후보를 검토한 뒤 `guild-hall:gateway:mail-candidate:promote` 로 `mail_intake_request` 를 만들 수 있다.
- `mail_candidate` item 은 monster current state 가 아니다.
- monster 로 materialize 된 뒤의 current state 는 기존 `guild_hall/state/gateway/intake_inbox/**` 계약을 따른다.

## promotion command

기본 명령:

```bash
npm run guild-hall:gateway:mail-candidate:promote -- --candidate-file guild_hall/state/gateway/mail_candidate/queue/pending/<candidate_id>.json
```

명령은 아래 일을 한다.

1. candidate item 을 읽는다.
2. `source_event.event_file` 의 mailbox event JSONL 에서 같은 `event_id` 를 찾아 provider message id, thread id, to/cc snapshot 을 보강한다.
3. `guild_hall/state/gateway/mail_candidate/requests/<candidate_id>.mail_intake_request.json` 를 쓴다.
4. candidate status 를 `promoted_to_intake_request` 로 바꾸고 `business_review.intake_request_ref` 를 남긴다.

`source_event.event_file` 이 `guild_hall/state/gateway/mailbox/**` 밖을 가리키거나, 파일이 없거나, 같은 `event_id` 를 찾지 못하면 promotion 은 실패한다. candidate 와 mailbox event 는 같은 local runtime set 으로 유지해야 한다.
`--output-file` 을 직접 지정할 때도 기본적으로 `guild_hall/state/gateway/mail_candidate/requests/**` 아래만 허용한다. 예외가 필요하면 `--allow-output-outside-state` 를 명시해야 한다.

생성된 request 는 기존 intake command 로 실행한다.

```bash
npm run guild-hall:gateway:intake -- --payload-file guild_hall/state/gateway/mail_candidate/requests/<candidate_id>.mail_intake_request.json
```

promotion request 는 current-default 로 `unknown_monster` 1개를 넣는다. 이 단계는 "업무화 검토 후보를 monster 후보로 넘기는 것" 이며 project/stage 배정은 기존 intake 이후 단계가 맡는다.

후보 목록만 볼 때는 아래 명령을 쓴다.

```bash
npm run guild-hall:gateway:mail-candidate:list
```

기본 목록은 `pending_review` 만 보여준다. 전체 상태를 보려면 `-- --status all` 을 붙인다.

## promotion output boundary

promotion 으로 만들어지는 `mail_intake_request` 는 아래를 포함한다.

- `event_ref`: mailbox event pointer
- `raw_ref`: raw JSONL pointer
- `subject`
- `from`, `to`, `cc`
- default `unknown_monster` entry

promotion output 에도 아래 값은 넣지 않는다.

- `body_text`
- `body_html`
- raw provider payload
- attachment filename
- attachment URL
- downloaded attachment local path
- secret, token, password, cookie, credential

## public-safe sample

- [`examples/guild_hall/state/gateway/mail_candidate/`](examples/guild_hall/state/gateway/mail_candidate/)

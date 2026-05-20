# guild_hall/gateway

## 목적

- `gateway/` 는 cross-project ingress owner 다.
- mail fetch 와 mail intake 를 통해 몬스터를 materialize 하고, project assignment 전 staging 을 맡는다.
- future outbound mail slot 은 `mail_send/` 아래에서 placeholder 로 관리한다.

## 포함 대상

- `cli.mjs`
  - intake / update / notify canonical entrypoint
- `message_rendering.mjs`
  - gateway notification text, monster label, 문장 정규화 helper
- `monster_index.mjs`
  - intake inbox dedupe manifest cache helper
- `mail_candidate.mjs`
  - mail candidate listing and promotion helper
- `mail_work_status.mjs`
  - mail-derived work item 상태를 candidate -> monster -> mission -> battle 기준으로 projection 하는 local-only helper
- `mail_fetch/collector/storage/mail_candidate_queue.py`
  - fresh mail event 를 업무화 검토 후보 queue 로 적재하는 local-only writer

## state

- local state 는 `guild_hall/state/gateway/**` 아래에만 둔다.
- mailbox, mail candidate queue, intake inbox, gateway local bindings, monster event log, local outbound mail env, outbound snapshot, send log 는 이 경로 아래에서 자란다.
- `guild_hall/state/gateway/intake_inbox/_index/monster_index.json` 은 `dedupe_key` lookup 가속을 위한 local manifest cache 이고, `monsters.json` current state 에서 다시 만들 수 있다.

## mail candidate command

- `guild-hall:gateway:mail-candidate:list`
  - `guild_hall/state/gateway/mail_candidate/queue/pending/**` 의 pending 후보 summary 를 본다.
- `guild-hall:gateway:mail-candidate:promote`
  - 후보 1건을 local-only `mail_intake_request` payload 로 바꾸고 candidate status 를 갱신한다.
- `guild-hall:gateway:mail-work:refresh`
  - `mail_candidate`, `intake_inbox`, `_workmeta` mission/battle metadata 를 합쳐 `mail_work_status/latest.json` 을 갱신한다.
- `guild-hall:gateway:mail-work:list`
  - latest projection 을 읽어 mail-derived work item 의 현재 상태를 본다.

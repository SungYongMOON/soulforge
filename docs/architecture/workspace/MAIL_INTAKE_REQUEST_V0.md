# MAIL_INTAKE_REQUEST_V0

## 목적

- 이 문서는 normalized mail event 가 Soulforge 로 들어올 때 첫 시작 호출 `mail_intake_request` 의 최소 입력/출력을 잠근다.
- v0 에서 이 호출은 mailbox fetch 를 하지 않고, 이미 저장된 mail event 를 읽어 `workspace intake inbox` 와 `monsters[]` 를 materialize 하는 데까지만 책임진다.

## 한 줄 정의

- `mail_intake_request` 는 "새 메일 event 1건을 읽어 `_workspaces/monster_house/.project_agent/intake_inbox/` 아래 inbox container 와 monster list 를 만든다" 는 시작 호출이다.

## 경계

- 이 호출은 mail provider fetch 를 하지 않는다.
- 이 호출은 project/stage inbox assignment 를 하지 않는다.
- 이 호출은 `.mission/**` draft 를 만들지 않는다.
- raw body dump, attachment binary, provider cursor 는 계속 local `_workspaces/**` owner 아래에 남긴다.

## 입력 payload 최소 필드

- `action`
  - 고정값: `mail_intake_request`
- `event_id`
- `source`
  - 예: `hiworks`
- `mailbox_id`
- `provider_message_id`
- `received_at`
- `event_ref`
  - normalized event record pointer
- `raw_ref`
  - provider raw record pointer
- `attachment_refs`
  - binary 는 inline 으로 넣지 않고 ref 만 넘긴다
- `thread_ref`
  - optional
- `subject`
  - optional snapshot
- `from`
  - optional sender snapshot
- `to`
  - optional receiver snapshot
- `cc`
  - optional cc snapshot
- `body_excerpt`
  - optional short body snapshot

## 출력 최소 필드

- `request_id`
- `status`
  - 예: `materialized`, `duplicate`, `failed`
- `workspace_intake_inbox_id`
- `workspace_intake_inbox_ref`
- `source_ref`
- `monster_ids`
- `assignment_status`
  - v0 기본값: `pending_dungeon_assignment`

## v0 규칙

- idempotency key 는 `event_id` 다.
- 같은 `event_id` 를 다시 받으면 duplicate container 를 만들지 않는다.
- payload 는 ref 중심으로 넘기고, mail 본문 전체나 attachment binary 를 inline payload 로 들고 오지 않는다.
- 첫 성공 조건은 `workspace_intake_inbox` 와 `monster_ids[]` 가 생기는 것이다.

## sample request

```yaml
action: mail_intake_request
event_id: hiworks_2026_03_19_001
source: hiworks
mailbox_id: company_mailbox
provider_message_id: "002801dcb212$b79a2400$26ce6c00$@sonartech.com"
received_at: 2026-03-19T09:12:00+09:00
event_ref: _inbox/company/mail/events/hiworks/2026/2026-03.jsonl#event_id=hiworks_2026_03_19_001
raw_ref: _inbox/company/mail/raw/hiworks/2026/2026-03.jsonl#message_id=002801dcb212$b79a2400$26ce6c00$@sonartech.com
attachment_refs:
  - _inbox/company/mail/attachments/hiworks/example_attachment_001
subject: 음탐기영상처리장치 IPS 검토를 위한 배선식별자 작성 요청
from:
  - name: 조영남
    address: joyn128@sonartech.com
to:
  - name: 윤정운
    address: jwyun@cotstech.com
cc:
  - name: 문성용
    address: seabot.moon@sonartech.com
body_excerpt: 내부 케이블 제작 전 IPS 검토 요청용 배선 식별자 자료 작성을 부탁드립니다.
```

## sample response

```yaml
request_id: mail_intake_request_hiworks_2026_03_19_001
status: materialized
workspace_intake_inbox_id: hiworks_2026_03_19_001
workspace_intake_inbox_ref: _workspaces/monster_house/.project_agent/intake_inbox/hiworks_2026_03_19_001/
source_ref: hiworks_2026_03_19_001
monster_ids:
  - monster_hiworks_2026_03_19_001_a
  - monster_hiworks_2026_03_19_001_b
assignment_status: pending_dungeon_assignment
```

## 연결 문서

- [`WORKSPACE_INTAKE_INBOX_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`DUNGEON_ASSIGNMENT_REQUEST_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/DUNGEON_ASSIGNMENT_REQUEST_V0.md)
- [`PLAY_LOOP_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/.mission/PLAY_LOOP_V0.md)

## ASSUMPTIONS

- mail fetch edge 는 별도 adapter 가 맡고, Soulforge 는 normalized event consumer 로 시작하는 구조를 기본안으로 본다.

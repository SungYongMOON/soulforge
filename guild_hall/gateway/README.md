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
- `mail_candidate_backlog.mjs`
  - pending mail candidate backlog age/stale metadata check helper
- `mail_work_status.mjs`
  - mail-derived work item 상태를 candidate -> monster -> mission -> battle 기준으로 projection 하고, 주간 계획 누락 방지용 P00 visibility register 를 갱신하는 local-only helper
- `deadline_watch_import.mjs`
  - deterministic mail priority due metadata 를 project-local deadline_watch row 후보로 import/validate 하는 helper
- `deadline_watchdog_reminder.mjs`
  - project-local deadline_watch metadata 로 dry-run/manual-confirm reminder preview 를 만드는 helper
- `project_mail_history_writer.mjs`
  - assigned project 가 있는 mail-derived monster 생성/갱신 이벤트를 `_workmeta/<project_code>/reports/메일_이력/` 아래 metadata CSV/일정 이벤트로 갱신하고, Excel 보기용 export 는 `_workspaces/<project_code>/reports/메일_이력/` 아래에 쓰는 private writer
- `mail_fetch/collector/storage/mail_candidate_queue.py`
  - fresh mail event 를 업무화 검토 후보 queue 로 적재하고, monster 생성 전 수신 이력을 `_workmeta/P00-000_INBOX/reports/메일_이력/` 로 남기는 local-only writer

## state

- local state 는 `guild_hall/state/gateway/**` 아래에만 둔다.
- mailbox, mail candidate queue, intake inbox, gateway local bindings, monster event log, local outbound mail env, outbound snapshot, send log 는 이 경로 아래에서 자란다.
- `guild_hall/state/gateway/intake_inbox/_index/monster_index.json` 은 `dedupe_key` lookup 가속을 위한 local manifest cache 이고, `monsters.json` current state 에서 다시 만들 수 있다.

## mail candidate command

- `guild-hall:gateway:mail-candidate:list`
  - `guild_hall/state/gateway/mail_candidate/queue/pending/**` 의 pending 후보 summary 를 본다.
- `guild-hall:gateway:mail-candidate:backlog`
  - pending 후보 개수, age/stale 여부, pending count 추세를 metadata-only backlog report 로 본다.
- `guild-hall:gateway:mail-candidate:promote`
  - 후보 1건을 local-only `mail_intake_request` payload 로 바꾸고 candidate status 를 갱신한다.
- `node guild_hall/gateway/cli.mjs triage-mail-candidate --private-deep`
  - 후보 1건 또는 pending 후보 전체를 프로젝트 라우팅 후보로 주석 처리한다.
  - 회신/전달 인용부에서만 강한 프로젝트 식별자가 잡히면 `route_source: quoted_chain_private_deep` 로 표시한다.
  - 현재 본문/안전 메타데이터와 인용부 근거가 함께 잡히면 `route_source: mixed_private_deep` 로 표시한다.
  - 본문/HTML/첨부명 원문은 routing suggestion, activity, project ledger 로 복사하지 않는다.
- `guild-hall:gateway:mail-work:refresh`
  - `mail_candidate`, `intake_inbox`, `_workmeta` mission/battle metadata 를 합쳐 `mail_work_status/latest.json` 을 갱신한다.
- `guild-hall:gateway:mail-work:list`
  - latest projection 을 읽어 mail-derived work item 의 현재 상태를 본다.
- `guild-hall:gateway:mail-work:priority:refresh`
  - candidate/status metadata 를 priority projection 으로 갱신하고 due date, week-window match, route hint 후보를 붙인다.
- `guild-hall:gateway:mail-work:priority:list`
  - priority projection 을 필터링해서 사람이 먼저 볼 대기열을 본다. `--week-start`, `--week-end`, `--week-window-only` 로 주간 기한 후보만 좁힐 수 있다.
- `guild-hall:gateway:mail-work:weekly-visibility`
  - `_workmeta/P00-000_INBOX/reports/triage/unresolved_weekly_visibility_register.md` 를 갱신한다. candidate 로 못 올라온 mailbox event-only/quarantine row 는 metadata-only 로만 표시하고 자동 승격하지 않는다.

## deadline-watch command

- `node guild_hall/gateway/cli.mjs import-deadline-watch`
  - `mail_work_priority` 의 deterministic due metadata 를 project-local `deadline_watch` row 후보로 만든다. 기본은 dry-run 이며 실제 쓰기는 `--apply` 가 필요하다.
- `guild-hall:gateway:deadline-watch:validate`
  - project-local deadline register 와 reminder event log 의 metadata-only boundary 를 검사한다.
- `guild-hall:gateway:deadline-watch:reminders`
  - active deadline row 에서 Telegram-ready reminder 후보를 preview 한다. 자동 발송이나 `town_crier` queue write 는 하지 않는다.

## package caveat

- workspace 계약에는 backlog/watchdog helper 파일이 CLI consumer 와 함께 tracked package 에 포함되어야 한다는 caveat 가 남아 있다. 이 README 는 package-clean 상태를 주장하지 않는다.

## project mail history private writer

- 메일 이력의 최초 작성 단계는 monster 생성이 아니라 `mail_candidate_queue` 다.
- 24시간 mail fetch 는 업무 후보 메일을 큐에 적재할 때 `_workmeta/P00-000_INBOX/reports/메일_이력/` 에 `mail_received` 행을 먼저 upsert 한다.
- mail intake/update 중 monster 에 `assigned_project_code` 가 있으면 `_workmeta/<project_code>/reports/메일_이력/` 에 monster 생성/갱신 후속 행을 upsert 한다.
- dungeon assignment 가 project filing 을 수행하면 같은 프로젝트 이력에 `mail_filing_received` 후속 행을 upsert 한다.
- `_workmeta` 에는 `메일_이력.csv`, `메일_일정이벤트.ics` 만 쓴다. Excel export 인 `메일_이력.xlsx` 는 `_workspaces/<project_code>/reports/메일_이력/` 아래에만 쓴다.
- 같은 project/event/candidate-or-monster/mail source 조합은 같은 `이력키` 로 upsert 하므로 재실행해도 CSV/Excel export/일정 이벤트에 중복 행을 만들지 않는다.
- writer 는 메일 본문, HTML, raw payload, attachment path/name/url 을 복사하지 않고 gateway/project/filing/mission pointer 와 metadata 만 적는다.

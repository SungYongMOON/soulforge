# MAIL_WORK_STATUS_V0

## 목적

- 이 문서는 mail-derived work item 의 현재 진행 상태를 local-only projection 으로 묶는 `mail_work_status` contract 를 잠근다.
- 목표는 raw mail 이 아니라 metadata-only join 결과를 통해 `후보 -> 몬스터 -> project -> mission -> battle -> completion mark` 흐름을 한 눈에 보이게 하는 것이다.

## 한 줄 정의

- `mail_work_status` 는 `mail_candidate`, `workspace intake inbox`, project-local monster, private mission index, battle event metadata 를 `monster_id` 중심으로 조인한 local-only 현재 상태 projection 이다.
- `mail_work_priority` 는 `mail_work_status` 와 candidate metadata-only summary 위에 사람이 먼저 볼 대기열 상태를 얹은 local-only priority projection 이다.

## world model

```text
mail rumor -> candidate note -> gateway monster -> project monster
-> mission -> battle_log -> completion mark
```

## output

- canonical local output:
  - `guild_hall/state/gateway/mail_work_status/latest.json`
- priority local output:
  - `guild_hall/state/gateway/mail_work_status/priority_latest.json`
- weekly unresolved visibility register:
  - `_workmeta/P00-000_INBOX/reports/triage/unresolved_weekly_visibility_register.md`
- owner:
  - `guild_hall/state/gateway/**`
  - `_workmeta/P00-000_INBOX/reports/triage/**` for private unresolved planning visibility
- tracked public repo 대상이 아니다.

## cross-PC rebuild policy

- `mail_work_status/latest.json` 과 `priority_latest.json` 은 local-only
  derived projection 이며 `private-state/` mirror 대상이 아니다.
- `mail_candidate` queue/status projection 도 `private-state/` mirror 대상이
  아니다. 다른 PC 로 넘어가는 것은 `guild-hall:activity:project-mail-candidates`
  또는 `guild-hall:activity:sync` 가 만든 body-safe activity summary 뿐이다.
- source truth 는 project-local `_workmeta` ledgers, gateway intake/monster
  state, mailbox continuity subset, mission/battle metadata 에 남는다.
  `mail_work_status` 는 이 surface 들을 조인해 만든 현재 보기일 뿐이다.
- 다른 owner-with-state PC 는 `private-state/` 의 기존 allowlist subset 을
  복원한 뒤 로컬에서 projection 을 다시 만든다. private-state 안에 같은
  이름의 projection copy 가 있더라도 source truth 로 취급하지 않는다.

권장 refresh 순서:

```bash
npm run guild-hall:activity:project-mail-candidates -- --json
npm run guild-hall:activity:refresh -- --json
npm run guild-hall:gateway:mail-work:refresh
npm run guild-hall:gateway:mail-work:priority:refresh
npm run guild-hall:assistant-dashboard:write
```

주간 계획 누락 방지 register 가 필요할 때만 week window 를 명시한다.

```bash
npm run guild-hall:gateway:mail-work:weekly-visibility -- --week-start YYYY-MM-DD --week-end YYYY-MM-DD
```

## source surface

- `guild_hall/state/gateway/mail_candidate/queue/pending/*.json`
- `mail_candidate_backlog` 는 pending candidate 의 개수, candidate ref, status, received_at/updated_at 기반 age, stale 여부, 직전 리포트 대비 pending count 추세만 다루는 metadata-only 점검 surface 다.
  - CLI stdout 기본값은 full report 가 아니라 bounded display 이며 기본 `display_limit` 은 10 이다.
  - `--limit <n>` 은 stdout display 에만 적용되고, `--output-file` 로 쓰는 latest report 는 full `pending_candidates` / `invalid_candidates` 배열을 유지한다.
  - `--summary-only` 는 stdout 의 candidate row 배열을 비우고 omitted count 를 표시하며, `--full` 은 stdout 에도 full 배열을 출력한다.
  - package-clean tracking gate is closed for this helper:
    `guild_hall/gateway/mail_candidate_backlog.mjs` is tracked with
    `guild_hall/gateway/cli.mjs` and healer consumers, and future
    package-clean claims must keep those refs tracked.
- `guild_hall/state/gateway/intake_inbox/*/inbox.json`
- `guild_hall/state/gateway/intake_inbox/*/monsters.json`
- `_workmeta/<project_code>/monsters/*.yaml`
- `_workmeta/<project_code>/missions/index.yaml`
- `_workmeta/<project_code>/log/events/**/battle_events.jsonl`
- `guild_hall/state/gateway/mailbox/**/{mail,quarantine}/events/**/*.jsonl`
  - weekly visibility register only
  - event-only fallback metadata is read so quarantine or non-candidate work-like mail can be noticed

읽지 않는 것:

- raw mailbox payload
- full mail body / HTML
- attachment binary / URL payload
- token / cookie / session / credential file

## projection shape

### root

- `schema_version`
- `kind`
- `generated_at`
- `count`
- `counts`
- `entries`
- `boundary.raw_payload_copied`

### row minimum fields

- `mail_source_ref`
- `candidate_id`
- `inbox_id`
- `monster_id`
- `project_code`
- `project_monster_ref`
- `mission_id`
- `mission_ref`
- `battle_event_id`
- `terminal_result`
- `work_status`
- `status_reason`
- `refs`
- `updated_at`
- `boundary.raw_payload_copied`

### priority root

- `schema_version`: `soulforge.gateway.mail_work_priority.v1`
- `kind`: `mail_work_priority_projection`
- `generated_at`
- `source_schema_version`
- `count`
- `counts`
- `route_counts`
- `entries`
- `boundary.raw_payload_copied`

### priority row minimum fields

- `candidate_id`
- `mail_source_ref`
- `subject`
- `received_at`
- `operating_state_ko`
  - `새 일`
  - `기존 일에 붙이기`
  - `프로젝트 확인 보류`
  - `내용 애매 보류`
  - `개인/관리 보류`
  - `일 아님`
- `route_candidate`
  - 예: `P26-014`, `P00-000_INBOX`, `none/personal`, `none/promo`
- `route_confidence`
  - `exact`
  - `review`
  - `none`
- `thread_group`
- `priority_flags_ko`
  - 예: `오늘 처리`, `사람 병목`, `자료 확인`, `스레드 묶기`, `보류`
- `due_date`
  - normalized `YYYY-MM-DD` when a deterministic date hint exists
- `due_text`
  - text-only urgency marker such as `긴급` when no deterministic date exists
- `due_source`
  - `gateway_d_day`, `subject`, or `subject_text`
- `deadline_confidence`
  - `structured_d_day`, `subject_full_date`, `subject_short_year_date`, `subject_month_day`, or `text_only`
- `week_window_match`
  - boolean/null projection for the supplied `--week-start` and `--week-end` window
- `route_hint_candidates`
  - metadata-only project hints that are not strong enough to set `route_candidate`
  - example: broad AUV/AXV/mAUV/O-ring hints may expose `P25-057` and `P26-016` while leaving the actual route at `P00-000_INBOX`
- `attachment_count`
- `attachment_types`
  - sanitized type labels only, never filenames, URLs, paths, provider ids, or arbitrary upstream strings
- `classification_bucket`
- `next_action_ko`
- `owner_question_ko`
- `work_status`
- `refs`
- `boundary.raw_payload_copied`

### weekly visibility register row minimum fields

- `week_start`
- `week_end`
- `visibility_id`
- `source_kind`
  - `mail_work_priority`
  - `mailbox_event_only`
- `source_ref`
- `candidate_id`
  - `null` for event-only/quarantine rows that have not become mail candidates
- `bucket`
  - `mail`
  - `quarantine`
- `received_at`
- `due_date_or_window`
- `project_context`
  - exact project code or route hints
- `route_candidate`
- `route_confidence`
- `subject_hint`
- `attachment_count`
- `attachment_types`
  - sanitized type labels only, never filenames, URLs, paths, provider ids, or arbitrary upstream strings
- `blocked_attachment_count`
- `work_status`
- `why_visible`
- `next_action`
- `owner_question`
- `destination`
- `claim_ceiling`
- `promotion_allowed`

## status enum

- `candidate_pending`
  - candidate note 만 있고 gateway monster 가 아직 materialize 되지 않았다.
- `monster_pending_assignment`
  - gateway monster 는 있지만 project transfer 전이다.
- `assigned_to_project`
  - project monster 는 materialize 되었지만 mission/battle terminal 상태는 아직 아니다.
- `mission_blocked`
  - private mission surface 가 `blocked` 이고 terminal battle evidence 는 아직 없다.
- `mission_ready`
  - private mission surface 가 `ready` 이고 terminal battle evidence 는 아직 없다.
- `completed`
- `completed_with_follow_up`
- `blocked`
- `failed`
- `unknown`

## reconciliation order

1. `candidate_id` 와 `mail_source_ref` 는 `mail_candidate.source_event.event_id` 기준으로 찾는다.
2. gateway current state 는 `workspace intake inbox` 의 `inbox.json` / `monsters.json` 조합을 기준으로 읽는다.
3. project current state 는 `_workmeta/<project_code>/monsters/<monster_id>.yaml` 의 `source_monster_id` 또는 `monster_id` 를 기준으로 붙인다.
4. mission current state 는 project-local `missions/index.yaml` 의 `mission_ref` / `mission_id` 를 기준으로 붙인다.
5. terminal result 는 가능한 경우 latest `battle_events.jsonl` event 가 우선한다.
6. battle evidence 가 없더라도 terminal mission state 가 `completed` 또는 `failed` 면 completion mark 로 투영할 수 있다.

## v0 rules

1. completion mark 는 raw mail 이 아니라 battle evidence 또는 terminal mission state 에서만 나온다.
2. `mail_candidate` 는 pre-monster note 이므로 완료 truth owner 가 아니다.
3. 같은 mail source 에서 여러 monster 가 나오면 `candidate_id` 가 여러 row 에 반복될 수 있다.
4. project-local monster 가 실제로 materialize 되면 gateway current state 는 `transferred` 로 sync-back 되어야 한다.
5. projection 은 metadata-only summary 이다. `refs` 는 pointer surface 만 들고 raw payload 는 복사하지 않는다.
6. stale `latest.json` 을 읽을 수 있으므로 refresh surface 를 별도로 둔다.
7. priority projection 은 raw mail 본문, HTML, attachment payload, provider payload, secret 을 읽지 않고 candidate metadata 와 status projection 결과만 사용한다.
8. backlog age check 는 raw mail 본문, HTML, attachment payload, provider payload, subject/from 값, secret 을 출력하지 않고 candidate id/ref/status/time metadata 만 사용한다. 기본 CLI stdout 은 bounded display metadata(`display_mode`, `display_limit`, omitted counts)를 포함하며 full internal/latest report 와 `--full` 출력만 전체 row 배열을 유지한다.
9. exact `P26-014` route 는 subject 에 `기0탐`, `기ㅇ탐` 같은 `기X탐` 마스킹 패턴, `기뢰탐색음탐기`, `KVDS` 중 하나가 있을 때만 `route_confidence: exact` 로 둔다.
10. 실제 회사 업무처럼 보이지만 project code 가 확정되지 않았거나 project-less 회사 일반업무로 봐야 하는 후보는 `P00-000_INBOX` + `route_confidence: review` 로 둔다.
11. personal/security/finance/billing/subscription/promo/terms 류는 project monster 나 `P00-000_INBOX` 회사 일반업무로 만들지 않고 `개인/관리 보류` 또는 `일 아님` 으로 둔다. owner 가 회사 admin 업무로 명시한 경우만 `P00-000_INBOX` 로 보낼 수 있다.
12. priority `thread_group` 은 subject metadata 의 deterministic matching 으로만 만든다. current-default group 은 `센서 일정/status`, `P978 시운전절차서`, `Q4 진행 독려`, `환경시험절차서`, `P23-043 접근권한`, `해경/시험 협조`, `내부 자산/admin` 이다.
13. priority projection 은 자동 발송, 자동 mission 생성, 자동 completion, 전체 후보 자동 filing 을 하지 않는다.
14. terminal `work_status` 인 `completed`, `completed_with_follow_up`, `blocked`, `failed` 는 완료 truth 를 우선한다. priority view 에서는 새 행동 플래그를 붙이지 않고 뒤쪽에 둔다.
15. priority due-date parsing 은 deterministic subject/date metadata 와 gateway `d_day` 만 사용한다. mail body, HTML, attachment payload, provider payload 는 읽지 않는다.
16. `route_hint_candidates` 는 weekly planning visibility signal 이며 project assignment truth 가 아니다. exact route 가 안전하지 않으면 `route_candidate: P00-000_INBOX` 로 남긴다.
17. weekly visibility register 는 다음 주 확정 업무표가 아니라 미분류/미승격 mail-derived work 를 주간 계획에서 빠뜨리지 않기 위한 private 장부다.
18. event-only/quarantine row 는 `candidate_id: null`, `promotion_allowed: false`, `claim_ceiling: observed` 로 둔다. owner 가 source mailbox/event pointer 를 직접 확인하기 전까지 project monster 로 승격하지 않는다.
19. weekly visibility register 는 subject/date/attachment count/type/source pointer 같은 whitelist field 만 기록한다. mail body, HTML, raw provider payload, attachment filename, attachment URL, local path, provider attachment id, secret 값은 쓰지 않는다.
20. weekly visibility register 의 attachment type 은 allowlist label 로 sanitize 한다. unknown upstream type/mime 값은 `attachment_metadata` 또는 coarse `mime_*` label 로 낮춘다.
21. weekly visibility register output path 는 `_workmeta/P00-000_INBOX/reports/triage/**` 아래에만 쓸 수 있다.

## commands

```bash
npm run guild-hall:gateway:mail-work:refresh
npm run guild-hall:gateway:mail-work:list
npm run guild-hall:gateway:mail-candidate:backlog
npm run guild-hall:gateway:mail-work:priority:refresh
npm run guild-hall:gateway:mail-work:priority:list
npm run guild-hall:gateway:mail-work:weekly-visibility -- --week-start 2026-05-25 --week-end 2026-05-31
node guild_hall/gateway/cli.mjs import-deadline-watch
node guild_hall/gateway/cli.mjs register-mail-tasks
npm run guild-hall:gateway:deadline-watch:validate
```

priority list 는 `--work-status`, `--operating-state`, `--route-candidate`, `--route-confidence`, `--thread-group`, `--priority-flag` 로 latest priority projection 을 필터링할 수 있다.
`--week-start <YYYY-MM-DD> --week-end <YYYY-MM-DD>` 를 주면 각 row 의 `week_window_match` 를 계산한다.
`--week-window-only` 를 함께 주면 deterministic `due_date` 가 해당 주간 창 안에 들어온 row 만 출력한다.

weekly visibility register 는 같은 week window 를 필수로 받으며, priority row 와 mailbox event-only fallback row 를 합쳐 `_workmeta/P00-000_INBOX/reports/triage/unresolved_weekly_visibility_register.md` 를 갱신한다.

deadline-watch import 는 기본 dry-run 이며, deterministic subject/date metadata
또는 gateway `d_day` 에서 나온 `due_date` 만 project-local
`deadline_watch/deadline_register.csv` row 후보로 만든다. 실제 쓰기는
`--apply` 를 명시해야 하며, review/ambiguous route 는 P00 unresolved inbox 로
간다.

deadline-watch validator 는 project-local deadline register 와 reminder event
log 의 header, enum, project folder consistency, `raw_payload_copied=false`,
raw/secret marker 부재를 검사한다.

mail task register 는 같은 `mail_work_priority` latest JSON 을 읽어
metadata-safe, non-terminal, exact project route 만 project-local
`reports/open_actions/open_action_register.md` row 후보로 만든다. 기본은
dry-run 이며, 실제 쓰기는 `--apply` 가 필요하다. `P00-000_INBOX`,
`route_confidence: review`, `none/personal`, `none/promo`, terminal work, and
raw-boundary rows remain owner-review or skipped and must not write project
truth. `--notify` only calls the existing town_crier gateway `mail_received`
policy after `--apply` writes new rows; no live Telegram send, env read, raw
mail read, private metadata commit, or push is performed by this command.

## sample

```json
{
  "schema_version": "soulforge.gateway.mail_work_status.v1",
  "kind": "mail_work_status_projection",
  "generated_at": "2026-05-20T02:10:00.000Z",
  "count": 3,
  "counts": {
    "candidate_pending": 1,
    "monster_pending_assignment": 1,
    "completed_with_follow_up": 1
  },
  "entries": [
    {
      "mail_source_ref": "mail_evt_001",
      "candidate_id": "mail_candidate_mail_evt_001",
      "inbox_id": null,
      "monster_id": null,
      "project_code": null,
      "project_monster_ref": null,
      "mission_id": null,
      "mission_ref": null,
      "battle_event_id": null,
      "terminal_result": null,
      "work_status": "candidate_pending",
      "status_reason": "candidate status pending_review",
      "refs": {
        "candidate_ref": "guild_hall/state/gateway/mail_candidate/queue/pending/mail_candidate_mail_evt_001.json"
      },
      "updated_at": "2026-05-20T02:00:00.000Z",
      "boundary": {
        "raw_payload_copied": false
      }
    }
  ],
  "boundary": {
    "raw_payload_copied": false
  }
}
```

## priority sample

```json
{
  "schema_version": "soulforge.gateway.mail_work_priority.v1",
  "kind": "mail_work_priority_projection",
  "generated_at": "2026-05-20T02:10:00.000Z",
  "source_schema_version": "soulforge.gateway.mail_work_status.v1",
  "count": 1,
  "counts": {
    "새 일": 1
  },
  "route_counts": {
    "P26-014": 1
  },
  "entries": [
    {
      "candidate_id": "mail_candidate_mail_evt_001",
      "mail_source_ref": "mail_evt_001",
      "subject": "[KVDS] Synthetic source packet request",
      "received_at": "2026-05-20T02:00:00.000Z",
      "operating_state_ko": "새 일",
      "route_candidate": "P26-014",
      "route_confidence": "exact",
      "thread_group": "subject:synthetic source packet request",
      "priority_flags_ko": ["오늘 처리", "자료 확인"],
      "next_action_ko": "P26-014 큐에서 오늘 처리 여부와 기존 작업 연결 여부를 확인한다.",
      "owner_question_ko": "P26-014의 새 업무로 둘까요, 기존 업무에 붙일까요?",
      "work_status": "candidate_pending",
      "refs": {
        "candidate_ref": "guild_hall/state/gateway/mail_candidate/queue/pending/mail_candidate_mail_evt_001.json"
      },
      "boundary": {
        "raw_payload_copied": false
      }
    }
  ],
  "boundary": {
    "raw_payload_copied": false
  }
}
```

## 관련 문서

- [`MAIL_CANDIDATE_QUEUE_V0.md`](../../../docs/architecture/workspace/MAIL_CANDIDATE_QUEUE_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](../../../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`DUNGEON_ASSIGNMENT_REQUEST_V0.md`](../../../docs/architecture/workspace/DUNGEON_ASSIGNMENT_REQUEST_V0.md)
- [`MAIL_TO_MISSION_HANDOFF_V0.md`](../../../docs/architecture/workspace/MAIL_TO_MISSION_HANDOFF_V0.md)
- [`BATTLE_LOG_STORAGE_PLAN.md`](../../../docs/architecture/workspace/BATTLE_LOG_STORAGE_PLAN.md)

## ASSUMPTIONS

- current-default v0 는 local-only projection 과 reconciliation 을 먼저 잠그고, explicit completion mutation command 는 별도 slice 로 추가한다.
- battle event 의 latest terminal truth 는 project-local monthly `battle_events.jsonl` 기준으로 읽는다.

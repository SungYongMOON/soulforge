# MONSTER_CANDIDATE_CONTRACT_V0

## 목적

- 이 문서는 current-default v0 에서 `mail intake -> monster candidate` 변환을 어디에 어떤 최소 필드로 남길지 잠그는 workspace contract draft 다.
- `monster candidate` 판정 규칙과 판정 근거를 `battle_log` 에서 분리하는 것이 목적이다.

## 한 줄 정의

- `monster candidate` 는 메일 원본을 그대로 들고 있는 객체가 아니라, 메일에서 지금 붙들 가치가 있는 bounded work item 만 추려낸 intake-side working object 다.

## 경계

- raw mail body, attachment, mailbox cursor, live mailbox state 는 `_workspaces/<project_code>/.project_agent/**` 아래에 남긴다.
- `monster candidate` note 는 intake 판정과 routing hint 를 남기는 local-only surface 다.
- `battle_log` 는 전투 배치와 전투 결과를 남기는 surface 이며, candidate 판정 규칙 owner 가 아니다.
- `battle_event` 나 `battle_log` 가 candidate snapshot 일부를 복사해 들 수는 있지만, 상세 판정 이유와 규칙은 `monster candidate` 쪽에서 소유한다.

## 권장 경로

- `_workspaces/<project_code>/.project_agent/log/monster_candidate/latest.md`
- `_workspaces/<project_code>/.project_agent/log/monster_candidate/daily/YYYY-MM-DD.md`

## v0 최소 필드

- `candidate_id`
- `source_kind`
  - v0 기본값: `mail`
- `source_ref`
- `mailbox_id`
- `received_at`
- `intake_owner`
- `monster_family`
  - family 를 모르면 `unknown_monster`
- `request_summary`
- `project_code`
- `stage`
- `automation_possibility`
- `judgment_reason`
- `mission_handoff_status`
  - 예: `queued`, `drafted`, `blocked`
- `tracked_mission_ref`
  - 있으면 `.mission/<mission_id>/mission.yaml`

## 최소 변환 규칙

1. 메일 원본을 로컬 payload surface 에 저장한다.
2. 메일에서 bounded work item 1건 이상을 추린다.
3. 각 work item 에 `project_code`, `stage`, `automation_possibility` 를 붙인다.
4. 판정 이유는 candidate note 에 적는다.
5. 그 다음에만 `.mission/**` draft handoff 로 넘어간다.

## battle_log 와의 분리 규칙

- `battle_log` 에는 아래를 쓰지 않는다.
  - monster candidate 판정 규칙
  - intake-side 분류 이유 상세
  - raw mail 요약 전체
- `battle_log` 에는 아래만 남긴다.
  - `source_ref`
  - `mission_id`
  - `candidate_note` 참조
  - battle assignment
  - battle result

## sample candidate note

```yaml
candidate_id: monster_candidate_demo_project_2026_03_19_001
source_kind: mail
source_ref: synthetic-mail-2026-03-19-001
mailbox_id: synthetic_inbox
received_at: 2026-03-19T08:40:00+09:00
intake_owner: guild_master
monster_family: unknown_monster
request_summary: demo 프로젝트 kickoff 상태 자료 갱신과 stage 문구 확인 요청
project_code: demo_project
stage: 1-1 kickoff alignment
automation_possibility: manual_assist_needed
judgment_reason: 요청 범위는 bounded 하지만 stage wording 과 최신 attachment version 확인이 먼저 필요하다.
mission_handoff_status: drafted
tracked_mission_ref: .mission/play_loop_mail_intake_demo_project_001/mission.yaml
```

## 연결 문서

- [`MONSTER_FAMILY_LINEUP_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/MONSTER_FAMILY_LINEUP_V0.md)
- [`MAIL_TO_MISSION_HANDOFF_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/MAIL_TO_MISSION_HANDOFF_V0.md)
- [`BATTLE_LOG_STORAGE_PLAN.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/BATTLE_LOG_STORAGE_PLAN.md)
- [`PLAY_LOOP_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/.mission/PLAY_LOOP_V0.md)

## ASSUMPTIONS

- v0 에서는 정식 `monster canon` 보다 먼저, intake-side candidate note 분리가 더 중요하다고 본다.
- candidate note 는 local-only surface 이며 tracked repo 에 raw runtime truth 를 새로 소유하지 않는다.

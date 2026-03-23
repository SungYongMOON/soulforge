# Battle Log Chain Example

> Public-safe chain example only.
> The values below show how one gateway monster is re-read inside a project-side battle log summary.

- Project: `demo_project`
- Stage: `PDR`
- Mission: `play_loop_mail_intake_demo_project_001`
- Source ref: `pdr_brief_chain_demo_001`
- Monster id: `pdr_brief_chain_demo_001_001`
- Monster name: `green_dragon`
- Canonical objective: `Complete and submit the PDR package.`
- Localized objective: `PDR 패키지를 마무리하고 제출합니다.`

## Battle Event Snapshot

```json
{
  "event_id": "battle-2026-03-20-0007",
  "occurred_at": "2026-03-20T15:40:00+09:00",
  "mission_id": "play_loop_mail_intake_demo_project_001",
  "project_code": "demo_project",
  "source_kind": "mail",
  "source_ref": "pdr_brief_chain_demo_001",
  "stage": "PDR",
  "party_id": "guild_master_cell",
  "unit_id": "gateway_operator",
  "automation_possibility": "manual_assist_needed",
  "battle_mode": "manual_assist",
  "result": "completed_with_follow_up",
  "intervention_count": 1,
  "next_action_note": "PDR 승인 전 최종 제출본 확인"
}
```

## Human Read Summary

- 오늘 `green_dragon` 1마리를 처리했다.
- 할일은 `PDR 패키지를 마무리하고 제출합니다.` 로 유지했다.
- 기한은 `3/24(화) · D-4` 로 읽혔고, 오늘 처리 결과는 `completed_with_follow_up` 로 기록했다.
- 후속 조치는 `PDR 승인 전 최종 제출본 확인` 한 줄만 남겼다.

## Chain Check

1. gateway alert 에서는 owner-facing brief 로 읽힌다.
2. battle log 에서는 같은 `monster_id` 와 `objective` 의미를 유지한 채 전투 결과만 추가된다.
3. morning report 는 이 battle log 를 다시 owner-facing 아침 브리핑으로 요약한다.

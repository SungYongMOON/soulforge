# SOULFORGE_ACTIVITY_LOG_V0

## 목적

- 이 문서는 Soulforge 전체에서 사람이 무엇을 했는지 한 파일만 보고 최근 맥락을 따라갈 수 있는 cross-project activity surface 를 고정한다.
- 각 owner 자리에 이미 있는 상세 로그를 대체하지 않고, 사람과 AI 가 빠르게 이어받기 위한 recent-context layer 만 정의한다.

## 한 줄 정의

- Soulforge 전체 활동 로그는 active runtime 기준 `guild_hall/state/operations/soulforge_activity/**` 에 두고, 다른 PC 연속성은 `private-state/` mirror 로 복원한다.

## owner 경계

- `guild_hall/state/operations/soulforge_activity/**`
  - Soulforge 전체 작업의 최근 맥락과 요약 이력 owner
- `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md`
  - 프로젝트 착수 단계 세부 순서 owner
- `_workmeta/<project_code>/log/battle_log/**`
  - mission/battle execution trace owner
- `_workspaces/<project_code>/020_MGMT/027_수신이력_이동이력/**`
  - project-side mail receive / file move provenance owner

전체 활동 로그는 위 상세 owner 들의 내용을 다시 요약해 이어받기 쉽게 만드는 보조 surface 이다.

## 저장 위치

```text
guild_hall/state/operations/soulforge_activity/
├── latest_context.json
├── log/
│   └── YYYY/
│       └── YYYY-MM-DD/
│           └── HHMM-<automation-id>.md
└── events/
    └── YYYY/
        └── YYYY-MM.jsonl
```

- `latest_context.json`
  - 최근 이어받기에 필요한 작은 context cache
  - 사람이 통째로 읽어도 되는 크기로 유지한다
- `events/YYYY/YYYY-MM.jsonl`
  - append-only event ledger
  - 장기 보관용 원본이며, 기본적으로는 마지막 몇 건만 읽는다
- `log/YYYY/YYYY-MM-DD/HHMM-<automation-id>.md`
  - night_watch 점검/초안의 상세 실행 결과
  - 사람이 읽는 markdown report 와 draft note 를 둔다

## 기본 읽기 규칙

1. 새 PC 또는 새 session 은 먼저 `latest_context.json` 만 읽는다.
2. `latest_context.json` 으로 부족하면 현재 월 `events/YYYY/YYYY-MM.jsonl` 마지막 몇 건만 추가로 읽는다.
3. 그래도 부족할 때만 사용자가 더 과거 범위를 지시해 context 를 확장한다.
4. 기본 동작은 `전체 파일 재독 금지 -> recent window 우선` 이다.

## 권장 recent window

- `latest_context.json`
  - 최근 8~12건 요약
- `events/YYYY/YYYY-MM.jsonl`
  - 기본 추가 조회는 마지막 8건

## `latest_context.json` 최소 필드

- `version`
- `updated_on`
- `default_recent_count`
- `open_threads`
- `recent_entries`

`recent_entries[]` 는 아래 필드를 권장한다.

- `entry_id`
- `date`
- `scope`
- `project_code`
- `summary`
- `refs`
- `next_action`
- `carry_forward`

## `events/*.jsonl` 최소 필드

- `entry_id`
- `date`
- `scope`
- `project_code`
- `action`
- `summary`
- `refs`
- `detail_owner`
- `next_action`
- `carry_forward`

## `log/**/*.md` 권장 필드

- `automation_id`
- `run_at`
- `summary`
- `findings` 또는 `draft`
- `refs`
- `next_action`
- `carry_forward`

## 기록 규칙

1. 중복은 허용한다.
2. 자세한 설명보다 짧은 summary 와 주소 수준의 `refs` 를 우선한다.
3. 상세 내용은 각 owner surface 에 남기고, activity log 에는 요약만 남긴다.
4. raw mail body, secret, token, session 같은 민감값은 남기지 않는다.
5. 다른 PC 나 다음 session 이 꼭 기억해야 하는 항목은 `carry_forward: true` 로 표시한다.
6. 최근 맥락 재구성이 끝나면 `latest_context.json` 을 갱신하되, `events/*.jsonl` 원본은 지우지 않는다.
7. night_watch 점검 결과와 `Fix Draft` 초안은 `log/**/*.md` 에 저장하고, 월별 `events/*.jsonl` 에는 요약만 남긴다.
8. `log/**/*.md` 는 tracked docs/code 의 자동 수정 기록이 아니라, 점검 결과와 draft-only 제안의 저장 surface 로 사용한다.

## automation writer 규칙

1. active truth 는 이 PC 의 실제 Soulforge root 아래 `guild_hall/state/operations/soulforge_activity/**` 이다.
2. Codex automation 이 임시 worktree 에서 돌더라도, writer 는 worktree-local copy 가 아니라 active absolute root 를 찾아 그 경로에 기록한다.
3. worktree 안에 같은 상대 경로가 있더라도 그것은 canonical sink 가 아니다.

## private-state mirror 규칙

- active truth 는 계속 `guild_hall/state/operations/soulforge_activity/**` 에 둔다.
- 다른 PC 로 넘길 continuity subset 은 `private-state/guild_hall/state/operations/soulforge_activity/**` 로 mirror copy 한다.
- 다른 PC 에서는 `private-state` pull 후 같은 경로로 restore 한다.

## 관련 경로

- [`../../../guild_hall/README.md`](../../../guild_hall/README.md)
- [`GUILD_HALL_MODEL_V0.md`](GUILD_HALL_MODEL_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../bootstrap/UPDATE_MANUAL_V0.md`](../bootstrap/UPDATE_MANUAL_V0.md)
- [`../bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md`](../bootstrap/OWNER_HANDOFF_CHECKLIST_V0.md)

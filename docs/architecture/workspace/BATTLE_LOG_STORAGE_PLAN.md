# BATTLE_LOG_STORAGE_PLAN

## 목적

- 이 문서는 local-only battle log 를 장기 보관하기 위한 workspace contract draft 다.
- source of truth 는 계속 `_workmeta/<project_code>/**` 아래에 둔다.
- tracked repo 에 raw battle event 를 끌어오지 않는다.
- intake-side monster candidate 판정 규칙과 판정 이유는 이 문서의 owner 범위가 아니다.

## 문제 정의

- event 마다 `.md` 파일 1개를 만드는 방식은 v0 dry-run 확인에는 편하지만, 장기 운영에는 과하다.
- 업무 이벤트가 하루 수십 건만 돼도 1년 기준으로 수천~수만 개 markdown 파일이 쌓인다.
- `.md per event` 는 append 가 아니라 file explosion 을 만들고, 검색/집계/rollup/백업/압축이 전부 불편해진다.
- 사람 읽기에는 markdown 이 좋지만, 기계 적재용 원천으로는 구조화가 약하고 누적 쓰기에도 비효율적이다.

## v0 기본안

- 사람 읽는 문서:
  - `_workmeta/<project_code>/log/battle_log/latest.md`
  - `_workmeta/<project_code>/log/battle_log/daily/YYYY-MM-DD.md`
  - 필요 시 `_workmeta/<project_code>/log/battle_log/weekly/YYYY-Www.md`
- 기계 적재용 원천:
  - `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl`

## 왜 이 안을 기본으로 고르는가

- `jsonl` 은 append-only 쓰기에 맞다.
- 한 줄이 한 event 라서 중간 실패가 나도 복구가 쉽다.
- shell, Python, jq, pandas, SQLite import 같은 후속 처리에 바로 연결된다.
- 월 단위 partition 을 두면 1년치 누적에도 파일 수가 과하게 늘지 않는다.
- 사람은 summary markdown 을 읽고, 기계는 `jsonl` 원천을 읽는 역할 분리가 분명하다.

## v0 battle_event 최소 스키마 초안

- `battle_event` 는 mission 이후 전투 기록으로 본다.
- raw `battle_event` 는 mission 내부 개별 `skill` 마다 쓰지 않고, mission-level terminal battle outcome 시점에 1건 append 하는 것을 기본으로 본다.
- current-default v0 에서 `mission terminal` 은 `required workflow steps done + mission-level battle_event persisted + no open blocker` 로 본다.
- monster candidate 판정 상세와 intake-side 분류 이유는 별도 candidate note 에 두고, battle side 에는 필요한 provenance 만 복사한다.
- raw event 의 canonical key 는 `project_code` 다.
- `dungeon` 은 raw event 필드가 아니라 표시/파생 전용 값으로 둔다.
- `party_id` 와 `unit_id` 는 둘 다 유지한다.
- `loop_id` 는 provenance 성격의 선택 필드다.
- `next_action_note` 는 후속 조치를 짧게 남기는 선택 필드다.
- `follow_up_needed` 는 `result` 와 의미가 겹치므로 v0 raw event 에서는 제거한다.

### 필수 / 선택 / 파생

- 필수:
  - `event_id`
  - `occurred_at`
  - `mission_id`
  - `project_code`
  - `stage`
  - `source_kind`
  - `source_ref`
  - `party_id`
  - `unit_id`
  - `automation_possibility`
  - `battle_mode`
  - `result`
  - `intervention_count`
- 선택:
  - `loop_id`
  - `next_action_note`
- 파생 / 표시:
  - `dungeon`

```json
{
  "event_id": "battle-2026-03-19-0001",
  "occurred_at": "2026-03-19T08:40:00+09:00",
  "mission_id": "author_pptx_autofill_conversion_001",
  "project_code": "demo_project",
  "loop_id": "PLAY_LOOP_V0",
  "source_kind": "mail",
  "source_ref": "synthetic-mail-2026-03-19-001",
  "stage": "1-1 kickoff alignment",
  "party_id": "guild_master_cell",
  "unit_id": "guild_master",
  "automation_possibility": "low_intervention_candidate",
  "battle_mode": "manual_assist",
  "result": "completed_with_follow_up",
  "intervention_count": 1,
  "next_action_note": "status deck refresh draft review"
}
```

### 필드 설명

| 필드 | 구분 | 의미 | v0 에서 필요한 이유 |
| --- | --- | --- | --- |
| `event_id` | 필수 | 전투 이벤트 1건의 고유 ID | 특정 전투를 다시 찾고 다른 기록과 연결하기 위해 |
| `occurred_at` | 필수 | 전투가 실제로 일어난 시각 | 일/주/월 집계와 정렬의 기준이 되기 때문에 |
| `mission_id` | 필수 | 이 전투가 속한 mission ID | battle_event 를 mission 이후 기록으로 고정하기 위해 |
| `project_code` | 필수 | 내부 canonical 프로젝트 식별자 | local worksite, 집계, rollup 의 공통 key 로 쓰기 위해 |
| `stage` | 필수 | 프로젝트 안의 현재 단계 또는 마일스톤 | 어느 구간에서 전투가 일어났는지 보기 위해 |
| `source_kind` | 필수 | 입력원 종류 | 현재는 `mail` 같은 intake 종류를 구분하기 위해 |
| `source_ref` | 필수 | 원본 입력의 식별값 | 어떤 메일이나 요청에서 시작됐는지 추적하기 위해 |
| `party_id` | 필수 | 실제 전투에 투입된 파티 ID | 파티 효율과 조합 분석을 위해 |
| `unit_id` | 필수 | 대표 수행 unit ID | 실제 처리 주체를 로그에 남기기 위해 |
| `automation_possibility` | 필수 | candidate 단계에서 이미 정해진 자동화 가능성 snapshot | battle 이후에도 어떤 종류의 개입이 예상됐는지 provenance 로 읽기 위해 |
| `battle_mode` | 필수 | 실제 수행 방식 | 수동, 보조, 제한적 자동 등 실행 방식을 구분하기 위해 |
| `result` | 필수 | 전투 결과 상태 | 완료, 후속 필요, 차단, 실패를 단일 축으로 남기기 위해 |
| `intervention_count` | 필수 | 사람 개입 횟수 | 현재 v0 의 핵심 지표이기 때문에 |
| `loop_id` | 선택 | 어떤 운영 루프에서 발생했는지 | `PLAY_LOOP_V0`, `nightly_sweep_v0` 같은 provenance 를 남기기 위해 |
| `next_action_note` | 선택 | 다음에 다시 볼 짧은 행동 메모 | boolean 대신 실제 후속 행동을 남기기 위해 |
| `dungeon` | 파생 / 표시 | 프로젝트를 세계관 언어로 보여주는 값 | raw key 가 아니라 UI 와 리포트 표시에서 파생하기 위해 |

### enum 후보

- `automation_possibility`
  - `low_intervention_candidate`
  - `manual_assist_needed`
- `battle_mode`
  - `manual`
  - `manual_assist`
  - `limited_auto`
- `result`
  - `completed`
  - `completed_with_follow_up`
  - `blocked`
  - `failed`

## 조회 전략

- 최신 상태 확인:
  - `battle_log/latest.md` 를 본다.
- 하루 회고:
  - `battle_log/daily/YYYY-MM-DD.md` 를 본다.
- 주간 경향:
  - `battle_log/weekly/YYYY-Www.md` 를 본다.
- 상세 집계:
  - `log/events/YYYY/MM/battle_events.jsonl` 을 project-local script 나 notebook 으로 읽는다.

## rollup 전략

- event 발생 시:
  - current-default v0 `mission terminal` 조건이 충족된 경우에만 `battle_events.jsonl` 에 한 줄 append
  - `battle_log/latest.md` 갱신
- 하루 마감 시:
  - 해당 날짜의 `daily/YYYY-MM-DD.md` 생성 또는 갱신
- 주간 정리 시:
  - `daily` 를 읽어 `weekly/YYYY-Www.md` 생성
- 아침 브리핑 시:
  - raw event 전체를 읽기보다, 전일 `daily` 와 필요한 지표만 읽어 `morning_report`를 만든다.

## 보관 전략

- 기본 보관 단위는 월 partition 이다.
- raw `jsonl` 은 최소 1년 이상 유지한다.
- 90일이 지난 월 partition 은 필요하면 `jsonl.gz` 로 압축할 수 있다.
- markdown summary 는 작기 때문에 일/주 단위로 유지해도 부담이 적다.
- 더 큰 규모로 늘면 오래된 `jsonl` 을 SQLite 로 import 한 archive 를 추가할 수 있다. 다만 v0 기본 원천은 `jsonl` 로 유지한다.

## 후보안

### 후보안 A — SQLite 단일 저장소

- 예시 경로:
  - `_workmeta/<project_code>/log/events/battle_events.sqlite`
- 장점:
  - 조건 검색과 집계가 강하다.
  - 수십만 event 에서도 query 성능이 좋다.
- 단점:
  - 사람이 바로 열어보기 어렵다.
  - append-only 원천 파일 느낌이 약하다.
  - v0 에는 schema migration 과 tool dependency 부담이 있다.

### 후보안 B — JSONL only

- 예시 경로:
  - `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl`
- 장점:
  - 가장 단순하다.
  - ingest 와 backup 이 쉽다.
- 단점:
  - 사람용 요약이 없으면 매일 읽기 어렵다.
  - daily briefing 과 long-term review 를 위해서는 결국 summary render 가 추가로 필요하다.

## 권장 결론

- v0 기본안은 `markdown summary + monthly jsonl event stream` hybrid 구조로 간다.
- 즉, 사람은 `battle_log/latest.md` 와 `daily/weekly markdown` 을 읽고, 기계는 `log/events/YYYY/MM/battle_events.jsonl` 을 읽는다.
- `.md per event` 는 피하고, `.md per day/week` 와 `jsonl per month` 조합으로 1년치 누적을 버틴다.
- 상세 candidate 판정은 `battle_log/` 가 아니라 별도 `monster_candidate/` note 에 둔다.

## ASSUMPTIONS

- 현재 Soulforge 의 battle log raw truth 는 tracked canon 이 아니라 local-only worksite 아래에 두는 방향을 유지한다.
- v0 에서는 event query 보다 append 안정성과 사람이 읽는 summary 를 더 우선한다.
- SQLite 는 충분히 유력한 후보지만, 첫 dogfood 단계에서는 운영 복잡도를 낮추기 위해 기본안에서 제외한다.

## 관련 예시

- chain sample: [`examples/demo_project/_workmeta/battle_log_chain_example.md`](examples/demo_project/_workmeta/battle_log_chain_example.md)
- 같은 monster 의 gateway brief: [`examples/guild_hall/state/town_crier/queue/pending/notify_pdr_brief_chain_demo_001.json`](examples/guild_hall/state/town_crier/queue/pending/notify_pdr_brief_chain_demo_001.json)


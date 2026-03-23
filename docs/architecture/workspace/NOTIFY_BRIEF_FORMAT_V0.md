# NOTIFY_BRIEF_FORMAT_V0

## 목적

- 이 문서는 owner-facing Telegram brief 의 표시 규칙을 얇게 잠근다.
- 정본은 계속 구조화된 상태 필드에 두고, `town_crier` 가 만드는 문자열은 그 상태를 읽기 좋게 투영한 formatter surface 로 본다.

## 한 줄 정의

- `monster_created` brief 는 원문 provenance 를 잃지 않으면서, 사람이 바로 triage 할 수 있게 만든 owner-facing 행동 브리프 다.

## 정본과 표시의 역할 분리

- `subject`
  - 메일 원문 제목 snapshot
  - 알림에서는 `제목` 으로 그대로 보여준다.
- `body_excerpt`
  - 메일 본문 snapshot
  - 알림에서는 `요약` 으로 짧게 재구성하되, 몬스터별 `기한` 과 중복되는 날짜 꼬리는 가능하면 제거한다.
- `objective`
  - canonical intent
  - intake / battle / report 사이에서 의미를 유지해야 하는 기준 필드다.
- `objective_ko`
  - localized presentation override
  - 있으면 owner-facing 알림과 briefing 에서 우선 사용한다.
- `d_day`
  - canonical due input
- `due_state`
  - 기계 판정용 due 상태 snapshot
- `from`
  - 정규화된 발신자 목록
- `attachment_refs`
  - 첨부파일 존재와 개수 계산의 기준 입력

## v0 `monster_created` 표시 순서

1. `제목`
2. `요약`
3. `발신자`
4. `첨부파일`
5. `몬스터 수`
6. `몬스터 정보`
   - 이름
   - 할일
   - 기한
   - 긴급도

## v0 표시 규칙

- `제목`
  - raw `subject` 를 그대로 사용한다.
- `요약`
  - `body_excerpt` 에서 만든다.
  - 몬스터별 `기한` 줄이 따로 있으면, 같은 날짜/마감 표현을 다시 길게 반복하지 않는다.
- `발신자`
  - 첫 발신자 이름 우선
  - 이름이 없으면 email/address
  - 둘 이상이면 `홍길동 외 1`
- `첨부파일`
  - `attachment_refs` count 기준
- `할일`
  - `objective_ko` 가 있으면 우선
  - 없으면 `objective` 를 localized sentence 로 표시
- `기한`
  - `d_day` 가 있으면 `3/24(화) · D-3` 같이 표시
  - 없으면 `기한 미정`
- `긴급도`
  - `due_state` / `d_day` 기준 파생 표시
  - 없으면 `보통`

## 결측치 기본값

- `subject` 없음
  - `제목` 줄 생략
- `body_excerpt` 없음
  - `요약` 줄 생략
- `from` 비어 있음
  - `발신자: 미확인`
- `attachment_refs` 비어 있음
  - `첨부파일: 없음`
- `objective_ko`, `objective` 둘 다 없음
  - `할일: 미정`
- `d_day` 없음
  - `기한: 기한 미정`
- `긴급도` 계산 불가
  - `긴급도: 보통`

## cross-surface 일관성 규칙

- 같은 `monster_id` 는 `알림 -> battle_log -> morning_report` 에서 같은 의미로 읽혀야 한다.
- 알림은 몬스터 의미를 새로 정의하지 않고, 정본 필드의 owner-facing projection 만 제공한다.
- `battle_log` 와 `morning_report` 는 `objective` 의미를 바꾸지 않고, 필요한 경우만 더 짧게 요약한다.

## 관련 예시

- gateway notify sample
  - [`examples/guild_hall/state/town_crier/queue/pending/notify_pdr_brief_chain_demo_001.json`](examples/guild_hall/state/town_crier/queue/pending/notify_pdr_brief_chain_demo_001.json)
- battle log sample
  - [`examples/demo_project/_workmeta/battle_log_chain_example.md`](examples/demo_project/_workmeta/battle_log_chain_example.md)
- morning report sample
  - [`examples/demo_project/_workmeta/morning_project_report_chain_example.md`](examples/demo_project/_workmeta/morning_project_report_chain_example.md)

## ASSUMPTIONS

- v0 에서는 Telegram brief 를 owner-facing primary surface 로 보고, 다른 채널도 같은 formatter 원칙을 재사용할 수 있다고 본다.
- `objective` 를 canonical intent 로 유지하고, `objective_ko` 는 표시용 localized override 로 본다.


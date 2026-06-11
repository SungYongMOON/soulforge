# Triage Board v0

## 목적

- Triage Board 는 `P00-000_INBOX` 와 pending monster 중 라우팅 결정이 필요한
  항목이 얼마나 쌓였는지 한 화면에서 보여주는 read-only 작전판 보조 view 다.
- playable loop 의 진입 게이트인 `monster -> (triage) -> mission` 구간에서
  "어디로 보낼지 아직 안 정한 일" 의 양과 나이를 보이게 만드는 것이 목적이다.
- 이 문서는 projection field 계약과 보안 경계를 고정한다. 구현은 snapshot
  producer 확장으로 수행한다.

## owner

- contract: 이 문서 (`docs/architecture/guild_hall/TRIAGE_BOARD_V0.md`)
- producer: `guild_hall/snapshot` (Operation Board projection 확장)
- projection 위치: `operation_board.sections.triage_board`
- triage 결정 truth: `_workmeta/P00-000_INBOX/reports/triage/triage_register.md`
  (private metadata ledger, 이 계약의 출력에 본문을 복제하지 않는다)
- UI consumer: 작전판 (Mission Board 옆 보조 카운트/age 신호)

## 입력

1. snapshot 에 이미 들어온 sanitized field 만 재사용한다.
   - `gateway.pending_monsters` 의 `needs_identification`, `open_intake`
     display group total
2. `_workmeta/P00-000_INBOX/reports/triage/triage_register.md` 는
   metadata-only 신호만 읽는다.
   - 표 row 수
   - `Destination` 열이 리터럴 `TBD` 인 row 수
   - `TBD` row 중 가장 오래된 `Date` 값
   - 파일 존재 여부와 mtime
3. 항목 제목, Decision/Next action 텍스트, 메일 ref, 회사명/과제명 같은
   자유 텍스트는 v0 projection 으로 가져오지 않는다.

## 출력 계약

`operation_board.sections.triage_board`:

| field | 의미 |
| --- | --- |
| `schema_version` | `soulforge.triage_board.v0` |
| `register_present` | triage register 파일 존재 여부 |
| `register_row_count` | register 표 전체 row 수 |
| `tbd_destination_count` | `Destination` 이 `TBD` 인 row 수 |
| `routed_count` | `register_row_count - tbd_destination_count` |
| `oldest_tbd_date` | `TBD` row 중 가장 오래된 date (`YYYY-MM-DD`) 또는 null |
| `oldest_tbd_age_days` | snapshot 생성 시각 기준 위 date 의 경과 일수 또는 null |
| `stale_tbd_count` | `TBD` 이면서 14일 초과 경과한 row 수 |
| `pending_monster_triage_total` | monster gate `needs_identification` + `open_intake` total 의 mirror 합 |

- 모든 field 는 count, boolean, date, null 만 허용한다. 자유 텍스트 field 는
  없다.
- `pending_monster_triage_total` 은 `sections.monster_gate.groups` 의 해당
  group `total` 을 재계산 없이 합산한 mirror 값이다.

## 보안 경계

- register row 의 항목명, 결정 사유, 행선지 경로, 메일 제목/발신자 같은
  자유 텍스트는 projection 에 포함하지 않는다.
- `_workmeta` 읽기는 이 register 파일 하나의 표 구조 신호로 제한하며, 다른
  `_workmeta` 파일을 추가로 훑지 않는다.
- 개별 row 식별자나 row 단위 샘플 표시는 v0 범위 밖이며, 도입하려면 별도
  owner 결정이 필요하다 (local-only snapshot 이라도 sanitized 원칙 유지).
- mail body, attachment, token, credential, session 값은 어떤 경로로도 읽지
  않는다.

## validation

- `validateSnapshot` 은 `triage_board` 를 closed shape 로 검사한다. 위 표의
  field 외 추가 field 는 `is not an allowed field` 로 실패시킨다.
- count mirror: `pending_monster_triage_total` 이 monster gate 의
  `needs_identification` + `open_intake` group total 합과 같은지 확인한다.
- `register_present: false` 이면 count field 는 0, date field 는 null 이어야
  한다. 누락 register 는 오류가 아니라 명시된 gap 으로 표시한다.
- 자유 텍스트 유입 방지: synthetic fixture 에 `DO_NOT_LEAK_*` sentinel 을
  넣어 serialized snapshot 에 나타나지 않음을 테스트로 고정한다.

## UI 표시 기준

- 작전판은 `tbd_destination_count`, `oldest_tbd_age_days`,
  `stale_tbd_count`, `pending_monster_triage_total` 을 카운트/age 배지로만
  표시한다.
- `stale_tbd_count > 0` 이면 INBOX triage 정리를 next action 후보로 보여줄
  수 있다. 후보 노출 여부는 producer `next_actions` 구현 판단에 둔다.
- row 상세 열람은 v0 범위 밖이다. 상세가 필요하면 사용자는 register 파일을
  직접 연다.

## 구현 순서 (Codex)

1. producer 에 triage register metadata reader 를 추가한다 (표 row 파싱은
   `|` 구분 deterministic 파싱, 실패 시 `register_present: true` +
   `parse_warning` diagnostics).
2. `operation_board.sections.triage_board` projection 을 추가한다.
3. `validateSnapshot` 에 closed shape / mirror / null 규칙을 추가한다.
4. `guild_hall/snapshot/loop_e2e.test.mjs` 의 todo 테스트를 활성화한다.
5. `SOULFORGE_SNAPSHOT_V0.md` 의 operation board section 목록에 한 줄을
   추가한다 (같은 변경 안에서).

## non-goals

- register 본문/제목/사유 텍스트 노출
- 자동 라우팅 결정, mission 자동 생성, `_workmeta` 쓰기
- triage register 의 형식 변경이나 register 를 대체하는 새 truth 생성
- 회사 메일 원문, 첨부, 계정 데이터 접근

## 상태

- 2026-06-12: 계약 초안 작성 (`claude_fable-5`, 2026-06-11 보안 슬라이스
  패킷의 루프 슬라이스 산출물). 구현 전이며, 구현은 위 구현 순서를 따른다.

# Future Aggregation Plan

## 목적

- 이 문서는 나중에 만들 종합 기능이 mission governance 관련 메타를 어떻게 참고할지에 대한 아이디어 메모다.
- 지금은 무엇을 종합할지 아직 잠그지 않고, 표시하거나 모아볼 수 있는 후보 메타만 정리한다.

## 비목표

- 지금 당장 종합 기능을 구현하는 것
- `summary` 기능을 현재 phase 범위로 넣는 것
- 새 schema 나 새 canonical root 를 지금 확정하는 것
- 자동 승격 authority 를 만드는 것

## 현재 아이디어 후보

- `mission_level`
  - `L0` = mission surface recorded
  - `L1` = artifact-backed
  - `L2` = current-lane complete
  - `L3` = promotion-review ready
- `promotion_review_needed`
  - 사용자 수동 승격 검토가 필요한지 표시하는 힌트
- `governance_axis_hint`
  - `sample`
  - `current_default_candidate`
  - `universal_candidate`
- `blocker_kind`
  - `none`
  - `historical_mismatch`
  - `mission_surface_gap`
  - `canon_gap`
  - `runtime_gap`
- `manual_trial_state`
  - 아직 미정이지만, 수동 사용 여부를 나중에 표시할 수 있는 후보 메타
- `rerun_state`
  - 아직 미정이지만, 자동 운영층 재실행 여부를 나중에 표시할 수 있는 후보 메타

## 현재 원칙

- 종합 기능은 승격을 직접 수행하지 않는다.
- 종합 기능은 owner 판단을 돕는 참고층이어야 한다.
- raw run truth 나 local binding dump 를 `.mission` 쪽 canonical surface 로 복제하지 않는다.
- 무엇을 종합할지 정해지기 전까지는 메타 아이디어만 owner-local draft 로 유지한다.

## 열린 질문

1. 종합 기능이 mission 만 볼지, workflow / party / skill 쪽 메타도 함께 볼지
2. `mission_level` 을 status 와 별도 축으로 어떻게 표현할지
3. `promotion_review_needed` 를 bool 로 둘지, 이유문구 중심으로 둘지
4. `governance_axis_hint` 를 실제 필드로 둘지, 내부 계산 결과로만 둘지
5. 어떤 문서가 종합 기능의 입력이 될지

## ASSUMPTIONS

- 이 문서는 기능 명세가 아니라 planning note 다.
- `mission_level` 같은 표현은 지금 잠긴 용어가 아니라 초안 아이디어다.

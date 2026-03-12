# UI Next Phase Backlog

## 목적

- 이번 closeout 범위 밖의 후속 작업을 분리한다.
- 현재 구조를 다시 흔들지 않고 다음 단계 논의를 backlog 로 격리한다.

## producer / integration

- `derive-ui-state --json` 가 v1 contract 를 직접 emit 하도록 승격
- optional integration provider package 분리
- live producer payload regression fixture 추가

## renderer interaction

- selection persistence control-plane 설계
- richer candidate preview interaction
- keyboard navigation / accessibility pass

## theme / skin

- Adventurer's Desk Phase UI-2 material refinement
- additional theme package 예시 1종 이상
- visual regression snapshot workflow

## quality / workflow

- docs link checker 를 CI workflow 로 승격
- acceptance check 를 CI preset 으로 고정
- negative fixture / failure fixture 세트 추가

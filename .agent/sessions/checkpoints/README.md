# .agent/sessions/checkpoints

## 목적

- `checkpoints/` 는 현재 작업 연속성을 잇기 위한 checkpoint 저장 경계를 둔다.

## 포함 대상

- serialized checkpoint records
- resumable summary

## 제외 대상

- raw transcript
- long-term memory dump
- team shared handoff board

## 대표 파일

- [`../checkpoint_template.yaml`](../checkpoint_template.yaml): checkpoint 필수 구조

## 참조 관계

- `checkpoints/` 는 `sessions/` owner 아래에 있고 `memory/` 장기 기억과 구분된다.

## 변경 원칙

- resume 에 필요한 최소 정보만 남기고 transcript 성 데이터는 넣지 않는다.

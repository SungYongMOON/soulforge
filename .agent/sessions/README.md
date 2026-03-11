# .agent/sessions

## 목적

- `sessions/` 는 transcript 저장소가 아니라 continuity 저장소다.
- 세션 재개, handoff, carry-forward 에 필요한 연결 상태를 본체 차원에서 보존한다.

## 범위

- 세션 연속성에 필요한 체크포인트와 resume 메타만 다룬다.
- raw 대화 transcript, 장기 기억, mission log 원본은 범위 밖이다.

## 포함 대상

- 세션 식별 정보
- continuity checkpoint, resume cursor, handoff 메타
- 세션 상태 스냅샷과 최소 요약 참조

## 제외 대상

- raw conversation transcript
- 장기 기억과 project 전용 작업 로그
- loadout 별 임시 작업 버퍼

## 미래 확장 방향

- continuity 품질을 높이기 위한 요약/압축 포맷을 후속 계약으로 추가할 수 있다.
- transcript archive 가 필요해도 canonical owner 는 `sessions/` 가 아니다.
- cross-agent handoff 가 생기면 shared 규약은 `_teams/shared/` 로 분리한다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent/memory/README.md`](../memory/README.md)

## 상태

- Draft
- continuity 저장 경계만 우선 고정했고 세부 포맷은 추후 정의한다.

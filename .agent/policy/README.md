# .agent/policy

## 목적

- `policy/` 는 species-free floor 를 둔다.
- identity 나 loadout 과 무관하게 항상 적용되는 본체 기본 제약과 안전 기준을 관리한다.

## 범위

- universal floor rule, safety baseline, permission floor 만 다룬다.
- species default, loadout override, mission exception 은 범위 밖이다.

## 포함 대상

- 본체 정책 문서
- 안전 규칙, 허용 범위, 금지선 메타
- 모든 상황에 공통으로 적용되는 floor 제약

## 제외 대상

- species 기본값과 identity default
- class 운영 절차와 loadout 특화 규칙
- 프로젝트 계약과 프로젝트별 예외 규칙

## 미래 확장 방향

- 상위 floor 위에 loadout/mission override 계층이 생겨도 floor 자체는 여기서 유지한다.
- 정책 참조 구조가 늘어나면 `protocols/` 와의 연결 규칙을 별도 계약으로 고정한다.
- shared governance 가 필요하면 canonical shared copy 는 `_teams/shared/` 에 둔다.

## 관련 경로

- [`.agent/README.md`](../README.md)
- [`.agent/communication/README.md`](../communication/README.md)

## 상태

- Draft
- species-free floor 원칙만 우선 고정했고 세부 파일 세트는 추후 정의한다.

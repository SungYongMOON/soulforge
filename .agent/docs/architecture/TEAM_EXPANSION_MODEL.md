# team expansion 모델

## 목적

- `_teams/shared` 확장 시 `.agent` 안과 밖의 경계를 정의한다.

## 범위

- future shared memory, shared decisions, shared handoffs 의 owner 경계를 다룬다.

## 포함 대상

- `_teams/shared` 예약 규칙
- private vs shared 분리 원칙

## 제외 대상

- 실제 `_teams/` 구현 세부
- body 내부 shared memory 도입

## 미래 확장 방향

- 팀 계층이 생기면 body private memory 와 shared board 사이의 protocol contract 를 추가한다.

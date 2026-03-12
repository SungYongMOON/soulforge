# memory 모델

## 목적

- `memory/` 의 private-first 구조와 zone 분리를 정의한다.

## 범위

- `self/`, `project/`, `decisions/`, `handoffs/` zone 을 다룬다.

## 포함 대상

- private long-term memory
- distilled project facts
- decision memory

## 제외 대상

- sessions continuity
- raw transcript
- shared team memory

## 미래 확장 방향

- shared board 가 필요하면 `_teams/shared` 로 승격하고 body memory 는 private-first 를 유지한다.

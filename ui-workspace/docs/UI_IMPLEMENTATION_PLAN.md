# UI Implementation Plan

## 목적

- renderer v1 구현을 contract-first 순서로 고정한다.
- fixture-first 개발과 host integration 개발이 같은 shell 위에서 병행되게 한다.

## 단계

1. 문서 고정
2. schema 작성
3. fixture 작성
4. renderer-core 구현
5. renderer-web shell 구현
6. Adventurer's Desk Phase UI-1 token 적용
7. 검증과 README 동기화

## directory model

```text
ui-workspace/
├── docs/
├── schemas/ui-state.schema.json
├── fixtures/ui-state/
├── tools/ui-lint/
├── packages/ui-contract/
├── packages/renderer-core/
├── packages/renderer-react/
├── packages/theme-contract/
├── packages/theme-adventurers-desk/
├── apps/renderer-web/
└── apps/skin-lab-storybook/
```

## package split

- `ui-contract`: 타입과 식별자 계약
- `renderer-core`: normalize, loader, selection, view-model
- `renderer-react`: presentational layer
- `theme-contract`: theme metadata 타입
- `theme-adventurers-desk`: Adventurer's Desk token package
- `renderer-web`: fixture-first host shell
- `skin-lab-storybook`: placeholder skin lab

## renderer-core 책임

- normalized state types
- legacy derive adapter
- fixture / URL / host bridge loader
- local selection reducer
- icon / material mapping
- view-model helper

## renderer-web 책임

- Vite dev shell
- fixture mode request handling
- renderer-react mount
- query-driven fixture selection
- theme package wiring

## optional integration provider 책임

- future `derive-ui-state --json` bridge
- external URL/provider fetch
- canonical repo integration

## integration point

- fixture mode 는 `fixtures/ui-state/*.json` 을 바로 읽는다.
- future integration mode 는 optional provider 가 raw payload 를 제공한다.
- raw payload 가 legacy shape 이면 renderer-core adapter 가 v1 contract 로 normalize 한다.

## validation workflow

1. schema validate fixtures
2. load normalized state in renderer-core
3. run web build
4. run web dev shell
5. confirm read-only boundary

## update 규칙

- canonical 구조 변경 시 producer 또는 fixture 중 하나는 반드시 갱신한다.
- UI contract 변경 시 schema, fixtures, renderer-core type, renderer-web usage 를 같은 변경 안에서 맞춘다.
- renderer-web 만 바꾸고 contract/schema 를 건드리지 않는 경우에도 fixture load 는 유지해야 한다.

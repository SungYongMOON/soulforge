# fixtures/ui-state

## 목적

- renderer v1 이 바로 읽을 수 있는 JSON fixture baseline 을 둔다.
- fixture 는 full normalized contract 를 기준으로 유지한다.

## 포함 대상

- `overview.sample.json`
- `body.sample.json`
- `class.sample.json`
- `workspaces.sample.json`
- `integrated.sample.json`

## 규칙

- fake runtime state 를 지어내지 않는다.
- 현재 저장소의 body/class/catalog/workspace 구조와 맞는 placeholder 만 사용한다.
- canonical source 를 복제하는 것이 아니라 renderer projection 을 제공한다.
- schema 변경 시 fixture 를 같은 변경 안에서 함께 갱신한다.

## 관련 경로

- [fixtures/README.md](../README.md)
- [schemas/ui-state.schema.json](../../schemas/ui-state.schema.json)
- [docs/ui/UI_STATE_CONTRACT.md](../../docs/ui/UI_STATE_CONTRACT.md)

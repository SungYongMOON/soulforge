# fixtures/ui-state

## 목적

- renderer v1 이 바로 읽을 수 있는 JSON fixture baseline 을 둔다.
- fixture 는 새 정본 6축 (`species`, `units`, `classes`, `workflows`, `parties`, `workspaces`) 을 기준으로 유지한다.
- `overview`, `body`, `class_view` 는 현재 소비층을 위한 compatibility projection 이며 정본 owner model 을 대체하지 않는다.

## 포함 대상

- `overview.sample.json`
- `body.sample.json`
- `class.sample.json`
- `workspaces.sample.json`
- `integrated.sample.json`

## 규칙

- public fixture 는 synthetic template 만 사용하고 실제 local mission site 를 materialize 하지 않는다.
- `_workspaces/<project_code>/`, `_workmeta/<project_code>/runs`, battle log, analytics, actual party performance data 는 fixture 에 넣지 않는다.
- `.workflow/history` 와 `.party/stats` 는 curated summary policy 만 드러내고 raw data 를 싣지 않는다.
- canonical source 를 복제하는 것이 아니라 sanitized renderer projection 을 제공한다.
- schema 변경 시 fixture 를 같은 변경 안에서 함께 갱신한다.

## 관련 경로

- [fixtures/README.md](../README.md)
- [schemas/ui-state.schema.json](../../schemas/ui-state.schema.json)
- [docs/UI_STATE_CONTRACT.md](../../docs/UI_STATE_CONTRACT.md)

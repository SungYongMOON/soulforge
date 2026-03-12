# tools/ui-lint

## 목적

- `ui-lint` 는 renderer consumer layer 의 데이터/경계 정합성을 자동 검사한다.
- fixture, schema, package boundary, read-only boundary, theme isolation 을 한 번에 점검한다.

## 포함 lint

- catalog lint
- ui-state contract lint
- read-only boundary lint
- package boundary lint
- fixture coverage lint
- theme isolation lint

## 실행

- `npm run ui:lint:catalog`
- `npm run ui:lint:ui-state`
- `npm run ui:lint:read-only`
- `npm run ui:lint:packages`
- `npm run ui:lint:fixtures`
- `npm run ui:lint:theme`
- `npm run ui:lint:all`

## 관련 경로

- [LINT_RULES.md](./LINT_RULES.md)
- [docs/ui/UI_STATE_CONTRACT.md](../../docs/ui/UI_STATE_CONTRACT.md)
- [schemas/ui-state.schema.json](../../schemas/ui-state.schema.json)
- [fixtures/ui-state/README.md](../../fixtures/ui-state/README.md)

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

workspace local:
- `npm run lint:catalog`
- `npm run lint:ui-state`
- `npm run lint:read-only`
- `npm run lint:packages`
- `npm run lint:fixtures`
- `npm run lint:theme`
- `npm run lint:all`
- `npm run docs:check-links`
- `npm run done:check`

root proxy:
- `npm run ui:lint:catalog`
- `npm run ui:lint:ui-state`
- `npm run ui:lint:read-only`
- `npm run ui:lint:packages`
- `npm run ui:lint:fixtures`
- `npm run ui:lint:theme`
- `npm run ui:lint:all`
- `npm run ui:done:check`

root canonical tree 와 함께 stricter catalog overlay 검사를 하려면:

- `UI_LINT_CANONICAL_ROOT=.. npm run lint:all`

## 관련 경로

- [LINT_RULES.md](./LINT_RULES.md)
- [docs/UI_STATE_CONTRACT.md](../../docs/UI_STATE_CONTRACT.md)
- [schemas/ui-state.schema.json](../../schemas/ui-state.schema.json)
- [fixtures/ui-state/README.md](../../fixtures/ui-state/README.md)

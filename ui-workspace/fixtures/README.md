# fixtures

## 목적

- `fixtures/` 는 schema validate 가능한 renderer input baseline 을 둔다.
- canonical source 의 대체물이 아니라 UI 개발과 회귀 검증용 파생 입력을 제공한다.

## 포함 대상

- `ui-state/` fixture 세트
- `operation-board/` synthetic public-safe Operation Board snapshot fixture 세트

## 제외 대상

- canonical YAML sample
- host-local scratch data
- live `guild_hall/state/snapshot/soulforge_snapshot.json` 복사본
- source truth, raw mail body/html, attachment, source text, NotebookLM answer/question payload

## 관련 경로

- [ui-workspace README](../README.md)
- [schemas/ui-state.schema.json](../schemas/ui-state.schema.json)
- [fixtures/operation-board/README.md](./operation-board/README.md)
- [docs/UI_IMPLEMENTATION_PLAN.md](../docs/UI_IMPLEMENTATION_PLAN.md)

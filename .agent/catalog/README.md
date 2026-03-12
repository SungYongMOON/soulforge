# .agent/catalog

## 목적

- `catalog/` 는 `.agent` 내부 selection layer 를 둔다.
- UI 가 열람하고 선택할 후보를 body owner 경계 안에서 노출하되, canonical asset 정본을 복제하지 않는다.

## 포함 대상

- `identity/`, `class/`
- selectable species, hero candidate, profile, skill, tool, knowledge, workflow catalog
- canonical source 로 향하는 `source_ref` 중심 index

## 제외 대상

- 현재 active species 와 active hero selection
- `.agent_class/**` canonical class asset 본문
- generator 구현, selection persistence runtime, deep research 결과물

## 구조 원칙

- `catalog/identity/**` 는 identity candidate canonical source 다.
- `catalog/class/**` 는 `.agent_class/**` canonical asset 을 가리키는 UI selection index 다.
- catalog 상태는 가능하면 `identity/`, `registry/`, `body_state.yaml` 에서 유도하고 catalog 파일 안에 중복 저장하지 않는다.

## 관련 경로

- [`../identity/README.md`](../identity/README.md)
- [`identity/README.md`](identity/README.md)
- [`class/README.md`](class/README.md)
- [`../../.agent_class/README.md`](../../.agent_class/README.md)

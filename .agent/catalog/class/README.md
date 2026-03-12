# .agent/catalog/class

## 목적

- `catalog/class/` 는 UI selection layer 로서 class asset catalog 를 둔다.
- canonical class asset 정본은 `.agent_class/**` 가 소유하고, 여기에는 selection index 와 display metadata 만 둔다.

## 포함 대상

- `profiles/`, `skills/`, `tools/`, `knowledge/`, `workflows/`
- `.agent_class/**` 를 가리키는 `source_ref` 기반 catalog

## 제외 대상

- class asset canonical 본문
- active class binding 상태의 source of truth
- 설치 자산 disable 정책

## 관련 경로

- [`../../../.agent_class/README.md`](../../../.agent_class/README.md)
- [`profiles/README.md`](profiles/README.md)
- [`skills/README.md`](skills/README.md)
- [`tools/README.md`](tools/README.md)
- [`knowledge/README.md`](knowledge/README.md)
- [`workflows/README.md`](workflows/README.md)

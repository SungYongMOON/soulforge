# .agent/catalog/class

## 목적

- `catalog/class/` 는 UI selection layer 로서 class asset catalog 를 둔다.
- canonical class asset 정본은 `.agent_class/**` 가 소유하고, 여기에는 selection index 와 display metadata 만 둔다.
- catalog 항목은 canonical 본문을 복제하지 않고 `source_ref` 로만 연결한다.

## 포함 대상

- `profiles/`, `skills/`, `tools/`, `knowledge/`, `workflows/`
- `.agent_class/**` 를 가리키는 `source_ref` 기반 catalog
- active/selected 상태를 유도하기 위한 `selection_state_source`

## 제외 대상

- class asset canonical 본문
- active class binding 상태의 source of truth
- 설치 자산 disable 정책

## 규칙

- catalog 는 source-ref only selection layer 다.
- tool catalog 는 `adapters`, `connectors`, `local_cli`, `mcp` family 로 분리한다.
- active 상태는 `../../registry/active_class_binding.yaml` 과 `../../body_state.yaml` 에서 읽고 catalog 안에 중복 기록하지 않는다.

## 관련 경로

- [`../../../.agent_class/README.md`](../../../.agent_class/README.md)
- [`profiles/README.md`](profiles/README.md)
- [`skills/README.md`](skills/README.md)
- [`tools/README.md`](tools/README.md)
- [`knowledge/README.md`](knowledge/README.md)
- [`workflows/README.md`](workflows/README.md)

# .agent/catalog/class/tools

## 목적

- `tools/` 는 family 별 selectable tool catalog 를 둔다.
- canonical tool 정본은 `.agent_class/tools/<family>/**/module.yaml` 이 소유한다.
- active, selected, installed 같은 상태값은 catalog item 안에 중복 저장하지 않고 `../../../registry/active_class_binding.yaml`, `../../../body_state.yaml` 에서 유도한다.

## family

- `adapters`
- `connectors`
- `local_cli`
- `mcp`

## catalog 파일

- `adapters_catalog.yaml`
- `connectors_catalog.yaml`
- `local_cli_catalog.yaml`
- `mcp_catalog.yaml`

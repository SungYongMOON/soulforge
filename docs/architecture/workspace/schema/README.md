# docs/architecture/workspace/schema

## 목적

- `workspace/schema/` 는 `_workmeta` example contract, binding 파일, local-only event stream 의 사람이 읽는 canonical schema 문서를 둔다.
- formal JSON Schema 대신 YAML 기반 설명 문서만 유지한다.

## 포함 대상

- `workmeta_contract.schema.yaml`
- `workflow_binding.schema.yaml`
- `party_binding.schema.yaml`
- `appserver_binding.schema.yaml`
- `mailbox_binding.schema.yaml`
- `execution_profile_binding.schema.yaml`
- `skill_execution_binding.schema.yaml`
- `battle_event.schema.yaml`
- `WORKMETA_SCHEMA_FIELD_MATRIX.md` 와 함께 읽는 field rule anchor

## 규칙

- schema 문서는 `schema_id`, `kind`, `applies_to`, `required_fields`, `optional_fields`, `field_rules`, `notes` 를 모두 가진다.
- `bindings.*` 는 contract 파일 기준 상대 경로 파일 포인터다.
- raw truth 는 언제나 `runs/<run_id>/` 아래다.
- battle event stream 은 `_workmeta/<project_code>/log/events/YYYY/MM/battle_events.jsonl` 아래 local-only append stream 으로 둔다.

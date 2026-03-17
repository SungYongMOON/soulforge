# docs/architecture/foundation/schema

## 목적

- `foundation/schema/` 는 `.registry` 와 `.unit` 의 사람이 읽는 canonical schema 문서를 둔다.
- formal JSON Schema 대신 YAML 기반 설명 문서만 유지한다.

## 포함 대상

- `species.schema.yaml`
- `class.schema.yaml`
- `unit.schema.yaml`
- `SCHEMA_FIELD_MATRIX.md` 와 함께 읽는 field rule anchor

## 규칙

- schema 문서는 `schema_id`, `kind`, `applies_to`, `required_fields`, `optional_fields`, `field_rules`, `notes` 를 모두 가진다.
- `status` vocabulary 는 `draft | active | archived` 로 고정한다.
- sample 은 schema 와 같은 change 안에서 함께 갱신한다.

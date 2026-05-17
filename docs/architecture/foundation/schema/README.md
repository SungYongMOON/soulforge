# docs/architecture/foundation/schema

## 목적

- `foundation/schema/` 는 `.registry` 와 `.unit` 의 사람이 읽는 canonical schema 문서를 둔다.
- formal JSON Schema 대신 YAML 기반 설명 문서만 유지한다.
- 이 경로의 schema 문서는 canon validator 가 보는 구조, id, path, ref resolution 표면을 설명한다.
- 지식의 truth, approval, promotion 판단은 이 경로가 아니라 owner/review 문서가 다룬다.

## 포함 대상

- `species.schema.yaml`
- `class.schema.yaml`
- `unit.schema.yaml`
- `SCHEMA_FIELD_MATRIX.md`
  - species, class, unit, registry knowledge, class-local refs 의 field rule anchor

## canon-validator surface

- registry knowledge entry 는 `.registry/knowledge/<knowledge_id>/knowledge.yaml` 로 둔다.
- `knowledge.yaml` 의 `knowledge_id` 는 enclosing folder name 과 일치해야 하고, `kind` 는 `knowledge` 로 고정한다.
- class-local `knowledge_refs.yaml` 는 `.registry/classes/<class_id>/class.yaml` 의 `knowledge_refs` sibling pointer 로 resolve 한다.
- `knowledge_refs.yaml` 의 `class_id` 는 parent class folder 와 일치해야 하고, `kind` 는 `knowledge_refs` 로 고정한다.
- `knowledge_refs.yaml` 의 `assign[].ref` 는 bare knowledge id 로서 `.registry/knowledge/<ref>/knowledge.yaml` 에 resolve 해야 한다.
- 이 표면은 structure/resolution check 만 다루며, 어떤 지식이 참인지 또는 승인되었는지는 판단하지 않는다.

## 규칙

- schema 문서는 `schema_id`, `kind`, `applies_to`, `required_fields`, `optional_fields`, `field_rules`, `notes` 를 모두 가진다.
- `status` vocabulary 는 `draft | active | archived` 로 고정한다.
- sample 은 schema 와 같은 change 안에서 함께 갱신한다.
- registry knowledge 는 현재 `SCHEMA_FIELD_MATRIX.md` 에서 validator-facing shape 를 문서화한다. standalone `knowledge.schema.yaml` 은 validator 구현이 별도 schema file 을 요구할 때만 추가한다.

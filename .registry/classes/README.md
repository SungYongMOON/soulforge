# .registry/classes

## 정본 의미

- `classes/` 는 reusable class canon entry 를 둔다.
- 각 class 의 진입점은 `classes/<class_id>/class.yaml` 이다.

## 현재 phase에서 고정한 것

- `class.yaml` 는 canon entry 이자 assign/ref 입구다.
- class-local `skill_refs.yaml`, `tool_refs.yaml`, `knowledge_refs.yaml` 패턴은 유지한다.
- [`knight/class.yaml`](knight/class.yaml), [`archivist/class.yaml`](archivist/class.yaml), [`administrator/class.yaml`](administrator/class.yaml) 은 frontline, evidence, authoring lane 을 보여주는 canonical sample trio 다.
- 세부 확장 스키마는 schema 문서와 field matrix 에서 이어서 고정한다.

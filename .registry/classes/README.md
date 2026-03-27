# .registry/classes

## 정본 의미

- `classes/` 는 reusable class canon entry 를 둔다.
- 각 class 의 진입점은 `classes/<class_id>/class.yaml` 이다.
- `class_id` 는 stable ASCII id 를 유지하고, 사람에게 보여주는 이름은 `title` 에 한국어로 둘 수 있다.
- class 는 species 를 소유하거나 제한하지 않는다.
- 실제 조합은 unit 의 `identity.species_id + class_ids` 에서 결정한다.

## 현재 phase에서 고정한 것

- `class.yaml` 는 canon entry 이자 assign/ref 입구다.
- class-local `skill_refs.yaml`, `tool_refs.yaml`, `knowledge_refs.yaml` 패턴은 유지한다.
- starter canonical lineup 은 아래 10종으로 둔다.
- [`knight/class.yaml`](knight/class.yaml): 전위, 안정화, 돌파
- [`archivist/class.yaml`](archivist/class.yaml): 증거 정리, 관계 stitching, 신중한 초안화
  - 사람용 title 은 `기록관`
- [`administrator/class.yaml`](administrator/class.yaml): 검토 gate, 경계 통제, delegation, promotion handoff
  - 사람용 title 은 `총관`
- [`pathfinder/class.yaml`](pathfinder/class.yaml): intake 정찰, ambiguity 축소, hidden-path 탐지
- [`marshal/class.yaml`](marshal/class.yaml): 후속조치 압박, 일정 추적, controlled escalation
- [`auditor/class.yaml`](auditor/class.yaml): 구조 검증, accept/reject gate, release readiness
- [`archer/class.yaml`](archer/class.yaml): 원거리 정밀 조준, 약점 격리, low-noise intervention
- [`rogue/class.yaml`](rogue/class.yaml): 우회, 침투, 조용한 회수, legacy-lane cleanup
- [`healer/class.yaml`](healer/class.yaml): 안정화, 복구 triage, safe state restoration
- [`envoy/class.yaml`](envoy/class.yaml): handoff delivery, external translation, negotiated route keeping
- 새 class 를 추가해도 기존 species 와의 조합 가능성은 열어 둔다.
- 세부 확장 스키마는 schema 문서와 field matrix 에서 이어서 고정한다.

## 후속 후보군

- 아래 class 는 current-default 2차 후보군으로 남긴다.
- world concept 는 강하지만, dedicated skill/tool/knowledge canon 이 더 필요하거나 기존 class 와의 경계 설계를 먼저 더 좁혀야 한다.
- `blacksmith` / `대장장이`
  - 틀, 구조, 제작, 형상 고정
- `artificer` / `기술사`
  - 시스템 메커니즘, binding, 실행 구조 설계
- `mage` / `마법사`
  - ontology, schema, abstraction, 상위 규칙 모델링
- `fighter` / `격투가`
  - 좁은 범위 응급 개입, 병목 제거, 단기 제압

# docs/architecture/foundation

## 목적

- `foundation/` 은 저장소 전체의 기준선이 되는 root-owned 구조 문서를 모은다.
- 구조 목적, 목표 트리, 소유 기준, 세계관처럼 다른 문서가 자주 참조하는 활성 anchor 문서를 여기서 관리한다.

## 포함 대상

- `REPOSITORY_PURPOSE.md`
- `PROJECT_MAP_V0.md`
- `DEVELOPMENT_ROADMAP_V0.md`
- `VISION_AND_GOALS.md`
- `TARGET_TREE.md`
- `DOCUMENT_OWNERSHIP.md`
- `AGENT_EXECUTION_CONTRACT_V0.md`
- `AGENT_WORLD_MODEL.md`
- `ONTOLOGY_MODEL_V0.md`
- `ONTOLOGY_REVIEW_MANUAL_V0.md`
- `ONTOLOGY_RELATION_MATRIX_V1.md`
- `REPOSITORY_IMPROVEMENT_PLAN_V0.md`
- `schema/`
- `SCHEMA_FIELD_MATRIX.md`

## 관련 경로

- [`../README.md`](../README.md)
- [`.registry/README.md`](../../../.registry/README.md)
- [`REPOSITORY_PURPOSE.md`](REPOSITORY_PURPOSE.md)
- [`PROJECT_MAP_V0.md`](PROJECT_MAP_V0.md)
- [`DEVELOPMENT_ROADMAP_V0.md`](DEVELOPMENT_ROADMAP_V0.md)
- [`VISION_AND_GOALS.md`](VISION_AND_GOALS.md)
- [`TARGET_TREE.md`](TARGET_TREE.md)
- [`DOCUMENT_OWNERSHIP.md`](DOCUMENT_OWNERSHIP.md)
- [`AGENT_EXECUTION_CONTRACT_V0.md`](AGENT_EXECUTION_CONTRACT_V0.md)
- [`AGENT_WORLD_MODEL.md`](AGENT_WORLD_MODEL.md)
- [`ONTOLOGY_MODEL_V0.md`](ONTOLOGY_MODEL_V0.md)
- [`ONTOLOGY_REVIEW_MANUAL_V0.md`](ONTOLOGY_REVIEW_MANUAL_V0.md)
- [`ONTOLOGY_RELATION_MATRIX_V1.md`](ONTOLOGY_RELATION_MATRIX_V1.md)
- [`REPOSITORY_IMPROVEMENT_PLAN_V0.md`](REPOSITORY_IMPROVEMENT_PLAN_V0.md)
- [`schema/README.md`](schema/README.md)
- [`SCHEMA_FIELD_MATRIX.md`](SCHEMA_FIELD_MATRIX.md)

## 상태

- Stable
- 저장소 전체 기준선과 장기 참조 문서를 묶는다.
- active owner-local canon 은 `.registry/`, `.unit/`, `.workflow/`, `.party/`, `.mission/`, `_workspaces/` 에서 읽는다.
- active semantics 는 `AGENT_WORLD_MODEL.md`, `ONTOLOGY_MODEL_V0.md`, `ONTOLOGY_REVIEW_MANUAL_V0.md` 에서 통합한다.
- 저장소를 다시 잡기 위한 한 장짜리 탐색 지도는 `PROJECT_MAP_V0.md` 에서 읽는다.
- 큰 개발 방향과 현재 우선순위의 단일 정본은 `DEVELOPMENT_ROADMAP_V0.md` 에서 읽는다.
- validator 와 harness 가 바로 참조할 ontology binding 요약은 `ONTOLOGY_RELATION_MATRIX_V1.md` 에서 읽는다.
- 저장소 개선의 현재 단계별 계획은 `REPOSITORY_IMPROVEMENT_PLAN_V0.md` 에서 읽는다.
- AI agent 의 작업 실행 계약은 `AGENT_EXECUTION_CONTRACT_V0.md` 에서 읽는다.

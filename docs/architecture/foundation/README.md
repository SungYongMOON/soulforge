# docs/architecture/foundation

## 목적

- `foundation/` 은 저장소 전체의 기준선이 되는 root-owned 구조 문서를 모은다.
- 구조 목적, 목표 트리, 소유 기준, 세계관처럼 다른 문서가 자주 참조하는 활성 anchor 문서를 여기서 관리한다.

## 문서 역할 색인

| 문서 | 역할 |
| --- | --- |
| `REPOSITORY_PURPOSE.md` | Soulforge 저장소의 존재 이유와 public/private 범위를 고정한다. |
| `PROJECT_MAP_V0.md` | 처음 다시 열었을 때 읽는 한 장짜리 owner/root 지도다. |
| `SOULFORGE_ERP_BOM_HIERARCHY_V0.md` | 저장소 전체를 ERP/BOM 계층으로 읽기 위한 public-safe 구조 지도다. |
| `DEVELOPMENT_ROADMAP_V0.md` | 큰 개발 방향, active slice, 우선순위 판단의 단일 정본이다. |
| `VISION_AND_GOALS.md` | 수동 업무를 mission/run truth/canon/autohunt 로 승격하는 장기 비전을 고정한다. |
| `TARGET_TREE.md` | 목표 루트 트리와 canonical path shape 를 설명한다. |
| `DOCUMENT_OWNERSHIP.md` | 어떤 문서가 어느 owner 경계를 소유하는지 정한다. |
| `AGENT_EXECUTION_CONTRACT_V0.md` | AI agent 의 가정 노출, 최소 변경, 검증 기준, post-development review gate, secret 경계를 정한다. |
| `SHARED_GLOSSARY_V0.md` | owner 와 agent 가 개발 후보, 승인, RAG, 정본, workflow/party/mission 같은 공통 용어를 같은 뜻으로 읽게 한다. |
| `TEAM_DAY_1_GUIDE_V0.md` | 팀 합류자/새 PC 운영자가 첫날 읽는 한 장짜리 지도와 경계 요약이다. |
| `AI_OUTPUT_FORMAT_POLICY_V0.md` | AI 생성 결과의 source-of-truth 형식과 HTML human-review artifact 사용 경계를 정한다. |
| `POST_DEVELOPMENT_REVIEW_PACKET_TEMPLATE_V0.yaml` | post-development review gate 결과를 남길 때 쓰는 public-safe packet shape 다. |
| `AGENT_WORLD_MODEL.md` | agent 가 species, class, unit, workflow, party, mission 을 어떤 세계 모델로 읽는지 설명한다. |
| `ONTOLOGY_MODEL_V0.md` | 반복 개념을 ontology 후보와 canon relation 으로 다루는 기준을 둔다. |
| `ONTOLOGY_REVIEW_MANUAL_V0.md` | project-local 반복 패턴을 ontology candidate 로 검토하는 절차를 둔다. |
| `ONTOLOGY_RELATION_MATRIX_V1.md` | validator 와 harness 가 참조할 owner relation 요약 matrix 다. |
| `REPOSITORY_IMPROVEMENT_PLAN_V0.md` | 저장소 개선 단계를 별도 plan 으로 추적한다. |
| `schema/` | foundation owner schema 문서를 둔다. |
| `SCHEMA_FIELD_MATRIX.md` | foundation schema field 를 사람이 읽는 표로 요약한다. |

## 관련 경로

- [`../README.md`](../README.md)
- [`.registry/README.md`](../../../.registry/README.md)
- [`REPOSITORY_PURPOSE.md`](REPOSITORY_PURPOSE.md)
- [`PROJECT_MAP_V0.md`](PROJECT_MAP_V0.md)
- [`SOULFORGE_ERP_BOM_HIERARCHY_V0.md`](SOULFORGE_ERP_BOM_HIERARCHY_V0.md)
- [`DEVELOPMENT_ROADMAP_V0.md`](DEVELOPMENT_ROADMAP_V0.md)
- [`VISION_AND_GOALS.md`](VISION_AND_GOALS.md)
- [`TARGET_TREE.md`](TARGET_TREE.md)
- [`DOCUMENT_OWNERSHIP.md`](DOCUMENT_OWNERSHIP.md)
- [`AGENT_EXECUTION_CONTRACT_V0.md`](AGENT_EXECUTION_CONTRACT_V0.md)
- [`SHARED_GLOSSARY_V0.md`](SHARED_GLOSSARY_V0.md)
- [`AI_OUTPUT_FORMAT_POLICY_V0.md`](AI_OUTPUT_FORMAT_POLICY_V0.md)
- [`POST_DEVELOPMENT_REVIEW_PACKET_TEMPLATE_V0.yaml`](POST_DEVELOPMENT_REVIEW_PACKET_TEMPLATE_V0.yaml)
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
- ERP/BOM처럼 실제 계층을 펼쳐 보는 구조 지도는 `SOULFORGE_ERP_BOM_HIERARCHY_V0.md` 에서 읽는다.
- 큰 개발 방향과 현재 우선순위의 단일 정본은 `DEVELOPMENT_ROADMAP_V0.md` 에서 읽는다.
- validator 와 harness 가 바로 참조할 ontology binding 요약은 `ONTOLOGY_RELATION_MATRIX_V1.md` 에서 읽는다.
- 저장소 개선의 현재 단계별 계획은 `REPOSITORY_IMPROVEMENT_PLAN_V0.md` 에서 읽는다.
- AI agent 의 작업 실행 계약은 `AGENT_EXECUTION_CONTRACT_V0.md` 에서 읽는다.
- owner 와 agent 가 공유하는 개발/검증/정본/RAG 용어는 `SHARED_GLOSSARY_V0.md` 에서 읽는다.
- AI 생성 결과의 저장/검토 형식 경계는 `AI_OUTPUT_FORMAT_POLICY_V0.md` 에서 읽는다.

# Ontology Relation Matrix v1

## 목적

- Soulforge 핵심 개체와 관계를 실제 owner root / 파일 경로에 바로 대응시킨다.
- ontology-style 설명을 validator, bootstrap, night_watch 같은 harness 규칙으로 옮기기 쉽게 만든다.

## 개체 매트릭스

| Entity | Owner Surface | Canonical File Shape | 핵심 관계 |
| --- | --- | --- | --- |
| `Species` | `.registry/species/<species_id>/` | `species.yaml` | `unit has_species species` |
| `Class` | `.registry/classes/<class_id>/` | `class.yaml` | `unit has_class class` |
| `Knowledge` | Google Drive approved ontology release -> `.registry/knowledge/<knowledge_id>/` execution projection | release manifest + `knowledge.yaml` | `class uses knowledge`, `workflow may use knowledge`, `release projects knowledge` |
| `Unit` | `.unit/<unit_id>/` | `unit.yaml` | `workflow profile may recommend unit` |
| `Workflow` | `.workflow/<workflow_id>/` | `workflow.yaml` | `workflow guides mission` |
| `Party` | `.party/<party_id>/` | `party.yaml` | `party chains workflow`, `party routes workflow` |
| `Mission` | `.mission/<mission_id>/` | `mission.yaml`, `readiness.yaml` | `monster triggers mission`, `workflow guides mission`, `mission consumes artifact`, `mission produces artifact` |
| `Monster` | project-local or gateway-derived handoff | `_workmeta/<project_code>/ontology/` or gateway-derived request packet | `monster triggers mission` |
| `Artifact` | output/input surface per owner | mission refs or project-local ontology instance | `mission consumes artifact`, `mission produces artifact`, `artifact becomes_input_of next_mission` |
| `Event` | runtime event plane | `guild_hall/state/**`, `private-state/**` | `event records transition` |

### 프로젝트·지식 시간축 확장 개체

| Entity | Owner Surface | Canonical/Record Shape | 핵심 관계 |
| --- | --- | --- | --- |
| `Project` | project owner / dev-ERP | cross-system `project_code`; `core_project.id` is local alias | `gate/branch belongs_to project` |
| `Gate` | project-local SE metadata (candidate writer) | stable `gate_id` mapped to stage code | `rule applies_to gate`, `event at_gate gate` |
| `Branch` | project context graph | stable `branch_id` | `event/task/artifact on_branch branch` |
| `Task` | ERP/task owner | stable `task_id` | `task uses knowledge`, `task generated_from rule_revision` |
| `Actor` | account/team/worker owner | opaque stable person/team/Codex/bot/system ref | `actor performs event`, access-controlled |
| `SourceCollection` | source catalog metadata | stable collection ID + typed member refs | `source_collection contains source` |
| `Source` | source catalog/card metadata | stable `source_id` + legacy aliases | `source has_revision source_revision` |
| `SourceRevision` | `_workmeta/system/**` or `_workmeta/<project>/**`; public official mirror may appear in registry | opaque `source_revision_id` + full `content_id` + content basis/time/provenance | `event sourced_from`, derived artifact `derived_from` |
| `EvidenceLocator` | source-text traceability metadata | page/section/table/record locator, no body | `evidence_locator supports claim` |
| `FileRevision` | project file-activity owner | `logical_file_id` + `revision_id` + full `content_id` | `source_revision materialized_as file_revision` |
| `ExtractionRun` | run metadata owner | parser/tool/profile-bound run ref | `extraction_run derived_from source_revision` |
| `RagIndex` / `RagChunk` | approved `_workspaces/knowledge/**` RAG lane | rebuildable index/chunk IDs | `rag index/chunk derived_from source_revision` |
| `WikiPage` / `WikiRevision` | private sourcebound Wiki owner | logical page + sourcebound revision refs | `wiki_revision derived_from source_revision` |
| `Claim` | sourcebound review metadata | atomic claim ID + support refs + claim ceiling | `evidence supports claim` |
| `Rule` / `RuleRevision` | workflow/SE rule metadata (canonical writer pending) | stable logical rule + exact revision + authority/normativity/applicability | `rule_revision derived_from claim`, `applies_to gate/artifact` |
| `KnowledgeRevisionRef` | registry/private-canon owner | exact git commit/content hash or Wiki revision/content hash/decision ref | `knowledge has_revision knowledge_revision`, `knowledge_revision consolidates claim/rule`, `event/task/artifact uses knowledge revision` |
| `ArtifactType` | SE/project artifact taxonomy (canonical writer pending) | stable artifact type ID | `rule_revision applies_to artifact_type` |
| `ArtifactRevision` | project artifact metadata | `artifact_id` + immutable revision ID; semantic `artifact_version` stays separate | `artifact_revision uses/generated_from rule_revision`, `materialized_as file_revision` |

## 관계 매트릭스

| Relation | Source | Target | 현재 대표 필드 |
| --- | --- | --- | --- |
| `unit has_species species` | `.unit/<unit_id>/unit.yaml` | `.registry/species/<species_id>/species.yaml` | `identity.species_id` |
| `unit has_class class` | `.unit/<unit_id>/unit.yaml` | `.registry/classes/<class_id>/class.yaml` | `class_ids[]` |
| `class uses knowledge` | `.registry/classes/<class_id>/knowledge_refs.yaml` | `.registry/knowledge/<knowledge_id>/knowledge.yaml` | `assign[].ref` |
| `workflow may use knowledge` | `knowledge_access` ledger or workflow-local metadata | `.registry/knowledge/<knowledge_id>/knowledge.yaml` | metadata-only access/ref rows; signal not acceptance |
| `workflow profile recommends unit` | `.workflow/<workflow_id>/profile_policy.yaml` + calibrations | `.unit/<unit_id>/unit.yaml` | optimized execution profile when available |
| `workflow guides mission` | `.mission/<mission_id>/mission.yaml` | `.workflow/<workflow_id>/workflow.yaml` | `workflow_id` |
| `party chains workflow` | `.party/<party_id>/party.yaml` | `.workflow/<workflow_id>/workflow.yaml` | `workflow_chain`, `default_workflow_id`, `allowed_workflows.yaml` |
| `party routes workflow` | `.party/<party_id>/party.yaml` | `.workflow/<workflow_id>/workflow.yaml` | entry workflow and chain-level routing hints |
| `monster triggers mission` | project-local ontology instance or tracked handoff | `.mission/<mission_id>/mission.yaml` | `monster_type`, project-local relation note |
| `mission consumes artifact` | `.mission/<mission_id>/mission.yaml` or project-local ontology instance | artifact ref | `input_refs.*` |
| `mission produces artifact` | `.mission/<mission_id>/resolved_plan.yaml` or project-local ontology instance | artifact ref | output packet / local ontology instance |
| `artifact becomes_input_of next_mission` | project-local ontology instance | next mission | `_workmeta/<project_code>/ontology/` relation |
| `event records transition` | runtime event plane | mission/monster/artifact transition | append-only event payload |

### 프로젝트·지식 시간축 확장 관계

| Relation | Source | Target | owner/record rule |
| --- | --- | --- | --- |
| `source_collection contains source` | source collection metadata | canonical source | bundle/index ref를 source alias로 오인하지 않음 |
| `source has_revision source_revision` | source catalog/card | exact source revision metadata | alias/path가 아니라 canonical `source_id`로 연결 |
| `knowledge has_revision knowledge_revision` | logical registry/private-canon knowledge | exact immutable knowledge revision ref | bare `knowledge_id`를 과거 근거로 사용하지 않음 |
| `source_revision materialized_as file_revision` | exact source revision | project file revision/content | full `content_id` exact join; path/mtime 추론 금지 |
| `artifact_revision materialized_as file_revision` | exact artifact revision | project file revision/content | semantic `artifact_version`과 file `revision_id`를 합치지 않음 |
| `event sourced_from source_revision` | mail/voice/SE/request input event | exact raw/body/record revision | 입력 사건과 RAG/Wiki가 같은 source revision으로 합류 |
| `event observes file_revision` | file scan/observation event | exact file revision | node/scan/path 관측을 append-only 보존 |
| `source_revision derived_from source_revision` | transcript/normalized derived source | audio/parent source revision | source-bearing event는 1..N revision을 가리킬 수 있고 RAG는 실제 읽은 derived revision을 사용 |
| `derived_from` | extraction/RAG/Wiki revision | source revision | exact `source_revision_id`; source 최신값 암시 금지 |
| `rag_chunk traces_to evidence_locator` | exact RAG chunk | page/section/table locator | chunk와 source 위치를 결정적으로 왕복 |
| `wiki_revision presents claim` | exact Wiki revision | sourcebound claim | Wiki 설명과 검증 가능한 claim을 분리 |
| `evidence_locator supports claim` | page/section/table locator | claim | locator와 claim ceiling 필수 |
| `rule_revision derived_from claim` | exact rule revision | source-backed claim | evidence 없는 legacy rule은 `review_required` |
| `knowledge_revision consolidates claim_or_rule` | exact registry/private-canon revision | claim/rule revision | exact revision과 promotion/review 결과가 있어야 함 |
| `newer_revision supersedes older_revision` | source/rule/wiki/artifact revision | same logical entity revision | effective time과 방향을 보존 |
| `rule_revision applies_to gate_or_artifact_type` | rule revision | gate/artifact type/project scope | 적용 범위를 명시하고 universal rule로 부풀리지 않음 |
| `event_or_task uses source_revision_or_rule_or_knowledge` | project event/task/artifact revision | source/rule/knowledge | `_workmeta/<project>/ontology/` metadata relation |
| `task_or_artifact_revision generated_from rule_revision` | task/event/artifact revision | rule revision | 자동 생성/제안 근거와 사람 승인 상태 보존 |
| `event_or_task on_branch branch` | event/task/artifact revision | branch | exact branch ref만 확정 관계 |
| `event_or_task at_gate gate` | event/task/artifact revision | gate | exact gate/stage mapping만 확정 관계 |

모든 relation endpoint는 `{entity_type, owner_surface, entity_id}` 3-tuple을 사용한다.
relation state, relation lifecycle, claim ceiling, application state, entity lifecycle은 서로
다른 축으로 기록한다.

## owner 경계

- ontology 정의와 관계 규칙은 public foundation 문서가 소유한다.
- reusable canon entry 는 각 owner root 가 소유한다. `Knowledge`의 release
  lineage는 승인된 Drive ontology package가, public-safe Git 실행 투영은
  `.registry/knowledge`가 소유한다.
- project-local relation truth 는 `_workmeta/<project_code>/ontology/` 가 소유한다.
- runtime event 는 `guild_hall/state/**`, `private-state/**` 가 소유한다.
- runtime event plane 은 ontology schema owner 가 아니다.

## validator 에 바로 옮길 최소 규칙

1. `species_id`, `class_id`, `unit_id`, `workflow_id`, `party_id`, `mission_id` 는 각 canonical file 과 폴더명에 맞아야 한다.
2. `unit.identity.species_id` 는 존재하는 `Species` 여야 한다.
3. `unit.identity.hero_id` 는 해당 species 안의 `heroes[].hero_id` 안에서 resolve 되어야 한다.
4. `unit.class_ids[]` 는 존재하는 `Class` 여야 한다.
5. `.registry/classes/<class_id>/knowledge_refs.yaml` 의 `assign[].ref` 는 존재하는 `Knowledge` 여야 한다.
6. `mission.workflow_id` 가 있으면 존재하는 `Workflow` 여야 한다.
7. `mission.party_id` 는 존재하는 `Party` 여야 한다.
8. `mission.workflow_id = null` 은 `readiness.status = blocked` 와 `checks.workflow_present = missing` 일 때만 허용한다.
9. `source_revision_id`가 있는 record는 `source_id`, full SHA-256 `content_id`,
   `content_basis`, provenance/time ref를 함께 가져야 한다. structured record면
   `canonicalization_profile_id`, 별도 발행이면 `issuance_occurrence_id`를 보존한다.
10. RAG/Wiki/claim/rule의 `source_supported` 관계는 exact `source_revision_id`와
    locator 또는 명시적 source-level support를 가져야 한다.
11. project knowledge application은 exact `project_id`와 하나 이상의
    source/rule/knowledge ref를 가져야 하며 raw body/chunk text를 포함하지 않는다.
12. legacy alias는 canonical `source_id` 하나로만 resolve되어야 한다. 다중 resolve는
    merge가 아니라 conflict다.
13. generic `source_ref_id`는 verified same-source가 아니면 alias가 아니라 typed ref 또는
    SourceCollection relation이어야 한다.
14. bitemporal replay/query는 `valid_at`과 `known_at`을 모두 받아야 한다.
15. `knowledge_id`를 업무 근거로 쓰면 exact `knowledge_revision_ref`가 함께 있어야 한다.

## promotion 흐름

1. project-local 에서 새 관계가 보이면 `_workmeta/<project_code>/reports/procedure_capture/promotion_candidate_register.md` 에 먼저 남긴다.
2. cross-project 의미가 있으면 `guild_hall/state/operations/soulforge_activity/**` 에 carry-forward 한다.
3. public-safe 로 추상화가 끝나면 foundation 문서 또는 owner root canon 으로 승격한다.

## 관련 경로

- [`ONTOLOGY_MODEL_V0.md`](ONTOLOGY_MODEL_V0.md)
- [`ONTOLOGY_REVIEW_MANUAL_V0.md`](ONTOLOGY_REVIEW_MANUAL_V0.md)
- [`TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md`](TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md)
- [`AGENT_WORLD_MODEL.md`](AGENT_WORLD_MODEL.md)
- [`../ui/UI_SYNC_CONTRACT.md`](../ui/UI_SYNC_CONTRACT.md)

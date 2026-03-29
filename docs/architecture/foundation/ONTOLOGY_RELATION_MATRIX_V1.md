# Ontology Relation Matrix v1

## 목적

- Soulforge 핵심 개체와 관계를 실제 owner root / 파일 경로에 바로 대응시킨다.
- ontology-style 설명을 validator, bootstrap, night_watch 같은 harness 규칙으로 옮기기 쉽게 만든다.

## 개체 매트릭스

| Entity | Owner Surface | Canonical File Shape | 핵심 관계 |
| --- | --- | --- | --- |
| `Species` | `.registry/species/<species_id>/` | `species.yaml` | `unit has_species species` |
| `Class` | `.registry/classes/<class_id>/` | `class.yaml` | `unit has_class class` |
| `Unit` | `.unit/<unit_id>/` | `unit.yaml` | `party assigns unit` |
| `Workflow` | `.workflow/<workflow_id>/` | `workflow.yaml` | `workflow guides mission` |
| `Party` | `.party/<party_id>/` | `party.yaml` | `party assigns unit`, `party routes workflow` |
| `Mission` | `.mission/<mission_id>/` | `mission.yaml`, `readiness.yaml` | `monster triggers mission`, `workflow guides mission`, `mission consumes artifact`, `mission produces artifact` |
| `Monster` | project-local or gateway-derived handoff | `_workmeta/<project_code>/ontology/` or gateway-derived request packet | `monster triggers mission` |
| `Artifact` | output/input surface per owner | mission refs or project-local ontology instance | `mission consumes artifact`, `mission produces artifact`, `artifact becomes_input_of next_mission` |
| `Event` | runtime event plane | `guild_hall/state/**`, `private-state/**` | `event records transition` |

## 관계 매트릭스

| Relation | Source | Target | 현재 대표 필드 |
| --- | --- | --- | --- |
| `unit has_species species` | `.unit/<unit_id>/unit.yaml` | `.registry/species/<species_id>/species.yaml` | `identity.species_id` |
| `unit has_class class` | `.unit/<unit_id>/unit.yaml` | `.registry/classes/<class_id>/class.yaml` | `class_ids[]` |
| `party assigns unit` | `.party/<party_id>/party.yaml` + slots | `.unit/<unit_id>/unit.yaml` | reusable slot model, later assignment |
| `workflow guides mission` | `.mission/<mission_id>/mission.yaml` | `.workflow/<workflow_id>/workflow.yaml` | `workflow_id` |
| `party routes workflow` | `.party/<party_id>/party.yaml` | `.workflow/<workflow_id>/workflow.yaml` | `default_workflow_id`, `allowed_workflows.yaml` |
| `monster triggers mission` | project-local ontology instance or tracked handoff | `.mission/<mission_id>/mission.yaml` | `monster_type`, project-local relation note |
| `mission consumes artifact` | `.mission/<mission_id>/mission.yaml` or project-local ontology instance | artifact ref | `input_refs.*` |
| `mission produces artifact` | `.mission/<mission_id>/resolved_plan.yaml` or project-local ontology instance | artifact ref | output packet / local ontology instance |
| `artifact becomes_input_of next_mission` | project-local ontology instance | next mission | `_workmeta/<project_code>/ontology/` relation |
| `event records transition` | runtime event plane | mission/monster/artifact transition | append-only event payload |

## owner 경계

- ontology 정의와 관계 규칙은 public foundation 문서가 소유한다.
- reusable canon entry 는 각 owner root 가 소유한다.
- project-local relation truth 는 `_workmeta/<project_code>/ontology/` 가 소유한다.
- runtime event 는 `guild_hall/state/**`, `private-state/**` 가 소유한다.
- runtime event plane 은 ontology schema owner 가 아니다.

## validator 에 바로 옮길 최소 규칙

1. `species_id`, `class_id`, `unit_id`, `workflow_id`, `party_id`, `mission_id` 는 각 canonical file 과 폴더명에 맞아야 한다.
2. `unit.identity.species_id` 는 존재하는 `Species` 여야 한다.
3. `unit.identity.hero_id` 는 해당 species 안의 `heroes[].hero_id` 안에서 resolve 되어야 한다.
4. `unit.class_ids[]` 는 존재하는 `Class` 여야 한다.
5. `mission.workflow_id` 가 있으면 존재하는 `Workflow` 여야 한다.
6. `mission.party_id` 는 존재하는 `Party` 여야 한다.
7. `mission.workflow_id = null` 은 `readiness.status = blocked` 와 `checks.workflow_present = missing` 일 때만 허용한다.

## promotion 흐름

1. project-local 에서 새 관계가 보이면 `_workmeta/<project_code>/reports/procedure_capture/promotion_candidate_register.md` 에 먼저 남긴다.
2. cross-project 의미가 있으면 `guild_hall/state/operations/soulforge_activity/**` 에 carry-forward 한다.
3. public-safe 로 추상화가 끝나면 foundation 문서 또는 owner root canon 으로 승격한다.

## 관련 경로

- [`ONTOLOGY_MODEL_V0.md`](ONTOLOGY_MODEL_V0.md)
- [`ONTOLOGY_REVIEW_MANUAL_V0.md`](ONTOLOGY_REVIEW_MANUAL_V0.md)
- [`AGENT_WORLD_MODEL.md`](AGENT_WORLD_MODEL.md)
- [`../ui/UI_SYNC_CONTRACT.md`](../ui/UI_SYNC_CONTRACT.md)

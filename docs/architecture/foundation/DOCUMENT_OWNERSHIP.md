# 문서 소유 원칙

## 목적

- 어떤 문서가 어느 폴더 설명의 정본인지 저장소 전체 관점에서 고정한다.
- active layer, catalog layer, canonical definition layer 의 owner 경계를 문서에도 반영한다.

## 기본 원칙

- 루트 `README.md` 는 저장소 전체 상위 지도만 다룬다.
- 각 폴더 바로 아래 `README.md` 는 그 폴더 개요의 정본이다.
- `.agent` 상세 운영은 `.agent/docs/architecture/*` 와 각 `.agent/**/README.md` 가 정본이다.
- `.agent_class` 상세 운영은 `.agent_class/docs/architecture/*` 와 각 `.agent_class/**/README.md` 가 정본이다.
- root `docs/architecture/` 는 저장소 전체 구조와 owner 경계만 다룬다.

## 폴더별 정본 문서

| 대상 폴더/범위 | 상위 지도 정본 | 상세 정본 |
| --- | --- | --- |
| 저장소 루트 `./` | `README.md` | `docs/architecture/foundation/REPOSITORY_PURPOSE.md`, `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` |
| `.agent/` | `.agent/README.md` | `.agent/docs/architecture/AGENT_BODY_MODEL.md`, `.agent/docs/architecture/BODY_METADATA_CONTRACT.md` |
| `.agent/identity/` | `.agent/identity/README.md` | `.agent/identity/README.md`, `.agent/docs/architecture/HERO_OVERLAY_MODEL.md` |
| `.agent/catalog/` | `.agent/catalog/README.md` | `.agent/catalog/README.md`, `.agent/docs/architecture/AGENT_CATALOG_LAYER_MODEL.md` |
| `.agent/catalog/identity/` | `.agent/catalog/identity/README.md` | `.agent/catalog/identity/README.md` |
| `.agent/catalog/class/` | `.agent/catalog/class/README.md` | `.agent/catalog/class/README.md` |
| `.agent/registry/` | `.agent/registry/README.md` | `.agent/registry/README.md` |
| `.agent/policy/` | `.agent/policy/README.md` | `.agent/policy/README.md` |
| `.agent/docs/architecture/` | `.agent/docs/architecture/AGENT_BODY_MODEL.md` | `.agent/docs/architecture/AGENT_BODY_MODEL.md`, `.agent/docs/architecture/BODY_METADATA_CONTRACT.md`, `.agent/docs/architecture/AGENT_CATALOG_LAYER_MODEL.md`, `.agent/docs/architecture/HERO_OVERLAY_MODEL.md` |
| `.agent_class/` | `.agent_class/README.md` | `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`, `.agent_class/docs/architecture/CLASS_LOADOUT_MODEL.md` |
| `.agent_class/profiles/` | `.agent_class/profiles/README.md` | `.agent_class/profiles/README.md`, `.agent_class/docs/architecture/CLASS_PROFILE_MODEL.md` |
| `.agent_class/manifests/` | `.agent_class/manifests/README.md` | `.agent_class/manifests/README.md`, `.agent_class/docs/architecture/CLASS_VALIDATION_RULES.md` |
| `.agent_class/docs/plans/` | `.agent_class/docs/plans/README.md` | `.agent_class/docs/plans/*.md` |
| `apps/`, `packages/`, `tools/`, `fixtures/`, `schemas/` | `README.md` | relocation 안내용 `README.md` |
| `ui-workspace/` | `README.md` | `ui-workspace/README.md`, `ui-workspace/DONE.md`, `ui-workspace/docs/README.md` |
| `ui-workspace/apps/` | `ui-workspace/README.md` | `ui-workspace/apps/README.md`, `ui-workspace/apps/renderer-web/README.md` |
| `ui-workspace/packages/` | `ui-workspace/README.md` | `ui-workspace/packages/README.md`, `ui-workspace/packages/*/README.md` |
| `ui-workspace/tools/` | `ui-workspace/README.md` | `ui-workspace/tools/README.md`, `ui-workspace/tools/ui-lint/README.md`, `ui-workspace/tools/ui-lint/LINT_RULES.md`, `ui-workspace/tools/scripts/*` |
| `ui-workspace/fixtures/` | `ui-workspace/README.md` | `ui-workspace/fixtures/README.md`, `ui-workspace/fixtures/ui-state/README.md` |
| `ui-workspace/schemas/` | `ui-workspace/README.md` | `ui-workspace/schemas/README.md`, `ui-workspace/schemas/ui-state.schema.json` |
| `docs/ui/` | `README.md` | relocation 안내 문서 세트 |
| `_workspaces/` | `_workspaces/README.md` | `_workspaces/README.md` |
| `_workspaces/.../<project>/.project_agent/` | 해당 프로젝트 문서 | `contract.yaml` 과 같은 project-owned 계약 파일 |
| `ui/` | `ui/README.md` | `ui/viewer/README.md` |
| `docs/architecture/` | `README.md` | `docs/architecture/README.md`, `docs/architecture/foundation/README.md`, `docs/architecture/workspace/README.md`, `docs/architecture/ui/README.md`, `docs/architecture/lifecycle/README.md` |
| `docs/architecture/foundation/` | `docs/architecture/README.md` | `docs/architecture/foundation/REPOSITORY_PURPOSE.md`, `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`, `docs/architecture/foundation/AGENT_WORLD_MODEL.md` |
| `docs/architecture/workspace/` | `docs/architecture/README.md` | `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md`, `docs/architecture/workspace/PROJECT_AGENT_MINIMUM_SCHEMA.md`, `docs/architecture/workspace/PROJECT_AGENT_RESOLVE_CONTRACT.md` |
| `docs/architecture/ui/` | `docs/architecture/README.md` | `docs/architecture/ui/UI_SOURCE_MAP.md`, `docs/architecture/ui/UI_SYNC_CONTRACT.md`, `docs/architecture/ui/UI_DERIVED_STATE_CONTRACT.md`, `docs/architecture/ui/UI_CONTROL_CENTER_MODEL.md` |
| `docs/architecture/lifecycle/` | `docs/architecture/README.md` | `docs/architecture/lifecycle/V1_CLOSEOUT_CHECKLIST.md`, `docs/architecture/lifecycle/KNOWN_LIMITATIONS.md` |
| `docs/architecture/archive/` | `docs/architecture/README.md` | `docs/architecture/archive/README.md`, `docs/architecture/archive/foundation/README.md` |
| `docs/architecture/archive/foundation/` | `docs/architecture/archive/README.md` | `docs/architecture/archive/foundation/MIGRATION_REFERENCE.md`, `docs/architecture/archive/foundation/agent_body_finalization_report.md` |
| `dev/` | `dev/README.md` | `dev/plan/`, `dev/log/` 하위 문서 |

## 적용 규칙

1. 루트 문서에는 owner-local 세부 운영을 장문으로 복제하지 않는다.
2. `.agent/catalog/class/**` 는 selection index 이므로 canonical asset 설명을 `.agent_class/**` 에서 복제하지 않는다.
3. `.agent_class/profiles/**` 는 canonical profile 정본이고 `.agent/identity/**` 는 hero overlay 를 포함한 active identity 정본이다.
4. renderer consumer 문서와 구현 정본은 `ui-workspace/docs/`, `ui-workspace/packages/`, `ui-workspace/apps/`, `ui-workspace/fixtures/`, `ui-workspace/schemas/` 로 나눠 유지한다.
5. 폴더 구조나 책임이 바뀌면 같은 변경 안에서 해당 README 와 owner 문서를 함께 갱신한다.

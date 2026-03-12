# 2026-03-12 canonical loadout identity catalog round log

관련 계획: [2026-03-12_canonical_loadout_identity_catalog_round_plan.md](../plan/2026-03-12_canonical_loadout_identity_catalog_round_plan.md)

## 수행 순서

- `A → C1 → B → C2` 순서로 수행했다.
- 이번 라운드는 기존 skeleton 을 대체하지 않고, canonical / active / catalog semantics 를 더 명확히 적는 정리 작업으로 마감했다.

## A. `.agent_class` canonical loadout 확정

### 변경

- `.agent_class/class.yaml` 에 canonical loadout semantics 와 `profile=preferred`, `workflow=required` 의미를 명시했다.
- `.agent_class/profiles/default.profile.yaml` 에 `mode: preferred` 와 `semantics` 블록을 추가했다.
- `.agent_class/workflows/sample_workflow_briefing/module.yaml` 에 workflow `required` semantics 를 추가했다.
- `.agent_class/manifests/{capability_index,dependency_graph,equip_rules}.yaml` 에 canonical loadout / preferred / required 의미를 반영했다.
- `.agent_class/README.md`, `profiles/README.md`, `skills/README.md`, `tools/README.md`, `knowledge/README.md`, `workflows/README.md`, `manifests/README.md` 를 Stable/canonical owner 관점으로 정리했다.

### 검증

- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check` → PASS
- changed YAML parse → PASS
- `.agent_class` target tree compare → PASS
- class catalog `source_ref` check → PASS
- changed README link check → PASS

## C1. active identity / binding 정리

### 변경

- `.agent/identity/hero_imprint.yaml` 에 `storage_model`, `precedence_role`, `semantics` 를 추가해 hero 가 identity overlay 임을 고정했다.
- `.agent/identity/identity_manifest.yaml` 에 species / hero / profile / workflow semantic role 을 명시했다.
- `.agent/registry/active_class_binding.yaml` 에 class catalog selection layer ref 와 semantic role 을 추가했다.
- `.agent/registry/trait_bindings.yaml` 에 semantic layer 요약을 추가했다.
- `.agent/identity/README.md`, `.agent/registry/README.md` 에 species durable default / hero overlay / profile preferred mode 관계를 다시 적었다.

### 검증

- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check` → PASS
- changed YAML parse → PASS
- active identity / registry target tree compare → PASS
- 관련 catalog `source_ref` check → PASS
- changed README link check → PASS

## B. class selection catalog 정리

### 변경

- `.agent/catalog/class/**` catalog YAML 전반에 `index_mode: source_ref_only` 를 추가했다.
- profile catalog 에 `selection_semantics: preferred`, workflow catalog 에 `selection_semantics: required` 를 추가했다.
- class catalog README 들에 source-ref only selection layer, tool family 분리, active state derived 원칙을 명시했다.

### 검증

- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check` → PASS
- changed YAML parse → PASS
- class catalog target tree compare → PASS
- class catalog `source_ref` check → PASS
- changed README link check → PASS

## C2. identity candidate catalog 정리

### 변경

- `.agent/catalog/identity/species/index.yaml` 에 source-ref only / durable default candidate semantics 를 추가했다.
- `.agent/catalog/identity/heroes/index.yaml` 에 `storage_model: motif_imprint`, source-ref only, identity overlay candidate semantics 를 추가했다.
- `soulforge-default.species.yaml` 과 `craft_sage.hero.yaml` 에 selection role / storage model 을 명시했다.
- identity catalog README 들에 species candidate / hero motif-imprint canonical source 규칙을 추가했다.

### 검증

- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check` → PASS
- changed YAML parse → PASS
- identity catalog target tree compare → PASS
- identity catalog `source_ref` check → PASS
- changed README link check → PASS

## 최종 검증

- full target tree compare → PASS (`58` expected paths 확인)
- full catalog `source_ref` check → PASS (`10` catalogs 확인)
- full README link check → PASS (`61` README files 확인)
- `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py validate` → expected non-zero

`validate` 결과:

- FAIL: `_workspaces/company/sample_invalid_project/.project_agent/workflow_bindings.yaml` 의 `bindings[1].entrypoint` 가 workflow manifest `run` 과 불일치
- WARN: `contract.default_loadout` 는 아직 `.agent_class/loadout.yaml.active_profile` 단일 값 기준만 검사

이번 라운드 변경으로 새 validate FAIL 은 생기지 않았고, 기존 invalid sample baseline 만 유지된다.

## 작업량 요약

- `41 files changed`
- `137 insertions`, `6 deletions`

## ASSUMPTIONS

- 기존 `default.profile.yaml`, class catalog, identity catalog 는 이미 존재하므로 재생성 대신 semantics 정리 대상으로 취급했다.
- milestone 통과 기준은 사용자 지정 5개 검증 항목으로 해석했고, known invalid workspace baseline 에 의해 실패하는 `validate` 는 참고 결과로만 기록했다.

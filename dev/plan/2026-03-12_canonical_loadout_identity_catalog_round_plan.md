# 2026-03-12 canonical loadout identity catalog round plan

## 목표

- 이번 라운드를 `A → C1 → B → C2` 순서로 수행한다.
- `.agent_class` 를 canonical loadout layer 로 다시 명시하고, `.agent` 의 active identity / catalog selection layer 와의 경계를 더 선명하게 만든다.
- 각 milestone 뒤에 `sync-body-state --check`, YAML parse, `TARGET_TREE` 비교, catalog `source_ref` 점검, README 링크 점검을 수행한다.

## 수행 순서

### A. `.agent_class` canonical loadout 확정

- `class.yaml`, `profiles/`, `skills/`, `tools/`, `knowledge/`, `workflows/`, `manifests/` 문구를 canonical loadout 관점으로 정리한다.
- `default.profile.yaml` 을 canonical default preference mode 로 유지하고 의미를 명시한다.
- profile 은 `preferred`, workflow 는 `required` semantics 임을 YAML 과 README, architecture 문서 표현에 맞춘다.

### C1. active identity / class binding 정리

- `.agent/identity/hero_imprint.yaml` 와 `identity_manifest.yaml` 을 정리한다.
- `.agent/registry/active_class_binding.yaml`, `trait_bindings.yaml` 을 갱신한다.
- hero 는 identity overlay, profile 은 preferred mode, species 는 durable default 라는 설명을 active layer 문서와 YAML notes 에 맞춘다.

### B. class selection catalog 정리

- `.agent/catalog/class/**` 를 source-ref 기반 selection layer 로 재확인한다.
- `profiles/skills/tools/knowledge/workflows` catalog 표현을 정리한다.
- tool family 는 `adapters`, `connectors`, `local_cli`, `mcp` 로 분리 유지한다.
- catalog 는 `.agent_class/**` canonical asset 을 복제하지 않고 `source_ref` 중심 index 임을 YAML 과 README 에 반영한다.

### C2. identity candidate catalog 정리

- `.agent/catalog/identity/species/**`, `.agent/catalog/identity/heroes/**` 의 candidate catalog / index 표현을 정리한다.
- hero candidate 는 motif / imprint 구조로 저장한다.

## 검증 기준

1. `python3 .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check`
2. 변경 대상 YAML parse 검사
3. `docs/architecture/TARGET_TREE.md` 와 실제 구조 비교
4. catalog `source_ref` resolve 검사
5. README 상대 링크 검사

## done criteria

- `.agent_class` 는 canonical loadout layer 로 문서와 YAML 에서 일관되게 표현된다.
- profile `preferred`, workflow `required` semantics 가 `.agent_class` 와 `.agent/registry` 양쪽에서 읽힌다.
- hero overlay / species default / profile preferred mode 의미가 active identity 문서와 YAML 에 반영된다.
- `.agent/catalog/class/**` 와 `.agent/catalog/identity/**` 는 `source_ref` 중심 selection catalog 로 유지된다.
- 검증 결과와 남은 known limitation 은 `dev/log` 에 기록한다.

## ASSUMPTIONS

- 기존에 이미 존재하는 `default.profile.yaml`, class catalog, identity catalog 는 새로 대체하지 않고 이번 라운드 기준에 맞게 정리만 한다.
- `validate` 명령의 `sample_invalid_project` FAIL 은 known baseline 이므로, 이번 라운드의 milestone 검증 필수 항목에서는 사용자 지시 목록에 포함된 검사만 통과 기준으로 본다.

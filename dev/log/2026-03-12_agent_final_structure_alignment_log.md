# 2026-03-12 `.agent` 최종 구조 정합화 로그

## 작업 목적

`.agent` 하위 구조를 durable agent unit 기준으로 재정렬하고, root 문서와 body 문서가 같은 최종 구조를 읽도록 맞춘다.

## 주요 변경

- `.agent` 하위 `README.md` 를 owner 경계 중심 6개 섹션 형식으로 통일했다.
- `body.yaml` 에 `operating_constraints`, `section_files` 를 추가하고 section-owned YAML 메타 파일 집합을 고정했다.
- `species_profile.yaml`, `trait_bindings.yaml`, `identity_manifest.yaml` 등 body-owned YAML 메타를 각 section 아래에 추가했다.
- `protocols/` 를 현재 body 공통 operating contract 경계로 고정했다.
- `registry/` 를 source of truth 저장소가 아니라 binding/index/reference 계층으로 좁혔다.
- `engine/` 은 경로를 유지하고 runtime 의미를 우선하는 방향으로 문서와 메타를 재정의했다.
- 루트 `README.md` 는 상위 지도 전용으로 축소했고, `.agent` 상세 운영의 정본을 `.agent/docs/architecture/*` 와 각 로컬 `README.md` 로 명시했다.
- `TARGET_TREE.md` 와 `DOCUMENT_OWNERSHIP.md` 를 최종 `.agent` target tree 와 문서 정본 소유 기준에 맞게 갱신했다.

## 생성한 YAML

- `identity/`: `species_profile.yaml`, `identity_manifest.yaml`, `trait_bindings.yaml`
- `communication/`: `human_channel_profile.yaml`, `peer_channel_profile.yaml`
- `engine/`: `context_assembly.yaml`, `tool_scope.yaml`, `sandbox_profile.yaml`
- `policy/`: `precedence.yaml`, `approval_matrix.yaml`, `scope_rules.yaml`
- `protocols/`: `request_contract.yaml`, `handoff_contract.yaml`, `decision_contract.yaml`, `incident_contract.yaml`, `escalation_contract.yaml`
- `registry/`: `active_class_binding.yaml`, `workspace_binding.yaml`, `capability_index.yaml`
- `sessions/`: `checkpoint_template.yaml`

## 검증 결과

- `.agent` 실제 구조와 `docs/architecture/TARGET_TREE.md` 의 최종 `.agent` target tree 가 일치한다.
- 저장소 `README.md` 상대 링크 검사에서 invalid link 가 없었다.
- 저장소 전체 YAML 파싱이 통과했다.
- `body.yaml`, `body_state.yaml`, `species_profile.yaml`, `trait_bindings.yaml` 정합성 체크가 통과했다.
- `.agent/export/` 폴더는 없고 target structure 에도 포함되지 않는다.
- `.agent/protocols/` 는 실제로 존재한다.
- memory 는 `private_first`, sessions 는 `continuity_only`, shared memory inside body 는 `false` 로 고정되어 있다.
- `sessions/` 는 transcript 저장소가 아니라 continuity 저장소로, `autonomic/` 은 daemon 이 아니라 저소음 품질 보정으로 문서화되어 있다.

## 남은 리스크

- `engine/` 실제 경로 rename 은 아직 수행하지 않았고, 현재는 runtime 의미 재정의로 정리했다.
- `artifacts/`, `autonomic/`, `memory/` 는 YAML file set 이 더 늘어날 수 있으므로 후속 변경 시 `body.yaml.section_files` 와 target tree 를 함께 갱신해야 한다.

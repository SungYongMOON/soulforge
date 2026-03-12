# .agent/identity

## 목적

- `identity/` 는 본체의 durable identity default 를 둔다.
- 현재 active species 와 optional hero overlay 를 함께 둔다.
- class/workspace binding 이전에 유지되는 기본 정체성과 bias layer 만 담당한다.

## 포함 대상

- `species_profile.yaml`, `hero_imprint.yaml`, `identity_manifest.yaml`
- durable default species, optional hero imprint, active identity 선언
- 장기적으로 유지되는 self-description 기준값

## 제외 대상

- `class.yaml`, `loadout.yaml` 같은 loadout 메타
- body 자산 색인, active class/workspace binding, lookup registry
- 프로젝트별 식별자, 현장 계약, 임시 persona
- session continuity 나 transcript 성 자산

## 대표 파일

- [`species_profile.yaml`](species_profile.yaml): 현재 active species 와 durable default 특질을 정의하는 active identity 파일
- [`hero_imprint.yaml`](hero_imprint.yaml): 현재 active hero overlay 를 motif/imprint 방식으로 기록하는 optional overlay 파일
- [`identity_manifest.yaml`](identity_manifest.yaml): active species ref, active hero ref, catalog ref 를 고정하는 manifest

## 참조 관계

- `identity/` vs `catalog/`: `identity/` 는 현재 active selection 이고, `catalog/identity/` 는 selectable candidate 정본이다.
- `identity/` vs `registry/`: `identity/` 는 "누구인가" 를 정의하는 durable baseline 과 optional hero overlay 이고, `registry/` 는 "무엇이 어디에 있는가" 를 찾기 위한 참조 계층이다.
- `identity/` 는 active class 나 workspace 를 직접 바인딩하지 않으며, species default 와 hero overlay 가 각 subsystem 에 어떻게 작용하는지는 `registry/trait_bindings.yaml` 에서만 선언한다.
- [`../README.md`](../README.md)
- [`../catalog/identity/README.md`](../catalog/identity/README.md)
- [`../registry/README.md`](../registry/README.md)
- [`../docs/architecture/AGENT_BODY_MODEL.md`](../docs/architecture/AGENT_BODY_MODEL.md)

## 변경 원칙

- species 는 durable default 다.
- hero 는 optional overlay 다.
- profile 은 `identity/` 가 아니라 class binding 에서 읽는 preferred mode 다.
- hero candidate 는 실존 인물이나 특정 IP 복제본이 아니라 motif/imprint 계약으로 정규화한다.
- species 외 durable default facet 이 필요하면 여기서 추가하되, selectable candidate 정본은 `catalog/identity/` 에 두고 lookup 용 키 체계는 `registry/` 로 분리한다.
- 상황별 역할 전환 규칙, temporary persona, project-facing identifier 는 이 폴더로 넣지 않는다.
- active species 또는 active hero 를 바꾸면 `species_profile.yaml`, `hero_imprint.yaml`, `identity_manifest.yaml`, `registry/trait_bindings.yaml` 을 같은 변경 안에서 함께 갱신한다.

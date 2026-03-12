# .agent/identity

## 목적

- `identity/` 는 본체의 durable identity default 를 둔다.
- 현재 baseline 은 species only 이며, class/workspace binding 이전에 유지되는 기본 정체성만 담당한다.

## 포함 대상

- `species_profile.yaml`, `identity_manifest.yaml`
- durable default species, naming, baseline identity 선언
- 장기적으로 유지되는 self-description 기준값

## 제외 대상

- `class.yaml`, `loadout.yaml` 같은 loadout 메타
- body 자산 색인, active class/workspace binding, lookup registry
- 프로젝트별 식별자, 현장 계약, 임시 persona
- session continuity 나 transcript 성 자산

## 대표 파일

- [`species_profile.yaml`](species_profile.yaml): species only baseline 과 body-level identity 제약을 정의하는 종 프로필
- [`identity_manifest.yaml`](identity_manifest.yaml): canonical name, body ref, identity baseline 참조를 고정하는 manifest

## 참조 관계

- `identity/` vs `registry/`: `identity/` 는 "누구인가" 를 정의하는 durable baseline 이고, `registry/` 는 "무엇이 어디에 있는가" 를 찾기 위한 참조 계층이다.
- `identity/` 는 active class 나 workspace 를 직접 바인딩하지 않으며, species 에서 파생되는 subsystem binding 도 `registry/trait_bindings.yaml` 에서만 선언한다.
- [`../README.md`](../README.md)
- [`../registry/README.md`](../registry/README.md)
- [`../docs/architecture/AGENT_BODY_MODEL.md`](../docs/architecture/AGENT_BODY_MODEL.md)

## 변경 원칙

- species 외 durable default facet 이 필요하면 여기서 추가하되, lookup 용 키 체계는 `registry/` 로 분리한다.
- 상황별 역할 전환 규칙, temporary persona, project-facing identifier 는 이 폴더로 넣지 않는다.
- species only baseline 을 바꾸면 `species_profile.yaml`, `identity_manifest.yaml`, `registry/trait_bindings.yaml` 을 같은 변경 안에서 함께 갱신한다.

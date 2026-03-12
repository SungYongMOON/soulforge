# .agent/registry

## 목적

- `registry/` 는 본체의 binding, index, reference 계층을 둔다.
- private operating system 내부 자산을 찾고 연결하기 위한 참조 계층과 body-side active binding 선언만 분리한다.

## 포함 대상

- `active_class_binding.yaml`, `workspace_binding.yaml`, `capability_index.yaml`, `trait_bindings.yaml`
- 본체 자산 색인과 참조 테이블
- body 내부 기관 간 연결용 binding/reference 정보
- active profile 과 catalog selection state 의 참조 기준

## 제외 대상

- durable identity default 와 species baseline 본문
- identity candidate 와 class selection catalog 정본
- class 모듈 설치 목록 그 자체
- 실제 프로젝트 상태와 workspace project 원본
- shared team registry

## 대표 파일

- [`active_class_binding.yaml`](active_class_binding.yaml): body 가 현재 연결해 사용하는 class, loadout, active profile ref 를 선언하는 파일
- [`workspace_binding.yaml`](workspace_binding.yaml): body 의 workspace binding 후보와 active binding 부재를 명시하는 파일
- [`capability_index.yaml`](capability_index.yaml): active identity, catalog, binding 메타를 검색하기 위한 capability 색인
- [`trait_bindings.yaml`](trait_bindings.yaml): species default 와 hero overlay 가 communication, sessions, memory, autonomic, artifacts, workflow selection 에 어떻게 작용하는지 선언하는 파일

## 참조 관계

- `identity/` vs `registry/`: `identity/` 가 agent 의 durable self-description 을 정의하면, `registry/` 는 그 identity 를 포함한 body 자산 전반의 위치와 참조 키를 색인한다.
- `registry/` 는 source of truth 본문을 소유하지 않고, `identity/`, `catalog/`, `policy/`, `communication/`, `protocols/`, `runtime/`, `sessions/` 같은 실소유 경계로 연결만 한다.
- active class binding 은 current class/loadout/profile ref 를 가질 수 있지만 canonical asset 정본은 여전히 `.agent_class/**` 다.
- hero overlay 는 bias/signature 만 더하고 사실 판정, policy floor, installed asset availability 를 바꾸지 않는다.
- [`../README.md`](../README.md)
- [`../identity/README.md`](../identity/README.md)
- [`../catalog/README.md`](../catalog/README.md)
- [`../../.agent_class/class.yaml`](../../.agent_class/class.yaml)

## 변경 원칙

- registry 스키마가 늘어나도 source of truth 는 body owner 자산에만 두고, registry 에는 색인과 참조만 남긴다.
- profile 은 preferred semantics 이지 installed asset allowlist 가 아니라는 점을 registry 설명과 바인딩 메타에서 유지한다.
- hero overlay 와 species default 의 적용 관계는 binding 으로만 연결하고 identity 본문을 여기서 복제하지 않는다.
- binding 파일은 실제 선언이 없을 때 unset 상태를 유지하고, 추정된 active binding 을 적지 않는다.
- class, workspace, shared lookup 이 필요하면 각 owner 아래에 별도 registry 를 만들고 여기와 섞지 않는다.

# .agent/registry

## 목적

- `registry/` 는 본체의 binding, index, reference 계층을 둔다.
- private operating system 내부 자산을 찾고 연결하기 위한 참조 계층과 body-side binding 선언만 분리한다.

## 포함 대상

- `active_class_binding.yaml`, `workspace_binding.yaml`, `capability_index.yaml`, `trait_bindings.yaml`
- 본체 자산 색인과 참조 테이블
- body 내부 기관 간 연결용 binding/reference 정보

## 제외 대상

- durable identity default 와 species baseline 본문
- class 모듈 설치 목록 그 자체
- 실제 프로젝트 상태와 workspace project 원본
- shared team registry

## 대표 파일

- [`active_class_binding.yaml`](active_class_binding.yaml): body 의 active class binding 을 선언하되 현재 species only baseline 에서는 unset 상태를 유지하는 파일
- [`workspace_binding.yaml`](workspace_binding.yaml): body 의 workspace binding 후보와 active binding 부재를 명시하는 파일
- [`capability_index.yaml`](capability_index.yaml): section-owned YAML 메타를 검색하기 위한 capability 색인
- [`trait_bindings.yaml`](trait_bindings.yaml): species default trait 를 communication, sessions, memory, autonomic, artifacts 하위 시스템에 바인딩하는 파일

## 참조 관계

- `identity/` vs `registry/`: `identity/` 가 agent 의 durable self-description 을 정의하면, `registry/` 는 그 identity 를 포함한 body 자산 전반의 위치와 참조 키를 색인한다.
- `registry/` 는 source of truth 본문을 소유하지 않고, `identity/`, `policy/`, `communication/`, `protocols/`, `runtime/`, `sessions/` 같은 실소유 경계로 연결만 한다.
- active class/workspace binding 은 `null` 또는 `selected: false` 를 가질 수 있으며, 이는 미결합 선언이지 runtime 상태 추측이 아니다.
- [`../README.md`](../README.md)
- [`../identity/README.md`](../identity/README.md)
- [`../../.agent_class/class.yaml`](../../.agent_class/class.yaml)

## 변경 원칙

- registry 스키마가 늘어나도 source of truth 는 body owner 자산에만 두고, registry 에는 색인과 참조만 남긴다.
- binding 파일은 실제 선언이 없을 때 unset 상태를 유지하고, 추정된 active binding 을 적지 않는다.
- class, workspace, shared lookup 이 필요하면 각 owner 아래에 별도 registry 를 만들고 여기와 섞지 않는다.

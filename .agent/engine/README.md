# .agent/engine

## 목적

- `engine/` 는 현재 경로 이름을 유지하는 runtime layer 다.
- loadout 장비가 아니라 body 공통 실행 기반, context assembly, tool scope, sandbox 선언 프로필을 관리한다.

## 포함 대상

- `context_assembly.yaml`, `tool_scope.yaml`, `sandbox_profile.yaml`
- 본체 runtime 설정
- 실행 루프 기본값과 부트스트랩 메타

## 제외 대상

- species-free floor 정책과 permission 제약
- 도구별 실행 래퍼와 connector 구현
- 프로젝트별 실행 스크립트와 workflow
- host-local 임시 프로세스 상태와 실제 runtime capability 관측값

## 대표 파일

- [`context_assembly.yaml`](context_assembly.yaml): body 메타 소스를 어떤 순서로 조립할지 정의하는 runtime profile
- [`tool_scope.yaml`](tool_scope.yaml): body/tool ownership 과 approval-gated tool scope 를 선언하는 파일
- [`sandbox_profile.yaml`](sandbox_profile.yaml): 실제 sandbox 상태가 아니라 runtime 이 제공해야 할 선언 프로필을 적는 파일

## 참조 관계

- `runtime/` vs `policy/`: `engine/` 은 실행 기반, context assembly, tool scope 를 소유하고, `policy/` 는 그 runtime 이 넘지 말아야 할 floor 와 permission boundary 를 소유한다.
- `protocols/` 는 runtime 을 호출하거나 연결하는 계약을 정의할 수 있지만, runtime 기본값 자체는 `engine/` 의 책임이다.
- `sandbox_profile.yaml` 은 actual runtime state 가 아니라 runtime-defined capability envelope 를 설명한다.
- [`../README.md`](../README.md)
- [`../policy/README.md`](../policy/README.md)
- [`../protocols/README.md`](../protocols/README.md)
- [`../docs/architecture/AGENT_BODY_MODEL.md`](../docs/architecture/AGENT_BODY_MODEL.md)

## 변경 원칙

- 현재 검토 기준에서는 `engine/` 경로를 유지하고 runtime 의미를 일관되게 사용한다.
- `sandbox_profile.yaml` 과 `tool_scope.yaml` 에는 관측되지 않은 actual sandbox 값을 적지 않고 declared profile 만 유지한다.
- 실제 rename 이 필요하면 `policy/`, `protocols/`, body 메타 계약 문서를 포함한 coordinated migration 으로만 다룬다.

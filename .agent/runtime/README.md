# .agent/runtime

## 목적

- `runtime/` 은 이 agent 가 자기 기관을 어떤 순서로 읽고 조립해 실행하는지의 기관실이다.
- body 공통 실행 기반, context assembly, tool scope, sandbox 선언 프로필, delivery 기본값을 관리한다.

## 포함 대상

- `bootstrap_order.md`, `context_assembly.yaml`, `tool_scope.yaml`, `sandbox_profile.yaml`, `delivery_profile.yaml`, `execution_contract.yaml`
- runtime 기본 순서와 실행 phase
- declared runtime profile

## 제외 대상

- species 원본
- 실제 memory 본문과 session checkpoint 본문
- tool adapter 구현과 class workflow
- 관측되지 않은 actual runtime capability 상태

## 대표 파일

- [`bootstrap_order.md`](bootstrap_order.md): 기관 로드 순서를 설명하는 문서
- [`context_assembly.yaml`](context_assembly.yaml): body 메타 소스를 조립하는 순서와 규칙
- [`tool_scope.yaml`](tool_scope.yaml): tool ownership 과 approval gated scope
- [`sandbox_profile.yaml`](sandbox_profile.yaml): actual state 가 아니라 runtime 이 제공해야 할 선언 프로필
- [`delivery_profile.yaml`](delivery_profile.yaml): body 출력 전달 기본값
- [`execution_contract.yaml`](execution_contract.yaml): transportable workflow 의 lineage, verification, idempotency 기본 계약

## 참조 관계

- `runtime/` vs `policy/`: `runtime/` 은 실행 기반과 조립 순서를 소유하고, `policy/` 는 그 runtime 이 넘지 말아야 할 floor 를 소유한다.
- `communication/` 과 `protocols/` 는 runtime 출력 형식과 handoff 절차를 참조할 수 있지만, runtime 자체를 대체하지 않는다.
- `context_assembly.yaml` 은 request contract, execution contract, checkpoint template 을 함께 조립해 transportable workflow runtime 입력으로 사용한다.
- [`../policy/README.md`](../policy/README.md)
- [`../protocols/README.md`](../protocols/README.md)
- [`../docs/architecture/RUNTIME_MODEL.md`](../docs/architecture/RUNTIME_MODEL.md)

## 변경 원칙

- runtime 에는 관측되지 않은 actual sandbox 상태를 적지 않고 declared profile 만 둔다.
- 실행 순서가 바뀌면 `bootstrap_order.md`, `context_assembly.yaml`, `body.yaml`, `body_state.yaml` 을 같은 변경 안에서 갱신한다.
- export concern 은 runtime 안에 두지 않고 전달 프로필 수준으로만 남긴다.

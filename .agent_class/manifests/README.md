# .agent_class/manifests

## 목적

- `manifests/` 는 canonical asset index 와 equip rule, dependency graph 를 둔다.
- runtime 임시 상태가 아니라 class 정본 요약 계층이다.
- `.agent_class` canonical loadout 을 다른 계층이 읽을 때 우선 참조하는 summary layer 다.

## 포함 대상

- `capability_index.yaml`
- `equip_rules.yaml`
- `dependency_graph.yaml`

## 규칙

- profile semantics 는 `preferred` 로 기록한다.
- workflow semantics 는 `required` 로 기록한다.
- manifest 는 selection state 를 소유하지 않고 canonical source 와 관계만 요약한다.

## 상태

- Stable

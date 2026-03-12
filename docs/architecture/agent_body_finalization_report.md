# Soulforge `.agent` 구조 확정 보고서 v2

이 문서는 `.agent` 와 `.agent_class` 구조를 최신 개념에 맞춰 다시 정렬한 body finalization report 다.
현재 정본은 `docs/architecture/TARGET_TREE.md`, `.agent/body.yaml`, `.agent_class/class.yaml`, 각 폴더 README 를 따른다.

## 이번 확정의 핵심

1. hero 는 제거하지 않는다.
2. hero 는 `.agent/identity` 의 optional identity overlay 로 둔다.
3. profile 은 hero 대체재가 아니라 class 의 default preference mode 로 정의한다.
4. UI 가 선택할 catalog 는 `.agent/catalog/**` 에 둔다.
5. class canonical asset 정본은 `.agent_class/**` 에 남긴다.

## 3층 모델

| 층 | owner | 예시 |
| --- | --- | --- |
| Active Layer | `.agent` | `.agent/identity/species_profile.yaml`, `.agent/identity/hero_imprint.yaml`, `.agent/registry/active_class_binding.yaml` |
| Catalog Layer | `.agent/catalog/**` | species catalog, hero catalog, profiles/skills/tools/knowledge/workflows catalog |
| Canonical Definition Layer | `.agent/catalog/identity/**`, `.agent_class/**` | identity candidate 정본, class asset 정본 |

## 역할 재정의

| 개념 | 의미 |
| --- | --- |
| species | body 의 durable default |
| hero | species 위에 얹히는 optional overlay |
| class | 설치된 능력 패키지 |
| workflow | explicit `required` 조합식 |
| profile | explicit workflow 가 없을 때 작동하는 default `preferred` mode |

## 우선순위

1. 저장소 규칙 / policy
2. 현재 작업의 명시 지시
3. 선택된 workflow 의 `required`
4. active profile 의 `preferred`
5. active hero overlay 의 bias
6. species default

해석:

- workflow 는 무조건 써야 하는 것
- profile 은 명시가 없을 때 먼저 떠올리는 것
- hero 는 애매할 때 어떤 결로 기우는가
- species 는 기본 체질

## `.agent` 구조 결정

```text
.agent/
├── identity/        # active species + optional hero
├── catalog/         # selection layer
├── registry/        # active binding / index / reference
├── policy/
├── communication/
├── protocols/
├── runtime/
├── memory/
├── sessions/
├── autonomic/
└── artifacts/
```

- `identity/` 는 active selection state 를 둔다.
- `catalog/identity/**` 는 selectable identity candidate 의 canonical source 다.
- `catalog/class/**` 는 selectable class asset index 다.
- generator 나 selection UI 는 `catalog/**` population concern 이지 body core runtime concern 이 아니다.

## `.agent_class` 구조 결정

```text
.agent_class/
├── skills/
├── tools/
├── workflows/
├── knowledge/
├── profiles/
├── manifests/
├── class.yaml
└── loadout.yaml
```

- `.agent_class` 는 reusable loadout template 이다.
- profiles 는 canonical default preference mode 다.
- manifests 는 capability index, equip rule, dependency graph 를 둔다.
- `.agent_class` 는 identity, memory, sessions, autonomic, body policy 를 소유하지 않는다.

## hero 와 profile 충돌 정리

- 이전 문서의 `hero 비도입` 전제는 폐기했다.
- hero 는 다시 도입하되 class 로 내리지 않았다.
- profile 은 hero 대체재가 아니라 workflow 부재 시 기본 제안을 제공하는 운용 모드로 재정의했다.
- hero 와 profile 모두 installed asset 을 disable 하지 않는다.

## catalog layer 결정

- species catalog, hero catalog, profile catalog, skill catalog, tool catalog, knowledge catalog, workflow catalog 는 `.agent/catalog/**` 에 둔다.
- tool catalog 는 `adapters`, `connectors`, `local_cli`, `mcp` family 를 분리한다.
- `.agent/catalog/class/**` 는 `.agent_class/**` 를 복제하지 않고 `source_ref` 기반 index 로 유지한다.

## 이번 단계에서 하지 않는 것

- deep research generator 구현
- selection UI 구현
- hero direct character dataset 구축
- runtime daemon/worker 확장
- `.agent_class/**` canonical asset 을 `.agent/catalog/class/**` 로 복제

# 에이전트 세계관 모델

## 목적

- Soulforge 세계관 개념과 실제 경로 구조의 대응 관계를 정리한다.
- species, hero, class, workflow, profile 의 경계를 owner 기준으로 읽게 만든다.

## 대응 관계

| 세계관 개념 | 실제 구조 | 의미 |
| --- | --- | --- |
| Body / Private Operating System | `.agent/` | durable agent unit |
| Active Identity | `.agent/identity/` | active species 와 optional hero overlay |
| Selection Catalog | `.agent/catalog/` | UI selection layer |
| Canonical Identity Candidates | `.agent/catalog/identity/**` | selectable species 와 hero candidate 정본 |
| Loadout Template | `.agent_class/` | reusable class/loadout template |
| Canonical Class Assets | `.agent_class/**` | skills, tools, workflows, knowledge, profiles, manifests |
| Mission Site | `_workspaces/` | 실제 프로젝트 현장 |

## 핵심 해석

- species 는 durable default 다.
- hero 는 species 위에 얹히는 optional identity overlay 다.
- class 는 설치 가능한 능력 패키지다.
- workflow 는 explicit `required` 조합식이다.
- profile 은 explicit workflow 가 없을 때 동작하는 default `preferred` mode 다.
- policy 는 species/hero/profile 위에 있는 species-free floor 다.

## 우선순위

1. 저장소 규칙과 policy floor
2. 현재 작업의 명시 지시
3. workflow required
4. profile preferred
5. hero bias
6. species default

## owner 경계

- `.agent/catalog/class/**` 는 canonical class asset 정본이 아니다.
- `.agent_class/profiles/**` 는 hero 대체재가 아니다.
- `.agent/identity/**` 는 current active identity 를 담고 `.agent_class/**` 는 identity 를 소유하지 않는다.

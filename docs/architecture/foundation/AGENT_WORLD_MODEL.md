# 에이전트 세계관 모델

## 목적

- Soulforge 세계관 개념과 실제 경로 구조의 대응 관계를 정리한다.
- species, hero, class, workflow, profile 의 경계를 owner 기준으로 읽게 만든다.

## 대응 관계

| 세계관 개념 | 실제 구조 | 의미 |
| --- | --- | --- |
| Species Catalog | `.agent/species/**` | selectable species 와 hero candidate 정본 |
| Active Unit | `.unit/<unit_id>/` | active owner surface |
| Class Package Catalog | `.agent_class/<class_id>/**` | reusable class / package canon |
| Workflow Canon | `.workflow/<workflow_id>/` | reusable workflow canon |
| Party Template | `.party/<party_id>/` | reusable party template |
| Mission Site | `_workspaces/<project_code>/` | 실제 프로젝트 현장 |

## 핵심 해석

- species 는 durable catalog baseline 이다.
- hero 는 species 위에 얹히는 optional overlay 다.
- unit 은 실제 binding 과 active owner surface 다.
- class 는 재사용 가능한 능력 패키지다.
- workflow 는 reusable 공략서 / 처리 규칙이다.
- party 는 reusable 투입 조합이다.

## 현재 고정 결정

- Soulforge의 기본 축은 `.agent`, `.unit`, `.agent_class`, `.workflow`, `.party`, `_workspaces` 다.
- `.agent` 는 species / hero catalog owner 다.
- `.unit` 는 active owner surface 다.
- `.agent_class` 는 reusable class / package catalog 다.
- `.workflow` 는 workflow canon owner 다.
- `.party` 는 reusable party template owner 다.
- `_workspaces` 는 local-only mission site 다.

## 우선순위

1. 저장소 규칙과 owner 경계
2. 현재 작업의 명시 지시
3. workflow rule
4. party / unit binding
5. hero bias
6. species default

## owner 경계

- `.agent/**` 는 active unit state 를 소유하지 않는다.
- `.unit/**` 가 active binding 과 owner surface 를 가진다.
- `.workflow/**` 와 `.party/**` 는 `.agent_class/**` 하위가 아니라 독립 root 다.

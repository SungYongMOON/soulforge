# 에이전트 세계관 모델

## 목적

- Soulforge 세계관 개념과 실제 경로 구조의 대응 관계를 정리한다.
- species, hero, class, workflow, profile 의 경계를 owner 기준으로 읽게 만든다.

## 대응 관계

| 세계관 개념 | 실제 구조 | 의미 |
| --- | --- | --- |
| Outer Canon Store | `.registry/**` | species, class, skill, tool, knowledge canon |
| Species Catalog | `.registry/species/<species_id>/species.yaml` | species truth 와 inline hero candidate set |
| Active Unit | `.unit/<unit_id>/` | active owner surface |
| Class Package Catalog | `.registry/classes/<class_id>/**` | reusable class / package canon |
| Workflow Canon | `.workflow/<workflow_id>/` | reusable workflow canon |
| Party Template | `.party/<party_id>/` | reusable party template |
| Mission Plan | `.mission/<mission_id>/` | 내가 현재 보유한 실행 계획 |
| Project Worksite | `_workspaces/<project_code>/` | 실제 프로젝트 파일과 local run truth 를 담는 현장 |

## 핵심 해석

- species 는 durable catalog baseline 이다.
- hero 는 species 내부에 inline 으로 실리는 optional overlay 다.
- hero bias 는 정책이 아니라 추천 가중치다.
- unit 은 실제 binding 과 active owner surface 다.
- class 는 재사용 가능한 능력 패키지다.
- workflow 는 reusable 공략서 / 처리 규칙이다.
- party 는 reusable 투입 조합이다.
- mission 은 workflow/party/unit 을 실제 실행 계획으로 묶은 owner surface 다.

## 현재 고정 결정

- Soulforge의 canonical root 는 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `_workspaces` 다.
- `.registry` 는 outer canon/store owner 다.
- `.unit` 는 active owner surface 다.
- `.workflow` 는 workflow canon owner 다.
- `.party` 는 reusable party template owner 다.
- `.mission` 은 held mission plan owner 다.
- `_workspaces` 는 local-only project worksite 다.
- assigned execution plan owner 는 `_workspaces` 가 아니라 `.mission` 이 소유한다.

## 우선순위

1. 저장소 규칙과 owner 경계
2. 현재 작업의 명시 지시
3. workflow rule
4. party / unit binding
5. hero recommendation bias
6. species default

## owner 경계

- `.registry/**` 는 active unit state 와 project-local truth 를 소유하지 않는다.
- `.unit/**` 가 active binding 과 owner surface 를 가진다.
- `.workflow/**` 와 `.party/**` 는 `.registry/**` 하위가 아니라 독립 root 다.
- `.mission/**` 는 held mission metadata 와 readiness 를 소유한다.

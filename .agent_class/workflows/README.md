# .agent_class/workflows

## 목적

- `workflows/` 는 클래스의 운용 절차와 실행 교범을 둔다.
- 스킬이나 도구를 묶어 실제 작업 순서로 만드는 계층이다.
- workflow 는 explicit `required` 조합식을 정의한다.
- canonical workflow source 는 이 폴더 아래 각 `module.yaml` 이다.

## 포함 대상

- 워크플로우 정의
- 절차 순서와 진입점 메타

## 제외 대상

- 개별 스킬 정의
- 프로젝트 전용 실행 로그와 프로젝트 바인딩

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent_class/skills/README.md`](../skills/README.md)
- [`docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md`](../../docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md)

## 상태

- Stable
- workflow 포맷과 트리거 규약은 추후 정의 예정이다.
- workflow 는 profile 선호보다 앞서는 required rule 이다.
- `sample_` prefix workflow 는 repo-tracked reference sample baseline 으로 둘 수 있으며 실제 운영 workflow 와 구분한다.

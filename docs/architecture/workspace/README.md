# docs/architecture/workspace

## 목적

- `workspace/` 는 `_workspaces` 와 `.project_agent` 에 대한 저장소 공용 문서를 모은다.
- 실제 프로젝트 현장 모델과 공통 resolve 규칙을 한곳에서 찾게 한다.

## 포함 대상

- `WORKSPACE_PROJECT_MODEL.md`
- `PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `PROJECT_AGENT_RESOLVE_CONTRACT.md`

## 관련 경로

- [`../README.md`](../README.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`PROJECT_AGENT_MINIMUM_SCHEMA.md`](PROJECT_AGENT_MINIMUM_SCHEMA.md)
- [`PROJECT_AGENT_RESOLVE_CONTRACT.md`](PROJECT_AGENT_RESOLVE_CONTRACT.md)

## 상태

- Stable
- workspace 구조와 `.project_agent` 계약의 root-owned 정본 묶음이다.
- `workflow_bindings.yaml` 는 workflow 연결뿐 아니라 선택적 mutation scope 도 함께 설명할 수 있다.

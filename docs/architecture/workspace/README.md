# docs/architecture/workspace

## 목적

- `workspace/` 는 `_workspaces` 와 `.project_agent` 에 대한 저장소 공용 문서를 모은다.
- 실제 프로젝트 현장 모델과 공통 resolve 규칙을 한곳에서 찾게 한다.

## 포함 대상

- `WORKSPACE_PROJECT_MODEL.md`
- `WORKFLOW_EXECUTION_BINDING_MODEL.md`
- `PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `PROJECT_AGENT_RESOLVE_CONTRACT.md`
- `schema/`
- `examples/`
- `PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md`

## 관련 경로

- [`../README.md`](../README.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`WORKFLOW_EXECUTION_BINDING_MODEL.md`](WORKFLOW_EXECUTION_BINDING_MODEL.md)
- [`PROJECT_AGENT_MINIMUM_SCHEMA.md`](PROJECT_AGENT_MINIMUM_SCHEMA.md)
- [`PROJECT_AGENT_RESOLVE_CONTRACT.md`](PROJECT_AGENT_RESOLVE_CONTRACT.md)
- [`schema/README.md`](schema/README.md)
- [`examples/README.md`](examples/README.md)
- [`PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md`](PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md)

## 상태

- Stable
- workspace 구조와 `.project_agent` 계약의 root-owned 정본 묶음이다.
- tracked workspace sample 은 `examples/` 아래에서만 유지한다.
- split binding 파일은 `bindings/*.yaml` 상대 경로 포인터 규칙을 사용한다.
- workflow step 의 `execution_profile_ref` 와 `action.skill_id` 는 local runtime binding 을 통해 model, skill package, MCP/tool preset 으로 resolve 할 수 있다.

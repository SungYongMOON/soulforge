# docs/architecture/workspace

## 목적

- `workspace/` 는 `.mission/`, `_workspaces`, `.project_agent` 에 대한 저장소 공용 문서를 모은다.
- project-local materialization 모델과 공통 resolve 규칙을 한곳에서 찾게 한다.

## 포함 대상

- `WORKSPACE_PROJECT_MODEL.md`
- `MISSION_MODEL.md`
- `MISSION_MANUAL_DRAFT.md`
- `MAIL_TO_MISSION_HANDOFF_V0.md`
- `MONSTER_FAMILY_LINEUP_V0.md`
- `MONSTER_CANDIDATE_CONTRACT_V0.md`
- `BATTLE_LOG_STORAGE_PLAN.md`
- `MISSION_CLOSE_PROVENANCE_V0.md`
- `MAILBOX_CONCRETE_CONTRACT_V0.md`
- `AUTOHUNT_MODEL.md`
- `RUNNER_EXECUTION_MODEL.md`
- `WORKFLOW_EXECUTION_BINDING_MODEL.md`
- `PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `PROJECT_AGENT_RESOLVE_CONTRACT.md`
- `schema/`
- `examples/`
- `PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md`

## 관련 경로

- [`../README.md`](../README.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`MISSION_MODEL.md`](MISSION_MODEL.md)
- [`MISSION_MANUAL_DRAFT.md`](MISSION_MANUAL_DRAFT.md)
- [`MAIL_TO_MISSION_HANDOFF_V0.md`](MAIL_TO_MISSION_HANDOFF_V0.md)
- [`MONSTER_FAMILY_LINEUP_V0.md`](MONSTER_FAMILY_LINEUP_V0.md)
- [`MONSTER_CANDIDATE_CONTRACT_V0.md`](MONSTER_CANDIDATE_CONTRACT_V0.md)
- [`BATTLE_LOG_STORAGE_PLAN.md`](BATTLE_LOG_STORAGE_PLAN.md)
- [`MISSION_CLOSE_PROVENANCE_V0.md`](MISSION_CLOSE_PROVENANCE_V0.md)
- [`MAILBOX_CONCRETE_CONTRACT_V0.md`](MAILBOX_CONCRETE_CONTRACT_V0.md)
- [`AUTOHUNT_MODEL.md`](AUTOHUNT_MODEL.md)
- [`RUNNER_EXECUTION_MODEL.md`](RUNNER_EXECUTION_MODEL.md)
- [`WORKFLOW_EXECUTION_BINDING_MODEL.md`](WORKFLOW_EXECUTION_BINDING_MODEL.md)
- [`PROJECT_AGENT_MINIMUM_SCHEMA.md`](PROJECT_AGENT_MINIMUM_SCHEMA.md)
- [`PROJECT_AGENT_RESOLVE_CONTRACT.md`](PROJECT_AGENT_RESOLVE_CONTRACT.md)
- [`schema/README.md`](schema/README.md)
- [`examples/README.md`](examples/README.md)
- [`PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md`](PROJECT_AGENT_SCHEMA_FIELD_MATRIX.md)

## 상태

- Stable
- mission/workspace 구조와 `.project_agent` 계약의 root-owned 정본 묶음이다.
- current-default v0 workspace contract draft 는 `MAIL_TO_MISSION_HANDOFF_V0.md`, `MONSTER_FAMILY_LINEUP_V0.md`, `MONSTER_CANDIDATE_CONTRACT_V0.md`, `BATTLE_LOG_STORAGE_PLAN.md`, `MISSION_CLOSE_PROVENANCE_V0.md`, `MAILBOX_CONCRETE_CONTRACT_V0.md` 에서 추가로 잠근다.
- tracked workspace sample 은 `examples/` 아래에서만 유지한다.
- split binding 파일은 `bindings/*.yaml` 상대 경로 포인터 규칙을 사용한다.
- workflow step 의 `execution_profile_ref` 와 `action.skill_id` 는 local runtime binding 을 통해 model, skill package, MCP/tool preset 으로 resolve 할 수 있다.
- `autohunt/` 는 mailbox routing, workflow-party selection, retry-escalation policy 를 설명하는 local operating layer 다.
- runner 는 autohunt 가 고른 workflow/party 를 실제 execution packet 으로 잇는 local execution role 이다.
- `.project_agent` 문서군은 local contract, binding, raw run truth 를 다루며 mission assignment owner 를 정의하지 않는다.

# Project Agent Schema Field Matrix

## `contract.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `project_code` | yes | string | 짧고 안정적인 project id. path segment 에 쓴다 |
| `kind` | yes | string | `project_agent_contract` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `display_name` | yes | string | 사람용 full title |
| `unit_ref` | yes | string | `.unit/<unit_id>/unit.yaml` pointer |
| `bindings.workflow` | yes | string | contract 기준 상대 경로 파일 포인터 |
| `bindings.party` | yes | string | contract 기준 상대 경로 파일 포인터 |
| `bindings.appserver` | yes | string | contract 기준 상대 경로 파일 포인터 |
| `bindings.mailbox` | yes | string | contract 기준 상대 경로 파일 포인터 |
| `bindings.execution_profiles` | no | string | contract 기준 상대 경로 파일 포인터 |
| `bindings.skill_execution` | no | string | contract 기준 상대 경로 파일 포인터 |
| `runtime_truth_root` | yes | string | `runs/` 고정 |
| `notes` | no | list[string] | 설명 메모 |

## `workflow_binding.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `workflow_id` | yes | string | workflow canon id |
| `kind` | yes | string | `workflow_binding` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `profile_ref` | yes | string | string id |
| `entrypoint` | yes | string | 시작 action 이름 |
| `notes` | no | list[string] | 설명 메모 |

## `party_binding.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `party_id` | yes | string | party canon id |
| `kind` | yes | string | `party_binding` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `profile_ref` | yes | string | string id |
| `formation_role` | yes | string | 편성 역할 설명 |
| `notes` | no | list[string] | 설명 메모 |

## `appserver_binding.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `appserver_id` | yes | string | appserver binding id |
| `kind` | yes | string | `appserver_binding` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `profile_ref` | yes | string | string id |
| `surface` | yes | string | serving surface 이름 |
| `notes` | no | list[string] | 설명 메모 |

## `mailbox_binding.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `mailbox_id` | yes | string | mailbox binding id |
| `kind` | yes | string | `mailbox_binding` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `profile_ref` | yes | string | string id |
| `routing_mode` | yes | string | routing mode 이름 |
| `notes` | no | list[string] | 설명 메모 |

## `execution_profile_binding.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `kind` | yes | string | `execution_profile_binding` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `profiles[*].execution_profile_ref` | yes | string | workflow step 의 `execution_profile_ref` 와 매칭 |
| `profiles[*].model` | yes | string | local runtime model id |
| `profiles[*].reasoning_effort` | yes | string | local runtime reasoning preset |
| `profiles[*].attached_skill_names` | no | list[string] | installed Codex skill name list |
| `profiles[*].preferred_mcps` | no | list[string] | local capability 또는 MCP name |
| `profiles[*].preferred_tools` | no | list[string] | tool / command hint |
| `notes` | no | list[string] | 설명 메모 |

## `skill_execution_binding.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `kind` | yes | string | `skill_execution_binding` 고정 |
| `status` | yes | enum | `draft | active | archived` |
| `skill_bindings[*].skill_id` | yes | string | canonical skill id |
| `skill_bindings[*].codex_skill_name` | yes | string | installed Codex skill name |
| `skill_bindings[*].notes` | no | list[string] | 설명 메모 |
| `notes` | no | list[string] | 설명 메모 |

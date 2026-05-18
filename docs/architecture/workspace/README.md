# docs/architecture/workspace

## 목적

- `workspace/` 는 `.mission/`, `_workspaces`, `_workmeta` 에 대한 저장소 공용 문서를 모은다.
- project-local materialization 모델과 공통 resolve 규칙을 한곳에서 찾게 한다.
- `guild_hall` cross-project 운영 owner 문서는 `docs/architecture/guild_hall/` 에서 색인하고, 여기서는 그 owner 가 `_workspaces/<project_code>/` 와 만나는 계약만 다룬다.

## 문서 역할 색인

| 문서 | 역할 |
| --- | --- |
| `WORKSPACE_PROJECT_MODEL.md` | `_workspaces`, `_workmeta`, `.mission`, gateway handoff 의 owner 경계를 고정한다. |
| `PROJECT_ONBOARDING_V0.md` | 실제 프로젝트를 `_workspaces/<project_code>/` 로 처음 붙이는 절차를 둔다. |
| `PROJECT_START_WORKFLOW_V0.md` | 첫 project task 를 열 때 기록 위치와 bounded 시작 순서를 둔다. |
| `MISSION_MODEL.md` | monster, mission, artifact, readiness, raw run truth 의 관계를 고정한다. |
| `MISSION_MANUAL_DRAFT.md` | mission 운용 manual 초안을 누적한다. |
| `MAIL_INTAKE_REQUEST_V0.md` | mailbox/manual input 을 gateway intake request 로 표현하는 계약이다. |
| `MAIL_CANDIDATE_QUEUE_V0.md` | fresh mail event 를 업무화 검토 후보 queue 로 보류하는 local-only 계약이다. |
| `WORKSPACE_INTAKE_INBOX_V0.md` | intake inbox 의 current JSON 과 append-only JSONL event stream shape 를 둔다. |
| `DUNGEON_ASSIGNMENT_REQUEST_V0.md` | gateway monster 를 project dungeon/stage 로 배정하는 요청 계약이다. |
| `INSTALLATION_MANUAL_V0.md` | 다른 PC 에서 clone 후 runtime 을 materialize 하는 상위 설치 절차다. |
| `PRIVATE_STATE_REPO_V0.md` | owner-only `private-state/` continuity mirror 의 allowlist 와 restore 절차다. |
| `../bootstrap/BOOTSTRAP_PROFILES_V0.md` | workspace 설치 흐름에서 참조하는 bootstrap profile 정의다. |
| `GATEWAY_MAIL_FETCH_V0.md` | mail fetch capsule, local mailbox state, secret 경계를 설명한다. |
| `MAIL_SEND_V0.md` | outbound mail local env, snapshot, append-only send log 경계를 설명한다. |
| `GATEWAY_NOTIFY_V0.md` | gateway event 를 notification 으로 emit 하는 command 계약이다. |
| `NOTIFY_MODEL_V0.md` | gateway local policy 와 mission notification toggle 의 owner 경계다. |
| `NOTIFY_BRIEF_FORMAT_V0.md` | Telegram/user-facing notify brief 의 표시 순서와 provenance 기준이다. |
| `NOTEBOOKLM_MCP_SETUP_V0.md` | NotebookLM MCP 를 대상 PC 에 재설치하는 runbook 이다. |
| `../bootstrap/WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md` | owner PC 에 `/goal` 과 promptfoo 같은 workflow evolution harness 후보를 설치하는 runbook 이다. |
| `MULTI_PC_DEVELOPMENT_V0.md` | 여러 PC clone, local node role, push/pull, primary writer 충돌 방지 규칙이다. |
| `MAIL_TO_MISSION_HANDOFF_V0.md` | mail/intake monster 를 first mission draft 로 넘기는 handoff 기준이다. |
| `MONSTER_FAMILY_LINEUP_V0.md` | monster family/name/type 의 starter lineup 과 표시 기준이다. |
| `MONSTER_CANDIDATE_CONTRACT_V0.md` | monster candidate 판정 필드와 source provenance 계약이다. |
| `BATTLE_LOG_STORAGE_PLAN.md` | battle log 저장 위치, event stream, chain sample 기준이다. |
| `MISSION_CLOSE_PROVENANCE_V0.md` | mission terminal 상태와 battle event provenance pointer 계약이다. |
| `SE_DUNGEON_STAGE_MODEL_V0.md` | project=dungeon, stage/floor, boss clear 를 UI/업무 단계에 연결한다. |
| `MAILBOX_CONCRETE_CONTRACT_V0.md` | mailbox concrete source 와 gateway state surface 의 public-safe 계약이다. |
| `AUTOHUNT_MODEL.md` | `_workmeta/<project_code>/autohunt/` 의 routing, policy, capability 확장선을 둔다. |
| `WIKI_CURATION_MAINTENANCE_V0.md` | project wiki/source ledger/packet map 을 어떻게 유지보수할지 current-default runbook 을 둔다. |
| `RUNNER_EXECUTION_MODEL.md` | autohunt routing 을 workflow/party/sub-agent execution packet 으로 잇는 runner 역할이다. |
| `WORKFLOW_EXECUTION_BINDING_MODEL.md` | workflow step 의 skill/profile ref 를 local runtime binding 으로 해석하는 기준이다. |
| `WORKMETA_MINIMUM_SCHEMA.md` | `_workmeta/<project_code>/` 최소 contract/binding/report shape 다. |
| `WORKMETA_RESOLVE_CONTRACT.md` | `_workmeta` 가 `.unit`, `.workflow`, `.party`, `.mission` 을 resolve 하는 기준이다. |
| `schema/` | workspace contract, binding, local-only event stream schema 설명 묶음이다. |
| `examples/` | public-safe workspace/gateway/private-state sample 묶음이다. |
| `WORKMETA_SCHEMA_FIELD_MATRIX.md` | `_workmeta` schema field 를 사람이 읽는 표로 요약한다. |

## 관련 경로

- [`../README.md`](../README.md)
- [`../guild_hall/README.md`](../guild_hall/README.md)
- [`WORKSPACE_PROJECT_MODEL.md`](WORKSPACE_PROJECT_MODEL.md)
- [`PROJECT_ONBOARDING_V0.md`](PROJECT_ONBOARDING_V0.md)
- [`PROJECT_START_WORKFLOW_V0.md`](PROJECT_START_WORKFLOW_V0.md)
- [`MISSION_MODEL.md`](MISSION_MODEL.md)
- [`MISSION_MANUAL_DRAFT.md`](MISSION_MANUAL_DRAFT.md)
- [`MAIL_INTAKE_REQUEST_V0.md`](MAIL_INTAKE_REQUEST_V0.md)
- [`MAIL_CANDIDATE_QUEUE_V0.md`](MAIL_CANDIDATE_QUEUE_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](WORKSPACE_INTAKE_INBOX_V0.md)
- [`DUNGEON_ASSIGNMENT_REQUEST_V0.md`](DUNGEON_ASSIGNMENT_REQUEST_V0.md)
- [`INSTALLATION_MANUAL_V0.md`](INSTALLATION_MANUAL_V0.md)
- [`PRIVATE_STATE_REPO_V0.md`](PRIVATE_STATE_REPO_V0.md)
- [`../bootstrap/BOOTSTRAP_PROFILES_V0.md`](../bootstrap/BOOTSTRAP_PROFILES_V0.md)
- [`GATEWAY_MAIL_FETCH_V0.md`](GATEWAY_MAIL_FETCH_V0.md)
- [`MAIL_SEND_V0.md`](MAIL_SEND_V0.md)
- [`GATEWAY_NOTIFY_V0.md`](GATEWAY_NOTIFY_V0.md)
- [`NOTIFY_MODEL_V0.md`](NOTIFY_MODEL_V0.md)
- [`NOTIFY_BRIEF_FORMAT_V0.md`](NOTIFY_BRIEF_FORMAT_V0.md)
- [`NOTEBOOKLM_MCP_SETUP_V0.md`](NOTEBOOKLM_MCP_SETUP_V0.md)
- [`../bootstrap/WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md`](../bootstrap/WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
- [`MAIL_TO_MISSION_HANDOFF_V0.md`](MAIL_TO_MISSION_HANDOFF_V0.md)
- [`MONSTER_FAMILY_LINEUP_V0.md`](MONSTER_FAMILY_LINEUP_V0.md)
- [`MONSTER_CANDIDATE_CONTRACT_V0.md`](MONSTER_CANDIDATE_CONTRACT_V0.md)
- [`BATTLE_LOG_STORAGE_PLAN.md`](BATTLE_LOG_STORAGE_PLAN.md)
- [`MISSION_CLOSE_PROVENANCE_V0.md`](MISSION_CLOSE_PROVENANCE_V0.md)
- [`SE_DUNGEON_STAGE_MODEL_V0.md`](SE_DUNGEON_STAGE_MODEL_V0.md)
- [`MAILBOX_CONCRETE_CONTRACT_V0.md`](MAILBOX_CONCRETE_CONTRACT_V0.md)
- [`AUTOHUNT_MODEL.md`](AUTOHUNT_MODEL.md)
- [`WIKI_CURATION_MAINTENANCE_V0.md`](WIKI_CURATION_MAINTENANCE_V0.md)
- [`RUNNER_EXECUTION_MODEL.md`](RUNNER_EXECUTION_MODEL.md)
- [`WORKFLOW_EXECUTION_BINDING_MODEL.md`](WORKFLOW_EXECUTION_BINDING_MODEL.md)
- [`WORKMETA_MINIMUM_SCHEMA.md`](WORKMETA_MINIMUM_SCHEMA.md)
- [`WORKMETA_RESOLVE_CONTRACT.md`](WORKMETA_RESOLVE_CONTRACT.md)
- [`schema/README.md`](schema/README.md)
- [`examples/README.md`](examples/README.md)
- [`WORKMETA_SCHEMA_FIELD_MATRIX.md`](WORKMETA_SCHEMA_FIELD_MATRIX.md)

## 상태

- Stable
- mission/workspace 구조와 `_workmeta` 계약의 root-owned 정본 묶음이다.
- current-default v0 workspace contract draft 는 `MAIL_INTAKE_REQUEST_V0.md`, `MAIL_CANDIDATE_QUEUE_V0.md`, `WORKSPACE_INTAKE_INBOX_V0.md`, `DUNGEON_ASSIGNMENT_REQUEST_V0.md`, `MAIL_TO_MISSION_HANDOFF_V0.md`, `MONSTER_FAMILY_LINEUP_V0.md`, `MONSTER_CANDIDATE_CONTRACT_V0.md`, `BATTLE_LOG_STORAGE_PLAN.md`, `MISSION_CLOSE_PROVENANCE_V0.md`, `SE_DUNGEON_STAGE_MODEL_V0.md`, `MAILBOX_CONCRETE_CONTRACT_V0.md` 에서 추가로 잠근다.
- `WORKSPACE_INTAKE_INBOX_V0.md` 는 `gateway` intake logging 의 source-of-truth shape 를 `JSON` current state + monthly `JSONL` event stream 기준으로 잠그고, `CSV` 는 파생 export 로만 다룬다.
- `BATTLE_LOG_STORAGE_PLAN.md` 와 `schema/battle_event.schema.yaml` 는 mission-level terminal battle outcome 을 monthly `JSONL` event stream 으로 남기는 최소 event schema 를 잠근다.
- `GATEWAY_MAIL_FETCH_V0.md`, `MAIL_CANDIDATE_QUEUE_V0.md`, `MAIL_SEND_V0.md`, `GATEWAY_NOTIFY_V0.md`, `NOTIFY_MODEL_V0.md`, `NOTIFY_BRIEF_FORMAT_V0.md` 는 `guild_hall` owner 의 runtime 계약이지만, `_workspaces/<project_code>/` handoff 와 clone/bootstrap 흐름 때문에 workspace 문서군에서도 함께 참조한다.
- `NOTEBOOKLM_MCP_SETUP_V0.md` 는 NotebookLM MCP 를 대상 PC 에서 재설치하는 절차만 Soulforge 쪽 runbook 으로 들고 간다.
- `WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md` 는 owner PC 에서 Codex `/goal` 과 promptfoo 같은 harness 후보를 설치하고, workflow evolution 실험을 운영 clone 과 분리하는 절차를 둔다.
- `INSTALLATION_MANUAL_V0.md` 는 다른 PC 에서 clone 후 무엇을 어떤 순서로 설치해야 하는지 한 장짜리 상위 bootstrap 문서다.
- `PROJECT_ONBOARDING_V0.md` 는 첫 실제 프로젝트를 `_workspaces/<project_code>/` 에 붙일 때 short `project_code`, full `display_name`, read-only first, local-only link materialization 규칙을 잠근다.
- `PROJECT_START_WORKFLOW_V0.md` 는 첫 과제 시작 시 사람과 Codex 가 어디에 기록하고 어떤 순서로 bounded task 를 열지 잠근다.
- `BOOTSTRAP_PROFILES_V0.md` 는 `public-only`, `operator`, `owner-with-state` bootstrap 기본 프로필을 잠근다.
- `PRIVATE_STATE_REPO_V0.md` 는 optional private state repo 로 어떤 운영 기록만 따로 mirror 할지 잠근다.
- tracked workspace sample 은 `examples/` 아래에서만 유지한다.
- `examples/guild_hall/state/gateway/` 는 다른 PC 나 다른 LLM 이 `mail fetch -> mail_intake_request -> intake_inbox -> linked_existing_only` 흐름을 그대로 따라볼 수 있는 public-safe mirror sample 이다.
- `MAIL_SEND_V0.md` 는 outbound mail local env, outbound snapshot, append-only send log 위치를 같이 잠근다.
- `MULTI_PC_DEVELOPMENT_V0.md` 는 다른 PC 에서 `clone -> local runtime materialize -> push` 하는 최소 운영 절차와 `work_pc` / `tool_pc` / `portable_dev_pc` / `always_on_node` 역할 모델을 잠근다.
- split binding 파일은 `bindings/*.yaml` 상대 경로 포인터 규칙을 사용한다.
- workflow step 의 `execution_profile_ref` 와 `action.skill_id` 는 local runtime binding 을 통해 model, skill package, MCP/tool preset 으로 resolve 할 수 있다.
- `autohunt/` 는 mailbox routing, party workflow-chain 또는 단일 workflow selection, retry-escalation policy, future node capability/claim 확장선을 설명하는 local operating layer 다.
- runner 는 autohunt 가 고른 workflow/party 를 실제 execution packet 으로 잇는 local execution role 이다.
- `_workmeta` 문서군은 local contract, binding, raw run truth 를 다루며 mission assignment owner 를 정의하지 않는다.

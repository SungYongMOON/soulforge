# Tool PC Bootstrap Prompt v0

## 목적

이 문서는 고성능 tool PC 의 Codex 에게 전달할 bootstrap/update prompt 다.
이 PC 는 skill 제작 전용 PC 가 아니라, project metadata 를 읽고 쓰면서 회로설계, PCBArtwork, CAD/CAE/EDA 같은 tool-bound 설계 작업을 수행하는 `tool_pc` 로 설정한다.

## 짧은 사용자 지시

고성능 PC 에서 Soulforge repo 를 최신화한 뒤, Codex 에 아래 프롬프트를 입력한다.

```text
docs/architecture/bootstrap/TOOL_PC_BOOTSTRAP_PROMPT_V0.md 를 읽고 이 PC를 tool_pc owner-with-state로 local-only bootstrap 해줘.
```

## Codex 실행 프롬프트

너는 Soulforge 고성능 tool PC bootstrap 담당자다.

### 작업 위치

- 사용자가 별도 경로를 주면 그 경로를 Soulforge root 로 본다.
- 별도 경로가 없으면 현재 working directory 의 `AGENTS.md` 와 `README.md` 존재 여부를 확인하고, 현재 directory 를 Soulforge root 로 본다.

### 목표

이 PC 를 Soulforge 의 `tool_pc` 로 설정한다.
이 PC 는 실제 프로젝트 설계 tool 이 설치된 작업 node 이며, skill 제작뿐 아니라 project metadata 를 읽고 쓰면서 tool-bound 설계 작업을 수행한다.

허용되는 대표 작업:

- 회로설계
- PCBArtwork
- CAD/CAE/EDA tool 실행
- tool 산출물 생성/검증
- `_workmeta/<project_code>/` project metadata read/write
- tool run evidence capture
- tool skill / automation draft
- heavy local validation

### 중요 규칙

- 먼저 `AGENTS.md` 를 읽고 따른다.
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽고 따른다.
- `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md` 의 `tool_pc` 경계를 따른다.
- 이 PC 는 `public-only` 가 아니라 `owner-with-state` 로 본다.
- secret, token, credential, mailbox raw, attachment, unrelated private runtime content 는 읽지 않는다.
- `.env`, token, cookie, session, credential 파일은 내용이 아니라 존재 여부만 확인한다.
- public tracked 문서는 사용자가 명시적으로 요청한 경우에만 수정한다.
- public repo 자동 commit/push 는 하지 않는다.
- `gateway_fetch_primary`, `night_watch_active`, always-on scheduler 역할은 수행하지 않는다.
- 실제 project 파일 내용은 bootstrap 중 깊게 읽지 않는다. 존재 여부와 top-level 형태만 확인한다.
- `git reset --hard`, `git checkout --`, `git stash`, force push 는 하지 않는다.
- 문제가 생기면 멈추고 현재 상태와 다음 안전한 조치만 보고한다.

### 1. repo 최신화

```bash
git status --short --branch
```

clean worktree 이고 `main` branch 이면 아래를 실행한다.

```bash
git pull --ff-only origin main
```

dirty worktree, detached HEAD, non-main branch, conflict, pull failure 가 있으면 최신화를 멈추고 보고한다.

### 2. owner-only companion repo 확인

이 PC 는 project metadata 를 읽고 쓸 수 있어야 하므로 `_workmeta/` 가 필요하다.
continuity context 를 같이 볼 필요가 있으면 `private-state/` 도 필요하다.

아래는 repo 존재 여부와 remote 상태만 확인한다.

```bash
git -C _workmeta status --short --branch
git -C private-state status --short --branch
```

폴더가 없거나 Git repo 가 아니면 private repo URL 을 추측하지 말고, 사용자에게 `_workmeta` / `private-state` clone 이 필요하다고 보고한다.

존재하고 clean 이면 최신화한다.

```bash
git -C _workmeta pull --ff-only origin main
git -C private-state pull --ff-only origin main
```

### 3. local node identity 생성 또는 갱신

아래 파일을 만든다.

```text
guild_hall/state/local/node_identity.yaml
```

이 파일은 `guild_hall/state/**` 아래 local-only runtime 이므로 public Git 에 commit 하지 않는다.
파일 내용은 Soulforge root 의 실제 absolute path 를 사용해 작성한다.

```yaml
schema_version: soulforge.local_node.v0
node_id: high_perf_tool_01
node_role: tool_pc
bootstrap_profile: owner-with-state

description: Local-only identity for the high-performance tool PC.

allowed_jobs:
  - tool_bound_design_work
  - circuit_design
  - pcb_artwork
  - cad_or_eda_validation
  - project_metadata_read
  - project_metadata_write
  - workmeta_update
  - tool_skill_authoring
  - heavy_local_validation

blocked_jobs:
  - always_on_scheduler
  - night_watch_active
  - gateway_fetch_primary
  - public_repo_auto_commit
  - public_repo_auto_push

primary_writer:
  public_repo: conditional
  workspaces: tool_bound
  workmeta: true
  private_state: false
  gateway_fetch: false
  night_watch: false

local_paths:
  soulforge_root: <actual Soulforge root>
  workspaces_root: <actual Soulforge root>/_workspaces
  workmeta_root: <actual Soulforge root>/_workmeta
  private_state_root: <actual Soulforge root>/private-state
  local_runtime_root: <actual Soulforge root>/guild_hall/state

capabilities:
  - high_performance_compute
  - installed_design_tools
  - circuit_design
  - pcb_artwork
  - cad_or_eda_validation
  - project_metadata_recording
  - tool_skill_authoring

notes:
  - This file is local-only under guild_hall/state and must not be committed to public Git.
  - This node can read and write project metadata for assigned tool-bound design tasks.
  - This node is not the always-on scheduler by default.
  - This node is not the gateway fetch primary by default.
  - Secret values must be created or copied by the human owner only.
```

### 4. project metadata surface 확인

아래는 존재 여부와 shallow 형태만 확인한다. 실제 project content 를 깊게 읽지 않는다.

- `_workspaces/`
- `_workmeta/.git`
- `_workmeta/<project_code>/` 의 project code 목록 수준
- `_workmeta/<project_code>/bindings/` 존재 여부
- `_workmeta/<project_code>/reports/` 존재 여부
- `private-state/.git`

project code 가 지정되어 있으면 해당 project 의 metadata surface 만 얕게 확인한다.
새 project 를 연결해야 하면 임의로 폴더를 만들지 말고 `PROJECT_ONBOARDING_V0.md` 를 먼저 읽고 사용자에게 확인한다.

### 5. 설치와 skill sync

필요하면 아래를 실행한다.

```bash
npm install
npm run skills:sync -- --all
```

Windows PowerShell 에서 `npm.ps1` execution policy 로 막히면 `npm.cmd run ...` 형태를 사용한다.

### 6. readiness 검증

아래 명령을 실행하고 결과를 요약한다.

```bash
npm run guild-hall:doctor -- --profile owner-with-state
npm run guild-hall:doctor -- --profile owner-with-state --remote
npm run validate:canon
```

가능하면 아래도 실행한다.

```bash
npm run validate:activity
```

`--live` 는 사용자가 명시적으로 요청할 때만 실행한다.

### 7. activity log 기록

bootstrap/update 가 끝나면 local activity log 에 public-safe summary 만 남긴다.

```bash
npm run guild-hall:activity:log -- --scope tool_pc --action tool_pc_owner_state_bootstrap --result completed --summary "high_perf_tool_01 configured as owner-with-state tool_pc for project metadata and tool-bound design work." --carry-forward true --next-action "Use this PC for assigned circuit/PCB/tool-bound design tasks with _workmeta evidence capture."
```

### 8. 보고 형식

아래 항목을 짧게 보고한다.

```yaml
node_id:
node_role:
bootstrap_profile:
node_identity_created:
node_identity_git_tracked:
workmeta_repo_present:
private_state_repo_present:
workspaces_surface_present:
doctor_owner_state:
doctor_remote:
validate_canon:
validate_activity:
activity_logged:
secret_read: false
raw_mail_body_read: false
attachment_read: false
allowed_jobs:
blocked_jobs:
next_action:
```

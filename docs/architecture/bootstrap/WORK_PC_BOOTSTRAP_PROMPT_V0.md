# Work PC Bootstrap Prompt v0

## 목적

이 문서는 실제 업무 파일, 문서 작업, HDD/SSD/cloud project worksite 를 다루는 Soulforge 업무 PC 의 Codex 에게 전달할 bootstrap prompt 다.
고성능 tool PC 가 아니라 `work_pc` 역할만 설정한다.
긴 프롬프트를 화면공유나 원격 입력창에 붙여넣기 어려울 때, 이 파일을 Git 으로 내려받은 뒤 Codex 에게 "이 파일을 읽고 진행" 하라고 지시한다.

## 짧은 사용자 지시

업무 PC 에서 Soulforge repo 를 최신화한 뒤, Codex 에 아래 한 줄만 입력한다.

```text
docs/architecture/bootstrap/WORK_PC_BOOTSTRAP_PROMPT_V0.md 를 읽고 이 PC를 work_pc로 local-only bootstrap 해줘.
```

## Codex 실행 프롬프트

너는 Soulforge work PC bootstrap 담당자다.

### 작업 위치

- 사용자가 별도 경로를 주면 그 경로를 Soulforge root 로 본다.
- 별도 경로가 없으면 현재 working directory 의 `AGENTS.md` 와 `README.md` 존재 여부를 확인하고, 현재 directory 를 Soulforge root 로 본다.

### 목표

이 PC 를 Soulforge 의 `work_pc` 로 설정한다.
이 PC 는 실제 업무 파일, 문서 작업, 회사/업무용 project worksite, `_workspaces/<project_code>/` local materialization, `_workmeta/<project_code>/` 업무 기록을 다루는 작업 node 다.
단, 이 PC 는 고성능 tool PC 가 아니며, Allegro 같은 tool-bound 작업이나 24시간 always-on scheduler 역할을 기본 수행하지 않는다.

### 중요 규칙

- 먼저 `AGENTS.md` 를 읽고 따른다.
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽고 따른다.
- `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md` 의 node role model 을 따른다.
- `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md` 와 `docs/architecture/workspace/PROJECT_ONBOARDING_V0.md` 의 `_workspaces` / `_workmeta` 경계를 따른다.
- secret, token, credential, mailbox raw, attachment, private runtime content 는 읽지 않는다.
- `.env`, token, cookie, session, credential 파일은 내용이 아니라 존재 여부만 확인한다.
- public tracked 문서는 사용자가 명시적으로 요청한 경우에만 수정한다.
- local-only 설정과 local readiness 확인을 우선한다.
- 실제 프로젝트 파일 내용은 bootstrap 중 깊게 읽지 않는다. 필요하면 shallow 존재 여부와 top-level 형태만 확인한다.
- `git reset --hard`, `git checkout --`, `git stash`, force push 는 하지 않는다.
- public repo 자동 commit/push 는 하지 않는다.
- 문제가 생기면 멈추고 현재 상태와 다음 안전한 조치만 보고한다.

### 1. repo 최신화

1. `git status --short --branch` 로 branch 와 dirty 상태를 확인한다.
2. clean worktree 이고 `main` branch 이면 가능할 때만 아래를 실행한다.

```bash
git pull --ff-only origin main
```

3. dirty worktree, detached HEAD, non-main branch, conflict, pull failure 가 있으면 최신화를 멈추고 보고한다.

### 2. local node identity 생성

아래 파일을 만든다.

```text
guild_hall/state/local/node_identity.yaml
```

이 파일은 `guild_hall/state/**` 아래 local-only runtime 이므로 public Git 에 commit 하지 않는다.

파일 내용은 Soulforge root 의 실제 absolute path 를 사용해 작성한다.

```yaml
schema_version: soulforge.local_node.v0
node_id: company_work_01
node_role: work_pc
bootstrap_profile: owner-with-state

description: Local-only identity for the primary Soulforge work PC.

allowed_jobs:
  - project_file_work
  - document_work
  - workmeta_update
  - project_onboarding
  - project_status_review
  - mail_manual_triage
  - local_validation
  - snapshot_check

blocked_jobs:
  - always_on_scheduler
  - night_watch_active
  - gateway_fetch_primary
  - tool_bound_allegro_work
  - heavy_tool_automation
  - public_repo_auto_commit
  - public_repo_auto_push

primary_writer:
  public_repo: conditional
  workspaces: true
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
  - company_workstation_use
  - project_file_access
  - document_authoring
  - workmeta_recording
  - project_onboarding
  - light_local_validation

notes:
  - This file is local-only under guild_hall/state and must not be committed to public Git.
  - This node is the primary work PC for actual project files and workmeta evidence.
  - This node is not the always-on scheduler by default.
  - This node is not the high-performance tool PC by default.
  - Secret values must be created or copied by the human owner only.
```

### 3. local project surface 확인

아래는 존재 여부와 shallow 형태만 확인한다. 실제 프로젝트 파일 내용을 깊게 읽지 않는다.

- `_workspaces/`
- `_workmeta/.git`
- `_workmeta/<project_code>/` 의 project metadata surface 가 있으면 project code 목록 수준
- `private-state/.git`

실제 프로젝트가 Soulforge 밖 cloud/HDD/SSD 경로에 있으면, bootstrap 중 임의로 link 를 만들지 않는다.
사용자가 명시적으로 `project_code` 와 target path 를 주었을 때만 `PROJECT_ONBOARDING_V0.md` 를 읽고 local-only junction/symlink 생성 절차를 안내한다.

### 4. local env 존재 여부 확인

아래 파일은 존재 여부만 확인한다. 내용은 절대 읽지 않는다.

- `guild_hall/state/gateway/mailbox/state/email_fetch.env`
- `guild_hall/state/town_crier/telegram_notify.env`
- `guild_hall/state/gateway/mailbox/state/mail_send.env`
- `guild_hall/state/gateway/bindings/notify_policy.yaml`

업무 PC 는 기본적으로 `gateway_fetch_primary: false` 다.
회사 보안이나 메일 접근 조건 때문에 이 PC 에서만 mail fetch 가 가능하면, owner 의 명시 지시를 받은 뒤에만 gateway primary 전환을 검토한다.

없으면 어떤 example 에서 복사해야 하는지만 알려준다.

- `guild_hall/gateway/mail_fetch/email_fetch.env.example`
- `guild_hall/town_crier/telegram_notify.env.example`
- `guild_hall/gateway/mail_send/mail_send.env.example`
- `docs/architecture/workspace/examples/guild_hall/state/gateway/bindings/notify_policy.yaml`

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
npm run guild-hall:snapshot
npm run guild-hall:snapshot:check-fresh
```

`--live` 는 사용자가 명시적으로 요청할 때만 실행한다.

### 7. work PC bootstrap 보고

아래 항목을 짧게 보고한다.

- `node_identity.yaml` 생성 여부
- `node_identity.yaml` 이 public Git 에 추적되지 않는지 여부
- `_workspaces` shallow 상태
- `_workmeta` repo 존재 여부
- `private-state` repo 존재 여부
- doctor safe 결과
- doctor remote 결과
- snapshot check 결과
- 없는 env 파일 목록
- 사람이 직접 채워야 하는 secret/env 파일 경로
- 이 PC 에서 수행해도 되는 작업
- 이 PC 에서 아직 수행하지 말아야 하는 작업


# Always-On Node Bootstrap Prompt v0

## 목적

이 문서는 owner 가 현재 24시간 운영 primary 로 지정한 Soulforge PC 의 Codex 에게 전달할 bootstrap prompt 다. 대상은 고성능 PC, 맥미니, 또는 다른 항상 켜 두는 PC 가 될 수 있다.
긴 프롬프트를 화면공유나 원격 입력창에 붙여넣기 어려울 때, 이 파일을 Git 으로 내려받은 뒤 Codex 에게 "이 파일을 읽고 진행" 하라고 지시한다.

## 짧은 사용자 지시

현재 24시간 운영 primary 로 지정한 PC 에서 Soulforge repo 를 최신화한 뒤, Codex 에 아래 한 줄만 입력한다.

```text
docs/architecture/bootstrap/ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md 를 읽고 이 PC를 always_on_node로 local-only bootstrap 해줘.
```

## Codex 실행 프롬프트

너는 Soulforge always-on node bootstrap 담당자다.

### 작업 위치

- 사용자가 별도 경로를 주면 그 경로를 Soulforge root 로 본다.
- 별도 경로가 없으면 현재 working directory 의 `AGENTS.md` 와 `README.md` 존재 여부를 확인하고, 현재 directory 를 Soulforge root 로 본다.

### 목표

이 PC 를 Soulforge 의 `always_on_node` 로 설정한다.
이 PC 는 24시간 켜져 있는 운영 node 이며, gateway fetch, snapshot check, reminder, morning report candidate, night watch preflight 를 담당한다.
단, public repo 자동 commit/push 는 하지 않는다.
같은 물리 PC 에서 장시간 개발이나 tool-bound 작업도 돌릴 수 있지만, 이 prompt 가 설정하는 운영용 clone 에서는 개발 편집을 하지 않는다. 개발/tool 작업은 별도 worktree/clone 에서 `dev_worker_pc`, `tool_pc`, 또는 bounded task branch producer 로 설정한다.

### 중요 규칙

- 먼저 `AGENTS.md` 를 읽고 따른다.
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽고 따른다.
- `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md` 의 node role model 을 따른다.
- `docs/architecture/guild_hall/NIGHT_WATCH_AUTOMATION_V0.md` 의 always-on node 경계를 따른다.
- secret, token, credential, mailbox raw, attachment, private runtime content 는 읽지 않는다.
- `.env`, token, cookie, session, credential 파일은 내용이 아니라 존재 여부만 확인한다.
- public tracked 문서는 수정하지 않는다.
- local-only 설정만 만든다.
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
node_id: designated_always_on_01
node_role: always_on_node
bootstrap_profile: owner-with-state

description: Local-only identity for the always-on Soulforge operations node.

allowed_jobs:
  - gateway_fetch
  - snapshot_check
  - reminder
  - morning_report_candidate
  - night_watch
  - private_state_sync
  - activity_sync
  - lightweight_classification
  - dev_worker_handoff

blocked_jobs:
  - public_repo_auto_commit
  - public_repo_auto_push
  - direct_development_on_operations_clone
  - broad_file_rewrite
  - company_workspace_primary
  - tool_bound_allegro_work

primary_writer:
  public_repo: false
  workmeta: false
  private_state: true
  gateway_fetch: true
  night_watch: true

local_paths:
  soulforge_root: <actual Soulforge root>
  workmeta_root: <actual Soulforge root>/_workmeta
  private_state_root: <actual Soulforge root>/private-state
  local_runtime_root: <actual Soulforge root>/guild_hall/state
  workspaces_root: <owner-approved external workspace root or <actual Soulforge root>/_workspaces>
  dev_worktree_root: null

capabilities:
  - always_on_runtime
  - gateway_fetch
  - snapshot_check
  - night_watch
  - reminder
  - private_state_sync
  - lightweight_autohunt_scheduler

notes:
  - This file is local-only under guild_hall/state and must not be committed to public Git.
  - This node is the primary always-on operations node.
  - This node may sync/pull repos during preflight, but must not auto commit or auto push public tracked docs/code.
  - Long-running development or tool-bound work on this physical PC must use a separate worktree or clone with its own local node_identity.yaml.
  - OneDrive or other cloud workspaces may hold actual project files, but not public Git repos, _workmeta, private-state, guild_hall/state runtime, or secrets.
  - Secret values must be created or copied by the human owner only.
```

### 2.5 optional development worktree boundary

같은 물리 PC 에서 24시간 개발 작업도 돌리려면 운영용 clone 을 직접 수정하지 말고 별도 worktree 또는 별도 clone 을 만든다.

```bash
git fetch origin
git worktree add -b codex/designated-always-on-dev-<task> ../Soulforge-dev origin/main
```

그 worktree 에서는 `docs/architecture/bootstrap/DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md` 를 읽고 local-only `node_identity.yaml` 을 `dev_worker_pc` 성격으로 만든다. 운영용 clone 의 `node_identity.yaml` 은 계속 `always_on_node` 로 유지한다.

OneDrive 같은 cloud workspace 를 실제 프로젝트 파일 위치로 쓰려면 사용자가 대상 path 와 `project_code` 를 명시해야 한다. 이 bootstrap 은 cloud path 를 추측하거나 symlink/junction 을 자동 생성하지 않는다.

### 3. local env 존재 여부 확인

아래 파일은 존재 여부만 확인한다. 내용은 절대 읽지 않는다.

- `guild_hall/state/gateway/mailbox/state/email_fetch.env`
- `guild_hall/state/town_crier/telegram_notify.env`
- `guild_hall/state/gateway/mailbox/state/mail_send.env`
- `guild_hall/state/gateway/bindings/notify_policy.yaml`

없으면 어떤 example 에서 복사해야 하는지만 알려준다.

- `guild_hall/gateway/mail_fetch/email_fetch.env.example`
- `guild_hall/town_crier/telegram_notify.env.example`
- `guild_hall/gateway/mail_send/mail_send.env.example`
- `docs/architecture/workspace/examples/guild_hall/state/gateway/bindings/notify_policy.yaml`

### 4. private repo 존재 확인

존재 여부와 Git repo 여부만 확인한다.

- `_workmeta/.git`
- `private-state/.git`

없으면 clone URL 을 추측하지 말고, owner 에게 private repo URL 을 입력하라고 요청한다.

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

### 7. night watch preflight

아래 명령을 실행한다. `<actual Soulforge root>` 는 실제 absolute path 로 바꾼다.

```bash
npm run guild-hall:night-watch:preflight -- --local-root "<actual Soulforge root>" --workmeta-root "<actual Soulforge root>/_workmeta" --private-state-root "<actual Soulforge root>/private-state"
```

Windows PowerShell 에서 필요하면 `npm.cmd run guild-hall:night-watch:preflight -- ...` 를 사용한다.

### 8. 최종 보고

아래 항목을 짧게 보고한다.

- `node_identity.yaml` 생성 여부
- `node_identity.yaml` 이 public Git 에 추적되지 않는지 여부
- doctor safe 결과
- doctor remote 결과
- snapshot check 결과
- night watch preflight 결과
- 없는 env 파일 목록
- 사람이 직접 채워야 하는 secret/env 파일 경로
- 이 PC 에서 ACTIVE 로 켜도 되는 자동화
- 아직 PAUSED 로 둬야 하는 자동화

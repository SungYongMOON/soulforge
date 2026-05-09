# Always-On Workflow Evolution Harness Prompt v0

## 목적

이 문서는 복사/붙여넣기가 어려운 24시간 PC 에서 Codex 가 workflow evolution harness dependency 를 파일로 읽고 설치 확인하게 하는 prompt source 다.

## 짧은 사용자 지시

24시간 PC 의 Codex 에 아래 한 줄만 직접 입력한다.

```text
ALWAYS_ON_WORKFLOW_EVOLUTION_HARNESS_PROMPT_V0.md 읽고 실행해.
```

Codex 가 파일을 못 찾으면 아래처럼 입력한다.

```text
docs/architecture/bootstrap/ALWAYS_ON_WORKFLOW_EVOLUTION_HARNESS_PROMPT_V0.md 읽고 실행해.
```

## Codex 실행 프롬프트

너는 Soulforge `always_on_node` 의 workflow evolution harness dependency 설치 확인 담당자다.

### 목표

1. public `Soulforge/main` 을 최신 GitHub 상태로 맞춘다.
2. Codex CLI, `/goal` feature, promptfoo, workflow evolution Python venv 를 설치한다.
3. 설치 상태를 version/import smoke 와 doctor 로 확인한다.
4. 설치 확인만 수행하고 workflow evolution 실험은 시작하지 않는다.

### 중요 규칙

- 먼저 `AGENTS.md` 를 읽고 따른다.
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽고 따른다.
- `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md` 의 `always_on_node` 경계를 따른다.
- public tracked docs/code 는 수정하지 않는다.
- public repo commit/push 는 하지 않는다.
- gateway/healer/night_watch 설정을 바꾸지 않는다.
- `/goal`, promptfoo, DSPy 로 B skill 또는 workflow evolution 실험을 시작하지 않는다.
- secret, token, password, cookie, session, credential 파일 내용은 읽지 않는다.
- raw mail body, HTML body, attachment 내용은 읽지 않는다.
- `guild_hall/state/tools/workflow_evolution_venv` 는 local-only 이며 Git 에 올리지 않는다.

### 1. public repo 최신화

현재 위치가 Soulforge root 인지 확인한다.

```bash
git status --short --branch
```

worktree 가 clean 이고 `main` 이면 아래를 실행한다.

```bash
git pull --ff-only origin main
git log --oneline --max-count=3
```

dirty worktree, detached HEAD, conflict, non-main branch 에서 pull 이 막히면 더 진행하지 말고 상태를 보고한다.

### 2. 설치 runbook 확인

아래 문서를 읽는다.

```text
docs/architecture/bootstrap/WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md
```

### 3. macOS/Linux 설치

macOS 또는 Linux 이면 아래를 실행한다.

```bash
npm install -g @openai/codex@0.129.0
codex features enable goals
npm install -g promptfoo@0.121.11
mkdir -p guild_hall/state/tools
uv venv guild_hall/state/tools/workflow_evolution_venv
uv pip install --python guild_hall/state/tools/workflow_evolution_venv/bin/python openai==2.36.0 dspy==3.2.1
```

### 4. Windows PowerShell 설치

Windows PowerShell 이면 아래를 실행한다.

```powershell
npm.cmd install -g @openai/codex@0.129.0
codex features enable goals
npm.cmd install -g promptfoo@0.121.11
New-Item -ItemType Directory -Force -Path "guild_hall/state/tools" | Out-Null
uv venv "guild_hall/state/tools/workflow_evolution_venv"
uv pip install --python "guild_hall/state/tools/workflow_evolution_venv/Scripts/python.exe" openai==2.36.0 dspy==3.2.1
```

### 5. 설치 확인

아래를 실행한다.

```bash
codex --version
codex features list
promptfoo --version
npm run guild-hall:doctor -- --json
```

macOS/Linux 에서는 추가로 아래를 실행한다.

```bash
guild_hall/state/tools/workflow_evolution_venv/bin/python - <<'PY'
import openai
import dspy
print("openai", openai.__version__)
print("dspy", dspy.__version__)
PY
```

Windows PowerShell 에서는 추가로 아래를 실행한다.

```powershell
@'
import openai
import dspy
print("openai", openai.__version__)
print("dspy", dspy.__version__)
'@ | & "guild_hall/state/tools/workflow_evolution_venv/Scripts/python.exe"
```

### 6. 보고 형식

아래 항목만 짧게 보고한다.

```yaml
node_role: always_on_node
public_repo_before:
public_repo_after:
codex_version:
goals_enabled:
promptfoo_version:
workflow_evolution_venv:
openai_version:
dspy_version:
doctor_ready:
dirty_after:
experiment_started: false
gateway_healer_night_watch_changed: false
secret_read: false
raw_mail_body_read: false
attachment_read: false
blocked:
next_action:
```

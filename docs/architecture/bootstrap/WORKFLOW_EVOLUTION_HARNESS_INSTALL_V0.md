# Workflow Evolution Harness Install v0

## 목적

- 이 문서는 Soulforge owner PC 들에서 `workflow_evolution` 실험에 필요한 local harness tool 을 설치하고 확인하는 절차를 둔다.
- 대상은 `portable_dev_pc`, `tool_pc`, 필요 시 `work_pc` 이며, `always_on_node` 운영 clone 의 gateway/healer/night_watch 역할과 섞지 않는다.

## 설치 대상

필수:

- Codex CLI `0.129.0` 이상
- Codex `goals` feature flag enabled

Full local harness:

- `promptfoo` CLI
- local Python venv with `openai` SDK
- local Python venv with `dspy`

보류:

- Ralph-style loop 는 표준 공식 설치물이 아니라 반복 실행 패턴으로 본다. 임의 third-party package 를 바로 설치하지 않고, synthetic fixture 가 생긴 뒤 Soulforge local sandbox runner 후보로 만든다.

## macOS / npm 기준

```bash
npm install -g @openai/codex@0.129.0
codex --version
codex features enable goals
codex features list | grep '^goals'
```

`promptfoo` 를 eval matrix 후보로 쓸 PC 에서는 아래를 추가한다.

```bash
npm install -g promptfoo@0.121.11
promptfoo --version
```

OpenAI Evals API client 와 DSPy optimizer 후보를 같이 준비하려면 local-only venv 를 만든다.

```bash
mkdir -p guild_hall/state/tools
uv venv guild_hall/state/tools/workflow_evolution_venv
uv pip install --python guild_hall/state/tools/workflow_evolution_venv/bin/python openai==2.36.0 dspy==3.2.1
guild_hall/state/tools/workflow_evolution_venv/bin/python - <<'PY'
import openai
import dspy
print("openai", openai.__version__)
print("dspy", dspy.__version__)
PY
```

## Windows PowerShell 기준

```powershell
npm.cmd install -g @openai/codex@0.129.0
codex --version
codex features enable goals
codex features list | Select-String '^goals'
```

`promptfoo` 를 eval matrix 후보로 쓸 PC 에서는 아래를 추가한다.

```powershell
npm.cmd install -g promptfoo@0.121.11
promptfoo --version
```

OpenAI Evals API client 와 DSPy optimizer 후보를 같이 준비하려면 local-only venv 를 만든다.

```powershell
New-Item -ItemType Directory -Force -Path "guild_hall/state/tools" | Out-Null
uv venv "guild_hall/state/tools/workflow_evolution_venv"
uv pip install --python "guild_hall/state/tools/workflow_evolution_venv/Scripts/python.exe" openai==2.36.0 dspy==3.2.1
@'
import openai
import dspy
print("openai", openai.__version__)
print("dspy", dspy.__version__)
'@ | & "guild_hall/state/tools/workflow_evolution_venv/Scripts/python.exe"
```

## 운영 경계

- `/goal` 은 Soulforge canon 이 아니라 `workflow_evolution` 의 sandbox harness candidate 다.
- `/goal` 또는 promptfoo 실험은 synthetic fixture 와 sanitized evidence 로 시작한다.
- raw mail body, attachment, token, credential, private transcript 를 harness input/output 에 넣지 않는다.
- public repo 자동 commit/push 를 맡기지 않는다.
- `always_on_node` 운영용 clean `main` clone 에서 workflow slimming 실험을 하지 않는다.
- project 가 불명확한 실험은 특정 `_workmeta/<project_code>/` 로 임의 배정하지 않고 `_workmeta/system/**` 후보로 둔다.

## 확인 기준

MacBook Air 기준 확인된 baseline:

```text
codex-cli 0.129.0
goals experimental true
promptfoo 0.121.11
openai 2.36.0
dspy 3.2.1
```

다른 PC 에서는 같은 명령을 실행해 version 과 feature flag 만 보고한다. secret 값이나 auth token 은 출력하지 않는다.

## 관련 경로

- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`BOOTSTRAP_CHECKLIST_V0.json`](BOOTSTRAP_CHECKLIST_V0.json)
- [`../../.workflow/authoring/WORKFLOW_EVOLUTION_PLAN_V0.md`](../../../.workflow/authoring/WORKFLOW_EVOLUTION_PLAN_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)

# BOOTSTRAP_DOCTOR_V0

## 목적

- 이 문서는 clone 된 PC 에서 Soulforge readiness 를 점검하는 `guild-hall:doctor` 실행 계약을 잠근다.
- 사람과 에이전트가 공통으로 같은 bootstrap doctor entrypoint 를 쓰게 한다.

## 한 줄 정의

- bootstrap 은 “clone 됐는지 자동 감지”보다, 사용자가 또는 에이전트가 명시적으로 `npm run guild-hall:doctor` 를 실행하는 방식으로 시작한다.

## 실행 명령

```bash
npm run guild-hall:doctor
```

Windows PowerShell 에서 `npm.ps1` execution policy 로 막히면:

```powershell
npm.cmd run guild-hall:doctor
```

operator profile readiness 를 보려면:

```bash
npm run guild-hall:doctor -- --profile operator
```

Windows PowerShell:

```powershell
npm.cmd run guild-hall:doctor -- --profile operator
```

owner profile readiness 를 보려면:

```bash
npm run guild-hall:doctor -- --profile owner-with-state
```

Windows PowerShell:

```powershell
npm.cmd run guild-hall:doctor -- --profile owner-with-state
```

JSON 결과가 필요하면:

```bash
npm run guild-hall:doctor -- --json
```

Windows PowerShell:

```powershell
npm.cmd run guild-hall:doctor -- --json
```

외부 시스템 live 점검이 필요하면:

```bash
npm run guild-hall:doctor -- --live
```

Windows PowerShell:

```powershell
npm.cmd run guild-hall:doctor -- --live
```

GitHub auth / remote sync / 실제 최신 상태 점검이 필요하면:

```bash
npm run guild-hall:doctor -- --remote
```

Windows PowerShell:

```powershell
npm.cmd run guild-hall:doctor -- --remote
```

read-only device capability advisory 가 필요하면:

```bash
npm run guild-hall:doctor -- --device-capabilities --json
```

Windows PowerShell:

```powershell
npm.cmd run guild-hall:doctor -- --device-capabilities --json
```

이 mode 는 checklist 를 읽기 전에 조기 분기한다. bootstrap readiness, remote/live check, status file write 를 실행하지 않으며 결과는 readiness 판정이 아닌 advisory 다.

## 점검 범위

- local node identity
  - `guild_hall/state/local/node_identity.yaml`
  - `operator`, `owner-with-state` 에서는 필수로 본다
  - `public-only` 에서는 없을 수 있으나, 있으면 현재 PC 역할을 표시한다
  - `node_role`, `bootstrap_profile`, `local_paths.soulforge_root`, public Git 비추적 상태를 확인한다
- 필수 도구 존재 여부
  - `git`
  - `gh`
  - `node`
  - `npm`
  - `python3`
  - `uv`
- 선택 도구 존재 여부
  - `nlm`
  - `codex`
  - `promptfoo`
- 필수 Soulforge skill 설치 여부
  - `.registry/skills/*/codex/SKILL.md` 가 있는 sync 가능한 Soulforge Codex skill 전체
  - installed 이름은 `soulforge-<skill-id>` 형식으로 본다
  - `codex/SKILL.md` 가 없는 registry entry 는 bootstrap 필수 sync 대상이 아니다
- 필수 local Codex runtime skill 설치 여부
  - `conversation-rule-hardening`
  - 현재 local Codex runtime 에 실제 설치된 skill 을 본다
  - missing 이면 `.registry/skills` 승격 또는 `~/.codex/skills/` 복구 후 doctor 를 다시 실행한다
- 필수 Codex Stop hook 설정 여부
  - `guild_hall/knowledge_access/knowledge_trigger_stop_guard.mjs`
  - `guild_hall/knowledge_access/rule_hardening_stop_guard.mjs`
  - doctor 는 `~/.codex/config.toml` 을 payload 로 출력하지 않고, hook command 에 guard script ref 가 있는지만 확인한다
- local env / policy file 존재 여부
  - `public-only` 에서는 기본 readiness 필수 항목이 아니다
  - `operator`, `owner-with-state` 에서는 `email_fetch.env`, `telegram_notify.env`, `notify_policy.yaml` 를 본다
- optional local env 존재 여부
  - `mail_send.env`
  - sender runner 가 실제 생기기 전까지는 future-ready slot 로만 본다
- profile 기반 local path 여부
  - 기본 프로필은 `public-only`
  - `operator` 는 private repo 없이 local operator env 를 운용할 수 있다
  - `owner-with-state` 는 owner-only nested `_workmeta/`, `private-state/` repo 를 운용할 수 있다
  - current doctor v0 는 그중 nested `private-state/` repo 와 continuity data path 를 추가로 본다
- optional local harness path 여부
  - `guild_hall/state/tools/workflow_evolution_venv/bin/python`
  - 있으면 workflow evolution 실험용 OpenAI SDK / DSPy local venv 가 준비된 것으로 본다
- safe smoke test
  - `node --check guild_hall/gateway/cli.mjs`
  - `node guild_hall/town_crier/cli.mjs status`
  - `python3 -m py_compile ...`
- remote check
  - `gh auth status`
  - public repo `origin` remote 존재 여부
  - public repo `origin/main` 대비 최신 상태
  - `owner-with-state` 프로필이면 current doctor v0 는 nested `private-state/` repo remote 와 최신 상태도 본다
- live smoke test
  - `operator` 는 Hiworks POP3 와 Telegram `getMe` 를 기본 live 대상으로 본다
  - `owner-with-state` 는 위 둘에 더해 Hiworks SMTP 도 본다
  - `--live` 결과는 각 live check 를 개별 항목으로 보고한다
- device capability advisory
  - schema 는 `soulforge.device_capability_probe.v0`
  - node role, platform, architecture 와 workspace link aggregate 를 보고한다
  - macOS/Windows 고정 후보로 OneDrive와 Google Drive의 installed/running 상태를 보고하고, local identity 에 cloud root 가 설정됐는지 boolean 으로만 보고한다
  - public repo HEAD와 dirty file count, Ollama command/loopback availability 를 보고한다
  - local identity 의 `capability_probe.dev_erp_loopback` 이 켜졌을 때만 고정 `127.0.0.1:4300` health endpoint 를 확인한다
  - local identity 의 `capability_probe.nas_targets`, `capability_probe.sync_receipts` 를 bounded timeout 으로 확인하고 target별 label/path 대신 reachable/missing/timeout 및 fresh/stale/missing 개수만 보고한다
  - workspace junction audit는 timeout-bounded child process로 격리하고 Git 관찰은 `GIT_OPTIONAL_LOCKS=0`으로 index write 가능성을 막는다
  - optional input 미설정은 `not_configured`, 판별 불가는 `unknown` 이며 failure 로 승격하지 않는다

## secret 파일 비열람 원칙

- doctor 와 bootstrap agent 는 `.env`, token, password, cookie, session, credential JSON 같은 secret 파일의 내용을 열어 읽지 않는다.
- doctor 는 secret 파일의 존재 여부와 경로만 점검한다.
- 다른 PC 로 값을 옮길 때는 agent 가 원본 파일 경로와 대상 파일 경로만 안내하고, 사용자가 직접 복사/입력한다.
- `--live` 는 secret 값이 이미 채워졌다는 전제에서 외부 인증만 점검하며, secret 값을 출력하지 않는다.

## 출력과 종료 코드

- doctor 는 local status file `guild_hall/state/doctor/status.json` 을 쓴다.
- 예외적으로 `--device-capabilities` 는 status file 을 쓰지 않는다. 정상 advisory 는 capability gap 과 무관하게 exit code `0`, 내부 fatal 은 exit code `2` 다.
- required check 와 요청된 live check 가 모두 통과하면 exit code `0`
- readiness fail 이면 exit code `1`
- checklist parse 실패나 내부 fatal error 는 exit code `2`
- default 출력은 사람이 읽기 좋은 text 요약이고, `--json` 을 주면 구조화된 JSON 을 출력한다.

### JSON 출력 계약 v0

top-level:

- `schema_version`
- `doctor_version`
- `checklist_version`
- `mode`
- `profile`
- `generated_at`
- `repo_root`
- `ready`
- `summary`
- `status_file`
- `checklist_file`
- `results`
- `next_steps`
- optional `fatal`
- optional `detail`

result item:

- `id`
- `label`
- `category`
- `required`
- `status`
- `detail`
- optional `fix_hint`
- optional `path`
- optional `command`
- optional `template`

`local_node_identity` result 는 `category: node_identity` 로 보고한다. detail 은 `node_id`, `node_role`, `bootstrap_profile`, `soulforge_root`, Git 추적 상태를 포함한다.

현재 `status` 값은 아래 중 하나다.

- `ok`
- `missing`
- `failed`
- `blocked`
- `skipped`

summary 는 아래 숫자를 포함한다.

- `required_passed`
- `required_total`
- `node_identity_passed`
- `node_identity_total`
- `profile_checks_passed`
- `profile_checks_total`
- `safe_smokes_passed`
- `safe_smokes_total`
- `codex_runtime_skills_passed`
- `codex_runtime_skills_total`
- `codex_stop_hooks_passed`
- `codex_stop_hooks_total`
- `remote_checks_passed`
- `remote_checks_total`
- `live_smokes_passed`
- `live_smokes_total`

fatal path 도 같은 top-level shape 를 유지한다.

- `ready=false`
- `fatal=true`
- `results` 에 `fatal_internal_error` 1건을 넣는다.
- `detail` 은 fatal cause 원문을 담는다.

doctor 는 missing/failed/blocked result 에 대해 가능하면 item-level `fix_hint` 를 같이 제공한다.

- `fix_hint` 는 자동 실행이 아니라 다음 조치 가이드다.
- 사람과 AI 는 `results[].fix_hint` 를 우선 읽고 복구 순서를 정한다.

### Device capability JSON 계약 v0

top-level 은 `schema_version`, `kind`, `mode`, `generated_at`, `boundary`, `node`, `workspace_links`, `cloud_apps`, `repository`, `ollama`, `dev_erp_loopback`, `nas`, `sync_receipts` 를 포함한다. `boundary` 는 다음 privacy/side-effect 사실을 명시한다.

- advisory/read-only 이며 readiness 를 평가하지 않음
- checklist, remote check, live check, status write 를 실행하지 않음
- secret과 payload 를 읽거나 포함하지 않음
- absolute path, account identifier, workspace alias, target tail, filename, raw error 를 포함하지 않음
- doctor status와 Git index를 만들거나 갱신하지 않음

`guild_hall/state/local/node_identity.yaml` 의 선택 local-only 설정 shape 는 다음과 같다. 실제 path/ref 는 public 문서나 probe 출력에 복사하지 않는다.

```yaml
capability_probe:
  cloud_roots:
    onedrive: <owner-local-path>
    google_drive: <owner-local-path>
  dev_erp_loopback: true
  nas_targets:
    - path: <owner-local-path>
  sync_receipts:
    - path: <owner-local-receipt-path>
      max_age_hours: 24
```

## 기본 원칙

1. doctor 기본값은 safe local check 만 수행한다.
2. doctor 프로필 기본값은 `public-only` 다.
3. local node identity 는 각 PC 가 자신을 어떤 node role 로 인식하는지 먼저 확인하는 surface 다.
4. sync 가능한 Soulforge Codex skill 전체는 bootstrap 필수 항목으로 본다.
5. 필수 local Codex runtime skill 과 Stop hook 은 모든 프로필의 bootstrap 필수 항목으로 본다.
6. `--profile operator` 는 private repo 없이 local operator env 와 smoke/live 를 보는 public-safe 운영 프로필이다.
7. `--profile owner-with-state` 는 owner 전용 private repo 운용 프로필이고, current doctor v0 는 nested `private-state/` repo 와 continuity data path 를 추가로 본다.
8. 설치 절차에는 GitHub CLI 인증 완료가 포함된다.
9. `--remote` 는 GitHub auth, remote 연결, public/private repo 최신 상태를 본다.
10. `--live` 는 외부 인증/연결만 수행하고, 메일/메시지 실제 발송은 하지 않는다.
11. live mail fetch 나 Telegram send 는 doctor 기본 범위 밖이다.
12. bootstrap readiness 와 실제 업무 실행은 분리한다.
13. `codex`, `promptfoo`, workflow evolution venv 는 workflow evolution harness 후보용 optional tool 이며, `/goal` feature enable 과 OpenAI SDK / DSPy import 여부는 [`WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md`](WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md) 의 별도 확인 절차를 따른다.
14. `--device-capabilities` 는 bootstrap readiness 와 status persistence 에 영향을 주지 않는 순수 read-only advisory 다.

## clone 감지 원칙

- clone 사실 자체를 doctor 의 자동 트리거로 쓰지 않는다.
- 대신 `guild_hall/state/doctor/status.json` 이 없거나 local env 가 비어 있으면, 에이전트가 `guild-hall:doctor` 실행을 권장할 수 있다.
- 즉 clone 감지는 안내 힌트이고, 실제 실행 트리거는 명시적 command 다.

## 언제 어떤 모드를 쓰는가

- clone 직후: `npm run guild-hall:doctor`
- operator env 를 만든 직후: `npm run guild-hall:doctor -- --profile operator`
- owner PC 에서 `_workmeta/` 또는 `private-state/` clone 직후: `npm run guild-hall:doctor -- --profile owner-with-state`
- GitHub CLI 설치 직후: `gh auth status` 후 필요하면 `gh auth login`
- owner 설치 완료를 확인할 때: `npm run guild-hall:doctor -- --profile owner-with-state --remote`
- GitHub 최신 상태를 점검할 때: `npm run guild-hall:doctor -- --remote`
- env 와 policy 를 채운 직후: `npm run guild-hall:doctor -- --profile operator`
- 실제 외부 연결을 붙이기 직전: `npm run guild-hall:doctor -- --profile <operator|owner-with-state> --live`
- 운영 중 이상 징후가 있을 때: safe 먼저, 그다음 필요할 때만 live
- PC capability 요약이 필요할 때: `npm run guild-hall:doctor -- --device-capabilities --json`

## 관련 경로

- [`BOOTSTRAP_CHECKLIST_V0.json`](BOOTSTRAP_CHECKLIST_V0.json)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`BOOTSTRAP_PROFILES_V0.md`](BOOTSTRAP_PROFILES_V0.md)
- [`WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md`](WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../../../guild_hall/doctor/README.md`](../../../guild_hall/doctor/README.md)

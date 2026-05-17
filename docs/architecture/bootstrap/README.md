# docs/architecture/bootstrap

## 목적

- `bootstrap/` 은 clone 된 PC 에서 Soulforge 를 실제로 설치하고 readiness 를 확인하는 문서를 한곳에 모은다.
- 사람용 설치 가이드와 agent/doctor 용 실행 가이드를 같은 묶음에서 찾게 한다.

## 문서 역할 색인

| 문서 | 역할 |
| --- | --- |
| `BOOTSTRAP_PROFILES_V0.md` | `public-only`, `operator`, `owner-with-state` 설치/복원 범위를 정의한다. |
| `BOOTSTRAP_DOCTOR_V0.md` | clone 된 PC 의 readiness 를 `guild-hall:doctor` 로 확인하는 계약이다. |
| `BOOTSTRAP_CHECKLIST_V0.json` | doctor 가 읽는 profile/checklist data source 다. |
| `UPDATE_MANUAL_V0.md` | 이미 설치된 PC 를 pull/update/check 하는 절차를 둔다. |
| `OWNER_HANDOFF_CHECKLIST_V0.md` | 회사/집/다른 owner PC 로 이동할 때 확인할 handoff checklist 다. |
| `CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md` | AI 에게 owner bootstrap 을 맡길 때 쓰는 안전한 prompt source 다. |
| `CODEX_OWNER_UPDATE_PROMPT_V0.md` | AI 에게 owner update 를 맡길 때 쓰는 안전한 prompt source 다. |
| `ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md` | 24시간 운영 PC 의 Codex 가 읽고 `always_on_node` local bootstrap 을 수행할 prompt source 다. |
| `ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md` | 24시간 운영 PC 의 Codex 가 읽고 `email -> monster` local smoke test 를 수행할 prompt source 다. |
| `ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md` | 복사/붙여넣기가 어려운 24시간 운영 PC 에서 다음 gateway/healer 점검과 activity mirror 를 수행하게 하는 prompt source 다. |
| `ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md` | 복사/붙여넣기가 어려운 24시간 운영 PC 에서 PC별 activity ledger 를 취합하고 private-state 로 push 하게 하는 prompt source 다. |
| `ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md` | 24시간 PC healer/doctor/Telegram 감시를 deterministic script 중심으로 늘리는 rollout 기준이다. |
| `ALWAYS_ON_WORKFLOW_EVOLUTION_HARNESS_PROMPT_V0.md` | 복사/붙여넣기가 어려운 24시간 운영 PC 에서 workflow evolution harness dependency 설치 확인을 수행하게 하는 prompt source 다. |
| `WORK_PC_BOOTSTRAP_PROMPT_V0.md` | 업무 PC 의 Codex 가 읽고 `work_pc` local bootstrap 을 수행할 prompt source 다. |
| `TOOL_PC_BOOTSTRAP_PROMPT_V0.md` | 고성능 PC 의 Codex 가 읽고 project metadata read/write 가 가능한 `tool_pc` owner-with-state bootstrap 을 수행할 prompt source 다. |
| `DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md` | task packet 을 받아 검증 가능한 branch 를 만드는 `dev_worker_pc` bootstrap prompt source 다. |
| `WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md` | `/goal` 과 promptfoo 같은 workflow evolution harness 후보를 owner PC 에 설치하고 확인하는 절차다. |
| `../workspace/INSTALLATION_MANUAL_V0.md` | workspace 문서군이 소유하는 다른 PC 첫 설치 상위 runbook 이다. |
| `../workspace/MULTI_PC_DEVELOPMENT_V0.md` | 여러 PC clone, local runtime, node role, push/pull 운영 절차를 둔다. |
| `../workspace/PRIVATE_STATE_REPO_V0.md` | owner-only continuity mirror repo 의 포함/제외 범위를 둔다. |

## 읽는 순서

1. [`BOOTSTRAP_PROFILES_V0.md`](BOOTSTRAP_PROFILES_V0.md)
2. [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
3. [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
4. [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
5. [`UPDATE_MANUAL_V0.md`](UPDATE_MANUAL_V0.md)
6. [`OWNER_HANDOFF_CHECKLIST_V0.md`](OWNER_HANDOFF_CHECKLIST_V0.md)
7. [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
8. [`CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`](CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md)
9. [`CODEX_OWNER_UPDATE_PROMPT_V0.md`](CODEX_OWNER_UPDATE_PROMPT_V0.md)
10. [`ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md`](ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md)
11. [`ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md`](ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md)
12. [`ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md`](ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md)
13. [`ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md`](ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md)
14. [`ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md`](ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md)
15. [`ALWAYS_ON_WORKFLOW_EVOLUTION_HARNESS_PROMPT_V0.md`](ALWAYS_ON_WORKFLOW_EVOLUTION_HARNESS_PROMPT_V0.md)
16. [`WORK_PC_BOOTSTRAP_PROMPT_V0.md`](WORK_PC_BOOTSTRAP_PROMPT_V0.md)
17. [`TOOL_PC_BOOTSTRAP_PROMPT_V0.md`](TOOL_PC_BOOTSTRAP_PROMPT_V0.md)
18. [`DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md`](DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md)
19. [`WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md`](WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md)

## 실행 가이드

- 프로필이 명시되지 않으면 bootstrap 기본값은 `public-only` 다.
- `public-only` 는 public `Soulforge` 만 clone 하고 operator env 없이 구조/문서/validator 기준선만 본다.
- `operator` 는 public `Soulforge` 만 clone 하지만 gateway/town_crier local env 를 만들 수 있다.
- owner 본인만 명시적으로 Soulforge root 아래 `_workmeta/`, `private-state/` repo 를 함께 clone 하고 필요한 기록을 restore 한다.
- clone 후 AI 에게 bootstrap 을 맡길 때도 먼저 어떤 프로필인지 말한 뒤 `npm run guild-hall:doctor` 를 canonical entrypoint 로 사용한다.
- Windows PowerShell 에서 `npm.ps1` execution policy 로 막히면 같은 명령을 `npm.cmd run ...` 형태로 실행한다.
- 설치 후 최신 상태 점검과 pull 절차는 [`UPDATE_MANUAL_V0.md`](UPDATE_MANUAL_V0.md) 를 canonical guide 로 사용한다.
- 회사/집 handoff 체크는 [`OWNER_HANDOFF_CHECKLIST_V0.md`](OWNER_HANDOFF_CHECKLIST_V0.md) 를 canonical guide 로 사용한다.
- bootstrap 전 필수 프로그램은 `git`, `gh`, `node`, `npm`, `python3`, `uv` 다.
- bootstrap 설치 단계에는 `gh auth status` 확인과 필요 시 `gh auth login` 이 포함된다.
- `workflow_evolution` 실험을 맡는 owner PC 는 `WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md` 에 따라 Codex CLI `goals` feature 를 켜고, 필요 시 `promptfoo` 를 설치한다.
- bootstrap 전에는 sync 가능한 Soulforge Codex skill 전체를 local 에 맞추고, canonical 명령은 `npm run skills:sync -- --all` 이다.
- `codex/SKILL.md` 가 없는 registry entry 는 install/sync 대상이 아니다.
- clone 후 첫 readiness 점검은 `npm run guild-hall:doctor` 를 canonical entrypoint 로 쓴다.
- operator local env 를 다룰 PC 는 `npm run guild-hall:doctor -- --profile operator` 를 쓴다.
- owner PC 에서 nested `_workmeta/`, `private-state/` repo 까지 포함해 점검할 때는 `npm run guild-hall:doctor -- --profile owner-with-state` 를 쓴다.
- safe doctor 는 프로필별 필수 도구, local env, safe smoke test 를 확인하고 `guild_hall/state/doctor/status.json` 에 결과를 남긴다.
- `npm run guild-hall:doctor -- --remote` 는 GitHub auth, remote 연결, public/private repo 최신 상태를 확인한다.
- owner 설치 완료 판단에는 `npm run guild-hall:doctor -- --profile owner-with-state --remote` 통과를 포함한다.
- `npm run guild-hall:doctor -- --live` 는 실제 외부 인증/연결만 확인한다.
- live doctor 는 POP3/SMTP 로그인과 Telegram bot `getMe` 확인까지만 하고, 메일/메시지를 실제로 보내지 않는다.
- 24시간 Mac mini 에서 운영과 개발을 모두 돌릴 때는 `ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md` 를 운영용 clean clone 에만 적용하고, 장시간 개발은 별도 worktree/clone 에 `DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md` 를 적용한다.

## 관련 경로

- [`../../README.md`](../../README.md)
- [`../README.md`](../README.md)
- [`BOOTSTRAP_PROFILES_V0.md`](BOOTSTRAP_PROFILES_V0.md)
- [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
- [`BOOTSTRAP_CHECKLIST_V0.json`](BOOTSTRAP_CHECKLIST_V0.json)
- [`UPDATE_MANUAL_V0.md`](UPDATE_MANUAL_V0.md)
- [`OWNER_HANDOFF_CHECKLIST_V0.md`](OWNER_HANDOFF_CHECKLIST_V0.md)
- [`CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md`](CODEX_OWNER_BOOTSTRAP_PROMPT_V0.md)
- [`CODEX_OWNER_UPDATE_PROMPT_V0.md`](CODEX_OWNER_UPDATE_PROMPT_V0.md)
- [`ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md`](ALWAYS_ON_NODE_BOOTSTRAP_PROMPT_V0.md)
- [`ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md`](ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md)
- [`ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md`](ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md)
- [`ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md`](ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md)
- [`ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md`](ALWAYS_ON_HEALER_ROLLOUT_PLAN_V0.md)
- [`ALWAYS_ON_WORKFLOW_EVOLUTION_HARNESS_PROMPT_V0.md`](ALWAYS_ON_WORKFLOW_EVOLUTION_HARNESS_PROMPT_V0.md)
- [`WORK_PC_BOOTSTRAP_PROMPT_V0.md`](WORK_PC_BOOTSTRAP_PROMPT_V0.md)
- [`TOOL_PC_BOOTSTRAP_PROMPT_V0.md`](TOOL_PC_BOOTSTRAP_PROMPT_V0.md)
- [`DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md`](DEV_WORKER_PC_BOOTSTRAP_PROMPT_V0.md)
- [`WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md`](WORKFLOW_EVOLUTION_HARNESS_INSTALL_V0.md)
- [`../workspace/INSTALLATION_MANUAL_V0.md`](../workspace/INSTALLATION_MANUAL_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../../../guild_hall/doctor/README.md`](../../../guild_hall/doctor/README.md)

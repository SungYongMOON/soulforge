# MULTI_PC_DEVELOPMENT_V0

## 목적

- 이 문서는 Soulforge 를 다른 PC 에서 `clone -> local runtime materialize -> 다시 push` 하는 최소 절차를 잠근다.
- public tracked tree 와 local-only `guild_hall/state/**` / `_workspaces/<project_code>/**` runtime 을 섞지 않고, 여러 PC 에서 같은 정본을 이어서 개발하는 방법을 고정한다.

## 한 줄 정의

- Soulforge 의 정본 코드와 문서는 GitHub 로 동기화하고, owner-only `_workmeta/**` tracked metadata 도 별도 private GitHub repo 로 동기화한다. active `guild_hall/state/**` 와 `_workspaces/<project_code>/**` runtime 상태는 각 PC 의 local-only data 로 유지한다.
- 필요한 경우 owner-only `private-state/` repo 에서 mailbox continuity subset, fetch/intake 기록, 전체 활동 recent-context 를 mirror/restore 할 수 있다.

## 프로필 기준

- 프로필이 명시되지 않으면 다른 PC clone 기본값은 `public-only` 다.
- `public-only` 는 public `Soulforge` 만 clone 한다.
- `operator` 는 public `Soulforge` 만 clone 하지만 local operator env 를 만든다.
- `owner-with-state` 만 Soulforge root 아래 owner-only `_workmeta/`, `private-state/` repo 를 clone 하고 필요한 기록을 복원한다.
- 팀원/공유 대상에게는 `_workmeta/`, `private-state/` 같은 private repo URL 을 주지 않는다.
- AI 에게 bootstrap 을 맡길 때도 먼저 어떤 프로필인지 명시한다.

## Git 으로 따라오는 것

- `.mission/`
- `guild_hall/`
- `docs/architecture/`
- `.registry/`, `.unit/`, `.workflow/`, `.party/`
- `scripts/`
- `package.json`, `package-lock.json`
- `docs/architecture/workspace/examples/**`
- owner 본인만 접근하는 `_workmeta/**` tracked metadata subset

## Git 으로 따라오지 않는 것

- `_workspaces/<project_code>/` 실제 프로젝트 파일
- `guild_hall/state/gateway/` 실제 mailbox, intake inbox, event log
- `guild_hall/state/town_crier/` 실제 queue, send log, telegram env
- `guild_hall/state/operations/` active total-activity context
- `_workmeta/<project_code>/runs/`, `battle_log/`, `morning_report/` 같은 local runtime truth
- host-local skill install, local binding, private mailbox dump
- local NotebookLM auth/session
- local Telegram bot token/chat id

## 다른 PC 첫 세팅

1. `git`, `gh`, `node`, `npm`, `python3`, `uv` 가 설치돼 있는지 확인한다.
2. 필요하면 `gh auth login` 으로 GitHub CLI 인증을 먼저 끝낸다.
3. 저장소를 clone 한다.
4. `owner-with-state` 프로필이면 Soulforge root 아래 owner-only `_workmeta/` repo 를 clone 한다.
5. cross-project continuity 기록도 이어서 쓸 필요가 있으면 Soulforge root 아래 `private-state/` repo 를 clone 한다.
6. repo root 에서 `npm install` 을 1회 실행한다.
7. UI 를 만질 예정이면 `npm run ui:workspace:install` 을 1회 실행한다.
8. sync 가능한 Soulforge Codex skill 전체를 local Codex 에 sync 한다.
9. 필요하면 NotebookLM MCP 를 [`NOTEBOOKLM_MCP_SETUP_V0.md`](../../../docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md) 기준으로 대상 PC 에 재설치한다.
10. 실제 runtime 을 만들기 전에 [`examples/guild_hall/state/gateway/README.md`](../../../docs/architecture/workspace/examples/guild_hall/state/gateway/README.md) 를 먼저 읽어 fetch/intake 흐름을 확인한다.
11. `operator` 또는 `owner-with-state` 프로필이면 `guild_hall/gateway/mail_fetch/email_fetch.env.example` 를 참고해 local env file 을 만든다.
12. `operator` 또는 `owner-with-state` 프로필이고 outbound mail 을 바로 쓸 계획이 있으면 `guild_hall/gateway/mail_send/mail_send.env.example` 를 참고해 local outbound mail env file 을 만든다.
13. `operator` 또는 `owner-with-state` 프로필이면 `docs/architecture/workspace/examples/guild_hall/state/gateway/bindings/notify_policy.yaml` 를 local `guild_hall/state/gateway/bindings/notify_policy.yaml` 로 복사하거나, `guild-hall:notify:gateway` 명령으로 첫 policy file 을 만든다.
14. `owner-with-state` 프로필이라면 `_workmeta/` clone 으로 project metadata 를 먼저 받고, 필요하면 [`PRIVATE_STATE_REPO_V0.md`](../../../docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md) 기준으로 `private-state/` continuity subset 을 추가 복원한다.
15. recent context 가 필요하면 `guild_hall/state/operations/soulforge_activity/latest_context.json` 을 먼저 읽고, 더 필요할 때만 현재 월 `events/*.jsonl` 마지막 몇 건을 추가로 본다.
16. `npm run guild-hall:doctor` 로 bootstrap readiness 를 먼저 확인한다.
17. 첫 `guild-hall:gateway:fetch` 또는 `guild-hall:gateway:intake` 실행 시 `guild_hall/state/gateway/**` local runtime 폴더는 스크립트가 자동으로 만든다.
18. 실제 프로젝트별 `_workspaces/<project_code>/` 와 폴더 트리는 그 PC 의 현장 구조에 맞춰 따로 만든다.

## 다른 PC skill 세팅

1. canonical `skill_id` 는 저장소가 들고 간다.
2. 실제 Codex installed skill 은 각 PC 에서 따로 materialize 해야 한다.
3. baseline sync 문서는 [`SKILL_INSTALL_SYNC.md`](../../../.registry/docs/operations/SKILL_INSTALL_SYNC.md) 다.
4. repo root 에서 아래처럼 sync 한다.

```bash
npm run skills:sync -- --all
```

Windows PowerShell:

```powershell
npm.cmd run skills:sync -- --all
```

5. `.registry/skills/*/codex/SKILL.md` 가 있는 skill 은 bootstrap 필수 sync 대상이고, `guild-hall:doctor` 도 이 기준으로 readiness 를 판단한다.
6. `codex/SKILL.md` 가 없는 registry entry 는 test/canon-only package 로 보고 sync 대상에 넣지 않는다.
7. local runtime binding 은 각 PC 의 `_workmeta/<project_code>/bindings/skill_execution_binding.yaml` 이 `skill_id -> installed Codex skill name` 을 resolve 한다.

예:

```yaml
skill_bindings:
  - skill_id: shield_wall
    codex_skill_name: soulforge-shield-wall
  - skill_id: record_stitch
    codex_skill_name: soulforge-record-stitch
```

## 다른 PC 에서 이어서 개발하는 방법

1. PC A 에서 코드나 문서를 바꾼다.
2. owner 전용 project metadata 를 바꿨으면 `_workmeta/` private repo 에도 commit/push 한다.
3. 필요한 변경만 각 GitHub repo 에 push 한다.
4. PC B 에서 public `Soulforge` 와 owner 전용 `_workmeta/` 를 `git pull --rebase origin main` 으로 최신화한다.
5. continuity data 도 이어서 봐야 하면 `private-state/` 도 `git pull --rebase origin main` 으로 최신화한다.
6. PC B 의 local `_workspaces/**` 는 그대로 두고, tracked code/doc 와 private metadata 만 업데이트한다.
7. PC B 에서 다시 작업한 뒤 필요한 repo 에만 commit/push 한다.

## AI 위임 규칙

- 팀원/공유 PC 에서는 AI 에게 `public-only` 로 bootstrap 하라고 지시한다.
- local operator env 까지 다루는 PC 에서는 AI 에게 `operator` 로 bootstrap 하라고 지시한다.
- Windows PowerShell 에서 `npm.ps1` execution policy 로 막히면 bootstrap/update 문서의 `npm run ...` 명령을 `npm.cmd run ...` 형태로 바꿔 실행한다.
- owner 개인 PC 에서는 AI 에게 `owner-with-state` 로 bootstrap 하라고 지시한다.
- AI 는 프로필이 없으면 `public-only` 로 가정해야 한다.
- AI 는 owner 전용 `_workmeta/`, `private-state/` clone/restore 를 자동으로 시도하지 않고, owner 프로필과 repo 접근이 명시될 때만 수행한다.
- AI 는 먼저 `npm run guild-hall:doctor -- --profile <profile>` 를 수행하고, 필요할 때만 `--remote`, local env 가 채워진 뒤에만 `--live` 를 수행한다.
- AI 는 recent context 가 필요하면 `guild_hall/state/operations/soulforge_activity/latest_context.json` 을 먼저 읽고, 부족할 때만 현재 월 `events/*.jsonl` 마지막 몇 건을 추가로 읽는다.

## 중요한 운영 규칙

1. `guild_hall/state/**` 와 `_workspaces/**` 는 공유 저장소가 아니라 각 PC 의 local runtime 이다.
2. 다른 PC 로 옮길 때 project metadata 는 owner-only `_workmeta/` private repo 로 옮기고, 현재 intake 상태 같은 cross-project continuity 는 `private-state/` 로 옮긴다. `guild_hall/state/**` 와 `_workspaces/**` 전체를 public Git 으로 올리지는 않는다.
3. Soulforge 전체 활동 recent-context 는 project `_workmeta` 가 아니라 `guild_hall/state/operations/soulforge_activity/**` 를 active owner 로 두고, owner-only `private-state/` 로만 mirror 한다.
4. canonical 구조, 계약 문서, public-safe sample 은 Git 으로 옮긴다.
5. project 실자료는 GitHub 에 올리지 않는다. mailbox 원문/event/raw/attachment 는 public GitHub 에 올리지 않고, 필요할 때 owner-only `private-state/` mirror 로만 옮긴다.
6. 다른 PC 의 경로가 달라도 `docs/architecture/workspace/examples/**` 와 contract 문서만으로 같은 구조를 재현할 수 있어야 한다.

## 기본 실행 예시

```bash
git clone <repo-url>
cd Soulforge
npm install
npm run guild-hall:gateway:intake -- --payload-file docs/architecture/workspace/examples/guild_hall/state/gateway/requests/mail_intake_request_created_only.json
```

메일 intake 기본 예시:

```bash
npm run guild-hall:gateway:intake -- --payload-file docs/architecture/workspace/examples/guild_hall/state/gateway/requests/mail_intake_request_created_only.json
```

메일 fetch 기본 예시:

```bash
npm run guild-hall:gateway:fetch -- --once --json
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

## 스크립트 기준

- `guild-hall:gateway:fetch` 는 `guild_hall/state/gateway/mailbox/**` 와 `log/mail_fetch/**` 를 자동 생성한다.
- `guild-hall:doctor` 는 필수 도구, local env, safe smoke test 를 확인하고 `guild_hall/state/doctor/status.json` 을 남긴다.
- `guild-hall:gateway:fetch:healthcheck` 는 `log/mail_fetch/logs/last_run_summary.json` 기반 이상 감지를 수행한다.
- `guild-hall:gateway:intake` 는 `guild_hall/state/gateway/intake_inbox/**` 와 `log/monster_events/**` 를 자동 생성한다.
- `guild-hall:town-crier:send` 는 local env file 기준으로 단발 Telegram 알림을 전송한다.
- `guild-hall:notify:gateway` 는 local gateway notify policy 에서 event on/off 를 바꾼다.
- `guild-hall:notify:mission` 은 tracked `.mission/<mission_id>/mission.yaml` 안의 notify toggle 을 바꾼다.
- `guild-hall:notify:emit` 은 enabled 상태일 때만 scope/event 기준으로 `town_crier` queue 에 notify request 를 적재한다.
- `guild-hall:gateway:update` 는 이미 생긴 inbox/monster record 를 갱신한다.
- `skills:sync` 는 tracked `.registry/skills/<skill_id>/codex/**` bridge 를 local `~/.codex/skills/soulforge-<skill-id>/` 로 materialize 한다.
- 실제 프로젝트 쪽 `_workspaces/<project_code>/` materialization 은 별도 assignment/execution 단계가 맡는다.

## 권장 Git 운용

- 혼자 두 PC 를 번갈아 쓸 때는 `main` 만 써도 된다.
- 두 PC 에서 동시에 다른 작업을 오래 끌면 짧은 feature branch 를 만들고, 마무리 전에 `main` 에 합치는 쪽이 안전하다.
- 다른 PC 로 넘어가기 전에는 최소한 commit 까지는 남기고 이동한다.

## 연결 문서

- [`README.md`](../../../README.md)
- [`INSTALLATION_MANUAL_V0.md`](../../../docs/architecture/workspace/INSTALLATION_MANUAL_V0.md)
- [`../bootstrap/BOOTSTRAP_PROFILES_V0.md`](../../../docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md)
- [`_workspaces/README.md`](../../../_workspaces/README.md)
- [`MAIL_INTAKE_REQUEST_V0.md`](../../../docs/architecture/workspace/MAIL_INTAKE_REQUEST_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](../../../docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`GATEWAY_MAIL_FETCH_V0.md`](../../../docs/architecture/workspace/GATEWAY_MAIL_FETCH_V0.md)
- [`MAIL_SEND_V0.md`](../../../docs/architecture/workspace/MAIL_SEND_V0.md)
- [`GATEWAY_NOTIFY_V0.md`](../../../docs/architecture/workspace/GATEWAY_NOTIFY_V0.md)
- [`PRIVATE_STATE_REPO_V0.md`](../../../docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md)
- [`../bootstrap/README.md`](../../../docs/architecture/bootstrap/README.md)
- [`../bootstrap/BOOTSTRAP_DOCTOR_V0.md`](../../../docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md)
- [`NOTEBOOKLM_MCP_SETUP_V0.md`](../../../docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md)
- [`examples/guild_hall/state/gateway/README.md`](../../../docs/architecture/workspace/examples/guild_hall/state/gateway/README.md)
- [`guild_hall/README.md`](../../../guild_hall/README.md)
- [`../guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`](../../../docs/architecture/guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md)
- [`SKILL_INSTALL_SYNC.md`](../../../.registry/docs/operations/SKILL_INSTALL_SYNC.md)

## ASSUMPTIONS

- canonical tracked tree 는 계속 GitHub 로 sync 하고, `guild_hall/state/**` 와 `_workspaces/**` 는 local-only runtime 원칙을 유지한다고 본다.

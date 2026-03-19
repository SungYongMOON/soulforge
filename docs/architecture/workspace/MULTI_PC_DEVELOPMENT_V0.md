# MULTI_PC_DEVELOPMENT_V0

## 목적

- 이 문서는 Soulforge 를 다른 PC 에서 `clone -> local runtime materialize -> 다시 push` 하는 최소 절차를 잠근다.
- public tracked tree 와 local-only `_workspaces/` runtime 을 섞지 않고, 여러 PC 에서 같은 정본을 이어서 개발하는 방법을 고정한다.

## 한 줄 정의

- Soulforge 의 정본 코드와 문서는 GitHub 로 동기화하고, 실제 `_workspaces/**` runtime 상태는 각 PC 의 local-only data 로 유지한다.

## Git 으로 따라오는 것

- `.mission/`
- `docs/architecture/`
- `.registry/`, `.unit/`, `.workflow/`, `.party/`
- `scripts/`
- `package.json`, `package-lock.json`
- `docs/architecture/workspace/examples/**`

## Git 으로 따라오지 않는 것

- `_workspaces/<project_code>/` 실제 프로젝트 파일
- `_workspaces/gateway/` 실제 mailbox, intake inbox, event log
- `.project_agent/runs/`, `battle_log/`, `morning_report/` 같은 local runtime truth
- host-local skill install, local binding, private mailbox dump

## 다른 PC 첫 세팅

1. 저장소를 clone 한다.
2. repo root 에서 `npm install` 을 1회 실행한다.
3. UI 를 만질 예정이면 `npm run ui:workspace:install` 을 1회 실행한다.
4. 필요한 Soulforge skill 을 local Codex 에 sync 한다.
5. 실제 runtime 을 만들기 전에 [`examples/gateway/README.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/README.md) 를 먼저 읽어 intake 흐름을 확인한다.
6. 첫 `gateway:intake` 실행 시 `_workspaces/gateway/.project_agent/**` local runtime 폴더는 스크립트가 자동으로 만든다.
7. 실제 프로젝트별 `_workspaces/<project_code>/` 와 폴더 트리는 그 PC 의 현장 구조에 맞춰 따로 만든다.

## 다른 PC skill 세팅

1. canonical `skill_id` 는 저장소가 들고 간다.
2. 실제 Codex installed skill 은 각 PC 에서 따로 materialize 해야 한다.
3. baseline sync 문서는 [`SKILL_INSTALL_SYNC.md`](/Users/seabotmoon-air/Workspace/Soulforge/.registry/docs/operations/SKILL_INSTALL_SYNC.md) 다.
4. repo root 에서 아래처럼 sync 한다.

```bash
npm run skills:sync -- shield_wall record_stitch skill_check
```

5. local runtime binding 은 각 PC 의 `.project_agent/bindings/skill_execution_binding.yaml` 이 `skill_id -> installed Codex skill name` 을 resolve 한다.

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
2. 필요한 변경만 commit 하고 GitHub 에 push 한다.
3. PC B 에서 같은 저장소를 `git pull --rebase origin main` 으로 최신화한다.
4. PC B 의 local `_workspaces/**` 는 그대로 두고, tracked code/doc 만 업데이트한다.
5. PC B 에서 다시 작업한 뒤 commit/push 한다.

## 중요한 운영 규칙

1. `_workspaces/**` 는 공유 저장소가 아니라 각 PC 의 local runtime 이다.
2. 다른 PC 로 옮길 때 현재 intake 상태나 project runtime 상태가 꼭 필요하면 `_workspaces/**` 는 Git 이 아니라 별도 복사로 이동한다.
3. canonical 구조, 계약 문서, public-safe sample 은 Git 으로 옮긴다.
4. local mailbox dump, private attachment, project 실자료는 GitHub 에 올리지 않는다.
5. 다른 PC 의 경로가 달라도 `docs/architecture/workspace/examples/**` 와 contract 문서만으로 같은 구조를 재현할 수 있어야 한다.

## 기본 실행 예시

```bash
git clone <repo-url>
cd Soulforge
npm install
npm run gateway:intake -- --payload-file docs/architecture/workspace/examples/gateway/requests/mail_intake_request_created_only.json
```

## 스크립트 기준

- `gateway:intake` 는 `_workspaces/gateway/.project_agent/intake_inbox/**` 와 `log/monster_events/**` 를 자동 생성한다.
- `gateway:update` 는 이미 생긴 inbox/monster record 를 갱신한다.
- `skills:sync` 는 tracked `.registry/skills/<skill_id>/codex/**` bridge 를 local `~/.codex/skills/soulforge-<skill-id>/` 로 materialize 한다.
- 실제 프로젝트 쪽 `_workspaces/<project_code>/` materialization 은 별도 assignment/execution 단계가 맡는다.

## 권장 Git 운용

- 혼자 두 PC 를 번갈아 쓸 때는 `main` 만 써도 된다.
- 두 PC 에서 동시에 다른 작업을 오래 끌면 짧은 feature branch 를 만들고, 마무리 전에 `main` 에 합치는 쪽이 안전하다.
- 다른 PC 로 넘어가기 전에는 최소한 commit 까지는 남기고 이동한다.

## 연결 문서

- [`README.md`](/Users/seabotmoon-air/Workspace/Soulforge/README.md)
- [`_workspaces/README.md`](/Users/seabotmoon-air/Workspace/Soulforge/_workspaces/README.md)
- [`MAIL_INTAKE_REQUEST_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/MAIL_INTAKE_REQUEST_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/WORKSPACE_INTAKE_INBOX_V0.md)
- [`examples/gateway/README.md`](/Users/seabotmoon-air/Workspace/Soulforge/docs/architecture/workspace/examples/gateway/README.md)
- [`SKILL_INSTALL_SYNC.md`](/Users/seabotmoon-air/Workspace/Soulforge/.registry/docs/operations/SKILL_INSTALL_SYNC.md)

## ASSUMPTIONS

- canonical tracked tree 는 계속 GitHub 로 sync 하고, `_workspaces/**` 는 local-only runtime 원칙을 유지한다고 본다.

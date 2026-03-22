# INSTALLATION_MANUAL_V0

## 목적

- 이 문서는 다른 PC 에서 Soulforge 를 처음 설치할 때 필요한 최소 절차를 한 곳에 모은다.
- clone, local env, skill install, NotebookLM MCP, gateway fetch/intake 까지의 첫 bootstrap 순서를 잠근다.

## Chapter 0. 설치 프로필 선택

먼저 어떤 프로필로 설치할지 고른다.

- `public-only`
  - 팀원, 리뷰어, 일반 사용자
  - public `Soulforge` 만 clone 한다
  - private state repo 는 받지 않는다
- `owner-with-state`
  - owner 본인
  - public `Soulforge` 와 nested `private-state/` 둘 다 준비한다
  - 허용된 기록 subset 만 restore 한다
- `ai-assisted-bootstrap`
  - clone 후 사용자가 직접 모든 명령을 치지 않고 AI 에게 bootstrap 을 맡긴다
  - 이 경우에도 먼저 `public-only` 인지 `owner-with-state` 인지 프로필을 명시한다

프로필이 명시되지 않으면 기본값은 `public-only` 다.
상세 기준은 [`../bootstrap/BOOTSTRAP_PROFILES_V0.md`](../../../docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md) 를 따른다.

## 설치 원칙

1. GitHub 는 코드, 문서, example 만 옮긴다.
2. 실제 `guild_hall/state/**` 와 `_workspaces/<project_code>/**` runtime 은 각 PC 에서 새로 materialize 한다.
3. 인증 정보와 `.env` 는 다른 PC 에서 다시 만든다.
4. NotebookLM 로그인 상태와 Telegram/Gmail/Hiworks 자격증명은 Git 으로 옮기지 않는다.
5. 필요한 업무 기록만 이어서 가져갈 때는 Soulforge root 아래 nested `private-state/` repo 를 쓴다.

## Chapter 1. 필수 프로그램

- `git`
- `gh`
- `node`
- `npm`
- `python3`
- `uv`

`gh` 는 private state repo 생성/연결, GitHub auth 상태 확인, clone 전후 저장소 작업에 필수로 본다.

## Chapter 2. 저장소 준비

```bash
git clone <repo-url>
cd Soulforge
npm install
```

GitHub CLI 인증이 아직 없으면 먼저:

```bash
gh auth login
```

UI 를 만질 예정이면:

```bash
npm run ui:workspace:install
```

`owner-with-state` 프로필만 선택 기록 복원을 위해 Soulforge root 아래 `private-state/` repo 를 둔다.

```bash
git clone <private-state-repo-url> private-state
```

## Chapter 3. Soulforge skill 설치

필요한 Codex skill 을 local 에 materialize 한다.

```bash
npm run skills:sync -- shield_wall record_stitch skill_check
```

필요하면 추가 skill 도 같은 방식으로 sync 한다.

## Chapter 4. guild_hall local env 생성

메일 fetch env:

```bash
mkdir -p guild_hall/state/gateway/mailbox/state
cp guild_hall/gateway/mail_fetch/email_fetch.env.example guild_hall/state/gateway/mailbox/state/email_fetch.env
```

Telegram notify env:

```bash
mkdir -p guild_hall/state/town_crier
cp guild_hall/town_crier/telegram_notify.env.example guild_hall/state/town_crier/telegram_notify.env
```

Optional outbound mail env:

```bash
mkdir -p guild_hall/state/gateway/mailbox/state
cp guild_hall/gateway/mail_send/mail_send.env.example guild_hall/state/gateway/mailbox/state/mail_send.env
```

Gateway notify policy:

```bash
mkdir -p guild_hall/state/gateway/bindings
cp docs/architecture/workspace/examples/guild_hall/state/gateway/bindings/notify_policy.yaml guild_hall/state/gateway/bindings/notify_policy.yaml
```

그 다음 각 PC 의 실제 값만 채운다.

- Gmail token 또는 token file
- Hiworks POP3 host / username / password
- Telegram bot token / chat id
- outbound mail 을 바로 쓸 계획이 있으면 Hiworks SMTP host / username / password

`owner-with-state` 프로필일 때만, 첫 bootstrap 실행 전에 private state repo 에서 필요한 subset 만 복원한다.

```bash
rsync -a private-state/guild_hall/state/gateway/intake_inbox/ guild_hall/state/gateway/intake_inbox/
rsync -a private-state/guild_hall/state/gateway/log/monster_events/ guild_hall/state/gateway/log/monster_events/
rsync -a private-state/guild_hall/state/gateway/mailbox/outbound/ guild_hall/state/gateway/mailbox/outbound/
rsync -a private-state/guild_hall/state/gateway/log/mail_send/ guild_hall/state/gateway/log/mail_send/
rsync -a private-state/_workspaces/ _workspaces/
```

## Chapter 5. NotebookLM MCP 설치

NotebookLM 은 대상 PC 에서 다시 설치하고 다시 로그인한다.

```bash
uv tool install --force notebooklm-mcp-cli
which nlm
which notebooklm-mcp
nlm --version
notebooklm-mcp --help
nlm login
```

`~/.codex/config.toml` 에 MCP server 등록이 필요하면
[NOTEBOOKLM_MCP_SETUP_V0.md](../../../docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md)
를 따른다.

## Chapter 6. gateway mailbox bootstrap

먼저 public-safe sample 을 본다.

- [examples/guild_hall/state/gateway/README.md](../../../docs/architecture/workspace/examples/guild_hall/state/gateway/README.md)

메일 fetch 실행:

```bash
npm run guild-hall:gateway:fetch -- --once --json
```

healthcheck 실행:

```bash
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

monster intake 실행 예시:

```bash
npm run guild-hall:gateway:intake -- --payload-file docs/architecture/workspace/examples/guild_hall/state/gateway/requests/mail_intake_request_created_only.json
```

Telegram notify 점검 예시:

```bash
npm run guild-hall:town-crier:send -- --text "gateway ready"
npm run guild-hall:notify:gateway -- --event monster_created --on
```

## Chapter 7. 설치 후 확인

bootstrap doctor:

```bash
npm run guild-hall:doctor
```

외부 인증/연결 live 점검은 자격증명을 채운 뒤에만 별도로 돌린다.

```bash
npm run guild-hall:doctor -- --live
```

아래 경로가 local 에 생기면 bootstrap 이 맞다.

- `guild_hall/state/gateway/mailbox/`
- `guild_hall/state/gateway/mailbox/outbound/`
- `guild_hall/state/gateway/intake_inbox/`
- `guild_hall/state/gateway/log/mail_fetch/`
- `guild_hall/state/gateway/log/monster_events/`
- `guild_hall/state/gateway/log/mail_send/`
- `guild_hall/state/doctor/status.json`
- `guild_hall/state/town_crier/`
- `guild_hall/state/gateway/bindings/notify_policy.yaml`

## Chapter 8. AI 에게 bootstrap 맡기기

다른 PC 에서 사용자가 직접 절차를 모두 치지 않을 경우, AI 에게 먼저 설치 프로필을 알려준다.

- 팀원/공유 PC:
  - `public-only` 프로필로 진행하라고 지시한다.
  - private state repo 는 clone/restore 하지 말라고 명시한다.
- owner 개인 PC:
  - `owner-with-state` 프로필로 진행하라고 지시한다.
  - `private-state/` repo 를 Soulforge root 아래 clone 하고 [`PRIVATE_STATE_REPO_V0.md`](../../../docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md) 기준 허용 subset 만 restore 하라고 명시한다.

AI 는 아래 순서만 따르게 한다.

1. [`../bootstrap/README.md`](../../../docs/architecture/bootstrap/README.md) 와 [`../bootstrap/BOOTSTRAP_PROFILES_V0.md`](../../../docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md) 를 읽는다.
2. local env 가 비어 있으면 사용자에게 입력이 필요한 파일만 묻는다.
3. `npm run guild-hall:doctor -- --profile <profile>` 를 먼저 수행한다.
4. GitHub 연결과 최신 상태를 볼 때만 `npm run guild-hall:doctor -- --profile <profile> --remote` 를 수행한다.
5. 자격증명이 채워진 뒤에만 `npm run guild-hall:doctor -- --profile <profile> --live` 를 수행한다.

## Chapter 9. 다른 PC 로 옮길 때 주의

- `guild_hall/state/**` 와 `_workspaces/**` 는 Git 으로 안 따라온다.
- 기존 PC 의 auth/session 을 새 PC 로 복사하지 않는다.
- 꼭 필요한 경우에도 `_workspaces/**` 와 `guild_hall/state/**` 는 public Git 으로 보내지 않고, [`PRIVATE_STATE_REPO_V0.md`](../../../docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md) 기준의 별도 private repo 또는 별도 복사로 옮긴다.

## 연결 문서

- [MULTI_PC_DEVELOPMENT_V0.md](../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [PRIVATE_STATE_REPO_V0.md](../../../docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md)
- [../bootstrap/README.md](../../../docs/architecture/bootstrap/README.md)
- [../bootstrap/BOOTSTRAP_PROFILES_V0.md](../../../docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md)
- [../bootstrap/BOOTSTRAP_DOCTOR_V0.md](../../../docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md)
- [GATEWAY_MAIL_FETCH_V0.md](../../../docs/architecture/workspace/GATEWAY_MAIL_FETCH_V0.md)
- [MAIL_SEND_V0.md](../../../docs/architecture/workspace/MAIL_SEND_V0.md)
- [GATEWAY_NOTIFY_V0.md](../../../docs/architecture/workspace/GATEWAY_NOTIFY_V0.md)
- [NOTEBOOKLM_MCP_SETUP_V0.md](../../../docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md)
- [_workspaces/README.md](../../../_workspaces/README.md)
- [guild_hall/README.md](../../../guild_hall/README.md)

## ASSUMPTIONS

- 설치 대상 PC 는 `git`, `npm`, `python3`, `uv` 를 실행할 수 있다고 본다.
- 실제 Gmail/Hiworks/Telegram 자격증명은 대상 PC 사용자가 직접 준비한다고 본다.

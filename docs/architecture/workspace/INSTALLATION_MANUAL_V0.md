# INSTALLATION_MANUAL_V0

## 목적

- 이 문서는 다른 PC 에서 Soulforge 를 처음 설치할 때 필요한 최소 절차를 한 곳에 모은다.
- clone, local env, skill install, NotebookLM MCP, gateway fetch/intake 까지의 첫 bootstrap 순서를 잠근다.

## 설치 원칙

1. GitHub 는 코드, 문서, example 만 옮긴다.
2. 실제 `guild_hall/state/**` 와 `_workspaces/<project_code>/**` runtime 은 각 PC 에서 새로 materialize 한다.
3. 인증 정보와 `.env` 는 다른 PC 에서 다시 만든다.
4. NotebookLM 로그인 상태와 Telegram/Gmail/Hiworks 자격증명은 Git 으로 옮기지 않는다.

## 1. 저장소 준비

```bash
git clone <repo-url>
cd Soulforge
npm install
```

UI 를 만질 예정이면:

```bash
npm run ui:workspace:install
```

## 2. Soulforge skill 설치

필요한 Codex skill 을 local 에 materialize 한다.

```bash
npm run skills:sync -- shield_wall record_stitch skill_check
```

필요하면 추가 skill 도 같은 방식으로 sync 한다.

## 3. guild_hall local env 생성

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

Gateway notify policy:

```bash
mkdir -p guild_hall/state/gateway/bindings
cp docs/architecture/workspace/examples/guild_hall/state/gateway/bindings/notify_policy.yaml guild_hall/state/gateway/bindings/notify_policy.yaml
```

그 다음 각 PC 의 실제 값만 채운다.

- Gmail token 또는 token file
- Hiworks POP3 host / username / password
- Telegram bot token / chat id

## 4. NotebookLM MCP 설치

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

## 5. gateway mailbox bootstrap

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
npm run notify:gateway -- --event monster_created --on
```

## 6. 설치 후 확인

아래 경로가 local 에 생기면 bootstrap 이 맞다.

- `guild_hall/state/gateway/mailbox/`
- `guild_hall/state/gateway/intake_inbox/`
- `guild_hall/state/gateway/log/mail_fetch/`
- `guild_hall/state/gateway/log/monster_events/`
- `guild_hall/state/town_crier/`
- `guild_hall/state/gateway/bindings/notify_policy.yaml`

## 7. 다른 PC 로 옮길 때 주의

- `guild_hall/state/**` 와 `_workspaces/**` 는 Git 으로 안 따라온다.
- 기존 PC 의 auth/session 을 새 PC 로 복사하지 않는다.
- 꼭 필요한 경우에도 `_workspaces/**` 실자료는 Git 이 아니라 별도 복사로 옮긴다.

## 연결 문서

- [MULTI_PC_DEVELOPMENT_V0.md](../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [GATEWAY_MAIL_FETCH_V0.md](../../../docs/architecture/workspace/GATEWAY_MAIL_FETCH_V0.md)
- [GATEWAY_NOTIFY_V0.md](../../../docs/architecture/workspace/GATEWAY_NOTIFY_V0.md)
- [NOTEBOOKLM_MCP_SETUP_V0.md](../../../docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md)
- [_workspaces/README.md](../../../_workspaces/README.md)
- [guild_hall/README.md](../../../guild_hall/README.md)

## ASSUMPTIONS

- 설치 대상 PC 는 `git`, `npm`, `python3`, `uv` 를 실행할 수 있다고 본다.
- 실제 Gmail/Hiworks/Telegram 자격증명은 대상 PC 사용자가 직접 준비한다고 본다.

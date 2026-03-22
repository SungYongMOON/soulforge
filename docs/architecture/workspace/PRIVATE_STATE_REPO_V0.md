# PRIVATE_STATE_REPO_V0

## 목적

- 이 문서는 public `Soulforge` 저장소와 별도로, 선택된 운영 기록만 담는 private state Git 저장소 기준을 잠근다.
- 다른 PC 에서 `clone -> local env 재생성 -> 선택 기록 복원` 순서로 빠르게 이어서 작업할 수 있게 한다.

## 한 줄 정의

- public `Soulforge` repo 는 코드/문서/example 을 들고, optional private state repo 는 선택된 `guild_hall/state/**` 와 `_workspaces/**` 파생 기록만 따로 mirror 한다.

## 적용 프로필

- `public-only` 프로필은 이 repo 를 clone 하지 않는다.
- `owner-with-state` 프로필만 이 repo 를 clone 하고 허용 subset 을 restore 한다.
- 팀원/공유 대상에게는 이 repo 접근을 열지 않는다.

## 기본 원칙

1. private state repo 는 `Soulforge/` 작업트리 안에 중첩하지 않는다.
2. private state repo 는 `../Soulforge-private-state` 같은 sibling 경로에 별도로 clone 한다.
3. private state repo 는 자격증명과 raw mailbox dump 가 아니라, 다른 PC 에서 이어서 볼 가치가 있는 파생 기록만 담는다.
4. private state repo 에도 토큰, `.env`, 세션, NotebookLM auth 같은 비밀값은 넣지 않는다.
5. project canon, shared runtime projection 의 정본 판단, 장기 정본 문서는 private state repo 에 두지 않는다.

## v0 포함 대상

- `guild_hall/state/gateway/intake_inbox/**`
- `guild_hall/state/gateway/log/monster_events/**`
- `guild_hall/state/gateway/mailbox/outbound/**`
- `guild_hall/state/gateway/log/mail_send/**`
- `_workspaces/<project_code>/.project_agent/monsters/**`
- `_workspaces/<project_code>/.project_agent/log/battle_log/**`
- `_workspaces/<project_code>/.project_agent/reports/morning_report/**`

## v0 제외 대상

- `guild_hall/state/gateway/mailbox/state/**`
- `guild_hall/state/gateway/mailbox/**/raw/**`
- `guild_hall/state/gateway/mailbox/**/events/**`
- `guild_hall/state/gateway/mailbox/**/attachments/**`
- `guild_hall/state/town_crier/telegram_notify.env`
- `guild_hall/state/town_crier/queue/**`
- `guild_hall/state/town_crier/state/**`
- `_workspaces/<project_code>/.project_agent/runs/**`
- `_workspaces/<project_code>/.project_agent/artifacts/**`
- 모든 `.env`, `*token*`, `*cookie*`, `*.session`, `*.key`

## 권장 private repo 트리

```text
Soulforge-private-state/
├── guild_hall/
│   └── state/
│       └── gateway/
│           ├── intake_inbox/
│           ├── mailbox/
│           │   └── outbound/
│           └── log/
│               ├── mail_send/
│               └── monster_events/
└── _workspaces/
    └── <project_code>/
        └── .project_agent/
            ├── monsters/
            ├── log/
            │   └── battle_log/
            └── reports/
                └── morning_report/
```

## 초기 Git 설정 예시

private state repo 는 별도로 만든다.

```bash
cd ..
git clone <private-state-repo-url> Soulforge-private-state
cd Soulforge-private-state
cp ../Soulforge/docs/architecture/workspace/examples/private_state_repo/gitignore.example .gitignore
git status
```

## 복원 예시

public repo 를 clone 한 뒤, 필요한 기록만 local state 로 복원한다.

```bash
cd /path/to/Soulforge
rsync -a ../Soulforge-private-state/guild_hall/state/gateway/intake_inbox/ guild_hall/state/gateway/intake_inbox/
rsync -a ../Soulforge-private-state/guild_hall/state/gateway/log/monster_events/ guild_hall/state/gateway/log/monster_events/
rsync -a ../Soulforge-private-state/guild_hall/state/gateway/mailbox/outbound/ guild_hall/state/gateway/mailbox/outbound/
rsync -a ../Soulforge-private-state/guild_hall/state/gateway/log/mail_send/ guild_hall/state/gateway/log/mail_send/
rsync -a ../Soulforge-private-state/_workspaces/ _workspaces/
```

## 운영 규칙

- private state repo 는 public repo 대체물이 아니다.
- canon 판단과 owner boundary 정본은 계속 public `Soulforge` 계약 문서와 tracked 구조가 owner 다.
- `guild_hall/state/**` 와 `_workspaces/**` 전체를 무조건 Git 으로 보내지 않는다.
- clone 대상 PC 에서는 자격증명과 local env 를 먼저 재생성하고, 그다음 선택 기록만 복원한다.
- outbound mail 기록은 `mailbox/outbound/**` snapshot 과 `log/mail_send/**` append-only log 를 같이 본다.
- monster 관련 기록은 `gateway` staging 과 project-side `monsters/`, `battle_log/`, `morning_report/` 가 같은 흐름으로 읽혀야 한다.

## 관련 경로

- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
- [`INSTALLATION_MANUAL_V0.md`](INSTALLATION_MANUAL_V0.md)
- [`../bootstrap/BOOTSTRAP_PROFILES_V0.md`](../bootstrap/BOOTSTRAP_PROFILES_V0.md)
- [`MAIL_SEND_V0.md`](MAIL_SEND_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](WORKSPACE_INTAKE_INBOX_V0.md)
- [`examples/private_state_repo/README.md`](examples/private_state_repo/README.md)

## ASSUMPTIONS

- private state repo 는 public GitHub repo 와 분리된 별도 private remote 를 쓴다고 본다.
- v0 범위에서는 `town_crier` queue 나 raw mailbox dump 보다, monsterized record 와 outbound mail record 의 연속 보존이 더 중요하다고 본다.

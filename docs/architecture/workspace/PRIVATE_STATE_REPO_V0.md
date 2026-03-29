# PRIVATE_STATE_REPO_V0

## 목적

- 이 문서는 Soulforge workspace 안의 nested `private-state/` Git 저장소에 선택된 운영 기록만 담는 기준을 잠근다.
- 다른 PC 에서 `clone -> local env 재생성 -> 선택 기록 복원` 순서로 빠르게 이어서 작업할 수 있게 한다.

## 한 줄 정의

- public `Soulforge` repo 는 기능 코드/문서/example 을 들고, nested `private-state/` repo 는 보호 대상 업무 데이터와 선택된 운영 기록만 따로 commit/push 한다.

## 저장소 역할

- public repo
  - owner: public `Soulforge/.git`
  - 대상: 기능 코드, 구조 문서, public-safe example
  - GitHub visibility: public
- private repo
  - owner: nested `Soulforge/private-state/.git`
  - 대상: 보호 대상 업무 데이터, 선택된 continuity record
  - GitHub visibility: private

한 프로젝트 workspace 안에서 두 Git repo 를 함께 운영하지만, push 대상과 내용은 항상 분리한다.

## 적용 프로필

- `public-only` 프로필은 이 repo 를 clone 하지 않는다.
- `operator` 프로필도 이 repo 를 clone 하지 않는다.
- `owner-with-state` 프로필만 이 repo 를 clone 하고 허용 subset 을 restore 한다.
- 팀원/공유 대상에게는 이 repo 접근을 열지 않는다.

## 기본 원칙

1. private state repo 는 Soulforge root 아래 `private-state/` 에 둔다.
2. active owner AI session 은 `Soulforge/` 와 `private-state/` 를 같은 workspace 안에서 함께 본다.
3. private state repo 는 자격증명이 아니라, 다른 PC 에서 이어서 봐야 하는 continuity subset 을 mirror copy 로 담는다.
4. private state repo 에도 토큰, `.env`, 세션, NotebookLM auth 같은 비밀값은 넣지 않는다.
5. project-local metadata 는 companion private repo `_workmeta/` 로 분리하고, 이 문서 범위에는 넣지 않는다.

## v0 포함 대상

- `guild_hall/state/gateway/intake_inbox/**`
- `guild_hall/state/gateway/log/monster_events/**`
- `guild_hall/state/gateway/mailbox/company/**`
- `guild_hall/state/gateway/mailbox/personal/**`
- `guild_hall/state/gateway/mailbox/outbound/**`
- `guild_hall/state/gateway/log/mail_fetch/**`
- `guild_hall/state/gateway/log/mail_send/**`
- `guild_hall/state/operations/soulforge_activity/**`

## v0 제외 대상

- `guild_hall/state/gateway/mailbox/state/**`
- `guild_hall/state/town_crier/telegram_notify.env`
- `guild_hall/state/town_crier/queue/**`
- `guild_hall/state/town_crier/state/**`
- 모든 `.env`, `*token*`, `*cookie*`, `*.session`, `*.key`

## 권장 private repo 트리

```text
private-state/
├── guild_hall/
│   └── state/
│       ├── gateway/
│       │   ├── intake_inbox/
│       │   ├── mailbox/
│       │   │   ├── company/
│       │   │   ├── personal/
│       │   │   └── outbound/
│       │   └── log/
│       │       ├── mail_fetch/
│       │       ├── mail_send/
│       │       └── monster_events/
│       └── operations/
│           └── soulforge_activity/
```

## 초기 Git 설정 예시

private state repo 는 Soulforge root 아래에 만든다.

```bash
cd /path/to/Soulforge
git clone <private-state-repo-url> private-state
cd private-state
cp ../docs/architecture/workspace/examples/private_state_repo/gitignore.example .gitignore
git status
```

Windows PowerShell:

```powershell
Set-Location <SoulforgeRoot>
git clone <private-state-repo-url> private-state
Set-Location private-state
Copy-Item "..\docs\architecture\workspace\examples\private_state_repo\gitignore.example" ".gitignore" -Force
git status
```

이미 `private-state/` 가 local Git repo 로 만들어져 있는데 `origin` remote 가 없으면, 다시 clone 하지 말고 아래처럼 remote 를 연결한다.

```bash
cd /path/to/Soulforge/private-state
git remote add origin <private-state-repo-url>
git fetch origin main
git switch -C main --track origin/main
```

## 복원 예시

public repo 를 clone 한 뒤, 필요한 기록만 nested `private-state/` 에서 local state 로 복원한다.

```bash
cd /path/to/Soulforge
rsync -a private-state/guild_hall/state/gateway/intake_inbox/ guild_hall/state/gateway/intake_inbox/
rsync -a private-state/guild_hall/state/gateway/log/monster_events/ guild_hall/state/gateway/log/monster_events/
rsync -a private-state/guild_hall/state/gateway/mailbox/company/ guild_hall/state/gateway/mailbox/company/
rsync -a private-state/guild_hall/state/gateway/mailbox/personal/ guild_hall/state/gateway/mailbox/personal/
rsync -a private-state/guild_hall/state/gateway/mailbox/outbound/ guild_hall/state/gateway/mailbox/outbound/
rsync -a private-state/guild_hall/state/gateway/log/mail_fetch/ guild_hall/state/gateway/log/mail_fetch/
rsync -a private-state/guild_hall/state/gateway/log/mail_send/ guild_hall/state/gateway/log/mail_send/
rsync -a private-state/guild_hall/state/operations/soulforge_activity/ guild_hall/state/operations/soulforge_activity/
```

Windows PowerShell baseline copy:

```powershell
Copy-Item "private-state/guild_hall/state/gateway/intake_inbox/*" "guild_hall/state/gateway/intake_inbox/" -Recurse -Force
Copy-Item "private-state/guild_hall/state/gateway/log/monster_events/*" "guild_hall/state/gateway/log/monster_events/" -Recurse -Force
Copy-Item "private-state/guild_hall/state/gateway/mailbox/company/*" "guild_hall/state/gateway/mailbox/company/" -Recurse -Force
Copy-Item "private-state/guild_hall/state/gateway/mailbox/personal/*" "guild_hall/state/gateway/mailbox/personal/" -Recurse -Force
Copy-Item "private-state/guild_hall/state/gateway/mailbox/outbound/*" "guild_hall/state/gateway/mailbox/outbound/" -Recurse -Force
Copy-Item "private-state/guild_hall/state/gateway/log/mail_fetch/*" "guild_hall/state/gateway/log/mail_fetch/" -Recurse -Force
Copy-Item "private-state/guild_hall/state/gateway/log/mail_send/*" "guild_hall/state/gateway/log/mail_send/" -Recurse -Force
Copy-Item "private-state/guild_hall/state/operations/soulforge_activity/*" "guild_hall/state/operations/soulforge_activity/" -Recurse -Force
```

## 현재 PC 에서 private-state 로 동기화 예시

현재 PC 의 active runtime 중 허용 subset 만 nested `private-state/` 로 복사한 뒤, private GitHub 에 commit/push 한다.

```bash
cd /path/to/Soulforge
rsync -a guild_hall/state/gateway/intake_inbox/ private-state/guild_hall/state/gateway/intake_inbox/
rsync -a guild_hall/state/gateway/log/monster_events/ private-state/guild_hall/state/gateway/log/monster_events/
rsync -a guild_hall/state/gateway/mailbox/company/ private-state/guild_hall/state/gateway/mailbox/company/
rsync -a guild_hall/state/gateway/mailbox/personal/ private-state/guild_hall/state/gateway/mailbox/personal/
rsync -a guild_hall/state/gateway/mailbox/outbound/ private-state/guild_hall/state/gateway/mailbox/outbound/
rsync -a guild_hall/state/gateway/log/mail_fetch/ private-state/guild_hall/state/gateway/log/mail_fetch/
rsync -a guild_hall/state/gateway/log/mail_send/ private-state/guild_hall/state/gateway/log/mail_send/
rsync -a guild_hall/state/operations/soulforge_activity/ private-state/guild_hall/state/operations/soulforge_activity/

cd private-state
git add .
git commit -m "chore: continuity data sync"
git push origin main
```

Windows PowerShell baseline copy:

```powershell
Copy-Item "guild_hall/state/gateway/intake_inbox/*" "private-state/guild_hall/state/gateway/intake_inbox/" -Recurse -Force
Copy-Item "guild_hall/state/gateway/log/monster_events/*" "private-state/guild_hall/state/gateway/log/monster_events/" -Recurse -Force
Copy-Item "guild_hall/state/gateway/mailbox/company/*" "private-state/guild_hall/state/gateway/mailbox/company/" -Recurse -Force
Copy-Item "guild_hall/state/gateway/mailbox/personal/*" "private-state/guild_hall/state/gateway/mailbox/personal/" -Recurse -Force
Copy-Item "guild_hall/state/gateway/mailbox/outbound/*" "private-state/guild_hall/state/gateway/mailbox/outbound/" -Recurse -Force
Copy-Item "guild_hall/state/gateway/log/mail_fetch/*" "private-state/guild_hall/state/gateway/log/mail_fetch/" -Recurse -Force
Copy-Item "guild_hall/state/gateway/log/mail_send/*" "private-state/guild_hall/state/gateway/log/mail_send/" -Recurse -Force
Copy-Item "guild_hall/state/operations/soulforge_activity/*" "private-state/guild_hall/state/operations/soulforge_activity/" -Recurse -Force
```

주의:

- 위 예시는 allowlist 된 경로만 private repo 에 담는다는 전제를 둔다.
- active runtime 경로는 그대로 두고, 같은 구조를 `private-state/` 아래에 mirror copy 한다.
- `.env`, token, password, cookie, session, `mailbox/state/**` 는 포함하지 않는다.
- 다른 PC 에서 이어서 작업하려면, 먼저 이 동기화를 현재 PC 에서 끝낸 뒤 대상 PC 에서 `git pull` 과 restore 를 수행한다.
- Soulforge 전체 recent-context 는 `operations/soulforge_activity/latest_context.json` 을 먼저 읽고, 더 필요할 때만 `events/*.jsonl` 마지막 몇 건을 추가로 읽는다.

## 운영 규칙

- private state repo 는 public repo 대체물이 아니지만, 보호 대상 업무 데이터의 유일한 Git 저장 plane 이다.
- canon 판단과 owner boundary 정본은 계속 public `Soulforge` 계약 문서와 tracked 구조가 owner 다.
- `guild_hall/state/**` 전체를 무조건 Git 으로 보내지 않고, allowlist 된 continuity subset 만 `private-state/` 로 mirror 한다.
- project-local metadata `_workmeta/**` 는 이 repo 가 아니라 별도 owner-only private repo 로 다룬다.
- 기능 코드/문서/public-safe sample 변경은 public repo 에 commit/push 하고, 업무 데이터 변경은 `private-state/` 에 commit/push 한다.
- owner 는 다른 PC 에서도 `owner-with-state` 조건이 맞으면 nested `private-state/` 에 commit/push 할 수 있다.
- 팀원/public-only/operator 프로필은 `private-state/` clone, pull, push 를 수행하지 않는다.
- clone 대상 PC 에서는 자격증명과 local env 를 먼저 재생성하고, 그다음 선택 기록만 복원한다.
- outbound mail 기록은 `mailbox/outbound/**` snapshot 과 `log/mail_send/**` append-only log 를 같이 본다.
- mailbox continuity 기록은 `mailbox/company/**`, `mailbox/personal/**`, `log/mail_fetch/**`, `intake_inbox/**` 가 같은 흐름으로 복원돼야 한다.
- Soulforge 전체 활동 recent-context 는 `operations/soulforge_activity/**` 를 통해 다른 PC 에 복원된다.

## 다른 PC 에서 private-state push 하는 조건

다른 owner PC 에서도 아래 조건이 맞으면 nested `private-state/` 에 push 할 수 있다.

1. `gh auth login` 으로 owner 접근 권한이 있는 GitHub 계정 인증이 완료돼 있다.
2. `private-state/` 가 실제 private GitHub repo 와 `origin` 으로 연결돼 있다.
3. active workspace 에서 allowlist 된 continuity data 만 `private-state/` 로 동기화한다.
4. `.env`, token, password, cookie, session, `mailbox/state/**` 비밀값은 여전히 push 하지 않는다.

즉, 어떤 PC 에서 작업했는지가 아니라 `owner-with-state` 조건과 allowlist 경계를 지키는지가 기준이다.

## 관련 경로

- [`MULTI_PC_DEVELOPMENT_V0.md`](MULTI_PC_DEVELOPMENT_V0.md)
- [`INSTALLATION_MANUAL_V0.md`](INSTALLATION_MANUAL_V0.md)
- [`../bootstrap/BOOTSTRAP_PROFILES_V0.md`](../bootstrap/BOOTSTRAP_PROFILES_V0.md)
- [`MAIL_SEND_V0.md`](MAIL_SEND_V0.md)
- [`WORKSPACE_INTAKE_INBOX_V0.md`](WORKSPACE_INTAKE_INBOX_V0.md)
- [`examples/private_state_repo/README.md`](examples/private_state_repo/README.md)
- [`../guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md`](../guild_hall/SOULFORGE_ACTIVITY_LOG_V0.md)

## ASSUMPTIONS

- private state repo 는 public GitHub repo 와 분리된 별도 private remote 를 쓴다고 본다.
- v0 범위에서는 active runtime 전체가 아니라, owner 가 다른 PC 에서 이어서 봐야 하는 mailbox continuity subset 과 outbound/monster 기록을 우선 mirror 한다고 본다.

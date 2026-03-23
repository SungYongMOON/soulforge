# OWNER_HANDOFF_CHECKLIST_V0

## 목적

- 이 문서는 owner 가 회사 PC 와 집 PC 사이를 오가며 Soulforge 를 이어서 작업할 때의 최소 handoff 체크를 잠근다.
- public 기능 변경, owner-only project metadata 변경, private continuity data 변경을 같은 프로젝트 안에서 안전하게 이어받도록 한다.

## 한 줄 정의

- owner handoff 는 `public push + _workmeta push + private-state push` 로 마감하고, 다음 PC 에서는 `doctor --remote -> pull -> restore -> doctor` 순서로 시작한다.

## 기본 원칙

1. 기능 코드와 구조 문서는 public repo 에만 push 한다.
2. project-local metadata 는 nested `_workmeta/` repo 에, continuity record 는 nested `private-state/` repo 에 push 한다.
3. private continuity data 는 사실상 한 시점에 한 PC 가 owner 처럼 쓰는 baton 방식으로 넘긴다.
4. 다른 PC 에서 작업을 시작하기 전에는 먼저 `npm run guild-hall:doctor -- --profile owner-with-state --remote` 를 실행한다.
5. `.env`, token, password, cookie, session, credential JSON 은 handoff 대상이 아니다.

## Chapter 1. 작업을 마치고 넘길 때

현재 PC 에서 아래를 확인한다.

- public repo 변경이 있으면 commit/push
- project metadata 변경이 있으면 `_workmeta/` commit/push
- continuity data 변경이 있으면 `private-state/` 로 sync 후 commit/push
- public/`_workmeta`/`private-state` 셋 다 `git status -sb` 가 clean 인지 확인

최소 순서:

```bash
cd Soulforge
git status -sb
git -C _workmeta status -sb
git -C private-state status -sb
```

public 변경이 있으면:

```bash
git add <public changed files>
git commit -m "<message>"
git push origin main
```

project metadata 변경이 있으면:

```bash
cd _workmeta
git add <workmeta changed files>
git commit -m "<message>"
git push origin main
cd ..
```

private continuity data 가 있으면:

```bash
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
cd ..
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

## Chapter 2. 다른 PC 에서 작업 시작 전

먼저 원격 상태부터 확인한다.

```bash
cd Soulforge
npm run guild-hall:doctor -- --profile owner-with-state --remote
```

Windows PowerShell 에서 `npm.ps1` 이 막히면:

```powershell
npm.cmd run guild-hall:doctor -- --profile owner-with-state --remote
```

그다음 behind 인 repo 만 pull 한다.

```bash
git pull --rebase origin main
cd _workmeta
git pull --rebase origin main
cd ..
cd private-state
git pull --rebase origin main
cd ..
```

sync 가능한 Soulforge Codex skill 전체를 다시 맞춘다.

```bash
npm run skills:sync -- --all
```

Windows PowerShell:

```powershell
npm.cmd run skills:sync -- --all
```

private continuity data 를 active runtime 으로 복원한다.

```bash
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

`mailbox/state/**` 아래 local env/token 파일은 handoff 대상이 아니다.

restore 직후에는 `guild_hall/state/operations/soulforge_activity/latest_context.json` 을 먼저 읽고, 더 필요할 때만 현재 월 `events/*.jsonl` 마지막 몇 건을 추가로 본다.

마지막으로 safe readiness 를 다시 확인한다.

```bash
npm run guild-hall:doctor -- --profile owner-with-state
```

Windows PowerShell:

```powershell
npm.cmd run guild-hall:doctor -- --profile owner-with-state
```

필요할 때만:

```bash
npm run guild-hall:doctor -- --profile owner-with-state --live
```

## Chapter 3. 충돌 회피 규칙

- 같은 날 두 PC 에서 동시에 public repo 를 오래 수정하지 않는다.
- private continuity data 는 동시에 두 PC 에서 쓰지 않는다.
- 작업을 이어받기 전에는 항상 먼저 pull 하고, 작업을 넘기기 전에는 항상 push 한다.
- `doctor --remote` 에서 `ahead>0` 또는 `behind>0` 가 보이면, 그 상태를 정리한 뒤에만 다음 작업으로 넘어간다.

## Chapter 4. 빠른 체크리스트

### 4.1 퇴근/이동 직전

- public 변경을 push 했다
- `_workmeta` 변경을 push 했다
- private continuity data 를 sync/push 했다
- public `git status -sb` 가 clean 이다
- `_workmeta git status -sb` 가 clean 이다
- `private-state git status -sb` 가 clean 이다

### 4.2 집/회사에서 작업 시작 직전

- `npm run guild-hall:doctor -- --profile owner-with-state --remote` 를 돌렸다
- public/`_workmeta`/`private-state` 를 pull 했다
- `skills:sync` 를 다시 돌렸다
- `private-state -> active runtime` restore 를 했다
- `npm run guild-hall:doctor -- --profile owner-with-state` 를 돌렸다

## 관련 문서

- [`UPDATE_MANUAL_V0.md`](UPDATE_MANUAL_V0.md)
- [`BOOTSTRAP_DOCTOR_V0.md`](BOOTSTRAP_DOCTOR_V0.md)
- [`../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
- [`../workspace/MULTI_PC_DEVELOPMENT_V0.md`](../workspace/MULTI_PC_DEVELOPMENT_V0.md)

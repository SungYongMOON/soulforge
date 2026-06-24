# Always-On Next Action Prompt v0

## 목적

이 문서는 복사/붙여넣기가 어려운 24시간 PC 에서 Codex 가 다음 운영 작업을 파일로 읽고 수행하게 하는 prompt source 다.

## 짧은 사용자 지시

24시간 PC 의 Codex 에 아래 한 줄만 직접 입력한다.

```text
ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md 읽고 실행해.
```

Codex 가 파일을 못 찾으면 아래처럼 입력한다.

```text
docs/architecture/bootstrap/ALWAYS_ON_NEXT_ACTION_PROMPT_V0.md 읽고 실행해.
```

## Codex 실행 프롬프트

너는 Soulforge `always_on_node` 의 post-review gateway 운영 점검 담당자다.

### 목표

1. public `Soulforge/main` 을 최신 GitHub 상태로 맞춘다.
2. owner-designated public dev lane 에서 review/merge 된 gateway healthcheck/healer 보강이 지정 24시간 PC 에 반영됐는지 확인한다.
3. healer / gateway healthcheck / 제한 fetch smoke 를 안전하게 실행한다.
4. 결과를 local activity log 에 남긴다.
5. activity log 를 `private-state` 로 mirror/push 해서 다른 owner PC 가 다시 볼 수 있게 한다.

### 중요 규칙

- 먼저 `AGENTS.md` 를 읽고 따른다.
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽고 따른다.
- `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md` 의 `always_on_node` 경계를 따른다.
- public tracked docs/code 는 수정하지 않는다.
- public repo commit/push 는 하지 않는다.
- secret, token, password, cookie, session, credential 파일 내용은 읽지 않는다.
- raw mail body, HTML body, attachment 내용은 읽지 않는다.
- live fetch 출력에 raw body 로 보이는 내용이 나오면 즉시 중단하고, 원문을 복사하지 말고 `raw_output_exposure_detected: true` 만 보고한다.
- `guild_hall/state/**` 와 `private-state/**` 는 owner-only 운영 기록으로만 다룬다.

### 1. public repo 최신화

현재 위치가 Soulforge root 인지 확인한다.

```bash
git status --short --branch
```

worktree 가 clean 이면 아래를 실행한다.

```bash
git switch main
git pull --ff-only origin main
git log --oneline --max-count=3
```

dirty worktree, detached HEAD, conflict, non-main branch 에서 switch/pull 이 막히면 더 진행하지 말고 상태를 보고한다.

### 2. 의존성 및 node identity 확인

```bash
npm install
```

`guild_hall/state/local/node_identity.yaml` 을 읽고 아래 필드만 요약한다.

- `node_id`
- `node_role`
- `bootstrap_profile`
- `allowed_jobs`
- `primary_writer`

`node_role` 이 `always_on_node` 가 아니면 gateway 작업을 중단하고 보고한다.

### 3. 안전 점검

아래를 실행한다.

```bash
npm run validate:activity
npm run guild-hall:doctor -- --profile owner-with-state --remote
```

doctor 가 실패하면 fetch smoke 는 실행하지 말고 실패 범위를 보고한다.

### 4. healer / gateway 점검

아래를 실행한다.

```bash
npm run guild-hall:healer:run -- --skip-validate --json
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

healthcheck 가 `WARN` 또는 `CRITICAL` 이면 fetch smoke 실행 여부를 보수적으로 판단한다.
mailbox env 가 준비되어 있고 fetch 실행이 안전하다고 판단될 때만 아래를 실행한다.

```bash
npm run guild-hall:gateway:fetch -- --once --limit 1
```

`gateway:fetch` 에는 `--json` 을 붙이지 않는다.

### 5. activity log 기록

결과에 맞춰 하나를 실행한다.

성공 또는 안전한 smoke 완료:

```bash
npm run guild-hall:activity:log -- --scope gateway --action post_review_gateway_smoke --result completed --summary "always_on_node pulled reviewed main and completed gateway post-review smoke." --carry-forward true --next-action "Owner-designated public dev lane should pull private-state and review the post-review gateway activity result."
```

차단 또는 실패:

```bash
npm run guild-hall:activity:log -- --scope gateway --action post_review_gateway_smoke --result blocked --summary "always_on_node pulled reviewed main but gateway post-review smoke was blocked." --carry-forward true --next-action "Owner-designated public dev lane should pull private-state and inspect latest_context for the blocker."
```

### 6. private-state mirror/push

`private-state` repo 가 Soulforge root 아래 있는지 확인한다.

```bash
git -C private-state status --short --branch
```

`private-state` 가 clean 이면 최신화한다.

```bash
git -C private-state pull --ff-only origin main
```

activity surface 를 mirror 한다.

macOS/Linux shell:

```bash
rsync -a guild_hall/state/operations/soulforge_activity/ private-state/guild_hall/state/operations/soulforge_activity/
```

Windows PowerShell:

```powershell
Copy-Item "guild_hall/state/operations/soulforge_activity/*" "private-state/guild_hall/state/operations/soulforge_activity/" -Recurse -Force
```

변경이 있으면 private-state 에 commit/push 한다.

```bash
git -C private-state status --short
git -C private-state add guild_hall/state/operations/soulforge_activity
git -C private-state commit -m "chore: post review gateway activity sync"
git -C private-state push origin main
```

변경이 없으면 commit 하지 않는다.

### 7. 최종 보고

아래 형식으로 짧게 보고한다.

```yaml
node_id:
node_role:
public_repo_latest:
latest_public_commit:
doctor_result:
healer_result:
healthcheck_result:
fetch_smoke_result:
activity_logged:
private_state_pushed:
secret_read: false
raw_mail_body_read: false
attachment_read: false
next_action:
```

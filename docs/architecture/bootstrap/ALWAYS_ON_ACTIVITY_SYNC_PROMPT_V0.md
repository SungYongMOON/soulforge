# Always-On Activity Sync Prompt v0

## 목적

이 문서는 복사/붙여넣기가 어려운 24시간 PC 에서 Codex 가 PC별 activity ledger 를 취합하게 하는 prompt source 다.

## 짧은 사용자 지시

24시간 PC 의 Codex 에 아래 한 줄만 직접 입력한다.

```text
ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md 읽고 실행해.
```

Codex 가 파일을 못 찾으면 아래처럼 입력한다.

```text
docs/architecture/bootstrap/ALWAYS_ON_ACTIVITY_SYNC_PROMPT_V0.md 읽고 실행해.
```

더 짧게 줄여야 하면 아래처럼 입력한다.

```text
activity sync
```

## Codex 실행 프롬프트

너는 Soulforge `always_on_node` 의 activity sync 담당자다.

### 목표

1. public `Soulforge/main` 을 최신 GitHub 상태로 맞춘다.
2. `private-state` 의 activity mirror 를 pull 한다.
3. local/private activity event ledger 와 `latest_context.json` 을 병합/재생성한다.
4. 양쪽 `latest_context.json` 을 갱신한다.
5. 변경이 있으면 `private-state` 에 commit/push 한다.
6. local `mail_candidate` queue 에 pending 후보가 있으면 body-safe activity summary 로 투영한다.

`private-state` 는 Soulforge root 바로 아래 nested repo 여야 하며, branch 가 `main` 일 때만 실행한다. 기존 JSONL 에 malformed row 가 있으면 원본 위치에 보존하고 다른 surface 로 복제하지 않는다. `log/**` markdown/report file 은 v0 sync 대상이 아니다.

### 중요 규칙

- 먼저 `AGENTS.md` 를 읽고 따른다.
- public tracked docs/code 는 수정하지 않는다.
- public repo commit/push 는 하지 않는다.
- secret, token, password, cookie, session, credential 파일 내용은 읽지 않는다.
- raw mail body, HTML body, attachment 내용은 읽지 않는다.
- `_workspaces/**`, `_workmeta/**`, mailbox raw, attachment payload 는 읽지 않는다.
- activity event 는 allowlist 된 metadata 필드만 mirror 하고, legacy unknown field 는 복사하지 않는다.
- mail candidate 는 candidate JSON 자체가 아니라 subject, sender, attachment count, received_at, candidate ref 수준의 activity summary 로만 mirror 한다.
- sync 대상은 `events/**/*.jsonl` 의 allowlisted event field 와 재생성된 `latest_context.json` 이다. `log/**` 는 복사하지 않는다.
- `--json` 출력의 private git command 단계는 stdout/stderr 원문을 표시하지 않는다.

### 실행

현재 위치가 Soulforge root 인지 확인한다.

```bash
git status --short --branch
```

public repo 가 clean 이면 최신화한다.

```bash
git switch main
git pull --ff-only origin main
```

activity sync 를 실행한다.

```bash
npm run guild-hall:activity:sync -- --json
```

### 최종 보고

아래 형식으로 짧게 보고한다.

```yaml
activity_sync:
merged_event_count:
added_to_local:
added_to_private:
private_state_changed:
private_state_committed:
private_state_pushed:
mail_candidate_projected:
secret_read: false
raw_mail_body_read: false
attachment_read: false
next_action:
```

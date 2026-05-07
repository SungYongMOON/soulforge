# Always-On Email Monster Smoke Prompt v0

## 목적

이 문서는 24시간 켜 두는 Soulforge PC 의 Codex 에게 전달할 `email -> monster` smoke test prompt 다.
원격 제어 중 복사/붙여넣기가 어려울 때, repo 를 pull 한 뒤 짧은 파일 경로 지시만 입력해 테스트를 수행하게 한다.

## 짧은 사용자 지시

24시간 PC 에서 Soulforge repo 를 최신화한 뒤, Codex 에 아래 한 줄만 입력한다.

```text
docs/architecture/bootstrap/ALWAYS_ON_EMAIL_MONSTER_SMOKE_PROMPT_V0.md 를 읽고 24시간 PC email -> monster smoke test 를 수행해줘.
```

## Codex 실행 프롬프트

너는 Soulforge `always_on_node` 의 email-to-monster smoke test 담당자다.

### 목표

- 이 PC 가 `always_on_node` 로 인식되는지 확인한다.
- 메일 fetch edge 가 실행 가능한지 확인한다.
- `gateway:intake` 로 monster 1개가 local runtime 에 materialize 되는지 확인한다.
- 아직 automation ACTIVE 전환이나 public repo 수정을 하지 않는다.

### 중요 규칙

- 먼저 `AGENTS.md` 를 읽고 따른다.
- `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` 를 읽고 따른다.
- `docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md` 의 `always_on_node` 경계를 따른다.
- `docs/architecture/workspace/GATEWAY_MAIL_FETCH_V0.md`, `MAIL_INTAKE_REQUEST_V0.md`, `WORKSPACE_INTAKE_INBOX_V0.md` 를 필요한 만큼만 확인한다.
- public tracked docs/code 는 수정하지 않는다.
- commit/push 하지 않는다.
- secret, token, credential, raw mail body, attachment 내용은 읽지 않는다.
- `.env`, token, cookie, session, credential 파일은 내용이 아니라 존재 여부만 확인한다.
- Telegram send 는 실행하지 않는다.
- night_watch automation 을 ACTIVE 로 전환하지 않는다.
- 문제가 생기면 멈추고 현재 상태와 다음 안전한 조치만 보고한다.

### 1. repo 와 node identity 확인

1. 현재 위치가 Soulforge root 인지 확인한다.
   - `AGENTS.md`
   - `README.md`
2. `git status --short --branch` 로 branch 와 dirty 상태를 확인한다.
3. clean worktree 이고 `main` branch 이면 가능할 때만 아래를 실행한다.

```bash
git pull --ff-only origin main
```

4. dirty worktree, detached HEAD, non-main branch, conflict, pull failure 가 있으면 최신화를 멈추고 보고한다.
5. `guild_hall/state/local/node_identity.yaml` 을 읽고 아래만 요약한다.
   - `node_id`
   - `node_role`
   - `bootstrap_profile`
   - `allowed_jobs`
   - `blocked_jobs`
   - `primary_writer`
6. `node_role` 이 `always_on_node` 가 아니면 smoke test 를 중단하고 보고한다.

### 2. readiness 확인

아래 명령을 실행한다.

```bash
npm run guild-hall:doctor -- --profile owner-with-state --remote
```

doctor 가 실패하면 후속 fetch/intake 를 실행하지 말고 실패 범위만 보고한다.

### 3. mail fetch smoke

아래 명령을 실행한다.

```bash
npm run guild-hall:gateway:fetch -- --once --limit 1
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

출력 보고에는 provider raw body, attachment, credential 을 포함하지 않는다.
메일 원문을 읽지 말고, summary/count/status 중심으로만 본다.
smoke prompt 에서는 live fetch 결과를 터미널 JSON 으로 펼치지 않는다.
터미널에 raw HTML/body 로 보이는 내용이 출력되면 즉시 중단하고, 노출된 본문을 복사하지 말고 `raw_output_exposure_detected: true` 만 보고한다.

### 4. local-only intake payload 생성

아래 경로에 local-only payload 파일을 만든다.

```text
guild_hall/state/gateway/tmp/mail_intake_smoke_<node_id>_<YYYYMMDDHHMMSS>.json
```

payload 는 실제 메일 원문이 아니라 smoke test 용 metadata 만 담는다.
`received_at` 은 현재 시각 ISO 문자열을 사용한다.
`event_id`, `provider_message_id`, `dedupe_key` 는 같은 timestamp 를 넣어 고유하게 만든다.

예시 shape:

```json
{
  "action": "mail_intake_request",
  "event_id": "always_on_email_monster_smoke_<YYYYMMDDHHMMSS>",
  "source": "smoke",
  "mailbox_id": "company_mailbox",
  "provider_message_id": "smoke-provider-message-<YYYYMMDDHHMMSS>",
  "received_at": "<ISO timestamp>",
  "event_ref": "smoke://mail/events/always_on_email_monster_smoke_<YYYYMMDDHHMMSS>",
  "raw_ref": "smoke://mail/raw/always_on_email_monster_smoke_<YYYYMMDDHHMMSS>",
  "attachment_refs": [],
  "subject": "Always-on email to monster smoke",
  "from": [],
  "to": [],
  "cc": [],
  "body_excerpt": "Verify that always-on node can materialize one smoke mail into one monster.",
  "monsters": [
    {
      "monster_family": "unknown_monster",
      "monster_name": null,
      "work_pattern": "gateway_smoke",
      "dedupe_key": "always-on-email-monster-smoke-<YYYYMMDDHHMMSS>",
      "objective": "Verify always-on email to monster intake smoke.",
      "objective_ko": "24시간 PC 의 email to monster intake smoke 를 확인합니다.",
      "due_state": "no_due",
      "known_status": "unknown",
      "mail_role": "new_request",
      "project_hints": [],
      "stage_hints": [],
      "assignment_status": "pending_dungeon_assignment",
      "source_quote": null
    }
  ]
}
```

### 5. intake 실행

아래 명령을 실행한다.

```bash
npm run guild-hall:gateway:intake -- --payload-file <payload-file>
```

### 6. 결과 확인

intake 출력과 local state 에서 아래만 확인한다.

- `workspace_intake_inbox_ref`
- `monster_ids`
- `resolution_status`
- `guild_hall/state/gateway/intake_inbox/<inbox_id>/inbox.json` 존재 여부
- `guild_hall/state/gateway/intake_inbox/<inbox_id>/monsters.json` 존재 여부
- `guild_hall/state/gateway/log/monster_events/**` 에 이번 smoke event 가 append 되었는지

### 7. 최종 보고

아래 형식으로 짧게 보고한다.

```yaml
node_id:
node_role:
doctor_ready:
fetch_result:
healthcheck_status:
payload_file:
intake_result:
workspace_intake_inbox_ref:
monster_ids:
monster_events_appended:
public_repo_edited: false
secret_read: false
raw_mail_body_read: false
attachment_read: false
next_action:
```

`next_action` 에는 실제 fetched mail event 를 자동 `mail_intake_request` payload 로 바꾸는 adapter 가 필요한지 여부를 적는다.

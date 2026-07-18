# gateway_mail_fetch

이 폴더는 Soulforge `gateway` ingress 아래에서 메일을 수집하는 tracked source capsule 이다.
다른 PC 에서 Soulforge 만 clone 해도 같은 수집 코드를 materialize 할 수 있게 최소 범위만 유지한다.

운영 runbook, 정책, connector/attachment spec 같은 관리 문서는 `docs/architecture/guild_hall/gateway/mail_fetch/` 아래 정본을 본다.

## 포함 범위

- `collector/`: 실제 수집/정규화/저장 본체
- `tests/`: collector 회귀 테스트
- `cli.py`: Soulforge gateway 기본 경로를 쓰는 실행 진입점
- `team_cli.py`: metadata-only team mailbox register 를 순회하는 실행 진입점
- `healthcheck.py`: runtime summary 기반 이상 감지 + Telegram alert 진입점
- `state_backup.py`, `state_restore.py`, `retention_cleanup.py`: state/retention 운영 launcher
- `email_fetch.env.example`: 다른 PC bootstrap 용 local env 예시

관련 운영 문서:
- spec/contract: `docs/architecture/guild_hall/gateway/mail_fetch/spec/**`
- runbooks: `docs/architecture/guild_hall/gateway/mail_fetch/runbooks/**`
- policies: `docs/architecture/guild_hall/gateway/mail_fetch/policies/**`

## Soulforge 기본 경로

- mailbox root: `guild_hall/state/gateway/mailbox/`
- runtime root: `guild_hall/state/gateway/log/mail_fetch/`
- mail candidate queue root: `guild_hall/state/gateway/mail_candidate/`
- pre-project mail history root: `_workmeta/P00-000_INBOX/reports/메일_이력/`
- pre-project mail history Excel export root: `_workspaces/P00-000_INBOX/reports/메일_이력/`
- default env file: `guild_hall/state/gateway/mailbox/state/email_fetch.env`
- default team mailbox register: `guild_hall/state/gateway/mailbox/state/team_mailboxes.json`

## 기본 실행

```bash
python3 guild_hall/gateway/mail_fetch/cli.py --once --json
npm run dev-erp:export-team-mailboxes -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --apply
python3 guild_hall/gateway/mail_fetch/team_cli.py --once --json
npm run guild-hall:gateway:fetch:team -- --once --json
python3 guild_hall/gateway/mail_fetch/healthcheck.py --json
```

기존 계정 연결은 유지하면서 중앙 data root 에 원천만 먼저 쌓으려면
`team_cli.py --data-root <absolute-data-root> --ingress-only --once --json` 을 쓴다.
`--data-root` 는 `config/`, `ingress/mailbox/`, `runtime/mail_fetch/`,
`state/mail_candidate/` 경로만 파생하며 계정 secret 을 생성하거나 변경하지 않는다.
`--ingress-only` 는 raw/event와 cursor/dedupe/run log만 기록하고 project history,
mail candidate, notification, PLAUD trigger 투영은 명시적으로 건너뛴다.
네이티브 첨부 저장과 링크 첨부 다운로드도 이 모드에서는 비활성화한다.

When `EMAIL_FETCH_PLAUD_TRIGGER_ENABLED=true`, a fresh Hiworks PLAUD
transcript-ready notice writes a sanitized trigger under the shared
`_workspaces/system/voice_capture/plaud_mail_triggers/pending/` queue. The
trigger contains hashes and timestamps only; mail subject, address, body,
attachment name, link, and credentials are excluded. The active voice writer
watches that queue and uses the official PLAUD CLI to fetch source artifacts.
The current Mac mini collector is the temporary failover; the HPP always-on
identity becomes the normal collector only after an accepted cutover receipt.

## Team mailbox register

`team_cli.py` reads a private metadata-only JSON register:

```json
{
  "schema_version": "email.fetch.team_mailbox_register.v1",
  "mailboxes": [
    {
      "id": "ops",
      "account_id": "core-account-id",
      "email": "account@example.test",
      "display_name": "Ops",
      "provider": "gmail",
      "enabled": true,
      "env_file": "ops.env",
      "workspace": "team/ops"
    }
  ]
}
```

The register can be generated from dev-ERP account mailbox metadata:

```bash
npm run dev-erp:export-team-mailboxes -- --db ui-workspace/apps/dev-erp/data/dev-erp.db --apply
```

The register stores account/mailbox metadata and relative env-file references only.
Secret values stay in each referenced env file. Env refs must be repo-relative or
relative to the register file, and absolute/traversal refs are rejected.

For an always-on runtime whose release checkout can be replaced, set
`EMAIL_FETCH_PRIVATE_CONFIG_ROOT` to a stable private directory outside the
checkout. The default register and repo-relative mailbox env references are then
resolved beneath that directory. `EMAIL_FETCH_TEAM_REGISTER` can still select an
explicit register path. Keep `EMAIL_FETCH_INBOX_ROOT`, `EMAIL_FETCH_RUNTIME_DIR`,
and `EMAIL_FETCH_MAIL_CANDIDATE_QUEUE_ROOT` on the same approved data volume when
the collected payload and state must survive release replacement. These values
change storage locations only; they do not enable collection by themselves.

Team runs keep one project mail history ledger and write account identity into
the existing `메일함` column. Source bucket/workspace identity remains in
`source_event.workspace` and candidate metadata; no per-member ledger schema is
created.

Each enabled mailbox uses isolated runtime state under
`guild_hall/state/gateway/log/mail_fetch/mailboxes/<id>/`, including cursor,
dedupe, run log, debug log, and last summary. Candidate IDs include the mailbox
scope so two team members receiving the same provider message do not collide.

## 주의

- 실제 토큰, 비밀번호, Telegram 자격증명은 local env file 에만 둔다.
- `guild_hall/state/**` 실자료는 GitHub 에 올리지 않는다.
- 업무 후보 메일 수신 이력은 monster 생성 여부와 무관하게 `mail_candidate_queue` 단계에서 `P00-000_INBOX` private 이력으로 먼저 쌓는다.

## 관련 문서

- [gateway mail fetch docs index](../../../docs/architecture/guild_hall/gateway/mail_fetch/README.md)
- [GATEWAY_MAIL_FETCH_V0](../../../docs/architecture/workspace/GATEWAY_MAIL_FETCH_V0.md)

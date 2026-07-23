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

## H01C mail occurrence shadow (feature OFF)

`collector/pipeline/mail_occurrence_shadow.py`는 받은메일·보낸메일을 한 logical
mail occurrence와 여러 account/folder mailbox observation으로 분리하는
public-safe 합성 검증 모듈이다. RFC Message-ID 또는 namespaced provider-native
exact ref만 confirmed merge에 사용하며, exact ref가 없으면 observation별
unmatched occurrence로 유지한다. subject/time/size, ConversationID, thread relation,
POP3 received copy, `cc`는 cross-mailbox identity나 sent coverage의 근거가 아니다.

이 모듈은 account별 received/sent expected source와 여섯 coverage state를 별도
`email.fetch.mail_account_coverage_shadow.v1` wrapper에 두고, 그 안에는 공용
`soulforge.project_history_coverage_receipt.v1` exact-field receipt를 그대로
중첩한다. atomic batch/cursor replay, observation dedupe, opaque custody ref
경계도 함께 검증한다.
팀원 sent source가 정해지지 않은 경우 `not_collected`와
`team_sent_source_unbound` gap을 유지한다. live collector·runner·DB·project
history·official task writer에는 연결되지 않았고, accepted history나 production
authority를 만들지 않는다.

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
단, Hiworks POP3 `RETR`의 exact RFC822 bytes는 MIME 파싱 전에
`<data-root>/ingress/mailbox/<workspace>/mail/source_custody/hiworks/sha256/<prefix>/<sha256>.eml`
content-addressed custody에 기록한다. 이 source custody는 `--ingress-only`에서도
필수이며, 동일 bytes replay는 기존 파일을 검증만 하고 덮어쓰지 않는다.
normalized event의 `raw.source_custody`에는 SHA-256, exact byte size,
custody-root-relative `storage_ref`만 연결한다. 실제 메일이나 첨부 fixture는
tracked source/public Git에 두지 않으며, 추출하지 않은 첨부는 이 `.eml` MIME에서
복구한다.

## Offline custody link index

`collector/storage/custody_link_index.py`는 private normalized-event JSONL과
Hiworks source-custody EML을 읽어 immutable JSONL link receipt를 만드는 standalone
CLI다. `--event-root`는 반복할 수 있고, `--eml-root`와 `--output`은 각각 하나씩
필수다. EML root 아래에서는 정확히
`hiworks/sha256/<2-lowercase-hex-prefix>/<64-lowercase-hex-sha256>.eml` shape만
받으며 임의 중간 segment, hash/path 불일치, read 중 file identity 변화는 fail
closed한다.

receipt row는 `event_id`, hashed provider id, EML SHA-256/size, canonical
`storage_ref`, match method, verified flag만 담는다. stdout은 record count와 output
digest를 포함한 sanitized summary만 반환하고, 실패 stderr도 error code와 가능한
경우 event id만 반환한다. `--output`은 caller가 선택한 private mailbox
runtime/custody evidence owner에 두며 public/tracked tree, publication packet,
메일 원문 owner에는 두지 않는다. CLI 자체는 output locator를 추정하거나
자동 publish하지 않는다.

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

For HPP continuous-ingress runs, the Node bridge reads no credential bytes and
captures only a six-field metadata identity; no credential content digest is
placed in the manifest, launch config, output, or durable state. A Windows
bootstrap opens and retains each credential source with read-only sharing while
`team_cli.py` opens its own read handle and checks that externally captured
identity. The child builds every enabled mailbox config and loads all direct
values from the retained primary env sources before the first mailbox run. HPP
capsule mode also supports `GMAIL_ACCESS_TOKEN_FILE` and
`HIWORKS_POP3_PASSWORD_FILE` under this narrower contract:

- the file value is a relative path resolved from its env file (`./name` is
  normalized to `name`);
- the env file and resolved credential are normal, single-link, non-reparse files whose
  lexical and physical paths stay inside the exact `private_config_root`;
- absolute, tilde, traversal, external-root, symlink, junction, and
  reparse paths fail closed;
- a discovery-only isolated child returns metadata identity only, the Windows
  bootstrap retains a read lock through the actual child, and the actual child
  preloads the credential only when that identity still matches.

Nested credential bytes are never added to the identity manifest, launch
configuration, child summary, or durable output. Arbitrary external paths are
not supported; place an existing nested credential beneath the approved private
config root or the capsule will fail closed. Standalone collector mode retains
its prior file-indirection behavior. The capsule ignores ambient overrides and
never persists refreshed token data to a credential path. Any identity drift
fails closed. The binding also
pins the complete collector-tree release digest; the runtime, collector code,
register, manifest, and credentials remain pre-opened and locked through the
operation-local capsule launch. Unsupported platforms fail closed.

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

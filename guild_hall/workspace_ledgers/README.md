# workspace_ledgers

Per-project mail routing rules and management ledgers on the D: target plane's SE
folder tree, productising the 2026-09-21 Owner decisions that were first exercised by
two scratch scripts (`gen_mail_rules_20260921.mjs`, `gen_mgmt_ledgers_20260921.mjs`,
kept as the behavioural reference outside this repo). See
`docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`'s "관리 폴더 quick map" and
"과제별 규칙 파일" sections for the owner contract this module implements.

## What each file is

Per project, under `_workspaces/<project_code>_<짧은한글명>/020_MGMT/`:

- `021_자동화설정_운영규칙/mail_routing_rule.json` + `.md` -- the mail routing rule.
  The `.json` is the machine twin (`soulforge.project_mail_routing_rule.v0`); the
  `.md` is the human-readable twin with the same content plus a decisions/open-items
  log. `history/mail_routing_rule.<old_version>.<json|md>` holds every prior version.
- `023_연락처_이해관계자/연락처_장부.csv` -- one row per merged person, with an
  Owner-editable `과제내역할(Owner기입)` column.
- `027_수신이력_이동이력/메일_수신이력.csv`, `메일_발송이력.csv` -- one row per
  attributed mail (received / sent), with Owner-editable `단계`/`작업상태` columns.
- `027_수신이력_이동이력/회신_현황.csv` -- one row per external thread needing 답필요
  (we owe a reply) or 회신대기 (waiting on their reply), with Owner-editable
  `처리상태(Owner기입)`/`메모` columns.

Byte lineage for every one of those files (sha256, bytes, previous_sha256, who/why)
lives at `_workmeta/<same folder name>/lineage/<file>.lineage.json`, per
`docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`.

## The CSV-one-copy rule

Each ledger is **one** CSV: UTF-8 with BOM, CRLF line endings, Korean headers (Owner
2026-09-21). There is never a second human-facing or AI-facing copy of the same data --
Excel and any script both read/write the same file. `src/ledgers.mjs`'s `encodeCsv` /
`decodeCsv` are the only encode/decode path other code should use.

## Person merge rules (연락처_장부.csv)

Implemented in `src/ledgers.mjs`'s `buildContacts`:

- Aggregate by email address first (a display name varies mail to mail; the address
  usually does not).
- Addresses that carry the same best (Korean-first, most-used) display name **within
  one organisation family** merge into one person -- a company rename (the org
  config's `family` map) keeps the person.
- The same local-part within a family also merges even when one side never carried a
  display name (a mailbox keeps its local part through a rename).
- A trailing Korean job title is split into its own `직급` column, not left in the name.
- The same name across **different** organisations never auto-merges (a namesake);
  `비고` flags it "동일인 확인 필요" so a person resolves it by hand.

Organisation display names and the family map are supplied by a private org config
file (`examples/org_config.example.json` shows the shape) -- never hardcoded, since
real company/person names are private data.

## Rule versioning and lineage (`src/rule_store.mjs`)

`saveRuleVersion` never overwrites a prior version:

1. Archives the current `mail_routing_rule.{json,md}` pair to
   `021…/history/mail_routing_rule.<old_version>.<json|md>`, create-only -- a
   collision (history already has that version) aborts the save rather than
   silently overwriting history.
2. Only after that archive succeeds, writes the new pair to the canonical path
   atomically (staging file + rename) and bumps `rule_version` (`vN` -> `vN+1`).
3. Renders the new `.md` from the new `.json` plus the previous `.md`'s "Owner 확인
   기록" / "Owner 확인이 필요한 것" sections, carried forward verbatim, with the new
   save's `note` appended to the decisions list.
4. Writes fresh lineage files recording `sha256`, `bytes`, `previous_sha256`, `by`
   and `note`.

`by` must be a human actor string -- an actor id following this codebase's
`actor:...` machine-actor convention (e.g. `RECONCILE_ACTOR`-style ids) is refused
(`isMachineActor`). A short-lived lock (`rule_save.lock`, stale-reclaimed after 15
minutes, the same reclaim shape as
`guild_hall/context_engine/harness/estate_voice_card_reconcile.mjs`'s lock) prevents
two concurrent saves on the same rule folder.

## Refresh semantics (`src/refresh.mjs`)

`refresh` is **not** create-only -- unlike the rule store, the four ledgers are
rewritten from custody on every run, while **preserving Owner-entered columns by
key**:

| CSV | key | preserved columns |
| --- | --- | --- |
| 연락처_장부.csv | 메일 | 과제내역할(Owner기입) |
| 메일_수신/발송이력.csv | 이력키 | 단계, 작업상태 |
| 회신_현황.csv | 스레드 | 처리상태(Owner기입), 메모 |

A file is archived to `<folder>/history/<name>.<timestamp>.csv` only when its content
actually changed after the merge -- an unchanged refresh (same custody, same Owner
cells) leaves the file untouched and archives nothing. Lineage is updated with the new
`previous_sha256` whenever a file is rewritten. Every refresh (dry or not) writes a
receipt JSON (`soulforge.workspace_ledgers_refresh_receipt.v1`) to `--receipts`, with
per-project before/after row counts, held/skipped-system counts and
preserved-owner-cell counts.

Classification always considers **every** onboarded project's rule (so held/yield
decisions are correct), even when `--projects` restricts which projects' files are
actually written.

## Mail matching (`src/classifier.mjs`, `src/mail_events.mjs`)

- A rule's `exact` terms decide attribution; `hint` terms are review-only signal,
  never attribution. Two projects' `exact` terms matching one mail means `held` -- no
  automatic attribution, ever (`conflict_policy`).
- `yields_to` lets one project's rule step aside for another when a second condition
  also matches (e.g. an upgrade variant belonging to a different project code). It is
  an **array** of `{ project_code, when }` hand-over rules (a rule can yield to more
  than one target depending on which variant term shows up), capped at
  `MAX_YIELDS_TO_ENTRIES` (8). `null` and a single object are still accepted on read
  (`normalizeYieldsTo` in `src/classifier.mjs`) for rules saved before this schema
  change, but `saveRuleVersion` always writes the array form, and the `.md` twin
  renders one `- 넘김: ...` line per entry.
- `--fields subject|all` (CLI) / `{fields}` (library) restricts which of a rule's own
  `match_fields` are actually consulted, so a caller can reproduce subject-only
  routing numbers even for a rule that also declares `body_text`/`attachment_names`.
- `mail_events.mjs` reads mail body text only to build the text a rule is tested
  against; body text and attachment names never leave the module -- every event this
  module returns carries metadata (subject, participants, attachment **count**,
  classification result) only.

## CLI

```
node cli.mjs refresh --workspaces-root <dir> --workmeta-root <dir> \
  --hiworks-events <dir> --gmail-sent-events <dir> --org-config <file> \
  [--projects a,b] [--fields subject|all] [--dry] --receipts <dir>

node cli.mjs preview-rule --code <CODE> --draft <file> --workspaces-root <dir> \
  --hiworks-events <dir> --gmail-sent-events <dir> [--fields subject|all]

node cli.mjs save-rule --code <CODE> --draft <file> \
  --workspaces-root <dir> --workmeta-root <dir> --by <actor> --note <text>
```

Exit codes: `0` success, `2` usage/config error (bad flags, unreadable/invalid input
that never reached a write), `3` runtime failure (lock held, write failure, or a rule
store error reached after the arguments were valid).

## Not yet wired (계획)

- Attribution into the project document/index store and the nightly automation chain
  is **planned**, not implemented here. This module is the ledger/rule engine a UI
  adapter or a future nightly lane calls into; it does not itself schedule anything.
- Initial rule *authoring* for a brand-new project (before any `v1` exists) is out of
  scope -- `saveRuleVersion` versions an existing rule.

## Exported functions a UI adapter calls

`src/index.mjs` is the single entry point for external callers (e.g. the console/UI
adapter) -- import from there rather than from individual `src/*.mjs` files. Every
function takes one options object; `workspacesRoot`/`workmetaRoot` and the custody
directories are always explicit arguments, never inferred or read from the
environment.

- `listProjects({ workspacesRoot })` -> `[{ project_code, folder_name, rule_json_path, rule_md_path }]`
- `readRule({ workspacesRoot, code })` -> `{ project_code, folder_name, json, md, json_path, md_path, sha256_json, sha256_md }`
- `previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields? })` -> `{ matched_before, matched_after, moved_in, moved_out, newly_held, samples }`
- `saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured? })` -> `{ project_code, folder_name, previous_version, rule_version, json_path, md_path, history_json_path, history_md_path, sha256_json, sha256_md }`
- `refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath, projects?, fields?, dry?, receiptsDir, now? })` -> the receipt body

`src/index.mjs` also re-exports `validateRule`, `isMachineActor`, `RuleStoreError`,
`RefreshError`, `classifyMail`/`compileRule`/`compileRules`/`normalizeYieldsTo`, the
CSV builders/encoders from `src/ledgers.mjs`, and `loadMailEvents`/`parseAddressField`
from `src/mail_events.mjs`, for callers that need them.

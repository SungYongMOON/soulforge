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

`encodeCsv` also guards against CSV/formula injection: a cell whose content, after any
leading spaces/tabs, starts with `=`, `+`, `-` or `@` (`=cmd|'/C calc'!A0`, a phone
number written `+82-10-...`, a negative figure, an `@mention`) is prefixed with a
single leading `'`, which Excel/Sheets/LibreOffice all render as literal text instead
of evaluating it as a formula. `decodeCsv` strips exactly that one guard back off, so
a preserved Owner-entered cell round-trips unchanged. A genuine value that itself
started with an apostrophe immediately followed by a trigger character (`'=already
guarded`) is indistinguishable from a guarded one and is treated as guarded on
read -- a deliberately rare, documented edge case, not a data-loss risk.

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

**Known risk -- intra-family namesakes.** The same-display-name merge above can still
merge two genuinely *different* people who happen to share a rare, non-dominant
spelling of their name (e.g. an initials-only signature that coincidentally matches)
within the same organisation family, if their address local parts differ (so the
safer "same local part through a rename" path did not apply). `buildContacts` flags
this specific shape -- a merged row pooling >=2 addresses with different local parts,
where at least one pooled address's own *dominant* spelling (by raw frequency, not the
Korean-first tiebreak `bestName` uses) disagrees with the row's chosen name -- with
`비고` "같은 이름·같은 조직의 다른 주소 — 동일인 확인 필요". The row is never
automatically split; a person resolves it by hand, the same as any other 비고 flag.

## Timestamps

Every custody timestamp is normalised to a canonical UTC instant on read
(`mail_events.mjs`'s `normalizeTimestamp`, `Date#toISOString`) before any comparison,
sort, or first/last-seen tracking happens -- comparing raw timestamp strings
lexically is wrong whenever sources mix offsets (`+09:00` vs `Z`): a later UTC instant
can sort as the lexically "earlier" string. Every date a ledger actually *displays*
(처음등장, 마지막등장, 마지막메일일) is instead the Asia/Seoul calendar date derived
from that UTC instant (`ledgers.mjs`'s `seoulDateOf`, a fixed +9h shift -- Seoul has no
DST) -- a mail arriving at 23:30 KST is "today" in Seoul even though its UTC instant is
already past UTC midnight.

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
(`isMachineActor`). An optional `allowedActors` array further restricts `by` to that
exact list (N16) -- e.g. a console pinning saves to a single `'owner'` actor. A
short-lived lock (`rule_save.lock`, stale-reclaimed after 15 minutes, the same reclaim
shape as `guild_hall/context_engine/harness/estate_voice_card_reconcile.mjs`'s lock)
prevents two concurrent saves on the same rule folder.

**`draft` must be a complete rule document, not a partial patch.** `previewRule` and
`saveRuleVersion` both take `draft` as the *entire* proposed rule body (schema fields:
`exact`, `hint`, `yields_to`, `match_fields`, `conflict_policy`, `sender_policy`, ...),
not a diff or a set of fields to merge onto the existing saved rule. A caller that
wants to add one trigger to an existing rule must read the current rule first
(`readRule`) and build the full next `exact` array itself before calling either
function -- neither function reads the existing rule's `exact`/`hint`/`yields_to` and
merges it with `draft`'s. Unknown top-level fields on `draft` (e.g. a
not-yet-schema-committed `participant_domains`) pass through untouched into the saved
json -- this module does not validate, strip or build behaviour on any field outside
the schema above.

`saveRuleVersion`'s optional `measured` (folded into the rendered md's 근거 line)
accepts either shape: `previewRule`'s own return value passed straight through
(`{matched_before, matched_after, moved_in, moved_out, newly_held, samples}` -- only
the four counts are rendered, `samples` -- real mail subjects -- is never rendered
into the tracked-adjacent rule file), or the older `{subjects, exact, hint_only}`
convenience shape. Any field missing from whichever shape is present renders nothing
for that field, never the literal `undefined`; `measured` left out entirely (or an
object matching neither shape) renders the same "값 없음 (UNKNOWN)" line as before.

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
cells) leaves the file untouched and archives nothing. The archive write is
create-only, the same as the rule store's history archive; if the exact target name
is already taken (two refreshes sharing the same `now` stamp), a numeric counter
suffix (`.csv`, `-1.csv`, `-2.csv`, ...) is appended rather than overwriting the
earlier archive. Lineage is updated with the new `previous_sha256` whenever a file is
rewritten. Every refresh (dry or not) writes a receipt JSON
(`soulforge.workspace_ledgers_refresh_receipt.v1`) to `--receipts`, with per-project
before/after row counts, held/skipped-system counts, preserved-owner-cell counts, and
`owner_cells_dropped_with_row` (below).

**A key that leaves custody.** When a row's key (메일 / 이력키 / 스레드) was present in
the previous refresh but is not among this refresh's freshly-built rows -- the mail no
longer classifies the same way, the person no longer appears, the thread's messages
were re-attributed -- that row simply is not in the live CSV any more, and any
Owner-entered value on it (과제내역할, 단계, 작업상태, 처리상태, 메모) does not carry
forward. It is not lost: the row survives exactly as it was in the
`history/<name>.<timestamp>.csv` archive this refresh writes (since the file did
change). `owner_cells_dropped_with_row` in the receipt counts how many such rows had a
non-empty Owner cell -- a count only, never the row content itself (no subjects, names
or addresses leak into the receipt this way).

**Fail-closed validation (R4).** Before merging into any existing ledger CSV, that
file is strictly validated: no `U+FFFD` anywhere in its bytes (a common CP949/EUC-KR-
as-UTF-8 mojibake signature), its header row matches the builder's own headers
exactly, every row has exactly the header's column count, and no two rows share the
same key. A file that fails any of these checks is **not merged into, not written to,
not archived** -- it is left exactly as found, and `{file, code}` (one of
`workspace_ledgers_ledger_header_mismatch`, `..._row_shape`, `..._encoding`,
`..._duplicate_key`) is recorded in the receipt's `ledger_failures` array. This is
per-file, not per-project or per-run: every other ledger for every other project still
refreshes normally in the same call. `receipt.status` is `'failed'` whenever
`ledger_failures` is non-empty; `refresh()` still returns the receipt (it does not
throw for this), and the CLI maps `status: 'failed'` to exit code 2.

Classification always considers **every** onboarded project's rule (so held/yield
decisions are correct), even when `--projects` restricts which projects' files are
actually written.

## Performance

- `classifier.mjs` lowercases each mail's field text at most once per unique
  `match_fields` combination per mail (in practice once total, since every rule
  declares the same three fields), not once per term -- a cache scoped to a single
  `classifyMail`/`hintCodes` call.
- `body_text` matching is bounded to the first `MAX_BODY_TEXT_CHARS` (20,000)
  characters; a routing keyword that only appears later in a long mail body is not
  matched on body text. Subject and attachment-name matching are not bounded (those
  are always short).
- `previewRule` (called interactively, once or twice per keystroke-adjacent draft
  edit) caches a classified custody read for up to `CUSTODY_CACHE_TTL_MS` (60s),
  keyed on the actual rule JSON compared plus a directory signature (file names, sizes
  and mtimes, not content) -- any change to either invalidates the entry immediately.
  `refresh()` (which writes real files) never reads through this cache.

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
- A `from`/`to`/`cc` field that is a single string holding several recipients
  (`"홍" <a@b.com>, "김" <c@d.com>`) is split on top-level commas/semicolons
  (respecting quoted display names and angle-bracketed addresses); a fragment left
  over that still contains whitespace or `<` after parsing is dropped rather than kept
  as a malformed "address".
- A custody record with no `event_id` gets a stable content-derived id
  (`synthetic:<sha256 prefix of source+timestamp+normalised subject+from address>`),
  so two such events never collide on the same 이력키.

### Regex term safety

A `kind: 'regex'` term is compiled defensively, not merely length-capped:

- **Flags are whitelisted** to `''`, `'i'`, `'u'`, `'iu'`, `'ui'` -- `g`/`y`
  particularly are refused (a stateful `lastIndex` shared across the many mails one
  term is tested against would silently corrupt matching). Every term is compiled with
  `u` regardless of what was asked.
- **Nested quantifiers are refused** (`(a+)+`, `(.*)*`, `(\w+\s?)+`) -- a group that is
  itself quantified and whose own body also contains a quantifier is the classic
  ReDoS (catastrophic backtracking) shape.
- **Backreferences** (`\1`, `\k<name>`) and **lookbehind** (`(?<=...)`, `(?<!...)`) are
  refused outright.
- **Alternation branches are capped** at `MAX_ALTERNATION_BRANCHES` (12).
- The existing quantifier-count cap (`MAX_REGEX_QUANTIFIERS`, 20) and value-length cap
  (`MAX_TERM_VALUE_LENGTH`, 200) still apply.

All of this lives in `src/classifier.mjs`'s `compileTerm`; `rule_store.mjs`'s
`validateRule` surfaces the same errors for a draft rule before it is ever saved.

## CLI

```
node cli.mjs refresh --workspaces-root <dir> --workmeta-root <dir> \
  --hiworks-events <dir> --gmail-sent-events <dir> --org-config <file> \
  [--projects a,b] [--fields subject|all] [--dry] --receipts <dir>

node cli.mjs preview-rule --code <CODE> --draft <file> --workspaces-root <dir> \
  --hiworks-events <dir> --gmail-sent-events <dir> [--fields subject|all]

node cli.mjs save-rule --code <CODE> --draft <file> \
  --workspaces-root <dir> --workmeta-root <dir> --by <actor> --note <text> \
  [--allowed-actors a,b,c]
```

`--allowed-actors` (N16) further restricts `--by` to that exact list, on top of the
always-applied machine-actor refusal -- e.g. a console pinning saves to `--by owner
--allowed-actors owner`. Omitted (the default), any non-machine actor string is
accepted, as before.

Exit codes: `0` success, `2` usage/config error (bad flags, unreadable/invalid input
that never reached a write) **or** `refresh` completing with one or more ledger files
that failed strict validation (R4 above -- `status: 'failed'` in the receipt), `3`
runtime failure (lock held, write failure, or a rule store error reached after the
arguments were valid).

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
- `saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured?, allowedActors? })` -> `{ project_code, folder_name, previous_version, rule_version, json_path, md_path, history_json_path, history_md_path, sha256_json, sha256_md }`
- `refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath, projects?, fields?, dry?, receiptsDir, now? })` -> the receipt body (`status: 'ok' | 'failed'`, `ledger_failures`)

`src/index.mjs` also re-exports `validateRule`, `isMachineActor`, `RuleStoreError`,
`RefreshError`, `clearCustodyCache`, `classifyMail`/`compileRule`/`compileRules`/
`normalizeYieldsTo`, the CSV builders/encoders and `seoulDateOf` from
`src/ledgers.mjs`, and `loadMailEvents`/`parseAddressField` from `src/mail_events.mjs`,
for callers that need them.

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
  `처리상태(Owner기입)`/`메모` columns. Threads group by normalised subject
  (`src/ledgers.mjs`'s `normalizeSubject`), which strips Re/Fw/답장/전달/회신/Remind
  prefixes and read-receipt prefixes (읽음:/Read:, Owner decision 2026-09-21) before
  hashing.

Byte lineage for every one of those files (sha256, bytes, previous_sha256, who/why)
lives at `_workmeta/<same folder name>/lineage/<file>.lineage.json`, per
`docs/architecture/workspace/PROJECT_ONBOARDING_V0.md`.

This module only ever reads/writes the fixed relative paths above -- it never lists
or globs `020_MGMT/`'s own contents, so any other file a person or a different tool
keeps there (e.g. per-organisation or per-work-tag tables the Owner maintains
separately) is never touched, read, or even enumerated by `refresh`, `previewRule`, or
`saveRuleVersion`.

## Design simplification: no per-mail timeout, no run budget (fresh-review-5, coordinator decision)

Three fresh-review rounds (fresh-review-3, -4, -5) iterated on a `node:vm`-based
per-mail match timeout and a cumulative run-time budget meant to guard against a
regex term that slips past every static/compile-time defence and hangs on real mail
data. Each round fixed a real problem with the previous one, and each fix introduced a
new failure mode of its own -- the last of them being a wall-clock interruption on
**one project's** term deleting **another, unrelated project's** ledger row (and any
Owner cell on it), because the timeout aborted classification for a whole mail rather
than failing narrowly. For a loopback tool one person (the Owner) runs against their
own mail, that outcome is strictly worse than the ReDoS risk it was meant to guard
against. The coordinator's decision: remove the timing machinery from the real match
path entirely. **This is current, not aspirational -- `classifyMailBounded`,
`createBoundedClassifier`, `compiledRulesHaveRegex`, per-mail `match_timeouts`, and the
cumulative `match_run_budget_exceeded` gate do not exist in this codebase any more.**
Matching (`classifier.mjs`'s `classifyMail`) is a direct, synchronous call every time,
for every mail, with no wall-clock interruption of any kind.

What still guards against a bad regex, because it is deterministic rather than
timing-dependent:

- The static shape checks in `compileTerm` (nested quantifiers, backreferences,
  lookbehind, alternation cap, flag whitelist) -- always applied, to every rule, every
  time it is compiled.
- The multi-alphabet ReDoS timing canaries -- but **only** when a rule is a *draft*:
  `validateRule`, `previewRule`'s draft compile, and `saveRuleVersion`. A pattern that
  cannot pass these never gets saved in the first place.
- Read-time and match-time character caps on `subject`, `body_text` and
  `attachment_names` (`MAX_BODY_TEXT_CHARS`) -- this is what actually keeps a single
  match cheap on the real path, where matching is untimed.

A *saved* rule is trusted at `refresh()` time precisely because it already passed the
canaries the moment it was saved -- `refresh()` compiles saved rules with
`timeSafety: false` (no re-timing; see `classifier.mjs`'s `compileTerm` doc) and then
matches directly, with no per-mail wall-clock guard on top.

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

An embedded newline in a cell (most often a soft-wrapped Owner note typed in Excel)
round-trips through a quoted cell -- `encodeCsv` used to flatten it to a single space
unconditionally, which silently lost it on the very next refresh; `decodeCsv` already
read a quoted embedded newline back correctly, so this was purely a lossy write path.

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

**The 메일 column (the row's key) is the merged person's most-recently-active address,
not a fixed identifier.** A merged person can have more than one address (다른메일
lists every other one); which address is "primary" and shown in 메일 can change from
one refresh to the next whenever their next mail happens to arrive on a different one
of their own already-merged addresses. `refresh.mjs`'s Owner-cell preservation for
this ledger is aware of this: it matches an existing row to a fresh one by ANY address
in the row's merged set (메일 plus every 다른메일 entry), not only by the current 메일
value, so 과제내역할(Owner기입) survives that kind of flip -- see "Key stability" below
(fresh-review-6 #1).

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
   save's `note` appended to the decisions list. Any **other** `## ` section an Owner
   added by hand (one the renderer does not itself regenerate) is also carried forward
   verbatim, right after the two Owner-editable sections -- a previous version only
   ever looked for those two known headings and silently dropped anything else on the
   very next save. Section splitting is fence-aware: a `## ` line inside a ` ``` `/`~~~`
   fenced code block (e.g. an Owner pasting a markdown snippet as an example) is never
   mistaken for a section boundary. Recognising a *fixed* (machine-regenerated)
   heading uses exact equality for every heading that renders with no trailing
   parenthetical (`## 근거`, `## Owner 확인 기록`, ...) -- a `startsWith` match against
   those short stems (R-2, fresh-review-4) let an Owner heading that merely began with
   the same stem plus more words (e.g. one starting with the same two characters as
   "## 근거") get mistaken for the fixed section and silently dropped. Only the two
   headings that DO render with a fixed trailing parenthetical ("## 확정 트리거 (...)",
   "## 검토 힌트 (...)") still match by prefix. The function that LOCATES the two
   Owner-editable sections' own content (`findSectionLines`, looking for "## Owner 확인
   기록"/"## Owner 확인이 필요한 것" specifically) needed the identical fix
   separately (fresh-review-5 #2) -- fixing `isFixedHeading` alone left this one still
   matching by `startsWith`, so a lookalike heading placed *before* the genuine one in
   the file was found first: the genuine section's body was never located at all
   (silently lost), and the lookalike's body ended up rendered twice -- once as the
   (wrongly matched) "decided"/"open" content, once again as a carried-forward unknown
   section. Both functions now use the exact same heading-matching rule.
4. Writes fresh lineage files recording `sha256`, `bytes`, `previous_sha256`, `by`
   and `note`.

`by` must be a human actor string -- an actor id following this codebase's
`actor:...` machine-actor convention (e.g. `RECONCILE_ACTOR`-style ids) is refused
(`isMachineActor`). An optional `allowedActors` array further restricts `by` to that
exact list (N16) -- e.g. a console pinning saves to a single `'owner'` actor. A
short-lived lock (`rule_save.lock`, stale-reclaimed after 15 minutes, the same reclaim
shape as `guild_hall/context_engine/harness/estate_voice_card_reconcile.mjs`'s lock)
prevents two concurrent saves on the same rule folder. A lock whose recorded
`started_at` is in the *future* relative to the caller's `now` (clock skew, or
corrupted lock data) is treated as stale immediately, not as freshly held -- the same
fix applies to `refresh.mjs`'s own lock, below.

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
the schema above. `participant_domains` specifically: Owner decision (2026-09-21) is
that a supplier/partner domain must never confirm a project by itself, so saved rules
now always carry it empty -- this module keeps ignoring it either way and does not
build attribution logic on it.

`saveRuleVersion`'s optional `measured` (folded into the rendered md's 근거 line)
accepts either shape: `previewRule`'s own return value passed straight through
(`{matched_before, matched_after, moved_in, moved_out, newly_held, samples,
rule_failures}` -- only the four counts are rendered, `samples` -- real mail subjects
-- is never rendered into the tracked-adjacent rule file), or the older `{subjects,
exact, hint_only}` convenience shape. Any field missing from whichever shape is
present renders nothing for that field, never the literal `undefined`; `measured` left
out entirely (or an object matching neither shape) renders the same "값 없음
(UNKNOWN)" line as before.

`measured.rule_failures` (fresh-review-5 #7) -- a non-empty array from `previewRule`
naming some OTHER project whose own saved rule failed to read/compile and was excluded
from the custody classification these counts were computed against -- renders as a
trailing caveat sentence on the 실측 line ("주의: 다른 과제 규칙 N건이 컴파일 실패해
이번 실측에서 제외됨 (보류/양보 판단이 바뀔 수 있음)."), never as the raw count
presented as if it were complete. The failing project's code, its own rule's error
code, and any term label are never named in this caveat -- only the count.

## Refresh semantics (`src/refresh.mjs`)

`refresh` is **not** create-only -- unlike the rule store, the four ledgers are
rewritten from custody on every run, while **preserving Owner-entered columns by
key**. A short-lived lock (a dot-file at `workspacesRoot`'s own root -- never inside
any project folder `listProjects` would enumerate, and never scoped to
`--receipts`, since two callers with different receipts directories -- the CLI and a
UI adapter, say -- must still serialise against each other when they can both
rewrite the same ledgers) prevents two concurrent refreshes. A future-dated lock is
stale immediately (see above). The lock-held case writes its own failure receipt
before throwing -- "another refresh is already running" is exactly the kind of thing
an audit trail should record, not a silent early exit.

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

**A key that leaves custody.** When a row's key (메일 / 이력키 / 스레드 -- for
연락처_장부.csv specifically, "key" here means the row's *whole* merged address set,
not only its current 메일 column; see "Key stability" below) was present in the
previous refresh but is not among this refresh's freshly-built rows -- the mail no
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
exactly, and every row has exactly the header's column count. A file that fails
either of these checks is **not merged into, not written to, not archived** -- it is
left exactly as found, and `{file, code}` (`workspace_ledgers_ledger_header_mismatch`,
`..._row_shape`, or `..._encoding`) is recorded in the receipt's `ledger_failures`
array. This is per-file, not per-project or per-run: every other ledger for every
other project still refreshes normally in the same call. `receipt.status` is
`'failed'` whenever `ledger_failures` is non-empty; `refresh()` still returns the
receipt (it does not throw for this), and the CLI maps `status: 'failed'` to exit
code 2.

**Duplicate-key rows.** Custody itself repeats mails (below), and the ledgers this
module first met (written by the one-time scratch-script generation) still carry
duplicate-key rows as a result. A repeated key's rows are handled per group, not
failed closed outright:

- **Byte-identical** rows (every column matches) collapse to one, counted in
  `collapsed_identical_rows` per ledger in the receipt.
- Rows that differ **only in a machine-owned column** (not one of that ledger's
  Owner-entered/preserved columns) also collapse to one representative -- this
  refresh's freshly-built row supersedes every machine-owned column regardless of
  which duplicate is picked, so no reconciliation is needed.
- Rows that disagree on an **Owner-entered column itself** are a genuine conflict --
  which edit is authoritative cannot be inferred -- and still fail closed with
  `workspace_ledgers_ledger_duplicate_key` (plus `conflict_groups`, how many distinct
  keys had a real conflict) in `ledger_failures`, the same as any other R4 violation.

Classification always considers **every** onboarded project's rule (so held/yield
decisions are correct), even when `--projects` restricts which projects' files are
actually written.

**A bad saved rule for one project (S-8).** Each onboarded project's saved rule is
read and compiled *individually*. A project whose rule fails to read (corrupted json,
schema mismatch) or fails to compile (a term that somehow became invalid after it was
saved) is excluded from this run entirely -- its terms take no part in classification
for ANY project, and its own ledgers are not written -- while every other project's
rule still loads and every other project still refreshes normally (proven directly:
project A's row and Owner cells are unaffected by project B's rule content, short of
B's own rule failing to compile, in which case B alone is excluded). Recorded in
`receipt.rule_failures` as `{ project_code, code, term_ref }`; `receipt.status` is
`'failed'` whenever this is non-empty. `term_ref` (fresh-review-5 #9) is `{ list,
index, label_hash }` when the failure was term-specific (`null` otherwise) -- **never**
the term's own label text. A rule term's label is Owner-authored routing keyword text
and may itself be a real project code, partner name, or other identifying text; a
receipt is written to disk and may be surfaced to a UI, so it gets the same treatment
`previewRule`'s `samples` already gets -- named by position and a short hash, not by
content.

**Custody directories that overlap or coincide (S-4).** `--hiworks-events` and
`--gmail-sent-events` pointing at the exact same directory (a copy/paste mistake) is
rejected immediately with `workspace_ledgers_custody_dirs_overlap`, before any
classification happens -- every event would otherwise be read and classified twice.
Compared by `fs.realpathSync.native()` (fresh-review-5 #5), not the literal path
string or even a plain `path.resolve` -- this repo's own custody layout uses
junctions/symlinks in places, and two differently-spelled paths that resolve to the
same real directory are exactly the mistake a literal-string comparison would miss.
Case-folded only on `win32` (POSIX paths are case-sensitive). Separately, the same
`event_id` genuinely appearing in *both* sources (a different real directory each, but
coincidentally sharing an id -- e.g. a sent mail synced by both channels with the same
provider id) is detected once both sources' events are merged: the first occurrence
(in a fixed, source-identity-based concatenation order -- hiworks before gmail, not a
count that depends on how much custody exists) keeps its id unchanged, and every later
occurrence gets `source` plus a short hash of that event's own content
(fresh-review-5 #4 -- not a positional `#2`/`#3`, which could shift if a run were ever
extended to more than two sources or more than one colliding pair) folded into its id,
so the two never collide on the same downstream 이력키 and an existing repeat's key
never moves later.

**`allowEmpty` validation (S-5, S-8).** `allowEmpty` must be an array of project
codes; a bare `true` (the previous API) now throws
`workspace_ledgers_allow_empty_must_be_list` instead of silently behaving like an
empty list (which looked identical to never having asked for the override at all).
Every code named in it must be a real, currently-onboarded project -- an unrecognised
code is `workspace_ledgers_unknown_project`, the same check `--projects` already gets.
A code that names a real project excluded from THIS run only because its own rule
failed to compile (see `rule_failures` above) is a different situation, not a typo --
it gets its own code, `workspace_ledgers_allow_empty_targets_rule_failure`
(fresh-review-5 #8), pointing at the actual cause instead of the generic
`unknown_project`.

**Unreadable custody directories (pre-write gate).** A directory the custody loader
(`common_events.mjs`'s `loadRawMailRecords`, the same one the common pipeline reads
through -- D-a/D-c, round 2) could not read at all -- most dangerously, a
`--hiworks-events` typo pointing at a path that simply does not exist -- is recorded in
`receipt.unreadable_dirs`, and its
presence alone sets `receipt.status` to `'failed'`. Custody is classified **before**
any file is written, and by default an unreadable directory blocks every write for
the whole run -- not a single project, not a single file: `receipt.projects` is empty
and nothing on disk is touched. This closes a gap where a typo in one custody flag
used to let every *other* project's ledgers already get rewritten (and only the
typo'd project's files fail the empty-refresh guard below, or not even that) before
the run's overall failure was visible at all. An explicit `allowPartialSources: true`
(`--allow-partial-sources` on the CLI) opts into the old behaviour -- the run proceeds
on whatever custody *was* readable, and `receipt.allow_partial_sources_applied` is
`true` so that choice is visible in the audit trail. `receipt.unreadable_dirs` entries
never carry a host-local path -- only `{ source: 'hiworks-events' | 'gmail-sent-events',
dir: <basename>, code }`, so which flag pointed at a bad path is clear without leaking
where on disk it lives.

**Empty refreshes.** If a ledger's freshly-built rows come out to zero while its
existing file on disk has rows, that file **fails closed**
(`workspace_ledgers_ledger_empty_refresh_blocked`, left untouched) unless the caller
explicitly names that project in `allowEmpty` (an array of project codes, not a
boolean -- `--allow-empty P00-001,P00-002` on the CLI). The override is scoped: naming
one project never silently empties another project's ledgers too. Every project code
that actually needed the override (its rows really did come out to zero where the
file had content before) is echoed back in `receipt.allow_empty_applied_to`, so a
caller can tell which projects were genuinely affected without having to diff every
file.

**Partial-sources shrink guard (fresh-review-6 #4, corrected fresh-review-7 R3/S2).**
The empty-refresh guard above only catches an EXACT zero. With `allowPartialSources`
(some custody source was unreadable and skipped entirely, per "Unreadable custody
directories" above), a ledger's fresh row count can crater to a small fraction of what
it was -- a 6-row ledger rewritten to 1 row -- without ever hitting exact zero. Only
checked when an unreadable directory **actually forced** a partial run this call --
`receipt.unreadable_dirs` non-empty AND the caller passed `allowPartialSources` -- not
merely on the raw request flag: a caller that always passes `allowPartialSources: true`
out of habit, on a run where every custody directory was in fact fully readable, no
longer has a legitimate large shrink (a rule change moving most mail elsewhere) blocked
by this guard (fresh-review-7 R3 -- gating on the request flag alone used to do exactly
that). A normal full-custody refresh can legitimately shrink a ledger a lot and is not
second-guessed. When it IS in effect: if a ledger's fresh row count comes out below 50%
of its previous row count -- **after** collapsing any legacy duplicate-key rows the
existing file may still carry (fresh-review-7 S2: a ledger with 5 raw lines that
collapse to 4 distinct rows uses 4 as the baseline, not 5, so stale round-trip debt in
the file never changes whether a later shrink looks past or under the guard) -- that
file **fails closed** too (`workspace_ledgers_ledger_partial_sources_shrink_blocked`,
left untouched) unless the project is also named in `allowEmpty`. The failure entry in
`receipt.ledger_failures` (and the per-file result) records both `before_rows` (the
post-collapse baseline) and `after_rows`, so a caller can see the shrink without having
to diff the file. When `allowEmpty` overrides this guard for a project, that project is
recorded in `receipt.shrink_allowed_applied_to` (fresh-review-7 S1) -- distinct from
`allow_empty_applied_to`, which is only for the exact-zero empty-refresh guard -- so the
override itself leaves a trace instead of looking identical to a shrink that never came
near the guard.

A `refresh()` call that throws for any other reason still writes a best-effort
`status: 'failed'` receipt (with an `error` field) before the error propagates, so a
crash never leaves zero audit trail either -- and that receipt still carries
`receipt.projects` for whichever earlier projects in the run had already completed
(alphabetical by project code) before the throw, not a bare `{status, error}`.
`error.code` is kept verbatim; `error.message` (S-7, fresh-review-4; extended
fresh-review-5 #6) has any host-local absolute path cut down to its basename first --
a raw filesystem error (`ENOENT`/`EACCES`/...) commonly embeds the full path it failed
on, and that receipt is exactly the kind of thing that could otherwise leak one.
Handles Windows drive-letter paths, POSIX absolute paths, and UNC (`\\server\share\...`)
paths alike, and a quoted path containing spaces is redacted as the whole quoted span
(Node's own fs errors always single-quote the path) rather than only up to the first
space.

**Key stability.** No production ledgers have been written by this module yet -- the
real target-plane ledgers currently on disk were generated by a one-time scratch
script and will be regenerated once, separately, before this module's `refresh()` is
first pointed at them for real. Accordingly this module does **not** implement a
migration for any of its own past key-shape changes (the canonicalised-hash no-id
synthetic id, the fingerprint-hash id-collision suffix, the content-derived
cross-source suffix): a run against custody that already produced synthetic/collision/
cross-source ids under an OLDER shape of this code will treat those keys as having
"left custody" once, dropping their Owner cells into history exactly as any other key
change would (`owner_cells_dropped_with_row`). Every key-shape decision documented on
this page is stable **from this commit onward** -- a mail that produces the same
content today and next month gets the same key both times -- but is not guaranteed
stable against ledgers this module rewrote under a previous commit.

연락처_장부.csv's own key column (메일) is the one deliberate exception to "same
content, same key": it is the merged person's most-recently-active address, which can
legitimately change from one refresh to the next as new mail arrives (see "Person
merge rules" above) while the same real person is still present. Owner-cell
preservation for this one ledger does **not** rely on that key column being stable --
`refresh.mjs` matches an existing row to a fresh one by ANY address in the merged
person's own set (메일 plus every 다른메일 entry, split on whitespace/comma/semicolon,
trimmed and case-folded -- fresh-review-7 N1 -- so a hand-edited cell still matches),
so the Owner cell still survives a key-column change caused by this reason
specifically (fresh-review-6 #1). It is only counted as genuinely dropped when the
person's WHOLE address set no longer appears at all.

**Matching order and ambiguity (fresh-review-7 R1/R2).** An existing row can be matched
to at most one fresh row per refresh. The exact 메일 key-column match always runs
first and always wins; the alternate-address match only ever considers fresh rows the
exact pass left unmatched, and only existing rows the exact pass did not already
consume -- so when a formerly-merged existing row's identity later splits into two
separate fresh people, at most one of them (whichever exact-matches) inherits the
Owner cell, never both. Within the alternate-address index itself, an address that
would resolve to more than one existing row, or that collides with a DIFFERENT
existing row's own exact key column, is removed from the index entirely and never used
for matching (this is what stops a stale 다른메일 entry on one row from silently
shadowing a second row that is genuinely, exactly keyed on that same address).

**What `owner_cells_ambiguous` actually counts (nit, fresh non-author review,
2026-09-21).** Not "how many Owner cells were withheld this run" -- it is a hygiene
count over the alternate-address INDEX itself, not a per-row outcome. Three distinct
situations add to it: (1) an address removed from the index because it would resolve
to more than one existing row, or collides with a different existing row's own exact
key column -- counted the moment the collision is detected, regardless of whether any
fresh row this run actually needed that address; (2) a fresh row itself reaching more
than one still-available existing row through the alternate-address match; (3) two or
more fresh rows genuinely contending for the same not-yet-consumed existing row. Only
(2) and (3) correspond to a fresh row that concretely lost a match this run; (1) can
fire even when nothing this run was ever at risk of matching through that address.
Per-ledger, contacts.csv only -- every other ledger keys on an exact, non-alternate
column and this is always `0` there.

## Performance

- `classifier.mjs` lowercases each mail's field text at most once per unique
  `match_fields` combination per mail, not once per term -- a cache scoped to a single
  `classifyMail`/`hintCodes` call. Under K1 (coordinator, fresh review round 3) there
  are exactly two combinations ever in play across a custody sweep, not one: step 1
  (`classifyProjectHits`'s title-rule check) always calls with `['subject']`, and step
  4 (the supplier-body tie-break) always calls with `['body_text']` -- a rule's own
  `match_fields` no longer widens step 1's own combination the way it did before K1.
- `body_text`, `subject`, and the joined attachment-names text are all bounded to the
  first `MAX_BODY_TEXT_CHARS` (20,000) characters (N-2, fresh-review-4: subject and
  attachment names used to be unbounded -- an adversarial or malformed 100k-character
  subject cost exactly the matching time an unbounded body would). `body_text` is
  additionally capped at *read* time, not merely at match time (N-4) -- a candidate
  held in memory for the rest of the pass never carries more of a body than matching
  could ever consult. A routing keyword that only appears past the bound is not
  matched. With no per-mail `vm` timeout on the real match path any more (see "Design
  simplification" above), this bound is what actually keeps a single match cheap.
- `previewRule` (called interactively, once or twice per keystroke-adjacent draft
  edit) caches a classified custody read for up to `CUSTODY_CACHE_TTL_MS` (60s),
  keyed on the actual rule JSON compared plus a directory signature (file names, sizes
  and mtimes, not content) -- any change to either invalidates the entry immediately.
  `refresh()` (which writes real files) never reads through this cache.

## Mail matching (`src/classifier.mjs`, `src/mail_events.mjs`)

- **Custody itself repeats mails** -- the same `event_id` can appear on more than one
  line (across custody files or within one; observed for real). `mail_events.mjs`
  dedupes custody candidates that share a non-empty `event_id`, but only after
  checking a cheap fingerprint (normalised subject + timestamp + sender address,
  deliberately **excluding attachment count** -- real custody has been observed
  repeating a mail's `event_id` with only that column differing). Candidates whose
  fingerprint agrees are genuine duplicates: the one with the most attachments is kept
  (a tie keeps the later line), counted in `duplicates_dropped`. Candidates that share
  an `event_id` but disagree on the fingerprint are treated as an **id collision**, not
  a duplicate -- a namespace collision across sources, or corrupt custody -- and both
  are kept, counted in `id_collisions_kept`; every subgroup's effective id is
  disambiguated by a short, stable hash of that subgroup's own fingerprint (`<id>~fp:
  <hash>`), never by a positional ordinal (N-5, fresh-review-4: an ordinal like `#2`/
  `#3`, assigned by iterating fingerprints in sorted order, depended on *how many*
  sibling subgroups existed and where each one's fingerprint happened to sort -- a
  newly-arriving colliding mail whose fingerprint sorted earlier could silently shift
  an already-existing subgroup's ordinal, and with it its downstream 이력키, even
  though nothing about that subgroup's own data changed). A missing `event_id` never
  groups with another missing one. Both counts are reported in the `refresh()` receipt
  and `previewRule`'s return -- `previewRule`'s counts are always computed on the
  deduped mail, never the raw repeated lines.
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
- `--fields subject` (CLI, or simply omit it) / `{fields: ['subject']}` (library) is
  the only supported value (K1, coordinator fresh review round 3) -- step 1 matches
  the subject only, full stop; `--fields all` no longer exists, and passing any value
  other than `subject`/omitted throws/errors. A rule's own `match_fields` stays
  schema-valid but is not consulted for step-1 placement any more.
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
  (`synthetic:<sha256 prefix of source+a canonicalised hash of the record>`) --
  hashing the entire record, not a handful of derived fields, means two records
  differing in *anything at all* (including fields this module never otherwise
  inspects, like recipients) get different ids. The hash is of a canonicalised
  (recursively sorted-key) serialisation of the parsed record, not its raw on-disk
  bytes (N-1, fresh-review-4) -- the same mail re-serialised by a different custody
  export with its object keys in a different order still hashes identically, instead
  of permanently becoming two distinct synthetic ids for one real mail. This is
  vanishingly unlikely to collide, not a cryptographic guarantee; two genuinely
  content-identical no-id records still hash the same (correctly -- they are the same
  record repeated), and if that or any other cause ever produces two fresh rows under
  one key, `refresh.mjs` refuses to write that ledger
  (`workspace_ledgers_ledger_fresh_duplicate_key`) rather than silently overwrite one
  of them.
- The system-sender skip list (senders like `noreply@...` that are never a real
  routing signal) is a small built-in list of known vendor domains. An org config's
  own `system_sender_domains` (an array of domains) is **merged into** that list, never
  replaces it -- see `examples/org_config.example.json`. `previewRule` accepts an
  optional `orgConfigPath` that resolves the same merged list a real `refresh()` against
  that config would use (also folded into the S10 custody-read cache's key, so a call
  with a different `orgConfigPath` never serves another call's cached result); omitted,
  `previewRule` uses the built-in default list only.

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
- **Every regex is timed against canary inputs at compile time, but only for a
  draft** (`validateRule`, `previewRule`'s draft compile, `saveRuleVersion` --
  never for an already-saved rule being recompiled by `refresh()`), under a hard
  wall-clock budget (`REDOS_CANARY_BUDGET_MS`, 200ms) -- the shape checks above catch
  the textbook ReDoS patterns, but not every one: `^(a|a)+$` and `^([a-z]|[a-z])+$`
  have no nested quantifier and a tiny alternation, yet both blow up catastrophically
  (an observed ~50s on a 31-char non-match). A plain JS loop cannot interrupt a
  runaway synchronous regex match; the canary run happens inside a `node:vm` context
  with a `timeout`, which V8's own execution-interrupt mechanism can actually stop
  mid-flight. A term that overruns the budget on any canary is refused
  (`workspace_ledgers_term_regex_timing_unsafe`) and can never be saved.
- The existing quantifier-count cap (`MAX_REGEX_QUANTIFIERS`, 20) and value-length cap
  (`MAX_TERM_VALUE_LENGTH`, 200) still apply.

All of this lives in `src/classifier.mjs`'s `compileTerm`; `rule_store.mjs`'s
`validateRule` surfaces the same errors for a draft rule before it is ever saved.

**What actually happens on the real match path.** A saved rule is trusted: `refresh()`
compiles it with `timeSafety: false` (no canary re-run -- see `compileTerm`'s
`timeSafety` doc above) and then matches directly, with **no wall-clock guard of any
kind** on the real match call (see "Design simplification" at the top of this page).
The static shape checks and the read/match-time character caps (`MAX_BODY_TEXT_CHARS`)
are what stand between a saved term and a pathological match on real data; there is no
`workspace_ledgers_term_regex_timing_unsafe_at_match` code, no `match_timeouts`, and no
`match_run_budget_exceeded` any more -- code that mentions any of those three is
describing a machinery this module no longer has.

## CLI

```
node cli.mjs refresh --workspaces-root <dir> --workmeta-root <dir> \
  --hiworks-events <dir> --gmail-sent-events <dir> --org-config <file> \
  [--projects a,b] [--fields subject] [--dry] \
  [--allow-empty P00-001,P00-002] [--allow-partial-sources] \
  [--bundle-table <file>] [--reading-table <file>] [--vendor-table <file>] \
  [--allow-degraded-owner-tables] --receipts <dir>

node cli.mjs preview-rule --code <CODE> --draft <file> --workspaces-root <dir> \
  --hiworks-events <dir> --gmail-sent-events <dir> [--org-config <file>] \
  [--fields subject] [--show-samples] \
  [--bundle-table <file>] [--reading-table <file>] [--vendor-table <file>]

node cli.mjs save-rule --code <CODE> --draft <file> \
  --workspaces-root <dir> --workmeta-root <dir> --by <actor> --note <text> \
  [--allowed-actors a,b,c]
```

`--fields` (K1, coordinator fresh review round 3, settling round 2's D-b) accepts only
`subject` or omitted -- step 1 matches the subject only, full stop, forever. `--fields
all` is GONE; passing it is a usage error (exit 2) -- see "부록 A round 3" below for the
full behaviour change.

`--bundle-table`/`--reading-table` (부록 A1) opt `refresh`'s own project attribution
into the common pipeline's Owner tables (steps 2-3); `--vendor-table` (부록 A round 2,
D-a) additionally enables step 4 (a supplier-type vendor mail whose body contains
exactly one project's exact keyword). All three omitted: each falls back to
`orgConfig.common_ledgers.owner_tables.{bundle,reading,vendor}` (S-b, coordinator fresh
review round 3) -- an org config with none of that configured either reads no table at
all, matching is subject-only step 1 alone. `--allow-degraded-owner-tables` opts
into writing anyway when one of those tables is malformed (default: the whole run
fails closed, receipt only -- see "Owner tables" below). S3 (fresh review round 4): an
org-config-resolved table path naming a file that does not exist is itself a failure
(distinct from "no table configured"); an explicitly passed `--bundle-table`/etc. path
that is missing keeps the original skip behaviour.

`--allowed-actors` (N16) further restricts `--by` to that exact list, on top of the
always-applied machine-actor refusal -- e.g. a console pinning saves to `--by owner
--allowed-actors owner`. Omitted (the default), any non-machine actor string is
accepted, as before.

`--allow-empty P00-001,P00-002` explicitly permits `refresh` to rebuild just those
projects' ledgers down to zero rows when custody genuinely produced none for them;
omitted (the default, an empty list), 0 fresh rows where a project's existing ledger
had content fails closed instead of silently emptying it, for every project (see
"Empty refreshes" above). A valueless `--allow-empty` (no list after it) is a usage
error (S-5, fresh-review-4), not a silent no-op; every code in the list must be a real,
currently-onboarded project.

`--allow-partial-sources` lets `refresh` proceed on whatever custody was readable when
one or more custody directories could not be read at all; omitted (the default), any
unreadable directory blocks every write for the whole run (see "Unreadable custody
directories (pre-write gate)" above).

`--org-config` on `preview-rule` (optional) resolves `system_sender_domains` the same
way a real `refresh` against that config would; omitted, only the built-in default
skip list applies.

`--show-samples` also prints `previewRule`'s `samples` (real mail subjects, up to 10
per category); omitted (the default), `preview-rule` prints counts only.
`previewRule` the library function always returns `samples` -- the console UI needs
it -- but it is private data and the CLI does not print it unless asked.
`preview-rule` separately prints a `workspace_ledgers_preview_rule_partial_rule_failures`
notice to stderr (counts/codes only, never term labels) whenever `result.rule_failures`
is non-empty -- another project's rule failed to compile and was excluded from this
comparison (fresh-review-5 #7).

Exit codes: `0` success, `2` usage/config error (bad flags, unreadable/invalid input
that never reached a write) **or** `refresh` completing with `status: 'failed'` for any
reason (R4 ledger validation, an unreadable custody directory, or a bad saved rule --
the CLI prints a message naming which one(s) applied (S-6, fresh-review-4), including
an `--allow-partial-sources` hint specifically when the cause is unreadable custody;
fresh-review-5: there is no cumulative match budget or per-mail match timeout any more
to be a cause), `3` runtime failure (lock held, write failure, or a rule store error
reached after the arguments were valid).

## Common-folder (P00-000) classification and the triage API (Step 1)

Spec: a private handoff spec (not in this repo), sections 1-7. This is the org-wide
counterpart to the per-project pipeline above: `refresh()` writes each onboarded
project's four ledgers; `refreshCommon()` (`src/common_refresh.mjs`) writes everything
that does NOT resolve to exactly one project.

**Custody sources read.** Unlike the private scratch-script reference (which built the
common-folder ledgers from the company-inbox/hiworks custody only), this path reads
BOTH `hiworksDirs` and `gmailSentDirs` -- the same two sources `refresh()`'s
per-project pipeline already reads -- via `common_events.mjs`'s `loadRawMailRecords`.
This is intentional (a sent mail can equally be a system notification reply, an
internal-admin mail, etc.), but it means a raw real-plane parity comparison against
ledgers the scratch script generated will run over a larger custody window than that
script ever saw; a difference in `system`/`unclassified`/total counts from that alone
is expected, not a classification defect (see the parity table in this module's own
CHANGELOG entries for a worked example).

**Classification order** (`src/common_classifier.mjs`'s `classifyProjectHits`, spec
section 1): (1) a project's own title rule (two projects' exact triggers on one
subject means held, never automatic attribution -- reuses `classifier.mjs`'s
`classifyMail` directly, restricted to `fields: ['subject']`); (2) an Owner-confirmed
conversation-bundle table (`묶음_확정표.csv`, may name several projects at once,
공유); (3) a reading-decision table (`판독_결정표.csv`, keyed by mail source id --
`include`/`include_with_review` attribute, `vendor_only`/`exclude`/`hold_owner_review`
do not); (4) for a supplier-type vendor only (never a customer/agency/school --
`거래처_대응표.csv`'s `구분` column), exactly one project's exact term in the mail
BODY; (5) otherwise undetermined (미정).

**Primary-bucket resolution** (`resolvePrimaryBucket`, spec section 3) then places any
mail that did not resolve to a project into exactly one of: 시스템 알림 (per-source
file), 광고 (excluded, no file), 사내행정 (자사 도메인 발신만) / 외부안내,
과제외_\<분류\>, 과제코드대기, 과제없음_확인함, 일반업무 (separate
`general_work_일반업무` folder, `일반업무_메일.csv`), 거래처만 (an EXPLICIT Owner/reader
`vendor_only` reading decision -- no dedicated file, represented only in that vendor's
secondary ledger), **organisation_undecided** (coordinator correction, 2026-09-21: a
mail that touches a KNOWN organisation -- matched against `거래처_대응표.csv` -- but has
no project, is not held, and has no reading decision AT ALL is already "filed" under
that organisation, not truly unclassified; same no-file/secondary-ledger-only
destination as 거래처만, but distinct in the receipt -- 과제 cell always `미정`, 과제근거
cell always the fixed `거래처(자동)`, never `classifyProjectHits`'s own `basis`), or
미분류 (truly no signal at all, including no known organisation). A held mail (step 1's
two-project collision) gets its own `보류.csv` -- a deliberate addition over the private
scratch-script reference (which wrote held mail nowhere), so "sum of every primary
bucket's count == deduped mail count" is a provable invariant, not merely true by
omission. Every organisation-specific pattern behind this (system-sender
domains/subjects, ad domains, agency-notice domains, internal-admin/out-of-project/
code-pending subject patterns, the common/general-work folder names) comes from the
org config's `common_ledgers` block (`buildCommonConfig`) -- never hardcoded; see
`examples/org_config.example.json`. The real custody directory-overlap guard
`refresh()`'s per-project pipeline runs (`--hiworks-events`/`--gmail-sent-events`
pointing at the same real directory, compared by `fs.realpathSync.native()`) is reused
as-is here too, via `refresh.mjs`'s exported `assertNoOverlappingCustodyDirs`.

Vendor (`거래처_<이름>.csv`) and work-tag (`작업_<태그>.csv`, from `[태그]` literally
in the subject, matched against `작업태그_목록.csv`) ledgers are secondary VIEWS,
independent of a mail's primary bucket -- the same mail can appear in one primary
ledger and any number of vendor/work-tag views at once (spec section 3). Every
common-folder ledger (primary or secondary) gets the exact same Owner-column-preserve/
fail-closed-validate/create-only-history-archive/atomic-write contract the four
per-project ledgers get, via `refresh.mjs`'s exported `writeLedgerCsv` -- the preserved
column is always `메모` (the last column of every common-ledger header shape,
`src/common_ledgers.mjs`'s `memoIndexFor`).

**Thread-vendor inheritance** (`classifyAllCommonMail`, spec section 2:
"같은 대화(정규화 제목)의 다른 메일에 거래처가 있으면 사내 전달·수신확인도 그
거래처로 본다"): a mail's vendor match is normally address-based (`거래처_대응표.csv`
against from/to/cc), but an internal forward or read-receipt in the same
normalised-subject thread as a mail that DOES have a direct vendor-address match no
longer carries that address itself -- it inherits the thread's vendors for OUTER
bucket routing (`vendor_only`/`organisation_undecided` resolution, and the vendor
secondary-view assignment) only, appending `(같은 대화의 거래처)` to `basis`; it never
re-runs `classifyProjectHits`'s own step 1-5 project attribution, which already used
the mail's own direct vendors when it ran (step 4's supplier-body confirmation is
unaffected). Caught by the 2026-09-21 real-plane parity check: without this, `모듈
vendor_only` undercounted the real plane by exactly the number of thread-forwarded
mails with no vendor address of their own.

**Owner tables** (`src/owner_tables.mjs`) are read-only from this module's side (the
one exception: `판독_결정표.csv`, which `triage.mjs`'s `appendReadingDecision` appends
to one row at a time). A table that is missing or has zero data rows is skipped (that
classification step simply contributes nothing); a table with a wrong header or
CP949/EUC-KR-as-UTF-8 mojibake (`U+FFFD`) fails closed for THAT table only (recorded in
`loadOwnerTables`'s `failures`), never aborting classification for every other table or
every other mail.

**The triage ("판독") API** (`src/triage.mjs`, spec section 7): `listUnclassified`
returns a read-only preview of the 미분류 bucket (mail source id, received date,
subject, from/to names, attachment names, a signature/quote-stripped body preview
bounded in length, which bucket every other mail in the same normalised-subject thread
ended up in, and any matched vendor) for a loopback AI reader (맥락이) or a human to
read before deciding. Default list is truly unclassified mail only; `{
includeOrganisationUndecided: true }` (`--include-organisation-undecided` on the CLI)
also pulls in `organisation_undecided` mail -- a different, opt-in sweep for a reader
specifically going through organisation-filed mail to assign a project, not the
default "mail with no home at all yet" triage. Each returned item carries `bucket`
(`'unclassified'` or `'organisation_undecided'`) so a caller can tell them apart.
`appendReadingDecision` validates `level` (one of `include` /
`include_with_review` / `exclude` / `vendor_only` / `hold_owner_review`), that an
`include*` target names only real, currently-onboarded project codes, that an `exclude`
target is one of the fixed routing tokens `resolvePrimaryBucket` itself recognises,
and that `why`/`reader` are non-empty -- then refuses a mail id that already has a row
(correcting one is a person editing the CSV by hand, never this API) and always writes
`Owner확인` empty (this API can never fill it). Locking reuses `refresh.mjs`'s own
refresh lock (`acquireRefreshLock`/`releaseRefreshLock`, scoped to `workspacesRoot`),
so a triage decision, a per-project `refresh()`, and a `refreshCommon()` can never run
concurrently and race on the same tables/ledgers.

**CLI additions**: `node cli.mjs common-refresh --workspaces-root <dir>
--workmeta-root <dir> --hiworks-events <dir> --gmail-sent-events <dir> --org-config
<file> [--bundle-table <file>] [--vendor-table <file>] [--reading-table <file>]
[--work-tag-table <file>] [--dry] [--allow-empty file1,file2]
[--allow-partial-sources] [--allow-degraded-owner-tables] --receipts <dir>`;
`node cli.mjs parity --workspaces-root <dir> --hiworks-events <dir>
--gmail-sent-events <dir> --org-config <file> [tables...]` (read-only: the module's own
per-primary-bucket dry-run counts vs. the row counts of whichever real ledger CSVs
already exist on disk, numbers only); `node cli.mjs triage list [--limit N] [--json]
[--include-organisation-undecided]` and `node cli.mjs triage decide --id <id> --level
<level> [--target <codes-or-token>] --why <text> --reader <name>` (`triage list`'s
default output carries subject/names -- stdout only, never written to a receipts/log
file).

`거래처_대응표.csv`'s columns are `도메인`, `거래처명`, `구분`, `메모` (`도메인` may hold
either a bare domain or a full address, spec section 2's own description of that one
column -- not a longer header text; corrected 2026-09-21 after the first Step 1 commit
used the spec's descriptive wording as if it were the header itself).

Step 2 (lane spec, scheduled-task registration, runbook) and Step 3's Hermes
tool-wiring (`context-read` lane's tool bundle, bot instructions) are untouched per the
spec's own phasing -- this module exposes the triage API's library/CLI surface only.

### Fresh non-author review fixes (2026-09-21, after the first Step 1 commit)

A separate reviewer (not the original author) found five REQUIRED and seven SHOULD
issues in commit `500d678c`; all are fixed here, each with its own regression test.

**R1 -- `organisation_undecided` no longer swallows an unresolved reading decision.**
`resolvePrimaryBucket` used to gate this bucket on `projectResult.vendors.length > 0`
alone. A mail with `reading.level === 'hold_owner_review'` (genuinely awaiting a
decision), an `include`/`include_with_review` row naming an unknown project code, or an
`exclude` row whose target matched none of the routing prefixes, all reach this point
still carrying `projectResult.reading` -- and, if the mail also touched a known
organisation, used to vanish from the triage queue (`listUnclassified`'s default view
never returns `organisation_undecided`). Now gated on `!projectResult.reading &&
projectResult.vendors.length > 0` -- any mail with an unresolved reading decision stays
`unclassified` regardless of organisation match, while still showing up in that
organisation's own secondary ledger (computed independently of the primary bucket).

**R2 -- ledger file names are sanitised before use.** A `거래처_<이름>.csv`/
`작업_<태그>.csv`/`과제외_<분류>.csv` file name embeds Owner-typed text (a vendor name,
a work tag, a reading-table target's free-text tail) with no prior sanitisation --
`src/common_ledgers.mjs`'s `isSafeFileName` now rejects (never "fixes up") a name
containing `\ / : * ? " < > |` or a control byte, `.`/`..` as the whole name, a trailing
dot/space, a Windows reserved device stem, or an overlong name; `resolveSafePath`
independently asserts the resolved CSV/lineage path is still under its intended base
directory (`path.relative` never starts with `..`) as defense in depth. A rejected name
is recorded in the receipt's `rejected_files` by a short hash only, never the name
itself (private, Owner-typed data).

**R3 -- case-insensitive file-name collisions fail closed.** Two organisation/tag
names differing only by letter case (`ABC` vs `abc`) build two different-looking file
names that are the SAME file on a case-insensitive filesystem (Windows) -- detected
across the whole grouped-by-file-name map before anything is written; every colliding
name is rejected (neither privileged over the other), named in the receipt by hash.

**R4 -- a malformed Owner table blocks every common-folder ledger write.**
`loadOwnerTables` substitutes an empty table on a bad header/encoding/row-shape, which
degrades classification silently -- mail that used to route through that table lands in
a DIFFERENT bucket's file, while the table's own ledgers go stale, so the same mail ends
up recorded in two ledgers on disk at once, with the receipt still saying `status:
'ok'`. `refreshCommon` now writes NOTHING for the whole run when `ownerTableFailures`
is non-empty (receipt only, `status: 'failed'`, the failing table(s) named), unless the
caller passes `allowDegradedOwnerTables: true` to opt back into the old behaviour
explicitly. Project ledgers produced by `refresh()`'s own pipeline are a separate code
path, never affected by this gate.

**R5 -- partial-custody gate, mirroring `refresh()`.** `refreshCommon` had no
`allowPartialSources` gate at all -- an unreadable custody directory silently wrote
whatever partial custody it DID read as if it were complete, and never passed a
"partial sources actually in effect" boolean into `writeLedgerCsv`, so its shrink
guard could never activate for common ledgers. Now: an unreadable custody directory
blocks every write (receipt only, `status: 'failed'`) unless `allowPartialSources:
true` is passed, in which case `partialSourcesInEffect` (`unreadableDirs.length > 0 &&
allowPartialSources`) is threaded into every `writeLedgerCsv` call.

**S1 -- unknown targets are counted, and a bundle row needs ALL codes known.** A
묶음_확정표 row naming even one unknown project code alongside known ones used to
silently attribute the known subset; now the whole row does not match (falls through
to step 3), and `receipt.unknown_targets.{bundle,reading}` counts how often this (and
an `include`/`include_with_review` reading row naming an unknown code) happened.

**S2 -- an explicit reading decision wins over system/ads pattern buckets.**
`detectSystemSource`/`isAds` used to be checked before the reading-decision cascade, so
an Owner's explicit `vendor_only`/`exclude` decision on a specific mail could be
silently overridden by a general pattern match. Reordered so any reading decision other
than `hold_owner_review` (which is explicitly "no decision yet") resolves first;
`receipt.decision_overrode_pattern` counts how often a decision that DID win would
otherwise have matched a pattern bucket too.

**S3 -- `vendor_only` with no matched organisation is visible, not a dead end.** Such
a mail can never route to `vendor_only` (there is no ledger to put it in) and stays
`unclassified` -- counted in `receipt.vendor_only_without_organisation`, and flagged
per-item in `listUnclassified`'s `already_decided_invalid: 'vendor_only_without_
organisation'` so a reader knows NOT to call `appendReadingDecision` again for it (it
will only fail as a duplicate) -- the existing row needs a person to edit it by hand.

**S4 -- thread-vendor inheritance requires a real signal, not just a shared subject.**
A generic, commonly-reused subject used to inherit an unrelated organisation from any
other mail that merely normalised to the same words. A candidate now only donates its
vendors when it ALSO shares at least one participant address with the inheriting mail,
or was received within 30 days of it; the inherited row's `basis` still carries
`(같은 대화의 거래처)`.

**S5 -- `body_preview` never returns empty when content exists.** The signature cut
used to search the whole flattened (newline-joined) text for a courtesy phrase --
"감사합니다" appearing near the very START of a short reply could discard all of it. Now
line-based: only the trailing 40% of the (quote-header-stripped) lines are searched,
the cut always lands on a whole line, and a cut that would leave nothing keeps the full
line set instead.

**S6 -- `reader` is length-capped** the same way `why`/`target` already are
(`workspace_ledgers_triage_reader_too_long`).

**S7 -- org-config regex patterns get the same safety checks as rule terms.** A
`system_notification_sources[].subject_patterns`/`ads_subject_patterns`/labeled-pattern
entry used to compile with a bare `new RegExp(pattern, 'iu')` -- no nested-quantifier/
backreference/lookbehind/alternation-count check, no ReDoS timing canary, unlike every
rule term this codebase otherwise compiles. `buildCommonConfig` now runs each pattern
through `classifier.mjs`'s `compileTerm` (as a `kind: 'regex'` term, `timeSafety: true`)
and throws `OrgConfigPatternError`/`workspace_ledgers_org_config_pattern_invalid`,
naming only the config key (e.g. `common_ledgers.ads_subject_patterns[2]`, never the
pattern text) before any classification or write happens.

**N1 -- `parity` now also compares the `project` bucket** (summed from every onboarded
project's own 메일_수신이력.csv + 메일_발송이력.csv row counts) -- previously only five
of the twelve primary buckets were checked.

**N2 -- the refresh-lock-held condition raises one code everywhere.**
`triage.mjs`'s `appendReadingDecision` used to raise `workspace_ledgers_lock_held` for
the exact same underlying lock `refresh.mjs`/`common_refresh.mjs` raise
`workspace_ledgers_refresh_lock_held` for -- unified on the latter.

**N3 -- the quote-header line filter only strips header-SHAPED lines.** It used to drop
any line merely STARTING with a common header word (`제목`, `날짜`, `From`, ...) even in
ordinary prose with no colon following; now requires a colon (half- or full-width)
immediately after the label (or a literal `>`/dash-or-equals fence), matching only
actual mail-client-generated header lines.

## 부록 A (2026-09-21 night addition) -- project ledgers also attribute via the tables

Spec: the same handoff file's own "부록 A" section (A1-A3; A4 lists what this round did
NOT do -- no real-plane writes, no lane/scheduled-task work, no Hermes wiring, no index
linking, no work/to-do ledger population).

**A1 -- `refresh()`'s project ledgers now also attribute via the bundle/reading
tables.** Previously `refresh()` attributed mail to a project's four ledgers using only
that project's own saved subject/body/attachment rule (`src/mail_events.mjs`'s
`loadMailEvents`); the common-folder pipeline's own classification
(`classifyProjectHits`, steps 1-5) already went further -- an Owner-confirmed bundle
table row (step 2) or a reading-decision table row (step 3) could also attribute a
mail to a project, so the real per-project ledgers (once regenerated for real) and the
common pipeline's own "project" bucket count were never the same population. Steps 2-3
are now factored into their own function, `src/common_classifier.mjs`'s
`classifyByOwnerTables` (also used by `classifyProjectHits` itself, so there is still
only one place the classification order is defined), and `refresh()` calls it for any
event its own subject-rule classification left with zero hits and no hold -- a bundle/
reading decision can never override a subject-rule hit or a two-project hold either
way. A table hit can name more than one project at once (공유); the mail lands in every
named project's ledgers, not just the first.

`refresh()` gains three new, independently-defaulted optional params --
`bundleTablePath`/`readingTablePath` (both `null`, meaning "read no table, exactly
today's behaviour") and `allowDegradedOwnerTables` (default `false`) -- so an existing
caller (the console/UI adapter) that never passes them keeps byte-identical results;
proved by `tests/refresh.test.mjs`'s own regression test that runs the same fixture
both with the params omitted and with them pointing at files that do not exist, and
diffs both the receipt and every written ledger's bytes. A malformed table (bad header/
encoding/row-shape) blocks the WHOLE run (receipt only, `status: 'failed'`,
`owner_table_failures` named) unless `allowDegradedOwnerTables: true` is passed --
mirroring `refreshCommon`'s own R4 gate, for the same reason: a silent degrade would
lose the table-attributed mail from every project's ledgers, not merely leave them
stale. The receipt also gains `table_attributed_mails` (how many mails this run
attributed via a table, not a rule) and `search_eligible_attributions` (A2 item 5,
below).

`previewRule` keeps comparing the draft rule's own subject-rule effect only (unchanged);
it gains an optional `table_attributed` count in its return, computed only when the
caller supplies `bundleTablePath`/`readingTablePath` -- the return object gains no new
key otherwise, so an existing caller keeps a byte-identical result too.

`cli.mjs`'s `parity` command's `project` row now compares like-with-like populations: a
mail shared across two projects (공유) is one row in EACH of those projects' own
`메일_수신이력.csv`/`메일_발송이력.csv` (a real, distinct row per project), while the
module's per-mail `bucketTally.project` counts that same mail once. `classifyAllCommonMail`
now also returns `projectAttributionRows` (the row-sum equivalent -- summed
`outcome.projectCodes.length` over every mail resolving to `project`), and `parity` uses
that, not `bucketTally.project`, for this one bucket's `module` figure. `refresh --bundle-
table`/`--reading-table`/`--allow-degraded-owner-tables` and `preview-rule --bundle-
table`/`--reading-table` are new CLI flags exposing the same params.

**A2 -- Owner-table/classification changes from the same night.**

1. `묶음_확정표.csv`'s real 5th column, `적용끝` (YYYY-MM-DD, may be blank), scopes a
   bundle confirmation to mail received ON OR BEFORE that date (Owner: the same title
   phrase/vendor may take on unrelated work later; a bundle is one episode's mail set,
   not a standing rule) -- compared as a Seoul calendar date
   (`ledgers.mjs`'s `seoulDateOf`) against the mail's own receipt instant, not the
   private scratch reference's raw UTC date slice (a deliberate, spec-silent choice,
   consistent with every other display date this module already computes in Seoul
   time). `owner_tables.mjs`'s `readOwnerTable` now accepts either a single expected
   header array (every other table, unchanged) or an array of them (the bundle table
   only) -- tried in order, so a file written under the current 5-column shape and one
   still under the legacy 4-column shape (no `적용끝` column at all, meaning "applies
   indefinitely") both load.
2. Renamed: the bucket/file previously named "과제없음"/`과제없음_확인함.csv`
   ("confirmed no project") now means "read, but which project is still unknown"
   (과제미정 / `판독_과제미정.csv`) -- a genuinely confirmed "no project" is expressed
   via an `일반업무`/`과제외:...` reading target instead (unchanged). The OLD target
   token `과제없음` is still read the exact same (new) way, so an existing row keeps
   working; `resolvePrimaryBucket` accepts both tokens. `classifyAllCommonMail` (and
   `refreshCommon`'s receipt) gain three triage-progress counts, independent of the
   primary-bucket tally: `unreadCount`/`unread_count` (no 판독_결정표 row at all),
   `readUndeterminedCount`/`read_undetermined_count` (`hold_owner_review`, or the
   renamed 과제미정 bucket), `noProjectConfirmedCount`/`no_project_confirmed_count` (an
   `exclude` reading decision that positively routed to 일반업무/과제외).
3. `일반업무:<세부>` exclude targets (e.g. `일반업무:제품지원 <제품>`) already worked --
   `resolveReadingDecision` split the detail after the first `:` before this round;
   regression-tested here, not newly built.
4. `triage.mjs`'s `appendReadingDecision` gains an optional `humanActors` (array of
   reader names/ids considered human, default `null` = no restriction, unchanged for an
   existing caller): a `level: 'include'` from a `reader` NOT on that list is refused
   (`workspace_ledgers_triage_include_requires_human_reader`), pointing the caller at
   `include_with_review` instead -- an AI reader's (맥락이's) positive attribution must
   start one notch weaker than an Owner-confirmed one. `cli.mjs triage decide` gains
   `--human-actors a,b,c`.
5. `project_search_eligible_attributions`/`common_search_eligible_attributions`
   (`refresh()`'s and `refreshCommon()`'s receipts respectively -- renamed, S3 below, to
   two distinct fields since they count different, overlapping populations): a mail
   whose attribution is solid enough to use as RAG/search evidence -- an approved
   subject-rule hit, an approved bundle-table hit, or ANY reading decision whose own
   `Owner확인` cell is filled in (an Owner-confirmed exclusion is just as usable as
   evidence a mail does NOT belong to a project as an included one is that it does).
   Index/search wiring itself is still out of scope (A4) -- this is a count only.

**A3 (deferred, not implemented).** Carrying a vendor-name memo cell forward by mail ID
across a case/normalisation-only rename is left for a later round, per the spec's own
"미뤄 둔 것".

## 부록 A round 2 (fresh review, coordinator) -- one classifier, one custody loader

A separate coordinator review of the round above (b585a6e6) found the "one
classification, two writers" architecture was still, in practice, two SEPARATE
classifiers: `refresh()` matched a project's own rule directly via
`mail_events.mjs`'s `loadMailEvents` (step 1 only, body/attachment included by
default), while the common pipeline ran the full `classifyProjectHits` (steps 1-5,
subject-only step 1) on a DIFFERENT custody loader with a DIFFERENT (simpler)
synthetic-id recipe. This round unifies both all the way down, per four coordinator
design decisions (D-a through D-d, none re-litigated here):

**D-a -- one function, one custody loader.** `refresh()`'s own project-ledger
attribution now calls `common_classifier.mjs`'s `classifyProjectHits` (steps 1-5)
directly, per mail, on custody read through `common_events.mjs`'s `loadRawMailRecords`
-- the exact same loader `refreshCommon()`/`triage.mjs` already read through. A mail
that resolves via step 4 (see D-b) now genuinely lands in a project's ledgers via
`refresh()` too, with 적용규칙 `본문: <keyword>` -- previously step 4 only ever
mattered for the common pipeline's own classification, never for the real project
CSVs. `refresh()` gains a new optional `vendorTablePath` param (default `null` -- step
4 never fires without it, matching the "omit everything, get yesterday's behaviour"
philosophy the rest of this module already follows) so step 4 can actually attribute
anything once a vendor table is supplied.

**D-b -- step 1 is subject-only by DEFAULT now (a real, caller-visible behaviour
change).** `classifier.mjs` gains `DEFAULT_MATCH_FIELDS = ['subject']`, and this is now
the default wherever a "which fields does step 1 consult" default was previously
`MATCH_FIELDS` (subject + body_text + attachment_names): a rule document's own
`match_fields` (`compileRule`), `classifyMail`/`hintCodes`'s `fields` param,
`classifyProjectHits`'s new `fields` param, `refresh()`'s own `fields` param,
`previewRule`'s `fields` param, and `cli.mjs`'s `--fields`. Step 4 (a supplier-type
vendor mail's body) is completely unaffected by this default -- D-b's own point is that
body matching belongs ONLY there, never as an ordinary step-1 signal (addresses, people
and equipment names never decide a project on their own -- the Owner-approved
production behaviour). **Anything relying on the OLD default (a rule with no explicit
`match_fields`, or a caller never passing `fields`, matching on body/attachment text)
matches FEWER mails at step 1 after this change** -- there is no way to widen it back
(see K1 immediately below: a rule's own `match_fields` stays schema-valid but is never
consulted for step-1 placement any more, so declaring one does not restore the old
matching).
>
> **K1 (coordinator, fresh review round 3 -- settles this section's own original
> wording, and R1): there is no "pass `fields: MATCH_FIELDS` to widen it back" any
> more.** Step 1 matches the SUBJECT ONLY, full stop, forever -- `fields` is accepted
> by `classifyProjectHits`/`refresh()`/`previewRule()`/`cli.mjs`'s `--fields` only for
> backward compatibility, and THROWS `workspace_ledgers_fields_not_supported`
> (`classifier.mjs`'s `assertSubjectOnlyFields`) if it is anything other than exactly
> `['subject']` (`DEFAULT_MATCH_FIELDS`, value-checked, not by reference). `--fields
> all` is GONE from the CLI -- passing it is now a usage error (exit 2), not a widening
> option. A rule's own `match_fields` stays schema-valid (existing saved rules on the
> private plane keep carrying it) but is documented, not enforced, as NOT consulted for
> ledger placement any more; a caller must not add `match_fields: ['subject',
> 'body_text']` expecting it to matter. The merged console panel adapter
> (`mail-rule-adapter.mjs`) already passes `fields: ['subject']` explicitly on every
> `previewRule`/`refresh` call -- that keeps working unchanged. Receipts never echo a
> `fields` list that was not actually applied (there is only ever one: subject-only).
> Tests: `tests/classifier.test.mjs` (`assertSubjectOnlyFields`/`isSubjectOnlyFields`
> unit coverage), `tests/common_classifier.test.mjs` and
> `tests/classification_partition.test.mjs`'s own M1 (a rule with `body_text` in its
> own `match_fields`, keyword only in the body -- never a step-1 hit, in BOTH
> pipelines), `tests/cli.test.mjs` (`--fields all` is a usage error).

**D-c -- one custody loader, one id recipe.** `mail_events.mjs`'s id-derivation/dedup/
collision-suffix logic is factored into two exported, reusable pieces
(`collectCandidatesFromDirs`, `dedupeAndAssignIds`); `common_events.mjs`'s
`loadRawMailRecords` now calls them too, instead of its own simpler (no id-collision
disambiguation) recipe. A no-`event_id` mail's synthetic id is now IDENTICAL whichever
path derives it -- concretely, a reading-table row an AI/human reader writes from
`triage list`'s own output (which goes through `loadRawMailRecords`) is now guaranteed
findable by `refresh()`'s own classification pass (which reads through the very same
loader). `refresh.mjs`'s own cross-source id-collision disambiguation
(`disambiguateCrossSourceIds`) is exported and now also run by `common_refresh.mjs`'s
`classifyAllCommonMail` (it had none before this round).

**D-d -- one merged system-sender check, consulted only AFTER classification.**
`refresh()` used to pre-filter system-sender/`[Plaud-AutoFlow]`-subject mail out of its
OWN custody read entirely (via `mail_events.mjs`'s `loadMailEvents`), before that mail
ever had a chance to match a rule or table -- the common pipeline never had this
pre-filter (`detectSystemSource` only ever ran AFTER `classifyProjectHits`, on mail
classification left unresolved). `refresh()`'s new classification loop matches this:
every custody record is offered to `classifyProjectHits` first (steps 1-3 can rescue
even a system-sender mail via an explicit title/bundle/reading decision), and only a
record classification left with zero hits and no hold is THEN checked against the
merged system-sender list (`common_classifier.mjs`'s new `buildSystemSenderConfig`/
`detectSystemSender`, which folds BOTH existing org-config keys --
`common_ledgers.system_notification_sources` and the legacy `system_sender_domains` --
into one list; a legacy-only match routes to the generic `기타알림` bucket) for
`refresh()`'s own `skipped_system` receipt count. **Caller-visible consequence:** a
system-sender-domain mail whose SUBJECT happens to also match a project's exact rule
term now attributes to that project instead of being silently dropped as noise --
this was already true for the common pipeline; it is new for `refresh()`.

**D-e -- proof.** `tests/classification_partition.test.mjs` runs both `refresh()` and
`refreshCommon()` over one mixed synthetic fixture and asserts, for every classified
mail, that project-ledger membership (read back from the real written CSVs) exactly
matches the common pipeline's own classification -- never a project ledger AND a
common bucket for the same mail. Covers the reviewer's three named cases directly: a
body-only keyword with no vendor address never attributes (M1); a no-`event_id` mail's
reading-table row (keyed by the id the common pipeline itself discovered) is found by
`refresh()` too (M2); a system-sender-domain mail with an Owner-confirmed reading
decision still attributes (M3).

### R2/R3 -- two lookups that still named the pre-rename bucket

- **R2.** `common_ledgers.mjs`'s `ADMIN_SHAPED_FILES` still listed the OLD file name
  (`과제없음_확인함.csv`) after A2 item 2's rename to `판독_과제미정.csv` -- the renamed
  bucket silently lost its 세부분류 column AND the reader's own 이유 text (fell back to
  the base, non-admin header shape). Fixed; `tests/common_ledgers.test.mjs` regression-
  tests both the header shape and that `detail` survives into the row.
- **R3.** `cli.mjs`'s `parity` command's `no_code_confirmed` row still read the OLD file
  name too. Now reads `판독_과제미정.csv` first, falling back to the OLD name only when
  the new one is not present at all (an unmigrated real plane). The comparison KEY
  stays `no_code_confirmed` -- it is the exact `PRIMARY_BUCKETS`/`bucketTally`
  identifier the comparison's own `module` figure is looked up by, and that identifier
  was never renamed (only the on-disk FILE name changed in A2) -- so there is no
  separate "old key" needing an alias; `cli.mjs` carries an explicit comment recording
  this so a future reader does not go looking for one.

### SHOULD items

- **S1.** `common_ledgers.ads_sender_domains` already existed (tests, example config)
  before this round -- a real parity diff on `ads`/`unclassified` can also come from a
  junk sender-domain list present only in the private scratch-script reference; the fix
  for that is org-config DATA (adding domains to `ads_sender_domains`), never code.
- **S2.** `unreadCount` used to read `!projectResult.reading`, which
  `classifyProjectHits` only ever populates once classification reaches step 3 -- a
  rule-attributed or held mail's early return never looks the mail up in the reading
  table at all, so it counted as "미판독" even when a reading-table row genuinely
  existed for that mail id. Fixed to check the reading table directly
  (`owner.readings.has(mail.event_id)`), independent of how (or whether)
  `classifyProjectHits` actually used that row. Regression test in
  `tests/common_refresh.test.mjs`.
- **S3.** `search_eligible_attributions` was one name for two different (overlapping)
  populations -- renamed to `project_search_eligible_attributions` (`refresh()`) and
  `common_search_eligible_attributions` (`refreshCommon()`), each documented not to be
  summed with the other. Neither ever double-counts a shared (공유) mail -- both
  increment at most once per mail, before any per-project fan-out.
- **S4.** `적용끝` must be `^\d{4}-\d{2}-\d{2}$` AND a real calendar date (`2026-02-30`
  is shape-valid but not real) -- `owner_tables.mjs`'s new `isValidCalendarDateString`;
  a malformed cell fails the WHOLE bundle table closed
  (`workspace_ledgers_owner_table_bundle_apply_until_invalid`), the same as a header/
  encoding/row-shape problem, never silently ignored per-row. Tight boundary test at
  the Seoul-calendar cutoff (`2026-09-15T14:59:59Z` vs `...T15:00:00Z`).
- **S5.** An unrecognised 결정 token (S9, previous round) used to fall through
  `alreadyDecidedInvalidReason` silently -- `triage list`/`listUnclassified` now flags
  it `already_decided_invalid: 'invalid_decision_level'`, so a reader knows the
  EXISTING row (not this API) needs a person to fix by hand, instead of dead-ending on
  a generic duplicate-id refusal with no explanation.
- **S6.** `listUnclassified`/`triage list` now REFUSE (throw
  `workspace_ledgers_triage_owner_table_failures`, CLI: non-zero exit, a clear stderr
  reason plus the `--allow-degraded-owner-tables` hint) when `ownerTableFailures` is
  non-empty, unless `allowDegradedOwnerTables: true` is passed explicitly -- handing a
  reader a WRONG list computed against a known-broken table is worse than refusing
  outright. `owner_table_failures` is always present on the return object either way.
- **S7.** Reader identity in `appendReadingDecision`'s `reader`/`humanActors` gate (A2
  item 4) is entirely CALLER-ASSERTED -- this module has no way to verify who is
  actually calling it. `humanActors` must be pinned by the lane wrapper/CLI invocation
  (a fixed, Owner-controlled list baked into how the loopback lane invokes this API),
  never derived from anything the model itself claims to be. The REAL gate against a
  wrong attribution reaching search/RAG evidence is the `Owner확인` cell
  (`project_search_eligible_attributions`/`common_search_eligible_attributions` only
  count a reading decision once THAT cell is filled) -- `humanActors`/`include` vs
  `include_with_review` is a labelling convention on top, not the actual trust
  boundary. Separately: this module writes `판독_결정표.csv` via a create-only history
  archive plus atomic rename, but does not itself coordinate with a person who has the
  same file open in Excel at the moment of write -- an Owner editing the table by hand
  while a `triage decide` call (or a scheduled refresh) writes to it can lose whichever
  side saves last; the lock (`acquireRefreshLock`) only ever serialises this module's
  OWN callers against each other, never against Excel.
- **S8.** A plane still carrying the pre-rename file (`과제없음_확인함.csv`, from before
  A2 item 2) now gets `refreshCommon`'s receipt field `legacy_bucket_file_present:
  true` -- a migration SIGNAL only; this module never reads, writes or deletes that
  file. **Migration note for an Owner/coordinator cutover:** once satisfied the renamed
  file (`판독_과제미정.csv`) has fully taken over, the old file may be moved aside by
  hand (or left in place, harmless but stale) -- this module will never do it
  automatically.
- **S9.** Two previously-uncovered fail-closed paths gained direct tests:
  `owner_tables.mjs`'s `workspace_ledgers_owner_table_row_shape` (an unquoted embedded
  comma in a hand-edited data row, producing more fields than the header) in
  `tests/owner_tables.test.mjs`; `refreshCommon`'s folder-name pre-write gate
  (`resolveSafePath(workspacesRoot, folderName)`/`resolveSafePath(workmetaRoot,
  folderName)`, right before the write loop) is defense-in-depth ONLY -- every folder
  name that could reach it already passed `buildCommonConfig`'s own `isSafeFileName`
  check at config-build time (which throws first, before `refreshCommon` even gets a
  classification pass back), so no org-config-reachable input independently exercises
  this second gate; `resolveSafePath`'s own containment invariant is already covered
  directly in `tests/common_ledgers.test.mjs`.

### Nits

- `appendReadingDecision` gains optional `receivedAt`/`subject` params (both default
  `''`, matching the previous always-empty behaviour) to fill 수신일/제목 from the mail
  actually being decided -- `cli.mjs triage decide` gains `--received-at`/`--subject`.
  Private-plane usage only; every test fixture in this repo stays synthetic.
- README/CLI usage block: `--bundle-table`/`--reading-table`/`--vendor-table`/
  `--allow-degraded-owner-tables` documented above.
- The stale README line citing the private spec under `docs/architecture/...` (it was
  never actually there -- a placeholder path) now reads "a private handoff spec (not in
  this repo)".

### Every behaviour change a caller could notice (for the console/UI adapter branch)

1. **D-b/K1, the big one:** `refresh()`/`previewRule()`/`classifyProjectHits` step 1
   matches SUBJECT ONLY, full stop -- there is no widening mode any more. `fields` is
   accepted only for backward compatibility and must be exactly `['subject']`
   (`DEFAULT_MATCH_FIELDS`), or it THROWS `workspace_ledgers_fields_not_supported`; CLI
   `--fields all` is a usage error (exit 2), not a widening option. A caller must pass
   `fields: ['subject']` (or omit it) everywhere; a rule's own `match_fields` stays
   schema-valid but is never consulted for step 1 placement.
2. `refresh()` gains a new optional `vendorTablePath` param and now runs step 4 when
   it is supplied -- a supplier-vendor body-keyword mail can now land in a project's
   ledgers via `refresh()` (previously only the common pipeline's own classification
   ever saw this).
3. `refresh()`'s `skipped_system` count now only counts mail classification left fully
   unresolved AND system-sender -- a system-sender mail rescued by its own subject rule
   or an explicit table/reading decision no longer counts there (D-d).
4. `refresh()`'s receipt field `search_eligible_attributions` is renamed to
   `project_search_eligible_attributions`; `refreshCommon()`'s is renamed to
   `common_search_eligible_attributions` (S3) -- a caller reading either by the old
   name will see `undefined`.
5. `refreshCommon()`'s receipt gains `legacy_bucket_file_present` (S8) and
   `id_collisions_kept` (new, mirrors `refresh()`'s own field); `listUnclassified`'s
   return gains `owner_table_failures` and can now THROW where it previously always
   returned (S6) -- a caller not passing `allowDegradedOwnerTables` must handle that.
6. `triage.mjs`'s `already_decided_invalid` can now also be `'invalid_decision_level'`
   (S5) -- a caller switching on the previous fixed set of values should add this case.
7. `cli.mjs`'s `--fields` (omitted) now maps to subject-only, not the full enum (D-b);
   `parity`'s `no_code_confirmed` row now reads the current file name first (R3).
8. **K2 (round 3):** `previewRule`'s `matched_before`/`matched_after` NEVER exclude a
   system-sender mail any more (they read custody through the exact same loader/window
   `refresh()` does, with no system-sender pre-filter) -- a caller relying on the old
   round-2 behaviour (a system-sender mail silently subtracted from the count once
   `orgConfigPath` recognised it) will see a HIGHER `matched_before`/`matched_after` than
   before for the same fixture. The new `matched_from_system_senders` field reports that
   population separately instead.
9. **D-a/round 3:** `previewRule`'s `table_attributed` field is REMOVED. A bundle-/
   reading-table hit is now baked directly into `matched_before`/`matched_after` (both
   `previewRule` and `refresh()` run the exact one `classifyProjectHits` order,
   D-a) -- a caller reading `result.table_attributed` will see `undefined` where it used
   to see a number (possibly `0`, which was itself distinguishable from "omitted"
   before; that distinction is gone along with the field).
10. **S-b (round 3):** `refresh()`'s and `refreshCommon()`'s receipts gain
    `owner_tables_used` (`[{ table, file, sha256 }]`, `table` one of `'bundle'`/
    `'reading'`/`'vendor'`, `file` a basename only) -- and both now fall back to
    `orgConfig.common_ledgers.owner_tables.{bundle,reading,vendor}` when the
    corresponding `bundleTablePath`/`readingTablePath`/`vendorTablePath` param is
    omitted, where they previously read NO table at all in that case. A caller that
    relied on "omitted means no table read" for an org config that now (or already)
    declares `common_ledgers.owner_tables` will see table attribution start happening
    where it did not before -- see the magnitude note in the round-3 section below.
11. **S-c (round 3):** two new top-level org-config keys change what
    `refresh()`'s/`refreshCommon()`'s/`previewRule()`'s system-sender accounting
    considers a system sender: `system_sender_exclude_domains` (array, opts specific
    domains OUT of the built-in list) and `system_sender_builtin: false` (drops the
    built-in list entirely). Neither is set by default, so an org config that does not
    use them sees no behaviour change.

## 부록 A round 3 (fresh review, coordinator) -- K1/K2, one Owner-table place, system-sender opt-outs

A third fresh review of round 2's commit (c618fd0a) found two REQUIRED fixes (K1, K2 --
both covered by their own subsections inline above/below) plus five SHOULD items and
three nits, all on the same "one classification, one custody window" architecture round
2 already established. Nothing here re-opens D-a/D-c/D-e.

See **D-b** above for K1's own full text (step 1 is subject-only, full stop -- `fields`
only for backward compatibility, throws otherwise) and **D-d** above (this file's
"Common-folder (P00-000) classification" section) for where the system-sender check
sits in the classification order -- K2 changes what `previewRule` reports about it,
never when it runs.

**K2 -- `previewRule` reads custody through the SAME loader/window as `refresh()`, no
system-sender/skip-subject pre-filter, ever.** Previously (round 2), `previewRule`
still built its comparison off `mail_events.mjs`'s `loadMailEvents`, which applies its
own system-sender/skip-subject pre-filter BEFORE classification -- so a system-sender
mail matching the draft's own rule could be silently absent from `matched_before`/
`matched_after`, even though a real `refresh()` (D-d, round 2: classification runs
BEFORE the system-sender check) would still have written it. `previewRule` now shares
`refresh.mjs`'s own `cachedLoadRecords` (raw, rule-independent custody records, cached
by directory signature -- the S10 cache's underlying key changed shape but the cache
itself still works the same way for a caller) and runs `classifyProjectHits` directly,
identically to `refresh()`'s own loop. Two direct consequences:

- `matched_before`/`matched_after` now NEVER exclude a system-sender mail -- they
  always equal what the next `refresh()` would actually write (K2's own explicit
  mandate). A held mail (two-project collision) is correctly excluded from both (K2
  is also why: `classifyProjectHits` returns `hits: []` while held, so a mail moving
  into or out of a hold is `newly_held`/no-longer-held, never a `matched_before`/
  `matched_after` swing by itself).
- `previewRule`'s return gains `matched_from_system_senders` -- of the mails counted in
  `matched_after`, how many came from a sender `buildSystemSenderConfig` (the same
  merged list D-d built) recognises, purely for the Owner's own visibility. It is
  informational only; nothing is ever subtracted because of it.

`previewRule` also gains the same `orgConfigPath`-driven Owner-table fallback S-b
describes below (previously it only accepted explicit `bundleTablePath`/
`readingTablePath`; `vendorTablePath` is new both as an explicit param and via the
org-config fallback). `cli.mjs preview-rule` gains `--vendor-table` to match.

### SHOULD items

- **S-a.** `tests/classification_partition.test.mjs`'s own D-e fixture now also passes
  `vendorTablePath` to its `refresh()` call (previously only `refreshCommon()`/
  `classifyAllCommonMail()` got it -- an easy mismatch to reproduce for real, see the
  hard operating rule in S-b below) and adds a supplier-type vendor mail
  (`m-supplier-body`) whose body contains exactly one project's exact keyword with no
  subject/bundle signal at all -- asserts it lands in that project's REAL, WRITTEN
  ledger via `refresh()` (not just the common pipeline's in-memory classification), is
  never also found in another project's ledger, and that the written row's own
  `적용규칙` cell starts with `본문:` (step 4's own basis label).
- **S-b.** ONE place for the Owner-table paths: `orgConfig.common_ledgers.owner_tables
  { bundle, reading, vendor }` (each a path, relative to `workspacesRoot` or absolute on
  the private plane -- `examples/org_config.example.json` shows the shape with
  placeholders only; `owner_tables.mjs`'s new `resolveOwnerTablePaths`). `refresh()`,
  `refreshCommon()`/`classifyAllCommonMail()`, and `previewRule()` ALL consult this when
  the corresponding `bundleTablePath`/`readingTablePath`/`vendorTablePath` param is
  omitted; an explicit param always wins outright (never merged field-by-field with the
  config). `workTagTablePath` stays explicit-only (out of this resolver's scope -- only
  `refreshCommon`/`triage list` ever read the work-tag table at all). Both `refresh()`'s
  and `refreshCommon()`'s receipts gain `owner_tables_used` (`[{ table, file, sha256 }]`
  for every table actually read this run -- `file` a basename only, never a host path).
  **Hard operating rule:** `refresh`/`common-refresh` (and `parity`/`triage list`) MUST
  run against the SAME resolved table set for the same custody window -- overriding one
  command's tables with an explicit flag while leaving the other on the org-config
  default (or vice versa) classifies the exact same mail differently in the two
  writers, breaking the D-e partition invariant. This resolver cannot enforce that by
  itself; it only makes "the same org config, the same explicit overrides" the natural
  way to get it right. `cli.mjs`'s own usage-comment header states this rule too.
- **S-c.** The built-in system vendor-domain list (`mail_events.mjs`'s
  `DEFAULT_SYSTEM_SENDER_DOMAINS`, previously baked directly into a single fixed regex)
  now decides a common-folder bucket the same way it always decided `refresh()`'s own
  `skipped_system` count (D-d) -- and an org config can now opt out of it, two ways:
  `system_sender_exclude_domains` (array) removes specific domains from the BUILT-IN
  list only (the org's own `system_sender_domains` additions are never filtered by
  this -- re-adding an excluded domain there wins, not a silent no-op); `system_sender_
  builtin: false` drops the built-in list entirely. Neither is set by default. Tests:
  `tests/mail_events.test.mjs` (`systemSenderPatternsFromConfig`, unit-level, both
  knobs and their interaction) and `tests/refresh.test.mjs` (end-to-end via `refresh()`
  and `receipt.skipped_system`).
- **S-d.** CHANGELOG entry added at the top for this round (see `CHANGELOG.md`).
- **S-e.** **Magnitude note for an operator's first run after this round.** D-d
  (round 2) already removed `refresh()`'s own system-sender/skip-subject PRE-filter --
  mail that used to never reach classification at all now does, and S-b's org-config
  Owner-table fallback means a table that was previously only read when a flag was
  passed explicitly may now be read by default. On the reference plane, this combination
  moved on the order of a THOUSAND previously-skipped mails into classification, with a
  few dozen of those newly becoming project-ledger rows (the rest resolved to a common-
  folder bucket, same as before, just now via classification instead of a pre-filter).
  **Before the first real (non-`--dry`) `refresh`/`common-refresh` run after upgrading
  past this round, run `parity` and a `--dry refresh` first** and read the diff before
  committing to a real write.

### Nits

- `common_ledgers.mjs`'s own module header comment still named the pre-rename bucket
  file (`과제없음_확인함.csv`) as if it were current -- `ADMIN_SHAPED_FILES` itself
  already had the renamed name (fixed in round 2's R2); only the prose comment above it
  had not caught up. Fixed.
- **`DEFAULT_SKIP_SUBJECT_PATTERNS` (the `[Plaud-AutoFlow]` subject skip) no longer
  applies on `refresh()`'s own classification path.** This is an intentional
  consequence of D-a/D-d (round 2), not restored: `refresh()` no longer reads through
  `mail_events.mjs`'s `loadMailEvents` at all (that function is kept only as a public,
  back-compat export -- see its own module header), so nothing on `refresh()`'s path
  ever consulted `DEFAULT_SKIP_SUBJECT_PATTERNS` to begin with once D-a/D-c landed; this
  round's audit just confirms and documents that, rather than treating it as a gap to
  patch. A `[Plaud-AutoFlow]`-subject mail from `plaud.ai` is still recognised as a
  system sender via `DEFAULT_SYSTEM_SENDER_DOMAINS` (`plaud.ai` is one of the built-in
  domains) regardless -- the skip-subject pattern was always a narrower, redundant
  second signal for that same sender, never the only one.
- `refresh.mjs`'s `readAllRuleJsonSafely` and `common_refresh.mjs`'s own
  `readAllRulesSafely` were near-identical twins (both read every onboarded project's
  saved rule individually, isolating a bad one per S-8) -- confirmed a safe mechanical
  merge (no caller distinguished the two return shapes beyond what the richer one
  already provides) and extracted to the one, now-exported `readAllRuleJsonSafely`
  (`refresh.mjs`), which `common_refresh.mjs` now calls too. `classifyAllCommonMail`'s
  own `ruleFailures` gains `term_ref` as a result (previously `refresh()`-only) -- a
  strict superset, no existing field removed.

## 부록 A round 4 (fresh review, coordinator) -- doc sync, rule-vs-table split, one Owner-table place hardening

A fourth fresh review of round 3's commit (bd3676d5) verified K1/K2/S-a..S-e correct by
independent probe, the exported surface intact, and the merge with origin/main clean
(console panel + CI wiring pulled in, one CHANGELOG conflict). It found four REQUIRED
doc/behaviour gaps (R1-R4), two SHOULD items (S1, S3 -- S4 was already covered by R3),
and three nits, all narrow.

**R1 -- `src/index.mjs`'s own doc comment still described the ROUND-2 contract
(`fields: MATCH_FIELDS` to widen step 1 back), which K1 (round 3) made throw.** A
caller following that comment literally could still reach `classifyMail`/`hintCodes`
(the low-level match primitive `classifyProjectHits` is itself built from) with a
wider `fields` list and get body/attachment matching through the public surface --
those two functions carry no subject-only assertion of their own; they are step 4's
own internal primitive, never a step-1 entry point. Rewritten to K1's real contract
throughout; `assertSubjectOnlyFields`/`isSubjectOnlyFields`/`FIELDS_NOT_SUPPORTED_CODE`
are now re-exported so a caller building a new entry point can enforce the same
constraint itself. `classifyAllCommonMail`/`refreshCommon` now also assert subject-only
UP FRONT (before any rule/table read, not only implicitly the first time
`classifyProjectHits` is reached inside the per-record loop -- which would never even
fire for a zero-record custody window). Tests: `tests/index.test.mjs` (new -- pins the
re-exported surface), `tests/common_refresh.test.mjs` (zero-record custody + a bad
`fields` value still throws).

**R2 -- `src/index.mjs` still documented `previewRule` returning `table_attributed`,**
removed in round 3's D-a/K2. Synced with the real return shape (see R4 immediately
below for what that shape now is).

**R3 -- README's CLI section still advertised `--fields subject|all`** in both command
synopses, an opt-in sentence for `--fields all`, and a leftover action item telling
rule authors to "declare `match_fields` explicitly" as if that still widened step 1 (it
does not, per K1). All three fixed; the `preview-rule` synopsis also gained
`--vendor-table` (previously undocumented there, even though `previewRule` already
accepted it after round 3's K2 rewrite).

**R4 (coordinator decision) -- `saveRuleVersion` rendered `previewRule`'s
`matched_after` into the rule's own `.md` as a single "확정 N건", but since D-a (round
2) that number always included Owner-table and step-4 attributions folded into the ONE
classification function's output -- a rule matching exactly 1 mail with a bundle table
holding 2 more rendered "확정 3건", with no way for the Owner to see that trimming the
rule's own term to nothing would not actually change what gets written (the table
still holds those 2).** `previewRule` now returns BOTH views, never conflated:
`rule_matched_before`/`rule_matched_after` (this rule's OWN subject terms alone --
step 1 run with every Owner table emptied out, but every other onboarded project's
rule still in play for hold-detection) and the existing `matched_before`/
`matched_after` (what `refresh()` will actually write, every step), plus
`table_attributed_after` (`= matched_after - rule_matched_after`, clamped at 0) and the
existing `matched_from_system_senders` (K2). `moved_in`/`moved_out`/`newly_held` keep
describing what `refresh()` will write, unchanged. `table_attributed` (the round-3
field) is gone -- replaced by the split above. `rule_store.mjs`'s `renderMeasuredLine`
now writes the rule's own evidence first and the table-derived total second: `- 실측:
이 규칙 제목어로 확정 1건, 표·판독·본문으로 추가 2건(합계 3건), 새로 매칭 0건, 매칭
해제 0건, 새로 보류 0건 (측정 <date>).` -- falling back to the single pre-R4 "확정
N건" phrasing only when `measured` predates this round entirely (an older synthetic
fixture, neither split field present at all). The console panel
(`operations-mail-rules.tsx`) shows "이 규칙으로"/"표·판독으로 추가" as separate rows
next to "지금"/"바뀌면", and a "그중 시스템발신" line for `matched_from_system_senders`
(S2). Tests: `tests/refresh.test.mjs` (the coordinator's own fixture -- rule matches 1,
table adds 2 -> `rule_matched_after: 1`, `matched_after: 3`,
`table_attributed_after: 2`; removing the rule's only term -> `rule_matched_after: 0`
while `matched_after` stays at 2), `tests/rule_store.test.mjs` (the rendered line,
verbatim).

### SHOULD items

- **S1.** `owner_table_failures` now gets the exact same caveat treatment
  `rule_failures` already had, in both `renderMeasuredLine` (a second, independent "
  주의: Owner 표 N개가 이번 실측에서 로드 실패해 제외됨..." sentence, combinable with
  the rule-failures caveat) and the panel (a matching `cx-notice` line) -- a
  measurement taken while an Owner table failed to load is incomplete for the exact
  same reason an excluded project's rule is.
- **S3.** An `orgConfig.common_ledgers.owner_tables` entry naming a file that does not
  exist no longer looks identical to "no table configured": when the path was resolved
  from ORG CONFIG (not an explicit `bundleTablePath`/`readingTablePath`/
  `vendorTablePath` argument), a missing/unreadable file lands in `owner_table_
  failures` as `workspace_ledgers_owner_table_configured_but_missing` (fail closed,
  same as any other table failure) instead of the silent "absent, skip" `{present:
  false}`. An EXPLICITLY passed path that is missing keeps the original skip behaviour
  -- already documented (see "Refresh semantics" above, the byte-identical-results
  regression test). `owner_tables.mjs`'s `resolveOwnerTablePaths` return gains
  `configuredPaths: { bundle, reading, vendor }` (booleans) so `loadOwnerTables` knows,
  per table, which case applies. Tests: `tests/owner_tables.test.mjs` (unit),
  `tests/refresh.test.mjs` (end to end via `refresh()`).
- **S4.** Covered by R3 above (`--vendor-table` added to the `preview-rule` synopsis).

### Nits

- `owner_tables.mjs`: a RELATIVE `orgConfig.common_ledgers.owner_tables.*` value must
  resolve INSIDE `workspacesRoot` -- `resolveOwnerTablePaths` now rejects an escaping
  value (`"../../escape"`) with `workspace_ledgers_owner_table_config_path_escape`
  (a new `OwnerTableConfigError`, exported) rather than silently reading outside the
  intended tree. An ABSOLUTE value is unaffected (still allowed, as already
  documented -- the private plane's real table paths are absolute). `workspacesRoot`
  itself missing/blank with a relative value throws
  `workspace_ledgers_owner_table_config_workspaces_root_required`, a clear module
  error code, never a raw `TypeError` from `path.join(undefined, ...)`.
- `mail-rule-adapter.mjs`'s `preview()` already passed `orgConfigPath` whenever it was
  configured (no change needed there); when it is NOT configured, the response used to
  carry an adapter-invented `tables_used: []`. Superseded in round 5 by `previewRule`
  itself reporting `owner_tables_used` (see "부록 A round 5" below) -- the adapter now
  passes the core's own field straight through instead.
- The K2 test (`previewRule (fresh-review-3 #6)` in `tests/refresh.test.mjs`) used to
  only probe `previewRule`'s own in-memory counts -- now also runs a real `refresh()`
  against the exact same custody/rule/org config, decodes project A's actual
  `메일_수신이력.csv`/`메일_발송이력.csv` bytes on disk (via the module's own
  `decodeCsv`), and asserts their combined row count equals `previewRule`'s own
  `matched_after` -- not merely the receipt's own in-memory `mails` count (round 5,
  coordinator: the receipt figure alone is computed by the same code path being
  tested, so it was not independent proof; both assertions are kept).

## 부록 A round 5 (fresh review, coordinator) -- merge-ready, K2 test made real, SHOULD/nits

A fifth fresh review of round 4's commit (ed6776e9) found every round-4 item verified
correct (R4's own semantics checked hard), no Linux-only hazard, and clean hygiene --
MERGE-READY with one cheap REQUIRED, three SHOULD, and five nits.

**REQUIRED -- the K2 test's own claim was not yet true.** README and the round-4
CHANGELOG entry both said the K2 test "asserts the written project ledger's row count
equals `previewRule`'s `matched_after`", but the test itself only asserted
`receipt.projects[].mails` -- the RECEIPT's own in-memory figure, computed by the same
code path under test, never independent proof. Fixed: the test now decodes project A's
actual `메일_수신이력.csv`/`메일_발송이력.csv` bytes on disk (via `decodeCsv`) and sums
their real row counts, asserting that combined figure equals `matched_after` -- the
receipt-level assertion is kept alongside it, not replaced.

### SHOULD items

- Dropped the redundant third classification pass `previewRule` ran just to compute
  `rule_matched_after` (a whole second `classifyProjectHits` sweep with every Owner
  table emptied out). `common_classifier.mjs` now exports `STEP1_TITLE_BASIS` (`'제목'`)
  -- the exact `basis` value `classifyProjectHits` sets ONLY for a genuine step-1
  title-rule hit, never for a bundle/reading/body attribution. `rule_matched_after` is
  now computed the same way `rule_matched_before` already was: `afterHit && afterR.basis
  === STEP1_TITLE_BASIS`, off the SAME with-tables classification pass `matched_after`
  itself uses -- correct because step 1 always runs first and, once it resolves a mail
  (one hit, no hold), no later step is ever reached, so a step-1-basis hit under the
  with-tables pass is exactly the same mail a no-tables pass would have found. Every
  other literal `'제목'` basis comparison in `common_refresh.mjs`/`refresh.mjs` now uses
  the same exported constant instead of re-typing the string (the fragility the
  reviewer named).
- `rule_matched_before` is now pinned with a real assertion in the R4 test (it was
  computed and returned correctly all along, just never checked directly).
- `cli.mjs`'s `preview-rule` now prints the same class of stderr caveat for
  `owner_table_failures` that it already printed for `rule_failures`
  (`workspace_ledgers_preview_rule_partial_owner_table_failures`, counts/codes only,
  never a table's own content).

### Nits

- Panel label corrected to `표·판독·본문으로 추가` (matching the `.md` line exactly --
  step 4's own supplier-body attributions are included in `table_attributed_after`
  too, not just bundle/reading).
- The adapter-invented `tables_used` field is gone. `previewRule` itself now returns
  `owner_tables_used` (`[{ table, file, sha256 }]`, same shape/no-host-path convention
  as `refresh()`'s own field of the same name -- it already resolves the tables via
  `resolveOwnerTablePaths` internally, S-b) -- empty whenever no table was actually
  read, covering BOTH "no `orgConfigPath` at all" and "an org config exists but
  declares no `owner_tables` entries" in one check. `mail-rule-adapter.mjs`'s
  `preview()` passes the core's own field straight through; the panel renders "표
  미적용" whenever it is empty.
- README's "Performance" section still described the pre-K1 world ("in practice once
  [lowercase-cache population] total, since every rule declares the same three
  fields") -- fixed: under K1 there are exactly two `match_fields` combinations ever in
  play across a sweep (`['subject']` for step 1, `['body_text']` for step 4), not one.
- `owner_tables.mjs`'s `readOwnerTable` and `rule_store.mjs`'s `listProjects` now treat
  `ENOTDIR` the same as `ENOENT` when deciding "missing" -- a path whose PARENT segment
  is a regular file (not a directory) reports `ENOTDIR` on Linux but `ENOENT` on
  Windows for the exact same misconfiguration; both platforms now report the same
  module code. Tests assert the library's own resulting behaviour only, never the raw
  errno, so they pass identically on both platforms without needing to reproduce the
  platform-specific error code itself.
- Added a test for the 0-additions rendering of the measured line (a rule matching
  entirely on its own, `table_attributed_after: 0`) -- confirms the line still reads
  "...표·판독·본문으로 추가 0건(합계 N건)..." explicitly rather than omitting the
  clause when there is nothing to add.

## Byte hygiene (tracked source, not data)

`tests/byte_hygiene.test.mjs` walks every file directly under this module's own
directory -- tracked **or** untracked (fresh-review-5 #1: `git ls-files` alone misses
a file added but never staged/committed) -- for stray control bytes (anything below
`0x20` other than tab/LF/CR) and for a small set of invisible codepoints (U+200B
zero-width space, U+FEFF BOM, U+200C/U+200D joiners, U+2060 word joiner). A raw NUL
byte in a source file makes git treat that whole file as binary -- `git show --stat`
prints "Bin", `git diff` prints "Binary files differ", and grep-family tools return
nothing from it at all (fresh-review-4 R-1: this happened to `src/classifier.mjs`'s
`CANARY_MISMATCH_CANDIDATES` array, introduced by an editing tool turning what was
meant to be a JS-level `String.fromCharCode(...)` call into an actual control byte). A
stray zero-width space is quieter -- invisible in an editor and in a diff -- but still
a real byte in the tracked file (`src/mail_events.mjs` carried one in a comment).
Neither class of problem is data this module ever handles; both are purely accidents
in the source itself, so the test scans source files, not custody or ledger content.

Every needle this test searches for is built with `String.fromCharCode(...)`, never
typed as a literal character in the test's own source (fresh-review-5 #1: the first
version of this test embedded a literal U+200B as its own search needle, which is
itself exactly the class of bug it exists to catch, and made the test fail on itself).
`src/ledgers.mjs`'s two intentional CSV-BOM spots (`encodeCsv`/`decodeCsv`) are
likewise built from `String.fromCharCode(0xFEFF)` rather than a raw BOM character in
source, so the scan needs no allow-list for them at all -- there is genuinely nothing
for it to find there.

## 매일 갱신 lane (daily refresh)

`ops/daily_refresh.mjs` is the unattended daily runner: `refresh()` for every
onboarded project, then `refreshCommon()` for the common-folder ledgers, both from
ONE org config file. It is a thin caller of the two library functions above -- it
adds no classification logic of its own, only ordering (refresh first, common
second, second skipped when the first failed closed), a combined receipt, and its
own daily lock. See the file's own header comment for the full design rationale;
this section is the operating summary.

**Hard operating rule, enforced by construction.** Neither call is ever given an
explicit `--bundle-table`/`--reading-table`/`--vendor-table` override -- both fall
back to reading the SAME `--org-config` file's own `common_ledgers.owner_tables`
block (see "부록 A round 3"/S-b above). Because the daily runner deliberately has no
CLI flag that could override either call's table paths independently, `refresh` and
`refreshCommon` structurally cannot classify the same custody window under two
different table sets -- the divergence the README's "Owner tables" section warns
against cannot happen through this entry point at all. `allowDegradedOwnerTables` is
never passed (never `true`) to either call; a malformed Owner table fails the whole
day's run closed. The same org-config file is also re-hashed against the pinned
`--org-config-sha256` immediately after each step returns (not merely once, up
front) -- a caller (or an Owner) editing the file mid-run is caught and fails the
run closed (`workspace_ledgers_daily_org_config_changed_during_run`, exit 2) rather
than letting the two steps silently classify against two different versions of it.

**The daily lock.** `daily_refresh.lock` in `--receipts` (not a dot-file -- a plain,
visible name) serialises two invocations of THIS runner against the same receipts
directory; a stale one (its recorded start older than the runner's own threshold, or
a future-dated one from clock skew) is reclaimed and the reclaim is recorded in the
combined receipt's `lock` block. Reclaiming renames the stale lock to a dot-file
sibling (`.daily_refresh.lock.stale-<uuid>`) first and only writes a fresh lock once
that rename succeeded, then cleans the renamed-away file up (recursively -- a stale
lock can itself be a directory); any such sibling a PRIOR run failed to clean up (a
crash mid-cleanup, say) is swept the same way on the next acquire, once it is itself
past the same staleness threshold, so a leak self-heals rather than accumulating
forever. This is one layer among several, not the only thing preventing overlap: the
registrar's own `IgnoreNew` multiple-instances policy on the scheduled task, and
`refresh()`/`refreshCommon()`'s own separate internal lock at `workspacesRoot`'s
root, both also apply independently.

**Where the private org config lives.** `<control_root>/workspace-ledgers/
org_config.private.json` -- never committed, never referenced by a real path in this
repo. `examples/org_config.example.json` shows the shape with placeholders only.

**Build the lane.**
```
node guild_hall/deployment_pack/tools/build_source_lane.mjs \
  --spec guild_hall/deployment_pack/lanes/workspace_ledgers_lane.spec.json \
  --out <lane_root> --repo <this checkout>
node guild_hall/deployment_pack/tools/build_source_lane.mjs --verify <lane_root>
```
`tracked_paths` carries `guild_hall/workspace_ledgers/` wholesale (its whole import
closure is internal to the module -- every relative import in `src/`, `ops/` and
`cli.mjs` resolves to another file inside the module itself; the only imports outside
that are `node:` builtins), excluding `tests/`. There is no `carried_forward_prefixes`
entry -- nothing here needs `node_modules` or any other untracked closure.

**Get the dry-run digest, then register.**
```
powershell -File guild_hall/workspace_ledgers/ops/register-workspace-ledgers-task.ps1 `
  -LaneRoot <lane_root> -LaneManifestSha256 sha256:<...> `
  -NodePath <node.exe> -NodeSha256 sha256:<...> `
  -WorkspacesRoot <target _workspaces> -WorkmetaRoot <target _workmeta> `
  -OrgConfigPath <control_root>/workspace-ledgers/org_config.private.json -OrgConfigSha256 sha256:<...> `
  -HiworksEventsPath <hiworks custody dir> -GmailSentEventsPath <gmail-sent custody dir> `
  -ReceiptsRoot <receipts dir>
# prints: workspace ledgers daily task dry-run attested: plan_digest=<digest> ...

powershell -File guild_hall/workspace_ledgers/ops/register-workspace-ledgers-task.ps1 `
  <same parameters as above> -Register -ExpectedDryRunDigest <digest from above>
```
Re-registering over an existing task additionally requires `-ExpectedExistingTaskSha256`
(the current task file's own SHA-256, printed by the registrar's own error message
when omitted). The task name is fixed (`SoulforgeWorkspaceLedgers`); `-DailyAt`
defaults to `05:30` local -- after the 00:00-04:00 voice conversation-list lane and
before a 06:40 briefing lane.

**Roll back.** The registrar rolls back automatically on any registration failure
(restores the prior task XML, or removes the new task if there was none, verified by
re-export) -- no separate manual rollback step is needed for a failed `-Register`
call. To remove a successfully registered task by hand: `Unregister-ScheduledTask
-TaskName SoulforgeWorkspaceLedgers -Confirm:$false`.

**What the receipt means.** One `daily-<timestamp>[-failed].json` per run in
`--receipts`, schema `soulforge.workspace_ledgers_daily_receipt.v1`: `status` (`'ok'`
only when both steps report `status: 'ok'`), `lock` (whether a stale daily lock was
reclaimed this run), `warnings` (a plain array of fixed string codes, never a fact
that makes the run `'failed'` -- currently only `legacy_bucket_file_present`, the
common pass's pre-rename bucket file `과제없음_확인함.csv` still sitting on disk), and
`steps.refresh`/`steps.common_refresh` -- each `{ ran, status, ...counts }`, never a
subject, name, address or host path. `refresh`'s counts include
`ledger_failures_count` (that field genuinely exists on `refresh()`'s own receipt);
`common_refresh`'s counts do NOT -- `refreshCommon()`'s receipt has no
`ledger_failures` field at all, so its per-file failure signal is
`failed_files_count` (from `files[].failed`) and `rejected_files_count` (an unsafe or
colliding ledger NAME refused before it was ever written, a different failure class).
`common_refresh`'s `ran`/`reason` distinguish three situations, never collapsed into
one shape: `{ ran: false, status: null, reason: 'previous_step_failed_closed' }` --
the ORDINARY case, `refresh()` returned its own `status: 'failed'` receipt and
`refreshCommon()` was deliberately never called; `{ ran: true, status: 'failed',
reason: 'threw' }` -- it WAS attempted and threw before returning any receipt of its
own; `{ ran: false, status: null, reason: 'not_started' }` -- reached only from an
unexpected-error path, it never even got the chance to be attempted because
something else (`refresh()` itself throwing, or the org-config TOCTOU re-check after
step 1 failing) already stopped the run first. `refresh`'s own two possible shapes in
that same unexpected-error case mirror the last two of those (it is always at least
attempted, so it is never `reason: 'not_started'`).
Exit codes: `0` ok; `2` failed -- either step's own receipt reports `status:
'failed'` (unreadable custody, a bad saved rule, a malformed Owner table, or an R4
ledger-validation failure), the org config changed mid-run (the TOCTOU re-check
above), or a LIBRARY error code (not one of this runner's own) reached during either
step; `3` daily lock held, or an unexpected error acquiring/reclaiming it; `4`
refused before start -- ONLY this runner's own pre-lock validation codes ever map
here: a malformed/impossible-calendar-date/present-but-valueless `--now`, an
org-config digest mismatch, a missing `--workspaces-root`/`--workmeta-root`, or a
`--receipts` that could never actually be written to (it exists and is not a
directory, or its nearest existing ancestor is not a directory) -- checked write-free,
so `--dry` refuses on this too, rather than green-lighting a registration that could
never write a receipt.

**`--dry` writes nothing, deliberately more strictly than `refresh --dry`/
`common-refresh --dry`.** Those two still write their own audit-trail receipt file
even in dry mode (documented as intentional in their own doc comments); `ops/
daily_refresh.mjs --dry` is what a registrar preflight checks before it ever
registers anything, so it never calls `refresh()`/`refreshCommon()` at all -- it only
checks that every required argument is present and well-shaped (`--now` must be a
real, calendar-valid ISO-8601 instant, given a genuine value -- it reaches a receipt
filename and every lock-age computation on a real run), that the org-config digest
matches, that `--workspaces-root`/`--workmeta-root` exist, and that `--receipts`
could actually be written to (write-free: it must either already be a directory, or
not exist yet under an existing-directory ancestor), and reports (without acquiring,
reclaiming or releasing it) whether the daily lock currently looks held -- computed
the identical way a real run's own lock acquisition would, so an unreadable lock
file is never reported `held` here when a real run would in fact reclaim it. A
classifying dry run (would this rule compile, would this custody read) is `cli.mjs
refresh --dry` / `common-refresh --dry`, run by hand against the same inputs.

## 봇 판독 도구 (`ops/bot_triage.mjs`, `ops/bot-skill/`)

미분류 대기줄을 **로컬 챗봇**이 직접 처리할 수 있게 하는, 고정된 좁은 표면이다. `cli.mjs
triage list|decide`가 이미 있는데 따로 만든 이유는 하나다 -- 그 CLI는 `--reader`,
`--human-actors`, `--workspaces-root`, `--reading-table`을 **자유 인자**로 받고 다섯 판정
수준을 전부 허용한다. 그대로 모델에게 주면 모델이 자기가 누구인지, 어느 표에 쓰는지, 자기
귀속이 얼마나 강한지를 스스로 주장하게 된다. 이 모듈의 판독 API 문서가 말하는 "reader는
호출자가 주장하는 값이며 lane wrapper가 고정해야 한다"의 그 wrapper가 이 파일이다.

명령은 셋뿐이고, 정체·경로·한도는 **digest로 고정된 설정 파일 하나**에서만 온다.

| 명령 | 하는 일 | 쓰기 |
| --- | --- | --- |
| `list [--limit N]` | 미분류 대기줄 한 줄씩 (id·수신일·보낸이 이름+도메인·제목·첨부 이름·후보 과제·거래처) -- `후보`는 모듈이 이미 계산한 **검토용** 신호 둘(분류기의 `candidates`와 `hintCodes`)의 합집합이며 귀속이 아니다 | 영수증만 |
| `show --id <id> [--max-chars N]` | 그 메일의 머리와 본문(상한 있음) | 영수증만 |
| `decide --id <id> --level <판정> --target <값> --why "<이유>"` | `appendReadingDecision`으로 판독표에 **한 줄** | 판독표 한 줄 + 영수증 |

`correct`는 **없다.** Owner가 판정을 고치라고 하면 봇은 표를 다시 쓰지 않고, 적용할 줄을
그대로 답으로 돌려주고 아무것도 기록하지 않는다(`Owner확인` 칸과 모든 정정은 사람 전용).
`correct`를 부르면 그 이유를 적은 거부로 멈춘다.

### 울타리 (모델이 아니라 wrapper가 지킨다)

- **판독자 이름은 설정의 `reader_label` 고정.** 덮어쓸 flag가 없다 -- 명령마다 허용 flag
  목록이 닫혀 있어 `--reader`/`--human-actors`/`--workspaces-root` 같은 인자는 조용히
  무시되는 것이 아니라 **거부**된다(`..._unknown_flag`). `humanActors`도 설정 값 고정이다.
- **`include` 금지.** 이 wrapper가 쓰는 판정은 `include_with_review`·`exclude`·
  `vendor_only`·`hold_owner_review` 넷뿐이고, `include`는 전용 코드로 거부한다(라이브러리의
  `humanActors` 검사보다 한 걸음 앞에서, 권한 오류가 아니라 지시로 돌려주기 위해).
- **`--target`은 언제나 닫힌 목록에서 온다.** `include_with_review`는 현재 등재된 과제 코드
  **하나**(`A;B` 공유는 사람 몫이라 거부), `exclude`는 모듈 자신의 고정 분류 토큰
  (`triage.mjs`의 `EXCLUDE_FIXED_TARGETS`에서 그대로 읽어 오고, 옛 표기 `과제없음`은 새로
  쓰지 않으므로 메뉴에서 뺀다 -- `일반업무:<세부>` 같은 자유 문자열 접두 형식도 제외),
  `vendor_only`는 **그 메일에 이미 잡힌 거래처 이름**, `hold_owner_review`는 비우거나 실재
  과제 코드 하나.
- **`--why` 필수**, 한 줄, 200자 상한.
- **대기줄에 있는 메일만.** 이미 판정된 메일은 대기줄에 없으므로 재판정이 구조적으로 막힌다
  (라이브러리의 중복 거부에 닿기 전에 여기서 멈춘다). 이미 쓸 수 없는 판정줄이 있는 메일
  (`already_decided_invalid`)도 거부하고 사람에게 넘긴다.
- **하루 한도.** 설정의 `daily_decision_cap`을, 이 wrapper 자신의 영수증에서 서울 날짜로
  센다(성공한 기록만 센다 -- 거부가 예산을 깎으면 잘못된 반복 한 번으로 그날 하루가 막힌다).
- **Owner 표가 깨져 있으면 거부.** `allowDegradedOwnerTables`를 절대 넘기지 않으므로
  라이브러리의 `workspace_ledgers_triage_owner_table_failures`가 그대로 올라온다.
- **주소는 도메인까지만.** 출력 전체에 지역부(`@` 앞)를 지우는 한 번의 통과가 걸려 있어
  제목·첨부 이름·본문에 섞인 주소까지 같이 지워진다.

호출마다 작은 영수증 하나(`soulforge.workspace_ledgers_bot_triage_receipt.v1`)가
`receipts_dir`에 원자적으로 쓰인다. 담는 것은 명령·메일 id·판정·분류 어휘·결과 코드·계수뿐,
**제목·본문·주소·호스트 경로는 담지 않는다.** 자유 문자열일 수 있는 `vendor_only`의 target은
값 대신 짧은 해시로 남긴다. 끝값은 `0` 기록함, `2` 거부됨(울타리 또는 라이브러리 거부),
`4` 설정·digest 문제로 **시작도 못 함**(영수증조차 쓰지 않는다).

### 설정 스키마 `soulforge.workspace_ledgers_bot_triage_config.v1`

```json
{
  "schema_version": "soulforge.workspace_ledgers_bot_triage_config.v1",
  "workspaces_root": "<workspaces_root>",
  "org_config": "<control_root>/workspace-ledgers/org_config.json",
  "org_config_sha256": "sha256:<64자리>",
  "custody": {
    "hiworks_events": ["<control_root>/ingress/hiworks"],
    "gmail_sent_events": ["<control_root>/ingress/gmail_sent"]
  },
  "reading_table": null,
  "receipts_dir": "<control_root>/receipts/workspace-ledgers-bot-triage",
  "reader_label": "<bot_profile>",
  "human_actors": ["<owner_name>"],
  "daily_decision_cap": 20,
  "list_limit_cap": 10
}
```

- `org_config`는 `org_config_sha256`으로 고정된다 -- 어긋나면 끝값 4, 아무것도 안 쓴다.
- `reading_table`이 `null`이면 그 org config의 `common_ledgers.owner_tables.reading`에서
  푼다. 어느 쪽이든 **한 번만 풀어** 대기줄 읽기와 판독표 쓰기에 같은 경로를 쓴다 -- 목록을
  만든 표와 판정이 들어가는 표가 갈라지는 일이 없다(모듈의 "hard operating rule"을 이
  wrapper에 적용한 것).
- `reader_label`은 판독표의 `판독자` 칸에 그대로 들어가는 표시 이름이다.
- `list_limit_cap`은 `--limit`의 상한이다(요청이 더 커도 상한이 이긴다).

### lane v2 빌드

lane 명세는 `guild_hall/deployment_pack/lanes/workspace_ledgers_lane.spec.json`이고,
이번 변경으로 `workspace-ledgers-v2`가 됐다(v1의 네 진입점은 그대로, 여기에
`ops/bot_triage.mjs`·`ops/bot-skill/SKILL.md`·`ops/bot-skill/install_skill.mjs`가 더해졌다).
import closure는 다시 걸었다 -- 새 두 `.mjs`는 이 모듈 안(`src/*.mjs`)과 `node:` 기본
모듈만 읽으므로 `tracked_paths`는 그대로 모듈 통째다.

```
node guild_hall/deployment_pack/tools/build_source_lane.mjs --spec guild_hall/deployment_pack/lanes/workspace_ledgers_lane.spec.json --out <lane_root> --repo <repo_root>
node guild_hall/deployment_pack/tools/build_source_lane.mjs --verify <lane_root>
```

빌드는 **깨끗한 커밋**을 요구한다(`tests/daily_refresh_lane.test.mjs`의 마지막 시험이 같은
일을 자동으로 하고, 작업 트리가 더러우면 스스로 건너뛴다 -- 그 시험은 빌드한 lane에서
`bot_triage.mjs list`와 `decide` 한 번까지 합성 자료로 돌려 본다).

### 설치본 스킬 폴더 만들기

`ops/bot-skill/SKILL.md`는 **템플릿**이다. `<lane>`·`<config>`·`<config sha256>`·
`<guideline>` 자리표시자를 설치 시점에 채운다.

```
node <lane_root>/guild_hall/workspace_ledgers/ops/bot-skill/install_skill.mjs --lane <lane_root> --config <control_root>/workspace-ledgers/bot_triage.config.json --config-sha256 sha256:<64자리> --guideline <workspaces_root>/<공통폴더>/020_MGMT/021_자동화설정_운영규칙/메일_내용판독_분류지침.md --out <설치할 스킬 폴더> --receipt <control_root>/receipts/bot-skill-install.json
```

렌더는 (템플릿 바이트, 인자)만의 순수 함수다 -- 파일 안에 시각을 넣지 않으므로 같은 입력은
언제나 같은 바이트가 되고, 그래서 드리프트 점검이 정확한 바이트 비교로 가능하다.

```
node <lane_root>/guild_hall/workspace_ledgers/ops/bot-skill/install_skill.mjs --check --lane <lane_root> --config <설정 파일> --config-sha256 sha256:<64자리> --guideline <지침 문서> --out <설치된 스킬 폴더>
```

끝값은 `0` 같다, `3` 달라졌다(또는 설치본이 없다), `2` 인자·템플릿 문제다. 두 모드 다 쓴
것의 sha256을 JSON 영수증으로 찍는다.

**설치와 활성화는 이 변경 밖이다.** 렌더된 `SKILL.md`를 실제 봇 프로필(`<bot_profile>`)에
넣고 그 프로필에서 켜는 것, 설정 파일과 지침 문서를 실제 경로에 두는 것, 예약작업을 거는
것은 전부 **Owner의 행위**다. 이 변경은 어떤 것도 설치하지 않고 등록하지 않는다.

## Not yet wired (계획)

- Attribution into the project document/index store is **planned**, not implemented
  here. `ops/daily_refresh.mjs` above is the nightly automation chain for the ledger
  writers themselves; a project document/index adapter consuming those ledgers is a
  separate, still-future piece.
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
- `previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields?, orgConfigPath?, bundleTablePath?, readingTablePath?, vendorTablePath? })` -> `{ rule_matched_before, rule_matched_after, matched_before, matched_after, table_attributed_after, matched_from_system_senders, moved_in, moved_out, newly_held, duplicates_dropped, id_collisions_kept, samples, rule_failures, owner_table_failures, owner_tables_used }` (`samples` is private -- real mail subjects; the console UI needs it, but never print it in a log/report. `rule_failures`/`owner_table_failures` -- fresh-review-5 #7 / S1, fresh review round 4 -- list any OTHER project's rule, or any Owner table, excluded from this comparison because it failed to compile/load; either non-empty means these counts are incomplete, and should be rendered with a caveat, not as fact). `fields` is accepted only for backward compatibility and must be exactly `['subject']`/omitted -- K1, throws `workspace_ledgers_fields_not_supported` otherwise. `orgConfigPath` (optional) resolves the merged system-sender list the same way a real `refresh()` against that config would (K2: `matched_before`/`matched_after` are never reduced by this -- `matched_from_system_senders` reports that population separately). `bundleTablePath`/`readingTablePath`/`vendorTablePath` (all optional, all fall back to `orgConfig.common_ledgers.owner_tables` when omitted -- S-b, S3 for a config-resolved-but-missing path) fold table/step-4 attribution directly into `matched_before`/`matched_after` (D-a: one classification function). R4 (coordinator decision, fresh review round 4): `rule_matched_before`/`rule_matched_after` are step 1 ONLY (this rule's own subject terms, every Owner table emptied out); `table_attributed_after` (`= matched_after - rule_matched_after`, clamped at 0) is the portion of `matched_after` an Owner table or step 4 explains that the rule's own terms do not. There is no `table_attributed` field any more (replaced by this split). `owner_tables_used` (NIT, fresh review round 5) is `[{ table, file, sha256 }]` for every table THIS call actually read (empty whenever none was, whether none was configured at all, or an org config exists but declares no `owner_tables` entries) -- the console panel renders "표 미적용" whenever it is empty, reading this field directly rather than an adapter-invented one.
- `saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured?, allowedActors? })` -> `{ project_code, folder_name, previous_version, rule_version, json_path, md_path, history_json_path, history_md_path, sha256_json, sha256_md }`. `draft` (and `previewRule`'s `draft`) must be the **complete** rule document, never a partial patch -- see "Rule versioning and lineage" above.
- `refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath, projects?, fields?, dry?, receiptsDir, now?, allowEmpty?, allowPartialSources?, bundleTablePath?, readingTablePath?, vendorTablePath?, allowDegradedOwnerTables? })` -> the receipt body (`status: 'ok' | 'failed'`, `duplicates_dropped`, `id_collisions_kept`, `unreadable_dirs`, `allow_partial_sources_applied` (fresh-review-7 R3: true only when an unreadable dir actually put this run into a partial-sources state, not merely because the caller passed the flag), `allow_empty_applied_to`, `shrink_allowed_applied_to` (fresh-review-7 S1), `ledger_failures`, `rule_failures`, `owner_table_failures`, `owner_tables_used` (S-b: `[{ table, file, sha256 }]`), `table_attributed_mails`, `project_search_eligible_attributions`, per-ledger `collapsed_identical_rows`/`owner_cells_dropped_with_row`/`owner_cells_ambiguous` (fresh-review-7 R1/R2, contacts.csv only)). No `match_timeouts`/`match_run_budget_exceeded` any more -- removed along with the per-mail timeout machinery (see "Design simplification" above). `fields` is accepted only for backward compatibility and must be exactly `['subject']`/omitted -- K1. `allowEmpty` is a list of project codes (not a boolean, and every code must be a real onboarded project whose rule did not itself fail this run -- S-5/S-8); `allowPartialSources` (default `false`) opts into writing on partially-readable custody -- see "Refresh semantics" above. `bundleTablePath`/`readingTablePath`/`vendorTablePath` (all optional) fall back to `orgConfig.common_ledgers.owner_tables` when omitted (S-b) -- run `refresh` and `common-refresh` against the SAME resolved table set, see 부록 A round 3 above.

`src/index.mjs` also re-exports `validateRule`, `isMachineActor`, `RuleStoreError`,
`RefreshError`, `clearCustodyCache`, `classifyMail`/`compileRule`/`compileRules`/
`normalizeYieldsTo`, the CSV builders/encoders and `seoulDateOf` from
`src/ledgers.mjs`, and `loadMailEvents`/`parseAddressField` from `src/mail_events.mjs`,
for callers that need them.

**Step 1 additions (all new exports -- every export documented above keeps its
existing name and argument shape):** `refreshCommon`/`classifyAllCommonMail`/
`CommonRefreshError` (`src/common_refresh.mjs`), `listUnclassified`/
`appendReadingDecision`/`TriageError` (`src/triage.mjs`), `loadOwnerTables`/
`READING_LEVELS` (`src/owner_tables.mjs`), and `buildCommonConfig`/
`classifyProjectHits`/`resolvePrimaryBucket`/`workTagsOf`/`PRIMARY_BUCKETS`
(`src/common_classifier.mjs`) for a caller (a future console/UI adapter, or the
`context-read` lane's tool bundle in Step 3) that needs the common-folder pipeline
directly rather than through the CLI. See "Common-folder (P00-000) classification and
the triage API (Step 1)" above.

**2026-09-22 (봇 판독 도구) additions, both additive:** `src/index.mjs` also re-exports
`EXCLUDE_FIXED_TARGETS`/`EXCLUDE_LEGACY_TARGETS`/`EXCLUDE_PREFIXES`/
`isAllowedExcludeTarget` (`src/triage.mjs`), so a caller that must OFFER a menu of
exclude categories reads the vocabulary from this module rather than copying the
tokens into its own source; and `listUnclassified`'s items gained two review-only
arrays -- `candidates` (the project codes `classifyProjectHits` computed as candidates
for a mail it did not attribute: a two-project subject collision, or several projects'
terms in the body) and `hint_codes` (`classifier.mjs`'s own `hintCodes` -- projects
whose HINT terms matched while their exact terms did not, run over the same compiled
rule set the pass classified with, which `classifyAllCommonMail` now also returns as
`compiledRules`). **Neither is attribution** -- both are "maybe read this project"
signals for a human/AI reader, exactly what `hintCodes`' own doc says it is for. A
hint term only matches inside the fields that rule's OWN `match_fields` declares, so a
subject-only rule contributes a subject-only hint. No existing export changed name,
shape or meaning. See "봇 판독 도구" above.

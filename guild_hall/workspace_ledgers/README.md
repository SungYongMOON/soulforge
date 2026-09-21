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

**Unreadable custody directories (pre-write gate).** A directory `loadMailEvents`
could not read at all -- most dangerously, a `--hiworks-events` typo pointing at a
path that simply does not exist -- is recorded in `receipt.unreadable_dirs`, and its
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
shadowing a second row that is genuinely, exactly keyed on that same address). Any of
these ambiguous situations -- an index collision, or two still-unmatched fresh rows
genuinely contending for the same not-yet-consumed existing row -- means none of the
contenders gets the Owner cell, and is counted in the per-ledger `owner_cells_ambiguous`
field of the receipt (contacts.csv only; every other ledger keys on an exact, non-
alternate column and this is always `0` there).

## Performance

- `classifier.mjs` lowercases each mail's field text at most once per unique
  `match_fields` combination per mail (in practice once total, since every rule
  declares the same three fields), not once per term -- a cache scoped to a single
  `classifyMail`/`hintCodes` call.
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
  [--projects a,b] [--fields subject|all] [--dry] \
  [--allow-empty P00-001,P00-002] [--allow-partial-sources] --receipts <dir>

node cli.mjs preview-rule --code <CODE> --draft <file> --workspaces-root <dir> \
  --hiworks-events <dir> --gmail-sent-events <dir> [--org-config <file>] \
  [--fields subject|all] [--show-samples]

node cli.mjs save-rule --code <CODE> --draft <file> \
  --workspaces-root <dir> --workmeta-root <dir> --by <actor> --note <text> \
  [--allowed-actors a,b,c]
```

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

Spec: `docs/architecture/.../handoff/CONTEXT_BASELINE_TEST_2026-09-19/18_WORKSPACE_LEDGERS_PORT_SPEC_2026-09-21.md`
(private handoff folder, not tracked here) sections 1-7. This is the org-wide
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
[--work-tag-table <file>] [--dry] [--allow-empty file1,file2] --receipts <dir>`;
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
- `previewRule({ workspacesRoot, code, draft, hiworksDirs, gmailSentDirs, fields?, orgConfigPath? })` -> `{ matched_before, matched_after, moved_in, moved_out, newly_held, duplicates_dropped, id_collisions_kept, samples, rule_failures }` (`samples` is private -- real mail subjects; the console UI needs it, but never print it in a log/report. `rule_failures` -- fresh-review-5 #7 -- lists any OTHER project excluded from this comparison because its own saved rule failed to compile; non-empty means these counts are incomplete, and should be rendered with a caveat, not as fact). `orgConfigPath` (optional) resolves `system_sender_domains` the same way a real `refresh()` against that config would.
- `saveRuleVersion({ workspacesRoot, workmetaRoot, code, draft, by, note, now?, measured?, allowedActors? })` -> `{ project_code, folder_name, previous_version, rule_version, json_path, md_path, history_json_path, history_md_path, sha256_json, sha256_md }`. `draft` (and `previewRule`'s `draft`) must be the **complete** rule document, never a partial patch -- see "Rule versioning and lineage" above.
- `refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath, projects?, fields?, dry?, receiptsDir, now?, allowEmpty?, allowPartialSources? })` -> the receipt body (`status: 'ok' | 'failed'`, `duplicates_dropped`, `id_collisions_kept`, `unreadable_dirs`, `allow_partial_sources_applied` (fresh-review-7 R3: true only when an unreadable dir actually put this run into a partial-sources state, not merely because the caller passed the flag), `allow_empty_applied_to`, `shrink_allowed_applied_to` (fresh-review-7 S1), `ledger_failures`, `rule_failures`, per-ledger `collapsed_identical_rows`/`owner_cells_dropped_with_row`/`owner_cells_ambiguous` (fresh-review-7 R1/R2, contacts.csv only)). No `match_timeouts`/`match_run_budget_exceeded` any more -- removed along with the per-mail timeout machinery (see "Design simplification" above). `allowEmpty` is a list of project codes (not a boolean, and every code must be a real onboarded project whose rule did not itself fail this run -- S-5/S-8); `allowPartialSources` (default `false`) opts into writing on partially-readable custody -- see "Refresh semantics" above.

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

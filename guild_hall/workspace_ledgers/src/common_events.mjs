// Raw mail-record loader for the common-folder classification pass
// (`common_refresh.mjs`, `triage.mjs`) -- and, since D-a/D-c (coordinator, fresh
// review round 2), for `refresh()`'s own project-ledger attribution too. Both paths
// now read custody through this ONE loader, so a mail id derived here (this is what
// `triage list` shows the reader/AI, and what `appendReadingDecision` keys a row by)
// is the exact same id `refresh()` derives for the exact same physical mail -- D-c:
// "A reading-table row written from `triage list` output must be found by refresh()."
//
// Deliberately separate from `mail_events.mjs`'s own `loadMailEvents` (K2, coordinator
// fresh review round 3: no longer called by `previewRule` either -- that function now
// reads through THIS loader too, via `refresh.mjs`'s `cachedLoadRecords`, so its
// `matched_before`/`matched_after` reflect exactly what the next refresh will write.
// `loadMailEvents` is kept only as a public export for external/back-compat callers;
// its contract is that body text never leaves it, and it still applies its own
// system-sender/skip-subject PRE-filter, which is exactly why it is no longer used
// internally). This loader's job -- org-wide classification, refresh()'s project
// attribution, previewRule's comparison, and Owner/AI triage reading -- explicitly
// needs the body (spec section 1 step 4's supplier-body confirmation) and never
// pre-filters anything: D-d requires that a mail be classified (steps 1-3, which can
// rescue it via an explicit reading/bundle decision) BEFORE it is ever judged "system
// noise", so no caller of this loader may drop a record before classification runs.
//
// The actual id-derivation/dedup/collision-suffix logic is NOT reimplemented here --
// it is `mail_events.mjs`'s `collectCandidatesFromDirs`/`dedupeAndAssignIds` (D-c:
// "same synthetic-id recipe for records without event_id, same collision suffix
// rule"), imported and reused as-is so the two loaders can never quietly drift apart.
import { collectCandidatesFromDirs, dedupeAndAssignIds } from './mail_events.mjs';

/**
 * Reads every `*.jsonl` file directly under each of `dirs` (sorted by name) into
 * records, deduped and id-resolved by `mail_events.mjs`'s shared logic -- see that
 * module's own doc for the exact recipe (a repeated non-empty `event_id` collapses to
 * its richest candidate; a genuine cross-mail collision on one `event_id` keeps every
 * distinct mail, suffixed by a stable hash of its own content; a record with no
 * `event_id` gets a content-derived synthetic id). `source` is a caller-chosen label
 * attached to every record (matches the convention -- `하이웍스_수집`/
 * `Gmail_보낸메일_수집`).
 *
 * Returns `{ records, scanned, duplicatesDropped, idCollisionsKept, unreadableDirs }`.
 * Every record keeps `body_text` (bounded to `MAX_BODY_TEXT_CHARS`) and every parsed
 * address -- this loader's whole purpose is to support classification and read-only
 * triage preview, unlike `mail_events.mjs`'s own `loadMailEvents`. Also carries
 * `mailbox_owners` (`mail_events.mjs`'s `ownersOf` -- ordered-unique `<display_name>
 * <email>` labels for the real mailbox(es) this physical mail was found in, off
 * each custody line's own `metadata.mailbox`; empty when none of them had one) --
 * `ledgers.mjs`'s `mailboxCellOf` is what actually renders it into a ledger cell.
 */
export function loadRawMailRecords({ dirs, source }) {
  const { candidates, scanned, unreadableDirs } = collectCandidatesFromDirs(dirs);
  const { records, duplicatesDropped, idCollisionsKept } = dedupeAndAssignIds({ candidates, source });
  const mapped = records.map(record => ({
    source,
    event_id: record.event_id,
    subject: record.subject,
    from: record.from,
    to: record.to,
    cc: record.cc,
    attachment_names: record.attachmentNames,
    body_text: record.bodyText,
    at: record.at,
    mailbox_owners: record.mailbox_owners,
  }));
  return { records: mapped, scanned, duplicatesDropped, idCollisionsKept, unreadableDirs };
}

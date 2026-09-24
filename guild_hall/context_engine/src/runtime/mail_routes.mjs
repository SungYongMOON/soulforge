// Which mail a person's own routing rules place in which project.
//
// A mail arrives addressed to a mailbox, not to a project. What the mail SAYS
// attributes nothing on its own: a project code in a subject line is one signal
// among several, and the estate has thousands of mails that carry none at all
// while plainly belonging somewhere. Who decides is the workspace ledgers module
// -- the Owner's saved per-project subject rules, the conversation bundle table,
// the reading-decision table and the vendor table -- and it publishes that
// decision as an index keyed by mail id.
//
// This is the same shape the voice side already has, and for the same reason. A
// recording is not a project's because it sits in the inbox; a segment is a
// project's because a person confirmed it, and `voice_routes.mjs` reads that from
// the route ledger rather than from the sessions folder. Mail now reads its
// project from this index rather than from the mail text. One question, one
// owner, one answer -- and the answer arrives as data, so nothing here has to
// import (or re-implement) the classifier that produced it.
//
// Two strengths travel with each attribution, and the difference matters to a
// reader, not to this file: `confirmed` is an approved subject-rule hit, an
// approved bundle-table hit, or a reading decision the Owner has ticked;
// `unconfirmed` is attributed but unconfirmed -- an AI reader's `include_with_
// review`, an unticked `include`, or a supplier-body tie-break. Both reach a
// grant; only the first should ever be shown as settled. A mail the ledgers
// deliberately did not attribute -- a two-project subject collision, an
// `hold_owner_review`, a vendor-only mail, an Owner-confirmed exclusion -- is
// simply absent from the index, and absent is what makes it leave a grant again.
//
// Nothing here writes. The index is read by address, its bytes may be pinned by
// digest, and a file that is not exactly an index of this schema is refused
// rather than partly used: a half-read index would look like every mail it failed
// to parse had been taken away from its project.
//
// An index also has to be RECENT (R3, fresh review 2026-09-22). A file that parses
// cleanly says nothing about when it was built, and the builder is not yet in any
// automation chain -- so without an age bound a lane would re-apply one morning's
// decisions indefinitely while every mail collected since read as unattributed, and
// every receipt would say `SYNCED`. Past `maxAgeHours` (default 36 -- a day's build
// plus a missed one) the read fails closed with its own code. A future `built_at`
// beyond a small clock-skew allowance is refused the same way: it would otherwise
// make an index immortal.
//
// What the input checks actually bind, said exactly (S4, fresh review round 2):
//   orgConfigAddress   given, the org config on disk must hash to the one the index
//                      says it was built from. This binds THAT FILE only.
//   ownerTablesDir     given, every table the index lists in `inputs.owner_tables`
//                      must still hash to the sha recorded there, matched by
//                      basename inside this directory. Without it, an index citing
//                      a reading-table digest that matches nothing on disk is
//                      accepted -- the Owner's own routing decisions are then bound
//                      by nothing but `maxAgeHours`.
// Neither flag makes the other unnecessary: the org config names where the tables
// are, the tables hold the decisions, and an Owner edits the two independently.
// With neither, staleness of both is bounded only by age.
//
// Pinning: `expectedSha256` matches EITHER the file's own digest OR the index's
// `content_sha256` -- the digest of everything except `built_at`. The file digest
// changes on every rebuild even when no decision changed, so it can only pin one
// exact file; `content_sha256` pins the DECISIONS and survives a rebuild that
// changed nothing. A caller that wants "these exact decisions" passes the content
// digest; one freezing one exact file passes the file digest.
import { createHash } from 'node:crypto';

export const MAIL_ATTRIBUTION_INDEX_SCHEMA = 'soulforge.mail_attribution_index.v1';
export const MAIL_ATTRIBUTION_INDEX_ADDRESS = 'control_root/mail-routes/mail_attribution_index.json';
export const MAIL_ATTRIBUTION_STRENGTHS = Object.freeze(['confirmed', 'unconfirmed']);
export const MAIL_ATTRIBUTION_LIMITS = Object.freeze({ index_bytes: 64 * 1024 * 1024,
  projects_per_mail: 8, mail_id_characters: 512, basis_characters: 64,
  // One day's build plus one missed one. A lane running every 30 minutes should
  // never see an index older than this unless the build stopped.
  default_max_age_hours: 36,
  // A `built_at` slightly ahead of this host's clock is ordinary skew between two
  // machines; far ahead is a file that would never expire.
  future_skew_minutes: 10 });

const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
// A table's `file` is joined onto a directory the caller named, so it must be one
// plain name: no separator, no traversal, nothing that could reach a second folder.
// `.` and `..` carry no separator of their own and are excluded by name.
const SAFE_BASENAME = /^(?!\.{1,2}$)[^/\\:*?"<>|]{1,255}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
const ROW_FIELDS = ['mail_id', 'projects', 'strength', 'basis'];

export class MailRouteError extends Error {
  constructor(code) { super(code); this.name = 'MailRouteError'; this.code = code; }
}
const fail = code => { throw new MailRouteError(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, fields) => plain(value) && Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function validRow(row) {
  return exactKeys(row, ROW_FIELDS)
    && typeof row.mail_id === 'string' && row.mail_id.length > 0
    && row.mail_id.length <= MAIL_ATTRIBUTION_LIMITS.mail_id_characters
    && Array.isArray(row.projects) && row.projects.length > 0
    && row.projects.length <= MAIL_ATTRIBUTION_LIMITS.projects_per_mail
    && row.projects.every(code => typeof code === 'string' && PROJECT_CODE.test(code))
    // Ascending and without repeats: the list is part of what a reader compares
    // between two runs, and its bytes must not depend on the order somebody wrote it.
    && row.projects.every((code, index) => index === 0 || code > row.projects[index - 1])
    && MAIL_ATTRIBUTION_STRENGTHS.includes(row.strength)
    && typeof row.basis === 'string' && row.basis.length > 0
    && row.basis.length <= MAIL_ATTRIBUTION_LIMITS.basis_characters;
}

/**
 * Reads the attribution index and returns it as a lookup, refusing anything it
 * cannot vouch for whole.
 *
 * `expectedSha256`, when given, is checked before the bytes are parsed: a lane
 * that pins its inputs pins this one too, and an index replaced under a running
 * pass is a scope change, not a fault to absorb.
 *
 * Returns `{ built_at, index_sha256, byMail, byProject, counts }`. `byMail` maps a
 * mail id to `{ projects, strength, basis }`; `byProject` maps a project code to a
 * `Map(mail id -> strength)`, which is the direction a grant is built in.
 */
export function readMailAttributionIndex({ io, address = MAIL_ATTRIBUTION_INDEX_ADDRESS, expectedSha256 = null,
  maxAgeHours = MAIL_ATTRIBUTION_LIMITS.default_max_age_hours, now = new Date().toISOString(),
  orgConfigAddress = null, ownerTablesDir = null } = {}) {
  let bytes;
  try { bytes = io.read(address, MAIL_ATTRIBUTION_LIMITS.index_bytes); }
  catch { fail('mail_attribution_index_unavailable'); }
  const indexSha256 = digest(bytes);
  let body;
  try { body = JSON.parse(bytes); }
  catch { fail('mail_attribution_index_invalid'); }
  if (!plain(body) || body.schema_version !== MAIL_ATTRIBUTION_INDEX_SCHEMA
    || typeof body.built_at !== 'string' || !INSTANT.test(body.built_at)
    || !SHA.test(body.content_sha256 ?? '')
    || !plain(body.inputs) || !SHA.test(body.inputs.org_config_sha256 ?? '')
    || !Array.isArray(body.attributions) || !plain(body.counts)) fail('mail_attribution_index_invalid');
  // Either digest satisfies a pin -- see the header note on which to use when.
  if (expectedSha256 !== null && (!SHA.test(expectedSha256)
    || (indexSha256 !== expectedSha256 && body.content_sha256 !== expectedSha256))) {
    fail('mail_attribution_index_digest_mismatch');
  }
  // The stated `content_sha256` has to be the digest of this body. Otherwise a file
  // could be pinned by a content digest it does not actually have.
  const { built_at: _builtAt, content_sha256: _stated, ...withoutTime } = body;
  if (digest(Buffer.from(JSON.stringify(withoutTime), 'utf8')) !== body.content_sha256) {
    fail('mail_attribution_index_content_digest_mismatch');
  }
  // R3: how old the decisions in this file are. A parseable index is not a current
  // one, and a lane cannot tell the difference without being told to look.
  if (!INSTANT.test(now ?? '')) fail('mail_attribution_index_clock_invalid');
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) fail('mail_attribution_index_max_age_invalid');
  const ageMs = Date.parse(now) - Date.parse(body.built_at);
  if (ageMs > maxAgeHours * 3600 * 1000) fail('mail_attribution_index_stale');
  if (-ageMs > MAIL_ATTRIBUTION_LIMITS.future_skew_minutes * 60 * 1000) fail('mail_attribution_index_built_in_future');
  // When the caller knows where the org config is, the index has to have been built
  // from the one that is there now. An Owner who changed the routing configuration
  // and has not rebuilt the index yet is exactly the case that would otherwise apply
  // yesterday's rules to today's mail without saying so. This binds that ONE file --
  // it says nothing about the tables it names; see `ownerTablesDir` below.
  if (orgConfigAddress !== null) {
    let configBytes;
    try { configBytes = io.read(orgConfigAddress, MAIL_ATTRIBUTION_LIMITS.index_bytes); }
    catch { fail('mail_attribution_index_org_config_unavailable'); }
    if (digest(configBytes) !== body.inputs.org_config_sha256) fail('mail_attribution_index_org_config_changed');
  }
  // S4: the Owner tables hold the decisions; the org config only says where they
  // are. Without this, an index could cite a reading-table digest matching nothing
  // on disk and still be accepted -- every bundle and reading decision in it bound
  // by nothing but age. Each table the index lists is re-hashed by basename inside
  // this directory, which is how the builder already records them (`file` is a
  // basename, never a host path).
  if (ownerTablesDir !== null) {
    const listed = body.inputs.owner_tables;
    if (!Array.isArray(listed)) fail('mail_attribution_index_invalid');
    for (const row of listed) {
      if (!plain(row) || typeof row.file !== 'string' || !SAFE_BASENAME.test(row.file)
        || !SHA.test(row.sha256 ?? '')) fail('mail_attribution_index_invalid');
      let tableBytes;
      try { tableBytes = io.read(`${ownerTablesDir}/${row.file}`, MAIL_ATTRIBUTION_LIMITS.index_bytes); }
      catch { fail('mail_attribution_index_owner_tables_unavailable'); }
      if (digest(tableBytes) !== row.sha256) fail('mail_attribution_index_owner_tables_changed');
    }
  }

  const byMail = new Map();
  const byProject = new Map();
  for (const row of body.attributions) {
    if (!validRow(row)) fail('mail_attribution_index_row_invalid');
    // One id, one answer. A second row for the same mail would leave the choice to
    // whichever happened to be read last -- an attribution nobody made.
    if (byMail.has(row.mail_id)) fail('mail_attribution_index_duplicate_mail_id');
    byMail.set(row.mail_id, { projects: Object.freeze([...row.projects]), strength: row.strength, basis: row.basis });
    for (const code of row.projects) {
      if (!byProject.has(code)) byProject.set(code, new Map());
      byProject.get(code).set(row.mail_id, row.strength);
    }
  }
  // The index's own counts have to describe the rows filed with them. A count that
  // drifted from its rows is the one thing a receipt would quote without checking.
  if (body.counts.attributed !== byMail.size) fail('mail_attribution_index_counts_disagree');

  return Object.freeze({ built_at: body.built_at, index_sha256: indexSha256,
    content_sha256: body.content_sha256, age_hours: Math.round((ageMs / 3600000) * 100) / 100,
    owner_tables_missing: Object.freeze([...(body.inputs.owner_tables_missing ?? [])]),
    byMail, byProject, counts: Object.freeze({ ...body.counts }) });
}

/**
 * The mail ids this index places in one project, and how strongly. An empty map
 * is a real answer -- "the ledgers attribute no mail to this project" -- and is
 * exactly what retires a project's mail from the next grant.
 */
export function mailAttributionFor(index, code) {
  return index.byProject.get(code) ?? new Map();
}

/**
 * Per-project counts for a receipt: how many mails this index gives a project, of
 * which how many are unconfirmed. Counts only -- no ids, ever.
 */
export function mailAttributionCounts(index, code) {
  const mine = mailAttributionFor(index, code);
  let unconfirmed = 0;
  for (const strength of mine.values()) if (strength === 'unconfirmed') unconfirmed += 1;
  return { attributed: mine.size, confirmed: mine.size - unconfirmed, unconfirmed };
}

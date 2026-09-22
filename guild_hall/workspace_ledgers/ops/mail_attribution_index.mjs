#!/usr/bin/env node
// The one place a mail's project attribution leaves this module as data.
//
// `refresh()` writes the per-project ledgers and `refreshCommon()` writes the
// common-folder ones; both decide a mail's project through ONE function,
// `common_classifier.mjs`'s `classifyProjectHits`. A third reader -- the context
// engine's graph-sync lane -- needs the same answer to decide which mails belong
// in which project's search index, and until now it decided that for itself by a
// much narrower rule of its own (the project code appearing verbatim in the mail).
// Two rules for one question is the drift this file exists to remove.
//
// It is NOT a fourth classifier. It runs `classifyAllCommonMail` -- the module's
// own shared, read-only pass, the same one `triage.mjs` reads through -- and
// writes down what that pass already decided, as an index keyed by mail id. The
// ledgers, the Owner tables and custody are read-only here from end to end; the
// only file this writes is the index, and `--dry` writes nothing at all.
//
// What it publishes and what it deliberately does not:
//   published   mail id, the project codes attributed to it, how strong that
//               attribution is, and the classifier's own fixed `basis` token.
//   never       subject, body, addresses, names, vendor names, the Owner's own
//               `이유`/`근거` free text, or any label built from them. Every value
//               that leaves here is either an id, a project code, or one of a
//               closed vocabulary this file declares.
//
// Two strengths, and the boundary between them is the module's own, not a new one
// (`refresh.mjs`'s `project_search_eligible_attributions`, README A2 item 5):
//   confirmed    an approved subject-rule hit, an approved bundle-table hit, or a
//                reading-table hit whose own `Owner확인` cell is filled in.
//   unconfirmed  attributed, but nobody has confirmed it: a reading decision with
//                an empty `Owner확인` (including every `include_with_review`, which
//                is where an AI reader's own attribution has to start), or step 4's
//                supplier-body tie-break. A downstream reader must be able to show
//                these apart from the confirmed ones; that is the whole reason the
//                strength travels rather than being flattened away here.
// Not attributed at all, and each for its own reason: a two-project subject
// collision (`held` -- two projects' exact triggers, never automatic attribution),
// `hold_owner_review`, `vendor_only`, an `exclude` decision, and plain 미정. A
// supplier address on its own never attributes anything -- step 4 additionally
// requires exactly one project's own exact term in the body, and a vendor with no
// such term falls through to 미정.
//
// Fail-closed, before a byte is written. Each of these aborts the whole build,
// because a partial index is worse than none: the consumer reads "this mail has no
// row" as "the Owner took this mail away from that project" and retires it.
//   * a malformed Owner table, a saved rule that will not compile, or an unreadable
//     custody directory
//   * an Owner table that was never loaded at all (R2, fresh review 2026-09-22).
//     `resolveOwnerTablePaths` returns null for a table the org config does not
//     name, `loadOwnerTables` then returns empty tables and NO failure, and the
//     build would quietly succeed having classified by subject rule alone -- an
//     index that silently retires every bundle-, reading- and body-attributed mail
//     on the next sync, with exit 0 and a receipt that looks healthy. All three
//     (bundle, reading, vendor) must have been read; `--allow-missing-owner-tables`
//     is the explicit way to say "I mean it", and is recorded in the index.
//
// The index is written by staging file + rename (R1), never in place: the consumer
// reads it on a 30-minute timer, and a build overlapping a sync would otherwise hand
// it a half-written file. That fails closed, which is correct, but it would take the
// whole pass down for every project.
//
// usage:
//   node mail_attribution_index.mjs --workspaces-root <dir> --org-config <file>
//        --hiworks-events <dir> --gmail-sent-events <dir> --out <file>
//        [--bundle-table <file>] [--reading-table <file>] [--vendor-table <file>]
//        [--allow-missing-owner-tables] [--org-config-sha256 sha256:...] [--dry] [--json]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyAllCommonMail } from '../src/common_refresh.mjs';
import { baseBasisOf, STEP1_TITLE_BASIS } from '../src/common_classifier.mjs';

export const MAIL_ATTRIBUTION_INDEX_SCHEMA = 'soulforge.mail_attribution_index.v1';
export const MAIL_ATTRIBUTION_BUILDER = Object.freeze({ id: 'workspace-ledgers-mail-attribution', version: '0.1.0' });
// The two strengths, named once. A reader compares against these, never against a
// spelled-out literal of its own.
export const MAIL_ATTRIBUTION_STRENGTHS = Object.freeze(['confirmed', 'unconfirmed']);
// The closed set of `basis` tokens that can reach the index -- the classifier's own
// (with the thread-vendor marker stripped), all fixed strings, none of them derived
// from mail or Owner free text. An unexpected token aborts the build rather than
// travelling: this list is exactly what makes "no free text leaves here" checkable.
export const MAIL_ATTRIBUTION_BASES = Object.freeze([STEP1_TITLE_BASIS, '묶음 확정', '판독', '판독(검토 필요)', '본문']);
// A bundle-table hit is the only non-title basis this codebase already treats as
// approved on its own; every other non-title basis needs an Owner확인 cell.
const BUNDLE_BASIS = '묶음 확정';
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
// Every Owner table that takes part in the decision. All three must have been read
// before an index is written -- see the header note on R2.
export const REQUIRED_OWNER_TABLES = Object.freeze(['bundle', 'reading', 'vendor']);

export class MailAttributionIndexError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'MailAttributionIndexError';
    this.code = code;
  }
}
const fail = (code, detail) => { throw new MailAttributionIndexError(code, detail); };
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// `baseBasisOf` now lives beside the marker it strips, in `common_classifier.mjs`,
// and is re-exported here for a caller that already imports this file.
export { baseBasisOf };

/**
 * How strong one attributed mail's attribution is, by this module's own existing
 * boundary -- `null` when the result is not an attribution at all.
 *
 * `classifyProjectHits` already refused the cases that must not attribute (a
 * two-project hold, `hold_owner_review`, `vendor_only`, `exclude`, 미정 all come
 * back with no hits), so this function does not re-decide them; it only reads the
 * strength off a result that DOES have hits, and refuses to guess when the basis
 * is one it does not know.
 */
export function attributionStrength(projectResult) {
  if (projectResult.held || projectResult.hits.length === 0) return null;
  const basis = baseBasisOf(projectResult.basis);
  if (!MAIL_ATTRIBUTION_BASES.includes(basis)) fail('workspace_ledgers_attribution_basis_unknown', basis);
  if (basis === STEP1_TITLE_BASIS || basis === BUNDLE_BASIS) return { strength: 'confirmed', basis };
  const ownerConfirmed = String(projectResult.reading?.ownerConfirmed ?? '').trim() !== '';
  return { strength: ownerConfirmed ? 'confirmed' : 'unconfirmed', basis };
}

/**
 * Builds the index from one shared classification pass. Read-only: this function
 * opens nothing but what `classifyAllCommonMail` already opens, and writes nothing.
 * `orgConfigSha256`, when given, pins the config file's bytes the same way every
 * other lane in this repository pins the input it was run against.
 */
export function buildMailAttributionIndex({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
  bundleTablePath = null, vendorTablePath = null, readingTablePath = null,
  allowMissingOwnerTables = false, now = new Date().toISOString() } = {}) {
  if (typeof orgConfigPath !== 'string' || orgConfigPath.trim() === '') fail('workspace_ledgers_org_config_required');
  let orgConfigBytes;
  try { orgConfigBytes = readFileSync(orgConfigPath); }
  catch { fail('workspace_ledgers_org_config_unreadable'); }

  const pass = classifyAllCommonMail({ workspacesRoot, hiworksDirs, gmailSentDirs, orgConfigPath,
    bundleTablePath, vendorTablePath, readingTablePath });

  // Fail-closed, all three, before anything is counted. Each of these means the
  // pass classified against less than the full picture, and an index built from a
  // partial picture reads downstream as a real retirement.
  if (pass.ownerTableFailures.length > 0) {
    fail('workspace_ledgers_attribution_owner_table_failures', pass.ownerTableFailures.map(row => row.table).sort().join(','));
  }
  if (pass.ruleFailures.length > 0) {
    fail('workspace_ledgers_attribution_rule_failures', pass.ruleFailures.map(row => row.project_code ?? '?').sort().join(','));
  }
  if (pass.unreadableDirs.length > 0) {
    // The directory's own code, never the host path it names.
    fail('workspace_ledgers_attribution_custody_unreadable', String(pass.unreadableDirs.length));
  }
  // R2: "no failure" is not "the table was consulted". `ownerTableUsageEntry`
  // returns an entry only for a table this pass actually READ, so this is the one
  // signal that separates "the Owner's decisions were in play" from "the org config
  // names no tables and every decision came from subject rules alone".
  const tablesUsed = new Set(pass.ownerTablesUsed.map(row => row.table));
  const missing = REQUIRED_OWNER_TABLES.filter(table => !tablesUsed.has(table));
  if (missing.length > 0 && !allowMissingOwnerTables) {
    fail('workspace_ledgers_attribution_owner_tables_missing', missing.join(','));
  }

  const attributions = [];
  const byProject = new Map();
  let confirmed = 0, unconfirmed = 0, heldTwoProjects = 0, notAttributed = 0;
  for (const { mail, projectResult } of pass.classified) {
    if (projectResult.held) { heldTwoProjects += 1; continue; }
    const judged = attributionStrength(projectResult);
    if (judged === null) { notAttributed += 1; continue; }
    const projects = [...new Set(projectResult.hits.map(hit => hit.project_code))].sort();
    if (projects.length === 0 || !projects.every(code => PROJECT_CODE.test(code))) {
      fail('workspace_ledgers_attribution_project_code_invalid');
    }
    const mailId = String(mail.event_id ?? '');
    if (mailId === '') fail('workspace_ledgers_attribution_mail_id_missing');
    attributions.push({ mail_id: mailId, projects, strength: judged.strength, basis: judged.basis });
    if (judged.strength === 'confirmed') confirmed += 1; else unconfirmed += 1;
    for (const code of projects) {
      const row = byProject.get(code) ?? { confirmed: 0, unconfirmed: 0 };
      row[judged.strength] += 1;
      byProject.set(code, row);
    }
  }
  attributions.sort((a, b) => (a.mail_id < b.mail_id ? -1 : a.mail_id > b.mail_id ? 1 : 0));
  // One mail id means one mail. Two rows under one id would let a reader pick
  // whichever came last, which is a silent attribution nobody decided.
  const ids = new Set();
  for (const row of attributions) {
    if (ids.has(row.mail_id)) fail('workspace_ledgers_attribution_duplicate_mail_id');
    ids.add(row.mail_id);
  }

  const body = {
    schema_version: MAIL_ATTRIBUTION_INDEX_SCHEMA,
    built_at: now,
    builder: { ...MAIL_ATTRIBUTION_BUILDER },
    // What the pass was run against. `file` is a basename only, as every Owner-table
    // usage entry in this module already is -- never a host path.
    // `owner_tables_missing` is normally empty; it is non-empty only when the caller
    // explicitly allowed a build without one, and it travels so a reader can see
    // which decisions this index could not have been made from.
    inputs: { org_config_sha256: sha256(orgConfigBytes), owner_tables: pass.ownerTablesUsed.map(row => ({ ...row })),
      owner_tables_missing: missing },
    counts: {
      records: pass.totalMails,
      attributed: attributions.length,
      confirmed,
      unconfirmed,
      held_two_projects: heldTwoProjects,
      not_attributed: notAttributed,
      by_project: Object.fromEntries([...byProject.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
    },
    attributions,
  };
  // S1: the digest of everything EXCEPT when it was built. Two builds over an
  // unchanged estate differ only in `built_at`, so the file digest changes every run
  // and cannot be used to answer "did the decisions change?". This one can, and it is
  // what a consumer pins when it wants to pin the decisions rather than the file.
  const { built_at: _builtAt, ...withoutTime } = body;
  return { ...body, content_sha256: sha256(Buffer.from(JSON.stringify(withoutTime), 'utf8')) };
}

// ------------------------------------------------------------------------- CLI
function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    flags.set(token.slice(2), next === undefined || next.startsWith('--') ? true : (index += 1, next));
  }
  return flags;
}

const required = (flags, name) => {
  const value = flags.get(name);
  if (typeof value !== 'string' || value.trim() === '') fail('workspace_ledgers_attribution_flag_required', name);
  return value;
};

const optional = (flags, name) => {
  const value = flags.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

export function main(argv = process.argv.slice(2)) {
  const flags = options(argv);
  const workspacesRoot = required(flags, 'workspaces-root');
  const orgConfigPath = required(flags, 'org-config');
  const hiworksEvents = required(flags, 'hiworks-events');
  const gmailSentEvents = required(flags, 'gmail-sent-events');
  const dry = flags.get('dry') === true || flags.get('dry') === 'true';
  // N1: `--out` is parsed the same way whether or not this is a dry run -- a missing
  // or malformed `--out` is a usage error a preflight must surface, not something
  // `--dry` quietly tolerates and a real run then fails on.
  const out = required(flags, 'out');
  const expected = flags.get('org-config-sha256');
  // N2: this module's own error type and code, like every other refusal here --
  // previously a bare mismatch fell through as an unnamed condition.
  if (typeof expected === 'string' && sha256(readFileSync(orgConfigPath)) !== expected) {
    fail('workspace_ledgers_attribution_org_config_digest_mismatch');
  }
  const index = buildMailAttributionIndex({ workspacesRoot, orgConfigPath,
    hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents],
    bundleTablePath: optional(flags, 'bundle-table'),
    readingTablePath: optional(flags, 'reading-table'),
    vendorTablePath: optional(flags, 'vendor-table'),
    allowMissingOwnerTables: flags.get('allow-missing-owner-tables') === true });
  if (!dry) {
    const resolved = path.resolve(out);
    const directory = path.dirname(resolved);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    // R1: staged then renamed, the same shape `common_refresh.mjs`'s receipt writer
    // uses. The consumer opens this file on a 30-minute timer; writing in place
    // hands an overlapping sync a truncated file, and though it refuses that
    // correctly, the refusal takes down the pass for every project.
    const staging = `${resolved}.writing-${process.pid}-${Date.now()}`;
    writeFileSync(staging, `${JSON.stringify(index, null, 2)}\n`);
    renameSync(staging, resolved);
  }
  // Counts only. The rows themselves are never printed: they are ids, and an id is
  // still a handle on a private mail.
  const line = flags.get('json') === true
    ? `${JSON.stringify({ ...index, attributions: undefined, written: !dry })}\n`
    : `mail-attribution ${dry ? 'DRY' : 'WRITTEN'} records=${index.counts.records} `
      + `attributed=${index.counts.attributed} confirmed=${index.counts.confirmed} `
      + `unconfirmed=${index.counts.unconfirmed} held=${index.counts.held_two_projects} `
      + `unattributed=${index.counts.not_attributed} projects=${Object.keys(index.counts.by_project).length}`
      + `${index.inputs.owner_tables_missing.length ? ` owner_tables_missing=${index.inputs.owner_tables_missing.join(',')}` : ''}\n`;
  process.stdout.write(line);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); }
  catch (error) {
    // N5: this module's own errors carry the detail that makes them actionable --
    // WHICH table was never read, WHICH flag is missing -- in `message`, and printing
    // only `code` threw that away at exactly the moment an operator needs it. Any
    // other error still prints its code, since a foreign message may carry a path.
    process.stderr.write(`[mail-attribution-index] ${error instanceof MailAttributionIndexError
      ? error.message : (error?.code ?? 'workspace_ledgers_attribution_failed')}\n`);
    process.exitCode = 2;
  }
}

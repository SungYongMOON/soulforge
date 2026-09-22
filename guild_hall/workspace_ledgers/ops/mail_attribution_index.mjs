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
// Fail-closed, before a byte is written: a malformed Owner table, a saved rule
// that will not compile, or an unreadable custody directory each abort the whole
// build. A partial index is worse than none -- a project whose rule failed to
// compile would quietly lose every mail it owns, and a reader downstream would
// see that as "these mails are not ours any more" and retire them.
//
// usage:
//   node mail_attribution_index.mjs --workspaces-root <dir> --org-config <file>
//        --hiworks-events <dir> --gmail-sent-events <dir> --out <file>
//        [--org-config-sha256 sha256:...] [--dry] [--json]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyAllCommonMail } from '../src/common_refresh.mjs';
import { STEP1_TITLE_BASIS, THREAD_VENDOR_INHERITANCE_MARKER } from '../src/common_classifier.mjs';

export const MAIL_ATTRIBUTION_INDEX_SCHEMA = 'soulforge.mail_attribution_index.v0';
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

export class MailAttributionIndexError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'MailAttributionIndexError';
    this.code = code;
  }
}
const fail = (code, detail) => { throw new MailAttributionIndexError(code, detail); };
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** The classifier's `basis` without the thread-vendor-inheritance marker it may carry. */
export function baseBasisOf(basis) {
  const text = String(basis ?? '');
  return text.endsWith(THREAD_VENDOR_INHERITANCE_MARKER)
    ? text.slice(0, -THREAD_VENDOR_INHERITANCE_MARKER.length)
    : text;
}

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
  now = new Date().toISOString() } = {}) {
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

  return {
    schema_version: MAIL_ATTRIBUTION_INDEX_SCHEMA,
    built_at: now,
    builder: { ...MAIL_ATTRIBUTION_BUILDER },
    // What the pass was run against. `file` is a basename only, as every Owner-table
    // usage entry in this module already is -- never a host path.
    inputs: { org_config_sha256: sha256(orgConfigBytes), owner_tables: pass.ownerTablesUsed.map(row => ({ ...row })) },
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

export function main(argv = process.argv.slice(2)) {
  const flags = options(argv);
  const workspacesRoot = required(flags, 'workspaces-root');
  const orgConfigPath = required(flags, 'org-config');
  const hiworksEvents = required(flags, 'hiworks-events');
  const gmailSentEvents = required(flags, 'gmail-sent-events');
  const dry = flags.get('dry') === true || flags.get('dry') === 'true';
  const out = dry ? null : required(flags, 'out');
  const expected = flags.get('org-config-sha256');
  if (typeof expected === 'string' && sha256(readFileSync(orgConfigPath)) !== expected) {
    fail('workspace_ledgers_attribution_org_config_digest_mismatch');
  }
  const index = buildMailAttributionIndex({ workspacesRoot, orgConfigPath,
    hiworksDirs: [hiworksEvents], gmailSentDirs: [gmailSentEvents] });
  if (out !== null) {
    const directory = path.dirname(path.resolve(out));
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`);
  }
  // Counts only. The rows themselves are never printed: they are ids, and an id is
  // still a handle on a private mail.
  const line = flags.get('json') === true
    ? `${JSON.stringify({ ...index, attributions: undefined, written: out !== null })}\n`
    : `mail-attribution ${dry ? 'DRY' : 'WRITTEN'} records=${index.counts.records} `
      + `attributed=${index.counts.attributed} confirmed=${index.counts.confirmed} `
      + `unconfirmed=${index.counts.unconfirmed} held=${index.counts.held_two_projects} `
      + `unattributed=${index.counts.not_attributed} projects=${Object.keys(index.counts.by_project).length}\n`;
  process.stdout.write(line);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); }
  catch (error) {
    process.stderr.write(`[mail-attribution-index] ${error?.code ?? 'workspace_ledgers_attribution_failed'}\n`);
    process.exitCode = 2;
  }
}

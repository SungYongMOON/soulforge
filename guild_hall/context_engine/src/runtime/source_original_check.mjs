// Checks prepared documents against the originals they were prepared from.
//
// The run record and the validation report say a result is consistent with
// itself: the same bytes, the same digests, the same grant. They cannot say
// the preparer kept what the original held. This module goes back to the
// collected original - read by the collection owner's own reader, not through
// the preparer - and asks, field by field, whether the prepared document still
// carries it: header fields, body text, comments and replies, change history,
// times, and a locator that really points at that original. What the preparer
// leaves out on purpose (attachment bodies, HTML turned into text, history
// rendered as lines) is listed as an exclusion, so an absence is either
// accounted for or a finding.
//
// It is deliberately not a re-run of the preparer. Re-running the same code
// would agree with itself; this compares the stored result with raw fields the
// preparer never produced.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { mailBodyTextFromRecord } from '../../../gateway/mail_body_excerpt.mjs';
import { openSourceRoot } from '../adapters/sources/guarded_files.mjs';
import { readChannelState, readRawEvents, slackTsToIso } from '../adapters/sources/slack_custody_source.mjs';
import { totalDigest, documentsDigest } from './preparation_run.mjs';
import { SOURCE_LIMITS } from './source_documents.mjs';

export const SOURCE_CHECK_SCHEMA = 'soulforge.context_source_original_check.v1';
export const CHECKER_ID = 'context-engine/source-original-checker';
export const CHECKER_VERSION = '0.1.0';
export const SOURCE_CHECK_POLICY_ID = 'source-original-check-v1';
export const CHECK_OUTCOMES = Object.freeze(['pass', 'fail', 'partial', 'not_run']);
const MAIL_MAX_BODY_CHARACTERS = 200000;
const OBJECT_FILE = /^([0-9a-f]{64})\.json$/u;

export class SourceCheckError extends Error {
  constructor(code) { super(code); this.name = 'SourceCheckError'; this.code = code; }
}
const fail = code => { throw new SourceCheckError(code); };
const digestHex = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function checkerCodeDigest() { return digestHex(readFileSync(fileURLToPath(import.meta.url))); }

// Whitespace-insensitive equality: line breaks and indentation are the one thing
// the preparer is allowed to normalize; characters are not.
const squash = text => String(text ?? '').replace(/\s+/gu, ' ').trim();
const check = (id, outcome, detail = null) => ({ id, outcome, detail });
const rollup = checks => {
  const outcomes = checks.map(c => c.outcome);
  if (outcomes.includes('fail')) return 'fail';
  if (outcomes.includes('partial')) return 'partial';
  if (outcomes.every(o => o === 'not_run')) return 'not_run';
  return 'pass';
};

// ---- mail -------------------------------------------------------------------
async function checkMail({ document, root, item }) {
  const checks = [], exclusions = [];
  const locator = document.units[0]?.locator ?? null;
  if (!locator || !Array.isArray(locator.path) || locator.event_id !== item.item_id) {
    return { checks: [check('locator_valid', 'fail', 'locator missing or names another event')], exclusions };
  }
  let lines;
  try { ({ lines } = await root.readLines(locator.path, { filter: line => line.includes(locator.event_id) })); }
  catch { return { checks: [check('original_found', 'fail', 'event file unreadable at locator path')], exclusions }; }
  const rows = [];
  for (const line of lines) {
    let row; try { row = JSON.parse(line); } catch { continue; }
    if (row?.event_id === locator.event_id) rows.push({ row, sha256: sha256Canonical(row) });
  }
  const original = rows.find(r => r.sha256 === document.primary_revision_sha256);
  if (!original) return { checks: [check('original_found', 'fail', `no row with the prepared revision among ${rows.length} rows for this event`)], exclusions };
  checks.push(check('original_found', 'pass', `${rows.length} row(s) for this event in the file; prepared revision present`));
  checks.push(check('locator_valid', 'pass'));
  const row = original.row;
  const units = kind => document.units.filter(u => u.unit_kind === kind);
  // header fields
  const header = units('header')[0]?.text ?? '';
  const render = list => (list ?? []).map(a => a.address ?? '').filter(Boolean).join(', ');
  const headerOk = header.includes(`Subject: ${row.subject}`) && header.includes(`Date: ${row.received_at}`)
    && (row.from ?? []).every(a => !a.address || header.includes(a.address)) && (row.to ?? []).every(a => !a.address || header.includes(a.address))
    && (row.cc ?? []).every(a => !a.address || header.includes(a.address));
  checks.push(check('fields_preserved', headerOk ? 'pass' : 'fail', headerOk ? 'subject, from, to, cc, date present in header unit'
    : `header unit lacks a field (from ${render(row.from).length}, to ${render(row.to).length}, cc ${render(row.cc).length} addresses)`));
  // body: what the collection owner's reader yields from the stored record
  const rawText = mailBodyTextFromRecord(row, { maxChars: MAIL_MAX_BODY_CHARACTERS }) ?? '';
  const bodyText = units('body').map(u => u.text).join('\n'), quotedText = units('quoted').map(u => u.text).join('\n');
  const together = squash(`${bodyText}\n${quotedText}`), expected = squash(rawText);
  if (expected.length === 0) checks.push(check('body_preserved', 'not_run', 'original carries no readable body text'));
  else if (together === expected) checks.push(check('body_preserved', 'pass', `${[...expected].length} characters, body + quoted history together equal the original text`));
  else if (expected.startsWith(together) && together.length > 0) checks.push(check('body_preserved', 'partial', 'prepared text is a prefix of the original (truncated)'));
  else checks.push(check('body_preserved', 'fail', 'prepared body + quoted history differ from the original text'));
  if (row.body_text === null || row.body_text === undefined) {
    if (row.body_html) exclusions.push('body derived from HTML: text is the collection reader\'s conversion of the stored HTML');
  }
  const rawFull = String(row.body_text ?? row.body_html ?? '');
  if ([...rawFull].length > MAIL_MAX_BODY_CHARACTERS) exclusions.push(`original body longer than ${MAIL_MAX_BODY_CHARACTERS} characters: truncated by design`);
  // A single unit is bounded (SOURCE_LIMITS.unit_characters); a body past that
  // bound is stored as a prefix. The check above still says partial - that is
  // the truth of what is stored - and this names the bound it hit.
  if ([...expected].length > SOURCE_LIMITS.unit_characters) exclusions.push(`original text longer than the unit bound (${SOURCE_LIMITS.unit_characters} characters): body unit holds a prefix`);
  // attachments: digests and names, not bodies
  const atts = (row.attachments ?? []).filter(a => a && typeof a === 'object');
  const attShas = atts.map(a => a.content_sha256).filter(s => /^sha256:[0-9a-f]{64}$/u.test(s ?? '')).sort();
  const compShas = document.components.filter(c => c.kind === 'attachment').map(c => c.sha256).sort();
  const countFact = document.facts.find(f => f.name === 'mail.attachment_count')?.value;
  const attOk = JSON.stringify(attShas) === JSON.stringify(compShas) && countFact === atts.length;
  checks.push(check('attachments_preserved', attOk ? 'pass' : 'fail', `${atts.length} attachment(s), ${attShas.length} with digest; ${compShas.length} component digest(s) in document`));
  if (atts.length) exclusions.push('attachment bodies not included: only names and content digests travel');
  // time and identity facts
  const timeOk = document.valid_at === row.received_at && units('header')[0]?.occurred_at === row.received_at;
  checks.push(check('time_preserved', timeOk ? 'pass' : 'fail', 'received_at kept as valid_at and header time'));
  const fact = name => document.facts.find(f => f.name === name)?.value ?? null;
  const factsOk = fact('mail.thread_id') === (row.thread_id ?? null) && String(fact('mail.provider_message_id') ?? '') === String(row.provider_message_id ?? '')
    && fact('mail.to_count') === (row.to ?? []).length && fact('mail.cc_count') === (row.cc ?? []).length;
  checks.push(check('relations_preserved', factsOk ? 'pass' : 'fail', 'thread id, provider message id, recipient counts'));
  if (rows.length > 1) exclusions.push(`event appears ${rows.length} times in the file; the granted revision was compared, duplicates are not merged`);
  return { checks, exclusions };
}

// ---- linear ------------------------------------------------------------------
async function readSnapshots(root, kind, objectId) {
  const rows = [];
  let entries;
  try { entries = await root.list([kind, objectId]); } catch { return rows; }
  for (const entry of entries) {
    const match = entry.file ? OBJECT_FILE.exec(entry.name) : null;
    if (!match) continue;
    const { text } = await root.readText([kind, objectId, entry.name], 1024 * 1024);
    let record; try { record = JSON.parse(text); } catch { continue; }
    if (sha256Canonical(record?.object ?? null) !== `sha256:${match[1]}`) { rows.push({ sha256: `sha256:${match[1]}`, object: null, corrupt: true }); continue; }
    rows.push({ sha256: `sha256:${match[1]}`, object: record.object });
  }
  return rows;
}
async function latestPerObject(root, kind, issueId) {
  const out = new Map();
  let entries;
  try { entries = await root.list([kind]); } catch { return out; }
  for (const entry of entries) {
    if (entry.file) continue;
    const snapshots = (await readSnapshots(root, kind, entry.name)).filter(s => s.object && s.object.issue_id === issueId);
    if (snapshots.length === 0) continue;
    snapshots.sort((a, b) => String(a.object.updated_at ?? a.object.created_at ?? '').localeCompare(String(b.object.updated_at ?? b.object.created_at ?? '')) || a.sha256.localeCompare(b.sha256));
    out.set(entry.name, snapshots.at(-1));
  }
  return out;
}
async function checkLinear({ document, root, item }) {
  const checks = [], exclusions = [];
  const snapshots = await readSnapshots(root, 'issues', item.item_id);
  const original = snapshots.find(s => s.sha256 === document.primary_revision_sha256 && s.object);
  if (!original) return { checks: [check('original_found', 'fail', `prepared revision not among ${snapshots.length} custody snapshot(s)`)], exclusions };
  checks.push(check('original_found', 'pass', `${snapshots.length} snapshot(s); prepared revision present and digest-verified`));
  const issue = original.object;
  const units = kind => document.units.filter(u => u.unit_kind === kind);
  const locOk = units('title')[0]?.locator?.issue_id === issue.id && units('title')[0]?.locator?.identifier === issue.identifier;
  checks.push(check('locator_valid', locOk ? 'pass' : 'fail', 'title locator names the issue id and identifier'));
  const titleOk = squash(units('title')[0]?.text) === squash(issue.title);
  const descUnit = units('description')[0];
  const descOk = squash(descUnit?.text ?? '') === squash(issue.description ?? '');
  checks.push(check('fields_preserved', titleOk && descOk ? 'pass' : 'fail', `title ${titleOk ? 'equal' : 'differs'}, description ${descOk ? 'equal' : 'differs'}`));
  if (!issue.description) exclusions.push('empty description: no description unit is kept (empty units are dropped)');
  // comments and replies
  const comments = await latestPerObject(root, 'comments', issue.id);
  const commentUnits = units('comment');
  let commentOk = commentUnits.length === comments.size, replies = 0, missing = [];
  for (const [id, snap] of comments) {
    const unit = commentUnits.find(u => u.locator.comment_id === id);
    const expected = snap.object.quoted_text ? `> ${snap.object.quoted_text}\n${snap.object.body ?? ''}` : snap.object.body ?? '';
    if (!unit) { if (squash(expected).length > 0) { commentOk = false; missing.push(id); } continue; }
    if (squash(unit.text) !== squash(expected) || unit.occurred_at !== snap.object.created_at
      || unit.locator.parent_id !== (snap.object.parent_id ?? null)) { commentOk = false; missing.push(id); }
    if (snap.object.parent_id) replies += 1;
  }
  const emptyComments = [...comments.values()].filter(s => squash(s.object.body ?? '').length === 0 && !s.object.quoted_text).length;
  if (commentUnits.length !== comments.size && commentUnits.length === comments.size - emptyComments) commentOk = missing.length === 0;
  checks.push(check('comments_preserved', commentOk ? 'pass' : 'fail', `${comments.size} comment(s) in custody (${replies} replies, ${emptyComments} empty), ${commentUnits.length} comment unit(s)${missing.length ? `, mismatched: ${missing.length}` : ''}`));
  if (emptyComments) exclusions.push(`${emptyComments} comment(s) with empty body: no unit is kept`);
  // change history
  const changes = await latestPerObject(root, 'issue_history', issue.id);
  const changeUnits = units('change');
  let histOk = changeUnits.length === changes.size;
  for (const [id, snap] of changes) {
    const unit = changeUnits.find(u => u.locator.history_id === id);
    if (!unit || unit.occurred_at !== snap.object.created_at) histOk = false;
  }
  checks.push(check('history_preserved', histOk ? 'pass' : 'fail', `${changes.size} history entr(y/ies) in custody, ${changeUnits.length} change unit(s), each keyed by history id and time`));
  exclusions.push('history entries are rendered as text lines (state, assignee, due date, priority, labels, relations); raw ids are kept in locators, not restated');
  // times and relations
  const timeOk = document.valid_at === issue.updated_at && units('title')[0]?.occurred_at === issue.updated_at;
  checks.push(check('time_preserved', timeOk ? 'pass' : 'fail', 'issue updated_at kept as valid_at and title time'));
  const fact = name => document.facts.find(f => f.name === name)?.value ?? null;
  const relOk = fact('linear.project_id') === (issue.project_id ?? null) && fact('linear.identifier') === issue.identifier;
  checks.push(check('relations_preserved', relOk ? 'pass' : 'fail', 'project id and identifier facts'));
  if ((issue.relations ?? []).length) exclusions.push(`${issue.relations.length} issue relation(s) are not restated as units (kept in custody)`);
  return { checks, exclusions };
}

// ---- slack -------------------------------------------------------------------
async function checkSlack({ document, root, item }) {
  const checks = [], exclusions = [];
  const { state, rawDigests, held } = await readChannelState(root);
  const rawByTs = await readRawEvents(root, rawDigests);
  const units = kind => document.units.filter(u => u.unit_kind === kind);
  const message = units('message')[0];
  if (!message || message.locator.message_ts !== item.item_id) return { checks: [check('locator_valid', 'fail', 'message unit missing or names another ts')], exclusions };
  const rawEntry = (rawByTs.get(item.item_id) ?? []).find(entry => entry.digest === document.primary_revision_sha256);
  if (!rawEntry) return { checks: [check('original_found', 'fail', 'prepared raw digest not among custody raw events for this ts')], exclusions };
  checks.push(check('original_found', 'pass', 'raw event present under its content digest'));
  const revision = state.revisions.find(rev => rev.revision_ref === message.locator.revision_ref && rev.message_ts === item.item_id);
  checks.push(check('locator_valid', revision ? 'pass' : 'fail', revision ? 'revision ref and ts resolve in channel state' : 'revision ref not in channel state'));
  const textOk = squash(message.text) === squash(rawEntry.raw.text ?? '');
  checks.push(check('body_preserved', textOk ? 'pass' : 'fail', `${[...squash(rawEntry.raw.text ?? '')].length} characters`));
  if (Array.isArray(rawEntry.raw.blocks) && rawEntry.raw.blocks.length) exclusions.push('rich-text blocks are not restated; the plain text field is what is kept');
  // replies: every reply custody holds for this root, by ts, text and time
  const replyRevs = state.revisions.filter(rev => rev.thread_ts === item.item_id && rev.message_ts !== item.item_id);
  const replyUnits = units('reply');
  let repliesOk = replyUnits.length === replyRevs.length;
  for (const rev of replyRevs) {
    const unit = replyUnits.find(u => u.locator.message_ts === rev.message_ts);
    const raw = (rawByTs.get(rev.message_ts) ?? []).at(-1);
    if (!unit || !raw || squash(unit.text) !== squash(raw.raw.text ?? '') || unit.occurred_at !== slackTsToIso(rev.message_ts)) repliesOk = false;
  }
  checks.push(check('comments_preserved', repliesOk ? 'pass' : 'fail', `${replyRevs.length} repl(y/ies) in custody, ${replyUnits.length} reply unit(s)`));
  // attachments by pointer digest
  const pointers = [revision, ...replyRevs].filter(Boolean).flatMap(rev => rev.attachment_pointers ?? []).map(p => p.content_sha256).filter(Boolean).sort();
  const components = document.components.filter(c => c.kind === 'attachment').map(c => c.sha256).sort();
  const attOk = JSON.stringify(pointers) === JSON.stringify(components);
  checks.push(check('attachments_preserved', attOk ? 'pass' : 'fail', `${pointers.length} attachment pointer(s), ${components.length} component digest(s)`));
  if (pointers.length) exclusions.push('attachment bodies not included: only file ids, mime types and content digests travel');
  const timeOk = document.valid_at === slackTsToIso(item.item_id) && message.occurred_at === document.valid_at;
  checks.push(check('time_preserved', timeOk ? 'pass' : 'fail', 'message ts kept as valid_at and unit time'));
  const fact = name => document.facts.find(f => f.name === name)?.value ?? null;
  const relOk = fact('slack.channel_id') === revision?.channel_id && fact('slack.reply_count') === replyRevs.length;
  checks.push(check('relations_preserved', relOk ? 'pass' : 'fail', 'channel id and reply count facts'));
  if (held) exclusions.push(`${held} event(s) in this channel are policy-held: raw body never stored, so they are not documents and are not compared`);
  return { checks, exclusions };
}

const CHECKERS = Object.freeze({ mail: checkMail, linear: checkLinear, slack: checkSlack });

/**
 * Compares each stored document with its original. `roots` maps root_ref to the
 * absolute source root (from the binding); `grant` supplies the items. Kinds
 * without a checker are reported as not_run, never as pass.
 */
export async function checkDocumentsAgainstOriginals({ documents, grant, roots, checkRunId, checkedAt } = {}) {
  if (!Array.isArray(documents) || !grant || !roots || typeof checkRunId !== 'string' || typeof checkedAt !== 'string') fail('source_check_input_invalid');
  const items = new Map();
  for (const source of grant.sources ?? []) for (const item of source.items ?? []) items.set(`${source.kind} ${source.root_ref} ${item.item_id}`, item);
  const perDocument = [];
  const opened = new Map();
  for (const document of documents) {
    const key = `${document.source_kind} ${document.root_ref} ${document.item_id}`;
    const item = items.get(key) ?? null;
    const checker = CHECKERS[document.source_kind] ?? null;
    let checks, exclusions = [];
    if (!item) checks = [check('item_granted', 'fail', 'document names an item the grant does not hold')];
    else if (!checker) checks = [check('checker_connected', 'not_run', `no original checker for source kind ${document.source_kind}`)];
    else if (typeof roots[document.root_ref] !== 'string') checks = [check('source_root_bound', 'not_run', 'source root not bound for this document')];
    else {
      try {
        if (!opened.has(document.root_ref)) opened.set(document.root_ref, openSourceRoot(roots[document.root_ref]));
        ({ checks, exclusions } = await checker({ document, root: opened.get(document.root_ref), item }));
      } catch (error) {
        checks = [check('original_read', 'fail', `original could not be read: ${error?.code ?? 'error'}`)];
      }
    }
    perDocument.push({ doc_key: document.doc_key, source_kind: document.source_kind, item_id: document.item_id,
      primary_revision_sha256: document.primary_revision_sha256, outcome: rollup(checks), checks, exclusions });
  }
  const counts = { documents: perDocument.length };
  for (const outcome of CHECK_OUTCOMES) counts[outcome] = perDocument.filter(d => d.outcome === outcome).length;
  // The documents digest binds this report to the exact set it examined. A set
  // that does not even validate as documents has no digest, and that is a
  // finding of its own rather than a reason to stop reporting.
  let documentsSha256 = null;
  try { documentsSha256 = documentsDigest(documents); } catch { documentsSha256 = null; }
  const outcome = documentsSha256 === null ? 'fail' : rollup(perDocument);
  if (documentsSha256 === null) counts.documents_invalid = true;
  const body = { schema_version: SOURCE_CHECK_SCHEMA, check_run_id: checkRunId, checker_id: CHECKER_ID, checker_version: CHECKER_VERSION,
    checker_code_digest: checkerCodeDigest(), check_policy: SOURCE_CHECK_POLICY_ID,
    project_key: grant.project_key ?? perDocument[0]?.project_key ?? null,
    documents_sha256: documentsSha256, checked_at: checkedAt, counts, outcome,
    documents: perDocument,
    limits: ['Originals are read by the collection owner\'s reader from the bound source root; the checker does not re-run the preparer.',
      'Text comparison ignores whitespace runs and line breaks only; characters must match.',
      'A pass says the prepared document carries what the original holds under this policy; it does not judge the original\'s truth.',
      'Kinds without a checker are not_run, and a not_run never counts as pass.'] };
  return Object.freeze({ ...body, report_sha256: totalDigest(body) });
}

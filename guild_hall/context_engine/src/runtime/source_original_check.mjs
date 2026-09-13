// Checks prepared documents against the originals they were prepared from.
//
// The run record and the validation report say a result is consistent with
// itself: the same bytes, the same digests, the same grant. They cannot say
// the preparer kept what the original held. This module goes back to the
// collected original - read by the collection owner's own reader, not through
// the preparer - and asks, field by field, whether the prepared document still
// carries it: header fields, body text, comments and replies, change history
// and its values, times, and a locator that really points at that original.
// What the preparer leaves out on purpose (attachment bodies, HTML turned into
// text, history rendered as lines) is listed as an exclusion, so an absence is
// either accounted for or a finding.
//
// Two rules keep the verdict honest. Every comparison is made against the
// exact revision the document recorded - the comment row, the history row, the
// raw Slack event by digest - never against whatever custody holds now; what
// custody gained since is reported as later input change, not as a defect and
// not as a match. And a document with any check not run is never a pass: the
// rollup is fail, then partial (something not run or only partly kept), then
// not_run, then pass.
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
import { readChannelState, readRawEvents, slackTsToIso, fileShareText } from '../adapters/sources/slack_custody_source.mjs';
import { totalDigest, documentsDigest } from './preparation_run.mjs';
import { SOURCE_LIMITS } from './source_documents.mjs';

export const SOURCE_CHECK_SCHEMA = 'soulforge.context_source_original_check.v1';
export const CHECKER_ID = 'context-engine/source-original-checker';
// 0.2.0: exact-revision comparison for comments, history and replies; history
// values compared; not_run never rolls up to pass; file-share units checked.
export const CHECKER_VERSION = '0.2.0';
export const SOURCE_CHECK_POLICY_ID = 'source-original-check-v2';
export const CHECK_OUTCOMES = Object.freeze(['pass', 'fail', 'partial', 'not_run']);
const MAIL_MAX_BODY_CHARACTERS = 200000;
const OBJECT_FILE = /^([0-9a-f]{64})\.json$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;

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
/** fail > partial (anything partial or not run beside a result) > not_run (nothing ran) > pass. */
export function rollup(rows) {
  const outcomes = rows.map(row => row.outcome);
  if (outcomes.length === 0) return 'not_run';
  if (outcomes.includes('fail')) return 'fail';
  if (outcomes.every(outcome => outcome === 'not_run')) return 'not_run';
  if (outcomes.includes('partial') || outcomes.includes('not_run')) return 'partial';
  return 'pass';
}

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
  const header = units('header')[0]?.text ?? '';
  const render = list => (list ?? []).map(a => a.address ?? '').filter(Boolean).join(', ');
  const headerOk = header.includes(`Subject: ${row.subject}`) && header.includes(`Date: ${row.received_at}`)
    && (row.from ?? []).every(a => !a.address || header.includes(a.address)) && (row.to ?? []).every(a => !a.address || header.includes(a.address))
    && (row.cc ?? []).every(a => !a.address || header.includes(a.address));
  checks.push(check('fields_preserved', headerOk ? 'pass' : 'fail', headerOk ? 'subject, from, to, cc, date present in header unit'
    : `header unit lacks a field (from ${render(row.from).length}, to ${render(row.to).length}, cc ${render(row.cc).length} addresses)`));
  // body: what the collection owner's reader yields from the stored record; body
  // chunks are joined in locator order, quoted history after them.
  const ordered = kind => units(kind).sort((a, b) => (a.locator.chunk ?? 0) - (b.locator.chunk ?? 0)).map(u => u.text).join('\n');
  const rawText = mailBodyTextFromRecord(row, { maxChars: MAIL_MAX_BODY_CHARACTERS }) ?? '';
  const bodyText = ordered('body'), quotedText = ordered('quoted');
  const together = squash(`${bodyText}\n${quotedText}`), expected = squash(rawText);
  const chunks = units('body').length + units('quoted').length;
  if (expected.length === 0) checks.push(check('body_preserved', 'not_run', 'original carries no readable body text'));
  else if (together === expected) checks.push(check('body_preserved', 'pass', `${[...expected].length} characters in ${chunks} unit(s); body + quoted history together equal the original text`));
  else if (expected.startsWith(together) && together.length > 0) checks.push(check('body_preserved', 'partial', 'prepared text is a prefix of the original (truncated)'));
  else checks.push(check('body_preserved', 'fail', 'prepared body + quoted history differ from the original text'));
  // order and split: chunk indexes contiguous, body before quoted
  const chunkIds = units('body').map(u => u.locator.chunk).filter(v => v !== undefined).sort((a, b) => a - b);
  const firstQuoted = document.units.findIndex(u => u.unit_kind === 'quoted');
  const lastBody = Math.max(-1, ...document.units.map((u, i) => u.unit_kind === 'body' ? i : -1));
  const orderOk = chunkIds.every((v, i) => v === i) && (firstQuoted === -1 || firstQuoted > lastBody);
  checks.push(check('order_preserved', orderOk ? 'pass' : 'fail', `${units('body').length} body unit(s), ${units('quoted').length} quoted unit(s), chunk order and body-before-quoted`));
  if (row.body_text === null || row.body_text === undefined) {
    if (row.body_html) exclusions.push('body derived from HTML: text is the collection reader\'s conversion of the stored HTML');
  }
  const rawFull = String(row.body_text ?? row.body_html ?? '');
  if ([...rawFull].length > MAIL_MAX_BODY_CHARACTERS) exclusions.push(`original body longer than ${MAIL_MAX_BODY_CHARACTERS} characters: truncated by design`);
  if ([...expected].length > SOURCE_LIMITS.unit_characters && units('body').length === 1) {
    exclusions.push(`original text longer than the unit bound (${SOURCE_LIMITS.unit_characters} characters) and stored as one unit: body unit holds a prefix`);
  }
  const atts = (row.attachments ?? []).filter(a => a && typeof a === 'object');
  const attShas = atts.map(a => a.content_sha256).filter(s => SHA.test(s ?? '')).sort();
  const compShas = document.components.filter(c => c.kind === 'attachment').map(c => c.sha256).sort();
  const countFact = document.facts.find(f => f.name === 'mail.attachment_count')?.value;
  const attOk = JSON.stringify(attShas) === JSON.stringify(compShas) && countFact === atts.length;
  checks.push(check('attachments_preserved', attOk ? 'pass' : 'fail', `${atts.length} attachment(s), ${attShas.length} with digest; ${compShas.length} component digest(s) in document`));
  if (atts.length) exclusions.push('attachment bodies not included: only names and content digests travel');
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
// Every object of one kind that belongs to one issue, all snapshots, keyed by object id.
async function objectsOfIssue(root, kind, issueId) {
  const out = new Map();
  let entries;
  try { entries = await root.list([kind]); } catch { return out; }
  for (const entry of entries) {
    if (entry.file) continue;
    const snapshots = (await readSnapshots(root, kind, entry.name)).filter(s => s.object && s.object.issue_id === issueId);
    if (snapshots.length) out.set(entry.name, snapshots);
  }
  return out;
}
async function stateNames(root, ids) {
  const names = new Map();
  for (const id of ids) {
    if (!id || names.has(id)) continue;
    const latest = (await readSnapshots(root, 'states', id)).filter(s => s.object).at(-1);
    if (latest?.object?.name) names.set(id, latest.object.name);
  }
  return names;
}
// The values a history entry actually changed, as the fragments a faithful
// rendering must carry. Field pairs, state (by resolved name or id), labels,
// relations and flags - the same set the adapter renders, derived here from the
// raw entry so the comparison does not depend on the adapter's own function.
function expectedChangeFragments(entry, names) {
  const fragments = [];
  const pair = (label, from, to) => { if (from !== to && (from !== null || to !== null)) fragments.push({ field: label, text: `${label}: ${from ?? '-'} -> ${to ?? '-'}` }); };
  if (entry.from_state_id !== entry.to_state_id) {
    const name = id => id === null || id === undefined ? '-' : names.get(id) ?? id;
    fragments.push({ field: 'state', text: `state: ${name(entry.from_state_id)} -> ${name(entry.to_state_id)}` });
  }
  pair('title', entry.from_title, entry.to_title); pair('assignee', entry.from_assignee_id, entry.to_assignee_id);
  pair('due_date', entry.from_due_date, entry.to_due_date); pair('priority', entry.from_priority, entry.to_priority);
  pair('estimate', entry.from_estimate, entry.to_estimate); pair('project', entry.from_project_id, entry.to_project_id);
  pair('parent', entry.from_parent_id, entry.to_parent_id); pair('team', entry.from_team_id, entry.to_team_id);
  pair('cycle', entry.from_cycle_id, entry.to_cycle_id);
  for (const id of entry.added_label_ids ?? []) fragments.push({ field: 'labels_added', text: id });
  for (const id of entry.removed_label_ids ?? []) fragments.push({ field: 'labels_removed', text: id });
  for (const change of entry.relation_changes ?? []) fragments.push({ field: 'relation', text: `relation ${change.type}: ${change.identifier}` });
  for (const flag of ['archived', 'auto_archived', 'auto_closed', 'trashed', 'updated_description']) if (entry[flag] === true) fragments.push({ field: flag, text: `${flag}: true` });
  return fragments;
}
async function checkLinear({ document, root, item, preparedAt }) {
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
  const descOk = squash(units('description')[0]?.text ?? '') === squash(issue.description ?? '');
  checks.push(check('fields_preserved', titleOk && descOk ? 'pass' : 'fail', `title ${titleOk ? 'equal' : 'differs'}, description ${descOk ? 'equal' : 'differs'}`));
  if (!issue.description) exclusions.push('empty description: no description unit is kept (empty units are dropped)');
  // comments: each unit against the exact comment revision it recorded
  const comments = await objectsOfIssue(root, 'comments', issue.id);
  const commentUnits = units('comment');
  let commentOk = true, replies = 0; const commentProblems = [];
  for (const unit of commentUnits) {
    const rows = comments.get(unit.locator.comment_id) ?? [];
    const exact = rows.find(r => r.sha256 === unit.locator.revision_sha256);
    if (!exact) { commentOk = false; commentProblems.push(`${unit.locator.comment_id}: recorded revision absent`); continue; }
    const expected = exact.object.quoted_text ? `> ${exact.object.quoted_text}\n${exact.object.body ?? ''}` : exact.object.body ?? '';
    if (squash(unit.text) !== squash(expected) || unit.occurred_at !== exact.object.created_at || unit.locator.parent_id !== (exact.object.parent_id ?? null)) {
      commentOk = false; commentProblems.push(`${unit.locator.comment_id}: text, time or parent differs from its revision`);
    }
    if (exact.object.parent_id) replies += 1;
  }
  const recordedIds = new Set(commentUnits.map(u => u.locator.comment_id));
  // Comments custody held when the document was made but which the document
  // does not carry: empty bodies are dropped by design; anything else is a finding.
  const emptyThen = [...comments.entries()].filter(([id, rows]) => !recordedIds.has(id) && rows.every(r => squash(r.object.body ?? '').length === 0 && !r.object.quoted_text)).length;
  const laterOrMissing = [...comments.entries()].filter(([id, rows]) => !recordedIds.has(id) && !rows.every(r => squash(r.object.body ?? '').length === 0 && !r.object.quoted_text));
  const later = laterOrMissing.filter(([, rows]) => rows.every(r => r.object.created_at > preparedAt));
  const missing = laterOrMissing.length - later.length;
  if (missing > 0) { commentOk = false; commentProblems.push(`${missing} comment(s) present before the issue revision are not in the document`); }
  checks.push(check('comments_preserved', commentOk ? 'pass' : 'fail', `${commentUnits.length} comment unit(s) compared with their exact revisions (${replies} replies); ${emptyThen} empty comment(s) dropped by design${commentProblems.length ? '; ' + commentProblems.join('; ') : ''}`));
  if (later.length) exclusions.push(`later input change: ${later.length} comment(s) added to custody after the prepared issue revision are not in this document`);
  if (emptyThen) exclusions.push(`${emptyThen} comment(s) with empty body: no unit is kept`);
  // history: each unit against its exact entry, and the changed values themselves
  const changes = await objectsOfIssue(root, 'issue_history', issue.id);
  const changeUnits = units('change');
  const stateIds = [...changes.values()].flatMap(rows => rows.flatMap(r => [r.object.from_state_id, r.object.to_state_id]));
  const names = await stateNames(root, stateIds);
  let histOk = true, fieldsCompared = 0, entriesCompared = 0; const histProblems = [];
  for (const unit of changeUnits) {
    const rows = changes.get(unit.locator.history_id) ?? [];
    const exact = rows.find(r => r.sha256 === unit.locator.revision_sha256);
    if (!exact) { histOk = false; histProblems.push(`${unit.locator.history_id}: recorded revision absent`); continue; }
    entriesCompared += 1;
    if (unit.occurred_at !== exact.object.created_at) { histOk = false; histProblems.push(`${unit.locator.history_id}: time differs`); }
    const fragments = expectedChangeFragments(exact.object, names);
    fieldsCompared += fragments.length;
    const lost = fragments.filter(f => !unit.text.includes(f.text));
    if (lost.length) { histOk = false; histProblems.push(`${unit.locator.history_id}: ${lost.map(f => f.field).join(',')} not in rendered change`); }
    if (fragments.length === 0 && !unit.text.includes('change recorded without field differences')) { histOk = false; histProblems.push(`${unit.locator.history_id}: empty change not stated`); }
  }
  const recordedHist = new Set(changeUnits.map(u => u.locator.history_id));
  const laterHist = [...changes.entries()].filter(([id, rows]) => !recordedHist.has(id) && rows.every(r => r.object.created_at > preparedAt)).length;
  const missingHist = [...changes.keys()].filter(id => !recordedHist.has(id)).length - laterHist;
  if (missingHist > 0) { histOk = false; histProblems.push(`${missingHist} history entr(y/ies) present before the issue revision are not in the document`); }
  checks.push(check('history_preserved', histOk ? 'pass' : 'fail', `${entriesCompared} entr(y/ies) compared with their exact revisions by id and time${histProblems.length ? '; ' + histProblems.join('; ') : ''}`));
  checks.push(check('history_values_preserved', histOk ? 'pass' : 'fail', `${fieldsCompared} changed value(s) (state, title, assignee, due date, priority, estimate, project, parent, team, cycle, labels, relations, flags) found in the rendered change text`));
  if (laterHist) exclusions.push(`later input change: ${laterHist} history entr(y/ies) added after the prepared issue revision are not in this document`);
  exclusions.push('history is compared as rendered text: state names resolve through custody states; ids of assignee, project, parent, team, cycle and labels are compared as ids');
  const timeOk = document.valid_at === issue.updated_at && units('title')[0]?.occurred_at === issue.updated_at;
  checks.push(check('time_preserved', timeOk ? 'pass' : 'fail', 'issue updated_at kept as valid_at and title time'));
  const fact = name => document.facts.find(f => f.name === name)?.value ?? null;
  const relOk = fact('linear.project_id') === (issue.project_id ?? null) && fact('linear.identifier') === issue.identifier;
  checks.push(check('relations_preserved', relOk ? 'pass' : 'fail', 'project id and identifier facts'));
  if ((issue.relations ?? []).length) exclusions.push(`${issue.relations.length} issue relation(s) are not restated as units (kept in custody)`);
  return { checks, exclusions };
}

// ---- slack -------------------------------------------------------------------
async function checkSlack({ document, root, item, preparedAt }) {
  const checks = [], exclusions = [];
  const { state, rawDigests, held } = await readChannelState(root);
  const rawByTs = await readRawEvents(root, rawDigests);
  const byDigest = new Map([...rawByTs.values()].flat().map(entry => [entry.digest, entry]));
  const units = kind => document.units.filter(u => u.unit_kind === kind);
  const head = units('message')[0] ?? units('file_share')[0] ?? null;
  if (!head || head.locator.message_ts !== item.item_id) return { checks: [check('locator_valid', 'fail', 'message unit missing or names another ts')], exclusions };
  const rawEntry = byDigest.get(document.primary_revision_sha256);
  if (!rawEntry || rawEntry.raw.ts !== item.item_id) return { checks: [check('original_found', 'fail', 'prepared raw digest not among custody raw events for this ts')], exclusions };
  checks.push(check('original_found', 'pass', 'raw event present under its content digest'));
  const revision = state.revisions.find(rev => rev.revision_ref === head.locator.revision_ref && rev.message_ts === item.item_id);
  checks.push(check('locator_valid', revision ? 'pass' : 'fail', revision ? 'revision ref and ts resolve in channel state' : 'revision ref not in channel state'));
  if (head.unit_kind === 'message') {
    const textOk = squash(head.text) === squash(rawEntry.raw.text ?? '');
    checks.push(check('body_preserved', textOk ? 'pass' : 'fail', `${[...squash(rawEntry.raw.text ?? '')].length} characters`));
  } else {
    // A file share: no text in the original, and the unit must be exactly the
    // stored pointer metadata of the recorded revision - nothing more.
    const pointers = (revision?.attachment_pointers ?? []).filter(p => p && SHA.test(p.content_sha256 ?? ''));
    const metaOk = squash(rawEntry.raw.text ?? '').length === 0 && squash(head.text) === squash(fileShareText(pointers));
    checks.push(check('body_preserved', metaOk ? 'pass' : 'fail', `file share: original has no text; unit holds ${pointers.length} stored file pointer(s) verbatim`));
    exclusions.push('file share without text: the unit is stored file metadata (id, type, size, digest), not a body; attachment bytes not processed');
  }
  if (Array.isArray(rawEntry.raw.blocks) && rawEntry.raw.blocks.length) exclusions.push('rich-text blocks are not restated; the plain text field is what is kept');
  // replies: each unit against the exact raw revision it recorded
  const replyUnits = units('reply');
  let repliesOk = true; const problems = [];
  for (const unit of replyUnits) {
    const exact = byDigest.get(unit.locator.raw_sha256);
    if (!exact || exact.raw.ts !== unit.locator.message_ts) { repliesOk = false; problems.push(`${unit.locator.message_ts}: recorded raw revision absent`); continue; }
    if (squash(unit.text) !== squash(exact.raw.text ?? '') || unit.occurred_at !== slackTsToIso(unit.locator.message_ts)) { repliesOk = false; problems.push(`${unit.locator.message_ts}: text or time differs`); }
  }
  const recorded = new Set(replyUnits.map(u => u.locator.message_ts));
  const custodyReplies = state.revisions.filter(rev => rev.thread_ts === item.item_id && rev.message_ts !== item.item_id);
  const later = custodyReplies.filter(rev => !recorded.has(rev.message_ts) && slackTsToIso(rev.message_ts) > preparedAt).length;
  const missing = custodyReplies.filter(rev => !recorded.has(rev.message_ts)).length - later;
  if (missing > 0) { repliesOk = false; problems.push(`${missing} repl(y/ies) in custody before the root time are not in the document`); }
  checks.push(check('comments_preserved', repliesOk ? 'pass' : 'fail', `${replyUnits.length} reply unit(s) compared with their exact raw revisions${problems.length ? '; ' + problems.join('; ') : ''}`));
  if (later) exclusions.push(`later input change: ${later} repl(y/ies) added to custody after the root message are not in this document`);
  const pointers = [revision].filter(Boolean).flatMap(rev => rev.attachment_pointers ?? []).map(p => p.content_sha256).filter(Boolean)
    .concat(replyUnits.flatMap(u => (state.revisions.find(rev => rev.revision_ref === u.locator.revision_ref)?.attachment_pointers ?? []).map(p => p.content_sha256))).filter(Boolean).sort();
  const components = document.components.filter(c => c.kind === 'attachment').map(c => c.sha256).sort();
  const attOk = JSON.stringify(pointers) === JSON.stringify(components);
  checks.push(check('attachments_preserved', attOk ? 'pass' : 'fail', `${pointers.length} attachment pointer(s), ${components.length} component digest(s)`));
  if (pointers.length) exclusions.push('attachment bodies not included: only file ids, mime types and content digests travel');
  const timeOk = document.valid_at === slackTsToIso(item.item_id) && head.occurred_at === document.valid_at;
  checks.push(check('time_preserved', timeOk ? 'pass' : 'fail', 'message ts kept as valid_at and unit time'));
  const fact = name => document.facts.find(f => f.name === name)?.value ?? null;
  const relOk = fact('slack.channel_id') === revision?.channel_id && fact('slack.reply_count') === replyUnits.length
    && fact('slack.attachment_bodies_processed') === false;
  checks.push(check('relations_preserved', relOk ? 'pass' : 'fail', 'channel id, reply count and attachment-bodies-not-processed facts'));
  if (held) exclusions.push(`${held} event(s) in this channel are policy-held: raw body never stored, so they are not documents and are not compared`);
  return { checks, exclusions };
}

const CHECKERS = Object.freeze({ mail: checkMail, linear: checkLinear, slack: checkSlack });

/**
 * Compares each stored document with its original. `roots` maps root_ref to the
 * absolute source root (from the binding); `grant` supplies the items. Kinds
 * without a checker are reported as not_run, never as pass.
 */
export async function checkDocumentsAgainstOriginals({ documents, grant, roots, checkRunId, checkedAt, preparedAt = null } = {}) {
  if (!Array.isArray(documents) || !grant || !roots || typeof checkRunId !== 'string' || typeof checkedAt !== 'string') fail('source_check_input_invalid');
  // `preparedAt` is when the preparation ran (the run record's end). Comments,
  // history and replies custody gained after it are later input change, not a
  // defect of this document. Without it nothing can be called later, so every
  // unrecorded item counts as missing - the stricter reading.
  const preparedBoundary = typeof preparedAt === 'string' ? preparedAt : '￿';
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
        ({ checks, exclusions } = await checker({ document, root: opened.get(document.root_ref), item, preparedAt: preparedBoundary }));
      } catch (error) {
        checks = [check('original_read', 'fail', `original could not be read: ${error?.code ?? 'error'}`)];
      }
    }
    perDocument.push({ doc_key: document.doc_key, source_kind: document.source_kind, item_id: document.item_id,
      primary_revision_sha256: document.primary_revision_sha256, outcome: rollup(checks), checks, exclusions });
  }
  const counts = { documents: perDocument.length };
  for (const outcome of CHECK_OUTCOMES) counts[outcome] = perDocument.filter(d => d.outcome === outcome).length;
  counts.checks_not_run = perDocument.reduce((sum, d) => sum + d.checks.filter(c => c.outcome === 'not_run').length, 0);
  let documentsSha256 = null;
  try { documentsSha256 = documentsDigest(documents); } catch { documentsSha256 = null; }
  const outcome = documentsSha256 === null ? 'fail' : rollup(perDocument);
  if (documentsSha256 === null) counts.documents_invalid = true;
  const body = { schema_version: SOURCE_CHECK_SCHEMA, check_run_id: checkRunId, checker_id: CHECKER_ID, checker_version: CHECKER_VERSION,
    checker_code_digest: checkerCodeDigest(), check_policy: SOURCE_CHECK_POLICY_ID,
    project_key: grant.project_key ?? perDocument[0]?.project_key ?? null,
    documents_sha256: documentsSha256, checked_at: checkedAt, prepared_at: typeof preparedAt === 'string' ? preparedAt : null, counts, outcome,
    documents: perDocument,
    scope: { compared: ['mail: header fields, body+quoted text, attachment digests, time, thread/message ids, recipient counts, chunk order',
      'linear: exact issue revision, title, description, each comment by its exact revision (text, time, parent), each history entry by its exact revision (time) and its changed values, project id, identifier',
      'slack: exact raw event by digest, text or stored file-share metadata, each reply by its exact raw revision, attachment pointers, time, channel'],
    not_compared: ['attachment bytes of any kind', 'mail HTML rendering beyond the collection reader\'s text', 'Linear relations and label names (ids only)', 'Slack rich-text blocks, reactions and edits history',
      'anything custody gained after the recorded revision (reported as later input change, not compared)'] },
    limits: ['Originals are read by the collection owner\'s reader from the bound source root; the checker does not re-run the preparer.',
      'Text comparison ignores whitespace runs and line breaks only; characters must match.',
      'A pass says the prepared document carries what the original holds under this policy; it does not judge the original\'s truth.',
      'Kinds without a checker are not_run, and a not_run never rolls up to pass.'] };
  return Object.freeze({ ...body, report_sha256: totalDigest(body) });
}

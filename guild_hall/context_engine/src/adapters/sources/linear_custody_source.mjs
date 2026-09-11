// Read-only source adapter over the Linear collection custody written by
// guild_hall/linear_history. It reads only granted issues plus their comments and
// change log, re-verifies every create-only custody digest and never calls Linear.
// Linear project membership is reported as a fact; project attribution comes only
// from the grant.
import { sha256Canonical } from '../../../../shared/project_history_envelope.mjs';
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, SourceDocumentError } from '../../runtime/source_documents.mjs';

export const LINEAR_SOURCE_ADAPTER = 'linear-custody-v1';
const CUSTODY_SCHEMA = 'soulforge.linear_collect.custody_object.v1';
const OBJECT_FILE = /^([0-9a-f]{64})\.json$/u;
const MAX_OBJECT_BYTES = 1024 * 1024;

class LinearSourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new LinearSourceError(code); };
const ordered = (a, b) => (a.object.updated_at ?? a.object.created_at).localeCompare(b.object.updated_at ?? b.object.created_at)
  || a.sha256.localeCompare(b.sha256);

async function readObjectSnapshots(root, kind, objectId) {
  const rows = [];
  for (const entry of await root.list([kind, objectId])) {
    const match = entry.file ? OBJECT_FILE.exec(entry.name) : null;
    if (!match) continue;
    const { text } = await root.readText([kind, objectId, entry.name], MAX_OBJECT_BYTES);
    let record;
    try { record = JSON.parse(text); } catch { fail('custody_shape_invalid'); }
    const sha256 = `sha256:${match[1]}`;
    if (record?.schema_version !== CUSTODY_SCHEMA || record.kind !== kind || record.object_id !== objectId
      || record.content_sha256 !== sha256 || Object.keys(record).length !== 5 || record.object?.id !== objectId) {
      fail('custody_shape_invalid');
    }
    if (sha256Canonical(record.object) !== sha256) fail('custody_digest_mismatch');
    rows.push({ sha256, object: record.object });
  }
  return rows.sort(ordered);
}

// Latest snapshot per object among all objects of one kind that belong to one issue.
async function relatedLatest(root, kind, issueIds) {
  const byIssue = new Map(issueIds.map(id => [id, []]));
  if (byIssue.size === 0) return byIssue;
  for (const entry of await root.list([kind])) {
    if (!entry.directory) continue;
    const snapshots = await readObjectSnapshots(root, kind, entry.name);
    const latest = snapshots.at(-1);
    if (latest && byIssue.has(latest.object.issue_id)) byIssue.get(latest.object.issue_id).push({ id: entry.name, ...latest });
  }
  return byIssue;
}

async function stateNames(root) {
  const names = new Map();
  for (const entry of await root.list(['states'])) {
    if (!entry.directory) continue;
    const latest = (await readObjectSnapshots(root, 'states', entry.name)).at(-1);
    if (latest && typeof latest.object.name === 'string') names.set(entry.name, latest.object.name);
  }
  return names;
}

function renderChange(entry, states) {
  const name = id => (id === null || id === undefined) ? '-' : states.get(id) ?? id;
  const lines = [];
  const pair = (label, from, to) => { if (from !== to && (from !== null || to !== null)) lines.push(`${label}: ${from ?? '-'} -> ${to ?? '-'}`); };
  if (entry.from_state_id !== entry.to_state_id) lines.push(`state: ${name(entry.from_state_id)} -> ${name(entry.to_state_id)}`);
  pair('title', entry.from_title, entry.to_title);
  pair('assignee', entry.from_assignee_id, entry.to_assignee_id);
  pair('due_date', entry.from_due_date, entry.to_due_date);
  pair('priority', entry.from_priority, entry.to_priority);
  pair('estimate', entry.from_estimate, entry.to_estimate);
  pair('project', entry.from_project_id, entry.to_project_id);
  pair('parent', entry.from_parent_id, entry.to_parent_id);
  pair('team', entry.from_team_id, entry.to_team_id);
  pair('cycle', entry.from_cycle_id, entry.to_cycle_id);
  if (entry.added_label_ids?.length) lines.push(`labels added: ${entry.added_label_ids.join(', ')}`);
  if (entry.removed_label_ids?.length) lines.push(`labels removed: ${entry.removed_label_ids.join(', ')}`);
  for (const change of entry.relation_changes ?? []) lines.push(`relation ${change.type}: ${change.identifier}`);
  for (const flag of ['archived', 'auto_archived', 'auto_closed', 'trashed', 'updated_description']) {
    if (entry[flag] === true) lines.push(`${flag}: true`);
  }
  return lines.join('\n') || 'change recorded without field differences';
}

function speaker(prefix, id) { return typeof id === 'string' && id ? `linear.${prefix}:${id}` : null; }

function documentFor({ admitted, source, item, issue, comments, changes, states }) {
  const ref = { issue_id: issue.object.id, identifier: issue.object.identifier, revision_sha256: issue.sha256 };
  const units = [
    { unit_kind: 'title', locator: { ...ref, field: 'title' }, text: issue.object.title, occurred_at: issue.object.updated_at },
    { unit_kind: 'description', locator: { ...ref, field: 'description' }, text: issue.object.description ?? '',
      occurred_at: issue.object.updated_at },
    ...comments.sort((a, b) => a.object.created_at.localeCompare(b.object.created_at) || a.id.localeCompare(b.id)).map(row => ({
      unit_kind: 'comment', locator: { issue_id: ref.issue_id, comment_id: row.id, revision_sha256: row.sha256,
        parent_id: row.object.parent_id ?? null },
      text: row.object.quoted_text ? `> ${row.object.quoted_text}\n${row.object.body ?? ''}` : row.object.body ?? '',
      occurred_at: row.object.created_at, speaker_ref: speaker('user', row.object.user_id) })),
    ...changes.sort((a, b) => a.object.created_at.localeCompare(b.object.created_at) || a.id.localeCompare(b.id)).map(row => ({
      unit_kind: 'change', locator: { issue_id: ref.issue_id, history_id: row.id, revision_sha256: row.sha256 },
      text: renderChange(row.object, states), occurred_at: row.object.created_at,
      speaker_ref: speaker('user', row.object.actor_id) ?? speaker('bot', row.object.bot_actor?.type) })),
  ];
  const at = issue.object.updated_at;
  const facts = [
    { name: 'linear.identifier', value: issue.object.identifier, at: null },
    { name: 'linear.state', value: issue.object.state_name, at },
    { name: 'linear.state_type', value: issue.object.state_type, at },
    { name: 'linear.project_id', value: issue.object.project_id ?? null, at },
    { name: 'linear.due_date', value: issue.object.due_date ?? null, at },
    { name: 'linear.completed_at', value: issue.object.completed_at ?? null, at },
    { name: 'linear.canceled_at', value: issue.object.canceled_at ?? null, at },
  ];
  return buildSourceDocument({ admitted, sourceKind: 'linear', rootRef: source.root_ref, item,
    adapterProfile: LINEAR_SOURCE_ADAPTER, primaryRevisionSha256: issue.sha256,
    components: [...comments.map(row => ({ kind: 'comment', id: row.id, sha256: row.sha256 })),
      ...changes.map(row => ({ kind: 'change', id: row.id, sha256: row.sha256 }))],
    title: `${issue.object.identifier} ${issue.object.title}`, validAt: at, knownAt: null,
    timeBasis: 'provider_updated_at_capture_unknown', facts, units });
}

const codeOf = error => (error instanceof LinearSourceError || error instanceof SourceReadError
  || error instanceof SourceDocumentError) ? error.code : 'adapter_failed';

// One granted Linear source. Returns the documents and one result per item.
export async function readLinearSourceDocuments({ admitted, source, rootPath }) {
  const results = [], documents = [];
  const outcome = (item, status, extra = {}) => results.push({ source_kind: 'linear', root_ref: source.root_ref,
    item_id: item.item_id, status, ...extra });
  let root, comments, changes, states;
  try {
    root = openSourceRoot(rootPath);
    const issueIds = source.items.map(item => item.item_id);
    comments = await relatedLatest(root, 'comments', issueIds);
    changes = await relatedLatest(root, 'issue_history', issueIds);
    states = await stateNames(root);
  } catch (error) {
    for (const item of source.items) outcome(item, 'failed', { code: codeOf(error) });
    return { documents, results };
  }
  for (const item of source.items) {
    try {
      const snapshots = await readObjectSnapshots(root, 'issues', item.item_id);
      if (snapshots.length === 0) { outcome(item, 'missing', { code: 'source_missing' }); continue; }
      const issue = item.revision_policy === 'exact'
        ? snapshots.find(row => row.sha256 === item.revision_sha256) : snapshots.at(-1);
      if (!issue) { outcome(item, 'stale_grant', { code: 'granted_revision_absent' }); continue; }
      const document = documentFor({ admitted, source, item, issue, comments: comments.get(item.item_id) ?? [],
        changes: changes.get(item.item_id) ?? [], states });
      documents.push(document);
      outcome(item, 'prepared', { composite_revision_sha256: document.composite_revision_sha256, doc_key: document.doc_key });
    } catch (error) {
      outcome(item, 'failed', { code: codeOf(error) });
    }
  }
  return { documents, results };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readMailHistory, readSlackHistory } from '../../src/knowledge_layer/history_mail_slack.mjs';
import { MAIL_ATTRIBUTION_INDEX_SCHEMA } from '../../src/runtime/mail_routes.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';

const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const PROJECT = 'P26-001', OTHER = 'P26-002', NOW = '2026-09-24T00:00:00Z';
const tmp = async () => mkdtemp(path.join(os.tmpdir(), 'history-native-synthetic-'));
function index(rows, builtAt = NOW, ownerTables = []) {
  const body = { schema_version: MAIL_ATTRIBUTION_INDEX_SCHEMA, built_at: builtAt,
    inputs: { org_config_sha256: hash('synthetic'), owner_tables: ownerTables, owner_tables_missing: [] },
    counts: { attributed: rows.length }, attributions: rows.map(([mail_id, project, strength]) =>
      ({ mail_id, projects: [project], strength, basis: 'synthetic' })) };
  const { built_at: _builtAt, ...content } = body;
  return { ...body, content_sha256: hash(JSON.stringify(content)) };
}
const mail = (event_id, received_at, body_text, extra = {}) => ({
  schema_version: 'email.fetch.event.v1', event_id, source: 'synthetic',
  provider_message_id: event_id, thread_id: 'thread-1', subject: '요청',
  from: [{ name: '담당자', address: 'sender@example.invalid' }],
  to: [{ name: '수신자', address: 'target@example.invalid' }], cc: [],
  received_at, ingested_at: '2026-09-23T13:00:00Z', body_text, body_html: null,
  attachments: [], ...extra,
});
test('mail binds Owner tables in two explicit directories and rejects changed bytes', async () => {
  const f = await mailFixture();
  try {
    const firstDir = path.join(f.root, 'rules'), secondDir = path.join(f.root, 'decisions');
    await mkdir(firstDir); await mkdir(secondDir);
    const first = path.join(firstDir, 'subject.csv'), second = path.join(secondDir, 'reading.csv');
    await writeFile(first, 'subject,project\nexample,P26-001\n');
    await writeFile(second, 'mail_id,decision\nm1,include\n');
    const ownerTables = [
      { file: 'subject.csv', sha256: hash('subject,project\nexample,P26-001\n') },
      { file: 'reading.csv', sha256: hash('mail_id,decision\nm1,include\n') },
    ];
    const routes = [
      ['m1', PROJECT, 'confirmed'], ['m2', PROJECT, 'unconfirmed'],
      ['m3', OTHER, 'confirmed'], ['m4', PROJECT, 'confirmed'],
    ];
    await writeFile(f.indexPath, JSON.stringify(index(routes, NOW, ownerTables)));
    const config = { ...mailArgs(f).config,
      owner_table_paths: { 'subject.csv': first, 'reading.csv': second } };
    assert.equal((await readMailHistory({ ...mailArgs(f), config })).records.length, 1);
    await writeFile(second, 'mail_id,decision\nm1,hold\n');
    await assert.rejects(readMailHistory({ ...mailArgs(f), config }),
      { code: 'mail_attribution_index_owner_tables_changed' });
    await assert.rejects(readMailHistory({ ...mailArgs(f),
      config: { ...config, owner_table_paths: { 'subject.csv': first } } }),
    { code: 'mail_attribution_index_owner_tables_unavailable' });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('mail accepts native YYYY-MM.jsonl in an explicit year directory and rejects invalid months', async () => {
  const f = await mailFixture();
  try {
    await rename(path.join(f.year, '09.jsonl'), path.join(f.year, '2026-09.jsonl'));
    const native = await readMailHistory(mailArgs(f));
    assert.equal(native.records.length, 1);
    assert.equal(native.records[0].originrefs[0].event_path, path.join(f.year, '2026-09.jsonl'));
    await writeFile(path.join(f.year, '2026-13.jsonl'), '');
    await assert.rejects(readMailHistory(mailArgs(f)), { code: 'mail_event_filename_invalid' });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('mail opens only relevant month partitions and includes a UTC August event on KST September 1', async () => {
  const f = await mailFixture();
  try {
    await writeFile(path.join(f.year, '2026-08.jsonl'), 'x'.repeat(100_000));
    const narrow = mailArgs(f);
    narrow.config.max_bytes = 40_000;
    const sep23 = await readMailHistory(narrow);
    assert.equal(sep23.records.length, 1);
    assert.equal(sep23.receipt.counts.files, 1);
    const boundary = mail('m1', '2026-08-31T15:00:00Z', '월경계 내용');
    await writeFile(path.join(f.year, '2026-08.jsonl'), JSON.stringify(boundary) + '\n');
    const sep1 = await readMailHistory({ ...narrow, fromDate: '2026-09-01', throughDate: '2026-09-01' });
    assert.equal(sep1.records.length, 1);
    assert.equal(sep1.records[0].date, '2026-09-01');
    assert.equal(sep1.receipt.counts.files, 2);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
async function mailFixture() {
  const root = await tmp(), year = path.join(root, '2026');
  await mkdir(year);
  const indexPath = path.join(root, 'index.json');
  await writeFile(indexPath, JSON.stringify(index([
    ['m1', PROJECT, 'confirmed'], ['m2', PROJECT, 'unconfirmed'],
    ['m3', OTHER, 'confirmed'], ['m4', PROJECT, 'confirmed'],
  ])));
  const rows = [
    mail('m1', '2026-09-23T14:59:59Z', '본문\n\n-----Original Message-----\n옛 요청',
      { attachments: [{ name: 'drawing.pdf', type: 'file', content_sha256: hash('attachment') }] }),
    mail('m1', '2026-09-23T14:59:59Z', '본문\n\n-----Original Message-----\n옛 요청',
      { ingested_at: '2026-09-23T15:00:00Z' }),
    mail('m2', '2026-09-23T15:00:00Z', '검토 필요'),
    mail('m3', '2026-09-23T12:00:00Z', '타 과제'),
    mail('m4', '2026-09-23T12:00:00Z', '자동 메모', { subject: '[AI] 자동 메모' }),
  ];
  await writeFile(path.join(year, '09.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  return { root, year, indexPath, rows };
}
const mailArgs = f => ({ project: PROJECT, fromDate: '2026-09-23', throughDate: '2026-09-23',
  now: NOW, config: { project: PROJECT, index_path: f.indexPath, event_dirs: [f.year],
    strengths: ['confirmed', 'unconfirmed'], ai_note_subject_prefixes: ['[AI]'] } });
test('mail uses routed IDs and received KST day; duplicate custody keeps earliest and attachment metadata', async () => {
  const f = await mailFixture();
  try {
    const out = await readMailHistory(mailArgs(f));
    assert.equal(out.receipt.status, 'ok');
    assert.equal(out.records.length, 1);
    assert.equal(out.records[0].date, '2026-09-23');
    assert.equal(out.records[0].text, '본문');
    assert.deepEqual(out.records[0].attachments, ['drawing.pdf']);
    assert.equal(out.records[0].originrefs[0].attribution.strength, 'confirmed');
    assert.equal(out.displayMetadata.person_names['sender@example.invalid'], '담당자');
    assert.deepEqual(out.displayMetadata.source_attachments[out.records[0].id], ['drawing.pdf']);
    assert.equal(out.records[0].originrefs[0].attachment_metadata[0].type, 'binary_attachment');
    assert.equal(out.excluded[0].reason, 'configured_ai_subject');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('mail display excludes only collector-marked body inline images', async () => {
  const f = await mailFixture();
  try {
    const row = mail('m1', '2026-09-23T14:59:59Z', '본문', { attachments: [
      { type: 'binary_attachment', name: 'signature.png', metadata: { body_inline_image: true } },
      { type: 'binary_attachment', name: 'image001.png', metadata: { body_inline_image: false } },
      { type: 'binary_attachment', name: 'drawing.pdf' },
    ] });
    await writeFile(path.join(f.year, '09.jsonl'), JSON.stringify(row) + '\n');
    const out = await readMailHistory(mailArgs(f));
    assert.equal(out.records.length, 1);
    assert.deepEqual(out.records[0].attachments, ['image001.png', 'drawing.pdf']);
    assert.deepEqual(out.displayMetadata.source_attachments[out.records[0].id],
      ['image001.png', 'drawing.pdf']);
    assert.deepEqual(out.records[0].originrefs[0].attachment_metadata
      .map(item => item.body_inline_image), [true, false, false]);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('mail record fingerprint follows its own attribution, not index build time or other mail routes', async () => {
  const f = await mailFixture();
  try {
    const routes = [
      ['m1', PROJECT, 'confirmed'], ['m2', PROJECT, 'unconfirmed'],
      ['m3', OTHER, 'confirmed'], ['m4', PROJECT, 'confirmed'],
    ];
    const before = await readMailHistory(mailArgs(f));
    await writeFile(f.indexPath, JSON.stringify(index(routes, '2026-09-23T23:00:00Z')));
    const rebuilt = await readMailHistory(mailArgs(f));
    assert.notEqual(rebuilt.receipt.index_sha256, before.receipt.index_sha256);
    assert.deepEqual(rebuilt.records, before.records);
    routes[2] = ['m3', PROJECT, 'confirmed'];
    await writeFile(f.indexPath, JSON.stringify(index(routes, '2026-09-23T23:10:00Z')));
    const otherRouteChanged = await readMailHistory(mailArgs(f));
    assert.deepEqual(otherRouteChanged.records.find(row => row.id === before.records[0].id), before.records[0]);
    routes[0] = ['m1', PROJECT, 'unconfirmed'];
    await writeFile(f.indexPath, JSON.stringify(index(routes, '2026-09-23T23:20:00Z')));
    const changedStrength = await readMailHistory(mailArgs(f));
    assert.notDeepEqual(changedStrength.records.find(row => row.id === before.records[0].id), before.records[0]);
    routes[0] = ['m1', OTHER, 'confirmed'];
    await writeFile(f.indexPath, JSON.stringify(index(routes, '2026-09-23T23:30:00Z')));
    const changedProject = await readMailHistory(mailArgs(f));
    assert.equal(changedProject.records.some(row => row.id === before.records[0].id), false);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('mail fails closed on project mismatch, body conflict, and missing event directory', async () => {
  const f = await mailFixture();
  try {
    await assert.rejects(readMailHistory({ ...mailArgs(f), config: { ...mailArgs(f).config, project: OTHER } }),
      { code: 'history_source_project_mismatch' });
    f.rows[1].body_text = '다른 본문';
    await writeFile(path.join(f.year, '09.jsonl'), f.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    await assert.rejects(readMailHistory(mailArgs(f)), { code: 'mail_duplicate_body_conflict' });
    await assert.rejects(readMailHistory({ ...mailArgs(f), config: { ...mailArgs(f).config,
      event_dirs: [path.join(f.root, 'missing')] } }), { code: 'source_root_unavailable' });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('two copies with no new body cannot be collapsed as one mail event', async () => {
  const f = await mailFixture();
  try {
    f.rows[0].body_text = '';
    f.rows[1].body_text = '';
    await writeFile(path.join(f.year, '09.jsonl'), f.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    await assert.rejects(readMailHistory(mailArgs(f)), { code: 'mail_duplicate_empty_body' });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
async function slackFixture() {
  const root = await tmp();
  await mkdir(path.join(root, 'state'));
  const channel_id = 'C0SYN0001';
  const raws = [
    { type: 'message', ts: '1790175599.000001', user: 'U1', text: '첫 의견', reactions: [{ name: 'thumbsup' }],
      files: [{ name: 'plan.pdf', title: '계획' }] },
    { type: 'message', ts: '1790175600.000002', thread_ts: '1790175599.000001',
      user: 'U2', text: '회신' },
    { type: 'message', ts: '1790175599.000003', user: 'UAI', text: '자동 기록' },
  ];
  const revisions = [], custody_receipts = [];
  for (const raw of raws) {
    const bytes = JSON.stringify(raw), digest = hash(bytes), hex = digest.slice(7);
    await mkdir(path.join(root, 'raw', 'sha256', hex.slice(0, 2)), { recursive: true });
    await writeFile(path.join(root, 'raw', 'sha256', hex.slice(0, 2), hex + '.json'), bytes);
    custody_receipts.push({ raw_digest: digest, raw_ref: 'slack-raw:' + hex, source_refs: [] });
    const { reactions: _reactions, ...identity } = raw;
    revisions.push({ message_ts: raw.ts, channel_id,
      thread_ts: raw.thread_ts ?? null, revision_kind: raw.thread_ts ? 'reply' : 'message',
      revision_ref: 'slack-rev:' + hex, revision_ts: raw.ts, source_metadata_digest: sha256Canonical(identity),
      actor: { slack_user_id: raw.user }, attachment_pointers: [] });
  }
  await writeFile(path.join(root, 'state', 'slack-continuous.json'),
    JSON.stringify({ revisions, custody_receipts, hold_receipts: [] }));
  const names = path.join(root, 'names.json');
  await writeFile(names, JSON.stringify({ U1: '사람 1', U2: '사람 2' }));
  return { root, channel_id, names };
}
test('Slack selects own timestamp for replies, preserves thread and exact configured AI exclusion', async () => {
  const f = await slackFixture();
  try {
    const out = await readSlackHistory({ project: PROJECT, fromDate: '2026-09-23',
      throughDate: '2026-09-24', config: { project: PROJECT,
        channels: [{ root: f.root, channel_id: f.channel_id }],
        names_path: f.names, ai_note_user_ids: ['UAI'] } });
    assert.equal(out.records.length, 2);
    assert.equal(out.records[0].date, '2026-09-23');
    assert.equal(out.records[1].thread_ref, out.records[0].thread_ref);
    assert.deepEqual(out.records[0].attachments, ['plan.pdf']);
    assert.equal(out.excluded[0].reason, 'configured_ai_user');
    assert.equal(out.displayMetadata.slack_names.U1, '사람 1');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('Slack selects latest edit, then excludes a deleted latest revision without inventing body', async () => {
  const f = await slackFixture();
  try {
    const statePath = path.join(f.root, 'state', 'slack-continuous.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const raw = { type: 'message', subtype: 'message_changed', ts: '1790175700.000001',
      message: { ts: '1790175599.000001', user: 'U1', text: '수정된 의견' } };
    const bytes = JSON.stringify(raw), digest = hash(bytes), hex = digest.slice(7);
    await mkdir(path.join(f.root, 'raw', 'sha256', hex.slice(0, 2)), { recursive: true });
    await writeFile(path.join(f.root, 'raw', 'sha256', hex.slice(0, 2), hex + '.json'), bytes);
    state.custody_receipts.push({ raw_digest: digest, raw_ref: 'slack-raw:' + hex, source_refs: [] });
    state.revisions.push({ ...state.revisions[0], revision_kind: 'edit',
      revision_ref: 'slack-rev:' + hex, revision_ts: raw.ts,
      source_metadata_digest: sha256Canonical(raw), attachment_pointers: [] });
    await writeFile(statePath, JSON.stringify(state));
    const args = { project: PROJECT, fromDate: '2026-09-23', throughDate: '2026-09-24',
      config: { project: PROJECT, channels: [{ root: f.root, channel_id: f.channel_id }],
        names_path: f.names, ai_note_user_ids: ['UAI'] } };
    const edited = await readSlackHistory(args);
    assert.equal(edited.records.find(row => row.sender === 'U1').text, '수정된 의견');
    raw.producer_class = 'ai_work_memo'; raw.ts = '1790175750.000001';
    const aiBytes = JSON.stringify(raw), aiDigest = hash(aiBytes), aiHex = aiDigest.slice(7);
    await mkdir(path.join(f.root, 'raw', 'sha256', aiHex.slice(0,2)), { recursive: true });
    await writeFile(path.join(f.root, 'raw', 'sha256', aiHex.slice(0,2), aiHex+'.json'), aiBytes);
    state.custody_receipts.push({ raw_digest: aiDigest, raw_ref: 'slack-raw:'+aiHex, source_refs: [] });
    state.revisions.push({ ...state.revisions[0], revision_kind: 'edit', revision_ref: 'slack-rev:'+aiHex,
      revision_ts: raw.ts, source_metadata_digest: sha256Canonical(raw), attachment_pointers: [] });
    await writeFile(statePath,JSON.stringify(state));
    const memoEdit = await readSlackHistory(args);
    assert.equal(memoEdit.records.some(row=>row.sender==='U1'),false);
    assert.ok(memoEdit.excluded.some(row=>row.reason==='explicit_ai_work_note'));
    state.revisions.push({ ...state.revisions[0], revision_kind: 'delete',
      revision_ref: 'slack-rev:deleted', revision_ts: '1790175800.000001',
      source_metadata_digest: null });
    await writeFile(statePath, JSON.stringify(state));
    const deleted = await readSlackHistory(args);
    assert.equal(deleted.records.some(row => row.sender === 'U1'), false);
    assert.equal(deleted.excluded.some(row => row.reason === 'deleted_or_held_revision'), true);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('Slack reports historical held receipts separately from holds in the requested KST window', async () => {
  const f = await slackFixture();
  try {
    const statePath = path.join(f.root, 'state', 'slack-continuous.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.hold_receipts = [
      { event_id: 'old-hold', received_at: '2026-07-01T00:00:00Z' },
      { event_id: 'current-hold', received_at: '2026-09-23T15:00:00Z' },
      { event_id: 'unknown-hold' },
    ];
    await writeFile(statePath, JSON.stringify(state));
    const out = await readSlackHistory({ project: PROJECT, fromDate: '2026-09-23',
      throughDate: '2026-09-24', config: { project: PROJECT,
        channels: [{ root: f.root, channel_id: f.channel_id }] } });
    assert.equal(out.receipt.counts.held_total, 3);
    assert.equal(out.receipt.counts.held, 1);
    assert.equal(out.receipt.counts.held_time_unknown, 1);
    assert.equal(out.receipt.status, 'hold');
    assert.equal(out.excluded.filter(item => item.reason === 'custody_hold').length, 1);
    state.hold_receipts = state.hold_receipts.slice(0, 1);
    await writeFile(statePath, JSON.stringify(state));
    const historicalOnly = await readSlackHistory({ project: PROJECT, fromDate: '2026-09-23',
      throughDate: '2026-09-24', config: { project: PROJECT,
        channels: [{ root: f.root, channel_id: f.channel_id }] } });
    assert.equal(historicalOnly.receipt.status, 'ok');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

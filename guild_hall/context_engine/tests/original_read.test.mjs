// Reading one item of a generation back to its original, over a synthetic estate.
//
// The fixture is a whole small estate rather than a stub: two root classes, a
// project store in the declared template, an ACL, a grant, a binding, a complete
// generation with its pointer, and three kinds of collected custody beside it
// (Slack channel, mail event sink, document folder) with real attachment bytes.
// Nothing here touches collected material: every root is a fresh temp directory
// and no host path appears in this file.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE as TEMPLATE } from '../../path_registry/src/target_materializer.mjs';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { exactRefIdentityKey } from '../../engineering_engine/kernel/identity.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { GRAPH_INDEX_BINDING_MODE, GRAPH_INDEX_MANIFEST_SCHEMA, GRAPH_INDEX_POINTER_SCHEMA,
  GRAPH_INDEX_QUALITY_SCHEMA, graphProfilePin } from '../src/runtime/graph_index_generation.mjs';
import { SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { readOriginal, selectAttachment } from '../src/runtime/original_read.mjs';
import { formatFor, readToolsConfig, TOOLS_CONFIG_SCHEMA } from '../src/runtime/attachment_derivation.mjs';
import { chargeInvestigation, investigationKey, INVESTIGATION_BUDGET_LIMIT,
  BUDGET_EXHAUSTED_CODE } from '../src/runtime/investigation_budget.mjs';

const NOW = '2026-09-15T00:00:00.000Z';
const FS_KEY = 'P-SYN-READ';
const PROJECT = `data_root/20_PROJECTS/${FS_KEY}`;
const GENERATION = 'gsyn-001';
const CHANNEL = 'C-SYN-READ';
const LONG_BODY = `긴 본문 시작.\n${'문장 하나가 여기에 있습니다. '.repeat(60)}\n긴 본문 끝.`;
const TS = Object.freeze({ withFile: '1786000000.000001', plain: '1786000000.000002',
  mismatch: '1786000000.000003', unknown: '1786000000.000009' });
const MAIL_FILE = ['2026', '01.jsonl'];
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hex = digest => digest.replace('sha256:', '');
const json = value => Buffer.from(JSON.stringify(value));

const slackRaw = (ts, text, user = 'U-SYN-1') => ({ ts, text, user, type: 'message', channel: CHANNEL });
const revision = (ts, rawDigest, pointers = []) => ({ message_ts: ts, channel_id: CHANNEL, workspace_id: 'T-SYN',
  thread_ts: null, revision_ref: `slack-rev:${hex(rawDigest)}`, revision_ts: '2026-08-01T00:00:00.000Z',
  actor: { slack_user_id: 'U-SYN-1' }, attachment_pointers: pointers });
const pointer = (fileId, digest, mime, size) => ({ file_id: fileId, content_sha256: digest, mime_type: mime,
  size_bytes: size, pointer_ref: `slack-file-${digest}` });

const mailRow = (eventId, subject, body, attachments) => ({ schema_version: 'email.fetch.event.v1', event_id: eventId,
  source: 'synthetic', provider_message_id: `pm-${eventId}`, thread_id: 'thread-syn', subject,
  from: [{ name: '보낸이', address: 'sender@example.invalid' }], to: [{ name: '받는이', address: 'owner@example.invalid' }],
  cc: [], received_at: '2026-01-05T00:00:00.000Z', body_text: body, body_html: null, attachments,
  ingested_at: '2026-01-05T00:05:00.000Z', ingest_status: 'ok', raw: null, metadata: null });
const mailAttachment = (name, mime, size, digest, localPath, extra = {}) => ({ type: 'binary_attachment', name, mime,
  size, url: null, content_sha256: digest, local_path: localPath, provider_attachment_id: null,
  metadata: { uidl: 'uidl-syn', blocked_extension: false, ...extra } });

/** One estate: two roots, a store, a generation, and the custody it was built from. */
async function makeEstate() {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-control-')));
  const slackRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-slack-')));
  const mailRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-mail-')));
  const mailAttachments = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-mailatt-')));
  const outside = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-outside-')));
  const documentRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-doc-')));
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-derived-')));
  const receiptsRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-receipts-')));
  const roots = { data_root: dataRoot, control_root: controlRoot };
  const put = async (address, bytes) => {
    const alias = address.slice(0, address.indexOf('/'));
    const target = path.join(roots[alias], address.slice(alias.length + 1));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { path: address, sha256: sha(bytes) };
  };
  for (const dir of TEMPLATE) await mkdir(path.join(dataRoot, '20_PROJECTS', FS_KEY, dir), { recursive: true });

  // ---- slack custody ----------------------------------------------------
  const goodBytes = Buffer.from('synthetic presentation bytes');
  const goodDigest = sha(goodBytes);
  const brokenDigest = sha(Buffer.from('what the pointer claims'));
  const writeAttachment = async (fileId, digest, bytes, mime, size) => {
    await mkdir(path.join(slackRoot, 'attachments', 'file_ids'), { recursive: true });
    await writeFile(path.join(slackRoot, 'attachments', 'file_ids', `${fileId}.json`),
      json(pointer(fileId, digest, mime, size)));
    const dir = path.join(slackRoot, 'attachments', 'sha256', hex(digest).slice(0, 2));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${hex(digest)}.bin`), bytes);
  };
  await writeAttachment('F-GOOD', goodDigest, goodBytes, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', goodBytes.length);
  // The stored bytes are not what the pointer claims: opening them is a mismatch.
  await writeAttachment('F-BROKEN', brokenDigest, Buffer.from('different bytes entirely'), 'text/plain', 24);
  const raws = new Map();
  const writeRaw = async value => {
    const bytes = json(value);
    const digest = sha(bytes);
    const dir = path.join(slackRoot, 'raw', 'sha256', hex(digest).slice(0, 2));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${hex(digest)}.json`), bytes);
    raws.set(value.ts, digest);
    return digest;
  };
  const withFileDigest = await writeRaw(slackRaw(TS.withFile, `첨부가 있는 글.\n${LONG_BODY}`));
  const plainDigest = await writeRaw(slackRaw(TS.plain, '첨부가 없는 짧은 글입니다.'));
  const mismatchDigest = await writeRaw(slackRaw(TS.mismatch, '깨진 첨부를 가진 글입니다.'));
  const writeState = async receipts => writeFile(path.join(slackRoot, 'state', 'slack-continuous.json'),
    json({ schema_version: 'soulforge.ingress.slack_continuous_state.v1', cursor: null, provider_cursor_token: null,
      binding_digest: sha(Buffer.from('synthetic-binding')), writer_authority_id: 'synthetic', writer_epoch: 1,
      revisions: receipts.revisions, custody_receipts: receipts.digests.map(digest => ({ raw_digest: digest,
        raw_ref: `raw/sha256/${hex(digest).slice(0, 2)}/${hex(digest)}.json`, source_refs: [] })),
      hold_receipts: [], page_evidence_receipts: [],
      attachment_receipts: [pointer('F-GOOD', goodDigest, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', goodBytes.length)] }));
  await mkdir(path.join(slackRoot, 'state'), { recursive: true });
  const baseRevisions = [
    revision(TS.withFile, withFileDigest, [pointer('F-GOOD', goodDigest,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', goodBytes.length)]),
    revision(TS.plain, plainDigest),
    revision(TS.mismatch, mismatchDigest, [pointer('F-BROKEN', brokenDigest, 'text/plain', 24)]),
  ];
  await writeState({ revisions: baseRevisions, digests: [withFileDigest, plainDigest, mismatchDigest] });

  // ---- mail custody -----------------------------------------------------
  const hwpBytes = Buffer.from('synthetic hwp bytes');
  const insidePath = path.join(mailAttachments, 'synthetic.hwp');
  await writeFile(insidePath, hwpBytes);
  const outsidePath = path.join(outside, 'elsewhere.hwp');
  await writeFile(outsidePath, hwpBytes);
  await mkdir(path.join(mailRoot, MAIL_FILE[0]), { recursive: true });
  await writeFile(path.join(mailRoot, ...MAIL_FILE), [
    mailRow('mail-null-0001', '바이트가 수집되지 않은 첨부', '첨부는 이름만 있습니다.',
      [mailAttachment('미수집.hwp', 'application/haansofthwp', 1024, null, null, { blocked_extension: true })]),
    mailRow('mail-inside-0001', '루트 안의 첨부', '첨부 바이트가 선언된 루트 안에 있습니다.',
      [mailAttachment('synthetic.hwp', 'application/haansofthwp', hwpBytes.length, hex(sha(hwpBytes)), insidePath)]),
    mailRow('mail-outside-0001', '루트 밖의 첨부', '첨부 바이트가 선언된 루트 밖에 있습니다.',
      [mailAttachment('elsewhere.hwp', 'application/haansofthwp', hwpBytes.length, hex(sha(hwpBytes)), outsidePath)]),
  ].map(row => JSON.stringify(row)).join('\n') + '\n');

  // ---- document custody --------------------------------------------------
  await writeFile(path.join(documentRoot, 'memo.md'), '# 합성 메모\n\n문서 출처에는 첨부 포인터가 없습니다.\n');

  // ---- store: acl, grant, binding ----------------------------------------
  const projectRef = ref(1);
  const projectKey = exactRefIdentityKey(projectRef);
  const aclPath = `${PROJECT}/00_프로젝트_안내/acl.json`;
  await put(aclPath, json({ actors: [
    { actor_ref: 'actor:owner:context-reader', grant: { allowed_projects: [projectKey], allowed_scopes: ['project'],
      allowed_purposes: ['context_query'], allowed_data_classes: ['public_synthetic'] } },
    { actor_ref: 'actor:indexer', grant: { allowed_projects: [projectKey], allowed_scopes: ['project'],
      allowed_purposes: ['context_preparation', 'context_query'], allowed_data_classes: ['public_synthetic'] } }],
  revoked_actors: [] }));
  const item = (itemId, extra = {}) => ({ item_id: itemId, revision_policy: 'latest_in_custody', revision_sha256: null,
    data_class: 'public_synthetic', ...extra });
  const grantValue = { schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.read', project_ref: projectRef,
    purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
    valid_from: '2026-01-01T00:00:00.000Z', valid_to: '2027-01-01T00:00:00.000Z',
    sources: [
      { kind: 'slack', root_ref: 'slack.channel', items: [item(TS.withFile), item(TS.plain), item(TS.mismatch)] },
      { kind: 'mail', root_ref: 'mail.synthetic', items: [item('mail-null-0001', { path: MAIL_FILE }),
        item('mail-inside-0001', { path: MAIL_FILE }), item('mail-outside-0001', { path: MAIL_FILE })] },
      { kind: 'document', root_ref: 'doc.synthetic', items: [item('memo', { path: ['memo.md'] })] },
    ] };
  const grantRef = await put(`${PROJECT}/00_프로젝트_안내/grants/grant.synthetic.read.json`, json(grantValue));
  const sourceRoots = { 'slack.channel': slackRoot, 'mail.synthetic': mailRoot, 'doc.synthetic': documentRoot };
  const bindingAddress = `control_root/project-bindings/${FS_KEY}/graph_index_binding.unified.json`;
  await put(bindingAddress, json({ mode: GRAPH_INDEX_BINDING_MODE, project_ref: projectRef, approved_fs_key: FS_KEY,
    acl_path: aclPath, write_authority: { actors: ['actor:indexer'], operations: ['prepare', 'index'] },
    grant: grantRef, source_roots: sourceRoots,
    graph: { worker: { interpreter_path: path.join(os.tmpdir(), 'unused-python.exe') },
      llm: { host: 'http://127.0.0.1:11434', model: 'local-model:tag', max_calls: 50 }, embedder: null, neo4j: null },
    profile: graphProfilePin() }));

  // ---- generation ---------------------------------------------------------
  const prepared = await prepareSourceDocuments({ grant: grantValue, roots: sourceRoots, now: NOW });
  assert.equal(prepared.documents.length, 7, 'fixture prepares every granted item');
  const area = `${PROJECT}/20_문서검색/본문·표_추출/generations/${GENERATION}`;
  const rows = [];
  for (const document of prepared.documents) {
    const docRef = await put(`${area}/${hex(document.doc_key)}.document.json`, json(document));
    const fragmentRef = await put(`${area}/${hex(document.doc_key)}.fragment.json`,
      json({ doc_key: document.doc_key, project_key: projectKey, chunks: [] }));
    rows.push({ doc_key: document.doc_key, source_kind: document.source_kind, root_ref: document.root_ref,
      item_id: document.item_id, composite_revision_sha256: document.composite_revision_sha256,
      text_sha256: document.text_sha256, data_class: document.data_class, units: document.units.length,
      document: docRef, fragment: { ...fragmentRef, fragment_sha256: fragmentRef.sha256 },
      origin: 'extracted', stats: { chunks: 0 } });
  }
  const coverageValue = { schema_version: GRAPH_INDEX_QUALITY_SCHEMA,
    coverage: { ...prepared.coverage, coverage_sha256: prepared.coverage.coverage_sha256 } };
  const coverageRef = await put(`${PROJECT}/20_문서검색/원문위치·추출품질/generations/${GENERATION}/quality.json`, json(coverageValue));
  const manifest = { schema_version: GRAPH_INDEX_MANIFEST_SCHEMA, status: 'complete', generation_id: GENERATION,
    project_ref: projectRef, project_key: projectKey, grant: { ref: grantRef }, admission: null,
    profile: graphProfilePin(), model: { llm: 'local-model:tag', embedder: null },
    coverage: coverageRef, coverage_sha256: prepared.coverage.coverage_sha256,
    documents: rows, counts: { documents: rows.length, chunks: 0 } };
  const manifestRef = await put(`${PROJECT}/20_문서검색/검색_색인/generations/${GENERATION}/generation.json`, json(manifest));
  await put(`${PROJECT}/00_프로젝트_안내/graph_index_current.json`,
    Buffer.from(`${JSON.stringify({ schema_version: GRAPH_INDEX_POINTER_SCHEMA, project_ref: projectRef,
      selection_epoch: 1, generation_id: GENERATION, generation_ref: manifestRef })}\n`));

  const tableDir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-read-table-')));
  const tablePath = path.join(tableDir, 'roots.json');
  const tableBytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA, roots })}\n`);
  await writeFile(tablePath, tableBytes);
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha(tableBytes) }));
  const tools = readToolsConfig(json({ schema: TOOLS_CONFIG_SCHEMA, interpreter_path: process.execPath,
    soffice_path: process.execPath, python_packages: {}, max_attachment_bytes: 1024 * 1024,
    formats: { pptx: true, pdf: true, xlsx: true, txt: true, md: true, csv: true },
    mail_attachments_layout: { rule: 'declared_roots', roots: { 'mail.synthetic': mailAttachments } },
    receipts_root: receiptsRoot, derived_root: derivedRoot }));
  return { io, tools, slackRoot, mailRoot, derivedRoot, receiptsRoot, projectRef, writeRaw, writeState,
    baseRevisions, digests: [withFileDigest, plainDigest, mismatchDigest], plainDigest, goodDigest, brokenDigest };
}

const read = (estate, overrides) => readOriginal({ io: estate.io, project: FS_KEY, tools: estate.tools, now: NOW, ...overrides });

// ------------------------------------------------------------------ text
test('a whole unit comes back, and a bound cuts it with the way to continue', async () => {
  const estate = await makeEstate();
  const whole = await read(estate, { itemId: TS.withFile, maxChars: 400000 });
  assert.equal(whole.status, 'ok');
  assert.equal(whole.item.source_kind, 'slack');
  assert.equal(whole.item.doc_key_matches, true);
  assert.equal(whole.item.doc_key, whole.item.manifest_doc_key);
  assert.equal(whole.item.units_from, 'original_reread');
  assert.equal(whole.units.length, 1);
  assert.equal(whole.units[0].truncated, false);
  assert.ok(whole.units[0].text.includes('긴 본문 끝'), 'the end of a long body is present');
  assert.equal(whole.units[0].characters, whole.item.characters_total);

  const bounded = await read(estate, { itemId: TS.withFile, maxChars: 120 });
  assert.equal(bounded.units[0].truncated, true);
  assert.equal(bounded.units[0].shown, 120);
  assert.ok(!bounded.units[0].text.includes('긴 본문 끝'));
  // Continuing is the same call with the unit named and a larger bound.
  const continued = await read(estate, { itemId: TS.withFile, unitId: bounded.units[0].unit_id, maxChars: 400000 });
  assert.equal(continued.requested_unit_found, true);
  assert.equal(continued.units.length, 1);
  assert.equal(continued.units[0].truncated, false);
  assert.equal(continued.units[0].text, whole.units[0].text);
});

test('an item the generation does not hold is not searched for', async () => {
  const estate = await makeEstate();
  const answer = await read(estate, { itemId: TS.unknown });
  assert.equal(answer.status, 'not_in_scope');
  assert.deepEqual(answer.units, []);
  assert.equal(answer.attachment, null);
});

// ----------------------------------------------------------- attachments
test('a message with text still lists the attachments it carries', async () => {
  const estate = await makeEstate();
  const answer = await read(estate, { itemId: TS.withFile, wantAttachments: true, maxChars: 200 });
  assert.equal(answer.attachments.status, 'ok');
  assert.equal(answer.attachments.entries.length, 1);
  const [entry] = answer.attachments.entries;
  assert.equal(entry.index, 1);
  assert.equal(entry.file_id, 'F-GOOD');
  assert.equal(entry.status, 'ok');
  assert.equal(entry.format, 'pptx');
  assert.equal(entry.sha256, estate.goodDigest);
  // The text was cut; the list is not a function of how much text was shown.
  assert.equal(answer.units[0].truncated, true);
});

test('no attachment is said as such, and a kind without pointers says the list is unavailable', async () => {
  const estate = await makeEstate();
  const plain = await read(estate, { itemId: TS.plain, wantAttachments: true });
  assert.equal(plain.attachments.status, 'attachments_none');
  assert.deepEqual(plain.attachments.entries, []);
  const document = await read(estate, { itemId: 'memo', wantAttachments: true });
  assert.equal(document.item.source_kind, 'document');
  assert.equal(document.attachments.status, 'attachment_list_unavailable');
});

test('mail attachments: uncollected bytes, a path outside the declared roots, and a format nothing reads', async () => {
  const estate = await makeEstate();
  const uncollected = await read(estate, { itemId: 'mail-null-0001', wantAttachments: true, attachmentSelector: '1' });
  assert.equal(uncollected.attachments.entries[0].status, 'bytes_not_collected');
  assert.equal(uncollected.attachment.status, 'bytes_not_collected');
  assert.match(uncollected.attachment.detail, /blocked extension/u);

  const outside = await read(estate, { itemId: 'mail-outside-0001', wantAttachments: true, attachmentSelector: '1' });
  assert.equal(outside.attachments.entries[0].status, 'access_denied');
  assert.equal(outside.attachment.status, 'access_denied');
  assert.match(outside.attachment.detail, /outside every declared attachment root/u);

  // Inside a declared root, the bytes open; nothing on this host reads .hwp, and
  // that is a stated status rather than an empty answer.
  const inside = await read(estate, { itemId: 'mail-inside-0001', wantAttachments: true, attachmentSelector: '1' });
  assert.equal(inside.attachments.entries[0].status, 'ok');
  assert.equal(inside.attachment.status, 'unsupported_format');
  assert.equal(inside.attachment.extract, null);
});

test('bytes that are not what the pointer claims are refused rather than parsed', async () => {
  const estate = await makeEstate();
  const answer = await read(estate, { itemId: TS.mismatch, wantAttachments: true, attachmentSelector: 'F-BROKEN' });
  // Listing does not hash, so the list says the bytes are there.
  assert.equal(answer.attachments.entries[0].status, 'ok');
  assert.equal(answer.attachment.status, 'hash_mismatch');
  assert.equal(answer.attachment.extract, null);
});

test('an attachment is named by index, by file id or by the front of its digest', async () => {
  const estate = await makeEstate();
  const listed = await read(estate, { itemId: TS.withFile, wantAttachments: true, maxChars: 100 });
  for (const selector of ['1', 'F-GOOD', 'f-good', hex(estate.goodDigest).slice(0, 12)]) {
    const entry = selectAttachment(listed.attachments.entries, selector);
    assert.equal(entry?.file_id, 'F-GOOD', selector);
  }
  assert.equal(selectAttachment(listed.attachments.entries, '9'), null);
  // A selector that names nothing does not become a guess.
  const missing = await read(estate, { itemId: TS.withFile, attachmentSelector: '9', maxChars: 100 });
  assert.equal(missing.attachment.status, 'access_denied');
  assert.match(missing.attachment.detail, /no attachment matches/u);
});

// ------------------------------------------------------------- revisions
test('an original that moved since the generation is read and said to have moved', async () => {
  const estate = await makeEstate();
  const before = await read(estate, { itemId: TS.plain });
  assert.equal(before.status, 'ok');
  // Custody keeps a newer revision of the same message; the generation still
  // names the older one.
  const newer = await estate.writeRaw(slackRaw(TS.plain, '고쳐 쓴 글입니다.'));
  const revisions = estate.baseRevisions.map(row => (row.message_ts === TS.plain
    ? { ...row, revision_ref: `slack-rev:${hex(newer)}`, revision_ts: '2026-08-02T00:00:00.000Z' } : row));
  await estate.writeState({ revisions, digests: [...estate.digests.filter(digest => digest !== estate.plainDigest), newer] });
  const after = await read(estate, { itemId: TS.plain });
  assert.equal(after.status, 'revision_mismatch');
  assert.equal(after.item.doc_key_matches, false);
  assert.notEqual(after.item.doc_key, after.item.manifest_doc_key);
  assert.equal(after.item.manifest_doc_key, before.item.doc_key);
  // Both keys are shown and the read continues with what the original says now.
  assert.ok(after.units[0].text.includes('고쳐 쓴'));
  assert.equal(after.item.units_from, 'original_reread');
});

test('an original custody no longer holds falls back without claiming a revision mismatch', async () => {
  const estate = await makeEstate();
  await estate.writeState({ revisions: estate.baseRevisions.filter(row => row.message_ts !== TS.plain),
    digests: estate.digests.filter(digest => digest !== estate.plainDigest) });
  const answer = await read(estate, { itemId: TS.plain });
  assert.equal(answer.status, 'reread_unavailable');
  assert.equal(answer.item.units_from, 'generation_document');
  assert.equal(answer.item.reread_code, 'source_missing');
  assert.equal(answer.item.stored_fallback, true);
  assert.equal(answer.item.revision_check, 'not_run_reread_failed');
  assert.ok(answer.units[0].text.length > 0, 'the generation still answers with what it recorded');
});

// ---------------------------------------------------------------- format
test('a format is taken from the pointer, then from the name, and otherwise refused', () => {
  assert.equal(formatFor({ mime: 'application/pdf' }), 'pdf');
  assert.equal(formatFor({ mime: 'text/plain; charset=utf-8' }), 'txt');
  assert.equal(formatFor({ mime: null, name: '자료.PPTX' }), 'pptx');
  assert.equal(formatFor({ mime: 'application/haansofthwp', name: '자료.hwp' }), null);
  assert.equal(formatFor({}), null);
});

test('a tool configuration without absolute tool paths is refused', () => {
  assert.throws(() => readToolsConfig(json({ schema: TOOLS_CONFIG_SCHEMA })), /tools_config_path_invalid/u);
  assert.throws(() => readToolsConfig(json({ schema: 'other.v0' })), /tools_config_schema_unknown/u);
});

// ---------------------------------------------------------------- budget
test('six calls is the whole of one investigation, and a seventh is refused with what came before', async () => {
  const estate = await makeEstate();
  const env = { HERMES_SESSION_ID: 'session-syn-1', HERMES_SESSION_PROFILE: 'context-memory' };
  for (let call = 1; call <= INVESTIGATION_BUDGET_LIMIT; call++) {
    const charged = chargeInvestigation({ receiptsRoot: estate.receiptsRoot, cli: call % 2 ? 'query' : 'read',
      env, args: { project: FS_KEY, item: TS.plain } });
    assert.equal(charged.call, call);
    assert.equal(charged.bucket, 'session');
    // A call that fails still cost: the start row is already written.
    if (call % 3 === 0) charged.finish('estate_query_failed');
    else charged.finish('ok');
  }
  assert.throws(() => chargeInvestigation({ receiptsRoot: estate.receiptsRoot, cli: 'read', env, args: {} }),
    error => {
      assert.equal(error.code, BUDGET_EXHAUSTED_CODE);
      assert.equal(error.calls, INVESTIGATION_BUDGET_LIMIT);
      assert.equal(error.summary.length, INVESTIGATION_BUDGET_LIMIT);
      assert.match(error.summary[0], /query/u);
      // What each call became, not only that it happened: the third one failed.
      assert.match(error.summary[2], /estate_query_failed$/u);
      assert.match(error.summary[3], /ok$/u);
      return true;
    });
  // The ledger is where the count lives, one line per phase per call.
  const ledger = await readFile(path.join(estate.receiptsRoot, 'context-memory', 'session-syn-1.jsonl'), 'utf8');
  const rows = ledger.trim().split('\n').map(row => JSON.parse(row));
  assert.equal(rows.filter(row => row.phase === 'start').length, INVESTIGATION_BUDGET_LIMIT);
  assert.equal(rows.filter(row => row.phase === 'end').length, INVESTIGATION_BUDGET_LIMIT);
  assert.equal(rows.every(row => row.internal.model_calls === 0), true);
});

test('a message id narrows the key, and a development run is its own bucket', async () => {
  const estate = await makeEstate();
  const session = { HERMES_SESSION_ID: 'session-syn-2' };
  const first = investigationKey({ env: session });
  const narrowed = investigationKey({ env: { ...session, HERMES_SESSION_MESSAGE_ID: 'm-1' } });
  assert.equal(first.key, 'session-syn-2');
  assert.equal(narrowed.key, 'session-syn-2#m-1');
  assert.equal(first.directory, 'cli');
  // Spending one bucket leaves the other whole.
  for (let call = 1; call <= INVESTIGATION_BUDGET_LIMIT; call++) {
    chargeInvestigation({ receiptsRoot: estate.receiptsRoot, cli: 'read', env: session, args: {} }).finish('ok');
  }
  assert.throws(() => chargeInvestigation({ receiptsRoot: estate.receiptsRoot, cli: 'read', env: session, args: {} }),
    /investigation_budget_exhausted/u);
  const dev = chargeInvestigation({ receiptsRoot: estate.receiptsRoot, cli: 'read', env: {}, devRun: 'regression-1', args: {} });
  assert.equal(dev.bucket, 'dev');
  assert.equal(dev.call, 1);
  dev.finish('ok');
  assert.equal(JSON.parse((await readFile(path.join(estate.receiptsRoot, 'dev', 'regression-1.jsonl'), 'utf8'))
    .trim().split('\n')[0]).key, 'dev:regression-1');
});

test('without a session and without a declared run there is no bucket to charge', async () => {
  const estate = await makeEstate();
  assert.throws(() => chargeInvestigation({ receiptsRoot: estate.receiptsRoot, cli: 'read', env: {}, args: {} }),
    /investigation_budget_key_unavailable/u);
  assert.throws(() => chargeInvestigation({ receiptsRoot: estate.receiptsRoot, cli: 'read', env: {}, devRun: '../escape', args: {} }),
    /investigation_budget_dev_run_invalid/u);
  // No ledger, no budget: a call that cannot be recorded does not run.
  const gone = path.join(estate.receiptsRoot, 'gone');
  await rm(estate.receiptsRoot, { recursive: true, force: true });
  await writeFile(estate.receiptsRoot, 'not a directory', 'utf8');
  assert.throws(() => chargeInvestigation({ receiptsRoot: gone, cli: 'read', env: {}, devRun: 'regression-2', args: {} }),
    /investigation_budget_unwritable/u);
});

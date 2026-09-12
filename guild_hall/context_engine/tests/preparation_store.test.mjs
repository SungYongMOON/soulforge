// One project, end to end: granted Linear and mail items are prepared, the
// references, the documents and the record land in the project store, and a
// validation report is added beside the generation without moving it.
//
// The store is a fresh temp root per case (os.tmpdir + mkdtemp inside the graph
// index fixture); no operating root is chosen, no real project folder is created
// and no current-generation pointer is written.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INDEX_NOW, INDEX_PROJECT as PROJECT, cannedGraphWorker as cannedWorker,
  makeGraphIndexStore as makeStore, indexerRequest as indexer,
  READER_REQUEST as reader } from '../harness/fixtures/graph_index_fixture.mjs';
import { updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { LINEAR_ROOT_REF, syntheticLinearCustody } from '../harness/fixtures/linear_custody_fixture.mjs';
import { ROOT_TABLE_SCHEMA, readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA, SOURCE_KINDS } from '../src/runtime/source_documents.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE } from '../../path_registry/src/target_materializer.mjs';
import { validatePreparationRun } from '../src/runtime/preparation_validation.mjs';
import { PREPARATION_GENERATION_SCHEMA, PREPARATION_STORE_AREAS, SOURCE_KIND_DIRECTORIES,
  SOURCE_REFERENCE_SCHEMA, appendValidationReport, readPreparationGeneration,
  writePreparationGeneration } from '../src/runtime/preparation_store.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const CLOCK = () => new Date(NOW);
const MAIL_FILE = ['acme', 'mail', 'events', 'gmail', '2026', '09.jsonl'];
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const writer = extra => indexer({ purpose: 'context_preparation', ...extra });

// A store whose binding authorizes this actor to land a preparation, plus a
// source root holding one mail event and one markdown document.
async function preparedStore({ writeOperations = ['index', 'prepare'], subject = '합성 요청: 설계 검토',
  grantId = 'grant.synthetic.store' } = {}) {
  const store = await makeStore({ writeOperations });
  const mailRoot = await mkdtempRoot('ctx-store-mail-');
  const file = path.join(mailRoot, ...MAIL_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ schema_version: 'email.fetch.event.v1', event_id: 'gmail-0001',
    source: 'gmail', provider_message_id: 'pm-1', thread_id: 't-1', subject,
    from: [{ name: '요청자', address: 'requester@example.invalid' }],
    to: [{ name: '담당자', address: 'owner@example.invalid' }], cc: [],
    received_at: '2026-09-10T00:00:00.000Z', body_text: '설계 검토 의견을 금요일까지 주세요.', body_html: null,
    attachments: [], ingested_at: '2026-09-10T00:05:00.000Z', ingest_status: 'ok', raw: null, metadata: null })}\n`);
  const grant = { schema_version: SOURCE_GRANT_SCHEMA, grant_id: grantId, project_ref: ref(1),
    purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
    valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
    sources: [{ kind: 'mail', root_ref: 'mail.synthetic', items: [{ item_id: 'gmail-0001',
      revision_policy: 'latest_in_custody', revision_sha256: null, data_class: 'public_synthetic', path: MAIL_FILE }] },
      { kind: 'document', root_ref: 'doc.synthetic', items: [{ item_id: 'memo-a',
        revision_policy: 'latest_in_custody', revision_sha256: null, data_class: 'public_synthetic', path: ['memo-a.md'] }] }] };
  const roots = { 'mail.synthetic': mailRoot, 'doc.synthetic': store.sourceRoot };
  return { store, grant, roots };
}

// Copies a directory tree; the estate case needs the same store contents under a
// bare root rather than under a store root.
async function cpDir(from, to) {
  const { cp } = await import('node:fs/promises');
  await cp(from, to, { recursive: true });
}
async function cpFile(from, to) {
  const { copyFile } = await import('node:fs/promises');
  await copyFile(from, to);
}

async function mkdtempRoot(prefix) {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

const prepare = (grant, roots, runId = 'prep-0001') =>
  prepareSourceDocuments({ grant, roots, now: NOW, runId, clock: CLOCK });
const land = (store, preparation, request = writer()) => writePreparationGeneration({
  storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request, preparation });
const readBack = (store, generationId, request = writer()) => readPreparationGeneration({
  storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request, generationId });

test('a preparation lands as references, documents and a record, and reads back whole', async () => {
  const { store, grant, roots } = await preparedStore();
  const preparation = await prepare(grant, roots);
  assert.equal(preparation.coverage.counts.prepared, 2, 'both granted kinds prepared');
  const receipt = await land(store, preparation);
  assert.equal(receipt.status, 'WRITTEN');
  assert.equal(receipt.template_version, 'project-context-template-v1');
  assert.equal(receipt.documents, 2);
  assert.equal(receipt.references, 2);
  // The test root is recorded, not a chosen operating root.
  assert.equal(receipt.store_root, store.storeRoot);
  assert.ok(receipt.store_root.startsWith(os.tmpdir()));

  const back = await readBack(store, 'prep-0001');
  assert.equal(back.manifest.schema_version, PREPARATION_GENERATION_SCHEMA);
  assert.equal(back.documents.length, 2);
  // Four versions stay separable on the shelf.
  assert.equal(back.manifest.preparer.id, 'context-engine/source-preparer');
  assert.equal(back.manifest.preparer.version, preparation.run.preparer_version);
  assert.equal(back.manifest.preparer.code_digest, preparation.run.preparer_code_digest);
  assert.equal(back.manifest.preparer.rules_digest, preparation.run.preparation_rules_digest);
  assert.equal(back.manifest.template_version, 'project-context-template-v1');
  // The writer is named: this is what a record in the store adds to a record.
  assert.deepEqual({ actor: back.manifest.writer.actor_ref, operation: back.manifest.writer.operation },
    { actor: 'actor:indexer', operation: 'prepare' });
  assert.equal(back.manifest.writer.binding_sha256, store.bindingSha256);

  // Nothing became current: landing a preparation switches no reader.
  assert.equal(existsSync(path.join(store.storeRoot, PROJECT, '00_프로젝트_안내', 'graph_index_current.json')), false);
});

test('references carry locators and revisions, and never the prepared text', async () => {
  const { store, grant, roots } = await preparedStore();
  const preparation = await prepare(grant, roots);
  await land(store, preparation);
  const back = await readBack(store, 'prep-0001');
  assert.equal(back.manifest.references.length, 2);
  for (const row of back.manifest.references) {
    const reference = JSON.parse(await readFile(path.join(store.storeRoot, row.path), 'utf8'));
    assert.equal(reference.schema_version, SOURCE_REFERENCE_SCHEMA);
    const document = back.documents.find(doc => doc.doc_key === reference.doc_key);
    // Each kind's references sit under the input directory the layout names.
    assert.ok(row.path.includes(`${PREPARATION_STORE_AREAS.references}/${SOURCE_KIND_DIRECTORIES[document.source_kind]}/`));
    assert.equal(reference.primary_revision_sha256, document.primary_revision_sha256);
    assert.equal(reference.composite_revision_sha256, document.composite_revision_sha256);
    assert.equal(reference.text_sha256, document.text_sha256);
    assert.equal(reference.locators.length, document.units.length);
    assert.deepEqual(reference.locators[0].locator, document.units[0].locator);
    // The reference names where the body is without carrying it. A locator may
    // hold text when that text is the locator - a document heading names its own
    // section - so those units are exempted by their own locator, not by name.
    // Escaped-to-escaped on both sides. Comparing a raw string against serialized
    // JSON silently passes for any text carrying a newline or a quote - which is
    // most body text, and exactly the case this is meant to catch.
    const serialized = JSON.stringify(reference);
    const escaped = value => JSON.stringify(value).slice(1, -1);
    let bodyUnits = 0;
    for (const unit of document.units) {
      if (JSON.stringify(unit.locator).includes(escaped(unit.text))) continue;
      bodyUnits += 1;
      assert.equal(serialized.includes(escaped(unit.text)), false, `reference holds body text of ${unit.unit_id}`);
    }
    assert.ok(bodyUnits > 0, 'at least one unit is body, not a self-naming locator');
  }
  // One of the two kinds is mail; its reference is under MAIL.
  assert.ok(back.manifest.references.some(row => row.path.includes('/MAIL/')));
});

test('every source kind has an input directory, and every directory is in the layout', () => {
  // The kinds and the layout are declared in two different modules; this is the
  // seam between them, so it is pinned rather than left to agree by habit.
  assert.deepEqual([...SOURCE_KINDS].sort(), Object.keys(SOURCE_KIND_DIRECTORIES).sort());
  for (const [kind, directory] of Object.entries(SOURCE_KIND_DIRECTORIES)) {
    assert.ok(PROJECT_CONTEXT_DIRECTORY_TEMPLATE.includes(`10_입력자료/${directory}`), `${kind} -> ${directory}`);
  }
  assert.equal(SOURCE_KIND_DIRECTORIES.linear, 'LINEAR');
});

test('a validation report is added beside the generation and does not move it', async () => {
  const { store, grant, roots } = await preparedStore();
  const preparation = await prepare(grant, roots);
  const receipt = await land(store, preparation);
  const { run, ...rest } = preparation;
  const report = validatePreparationRun({ run, preparation: rest, grant,
    validationRunId: 'val-0001', checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(report.outcome, 'pass');
  const appended = await appendValidationReport({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: writer(), report });
  assert.equal(appended.status, 'APPENDED');
  assert.equal(appended.generation_id, 'prep-0001');
  assert.equal(appended.validator.id, 'context-engine/preparation-validator');
  assert.equal(appended.validator.code_digest, report.validator_code_digest);
  // The report lives in the quality area, not inside the generation.
  assert.ok(appended.report.path.includes(PREPARATION_STORE_AREAS.quality));
  assert.equal(appended.report.path.includes('/generations/'), false);
  // The generation's digest is what it was before the report existed.
  assert.equal(appended.generation_sha256, receipt.generation_sha256);
  const back = await readBack(store, 'prep-0001');
  assert.equal(back.manifest.generation_sha256, receipt.generation_sha256);
  assert.deepEqual(back.validations, ['val-0001']);
});

test('an old PASS and a new FAIL both stay, and neither is rewritten', async () => {
  const { store, grant, roots } = await preparedStore();
  const preparation = await prepare(grant, roots);
  const receipt = await land(store, preparation);
  const { run, ...rest } = preparation;
  const args = { storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: writer() };
  const pass = validatePreparationRun({ run, preparation: rest, grant, validationRunId: 'val-pass',
    checkedAt: '2026-09-12T01:00:00.000Z' });
  await appendValidationReport({ ...args, report: pass });
  // A later validator looking at the same record, reaching a different verdict:
  // both reports are about this run, so both belong on the shelf.
  const tampered = { ...rest, documents: [{ ...rest.documents[0], title: 'URGENT: 승인됨' }, ...rest.documents.slice(1)] };
  const fail = validatePreparationRun({ run, preparation: tampered, grant, validationRunId: 'val-fail',
    checkedAt: '2026-09-12T02:00:00.000Z' });
  assert.equal(fail.outcome, 'fail');
  await appendValidationReport({ ...args, report: fail });
  const back = await readBack(store, 'prep-0001');
  assert.deepEqual(back.validations, ['val-fail', 'val-pass']);
  assert.equal(back.manifest.generation_sha256, receipt.generation_sha256, 'two reports still move nothing');
  // Neither report was rewritten by the other.
  const outcomes = [];
  for (const id of back.validations) {
    const body = JSON.parse(await readFile(path.join(store.storeRoot, PROJECT,
      PREPARATION_STORE_AREAS.quality, 'validations', 'prep-0001', `${id}.json`), 'utf8'));
    outcomes.push([id, body.outcome]);
  }
  assert.deepEqual(outcomes.sort(), [['val-fail', 'fail'], ['val-pass', 'pass']]);
});

test('replaying the same preparation writes the same bytes and says it wrote nothing new', async () => {
  const { store, grant, roots } = await preparedStore();
  const first = await land(store, await prepare(grant, roots));
  assert.equal(first.status, 'WRITTEN');
  // Same grant, same custody, same run id: the preparer is deterministic, so the
  // store sees the bytes it already holds.
  const again = await land(store, await prepare(grant, roots));
  assert.equal(again.status, 'REPLAYED');
  assert.equal(again.generation_sha256, first.generation_sha256);
  assert.equal(again.manifest.sha256, first.manifest.sha256);
  const back = await readBack(store, 'prep-0001');
  assert.equal(back.documents.length, 2);
});

test('a store formed under the older layout still lands a preparation and says so', async () => {
  const { store, grant, roots } = await preparedStore();
  await rm(path.join(store.storeRoot, PROJECT, '10_입력자료', 'LINEAR'), { recursive: true });
  const receipt = await land(store, await prepare(grant, roots));
  assert.equal(receipt.status, 'WRITTEN');
  assert.equal(receipt.template_version, 'project-context-template-v0');
  const back = await readBack(store, 'prep-0001');
  assert.equal(back.manifest.template_version, 'project-context-template-v0');

  // Still not a blanket skip: an area every layout requires is still demanded.
  const { store: broken, grant: g2, roots: r2 } = await preparedStore();
  await rm(path.join(broken.storeRoot, PROJECT, '20_문서검색'), { recursive: true });
  await assert.rejects(land(broken, await prepare(g2, r2)), /preparation_store_template_invalid/u);
});

test('only an actor the binding authorizes can land a record', async () => {
  const { store, grant, roots } = await preparedStore({ writeOperations: ['index'] });
  const preparation = await prepare(grant, roots);
  // The same actor may read the project and still not be authorized to write a
  // preparation: that is the narrowing this placement buys.
  await assert.rejects(land(store, preparation), /preparation_store_access_refused/u);
  const authorized = await preparedStore();
  const ok = await land(authorized.store, await prepare(authorized.grant, authorized.roots));
  assert.equal(ok.status, 'WRITTEN');
  await assert.rejects(land(authorized.store, preparation, reader), /preparation_store_/u);
});

test('a result without a record is refused, and says which kind of absence it was', async () => {
  const { store, grant, roots } = await preparedStore();
  const withoutRun = await prepareSourceDocuments({ grant, roots, now: NOW });
  assert.equal(withoutRun.run, null);
  assert.equal(withoutRun.run_unavailable, 'record_not_requested');
  await assert.rejects(land(store, withoutRun), /preparation_store_run_not_requested/u);
  // An absence with a different reason is reported as a different refusal.
  await assert.rejects(land(store, { ...withoutRun, run_unavailable: 'preparation_run_invalid' }),
    /preparation_store_run_unavailable/u);
});

test('a report about a run this store does not hold is refused', async () => {
  const { store, grant, roots } = await preparedStore();
  await land(store, await prepare(grant, roots));
  const other = await preparedStore({ subject: '다른 요청', grantId: 'grant.synthetic.other' });
  const elsewhere = await prepare(other.grant, other.roots, 'prep-other');
  const { run, ...rest } = elsewhere;
  const report = validatePreparationRun({ run, preparation: rest, grant: other.grant,
    validationRunId: 'val-elsewhere', checkedAt: '2026-09-12T01:00:00.000Z' });
  await assert.rejects(appendValidationReport({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: writer(), report }), /preparation_store_generation_absent/u);
});

test('a generation whose bytes moved after landing is refused on read', async () => {
  const { store, grant, roots } = await preparedStore();
  await land(store, await prepare(grant, roots));
  const back = await readBack(store, 'prep-0001');
  const target = path.join(store.storeRoot, back.manifest.documents[0].path);
  const body = JSON.parse(await readFile(target, 'utf8'));
  await writeFile(target, `${JSON.stringify({ ...body, title: '바뀐 제목' })}\n`);
  await assert.rejects(readBack(store, 'prep-0001'), /preparation_store_generation_mismatch/u);
});

// The comment in preparation_store.mjs says its admission mirrors the graph index
// store's. This is the test that sentence promises: the two must admit and refuse
// the same actor, purpose and binding pin, because they open the same binding.
test('the two store admissions admit and refuse the same things', async () => {
  const { store, grant, roots } = await preparedStore();
  const preparation = await prepare(grant, roots);
  const cases = [
    ['authorized writer', writer(), true],
    ['read-only actor', { ...reader, purpose: 'context_preparation' }, false],
    ['wrong purpose', writer({ purpose: 'context_query' }), false],
    ['unknown actor', writer({ actor_ref: 'actor:stranger' }), false],
  ];
  for (const [name, request, admitted] of cases) {
    const landed = await land(store, preparation, request).then(() => true, () => false);
    // A well-formed update request, so admission is the only thing that differs.
    const fresh = await preparedStore();
    const result = await updateGraphIndex({ storeRoot: fresh.store.storeRoot, bindingSha256: fresh.store.bindingSha256,
      request: { ...request, generation_id: 'g1', expected_prior: null }, now: INDEX_NOW,
      runWorker: cannedWorker().runWorker }).catch(() => ({ status: 'HOLD', code: 'graph_index_access_refused' }));
    const indexed = !(result.status === 'HOLD' && result.code === 'graph_index_access_refused');
    assert.equal(landed, admitted, `${name}: preparation store`);
    assert.equal(indexed, admitted, `${name}: graph index store`);
  }
  // And both refuse a binding pin that is not this store's.
  const wrongPin = sha(Buffer.from('not this binding'));
  await assert.rejects(writePreparationGeneration({ storeRoot: store.storeRoot, bindingSha256: wrongPin,
    request: writer(), preparation }), /preparation_store_binding_mismatch/u);
});

test('a kind the store layout has no place for is refused, not filed by making the place', async () => {
  const { store, grant, roots } = await preparedStore();
  // Real Linear custody, produced by the collection runner over its synthetic
  // transport - the same create-only files the adapter reads in a live lane.
  const linear = await syntheticLinearCustody();
  const withLinear = { ...grant, sources: [...grant.sources, { kind: 'linear', root_ref: LINEAR_ROOT_REF,
    items: [{ item_id: linear.issue('SYN-1'), revision_policy: 'latest_in_custody', revision_sha256: null,
      data_class: 'public_synthetic' }] }] };
  const all = { ...roots, ...linear.roots };
  // On today's layout it lands, Linear reference and all.
  const current = await land(store, await prepare(withLinear, all));
  assert.equal(current.template_version, 'project-context-template-v1');
  assert.equal(current.references, 3);
  const back = await readBack(store, 'prep-0001');
  assert.ok(back.manifest.references.some(row => row.path.includes('/LINEAR/')));

  // A store formed before LINEAR existed has nowhere to put that reference, so it
  // is refused rather than filed by creating the place.
  const older = await preparedStore();
  await rm(path.join(older.store.storeRoot, PROJECT, '10_입력자료', 'LINEAR'), { recursive: true });
  const olderLinear = { ...older.grant, sources: [...older.grant.sources, withLinear.sources.at(-1)] };
  await assert.rejects(land(older.store, await prepare(olderLinear, { ...older.roots, ...linear.roots })),
    /preparation_store_kind_not_in_layout/u);
  assert.equal(existsSync(path.join(older.store.storeRoot, PROJECT, '10_입력자료', 'LINEAR')), false,
    'the refusal did not create the directory it refused to use');
  // The store is still what it was, and the kinds it does have still land.
  const mailOnly = await land(older.store, await prepare(older.grant, older.roots, 'prep-mail'));
  assert.equal(mailOnly.template_version, 'project-context-template-v0');
});

test('a record that does not describe the documents filed with it is refused', async () => {
  const { store, grant, roots } = await preparedStore();
  const mine = await prepare(grant, roots);
  const other = await preparedStore({ subject: '다른 요청', grantId: 'grant.synthetic.other' });
  const theirs = await prepare(other.grant, other.roots, 'prep-0001');
  assert.notEqual(theirs.run.run_sha256, mine.run.run_sha256, 'the two preparations really differ');
  // Their record, my documents: the four recorded versions would otherwise attest
  // a preparation that produced different bytes.
  await assert.rejects(land(store, { ...mine, run: theirs.run }),
    /preparation_store_run_does_not_describe_result/u);
  for (const patch of [{ coverage: theirs.coverage }, { changes: theirs.changes }, { grant: theirs.grant }]) {
    await assert.rejects(land(store, { ...mine, ...patch }), /preparation_store_run_does_not_describe_result/u);
  }
});

test('a run id already held by a different record is refused before anything is written', async () => {
  const { store, grant, roots } = await preparedStore();
  await land(store, await prepare(grant, roots));
  const other = await preparedStore({ subject: '다른 요청', grantId: 'grant.synthetic.other' });
  const clash = await prepare(other.grant, other.roots, 'prep-0001');
  const generation = path.join(store.storeRoot, PROJECT, PREPARATION_STORE_AREAS.documents, 'generations', 'prep-0001');
  const before = (await import('node:fs')).readdirSync(path.join(generation, 'documents')).length;
  await assert.rejects(writePreparationGeneration({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: writer(), preparation: clash }), /preparation_store_conflict/u);
  // Nothing of the refused preparation was filed.
  assert.equal((await import('node:fs')).readdirSync(path.join(generation, 'documents')).length, before);
  const back = await readBack(store, 'prep-0001');
  assert.equal(back.documents.length, before);
});

test('an empty but honest preparation still reports that it was written', async () => {
  const { store, grant, roots } = await preparedStore();
  const absent = { ...grant, grant_id: 'grant.synthetic.absent', sources: [{ kind: 'mail', root_ref: 'mail.synthetic',
    items: [{ item_id: 'gmail-9999', revision_policy: 'latest_in_custody', revision_sha256: null,
      data_class: 'public_synthetic', path: MAIL_FILE }] }] };
  const preparation = await prepare(absent, roots, 'prep-empty');
  assert.equal(preparation.coverage.counts.prepared, 0);
  assert.equal(preparation.coverage.counts.missing, 1);
  const receipt = await land(store, preparation);
  // Nothing prepared is not the same as nothing happened: the record landed.
  assert.equal(receipt.status, 'WRITTEN');
  assert.equal(receipt.documents, 0);
  assert.equal((await readBack(store, 'prep-empty')).documents.length, 0);
  assert.equal((await land(store, preparation)).status, 'REPLAYED');
});

// The estate shape a real host has: 20_PROJECTS directly under the root, no
// directory named data_root, addresses resolved through the root table. The same
// preparation must land and read back unchanged, because the address is the same
// and only the root moved.
test('a preparation lands through an alias io on an estate with no data_root folder', async () => {
  const { store, grant, roots } = await preparedStore();
  const preparation = await prepare(grant, roots);
  const landed = await land(store, preparation);

  // Rebuild the same store contents under a bare estate root, then address it by
  // alias instead of by one absolute store root.
  const dataRoot = await mkdtempRoot('ctx-estate-data-');
  await cpDir(path.join(store.storeRoot, 'data_root'), dataRoot);
  // The per-project binding carries absolute source roots, so on a real estate it
  // lives under control_root rather than in the data plane beside the project.
  const controlRoot = await mkdtempRoot('ctx-estate-control-');
  const bindingDir = path.join(controlRoot, 'project-bindings', 'P26-000');
  await mkdir(bindingDir, { recursive: true });
  await cpFile(path.join(store.storeRoot, 'graph_index_binding.json'), path.join(bindingDir, 'graph_index_binding.json'));
  const bindingAddress = 'control_root/project-bindings/P26-000/graph_index_binding.json';
  const tableDir = await mkdtempRoot('ctx-estate-table-');
  const tablePath = path.join(tableDir, 'estate_roots.json');
  const bytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  await writeFile(tablePath, bytes);
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: sha(bytes) }));
  assert.equal(existsSync(path.join(dataRoot, 'data_root')), false, 'the estate has no such folder');
  assert.ok(existsSync(path.join(dataRoot, '20_PROJECTS')), 'the project tree is directly under the root');

  const back = await readPreparationGeneration({ io, bindingSha256: store.bindingSha256, bindingAddress,
    request: writer(), generationId: 'prep-0001' });
  // Byte-identical: the manifest the other io wrote reads the same here, and the
  // addresses inside it did not have to change.
  assert.equal(back.manifest.generation_sha256, landed.generation_sha256);
  assert.equal(back.documents.length, 2);
  assert.ok(back.manifest.documents.every(row => row.path.startsWith('data_root/20_PROJECTS/')));

  // And a report still appends through the alias io, beside the same generation.
  const { run, ...rest } = preparation;
  const report = validatePreparationRun({ run, preparation: rest, grant,
    validationRunId: 'val-alias', checkedAt: '2026-09-12T01:00:00.000Z' });
  const appended = await appendValidationReport({ io, bindingSha256: store.bindingSha256, bindingAddress,
    request: writer(), report });
  assert.equal(appended.status, 'APPENDED');
  assert.equal(appended.generation_sha256, landed.generation_sha256);
  // The receipt says which table answered, never where the root is.
  assert.equal(io.table_sha256, sha(bytes));
  assert.equal(JSON.stringify(back.manifest).includes(dataRoot), false, 'no host path is stored');
});

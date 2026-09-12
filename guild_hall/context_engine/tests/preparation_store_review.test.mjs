// Regression probes from the 2026-09-12 external review of 1e594af2 (PV-1~3),
// brought into the suite as they were written: each assertion encodes the safe
// behaviour the review asked for, over the repository's own public-synthetic
// fixture. Nothing here reaches a model, a database or an operating project
// folder; every path is under os.tmpdir().
//
// REV-A: the ACL's data classes and the project boundary are checked against
//        the documents themselves, on write and on read.
// REV-B: a run record and a validation report are admitted only when their own
//        digest still describes their body.
// REV-C: the canonical hash follows what JSON persistence can carry, so a stored
//        result still matches its record after readback.
// REV-D: a cold aliased store can write, read and take a report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

import * as fixture from '../harness/fixtures/graph_index_fixture.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { totalDigest, documentsDigest } from '../src/runtime/preparation_run.mjs';
import { validatePreparationRun } from '../src/runtime/preparation_validation.mjs';
import { writePreparationGeneration, readPreparationGeneration, appendValidationReport } from '../src/runtime/preparation_store.mjs';
import { ROOT_TABLE_SCHEMA, readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const clock = () => new Date(NOW);
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const encode = obj => Buffer.from(JSON.stringify(obj) + '\n');
const rejectsWith = (promise, code, message) => assert.rejects(promise, error => error?.code === code, message);

async function cleanFixture(t, store) {
  // Only the fixture's own temp roots are ever removed.
  for (const dir of new Set([store.storeRoot, store.sourceRoot])) {
    assert.equal(path.dirname(dir), os.tmpdir(), 'cleanup is restricted to fixture temp roots');
    t.after(() => rm(dir, { recursive: true, force: true }));
  }
}
async function setup(t, options = {}) {
  const store = await fixture.makeGraphIndexStore({ writeOperations: ['index', 'prepare'], ...options });
  await cleanFixture(t, store);
  const grant = JSON.parse(await readFile(path.join(store.storeRoot, store.binding.grant.path), 'utf8'));
  const preparation = await prepareSourceDocuments({ grant, roots: store.binding.source_roots,
    now: NOW, runId: 'review-prep', clock });
  assert.ok(preparation.run, 'fixture preparation must produce a run');
  assert.equal(preparation.coverage.counts.prepared, 2);
  const args = { storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: fixture.indexerRequest() };
  return { store, grant, preparation, args };
}

test('REV-A1: writer with no admitted data classes cannot land public_synthetic data', async t => {
  const s = await setup(t, { aclDataClasses: [] });
  await rejectsWith(writePreparationGeneration({ ...s.args, preparation: s.preparation }),
    'preparation_store_data_class_refused', 'an empty class allowlist must refuse writes');
});

test('REV-A2: narrowing a reader class allowlist immediately blocks body read', async t => {
  const s = await setup(t);
  await writePreparationGeneration({ ...s.args, preparation: s.preparation });
  const acl = structuredClone(s.store.acl);
  acl.actors.find(a => a.actor_ref === 'actor:reader').grant.allowed_data_classes = [];
  await s.store.put(s.store.aclPath, acl);
  await rejectsWith(readPreparationGeneration({ ...s.args, request: fixture.READER_REQUEST,
    generationId: s.preparation.run.preparation_run_id }),
  'preparation_store_data_class_refused', 'reader must not receive any document body');
});

test('REV-A3: a same-project manifest cannot redirect a reader to a foreign project file', async t => {
  const s = await setup(t);
  const landed = await writePreparationGeneration({ ...s.args, preparation: s.preparation });
  const foreignPath = 'data_root/20_PROJECTS/P-SYN-FOREIGN/review-synthetic.json';
  const foreign = await s.store.put(foreignPath, { marker: 'PUBLIC_SYNTHETIC_FOREIGN_PROJECT_ONLY' });
  const manifestPath = path.join(s.store.storeRoot, landed.manifest.path);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const { generation_sha256, ...body } = manifest;
  body.documents = [foreign];
  // Self-consistent on purpose: the checksum must not be what authorizes a read.
  await writeFile(manifestPath, encode({ ...body, generation_sha256: totalDigest(body) }));
  await rejectsWith(readPreparationGeneration({ ...s.args, request: fixture.READER_REQUEST,
    generationId: s.preparation.run.preparation_run_id }),
  'preparation_store_generation_scope_refused', 'foreign path must be rejected before reading');
});

test('REV-B1: a report whose outcome was changed from fail to pass is rejected', async t => {
  const s = await setup(t);
  await writePreparationGeneration({ ...s.args, preparation: s.preparation });
  const { run, ...prepared } = s.preparation;
  const changed = { ...prepared, documents: prepared.documents.map((doc, i) =>
    i === 0 ? { ...doc, title: 'PUBLIC SYNTHETIC CHANGED TITLE' } : doc) };
  const report = validatePreparationRun({ run, preparation: changed, grant: s.grant,
    validationRunId: 'review-val', checkedAt: NOW });
  assert.equal(report.outcome, 'fail');
  const altered = { ...report, outcome: 'pass' }; // the old report_sha256 is kept on purpose
  await rejectsWith(appendValidationReport({ ...s.args, report: altered }),
    'preparation_store_report_digest_mismatch', 'a corrupted report is not an ordinary validation receipt');
  // The honest report still lands, and both an old FAIL and any later report stay.
  const appended = await appendValidationReport({ ...s.args, report });
  assert.equal(appended.status, 'APPENDED');
});

test('REV-B2: a changed preparer-version claim with an unchanged run hash is rejected', async t => {
  const s = await setup(t);
  const changed = { ...s.preparation, run: { ...s.preparation.run, preparer_version: '9.9.9' } };
  await rejectsWith(writePreparationGeneration({ ...s.args, preparation: changed }),
    'preparation_store_run_digest_mismatch', 'invalid run metadata must not be stored as a normal preparation generation');
});

test('REV-C1: distinct JSON-representable strings have distinct total digests', () => {
  const a = JSON.parse('"\\ud800"'), b = JSON.parse('"\\ud801"');
  assert.notEqual(a, b);
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(totalDigest(a), totalDigest(b));
  // A well-formed string keeps the digest it always had, and cannot collide with
  // the escaped form of a lone surrogate.
  assert.notEqual(totalDigest('"\\ud800"'), totalDigest(a));
  assert.equal(totalDigest('plain'), totalDigest('plain'));
});

test('REV-C2: preparation -> JSON store -> readback preserves its recorded document digest', async t => {
  const s = await setup(t);
  const voiceRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-review-voice-'));
  t.after(() => rm(voiceRoot, { recursive: true, force: true }));
  const sessionId = 'syn-review-voice';
  const sessionPath = ['sessions', '2026-09-12', sessionId];
  const dir = path.join(voiceRoot, ...sessionPath);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'session_manifest.json'), encode({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId,
    recorded_at_local: NOW, duration_seconds: 1,
  }));
  // Raw JSON, so the sign of zero reaches the actual source reader.
  await writeFile(path.join(dir, 'transcript.jsonl'),
    '{"schema_version":"soulforge.voice_transcript_segment.v0","segment_id":0,"start_seconds":-0,"end_seconds":1,"speaker":"UNKNOWN","content":"Public synthetic observation."}\n');
  const grant = { ...s.grant, grant_id: 'grant.synthetic.review.voice', sources: [{
    kind: 'voice', root_ref: 'voice.synthetic', items: [{ item_id: sessionId,
      revision_policy: 'latest_in_custody', revision_sha256: null,
      data_class: 'public_synthetic', path: sessionPath }],
  }] };
  const preparation = await prepareSourceDocuments({ grant, roots: { 'voice.synthetic': voiceRoot },
    now: NOW, runId: 'review-voice', clock });
  assert.ok(preparation.run);
  assert.equal(preparation.coverage.counts.prepared, 1);
  await writePreparationGeneration({ ...s.args, preparation });
  const back = await readPreparationGeneration({ ...s.args, generationId: 'review-voice' });
  assert.equal(documentsDigest(back.documents), preparation.run.documents_sha256,
    'an honest stored result must still match the preparation-run digest after readback');
});

test('REV-D: cold alias store can write a new generation, read it, and append validation', async t => {
  const s = await setup(t);
  const estate = await mkdtemp(path.join(os.tmpdir(), 'ctx-review-alias-'));
  t.after(() => rm(estate, { recursive: true, force: true }));
  const data = path.join(estate, 'data');
  const control = path.join(estate, 'control');
  await cp(path.join(s.store.storeRoot, 'data_root'), data, { recursive: true });
  await mkdir(control, { recursive: true });
  const bindingAddress = 'control_root/graph_index_binding.json';
  await writeFile(path.join(control, 'graph_index_binding.json'),
    await readFile(path.join(s.store.storeRoot, 'graph_index_binding.json')));
  const tablePath = path.join(estate, 'root-table.json');
  const tableBytes = encode({ schema_version: ROOT_TABLE_SCHEMA, roots: { data_root: data, control_root: control } });
  await writeFile(tablePath, tableBytes);
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: digest(tableBytes) }));
  const args = { io, bindingAddress, bindingSha256: s.store.bindingSha256, request: fixture.indexerRequest() };
  const landed = await writePreparationGeneration({ ...args, preparation: s.preparation });
  assert.equal(landed.status, 'WRITTEN');
  const back = await readPreparationGeneration({ ...args, generationId: s.preparation.run.preparation_run_id });
  assert.equal(documentsDigest(back.documents), s.preparation.run.documents_sha256);
  const report = validatePreparationRun({ run: back.manifest.run, preparation: back.preparation,
    grant: s.grant, validationRunId: 'review-alias-val', checkedAt: NOW });
  assert.equal(report.outcome, 'pass');
  const appended = await appendValidationReport({ ...args, report });
  assert.equal(appended.status, 'APPENDED');
  assert.equal(appended.generation_sha256, landed.generation_sha256);
});

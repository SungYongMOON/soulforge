// The small public_synthetic runner: prepare -> land inactive -> read back ->
// validate the stored run against the exact grant -> append the report. Runs on
// a throwaway aliased estate (cold, no data_root folder) and on a rooted
// synthetic store; asserts the order of what it judges and what it refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { rm } from 'node:fs/promises';

import * as fixture from '../harness/fixtures/graph_index_fixture.mjs';
import { runPreparationFlow, makeSyntheticEstate, PREPARATION_FLOW_SCHEMA } from '../harness/preparation_flow.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const RUNNER = fileURLToPath(new URL('../harness/preparation_flow.mjs', import.meta.url));

test('the flow lands, reads back, validates the stored run and appends on a cold aliased estate', async t => {
  const estate = await makeSyntheticEstate({ fixture, now: NOW });
  t.after(() => estate.cleanup());
  const receipt = await runPreparationFlow({ io: estate.io, bindingAddress: estate.bindingAddress,
    bindingSha256: estate.bindingSha256, request: estate.request, runId: 'flow-one', validationRunId: 'flow-one-val', now: NOW });
  assert.equal(receipt.schema_version, PREPARATION_FLOW_SCHEMA);
  assert.equal(receipt.io.kind, 'aliased');
  assert.deepEqual(receipt.io.aliases, ['control_root', 'data_root']);
  assert.equal(receipt.steps.prepare.documents, 2);
  assert.equal(receipt.steps.land.status, 'WRITTEN');
  assert.equal(receipt.steps.readback.generation_sha256, receipt.steps.land.generation_sha256);
  assert.equal(receipt.steps.validate.outcome, 'pass');
  assert.equal(receipt.steps.append.status, 'APPENDED');
  // Adding the report left the generation where it was.
  assert.equal(receipt.steps.append.generation_sha256, receipt.steps.land.generation_sha256);
  // Replaying the same flow writes nothing new and judges the same stored bytes.
  const again = await runPreparationFlow({ io: estate.io, bindingAddress: estate.bindingAddress,
    bindingSha256: estate.bindingSha256, request: estate.request, runId: 'flow-one', validationRunId: 'flow-one-val', now: NOW });
  assert.equal(again.steps.land.status, 'REPLAYED');
  assert.equal(again.steps.append.status, 'REPLAYED');
  assert.equal(again.steps.validate.report_sha256, receipt.steps.validate.report_sha256);
  // The receipt carries refs and digests, never a host path or document text.
  const text = JSON.stringify(receipt);
  assert.equal(text.includes(os.tmpdir()), false);
  assert.equal(text.includes('Public synthetic'), false);
});

test('the flow refuses a binding it cannot pin and ids that would name the report after the run', async t => {
  const estate = await makeSyntheticEstate({ fixture, now: NOW });
  t.after(() => estate.cleanup());
  const base = { io: estate.io, bindingAddress: estate.bindingAddress, request: estate.request, now: NOW };
  await assert.rejects(runPreparationFlow({ ...base, bindingSha256: 'sha256:' + '0'.repeat(64), runId: 'a', validationRunId: 'b' }),
    error => error.code === 'preparation_flow_binding_mismatch');
  await assert.rejects(runPreparationFlow({ ...base, bindingSha256: estate.bindingSha256, runId: 'same', validationRunId: 'same' }),
    error => error.code === 'preparation_flow_ids_invalid');
  // An actor the binding does not authorize to prepare is stopped at landing,
  // after preparation and before any byte is written.
  await assert.rejects(runPreparationFlow({ ...base, bindingSha256: estate.bindingSha256, request: fixture.READER_REQUEST,
    runId: 'reader-run', validationRunId: 'reader-val' }), error => error.code === 'preparation_store_access_refused');
});

test('the flow also runs over a rooted synthetic store', async t => {
  const store = await fixture.makeGraphIndexStore({ writeOperations: ['index', 'prepare'] });
  t.after(async () => { for (const dir of [store.storeRoot, store.sourceRoot]) {
    assert.equal(path.dirname(dir), os.tmpdir()); await rm(dir, { recursive: true, force: true }); } });
  const receipt = await runPreparationFlow({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: fixture.indexerRequest(), runId: 'rooted-run', validationRunId: 'rooted-val', now: NOW });
  assert.equal(receipt.io.kind, 'rooted');
  assert.equal(receipt.steps.validate.outcome, 'pass');
});

test('a failing command prints a code and never echoes the input that failed', async () => {
  const marker = 'ZZ_NOT_A_REAL_VALUE_9f3c';
  const run = args => new Promise(done => execFile(process.execPath, [RUNNER, ...args], { encoding: 'utf8' },
    (error, stdout, stderr) => done({ code: error?.code ?? 0, stdout, stderr })));
  // Malformed JSON carrying a marker: the parser's message would quote it.
  const badJson = await run(['--root-table', path.join(os.tmpdir(), 'no-such-table.json'),
    '--root-table-sha256', 'sha256:' + '0'.repeat(64), '--binding-address', 'control_root/x.json',
    '--binding-sha256', 'sha256:' + '0'.repeat(64), '--request-json', `{"${marker}":`]);
  assert.equal(badJson.code, 2);
  assert.equal(badJson.stdout, '');
  assert.equal(badJson.stderr.includes(marker), false);
  assert.match(badJson.stderr, /^\[preparation-flow\] [a-z][a-z0-9_]*\n$/u);
  // A table that cannot be pinned fails with the table module's own code, and
  // the path it named does not come back out.
  const badTable = await run(['--root-table', path.join(os.tmpdir(), `${marker}.json`),
    '--root-table-sha256', 'sha256:' + '0'.repeat(64), '--binding-address', 'control_root/x.json',
    '--binding-sha256', 'sha256:' + '0'.repeat(64), '--request-json', '{}']);
  assert.equal(badTable.code, 2);
  assert.equal(badTable.stderr.includes(marker), false);
  assert.equal(badTable.stderr, '[preparation-flow] root_table_unavailable\n');
  // An unknown flag is a usage error with the fixed code, not a stack trace.
  const usage = await run([`--${marker}`]);
  assert.equal(usage.code, 2);
  assert.equal(usage.stderr.includes(marker), false);
});

test('the --synthetic command prints one receipt line and cleans up after itself', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [RUNNER, '--synthetic', '--now', NOW,
    '--run-id', 'cli-run', '--validation-run-id', 'cli-val'], { encoding: 'utf8' });
  const lines = stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const receipt = JSON.parse(lines[0]);
  assert.equal(receipt.mode, 'synthetic');
  assert.equal(receipt.steps.validate.outcome, 'pass');
  assert.equal(receipt.steps.append.status, 'APPENDED');
});

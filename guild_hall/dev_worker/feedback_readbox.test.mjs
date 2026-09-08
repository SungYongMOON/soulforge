import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadboxFixture } from './feedback_readbox_fixture.mjs';
import { openFeedbackReadbox } from './feedback_readbox.mjs';
import { validateCatalog, validateBindings } from '../codex_work_directory/directory.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rejects = (operation, code) => assert.rejects(operation, error => error.feedbackCode === code);
async function fixture(t) { const f = await createReadboxFixture(); t.after(() => f.close()); return f; }
function update(file, sql, ...values) {
  const db = new DatabaseSync(file);
  try { db.prepare(sql).run(...values); } finally { db.close(); }
}

test('synthetic fixture has valid full route catalog and exact live binding', async t => {
  const f = await fixture(t);
  assert.deepEqual((await validateCatalog(f.catalog)).errors, []);
  assert.deepEqual((await validateBindings(f.bindings, f.catalog)).errors, []);
});

test('actual read-only SQLite joins reports, held results and manager notices without modifying producer state', async t => {
  const f = await fixture(t), reader = await f.open();
  const files = [f.paths.workerDb, f.paths.watchDb, ...Object.values(f.pins).map(pin => path.join(f.evidence, `${pin.ref}.json`))];
  const before = await Promise.all(files.map(file => fs.readFile(file).then(digest)));
  const full = await reader.snapshot({ limit: 100 }, f.access);
  assert.equal(full.state, 'CURRENT'); assert.equal(full.project_id, 'SYN'); assert.equal(full.has_more, false); assert.equal(full.items.length, 3);
  assert.equal(full.items[0].kind, 'manager_notice');
  assert.equal(full.items.find(item => item.ref === f.pins.report.ref).review.status, 'ACCEPT');
  assert.equal(full.items.find(item => item.ref === f.pins.result.ref).review.status, 'NOT_ACCEPTED');
  const short = await reader.snapshot({ limit: 1 }, f.access);
  assert.equal(short.items.length, 1); assert.equal(short.has_more, true);
  for (const item of full.items) {
    assert.deepEqual(await reader.detail({ ref: item.ref, sha256: item.sha256 }, f.access), { project_id: 'SYN', ...item });
    assert.equal(item.local_recorded, true); assert.equal(item.buzz_delivery, 'NOT_OBSERVED');
    assert.equal(item.human_acceptance, 'UNKNOWN'); assert.equal(item.official_done, false); assert.equal(item.owner_decision_required, false);
  }
  assert.deepEqual(await Promise.all(files.map(file => fs.readFile(file).then(digest))), before);
});

test('raw evidence, model inputs, review text and paths never enter projected metadata', async t => {
  const f = await fixture(t), reader = await f.open();
  const snapshot = await reader.snapshot({ limit: 100 }, f.access);
  for (const value of [snapshot, ...await Promise.all(Object.values(f.pins).map(pin => reader.detail(pin, f.access)))]) {
    const serialized = JSON.stringify(value);
    for (const forbidden of [f.rawSentinel, f.root, 'model_requests', 'model_input', 'raw_stdout', 'unopened-model-file.json', 'summary']) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  }
});

test('current manager, session and project access are required on every read', async t => {
  const f = await fixture(t), reader = await f.open();
  for (const action of [access => reader.snapshot({ limit: 10 }, access), access => reader.detail(f.pins.report, access)]) {
    await rejects(() => action({ ...f.access, accountId: 'other.synthetic' }), 'FEEDBACK_READBOX_ACCESS_REQUIRED');
    await rejects(() => action({ ...f.access, checkSession: async () => false }), 'FEEDBACK_READBOX_AUTH_REQUIRED');
    await rejects(() => action({ ...f.access, canAccessProject: async () => false }), 'FEEDBACK_READBOX_ACCESS_REQUIRED');
  }
  await f.writeCurrent({ active: false });
  await rejects(() => reader.snapshot({ limit: 10 }, f.access), 'FEEDBACK_READBOX_ACCESS_REQUIRED');
});

test('mutable current access cannot be stale, expired, future-dated or rebound to another project/scope', async t => {
  const f = await fixture(t), reader = await f.open(), baseline = structuredClone(f.current);
  for (const patch of [{ observed_at: new Date(Date.now() - 600000).toISOString() }, { observed_at: new Date(Date.now() + 600000).toISOString() },
    { expires_at: new Date(Date.now() - 1000).toISOString() }, { issued_at: new Date(Date.now() + 600000).toISOString() },
    { project_id: 'OTHER' }, { scope_ref: 'project:OTHER' }, { manager_account_ids: [] }]) {
    await f.writeCurrent({ ...baseline, ...patch });
    await rejects(() => reader.snapshot({ limit: 10 }, f.access), 'FEEDBACK_READBOX_ACCESS_REQUIRED');
  }
});

test('session and on-disk project authority revoked during awaited reads discard results', async t => {
  const f = await fixture(t), reader = await f.open();
  let calls = 0;
  await rejects(() => reader.snapshot({ limit: 10 }, { ...f.access, checkSession: async () => ++calls < 3 }), 'FEEDBACK_READBOX_AUTH_REQUIRED');
  let revoked = false;
  await rejects(() => reader.detail(f.pins.report, { ...f.access, canAccessProject: async () => {
    if (!revoked) { revoked = true; await f.writeCurrent({ active: false }); } return true;
  } }), 'FEEDBACK_READBOX_ACCESS_REQUIRED');
});

test('pins and supported query limits are checked; raw file paths and stale hashes do not resolve', async t => {
  const f = await fixture(t), reader = await f.open();
  for (const limit of [0, -1, 101, 1.5, '10', undefined]) await rejects(() => reader.snapshot({ limit }, f.access), 'FEEDBACK_READBOX_QUERY_INVALID');
  await rejects(() => reader.detail({ ...f.pins.report, sha256: 'b'.repeat(64) }, f.access), 'FEEDBACK_READBOX_PIN_CHANGED');
  await rejects(() => reader.detail({ ref: '../model-input', sha256: f.pins.report.sha256 }, f.access), 'FEEDBACK_READBOX_RECORD_NOT_FOUND');
  const file = path.join(f.evidence, `${f.pins.report.ref}.json`), body = JSON.parse(await fs.readFile(file));
  await f.save(file, { ...body, untouched_private_extra: 'changed synthetic bytes' });
  await rejects(() => reader.detail(f.pins.report, f.access), 'FEEDBACK_READBOX_PIN_CHANGED');
  await rejects(() => openFeedbackReadbox({ ...f.options, configSha256: '0'.repeat(64) }), 'FEEDBACK_RUNTIME_PIN_CHANGED');
});

test('config/deployment pin drift and actual SQLite scope binding drift fail closed', async t => {
  const f = await fixture(t), reader = await f.open(), original = await fs.readFile(f.configPath);
  await f.save(f.configPath, { ...f.config, project_id: 'OTHER' });
  await rejects(() => reader.snapshot({ limit: 10 }, f.access), 'FEEDBACK_RUNTIME_PIN_CHANGED');
  await fs.writeFile(f.configPath, original);
  const originalDeployment = await fs.readFile(f.paths.deployment);
  await f.save(f.paths.deployment, { ...f.deployment, enabled: false });
  await rejects(() => reader.snapshot({ limit: 10 }, f.access), 'FEEDBACK_RUNTIME_PIN_CHANGED');
  await fs.writeFile(f.paths.deployment, originalDeployment);
  update(f.paths.workerDb, 'UPDATE dev_feedback_runtime_binding SET digest=? WHERE id=1', '0'.repeat(64));
  await rejects(() => reader.snapshot({ limit: 10 }, f.access), 'FEEDBACK_READBOX_SCOPE_MISMATCH');
});

test('report identity mismatch and foreign-scope watchdog run references are rejected', async t => {
  const f = await fixture(t), reader = await f.open(), file = path.join(f.evidence, `${f.pins.report.ref}.json`);
  const original = await fs.readFile(file), body = JSON.parse(original);
  await f.save(file, { ...body, source_ref: 'linear.issue.other' });
  await rejects(() => reader.snapshot({ limit: 10 }, f.access), 'FEEDBACK_READBOX_RECORD_INVALID');
  await fs.writeFile(file, original);
  update(f.paths.workerDb, 'UPDATE dev_feedback_revision SET scope_ref=?', 'project:OTHER');
  await rejects(() => reader.snapshot({ limit: 10 }, f.access), 'FEEDBACK_READBOX_SCOPE_MISMATCH');
});

test('service reads require a separate current dispatch grant', async t => {
  const f = await fixture(t), reader = await f.open();
  assert.equal((await reader.serviceSnapshot()).items.length, 3);
  assert.equal((await reader.serviceDetail(f.pins.report)).ref, f.pins.report.ref);
  await f.writeCurrent({ dispatch_enabled: false });
  await rejects(() => reader.serviceSnapshot(), 'FEEDBACK_READBOX_ACCESS_REQUIRED');
  assert.equal((await reader.snapshot({ limit: 10 }, f.access)).items.length, 3, 'manager reading does not inherit the service dispatch grant');
});

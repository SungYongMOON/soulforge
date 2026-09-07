import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchExecutionStore } from '../src/workbench_execution_store.mjs';
import { mkdtemp, rm, symlink, copyFile, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const digest = digit => `sha256:${digit.repeat(64)}`;
function input(overrides = {}) {
  return { claim_key: digest('1'), basis_digest: digest('2'), request_id: `w_${'a'.repeat(32)}`,
    requester: 'member.0123456789abcdef', project_code: 'SYN-001', revision_no: 1, revision_of: null,
    agent_id: 'synthetic.agent', binding_digest: digest('3'), authority_epoch: 7,
    deadline_at: new Date(Date.now() + 5000).toISOString(), instance_ref: 'synthetic.instance.a', ...overrides };
}
async function context(t) {
  const root = await mkdtemp(join(tmpdir(), 'wb-execution-store-'));
  const stores = [];
  t.after(async () => { for (const store of stores) { try { store.close(); } catch {} } await rm(root, { recursive: true, force: true }); });
  const open = options => { const store = createWorkbenchExecutionStore({ root, ...options }); stores.push(store); return store; };
  return { root, open };
}

function claimInChild(root, basis) {
  const moduleUrl = new URL('../src/workbench_execution_store.mjs', import.meta.url).href;
  const childCode = `try { const {createWorkbenchExecutionStore}=await import(process.argv[1]); const store=createWorkbenchExecutionStore({root:process.argv[2]}); const result=store.claim(JSON.parse(process.argv[3])); console.log(JSON.stringify({status:result.status,run:result.run?.run_id})); store.close(); } catch(error) { console.log(JSON.stringify({error_code:/^[A-Z][A-Z0-9_]{2,63}$/.test(error.workbenchCode ?? error.code) ? error.workbenchCode ?? error.code : 'UNKNOWN',sqlite_code:Number.isInteger(error.errcode) ? error.errcode : null})); process.exitCode=1; }`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', childCode, moduleUrl, root, JSON.stringify(basis)],
      { windowsHide: true, env: { SystemRoot: process.env.SystemRoot }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.resume(); child.once('error', reject);
    child.once('close', code => {
      try {
        const result = JSON.parse(output);
        if (code !== 0) reject(new Error(`Synthetic claim child failed: exit=${code} code=${result.error_code} sqlite=${result.sqlite_code}`));
        else resolve(result);
      } catch { reject(new Error(`Synthetic claim child output invalid: exit=${code}`)); }
    });
  });
}

async function exclusiveLockInChild(t, root) {
  const childCode = `import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1]); db.exec('BEGIN EXCLUSIVE'); process.send('locked'); process.once('message', delay => setTimeout(() => { db.exec('ROLLBACK'); db.close(); process.disconnect(); }, delay));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', childCode, join(root, 'execution.sqlite')],
    { windowsHide: true, env: { SystemRoot: process.env.SystemRoot }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], timeout: 15000 });
  child.stderr.resume();
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  t.after(async () => { if (child.exitCode === null) child.kill(); await closed; });
  await new Promise((resolve, reject) => {
    child.once('message', message => message === 'locked' ? resolve() : reject(new Error('Synthetic lock child protocol invalid')));
    child.once('error', reject); child.once('close', code => reject(new Error(`Synthetic lock child exited before ready: exit=${code}`)));
  });
  return { releaseAfter: delay => child.send(delay), closed };
}

test('execution storage requires its own existing explicit isolated root', () => {
  assert.throws(() => createWorkbenchExecutionStore());
});

test('durable claim, committed candidate and replay survive closing and reopening the database', async t => {
  const fixture = await context(t);
  const store = fixture.open(); const basis = input();
  const first = store.claim(basis);
  assert.equal(first.status, 'CLAIMED'); assert.equal(first.run.fencing_epoch, 1);
  assert.equal(store.claim(basis).status, 'REPLAY');
  const result = store.settle({ ...first.run, state: 'succeeded', reason_code: null,
    receipt: { result_ref: 'result.synthetic', official_task_done: false }, candidate_bytes: Buffer.from('# Synthetic candidate\n') });
  assert.equal(result.status, 'SETTLED'); store.close();
  const restarted = fixture.open();
  assert.equal(restarted.claim(basis).status, 'REPLAY');
  assert.equal(restarted.read(basis.request_id, 'synthetic.instance.b').state, 'succeeded');
  assert.match(restarted.candidate(basis.request_id, 'synthetic.instance.b').bytes.toString(), /Synthetic candidate/u);
});

test('two independent processes cannot claim the same natural work twice', async t => {
  const fixture = await context(t); fixture.open().close();
  const outcomes = await Promise.allSettled([claimInChild(fixture.root, input()), claimInChild(fixture.root, input({ request_id: `w_${'b'.repeat(32)}` }))]);
  const rows = outcomes.map(outcome => { if (outcome.status === 'rejected') throw outcome.reason; return outcome.value; });
  assert.deepEqual(rows.map(row => row.status).sort(), ['CLAIMED', 'REPLAY']);
  assert.equal(rows[0].run, rows[1].run);
});

test('opening an existing ledger waits for a short independent writer lock before validating its format', async t => {
  const fixture = await context(t); fixture.open().close();
  const lock = await exclusiveLockInChild(t, fixture.root);
  lock.releaseAfter(200);
  try { assert.equal(fixture.open().claim(input()).status, 'CLAIMED'); }
  finally { await lock.closed; }
  assert.equal(await lock.closed, 0);
});

test('startup lock exhaustion is retryable without mistaking a valid ledger for a foreign database', async t => {
  const fixture = await context(t); fixture.open().close();
  const before = await readFile(join(fixture.root, 'execution.sqlite'));
  const lock = await exclusiveLockInChild(t, fixture.root);
  const started = performance.now();
  try {
    assert.throws(() => fixture.open(), { workbenchCode: 'EXECUTION_STORE_BUSY' });
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 900 && elapsed < 5000, 'startup must use the existing bounded busy wait');
  } finally { lock.releaseAfter(0); await lock.closed; }
  assert.equal(await lock.closed, 0);
  assert.deepEqual(await readFile(join(fixture.root, 'execution.sqlite')), before);
  assert.equal(fixture.open().claim(input()).status, 'CLAIMED');
});

test('waiting for a lock never admits or changes foreign metadata', async t => {
  const fixture = await context(t);
  const file = join(fixture.root, 'execution.sqlite');
  const foreign = new DatabaseSync(file);
  foreign.exec("CREATE TABLE wb_meta(id INTEGER PRIMARY KEY, format INTEGER, backup_class TEXT); INSERT INTO wb_meta VALUES(1,2,'synthetic-only');");
  foreign.close(); const before = await readFile(file);
  const lock = await exclusiveLockInChild(t, fixture.root);
  lock.releaseAfter(200);
  try { assert.throws(() => fixture.open(), { workbenchCode: 'EXECUTION_FORMAT_INVALID' }); }
  finally { await lock.closed; }
  assert.deepEqual(await readFile(file), before);
});

test('one agent slot blocks another claim and changed replay basis fails closed', async t => {
  const fixture = await context(t); const store = fixture.open(); store.claim(input());
  assert.equal(store.claim(input({ claim_key: digest('4'), request_id: `w_${'b'.repeat(32)}` })).hold_code, 'PERFORMING_AGENT_SLOT_BUSY');
  assert.throws(() => store.claim(input({ basis_digest: digest('9') })), { workbenchCode: 'EXECUTION_REPLAY_CONFLICT' });
});

test('crash recovery is held, deadline fences late completion, and only a subsequent request revision can retry', async t => {
  const fixture = await context(t); let time = Date.now();
  const first = fixture.open({ now: () => time });
  const basis = input({ deadline_at: new Date(time + 100).toISOString() });
  const claimed = first.claim(basis); first.close();
  const restarted = fixture.open({ now: () => time });
  assert.equal(restarted.read(basis.request_id, 'synthetic.instance.b').observed_reason, 'RUN_RECOVERY_REQUIRED');
  time += 101;
  assert.equal(restarted.settle({ ...claimed.run, state: 'succeeded', reason_code: null,
    receipt: { result_ref: 'late.synthetic' }, candidate_bytes: Buffer.from('late') }).hold_code, 'RUN_FENCED_OUT');
  assert.equal(restarted.claim({ ...basis, deadline_at: new Date(time + 1000).toISOString() }).status, 'REPLAY');
  const successor = restarted.claim({ ...basis, request_id: `w_${'c'.repeat(32)}`, revision_of: basis.request_id, revision_no: 2,
    deadline_at: new Date(time + 1000).toISOString(), instance_ref: 'synthetic.instance.b' });
  assert.equal(successor.status, 'CLAIMED'); assert.equal(successor.run.attempt_no, 2); assert.equal(successor.run.fencing_epoch, 2);
  assert.equal(restarted.settle({ ...claimed.run, state: 'hold', reason_code: 'LATE_CALLBACK' }).hold_code, 'RUN_FENCED_OUT');
});

test('cancellation persists without candidate bytes and makes all late outcomes ineligible', async t => {
  const fixture = await context(t); const store = fixture.open(); const claimed = store.claim(input());
  assert.equal(store.settle({ ...claimed.run, state: 'cancelled', reason_code: 'USER_CANCELLED' }).status, 'SETTLED');
  assert.equal(store.settle({ ...claimed.run, state: 'succeeded', reason_code: null,
    receipt: { result_ref: 'late.synthetic' }, candidate_bytes: Buffer.from('late') }).hold_code, 'RUN_FENCED_OUT');
  assert.equal(store.candidate(claimed.run.request_id, claimed.run.instance_ref), null);
});

test('a closed synthetic ledger can be copied and restored with the same candidate digest', async t => {
  const fixture = await context(t); const store = fixture.open(); const basis = input();
  const claimed = store.claim(basis);
  store.settle({ ...claimed.run, state: 'succeeded', reason_code: null, receipt: { result_ref: 'result.synthetic' },
    candidate_bytes: Buffer.from('synthetic candidate backup bytes') });
  const before = store.candidate(basis.request_id, basis.instance_ref); store.close();
  const restoredRoot = await mkdtemp(join(tmpdir(), 'wb-execution-restore-'));
  let restored;
  t.after(async () => { restored?.close(); await rm(restoredRoot, { recursive: true, force: true }); });
  await copyFile(join(fixture.root, 'execution.sqlite'), join(restoredRoot, 'execution.sqlite'));
  restored = createWorkbenchExecutionStore({ root: restoredRoot });
  assert.equal(restored.backupClass, 'synthetic-only');
  assert.deepEqual(restored.candidate(basis.request_id, basis.instance_ref), before);
});

test('foreign existing SQLite bytes and linked roots are refused without migration', async t => {
  const fixture = await context(t);
  const file = join(fixture.root, 'execution.sqlite');
  const foreign = new DatabaseSync(file); foreign.exec('CREATE TABLE unrelated(value TEXT);'); foreign.close();
  const before = await readFile(file);
  assert.throws(() => fixture.open(), { workbenchCode: 'EXECUTION_FORMAT_INVALID' });
  assert.deepEqual(await readFile(file), before);
  const parent = await mkdtemp(join(tmpdir(), 'wb-execution-link-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const linked = join(parent, 'linked');
  await symlink(fixture.root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => createWorkbenchExecutionStore({ root: linked }), { workbenchCode: 'EXECUTION_ROOT_UNSAFE' });
});

test('a replay alias can be the exact retry parent, but a running revision cannot poison future lineage', async t => {
  const fixture = await context(t); const store = fixture.open(); const basis = input();
  const first = store.claim(basis);
  const alias = input({ request_id: `w_${'b'.repeat(32)}` });
  assert.equal(store.claim(alias).status, 'REPLAY');
  const next = input({ request_id: `w_${'c'.repeat(32)}`, revision_of: alias.request_id, revision_no: 2 });
  assert.equal(store.claim(next).hold_code, 'RUN_STILL_ACTIVE');
  assert.equal(store.read(next.request_id, basis.instance_ref), null);
  store.settle({ ...first.run, state: 'cancelled', reason_code: 'USER_CANCELLED' });
  const retry = store.claim(next);
  assert.equal(retry.status, 'CLAIMED'); assert.equal(retry.run.attempt_no, 2); assert.equal(retry.run.request_id, next.request_id);
});

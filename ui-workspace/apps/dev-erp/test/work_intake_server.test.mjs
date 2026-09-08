import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.mjs';
import { computeUnverifiedAgentApprovalClaimDigest, AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA } from '../../../../guild_hall/agent_observation/agent_authority_verification.mjs';
import { makeBuzzPilotWorkbenchFixture } from './helpers/buzz_pilot_workbench_fixture.mjs';

const BASE = '/api/workbench/work-intake', PAGE = '/workbench/work-intake';
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const resultRef = `intake.result.${'a'.repeat(32)}`;
// This preload only observes the real connection close and makes a graceful
// shutdown signal testable on Windows. It does not replace auth or runtime I/O.
const preload = `import { DatabaseSync } from 'node:sqlite'; import { writeFileSync } from 'node:fs';
const close = DatabaseSync.prototype.close;
DatabaseSync.prototype.close = function () {
  let intake = false;
  try { intake = !!this.prepare("SELECT name FROM sqlite_master WHERE name='intake_runtime_binding'").get(); } catch {}
  const result = Reflect.apply(close, this, []);
  if (intake) writeFileSync(process.env.WORK_INTAKE_TEST_CLOSE, 'closed');
  return result;
};
process.on('message', message => { if (message === 'synthetic-stop') process.emit('SIGTERM'); });`;

async function cleanup(root, prefix) {
  const resolved = await realpath(root), temp = await realpath(tmpdir());
  const within = relative(temp, resolved);
  assert.ok(within && !within.startsWith('..') && !isAbsolute(within) && within.startsWith(prefix));
  await rm(resolved, { recursive: true, force: true });
}

async function fixture(t, { database = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'work-intake-server-'));
  const control = join(root, 'control'), evidence = join(root, 'evidence'), trusted = join(root, 'trusted');
  await Promise.all([control, evidence, trusted].map(value => mkdir(value)));
  const children = [], stops = [];
  t.after(async () => { for (const stop of stops) await stop(); await cleanup(root, 'work-intake-server-'); });
  const save = async (file, value) => { await writeFile(file, JSON.stringify(value)); return { path: file, sha256: hash(value) }; };
  const now = Date.now(), at = new Date(now - 1000).toISOString(), until = new Date(now + 600000).toISOString();
  const sha = `sha256:${'a'.repeat(64)}`, scope = 'project:SYN-001';
  const fields = { lineage_digest: sha, family_ref: 'family:G1', family_digest: sha, mark_ref: 'mark:G1', mark_digest: sha,
    deployment_ref: 'deployment:G1', deployment_digest: sha, memory_generation_ref: 'memory:G1', memory_digest: sha };
  const claim = { project_scope_ref: scope, project_scope_refs: [scope], ...fields,
    authority_receipt_ref: 'approval:synthetic', authority_receipt_verified: false };
  const pin = { schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA, pin_ref: 'pin:synthetic', verification_receipt_ref: 'verification:synthetic',
    owner_ref: 'owner:synthetic', authority_ref: 'authority:synthetic', verifier_ref: 'verifier:synthetic', project_scope_ref: scope, ...fields,
    approval_claim_digest: computeUnverifiedAgentApprovalClaimDigest(claim, scope).claim_digest,
    authority_receipt_ref: claim.authority_receipt_ref, authority_receipt_digest: sha, claim_ceiling: 'validated_private',
    issued_at: at, verified_at: at, expires_at: until, receipt_epoch: 1, trusted_authority_epoch: 1, revoked: false };
  const current = { schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA, evaluation_ref: 'evaluation:synthetic', evaluated_at: at,
    authority_ref: pin.authority_ref, current_authority_epoch: 1, revoked_pin_refs: [], claim_ceiling: 'validated_private' };
  const currentPath = join(trusted, 'current.json');
  const grant = { grant_ref: 'grant.synthetic', authority_ref: pin.authority_ref, project_ref: 'SYN-001', scope_ref: scope,
    producer_ref: 'producer.G2.synthetic', receiver_ref: 'reviewer.synthetic', agent_group: 'G1', input_class: 'g2_released_workpacket',
    actions: ['view'], valid_from: at, valid_until: until, maximum_events: 8 };
  const deployment = { version: 1, project_ref: 'SYN-001', scope_ref: scope, mode: 'synthetic_rehearsal', data_provenance: 'synthetic',
    control_root: control, evidence_root: evidence, release_binding_roots: [trusted],
    authority: { grant: await save(join(trusted, 'grant.json'), grant), claim: await save(join(trusted, 'claim.json'), claim),
      pin: await save(join(trusted, 'pin.json'), pin), current: { ...await save(currentPath, current), sha256: null } },
    // Read-only review needs neither input bodies nor model/reader executables.
    source_index: { path: join(trusted, 'unread-source-index.json'), sha256: null },
    documents: { path: join(trusted, 'unread-documents.json'), sha256: 'b'.repeat(64) } };
  const deploymentPin = await save(join(trusted, 'deployment.json'), deployment);
  const report = { project_ref: 'SYN-001', run_id: 'intake.run.synthetic', status: 'COMPLETED', data_provenance: 'synthetic',
    candidates: [{ classification: 'NEW', reason_codes: ['NEW_REQUEST'], matched_task_ref: null, engineering: null }],
    official_done: false, external_effects: 0 };
  const resultPin = await save(join(evidence, `${resultRef}.json`), report);
  const runtimeDb = join(control, 'work-intake.runtime.sqlite');
  if (database) {
    // Explicit fixture preparation, never server/runtime initialization.
    const db = new DatabaseSync(runtimeDb);
    db.exec(`CREATE TABLE intake_runtime_binding(id INTEGER PRIMARY KEY,digest TEXT NOT NULL);
      CREATE TABLE intake_runtime_run(sequence INTEGER PRIMARY KEY,run_id TEXT NOT NULL UNIQUE,
        input_key TEXT NOT NULL,state TEXT NOT NULL,result_ref TEXT,result_sha256 TEXT,reason TEXT,started_at TEXT NOT NULL,finished_at TEXT);`);
    db.prepare('INSERT INTO intake_runtime_binding VALUES(1,?)').run(hash({ project: deployment.project_ref, scope,
      mode: deployment.mode, data_provenance: deployment.data_provenance }));
    db.prepare('INSERT INTO intake_runtime_run VALUES(1,?,?,?,?,?,?,?,?)').run(report.run_id, 'c'.repeat(64), 'COMMITTED', resultRef, resultPin.sha256, null, at, at);
    db.prepare('INSERT INTO intake_runtime_run VALUES(2,?,?,?,?,?,?,?,?)').run('intake.run.held', 'd'.repeat(64), 'HELD', null, null, 'INTAKE_SOURCE_UNAVAILABLE', at, at);
    db.close();
  }
  const detailPath = `${BASE}/result?${new URLSearchParams({ run_id: report.run_id, ref: resultRef, sha256: resultPin.sha256 })}`;
  async function start(extra = {}, host = '127.0.0.1') {
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    assert.ok(![4300, 4192].includes(port));
    const appDb = join(root, `app-${children.length}.sqlite`), closeReceipt = join(root, `close-${children.length}.txt`);
    const seed = openStore(appDb);
    seed.createAccount({ id: 'reviewer.synthetic', username: 'reviewer', password: 'synthetic-reviewer-only', roles: ['admin'] });
    seed.createAccount({ id: 'other.synthetic', username: 'other', password: 'synthetic-other-only', roles: ['member'] });
    seed.upsertProject({ id: 'SYN-001', title: 'Synthetic review project', health: 'ok', data_label: 'synthetic' });
    const item = seed.createItem({ project_id: 'SYN-001', title: 'Synthetic private task', assignee_ref: 'reviewer.synthetic', created_by: 'reviewer' });
    assert.equal(item.ok, true); seed.db.prepare("UPDATE core_item SET data_label='synthetic' WHERE id=?").run(item.item.id); seed.db.close();
    const child = spawn(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'server.mjs',
      '--port', String(port), '--host', host, '--db', appDb, '--no-fixture', '--no-real-meta', '--no-tls',
      '--knowledge_shell_root', root, '--knowledge_dir', root], { cwd: appRoot, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
        DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: root,
        DEV_ERP_WORK_INTAKE_READ: '1', DEV_ERP_WORK_INTAKE_DEPLOYMENT: deploymentPin.path,
        DEV_ERP_WORK_INTAKE_DEPLOYMENT_SHA256: deploymentPin.sha256, WORK_INTAKE_TEST_CLOSE: closeReceipt, ...extra } });
    children.push(child);
    const stop = async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit'); child.send('synthetic-stop');
      const timer = setTimeout(() => child.kill(), 5000);
      try { await exited; } finally { clearTimeout(timer); }
    };
    stops.push(stop);
    const origin = `http://127.0.0.1:${port}`, deadline = Date.now() + 10000;
    for (;;) {
      assert.equal(child.exitCode, null, 'isolated server must stay alive');
      try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* Bounded synthetic startup. */ }
      assert.ok(Date.now() < deadline, 'isolated server startup deadline');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const http = (route = BASE, cookie = '', options = {}) => fetch(origin + route, { ...options,
      headers: { 'sec-fetch-site': 'same-origin', cookie, ...options.headers } });
    const login = async (username, password) => {
      const response = await http('/api/auth/login', '', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }) });
      assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0];
    };
    return { appDb, closeReceipt, http, stop, origin, port,
      reviewer: await login('reviewer', 'synthetic-reviewer-only'), other: await login('other', 'synthetic-other-only') };
  }
  return { root, control, evidence, runtimeDb, deploymentPin, current, currentPath, detailPath, report, save, start };
}

test('actual server joins read-only intake runtime to local login, project rights, exact result pins and graceful close', { timeout: 20000 }, async t => {
  const f = await fixture(t), before = await readFile(f.runtimeDb), s = await f.start();
  assert.equal((await s.http()).status, 401);
  assert.equal((await s.http(PAGE)).status, 401);
  for (const route of [BASE, PAGE, f.detailPath]) assert.equal((await s.http(route, s.other)).status, 403);
  const first = await s.http(`${BASE}?limit=1`, s.reviewer), snapshot = await first.json();
  assert.equal(first.status, 200); assert.equal(snapshot.items[0].run_id, f.report.run_id); assert.equal(snapshot.next, 1);
  assert.equal(first.headers.get('cache-control'), 'no-store'); assert.equal(snapshot.official_done, false);
  const next = await (await s.http(`${BASE}?limit=1&after=1`, s.reviewer)).json();
  assert.equal(next.items[0].state, 'HELD'); assert.equal(next.next, null);
  const result = await s.http(f.detailPath, s.reviewer); assert.equal(result.status, 200); assert.deepEqual(await result.json(), f.report);
  assert.equal((await s.http(f.detailPath.replace('a'.repeat(32), 'b'.repeat(32)), s.reviewer)).status, 404);
  assert.equal((await s.http(f.detailPath.replace(/sha256=[a-f0-9]{64}/u, `sha256=${'f'.repeat(64)}`), s.reviewer)).status, 404);
  const page = await s.http(PAGE, s.reviewer); assert.equal(page.status, 200);
  assert.match(await page.text(), /과제 업무 발견/u);
  assert.match(await (await s.http('/', s.reviewer)).text(), /href="\/workbench\/work-intake"/u);
  for (const route of [BASE, PAGE, f.detailPath]) {
    assert.equal((await s.http(route, s.reviewer, { method: 'POST' })).status, 405);
    assert.equal((await s.http(route, s.reviewer, { headers: { origin: 'http://example.invalid' } })).status, 403);
  }
  assert.equal((await s.http(`${BASE}?deployment=other`, s.reviewer)).status, 400);
  f.current.revoked_pin_refs = ['pin:synthetic']; await f.save(f.currentPath, f.current);
  for (const route of [BASE, PAGE, f.detailPath]) {
    const response = await s.http(route, s.reviewer); assert.equal(response.status, 503);
    assert.equal((await response.text()).includes(f.report.run_id), false);
  }
  f.current.revoked_pin_refs = []; await f.save(f.currentPath, f.current);
  const accountDb = new DatabaseSync(s.appDb);
  accountDb.prepare('DELETE FROM auth_session WHERE account_id=?').run('reviewer.synthetic'); accountDb.close();
  for (const route of [BASE, PAGE, f.detailPath]) assert.equal((await s.http(route, s.reviewer)).status, 401);
  assert.deepEqual(await readFile(f.runtimeDb), before);
  assert.deepEqual(await readdir(f.control), ['work-intake.runtime.sqlite']);
  assert.deepEqual(await readdir(f.evidence), [`${resultRef}.json`]);
  await s.stop(); assert.equal(await readFile(s.closeReceipt, 'utf8'), 'closed');
});

test('unconfigured, bad-pin and missing-db intake reads fail closed without creating runtime state', { timeout: 30000 }, async t => {
  const f = await fixture(t, { database: false });
  for (const extra of [{ DEV_ERP_WORK_INTAKE_READ: '0' }, { DEV_ERP_WORK_INTAKE_DEPLOYMENT: '' },
    { DEV_ERP_WORK_INTAKE_DEPLOYMENT_SHA256: '0'.repeat(64) }, {}]) {
    const s = await f.start(extra);
    for (const route of [BASE, PAGE, f.detailPath]) assert.equal((await s.http(route, s.reviewer)).status, 503);
    await s.stop(); assert.deepEqual(await readdir(f.control), []);
    await assert.rejects(readFile(s.closeReceipt), { code: 'ENOENT' });
  }
});

test('Buzz source sessions cannot authorize company intake reads on a separately authenticated server', { timeout: 20000 }, async t => {
  const f = await fixture(t), buzz = await makeBuzzPilotWorkbenchFixture();
  t.after(() => cleanup(buzz.root, 'sf-buzz-workbench-'));
  const sourceDb = join(f.root, 'source-auth.sqlite'), source = openStore(sourceDb);
  source.createAccount({ id: 'account.a', username: 'source-owner', password: 'synthetic-source-only', roles: ['admin'] });
  source.upsertProject({ id: 'SYN-001', title: 'Synthetic source project', health: 'ok', data_label: 'synthetic' });
  const session = source.createSession('account.a'); source.db.close();
  const sourcePort = '47820';
  const s = await f.start({ DEV_ERP_BUZZ_PILOT_READ: '1', DEV_ERP_BUZZ_PILOT_BINDING: buzz.bindingPath,
    DEV_ERP_BUZZ_PILOT_BINDING_SHA256: buzz.bindingSha256, DEV_ERP_BUZZ_PILOT_AUTH_SOURCE_DB: sourceDb,
    DEV_ERP_BUZZ_PILOT_AUTH_SOURCE_PORT: sourcePort });
  const cookie = `dev_erp_sid_${sourcePort}=${session}`;
  const buzzRead = await s.http('/api/workbench/buzz-pilot', cookie); assert.equal(buzzRead.status, 200);
  for (const route of [BASE, PAGE, f.detailPath]) assert.equal((await s.http(route, cookie)).status, 401);
  assert.equal((await s.http(BASE, s.reviewer)).status, 200);
  await s.stop();
});

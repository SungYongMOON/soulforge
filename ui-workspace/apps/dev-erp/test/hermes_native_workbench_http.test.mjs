import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { request as nodeRequest } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { rm, readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.mjs';
import { makeNativeWorkbenchFixture } from './hermes_native_workbench_fixture.mjs';

async function serve(t, { executionEnabled = true, executionRoot, delayMs = 0, catalogueStatus = 200,
  nativeMode = 'ok', supported = true, nativeProfile = 'workbench-synthetic' } = {}) {
  const fixture = await makeNativeWorkbenchFixture({ mode: nativeMode, supported, profileName: nativeProfile,
    timeoutMs: nativeMode === 'timeout' ? 2000 : 4000 });
  const dbPath = join(fixture.root, 'synthetic-http.db');
  const seed = openStore(dbPath);
  seed.createAccount({ id: 'account.a', username: 'alpha', password: 'synthetic-pass-a', roles: ['member'] });
  seed.createAccount({ id: 'account.b', username: 'beta', password: 'synthetic-pass-b', roles: ['admin'] });
  seed.upsertProject({ id: fixture.scope.project_code, title: '합성 실행 시험', health: 'ok', data_label: 'synthetic' });
  const item = seed.createItem({ project_id: fixture.scope.project_code, title: '합성 요청', assignee_ref: 'alpha', created_by: 'synthetic' });
  seed.db.close();
  const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  assert.ok(![4300, 4192].includes(port));
  const base = `http://127.0.0.1:${port}`;
  const configuredExecutionRoot = executionRoot ? await executionRoot(fixture) : fixture.executionRoot;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP, TMP: process.env.TMP, DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1',
    DEV_ERP_BACKEND_ROOT: fixture.root, DEV_ERP_WORKBENCH_INTAKE: '1', DEV_ERP_WORKBENCH_INTAKE_ROOT: fixture.intakeRoot,
    DEV_ERP_WORKBENCH_SOURCE_ROOT: fixture.sourceRoot, DEV_ERP_WORKBENCH_BINDING_ID: fixture.expectedBinding.binding_id,
    DEV_ERP_WORKBENCH_REALM_ID: fixture.expectedBinding.realm_id, DEV_ERP_WORKBENCH_BINDING_SHA256: fixture.expectedBinding.content_sha256,
    DEV_ERP_WORKBENCH_SYNTHETIC_EXECUTION: '0', DEV_ERP_WORKBENCH_NATIVE_EXECUTION: executionEnabled ? '1' : '0',
    DEV_ERP_WORKBENCH_EXECUTION_ROOT: configuredExecutionRoot,
    DEV_ERP_WORKBENCH_EXECUTION_BINDING_SHA256: fixture.executionDigest };
  const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath, '--no-fixture', '--no-real-meta', '--no-tls',
    '--knowledge_shell_root', fixture.root, '--knowledge_dir', fixture.root], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await rm(fixture.root, { recursive: true, force: true });
  });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const started = Date.now();
  while (true) {
    if (child.exitCode !== null) assert.fail(`Synthetic server exited before ready: ${output}`);
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Isolated server starting. */ }
    if (Date.now() - started > 10000) assert.fail(`Synthetic server startup timeout: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  async function http(path, { method = 'GET', cookie, body, csrf, headers = {} } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'sec-fetch-site': 'same-origin',
      ...(cookie ? { cookie } : {}), ...(body !== undefined ? { origin: base, 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const content = await response.text();
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers,
      body: response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(content) : content };
  }
  const a = await http('/api/auth/login', { method: 'POST', body: { username: 'alpha', password: 'synthetic-pass-a' } });
  const b = await http('/api/auth/login', { method: 'POST', body: { username: 'beta', password: 'synthetic-pass-b' } });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const catalogue = await http('/api/workbench/catalogue', { cookie: a.cookie });
  assert.equal(catalogue.status, catalogueStatus);
  const path = `/api/workbench/requests/${fixture.record.request_id}`;
  const get = suffix => http(`${path}${suffix}`, { cookie: a.cookie });
  const post = (suffix, options = {}) => http(`${path}${suffix}`, {
    method: 'POST', cookie: a.cookie, csrf: catalogue.body.csrf_token, body: {}, ...options });
  assert.equal(output.includes('autosync ON'), false);
  assert.equal(output.includes('아침 브리핑 push ON'), false);
  return { fixture, configuredExecutionRoot, dbPath, item, http, base, a, b, catalogue: catalogue.body, path, get, post };
}

async function settled(get) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await get('/execution');
    assert.equal(result.status, 200);
    if (result.body.execution_state !== 'running') return result.body;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('Synthetic execution did not settle');
}

test('actual native HTTP user flow observes a response without candidate custody or Task Done', { timeout: 20000 }, async t => {
  const app = await serve(t);
  assert.equal(app.catalogue.execution_mode, 'native_chat');
  assert.equal(app.catalogue.execution_enabled, true);
  assert.equal(app.catalogue.native_execution_enabled, true);
  assert.equal(app.catalogue.synthetic_execution_enabled, false);
  assert.equal((await app.post('/execution')).status, 202);
  const result = await settled(app.get);
  assert.equal(result.execution_state, 'response_observed', JSON.stringify(result));
  assert.equal(result.response_observed, true);
  assert.equal(result.execution_started, true);
  assert.equal(result.local_candidate_stored, false);
  assert.equal(result.official_task_done, false);
  assert.equal((await app.get('/candidate')).status, 404);
  assert.equal((await app.post('/execution')).body.replayed, true);
  assert.equal((await readFile(join(app.fixture.nativeHome, 'started.txt'), 'utf8')).trim().split('\n').length, 1);
});

test('actual native HTTP supports the existing default profile with official NULL session metadata', { timeout: 20000 }, async t => {
  const app = await serve(t, { nativeProfile: 'default' });
  assert.equal((await app.post('/execution')).status, 202);
  const result = await settled(app.get);
  assert.equal(result.execution_state, 'response_observed', JSON.stringify(result));
  assert.equal(result.local_candidate_stored, false);
  const argv = JSON.parse(await readFile(join(app.fixture.nativeHome, 'argv.json'), 'utf8'));
  assert.equal(argv[argv.indexOf('-p') + 1], 'default');
});

test('native HTTP retains current ownership, same-origin and CSRF on every execution route', { timeout: 20000 }, async t => {
  const app = await serve(t);
  assert.equal((await app.post('/execution', { csrf: undefined })).status, 403);
  assert.equal((await app.post('/execution', { headers: { origin: 'http://evil.invalid' } })).status, 403);
  assert.equal((await app.post('/execution', { body: { mode: 'native_chat', runtime: 'untrusted' } })).status, 400);
  const bCatalogue = await app.http('/api/workbench/catalogue', { cookie: app.b.cookie });
  assert.equal((await app.post('/execution', { cookie: app.b.cookie, csrf: bCatalogue.body.csrf_token })).status, 404);
  const changed = openStore(app.dbPath);
  changed.db.prepare('UPDATE core_item SET assignee_ref=? WHERE project_id=?').run('beta', app.fixture.scope.project_code);
  changed.db.close();
  assert.equal((await app.get('/execution')).status, 404);
  await assert.rejects(readFile(join(app.fixture.nativeHome, 'started.txt')));
});

test('native HTTP capability HOLD happens before a missing issued body could be read', { timeout: 20000 }, async t => {
  const app = await serve(t, { supported: false });
  await rm(join(app.fixture.nativeBodies, 'forge-packet.json'));
  assert.equal((await app.post('/execution')).status, 202);
  const result = await settled(app.get);
  assert.equal(result.hold_code, 'HERMES_NATIVE_CURRENT_BINDING_REQUIRED', JSON.stringify(result));
  assert.equal(result.local_candidate_stored, false);
  await assert.rejects(readFile(join(app.fixture.nativeHome, 'started.txt')));
});

test('native HTTP timeout is UNKNOWN and a recorded successor never resends', { timeout: 20000 }, async t => {
  const app = await serve(t, { nativeMode: 'timeout' });
  assert.equal((await app.post('/execution')).status, 202);
  const result = await settled(app.get);
  assert.equal(result.execution_state, 'hold', JSON.stringify(result));
  assert.equal(result.hold_code, 'HERMES_NATIVE_TIMEOUT_UNKNOWN');
  const next = await app.post('/revision');
  assert.equal(next.status, 201, JSON.stringify(next.body));
  const route = '/api/workbench/requests/' + next.body.request_id;
  assert.equal((await app.http(route + '/execution', { method: 'POST', cookie: app.a.cookie,
    csrf: app.catalogue.csrf_token, body: {} })).status, 202);
  const successor = await settled(suffix => app.http(route + suffix, { cookie: app.a.cookie }));
  assert.equal(successor.hold_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED', JSON.stringify(successor));
  assert.equal((await readFile(join(app.fixture.nativeHome, 'started.txt'), 'utf8')).trim().split('\n').length, 1);
});

test('native HTTP stop request fences publication and preserves no-resend after direct-child abort', { timeout: 20000 }, async t => {
  const app = await serve(t, { nativeMode: 'timeout' });
  assert.equal((await app.post('/execution')).status, 202);
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && !(await app.get('/execution')).body.execution_started) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const stopped = await app.post('/execution/cancel');
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.execution_state, 'cancelled');
  assert.equal(stopped.body.local_candidate_stored, false);
  assert.equal((await app.post('/execution')).body.replayed, true);
  assert.equal((await app.get('/candidate')).status, 404);
});

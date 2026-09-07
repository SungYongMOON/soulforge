import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { request as nodeRequest } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { rm, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.mjs';
import { makeWorkbenchExecutionFixture } from './helpers/workbench_execution_fixture.mjs';

async function serve(t, { executionEnabled = true, executionRoot, delayMs = 0, catalogueStatus = 200 } = {}) {
  const fixture = await makeWorkbenchExecutionFixture({ delayMs });
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
    DEV_ERP_WORKBENCH_SYNTHETIC_EXECUTION: executionEnabled ? '1' : '0',
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

test('actual HTTP: an owned intake starts the fixed worker and yields an authenticated local candidate', { timeout: 20000 }, async t => {
  const app = await serve(t);
  assert.equal(app.catalogue.synthetic_execution_enabled, true);
  assert.equal((await app.get('/execution')).body.status, 'NOT_STARTED');
  const started = await app.post('/execution');
  assert.equal(started.status, 202);
  assert.equal(started.body.status, 'EXECUTION_RECORDED');
  const result = await settled(app.get);
  assert.equal(result.execution_state, 'succeeded');
  assert.equal(result.execution_started, true);
  assert.equal(result.local_candidate_stored, true);
  assert.equal(result.remote_submission_ack, false);
  assert.equal(result.official_task_done, false);
  const candidate = await app.get('/candidate');
  assert.equal(candidate.status, 200);
  assert.match(candidate.headers.get('content-disposition'), /^attachment;/u);
  assert.match(candidate.body, /synthetic/iu);
  assert.equal((await app.post('/execution')).body.replayed, true);
  assert.equal((await app.get('')).body.execution_started, false);
});

test('actual HTTP: cancellation, replay-safe next revision and a fresh execution preserve the approved basis', { timeout: 20000 }, async t => {
  const app = await serve(t, { delayMs: 300 });
  assert.equal((await app.post('/execution')).status, 202);
  const cancelled = await app.post('/execution/cancel');
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.execution_state, 'cancelled');
  assert.equal((await app.get('/candidate')).status, 404);
  const revision = await app.post('/revision');
  assert.equal(revision.status, 201, JSON.stringify(revision.body));
  assert.notEqual(revision.body.request_id, app.fixture.record.request_id);
  const replay = await app.post('/revision');
  assert.equal(replay.status, 200);
  assert.equal(replay.body.request_id, revision.body.request_id);
  assert.equal(replay.body.replayed, true);
  const nextPath = `/api/workbench/requests/${revision.body.request_id}`;
  const started = await app.http(`${nextPath}/execution`, {
    method: 'POST', cookie: app.a.cookie, csrf: app.catalogue.csrf_token, body: {} });
  assert.equal(started.status, 202);
  assert.equal(started.body.attempt_no, 2);
  const result = await settled(suffix => app.http(`${nextPath}${suffix}`, { cookie: app.a.cookie }));
  assert.equal(result.execution_state, 'succeeded');
  assert.equal(result.local_candidate_stored, true);
  assert.equal((await app.get('/execution')).body.execution_state, 'cancelled');
});

test('actual HTTP: all execution and revision operations enforce current ownership, same-origin and CSRF', { timeout: 20000 }, async t => {
  const app = await serve(t);
  for (const suffix of ['/execution', '/execution/cancel', '/revision']) {
    assert.equal((await app.post(suffix, { csrf: undefined })).status, 403);
    assert.equal((await app.post(suffix, { headers: { origin: 'http://evil.invalid' } })).status, 403);
    assert.equal((await app.post(suffix, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    for (const body of [[], null, { code: 'arbitrary' }, { requester: 'owner.local' }]) {
      assert.equal((await app.post(suffix, { body })).status, 400);
    }
    assert.equal((await app.post(suffix, { body: { padding: 'x'.repeat(300) } })).status, 413);
    assert.equal((await app.post(`${suffix}?mode=real`)).status, 404);
  }
  const bCatalogue = await app.http('/api/workbench/catalogue', { cookie: app.b.cookie });
  for (const suffix of ['/execution', '/execution/cancel', '/revision']) {
    assert.equal((await app.post(suffix, { cookie: app.b.cookie, csrf: bCatalogue.body.csrf_token })).status, 404);
  }
  for (const suffix of ['/execution', '/candidate']) {
    assert.equal((await app.http(`${app.path}${suffix}`, { cookie: app.b.cookie })).status, 404);
    // Node fetch rewrites Host; send the malformed authority over actual HTTP directly.
    const status = await new Promise((resolve, reject) => {
      const req = nodeRequest(`${app.base}${app.path}${suffix}`, {
        headers: { cookie: app.a.cookie, host: 'evil.invalid', 'sec-fetch-site': 'same-origin' } },
      response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 403);
  }
  assert.equal((await app.get('/execution')).body.status, 'NOT_STARTED');
  assert.equal((await app.post('/execution')).status, 202);
  assert.equal((await settled(app.get)).execution_state, 'succeeded');
  const changed = openStore(app.dbPath);
  changed.db.prepare('UPDATE core_item SET assignee_ref=? WHERE project_id=?').run('beta', app.fixture.scope.project_code);
  changed.db.close();
  assert.equal((await app.get('/candidate')).status, 404);
  assert.equal((await app.get('/execution')).status, 404);
  assert.equal((await app.post('/revision')).status, 404);
  await app.http('/api/auth/logout', { method: 'POST', cookie: app.a.cookie, body: {} });
  assert.equal((await app.get('/execution')).status, 401);
  assert.equal((await app.get('/candidate')).status, 401);
});

test('actual HTTP: changed approved source blocks downloading and server-derived retry', { timeout: 20000 }, async t => {
  const app = await serve(t);
  assert.equal((await app.post('/execution')).status, 202);
  assert.equal((await settled(app.get)).execution_state, 'succeeded');
  await writeFile(join(app.fixture.sourceRoot, 'blueprint.json'), 'changed synthetic source');
  assert.equal((await app.get('/candidate')).status, 503);
  assert.equal((await app.post('/revision')).status, 503);
  assert.equal((await readdir(app.fixture.intakeRoot)).filter(name => name.endsWith('.json')).length, 1);
});

test('actual HTTP: default-off and overlapping roots never open an execution database', { timeout: 30000 }, async t => {
  const cases = [
    { name: 'off', executionEnabled: false },
    { name: 'intake root', executionRoot: fixture => fixture.intakeRoot },
    { name: 'source root', executionRoot: fixture => fixture.sourceRoot },
    { name: 'ancestor', executionRoot: fixture => fixture.root },
    { name: 'nested source', executionRoot: async fixture => { const root = join(fixture.sourceRoot, 'nested'); await mkdir(root); return root; } },
    { name: 'nested intake', catalogueStatus: 503, executionRoot: async fixture => { const root = join(fixture.intakeRoot, 'nested'); await mkdir(root); return root; } },
  ];
  for (const options of cases) await t.test(options.name, async subtest => {
    const app = await serve(subtest, options);
    assert.notEqual(app.catalogue.synthetic_execution_enabled, true);
    assert.equal((await app.post('/execution')).status, 405);
    assert.equal((await app.get('/execution')).status, 405);
    assert.equal((await readdir(app.configuredExecutionRoot)).some(name => name.startsWith('execution.sqlite')), false);
  });
});

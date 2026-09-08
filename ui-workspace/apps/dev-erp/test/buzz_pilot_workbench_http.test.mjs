import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuzzPilotWorkbenchHttpController } from '../src/buzz_pilot_workbench_http.mjs';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { makeBuzzPilotWorkbenchFixture } from './helpers/buzz_pilot_workbench_fixture.mjs';
import { openStore } from '../src/store.mjs';
import { makeNativeWorkbenchFixture } from './hermes_native_workbench_fixture.mjs';
import { createWorkbenchExecutionSources } from '../src/workbench_execution_sources.mjs';
import { createWorkbenchExecutionStore } from '../src/workbench_execution_store.mjs';
import { createWorkbenchExecutionService } from '../src/workbench_execution_service.mjs';

const base = 'http://127.0.0.1:47821';
function fixture() {
  const state = { account: { id: 'owner.synthetic' }, session: 'synthetic-session', projectAllowed: true, calls: 0 };
  const authorize = async access => {
    state.calls += 1;
    if (access.accountId !== 'owner.synthetic' || !await access.checkSession()
      || !await access.canAccessProject('SYN-001')) throw Object.assign(new Error(), { code: 'buzz_pilot_not_authorized' });
  };
  const service = { snapshot: async access => { await authorize(access); return { version: 1, job_id: 'synthetic.job', state: 'issued',
    recovery_metadata: { session_key: 'session:synthetic', session_id: 'session.synthetic' } }; },
    readEvidence: async (query, access) => { await authorize(access); state.query = query;
      return { bytes: Buffer.from('synthetic evidence'), size: 18, mediaType: 'text/plain' }; } };
  const controller = createBuzzPilotWorkbenchHttpController({ service, allowedOrigin: base,
    currentAccount: () => state.account, sessionKey: () => state.session, canAccessProject: () => state.projectAllowed });
  async function request(path = '/api/workbench/buzz-pilot', options = {}) {
    const req = { method: 'GET', url: path, socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:47821', 'sec-fetch-site': 'same-origin' }, ...options };
    const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
    const handled = await controller(req, res, new URL(path, base));
    return { ...res, handled };
  }
  return { state, service, request };
}

test('Buzz HTTP exposes the current authenticated snapshot and exact observed evidence', async () => {
  const f = fixture();
  const snapshot = await f.request();
  assert.equal(snapshot.statusCode, 200);
  assert.equal(JSON.parse(snapshot.body).job_id, 'synthetic.job');
  assert.equal(Object.hasOwn(JSON.parse(snapshot.body), 'recovery_metadata'), false);
  assert.equal(snapshot.body.includes('session:synthetic'), false);
  const evidence = await f.request('/api/workbench/buzz-pilot/evidence?role=question&observation_id=event.1');
  assert.equal(evidence.statusCode, 200); assert.equal(evidence.body.toString(), 'synthetic evidence');
  assert.deepEqual(f.state.query, { role: 'question', observation_id: 'event.1' });
  assert.equal(evidence.headers['Cache-Control'], 'no-store');
  assert.match(evidence.headers['Content-Disposition'], /^attachment;/u);
  assert.match(evidence.headers['Content-Security-Policy'], /sandbox/u);
});

test('Buzz HTTP refuses every mutation and arbitrary evidence/path query before calling the reader', async () => {
  const f = fixture();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) assert.equal((await f.request(undefined, { method })).statusCode, 405);
  for (const path of ['/api/workbench/buzz-pilot?job_id=other', '/api/workbench/buzz-pilot/evidence?role=question',
    '/api/workbench/buzz-pilot/evidence?role=instruction&path=private.txt',
    '/api/workbench/buzz-pilot/evidence?role=instruction&role=answer',
    '/api/workbench/buzz-pilot/evidence?role=answer&observation_id=../other',
    '/api/workbench/buzz-pilot/evidence?role=reasoning&observation_id=event.1']) assert.equal((await f.request(path)).statusCode, 400, path);
  assert.equal(f.state.calls, 0);
});

test('Buzz HTTP exposes prepared JSON and metadata-only failure reason under the same current authority', async () => {
  const f = fixture(), raw = Buffer.from('{"choices":["Engineering"],"multi_select":false,"question":"Who?"}');
  const original = f.service.readEvidence;
  f.service.readEvidence = async (...args) => { await original(...args); return { bytes: raw, size: raw.length, mediaType: 'application/json' }; };
  const route = '/api/workbench/buzz-pilot/evidence?role=tool_input_effective&observation_id=event.prepared';
  let response = await f.request(route); assert.equal(response.statusCode, 200); assert.deepEqual(response.body, raw);
  assert.deepEqual(f.state.query, { role: 'tool_input_effective', observation_id: 'event.prepared' });
  assert.equal(response.headers['Content-Disposition'], 'attachment; filename="buzz-tool_input_effective.json"');
  const snapshot = f.service.snapshot;
  f.service.snapshot = async access => ({ ...await snapshot(access), state: 'failed', operations_attention: true,
    owner_action_required: false, failure_reason_code: 'pilot_append_rejected' });
  response = await f.request(); const view = JSON.parse(response.body);
  assert.equal(view.failure_reason_code, 'pilot_append_rejected'); assert.equal(view.operations_attention, true);
  assert.equal(view.owner_action_required, false); assert.equal(response.body.includes('session.synthetic'), false);
  f.state.projectAllowed = false; response = await f.request(route); assert.equal(response.statusCode, 403);
  assert.equal(response.body.includes('Engineering'), false);
  f.state.projectAllowed = true;
  f.service.readEvidence = async (...args) => { await original(...args); f.state.session = 'rotated'; return { bytes: raw, size: raw.length, mediaType: 'application/json' }; };
  response = await f.request(route); assert.equal(response.statusCode, 401); assert.equal(response.body.includes('Engineering'), false);
});

test('Buzz HTTP refuses absent login, other Owner, withdrawn project access and cross-origin reads', async () => {
  const f = fixture();
  f.state.account = null; assert.equal((await f.request()).statusCode, 401);
  f.state.account = { id: 'other.synthetic' }; assert.equal((await f.request()).statusCode, 403);
  f.state.account = { id: 'owner.synthetic' }; f.state.projectAllowed = false; assert.equal((await f.request()).statusCode, 403);
  f.state.projectAllowed = true;
  assert.equal((await f.request(undefined, { socket: { remoteAddress: '192.0.2.1' } })).statusCode, 403);
  assert.equal((await f.request(undefined, { headers: { host: '127.0.0.1:47821', 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
});

test('Buzz HTTP rechecks the existing session and project after awaited evidence reads', async () => {
  for (const revoke of ['session', 'project']) {
    const f = fixture(); const original = f.service.readEvidence;
    f.service.readEvidence = async (...args) => { const result = await original(...args);
      if (revoke === 'session') f.state.session = 'rotated-synthetic-session'; else f.state.projectAllowed = false;
      return result; };
    const response = await f.request('/api/workbench/buzz-pilot/evidence?role=instruction');
    assert.equal(response.statusCode, revoke === 'session' ? 401 : 403);
    assert.equal(response.body.includes('synthetic evidence'), false);
  }
});

test('Buzz HTTP keeps internal errors and malformed bytes out of responses', async () => {
  const f = fixture();
  f.service.snapshot = async () => { throw new Error('private synthetic path'); };
  let response = await f.request(); assert.equal(response.statusCode, 503); assert.equal(response.body.includes('private synthetic path'), false);
  f.service.readEvidence = async () => ({ bytes: Buffer.from('wrong'), size: 4, mediaType: 'text/plain' });
  response = await f.request('/api/workbench/buzz-pilot/evidence?role=instruction'); assert.equal(response.statusCode, 503);
});

test('Buzz read configuration failure stays unavailable while a disabled reader remains disabled', async () => {
  for (const enabled of [true, false]) {
    const controller = createBuzzPilotWorkbenchHttpController({ enabled, service: null, allowedOrigin: base,
      currentAccount: () => ({ id: 'owner.synthetic' }), sessionKey: () => 'synthetic-session', canAccessProject: () => true });
    const req = { method: 'GET', url: '/api/workbench/buzz-pilot', socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:47821', 'sec-fetch-site': 'same-origin' } };
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
    await controller(req, res, new URL(req.url, base));
    assert.equal(res.statusCode, enabled ? 503 : 404);
    assert.equal(JSON.parse(res.body).hold_code, enabled ? 'BUZZ_PILOT_UNAVAILABLE' : 'BUZZ_PILOT_DISABLED');
  }
});

test('actual server reads produced Buzz evidence with current Owner access and no second execution entry', { timeout: 20000 }, async t => {
  const f = await makeBuzzPilotWorkbenchFixture({ state: 'delivered' });
  const historical = await makeNativeWorkbenchFixture();
  const historicalSources = createWorkbenchExecutionSources({ intakeSources: historical.intakeSources, mode: 'native_chat',
    bindingDigest: historical.executionDigest, nativeDeployment: { enabled: true, source_root: historical.sourceRoot,
      expected_binding: historical.expectedBinding, native_binding_sha256: historical.executionDigest } });
  const historicalService = createWorkbenchExecutionService({ enabled: true, intakeStore: historical.intakeStore,
    intakeSources: historical.intakeSources, executionSources: historicalSources,
    executionStore: createWorkbenchExecutionStore({ root: historical.executionRoot, mode: 'native_chat' }), nativeDispatchMode: 'synthetic_verification' });
  try {
    await historicalService.start(historical.record.request_id, historical.access);
    const until = Date.now() + 10000;
    for (;;) {
      const status = await historicalService.status(historical.record.request_id, historical.access);
      if (status.execution_state !== 'running') { assert.equal(status.execution_state, 'response_observed'); break; }
      assert.ok(Date.now() < until); await new Promise(resolve => setTimeout(resolve, 25));
    }
  } finally { await historicalService.close(); }
  const dbPath = join(f.root, 'synthetic-server.sqlite');
  const seed = openStore(dbPath);
  seed.createAccount({ id: 'account.a', username: 'alpha', password: 'synthetic-only-a', roles: ['member'] });
  seed.createAccount({ id: 'account.b', username: 'beta', password: 'synthetic-only-b', roles: ['admin'] });
  seed.upsertProject({ id: 'SYN-001', title: 'Synthetic Buzz verification', health: 'ok', data_label: 'synthetic' });
  seed.createItem({ project_id: 'SYN-001', title: 'Synthetic request', assignee_ref: 'alpha', created_by: 'synthetic' });
  seed.db.close();
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  assert.ok(![4300, 4192].includes(port));
  const origin = `http://127.0.0.1:${port}`;
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
    DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: f.root,
    DEV_ERP_BUZZ_PILOT_READ: '1', DEV_ERP_BUZZ_PILOT_BINDING: f.bindingPath, DEV_ERP_BUZZ_PILOT_BINDING_SHA256: f.bindingSha256,
    DEV_ERP_WORKBENCH_INTAKE: '1', DEV_ERP_WORKBENCH_NATIVE_EXECUTION: '1', DEV_ERP_WORKBENCH_NATIVE_TEST_DISPATCH: '1',
    DEV_ERP_WORKBENCH_INTAKE_ROOT: historical.intakeRoot, DEV_ERP_WORKBENCH_SOURCE_ROOT: historical.sourceRoot,
    DEV_ERP_WORKBENCH_BINDING_ID: historical.expectedBinding.binding_id, DEV_ERP_WORKBENCH_REALM_ID: historical.expectedBinding.realm_id,
    DEV_ERP_WORKBENCH_BINDING_SHA256: historical.expectedBinding.content_sha256,
    DEV_ERP_WORKBENCH_EXECUTION_ROOT: historical.executionRoot, DEV_ERP_WORKBENCH_EXECUTION_BINDING_SHA256: historical.executionDigest };
  const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath, '--no-fixture', '--no-real-meta', '--no-tls',
    '--knowledge_shell_root', f.root, '--knowledge_dir', f.root], { cwd: fileURLToPath(new URL('..', import.meta.url)),
    env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    for (const root of [f.root, historical.root]) {
      const resolved = await realpath(root), within = relative(await realpath(tmpdir()), resolved);
      assert.ok(within && !within.startsWith('..') && !isAbsolute(within));
      await rm(resolved, { recursive: true, force: true });
    }
  });
  const deadline = Date.now() + 10000;
  while (true) {
    assert.equal(child.exitCode, null, 'Synthetic HTTP server exited');
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* Local startup only. */ }
    assert.ok(Date.now() < deadline, 'Synthetic server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  async function http(path, { cookie, method = 'GET', body } = {}) {
    const response = await fetch(`${origin}${path}`, { method, headers: { 'sec-fetch-site': 'same-origin',
      ...(cookie ? { cookie } : {}), ...(body ? { origin, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) };
  }
  const login = async (username, password) => (await http('/api/auth/login', { method: 'POST', body: { username, password } }))
    .headers.get('set-cookie')?.split(';')[0];
  const alpha = await login('alpha', 'synthetic-only-a'), beta = await login('beta', 'synthetic-only-b');
  const route = '/api/workbench/buzz-pilot';
  const dbBefore = await readFile(f.binding.control_db_path);
  assert.equal((await http(route)).status, 401);
  assert.equal((await http(route, { cookie: beta })).status, 403);
  const response = await http(route, { cookie: alpha });
  assert.equal(response.status, 200, response.bytes.toString());
  const snapshot = JSON.parse(response.bytes);
  assert.equal(snapshot.state, 'delivered'); assert.equal(snapshot.sequence, 10);
  assert.equal(snapshot.human_accepted, false); assert.equal(snapshot.official_done, false);
  assert.equal(response.bytes.includes(Buffer.from(f.root)), false);
  const historyRoute = `/api/workbench/requests/${historical.record.request_id}`;
  for (const suffix of ['', '/execution', '/execution-log', '/execution-log/instruction', '/execution-log/output']) {
    assert.equal((await http(`${historyRoute}${suffix}`, { cookie: alpha })).status, 200, `Historical GET ${suffix}`);
  }
  const historicalCatalogue = JSON.parse((await http('/api/workbench/catalogue', { cookie: alpha })).bytes);
  assert.equal(historicalCatalogue.execution_enabled, false);
  assert.equal(historicalCatalogue.execution_read_enabled, true);
  for (const [pin, observationId] of [[snapshot.evidence_refs.find(pin => pin.role === 'instruction'), undefined],
    ...snapshot.event_refs.flatMap(event => event.evidence_refs.map(pin => [pin, event.observation_id]))]) {
    const query = new URLSearchParams({ role: pin.role }); if (observationId) query.set('observation_id', observationId);
    const evidence = await http(`${route}/evidence?${query}`, { cookie: alpha });
    assert.equal(evidence.status, 200);
    assert.equal(`sha256:${createHash('sha256').update(evidence.bytes).digest('hex')}`, pin.sha256);
    assert.equal(evidence.bytes.length, pin.size);
    assert.equal((await http(`${route}/evidence?${query}`, { cookie: beta })).status, 403);
  }
  for (const path of [route, '/api/workbench/requests', '/api/workbench/requests/w_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/execution',
    '/api/workbench/requests/w_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/revision']) {
    assert.equal((await http(path, { cookie: alpha, method: 'POST', body: {} })).status, 405, path);
  }
  assert.deepEqual(await readFile(f.binding.control_db_path), dbBefore, 'Read-only HTTP must not mutate the producer database');
});

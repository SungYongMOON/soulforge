import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkbenchHttpController } from '../src/workbench_http.mjs';
import { Readable } from 'node:stream';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWorkbenchFixture } from './helpers/workbench_fixture.mjs';
import { createWorkbenchCurrentSources, requesterForAccount } from '../src/workbench_current_sources.mjs';
import { openStore } from '../src/store.mjs';

const origin = 'http://127.0.0.1:18763';
function request(path = '/api/workbench/catalogue', body, overrides = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(req, { url: path, method: body === undefined ? 'GET' : 'POST', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:18763', origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' } }, overrides);
}
async function call(controller, req) {
  const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = JSON.parse(body); } };
  const handled = await controller(req, res, new URL(req.url, origin));
  return { ...res, handled };
}
async function context(t, options = {}) {
  const fixture = await makeWorkbenchFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const state = { account: 'account.a', session: 'synthetic-session-a', access: true };
  const controller = createWorkbenchHttpController({ enabled: true, allowedOrigin: origin, intakeRoot: fixture.intakeRoot,
    sources: createWorkbenchCurrentSources({ root: fixture.sourceRoot, expectedBinding: fixture.expectedBinding }),
    currentAccount: async () => state.account ? { id: state.account } : null, sessionKey: async () => state.session,
    accountIds: async () => ['account.a', 'account.b'], canAccessProject: async () => state.access, ...options });
  return { ...fixture, state, controller };
}

test('Workbench controller requires server-owned authentication dependencies', () => {
  assert.throws(() => createWorkbenchHttpController({ enabled: true }));
});

test('default-off POST cannot authenticate, read source metadata or write records', async t => {
  const fixture = await context(t, { enabled: false });
  assert.equal((await call(fixture.controller, request('/api/workbench/requests', fixture.request))).statusCode, 405);
  assert.deepEqual(await readdir(fixture.intakeRoot), []);
  const unconfigured = await context(t, { enabled: false, sources: null, intakeRoot: undefined });
  const disabled = await call(unconfigured.controller, request());
  assert.equal(disabled.statusCode, 200);
  assert.equal(disabled.body.hold_code, 'INTAKE_DISABLED');
});

test('same-origin catalogue → POST → GET preserves replay and session ownership', async t => {
  const fixture = await context(t);
  const catalogue = await call(fixture.controller, request());
  assert.equal(catalogue.statusCode, 200);
  assert.equal(catalogue.body.entries.length, 1);
  const selected = catalogue.body.entries[0].request;
  assert.match(selected.requester, /^member\.[a-f0-9]{16}$/u);
  const post = () => { const req = request('/api/workbench/requests', selected); req.headers['x-csrf-token'] = catalogue.body.csrf_token; return req; };
  const first = await call(fixture.controller, post());
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.execution_started, false);
  assert.equal((await call(fixture.controller, post())).body.replayed, true);
  const get = request(`/api/workbench/requests/${first.body.request_id}`);
  delete get.headers.origin;
  assert.equal((await call(fixture.controller, get)).statusCode, 200);
  fixture.state.account = 'account.b'; fixture.state.session = 'synthetic-session-b';
  assert.equal((await call(fixture.controller, request(`/api/workbench/requests/${first.body.request_id}`))).statusCode, 404);
  assert.equal((await call(fixture.controller, post())).statusCode, 403);
  fixture.state.account = null;
  assert.equal((await call(fixture.controller, request())).statusCode, 403);
});

test('foreign Origin, Host, fetch metadata and missing or rotated-session CSRF reject', async t => {
  const fixture = await context(t);
  const catalogue = (await call(fixture.controller, request())).body;
  for (const headers of [{ host: 'evil.invalid' }, { origin: 'http://evil.invalid' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': undefined }]) {
    const req = request(); Object.assign(req.headers, headers);
    assert.equal((await call(fixture.controller, req)).statusCode, 403);
  }
  const selected = catalogue.entries[0].request;
  assert.equal((await call(fixture.controller, request('/api/workbench/requests', selected))).statusCode, 403);
  const req = request('/api/workbench/requests', selected); req.headers['x-csrf-token'] = catalogue.csrf_token;
  fixture.state.session = 'synthetic-rotated-session';
  assert.equal((await call(fixture.controller, req)).statusCode, 403);
  assert.deepEqual(await readdir(fixture.intakeRoot), []);
});

test('current project revocation and altered sources reject an already selected request', async t => {
  const fixture = await context(t);
  const catalogue = (await call(fixture.controller, request())).body;
  const post = () => { const req = request('/api/workbench/requests', catalogue.entries[0].request); req.headers['x-csrf-token'] = catalogue.csrf_token; return req; };
  fixture.state.access = false;
  assert.equal((await call(fixture.controller, post())).statusCode, 503);
  fixture.state.access = true;
  await writeFile(join(fixture.sourceRoot, 'recipe.json'), 'corrupted synthetic source');
  assert.equal((await call(fixture.controller, post())).statusCode, 503);
  assert.deepEqual(await readdir(fixture.intakeRoot), []);
});

test('ambiguous account identity and unprepared intake roots never produce usable catalogues', async t => {
  const collision = await context(t, { accountIds: async () => ['account.a', 'account.a'] });
  assert.equal((await call(collision.controller, request())).statusCode, 403);
  const fixture = await context(t);
  await rm(fixture.intakeRoot, { recursive: true });
  const result = await call(fixture.controller, request());
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.hold_code, 'INTAKE_STORE_UNAVAILABLE');
});

test('same key with changed instructions conflicts and a proper parent revision preserves lineage through HTTP', async t => {
  const fixture = await context(t);
  const catalogue = (await call(fixture.controller, request())).body;
  const selected = catalogue.entries[0].request;
  const post = body => { const req = request('/api/workbench/requests', body); req.headers['x-csrf-token'] = catalogue.csrf_token; return req; };
  const first = await call(fixture.controller, post(selected));
  assert.equal(first.statusCode, 201);
  assert.equal((await call(fixture.controller, post({ ...selected, directives: ['SHORTEN'] }))).statusCode, 409);
  const revision = { ...selected, idempotency_key: `${selected.idempotency_key}.r2`, directives: ['SHORTEN'], revision_of: first.body.request_id, revision_no: 2 };
  assert.equal((await call(fixture.controller, post(revision))).statusCode, 201);
  assert.equal((await call(fixture.controller, post(revision))).body.replayed, true);
  const foreign = { ...revision, idempotency_key: `${selected.idempotency_key}.bad`, revision_of: `w_${'f'.repeat(32)}` };
  assert.equal((await call(fixture.controller, post(foreign))).statusCode, 409);
});

test('execution status and candidate responses recheck session and project access after service IO', async t => {
  for (const operation of ['execution', 'candidate']) for (const boundary of ['session', 'project']) {
    let fixture;
    const finish = async (_requestId, access) => {
      assert.equal(await access.canAccessProject('SYN-001'), true);
      if (boundary === 'session') fixture.state.account = null;
      else fixture.state.access = false;
      return operation === 'candidate' ? { bytes: Buffer.from('synthetic result') }
        : { status: 'EXECUTION_RECORDED', run_id: 'synthetic.run' };
    };
    fixture = await context(t, { executionService: { enabled: true, status: finish, candidate: finish } });
    const result = await call(fixture.controller, request(`/api/workbench/requests/w_${'a'.repeat(32)}/${operation}`));
    assert.equal(result.statusCode, boundary === 'session' ? 403 : 404);
    assert.equal(result.body.run_id, undefined);
  }
});

async function ephemeralPort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

test('actual dev-erp server: two real synthetic sessions, catalogue, replay, ACL change, logout and source corruption', { timeout: 30000 }, async t => {
  const fixture = await makeWorkbenchFixture();
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await rm(fixture.root, { recursive: true, force: true });
  });
  fixture.authority.grants.push({ ...fixture.authority.grants[0], requester: requesterForAccount(fixture.expectedBinding.realm_id, 'account.b') });
  await fixture.repin();
  const dbPath = join(fixture.root, 'synthetic.db');
  const seed = openStore(dbPath);
  assert.equal(seed.createAccount({ id: 'account.a', username: 'alpha', password: 'synthetic-pass-a', roles: ['admin'] }).ok, true);
  assert.equal(seed.createAccount({ id: 'account.b', username: 'beta', password: 'synthetic-pass-b', roles: ['member'] }).ok, true);
  seed.upsertProject({ id: fixture.scope.project_code, title: '합성 업무 과제', health: 'ok', data_label: 'synthetic' });
  const item = seed.createItem({ project_id: fixture.scope.project_code, title: '합성 할 일', assignee_ref: 'beta', created_by: 'synthetic' });
  seed.db.close();
  const port = await ephemeralPort();
  assert.ok(![4300, 4192].includes(port));
  const base = `http://127.0.0.1:${port}`;
  const appRoot = fileURLToPath(new URL('..', import.meta.url));
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP, TMP: process.env.TMP, DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1',
    DEV_ERP_BACKEND_ROOT: fixture.root, DEV_ERP_WORKBENCH_INTAKE: '1', DEV_ERP_WORKBENCH_INTAKE_ROOT: fixture.intakeRoot,
    DEV_ERP_WORKBENCH_SOURCE_ROOT: fixture.sourceRoot, DEV_ERP_WORKBENCH_BINDING_ID: fixture.expectedBinding.binding_id,
    DEV_ERP_WORKBENCH_REALM_ID: fixture.expectedBinding.realm_id, DEV_ERP_WORKBENCH_BINDING_SHA256: fixture.expectedBinding.content_sha256 };
  child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath, '--no-fixture', '--no-real-meta', '--no-tls',
    '--knowledge_shell_root', fixture.root, '--knowledge_dir', fixture.root], { cwd: appRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const started = Date.now();
  while (true) {
    if (child.exitCode !== null) assert.fail(`Synthetic server exited before ready: ${output}`);
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Starting bounded synthetic server. */ }
    if (Date.now() - started > 10000) assert.fail(`Synthetic server startup timeout: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  async function http(path, { method = 'GET', cookie, body, csrf, headers = {} } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'sec-fetch-site': 'same-origin', ...headers,
      ...(cookie ? { cookie } : {}), ...(body ? { origin: base, 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], body: await response.json() };
  }
  assert.equal((await http('/api/workbench/catalogue')).status, 401);
  const alpha = await http('/api/auth/login', { method: 'POST', body: { username: 'alpha', password: 'synthetic-pass-a' } });
  const beta = await http('/api/auth/login', { method: 'POST', body: { username: 'beta', password: 'synthetic-pass-b' } });
  assert.equal(alpha.status, 200); assert.equal(beta.status, 200);
  const a = await http('/api/workbench/catalogue', { cookie: alpha.cookie });
  const b = await http('/api/workbench/catalogue', { cookie: beta.cookie });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.body.entries.length, 1); assert.equal(b.body.entries.length, 1);
  assert.notEqual(a.body.entries[0].request.requester, b.body.entries[0].request.requester);
  const selectedA = a.body.entries[0].request;
  assert.notEqual(selectedA.requester, 'owner.local');
  const recorded = await http('/api/workbench/requests', { method: 'POST', cookie: alpha.cookie, csrf: a.body.csrf_token, body: selectedA });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.body.mapping_status, 'MAPPED');
  assert.equal(recorded.body.execution_started, false);
  assert.equal((await http('/api/workbench/requests', { method: 'POST', cookie: alpha.cookie, csrf: a.body.csrf_token, body: selectedA })).body.replayed, true);
  const idPath = `/api/workbench/requests/${recorded.body.request_id}`;
  assert.equal((await http(idPath, { cookie: alpha.cookie })).status, 200);
  assert.equal((await http(idPath, { cookie: beta.cookie })).status, 404);
  const selectedB = b.body.entries[0].request;
  const recordedB = await http('/api/workbench/requests', { method: 'POST', cookie: beta.cookie, csrf: b.body.csrf_token, body: selectedB });
  assert.equal(recordedB.status, 201);
  const changing = openStore(dbPath);
  changing.db.prepare('UPDATE core_item SET assignee_ref=? WHERE project_id=?').run('alpha', fixture.scope.project_code);
  changing.db.close();
  assert.equal((await http('/api/workbench/catalogue', { cookie: beta.cookie })).body.entries.length, 0);
  assert.ok([404, 503].includes((await http(`/api/workbench/requests/${recordedB.body.request_id}`, { cookie: beta.cookie })).status));
  await http('/api/auth/logout', { method: 'POST', cookie: alpha.cookie, body: {} });
  assert.equal((await http(idPath, { cookie: alpha.cookie })).status, 401);
  const nextAlpha = await http('/api/auth/login', { method: 'POST', body: { username: 'alpha', password: 'synthetic-pass-a' } });
  assert.equal((await http('/api/workbench/requests', { method: 'POST', cookie: nextAlpha.cookie, csrf: a.body.csrf_token, body: selectedA })).status, 403);
  await writeFile(join(fixture.sourceRoot, 'blueprint.json'), 'corrupt synthetic blueprint');
  assert.equal((await http(idPath, { cookie: nextAlpha.cookie })).status, 503);
  const page = await fetch(`${base}/workbench.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /요청 접수/u);
  assert.equal((await readdir(fixture.intakeRoot)).filter(name => name.endsWith('.json')).length, 2);
  assert.equal(output.includes('autosync ON'), false);
  assert.equal(output.includes('아침 브리핑 push ON'), false);
});

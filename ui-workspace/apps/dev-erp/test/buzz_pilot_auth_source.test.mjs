import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { openBuzzPilotAuthSource } from '../src/buzz_pilot_auth_source.mjs';
import { createBuzzPilotWorkbenchHttpController } from '../src/buzz_pilot_workbench_http.mjs';
import { makeBuzzPilotAuthHttpFixture } from './helpers/buzz_pilot_auth_http_fixture.mjs';

const time = Date.parse('2026-09-08T00:00:00.000Z');
const req = () => ({ headers: { cookie: 'other=synthetic; dev_erp_sid_47820=synthetic-session-only' } });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sf-buzz-auth-'));
  const dbPath = join(root, 'synthetic-source.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE auth_session(token TEXT PRIMARY KEY,account_id TEXT,created_at TEXT,expires_at TEXT);
    CREATE TABLE core_account(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE rbac_account_role(account_id TEXT,role_id TEXT);
    CREATE TABLE core_project(id TEXT PRIMARY KEY);
    INSERT INTO core_account VALUES ('owner.synthetic','active');
    INSERT INTO rbac_account_role VALUES ('owner.synthetic','admin');
    INSERT INTO core_project VALUES ('SYN-001');`);
  db.prepare('INSERT INTO auth_session VALUES (?,?,?,?)').run('synthetic-session-only', 'owner.synthetic',
    new Date(time - 1000).toISOString(), new Date(time + 60000).toISOString());
  const options = { dbPath, sourcePort: 47820, expectedOwnerId: 'owner.synthetic', projectId: 'SYN-001', now: () => time };
  const source = openBuzzPilotAuthSource(options);
  t.after(async () => { source.close(); db.close(); const resolved = await realpath(root);
    const within = relative(await realpath(tmpdir()), resolved); assert.ok(within && !within.startsWith('..') && !isAbsolute(within));
    await rm(resolved, { recursive: true, force: true }); });
  return { db, source, options, dbPath, root };
}

test('source requires the exact Owner, active admin and existing bound project without exposing the cookie', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.source.currentAccount(req()), { id: 'owner.synthetic' });
  assert.equal(f.source.canAccessProject(req(), 'SYN-001'), true);
  assert.equal(f.source.canAccessProject(req(), 'other.project'), false);
  assert.equal(f.source.sessionKey(req()).includes('synthetic-session-only'), false);
  f.db.exec("INSERT INTO core_account VALUES ('other.active.owner','active'); INSERT INTO rbac_account_role VALUES ('other.active.owner','admin')");
  f.db.prepare('INSERT INTO auth_session SELECT ?,?,created_at,expires_at FROM auth_session')
    .run('other-active-synthetic-session', 'other.active.owner');
  assert.equal(f.source.currentAccount({ headers: { cookie: 'dev_erp_sid_47820=other-active-synthetic-session' } }), null);
  f.db.prepare('DELETE FROM auth_session WHERE account_id=?').run('other.active.owner');
  for (const change of ["UPDATE core_account SET status='inactive'", "DELETE FROM rbac_account_role",
    "DELETE FROM core_project", "UPDATE auth_session SET account_id='another.owner'"]) {
    f.db.exec('SAVEPOINT scenario'); f.db.exec(change);
    // Commit the writer change so the independent read-only connection observes it.
    f.db.exec('RELEASE scenario');
    assert.equal(f.source.currentAccount(req()), null, change);
    f.db.exec(`DELETE FROM core_account; INSERT INTO core_account VALUES ('owner.synthetic','active');
      DELETE FROM rbac_account_role; INSERT INTO rbac_account_role VALUES ('owner.synthetic','admin');
      DELETE FROM core_project; INSERT INTO core_project VALUES ('SYN-001');
      UPDATE auth_session SET account_id='owner.synthetic'`);
  }
});

test('source rejects expired, nonfinite or noncanonical expiry and revoked sessions without deleting rows', async t => {
  const f = await fixture(t);
  for (const expiry of [new Date(time).toISOString(), new Date(time - 1).toISOString(), 'not-a-date', 'Infinity', '2026-09-08']) {
    f.db.prepare('UPDATE auth_session SET expires_at=?').run(expiry);
    assert.equal(f.source.currentAccount(req()), null);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM auth_session').get().n, 1);
  }
  f.db.exec('DELETE FROM auth_session'); assert.equal(f.source.currentAccount(req()), null);
});

test('source accepts only the configured port cookie and never creates or falls back from a broken database', async t => {
  const f = await fixture(t);
  for (const cookie of ['dev_erp_sid_47821=synthetic-session-only', 'dev_erp_sid_47820=%broken',
    'dev_erp_sid_47820=synthetic-session-only; dev_erp_sid_47820=synthetic-session-only']) assert.equal(f.source.currentAccount({ headers: { cookie } }), null);
  assert.throws(() => openBuzzPilotAuthSource({ ...f.options, dbPath: join(f.root, 'absent.sqlite') }), { code: 'BUZZ_PILOT_AUTH_SOURCE_UNAVAILABLE' });
  await assert.rejects(readFile(join(f.root, 'absent.sqlite')), { code: 'ENOENT' });
  f.db.exec('DROP TABLE rbac_account_role');
  assert.throws(() => f.source.currentAccount(req()), { code: 'BUZZ_PILOT_AUTH_SOURCE_UNAVAILABLE' });
});

test('source SELECTs leave the source database bytes unchanged', async t => {
  const f = await fixture(t), before = await readFile(f.dbPath);
  for (let n = 0; n < 4; n++) { f.source.currentAccount(req()); f.source.sessionKey(req()); f.source.canAccessProject(req(), 'SYN-001'); }
  assert.deepEqual(await readFile(f.dbPath), before);
});

test('different sessions remain distinct even with identical account and creation/expiry metadata', async t => {
  const f = await fixture(t);
  f.db.prepare('INSERT INTO auth_session SELECT ?,account_id,created_at,expires_at FROM auth_session')
    .run('different-synthetic-session');
  const other = { headers: { cookie: 'dev_erp_sid_47820=different-synthetic-session' } };
  assert.deepEqual(f.source.currentAccount(other), f.source.currentAccount(req()));
  assert.notEqual(f.source.sessionKey(other), f.source.sessionKey(req()));
});

test('current source revocation during protected evidence IO is checked before HTTP returns bytes', async t => {
  for (const revoke of ["DELETE FROM auth_session", "DELETE FROM rbac_account_role", "DELETE FROM core_project"]) {
    const f = await fixture(t);
    const service = { readEvidence: async (_query, access) => {
      assert.equal(access.accountId, 'owner.synthetic'); assert.equal(await access.checkSession(), true);
      assert.equal(await access.canAccessProject('SYN-001'), true); f.db.exec(revoke);
      return { bytes: Buffer.from('synthetic protected bytes'), size: 25, mediaType: 'text/plain' };
    } };
    const controller = createBuzzPilotWorkbenchHttpController({ service, allowedOrigin: 'http://127.0.0.1:47821', ...f.source });
    const request = { method: 'GET', url: '/api/workbench/buzz-pilot/evidence?role=instruction', socket: { remoteAddress: '127.0.0.1' },
      headers: { ...req().headers, host: '127.0.0.1:47821', 'sec-fetch-site': 'same-origin' } };
    const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    await controller(request, response, new URL(request.url, 'http://127.0.0.1:47821'));
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.includes('synthetic protected bytes'), false);
  }
});

test('actual source login cookie authorizes only exact Buzz GETs on a separate candidate with no local session', { timeout: 20000 }, async t => {
  const f = await makeBuzzPilotAuthHttpFixture(); t.after(f.close);
  async function http(origin, path, { cookie, method = 'GET', body, site = 'same-origin' } = {}) {
    const response = await fetch(`${origin}${path}`, { method, headers: { 'sec-fetch-site': site, ...(cookie ? { cookie } : {}),
      ...(body ? { origin, 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, headers: response.headers, text: await response.text() };
  }
  const login = await http(f.sourceServer.origin, '/api/auth/login', { method: 'POST',
    body: { username: 'source-owner', password: 'synthetic-source-only' } });
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith(`dev_erp_sid_${f.sourceServer.port}=`));
  const before = await readFile(f.sourceDb), target = f.candidateServer.origin;
  assert.equal((await http(target, '/api/workbench/buzz-pilot')).status, 401);
  const view = await http(target, '/api/workbench/buzz-pilot', { cookie });
  assert.equal(view.status, 200, view.text); assert.equal(JSON.parse(view.text).state, 'waiting_owner');
  const evidence = await http(target, '/api/workbench/buzz-pilot/evidence?role=instruction', { cookie });
  assert.equal(evidence.status, 200); assert.equal(evidence.text, f.instruction.toString());
  assert.equal(view.headers.get('set-cookie'), null);
  for (const path of ['/api/workbench/catalogue', '/api/workbench/buzz-pilot/other', '/api/projects']) {
    assert.equal((await http(target, path, { cookie })).status, 401, path);
  }
  for (const path of ['/api/workbench/buzz-pilot', '/api/workbench/requests', '/api/projects']) {
    assert.equal((await http(target, path, { cookie, method: 'POST', body: {} })).status, 401, path);
  }
  assert.equal((await http(target, '/api/workbench/buzz-pilot', { cookie, site: 'cross-site' })).status, 403);
  assert.deepEqual(await readFile(f.sourceDb), before);
  const inspection = new DatabaseSync(f.candidateDb, { readOnly: true });
  assert.equal(inspection.prepare('SELECT COUNT(*) AS n FROM auth_session').get().n, 0);
  assert.equal(inspection.prepare('SELECT COUNT(*) AS n FROM core_account').get().n, 1); inspection.close();
});

test('configured broken source does not fall back to an authenticated local candidate account', { timeout: 20000 }, async t => {
  const f = await makeBuzzPilotAuthHttpFixture({ brokenSource: true }); t.after(f.close);
  const login = await fetch(`${f.candidateServer.origin}/api/auth/login`, { method: 'POST',
    headers: { origin: f.candidateServer.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'candidate-local', password: 'synthetic-candidate-only' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const result = await fetch(`${f.candidateServer.origin}/api/workbench/buzz-pilot`, { headers: { cookie, 'sec-fetch-site': 'same-origin' } });
  assert.equal(result.status, 503); assert.equal((await result.json()).hold_code, 'BUZZ_PILOT_AUTH_SOURCE_UNAVAILABLE');
  await assert.rejects(readFile(join(f.root, 'missing.sqlite')), { code: 'ENOENT' });
});

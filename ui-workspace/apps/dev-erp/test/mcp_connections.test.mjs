import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.mjs';
import { createErpMcpService } from '../src/erp_mcp_service.mjs';
import { getLexicon } from '../src/lexicon.mjs';

const app = readFileSync(new URL('../static/app.js', import.meta.url), 'utf8');
const uiSource = app.slice(app.indexOf('async function loadMyConnections'), app.indexOf('// 로그인 모달'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function ui(request, accountId = 'account.synthetic.a') {
  const state = { account: { id: accountId } };
  const helpers = Function('state', 'request', 'esc', `${uiSource}\nreturn { loadMyConnections, revokeMyConnection, myConnectionsHtml, myConnectionTime, myConnectionConfirmationHtml };`)(state, request, escape);
  return { ...helpers, state };
}
const response = (status, body = {}) => ({ status, ok: status === 200, json: async () => body });
const snapshot = (delta = {}) => ({ account_id: 'account.synthetic.a', observed_at: new Date().toISOString(),
  csrf_token: 'a'.repeat(64), access_scope: 'account_current_permissions', project_binding: 'not_token_scoped',
  tokens: [{ token_id: `mcp_tok_${'1'.repeat(16)}`, label: '<script>synthetic</script>', created_at: '2026-09-01T00:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z', last_used_at: null, revoked: false, state: 'active' }], ...delta });

async function fixture(t, enabled = true) {
  const root = await mkdtemp(join(tmpdir(), 'mcp-connections-synthetic-'));
  const dbPath = join(root, 'erp.sqlite'), store = openStore(dbPath);
  const actors = {};
  if (enabled) createErpMcpService({ store, artifactRoot: join(root, 'artifacts') });
  for (const [index, name] of ['a', 'b'].entries()) {
    const id = `account.synthetic.${name}`;
    store.createAccount({ id, username: `synthetic-${name}`, password: 'synthetic-password-only', roles: ['member'] });
    const session = store.createSession(id);
    // Fixed public synthetic bytes only, never an issued real bearer.
    const bearer = `sfmcp_v1_${name.repeat(43)}`, tokenId = `mcp_tok_${String(index + 1).repeat(16)}`;
    if (enabled) store.db.prepare(`INSERT INTO erp_mcp_access_token(id,account_id,token_hash,label,created_at,expires_at)
      VALUES(?,?,?,?,?,?)`).run(tokenId, id, createHash('sha256').update(bearer).digest('hex'), `합성 연결 ${name}`,
        new Date().toISOString(), '2099-01-01T00:00:00.000Z');
    actors[name] = { id, session, bearer, tokenId };
  }
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  assert.ok(![4300, 4192].includes(port));
  const origin = `http://127.0.0.1:${port}`;
  for (const actor of Object.values(actors)) actor.cookie = `dev_erp_sid_${port}=${actor.session}`;
  const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath,
    '--no-fixture', '--no-real-meta', '--no-tls', '--knowledge_shell_root', root, '--knowledge_dir', root], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP, TMP: process.env.TMP, DEV_ERP_BACKEND_ROOT: root,
      DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_AUTOSYNC: '0',
      DEV_ERP_MCP_ENABLED: enabled ? '1' : '0', DEV_ERP_MCP_ARTIFACT_ROOT: join(root, 'artifacts') } });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    store.db.close();
    const target = await realpath(root), within = relative(await realpath(tmpdir()), target);
    assert.ok(within && !within.startsWith('..') && !isAbsolute(within)); await rm(target, { recursive: true, force: true });
  });
  const until = Date.now() + 10000;
  for (;;) {
    if (child.exitCode !== null) throw new Error('synthetic_server_exited');
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch {}
    if (Date.now() > until) throw new Error('synthetic_server_timeout');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const call = (actor, route, options = {}) => fetch(origin + route, { ...options,
    headers: { cookie: actor?.cookie ?? '', 'sec-fetch-site': 'same-origin', ...options.headers } });
  const list = actor => call(actor, '/api/integrations/mcp/tokens');
  const revoke = (actor, csrf, tokenId, headers = {}) => call(actor, '/api/integrations/mcp/tokens/revoke', {
    method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-csrf-token': csrf, ...headers },
    body: JSON.stringify({ token_id: tokenId }) });
  return { ...actors, store, origin, call, list, revoke };
}

test('two accounts see only their own metadata; selected revoke denies the existing MCP API and is read back', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  const a = await (await f.list(f.a)).json(), b = await (await f.list(f.b)).json();
  assert.deepEqual(a.tokens.map(row => row.token_id), [f.a.tokenId]);
  assert.deepEqual(b.tokens.map(row => row.token_id), [f.b.tokenId]);
  assert.equal(a.access_scope, 'account_current_permissions'); assert.equal(a.project_binding, 'not_token_scoped');
  assert.equal(JSON.stringify(a).includes(f.a.bearer), false); assert.equal(JSON.stringify(a).includes('token_hash'), false);
  assert.equal((await f.list(null)).status, 401);
  assert.equal((await f.call(f.a, '/api/integrations/mcp/tokens?account_id=' + f.b.id)).status, 400);
  assert.equal((await f.revoke(f.a, a.csrf_token, f.b.tokenId)).status, 404);
  for (const [csrf, headers] of [['', {}], [b.csrf_token, {}], [a.csrf_token, { origin: 'https://foreign.invalid' }],
    [a.csrf_token, { origin: f.origin.replace('http:', 'https:') }],
    [a.csrf_token, { 'sec-fetch-site': 'cross-site' }]]) assert.equal((await f.revoke(f.a, csrf, f.a.tokenId, headers)).status, 403);
  const use = actor => fetch(`${f.origin}/api/mcp/whoami`, { headers: { authorization: `Bearer ${actor.bearer}` } });
  assert.equal((await use(f.a)).status, 200);
  const harness = ui((route, options = {}) => f.call(f.a, route, { ...options,
    headers: { origin: f.origin, ...options.headers } }));
  const loaded = await harness.loadMyConnections(f.a.id);
  const result = await harness.revokeMyConnection(f.a.id, loaded.snapshot, loaded.snapshot.tokens[0]);
  assert.equal(result.state, 'ready'); assert.equal(result.verified, true);
  assert.equal(result.snapshot.tokens[0].state, 'revoked');
  assert.equal((await use(f.a)).status, 401); assert.equal((await use(f.b)).status, 200);
  assert.equal((await f.revoke(f.a, a.csrf_token, f.a.tokenId)).status, 404);
  assert.equal((await (await f.list(f.a)).json()).tokens[0].revoked, true);
});

test('OFF is distinct from empty and preserves the disabled database', { timeout: 20000 }, async t => {
  const f = await fixture(t, false);
  const harness = ui((route, options) => f.call(f.a, route, options));
  assert.equal((await harness.loadMyConnections(f.a.id)).state, 'off');
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='erp_mcp_access_token'").get().n, 0);
});

test('session revoked during request-body upload cannot revoke a connection', { timeout: 20000 }, async t => {
  const f = await fixture(t), listed = await (await f.list(f.a)).json();
  const bytes = Buffer.from(JSON.stringify({ token_id: f.a.tokenId }));
  const status = await new Promise((resolve, reject) => {
    const req = httpRequest(`${f.origin}/api/integrations/mcp/tokens/revoke`, { method: 'POST', headers: {
      cookie: f.a.cookie, origin: f.origin, 'content-type': 'application/json', 'content-length': bytes.length,
      'x-csrf-token': listed.csrf_token } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write(bytes.subarray(0, 8));
    setTimeout(() => { f.store.db.prepare('DELETE FROM auth_session WHERE account_id=?').run(f.a.id);
      req.end(bytes.subarray(8)); }, 50);
  });
  assert.equal(status, 401);
  assert.equal(f.store.db.prepare('SELECT revoked_at FROM erp_mcp_access_token WHERE id=?').get(f.a.tokenId).revoked_at, null);
});

test('UI distinguishes empty/OFF/access/failure, escapes labels and never exposes issuing or cached success', async () => {
  const L = getLexicon('business');
  for (const [status, state] of [[401, 'login'], [403, 'denied'], [404, 'off'], [503, 'load_failed']]) {
    const h = ui(async () => response(status)), result = await h.loadMyConnections('account.synthetic.a');
    assert.equal(result.state, state); assert.ok(h.myConnectionsHtml(result, L).includes(escape(L[`mcp_connections_${state}`])));
  }
  const h = ui(async () => response(200, snapshot()));
  const loaded = await h.loadMyConnections('account.synthetic.a'), html = h.myConnectionsHtml(loaded, L);
  assert.ok(html.includes('&lt;script&gt;')); assert.equal(html.includes('<script>'), false);
  assert.ok(h.myConnectionsHtml({ state: 'ready', snapshot: snapshot({ tokens: [] }) }, L).includes(L.mcp_connections_empty));
  assert.ok(app.includes('connectionsBtn.addEventListener("click", openMyConnections)'));
  assert.equal(uiSource.includes('expires_in_days'), false); assert.equal(uiSource.includes('localStorage'), false);
  assert.ok(uiSource.includes('L.mcp_connections_effect')); assert.ok(getLexicon('fantasy').mcp_connections_effect);
});

test('inline confirmation escapes the selected identity, starts on cancel and displays Korean-time dates', () => {
  const h = ui(async () => { throw new Error('pure UI must not request'); }), L = getLexicon();
  const selected = snapshot().tokens[0], html = h.myConnectionConfirmationHtml(selected, L);
  assert.ok(html.includes('&lt;script&gt;synthetic&lt;/script&gt;')); assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes(selected.token_id)); assert.ok(html.includes(L.mcp_connections_effect));
  assert.ok(html.includes(`data-connection-cancel>${L.btn_cancel}`)); assert.ok(html.includes('data-connection-confirm'));
  assert.equal(uiSource.includes('window.confirm'), false);
  assert.match(uiSource, /cancel\.focus\(\)/u);
  assert.match(uiSource, /if \(confirmation\) cancelConfirmation\(\); else close\(\)/u);
  assert.match(uiSource, /refresh\.disabled = false; refresh\.focus\(\)/u);
  const date = h.myConnectionTime('2026-09-09T16:00:00.000Z', L);
  assert.match(date, /2026년 9월 10일/u); assert.match(date, /01(?:시|:)/u);
  assert.match(date, /한국 표준시/u);
  assert.equal(h.myConnectionTime('invalid', L), L.mcp_connections_unknown);
  assert.equal(h.myConnectionTime(null, L), L.mcp_connections_unknown);
});

test('changed login/selection and uncertain POST or readback never produce verified success or retry', async () => {
  const original = snapshot(), changed = snapshot({ csrf_token: 'b'.repeat(64) });
  let calls = 0;
  const h = ui(async () => { calls++; return response(200, changed); });
  assert.equal((await h.revokeMyConnection(original.account_id, original, original.tokens[0])).state, 'changed'); assert.equal(calls, 1);
  for (const responses of [[response(200, original), response(500)], [response(200, original), response(200), response(200, original)],
    [response(200, original), response(200), response(503)]]) {
    let count = 0; const client = ui(async () => responses[count++]);
    const result = await client.revokeMyConnection(original.account_id, original, original.tokens[0]);
    assert.notEqual(result.verified, true); assert.equal(count, responses.length);
    assert.ok(client.myConnectionsHtml(result, getLexicon()).includes('확인') || result.state === 'load_failed');
  }
  const foreign = ui(async () => response(200, snapshot({ account_id: 'account.synthetic.b' })));
  assert.equal((await foreign.loadMyConnections(original.account_id)).state, 'login');
});

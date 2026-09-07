import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { fixture, correctedFixture, sourceMetadata } from './helpers/accepted_context_read_fixture.mjs';
import { ref } from './helpers/accepted_context_fixture.mjs';
import { makeUniformNotAvailable } from '../src/accepted_context_query.mjs';
import { createSyntheticAcceptedContextRuntime } from '../src/accepted_context_synthetic_runtime.mjs';
import { createAcceptedContextHttpController } from '../src/accepted_context_http.mjs';
import { openStore } from '../src/store.mjs';

async function material(t) {
  const x = fixture();
  const root = await mkdtemp(join(tmpdir(), 'accepted-context-synthetic-'));
  const cleanup = { child: null };
  t.after(async () => {
    if (cleanup.child && cleanup.child.exitCode === null && cleanup.child.signalCode === null) {
      cleanup.child.kill(); await once(cleanup.child, 'exit');
    }
    await rm(root, { recursive: true, force: true });
  });
  const binding = { mode: 'synthetic_only', ...x.binding, project_label: '합성 검증 과제',
    actor_bindings: [{ account_id: 'account.alpha', actor_ref: 'actor:alpha' }], page_size: 2 };
  const bytes = JSON.stringify(binding);
  const bindingSha256 = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const put = (name, value) => writeFile(join(root, name), JSON.stringify(value));
  await writeFile(join(root, 'binding.json'), bytes);
  const acl = () => ({ actors: [...x.state.acl.actors].map(([actor_ref, grant]) => ({ actor_ref,
    grant: { ...grant, allowed_projects: [...grant.allowed_projects], allowed_scopes: [...grant.allowed_scopes], allowed_purposes: [...grant.allowed_purposes] } })),
    revoked_actors: [...x.state.acl.revoked_actors], revoked_generations: [...x.state.acl.revoked_generations] });
  async function publishAccepted() {
    const pointer = x.store.getCurrentPointer();
    await put('accepted-generation.json', { manifest: x.store.getGeneration(pointer.generation_ref), receipt: x.store.getReceipt(pointer.generation_ref) });
    await put('pointer.json', pointer);
  }
  await publishAccepted();
  await put('source-revisions.json', x.state.source); await put('acl.json', acl());
  return { ...x, root, bindingSha256, put, acl, publishAccepted, cleanup };
}

async function startServer(t, x, enabled) {
  const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
  const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
  assert.ok(![4300, 4192].includes(port));
  const dbPath = join(x.root, 'synthetic.db');
  const seed = openStore(dbPath);
  assert.equal(seed.createAccount({ id: 'account.alpha', username: 'alpha', password: 'synthetic-pass-a', roles: ['admin'] }).ok, true);
  assert.equal(seed.createAccount({ id: 'account.beta', username: 'beta', password: 'synthetic-pass-b', roles: ['admin'] }).ok, true);
  seed.db.close();
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP, TMP: process.env.TMP, DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: x.root };
  const args = ['server.mjs', '--port', String(port), '--db', dbPath, '--no-fixture', '--no-real-meta', '--no-tls',
    '--knowledge_shell_root', x.root, '--knowledge_dir', x.root];
  if (enabled) args.push('--accepted-context-synthetic', '--accepted-context-synthetic-root', x.root,
    '--accepted-context-synthetic-binding-sha256', x.bindingSha256);
  const child = spawn(process.execPath, args, { cwd: fileURLToPath(new URL('..', import.meta.url)), env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  x.cleanup.child = child;
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const base = `http://127.0.0.1:${port}`;
  for (const started = Date.now(); ;) {
    if (child.exitCode !== null) assert.fail(`Synthetic server startup failed: ${output}`);
    try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* bounded startup */ }
    if (Date.now() - started > 10000) assert.fail(`Synthetic server readiness timeout: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  async function http(path, { cookie, body, headers = {} } = {}) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { origin: base, 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0], body: await response.json() };
  }
  return { base, http, output: () => output };
}

test('synthetic binding is OFF without exact opt-in, temporary root and digest', async t => {
  const x = await material(t);
  assert.equal(createSyntheticAcceptedContextRuntime({ root: x.root, bindingSha256: x.bindingSha256 }), null);
  assert.equal(createSyntheticAcceptedContextRuntime({ syntheticOnly: true, root: x.root, bindingSha256: 'sha256:' + 'f'.repeat(64) }), null);
  const runtime = createSyntheticAcceptedContextRuntime({ syntheticOnly: true, root: x.root, bindingSha256: x.bindingSha256 });
  assert.ok(runtime);
  assert.equal((await runtime.catalogue({ id: 'account.alpha' })).status, 'ok');
  await x.put('binding.json', { mode: 'operational' });
  assert.deepEqual(await runtime.catalogue({ id: 'account.alpha' }), makeUniformNotAvailable());
});

test('HTTP checks session again after asynchronous catalogue/query work and never trusts actor input', async () => {
  const origin = 'http://127.0.0.1:18562'; let account = { id: 'account.alpha' };
  const runtime = { actorForAccount: value => value?.id ? 'actor:alpha' : null,
    catalogue: async () => { account = null; return { status: 'ok', entries: [{ project_label: 'protected' }] }; } };
  const controller = createAcceptedContextHttpController({ runtime, currentAccount: () => account, allowedOrigin: origin });
  const req = Object.assign(Readable.from([]), { method: 'GET', url: '/api/context/accepted/catalogue',
    headers: { host: '127.0.0.1:18562', 'sec-fetch-site': 'same-origin' }, socket: { remoteAddress: '127.0.0.1' } });
  const res = { setHeader() {}, end(bytes) { this.body = JSON.parse(bytes); } };
  assert.equal(await controller(req, res, new URL(req.url, origin)), true);
  assert.equal(res.statusCode, 404); assert.deepEqual(res.body, makeUniformNotAvailable());
});

test('actual ERP default-off server uses the same unavailable response before and after login', { timeout: 30000 }, async t => {
  const x = await material(t); const server = await startServer(t, x, false);
  const before = await server.http('/api/context/accepted/catalogue');
  const login = await server.http('/api/auth/login', { body: { username: 'alpha', password: 'synthetic-pass-a' } });
  assert.equal(login.status, 200);
  const after = await server.http('/api/context/accepted/catalogue', { cookie: login.cookie });
  assert.equal(before.status, 404); assert.equal(after.status, 404);
  assert.deepEqual(before.body, makeUniformNotAvailable()); assert.deepEqual(after.body, before.body);
});

test('actual ERP login→catalogue→G1 query→source correction denial→separate human-reviewed G2→readback', { timeout: 30000 }, async t => {
  const x = await material(t); const server = await startServer(t, x, true);
  const { http } = server;
  const unavailable = await http('/api/context/accepted/catalogue');
  assert.equal(unavailable.status, 404);
  const login = await http('/api/auth/login', { body: { username: 'alpha', password: 'synthetic-pass-a' } });
  const other = await http('/api/auth/login', { body: { username: 'beta', password: 'synthetic-pass-b' } });
  assert.equal(login.status, 200); assert.equal(other.status, 200);
  const cookie = login.cookie;
  const get = () => http('/api/context/accepted/catalogue', { cookie });
  const catalogue = await get(); assert.equal(catalogue.status, 200);
  assert.equal(catalogue.body.entries.length, 2);
  const entry = catalogue.body.entries.find(row => row.scope === 'project');
  const input = { selection_id: entry.selection_id, as_of: entry.as_of, cursor: null };
  const query = body => http('/api/context/accepted/query', { cookie, body });
  const first = await query(input); assert.equal(first.status, 200); assert.equal(first.body.page_hits, 2); assert.ok(first.body.cursor);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal((await query({ ...input, cursor: first.body.cursor })).body.status, 'ok');
  const common = catalogue.body.entries.find(row => row.scope === 'common');
  const commonResult = await query({ selection_id: common.selection_id, as_of: common.as_of, cursor: null });
  assert.ok(commonResult.body.hits.every(hit => hit.source_lane === 'common'));
  for (const response of [
    await http('/api/context/accepted/catalogue', { cookie: other.cookie }),
    await http('/api/context/accepted/query', { cookie, body: input, headers: { origin: 'https://foreign.invalid' } }),
    await http('/api/context/accepted/catalogue', { cookie, headers: { 'sec-fetch-site': 'cross-site' } }),
    await query({ ...input, actor_ref: 'actor:alpha' }), await query({ ...input, project_ref: ref(999) }),
  ]) { assert.equal(response.status, 404); assert.deepEqual(response.body, unavailable.body); }
  const g2 = correctedFixture(x.f);
  await x.put('source-revisions.json', sourceMetadata(g2));
  assert.deepEqual((await query(input)).body, unavailable.body);
  assert.deepEqual((await get()).body, unavailable.body);
  assert.deepEqual(x.store.getCurrentPointer().generation_ref, x.f.currentRef);
  assert.equal(x.store.acceptCandidate(g2.submission).status, 'ACCEPTED');
  await x.publishAccepted();
  const secondCatalogue = await get(); assert.equal(secondCatalogue.status, 200);
  const selected = secondCatalogue.body.entries.find(row => row.scope === 'project');
  assert.notEqual(selected.selection_id, input.selection_id);
  const current = { selection_id: selected.selection_id, as_of: selected.as_of, cursor: null };
  assert.deepEqual((await query(input)).body, unavailable.body);
  assert.deepEqual((await query({ ...current, cursor: first.body.cursor })).body, unavailable.body);
  const hits = []; let pageInput = current;
  do {
    const response = await query(pageInput); assert.equal(response.status, 200);
    hits.push(...response.body.hits); pageInput = { ...current, cursor: response.body.cursor };
  } while (pageInput.cursor);
  assert.ok(hits.some(hit => hit.source_span_ref === 'timeline-span:corrected'));
  assert.ok(hits.every(hit => hit.source_span_ref !== 'timeline-span:1'));
  x.state.acl.revoked_actors.add('actor:alpha'); await x.put('acl.json', x.acl());
  assert.deepEqual((await query(current)).body, unavailable.body);
  x.state.acl.revoked_actors.clear(); await x.put('acl.json', x.acl());
  const accepted = JSON.parse(await readFile(join(x.root, 'accepted-generation.json'), 'utf8'));
  const wrong = structuredClone(accepted); wrong.receipt.accepted_generation_ref = x.f.currentRef;
  await x.put('accepted-generation.json', wrong); assert.deepEqual((await query(current)).body, unavailable.body);
  await x.put('accepted-generation.json', accepted);
  await x.put('source-revisions.json', { count: 9, max_known_at: current.as_of });
  assert.deepEqual((await query(current)).body, unavailable.body);
  const page = await fetch(server.base + '/accepted-context.html'); assert.equal(page.status, 200);
  assert.match(await page.text(), /수락된 맥락/u);
  for (const asset of ['accepted-context.js', 'accepted-context.css']) assert.equal((await fetch(server.base + '/' + asset)).status, 200);
  assert.equal(server.output().includes('autosync ON'), false);
  assert.equal(server.output().includes('아침 브리핑 push ON'), false);
  assert.ok((await readdir(x.root)).every(name => !name.startsWith('_workmeta')));
});

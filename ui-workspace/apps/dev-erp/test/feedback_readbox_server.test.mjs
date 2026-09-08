import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.mjs';
import { createReadboxFixture } from '../../../../guild_hall/dev_worker/feedback_readbox_fixture.mjs';

const BASE = '/api/workbench/feedback-readbox';
async function fixture(t, extra = {}) {
  const f = await createReadboxFixture();
  const dbPath = join(f.root, 'synthetic-server.sqlite'), seed = openStore(dbPath);
  seed.createAccount({ id: f.access.accountId, username: 'manager', password: 'synthetic-manager-only', roles: ['admin'] });
  seed.createAccount({ id: 'unrelated.synthetic', username: 'other', password: 'synthetic-other-only', roles: ['admin'] });
  seed.upsertProject({ id: f.config.project_id, title: 'Synthetic feedback project', health: 'ok', data_label: 'synthetic' });
  seed.db.close();
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  assert.ok(![4300, 4192].includes(port));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath,
    '--no-fixture', '--no-real-meta', '--no-tls', '--knowledge_shell_root', f.root, '--knowledge_dir', f.root], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true, stdio: 'ignore',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP, TMP: process.env.TMP, DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1',
      DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: f.root, DEV_ERP_FEEDBACK_READBOX_READ: '1',
      DEV_ERP_FEEDBACK_READBOX_CONFIG: f.configPath, DEV_ERP_FEEDBACK_READBOX_CONFIG_SHA256: f.configSha256, ...extra },
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await f.close();
  });
  const deadline = Date.now() + 10000;
  for (;;) {
    assert.equal(child.exitCode, null, 'isolated server must stay alive');
    try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* Bounded local startup. */ }
    assert.ok(Date.now() < deadline, 'isolated server startup deadline');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const http = (route = BASE, cookie = '', options = {}) => fetch(`${origin}${route}`, {
    ...options, headers: { 'sec-fetch-site': 'same-origin', cookie, ...options.headers },
  });
  const login = async (username, password) => {
    const response = await http('/api/auth/login', '', { method: 'POST',
      headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { ...f, http, origin, manager: await login('manager', 'synthetic-manager-only'),
    other: await login('other', 'synthetic-other-only') };
}

test('actual server route joins current manager login to metadata-only feedback without activating delivery', { timeout: 20000 }, async t => {
  const f = await fixture(t), before = await readFile(f.paths.workerDb);
  assert.equal((await f.http()).status, 401);
  assert.equal((await f.http(BASE, f.other)).status, 403);
  const response = await f.http(BASE, f.manager), text = await response.text();
  assert.equal(response.status, 200, text);
  const snapshot = JSON.parse(text);
  assert.equal(snapshot.state, 'CURRENT'); assert.equal(snapshot.project_id, f.config.project_id);
  assert.ok(snapshot.items.length >= 2);
  assert.equal(text.includes(f.rawSentinel), false); assert.equal(text.includes(f.root), false);
  for (const row of snapshot.items) {
    assert.equal(row.buzz_delivery, 'NOT_OBSERVED'); assert.equal(row.official_done, false);
    assert.equal(row.human_acceptance, 'UNKNOWN'); assert.equal(row.owner_decision_required, false);
    assert.match(row.locator, /^[rn]:[1-9][0-9]*$/u);
    const route = `${BASE}/evidence?${new URLSearchParams({ ref: row.ref, sha256: row.sha256, locator: row.locator })}`;
    assert.equal((await f.http(route, f.manager)).status, 200);
    assert.equal((await f.http(route, f.other)).status, 403);
  }
  const page = await f.http('/workbench/feedback-readbox', f.manager);
  assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /text\/html/u);
  assert.equal((await f.http('/workbench/feedback-readbox', f.other)).status, 403);
  assert.equal((await f.http(BASE, f.manager, { method: 'POST', headers: { origin: f.origin } })).status, 405);
  await f.writeCurrent({ active: false });
  assert.equal((await f.http(BASE, f.manager)).status, 403);
  assert.equal((await f.http('/workbench/feedback-readbox', f.manager)).status, 403);
  assert.deepEqual(await readFile(f.paths.workerDb), before);
  assert.deepEqual(await readdir(f.paths.delivery), [], 'server read must not initialize or send notices');
});

test('server read configuration drift remains unavailable without alternate roots', { timeout: 20000 }, async t => {
  const f = await fixture(t, { DEV_ERP_FEEDBACK_READBOX_CONFIG_SHA256: '0'.repeat(64) });
  assert.equal((await f.http(BASE, f.manager)).status, 503);
  assert.equal((await f.http('/workbench/feedback-readbox', f.manager)).status, 503);
  assert.deepEqual(await readdir(f.paths.delivery), []);
});

test('server delivery reader opens only an existing ledger and the surface stays disabled by default', { timeout: 20000 }, async t => {
  const disabled = await fixture(t, { DEV_ERP_FEEDBACK_READBOX_READ: '0' });
  assert.equal((await disabled.http(BASE, disabled.manager)).status, 404);
  const delivery = await fixture(t, { DEV_ERP_FEEDBACK_READBOX_DELIVERY_READ: '1' });
  assert.equal((await delivery.http(BASE, delivery.manager)).status, 503);
  assert.deepEqual(await readdir(delivery.paths.delivery), [], 'read-only missing ledger must not create a database');
});

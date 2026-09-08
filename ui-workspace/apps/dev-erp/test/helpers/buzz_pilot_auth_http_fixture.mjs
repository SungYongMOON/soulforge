// Synthetic source login and separate read-only candidate; no real account data.
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../../src/store.mjs';
import { makeBuzzPilotWorkbenchFixture } from './buzz_pilot_workbench_fixture.mjs';

export async function makeBuzzPilotAuthHttpFixture({ brokenSource = false, state = 'waiting_owner' } = {}) {
  const f = await makeBuzzPilotWorkbenchFixture({ state });
  const sourceDb = join(f.root, 'synthetic-auth-source.sqlite'), candidateDb = join(f.root, 'synthetic-candidate.sqlite');
  const source = openStore(sourceDb);
  source.createAccount({ id: 'account.a', username: 'source-owner', password: 'synthetic-source-only', roles: ['admin'] });
  source.upsertProject({ id: 'SYN-001', title: 'Synthetic source project', health: 'ok', data_label: 'synthetic' }); source.db.close();
  const candidate = openStore(candidateDb);
  candidate.createAccount({ id: 'candidate.local', username: 'candidate-local', password: 'synthetic-candidate-only', roles: ['admin'] }); candidate.db.close();
  const children = [];
  async function start(dbPath, extra = {}) {
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    if ([4300, 4192].includes(port)) throw new Error('Reserved operations port');
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
      DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: f.root, ...extra };
    const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath, '--no-fixture', '--no-real-meta', '--no-tls',
      '--knowledge_shell_root', f.root, '--knowledge_dir', f.root], { cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] }); children.push(child);
    const origin = `http://127.0.0.1:${port}`, deadline = Date.now() + 10000;
    for (;;) {
      if (child.exitCode !== null) throw new Error('Synthetic server exited');
      try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* Local startup only. */ }
      if (Date.now() > deadline) throw new Error('Synthetic server startup timeout');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return { origin, port };
  }
  async function close() {
    for (const child of children) if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    const resolved = await realpath(f.root), within = relative(await realpath(tmpdir()), resolved);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Unexpected synthetic cleanup target');
    await rm(resolved, { recursive: true, force: true });
  }
  try {
    const sourceServer = await start(sourceDb);
    const candidateServer = await start(candidateDb, { DEV_ERP_BUZZ_PILOT_READ: '1', DEV_ERP_BUZZ_PILOT_BINDING: f.bindingPath,
      DEV_ERP_BUZZ_PILOT_BINDING_SHA256: f.bindingSha256, DEV_ERP_BUZZ_PILOT_AUTH_SOURCE_DB: brokenSource ? join(f.root, 'missing.sqlite') : sourceDb,
      DEV_ERP_BUZZ_PILOT_AUTH_SOURCE_PORT: String(sourceServer.port) });
    return { ...f, sourceDb, candidateDb, sourceServer, candidateServer, close };
  } catch (error) { await close(); throw error; }
}

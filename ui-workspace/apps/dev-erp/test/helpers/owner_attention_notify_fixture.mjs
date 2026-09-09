// One real server plus one real loopback receiver. A bot publishes through the
// existing MCP route; the Owner never opens the attention page. Synthetic data,
// temp ports, no operations surface, no external network.
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../../src/store.mjs';

const OWNER = 'account.owner', BOT = 'account.bot', BOT_EMAIL = 'notify-bot@example.invalid';
const OWNER_PASSWORD = 'synthetic-notify-owner', BOT_PASSWORD = 'synthetic-notify-bot';

async function freePort() {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const { port } = probe.address(); await new Promise(resolve => probe.close(resolve));
  if ([4300, 4192].includes(port)) throw new Error('Reserved operations port');
  return port;
}

export async function makeOwnerAttentionNotifyFixture({ configured = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sf-attn-notify-'));
  const dbPath = join(root, 'synthetic-notify.sqlite');
  const store = openStore(dbPath);
  let item;
  try {
    store.createAccount({ id: OWNER, username: 'notify-owner', password: OWNER_PASSWORD, roles: ['admin'] });
    store.createAccount({ id: BOT, username: 'notify-bot', password: BOT_PASSWORD,
      email: BOT_EMAIL, display_name: '합성 알림 봇', roles: ['member'] });
    store.upsertProject({ id: 'SYN-NOTIFY', title: '합성 알림 과제', health: 'ok', data_label: 'synthetic' });
    item = store.createItem({ project_id: 'SYN-NOTIFY', title: '봇이 등록하는 검토 요청', assignee_ref: BOT_EMAIL }).item;
  } finally { store.db.close(); }

  // The receiver stands in for an Owner-bound local notifier. It records what
  // arrived so the test can assert no request prose ever crosses the adapter.
  const received = [];
  const receiver = createHttpServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload = null;
      try { payload = JSON.parse(body); } catch { /* recorded as null */ }
      received.push({ url: req.url, payload });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'delivered', attempt_id: payload?.attempt_id ?? null,
        receipt_ref: `synthetic-receipt:${randomBytes(8).toString('hex')}` }));
    });
  });
  const receiverPort = await freePort();
  receiver.listen(receiverPort, '127.0.0.1'); await once(receiver, 'listening');

  const destinationRef = 'buzz:synthetic-owner-inbox';
  const bindingSha256 = createHash('sha256')
    .update(JSON.stringify([OWNER, destinationRef, 'owner_attention'])).digest('hex');
  const configPath = join(root, 'owner-attention-notify.json');
  if (configured) {
    await writeFile(configPath, JSON.stringify({ owner_account_id: OWNER, purpose: 'owner_attention',
      destination_ref: destinationRef, binding_sha256: bindingSha256,
      expires_at: '2030-01-01T00:00:00.000Z', endpoint: `http://127.0.0.1:${receiverPort}/notify` }));
  }

  const children = [];
  async function close() {
    for (const child of children) if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await new Promise(resolve => receiver.close(resolve));
    const resolved = await realpath(root), within = relative(await realpath(tmpdir()), resolved);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Unexpected synthetic cleanup target');
    await rm(resolved, { recursive: true, force: true });
  }
  async function start() {
    const port = await freePort();
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP, TMP: process.env.TMP,
      DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: root,
      DEV_ERP_MCP_ENABLED: '1', DEV_ERP_MCP_ARTIFACT_ROOT: join(root, 'artifacts'),
      DEV_ERP_OWNER_ATTENTION: '1', DEV_ERP_OWNER_ATTENTION_ACCOUNT_ID: OWNER,
      ...(configured ? { DEV_ERP_OWNER_ATTENTION_NOTIFY_CONFIG: configPath } : {}) };
    const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath,
      '--no-fixture', '--no-real-meta', '--no-tls', '--knowledge_shell_root', root, '--knowledge_dir', root],
    { cwd: fileURLToPath(new URL('../..', import.meta.url)), env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    children.push(child);
    const origin = `http://127.0.0.1:${port}`, deadline = Date.now() + 15000;
    for (;;) {
      if (child.exitCode !== null) throw new Error('Synthetic server exited');
      try { if ((await fetch(`${origin}/api/health`)).ok) break; } catch { /* Local startup only. */ }
      if (Date.now() > deadline) throw new Error('Synthetic server startup timeout');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return { origin, port };
  }
  try {
    const server = await start();
    return { root, dbPath, item, server, received, destinationRef, bindingSha256, configPath,
      ownerAccountId: OWNER, botAccountId: BOT, ownerPassword: OWNER_PASSWORD, botPassword: BOT_PASSWORD, close };
  } catch (error) { await close(); throw error; }
}

// One real server holding both attention sources: existing MCP-registered
// requests from another bot and the native Buzz pilot question. Synthetic data
// only; no gateway, model, operations port, real account or real project.
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../../src/store.mjs';
import { createErpMcpService } from '../../src/erp_mcp_service.mjs';
import { makeBuzzPilotWorkbenchFixture } from './buzz_pilot_workbench_fixture.mjs';

const OWNER = 'account.a', BOT = 'account.b', BOT_EMAIL = 'combined-bot@example.invalid';

export async function makeBuzzPilotCombinedAttentionFixture({ state = 'waiting_owner' } = {}) {
  const f = await makeBuzzPilotWorkbenchFixture({ state });
  const dbPath = join(f.root, 'synthetic-combined.sqlite');
  const store = openStore(dbPath);
  let published;
  try {
    store.createAccount({ id: OWNER, username: 'combined-owner', password: 'synthetic-combined-only', roles: ['admin'] });
    store.createAccount({ id: BOT, username: 'combined-bot', password: 'synthetic-combined-bot',
      email: BOT_EMAIL, display_name: '합성 문서 봇', roles: ['member'] });
    // The native question lives in SYN-001; the other bot asks about SYN-002 so
    // one source's project scope never decides the other source's visibility.
    store.upsertProject({ id: 'SYN-001', title: '합성 native 과제', health: 'ok', data_label: 'synthetic' });
    store.upsertProject({ id: 'SYN-002', title: '합성 별도 과제', health: 'ok', data_label: 'synthetic' });
    const item = store.createItem({ project_id: 'SYN-002', title: '다른 봇의 검토 요청', assignee_ref: BOT_EMAIL }).item;
    const erp = createErpMcpService({ store, artifactRoot: join(f.root, 'artifacts') });
    const sender = store.db.prepare('SELECT * FROM core_account WHERE id=?').get(BOT);
    published = erp.publishWorkSession(sender, { item_id: item.id, idempotency_key: 'attention-combined-r1',
      client_session_ref: 'oa1:review_document:1:none', request_kind: 'owner_attention/request',
      summary: '외부 제출 후보의 공개 범위를 확인해 주세요.',
      knowledge: '내부 작성과 검증을 마쳤습니다. 외부 반출만 검토를 기다립니다.',
      outputs: ['artifact:synthetic-document-r1'], verification: '합성 문서의 구조와 내용 검증을 통과했습니다.',
      next_actions: ['Buzz에서 외부 반출 승인 여부와 변경할 공개 범위를 알려 주세요.'],
      stop_conditions: ['외부 반출만 보류합니다. 독립적인 내부 개발과 수정은 계속합니다.'] }).session;
  } finally { store.db.close(); }
  const children = [];
  async function close() {
    for (const child of children) if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    const resolved = await realpath(f.root), within = relative(await realpath(tmpdir()), resolved);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Unexpected synthetic cleanup target');
    await rm(resolved, { recursive: true, force: true });
  }
  async function start() {
    const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    if ([4300, 4192].includes(port)) throw new Error('Reserved operations port');
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP, TMP: process.env.TMP,
      DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: f.root,
      DEV_ERP_MCP_ENABLED: '1', DEV_ERP_MCP_ARTIFACT_ROOT: join(f.root, 'artifacts'),
      DEV_ERP_OWNER_ATTENTION: '1', DEV_ERP_OWNER_ATTENTION_ACCOUNT_ID: OWNER,
      DEV_ERP_BUZZ_PILOT_READ: '1', DEV_ERP_BUZZ_PILOT_BINDING: f.bindingPath,
      DEV_ERP_BUZZ_PILOT_BINDING_SHA256: f.bindingSha256 };
    const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', dbPath,
      '--no-fixture', '--no-real-meta', '--no-tls', '--knowledge_shell_root', f.root, '--knowledge_dir', f.root],
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
  // A running lane re-issues its binding; the viewer keeps the pinned digest it
  // started with. This is the observed cutover condition, not file corruption.
  async function reissueBinding() {
    const current = JSON.parse(await readFile(f.bindingPath, 'utf8'));
    await writeFile(f.bindingPath, JSON.stringify({ ...current,
      expires_at: new Date(Date.parse(current.expires_at) + 3600000).toISOString() }));
  }
  try {
    const server = await start();
    return { ...f, dbPath, ownerAccountId: OWNER, botAccountId: BOT, published, server, reissueBinding, close };
  } catch (error) { await close(); throw error; }
}

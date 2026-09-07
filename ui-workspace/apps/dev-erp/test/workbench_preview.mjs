// Optional local visual QA. Synthetic isolated database and metadata only; no real root fallback.
// Run: node test/workbench_preview.mjs. Exit with Ctrl+C. Password below is fixture-only.
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeWorkbenchFixture } from './helpers/workbench_fixture.mjs';
import { openStore } from '../src/store.mjs';
import { makeWorkbenchExecutionFixture } from './helpers/workbench_execution_fixture.mjs';

const execution = process.argv.includes('--execution');
const fixture = execution ? await makeWorkbenchExecutionFixture() : await makeWorkbenchFixture();
const seed = openStore(join(fixture.root, 'synthetic.db'));
seed.createAccount({ id: 'account.a', username: 'workbench-demo', password: 'synthetic-demo-only', roles: ['admin'], display_name: '합성 검증 계정' });
seed.upsertProject({ id: fixture.scope.project_code, title: '합성 업무 과제', health: 'ok', data_label: 'synthetic' });
seed.db.close();
const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
if ([4300, 4192].includes(port)) throw new Error('Reserved operations port');
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
  DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: fixture.root,
  DEV_ERP_WORKBENCH_INTAKE: '1', DEV_ERP_WORKBENCH_INTAKE_ROOT: fixture.intakeRoot, DEV_ERP_WORKBENCH_SOURCE_ROOT: fixture.sourceRoot,
  DEV_ERP_WORKBENCH_BINDING_ID: fixture.expectedBinding.binding_id, DEV_ERP_WORKBENCH_REALM_ID: fixture.expectedBinding.realm_id,
  DEV_ERP_WORKBENCH_BINDING_SHA256: fixture.expectedBinding.content_sha256 };
if (execution) Object.assign(env, { DEV_ERP_WORKBENCH_SYNTHETIC_EXECUTION: '1', DEV_ERP_WORKBENCH_EXECUTION_ROOT: fixture.executionRoot,
  DEV_ERP_WORKBENCH_EXECUTION_BINDING_SHA256: fixture.executionDigest });
const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', join(fixture.root, 'synthetic.db'),
  '--no-fixture', '--no-real-meta', '--no-tls', '--knowledge_shell_root', fixture.root, '--knowledge_dir', fixture.root],
{ cwd: fileURLToPath(new URL('..', import.meta.url)), env, windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'] });
let cleaning = false;
async function close() {
  if (cleaning) return; cleaning = true;
  if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  await rm(fixture.root, { recursive: true, force: true });
}
process.once('SIGINT', async () => { await close(); process.exit(0); });
process.once('SIGTERM', async () => { await close(); process.exit(0); });
child.once('exit', async () => { if (!cleaning) { await close(); process.exitCode = 1; } });
const started = Date.now();
while (true) {
  if (child.exitCode !== null) throw new Error('Synthetic server exited');
  try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch { /* Bounded startup. */ }
  if (Date.now() - started > 10000) { await close(); throw new Error('Synthetic server startup timeout'); }
  await new Promise(resolve => setTimeout(resolve, 30));
}
console.log(`Synthetic preview: http://127.0.0.1:${port}/workbench.html${execution ? `#request=${fixture.record.request_id}` : ''}`);
console.log('Fixture login: workbench-demo / synthetic-demo-only');
if (execution) console.log('Execution approval is a synthetic fixture with a 60-second freshness window. No automatic authority refresh.');

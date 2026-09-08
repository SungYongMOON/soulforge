// Optional local visual QA. Synthetic isolated database and metadata only; no real root fallback.
// Run: node test/workbench_preview.mjs. Exit with Ctrl+C. Password below is fixture-only.
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeWorkbenchFixture } from './helpers/workbench_fixture.mjs';
import { openStore } from '../src/store.mjs';
import { makeWorkbenchExecutionFixture } from './helpers/workbench_execution_fixture.mjs';
import { makeNativeWorkbenchFixture } from './hermes_native_workbench_fixture.mjs';
import { createWorkbenchExecutionSources } from '../src/workbench_execution_sources.mjs';
import { createWorkbenchExecutionStore } from '../src/workbench_execution_store.mjs';
import { createWorkbenchExecutionService } from '../src/workbench_execution_service.mjs';
import { makeBuzzPilotWorkbenchFixture } from './helpers/buzz_pilot_workbench_fixture.mjs';

const execution = process.argv.includes('--execution');
const native = process.argv.includes('--native');
const buzz = process.argv.includes('--buzz');
const unsupported = process.argv.includes('--unsupported');
if ([execution, native, buzz].filter(Boolean).length > 1) throw new Error('Select one execution fixture');
if (unsupported && !native) throw new Error('Unsupported-capability case requires the native fixture');
const fixture = buzz ? await makeBuzzPilotWorkbenchFixture({ state: process.argv.includes('--delivered') ? 'delivered'
  : process.argv.includes('--delivery-unknown') ? 'question_delivery_unknown' : 'waiting_owner' }) : native ? await makeNativeWorkbenchFixture({ supported: !unsupported })
  : execution ? await makeWorkbenchExecutionFixture() : await makeWorkbenchFixture();
const tempRelative = relative(tmpdir(), fixture.root);
if (!tempRelative || tempRelative.startsWith('..') || isAbsolute(tempRelative)) throw new Error('Unexpected synthetic cleanup root');
if (native && !unsupported) {
  const executionSources = createWorkbenchExecutionSources({ intakeSources: fixture.intakeSources, mode: 'native_chat',
    bindingDigest: fixture.executionDigest, nativeDeployment: { enabled: true, source_root: fixture.sourceRoot,
      expected_binding: fixture.expectedBinding, native_binding_sha256: fixture.executionDigest } });
  const executionStore = createWorkbenchExecutionStore({ root: fixture.executionRoot, mode: 'native_chat' });
  const service = createWorkbenchExecutionService({ enabled: true, intakeStore: fixture.intakeStore,
    intakeSources: fixture.intakeSources, executionSources, executionStore, nativeDispatchMode: 'synthetic_verification' });
  try {
    await service.start(fixture.record.request_id, fixture.access);
    const deadline = Date.now() + 10000;
    let status;
    do {
      status = await service.status(fixture.record.request_id, fixture.access);
      if (status.execution_state !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    if (status?.execution_state !== 'response_observed') throw new Error('Synthetic native preview did not observe a response');
  } finally { await service.close(); }
}
const username = native || buzz ? 'alpha' : 'workbench-demo';
const seed = openStore(join(fixture.root, 'synthetic.db'));
seed.createAccount({ id: 'account.a', username, password: 'synthetic-demo-only', roles: [native || buzz ? 'member' : 'admin'], display_name: '합성 검증 계정' });
seed.upsertProject({ id: fixture.scope.project_code, title: '합성 업무 과제', health: 'ok', data_label: 'synthetic' });
if (native || buzz) seed.createItem({ project_id: fixture.scope.project_code, title: '합성 요청', assignee_ref: username, created_by: 'synthetic' });
seed.db.close();
const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
if ([4300, 4192].includes(port)) throw new Error('Reserved operations port');
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
  DEV_ERP_NO_TLS: '1', DEV_ERP_NO_REAL_META: '1', DEV_ERP_NO_FIXTURE: '1', DEV_ERP_BACKEND_ROOT: fixture.root };
if (!buzz) Object.assign(env, {
  DEV_ERP_WORKBENCH_INTAKE: '1', DEV_ERP_WORKBENCH_INTAKE_ROOT: fixture.intakeRoot, DEV_ERP_WORKBENCH_SOURCE_ROOT: fixture.sourceRoot,
  DEV_ERP_WORKBENCH_BINDING_ID: fixture.expectedBinding.binding_id, DEV_ERP_WORKBENCH_REALM_ID: fixture.expectedBinding.realm_id,
  DEV_ERP_WORKBENCH_BINDING_SHA256: fixture.expectedBinding.content_sha256 });
if (buzz) Object.assign(env, { DEV_ERP_BUZZ_PILOT_READ: '1', DEV_ERP_BUZZ_PILOT_BINDING: fixture.bindingPath,
  DEV_ERP_BUZZ_PILOT_BINDING_SHA256: fixture.bindingSha256 });
if (execution) Object.assign(env, { DEV_ERP_WORKBENCH_SYNTHETIC_EXECUTION: '1', DEV_ERP_WORKBENCH_EXECUTION_ROOT: fixture.executionRoot,
  DEV_ERP_WORKBENCH_EXECUTION_BINDING_SHA256: fixture.executionDigest });
if (native) Object.assign(env, { DEV_ERP_WORKBENCH_SYNTHETIC_EXECUTION: '0', DEV_ERP_WORKBENCH_NATIVE_EXECUTION: '1',
  DEV_ERP_WORKBENCH_EXECUTION_ROOT: fixture.executionRoot, DEV_ERP_WORKBENCH_EXECUTION_BINDING_SHA256: fixture.executionDigest });
const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--db', join(fixture.root, 'synthetic.db'),
  '--no-fixture', '--no-real-meta', '--no-tls', '--knowledge_shell_root', fixture.root, '--knowledge_dir', fixture.root],
{ cwd: fileURLToPath(new URL('..', import.meta.url)), env, windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'] });
let cleaning = false;
async function close() {
  if (cleaning) return; cleaning = true;
  if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  await rm(fixture.root, { recursive: true, force: true });
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', async value => { if (value.trim() === 'stop') { await close(); process.exit(0); } });
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
console.log(`Synthetic preview: http://127.0.0.1:${port}/workbench.html${execution || native ? `#request=${fixture.record.request_id}` : ''}`);
console.log(`Fixture login: ${username} / synthetic-demo-only`);
if (execution || native) console.log('Execution approval is a synthetic fixture with a 60-second freshness window. No automatic authority refresh.');
if (native) console.log('Native protocol uses a synthetic child and isolated session database; no real Hermes profile, model or message is used.');
if (buzz) console.log(`Synthetic Buzz observer events: ${fixture.state}. No real gateway/model/tool is used; this server only reads the protected producer records.`);

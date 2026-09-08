import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { nativeAuthorityFixture } from './hermes_native_fixtures.mjs';
import { bindHermesNativeRuntime, projectHermesNativeBriefBinding } from '../src/hermes_native_runtime.mjs';
import { createCandidateExecutionCoordinator } from '../src/candidate_execution_coordinator.mjs';
import { createHermesNativeAttemptStore } from '../src/hermes_native_attempt_store.mjs';
import { readHermesNativeSessionMetadata } from '../src/hermes_native_session_metadata.mjs';
import { digestOf } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { runHermesNativeCli } from '../src/hermes_native_cli.mjs';
import { createHermesNativeAuditStore } from '../src/hermes_native_audit_store.mjs';
import { admitForgeLinearExecutionPacket } from '../src/forge_linear_execution_packet_admission.mjs';
import { verifyAgentWorkforceAuthorityClaim, AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA } from '../../../../guild_hall/agent_observation/agent_authority_verification.mjs';

const CHILD = fileURLToPath(new URL('./hermes_native_child_fixture.mjs', import.meta.url));
const RESTART = fileURLToPath(new URL('./hermes_native_restart_fixture.mjs', import.meta.url));
const NOW = Date.parse('2026-09-08T01:03:00.000Z');
const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function fixture(t, mode = 'ok', options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-native-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profileName = options.profileName ?? 'synthetic-profile';
  const profileMetadata = Object.hasOwn(options, 'profileMetadata') ? options.profileMetadata
    : profileName === 'default' ? null : profileName;
  const home = profileName === 'default' ? path.join(root, 'hermes-default') : path.join(root, 'profiles', profileName);
  const attempts = path.join(root, 'attempts');
  const auditRoot = path.join(root, 'protected-audit');
  await mkdir(home, { recursive: true }); await mkdir(attempts); await mkdir(auditRoot);
  await writeFile(path.join(home, 'mode.txt'), mode);
  const f = await nativeAuthorityFixture();
  const selected = f.authority_request.executor_binding;
  const runtime = {
    ...Object.fromEntries(['performing_agent_id', 'bot_ref', 'executor_ref', 'profile_ref',
      'session_ref', 'deployment_ref', 'deployment_digest'].map((key) => [key, selected[key]])),
    expected_model: selected.requested_model, expected_effort: selected.requested_effort,
    profile_name: profileName, session_id: 'session-existing', provider: 'synthetic-provider',
    toolsets: ['synthetic-approved'], executable_path: process.execPath,
    executable_sha256: sha(await readFile(process.execPath)), executable_argv_prefix: [CHILD],
    HERMES_HOME: home, working_directory: root,
    source_pins: [{ path: CHILD, sha256: sha(await readFile(CHILD)) }],
  };
  const db = new DatabaseSync(path.join(home, 'state.db'));
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY,source TEXT,parent_session_id TEXT,
    started_at REAL,ended_at REAL,end_reason TEXT,model TEXT,billing_provider TEXT,profile_name TEXT,
    rewind_count INTEGER DEFAULT 0,archived INTEGER DEFAULT 0,hidden INTEGER DEFAULT 0,model_config TEXT,
    system_prompt TEXT,last_activity_description TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,role TEXT,content TEXT,
    timestamp REAL,active INTEGER DEFAULT 1,compacted INTEGER DEFAULT 0,finish_reason TEXT,
    effect_disposition TEXT,tool_calls TEXT,display_metadata TEXT,tool_call_id TEXT,tool_name TEXT);`);
  db.prepare(`INSERT INTO sessions (id,source,started_at,model,billing_provider,profile_name,model_config,
    system_prompt,last_activity_description) VALUES (?,'cli',1,?,?,?,'{}',?,?)`).run(runtime.session_id,
    runtime.expected_model, runtime.provider, profileMetadata, 'Never select system prompt body', 'Never select description');
  db.prepare("INSERT INTO messages (session_id,role,content,timestamp) VALUES (?,'user',?,1)")
    .run(runtime.session_id, 'Never select historical content');
  db.close();
  const briefBinding = projectHermesNativeBriefBinding(f.forge_admission);
  let reads = 0;
  let checks = 0;
  const settings = {
    feature_enabled: true, authority_request: f.authority_request, brief_binding: briefBinding,
    runtime_binding: runtime, attempt_directory: attempts, now: () => NOW,
    audit_storage: { root: auditRoot, storage_class: 'owner_approved_shared_worksite', owner_approval_ref: 'approval.synthetic-audit',
      repository_root: path.resolve(fileURLToPath(new URL('../../../..', import.meta.url))),
      backup_policy_ref: 'policy.native-execution-working-audit', read_capability_ref: 'capability.native-execution-log.read' },
    trace_identity: { request_ref: 'request.synthetic-native', requester_ref: 'requester.synthetic-owner', entrypoint: 'native_cli' },
    hard_timeout_ms: 4000,
    resolveCurrentState: async (request) => {
      checks += 1;
      const state = { authority_request: structuredClone(f.authority_request), brief_binding: briefBinding,
        runtime_capability: { ...structuredClone(request.runtime_capability), evaluated_at: new Date(NOW).toISOString(),
          expires_at: new Date(NOW + 60_000).toISOString() } };
      if (options.changeCurrent) await options.changeCurrent(state, checks);
      return state;
    },
    resolveWorkBrief: async () => {
      reads += 1;
      if (options.readBrief) return options.readBrief(f);
      return structuredClone(f.forge_request);
    },
    ...options.settings,
  };
  const input = { operation_id: 'operation-native-1', fencing_epoch: 1, attempt_no: 1,
    claim: { task_ref: f.authority_request.task_packet.task_ref,
      work_brief_revision_ref: f.authority_request.task_packet.work_brief_revision_ref,
      action_ref: f.authority_request.task_packet.action_ref },
    task_packet: f.authority_request.task_packet, assignment_packet: f.authority_request.assignment_packet };
  const bind = () => bindHermesNativeRuntime(settings);
  return { ...f, root, home, attempts, auditRoot, runtime, settings, input, bind,
    reads: () => reads, checks: () => checks };
}

test('product binder runs the actual child path with native flags and records metadata only', async (t) => {
  const f = await fixture(t);
  const bound = f.bind();
  assert.equal(bound.status, 'BOUND');
  const result = await bound.executor.execute(f.input);
  assert.equal(result.status, 'succeeded', JSON.stringify(result));
  const argv = JSON.parse(await readFile(path.join(f.home, 'argv.json'), 'utf8'));
  assert.equal(argv[argv.indexOf('--resume') + 1], 'session-existing');
  assert.equal(argv[argv.indexOf('--query-file') + 1], '-');
  assert.equal(argv.includes('--jsonl'), false);
  assert.equal(argv.includes(f.forge_request.forge_issued_work_brief.problem), false);
  const inputHash = await readFile(path.join(f.home, 'input-digest.txt'), 'utf8');
  assert.equal(inputHash, sha(JSON.stringify(f.forge_request.forge_issued_work_brief)).slice(7));
  const receiptFile = (await readdir(f.attempts)).find((name) => name.startsWith('receipt-'));
  const rawReceipt = await readFile(path.join(f.attempts, receiptFile), 'utf8');
  const receipt = JSON.parse(rawReceipt).receipt;
  assert.equal(receipt.brief_binding.brief_ref, f.forge_request.forge_issued_work_brief.brief_id);
  assert.equal(receipt.input_sha256, `sha256:${inputHash}`);
  assert.equal(receipt.cli_exit_code, 0);
  assert.equal(receipt.candidate_custody, false);
  assert.equal(receipt.human_accepted, false);
  assert.equal(receipt.observed_effort, 'UNKNOWN');
  assert.equal(rawReceipt.includes('Synthetic result'), false);
  assert.equal(rawReceipt.includes(f.forge_request.forge_issued_work_brief.problem), false);
  assert.equal(result.external_effect_evidence.network_calls, 'UNKNOWN');
  assert.equal(f.checks(), 2);
});

for (const mode of ['plain-only', 'wrong-session', 'branch', 'null-stop', 'multiple-users', 'nonzero', 'oversized', 'timeout']) {
  test(`native ${mode} holds and remains consumed after restart and successor`, async (t) => {
    const f = await fixture(t, mode, { settings: mode === 'timeout' ? { hard_timeout_ms: 800 } : {} });
    const first = await f.bind().executor.execute(f.input);
    assert.equal(first.status, 'hold', JSON.stringify(first));
    const successor = await f.bind().executor.execute({ ...f.input, operation_id: 'operation-successor',
      fencing_epoch: 2, attempt_no: 2 });
    assert.equal(successor.reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
    assert.equal((await readFile(path.join(f.home, 'started.txt'), 'utf8')).trim().split('\n').length, 1);
    assert.equal(f.reads(), 1);
  });
}

test('official compression lineage is observed; stdout fake session is ignored', async (t) => {
  const f = await fixture(t, 'compression');
  const result = await f.bind().executor.execute(f.input);
  assert.equal(result.status, 'succeeded', JSON.stringify(result));
  const snapshot = await readHermesNativeSessionMetadata({ database_path: path.join(f.home, 'state.db'),
    session_id: 'session-existing', since_id: null });
  assert.equal(snapshot.actual_session_id, 'session-continued');
  assert.equal(snapshot.lineage.length, 2);
  const text = JSON.stringify(snapshot);
  assert.equal(text.includes('Never select'), false);
  assert.equal(text.includes('content'), false);
  assert.equal(text.includes('system_prompt'), false);
});

for (const [label, mutate] of [
  ['capability unsupported', (state) => { state.runtime_capability.supported = false; }],
  ['profile drift', (state) => { state.runtime_capability.profile_name = 'wrong-profile'; }],
  ['tool expansion', (state) => { state.runtime_capability.effective_tool_refs.push('tool:extra'); }],
  ['brief revision drift', (state) => { state.brief_binding = { ...state.brief_binding, brief_ref: 'other-brief' }; }],
  ['assignment revoked', (state) => { state.authority_request.trusted_current_evaluation.current_assignment_epoch += 1; }],
  ['stale proof', (state) => { state.runtime_capability.evaluated_at = '2026-09-07T01:03:00.000Z'; }],
]) {
  test(`${label} prevents reading the WorkBrief`, async (t) => {
    const f = await fixture(t, 'ok', { changeCurrent: mutate });
    assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_CURRENT_BINDING_REQUIRED');
    assert.equal(f.reads(), 0);
    assert.deepEqual(await readdir(f.attempts), []);
  });
}

test('post-spawn authority drift prevents stdin release and stays durably consumed', async (t) => {
  const f = await fixture(t, 'ok', { changeCurrent: (state, count) => {
    if (count === 2) state.runtime_capability.supported = false;
  } });
  const first = await f.bind().executor.execute(f.input);
  assert.equal(first.reason_code, 'HERMES_NATIVE_PRE_RELEASE_DRIFT');
  await assert.rejects(readFile(path.join(f.home, 'input-digest.txt')));
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
});

test('modified issued bytes fail Forge admission after current preflight without child', async (t) => {
  const f = await fixture(t, 'ok', { readBrief: (source) => {
    const changed = structuredClone(source.forge_request);
    changed.forge_issued_work_brief.problem += ' Changed.';
    return changed;
  } });
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_ISSUED_BRIEF_UNAVAILABLE');
  await assert.rejects(readFile(path.join(f.home, 'started.txt')));
});

test('durable claim wins concurrent binders and prevents coordinator HOLD successor resend', async (t) => {
  const f = await fixture(t, 'plain-only');
  const coordinator = () => createCandidateExecutionCoordinator({ feature_enabled: true,
    executors: new Map([[f.runtime.executor_ref, f.bind().executor]]) });
  const request = { idempotency_key: 'native-dispatch-1', candidate_packet: f.authority_request.candidate_packet,
    task_packet: f.authority_request.task_packet, assignment_packet: f.authority_request.assignment_packet,
    successor_of_receipt_id: null };
  const engine = coordinator();
  const first = await engine.dispatch(request);
  assert.equal(first.status, 'hold', JSON.stringify(first));
  const successor = await engine.dispatch({ ...request, idempotency_key: 'native-dispatch-2',
    successor_of_receipt_id: first.execution_receipt.receipt_id });
  assert.equal(successor.execution_receipt.reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED', JSON.stringify(successor));
  const restarted = await coordinator().dispatch({ ...request, idempotency_key: 'native-dispatch-3' });
  assert.equal(restarted.execution_receipt.reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
  assert.equal((await readFile(path.join(f.home, 'started.txt'), 'utf8')).trim().split('\n').length, 1);
});

test('store exclusive write survives concurrency and a torn claim', async (t) => {
  const f = await fixture(t);
  const data = { claim: f.input.claim, session_key: digestOf('synthetic-session').slice(7),
    attempt: { operation_id: 'store-attempt', fencing_epoch: 1, attempt_no: 1 } };
  const first = createHermesNativeAttemptStore({ directory: f.attempts });
  const second = createHermesNativeAttemptStore({ directory: f.attempts });
  const both = await Promise.all([first.reserve(data), second.reserve(data)]);
  assert.equal(both.filter((value) => value.status === 'RESERVED').length, 1);
  const claimFile = (await readdir(f.attempts)).find((name) => name.startsWith('claim-'));
  await writeFile(path.join(f.attempts, claimFile), '{');
  assert.equal((await createHermesNativeAttemptStore({ directory: f.attempts }).reserve(data)).hold_code,
    'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
});

test('separate process crash after durable reservation cannot resend from a restarted product binder', async (t) => {
  const f = await fixture(t);
  const config = path.join(f.root, 'restart-synthetic.json');
  const { resolveWorkBrief, resolveCurrentState, now, ...settings } = f.settings;
  await writeFile(config, JSON.stringify({ ...settings, clock: NOW, input: f.input, forge_request: f.forge_request }));
  const run = (extra = []) => promisify(execFile)(process.execPath, [RESTART, config, ...extra],
    { timeout: 8000, windowsHide: true });
  const first = JSON.parse((await run(['reserve-only'])).stdout);
  assert.equal(first.status, 'RESERVED');
  const restarted = JSON.parse((await run()).stdout);
  assert.equal(restarted.outcome.reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
  assert.equal(restarted.brief_reads, 0);
  await assert.rejects(readFile(path.join(f.home, 'started.txt')));
});

test('executable hash drift and unsupported empty toolsets hold before source read', async (t) => {
  const f = await fixture(t);
  f.settings.runtime_binding.executable_sha256 = `sha256:${'0'.repeat(64)}`;
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_PREFLIGHT_HOLD');
  f.settings.runtime_binding.toolsets = [];
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_CONFIG_INVALID');
  assert.equal(f.reads(), 0);
});

test('store rejects nested raw claim payloads before creating any file', async (t) => {
  const f = await fixture(t);
  const store = createHermesNativeAttemptStore({ directory: f.attempts });
  const value = await store.reserve({ claim: { ...f.input.claim,
    task_ref: { ...f.input.claim.task_ref, content: 'Raw data should never be stored' } },
  session_key: digestOf('slot').slice(7), attempt: { operation_id: 'raw-test', fencing_epoch: 1, attempt_no: 1 } });
  assert.equal(value.hold_code, 'HERMES_NATIVE_ATTEMPT_INVALID');
  assert.deepEqual(await readdir(f.attempts), []);
});

test('profile path reinterpretation and restored YOLO hold before any WorkBrief read', async (t) => {
  const f = await fixture(t);
  const initialHome = f.settings.runtime_binding.HERMES_HOME;
  f.settings.runtime_binding.HERMES_HOME = f.root;
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_CONFIG_INVALID');
  f.settings.runtime_binding.HERMES_HOME = initialHome;
  const db = new DatabaseSync(path.join(f.home, 'state.db'));
  db.exec(`UPDATE sessions SET model_config='{"yolo_mode":true}'`);
  db.close();
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_SESSION_MISMATCH');
  assert.equal(f.reads(), 0);
});

async function fileOwnedCliFixture(f, { capabilitySupported = true } = {}) {
  const root = path.join(f.root, 'metadata-source');
  const bodies = path.join(f.root, 'issued-bodies');
  await mkdir(root); await mkdir(bodies);
  const write = async (name, value, directory = root) => {
    const bytes = JSON.stringify(value);
    await writeFile(path.join(directory, name), bytes);
    return { path: name, content_sha256: sha(bytes) };
  };
  const r = f.authority_request.verified_active_binding;
  const projectionFields = ['project_scope_ref', 'lineage_digest', 'family_ref', 'family_digest',
    'mark_ref', 'mark_digest', 'deployment_ref', 'deployment_digest', 'memory_generation_ref',
    'memory_digest', 'authority_receipt_ref'];
  const projection = { ...Object.fromEntries(projectionFields.map((key) => [key, r[key]])),
    project_scope_refs: [r.project_scope_ref], authority_receipt_verified: false };
  const pinFields = ['verification_receipt_ref', 'owner_ref', 'authority_ref', 'verifier_ref',
    ...projectionFields, 'approval_claim_digest', 'authority_receipt_digest', 'claim_ceiling',
    'issued_at', 'verified_at', 'expires_at', 'receipt_epoch', 'trusted_authority_epoch'];
  const pin = { schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
    pin_ref: r.trusted_pin_ref, ...Object.fromEntries(pinFields.map((key) => [key, r[key]])), revoked: false };
  const authorityCurrent = { schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
    evaluation_ref: r.authority_state_evaluation_ref, evaluated_at: r.authority_evaluated_at,
    authority_ref: r.authority_ref, current_authority_epoch: r.current_authority_epoch,
    revoked_pin_refs: [], claim_ceiling: r.claim_ceiling };
  assert.deepEqual(verifyAgentWorkforceAuthorityClaim(projection, pin, authorityCurrent), r);
  const brief = f.settings.brief_binding;
  const runtime = f.runtime;
  const capability = { protocol: 'hermes.native_chat.v1', supported: capabilitySupported,
    executor_ref: runtime.executor_ref, capability_snapshot_ref: f.authority_request.executor_binding.capability_snapshot_ref,
    profile_ref: runtime.profile_ref, profile_name: runtime.profile_name, session_ref: runtime.session_ref,
    session_id: runtime.session_id, hermes_home_digest: digestOf(runtime.HERMES_HOME), executable_sha256: runtime.executable_sha256,
    source_manifest_digest: digestOf(runtime.source_pins), model: runtime.expected_model, effort: runtime.expected_effort,
    provider: runtime.provider, toolsets: runtime.toolsets,
    effective_tool_refs: f.authority_request.executor_binding.authorized_tool_refs,
    tool_policy_digest: f.authority_request.executor_binding.tool_policy_digest,
    evaluated_at: new Date(NOW).toISOString(), expires_at: new Date(NOW + 60_000).toISOString() };
  const taskAuthorization = { approval_ref: 'native-task-approval', state: 'approved', task_ref: brief.task_ref,
    project_scope_ref: brief.project_scope_ref, authority_ref: brief.authority_ref, assignment_epoch: brief.assignment_epoch,
    approved_task_status: 'Todo', work_brief_content_sha256: brief.work_brief_revision_ref.content_sha256,
    observed_at: new Date(NOW).toISOString(), valid_until: new Date(NOW + 60_000).toISOString() };
  const descriptors = {};
  for (const [key, value] of Object.entries({ authority_request: f.authority_request, brief_binding: brief,
    runtime_binding: runtime, runtime_capability: capability, agent_projection: projection, authority_pin: pin,
    authority_current: authorityCurrent, task_authorization: taskAuthorization })) {
    descriptors[key] = await write(`${key}.json`, value);
  }
  const base = { binding_id: 'native-base', realm_id: 'native-realm', generation: 'native-g1', state: 'current',
    observed_at: new Date(NOW).toISOString(), valid_until: new Date(NOW + 60_000).toISOString(),
    authority: { path: 'unused.json', content_sha256: sha('unused') }, catalogue: { path: 'unused.json', content_sha256: sha('unused') } };
  const baseDescriptor = await write('binding.json', base);
  const body = await write('forge-packet.json', f.forge_request, bodies);
  const entry = { request_ref: 'native-approved-request', requester_ref: f.settings.trace_identity.requester_ref,
    audit_storage: f.settings.audit_storage, workbench_request_basis_digest: null, ...descriptors, forge_packet: body,
    work_brief_root: bodies, attempt_directory: f.attempts, hard_timeout_ms: 4000 };
  const native = { binding_id: 'native-execution', realm_id: base.realm_id, intake_binding_sha256: baseDescriptor.content_sha256,
    mode: 'native_chat', generation: base.generation, observed_at: base.observed_at, valid_until: base.valid_until, requests: [entry] };
  const nativeDescriptor = await write('native-chat-binding.json', native);
  return { root, bodies, entry, environment: { SOULFORGE_HERMES_NATIVE_ENABLED: '1',
    SOULFORGE_HERMES_NATIVE_SOURCE_ROOT: root, SOULFORGE_HERMES_NATIVE_BINDING_ID: base.binding_id,
    SOULFORGE_HERMES_NATIVE_REALM_ID: base.realm_id, SOULFORGE_HERMES_NATIVE_BINDING_SHA256: baseDescriptor.content_sha256,
    SOULFORGE_HERMES_NATIVE_EXECUTION_BINDING_SHA256: nativeDescriptor.content_sha256 } };
}

test('explicit product CLI reads independently pinned owner/current files and executes actual synthetic child', async (t) => {
  const f = await fixture(t);
  const files = await fileOwnedCliFixture(f);
  const run = () => runHermesNativeCli(['execute', '--request-ref', files.entry.request_ref],
    { environment: files.environment, now: () => NOW });
  const first = await run();
  assert.equal(first.exit_code, 0, first.output);
  const result = JSON.parse(first.output);
  assert.equal(result.status, 'NATIVE_TURN_OBSERVED');
  assert.equal(result.local_candidate_stored, false);
  assert.equal(result.official_task_done, false);
  const second = JSON.parse((await run()).output);
  assert.equal(second.hold_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
  assert.equal((await readFile(path.join(f.home, 'started.txt'), 'utf8')).trim().split('\n').length, 1);
});

test('CLI rejects caller pin flags and unsupported current capability before opening the body', async (t) => {
  const f = await fixture(t);
  const files = await fileOwnedCliFixture(f, { capabilitySupported: false });
  await rm(path.join(files.bodies, 'forge-packet.json'));
  const result = await runHermesNativeCli(['execute', '--request-ref', files.entry.request_ref],
    { environment: files.environment, now: () => NOW });
  assert.equal(JSON.parse(result.output).hold_code, 'HERMES_NATIVE_CURRENT_BINDING_REQUIRED');
  assert.equal((await runHermesNativeCli(['execute', '--request-ref', files.entry.request_ref, '--pin', 'caller-pin'])).exit_code, 2);
  await assert.rejects(readFile(path.join(f.home, 'started.txt')));
});

for (const mode of ['ok', 'compression']) {
  test(`product CLI supports exact default home with official NULL profile metadata (${mode})`, async (t) => {
    const f = await fixture(t, mode, { profileName: 'default' });
    const files = await fileOwnedCliFixture(f);
    const result = await runHermesNativeCli(['execute', '--request-ref', files.entry.request_ref],
      { environment: files.environment, now: () => NOW });
    assert.equal(result.exit_code, 0, result.output);
    assert.equal(JSON.parse(result.output).status, 'NATIVE_TURN_OBSERVED');
    const argv = JSON.parse(await readFile(path.join(f.home, 'argv.json'), 'utf8'));
    assert.equal(argv[argv.indexOf('-p') + 1], 'default');
    const snapshot = await readHermesNativeSessionMetadata({ database_path: path.join(f.home, 'state.db'),
      session_id: 'session-existing', since_id: null });
    assert.equal(snapshot.lineage.every((row) => row.profile_name === null), true);
  });
}

for (const options of [
  { profileName: 'synthetic-profile', profileMetadata: null },
  { profileName: 'default', profileMetadata: 'foreign-profile' },
]) {
  test(`profile metadata cannot cross bindings ${JSON.stringify(options)}`, async (t) => {
    const f = await fixture(t, 'ok', options);
    const result = await f.bind().executor.execute(f.input);
    assert.equal(result.reason_code, 'HERMES_NATIVE_SESSION_MISMATCH');
    assert.equal(f.reads(), 0);
    await assert.rejects(readFile(path.join(f.home, 'started.txt')));
  });
}

test('default refuses both named-profile homes and nonprofile subdirectories of the platform home before I/O', async (t) => {
  const f = await fixture(t, 'ok', { profileName: 'default' });
  const platformHome = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local'), 'hermes')
    : path.join(os.homedir(), '.hermes');
  for (const home of [path.join(f.root, 'profiles', 'foreign'), path.join(platformHome, 'not-a-profile')]) {
    f.settings.runtime_binding.HERMES_HOME = home;
    assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_CONFIG_INVALID');
  }
  assert.equal(f.reads(), 0);
});

test('official-shaped compression handoff with multiple user rows remains unproven without body-based deduplication', async (t) => {
  const f = await fixture(t, 'compression-handoff', { profileName: 'default' });
  const result = await f.bind().executor.execute(f.input);
  assert.equal(result.reason_code, 'HERMES_NATIVE_COMPRESSION_READBACK_UNPROVEN');
  const successor = await f.bind().executor.execute({ ...f.input, operation_id: 'compression-successor', attempt_no: 2, fencing_epoch: 2 });
  assert.equal(successor.reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
  assert.equal(f.reads(), 1);
});

async function expiryScenario(t, expiresAt, advanceAt = null) {
  const f = await fixture(t);
  const source = structuredClone(f.forge_request);
  const oldDigest = source.execution_binding.work_brief_content_sha256;
  source.forge_issued_work_brief.expires_at = expiresAt;
  source.forge_assignment.expires_at = expiresAt;
  const newDigest = digestOf(source.forge_issued_work_brief);
  source.execution_binding.work_brief_content_sha256 = newDigest;
  const authority = JSON.parse(JSON.stringify(f.authority_request).replaceAll(oldDigest, newDigest));
  const admission = admitForgeLinearExecutionPacket(source);
  assert.equal(admission.status, 'ADMITTED', 'upstream permits text expiry; native transport must validate time');
  const brief = projectHermesNativeBriefBinding(admission);
  const input = JSON.parse(JSON.stringify(f.input).replaceAll(oldDigest, newDigest));
  let clock = NOW;
  let reads = 0;
  let checks = 0;
  Object.assign(f.settings, { authority_request: authority, brief_binding: brief, now: () => clock,
    resolveWorkBrief: async () => { reads += 1; return structuredClone(source); },
    resolveCurrentState: async (request) => {
      checks += 1;
      if (advanceAt === 'current' && checks === 2) clock = NOW + 2;
      return { authority_request: structuredClone(authority), brief_binding: brief,
        runtime_capability: { ...structuredClone(request.runtime_capability),
          evaluated_at: new Date(NOW).toISOString(), expires_at: new Date(NOW + 60_000).toISOString() } };
    },
    onStdinRelease: async () => { if (advanceAt === 'release') clock = NOW + 2; return true; },
  });
  return { ...f, input, briefReads: () => reads };
}

for (const expiry of ['not-a-date', '2026-09-15', '2027-02-30T01:03:00.000Z']) {
  test(`noncanonical issued expiry ${expiry} never starts a child`, async (t) => {
    const f = await expiryScenario(t, expiry);
    const result = await f.bind().executor.execute(f.input);
    assert.equal(result.reason_code, 'HERMES_NATIVE_ISSUED_BRIEF_UNAVAILABLE');
    assert.equal(f.briefReads(), 1);
    await assert.rejects(readFile(path.join(f.home, 'started.txt')));
    await assert.rejects(readFile(path.join(f.home, 'input-digest.txt')));
  });
}

for (const advanceAt of ['current', 'release']) {
  test(`issued brief expiry during ${advanceAt} prevents stdin release and remains consumed`, async (t) => {
    const f = await expiryScenario(t, new Date(NOW + 1).toISOString(), advanceAt);
    const result = await f.bind().executor.execute(f.input);
    assert.equal(result.reason_code, 'HERMES_NATIVE_PRE_RELEASE_DRIFT');
    assert.equal(f.briefReads(), 1);
    await assert.rejects(readFile(path.join(f.home, 'input-digest.txt')));
    const successor = await f.bind().executor.execute({ ...f.input, operation_id: 'expiry-successor', attempt_no: 2, fencing_epoch: 2 });
    assert.equal(successor.reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
    assert.equal(f.briefReads(), 1);
    const receiptFile = (await readdir(f.attempts)).find((name) => name.startsWith('receipt-'));
    assert.equal(JSON.parse(await readFile(path.join(f.attempts, receiptFile), 'utf8')).receipt.stdin_released, false);
  });
}

function auditQuery(result) {
  return { work_id: result.evidence_refs.find((ref) => /^native-work\.[a-f0-9]{64}$/u.test(ref)),
    expected_header_digest: `sha256:${result.evidence_refs.find((ref) => ref.startsWith('native-audit-header.sha256.')).split('.').at(-1)}`,
    expected_audit_digest: result.evidence_refs.some((ref) => ref.startsWith('native-audit-final.sha256.'))
      ? `sha256:${result.evidence_refs.find((ref) => ref.startsWith('native-audit-final.sha256.')).split('.').at(-1)}` : null };
}

test('one request links original input, visible output and actual agent tool metadata without payload or success invention', async (t) => {
  const f = await fixture(t, 'tools');
  const result = await f.bind().executor.execute(f.input);
  assert.equal(result.status, 'succeeded', JSON.stringify(result));
  const store = createHermesNativeAuditStore(f.settings.audit_storage);
  const query = auditQuery(result);
  const record = await store.read(query);
  const instruction = await store.read({ ...query, role: 'instruction' });
  const output = await store.read({ ...query, role: 'output' });
  assert.equal(instruction.bytes.toString(), JSON.stringify(f.forge_request.forge_issued_work_brief));
  assert.equal(output.bytes.toString(), 'Synthetic result. session_id: fabricated-model-text\n');
  assert.equal(record.header.context.requester_ref, f.settings.trace_identity.requester_ref);
  assert.equal(record.final.evidence.tool_records.length, 2);
  const [request, response] = record.final.evidence.tool_records;
  assert.equal(request.phase, 'request_observed');
  assert.equal(response.phase, 'result_row_observed');
  assert.equal(request.tool_name, 'synthetic_read');
  assert.equal(request.tool_call_ref, response.tool_call_ref);
  assert.equal(response.actual_success, 'UNKNOWN');
  assert.equal(response.output_payload_digest, null);
  assert.equal(JSON.stringify(record).includes('DO_NOT_CAPTURE'), false);
  assert.equal(record.final.evidence.program_input_receipt, 'UNCONFIRMED');
  assert.equal(record.final.evidence.model_input_receipt, 'UNCONFIRMED');
  assert.equal(record.final.evidence.pipe_write_completed, true);
  assert.equal(record.header.context.work_session_evidence, 'NO_LINKED_RECEIPT');
  await assert.rejects(store.read({ ...query, role: '../outside' }));
  await assert.rejects(store.read({ ...query, work_id: `native-work.${'0'.repeat(64)}` }));
});

test('snapshot recording failure prevents child invocation and remains consumed', async (t) => {
  const f = await fixture(t);
  f.settings.audit_storage.root = path.join(f.root, 'missing-protected-worksite');
  const result = await f.bind().executor.execute(f.input);
  assert.equal(result.reason_code, 'HERMES_NATIVE_AUDIT_PREPARE_FAILED');
  await assert.rejects(readFile(path.join(f.home, 'started.txt')));
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
});

test('visible-output recording failure after a call is UNKNOWN, never overwrites and never resends', async (t) => {
  const f = await fixture(t);
  let occupied;
  f.settings.onAuditPrepared = async (trace) => {
    occupied = path.join(f.auditRoot, trace.audit_ref, 'visible-output.utf8');
    await writeFile(occupied, 'preexisting bytes', { flag: 'wx' });
    return true;
  };
  const result = await f.bind().executor.execute(f.input);
  assert.equal(result.reason_code, 'HERMES_NATIVE_AUDIT_FINALIZE_UNKNOWN');
  assert.equal(result.result_ref, null);
  assert.equal(await readFile(occupied, 'utf8'), 'preexisting bytes');
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
  assert.equal((await readFile(path.join(f.home, 'started.txt'), 'utf8')).trim().split('\n').length, 1);
  const record = await createHermesNativeAuditStore(f.settings.audit_storage).read(auditQuery(result));
  assert.equal(record.state, 'INCOMPLETE_UNKNOWN');
});

test('an instruction snapshot changed during the final release callback cannot be sent', async (t) => {
  const f = await fixture(t);
  let snapshotPath;
  f.settings.onAuditPrepared = async (trace) => {
    snapshotPath = path.join(f.auditRoot, trace.audit_ref, 'instruction.utf8'); return true;
  };
  f.settings.onStdinRelease = async () => {
    await chmod(snapshotPath, 0o600); await writeFile(snapshotPath, 'changed snapshot'); return true;
  };
  const result = await f.bind().executor.execute(f.input);
  assert.equal(result.reason_code, 'HERMES_NATIVE_PRE_RELEASE_DRIFT');
  await assert.rejects(readFile(path.join(f.home, 'input-digest.txt')));
  assert.equal((await f.bind().executor.execute(f.input)).reason_code, 'HERMES_NATIVE_ATTEMPT_ALREADY_CONSUMED');
});

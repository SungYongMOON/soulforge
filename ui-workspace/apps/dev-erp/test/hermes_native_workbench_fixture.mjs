import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeWorkbenchExecutionFixture } from './helpers/workbench_execution_fixture.mjs';
import { digestOf } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { verifyAgentWorkforceAuthorityClaim } from '../../../../guild_hall/agent_observation/agent_authority_verification.mjs';
import { admitForgeLinearExecutionPacket } from '../src/forge_linear_execution_packet_admission.mjs';
import { matchRoleCapabilities } from '../src/role_capability_matcher.mjs';
import { assignCandidate } from '../src/assignment_policy.mjs';
import { projectHermesNativeBriefBinding } from '../src/hermes_native_runtime.mjs';
import { workbenchExecutionRequestBasis } from '../src/workbench_execution_sources.mjs';

const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export async function makeNativeWorkbenchFixture({ mode = 'ok', supported = true, timeoutMs = 4000 } = {}) {
  const f = await makeWorkbenchExecutionFixture();
  const d = f.documents;
  const executorRef = 'executor.hermes.native-chat';
  d.capabilities.actor_bindings[0].executor_ref = executorRef;
  d.capabilities.snapshot_ref.content_sha256 = digestOf(d.capabilities.actor_bindings);
  d.executor_binding.executor_ref = executorRef;
  d.executor_binding.capability_snapshot_ref = d.capabilities.snapshot_ref;
  d.executor_current.executor_ref = executorRef;
  d.executor_current.capability_snapshot_ref = d.capabilities.snapshot_ref;
  const forge = admitForgeLinearExecutionPacket(d.packet);
  const match = matchRoleCapabilities({ work_task_contract: forge.work_task_contract,
    role_snapshot: d.roles, capability_snapshot: d.capabilities });
  const assignment = assignCandidate({ matcher_result: match, policy: d.assignment_policy });
  const verified = verifyAgentWorkforceAuthorityClaim(d.agent_projection, d.authority_pin, d.authority_current);
  const authority = { candidate_packet: forge.candidate_packet, task_packet: forge.task_packet,
    assignment_packet: assignment, role_capability_match: match, verified_active_binding: verified,
    trusted_current_evaluation: d.executor_current, executor_binding: d.executor_binding };
  const profileName = 'workbench-synthetic';
  const home = path.join(f.root, 'hermes-profiles', 'profiles', profileName);
  const attempts = path.join(f.root, 'native-attempts');
  const bodies = path.join(f.root, 'native-issued');
  await mkdir(home, { recursive: true }); await mkdir(attempts); await mkdir(bodies);
  const child = fileURLToPath(new URL('./hermes_native_child_fixture.mjs', import.meta.url));
  const selected = d.executor_binding;
  const runtime = { ...Object.fromEntries(['performing_agent_id', 'bot_ref', 'executor_ref', 'profile_ref',
    'session_ref', 'deployment_ref', 'deployment_digest'].map((key) => [key, selected[key]])),
    profile_name: profileName, session_id: 'native-workbench-session', provider: 'synthetic-provider',
    expected_model: selected.requested_model, expected_effort: selected.requested_effort,
    toolsets: ['synthetic-approved'], executable_path: process.execPath, executable_sha256: hash(await readFile(process.execPath)),
    executable_argv_prefix: [child], source_pins: [{ path: child, sha256: hash(await readFile(child)) }],
    HERMES_HOME: home, working_directory: f.root };
  const db = new DatabaseSync(path.join(home, 'state.db'));
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY,source TEXT,parent_session_id TEXT,
    started_at REAL,ended_at REAL,end_reason TEXT,model TEXT,billing_provider TEXT,profile_name TEXT,
    rewind_count INTEGER DEFAULT 0,archived INTEGER DEFAULT 0,hidden INTEGER DEFAULT 0,model_config TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT,role TEXT,content TEXT,
    timestamp REAL,active INTEGER DEFAULT 1,compacted INTEGER DEFAULT 0,finish_reason TEXT,
    effect_disposition TEXT,tool_calls TEXT);`);
  db.prepare(`INSERT INTO sessions (id,source,started_at,model,billing_provider,profile_name,model_config)
    VALUES (?,'cli',1,?,?,?,'{}')`).run(runtime.session_id, runtime.expected_model, runtime.provider, profileName);
  db.prepare("INSERT INTO messages (session_id,role,content,timestamp) VALUES (?,'user','Existing synthetic session',1)").run(runtime.session_id);
  db.close();
  await writeFile(path.join(home, 'mode.txt'), mode);
  const brief = projectHermesNativeBriefBinding(forge);
  const capability = { protocol: 'hermes.native_chat.v1', supported, executor_ref: executorRef,
    capability_snapshot_ref: selected.capability_snapshot_ref, profile_ref: runtime.profile_ref,
    profile_name: profileName, session_ref: runtime.session_ref, session_id: runtime.session_id,
    hermes_home_digest: digestOf(home), executable_sha256: runtime.executable_sha256,
    source_manifest_digest: digestOf(runtime.source_pins), model: runtime.expected_model,
    effort: runtime.expected_effort, provider: runtime.provider, toolsets: runtime.toolsets,
    effective_tool_refs: selected.authorized_tool_refs, tool_policy_digest: selected.tool_policy_digest,
    evaluated_at: d.executor_current.evaluated_at, expires_at: d.authority_pin.expires_at };
  const { read_receipt_digest, ...taskAuthorization } = d.task_authorization;
  const entry = { request_ref: 'native.workbench.approved', workbench_request_basis_digest: workbenchExecutionRequestBasis(f.request),
    attempt_directory: attempts, work_brief_root: bodies, hard_timeout_ms: timeoutMs };
  for (const [key, value] of Object.entries({ authority_request: authority, brief_binding: brief,
    runtime_binding: runtime, runtime_capability: capability, agent_projection: d.agent_projection,
    authority_pin: d.authority_pin, authority_current: d.authority_current, task_authorization: taskAuthorization })) {
    entry[key] = await f.write(`native-${key}.json`, value);
  }
  const bytes = JSON.stringify(d.packet);
  await writeFile(path.join(bodies, 'forge-packet.json'), bytes);
  entry.forge_packet = { path: 'forge-packet.json', content_sha256: hash(bytes) };
  const nativeManifest = { binding_id: 'native.workbench.execution', realm_id: f.expectedBinding.realm_id,
    intake_binding_sha256: f.expectedBinding.content_sha256, mode: 'native_chat', generation: f.binding.generation,
    observed_at: d.task_authorization.observed_at, valid_until: d.task_authorization.valid_until, requests: [entry] };
  const nativeDescriptor = await f.write('native-chat-binding.json', nativeManifest);
  return { ...f, executionDigest: nativeDescriptor.content_sha256, nativeManifest, nativeEntry: entry,
    nativeHome: home, nativeAttempts: attempts, nativeBodies: bodies, nativeCapability: capability };
}

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWorkbenchCurrentSources } from './workbench_current_sources.mjs';
import { bindHermesNativeRuntime } from './hermes_native_runtime.mjs';
import { createCandidateExecutionCoordinator } from './candidate_execution_coordinator.mjs';
import { verifyAgentWorkforceAuthorityClaim } from '../../../../guild_hall/agent_observation/agent_authority_verification.mjs';
import { digestOf, isSafeRef } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const exact = (value, keys) => value && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const same = (a, b) => digestOf(a) === digestOf(b);
const fail = (code) => { throw Object.assign(new Error(code), { nativeCode: code }); };
const check = (value, code) => { if (!value) fail(code); };
const current = (value, clock) => Number.isFinite(Date.parse(value.observed_at))
  && Number.isFinite(Date.parse(value.valid_until)) && Date.parse(value.observed_at) <= clock
  && clock < Date.parse(value.valid_until);

async function readIssuedPacket(root, descriptor) {
  check(typeof root === 'string' && path.isAbsolute(root) && path.parse(root).root !== root
    && exact(descriptor, ['path', 'content_sha256']) && /^sha256:[a-f0-9]{64}$/u.test(descriptor.content_sha256)
    && /^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,239}$/u.test(descriptor.path)
    && !descriptor.path.split('/').some((part) => !part || part === '.' || part === '..'),
  'HERMES_NATIVE_BRIEF_SOURCE_INVALID');
  const target = path.join(root, descriptor.path);
  for (let cursor = target; ; cursor = path.dirname(cursor)) {
    const stat = await lstat(cursor);
    check(!stat.isSymbolicLink() && (cursor === target ? stat.isFile() : stat.isDirectory()),
      'HERMES_NATIVE_BRIEF_SOURCE_UNSAFE');
    if (path.dirname(cursor) === cursor) break;
  }
  const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  check(normalize(await realpath(target)) === normalize(target), 'HERMES_NATIVE_BRIEF_SOURCE_UNSAFE');
  const before = await lstat(target);
  check(before.nlink === 1 && before.size > 0 && before.size <= 96 * 1024, 'HERMES_NATIVE_BRIEF_SOURCE_OVERSIZED');
  const file = await open(target, 'r');
  const identity = (stat) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.nlink}`;
  try {
    check(identity(await file.stat()) === identity(before), 'HERMES_NATIVE_BRIEF_SOURCE_CHANGED');
    const bytes = await file.readFile();
    check(identity(await file.stat()) === identity(before) && identity(await lstat(target)) === identity(before)
      && `sha256:${createHash('sha256').update(bytes).digest('hex')}` === descriptor.content_sha256,
    'HERMES_NATIVE_BRIEF_SOURCE_CHANGED');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await file.close(); }
}

/** Concrete file-owned caller. CLI argv selects one previously approved request
 * ref only. Roots/realm/binding hashes come from trusted deployment environment;
 * neither a task packet nor its own JSON can establish these independent pins.
 * No body is read until the product binder invokes resolveWorkBrief. */
export async function prepareHermesNativeRequest({ request_ref, workbench_request_basis_digest,
  deployment, now = Date.now, signal, onStdinRelease, verifyAccess = async () => true } = {}) {
  try {
    check((isSafeRef(request_ref) && workbench_request_basis_digest === undefined)
      || (request_ref === undefined && /^sha256:[a-f0-9]{64}$/u.test(workbench_request_basis_digest)),
    'HERMES_NATIVE_REQUEST_REF_INVALID');
    check(deployment?.enabled === true, 'HERMES_NATIVE_FEATURE_OFF');
    const sources = createWorkbenchCurrentSources({ root: deployment.source_root,
      expectedBinding: deployment.expected_binding, now: () => new Date(now()) });
    const read = sources.readPinnedMetadata;
    const rootBinding = () => read({ path: 'binding.json', content_sha256: sources.approvedBundleDigest });
    const manifestRead = () => read({ path: 'native-chat-binding.json', content_sha256: deployment.native_binding_sha256 });
    const pinned = await manifestRead();
    async function manifest() {
      const [base, value] = await Promise.all([rootBinding(), manifestRead()]);
      check(base.binding_id === deployment.expected_binding.binding_id && base.realm_id === sources.realmId
        && base.state === 'current' && current(base, now()), 'HERMES_NATIVE_SOURCE_BINDING_NOT_CURRENT');
      check(exact(value, ['binding_id', 'realm_id', 'intake_binding_sha256', 'mode', 'generation',
        'observed_at', 'valid_until', 'requests']) && isSafeRef(value.binding_id)
        && value.mode === 'native_chat' && value.realm_id === sources.realmId
        && value.intake_binding_sha256 === sources.approvedBundleDigest && value.generation === base.generation
        && current(value, now()) && Array.isArray(value.requests) && value.requests.length <= 64
        && same(value, pinned), 'HERMES_NATIVE_DEPLOYMENT_BINDING_NOT_CURRENT');
      const selected = value.requests.filter((entry) => request_ref === undefined
        ? entry.workbench_request_basis_digest === workbench_request_basis_digest : entry.request_ref === request_ref);
      check(selected.length === 1, 'HERMES_NATIVE_APPROVED_REQUEST_REQUIRED');
      const entry = selected[0];
      check(exact(entry, ['request_ref', 'workbench_request_basis_digest', 'authority_request', 'brief_binding', 'runtime_binding',
        'runtime_capability', 'agent_projection', 'authority_pin', 'authority_current', 'task_authorization',
        'forge_packet', 'work_brief_root', 'attempt_directory', 'hard_timeout_ms']), 'HERMES_NATIVE_REQUEST_BINDING_INVALID');
      return entry;
    }
    const entry = await manifest();
    const runtime = await read(entry.runtime_binding);
    const brief = await read(entry.brief_binding);
    const roots = [deployment.source_root, entry.work_brief_root, entry.attempt_directory, runtime.HERMES_HOME];
    check(roots.every((root) => typeof root === 'string' && path.isAbsolute(root)), 'HERMES_NATIVE_ROOTS_INVALID');
    const canonicalRoots = (await Promise.all(roots.map((root) => realpath(root))))
      .map((root) => process.platform === 'win32' ? root.toLowerCase() : root);
    const overlaps = (left, right) => left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
    check(!canonicalRoots.some((left, index) => canonicalRoots.slice(index + 1).some((right) => overlaps(left, right)))
      && !canonicalRoots[2].split(path.sep).includes('_workmeta'), 'HERMES_NATIVE_ROOTS_OVERLAP');
    async function currentState() {
      check(!signal?.aborted && await verifyAccess() === true, 'AUTH_REQUIRED');
      const latest = await manifest();
      check(same(latest, entry), 'HERMES_NATIVE_REQUEST_BINDING_CHANGED');
      const [authority, currentBrief, capability, projection, pin, authorityCurrent, taskAuthorization, currentRuntime] =
        await Promise.all(['authority_request', 'brief_binding', 'runtime_capability', 'agent_projection',
          'authority_pin', 'authority_current', 'task_authorization', 'runtime_binding'].map((key) => read(latest[key])));
      // Recompute the existing verifier result from separately pinned owner
      // packets. A persisted "verified" boolean is never treated as authority.
      const verified = verifyAgentWorkforceAuthorityClaim(projection, pin, authorityCurrent);
      check(verified.status === 'VERIFIED_ACTIVE_BINDING'
        && same(verified, authority.verified_active_binding), 'HERMES_NATIVE_OWNER_AUTHORITY_REQUIRED');
      check(exact(taskAuthorization, ['approval_ref', 'state', 'task_ref', 'project_scope_ref', 'authority_ref',
        'assignment_epoch', 'approved_task_status', 'work_brief_content_sha256', 'observed_at', 'valid_until'])
        && isSafeRef(taskAuthorization.approval_ref) && taskAuthorization.state === 'approved'
        && taskAuthorization.approved_task_status === 'Todo' && current(taskAuthorization, now())
        && same(taskAuthorization.task_ref, brief.task_ref)
        && taskAuthorization.project_scope_ref === brief.project_scope_ref
        && taskAuthorization.authority_ref === brief.authority_ref
        && taskAuthorization.assignment_epoch === brief.assignment_epoch
        && taskAuthorization.work_brief_content_sha256 === brief.work_brief_revision_ref.content_sha256,
      'HERMES_NATIVE_TASK_AUTHORIZATION_REQUIRED');
      check(same(currentRuntime, runtime) && same(currentBrief, brief), 'HERMES_NATIVE_REQUEST_BINDING_CHANGED');
      await manifest();
      check(!signal?.aborted && await verifyAccess() === true, 'AUTH_REQUIRED');
      return { authority_request: authority, brief_binding: currentBrief, runtime_capability: capability };
    }
    const initial = await currentState();
    const bound = bindHermesNativeRuntime({ feature_enabled: true, authority_request: initial.authority_request,
      brief_binding: brief, runtime_binding: runtime, attempt_directory: entry.attempt_directory,
      hard_timeout_ms: entry.hard_timeout_ms, max_current_age_ms: 60_000,
      now, signal, onStdinRelease, resolveCurrentState: currentState,
      resolveWorkBrief: async () => {
        await currentState();
        const packet = await readIssuedPacket(entry.work_brief_root, entry.forge_packet);
        await manifest();
        return packet;
      } });
    if (bound.status !== 'BOUND') return bound;
    return { ...bound, authority_request: initial.authority_request, brief_binding: brief,
      timeout_ms: entry.hard_timeout_ms, request_ref: entry.request_ref,
      binding_digest: deployment.native_binding_sha256, basis_digest: digestOf(entry) };
  } catch (error) {
    return { status: 'HOLD', hold_code: error.nativeCode ?? 'HERMES_NATIVE_FILE_SOURCE_UNAVAILABLE' };
  }
}

export async function executeHermesNativeRequest(options = {}) {
  try {
    const bound = await prepareHermesNativeRequest(options);
    if (bound.status !== 'BOUND') return bound;
    const coordinator = createCandidateExecutionCoordinator({ feature_enabled: true,
      executors: new Map([[bound.executor_ref, bound.executor]]) });
    const result = await coordinator.dispatch({
      candidate_packet: bound.authority_request.candidate_packet,
      task_packet: bound.authority_request.task_packet,
      assignment_packet: bound.authority_request.assignment_packet,
      idempotency_key: bound.request_ref,
    });
    return { status: result.status === 'succeeded' ? 'NATIVE_TURN_OBSERVED' : 'HOLD',
      hold_code: result.execution_receipt?.reason_code ?? result.hold_code ?? null,
      execution_receipt: result.execution_receipt ?? null,
      local_candidate_stored: false, reviewed: false, human_accepted: false, official_task_done: false };
  } catch (error) {
    return { status: 'HOLD', hold_code: error.nativeCode ?? 'HERMES_NATIVE_FILE_SOURCE_UNAVAILABLE',
      local_candidate_stored: false, reviewed: false, human_accepted: false, official_task_done: false };
  }
}

export async function runHermesNativeCli(argv, { environment = process.env, now = Date.now } = {}) {
  if (argv.length === 1 && argv[0] === '--help') return { exit_code: 0,
    output: 'Usage: hermes_native_cli.mjs execute --request-ref <approved-request-ref>\nDeployment pins are required in the trusted launch environment.\n' };
  if (argv.length !== 3 || argv[0] !== 'execute' || argv[1] !== '--request-ref') {
    return { exit_code: 2, output: 'HERMES_NATIVE_USAGE_ERROR\n' };
  }
  const result = await executeHermesNativeRequest({ request_ref: argv[2], now, deployment: {
    enabled: environment.SOULFORGE_HERMES_NATIVE_ENABLED === '1',
    source_root: environment.SOULFORGE_HERMES_NATIVE_SOURCE_ROOT,
    expected_binding: { binding_id: environment.SOULFORGE_HERMES_NATIVE_BINDING_ID,
      realm_id: environment.SOULFORGE_HERMES_NATIVE_REALM_ID,
      content_sha256: environment.SOULFORGE_HERMES_NATIVE_BINDING_SHA256 },
    native_binding_sha256: environment.SOULFORGE_HERMES_NATIVE_EXECUTION_BINDING_SHA256,
  } });
  return { exit_code: result.status === 'NATIVE_TURN_OBSERVED' ? 0 : 3, output: `${JSON.stringify(result)}\n` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runHermesNativeCli(process.argv.slice(2));
  process.stdout.write(result.output);
  process.exitCode = result.exit_code;
}

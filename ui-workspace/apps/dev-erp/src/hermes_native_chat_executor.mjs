import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { readHermesNativeSessionMetadata } from './hermes_native_session_metadata.mjs';
import { deepFreeze, digestOf, isSafeRef } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

export const HERMES_NATIVE_EXECUTOR_REF = 'executor.hermes.native-chat';
const SHA = /^sha256:[a-f0-9]{64}$/u;
const SAFE_CLI = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/u;
const safeCli = (value) => typeof value === 'string' && SAFE_CLI.test(value);
const same = (a, b) => digestOf(a) === digestOf(b);
const samePath = (a, b) => process.platform === 'win32'
  ? path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase() : a === b;
const absolute = (value) => typeof value === 'string' && path.isAbsolute(value)
  && path.normalize(value) === value && path.parse(value).root !== value;
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
function exactDefaultHome(home) {
  if (path.basename(path.dirname(home)) === 'profiles') return false;
  // Hermes treats a custom external home as its root, but a directory nested
  // inside the platform home is not the default profile (it reports "custom").
  const platformHome = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA?.trim() || path.join(homedir(), 'AppData', 'Local'), 'hermes')
    : path.join(homedir(), '.hermes');
  const relative = path.relative(platformHome, home);
  return relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}
const bounded = async (fn, ms) => {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(fn), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('deadline')), ms);
    })]);
  } finally { clearTimeout(timer); }
};

function outcome(reason, receiptRef = 'hermes-native-attempt.unknown', resultRef = null, audit = null) {
  const artifacts = audit ? [audit.instruction_snapshot?.artifact_ref, audit.output_snapshot?.artifact_ref].filter(Boolean) : [];
  const evidence = audit ? [receiptRef, audit.audit_ref, `native-audit-header.sha256.${audit.header_digest.slice(7)}`,
    ...(audit.audit_digest ? [`native-audit-final.sha256.${audit.audit_digest.slice(7)}`] : [])] : resultRef ? [receiptRef] : [];
  return deepFreeze({ status: resultRef ? 'succeeded' : 'hold', reason_code: reason,
    result_ref: resultRef, artifact_refs: artifacts, evidence_refs: evidence,
    external_effect_evidence: { source: HERMES_NATIVE_EXECUTOR_REF, receipt_ref: receiptRef,
      linear_writes: 'UNKNOWN', network_calls: 'UNKNOWN', filesystem_writes: 'UNKNOWN',
      shell_commands: 'UNKNOWN' } });
}

function validBinding(binding) {
  return binding && binding.executor_ref === HERMES_NATIVE_EXECUTOR_REF
    && ['performing_agent_id', 'bot_ref', 'profile_ref', 'session_ref', 'deployment_ref']
      .every((key) => isSafeRef(binding[key]))
    && ['profile_name', 'session_id', 'expected_model', 'provider'].every((key) => safeCli(binding[key]))
    && !['latest', 'last', '-'].includes(binding.session_id)
    && /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(binding.profile_name)
    && !['hermes', 'test', 'tmp', 'root', 'sudo'].includes(binding.profile_name)
    && ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(binding.expected_effort)
    && ['executable_path', 'HERMES_HOME', 'working_directory'].every((key) => absolute(binding[key]))
    && (binding.profile_name === 'default'
      ? exactDefaultHome(binding.HERMES_HOME)
      : path.basename(path.dirname(binding.HERMES_HOME)) === 'profiles'
        && path.basename(binding.HERMES_HOME) === binding.profile_name)
    && SHA.test(binding.executable_sha256) && SHA.test(binding.deployment_digest)
    && Array.isArray(binding.source_pins) && binding.source_pins.length > 0 && binding.source_pins.length <= 128
    && binding.source_pins.every((pin) => Object.keys(pin).length === 2
      && absolute(pin.path) && /\.(?:py|mjs|cjs|js)$/u.test(pin.path) && SHA.test(pin.sha256))
    && new Set(binding.source_pins.map((pin) => pin.path)).size === binding.source_pins.length
    && Array.isArray(binding.toolsets) && binding.toolsets.length > 0 && binding.toolsets.length <= 64
    && binding.toolsets.every((value) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u.test(value)
      && !['none', 'all', '*'].includes(value))
    && new Set(binding.toolsets).size === binding.toolsets.length
    && Array.isArray(binding.executable_argv_prefix)
    && (binding.executable_argv_prefix.length === 0
      || (binding.executable_argv_prefix.length === 1 && absolute(binding.executable_argv_prefix[0])
        && binding.source_pins.some((pin) => pin.path === binding.executable_argv_prefix[0])));
}

async function inspectPin(pin) {
  const stat = await lstat(pin.path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024
    || !samePath(await realpath(pin.path), pin.path)) throw new Error('unsafe code pin');
  const file = await open(pin.path, 'r');
  try {
    const before = await file.stat();
    const digest = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false })) digest.update(chunk);
    const after = await file.stat();
    const identity = (entry) => `${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeMs}:${entry.ctimeMs}:${entry.birthtimeMs}`;
    if (identity(stat) !== identity(before) || identity(before) !== identity(after)
      || `sha256:${digest.digest('hex')}` !== pin.sha256) throw new Error('code drift');
    return identity(after);
  } finally { await file.close(); }
}

function validSession(snapshot, binding) {
  return snapshot?.requested_session_id === binding.session_id
    && typeof snapshot.actual_session_id === 'string'
    && Number.isSafeInteger(snapshot.watermark) && snapshot.watermark >= 0
    && Array.isArray(snapshot.lineage) && snapshot.lineage.length > 0
    // Official default sessions (including compression children) persist NULL.
    // Normalize it only under an already validated exact default-home binding.
    && snapshot.lineage.every((row) => (row.profile_name === binding.profile_name
      || (binding.profile_name === 'default' && row.profile_name === null))
      && row.model === binding.expected_model && row.billing_provider === binding.provider
      && row.source !== 'tool' && row.archived === 0 && row.hidden === 0
      && row.rewind_count === 0 && row.yolo_enabled === 0)
    && snapshot.lineage.at(-1).id === snapshot.actual_session_id;
}

// Uses the real child-process path in both product and synthetic tests. Output
// remains plain Hermes text; it is NEVER interpreted as hermes.bot_submit.v1.
function runNativeChild(command, { verifyBeforeRelease, verifyAuditBeforeRelease, verifyReleaseClock, timeoutMs, maxOutputBytes, signal, onStdinRelease }) {
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let released = false;
    let verified = false;
    let pipeWritten = false;
    let outputBytes = 0;
    let timer;
    const stdout = [];
    const stderr = [];
    const abort = () => finish('cancelled');
    const finish = (state, code = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (state !== 'closed') { try { child?.kill(); } catch {} }
      resolve({ state, code, released, pipe_written: pipeWritten, verified, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    };
    if (signal?.aborted) { finish('cancelled'); return; }
    try {
      child = spawn(command.executable, command.argv, { cwd: command.cwd, env: command.env,
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch { finish('spawn_error'); return; }
    timer = setTimeout(() => finish('timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => finish('spawn_error'));
    child.once('close', (code) => finish('closed', code));
    child.stdin.on('error', () => {});
    const collect = (target, chunk) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) finish('oversized');
      else target.push(chunk);
    };
    child.stdout.on('data', (chunk) => collect(stdout, chunk));
    child.stderr.on('data', (chunk) => collect(stderr, chunk));
    child.once('spawn', async () => {
      try { verified = await verifyBeforeRelease() === true; }
      catch { verified = false; }
      if (settled) return;
      if (!verified) { child.stdin.destroy(); finish('pre_release_drift'); return; }
      try {
        if (onStdinRelease && await onStdinRelease() !== true) { finish('pre_release_drift'); return; }
      } catch { finish('pre_release_drift'); return; }
      if (settled || signal?.aborted) return;
      try { if (await verifyAuditBeforeRelease() !== true) { finish('pre_release_drift'); return; } }
      catch { finish('pre_release_drift'); return; }
      if (settled || signal?.aborted) return;
      // No awaited operation may separate this time-window check from the pipe
      // write: metadata/readiness callbacks can cross the issued brief's expiry.
      try { if (verifyReleaseClock() !== true) { finish('pre_release_drift'); return; } }
      catch { finish('pre_release_drift'); return; }
      // Mark uncertainty before writing: even a partial pipe write consumes the
      // durable attempt. There is no inferred safe retry on EPIPE or timeout.
      released = true;
      child.stdin.end(command.stdin, () => { if (!settled) pipeWritten = true; });
    });
  });
}

// Internal transport seam. Product callers use bindHermesNativeRuntime, which
// invokes the unchanged authority/Forge admission gates and supplies issued data.
export function createHermesNativeChatExecutor({ feature_enabled = false, runtime_binding,
  issued, verifyCurrent, verifyReleaseClock, resolveWorkBrief, attemptStore, now = Date.now,
  auditStore, traceContext, onAuditPrepared, onAuditRecorded,
  signal, onStdinRelease,
  hard_timeout_ms = 65_000, preflight_timeout_ms = 5000, max_output_bytes = 1024 * 1024,
  max_input_bytes = 64 * 1024, max_turns = 32,
} = {}) {
  let runtime;
  let expected;
  try { runtime = deepFreeze(structuredClone(runtime_binding)); expected = deepFreeze(structuredClone(issued)); }
  catch { /* Invalid configuration holds at execute, before any I/O. */ }
  async function execute(rawInput) {
    let input;
    try { input = deepFreeze(structuredClone(rawInput)); }
    catch { return outcome('HERMES_NATIVE_INPUT_INVALID'); }
    if (feature_enabled !== true) return outcome('HERMES_NATIVE_FEATURE_OFF');
    if (signal?.aborted) return outcome('HERMES_NATIVE_CANCELLED_UNKNOWN');
    if (!validBinding(runtime) || typeof verifyCurrent !== 'function' || typeof verifyReleaseClock !== 'function' || typeof resolveWorkBrief !== 'function'
      || typeof attemptStore?.reserve !== 'function' || typeof attemptStore?.complete !== 'function'
      || typeof attemptStore?.checkConsumed !== 'function'
      || typeof auditStore?.begin !== 'function' || typeof auditStore?.finalize !== 'function' || !traceContext
      || typeof now !== 'function' || !Number.isSafeInteger(hard_timeout_ms)
      || hard_timeout_ms < 100 || hard_timeout_ms > 3_600_000
      || !Number.isSafeInteger(preflight_timeout_ms) || preflight_timeout_ms < 100 || preflight_timeout_ms > 60_000
      || !Number.isSafeInteger(max_output_bytes) || max_output_bytes < 1 || max_output_bytes > 4 * 1024 * 1024
      || !Number.isSafeInteger(max_input_bytes) || max_input_bytes < 1 || max_input_bytes > 64 * 1024
      || !Number.isSafeInteger(max_turns) || max_turns < 1 || max_turns > 100) {
      return outcome('HERMES_NATIVE_CONFIG_INVALID');
    }
    try {
      if (Object.keys(input).length !== 6 || !isSafeRef(input.operation_id)
        || !Number.isSafeInteger(input.fencing_epoch) || input.fencing_epoch < 1
        || !Number.isSafeInteger(input.attempt_no) || input.attempt_no < 1
        || !same(input.task_packet, expected.task_packet) || !same(input.assignment_packet, expected.assignment_packet)
        || !same(input.claim, { task_ref: expected.task_packet.task_ref,
          work_brief_revision_ref: expected.task_packet.work_brief_revision_ref, action_ref: expected.task_packet.action_ref })) {
        return outcome('HERMES_NATIVE_INPUT_INVALID');
      }
    } catch { return outcome('HERMES_NATIVE_INPUT_INVALID'); }
    const consumed = await attemptStore.checkConsumed(input.claim);
    if (consumed.status !== 'AVAILABLE') return outcome(consumed.hold_code);
    const pins = [{ path: runtime.executable_path, sha256: runtime.executable_sha256 }, ...runtime.source_pins];
    const inspect = () => bounded(() => Promise.all(pins.map(inspectPin)), preflight_timeout_ms);
    const current = () => bounded(verifyCurrent, preflight_timeout_ms);
    const readMetadata = (sinceId = null) => bounded(() => readHermesNativeSessionMetadata({
      database_path: path.join(runtime.HERMES_HOME, 'state.db'), session_id: runtime.session_id, since_id: sinceId,
    }), preflight_timeout_ms);
    let identities;
    let before;
    try {
      identities = await inspect();
      if (!await current()) return outcome('HERMES_NATIVE_CURRENT_BINDING_REQUIRED');
      before = await readMetadata();
      if (!validSession(before, runtime)) return outcome('HERMES_NATIVE_SESSION_MISMATCH');
    } catch { return outcome('HERMES_NATIVE_PREFLIGHT_HOLD'); }

    const reservation = await attemptStore.reserve({ claim: input.claim,
      session_key: digestOf({ home: runtime.HERMES_HOME, session: runtime.session_ref }).slice(7),
      attempt: { operation_id: input.operation_id, fencing_epoch: input.fencing_epoch, attempt_no: input.attempt_no } });
    if (reservation.status !== 'RESERVED') return outcome(reservation.hold_code);
    const receiptRef = reservation.receipt_ref;
    const workId = `native-work.${reservation.token.claim_key}`;
    let audit = null;
    let visibleOutput = Buffer.alloc(0);
    let commandEvidence = null;
    let sessionEvidence = null;
    const receipt = { operation_id: input.operation_id, attempt_no: input.attempt_no, fencing_epoch: input.fencing_epoch,
      brief_binding: expected.brief_binding, requested_session_ref: runtime.session_ref,
      profile_ref: runtime.profile_ref, executable_sha256: runtime.executable_sha256,
      source_manifest_digest: digestOf(runtime.source_pins), before_metadata_digest: before.metadata_digest,
      input_sha256: null, stdout_sha256: null, stderr_sha256: null, after_metadata_digest: null,
      actual_session_id_digest: null, cli_exit_code: null, stdin_released: false,
      candidate_custody: false, reviewed: false, human_accepted: false,
      observed_effort: 'UNKNOWN', external_effects: 'UNKNOWN' };
    const finish = async (reason, resultRef = null) => {
      let finalReason = reason;
      let finalRef = resultRef;
      if (audit) {
        try {
          const final = await auditStore.finalize({ work_id: workId, expected_header_digest: audit.header_digest, output: visibleOutput,
            evidence: { completed_at: new Date(now()).toISOString(), outcome: resultRef ? 'response_observed' : 'hold',
              reason_code: reason, attempt_no: input.attempt_no, fencing_epoch: input.fencing_epoch,
              operation_id: input.operation_id, instruction_sha256: receipt.input_sha256,
              stdin_release_intent: receipt.stdin_released, pipe_write_completed: commandEvidence?.pipe_written ?? false,
              program_input_receipt: 'UNCONFIRMED', model_input_receipt: 'UNCONFIRMED',
              stdout_sha256: receipt.stdout_sha256, stderr_sha256: receipt.stderr_sha256,
              cli_exit_code: receipt.cli_exit_code, capture_state: commandEvidence?.state ?? 'NOT_STARTED',
              observed_effort: 'UNKNOWN', external_effects: 'UNKNOWN',
              session_recorded_model: sessionEvidence?.lineage.at(-1)?.model ?? null,
              session_recorded_provider: sessionEvidence?.lineage.at(-1)?.billing_provider ?? null,
              model_execution_receipt: 'UNCONFIRMED',
              session_metadata_digest: sessionEvidence?.metadata_digest ?? null,
              tool_observation: sessionEvidence ? 'SESSION_METADATA_ONLY' : 'UNKNOWN',
              tool_records: sessionEvidence?.tool_records ?? null,
              verification_refs: [receiptRef], candidate_custody: false, human_accepted: false } });
          audit = { ...audit, ...final };
          if (onAuditRecorded && await onAuditRecorded(audit) !== true) throw new Error('audit link failed');
        } catch {
          finalReason = 'HERMES_NATIVE_AUDIT_FINALIZE_UNKNOWN'; finalRef = null;
        }
      }
      const value = outcome(finalReason, receiptRef, finalRef, audit);
      const persisted = await attemptStore.complete(reservation.token, { ...receipt,
        status: value.status, reason_code: finalReason, result_ref: finalRef });
      return persisted.status === 'RECORDED' ? value
        : outcome('HERMES_NATIVE_RECEIPT_PERSISTENCE_UNKNOWN', receiptRef, null, audit);
    };
    let prompt;
    try { prompt = await bounded(resolveWorkBrief, preflight_timeout_ms); }
    catch { return finish('HERMES_NATIVE_ISSUED_BRIEF_UNAVAILABLE'); }
    if (typeof prompt !== 'string' || prompt.length === 0 || Buffer.byteLength(prompt) > max_input_bytes
      || /\u0000/u.test(prompt)) return finish('HERMES_NATIVE_INPUT_OVERSIZED_OR_INVALID');
    receipt.input_sha256 = hash(prompt);
    try {
      audit = await auditStore.begin({ work_id: workId, instruction: Buffer.from(prompt, 'utf8'),
        context: { ...traceContext, recorded_at: new Date(now()).toISOString(),
          operation_id: input.operation_id, attempt_no: input.attempt_no, fencing_epoch: input.fencing_epoch,
          executable_sha256: runtime.executable_sha256, source_manifest_digest: digestOf(runtime.source_pins) } });
      if (onAuditPrepared && await onAuditPrepared(audit) !== true) throw new Error('audit link failed');
    } catch { return finish('HERMES_NATIVE_AUDIT_PREPARE_FAILED'); }
    let preRelease;
    const verifyBeforeRelease = async () => {
      if (!same(await inspect(), identities) || !await current()) return false;
      preRelease = await readMetadata();
      return validSession(preRelease, runtime) && same(preRelease, before);
    };
    const verifyAuditBeforeRelease = async () => {
      const recorded = await auditStore.read({ work_id: workId, expected_header_digest: audit.header_digest, role: 'instruction' });
      return recorded.bytes.equals(Buffer.from(prompt, 'utf8'));
    };
    // Native profile resolution receives the already selected profile directory.
    // Keep only OS process essentials; do not inherit arbitrary runtime overrides,
    // provider credentials, PYTHONPATH, YOLO or hook-acceptance environment flags.
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'HOME',
      'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG']
      .filter((key) => typeof process.env[key] === 'string').map((key) => [key, process.env[key]]));
    env.HERMES_HOME = runtime.HERMES_HOME;
    // Fix the native Python pipe encoding at process startup. A later console
    // repair in Hermes is not an acknowledgment of our UTF-8 stdin bytes.
    env.PYTHONUTF8 = '1';
    env.PYTHONIOENCODING = 'utf-8';
    const argv = [...runtime.executable_argv_prefix, '-p', runtime.profile_name, 'chat', '--cli',
      '--resume', before.actual_session_id, '--query-file', '-', '--quiet',
      '--in', runtime.working_directory,
      '--model', runtime.expected_model, '--reasoning', runtime.expected_effort,
      '--provider', runtime.provider, '--toolsets', runtime.toolsets.join(','),
      '--max-turns', String(max_turns), '--run-budget', String(hard_timeout_ms / 1000)];
    let command;
    try {
      command = await runNativeChild({ executable: runtime.executable_path, argv,
        cwd: runtime.working_directory, env, stdin: Buffer.from(prompt, 'utf8') },
      { verifyBeforeRelease, verifyAuditBeforeRelease, verifyReleaseClock, timeoutMs: hard_timeout_ms, maxOutputBytes: max_output_bytes, signal, onStdinRelease });
    } catch { return finish('HERMES_NATIVE_EXECUTION_UNKNOWN'); }
    receipt.stdin_released = command.released;
    commandEvidence = command;
    visibleOutput = command.stdout;
    receipt.cli_exit_code = Number.isSafeInteger(command.code) ? command.code : null;
    receipt.stdout_sha256 = hash(command.stdout);
    receipt.stderr_sha256 = hash(command.stderr);
    if (command.released) {
      try { sessionEvidence = await readMetadata(before.watermark); }
      catch { /* The bounded visible output can still be preserved; tool/session evidence stays UNKNOWN. */ }
    }
    if (command.state !== 'closed' || !command.verified || !command.released || command.code !== 0) {
      return finish(command.state === 'pre_release_drift' ? 'HERMES_NATIVE_PRE_RELEASE_DRIFT'
        : command.state === 'oversized' ? 'HERMES_NATIVE_OUTPUT_OVERSIZED_UNKNOWN'
          : command.state === 'timeout' ? 'HERMES_NATIVE_TIMEOUT_UNKNOWN' : 'HERMES_NATIVE_EXECUTION_UNKNOWN');
    }
    let after;
    try { after = sessionEvidence ?? await readMetadata(before.watermark); }
    catch { return finish('HERMES_NATIVE_SESSION_READBACK_UNKNOWN'); }
    receipt.after_metadata_digest = after.metadata_digest;
    sessionEvidence = after;
    receipt.actual_session_id_digest = digestOf(after.actual_session_id);
    let stderr;
    try { stderr = new TextDecoder('utf-8', { fatal: true }).decode(command.stderr); }
    catch { return finish('HERMES_NATIVE_SESSION_READBACK_UNKNOWN'); }
    const sessionLines = [...stderr.matchAll(/^session_id: ([A-Za-z0-9][A-Za-z0-9_.:-]{0,159})\r?$/gmu)];
    const active = after.delta.filter((row) => row.active === 1 && row.compacted === 0);
    const terminal = active.at(-1);
    if (!validSession(after, runtime) || after.database_identity !== before.database_identity
      || after.watermark <= before.watermark || sessionLines.length !== 1
      || sessionLines[0][1] !== after.actual_session_id || command.stdout.toString('utf8').trim().length === 0
      || active.filter((row) => row.role === 'user').length !== 1
      || terminal?.session_id !== after.actual_session_id || terminal?.role !== 'assistant'
      || terminal?.finish_reason !== 'stop' || terminal?.has_tool_calls !== 0) {
      return finish(after.actual_session_id !== before.actual_session_id
        && active.filter((row) => row.role === 'user').length !== 1
        ? 'HERMES_NATIVE_COMPRESSION_READBACK_UNPROVEN' : 'HERMES_NATIVE_SESSION_READBACK_UNKNOWN');
    }
    // A native turn was observed. This is not candidate custody, review,
    // acceptance, measured side effects, observed reasoning effort, or Task Done.
    return finish(null, `hermes-native-result.sha256.${digestOf(receipt).slice(7)}`);
  }
  return Object.freeze({ execute });
}

import { Worker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { isWorkbenchIntakeRecord } from '../../team-ops-board/src/core/workbench-intake-record.mjs';
import { createCandidateExecutionCoordinator } from './candidate_execution_coordinator.mjs';
import { SYNTHETIC_WORKER_URL } from './workbench_execution_sources.mjs';
import { digestOf } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const fail = code => { throw Object.assign(new Error(code), { workbenchCode: code }); };
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const exact = (value, fields) => value && typeof value === 'object' && Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));

/** Durable outer admission/commit boundary around the unchanged CEC algorithm. Only the
 * fixed synthetic worker or the separately pinned native Hermes binder is registered.
 * Native response observation never enters the synthetic candidate-byte path. */
export function createWorkbenchExecutionService({ enabled = false, intakeStore, intakeSources, executionSources, executionStore, now = () => Date.now() } = {}) {
  const instanceRef = `workbench.instance.${randomBytes(16).toString('hex')}`;
  const active = new Map();
  let closed = false;
  let closePromise;
  async function recordFor(requestId, access) {
    if (await access.checkSession() !== true) fail('AUTH_REQUIRED');
    const result = await intakeStore.read(requestId);
    if (result.status !== 'FOUND' || !isWorkbenchIntakeRecord(result.record)
      || result.record.request.requester !== access.requester
      || await access.canAccessProject(result.record.request.project_code) !== true) fail('REQUEST_NOT_FOUND');
    await intakeSources.evidence({ request: result.record.request, requester: access.requester, canAccessProject: access.canAccessProject });
    if (await access.checkSession() !== true || await access.canAccessProject(result.record.request.project_code) !== true) fail('AUTH_REQUIRED');
    return result.record;
  }
  async function authorize(record, access, { signal, onStdinRelease } = {}) {
    if (!enabled || closed || !executionSources || !executionStore) fail('SYNTHETIC_EXECUTION_DISABLED');
    if (await access.checkSession() !== true || await access.canAccessProject(record.request.project_code) !== true) fail('AUTH_REQUIRED');
    const approval = await executionSources.authorize({ record, requester: access.requester,
      canAccessProject: access.canAccessProject, checkSession: access.checkSession, signal, onStdinRelease });
    if (await access.checkSession() !== true || await access.canAccessProject(record.request.project_code) !== true) fail('AUTH_REQUIRED');
    return approval;
  }
  function publicRun(run, currentHold = null) {
    return { status: run ? 'EXECUTION_RECORDED' : 'NOT_STARTED', run_id: run?.run_id ?? null,
      execution_state: run?.observed_state ?? null, hold_code: currentHold ?? run?.observed_reason ?? null,
      attempt_no: run?.attempt_no ?? null, fencing_epoch: run?.fencing_epoch ?? null,
      execution_started: !!run?.worker_started_at, local_candidate_stored: run?.candidate_present ?? false,
      execution_mode: run?.execution_mode ?? executionSources?.mode ?? 'synthetic_fixed', response_observed: run?.response_observed === true,
      candidate_sha256: run?.candidate_sha256 ?? null, remote_submission_ack: false,
      official_task_done: false, acceptance_authority: false, backup_class: executionStore?.backupClass ?? 'synthetic-only' };
  }
  const stopOutcome = code => ({ status: 'hold', reason_code: code, result_ref: null, artifact_refs: [], evidence_refs: [],
    external_effect_evidence: { source: 'workbench.synthetic.executor', receipt_ref: 'receipt.workbench.synthetic.stopped',
      linear_writes: 0, network_calls: 0, filesystem_writes: 0, shell_commands: 0 } });
  async function perform(run, record, approval, access) {
    let worker = null; let timeout = null; let cancelled = null; let finished = false;
    const nativeAbort = new AbortController();
    const controller = { stop: code => { cancelled = code; worker?.terminate(); nativeAbort.abort(); } };
    active.set(run.run_id, controller);
    try {
      const latest = await authorize(record, access, { signal: nativeAbort.signal,
        onStdinRelease: () => executionStore.markWorkerStarted(run) });
      if (latest.basis_digest !== approval.basis_digest) fail('EXECUTION_BASIS_CHANGED');
      if (cancelled) fail(cancelled);
      if (latest.mode === 'native_chat') {
        const native = latest.native_executor;
        const cec = createCandidateExecutionCoordinator({ feature_enabled: true,
          executors: new Map([[latest.assignment_packet.performer_binding.executor_ref, native]]) });
        const result = await cec.dispatch({ candidate_packet: latest.candidate_packet, task_packet: latest.task_packet,
          assignment_packet: latest.assignment_packet, idempotency_key: `dispatch.${run.run_id}` });
        if (cancelled) {
          executionStore.settle({ ...run, state: cancelled === 'USER_CANCELLED' ? 'cancelled' : 'hold', reason_code: cancelled });
          return;
        }
        const final = await authorize(record, access);
        if (final.basis_digest !== approval.basis_digest) fail('EXECUTION_BASIS_CHANGED');
        const observed = result.status === 'succeeded';
        executionStore.settle({ ...run, state: observed ? 'response_observed' : 'hold',
          reason_code: observed ? null : result.execution_receipt?.reason_code ?? result.hold_code ?? 'HERMES_NATIVE_EXECUTION_UNKNOWN',
          receipt: { durable_run_id: run.run_id, attempt_no: run.attempt_no, fencing_epoch: run.fencing_epoch,
            cec_receipt: result.execution_receipt ?? null, execution_binding_digest: final.binding_digest,
            current_authority_epoch: final.authority_epoch, response_observed: observed,
            local_candidate_stored: false, remote_submission_ack: false, official_task_done: false, acceptance_authority: false } });
        return;
      }
      let candidateBytes = null;
      const executor = { execute: async cecInput => {
        if (digestOf(cecInput.task_packet) !== digestOf(approval.task_packet)
          || digestOf(cecInput.assignment_packet) !== digestOf(approval.assignment_packet)) fail('EXECUTION_BASIS_CHANGED');
        if (sha(await readFile(SYNTHETIC_WORKER_URL)) !== approval.executor_code_sha256) fail('SYNTHETIC_EXECUTOR_CODE_CHANGED');
        if (await access.checkSession() !== true || await access.canAccessProject(record.request.project_code) !== true) fail('AUTH_REQUIRED');
        if (Date.parse(run.deadline_at) <= now()) fail('EXECUTION_TIMEOUT');
        if (cancelled) return stopOutcome(cancelled);
        return new Promise(resolve => {
          const end = value => { if (finished) return; finished = true; if (timeout) clearTimeout(timeout); resolve(value); };
          worker = new Worker(SYNTHETIC_WORKER_URL, { env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 } });
          timeout = setTimeout(() => { cancelled = 'EXECUTION_TIMEOUT'; worker.terminate(); end(stopOutcome(cancelled)); }, Math.max(1, Date.parse(run.deadline_at) - now()));
          worker.on('error', () => end(stopOutcome('SYNTHETIC_EXECUTOR_FAILED')));
          worker.on('exit', () => { if (!finished) end(stopOutcome(cancelled ?? 'SYNTHETIC_EXECUTOR_INTERRUPTED')); });
          worker.on('message', message => {
            if (message?.type === 'started' && exact(message, ['type', 'run_id', 'fencing_epoch'])
              && message.run_id === run.run_id && message.fencing_epoch === run.fencing_epoch) {
              try { if (!executionStore.markWorkerStarted(run)) { cancelled = 'RUN_FENCED_OUT'; worker.terminate(); } }
              catch { cancelled = 'EXECUTION_STORE_UNAVAILABLE'; worker.terminate(); }
              return;
            }
            if (!exact(message, ['type', 'run_id', 'fencing_epoch', 'content', 'content_sha256']) || message.type !== 'result'
              || message.run_id !== run.run_id || message.fencing_epoch !== run.fencing_epoch
              || typeof message.content !== 'string' || Buffer.byteLength(message.content) > 65536
              || sha(Buffer.from(message.content)) !== message.content_sha256 || cancelled) {
              worker.terminate(); end(stopOutcome(cancelled ?? 'SYNTHETIC_OUTCOME_INVALID')); return;
            }
            candidateBytes = Buffer.from(message.content);
            end({ status: 'succeeded', reason_code: null, result_ref: `result.${run.run_id}`, artifact_refs: [`artifact.${run.run_id}`],
              evidence_refs: [`receipt.${run.run_id}`], external_effect_evidence: { source: 'workbench.synthetic.executor',
                receipt_ref: `receipt.${run.run_id}`, linear_writes: 0, network_calls: 0, filesystem_writes: 0, shell_commands: 0 } });
            worker.terminate();
          });
          worker.postMessage({ run_id: run.run_id, fencing_epoch: run.fencing_epoch, attempt_no: run.attempt_no,
            request_id: record.request_id, project_code: record.request.project_code, stage_code: record.request.stage_code,
            artifact_family_id: record.request.artifact_family_id, input_revision: record.request.input_revision,
            work_brief_digest: approval.work_brief_digest, generation: approval.generation, delay_ms: approval.synthetic_delay_ms });
        });
      } };
      const cec = createCandidateExecutionCoordinator({ feature_enabled: true,
        executors: new Map([['executor.workbench.synthetic.v1', executor]]) });
      const result = await cec.dispatch({ candidate_packet: approval.candidate_packet, task_packet: approval.task_packet,
        assignment_packet: approval.assignment_packet, idempotency_key: `dispatch.${run.run_id}` });
      if (result.status !== 'succeeded' || candidateBytes === null) {
        executionStore.settle({ ...run, state: cancelled === 'USER_CANCELLED' ? 'cancelled' : 'hold',
          reason_code: cancelled ?? result.execution_receipt?.reason_code ?? result.hold_code ?? 'SYNTHETIC_EXECUTION_HELD' });
        return;
      }
      const final = await authorize(record, access);
      if (final.basis_digest !== approval.basis_digest || cancelled) fail(cancelled ?? 'EXECUTION_BASIS_CHANGED');
      executionStore.settle({ ...run, state: 'succeeded', reason_code: null, candidate_bytes: candidateBytes,
        receipt: { durable_run_id: run.run_id, attempt_no: run.attempt_no, fencing_epoch: run.fencing_epoch,
          cec_receipt: result.execution_receipt, execution_binding_digest: final.binding_digest,
          current_authority_epoch: final.authority_epoch, source_generation: final.generation,
          linear_read_receipt_digest: final.linear_read_receipt_digest, candidate_sha256: sha(candidateBytes),
          local_candidate_stored: true, remote_submission_ack: false, official_task_done: false, acceptance_authority: false } });
    } catch (error) {
      try { executionStore.settle({ ...run, state: cancelled === 'USER_CANCELLED' ? 'cancelled' : 'hold',
        reason_code: cancelled ?? error.workbenchCode ?? 'EXECUTION_BOUNDARY_FAILED' }); } catch { /* Durable active claim stays recovery-required. */ }
    } finally {
      if (timeout) clearTimeout(timeout); await worker?.terminate(); active.delete(run.run_id);
    }
  }
  return Object.freeze({
    enabled: enabled && !!executionSources && !!executionStore,
    mode: executionSources?.mode ?? 'synthetic_fixed',
    async start(requestId, access) {
      const record = await recordFor(requestId, access);
      const approval = await authorize(record, access);
      const claimed = executionStore.claim({ claim_key: approval.claim_key, basis_digest: approval.basis_digest,
        request_id: requestId, requester: access.requester, project_code: record.request.project_code,
        revision_no: record.request.revision_no, revision_of: record.request.revision_of,
        agent_id: approval.assignment_packet.performer_binding.performing_agent_id,
        binding_digest: approval.binding_digest, authority_epoch: approval.authority_epoch,
        deadline_at: new Date(now() + approval.timeout_ms).toISOString(), instance_ref: instanceRef });
      if (claimed.status === 'HOLD') fail(claimed.hold_code);
      if (claimed.status === 'CLAIMED') void perform(claimed.run, record, approval, access);
      return { ...publicRun(claimed.run), replayed: claimed.status === 'REPLAY' };
    },
    async status(requestId, access) {
      const record = await recordFor(requestId, access);
      let hold = null;
      try { await authorize(record, access); }
      catch (error) {
        if (['AUTH_REQUIRED', 'SCOPE_VIOLATION', 'REQUEST_NOT_FOUND'].includes(error.workbenchCode)) throw error;
        hold = error.workbenchCode ?? 'EXECUTION_AUTHORITY_UNAVAILABLE';
      }
      if (await access.checkSession() !== true || await access.canAccessProject(record.request.project_code) !== true) fail('AUTH_REQUIRED');
      return publicRun(executionStore?.read(requestId, instanceRef), hold);
    },
    async candidate(requestId, access) {
      const record = await recordFor(requestId, access); await authorize(record, access);
      const candidate = executionStore.candidate(requestId, instanceRef);
      if (!candidate) fail('CANDIDATE_NOT_AVAILABLE'); return candidate;
    },
    async cancel(requestId, access) {
      await recordFor(requestId, access);
      const run = executionStore?.read(requestId, instanceRef);
      if (!run) fail('EXECUTION_NOT_FOUND');
      if (run.state !== 'running') return publicRun(run);
      // Fence first, then terminate. A late worker message cannot publish a candidate.
      const result = executionStore.settle({ ...run, instance_ref: run.instance_ref, state: 'cancelled', reason_code: 'USER_CANCELLED' });
      active.get(run.run_id)?.stop('USER_CANCELLED');
      return publicRun(result.run ?? executionStore.read(requestId, instanceRef));
    },
    async close() {
      if (!closePromise) {
        closed = true;
        closePromise = (async () => {
          for (const controller of active.values()) controller.stop('SERVER_SHUTDOWN');
          while (active.size) await new Promise(resolve => setTimeout(resolve, 10));
          executionStore?.close();
        })();
      }
      return closePromise;
    },
  });
}

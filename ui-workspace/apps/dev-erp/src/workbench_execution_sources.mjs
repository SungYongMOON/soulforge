import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { digestOf, isSafeRef } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { evaluateWorkClaimEligibility } from '../../../../guild_hall/shared/work_binding.mjs';
import { verifyAgentWorkforceAuthorityClaim } from '../../../../guild_hall/agent_observation/agent_authority_verification.mjs';
import { createLinearReadEvidenceReader } from '../../../../guild_hall/linear_history/linear_read_evidence_reader.mjs';
import { admitForgeLinearExecutionPacket } from './forge_linear_execution_packet_admission.mjs';
import { matchRoleCapabilities } from './role_capability_matcher.mjs';
import { assignCandidate } from './assignment_policy.mjs';
import { admitCandidateExecutorAuthority } from './candidate_execution_authority_adapter.mjs';
import { prepareHermesNativeRequest, readHermesNativeAudit } from './hermes_native_cli.mjs';

export const SYNTHETIC_WORKER_URL = new URL('./workbench_synthetic_worker.mjs', import.meta.url);
const SHA = /^sha256:[a-f0-9]{64}$/u;
const fail = code => { throw Object.assign(new Error(code), { workbenchCode: code }); };
const assert = (condition, code) => { if (!condition) fail(code); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const utc = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const same = (a, b) => digestOf(a) === digestOf(b);

export function workbenchExecutionRequestBasis(request) {
  const { idempotency_key, revision_no, revision_of, ...basis } = request;
  return digestOf(basis);
}

/** Separate synthetic execution authorization. A catalogue, a click and polling evidence
 * cannot approve execution. Every approval is resolved from a separately pinned document. */
export function createWorkbenchExecutionSources({ intakeSources, bindingDigest, now = () => Date.now(),
  mode = 'synthetic_fixed', nativeDeployment } = {}) {
  if (mode === 'native_chat') {
    assert(nativeDeployment?.enabled === true && nativeDeployment.native_binding_sha256 === bindingDigest,
      'HERMES_NATIVE_DEPLOYMENT_BINDING_REQUIRED');
    return Object.freeze({ mode,
      async authorize({ record, requester, canAccessProject, checkSession = async () => true, signal, onStdinRelease,
        onAuditPrepared, onAuditRecorded }) {
        const request = record.request;
        let currentEvidence;
        const verifyAccess = async () => {
          if (request.requester !== requester || await checkSession() !== true
            || await canAccessProject(request.project_code) !== true) return false;
          const evidence = await intakeSources.evidence({ request, requester, canAccessProject });
          currentEvidence = evidence;
          return evidence.linear_task?.state === 'current' && evidence.linear_task.task_status === 'Todo'
            && same(evidence.linear_task.task_ref, request.policy_refs.task_ref)
            && evaluateWorkClaimEligibility(request, { recorded_binding: record.binding, current_evidence: evidence }).status === 'CLAIM_ELIGIBLE';
        };
        assert(await verifyAccess(), 'AUTH_REQUIRED');
        const prepared = await prepareHermesNativeRequest({ workbench_request_basis_digest: workbenchExecutionRequestBasis(request),
          deployment: nativeDeployment, now, signal, onStdinRelease, onAuditPrepared, onAuditRecorded,
          requester_ref: requester, trace_request_ref: record.request_id, verifyAccess });
        assert(prepared.status === 'BOUND', prepared.hold_code ?? 'HERMES_NATIVE_BINDING_UNAVAILABLE');
        const task = prepared.authority_request.task_packet;
        assert(same(task.task_ref, request.policy_refs.task_ref) && same(task.task_ref, currentEvidence.linear_task.task_ref),
          'TASK_BINDING_MISMATCH');
        assert(`sha256:${prepared.brief_binding.input_bundle_manifest_digest}` === request.input_revision,
          'WORK_BRIEF_INPUT_REVISION_MISMATCH');
        assert(await verifyAccess(), 'AUTH_REQUIRED');
        return { mode, native_executor: prepared.executor, binding_digest: bindingDigest,
          basis_digest: digestOf({ request_basis: workbenchExecutionRequestBasis(request), native_basis: prepared.basis_digest }),
          claim_key: digestOf({ task_ref: task.task_ref, work_brief_revision_ref: task.work_brief_revision_ref, action_ref: task.action_ref }),
          candidate_packet: prepared.authority_request.candidate_packet, task_packet: task,
          assignment_packet: prepared.authority_request.assignment_packet,
          authority_epoch: prepared.authority_request.verified_active_binding.current_authority_epoch,
          // The durable outer deadline includes bounded preflight/readback IO;
          // the child keeps its own exact, shorter native execution budget.
          timeout_ms: prepared.timeout_ms + 30_000,
          work_brief_digest: task.work_brief_revision_ref.content_sha256 };
      },
      async readAudit({ record, recordedRequestRef, requester, canAccessProject, checkSession, trace, role = null }) {
        assert(requester === record.request.requester && await checkSession() === true, 'AUTH_REQUIRED');
        assert(typeof intakeSources.authorizeRecordedScope === 'function', 'NATIVE_AUDIT_SCOPE_UNAVAILABLE');
        await intakeSources.authorizeRecordedScope({ request: record.request, requester, canAccessProject });
        let result;
        try {
          result = await readHermesNativeAudit({ deployment: nativeDeployment,
            request_basis_digest: workbenchExecutionRequestBasis(record.request), requester_ref: requester,
            recorded_request_ref: recordedRequestRef, trace, role });
        } catch (error) {
          if (error.workbenchCode) throw error;
          fail('NATIVE_AUDIT_INTEGRITY_UNKNOWN');
        }
        await intakeSources.authorizeRecordedScope({ request: record.request, requester, canAccessProject });
        assert(await checkSession() === true, 'AUTH_REQUIRED');
        return result;
      },
    });
  }
  assert(mode === 'synthetic_fixed', 'EXECUTION_MODE_INVALID');
  assert(typeof intakeSources?.readPinnedMetadata === 'function' && SHA.test(bindingDigest), 'EXECUTION_BINDING_UNAVAILABLE');
  const read = descriptor => intakeSources.readPinnedMetadata(descriptor);
  const readers = new Map();
  async function binding() {
    const value = await read({ path: 'execution-binding.json', content_sha256: bindingDigest });
    const intakeBinding = await read({ path: 'binding.json', content_sha256: intakeSources.approvedBundleDigest });
    assert(exact(value, ['binding_id', 'realm_id', 'intake_binding_sha256', 'mode', 'generation', 'observed_at', 'valid_until', 'approvals'])
      && value.realm_id === intakeSources.realmId && value.intake_binding_sha256 === intakeSources.approvedBundleDigest
      && isSafeRef(value.binding_id)
      && value.mode === 'synthetic_fixed' && value.generation === intakeBinding.generation
      && utc(value.observed_at) && utc(value.valid_until) && Date.parse(value.observed_at) <= now() && now() < Date.parse(value.valid_until)
      && Array.isArray(value.approvals) && value.approvals.length <= 64, 'EXECUTION_BINDING_NOT_CURRENT');
    return value;
  }
  async function authorize({ record, requester, canAccessProject }) {
    const request = record.request;
    assert(/^S(?:YN|FX)[-_][A-Z0-9_-]+$/u.test(request.project_code), 'SYNTHETIC_EXECUTION_ONLY');
    assert(request.requester === requester, 'AUTH_REQUIRED');
    const evidence = await intakeSources.evidence({ request, requester, canAccessProject });
    const eligibility = evaluateWorkClaimEligibility(request, { recorded_binding: record.binding, current_evidence: evidence });
    assert(eligibility.status === 'CLAIM_ELIGIBLE', eligibility.hold_code ?? 'CURRENT_RECHECK_REQUIRED');
    const current = await binding();
    const approvals = current.approvals.filter(row => row.request_basis_digest === workbenchExecutionRequestBasis(request));
    assert(approvals.length === 1, 'EXECUTION_APPROVAL_REQUIRED');
    const approval = approvals[0];
    assert(exact(approval, ['request_basis_digest', 'packet', 'roles', 'capabilities', 'assignment_policy', 'agent_projection',
      'authority_pin', 'authority_current', 'executor_current', 'executor_binding', 'task_authorization', 'linear',
      'executor_code_sha256', 'timeout_ms', 'synthetic_delay_ms'])
      && SHA.test(approval.executor_code_sha256) && Number.isSafeInteger(approval.timeout_ms) && approval.timeout_ms >= 10 && approval.timeout_ms <= 5000
      && Number.isSafeInteger(approval.synthetic_delay_ms) && approval.synthetic_delay_ms >= 0 && approval.synthetic_delay_ms <= 10000,
    'EXECUTION_APPROVAL_INVALID');
    const [packet, roles, capabilities, policy, projection, pin, authorityCurrent, executorCurrent, executorBinding, taskAuthorization] =
      await Promise.all(['packet', 'roles', 'capabilities', 'assignment_policy', 'agent_projection', 'authority_pin', 'authority_current',
        'executor_current', 'executor_binding', 'task_authorization'].map(key => read(approval[key])));
    assert(exact(approval.linear, ['root', 'expected_binding', 'issue_id']), 'LINEAR_SOURCE_UNAVAILABLE');
    const readerKey = digestOf(approval.linear);
    if (!readers.has(readerKey)) readers.set(readerKey, createLinearReadEvidenceReader({ root: approval.linear.root,
      expectedBinding: approval.linear.expected_binding, now: () => new Date(now()) }));
    const linear = await readers.get(readerKey).resolve({ issueId: approval.linear.issue_id });
    assert(linear.status === 'CURRENT' && linear.linear_task.task_status === 'Todo', 'LINEAR_CURRENT_TODO_REQUIRED');
    assert(same(linear.linear_task.task_ref, request.policy_refs.task_ref) && linear.linear_task.project_code === request.project_code
      && linear.read_receipt_digest === packet.linear_official_task_read_evidence?.read_receipt_digest, 'LINEAR_EXECUTION_RECEIPT_MISMATCH');
    // This separate task authorization is indispensable even when polling metadata is fresh.
    assert(exact(taskAuthorization, ['approval_ref', 'state', 'task_ref', 'project_scope_ref', 'authority_ref', 'assignment_epoch',
      'approved_task_status', 'read_receipt_digest', 'work_brief_content_sha256', 'observed_at', 'valid_until'])
      && taskAuthorization.state === 'approved' && same(taskAuthorization.task_ref, request.policy_refs.task_ref)
      && isSafeRef(taskAuthorization.approval_ref)
      && taskAuthorization.project_scope_ref === packet.execution_binding.project_scope_ref
      && taskAuthorization.authority_ref === packet.execution_binding.authority_ref
      && taskAuthorization.assignment_epoch === packet.execution_binding.assignment_epoch
      && taskAuthorization.approved_task_status === 'Todo' && taskAuthorization.read_receipt_digest === linear.read_receipt_digest
      && taskAuthorization.work_brief_content_sha256 === digestOf(packet.forge_issued_work_brief)
      && utc(taskAuthorization.observed_at) && utc(taskAuthorization.valid_until)
      && Date.parse(taskAuthorization.observed_at) <= now() && now() < Date.parse(taskAuthorization.valid_until), 'TASK_EXECUTION_AUTHORIZATION_REQUIRED');
    assert(packet.forge_issued_work_brief.input_bundle_manifest_digest === request.input_revision.slice(7), 'WORK_BRIEF_INPUT_REVISION_MISMATCH');
    assert(utc(packet.forge_issued_work_brief.expires_at) && now() < Date.parse(packet.forge_issued_work_brief.expires_at), 'WORK_BRIEF_NOT_CURRENT');
    const forge = admitForgeLinearExecutionPacket(packet);
    assert(forge.status === 'ADMITTED', forge.hold_code ?? 'FORGE_EXECUTION_ADMISSION_FAILED');
    assert(packet.execution_binding.parent_task_ref === null, 'DECOMPOSITION_NOT_BOUND');
    assert(roles.snapshot_ref?.content_sha256 === digestOf(roles.roles)
      && capabilities.snapshot_ref?.content_sha256 === digestOf(capabilities.actor_bindings), 'ORGANIZATION_SNAPSHOT_DIGEST_MISMATCH');
    const match = matchRoleCapabilities({ work_task_contract: forge.work_task_contract, role_snapshot: roles, capability_snapshot: capabilities });
    assert(match.state === 'candidate', match.hold_code ?? 'ROLE_CAPABILITY_MATCH_INVALID');
    const assignment = assignCandidate({ matcher_result: match, policy });
    assert(assignment.assignment_state === 'assigned', assignment.hold_code ?? 'ASSIGNMENT_NOT_READY');
    assert(utc(authorityCurrent.evaluated_at) && utc(executorCurrent.evaluated_at)
      && Date.parse(authorityCurrent.evaluated_at) <= now() && now() - Date.parse(authorityCurrent.evaluated_at) <= 60000
      && Date.parse(executorCurrent.evaluated_at) <= now() && now() - Date.parse(executorCurrent.evaluated_at) <= 60000
      && utc(pin.expires_at) && now() < Date.parse(pin.expires_at), 'EXECUTOR_AUTHORITY_NOT_CURRENT');
    const verified = verifyAgentWorkforceAuthorityClaim(projection, pin, authorityCurrent);
    assert(verified.status === 'VERIFIED_ACTIVE_BINDING', verified.hold_code ?? 'VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED');
    assert(executorBinding.executor_ref === 'executor.workbench.synthetic.v1'
      && executorBinding.requested_model === 'synthetic-code' && executorBinding.observed_model === 'synthetic-code'
      && executorBinding.requested_effort === 'none' && executorBinding.observed_effort === 'none'
      && same(executorBinding.authorized_tool_refs, ['tool.synthetic.compute'])
      && same(executorBinding.required_tool_refs, ['tool.synthetic.compute']), 'SYNTHETIC_EXECUTOR_BINDING_REQUIRED');
    const admission = admitCandidateExecutorAuthority({ candidate_packet: forge.candidate_packet, task_packet: forge.task_packet,
      assignment_packet: assignment, role_capability_match: match, verified_active_binding: verified,
      trusted_current_evaluation: executorCurrent, executor_binding: executorBinding });
    assert(admission.status === 'ADMITTED', admission.hold_code ?? 'EXECUTOR_AUTHORITY_ADMISSION_FAILED');
    const codeHash = `sha256:${createHash('sha256').update(await readFile(SYNTHETIC_WORKER_URL)).digest('hex')}`;
    assert(codeHash === approval.executor_code_sha256, 'SYNTHETIC_EXECUTOR_CODE_CHANGED');
    // Recheck pins and windows after all awaited reads. A revocation during IO is never green.
    await binding();
    const finalEvidence = await intakeSources.evidence({ request, requester, canAccessProject });
    assert(evaluateWorkClaimEligibility(request, { recorded_binding: record.binding, current_evidence: finalEvidence }).status === 'CLAIM_ELIGIBLE', 'CURRENT_RECHECK_REQUIRED');
    assert(now() < Date.parse(taskAuthorization.valid_until) && now() < Date.parse(pin.expires_at)
      && now() - Date.parse(executorCurrent.evaluated_at) <= 60000, 'EXECUTOR_AUTHORITY_NOT_CURRENT');
    await Promise.all(['packet', 'roles', 'capabilities', 'assignment_policy', 'agent_projection', 'authority_pin',
      'authority_current', 'executor_current', 'executor_binding', 'task_authorization'].map(key => read(approval[key])));
    const finalLinear = await readers.get(readerKey).resolve({ issueId: approval.linear.issue_id });
    assert(finalLinear.status === 'CURRENT' && finalLinear.linear_task.task_status === 'Todo'
      && finalLinear.read_receipt_digest === linear.read_receipt_digest, 'LINEAR_EXECUTION_RECEIPT_MISMATCH');
    await binding();
    assert(now() < Date.parse(current.valid_until) && now() < Date.parse(taskAuthorization.valid_until)
      && now() < Date.parse(pin.expires_at) && now() < Date.parse(packet.forge_issued_work_brief.expires_at)
      && now() - Date.parse(executorCurrent.evaluated_at) <= 60000 && now() - Date.parse(authorityCurrent.evaluated_at) <= 60000,
    'EXECUTOR_AUTHORITY_NOT_CURRENT');
    // Digest includes approved source files, execution code, recipe generation and all domain epochs.
    const basis = { request_basis_digest: workbenchExecutionRequestBasis(request), execution_binding_digest: bindingDigest,
      intake_binding_digest: intakeSources.approvedBundleDigest, work_brief_revision_ref: forge.work_brief_revision_ref,
      action_ref: forge.task_packet.action_ref, assignment, current_acl_epoch: finalEvidence.acl.epoch,
      current_agent_epoch: verified.current_authority_epoch, code_sha256: codeHash };
    return { binding_digest: bindingDigest, basis_digest: digestOf(basis),
      claim_key: digestOf({ task_ref: forge.task_ref, work_brief_revision_ref: forge.work_brief_revision_ref, action_ref: forge.task_packet.action_ref }),
      candidate_packet: forge.candidate_packet, task_packet: forge.task_packet, assignment_packet: assignment,
      authority_admission: admission, authority_epoch: verified.current_authority_epoch,
      timeout_ms: approval.timeout_ms, synthetic_delay_ms: approval.synthetic_delay_ms,
      executor_code_sha256: codeHash, generation: current.generation, linear_read_receipt_digest: linear.read_receipt_digest,
      work_brief_digest: forge.work_brief_revision_ref.content_sha256 };
  }
  return Object.freeze({ mode, authorize });
}

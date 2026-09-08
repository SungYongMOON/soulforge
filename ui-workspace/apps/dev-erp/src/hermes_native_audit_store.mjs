import { digestOf, guardEntry, isSafeRef } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { createProtectedWorkingBytes } from '../../../../guild_hall/shared/protected_working_bytes.mjs';

const SHA = /^sha256:[a-f0-9]{64}$/u;
const WORK = /^native-work\.[a-f0-9]{64}$/u;
const ROLES = Object.freeze({ instruction: { name: 'instruction.utf8', max: 65536, type: 'application/json' },
  output: { name: 'visible-output.utf8', max: 4 * 1024 * 1024, type: 'text/plain' } });
const fail = (code) => { throw Object.assign(new Error(code), { auditCode: code }); };
const check = (value, code) => { if (!value) fail(code); };
const CODES = Object.fromEntries(['unknownField', 'secret', 'localPath', 'tooDeep', 'tooLarge', 'hostileInput', 'accessor']
  .map((key) => [key, 'HERMES_NATIVE_AUDIT_METADATA_INVALID']));
const exact = (value, keys) => value && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const utc = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const refs = (value) => Array.isArray(value) && value.length <= 64 && value.every(isSafeRef);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const taskRef = (value) => exact(value, ['provider', 'task_id']) && isSafeRef(value.provider) && isSafeRef(value.task_id);
const snapshotRef = (value) => exact(value, ['revision_id', 'content_sha256'])
  && isSafeRef(value.revision_id) && SHA.test(value.content_sha256);
function validContext(value) {
  const brief = value?.brief_binding;
  const performer = value?.performer;
  const tools = value?.tool_authority;
  return exact(value, ['request_ref', 'requester_ref', 'entrypoint', 'brief_binding', 'performer', 'assignment_epoch',
    'authority_ref', 'tool_authority', 'capability_snapshot_ref', 'verification_refs', 'work_session_refs',
    'work_session_evidence', 'requested_toolsets', 'provider', 'recorded_at', 'operation_id', 'attempt_no',
    'fencing_epoch', 'executable_sha256', 'source_manifest_digest'])
    && ['request_ref', 'requester_ref', 'authority_ref', 'provider', 'operation_id'].every((key) => isSafeRef(value[key]))
    && ['native_cli', 'workbench'].includes(value.entrypoint) && utc(value.recorded_at)
    && ['assignment_epoch', 'attempt_no', 'fencing_epoch'].every((key) => count(value[key]) && value[key] > 0)
    && SHA.test(value.executable_sha256) && SHA.test(value.source_manifest_digest)
    && snapshotRef(value.capability_snapshot_ref) && refs(value.verification_refs) && refs(value.requested_toolsets)
    && Array.isArray(value.work_session_refs) && value.work_session_refs.length === 0 && value.work_session_evidence === 'NO_LINKED_RECEIPT'
    && exact(brief, ['task_ref', 'work_brief_revision_ref', 'brief_ref', 'assignment_ref', 'assignment_epoch',
      'project_scope_ref', 'action_ref', 'authority_ref', 'input_bundle_manifest_digest'])
    && taskRef(brief.task_ref) && exact(brief.work_brief_revision_ref, ['provider', 'task_id', 'revision_id', 'content_sha256'])
    && taskRef({ provider: brief.work_brief_revision_ref.provider, task_id: brief.work_brief_revision_ref.task_id })
    && isSafeRef(brief.work_brief_revision_ref.revision_id) && SHA.test(brief.work_brief_revision_ref.content_sha256)
    && ['brief_ref', 'assignment_ref', 'project_scope_ref', 'action_ref', 'authority_ref'].every((key) => isSafeRef(brief[key]))
    && count(brief.assignment_epoch) && /^[a-f0-9]{64}$/u.test(brief.input_bundle_manifest_digest)
    && exact(performer, ['family_ref', 'mark_ref', 'actor_ref', 'performing_agent_id', 'bot_ref', 'executor_ref',
      'profile_ref', 'session_ref', 'deployment_ref', 'deployment_digest', 'requested_model', 'requested_effort', 'observed_model', 'observed_effort'])
    && Object.entries(performer).every(([key, item]) => key === 'deployment_digest' ? SHA.test(item) : isSafeRef(item))
    && exact(tools, ['authority_ref', 'authority_epoch', 'policy_digest', 'authorized_tool_refs', 'required_tool_refs'])
    && isSafeRef(tools.authority_ref) && count(tools.authority_epoch) && SHA.test(tools.policy_digest)
    && refs(tools.authorized_tool_refs) && refs(tools.required_tool_refs);
}
function validEvidence(value) {
  const records = value?.tool_records;
  return exact(value, ['completed_at', 'outcome', 'reason_code', 'attempt_no', 'fencing_epoch', 'operation_id',
    'instruction_sha256', 'stdin_release_intent', 'pipe_write_completed', 'program_input_receipt', 'model_input_receipt',
    'stdout_sha256', 'stderr_sha256', 'cli_exit_code', 'capture_state', 'observed_effort', 'external_effects',
    'session_recorded_model', 'session_recorded_provider', 'model_execution_receipt',
    'session_metadata_digest', 'tool_observation', 'tool_records', 'verification_refs', 'candidate_custody', 'human_accepted'])
    && utc(value.completed_at) && ['response_observed', 'hold'].includes(value.outcome)
    && (value.reason_code === null || /^[A-Z][A-Z0-9_]{0,95}$/u.test(value.reason_code))
    && count(value.attempt_no) && value.attempt_no > 0 && count(value.fencing_epoch) && value.fencing_epoch > 0
    && isSafeRef(value.operation_id) && SHA.test(value.instruction_sha256)
    && typeof value.stdin_release_intent === 'boolean' && typeof value.pipe_write_completed === 'boolean'
    && value.program_input_receipt === 'UNCONFIRMED' && value.model_input_receipt === 'UNCONFIRMED'
    && ['stdout_sha256', 'stderr_sha256', 'session_metadata_digest'].every((key) => value[key] === null || SHA.test(value[key]))
    && (value.cli_exit_code === null || count(value.cli_exit_code))
    && ['NOT_STARTED', 'closed', 'spawn_error', 'timeout', 'oversized', 'pre_release_drift', 'cancelled'].includes(value.capture_state)
    && value.observed_effort === 'UNKNOWN' && value.external_effects === 'UNKNOWN'
    && ['session_recorded_model', 'session_recorded_provider'].every((key) => value[key] === null || isSafeRef(value[key]))
    && value.model_execution_receipt === 'UNCONFIRMED'
    && ['UNKNOWN', 'SESSION_METADATA_ONLY'].includes(value.tool_observation)
    && (records === null || (Array.isArray(records) && records.length <= 256 && records.every((row) =>
      exact(row, ['source_ref', 'session_ref', 'message_row_id', 'tool_call_ref', 'tool_name', 'phase', 'occurred_at',
        'recorded_effect_disposition', 'input_payload_digest', 'output_payload_digest', 'actual_effect', 'actual_success'])
      && isSafeRef(row.source_ref) && isSafeRef(row.session_ref) && count(row.message_row_id)
      && (row.tool_call_ref === null || isSafeRef(row.tool_call_ref)) && (row.tool_name === null || isSafeRef(row.tool_name))
      && ['request_observed', 'result_row_observed'].includes(row.phase) && (row.occurred_at === null || utc(row.occurred_at))
      && [null, 'none', 'unknown'].includes(row.recorded_effect_disposition)
      && row.input_payload_digest === null && row.output_payload_digest === null
      && row.actual_effect === 'UNKNOWN' && row.actual_success === 'UNKNOWN')))
    && refs(value.verification_refs) && value.candidate_custody === false && value.human_accepted === false;
}
export function validateHermesNativeTrace(trace) {
  const checked = guardEntry(trace, ['audit_ref', 'header_digest', 'instruction_snapshot', 'audit_digest', 'output_snapshot'], CODES);
  check(checked.status === 'OK', 'HERMES_NATIVE_AUDIT_METADATA_INVALID');
  const value = checked.value;
  check(WORK.test(value.audit_ref) && SHA.test(value.header_digest)
    && (value.audit_digest === undefined || SHA.test(value.audit_digest)), 'HERMES_NATIVE_AUDIT_METADATA_INVALID');
  for (const [role, descriptor] of [['instruction', value.instruction_snapshot], ['output', value.output_snapshot]]) {
    if (role === 'output' && (descriptor === null || descriptor === undefined)) continue;
    check(descriptor && Object.keys(descriptor).length === 5 && descriptor.artifact_ref === `${value.audit_ref}.${role}`
      && descriptor.role === role && SHA.test(descriptor.content_sha256) && Number.isSafeInteger(descriptor.size)
      && descriptor.size > 0 && descriptor.size <= ROLES[role].max && descriptor.media_type === ROLES[role].type,
    'HERMES_NATIVE_AUDIT_METADATA_INVALID');
  }
  return value;
}

// Small working-artifact adapter using the existing owner-approved worksite,
// create-only and hash-readback boundaries. The report artifact adapter has a
// different fixed-role contract, and ERP artifact upload would publish a canon
// pointer; neither is silently repurposed for these request-local snapshots.
export function createHermesNativeAuditStore({ root, storage_class, owner_approval_ref,
  repository_root, backup_policy_ref, read_capability_ref } = {}) {
  check(isSafeRef(backup_policy_ref) && read_capability_ref === 'capability.native-execution-log.read',
  'HERMES_NATIVE_AUDIT_BINDING_REQUIRED');
  const port = createProtectedWorkingBytes({ root, repositoryRoot: repository_root,
    storageClass: storage_class, ownerApprovalRef: owner_approval_ref,
    roles: { ...Object.fromEntries(Object.entries(ROLES).map(([role, spec]) => [role,
      { filename: spec.name, maxBytes: spec.max, mediaType: spec.type }])),
    instruction_receipt: { filename: 'instruction-receipt.json', maxBytes: 128 * 1024, mediaType: 'application/json' },
    execution_receipt: { filename: 'execution-receipt.json', maxBytes: 128 * 1024, mediaType: 'application/json' } } });
  function metadata(value) {
    const result = guardEntry(value, Object.keys(value ?? {}), CODES);
    check(result.status === 'OK', 'HERMES_NATIVE_AUDIT_METADATA_INVALID');
    return result.value;
  }
  async function writeMetadata(workId, role, value) {
    return port.writeRole({ groupId: workId, role, bytes: Buffer.from(JSON.stringify(metadata(value))) });
  }
  async function readMetadata(workId, role, expectedSha256) {
    const { bytes } = await port.readRole({ groupId: workId, role, expectedSha256 });
    return metadata(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  }
  const artifact = (workId, role, observed) => ({ artifact_ref: `${workId}.${role}`, role,
    content_sha256: observed.sha256, size: observed.size, media_type: ROLES[role].type });
  return Object.freeze({
    async begin({ work_id, context, instruction }) {
      const safeContext = metadata(context);
      check(validContext(safeContext) && WORK.test(work_id) && Buffer.isBuffer(instruction) && instruction.length > 0,
        'HERMES_NATIVE_AUDIT_INPUT_INVALID');
      await port.createGroup(work_id);
      const snapshot = artifact(work_id, 'instruction', await port.writeRole({ groupId: work_id, role: 'instruction', bytes: instruction }));
      const header = { work_id, context: safeContext, instruction_snapshot: snapshot,
        storage_class, owner_approval_ref, backup_policy_ref, read_capability_ref,
        canonical_acceptance: false, model_input_receipt: 'UNCONFIRMED' };
      const persisted = await writeMetadata(work_id, 'instruction_receipt', header);
      return { audit_ref: work_id, header_digest: persisted.sha256, instruction_snapshot: snapshot };
    },
    async finalize({ work_id, expected_header_digest, output, evidence }) {
      check(validEvidence(metadata(evidence)), 'HERMES_NATIVE_AUDIT_METADATA_INVALID');
      const header = await readMetadata(work_id, 'instruction_receipt', expected_header_digest);
      check(evidence.completed_at >= header.context.recorded_at, 'HERMES_NATIVE_AUDIT_CLOCK_INVALID');
      const snapshot = Buffer.isBuffer(output) && output.length > 0
        ? artifact(work_id, 'output', await port.writeRole({ groupId: work_id, role: 'output', bytes: output })) : null;
      const final = { work_id, instruction_snapshot: header.instruction_snapshot, output_snapshot: snapshot,
        evidence: metadata(evidence), canonical_acceptance: false, model_input_receipt: 'UNCONFIRMED' };
      const persisted = await writeMetadata(work_id, 'execution_receipt', final);
      return { audit_ref: work_id, audit_digest: persisted.sha256, instruction_snapshot: header.instruction_snapshot,
        output_snapshot: snapshot };
    },
    async read({ work_id, expected_header_digest, expected_audit_digest = null, role = null }) {
      check(WORK.test(work_id) && SHA.test(expected_header_digest) && (expected_audit_digest === null || SHA.test(expected_audit_digest)),
        'HERMES_NATIVE_AUDIT_PIN_REQUIRED');
      const header = await readMetadata(work_id, 'instruction_receipt', expected_header_digest);
      check(header.work_id === work_id && validContext(header.context), 'HERMES_NATIVE_AUDIT_WORK_MISMATCH');
      let final = null;
      if (expected_audit_digest !== null) {
        final = await readMetadata(work_id, 'execution_receipt', expected_audit_digest);
        check(final.work_id === work_id && validEvidence(final.evidence)
          && digestOf(final.instruction_snapshot) === digestOf(header.instruction_snapshot),
          'HERMES_NATIVE_AUDIT_WORK_MISMATCH');
      }
      if (role === null) return { header, final, state: final ? 'RECORDED' : 'INCOMPLETE_UNKNOWN' };
      check(Object.hasOwn(ROLES, role), 'HERMES_NATIVE_AUDIT_ROLE_FORBIDDEN');
      const descriptor = role === 'instruction' ? header.instruction_snapshot : final?.output_snapshot;
      check(descriptor?.artifact_ref === `${work_id}.${role}`, 'HERMES_NATIVE_AUDIT_ARTIFACT_UNAVAILABLE');
      const { bytes } = await port.readRole({ groupId: work_id, role, expectedSha256: descriptor.content_sha256, expectedSize: descriptor.size });
      return { bytes, descriptor };
    },
  });
}

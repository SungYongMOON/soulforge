import path from 'node:path';
import { admitCandidateExecutorAuthority } from './candidate_execution_authority_adapter.mjs';
import { admitForgeLinearExecutionPacket } from './forge_linear_execution_packet_admission.mjs';
import { createHermesNativeChatExecutor, HERMES_NATIVE_EXECUTOR_REF } from './hermes_native_chat_executor.mjs';
import { createHermesNativeAttemptStore } from './hermes_native_attempt_store.mjs';
import { digestOf, deepFreeze, guardEntry } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const hold = (code) => Object.freeze({ status: 'HOLD', hold_code: code });
const same = (a, b) => digestOf(a) === digestOf(b);
const CODES = Object.fromEntries(['tooDeep', 'accessor', 'tooLarge', 'hostileInput',
  'unknownField', 'secret', 'localPath'].map((key) => [key, 'HERMES_NATIVE_METADATA_INVALID']));

// Called at the existing Forge admission boundary, where its body was already
// authorized to be read. Only this projection crosses into the preflight path.
export function projectHermesNativeBriefBinding(admission) {
  try {
    const { admission_digest: digest, ...body } = admission;
    if (admission.status !== 'ADMITTED' || digestOf(body) !== digest
      || admission.schema_version !== 'soulforge.forge_linear_execution_packet_admission.v0') {
      return hold('HERMES_NATIVE_FORGE_ADMISSION_INVALID');
    }
    return deepFreeze({
      task_ref: structuredClone(admission.task_ref),
      work_brief_revision_ref: structuredClone(admission.work_brief_revision_ref),
      brief_ref: admission.forge_binding_refs.brief_ref,
      assignment_ref: admission.assignment_binding.assignment_ref,
      assignment_epoch: admission.assignment_binding.assignment_epoch,
      project_scope_ref: admission.project_scope_ref,
      action_ref: admission.task_packet.action_ref,
      authority_ref: admission.task_packet.authority_ref,
      input_bundle_manifest_digest: admission.issued_work_brief_bindings.input_bundle_manifest_digest,
    });
  } catch { return hold('HERMES_NATIVE_FORGE_ADMISSION_INVALID'); }
}

const authorityBasis = (admitted) => ({
  task_ref: admitted.task_ref,
  work_brief_revision_ref: admitted.work_brief_revision_ref,
  action_ref: admitted.action_ref,
  authority_ref: admitted.authority_ref,
  assignment_policy_revision_ref: admitted.assignment_policy_revision_ref,
  assignment_epoch: admitted.assignment_epoch,
  project_scope_ref: admitted.project_scope_ref,
  role_snapshot_ref: admitted.role_snapshot_ref,
  capability_snapshot_ref: admitted.capability_snapshot_ref,
  responsible_role_ref: admitted.responsible_role_ref,
  required_capability_refs: admitted.required_capability_refs,
  executor_binding: admitted.executor_binding,
  tool_authority: admitted.tool_authority,
  verified_active_binding_receipt_digest: admitted.verified_active_binding_receipt_digest,
});

// This is the product caller, not a test-only factory. Current-state resolvers
// are trusted authority/provider boundaries; a UI request, CLI self-assertion or
// feature flag is not a replacement. No profile/config/key is read by this binder.
export function bindHermesNativeRuntime({
  feature_enabled = false, authority_request, brief_binding, runtime_binding,
  resolveCurrentState, resolveWorkBrief, attempt_directory, now = Date.now,
  max_current_age_ms = 5000, ...executorOptions
} = {}) {
  try {
    const initial = admitCandidateExecutorAuthority(authority_request);
    if (initial.status !== 'ADMITTED') return initial;
    const guardedBrief = guardEntry(brief_binding, ['task_ref', 'work_brief_revision_ref',
      'brief_ref', 'assignment_ref', 'assignment_epoch', 'project_scope_ref', 'action_ref', 'authority_ref', 'input_bundle_manifest_digest'], CODES);
    if (guardedBrief.status !== 'OK') return guardedBrief;
    const brief = deepFreeze(guardedBrief.value);
    const runtime = deepFreeze(structuredClone(runtime_binding));
    const selected = initial.executor_binding;
    if (selected.executor_ref !== HERMES_NATIVE_EXECUTOR_REF
      || !same(initial.task_ref, brief.task_ref)
      || !same(initial.work_brief_revision_ref, brief.work_brief_revision_ref)
      || brief.brief_ref !== brief.work_brief_revision_ref.revision_id
      || initial.assignment_epoch !== brief.assignment_epoch
      || initial.project_scope_ref !== brief.project_scope_ref
      || initial.action_ref !== brief.action_ref || initial.authority_ref !== brief.authority_ref
      || !['performing_agent_id', 'bot_ref', 'executor_ref', 'profile_ref', 'session_ref',
        'deployment_ref', 'deployment_digest'].every((key) => runtime[key] === selected[key])
      || runtime.expected_model !== selected.requested_model
      || runtime.expected_effort !== selected.requested_effort) {
      return hold('HERMES_NATIVE_RUNTIME_BINDING_MISMATCH');
    }
    if (typeof resolveCurrentState !== 'function' || typeof resolveWorkBrief !== 'function'
      || !Number.isSafeInteger(max_current_age_ms) || max_current_age_ms < 1
      || max_current_age_ms > 60_000) return hold('HERMES_NATIVE_RESOLVER_REQUIRED');
    const basis = deepFreeze(authorityBasis(initial));
    const issued = deepFreeze({ task_packet: structuredClone(authority_request.task_packet),
      assignment_packet: structuredClone(authority_request.assignment_packet), brief_binding: brief });
    const capability = deepFreeze({
      protocol: 'hermes.native_chat.v1', supported: true,
      executor_ref: selected.executor_ref,
      capability_snapshot_ref: initial.capability_snapshot_ref,
      profile_ref: runtime.profile_ref, profile_name: runtime.profile_name,
      session_ref: runtime.session_ref, session_id: runtime.session_id,
      hermes_home_digest: digestOf(runtime.HERMES_HOME),
      executable_sha256: runtime.executable_sha256,
      source_manifest_digest: digestOf(runtime.source_pins),
      model: runtime.expected_model, effort: runtime.expected_effort,
      provider: runtime.provider, toolsets: runtime.toolsets,
      effective_tool_refs: initial.tool_authority.authorized_tool_refs,
      tool_policy_digest: initial.tool_authority.policy_digest,
    });
    const store = createHermesNativeAttemptStore({ directory: attempt_directory });
    const current = async () => {
      const value = await resolveCurrentState(deepFreeze({ brief_binding: brief, runtime_capability: capability }));
      const guarded = guardEntry(value, ['authority_request', 'brief_binding', 'runtime_capability'], CODES);
      if (guarded.status !== 'OK') return false;
      const state = guarded.value;
      const admission = admitCandidateExecutorAuthority(state.authority_request);
      if (admission.status !== 'ADMITTED' || !same(authorityBasis(admission), basis)
        || !same(state.authority_request.task_packet, issued.task_packet)
        || !same(state.authority_request.assignment_packet, issued.assignment_packet)
        || !same(state.brief_binding, brief)) return false;
      const proof = state.runtime_capability;
      const { evaluated_at, expires_at, ...evidence } = proof ?? {};
      const clock = now();
      const evaluated = Date.parse(evaluated_at);
      const expires = Date.parse(expires_at);
      const authorityTime = Date.parse(admission.trusted_current_evaluated_at);
      return Number.isSafeInteger(clock) && Number.isFinite(evaluated) && Number.isFinite(expires)
        && clock >= evaluated && clock - evaluated <= max_current_age_ms && clock < expires
        && clock >= authorityTime && clock - authorityTime <= max_current_age_ms
        && clock < Date.parse(state.authority_request.verified_active_binding.expires_at)
        && same(evidence, capability);
    };
    const readIssuedBrief = async () => {
      const source = await resolveWorkBrief(brief.work_brief_revision_ref);
      const admitted = admitForgeLinearExecutionPacket(source);
      if (admitted.status !== 'ADMITTED' || !same(projectHermesNativeBriefBinding(admitted), brief)
        || !same(admitted.task_packet, issued.task_packet)
        || now() >= Date.parse(source.forge_issued_work_brief.expires_at)) {
        throw new Error('issued brief changed');
      }
      // The source digest binds all issued fields, including id and expiry;
      // render those exact fields instead of trusting an unrelated prompt string.
      return JSON.stringify(source.forge_issued_work_brief);
    };
    const executor = createHermesNativeChatExecutor({ ...executorOptions, feature_enabled,
      runtime_binding: runtime, issued, verifyCurrent: current, resolveWorkBrief: readIssuedBrief,
      attemptStore: store, now });
    return Object.freeze({ status: 'BOUND', executor_ref: HERMES_NATIVE_EXECUTOR_REF,
      executor, database_path: path.join(runtime.HERMES_HOME, 'state.db') });
  } catch { return hold('HERMES_NATIVE_RUNTIME_BINDING_INVALID'); }
}

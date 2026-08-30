import {
  VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA,
} from "../../../../guild_hall/agent_observation/agent_authority_verification.mjs";
import {
  deepFreeze,
  digestOf,
  guardEntry,
  isDenseArray,
  isPlainObject,
  isSafeRef,
  isUtcMs,
  unknownKeyIn,
} from "../../../../guild_hall/agent_observation/guard_primitives.mjs";

export const CANDIDATE_EXECUTION_AUTHORITY_ADMISSION_SCHEMA =
  "soulforge.candidate_execution.authority_admission_receipt.v0";
export const TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA =
  "soulforge.candidate_execution.trusted_executor_current_evaluation.v0";
export const EXECUTOR_AUTHORITY_BINDING_SCHEMA =
  "soulforge.candidate_execution.executor_authority_binding.v0";

const CANDIDATE_SCHEMA = "soulforge.candidate_execution.candidate_packet.v1";
const TASK_SCHEMA = "soulforge.candidate_execution.task_packet.v1";
const ASSIGNMENT_SCHEMA = "soulforge.assignment_policy.assignment_packet.v1";
const MATCH_SCHEMA = "soulforge.role_capability.match_result.v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const MAX_LIST = 64;

export const CANDIDATE_EXECUTION_AUTHORITY_HOLD_CODES = Object.freeze({
  REQUEST_INVALID: "AUTHORITY_ADMISSION_REQUEST_INVALID",
  SECRET_FORBIDDEN: "AUTHORITY_ADMISSION_SECRET_FORBIDDEN",
  LOCAL_PATH_FORBIDDEN: "AUTHORITY_ADMISSION_LOCAL_PATH_FORBIDDEN",
  INPUT_TOO_DEEP: "AUTHORITY_ADMISSION_INPUT_TOO_DEEP",
  INPUT_TOO_LARGE: "AUTHORITY_ADMISSION_INPUT_TOO_LARGE",
  HOSTILE_INPUT: "AUTHORITY_ADMISSION_HOSTILE_INPUT",
  ACCESSOR_FORBIDDEN: "AUTHORITY_ADMISSION_ACCESSOR_FORBIDDEN",
  CANDIDATE_PACKET_INVALID: "CANDIDATE_PACKET_INVALID",
  TASK_PACKET_INVALID: "TASK_PACKET_INVALID",
  ASSIGNMENT_PACKET_INVALID: "ASSIGNMENT_PACKET_INVALID",
  ROLE_CAPABILITY_MATCH_INVALID: "ROLE_CAPABILITY_MATCH_INVALID",
  EXECUTOR_BINDING_INVALID: "EXECUTOR_BINDING_INVALID",
  VERIFIED_BINDING_REQUIRED: "VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED",
  VERIFIED_BINDING_DIGEST_MISMATCH: "VERIFIED_AGENT_ACTIVE_BINDING_DIGEST_MISMATCH",
  TRUSTED_CURRENT_EVALUATION_REQUIRED: "TRUSTED_CURRENT_EVALUATION_REQUIRED",
  AUTHORITY_EXPIRED: "VERIFIED_AGENT_ACTIVE_BINDING_EXPIRED",
  AUTHORITY_REVOKED: "VERIFIED_AGENT_ACTIVE_BINDING_REVOKED",
  AUTHORITY_EPOCH_STALE: "AUTHORITY_EPOCH_STALE",
  ASSIGNMENT_EPOCH_STALE: "ASSIGNMENT_EPOCH_STALE",
  DUPLICATE_ACTIVE_SLOT: "DUPLICATE_ACTIVE_SLOT",
  EXECUTION_BASIS_MISMATCH: "EXECUTION_BASIS_MISMATCH",
  PROJECT_SCOPE_MISMATCH: "PROJECT_SCOPE_MISMATCH",
  ROLE_CAPABILITY_MISMATCH: "ROLE_CAPABILITY_MISMATCH",
  AGENT_BINDING_MISMATCH: "AGENT_BINDING_MISMATCH",
  TOOL_AUTHORITY_MISMATCH: "TOOL_AUTHORITY_MISMATCH",
  MODEL_BINDING_MISMATCH: "MODEL_BINDING_MISMATCH",
  EFFORT_BINDING_MISMATCH: "EFFORT_BINDING_MISMATCH",
});

const H = CANDIDATE_EXECUTION_AUTHORITY_HOLD_CODES;
const ENTRY_CODES = Object.freeze({
  unknownField: H.REQUEST_INVALID,
  secret: H.SECRET_FORBIDDEN,
  localPath: H.LOCAL_PATH_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
  tooLarge: H.INPUT_TOO_LARGE,
  hostileInput: H.HOSTILE_INPUT,
  accessor: H.ACCESSOR_FORBIDDEN,
});

const REQUEST_FIELDS = Object.freeze([
  "candidate_packet", "task_packet", "assignment_packet", "role_capability_match",
  "verified_active_binding", "trusted_current_evaluation", "executor_binding",
]);
const CANDIDATE_FIELDS = Object.freeze([
  "schema_version", "validation_state", "selection_state", "candidate_ref",
  "label_prefilter_passed", "task_ref", "work_brief_revision_ref", "action_ref",
  "authority_ref",
]);
const TASK_FIELDS = Object.freeze([
  "schema_version", "validation_state", "task_class", "task_status", "task_ref",
  "parent_task_ref", "work_brief_revision_ref", "action_ref", "authority_ref",
  "coverage_refs",
]);
const ASSIGNMENT_FIELDS = Object.freeze([
  "schema_version", "validation_state", "assignment_state", "policy_mode",
  "policy_revision_ref", "task_ref", "work_brief_revision_ref", "action_ref",
  "authority_ref", "responsible_role_ref", "performer_binding",
]);
const PERFORMER_FIELDS = Object.freeze([
  "actor_ref", "performing_agent_id", "bot_ref", "executor_ref",
  "capability_snapshot_ref",
]);
const MATCH_FIELDS = Object.freeze([
  "schema_version", "state", "hold_code", "task_ref", "work_brief_revision_ref",
  "action_ref", "authority_ref", "role_snapshot_ref", "capability_snapshot_ref",
  "responsible_role_ref", "responsible_actor_ref", "required_capability_refs",
  "missing_capability_refs", "candidates",
]);
const MATCH_CANDIDATE_FIELDS = Object.freeze([
  "actor_ref", "performing_agent_id", "bot_ref", "executor_ref", "match_reason_refs",
]);
const VERIFIED_BINDING_FIELDS = Object.freeze([
  "schema_version", "status", "verification_receipt_ref", "trusted_pin_ref",
  "approval_claim_digest", "authority_receipt_ref", "authority_receipt_digest",
  "claim_ceiling", "owner_ref", "authority_ref", "verifier_ref",
  "authority_state_evaluation_ref", "authority_evaluated_at", "current_authority_epoch",
  "project_scope_ref", "lineage_digest", "family_ref", "family_digest", "mark_ref",
  "mark_digest", "deployment_ref", "deployment_digest", "memory_generation_ref",
  "memory_digest", "issued_at", "verified_at", "expires_at", "receipt_epoch",
  "trusted_authority_epoch", "effect_boundary", "receipt_digest",
]);
const VERIFIED_EFFECT_FIELDS = Object.freeze([
  "catalog_mutation", "persistence_write", "runtime_or_task_call",
  "approval_or_promotion", "external_or_clock_call", "receipt_body_read",
]);
const CURRENT_FIELDS = Object.freeze([
  "schema_version", "status", "evaluation_ref", "evaluated_at",
  "authority_state_evaluation_ref", "authority_ref", "current_authority_epoch",
  "project_scope_ref", "current_assignment_epoch", "active_slot_state", "active_run_ref",
  "revoked_binding_refs", "family_ref", "mark_ref", "performing_agent_id", "bot_ref",
  "executor_ref", "profile_ref", "session_ref", "deployment_ref", "deployment_digest",
  "role_snapshot_ref", "capability_snapshot_ref", "responsible_role_ref", "actor_ref",
  "required_capability_refs", "observed_model", "observed_effort", "tool_authority_ref",
  "tool_authority_epoch", "tool_policy_digest", "authorized_tool_refs",
]);
const BINDING_FIELDS = Object.freeze([
  "schema_version", "assignment_epoch", "project_scope_ref", "family_ref", "mark_ref",
  "role_snapshot_ref", "capability_snapshot_ref", "responsible_role_ref",
  "required_capability_refs", "actor_ref", "performing_agent_id", "bot_ref",
  "executor_ref", "profile_ref", "session_ref", "deployment_ref", "deployment_digest",
  "requested_model", "requested_effort", "observed_model", "observed_effort",
  "tool_authority_ref", "tool_authority_epoch", "tool_policy_digest",
  "authorized_tool_refs", "required_tool_refs",
]);

const hold = (holdCode) => deepFreeze({ status: "HOLD", hold_code: holdCode });
const exact = (value, fields) => isPlainObject(value)
  && unknownKeyIn(value, fields) === null
  && Object.keys(value).length === fields.length
  && fields.every((field) => Object.hasOwn(value, field));
const digestRef = (value) => typeof value === "string" && SHA256.test(value);
const safeId = (value) => typeof value === "string" && SAFE_ID.test(value) && isSafeRef(value);
const safeEpoch = (value) => Number.isSafeInteger(value) && value >= 0;
const exactUtcMs = (value) => {
  if (!isUtcMs(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};

function safeList(value, { allowEmpty = false, sorted = false } = {}) {
  if (!isDenseArray(value) || value.length > MAX_LIST || (!allowEmpty && value.length === 0)
    || !value.every(isSafeRef) || new Set(value).size !== value.length) return false;
  if (sorted) {
    for (let index = 1; index < value.length; index += 1) {
      if (value[index - 1] > value[index]) return false;
    }
  }
  return true;
}

function idList(value, options = {}) {
  return safeList(value, options) && value.every(safeId);
}

function snapshotRef(value) {
  return exact(value, ["revision_id", "content_sha256"])
    && safeId(value.revision_id) && digestRef(value.content_sha256);
}

function taskRef(value) {
  return exact(value, ["provider", "task_id"])
    && safeId(value.provider) && safeId(value.task_id);
}

function revisionRef(value, expectedTaskRef) {
  return exact(value, ["provider", "task_id", "revision_id", "content_sha256"])
    && value.provider === expectedTaskRef.provider && value.task_id === expectedTaskRef.task_id
    && safeId(value.revision_id) && digestRef(value.content_sha256);
}

const sameTask = (left, right) => left?.provider === right?.provider
  && left?.task_id === right?.task_id;
const sameRevision = (left, right) => sameTask(left, right)
  && left?.revision_id === right?.revision_id
  && left?.content_sha256 === right?.content_sha256;
const sameSnapshot = (left, right) => left?.revision_id === right?.revision_id
  && left?.content_sha256 === right?.content_sha256;
const sameSet = (left, right) => left.length === right.length
  && left.every((entry) => right.includes(entry));

function validCandidate(candidate) {
  return exact(candidate, CANDIDATE_FIELDS) && candidate.schema_version === CANDIDATE_SCHEMA
    && candidate.validation_state === "prevalidated" && candidate.selection_state === "candidate"
    && candidate.label_prefilter_passed === true && safeId(candidate.candidate_ref)
    && taskRef(candidate.task_ref) && revisionRef(candidate.work_brief_revision_ref, candidate.task_ref)
    && safeId(candidate.action_ref) && safeId(candidate.authority_ref);
}

function validTask(task) {
  return exact(task, TASK_FIELDS) && task.schema_version === TASK_SCHEMA
    && task.validation_state === "prevalidated" && task.task_class === "official"
    && task.task_status === "Todo" && taskRef(task.task_ref)
    && (task.parent_task_ref === null || taskRef(task.parent_task_ref))
    && (task.parent_task_ref === null || !sameTask(task.parent_task_ref, task.task_ref))
    && revisionRef(task.work_brief_revision_ref, task.task_ref)
    && safeId(task.action_ref) && safeId(task.authority_ref)
    && idList(task.coverage_refs);
}

function validAssignment(assignment) {
  if (!exact(assignment, ASSIGNMENT_FIELDS) || assignment.schema_version !== ASSIGNMENT_SCHEMA
    || assignment.validation_state !== "prevalidated" || assignment.assignment_state !== "assigned"
    || assignment.policy_mode !== "responsible_ceo_triage"
    || !snapshotRef(assignment.policy_revision_ref) || !taskRef(assignment.task_ref)
    || !revisionRef(assignment.work_brief_revision_ref, assignment.task_ref)
    || !safeId(assignment.action_ref) || !safeId(assignment.authority_ref)
    || !safeId(assignment.responsible_role_ref)) return false;
  const performer = assignment.performer_binding;
  return exact(performer, PERFORMER_FIELDS) && safeId(performer.actor_ref)
    && safeId(performer.performing_agent_id) && safeId(performer.bot_ref)
    && safeId(performer.executor_ref) && snapshotRef(performer.capability_snapshot_ref);
}

function validMatch(match) {
  if (!exact(match, MATCH_FIELDS) || match.schema_version !== MATCH_SCHEMA
    || match.state !== "candidate" || match.hold_code !== null
    || !taskRef(match.task_ref) || !revisionRef(match.work_brief_revision_ref, match.task_ref)
    || !safeId(match.action_ref) || !safeId(match.authority_ref)
    || !snapshotRef(match.role_snapshot_ref) || !snapshotRef(match.capability_snapshot_ref)
    || !safeId(match.responsible_role_ref) || !safeId(match.responsible_actor_ref)
    || !idList(match.required_capability_refs) || !idList(match.missing_capability_refs, { allowEmpty: true })
    || match.missing_capability_refs.length !== 0 || !isDenseArray(match.candidates)
    || match.candidates.length === 0 || match.candidates.length > MAX_LIST) return false;
  return match.candidates.every((candidate) => exact(candidate, MATCH_CANDIDATE_FIELDS)
    && [candidate.actor_ref, candidate.performing_agent_id, candidate.bot_ref,
      candidate.executor_ref].every(safeId)
    && idList(candidate.match_reason_refs)
    && sameSet(candidate.match_reason_refs, match.required_capability_refs));
}

function validVerifiedBinding(receipt) {
  if (!exact(receipt, VERIFIED_BINDING_FIELDS)
    || receipt.schema_version !== VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA
    || receipt.status !== "VERIFIED_ACTIVE_BINDING" || receipt.claim_ceiling !== "validated_private"
    || ![receipt.verification_receipt_ref, receipt.trusted_pin_ref, receipt.authority_receipt_ref,
      receipt.owner_ref, receipt.authority_ref, receipt.verifier_ref,
      receipt.authority_state_evaluation_ref, receipt.project_scope_ref, receipt.family_ref,
      receipt.mark_ref, receipt.deployment_ref, receipt.memory_generation_ref].every(isSafeRef)
    || ![receipt.approval_claim_digest, receipt.authority_receipt_digest, receipt.lineage_digest,
      receipt.family_digest, receipt.mark_digest, receipt.deployment_digest, receipt.memory_digest,
      receipt.receipt_digest].every(digestRef)
    || ![receipt.authority_evaluated_at, receipt.issued_at, receipt.verified_at,
      receipt.expires_at].every(exactUtcMs)
    || !safeEpoch(receipt.current_authority_epoch) || !safeEpoch(receipt.receipt_epoch)
    || !safeEpoch(receipt.trusted_authority_epoch)
    || receipt.current_authority_epoch !== receipt.receipt_epoch
    || receipt.receipt_epoch !== receipt.trusted_authority_epoch
    || receipt.verified_at < receipt.issued_at
    || receipt.authority_evaluated_at < receipt.verified_at
    || receipt.authority_evaluated_at >= receipt.expires_at
    || !exact(receipt.effect_boundary, VERIFIED_EFFECT_FIELDS)
    || VERIFIED_EFFECT_FIELDS.some((field) => receipt.effect_boundary[field] !== false)) return false;
  const { receipt_digest: ignored, ...body } = receipt;
  return receipt.receipt_digest === digestOf(body);
}

function validCurrent(evaluation) {
  if (!exact(evaluation, CURRENT_FIELDS)
    || evaluation.schema_version !== TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA
    || evaluation.status !== "TRUSTED_CURRENT"
    || ![evaluation.evaluation_ref, evaluation.authority_state_evaluation_ref,
      evaluation.authority_ref, evaluation.project_scope_ref, evaluation.family_ref,
      evaluation.mark_ref, evaluation.profile_ref, evaluation.session_ref,
      evaluation.deployment_ref, evaluation.tool_authority_ref].every(isSafeRef)
    || ![evaluation.performing_agent_id, evaluation.bot_ref, evaluation.executor_ref,
      evaluation.responsible_role_ref, evaluation.actor_ref].every(safeId)
    || !exactUtcMs(evaluation.evaluated_at) || !safeEpoch(evaluation.current_authority_epoch)
    || !safeEpoch(evaluation.current_assignment_epoch)
    || !["idle", "active"].includes(evaluation.active_slot_state)
    || (evaluation.active_slot_state === "idle" && evaluation.active_run_ref !== null)
    || (evaluation.active_slot_state === "active" && !isSafeRef(evaluation.active_run_ref))
    || !safeList(evaluation.revoked_binding_refs, { allowEmpty: true, sorted: true })
    || !digestRef(evaluation.deployment_digest) || !snapshotRef(evaluation.role_snapshot_ref)
    || !snapshotRef(evaluation.capability_snapshot_ref)
    || !idList(evaluation.required_capability_refs)
    || !isObservedValue(evaluation.observed_model) || !isObservedValue(evaluation.observed_effort)
    || !safeEpoch(evaluation.tool_authority_epoch) || !digestRef(evaluation.tool_policy_digest)
    || !safeList(evaluation.authorized_tool_refs, { allowEmpty: true, sorted: true })) {
    return false;
  }
  return true;
}

function isObservedValue(value) {
  return value === "UNKNOWN" || isSafeRef(value);
}

function validBinding(binding) {
  return exact(binding, BINDING_FIELDS)
    && binding.schema_version === EXECUTOR_AUTHORITY_BINDING_SCHEMA
    && safeEpoch(binding.assignment_epoch)
    && [binding.project_scope_ref, binding.family_ref, binding.mark_ref,
      binding.profile_ref, binding.session_ref, binding.deployment_ref,
      binding.tool_authority_ref].every(isSafeRef)
    && [binding.responsible_role_ref, binding.actor_ref, binding.performing_agent_id,
      binding.bot_ref, binding.executor_ref, binding.requested_model,
      binding.requested_effort].every(safeId)
    && snapshotRef(binding.role_snapshot_ref) && snapshotRef(binding.capability_snapshot_ref)
    && idList(binding.required_capability_refs)
    && digestRef(binding.deployment_digest)
    && isObservedValue(binding.observed_model) && isObservedValue(binding.observed_effort)
    && safeEpoch(binding.tool_authority_epoch) && digestRef(binding.tool_policy_digest)
    && safeList(binding.authorized_tool_refs, { allowEmpty: true, sorted: true })
    && safeList(binding.required_tool_refs, { allowEmpty: true, sorted: true });
}

function exactExecutionBasis(candidate, task, assignment, match) {
  return sameTask(candidate.task_ref, task.task_ref) && sameTask(assignment.task_ref, task.task_ref)
    && sameTask(match.task_ref, task.task_ref)
    && sameRevision(candidate.work_brief_revision_ref, task.work_brief_revision_ref)
    && sameRevision(assignment.work_brief_revision_ref, task.work_brief_revision_ref)
    && sameRevision(match.work_brief_revision_ref, task.work_brief_revision_ref)
    && [candidate.action_ref, assignment.action_ref, match.action_ref]
      .every((value) => value === task.action_ref)
    && [candidate.authority_ref, assignment.authority_ref, match.authority_ref]
      .every((value) => value === task.authority_ref);
}

function buildAdmission(candidate, task, assignment, match, receipt, evaluation, binding) {
  const body = {
    schema_version: CANDIDATE_EXECUTION_AUTHORITY_ADMISSION_SCHEMA,
    status: "ADMITTED",
    candidate_ref: candidate.candidate_ref,
    task_ref: structuredClone(task.task_ref),
    work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
    action_ref: task.action_ref,
    authority_ref: task.authority_ref,
    assignment_policy_revision_ref: structuredClone(assignment.policy_revision_ref),
    assignment_epoch: binding.assignment_epoch,
    project_scope_ref: binding.project_scope_ref,
    role_snapshot_ref: structuredClone(binding.role_snapshot_ref),
    capability_snapshot_ref: structuredClone(binding.capability_snapshot_ref),
    responsible_role_ref: binding.responsible_role_ref,
    required_capability_refs: [...binding.required_capability_refs],
    executor_binding: {
      family_ref: binding.family_ref,
      mark_ref: binding.mark_ref,
      actor_ref: binding.actor_ref,
      performing_agent_id: binding.performing_agent_id,
      bot_ref: binding.bot_ref,
      executor_ref: binding.executor_ref,
      profile_ref: binding.profile_ref,
      session_ref: binding.session_ref,
      deployment_ref: binding.deployment_ref,
      deployment_digest: binding.deployment_digest,
      requested_model: binding.requested_model,
      requested_effort: binding.requested_effort,
      observed_model: binding.observed_model,
      observed_effort: binding.observed_effort,
    },
    tool_authority: {
      authority_ref: binding.tool_authority_ref,
      authority_epoch: binding.tool_authority_epoch,
      policy_digest: binding.tool_policy_digest,
      authorized_tool_refs: [...binding.authorized_tool_refs],
      required_tool_refs: [...binding.required_tool_refs],
    },
    verified_active_binding_receipt_ref: receipt.verification_receipt_ref,
    verified_active_binding_receipt_digest: receipt.receipt_digest,
    trusted_current_evaluation_ref: evaluation.evaluation_ref,
    trusted_current_evaluated_at: evaluation.evaluated_at,
    effect_boundary: {
      executor_called: false,
      claim_created: false,
      task_or_linear_mutated: false,
      agent_or_session_created: false,
      runtime_filesystem_network_or_clock_used: false,
      worker_success_treated_as_done: false,
    },
  };
  return deepFreeze({ ...body, admission_digest: digestOf(body) });
}

/**
 * Pure admission gate. It only proves that a coordinator packet and an already configured executor
 * binding are current and mutually exact. It does not call that executor, reserve a slot, claim a
 * task, mutate Linear, create an Agent/session, or grant completion authority.
 */
export function admitCandidateExecutorAuthority(rawRequest) {
  const guarded = guardEntry(rawRequest, REQUEST_FIELDS, ENTRY_CODES);
  if (guarded.status === "HOLD") return hold(guarded.hold_code);
  const request = guarded.value;
  if (!exact(request, REQUEST_FIELDS)) return hold(H.REQUEST_INVALID);
  const candidate = request.candidate_packet;
  const task = request.task_packet;
  const assignment = request.assignment_packet;
  const match = request.role_capability_match;
  const receipt = request.verified_active_binding;
  const evaluation = request.trusted_current_evaluation;
  const binding = request.executor_binding;

  if (!validCandidate(candidate)) return hold(H.CANDIDATE_PACKET_INVALID);
  if (!validTask(task)) return hold(H.TASK_PACKET_INVALID);
  if (!validAssignment(assignment)) return hold(H.ASSIGNMENT_PACKET_INVALID);
  if (!validMatch(match)) return hold(H.ROLE_CAPABILITY_MATCH_INVALID);
  if (!validBinding(binding)) return hold(H.EXECUTOR_BINDING_INVALID);
  if (!validVerifiedBinding(receipt)) {
    return exact(receipt, VERIFIED_BINDING_FIELDS)
      ? hold(H.VERIFIED_BINDING_DIGEST_MISMATCH)
      : hold(H.VERIFIED_BINDING_REQUIRED);
  }
  if (!validCurrent(evaluation)) return hold(H.TRUSTED_CURRENT_EVALUATION_REQUIRED);
  if (!exactExecutionBasis(candidate, task, assignment, match)) {
    return hold(H.EXECUTION_BASIS_MISMATCH);
  }

  if (evaluation.evaluated_at < receipt.authority_evaluated_at
    || evaluation.evaluated_at < receipt.verified_at) return hold(H.AUTHORITY_EPOCH_STALE);
  if (evaluation.evaluated_at >= receipt.expires_at) return hold(H.AUTHORITY_EXPIRED);
  if (evaluation.current_authority_epoch !== receipt.current_authority_epoch) {
    return hold(H.AUTHORITY_EPOCH_STALE);
  }
  if (evaluation.authority_state_evaluation_ref !== receipt.authority_state_evaluation_ref
    || evaluation.authority_ref !== receipt.authority_ref) return hold(H.AUTHORITY_EPOCH_STALE);
  if (evaluation.revoked_binding_refs.some((ref) => [receipt.verification_receipt_ref,
    receipt.trusted_pin_ref, receipt.deployment_ref, binding.profile_ref,
    binding.session_ref].includes(ref))) return hold(H.AUTHORITY_REVOKED);
  if (evaluation.current_assignment_epoch !== binding.assignment_epoch) {
    return hold(H.ASSIGNMENT_EPOCH_STALE);
  }
  if (evaluation.active_slot_state !== "idle" || evaluation.active_run_ref !== null) {
    return hold(H.DUPLICATE_ACTIVE_SLOT);
  }
  if (receipt.project_scope_ref !== binding.project_scope_ref
    || evaluation.project_scope_ref !== binding.project_scope_ref) {
    return hold(H.PROJECT_SCOPE_MISMATCH);
  }

  if (!sameSnapshot(match.role_snapshot_ref, binding.role_snapshot_ref)
    || !sameSnapshot(match.capability_snapshot_ref, binding.capability_snapshot_ref)
    || !sameSnapshot(assignment.performer_binding.capability_snapshot_ref,
      binding.capability_snapshot_ref)
    || match.responsible_role_ref !== binding.responsible_role_ref
    || match.responsible_actor_ref !== binding.actor_ref
    || assignment.responsible_role_ref !== binding.responsible_role_ref
    || !sameSet(match.required_capability_refs, binding.required_capability_refs)) {
    return hold(H.ROLE_CAPABILITY_MISMATCH);
  }
  const selected = match.candidates.filter((candidateBinding) => (
    candidateBinding.actor_ref === binding.actor_ref
    && candidateBinding.performing_agent_id === binding.performing_agent_id
    && candidateBinding.bot_ref === binding.bot_ref
    && candidateBinding.executor_ref === binding.executor_ref
  ));
  if (selected.length !== 1 || !sameSet(selected[0].match_reason_refs,
    binding.required_capability_refs)) return hold(H.ROLE_CAPABILITY_MISMATCH);

  const performer = assignment.performer_binding;
  if (performer.actor_ref !== binding.actor_ref
    || performer.performing_agent_id !== binding.performing_agent_id
    || performer.bot_ref !== binding.bot_ref || performer.executor_ref !== binding.executor_ref
    || receipt.family_ref !== binding.family_ref || receipt.mark_ref !== binding.mark_ref
    || receipt.deployment_ref !== binding.deployment_ref
    || receipt.deployment_digest !== binding.deployment_digest
    || evaluation.family_ref !== binding.family_ref || evaluation.mark_ref !== binding.mark_ref
    || evaluation.performing_agent_id !== binding.performing_agent_id
    || evaluation.bot_ref !== binding.bot_ref || evaluation.executor_ref !== binding.executor_ref
    || evaluation.profile_ref !== binding.profile_ref || evaluation.session_ref !== binding.session_ref
    || evaluation.deployment_ref !== binding.deployment_ref
    || evaluation.deployment_digest !== binding.deployment_digest) {
    return hold(H.AGENT_BINDING_MISMATCH);
  }

  if (!sameSnapshot(evaluation.role_snapshot_ref, binding.role_snapshot_ref)
    || !sameSnapshot(evaluation.capability_snapshot_ref, binding.capability_snapshot_ref)
    || evaluation.responsible_role_ref !== binding.responsible_role_ref
    || evaluation.actor_ref !== binding.actor_ref
    || !sameSet(evaluation.required_capability_refs, binding.required_capability_refs)) {
    return hold(H.ROLE_CAPABILITY_MISMATCH);
  }
  if (evaluation.tool_authority_ref !== binding.tool_authority_ref
    || evaluation.tool_authority_epoch !== binding.tool_authority_epoch
    || evaluation.tool_policy_digest !== binding.tool_policy_digest
    || !sameSet(evaluation.authorized_tool_refs, binding.authorized_tool_refs)
    || !binding.required_tool_refs.every((toolRef) => binding.authorized_tool_refs.includes(toolRef))) {
    return hold(H.TOOL_AUTHORITY_MISMATCH);
  }
  if (evaluation.observed_model !== binding.observed_model
    || (binding.observed_model !== "UNKNOWN"
      && binding.observed_model !== binding.requested_model)) return hold(H.MODEL_BINDING_MISMATCH);
  if (evaluation.observed_effort !== binding.observed_effort
    || (binding.observed_effort !== "UNKNOWN"
      && binding.observed_effort !== binding.requested_effort)) return hold(H.EFFORT_BINDING_MISMATCH);

  return buildAdmission(candidate, task, assignment, match, receipt, evaluation, binding);
}

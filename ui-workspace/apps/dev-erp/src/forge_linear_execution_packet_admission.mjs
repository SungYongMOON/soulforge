import {
  deepFreeze,
  digestOf,
  guardEntry,
  isDenseArray,
  isPlainObject,
  isSafeRef,
  unknownKeyIn,
} from "../../../../guild_hall/agent_observation/guard_primitives.mjs";

export const FORGE_LINEAR_EXECUTION_PACKET_ADMISSION_SCHEMA =
  "soulforge.forge_linear_execution_packet_admission.v0";

const CANDIDATE_SCHEMA = "soulforge.candidate_execution.candidate_packet.v1";
const TASK_SCHEMA = "soulforge.candidate_execution.task_packet.v1";
const WORK_SCHEMA = "soulforge.role_capability.work_task_contract.v1";
const LINEAR_READ_SCHEMA = "soulforge.linear.official_task_read_evidence.v0";
const EXECUTION_BINDING_SCHEMA = "soulforge.forge_linear.execution_binding.v0";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const MAX_LIST = 64;
const MAX_TEXT = 4_000;

export const FORGE_LINEAR_EXECUTION_PACKET_HOLD_CODES = Object.freeze({
  REQUEST_INVALID: "FORGE_LINEAR_ADMISSION_REQUEST_INVALID",
  SECRET_FORBIDDEN: "FORGE_LINEAR_ADMISSION_SECRET_FORBIDDEN",
  LOCAL_PATH_FORBIDDEN: "FORGE_LINEAR_ADMISSION_LOCAL_PATH_FORBIDDEN",
  INPUT_TOO_DEEP: "FORGE_LINEAR_ADMISSION_INPUT_TOO_DEEP",
  INPUT_TOO_LARGE: "FORGE_LINEAR_ADMISSION_INPUT_TOO_LARGE",
  HOSTILE_INPUT: "FORGE_LINEAR_ADMISSION_HOSTILE_INPUT",
  ACCESSOR_FORBIDDEN: "FORGE_LINEAR_ADMISSION_ACCESSOR_FORBIDDEN",
  FORGE_TASK_INVALID: "FORGE_OFFICIAL_TASK_INVALID",
  FORGE_ASSIGNMENT_INVALID: "FORGE_ASSIGNMENT_INVALID",
  BRIEF_NOT_ISSUED: "FORGE_WORK_BRIEF_NOT_ISSUED",
  BRIEF_INCOMPLETE: "FORGE_WORK_BRIEF_INCOMPLETE",
  LINEAR_READ_INVALID: "LINEAR_OFFICIAL_TASK_READ_EVIDENCE_INVALID",
  LINEAR_READ_DIGEST_MISMATCH: "LINEAR_OFFICIAL_TASK_READ_EVIDENCE_DIGEST_MISMATCH",
  LINEAR_EVIDENCE_STALE: "LINEAR_OFFICIAL_TASK_READ_EVIDENCE_STALE",
  LINEAR_TASK_REVOKED: "LINEAR_OFFICIAL_TASK_REVOKED",
  LINEAR_TASK_NOT_TODO: "LINEAR_OFFICIAL_TASK_NOT_TODO",
  EXECUTION_BINDING_INVALID: "FORGE_LINEAR_EXECUTION_BINDING_INVALID",
  TASK_ID_MISMATCH: "FORGE_LINEAR_TASK_ID_MISMATCH",
  PROJECT_SCOPE_MISMATCH: "FORGE_LINEAR_PROJECT_SCOPE_MISMATCH",
  ASSIGNMENT_STALE: "FORGE_ASSIGNMENT_STALE",
  ASSIGNMENT_REVOKED: "FORGE_ASSIGNMENT_REVOKED",
  ASSIGNMENT_BINDING_MISMATCH: "FORGE_ASSIGNMENT_BINDING_MISMATCH",
  BRIEF_BINDING_MISMATCH: "FORGE_WORK_BRIEF_BINDING_MISMATCH",
  BRIEF_DIGEST_MISMATCH: "FORGE_WORK_BRIEF_DIGEST_MISMATCH",
  SOURCE_RECEIPT_MISMATCH: "FORGE_LINEAR_SOURCE_RECEIPT_MISMATCH",
});

const H = FORGE_LINEAR_EXECUTION_PACKET_HOLD_CODES;
const REQUEST_FIELDS = Object.freeze([
  "forge_official_task",
  "forge_assignment",
  "forge_issued_work_brief",
  "linear_official_task_read_evidence",
  "execution_binding",
]);
const ENTRY_CODES = Object.freeze({
  unknownField: H.REQUEST_INVALID,
  secret: H.SECRET_FORBIDDEN,
  localPath: H.LOCAL_PATH_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
  tooLarge: H.INPUT_TOO_LARGE,
  hostileInput: H.HOSTILE_INPUT,
  accessor: H.ACCESSOR_FORBIDDEN,
});
const OFFICIAL_TASK_FIELDS = Object.freeze(["task_ref", "writer_ref", "intent_id"]);
const ASSIGNMENT_FIELDS = Object.freeze([
  "assignment_id", "task_ref", "intent_id", "primary_role", "actor_ref",
  "authority_ref", "assignment_epoch", "expires_at",
]);
const BRIEF_FIELDS = Object.freeze([
  "brief_id", "assignment_id", "task_ref", "intent_id", "primary_role",
  "problem", "requested_outcome", "allowed_write_scope", "required_evidence",
  "stop_conditions", "escalation_path", "input_bundle_manifest_digest",
  "required_review_role", "source_draft_ref", "expires_at",
]);
const LINEAR_FIELDS = Object.freeze([
  "schema_version", "evidence_state", "provider", "task_id", "forge_task_ref",
  "task_status", "project_scope_ref", "read_receipt_ref", "read_receipt_digest",
  "source_receipt_refs",
]);
const BINDING_FIELDS = Object.freeze([
  "schema_version", "candidate_ref", "project_scope_ref", "action_ref",
  "authority_ref", "required_role_ref", "required_capability_refs",
  "responsible_actor_ref", "source_receipt_refs",
  "assignment_id", "assignment_authority_ref", "assignment_epoch",
  "assignment_state", "work_brief_revision_id", "work_brief_content_sha256",
  "parent_task_ref",
]);
const BRIEF_CRITICAL_FIELDS = Object.freeze([
  "problem", "requested_outcome", "allowed_write_scope", "required_evidence",
  "stop_conditions", "escalation_path", "input_bundle_manifest_digest",
  "required_review_role",
]);

const hold = (code) => deepFreeze({ status: "HOLD", hold_code: code });
const exact = (value, fields) => isPlainObject(value)
  && unknownKeyIn(value, fields) === null
  && Object.keys(value).length === fields.length
  && fields.every((field) => Object.hasOwn(value, field));
const safeId = (value) => typeof value === "string" && SAFE_ID.test(value)
  && isSafeRef(value);
const digestRef = (value) => typeof value === "string" && SHA256.test(value);
const safeEpoch = (value) => Number.isSafeInteger(value) && value > 0;
const safeText = (value, max = MAX_TEXT) => typeof value === "string"
  && value.length > 0 && value.length <= max;
const safeList = (value, { allowEmpty = false, text = false } = {}) => (
  isDenseArray(value) && value.length <= MAX_LIST && (allowEmpty || value.length > 0)
  && value.every((entry) => (text ? safeText(entry, 1_000) : safeId(entry)))
  && new Set(value).size === value.length
);

function taskRef(value) {
  return exact(value, ["provider", "task_id"])
    && safeId(value.provider) && safeId(value.task_id);
}

function validForgeTask(value) {
  if (exact(value, OFFICIAL_TASK_FIELDS)) {
    return [value.task_ref, value.writer_ref, value.intent_id].every(safeId);
  }
  return exact(value, [...OFFICIAL_TASK_FIELDS, "replay"])
    && value.replay === true
    && [value.task_ref, value.writer_ref, value.intent_id].every(safeId);
}

function validForgeAssignment(value) {
  return exact(value, ASSIGNMENT_FIELDS)
    && [value.assignment_id, value.task_ref, value.intent_id, value.primary_role,
      value.actor_ref, value.authority_ref].every(safeId)
    && safeEpoch(value.assignment_epoch) && safeText(value.expires_at, 40);
}

function validIssuedBrief(value) {
  if (!exact(value, BRIEF_FIELDS)) return false;
  if (![value.brief_id, value.assignment_id, value.task_ref, value.intent_id,
    value.primary_role, value.required_review_role].every(safeId)
    || !(value.source_draft_ref === null || safeId(value.source_draft_ref))
    || !safeText(value.expires_at, 40)
    || !safeText(value.problem) || !safeText(value.requested_outcome)
    || !safeList(value.allowed_write_scope, { text: true })
    || !safeList(value.required_evidence, { text: true })
    || !safeList(value.stop_conditions, { text: true })
    || !safeText(value.escalation_path, 500)
    || typeof value.input_bundle_manifest_digest !== "string"
    || !HEX64.test(value.input_bundle_manifest_digest)) return false;
  return true;
}

function validLinearEvidence(value) {
  return exact(value, LINEAR_FIELDS) && value.schema_version === LINEAR_READ_SCHEMA
    && ["current", "stale", "revoked"].includes(value.evidence_state)
    && [value.provider, value.task_id, value.forge_task_ref, value.task_status,
      value.project_scope_ref, value.read_receipt_ref].every(safeId)
    && value.provider === "linear" && digestRef(value.read_receipt_digest)
    && safeList(value.source_receipt_refs)
    && value.source_receipt_refs.includes(value.read_receipt_ref);
}

function linearEvidenceDigest(value) {
  const { read_receipt_digest: ignored, ...body } = value;
  return digestOf(body);
}

function validExecutionBinding(value) {
  return exact(value, BINDING_FIELDS) && value.schema_version === EXECUTION_BINDING_SCHEMA
    && [value.candidate_ref, value.project_scope_ref, value.action_ref,
      value.authority_ref, value.required_role_ref, value.assignment_id,
      value.assignment_authority_ref, value.responsible_actor_ref,
      value.work_brief_revision_id].every(safeId)
    && safeList(value.required_capability_refs)
    && safeList(value.source_receipt_refs)
    && safeEpoch(value.assignment_epoch)
    && ["current", "stale", "revoked"].includes(value.assignment_state)
    && digestRef(value.work_brief_content_sha256)
    && (value.parent_task_ref === null || taskRef(value.parent_task_ref));
}

function sameForgeBasis(task, assignment, brief) {
  return assignment.task_ref === task.task_ref && brief.task_ref === task.task_ref
    && assignment.intent_id === task.intent_id && brief.intent_id === task.intent_id
    && brief.assignment_id === assignment.assignment_id
    && brief.primary_role === assignment.primary_role
    && brief.expires_at === assignment.expires_at;
}

function briefBindings(brief) {
  return Object.fromEntries(BRIEF_CRITICAL_FIELDS.map((field) => [
    field,
    structuredClone(brief[field]),
  ]));
}

/**
 * Pure admission seam from exact Forge output plus an already observed Linear Todo to packets
 * understood by the existing role/capability and CandidateExecution seams. It cannot read Linear,
 * choose an Agent, claim/execute work, mutate state, or use filesystem/network/clock surfaces.
 */
export function admitForgeLinearExecutionPacket(rawRequest) {
  const guarded = guardEntry(rawRequest, REQUEST_FIELDS, ENTRY_CODES);
  if (guarded.status === "HOLD") return hold(guarded.hold_code);
  const request = guarded.value;
  if (!exact(request, REQUEST_FIELDS)) return hold(H.REQUEST_INVALID);
  const forgeTask = request.forge_official_task;
  const assignment = request.forge_assignment;
  const brief = request.forge_issued_work_brief;
  const linear = request.linear_official_task_read_evidence;
  const binding = request.execution_binding;

  if (!validForgeTask(forgeTask)) return hold(H.FORGE_TASK_INVALID);
  if (!validForgeAssignment(assignment)) return hold(H.FORGE_ASSIGNMENT_INVALID);
  if (isPlainObject(brief) && brief.claim === "draft_not_issuable_material") {
    return hold(H.BRIEF_NOT_ISSUED);
  }
  if (!validIssuedBrief(brief)) return hold(H.BRIEF_INCOMPLETE);
  if (!validLinearEvidence(linear)) return hold(H.LINEAR_READ_INVALID);
  if (!validExecutionBinding(binding)) return hold(H.EXECUTION_BINDING_INVALID);
  if (linear.read_receipt_digest !== linearEvidenceDigest(linear)) {
    return hold(H.LINEAR_READ_DIGEST_MISMATCH);
  }
  if (linear.evidence_state === "stale") return hold(H.LINEAR_EVIDENCE_STALE);
  if (linear.evidence_state === "revoked") return hold(H.LINEAR_TASK_REVOKED);
  if (linear.task_status !== "Todo") return hold(H.LINEAR_TASK_NOT_TODO);
  if (binding.assignment_state === "stale") return hold(H.ASSIGNMENT_STALE);
  if (binding.assignment_state === "revoked") return hold(H.ASSIGNMENT_REVOKED);
  if (!sameForgeBasis(forgeTask, assignment, brief)
    || linear.forge_task_ref !== forgeTask.task_ref) return hold(H.TASK_ID_MISMATCH);
  if (linear.project_scope_ref !== binding.project_scope_ref) {
    return hold(H.PROJECT_SCOPE_MISMATCH);
  }
  if (binding.assignment_id !== assignment.assignment_id
    || binding.assignment_authority_ref !== assignment.authority_ref
    || binding.authority_ref !== assignment.authority_ref
    || binding.assignment_epoch !== assignment.assignment_epoch
    || binding.required_role_ref !== assignment.primary_role
    || binding.responsible_actor_ref !== assignment.actor_ref) {
    return hold(H.ASSIGNMENT_BINDING_MISMATCH);
  }
  if (binding.source_receipt_refs.length !== linear.source_receipt_refs.length
    || !binding.source_receipt_refs.every((ref) => linear.source_receipt_refs.includes(ref))) {
    return hold(H.SOURCE_RECEIPT_MISMATCH);
  }
  if (binding.work_brief_revision_id !== brief.brief_id) {
    return hold(H.BRIEF_BINDING_MISMATCH);
  }
  const actualBriefDigest = digestOf(brief);
  if (binding.work_brief_content_sha256 !== actualBriefDigest) {
    return hold(H.BRIEF_DIGEST_MISMATCH);
  }

  const structuredTaskRef = deepFreeze({
    provider: linear.provider,
    task_id: linear.task_id,
  });
  const revisionRef = deepFreeze({
    provider: linear.provider,
    task_id: linear.task_id,
    revision_id: brief.brief_id,
    content_sha256: actualBriefDigest,
  });
  const candidatePacket = deepFreeze({
    schema_version: CANDIDATE_SCHEMA,
    validation_state: "prevalidated",
    selection_state: "candidate",
    candidate_ref: binding.candidate_ref,
    label_prefilter_passed: true,
    task_ref: structuredClone(structuredTaskRef),
    work_brief_revision_ref: structuredClone(revisionRef),
    action_ref: binding.action_ref,
    authority_ref: binding.authority_ref,
  });
  const taskPacket = deepFreeze({
    schema_version: TASK_SCHEMA,
    validation_state: "prevalidated",
    task_class: "official",
    task_status: "Todo",
    task_ref: structuredClone(structuredTaskRef),
    parent_task_ref: structuredClone(binding.parent_task_ref),
    work_brief_revision_ref: structuredClone(revisionRef),
    action_ref: binding.action_ref,
    authority_ref: binding.authority_ref,
    coverage_refs: [...linear.source_receipt_refs],
  });
  const workTaskContract = deepFreeze({
    schema_version: WORK_SCHEMA,
    validation_state: "prevalidated",
    task_ref: structuredClone(structuredTaskRef),
    work_brief_revision_ref: structuredClone(revisionRef),
    action_ref: binding.action_ref,
    authority_ref: binding.authority_ref,
    required_role_ref: binding.required_role_ref,
    required_capability_refs: [...binding.required_capability_refs],
  });
  const body = {
    schema_version: FORGE_LINEAR_EXECUTION_PACKET_ADMISSION_SCHEMA,
    status: "ADMITTED",
    task_ref: structuredClone(structuredTaskRef),
    work_brief_revision_ref: structuredClone(revisionRef),
    project_scope_ref: binding.project_scope_ref,
    candidate_packet: candidatePacket,
    task_packet: taskPacket,
    work_task_contract: workTaskContract,
    issued_work_brief_bindings: briefBindings(brief),
    forge_binding_refs: {
      intent_ref: forgeTask.intent_id,
      assignment_ref: assignment.assignment_id,
      brief_ref: brief.brief_id,
      source_draft_ref: brief.source_draft_ref,
      writer_ref: forgeTask.writer_ref,
      linear_read_receipt_ref: linear.read_receipt_ref,
      linear_read_receipt_digest: linear.read_receipt_digest,
    },
    source_receipt_refs: [...linear.source_receipt_refs],
    assignment_binding: {
      assignment_ref: assignment.assignment_id,
      authority_ref: assignment.authority_ref,
      assignment_epoch: assignment.assignment_epoch,
      actor_ref: assignment.actor_ref,
      role_ref: assignment.primary_role,
    },
    effect_boundary: {
      linear_read_or_write: false,
      candidate_claimed: false,
      executor_or_agent_selected: false,
      execution_started: false,
      filesystem_network_or_clock_used: false,
    },
  };
  return deepFreeze({ ...body, admission_digest: digestOf(body) });
}

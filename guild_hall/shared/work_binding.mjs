import {
  deepFreeze, digestOf, guardEntry, isDenseArray, isPlainObject, isSafeRef, unknownKeyIn,
} from "../agent_observation/guard_primitives.mjs";

// This is a pure comparison of caller-supplied, trusted current projections. The server owns
// authentication, provenance and freshness, just as the existing Forge/Linear and executor
// admission adapters do. None of these projections may come from the intake request body.
// This module neither creates an ACL/authority schema nor replaces executor authority admission.
const SCOPE_FIELDS = ["project_code", "product_ref", "work_package_ref", "stage_code", "artifact_family_id"];
const REQUEST_FIELDS = [
  "requester", ...SCOPE_FIELDS, "kind", "idempotency_key", "rune_task_id", "work_order_ref",
  "input_revision", "blueprint_ref", "policy_refs", "directives", "instruction_ref", "revision_of", "revision_no",
];
const EVIDENCE_FIELDS = [
  "evaluation_ref", "authenticated_requester", "acl", "policy_slots", "mapping_phase", "mappings",
  "current_input_revision", "historical_input_approval", "allowed_blueprints", "approved_instruction_refs",
  "linear_applicability", "linear_task",
];
const BINDING_FIELDS = [
  "status", "hold_code", "request_digest", "scoped_work_key", "evaluation_ref", "authority_epoch",
  "acl_receipt_ref", "mapping_digest", "input_revision", "blueprint_ref", "binding_digest",
];
const ENTRY_CODES = {
  unknownField: "REQUEST_INVALID", secret: "SECRET_FORBIDDEN", localPath: "LOCAL_PATH_FORBIDDEN",
  tooDeep: "INPUT_TOO_DEEP", tooLarge: "INPUT_TOO_LARGE", hostileInput: "HOSTILE_INPUT", accessor: "ACCESSOR_FORBIDDEN",
};
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const PROJECT = /^[A-Z0-9][A-Z0-9_-]{2,23}$/u;
const REQUESTER = /^(?:owner\.local|member\.[a-f0-9]{16})$/u;
const KINDS = ["minutes", "report", "journal", "mail_draft", "requirement_crosscheck", "deck", "fill_missing"];
export const WORK_BINDING_DIRECTIVES = Object.freeze([
  "TIGHTEN", "EXPAND_SECTION", "ADD_EVIDENCE_REFS", "FIX_TERMS", "FIX_NUMBERS", "REORDER",
  "SHORTEN", "TONE_NOMINAL_ENDING", "ANONYMIZE_PARTIES",
]);

const hold = (hold_code) => deepFreeze({ status: "HOLD", hold_code });
const exact = (value, keys) => isPlainObject(value) && unknownKeyIn(value, keys) === null
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && ID.test(value) && isSafeRef(value);
const digest = value => typeof value === "string" && SHA256.test(value);
const actor = value => typeof value === "string" && REQUESTER.test(value);
const epoch = value => Number.isSafeInteger(value) && value >= 0;
const same = (left, right) => digestOf(left) === digestOf(right);
const scopeOf = value => Object.fromEntries(SCOPE_FIELDS.map(key => [key, value[key]]));
const sameScope = (left, right) => SCOPE_FIELDS.every(key => left[key] === right[key]);
const validScope = value => typeof value.project_code === "string" && PROJECT.test(value.project_code)
  && SCOPE_FIELDS.slice(1).every(key => id(value[key]));
const list = (value, predicate, max = 64) => isDenseArray(value) && value.length <= max && value.every(predicate);
const nullableId = value => value === null || id(value);

function blueprint(value) {
  return exact(value, ["workflow_id", "version", "version_source"])
    && id(value.workflow_id) && typeof value.version === "string" && /^v\d+$/u.test(value.version)
    && value.workflow_id.endsWith(`_${value.version}`) && value.version_source === "id_suffix";
}

function order(value) {
  return exact(value, ["receipt_digest", "order_index"]) && digest(value.receipt_digest) && epoch(value.order_index);
}

function taskRef(value) {
  return exact(value, ["provider", "task_id"]) && value.provider === "linear" && id(value.task_id);
}

function instruction(value) {
  return exact(value, ["payload_ref", "content_sha256", "byte_length"])
    && id(value.payload_ref) && digest(value.content_sha256)
    && Number.isSafeInteger(value.byte_length) && value.byte_length > 0 && value.byte_length <= 2000;
}

/** Single-slot request normalization; no client authority fields, raw text or paths are accepted. */
export function normalizeWorkBindingRequest(rawRequest) {
  const entry = guardEntry(rawRequest, REQUEST_FIELDS, ENTRY_CODES);
  if (entry.status !== "OK") return hold(entry.hold_code);
  const value = entry.value;
  if (!exact(value, REQUEST_FIELDS) || !actor(value.requester) || !validScope(value)
    || !KINDS.includes(value.kind)
    || typeof value.idempotency_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/u.test(value.idempotency_key)
    || !nullableId(value.rune_task_id) || !(value.work_order_ref === null || order(value.work_order_ref))
    || !digest(value.input_revision) || !(value.blueprint_ref === null || blueprint(value.blueprint_ref))
    || !exact(value.policy_refs, ["stage_policy_ref", "coverage_ref", "recipe_id", "task_ref"])
    || ![value.policy_refs.stage_policy_ref, value.policy_refs.coverage_ref, value.policy_refs.recipe_id].every(nullableId)
    || !(value.policy_refs.task_ref === null || taskRef(value.policy_refs.task_ref))
    || !list(value.directives, directive => WORK_BINDING_DIRECTIVES.includes(directive), WORK_BINDING_DIRECTIVES.length)
    || new Set(value.directives).size !== value.directives.length
    || !(value.instruction_ref === null || instruction(value.instruction_ref))
    || !nullableId(value.revision_of) || !Number.isSafeInteger(value.revision_no) || value.revision_no < 1
    || (value.revision_of === null ? value.revision_no !== 1 : value.revision_no < 2)) return hold("REQUEST_INVALID");
  value.directives.sort();
  return deepFreeze({ status: "NORMALIZED", request: value, request_digest: digestOf(value) });
}

/** Local Rune IDs become joinable only inside the full project/product/WP/stage/artifact scope. */
export function createScopedWorkKey(rawScope) {
  const entry = guardEntry(rawScope, SCOPE_FIELDS, ENTRY_CODES);
  if (entry.status !== "OK" || !exact(entry.value, SCOPE_FIELDS) || !validScope(entry.value)) return null;
  return `work:${digestOf(entry.value).slice(7)}`;
}

function validEvidence(value) {
  if (!exact(value, EVIDENCE_FIELDS) || !id(value.evaluation_ref)
    || !(value.authenticated_requester === null || actor(value.authenticated_requester))
    || !exact(value.acl, ["requester", ...SCOPE_FIELDS, "state", "epoch", "receipt_ref"])
    || !actor(value.acl.requester) || !validScope(value.acl) || !["current", "revoked", "expired", "unknown"].includes(value.acl.state)
    || !epoch(value.acl.epoch) || !id(value.acl.receipt_ref)
    || !list(value.policy_slots, row => exact(row, [...SCOPE_FIELDS, "stage_policy_ref"]) && validScope(row) && id(row.stage_policy_ref))
    || !["phase0", "pre_phase0"].includes(value.mapping_phase)
    || !list(value.mappings, row => exact(row, [...SCOPE_FIELDS, "rune_task_id", "work_order_ref", "task_ref"])
      && validScope(row) && nullableId(row.rune_task_id) && (row.work_order_ref === null || order(row.work_order_ref))
      && (row.task_ref === null || taskRef(row.task_ref)))
    || !digest(value.current_input_revision) || !list(value.allowed_blueprints, blueprint)
    || !list(value.approved_instruction_refs, instruction)
    || !["synthetic_sfx", "real_work"].includes(value.linear_applicability)) return false;
  const approval = value.historical_input_approval;
  if (approval !== null && (!exact(approval, ["request_digest", "input_revision", "approval_ref", "state"])
    || !digest(approval.request_digest) || !digest(approval.input_revision) || !id(approval.approval_ref)
    || !["current", "revoked", "expired"].includes(approval.state))) return false;
  const linear = value.linear_task;
  return linear === null || (exact(linear, ["task_ref", "project_code", "state", "task_status", "read_receipt_ref"])
    && taskRef(linear.task_ref) && typeof linear.project_code === "string" && PROJECT.test(linear.project_code)
    && ["current", "stale", "revoked", "unknown"].includes(linear.state)
    && ["Todo", "In Progress", "Done", "Cancelled"].includes(linear.task_status) && id(linear.read_receipt_ref));
}

function bindingResult(normalized, evidence, status, holdCode, mapping = null) {
  const body = {
    status, hold_code: holdCode, request_digest: normalized.request_digest,
    scoped_work_key: createScopedWorkKey(scopeOf(normalized.request)),
    evaluation_ref: evidence.evaluation_ref, authority_epoch: evidence.acl.epoch,
    acl_receipt_ref: evidence.acl.receipt_ref, mapping_digest: mapping === null ? null : digestOf(mapping),
    input_revision: normalized.request.input_revision, blueprint_ref: normalized.request.blueprint_ref,
  };
  return deepFreeze({ ...body, binding_digest: digestOf(body) });
}

/** Closed receipt shape and digest check; a valid receipt still conveys no authority. */
export function isWorkBindingResult(rawResult) {
  const entry = guardEntry(rawResult, BINDING_FIELDS, ENTRY_CODES);
  if (entry.status !== "OK") return false;
  const value = entry.value;
  if (!exact(value, BINDING_FIELDS) || !["MAPPED", "UNMAPPED_WORK_CANDIDATE"].includes(value.status)
    || (value.status === "MAPPED" ? value.hold_code !== null : !id(value.hold_code))
    || !digest(value.request_digest) || typeof value.scoped_work_key !== "string"
    || !/^work:[a-f0-9]{64}$/u.test(value.scoped_work_key) || !id(value.evaluation_ref)
    || !epoch(value.authority_epoch) || !id(value.acl_receipt_ref)
    || (value.status === "MAPPED" ? !digest(value.mapping_digest) : value.mapping_digest !== null)
    || !digest(value.input_revision) || !(value.blueprint_ref === null || blueprint(value.blueprint_ref))
    || !digest(value.binding_digest)) return false;
  const { binding_digest: expected, ...body } = value;
  return digestOf(body) === expected;
}

/**
 * MAPPED is metadata correspondence, never permission to claim or execute. Missing execution
 * prerequisites yield a recordable UNMAPPED_WORK_CANDIDATE; auth/scope/policy failures reject.
 */
export function evaluateWorkBinding(rawRequest, rawTrustedEvidence) {
  const normalized = normalizeWorkBindingRequest(rawRequest);
  if (normalized.status !== "NORMALIZED") return normalized;
  const entry = guardEntry(rawTrustedEvidence, EVIDENCE_FIELDS, ENTRY_CODES);
  if (entry.status !== "OK") return hold("TRUSTED_EVIDENCE_REQUIRED");
  const evidence = entry.value;
  if (!validEvidence(evidence)) return hold("TRUSTED_EVIDENCE_INVALID");
  const request = normalized.request;
  if (evidence.authenticated_requester !== request.requester) return hold("AUTH_REQUIRED");
  if (evidence.acl.requester !== request.requester || evidence.acl.state !== "current"
    || !sameScope(request, evidence.acl)) return hold("SCOPE_VIOLATION");
  const slots = evidence.policy_slots.filter(slot => sameScope(slot, request)
    && slot.stage_policy_ref === request.policy_refs.stage_policy_ref);
  if (slots.length !== 1) return hold("POLICY_SLOT_UNKNOWN");
  const candidate = code => bindingResult(normalized, evidence, "UNMAPPED_WORK_CANDIDATE", code);
  const mappings = evidence.mappings.filter(mapping => sameScope(mapping, request));
  if (mappings.length > 1) return candidate("WORK_BINDING_AMBIGUOUS");
  if (mappings.length === 0) {
    const foreign = evidence.mappings.some(mapping => !sameScope(mapping, request)
      && ((request.rune_task_id !== null && mapping.rune_task_id === request.rune_task_id)
        || (request.work_order_ref !== null && same(mapping.work_order_ref, request.work_order_ref))));
    return foreign ? hold("SCOPE_VIOLATION") : candidate("UNMAPPED_WORK_CANDIDATE");
  }
  const mapping = mappings[0];
  if (evidence.mapping_phase === "phase0") {
    if (request.rune_task_id === null || mapping.rune_task_id !== request.rune_task_id) return candidate("UNMAPPED_WORK_CANDIDATE");
  } else if (request.rune_task_id !== null || mapping.rune_task_id !== null || request.work_order_ref === null) {
    return candidate("UNMAPPED_WORK_CANDIDATE");
  }
  if (!same(request.work_order_ref, mapping.work_order_ref)) return candidate("WORK_ORDER_MISMATCH");
  if (evidence.linear_applicability === "real_work" && request.policy_refs.task_ref === null) return candidate("TASK_REF_REQUIRED");
  if (request.policy_refs.task_ref !== null || evidence.linear_applicability === "real_work") {
    const linear = evidence.linear_task;
    if (linear === null || linear.state !== "current" || !["Todo", "In Progress"].includes(linear.task_status)) return candidate("LINEAR_TASK_NOT_CURRENT");
    if (linear.project_code !== request.project_code || !same(linear.task_ref, request.policy_refs.task_ref)
      || !same(mapping.task_ref, request.policy_refs.task_ref)) return hold("TASK_BINDING_MISMATCH");
  } else if (mapping.task_ref !== null || evidence.linear_task !== null) return hold("TASK_BINDING_MISMATCH");
  if (request.input_revision !== evidence.current_input_revision) {
    const approval = evidence.historical_input_approval;
    if (approval === null || approval.state !== "current" || approval.input_revision !== request.input_revision
      || approval.request_digest !== normalized.request_digest) return candidate("INPUT_REVISION_STALE");
  }
  if (request.blueprint_ref === null) return candidate("WORKFLOW_GAP");
  if (!evidence.allowed_blueprints.some(ref => same(ref, request.blueprint_ref))) return candidate("BLUEPRINT_NOT_ALLOWED");
  if (request.instruction_ref !== null && !evidence.approved_instruction_refs.some(ref => same(ref, request.instruction_ref))) {
    return candidate("INSTRUCTION_REF_NOT_APPROVED");
  }
  return bindingResult(normalized, evidence, "MAPPED", null, mapping);
}

/** Eligibility only; callers must still use the existing executor admission and claim boundary. */
export function evaluateWorkClaimEligibility(rawRequest, rawContext) {
  const contextEntry = guardEntry(rawContext, ["recorded_binding", "current_evidence"], ENTRY_CODES);
  if (contextEntry.status !== "OK" || !exact(contextEntry.value, ["recorded_binding", "current_evidence"])) return hold("CURRENT_RECHECK_REQUIRED");
  const { recorded_binding: recorded, current_evidence: current } = contextEntry.value;
  if (!isWorkBindingResult(recorded) || recorded.status !== "MAPPED") return hold("RECORDED_MAPPING_REQUIRED");
  const normalized = normalizeWorkBindingRequest(rawRequest);
  if (normalized.status !== "NORMALIZED") return normalized;
  if (normalized.request_digest !== recorded.request_digest) return hold("REQUEST_BINDING_MISMATCH");
  const rechecked = evaluateWorkBinding(normalized.request, current);
  if (rechecked.status !== "MAPPED") return hold(rechecked.hold_code);
  if (rechecked.evaluation_ref === recorded.evaluation_ref) return hold("CURRENT_RECHECK_REQUIRED");
  if (rechecked.authority_epoch !== recorded.authority_epoch) return hold("AUTHORITY_EPOCH_STALE");
  if (rechecked.acl_receipt_ref !== recorded.acl_receipt_ref) return hold("ACL_BINDING_CHANGED");
  if (rechecked.mapping_digest !== recorded.mapping_digest || rechecked.scoped_work_key !== recorded.scoped_work_key) return hold("WORK_BINDING_CHANGED");
  return deepFreeze({
    status: "CLAIM_ELIGIBLE", hold_code: null, request_digest: normalized.request_digest,
    binding: rechecked,
    effect_boundary: { claim_created: false, executor_called: false, model_called: false, raw_content_read: false, task_or_linear_mutated: false, acceptance_authority: false },
  });
}

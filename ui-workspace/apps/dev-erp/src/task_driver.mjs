import { createHash } from "node:crypto";
import {
  IDENTITY_GENERATION_PROFILE_ID,
  serializeCanonicalIdentity,
  validateTypedRef as validateSharedTypedRef,
} from "../../../../guild_hall/shared/temporal_identity.mjs";

export const TASK_DRIVER_SCHEMA_VERSION = "soulforge.task_driver.v1";
export const TASK_INTENT_SCHEMA_VERSION = "soulforge.task_intent.v1";
export const TASK_DRIVER_EVENT_SCHEMA_VERSION = "soulforge.task_driver_event.v1";
export const TASK_DRIVER_POLICY_SCHEMA_VERSION = "soulforge.task_driver_policy.v1";
export const TASK_DRIVER_POLICY_REVOCATION_SCHEMA_VERSION =
  "soulforge.task_driver_policy_revocation.v1";
export const TASK_DRIVER_PROJECTION_SCHEMA_VERSION = "soulforge.task_driver_projection.v1";
export const TASK_DRIVER_AUTHORITY_ATTESTATION_SCHEMA_VERSION =
  "soulforge.task_driver_authority_attestation.v1";
export const TASK_DRIVER_CANONICALIZATION_VERSION = IDENTITY_GENERATION_PROFILE_ID;
export const TASK_DRIVER_OWNER_SURFACE = "dev_erp_task_engine";
export const TASK_OWNER_SURFACE = "dev_erp";
export const TASK_DRIVER_LIMITS = Object.freeze({
  canonical_max_depth: 32,
  canonical_max_array_length: 1024,
  canonical_max_object_keys: 128,
  canonical_max_string_length: 8192,
  canonical_max_nodes: 10000,
  replay_max_records_per_collection: 4096,
});

export const TASK_DRIVER_KINDS = Object.freeze([
  "owner_request",
  "source_event",
  "due_rule",
  "dependency",
  "followup",
  "completion_followup",
]);
export const TASK_INTENT_KINDS = Object.freeze([
  "task_create",
  "work_status_transition",
  "field_patch",
]);
export const DECISION_APPLICATION_STATES = Object.freeze([
  "candidate",
  "review_required",
  "approved",
  "applied",
  "rejected",
  "superseded",
]);
export const WORK_STATUSES = Object.freeze([
  "not_started",
  "in_progress",
  "waiting",
  "blocked",
  "done",
  "cancelled",
  "merged",
  "archived",
]);
export const TASK_DRIVER_EVENT_KINDS = Object.freeze([
  "candidate",
  "review_required",
  "approve",
  "apply",
  "reject",
  "supersede",
]);
export const TASK_DRIVER_REASON_TEMPLATES = Object.freeze({
  owner_request: "task_driver.reason.owner_request.v1",
  source_event: "task_driver.reason.source_event.v1",
  due_rule: "task_driver.reason.due_rule.v1",
  dependency: "task_driver.reason.dependency.v1",
  followup: "task_driver.reason.followup.v1",
  completion_followup: "task_driver.reason.completion_followup.v1",
});

const DRIVER_KIND_SET = new Set(TASK_DRIVER_KINDS);
const INTENT_KIND_SET = new Set(TASK_INTENT_KINDS);
const WORK_STATUS_SET = new Set(WORK_STATUSES);
const EVENT_KIND_SET = new Set(TASK_DRIVER_EVENT_KINDS);
const ACTOR_KINDS = new Set(["human", "llm", "system"]);
const AUTHORITY_KINDS = new Set(["none", "owner_decision", "deterministic_policy"]);
const REF_ENTITY_TYPES = new Set([
  "actor",
  "event",
  "knowledge_revision",
  "owner_decision",
  "policy_revocation",
  "policy_revision",
  "project",
  "rule_revision",
  "source_revision",
  "task",
  "task_candidate",
  "task_driver",
  "task_intent",
  "task_revision",
  "writer",
]);
const ACTIVE_WORK_STATUSES = new Set(["not_started", "in_progress", "waiting", "blocked"]);
const TERMINAL_WORK_STATUSES = new Set(["done", "cancelled", "merged"]);
const STRICT_UTC_MS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const OWNER_SURFACE_RE = /^[a-z][a-z0-9._-]{0,63}$/u;
const ENTITY_ID_RE = /^[A-Za-z0-9\p{L}][A-Za-z0-9\p{L}._:@-]{0,127}$/u;
const SAFE_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/u;
const DIGEST_RE = /^sha256:[a-f0-9]{64}$/u;
const IDEMPOTENCY_RE = /^task-driver(?::event)?:v1:[a-f0-9]{64}$/u;

const REF_KEYS = ["entity_type", "owner_surface", "entity_id"];
const INTENT_KEYS = [
  "schema_version",
  "canonicalization_version",
  "intent_id",
  "intent_kind",
  "project_ref",
  "task_ref",
  "task_candidate_ref",
  "expected_from_state_or_revision",
  "proposed_to_state_or_patch",
  "intent_digest",
];
const DRIVER_KEYS = [
  "schema_version",
  "canonicalization_version",
  "driver_id",
  "driver_kind",
  "project_ref",
  "task_ref",
  "task_candidate_ref",
  "target_intent_ref",
  "intent_digest",
  "trigger_event_ref",
  "source_revision_refs",
  "rule_revision_refs",
  "knowledge_revision_refs",
  "parent_task_refs",
  "completion_event_refs",
  "why_code",
  "reason_template_id",
  "valid_at",
  "known_at",
  "recorded_at",
  "policy_ref",
  "owner_decision_ref",
  "decision_application_state",
  "idempotency_key",
  "driver_digest",
  "supersedes_driver_ref",
];
const POLICY_KEYS = [
  "schema_version",
  "canonicalization_version",
  "policy_ref",
  "allowed_driver_kinds",
  "allowed_trigger_owner_surfaces",
  "writer_ref",
  "valid_from",
  "valid_until",
  "known_at",
  "recorded_at",
  "supersedes_policy_ref",
  "policy_digest",
];
const POLICY_REVOCATION_KEYS = [
  "schema_version",
  "canonicalization_version",
  "revocation_ref",
  "policy_ref",
  "revoked_at",
  "known_at",
  "recorded_at",
  "owner_decision_ref",
  "revocation_digest",
];
const EVENT_KEYS = [
  "schema_version",
  "canonicalization_version",
  "event_id",
  "event_kind",
  "event_sequence",
  "driver_ref",
  "driver_digest",
  "target_intent_ref",
  "intent_digest",
  "actor_kind",
  "actor_ref",
  "writer_ref",
  "authority_kind",
  "owner_decision_ref",
  "policy_ref",
  "valid_at",
  "known_at",
  "recorded_at",
  "result_project_ref",
  "result_task_candidate_ref",
  "result_task_ref",
  "work_status_transition",
  "superseding_driver_ref",
  "idempotency_key",
  "event_digest",
];
const AUTHORITY_ATTESTATION_KEYS = [
  "schema_version",
  "project_ref",
  "event_ref",
  "event_digest",
  "event_sequence",
  "driver_ref",
  "driver_digest",
  "target_intent_ref",
  "intent_digest",
  "authority_kind",
  "authority_ref",
  "actor_kind",
  "actor_ref",
  "writer_ref",
  "allowed_event_kind",
  "event_valid_at",
  "event_known_at",
  "event_recorded_at",
  "cutoff",
  "policy_digest",
  "policy_revocation_digest",
  "evidence_digest",
];

export class TaskDriverContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "TaskDriverContractError";
    this.code = code;
  }
}

function fail(code) {
  throw new TaskDriverContractError(code);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, code) {
  if (!isPlainObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function assertKnownKeys(value, keys, code) {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !keys.has(key))) fail(code);
}

function normalizeString(value, code, { pattern = null, max = 128, allowEmpty = false } = {}) {
  if (typeof value !== "string") fail(code);
  const normalized = value.normalize("NFC");
  if (
    normalized !== normalized.trim()
    || (!allowEmpty && normalized.length === 0)
    || normalized.length > max
    || /[\x00-\x1f\x7f-\x9f\u2028\u2029]/u.test(normalized)
    || (pattern && !pattern.test(normalized))
  ) fail(code);
  return normalized;
}

function normalizeReasonTemplate(value, driverKind) {
  if (typeof value !== "string" || value !== TASK_DRIVER_REASON_TEMPLATES[driverKind]) {
    fail("task_driver_reason_template_invalid");
  }
  return value;
}

function normalizeTimestamp(value, code) {
  if (typeof value !== "string" || !STRICT_UTC_MS_RE.test(value)) fail(code);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail(code);
  return value;
}

function normalizePositiveSafeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCanonicalBounds(root) {
  const ancestors = new WeakSet();
  const stack = [{ value: root, depth: 0, exit: false }];
  let nodes = 0;
  while (stack.length > 0) {
    const frame = stack.pop();
    const value = frame.value;
    if (frame.exit) {
      ancestors.delete(value);
      continue;
    }
    nodes += 1;
    if (nodes > TASK_DRIVER_LIMITS.canonical_max_nodes) fail("task_driver_canonical_nodes_exceeded");
    if (frame.depth > TASK_DRIVER_LIMITS.canonical_max_depth) fail("task_driver_canonical_depth_exceeded");
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "string") {
      if (value.length > TASK_DRIVER_LIMITS.canonical_max_string_length) {
        fail("task_driver_canonical_string_too_long");
      }
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) fail("task_driver_canonical_safe_integer_required");
      continue;
    }
    if (typeof value !== "object") fail("task_driver_canonical_value_invalid");
    if (ancestors.has(value)) fail("task_driver_canonical_cycle");
    ancestors.add(value);
    stack.push({ value, depth: frame.depth, exit: true });
    if (Array.isArray(value)) {
      if (value.length > TASK_DRIVER_LIMITS.canonical_max_array_length) {
        fail("task_driver_canonical_array_too_large");
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], depth: frame.depth + 1, exit: false });
      }
      continue;
    }
    if (!isPlainObject(value)) fail("task_driver_canonical_value_invalid");
    const keys = Object.keys(value);
    if (keys.length > TASK_DRIVER_LIMITS.canonical_max_object_keys) {
      fail("task_driver_canonical_object_too_large");
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      stack.push({ value: value[keys[index]], depth: frame.depth + 1, exit: false });
    }
  }
}

export function canonicalStringify(value) {
  assertCanonicalBounds(value);
  try {
    return serializeCanonicalIdentity(value);
  } catch (error) {
    if (error instanceof TaskDriverContractError) throw error;
    fail("task_driver_canonical_value_invalid");
  }
}

export function canonicalDigest(value, domain = "soulforge.task_driver.canonical.v1") {
  const normalizedDomain = normalizeString(domain, "task_driver_digest_domain_invalid", {
    pattern: /^[a-z][a-z0-9._-]{0,127}$/u,
  });
  const digest = createHash("sha256")
    .update(normalizedDomain, "utf8")
    .update("\0", "utf8")
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

function digestHex(value) {
  return value.slice("sha256:".length);
}

export function typedRef(entityType, ownerSurface, entityId) {
  return normalizeTypedRef({ entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId });
}

export function normalizeTypedRef(value, { entityTypes = null, code = "task_driver_ref_invalid" } = {}) {
  assertExactKeys(value, REF_KEYS, code);
  let shared;
  try {
    shared = validateSharedTypedRef(value);
  } catch {
    fail(code);
  }
  const entityType = normalizeString(shared.entity_type, code, { pattern: SAFE_CODE_RE, max: 64 });
  const ownerSurface = normalizeString(shared.owner_surface, code, { pattern: OWNER_SURFACE_RE, max: 64 });
  const entityId = normalizeString(shared.entity_id, code, { pattern: ENTITY_ID_RE, max: 128 });
  if (!REF_ENTITY_TYPES.has(entityType) || (entityTypes && !entityTypes.has(entityType))) fail(code);
  return deepFreeze({ entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId });
}

function nullableRef(value, entityTypes, code) {
  return value === null ? null : normalizeTypedRef(value, { entityTypes, code });
}

function refKey(value) {
  return canonicalStringify(value);
}

function refsEqual(left, right) {
  return left === null || right === null ? left === right : refKey(left) === refKey(right);
}

function requireOwnerSurface(ref, ownerSurface, code) {
  if (ownerSurface !== null && ref !== null && ref.owner_surface !== ownerSurface) fail(code);
  return ref;
}

function normalizeRefArray(value, entityType, code, ownerSurface = null) {
  if (!Array.isArray(value) || value.length > 64) fail(code);
  const refs = value.map((entry) => requireOwnerSurface(
    normalizeTypedRef(entry, { entityTypes: new Set([entityType]), code }),
    ownerSurface,
    code,
  ));
  refs.sort((left, right) => compareText(refKey(left), refKey(right)));
  if (refs.some((entry, index) => index > 0 && refsEqual(entry, refs[index - 1]))) fail(code);
  return deepFreeze(refs);
}

function normalizeDigest(value, code) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail(code);
  return value;
}

export function isLegalWorkStatusTransition(from, to) {
  if (!WORK_STATUS_SET.has(from) || !WORK_STATUS_SET.has(to) || from === to || from === "archived") return false;
  if (ACTIVE_WORK_STATUSES.has(from)) {
    return (ACTIVE_WORK_STATUSES.has(to) && to !== "not_started") || TERMINAL_WORK_STATUSES.has(to);
  }
  return TERMINAL_WORK_STATUSES.has(from) && to === "archived";
}

export function assertWorkStatusTransition(from, to) {
  if (!isLegalWorkStatusTransition(from, to)) fail("task_driver_work_status_transition_illegal");
  return { from, to };
}

function normalizeIntentFields(input) {
  const intentKind = normalizeString(input.intent_kind, "task_intent_kind_invalid", { pattern: SAFE_CODE_RE, max: 64 });
  if (!INTENT_KIND_SET.has(intentKind)) fail("task_intent_kind_invalid");
  const projectRef = normalizeTypedRef(input.project_ref, {
    entityTypes: new Set(["project"]),
    code: "task_intent_project_ref_invalid",
  });
  requireOwnerSurface(projectRef, TASK_OWNER_SURFACE, "task_intent_project_owner_invalid");
  const taskRef = nullableRef(input.task_ref, new Set(["task"]), "task_intent_task_ref_invalid");
  const taskCandidateRef = nullableRef(
    input.task_candidate_ref,
    new Set(["task_candidate"]),
    "task_intent_task_candidate_ref_invalid",
  );
  requireOwnerSurface(taskRef, TASK_OWNER_SURFACE, "task_intent_task_owner_invalid");
  requireOwnerSurface(
    taskCandidateRef,
    TASK_DRIVER_OWNER_SURFACE,
    "task_intent_task_candidate_owner_invalid",
  );
  let expected;
  let proposed;
  if (intentKind === "task_create") {
    if (taskRef !== null || taskCandidateRef === null || input.expected_from_state_or_revision !== null) {
      fail("task_intent_target_invalid");
    }
    assertExactKeys(input.proposed_to_state_or_patch, ["initial_work_status"], "task_intent_create_patch_invalid");
    const initial = normalizeString(
      input.proposed_to_state_or_patch.initial_work_status,
      "task_intent_create_patch_invalid",
      { pattern: SAFE_CODE_RE },
    );
    if (initial !== "not_started") fail("task_intent_create_patch_invalid");
    expected = null;
    proposed = deepFreeze({ initial_work_status: initial });
  } else if (intentKind === "work_status_transition") {
    if (taskRef === null || taskCandidateRef !== null) fail("task_intent_target_invalid");
    expected = normalizeString(input.expected_from_state_or_revision, "task_intent_work_status_invalid", {
      pattern: SAFE_CODE_RE,
    });
    proposed = normalizeString(input.proposed_to_state_or_patch, "task_intent_work_status_invalid", {
      pattern: SAFE_CODE_RE,
    });
    assertWorkStatusTransition(expected, proposed);
  } else {
    if (taskRef === null || taskCandidateRef !== null) fail("task_intent_target_invalid");
    expected = normalizeTypedRef(input.expected_from_state_or_revision, {
      entityTypes: new Set(["task_revision"]),
      code: "task_intent_revision_ref_invalid",
    });
    proposed = normalizeTypedRef(input.proposed_to_state_or_patch, {
      entityTypes: new Set(["task_revision"]),
      code: "task_intent_patch_ref_invalid",
    });
    requireOwnerSurface(expected, TASK_OWNER_SURFACE, "task_intent_revision_owner_invalid");
    requireOwnerSurface(proposed, TASK_OWNER_SURFACE, "task_intent_revision_owner_invalid");
    if (refsEqual(expected, proposed)) fail("task_intent_patch_ref_invalid");
  }
  return { intentKind, projectRef, taskRef, taskCandidateRef, expected, proposed };
}

function intentPayload(fields) {
  return {
    schema_version: TASK_INTENT_SCHEMA_VERSION,
    canonicalization_version: TASK_DRIVER_CANONICALIZATION_VERSION,
    intent_kind: fields.intentKind,
    project_ref: fields.projectRef,
    task_ref: fields.taskRef,
    task_candidate_ref: fields.taskCandidateRef,
    expected_from_state_or_revision: fields.expected,
    proposed_to_state_or_patch: fields.proposed,
  };
}

export function buildTaskIntent(input) {
  assertKnownKeys(input, new Set([
    "intent_kind",
    "project_ref",
    "task_ref",
    "task_candidate_ref",
    "expected_from_state_or_revision",
    "proposed_to_state_or_patch",
  ]), "task_intent_shape_invalid");
  const fields = normalizeIntentFields({ task_ref: null, task_candidate_ref: null, ...input });
  const payload = intentPayload(fields);
  const intentDigest = canonicalDigest(payload, "soulforge.task_driver.intent.v1");
  return deepFreeze({
    ...payload,
    intent_id: `intent-${digestHex(intentDigest)}`,
    intent_digest: intentDigest,
  });
}

export function validateTaskIntent(value) {
  assertExactKeys(value, INTENT_KEYS, "task_intent_shape_invalid");
  if (
    value.schema_version !== TASK_INTENT_SCHEMA_VERSION
    || value.canonicalization_version !== TASK_DRIVER_CANONICALIZATION_VERSION
  ) fail("task_intent_version_invalid");
  const fields = normalizeIntentFields(value);
  const payload = intentPayload(fields);
  const expectedDigest = canonicalDigest(payload, "soulforge.task_driver.intent.v1");
  const digest = normalizeDigest(value.intent_digest, "task_intent_digest_invalid");
  const intentId = normalizeString(value.intent_id, "task_intent_id_invalid", { pattern: ENTITY_ID_RE });
  if (digest !== expectedDigest || intentId !== `intent-${digestHex(expectedDigest)}`) {
    fail("task_intent_digest_mismatch");
  }
  return deepFreeze({ ...payload, intent_id: intentId, intent_digest: digest });
}

export function taskIntentRef(intent) {
  const normalized = validateTaskIntent(intent);
  return typedRef("task_intent", TASK_DRIVER_OWNER_SURFACE, normalized.intent_id);
}

function normalizeDriverKindRequirements(driverKind, fields) {
  if (driverKind === "source_event" && fields.sourceRevisionRefs.length === 0) {
    fail("task_driver_source_revision_required");
  }
  if (driverKind === "due_rule" && fields.ruleRevisionRefs.length === 0) {
    fail("task_driver_rule_revision_required");
  }
  if (["dependency", "followup"].includes(driverKind) && fields.parentTaskRefs.length === 0) {
    fail("task_driver_parent_task_required");
  }
  if (
    driverKind === "completion_followup"
    && (fields.parentTaskRefs.length === 0 || fields.completionEventRefs.length === 0)
  ) fail("task_driver_completion_evidence_required");
  if (driverKind === "owner_request" && fields.triggerEventRef.entity_type !== "owner_decision") {
    fail("task_driver_owner_request_trigger_invalid");
  }
}

function normalizeDriverFields(input, intent) {
  const driverKind = normalizeString(input.driver_kind, "task_driver_kind_invalid", { pattern: SAFE_CODE_RE });
  if (!DRIVER_KIND_SET.has(driverKind)) fail("task_driver_kind_invalid");
  const triggerEventRef = normalizeTypedRef(input.trigger_event_ref, {
    entityTypes: new Set(["event", "owner_decision"]),
    code: "task_driver_trigger_ref_invalid",
  });
  const sourceRevisionRefs = normalizeRefArray(
    input.source_revision_refs ?? [], "source_revision", "task_driver_source_refs_invalid",
  );
  const ruleRevisionRefs = normalizeRefArray(
    input.rule_revision_refs ?? [], "rule_revision", "task_driver_rule_refs_invalid",
  );
  const knowledgeRevisionRefs = normalizeRefArray(
    input.knowledge_revision_refs ?? [], "knowledge_revision", "task_driver_knowledge_refs_invalid",
  );
  const parentTaskRefs = normalizeRefArray(
    input.parent_task_refs ?? [], "task", "task_driver_parent_refs_invalid", TASK_OWNER_SURFACE,
  );
  const completionEventRefs = normalizeRefArray(
    input.completion_event_refs ?? [], "event", "task_driver_completion_refs_invalid",
  );
  const whyCode = normalizeString(input.why_code, "task_driver_why_code_invalid", { pattern: SAFE_CODE_RE });
  if (whyCode !== driverKind) fail("task_driver_why_code_invalid");
  const reasonTemplateId = normalizeReasonTemplate(input.reason_template_id, driverKind);
  const validAt = normalizeTimestamp(input.valid_at, "task_driver_valid_at_invalid");
  const knownAt = normalizeTimestamp(input.known_at, "task_driver_known_at_invalid");
  const recordedAt = normalizeTimestamp(input.recorded_at, "task_driver_recorded_at_invalid");
  if (Date.parse(recordedAt) < Date.parse(knownAt)) fail("task_driver_recorded_before_known");
  const policyRef = nullableRef(input.policy_ref ?? null, new Set(["policy_revision"]), "task_driver_policy_ref_invalid");
  let ownerDecisionRef = nullableRef(
    input.owner_decision_ref ?? null,
    new Set(["owner_decision"]),
    "task_driver_owner_decision_ref_invalid",
  );
  if (driverKind === "owner_request") {
    if (ownerDecisionRef === null) ownerDecisionRef = triggerEventRef;
    if (!refsEqual(ownerDecisionRef, triggerEventRef)) {
      fail("task_driver_owner_request_decision_binding_mismatch");
    }
  }
  if (policyRef !== null && ownerDecisionRef !== null) fail("task_driver_authority_ref_conflict");
  const supersedesDriverRef = nullableRef(
    input.supersedes_driver_ref ?? null,
    new Set(["task_driver"]),
    "task_driver_supersedes_ref_invalid",
  );
  requireOwnerSurface(
    supersedesDriverRef,
    TASK_DRIVER_OWNER_SURFACE,
    "task_driver_supersedes_owner_invalid",
  );
  const fields = {
    driverKind,
    projectRef: intent.project_ref,
    taskRef: intent.task_ref,
    taskCandidateRef: intent.task_candidate_ref,
    targetIntentRef: taskIntentRef(intent),
    intentDigest: intent.intent_digest,
    triggerEventRef,
    sourceRevisionRefs,
    ruleRevisionRefs,
    knowledgeRevisionRefs,
    parentTaskRefs,
    completionEventRefs,
    whyCode,
    reasonTemplateId,
    validAt,
    knownAt,
    recordedAt,
    policyRef,
    ownerDecisionRef,
    supersedesDriverRef,
  };
  normalizeDriverKindRequirements(driverKind, fields);
  return fields;
}

function driverIdempotencyKey(fields) {
  const digest = canonicalDigest({
    canonicalization_version: TASK_DRIVER_CANONICALIZATION_VERSION,
    project_ref: fields.projectRef,
    driver_kind: fields.driverKind,
    trigger_event_ref: fields.triggerEventRef,
    target_intent_ref: fields.targetIntentRef,
    intent_digest: fields.intentDigest,
  }, "soulforge.task_driver.idempotency.v1");
  return `task-driver:v1:${digestHex(digest)}`;
}

function driverPayload(fields, idempotencyKey) {
  return {
    schema_version: TASK_DRIVER_SCHEMA_VERSION,
    canonicalization_version: TASK_DRIVER_CANONICALIZATION_VERSION,
    driver_kind: fields.driverKind,
    project_ref: fields.projectRef,
    task_ref: fields.taskRef,
    task_candidate_ref: fields.taskCandidateRef,
    target_intent_ref: fields.targetIntentRef,
    intent_digest: fields.intentDigest,
    trigger_event_ref: fields.triggerEventRef,
    source_revision_refs: fields.sourceRevisionRefs,
    rule_revision_refs: fields.ruleRevisionRefs,
    knowledge_revision_refs: fields.knowledgeRevisionRefs,
    parent_task_refs: fields.parentTaskRefs,
    completion_event_refs: fields.completionEventRefs,
    why_code: fields.whyCode,
    reason_template_id: fields.reasonTemplateId,
    valid_at: fields.validAt,
    known_at: fields.knownAt,
    recorded_at: fields.recordedAt,
    policy_ref: fields.policyRef,
    owner_decision_ref: fields.ownerDecisionRef,
    idempotency_key: idempotencyKey,
    supersedes_driver_ref: fields.supersedesDriverRef,
  };
}

export function buildTaskDriver(input) {
  assertKnownKeys(input, new Set([
    "driver_kind",
    "intent",
    "trigger_event_ref",
    "source_revision_refs",
    "rule_revision_refs",
    "knowledge_revision_refs",
    "parent_task_refs",
    "completion_event_refs",
    "why_code",
    "reason_template_id",
    "valid_at",
    "known_at",
    "recorded_at",
    "policy_ref",
    "owner_decision_ref",
    "supersedes_driver_ref",
  ]), "task_driver_build_shape_invalid");
  const intent = validateTaskIntent(input.intent);
  const fields = normalizeDriverFields(input, intent);
  const idempotencyKey = driverIdempotencyKey(fields);
  const payload = driverPayload(fields, idempotencyKey);
  const driverDigest = canonicalDigest(payload, "soulforge.task_driver.digest.v1");
  const driverId = `driver-${digestHex(driverDigest)}`;
  if (fields.supersedesDriverRef?.entity_id === driverId) fail("task_driver_supersedes_self");
  return deepFreeze({
    ...payload,
    driver_id: driverId,
    decision_application_state: "candidate",
    driver_digest: driverDigest,
  });
}

export function validateTaskDriver(value, expectedIntent = null) {
  assertExactKeys(value, DRIVER_KEYS, "task_driver_shape_invalid");
  if (
    value.schema_version !== TASK_DRIVER_SCHEMA_VERSION
    || value.canonicalization_version !== TASK_DRIVER_CANONICALIZATION_VERSION
  ) fail("task_driver_version_invalid");
  if (value.decision_application_state !== "candidate") fail("task_driver_derived_state_not_candidate");
  const intent = expectedIntent ? validateTaskIntent(expectedIntent) : null;
  if (!intent) fail("task_driver_intent_required");
  const fields = normalizeDriverFields({
    driver_kind: value.driver_kind,
    trigger_event_ref: value.trigger_event_ref,
    source_revision_refs: value.source_revision_refs,
    rule_revision_refs: value.rule_revision_refs,
    knowledge_revision_refs: value.knowledge_revision_refs,
    parent_task_refs: value.parent_task_refs,
    completion_event_refs: value.completion_event_refs,
    why_code: value.why_code,
    reason_template_id: value.reason_template_id,
    valid_at: value.valid_at,
    known_at: value.known_at,
    recorded_at: value.recorded_at,
    policy_ref: value.policy_ref,
    owner_decision_ref: value.owner_decision_ref,
    supersedes_driver_ref: value.supersedes_driver_ref,
  }, intent);
  if (
    !refsEqual(value.project_ref, fields.projectRef)
    || !refsEqual(value.task_ref, fields.taskRef)
    || !refsEqual(value.task_candidate_ref, fields.taskCandidateRef)
    || !refsEqual(value.target_intent_ref, fields.targetIntentRef)
    || value.intent_digest !== fields.intentDigest
  ) fail("task_driver_intent_binding_mismatch");
  const idempotencyKey = driverIdempotencyKey(fields);
  if (typeof value.idempotency_key !== "string" || !IDEMPOTENCY_RE.test(value.idempotency_key)) {
    fail("task_driver_idempotency_key_invalid");
  }
  if (value.idempotency_key !== idempotencyKey) fail("task_driver_idempotency_key_mismatch");
  const payload = driverPayload(fields, idempotencyKey);
  const expectedDigest = canonicalDigest(payload, "soulforge.task_driver.digest.v1");
  const driverDigest = normalizeDigest(value.driver_digest, "task_driver_digest_invalid");
  const driverId = normalizeString(value.driver_id, "task_driver_id_invalid", { pattern: ENTITY_ID_RE });
  if (driverDigest !== expectedDigest || driverId !== `driver-${digestHex(expectedDigest)}`) {
    fail("task_driver_digest_mismatch");
  }
  if (fields.supersedesDriverRef?.entity_id === driverId) fail("task_driver_supersedes_self");
  return deepFreeze({
    ...payload,
    driver_id: driverId,
    decision_application_state: "candidate",
    driver_digest: driverDigest,
  });
}

export function taskDriverRef(driver, intent) {
  const normalized = validateTaskDriver(driver, intent);
  return typedRef("task_driver", TASK_DRIVER_OWNER_SURFACE, normalized.driver_id);
}

function normalizeSortedCodes(values, allowed, code, { ownerSurface = false } = {}) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) fail(code);
  const normalized = values.map((value) => normalizeString(value, code, {
    pattern: ownerSurface ? OWNER_SURFACE_RE : SAFE_CODE_RE,
    max: 64,
  }));
  if (allowed && normalized.some((value) => !allowed.has(value))) fail(code);
  const sorted = [...new Set(normalized)].sort(compareText);
  if (sorted.length !== normalized.length) fail(code);
  return deepFreeze(sorted);
}

function policyPayload(fields) {
  return {
    schema_version: TASK_DRIVER_POLICY_SCHEMA_VERSION,
    canonicalization_version: TASK_DRIVER_CANONICALIZATION_VERSION,
    policy_ref: fields.policyRef,
    allowed_driver_kinds: fields.allowedDriverKinds,
    allowed_trigger_owner_surfaces: fields.allowedTriggerOwnerSurfaces,
    writer_ref: fields.writerRef,
    valid_from: fields.validFrom,
    valid_until: fields.validUntil,
    known_at: fields.knownAt,
    recorded_at: fields.recordedAt,
    supersedes_policy_ref: fields.supersedesPolicyRef,
  };
}

function normalizePolicyFields(input) {
  const policyRef = normalizeTypedRef(input.policy_ref, {
    entityTypes: new Set(["policy_revision"]),
    code: "task_driver_policy_ref_invalid",
  });
  const allowedDriverKinds = normalizeSortedCodes(
    input.allowed_driver_kinds, DRIVER_KIND_SET, "task_driver_policy_driver_scope_invalid",
  );
  const allowedTriggerOwnerSurfaces = normalizeSortedCodes(
    input.allowed_trigger_owner_surfaces,
    null,
    "task_driver_policy_source_scope_invalid",
    { ownerSurface: true },
  );
  const writerRef = normalizeTypedRef(input.writer_ref, {
    entityTypes: new Set(["writer"]),
    code: "task_driver_policy_writer_ref_invalid",
  });
  const validFrom = normalizeTimestamp(input.valid_from, "task_driver_policy_valid_from_invalid");
  const validUntil = normalizeTimestamp(input.valid_until, "task_driver_policy_valid_until_invalid");
  const knownAt = normalizeTimestamp(input.known_at, "task_driver_policy_known_at_invalid");
  const recordedAt = normalizeTimestamp(input.recorded_at, "task_driver_policy_recorded_at_invalid");
  if (Date.parse(recordedAt) < Date.parse(knownAt)) fail("task_driver_policy_clock_regression");
  const supersedesPolicyRef = nullableRef(
    input.supersedes_policy_ref,
    new Set(["policy_revision"]),
    "task_driver_policy_supersedes_ref_invalid",
  );
  if (Date.parse(validFrom) > Date.parse(validUntil)) fail("task_driver_policy_window_invalid");
  if (supersedesPolicyRef !== null && refsEqual(supersedesPolicyRef, policyRef)) {
    fail("task_driver_policy_supersedes_self");
  }
  return {
    policyRef,
    allowedDriverKinds,
    allowedTriggerOwnerSurfaces,
    writerRef,
    validFrom,
    validUntil,
    knownAt,
    recordedAt,
    supersedesPolicyRef,
  };
}

export function buildTaskDriverPolicy(input) {
  assertKnownKeys(input, new Set([
    "policy_ref",
    "allowed_driver_kinds",
    "allowed_trigger_owner_surfaces",
    "writer_ref",
    "valid_from",
    "valid_until",
    "known_at",
    "recorded_at",
    "supersedes_policy_ref",
  ]), "task_driver_policy_shape_invalid");
  const fields = normalizePolicyFields({
    supersedes_policy_ref: null,
    ...input,
  });
  const payload = policyPayload(fields);
  return deepFreeze({
    ...payload,
    policy_digest: canonicalDigest(payload, "soulforge.task_driver.policy.v1"),
  });
}

export function validateTaskDriverPolicy(value) {
  assertExactKeys(value, POLICY_KEYS, "task_driver_policy_shape_invalid");
  if (
    value.schema_version !== TASK_DRIVER_POLICY_SCHEMA_VERSION
    || value.canonicalization_version !== TASK_DRIVER_CANONICALIZATION_VERSION
  ) fail("task_driver_policy_version_invalid");
  const fields = normalizePolicyFields(value);
  const payload = policyPayload(fields);
  const digest = normalizeDigest(value.policy_digest, "task_driver_policy_digest_invalid");
  if (digest !== canonicalDigest(payload, "soulforge.task_driver.policy.v1")) {
    fail("task_driver_policy_digest_mismatch");
  }
  return deepFreeze({ ...payload, policy_digest: digest });
}

function policyRevocationPayload(fields) {
  return {
    schema_version: TASK_DRIVER_POLICY_REVOCATION_SCHEMA_VERSION,
    canonicalization_version: TASK_DRIVER_CANONICALIZATION_VERSION,
    revocation_ref: fields.revocationRef,
    policy_ref: fields.policyRef,
    revoked_at: fields.revokedAt,
    known_at: fields.knownAt,
    recorded_at: fields.recordedAt,
    owner_decision_ref: fields.ownerDecisionRef,
  };
}

function normalizePolicyRevocationFields(input) {
  const revocationRef = normalizeTypedRef(input.revocation_ref, {
    entityTypes: new Set(["policy_revocation"]),
    code: "task_driver_policy_revocation_ref_invalid",
  });
  const policyRef = normalizeTypedRef(input.policy_ref, {
    entityTypes: new Set(["policy_revision"]),
    code: "task_driver_policy_revocation_policy_ref_invalid",
  });
  if (revocationRef.owner_surface !== policyRef.owner_surface) {
    fail("task_driver_policy_revocation_owner_mismatch");
  }
  const revokedAt = normalizeTimestamp(
    input.revoked_at,
    "task_driver_policy_revocation_valid_at_invalid",
  );
  const knownAt = normalizeTimestamp(
    input.known_at,
    "task_driver_policy_revocation_known_at_invalid",
  );
  const recordedAt = normalizeTimestamp(
    input.recorded_at,
    "task_driver_policy_revocation_recorded_at_invalid",
  );
  if (Date.parse(recordedAt) < Date.parse(knownAt)) {
    fail("task_driver_policy_revocation_clock_regression");
  }
  const ownerDecisionRef = normalizeTypedRef(input.owner_decision_ref, {
    entityTypes: new Set(["owner_decision"]),
    code: "task_driver_policy_revocation_owner_decision_ref_invalid",
  });
  return {
    revocationRef,
    policyRef,
    revokedAt,
    knownAt,
    recordedAt,
    ownerDecisionRef,
  };
}

export function buildTaskDriverPolicyRevocation(input) {
  assertKnownKeys(input, new Set([
    "revocation_ref",
    "policy_ref",
    "revoked_at",
    "known_at",
    "recorded_at",
    "owner_decision_ref",
  ]), "task_driver_policy_revocation_shape_invalid");
  const fields = normalizePolicyRevocationFields(input);
  const payload = policyRevocationPayload(fields);
  return deepFreeze({
    ...payload,
    revocation_digest: canonicalDigest(
      payload,
      "soulforge.task_driver.policy_revocation.v1",
    ),
  });
}

export function validateTaskDriverPolicyRevocation(value) {
  assertExactKeys(
    value,
    POLICY_REVOCATION_KEYS,
    "task_driver_policy_revocation_shape_invalid",
  );
  if (
    value.schema_version !== TASK_DRIVER_POLICY_REVOCATION_SCHEMA_VERSION
    || value.canonicalization_version !== TASK_DRIVER_CANONICALIZATION_VERSION
  ) fail("task_driver_policy_revocation_version_invalid");
  const fields = normalizePolicyRevocationFields(value);
  const payload = policyRevocationPayload(fields);
  const digest = normalizeDigest(
    value.revocation_digest,
    "task_driver_policy_revocation_digest_invalid",
  );
  if (
    digest
    !== canonicalDigest(payload, "soulforge.task_driver.policy_revocation.v1")
  ) fail("task_driver_policy_revocation_digest_mismatch");
  return deepFreeze({ ...payload, revocation_digest: digest });
}

function normalizeWorkStatusTransition(value, code) {
  if (value === null) return null;
  assertExactKeys(value, ["from", "to"], code);
  const from = value.from === null
    ? null
    : normalizeString(value.from, code, { pattern: SAFE_CODE_RE });
  const to = normalizeString(value.to, code, { pattern: SAFE_CODE_RE });
  if ((from !== null && !WORK_STATUS_SET.has(from)) || !WORK_STATUS_SET.has(to)) fail(code);
  return deepFreeze({ from, to });
}

function normalizeEventAuthority(input, eventKind, driver) {
  const actorKind = normalizeString(input.actor_kind, "task_driver_event_actor_kind_invalid", {
    pattern: SAFE_CODE_RE,
  });
  if (!ACTOR_KINDS.has(actorKind)) fail("task_driver_event_actor_kind_invalid");
  const actorRef = normalizeTypedRef(input.actor_ref, {
    entityTypes: new Set(["actor"]),
    code: "task_driver_event_actor_ref_invalid",
  });
  const writerRef = normalizeTypedRef(input.writer_ref, {
    entityTypes: new Set(["writer"]),
    code: "task_driver_event_writer_ref_invalid",
  });
  const authorityKind = normalizeString(input.authority_kind, "task_driver_event_authority_kind_invalid", {
    pattern: SAFE_CODE_RE,
  });
  if (!AUTHORITY_KINDS.has(authorityKind)) fail("task_driver_event_authority_kind_invalid");
  const ownerDecisionRef = nullableRef(
    input.owner_decision_ref,
    new Set(["owner_decision"]),
    "task_driver_event_owner_decision_ref_invalid",
  );
  const policyRef = nullableRef(
    input.policy_ref,
    new Set(["policy_revision"]),
    "task_driver_event_policy_ref_invalid",
  );
  if (actorKind === "llm" && eventKind !== "candidate") fail("task_driver_llm_direct_apply_forbidden");
  const decisionEvent = ["approve", "apply", "reject", "supersede"].includes(eventKind);
  if (!decisionEvent) {
    if (authorityKind !== "none" || ownerDecisionRef !== null || policyRef !== null) {
      fail("task_driver_event_authority_unexpected");
    }
  } else if (authorityKind === "owner_decision") {
    if (ownerDecisionRef === null || policyRef !== null) fail("task_driver_event_owner_authority_invalid");
    if (["approve", "reject", "supersede"].includes(eventKind) && actorKind !== "human") {
      fail("task_driver_event_owner_human_required");
    }
  } else if (authorityKind === "deterministic_policy") {
    if (policyRef === null || ownerDecisionRef !== null || actorKind !== "system") {
      fail("task_driver_event_policy_authority_invalid");
    }
    if (driver.driver_kind === "completion_followup") fail("task_driver_completion_followup_owner_review_required");
  } else {
    fail("task_driver_event_authority_required");
  }
  return { actorKind, actorRef, writerRef, authorityKind, ownerDecisionRef, policyRef };
}

function normalizeEventApplyFields(input, eventKind, intent, driver) {
  const resultProjectRef = nullableRef(
    input.result_project_ref,
    new Set(["project"]),
    "task_driver_event_result_project_ref_invalid",
  );
  const resultTaskCandidateRef = nullableRef(
    input.result_task_candidate_ref,
    new Set(["task_candidate"]),
    "task_driver_event_result_task_candidate_ref_invalid",
  );
  const resultTaskRef = nullableRef(
    input.result_task_ref,
    new Set(["task"]),
    "task_driver_event_result_task_ref_invalid",
  );
  const workStatusTransition = normalizeWorkStatusTransition(
    input.work_status_transition,
    "task_driver_event_work_status_transition_invalid",
  );
  const supersedingDriverRef = nullableRef(
    input.superseding_driver_ref,
    new Set(["task_driver"]),
    "task_driver_event_superseding_ref_invalid",
  );
  requireOwnerSurface(resultProjectRef, TASK_OWNER_SURFACE, "task_driver_event_result_project_owner_invalid");
  requireOwnerSurface(
    resultTaskCandidateRef,
    TASK_DRIVER_OWNER_SURFACE,
    "task_driver_event_result_candidate_owner_invalid",
  );
  requireOwnerSurface(resultTaskRef, TASK_OWNER_SURFACE, "task_driver_event_result_task_owner_invalid");
  requireOwnerSurface(
    supersedingDriverRef,
    TASK_DRIVER_OWNER_SURFACE,
    "task_driver_event_superseding_owner_invalid",
  );
  if (eventKind === "apply") {
    if (intent.intent_kind === "field_patch") fail("task_driver_field_patch_apply_unsupported");
    if (
      supersedingDriverRef !== null
      || resultProjectRef === null
      || !refsEqual(resultProjectRef, driver.project_ref)
      || resultTaskRef === null
      || resultTaskRef.owner_surface !== TASK_OWNER_SURFACE
    ) fail("task_driver_event_apply_result_invalid");
    if (intent.intent_kind === "task_create") {
      if (
        resultTaskCandidateRef === null
        || !refsEqual(resultTaskCandidateRef, intent.task_candidate_ref)
        || workStatusTransition === null
        || workStatusTransition.from !== null
        || workStatusTransition.to !== "not_started"
      ) fail("task_driver_event_apply_transition_mismatch");
    } else if (intent.intent_kind === "work_status_transition") {
      if (
        resultTaskCandidateRef !== null
        || !refsEqual(resultTaskRef, intent.task_ref)
        || workStatusTransition === null
        || workStatusTransition.from !== intent.expected_from_state_or_revision
        || workStatusTransition.to !== intent.proposed_to_state_or_patch
      ) fail("task_driver_event_apply_transition_mismatch");
    } else if (
      resultTaskCandidateRef !== null
      || !refsEqual(resultTaskRef, intent.task_ref)
      || workStatusTransition !== null
    ) {
      fail("task_driver_event_apply_transition_mismatch");
    }
  } else if (eventKind === "supersede") {
    if (
      resultProjectRef !== null
      || resultTaskCandidateRef !== null
      || resultTaskRef !== null
      || workStatusTransition !== null
      || supersedingDriverRef === null
    ) {
      fail("task_driver_event_supersede_result_invalid");
    }
  } else if (
    resultProjectRef !== null
    || resultTaskCandidateRef !== null
    || resultTaskRef !== null
    || workStatusTransition !== null
    || supersedingDriverRef !== null
  ) {
    fail("task_driver_event_result_unexpected");
  }
  return {
    resultProjectRef,
    resultTaskCandidateRef,
    resultTaskRef,
    workStatusTransition,
    supersedingDriverRef,
  };
}

function eventIdempotencyKey(fields) {
  const digest = canonicalDigest({
    canonicalization_version: TASK_DRIVER_CANONICALIZATION_VERSION,
    event_kind: fields.eventKind,
    driver_ref: fields.driverRef,
    driver_digest: fields.driverDigest,
    target_intent_ref: fields.targetIntentRef,
    intent_digest: fields.intentDigest,
    authority_kind: fields.authorityKind,
    owner_decision_ref: fields.ownerDecisionRef,
    policy_ref: fields.policyRef,
    result_project_ref: fields.resultProjectRef,
    result_task_candidate_ref: fields.resultTaskCandidateRef,
    result_task_ref: fields.resultTaskRef,
    work_status_transition: fields.workStatusTransition,
    superseding_driver_ref: fields.supersedingDriverRef,
  }, "soulforge.task_driver.event.idempotency.v1");
  return `task-driver:event:v1:${digestHex(digest)}`;
}

function eventPayload(fields, idempotencyKey) {
  return {
    schema_version: TASK_DRIVER_EVENT_SCHEMA_VERSION,
    canonicalization_version: TASK_DRIVER_CANONICALIZATION_VERSION,
    event_kind: fields.eventKind,
    event_sequence: fields.eventSequence,
    driver_ref: fields.driverRef,
    driver_digest: fields.driverDigest,
    target_intent_ref: fields.targetIntentRef,
    intent_digest: fields.intentDigest,
    actor_kind: fields.actorKind,
    actor_ref: fields.actorRef,
    writer_ref: fields.writerRef,
    authority_kind: fields.authorityKind,
    owner_decision_ref: fields.ownerDecisionRef,
    policy_ref: fields.policyRef,
    valid_at: fields.validAt,
    known_at: fields.knownAt,
    recorded_at: fields.recordedAt,
    result_project_ref: fields.resultProjectRef,
    result_task_candidate_ref: fields.resultTaskCandidateRef,
    result_task_ref: fields.resultTaskRef,
    work_status_transition: fields.workStatusTransition,
    superseding_driver_ref: fields.supersedingDriverRef,
    idempotency_key: idempotencyKey,
  };
}

function normalizeEventFields(input, driver, intent) {
  const eventKind = normalizeString(input.event_kind, "task_driver_event_kind_invalid", { pattern: SAFE_CODE_RE });
  if (!EVENT_KIND_SET.has(eventKind)) fail("task_driver_event_kind_invalid");
  const eventSequence = normalizePositiveSafeInteger(
    input.event_sequence,
    "task_driver_event_sequence_invalid",
  );
  const authority = normalizeEventAuthority(input, eventKind, driver);
  const applyFields = normalizeEventApplyFields(input, eventKind, intent, driver);
  const validAt = normalizeTimestamp(input.valid_at, "task_driver_event_valid_at_invalid");
  const knownAt = normalizeTimestamp(input.known_at, "task_driver_event_known_at_invalid");
  const recordedAt = normalizeTimestamp(input.recorded_at, "task_driver_event_recorded_at_invalid");
  if (
    Date.parse(recordedAt) < Date.parse(knownAt)
    || Date.parse(recordedAt) < Date.parse(driver.recorded_at)
    || Date.parse(knownAt) < Date.parse(driver.known_at)
  ) fail("task_driver_event_clock_regression");
  return {
    eventKind,
    eventSequence,
    driverRef: taskDriverRef(driver, intent),
    driverDigest: driver.driver_digest,
    targetIntentRef: driver.target_intent_ref,
    intentDigest: driver.intent_digest,
    ...authority,
    validAt,
    knownAt,
    recordedAt,
    ...applyFields,
  };
}

export function buildTaskDriverEvent(input) {
  assertKnownKeys(input, new Set([
    "event_kind",
    "event_sequence",
    "driver",
    "intent",
    "actor_kind",
    "actor_ref",
    "writer_ref",
    "authority_kind",
    "owner_decision_ref",
    "policy_ref",
    "valid_at",
    "known_at",
    "recorded_at",
    "result_project_ref",
    "result_task_candidate_ref",
    "result_task_ref",
    "work_status_transition",
    "superseding_driver_ref",
  ]), "task_driver_event_build_shape_invalid");
  const intent = validateTaskIntent(input.intent);
  const driver = validateTaskDriver(input.driver, intent);
  const fields = normalizeEventFields({
    authority_kind: "none",
    owner_decision_ref: null,
    policy_ref: null,
    result_project_ref: null,
    result_task_candidate_ref: null,
    result_task_ref: null,
    work_status_transition: null,
    superseding_driver_ref: null,
    ...input,
  }, driver, intent);
  const idempotencyKey = eventIdempotencyKey(fields);
  const payload = eventPayload(fields, idempotencyKey);
  const eventDigest = canonicalDigest(payload, "soulforge.task_driver.event.v1");
  return deepFreeze({
    ...payload,
    event_id: `driver-event-${digestHex(eventDigest)}`,
    event_digest: eventDigest,
  });
}

export function validateTaskDriverEvent(value, driver, intent) {
  assertExactKeys(value, EVENT_KEYS, "task_driver_event_shape_invalid");
  if (
    value.schema_version !== TASK_DRIVER_EVENT_SCHEMA_VERSION
    || value.canonicalization_version !== TASK_DRIVER_CANONICALIZATION_VERSION
  ) fail("task_driver_event_version_invalid");
  const normalizedIntent = validateTaskIntent(intent);
  const normalizedDriver = validateTaskDriver(driver, normalizedIntent);
  const fields = normalizeEventFields({
    event_kind: value.event_kind,
    event_sequence: value.event_sequence,
    actor_kind: value.actor_kind,
    actor_ref: value.actor_ref,
    writer_ref: value.writer_ref,
    authority_kind: value.authority_kind,
    owner_decision_ref: value.owner_decision_ref,
    policy_ref: value.policy_ref,
    valid_at: value.valid_at,
    known_at: value.known_at,
    recorded_at: value.recorded_at,
    result_project_ref: value.result_project_ref,
    result_task_candidate_ref: value.result_task_candidate_ref,
    result_task_ref: value.result_task_ref,
    work_status_transition: value.work_status_transition,
    superseding_driver_ref: value.superseding_driver_ref,
  }, normalizedDriver, normalizedIntent);
  if (
    !refsEqual(value.driver_ref, fields.driverRef)
    || value.driver_digest !== fields.driverDigest
    || !refsEqual(value.target_intent_ref, fields.targetIntentRef)
    || value.intent_digest !== fields.intentDigest
  ) fail("task_driver_event_binding_mismatch");
  const idempotencyKey = eventIdempotencyKey(fields);
  if (typeof value.idempotency_key !== "string" || !IDEMPOTENCY_RE.test(value.idempotency_key)) {
    fail("task_driver_event_idempotency_key_invalid");
  }
  if (value.idempotency_key !== idempotencyKey) fail("task_driver_event_idempotency_key_mismatch");
  const payload = eventPayload(fields, idempotencyKey);
  const expectedDigest = canonicalDigest(payload, "soulforge.task_driver.event.v1");
  const eventDigest = normalizeDigest(value.event_digest, "task_driver_event_digest_invalid");
  const eventId = normalizeString(value.event_id, "task_driver_event_id_invalid", { pattern: ENTITY_ID_RE });
  if (eventDigest !== expectedDigest || eventId !== `driver-event-${digestHex(expectedDigest)}`) {
    fail("task_driver_event_digest_mismatch");
  }
  return deepFreeze({ ...payload, event_id: eventId, event_digest: eventDigest });
}

function normalizeCutoff(value) {
  assertExactKeys(value, ["valid_at", "known_at"], "task_driver_cutoff_invalid");
  return deepFreeze({
    valid_at: normalizeTimestamp(value.valid_at, "task_driver_cutoff_valid_at_invalid"),
    known_at: normalizeTimestamp(value.known_at, "task_driver_cutoff_known_at_invalid"),
  });
}

function temporalRecordVisibleAt(value, cutoff, prefix) {
  if (!isPlainObject(value)) fail(`${prefix}_shape_invalid`);
  const validAt = normalizeTimestamp(value.valid_at, `${prefix}_valid_at_invalid`);
  const knownAt = normalizeTimestamp(value.known_at, `${prefix}_known_at_invalid`);
  const recordedAt = normalizeTimestamp(value.recorded_at, `${prefix}_recorded_at_invalid`);
  return Date.parse(validAt) <= Date.parse(cutoff.valid_at)
    && Date.parse(knownAt) <= Date.parse(cutoff.known_at)
    && Date.parse(recordedAt) <= Date.parse(cutoff.known_at);
}

function policyRecordVisibleAt(value, cutoff) {
  if (!isPlainObject(value)) fail("task_driver_policy_shape_invalid");
  const validFrom = normalizeTimestamp(value.valid_from, "task_driver_policy_valid_from_invalid");
  const knownAt = normalizeTimestamp(value.known_at, "task_driver_policy_known_at_invalid");
  const recordedAt = normalizeTimestamp(value.recorded_at, "task_driver_policy_recorded_at_invalid");
  return Date.parse(validFrom) <= Date.parse(cutoff.valid_at)
    && Date.parse(knownAt) <= Date.parse(cutoff.known_at)
    && Date.parse(recordedAt) <= Date.parse(cutoff.known_at);
}

function policyRevocationRecordVisibleAt(value, cutoff) {
  if (!isPlainObject(value)) fail("task_driver_policy_revocation_shape_invalid");
  const revokedAt = normalizeTimestamp(
    value.revoked_at,
    "task_driver_policy_revocation_valid_at_invalid",
  );
  const knownAt = normalizeTimestamp(
    value.known_at,
    "task_driver_policy_revocation_known_at_invalid",
  );
  const recordedAt = normalizeTimestamp(
    value.recorded_at,
    "task_driver_policy_revocation_recorded_at_invalid",
  );
  return Date.parse(revokedAt) <= Date.parse(cutoff.valid_at)
    && Date.parse(knownAt) <= Date.parse(cutoff.known_at)
    && Date.parse(recordedAt) <= Date.parse(cutoff.known_at);
}

function validatePolicyAuthority(
  event,
  driver,
  policiesByRef,
  supersededPoliciesByRef,
  policyRevocationsByPolicyRef,
) {
  if (event.authority_kind === "owner_decision") {
    if (driver.owner_decision_ref === null || !refsEqual(driver.owner_decision_ref, event.owner_decision_ref)) {
      fail("task_driver_owner_decision_binding_mismatch");
    }
    return { policy: null, policyRevocation: null };
  }
  const policy = policiesByRef.get(refKey(event.policy_ref));
  if (!policy) fail("task_driver_policy_not_found");
  const supersededAt = supersededPoliciesByRef.get(refKey(event.policy_ref));
  if (supersededAt !== undefined && Date.parse(event.valid_at) >= Date.parse(supersededAt)) {
    fail("task_driver_policy_superseded");
  }
  if (driver.policy_ref !== null && !refsEqual(driver.policy_ref, event.policy_ref)) {
    fail("task_driver_policy_binding_mismatch");
  }
  if (!refsEqual(policy.writer_ref, event.writer_ref)) fail("task_driver_policy_writer_mismatch");
  if (!policy.allowed_driver_kinds.includes(driver.driver_kind)) fail("task_driver_policy_driver_scope_denied");
  if (!policy.allowed_trigger_owner_surfaces.includes(driver.trigger_event_ref.owner_surface)) {
    fail("task_driver_policy_source_scope_denied");
  }
  const policyStart = Date.parse(policy.valid_from);
  const policyEnd = Date.parse(policy.valid_until);
  const eventTimes = [event.valid_at, event.known_at, event.recorded_at].map(Date.parse);
  if (eventTimes.some((eventTime) => eventTime < policyStart || eventTime > policyEnd)) {
    fail("task_driver_policy_expired");
  }
  const policyRevocation = policyRevocationsByPolicyRef.get(refKey(event.policy_ref)) ?? null;
  if (
    policyRevocation !== null
    && eventTimes.some((eventTime) => eventTime >= Date.parse(policyRevocation.revoked_at))
  ) {
    fail("task_driver_policy_revoked");
  }
  return { policy, policyRevocation };
}

function authorityRefForEvent(event) {
  return event.authority_kind === "owner_decision" ? event.owner_decision_ref : event.policy_ref;
}

function buildAuthorityResolutionRequest(event, driver, cutoff, policy, policyRevocation) {
  return deepFreeze({
    project_ref: driver.project_ref,
    event_ref: typedRef("event", TASK_DRIVER_OWNER_SURFACE, event.event_id),
    event_digest: event.event_digest,
    event_sequence: event.event_sequence,
    driver_ref: event.driver_ref,
    driver_digest: event.driver_digest,
    target_intent_ref: event.target_intent_ref,
    intent_digest: event.intent_digest,
    authority_kind: event.authority_kind,
    authority_ref: authorityRefForEvent(event),
    actor_kind: event.actor_kind,
    actor_ref: event.actor_ref,
    writer_ref: event.writer_ref,
    event_kind: event.event_kind,
    event_valid_at: event.valid_at,
    event_known_at: event.known_at,
    event_recorded_at: event.recorded_at,
    cutoff,
    policy_digest: policy?.policy_digest ?? null,
    policy_revocation_digest: policyRevocation?.revocation_digest ?? null,
  });
}

function validateAuthorityAttestation(value, request) {
  assertExactKeys(value, AUTHORITY_ATTESTATION_KEYS, "task_driver_authority_attestation_invalid");
  const payload = {
    schema_version: TASK_DRIVER_AUTHORITY_ATTESTATION_SCHEMA_VERSION,
    project_ref: request.project_ref,
    event_ref: request.event_ref,
    event_digest: request.event_digest,
    event_sequence: request.event_sequence,
    driver_ref: request.driver_ref,
    driver_digest: request.driver_digest,
    target_intent_ref: request.target_intent_ref,
    intent_digest: request.intent_digest,
    authority_kind: request.authority_kind,
    authority_ref: request.authority_ref,
    actor_kind: request.actor_kind,
    actor_ref: request.actor_ref,
    writer_ref: request.writer_ref,
    allowed_event_kind: request.event_kind,
    event_valid_at: request.event_valid_at,
    event_known_at: request.event_known_at,
    event_recorded_at: request.event_recorded_at,
    cutoff: request.cutoff,
    policy_digest: request.policy_digest,
    policy_revocation_digest: request.policy_revocation_digest,
  };
  const receivedPayload = { ...value };
  delete receivedPayload.evidence_digest;
  if (canonicalStringify(receivedPayload) !== canonicalStringify(payload)) {
    fail("task_driver_authority_attestation_binding_mismatch");
  }
  const evidenceDigest = normalizeDigest(
    value.evidence_digest,
    "task_driver_authority_evidence_digest_invalid",
  );
  if (evidenceDigest !== canonicalDigest(payload, "soulforge.task_driver.authority_attestation.v1")) {
    fail("task_driver_authority_evidence_digest_mismatch");
  }
  return deepFreeze({ ...payload, evidence_digest: evidenceDigest });
}

function resolveTrustedAuthority(
  authorityResolver,
  event,
  driver,
  cutoff,
  policy,
  policyRevocation,
) {
  if (typeof authorityResolver !== "function") {
    fail("task_driver_trusted_authority_resolver_required");
  }
  const request = buildAuthorityResolutionRequest(
    event,
    driver,
    cutoff,
    policy,
    policyRevocation,
  );
  let value;
  try {
    value = authorityResolver(request);
  } catch {
    fail("task_driver_authority_resolution_failed");
  }
  return validateAuthorityAttestation(value, request);
}

function assertApplyAuthorityChain(event, approvedState) {
  if (
    approvedState?.approval_authority_kind !== event.authority_kind
    || !refsEqual(approvedState?.approval_owner_decision_ref ?? null, event.owner_decision_ref)
    || !refsEqual(approvedState?.approval_policy_ref ?? null, event.policy_ref)
    || !refsEqual(approvedState?.approval_writer_ref ?? null, event.writer_ref)
  ) {
    fail("task_driver_apply_authority_chain_mismatch");
  }
}

function decisionTarget(eventKind) {
  return {
    candidate: "candidate",
    review_required: "review_required",
    approve: "approved",
    apply: "applied",
    reject: "rejected",
    supersede: "superseded",
  }[eventKind];
}

function decisionTransitionAllowed(current, eventKind) {
  if (eventKind === "candidate") return current === null;
  if (eventKind === "review_required") return current === "candidate";
  if (eventKind === "approve") return current === "candidate" || current === "review_required";
  if (eventKind === "apply") return current === "approved";
  if (eventKind === "reject") return ["candidate", "review_required", "approved"].includes(current);
  return ["candidate", "review_required", "approved", "applied"].includes(current);
}

function normalizeInitialTask(value) {
  assertExactKeys(
    value,
    ["project_ref", "task_ref", "current_task_revision_ref", "work_status"],
    "task_driver_initial_task_invalid",
  );
  const projectRef = normalizeTypedRef(value.project_ref, {
    entityTypes: new Set(["project"]),
    code: "task_driver_initial_project_ref_invalid",
  });
  requireOwnerSurface(projectRef, TASK_OWNER_SURFACE, "task_driver_initial_project_owner_invalid");
  const taskRef = normalizeTypedRef(value.task_ref, {
    entityTypes: new Set(["task"]),
    code: "task_driver_initial_task_ref_invalid",
  });
  if (taskRef.owner_surface !== TASK_OWNER_SURFACE) fail("task_driver_initial_task_owner_invalid");
  const currentTaskRevisionRef = nullableRef(
    value.current_task_revision_ref,
    new Set(["task_revision"]),
    "task_driver_initial_task_revision_ref_invalid",
  );
  requireOwnerSurface(
    currentTaskRevisionRef,
    TASK_OWNER_SURFACE,
    "task_driver_initial_task_revision_owner_invalid",
  );
  const workStatus = normalizeString(value.work_status, "task_driver_initial_task_status_invalid", {
    pattern: SAFE_CODE_RE,
  });
  if (!WORK_STATUS_SET.has(workStatus)) fail("task_driver_initial_task_status_invalid");
  return {
    project_ref: projectRef,
    task_ref: taskRef,
    current_task_revision_ref: currentTaskRevisionRef,
    work_status: workStatus,
    last_driver_ref: null,
    last_event_ref: null,
  };
}

function assertReplayCollection(value, code) {
  if (!Array.isArray(value)) fail("task_driver_replay_shape_invalid");
  if (value.length > TASK_DRIVER_LIMITS.replay_max_records_per_collection) fail(code);
}

function applyIntent(tasks, event, driver, intent) {
  const key = refKey(event.result_task_ref);
  if (intent.intent_kind === "task_create") {
    if (tasks.has(key)) fail("task_driver_task_create_conflict");
    tasks.set(key, {
      project_ref: intent.project_ref,
      task_ref: event.result_task_ref,
      current_task_revision_ref: null,
      work_status: "not_started",
      last_driver_ref: event.driver_ref,
      last_event_ref: typedRef("event", TASK_DRIVER_OWNER_SURFACE, event.event_id),
    });
    return "not_started";
  }
  const task = tasks.get(key);
  if (!task) fail("task_driver_target_task_missing");
  if (!refsEqual(task.project_ref, intent.project_ref)) fail("task_driver_task_project_membership_mismatch");
  if (intent.intent_kind === "work_status_transition") {
    if (task.work_status !== intent.expected_from_state_or_revision) fail("task_driver_stale_work_status");
    task.work_status = intent.proposed_to_state_or_patch;
  } else {
    fail("task_driver_field_patch_apply_unsupported");
  }
  task.last_driver_ref = event.driver_ref;
  task.last_event_ref = typedRef("event", TASK_DRIVER_OWNER_SURFACE, event.event_id);
  return task.work_status;
}

export function replayTaskDriverContract(input, options = {}) {
  assertKnownKeys(
    options,
    new Set(["trusted_authority_resolver"]),
    "task_driver_replay_options_invalid",
  );
  const authorityResolver = options.trusted_authority_resolver ?? null;
  assertExactKeys(
    input,
    [
      "intents",
      "drivers",
      "policies",
      "policy_revocations",
      "events",
      "initial_tasks",
      "cutoff",
    ],
    "task_driver_replay_shape_invalid",
  );
  assertReplayCollection(input.intents, "task_driver_replay_collection_too_large");
  assertReplayCollection(input.drivers, "task_driver_replay_collection_too_large");
  assertReplayCollection(input.policies, "task_driver_replay_collection_too_large");
  assertReplayCollection(
    input.policy_revocations,
    "task_driver_replay_collection_too_large",
  );
  assertReplayCollection(input.events, "task_driver_replay_collection_too_large");
  assertReplayCollection(input.initial_tasks, "task_driver_replay_collection_too_large");
  const cutoff = normalizeCutoff(input.cutoff);
  const intentsByRef = new Map();
  for (const value of input.intents) {
    const intent = validateTaskIntent(value);
    const key = refKey(taskIntentRef(intent));
    const previous = intentsByRef.get(key);
    if (previous && previous.intent_digest !== intent.intent_digest) fail("task_intent_id_conflict");
    if (!previous) intentsByRef.set(key, intent);
  }

  const driversByRef = new Map();
  const driversByIdempotency = new Map();
  let duplicateDriverCount = 0;
  for (const value of input.drivers) {
    if (!temporalRecordVisibleAt(value, cutoff, "task_driver")) continue;
    const intent = intentsByRef.get(refKey(value?.target_intent_ref));
    if (!intent) fail("task_driver_intent_not_found");
    const driver = validateTaskDriver(value, intent);
    const previousByKey = driversByIdempotency.get(driver.idempotency_key);
    if (previousByKey) {
      if (previousByKey.driver_digest !== driver.driver_digest) fail("task_driver_idempotency_conflict");
      duplicateDriverCount += 1;
      continue;
    }
    const driverRef = taskDriverRef(driver, intent);
    const previousByRef = driversByRef.get(refKey(driverRef));
    if (previousByRef && previousByRef.driver.driver_digest !== driver.driver_digest) {
      fail("task_driver_id_conflict");
    }
    const entry = { driver, intent, driverRef };
    driversByIdempotency.set(driver.idempotency_key, driver);
    driversByRef.set(refKey(driverRef), entry);
  }

  const policiesByRef = new Map();
  for (const value of input.policies) {
    if (!policyRecordVisibleAt(value, cutoff)) continue;
    const policy = validateTaskDriverPolicy(value);
    const key = refKey(policy.policy_ref);
    const previous = policiesByRef.get(key);
    if (previous && previous.policy_digest !== policy.policy_digest) fail("task_driver_policy_ref_conflict");
    if (!previous) policiesByRef.set(key, policy);
  }
  const supersededPoliciesByRef = new Map();
  for (const policy of policiesByRef.values()) {
    if (policy.supersedes_policy_ref === null) continue;
    const targetKey = refKey(policy.supersedes_policy_ref);
    if (!policiesByRef.has(targetKey)) fail("task_driver_policy_lineage_target_missing");
    const previous = supersededPoliciesByRef.get(targetKey);
    if (previous === undefined || Date.parse(policy.valid_from) < Date.parse(previous)) {
      supersededPoliciesByRef.set(targetKey, policy.valid_from);
    }
  }

  const policyRevocationsByRef = new Map();
  const policyRevocationsByPolicyRef = new Map();
  for (const value of input.policy_revocations) {
    if (!policyRevocationRecordVisibleAt(value, cutoff)) continue;
    const revocation = validateTaskDriverPolicyRevocation(value);
    const revocationKey = refKey(revocation.revocation_ref);
    const previousByRef = policyRevocationsByRef.get(revocationKey);
    if (
      previousByRef
      && previousByRef.revocation_digest !== revocation.revocation_digest
    ) fail("task_driver_policy_revocation_ref_conflict");
    if (previousByRef) continue;
    const policyKey = refKey(revocation.policy_ref);
    const policy = policiesByRef.get(policyKey);
    if (!policy) fail("task_driver_policy_revocation_policy_missing");
    if (Date.parse(revocation.revoked_at) < Date.parse(policy.valid_from)) {
      fail("task_driver_policy_revocation_before_policy");
    }
    policyRevocationsByRef.set(revocationKey, revocation);
    const previousForPolicy = policyRevocationsByPolicyRef.get(policyKey);
    if (
      previousForPolicy === undefined
      || Date.parse(revocation.revoked_at) < Date.parse(previousForPolicy.revoked_at)
      || (
        revocation.revoked_at === previousForPolicy.revoked_at
        && compareText(revocation.revocation_digest, previousForPolicy.revocation_digest) < 0
      )
    ) policyRevocationsByPolicyRef.set(policyKey, revocation);
  }

  const eventsByIdempotency = new Map();
  const eventsBySequence = new Map();
  const events = [];
  let duplicateEventCount = 0;
  for (const value of input.events) {
    if (!temporalRecordVisibleAt(value, cutoff, "task_driver_event")) continue;
    const entry = driversByRef.get(refKey(value?.driver_ref));
    if (!entry) fail("task_driver_event_driver_not_found");
    const event = validateTaskDriverEvent(value, entry.driver, entry.intent);
    const previous = eventsByIdempotency.get(event.idempotency_key);
    if (previous) {
      if (previous.event_digest !== event.event_digest) fail("task_driver_event_idempotency_conflict");
      duplicateEventCount += 1;
      continue;
    }
    const previousBySequence = eventsBySequence.get(event.event_sequence);
    if (previousBySequence && previousBySequence.event_digest !== event.event_digest) {
      fail("task_driver_event_sequence_conflict");
    }
    eventsByIdempotency.set(event.idempotency_key, event);
    eventsBySequence.set(event.event_sequence, event);
    events.push(event);
  }
  events.sort((left, right) => left.event_sequence - right.event_sequence);
  for (let index = 1; index < events.length; index += 1) {
    if (Date.parse(events[index].recorded_at) < Date.parse(events[index - 1].recorded_at)) {
      fail("task_driver_event_recorded_at_regression");
    }
  }

  const tasks = new Map();
  for (const value of input.initial_tasks) {
    const task = normalizeInitialTask(value);
    const key = refKey(task.task_ref);
    if (tasks.has(key)) fail("task_driver_initial_task_duplicate");
    tasks.set(key, task);
  }
  const driverStates = new Map();
  for (const event of events) {
    const entry = driversByRef.get(refKey(event.driver_ref));
    const current = driverStates.get(refKey(event.driver_ref)) ?? null;
    if (!decisionTransitionAllowed(current?.decision_application_state ?? null, event.event_kind)) {
      fail("task_driver_decision_transition_illegal");
    }
    let authorityAttestation = null;
    if (["approve", "apply", "reject", "supersede"].includes(event.event_kind)) {
      const authority = validatePolicyAuthority(
        event,
        entry.driver,
        policiesByRef,
        supersededPoliciesByRef,
        policyRevocationsByPolicyRef,
      );
      authorityAttestation = resolveTrustedAuthority(
        authorityResolver,
        event,
        entry.driver,
        cutoff,
        authority.policy,
        authority.policyRevocation,
      );
    }
    if (event.event_kind === "apply") assertApplyAuthorityChain(event, current);
    let workStatus = current?.work_status ?? null;
    if (event.event_kind === "apply") workStatus = applyIntent(tasks, event, entry.driver, entry.intent);
    if (event.event_kind === "supersede") {
      const replacement = driversByRef.get(refKey(event.superseding_driver_ref));
      if (!replacement || !refsEqual(replacement.driver.supersedes_driver_ref, event.driver_ref)) {
        fail("task_driver_supersede_binding_mismatch");
      }
      if (!refsEqual(replacement.driver.project_ref, entry.driver.project_ref)) {
        fail("task_driver_supersede_project_mismatch");
      }
    }
    const approval = event.event_kind === "approve"
      ? {
        approval_authority_kind: event.authority_kind,
        approval_owner_decision_ref: event.owner_decision_ref,
        approval_policy_ref: event.policy_ref,
        approval_writer_ref: event.writer_ref,
        approval_authority_evidence_digest: authorityAttestation.evidence_digest,
      }
      : {
        approval_authority_kind: current?.approval_authority_kind ?? null,
        approval_owner_decision_ref: current?.approval_owner_decision_ref ?? null,
        approval_policy_ref: current?.approval_policy_ref ?? null,
        approval_writer_ref: current?.approval_writer_ref ?? null,
        approval_authority_evidence_digest: current?.approval_authority_evidence_digest ?? null,
      };
    driverStates.set(refKey(event.driver_ref), {
      driver_ref: event.driver_ref,
      driver_digest: entry.driver.driver_digest,
      target_intent_ref: entry.driver.target_intent_ref,
      intent_digest: entry.driver.intent_digest,
      decision_application_state: decisionTarget(event.event_kind),
      work_status: workStatus,
      last_event_ref: typedRef("event", TASK_DRIVER_OWNER_SURFACE, event.event_id),
      last_authority_evidence_digest:
        authorityAttestation?.evidence_digest ?? current?.last_authority_evidence_digest ?? null,
      ...approval,
    });
  }

  const materialProjection = {
    schema_version: TASK_DRIVER_PROJECTION_SCHEMA_VERSION,
    cutoff,
    drivers: [...driverStates.values()].sort((left, right) => compareText(refKey(left.driver_ref), refKey(right.driver_ref))),
    tasks: [...tasks.values()].map((task) => ({
      project_ref: task.project_ref,
      task_ref: task.task_ref,
      current_task_revision_ref: task.current_task_revision_ref,
      work_status: task.work_status,
      last_driver_ref: task.last_driver_ref,
      last_event_ref: task.last_event_ref,
    })).sort((left, right) => compareText(refKey(left.task_ref), refKey(right.task_ref))),
  };
  const receipts = {
      accepted_driver_count: driversByRef.size,
      duplicate_driver_count: duplicateDriverCount,
      accepted_event_count: events.length,
      duplicate_event_count: duplicateEventCount,
  };
  return deepFreeze({
    ...materialProjection,
    receipts,
    projection_digest: canonicalDigest(materialProjection, "soulforge.task_driver.projection.v1"),
  });
}

export function createCompletionFollowupCandidate(input) {
  assertExactKeys(input, [
    "project_ref",
    "task_candidate_ref",
    "parent_task_ref",
    "completion_event_ref",
    "actor_ref",
    "writer_ref",
    "event_sequence",
    "valid_at",
    "known_at",
    "recorded_at",
  ], "task_driver_completion_followup_shape_invalid");
  const intent = buildTaskIntent({
    intent_kind: "task_create",
    project_ref: input.project_ref,
    task_candidate_ref: input.task_candidate_ref,
    expected_from_state_or_revision: null,
    proposed_to_state_or_patch: { initial_work_status: "not_started" },
  });
  const driver = buildTaskDriver({
    driver_kind: "completion_followup",
    intent,
    trigger_event_ref: input.completion_event_ref,
    parent_task_refs: [input.parent_task_ref],
    completion_event_refs: [input.completion_event_ref],
    why_code: "completion_followup",
    reason_template_id: TASK_DRIVER_REASON_TEMPLATES.completion_followup,
    valid_at: input.valid_at,
    known_at: input.known_at,
    recorded_at: input.recorded_at,
  });
  const event = buildTaskDriverEvent({
    event_kind: "candidate",
    event_sequence: input.event_sequence,
    driver,
    intent,
    actor_kind: "llm",
    actor_ref: input.actor_ref,
    writer_ref: input.writer_ref,
    authority_kind: "none",
    owner_decision_ref: null,
    policy_ref: null,
    valid_at: input.valid_at,
    known_at: input.known_at,
    recorded_at: input.recorded_at,
    result_project_ref: null,
    result_task_candidate_ref: null,
    result_task_ref: null,
    work_status_transition: null,
    superseding_driver_ref: null,
  });
  return deepFreeze({ intent, driver, event });
}

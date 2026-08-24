export const ASSIGNMENT_PACKET_SCHEMA =
  "soulforge.assignment_policy.assignment_packet.v1";

const MATCH_SCHEMA = "soulforge.role_capability.match_result.v1";
const POLICY_SCHEMA = "soulforge.assignment_policy.snapshot.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const SECRET_VALUE = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]/iu;
const LOCAL_PATH_VALUE = /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]|\\\\[A-Za-z0-9]|(?:^|[^A-Za-z0-9])\/(?:Users|home|mnt|opt|srv|var|etc|tmp|root|Volumes|Applications)\/|(?:^|[^A-Za-z0-9])(?:_workmeta|_workspaces|private-state)\/|guild_hall\/state\//iu;
const FORBIDDEN_KEY = /(^|_)(raw|prompt|message|body|payload|secret|token|password|path|cwd|transcript|reasoning|tool_io)(_|$)/iu;
const MAX_DEPTH = 10;
const MAX_LIST = 32;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshot(value, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    if (value.length > MAX_LIST) return null;
    const copy = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor || descriptor.get || descriptor.set) return null;
      const child = snapshot(descriptor.value, depth + 1);
      if (child === null && descriptor.value !== null) return null;
      copy.push(child);
    }
    return copy;
  }
  if (!isPlainObject(value)) return null;
  const copy = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) return null;
    const child = snapshot(descriptor.value, depth + 1);
    if (child === null && descriptor.value !== null) return null;
    Object.defineProperty(copy, key, {
      value: child,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function metadataViolation(value, depth = 0) {
  if (depth > MAX_DEPTH) return true;
  if (typeof value === "string") return SECRET_VALUE.test(value) || LOCAL_PATH_VALUE.test(value);
  if (Array.isArray(value)) return value.some((entry) => metadataViolation(entry, depth + 1));
  if (!isPlainObject(value)) return value !== null && typeof value === "object";
  return Object.entries(value).some(([key, child]) => (
    FORBIDDEN_KEY.test(key) || metadataViolation(child, depth + 1)
  ));
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID.test(value)
    && !SECRET_VALUE.test(value) && !LOCAL_PATH_VALUE.test(value);
}

function isSnapshotRef(value) {
  return exactKeys(value, ["revision_id", "content_sha256"])
    && isSafeId(value.revision_id) && SHA256.test(value.content_sha256);
}

function isTaskRef(value) {
  return exactKeys(value, ["provider", "task_id"])
    && isSafeId(value.provider) && isSafeId(value.task_id);
}

function isRevisionRef(value, taskRef) {
  return exactKeys(value, ["provider", "task_id", "revision_id", "content_sha256"])
    && value.provider === taskRef.provider && value.task_id === taskRef.task_id
    && isSafeId(value.revision_id) && SHA256.test(value.content_sha256);
}

function isIdList(value, { allowEmpty = false } = {}) {
  return Array.isArray(value) && value.length <= MAX_LIST
    && (allowEmpty || value.length > 0) && value.every(isSafeId)
    && new Set(value).size === value.length;
}

function isExactSet(value, required) {
  return value.length === required.length
    && value.every((entry) => required.includes(entry));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hold(code) {
  return deepFreeze({ status: "HOLD", hold_code: code, assignment_packet: null });
}

function validMatcherResult(value) {
  const keys = [
    "schema_version", "state", "hold_code", "task_ref", "work_brief_revision_ref",
    "action_ref", "authority_ref", "role_snapshot_ref", "capability_snapshot_ref",
    "responsible_role_ref", "responsible_actor_ref", "required_capability_refs",
    "missing_capability_refs", "candidates",
  ];
  if (!exactKeys(value, keys) || value.schema_version !== MATCH_SCHEMA
    || !["candidate", "hold"].includes(value.state)
    || (value.hold_code !== null && !isSafeId(value.hold_code))
    || !isTaskRef(value.task_ref) || !isRevisionRef(value.work_brief_revision_ref, value.task_ref)
    || !isSafeId(value.action_ref) || !isSafeId(value.authority_ref)
    || !isSnapshotRef(value.role_snapshot_ref) || !isSnapshotRef(value.capability_snapshot_ref)
    || !isSafeId(value.responsible_role_ref) || !isSafeId(value.responsible_actor_ref)
    || !isIdList(value.required_capability_refs)
    || !isIdList(value.missing_capability_refs, { allowEmpty: true })
    || !Array.isArray(value.candidates) || value.candidates.length > MAX_LIST) return false;
  for (const candidate of value.candidates) {
    if (!exactKeys(candidate, [
      "actor_ref", "performing_agent_id", "bot_ref", "executor_ref", "match_reason_refs",
    ]) || !isSafeId(candidate.actor_ref) || !isSafeId(candidate.performing_agent_id)
      || !isSafeId(candidate.bot_ref) || !isSafeId(candidate.executor_ref)
      || !isIdList(candidate.match_reason_refs)
      || !isExactSet(candidate.match_reason_refs, value.required_capability_refs)) return false;
  }
  if (value.state === "candidate") {
    return value.hold_code === null && value.missing_capability_refs.length === 0
      && value.candidates.length > 0;
  }
  return value.hold_code !== null && value.candidates.length === 0;
}

function validPolicy(value) {
  return exactKeys(value, [
    "schema_version", "validation_state", "mode", "policy_revision_ref",
  ]) && value.schema_version === POLICY_SCHEMA
    && value.validation_state === "prevalidated"
    && isSafeId(value.mode) && isSnapshotRef(value.policy_revision_ref);
}

export function assignCandidate(rawInput) {
  const input = snapshot(rawInput);
  if (!input || metadataViolation(input)) return hold("PACKET_METADATA_ONLY_REQUIRED");
  if (!exactKeys(input, ["matcher_result", "policy"])) {
    return hold("PACKET_METADATA_ONLY_REQUIRED");
  }
  if (!validPolicy(input.policy)) return hold("ASSIGNMENT_POLICY_INVALID");
  if (input.policy.mode !== "responsible_ceo_triage") return hold("POLICY_MODE_NOT_ENABLED");
  if (!validMatcherResult(input.matcher_result)) return hold("MATCHER_RESULT_INVALID");
  const match = input.matcher_result;
  if (match.state === "hold") return hold("ROLE_CAPABILITY_HOLD");

  const responsible = match.candidates.filter(
    (candidate) => candidate.actor_ref === match.responsible_actor_ref,
  );
  if (responsible.length === 0) return hold("RESPONSIBLE_ACTOR_CANDIDATE_MISSING");
  if (responsible.length !== 1) return hold("RESPONSIBLE_ACTOR_CANDIDATE_AMBIGUOUS");
  const selected = responsible[0];

  return deepFreeze({
    schema_version: ASSIGNMENT_PACKET_SCHEMA,
    validation_state: "prevalidated",
    assignment_state: "assigned",
    policy_mode: input.policy.mode,
    policy_revision_ref: structuredClone(input.policy.policy_revision_ref),
    task_ref: structuredClone(match.task_ref),
    work_brief_revision_ref: structuredClone(match.work_brief_revision_ref),
    action_ref: match.action_ref,
    authority_ref: match.authority_ref,
    responsible_role_ref: match.responsible_role_ref,
    performer_binding: {
      actor_ref: selected.actor_ref,
      performing_agent_id: selected.performing_agent_id,
      bot_ref: selected.bot_ref,
      executor_ref: selected.executor_ref,
      capability_snapshot_ref: structuredClone(match.capability_snapshot_ref),
    },
  });
}

export const ROLE_CAPABILITY_MATCH_SCHEMA =
  "soulforge.role_capability.match_result.v1";

const WORK_SCHEMA = "soulforge.role_capability.work_task_contract.v1";
const ROLE_SCHEMA = "soulforge.organization.role_snapshot.v1";
const CAPABILITY_SCHEMA = "soulforge.organization.capability_snapshot.v1";
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
  if (typeof value === "string") {
    return SECRET_VALUE.test(value) || LOCAL_PATH_VALUE.test(value);
  }
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

function isRef(value) {
  return exactKeys(value, ["revision_id", "content_sha256"])
    && isSafeId(value.revision_id) && SHA256.test(value.content_sha256);
}

function isTaskRef(value) {
  return exactKeys(value, ["provider", "task_id"])
    && isSafeId(value.provider) && isSafeId(value.task_id);
}

function isRevisionRef(value, taskRef) {
  return exactKeys(value, ["provider", "task_id", "revision_id", "content_sha256"])
    && value.provider === taskRef.provider
    && value.task_id === taskRef.task_id
    && isSafeId(value.revision_id)
    && SHA256.test(value.content_sha256);
}

function isUniqueIdList(value, { allowEmpty = false } = {}) {
  return Array.isArray(value) && value.length <= MAX_LIST
    && (allowEmpty || value.length > 0)
    && value.every(isSafeId)
    && new Set(value).size === value.length;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hold(code, basis = null, missing = []) {
  return deepFreeze({
    schema_version: ROLE_CAPABILITY_MATCH_SCHEMA,
    state: "hold",
    hold_code: code,
    task_ref: basis?.task_ref ?? null,
    work_brief_revision_ref: basis?.work_brief_revision_ref ?? null,
    action_ref: basis?.action_ref ?? null,
    authority_ref: basis?.authority_ref ?? null,
    role_snapshot_ref: basis?.role_snapshot_ref ?? null,
    capability_snapshot_ref: basis?.capability_snapshot_ref ?? null,
    responsible_role_ref: basis?.required_role_ref ?? null,
    responsible_actor_ref: basis?.responsible_actor_ref ?? null,
    required_capability_refs: basis?.required_capability_refs ?? [],
    missing_capability_refs: [...missing].sort(),
    candidates: [],
  });
}

function validateWork(value) {
  const keys = [
    "schema_version", "validation_state", "task_ref", "work_brief_revision_ref",
    "action_ref", "authority_ref", "required_role_ref", "required_capability_refs",
  ];
  return exactKeys(value, keys)
    && value.schema_version === WORK_SCHEMA
    && value.validation_state === "prevalidated"
    && isTaskRef(value.task_ref)
    && isRevisionRef(value.work_brief_revision_ref, value.task_ref)
    && isSafeId(value.action_ref)
    && isSafeId(value.authority_ref)
    && isSafeId(value.required_role_ref)
    && isUniqueIdList(value.required_capability_refs);
}

function validateRoleSnapshot(value) {
  if (!exactKeys(value, ["schema_version", "snapshot_ref", "roles"])
    || value.schema_version !== ROLE_SCHEMA || !isRef(value.snapshot_ref)
    || !Array.isArray(value.roles) || value.roles.length === 0 || value.roles.length > MAX_LIST) {
    return false;
  }
  const roleRefs = new Set();
  for (const role of value.roles) {
    if (!exactKeys(role, [
      "role_ref", "status", "responsible_action_refs", "responsible_actor_ref",
      "candidate_actor_refs",
    ]) || !isSafeId(role.role_ref) || !["active", "disabled"].includes(role.status)
      || !isUniqueIdList(role.responsible_action_refs)
      || !isSafeId(role.responsible_actor_ref)
      || !isUniqueIdList(role.candidate_actor_refs)
      || !role.candidate_actor_refs.includes(role.responsible_actor_ref)
      || roleRefs.has(role.role_ref)) return false;
    roleRefs.add(role.role_ref);
  }
  return true;
}

function validateCapabilitySnapshot(value) {
  if (!exactKeys(value, ["schema_version", "snapshot_ref", "actor_bindings"])
    || value.schema_version !== CAPABILITY_SCHEMA || !isRef(value.snapshot_ref)
    || !Array.isArray(value.actor_bindings) || value.actor_bindings.length === 0
    || value.actor_bindings.length > MAX_LIST) return false;
  const actorRefs = new Set();
  const agentIds = new Set();
  const botRefs = new Set();
  for (const binding of value.actor_bindings) {
    if (!exactKeys(binding, [
      "actor_ref", "performing_agent_id", "bot_ref", "executor_ref", "status",
      "capability_refs",
    ]) || !isSafeId(binding.actor_ref) || !isSafeId(binding.performing_agent_id)
      || !isSafeId(binding.bot_ref) || !isSafeId(binding.executor_ref)
      || !["active", "disabled"].includes(binding.status)
      || !isUniqueIdList(binding.capability_refs)
      || actorRefs.has(binding.actor_ref) || agentIds.has(binding.performing_agent_id)
      || botRefs.has(binding.bot_ref)) return false;
    actorRefs.add(binding.actor_ref);
    agentIds.add(binding.performing_agent_id);
    botRefs.add(binding.bot_ref);
  }
  return true;
}

export function matchRoleCapabilities(rawInput) {
  const input = snapshot(rawInput);
  if (!input || metadataViolation(input)) return hold("PACKET_METADATA_ONLY_REQUIRED");
  if (!exactKeys(input, ["work_task_contract", "role_snapshot", "capability_snapshot"])) {
    return hold("PACKET_METADATA_ONLY_REQUIRED");
  }
  if (!validateWork(input.work_task_contract)) return hold("WORK_TASK_CONTRACT_INVALID");
  const work = input.work_task_contract;
  const basis = {
    task_ref: structuredClone(work.task_ref),
    work_brief_revision_ref: structuredClone(work.work_brief_revision_ref),
    action_ref: work.action_ref,
    authority_ref: work.authority_ref,
    required_role_ref: work.required_role_ref,
    required_capability_refs: [...work.required_capability_refs].sort(),
    role_snapshot_ref: structuredClone(input.role_snapshot?.snapshot_ref ?? null),
    capability_snapshot_ref: structuredClone(input.capability_snapshot?.snapshot_ref ?? null),
  };
  if (!validateRoleSnapshot(input.role_snapshot)) return hold("ROLE_SNAPSHOT_INVALID", basis);
  if (!validateCapabilitySnapshot(input.capability_snapshot)) {
    return hold("CAPABILITY_SNAPSHOT_INVALID", basis);
  }

  const role = input.role_snapshot.roles.find((row) => row.role_ref === work.required_role_ref);
  if (!role) return hold("RESPONSIBLE_ROLE_NOT_FOUND", basis);
  basis.responsible_actor_ref = role.responsible_actor_ref;
  if (role.status !== "active") return hold("RESPONSIBLE_ROLE_NOT_ACTIVE", basis);
  if (!role.responsible_action_refs.includes(work.action_ref)) return hold("ROLE_ACTION_MISMATCH", basis);

  const required = [...work.required_capability_refs].sort();
  const bindings = new Map(input.capability_snapshot.actor_bindings.map((row) => [row.actor_ref, row]));
  const responsibleBinding = bindings.get(role.responsible_actor_ref);
  const missing = required.filter((capability) => (
    responsibleBinding?.status !== "active"
      || !responsibleBinding.capability_refs.includes(capability)
  ));
  const candidates = role.candidate_actor_refs
    .map((actorRef) => bindings.get(actorRef))
    .filter((binding) => binding?.status === "active"
      && required.every((capability) => binding.capability_refs.includes(capability)))
    .map((binding) => ({
      actor_ref: binding.actor_ref,
      performing_agent_id: binding.performing_agent_id,
      bot_ref: binding.bot_ref,
      executor_ref: binding.executor_ref,
      match_reason_refs: [...required],
    }));
  if (missing.length > 0 || candidates.length === 0) {
    return hold("CAPABILITY_REQUIREMENT_UNMET", basis, missing);
  }

  return deepFreeze({
    schema_version: ROLE_CAPABILITY_MATCH_SCHEMA,
    state: "candidate",
    hold_code: null,
    task_ref: basis.task_ref,
    work_brief_revision_ref: basis.work_brief_revision_ref,
    action_ref: basis.action_ref,
    authority_ref: basis.authority_ref,
    role_snapshot_ref: basis.role_snapshot_ref,
    capability_snapshot_ref: basis.capability_snapshot_ref,
    responsible_role_ref: role.role_ref,
    responsible_actor_ref: role.responsible_actor_ref,
    required_capability_refs: required,
    missing_capability_refs: [],
    candidates,
  });
}

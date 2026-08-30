import { createHash } from "node:crypto";
import { types } from "node:util";

export const HERMES_AGENT_BACKUP_PACKET_SCHEMA_VERSION =
  "soulforge.backup_controller.hermes_agent_backup.packet.v1";
export const HERMES_AGENT_BACKUP_MANIFEST_SCHEMA_VERSION =
  "soulforge.backup_controller.hermes_agent_backup.manifest.v1";
export const HERMES_AGENT_BACKUP_RESULT_SCHEMA_VERSION =
  "soulforge.backup_controller.hermes_agent_backup.result.v1";

export const HERMES_AGENT_BACKUP_CODES = Object.freeze({
  INPUT_INVALID: "HERMES_AGENT_BACKUP_INPUT_INVALID",
  AGENT_BINDING_REQUIRED: "HERMES_AGENT_BACKUP_AGENT_BINDING_REQUIRED",
  RUNTIME_BINDING_REQUIRED: "HERMES_AGENT_BACKUP_RUNTIME_BINDING_REQUIRED",
  INSTRUCTION_CUSTODY_REQUIRED: "HERMES_AGENT_BACKUP_INSTRUCTION_CUSTODY_REQUIRED",
  CAPABILITY_CUSTODY_REQUIRED: "HERMES_AGENT_BACKUP_CAPABILITY_CUSTODY_REQUIRED",
  SESSION_CUSTODY_REQUIRED: "HERMES_AGENT_BACKUP_SESSION_CUSTODY_REQUIRED",
  SESSION_CROSSWALK_REQUIRED: "HERMES_AGENT_BACKUP_SESSION_CROSSWALK_REQUIRED",
  MEMORY_CUSTODY_REQUIRED: "HERMES_AGENT_BACKUP_MEMORY_CUSTODY_REQUIRED",
  SCHEDULE_CUSTODY_REQUIRED: "HERMES_AGENT_BACKUP_SCHEDULE_CUSTODY_REQUIRED",
  BACKUP_GENERATION_REQUIRED: "HERMES_AGENT_BACKUP_GENERATION_REQUIRED",
  RESTORE_READBACK_REQUIRED: "HERMES_AGENT_BACKUP_RESTORE_READBACK_REQUIRED",
  HUMAN_ACCEPTANCE_REQUIRED: "HERMES_AGENT_BACKUP_HUMAN_ACCEPTANCE_REQUIRED",
  CLAIM_BOUNDARY_REQUIRED: "HERMES_AGENT_BACKUP_CLAIM_BOUNDARY_REQUIRED",
});

const C = HERMES_AGENT_BACKUP_CODES;
const PACKET_FIELDS = Object.freeze([
  "schema_version", "feature_state", "agent_binding", "runtime_binding",
  "instruction_custody", "capability_custody", "session_custody",
  "memory_custody", "schedule_custody", "backup_generation",
  "restore_readback", "human_acceptance", "claim_boundaries",
]);
const REF_FIELDS = Object.freeze(["entity_id", "revision_id", "content_id", "content_hash_alg"]);
const AGENT_FIELDS = Object.freeze(["agent_mark_ref", "deployment_ref"]);
const RUNTIME_FIELDS = Object.freeze([
  "runtime_kind", "runtime_ref", "runtime_version", "profile_ref", "bridge_mode",
  "gateway_ref", "plugin_ref", "runtime_config_sha256", "secret_refs",
]);
const INSTRUCTION_FIELDS = Object.freeze([
  "soul_ref", "soul_sha256", "instruction_manifest_ref", "instruction_manifest_sha256",
  "instruction_refs",
]);
const CAPABILITY_FIELDS = Object.freeze([
  "skills_manifest_ref", "skill_refs", "workflows_manifest_ref", "workflow_refs",
  "tool_allowlist_manifest_ref", "tool_allowlist_refs",
]);
const SESSION_FIELDS = Object.freeze([
  "session_store_ref", "session_manifest_ref", "session_manifest_sha256", "session_count",
  "canonical_bot_chat_ref", "buzz_session_ref", "crosswalk_state", "crosswalk_ref",
  "raw_chat_capture", "raw_prompt_capture", "tool_output_capture",
]);
const MEMORY_FIELDS = Object.freeze([
  "generation_ref", "manifest_ref", "manifest_sha256", "classification",
  "retention_policy_ref", "retention_class", "raw_memory_capture",
]);
const SCHEDULE_FIELDS = Object.freeze([
  "definitions_manifest_ref", "definition_count", "schedule_refs", "metadata_only",
  "raw_definition_capture",
]);
const BACKUP_FIELDS = Object.freeze([
  "generation_ref", "manifest_ref", "manifest_sha256", "payload_sha256", "asset_count",
  "included_asset_refs", "byte_count", "classification", "sealed",
]);
const RESTORE_FIELDS = Object.freeze([
  "source_generation_ref", "restore_generation_ref", "isolated_target_ref",
  "readback_manifest_ref", "readback_manifest_sha256", "readback_payload_sha256",
  "exact_readback", "rollback_target_ref", "rollback_verified",
]);
const ACCEPTANCE_FIELDS = Object.freeze([
  "state", "reviewer_ref", "decision_ref", "accepted_generation_ref", "restore_receipt_ref",
]);
const BOUNDARY_FIELDS = Object.freeze([
  "backup_completeness_only", "agent_readiness_evaluated", "task_done_evaluated",
  "accepted_context_evaluated", "runtime_effects_allowed", "raw_payload_capture_allowed",
]);

const HASH = /^sha256:[0-9a-f]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RUNTIME_VERSION = /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/|file:\/\/)/u;
const SECRET = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const MAX = Object.freeze({ depth: 20, values: 12000, keys: 64, array: 256, string: 1024 });
const PACKET_HASH_DOMAIN = "soulforge.backup_controller.hermes_agent_backup.packet.v1";
const MANIFEST_HASH_DOMAIN = "soulforge.backup_controller.hermes_agent_backup.manifest.v1";

function codepointCompare(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeString(value) {
  return typeof value === "string" && value.length <= MAX.string
    && value.normalize("NFC") === value && !CONTROL.test(value)
    && !ABSOLUTE_PATH.test(value) && !SECRET.test(value);
}

function snapshotPlainData(root) {
  const seen = new WeakSet();
  let values = 0;
  function walk(value, depth) {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) throw new Error("snapshot_limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (!safeString(value)) throw new Error("snapshot_string");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw new Error("snapshot_number");
      return value;
    }
    if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) throw new Error("snapshot_shape");
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX.array) throw new Error("snapshot_array");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key, index) => (
        index < value.length ? key !== String(index) : key !== "length"
      ))) throw new Error("snapshot_array_shape");
      return value.map((entry) => walk(entry, depth + 1));
    }
    if (!isPlainRecord(value)) throw new Error("snapshot_record");
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX.keys || keys.some((key) => typeof key !== "string")) throw new Error("snapshot_keys");
    const output = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("snapshot_descriptor");
      Object.defineProperty(output, key, {
        value: walk(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true,
      });
    }
    return output;
  }
  try {
    return walk(root, 0);
  } catch {
    return null;
  }
}

function exactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort(codepointCompare);
  const wanted = [...expected].sort(codepointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function exactRef(value) {
  return exactKeys(value, REF_FIELDS) && UUID_V4.test(value.entity_id)
    && UUID_V4.test(value.revision_id) && HASH.test(value.content_id)
    && value.content_hash_alg === "sha256";
}

function sameRef(left, right) {
  return exactRef(left) && exactRef(right)
    && REF_FIELDS.every((field) => left[field] === right[field]);
}

function nullableRef(value) {
  return value === null || exactRef(value);
}

function canonicalRefs(values) {
  if (!Array.isArray(values) || values.length > 256 || !values.every(exactRef)) return null;
  const identities = values.map((ref) => `${ref.entity_id}\0${ref.revision_id}\0${ref.content_id}`);
  if (new Set(identities).size !== identities.length) return null;
  return [...values].sort((left, right) => codepointCompare(
    `${left.entity_id}\0${left.revision_id}\0${left.content_id}`,
    `${right.entity_id}\0${right.revision_id}\0${right.content_id}`,
  ));
}

function refIdentity(ref) {
  return `${ref.entity_id}\0${ref.revision_id}\0${ref.content_id}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(codepointCompare).map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0${stableJson(value)}`, "utf8").digest("hex")}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validDigestRef(ref, sha256) {
  return exactRef(ref) && HASH.test(sha256) && ref.content_id === sha256;
}

function parseAgent(value, blockers) {
  if (!exactKeys(value, AGENT_FIELDS) || !exactRef(value.agent_mark_ref) || !exactRef(value.deployment_ref)) {
    blockers.add(C.AGENT_BINDING_REQUIRED);
    return null;
  }
  return value;
}

function parseRuntime(value, blockers) {
  const secretRefs = canonicalRefs(value?.secret_refs);
  if (!exactKeys(value, RUNTIME_FIELDS) || value.runtime_kind !== "hermes"
      || !exactRef(value.runtime_ref) || typeof value.runtime_version !== "string"
      || !RUNTIME_VERSION.test(value.runtime_version) || !exactRef(value.profile_ref)
      || !["desktop_acp", "server_buzz_acp", "hermes_native_gateway"].includes(value.bridge_mode)
      || !exactRef(value.gateway_ref) || !exactRef(value.plugin_ref)
      || !HASH.test(value.runtime_config_sha256) || secretRefs === null) {
    blockers.add(C.RUNTIME_BINDING_REQUIRED);
    return null;
  }
  return { ...value, secret_refs: secretRefs };
}

function parseInstructions(value, blockers) {
  const refs = canonicalRefs(value?.instruction_refs);
  if (!exactKeys(value, INSTRUCTION_FIELDS) || !validDigestRef(value.soul_ref, value.soul_sha256)
      || !validDigestRef(value.instruction_manifest_ref, value.instruction_manifest_sha256)
      || refs === null) {
    blockers.add(C.INSTRUCTION_CUSTODY_REQUIRED);
    return null;
  }
  return { ...value, instruction_refs: refs };
}

function parseCapabilities(value, blockers) {
  const skills = canonicalRefs(value?.skill_refs);
  const workflows = canonicalRefs(value?.workflow_refs);
  const tools = canonicalRefs(value?.tool_allowlist_refs);
  if (!exactKeys(value, CAPABILITY_FIELDS) || !exactRef(value.skills_manifest_ref)
      || !exactRef(value.workflows_manifest_ref) || !exactRef(value.tool_allowlist_manifest_ref)
      || skills === null || workflows === null || tools === null) {
    blockers.add(C.CAPABILITY_CUSTODY_REQUIRED);
    return null;
  }
  return { ...value, skill_refs: skills, workflow_refs: workflows, tool_allowlist_refs: tools };
}

function parseSessions(value, blockers) {
  const baseValid = exactKeys(value, SESSION_FIELDS) && exactRef(value.session_store_ref)
    && validDigestRef(value.session_manifest_ref, value.session_manifest_sha256)
    && Number.isSafeInteger(value.session_count) && value.session_count >= 1
    && nullableRef(value.canonical_bot_chat_ref) && nullableRef(value.buzz_session_ref)
    && nullableRef(value.crosswalk_ref) && value.raw_chat_capture === false
    && value.raw_prompt_capture === false && value.tool_output_capture === false;
  if (!baseValid) {
    blockers.add(C.SESSION_CUSTODY_REQUIRED);
    return null;
  }
  if (value.crosswalk_state !== "verified" || !exactRef(value.canonical_bot_chat_ref)
      || !exactRef(value.buzz_session_ref) || !exactRef(value.crosswalk_ref)) {
    blockers.add(C.SESSION_CROSSWALK_REQUIRED);
    return null;
  }
  return value;
}

function parseMemory(value, blockers) {
  if (!exactKeys(value, MEMORY_FIELDS) || !exactRef(value.generation_ref)
      || !validDigestRef(value.manifest_ref, value.manifest_sha256)
      || !["agent_private_memory", "project_local_unaccepted", "rebuildable_runtime_cache"].includes(value.classification)
      || !exactRef(value.retention_policy_ref)
      || !["bounded_generation", "retain_until_superseded", "rebuildable_only"].includes(value.retention_class)
      || value.raw_memory_capture !== false) {
    blockers.add(C.MEMORY_CUSTODY_REQUIRED);
    return null;
  }
  return value;
}

function parseSchedules(value, blockers) {
  const refs = canonicalRefs(value?.schedule_refs);
  if (!exactKeys(value, SCHEDULE_FIELDS) || !exactRef(value.definitions_manifest_ref)
      || !Number.isSafeInteger(value.definition_count) || value.definition_count < 0
      || refs === null || refs.length !== value.definition_count
      || value.metadata_only !== true || value.raw_definition_capture !== false) {
    blockers.add(C.SCHEDULE_CUSTODY_REQUIRED);
    return null;
  }
  return { ...value, schedule_refs: refs };
}

function parseBackup(value, blockers) {
  const includedRefs = canonicalRefs(value?.included_asset_refs);
  if (!exactKeys(value, BACKUP_FIELDS) || !exactRef(value.generation_ref)
      || !validDigestRef(value.manifest_ref, value.manifest_sha256) || !HASH.test(value.payload_sha256)
      || !Number.isSafeInteger(value.asset_count) || value.asset_count < 1
      || includedRefs === null || includedRefs.length !== value.asset_count
      || !Number.isSafeInteger(value.byte_count) || value.byte_count < 1
      || value.classification !== "metadata_only_agent_deployment_backup" || value.sealed !== true) {
    blockers.add(C.BACKUP_GENERATION_REQUIRED);
    return null;
  }
  return { ...value, included_asset_refs: includedRefs };
}

function expectedBackupAssetRefs(normalized) {
  const sections = [
    normalized.agent_binding?.agent_mark_ref,
    normalized.agent_binding?.deployment_ref,
    normalized.runtime_binding?.runtime_ref,
    normalized.runtime_binding?.profile_ref,
    normalized.runtime_binding?.gateway_ref,
    normalized.runtime_binding?.plugin_ref,
    ...(normalized.runtime_binding?.secret_refs ?? []),
    normalized.instruction_custody?.soul_ref,
    normalized.instruction_custody?.instruction_manifest_ref,
    ...(normalized.instruction_custody?.instruction_refs ?? []),
    normalized.capability_custody?.skills_manifest_ref,
    ...(normalized.capability_custody?.skill_refs ?? []),
    normalized.capability_custody?.workflows_manifest_ref,
    ...(normalized.capability_custody?.workflow_refs ?? []),
    normalized.capability_custody?.tool_allowlist_manifest_ref,
    ...(normalized.capability_custody?.tool_allowlist_refs ?? []),
    normalized.session_custody?.session_store_ref,
    normalized.session_custody?.session_manifest_ref,
    normalized.session_custody?.canonical_bot_chat_ref,
    normalized.session_custody?.buzz_session_ref,
    normalized.session_custody?.crosswalk_ref,
    normalized.memory_custody?.generation_ref,
    normalized.memory_custody?.manifest_ref,
    normalized.memory_custody?.retention_policy_ref,
    normalized.schedule_custody?.definitions_manifest_ref,
    ...(normalized.schedule_custody?.schedule_refs ?? []),
  ];
  if (sections.some((ref) => !exactRef(ref))) return null;
  const byIdentity = new Map(sections.map((ref) => [refIdentity(ref), ref]));
  return [...byIdentity.values()].sort((left, right) => codepointCompare(refIdentity(left), refIdentity(right)));
}

function validateBackupCoverage(normalized, blockers) {
  const expected = expectedBackupAssetRefs(normalized);
  const actual = normalized.backup_generation?.included_asset_refs;
  if (expected === null || !Array.isArray(actual) || expected.length !== actual.length
      || expected.some((ref, index) => refIdentity(ref) !== refIdentity(actual[index]))) {
    blockers.add(C.BACKUP_GENERATION_REQUIRED);
  }
}

function parseRestore(value, backup, blockers) {
  if (!exactKeys(value, RESTORE_FIELDS) || !exactRef(value.source_generation_ref)
      || !exactRef(value.restore_generation_ref) || !exactRef(value.isolated_target_ref)
      || !validDigestRef(value.readback_manifest_ref, value.readback_manifest_sha256)
      || !HASH.test(value.readback_payload_sha256) || value.exact_readback !== true
      || !exactRef(value.rollback_target_ref) || value.rollback_verified !== true
      || backup === null || !sameRef(value.source_generation_ref, backup.generation_ref)
      || value.readback_manifest_sha256 !== backup.manifest_sha256
      || value.readback_payload_sha256 !== backup.payload_sha256) {
    blockers.add(C.RESTORE_READBACK_REQUIRED);
    return null;
  }
  return value;
}

function parseAcceptance(value, backup, restore, blockers) {
  const validShape = exactKeys(value, ACCEPTANCE_FIELDS) && exactRef(value.reviewer_ref)
    && nullableRef(value.decision_ref) && nullableRef(value.accepted_generation_ref)
    && nullableRef(value.restore_receipt_ref);
  if (!validShape || value.state !== "accepted" || !exactRef(value.decision_ref)
      || !exactRef(value.accepted_generation_ref) || !exactRef(value.restore_receipt_ref)
      || backup === null || restore === null || !sameRef(value.accepted_generation_ref, backup.generation_ref)) {
    blockers.add(C.HUMAN_ACCEPTANCE_REQUIRED);
    return null;
  }
  return value;
}

function parseBoundaries(value, blockers) {
  if (!exactKeys(value, BOUNDARY_FIELDS) || value.backup_completeness_only !== true
      || value.agent_readiness_evaluated !== false || value.task_done_evaluated !== false
      || value.accepted_context_evaluated !== false || value.runtime_effects_allowed !== false
      || value.raw_payload_capture_allowed !== false) {
    blockers.add(C.CLAIM_BOUNDARY_REQUIRED);
    return null;
  }
  return value;
}

function hold(blockers) {
  return deepFreeze({
    schema_version: HERMES_AGENT_BACKUP_RESULT_SCHEMA_VERSION,
    kind: "hermes_agent_backup_result",
    status: "HOLD",
    feature_state: "off",
    blocker_codes: [...blockers].sort(codepointCompare),
    manifest: null,
    receipt: {
      packet_sha256: null,
      manifest_sha256: null,
      backup_completeness: "hold",
      isolated_restore_readback: "hold",
      human_acceptance: "hold",
      agent_operational_readiness: "not_evaluated",
      task_completion: "not_evaluated",
      accepted_context_promotion: "not_evaluated",
      effects: { filesystem: 0, runtime: 0, network: 0, process: 0, clock: 0 },
      claim_ceiling: "metadata_contract_only",
    },
  });
}

export function evaluateHermesAgentBackupGeneration(packetInput) {
  const packet = snapshotPlainData(packetInput);
  if (packet === null || !exactKeys(packet, PACKET_FIELDS)
      || packet.schema_version !== HERMES_AGENT_BACKUP_PACKET_SCHEMA_VERSION
      || packet.feature_state !== "off") {
    return hold(new Set([C.INPUT_INVALID]));
  }

  const blockers = new Set();
  const normalized = {
    schema_version: packet.schema_version,
    feature_state: packet.feature_state,
    agent_binding: parseAgent(packet.agent_binding, blockers),
    runtime_binding: parseRuntime(packet.runtime_binding, blockers),
    instruction_custody: parseInstructions(packet.instruction_custody, blockers),
    capability_custody: parseCapabilities(packet.capability_custody, blockers),
    session_custody: parseSessions(packet.session_custody, blockers),
    memory_custody: parseMemory(packet.memory_custody, blockers),
    schedule_custody: parseSchedules(packet.schedule_custody, blockers),
  };
  normalized.backup_generation = parseBackup(packet.backup_generation, blockers);
  validateBackupCoverage(normalized, blockers);
  normalized.restore_readback = parseRestore(packet.restore_readback, normalized.backup_generation, blockers);
  normalized.human_acceptance = parseAcceptance(
    packet.human_acceptance, normalized.backup_generation, normalized.restore_readback, blockers,
  );
  normalized.claim_boundaries = parseBoundaries(packet.claim_boundaries, blockers);
  if (blockers.size > 0) return hold(blockers);

  const packetSha256 = digest(PACKET_HASH_DOMAIN, normalized);
  const manifestPayload = {
    schema_version: HERMES_AGENT_BACKUP_MANIFEST_SCHEMA_VERSION,
    kind: "hermes_agent_backup_manifest",
    packet_sha256: packetSha256,
    agent_binding: normalized.agent_binding,
    runtime_binding: normalized.runtime_binding,
    instruction_custody: normalized.instruction_custody,
    capability_custody: normalized.capability_custody,
    session_custody: normalized.session_custody,
    memory_custody: normalized.memory_custody,
    schedule_custody: normalized.schedule_custody,
    backup_generation: normalized.backup_generation,
    restore_readback: normalized.restore_readback,
    human_acceptance: normalized.human_acceptance,
    claim_boundaries: normalized.claim_boundaries,
  };
  const manifestSha256 = digest(MANIFEST_HASH_DOMAIN, manifestPayload);
  const manifest = { ...manifestPayload, manifest_sha256: manifestSha256 };
  return deepFreeze({
    schema_version: HERMES_AGENT_BACKUP_RESULT_SCHEMA_VERSION,
    kind: "hermes_agent_backup_result",
    status: "BACKUP_MANIFEST_READY",
    feature_state: "off",
    blocker_codes: [],
    manifest,
    receipt: {
      packet_sha256: packetSha256,
      manifest_sha256: manifestSha256,
      backup_completeness: "manifest_contract_satisfied",
      isolated_restore_readback: "evidence_ref_bound",
      human_acceptance: "evidence_ref_bound",
      agent_operational_readiness: "not_evaluated",
      task_completion: "not_evaluated",
      accepted_context_promotion: "not_evaluated",
      effects: { filesystem: 0, runtime: 0, network: 0, process: 0, clock: 0 },
      claim_ceiling: "metadata_contract_only",
    },
  });
}

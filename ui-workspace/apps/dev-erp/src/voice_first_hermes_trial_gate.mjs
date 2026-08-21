import { createHash } from "node:crypto";

import { canonicalEvidenceJson } from "../../../../guild_hall/ai_usage_meter/evidence_ledger.mjs";

export const HERMES_TRIAL_PACKET_SCHEMA = "soulforge.voice_first_hermes_trial_packet.v1";
export const HERMES_PROPOSAL_SCHEMA = "soulforge.voice_first_hermes_proposal.v1";
export const HERMES_TRIAL_POLICY_REVISION = "soulforge.hermes_trial_policy.v1";

const HERMES_MCP_TOOL_SET = new Set([
  "read_context", "query_task", "query_candidate", "read_project_profile", "query_knowledge_index",
  "submit_candidate_proposal", "query_status", "read_delivery_receipt",
]);
const ISOLATION_KIND_SET = new Set(["docker", "wsl2", "isolated_vm"]);
const TRANSCRIPT_RETENTION_SET = new Set(["custody_only", "encrypted_retention"]);
const ROLLBACK_MODE_SET = new Set(["clean_shutdown", "state_reset"]);

export const ALLOWED_HERMES_MCP_TOOLS = Object.freeze([...HERMES_MCP_TOOL_SET]);
export const ALLOWED_ISOLATION_KINDS = Object.freeze([...ISOLATION_KIND_SET]);
export const ALLOWED_TRANSCRIPT_RETENTION = Object.freeze([...TRANSCRIPT_RETENTION_SET]);
export const ALLOWED_ROLLBACK_MODES = Object.freeze([...ROLLBACK_MODE_SET]);

export const HERMES_HOLD_CODES = Object.freeze({
  INVALID_PACKET_SHAPE: "INVALID_PACKET_SHAPE",
  INVALID_SCHEMA_VERSION: "INVALID_SCHEMA_VERSION",
  POLICY_REVISION_MISMATCH: "POLICY_REVISION_MISMATCH",
  UNTRUSTED_RUNTIME_PIN: "UNTRUSTED_RUNTIME_PIN",
  SHARED_OR_UNKNOWN_IDENTITY: "SHARED_OR_UNKNOWN_IDENTITY",
  CROSS_PROJECT_OR_INVALID_MAPPING: "CROSS_PROJECT_OR_INVALID_MAPPING",
  FORBIDDEN_MCP_TOOLS: "FORBIDDEN_MCP_TOOLS",
  AUTO_INSTALL_FORBIDDEN: "AUTO_INSTALL_FORBIDDEN",
  SAMPLING_FORBIDDEN: "SAMPLING_FORBIDDEN",
  SCHEDULER_OR_CRON_FORBIDDEN: "SCHEDULER_OR_CRON_FORBIDDEN",
  TASK_MUTATION_FORBIDDEN: "TASK_MUTATION_FORBIDDEN",
  COMPLETION_AUTHORITY_FORBIDDEN: "COMPLETION_AUTHORITY_FORBIDDEN",
  MEMORY_AUTO_PROMOTION_FORBIDDEN: "MEMORY_AUTO_PROMOTION_FORBIDDEN",
  ATTACHMENT_DIRECT_PROMOTION_FORBIDDEN: "ATTACHMENT_DIRECT_PROMOTION_FORBIDDEN",
  ORCA_NESTING_FORBIDDEN: "ORCA_NESTING_FORBIDDEN",
  CREDENTIAL_OR_SECRET_EXPOSED: "CREDENTIAL_OR_SECRET_EXPOSED",
  TIME_WINDOW_INVALID: "TIME_WINDOW_INVALID",
  MISSING_ROLLBACK_PACKET: "MISSING_ROLLBACK_PACKET",
  MISSING_IDEMPOTENCY_KEY: "MISSING_IDEMPOTENCY_KEY",
  PROPOSAL_PAYLOAD_INVALID: "PROPOSAL_PAYLOAD_INVALID",
});

const C = HERMES_HOLD_CODES;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const SHA256_HEX = /^sha256:[a-f0-9]{64}$/u;
const UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const EXACT_VERSION_TAG = /^(?:v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|[A-Za-z][A-Za-z0-9._-]{0,80}-v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/u;
const FLOATING_VERSION_WORD = /(?:^|[-_.])(latest|main|head|edge|nightly|dev)(?:$|[-_.])/iu;
const MAX_GRAPH_DEPTH = 10;
const MAX_GRAPH_NODES = 512;
const MAX_GRAPH_BREADTH = 64;
const MAX_STRING_LENGTH = 4096;
const MAX_TIME_WINDOW_MS = 4 * 60 * 60 * 1000;
const CREDENTIAL_PATTERN = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const FORBIDDEN_SECRET_KEY = /(?:^|[:._-])(?:token|secret|credential|password|passwd|cookie|bearer)(?:[:._=-]|$)/iu;
const EFFECT_COUNTER_FIELDS = Object.freeze(["linear_mutations", "erp_mutations", "gmail_sends", "slack_posts", "git_commits", "task_mutations", "external_calls"]);
const TOP_LEVEL_FIELDS = Object.freeze(["schema_version", "trial_id", "policy_ref", "runtime_pin", "seat_mapping", "project_mapping", "mcp_tool_set", "delivery_adapter", "retention_policy", "attachment_policy", "rollback_packet", "time_window", "proposal_payload", "runtime_flags"]);
const RUNTIME_PIN_FIELDS = Object.freeze(["version_ref", "version_digest", "host_ref", "host_attestation_ref", "host_attestation_digest", "isolation_kind", "isolation_binding_ref", "isolation_binding_digest"]);

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function snapshotPacket(value) {
  const seen = new WeakMap();
  const ancestors = new WeakSet();
  let nodeCount = 0;
  const invalid = (reason) => ({ ok: false, reason });
  function clone(current, depth) {
    if (depth > MAX_GRAPH_DEPTH) return invalid(C.INVALID_PACKET_SHAPE);
    if (current === null || current === undefined) return { ok: true, value: current };
    if (typeof current === "string") {
      if (current.length > MAX_STRING_LENGTH) return invalid(C.INVALID_PACKET_SHAPE);
      if (CREDENTIAL_PATTERN.test(current)) return invalid(C.CREDENTIAL_OR_SECRET_EXPOSED);
      return { ok: true, value: current };
    }
    if (typeof current === "number" || typeof current === "boolean") return { ok: true, value: current };
    if (typeof current !== "object") return invalid(C.INVALID_PACKET_SHAPE);
    if (++nodeCount > MAX_GRAPH_NODES || ancestors.has(current)) return invalid(C.INVALID_PACKET_SHAPE);
    if (seen.has(current)) return { ok: true, value: seen.get(current) };

    let prototype;
    let keys;
    try {
      prototype = Object.getPrototypeOf(current);
      keys = Object.keys(current);
      if (Object.getOwnPropertySymbols(current).length > 0) return invalid(C.INVALID_PACKET_SHAPE);
    } catch {
      return invalid(C.INVALID_PACKET_SHAPE);
    }
    if (!Array.isArray(current) && prototype !== null && prototype !== Object.prototype) return invalid(C.INVALID_PACKET_SHAPE);
    if (keys.length > MAX_GRAPH_BREADTH) return invalid(C.INVALID_PACKET_SHAPE);
    if (Array.isArray(current)) {
      let length;
      try {
        length = current.length;
      } catch {
        return invalid(C.INVALID_PACKET_SHAPE);
      }
      if (!Number.isSafeInteger(length) || length > MAX_GRAPH_BREADTH || keys.length !== length || keys.some((key, index) => key !== String(index))) return invalid(C.INVALID_PACKET_SHAPE);
    }

    const target = Array.isArray(current) ? [] : {};
    seen.set(current, target);
    ancestors.add(current);
    for (const key of keys) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return invalid(C.INVALID_PACKET_SHAPE);
      if (FORBIDDEN_SECRET_KEY.test(key)) return invalid(C.CREDENTIAL_OR_SECRET_EXPOSED);
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(current, key);
      } catch {
        return invalid(C.INVALID_PACKET_SHAPE);
      }
      if (!descriptor || !("value" in descriptor)) return invalid(C.INVALID_PACKET_SHAPE);
      const child = clone(descriptor.value, depth + 1);
      if (!child.ok) return child;
      target[key] = child.value;
    }
    ancestors.delete(current);
    return { ok: true, value: target };
  }
  return clone(value, 0);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function hasExactKeys(object, fields) {
  if (!isPlainObject(object)) return false;
  const keys = Object.keys(object);
  return keys.length === fields.length && fields.every((field) => Object.prototype.hasOwnProperty.call(object, field));
}

function isValidId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isValidSha256(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function timestampEpoch(value) {
  if (typeof value !== "string" || !UTC_MILLIS.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

function isExactVersionRef(value) {
  return typeof value === "string" && EXACT_VERSION_TAG.test(value) && !FLOATING_VERSION_WORD.test(value);
}

function hold(holdCodes) {
  return deepFreeze({ status: "HOLD", hold_codes: [...holdCodes].sort(), proposal: null });
}

function proposalId(body) {
  return `prop_hermes_${createHash("sha256").update(canonicalEvidenceJson(body)).digest("hex").slice(0, 16)}`;
}

function digestDeclaredTools(tools) {
  return `sha256:${createHash("sha256").update(canonicalEvidenceJson(tools)).digest("hex")}`;
}

export function evaluateHermesTrial(input) {
  const snapshot = snapshotPacket(input);
  if (!snapshot.ok || !isPlainObject(snapshot.value)) return hold(new Set([snapshot.reason ?? C.INVALID_PACKET_SHAPE]));
  const packet = snapshot.value;
  const holdCodes = new Set();

  if (!hasExactKeys(packet, TOP_LEVEL_FIELDS)) holdCodes.add(C.INVALID_PACKET_SHAPE);
  if (packet.schema_version !== HERMES_TRIAL_PACKET_SCHEMA) holdCodes.add(C.INVALID_SCHEMA_VERSION);
  if (!isValidId(packet.trial_id)) holdCodes.add(C.INVALID_PACKET_SHAPE);
  if (packet.policy_ref !== HERMES_TRIAL_POLICY_REVISION) holdCodes.add(C.POLICY_REVISION_MISMATCH);

  const runtimePin = packet.runtime_pin;
  if (!isPlainObject(runtimePin) || !hasExactKeys(runtimePin, RUNTIME_PIN_FIELDS) || !isExactVersionRef(runtimePin.version_ref) ||
    !isValidSha256(runtimePin.version_digest) || !isValidId(runtimePin.host_ref) || !isValidId(runtimePin.host_attestation_ref) ||
    !isValidSha256(runtimePin.host_attestation_digest) || !ISOLATION_KIND_SET.has(runtimePin.isolation_kind) ||
    !isValidId(runtimePin.isolation_binding_ref) || !isValidSha256(runtimePin.isolation_binding_digest) ||
    runtimePin.host_ref === runtimePin.host_attestation_ref || runtimePin.host_ref === runtimePin.isolation_binding_ref || runtimePin.host_attestation_ref === runtimePin.isolation_binding_ref ||
    new Set([runtimePin.version_digest, runtimePin.host_attestation_digest, runtimePin.isolation_binding_digest]).size !== 3) {
    holdCodes.add(C.UNTRUSTED_RUNTIME_PIN);
  }

  const seatMapping = packet.seat_mapping;
  if (!isPlainObject(seatMapping) || !hasExactKeys(seatMapping, ["platform_user_ref", "seat_ref", "erp_account_ref", "seat_mode"]) ||
    !isValidId(seatMapping.platform_user_ref) || !isValidId(seatMapping.seat_ref) || !isValidId(seatMapping.erp_account_ref) ||
    seatMapping.seat_mode !== "one_seat_only" || seatMapping.platform_user_ref === seatMapping.seat_ref || seatMapping.seat_ref === seatMapping.erp_account_ref) {
    holdCodes.add(C.SHARED_OR_UNKNOWN_IDENTITY);
  }

  const projectMapping = packet.project_mapping;
  if (!isPlainObject(projectMapping) || !hasExactKeys(projectMapping, ["project_ref", "allowed_projects"]) || !isValidId(projectMapping.project_ref) ||
    !Array.isArray(projectMapping.allowed_projects) || projectMapping.allowed_projects.length !== 1 || projectMapping.allowed_projects[0] !== projectMapping.project_ref || !isValidId(projectMapping.allowed_projects[0])) {
    holdCodes.add(C.CROSS_PROJECT_OR_INVALID_MAPPING);
  }

  const mcpTools = packet.mcp_tool_set;
  if (!isPlainObject(mcpTools) || !hasExactKeys(mcpTools, ["allowed_tools", "forbidden_tools_declared", "auto_install_enabled", "mutation_tools_enabled", "sampling_enabled"])) {
    holdCodes.add(C.INVALID_PACKET_SHAPE);
  } else {
    if (!Array.isArray(mcpTools.allowed_tools) || mcpTools.allowed_tools.length === 0 || new Set(mcpTools.allowed_tools).size !== mcpTools.allowed_tools.length ||
      mcpTools.allowed_tools.some((tool) => typeof tool !== "string" || !HERMES_MCP_TOOL_SET.has(tool)) || !Array.isArray(mcpTools.forbidden_tools_declared) ||
      mcpTools.forbidden_tools_declared.length > MAX_GRAPH_BREADTH || new Set(mcpTools.forbidden_tools_declared).size !== mcpTools.forbidden_tools_declared.length ||
      mcpTools.forbidden_tools_declared.some((tool) => !isValidId(tool)) || mcpTools.forbidden_tools_declared.some((tool) => mcpTools.allowed_tools.includes(tool)) ||
      mcpTools.mutation_tools_enabled !== false) holdCodes.add(C.FORBIDDEN_MCP_TOOLS);
    if (mcpTools.auto_install_enabled !== false) holdCodes.add(C.AUTO_INSTALL_FORBIDDEN);
    if (mcpTools.sampling_enabled !== false) holdCodes.add(C.SAMPLING_FORBIDDEN);
  }

  const deliveryAdapter = packet.delivery_adapter;
  if (!isPlainObject(deliveryAdapter) || !hasExactKeys(deliveryAdapter, ["adapter_ref", "idempotency_key", "channel_ref"]) || !isValidId(deliveryAdapter.adapter_ref) ||
    !isValidId(deliveryAdapter.idempotency_key) || !isValidId(deliveryAdapter.channel_ref)) holdCodes.add(C.MISSING_IDEMPOTENCY_KEY);

  const retention = packet.retention_policy;
  if (!isPlainObject(retention) || !hasExactKeys(retention, ["transcript_retention", "memory_policy", "auto_promotion_enabled", "delete_consent"]) ||
    !TRANSCRIPT_RETENTION_SET.has(retention.transcript_retention) || retention.memory_policy !== "isolated_client_local_only" || retention.auto_promotion_enabled !== false || retention.delete_consent !== true) holdCodes.add(C.MEMORY_AUTO_PROMOTION_FORBIDDEN);

  const attachment = packet.attachment_policy;
  if (!isPlainObject(attachment) || !hasExactKeys(attachment, ["custody_receipt_ref", "direct_promotion_enabled", "custody_mode"]) || !isValidId(attachment.custody_receipt_ref) || attachment.direct_promotion_enabled !== false || attachment.custody_mode !== "ingress_receipt_only") holdCodes.add(C.ATTACHMENT_DIRECT_PROMOTION_FORBIDDEN);

  const rollback = packet.rollback_packet;
  if (!isPlainObject(rollback) || !hasExactKeys(rollback, ["rollback_ref", "rollback_digest", "rollback_mode"]) || !isValidId(rollback.rollback_ref) || !isValidSha256(rollback.rollback_digest) || !ROLLBACK_MODE_SET.has(rollback.rollback_mode)) holdCodes.add(C.MISSING_ROLLBACK_PACKET);

  const timeWindow = packet.time_window;
  if (!isPlainObject(timeWindow) || !hasExactKeys(timeWindow, ["valid_from", "valid_to", "observed_at"])) holdCodes.add(C.TIME_WINDOW_INVALID);
  else {
    const validFrom = timestampEpoch(timeWindow.valid_from);
    const validTo = timestampEpoch(timeWindow.valid_to);
    const observedAt = timestampEpoch(timeWindow.observed_at);
    if (validFrom === null || validTo === null || observedAt === null || validTo <= validFrom || validTo - validFrom > MAX_TIME_WINDOW_MS || observedAt < validFrom || observedAt > validTo) holdCodes.add(C.TIME_WINDOW_INVALID);
  }

  const payload = packet.proposal_payload;
  if (!isPlainObject(payload) || !hasExactKeys(payload, ["candidate_id", "candidate_type", "summary", "evidence_refs"]) || !isValidId(payload.candidate_id) ||
    !isValidId(payload.candidate_type) || typeof payload.summary !== "string" || payload.summary.trim().length === 0 || payload.summary.length > 2000 ||
    !Array.isArray(payload.evidence_refs) || payload.evidence_refs.length === 0 || new Set(payload.evidence_refs).size !== payload.evidence_refs.length || payload.evidence_refs.some((ref) => !isValidId(ref))) holdCodes.add(C.PROPOSAL_PAYLOAD_INVALID);

  const runtimeFlags = packet.runtime_flags;
  if (!isPlainObject(runtimeFlags) || !hasExactKeys(runtimeFlags, ["orca_nesting_enabled", "workbench_spawn_enabled", "scheduler_enabled", "cron_enabled", "task_mutation_enabled", "completion_authority_enabled"])) holdCodes.add(C.INVALID_PACKET_SHAPE);
  else {
    if (runtimeFlags.orca_nesting_enabled !== false || runtimeFlags.workbench_spawn_enabled !== false) holdCodes.add(C.ORCA_NESTING_FORBIDDEN);
    if (runtimeFlags.scheduler_enabled !== false || runtimeFlags.cron_enabled !== false) holdCodes.add(C.SCHEDULER_OR_CRON_FORBIDDEN);
    if (runtimeFlags.task_mutation_enabled !== false) holdCodes.add(C.TASK_MUTATION_FORBIDDEN);
    if (runtimeFlags.completion_authority_enabled !== false) holdCodes.add(C.COMPLETION_AUTHORITY_FORBIDDEN);
  }

  if (holdCodes.size > 0) return hold(holdCodes);

  const body = {
    schema_version: HERMES_PROPOSAL_SCHEMA,
    trial_id: packet.trial_id,
    project_ref: projectMapping.project_ref,
    evaluated_at: timeWindow.observed_at,
    status: "PROPOSAL_READY",
    authority: { task_mutation: false, completion_authority: false, memory_promotion: false, attachment_promotion: false, external_effects: false, adapter_invoked: false, effects_count: 0 },
    effect_counters: Object.fromEntries(EFFECT_COUNTER_FIELDS.map((field) => [field, 0])),
    candidate: { candidate_id: payload.candidate_id, candidate_type: payload.candidate_type, summary: payload.summary, evidence_refs: [...payload.evidence_refs] },
    runtime_evidence: {
      version_ref: runtimePin.version_ref,
      version_digest: runtimePin.version_digest,
      host_ref: runtimePin.host_ref,
      host_attestation_ref: runtimePin.host_attestation_ref,
      host_attestation_digest: runtimePin.host_attestation_digest,
      isolation_kind: runtimePin.isolation_kind,
      isolation_binding_ref: runtimePin.isolation_binding_ref,
      isolation_binding_digest: runtimePin.isolation_binding_digest,
      forbidden_tools_declared: [...mcpTools.forbidden_tools_declared],
      forbidden_tools_digest: digestDeclaredTools(mcpTools.forbidden_tools_declared),
      seat_mode: seatMapping.seat_mode,
      platform_user_ref: seatMapping.platform_user_ref,
      seat_ref: seatMapping.seat_ref,
      erp_account_ref: seatMapping.erp_account_ref,
      idempotency_key: deliveryAdapter.idempotency_key,
      rollback_ref: rollback.rollback_ref,
      rollback_digest: rollback.rollback_digest,
      custody_receipt_ref: attachment.custody_receipt_ref,
      policy_ref: packet.policy_ref,
    },
  };
  const proposal = { proposal_id: proposalId(body), ...body };
  return deepFreeze({ status: "PROPOSAL_READY", hold_codes: [], proposal });
}

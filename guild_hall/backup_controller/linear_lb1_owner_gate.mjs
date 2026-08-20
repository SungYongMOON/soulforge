import { createHash } from "node:crypto";
import { types } from "node:util";

import { LINEAR_LB1_DIMENSIONS, LINEAR_LB1_ZERO_EFFECTS } from "./linear_lb1.mjs";

export const LINEAR_LB1_OWNER_GATE_PACKET_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.owner_gate_packet.v1";
export const LINEAR_LB1_OWNER_GATE_PIN_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.owner_gate_pin.v1";
export const LINEAR_LB1_OWNER_GATE_RECEIPT_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.owner_gate_receipt.v1";

export const LINEAR_LB1_OWNER_GATE_CODES = Object.freeze({
  INPUT_INVALID: "LINEAR_LB1_GATE_INPUT_INVALID",
  TRUSTED_PIN_REQUIRED: "LINEAR_LB1_GATE_TRUSTED_PIN_REQUIRED",
  TRUSTED_PIN_INVALID: "LINEAR_LB1_GATE_TRUSTED_PIN_INVALID",
  TRUSTED_PIN_MISMATCH: "LINEAR_LB1_GATE_TRUSTED_PIN_MISMATCH",
  OWNER_APPROVAL_REQUIRED: "LINEAR_LB1_GATE_OWNER_APPROVAL_REQUIRED",
  OWNER_APPROVAL_INVALID: "LINEAR_LB1_GATE_OWNER_APPROVAL_INVALID",
  SOURCE_SCOPE_REQUIRED: "LINEAR_LB1_GATE_SOURCE_SCOPE_REQUIRED",
  CREDENTIAL_REQUIRED: "LINEAR_LB1_GATE_CREDENTIAL_REQUIRED",
  TARGET_REQUIRED: "LINEAR_LB1_GATE_TARGET_REQUIRED",
  STORAGE_AUTHORITY_REQUIRED: "LINEAR_LB1_GATE_STORAGE_AUTHORITY_REQUIRED",
  RETENTION_POLICY_REQUIRED: "LINEAR_LB1_GATE_RETENTION_POLICY_REQUIRED",
  FAILURE_POLICY_REQUIRED: "LINEAR_LB1_GATE_FAILURE_POLICY_REQUIRED",
  RESTORE_ACCEPTANCE_REQUIRED: "LINEAR_LB1_GATE_RESTORE_ACCEPTANCE_REQUIRED",
  ONE_SHOT_POLICY_REQUIRED: "LINEAR_LB1_GATE_ONE_SHOT_POLICY_REQUIRED",
});

const C = LINEAR_LB1_OWNER_GATE_CODES;
const PACKET_FIELDS = Object.freeze([
  "schema_version", "feature_state", "owner_decision", "source", "target",
  "retention", "failure_policy", "restore_acceptance", "one_shot",
]);
const DECISION_FIELDS = Object.freeze([
  "state", "decision_ref", "approved_at_utc", "expires_at_utc",
]);
const SOURCE_FIELDS = Object.freeze([
  "provider", "scope_mode", "workspace_ref", "team_ids", "project_ids",
  "credential_ref", "credential_scope", "dimensions",
]);
const TARGET_FIELDS = Object.freeze([
  "kind", "target_ref", "display_label", "storage_write_authority_ref",
  "create_only", "overwrite_allowed", "public_share_allowed",
]);
const RETENTION_FIELDS = Object.freeze([
  "daily_generations", "monthly_generations", "rpo_hours",
]);
const FAILURE_FIELDS = Object.freeze([
  "partial_result", "retry_policy", "target_cleanup_allowed", "source_mutation_allowed",
]);
const RESTORE_FIELDS = Object.freeze([
  "human_reviewer_ref", "required_dimensions", "restore_check_required",
  "tabular_only_accepted",
]);
const ONE_SHOT_FIELDS = Object.freeze([
  "run_limit", "writer_kind", "linear_mutation", "webhook_registration",
  "scheduler_activation",
]);
const PIN_FIELDS = Object.freeze([
  "schema_version", "gate_ref", "expected_packet_sha256", "valid_at", "known_at",
]);
const REF_FIELDS = Object.freeze([
  "entity_id", "revision_id", "content_id", "content_hash_alg",
]);
const PACKET_HASH_DOMAIN = "soulforge.backup_controller.linear_lb1.owner_gate_packet.v1";
const HASH = /^sha256:[0-9a-f]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const LOCAL_PATH = /(?:^|[\s"'])(?:[A-Za-z]:[\\/]|file:\/\/\/|\/(?:home|Users)\/|\\\\)/u;
const SECRET = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const MAX = Object.freeze({ depth: 24, values: 20000, keys: 64, array: 256, string: 4096 });

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeString(value) {
  return typeof value === "string" && value.length <= MAX.string
    && value.normalize("NFC") === value && !CONTROL.test(value)
    && !LOCAL_PATH.test(value) && !SECRET.test(value);
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
    if (typeof value !== "object" || types.isProxy(value) || seen.has(value)) {
      throw new Error("snapshot_shape");
    }
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX.array) {
        throw new Error("snapshot_array");
      }
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key, index) => (
        index < value.length ? key !== String(index) : key !== "length"
      ))) throw new Error("snapshot_array_shape");
      return value.map((entry) => walk(entry, depth + 1));
    }
    if (!isPlainRecord(value)) throw new Error("snapshot_record");
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX.keys || keys.some((key) => typeof key !== "string")) {
      throw new Error("snapshot_keys");
    }
    const output = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new Error("snapshot_descriptor");
      }
      Object.defineProperty(output, key, {
        value: walk(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
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
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function exactRef(value) {
  return exactKeys(value, REF_FIELDS) && UUID_V4.test(value.entity_id)
    && UUID_V4.test(value.revision_id) && HASH.test(value.content_id)
    && value.content_hash_alg === "sha256";
}

function exactInstant(value) {
  return typeof value === "string" && ISO_UTC.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function sameOrderedValues(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function uniqueSafeIds(values) {
  return Array.isArray(values) && values.length <= 128
    && values.every((value) => typeof value === "string" && SAFE_ID.test(value))
    && new Set(values).size === values.length;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function packetFingerprint(packet) {
  return `sha256:${createHash("sha256")
    .update(`${PACKET_HASH_DOMAIN}\0${stableJson(packet)}`, "utf8").digest("hex")}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function parsePin(pin, blockers) {
  if (pin === null || pin === undefined) {
    blockers.add(C.TRUSTED_PIN_INVALID);
    return null;
  }
  if (!exactKeys(pin, PIN_FIELDS)
      || pin.schema_version !== LINEAR_LB1_OWNER_GATE_PIN_SCHEMA_VERSION
      || !exactRef(pin.gate_ref) || !HASH.test(pin.expected_packet_sha256)
      || pin.gate_ref.content_id !== pin.expected_packet_sha256
      || !exactInstant(pin.valid_at) || !exactInstant(pin.known_at)
      || pin.valid_at > pin.known_at) {
    blockers.add(C.TRUSTED_PIN_INVALID);
    return null;
  }
  return pin;
}

function parseDecision(value, pin, blockers) {
  if (!exactKeys(value, DECISION_FIELDS)
      || (value.state !== "pending" && value.state !== "approved")) {
    blockers.add(C.OWNER_APPROVAL_INVALID);
    return;
  }
  if (value.state === "pending") {
    if (value.decision_ref !== null || value.approved_at_utc !== null
        || value.expires_at_utc !== null) blockers.add(C.OWNER_APPROVAL_INVALID);
    blockers.add(C.OWNER_APPROVAL_REQUIRED);
    return;
  }
  if (!exactRef(value.decision_ref) || !exactInstant(value.approved_at_utc)
      || !exactInstant(value.expires_at_utc) || value.approved_at_utc > value.expires_at_utc
      || (pin !== null && (value.approved_at_utc > pin.known_at
        || pin.known_at >= value.expires_at_utc))) blockers.add(C.OWNER_APPROVAL_INVALID);
}

function parseSource(value, blockers) {
  if (!exactKeys(value, SOURCE_FIELDS) || value.provider !== "linear"
      || (value.scope_mode !== "entire_workspace" && value.scope_mode !== "allowlist")
      || !uniqueSafeIds(value.team_ids) || !uniqueSafeIds(value.project_ids)
      || !sameOrderedValues(value.dimensions, LINEAR_LB1_DIMENSIONS)) {
    blockers.add(C.SOURCE_SCOPE_REQUIRED);
    return;
  }
  if (value.scope_mode === "entire_workspace"
      && (value.team_ids.length !== 0 || value.project_ids.length !== 0)) {
    blockers.add(C.SOURCE_SCOPE_REQUIRED);
  }
  if (value.scope_mode === "allowlist"
      && value.team_ids.length === 0 && value.project_ids.length === 0) {
    blockers.add(C.SOURCE_SCOPE_REQUIRED);
  }
  if (!exactRef(value.workspace_ref)) blockers.add(C.SOURCE_SCOPE_REQUIRED);
  if (value.credential_scope !== "read_only" || !exactRef(value.credential_ref)) {
    blockers.add(C.CREDENTIAL_REQUIRED);
  }
}

function parseTarget(value, blockers) {
  if (!exactKeys(value, TARGET_FIELDS) || value.kind !== "google_drive_folder"
      || typeof value.display_label !== "string" || value.display_label.length < 1
      || value.display_label.length > 80 || value.create_only !== true
      || value.overwrite_allowed !== false || value.public_share_allowed !== false) {
    blockers.add(C.TARGET_REQUIRED);
    return;
  }
  if (!exactRef(value.target_ref)) blockers.add(C.TARGET_REQUIRED);
  if (!exactRef(value.storage_write_authority_ref)) {
    blockers.add(C.STORAGE_AUTHORITY_REQUIRED);
  }
}

function validRetention(value) {
  return exactKeys(value, RETENTION_FIELDS)
    && Number.isSafeInteger(value.daily_generations)
    && value.daily_generations >= 1 && value.daily_generations <= 90
    && Number.isSafeInteger(value.monthly_generations)
    && value.monthly_generations >= 1 && value.monthly_generations <= 24
    && Number.isSafeInteger(value.rpo_hours)
    && value.rpo_hours >= 1 && value.rpo_hours <= 168;
}

function parseRetention(value, blockers) {
  if (!validRetention(value)) blockers.add(C.RETENTION_POLICY_REQUIRED);
}

function parseFailurePolicy(value, blockers) {
  if (!exactKeys(value, FAILURE_FIELDS) || value.partial_result !== "HOLD"
      || value.retry_policy !== "fresh_owner_gate_required"
      || value.target_cleanup_allowed !== false
      || value.source_mutation_allowed !== false) {
    blockers.add(C.FAILURE_POLICY_REQUIRED);
  }
}

function parseRestoreAcceptance(value, blockers) {
  if (!exactKeys(value, RESTORE_FIELDS) || !exactRef(value.human_reviewer_ref)
      || !sameOrderedValues(value.required_dimensions, LINEAR_LB1_DIMENSIONS)
      || value.restore_check_required !== true
      || value.tabular_only_accepted !== false) {
    blockers.add(C.RESTORE_ACCEPTANCE_REQUIRED);
  }
}

function parseOneShot(value, blockers) {
  if (!exactKeys(value, ONE_SHOT_FIELDS) || value.run_limit !== 1
      || value.writer_kind !== "append_only_revision"
      || value.linear_mutation !== false || value.webhook_registration !== false
      || value.scheduler_activation !== false) {
    blockers.add(C.ONE_SHOT_POLICY_REQUIRED);
  }
}

function authority(ready) {
  return {
    linear_read_allowed: ready,
    storage_write_allowed: ready,
    linear_write_allowed: false,
    webhook_registration_allowed: false,
    scheduler_allowed: false,
    task_execution_allowed: false,
    agent_run_allowed: false,
    p5_or_core_phase_unlocked: false,
  };
}

function bindingReceipt(packet, pin) {
  return {
    trusted_pin_content_id: exactRef(pin?.gate_ref) ? pin.gate_ref.content_id : null,
    trusted_pin_valid_at: exactInstant(pin?.valid_at) ? pin.valid_at : null,
    trusted_pin_known_at: exactInstant(pin?.known_at) ? pin.known_at : null,
    owner_decision_expires_at: exactInstant(packet?.owner_decision?.expires_at_utc)
      ? packet.owner_decision.expires_at_utc : null,
    run_limit: packet?.one_shot?.run_limit === 1 ? 1 : null,
    create_only: packet?.target?.create_only === true,
    overwrite_allowed: packet?.target?.overwrite_allowed === true,
    restore_check_required: packet?.restore_acceptance?.restore_check_required === true,
    technical_single_use_enforced: false,
    consumption_state: "not_consumed_by_gate",
  };
}

function result(blockers, packetSha256, packet, pin) {
  const blockerCodes = [...blockers].sort();
  const ready = blockerCodes.length === 0;
  return deepFreeze({
    gate: {
      schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_result.v1",
      kind: "linear_lb1_owner_gate_result",
      status: ready ? "READY_FOR_ONE_SHOT" : "HOLD",
      feature_state: "off",
      blocker_codes: blockerCodes,
      scope_mode: packet?.source?.scope_mode ?? null,
      target_kind: packet?.target?.kind ?? null,
      retention: validRetention(packet?.retention) ? {
        daily_generations: packet.retention.daily_generations,
        monthly_generations: packet.retention.monthly_generations,
        rpo_hours: packet.retention.rpo_hours,
      } : null,
    },
    receipt: {
      schema_version: LINEAR_LB1_OWNER_GATE_RECEIPT_SCHEMA_VERSION,
      kind: "linear_lb1_owner_gate_receipt",
      status: ready ? "READY_FOR_ONE_SHOT" : "HOLD",
      feature_state: "off",
      packet_sha256: packetSha256,
      dimension_count: packet?.source?.dimensions?.length ?? 0,
      authority: authority(ready),
      binding: bindingReceipt(packet, pin),
      effects: { ...LINEAR_LB1_ZERO_EFFECTS },
      claim_ceiling: "owner_policy_and_runtime_binding_only",
    },
  });
}

export function evaluateLinearLb1OwnerGate(packetInput, trustedExpectedPinInput) {
  const packet = snapshotPlainData(packetInput);
  const trustedPin = snapshotPlainData(trustedExpectedPinInput);
  if (packet === null) return result(new Set([C.INPUT_INVALID]), null, null, null);

  const packetSha256 = packetFingerprint(packet);
  const blockers = new Set();
  let pin = null;
  if (trustedExpectedPinInput === null || trustedExpectedPinInput === undefined) {
    blockers.add(C.TRUSTED_PIN_REQUIRED);
  } else {
    pin = parsePin(trustedPin, blockers);
  }
  if (pin !== null && pin.expected_packet_sha256 !== packetSha256) {
    blockers.add(C.TRUSTED_PIN_MISMATCH);
  }
  if (!exactKeys(packet, PACKET_FIELDS)
      || packet.schema_version !== LINEAR_LB1_OWNER_GATE_PACKET_SCHEMA_VERSION
      || packet.feature_state !== "off") {
    blockers.add(C.INPUT_INVALID);
    return result(blockers, packetSha256, null, pin);
  }

  parseDecision(packet.owner_decision, pin, blockers);
  parseSource(packet.source, blockers);
  parseTarget(packet.target, blockers);
  parseRetention(packet.retention, blockers);
  parseFailurePolicy(packet.failure_policy, blockers);
  parseRestoreAcceptance(packet.restore_acceptance, blockers);
  parseOneShot(packet.one_shot, blockers);
  return result(blockers, packetSha256, packet, pin);
}

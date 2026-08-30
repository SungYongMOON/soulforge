import { createHash } from "node:crypto";
import { types } from "node:util";

import { LINEAR_LB1_V2_DIMENSIONS, LINEAR_LB1_ZERO_EFFECTS } from "./linear_lb1_v2.mjs";

export const LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.owner_gate_packet.v2";
export const LINEAR_LB1_OWNER_GATE_V2_PIN_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2";
export const LINEAR_LB1_OWNER_GATE_V2_RECEIPT_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.owner_gate_receipt.v2";
export const LINEAR_LB1_OWNER_GATE_V2_RESULT_SCHEMA_VERSION =
  "soulforge.backup_controller.linear_lb1.owner_gate_result.v2";

export const LINEAR_LB1_OWNER_GATE_V2_CODES = Object.freeze({
  INPUT_INVALID: "LINEAR_LB1_GATE_V2_INPUT_INVALID",
  TRUSTED_PIN_REQUIRED: "LINEAR_LB1_GATE_V2_TRUSTED_PIN_REQUIRED",
  TRUSTED_PIN_INVALID: "LINEAR_LB1_GATE_V2_TRUSTED_PIN_INVALID",
  TRUSTED_PIN_MISMATCH: "LINEAR_LB1_GATE_V2_TRUSTED_PIN_MISMATCH",
  OWNER_APPROVAL_REQUIRED: "LINEAR_LB1_GATE_V2_OWNER_APPROVAL_REQUIRED",
  OWNER_APPROVAL_INVALID: "LINEAR_LB1_GATE_V2_OWNER_APPROVAL_INVALID",
  WRITER_IDENTITY_REQUIRED: "LINEAR_LB1_GATE_V2_WRITER_IDENTITY_REQUIRED",
  SOURCE_SCOPE_REQUIRED: "LINEAR_LB1_GATE_V2_SOURCE_SCOPE_REQUIRED",
  CREDENTIAL_REQUIRED: "LINEAR_LB1_GATE_V2_CREDENTIAL_REQUIRED",
  TARGET_REQUIRED: "LINEAR_LB1_GATE_V2_TARGET_REQUIRED",
  STORAGE_AUTHORITY_REQUIRED: "LINEAR_LB1_GATE_V2_STORAGE_AUTHORITY_REQUIRED",
  CLAIM_STORE_REQUIRED: "LINEAR_LB1_GATE_V2_CLAIM_STORE_REQUIRED",
  ADAPTER_REFS_REQUIRED: "LINEAR_LB1_GATE_V2_ADAPTER_REFS_REQUIRED",
  ARTIFACT_LAYOUT_REQUIRED: "LINEAR_LB1_GATE_V2_ARTIFACT_LAYOUT_REQUIRED",
  RESOURCE_LIMITS_REQUIRED: "LINEAR_LB1_GATE_V2_RESOURCE_LIMITS_REQUIRED",
  RETENTION_POLICY_REQUIRED: "LINEAR_LB1_GATE_V2_RETENTION_POLICY_REQUIRED",
  FAILURE_POLICY_REQUIRED: "LINEAR_LB1_GATE_V2_FAILURE_POLICY_REQUIRED",
  RESTORE_ACCEPTANCE_REQUIRED: "LINEAR_LB1_GATE_V2_RESTORE_ACCEPTANCE_REQUIRED",
  ONE_SHOT_POLICY_REQUIRED: "LINEAR_LB1_GATE_V2_ONE_SHOT_POLICY_REQUIRED",
  CONSISTENCY_POLICY_REQUIRED: "LINEAR_LB1_GATE_V2_CONSISTENCY_POLICY_REQUIRED",
});

const C = LINEAR_LB1_OWNER_GATE_V2_CODES;

const PACKET_FIELDS = Object.freeze([
  "schema_version", "feature_state", "owner_decision", "writer_identity",
  "source", "target", "claim_store", "adapters", "artifact_layout",
  "resource_limits", "retention", "failure_policy", "restore_acceptance", "capture_consistency", "one_shot",
]);

const DECISION_FIELDS = Object.freeze([
  "state", "decision_ref", "approved_at_utc", "expires_at_utc",
]);

const WRITER_IDENTITY_FIELDS = Object.freeze([
  "writer_id", "hostname", "platform", "epoch",
]);

const SOURCE_FIELDS = Object.freeze([
  "provider", "scope_mode", "workspace_ref", "team_ids", "project_ids",
  "credential_ref", "credential_scope", "dimensions",
]);

const TARGET_FIELDS = Object.freeze([
  "kind", "target_ref", "display_label", "storage_write_authority_ref",
  "create_only", "overwrite_allowed", "public_share_allowed",
]);

const CLAIM_STORE_FIELDS = Object.freeze([
  "claim_store_ref", "single_use_token_ref",
]);

const ADAPTER_FIELDS = Object.freeze([
  "attachment_allowlist_sha256", "attachment_policy_ref", "linear_reader_adapter_ref", "storage_adapter_ref",
]);

const ARTIFACT_LAYOUT_FIELDS = Object.freeze([
  "snapshot_schema_version", "manifest_schema_version", "revision_schema_version", "layout_kind",
]);

const RESOURCE_LIMITS_FIELDS = Object.freeze([
  "max_issues", "max_total_bytes", "max_runtime_ms",
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

const CONSISTENCY_FIELDS = Object.freeze([
  "mode", "decision_ref", "cutoff_required", "cursor_ledger_required", "drift_policy",
]);

const ONE_SHOT_FIELDS = Object.freeze([
  "run_limit", "writer_kind", "linear_mutation", "webhook_registration",
  "scheduler_activation",
]);

const PIN_FIELDS = Object.freeze([
  "schema_version", "gate_ref", "expected_packet_sha256", "valid_at", "known_at", "expires_at",
]);

const REF_FIELDS = Object.freeze([
  "entity_id", "revision_id", "content_id", "content_hash_alg",
]);

const PACKET_HASH_DOMAIN = "soulforge.backup_controller.linear_lb1.owner_gate_packet.v2";
const HASH = /^sha256:[0-9a-f]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const LOCAL_PATH = /(?:^|[\s"'])(?:[A-Za-z]:[\\/]|file:\/\/\/|\/(?:home|Users)\/|\\\\)/u;
const SECRET = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const MAX = Object.freeze({ depth: 24, values: 20000, keys: 64, array: 256, string: 4096 });

function codepointCompare(a, b) {
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeString(value) {
  return typeof value === "string" && value.length <= MAX.string
    && value.normalize("NFC") === value && !CONTROL.test(value)
    && !LOCAL_PATH.test(value) && !SECRET.test(value);
}

export function snapshotPlainData(root) {
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
  const actual = Object.keys(value).sort(codepointCompare);
  const wanted = [...expected].sort(codepointCompare);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
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
    return `{${Object.keys(value).sort(codepointCompare).map((key) => (
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
    blockers.add(C.TRUSTED_PIN_REQUIRED);
    return null;
  }
  if (!exactKeys(pin, PIN_FIELDS)
      || pin.schema_version !== LINEAR_LB1_OWNER_GATE_V2_PIN_SCHEMA_VERSION
      || !exactRef(pin.gate_ref) || !HASH.test(pin.expected_packet_sha256)
      || pin.gate_ref.content_id !== pin.expected_packet_sha256
      || !exactInstant(pin.valid_at) || !exactInstant(pin.known_at)
      || !exactInstant(pin.expires_at)
      || pin.valid_at > pin.known_at || pin.known_at > pin.expires_at) {
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
    if (value.decision_ref !== null || value.approved_at_utc !== null || value.expires_at_utc !== null) {
      blockers.add(C.OWNER_APPROVAL_INVALID);
    }
    blockers.add(C.OWNER_APPROVAL_REQUIRED);
    return;
  }
  if (!exactRef(value.decision_ref) || !exactInstant(value.approved_at_utc)
      || !exactInstant(value.expires_at_utc) || value.approved_at_utc > value.expires_at_utc
      || (pin !== null && (value.approved_at_utc > pin.known_at || pin.known_at >= value.expires_at_utc))) {
    blockers.add(C.OWNER_APPROVAL_INVALID);
  }
}

function parseWriterIdentity(value, blockers) {
  if (!exactKeys(value, WRITER_IDENTITY_FIELDS)
      || typeof value.writer_id !== "string" || !SAFE_ID.test(value.writer_id)
      || typeof value.hostname !== "string" || !SAFE_ID.test(value.hostname)
      || (value.platform !== "win32" && value.platform !== "darwin" && value.platform !== "linux")
      || !Number.isSafeInteger(value.epoch) || value.epoch < 1) {
    blockers.add(C.WRITER_IDENTITY_REQUIRED);
  }
}

function parseSource(value, blockers) {
  if (!exactKeys(value, SOURCE_FIELDS) || value.provider !== "linear"
      || (value.scope_mode !== "entire_workspace" && value.scope_mode !== "allowlist")
      || !uniqueSafeIds(value.team_ids) || !uniqueSafeIds(value.project_ids)
      || !sameOrderedValues(value.dimensions, LINEAR_LB1_V2_DIMENSIONS)) {
    blockers.add(C.SOURCE_SCOPE_REQUIRED);
    return;
  }
  if (value.scope_mode === "entire_workspace" && (value.team_ids.length !== 0 || value.project_ids.length !== 0)) {
    blockers.add(C.SOURCE_SCOPE_REQUIRED);
  }
  if (value.scope_mode === "allowlist" && value.team_ids.length === 0 && value.project_ids.length === 0) {
    blockers.add(C.SOURCE_SCOPE_REQUIRED);
  }
  if (!exactRef(value.workspace_ref)) blockers.add(C.SOURCE_SCOPE_REQUIRED);
  if (value.credential_scope !== "read_only" || !exactRef(value.credential_ref)) {
    blockers.add(C.CREDENTIAL_REQUIRED);
  }
}

function parseTarget(value, blockers) {
  if (!exactKeys(value, TARGET_FIELDS)
      || (value.kind !== "google_drive_folder" && value.kind !== "private_data_root_generation")
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

function parseClaimStore(value, blockers) {
  if (!exactKeys(value, CLAIM_STORE_FIELDS) || !exactRef(value.claim_store_ref)
      || !exactRef(value.single_use_token_ref)) {
    blockers.add(C.CLAIM_STORE_REQUIRED);
  }
}

function parseAdapters(value, blockers) {
  if (!exactKeys(value, ADAPTER_FIELDS)
      || !exactRef(value.linear_reader_adapter_ref)
      || !exactRef(value.storage_adapter_ref)
      || !exactRef(value.attachment_policy_ref)
      || !HASH.test(value.attachment_allowlist_sha256)
      || value.attachment_policy_ref.content_id !== value.attachment_allowlist_sha256) {
    blockers.add(C.ADAPTER_REFS_REQUIRED);
  }
}

function parseArtifactLayout(value, blockers) {
  if (!exactKeys(value, ARTIFACT_LAYOUT_FIELDS)
      || value.snapshot_schema_version !== "soulforge.backup_controller.linear_lb1.snapshot.v2"
      || value.manifest_schema_version !== "soulforge.backup_controller.linear_lb1.manifest.v2"
      || value.revision_schema_version !== "soulforge.backup_controller.linear_lb1.revision.v2"
      || value.layout_kind !== "canonical_sealed_envelope_v2") {
    blockers.add(C.ARTIFACT_LAYOUT_REQUIRED);
  }
}

function parseResourceLimits(value, blockers) {
  if (!exactKeys(value, RESOURCE_LIMITS_FIELDS)
      || !Number.isSafeInteger(value.max_issues) || value.max_issues < 1 || value.max_issues > 100000
      || !Number.isSafeInteger(value.max_total_bytes) || value.max_total_bytes < 1 || value.max_total_bytes > 1073741824
      || !Number.isSafeInteger(value.max_runtime_ms) || value.max_runtime_ms < 1000 || value.max_runtime_ms > 3600000) {
    blockers.add(C.RESOURCE_LIMITS_REQUIRED);
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
      || !sameOrderedValues(value.required_dimensions, LINEAR_LB1_V2_DIMENSIONS)
      || value.restore_check_required !== true
      || value.tabular_only_accepted !== false) {
    blockers.add(C.RESTORE_ACCEPTANCE_REQUIRED);
  }
}

function parseCaptureConsistency(value, blockers) {
  if (!exactKeys(value, CONSISTENCY_FIELDS)
      || (value.mode !== "quiesced" && value.mode !== "owner_accepted_non_quiesced")
      || !exactRef(value.decision_ref)
      || value.cutoff_required !== true
      || value.cursor_ledger_required !== true
      || value.drift_policy !== "partial_hold_on_incompatible_drift") {
    blockers.add(C.CONSISTENCY_POLICY_REQUIRED);
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
    trusted_pin_expires_at: exactInstant(pin?.expires_at) ? pin.expires_at : null,
    owner_decision_expires_at: exactInstant(packet?.owner_decision?.expires_at_utc)
      ? packet.owner_decision.expires_at_utc : null,
    writer_id: packet?.writer_identity?.writer_id ?? null,
    epoch: packet?.writer_identity?.epoch ?? null,
    single_use_token_ref_present: exactRef(packet?.claim_store?.single_use_token_ref),
    single_use_token_ref: exactRef(packet?.claim_store?.single_use_token_ref)
      ? packet.claim_store.single_use_token_ref : null,
    run_limit: packet?.one_shot?.run_limit === 1 ? 1 : null,
    create_only: packet?.target?.create_only === true,
    overwrite_allowed: packet?.target?.overwrite_allowed === true,
    restore_check_required: packet?.restore_acceptance?.restore_check_required === true,
    consistency_mode: packet?.capture_consistency?.mode ?? null,
    attachment_policy_ref: exactRef(packet?.adapters?.attachment_policy_ref)
      ? packet.adapters.attachment_policy_ref : null,
    attachment_allowlist_sha256: HASH.test(packet?.adapters?.attachment_allowlist_sha256)
      ? packet.adapters.attachment_allowlist_sha256 : null,
    technical_single_use_enforced: false,
    consumption_state: "not_consumed_by_gate",
  };
}

function result(blockers, packetSha256, packet, pin) {
  const blockerCodes = [...blockers].sort(codepointCompare);
  const ready = blockerCodes.length === 0;
  return deepFreeze({
    gate: {
      schema_version: LINEAR_LB1_OWNER_GATE_V2_RESULT_SCHEMA_VERSION,
      kind: "linear_lb1_owner_gate_v2_result",
      status: ready ? "READY_FOR_ONE_SHOT" : "HOLD",
      feature_state: "off",
      blocker_codes: blockerCodes,
      scope_mode: packet?.source?.scope_mode ?? null,
      target_kind: packet?.target?.kind ?? null,
      writer_identity: packet?.writer_identity ? {
        writer_id: packet.writer_identity.writer_id,
        epoch: packet.writer_identity.epoch,
      } : null,
      retention: validRetention(packet?.retention) ? {
        daily_generations: packet.retention.daily_generations,
        monthly_generations: packet.retention.monthly_generations,
        rpo_hours: packet.retention.rpo_hours,
      } : null,
      consistency_mode: packet?.capture_consistency?.mode ?? null,
    },
    receipt: {
      schema_version: LINEAR_LB1_OWNER_GATE_V2_RECEIPT_SCHEMA_VERSION,
      kind: "linear_lb1_owner_gate_v2_receipt",
      status: ready ? "READY_FOR_ONE_SHOT" : "HOLD",
      feature_state: "off",
      packet_sha256: packetSha256,
      dimension_count: packet?.source?.dimensions?.length ?? 0,
      writer_identity: packet?.writer_identity ? {
        writer_id: packet.writer_identity.writer_id,
        epoch: packet.writer_identity.epoch,
      } : null,
      claim_store_ref: packet?.claim_store?.claim_store_ref ?? null,
      single_use_token_ref_present: exactRef(packet?.claim_store?.single_use_token_ref),
      single_use_token_ref: exactRef(packet?.claim_store?.single_use_token_ref)
        ? packet.claim_store.single_use_token_ref : null,
      authority: authority(ready),
      binding: bindingReceipt(packet, pin),
      effects: { ...LINEAR_LB1_ZERO_EFFECTS },
      claim_ceiling: "owner_policy_and_runtime_binding_only",
    },
  });
}

export function evaluateLinearLb1OwnerGateV2(packetInput, trustedExpectedPinInput) {
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
      || packet.schema_version !== LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION
      || packet.feature_state !== "off") {
    blockers.add(C.INPUT_INVALID);
    return result(blockers, packetSha256, null, pin);
  }

  parseDecision(packet.owner_decision, pin, blockers);
  parseWriterIdentity(packet.writer_identity, blockers);
  parseSource(packet.source, blockers);
  parseTarget(packet.target, blockers);
  parseClaimStore(packet.claim_store, blockers);
  parseAdapters(packet.adapters, blockers);
  parseArtifactLayout(packet.artifact_layout, blockers);
  parseResourceLimits(packet.resource_limits, blockers);
  parseRetention(packet.retention, blockers);
  parseFailurePolicy(packet.failure_policy, blockers);
  parseRestoreAcceptance(packet.restore_acceptance, blockers);
  parseCaptureConsistency(packet.capture_consistency, blockers);
  parseOneShot(packet.one_shot, blockers);
  return result(blockers, packetSha256, packet, pin);
}

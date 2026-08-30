import { createHash } from "node:crypto";
import { types } from "node:util";

export const BUZZ_BACKUP_GENERATION_PACKET_SCHEMA_VERSION =
  "soulforge.backup_controller.buzz_backup_generation.packet.v0";
export const BUZZ_BACKUP_GENERATION_RESULT_SCHEMA_VERSION =
  "soulforge.backup_controller.buzz_backup_generation.result.v0";
export const BUZZ_BACKUP_GENERATION_MATERIAL_SCHEMA_VERSION =
  "soulforge.backup_controller.buzz_backup_generation.material.v0";

export const BUZZ_BACKUP_GENERATION_HOLD_CODES = Object.freeze({
  INPUT_INVALID: "BUZZ_BACKUP_INPUT_INVALID",
  RAW_OR_SECRET_FORBIDDEN: "BUZZ_BACKUP_RAW_OR_SECRET_FORBIDDEN",
  TRUSTED_PIN_REQUIRED: "BUZZ_BACKUP_TRUSTED_PIN_REQUIRED",
  TRUSTED_PIN_MISMATCH: "BUZZ_BACKUP_TRUSTED_PIN_MISMATCH",
  FEATURE_STATE_INVALID: "BUZZ_BACKUP_FEATURE_STATE_INVALID",
  GENERATION_INVALID: "BUZZ_BACKUP_GENERATION_INVALID",
  SCOPE_INVALID: "BUZZ_BACKUP_SCOPE_INVALID",
  DEPLOYMENT_INVALID: "BUZZ_BACKUP_DEPLOYMENT_INVALID",
  OWNER_BINDING_INVALID: "BUZZ_BACKUP_OWNER_BINDING_INVALID",
  POSTGRES_CAPTURE_INVALID: "BUZZ_BACKUP_POSTGRES_CAPTURE_INVALID",
  MEDIA_CAPTURE_INVALID: "BUZZ_BACKUP_MEDIA_CAPTURE_INVALID",
  GIT_CAPTURE_INVALID: "BUZZ_BACKUP_GIT_CAPTURE_INVALID",
  REDIS_CLASSIFICATION_INVALID: "BUZZ_BACKUP_REDIS_CLASSIFICATION_INVALID",
  CROSS_SCOPE_DATA: "BUZZ_BACKUP_CROSS_SCOPE_DATA",
  BACKUP_CAPTURE_INVALID: "BUZZ_BACKUP_CAPTURE_INVALID",
  ISOLATED_RESTORE_INVALID: "BUZZ_BACKUP_ISOLATED_RESTORE_INVALID",
  AUDIT_INTEGRITY_INVALID: "BUZZ_BACKUP_AUDIT_INTEGRITY_INVALID",
  IDENTITY_RECOVERY_INVALID: "BUZZ_BACKUP_IDENTITY_RECOVERY_INVALID",
  HUMAN_ACCEPTANCE_REQUIRED: "BUZZ_BACKUP_HUMAN_ACCEPTANCE_REQUIRED",
  HUMAN_ACCEPTANCE_REJECTED: "BUZZ_BACKUP_HUMAN_ACCEPTANCE_REJECTED",
});

const C = BUZZ_BACKUP_GENERATION_HOLD_CODES;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const LOCAL_PATH = /(?:^|[\s"'])(?:[A-Za-z]:[\\/]|file:\/\/\/|\/(?:home|Users|srv|var)\/|\\\\)/u;
const SECRET = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]/iu;
const FORBIDDEN_KEYS = /^(?:raw|raw_data|raw_body|raw_bytes|raw_payload|payload|body|event_body|message_body|media_bytes|content_bytes|private_key|token|credential)$/iu;
const MAX = Object.freeze({ depth: 24, values: 20000, keys: 64, array: 256, string: 4096 });

const TOP_FIELDS = Object.freeze([
  "schema_version", "feature_state", "generation", "scope_ref", "deployment", "owners",
  "postgres", "media", "git", "redis", "backup_capture", "isolated_restore",
  "audit_integrity", "identity_recovery", "human_acceptance",
]);
const REF_FIELDS = Object.freeze(["entity_id", "revision_id", "content_id", "content_hash_alg"]);
const GENERATION_FIELDS = Object.freeze([
  "generation_id", "generation_ref", "generated_at_utc", "retention_policy_ref", "rpo_policy_ref",
  "rto_policy_ref", "encryption_policy_ref", "encryption_secret_ref", "secret_material_included",
]);
const DEPLOYMENT_FIELDS = Object.freeze([
  "scope_ref", "deployment_ref", "app_ref", "app_version_ref", "schema_ref",
  "migration_ref", "config_ref",
]);
const OWNER_FIELDS = Object.freeze([
  "logical_owner_ref", "byte_owner_ref", "revision_owner_ref", "acceptance_owner_ref",
  "backup_restore_owner_ref",
]);
const POSTGRES_FIELDS = Object.freeze([
  "scope_ref", "logical_snapshot_ref", "snapshot_digest", "snapshot_record_count", "capture_state",
]);
const MEDIA_FIELDS = Object.freeze([
  "scope_ref", "object_inventory_ref", "inventory_digest", "object_count", "capture_state",
  "bytes_embedded",
]);
const GIT_FIELDS = Object.freeze([
  "scope_ref", "data_ref", "revision_ref", "revision_digest", "capture_state",
  "raw_repository_embedded",
]);
const REDIS_FIELDS = Object.freeze(["scope_ref", "subsets"]);
const REDIS_SUBSET_FIELDS = Object.freeze([
  "subset_id", "scope_ref", "classification", "proof_kind", "proof_ref", "backup_digest",
  "backup_captured",
]);
const BACKUP_FIELDS = Object.freeze([
  "scope_ref", "state", "receipt_ref", "generation_digest", "captured_at_utc",
]);
const RESTORE_FIELDS = Object.freeze([
  "scope_ref", "state", "receipt_ref", "source_generation_digest",
  "restored_generation_digest", "exact_readback", "verified_at_utc",
]);
const AUDIT_FIELDS = Object.freeze([
  "scope_ref", "state", "receipt_ref", "audit_log_ref", "expected_generation_digest",
  "observed_generation_digest", "verified_at_utc",
]);
const IDENTITY_FIELDS = Object.freeze([
  "scope_ref", "state", "public_identity_catalog_ref", "recovery_procedure_ref",
  "rotation_policy_ref", "revocation_policy_ref", "recovery_owner_ref", "recovery_receipt_ref",
  "protected_secret_ref", "private_material_included", "verified_at_utc",
]);
const HUMAN_FIELDS = Object.freeze([
  "scope_ref", "state", "reviewer_ref", "decision_ref", "decided_at_utc",
  "acceptance_scope", "task_result_acceptance", "project_knowledge_acceptance",
]);

function compareCodepoints(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actual = Object.keys(value).sort(compareCodepoints);
  const wanted = [...expected].sort(compareCodepoints);
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function safeString(value) {
  return typeof value === "string" && value.length <= MAX.string
    && value.normalize("NFC") === value && !CONTROL.test(value)
    && !LOCAL_PATH.test(value) && !SECRET.test(value);
}

function exactInstant(value) {
  if (!safeString(value) || !ISO_UTC.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59;
}

function instantAtOrAfter(value, earlier) {
  return exactInstant(value) && exactInstant(earlier) && value >= earlier;
}

function exactRef(value) {
  return exactKeys(value, REF_FIELDS) && UUID_V4.test(value.entity_id)
    && UUID_V4.test(value.revision_id) && HASH.test(value.content_id)
    && value.content_hash_alg === "sha256";
}

function sameRef(left, right) {
  return exactRef(left) && exactRef(right) && REF_FIELDS.every((key) => left[key] === right[key]);
}

function nonNegativeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function snapshotPlainData(root) {
  const active = new WeakSet();
  let values = 0;
  let forbidden = false;

  function walk(value, depth) {
    values += 1;
    if (values > MAX.values || depth > MAX.depth) throw new Error("limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw new Error("number");
      return value;
    }
    if (typeof value === "string") {
      if (!safeString(value)) forbidden = true;
      return safeString(value) ? value : "[REDACTED]";
    }
    if (typeof value !== "object" || types.isProxy(value) || active.has(value)) throw new Error("shape");
    active.add(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX.array) throw new Error("array");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key, index) => (
        index < value.length ? key !== String(index) : key !== "length"
      ))) throw new Error("array_shape");
      const output = value.map((entry) => walk(entry, depth + 1));
      active.delete(value);
      return output;
    }
    if (!isPlainRecord(value)) throw new Error("record");
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX.keys || keys.some((key) => typeof key !== "string")) throw new Error("keys");
    const output = {};
    for (const key of keys) {
      if (FORBIDDEN_KEYS.test(key)) forbidden = true;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("descriptor");
      Object.defineProperty(output, key, {
        value: walk(descriptor.value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    active.delete(value);
    return output;
  }

  try {
    return { value: walk(root, 0), forbidden };
  } catch {
    return { value: null, forbidden };
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(compareCodepoints).map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function packetFingerprint(packet) {
  return `sha256:${createHash("sha256")
    .update(`soulforge.backup_controller.buzz_backup_generation.packet.v0\0${stableJson(packet)}`, "utf8")
    .digest("hex")}`;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validRedis(redis, scopeRef) {
  if (!exactKeys(redis, REDIS_FIELDS) || !sameRef(redis.scope_ref, scopeRef)
    || !Array.isArray(redis.subsets) || redis.subsets.length === 0 || redis.subsets.length > 64) return false;
  const ids = redis.subsets.map((subset) => subset?.subset_id);
  if (ids.some((id) => typeof id !== "string" || !SAFE_ID.test(id))
    || new Set(ids).size !== ids.length
    || ids.some((id, index) => index > 0 && compareCodepoints(ids[index - 1], id) >= 0)) return false;
  return redis.subsets.every((subset) => {
    if (!exactKeys(subset, REDIS_SUBSET_FIELDS) || !sameRef(subset.scope_ref, scopeRef)
      || !exactRef(subset.proof_ref)) return false;
    if (subset.classification === "canonical") {
      return subset.proof_kind === "backup_capture" && subset.backup_captured === true
        && HASH.test(subset.backup_digest) && subset.proof_ref.content_id === subset.backup_digest;
    }
    if (subset.classification === "rebuildable") {
      return subset.proof_kind === "deterministic_rebuild" && subset.backup_captured === false
        && subset.backup_digest === null;
    }
    return subset.classification === "ephemeral" && subset.proof_kind === "ephemeral_exclusion"
      && subset.backup_captured === false && subset.backup_digest === null;
  });
}

function buildGenerationMaterial(packet) {
  if (!exactKeys(packet, TOP_FIELDS) || !exactRef(packet.scope_ref)
    || !exactKeys(packet.generation, GENERATION_FIELDS)
    || typeof packet.generation.generation_id !== "string" || !SAFE_ID.test(packet.generation.generation_id)
    || !exactRef(packet.generation.generation_ref) || !exactInstant(packet.generation.generated_at_utc)
    || !exactKeys(packet.deployment, DEPLOYMENT_FIELDS)
    || !sameRef(packet.deployment.scope_ref, packet.scope_ref)
    || !["deployment_ref", "app_ref", "app_version_ref", "schema_ref", "migration_ref", "config_ref"]
      .every((key) => exactRef(packet.deployment[key]))
    || !exactKeys(packet.postgres, POSTGRES_FIELDS) || !sameRef(packet.postgres.scope_ref, packet.scope_ref)
    || !exactRef(packet.postgres.logical_snapshot_ref) || !HASH.test(packet.postgres.snapshot_digest)
    || packet.postgres.logical_snapshot_ref.content_id !== packet.postgres.snapshot_digest
    || !nonNegativeCount(packet.postgres.snapshot_record_count) || packet.postgres.capture_state !== "captured"
    || !exactKeys(packet.media, MEDIA_FIELDS) || !sameRef(packet.media.scope_ref, packet.scope_ref)
    || !exactRef(packet.media.object_inventory_ref) || !HASH.test(packet.media.inventory_digest)
    || packet.media.object_inventory_ref.content_id !== packet.media.inventory_digest
    || !nonNegativeCount(packet.media.object_count) || packet.media.capture_state !== "captured"
    || packet.media.bytes_embedded !== false
    || !exactKeys(packet.git, GIT_FIELDS) || !sameRef(packet.git.scope_ref, packet.scope_ref)
    || !exactRef(packet.git.data_ref) || !exactRef(packet.git.revision_ref)
    || !HASH.test(packet.git.revision_digest) || packet.git.revision_ref.content_id !== packet.git.revision_digest
    || packet.git.capture_state !== "captured" || packet.git.raw_repository_embedded !== false
    || !validRedis(packet.redis, packet.scope_ref)) return null;

  return {
    schema_version: BUZZ_BACKUP_GENERATION_MATERIAL_SCHEMA_VERSION,
    scope_ref: packet.scope_ref,
    generation: {
      generation_id: packet.generation.generation_id,
      generation_ref: packet.generation.generation_ref,
      generated_at_utc: packet.generation.generated_at_utc,
    },
    deployment: {
      scope_ref: packet.deployment.scope_ref,
      deployment_ref: packet.deployment.deployment_ref,
      app_ref: packet.deployment.app_ref,
      app_version_ref: packet.deployment.app_version_ref,
      schema_ref: packet.deployment.schema_ref,
      migration_ref: packet.deployment.migration_ref,
      config_ref: packet.deployment.config_ref,
    },
    postgres: {
      scope_ref: packet.postgres.scope_ref,
      logical_snapshot_ref: packet.postgres.logical_snapshot_ref,
      snapshot_digest: packet.postgres.snapshot_digest,
      snapshot_record_count: packet.postgres.snapshot_record_count,
      capture_state: packet.postgres.capture_state,
    },
    media: {
      scope_ref: packet.media.scope_ref,
      object_inventory_ref: packet.media.object_inventory_ref,
      inventory_digest: packet.media.inventory_digest,
      object_count: packet.media.object_count,
      capture_state: packet.media.capture_state,
      bytes_embedded: packet.media.bytes_embedded,
    },
    git: {
      scope_ref: packet.git.scope_ref,
      data_ref: packet.git.data_ref,
      revision_ref: packet.git.revision_ref,
      revision_digest: packet.git.revision_digest,
      capture_state: packet.git.capture_state,
      raw_repository_embedded: packet.git.raw_repository_embedded,
    },
    redis: {
      scope_ref: packet.redis.scope_ref,
      subsets: packet.redis.subsets.map((subset) => ({
        subset_id: subset.subset_id,
        scope_ref: subset.scope_ref,
        classification: subset.classification,
        proof_kind: subset.proof_kind,
        proof_ref: subset.proof_ref,
        backup_digest: subset.backup_digest,
        backup_captured: subset.backup_captured,
      })),
    },
  };
}

function digestGenerationMaterial(packet) {
  const material = buildGenerationMaterial(packet);
  if (material === null) return null;
  return `sha256:${createHash("sha256")
    .update(`soulforge.backup_controller.buzz_backup_generation.material.v0\0${stableJson(material)}`, "utf8")
    .digest("hex")}`;
}

export function deriveBuzzBackupGenerationDigest(input) {
  const snapshot = snapshotPlainData(input);
  if (snapshot.value === null || snapshot.forbidden) return null;
  return digestGenerationMaterial(snapshot.value);
}

function push(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code);
}

function fixedReceipt(packet, packetSha256, states) {
  return {
    schema_version: "soulforge.backup_controller.buzz_backup_generation.receipt.v0",
    packet_sha256: packetSha256,
    bound_generation_digest: states.generationDigest,
    generation_id: exactKeys(packet?.generation, GENERATION_FIELDS)
      && typeof packet.generation.generation_id === "string" && SAFE_ID.test(packet.generation.generation_id)
      ? packet.generation.generation_id : null,
    scope_ref: exactRef(packet?.scope_ref) ? packet.scope_ref : null,
    backup_capture_state: states.backup ? "captured" : "hold",
    isolated_restore_readback_state: states.restore ? "verified" : "hold",
    audit_integrity_state: states.audit ? "verified" : "hold",
    identity_recovery_state: states.identity ? "verified" : "hold",
    human_acceptance_state: states.human,
    claim_ceiling: "ref_bound_metadata_only",
    authority: {
      backup_generation_accepted: states.accepted,
      task_result_acceptance: false,
      official_task_completion: false,
      project_artifact_acceptance: false,
      project_knowledge_acceptance: false,
    },
    effects: {
      filesystem_reads: 0,
      filesystem_writes: 0,
      database_calls: 0,
      network_calls: 0,
      process_calls: 0,
      clock_reads: 0,
    },
  };
}

export function evaluateBuzzBackupGenerationManifest(input, trustedExpectedPacketSha256 = null) {
  const snapshot = snapshotPlainData(input);
  const blockers = [];
  if (snapshot.value === null) push(blockers, C.INPUT_INVALID);
  if (snapshot.forbidden) push(blockers, C.RAW_OR_SECRET_FORBIDDEN);
  const packet = snapshot.value;
  const packetShape = exactKeys(packet, TOP_FIELDS);
  if (!packetShape) push(blockers, C.INPUT_INVALID);
  const packetSha256 = packet && !snapshot.forbidden ? packetFingerprint(packet) : null;
  if (trustedExpectedPacketSha256 === null) push(blockers, C.TRUSTED_PIN_REQUIRED);
  else if (typeof trustedExpectedPacketSha256 !== "string"
    || !HASH.test(trustedExpectedPacketSha256) || trustedExpectedPacketSha256 !== packetSha256) {
    push(blockers, C.TRUSTED_PIN_MISMATCH);
  }

  if (!packetShape || packet.schema_version !== BUZZ_BACKUP_GENERATION_PACKET_SCHEMA_VERSION
    || packet.feature_state !== "off") push(blockers, C.FEATURE_STATE_INVALID);

  const generationValid = packetShape && exactKeys(packet.generation, GENERATION_FIELDS)
    && typeof packet.generation.generation_id === "string" && SAFE_ID.test(packet.generation.generation_id)
    && exactRef(packet.generation.generation_ref)
    && exactInstant(packet.generation.generated_at_utc)
    && exactRef(packet.generation.retention_policy_ref) && exactRef(packet.generation.rpo_policy_ref)
    && exactRef(packet.generation.rto_policy_ref) && exactRef(packet.generation.encryption_policy_ref)
    && exactRef(packet.generation.encryption_secret_ref)
    && packet.generation.secret_material_included === false;
  if (!generationValid) push(blockers, C.GENERATION_INVALID);

  const scopeValid = packetShape && exactRef(packet.scope_ref);
  if (!scopeValid) push(blockers, C.SCOPE_INVALID);
  const scope = scopeValid ? packet.scope_ref : null;

  const deploymentValid = scope && exactKeys(packet.deployment, DEPLOYMENT_FIELDS)
    && sameRef(packet.deployment.scope_ref, scope)
    && ["deployment_ref", "app_ref", "app_version_ref", "schema_ref", "migration_ref", "config_ref"]
      .every((key) => exactRef(packet.deployment[key]));
  if (!deploymentValid) push(blockers, C.DEPLOYMENT_INVALID);

  const ownersValid = packetShape && exactKeys(packet.owners, OWNER_FIELDS)
    && OWNER_FIELDS.every((key) => exactRef(packet.owners[key]));
  if (!ownersValid) push(blockers, C.OWNER_BINDING_INVALID);

  const postgresValid = scope && exactKeys(packet.postgres, POSTGRES_FIELDS)
    && sameRef(packet.postgres.scope_ref, scope) && exactRef(packet.postgres.logical_snapshot_ref)
    && HASH.test(packet.postgres.snapshot_digest)
    && packet.postgres.logical_snapshot_ref.content_id === packet.postgres.snapshot_digest
    && nonNegativeCount(packet.postgres.snapshot_record_count) && packet.postgres.capture_state === "captured";
  if (!postgresValid) push(blockers, C.POSTGRES_CAPTURE_INVALID);

  const mediaValid = scope && exactKeys(packet.media, MEDIA_FIELDS)
    && sameRef(packet.media.scope_ref, scope) && exactRef(packet.media.object_inventory_ref)
    && HASH.test(packet.media.inventory_digest)
    && packet.media.object_inventory_ref.content_id === packet.media.inventory_digest
    && nonNegativeCount(packet.media.object_count) && packet.media.capture_state === "captured"
    && packet.media.bytes_embedded === false;
  if (!mediaValid) push(blockers, C.MEDIA_CAPTURE_INVALID);

  const gitValid = scope && exactKeys(packet.git, GIT_FIELDS)
    && sameRef(packet.git.scope_ref, scope) && exactRef(packet.git.data_ref) && exactRef(packet.git.revision_ref)
    && HASH.test(packet.git.revision_digest) && packet.git.revision_ref.content_id === packet.git.revision_digest
    && packet.git.capture_state === "captured" && packet.git.raw_repository_embedded === false;
  if (!gitValid) push(blockers, C.GIT_CAPTURE_INVALID);

  const redisValid = scope && validRedis(packet.redis, scope);
  if (!redisValid) push(blockers, C.REDIS_CLASSIFICATION_INVALID);
  const boundGenerationDigest = packetShape ? digestGenerationMaterial(packet) : null;

  const scopeEntries = packetShape ? [
    packet.deployment, packet.postgres, packet.media, packet.git, packet.redis,
    packet.backup_capture, packet.isolated_restore, packet.audit_integrity,
    packet.identity_recovery, packet.human_acceptance,
  ] : [];
  if (scope && scopeEntries.some((entry) => !sameRef(entry?.scope_ref, scope))) push(blockers, C.CROSS_SCOPE_DATA);

  const backupValid = scope && exactKeys(packet.backup_capture, BACKUP_FIELDS)
    && sameRef(packet.backup_capture.scope_ref, scope) && packet.backup_capture.state === "captured"
    && exactRef(packet.backup_capture.receipt_ref) && HASH.test(packet.backup_capture.generation_digest)
    && boundGenerationDigest !== null
    && packet.backup_capture.generation_digest === boundGenerationDigest
    && exactInstant(packet.backup_capture.captured_at_utc)
    && generationValid
    && instantAtOrAfter(packet.backup_capture.captured_at_utc, packet.generation.generated_at_utc);
  if (!backupValid) push(blockers, C.BACKUP_CAPTURE_INVALID);

  const restoreValid = backupValid && exactKeys(packet.isolated_restore, RESTORE_FIELDS)
    && sameRef(packet.isolated_restore.scope_ref, scope) && packet.isolated_restore.state === "verified"
    && exactRef(packet.isolated_restore.receipt_ref) && packet.isolated_restore.exact_readback === true
    && instantAtOrAfter(packet.isolated_restore.verified_at_utc, packet.backup_capture.captured_at_utc)
    && packet.isolated_restore.source_generation_digest === packet.backup_capture.generation_digest
    && packet.isolated_restore.restored_generation_digest === packet.backup_capture.generation_digest;
  if (!restoreValid) push(blockers, C.ISOLATED_RESTORE_INVALID);

  const auditValid = backupValid && exactKeys(packet.audit_integrity, AUDIT_FIELDS)
    && sameRef(packet.audit_integrity.scope_ref, scope) && packet.audit_integrity.state === "verified"
    && exactRef(packet.audit_integrity.receipt_ref) && exactRef(packet.audit_integrity.audit_log_ref)
    && instantAtOrAfter(packet.audit_integrity.verified_at_utc, packet.backup_capture.captured_at_utc)
    && packet.audit_integrity.expected_generation_digest === packet.backup_capture.generation_digest
    && packet.audit_integrity.observed_generation_digest === packet.backup_capture.generation_digest;
  if (!auditValid) push(blockers, C.AUDIT_INTEGRITY_INVALID);

  const identityValid = scope && exactKeys(packet.identity_recovery, IDENTITY_FIELDS)
    && sameRef(packet.identity_recovery.scope_ref, scope) && packet.identity_recovery.state === "recovery_verified"
    && ["public_identity_catalog_ref", "recovery_procedure_ref", "rotation_policy_ref",
      "revocation_policy_ref", "recovery_owner_ref", "recovery_receipt_ref", "protected_secret_ref"]
      .every((key) => exactRef(packet.identity_recovery[key]))
    && packet.identity_recovery.private_material_included === false
    && generationValid
    && instantAtOrAfter(packet.identity_recovery.verified_at_utc, packet.generation.generated_at_utc);
  if (!identityValid) push(blockers, C.IDENTITY_RECOVERY_INVALID);

  const humanShape = scope && exactKeys(packet.human_acceptance, HUMAN_FIELDS)
    && sameRef(packet.human_acceptance.scope_ref, scope) && exactRef(packet.human_acceptance.reviewer_ref)
    && ["accepted", "pending", "rejected"].includes(packet.human_acceptance.state)
    && packet.human_acceptance.acceptance_scope === "backup_generation_only"
    && packet.human_acceptance.task_result_acceptance === false
    && packet.human_acceptance.project_knowledge_acceptance === false
    && (packet.human_acceptance.state === "pending"
      ? packet.human_acceptance.decision_ref === null && packet.human_acceptance.decided_at_utc === null
      : exactRef(packet.human_acceptance.decision_ref)
        && instantAtOrAfter(packet.human_acceptance.decided_at_utc, packet.isolated_restore?.verified_at_utc)
        && instantAtOrAfter(packet.human_acceptance.decided_at_utc, packet.audit_integrity?.verified_at_utc)
        && instantAtOrAfter(packet.human_acceptance.decided_at_utc, packet.identity_recovery?.verified_at_utc));
  const humanState = humanShape ? packet.human_acceptance.state : "hold";
  if (!humanShape || humanState === "pending") push(blockers, C.HUMAN_ACCEPTANCE_REQUIRED);
  else if (humanState === "rejected") push(blockers, C.HUMAN_ACCEPTANCE_REJECTED);

  const accepted = blockers.length === 0;
  const receipt = fixedReceipt(packet, packetSha256, {
    backup: backupValid,
    restore: restoreValid,
    audit: auditValid,
    identity: identityValid,
    human: humanState,
    generationDigest: boundGenerationDigest,
    accepted,
  });
  const status = accepted ? "ACCEPTED_BACKUP_GENERATION" : "HOLD";
  return deepFreeze({
    schema_version: BUZZ_BACKUP_GENERATION_RESULT_SCHEMA_VERSION,
    status,
    blocker_codes: blockers.sort(compareCodepoints),
    receipt,
  });
}

// Owner-local internal packet contract for P4 Project PDF Knowledge Pilot.
// Defines schemas, hash domains, bindings, and canonical serialisation shared
// by the preparation module and runner module to prevent packet drift.
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import { types } from "node:util";

import { canonicalise, compareCodePoints } from "../engineering_engine/kernel/canonical.mjs";
import { inspectIdentifierOpacity, isWellFormedRef, sameExactRef } from "../engineering_engine/kernel/identity.mjs";

export const PACKET_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_authority_packet.v0";
export const RUN_AUTHORITY_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_run_authority.v0";
export const ATTEMPT_CLAIM_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_attempt_claim_receipt.v0";
export const PROJECT_PDF_KNOWLEDGE_PILOT_COMMAND_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_command_receipt.v0";
export const PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_preparation_command_receipt.v0";
export const PREPARATION_REQUEST_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_preparation_request.v0";
export const PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_pilot_preparation_request.v0";

export const RUN_AUTHORITY_HASH_DOMAIN =
  "soulforge.project_pdf_knowledge_pilot.run_authority.v0";
export const OUTPUT_ROOT_HASH_DOMAIN =
  "soulforge.project_pdf_knowledge_pilot.output_root.v0";
export const CANDIDATE_HASH_DOMAIN =
  "soulforge.project_pdf_knowledge_candidate.v0";

export const FEATURE_STATE = "off";
export const CANDIDATE_FILENAME = "project_pdf_knowledge_candidate.json";
export const RECEIPT_FILENAME = "project_pdf_knowledge_persistence_receipt.json";
export const MAX_PACKET_BYTES = 512 * 1024;
export const MAX_LAUNCH_BYTES = 2 * 1024 * 1024;
export const MAX_OUTPUT_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
export const MAX_PATH_CHARS = 4096;

export const SHA256_HEX = /^[0-9a-f]{64}$/u;
export const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
export const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
export const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
export const CONTROL = /[\u0000-\u001f\u007f]/u;
export const WINDOWS_UNC_OR_DEVICE_NAMESPACE = /^[\\/]{2}/u;
export const WINDOWS_DRIVE_DESIGNATOR = /^[A-Za-z]:(?=[\\/]|$)/u;
export const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
export const RESERVED_FLOATING_REVISION = /^(?:latest|current|head|tip|floating)$/iu;

export const PACKET_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "feature_state",
  "run_authority",
  "launch",
  "source_binding",
  "output",
]);
export const RUN_AUTHORITY_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "feature_state",
  "purpose",
  "expires_at_utc",
  "attempt_limit",
  "consumption_state",
  "retry_allowed",
  "authority_ref",
  "authority_digest_sha256",
]);
export const LAUNCH_FIELDS = Object.freeze(["absolute_path", "sha256", "byte_count"]);
export const SOURCE_BINDING_FIELDS = Object.freeze([
  "project_binding_ref",
  "document_revision_ref",
  "trusted_source_revision_receipt_sha256",
]);
export const OUTPUT_FIELDS = Object.freeze([
  "absolute_root_path",
  "root_commitment_sha256",
  "candidate_filename",
  "receipt_filename",
]);
export const EXACT_REF_FIELDS = Object.freeze([
  "entity_id",
  "revision_id",
  "content_id",
  "content_hash_alg",
]);
export const AUTHORITY_REF_IDENTITY_FIELDS = Object.freeze([
  "content_hash_alg",
  "entity_id",
  "revision_id",
]);
export const PREPARATION_REQUEST_FIELDS = Object.freeze([
  "authority_ref_identity",
  "document_revision_ref",
  "expected_launch_byte_count",
  "expected_launch_sha256",
  "expires_at_utc",
  "launch_path",
  "output_root_path",
  "project_binding_ref",
  "schema_version",
  "trusted_source_revision_receipt_sha256",
]);

export function authorityOff() {
  return deepFreeze({
    source_truth: false,
    canon: false,
    project_state: false,
    owner_identity_verified: false,
    owner_approval_verified: false,
    accepted_context: false,
    persistent_write_allowed: false,
    activation_allowed: false,
    engine_input_allowed: false,
    erp_write_allowed: false,
    taskdriver_allowed: false,
  });
}

export function bodyFreeCandidate(candidate) {
  if (!ordinaryDataObject(candidate) || typeof candidate.candidate_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(candidate.candidate_sha256)) return false;
  const forbidden = new Set([
    "text", "body", "raw_query", "query", "path", "absolute_path", "relative_locator",
    "launch_path", "document_path", "root_path", "pages_text", "excerpt",
  ]);
  const pending = [candidate];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (forbidden.has(key)) return false;
      pending.push(value);
    }
  }
  return true;
}

export function recomputeCandidateDigest(candidate) {
  if (!ordinaryDataObject(candidate) || !Object.hasOwn(candidate, "candidate_sha256")) return null;
  const material = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (key !== "candidate_sha256") material[key] = value;
  }
  return canonicalFingerprint(CANDIDATE_HASH_DOMAIN, material);
}

export function runAuthorityBindingMaterial(packet) {
  const authority = packet.run_authority;
  return {
    schema_version: packet.schema_version,
    kind: packet.kind,
    feature_state: packet.feature_state,
    run_authority: {
      schema_version: authority.schema_version,
      kind: authority.kind,
      feature_state: authority.feature_state,
      purpose: authority.purpose,
      expires_at_utc: authority.expires_at_utc,
      attempt_limit: authority.attempt_limit,
      consumption_state: authority.consumption_state,
      retry_allowed: authority.retry_allowed,
      authority_ref_identity: {
        entity_id: authority.authority_ref.entity_id,
        revision_id: authority.authority_ref.revision_id,
        content_hash_alg: authority.authority_ref.content_hash_alg ?? "sha256",
      },
    },
    launch: {
      absolute_path: packet.launch.absolute_path,
      sha256: packet.launch.sha256,
      byte_count: packet.launch.byte_count,
    },
    source_binding: {
      project_binding_ref: cloneRef(packet.source_binding.project_binding_ref),
      document_revision_ref: cloneRef(packet.source_binding.document_revision_ref),
      trusted_source_revision_receipt_sha256:
        packet.source_binding.trusted_source_revision_receipt_sha256,
    },
    output: {
      absolute_root_path: packet.output.absolute_root_path,
      root_commitment_sha256: packet.output.root_commitment_sha256,
      candidate_filename: packet.output.candidate_filename,
      receipt_filename: packet.output.receipt_filename,
    },
  };
}

export function computeRunAuthorityDigest(packet) {
  return canonicalFingerprint(RUN_AUTHORITY_HASH_DOMAIN, runAuthorityBindingMaterial(packet));
}

export function computeOutputRootCommitment(absoluteRootPath) {
  return canonicalFingerprint(OUTPUT_ROOT_HASH_DOMAIN, {
    absolute_root_path: absoluteRootPath,
  });
}

/**
 * Builds one canonical Project PDF Knowledge Pilot authority packet v0.
 */
export function buildCanonicalAuthorityPacket({
  authorityRefIdentity,
  expiresAtUtc,
  launch,
  sourceBinding,
  output,
}) {
  const rootCommitmentSha256 = computeOutputRootCommitment(output.absoluteRootPath);
  const draft = {
    schema_version: PACKET_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_pilot_authority_packet",
    feature_state: FEATURE_STATE,
    run_authority: {
      schema_version: RUN_AUTHORITY_SCHEMA_VERSION,
      kind: "project_pdf_knowledge_pilot_run_authority",
      feature_state: FEATURE_STATE,
      purpose: "one_admitted_pdf_knowledge_candidate_persist",
      expires_at_utc: expiresAtUtc,
      attempt_limit: 1,
      consumption_state: "unconsumed",
      retry_allowed: false,
      authority_ref: {
        entity_id: authorityRefIdentity.entity_id,
        revision_id: authorityRefIdentity.revision_id,
        content_id: "sha256:" + "0".repeat(64),
        content_hash_alg: authorityRefIdentity.content_hash_alg ?? "sha256",
      },
      authority_digest_sha256: "sha256:" + "0".repeat(64),
    },
    launch: {
      absolute_path: launch.absolutePath,
      sha256: launch.sha256,
      byte_count: launch.byteCount,
    },
    source_binding: {
      project_binding_ref: cloneRef(sourceBinding.projectBindingRef),
      document_revision_ref: cloneRef(sourceBinding.documentRevisionRef),
      trusted_source_revision_receipt_sha256: sourceBinding.trustedSourceReceiptSha256,
    },
    output: {
      absolute_root_path: output.absoluteRootPath,
      root_commitment_sha256: rootCommitmentSha256,
      candidate_filename: output.candidateFilename ?? CANDIDATE_FILENAME,
      receipt_filename: output.receiptFilename ?? RECEIPT_FILENAME,
    },
  };

  const authorityDigest = computeRunAuthorityDigest(draft);
  draft.run_authority.authority_digest_sha256 = authorityDigest;
  draft.run_authority.authority_ref.content_id = authorityDigest;

  return deepFreeze(draft);
}

export function validateAuthorityPacket(packet) {
  if (!ordinaryDataObject(packet) || !exactKeys(packet, PACKET_FIELDS)
      || packet.schema_version !== PACKET_SCHEMA_VERSION
      || packet.kind !== "project_pdf_knowledge_pilot_authority_packet"
      || packet.feature_state !== FEATURE_STATE) {
    return null;
  }
  if (!validateRunAuthorityShape(packet.run_authority)) return null;
  const launch = validateLaunch(packet.launch);
  if (launch === null) return null;
  const sourceBinding = validateSourceBinding(packet.source_binding);
  if (sourceBinding === null) return null;
  const output = validateOutput(packet.output);
  if (output === null) return null;
  if (!validateRunAuthorityBinding(packet)) return null;
  return { launch, sourceBinding, output };
}

export function validateRunAuthorityShape(authority) {
  if (!ordinaryDataObject(authority) || !exactKeys(authority, RUN_AUTHORITY_FIELDS)
      || authority.schema_version !== RUN_AUTHORITY_SCHEMA_VERSION
      || authority.kind !== "project_pdf_knowledge_pilot_run_authority"
      || authority.feature_state !== FEATURE_STATE
      || authority.purpose !== "one_admitted_pdf_knowledge_candidate_persist"
      || authority.attempt_limit !== 1
      || authority.retry_allowed !== false
      || !validExactRef(authority.authority_ref)
      || typeof authority.authority_digest_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(authority.authority_digest_sha256)
      || !canonicalUtc(authority.expires_at_utc)) {
    return false;
  }
  return authority.consumption_state === "unconsumed" || authority.consumption_state === "consumed";
}

export function validateRunAuthorityBinding(packet) {
  const authority = packet?.run_authority;
  if (!authority) return false;
  const expectedDigest = computeRunAuthorityDigest(packet);
  if (expectedDigest === null
      || authority.authority_digest_sha256 !== expectedDigest
      || authority.authority_ref?.content_id !== expectedDigest) {
    return false;
  }
  return true;
}

export function validateLaunch(launch) {
  if (!ordinaryDataObject(launch) || !exactKeys(launch, LAUNCH_FIELDS)
      || typeof launch.absolute_path !== "string" || !safeAbsolutePath(launch.absolute_path)
      || typeof launch.sha256 !== "string" || !SHA256_HEX.test(launch.sha256)
      || !Number.isSafeInteger(launch.byte_count) || launch.byte_count < 1
      || launch.byte_count > MAX_LAUNCH_BYTES) {
    return null;
  }
  return {
    absolutePath: launch.absolute_path,
    sha256: launch.sha256,
    byteCount: launch.byte_count,
  };
}

export function validateSourceBinding(binding) {
  if (!ordinaryDataObject(binding) || !exactKeys(binding, SOURCE_BINDING_FIELDS)
      || !validExactRef(binding.project_binding_ref)
      || !validExactRef(binding.document_revision_ref)
      || typeof binding.trusted_source_revision_receipt_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(binding.trusted_source_revision_receipt_sha256)) {
    return null;
  }
  return {
    projectRef: cloneRef(binding.project_binding_ref),
    documentRef: cloneRef(binding.document_revision_ref),
    trustedSourceReceiptSha256: binding.trusted_source_revision_receipt_sha256,
  };
}

export function validateOutput(output) {
  if (!ordinaryDataObject(output) || !exactKeys(output, OUTPUT_FIELDS)
      || typeof output.absolute_root_path !== "string" || !safeAbsolutePath(output.absolute_root_path)
      || typeof output.root_commitment_sha256 !== "string"
      || !SHA256_CONTENT_ID.test(output.root_commitment_sha256)
      || output.candidate_filename !== CANDIDATE_FILENAME
      || output.receipt_filename !== RECEIPT_FILENAME) {
    return null;
  }
  const expectedCommitment = computeOutputRootCommitment(output.absolute_root_path);
  if (expectedCommitment === null || expectedCommitment !== output.root_commitment_sha256) {
    return null;
  }
  return {
    absoluteRootPath: output.absolute_root_path,
    candidateFilename: output.candidate_filename,
    receiptFilename: output.receipt_filename,
  };
}

export function safeAbsolutePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_CHARS
      || value.normalize("NFC") !== value || CONTROL.test(value)
      || !isAbsolute(value) || resolve(value) !== value
      || WINDOWS_UNC_OR_DEVICE_NAMESPACE.test(value)) return false;
  const colonStart = WINDOWS_DRIVE_DESIGNATOR.test(value) ? 2 : 0;
  if (value.includes(":", colonStart)) return false;
  if (process.platform !== "win32") return true;
  return !value.split(/[\\/]/u).filter(Boolean).some((segment) => WINDOWS_DEVICE_NAME.test(segment)
    || /[. ]$/u.test(segment));
}

export function canonicalUtc(value) {
  if (typeof value !== "string" || !ISO_UTC.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

export function validExactRef(ref) {
  if (!ordinaryDataObject(ref) || !exactKeys(ref, EXACT_REF_FIELDS)
      || typeof ref.entity_id !== "string" || typeof ref.revision_id !== "string"
      || !SAFE_IDENTIFIER.test(ref.entity_id) || !SAFE_IDENTIFIER.test(ref.revision_id)
      || inspectIdentifierOpacity(ref.entity_id).opaque !== true
      || inspectIdentifierOpacity(ref.revision_id).opaque !== true
      || RESERVED_FLOATING_REVISION.test(ref.revision_id)
      || ref.content_hash_alg !== "sha256"
      || typeof ref.content_id !== "string" || !SHA256_CONTENT_ID.test(ref.content_id)) {
    return false;
  }
  try {
    return isWellFormedRef(ref);
  } catch {
    return false;
  }
}

export function sameRef(left, right) {
  try {
    return sameExactRef(left, right);
  } catch {
    return false;
  }
}

export function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

export function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function ordinaryDataObject(value) {
  try {
    return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

export function snapshotOwnDataObject(value, expected) {
  try {
    if (!ordinaryDataObject(value)) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expected.length || keys.some((key) => typeof key !== "string")) return null;
    const expectedKeys = [...expected].sort(compareCodePoints);
    const actualKeys = keys.sort(compareCodePoints);
    if (actualKeys.some((key, index) => key !== expectedKeys[index])) return null;
    const snapshot = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !Object.hasOwn(descriptor, "value")
          || descriptor.enumerable !== true) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function exactKeys(value, expected) {
  if (!ordinaryDataObject(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  return actual.length === required.length
    && actual.every((key, index) => key === required[index]);
}

export function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      for (const child of node) visit(child, path + "[]");
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) visit(
        child,
        path ? path + "." + key : key,
      );
    }
  };
  visit(value);
  return rules;
}

export function canonicalFingerprint(domain, material) {
  try {
    return "sha256:" + sha256Hex(domain + "\0" + canonicalise(material, insertionOrderRules(material)));
  } catch {
    return null;
  }
}

export function canonicalBytes(value) {
  return Buffer.from(canonicalise(value, insertionOrderRules(value)) + "\n", "utf8");
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

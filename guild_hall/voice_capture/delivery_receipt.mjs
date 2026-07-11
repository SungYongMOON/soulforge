import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const deliveryReceiptSchemaVersion = "soulforge.voice_delivery_receipt.v0";
export const deliveryAcknowledgementSchemaVersion = "soulforge.voice_delivery_acknowledgement.v0";

const DELIVERY_ROOT_REF = "_workspaces/system/voice_capture/delivery";
const WORKSPACE_ROOT_REF = "_workspaces/system/voice_capture";
const WORKMETA_ROOT_REF = "_workmeta";
const STAGES = new Set(["plaud_import_ready", "local_asr_ready"]);
const RECEIPT_KEYS = new Set([
  "schema_version", "receipt_id", "status", "session_id", "recording_id", "stage", "producer_node", "created_at", "files",
]);
const FILE_KEYS = new Set(["role", "ref", "size_bytes", "sha256", "required"]);
const ACK_KEYS = new Set([
  "schema_version", "status", "consumer_node", "session_id", "receipt_id", "receipt_ref", "receipt_sha256", "checked_at", "files",
]);
const ACK_FILE_KEYS = new Set(["role", "ref", "status", "observed_size_bytes", "observed_sha256"]);
const FILE_ROLES = new Set([
  "session_manifest",
  "source_audio",
  "provider_transcript",
  "provider_transcript_segments",
  "provider_original_transcript",
  "provider_summary",
  "source_event_draft",
  "recording_manifest",
  "analysis_manifest",
  "local_transcript",
  "local_transcript_segments",
  "project_context_source",
  "project_context_event",
]);
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/u;
const SECRET_KEY_PATTERN = /^(?:api[_-]?key|authorization|cookie|credential|password|secret|token)$/iu;

export class DeliveryContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeliveryContractError";
    this.exitCode = 2;
  }
}

export async function prepareDeliveryReceipt(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const stage = requireStage(options.stage);
  const producerNode = requireSafeId(options.producerNode, "producer_node");
  const sessionDirRef = normalizeSessionDirRef(repoRoot, options.sessionDir);
  const sessionManifestRef = `${sessionDirRef}/session_manifest.json`;
  await assertSafeRef(repoRoot, sessionManifestRef, { mustExist: true });
  const sessionManifest = await readJson(path.join(repoRoot, sessionManifestRef), "session_manifest");
  const sessionId = requireSafeId(sessionManifest.session_id ?? path.posix.basename(sessionDirRef), "session_id");
  const recordingId = requireSafeId(
    options.recordingId ?? sessionManifest.recording_id ?? sessionId,
    "recording_id",
  );
  const specs = options.files ?? buildStageFileSpecs({ sessionDirRef, sessionManifest, recordingId, stage });
  const normalizedSpecs = normalizeFileSpecs(specs);
  const rows = [];
  const missing = [];

  for (const spec of normalizedSpecs) {
    if (!spec.ref) {
      if (spec.required) missing.push({ role: spec.role, ref: null, status: "missing" });
      continue;
    }
    try {
      const file = await inspectFile(repoRoot, spec.ref);
      rows.push({ role: spec.role, ref: spec.ref, size_bytes: file.size_bytes, sha256: file.sha256, required: spec.required });
    } catch (error) {
      if (error?.code === "ENOENT") {
        if (spec.required) missing.push({ role: spec.role, ref: spec.ref, status: "missing" });
        continue;
      }
      throw error;
    }
  }

  if (missing.length > 0) {
    return {
      schema_version: "soulforge.voice_delivery_prepare_result.v0",
      ok: false,
      status: "missing",
      applied: false,
      session_id: sessionId,
      stage,
      missing,
    };
  }

  rows.sort(compareFileRows);
  const receiptId = `voice-delivery-${sha256Bytes(Buffer.from(JSON.stringify(rows))).slice(0, 24)}`;
  const receipt = {
    schema_version: deliveryReceiptSchemaVersion,
    receipt_id: receiptId,
    status: "ready",
    session_id: sessionId,
    recording_id: recordingId,
    stage,
    producer_node: producerNode,
    created_at: toUtcIso(options.now),
    files: rows,
  };
  const receiptRef = producerReceiptRef(sessionId);
  const existingReceipt = await readOptionalContractJson(repoRoot, receiptRef, "delivery_receipt");
  if (existingReceipt) {
    validateReceipt(existingReceipt);
    if (sameWithoutTimestamp(existingReceipt, receipt, "created_at")) receipt.created_at = existingReceipt.created_at;
  }
  validateReceipt(receipt);
  const write = options.apply
    ? await writeJsonIfChanged(repoRoot, receiptRef, receipt)
    : { applied: false, changed: false };
  return {
    schema_version: "soulforge.voice_delivery_prepare_result.v0",
    ok: true,
    status: "ready",
    applied: write.applied,
    changed: write.changed,
    receipt_ref: receiptRef,
    receipt,
  };
}

export async function acknowledgeDelivery(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sessionId = requireSafeId(options.sessionId, "session_id");
  const consumerNode = requireSafeId(options.consumerNode, "consumer_node");
  const receiptRef = producerReceiptRef(sessionId);
  const receiptPath = path.join(repoRoot, receiptRef);
  await assertSafeRef(repoRoot, receiptRef, { mustExist: true });
  const receipt = await readJson(receiptPath, "delivery_receipt");
  validateReceipt(receipt);
  if (receipt.session_id !== sessionId) throw new DeliveryContractError("receipt_session_id_mismatch");
  if (receipt.producer_node === consumerNode) throw new DeliveryContractError("consumer_node_must_differ_from_producer_node");
  const receiptSha256 = await sha256File(receiptPath);
  const files = [];

  for (const expected of receipt.files) {
    let status = "delivered";
    let observedSizeBytes = null;
    let observedSha256 = null;
    try {
      const observed = await inspectFile(repoRoot, expected.ref);
      observedSizeBytes = observed.size_bytes;
      observedSha256 = observed.sha256;
      if (observed.size_bytes !== expected.size_bytes || observed.sha256 !== expected.sha256) status = "mismatch";
    } catch (error) {
      if (error?.code === "ENOENT") status = "missing";
      else throw error;
    }
    files.push({
      role: expected.role,
      ref: expected.ref,
      status,
      observed_size_bytes: observedSizeBytes,
      observed_sha256: observedSha256,
    });
  }
  const status = files.some((row) => row.status === "missing")
    ? "missing"
    : files.some((row) => row.status === "mismatch")
      ? "mismatch"
      : "delivered";
  const acknowledgement = {
    schema_version: deliveryAcknowledgementSchemaVersion,
    status,
    consumer_node: consumerNode,
    session_id: sessionId,
    receipt_id: receipt.receipt_id,
    receipt_ref: receiptRef,
    receipt_sha256: receiptSha256,
    checked_at: toUtcIso(options.now),
    files,
  };
  if (Date.parse(acknowledgement.checked_at) < Date.parse(receipt.created_at)) {
    throw new DeliveryContractError("consumer_checked_at_predates_receipt_created_at");
  }
  const acknowledgementRef = consumerAcknowledgementRef(consumerNode, sessionId);
  const existingAcknowledgement = await readOptionalContractJson(repoRoot, acknowledgementRef, "delivery_acknowledgement");
  if (existingAcknowledgement) {
    validateAcknowledgement(existingAcknowledgement);
    if (sameWithoutTimestamp(existingAcknowledgement, acknowledgement, "checked_at")) {
      acknowledgement.checked_at = existingAcknowledgement.checked_at;
    }
  }
  validateAcknowledgement(acknowledgement);
  let write = { applied: false, changed: false };
  let latestWrite = { applied: false, changed: false };
  if (options.apply) {
    write = await writeJsonIfChanged(repoRoot, acknowledgementRef, acknowledgement);
    latestWrite = await writeJsonIfChanged(repoRoot, consumerLatestRef(consumerNode), acknowledgement);
  }
  return {
    schema_version: "soulforge.voice_delivery_ack_result.v0",
    ok: status === "delivered",
    status,
    applied: write.applied,
    changed: write.changed || latestWrite.changed,
    acknowledgement_ref: acknowledgementRef,
    latest_ref: consumerLatestRef(consumerNode),
    acknowledgement,
  };
}

export async function getDeliveryStatus(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const sessionId = requireSafeId(options.sessionId, "session_id");
  const consumerNode = requireSafeId(options.consumerNode, "consumer_node");
  const receiptRef = producerReceiptRef(sessionId);
  const acknowledgementRef = consumerAcknowledgementRef(consumerNode, sessionId);
  const receipt = await readOptionalContractJson(repoRoot, receiptRef, "delivery_receipt");
  if (!receipt) return statusResult("no_receipt", sessionId, consumerNode, receiptRef, acknowledgementRef);
  validateReceipt(receipt);
  const receiptSha256 = await sha256File(path.join(repoRoot, receiptRef));
  const acknowledgement = await readOptionalContractJson(repoRoot, acknowledgementRef, "delivery_acknowledgement");
  if (!acknowledgement) return statusResult("no_ack", sessionId, consumerNode, receiptRef, acknowledgementRef, receipt);
  validateAcknowledgement(acknowledgement);
  const stale = acknowledgement.session_id !== sessionId
    || acknowledgement.consumer_node !== consumerNode
    || acknowledgement.receipt_id !== receipt.receipt_id
    || acknowledgement.receipt_ref !== receiptRef
    || acknowledgement.receipt_sha256 !== receiptSha256
    || Date.parse(acknowledgement.checked_at) < Date.parse(receipt.created_at)
    || !ackFilesExactlyMatchReceipt(acknowledgement.files, receipt.files);
  if (stale) return statusResult("stale", sessionId, consumerNode, receiptRef, acknowledgementRef, receipt, acknowledgement);
  return statusResult(
    acknowledgement.status,
    sessionId,
    consumerNode,
    receiptRef,
    acknowledgementRef,
    receipt,
    acknowledgement,
  );
}

export function deliveryExitCode(result) {
  return result?.status === "ready" || result?.status === "delivered" ? 0 : 1;
}

export async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function producerReceiptRef(sessionId) {
  return `${DELIVERY_ROOT_REF}/producer_receipts/${requireSafeId(sessionId, "session_id")}.json`;
}

export function consumerAcknowledgementRef(consumerNode, sessionId) {
  return `${DELIVERY_ROOT_REF}/consumer_acknowledgements/${requireSafeId(consumerNode, "consumer_node")}/${requireSafeId(sessionId, "session_id")}.json`;
}

function consumerLatestRef(consumerNode) {
  return `${DELIVERY_ROOT_REF}/consumer_acknowledgements/${requireSafeId(consumerNode, "consumer_node")}/latest.json`;
}

function buildStageFileSpecs({ sessionDirRef, sessionManifest, recordingId, stage }) {
  const dateRef = path.posix.basename(path.posix.dirname(sessionDirRef));
  const common = [
    { role: "session_manifest", ref: `${sessionDirRef}/session_manifest.json`, required: true },
    { role: "source_audio", ref: sessionManifest.audio?.ref, required: true },
  ];
  if (stage === "plaud_import_ready") {
    return [
      ...common,
      { role: "provider_transcript", ref: sessionManifest.transcript?.ref, required: true },
      { role: "provider_transcript_segments", ref: sessionManifest.transcript?.jsonl_ref, required: true },
      { role: "provider_original_transcript", ref: sessionManifest.transcript?.provider_original_ref, required: true },
      { role: "source_event_draft", ref: `${sessionDirRef}/source_event_draft.yaml`, required: true },
      {
        role: "recording_manifest",
        ref: `${WORKSPACE_ROOT_REF}/library/recordings/${dateRef}/${recordingId}/recording_manifest.json`,
        required: true,
      },
      ...(sessionManifest.provider_summary?.status === "provider_output_present_untrusted"
        ? [{ role: "provider_summary", ref: sessionManifest.provider_summary.ref, required: true }]
        : []),
    ];
  }
  const runId = requireSafeId(sessionManifest.independent_transcription?.run_id, "run_id");
  const outputRef = `${sessionDirRef}/analysis/local_asr/${runId}`;
  return [
    ...common,
    { role: "analysis_manifest", ref: `${outputRef}/analysis_manifest.json`, required: true },
    { role: "local_transcript", ref: sessionManifest.independent_transcription?.transcript_ref, required: true },
    { role: "local_transcript_segments", ref: sessionManifest.independent_transcription?.transcript_jsonl_ref, required: true },
    { role: "project_context_source", ref: `${outputRef}/project_context_source.json`, required: true },
    { role: "project_context_event", ref: `${outputRef}/project_context_event.json`, required: true },
    {
      role: "recording_manifest",
      ref: `${WORKSPACE_ROOT_REF}/library/recordings/${dateRef}/${recordingId}/recording_manifest.json`,
      required: true,
    },
  ];
}

function normalizeFileSpecs(specs) {
  if (!Array.isArray(specs) || specs.length === 0) throw new DeliveryContractError("delivery_files_required");
  const seen = new Set();
  return specs.map((spec, index) => {
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new DeliveryContractError(`delivery_file_invalid:${index}`);
    const role = String(spec.role ?? "");
    if (!FILE_ROLES.has(role)) throw new DeliveryContractError(`delivery_file_role_unsafe:${index}`);
    if (spec.required === false) throw new DeliveryContractError(`delivery_file_optional_not_supported:${index}`);
    const ref = spec.ref == null ? null : normalizeAllowedRef(spec.ref);
    if (ref && seen.has(ref)) throw new DeliveryContractError(`delivery_file_ref_duplicate:${ref}`);
    if (ref) seen.add(ref);
    return { role, ref, required: true };
  }).sort((left, right) => left.role.localeCompare(right.role) || String(left.ref).localeCompare(String(right.ref)));
}

function validateReceipt(receipt) {
  validatePlainObject(receipt, RECEIPT_KEYS, "delivery_receipt");
  rejectSecretLikeKeys(receipt, "delivery_receipt");
  if (receipt.schema_version !== deliveryReceiptSchemaVersion) throw new DeliveryContractError("delivery_receipt_schema_version_mismatch");
  if (!/^voice-delivery-[a-f0-9]{24}$/u.test(receipt.receipt_id ?? "")) throw new DeliveryContractError("delivery_receipt_id_invalid");
  if (receipt.status !== "ready") throw new DeliveryContractError("delivery_receipt_status_must_be_ready");
  requireSafeId(receipt.session_id, "session_id");
  requireSafeId(receipt.recording_id, "recording_id");
  requireStage(receipt.stage);
  requireSafeId(receipt.producer_node, "producer_node");
  requireUtcIso(receipt.created_at, "delivery_receipt_created_at_invalid");
  if (!Array.isArray(receipt.files) || receipt.files.length === 0) throw new DeliveryContractError("delivery_receipt_files_required");
  const normalized = [];
  const refs = new Set();
  for (const [index, file] of receipt.files.entries()) {
    validatePlainObject(file, FILE_KEYS, `delivery_receipt.files[${index}]`);
    if (!FILE_ROLES.has(file.role)) throw new DeliveryContractError(`delivery_receipt_file_role_invalid:${index}`);
    const ref = normalizeAllowedRef(file.ref);
    if (refs.has(ref)) throw new DeliveryContractError(`delivery_receipt_file_ref_duplicate:${ref}`);
    refs.add(ref);
    if (!Number.isSafeInteger(file.size_bytes) || file.size_bytes < 0) throw new DeliveryContractError(`delivery_receipt_file_size_invalid:${index}`);
    if (!HASH_PATTERN.test(file.sha256 ?? "")) throw new DeliveryContractError(`delivery_receipt_file_hash_invalid:${index}`);
    if (file.required !== true) throw new DeliveryContractError(`delivery_receipt_file_required_invalid:${index}`);
    normalized.push(file);
  }
  if (JSON.stringify(normalized) !== JSON.stringify([...normalized].sort(compareFileRows))) {
    throw new DeliveryContractError("delivery_receipt_files_not_normalized");
  }
  const expectedId = `voice-delivery-${sha256Bytes(Buffer.from(JSON.stringify(normalized))).slice(0, 24)}`;
  if (receipt.receipt_id !== expectedId) throw new DeliveryContractError("delivery_receipt_id_mismatch");
}

function validateAcknowledgement(acknowledgement) {
  validatePlainObject(acknowledgement, ACK_KEYS, "delivery_acknowledgement");
  rejectSecretLikeKeys(acknowledgement, "delivery_acknowledgement");
  if (acknowledgement.schema_version !== deliveryAcknowledgementSchemaVersion) {
    throw new DeliveryContractError("delivery_acknowledgement_schema_version_mismatch");
  }
  if (!["delivered", "missing", "mismatch"].includes(acknowledgement.status)) {
    throw new DeliveryContractError("delivery_acknowledgement_status_invalid");
  }
  requireSafeId(acknowledgement.consumer_node, "consumer_node");
  requireSafeId(acknowledgement.session_id, "session_id");
  if (!/^voice-delivery-[a-f0-9]{24}$/u.test(acknowledgement.receipt_id ?? "")) {
    throw new DeliveryContractError("delivery_acknowledgement_receipt_id_invalid");
  }
  if (acknowledgement.receipt_ref !== producerReceiptRef(acknowledgement.session_id)) {
    throw new DeliveryContractError("delivery_acknowledgement_receipt_ref_invalid");
  }
  if (!HASH_PATTERN.test(acknowledgement.receipt_sha256 ?? "")) {
    throw new DeliveryContractError("delivery_acknowledgement_receipt_hash_invalid");
  }
  requireUtcIso(acknowledgement.checked_at, "delivery_acknowledgement_checked_at_invalid");
  if (!Array.isArray(acknowledgement.files) || acknowledgement.files.length === 0) {
    throw new DeliveryContractError("delivery_acknowledgement_files_required");
  }
  const refs = new Set();
  for (const [index, file] of acknowledgement.files.entries()) {
    validatePlainObject(file, ACK_FILE_KEYS, `delivery_acknowledgement.files[${index}]`);
    if (!FILE_ROLES.has(file.role)) throw new DeliveryContractError(`delivery_acknowledgement_file_role_invalid:${index}`);
    const ref = normalizeAllowedRef(file.ref);
    if (refs.has(ref)) throw new DeliveryContractError(`delivery_acknowledgement_file_ref_duplicate:${ref}`);
    refs.add(ref);
    if (!["delivered", "missing", "mismatch"].includes(file.status)) {
      throw new DeliveryContractError(`delivery_acknowledgement_file_status_invalid:${index}`);
    }
    if (file.status === "missing") {
      if (file.observed_size_bytes !== null || file.observed_sha256 !== null) {
        throw new DeliveryContractError(`delivery_acknowledgement_missing_observation_invalid:${index}`);
      }
    } else {
      if (!Number.isSafeInteger(file.observed_size_bytes) || file.observed_size_bytes < 0) {
        throw new DeliveryContractError(`delivery_acknowledgement_observed_size_invalid:${index}`);
      }
      if (!HASH_PATTERN.test(file.observed_sha256 ?? "")) {
        throw new DeliveryContractError(`delivery_acknowledgement_observed_hash_invalid:${index}`);
      }
    }
  }
  const derivedStatus = acknowledgement.files.some((row) => row.status === "missing")
    ? "missing"
    : acknowledgement.files.some((row) => row.status === "mismatch")
      ? "mismatch"
      : "delivered";
  if (acknowledgement.status !== derivedStatus) throw new DeliveryContractError("delivery_acknowledgement_status_inconsistent");
}

async function inspectFile(repoRoot, ref) {
  const filePath = await assertSafeRef(repoRoot, ref, { mustExist: true });
  const before = await fs.stat(filePath);
  if (!before.isFile()) throw new DeliveryContractError(`delivery_ref_not_regular_file:${ref}`);
  const sha256 = await sha256File(filePath);
  const after = await fs.stat(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new DeliveryContractError(`delivery_ref_changed_while_hashing:${ref}`);
  }
  return { size_bytes: after.size, sha256 };
}

async function assertSafeRef(repoRoot, value, options = {}) {
  const ref = normalizeAllowedRef(value);
  const filePath = path.join(repoRoot, ...ref.split("/"));
  const parts = ref.split("/");
  let cursor = repoRoot;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try {
      stat = await fs.lstat(cursor);
    } catch (error) {
      if (error?.code === "ENOENT") {
        if (options.mustExist) throw error;
        return filePath;
      }
      throw error;
    }
    const logical = parts.slice(0, index + 1).join("/");
    if (logical === "_workspaces/system" && !stat.isSymbolicLink()) {
      throw new DeliveryContractError("delivery_shared_system_must_be_external_symlink");
    }
    if (stat.isSymbolicLink() && logical !== "_workspaces/system") {
      throw new DeliveryContractError(`delivery_ref_nested_symlink_rejected:${logical}`);
    }
    if (stat.isSymbolicLink() && logical === "_workspaces/system") {
      const [realRepoRoot, realSystemRoot] = await Promise.all([fs.realpath(repoRoot), fs.realpath(cursor)]);
      if (isInside(realRepoRoot, realSystemRoot)) {
        throw new DeliveryContractError("delivery_shared_system_symlink_must_resolve_outside_public_repo");
      }
    }
    if (index < parts.length - 1 && !stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new DeliveryContractError(`delivery_ref_parent_not_directory:${logical}`);
    }
  }
  const allowedRootRef = ref.startsWith(`${WORKSPACE_ROOT_REF}/`) || ref === WORKSPACE_ROOT_REF
    ? WORKSPACE_ROOT_REF
    : WORKMETA_ROOT_REF;
  const allowedRootPath = path.join(repoRoot, ...allowedRootRef.split("/"));
  try {
    const [realAllowedRoot, realFile] = await Promise.all([fs.realpath(allowedRootPath), fs.realpath(filePath)]);
    if (!isInside(realAllowedRoot, realFile)) throw new DeliveryContractError(`delivery_ref_realpath_escape:${ref}`);
  } catch (error) {
    if (error?.code !== "ENOENT" || options.mustExist) throw error;
  }
  return filePath;
}

function normalizeAllowedRef(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new DeliveryContractError("delivery_ref_invalid");
  }
  if (value.includes("\\") || value.includes("\0") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) || path.posix.isAbsolute(value)) {
    throw new DeliveryContractError(`delivery_ref_must_be_relative:${value}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new DeliveryContractError(`delivery_ref_traversal_rejected:${value}`);
  }
  if (!(value === WORKSPACE_ROOT_REF || value.startsWith(`${WORKSPACE_ROOT_REF}/`) || value === WORKMETA_ROOT_REF || value.startsWith(`${WORKMETA_ROOT_REF}/`))) {
    throw new DeliveryContractError(`delivery_ref_outside_allowlist:${value}`);
  }
  return value;
}

function normalizeSessionDirRef(repoRoot, value) {
  if (typeof value !== "string" || value.length === 0) throw new DeliveryContractError("session_dir_required");
  const absolute = path.resolve(repoRoot, value);
  const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
  const normalized = normalizeAllowedRef(relative);
  if (!normalized.startsWith(`${WORKSPACE_ROOT_REF}/sessions/`)) throw new DeliveryContractError("session_dir_outside_voice_sessions");
  return normalized;
}

function requireSafeId(value, label) {
  const normalized = String(value ?? "");
  if (!SAFE_ID_PATTERN.test(normalized) || normalized === "." || normalized === "..") {
    throw new DeliveryContractError(`${label}_unsafe`);
  }
  return normalized;
}

function requireStage(value) {
  if (!STAGES.has(value)) throw new DeliveryContractError("delivery_stage_invalid");
  return value;
}

function validatePlainObject(value, allowedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DeliveryContractError(`${label}_must_be_object`);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new DeliveryContractError(`${label}_unknown_key:${key}`);
  }
}

function rejectSecretLikeKeys(value, trail) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretLikeKeys(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) throw new DeliveryContractError(`secret_like_key_rejected:${trail}.${key}`);
    rejectSecretLikeKeys(nested, `${trail}.${key}`);
  }
}

async function readOptionalContractJson(repoRoot, ref, label) {
  try {
    await assertSafeRef(repoRoot, ref, { mustExist: true });
    return await readJson(path.join(repoRoot, ref), label);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw error;
    throw new DeliveryContractError(`${label}_unreadable_or_invalid`);
  }
}

async function writeJsonIfChanged(repoRoot, ref, value) {
  const outputPath = await assertSafeRef(repoRoot, ref, { mustExist: false });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  try {
    if (await fs.readFile(outputPath, "utf8") === content) return { applied: true, changed: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    await fs.writeFile(tempPath, content, "utf8");
    await fs.rename(tempPath, outputPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return { applied: true, changed: true };
}

function statusResult(status, sessionId, consumerNode, receiptRef, acknowledgementRef, receipt = null, acknowledgement = null) {
  return {
    schema_version: "soulforge.voice_delivery_status.v0",
    ok: status === "delivered",
    status,
    session_id: sessionId,
    consumer_node: consumerNode,
    receipt_ref: receiptRef,
    acknowledgement_ref: acknowledgementRef,
    receipt_id: receipt?.receipt_id ?? null,
    acknowledgement_receipt_id: acknowledgement?.receipt_id ?? null,
  };
}

function compareFileRows(left, right) {
  return left.role.localeCompare(right.role) || left.ref.localeCompare(right.ref);
}

function ackFilesExactlyMatchReceipt(ackFiles, receiptFiles) {
  if (ackFiles.length !== receiptFiles.length) return false;
  return ackFiles.every((row, index) => {
    const expected = receiptFiles[index];
    if (row.role !== expected.role || row.ref !== expected.ref) return false;
    const expectedStatus = row.observed_size_bytes === null && row.observed_sha256 === null
      ? "missing"
      : row.observed_size_bytes === expected.size_bytes && row.observed_sha256 === expected.sha256
        ? "delivered"
        : "mismatch";
    return row.status === expectedStatus;
  });
}

function sameWithoutTimestamp(left, right, timestampKey) {
  const leftCopy = { ...left };
  const rightCopy = { ...right };
  delete leftCopy[timestampKey];
  delete rightCopy[timestampKey];
  return JSON.stringify(leftCopy) === JSON.stringify(rightCopy);
}

function toUtcIso(value) {
  const date = value == null ? new Date() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new DeliveryContractError("delivery_timestamp_invalid");
  return date.toISOString();
}

function requireUtcIso(value, errorCode) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new DeliveryContractError(errorCode);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new DeliveryContractError(errorCode);
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isInside(root, value) {
  const relative = path.relative(root, value);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

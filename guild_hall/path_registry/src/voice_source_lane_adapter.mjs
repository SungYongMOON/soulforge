// Pure PLAUD import/custody receipts -> source-lane capture adapter.
//
// The adapter consumes an already-created `plaud_import_ready` delivery
// receipt and the exact matching copy-only custody receipts. It performs no
// provider or filesystem operation. Its only output is one refs-only
// `capture_generation`; backup, restore, retention, RPO, project promotion,
// and human acceptance remain owned by their existing lanes.

import { createHash } from "node:crypto";

import {
  canonicalJson,
  sha256Canonical,
} from "../../shared/project_history_envelope.mjs";

import { validateLaneRecord } from "./source_lane_index.mjs";

const IMPORT_SCHEMA = "soulforge.voice_delivery_receipt.v0";
const CUSTODY_SCHEMA = "soulforge.voice.copy_only_receipt.v1";
const VOICE_SOURCE_REF = "source.voice_plaud";
const VOICE_ROOT_REF = "_workspaces/system/voice_capture/";

const IMPORT_FIELDS = Object.freeze([
  "created_at", "files", "producer_node", "receipt_id", "recording_id",
  "schema_version", "session_id", "stage", "status",
]);
const IMPORT_FILE_FIELDS = Object.freeze([
  "ref", "required", "role", "sha256", "size_bytes",
]);
const CUSTODY_FIELDS = Object.freeze([
  "captured_at", "custody_kind", "project_state", "receipt_id", "schema_version",
  "sha256", "size", "source_deleted", "source_key", "source_mtime_ms",
  "source_overwritten", "source_owner_ref", "storage_ref",
]);

const REQUIRED_IMPORT_ROLES = Object.freeze([
  "provider_original_transcript",
  "provider_transcript",
  "provider_transcript_segments",
  "recording_manifest",
  "session_manifest",
  "source_audio",
  "source_event_draft",
]);
const OPTIONAL_IMPORT_ROLES = new Set(["provider_summary"]);
const ALLOWED_IMPORT_ROLES = new Set([...REQUIRED_IMPORT_ROLES, ...OPTIONAL_IMPORT_ROLES]);
// `legacy_verified` is intentionally not admitted here: its configurable
// legacy root is not present in either receipt, so this adapter cannot prove
// an exact storage binding without a separate legacy-path-map authority.
const CUSTODY_KINDS = new Set(["immutable_version", "live_copy"]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,127})$/u;
const SAFE_OWNER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SAFE_SCOPE_REF = /^[a-z][a-z0-9_.:/-]{1,160}$/u;
const SAFE_RELATIVE_REF = /^(?![A-Za-z][A-Za-z0-9+.-]*:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[A-Za-z0-9._/-]+$/u;
const FORBIDDEN_KEY = /(?:^|_)(?:access_token|api_key|attachment|authorization|body|bytes|content|cookie|credential|local_path|password|path|payload|private_key|prompt|raw|refresh_token|secret|token|transcript)(?:_|$)/iu;
const SAFE_METADATA_KEYS = new Set(["size_bytes"]);

function fail(code) {
  // Error messages are intentionally fixed. Caller-owned identifiers, keys,
  // paths, and values must never become a public diagnostic side channel.
  const error = new Error(code);
  error.code = code;
  throw error;
}

function snapshot(value, code) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    fail(code);
  }
}

function assertExactKeys(value, expected, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code);
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length
      || keys.some((key, index) => key !== wanted[index])) {
    fail(code);
  }
}

function absolutePathLeak(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function assertMetadataOnly(value, code, seen = new Set()) {
  if (typeof value === "string") {
    if (absolutePathLeak(value)) fail(code);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail(code);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertMetadataOnly(item, code, seen);
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail(code);
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
      if (!SAFE_METADATA_KEYS.has(normalizedKey) && FORBIDDEN_KEY.test(normalizedKey)) fail(code);
      assertMetadataOnly(item, code, seen);
    }
  }
  seen.delete(value);
}

function assertClock(value, code) {
  if (typeof value !== "string" || !ISO.test(value)) fail(code);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(code);
  return timestamp;
}

function assertSuppliedDigest(value, receipt, code) {
  if (typeof value !== "string" || !SHA256.test(value)
      || value !== sha256Canonical(receipt)) {
    fail(code);
  }
}

function normalizeImportReceipt(raw, expectedSessionId, expectedRecordingId) {
  const receipt = snapshot(raw, "voice_import_receipt_invalid");
  assertMetadataOnly(receipt, "voice_import_receipt_forbidden");
  assertExactKeys(receipt, IMPORT_FIELDS, "voice_import_receipt_shape_invalid");
  if (receipt.schema_version !== IMPORT_SCHEMA || receipt.status !== "ready"
      || receipt.stage !== "plaud_import_ready"
      || typeof receipt.receipt_id !== "string"
      || !/^voice-delivery-[0-9a-f]{24}$/u.test(receipt.receipt_id)
      || !SAFE_ID.test(receipt.session_id ?? "")
      || !SAFE_ID.test(receipt.recording_id ?? "")
      || !SAFE_ID.test(receipt.producer_node ?? "")
      || receipt.session_id !== expectedSessionId
      || receipt.recording_id !== expectedRecordingId) {
    fail("voice_import_receipt_not_accepted");
  }
  const createdAt = assertClock(receipt.created_at, "voice_import_clock_invalid");
  if (!Array.isArray(receipt.files) || receipt.files.length < REQUIRED_IMPORT_ROLES.length
      || receipt.files.length > REQUIRED_IMPORT_ROLES.length + OPTIONAL_IMPORT_ROLES.size) {
    fail("voice_import_file_set_invalid");
  }

  const roles = new Set();
  const refs = new Set();
  for (const file of receipt.files) {
    assertExactKeys(file, IMPORT_FILE_FIELDS, "voice_import_file_shape_invalid");
    if (!ALLOWED_IMPORT_ROLES.has(file.role) || roles.has(file.role)
        || typeof file.ref !== "string" || !SAFE_RELATIVE_REF.test(file.ref)
        || !file.ref.startsWith(VOICE_ROOT_REF) || refs.has(file.ref)
        || !Number.isSafeInteger(file.size_bytes) || file.size_bytes < 0
        || typeof file.sha256 !== "string" || !SHA256_HEX.test(file.sha256)
        || file.required !== true) {
      fail("voice_import_file_set_invalid");
    }
    roles.add(file.role);
    refs.add(file.ref);
  }
  if (REQUIRED_IMPORT_ROLES.some((role) => !roles.has(role))) {
    fail("voice_import_file_set_invalid");
  }

  const sorted = [...receipt.files].sort((left, right) =>
    left.role.localeCompare(right.role, "en") || left.ref.localeCompare(right.ref, "en"));
  if (canonicalJson(sorted) !== canonicalJson(receipt.files)) {
    fail("voice_import_files_not_normalized");
  }
  const receiptIdentityRows = receipt.files.map((file) => ({
    role: file.role,
    ref: file.ref,
    size_bytes: file.size_bytes,
    sha256: file.sha256,
    required: true,
  }));
  const expectedReceiptId = `voice-delivery-${createHash("sha256")
    .update(JSON.stringify(receiptIdentityRows))
    .digest("hex")
    .slice(0, 24)}`;
  if (receipt.receipt_id !== expectedReceiptId) fail("voice_import_receipt_id_mismatch");

  const sessionManifest = receipt.files.find((file) => file.role === "session_manifest");
  const sessionMatch = sessionManifest.ref.match(/^_workspaces\/system\/voice_capture\/sessions\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9._-]+)\/session_manifest\.json$/u);
  if (!sessionMatch || sessionMatch[2] !== receipt.session_id) {
    fail("voice_import_occurrence_scope_invalid");
  }
  const sessionRoot = `_workspaces/system/voice_capture/sessions/${sessionMatch[1]}/${receipt.session_id}`;
  const expectedRefs = new Map([
    ["provider_original_transcript", `${sessionRoot}/provider_export/transcript.txt`],
    ["provider_transcript", `${sessionRoot}/transcript.txt`],
    ["provider_transcript_segments", `${sessionRoot}/transcript.jsonl`],
    ["recording_manifest", `${VOICE_ROOT_REF}library/recordings/${sessionMatch[1]}/${receipt.recording_id}/recording_manifest.json`],
    ["session_manifest", `${sessionRoot}/session_manifest.json`],
    ["source_event_draft", `${sessionRoot}/source_event_draft.yaml`],
    ["provider_summary", `${sessionRoot}/provider_export/summary.md`],
  ]);
  for (const file of receipt.files) {
    if (file.role === "source_audio") {
      const audioName = file.ref.slice(`${sessionRoot}/audio/`.length);
      if (!file.ref.startsWith(`${sessionRoot}/audio/`)
          || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u.test(audioName)) {
        fail("voice_import_occurrence_scope_invalid");
      }
    } else if (file.ref !== expectedRefs.get(file.role)) {
      fail("voice_import_occurrence_scope_invalid");
    }
  }
  return { receipt, createdAt };
}

function expectedCustodyStorageRef(custodyKind, sourceKey, digest) {
  if (custodyKind === "immutable_version") return `versions/${sourceKey}.${digest}`;
  return `live_workspace_capture/${sourceKey}`;
}

function custodyReceiptId(sourceOwnerRef, sourceKey, digest) {
  return createHash("sha256")
    .update(`${sourceOwnerRef}\0${sourceKey}\0${digest}`)
    .digest("hex");
}

function normalizeCustodyReceipts(raw, importReceipt, expectedSourceOwnerRef) {
  const receipts = snapshot(raw, "voice_custody_receipts_invalid");
  assertMetadataOnly(receipts, "voice_custody_receipt_forbidden");
  if (!Array.isArray(receipts) || receipts.length !== importReceipt.files.length) {
    fail("voice_custody_coverage_invalid");
  }
  const byKey = new Map();
  for (const receipt of receipts) {
    assertExactKeys(receipt, CUSTODY_FIELDS, "voice_custody_receipt_shape_invalid");
    if (receipt.schema_version !== CUSTODY_SCHEMA
        || typeof receipt.source_owner_ref !== "string"
        || !SAFE_OWNER.test(receipt.source_owner_ref)
        || receipt.source_owner_ref !== expectedSourceOwnerRef
        || typeof receipt.source_key !== "string" || !SAFE_RELATIVE_REF.test(receipt.source_key)
        || (!receipt.source_key.startsWith("sessions/")
          && !receipt.source_key.startsWith("library/"))
        || typeof receipt.sha256 !== "string" || !SHA256_HEX.test(receipt.sha256)
        || !Number.isSafeInteger(receipt.size) || receipt.size < 0
        || typeof receipt.source_mtime_ms !== "number"
        || !Number.isFinite(receipt.source_mtime_ms) || receipt.source_mtime_ms < 0
        || !CUSTODY_KINDS.has(receipt.custody_kind)
        || typeof receipt.storage_ref !== "string" || !SAFE_RELATIVE_REF.test(receipt.storage_ref)
        || receipt.project_state !== "unclassified"
        || receipt.source_deleted !== false || receipt.source_overwritten !== false
        || typeof receipt.receipt_id !== "string" || !SHA256_HEX.test(receipt.receipt_id)
        || receipt.receipt_id !== custodyReceiptId(
          receipt.source_owner_ref, receipt.source_key, receipt.sha256,
        )
        || receipt.storage_ref !== expectedCustodyStorageRef(
          receipt.custody_kind, receipt.source_key, receipt.sha256,
        )
        || byKey.has(receipt.source_key)) {
      fail("voice_custody_receipt_not_accepted");
    }
    const capturedAt = assertClock(receipt.captured_at, "voice_custody_clock_invalid");
    byKey.set(receipt.source_key, { receipt, capturedAt });
  }

  for (const file of importReceipt.files) {
    const sourceKey = file.ref.slice(VOICE_ROOT_REF.length);
    const matched = byKey.get(sourceKey);
    if (!matched || matched.receipt.sha256 !== file.sha256
        || matched.receipt.size !== file.size_bytes) {
      fail("voice_import_custody_unbound");
    }
  }
  return [...byKey.values()].sort((left, right) =>
    left.receipt.source_key.localeCompare(right.receipt.source_key, "en"));
}

function digestRef(prefix, digest) {
  return `${prefix}.${digest.slice("sha256:".length)}`;
}

export function adaptAcceptedPlaudVoiceCaptureToLaneRecord({
  source_ref,
  source_owner_ref,
  expected_source_owner_ref,
  project_scope_ref,
  expected_project_scope_ref,
  expected_session_id,
  expected_recording_id,
  generation_seq,
  import_receipt,
  import_receipt_digest,
  custody_receipts,
  custody_receipts_digest,
  evaluation_time,
  max_receipt_age_seconds,
} = {}) {
  if (source_ref !== VOICE_SOURCE_REF) fail("foreign_voice_source");
  if (typeof source_owner_ref !== "string" || !SAFE_OWNER.test(source_owner_ref)
      || source_owner_ref !== expected_source_owner_ref) {
    fail("foreign_voice_source_owner");
  }
  if (typeof project_scope_ref !== "string" || !SAFE_SCOPE_REF.test(project_scope_ref)
      || project_scope_ref.startsWith("hold:")
      || project_scope_ref !== expected_project_scope_ref) {
    fail("foreign_voice_project_scope");
  }
  if (typeof expected_session_id !== "string" || !SAFE_ID.test(expected_session_id)
      || typeof expected_recording_id !== "string" || !SAFE_ID.test(expected_recording_id)) {
    fail("voice_occurrence_identity_invalid");
  }
  if (!Number.isSafeInteger(generation_seq) || generation_seq < 1) {
    fail("voice_capture_generation_seq_invalid");
  }
  if (!Number.isSafeInteger(max_receipt_age_seconds) || max_receipt_age_seconds < 1) {
    fail("voice_capture_freshness_horizon_invalid");
  }

  const imported = normalizeImportReceipt(
    import_receipt, expected_session_id, expected_recording_id,
  );
  assertSuppliedDigest(import_receipt_digest, imported.receipt, "voice_import_receipt_digest_invalid");
  const custody = normalizeCustodyReceipts(
    custody_receipts, imported.receipt, expected_source_owner_ref,
  );
  const normalizedCustodyReceipts = custody.map((entry) => entry.receipt);
  assertSuppliedDigest(
    custody_receipts_digest,
    normalizedCustodyReceipts,
    "voice_custody_receipts_digest_invalid",
  );

  const evaluatedAt = assertClock(evaluation_time, "voice_capture_evaluation_clock_invalid");
  let capturedAt = imported.createdAt;
  for (const entry of custody) {
    if (entry.capturedAt < imported.createdAt) fail("voice_custody_predates_import");
    if (entry.capturedAt > evaluatedAt) fail("voice_custody_clock_in_future");
    capturedAt = Math.max(capturedAt, entry.capturedAt);
  }
  if (imported.createdAt > evaluatedAt) fail("voice_import_clock_in_future");
  if (evaluatedAt - capturedAt > max_receipt_age_seconds * 1000) {
    fail("voice_capture_receipts_stale");
  }

  const contentDigest = sha256Canonical(imported.receipt.files.map((file) => ({
    role: file.role,
    sha256: file.sha256,
    size_bytes: file.size_bytes,
  })));
  // Re-canonicalize immediately before emitting references so an unsupported
  // or caller-mutated value can never silently alter the referenced evidence.
  canonicalJson(imported.receipt);
  canonicalJson(normalizedCustodyReceipts);
  return validateLaneRecord({
    record_kind: "capture_generation",
    source_ref: VOICE_SOURCE_REF,
    generation_seq,
    capture_ref: digestRef("receipt.voice.plaud-import", import_receipt_digest),
    manifest_ref: digestRef("receipt.voice.custody-set", custody_receipts_digest),
    item_count: imported.receipt.files.length,
    content_digest: contentDigest,
    captured_at: new Date(capturedAt).toISOString(),
    immutable: true,
  });
}

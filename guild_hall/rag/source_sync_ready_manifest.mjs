import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { normalizeRepoPath, readJson } from "../shared/io.mjs";

export const SOURCE_SYNC_READY_MANIFEST_SCHEMA_VERSION = "soulforge.source_sync_ready_manifest.v0";
export const SOURCE_SYNC_READY_MANIFEST_VALIDATION_SCHEMA_VERSION =
  "soulforge.source_sync_ready_manifest_validation.v0";

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/i;
const WORKSPACE_KNOWLEDGE_PREFIX = "_workspaces/knowledge/";
const TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "kind",
  "manifest_id",
  "source_id",
  "source_card_ref",
  "status",
  "created_at_utc",
  "producer",
  "boundary",
  "indexing_gate",
  "files",
]);
const PRODUCER_KEYS = new Set(["origin_label", "tool_label", "prepared_by_role"]);
const BOUNDARY_KEYS = new Set([
  "metadata_only",
  "ready_file_is_not_owner_approval",
  "ready_file_is_not_source_truth",
  "raw_payloads_included",
  "source_payloads_included",
  "source_text_included",
  "chunk_payloads_included",
  "notebooklm_answers_included",
  "secrets_or_session_included",
  "runtime_absolute_paths_included",
]);
const INDEXING_GATE_KEYS = new Set([
  "source_text_ref",
  "min_stable_ms",
  "requires_source_card_validation",
  "requires_hash_match",
]);
const FILE_KEYS = new Set(["role", "repo_relative_path", "size_bytes", "sha256", "required", "media_type_label"]);
const FILE_ROLES = new Set(["source_card", "derived_text", "original_source", "extraction_metadata"]);
const REQUIRED_FALSE_BOUNDARY_FLAGS = [
  "raw_payloads_included",
  "source_payloads_included",
  "source_text_included",
  "chunk_payloads_included",
  "notebooklm_answers_included",
  "secrets_or_session_included",
  "runtime_absolute_paths_included",
];
const FORBIDDEN_KEYS = new Set([
  "account_id",
  "account_state",
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_payload",
  "chunk_text",
  "chunks",
  "content",
  "conversation_id",
  "credentials",
  "drive_file_id",
  "drive_id",
  "email_body",
  "file_payload",
  "google_drive_file_id",
  "live_account_state",
  "mail_body",
  "notebooklm_answer",
  "notebooklm_conversation_id",
  "notebooklm_notebook_id",
  "notebooklm_question",
  "notebooklm_source_id",
  "oauth_state",
  "owner_approval_granted",
  "payload",
  "private_payload",
  "public_canon_entry",
  "question",
  "raw",
  "raw_payload",
  "raw_question",
  "raw_query",
  "raw_source",
  "secret",
  "session",
  "source_body",
  "source_chunk",
  "source_content",
  "source_payload",
  "source_raw",
  "source_text",
  "text",
  "token",
]);

export async function loadSourceSyncReadyManifest({ repoRoot = process.cwd(), readyRef } = {}) {
  if (!readyRef) throw new Error("source_sync_ready_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativeJsonPath(readyRef)));
}

export async function validateSourceSyncReadyRef({
  repoRoot = process.cwd(),
  readyRef,
  sourceCardRef,
  sourceTextRef,
  stableMs,
  checkFiles = true,
} = {}) {
  let manifest;
  try {
    manifest = await loadSourceSyncReadyManifest({ repoRoot, readyRef });
  } catch {
    return blockedValidation({
      manifestId: null,
      sourceId: null,
      blockers: ["source_sync_ready_manifest_unreadable"],
      readyRef,
      sourceCardRef,
      sourceTextRef,
    });
  }
  return validateSourceSyncReadyManifest(manifest, {
    repoRoot,
    readyRef,
    sourceCardRef,
    sourceTextRef,
    stableMs,
    checkFiles,
  });
}

export async function validateSourceSyncReadyManifest(manifest, {
  repoRoot = process.cwd(),
  readyRef = null,
  sourceCardRef,
  sourceTextRef,
  stableMs,
  checkFiles = true,
} = {}) {
  const root = path.resolve(repoRoot);
  const blockers = [];
  const fileResults = [];
  validateAllowedKeys(manifest, TOP_LEVEL_KEYS, blockers, "source_sync_ready_manifest");
  if (manifest?.schema_version !== SOURCE_SYNC_READY_MANIFEST_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (manifest?.kind !== "source_sync_ready_manifest") blockers.push("kind_must_be_source_sync_ready_manifest");
  if (!isSafeId(manifest?.manifest_id)) blockers.push("manifest_id_unsafe");
  if (!isSafeId(manifest?.source_id)) blockers.push("source_id_unsafe");
  if (manifest?.status !== "ready_for_index") blockers.push("status_must_be_ready_for_index");
  if (!isIsoTimestamp(manifest?.created_at_utc)) blockers.push("created_at_utc_invalid");
  if (!safeWorkspaceKnowledgeJsonRef(manifest?.source_card_ref)) blockers.push("source_card_ref_must_be_workspace_knowledge_json");

  const normalizedSourceCardRef = optionalSafeWorkspaceJsonRef(sourceCardRef);
  if (normalizedSourceCardRef && manifest?.source_card_ref !== normalizedSourceCardRef) {
    blockers.push("source_card_ref_mismatch");
  }

  const producer = manifest?.producer ?? {};
  validateAllowedKeys(producer, PRODUCER_KEYS, blockers, "source_sync_ready_manifest.producer");
  if (!producer || typeof producer !== "object" || Array.isArray(producer)) blockers.push("producer_must_be_object");
  for (const key of PRODUCER_KEYS) {
    if (producer[key] !== undefined && !isSafeLabel(producer[key])) blockers.push(`producer_${key}_unsafe`);
  }

  const boundary = manifest?.boundary ?? {};
  validateAllowedKeys(boundary, BOUNDARY_KEYS, blockers, "source_sync_ready_manifest.boundary");
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.ready_file_is_not_owner_approval !== true) blockers.push("boundary_ready_file_is_not_owner_approval_must_be_true");
  if (boundary.ready_file_is_not_source_truth !== true) blockers.push("boundary_ready_file_is_not_source_truth_must_be_true");
  for (const flag of REQUIRED_FALSE_BOUNDARY_FLAGS) {
    if (boundary[flag] !== false) blockers.push(`boundary_${flag}_must_be_false`);
  }

  const indexingGate = manifest?.indexing_gate ?? {};
  validateAllowedKeys(indexingGate, INDEXING_GATE_KEYS, blockers, "source_sync_ready_manifest.indexing_gate");
  if (!safeWorkspaceKnowledgeRef(indexingGate.source_text_ref)) blockers.push("indexing_gate_source_text_ref_must_be_workspace_knowledge");
  if (indexingGate.requires_source_card_validation !== true) {
    blockers.push("indexing_gate_requires_source_card_validation_must_be_true");
  }
  if (indexingGate.requires_hash_match !== true) blockers.push("indexing_gate_requires_hash_match_must_be_true");
  const normalizedSourceTextRef = optionalSafeWorkspaceRef(sourceTextRef);
  if (normalizedSourceTextRef && indexingGate.source_text_ref !== normalizedSourceTextRef) {
    blockers.push("source_text_ref_mismatch");
  }
  const minStableMs = stableMs === undefined ? parseStableMs(indexingGate.min_stable_ms) : parseStableMs(stableMs);
  if (minStableMs === null) blockers.push("indexing_gate_min_stable_ms_invalid");

  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  if (!Array.isArray(manifest?.files)) blockers.push("files_must_be_array");
  if (files.length === 0) blockers.push("files_must_not_be_empty");

  const fileRefs = new Set();
  let hasRequiredSourceCard = false;
  let hasRequiredSourceText = false;
  for (const [index, file] of files.entries()) {
    const trail = `files[${index}]`;
    validateAllowedKeys(file, FILE_KEYS, blockers, `source_sync_ready_manifest.${trail}`);
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      blockers.push(`file_must_be_object:${trail}`);
      continue;
    }
    if (!FILE_ROLES.has(file.role)) blockers.push(`file_role_unknown:${trail}`);
    if (!safeWorkspaceKnowledgeRef(file.repo_relative_path)) blockers.push(`file_ref_must_be_workspace_knowledge:${trail}`);
    if (!Number.isSafeInteger(file.size_bytes) || file.size_bytes < 0) blockers.push(`file_size_bytes_invalid:${trail}`);
    if (!isSafeHash(file.sha256)) blockers.push(`file_sha256_invalid:${trail}`);
    if (file.required !== true) blockers.push(`file_required_must_be_true:${trail}`);
    if (file.media_type_label !== undefined && !isSafeLabel(file.media_type_label)) {
      blockers.push(`file_media_type_label_unsafe:${trail}`);
    }
    if (fileRefs.has(file.repo_relative_path)) blockers.push(`file_ref_duplicate:${file.repo_relative_path}`);
    fileRefs.add(file.repo_relative_path);
    if (file.role === "source_card" && file.repo_relative_path === manifest.source_card_ref) hasRequiredSourceCard = true;
    if (file.repo_relative_path === indexingGate.source_text_ref) hasRequiredSourceText = true;
    if (checkFiles && safeWorkspaceKnowledgeRef(file.repo_relative_path)) {
      fileResults.push(await validateReadyFile(root, file, { stableMs: minStableMs ?? 0, blockers, trail }));
    }
  }
  if (!hasRequiredSourceCard) blockers.push("files_must_include_source_card_ref");
  if (!hasRequiredSourceText) blockers.push("files_must_include_indexing_gate_source_text_ref");

  blockers.push(...findSafetyBlockers(manifest));
  return {
    schema_version: SOURCE_SYNC_READY_MANIFEST_VALIDATION_SCHEMA_VERSION,
    kind: "source_sync_ready_manifest_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    manifest_id: manifest?.manifest_id ?? null,
    source_id: manifest?.source_id ?? null,
    ready_for_index: blockers.length === 0,
    source_refs: {
      ready_ref: readyRef ?? null,
      source_card_ref: manifest?.source_card_ref ?? null,
      source_text_ref: indexingGate?.source_text_ref ?? null,
    },
    counts: {
      file_count: files.length,
      checked_file_count: fileResults.length,
      min_stable_ms: minStableMs ?? 0,
    },
    files: fileResults,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: boundarySummary(boundary),
  };
}

async function validateReadyFile(repoRoot, file, { stableMs, blockers, trail }) {
  const ref = safeRepoRelativePath(file.repo_relative_path);
  const expectedHash = normalizeHash(file.sha256);
  const filePath = path.join(repoRoot, ref);
  const result = {
    role: file.role,
    repo_relative_path: ref,
    exists: false,
    size_match: false,
    sha256_match: false,
    stable: stableMs === 0,
  };
  let statOne;
  let hashOne;
  try {
    statOne = await fs.stat(filePath);
    result.exists = statOne.isFile();
    if (!result.exists) {
      blockers.push(`file_not_regular:${trail}`);
      return result;
    }
    result.size_match = statOne.size === file.size_bytes;
    if (!result.size_match) blockers.push(`file_size_mismatch:${trail}`);
    hashOne = await sha256File(filePath);
    result.sha256_match = hashOne === expectedHash;
    if (!result.sha256_match) blockers.push(`file_sha256_mismatch:${trail}`);
  } catch {
    blockers.push(`file_missing_or_unreadable:${trail}`);
    return result;
  }
  if (stableMs > 0) {
    await delay(stableMs);
    try {
      const statTwo = await fs.stat(filePath);
      const hashTwo = await sha256File(filePath);
      result.stable = statOne.size === statTwo.size && statOne.mtimeMs === statTwo.mtimeMs && hashOne === hashTwo;
      if (!result.stable) blockers.push(`file_not_stable:${trail}`);
    } catch {
      blockers.push(`file_stability_check_failed:${trail}`);
    }
  }
  return result;
}

function blockedValidation({ manifestId, sourceId, blockers, readyRef, sourceCardRef, sourceTextRef }) {
  return {
    schema_version: SOURCE_SYNC_READY_MANIFEST_VALIDATION_SCHEMA_VERSION,
    kind: "source_sync_ready_manifest_validation",
    status: "blocked",
    manifest_id: manifestId,
    source_id: sourceId,
    ready_for_index: false,
    source_refs: {
      ready_ref: readyRef ?? null,
      source_card_ref: sourceCardRef ?? null,
      source_text_ref: sourceTextRef ?? null,
    },
    counts: {
      file_count: 0,
      checked_file_count: 0,
      min_stable_ms: 0,
    },
    files: [],
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: boundarySummary({}),
  };
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const buffer = await fs.readFile(filePath);
  hash.update(buffer);
  return hash.digest("hex");
}

function validateAllowedKeys(value, allowedKeys, blockers, trail) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) blockers.push(`unknown_key:${trail}.${key}`);
  }
}

function findSafetyBlockers(value, trail = "source_sync_ready_manifest") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => blockers.push(...findSafetyBlockers(item, `${trail}[${index}]`)));
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_KEYS.has(normalizedKey)) blockers.push(`source_sync_ready_forbidden_raw_or_payload_key:${trail}.${key}`);
      blockers.push(...findSafetyBlockers(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") return blockers;
  if (hasUrlSchemeString(value)) blockers.push(`source_sync_ready_url_string:${trail}`);
  if (hasLocalAbsolutePathString(value)) blockers.push(`source_sync_ready_local_absolute_path:${trail}`);
  if (hasSecretLikeValueString(value)) blockers.push(`source_sync_ready_secret_like_value:${trail}`);
  return blockers;
}

function boundarySummary(boundary) {
  return {
    metadata_only: boundary?.metadata_only === true,
    ready_file_is_not_owner_approval: boundary?.ready_file_is_not_owner_approval === true,
    ready_file_is_not_source_truth: boundary?.ready_file_is_not_source_truth === true,
    no_raw_payloads: boundary?.raw_payloads_included === false,
    no_source_payloads: boundary?.source_payloads_included === false,
    no_source_text: boundary?.source_text_included === false,
    no_chunk_payloads: boundary?.chunk_payloads_included === false,
    no_notebooklm_answers: boundary?.notebooklm_answers_included === false,
    no_secrets_or_session: boundary?.secrets_or_session_included === false,
    no_runtime_absolute_paths: boundary?.runtime_absolute_paths_included === false,
  };
}

function parseStableMs(value) {
  if (value === undefined || value === null) return 0;
  if (value === true) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 60000) return null;
  return parsed;
}

function optionalSafeWorkspaceRef(value) {
  if (value === undefined || value === null) return null;
  const normalized = safeRepoRelativePath(String(value));
  return safeWorkspaceKnowledgeRef(normalized) ? normalized : null;
}

function optionalSafeWorkspaceJsonRef(value) {
  const normalized = optionalSafeWorkspaceRef(value);
  return normalized && normalized.endsWith(".json") ? normalized : null;
}

function safeWorkspaceKnowledgeJsonRef(value) {
  return safeWorkspaceKnowledgeRef(value) && String(value).endsWith(".json");
}

function safeWorkspaceKnowledgeRef(value) {
  if (!value || typeof value !== "string") return false;
  let normalized;
  try {
    normalized = safeRepoRelativePath(value);
  } catch {
    return false;
  }
  return normalized.startsWith(WORKSPACE_KNOWLEDGE_PREFIX) && !normalized.includes("/../");
}

function safeRepoRelativeJsonPath(value) {
  const ref = safeRepoRelativePath(value);
  if (!ref.endsWith(".json")) throw new Error("repo_relative_json_path_required");
  return ref;
}

function safeRepoRelativePath(value) {
  if (!value || typeof value !== "string") throw new Error("repo_relative_path_required");
  if (path.isAbsolute(value)) throw new Error("repo_relative_path_must_not_be_absolute");
  const normalized = normalizeRepoPath(path.normalize(value));
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || normalized.startsWith("~")) {
    throw new Error("repo_relative_path_must_stay_in_repo");
  }
  if (normalized.includes("\\") || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    throw new Error("repo_relative_path_contains_unsafe_characters");
  }
  if (hasUrlSchemeString(normalized) || hasLocalAbsolutePathString(normalized)) {
    throw new Error("repo_relative_path_unsafe");
  }
  return normalized;
}

function normalizeHash(value) {
  return String(value ?? "").trim().replace(/^sha256:/i, "").toLowerCase();
}

function isSafeHash(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value.trim());
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value) && isSafeLabel(value);
}

function isSafeLabel(value) {
  const text = String(value ?? "");
  return text.trim().length > 0 &&
    text.trim().length <= 200 &&
    !/[\u0000-\u001F\u007F]/u.test(text) &&
    !hasUrlSchemeString(text) &&
    !hasLocalAbsolutePathString(text) &&
    !hasSecretLikeValueString(text);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function hasLocalAbsolutePathString(value) {
  const text = String(value ?? "");
  return /(^|[\s"'(])\/(?:Users|Volumes|private|var\/folders|tmp|home)\//.test(text) || /[A-Za-z]:[\\/]/.test(text);
}

function hasUrlSchemeString(value) {
  return /\b[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(String(value ?? ""));
}

function hasSecretLikeValueString(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return true;
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/.test(text)) {
    return true;
  }
  if (/\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?cookie)\s*[:=]\s*["']?[^"'\s]{8,}/i.test(text)) {
    return true;
  }
  if (/\bbearer\s+[A-Za-z0-9._~+/-]{20,}/i.test(text)) return true;
  return false;
}

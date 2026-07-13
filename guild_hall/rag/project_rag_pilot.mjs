import { createHash } from "node:crypto";

import {
  IDENTITY_GENERATION_PROFILE_ID,
  buildEvidenceLocatorIdentity,
  buildExtractionRunIdentity,
  buildRagChunkIdentity,
  buildRagIndexIdentity,
  buildSourceRevisionIdentity,
  hashRawContentBytes,
  preserveOwnerIssuedIdentity,
  serializeCanonicalIdentity,
  validateTypedRef,
} from "../shared/temporal_identity.mjs";
import { COMMON_RAG_ROOT_REF, resolveRagAssetTarget } from "./project_rag_paths.mjs";

export const PROJECT_RAG_PILOT_BUNDLE_SCHEMA_VERSION =
  "soulforge.project_rag_pilot_bundle.v1";

const SOURCE_CARD_SCHEMA_VERSION = "soulforge.knowledge_source_card.v0";
const READY_MANIFEST_SCHEMA_VERSION = "soulforge.source_sync_ready_manifest.v0";
const LEGACY_INDEX_SCHEMA_VERSION = "soulforge.source_text_index.v0";
const LEGACY_ANSWER_SCHEMA_VERSION = "soulforge.source_text_answer_run.v0";
const LOCATOR_COORDINATE_PROFILE_ID = "soulforge.utf8_byte_range.v1";
const CANONICAL_ARTIFACT_PROFILE_ID = IDENTITY_GENERATION_PROFILE_ID;
const CONTENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SAFE_LEGACY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const MAX_JSON_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAX_NORMALIZED_TEXT_BYTES = 128 * 1024 * 1024;
const MAX_CHUNKS = 50_000;

export class ProjectRagPilotError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ProjectRagPilotError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ProjectRagPilotError(code, message, details);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("RAG_PILOT_INVALID_INPUT", `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("RAG_PILOT_INVALID_INPUT", `${label} must be a plain object`);
  }
  return value;
}

function assertKnownFields(value, allowedFields, requiredFields, label) {
  assertPlainObject(value, label);
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  if (unknown.length > 0) {
    fail("RAG_PILOT_UNKNOWN_FIELD", `${label} has unknown field(s): ${unknown.join(", ")}`);
  }
  const missing = requiredFields.filter(
    (field) => !Object.hasOwn(value, field) || value[field] === undefined,
  );
  if (missing.length > 0) {
    fail("RAG_PILOT_MISSING_FIELD", `${label} is missing field(s): ${missing.join(", ")}`);
  }
}

function normalizeContentId(value, label) {
  if (typeof value !== "string" || !CONTENT_ID_PATTERN.test(value)) {
    fail("RAG_PILOT_CONTENT_ID_INVALID", `${label} must be sha256:<64 lowercase hex>`);
  }
  return value;
}

function normalizeLegacyHash(value, label) {
  if (typeof value !== "string") {
    fail("RAG_PILOT_CONTENT_ID_INVALID", `${label} must be a SHA-256 string`);
  }
  const normalized = value.trim().toLowerCase().replace(/^sha256:/u, "");
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    fail("RAG_PILOT_CONTENT_ID_INVALID", `${label} must contain exactly 64 hex digits`);
  }
  return `sha256:${normalized}`;
}

function normalizeSafeLegacyId(value, label) {
  if (
    typeof value !== "string" ||
    value !== value.normalize("NFC") ||
    !SAFE_LEGACY_ID_PATTERN.test(value) ||
    CONTROL_PATTERN.test(value)
  ) {
    fail("RAG_PILOT_LEGACY_ID_INVALID", `${label} must be a bounded opaque legacy ID`);
  }
  return value;
}

function normalizeRepoRef(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.normalize("NFC") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/u.test(value) ||
    CONTROL_PATTERN.test(value)
  ) {
    fail("RAG_PILOT_REF_INVALID", `${label} must be a canonical repo-relative ref`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail("RAG_PILOT_REF_INVALID", `${label} must not contain empty or dot path segments`);
  }
  return value;
}

function normalizeBytes(value, label, maximumBytes) {
  if (!(value instanceof Uint8Array)) {
    fail("RAG_PILOT_BYTES_REQUIRED", `${label}.bytes must be Uint8Array bytes`);
  }
  if (value.byteLength === 0 || value.byteLength > maximumBytes) {
    fail(
      "RAG_PILOT_BYTES_BOUNDS",
      `${label}.bytes must contain 1..${maximumBytes} bytes`,
    );
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail("RAG_PILOT_UTF8_INVALID", `${label} must contain valid UTF-8 bytes`);
  }
}

function parseJsonEnvelope(input, label) {
  assertKnownFields(
    input,
    ["ref", "bytes", "expected_sha256", "expected_byte_length"],
    ["ref", "bytes", "expected_sha256", "expected_byte_length"],
    label,
  );
  const ref = normalizeRepoRef(input.ref, `${label}.ref`);
  const bytes = normalizeBytes(input.bytes, label, MAX_JSON_ARTIFACT_BYTES);
  if (!Number.isSafeInteger(input.expected_byte_length) || input.expected_byte_length < 1) {
    fail(
      "RAG_PILOT_BYTE_LENGTH_INVALID",
      `${label}.expected_byte_length must be a positive safe integer`,
    );
  }
  if (bytes.byteLength !== input.expected_byte_length) {
    fail("RAG_PILOT_BYTE_LENGTH_MISMATCH", `${label} byte length does not match inventory`);
  }
  const expectedContentId = normalizeContentId(
    input.expected_sha256,
    `${label}.expected_sha256`,
  );
  const contentId = hashRawContentBytes(bytes);
  if (contentId !== expectedContentId) {
    fail("RAG_PILOT_HASH_MISMATCH", `${label} SHA-256 does not match inventory`);
  }
  let value;
  try {
    value = JSON.parse(decodeUtf8(bytes, label));
  } catch (error) {
    if (error instanceof ProjectRagPilotError) throw error;
    fail("RAG_PILOT_JSON_INVALID", `${label} must contain one valid JSON value`);
  }
  assertPlainObject(value, `${label} JSON`);
  return { ref, bytes, content_id: contentId, byte_length: bytes.byteLength, value };
}

function parseTextEnvelope(input) {
  const label = "artifacts.normalized_text";
  assertKnownFields(
    input,
    ["ref", "bytes", "expected_sha256", "expected_byte_length"],
    ["ref", "bytes", "expected_sha256", "expected_byte_length"],
    label,
  );
  const ref = normalizeRepoRef(input.ref, `${label}.ref`);
  const bytes = normalizeBytes(input.bytes, label, MAX_NORMALIZED_TEXT_BYTES);
  if (!Number.isSafeInteger(input.expected_byte_length) || input.expected_byte_length < 1) {
    fail(
      "RAG_PILOT_BYTE_LENGTH_INVALID",
      `${label}.expected_byte_length must be a positive safe integer`,
    );
  }
  if (bytes.byteLength !== input.expected_byte_length) {
    fail("RAG_PILOT_BYTE_LENGTH_MISMATCH", `${label} byte length does not match inventory`);
  }
  const expectedContentId = normalizeContentId(
    input.expected_sha256,
    `${label}.expected_sha256`,
  );
  const contentId = hashRawContentBytes(bytes);
  if (contentId !== expectedContentId) {
    fail("RAG_PILOT_HASH_MISMATCH", `${label} SHA-256 does not match inventory`);
  }
  decodeUtf8(bytes, label);
  return { ref, bytes, content_id: contentId, byte_length: bytes.byteLength };
}

function normalizeProjectRef(value) {
  let projectRef;
  try {
    projectRef = validateTypedRef(value);
  } catch (error) {
    fail("RAG_PILOT_PROJECT_REF_INVALID", `project_ref is invalid: ${error.message}`);
  }
  if (projectRef.entity_type !== "project" || projectRef.owner_surface !== "dev_erp") {
    fail(
      "RAG_PILOT_PROJECT_REF_INVALID",
      "project_ref must be a dev_erp project typed ref",
    );
  }
  resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: projectRef,
    asset_kind: "indexes_local",
  });
  return projectRef;
}

function projectTokenForms(projectCode) {
  const lower = projectCode.normalize("NFC").toLowerCase();
  return [...new Set([lower, lower.replaceAll("-", "_"), lower.replaceAll("_", "-")])];
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function containsProjectToken(value, projectCode) {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFC").toLowerCase();
  return projectTokenForms(projectCode).some((token) =>
    new RegExp(
      `(?:^|[^a-z0-9])${escapeRegularExpression(token)}(?=$|[^a-z0-9])`,
      "u",
    ).test(normalized),
  );
}

function assertProjectBoundRef(ref, projectCode, label) {
  const normalized = normalizeRepoRef(ref, label);
  if (!containsProjectToken(normalized, projectCode)) {
    fail(
      "RAG_PILOT_CROSS_PROJECT_REJECTED",
      `${label} does not carry the exact project token`,
    );
  }
  return normalized;
}

function sourceCardSourceRef(card) {
  if (typeof card?.source_ref === "string") return card.source_ref;
  if (typeof card?.source_ref?.repo_relative_path === "string") {
    return card.source_ref.repo_relative_path;
  }
  return null;
}

function assertPrivateProjectScope(card, projectRef, refs) {
  if (card.schema_version !== SOURCE_CARD_SCHEMA_VERSION) {
    fail("RAG_PILOT_SOURCE_CARD_INVALID", "source card schema version is not v0");
  }
  const sourceId = normalizeSafeLegacyId(card.source_id, "source_card.source_id");
  if (!containsProjectToken(sourceId, projectRef.entity_id)) {
    fail("RAG_PILOT_CROSS_PROJECT_REJECTED", "source_id does not bind the requested project");
  }
  if (
    !Array.isArray(card.domains) ||
    !card.domains.some((domain) => containsProjectToken(domain, projectRef.entity_id))
  ) {
    fail("RAG_PILOT_CROSS_PROJECT_REJECTED", "source card domains lack the project token");
  }
  const scope = card?.rag_permissions?.scope;
  if (
    typeof scope !== "string" ||
    !/project/iu.test(scope) ||
    !/(?:private|only)/iu.test(scope) ||
    /(?:common|global|public)/iu.test(scope)
  ) {
    fail("RAG_PILOT_ACL_REJECTED", "source card must grant project-private-only RAG scope");
  }
  for (const permission of ["source_text_retrieval", "index_build", "answer_synthesis"]) {
    if (card?.rag_permissions?.[permission] !== true) {
      fail("RAG_PILOT_ACL_REJECTED", `source card permission ${permission} is not granted`);
    }
  }
  if (
    typeof card.approval_status !== "string" ||
    !card.approval_status.startsWith("owner_approved_") ||
    card?.authority?.source_is_approved_knowledge_reference !== true
  ) {
    fail("RAG_PILOT_OWNER_APPROVAL_REQUIRED", "source card is not owner-approved");
  }
  if (card?.authority?.answer_runs_require_source_citation !== true) {
    fail("RAG_PILOT_ACL_REJECTED", "answer runs must require source citations");
  }
  if (
    card?.boundary?.repo_relative_paths_only !== true ||
    card?.boundary?.runtime_absolute_paths_allowed !== false ||
    card?.boundary?.source_payload_contains_secret !== false ||
    card?.boundary?.public_source_payload_not_stored_in_public_repo !== true ||
    card?.boundary?.owner_review_required_before_external_upload_or_canon !== true
  ) {
    fail("RAG_PILOT_ACL_REJECTED", "source card private/public boundary is incomplete");
  }
  if (card.public_canon_promotion_allowed === true || card.notebooklm_packet_allowed === true) {
    fail("RAG_PILOT_ACL_REJECTED", "pilot input must not grant public or NotebookLM promotion");
  }
  if (
    card?.derived_output_policy?.requires_source_ref_backlink !== true ||
    card?.derived_output_policy?.requires_rebuildable_output !== true
  ) {
    fail("RAG_PILOT_ACL_REJECTED", "derived output must remain linked and rebuildable");
  }
  const allowedOutputRoot = normalizeRepoRef(
    card?.derived_output_policy?.allowed_output_root,
    "source_card.derived_output_policy.allowed_output_root",
  );
  if (
    allowedOutputRoot !== COMMON_RAG_ROOT_REF &&
    !allowedOutputRoot.startsWith(`${COMMON_RAG_ROOT_REF}/`)
  ) {
    fail("RAG_PILOT_ACL_REJECTED", "legacy derived output root is outside private RAG storage");
  }
  for (const [label, ref] of Object.entries(refs)) {
    if (ref !== null) assertProjectBoundRef(ref, projectRef.entity_id, label);
  }
  return sourceId;
}

function assertManifestBoundary(manifest) {
  const boundary = manifest?.boundary;
  if (
    boundary?.metadata_only !== true ||
    boundary?.ready_file_is_not_owner_approval !== true ||
    boundary?.ready_file_is_not_source_truth !== true
  ) {
    fail("RAG_PILOT_READY_MANIFEST_INVALID", "ready manifest boundary is incomplete");
  }
  for (const field of [
    "raw_payloads_included",
    "source_payloads_included",
    "source_text_included",
    "chunk_payloads_included",
    "notebooklm_answers_included",
    "secrets_or_session_included",
    "runtime_absolute_paths_included",
  ]) {
    if (boundary[field] !== false) {
      fail("RAG_PILOT_READY_MANIFEST_INVALID", `ready manifest boundary ${field} must be false`);
    }
  }
}

function manifestFileByRef(manifest, ref, label) {
  if (!Array.isArray(manifest.files)) {
    fail("RAG_PILOT_READY_MANIFEST_INVALID", "ready manifest files must be an array");
  }
  const matches = manifest.files.filter((file) => file?.repo_relative_path === ref);
  if (matches.length !== 1) {
    fail("RAG_PILOT_READY_MANIFEST_INVALID", `${label} must occur exactly once in manifest files`);
  }
  const [file] = matches;
  if (
    file.required !== true ||
    !Number.isSafeInteger(file.size_bytes) ||
    file.size_bytes < 0
  ) {
    fail("RAG_PILOT_READY_MANIFEST_INVALID", `${label} file record is not required and bounded`);
  }
  return file;
}

function validateLegacyContracts({ projectRef, sourceCard, readyManifest, legacyIndex, envelopes }) {
  const card = sourceCard.value;
  const manifest = readyManifest.value;
  const index = legacyIndex.value;
  const sourceRef = normalizeRepoRef(sourceCardSourceRef(card), "source_card.source_ref");
  const readyRef = normalizeRepoRef(card.source_sync_ready_ref, "source_card.source_sync_ready_ref");
  const normalizedTextRef = envelopes.normalized_text.ref;
  const refs = {
    source_card_ref: sourceCard.ref,
    ready_manifest_ref: readyManifest.ref,
    source_content_ref: sourceRef,
    normalized_text_ref: normalizedTextRef,
    legacy_index_ref: legacyIndex.ref,
    legacy_answer_run_ref: envelopes.legacy_answer_run?.ref ?? null,
  };
  const sourceId = assertPrivateProjectScope(card, projectRef, refs);

  if (
    manifest.schema_version !== READY_MANIFEST_SCHEMA_VERSION ||
    manifest.kind !== "source_sync_ready_manifest" ||
    manifest.status !== "ready_for_index" ||
    manifest.source_id !== sourceId ||
    manifest.source_card_ref !== sourceCard.ref ||
    readyRef !== readyManifest.ref
  ) {
    fail("RAG_PILOT_READY_MANIFEST_INVALID", "ready manifest does not bind the source card");
  }
  assertManifestBoundary(manifest);
  if (
    manifest?.indexing_gate?.source_text_ref !== sourceRef ||
    manifest?.indexing_gate?.requires_source_card_validation !== true ||
    manifest?.indexing_gate?.requires_hash_match !== true
  ) {
    fail("RAG_PILOT_READY_MANIFEST_INVALID", "ready manifest indexing gate is not exact");
  }
  const sourceCardFile = manifestFileByRef(manifest, sourceCard.ref, "source card");
  if (
    normalizeLegacyHash(sourceCardFile.sha256, "manifest source-card sha256") !==
      sourceCard.content_id ||
    sourceCardFile.size_bytes !== sourceCard.byte_length
  ) {
    fail("RAG_PILOT_HASH_MISMATCH", "ready manifest source-card hash or length mismatch");
  }
  const sourceContentFile = manifestFileByRef(manifest, sourceRef, "source content");
  const corpusContentId = normalizeLegacyHash(
    card?.origin?.corpus_sha256,
    "source_card.origin.corpus_sha256",
  );
  if (
    normalizeLegacyHash(sourceContentFile.sha256, "manifest source-content sha256") !==
      corpusContentId ||
    sourceContentFile.size_bytes !== card?.origin?.corpus_byte_count
  ) {
    fail("RAG_PILOT_HASH_MISMATCH", "source card and ready manifest corpus evidence disagree");
  }

  if (
    index.schema_version !== LEGACY_INDEX_SCHEMA_VERSION ||
    index.kind !== "source_text_index" ||
    index.status !== "ready" ||
    index?.source_refs?.source_card_ref !== sourceCard.ref ||
    index?.source_refs?.source_id !== sourceId ||
    index?.source_refs?.source_ref !== sourceRef ||
    index?.source_refs?.source_sync_ready_ref !== readyManifest.ref ||
    index?.source_refs?.derived_text_ref !== normalizedTextRef
  ) {
    fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy index source bindings are inconsistent");
  }
  if (
    index?.boundary?.storage_scope !== "_workspaces_private_payload" ||
    index?.boundary?.source_text_loaded !== true ||
    index?.boundary?.public_repo_safe !== false
  ) {
    fail("RAG_PILOT_ACL_REJECTED", "legacy index is not a private loaded source-text index");
  }
  for (const permission of [
    "source_text_retrieval_allowed",
    "index_build_allowed",
    "answer_synthesis_allowed",
  ]) {
    if (index?.permissions?.[permission] !== true) {
      fail("RAG_PILOT_ACL_REJECTED", `legacy index permission ${permission} is not granted`);
    }
  }
  if (
    index?.permissions?.public_canon_promotion_allowed !== false ||
    index?.permissions?.notebooklm_packet_allowed !== false
  ) {
    fail("RAG_PILOT_ACL_REJECTED", "legacy index grants an out-of-scope promotion");
  }
  if (
    index?.source_card_summary?.approval_status !== undefined &&
    index.source_card_summary.approval_status !== card.approval_status
  ) {
    fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy index approval summary is stale");
  }
  if (!Array.isArray(index.chunks) || index.chunks.length === 0 || index.chunks.length > MAX_CHUNKS) {
    fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy index must contain bounded chunks");
  }
  if (
    index?.counts?.chunk_count !== index.chunks.length ||
    index?.counts?.indexed_source_count !== 1
  ) {
    fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy index counts do not match its chunks");
  }
  return { source_id: sourceId, source_ref: sourceRef, corpus_content_id: corpusContentId };
}

function locateLegacyChunks({ legacyIndex, normalizedText, sourceRef }) {
  const seenIds = new Set();
  const seenIndexes = new Set();
  const located = legacyIndex.value.chunks.map((chunk, arrayIndex) => {
    assertPlainObject(chunk, `legacy_index.chunks[${arrayIndex}]`);
    const chunkId = normalizeSafeLegacyId(chunk.chunk_id, `legacy_index.chunks[${arrayIndex}].chunk_id`);
    if (seenIds.has(chunkId)) {
      fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy chunk IDs must be unique");
    }
    seenIds.add(chunkId);
    if (!Number.isSafeInteger(chunk.chunk_index) || chunk.chunk_index < 0) {
      fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy chunk_index must be a non-negative safe integer");
    }
    if (seenIndexes.has(chunk.chunk_index)) {
      fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy chunk_index values must be unique");
    }
    seenIndexes.add(chunk.chunk_index);
    if (chunk.source_ref !== sourceRef) {
      fail("RAG_PILOT_CROSS_PROJECT_REJECTED", "legacy chunk source_ref differs from the source");
    }
    if (typeof chunk.chunk_text !== "string" || chunk.chunk_text.length === 0) {
      fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy chunk_text must be non-empty input text");
    }
    if (chunk.char_count !== undefined && chunk.char_count !== chunk.chunk_text.length) {
      fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy chunk char_count is inconsistent");
    }
    const chunkBytes = Buffer.from(chunk.chunk_text, "utf8");
    if (chunkBytes.toString("utf8") !== chunk.chunk_text) {
      fail("RAG_PILOT_UTF8_INVALID", "legacy chunk contains an invalid Unicode scalar sequence");
    }
    const first = normalizedText.bytes.indexOf(chunkBytes);
    if (first < 0) {
      fail("RAG_PILOT_CHUNK_SPAN_MISSING", "legacy chunk has no exact normalized-text span", {
        legacy_chunk_id: chunkId,
      });
    }
    const second = normalizedText.bytes.indexOf(chunkBytes, first + 1);
    if (second >= 0) {
      fail("RAG_PILOT_CHUNK_SPAN_AMBIGUOUS", "legacy chunk has multiple exact spans", {
        legacy_chunk_id: chunkId,
      });
    }
    return {
      legacy_chunk_id: chunkId,
      legacy_chunk_index: chunk.chunk_index,
      byte_start: first,
      byte_end_exclusive: first + chunkBytes.byteLength,
      chunk_bytes: chunkBytes,
    };
  });
  located.sort((left, right) => left.legacy_chunk_index - right.legacy_chunk_index);
  for (let index = 0; index < located.length; index += 1) {
    if (located[index].legacy_chunk_index !== index) {
      fail("RAG_PILOT_LEGACY_INDEX_INVALID", "legacy chunk_index must be contiguous from zero");
    }
    if (index > 0) {
      const prior = located[index - 1];
      const current = located[index];
      if (current.byte_start < prior.byte_end_exclusive) {
        fail("RAG_PILOT_CHUNK_SPAN_OVERLAP", "legacy chunk spans overlap");
      }
      if (current.byte_start < prior.byte_start) {
        fail("RAG_PILOT_CHUNK_ORDER_INVALID", "legacy chunk order differs from source order");
      }
    }
  }
  return located;
}

function typedRef(entityType, ownerSurface, entityId) {
  return validateTypedRef({ entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId });
}

function normalizeIdentityProfile(input) {
  assertKnownFields(
    input,
    [
      "occurrence_key",
      "canonicalization_profile_id",
      "published_at",
      "effective_from",
      "effective_to",
      "extractor_profile_id",
      "extraction_run_key",
      "extraction_started_at",
      "parser_profile_id",
      "chunk_profile_id",
      "acl_profile_id",
      "embedding_profile_id",
    ],
    [
      "occurrence_key",
      "canonicalization_profile_id",
      "extractor_profile_id",
      "extraction_run_key",
      "extraction_started_at",
      "parser_profile_id",
      "chunk_profile_id",
      "acl_profile_id",
      "embedding_profile_id",
    ],
    "identity_profile",
  );
  return input;
}

function buildIdentityLineage({ projectRef, source, normalizedText, locatedChunks, profile }) {
  const sourceRevision = buildSourceRevisionIdentity({
    source_id: source.source_id,
    occurrence_key: profile.occurrence_key,
    content_id: source.corpus_content_id,
    canonicalization_profile_id: profile.canonicalization_profile_id,
    published_at: profile.published_at ?? null,
    effective_from: profile.effective_from ?? null,
    effective_to: profile.effective_to ?? null,
    applicability_refs: [projectRef],
  });
  const sourceRevisionRef = typedRef("source_revision", "source_metadata", sourceRevision.id);
  const extractionRun = buildExtractionRunIdentity({
    source_revision_id: sourceRevision.id,
    extractor_profile_id: profile.extractor_profile_id,
    run_key: profile.extraction_run_key,
    started_at: profile.extraction_started_at,
    input_refs: [sourceRevisionRef],
  });
  const ragIndex = buildRagIndexIdentity({
    scope_ref: projectRef,
    source_revision_ids: [sourceRevision.id],
    parser_profile_id: profile.parser_profile_id,
    chunk_profile_id: profile.chunk_profile_id,
    acl_profile_id: profile.acl_profile_id,
    embedding_profile_id: profile.embedding_profile_id,
  });
  const chunks = locatedChunks.map((span) => {
    const locator = buildEvidenceLocatorIdentity({
      source_revision_id: sourceRevision.id,
      locator_kind: "byte_range",
      locator: {
        byte_end_exclusive: span.byte_end_exclusive,
        byte_start: span.byte_start,
        normalized_content_id: normalizedText.content_id,
      },
      coordinate_profile_id: LOCATOR_COORDINATE_PROFILE_ID,
    });
    const chunk = buildRagChunkIdentity({
      source_revision_id: sourceRevision.id,
      chunk_profile_id: profile.chunk_profile_id,
      evidence_locator_id: locator.id,
      chunk_content_id: hashRawContentBytes(span.chunk_bytes),
      context_refs: [],
    });
    return {
      legacy_chunk_id: span.legacy_chunk_id,
      legacy_chunk_index: span.legacy_chunk_index,
      byte_start: span.byte_start,
      byte_end_exclusive: span.byte_end_exclusive,
      chunk_content_id: chunk.identity_basis.chunk_content_id,
      evidence_locator: locator,
      rag_chunk: chunk,
    };
  });
  return { source_revision: sourceRevision, extraction_run: extractionRun, rag_index: ragIndex, chunks };
}

function mapLegacyAnswerRun({ answerRun, legacyIndex, lineage, projectRef }) {
  if (answerRun === null) return null;
  const run = answerRun.value;
  if (
    run.schema_version !== LEGACY_ANSWER_SCHEMA_VERSION ||
    run.kind !== "source_text_answer_run" ||
    !["source_text_answer", "no_source_text_hit"].includes(run.status) ||
    run?.source_refs?.source_text_index_ref !== legacyIndex.ref ||
    run?.source_refs?.index_id !== legacyIndex.value.index_id ||
    run?.source_refs?.source_card_ref !== legacyIndex.value.source_refs.source_card_ref ||
    run?.source_refs?.source_id !== legacyIndex.value.source_refs.source_id ||
    run?.source_refs?.source_ref !== legacyIndex.value.source_refs.source_ref
  ) {
    fail("RAG_PILOT_ANSWER_RUN_INVALID", "legacy answer run does not bind the legacy index");
  }
  if (
    run?.query?.raw_query_persisted !== false ||
    run?.boundary?.raw_query_persisted !== false ||
    run?.boundary?.source_text_loaded !== true ||
    run?.boundary?.public_repo_safe !== false
  ) {
    fail("RAG_PILOT_ANSWER_RUN_INVALID", "legacy answer run violates private query boundary");
  }
  const citations = run?.response?.citations;
  if (!Array.isArray(citations)) {
    fail("RAG_PILOT_ANSWER_RUN_INVALID", "legacy answer citations must be an array");
  }
  if (run?.response?.retrieved_chunk_count !== citations.length) {
    fail("RAG_PILOT_ANSWER_RUN_INVALID", "legacy answer citation count is inconsistent");
  }
  if (
    typeof run?.response?.answer_text !== "string" ||
    run.response.answer_text.length === 0 ||
    (run.status === "source_text_answer" &&
      (citations.length === 0 || run.response.answer_uses_source_text !== true)) ||
    (run.status === "no_source_text_hit" &&
      (citations.length !== 0 || run.response.answer_uses_source_text !== false))
  ) {
    fail("RAG_PILOT_ANSWER_RUN_INVALID", "legacy answer status and response are inconsistent");
  }
  const byLegacyId = new Map(lineage.chunks.map((chunk) => [chunk.legacy_chunk_id, chunk]));
  const seen = new Set();
  const mapped = citations.map((citation, index) => {
    if (citation?.source_ref !== legacyIndex.value.source_refs.source_ref) {
      fail("RAG_PILOT_CROSS_PROJECT_REJECTED", "answer citation source_ref differs from the source");
    }
    const mappedChunk = byLegacyId.get(citation?.chunk_id);
    if (!mappedChunk || seen.has(citation.chunk_id)) {
      fail("RAG_PILOT_ANSWER_RUN_INVALID", "answer citation is missing or duplicated");
    }
    seen.add(citation.chunk_id);
    return {
      rank: index + 1,
      rag_chunk_ref: typedRef("rag_chunk", "project_rag_payload", mappedChunk.rag_chunk.id),
      evidence_locator_ref: typedRef(
        "evidence_locator",
        "project_rag_payload",
        mappedChunk.evidence_locator.id,
      ),
    };
  });
  return {
    schema_version: "soulforge.project_rag_answer_reference.v1",
    kind: "project_rag_answer_reference",
    project_ref: projectRef,
    legacy_answer_run_ref: answerRun.ref,
    legacy_answer_run_content_id: answerRun.content_id,
    rag_index_ref: typedRef("rag_index", "project_rag_payload", lineage.rag_index.id),
    status: mapped.length > 0 ? "citations_mapped" : "no_citations",
    query_persisted: false,
    answer_text_persisted: false,
    citations: mapped,
  };
}

function canonicalDigest(value) {
  return `sha256:${createHash("sha256")
    .update(serializeCanonicalIdentity(value), "utf8")
    .digest("hex")}`;
}

function wrapArtifact(targetRef, payload) {
  const canonical = serializeCanonicalIdentity(payload);
  return {
    target_ref: targetRef,
    serialization_profile_id: CANONICAL_ARTIFACT_PROFILE_ID,
    canonical_content_id: `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
    payload,
  };
}

function outputTarget(projectRef, assetKind, pathSegments) {
  return resolveRagAssetTarget({
    owner_scope: "project",
    project_ref: projectRef,
    asset_kind: assetKind,
    path_segments: pathSegments,
  }).target_ref;
}

function buildOutputArtifacts({ projectRef, legacy, envelopes, lineage, answerPayload }) {
  const chunkRows = lineage.chunks.map((chunk) => ({
    legacy_chunk_ref: typedRef(
      "rag_chunk",
      "legacy_source_text_index",
      chunk.legacy_chunk_id,
    ),
    rag_chunk_ref: typedRef("rag_chunk", "project_rag_payload", chunk.rag_chunk.id),
    evidence_locator_ref: typedRef(
      "evidence_locator",
      "project_rag_payload",
      chunk.evidence_locator.id,
    ),
    chunk_content_id: chunk.chunk_content_id,
    byte_range: {
      start: chunk.byte_start,
      end_exclusive: chunk.byte_end_exclusive,
    },
  }));
  const indexPayload = {
    schema_version: "soulforge.project_rag_index.v1",
    kind: "project_rag_index",
    status: "ready_for_writer_gate",
    owner_scope: "project",
    project_ref: projectRef,
    source_ref: typedRef("source", "source_metadata", legacy.source_id),
    source_revision_ref: typedRef(
      "source_revision",
      "source_metadata",
      lineage.source_revision.id,
    ),
    extraction_run_ref: typedRef(
      "extraction_run",
      "source_extraction",
      lineage.extraction_run.id,
    ),
    rag_index_ref: typedRef("rag_index", "project_rag_payload", lineage.rag_index.id),
    normalized_content_id: envelopes.normalized_text.content_id,
    permissions: {
      source_text_retrieval_allowed: true,
      project_only: true,
      public_canon_promotion_allowed: false,
      external_upload_allowed: false,
    },
    counts: { source_revision_count: 1, chunk_count: chunkRows.length },
    chunks: chunkRows,
  };
  const lineagePayload = {
    schema_version: "soulforge.project_rag_lineage_sidecar.v1",
    kind: "project_rag_lineage_sidecar",
    project_ref: projectRef,
    legacy_source_identity: preserveOwnerIssuedIdentity({
      owner_ref: typedRef("source", "source_metadata", legacy.source_id),
      aliases: [],
    }),
    legacy_inputs: {
      source_card: artifactReceipt(envelopes.source_card),
      ready_manifest: artifactReceipt(envelopes.ready_manifest),
      source_text_index: artifactReceipt(envelopes.legacy_index),
      normalized_text: artifactReceipt(envelopes.normalized_text),
      legacy_answer_run:
        envelopes.legacy_answer_run === null
          ? null
          : artifactReceipt(envelopes.legacy_answer_run),
    },
    source_revision: lineage.source_revision,
    extraction_run: lineage.extraction_run,
    rag_index: lineage.rag_index,
    chunks: lineage.chunks.map((chunk) => ({
      legacy_chunk_ref: typedRef(
        "rag_chunk",
        "legacy_source_text_index",
        chunk.legacy_chunk_id,
      ),
      evidence_locator: chunk.evidence_locator,
      rag_chunk: chunk.rag_chunk,
    })),
    boundary: {
      metadata_only: true,
      source_text_included: false,
      chunk_text_included: false,
      query_included: false,
      answer_text_included: false,
      runtime_absolute_paths_included: false,
    },
  };

  const indexArtifact = wrapArtifact(
    outputTarget(projectRef, "indexes_local", [lineage.rag_index.id, "project_rag_index.v1.json"]),
    indexPayload,
  );
  const lineageArtifact = wrapArtifact(
    outputTarget(projectRef, "traceability_sidecars", [
      lineage.rag_index.id,
      "project_rag_lineage_sidecar.v1.json",
    ]),
    lineagePayload,
  );
  const answerArtifact =
    answerPayload === null
      ? null
      : wrapArtifact(
          outputTarget(projectRef, "answer_runs", [
            lineage.rag_index.id,
            `answer_${envelopes.legacy_answer_run.content_id.slice("sha256:".length, 39)}.v1.json`,
          ]),
          answerPayload,
        );
  return { index_artifact: indexArtifact, lineage_artifact: lineageArtifact, answer_run_artifact: answerArtifact };
}

function artifactReceipt(envelope) {
  return {
    ref: envelope.ref,
    content_id: envelope.content_id,
    byte_length: envelope.byte_length,
  };
}

function buildRollbackManifest({ projectRef, legacyReaderRef, legacyIndex, outputs, ragIndexId }) {
  const createdOutputs = [outputs.index_artifact, outputs.lineage_artifact, outputs.answer_run_artifact]
    .filter(Boolean)
    .map((artifact) => ({
      target_ref: artifact.target_ref,
      expected_content_id: artifact.canonical_content_id,
      rollback_action: "delete_only_if_digest_matches",
    }));
  const payload = {
    schema_version: "soulforge.project_rag_pilot_rollback_manifest.v1",
    kind: "project_rag_pilot_rollback_manifest",
    mode: "plan_only",
    apply_allowed: false,
    project_ref: projectRef,
    restore_reader: {
      legacy_reader_ref: legacyReaderRef,
      legacy_index_ref: legacyIndex.ref,
      legacy_index_content_id: legacyIndex.content_id,
    },
    created_outputs: createdOutputs,
    writer_gate_required: [
      "owner_decision_binding",
      "approved_external_owner_root_binding",
      "write_containment_recheck",
      "immutable_output_decision",
      "exclusive_create",
      "readback_digest_verification",
    ],
  };
  return wrapArtifact(
    outputTarget(projectRef, "operational_routes", [
      ragIndexId,
      "project_rag_pilot_rollback_manifest.v1.json",
    ]),
    payload,
  );
}

export function buildProjectRagPilotBundle(input) {
  assertKnownFields(
    input,
    ["apply", "project_ref", "legacy_reader_ref", "identity_profile", "artifacts"],
    ["project_ref", "legacy_reader_ref", "identity_profile", "artifacts"],
    "project RAG pilot input",
  );
  if (input.apply !== undefined && input.apply !== false) {
    fail(
      "RAG_PILOT_APPLY_BLOCKED",
      "this pure builder cannot write; owner decision, external binding, and writer gates are separate",
    );
  }
  const projectRef = normalizeProjectRef(input.project_ref);
  const legacyReaderRef = assertProjectBoundRef(
    input.legacy_reader_ref,
    projectRef.entity_id,
    "legacy_reader_ref",
  );
  const profile = normalizeIdentityProfile(input.identity_profile);
  assertKnownFields(
    input.artifacts,
    ["source_card", "ready_manifest", "legacy_index", "normalized_text", "legacy_answer_run"],
    ["source_card", "ready_manifest", "legacy_index", "normalized_text"],
    "artifacts",
  );
  const envelopes = {
    source_card: parseJsonEnvelope(input.artifacts.source_card, "artifacts.source_card"),
    ready_manifest: parseJsonEnvelope(
      input.artifacts.ready_manifest,
      "artifacts.ready_manifest",
    ),
    legacy_index: parseJsonEnvelope(input.artifacts.legacy_index, "artifacts.legacy_index"),
    normalized_text: parseTextEnvelope(input.artifacts.normalized_text),
    legacy_answer_run:
      input.artifacts.legacy_answer_run === undefined || input.artifacts.legacy_answer_run === null
        ? null
        : parseJsonEnvelope(
            input.artifacts.legacy_answer_run,
            "artifacts.legacy_answer_run",
          ),
  };
  const legacy = validateLegacyContracts({
    projectRef,
    sourceCard: envelopes.source_card,
    readyManifest: envelopes.ready_manifest,
    legacyIndex: envelopes.legacy_index,
    envelopes,
  });
  const locatedChunks = locateLegacyChunks({
    legacyIndex: envelopes.legacy_index,
    normalizedText: envelopes.normalized_text,
    sourceRef: legacy.source_ref,
  });
  const lineage = buildIdentityLineage({
    projectRef,
    source: legacy,
    normalizedText: envelopes.normalized_text,
    locatedChunks,
    profile,
  });
  const answerPayload = mapLegacyAnswerRun({
    answerRun: envelopes.legacy_answer_run,
    legacyIndex: envelopes.legacy_index,
    lineage,
    projectRef,
  });
  const outputs = buildOutputArtifacts({
    projectRef,
    legacy,
    envelopes,
    lineage,
    answerPayload,
  });
  const rollbackManifest = buildRollbackManifest({
    projectRef,
    legacyReaderRef,
    legacyIndex: envelopes.legacy_index,
    outputs,
    ragIndexId: lineage.rag_index.id,
  });
  const bundleBasis = {
    schema_version: PROJECT_RAG_PILOT_BUNDLE_SCHEMA_VERSION,
    kind: "project_rag_pilot_bundle",
    mode: "build_only",
    apply_requested: false,
    write_allowed: false,
    project_ref: projectRef,
    identity_summary: {
      source_id: legacy.source_id,
      source_revision_id: lineage.source_revision.id,
      extraction_run_id: lineage.extraction_run.id,
      rag_index_id: lineage.rag_index.id,
      chunk_count: lineage.chunks.length,
    },
    index: outputs.index_artifact,
    lineage_sidecar: outputs.lineage_artifact,
    answer_run: outputs.answer_run_artifact,
    rollback_manifest: rollbackManifest,
    next_gate: {
      status: "blocked_pending_separate_writer_gate",
      apply_implementation_present: false,
      external_owner_binding_present: false,
    },
  };
  return { ...bundleBasis, bundle_digest: canonicalDigest(bundleBasis) };
}

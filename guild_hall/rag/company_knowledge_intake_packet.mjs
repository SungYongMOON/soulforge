import path from "node:path";
import { normalizeRepoPath, readJson } from "../shared/io.mjs";

export const COMPANY_KNOWLEDGE_INTAKE_PACKET_SCHEMA_VERSION =
  "soulforge.company_knowledge_intake_packet.v0";
export const COMPANY_KNOWLEDGE_INTAKE_PACKET_VALIDATION_SCHEMA_VERSION =
  "soulforge.company_knowledge_intake_packet_validation.v0";

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;
const SAFE_REF_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_./:@-]{0,239}$/;
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/i;
const TOKEN_FINGERPRINT_PATTERN = /^[a-f0-9]{32}$/i;
const COMPANY_SOURCE_REF_PREFIXES = ["_workspaces/knowledge/"];
const TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "kind",
  "packet_id",
  "packet_status",
  "generated_at_utc",
  "handoff",
  "boundary",
  "question_refs",
  "sources",
  "handoff_state",
]);
const HANDOFF_KEYS = new Set(["origin_label", "return_label", "purpose_label", "prepared_by_role"]);
const BOUNDARY_KEYS = new Set([
  "metadata_only",
  "packet_is_not_owner_approval",
  "raw_payloads_included",
  "source_payloads_included",
  "source_text_included",
  "chunk_payloads_included",
  "mail_bodies_included",
  "attachments_included",
  "notebooklm_answers_included",
  "notebooklm_questions_included",
  "notebooklm_conversation_ids_included",
  "secrets_or_session_included",
  "live_account_state_included",
  "runtime_absolute_paths_included",
  "source_text_retrieval_allowed",
  "index_build_allowed",
  "notebooklm_packet_allowed",
  "public_canon_promotion_allowed",
]);
const QUESTION_REF_KEYS = new Set([
  "question_label",
  "purpose_ref",
  "question_fingerprint",
  "query_token_count",
  "query_token_fingerprints",
]);
const SOURCE_KEYS = new Set([
  "source_id",
  "source_label",
  "source_ref",
  "source_sync_ready_ref",
  "source_hash",
  "source_size_bytes",
  "source_class",
  "source_kind",
  "locator_kind",
  "locator_label",
  "approval_status",
  "version_label",
  "permissions",
]);
const HANDOFF_STATE_KEYS = new Set(["claim_ceiling", "next_action"]);
const SOURCE_CLASSES = new Set([
  "company_private",
  "project_private",
  "owner_private",
  "restricted",
  "internal_common",
  "public_official_source",
]);
const APPROVAL_STATUSES = new Set([
  "pending_owner_review",
  "owner_approved_metadata_only",
  "blocked",
  "rejected",
  "superseded",
]);
const LOCATOR_KINDS = new Set([
  "owner_label",
  "repo_relative_ref",
  "shared_worksite_ref",
  "source_card_ref",
  "version_label",
]);
const PACKET_STATUSES = new Set(["template_placeholder", "draft", "pending_owner_review", "blocked", "accepted_metadata_only"]);
const REQUIRED_TRUE_BOUNDARY_FLAGS = [
  "metadata_only",
  "packet_is_not_owner_approval",
];
const REQUIRED_FALSE_BOUNDARY_FLAGS = [
  "raw_payloads_included",
  "source_payloads_included",
  "source_text_included",
  "chunk_payloads_included",
  "mail_bodies_included",
  "attachments_included",
  "notebooklm_answers_included",
  "notebooklm_questions_included",
  "notebooklm_conversation_ids_included",
  "secrets_or_session_included",
  "live_account_state_included",
  "runtime_absolute_paths_included",
  "source_text_retrieval_allowed",
  "index_build_allowed",
  "notebooklm_packet_allowed",
  "public_canon_promotion_allowed",
];
const REQUIRED_FALSE_PERMISSION_FLAGS = [
  "source_text_retrieval_allowed",
  "index_build_allowed",
  "notebooklm_packet_allowed",
  "public_canon_promotion_allowed",
  "attachment_access_allowed",
  "live_account_access_allowed",
  "secret_access_allowed",
  "raw_payload_access_allowed",
];
const PERMISSION_KEYS = new Set([
  "metadata_only",
  ...REQUIRED_FALSE_PERMISSION_FLAGS,
]);
const FORBIDDEN_PACKET_KEYS = new Set([
  "account_state",
  "account_id",
  "account_ids",
  "attachment",
  "attachment_body",
  "attachment_payload",
  "attachment_text",
  "attachments",
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_payload",
  "chunk_text",
  "chunks",
  "content",
  "conversation_id",
  "conversation_ids",
  "conversation_ref",
  "drive_file_id",
  "drive_id",
  "email_body",
  "email_payload",
  "file_payload",
  "gmail_account_state",
  "html",
  "live_account_state",
  "mail_body",
  "mail_payload",
  "message_body",
  "notebooklm_answer",
  "notebooklm_answer_text",
  "notebooklm_conversation_id",
  "notebooklm_conversation_ids",
  "notebooklm_notebook_id",
  "notebooklm_output",
  "notebooklm_question",
  "notebooklm_response",
  "oauth_state",
  "ontology_accepted",
  "owner_approval",
  "owner_approval_granted",
  "owner_approved",
  "payload",
  "private_payload",
  "public_canon",
  "public_canon_entry",
  "question",
  "question_text",
  "query",
  "query_text",
  "raw",
  "raw_mail",
  "raw_payload",
  "raw_question",
  "raw_query",
  "raw_source",
  "session_state",
  "source_body",
  "source_chunk",
  "source_chunks",
  "source_content",
  "source_payload",
  "source_raw",
  "source_text",
  "text",
  "user_query",
  "user_question",
]);
const SECRET_LIKE_KEYS = new Set([
  "access_token",
  "api_key",
  "authorization",
  "bearer_token",
  "client_secret",
  "cookie",
  "credential",
  "credentials",
  "id_token",
  "password",
  "passwd",
  "private_key",
  "refresh_token",
  "secret",
  "session",
  "token",
]);
const PRIVATE_SOURCE_CLASS_PATTERN = /(?:company|private|confidential|internal|restricted)/i;

export async function loadCompanyKnowledgeIntakePacket({ repoRoot = process.cwd(), packetRef } = {}) {
  if (!packetRef) throw new Error("company_knowledge_intake_packet_ref_required");
  const root = path.resolve(repoRoot);
  return readJson(path.join(root, safeRepoRelativeJsonPath(packetRef)));
}

export function validateCompanyKnowledgeIntakePacket(packet) {
  const blockers = [];
  if (packet?.schema_version !== COMPANY_KNOWLEDGE_INTAKE_PACKET_SCHEMA_VERSION) {
    blockers.push("schema_version_mismatch");
  }
  if (packet?.kind !== "company_knowledge_intake_packet") {
    blockers.push("kind_must_be_company_knowledge_intake_packet");
  }
  if (!isSafeId(packet?.packet_id)) blockers.push("packet_id_unsafe");
  if (!PACKET_STATUSES.has(packet?.packet_status)) blockers.push("packet_status_unknown");
  if (!isIsoTimestamp(packet?.generated_at_utc)) blockers.push("generated_at_utc_invalid");
  validateAllowedKeys(packet, TOP_LEVEL_KEYS, blockers, "company_knowledge_intake_packet");

  const handoff = packet?.handoff ?? {};
  validateAllowedKeys(handoff, HANDOFF_KEYS, blockers, "company_knowledge_intake_packet.handoff");
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
    blockers.push("handoff_must_be_object");
  } else {
    for (const key of HANDOFF_KEYS) {
      if (!isSafeId(handoff[key])) blockers.push(`handoff_${key}_unsafe`);
    }
  }

  const boundary = packet?.boundary ?? {};
  validateAllowedKeys(boundary, BOUNDARY_KEYS, blockers, "company_knowledge_intake_packet.boundary");
  for (const flag of REQUIRED_TRUE_BOUNDARY_FLAGS) {
    if (boundary[flag] !== true) blockers.push(`boundary_${flag}_must_be_true`);
  }
  for (const flag of REQUIRED_FALSE_BOUNDARY_FLAGS) {
    if (boundary[flag] !== false) blockers.push(`boundary_${flag}_must_be_false`);
  }

  const questionRefs = arrayField(packet, "question_refs", blockers);
  if (questionRefs.length === 0) blockers.push("question_refs_must_not_be_empty");
  for (const [index, questionRef] of questionRefs.entries()) {
    validateQuestionRef(questionRef, blockers, `question_refs[${index}]`);
  }

  const sources = arrayField(packet, "sources", blockers);
  if (sources.length === 0) blockers.push("sources_must_not_be_empty");
  const sourceIds = new Set();
  for (const [index, source] of sources.entries()) {
    const trail = `sources[${index}]`;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      blockers.push(`source_must_be_object:${trail}`);
      continue;
    }
    validateAllowedKeys(source, SOURCE_KEYS, blockers, `company_knowledge_intake_packet.${trail}`);
    if (!isSafeId(source.source_id)) blockers.push(`source_id_unsafe:${trail}`);
    if (sourceIds.has(source.source_id)) blockers.push(`source_id_duplicate:${source.source_id}`);
    sourceIds.add(source.source_id);
    if (!isSafeLabel(source.source_label)) blockers.push(`source_label_unsafe:${trail}`);
    if (!isSafeRef(source.source_ref)) blockers.push(`source_ref_unsafe:${trail}`);
    if (!isSafeCompanySourceRef(source.source_ref)) blockers.push(`source_ref_must_be_soulforge_knowledge_relative:${trail}`);
    if (source.source_sync_ready_ref !== undefined) {
      if (!isSafeRef(source.source_sync_ready_ref)) blockers.push(`source_sync_ready_ref_unsafe:${trail}`);
      if (!isSafeCompanySourceRef(source.source_sync_ready_ref)) {
        blockers.push(`source_sync_ready_ref_must_be_soulforge_knowledge_relative:${trail}`);
      }
      if (!String(source.source_sync_ready_ref).endsWith(".json")) blockers.push(`source_sync_ready_ref_must_be_json:${trail}`);
    }
    if (!isSafeHash(source.source_hash)) blockers.push(`source_hash_unsafe:${trail}`);
    if (!Number.isSafeInteger(source.source_size_bytes) || source.source_size_bytes < 0) {
      blockers.push(`source_size_bytes_invalid:${trail}`);
    }
    if (!SOURCE_CLASSES.has(source.source_class)) blockers.push(`source_class_unknown:${trail}`);
    if (source.source_kind !== undefined && !isSafeId(source.source_kind)) blockers.push(`source_kind_unsafe:${trail}`);
    if (source.locator_kind !== undefined && !LOCATOR_KINDS.has(source.locator_kind)) {
      blockers.push(`source_locator_kind_unknown:${trail}`);
    }
    if (source.locator_label !== undefined && !isSafeId(source.locator_label)) blockers.push(`source_locator_label_unsafe:${trail}`);
    if (source.version_label !== undefined && !isSafeId(source.version_label)) blockers.push(`source_version_label_unsafe:${trail}`);
    if (source.approval_status !== undefined && !APPROVAL_STATUSES.has(source.approval_status)) {
      blockers.push(`source_approval_status_unknown:${trail}`);
    }
    validateSourcePermissions(source, blockers, trail);
  }

  const handoffState = packet?.handoff_state ?? {};
  validateAllowedKeys(handoffState, HANDOFF_STATE_KEYS, blockers, "company_knowledge_intake_packet.handoff_state");
  if (!handoffState || typeof handoffState !== "object" || Array.isArray(handoffState)) {
    blockers.push("handoff_state_must_be_object");
  } else {
    if (handoffState.claim_ceiling !== "observed") blockers.push("handoff_state_claim_ceiling_must_be_observed");
    if (handoffState.next_action !== undefined && !isSafeId(handoffState.next_action)) {
      blockers.push("handoff_state_next_action_unsafe");
    }
  }

  blockers.push(...findPacketSafetyBlockers(packet));
  return {
    schema_version: COMPANY_KNOWLEDGE_INTAKE_PACKET_VALIDATION_SCHEMA_VERSION,
    kind: "company_knowledge_intake_packet_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    packet_id: packet?.packet_id ?? null,
    source_count: sources.length,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: boundarySummary(boundary),
  };
}

function validateSourcePermissions(source, blockers, trail) {
  const permissions = source.permissions ?? {};
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
    blockers.push(`source_permissions_must_be_object:${trail}`);
    return;
  }
  validateAllowedKeys(permissions, PERMISSION_KEYS, blockers, `company_knowledge_intake_packet.${trail}.permissions`);
  if (permissions.metadata_only !== true) blockers.push(`source_permission_metadata_only_must_be_true:${trail}`);
  for (const flag of REQUIRED_FALSE_PERMISSION_FLAGS) {
    if (permissions[flag] !== false) blockers.push(`source_permission_${flag}_must_be_false:${trail}`);
  }
  if (PRIVATE_SOURCE_CLASS_PATTERN.test(String(source.source_class ?? "")) && permissions.public_canon_promotion_allowed !== false) {
    blockers.push(`private_source_public_canon_promotion_must_be_false:${trail}`);
  }
}

function validateQuestionRef(questionRef, blockers, trail) {
  if (!questionRef || typeof questionRef !== "object" || Array.isArray(questionRef)) {
    blockers.push(`question_ref_must_be_object:${trail}`);
    return;
  }
  validateAllowedKeys(questionRef, QUESTION_REF_KEYS, blockers, `company_knowledge_intake_packet.${trail}`);
  if (!isSafeId(questionRef.question_label)) blockers.push(`question_ref_label_unsafe:${trail}`);
  if (questionRef.purpose_ref !== undefined && !isSafeRef(questionRef.purpose_ref)) {
    blockers.push(`question_ref_purpose_ref_unsafe:${trail}`);
  }
  if (!isSafeHash(questionRef.question_fingerprint)) {
    blockers.push(`question_ref_question_fingerprint_unsafe:${trail}`);
  }
  if (!Number.isSafeInteger(questionRef.query_token_count) || questionRef.query_token_count < 0) {
    blockers.push(`question_ref_query_token_count_invalid:${trail}`);
  }
  const tokenFingerprints = arrayField(questionRef, "query_token_fingerprints", blockers);
  if (Number.isSafeInteger(questionRef.query_token_count) && questionRef.query_token_count !== tokenFingerprints.length) {
    blockers.push(`question_ref_query_token_count_must_match_fingerprint_count:${trail}`);
  }
  for (const fingerprint of tokenFingerprints) {
    if (!isSafeTokenFingerprint(fingerprint)) blockers.push(`question_ref_query_token_fingerprint_unsafe:${trail}`);
  }
}

function validateAllowedKeys(value, allowedKeys, blockers, trail) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) blockers.push(`unknown_key:${trail}.${key}`);
  }
}

function findPacketSafetyBlockers(value, trail = "company_knowledge_intake_packet") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findPacketSafetyBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_PACKET_KEYS.has(normalizedKey)) {
        blockers.push(`company_packet_forbidden_raw_or_payload_key:${trail}.${key}`);
      }
      if (SECRET_LIKE_KEYS.has(normalizedKey)) {
        blockers.push(`company_packet_secret_like_key:${trail}.${key}`);
      }
      blockers.push(...findPacketSafetyBlockers(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") return blockers;
  if (hasUrlSchemeString(value)) blockers.push(`company_packet_url_string:${trail}`);
  if (hasLocalAbsolutePathString(value)) blockers.push(`company_packet_local_absolute_path:${trail}`);
  if (hasSecretLikeValueString(value)) blockers.push(`company_packet_secret_like_value:${trail}`);
  if (hasRawMaterialSignalString(value)) blockers.push(`company_packet_raw_material_value:${trail}`);
  return blockers;
}

function boundarySummary(boundary) {
  return {
    metadata_only: boundary.metadata_only === true,
    no_raw_payloads: boundary.raw_payloads_included === false,
    no_source_payloads: boundary.source_payloads_included === false,
    no_source_text: boundary.source_text_included === false,
    no_chunk_payloads: boundary.chunk_payloads_included === false,
    no_mail_bodies: boundary.mail_bodies_included === false,
    no_attachments: boundary.attachments_included === false,
    no_notebooklm_answers: boundary.notebooklm_answers_included === false,
    no_notebooklm_questions: boundary.notebooklm_questions_included === false,
    no_notebooklm_conversation_ids: boundary.notebooklm_conversation_ids_included === false,
    no_secrets_or_session: boundary.secrets_or_session_included === false,
    no_live_account_state: boundary.live_account_state_included === false,
    no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
    no_source_text_retrieval: boundary.source_text_retrieval_allowed === false,
    no_index_build: boundary.index_build_allowed === false,
    no_notebooklm_packet: boundary.notebooklm_packet_allowed === false,
    no_public_canon_promotion: boundary.public_canon_promotion_allowed === false,
  };
}

function safeRepoRelativeJsonPath(value) {
  const ref = normalizeRepoPath(String(value ?? "").trim());
  if (!ref || path.isAbsolute(ref) || ref.includes("..") || ref.startsWith("~")) {
    throw new Error("packet_ref_must_be_repo_relative");
  }
  if (ref.includes("\\") || /[\u0000-\u001F\u007F]/u.test(ref)) {
    throw new Error("packet_ref_contains_unsafe_characters");
  }
  if (!ref.endsWith(".json")) throw new Error("packet_ref_must_point_to_json");
  if (hasLocalAbsolutePathString(ref) || hasSecretLikePathSegment(ref)) {
    throw new Error("packet_ref_unsafe");
  }
  return ref;
}

function arrayField(value, key, blockers) {
  const child = value?.[key];
  if (!Array.isArray(child)) {
    blockers.push(`${key}_must_be_array`);
    return [];
  }
  return child;
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value) && isSafeStringValue(value);
}

function isSafeLabel(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 200 &&
    isSafeStringValue(value);
}

function isSafeRef(value) {
  const ref = normalizeRepoPath(String(value ?? "").trim());
  if (!ref || ref.length > 240 || !SAFE_REF_PATTERN.test(ref)) return false;
  if (path.isAbsolute(ref) || ref.includes("..") || ref.startsWith("~")) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(ref)) return false;
  return isSafeStringValue(ref);
}

function isSafeCompanySourceRef(value) {
  const ref = normalizeRepoPath(String(value ?? "").trim());
  return isSafeRef(ref) && COMPANY_SOURCE_REF_PREFIXES.some((prefix) => ref.startsWith(prefix));
}

function isSafeHash(value) {
  return typeof value === "string" && SHA256_PATTERN.test(value.trim());
}

function isSafeTokenFingerprint(value) {
  return typeof value === "string" && TOKEN_FINGERPRINT_PATTERN.test(value.trim());
}

function isIsoTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isSafeStringValue(value) {
  const text = String(value ?? "");
  if (/[\u0000-\u001F\u007F]/u.test(text)) return false;
  if (hasUrlSchemeString(text)) return false;
  if (hasLocalAbsolutePathString(text)) return false;
  if (hasSecretLikeValueString(text)) return false;
  if (hasRawMaterialSignalString(text)) return false;
  return true;
}

function hasSecretLikePathSegment(value) {
  return /(^|[/_.-])(?:secret|token|cookie|credential|session|password|passwd|private_key|api_key)([/_.-]|$)/i.test(
    String(value ?? ""),
  );
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

function hasRawMaterialSignalString(value) {
  const text = String(value ?? "");
  return /(?:raw\s+(?:payload|source|mail|question|query)|source\s+(?:text|body|payload)|chunk\s+(?:text|payload)|mail\s+body|attachment\s+(?:body|payload|text)|notebooklm\s+(?:answer|question|conversation))/i.test(text);
}

import { createHash } from "node:crypto";
import { types } from "node:util";

import { canonicalise, compareCodePoints } from "../engineering_engine/kernel/canonical.mjs";

export const PROJECT_PDF_KNOWLEDGE_CANDIDATE_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_candidate.v0";
export const PROJECT_PDF_KNOWLEDGE_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_projection_receipt.v0";
export const PROJECT_PDF_KNOWLEDGE_RETRIEVAL_SCHEMA_VERSION =
  "soulforge.project_pdf_knowledge_retrieval.v0";

const SOURCE_REVISION_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_source_revision_receipt.v0";
const RAG_CANDIDATE_SCHEMA_VERSION = "soulforge.project_pdf_rag_candidate.v0";
const THIN_WIKI_CANDIDATE_SCHEMA_VERSION = "soulforge.project_pdf_thin_wiki_candidate.v0";
const P5_INPUT_CANDIDATE_SCHEMA_VERSION = "soulforge.project_pdf_p5_input_candidate.v0";

const ADMITTED_CANDIDATE_SCHEMA_VERSION = "soulforge.admitted_project_pdf_candidate.v0";
const INGEST_CANDIDATE_SCHEMA_VERSION = "soulforge.project_document_ingest_candidate.v0";
const FEATURE_STATE = "off";
const ADMISSION_ROUTE = "validation_only";
const CANDIDATE_ROUTE = "project_local_candidate_only";
const CANDIDATE_STATUS = "candidate";
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const MAX_ADMITTED_DEPTH = 10;
const MAX_PAGE_COUNT = 2048;
const MAX_PAGE_CHARS = 512 * 1024;
const MAX_TOTAL_CHARS = 1024 * 1024;
const MAX_TOKEN_FINGERPRINTS_PER_UNIT = 512;
const MAX_QUERY_CHARS = 8000;
const MAX_QUERY_TOKENS = 128;
const MAX_CITATIONS = 3;
const MAX_WIKI_CITATIONS = 64;
const MAX_SNAPSHOT_DEPTH = 12;
const MAX_SNAPSHOT_NODES = 10000;

const BUILD_REQUEST_FIELDS = Object.freeze([
  "admitted_candidate",
  "expected_project_binding_ref",
  "expected_document_revision_ref",
  "trusted_source_revision_receipt_sha256",
]);
const RETRIEVAL_REQUEST_FIELDS = Object.freeze([
  "candidate",
  "expected_project_binding_ref",
  "expected_document_revision_ref",
  "trusted_candidate_sha256",
  "trusted_source_revision_receipt_sha256",
  "query_text",
]);
const EXACT_REF_FIELDS = Object.freeze([
  "entity_id",
  "revision_id",
  "content_id",
  "content_hash_alg",
]);
const ADMITTED_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "route",
  "admission",
  "ingest_candidate",
  "authority",
  "effects",
]);
const ADMISSION_FIELDS = Object.freeze([
  "project_binding_ref",
  "document_revision_ref",
  "document_read_grant_ref",
  "knowledge_scope_fingerprint_sha256",
  "local_admission_fingerprint_sha256",
  "portable_material_fingerprint_sha256",
  "relative_locator_fingerprint_sha256",
  "knowledge_view_project_read_allowed",
  "document_read_grant_binding_verified",
]);
const INGEST_FIELDS = Object.freeze([
  "schema_version",
  "status",
  "source",
  "extraction",
  "authority",
  "effects",
]);
const INGEST_SOURCE_FIELDS = Object.freeze(["media_type", "sha256", "byte_count"]);
const EXTRACTION_FIELDS = Object.freeze([
  "engine",
  "page_count",
  "character_count",
  "text_sha256",
  "pages",
]);
const PAGE_FIELDS = Object.freeze(["page_number", "text"]);
const ADMITTED_AUTHORITY_FIELDS = Object.freeze([
  "source_truth",
  "canon",
  "project_state",
  "approval",
  "engine_input_allowed",
  "activation_allowed",
  "wiki_write_allowed",
  "rag_write_allowed",
  "erp_write_allowed",
  "taskdriver_allowed",
]);
const ADMITTED_EFFECT_FIELDS = Object.freeze([
  "persistent_writes",
  "network_calls",
  "model_calls",
  "rag_index_writes",
  "wiki_writes",
  "engine_calls",
]);
const INGEST_AUTHORITY_FIELDS = Object.freeze([
  "source_truth",
  "canon",
  "project_state",
  "approval",
]);
const INGEST_EFFECT_FIELDS = Object.freeze([
  "persistent_writes",
  "network_calls",
  "model_calls",
  "rag_index_writes",
  "wiki_writes",
]);
const SOURCE_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "project_binding_ref",
  "document_revision_ref",
  "document_read_grant_ref",
  "knowledge_scope_fingerprint_sha256",
  "local_admission_fingerprint_sha256",
  "portable_material_fingerprint_sha256",
  "relative_locator_fingerprint_sha256",
  "source_content_sha256",
  "extraction_text_sha256",
  "page_count",
  "character_count",
  "source_revision_binding_sha256",
  "source_revision_receipt_sha256",
  "supersession_status",
  "project_count",
]);
const RAG_CANDIDATE_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "project_binding_ref",
  "source_revision_receipt_sha256",
  "retrieval_units",
  "body_included",
  "source_truth",
]);
const RETRIEVAL_UNIT_FIELDS = Object.freeze([
  "unit_id",
  "page_number",
  "utf16_start",
  "utf16_end",
  "excerpt_sha256",
  "token_fingerprints",
  "unit_sha256",
]);
const THIN_WIKI_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "project_binding_ref",
  "source_revision_receipt_sha256",
  "page_count",
  "pages",
  "body_included",
  "source_truth",
  "canon",
]);
const WIKI_PAGE_FIELDS = Object.freeze([
  "page_id",
  "page_kind",
  "citation_count",
  "citations",
  "omitted_citation_count",
]);
const CITATION_FIELDS = Object.freeze([
  "citation_id",
  "source_revision_receipt_sha256",
  "document_revision_ref",
  "page_number",
  "utf16_start",
  "utf16_end",
  "excerpt_sha256",
  "unit_sha256",
]);
const P5_INPUT_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "project_binding_ref",
  "source_revision_set",
  "source_revision_set_sha256",
  "acceptance_allowed",
  "accepted_generation_created",
  "missing_acceptance_requirements",
]);
const P5_SOURCE_REVISION_FIELDS = Object.freeze([
  "source_revision_receipt_sha256",
  "document_revision_ref",
]);
const CANDIDATE_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "route",
  "project_binding_ref",
  "document_revision_ref",
  "source_revision_receipt",
  "rag_candidate",
  "thin_wiki_candidate",
  "p5_input_candidate",
  "authority",
  "effects",
  "candidate_sha256",
]);
const AUTHORITY_FIELDS = Object.freeze([
  "source_truth",
  "canon",
  "project_state",
  "approval",
  "accepted_context",
  "persistent_write_allowed",
  "activation_allowed",
  "engine_input_allowed",
  "erp_write_allowed",
  "taskdriver_allowed",
]);
const EFFECT_FIELDS = Object.freeze([
  "persistent_writes",
  "network_calls",
  "model_calls",
  "rag_index_writes",
  "wiki_writes",
  "engine_calls",
  "erp_writes",
]);

const STATIC_P5_GAPS = Object.freeze([
  "bitemporal_stamps",
  "coverage_and_gap",
  "unresolved_supersession",
  "reviewer_state",
  "writer_epoch",
]);

const BUILD_BLOCKERS = Object.freeze({
  request_invalid: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_BUILDING_REQUEST_INVALID",
    stage: "request",
  }),
  candidate_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_BUILDING_CANDIDATE_REFUSED",
    stage: "admitted_candidate",
  }),
  project_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_BUILDING_PROJECT_REFUSED",
    stage: "project_binding",
  }),
  revision_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_BUILDING_REVISION_REFUSED",
    stage: "source_revision",
  }),
  trust_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_BUILDING_TRUST_REFUSED",
    stage: "trusted_source_receipt",
  }),
  bounds_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_BUILDING_BOUNDS_REFUSED",
    stage: "projection",
  }),
});
const RETRIEVAL_BLOCKERS = Object.freeze({
  request_invalid: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_REQUEST_INVALID",
    stage: "request",
  }),
  candidate_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_CANDIDATE_REFUSED",
    stage: "candidate",
  }),
  project_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_PROJECT_REFUSED",
    stage: "project_binding",
  }),
  revision_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_REVISION_REFUSED",
    stage: "source_revision",
  }),
  candidate_trust_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_CANDIDATE_TRUST_REFUSED",
    stage: "trusted_candidate",
  }),
  source_receipt_trust_refused: Object.freeze({
    code: "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_SOURCE_RECEIPT_TRUST_REFUSED",
    stage: "trusted_source_receipt",
  }),
});

/**
 * Builds sibling RAG and Thin Wiki candidates from one already-admitted PDF.
 *
 * This module owns no filesystem seam. Admission owns the root and read grant;
 * this builder receives the closed candidate, derives only hashed page metadata,
 * and returns material a later owner-authorized persistent writer may evaluate.
 */
export function buildProjectPdfKnowledgeCandidate(request) {
  const prepared = prepareBuildRequest(request);
  if (prepared === null) return buildHold(BUILD_BLOCKERS.request_invalid);

  const admitted = readAdmittedCandidate(prepared.admittedCandidate);
  if (admitted === null) return buildHold(BUILD_BLOCKERS.candidate_refused);
  if (!sameExactRef(admitted.admission.project_binding_ref, prepared.projectRef)) {
    return buildHold(BUILD_BLOCKERS.project_refused);
  }
  if (!sameExactRef(admitted.admission.document_revision_ref, prepared.documentRef)) {
    return buildHold(BUILD_BLOCKERS.revision_refused);
  }

  const units = buildRetrievalUnits(admitted.extraction.pages);
  if (units === null) return buildHold(BUILD_BLOCKERS.bounds_refused);

  const sourceRevisionReceipt = buildSourceRevisionReceipt(admitted);
  if (sourceRevisionReceipt === null) return buildHold(BUILD_BLOCKERS.candidate_refused);
  if (sourceRevisionReceipt.source_revision_receipt_sha256
      !== prepared.trustedSourceRevisionReceiptSha256) {
    return buildHold(BUILD_BLOCKERS.trust_refused);
  }

  const ragCandidate = buildRagCandidate(admitted.admission.project_binding_ref, sourceRevisionReceipt, units);
  const thinWikiCandidate = buildThinWikiCandidate(
    admitted.admission.project_binding_ref,
    sourceRevisionReceipt,
    admitted.admission.document_revision_ref,
    units,
  );
  const p5InputCandidate = buildP5InputCandidate(
    admitted.admission.project_binding_ref,
    admitted.admission.document_revision_ref,
    sourceRevisionReceipt.source_revision_receipt_sha256,
  );
  if (ragCandidate === null || thinWikiCandidate === null || p5InputCandidate === null) {
    return buildHold(BUILD_BLOCKERS.bounds_refused);
  }

  const material = {
    schema_version: PROJECT_PDF_KNOWLEDGE_CANDIDATE_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_candidate",
    status: CANDIDATE_STATUS,
    feature_state: FEATURE_STATE,
    route: CANDIDATE_ROUTE,
    project_binding_ref: cloneRef(admitted.admission.project_binding_ref),
    document_revision_ref: cloneRef(admitted.admission.document_revision_ref),
    source_revision_receipt: sourceRevisionReceipt,
    rag_candidate: ragCandidate,
    thin_wiki_candidate: thinWikiCandidate,
    p5_input_candidate: p5InputCandidate,
    authority: authorityOff(),
    effects: effectsZero(),
  };
  const candidateSha256 = canonicalFingerprint("soulforge.project_pdf_knowledge_candidate.v0", material);
  if (candidateSha256 === null) return buildHold(BUILD_BLOCKERS.bounds_refused);
  const candidate = deepFreeze({ ...material, candidate_sha256: candidateSha256 });
  return deepFreeze({
    candidate,
    receipt: operationReceipt({
      operation: "build",
      status: "candidate_built",
      blocker: null,
      sourceCount: 1,
      projectCount: 1,
      unitCount: units.length,
      searchedUnitCount: 0,
      selectedCitationCount: 0,
      provenance: {
        bound: true,
        trusted_source_revision_receipt_sha256: prepared.trustedSourceRevisionReceiptSha256,
        source_revision_receipt_sha256: sourceRevisionReceipt.source_revision_receipt_sha256,
        portable_material_fingerprint_sha256:
          admitted.admission.portable_material_fingerprint_sha256,
        local_admission_fingerprint_sha256:
          admitted.admission.local_admission_fingerprint_sha256,
        relative_locator_fingerprint_sha256:
          admitted.admission.relative_locator_fingerprint_sha256,
      },
    }),
  });
}

/**
 * Searches one built candidate only. No root, collection, fallback, or writer
 * is part of this interface, so a foreign project cannot be enumerated or used.
 */
export function retrieveProjectPdfKnowledgeCandidate(request) {
  const prepared = prepareRetrievalRequest(request);
  if (prepared === null) return retrievalHold(RETRIEVAL_BLOCKERS.request_invalid);

  const candidate = readKnowledgeCandidate(prepared.candidate);
  if (candidate === null) return retrievalHold(RETRIEVAL_BLOCKERS.candidate_refused);
  if (candidate.candidate_sha256 !== prepared.trustedCandidateSha256) {
    return retrievalHold(RETRIEVAL_BLOCKERS.candidate_trust_refused);
  }
  if (candidate.source_revision_receipt.source_revision_receipt_sha256
      !== prepared.trustedSourceRevisionReceiptSha256) {
    return retrievalHold(RETRIEVAL_BLOCKERS.source_receipt_trust_refused);
  }
  if (!sameExactRef(candidate.project_binding_ref, prepared.projectRef)) {
    return retrievalHold(RETRIEVAL_BLOCKERS.project_refused);
  }
  if (!sameExactRef(candidate.document_revision_ref, prepared.documentRef)) {
    return retrievalHold(RETRIEVAL_BLOCKERS.revision_refused);
  }

  const queryFingerprints = tokenFingerprints(prepared.queryText, MAX_QUERY_TOKENS);
  if (queryFingerprints === null) return retrievalHold(RETRIEVAL_BLOCKERS.request_invalid);
  const wanted = new Set(queryFingerprints);
  const ranked = candidate.rag_candidate.retrieval_units
    .map((unit) => ({
      unit,
      score: unit.token_fingerprints.filter((fingerprint) => wanted.has(fingerprint)).length,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score
      || left.unit.page_number - right.unit.page_number
      || compareCodePoints(left.unit.unit_id, right.unit.unit_id))
    .slice(0, MAX_CITATIONS);
  const citations = ranked.map(({ unit }) => citationFor(
    unit,
    candidate.source_revision_receipt.source_revision_receipt_sha256,
    candidate.document_revision_ref,
  ));
  const retrieval = deepFreeze({
    schema_version: PROJECT_PDF_KNOWLEDGE_RETRIEVAL_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_retrieval",
    status: citations.length === 0 ? "no_source_text_hit" : "candidate_retrieval",
    feature_state: FEATURE_STATE,
    route: CANDIDATE_ROUTE,
    query: {
      raw_query_persisted: false,
      query_fingerprint: fingerprintText("soulforge.project_pdf_knowledge.query.v0", prepared.queryText),
      query_token_count: queryFingerprints.length,
    },
    project_binding_ref: cloneRef(candidate.project_binding_ref),
    document_revision_ref: cloneRef(candidate.document_revision_ref),
    source_revision_receipt_sha256:
      candidate.source_revision_receipt.source_revision_receipt_sha256,
    citations,
    authority: {
      source_truth: false,
      canon: false,
      accepted_context: false,
      operational_retrieval: false,
    },
    effects: effectsZero(),
  });
  return deepFreeze({
    retrieval,
    receipt: operationReceipt({
      operation: "retrieve",
      status: "retrieval_complete",
      blocker: null,
      sourceCount: 1,
      projectCount: 1,
      unitCount: candidate.rag_candidate.retrieval_units.length,
      searchedUnitCount: candidate.rag_candidate.retrieval_units.length,
      selectedCitationCount: citations.length,
      provenance: {
        bound: true,
        trusted_candidate_sha256: prepared.trustedCandidateSha256,
        trusted_source_revision_receipt_sha256:
          prepared.trustedSourceRevisionReceiptSha256,
      },
    }),
  });
}

function prepareBuildRequest(value) {
  const root = snapshotRequestRoot(value, BUILD_REQUEST_FIELDS);
  if (root === null) return null;
  const admittedCandidate = snapshotStructured(root.admitted_candidate, { requireFrozen: true });
  const projectRef = snapshotStructured(root.expected_project_binding_ref);
  const documentRef = snapshotStructured(root.expected_document_revision_ref);
  const trustedSourceRevisionReceiptSha256 = root.trusted_source_revision_receipt_sha256;
  return readExactRef(projectRef) === null || readExactRef(documentRef) === null
      || !isContentId(trustedSourceRevisionReceiptSha256)
    ? null
    : {
      admittedCandidate,
      projectRef,
      documentRef,
      trustedSourceRevisionReceiptSha256,
    };
}

function prepareRetrievalRequest(value) {
  const root = snapshotRequestRoot(value, RETRIEVAL_REQUEST_FIELDS);
  if (root === null) return null;
  const candidate = snapshotStructured(root.candidate, { requireFrozen: true });
  const projectRef = snapshotStructured(root.expected_project_binding_ref);
  const documentRef = snapshotStructured(root.expected_document_revision_ref);
  const trustedCandidateSha256 = root.trusted_candidate_sha256;
  const trustedSourceRevisionReceiptSha256 = root.trusted_source_revision_receipt_sha256;
  const queryText = root.query_text;
  if (readExactRef(projectRef) === null || readExactRef(documentRef) === null
      || !isContentId(trustedCandidateSha256) || !isContentId(trustedSourceRevisionReceiptSha256)
      || typeof queryText !== "string"
      || queryText.length === 0 || queryText.length > MAX_QUERY_CHARS
      || queryText.normalize("NFC") !== queryText) return null;
  return {
    candidate,
    projectRef,
    documentRef,
    trustedCandidateSha256,
    trustedSourceRevisionReceiptSha256,
    queryText,
  };
}

function readAdmittedCandidate(candidate) {
  if (!closedFrozenData(candidate, 0) || !exactKeys(candidate, ADMITTED_FIELDS)
      || candidate.schema_version !== ADMITTED_CANDIDATE_SCHEMA_VERSION
      || candidate.kind !== "admitted_project_pdf_candidate"
      || candidate.status !== CANDIDATE_STATUS
      || candidate.feature_state !== FEATURE_STATE
      || candidate.route !== ADMISSION_ROUTE
      || !allFalse(candidate.authority, ADMITTED_AUTHORITY_FIELDS)
      || !allZero(candidate.effects, ADMITTED_EFFECT_FIELDS)) return null;

  const admission = candidate.admission;
  if (!exactKeys(admission, ADMISSION_FIELDS)
      || readExactRef(admission.project_binding_ref) === null
      || readExactRef(admission.document_revision_ref) === null
      || readExactRef(admission.document_read_grant_ref) === null
      || !isContentId(admission.knowledge_scope_fingerprint_sha256)
      || !isContentId(admission.local_admission_fingerprint_sha256)
      || !isContentId(admission.portable_material_fingerprint_sha256)
      || !isContentId(admission.relative_locator_fingerprint_sha256)
      || admission.knowledge_view_project_read_allowed !== false
      || admission.document_read_grant_binding_verified !== true) return null;

  const ingest = candidate.ingest_candidate;
  if (!exactKeys(ingest, INGEST_FIELDS)
      || ingest.schema_version !== INGEST_CANDIDATE_SCHEMA_VERSION
      || ingest.status !== CANDIDATE_STATUS
      || !exactKeys(ingest.source, INGEST_SOURCE_FIELDS)
      || ingest.source.media_type !== "application/pdf"
      || !isSha256Hex(ingest.source.sha256)
      || !Number.isSafeInteger(ingest.source.byte_count) || ingest.source.byte_count < 1
      || admission.document_revision_ref.content_id !== `sha256:${ingest.source.sha256}`
      || !allFalse(ingest.authority, INGEST_AUTHORITY_FIELDS)
      || !allZero(ingest.effects, INGEST_EFFECT_FIELDS)) return null;

  const extraction = ingest.extraction;
  if (!exactKeys(extraction, EXTRACTION_FIELDS)
      || extraction.engine !== "pymupdf"
      || !Number.isSafeInteger(extraction.page_count) || extraction.page_count < 1
      || extraction.page_count > MAX_PAGE_COUNT
      || !Number.isSafeInteger(extraction.character_count) || extraction.character_count < 0
      || extraction.character_count > MAX_TOTAL_CHARS
      || !isSha256Hex(extraction.text_sha256)
      || !ordinaryDataArray(extraction.pages)
      || extraction.pages.length !== extraction.page_count) return null;
  let characterCount = 0;
  const texts = [];
  for (let index = 0; index < extraction.pages.length; index += 1) {
    const page = extraction.pages[index];
    if (!exactKeys(page, PAGE_FIELDS)
        || page.page_number !== index + 1
        || typeof page.text !== "string"
        || page.text.normalize("NFC") !== page.text
        || page.text.length > MAX_PAGE_CHARS) return null;
    characterCount += page.text.length;
    if (characterCount > MAX_TOTAL_CHARS) return null;
    texts.push(page.text);
  }
  if (characterCount !== extraction.character_count
      || digestHex(texts.join("")) !== extraction.text_sha256) return null;
  return { admission, source: ingest.source, extraction };
}

function readKnowledgeCandidate(candidate) {
  if (!closedFrozenData(candidate, 0) || !exactKeys(candidate, CANDIDATE_FIELDS)
      || candidate.schema_version !== PROJECT_PDF_KNOWLEDGE_CANDIDATE_SCHEMA_VERSION
      || candidate.kind !== "project_pdf_knowledge_candidate"
      || candidate.status !== CANDIDATE_STATUS
      || candidate.feature_state !== FEATURE_STATE
      || candidate.route !== CANDIDATE_ROUTE
      || readExactRef(candidate.project_binding_ref) === null
      || readExactRef(candidate.document_revision_ref) === null
      || !allFalse(candidate.authority, AUTHORITY_FIELDS)
      || !allZero(candidate.effects, EFFECT_FIELDS)
      || !isContentId(candidate.candidate_sha256)) return null;
  if (!readSourceRevisionReceipt(candidate.source_revision_receipt, candidate)
      || !readRagCandidate(candidate.rag_candidate, candidate)
      || !readThinWikiCandidate(candidate.thin_wiki_candidate, candidate)
      || !readP5InputCandidate(candidate.p5_input_candidate, candidate)) return null;
  const material = without(candidate, "candidate_sha256");
  return canonicalFingerprint("soulforge.project_pdf_knowledge_candidate.v0", material)
    === candidate.candidate_sha256
    ? candidate
    : null;
}

function readSourceRevisionReceipt(receipt, candidate) {
  if (!exactKeys(receipt, SOURCE_RECEIPT_FIELDS)
      || receipt.schema_version !== SOURCE_REVISION_RECEIPT_SCHEMA_VERSION
      || receipt.kind !== "project_pdf_source_revision_receipt"
      || receipt.status !== CANDIDATE_STATUS
      || receipt.feature_state !== FEATURE_STATE
      || !sameExactRef(receipt.project_binding_ref, candidate.project_binding_ref)
      || !sameExactRef(receipt.document_revision_ref, candidate.document_revision_ref)
      || readExactRef(receipt.document_read_grant_ref) === null
      || !isContentId(receipt.knowledge_scope_fingerprint_sha256)
      || !isContentId(receipt.local_admission_fingerprint_sha256)
      || !isContentId(receipt.portable_material_fingerprint_sha256)
      || !isContentId(receipt.relative_locator_fingerprint_sha256)
      || !isContentId(receipt.source_content_sha256)
      || !isContentId(receipt.extraction_text_sha256)
      || !isContentId(receipt.source_revision_binding_sha256)
      || !isContentId(receipt.source_revision_receipt_sha256)
      || !Number.isSafeInteger(receipt.page_count) || receipt.page_count < 1
      || !Number.isSafeInteger(receipt.character_count) || receipt.character_count < 0
      || receipt.project_count !== 1
      || receipt.supersession_status !== "not_evaluated"
      || receipt.document_revision_ref.content_id !== receipt.source_content_sha256) return false;
  const bindingMaterial = {
    feature_state: receipt.feature_state,
    project_binding_ref: receipt.project_binding_ref,
    document_revision_ref: receipt.document_revision_ref,
    document_read_grant_ref: receipt.document_read_grant_ref,
    knowledge_scope_fingerprint_sha256: receipt.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: receipt.local_admission_fingerprint_sha256,
    portable_material_fingerprint_sha256: receipt.portable_material_fingerprint_sha256,
    relative_locator_fingerprint_sha256: receipt.relative_locator_fingerprint_sha256,
    source_content_sha256: receipt.source_content_sha256,
    extraction_text_sha256: receipt.extraction_text_sha256,
    page_count: receipt.page_count,
    character_count: receipt.character_count,
  };
  if (canonicalFingerprint("soulforge.project_pdf_source_revision_binding.v0", bindingMaterial)
      !== receipt.source_revision_binding_sha256) return false;
  const receiptMaterial = without(receipt, "source_revision_receipt_sha256");
  return canonicalFingerprint("soulforge.project_pdf_source_revision_receipt.v0", receiptMaterial)
    === receipt.source_revision_receipt_sha256;
}

function readRagCandidate(ragCandidate, candidate) {
  if (!exactKeys(ragCandidate, RAG_CANDIDATE_FIELDS)
      || ragCandidate.schema_version !== RAG_CANDIDATE_SCHEMA_VERSION
      || ragCandidate.kind !== "project_pdf_rag_candidate"
      || ragCandidate.status !== CANDIDATE_STATUS
      || ragCandidate.feature_state !== FEATURE_STATE
      || !sameExactRef(ragCandidate.project_binding_ref, candidate.project_binding_ref)
      || ragCandidate.source_revision_receipt_sha256
        !== candidate.source_revision_receipt.source_revision_receipt_sha256
      || ragCandidate.body_included !== false
      || ragCandidate.source_truth !== false
      || !ordinaryDataArray(ragCandidate.retrieval_units)
      || ragCandidate.retrieval_units.length !== candidate.source_revision_receipt.page_count) return false;
  let previousPage = 0;
  let totalCharacters = 0;
  for (const unit of ragCandidate.retrieval_units) {
    if (!exactKeys(unit, RETRIEVAL_UNIT_FIELDS)
        || typeof unit.unit_id !== "string" || !/^page-\d{4}$/u.test(unit.unit_id)
        || !Number.isSafeInteger(unit.page_number) || unit.page_number !== previousPage + 1
        || !Number.isSafeInteger(unit.utf16_start) || unit.utf16_start !== 0
        || !Number.isSafeInteger(unit.utf16_end) || unit.utf16_end < 0
        || !isContentId(unit.excerpt_sha256)
        || !ordinaryDataArray(unit.token_fingerprints)
        || unit.token_fingerprints.length > MAX_TOKEN_FINGERPRINTS_PER_UNIT
        || !isContentId(unit.unit_sha256)
        || !sortedUniqueContentIds(unit.token_fingerprints)) return false;
    const material = without(unit, "unit_sha256");
    if (canonicalFingerprint("soulforge.project_pdf_knowledge.unit.v0", material) !== unit.unit_sha256) {
      return false;
    }
    previousPage = unit.page_number;
    totalCharacters += unit.utf16_end;
  }
  return totalCharacters === candidate.source_revision_receipt.character_count;
}

function readThinWikiCandidate(wiki, candidate) {
  if (!exactKeys(wiki, THIN_WIKI_FIELDS)
      || wiki.schema_version !== THIN_WIKI_CANDIDATE_SCHEMA_VERSION
      || wiki.kind !== "project_pdf_thin_wiki_candidate"
      || wiki.status !== CANDIDATE_STATUS
      || wiki.feature_state !== FEATURE_STATE
      || !sameExactRef(wiki.project_binding_ref, candidate.project_binding_ref)
      || wiki.source_revision_receipt_sha256
        !== candidate.source_revision_receipt.source_revision_receipt_sha256
      || !Number.isSafeInteger(wiki.page_count) || wiki.page_count < 1 || wiki.page_count > 2
      || !ordinaryDataArray(wiki.pages) || wiki.pages.length !== wiki.page_count
      || wiki.body_included !== false || wiki.source_truth !== false || wiki.canon !== false) return false;
  return wiki.pages.every((page, index) => readWikiPage(page, index, candidate));
}

function readWikiPage(page, index, candidate) {
  if (!exactKeys(page, WIKI_PAGE_FIELDS)
      || page.page_id !== (index === 0 ? "source-overview" : "source-page-map")
      || page.page_kind !== (index === 0 ? "source_overview" : "source_page_map")
      || !Number.isSafeInteger(page.citation_count) || page.citation_count < 1
      || !Number.isSafeInteger(page.omitted_citation_count) || page.omitted_citation_count < 0
      || !ordinaryDataArray(page.citations) || page.citations.length !== page.citation_count
      || page.citations.length > MAX_WIKI_CITATIONS
      || page.omitted_citation_count
        !== candidate.rag_candidate.retrieval_units.length - page.citations.length
      || (index === 0 && page.citation_count !== 1)) return false;
  return page.citations.every((citation) => readCitation(citation, candidate));
}

function readP5InputCandidate(p5, candidate) {
  if (!exactKeys(p5, P5_INPUT_FIELDS)
      || p5.schema_version !== P5_INPUT_CANDIDATE_SCHEMA_VERSION
      || p5.kind !== "project_pdf_p5_input_candidate"
      || p5.status !== "candidate_not_accepted"
      || p5.feature_state !== FEATURE_STATE
      || !sameExactRef(p5.project_binding_ref, candidate.project_binding_ref)
      || !ordinaryDataArray(p5.source_revision_set) || p5.source_revision_set.length !== 1
      || !isContentId(p5.source_revision_set_sha256)
      || p5.acceptance_allowed !== false || p5.accepted_generation_created !== false
      || !ordinaryDataArray(p5.missing_acceptance_requirements)
      || p5.missing_acceptance_requirements.length !== STATIC_P5_GAPS.length
      || p5.missing_acceptance_requirements.some((value, index) => value !== STATIC_P5_GAPS[index])) {
    return false;
  }
  const source = p5.source_revision_set[0];
  if (!exactKeys(source, P5_SOURCE_REVISION_FIELDS)
      || source.source_revision_receipt_sha256
        !== candidate.source_revision_receipt.source_revision_receipt_sha256
      || !sameExactRef(source.document_revision_ref, candidate.document_revision_ref)) return false;
  return canonicalFingerprint("soulforge.project_pdf_knowledge.p5_input.v0", p5.source_revision_set)
    === p5.source_revision_set_sha256;
}

function readCitation(citation, candidate) {
  if (!exactKeys(citation, CITATION_FIELDS)
      || typeof citation.citation_id !== "string" || !/^citation-page-\d{4}$/u.test(citation.citation_id)
      || citation.source_revision_receipt_sha256
        !== candidate.source_revision_receipt.source_revision_receipt_sha256
      || !sameExactRef(citation.document_revision_ref, candidate.document_revision_ref)
      || !Number.isSafeInteger(citation.page_number) || citation.page_number < 1
      || !Number.isSafeInteger(citation.utf16_start) || citation.utf16_start !== 0
      || !Number.isSafeInteger(citation.utf16_end) || citation.utf16_end < 0
      || !isContentId(citation.excerpt_sha256) || !isContentId(citation.unit_sha256)) return false;
  const unit = candidate.rag_candidate.retrieval_units[citation.page_number - 1];
  return unit !== undefined
    && citation.citation_id === `citation-${unit.unit_id}`
    && citation.utf16_end === unit.utf16_end
    && citation.excerpt_sha256 === unit.excerpt_sha256
    && citation.unit_sha256 === unit.unit_sha256;
}

function buildSourceRevisionReceipt(admitted) {
  const bindingMaterial = {
    feature_state: FEATURE_STATE,
    project_binding_ref: cloneRef(admitted.admission.project_binding_ref),
    document_revision_ref: cloneRef(admitted.admission.document_revision_ref),
    document_read_grant_ref: cloneRef(admitted.admission.document_read_grant_ref),
    knowledge_scope_fingerprint_sha256: admitted.admission.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256:
      admitted.admission.local_admission_fingerprint_sha256,
    portable_material_fingerprint_sha256:
      admitted.admission.portable_material_fingerprint_sha256,
    relative_locator_fingerprint_sha256:
      admitted.admission.relative_locator_fingerprint_sha256,
    source_content_sha256: `sha256:${admitted.source.sha256}`,
    extraction_text_sha256: `sha256:${admitted.extraction.text_sha256}`,
    page_count: admitted.extraction.page_count,
    character_count: admitted.extraction.character_count,
  };
  const sourceRevisionBinding = canonicalFingerprint(
    "soulforge.project_pdf_source_revision_binding.v0",
    bindingMaterial,
  );
  if (sourceRevisionBinding === null) return null;
  const material = {
    schema_version: SOURCE_REVISION_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_source_revision_receipt",
    status: CANDIDATE_STATUS,
    feature_state: FEATURE_STATE,
    ...bindingMaterial,
    source_revision_binding_sha256: sourceRevisionBinding,
    supersession_status: "not_evaluated",
    project_count: 1,
  };
  const receiptDigest = canonicalFingerprint("soulforge.project_pdf_source_revision_receipt.v0", material);
  return receiptDigest === null ? null : deepFreeze({
    ...material,
    source_revision_receipt_sha256: receiptDigest,
  });
}

function buildRetrievalUnits(pages) {
  const units = [];
  for (const page of pages) {
    const fingerprints = tokenFingerprints(page.text, MAX_TOKEN_FINGERPRINTS_PER_UNIT);
    if (fingerprints === null) return null;
    const material = {
      unit_id: `page-${String(page.page_number).padStart(4, "0")}`,
      page_number: page.page_number,
      utf16_start: 0,
      utf16_end: page.text.length,
      excerpt_sha256: `sha256:${digestHex(page.text)}`,
      token_fingerprints: fingerprints,
    };
    const unitSha256 = canonicalFingerprint("soulforge.project_pdf_knowledge.unit.v0", material);
    if (unitSha256 === null) return null;
    units.push(deepFreeze({ ...material, unit_sha256: unitSha256 }));
  }
  return units;
}

function buildRagCandidate(projectRef, sourceReceipt, units) {
  return deepFreeze({
    schema_version: RAG_CANDIDATE_SCHEMA_VERSION,
    kind: "project_pdf_rag_candidate",
    status: CANDIDATE_STATUS,
    feature_state: FEATURE_STATE,
    project_binding_ref: cloneRef(projectRef),
    source_revision_receipt_sha256: sourceReceipt.source_revision_receipt_sha256,
    retrieval_units: units,
    body_included: false,
    source_truth: false,
  });
}

function buildThinWikiCandidate(projectRef, sourceReceipt, documentRef, units) {
  const citations = units.slice(0, MAX_WIKI_CITATIONS).map((unit) => citationFor(
    unit,
    sourceReceipt.source_revision_receipt_sha256,
    documentRef,
  ));
  const overview = [citationFor(
    units[0],
    sourceReceipt.source_revision_receipt_sha256,
    documentRef,
  )];
  if (overview[0] === undefined) return null;
  return deepFreeze({
    schema_version: THIN_WIKI_CANDIDATE_SCHEMA_VERSION,
    kind: "project_pdf_thin_wiki_candidate",
    status: CANDIDATE_STATUS,
    feature_state: FEATURE_STATE,
    project_binding_ref: cloneRef(projectRef),
    source_revision_receipt_sha256: sourceReceipt.source_revision_receipt_sha256,
    page_count: 2,
    pages: [
      {
        page_id: "source-overview",
        page_kind: "source_overview",
        citation_count: overview.length,
        citations: overview,
        omitted_citation_count: units.length - overview.length,
      },
      {
        page_id: "source-page-map",
        page_kind: "source_page_map",
        citation_count: citations.length,
        citations,
        omitted_citation_count: units.length - citations.length,
      },
    ],
    body_included: false,
    source_truth: false,
    canon: false,
  });
}

function buildP5InputCandidate(projectRef, documentRef, receiptDigest) {
  const sourceRevisionSet = [{
    source_revision_receipt_sha256: receiptDigest,
    document_revision_ref: cloneRef(documentRef),
  }];
  const sourceRevisionSetSha256 = canonicalFingerprint(
    "soulforge.project_pdf_knowledge.p5_input.v0",
    sourceRevisionSet,
  );
  return sourceRevisionSetSha256 === null ? null : deepFreeze({
    schema_version: P5_INPUT_CANDIDATE_SCHEMA_VERSION,
    kind: "project_pdf_p5_input_candidate",
    status: "candidate_not_accepted",
    feature_state: FEATURE_STATE,
    project_binding_ref: cloneRef(projectRef),
    source_revision_set: sourceRevisionSet,
    source_revision_set_sha256: sourceRevisionSetSha256,
    acceptance_allowed: false,
    accepted_generation_created: false,
    missing_acceptance_requirements: [...STATIC_P5_GAPS],
  });
}

function citationFor(unit, sourceRevisionReceiptSha256, documentRef) {
  return deepFreeze({
    citation_id: `citation-${unit.unit_id}`,
    source_revision_receipt_sha256: sourceRevisionReceiptSha256,
    document_revision_ref: cloneRef(documentRef),
    page_number: unit.page_number,
    utf16_start: unit.utf16_start,
    utf16_end: unit.utf16_end,
    excerpt_sha256: unit.excerpt_sha256,
    unit_sha256: unit.unit_sha256,
  });
}

function buildHold(blocker) {
  return deepFreeze({
    candidate: null,
    receipt: operationReceipt({
      operation: "build",
      status: "held",
      blocker,
      sourceCount: 0,
      projectCount: 0,
      unitCount: 0,
      searchedUnitCount: 0,
      selectedCitationCount: 0,
    }),
  });
}

function retrievalHold(blocker) {
  return deepFreeze({
    retrieval: null,
    receipt: operationReceipt({
      operation: "retrieve",
      status: "held",
      blocker,
      sourceCount: 0,
      projectCount: 0,
      unitCount: 0,
      searchedUnitCount: 0,
      selectedCitationCount: 0,
    }),
  });
}

function operationReceipt({
  operation,
  status,
  blocker,
  sourceCount,
  projectCount,
  unitCount,
  searchedUnitCount,
  selectedCitationCount,
  provenance = { bound: false },
}) {
  return deepFreeze({
    schema_version: PROJECT_PDF_KNOWLEDGE_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_knowledge_projection_receipt",
    operation,
    status,
    feature_state: FEATURE_STATE,
    route: CANDIDATE_ROUTE,
    blocker,
    source_count: sourceCount,
    project_count: projectCount,
    retrieval_unit_count: unitCount,
    searched_unit_count: searchedUnitCount,
    selected_citation_count: selectedCitationCount,
    provenance,
    effects: effectsZero(),
  });
}

function authorityOff() {
  return Object.fromEntries(AUTHORITY_FIELDS.map((field) => [field, false]));
}

function effectsZero() {
  return Object.fromEntries(EFFECT_FIELDS.map((field) => [field, 0]));
}

function tokenFingerprints(value, limit) {
  if (typeof value !== "string" || value.normalize("NFC") !== value) return null;
  const tokens = new Set(
    value.toLowerCase()
      .split(/[^a-z0-9가-힣_.-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 1 && token.length <= 128),
  );
  const sorted = [...tokens].sort(compareCodePoints).slice(0, limit);
  return sorted
    .map((token) => fingerprintText("soulforge.project_pdf_knowledge.token.v0", token))
    .sort(compareCodePoints);
}

function fingerprintText(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0${value}`, "utf8").digest("hex")}`;
}

function canonicalFingerprint(domain, material) {
  try {
    const canonical = canonicalise(material, insertionOrderRules(material));
    return `sha256:${createHash("sha256").update(`${domain}\0${canonical}`, "utf8").digest("hex")}`;
  } catch {
    return null;
  }
}

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      node.forEach((child) => visit(child, `${path}[]`));
    } else if (node !== null && typeof node === "object") {
      Object.entries(node).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return rules;
}

function snapshotRequestRoot(value, expected) {
  if (!ordinaryDataObject(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== expected.length
      || keys.some((key) => typeof key !== "string" || !expected.includes(key))) return null;
  const output = Object.create(null);
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")
        || descriptor.enumerable !== true) return null;
    Object.defineProperty(output, key, {
      value: descriptor.value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

function snapshotStructured(value, { requireFrozen = false } = {}) {
  const snapshot = snapshotValue(value, {
    seen: new WeakSet(),
    nodes: 0,
    requireFrozen,
  }, 0);
  return snapshot === null ? null : deepFreeze(snapshot);
}

function snapshotValue(value, state, depth) {
  if (depth > MAX_SNAPSHOT_DEPTH || value === null) return null;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return value;
  if (kind === "number" && Number.isSafeInteger(value)) return value;
  if (kind !== "object" || types.isProxy(value)) return null;
  if (state.requireFrozen && !Object.isFrozen(value)) return null;
  if (state.seen.has(value)) return null;
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > MAX_SNAPSHOT_NODES) return null;

  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value")
        || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return null;
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== length + 1) return null;
    const output = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
        return null;
      }
      const child = snapshotValue(descriptor.value, state, depth + 1);
      if (child === null) return null;
      output.push(child);
    }
    return output;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const output = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return null;
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) return null;
    const child = snapshotValue(descriptor.value, state, depth + 1);
    if (child === null) return null;
    Object.defineProperty(output, key, {
      value: child,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
}

function exactKeys(value, expected) {
  if (!ordinaryDataObject(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function ordinaryDataObject(value) {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ordinaryDataArray(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value)
    && Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;
}

function readExactRef(value) {
  if (!exactKeys(value, EXACT_REF_FIELDS)
      || typeof value.entity_id !== "string" || !SAFE_IDENTIFIER.test(value.entity_id)
      || typeof value.revision_id !== "string" || !SAFE_IDENTIFIER.test(value.revision_id)
      || typeof value.content_id !== "string" || !SHA256_CONTENT_ID.test(value.content_id)
      || value.content_hash_alg !== "sha256") return null;
  return value;
}

function sameExactRef(left, right) {
  return readExactRef(left) !== null && readExactRef(right) !== null
    && left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id
    && left.content_hash_alg === right.content_hash_alg;
}

function allFalse(value, fields) {
  return exactKeys(value, fields) && fields.every((field) => value[field] === false);
}

function allZero(value, fields) {
  return exactKeys(value, fields) && fields.every((field) => value[field] === 0);
}

function sortedUniqueContentIds(values) {
  let prior = null;
  for (const value of values) {
    if (!isContentId(value) || (prior !== null && compareCodePoints(prior, value) >= 0)) return false;
    prior = value;
  }
  return true;
}

function isSha256Hex(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function isContentId(value) {
  return typeof value === "string" && SHA256_CONTENT_ID.test(value);
}

function without(value, field) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function digestHex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function closedFrozenData(value, depth) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value !== "object" || types.isProxy(value) || !Object.isFrozen(value)
      || depth >= MAX_ADMITTED_DEPTH) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return false;
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return false;
    if (array && key === "length") continue;
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || !closedFrozenData(descriptor.value, depth + 1)) {
      return false;
    }
  }
  return true;
}

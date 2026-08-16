// The consolidated adversarial characterisation of the project pdf rag tracer
// seam. One pinned launch names one admitted pdf, one question is asked once, and
// the seam either returns one closed, deep frozen, cited extractive answer or
// fails closed with an answer of null and a payload free receipt. Stated here:
// the happy path, deterministic replay, the fixed uncited answer for a question
// that matched nothing, request refusal settled before admission opens a file,
// admission refusal, the hold on a document with no searchable text, the chunk,
// offset and citation boundaries of a long two page document, and the read only
// shape of the source itself.
//
// Everything here is public and synthetic: the same one-page pdf the ingest and
// admission seams are pinned against, a temporary runtime that is removed in
// `finally`, and no private source, workspace payload, network, model, mock,
// callback seam, command line or persistence anywhere. The admission seam and the
// corpus search seam are deliberately not imported and not invoked here: this
// test states what the one tracer call must return, not how it composes them. The
// only file it reads besides its own temporary fixture is the tracer source, as
// text, to pin the surfaces that source may not have.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { canonicalise } from "../engineering_engine/kernel/canonical.mjs";
import { sha256Hex } from "../engineering_engine/kernel/fingerprint.mjs";
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
  selectProjectKnowledgeView,
} from "../shared/project_knowledge_view.mjs";

import {
  PROJECT_PDF_RAG_TRACER_ANSWER_SCHEMA_VERSION,
  PROJECT_PDF_RAG_TRACER_RECEIPT_SCHEMA_VERSION,
  runProjectPdfRagTracer,
} from "./project_pdf_rag_tracer.mjs";

// The same public synthetic one-page PDF the ingest and admission seams are
// pinned against. No project payload, no private source.
const FIXTURE_BASE64 =
  "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjcuMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjcuMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDMwMCAyMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDk5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42h2KMQrDQAwEe71CP7Ckk/ZcBBeBNOkC6oKrw4cLu0jj9+cwWwwzLP3omaQsY8oFrDZznjTt23GxKmfn7yMKeg00YNBQESYh7g6T6qMoCqKaCez+tWG+rPmmV9KH/oHxFqwKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMjAgMDAwMDAgbiAKMDAwMDAwMDQwOSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MTdDM0FDQzI5MDY4QzI5MjU2QzM4NzdFMTRDMzhGQzM+PDhEOENBRUNDNzNGREU3MkRGNDc5NzBGQzM0NUQ3ODNFPl0+PgpzdGFydHhyZWYKNTc2CiUlRU9GCg==";
const FIXTURE_BYTE_COUNT = 850;
const FIXTURE_PDF_SHA256 = "dabb2b0ac21c6506a621f3bfe6d0685e7e3eda2886f205c4ef066c7f656326a3";
// The page text exactly as the extractor reports it, trailing newline included.
// Nothing here trims it: an answer that quotes a repaired excerpt is not quoting
// the page it cites.
const FIXTURE_TEXT = "Soulforge PDF tracer bullet\n";
const FIXTURE_CHARACTER_COUNT = 28;
const FIXTURE_TEXT_SHA256 = "3dceeabc3c008cd7e7700aa1414a0b522cdd091d8f5618b625e0bbbfe7347b86";

// Restated rather than imported: the tracer must keep this launch contract even
// if the admission seam renames one of its own constants.
const LAUNCH_SCHEMA_VERSION = "soulforge.project_pdf_admission_launch.v0";
const READ_GRANT_SCHEMA_VERSION = "soulforge.project_pdf_read_grant.v0";
const READ_GRANT_HASH_DOMAIN = "soulforge.project_pdf_admission.document_read_grant.v0";
const PORTABLE_MATERIAL_HASH_DOMAIN = "soulforge.project_pdf_admission.portable_material.v0";
const RELATIVE_LOCATOR_HASH_DOMAIN = "soulforge.project_pdf_admission.relative_locator.v0";
const READ_GRANT_AUTHORITY_CEILING = "single_pdf_candidate_extraction_only";
const MEDIA_TYPE = "application/pdf";
const RELATIVE_LOCATOR = "documents/tracer.pdf";

// The existing corpus search receipt contract, restated for the same reason.
const SOURCE_TEXT_CORPUS_SEARCH_CONTRACT = "soulforge.source_text_corpus_search.v0";

// The stable ids the tracer must mint. They are derived from the pinned document
// digest and the page/chunk position alone, so the same pdf yields the same
// source and the same chunk on every machine and every run. Nothing is named
// after the admission envelope or after a page label.
const SOURCE_ID = `pdf_${FIXTURE_PDF_SHA256}`;
const CHUNK_ID = `${SOURCE_ID}_p0001_c0001`;
const CITATION_ID = "citation_001";

// One question, asked once. It is never persisted: the answer and the receipt
// carry a domain separated fingerprint and a token count instead.
const QUERY_TEXT = "soulforge tracer bullet";
const QUERY_TOKEN_COUNT = 3;
const QUERY_FINGERPRINT_DOMAIN = "soulforge.project_pdf_rag_tracer.query.v0";
const ANSWER_TEXT_HASH_DOMAIN = "soulforge.project_pdf_rag_tracer.answer_text.v0";

// Deterministic extraction: one citation marker, one space, then the cited page
// text verbatim. No synthesis, no model, no rewriting.
const ANSWER_TEXT = `[${CITATION_ID}] ${FIXTURE_TEXT}`;
const QUERY_FINGERPRINT = `sha256:${sha256Hex(`${QUERY_FINGERPRINT_DOMAIN}\0${QUERY_TEXT}`)}`;
const ANSWER_SHA256 = `sha256:${sha256Hex(`${ANSWER_TEXT_HASH_DOMAIN}\0${ANSWER_TEXT}`)}`;

// The retrieval budgets are the seam's own fixed constants, not a caller knob.
// The public request carries no advisory terms and no evidence bounds, so these
// two values exist here only as the expectation the returned receipts must meet.
const EXPECTED_MAX_EVIDENCE = 3;
const EXPECTED_MAX_PER_SOURCE = 3;

function exactRef(seed) {
  const token = String(seed).padStart(12, "0");
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: `sha256:${String(seed).padStart(64, "0")}`,
    content_hash_alg: "sha256",
  };
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

// Same shape as the canonical fingerprint the Knowledge View computes: the hash
// domain, a NUL separator, then the canonical serialisation of the material.
function canonicalFingerprint(domain, material) {
  const canonical = canonicalise(material, insertionOrderRules(material));
  return `sha256:${sha256Hex(`${domain}\0${canonical}`)}`;
}

const canonicalBytes = (value) => Buffer.from(
  `${canonicalise(value, insertionOrderRules(value))}\n`,
  "utf8",
);

function bindAuthorityGrant(grantDraft) {
  return {
    ...grantDraft,
    grant_ref: {
      ...grantDraft.grant_ref,
      content_id: canonicalFingerprint(PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN, {
        schema_version: grantDraft.schema_version,
        feature_state: grantDraft.feature_state,
        authority_ceiling: grantDraft.authority_ceiling,
        policy_ref: grantDraft.policy_ref,
        project_binding_ref: grantDraft.project_binding_ref,
        project_root_path: grantDraft.project_root_path,
        common_root_path: grantDraft.common_root_path,
        containment_root_path: grantDraft.containment_root_path,
        approved_common_revision_refs: grantDraft.approved_common_revision_refs,
      }),
    },
  };
}

// The read grant ref is the canonical hash of every other grant field, so no
// single field can be swapped without invalidating the grant.
function bindDocumentReadGrant(grantDraft) {
  return {
    ...grantDraft,
    grant_ref: {
      ...grantDraft.grant_ref,
      content_id: canonicalFingerprint(READ_GRANT_HASH_DOMAIN, {
        schema_version: grantDraft.schema_version,
        feature_state: grantDraft.feature_state,
        authority_ceiling: grantDraft.authority_ceiling,
        read_policy_ref: grantDraft.read_policy_ref,
        project_binding_ref: grantDraft.project_binding_ref,
        knowledge_scope_fingerprint_sha256: grantDraft.knowledge_scope_fingerprint_sha256,
        local_admission_fingerprint_sha256: grantDraft.local_admission_fingerprint_sha256,
        relative_locator: grantDraft.relative_locator,
        document_revision_ref: grantDraft.document_revision_ref,
        media_type: grantDraft.media_type,
      }),
    },
  };
}

// Portable: it carries the path-independent scope commitment and no local
// admission observation, so it survives a move to another machine.
function portableMaterialFingerprint(readGrant) {
  return canonicalFingerprint(PORTABLE_MATERIAL_HASH_DOMAIN, {
    project_binding_ref: readGrant.project_binding_ref,
    knowledge_scope_fingerprint_sha256: readGrant.knowledge_scope_fingerprint_sha256,
    read_policy_ref: readGrant.read_policy_ref,
    relative_locator: readGrant.relative_locator,
    document_revision_ref: readGrant.document_revision_ref,
    media_type: readGrant.media_type,
  });
}

function relativeLocatorFingerprint(readGrant) {
  return canonicalFingerprint(RELATIVE_LOCATOR_HASH_DOMAIN, {
    project_binding_ref: readGrant.project_binding_ref,
    relative_locator: readGrant.relative_locator,
    document_revision_ref: readGrant.document_revision_ref,
  });
}

// The real admission fixture, reduced to the one shape this tracer needs: a
// temporary runtime, one pinned launch, one bound read grant and one pinned pdf
// under the admitted project root. Options only reshape the synthetic fixture —
// other document bytes, another locator, another temporary or launch name — and
// every variant is rebuilt from those values, so each one stays validly bound and
// repinned. `cleanup` removes the whole temporary tree, so nothing this test
// writes outlives it.
function admissionFixture(options = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), options.tempPrefix ?? "soulforge-pdf-rag-tracer-"));
  const containmentRoot = join(tempRoot, "workspace");
  const projectRoot = join(containmentRoot, "project");
  const commonRoot = join(containmentRoot, "common");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });

  const projectRef = exactRef(1);
  const request = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    project_binding_refs: [projectRef],
    common_revision_refs: [],
  };
  const authorityGrant = bindAuthorityGrant({
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    feature_state: "off",
    authority_ceiling: "synthetic_validation_only",
    grant_ref: exactRef(2),
    policy_ref: exactRef(3),
    project_binding_ref: projectRef,
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    approved_common_revision_refs: [],
  });

  // The view is consulted here only to obtain the two fingerprints the read
  // grant must commit to. The seam under test performs its own admission.
  const view = selectProjectKnowledgeView(request, authorityGrant, authorityGrant.grant_ref);

  const documentBytes = options.documentBytes ?? Buffer.from(FIXTURE_BASE64, "base64");
  const documentSha256 = sha256Hex(documentBytes);
  const locator = options.relativeLocator ?? RELATIVE_LOCATOR;
  const documentPath = join(projectRoot, ...locator.split("/"));
  mkdirSync(dirname(documentPath), { recursive: true });
  writeFileSync(documentPath, documentBytes);

  const readGrant = bindDocumentReadGrant({
    schema_version: READ_GRANT_SCHEMA_VERSION,
    feature_state: "off",
    authority_ceiling: READ_GRANT_AUTHORITY_CEILING,
    grant_ref: exactRef(11),
    read_policy_ref: exactRef(12),
    project_binding_ref: projectRef,
    knowledge_scope_fingerprint_sha256: view.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: view.local_admission_fingerprint_sha256,
    relative_locator: locator,
    // Nothing else in the grant carries the document digest, so the exact
    // revision content id is the pin the opened bytes must satisfy.
    document_revision_ref: {
      ...exactRef(13),
      content_id: `sha256:${documentSha256}`,
    },
    media_type: MEDIA_TYPE,
  });

  const launch = {
    schema_version: LAUNCH_SCHEMA_VERSION,
    feature_state: "off",
    project_knowledge_view_request: request,
    project_knowledge_view_authority_grant: authorityGrant,
    expected_project_knowledge_view_authority_grant_ref:
      structuredClone(authorityGrant.grant_ref),
    document_read_grant: readGrant,
    expected_document_read_grant_ref: structuredClone(readGrant.grant_ref),
  };
  const launchBytes = canonicalBytes(launch);
  const launchPath = join(tempRoot, options.launchFileName ?? "launch.json");
  writeFileSync(launchPath, launchBytes);

  return {
    documentBytes,
    documentSha256,
    tempRoot,
    projectRoot,
    documentPath,
    locator,
    projectRef,
    readGrant,
    view,
    launchPath,
    expectedLaunchSha256: sha256Hex(launchBytes),
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

// The one citation. It names the exact document revision, the page it was taken
// from, the utf-16 span inside that page's text, the digest of the quoted span
// and the lexical scores that selected it, and it quotes the page text
// untrimmed. `score` is the one value taken from the observed hit: restating it
// here would mean reimplementing the corpus scorer this test must not import,
// and it is asserted separately as a real, positive lexical score.
function expectedCitation(score) {
  return {
    citation_id: CITATION_ID,
    source_id: SOURCE_ID,
    chunk_id: CHUNK_ID,
    document_revision_ref: {
      ...exactRef(13),
      content_id: `sha256:${FIXTURE_PDF_SHA256}`,
    },
    page_number: 1,
    excerpt_start_utf16: 0,
    excerpt_end_utf16: FIXTURE_CHARACTER_COUNT,
    excerpt: FIXTURE_TEXT,
    excerpt_sha256: `sha256:${FIXTURE_TEXT_SHA256}`,
    score,
    matched_query_token_count: QUERY_TOKEN_COUNT,
    matched_advisory_token_count: 0,
  };
}

// The existing corpus search receipt, carried through unchanged. One source, one
// chunk, the hits this question actually produced, and the seam's own fixed
// budgets — which the caller never named — reported back where they can be read.
function expectedRetrievalReceipt({
  hitCount = 1,
  selectedCount = 1,
  queryTokenCount = QUERY_TOKEN_COUNT,
} = {}) {
  return {
    contract: SOURCE_TEXT_CORPUS_SEARCH_CONTRACT,
    searched_source_count: 1,
    searched_chunk_count: 1,
    hit_count: hitCount,
    selected_count: selectedCount,
    max_evidence: EXPECTED_MAX_EVIDENCE,
    max_per_source: EXPECTED_MAX_PER_SOURCE,
    query_token_count: queryTokenCount,
    advisory_token_count: 0,
    exact_query_preserved: true,
    advisory_expansion_applied: false,
    selected_advisory_only_count: 0,
    ranking_basis: "global_bm25_lexical_single_space",
    tie_break_basis: "score_desc_then_source_id_then_chunk_id",
    embeddings_used: false,
    web_search_used: false,
    per_source: [{
      source_id: SOURCE_ID,
      chunk_count: 1,
      hit_count: hitCount,
      selected_count: selectedCount,
    }],
  };
}

function expectedAnswer(state, {
  score = null,
  status = "candidate_answer",
  answerText = ANSWER_TEXT,
  queryFingerprint = QUERY_FINGERPRINT,
  queryTokenCount = QUERY_TOKEN_COUNT,
  citations = [expectedCitation(score)],
  retrievalReceipt = expectedRetrievalReceipt(),
} = {}) {
  return {
    schema_version: PROJECT_PDF_RAG_TRACER_ANSWER_SCHEMA_VERSION,
    kind: "project_pdf_rag_tracer_answer",
    status,
    feature_state: "off",
    route: "validation_only",
    canon_claim_ceiling: "observed",
    query: {
      raw_query_persisted: false,
      query_fingerprint: queryFingerprint,
      query_token_count: queryTokenCount,
    },
    // The answer stays bound to the exact document that was admitted, including
    // the local admission observation the read grant committed to, and to the
    // extraction the cited text actually came out of.
    source_binding: {
      source_id: SOURCE_ID,
      project_binding_ref: state.projectRef,
      document_revision_ref: state.readGrant.document_revision_ref,
      document_read_grant_ref: state.readGrant.grant_ref,
      knowledge_scope_fingerprint_sha256: state.view.knowledge_scope_fingerprint_sha256,
      local_admission_fingerprint_sha256: state.view.local_admission_fingerprint_sha256,
      portable_material_fingerprint_sha256: portableMaterialFingerprint(state.readGrant),
      relative_locator_fingerprint_sha256: relativeLocatorFingerprint(state.readGrant),
      knowledge_view_project_read_allowed: false,
      extraction_engine: "pymupdf",
      extraction_page_count: 1,
      extraction_text_sha256: FIXTURE_TEXT_SHA256,
    },
    response: {
      mode: "deterministic_extractive",
      retrieved_chunk_count: citations.length,
      answer_text: answerText,
      citations,
    },
    retrieval_receipt: retrievalReceipt,
    // A retrieved answer is not a source, not canon, not project state and not an
    // approval, and it is not accepted context or an operational retrieval either:
    // nothing downstream may treat it as any of those.
    authority: {
      source_truth: false,
      canon: false,
      project_state: false,
      approval: false,
      accepted_context: false,
      operational_retrieval: false,
      engine_input_allowed: false,
      activation_allowed: false,
      wiki_write_allowed: false,
      rag_write_allowed: false,
      erp_write_allowed: false,
      taskdriver_allowed: false,
    },
    effects: {
      persistent_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      rag_query_calls: 1,
      wiki_writes: 0,
      engine_calls: 0,
      erp_writes: 0,
    },
  };
}

// The evidence a run that never reached a check may not carry. Every field is the
// null or the false the receipt must report where it verified nothing, so a
// refused run can never read back as a run that got further than it did.
const NO_QUERY_EVIDENCE = Object.freeze({
  raw_query_persisted: false,
  query_fingerprint: null,
  query_token_count: null,
});
const NO_ADMISSION_EVIDENCE = Object.freeze({
  knowledge_view_verified: false,
  knowledge_view_project_read_allowed: false,
  document_read_grant_binding_verified: false,
  project_binding_verified: false,
  local_admission_verified: false,
  portable_material_fingerprint_sha256: null,
  relative_locator_fingerprint_sha256: null,
});
const NO_DOCUMENT_EVIDENCE = Object.freeze({
  pin_verified: false,
  sha256: null,
  byte_count: null,
  page_count: null,
  character_count: null,
  text_sha256: null,
});
const NO_RETRIEVAL_EVIDENCE = Object.freeze({
  searched_source_count: null,
  searched_chunk_count: null,
  hit_count: null,
  selected_count: null,
});
const NO_ANSWER_EVIDENCE = Object.freeze({
  citation_count: null,
  answer_character_count: null,
  answer_sha256: null,
});
const NO_READS = Object.freeze({ launch_files: null, project_documents: null });

// The admission seam's own statement, as the receipt must report it: the view,
// the project binding, the local admission and the read grant binding all held.
function admissionEvidence(state) {
  return {
    knowledge_view_verified: true,
    knowledge_view_project_read_allowed: false,
    document_read_grant_binding_verified: true,
    project_binding_verified: true,
    local_admission_verified: true,
    portable_material_fingerprint_sha256: portableMaterialFingerprint(state.readGrant),
    relative_locator_fingerprint_sha256: relativeLocatorFingerprint(state.readGrant),
  };
}

// The receipt is payload free: every value is a boolean, a count, a fixed enum,
// a domain separated fingerprint or a digest, so no raw query, path, locator,
// project ref, page text or excerpt can ride out on it. The defaults are the one
// passing run over the pinned one-page fixture; a refusal overrides exactly the
// evidence it never reached.
function expectedReceipt(state, {
  result = "PASS",
  blockerCode = null,
  blockerStage = null,
  query = {
    raw_query_persisted: false,
    query_fingerprint: QUERY_FINGERPRINT,
    query_token_count: QUERY_TOKEN_COUNT,
  },
  admission = admissionEvidence(state),
  document = {
    pin_verified: true,
    sha256: `sha256:${FIXTURE_PDF_SHA256}`,
    byte_count: FIXTURE_BYTE_COUNT,
    page_count: 1,
    character_count: FIXTURE_CHARACTER_COUNT,
    text_sha256: `sha256:${FIXTURE_TEXT_SHA256}`,
  },
  retrieval = {
    searched_source_count: 1,
    searched_chunk_count: 1,
    hit_count: 1,
    selected_count: 1,
  },
  answer = {
    citation_count: 1,
    answer_character_count: ANSWER_TEXT.length,
    answer_sha256: ANSWER_SHA256,
  },
  reads = { launch_files: 1, project_documents: 1 },
  ragQueryCalls = 1,
} = {}) {
  return {
    schema_version: PROJECT_PDF_RAG_TRACER_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_rag_tracer_receipt",
    mode: "read_only",
    feature_state: "off",
    route: "validation_only",
    result,
    blocker_code: blockerCode,
    blocker_stage: blockerStage,
    query: { ...query },
    admission: { ...admission },
    document: { ...document },
    retrieval: {
      ...retrieval,
      max_evidence: EXPECTED_MAX_EVIDENCE,
      max_per_source: EXPECTED_MAX_PER_SOURCE,
      advisory_term_count: 0,
      advisory_token_count: 0,
      embeddings_used: false,
      web_search_used: false,
    },
    answer: { ...answer },
    reads: { ...reads },
    persistence: {
      state: "not_requested",
      persistent_file_writes: 0,
    },
    effects: {
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      rag_query_calls: ragQueryCalls,
      wiki_writes: 0,
      engine_calls: 0,
      erp_writes: 0,
      taskdriver_activated: false,
    },
    gates: {
      source_truth_accepted: false,
      canon_accepted: false,
      project_state_accepted: false,
      accepted_context_granted: false,
      operational_retrieval_allowed: false,
      owner_decision_made: false,
      activation_allowed: false,
    },
    canon_claim_ceiling: "observed",
  };
}

// No key anywhere in a receipt may be one of the raw payload names this seam
// handles: a query, a path, a locator, page text, an excerpt, a ref field or a
// raw error, at any depth. Matched exactly rather than by substring, because the
// receipt contract requires `relative_locator_fingerprint_sha256` and
// `answer_sha256` — digests of those things, not the things themselves — and a
// substring rule refuses the very keys the receipt must carry.
const FORBIDDEN_RECEIPT_KEYS = new Set([
  "query_text", "queryText", "raw_query", "question", "prompt",
  "path", "paths", "launch_path", "launchPath", "document_path", "documentPath",
  "root_path", "project_root_path", "common_root_path", "containment_root_path",
  "real_path", "comparable_real_path", "local_path",
  "locator", "relative_locator", "locator_segments", "segments",
  "body", "bytes", "text", "content", "pages", "page_text", "chunk_text", "source_text",
  "excerpt", "excerpts", "answer_text", "citations",
  "message", "messages", "stack", "error", "errors", "cause",
  "entity", "entity_id", "revision", "revision_id", "content_id",
  "ref", "refs", "grant_ref", "policy_ref", "read_policy_ref", "authority_grant_ref",
  "project_binding_ref", "document_revision_ref", "document_read_grant_ref",
]);

function assertDeeplyFrozen(value, trail) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, `${trail} must be frozen`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeeplyFrozen(item, `${trail}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assertDeeplyFrozen(item, `${trail}.${key}`);
  }
}

function assertNoForbiddenKeys(node, trail) {
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    assert.equal(
      FORBIDDEN_RECEIPT_KEYS.has(key), false, `${trail}.${key} must carry no payload`,
    );
    assertNoForbiddenKeys(value, `${trail}.${key}`);
  }
}

test("answers one pinned project pdf question with one cited, closed tracer answer and receipt", async () => {
  const state = admissionFixture();
  try {
    assert.equal(state.documentBytes.byteLength, FIXTURE_BYTE_COUNT);
    assert.equal(sha256Hex(state.documentBytes), FIXTURE_PDF_SHA256);

    // Exactly one tracer call, and exactly three own fields on the request: the
    // pinned launch, its digest, and the question. No advisory terms and no
    // evidence bounds are passed, because a caller that could widen the retrieval
    // budget could widen what an answer is allowed to be grounded on. Those
    // budgets belong to the seam and are only read back off its receipts.
    const request = {
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: QUERY_TEXT,
    };
    assert.deepEqual(Reflect.ownKeys(request), [
      "launchPath",
      "expectedLaunchSha256",
      "queryText",
    ]);

    const { answer, receipt } = await runProjectPdfRagTracer(request);

    // The lexical score is the seam's, not this test's. It still has to be a real
    // positive score: a zero or a placeholder would mean the citation was not
    // selected by the retrieval it claims to report.
    assert.equal(answer.response.citations.length, 1);
    const [citation] = answer.response.citations;
    assert.equal(typeof citation.score, "number");
    assert.equal(Number.isFinite(citation.score) && citation.score > 0, true,
      "the cited chunk must carry the positive lexical score that selected it");

    assert.deepEqual(answer, expectedAnswer(state, { score: citation.score }));
    assert.deepEqual(receipt, expectedReceipt(state));

    // The stable ids, stated on their own: the source is named by the pinned
    // document digest and the chunk by its page and chunk position under it.
    assert.equal(SOURCE_ID, `pdf_${FIXTURE_PDF_SHA256}`);
    assert.equal(CHUNK_ID, `${SOURCE_ID}_p0001_c0001`);
    assert.equal(answer.source_binding.source_id, SOURCE_ID);
    assert.equal(citation.source_id, SOURCE_ID);
    assert.equal(citation.chunk_id, CHUNK_ID);
    assert.equal(citation.chunk_id.startsWith(`${SOURCE_ID}_`), true);
    assert.equal(citation.chunk_id.endsWith("_p0001_c0001"), true);
    assert.equal(answer.retrieval_receipt.per_source[0].source_id, SOURCE_ID);

    // The extraction the cited text came out of, named on the binding itself, so
    // an answer cannot be read back against a different extraction of the same pdf.
    assert.equal(answer.source_binding.extraction_engine, "pymupdf");
    assert.equal(answer.source_binding.extraction_page_count, 1);
    assert.equal(answer.source_binding.extraction_text_sha256, FIXTURE_TEXT_SHA256);

    // The exact untrimmed page text, quoted whole, behind one citation marker.
    assert.equal(citation.excerpt, FIXTURE_TEXT);
    assert.equal(citation.excerpt.endsWith("\n"), true, "the page text stays untrimmed");
    assert.equal(citation.excerpt_end_utf16 - citation.excerpt_start_utf16, FIXTURE_TEXT.length);
    assert.equal(answer.response.answer_text, `[${CITATION_ID}] ${FIXTURE_TEXT}`);

    // The seam's own fixed budgets, observed on both receipts. Nothing in the
    // request named them, so these are the only place they can be read at all.
    assert.equal(answer.retrieval_receipt.max_evidence, EXPECTED_MAX_EVIDENCE);
    assert.equal(answer.retrieval_receipt.max_per_source, EXPECTED_MAX_PER_SOURCE);
    assert.equal(receipt.retrieval.max_evidence, EXPECTED_MAX_EVIDENCE);
    assert.equal(receipt.retrieval.max_per_source, EXPECTED_MAX_PER_SOURCE);
    assert.equal(receipt.retrieval.advisory_term_count, 0);
    assert.equal(answer.retrieval_receipt.advisory_expansion_applied, false);

    assert.deepEqual(Object.keys(answer), [
      "schema_version",
      "kind",
      "status",
      "feature_state",
      "route",
      "canon_claim_ceiling",
      "query",
      "source_binding",
      "response",
      "retrieval_receipt",
      "authority",
      "effects",
    ]);
    assert.deepEqual(Object.keys(answer.source_binding), [
      "source_id",
      "project_binding_ref",
      "document_revision_ref",
      "document_read_grant_ref",
      "knowledge_scope_fingerprint_sha256",
      "local_admission_fingerprint_sha256",
      "portable_material_fingerprint_sha256",
      "relative_locator_fingerprint_sha256",
      "knowledge_view_project_read_allowed",
      "extraction_engine",
      "extraction_page_count",
      "extraction_text_sha256",
    ]);
    assert.deepEqual(Object.keys(answer.response), [
      "mode",
      "retrieved_chunk_count",
      "answer_text",
      "citations",
    ]);
    assert.deepEqual(Object.keys(citation), [
      "citation_id",
      "source_id",
      "chunk_id",
      "document_revision_ref",
      "page_number",
      "excerpt_start_utf16",
      "excerpt_end_utf16",
      "excerpt",
      "excerpt_sha256",
      "score",
      "matched_query_token_count",
      "matched_advisory_token_count",
    ]);
    assert.deepEqual(Object.keys(receipt), [
      "schema_version",
      "kind",
      "mode",
      "feature_state",
      "route",
      "result",
      "blocker_code",
      "blocker_stage",
      "query",
      "admission",
      "document",
      "retrieval",
      "answer",
      "reads",
      "persistence",
      "effects",
      "gates",
      "canon_claim_ceiling",
    ]);

    // Every authority and every gate is false, and the only effect is the one
    // retrieval this call actually made.
    assert.deepEqual(
      Object.values(answer.authority).filter((granted) => granted !== false), [],
    );
    assert.deepEqual(Object.values(receipt.gates).filter((passed) => passed !== false), []);
    assert.equal(answer.effects.rag_query_calls, 1);
    assert.equal(receipt.effects.rag_query_calls, 1);
    assert.deepEqual(
      Object.entries(answer.effects).filter(([key, value]) => key !== "rag_query_calls" && value !== 0),
      [],
    );
    assert.deepEqual(
      Object.entries(receipt.effects).filter(([key, value]) => (
        key !== "rag_query_calls" && value !== 0 && value !== false
      )),
      [],
    );

    // Payload free, by key and by content: only fingerprints, counts, the answer
    // hash, false gates, zero effects and the observed claim ceiling.
    assertNoForbiddenKeys(receipt, "receipt");
    const serialisedReceipt = JSON.stringify(receipt);
    for (const payload of [
      QUERY_TEXT,
      FIXTURE_TEXT.trim(),
      ANSWER_TEXT.trim(),
      RELATIVE_LOCATOR,
      state.launchPath,
      state.tempRoot,
      state.projectRoot,
      state.projectRef.entity_id,
      state.readGrant.grant_ref.entity_id,
      state.readGrant.grant_ref.content_id,
    ]) {
      assert.equal(
        serialisedReceipt.includes(payload), false, "the receipt must carry no raw payload",
      );
    }

    // The question itself is never carried on the answer either: only its
    // domain separated fingerprint and its token count.
    const serialisedAnswer = JSON.stringify(answer);
    assert.equal(serialisedAnswer.includes(QUERY_TEXT), false, "the raw query must not be carried");
    assert.equal(answer.query.query_fingerprint, QUERY_FINGERPRINT);
    assert.equal(receipt.query.query_fingerprint, QUERY_FINGERPRINT);

    // The ids are the tracer's own stable ones, not the admission envelope's kind
    // and not a page label.
    assert.equal(serialisedAnswer.includes("admitted_project_pdf"), false);
    assert.equal(serialisedAnswer.includes("page_001"), false);
    assert.equal(serialisedReceipt.includes("admitted_project_pdf"), false);
    assert.equal(serialisedReceipt.includes("page_001"), false);

    assertDeeplyFrozen(answer, "project_pdf_rag_tracer_answer");
    assertDeeplyFrozen(receipt, "project_pdf_rag_tracer_receipt");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- adversarial

// The fixed, payload free blockers, restated rather than imported: a seam that
// renamed one of them would still have to keep this contract.
const REQUEST_INVALID = Object.freeze({
  code: "PROJECT_PDF_RAG_TRACER_REQUEST_INVALID",
  stage: "request",
});
const ADMISSION_REFUSED = Object.freeze({
  code: "PROJECT_PDF_RAG_TRACER_ADMISSION_REFUSED",
  stage: "admission",
});
const NO_SEARCHABLE_TEXT = Object.freeze({
  code: "PROJECT_PDF_RAG_TRACER_NO_SEARCHABLE_TEXT",
  stage: "source_text",
});

// The seam's own fixed bounds. Nothing in the request names them, so they exist
// here only as the expectation the returned answers and receipts must meet.
const MAX_QUERY_CHARS = 8000;
const MAX_CHUNK_CODE_UNITS = 8000;

// A question that matched nothing is still an answer: one fixed sentence, no
// citation, and no trace of what was asked.
const NO_HIT_QUERY = "quixotrophic zymurgical";
const NO_HIT_QUERY_TOKEN_COUNT = 2;
const NO_HIT_ANSWER_TEXT = "No admitted project pdf text chunk matched this question lexically.";
const NO_HIT_QUERY_FINGERPRINT =
  `sha256:${sha256Hex(`${QUERY_FINGERPRINT_DOMAIN}\0${NO_HIT_QUERY}`)}`;
const NO_HIT_ANSWER_SHA256 =
  `sha256:${sha256Hex(`${ANSWER_TEXT_HASH_DOMAIN}\0${NO_HIT_ANSWER_TEXT}`)}`;

// Markers this test plants exactly where a leaky seam would carry one out: in the
// temporary directory name, in the launch file name, in the locator, in the
// question, and inside the caller code an exotic request would run.
const TEMP_MARKER = "soulforge-marker-temp-9e04-";
const LAUNCH_MARKER = "soulforge-marker-launch-1c68";
const ABSENT_LAUNCH_MARKER = "soulforge-marker-absent-launch-4b19";
const LOCATOR_MARKER = "soulforge-marker-locator-7c1e";
const QUERY_MARKER = "soulforge-marker-query-2ad5";
const PROXY_MARKER = "soulforge-marker-proxy-8f30";
const ACCESSOR_MARKER = "soulforge-marker-accessor-6b52";

// Retrieval knobs, writer surfaces and root overrides. The public request carries
// three own fields, so every one of these must lose to the same fixed refusal: a
// caller that could widen the evidence budget could widen what an answer is
// allowed to be grounded on.
const FORBIDDEN_REQUEST_FIELDS = [
  "sources",
  "projectCode",
  "commonSources",
  "advisoryTerms",
  "writer",
  "persist",
  "model",
  "provider",
  "repoRoot",
  "maxEvidence",
  "maxPerSource",
  "sourceIds",
  "onProgress",
  "signal",
  "env",
];

// The whole request refusal, as one override: nothing was fingerprinted, nothing
// was admitted, nothing was read and nothing was searched.
const REFUSED_REQUEST = Object.freeze({
  result: "HOLD",
  blockerCode: REQUEST_INVALID.code,
  blockerStage: REQUEST_INVALID.stage,
  query: NO_QUERY_EVIDENCE,
  admission: NO_ADMISSION_EVIDENCE,
  document: NO_DOCUMENT_EVIDENCE,
  retrieval: NO_RETRIEVAL_EVIDENCE,
  answer: NO_ANSWER_EVIDENCE,
  reads: NO_READS,
  ragQueryCalls: 0,
});

// In unicode mode a well formed pair is one code point, so this matches a lone
// surrogate alone: a chunk cut between the two halves of a pair.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

// Every file under the fixture, by relative name and content digest. A read only
// seam may not add, remove, move or rewrite one of them.
function treeSnapshot(root) {
  const entries = [];
  const walk = (directory, trail) => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name);
      const relative = `${trail}${name}`;
      if (statSync(full).isDirectory()) {
        entries.push([`${relative}/`, "directory"]);
        walk(full, `${relative}/`);
        continue;
      }
      entries.push([relative, sha256Hex(readFileSync(full))]);
    }
  };
  walk(root, "");
  return entries;
}

// A refusal has no answer at all. A partial answer would still be an answer, so
// the answer stays null and only the payload free receipt is returned.
function assertClosedHold(result, expected) {
  assert.equal(result.answer, null, "a refusal must carry no answer");
  assert.deepEqual(result.receipt, expected);
  assert.equal(Object.isFrozen(result), true, "the returned result must be frozen");
  assertDeeplyFrozen(result.receipt, "project_pdf_rag_tracer_receipt");
}

// Payload free by key and by content: no planted marker, no raw question, no
// path and no locator may appear anywhere in a receipt.
function assertPayloadFreeReceipt(receipt, markers) {
  assertNoForbiddenKeys(receipt, "receipt");
  const serialised = JSON.stringify(receipt);
  for (const marker of markers) {
    assert.equal(
      serialised.includes(marker), false, "the receipt must carry no raw payload",
    );
  }
}

// ---------------------------------------------------------------- synthetic pdf

// A deterministic, public, ascii only pdf writer. It exists so two boundaries
// this seam owns — a page with no text at all, and a page longer than one chunk —
// can be observed through the real extractor instead of through a stub or a
// test-only production seam. No project payload, no private source, and the same
// input always yields the same bytes.
const PDF_FONT_SIZE = 8;
const PDF_LEADING = 12;
const PDF_LEFT_MARGIN = 36;

function pdfContentStream(lines, height) {
  if (lines.length === 0) return "";
  const head = `BT\n/F1 ${PDF_FONT_SIZE} Tf\n${PDF_LEADING} TL\n`
    + `${PDF_LEFT_MARGIN} ${height - PDF_LEADING * 2} Td\n`;
  return `${head}${lines.map((line) => `(${line}) Tj\nT*\n`).join("")}ET\n`;
}

function syntheticPdf(pages) {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    `<</Type/Pages/Count ${pages.length}/Kids[${
      pages.map((page, index) => `${4 + index * 2} 0 R`).join(" ")}]>>`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
  ];
  pages.forEach((page, index) => {
    objects.push(
      `<</Type/Page/MediaBox[0 0 ${page.width} ${page.height}]/Rotate 0`
      + `/Resources<</Font<</F1 3 0 R>>>>/Parent 2 0 R/Contents ${5 + index * 2} 0 R>>`,
    );
    const stream = pdfContentStream(page.lines, page.height);
    objects.push(`<</Length ${stream.length}>>\nstream\n${stream}endstream`);
  });

  let body = "%PDF-1.7\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  const pdf = `${body}${xref}trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n`
    + `startxref\n${xrefOffset}\n%%EOF\n`;
  // Ascii only, so one code unit is one byte and every offset written above is
  // the byte offset it claims to be.
  assert.equal(Buffer.byteLength(pdf, "utf8"), pdf.length, "the synthetic pdf must stay ascii");
  return Buffer.from(pdf, "ascii");
}

// One long page and one short one. Every filler token is distinct, so each marker
// below is quoted by exactly one chunk and nothing else in the document repeats
// it. Page one is sized well past one chunk and well inside two.
const PAGE_ONE_WIDTH = 612;
const PAGE_ONE_HEIGHT = 3000;
const PAGE_ONE_LINE_COUNT = 240;
const PAGE_ONE_TOKENS_PER_LINE = 8;
const PAGE_ONE_HEAD_MARKER = "markerheadalpha";
const PAGE_ONE_TAIL_MARKER = "markertailbeta";
const PAGE_TWO_MARKER = "markerpagetwogamma";
const PAGE_TWO_LINES = ["page two opening line", PAGE_TWO_MARKER, "page two closing line"];
// Three markers, one per chunk, so the seam's own fixed evidence budget of three
// selects every chunk at once and every boundary becomes observable.
const BOUNDARY_QUERY = `${PAGE_ONE_HEAD_MARKER} ${PAGE_ONE_TAIL_MARKER} ${PAGE_TWO_MARKER}`;

function pageOneLines() {
  const lines = [];
  for (let line = 0; line < PAGE_ONE_LINE_COUNT; line += 1) {
    const tokens = [];
    for (let token = 0; token < PAGE_ONE_TOKENS_PER_LINE; token += 1) {
      tokens.push(`w${String(line * PAGE_ONE_TOKENS_PER_LINE + token).padStart(4, "0")}`);
    }
    if (line === 0) tokens[0] = PAGE_ONE_HEAD_MARKER;
    if (line === PAGE_ONE_LINE_COUNT - 1) tokens[tokens.length - 1] = PAGE_ONE_TAIL_MARKER;
    lines.push(tokens.join(" "));
  }
  return lines;
}

// ---------------------------------------------------------------- replay

// Same pinned launch, same pinned document, same question: same answer and same
// receipt, and the fixture is exactly as it was found. A seam that carried state
// between calls, or that wrote anything at all, would fail one of these.
test("replays one pinned question deterministically and leaves the fixture untouched", async () => {
  const state = admissionFixture();
  try {
    const before = treeSnapshot(state.tempRoot);
    const launchDigest = sha256Hex(readFileSync(state.launchPath));
    const documentDigest = sha256Hex(readFileSync(state.documentPath));
    const request = () => ({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: QUERY_TEXT,
    });

    const first = await runProjectPdfRagTracer(request());
    const second = await runProjectPdfRagTracer(request());

    assert.deepEqual(first, second, "the same pinned question must replay identically");
    assert.notEqual(first, second, "each call must build a fresh result");
    assert.notEqual(first.answer, second.answer, "each call must build a fresh answer");
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(second), true);
    assertDeeplyFrozen(first, "first_result");
    assertDeeplyFrozen(second, "second_result");

    assert.equal(sha256Hex(readFileSync(state.launchPath)), launchDigest);
    assert.equal(sha256Hex(readFileSync(state.documentPath)), documentDigest);
    assert.equal(sha256Hex(readFileSync(state.documentPath)), state.documentSha256);
    assert.deepEqual(treeSnapshot(state.tempRoot), before, "nothing under the fixture may change");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- no hit

// The question was searched and missed. That is still one real retrieval and one
// closed answer: one fixed sentence, no citation, and no trace of what was asked.
test("answers a question that matched nothing with the fixed uncited answer", async () => {
  const state = admissionFixture();
  try {
    const { answer, receipt } = await runProjectPdfRagTracer({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: NO_HIT_QUERY,
    });

    assert.deepEqual(answer, expectedAnswer(state, {
      status: "no_source_text_hit",
      answerText: NO_HIT_ANSWER_TEXT,
      queryFingerprint: NO_HIT_QUERY_FINGERPRINT,
      queryTokenCount: NO_HIT_QUERY_TOKEN_COUNT,
      citations: [],
      retrievalReceipt: expectedRetrievalReceipt({
        hitCount: 0,
        selectedCount: 0,
        queryTokenCount: NO_HIT_QUERY_TOKEN_COUNT,
      }),
    }));
    assert.deepEqual(receipt, expectedReceipt(state, {
      query: {
        raw_query_persisted: false,
        query_fingerprint: NO_HIT_QUERY_FINGERPRINT,
        query_token_count: NO_HIT_QUERY_TOKEN_COUNT,
      },
      retrieval: {
        searched_source_count: 1,
        searched_chunk_count: 1,
        hit_count: 0,
        selected_count: 0,
      },
      answer: {
        citation_count: 0,
        answer_character_count: NO_HIT_ANSWER_TEXT.length,
        answer_sha256: NO_HIT_ANSWER_SHA256,
      },
    }));

    assert.equal(answer.status, "no_source_text_hit");
    assert.equal(answer.response.answer_text, NO_HIT_ANSWER_TEXT);
    assert.deepEqual(answer.response.citations, []);
    assert.equal(receipt.result, "PASS");
    assert.equal(receipt.blocker_code, null);
    assert.equal(receipt.blocker_stage, null);
    assert.equal(answer.effects.rag_query_calls, 1, "one real retrieval still ran");
    assert.equal(receipt.effects.rag_query_calls, 1);
    assert.deepEqual(receipt.reads, { launch_files: 1, project_documents: 1 });

    assertPayloadFreeReceipt(receipt, [
      NO_HIT_QUERY, RELATIVE_LOCATOR, state.launchPath, state.tempRoot,
    ]);
    assert.equal(
      JSON.stringify(answer).includes(NO_HIT_QUERY), false, "the raw query must not be carried",
    );
    assertDeeplyFrozen(answer, "project_pdf_rag_tracer_answer");
    assertDeeplyFrozen(receipt, "project_pdf_rag_tracer_receipt");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- request

// Every launch named below does not exist, so a refusal that reports the request
// blocker proves the request was closed before admission was started and before
// one file was opened. A refusal that reported the admission blocker instead
// would mean the request reached a reader first.
test("refuses every malformed request before admission opens one file", async () => {
  const state = admissionFixture();
  try {
    const absentLaunch = join(state.tempRoot, `${ABSENT_LAUNCH_MARKER}.json`);
    const before = treeSnapshot(state.tempRoot);
    const ok = () => ({
      launchPath: absentLaunch,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: QUERY_TEXT,
    });
    const markers = [
      ABSENT_LAUNCH_MARKER, PROXY_MARKER, ACCESSOR_MARKER,
      QUERY_TEXT, absentLaunch, state.tempRoot, RELATIVE_LOCATOR,
    ];
    const refuse = async (request) => {
      const result = await runProjectPdfRagTracer(request);
      assertClosedHold(result, expectedReceipt(state, REFUSED_REQUEST));
      assert.equal(result.receipt.blocker_code, REQUEST_INVALID.code);
      assert.equal(result.receipt.blocker_stage, REQUEST_INVALID.stage);
      assert.equal(result.receipt.effects.rag_query_calls, 0, "nothing may be searched");
      assert.deepEqual(result.receipt.reads, NO_READS, "nothing may be read");
      assertPayloadFreeReceipt(result.receipt, markers);
      return result;
    };

    // An empty question is not a question, and one past the seam's own cap is
    // refused on the cap alone.
    await refuse({ ...ok(), queryText: "" });
    await refuse({ ...ok(), queryText: "q".repeat(MAX_QUERY_CHARS + 1) });
    await refuse({ ...ok(), queryText: 7 });
    await refuse({ ...ok(), queryText: null });
    await refuse({ ...ok(), launchPath: "" });
    await refuse({ ...ok(), launchPath: 7 });
    await refuse({ ...ok(), expectedLaunchSha256: state.expectedLaunchSha256.toUpperCase() });
    await refuse({ ...ok(), expectedLaunchSha256: state.expectedLaunchSha256.slice(0, 63) });
    await refuse({ ...ok(), expectedLaunchSha256: `sha256:${state.expectedLaunchSha256}` });
    await refuse({ ...ok(), expectedLaunchSha256: ` ${state.expectedLaunchSha256}` });
    await refuse({ ...ok(), expectedLaunchSha256: null });

    // Exactly three own fields, no more and no fewer.
    await refuse({ launchPath: absentLaunch, expectedLaunchSha256: state.expectedLaunchSha256 });
    await refuse({ queryText: QUERY_TEXT });
    await refuse({});
    await refuse(null);
    await refuse("launch");
    await refuse(7);
    await refuse([absentLaunch, state.expectedLaunchSha256, QUERY_TEXT]);

    // No retrieval knob, no writer surface and no root override may ride in
    // beside the three, under any name and under any key type.
    for (const field of FORBIDDEN_REQUEST_FIELDS) {
      await refuse({ ...ok(), [field]: "ignored" });
    }
    await refuse({ ...ok(), [Symbol("extra")]: "ignored" });

    // An accessor is caller code. A refused request must never run one, so the
    // marker it would have returned can never have been read at all.
    for (const key of ["launchPath", "expectedLaunchSha256", "queryText"]) {
      let reads = 0;
      const accessor = { ...ok() };
      delete accessor[key];
      Object.defineProperty(accessor, key, {
        enumerable: true,
        configurable: true,
        get() { reads += 1; return ACCESSOR_MARKER; },
      });
      await refuse(accessor);
      assert.equal(reads, 0, "a refused request must not invoke one accessor");
    }

    // A root whose prototype is not this seam's own request shape.
    class RequestLike {
      constructor(fields) { Object.assign(this, fields); }
    }
    await refuse(new RequestLike(ok()));
    const dateRoot = new Date(0);
    Object.assign(dateRoot, ok());
    assert.equal(Reflect.ownKeys(dateRoot).length, 3);
    await refuse(dateRoot);
    const inherited = Object.create({ inheritedMarker: ACCESSOR_MARKER });
    Object.assign(inherited, ok());
    await refuse(inherited);

    // A proxy answers every later reflection with caller code and a revoked one
    // cannot answer at all, so the root must lose before the first trap capable
    // read. Both handlers are proven live and marked first, and the counter is
    // reset after that setup probe, so the zeros below are traps that could have
    // run during the refusal and did not.
    let traps = 0;
    const marked = () => { traps += 1; return PROXY_MARKER; };
    const handler = {
      get: marked,
      has: () => { traps += 1; return true; },
      getOwnPropertyDescriptor: () => {
        traps += 1;
        return { value: PROXY_MARKER, writable: true, enumerable: true, configurable: true };
      },
      ownKeys: () => {
        traps += 1;
        return ["launchPath", "expectedLaunchSha256", "queryText"];
      },
      getPrototypeOf: () => { traps += 1; return Object.prototype; },
    };

    const live = new Proxy(ok(), handler);
    assert.equal(live.queryText, PROXY_MARKER, "the trap must be installed");
    assert.equal(traps, 1, "the trap must be observable before the refusal");
    traps = 0;
    await refuse(live);
    assert.equal(traps, 0, "a refused request must not run one proxy trap");

    const { proxy, revoke } = Proxy.revocable(ok(), handler);
    assert.equal(proxy.queryText, PROXY_MARKER, "the trap must be installed");
    revoke();
    traps = 0;
    await refuse(proxy);
    assert.equal(traps, 0, "a revoked request must not run one proxy trap");

    // Nothing was opened, nothing was searched, and nothing on disk moved.
    assert.deepEqual(treeSnapshot(state.tempRoot), before, "a refused request must touch no file");
  } finally {
    state.cleanup();
  }
});

// A bare null prototype root. Three own data fields on an ordinary object is this
// seam's whole request contract, so a root whose prototype was replaced is not
// that object and must lose before admission. Stated on its own because the
// adjacent ingest seam accepts `Object.create(null)`: the seam that answers a
// question over one pinned document may not be the looser of the two.
test("refuses a bare null prototype request root", async () => {
  const state = admissionFixture();
  try {
    const absentLaunch = join(state.tempRoot, `${ABSENT_LAUNCH_MARKER}.json`);
    const before = treeSnapshot(state.tempRoot);
    const bare = Object.create(null);
    bare.launchPath = absentLaunch;
    bare.expectedLaunchSha256 = state.expectedLaunchSha256;
    bare.queryText = QUERY_TEXT;
    assert.equal(Object.getPrototypeOf(bare), null);
    assert.equal(Reflect.ownKeys(bare).length, 3);

    const result = await runProjectPdfRagTracer(bare);
    assertClosedHold(result, expectedReceipt(state, REFUSED_REQUEST));
    assertPayloadFreeReceipt(result.receipt, [ABSENT_LAUNCH_MARKER, QUERY_TEXT, absentLaunch]);
    assert.deepEqual(treeSnapshot(state.tempRoot), before, "a refused request must touch no file");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- admission

// The same nonexistent launch as above, now behind a syntactically exact request.
// The refusal must move to the admission stage, must not throw, and must carry
// none of the path, the question, the locator or the admission seam's own reason.
test("holds on a refused admission without echoing the launch it was handed", async () => {
  const state = admissionFixture();
  try {
    const absentLaunch = join(state.tempRoot, `${ABSENT_LAUNCH_MARKER}.json`);
    const before = treeSnapshot(state.tempRoot);
    const refusedAdmission = (queryText) => expectedReceipt(state, {
      result: "HOLD",
      blockerCode: ADMISSION_REFUSED.code,
      blockerStage: ADMISSION_REFUSED.stage,
      query: {
        raw_query_persisted: false,
        query_fingerprint: `sha256:${sha256Hex(`${QUERY_FINGERPRINT_DOMAIN}\0${queryText}`)}`,
        query_token_count: null,
      },
      admission: NO_ADMISSION_EVIDENCE,
      document: NO_DOCUMENT_EVIDENCE,
      retrieval: NO_RETRIEVAL_EVIDENCE,
      answer: NO_ANSWER_EVIDENCE,
      reads: NO_READS,
      ragQueryCalls: 0,
    });
    const markers = [
      ABSENT_LAUNCH_MARKER, absentLaunch, state.tempRoot, state.projectRoot,
      QUERY_TEXT, RELATIVE_LOCATOR, "unreadable", "ENOENT", "ProjectPdfAdmissionError",
    ];

    const absent = await runProjectPdfRagTracer({
      launchPath: absentLaunch,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: QUERY_TEXT,
    });
    assertClosedHold(absent, refusedAdmission(QUERY_TEXT));
    assertPayloadFreeReceipt(absent.receipt, markers);

    // The request cap is exactly 8000, so the question at the cap is a question:
    // it passes the request gate and is refused by admission instead.
    const boundary = "q".repeat(MAX_QUERY_CHARS);
    const atCap = await runProjectPdfRagTracer({
      launchPath: absentLaunch,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: boundary,
    });
    assertClosedHold(atCap, refusedAdmission(boundary));
    assertPayloadFreeReceipt(atCap.receipt, [...markers, boundary]);

    // A launch that does exist but is pinned to other bytes is the same refusal,
    // reported the same way and carrying the same nothing.
    const wrongPin = await runProjectPdfRagTracer({
      launchPath: state.launchPath,
      expectedLaunchSha256: "0".repeat(64),
      queryText: QUERY_TEXT,
    });
    assertClosedHold(wrongPin, refusedAdmission(QUERY_TEXT));
    assertPayloadFreeReceipt(wrongPin.receipt, [...markers, state.launchPath]);

    assert.deepEqual(treeSnapshot(state.tempRoot), before, "a refused admission must write nothing");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- source text

// A real, public, synthetic pdf whose one page carries no text at all. It is
// admitted and read — the counted read proves that — and then the seam holds
// before it searches, because there is nothing to search.
test("holds on an admitted pdf whose only page carries no searchable text", async () => {
  const documentBytes = syntheticPdf([{ width: 300, height: 200, lines: [] }]);
  const state = admissionFixture({ documentBytes });
  try {
    const before = treeSnapshot(state.tempRoot);
    const result = await runProjectPdfRagTracer({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: QUERY_TEXT,
    });

    assertClosedHold(result, expectedReceipt(state, {
      result: "HOLD",
      blockerCode: NO_SEARCHABLE_TEXT.code,
      blockerStage: NO_SEARCHABLE_TEXT.stage,
      query: {
        raw_query_persisted: false,
        query_fingerprint: QUERY_FINGERPRINT,
        query_token_count: null,
      },
      document: {
        pin_verified: true,
        sha256: `sha256:${state.documentSha256}`,
        byte_count: documentBytes.byteLength,
        page_count: 1,
        character_count: 0,
        text_sha256: `sha256:${sha256Hex("")}`,
      },
      retrieval: NO_RETRIEVAL_EVIDENCE,
      answer: NO_ANSWER_EVIDENCE,
      ragQueryCalls: 0,
    }));

    assert.deepEqual(
      result.receipt.reads, { launch_files: 1, project_documents: 1 },
      "the admission read is counted exactly once",
    );
    assert.equal(
      result.receipt.effects.rag_query_calls, 0, "no retrieval may run over no text",
    );
    assertPayloadFreeReceipt(result.receipt, [QUERY_TEXT, RELATIVE_LOCATOR, state.tempRoot]);
    assert.deepEqual(treeSnapshot(state.tempRoot), before);
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- boundaries

// A real two page pdf whose first page extracts to more than one chunk. The three
// markers are one per chunk, so the seam's own fixed evidence budget of three
// selects every chunk at once: every boundary below is read off the cited spans
// themselves, and the extracted pages are reconstructed from those spans rather
// than predicted, so nothing here depends on guessing the extractor's output.
test("cuts a long page at the fixed bound, never across a page, and cites the exact local span", async () => {
  const documentBytes = syntheticPdf([
    { width: PAGE_ONE_WIDTH, height: PAGE_ONE_HEIGHT, lines: pageOneLines() },
    { width: PAGE_ONE_WIDTH, height: 200, lines: PAGE_TWO_LINES },
  ]);
  const state = admissionFixture({ documentBytes });
  try {
    const sourceId = `pdf_${state.documentSha256}`;
    const { answer, receipt } = await runProjectPdfRagTracer({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: BOUNDARY_QUERY,
    });

    assert.notEqual(answer, null, "the two page fixture must admit and answer");
    assert.equal(receipt.result, "PASS");
    assert.equal(receipt.document.page_count, 2);
    assert.equal(answer.source_binding.extraction_page_count, 2);
    assert.equal(answer.source_binding.source_id, sourceId);
    assert.equal(
      receipt.retrieval.searched_chunk_count, 3,
      "page one must split into exactly two chunks and page two into one",
    );
    assert.equal(answer.retrieval_receipt.searched_chunk_count, 3);
    assert.equal(answer.retrieval_receipt.per_source[0].chunk_count, 3);
    assert.equal(
      answer.response.citations.length, 3,
      "the three marked chunks must all be cited, so every boundary is observable",
    );

    const byChunkId = new Map(answer.response.citations.map((cited) => [cited.chunk_id, cited]));
    const first = byChunkId.get(`${sourceId}_p0001_c0001`);
    const second = byChunkId.get(`${sourceId}_p0001_c0002`);
    const third = byChunkId.get(`${sourceId}_p0002_c0001`);
    assert.ok(first, "page one must carry a first chunk at ordinal one");
    assert.ok(second, "page one must carry a second chunk at ordinal two");
    assert.ok(third, "page two must restart at ordinal one");

    // Page local offsets: page one starts at zero and is cut at the fixed bound,
    // page two restarts at ordinal one and at offset zero.
    assert.equal(first.page_number, 1);
    assert.equal(second.page_number, 1);
    assert.equal(third.page_number, 2);
    assert.equal(first.excerpt_start_utf16, 0);
    assert.equal(first.excerpt_end_utf16, MAX_CHUNK_CODE_UNITS);
    assert.equal(second.excerpt_start_utf16, MAX_CHUNK_CODE_UNITS);
    assert.equal(third.excerpt_start_utf16, 0);

    for (const cited of answer.response.citations) {
      assert.equal(cited.source_id, sourceId);
      assert.equal(
        cited.excerpt.length <= MAX_CHUNK_CODE_UNITS, true, "no excerpt may pass the fixed bound",
      );
      assert.equal(cited.excerpt.length, cited.excerpt_end_utf16 - cited.excerpt_start_utf16);
      assert.equal(cited.excerpt_sha256, `sha256:${sha256Hex(cited.excerpt)}`);
      assert.equal(
        LONE_SURROGATE.test(cited.excerpt), false, "a chunk may not be cut inside a surrogate pair",
      );
      assert.deepEqual(cited.document_revision_ref, state.readGrant.document_revision_ref);
      assert.equal(cited.matched_advisory_token_count, 0);
      assert.equal(Number.isFinite(cited.score) && cited.score > 0, true);
      assert.equal(cited.chunk_id.startsWith(`${sourceId}_p`), true);
    }
    assert.deepEqual(
      answer.response.citations.map((cited) => cited.citation_id),
      ["citation_001", "citation_002", "citation_003"],
    );

    // The two page one chunks reconstruct page one exactly, and the three
    // together reconstruct the extraction this answer says it quoted.
    const pageOne = `${first.excerpt}${second.excerpt}`;
    const pageTwo = third.excerpt;
    assert.equal(
      pageOne.length > MAX_CHUNK_CODE_UNITS, true, "page one must be longer than one chunk",
    );
    assert.equal(pageTwo.length > 0, true, "page two must carry text of its own");
    assert.equal(second.excerpt_end_utf16, pageOne.length);
    assert.equal(third.excerpt_end_utf16, pageTwo.length);
    assert.equal(receipt.document.character_count, pageOne.length + pageTwo.length);
    assert.equal(answer.source_binding.extraction_text_sha256, sha256Hex(`${pageOne}${pageTwo}`));
    assert.equal(receipt.document.text_sha256, `sha256:${sha256Hex(`${pageOne}${pageTwo}`)}`);

    // A chunk never crosses a page: each marker is quoted by exactly one chunk,
    // and the page two chunk carries nothing of page one.
    assert.equal(first.excerpt.includes(PAGE_ONE_HEAD_MARKER), true);
    assert.equal(second.excerpt.includes(PAGE_ONE_TAIL_MARKER), true);
    assert.equal(third.excerpt.includes(PAGE_TWO_MARKER), true);
    for (const marker of [PAGE_ONE_HEAD_MARKER, PAGE_ONE_TAIL_MARKER, PAGE_TWO_MARKER]) {
      assert.equal(
        answer.response.citations.filter((cited) => cited.excerpt.includes(marker)).length, 1,
        "each marker must be quoted by exactly one chunk",
      );
    }
    assert.equal(pageOne.includes(PAGE_TWO_MARKER), false, "page one may not carry page two");

    // Deterministic extraction: one citation marker, one space, then the cited
    // span exactly as the page reported it.
    assert.equal(
      answer.response.answer_text,
      answer.response.citations.map((cited) => `[${cited.citation_id}] ${cited.excerpt}`).join("\n"),
    );
    assert.equal(answer.response.retrieved_chunk_count, 3);
    assert.equal(receipt.answer.citation_count, 3);
    assert.equal(receipt.retrieval.max_evidence, EXPECTED_MAX_EVIDENCE);
    assert.equal(receipt.retrieval.max_per_source, EXPECTED_MAX_PER_SOURCE);
    assert.equal(receipt.retrieval.advisory_term_count, 0);

    assertPayloadFreeReceipt(receipt, [
      PAGE_ONE_HEAD_MARKER, PAGE_ONE_TAIL_MARKER, PAGE_TWO_MARKER,
      BOUNDARY_QUERY, RELATIVE_LOCATOR, state.tempRoot, state.launchPath,
    ]);
    assertDeeplyFrozen(answer, "project_pdf_rag_tracer_answer");
    assertDeeplyFrozen(receipt, "project_pdf_rag_tracer_receipt");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- markers

// Payload free even against a caller that plants one everywhere it can: in the
// temporary root, in the launch file name, in the locator the grant commits to,
// and in the question itself. The answer may quote the page it cited; a receipt
// may quote nothing at all.
test("carries no planted marker out of a passing or a refused receipt", async () => {
  const state = admissionFixture({
    tempPrefix: TEMP_MARKER,
    launchFileName: `${LAUNCH_MARKER}.json`,
    relativeLocator: `documents/${LOCATOR_MARKER}.pdf`,
  });
  try {
    const markers = [
      TEMP_MARKER, LAUNCH_MARKER, LOCATOR_MARKER, QUERY_MARKER,
      state.tempRoot, state.projectRoot, state.launchPath, state.documentPath, state.locator,
      state.projectRef.entity_id,
      state.readGrant.grant_ref.entity_id,
      state.readGrant.grant_ref.content_id,
    ];
    const markedQuery = `${QUERY_TEXT} ${QUERY_MARKER}`;

    const passing = await runProjectPdfRagTracer({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: markedQuery,
    });
    assert.notEqual(passing.answer, null, "the marked fixture must still admit and answer");
    assert.equal(passing.receipt.result, "PASS");
    assertPayloadFreeReceipt(passing.receipt, markers);

    const refused = await runProjectPdfRagTracer({
      launchPath: join(state.tempRoot, `${ABSENT_LAUNCH_MARKER}.json`),
      expectedLaunchSha256: state.expectedLaunchSha256,
      queryText: markedQuery,
    });
    assert.equal(refused.answer, null);
    assert.equal(refused.receipt.result, "HOLD");
    assertPayloadFreeReceipt(refused.receipt, [...markers, ABSENT_LAUNCH_MARKER]);

    // The question is never carried on the answer either: only its domain
    // separated fingerprint and its token count.
    const serialisedAnswer = JSON.stringify(passing.answer);
    for (const marker of [
      markedQuery, QUERY_MARKER, LOCATOR_MARKER, LAUNCH_MARKER, TEMP_MARKER,
      state.launchPath, state.documentPath,
    ]) {
      assert.equal(serialisedAnswer.includes(marker), false, "the answer must carry no raw payload");
    }
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- source shape

// The closed shape is a property of the source, not of one lucky run: the two
// composed seams are each imported once and called once, the budgets and the
// empty advisory expansion are the seam's own constants rather than anything a
// caller can name, the request key list is exactly three, and the source admits
// no file, process, network, model, provider, writer, persistence, callback or
// direct entrypoint surface at all. The bans read the code alone: the comments
// state the contract in prose and name the very surfaces the code must not have.
test("pins the read only, retrieval only shape of the tracer source", () => {
  const source = readFileSync(new URL("./project_pdf_rag_tracer.mjs", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, "\n").replace(/^[ \t]*\/\/.*$/gmu, "");
  const count = (pattern, text = code) => (text.match(pattern) ?? []).length;

  assert.deepEqual(
    [...code.matchAll(/from "([^"]+)"/gu)].map((match) => match[1]).sort(),
    ["./project_pdf_admission.mjs", "./source_text_index.mjs", "node:crypto", "node:util"],
  );
  assert.equal(count(/\bextractAdmittedProjectPdfCandidate\b/gu), 2, "one import, one call");
  assert.equal(count(/extractAdmittedProjectPdfCandidate\(/gu), 1);
  assert.equal(count(/\bsearchSourceTextCorpus\b/gu), 2, "one import, one call");
  assert.equal(count(/searchSourceTextCorpus\(/gu), 1);
  assert.equal(count(/runProjectPdfRagTracer/gu), 1, "nothing may start this seam by itself");

  const requestKeys = code.match(/const REQUEST_KEYS = Object\.freeze\(\[([^\]]*)\]\)/u);
  assert.notEqual(requestKeys, null);
  assert.deepEqual(
    requestKeys[1].split(",").map((key) => key.trim().replace(/"/gu, "")).filter(Boolean),
    ["launchPath", "expectedLaunchSha256", "queryText"],
    "the public request carries exactly three own fields",
  );

  assert.equal(count(/advisoryTerms/gu), 1, "the advisory expansion is fixed and empty");
  assert.match(code, /advisoryTerms: \[\],/u);
  assert.match(code, /const MAX_EVIDENCE = 3;/u);
  assert.match(code, /const MAX_PER_SOURCE = 3;/u);
  assert.match(code, /const ADVISORY_TERM_COUNT = 0;/u);
  assert.match(code, /const MAX_QUERY_CHARS = 8000;/u);
  assert.match(code, /const MAX_CHUNK_CODE_UNITS = 8000;/u);
  assert.equal(count(/maxEvidence: MAX_EVIDENCE/gu), 1);
  assert.equal(count(/maxPerSource: MAX_PER_SOURCE/gu), 1);

  const splitter = code.slice(code.indexOf("function splitPageIntoSpans"));
  assert.notEqual(splitter, "");
  for (const bound of [
    "HIGH_SURROGATE_START", "HIGH_SURROGATE_END", "LOW_SURROGATE_START", "LOW_SURROGATE_END",
  ]) {
    assert.equal(
      splitter.includes(bound), true, "a chunk may not be cut inside a surrogate pair",
    );
  }
  assert.match(code, /MAX_CHUNK_CODE_UNITS, text\.length/u);

  assert.match(code, /\btypes\.isProxy\(/u, "proxy roots must be refused");
  assert.match(code, /getOwnPropertyDescriptor/u, "accessor requests must be refused");
  assert.match(code, /embeddings_used: false/u);
  assert.match(code, /web_search_used: false/u);
  assert.match(code, /model_calls: 0/u);
  assert.match(code, /network_calls: 0/u);

  const forbidden = [
    /node:fs\b/u,
    /node:child_process\b/u,
    /node:(http|https|net|tls|dns|dgram)\b/u,
    /node:(process|worker_threads|vm|module|repl|readline|inspector)\b/u,
    /\bfetch\s*\(/u,
    /\brequire\s*\(/u,
    /\bimport\s*\(/u,
    /new Function/u,
    /\beval\s*\(/u,
    /\b(spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/u,
    /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|readFile|readFileSync|mkdir|mkdirSync|mkdtemp|mkdtempSync|openSync|rmSync|unlinkSync)\b/u,
    /\b(sqlite|localStorage|indexedDB|redis)\b/iu,
    /\b(anthropic|openai|gemini|claude|huggingface|transformers|onnx|llm|completions)\b/iu,
    /\bprovider\b/iu,
    /\bwriter\b/iu,
    /\bcallback\b/iu,
    /\bhooks?\b/iu,
    /\blistener\b/iu,
    /\bplugin\b/iu,
    /\badapter\b/iu,
    /\bonProgress\b/iu,
    /typeof\s+\w+\s*===\s*"function"/u,
    /\bprocess\b/u,
    /\bargv\b/u,
    /import\.meta/u,
    /\brequire\.main\b/u,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(code), false, `the tracer must not use ${pattern.source}`);
  }
});

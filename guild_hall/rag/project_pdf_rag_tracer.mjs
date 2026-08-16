// Project pdf rag tracer seam. One pinned launch names one admitted project pdf,
// one question is asked once over that document alone, and this seam either
// returns one closed, deep frozen extractive answer with its receipt or fails
// closed with an answer of null. The admission seam stays the only thing that
// decides admission and touches the document bytes, and the existing corpus
// search seam stays the only thing that ranks text. Nothing here reads or writes
// a file, calls a network or a model, touches a rag index, wiki, engine, erp or
// TaskDriver, keeps state between calls, or starts from a command line.
//
// The public request carries three own fields and no retrieval knob: a caller
// that could widen the evidence budget could widen what an answer is allowed to
// be grounded on, so the budgets below belong to this seam and are only read
// back off its receipts.
import { createHash } from "node:crypto";
import { types } from "node:util";

import { extractAdmittedProjectPdfCandidate } from "./project_pdf_admission.mjs";
import { searchSourceTextCorpus } from "./source_text_index.mjs";

export const PROJECT_PDF_RAG_TRACER_ANSWER_SCHEMA_VERSION =
  "soulforge.project_pdf_rag_tracer_answer.v0";
export const PROJECT_PDF_RAG_TRACER_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_pdf_rag_tracer_receipt.v0";

// Two separate hash domains. The question and the rendered answer are different
// subjects, so neither may ever be computed under the other's domain, and the
// excerpt digest stays a plain content digest of the quoted span alone.
const QUERY_FINGERPRINT_DOMAIN = "soulforge.project_pdf_rag_tracer.query.v0";
const ANSWER_TEXT_HASH_DOMAIN = "soulforge.project_pdf_rag_tracer.answer_text.v0";

// The admitted shapes this seam accepts, restated rather than imported, so a
// renamed constant upstream cannot silently widen what is answered over.
const ADMITTED_CANDIDATE_SCHEMA_VERSION = "soulforge.admitted_project_pdf_candidate.v0";
const ADMITTED_CANDIDATE_KIND = "admitted_project_pdf_candidate";
const INGEST_CANDIDATE_SCHEMA_VERSION = "soulforge.project_document_ingest_candidate.v0";
const SOURCE_TEXT_CORPUS_SEARCH_CONTRACT = "soulforge.source_text_corpus_search.v0";
const CANDIDATE_STATUS = "candidate";
const MEDIA_TYPE = "application/pdf";
const EXTRACTION_ENGINE = "pymupdf";
const FEATURE_STATE = "off";
const VALIDATION_ONLY_ROUTE = "validation_only";
const CANON_CLAIM_CEILING = "observed";
const RECEIPT_MODE = "read_only";
const RESPONSE_MODE = "deterministic_extractive";
const CANDIDATE_ANSWER_STATUS = "candidate_answer";
const NO_HIT_ANSWER_STATUS = "no_source_text_hit";

// The seam's own fixed retrieval budgets and bounds. None of them is reachable
// from the request.
const MAX_QUERY_CHARS = 8000;
const MAX_CHUNK_CODE_UNITS = 8000;
const MAX_EVIDENCE = 3;
const MAX_PER_SOURCE = 3;
const ADVISORY_TERM_COUNT = 0;
const MAX_ADMITTED_DEPTH = 8;

// A question that matched nothing is still an answer, so it is one fixed
// sentence with no citation and no trace of what was asked.
const NO_HIT_ANSWER_TEXT =
  "No admitted project pdf text chunk matched this question lexically.";

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

const REQUEST_KEYS = Object.freeze(["launchPath", "expectedLaunchSha256", "queryText"]);
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
const EXACT_REF_FIELDS = Object.freeze([
  "entity_id",
  "revision_id",
  "content_id",
  "content_hash_alg",
]);
const SEARCH_FIELDS = Object.freeze(["hits", "receipt"]);
const SEARCH_HIT_FIELDS = Object.freeze([
  "source_id",
  "chunk_id",
  "page_numbers",
  "score",
  "matched_query_token_count",
  "matched_advisory_token_count",
]);
const SEARCH_RECEIPT_FIELDS = Object.freeze([
  "contract",
  "searched_source_count",
  "searched_chunk_count",
  "hit_count",
  "selected_count",
  "max_evidence",
  "max_per_source",
  "query_token_count",
  "advisory_token_count",
  "exact_query_preserved",
  "advisory_expansion_applied",
  "selected_advisory_only_count",
  "ranking_basis",
  "tie_break_basis",
  "embeddings_used",
  "web_search_used",
  "per_source",
]);
const SEARCH_PER_SOURCE_FIELDS = Object.freeze([
  "source_id",
  "chunk_count",
  "hit_count",
  "selected_count",
]);

// Fixed, payload free blockers. A refusal reports one of these and nothing else,
// so no path, locator, ref, question, page text, excerpt or raw exception can
// ride out on it.
const BLOCKERS = Object.freeze({
  request_invalid: Object.freeze({
    code: "PROJECT_PDF_RAG_TRACER_REQUEST_INVALID",
    stage: "request",
  }),
  admission_refused: Object.freeze({
    code: "PROJECT_PDF_RAG_TRACER_ADMISSION_REFUSED",
    stage: "admission",
  }),
  extraction_shape_refused: Object.freeze({
    code: "PROJECT_PDF_RAG_TRACER_EXTRACTION_SHAPE_REFUSED",
    stage: "extraction_shape",
  }),
  no_searchable_text: Object.freeze({
    code: "PROJECT_PDF_RAG_TRACER_NO_SEARCHABLE_TEXT",
    stage: "source_text",
  }),
  retrieval_refused: Object.freeze({
    code: "PROJECT_PDF_RAG_TRACER_RETRIEVAL_REFUSED",
    stage: "retrieval",
  }),
  citation_binding_refused: Object.freeze({
    code: "PROJECT_PDF_RAG_TRACER_CITATION_BINDING_REFUSED",
    stage: "citation_binding",
  }),
});

/**
 * Answers one question over one pinned, admitted project pdf.
 *
 * The order below is the safe sequence and is not an implementation detail: the
 * request is closed before admission is started, admission decides what may be
 * read, the searched corpus is built from the returned extraction alone, and
 * every citation is rebound to the exact local chunk it claims to quote before
 * any answer text exists.
 */
export async function runProjectPdfRagTracer(request) {
  const evidence = freshEvidence();
  const prepared = prepareRequest(request);
  if (prepared === null) return hold("request_invalid", evidence);
  evidence.query.query_fingerprint = domainFingerprint(
    QUERY_FINGERPRINT_DOMAIN,
    prepared.queryText,
  );

  let candidate;
  try {
    candidate = await extractAdmittedProjectPdfCandidate({
      launchPath: prepared.launchPath,
      expectedLaunchSha256: prepared.expectedLaunchSha256,
    });
  } catch {
    // The admission seam's own refusals are already payload free, and none of
    // them is carried further than this fixed blocker.
    return hold("admission_refused", evidence);
  }
  const admitted = readAdmittedCandidate(candidate);
  if (admitted === null) return hold("extraction_shape_refused", evidence);
  recordAdmission(evidence, admitted);

  const corpus = buildLocalCorpus(admitted);
  if (corpus === null) return hold("no_searchable_text", evidence);

  let search;
  try {
    search = searchSourceTextCorpus({
      sources: [{
        source_id: corpus.source_id,
        chunks: corpus.chunks.map((chunk) => ({
          chunk_id: chunk.chunk_id,
          page_numbers: [chunk.page_number],
          text: chunk.text,
        })),
      }],
      queryText: prepared.queryText,
      advisoryTerms: [],
      maxEvidence: MAX_EVIDENCE,
      maxPerSource: MAX_PER_SOURCE,
    });
  } catch {
    return hold("retrieval_refused", evidence);
  }
  if (!acceptedSearch(search, corpus)) return hold("retrieval_refused", evidence);
  recordRetrieval(evidence, search);

  const citations = bindCitations(search.hits, corpus, admitted);
  if (citations === null) return hold("citation_binding_refused", evidence);

  // Deterministic extraction: one citation marker, one space, then the cited
  // span exactly as the page reported it. No synthesis and no repair.
  const answerText = citations.length === 0
    ? NO_HIT_ANSWER_TEXT
    : citations
      .map((citation) => `[${citation.citation_id}] ${citation.excerpt}`)
      .join("\n");
  recordAnswer(evidence, citations.length, answerText);

  const answer = {
    schema_version: PROJECT_PDF_RAG_TRACER_ANSWER_SCHEMA_VERSION,
    kind: "project_pdf_rag_tracer_answer",
    status: citations.length === 0 ? NO_HIT_ANSWER_STATUS : CANDIDATE_ANSWER_STATUS,
    feature_state: FEATURE_STATE,
    route: VALIDATION_ONLY_ROUTE,
    canon_claim_ceiling: CANON_CLAIM_CEILING,
    query: {
      raw_query_persisted: false,
      query_fingerprint: evidence.query.query_fingerprint,
      query_token_count: evidence.query.query_token_count,
    },
    // The answer stays bound to the exact document that was admitted, including
    // the local admission observation the read grant committed to, and to the
    // extraction the cited text actually came out of.
    source_binding: {
      source_id: corpus.source_id,
      project_binding_ref: cloneRef(admitted.admission.project_binding_ref),
      document_revision_ref: cloneRef(admitted.admission.document_revision_ref),
      document_read_grant_ref: cloneRef(admitted.admission.document_read_grant_ref),
      knowledge_scope_fingerprint_sha256: admitted.admission.knowledge_scope_fingerprint_sha256,
      local_admission_fingerprint_sha256: admitted.admission.local_admission_fingerprint_sha256,
      portable_material_fingerprint_sha256:
        admitted.admission.portable_material_fingerprint_sha256,
      relative_locator_fingerprint_sha256:
        admitted.admission.relative_locator_fingerprint_sha256,
      knowledge_view_project_read_allowed:
        admitted.admission.knowledge_view_project_read_allowed,
      extraction_engine: admitted.extraction.engine,
      extraction_page_count: admitted.extraction.page_count,
      extraction_text_sha256: admitted.extraction.text_sha256,
    },
    response: {
      mode: RESPONSE_MODE,
      retrieved_chunk_count: citations.length,
      answer_text: answerText,
      citations,
    },
    retrieval_receipt: search.receipt,
    // A retrieved answer is not a source, not canon, not project state and not an
    // approval, and it is not accepted context or an operational retrieval
    // either: nothing downstream may treat it as any of those.
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
      rag_query_calls: evidence.effects.rag_query_calls,
      wiki_writes: 0,
      engine_calls: 0,
      erp_writes: 0,
    },
  };
  return deepFreeze({ answer, receipt: buildReceipt(evidence, null) });
}

// ---------------------------------------------------------------- request

// Closed own-data request. Three keys, all ordinary values, nothing else: no
// advisory term, no evidence bound, no root or path override, no hook and no
// writer surface can be smuggled in beside them.
function prepareRequest(request) {
  if (!ordinaryDataObject(request)) return null;
  // Three own data fields on one ordinary object is the whole request contract, so
  // a root whose prototype was replaced is not that object and loses here, before
  // admission is started. Settled locally and not in the shared predicate, which
  // also bounds the admitted candidate and the search receipt, where a null
  // prototype is part of the frozen shape the admission seam may return.
  if (Object.getPrototypeOf(request) !== Object.prototype) return null;
  if (Reflect.ownKeys(request).length !== REQUEST_KEYS.length) return null;
  const values = [];
  for (const key of REQUEST_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(request, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) return null;
    values.push(descriptor.value);
  }
  const [launchPath, expectedLaunchSha256, queryText] = values;
  // The launch path form is the admission seam's own contract and is left to it;
  // only the type is settled here, before anything is handed on.
  if (typeof launchPath !== "string" || launchPath.length === 0) return null;
  if (typeof expectedLaunchSha256 !== "string" || !SHA256_HEX.test(expectedLaunchSha256)) {
    return null;
  }
  if (typeof queryText !== "string" || queryText.length === 0
      || queryText.length > MAX_QUERY_CHARS) return null;
  return { launchPath, expectedLaunchSha256, queryText };
}

function ordinaryDataObject(value) {
  if (value === null || typeof value !== "object") return false;
  // A proxy answers every later reflection with caller code and a revoked one
  // cannot answer at all, so the root is refused before the first trap capable
  // read. `Array.isArray` is one of those reads, so it stays behind this line.
  if (types.isProxy(value)) return false;
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ordinaryDataArray(value) {
  if (value === null || typeof value !== "object") return false;
  if (types.isProxy(value)) return false;
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;
}

function exactKeys(value, expected) {
  if (!ordinaryDataObject(value)) return false;
  if (Reflect.ownKeys(value).length !== expected.length) return false;
  return expected.every((key) => Object.hasOwn(value, key));
}

// ---------------------------------------------------------------- admission

// The admitted candidate is re-read as a closed, deeply frozen data tree before
// one field of it is used. It arrives frozen from the admission seam, and a
// candidate that is not is not the candidate that seam returns.
function closedFrozenData(value, depth) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isSafeInteger(value);
  if (typeof value !== "object") return false;
  if (types.isProxy(value)) return false;
  if (!Object.isFrozen(value)) return false;
  if (depth >= MAX_ADMITTED_DEPTH) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array
    ? prototype !== Array.prototype
    : prototype !== Object.prototype && prototype !== null) return false;
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
    if (!Object.hasOwn(descriptor, "value")) return false;
    if (!closedFrozenData(descriptor.value, depth + 1)) return false;
  }
  return true;
}

function validExactRef(ref) {
  return exactKeys(ref, EXACT_REF_FIELDS)
    && typeof ref.entity_id === "string" && SAFE_IDENTIFIER.test(ref.entity_id)
    && typeof ref.revision_id === "string" && SAFE_IDENTIFIER.test(ref.revision_id)
    && typeof ref.content_id === "string" && SHA256_CONTENT_ID.test(ref.content_id)
    && ref.content_hash_alg === "sha256";
}

function isSha256ContentId(value) {
  return typeof value === "string" && SHA256_CONTENT_ID.test(value);
}

function isSha256Hex(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

// The admitted shape this seam is willing to answer over. Every field it later
// reports is bounded here first, and the cited revision must be the revision
// whose bytes were extracted, so an answer can never be read back against a
// different document than the one that was pinned.
function readAdmittedCandidate(candidate) {
  if (!closedFrozenData(candidate, 0)) return null;
  if (!exactKeys(candidate, ADMITTED_FIELDS)
      || candidate.schema_version !== ADMITTED_CANDIDATE_SCHEMA_VERSION
      || candidate.kind !== ADMITTED_CANDIDATE_KIND
      || candidate.status !== CANDIDATE_STATUS
      || candidate.feature_state !== FEATURE_STATE
      || candidate.route !== VALIDATION_ONLY_ROUTE) return null;

  const admission = candidate.admission;
  if (!exactKeys(admission, ADMISSION_FIELDS)
      || !validExactRef(admission.project_binding_ref)
      || !validExactRef(admission.document_revision_ref)
      || !validExactRef(admission.document_read_grant_ref)
      || !isSha256ContentId(admission.knowledge_scope_fingerprint_sha256)
      || !isSha256ContentId(admission.local_admission_fingerprint_sha256)
      || !isSha256ContentId(admission.portable_material_fingerprint_sha256)
      || !isSha256ContentId(admission.relative_locator_fingerprint_sha256)
      || admission.knowledge_view_project_read_allowed !== false
      || admission.document_read_grant_binding_verified !== true) return null;

  const ingest = candidate.ingest_candidate;
  if (!exactKeys(ingest, INGEST_FIELDS)
      || ingest.schema_version !== INGEST_CANDIDATE_SCHEMA_VERSION
      || ingest.status !== CANDIDATE_STATUS
      || !exactKeys(ingest.source, INGEST_SOURCE_FIELDS)
      || ingest.source.media_type !== MEDIA_TYPE
      || !isSha256Hex(ingest.source.sha256)
      || !Number.isSafeInteger(ingest.source.byte_count) || ingest.source.byte_count < 1
      || admission.document_revision_ref.content_id !== `sha256:${ingest.source.sha256}`) {
    return null;
  }

  const extraction = ingest.extraction;
  if (!exactKeys(extraction, EXTRACTION_FIELDS)
      || extraction.engine !== EXTRACTION_ENGINE
      || !Number.isSafeInteger(extraction.page_count) || extraction.page_count < 1
      || !Number.isSafeInteger(extraction.character_count) || extraction.character_count < 0
      || !isSha256Hex(extraction.text_sha256)
      || !ordinaryDataArray(extraction.pages)
      || extraction.pages.length !== extraction.page_count) return null;
  let characters = 0;
  for (let index = 0; index < extraction.pages.length; index += 1) {
    const page = extraction.pages[index];
    if (!exactKeys(page, PAGE_FIELDS)
        || page.page_number !== index + 1
        || typeof page.text !== "string") return null;
    characters += page.text.length;
  }
  if (characters !== extraction.character_count) return null;

  return { admission, source: ingest.source, extraction };
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

// ---------------------------------------------------------------- corpus

// One in-memory source, named by the pinned document digest alone, so the same
// pdf yields the same source on every machine and every run. Nothing is written
// anywhere and nothing outlives this call.
function buildLocalCorpus(admitted) {
  const sourceId = `pdf_${admitted.source.sha256}`;
  const chunks = [];
  const byChunkId = new Map();
  for (const page of admitted.extraction.pages) {
    if (page.text.length === 0) continue;
    const spans = splitPageIntoSpans(page.text);
    for (let index = 0; index < spans.length; index += 1) {
      const chunk = {
        chunk_id: `${sourceId}_p${padNumber(page.page_number, 4)}_c${padNumber(index + 1, 4)}`,
        page_number: page.page_number,
        start: spans[index].start,
        end: spans[index].end,
        text: spans[index].text,
      };
      if (byChunkId.has(chunk.chunk_id)) return null;
      byChunkId.set(chunk.chunk_id, chunk);
      chunks.push(chunk);
    }
  }
  if (chunks.length === 0) return null;
  return { source_id: sourceId, chunks, byChunkId };
}

// A chunk never crosses a page, because a citation names one page, and it never
// ends between the two halves of a surrogate pair, because half a pair is not
// the text the page reported. Nothing is trimmed: an answer that quotes a
// repaired excerpt is not quoting the page it cites.
function splitPageIntoSpans(text) {
  const spans = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK_CODE_UNITS, text.length);
    if (end < text.length) {
      const lead = text.charCodeAt(end - 1);
      const trail = text.charCodeAt(end);
      if (lead >= HIGH_SURROGATE_START && lead <= HIGH_SURROGATE_END
          && trail >= LOW_SURROGATE_START && trail <= LOW_SURROGATE_END) end -= 1;
    }
    spans.push({ start, end, text: text.slice(start, end) });
    start = end;
  }
  return spans;
}

function padNumber(value, width) {
  return String(value).padStart(width, "0");
}

// ---------------------------------------------------------------- retrieval

// The reported retrieval is bounded to the corpus that was actually searched
// before one hit is read: a receipt that describes another corpus, another
// budget, an advisory expansion or an embedding or web step is not the receipt
// of the single lexical call this seam made.
function acceptedSearch(search, corpus) {
  if (!exactKeys(search, SEARCH_FIELDS) || !ordinaryDataArray(search.hits)) return false;
  const receipt = search.receipt;
  if (!exactKeys(receipt, SEARCH_RECEIPT_FIELDS)) return false;
  if (!ordinaryDataArray(receipt.per_source) || receipt.per_source.length !== 1) return false;
  const perSource = receipt.per_source[0];
  if (!exactKeys(perSource, SEARCH_PER_SOURCE_FIELDS)
      || perSource.source_id !== corpus.source_id
      || perSource.chunk_count !== corpus.chunks.length) return false;
  return receipt.contract === SOURCE_TEXT_CORPUS_SEARCH_CONTRACT
    && receipt.searched_source_count === 1
    && receipt.searched_chunk_count === corpus.chunks.length
    && Number.isSafeInteger(receipt.hit_count) && receipt.hit_count >= 0
    && receipt.selected_count === search.hits.length
    && search.hits.length <= MAX_EVIDENCE
    && receipt.max_evidence === MAX_EVIDENCE
    && receipt.max_per_source === MAX_PER_SOURCE
    && Number.isSafeInteger(receipt.query_token_count) && receipt.query_token_count >= 0
    && receipt.advisory_token_count === ADVISORY_TERM_COUNT
    && receipt.exact_query_preserved === true
    && receipt.advisory_expansion_applied === false
    && receipt.selected_advisory_only_count === 0
    && typeof receipt.ranking_basis === "string"
    && typeof receipt.tie_break_basis === "string"
    && receipt.embeddings_used === false
    && receipt.web_search_used === false;
}

// Every hit is rebound to the exact local chunk it names. A hit that names a
// chunk this call did not build, repeats one, reports another page or carries a
// non positive score refuses the whole answer rather than being quoted.
function bindCitations(hits, corpus, admitted) {
  const citations = [];
  const cited = new Set();
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (!exactKeys(hit, SEARCH_HIT_FIELDS)) return null;
    if (hit.source_id !== corpus.source_id) return null;
    if (typeof hit.chunk_id !== "string" || cited.has(hit.chunk_id)) return null;
    const chunk = corpus.byChunkId.get(hit.chunk_id);
    if (chunk === undefined) return null;
    cited.add(hit.chunk_id);
    if (!ordinaryDataArray(hit.page_numbers) || hit.page_numbers.length !== 1
        || hit.page_numbers[0] !== chunk.page_number) return null;
    if (typeof hit.score !== "number" || !Number.isFinite(hit.score) || hit.score <= 0) return null;
    if (!Number.isSafeInteger(hit.matched_query_token_count)
        || hit.matched_query_token_count < 0
        || hit.matched_advisory_token_count !== 0) return null;
    citations.push({
      citation_id: `citation_${padNumber(index + 1, 3)}`,
      source_id: corpus.source_id,
      chunk_id: chunk.chunk_id,
      document_revision_ref: cloneRef(admitted.admission.document_revision_ref),
      page_number: chunk.page_number,
      excerpt_start_utf16: chunk.start,
      excerpt_end_utf16: chunk.end,
      excerpt: chunk.text,
      excerpt_sha256: `sha256:${digestHex(chunk.text)}`,
      score: hit.score,
      matched_query_token_count: hit.matched_query_token_count,
      matched_advisory_token_count: hit.matched_advisory_token_count,
    });
  }
  return citations;
}

// ---------------------------------------------------------------- fingerprints

function digestHex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// The hash domain, a NUL separator, then the material. Two different subjects
// never share a domain, so one fingerprint can never stand in for another.
function domainFingerprint(domain, text) {
  return `sha256:${digestHex(`${domain}\0${text}`)}`;
}

// ---------------------------------------------------------------- evidence

// What one execution actually verified. Every field is a boolean, a count, a
// fixed enum, a domain separated fingerprint or a digest, and each is filled
// only after the check it reports has passed, so a refused run carries only the
// evidence it reached and `null` where it reached nothing.
function freshEvidence() {
  return {
    query: { query_fingerprint: null, query_token_count: null },
    admission: {
      knowledge_view_verified: false,
      knowledge_view_project_read_allowed: false,
      document_read_grant_binding_verified: false,
      project_binding_verified: false,
      local_admission_verified: false,
      portable_material_fingerprint_sha256: null,
      relative_locator_fingerprint_sha256: null,
    },
    document: {
      pin_verified: false,
      sha256: null,
      byte_count: null,
      page_count: null,
      character_count: null,
      text_sha256: null,
    },
    retrieval: {
      searched_source_count: null,
      searched_chunk_count: null,
      hit_count: null,
      selected_count: null,
    },
    answer: { citation_count: null, answer_character_count: null, answer_sha256: null },
    reads: { launch_files: null, project_documents: null },
    effects: { rag_query_calls: 0 },
  };
}

// An admitted candidate is the admission seam's own statement that the view, the
// project binding, the local admission and the read grant binding all held, and
// that exactly one launch file and one project document were read to reach it.
function recordAdmission(evidence, admitted) {
  evidence.admission.knowledge_view_verified = true;
  evidence.admission.knowledge_view_project_read_allowed =
    admitted.admission.knowledge_view_project_read_allowed;
  evidence.admission.document_read_grant_binding_verified =
    admitted.admission.document_read_grant_binding_verified;
  evidence.admission.project_binding_verified = true;
  evidence.admission.local_admission_verified = true;
  evidence.admission.portable_material_fingerprint_sha256 =
    admitted.admission.portable_material_fingerprint_sha256;
  evidence.admission.relative_locator_fingerprint_sha256 =
    admitted.admission.relative_locator_fingerprint_sha256;
  evidence.document.pin_verified = true;
  evidence.document.sha256 = `sha256:${admitted.source.sha256}`;
  evidence.document.byte_count = admitted.source.byte_count;
  evidence.document.page_count = admitted.extraction.page_count;
  evidence.document.character_count = admitted.extraction.character_count;
  evidence.document.text_sha256 = `sha256:${admitted.extraction.text_sha256}`;
  evidence.reads.launch_files = 1;
  evidence.reads.project_documents = 1;
}

function recordRetrieval(evidence, search) {
  evidence.effects.rag_query_calls = 1;
  evidence.query.query_token_count = search.receipt.query_token_count;
  evidence.retrieval.searched_source_count = search.receipt.searched_source_count;
  evidence.retrieval.searched_chunk_count = search.receipt.searched_chunk_count;
  evidence.retrieval.hit_count = search.receipt.hit_count;
  evidence.retrieval.selected_count = search.receipt.selected_count;
}

function recordAnswer(evidence, citationCount, answerText) {
  evidence.answer.citation_count = citationCount;
  evidence.answer.answer_character_count = answerText.length;
  evidence.answer.answer_sha256 = domainFingerprint(ANSWER_TEXT_HASH_DOMAIN, answerText);
}

// The receipt is payload free: every value is a boolean, a count, a fixed enum,
// a domain separated fingerprint or a digest, so no raw query, path, locator,
// project ref, page text or excerpt can ride out on it.
function buildReceipt(evidence, blockerKey) {
  const refused = blockerKey !== null;
  return {
    schema_version: PROJECT_PDF_RAG_TRACER_RECEIPT_SCHEMA_VERSION,
    kind: "project_pdf_rag_tracer_receipt",
    mode: RECEIPT_MODE,
    feature_state: FEATURE_STATE,
    route: VALIDATION_ONLY_ROUTE,
    result: refused ? "HOLD" : "PASS",
    blocker_code: refused ? BLOCKERS[blockerKey].code : null,
    blocker_stage: refused ? BLOCKERS[blockerKey].stage : null,
    query: {
      raw_query_persisted: false,
      query_fingerprint: evidence.query.query_fingerprint,
      query_token_count: evidence.query.query_token_count,
    },
    admission: {
      knowledge_view_verified: evidence.admission.knowledge_view_verified,
      knowledge_view_project_read_allowed:
        evidence.admission.knowledge_view_project_read_allowed,
      document_read_grant_binding_verified:
        evidence.admission.document_read_grant_binding_verified,
      project_binding_verified: evidence.admission.project_binding_verified,
      local_admission_verified: evidence.admission.local_admission_verified,
      portable_material_fingerprint_sha256:
        evidence.admission.portable_material_fingerprint_sha256,
      relative_locator_fingerprint_sha256:
        evidence.admission.relative_locator_fingerprint_sha256,
    },
    document: {
      pin_verified: evidence.document.pin_verified,
      sha256: evidence.document.sha256,
      byte_count: evidence.document.byte_count,
      page_count: evidence.document.page_count,
      character_count: evidence.document.character_count,
      text_sha256: evidence.document.text_sha256,
    },
    retrieval: {
      searched_source_count: evidence.retrieval.searched_source_count,
      searched_chunk_count: evidence.retrieval.searched_chunk_count,
      hit_count: evidence.retrieval.hit_count,
      selected_count: evidence.retrieval.selected_count,
      max_evidence: MAX_EVIDENCE,
      max_per_source: MAX_PER_SOURCE,
      advisory_term_count: ADVISORY_TERM_COUNT,
      advisory_token_count: ADVISORY_TERM_COUNT,
      embeddings_used: false,
      web_search_used: false,
    },
    answer: {
      citation_count: evidence.answer.citation_count,
      answer_character_count: evidence.answer.answer_character_count,
      answer_sha256: evidence.answer.answer_sha256,
    },
    reads: {
      launch_files: evidence.reads.launch_files,
      project_documents: evidence.reads.project_documents,
    },
    persistence: { state: "not_requested", persistent_file_writes: 0 },
    effects: {
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      rag_query_calls: evidence.effects.rag_query_calls,
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
    canon_claim_ceiling: CANON_CLAIM_CEILING,
  };
}

// A refusal has no answer at all. A partial answer would still be an answer, so
// the answer stays null and only the payload free receipt is returned.
function hold(blockerKey, evidence) {
  return deepFreeze({ answer: null, receipt: buildReceipt(evidence, blockerKey) });
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

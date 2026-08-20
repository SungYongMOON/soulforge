// Public-synthetic characterisation for the project-local P4/M2-3 candidate
// seam. The fixture is an already-admitted in-memory candidate: this test never
// opens a project root or a document, and every planted source marker must stay
// out of the projections, receipts, and retrieval results.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalise } from "../engineering_engine/kernel/canonical.mjs";
import {
  PROJECT_PDF_KNOWLEDGE_CANDIDATE_SCHEMA_VERSION,
  PROJECT_PDF_KNOWLEDGE_RECEIPT_SCHEMA_VERSION,
  PROJECT_PDF_KNOWLEDGE_RETRIEVAL_SCHEMA_VERSION,
  buildProjectPdfKnowledgeCandidate,
  retrieveProjectPdfKnowledgeCandidate,
} from "./project_pdf_knowledge_projection.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const PAYLOAD_MARKER = "PRIVATE_PAYLOAD_MUST_NOT_ESCAPE_7f3d";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exactRef(seed, contentHex = String(seed).padStart(64, "0")) {
  const token = String(seed).padStart(12, "0");
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: `sha256:${contentHex}`,
    content_hash_alg: "sha256",
  };
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function freezeOwnData(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (Object.hasOwn(descriptor, "value")) freezeOwnData(descriptor.value);
  }
  return Object.freeze(value);
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

function canonicalFingerprint(domain, material) {
  return `sha256:${digest(`${domain}\0${canonicalise(material, insertionOrderRules(material))}`)}`;
}

function trustedSourceReceiptDigest(candidate) {
  const admission = candidate.admission;
  const extraction = candidate.ingest_candidate.extraction;
  const bindingMaterial = {
    feature_state: "off",
    project_binding_ref: admission.project_binding_ref,
    document_revision_ref: admission.document_revision_ref,
    document_read_grant_ref: admission.document_read_grant_ref,
    knowledge_scope_fingerprint_sha256: admission.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: admission.local_admission_fingerprint_sha256,
    portable_material_fingerprint_sha256: admission.portable_material_fingerprint_sha256,
    relative_locator_fingerprint_sha256: admission.relative_locator_fingerprint_sha256,
    source_content_sha256: `sha256:${candidate.ingest_candidate.source.sha256}`,
    extraction_text_sha256: `sha256:${extraction.text_sha256}`,
    page_count: extraction.page_count,
    character_count: extraction.character_count,
  };
  const sourceRevisionBinding = canonicalFingerprint(
    "soulforge.project_pdf_source_revision_binding.v0",
    bindingMaterial,
  );
  return canonicalFingerprint("soulforge.project_pdf_source_revision_receipt.v0", {
    schema_version: "soulforge.project_pdf_source_revision_receipt.v0",
    kind: "project_pdf_source_revision_receipt",
    status: "candidate",
    feature_state: "off",
    ...bindingMaterial,
    source_revision_binding_sha256: sourceRevisionBinding,
    supersession_status: "not_evaluated",
    project_count: 1,
  });
}

function admittedFixture({
  projectRef = exactRef(1),
  documentSha256 = digest("public-synthetic-pdf-bytes-v0"),
  pageTexts = [
    `Release-Gate traceability evidence. ${PAYLOAD_MARKER}`,
    "Verification evidence stays on the second synthetic page.",
  ],
} = {}) {
  const documentRef = exactRef(2, documentSha256);
  const text = pageTexts.join("");
  const pages = pageTexts.map((pageText, index) => ({
    page_number: index + 1,
    text: pageText,
  }));
  return deepFreeze({
    schema_version: "soulforge.admitted_project_pdf_candidate.v0",
    kind: "admitted_project_pdf_candidate",
    status: "candidate",
    feature_state: "off",
    route: "validation_only",
    admission: {
      project_binding_ref: projectRef,
      document_revision_ref: documentRef,
      document_read_grant_ref: exactRef(3),
      knowledge_scope_fingerprint_sha256: `sha256:${digest("scope")}`,
      local_admission_fingerprint_sha256: `sha256:${digest("local-admission")}`,
      portable_material_fingerprint_sha256: `sha256:${digest("portable-material")}`,
      relative_locator_fingerprint_sha256: `sha256:${digest("relative-locator")}`,
      knowledge_view_project_read_allowed: false,
      document_read_grant_binding_verified: true,
    },
    ingest_candidate: {
      schema_version: "soulforge.project_document_ingest_candidate.v0",
      status: "candidate",
      source: {
        media_type: "application/pdf",
        sha256: documentSha256,
        byte_count: 101,
      },
      extraction: {
        engine: "pymupdf",
        page_count: pages.length,
        character_count: text.length,
        text_sha256: digest(text),
        pages,
      },
      authority: {
        source_truth: false,
        canon: false,
        project_state: false,
        approval: false,
      },
      effects: {
        persistent_writes: 0,
        network_calls: 0,
        model_calls: 0,
        rag_index_writes: 0,
        wiki_writes: 0,
      },
    },
    authority: {
      source_truth: false,
      canon: false,
      project_state: false,
      approval: false,
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
      wiki_writes: 0,
      engine_calls: 0,
    },
  });
}

function buildRequest(candidate, overrides = {}) {
  return {
    admitted_candidate: candidate,
    expected_project_binding_ref: candidate.admission.project_binding_ref,
    expected_document_revision_ref: candidate.admission.document_revision_ref,
    trusted_source_revision_receipt_sha256: trustedSourceReceiptDigest(candidate),
    ...overrides,
  };
}

function retrievalRequest(candidate, queryText, overrides = {}) {
  return {
    candidate,
    expected_project_binding_ref: candidate.project_binding_ref,
    expected_document_revision_ref: candidate.document_revision_ref,
    trusted_candidate_sha256: candidate.candidate_sha256,
    trusted_source_revision_receipt_sha256:
      candidate.source_revision_receipt.source_revision_receipt_sha256,
    query_text: queryText,
    ...overrides,
  };
}

function assertAllFalse(value) {
  assert.ok(Object.values(value).every((field) => field === false));
}

test("builds deterministic sibling project-local RAG and Thin Wiki candidates from one exact revision", () => {
  const admitted = admittedFixture();
  const first = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const second = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));

  assert.equal(first.candidate.schema_version, PROJECT_PDF_KNOWLEDGE_CANDIDATE_SCHEMA_VERSION);
  assert.equal(first.receipt.schema_version, PROJECT_PDF_KNOWLEDGE_RECEIPT_SCHEMA_VERSION);
  assert.deepEqual(first, second);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.candidate));
  assert.equal(first.candidate.status, "candidate");
  assert.equal(first.candidate.feature_state, "off");
  assert.equal(first.candidate.project_binding_ref.content_id, admitted.admission.project_binding_ref.content_id);
  assert.equal(first.candidate.document_revision_ref.content_id, admitted.admission.document_revision_ref.content_id);
  assert.equal(first.candidate.rag_candidate.retrieval_units.length, 2);
  assert.equal(first.candidate.thin_wiki_candidate.page_count, 2);
  assert.equal(first.candidate.thin_wiki_candidate.pages.length, 2);
  assert.equal(
    first.candidate.rag_candidate.source_revision_receipt_sha256,
    first.candidate.thin_wiki_candidate.source_revision_receipt_sha256,
  );
  assert.equal(first.candidate.p5_input_candidate.status, "candidate_not_accepted");
  assert.equal(first.candidate.p5_input_candidate.acceptance_allowed, false);
  assert.equal(first.candidate.source_revision_receipt.project_count, 1);
  assert.equal(first.candidate.source_revision_receipt.supersession_status, "not_evaluated");
  assert.deepEqual(first.candidate.p5_input_candidate.missing_acceptance_requirements, [
    "bitemporal_stamps",
    "coverage_and_gap",
    "unresolved_supersession",
    "reviewer_state",
    "writer_epoch",
  ]);
  assert.deepEqual(first.receipt.provenance, {
    bound: true,
    trusted_source_revision_receipt_sha256: trustedSourceReceiptDigest(admitted),
    source_revision_receipt_sha256:
      first.candidate.source_revision_receipt.source_revision_receipt_sha256,
    portable_material_fingerprint_sha256: admitted.admission.portable_material_fingerprint_sha256,
    local_admission_fingerprint_sha256: admitted.admission.local_admission_fingerprint_sha256,
    relative_locator_fingerprint_sha256: admitted.admission.relative_locator_fingerprint_sha256,
  });
  assertAllFalse(first.candidate.authority);
  assert.deepEqual(first.candidate.effects, {
    persistent_writes: 0,
    network_calls: 0,
    model_calls: 0,
    rag_index_writes: 0,
    wiki_writes: 0,
    engine_calls: 0,
    erp_writes: 0,
  });
  assert.doesNotMatch(JSON.stringify(first), new RegExp(PAYLOAD_MARKER));
});

test("retrieves and cites only the candidate's exact document revision deterministically", () => {
  const admitted = admittedFixture();
  const { candidate } = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const first = retrieveProjectPdfKnowledgeCandidate(retrievalRequest(candidate, "release-gate"));
  const second = retrieveProjectPdfKnowledgeCandidate(retrievalRequest(candidate, "release-gate"));

  assert.equal(first.retrieval.schema_version, PROJECT_PDF_KNOWLEDGE_RETRIEVAL_SCHEMA_VERSION);
  assert.deepEqual(first, second);
  assert.equal(first.retrieval.status, "candidate_retrieval");
  assert.equal(first.retrieval.citations.length, 1);
  assert.equal(first.retrieval.citations[0].page_number, 1);
  assert.equal(
    first.retrieval.citations[0].document_revision_ref.content_id,
    candidate.document_revision_ref.content_id,
  );
  assert.ok(SHA256.test(first.retrieval.citations[0].excerpt_sha256.slice("sha256:".length)));
  assert.equal(first.retrieval.query.raw_query_persisted, false);
  assert.doesNotMatch(JSON.stringify(first), /release-gate/iu);
  assert.doesNotMatch(JSON.stringify(first), new RegExp(PAYLOAD_MARKER));
});

test("refuses foreign-project retrieval before searching and does not disclose the foreign ref", () => {
  const admitted = admittedFixture();
  const { candidate } = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const foreignProject = exactRef(99);
  const result = retrieveProjectPdfKnowledgeCandidate(retrievalRequest(candidate, "release-gate", {
    expected_project_binding_ref: foreignProject,
  }));

  assert.equal(result.retrieval, null);
  assert.equal(result.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_PROJECT_REFUSED");
  assert.equal(result.receipt.searched_unit_count, 0);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(foreignProject.entity_id));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(PAYLOAD_MARKER));
});

test("refuses a same-subject revision mismatch before searching", () => {
  const admitted = admittedFixture();
  const { candidate } = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const mismatchedRevision = {
    ...candidate.document_revision_ref,
    content_id: `sha256:${digest("different-bytes")}`,
  };
  const result = retrieveProjectPdfKnowledgeCandidate(retrievalRequest(candidate, "release-gate", {
    expected_document_revision_ref: mismatchedRevision,
  }));

  assert.equal(result.retrieval, null);
  assert.equal(result.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_REVISION_REFUSED");
  assert.equal(result.receipt.searched_unit_count, 0);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(mismatchedRevision.content_id));
});

test("uses normalized query tokens and page order as the deterministic tie break", () => {
  const admitted = admittedFixture({
    pageTexts: ["검증-Gate shared-token", "검증-Gate shared-token"],
  });
  const { candidate } = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const result = retrieveProjectPdfKnowledgeCandidate(
    retrievalRequest(candidate, "검증-gate SHARED-TOKEN"),
  );

  assert.equal(result.retrieval.status, "candidate_retrieval");
  assert.deepEqual(result.retrieval.citations.map((citation) => citation.page_number), [1, 2]);
});

test("requires a deeply frozen admitted candidate and rejects a near-miss revision id", () => {
  const admitted = admittedFixture();
  assert.throws(() => {
    admitted.ingest_candidate.extraction.pages[0].text = "mutation";
  }, TypeError);
  const mutable = JSON.parse(JSON.stringify(admitted));
  mutable.ingest_candidate.extraction.pages[0].text = "mutated page";
  const mutableResult = buildProjectPdfKnowledgeCandidate(buildRequest(mutable));
  const { candidate } = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const nearMissRevision = {
    ...candidate.document_revision_ref,
    revision_id: `${candidate.document_revision_ref.revision_id}-near`,
  };
  const revisionResult = retrieveProjectPdfKnowledgeCandidate(
    retrievalRequest(candidate, "release-gate", {
      expected_document_revision_ref: nearMissRevision,
    }),
  );

  assert.equal(mutableResult.candidate, null);
  assert.equal(mutableResult.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_CANDIDATE_REFUSED");
  assert.equal(revisionResult.retrieval, null);
  assert.equal(revisionResult.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_REVISION_REFUSED");
});

test("refuses build requests that are not one exact project and one exact source revision", () => {
  const admitted = admittedFixture();
  const foreignProject = exactRef(77);
  const result = buildProjectPdfKnowledgeCandidate(buildRequest(admitted, {
    expected_project_binding_ref: foreignProject,
  }));
  const extraField = buildProjectPdfKnowledgeCandidate({
    ...buildRequest(admitted),
    project_root_path: "must-not-be-an-interface-field",
  });

  assert.equal(result.candidate, null);
  assert.equal(result.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_PROJECT_REFUSED");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(foreignProject.entity_id));
  assert.equal(extraField.candidate, null);
  assert.equal(extraField.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_REQUEST_INVALID");
});

test("rejects a tampered candidate rather than rebinding citations to it", () => {
  const admitted = admittedFixture();
  const { candidate } = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const tampered = JSON.parse(JSON.stringify(candidate));
  tampered.rag_candidate.retrieval_units[0].excerpt_sha256 = `sha256:${digest("tampered")}`;
  const result = retrieveProjectPdfKnowledgeCandidate(retrievalRequest(deepFreeze(tampered), "release-gate"));

  assert.equal(result.retrieval, null);
  assert.equal(result.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_CANDIDATE_REFUSED");
  assert.equal(result.receipt.searched_unit_count, 0);
});

test("rejects a self-consistent recomputed citation candidate without its independently trusted digests", () => {
  const admitted = admittedFixture();
  const original = buildProjectPdfKnowledgeCandidate(buildRequest(admitted)).candidate;
  const forgedAdmission = admittedFixture({
    documentSha256: admitted.ingest_candidate.source.sha256,
    pageTexts: ["Release-Gate forged evidence.", "Different deterministic synthetic page."],
  });
  const forged = buildProjectPdfKnowledgeCandidate(buildRequest(forgedAdmission)).candidate;
  const result = retrieveProjectPdfKnowledgeCandidate(retrievalRequest(forged, "release-gate", {
    expected_project_binding_ref: original.project_binding_ref,
    expected_document_revision_ref: original.document_revision_ref,
    trusted_candidate_sha256: original.candidate_sha256,
    trusted_source_revision_receipt_sha256:
      original.source_revision_receipt.source_revision_receipt_sha256,
  }));

  assert.notEqual(forged.candidate_sha256, original.candidate_sha256);
  assert.equal(result.retrieval, null);
  assert.equal(result.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_CANDIDATE_TRUST_REFUSED");
  assert.equal(result.receipt.searched_unit_count, 0);
});

test("refuses a trusted source-receipt mismatch without echoing it", () => {
  const admitted = admittedFixture();
  const untrusted = `sha256:${digest("untrusted-source-receipt")}`;
  const result = buildProjectPdfKnowledgeCandidate(buildRequest(admitted, {
    trusted_source_revision_receipt_sha256: untrusted,
  }));

  assert.equal(result.candidate, null);
  assert.equal(result.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_TRUST_REFUSED");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(untrusted));
});

test("requires the independently trusted source-receipt digest before retrieval", () => {
  const admitted = admittedFixture();
  const { candidate } = buildProjectPdfKnowledgeCandidate(buildRequest(admitted));
  const untrusted = `sha256:${digest("wrong-retrieval-source-receipt")}`;
  const result = retrieveProjectPdfKnowledgeCandidate(retrievalRequest(candidate, "release-gate", {
    trusted_source_revision_receipt_sha256: untrusted,
  }));

  assert.equal(result.retrieval, null);
  assert.equal(result.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_RETRIEVAL_SOURCE_RECEIPT_TRUST_REFUSED");
  assert.equal(result.receipt.searched_unit_count, 0);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(untrusted));
});

test("snapshots nested data descriptors once and refuses nested getters or aliases without running them", () => {
  const admitted = admittedFixture();
  const trustedReceipt = trustedSourceReceiptDigest(admitted);
  const accessorCandidate = JSON.parse(JSON.stringify(admitted));
  let getterReads = 0;
  Object.defineProperty(accessorCandidate.ingest_candidate.extraction.pages[0], "text", {
    enumerable: true,
    get() {
      getterReads += 1;
      return "must-not-be-read";
    },
  });
  freezeOwnData(accessorCandidate);
  const accessorResult = buildProjectPdfKnowledgeCandidate(buildRequest(admitted, {
    admitted_candidate: accessorCandidate,
    trusted_source_revision_receipt_sha256: trustedReceipt,
  }));

  const refAccessorCandidate = JSON.parse(JSON.stringify(admitted));
  let refGetterReads = 0;
  Object.defineProperty(refAccessorCandidate.admission.project_binding_ref, "content_id", {
    enumerable: true,
    get() {
      refGetterReads += 1;
      return admitted.admission.project_binding_ref.content_id;
    },
  });
  freezeOwnData(refAccessorCandidate);
  const refAccessorResult = buildProjectPdfKnowledgeCandidate(buildRequest(admitted, {
    admitted_candidate: refAccessorCandidate,
    trusted_source_revision_receipt_sha256: trustedReceipt,
  }));

  const expectedProjectAccessor = JSON.parse(JSON.stringify(admitted.admission.project_binding_ref));
  let expectedRefGetterReads = 0;
  Object.defineProperty(expectedProjectAccessor, "content_id", {
    enumerable: true,
    get() {
      expectedRefGetterReads += 1;
      return admitted.admission.project_binding_ref.content_id;
    },
  });
  const expectedRefResult = buildProjectPdfKnowledgeCandidate(buildRequest(admitted, {
    expected_project_binding_ref: expectedProjectAccessor,
    trusted_source_revision_receipt_sha256: trustedReceipt,
  }));

  const aliasedCandidate = JSON.parse(JSON.stringify(admitted));
  aliasedCandidate.admission.document_read_grant_ref = aliasedCandidate.admission.project_binding_ref;
  freezeOwnData(aliasedCandidate);
  const aliasResult = buildProjectPdfKnowledgeCandidate(buildRequest(admitted, {
    admitted_candidate: aliasedCandidate,
    trusted_source_revision_receipt_sha256: trustedReceipt,
  }));

  assert.equal(getterReads, 0);
  assert.equal(refGetterReads, 0);
  assert.equal(expectedRefGetterReads, 0);
  assert.equal(accessorResult.candidate, null);
  assert.equal(accessorResult.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_CANDIDATE_REFUSED");
  assert.equal(refAccessorResult.candidate, null);
  assert.equal(refAccessorResult.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_CANDIDATE_REFUSED");
  assert.equal(expectedRefResult.candidate, null);
  assert.equal(expectedRefResult.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_REQUEST_INVALID");
  assert.equal(aliasResult.candidate, null);
  assert.equal(aliasResult.receipt.blocker.code, "PROJECT_PDF_KNOWLEDGE_BUILDING_CANDIDATE_REFUSED");
});

test("contains no filesystem writer or delete surface", () => {
  const source = readFileSync(new URL("./project_pdf_knowledge_projection.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(source, /node:fs/u);
  assert.doesNotMatch(source, /\b(?:rmSync|unlinkSync|writeFileSync|mkdirSync)\b/u);
  assert.doesNotMatch(source, /\b(?:import\s*\(|require\s*\(|process\.|globalThis\.)/u);
});

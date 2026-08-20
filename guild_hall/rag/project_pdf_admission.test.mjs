// TDD cycle 1 (red). This tracer names the project pdf admission seam before it
// exists: the import below must fail with ERR_MODULE_NOT_FOUND until
// ./project_pdf_admission.mjs is written. It covers the happy path only — one
// pinned launch, one bound read grant, one admitted candidate.
import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
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
  extractAdmittedProjectPdfCandidate,
  inspectPinnedProjectPdfAdmissionLaunch,
  runProjectPdfAdmissionCli,
} from "./project_pdf_admission.mjs";

// The same public synthetic one-page PDF the ingest seam is pinned against.
// No project payload, no private source.
const FIXTURE_BASE64 =
  "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjcuMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjcuMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDMwMCAyMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDk5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42h2KMQrDQAwEe71CP7Ckk/ZcBBeBNOkC6oKrw4cLu0jj9+cwWwwzLP3omaQsY8oFrDZznjTt23GxKmfn7yMKeg00YNBQESYh7g6T6qMoCqKaCez+tWG+rPmmV9KH/oHxFqwKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMjAgMDAwMDAgbiAKMDAwMDAwMDQwOSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MTdDM0FDQzI5MDY4QzI5MjU2QzM4NzdFMTRDMzhGQzM+PDhEOENBRUNDNzNGREU3MkRGNDc5NzBGQzM0NUQ3ODNFPl0+PgpzdGFydHhyZWYKNTc2CiUlRU9GCg==";
const FIXTURE_BYTE_COUNT = 850;
const FIXTURE_PDF_SHA256 = "dabb2b0ac21c6506a621f3bfe6d0685e7e3eda2886f205c4ef066c7f656326a3";
const FIXTURE_TEXT = "Soulforge PDF tracer bullet\n";
const FIXTURE_CHARACTER_COUNT = 28;
const FIXTURE_TEXT_SHA256 = "3dceeabc3c008cd7e7700aa1414a0b522cdd091d8f5618b625e0bbbfe7347b86";

const LAUNCH_SCHEMA_VERSION = "soulforge.project_pdf_admission_launch.v0";
const READ_GRANT_SCHEMA_VERSION = "soulforge.project_pdf_read_grant.v0";
const ADMITTED_CANDIDATE_SCHEMA_VERSION = "soulforge.admitted_project_pdf_candidate.v0";
const COMMAND_RECEIPT_SCHEMA_VERSION = "soulforge.project_pdf_admission_command_receipt.v0";

const READ_GRANT_HASH_DOMAIN = "soulforge.project_pdf_admission.document_read_grant.v0";
const PORTABLE_MATERIAL_HASH_DOMAIN = "soulforge.project_pdf_admission.portable_material.v0";
const RELATIVE_LOCATOR_HASH_DOMAIN = "soulforge.project_pdf_admission.relative_locator.v0";

const READ_GRANT_AUTHORITY_CEILING = "single_pdf_candidate_extraction_only";
const MEDIA_TYPE = "application/pdf";
const RELATIVE_LOCATOR = "documents/tracer.pdf";

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

// Options only reshape the synthetic fixture: another locator, other document
// bytes (null writes no document at all) or another pinned digest. Every variant
// is rebuilt from those values, so each one stays validly bound and repinned.
function admissionFixture(options = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), "soulforge-pdf-admission-"));
  const containmentRoot = join(tempRoot, "workspace");
  const projectRoot = join(containmentRoot, "project");
  const commonRoot = join(containmentRoot, "common");
  mkdirSync(join(projectRoot, "documents"), { recursive: true });
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

  const documentBytes = options.documentBytes === undefined
    ? Buffer.from(FIXTURE_BASE64, "base64")
    : options.documentBytes;
  const documentPath = join(projectRoot, "documents", "tracer.pdf");
  if (documentBytes !== null) writeFileSync(documentPath, documentBytes);

  const locator = options.locator ?? RELATIVE_LOCATOR;
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
      content_id: `sha256:${options.documentSha256 ?? FIXTURE_PDF_SHA256}`,
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
  // `canonicalise` NFC-normalises every string it serialises, so a locator whose
  // non-NFC form is the thing under test would be silently repaired on its way to
  // disk and the seam would never see the form this fixture named. Such a launch
  // is serialised verbatim instead and pinned over those exact bytes; the grant
  // binding is unaffected, because both sides still hash the locator canonically.
  const launchBytes = locator.normalize("NFC") === locator
    ? canonicalBytes(launch)
    : Buffer.from(`${JSON.stringify(launch)}\n`, "utf8");
  const launchPath = join(tempRoot, "launch.json");
  writeFileSync(launchPath, launchBytes);

  return {
    documentBytes,
    tempRoot,
    projectRoot,
    documentPath,
    projectRef,
    readGrant,
    view,
    launch: structuredClone(launch),
    launchPath,
    expectedLaunchSha256: sha256Hex(launchBytes),
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

// The inner candidate stays byte for byte the existing ingest seam output.
function expectedIngestCandidate() {
  return {
    schema_version: "soulforge.project_document_ingest_candidate.v0",
    status: "candidate",
    source: {
      media_type: MEDIA_TYPE,
      sha256: FIXTURE_PDF_SHA256,
      byte_count: FIXTURE_BYTE_COUNT,
    },
    extraction: {
      engine: "pymupdf",
      page_count: 1,
      character_count: FIXTURE_CHARACTER_COUNT,
      text_sha256: FIXTURE_TEXT_SHA256,
      pages: [{ page_number: 1, text: FIXTURE_TEXT }],
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
  };
}

function expectedAdmittedCandidate(state) {
  return {
    schema_version: ADMITTED_CANDIDATE_SCHEMA_VERSION,
    kind: "admitted_project_pdf_candidate",
    status: "candidate",
    feature_state: "off",
    route: "validation_only",
    admission: {
      project_binding_ref: state.projectRef,
      document_revision_ref: state.readGrant.document_revision_ref,
      document_read_grant_ref: state.readGrant.grant_ref,
      knowledge_scope_fingerprint_sha256: state.view.knowledge_scope_fingerprint_sha256,
      local_admission_fingerprint_sha256: state.view.local_admission_fingerprint_sha256,
      portable_material_fingerprint_sha256: portableMaterialFingerprint(state.readGrant),
      relative_locator_fingerprint_sha256: relativeLocatorFingerprint(state.readGrant),
      knowledge_view_project_read_allowed: false,
      document_read_grant_binding_verified: true,
    },
    ingest_candidate: expectedIngestCandidate(),
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
  };
}

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

test("admits one pinned launch and returns the exact closed admitted project pdf candidate", async () => {
  const state = admissionFixture();
  try {
    assert.equal(state.documentBytes.byteLength, FIXTURE_BYTE_COUNT);
    assert.equal(sha256Hex(state.documentBytes), FIXTURE_PDF_SHA256);

    const admitted = await extractAdmittedProjectPdfCandidate({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
    });

    assert.deepEqual(admitted, expectedAdmittedCandidate(state));
    assert.deepEqual(Object.keys(admitted), [
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
    assert.deepEqual(Object.keys(admitted.admission), [
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
    assert.deepEqual(Object.keys(admitted.authority), [
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
    assert.deepEqual(Object.keys(admitted.effects), [
      "persistent_writes",
      "network_calls",
      "model_calls",
      "rag_index_writes",
      "wiki_writes",
      "engine_calls",
    ]);

    assertDeeplyFrozen(admitted, "admitted_project_pdf_candidate");
  } finally {
    state.cleanup();
  }
});

test("stable-inspects one pinned launch binding without opening the project document", () => {
  const state = admissionFixture();
  try {
    rmSync(state.documentPath, { force: true });
    const inspection = inspectPinnedProjectPdfAdmissionLaunch({
      launchPath: state.launchPath,
      expectedLaunchSha256: state.expectedLaunchSha256,
    });
    assert.deepEqual(inspection, {
      schema_version: "soulforge.project_pdf_admission_launch_inspection.v0",
      kind: "project_pdf_admission_launch_inspection",
      status: "inspected",
      feature_state: "off",
      launch_sha256: state.expectedLaunchSha256,
      launch_byte_count: readFileSync(state.launchPath).byteLength,
      project_binding_ref: state.projectRef,
      document_revision_ref: state.readGrant.document_revision_ref,
      document_read_grant_ref: state.readGrant.grant_ref,
    });
  } finally {
    state.cleanup();
  }
});

// One adversarial characterisation of the same seam. The outer launch pin is
// verified over the raw bytes before any decode, any parse and any root or pdf
// access, so a launch whose bytes cannot parse at all must still fail on the
// pin. A `launch_undecodable` refusal here would mean the pin moved behind the
// parse and unpinned bytes reached a reader first.
test("refuses a mismatched launch pin before the launch bytes are decoded", async () => {
  const state = admissionFixture();
  try {
    // Deliberately not json: only a parse attempt could tell this apart from
    // the pinned launch it replaces.
    const undecodableLaunchBytes = Buffer.from("{ launch, not json\n", "utf8");
    writeFileSync(state.launchPath, undecodableLaunchBytes);

    // Valid pin format, wrong value. Stated as a premise so the refusal cannot
    // be read as an accidental collision, and compared without printing either
    // digest.
    const wrongLaunchSha256 = "0".repeat(64);
    assert.equal(
      wrongLaunchSha256 === sha256Hex(undecodableLaunchBytes),
      false,
      "wrong pin must not match the rewritten launch",
    );
    assert.equal(
      wrongLaunchSha256 === state.expectedLaunchSha256,
      false,
      "wrong pin must not match the original launch",
    );

    await assert.rejects(
      extractAdmittedProjectPdfCandidate({
        launchPath: state.launchPath,
        expectedLaunchSha256: wrongLaunchSha256,
      }),
      (error) => {
        assert.equal(error.name, "ProjectPdfAdmissionError");
        assert.equal(error.code, "launch_digest_mismatch");
        assert.equal(
          error.message,
          "project pdf admission launch digest does not match the expected pin",
        );
        // Payload free: the refusal carries the fixed code and nothing else,
        // so no path, body, locator, ref or digest can ride out on it.
        assert.deepEqual(Object.keys(error), ["code"]);
        return true;
      },
    );
  } finally {
    state.cleanup();
  }
});

// A second adversarial characterisation of the same seam. The launch is
// canonically rewritten and repinned, so the outer pin passes and the launch
// contract still sees a well formed exact ref: the substituted expectation is
// the Knowledge View authority grant ref, a real ref carried by the same
// launch. Only the read grant binding check can tell the two apart, so a
// `launch_contract_refused` here — or any later refusal — would mean the grant
// expectation is satisfied by ref shape rather than by the exact grant it names.
test("refuses a read grant expectation substituted with the authority grant ref", async () => {
  const state = admissionFixture();
  try {
    const substitutedRef = structuredClone(
      state.launch.expected_project_knowledge_view_authority_grant_ref,
    );
    // Stated as a premise so the refusal cannot be read as the two refs
    // happening to agree, and compared without printing either ref.
    assert.equal(
      substitutedRef.entity_id === state.readGrant.grant_ref.entity_id,
      false,
      "substituted expectation must not name the read grant",
    );

    const substitutedLaunch = {
      ...structuredClone(state.launch),
      expected_document_read_grant_ref: substitutedRef,
    };
    const substitutedLaunchBytes = canonicalBytes(substitutedLaunch);
    writeFileSync(state.launchPath, substitutedLaunchBytes);

    // Repinned over the rewritten bytes, so the outer pin cannot be the thing
    // that refuses.
    const substitutedLaunchSha256 = sha256Hex(substitutedLaunchBytes);
    assert.equal(
      substitutedLaunchSha256 === state.expectedLaunchSha256,
      false,
      "rewritten launch must not reuse the original pin",
    );

    await assert.rejects(
      extractAdmittedProjectPdfCandidate({
        launchPath: state.launchPath,
        expectedLaunchSha256: substitutedLaunchSha256,
      }),
      (error) => {
        assert.equal(error.name, "ProjectPdfAdmissionError");
        assert.equal(error.code, "read_grant_refused");
        assert.equal(
          error.message,
          "project pdf admission document read grant is refused",
        );
        // Payload free: the refusal carries the fixed code and nothing else, so
        // no ref, grant field, locator, path or digest can ride out on it.
        assert.deepEqual(Object.keys(error), ["code"]);
        return true;
      },
    );
  } finally {
    state.cleanup();
  }
});

// An ordinary in-memory sink. Its only method is `write`, so the seam cannot
// reach for a file descriptor, a path, an end/flush hook or any other stream
// capability through the io it is handed.
function writableSink() {
  const chunks = [];
  return {
    sink: {
      write(chunk) {
        chunks.push(chunk);
        return true;
      },
    },
    text: () => chunks.join(""),
  };
}

// The receipt is the whole observable output of the command: counted reads,
// counted effects, verified pins and refused gates. Every value is a boolean, a
// count, a fixed enum or a domain separated fingerprint, so no path, locator,
// ref, body or extracted text is carried out on it.
function expectedCommandReceipt(state) {
  return {
    schema_version: COMMAND_RECEIPT_SCHEMA_VERSION,
    mode: "read_only",
    feature_state: "off",
    result: "PASS",
    blocker_code: null,
    blocker_stage: null,
    launch: {
      pin_verified: true,
      sha256: state.expectedLaunchSha256,
      byte_count: canonicalBytes(state.launch).byteLength,
    },
    admission: {
      knowledge_view_verified: true,
      knowledge_view_project_read_allowed: false,
      document_read_grant_binding_verified: true,
      project_binding_verified: true,
      local_admission_verified: true,
      portable_material_fingerprint_sha256: portableMaterialFingerprint(state.readGrant),
      relative_locator_fingerprint_sha256: relativeLocatorFingerprint(state.readGrant),
    },
    document: {
      stable_open_verified: true,
      pin_verified: true,
      sha256: FIXTURE_PDF_SHA256,
      byte_count: FIXTURE_BYTE_COUNT,
    },
    extraction: {
      completed: true,
      engine: "pymupdf",
      page_count: 1,
      character_count: FIXTURE_CHARACTER_COUNT,
      text_sha256: FIXTURE_TEXT_SHA256,
    },
    reads: {
      launch_files: 1,
      project_documents: 1,
    },
    persistence: {
      state: "not_requested",
      persistent_file_writes: 0,
    },
    effects: {
      filesystem_writes: 0,
      network_calls: 0,
      model_calls: 0,
      rag_index_writes: 0,
      wiki_writes: 0,
      engine_calls: 0,
      erp_writes: 0,
      taskdriver_activated: false,
    },
    gates: {
      source_truth_accepted: false,
      canon_accepted: false,
      project_state_accepted: false,
      owner_decision_made: false,
      activation_allowed: false,
    },
    canon_claim_ceiling: "observed",
  };
}

// The command surface over the same admission seam. The receipt is the only
// thing emitted and it goes to stderr, so stdout stays exactly empty and cannot
// become a data channel a caller pipes somewhere. Comparing the emitted line
// against `JSON.stringify` of the expected receipt pins the key order too, so
// the serialised form cannot drift from the returned value.
test("runs one pinned launch through the cli seam and emits one closed read only receipt", async () => {
  const state = admissionFixture();
  try {
    const stdout = writableSink();
    const stderr = writableSink();

    const receipt = await runProjectPdfAdmissionCli(
      ["--launch", state.launchPath, "--launch-sha256", state.expectedLaunchSha256],
      { stdout: stdout.sink, stderr: stderr.sink },
    );

    const expected = expectedCommandReceipt(state);
    assert.equal(stdout.text(), "");
    assert.equal(stderr.text(), `${JSON.stringify(expected)}\n`);
    assert.deepEqual(receipt, expected);
    assertDeeplyFrozen(receipt, "project_pdf_admission_command_receipt");
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- helpers

// The fixed refusal messages, restated here rather than imported: a seam that
// renamed one of them would still have to keep this contract.
const ERROR_MESSAGES = {
  request_invalid: "project pdf admission request is invalid",
  launch_unreadable: "project pdf admission launch is unreadable",
  launch_too_large: "project pdf admission launch exceeds the byte cap",
  launch_undecodable: "project pdf admission launch is not decodable json",
  launch_contract_refused: "project pdf admission launch contract is refused",
  read_grant_refused: "project pdf admission document read grant is refused",
  knowledge_view_refused: "project pdf admission knowledge view is refused",
  admission_binding_refused: "project pdf admission binding is refused",
  root_binding_refused: "project pdf admission project root binding is refused",
  locator_refused: "project pdf admission relative locator is refused",
  document_unreadable: "project pdf admission document is unreadable",
  document_too_large: "project pdf admission document exceeds the byte cap",
  document_digest_mismatch:
    "project pdf admission document digest does not match the expected pin",
  candidate_refused: "project pdf admission candidate extraction is refused",
  receipt_failed: "project pdf admission receipt could not be emitted",
};

// Payload free on every refusal: the fixed code, the fixed message, no own key
// besides the code, so no path, ref, locator, digest or body can ride out.
function refusal(code) {
  return (error) => {
    assert.equal(error.name, "ProjectPdfAdmissionError");
    assert.equal(error.code, code);
    assert.equal(error.message, ERROR_MESSAGES[code]);
    assert.deepEqual(Object.keys(error), ["code"]);
    return true;
  };
}

const admit = (launchPath, expectedLaunchSha256) => extractAdmittedProjectPdfCandidate({
  launchPath,
  expectedLaunchSha256,
});

// Rewrites the launch canonically and returns the pin over the rewritten bytes,
// so the outer pin can never be the thing that refuses a mutation case.
function repin(state, mutate) {
  const launch = structuredClone(state.launch);
  mutate(launch);
  const bytes = canonicalBytes(launch);
  writeFileSync(state.launchPath, bytes);
  return sha256Hex(bytes);
}

// Rebinds the read grant ref over the patched grant and mirrors it into the
// launch expectation, so a substituted field is refused on its meaning alone.
function rebindGrant(launch, patch) {
  const grant = bindDocumentReadGrant({ ...launch.document_read_grant, ...patch });
  launch.document_read_grant = grant;
  launch.expected_document_read_grant_ref = structuredClone(grant.grant_ref);
}

// A host that genuinely cannot make this link form skips that row alone.
const LINK_UNSUPPORTED = new Set(["EPERM", "EACCES", "EINVAL", "ENOSYS", "ENOTSUP", "UNKNOWN"]);

function tryLink(create) {
  try {
    create();
    return true;
  } catch (error) {
    if (LINK_UNSUPPORTED.has(error?.code)) return false;
    throw error;
  }
}

const relink = (path, type) => tryLink(() => {
  renameSync(path, `${path}_real`);
  symlinkSync(`${path}_real`, path, type);
});

async function cli(argv, io) {
  const stdout = writableSink();
  const stderr = writableSink();
  const receipt = await runProjectPdfAdmissionCli(
    argv,
    io ?? { stdout: stdout.sink, stderr: stderr.sink },
  );
  return { receipt, out: stdout.text(), err: stderr.text() };
}

const RECEIPT_KEYS = [
  "schema_version", "mode", "feature_state", "result", "blocker_code", "blocker_stage",
  "launch", "admission", "document", "extraction", "reads", "persistence", "effects",
  "gates", "canon_claim_ceiling",
];
const NO_EFFECTS = {
  filesystem_writes: 0, network_calls: 0, model_calls: 0, rag_index_writes: 0,
  wiki_writes: 0, engine_calls: 0, erp_writes: 0, taskdriver_activated: false,
};
// No key anywhere in a receipt may be one of the raw payload names this seam
// handles: a path, a locator, a body, page text, a message, a stack, a ref
// field, an argument, a token or a raw error, at any depth. Matched exactly
// rather than by substring, because the receipt contract requires
// `relative_locator_fingerprint_sha256` — a domain separated digest of the
// locator, not the locator itself — and a substring rule refuses the very key
// the receipt must carry.
const FORBIDDEN_RECEIPT_KEYS = new Set([
  "path", "paths", "launch_path", "launchPath", "document_path", "documentPath",
  "root_path", "project_root_path", "common_root_path", "containment_root_path",
  "real_path", "comparable_real_path", "local_path",
  "locator", "relative_locator", "locator_segments", "segments",
  "body", "bytes", "text", "content", "pages", "page_text",
  "message", "messages", "stack", "error", "errors", "cause",
  "entity", "entity_id", "revision", "revision_id", "content_id",
  "ref", "refs", "grant_ref", "policy_ref", "read_policy_ref", "authority_grant_ref",
  "project_binding_ref", "document_revision_ref", "document_read_grant_ref",
  "argv", "args", "arguments", "flag", "flags", "token", "tokens",
]);

function assertClosedReceipt(receipt) {
  assert.deepEqual(Object.keys(receipt), RECEIPT_KEYS);
  assertDeeplyFrozen(receipt, "project_pdf_admission_command_receipt");
  const walk = (node, trail) => {
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      assert.equal(
        FORBIDDEN_RECEIPT_KEYS.has(key), false, `${trail}.${key} must carry no payload`,
      );
      walk(value, `${trail}.${key}`);
    }
  };
  walk(receipt, "receipt");
}

function assertHold(result, { code, stage, launchFiles, projectDocuments, secrets = [] }) {
  const { receipt, out, err } = result;
  assert.equal(out, "", "stdout must stay exactly empty");
  assert.equal(err, `${JSON.stringify(receipt)}\n`);
  assert.equal(err.split("\n").length, 2, "exactly one receipt line");
  assert.equal(receipt.result, "HOLD");
  assert.equal(receipt.blocker_code, code);
  assert.equal(receipt.blocker_stage, stage);
  assert.deepEqual(receipt.reads, {
    launch_files: launchFiles,
    project_documents: projectDocuments,
  });
  assert.deepEqual(receipt.effects, NO_EFFECTS);
  assert.equal(receipt.persistence.persistent_file_writes, 0);
  assert.equal(receipt.persistence.state, "not_requested");
  for (const secret of secrets) {
    assert.equal(err.includes(secret), false, "the receipt must not echo the refused input");
  }
  assertClosedReceipt(receipt);
}

// ---------------------------------------------------------------- direct seam

// The launch and the pin below are the ones that admit, so every refusal here is
// the request shape alone and is settled before the launch file is ever opened.
test("refuses every malformed admission request before any filesystem access", async () => {
  const state = admissionFixture();
  const ok = { launchPath: state.launchPath, expectedLaunchSha256: state.expectedLaunchSha256 };
  try {
    let traps = 0;
    const count = () => { traps += 1; return undefined; };
    const proxied = new Proxy({ ...ok }, {
      get: count,
      has: count,
      getOwnPropertyDescriptor: count,
      getPrototypeOf: () => { traps += 1; return Object.prototype; },
      ownKeys: () => { traps += 1; return []; },
    });
    await assert.rejects(extractAdmittedProjectPdfCandidate(proxied), refusal("request_invalid"));
    assert.equal(traps, 0, "a refused request must not run one proxy trap");

    let accessed = 0;
    const accessor = { expectedLaunchSha256: ok.expectedLaunchSha256 };
    Object.defineProperty(accessor, "launchPath", {
      enumerable: true,
      configurable: true,
      get() { accessed += 1; return ok.launchPath; },
    });
    await assert.rejects(extractAdmittedProjectPdfCandidate(accessor), refusal("request_invalid"));
    assert.equal(accessed, 0, "a refused request must not invoke one accessor");

    const malformed = [
      { ...ok, extra: 1 },
      { launchPath: ok.launchPath },
      { launchPath: 1, expectedLaunchSha256: ok.expectedLaunchSha256 },
      { launchPath: "documents/launch.json", expectedLaunchSha256: ok.expectedLaunchSha256 },
      { launchPath: ok.launchPath, expectedLaunchSha256: ok.expectedLaunchSha256.toUpperCase() },
      { launchPath: ok.launchPath, expectedLaunchSha256: ok.expectedLaunchSha256.slice(0, 63) },
      { launchPath: ok.launchPath, expectedLaunchSha256: `sha256:${ok.expectedLaunchSha256}` },
      { launchPath: ok.launchPath, expectedLaunchSha256: null },
      [ok.launchPath, ok.expectedLaunchSha256],
      null,
    ];
    for (const request of malformed) {
      await assert.rejects(extractAdmittedProjectPdfCandidate(request), refusal("request_invalid"));
    }
  } finally {
    state.cleanup();
  }
});

// Correctly pinned in every case, so the refusal names what the bytes are, not
// whether they match.
test("refuses correctly pinned launch bytes that cannot be read or decoded", async () => {
  const state = admissionFixture();
  try {
    const rewrite = (bytes) => {
      writeFileSync(state.launchPath, bytes);
      return sha256Hex(bytes);
    };
    const rows = [
      [Buffer.from([0x7b, 0xff, 0xfe, 0x7d, 0x0a]), "launch_undecodable"],
      [Buffer.from("{ launch, not json\n", "utf8"), "launch_undecodable"],
      [Buffer.alloc(2 * 1024 * 1024 + 1, 0x20), "launch_too_large"],
    ];
    for (const [bytes, code] of rows) {
      await assert.rejects(admit(state.launchPath, rewrite(bytes)), refusal(code));
    }

    const pin = rewrite(canonicalBytes(state.launch));
    assert.equal(pin, state.expectedLaunchSha256);
    if (tryLink(() => linkSync(state.launchPath, join(state.tempRoot, "launch_link.json")))) {
      await assert.rejects(admit(state.launchPath, pin), refusal("launch_unreadable"));
    }
  } finally {
    state.cleanup();
  }
});

// The pinned document is removed first, so any of these that reached an open
// would surface `document_unreadable` instead of the binding refusal it claims.
test("refuses launch, grant and admission bindings before the document is opened", async () => {
  const state = admissionFixture();
  try {
    rmSync(state.documentPath, { force: true });
    const foreignProjectRef = exactRef(21);
    const otherFingerprint = `sha256:${"1".repeat(64)}`;
    const rows = [
      ["launch_contract_refused", (launch) => { launch.unexpected_field = true; }],
      ["read_grant_refused", (launch) => {
        launch.document_read_grant.relative_locator = "documents/other.pdf";
      }],
      ["admission_binding_refused", (launch) => rebindGrant(launch, {
        project_binding_ref: foreignProjectRef,
      })],
      ["admission_binding_refused", (launch) => rebindGrant(launch, {
        knowledge_scope_fingerprint_sha256: otherFingerprint,
      })],
      ["admission_binding_refused", (launch) => rebindGrant(launch, {
        local_admission_fingerprint_sha256: otherFingerprint,
      })],
    ];
    for (const [code, mutate] of rows) {
      await assert.rejects(admit(state.launchPath, repin(state, mutate)), refusal(code));
    }
  } finally {
    state.cleanup();
  }
});

// Each locator is carried by a correctly rebound grant and a correctly repinned
// launch, so only the locator itself can be what refuses.
test("refuses every unsafe relative locator on a rebound grant and a repinned launch", async () => {
  const locators = [
    "../escape.pdf",
    "/documents/tracer.pdf",
    "documents\\tracer.pdf",
    "documents/tracer.pdf:stream",
    "documents/nul",
    "documents/tra\u0001cer.pdf",
    "documents/e\u0301.pdf",
    "documents/tracer.pdf.",
    "documents/tracer.pdf ",
  ];
  for (const locator of locators) {
    const state = admissionFixture({ locator });
    try {
      await assert.rejects(
        admit(state.launchPath, state.expectedLaunchSha256),
        refusal("locator_refused"),
      );
    } finally {
      state.cleanup();
    }
  }
});

// Real shapes in a temporary runtime. A linked root is refused by the view that
// re-resolves it, a linked ancestor or leaf, a hardlink, a directory and an
// empty file are refused at the one bounded read, and only pinned bytes that are
// not a pdf reach the extractor at all.
test("refuses linked, unstable and unpinned documents in a temporary runtime", async () => {
  const invalidPdf = Buffer.from("not a pdf\n", "utf8");
  const rows = [
    { code: "knowledge_view_refused", mutate: (s) => relink(s.projectRoot, "junction") },
    { code: "knowledge_view_refused", mutate: (s) => relink(s.projectRoot, "dir") },
    {
      code: "document_unreadable",
      mutate: (s) => relink(join(s.projectRoot, "documents"), "junction"),
    },
    { code: "document_unreadable", mutate: (s) => relink(join(s.projectRoot, "documents"), "dir") },
    { code: "document_unreadable", mutate: (s) => relink(s.documentPath, "file") },
    {
      code: "document_unreadable",
      mutate: (s) => tryLink(() => linkSync(s.documentPath, `${s.documentPath}.hard`)),
    },
    {
      code: "document_unreadable",
      options: { documentBytes: null },
      mutate: (s) => { mkdirSync(s.documentPath); },
    },
    { code: "document_unreadable", options: { documentBytes: Buffer.alloc(0) } },
    {
      code: "document_too_large",
      options: { documentBytes: Buffer.alloc(16 * 1024 * 1024 + 1, 0x20) },
    },
    {
      code: "document_digest_mismatch",
      options: { documentBytes: Buffer.from("%PDF-1.7\n% other bytes\n", "utf8") },
    },
    {
      code: "candidate_refused",
      options: { documentBytes: invalidPdf, documentSha256: sha256Hex(invalidPdf) },
    },
  ];
  for (const { code, options, mutate } of rows) {
    const state = admissionFixture(options);
    try {
      // Only this row is skipped when the host genuinely cannot make the link.
      if (mutate && mutate(state) === false) continue;
      await assert.rejects(admit(state.launchPath, state.expectedLaunchSha256), refusal(code));
    } finally {
      state.cleanup();
    }
  }
});

// ---------------------------------------------------------------- source shape

// The safe sequence is a property of the source, not of one lucky run: the root
// and the ancestor chain are snapshotted before the open, around the open and
// after the read, every open is bracketed by fstat, lstat and realpath, the read
// is exact sized with an eof probe, a posix host without O_NOFOLLOW fails
// closed, the extractor and the resolver are each called once, and the imports
// admit no write, network, process, model, rag, wiki, engine or erp surface.
test("pins the read only shape of the admission source", () => {
  const source = readFileSync(new URL("./project_pdf_admission.mjs", import.meta.url), "utf8");
  const count = (pattern, text = source) => (text.match(pattern) ?? []).length;
  const documentReader = source.slice(source.indexOf("function readBoundedProjectDocument"));

  assert.equal(count(/rootSnapshot\(projectRootPath\)/gu, documentReader), 4);
  assert.equal(count(/directoryChainSnapshot\(root, locatorSegments\)/gu, documentReader), 4);
  assert.equal(count(/openSync\(documentPath, SAFE_READ_OPEN_FLAGS\)/gu, documentReader), 1);
  assert.equal(count(/fstatSync\(descriptor, \{ bigint: true \}\)/gu, documentReader), 2);
  assert.equal(count(/lstatSync\(documentPath, \{ bigint: true \}\)/gu, documentReader), 2);
  assert.equal(count(/realpathSync\.native\(documentPath\)/gu, documentReader), 2);
  assert.equal(documentReader.includes("preflightBoundedNamedFile(documentPath, maxBytes)"), true);

  assert.equal(source.includes("const bytes = Buffer.alloc(size);"), true);
  assert.equal(source.includes("readSync(descriptor, Buffer.alloc(1), 0, 1, size) !== 0"), true);
  assert.equal(
    source.includes(
      'const SAFE_OPEN_AVAILABLE = process.platform === "win32" || O_NOFOLLOW !== 0;',
    ),
    true,
  );
  assert.equal(count(/if \(!SAFE_OPEN_AVAILABLE\) return \{ refusal:/gu), 2);
  assert.equal(count(/openSync\([A-Za-z]+, SAFE_READ_OPEN_FLAGS\)/gu), count(/openSync\(/gu));
  assert.equal(count(/extractProjectPdfCandidate\(/gu), 1);
  assert.equal(count(/resolveKnowledgeRoot\(/gu), 1);
  assert.equal(
    count(/resolveKnowledgeRoot\(projectRootPath, \{ containmentRoot: containmentRootPath \}\)/gu),
    1,
  );

  const fsImport = source.match(/import \{([^}]*)\} from "node:fs";/u);
  assert.notEqual(fsImport, null);
  assert.deepEqual(
    fsImport[1].split(",").map((name) => name.trim()).filter(Boolean).sort(),
    ["closeSync", "constants", "fstatSync", "lstatSync", "openSync", "readSync", "realpathSync"],
  );
  assert.equal(
    /\b(?:writeFileSync|writeSync|appendFileSync|mkdirSync|rmSync|rmdirSync|unlinkSync|renameSync|copyFileSync|truncateSync|chmodSync|chownSync|utimesSync|symlinkSync|linkSync|createWriteStream|createReadStream|opendirSync|readdirSync)\b/u
      .test(source),
    false,
  );
  assert.deepEqual(
    [...source.matchAll(/from "([^"]+)"/gu)].map((match) => match[1]).sort(),
    [
      "../engineering_engine/kernel/canonical.mjs",
      "../engineering_engine/kernel/identity.mjs",
      "../shared/knowledge_root_resolver.mjs",
      "../shared/physical_path_identity.mjs",
      "../shared/project_knowledge_view.mjs",
      "./project_document_ingest.mjs",
      "node:crypto",
      "node:fs",
      "node:path",
      "node:process",
      "node:util",
    ],
  );
  assert.equal(/import\s*\(|\brequire\s*\(|\bfetch\s*\(|new Function|eval\(/u.test(source), false);
  assert.equal(source.includes("Reflect.apply(streams.stdoutWrite"), false);
  assert.equal(count(/Reflect\.apply\(streams\.stderrWrite/gu), 1);
});

// ---------------------------------------------------------------- command

test("holds on every invalid command line without echoing it", async () => {
  const state = admissionFixture();
  const path = state.launchPath;
  const pin = state.expectedLaunchSha256;
  try {
    const rows = [
      [],
      ["--launch", path],
      ["--launch", path, "--launch-shas", pin],
      ["--launch", path, "--launch", path],
      ["--launch", path, "--launch-sha256"],
      ["--launch", path, "--launch-sha256", "--persist"],
      ["--launch", "", "--launch-sha256", pin],
      ["--launch", "documents/launch.json", "--launch-sha256", pin],
      ["--launch", path, "--launch-sha256", pin.toUpperCase()],
      ["--launch", path, "--launch-sha256", pin, "--persist", "1"],
    ];
    for (const argv of rows) {
      assertHold(await cli(argv), {
        code: "PROJECT_PDF_ADMISSION_ARGUMENTS_INVALID",
        stage: "arguments",
        launchFiles: 0,
        projectDocuments: 0,
        secrets: ["--persist", "--launch-shas", path, pin.toUpperCase()],
      });
    }

    let argvTraps = 0;
    const argvProxy = new Proxy(["--launch", path, "--launch-sha256", pin], {
      get: (target, key) => { argvTraps += 1; return target[key]; },
      has: (target, key) => { argvTraps += 1; return key in target; },
      getOwnPropertyDescriptor: (target, key) => {
        argvTraps += 1;
        return Object.getOwnPropertyDescriptor(target, key);
      },
      ownKeys: (target) => { argvTraps += 1; return Reflect.ownKeys(target); },
    });
    assertHold(await cli(argvProxy), {
      code: "PROJECT_PDF_ADMISSION_ARGUMENTS_INVALID",
      stage: "arguments",
      launchFiles: 0,
      projectDocuments: 0,
    });
    assert.equal(argvTraps, 0, "a refused argv must not run one proxy trap");

    let ioTraps = 0;
    const ioProxy = new Proxy({ stdout: writableSink().sink, stderr: writableSink().sink }, {
      get: () => { ioTraps += 1; return undefined; },
      has: () => { ioTraps += 1; return false; },
      getOwnPropertyDescriptor: () => { ioTraps += 1; return undefined; },
      ownKeys: () => { ioTraps += 1; return []; },
    });
    const ioReceipt = await runProjectPdfAdmissionCli(
      ["--launch", path, "--launch-sha256", pin],
      ioProxy,
    );
    assert.equal(ioReceipt.result, "HOLD");
    assert.equal(ioReceipt.blocker_code, "PROJECT_PDF_ADMISSION_IO_INVALID");
    assert.equal(ioReceipt.blocker_stage, "io");
    assert.deepEqual(ioReceipt.reads, { launch_files: 0, project_documents: 0 });
    assert.equal(ioTraps, 0, "a refused io must not run one proxy trap");
    assertClosedReceipt(ioReceipt);
  } finally {
    state.cleanup();
  }
});

test("holds with one exact receipt for every refused stage", async () => {
  const state = admissionFixture();
  try {
    const argv = (hash) => ["--launch", state.launchPath, "--launch-sha256", hash];
    const wrongPin = "0".repeat(64);
    // The launch file was opened and read to be able to refuse the pin at all,
    // so the receipt reports that read rather than an unreached zero.
    const mismatch = await cli(argv(wrongPin));
    assertHold(mismatch, {
      code: "PROJECT_PDF_ADMISSION_LAUNCH_HASH_MISMATCH",
      stage: "launch_binding",
      launchFiles: 1,
      projectDocuments: 0,
      secrets: [state.launchPath, state.tempRoot, wrongPin, state.expectedLaunchSha256,
        FIXTURE_PDF_SHA256, RELATIVE_LOCATOR, "%PDF"],
    });
    assert.equal(mismatch.receipt.launch.pin_verified, false);
    assert.equal(mismatch.receipt.launch.sha256, null);
    assert.equal(mismatch.receipt.launch.byte_count, null);

    const rewrite = (bytes) => {
      writeFileSync(state.launchPath, bytes);
      return sha256Hex(bytes);
    };
    const notUtf8 = await cli(argv(rewrite(Buffer.from([0x7b, 0xff, 0x7d, 0x0a]))));
    const notJson = await cli(argv(rewrite(Buffer.from("{ launch, not json\n", "utf8"))));
    assertHold(notUtf8, {
      code: "PROJECT_PDF_ADMISSION_LAUNCH_NOT_UTF8",
      stage: "launch_decode",
      launchFiles: 1,
      projectDocuments: 0,
      secrets: [state.launchPath],
    });
    assertHold(notJson, {
      code: "PROJECT_PDF_ADMISSION_LAUNCH_NOT_JSON",
      stage: "launch_parse",
      launchFiles: 1,
      projectDocuments: 0,
      secrets: [state.launchPath, "launch, not json"],
    });
    assert.notEqual(notUtf8.receipt.blocker_code, notJson.receipt.blocker_code);
    assert.notEqual(notUtf8.receipt.blocker_stage, notJson.receipt.blocker_stage);
  } finally {
    state.cleanup();
  }

  const unsafe = admissionFixture({ locator: "../escape.pdf" });
  try {
    assertHold(
      await cli(["--launch", unsafe.launchPath, "--launch-sha256", unsafe.expectedLaunchSha256]),
      {
        code: "PROJECT_PDF_ADMISSION_LOCATOR_REFUSED",
        stage: "locator",
        launchFiles: 1,
        projectDocuments: 0,
        secrets: ["escape.pdf", unsafe.projectRoot, unsafe.tempRoot],
      },
    );
  } finally {
    unsafe.cleanup();
  }

  const swapped = admissionFixture({
    documentBytes: Buffer.from("%PDF-1.7\n% other bytes\n", "utf8"),
  });
  try {
    const held = await cli(
      ["--launch", swapped.launchPath, "--launch-sha256", swapped.expectedLaunchSha256],
    );
    assertHold(held, {
      code: "PROJECT_PDF_ADMISSION_DOCUMENT_HASH_MISMATCH",
      stage: "document_binding",
      launchFiles: 1,
      projectDocuments: 1,
      secrets: [FIXTURE_PDF_SHA256, RELATIVE_LOCATOR, swapped.projectRoot, "%PDF"],
    });
    assert.equal(held.receipt.document.stable_open_verified, true);
    assert.equal(held.receipt.document.pin_verified, false);
    assert.equal(held.receipt.document.sha256, null);
    assert.equal(held.receipt.document.byte_count, null);
    assert.equal(held.receipt.extraction.completed, false);
    assert.equal(held.receipt.extraction.text_sha256, null);
  } finally {
    swapped.cleanup();
  }
});

// A receipt that cannot be written is not returned as if it had been, and the
// failure itself carries nothing but its fixed code.
test("raises the payload free receipt failure when the receipt cannot be emitted", async () => {
  const state = admissionFixture();
  try {
    const stdout = writableSink();
    await assert.rejects(
      runProjectPdfAdmissionCli(
        ["--launch", state.launchPath, "--launch-sha256", "0".repeat(64)],
        { stdout: stdout.sink, stderr: { write() { throw new Error("sink refused"); } } },
      ),
      refusal("receipt_failed"),
    );
    assert.equal(stdout.text(), "");
  } finally {
    state.cleanup();
  }
});

// Replayed on a cheap hold rather than an extraction: same input, same receipt,
// same line, and the launch file itself is left exactly as it was found.
test("replays one hold deterministically and leaves the launch unchanged", async () => {
  const state = admissionFixture({ locator: "documents/tracer.pdf." });
  try {
    const before = readFileSync(state.launchPath);
    const argv = () => ["--launch", state.launchPath, "--launch-sha256", state.expectedLaunchSha256];
    const first = await cli(argv());
    const second = await cli(argv());
    assert.equal(first.receipt.blocker_code, "PROJECT_PDF_ADMISSION_LOCATOR_REFUSED");
    assert.deepEqual(second.receipt, first.receipt);
    assert.equal(second.err, first.err);
    assert.equal(second.out, "");
    const after = readFileSync(state.launchPath);
    assert.equal(after.equals(before), true);
    assert.equal(sha256Hex(after), state.expectedLaunchSha256);
  } finally {
    state.cleanup();
  }
});

// ---------------------------------------------------------------- exotic edges

const REVOKED_REQUEST_MARKER = "soulforge-revoked-root-request-marker-3f7a";
const ASYNC_WRITE_MARKER = "soulforge-async-receipt-write-marker-9d2c";

// Payload free even against a caller that plants one: no marker it handed in,
// no raw exception text and no attached cause may survive on a refusal.
function assertCarriesNoMarker(error, marker) {
  const surface = `${error.name}\n${error.message}\n${error.stack ?? ""}\n${String(error)}`;
  assert.equal(surface.includes(marker), false, "the refusal must carry no planted marker");
  assert.equal(Object.hasOwn(error, "cause"), false, "the refusal must carry no cause");
}

// An ordinary sink whose `write` answers with a plain thenable that settles one
// microtask later. A plain thenable rather than a native promise, so a seam that
// drops the answer creates no unhandled native rejection and the regression
// reports what the seam did with the answer instead of the runner's rejection
// policy. `consumed` counts the answers a caller actually took, so an answer
// that was never awaited stays visible as zero.
function asyncWritableSink(rejectWith) {
  const chunks = [];
  let consumed = 0;
  return {
    sink: {
      write(chunk) {
        chunks.push(chunk);
        return {
          then(onFulfilled, onRejected) {
            queueMicrotask(() => {
              consumed += 1;
              if (rejectWith === undefined) onFulfilled?.(true);
              else onRejected?.(rejectWith);
            });
          },
        };
      },
    },
    writes: () => chunks.length,
    consumed: () => consumed,
    text: () => chunks.join(""),
  };
}

// One bounded turn, so a dropped answer has had its chance to reach the process
// before the assertions that follow run.
const settleOneTurn = () => new Promise((resolve) => { setImmediate(resolve); });

// A revoked proxy is still an object and still answers `typeof`, so the root
// request check must recognise the exotic surface rather than ask a question a
// revoked proxy cannot answer. The handler below is proven live and marked
// before the revoke, so the zero at the end is a trap that could have run and
// did not. The seam's contract is one fixed, payload free `request_invalid`: a
// raw `TypeError`, the revoked proxy's own text, the planted marker or any own
// key besides the code would all mean the refusal is carrying something out.
test("refuses a revoked proxy root request with the fixed payload free refusal", async () => {
  const state = admissionFixture();
  try {
    let traps = 0;
    const marked = () => { traps += 1; return REVOKED_REQUEST_MARKER; };
    const { proxy, revoke } = Proxy.revocable(
      { launchPath: state.launchPath, expectedLaunchSha256: state.expectedLaunchSha256 },
      {
        get: marked,
        has: () => { traps += 1; return true; },
        getOwnPropertyDescriptor: () => {
          traps += 1;
          return {
            value: REVOKED_REQUEST_MARKER,
            writable: true,
            enumerable: true,
            configurable: true,
          };
        },
        ownKeys: () => { traps += 1; return ["launchPath", "expectedLaunchSha256"]; },
        getPrototypeOf: () => { traps += 1; return Object.prototype; },
      },
    );
    // Stated as a premise, so the zero below cannot be read as a handler that
    // was never capable of running in the first place.
    assert.equal(proxy.launchPath, REVOKED_REQUEST_MARKER, "the trap must be installed");
    assert.equal(traps, 1, "the trap must be observable before the revoke");
    revoke();
    traps = 0;

    await assert.rejects(extractAdmittedProjectPdfCandidate(proxy), (error) => {
      refusal("request_invalid")(error);
      assert.equal(error instanceof TypeError, false, "no raw TypeError may reach a caller");
      assertCarriesNoMarker(error, REVOKED_REQUEST_MARKER);
      assert.equal(
        /revoked|IsArray/u.test(`${error.message}\n${error.stack ?? ""}`),
        false,
        "the revoked proxy's own exception text must not survive",
      );
      return true;
    });
    assert.equal(traps, 0, "a refused request must not run one proxy trap");
  } finally {
    state.cleanup();
  }
});

// The command surface returns the receipt it emitted. A sink whose `write`
// answers with a rejected thenable emitted nothing, so that receipt must not be
// handed back as if it had been: the public promise must refuse with the same
// fixed, payload free receipt failure the synchronous throw already yields,
// nothing may be retried, stdout must stay exactly empty, the sink's own reason
// must not survive on the refusal, and no rejection may escape to the process.
// The fulfilled half pins the other side of the same contract: an answer that
// settles later must be taken before the returned receipt resolves, and one
// line is still one line.
test("contains a rejected async receipt write and awaits a fulfilled one", async () => {
  const state = admissionFixture();
  const escaped = [];
  const captureEscape = (reason) => { escaped.push(reason); };
  process.on("unhandledRejection", captureEscape);
  try {
    // A cheap hold, so the receipt under test is settled long before the sink.
    const argv = () => ["--launch", state.launchPath, "--launch-sha256", "0".repeat(64)];

    const refusedStdout = writableSink();
    const refusedStderr = asyncWritableSink(new Error(ASYNC_WRITE_MARKER));
    await assert.rejects(
      runProjectPdfAdmissionCli(argv(), {
        stdout: refusedStdout.sink,
        stderr: refusedStderr.sink,
      }),
      (error) => {
        refusal("receipt_failed")(error);
        assertCarriesNoMarker(error, ASYNC_WRITE_MARKER);
        return true;
      },
    );
    await settleOneTurn();
    assert.equal(refusedStderr.consumed(), 1, "the write answer must be awaited");
    assert.equal(refusedStderr.writes(), 1, "a refused receipt must not be written twice");
    assert.equal(refusedStdout.text(), "", "stdout must stay exactly empty");
    assert.deepEqual(escaped, [], "no rejection may escape to the process");

    const emittedStdout = writableSink();
    const emittedStderr = asyncWritableSink();
    const receipt = await runProjectPdfAdmissionCli(argv(), {
      stdout: emittedStdout.sink,
      stderr: emittedStderr.sink,
    });
    assert.equal(
      emittedStderr.consumed(),
      1,
      "a fulfilled write answer must be taken before the receipt resolves",
    );
    assert.equal(emittedStderr.writes(), 1, "exactly one receipt write");
    assert.equal(emittedStdout.text(), "", "stdout must stay exactly empty");
    assert.equal(emittedStderr.text(), `${JSON.stringify(receipt)}\n`);
    assert.equal(emittedStderr.text().split("\n").length, 2, "exactly one receipt line");
    assert.equal(receipt.result, "HOLD");
    assert.equal(receipt.blocker_code, "PROJECT_PDF_ADMISSION_LAUNCH_HASH_MISMATCH");
    assertClosedReceipt(receipt);
    await settleOneTurn();
    assert.deepEqual(escaped, [], "no rejection may escape to the process");
  } finally {
    process.off("unhandledRejection", captureEscape);
    state.cleanup();
  }
});

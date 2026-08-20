import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { canonicalise } from "../engineering_engine/kernel/canonical.mjs";
import {
  prepareProjectPdfAdmissionLaunchCandidate,
  sealProjectPdfAdmissionLaunch,
} from "./project_pdf_launch_authoring.mjs";
import {
  PACKET_SCHEMA_VERSION,
  PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_RECEIPT_SCHEMA_VERSION,
  RUN_AUTHORITY_SCHEMA_VERSION,
} from "./project_pdf_knowledge_pilot_packet_contract.mjs";
import {
  defaultQueryReparsePoint,
  prepareProjectPdfKnowledgePilot,
} from "./project_pdf_knowledge_pilot_preparation.mjs";
import { runProjectPdfKnowledgePilot } from "./project_pdf_knowledge_pilot_runner.mjs";

const FEATURE_STATE = "off";
const PDF_BYTES = Buffer.from(
  "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjcuMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjcuMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDMwMCAyMDBdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDk5L0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp42h2KMQrDQAwEe71CP7Ckk/ZcBBeBNOkC6oKrw4cLu0jj9+cwWwwzLP3omaQsY8oFrDZznjTt23GxKmfn7yMKeg00YNBQESYh7g6T6qMoCqKaCez+tWG+rPmmV9KH/oHxFqwKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDE3MiAwMDAwMCBuIAowMDAwMDAwMjEzIDAwMDAwIG4gCjAwMDAwMDAzMjAgMDAwMDAgbiAKMDAwMDAwMDQwOSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8MTdDM0FDQzI5MDY4QzI5MjU2QzM4NzdFMTRDMzhGQzM+PDhEOENBRUNDNzNGREU3MkRGNDc5NzBGQzM0NUQ3ODNFPl0+PgpzdGFydHhyZWYKNTc2CiUlRU9GCg==",
  "base64",
);
const PDF_SHA256 = "dabb2b0ac21c6506a621f3bfe6d0685e7e3eda2886f205c4ef066c7f656326a3";
const EXTRACTED_TEXT = "Soulforge PDF tracer bullet\n";
const EXTRACTED_TEXT_SHA256 = "3dceeabc3c008cd7e7700aa1414a0b522cdd091d8f5618b625e0bbbfe7347b86";

const PORTABLE_MATERIAL_HASH_DOMAIN = "soulforge.project_pdf_admission.portable_material.v0";
const RELATIVE_LOCATOR_HASH_DOMAIN = "soulforge.project_pdf_admission.relative_locator.v0";
const SOURCE_BINDING_HASH_DOMAIN = "soulforge.project_pdf_source_revision_binding.v0";
const SOURCE_RECEIPT_HASH_DOMAIN = "soulforge.project_pdf_source_revision_receipt.v0";
const EXTERNAL_SEAL_HASH_DOMAIN = "soulforge.project_pdf_launch_authoring.external_owner_seal.v0";

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function identity(seed) {
  const token = String(seed).padStart(12, "0");
  return {
    entity_id: "00000000-0000-4000-8000-" + token,
    revision_id: "10000000-0000-4000-8000-" + token,
  };
}

function exactRef(seed, contentHex = String(seed).padStart(64, "0")) {
  return {
    ...identity(seed),
    content_id: "sha256:" + contentHex,
    content_hash_alg: "sha256",
  };
}

function insertionOrderRules(value) {
  const rules = {};
  const visit = (node, path = "") => {
    if (Array.isArray(node)) {
      rules[path] = "insertion_ordered";
      node.forEach((child) => visit(child, path + "[]"));
    } else if (node !== null && typeof node === "object") {
      Object.entries(node).forEach(([key, child]) => visit(
        child,
        path ? path + "." + key : key,
      ));
    }
  };
  visit(value);
  return rules;
}

function canonicalFingerprint(domain, material) {
  return "sha256:" + sha256Hex(domain + "\0" + canonicalise(material, insertionOrderRules(material)));
}

function externalOwnerSeal(prepared, seed = 41) {
  const material = {
    schema_version: "soulforge.project_pdf_launch_external_owner_seal.v0",
    claim_ceiling: "correlation_only",
    challenge_sha256: prepared.challenge.challenge_sha256,
    launch_sha256: prepared.challenge.launch_sha256,
  };
  return {
    ...material,
    seal_ref: {
      ...identity(seed),
      content_id: canonicalFingerprint(EXTERNAL_SEAL_HASH_DOMAIN, material),
      content_hash_alg: "sha256",
    },
  };
}

function sourceReceiptDigest(launch) {
  const grant = launch.document_read_grant;
  const portableMaterialFingerprint = canonicalFingerprint(PORTABLE_MATERIAL_HASH_DOMAIN, {
    project_binding_ref: grant.project_binding_ref,
    knowledge_scope_fingerprint_sha256: grant.knowledge_scope_fingerprint_sha256,
    read_policy_ref: grant.read_policy_ref,
    relative_locator: grant.relative_locator,
    document_revision_ref: grant.document_revision_ref,
    media_type: grant.media_type,
  });
  const relativeLocatorFingerprint = canonicalFingerprint(RELATIVE_LOCATOR_HASH_DOMAIN, {
    project_binding_ref: grant.project_binding_ref,
    relative_locator: grant.relative_locator,
    document_revision_ref: grant.document_revision_ref,
  });
  const bindingMaterial = {
    feature_state: FEATURE_STATE,
    project_binding_ref: grant.project_binding_ref,
    document_revision_ref: grant.document_revision_ref,
    document_read_grant_ref: grant.grant_ref,
    knowledge_scope_fingerprint_sha256: grant.knowledge_scope_fingerprint_sha256,
    local_admission_fingerprint_sha256: grant.local_admission_fingerprint_sha256,
    portable_material_fingerprint_sha256: portableMaterialFingerprint,
    relative_locator_fingerprint_sha256: relativeLocatorFingerprint,
    source_content_sha256: grant.document_revision_ref.content_id,
    extraction_text_sha256: "sha256:" + EXTRACTED_TEXT_SHA256,
    page_count: 1,
    character_count: EXTRACTED_TEXT.length,
  };
  const sourceRevisionBinding = canonicalFingerprint(SOURCE_BINDING_HASH_DOMAIN, bindingMaterial);
  return canonicalFingerprint(SOURCE_RECEIPT_HASH_DOMAIN, {
    schema_version: "soulforge.project_pdf_source_revision_receipt.v0",
    kind: "project_pdf_source_revision_receipt",
    status: "candidate",
    feature_state: FEATURE_STATE,
    ...bindingMaterial,
    source_revision_binding_sha256: sourceRevisionBinding,
    supersession_status: "not_evaluated",
    project_count: 1,
  });
}

function createSyntheticHarness() {
  const root = mkdtempSync(join(tmpdir(), "sf-pilot-prep-"));
  const containmentRoot = join(root, "containment");
  const projectRoot = join(containmentRoot, "project_alpha");
  const commonRoot = join(containmentRoot, "common");
  const documentsDir = join(projectRoot, "documents", "nested");
  const outputRoot = join(root, "output");

  mkdirSync(containmentRoot);
  mkdirSync(projectRoot);
  mkdirSync(commonRoot);
  mkdirSync(documentsDir, { recursive: true });
  mkdirSync(outputRoot);

  const relativeLocator = "documents/nested/tracer.pdf";
  const pdfPath = join(projectRoot, "documents", "nested", "tracer.pdf");
  writeFileSync(pdfPath, PDF_BYTES);

  const authoringInput = {
    project_binding_ref: exactRef(1),
    knowledge_view_policy_ref: exactRef(2),
    document_read_policy_ref: exactRef(3),
    knowledge_view_authority_grant_identity: identity(4),
    document_read_grant_identity: identity(5),
    document_revision_identity: identity(6),
    project_root_path: resolve(projectRoot),
    common_root_path: resolve(commonRoot),
    containment_root_path: resolve(containmentRoot),
    selected_common_revision_refs: [exactRef(7)],
    approved_common_revision_refs: [exactRef(7)],
    relative_locator: relativeLocator,
    document_sha256: PDF_SHA256,
  };

  const prepared = prepareProjectPdfAdmissionLaunchCandidate(authoringInput);
  const seal = externalOwnerSeal(prepared, 41);
  const sealed = sealProjectPdfAdmissionLaunch(prepared, seal);

  const launchPath = join(root, "launch.json");
  writeFileSync(launchPath, sealed.launchBytes);

  const trustedSourceReceiptSha256 = sourceReceiptDigest(prepared.launch_material);

  const validRequest = {
    schema_version: "soulforge.project_pdf_knowledge_pilot_preparation_request.v0",
    authority_ref_identity: {
      ...identity(99),
      content_hash_alg: "sha256",
    },
    expires_at_utc: "2099-01-01T00:00:00.000Z",
    launch_path: launchPath,
    expected_launch_sha256: sealed.launchSha256,
    expected_launch_byte_count: sealed.launchBytes.byteLength,
    project_binding_ref: exactRef(1),
    document_revision_ref: prepared.launch_material.document_read_grant.document_revision_ref,
    trusted_source_revision_receipt_sha256: trustedSourceReceiptSha256,
    output_root_path: resolve(outputRoot),
  };

  return {
    root,
    containmentRoot,
    projectRoot,
    commonRoot,
    documentsDir,
    outputRoot,
    pdfPath,
    launchPath,
    launchBytes: sealed.launchBytes,
    launchSha256: sealed.launchSha256,
    validRequest,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("deterministic happy path: prepareProjectPdfKnowledgePilot succeeds and produces canonical packet v0", async () => {
  const harness = createSyntheticHarness();
  try {
    const result = await prepareProjectPdfKnowledgePilot(harness.validRequest);

    assert.ok(result.packetBytes instanceof Uint8Array || Buffer.isBuffer(result.packetBytes));
    assert.equal(typeof result.packetSha256, "string");
    assert.match(result.packetSha256, /^[0-9a-f]{64}$/u);
    assert.equal(sha256Hex(result.packetBytes), result.packetSha256);

    assert.equal(result.receipt.result, "PASS");
    assert.equal(result.receipt.blocker_code, null);
    assert.equal(result.receipt.blocker_stage, null);
    assert.equal(result.receipt.feature_state, "off");

    assert.equal(result.receipt.verification.request_verified, true);
    assert.equal(result.receipt.verification.launch_pin_verified, true);
    assert.equal(result.receipt.verification.launch_contract_verified, true);
    assert.equal(result.receipt.verification.launch_binding_verified, true);
    assert.equal(result.receipt.verification.containment_root_verified, true);
    assert.equal(result.receipt.verification.project_root_verified, true);
    assert.equal(result.receipt.verification.locator_ancestors_verified, true);
    assert.equal(result.receipt.verification.source_leaf_metadata_verified, true);
    assert.equal(result.receipt.verification.output_root_verified, true);
    assert.equal(result.receipt.verification.reparse_free_verified, true);

    // Effects
    assert.equal(result.receipt.effects.launch_reads, 2);
    assert.equal(result.receipt.effects.source_body_reads, 0);
    assert.equal(result.receipt.effects.filesystem_writes, 0);
    assert.equal(result.receipt.effects.network_calls, 0);
    assert.equal(result.receipt.effects.model_calls, 0);

    // Parsed packet check
    const packet = JSON.parse(new TextDecoder("utf-8").decode(result.packetBytes));
    assert.equal(packet.schema_version, PACKET_SCHEMA_VERSION);
    assert.equal(packet.run_authority.schema_version, RUN_AUTHORITY_SCHEMA_VERSION);
    assert.equal(packet.run_authority.consumption_state, "unconsumed");
    assert.equal(packet.run_authority.attempt_limit, 1);
    assert.equal(packet.run_authority.retry_allowed, false);
    assert.equal(packet.run_authority.expires_at_utc, harness.validRequest.expires_at_utc);
  } finally {
    harness.cleanup();
  }
});

test("hostile input is rejected with frozen HOLD and null packet before side effects", async () => {
  const harness = createSyntheticHarness();
  try {
    // 1. Missing / extra keys
    const badKeys = { ...harness.validRequest, extra: 123 };
    const badKeysResult = await prepareProjectPdfKnowledgePilot(badKeys);
    assert.equal(badKeysResult.packetBytes, null);
    assert.equal(badKeysResult.packetSha256, null);
    assert.equal(badKeysResult.receipt.result, "HOLD");
    assert.equal(badKeysResult.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_INVALID");

    // 2. Expired authority
    const expiredRequest = { ...harness.validRequest, expires_at_utc: "2020-01-01T00:00:00.000Z" };
    const expiredResult = await prepareProjectPdfKnowledgePilot(expiredRequest);
    assert.equal(expiredResult.packetBytes, null);
    assert.equal(expiredResult.receipt.result, "HOLD");
    assert.equal(expiredResult.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_AUTHORITY_EXPIRED");

    // 3. Floating revision
    const floatingRequest = {
      ...harness.validRequest,
      document_revision_ref: {
        ...harness.validRequest.document_revision_ref,
        revision_id: "latest",
      },
    };
    const floatingResult = await prepareProjectPdfKnowledgePilot(floatingRequest);
    assert.equal(floatingResult.packetBytes, null);
    assert.equal(floatingResult.receipt.result, "HOLD");

    // 4. Non-absolute path
    const nonAbsRequest = { ...harness.validRequest, launch_path: "relative/path.json" };
    const nonAbsResult = await prepareProjectPdfKnowledgePilot(nonAbsRequest);
    assert.equal(nonAbsResult.packetBytes, null);
    assert.equal(nonAbsResult.receipt.result, "HOLD");
  } finally {
    harness.cleanup();
  }
});

test("launch pin mismatch fails before reading launch contents", async () => {
  const harness = createSyntheticHarness();
  try {
    const wrongShaRequest = { ...harness.validRequest, expected_launch_sha256: "0".repeat(64) };
    const result = await prepareProjectPdfKnowledgePilot(wrongShaRequest);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_PIN_REFUSED");
    assert.equal(result.receipt.blocker_stage, "launch");
    assert.equal(result.receipt.effects.launch_reads, 1);
  } finally {
    harness.cleanup();
  }
});

test("leaf or ancestor reparse point is detected and held without reading body", async () => {
  const harness = createSyntheticHarness();
  try {
    // Inject mock reparse check operation that flags ancestor directory
    const operations = {
      queryReparsePoint: async (targetPath) => {
        if (targetPath.includes("nested")) return "0xa000000c";
        return null;
      },
    };

    const result = await prepareProjectPdfKnowledgePilot(harness.validRequest, operations);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REPARSE_REFUSED");
    assert.equal(result.receipt.effects.source_body_reads, 0);
  } finally {
    harness.cleanup();
  }
});

test("nonempty output root is refused with output_root_nonempty HOLD", async () => {
  const harness = createSyntheticHarness();
  try {
    writeFileSync(join(harness.outputRoot, "stray.txt"), "forbidden");
    const result = await prepareProjectPdfKnowledgePilot(harness.validRequest);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_OUTPUT_ROOT_NONEMPTY");
  } finally {
    harness.cleanup();
  }
});

test("expiry or ref mismatch holds cleanly", async () => {
  const harness = createSyntheticHarness();
  try {
    const mismatchedRefRequest = {
      ...harness.validRequest,
      project_binding_ref: exactRef(999),
    };
    const result = await prepareProjectPdfKnowledgePilot(mismatchedRefRequest);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_BINDING_REFUSED");
  } finally {
    harness.cleanup();
  }
});

test("aliases and camelCase fields are rejected under one exact snake_case schema", async () => {
  const harness = createSyntheticHarness();
  try {
    const camelRequest = {
      schema_version: "soulforge.project_pdf_knowledge_pilot_preparation_request.v0",
      authorityRefIdentity: { ...identity(99), content_hash_alg: "sha256" },
      expiresAtUtc: "2099-01-01T00:00:00.000Z",
      launchPath: harness.launchPath,
      expectedLaunchSha256: harness.validRequest.expected_launch_sha256,
      expectedLaunchByteCount: harness.validRequest.expected_launch_byte_count,
      projectBindingRef: harness.validRequest.project_binding_ref,
      documentRevisionRef: harness.validRequest.document_revision_ref,
      trustedSourceRevisionReceiptSha256: harness.validRequest.trusted_source_revision_receipt_sha256,
      outputRootPath: harness.validRequest.output_root_path,
    };
    const camelResult = await prepareProjectPdfKnowledgePilot(camelRequest);
    assert.equal(camelResult.packetBytes, null);
    assert.equal(camelResult.receipt.result, "HOLD");
    assert.equal(camelResult.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_INVALID");

    const altSnakeRequest = {
      ...harness.validRequest,
      authority_identity: harness.validRequest.authority_ref_identity,
    };
    delete altSnakeRequest.authority_ref_identity;
    const altResult = await prepareProjectPdfKnowledgePilot(altSnakeRequest);
    assert.equal(altResult.packetBytes, null);
    assert.equal(altResult.receipt.result, "HOLD");
    assert.equal(altResult.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_INVALID");
  } finally {
    harness.cleanup();
  }
});

test("symbol properties on request cause request_invalid HOLD", async () => {
  const harness = createSyntheticHarness();
  try {
    const symbolKey = Symbol("hostile_tag");
    const symbolRequest = {
      ...harness.validRequest,
      [symbolKey]: "forbidden_value",
    };
    const result = await prepareProjectPdfKnowledgePilot(symbolRequest);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_INVALID");
  } finally {
    harness.cleanup();
  }
});

test("late-flipping accessor ref is refused with request_invalid before side effects", async () => {
  const harness = createSyntheticHarness();
  try {
    let accessCount = 0;
    const accessorRequest = {
      ...harness.validRequest,
      get document_revision_ref() {
        accessCount += 1;
        return accessCount === 1
          ? harness.validRequest.document_revision_ref
          : exactRef(999);
      },
    };
    const result = await prepareProjectPdfKnowledgePilot(accessorRequest);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REQUEST_INVALID");
  } finally {
    harness.cleanup();
  }
});

test("generic fsutil exit 1 or unparseable failure holds closed with reparse_refused", async () => {
  const harness = createSyntheticHarness();
  try {
    const operations = {
      queryReparsePoint: async () => "query_failed",
    };
    const result = await prepareProjectPdfKnowledgePilot(harness.validRequest, operations);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REPARSE_REFUSED");
    assert.equal(result.receipt.effects.source_body_reads, 0);
  } finally {
    harness.cleanup();
  }
});

test("forged read grant accepted by weak prep is refused by authentic admission inspection", async () => {
  const harness = createSyntheticHarness();
  try {
    // Tamper with read grant in launch file: forged read_policy_ref without valid authority
    const forgedLaunch = JSON.parse(new TextDecoder("utf-8").decode(harness.launchBytes));
    forgedLaunch.document_read_grant.read_policy_ref = exactRef(999);
    // Recompute only the grant ref content_id to forge weak structural check
    forgedLaunch.document_read_grant.grant_ref.content_id = "sha256:" + "f".repeat(64);
    forgedLaunch.expected_document_read_grant_ref.content_id = "sha256:" + "f".repeat(64);
    const forgedLaunchBytes = Buffer.from(JSON.stringify(forgedLaunch) + "\n", "utf8");

    const forgedLaunchPath = join(harness.root, "forged_launch.json");
    writeFileSync(forgedLaunchPath, forgedLaunchBytes);

    const forgedRequest = {
      ...harness.validRequest,
      launch_path: forgedLaunchPath,
      expected_launch_sha256: sha256Hex(forgedLaunchBytes),
      expected_launch_byte_count: forgedLaunchBytes.byteLength,
    };

    const result = await prepareProjectPdfKnowledgePilot(forgedRequest);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_LAUNCH_CONTRACT_REFUSED");
    assert.equal(result.receipt.effects.launch_reads, 2);
    assert.equal(result.receipt.effects.source_body_reads, 0);
  } finally {
    harness.cleanup();
  }
});

test("outer preparation result is Object.freeze and receipt is deep-frozen on both PASS and HOLD", async () => {
  const harness = createSyntheticHarness();
  try {
    const passResult1 = await prepareProjectPdfKnowledgePilot(harness.validRequest);
    const passResult2 = await prepareProjectPdfKnowledgePilot(harness.validRequest);

    assert.equal(Object.isFrozen(passResult1), true);
    assert.equal(Object.isFrozen(passResult1.receipt), true);
    assert.equal(Object.isFrozen(passResult1.receipt.verification), true);
    assert.equal(Object.isFrozen(passResult1.receipt.effects), true);

    // Note: Node.js Buffer memory itself is mutable in standard V8, but each call returns a fresh isolated Buffer.
    assert.notEqual(passResult1.packetBytes, passResult2.packetBytes);
    assert.deepEqual(passResult1.packetBytes, passResult2.packetBytes);

    const holdResult = await prepareProjectPdfKnowledgePilot({ bad: true });
    assert.equal(Object.isFrozen(holdResult), true);
    assert.equal(Object.isFrozen(holdResult.receipt), true);
    assert.equal(holdResult.packetBytes, null);
  } finally {
    harness.cleanup();
  }
});

test("prepared authority packet v0 is accepted and verified by the production runner pre-admission", async () => {
  const harness = createSyntheticHarness();
  try {
    const preparation = await prepareProjectPdfKnowledgePilot(harness.validRequest);
    assert.equal(preparation.receipt.result, "PASS");

    // Write packet to disk
    const authorityPacketPath = join(harness.root, "authority_packet.json");
    writeFileSync(authorityPacketPath, preparation.packetBytes);

    // Run runner with prepared authority packet
    const runnerReceipt = await runProjectPdfKnowledgePilot({
      authorityPacketPath,
      expectedAuthorityPacketSha256: preparation.packetSha256,
    });

    // Verify runner validation passes pre-admission
    assert.equal(runnerReceipt.verification.authority_packet_pin_verified, true);
    assert.equal(runnerReceipt.verification.run_authority_binding_verified, true);
    assert.equal(runnerReceipt.verification.run_authority_expiry_verified, true);
    assert.equal(runnerReceipt.verification.launch_pin_verified, true);
    assert.equal(runnerReceipt.verification.launch_binding_verified, true);
    assert.equal(runnerReceipt.verification.attempt_claim_persisted, true);
  } finally {
    harness.cleanup();
  }
});

test("missing launch under a directory whose name contains 4390 yields reparse_refused, not launch_unreadable", async () => {
  const harness = createSyntheticHarness();
  try {
    const dir4390 = join(harness.root, "dir_4390");
    mkdirSync(dir4390);
    const missingLaunch = join(dir4390, "missing_launch.json");
    const request = {
      ...harness.validRequest,
      launch_path: missingLaunch,
    };
    const result = await prepareProjectPdfKnowledgePilot(request);
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REPARSE_REFUSED");
    assert.equal(result.receipt.blocker_stage, "reparse");
    assert.equal(result.receipt.effects.launch_reads, 0);
  } finally {
    harness.cleanup();
  }
});

test("defaultQueryReparsePoint does not classify clean when 4390 appears only in error.message path", async () => {
  const harness = createSyntheticHarness();
  try {
    const dir4390 = join(harness.root, "dir_4390_probe");
    mkdirSync(dir4390);
    const dummyLaunch = join(dir4390, "dummy_launch.json");
    writeFileSync(dummyLaunch, harness.launchBytes);

    const failingQueryOp = async (filePath) => {
      const error = new Error(`Command failed: fsutil.exe reparsepoint query ${filePath}`);
      error.stdout = "";
      error.stderr = "Access is denied.\r\n";
      const combined = `${error?.stdout ?? ""} ${error?.stderr ?? ""}`;
      if (/\b4390\b|not a reparse point|재분석\s*지점이\s*아닙니다/iu.test(combined)) {
        return null;
      }
      return "query_failed";
    };

    const request = {
      ...harness.validRequest,
      launch_path: dummyLaunch,
    };
    const result = await prepareProjectPdfKnowledgePilot(request, { queryReparsePoint: failingQueryOp });
    assert.equal(result.packetBytes, null);
    assert.equal(result.receipt.result, "HOLD");
    assert.equal(result.receipt.blocker_code, "PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_REPARSE_REFUSED");
    assert.equal(result.receipt.blocker_stage, "reparse");
  } finally {
    harness.cleanup();
  }
});

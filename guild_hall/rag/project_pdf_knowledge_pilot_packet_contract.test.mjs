import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  ATTEMPT_CLAIM_RECEIPT_SCHEMA_VERSION,
  CANDIDATE_FILENAME,
  CANDIDATE_HASH_DOMAIN,
  FEATURE_STATE,
  OUTPUT_ROOT_HASH_DOMAIN,
  PACKET_SCHEMA_VERSION,
  PROJECT_PDF_KNOWLEDGE_PILOT_COMMAND_RECEIPT_SCHEMA_VERSION,
  PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_RECEIPT_SCHEMA_VERSION,
  PREPARATION_REQUEST_SCHEMA_VERSION,
  RECEIPT_FILENAME,
  RUN_AUTHORITY_HASH_DOMAIN,
  RUN_AUTHORITY_SCHEMA_VERSION,
  authorityOff,
  buildCanonicalAuthorityPacket,
  validateAuthorityPacket,
} from "./project_pdf_knowledge_pilot_packet_contract.mjs";

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

test("packet contract exports canonical schemas, constants, and hash domains", () => {
  assert.equal(PACKET_SCHEMA_VERSION, "soulforge.project_pdf_knowledge_pilot_authority_packet.v0");
  assert.equal(RUN_AUTHORITY_SCHEMA_VERSION, "soulforge.project_pdf_knowledge_pilot_run_authority.v0");
  assert.equal(ATTEMPT_CLAIM_RECEIPT_SCHEMA_VERSION, "soulforge.project_pdf_knowledge_pilot_attempt_claim_receipt.v0");
  assert.equal(PROJECT_PDF_KNOWLEDGE_PILOT_COMMAND_RECEIPT_SCHEMA_VERSION, "soulforge.project_pdf_knowledge_pilot_command_receipt.v0");
  assert.equal(PROJECT_PDF_KNOWLEDGE_PILOT_PREPARATION_RECEIPT_SCHEMA_VERSION, "soulforge.project_pdf_knowledge_pilot_preparation_command_receipt.v0");
  assert.equal(PREPARATION_REQUEST_SCHEMA_VERSION, "soulforge.project_pdf_knowledge_pilot_preparation_request.v0");
  assert.equal(RUN_AUTHORITY_HASH_DOMAIN, "soulforge.project_pdf_knowledge_pilot.run_authority.v0");
  assert.equal(OUTPUT_ROOT_HASH_DOMAIN, "soulforge.project_pdf_knowledge_pilot.output_root.v0");
  assert.equal(CANDIDATE_HASH_DOMAIN, "soulforge.project_pdf_knowledge_candidate.v0");
  assert.equal(FEATURE_STATE, "off");
  assert.equal(CANDIDATE_FILENAME, "project_pdf_knowledge_candidate.json");
  assert.equal(RECEIPT_FILENAME, "project_pdf_knowledge_persistence_receipt.json");
});

test("builds and validates a canonical authority packet v0", () => {
  const authorityRefIdentity = identity(11);
  const launch = {
    absolutePath: resolve("synthetic", "launch.json"),
    sha256: "a".repeat(64),
    byteCount: 1234,
  };
  const sourceBinding = {
    projectBindingRef: exactRef(1),
    documentRevisionRef: exactRef(2),
    trustedSourceReceiptSha256: "sha256:" + "b".repeat(64),
  };
  const output = {
    absoluteRootPath: resolve("synthetic", "output"),
    candidateFilename: CANDIDATE_FILENAME,
    receiptFilename: RECEIPT_FILENAME,
  };
  const expiresAtUtc = "2099-01-01T00:00:00.000Z";

  const packet = buildCanonicalAuthorityPacket({
    authorityRefIdentity,
    expiresAtUtc,
    launch,
    sourceBinding,
    output,
  });

  assert.equal(packet.schema_version, PACKET_SCHEMA_VERSION);
  assert.equal(packet.kind, "project_pdf_knowledge_pilot_authority_packet");
  assert.equal(packet.feature_state, FEATURE_STATE);
  assert.equal(packet.run_authority.consumption_state, "unconsumed");
  assert.equal(packet.run_authority.attempt_limit, 1);
  assert.equal(packet.run_authority.retry_allowed, false);
  assert.equal(packet.run_authority.expires_at_utc, expiresAtUtc);
  assert.equal(packet.run_authority.authority_ref.entity_id, authorityRefIdentity.entity_id);
  assert.equal(packet.run_authority.authority_ref.revision_id, authorityRefIdentity.revision_id);
  assert.equal(packet.run_authority.authority_ref.content_id, packet.run_authority.authority_digest_sha256);

  const validated = validateAuthorityPacket(packet);
  assert.equal(validated.launch.absolutePath, launch.absolutePath);
  assert.equal(validated.launch.sha256, launch.sha256);
  assert.equal(validated.launch.byteCount, launch.byteCount);
  assert.equal(validated.output.absoluteRootPath, output.absoluteRootPath);
});

test("authorityOff returns complete zero claims", () => {
  const claims = authorityOff();
  assert.deepEqual(claims, {
    source_truth: false,
    canon: false,
    project_state: false,
    owner_identity_verified: false,
    owner_approval_verified: false,
    accepted_context: false,
    persistent_write_allowed: false,
    activation_allowed: false,
    engine_input_allowed: false,
    erp_write_allowed: false,
    taskdriver_allowed: false,
  });
});

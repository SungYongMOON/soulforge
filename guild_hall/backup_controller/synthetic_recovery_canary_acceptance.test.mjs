import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_HOLD_CODES as H,
  SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_EVIDENCE_SCHEMA,
  SYNTHETIC_RECOVERY_CANARY_TRUSTED_PIN_SCHEMA,
  acceptSyntheticRecoveryCanary,
  syntheticRecoveryCanaryAcceptanceEvidenceDigest,
  validateSyntheticRecoveryCanaryAcceptanceReceipt,
} from "./synthetic_recovery_canary_acceptance.mjs";
import { runSyntheticRecoveryCanary } from "./synthetic_recovery_canary_runner.mjs";

const NOW = "2026-08-31T13:00:00Z";
const OTHER_DIGEST = `sha256:${"cd".repeat(32)}`;

async function technicalReceipt() {
  const result = await runSyntheticRecoveryCanary();
  assert.equal(result.status, "SYNTHETIC_TECHNICAL_RESTORE_CANDIDATE");
  return result.receipt;
}

function evidenceFor(technical, overrides = {}) {
  return {
    schema_version: SYNTHETIC_RECOVERY_CANARY_ACCEPTANCE_EVIDENCE_SCHEMA,
    acceptance_ref: "acceptance.human-owner.synthetic-canary-1",
    source_ref: technical.source_ref,
    project_scope_ref: technical.project_scope_ref,
    backup_generation_ref: technical.backup_generation_ref,
    restore_test_ref: technical.restore_test_ref,
    technical_receipt_digest: technical.technical_receipt_digest,
    acceptance_owner_ref: "owner.human.synthetic-canary",
    backup_restore_owner_ref: technical.backup_restore_owner_ref,
    decision: "accepted",
    verified: true,
    verified_at: "2026-08-31T12:00:00Z",
    expires_at: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

function pinFor(evidence, technical, overrides = {}) {
  return {
    schema_version: SYNTHETIC_RECOVERY_CANARY_TRUSTED_PIN_SCHEMA,
    pin_ref: "pin.synthetic-canary-1",
    trusted_human_owner_authority_ref: "authority.human-owner.synthetic-canary",
    acceptance_evidence_digest: syntheticRecoveryCanaryAcceptanceEvidenceDigest(evidence),
    technical_receipt_digest: technical.technical_receipt_digest,
    source_ref: technical.source_ref,
    project_scope_ref: technical.project_scope_ref,
    acceptance_owner_ref: evidence.acceptance_owner_ref,
    issued_at: "2026-08-31T11:00:00Z",
    expires_at: "2026-09-01T12:00:00Z",
    revoked: false,
    revocation_ref: null,
    ...overrides,
  };
}

function request(technical, evidence, prior = undefined) {
  return prior === undefined
    ? { technical_receipt: technical, human_acceptance_evidence: evidence }
    : {
      technical_receipt: technical,
      human_acceptance_evidence: evidence,
      prior_acceptance_receipt: prior,
    };
}

test("trusted out-of-band Human Owner pin accepts exactly one technical receipt", async () => {
  const technical = await technicalReceipt();
  const evidence = evidenceFor(technical);
  const pin = pinFor(evidence, technical);
  const accepted = acceptSyntheticRecoveryCanary(request(technical, evidence), pin, { now_iso: NOW });

  assert.equal(accepted.status, "HUMAN_ACCEPTED_SYNTHETIC_CANARY");
  assert.equal(validateSyntheticRecoveryCanaryAcceptanceReceipt(accepted.receipt).valid, true);
  assert.equal(accepted.receipt.technical_receipt_digest, technical.technical_receipt_digest);
  assert.equal(accepted.receipt.acceptance_owner_ref, evidence.acceptance_owner_ref);
  assert.notEqual(accepted.receipt.acceptance_owner_ref, accepted.receipt.backup_restore_owner_ref);

  const replay = acceptSyntheticRecoveryCanary(request(technical, evidence, accepted.receipt), pin, { now_iso: NOW });
  assert.equal(replay.status, "NO_OP");
  assert.deepEqual(replay.receipt, accepted.receipt);
});

test("acceptance rejects self-acceptance, stale/expired/revoked pins, and digest mismatch", async () => {
  const technical = await technicalReceipt();

  const self = evidenceFor(technical, { acceptance_owner_ref: technical.backup_restore_owner_ref });
  assert.equal(
    acceptSyntheticRecoveryCanary(request(technical, self), pinFor(self, technical), { now_iso: NOW }).hold_code,
    H.SELF_ACCEPT_FORBIDDEN,
  );

  const evidence = evidenceFor(technical);
  assert.equal(
    acceptSyntheticRecoveryCanary(request(technical, evidence), pinFor(evidence, technical, {
      technical_receipt_digest: OTHER_DIGEST,
    }), { now_iso: NOW }).hold_code,
    H.PIN_STALE,
  );
  assert.equal(
    acceptSyntheticRecoveryCanary(request(technical, evidence), pinFor(evidence, technical, {
      expires_at: "2026-08-31T12:30:00Z",
    }), { now_iso: NOW }).hold_code,
    H.PIN_EXPIRED,
  );
  assert.equal(
    acceptSyntheticRecoveryCanary(request(technical, evidence), pinFor(evidence, technical, {
      revoked: true,
      revocation_ref: "revocation.human-owner.synthetic-canary",
    }), { now_iso: NOW }).hold_code,
    H.PIN_REVOKED,
  );

  const wrongDigestEvidence = evidenceFor(technical, { technical_receipt_digest: OTHER_DIGEST });
  assert.equal(
    acceptSyntheticRecoveryCanary(request(technical, wrongDigestEvidence),
      pinFor(wrongDigestEvidence, technical, { technical_receipt_digest: OTHER_DIGEST }), { now_iso: NOW }).hold_code,
    H.TECHNICAL_RECEIPT_DIGEST_MISMATCH,
  );
  assert.equal(
    acceptSyntheticRecoveryCanary(request(technical, evidence), pinFor(evidence, technical, {
      acceptance_evidence_digest: OTHER_DIGEST,
    }), { now_iso: NOW }).hold_code,
    H.PIN_DIGEST_MISMATCH,
  );
  const foreignScope = evidenceFor(technical, { project_scope_ref: "project.foreign-scope" });
  assert.equal(
    acceptSyntheticRecoveryCanary(request(technical, foreignScope),
      pinFor(foreignScope, technical, { project_scope_ref: "project.foreign-scope" }), { now_iso: NOW }).hold_code,
    H.SCOPE_MISMATCH,
  );
});

test("acceptance pins cannot be supplied in-band and divergent replays HOLD", async () => {
  const technical = await technicalReceipt();
  const evidence = evidenceFor(technical);
  const pin = pinFor(evidence, technical);
  const inBand = {
    technical_receipt: technical,
    human_acceptance_evidence: evidence,
    trusted_acceptance_pin: pin,
  };
  assert.equal(acceptSyntheticRecoveryCanary(inBand, pin, { now_iso: NOW }).hold_code, H.INPUT_INVALID);

  const alternateEvidence = evidenceFor(technical, {
    acceptance_ref: "acceptance.human-owner.synthetic-canary-2",
  });
  const alternate = acceptSyntheticRecoveryCanary(
    request(technical, alternateEvidence), pinFor(alternateEvidence, technical), { now_iso: NOW },
  );
  assert.equal(alternate.status, "HUMAN_ACCEPTED_SYNTHETIC_CANARY");

  const divergent = acceptSyntheticRecoveryCanary(request(technical, evidence, alternate.receipt), pin, { now_iso: NOW });
  assert.equal(divergent.status, "HOLD");
  assert.equal(divergent.hold_code, H.REPLAY_CONFLICT);
});

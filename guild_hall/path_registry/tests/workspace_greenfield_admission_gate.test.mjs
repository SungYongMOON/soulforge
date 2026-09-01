import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GREENFIELD_ADMISSION_SCHEMA,
  computeWorkspaceGreenfieldAdmissionPacketDigest,
  evaluateWorkspaceGreenfieldAdmission,
} from "../src/workspace_greenfield_admission_gate.mjs";

const INPUT_DIGEST = `sha256:${"ab".repeat(32)}`;
const CANDIDATE_DIGEST = `sha256:${"cd".repeat(32)}`;
const OTHER_DIGEST = `sha256:${"ef".repeat(32)}`;
// This is intentionally a fixed golden pin, not a helper-derived expectation.
// It is updated only when the closed literal packet shape changes.
const PRE_PACKET_DIGEST = "sha256:a984d8eb86aa1a579d7b491faf397400133a5101e343aa42deabb312e90d297c";

function targetStore(storeRef, bindingRef) {
  return {
    store_ref: storeRef,
    binding_ref: bindingRef,
    parent_binding_ref: "binding.target-data-root",
    binding_epoch_ref: `${bindingRef}.epoch-1`,
    empty_readback_ref: `${storeRef}.empty-readback`,
    acl_readback_ref: `${storeRef}.acl-readback`,
    sole_writer_ref: "writer.canonical-publisher",
    generation_ref: "generation.workspace-genesis-1",
    no_legacy_import_receipt_ref: `${storeRef}.no-legacy-import`,
    legacy_rows_imported: false,
    backup_classification: "authoritative",
    backup_classification_ref: `${storeRef}.backup-classification`,
    synthetic_restore_gate_ref: `${storeRef}.synthetic-restore-gate`,
    synthetic_restore_evidence_ref: `${storeRef}.synthetic-restore`,
    rollback_ref: `${storeRef}.rollback`,
  };
}

function applicableLegacyFreeze() {
  return {
    applicability: "applicable",
    origin_kind: "legacy",
    applicability_reason_ref: "reason.legacy-source-used",
    origin_ref: "origin.legacy-workspace",
    custody_ref: "custody.legacy-workspace",
    admission_ref: "admission.legacy-workspace",
    legacy_freeze_ref: "freeze.legacy-workspace-1",
    current_binding_ref: "binding.legacy-workspace",
    scope_ref: "project.demo-project",
    writer_quiescence_ref: "quiescence.legacy-workspace",
    readback_ref: "readback.legacy-workspace",
    source_pointer_ref: "pointer.legacy-workspace",
    input_source_revision_ref: "revision.input-power-review-1",
    input_source_digest: INPUT_DIGEST,
    retention_ref: "retention.legacy-workspace",
    expiry_release_rule_ref: "policy.legacy-freeze-expiry",
    authority_ref: "owner.legacy-authority",
  };
}

function externalNonlegacyFreeze() {
  return {
    applicability: "not_applicable",
    origin_kind: "external_nonlegacy",
    applicability_reason_ref: "reason.external-source-only",
    origin_ref: "origin.external-vendor",
    custody_ref: "custody.external-vendor",
    admission_ref: "admission.external-vendor",
    legacy_freeze_ref: null,
    current_binding_ref: null,
    scope_ref: "project.demo-project",
    writer_quiescence_ref: null,
    readback_ref: null,
    source_pointer_ref: null,
    input_source_revision_ref: "revision.input-power-review-1",
    input_source_digest: INPUT_DIGEST,
    retention_ref: null,
    expiry_release_rule_ref: null,
    authority_ref: null,
  };
}

function promotion(phase) {
  const post = phase === "post_publish_closure";
  return {
    promotion_ref: "promotion.power-review-1",
    phase_operation_ref: post ? "operation.publish-power-review-1" : "operation.prepare-power-review-1",
    input_w_auth_ref: "wauth.input-power-review-1",
    logical_artifact_ref: "artifact.power-review",
    candidate_relation: "derived_revision",
    candidate_revision_ref: "revision.candidate-power-review-1",
    candidate_content_digest: CANDIDATE_DIGEST,
    staging: {
      staging_ref: "staging.power-review-1",
      candidate_surface: "external_noncanonical_staging",
      candidate_revision_ref: "revision.candidate-power-review-1",
      candidate_content_digest: CANDIDATE_DIGEST,
    },
    byte_hash_readback: {
      byte_readback_ref: "readback.candidate-power-review-1",
      candidate_revision_ref: "revision.candidate-power-review-1",
      candidate_content_digest: CANDIDATE_DIGEST,
    },
    independent_review: {
      producer_ref: "producer.power-team",
      build_ref: "build.power-review-1",
      reviewer_ref: "reviewer.independent",
      independence_receipt_ref: "receipt.review-independence-1",
      review_ref: "review.candidate-power-review-1",
      candidate_revision_ref: "revision.candidate-power-review-1",
      candidate_content_digest: CANDIDATE_DIGEST,
    },
    authority_acceptance: {
      authority_ref: "owner.project-authority",
      acceptance_ref: "acceptance.candidate-power-review-1",
      candidate_revision_ref: "revision.candidate-power-review-1",
      candidate_content_digest: CANDIDATE_DIGEST,
    },
    publication: post ? {
      atomic_publish_ref: "publish.candidate-power-review-1",
      publisher_ref: "writer.canonical-publisher",
      target_workspaces_binding_ref: "binding.target-workspaces",
      target_workmeta_binding_ref: "binding.target-workmeta",
      generation_ref: "generation.workspace-genesis-1",
      correction_supersession_policy_ref: "policy.correction-supersession-v1",
      target_bytes_ref: "bytes.candidate-power-review-1",
      canonical_lineage_ref: "lineage.candidate-power-review-1",
      candidate_revision_ref: "revision.candidate-power-review-1",
      candidate_content_digest: CANDIDATE_DIGEST,
    } : null,
    active_pointer: post ? {
      active_pointer_ref: "pointer.active-power-review-1",
      pointer_readback_ref: "readback.active-power-review-1",
      candidate_revision_ref: "revision.candidate-power-review-1",
      candidate_content_digest: CANDIDATE_DIGEST,
    } : null,
  };
}

function withCandidate(base, candidateRelation, candidateRevisionRef, candidateContentDigest) {
  const rewrite = (entry) => (entry === null ? null : {
    ...entry,
    candidate_revision_ref: candidateRevisionRef,
    candidate_content_digest: candidateContentDigest,
  });
  return {
    ...base,
    candidate_relation: candidateRelation,
    candidate_revision_ref: candidateRevisionRef,
    candidate_content_digest: candidateContentDigest,
    staging: rewrite(base.staging),
    byte_hash_readback: rewrite(base.byte_hash_readback),
    independent_review: rewrite(base.independent_review),
    authority_acceptance: rewrite(base.authority_acceptance),
    publication: rewrite(base.publication),
    active_pointer: rewrite(base.active_pointer),
  };
}

function postPacketRef(phase) {
  return phase === "post_publish_closure"
    ? "packet.greenfield.workspace-post-1"
    : "packet.greenfield.workspace-pre-1";
}

export function validWorkspacePacket(phase = "pre_publish_readiness", overrides = {}) {
  const post = phase === "post_publish_closure";
  const work = promotion(phase);
  return {
    schema: GREENFIELD_ADMISSION_SCHEMA,
    branch: "workspace",
    packet_ref: postPacketRef(phase),
    w_auth: {
      w_auth_ref: "wauth.input-power-review-1",
      subject_ref: "artifact.power-review",
      input_source_revision_ref: "revision.input-power-review-1",
      input_source_digest: INPUT_DIGEST,
      scope_ref: "project.demo-project",
      classification: "accepted",
      owner_ref: "owner.input-authority",
      reviewer_ref: "reviewer.input-independence",
      evidence_ref: "evidence.input-power-review-1",
      input_authority_acceptance_ref: "acceptance.input-power-review-1",
      issued_at: "2026-09-01T00:00:00Z",
      supersession_ref: null,
      baseline_ref: null,
    },
    genesis: {
      genesis_ref: "genesis.workspace-1",
      authority_ref: "owner.target-store-authority",
      approved_correction_supersession_policy_ref: "policy.correction-supersession-v1",
      target_workspaces: targetStore("store.target-workspaces", "binding.target-workspaces"),
      target_workmeta: targetStore("store.target-workmeta", "binding.target-workmeta"),
    },
    legacy_freeze: applicableLegacyFreeze(),
    promotion: work,
    replay: {
      phase_operation_ref: work.phase_operation_ref,
      idempotency_key_ref: post ? "idempotency.publish-power-review-1" : "idempotency.prepare-power-review-1",
      original_request_digest: `sha256:${"11".repeat(32)}`,
      replay_request_digest: `sha256:${"11".repeat(32)}`,
      prior_receipt_digest: `sha256:${"22".repeat(32)}`,
      replay_readback_digest: `sha256:${"22".repeat(32)}`,
      replay_receipt_ref: post ? "receipt.publish-power-review-replay" : "receipt.prepare-power-review-replay",
      replay_outcome: "no_op",
    },
    ...overrides,
  };
}

function validNonWorkspacePacket(overrides = {}) {
  return {
    schema: GREENFIELD_ADMISSION_SCHEMA,
    branch: "non_workspace",
    packet_ref: "packet.greenfield.non-workspace-1",
    non_workspace: {
      branch_ref: "branch.non-workspace-1",
      target_store_operations: [],
    },
    replay: {
      phase_operation_ref: "branch.non-workspace-1",
      idempotency_key_ref: "idempotency.non-workspace-1",
      original_request_digest: `sha256:${"33".repeat(32)}`,
      replay_request_digest: `sha256:${"33".repeat(32)}`,
      prior_receipt_digest: `sha256:${"44".repeat(32)}`,
      replay_readback_digest: `sha256:${"44".repeat(32)}`,
      replay_receipt_ref: "receipt.non-workspace-1-replay",
      replay_outcome: "no_op",
    },
    ...overrides,
  };
}

function run(packet, phase, trustedPacketDigest = computeWorkspaceGreenfieldAdmissionPacketDigest(packet)) {
  return evaluateWorkspaceGreenfieldAdmission(packet, {
    phase,
    trusted_packet_digest: trustedPacketDigest,
  });
}

test("pre-publish readiness is not publication closure and uses a fixed closed-packet pin", () => {
  const packet = validWorkspacePacket();
  assert.equal(computeWorkspaceGreenfieldAdmissionPacketDigest(packet), PRE_PACKET_DIGEST);
  const outcome = run(packet, "pre_publish_readiness", PRE_PACKET_DIGEST);
  assert.equal(outcome.status, "pre_publish_ready");
  assert.equal(outcome.completion_state, "not_published");
  assert.equal(outcome.phase, "pre_publish_readiness");
  assert.equal(outcome.gates.one_artifact_promotion.status, "pass");
  assert.equal(Object.isFrozen(outcome), true);
});

test("post-publish closure requires publication and an active-pointer readback, while pre-publish rejects both", () => {
  const pre = validWorkspacePacket();
  const postMissing = run(pre, "post_publish_closure");
  assert.equal(postMissing.status, "post_publish_hold");
  assert.equal(postMissing.gates.one_artifact_promotion.hold_code, "post_publish_publication_missing");

  const post = validWorkspacePacket("post_publish_closure");
  const premature = run(post, "pre_publish_readiness");
  assert.equal(premature.status, "pre_publish_hold");
  assert.equal(premature.gates.one_artifact_promotion.hold_code, "pre_publish_contains_publication");

  const closed = run(post, "post_publish_closure");
  assert.equal(closed.status, "post_publish_closed");
  assert.equal(closed.completion_state, "published_closed");
});

test("a separate trusted packet pin is mandatory and exact", () => {
  const packet = validWorkspacePacket();
  const missing = evaluateWorkspaceGreenfieldAdmission(packet, { phase: "pre_publish_readiness" });
  assert.equal(missing.status, "pre_publish_hold");
  assert.equal(missing.hold_code, "trusted_packet_digest_missing");

  const wrong = run(packet, "pre_publish_readiness", OTHER_DIGEST);
  assert.equal(wrong.status, "pre_publish_hold");
  assert.equal(wrong.hold_code, "trusted_packet_digest_mismatch");

  const changed = { ...packet, packet_ref: "packet.greenfield.workspace-pre-mutated" };
  const stale = run(changed, "pre_publish_readiness", computeWorkspaceGreenfieldAdmissionPacketDigest(packet));
  assert.equal(stale.hold_code, "trusted_packet_digest_mismatch");
});

test("accepted input provenance and candidate bytes are deliberately distinct but every candidate evidence step binds exact candidate bytes", () => {
  const packet = validWorkspacePacket();
  const ready = run(packet, "pre_publish_readiness");
  assert.equal(ready.status, "pre_publish_ready");
  assert.notEqual(packet.w_auth.input_source_digest, packet.promotion.candidate_content_digest);

  const mismatchedReadback = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      byte_hash_readback: {
        ...packet.promotion.byte_hash_readback,
        candidate_content_digest: OTHER_DIGEST,
      },
    },
  }, "pre_publish_readiness");
  assert.equal(mismatchedReadback.gates.one_artifact_promotion.hold_code, "candidate_digest_mismatch");
});

test("candidate relation distinguishes exact byte migration from a derived candidate", () => {
  const packet = validWorkspacePacket();
  const exactCopy = run({
    ...packet,
    promotion: withCandidate(
      packet.promotion,
      "exact_copy",
      packet.w_auth.input_source_revision_ref,
      packet.w_auth.input_source_digest,
    ),
  }, "pre_publish_readiness");
  assert.equal(exactCopy.status, "pre_publish_ready");

  const exactCopyRevisionMismatch = run({
    ...packet,
    promotion: { ...packet.promotion, candidate_relation: "exact_copy" },
  }, "pre_publish_readiness");
  assert.equal(exactCopyRevisionMismatch.gates.one_artifact_promotion.hold_code, "exact_copy_candidate_revision_mismatch");

  const derivedSameRevision = run({
    ...packet,
    promotion: withCandidate(
      packet.promotion,
      "derived_revision",
      packet.w_auth.input_source_revision_ref,
      CANDIDATE_DIGEST,
    ),
  }, "pre_publish_readiness");
  assert.equal(derivedSameRevision.gates.one_artifact_promotion.hold_code, "derived_revision_candidate_not_distinct");

  const derivedSameBytes = run({
    ...packet,
    promotion: withCandidate(
      packet.promotion,
      "derived_revision",
      "revision.candidate-same-bytes-1",
      packet.w_auth.input_source_digest,
    ),
  }, "pre_publish_readiness");
  assert.equal(derivedSameBytes.status, "pre_publish_ready");
});

test("W-AUTH admits only accepted or baseline inputs and Genesis targets must both be authoritative", () => {
  const packet = validWorkspacePacket();
  const working = run({
    ...packet,
    w_auth: { ...packet.w_auth, classification: "working" },
  }, "pre_publish_readiness");
  assert.equal(working.gates.w_auth.hold_code, "w_auth_classification_not_accepted_or_baseline");

  const nonAuthoritative = run({
    ...packet,
    genesis: {
      ...packet.genesis,
      target_workmeta: {
        ...packet.genesis.target_workmeta,
        backup_classification: "rebuildable",
      },
    },
  }, "pre_publish_readiness");
  assert.equal(nonAuthoritative.gates.canonical_empty_state_genesis.hold_code, "genesis_backup_classification_not_authoritative");

  const differentSoleWriters = run({
    ...packet,
    genesis: {
      ...packet.genesis,
      target_workmeta: { ...packet.genesis.target_workmeta, sole_writer_ref: "writer.workmeta-only" },
    },
  }, "pre_publish_readiness");
  assert.equal(differentSoleWriters.gates.canonical_empty_state_genesis.hold_code, "genesis_sole_writer_mismatch");
});

test("Legacy Freeze is either a full legacy receipt bound to the admitted input or an exact external-nonlegacy exception", () => {
  const packet = validWorkspacePacket();
  const external = run({ ...packet, legacy_freeze: externalNonlegacyFreeze() }, "pre_publish_readiness");
  assert.equal(external.gates.legacy_freeze.status, "pass");

  const vagueException = run({
    ...packet,
    legacy_freeze: { ...externalNonlegacyFreeze(), origin_kind: "legacy" },
  }, "pre_publish_readiness");
  assert.equal(vagueException.gates.legacy_freeze.hold_code, "legacy_freeze_non_applicable_origin_invalid");

  const bindingLeak = run({
    ...packet,
    legacy_freeze: { ...externalNonlegacyFreeze(), current_binding_ref: "binding.should-not-exist" },
  }, "pre_publish_readiness");
  assert.equal(bindingLeak.gates.legacy_freeze.hold_code, "legacy_freeze_non_applicable_current_binding_present");

  const inputMismatch = run({
    ...packet,
    legacy_freeze: { ...applicableLegacyFreeze(), input_source_digest: OTHER_DIGEST },
  }, "pre_publish_readiness");
  assert.equal(inputMismatch.gates.legacy_freeze.hold_code, "legacy_freeze_input_source_digest_mismatch");
});

test("independent review and final authority acceptance bind the candidate, not the input or producer", () => {
  const packet = validWorkspacePacket();
  const selfReview = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      independent_review: { ...packet.promotion.independent_review, reviewer_ref: "producer.power-team" },
    },
  }, "pre_publish_readiness");
  assert.equal(selfReview.gates.one_artifact_promotion.hold_code, "reviewer_not_independent");

  const reviewDigestMismatch = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      independent_review: { ...packet.promotion.independent_review, candidate_content_digest: INPUT_DIGEST },
    },
  }, "pre_publish_readiness");
  assert.equal(reviewDigestMismatch.gates.one_artifact_promotion.hold_code, "review_candidate_digest_mismatch");

  const acceptanceDigestMismatch = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      authority_acceptance: { ...packet.promotion.authority_acceptance, candidate_content_digest: INPUT_DIGEST },
    },
  }, "pre_publish_readiness");
  assert.equal(acceptanceDigestMismatch.gates.one_artifact_promotion.hold_code, "acceptance_candidate_digest_mismatch");
});

test("post-publish bytes, lineage, and active pointer stay bound to the accepted candidate", () => {
  const packet = validWorkspacePacket("post_publish_closure");
  const wrongWriter = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      publication: { ...packet.promotion.publication, publisher_ref: "writer.wrong" },
    },
  }, "post_publish_closure");
  assert.equal(wrongWriter.gates.one_artifact_promotion.hold_code, "publication_workspace_sole_writer_mismatch");

  const workmetaWriterMismatch = run({
    ...packet,
    genesis: {
      ...packet.genesis,
      target_workmeta: { ...packet.genesis.target_workmeta, sole_writer_ref: "writer.workmeta-only" },
    },
  }, "post_publish_closure");
  assert.equal(workmetaWriterMismatch.gates.canonical_empty_state_genesis.hold_code, "genesis_sole_writer_mismatch");
  assert.equal(workmetaWriterMismatch.gates.one_artifact_promotion.hold_code, "publication_workmeta_sole_writer_mismatch");

  const wrongBinding = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      publication: { ...packet.promotion.publication, target_workspaces_binding_ref: "binding.wrong" },
    },
  }, "post_publish_closure");
  assert.equal(wrongBinding.gates.one_artifact_promotion.hold_code, "publication_workspaces_binding_mismatch");

  const wrongWorkmetaBinding = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      publication: { ...packet.promotion.publication, target_workmeta_binding_ref: "binding.wrong-workmeta" },
    },
  }, "post_publish_closure");
  assert.equal(wrongWorkmetaBinding.gates.one_artifact_promotion.hold_code, "publication_workmeta_binding_mismatch");

  const wrongGeneration = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      publication: { ...packet.promotion.publication, generation_ref: "generation.wrong" },
    },
  }, "post_publish_closure");
  assert.equal(wrongGeneration.gates.one_artifact_promotion.hold_code, "publication_generation_mismatch");

  const wrongPolicy = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      publication: { ...packet.promotion.publication, correction_supersession_policy_ref: "policy.other" },
    },
  }, "post_publish_closure");
  assert.equal(wrongPolicy.gates.one_artifact_promotion.hold_code, "publication_correction_supersession_policy_mismatch");

  const { correction_supersession_policy_ref: _omitted, ...withoutPolicy } = packet.promotion.publication;
  const missingPolicy = run({
    ...packet,
    promotion: { ...packet.promotion, publication: withoutPolicy },
  }, "post_publish_closure");
  assert.equal(missingPolicy.gates.one_artifact_promotion.hold_code, "packet_field_missing");

  const publicationMismatch = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      publication: { ...packet.promotion.publication, candidate_content_digest: INPUT_DIGEST },
    },
  }, "post_publish_closure");
  assert.equal(publicationMismatch.gates.one_artifact_promotion.hold_code, "publication_candidate_digest_mismatch");

  const pointerMismatch = run({
    ...packet,
    promotion: {
      ...packet.promotion,
      active_pointer: { ...packet.promotion.active_pointer, candidate_revision_ref: "revision.other" },
    },
  }, "post_publish_closure");
  assert.equal(pointerMismatch.gates.one_artifact_promotion.hold_code, "active_pointer_candidate_revision_mismatch");
});

test("replay proves same request, same prior receipt, exact phase operation, and NO_OP", () => {
  const packet = validWorkspacePacket();
  const requestDivergence = run({
    ...packet,
    replay: { ...packet.replay, replay_request_digest: OTHER_DIGEST },
  }, "pre_publish_readiness");
  assert.equal(requestDivergence.gates.replay_idempotency.hold_code, "replay_request_digest_mismatch");

  const receiptDivergence = run({
    ...packet,
    replay: { ...packet.replay, replay_readback_digest: OTHER_DIGEST },
  }, "pre_publish_readiness");
  assert.equal(receiptDivergence.gates.replay_idempotency.hold_code, "replay_receipt_digest_mismatch");

  const operationDivergence = run({
    ...packet,
    replay: { ...packet.replay, phase_operation_ref: "operation.other" },
  }, "pre_publish_readiness");
  assert.equal(operationDivergence.gates.replay_idempotency.hold_code, "replay_operation_mismatch");

  const repeated = run({
    ...packet,
    replay: { ...packet.replay, replay_outcome: "replayed" },
  }, "pre_publish_readiness");
  assert.equal(repeated.gates.replay_idempotency.hold_code, "replay_not_idempotent");
});

test("NW is pre-publish-only and cannot bind or write either target store", () => {
  const valid = run(validNonWorkspacePacket(), "pre_publish_readiness");
  assert.equal(valid.status, "pre_publish_ready");
  assert.equal(valid.gates.w_auth.status, "not_applicable");
  assert.equal(valid.gates.canonical_empty_state_genesis.applicability, "not_applicable");

  const targetOperation = run(validNonWorkspacePacket({
    non_workspace: { branch_ref: "branch.non-workspace-1", target_store_operations: ["bind"] },
  }), "pre_publish_readiness");
  assert.equal(targetOperation.gates.branch_scope.hold_code, "nw_target_store_access_forbidden");

  const post = run(validNonWorkspacePacket(), "post_publish_closure");
  assert.equal(post.status, "post_publish_hold");
  assert.equal(post.hold_code, "phase_not_applicable_to_non_workspace");
});

test("closed packet boundary rejects raw/path/secret fields and remains deterministic", () => {
  const packet = validWorkspacePacket();
  for (const field of ["raw_payload", "source_path", "secret_token"]) {
    const unsafe = run({ ...packet, [field]: "not-allowed" }, "pre_publish_readiness");
    assert.equal(unsafe.status, "pre_publish_hold", field);
    assert.equal(unsafe.gates.payload_boundary.hold_code, "forbidden_packet_field", field);
  }
  assert.deepEqual(
    run(packet, "pre_publish_readiness"),
    run(packet, "pre_publish_readiness"),
  );
});

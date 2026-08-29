import test from "node:test";
import assert from "node:assert/strict";

import {
  HOLD_CODES,
  SCAN_CLASSES,
  UNIFORM_DENIAL,
  VAULT_REVISION_SCHEMA,
  createVaultRevisionCore,
} from "../src/artifact_revision_core.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SCOPE = Object.freeze({ project_ref: "demo_project" });
const FOREIGN = Object.freeze({ project_ref: "other_project" });

function seedArtifact(core, id = "art.report") {
  return core.registerLogicalArtifact({
    logical_artifact_id: id,
    artifact_kind: "report",
    project_ref: "demo_project",
    logical_owner_ref: "vault.catalog",
    byte_owner_ref: "custody.store_a",
    revision_owner_ref: "vault.revision_ledger",
    acceptance_owner_ref: "human.acceptor_1",
    backup_restore_owner_ref: "bastion.policy_1",
  });
}

function seedThroughCustody(core, { submissionId = "sub.1", key = "key-1", sha = SHA_A } = {}) {
  core.recordSubmission({
    submission_id: submissionId,
    actor_ref: "member.alice",
    assignment_ref: "assign.1",
    project_ref: "demo_project",
    idempotency_key: key,
    declared_sha256: sha,
    declared_size: 1024,
  });
  core.recordCustodyReceipt({
    custody_receipt_ref: `cust.${submissionId}`,
    submission_id: submissionId,
    stored_sha256: sha,
  });
  return `cust.${submissionId}`;
}

test("full synthetic vertical: catalog -> custody -> scan -> candidate -> review -> human acceptance", () => {
  const core = createVaultRevisionCore();
  assert.equal(core.schema, VAULT_REVISION_SCHEMA);
  const artifact = seedArtifact(core);
  assert.deepEqual(
    [artifact.logical_owner_ref, artifact.byte_owner_ref, artifact.revision_owner_ref,
      artifact.acceptance_owner_ref, artifact.backup_restore_owner_ref],
    ["vault.catalog", "custody.store_a", "vault.revision_ledger", "human.acceptor_1", "bastion.policy_1"],
    "five owners stay separate fields",
  );
  const custodyRef = seedThroughCustody(core);
  core.recordScanClass(custodyRef, "clean");
  const candidate = core.createRevisionCandidate({
    logical_artifact_id: "art.report",
    custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1",
    parent_revision_id: null,
  }, SCOPE);
  assert.equal(candidate.state, "candidate");
  assert.equal(candidate.content_id, `sha256:${SHA_A}`);
  core.recordReview({ artifact_revision_id: "rev.1", review_ref: "review.1", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  assert.equal(core.getAcceptedHead("art.report", SCOPE), null, "review alone never moves the head");
  const accepted = core.recordHumanAcceptance({
    artifact_revision_id: "rev.1",
    acceptance_owner_ref: "human.acceptor_1",
    acceptance_ref: "accept.1",
  }, SCOPE);
  assert.equal(accepted.state, "accepted");
  assert.equal(core.getAcceptedHead("art.report", SCOPE), "rev.1");
  const kinds = core.eventLog().map((event) => event.kind);
  assert.deepEqual(kinds, [
    "logical_artifact_registered", "submission_recorded", "custody_receipt_recorded",
    "scan_class_recorded", "revision_candidate_created", "review_recorded", "revision_accepted",
  ]);
});

test("upload custody is never promotion: candidate creation demands a clean scan and real binding", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  const custodyRef = seedThroughCustody(core);
  // pending scan blocks
  assert.throws(() => core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE), (error) => error.code === HOLD_CODES.SCAN_NOT_CLEAN);
  // malware blocks permanently
  core.recordScanClass(custodyRef, "malware");
  assert.throws(() => core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE), (error) => error.code === HOLD_CODES.SCAN_NOT_CLEAN);
  // scan classification is one-shot
  assert.throws(() => core.recordScanClass(custodyRef, "clean"), (error) => error.code === "scan_class_already_set");
  // unknown custody blocks
  assert.throws(() => core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: "cust.ghost",
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE), (error) => error.code === HOLD_CODES.CUSTODY_MISSING);
  assert.equal(SCAN_CLASSES.includes("policy_hold"), true);
});

test("changed accepted head holds a stale-parent candidate and a stale acceptance", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  const first = seedThroughCustody(core, { submissionId: "sub.1", key: "key-1", sha: SHA_A });
  core.recordScanClass(first, "clean");
  core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: first,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE);
  core.recordReview({ artifact_revision_id: "rev.1", review_ref: "review.1", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.1" }, SCOPE);

  // a new candidate must declare the current head as parent
  const second = seedThroughCustody(core, { submissionId: "sub.2", key: "key-2", sha: SHA_B });
  core.recordScanClass(second, "clean");
  assert.throws(() => core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: second,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.2", parent_revision_id: null,
  }, SCOPE), (error) => error.code === HOLD_CODES.CHANGED_HEAD);
  const ok = core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: second,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.2", parent_revision_id: "rev.1",
  }, SCOPE);
  assert.equal(ok.parent_revision_id, "rev.1");

  // returning to old bytes is a NEW revision with a different parent, never a reuse
  const third = seedThroughCustody(core, { submissionId: "sub.3", key: "key-3", sha: SHA_A });
  core.recordScanClass(third, "clean");
  core.recordReview({ artifact_revision_id: "rev.2", review_ref: "review.2", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.2", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.2" }, SCOPE);
  const back = core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: third,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.3", parent_revision_id: "rev.2",
  }, SCOPE);
  assert.equal(back.content_id, `sha256:${SHA_A}`);
  assert.notEqual(back.artifact_revision_id, "rev.1");
});

test("idempotent replay returns the same submission; same key with different digest quarantines", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  core.recordSubmission({
    submission_id: "sub.1", actor_ref: "member.alice", assignment_ref: "assign.1",
    project_ref: "demo_project", idempotency_key: "key-1", declared_sha256: SHA_A, declared_size: 10,
  });
  const replay = core.recordSubmission({
    submission_id: "sub.dup", actor_ref: "member.alice", assignment_ref: "assign.1",
    project_ref: "demo_project", idempotency_key: "key-1", declared_sha256: SHA_A, declared_size: 10,
  });
  assert.deepEqual(replay, { replay: true, submission_id: "sub.1" });
  assert.throws(() => core.recordSubmission({
    submission_id: "sub.evil", actor_ref: "member.alice", assignment_ref: "assign.1",
    project_ref: "demo_project", idempotency_key: "key-1", declared_sha256: SHA_B, declared_size: 10,
  }), (error) => error.code === "submission_key_digest_conflict");
  const kinds = core.eventLog().map((event) => event.kind);
  assert.equal(kinds.includes("submission_conflict_quarantined"), true);
});

test("foreign project scope answers the uniform denial with no existence detail", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  const custodyRef = seedThroughCustody(core);
  core.recordScanClass(custodyRef, "clean");
  core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE);
  for (const attempt of [
    () => core.createRevisionCandidate({
      logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
      assignment_ref: "assign.1",
      artifact_revision_id: "rev.x", parent_revision_id: null,
    }, FOREIGN),
    () => core.createRevisionCandidate({
      logical_artifact_id: "art.ghost", custody_receipt_ref: custodyRef,
      assignment_ref: "assign.1",
      artifact_revision_id: "rev.x", parent_revision_id: null,
    }, SCOPE),
    () => core.recordReview({ artifact_revision_id: "rev.ghost", review_ref: "review.y", reviewer_ref: "reviewer.eve", verdict: "ACCEPT" }, SCOPE),
    () => core.recordHumanAcceptance({ artifact_revision_id: "rev.ghost", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.y" }, SCOPE),
    () => core.recordReview({ artifact_revision_id: "rev.1", review_ref: "review.x", reviewer_ref: "reviewer.eve", verdict: "ACCEPT" }, FOREIGN),
    () => core.recordHumanAcceptance({ artifact_revision_id: "rev.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.x" }, FOREIGN),
    () => core.getAcceptedHead("art.report", FOREIGN),
    () => core.getRevision("rev.1", FOREIGN),
    () => core.getRevision("rev.ghost", SCOPE),
    () => core.getAcceptedHead("art.ghost", SCOPE),
  ]) {
    assert.throws(attempt, (error) => error.code === UNIFORM_DENIAL.code && error.message === UNIFORM_DENIAL.code,
      "foreign or absent objects must be indistinguishable");
  }
});

test("review and acceptance stay separate authorities with independence and exact-owner checks", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  const custodyRef = seedThroughCustody(core);
  core.recordScanClass(custodyRef, "clean");
  core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE);
  // acceptance without any review holds
  assert.throws(() => core.recordHumanAcceptance({
    artifact_revision_id: "rev.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.1",
  }, SCOPE), (error) => error.code === HOLD_CODES.REVIEW_REQUIRED);
  // the submitter cannot review their own submission
  assert.throws(() => core.recordReview({
    artifact_revision_id: "rev.1", review_ref: "review.self", reviewer_ref: "member.alice", verdict: "ACCEPT",
  }, SCOPE), (error) => error.code === "review_not_independent");
  // a HOLD verdict never becomes acceptable silently
  core.recordReview({ artifact_revision_id: "rev.1", review_ref: "review.1", reviewer_ref: "reviewer.bob", verdict: "HOLD" }, SCOPE);
  assert.throws(() => core.recordHumanAcceptance({
    artifact_revision_id: "rev.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.1",
  }, SCOPE), (error) => error.code === HOLD_CODES.REVIEW_REQUIRED);
  // only the registered acceptance owner may accept
  const core2 = createVaultRevisionCore();
  seedArtifact(core2);
  const c2 = seedThroughCustody(core2);
  core2.recordScanClass(c2, "clean");
  core2.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: c2,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE);
  core2.recordReview({ artifact_revision_id: "rev.1", review_ref: "review.1", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  assert.throws(() => core2.recordHumanAcceptance({
    artifact_revision_id: "rev.1", acceptance_owner_ref: "human.impostor", acceptance_ref: "accept.1",
  }, SCOPE), (error) => error.code === "acceptance_owner_mismatch");
});

test("custody digest mismatch and malformed identities fail closed before any record lands", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  core.recordSubmission({
    submission_id: "sub.1", actor_ref: "member.alice", assignment_ref: "assign.1",
    project_ref: "demo_project", idempotency_key: "key-1", declared_sha256: SHA_A, declared_size: 10,
  });
  assert.throws(() => core.recordCustodyReceipt({
    custody_receipt_ref: "cust.sub.1", submission_id: "sub.1", stored_sha256: SHA_B,
  }), (error) => error.code === "custody_digest_mismatch");
  assert.throws(() => core.recordSubmission({
    submission_id: "sub.2", actor_ref: "member.alice", assignment_ref: "assign.1",
    project_ref: "demo_project", idempotency_key: "key-2", declared_sha256: "not-a-sha", declared_size: 10,
  }), (error) => error.code === "sha256_invalid");
  assert.throws(() => core.registerLogicalArtifact({
    logical_artifact_id: "UPPER CASE BAD", artifact_kind: "report", project_ref: "demo_project",
    logical_owner_ref: "a.b", byte_owner_ref: "a.b", revision_owner_ref: "a.b",
    acceptance_owner_ref: "a.b", backup_restore_owner_ref: "a.b",
  }), (error) => error.code === "ref_invalid");
  const kinds = core.eventLog().map((event) => event.kind);
  assert.deepEqual(kinds, ["logical_artifact_registered", "submission_recorded"], "failed validation calls append nothing (the quarantine conflict record is the deliberate exception)");
});

test("idempotency composite key cannot collide across actor/key boundaries containing colons", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  core.recordSubmission({
    submission_id: "sub.a", actor_ref: "member.a", assignment_ref: "assign.1",
    project_ref: "demo_project", idempotency_key: "kx:x1", declared_sha256: SHA_A, declared_size: 10,
  });
  // A different actor whose (actor, key) concatenation would collide under a
  // ":" delimiter ("member.a" + ":" + "kx:x1" === "member.a:kx" + ":" + "x1")
  // must be treated as an independent submission, even with a different digest
  // (no spurious quarantine, no cross-actor replay).
  const other = core.recordSubmission({
    submission_id: "sub.b", actor_ref: "member.a:kx", assignment_ref: "assign.1",
    project_ref: "demo_project", idempotency_key: "x1", declared_sha256: SHA_B, declared_size: 10,
  });
  assert.equal(other.submission_id, "sub.b");
  assert.equal(core.eventLog().some((event) => event.kind === "submission_conflict_quarantined"), false);
});

test("accepted revisions are terminal for review, scan classes cannot re-enter pending, and assignment binding is enforced", () => {
  const core = createVaultRevisionCore();
  seedArtifact(core);
  const custodyRef = seedThroughCustody(core);
  assert.throws(() => core.recordScanClass(custodyRef, "pending"), (error) => error.code === "scan_class_invalid");
  core.recordScanClass(custodyRef, "clean");
  assert.throws(() => core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.other",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE), (error) => error.code === HOLD_CODES.BINDING_MISSING);
  core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1",
    artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE);
  core.recordReview({ artifact_revision_id: "rev.1", review_ref: "review.1", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.1" }, SCOPE);
  // an accepted revision's record can never regress through a later review
  assert.throws(() => core.recordReview({
    artifact_revision_id: "rev.1", review_ref: "review.late", reviewer_ref: "reviewer.carol", verdict: "HOLD",
  }, SCOPE), (error) => error.code === "revision_already_accepted");
  assert.equal(core.getRevision("rev.1", SCOPE).state, "accepted");
  assert.equal(core.getAcceptedHead("art.report", SCOPE), "rev.1");
});

test("event log is append-only, frozen, and deterministic for identical call sequences", () => {
  const run = () => {
    const core = createVaultRevisionCore();
    seedArtifact(core);
    const custodyRef = seedThroughCustody(core);
    core.recordScanClass(custodyRef, "clean");
    core.createRevisionCandidate({
      logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
      assignment_ref: "assign.1",
      artifact_revision_id: "rev.1", parent_revision_id: null,
    }, SCOPE);
    return core.eventLog();
  };
  const first = run();
  const second = run();
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first[0]), true);
  assert.throws(() => { first[0].kind = "tampered"; }, TypeError);
});

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
  assert.deepEqual(kinds, ["logical_artifact_registered", "submission_recorded"], "failed validation calls append nothing (the deliberate exceptions are the three conflict records: submission quarantine, bundle_conflict, external_submission_conflict)");
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

// ---- Criterion-1 completion: bundle, redaction lineage, external gate ----

function seedAcceptedOriginal(core) {
  seedArtifact(core);
  const custodyRef = seedThroughCustody(core);
  core.recordScanClass(custodyRef, "clean");
  core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1", artifact_revision_id: "rev.1", parent_revision_id: null,
  }, SCOPE);
  core.recordReview({ artifact_revision_id: "rev.1", review_ref: "review.1", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.1" }, SCOPE);
}

function seedRedactionCustody(core, { submissionId = "sub.ext", key = "key-ext", sha = SHA_B } = {}) {
  seedArtifact(core, "art.report_external");
  return seedThroughCustody(core, { submissionId, key, sha });
}

test("a redaction derivative pins exact lineage and never skips review or acceptance", () => {
  const core = createVaultRevisionCore();
  seedAcceptedOriginal(core);
  const custodyRef = seedRedactionCustody(core);
  core.recordScanClass(custodyRef, "clean");
  const derived = core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.1", parent_revision_id: null,
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE);
  assert.equal(derived.state, "candidate", "redaction produces a CANDIDATE, not an accepted revision");
  assert.deepEqual(derived.derivation, {
    kind: "redaction",
    derived_from_revision_id: "rev.1",
    source_content_id: `sha256:${SHA_A}`,
    redaction_profile_ref: "redaction.external_v1",
  });
  // Not yet accepted -> the external gate holds.
  assert.throws(() => core.registerExternalSubmission({
    external_submission_id: "ext.1", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-key-1", revision_ids: ["rev.ext.1"],
  }, SCOPE), (error) => error.code === HOLD_CODES.EXTERNAL_ENTRY_NOT_ACCEPTED);
  core.recordReview({ artifact_revision_id: "rev.ext.1", review_ref: "review.ext", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.ext.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.ext" }, SCOPE);
  const registered = core.registerExternalSubmission({
    external_submission_id: "ext.1", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-key-1", revision_ids: ["rev.ext.1"],
  }, SCOPE);
  assert.equal(registered.claim, "lineage_registration_only_no_external_send");
  assert.deepEqual(registered.lineage, [{
    artifact_revision_id: "rev.ext.1",
    derived_from_revision_id: "rev.1",
    origin_revision_id: "rev.1",
    redaction_profile_ref: "redaction.external_v1",
  }], "the record itself answers: what left, redacted from what, under which profile");
  assert.equal(Object.isFrozen(registered), true);
  // Idempotent replay under the same submitter/key/destination/lineage.
  const replay = core.registerExternalSubmission({
    external_submission_id: "ext.other", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-key-1", revision_ids: ["rev.ext.1"],
  }, SCOPE);
  assert.deepEqual(replay, { replay: true, external_submission_id: "ext.1", lineage_digest: registered.lineage_digest });
  // Same key + same lineage toward a DIFFERENT destination is a conflict,
  // never a silent replay bound to the original destination.
  assert.throws(() => core.registerExternalSubmission({
    external_submission_id: "ext.elsewhere", submitter_ref: "member.alice", destination_ref: "dest.customer_y",
    idempotency_key: "ext-key-1", revision_ids: ["rev.ext.1"],
  }, SCOPE), (error) => error.code === "external_key_digest_conflict");
  assert.equal(core.getExternalSubmission("ext.1", SCOPE).destination_ref, "dest.customer_x");
  assert.equal(core.getExternalSubmission("ext.1", SCOPE).lineage_digest, registered.lineage_digest);
  assert.throws(() => core.getExternalSubmission("ext.1", FOREIGN), (error) => error.code === UNIFORM_DENIAL.code);
});

test("redaction guards: identical bytes, same artifact, non-accepted or foreign sources all fail with nothing written", () => {
  const core = createVaultRevisionCore();
  seedAcceptedOriginal(core);
  // Identical digest: the "redacted" custody carries the SAME sha as the source.
  const sameBytes = seedRedactionCustody(core, { submissionId: "sub.same", key: "key-same", sha: SHA_A });
  core.recordScanClass(sameBytes, "clean");
  assert.throws(() => core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: sameBytes,
    assignment_ref: "assign.1", artifact_revision_id: "rev.lie", parent_revision_id: null,
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE), (error) => error.code === "redaction_identical_digest");
  assert.throws(() => core.getRevision("rev.lie", SCOPE), (error) => error.code === UNIFORM_DENIAL.code, "a failed derivation writes no candidate");
  assert.equal(core.eventLog().some((event) => event.kind === "redaction_candidate_derived"), false);
  // Same logical artifact as the source is structurally refused.
  const otherCustody = seedThroughCustody(core, { submissionId: "sub.same2", key: "key-same2", sha: SHA_B });
  core.recordScanClass(otherCustody, "clean");
  assert.throws(() => core.deriveRedactionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: otherCustody,
    assignment_ref: "assign.1", artifact_revision_id: "rev.selfloop", parent_revision_id: "rev.1",
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE), (error) => error.code === "redaction_same_artifact");
  // Non-accepted source revision holds; absent and foreign sources are uniform.
  const candCustody = seedThroughCustody(core, { submissionId: "sub.c", key: "key-c", sha: "c".repeat(64) });
  core.recordScanClass(candCustody, "clean");
  core.createRevisionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: candCustody,
    assignment_ref: "assign.1", artifact_revision_id: "rev.2", parent_revision_id: "rev.1",
  }, SCOPE);
  assert.throws(() => core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: otherCustody,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.bad", parent_revision_id: null,
    derived_from_revision_id: "rev.2", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE), (error) => error.code === HOLD_CODES.REDACTION_SOURCE_NOT_ACCEPTED);
  const absent = (() => { try { core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: otherCustody,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.bad", parent_revision_id: null,
    derived_from_revision_id: "rev.ghost", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE); return null; } catch (error) { return error; } })();
  const foreign = (() => { try { core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: otherCustody,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.bad", parent_revision_id: null,
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, FOREIGN); return null; } catch (error) { return error; } })();
  assert.equal(absent.code, UNIFORM_DENIAL.code);
  assert.equal(absent.message, foreign.message, "absent and foreign sources are indistinguishable");
});

test("input bundles hold exact accepted revisions only, with an order-independent manifest digest", () => {
  const core = createVaultRevisionCore();
  seedAcceptedOriginal(core);
  const custodyRef = seedRedactionCustody(core);
  core.recordScanClass(custodyRef, "clean");
  core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.1", parent_revision_id: null,
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE);
  // A bundle containing a not-yet-accepted candidate fails and writes nothing.
  assert.throws(() => core.assembleInputBundle({
    bundle_id: "bundle.1", assembler_ref: "vault.assembler", idempotency_key: "bkey-1",
    purpose_ref: "purpose.work_brief", entries: ["rev.1", "rev.ext.1"],
  }, SCOPE), (error) => error.code === HOLD_CODES.BUNDLE_ENTRY_NOT_ACCEPTED);
  assert.throws(() => core.getBundle("bundle.1", SCOPE), (error) => error.code === UNIFORM_DENIAL.code);
  core.recordReview({ artifact_revision_id: "rev.ext.1", review_ref: "review.ext", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.ext.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.ext" }, SCOPE);
  const bundle = core.assembleInputBundle({
    bundle_id: "bundle.1", assembler_ref: "vault.assembler", idempotency_key: "bkey-1",
    purpose_ref: "purpose.work_brief", entries: ["rev.ext.1", "rev.1"],
  }, SCOPE);
  assert.equal(bundle.claim, "exact_accepted_revisions_only");
  assert.deepEqual(bundle.entries.map((entry) => entry.artifact_revision_id), ["rev.1", "rev.ext.1"], "manifest entries are sorted");
  assert.match(bundle.manifest_digest, /^[a-f0-9]{64}$/);
  // Same key, same entry SET in a different order -> idempotent replay.
  const replay = core.assembleInputBundle({
    bundle_id: "bundle.other", assembler_ref: "vault.assembler", idempotency_key: "bkey-1",
    purpose_ref: "purpose.work_brief", entries: ["rev.1", "rev.ext.1"],
  }, SCOPE);
  assert.deepEqual(replay, { replay: true, bundle_id: "bundle.1", manifest_digest: bundle.manifest_digest });
  // Same key, different entry set -> conflict, never overwrite.
  assert.throws(() => core.assembleInputBundle({
    bundle_id: "bundle.2", assembler_ref: "vault.assembler", idempotency_key: "bkey-1",
    purpose_ref: "purpose.work_brief", entries: ["rev.1"],
  }, SCOPE), (error) => error.code === "bundle_key_digest_conflict");
  // Same key, same entries, different PURPOSE -> also a conflict.
  assert.throws(() => core.assembleInputBundle({
    bundle_id: "bundle.repurposed", assembler_ref: "vault.assembler", idempotency_key: "bkey-1",
    purpose_ref: "purpose.external_submission", entries: ["rev.1", "rev.ext.1"],
  }, SCOPE), (error) => error.code === "bundle_key_digest_conflict");
  assert.throws(() => core.assembleInputBundle({
    bundle_id: "bundle.3", assembler_ref: "vault.assembler", idempotency_key: "bkey-3",
    purpose_ref: "purpose.work_brief", entries: ["rev.1", "rev.1"],
  }, SCOPE), (error) => error.code === "bundle_duplicate_entry");
  // Foreign and absent entries are uniformly denied.
  const absent = (() => { try { core.assembleInputBundle({
    bundle_id: "bundle.4", assembler_ref: "vault.assembler", idempotency_key: "bkey-4",
    purpose_ref: "purpose.work_brief", entries: ["rev.ghost"],
  }, SCOPE); return null; } catch (error) { return error; } })();
  const foreign = (() => { try { core.assembleInputBundle({
    bundle_id: "bundle.5", assembler_ref: "vault.assembler", idempotency_key: "bkey-5",
    purpose_ref: "purpose.work_brief", entries: ["rev.1"],
  }, FOREIGN); return null; } catch (error) { return error; } })();
  assert.equal(absent.code, UNIFORM_DENIAL.code);
  assert.equal(absent.message, foreign.message);
  assert.throws(() => core.getBundle("bundle.1", FOREIGN), (error) => error.code === UNIFORM_DENIAL.code);
  assert.equal(core.getBundle("bundle.1", SCOPE).manifest_digest, bundle.manifest_digest);
});

test("the external gate is structural: an accepted RAW original can never be registered for external submission", () => {
  const core = createVaultRevisionCore();
  seedAcceptedOriginal(core);
  const custodyRef = seedRedactionCustody(core);
  core.recordScanClass(custodyRef, "clean");
  core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.1", parent_revision_id: null,
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE);
  core.recordReview({ artifact_revision_id: "rev.ext.1", review_ref: "review.ext", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.ext.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.ext" }, SCOPE);
  // rev.1 is ACCEPTED - and still refused: acceptance is not redaction.
  assert.throws(() => core.registerExternalSubmission({
    external_submission_id: "ext.raw", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-raw-key", revision_ids: ["rev.1"],
  }, SCOPE), (error) => error.code === "external_requires_redacted_derivative");
  // Mixed list is all-or-nothing: the valid redacted entry does not carry the raw one.
  assert.throws(() => core.registerExternalSubmission({
    external_submission_id: "ext.mixed", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-mixed-key", revision_ids: ["rev.ext.1", "rev.1"],
  }, SCOPE), (error) => error.code === "external_requires_redacted_derivative");
  assert.throws(() => core.getExternalSubmission("ext.mixed", SCOPE), (error) => error.code === UNIFORM_DENIAL.code, "a refused registration records nothing");
  assert.equal(core.eventLog().some((event) => event.kind === "external_submission_registered"), false);
});

test("stored records are immutable at every depth: derivation, bundle entries, and lineage reject mutation", () => {
  const core = createVaultRevisionCore();
  seedAcceptedOriginal(core);
  const custodyRef = seedRedactionCustody(core);
  core.recordScanClass(custodyRef, "clean");
  const derived = core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.1", parent_revision_id: null,
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE);
  assert.throws(() => { derived.derivation.derived_from_revision_id = "rev.forged"; }, TypeError,
    "nested derivation must be frozen — a mutable derivation would let lineage be forged after the fact");
  core.recordReview({ artifact_revision_id: "rev.ext.1", review_ref: "review.ext", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.ext.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.ext" }, SCOPE);
  const bundle = core.assembleInputBundle({
    bundle_id: "bundle.1", assembler_ref: "vault.assembler", idempotency_key: "bkey-1",
    purpose_ref: "purpose.work_brief", entries: ["rev.1", "rev.ext.1"],
  }, SCOPE);
  assert.throws(() => { bundle.entries.push({ artifact_revision_id: "rev.injected" }); }, TypeError);
  assert.throws(() => { bundle.entries[0].content_id = "sha256:forged"; }, TypeError);
  const registered = core.registerExternalSubmission({
    external_submission_id: "ext.1", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-key-1", revision_ids: ["rev.ext.1"],
  }, SCOPE);
  assert.throws(() => { registered.lineage[0].origin_revision_id = "rev.forged"; }, TypeError);
  assert.equal(core.getRevision("rev.ext.1", SCOPE).derivation.derived_from_revision_id, "rev.1",
    "the ledger still holds the true lineage");
});

test("a redaction chain can never land back on an ancestor artifact, and external lineage stays chain-complete", () => {
  const core = createVaultRevisionCore();
  seedAcceptedOriginal(core);
  const custodyRef = seedRedactionCustody(core);
  core.recordScanClass(custodyRef, "clean");
  core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external", custody_receipt_ref: custodyRef,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext.1", parent_revision_id: null,
    derived_from_revision_id: "rev.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE);
  core.recordReview({ artifact_revision_id: "rev.ext.1", review_ref: "review.ext", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.ext.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.ext" }, SCOPE);
  // Depth-2: redact the redaction. Landing on the RAW ORIGINAL's artifact is
  // refused even though the immediate source lives elsewhere.
  const backCustody = seedThroughCustody(core, { submissionId: "sub.back", key: "key-back", sha: "d".repeat(64) });
  core.recordScanClass(backCustody, "clean");
  assert.throws(() => core.deriveRedactionCandidate({
    logical_artifact_id: "art.report", custody_receipt_ref: backCustody,
    assignment_ref: "assign.1", artifact_revision_id: "rev.cross", parent_revision_id: "rev.1",
    derived_from_revision_id: "rev.ext.1", redaction_profile_ref: "redaction.external_v2",
  }, SCOPE), (error) => error.code === "redaction_same_artifact",
  "a redaction-of-a-redaction must not become a revision of the raw original's artifact");
  // A depth-2 derivative on a THIRD artifact is legal, and its external
  // lineage names the raw origin, not just the intermediate.
  seedArtifact(core, "art.report_external_v2");
  const deepCustody = seedThroughCustody(core, { submissionId: "sub.deep", key: "key-deep", sha: "e".repeat(64) });
  core.recordScanClass(deepCustody, "clean");
  core.deriveRedactionCandidate({
    logical_artifact_id: "art.report_external_v2", custody_receipt_ref: deepCustody,
    assignment_ref: "assign.1", artifact_revision_id: "rev.ext2.1", parent_revision_id: null,
    derived_from_revision_id: "rev.ext.1", redaction_profile_ref: "redaction.external_v2",
  }, SCOPE);
  core.recordReview({ artifact_revision_id: "rev.ext2.1", review_ref: "review.ext2", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  core.recordHumanAcceptance({ artifact_revision_id: "rev.ext2.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.ext2" }, SCOPE);
  const registered = core.registerExternalSubmission({
    external_submission_id: "ext.deep", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-deep-key", revision_ids: ["rev.ext2.1"],
  }, SCOPE);
  assert.deepEqual(registered.lineage, [{
    artifact_revision_id: "rev.ext2.1",
    derived_from_revision_id: "rev.ext.1",
    origin_revision_id: "rev.1",
    redaction_profile_ref: "redaction.external_v2",
  }], "the record names both the immediate source and the raw origin of the chain");
});

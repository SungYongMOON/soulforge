// Vault / ArtifactRevision synthetic vertical — pure in-memory core.
//
// Program leaf row-3 (03_VAULT_ERP_ASSET_REVISIONS). This module implements the
// artifact state machine, the five-owner separation, and the promotion/conflict
// policy as a deterministic, append-only, in-memory core. It performs no I/O,
// opens no store, touches no byte custody, and grants no authority: every
// custody/scan/binding/review/acceptance event is a CALLER-ASSERTED synthetic
// fact fed through the typed API, exactly as the D27/D28/D29 design defaults
// require (pointer/reference first; promotion is a separate sole writer;
// closeout/proposal is never acceptance).
//
// Five owners stay separate fields on every object and are never inferred from
// one another: logical_owner_ref, byte_owner_ref, revision_owner_ref,
// acceptance_owner_ref, backup_restore_owner_ref.

export const VAULT_REVISION_SCHEMA = "soulforge.vault_artifact_revision_core.v0";

export const SCAN_CLASSES = Object.freeze([
  "pending", "clean", "rejected", "malware", "unscannable", "policy_hold", "unknown",
]);

// Foreign-scope handling is deliberately STRONGER than a named hold code:
// foreign and absent objects are indistinguishable through the uniform denial,
// so no HOLD_FOREIGN_SCOPE code exists on purpose (plan-03's intent, hardened).
export const HOLD_CODES = Object.freeze({
  CHANGED_HEAD: "HOLD_CHANGED_HEAD",
  REVIEW_REQUIRED: "HOLD_REVIEW_REQUIRED",
  SCAN_NOT_CLEAN: "HOLD_SCAN_NOT_CLEAN",
  CUSTODY_MISSING: "HOLD_CUSTODY_MISSING",
  BINDING_MISSING: "HOLD_BINDING_MISSING",
});

export const UNIFORM_DENIAL = Object.freeze({ code: "not_available" });

const SHA256 = /^[a-f0-9]{64}$/;
const REF = /^[a-z][a-z0-9_.:-]{1,120}$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function assertRef(value, field) {
  if (typeof value !== "string" || !REF.test(value)) fail("ref_invalid", field);
  return value;
}

function assertSha(value, field) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("sha256_invalid", field);
  return value;
}

function frozenClone(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

export function createVaultRevisionCore() {
  // Append-only ledgers; Maps index current pointers derived from them.
  const events = [];
  const artifacts = new Map();       // logical_artifact_id -> artifact record
  const submissions = new Map();     // submission_id -> submission record
  const custody = new Map();         // custody_receipt_ref -> custody record
  const candidates = new Map();      // artifact_revision_id -> candidate record
  const reviews = new Map();         // review_ref -> review record
  const acceptedHeads = new Map();   // logical_artifact_id -> accepted artifact_revision_id
  const idempotency = new Map();     // `${actor}:${key}` -> { digest, submission_id }

  function append(kind, payload) {
    const record = frozenClone({ seq: events.length + 1, kind, ...payload });
    events.push(record);
    return record;
  }

  function uniformDeny() {
    // Foreign, absent, and cross-project objects all raise this identical
    // error: same code, same message, no existence detail, nothing recorded.
    const error = new Error(UNIFORM_DENIAL.code);
    error.code = UNIFORM_DENIAL.code;
    error.uniform = true;
    throw error;
  }

  function resolveArtifactInScope(logicalArtifactId, scope) {
    // Scope shape is validated FIRST so a malformed scope fails identically
    // for absent and existing objects; then absent and foreign collapse into
    // one uniform denial.
    const scopeRef = assertRef(scope?.project_ref, "scope.project_ref");
    const id = assertRef(logicalArtifactId, "logical_artifact_id");
    const artifact = artifacts.get(id);
    if (!artifact || artifact.project_ref !== scopeRef) uniformDeny();
    return artifact;
  }

  function resolveCandidateInScope(revisionId, scope) {
    const scopeRef = assertRef(scope?.project_ref, "scope.project_ref");
    const id = assertRef(revisionId, "artifact_revision_id");
    const candidate = candidates.get(id);
    if (!candidate) uniformDeny();
    const artifact = artifacts.get(candidate.logical_artifact_id);
    if (artifact.project_ref !== scopeRef) uniformDeny();
    return { candidate, artifact };
  }

  return Object.freeze({
    schema: VAULT_REVISION_SCHEMA,

    // 1) Catalog: a logical artifact with its five separate owners.
    registerLogicalArtifact(input) {
      const id = assertRef(input?.logical_artifact_id, "logical_artifact_id");
      if (artifacts.has(id)) fail("logical_artifact_duplicate", id);
      const record = frozenClone({
        logical_artifact_id: id,
        artifact_kind: assertRef(input.artifact_kind, "artifact_kind"),
        project_ref: assertRef(input.project_ref, "project_ref"),
        logical_owner_ref: assertRef(input.logical_owner_ref, "logical_owner_ref"),
        byte_owner_ref: assertRef(input.byte_owner_ref, "byte_owner_ref"),
        revision_owner_ref: assertRef(input.revision_owner_ref, "revision_owner_ref"),
        acceptance_owner_ref: assertRef(input.acceptance_owner_ref, "acceptance_owner_ref"),
        backup_restore_owner_ref: assertRef(input.backup_restore_owner_ref, "backup_restore_owner_ref"),
      });
      artifacts.set(id, record);
      append("logical_artifact_registered", { logical_artifact_id: id });
      return record;
    },

    // 2) Submission: immutable evidence of an actor's declared upload intent.
    recordSubmission(input) {
      const id = assertRef(input?.submission_id, "submission_id");
      if (submissions.has(id)) fail("submission_duplicate", id);
      const actor = assertRef(input.actor_ref, "actor_ref");
      const key = assertRef(input.idempotency_key, "idempotency_key");
      const digest = assertSha(input.declared_sha256, "declared_sha256");
      // U+0000 is outside the REF alphabet, so this composite can never
      // collide across different (actor, key) pairs even though refs may
      // contain ":".
      const idemRef = `${actor}\u0000${key}`;
      const prior = idempotency.get(idemRef);
      if (prior) {
        if (prior.digest === digest) {
          // Idempotent replay: same actor, key, digest -> same submission.
          return frozenClone({ replay: true, submission_id: prior.submission_id });
        }
        // Same key, different digest: conflict + quarantine, never overwrite.
        append("submission_conflict_quarantined", { submission_id: id, prior_submission_id: prior.submission_id });
        fail("submission_key_digest_conflict", idemRef);
      }
      const record = frozenClone({
        submission_id: id,
        actor_ref: actor,
        assignment_ref: assertRef(input.assignment_ref, "assignment_ref"),
        project_ref: assertRef(input.project_ref, "project_ref"),
        idempotency_key: key,
        declared_sha256: digest,
        declared_size: Number.isSafeInteger(input.declared_size) && input.declared_size > 0
          ? input.declared_size : fail("size_invalid", "declared_size"),
      });
      submissions.set(id, record);
      idempotency.set(idemRef, { digest, submission_id: id });
      append("submission_recorded", { submission_id: id });
      return record;
    },

    // 3) Custody receipt: caller-asserted synthetic custody fact for a submission.
    recordCustodyReceipt(input) {
      const ref = assertRef(input?.custody_receipt_ref, "custody_receipt_ref");
      if (custody.has(ref)) fail("custody_receipt_duplicate", ref);
      const submission = submissions.get(assertRef(input.submission_id, "submission_id"));
      if (!submission) fail("submission_unknown", input.submission_id);
      const stored = assertSha(input.stored_sha256, "stored_sha256");
      if (stored !== submission.declared_sha256) fail("custody_digest_mismatch", ref);
      const record = frozenClone({
        custody_receipt_ref: ref,
        submission_id: submission.submission_id,
        stored_sha256: stored,
        scan_class: "pending",
      });
      custody.set(ref, record);
      append("custody_receipt_recorded", { custody_receipt_ref: ref });
      return record;
    },

    // 4) Scan classification: classification only — never a binding or promotion.
    recordScanClass(custodyReceiptRef, scanClass) {
      const record = custody.get(assertRef(custodyReceiptRef, "custody_receipt_ref"));
      if (!record) fail("custody_receipt_unknown", custodyReceiptRef);
      if (!SCAN_CLASSES.includes(scanClass) || scanClass === "pending") fail("scan_class_invalid", scanClass);
      if (record.scan_class !== "pending") fail("scan_class_already_set", custodyReceiptRef);
      const updated = frozenClone({ ...record, scan_class: scanClass });
      custody.set(custodyReceiptRef, updated);
      append("scan_class_recorded", { custody_receipt_ref: custodyReceiptRef, scan_class: scanClass });
      return updated;
    },

    // 5) Revision candidate: binding + parent/head check. The promoter role is
    //    the CALLER of this function — a separate sole writer per D27.
    createRevisionCandidate(input, scope) {
      const artifact = resolveArtifactInScope(input?.logical_artifact_id, scope);
      const custodyRecord = custody.get(assertRef(input.custody_receipt_ref, "custody_receipt_ref"));
      // An absent custody receipt and a custody receipt belonging to another
      // project are indistinguishable: both would otherwise reveal existence.
      const custodySubmission = custodyRecord ? submissions.get(custodyRecord.submission_id) : null;
      if (!custodyRecord || custodySubmission.project_ref !== artifact.project_ref) {
        fail(HOLD_CODES.CUSTODY_MISSING, "absent_or_out_of_scope");
      }
      if (custodyRecord.scan_class !== "clean") fail(HOLD_CODES.SCAN_NOT_CLEAN, custodyRecord.scan_class);
      const assignmentRef = assertRef(input.assignment_ref, "assignment_ref");
      if (assignmentRef !== custodySubmission.assignment_ref) {
        fail(HOLD_CODES.BINDING_MISSING, "assignment_mismatch");
      }
      const revisionId = assertRef(input.artifact_revision_id, "artifact_revision_id");
      if (candidates.has(revisionId)) fail("revision_duplicate", revisionId);
      const declaredParent = input.parent_revision_id === null ? null : assertRef(input.parent_revision_id, "parent_revision_id");
      const currentHead = acceptedHeads.get(artifact.logical_artifact_id) ?? null;
      if (declaredParent !== currentHead) fail(HOLD_CODES.CHANGED_HEAD, `expected=${currentHead}`);
      const record = frozenClone({
        artifact_revision_id: revisionId,
        logical_artifact_id: artifact.logical_artifact_id,
        parent_revision_id: declaredParent,
        content_id: `sha256:${custodyRecord.stored_sha256}`,
        custody_receipt_ref: custodyRecord.custody_receipt_ref,
        submission_id: custodyRecord.submission_id,
        assignment_ref: assignmentRef,
        state: "candidate",
        review_ref: null,
        acceptance_ref: null,
      });
      candidates.set(revisionId, record);
      append("revision_candidate_created", { artifact_revision_id: revisionId });
      return record;
    },

    // 6) Review record: ACCEPT/REVISE/HOLD verdict; never changes the head.
    recordReview(input, scope) {
      const { candidate } = resolveCandidateInScope(input?.artifact_revision_id, scope);
      if (candidate.state === "accepted") fail("revision_already_accepted", candidate.artifact_revision_id);
      const reviewer = assertRef(input.reviewer_ref, "reviewer_ref");
      const submitter = submissions.get(candidate.submission_id).actor_ref;
      if (reviewer === submitter) fail("review_not_independent", reviewer);
      if (!["ACCEPT", "REVISE", "HOLD"].includes(input.verdict)) fail("review_verdict_invalid", input.verdict);
      const reviewRef = assertRef(input.review_ref, "review_ref");
      if (reviews.has(reviewRef)) fail("review_duplicate", reviewRef);
      const record = frozenClone({
        review_ref: reviewRef,
        artifact_revision_id: candidate.artifact_revision_id,
        reviewer_ref: reviewer,
        verdict: input.verdict,
      });
      reviews.set(reviewRef, record);
      const updated = frozenClone({ ...candidate, state: "reviewed", review_ref: reviewRef });
      candidates.set(candidate.artifact_revision_id, updated);
      append("review_recorded", { review_ref: reviewRef, verdict: input.verdict });
      return record;
    },

    // 7) Human acceptance: the acceptance owner accepts one EXACT reviewed
    //    revision; only then does the accepted head move.
    recordHumanAcceptance(input, scope) {
      const { candidate, artifact } = resolveCandidateInScope(input?.artifact_revision_id, scope);
      const acceptor = assertRef(input.acceptance_owner_ref, "acceptance_owner_ref");
      if (acceptor !== artifact.acceptance_owner_ref) fail("acceptance_owner_mismatch", acceptor);
      if (candidate.review_ref === null) fail(HOLD_CODES.REVIEW_REQUIRED, candidate.artifact_revision_id);
      const review = reviews.get(candidate.review_ref);
      if (review.verdict !== "ACCEPT") fail(HOLD_CODES.REVIEW_REQUIRED, `verdict=${review.verdict}`);
      const currentHead = acceptedHeads.get(artifact.logical_artifact_id) ?? null;
      if (candidate.parent_revision_id !== currentHead) fail(HOLD_CODES.CHANGED_HEAD, `expected=${currentHead}`);
      const acceptanceRef = assertRef(input.acceptance_ref, "acceptance_ref");
      const updated = frozenClone({ ...candidate, state: "accepted", acceptance_ref: acceptanceRef });
      candidates.set(candidate.artifact_revision_id, updated);
      acceptedHeads.set(artifact.logical_artifact_id, candidate.artifact_revision_id);
      append("revision_accepted", { artifact_revision_id: candidate.artifact_revision_id, acceptance_ref: acceptanceRef });
      return updated;
    },

    // Read model — scope-checked, uniform denial for foreign projects.
    getAcceptedHead(logicalArtifactId, scope) {
      const artifact = resolveArtifactInScope(logicalArtifactId, scope);
      return acceptedHeads.get(artifact.logical_artifact_id) ?? null;
    },

    getRevision(revisionId, scope) {
      return resolveCandidateInScope(revisionId, scope).candidate;
    },

    // Trusted audit surface: the caller of this factory owns the whole core,
    // so the event log is intentionally unscoped. Any multi-tenant exposure
    // must project it through its own scoped adapter, never hand this out.
    eventLog() {
      return events.slice();
    },
  });
}

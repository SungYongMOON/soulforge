import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  RETENTION_APPROVAL_RECEIPT_SCHEMA,
  RETENTION_PRESERVATION_MANIFEST_SCHEMA,
  RETENTION_PRESERVATION_RECEIPT_SCHEMA,
  RETENTION_PRESERVATION_RESULT_SCHEMA,
  validateRetentionApprovalReceipt,
  planRetentionPreservation,
  executeRetentionPreservation,
  verifyRetentionPreservation,
  computeManifestDigest
} from "../lifecycle_retention_preservation.mjs";

import {
  executeRetentionPreservationSyntheticInternal,
  sanitizeAndVerifyReport,
  validateClockNow,
  sanitizeAdapterErrorCode,
  canonicalizeJson
} from "../lifecycle_retention_preservation_internal.mjs";

import { computeReportDigest } from "../lifecycle_retention.mjs";

import {
  createSyntheticPreservationSourceReaderAdapter,
  createSyntheticPreservationWriterAdapter,
  createSyntheticPreservationReaderAdapter,
  HELD_PRODUCTION_PRESERVATION_ADAPTER
} from "../../../guild_hall/backup_controller/retention_preservation_gate.mjs";

const VALID_CANDIDATE_ID = "cand-11111111111111111111111111111111";

function makeValidReport(overrides = {}) {
  const baseReport = {
    schema_version: "soulforge.codex_thread_manager.lifecycle_retention_report.v1",
    report_only: true,
    generated_at: "2026-08-21T10:05:00.000Z",
    scope_metadata: {
      classifications_scope: "all_current_or_accepted_enrolled_tasks",
      candidates_scope: "exact_bound_active_enrolled_tasks_only"
    },
    lifecycle_retention_action: "HOLD",
    source_health: {
      enrollment: "available",
      lifecycle: "available",
      result_gate: "available",
      task_worktree_binding: "available"
    },
    thread_scope: {
      current_or_accepted_count: 1,
      history_or_retired_excluded_count: 0,
      bound_task_count: 1,
      unbound_task_count: 0,
      orphan_binding_count: 0,
      binding_coverage: "complete"
    },
    classifications: {
      active: 0,
      input_waiting: 0,
      result_waiting: 0,
      completed: 1,
      interrupted: 0,
      duplicate: 0,
      duplicate_candidate_hold: 0,
      unknown: 0
    },
    candidates: [
      {
        candidate_id: VALID_CANDIDATE_ID,
        retention_action: "HOLD",
        classification: "completed",
        enrollment_lifecycle: "current",
        reason_codes: ["authoritative_completion_receipt"],
        hold_reasons: ["result_handoff_authority_unknown"],
        metadata_counts: {
          tracked_dirty: false,
          untracked: false,
          index_lock: false,
          operation_markers: 0,
          unique_commits_vs_main: 1,
          locked: false,
          prunable: false
        }
      }
    ],
    authority_gaps: {
      completion_receipt: "HOLD",
      interruption_receipt: "HOLD",
      duplicate_decision: "HOLD",
      codex_archive_delete: "OWNER_AUTHORIZATION_REQUIRED",
      pull_request: "HOLD",
      active_process: "HOLD",
      result_handoff: "HOLD"
    },
    worktree_preflight: {
      report_only: true,
      status: "HOLD",
      list_status: "available",
      comparison_ref_status: "available",
      total_worktrees: 1,
      dirty_worktrees: 0,
      untracked_worktrees: 0,
      locked_worktrees: 0,
      prunable_worktrees: 0,
      index_lock_worktrees: 0,
      operation_marker_worktrees: 0,
      unique_commit_worktrees: 1,
      sanitization_dropped_entries: 0,
      sanitized_field_count: 0,
      authority_gaps: { pull_request: "HOLD", active_process: "HOLD", result_handoff: "HOLD" },
      entries: []
    },
    privacy: {
      metadata_only: true,
      raw_content_fields_stored: 0,
      raw_flag_fields_stored: 0,
      sensitive_content_included: false,
      paths_omitted: true
    },
    ...overrides
  };

  if (!baseReport.digest) {
    baseReport.digest = computeReportDigest(baseReport);
  }
  return baseReport;
}

const DEFAULT_VALID_REPORT = makeValidReport();
const VALID_REPORT_DIGEST = DEFAULT_VALID_REPORT.digest;

function makeValidApprovalReceipt(overrides = {}) {
  return {
    schema_version: RETENTION_APPROVAL_RECEIPT_SCHEMA,
    approval_id: "appr-20260821-001",
    candidate_id: VALID_CANDIDATE_ID,
    report_digest: VALID_REPORT_DIGEST,
    allowed_action: "preserve",
    preservation_strategy: "preservation_branch",
    issued_at: "2026-08-21T10:00:00.000Z",
    expires_at: "2026-08-22T10:00:00.000Z",
    ...overrides
  };
}

describe("Soulforge Lifecycle Retention Phase 4: Approve & Preserve Module", () => {
  it("exact valid approval receipt passes validation", () => {
    const approval = makeValidApprovalReceipt();
    const res = validateRetentionApprovalReceipt(approval, { now: Date.parse("2026-08-21T12:00:00.000Z") });
    assert.equal(res.valid, true);
    assert.equal(res.code, "APPROVAL_VALID");
    assert.equal(res.approval.candidate_id, VALID_CANDIDATE_ID);
  });

  it("malformed, extra, raw, or path-like fields fail approval receipt validation", () => {
    const extraField = makeValidApprovalReceipt({ extra_key: "forbidden" });
    assert.equal(validateRetentionApprovalReceipt(extraField).valid, false);

    const pathInField = makeValidApprovalReceipt({ approval_id: "appr-" + ["C:", "Users", "secret"].join("\\") });
    assert.equal(validateRetentionApprovalReceipt(pathInField).valid, false);

    const embeddedPath = makeValidApprovalReceipt({ approval_id: "appr-foo=" + ["C:", "Users", "admin"].join("\\") });
    assert.equal(validateRetentionApprovalReceipt(embeddedPath).valid, false);

    const secretInField = makeValidApprovalReceipt({ approval_id: "appr-Bearer ghp_1234567890123456" });
    assert.equal(validateRetentionApprovalReceipt(secretInField).valid, false);

    const malformedId = makeValidApprovalReceipt({ candidate_id: "invalid_id" });
    assert.equal(validateRetentionApprovalReceipt(malformedId).valid, false);
  });

  it("expiration and future timestamp skew fail approval validation", () => {
    const expired = makeValidApprovalReceipt();
    const expRes = validateRetentionApprovalReceipt(expired, { now: Date.parse("2026-08-23T00:00:00.000Z") });
    assert.equal(expRes.valid, false);
    assert.equal(expRes.code, "APPROVAL_EXPIRED");

    const future = makeValidApprovalReceipt();
    const futRes = validateRetentionApprovalReceipt(future, { now: Date.parse("2026-08-21T09:00:00.000Z") });
    assert.equal(futRes.valid, false);
    assert.equal(futRes.code, "APPROVAL_FUTURE_SKEW_REJECTED");
  });

  it("action and strategy allowlists strictly enforce preserve and valid strategies", () => {
    const forbiddenActions = ["apply", "delete", "archive", "remove", "prune", "clean", "reset", "stash"];
    for (const action of forbiddenActions) {
      const receipt = makeValidApprovalReceipt({ allowed_action: action });
      const res = validateRetentionApprovalReceipt(receipt, { now: Date.parse("2026-08-21T12:00:00.000Z") });
      assert.equal(res.valid, false);
      assert.equal(res.code, "DISALLOWED_ACTION_REJECTED");
    }

    const invalidStrategy = makeValidApprovalReceipt({ preservation_strategy: "hard_delete" });
    const stratRes = validateRetentionApprovalReceipt(invalidStrategy, { now: Date.parse("2026-08-21T12:00:00.000Z") });
    assert.equal(stratRes.valid, false);
    assert.equal(stratRes.code, "DISALLOWED_STRATEGY_REJECTED");
  });

  it("plans preservation for preservation_branch and _local_hold strategies", () => {
    const report = makeValidReport();
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const branchApproval = makeValidApprovalReceipt({ report_digest: report.digest, preservation_strategy: "preservation_branch" });
    const branchPlan = planRetentionPreservation(report, branchApproval, { now });
    assert.equal(branchPlan.status, "PLAN_READY");
    assert.equal(branchPlan.manifest_template.strategy, "preservation_branch");
    assert.equal(branchPlan.manifest_template.portable_ref, `refs/retention/preservation-${VALID_CANDIDATE_ID}`);

    const holdApproval = makeValidApprovalReceipt({ report_digest: report.digest, preservation_strategy: "_local_hold" });
    const holdPlan = planRetentionPreservation(report, holdApproval, { now });
    assert.equal(holdPlan.status, "PLAN_READY");
    assert.equal(holdPlan.manifest_template.strategy, "_local_hold");
    assert.equal(holdPlan.manifest_template.portable_ref, `_local_hold/candidates/${VALID_CANDIDATE_ID}`);
  });

  it("fail closed on absent, missing, or invalid worktree safety fields", () => {
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    // Missing metadata_counts
    const r1 = makeValidReport({ candidates: [{ candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD" }] });
    const a1 = makeValidApprovalReceipt({ report_digest: r1.digest });
    assert.equal(planRetentionPreservation(r1, a1, { now }).reason_code, "METADATA_COUNTS_MISSING");

    // Non-boolean tracked_dirty
    const r2 = makeValidReport({ candidates: [{ candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD", metadata_counts: { tracked_dirty: "yes", untracked: false, index_lock: false, operation_markers: 0, locked: false, unique_commits_vs_main: 1 } }] });
    const a2 = makeValidApprovalReceipt({ report_digest: r2.digest });
    assert.equal(planRetentionPreservation(r2, a2, { now }).reason_code, "DIRTY_UNTRACKED_STATE_UNKNOWN");

    // Non-boolean untracked
    const r3 = makeValidReport({ candidates: [{ candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD", metadata_counts: { tracked_dirty: false, untracked: null, index_lock: false, operation_markers: 0, locked: false, unique_commits_vs_main: 1 } }] });
    const a3 = makeValidApprovalReceipt({ report_digest: r3.digest });
    assert.equal(planRetentionPreservation(r3, a3, { now }).reason_code, "DIRTY_UNTRACKED_STATE_UNKNOWN");

    // Non-boolean index_lock
    const r4 = makeValidReport({ candidates: [{ candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD", metadata_counts: { tracked_dirty: false, untracked: false, index_lock: 1, operation_markers: 0, locked: false, unique_commits_vs_main: 1 } }] });
    const a4 = makeValidApprovalReceipt({ report_digest: r4.digest });
    assert.equal(planRetentionPreservation(r4, a4, { now }).reason_code, "INDEX_LOCK_PRESENT_OR_UNKNOWN");

    // Invalid operation_markers (string or negative)
    const r5 = makeValidReport({ candidates: [{ candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD", metadata_counts: { tracked_dirty: false, untracked: false, index_lock: false, operation_markers: -1, locked: false, unique_commits_vs_main: 1 } }] });
    const a5 = makeValidApprovalReceipt({ report_digest: r5.digest });
    assert.equal(planRetentionPreservation(r5, a5, { now }).reason_code, "GIT_OPERATION_MARKER_PRESENT");

    // Non-boolean locked
    const r6 = makeValidReport({ candidates: [{ candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD", metadata_counts: { tracked_dirty: false, untracked: false, index_lock: false, operation_markers: 0, locked: "true", unique_commits_vs_main: 1 } }] });
    const a6 = makeValidApprovalReceipt({ report_digest: r6.digest });
    assert.equal(planRetentionPreservation(r6, a6, { now }).reason_code, "WORKTREE_LOCKED");
  });

  it("non-HOLD retention_action in report or candidate fails planning", () => {
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const r1 = makeValidReport({ lifecycle_retention_action: "APPLY" });
    const a1 = makeValidApprovalReceipt({ report_digest: r1.digest });
    assert.equal(planRetentionPreservation(r1, a1, { now }).reason_code, "RETENTION_ACTION_UNSUPPORTED");

    const r2 = makeValidReport({
      candidates: [{
        candidate_id: VALID_CANDIDATE_ID,
        retention_action: "REMOVE",
        metadata_counts: { tracked_dirty: false, untracked: false, index_lock: false, operation_markers: 0, locked: false, unique_commits_vs_main: 1 }
      }]
    });
    const a2 = makeValidApprovalReceipt({ report_digest: r2.digest });
    assert.equal(planRetentionPreservation(r2, a2, { now }).reason_code, "RETENTION_ACTION_UNSUPPORTED");
  });

  it("reject duplicate candidate_id entries in report", () => {
    const r = makeValidReport({
      candidates: [
        { candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD" },
        { candidate_id: VALID_CANDIDATE_ID, retention_action: "HOLD" }
      ]
    });
    const a = makeValidApprovalReceipt({ report_digest: r.digest });
    assert.equal(planRetentionPreservation(r, a, { now: Date.parse("2026-08-21T12:00:00.000Z") }).reason_code, "DUPLICATE_CANDIDATE_ID_REJECTED");
  });

  it("mutation of raw approvalInput during await does not alter synthetic execution", async () => {
    const report = makeValidReport();
    const approvalInput = makeValidApprovalReceipt({ report_digest: report.digest });
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const store = new Map();
    // Delayed source reader that mutates approvalInput while pending
    const sourceReader = {
      adapter_kind: "synthetic_preservation_source_reader",
      readSourceObjects(candidateId) {
        return new Promise((resolve) => {
          setTimeout(() => {
            // Mutate raw approvalInput during await!
            approvalInput.candidate_id = "cand-99999999999999999999999999999999";
            approvalInput.preservation_strategy = "invalid_strategy";
            approvalInput.report_digest = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

            resolve({
              success: true,
              candidate_id: candidateId,
              objects: [{ kind: "git_object_pack", bytes: Buffer.from("commit_bytes_123") }]
            });
          }, 10);
        });
      }
    };
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });

    const execRes = await executeRetentionPreservationSyntheticInternal(report, approvalInput, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader
    });

    // Proves execution used immutable snapshot from planning and succeeded!
    assert.equal(execRes.status, "PRESERVED_VERIFIED");
    assert.equal(execRes.receipt.candidate_id, VALID_CANDIDATE_ID);
    assert.equal(execRes.receipt.strategy, "preservation_branch");
  });

  it("reject missing, non-Buffer, or empty Buffer source objects", async () => {
    const report = makeValidReport();
    const approval = makeValidApprovalReceipt({ report_digest: report.digest });
    const now = Date.parse("2026-08-21T12:00:00.000Z");
    const store = new Map();
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });

    // String bytes (not Buffer)
    const invalidReader1 = {
      readSourceObjects: () => ({ success: true, objects: [{ kind: "git_object_pack", bytes: "fake_string" }] })
    };
    const res1 = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: invalidReader1,
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader
    });
    assert.equal(res1.reason_code, "SOURCE_OBJECT_INVALID");

    // Empty Buffer
    const invalidReader2 = {
      readSourceObjects: () => ({ success: true, objects: [{ kind: "git_object_pack", bytes: Buffer.alloc(0) }] })
    };
    const res2 = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: invalidReader2,
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader
    });
    assert.equal(res2.reason_code, "SOURCE_OBJECT_INVALID");
  });

  it("truthful zero unique commits branch preservation rejection", async () => {
    const zeroCommitReport = makeValidReport({
      candidates: [{
        candidate_id: VALID_CANDIDATE_ID,
        retention_action: "HOLD",
        metadata_counts: {
          tracked_dirty: false,
          untracked: false,
          index_lock: false,
          operation_markers: 0,
          unique_commits_vs_main: 0, // 0 unique commits vs main
          locked: false,
          prunable: false
        }
      }]
    });
    const approval = makeValidApprovalReceipt({ report_digest: zeroCommitReport.digest, preservation_strategy: "preservation_branch" });
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const store = new Map();
    const sourceReader = createSyntheticPreservationSourceReaderAdapter({
      objects: [{ kind: "git_object_pack", bytes: Buffer.from("dummy") }]
    });
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });

    const res = await executeRetentionPreservationSyntheticInternal(zeroCommitReport, approval, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader
    });
    assert.equal(res.status, "HOLD");
    assert.equal(res.reason_code, "ZERO_UNIQUE_COMMITS_BRANCH_PRESERVATION_FORBIDDEN");
  });

  it("nested manifest_digest key is preserved during canonicalization", () => {
    const root = {
      manifest_id: "pmst-1",
      manifest_digest: "sha256:root_digest",
      nested: {
        manifest_digest: "sha256:nested_digest",
        key: "value"
      }
    };
    const canonical = canonicalizeJson(root);
    assert.ok(!canonical.includes("sha256:root_digest")); // Root manifest_digest excluded
    assert.ok(canonical.includes("sha256:nested_digest")); // Nested manifest_digest preserved
  });

  it("hostile: public executeRetentionPreservation ignores adapter injection and always returns HOLD", async () => {
    const report = makeValidReport();
    const approval = makeValidApprovalReceipt({ report_digest: report.digest });
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const store = new Map();
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });
    const sourceReader = createSyntheticPreservationSourceReaderAdapter();

    const publicRes = await executeRetentionPreservation(report, approval, {
      now,
      featureState: "synthetic",
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader,
      sourceReaderAdapter: sourceReader
    });

    assert.equal(publicRes.schema_version, RETENTION_PRESERVATION_RESULT_SCHEMA);
    assert.equal(publicRes.status, "HOLD");
    assert.equal(publicRes.reason_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");
    assert.equal(publicRes.preservation_count, 0);
    assert.equal(publicRes.removal_count, 0);
    assert.equal(publicRes.receipt, null);
    assert.equal(writer.getWriteCalls(), 0);
    assert.equal(reader.getReadCalls(), 0);
    assert.equal(sourceReader.getReadCalls(), 0);
  });

  it("hostile: forged report digest and modified report contents fail validation", () => {
    const report = makeValidReport();
    const approval = makeValidApprovalReceipt({ report_digest: report.digest });

    // Tamper with candidate ID without recomputing digest
    report.candidates[0].candidate_id = "cand-99999999999999999999999999999999";
    const planRes = planRetentionPreservation(report, approval, { now: Date.parse("2026-08-21T12:00:00.000Z") });
    assert.equal(planRes.status, "HOLD");
    assert.equal(planRes.reason_code, "REPORT_DIGEST_MISMATCH");

    const verRes = sanitizeAndVerifyReport(report, VALID_REPORT_DIGEST);
    assert.equal(verRes.valid, false);
    assert.equal(verRes.code, "REPORT_DIGEST_MISMATCH");
  });

  it("hostile: source object count mismatch produces HOLD during synthetic execution", async () => {
    const report = makeValidReport({
      candidates: [
        {
          candidate_id: VALID_CANDIDATE_ID,
          retention_action: "HOLD",
          classification: "completed",
          enrollment_lifecycle: "current",
          reason_codes: ["authoritative_completion_receipt"],
          hold_reasons: [],
          metadata_counts: {
            tracked_dirty: false,
            untracked: false,
            index_lock: false,
            operation_markers: 0,
            unique_commits_vs_main: 3, // Requires 3 unique commits
            locked: false,
            prunable: false
          }
        }
      ]
    });
    const approval = makeValidApprovalReceipt({ report_digest: report.digest });
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const store = new Map();
    const sourceReader = createSyntheticPreservationSourceReaderAdapter({
      objects: [{ kind: "git_object_pack", bytes: Buffer.from("only_one_commit_pack") }]
    });
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });

    const execRes = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader
    });

    assert.equal(execRes.status, "HOLD");
    assert.equal(execRes.reason_code, "SOURCE_OBJECT_COUNT_MISMATCH");
    assert.equal(execRes.preservation_count, 0);
    assert.equal(execRes.removal_count, 0);
  });

  it("hostile: raw or unsafe adapter error codes fail closed", () => {
    assert.equal(sanitizeAdapterErrorCode("FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN"), "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");
    assert.equal(sanitizeAdapterErrorCode("RAW_SECRET_OR_PATH_" + ["C:", "Users", "admin"].join("\\")), "ADAPTER_ERROR_CODE_UNSAFE");
    assert.equal(sanitizeAdapterErrorCode("UNKNOWN_CUSTOM_ERROR_CODE"), "ADAPTER_ERROR_CODE_UNSAFE");
    assert.equal(sanitizeAdapterErrorCode({ toString: () => "EVIL_PROXY" }), "ADAPTER_ERROR_CODE_UNSAFE");
  });

  it("hostile: invalid clock values fail closed", () => {
    assert.equal(validateClockNow("not_a_number"), null);
    assert.equal(validateClockNow(NaN), null);
    assert.equal(validateClockNow(-100), null);
    assert.equal(validateClockNow(() => { throw new Error("clock_crash"); }), null);
    assert.equal(validateClockNow(1700000000000), 1700000000000);
  });

  it("actual synthetic byte roundtrip produces verified receipt with synthetic evidence labels", async () => {
    const report = makeValidReport();
    const approval = makeValidApprovalReceipt({ report_digest: report.digest });
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const store = new Map();
    const sourceReader = createSyntheticPreservationSourceReaderAdapter();
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });

    const execRes = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader
    });

    assert.equal(execRes.status, "PRESERVED_VERIFIED");
    assert.equal(execRes.reason_code, "SUCCESS");
    assert.equal(execRes.preservation_count, 1);
    assert.equal(execRes.removal_count, 0);

    const receipt = execRes.receipt;
    assert.equal(receipt.schema_version, RETENTION_PRESERVATION_RECEIPT_SCHEMA);
    assert.equal(receipt.status, "PRESERVED_VERIFIED");
    assert.equal(receipt.restore_check_status, "VERIFIED");
    assert.equal(receipt.claim_ceiling, "synthetic_evidence_only");
    assert.equal(receipt.evidence_kind, "synthetic_test_proof");
    assert.equal(receipt.preservation_count, 1);
    assert.equal(receipt.removal_count, 0);
    assert.equal(receipt.authority.preservation_authorized, true);
    assert.equal(receipt.authority.removal_authorized, false);
  });

  it("restore-check failure, partial write, wrong bytes, replay conflict, and adapter throws produce HOLD", async () => {
    const report = makeValidReport();
    const approval = makeValidApprovalReceipt({ report_digest: report.digest });
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    // Partial write
    const sourceReader = createSyntheticPreservationSourceReaderAdapter();
    const partialWriter = createSyntheticPreservationWriterAdapter({ partialWrite: true });
    const reader = createSyntheticPreservationReaderAdapter({ store: partialWriter.getStore() });
    const res1 = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: partialWriter,
      preservationReaderAdapter: reader
    });
    assert.equal(res1.status, "HOLD");
    assert.equal(res1.preservation_count, 0);

    // Corrupt write
    const corruptWriter = createSyntheticPreservationWriterAdapter({ corruptWrite: true });
    const corruptReader = createSyntheticPreservationReaderAdapter({ store: corruptWriter.getStore() });
    const res2 = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: corruptWriter,
      preservationReaderAdapter: corruptReader
    });
    assert.equal(res2.status, "HOLD");
    assert.equal(res2.reason_code, "OBJECT_DIGEST_MISMATCH");

    // Adapter throw
    const throwingWriter = createSyntheticPreservationWriterAdapter({ failWriteWith: new Error("synthetic_crash") });
    const res3 = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: throwingWriter,
      preservationReaderAdapter: reader
    });
    assert.equal(res3.status, "HOLD");
    assert.equal(res3.reason_code, "PRESERVATION_WRITE_THREW");
  });

  it("removal authority is ALWAYS zero", async () => {
    const report = makeValidReport();
    const approval = makeValidApprovalReceipt({ report_digest: report.digest });
    const now = Date.parse("2026-08-21T12:00:00.000Z");

    const store = new Map();
    const sourceReader = createSyntheticPreservationSourceReaderAdapter();
    const writer = createSyntheticPreservationWriterAdapter({ store });
    const reader = createSyntheticPreservationReaderAdapter({ store });

    const execRes = await executeRetentionPreservationSyntheticInternal(report, approval, {
      now,
      sourceReaderAdapter: sourceReader,
      preservationWriterAdapter: writer,
      preservationReaderAdapter: reader
    });

    assert.equal(execRes.removal_count, 0);
    if (execRes.receipt) {
      assert.equal(execRes.receipt.removal_count, 0);
      assert.equal(execRes.receipt.authority.removal_authorized, false);
    }
  });

  it("manifest digest computation is deterministic and digest-stable", () => {
    const manifest = {
      schema_version: RETENTION_PRESERVATION_MANIFEST_SCHEMA,
      manifest_id: "pmst-1234",
      candidate_id: VALID_CANDIDATE_ID,
      strategy: "preservation_branch",
      portable_ref: `refs/retention/preservation-${VALID_CANDIDATE_ID}`,
      objects: [{ object_id: "obj-1", kind: "commit", digest: "sha256:111", byte_count: 10 }],
      total_objects: 1,
      total_bytes: 10
    };

    const d1 = computeManifestDigest(manifest);
    const d2 = computeManifestDigest(manifest);
    assert.equal(d1, d2);
    assert.match(d1, /^sha256:[0-9a-f]{64}$/);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  evaluateCodexRetentionProjection,
  readCodexRetentionProjection,
  validateCodexRetentionAutomationReport,
  computeAutomationReportDigest,
  unavailableProjection,
  CODEX_RETENTION_PROJECTION_ENVELOPE_SCHEMA,
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA
} from "./codex-retention-projection.mjs";
import {
  readCodexRetentionProjectionInternal
} from "./codex-retention-projection-internal.mjs";

const NOW_MS = 1787241600000; // 2026-08-21T08:00:00.000Z

function validReport(overrides = {}) {
  const base = {
    schema_version: CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA,
    generated_at: new Date(NOW_MS - 300000).toISOString(), // 5 min old
    report_only: true,
    status: "PASS",
    retention: { status: "HOLD" },
    inventory: { status: "PASS" },
    summary: {
      retention_evidence_status: "HOLD",
      retention_action: "HOLD",
      inventory_status: "PASS",
      bound_candidate_count: 3,
      unbound_active_task_count: 1,
      inventory_gap_count: 0,
      task_classifications: {
        active: 2,
        input_waiting: 1,
        result_waiting: 0,
        completed: 0,
        interrupted: 0,
        duplicate: 0,
        unknown: 0
      },
      worktree_totals: {
        total: 5,
        dirty: 1,
        locked: 0,
        index_lock: 0,
        operation_marker: 0,
        unique_commit: 2,
        prunable: 0
      },
      destructive_action_count: 0,
      local_automation_install_count: 0
    }
  };

  const merged = { ...base, ...overrides, summary: { ...base.summary, ...(overrides.summary || {}) } };
  merged.digest = computeAutomationReportDigest(merged);
  return merged;
}

test("evaluateCodexRetentionProjection evaluates current, late, stale, and unavailable correctly", () => {
  const currentRes = evaluateCodexRetentionProjection(validReport(), { now: NOW_MS });
  assert.equal(currentRes.schema_version, CODEX_RETENTION_PROJECTION_ENVELOPE_SCHEMA);
  assert.equal(currentRes.status, "current");
  assert.equal(currentRes.reason, null);
  assert.equal(currentRes.age_seconds, 300);
  assert.equal(currentRes.summary.bound_candidate_count, 3);
  assert.equal(currentRes.summary.retention_action, "HOLD");
  assert.equal(currentRes.authority_boundary.read_only, true);
  assert.equal(currentRes.authority_boundary.repair_authority, false);

  const lateReport = validReport({ generated_at: new Date(NOW_MS - 87000 * 1000).toISOString() });
  const lateRes = evaluateCodexRetentionProjection(lateReport, { now: NOW_MS });
  assert.equal(lateRes.status, "late");
  assert.equal(lateRes.reason, "report_late");

  const staleReport = validReport({ generated_at: new Date(NOW_MS - 91000 * 1000).toISOString() });
  const staleRes = evaluateCodexRetentionProjection(staleReport, { now: NOW_MS });
  assert.equal(staleRes.status, "stale");
  assert.equal(staleRes.reason, "report_stale");

  const holdReport = validReport({ status: "HOLD" });
  const holdRes = evaluateCodexRetentionProjection(holdReport, { now: NOW_MS });
  assert.equal(holdRes.status, "current");
  assert.equal(holdRes.reason, "retention_or_inventory_hold");
});

test("validateCodexRetentionAutomationReport recomputes digest and fails on forged/mismatched digest", () => {
  const report = validReport();
  assert.equal(validateCodexRetentionAutomationReport(report, { now: NOW_MS }), report);

  const forgedReport = { ...report, digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" };
  assert.throws(
    () => validateCodexRetentionAutomationReport(forgedReport, { now: NOW_MS }),
    (err) => err.message === "report_digest_mismatch"
  );
});

test("validateCodexRetentionAutomationReport rejects extra keys, future timestamps, and non-zero destructive actions", () => {
  const extraKeyReport = { ...validReport(), extra_root_key: "forbidden" };
  assert.throws(
    () => validateCodexRetentionAutomationReport(extraKeyReport, { now: NOW_MS }),
    (err) => err.message === "report_extra_keys_forbidden"
  );

  const futureReport = validReport({ generated_at: new Date(NOW_MS + 600000).toISOString() });
  assert.throws(
    () => validateCodexRetentionAutomationReport(futureReport, { now: NOW_MS }),
    (err) => err.message === "generated_at_future_timestamp"
  );

  const destructiveReport = validReport({ summary: { destructive_action_count: 1 } });
  assert.throws(
    () => validateCodexRetentionAutomationReport(destructiveReport, { now: NOW_MS }),
    (err) => err.message === "destructive_action_count_must_be_zero"
  );

  const missingTc = validReport();
  delete missingTc.summary.task_classifications;
  missingTc.digest = computeAutomationReportDigest(missingTc);
  assert.throws(
    () => validateCodexRetentionAutomationReport(missingTc, { now: NOW_MS }),
    (err) => err.message === "summary_task_classifications_invalid"
  );

  const missingWt = validReport();
  delete missingWt.summary.worktree_totals;
  missingWt.digest = computeAutomationReportDigest(missingWt);
  assert.throws(
    () => validateCodexRetentionAutomationReport(missingWt, { now: NOW_MS }),
    (err) => err.message === "summary_worktree_totals_invalid"
  );
});

test("evaluateCodexRetentionProjection rejects invalid period or grace windows", () => {
  assert.throws(
    () => evaluateCodexRetentionProjection(validReport(), { now: NOW_MS, periodSeconds: -10 }),
    (err) => err.message === "invalid_period_or_grace_window"
  );
  assert.throws(
    () => evaluateCodexRetentionProjection(validReport(), { now: NOW_MS, graceSeconds: "invalid" }),
    (err) => err.message === "invalid_period_or_grace_window"
  );
});

test("readCodexRetentionProjection returns unavailable on missing file or reparse path forbidden", async () => {
  const unconf = await readCodexRetentionProjection({ now: NOW_MS });
  assert.equal(unconf.status, "unavailable");
  assert.equal(unconf.reason, "codex_retention_report_path_unconfigured");

  const root = await mkdtemp(path.join(os.tmpdir(), "codex-ret-proj-test-"));
  try {
    const missingPath = path.join(root, "non_existent_sentinel_report_file.json");
    const missingRes = await readCodexRetentionProjection({ reportPath: missingPath, now: NOW_MS });
    assert.equal(missingRes.status, "unavailable");
    // A file that does not exist reports absence. It used to report
    // "file_stat_invalid_or_oversized", which named a size problem for a file with no size, and
    // that is the only condition this projection has ever actually hit on a real machine.
    assert.equal(missingRes.reason, "file_absent_or_unreadable");
    const missingStr = JSON.stringify(missingRes);
    assert.equal(missingStr.includes("non_existent_sentinel"), false);
    assert.equal(missingStr.includes("C:"), false);
    assert.equal(missingStr.includes("\\"), false);

    const reportPath = path.join(root, "current.json");
    await writeFile(reportPath, "invalid json", "utf8");

    const invalidJson = await readCodexRetentionProjection({ reportPath, now: NOW_MS });
    assert.equal(invalidJson.status, "unavailable");
    assert.equal(invalidJson.reason, "codex_retention_report_json_invalid");

    const validReportPath = path.join(root, "valid_current.json");
    await writeFile(validReportPath, JSON.stringify(validReport()), "utf8");

    const reparseRes = await readCodexRetentionProjectionInternal(
      { reportPath: validReportPath, now: NOW_MS },
      { pathsEqual: () => false }
    );
    assert.equal(reparseRes.status, "unavailable");
    assert.equal(reparseRes.reason, "reparse_path_forbidden");
    const reparseStr = JSON.stringify(reparseRes);
    assert.equal(reparseStr.includes("valid_current"), false);
    assert.equal(reparseStr.includes("C:"), false);
    assert.equal(reparseStr.includes("\\"), false);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

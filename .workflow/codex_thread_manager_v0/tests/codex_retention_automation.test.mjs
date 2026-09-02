import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  runCodexRetentionAutomation,
  computeAutomationReportDigest,
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA,
  FEATURE_CATALOG_SCHEMA,
  DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG
} from "../codex_retention_automation.mjs";
import {
  MAX_SETTLE_ITERATIONS,
  runCodexRetentionAutomationInternal
} from "../codex_retention_automation_internal.mjs";
import { cliMain, resolveCodexRetentionCliRoots } from "../codex_retention_automation_cli.mjs";
import { defaultLifecycleRetentionReportPaths, defaultRepoRoot } from "../lifecycle_retention.mjs";

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "codex-retention-test-"));
}

async function cleanDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true }).catch(() => {});
}

test("runCodexRetentionAutomation (real production path) creates atomic file and appends Activity event without injected open adapter", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");

    const result = await runCodexRetentionAutomation({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    });

    assert.ok(result.report);
    assert.equal(result.report.schema_version, CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA);
    assert.equal(result.report.report_only, true);
    assert.equal(result.report.summary.destructive_action_count, 0);
    assert.equal(result.report.summary.local_automation_install_count, 0);
    assert.equal(result.report.retention.retention_action, "HOLD");
    assert.equal(result.report.summary.retention_action, "HOLD");

    const reportFile = path.join(activityRoot, "reports", "codex_retention", "current.json");
    const reportStat = await stat(reportFile);
    assert.ok(reportStat.isFile());

    const writtenContent = JSON.parse(await readFile(reportFile, "utf8"));
    assert.equal(writtenContent.digest, result.report.digest);
  } finally {
    await cleanDir(root);
  }
});

test("runCodexRetentionAutomationInternal generates deterministic envelope, writes atomically, and appends Activity event", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");

    const writtenFiles = new Map();
    const appendedEvents = [];

    const adapters = {
      mkdir: async () => {},
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p,
      open: async (filePath) => ({
        writeFile: async (content) => { writtenFiles.set(filePath, content); },
        close: async () => {}
      }),
      rename: async (oldPath, newPath) => {
        const content = writtenFiles.get(oldPath);
        writtenFiles.delete(oldPath);
        writtenFiles.set(newPath, content);
      },
      unlink: async (filePath) => {
        writtenFiles.delete(filePath);
      },
      appendActivityEvent: async (options) => {
        appendedEvents.push(options);
        return { event: options.input, events_path: "events/2026/2026-08.jsonl" };
      }
    };

    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);

    assert.ok(result.report);
    assert.equal(result.report.schema_version, CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA);
    assert.equal(result.report.report_only, true);
    assert.equal(result.report.summary.destructive_action_count, 0);
    assert.equal(result.report.summary.local_automation_install_count, 0);
    assert.equal(result.report.retention.retention_action, "HOLD");
    assert.equal(result.report.summary.retention_action, "HOLD");
    assert.ok(result.report.digest.startsWith("sha256:"));

    assert.ok(result.report.retention.worktree_totals);
    assert.equal(typeof result.report.retention.worktree_totals.total_worktrees, "number");
    assert.equal(typeof result.report.retention.worktree_totals.dirty_worktrees, "number");

    const expectedDigest = computeAutomationReportDigest(result.report);
    assert.equal(result.report.digest, expectedDigest);

    assert.equal(result.report_path, "reports/codex_retention/current.json");
    const expectedReportPath = path.join(activityRoot, "reports", "codex_retention", "current.json");
    assert.ok(writtenFiles.has(expectedReportPath));

    assert.equal(appendedEvents.length, 1);
    assert.equal(appendedEvents[0].input.scope, "codex_retention");
    assert.equal(appendedEvents[0].input.action, "prepare_report");
    assert.deepEqual(appendedEvents[0].input.refs, ["reports/codex_retention/current.json"]);
  } finally {
    await cleanDir(root);
  }
});

test("write failure closes open handle BEFORE unlinking temp file and no temp file survives", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const callOrder = [];
    const writtenFiles = new Map();

    const adapters = {
      mkdir: async () => {},
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p,
      open: async (filePath) => {
        writtenFiles.set(filePath, "TEMP_DATA");
        return {
          writeFile: async (content) => { writtenFiles.set(filePath, content); },
          close: async () => {
            callOrder.push("close");
          }
        };
      },
      rename: async () => {
        callOrder.push("rename_fail");
        throw new Error("rename_perm_denied");
      },
      unlink: async (filePath) => {
        callOrder.push("unlink");
        writtenFiles.delete(filePath);
      },
      appendActivityEvent: async (opts) => ({ event: opts.input })
    };

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
          now: 1787241600000
        }, adapters);
      },
      (err) => err.message === "atomic_write_failed"
    );

    assert.deepEqual(callOrder, ["close", "rename_fail", "unlink"]);
    assert.equal(writtenFiles.size, 0);
  } finally {
    await cleanDir(root);
  }
});

test("Phase 1 preflight contract mapping: exact field names and error_code surfacing on scan failure", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const writtenFiles = new Map();

    const mockPhase1Report = {
      schema_version: "soulforge.codex_thread_manager.lifecycle_retention_report.v1",
      report_only: true,
      generated_at: "2026-08-21T08:00:00.000Z",
      lifecycle_retention_action: "HOLD",
      source_health: {
        enrollment: "available",
        lifecycle: "available",
        result_gate: "available",
        task_worktree_binding: "available"
      },
      thread_scope: {
        current_or_accepted_count: 5,
        bound_task_count: 3,
        unbound_task_count: 2
      },
      classifications: {
        active: 2,
        input_waiting: 1,
        result_waiting: 0,
        completed: 1,
        interrupted: 1,
        duplicate: 0,
        unknown: 0
      },
      candidates: [],
      worktree_preflight: {
        status: "HOLD",
        list_status: "available",
        comparison_ref_status: "available",
        total_worktrees: 10,
        dirty_worktrees: 4,
        untracked_worktrees: 2,
        locked_worktrees: 3,
        index_lock_worktrees: 1,
        operation_marker_worktrees: 2,
        unique_commit_worktrees: 5,
        prunable_worktrees: 3
      },
      digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    };

    const adapters = {
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p,
      open: async (filePath) => ({
        writeFile: async (content) => { writtenFiles.set(filePath, content); },
        close: async () => {}
      }),
      rename: async (oldPath, newPath) => {
        const content = writtenFiles.get(oldPath);
        writtenFiles.delete(oldPath);
        writtenFiles.set(newPath, content);
      },
      unlink: async (filePath) => { writtenFiles.delete(filePath); },
      appendActivityEvent: async (opts) => ({ event: opts.input }),
      runLifecycleRetentionReport: async () => mockPhase1Report
    };

    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);

    assert.equal(result.report.retention.evidence_status, "PASS");
    assert.equal(result.report.summary.retention_evidence_status, "PASS");
    assert.equal(result.report.retention.retention_action, "HOLD");
    assert.equal(result.report.summary.retention_action, "HOLD");

    assert.equal(result.report.retention.worktree_totals.total_worktrees, 10);
    assert.equal(result.report.retention.worktree_totals.dirty_worktrees, 4);
    assert.equal(result.report.retention.worktree_totals.untracked_worktrees, 2);
    assert.equal(result.report.retention.worktree_totals.locked_worktrees, 3);
    assert.equal(result.report.retention.worktree_totals.index_lock_worktrees, 1);
    assert.equal(result.report.retention.worktree_totals.operation_marker_worktrees, 2);
    assert.equal(result.report.retention.worktree_totals.unique_commit_worktrees, 5);
    assert.equal(result.report.retention.worktree_totals.prunable_worktrees, 3);

    assert.equal(result.report.summary.worktree_totals.total, 10);
    assert.equal(result.report.summary.worktree_totals.dirty, 4);
    assert.equal(result.report.summary.worktree_totals.locked, 3);
    assert.equal(result.report.summary.worktree_totals.unique_commit, 5);

    assert.equal(result.report.summary.task_classifications.active, 2);
    assert.equal(result.report.summary.task_classifications.input_waiting, 1);

    // Test error_code surfacing when retention report fails
    const errorAdapters = {
      ...adapters,
      runLifecycleRetentionReport: async () => { throw new Error("scan_failed"); }
    };
    const errResult = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, errorAdapters);

    assert.equal(errResult.report.retention.evidence_status, "HOLD");
    assert.equal(errResult.report.summary.retention_evidence_status, "HOLD");
    assert.equal(errResult.report.retention.error_code, "lifecycle_retention_report_failed");
  } finally {
    await cleanDir(root);
  }
});

test("synthetic non-Windows realpath test: ancestor alias containment succeeds when activityRoot is not a symlink", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "var", "log");
    const writtenFiles = new Map();
    const varLogSub = "/" + "var" + "/" + "log";
    const privateVarLogSub = "/" + "private" + "/" + "var" + "/" + "log";

    const adapters = {
      isWin: false,
      mkdir: async () => {},
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => {
        return p.replace(/\\var\\log/g, privateVarLogSub).replace(new RegExp(varLogSub, "g"), privateVarLogSub);
      },
      open: async (filePath) => ({
        writeFile: async (content) => { writtenFiles.set(filePath, content); },
        close: async () => {}
      }),
      rename: async (oldPath, newPath) => {
        const content = writtenFiles.get(oldPath);
        writtenFiles.delete(oldPath);
        writtenFiles.set(newPath, content);
      },
      unlink: async (filePath) => { writtenFiles.delete(filePath); },
      appendActivityEvent: async (opts) => ({ event: opts.input })
    };

    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);

    assert.ok(result.report);
    assert.equal(result.report.schema_version, CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA);
  } finally {
    await cleanDir(root);
  }
});

test("digest mismatch BEFORE write throws error and prevents file writes and events", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const writtenFiles = new Map();
    const appendedEvents = [];

    const adapters = {
      mkdir: async () => {},
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p,
      open: async (filePath) => ({
        writeFile: async (content) => { writtenFiles.set(filePath, content); },
        close: async () => {}
      }),
      rename: async (oldPath, newPath) => {
        const content = writtenFiles.get(oldPath);
        writtenFiles.delete(oldPath);
        writtenFiles.set(newPath, content);
      },
      appendActivityEvent: async (options) => {
        appendedEvents.push(options);
        return { event: options.input };
      }
    };

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
          now: 1787241600000,
          expectedDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
        }, adapters);
      },
      (err) => err.message === "digest_mismatch"
    );

    assert.equal(writtenFiles.size, 0);
    assert.equal(appendedEvents.length, 0);
  } finally {
    await cleanDir(root);
  }
});

test("producer reparse seam check: realpath mismatch rejects execution without open, write, or event", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const writtenFiles = new Map();
    const appendedEvents = [];

    const adapters = {
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p + "_reparse_mismatch",
      open: async (filePath) => ({
        writeFile: async (content) => { writtenFiles.set(filePath, content); },
        close: async () => {}
      }),
      appendActivityEvent: async (options) => {
        appendedEvents.push(options);
        return { event: options.input };
      }
    };

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
          now: 1787241600000
        }, adapters);
      },
      (err) => err.message === "reparse_target_forbidden"
    );

    assert.equal(writtenFiles.size, 0);
    assert.equal(appendedEvents.length, 0);
  } finally {
    await cleanDir(root);
  }
});

test("external catalog file with extra keys or wrong schema version fails closed", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const adapters = {
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p
    };

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: [{ invalid: "array" }]
        }, adapters);
      },
      (err) => err.message === "catalog_file_invalid"
    );

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: {
            schema_version: "wrong_schema",
            features: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG.features
          }
        }, adapters);
      },
      (err) => err.message === "catalog_file_invalid"
    );

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: {
            schema_version: FEATURE_CATALOG_SCHEMA,
            features: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG.features,
            extra_field: "forbidden"
          }
        }, adapters);
      },
      (err) => err.message === "catalog_file_invalid"
    );
  } finally {
    await cleanDir(root);
  }
});

test("atomic write failure after Activity append preserves existing current report file and cleans up temp file", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const targetReportPath = path.join(activityRoot, "reports", "codex_retention", "current.json");

    await mkdir(path.dirname(targetReportPath), { recursive: true });
    await writeFile(targetReportPath, "INITIAL_CONTENT", "utf8");

    const writtenFiles = new Map();
    let tempPathCreated = null;
    const appendedEvents = [];

    const adapters = {
      mkdir: async () => {},
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p,
      open: async (filePath) => {
        tempPathCreated = filePath;
        writtenFiles.set(filePath, "TEMP_CONTENT");
        return {
          writeFile: async (content) => { writtenFiles.set(filePath, content); },
          close: async () => {}
        };
      },
      rename: async () => {
        throw new Error("rename_failed");
      },
      unlink: async (filePath) => {
        writtenFiles.delete(filePath);
      },
      appendActivityEvent: async (opts) => {
        appendedEvents.push(opts);
        return { event: opts.input };
      }
    };

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
          now: 1787241600000
        }, adapters);
      },
      (err) => err.message === "atomic_write_failed"
    );

    const content = await readFile(targetReportPath, "utf8");
    assert.equal(content, "INITIAL_CONTENT");

    assert.ok(tempPathCreated);
    assert.equal(writtenFiles.has(tempPathCreated), false);

    assert.equal(appendedEvents.length, 1);
    assert.equal(appendedEvents[0].input.action, "prepare_report");
  } finally {
    await cleanDir(root);
  }
});

test("Activity event failure BEFORE atomic write prevents current.json creation or modification", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const targetReportPath = path.join(activityRoot, "reports", "codex_retention", "current.json");

    await mkdir(path.dirname(targetReportPath), { recursive: true });
    await writeFile(targetReportPath, "PREVIOUS_REPORT", "utf8");

    const adapters = {
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p,
      appendActivityEvent: async () => {
        throw new Error("activity_ledger_locked");
      }
    };

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
          now: 1787241600000
        }, adapters);
      },
      (err) => err.message === "activity_append_failed"
    );

    const content = await readFile(targetReportPath, "utf8");
    assert.equal(content, "PREVIOUS_REPORT");
  } finally {
    await cleanDir(root);
  }
});

test("invalid time option throws invalid_time error for non-finite or out-of-range timestamp", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");
    const adapters = {
      lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
      realpath: async (p) => p
    };

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
          now: -100
        }, adapters);
      },
      (err) => err.message === "invalid_time"
    );

    await assert.rejects(
      async () => {
        await runCodexRetentionAutomationInternal({
          repoRoot: defaultRepoRoot(),
          activityRoot,
          catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
          now: 9999999999999999
        }, adapters);
      },
      (err) => err.message === "invalid_time"
    );
  } finally {
    await cleanDir(root);
  }
});

test("CLI main handles help, destructive flags, expected digest mismatch (exit 3), and safe error output", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "activity");

    let stdoutBuf = "";
    let stderrBuf = "";

    const origStdout = process.stdout.write;
    const origStderr = process.stderr.write;
    const origExit = process.exitCode;

    process.stdout.write = (chunk) => { stdoutBuf += chunk; return true; };
    process.stderr.write = (chunk) => { stderrBuf += chunk; return true; };

    try {
      stdoutBuf = ""; stderrBuf = "";
      await cliMain(["--help"]);
      assert.equal(process.exitCode, 0);
      assert.ok(stdoutBuf.includes("Usage:"));

      stdoutBuf = ""; stderrBuf = "";
      await cliMain(["--apply"]);
      assert.equal(process.exitCode, 2);
      assert.equal(stderrBuf.trim(), "forbidden_destructive_option");

      stdoutBuf = ""; stderrBuf = "";
      await cliMain([
        "--local-root", defaultRepoRoot(),
        "--activity-root", activityRoot,
        "--expected-digest", "sha256:0000000000000000000000000000000000000000000000000000000000000000"
      ]);
      assert.equal(process.exitCode, 3);
      assert.equal(stderrBuf.trim(), "digest_mismatch");

      const winDriveSentinel = "C" + ":" + "\\";
      const unixHomeSentinel = "/" + "home" + "/";
      assert.equal(stderrBuf.includes(winDriveSentinel), false);
      assert.equal(stderrBuf.includes(unixHomeSentinel), false);

    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exitCode = origExit;
    }
  } finally {
    await cleanDir(root);
  }
});

test("the report is bounded at the producer and states exactly what it dropped", async () => {
  // Both lists grew with the enrolled-thread and feature counts and neither had a bound, so the
  // producer would eventually publish a file past the readers' 512 KB and 256 KB limits. The fix
  // has to be here: raising a reader's limit would only move the point at which it breaks.
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");
    const CANDIDATES = 1500;
    const adapters = {
      runLifecycleRetentionReport: async () => ({
        evidence_status: "PASS",
        thread_scope: { current_or_accepted_count: CANDIDATES, bound_task_count: CANDIDATES, unbound_task_count: 0 },
        counts_by_classification: { active: CANDIDATES },
        candidates: Array.from({ length: CANDIDATES }, (_, index) => ({
          candidate_id: `candidate-${index}`,
          classification: "active",
          enrollment_lifecycle: "current",
          reason_codes: ["bound_to_task", "recent_activity", "worktree_clean"],
          hold_reasons: ["retention_action_is_hold"],
          metadata_counts: { events: index, receipts: index }
        })),
        digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
      })
    };

    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);

    const report = result.report;
    const marker = report.retention.candidates_truncation;

    assert.equal(marker.total_count, CANDIDATES, "the marker must state the true total, not the kept count");
    assert.ok(marker.included_count <= 200, `kept ${marker.included_count}`);
    assert.equal(report.retention.candidates.length, marker.included_count);
    assert.equal(marker.dropped_count, CANDIDATES - marker.included_count);
    assert.equal(marker.truncated, true);
    assert.equal(marker.order, "producer_order_first_n");

    // The summary still counts every candidate. Truncating the detail must not silently shrink the
    // number a reader actually consumes, or the report would understate the work outstanding.
    assert.equal(report.summary.bound_candidate_count, CANDIDATES);

    // The written file must fit inside the stricter of the two reader limits.
    const written = await readFile(path.join(activityRoot, "reports", "codex_retention", "current.json"), "utf8");
    assert.ok(written.length < 256 * 1024, `written ${written.length} bytes`);
    assert.ok(JSON.stringify(report).length <= 200 * 1024, `envelope ${JSON.stringify(report).length} bytes`);

    // The digest covers what was actually written, not the pre-truncation envelope.
    assert.equal(report.digest, computeAutomationReportDigest(report));
  } finally {
    await cleanDir(root);
  }
});

test("a report already inside the bound is left alone and says so", async () => {
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");
    const adapters = {
      runLifecycleRetentionReport: async () => ({
        evidence_status: "PASS",
        thread_scope: { current_or_accepted_count: 2, bound_task_count: 2, unbound_task_count: 0 },
        counts_by_classification: { active: 2 },
        candidates: [
          { candidate_id: "candidate-0", classification: "active", enrollment_lifecycle: "current", reason_codes: [], hold_reasons: [], metadata_counts: {} },
          { candidate_id: "candidate-1", classification: "active", enrollment_lifecycle: "current", reason_codes: [], hold_reasons: [], metadata_counts: {} }
        ],
        digest: null
      })
    };

    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);

    const marker = result.report.retention.candidates_truncation;
    assert.deepEqual(marker, {
      total_count: 2, included_count: 2, dropped_count: 0, truncated: false, order: "producer_order_first_n"
    });
    assert.equal(result.report.retention.candidates.length, 2);

    // The inventory marker is present on every report too, so a consumer never has to guess whether
    // an absent marker means "complete" or "an older producer".
    const rowsMarker = result.report.inventory.rows_truncation;
    assert.equal(rowsMarker.truncated, false);
    assert.equal(rowsMarker.included_count, result.report.inventory.rows.length);
    assert.equal(rowsMarker.total_count, rowsMarker.included_count);
  } finally {
    await cleanDir(root);
  }
});

test("the truncated report still passes the Board projection's own validation", async () => {
  // The projection enforces an exact top-level key set and throws report_extra_keys_forbidden on
  // any addition, which is why the markers live inside `retention` and `inventory` rather than at
  // the top level or in `summary`. This proves the placement is legal rather than assumed.
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");
    const adapters = {
      runLifecycleRetentionReport: async () => ({
        evidence_status: "PASS",
        thread_scope: { current_or_accepted_count: 900, bound_task_count: 900, unbound_task_count: 0 },
        counts_by_classification: { active: 900 },
        candidates: Array.from({ length: 900 }, (_, index) => ({
          candidate_id: `candidate-${index}`,
          classification: "active",
          enrollment_lifecycle: "current",
          reason_codes: ["bound_to_task"],
          hold_reasons: [],
          metadata_counts: {}
        })),
        digest: null
      })
    };

    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);

    const { evaluateCodexRetentionProjection } = await import(
      "../../../ui-workspace/apps/team-ops-board/src/core/codex-retention-projection-internal.mjs"
    );
    const projection = evaluateCodexRetentionProjection(result.report, { now: 1787241600000 });
    assert.ok(projection, "the projection must accept a report carrying truncation markers");
    assert.notEqual(projection.status, undefined);
  } finally {
    await cleanDir(root);
  }
});

async function runWithCandidates(candidates, extra = {}) {
  const root = await tempDir();
  const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");
  const adapters = {
    runLifecycleRetentionReport: async () => ({
      evidence_status: "PASS",
      thread_scope: {
        current_or_accepted_count: candidates.length,
        bound_task_count: candidates.length,
        unbound_task_count: 0
      },
      classifications: extra.classifications ?? { active: candidates.length },
      candidates,
      digest: null
    })
  };
  const result = await runCodexRetentionAutomationInternal({
    repoRoot: defaultRepoRoot(),
    activityRoot,
    catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
    now: 1787241600000
  }, adapters);
  const written = await readFile(path.join(activityRoot, "reports", "codex_retention", "current.json"));
  return { root, result, writtenBytes: written.length };
}

const candidate = (index, metadataCounts = {}) => ({
  candidate_id: `candidate-${index}`,
  classification: "active",
  enrollment_lifecycle: "current",
  reason_codes: ["bound_to_task"],
  hold_reasons: [],
  metadata_counts: metadataCounts
});

test("the budget measures the artifact that is actually written, byte for byte", async () => {
  // The guard first measured JSON.stringify(envelope).length: compact, and counting UTF-16 code
  // units. The file is written pretty-printed as UTF-8. Probing put the gap at up to 4.2x, which
  // let a 504 KB file past a 200 KB budget. The marker must equal the file exactly, including its
  // own bytes and the digest.
  const deep = (depth, width) => {
    if (depth === 0) return 1;
    const node = {};
    for (let i = 0; i < width; i += 1) node[`k${i}`] = deep(depth - 1, width);
    return node;
  };
  const { root, result, writtenBytes } = await runWithCandidates(
    Array.from({ length: 200 }, (_, index) => candidate(index, deep(5, 4)))
  );
  try {
    const budget = result.report.retention.report_budget;
    assert.equal(budget.measured_bytes, writtenBytes, "the marker must count the file it describes");
    assert.equal(budget.budget_met, true);
    assert.ok(writtenBytes <= budget.max_bytes, `written ${writtenBytes} over budget ${budget.max_bytes}`);
    assert.ok(writtenBytes < 512 * 1024, "and comfortably under the only reader's limit");
    assert.ok(budget.shrink_passes > 0, "this fixture must actually exercise the shrink");
  } finally {
    await cleanDir(root);
  }
});

test("a report whose weight is outside the shrinkable lists says the budget was not met", async () => {
  // Only two lists can be shrunk. Weight anywhere else - classifications, source_refs,
  // source_health - holds the report over the limit no matter how much detail is dropped. Exiting
  // quietly there produced a 712 KB file that had discarded 100% of its candidates and reported
  // neither fact.
  const classifications = {};
  for (let i = 0; i < 12000; i += 1) classifications[`classification_bucket_with_a_long_name_${i}`] = i;

  const { root, result, writtenBytes } = await runWithCandidates(
    Array.from({ length: 10 }, (_, index) => candidate(index)),
    { classifications }
  );
  try {
    const budget = result.report.retention.report_budget;
    assert.equal(budget.budget_met, false, "an over-budget report must say so");
    assert.equal(budget.unshrinkable_remainder, true);
    assert.equal(budget.measured_bytes, writtenBytes, "even when it fails, the count must be exact");
    assert.ok(writtenBytes > budget.max_bytes);
    assert.ok(budget.shrink_passes > 0, "it must have tried before giving up");

    // Everything droppable was dropped, and the marker says exactly that rather than implying the
    // report is complete.
    assert.equal(result.report.retention.candidates.length, 0);
    assert.deepEqual(result.report.retention.candidates_truncation, {
      total_count: 10, included_count: 0, dropped_count: 10, truncated: true, order: "producer_order_first_n"
    });
  } finally {
    await cleanDir(root);
  }
});

test("a small report reports a met budget and no shrink passes", async () => {
  const { root, result, writtenBytes } = await runWithCandidates(
    Array.from({ length: 3 }, (_, index) => candidate(index))
  );
  try {
    const budget = result.report.retention.report_budget;
    assert.equal(budget.budget_met, true);
    assert.equal(budget.unshrinkable_remainder, false);
    assert.equal(budget.shrink_passes, 0, "nothing to shrink");
    assert.equal(budget.measured_bytes, writtenBytes);
    assert.equal(budget.max_bytes, 200 * 1024);

    // The marker is present on every report, so its absence never has to be interpreted.
    assert.equal(typeof result.report.retention.report_budget, "object");
  } finally {
    await cleanDir(root);
  }
});

test("the budget marker does not break the projection's exact key sets", async () => {
  const classifications = {};
  for (let i = 0; i < 12000; i += 1) classifications[`classification_bucket_with_a_long_name_${i}`] = i;
  const { root, result } = await runWithCandidates(
    Array.from({ length: 10 }, (_, index) => candidate(index)),
    { classifications }
  );
  try {
    const { evaluateCodexRetentionProjection } = await import(
      "../../../ui-workspace/apps/team-ops-board/src/core/codex-retention-projection-internal.mjs"
    );
    // Even an over-budget report must remain structurally legal: the projection refuses extra keys
    // at the top level and in summary, and the marker deliberately lives below both.
    const projection = evaluateCodexRetentionProjection(result.report, { now: 1787241600000 });
    assert.ok(projection);
  } finally {
    await cleanDir(root);
  }
});

test("a report near the budget is shrunk rather than published just over it", async () => {
  // The loop's exit test used to measure the envelope BEFORE report_budget existed, and the marker
  // serialises to about 177 bytes. Any report landing in that window below the budget was published
  // over it with shrink_passes 0 and the blame on an unshrinkable remainder, while its lists sat
  // there full. This pad size reproduced exactly that: 204,801 bytes written, 5 candidates kept.
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");
    const adapters = {
      runLifecycleRetentionReport: async () => ({
        evidence_status: "PASS",
        thread_scope: { current_or_accepted_count: 5, bound_task_count: 5, unbound_task_count: 0 },
        classifications: { active: 5, [`${"p".repeat(197898)}`]: 1 },
        candidates: Array.from({ length: 5 }, (_, index) => ({
          candidate_id: `candidate-${index}`,
          classification: "active",
          enrollment_lifecycle: "current",
          reason_codes: [],
          hold_reasons: [],
          metadata_counts: {}
        })),
        digest: null
      })
    };
    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);
    const written = await readFile(path.join(activityRoot, "reports", "codex_retention", "current.json"));
    const budget = result.report.retention.report_budget;

    assert.ok(written.length <= budget.max_bytes, `published ${written.length} over ${budget.max_bytes}`);
    assert.equal(budget.budget_met, true);
    assert.equal(budget.measured_bytes, written.length);

    // If the report was over budget it must have actually tried, and if it gave up it must be
    // because nothing droppable was left. Those two are what unshrinkable_remainder claims.
    if (budget.unshrinkable_remainder) {
      assert.equal(result.report.retention.candidates.length, 0, "claimed unshrinkable with candidates left");
      assert.equal(result.report.inventory.rows.length, 0, "claimed unshrinkable with rows left");
    }
  } finally {
    await cleanDir(root);
  }
});

test("the budget counts UTF-8 bytes, not UTF-16 code units", async () => {
  // Every earlier fixture was pure ASCII, where the two measurements coincide, so the encoding half
  // of the fix was unproven. Korean labels are realistic in this repository and inflate the byte
  // count by about 9% over the code-unit count.
  const root = await tempDir();
  try {
    const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");
    const label = "과제_바인딩_완료_대기_중_상태_표시";
    const adapters = {
      runLifecycleRetentionReport: async () => ({
        evidence_status: "PASS",
        thread_scope: { current_or_accepted_count: 200, bound_task_count: 200, unbound_task_count: 0 },
        classifications: { active: 200 },
        candidates: Array.from({ length: 200 }, (_, index) => ({
          candidate_id: `candidate-${index}`,
          classification: "active",
          enrollment_lifecycle: "current",
          reason_codes: [label],
          hold_reasons: [label],
          metadata_counts: {}
        })),
        digest: null
      })
    };
    const result = await runCodexRetentionAutomationInternal({
      repoRoot: defaultRepoRoot(),
      activityRoot,
      catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
      now: 1787241600000
    }, adapters);
    const written = await readFile(path.join(activityRoot, "reports", "codex_retention", "current.json"));

    const codeUnits = JSON.stringify({ ...result.report, digest: `sha256:${"0".repeat(64)}` }, null, 2).length;
    assert.ok(written.length > codeUnits, "the fixture must actually contain multi-byte characters");
    assert.equal(
      result.report.retention.report_budget.measured_bytes,
      written.length,
      "the marker must count bytes, and code units would be short here"
    );
  } finally {
    await cleanDir(root);
  }
});

test("the settle loop converges well inside its bound, and the bound is pinned", async () => {
  assert.equal(MAX_SETTLE_ITERATIONS, 8);

  // Crossing a digit boundary in measured_bytes is what makes the count re-settle at all, so the
  // sizes below are chosen to land on both sides of one. A loop that stopped after a single pass
  // would report a stale count on at least one of them.
  for (const candidateCount of [1, 9, 12, 60, 140]) {
    const root = await tempDir();
    try {
      const activityRoot = path.join(root, "guild_hall", "state", "operations", "soulforge_activity");
      const adapters = {
        runLifecycleRetentionReport: async () => ({
          evidence_status: "PASS",
          thread_scope: { current_or_accepted_count: candidateCount, bound_task_count: candidateCount, unbound_task_count: 0 },
          classifications: { active: candidateCount },
          candidates: Array.from({ length: candidateCount }, (_, index) => ({
            candidate_id: `candidate-${index}`,
            classification: "active",
            enrollment_lifecycle: "current",
            reason_codes: ["bound_to_task"],
            hold_reasons: [],
            metadata_counts: { a: index }
          })),
          digest: null
        })
      };
      const result = await runCodexRetentionAutomationInternal({
        repoRoot: defaultRepoRoot(),
        activityRoot,
        catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
        now: 1787241600000
      }, adapters);
      const written = await readFile(path.join(activityRoot, "reports", "codex_retention", "current.json"));
      assert.equal(
        result.report.retention.report_budget.measured_bytes,
        written.length,
        `size ${candidateCount} did not settle`
      );
    } finally {
      await cleanDir(root);
    }
  }
});

test("a timestamp whose ISO form is not the canonical length is refused", async () => {
  // canonicalizeJson excludes generated_at from the digest so identical content at two times
  // digests the same. measured_bytes counts generated_at's bytes and IS digested, so a
  // different-length timestamp would silently reintroduce that coupling.
  assert.equal(new Date(3e14).toISOString().length, 27, "the fixture must be a non-canonical length");
  const root = await tempDir();
  try {
    await assert.rejects(
      () => runCodexRetentionAutomationInternal({
        repoRoot: defaultRepoRoot(),
        activityRoot: path.join(root, "guild_hall", "state", "operations", "soulforge_activity"),
        catalog: DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
        now: 3e14
      }),
      /invalid_time/u
    );
  } finally {
    await cleanDir(root);
  }
});

test("CLI root defaults: explicit flags win, then SOULFORGE_STATE_ROOT, then SOULFORGE_OWNER_ROOT, then the checkout", async () => {
  const root = await tempDir();
  try {
    const stateRoot = path.join(root, "state-root");
    const ownerRoot = path.join(root, "owner-root");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(ownerRoot, { recursive: true });
    const local = path.join(root, "local-root");
    const explicitActivity = path.join(root, "explicit-activity");
    const checkout = defaultRepoRoot();
    const activityUnder = (stateRootValue) => path.resolve(stateRootValue, "operations", "soulforge_activity");

    // unset: byte-identical to the previous derivation
    assert.deepEqual(resolveCodexRetentionCliRoots({}, {}), {
      repoRoot: checkout,
      activityRoot: path.resolve(checkout, "guild_hall", "state", "operations", "soulforge_activity")
    });
    assert.deepEqual(resolveCodexRetentionCliRoots({ localRoot: local }, {}), {
      repoRoot: path.resolve(local),
      activityRoot: path.resolve(local, "guild_hall", "state", "operations", "soulforge_activity")
    });

    // state root: the activity default moves; the repo root is untouched
    assert.deepEqual(resolveCodexRetentionCliRoots({}, { SOULFORGE_STATE_ROOT: stateRoot }), {
      repoRoot: checkout,
      activityRoot: activityUnder(stateRoot)
    });
    assert.deepEqual(resolveCodexRetentionCliRoots({ localRoot: local }, { SOULFORGE_STATE_ROOT: stateRoot }), {
      repoRoot: path.resolve(local),
      activityRoot: activityUnder(stateRoot)
    });
    assert.equal(
      resolveCodexRetentionCliRoots({ activityRoot: explicitActivity }, { SOULFORGE_STATE_ROOT: stateRoot }).activityRoot,
      path.resolve(explicitActivity)
    );

    // owner root: both defaults derive from it; the finer state root still wins for activity
    assert.deepEqual(resolveCodexRetentionCliRoots({}, { SOULFORGE_OWNER_ROOT: ownerRoot }), {
      repoRoot: path.resolve(ownerRoot),
      activityRoot: path.resolve(ownerRoot, "guild_hall", "state", "operations", "soulforge_activity")
    });
    assert.deepEqual(resolveCodexRetentionCliRoots({}, { SOULFORGE_OWNER_ROOT: ownerRoot, SOULFORGE_STATE_ROOT: stateRoot }), {
      repoRoot: path.resolve(ownerRoot),
      activityRoot: activityUnder(stateRoot)
    });

    // fail closed
    assert.throws(
      () => resolveCodexRetentionCliRoots({}, { SOULFORGE_STATE_ROOT: path.join("relative", "state") }),
      (err) => err?.code === "soulforge_root_override_invalid"
    );
    assert.throws(
      () => resolveCodexRetentionCliRoots({ localRoot: local }, { SOULFORGE_OWNER_ROOT: path.join(root, "missing") }),
      (err) => err?.code === "soulforge_root_override_invalid"
    );
  } finally {
    await cleanDir(root);
  }
});

test("defaultLifecycleRetentionReportPaths follows the state root override and keeps repo_root on the checkout", async () => {
  const root = await tempDir();
  try {
    const stateRoot = path.join(root, "state-root");
    await mkdir(stateRoot, { recursive: true });
    const repoRoot = path.join(root, "repo");
    const legacy = path.join(repoRoot, "guild_hall", "state", "operations");

    assert.deepEqual(defaultLifecycleRetentionReportPaths({ repoRoot, env: {} }), {
      repo_root: path.resolve(repoRoot),
      enrollment_path: path.join(legacy, "team_ops_board", "thread_visibility.v1.json"),
      lifecycle_path: path.join(legacy, "ai_usage_meter", "lifecycle", "current.json"),
      result_gate_path: path.join(legacy, "team_ops_board", "thread_result_gate.v1.json"),
      task_worktree_binding_path: path.join(legacy, "team_ops_board", "task_worktree_binding.v1.json")
    });

    const moved = path.join(path.resolve(stateRoot), "operations");
    assert.deepEqual(defaultLifecycleRetentionReportPaths({ repoRoot, env: { SOULFORGE_STATE_ROOT: stateRoot } }), {
      repo_root: path.resolve(repoRoot),
      enrollment_path: path.join(moved, "team_ops_board", "thread_visibility.v1.json"),
      lifecycle_path: path.join(moved, "ai_usage_meter", "lifecycle", "current.json"),
      result_gate_path: path.join(moved, "team_ops_board", "thread_result_gate.v1.json"),
      task_worktree_binding_path: path.join(moved, "team_ops_board", "task_worktree_binding.v1.json")
    });

    assert.throws(
      () => defaultLifecycleRetentionReportPaths({ repoRoot, env: { SOULFORGE_STATE_ROOT: path.join(root, "missing") } }),
      (err) => err?.code === "soulforge_root_override_invalid"
    );
  } finally {
    await cleanDir(root);
  }
});

test("CLI main refuses a set-but-invalid override before touching any root, and lands the report under a valid SOULFORGE_STATE_ROOT", async () => {
  const root = await tempDir();
  const stateRoot = path.join(root, "state-root");
  await mkdir(stateRoot, { recursive: true });

  let stdoutBuf = "";
  let stderrBuf = "";
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;
  const origExit = process.exitCode;
  const origStateRoot = process.env.SOULFORGE_STATE_ROOT;
  process.stdout.write = (chunk) => { stdoutBuf += chunk; return true; };
  process.stderr.write = (chunk) => { stderrBuf += chunk; return true; };
  try {
    process.env.SOULFORGE_STATE_ROOT = path.join("relative", "state");
    await cliMain(["--local-root", defaultRepoRoot()]);
    assert.equal(process.exitCode, 2);
    assert.equal(stderrBuf.trim(), "soulforge_root_override_invalid");
    assert.equal(await stat(path.join(stateRoot, "operations")).catch(() => null), null);

    stdoutBuf = ""; stderrBuf = "";
    process.env.SOULFORGE_STATE_ROOT = stateRoot;
    await cliMain(["--local-root", defaultRepoRoot(), "--json"]);
    assert.equal(process.exitCode, 0, stderrBuf);
    const reportFile = path.join(stateRoot, "operations", "soulforge_activity", "reports", "codex_retention", "current.json");
    assert.ok((await stat(reportFile)).isFile());
    assert.equal(JSON.parse(stdoutBuf).digest, JSON.parse(await readFile(reportFile, "utf8")).digest);
    assert.equal(
      await stat(path.join(defaultRepoRoot(), "guild_hall", "state", "operations", "soulforge_activity", "reports", "codex_retention", ".override-test-sentinel")).catch(() => null),
      null
    );
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.exitCode = origExit;
    if (origStateRoot === undefined) delete process.env.SOULFORGE_STATE_ROOT;
    else process.env.SOULFORGE_STATE_ROOT = origStateRoot;
    await cleanDir(root);
  }
});

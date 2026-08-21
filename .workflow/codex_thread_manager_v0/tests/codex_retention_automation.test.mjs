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
  runCodexRetentionAutomationInternal
} from "../codex_retention_automation_internal.mjs";
import { cliMain } from "../codex_retention_automation_cli.mjs";
import { defaultRepoRoot } from "../lifecycle_retention.mjs";

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

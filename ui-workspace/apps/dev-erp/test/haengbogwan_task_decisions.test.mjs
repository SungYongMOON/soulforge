import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  activeSnoozeDecisionMap,
  HAENGBOGWAN_TASK_DECISION_RELATIVE_PATH,
} from "../tools/haengbogwan_task_decisions.mjs";

const TOOL = resolve(import.meta.dirname, "..", "tools", "haengbogwan_task_decisions.mjs");

function makeTempWorkmeta() {
  const root = mkdtempSync(join(tmpdir(), "sf-haengbogwan-decisions-"));
  return {
    root,
    cleanup: () => {
      if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    },
  };
}

function runTool(workmetaRoot, project, taskKey, extraArgs = []) {
  return spawnSync(process.execPath, [
    TOOL,
    "--workmeta-root",
    workmetaRoot,
    "--project",
    project,
    "--task",
    taskKey,
    "--decision",
    "snooze",
    "--until",
    "2026-06-30",
    "--today",
    "2026-06-27",
    "--json",
    ...extraArgs,
  ], { encoding: "utf8" });
}

test("HAENGBOGWAN-TASK-DECISIONS: dry-run does not write, apply writes one metadata-only snooze receipt", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    const taskKey = "T-overdue";
    const receiptPath = join(tmp.root, project, HAENGBOGWAN_TASK_DECISION_RELATIVE_PATH);

    const dryRun = runTool(tmp.root, project, taskKey, ["--reason", "owner reviewed"]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryReport = JSON.parse(dryRun.stdout);
    assert.equal(dryReport.apply, false);
    assert.equal(dryReport.written, false);
    assert.equal(existsSync(receiptPath), false);

    const apply = runTool(tmp.root, project, taskKey, ["--reason", "owner reviewed", "--apply"]);
    assert.equal(apply.status, 0, apply.stderr);
    const applyReport = JSON.parse(apply.stdout);
    assert.equal(applyReport.apply, true);
    assert.equal(applyReport.written, true);
    assert.equal(applyReport.body_access, "metadata_only");
    const text = readFileSync(receiptPath, "utf8");
    assert.equal(text.includes("taskdecision:T-overdue:snooze:2026-06-30"), true);
    assert.equal(text.includes("metadata_only"), true);

    const duplicate = runTool(tmp.root, project, taskKey, ["--apply"]);
    assert.equal(duplicate.status, 0, duplicate.stderr);
    const duplicateReport = JSON.parse(duplicate.stdout);
    assert.equal(duplicateReport.duplicate, true);
    assert.equal(duplicateReport.written, false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-TASK-DECISIONS: active snooze map ignores expired snoozes", () => {
  const tmp = makeTempWorkmeta();
  try {
    const project = "P26-014";
    assert.equal(runTool(tmp.root, project, "T-active", ["--apply"]).status, 0);
    assert.equal(runTool(tmp.root, project, "T-expired", ["--until", "2026-06-26", "--apply"]).status, 0);

    const active = activeSnoozeDecisionMap({ workmetaRoot: tmp.root, projectId: project, today: "2026-06-27" });
    assert.equal(active.has("T-active"), true);
    assert.equal(active.has("T-expired"), false);
  } finally {
    tmp.cleanup();
  }
});

test("HAENGBOGWAN-TASK-DECISIONS: help smoke", () => {
  const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run is the default/);
});

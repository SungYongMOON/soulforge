import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskPacket, selectTask } from "./claim_task.mjs";
import { DEFAULT_DOCTOR_COMMAND } from "./preflight_repo_sync.mjs";

test("preflight default doctor stays lane-local and public-safe", () => {
  assert.equal(DEFAULT_DOCTOR_COMMAND, "npm run guild-hall:doctor -- --profile public-only --remote");
});

test("normalizeTaskPacket accepts a minimal ready packet", () => {
  const task = normalizeTaskPacket(
    {
      schema_version: "soulforge.dev_worker_request.v0",
      task_id: "sample task",
      status: "ready",
      summary: "Do a bounded thing.",
      allowed_write_paths: ["guild_hall/example/**"],
      acceptance_checks: ["npm run validate:canon"],
    },
    {
      source_kind: "mission",
      source_order: 10,
      packet_path: "packet.yaml",
      packet_ref: ".mission/sample/dev_worker_request.yaml",
    },
  );

  assert.equal(task.eligible, true);
  assert.equal(task.task_id, "sample-task");
  assert.equal(task.project_code, "shared");
  assert.deepEqual(task.acceptance_checks, ["npm run validate:canon"]);
});

test("normalizeTaskPacket rejects packets without checks or write paths", () => {
  const task = normalizeTaskPacket(
    {
      schema_version: "soulforge.dev_worker_request.v0",
      task_id: "missing-checks",
      status: "ready",
      summary: "Missing fields.",
    },
    {
      source_kind: "mission",
      source_order: 10,
      packet_path: "packet.yaml",
      packet_ref: ".mission/sample/dev_worker_request.yaml",
    },
  );

  assert.equal(task.eligible, false);
  assert.match(task.ineligible_reason, /missing_required_fields/u);
});

test("selectTask picks the first eligible mission packet and suggests a branch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-dev-worker-"));
  try {
    await mkdir(path.join(root, ".mission", "blocked"), { recursive: true });
    await mkdir(path.join(root, ".mission", "ready"), { recursive: true });
    await writeFile(
      path.join(root, ".mission", "blocked", "dev_worker_request.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: blocked_task",
        "status: blocked",
        "summary: This should not be selected.",
        "allowed_write_paths:",
        "  - guild_hall/blocked/**",
        "acceptance_checks:",
        "  - npm run validate:canon",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(root, ".mission", "ready", "dev_worker_request.yaml"),
      [
        "schema_version: soulforge.dev_worker_request.v0",
        "task_id: ready_task",
        "status: ready",
        "project_code: soulforge_public",
        "summary: This should be selected.",
        "branch_slug: ready-task-branch",
        "allowed_write_paths:",
        "  - guild_hall/dev_worker/**",
        "acceptance_checks:",
        "  - npm run validate:dev-worker",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await selectTask({
      localRoot: root,
      workmetaRoot: path.join(root, "_workmeta"),
      identity: { node_id: "high perf tool 01" },
    });

    assert.equal(result.scanned_count, 2);
    assert.equal(result.eligible_count, 1);
    assert.equal(result.selected.task_id, "ready_task");
    assert.equal(result.selected.suggested_branch, "codex/high-perf-tool-01-ready-task-branch");
    assert.equal(result.skipped.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

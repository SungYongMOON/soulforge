import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncWorkmetaRepo } from "./sync.mjs";

test("syncWorkmetaRepo blocks roots outside nested _workmeta", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-root-"));
  const result = await syncWorkmetaRepo({
    repoRoot,
    workmetaRoot: path.join(repoRoot, "not-workmeta"),
    runCommand: async () => ({ status: 0, stdout: "", stderr: "" }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "workmeta_root_outside_nested_repo");
});

test("syncWorkmetaRepo blocks dirty and behind workmeta", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-dirty-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  await mkdir(path.join(workmetaRoot, ".git"), { recursive: true });

  const queue = [
    { command: "git", args: ["status", "--porcelain"], status: 0, stdout: " M reports/x.md\n", stderr: "" },
    { command: "git", args: ["branch", "--show-current"], status: 0, stdout: "main\n", stderr: "" },
    { command: "git", args: ["remote"], status: 0, stdout: "origin\n", stderr: "" },
    { command: "git", args: ["fetch", "origin", "main"], status: 0, stdout: "", stderr: "" },
    { command: "git", args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], status: 0, stdout: "0 2\n", stderr: "" },
  ];

  const result = await syncWorkmetaRepo({
    repoRoot,
    workmetaRoot,
    runCommand: async ({ command, args }) => {
      const next = queue.shift();
      assert.equal(command, next.command);
      assert.deepEqual(args, next.args);
      return next;
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "workmeta_dirty_and_behind");
});

test("syncWorkmetaRepo blocks dirty metadata after pull when commit is skipped", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-skip-commit-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  await mkdir(path.join(workmetaRoot, ".git"), { recursive: true });

  const queue = [
    { command: "git", args: ["status", "--porcelain"], status: 0, stdout: "", stderr: "" },
    { command: "git", args: ["branch", "--show-current"], status: 0, stdout: "main\n", stderr: "" },
    { command: "git", args: ["remote"], status: 0, stdout: "origin\n", stderr: "" },
    { command: "git", args: ["fetch", "origin", "main"], status: 0, stdout: "", stderr: "" },
    { command: "git", args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], status: 0, stdout: "0 1\n", stderr: "" },
    { command: "git", args: ["pull", "--ff-only", "origin", "main"], status: 0, stdout: "Updating abc..def\n", stderr: "" },
    { command: "git", args: ["status", "--porcelain"], status: 0, stdout: " M reports/post_pull.md\n", stderr: "" },
    { command: "git", args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], status: 0, stdout: "0 0\n", stderr: "" },
  ];

  const result = await syncWorkmetaRepo({
    repoRoot,
    workmetaRoot,
    skipCommit: true,
    runCommand: async ({ command, args }) => {
      const next = queue.shift();
      assert.equal(command, next.command);
      assert.deepEqual(args, next.args);
      return next;
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "workmeta_dirty_after_pull_skip_commit");
  assert.equal(result.steps.at(-1).id, "workmeta_status_after_pull");
  assert.equal(queue.length, 1);
});

test("syncWorkmetaRepo commits and pushes local metadata when current", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-workmeta-commit-"));
  const workmetaRoot = path.join(repoRoot, "_workmeta");
  await mkdir(path.join(workmetaRoot, ".git"), { recursive: true });

  const queue = [
    { command: "git", args: ["status", "--porcelain"], status: 0, stdout: "?? reports/onboarding/new.md\n", stderr: "" },
    { command: "git", args: ["branch", "--show-current"], status: 0, stdout: "main\n", stderr: "" },
    { command: "git", args: ["remote"], status: 0, stdout: "origin\n", stderr: "" },
    { command: "git", args: ["fetch", "origin", "main"], status: 0, stdout: "", stderr: "" },
    { command: "git", args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], status: 0, stdout: "0 0\n", stderr: "" },
    { command: "git", args: ["status", "--porcelain"], status: 0, stdout: "?? reports/onboarding/new.md\n", stderr: "" },
    { command: "git", args: ["add", "-A"], status: 0, stdout: "", stderr: "" },
    { command: "git", args: ["commit", "-m", "chore: sync workmeta metadata"], status: 0, stdout: "[main abc] chore\n", stderr: "" },
    { command: "git", args: ["rev-parse", "HEAD"], status: 0, stdout: "abc123\n", stderr: "" },
    { command: "git", args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], status: 0, stdout: "1 0\n", stderr: "" },
    { command: "git", args: ["push", "origin", "HEAD:main"], status: 0, stdout: "", stderr: "" },
  ];

  const result = await syncWorkmetaRepo({
    repoRoot,
    workmetaRoot,
    runCommand: async ({ command, args }) => {
      const next = queue.shift();
      assert.equal(command, next.command);
      assert.deepEqual(args, next.args);
      return next;
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.reason, "workmeta_synced");
  assert.equal(result.workmeta.committed, true);
  assert.equal(result.workmeta.pushed, true);
  assert.equal(result.workmeta.commit_oid, "abc123");
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syncPrivateStateRepo } from "./sync.mjs";

test("syncPrivateStateRepo mirrors only allowlisted non-secret state and pushes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-private-state-sync-"));
  const privateStateRoot = path.join(repoRoot, "private-state");
  await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });
  await mkdir(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mailbox", "company", "events", "hiworks", "2026"),
    { recursive: true },
  );
  await writeFile(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mailbox", "company", "events", "hiworks", "2026", "2026-06.jsonl"),
    "{}\n",
    "utf8",
  );
  await writeFile(
    path.join(repoRoot, "guild_hall", "state", "gateway", "mailbox", "company", "events", "hiworks", "2026", "token.env"),
    "SECRET=blocked\n",
    "utf8",
  );

  const commands = [
    { args: ["-c", "core.quotepath=false", "status", "--porcelain"], stdout: "" },
    { args: ["branch", "--show-current"], stdout: "main\n" },
    { args: ["remote"], stdout: "origin\n" },
    { args: ["fetch", "origin", "main"], stdout: "" },
    { args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], stdout: "0\t0\n" },
    {
      args: ["-c", "core.quotepath=false", "status", "--porcelain"],
      stdout: "?? guild_hall/state/gateway/mailbox/company/events/hiworks/2026/2026-06.jsonl\n",
    },
    { args: ["add", "guild_hall/state/gateway/intake_inbox", "guild_hall/state/gateway/log/monster_events", "guild_hall/state/gateway/mailbox/company", "guild_hall/state/gateway/mailbox/personal", "guild_hall/state/gateway/mailbox/outbound", "guild_hall/state/gateway/log/mail_fetch", "guild_hall/state/gateway/log/mail_send", "guild_hall/state/operations/soulforge_activity"], stdout: "" },
    { args: ["commit", "-m", "chore: sync gateway private state"], stdout: "[main abc] chore\n" },
    { args: ["rev-parse", "HEAD"], stdout: "abc123\n" },
    { args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], stdout: "1\t0\n" },
    { args: ["push", "origin", "HEAD:main"], stdout: "" },
  ];

  const result = await syncPrivateStateRepo({
    repoRoot,
    privateStateRoot,
    runCommand: async ({ args }) => {
      const next = commands.shift();
      assert.deepEqual(args, next.args);
      return { status: 0, stdout: next.stdout, stderr: "" };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.reason, "private_state_synced");
  assert.equal(result.private_state.committed, true);
  assert.equal(result.private_state.pushed, true);
  assert.equal(result.mirror.copied_files, 1);
  assert.equal(result.mirror.denied_files.length, 1);
  assert.equal(
    await readFile(
      path.join(privateStateRoot, "guild_hall", "state", "gateway", "mailbox", "company", "events", "hiworks", "2026", "2026-06.jsonl"),
      "utf8",
    ),
    "{}\n",
  );
  assert.equal(commands.length, 0);
});

test("syncPrivateStateRepo blocks dirty private-state paths outside the allowlist", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-private-state-dirty-"));
  const privateStateRoot = path.join(repoRoot, "private-state");
  await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });

  const result = await syncPrivateStateRepo({
    repoRoot,
    privateStateRoot,
    runCommand: async ({ args }) => {
      assert.deepEqual(args, ["-c", "core.quotepath=false", "status", "--porcelain"]);
      return { status: 0, stdout: " M README.md\n", stderr: "" };
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "private_state_dirty_outside_allowlist");
  assert.deepEqual(result.dirty_reviews.before.outside_allowlist, ["README.md"]);
});

test("syncPrivateStateRepo blocks dirty allowlist paths when remote is behind", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-private-state-behind-"));
  const privateStateRoot = path.join(repoRoot, "private-state");
  await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });

  const commands = [
    {
      args: ["-c", "core.quotepath=false", "status", "--porcelain"],
      stdout: " M guild_hall/state/gateway/mailbox/company/events/hiworks/2026/2026-06.jsonl\n",
    },
    { args: ["branch", "--show-current"], stdout: "main\n" },
    { args: ["remote"], stdout: "origin\n" },
    { args: ["fetch", "origin", "main"], stdout: "" },
    { args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], stdout: "0\t1\n" },
  ];

  const result = await syncPrivateStateRepo({
    repoRoot,
    privateStateRoot,
    runCommand: async ({ args }) => {
      const next = commands.shift();
      assert.deepEqual(args, next.args);
      return { status: 0, stdout: next.stdout, stderr: "" };
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "private_state_dirty_and_behind");
  assert.equal(commands.length, 0);
});

test("syncPrivateStateRepo skips oversized files before commit", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-private-state-large-"));
  const privateStateRoot = path.join(repoRoot, "private-state");
  await mkdir(path.join(privateStateRoot, ".git"), { recursive: true });
  await mkdir(path.join(repoRoot, "guild_hall", "state", "gateway", "log", "mail_fetch", "logs"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "guild_hall", "state", "gateway", "log", "mail_fetch", "logs", "runs.jsonl"),
    "too-large",
    "utf8",
  );

  const commands = [
    { args: ["-c", "core.quotepath=false", "status", "--porcelain"], stdout: "" },
    { args: ["branch", "--show-current"], stdout: "main\n" },
    { args: ["remote"], stdout: "origin\n" },
    { args: ["fetch", "origin", "main"], stdout: "" },
    { args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], stdout: "0\t0\n" },
    { args: ["-c", "core.quotepath=false", "status", "--porcelain"], stdout: "" },
    { args: ["rev-list", "--left-right", "--count", "HEAD...origin/main"], stdout: "0\t0\n" },
  ];

  const result = await syncPrivateStateRepo({
    repoRoot,
    privateStateRoot,
    maxFileBytes: 4,
    runCommand: async ({ args }) => {
      const next = commands.shift();
      assert.deepEqual(args, next.args);
      return { status: 0, stdout: next.stdout, stderr: "" };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.reason, "private_state_already_current");
  assert.equal(result.mirror.skipped_large_files.length, 1);
  assert.equal(result.mirror.skipped_large_files[0].path, "guild_hall/state/gateway/log/mail_fetch/logs/runs.jsonl");
  assert.equal(commands.length, 0);
});

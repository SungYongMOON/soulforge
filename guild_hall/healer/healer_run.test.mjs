import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runHealerOnce } from "./healer_run.mjs";

test("runHealerOnce writes a report and activity event", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-healer-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const commands = [];

  try {
    const result = await runHealerOnce({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T04:05:06.000Z"),
      runCommand: async ({ command, args }) => {
        commands.push([command, ...args].join(" "));
        return { status: 0, stdout: `${command} ok\n`, stderr: "" };
      },
    });

    assert.equal(result.result, "completed");
    assert.deepEqual(commands, [
      "git status --short --branch",
      "npm run validate",
      "npm run guild-hall:gateway:fetch:healthcheck -- --json",
    ]);

    const reportRaw = await readFile(result.files.report_path, "utf8");
    assert.equal(reportRaw.includes("Soulforge Healer Run"), true);
    assert.equal(reportRaw.includes("root_validate"), true);

    const eventsRaw = await readFile(result.files.activity_events_path, "utf8");
    const event = JSON.parse(eventsRaw.trim());
    assert.equal(event.scope, "healer");
    assert.equal(event.action, "healer_run");
    assert.equal(event.result, "completed");

    const latest = JSON.parse(await readFile(result.files.latest_context_path, "utf8"));
    assert.equal(latest.recent_entries[0].entry_id, event.entry_id);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runHealerOnce carries forward failed checks", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-healer-fail-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");

  try {
    const result = await runHealerOnce({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T05:05:06.000Z"),
      skipGatewayHealthcheck: true,
      runCommand: async ({ args }) => {
        if (args.includes("validate")) {
          return { status: 1, stdout: "validation failed\n", stderr: "" };
        }
        return { status: 0, stdout: "ok\n", stderr: "" };
      },
    });

    assert.equal(result.result, "failed");
    const latest = JSON.parse(await readFile(result.files.latest_context_path, "utf8"));
    assert.equal(latest.open_threads[0].carry_forward, true);
    assert.equal(latest.open_threads[0].result, "failed");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

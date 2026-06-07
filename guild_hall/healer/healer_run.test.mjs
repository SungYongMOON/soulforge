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
      skipAlwaysOnChecks: true,
      runCommand: async ({ command, args }) => {
        commands.push([command, ...args].join(" "));
        if (args.includes("guild-hall:gateway:fetch:healthcheck")) {
          return { status: 0, stdout: JSON.stringify({ status: "NORMAL", reason: "ok" }), stderr: "" };
        }
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
      skipAlwaysOnChecks: true,
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

test("runHealerOnce fails when gateway healthcheck reports critical JSON", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-healer-gateway-critical-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");

  try {
    const result = await runHealerOnce({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T06:05:06.000Z"),
      skipAlwaysOnChecks: true,
      runCommand: async ({ args }) => {
        if (args.includes("guild-hall:gateway:fetch:healthcheck")) {
          return {
            status: 0,
            stdout: [
              "> guild-hall:gateway:fetch:healthcheck",
              JSON.stringify({ status: "CRITICAL", reason: "stale" }),
            ].join("\n"),
            stderr: "",
          };
        }
        return { status: 0, stdout: "ok\n", stderr: "" };
      },
    });

    assert.equal(result.result, "failed");
    const gatewayCheck = result.checks.find((check) => check.id === "gateway_fetch_healthcheck");
    assert.equal(gatewayCheck.status, "failed");
    assert.equal(gatewayCheck.summary, "gateway healthcheck 상태 CRITICAL: stale");

    const latest = JSON.parse(await readFile(result.files.latest_context_path, "utf8"));
    assert.equal(latest.open_threads[0].result, "failed");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runHealerOnce queues a healer failure notification when enabled", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-healer-notify-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");

  try {
    const result = await runHealerOnce({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T07:05:06.000Z"),
      notifyOnFailure: true,
      skipGatewayHealthcheck: true,
      skipAlwaysOnChecks: true,
      runCommand: async ({ args }) => {
        if (args.includes("validate")) {
          return { status: 1, stdout: "validation failed\n", stderr: "" };
        }
        return { status: 0, stdout: "ok\n", stderr: "" };
      },
    });

    assert.equal(result.result, "failed");
    assert.equal(result.notification?.ok, true);
    assert.equal(result.notification?.status, "queued");

    const queueFile = path.join(
      repoRoot,
      "guild_hall",
      "state",
      "town_crier",
      "queue",
      "pending",
      `${result.notification.request_id}.json`,
    );
    const queued = JSON.parse(await readFile(queueFile, "utf8"));
    assert.equal(queued.owner_scope, "healer");
    assert.equal(queued.event, "healer_failed");
    assert.equal(queued.text.includes("healer 실패"), true);
    assert.equal(queued.text.includes("보고서:"), true);
    assert.equal(queued.text.includes(result.files.report_ref), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runHealerOnce carries warning always-on checks forward without failing the run", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-healer-warning-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");

  try {
    const result = await runHealerOnce({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T08:05:06.000Z"),
      skipValidate: true,
      skipGatewayHealthcheck: true,
      alwaysOnCheckRunner: async (alwaysOnOptions) => {
        assert.equal(alwaysOnOptions.mapPath, path.join(activityRoot, "latest_context.json"));
        assert.equal(alwaysOnOptions.reportLogRoot, path.join(activityRoot, "log"));
        return [
          {
            id: "repo_sync",
            command: "git status --short --branch",
            status: "warn",
            exit_code: 0,
            started_at: "2026-05-08T08:05:06.000Z",
            ended_at: "2026-05-08T08:05:06.000Z",
            duration_ms: 0,
            summary: "1 worktree change(s)",
            output_tail: "soulforge: warn - 1 worktree change(s)",
          },
        ];
      },
      runCommand: async () => ({ status: 0, stdout: "ok\n", stderr: "" }),
    });

    assert.equal(result.result, "completed");
    assert.equal(result.checks.some((check) => check.status === "warn"), true);

    const reportRaw = await readFile(result.files.report_path, "utf8");
    assert.equal(reportRaw.includes("경고 1건"), true);
    assert.equal(reportRaw.includes("carry_forward: true"), true);

    const latest = JSON.parse(await readFile(result.files.latest_context_path, "utf8"));
    assert.equal(latest.open_threads[0].result, "completed");
    assert.equal(latest.open_threads[0].next_action.includes("repo_sync"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runHealerOnce refreshes snapshot before always-on freshness checks", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-healer-snapshot-refresh-"));
  const activityRoot = path.join(repoRoot, "guild_hall", "state", "operations", "soulforge_activity");
  const calls = [];

  try {
    const result = await runHealerOnce({
      repoRoot,
      activityRoot,
      now: new Date("2026-05-08T09:05:06.000Z"),
      skipValidate: true,
      alwaysOnCheckRunner: async () => [
        {
          id: "latest_snapshot_map_freshness",
          command: "npm run guild-hall:snapshot:check-fresh",
          status: "passed",
          exit_code: 0,
          started_at: "2026-05-08T09:05:06.000Z",
          ended_at: "2026-05-08T09:05:06.000Z",
          duration_ms: 0,
          summary: "snapshot command passed and metadata surfaces are fresh",
          output_tail: "PASS snapshot freshness: soulforge.snapshot.v0",
        },
      ],
      runCommand: async ({ command, args }) => {
        calls.push([command, ...args].join(" "));
        if (args.includes("guild-hall:gateway:fetch:healthcheck")) {
          return { status: 0, stdout: JSON.stringify({ status: "NORMAL", reason: "ok" }), stderr: "" };
        }
        return { status: 0, stdout: "ok\n", stderr: "" };
      },
    });

    assert.equal(result.result, "completed");
    assert.deepEqual(calls, [
      "git status --short --branch",
      "npm run guild-hall:gateway:fetch:healthcheck -- --json",
      "npm run guild-hall:snapshot",
    ]);
    assert.equal(result.checks.some((check) => check.id === "snapshot_refresh"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAlwaysOnChecks } from "./always_on_checks.mjs";

const EXPECTED_CHECK_IDS = [
  "latest_snapshot_map_freshness",
  "automation_liveness",
  "stray_development_file_placement",
  "report_freshness",
  "repo_sync",
  "secret_raw_leak_guard",
  "restore_readiness",
];

test("runAlwaysOnChecks returns seven healer-compatible checks with injected commands", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-always-on-ok-"));
  const now = new Date("2026-05-21T12:00:00.000Z");
  const calls = [];

  try {
    await createFreshMetadata(repoRoot, now);
    const checks = await runAlwaysOnChecks({
      repoRoot,
      now,
      runCommand: async ({ command, args, cwd }) => {
        calls.push({ command, args, cwd });
        return commandResultForOkRun(command, args);
      },
    });

    assert.deepEqual(checks.map((check) => check.id), EXPECTED_CHECK_IDS);
    assert.equal(checks.every((check) => ["passed", "warn", "failed", "skipped"].includes(check.status)), true);
    assert.equal(checks.every((check) => typeof check.summary === "string"), true);
    assert.equal(checks.every((check) => typeof check.output_tail === "string"), true);
    assert.equal(checks.every((check) => typeof check.started_at === "string"), true);
    assert.equal(checks.every((check) => typeof check.ended_at === "string"), true);
    assert.equal(checks.every((check) => Number.isInteger(check.duration_ms)), true);
    assert.equal(checks.filter((check) => check.status !== "passed").length, 0);

    assert.equal(calls.some((call) => call.args.includes("guild-hall:snapshot:check-fresh")), true);
    assert.equal(calls.some((call) => call.args.includes("guild-hall:always-on:verify")), true);
    assert.equal(
      calls.filter((call) => call.command === "git" && call.args[0] === "status" && !call.args.includes("--porcelain=v1")).length,
      3,
    );
    assert.equal(
      calls.some((call) => call.command === "git" && call.args.includes("--porcelain=v1")),
      true,
    );

    const automation = checks.find((check) => check.id === "automation_liveness");
    assert.equal(automation.command.includes("<repo_root>"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runAlwaysOnChecks detects secret/raw path candidates without exposing values", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-always-on-secret-"));
  const now = new Date("2026-05-21T12:00:00.000Z");

  try {
    await createFreshMetadata(repoRoot, now);
    const checks = await runAlwaysOnChecks({
      repoRoot,
      now,
      runCommand: async ({ command, args }) => {
        if (command === "git" && args.includes("--porcelain=v1")) {
          return {
            status: 0,
            stdout: [
              " M README.md",
              "?? .env",
              "?? _workspaces/example/raw/source.eml",
              "?? guild_hall/state/gateway/mailbox/company/message.json",
            ].join("\n"),
            stderr: "TOKEN=fixture-value",
          };
        }
        return commandResultForOkRun(command, args);
      },
    });

    const leakGuard = checks.find((check) => check.id === "secret_raw_leak_guard");
    assert.equal(leakGuard.status, "failed");
    assert.match(leakGuard.summary, /candidate/);
    assert.equal(leakGuard.output_tail.includes("fixture-value"), false);
    assert.equal(leakGuard.output_tail.includes("example"), false);
    assert.match(leakGuard.output_tail, /redacted/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runAlwaysOnChecks reports stale report metadata and stray development files", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-always-on-stale-"));
  const now = new Date("2026-05-21T12:00:00.000Z");
  const stale = new Date("2026-05-19T00:00:00.000Z");

  try {
    await createFreshMetadata(repoRoot, now);
    await writeFile(path.join(repoRoot, "scratch.patch"), "diff --git a/example b/example\n", "utf8");
    const latestContext = path.join(repoRoot, "guild_hall/state/operations/soulforge_activity/latest_context.json");
    const report = path.join(
      repoRoot,
      "guild_hall/state/operations/soulforge_activity/log/2026/2026-05-21/120000-healer-run.md",
    );
    await utimes(latestContext, stale, stale);
    await utimes(report, stale, stale);

    const checks = await runAlwaysOnChecks({
      repoRoot,
      now,
      runCommand: async ({ command, args }) => commandResultForOkRun(command, args),
    });

    const stray = checks.find((check) => check.id === "stray_development_file_placement");
    assert.equal(stray.status, "warn");
    assert.match(stray.output_tail, /scratch\.patch/);

    const reportFreshness = checks.find((check) => check.id === "report_freshness");
    assert.equal(reportFreshness.status, "warn");
    assert.match(reportFreshness.summary, /stale/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runAlwaysOnChecks warns when repo status shows upstream delta or local changes", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-always-on-repo-"));
  const now = new Date("2026-05-21T12:00:00.000Z");

  try {
    await createFreshMetadata(repoRoot, now);
    const checks = await runAlwaysOnChecks({
      repoRoot,
      now,
      runCommand: async ({ command, args, cwd }) => {
        if (command === "git" && args[0] === "status") {
          if (path.basename(cwd) === "_workmeta") {
            return { status: 0, stdout: "## main...origin/main [behind 1]\n", stderr: "" };
          }
          if (path.basename(cwd) === "private-state") {
            return { status: 0, stdout: "## main...origin/main\n M latest_context.json\n", stderr: "" };
          }
          return { status: 0, stdout: "## main...origin/main\n", stderr: "" };
        }
        return commandResultForOkRun(command, args);
      },
    });

    const repoSync = checks.find((check) => check.id === "repo_sync");
    assert.equal(repoSync.status, "warn");
    assert.match(repoSync.output_tail, /workmeta: warn/);
    assert.match(repoSync.output_tail, /private-state: warn/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

async function createFreshMetadata(repoRoot, now) {
  const snapshot = path.join(repoRoot, "guild_hall/state/snapshot/soulforge_snapshot.json");
  const latestContext = path.join(repoRoot, "guild_hall/state/operations/soulforge_activity/latest_context.json");
  const report = path.join(
    repoRoot,
    "guild_hall/state/operations/soulforge_activity/log/2026/2026-05-21/120000-healer-run.md",
  );
  const privateLatestContext = path.join(
    repoRoot,
    "private-state/guild_hall/state/operations/soulforge_activity/latest_context.json",
  );
  const handoff = path.join(repoRoot, "_workmeta/system/NIGHT_WORK_HANDOFF.md");
  const workmetaGit = path.join(repoRoot, "_workmeta/.git");
  const privateStateGit = path.join(repoRoot, "private-state/.git");

  for (const filePath of [snapshot, latestContext, report, privateLatestContext, handoff]) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{}\n", "utf8");
    await utimes(filePath, now, now);
  }

  await mkdir(workmetaGit, { recursive: true });
  await mkdir(privateStateGit, { recursive: true });
}

function commandResultForOkRun(command, args) {
  if (command === "npm" && args.includes("guild-hall:snapshot:check-fresh")) {
    return { status: 0, stdout: "PASS snapshot freshness: soulforge.snapshot.v0\n", stderr: "" };
  }
  if (command === "npm" && args.includes("guild-hall:always-on:verify")) {
    return {
      status: 0,
      stdout: JSON.stringify({
        schema_version: "soulforge.always_on_launchd.v1",
        launchctl_checked: true,
        files: [
          { label: "ai.soulforge.gateway.mail-fetch", exists: true, loaded: true },
          { label: "ai.soulforge.gateway.mail-healthcheck", exists: true, loaded: true },
          { label: "ai.soulforge.town-crier", exists: true, loaded: true },
          { label: "ai.soulforge.healer.light", exists: true, loaded: true },
          { label: "ai.soulforge.healer.full", exists: true, loaded: true },
        ],
      }),
      stderr: "",
    };
  }
  if (command === "git" && args.includes("--porcelain=v1")) {
    return {
      status: 0,
      stdout: [
        " M guild_hall/healer/healer_run.mjs",
        " M docs/architecture/bootstrap/README.md",
      ].join("\n"),
      stderr: "",
    };
  }
  if (command === "git" && args[0] === "status") {
    return { status: 0, stdout: "## main...origin/main\n", stderr: "" };
  }
  return { status: 0, stdout: "ok\n", stderr: "" };
}

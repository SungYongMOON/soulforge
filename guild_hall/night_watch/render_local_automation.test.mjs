import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSpecPath, ALLOWLISTED_SPECS } from "./render_local_automation.mjs";

const execFile = promisify(execFileCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

test("resolveSpecPath resolves allowlisted specs and rejects unknown/traversal specs", () => {
  assert.equal(
    resolveSpecPath("soulforge-night-watch-pipeline", repoRoot),
    path.join(repoRoot, "guild_hall/night_watch/automations/soulforge-night-watch-pipeline.spec.json")
  );
  assert.equal(
    resolveSpecPath("soulforge-lifecycle-retention-report", repoRoot),
    path.join(repoRoot, "guild_hall/night_watch/automations/soulforge-lifecycle-retention-report.spec.json")
  );

  assert.throws(
    () => resolveSpecPath("../../etc/passwd", repoRoot),
    (err) => err.message.includes("Unknown or forbidden spec selector")
  );
  assert.throws(
    () => resolveSpecPath("unknown-spec", repoRoot),
    (err) => err.message.includes("Unknown or forbidden spec selector")
  );
});

test("render_local_automation CLI renders default spec when --spec is omitted", async () => {
  const result = await execFile(process.execPath, [
    "guild_hall/night_watch/render_local_automation.mjs",
    "--local-root", repoRoot,
    "--workmeta-root", path.join(repoRoot, "_workmeta"),
    "--private-state-root", path.join(repoRoot, "private-state")
  ], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(result.stderr, "");
  assert.ok(result.stdout.includes('id = "soulforge-night-watch-pipeline"'));
  assert.ok(result.stdout.includes('status = "ACTIVE"'));
});

test("render_local_automation CLI renders new lifecycle retention spec with default status PAUSED", async () => {
  const result = await execFile(process.execPath, [
    "guild_hall/night_watch/render_local_automation.mjs",
    "--spec", "soulforge-lifecycle-retention-report",
    "--local-root", repoRoot,
    "--workmeta-root", path.join(repoRoot, "_workmeta"),
    "--private-state-root", path.join(repoRoot, "private-state")
  ], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(result.stderr, "");
  assert.ok(result.stdout.includes('id = "soulforge-lifecycle-retention-report"'));
  assert.ok(result.stdout.includes('status = "PAUSED"'));
  assert.ok(result.stdout.includes('codex_retention_automation_cli.mjs'));
});

test("render_local_automation CLI accepts explicit status override --status ACTIVE", async () => {
  const result = await execFile(process.execPath, [
    "guild_hall/night_watch/render_local_automation.mjs",
    "--spec", "soulforge-lifecycle-retention-report",
    "--status", "ACTIVE",
    "--local-root", repoRoot,
    "--workmeta-root", path.join(repoRoot, "_workmeta"),
    "--private-state-root", path.join(repoRoot, "private-state")
  ], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(result.stderr, "");
  assert.ok(result.stdout.includes('id = "soulforge-lifecycle-retention-report"'));
  assert.ok(result.stdout.includes('status = "ACTIVE"'));
});

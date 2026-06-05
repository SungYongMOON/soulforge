import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildLaunchdDefinitions,
  installLaunchdFiles,
  listRenderedPlists,
  renderLaunchdFiles,
  verifyLaunchdInstall,
} from "./launchd.mjs";

test("renderLaunchdFiles writes the expected plist set", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-launchd-render-"));
  const outputDir = path.join(repoRoot, "rendered");
  const result = renderLaunchdFiles({ repoRoot, outputDir });

  assert.equal(result.files.length, 6);
  assert.deepEqual(listRenderedPlists(outputDir), [
    "ai.soulforge.gateway.mail-fetch.plist",
    "ai.soulforge.gateway.mail-healthcheck.plist",
    "ai.soulforge.healer.full.plist",
    "ai.soulforge.healer.light.plist",
    "ai.soulforge.private-state-sync.plist",
    "ai.soulforge.town-crier.plist",
  ]);

  const healerLight = await readFile(path.join(outputDir, "ai.soulforge.healer.light.plist"), "utf8");
  assert.equal(healerLight.includes("--notify-on-failure"), true);
  assert.equal(healerLight.includes("StartInterval"), true);
});

test("renderLaunchdFiles honors a custom log root", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-launchd-log-root-"));
  const outputDir = path.join(repoRoot, "rendered");
  const logRoot = path.join(repoRoot, "local-logs");
  renderLaunchdFiles({ repoRoot, outputDir, logRoot });

  const privateStateSync = await readFile(path.join(outputDir, "ai.soulforge.private-state-sync.plist"), "utf8");
  assert.equal(privateStateSync.includes(path.join(logRoot, "ai.soulforge.private-state-sync.out.log")), true);
});

test("installLaunchdFiles copies plists into install dir", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-launchd-install-"));
  const outputDir = path.join(repoRoot, "rendered");
  const installDir = path.join(repoRoot, "LaunchAgents");
  const result = installLaunchdFiles({ repoRoot, outputDir, installDir });

  assert.equal(result.installed.length, 6);
  const verify = verifyLaunchdInstall({ repoRoot, installDir });
  assert.equal(verify.files.every((file) => file.exists), true);
});

test("buildLaunchdDefinitions keeps night_watch out of launchd job set", () => {
  const definitions = buildLaunchdDefinitions({ repoRoot: "workspace_root" });
  assert.equal(definitions.some((definition) => definition.label.includes("night-watch")), false);
});

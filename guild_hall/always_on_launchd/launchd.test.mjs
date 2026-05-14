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

  assert.equal(result.files.length, 5);
  assert.deepEqual(listRenderedPlists(outputDir), [
    "ai.soulforge.gateway.mail-fetch.plist",
    "ai.soulforge.gateway.mail-healthcheck.plist",
    "ai.soulforge.healer.full.plist",
    "ai.soulforge.healer.light.plist",
    "ai.soulforge.town-crier.plist",
  ]);

  const healerLight = await readFile(path.join(outputDir, "ai.soulforge.healer.light.plist"), "utf8");
  assert.equal(healerLight.includes("--notify-on-failure"), true);
  assert.equal(healerLight.includes("StartInterval"), true);
});

test("installLaunchdFiles copies plists into install dir", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "soulforge-launchd-install-"));
  const outputDir = path.join(repoRoot, "rendered");
  const installDir = path.join(repoRoot, "LaunchAgents");
  const result = installLaunchdFiles({ repoRoot, outputDir, installDir });

  assert.equal(result.installed.length, 5);
  const verify = verifyLaunchdInstall({ repoRoot, installDir });
  assert.equal(verify.files.every((file) => file.exists), true);
});

test("buildLaunchdDefinitions keeps night_watch out of launchd job set", () => {
  const definitions = buildLaunchdDefinitions({ repoRoot: "/tmp/soulforge" });
  assert.equal(definitions.some((definition) => definition.label.includes("night-watch")), false);
});

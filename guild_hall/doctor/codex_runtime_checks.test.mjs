import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildRequiredCodexRuntimeSkillResult,
  buildRequiredCodexStopHookResult,
  hasStopHookCommand,
} from "./codex_runtime_checks.mjs";

async function withTempDir(prefix, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("runtime skill check reports installed and missing local Codex skills", async () => {
  await withTempDir("doctor-skill-", async (codexHome) => {
    const skillDir = path.join(codexHome, "skills", "conversation-rule-hardening");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "# skill\n", "utf8");

    const ok = await buildRequiredCodexRuntimeSkillResult({
      id: "conversation_rule_hardening_skill",
      install_name: "conversation-rule-hardening",
    }, { codexHome });
    assert.equal(ok.status, "ok");
    assert.match(ok.detail, /installed/);

    const missing = await buildRequiredCodexRuntimeSkillResult({
      id: "missing_skill",
      install_name: "missing-skill",
    }, { codexHome });
    assert.equal(missing.status, "missing");
    assert.match(missing.detail, /missing installed skill/);
  });
});

test("Stop hook check requires config.toml and the requested guard command", async () => {
  await withTempDir("doctor-hook-", async (root) => {
    const codexHome = path.join(root, "codex-home");
    const repoRoot = path.join(root, "Soulforge");
    const scriptRef = "guild_hall/knowledge_access/knowledge_trigger_stop_guard.mjs";
    const scriptPath = path.join(repoRoot, ...scriptRef.split("/"));
    await mkdir(path.dirname(scriptPath), { recursive: true });
    await writeFile(scriptPath, "#!/usr/bin/env node\n", "utf8");
    await mkdir(codexHome, { recursive: true });

    const missingConfig = await buildRequiredCodexStopHookResult({
      id: "knowledge_trigger_stop_hook",
      script_ref: scriptRef,
    }, { codexHome, repoRoot });
    assert.equal(missingConfig.status, "missing");

    await writeFile(path.join(codexHome, "config.toml"), `
[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = 'node "guild_hall/knowledge_access/knowledge_trigger_stop_guard.mjs"'
`, "utf8");

    const ok = await buildRequiredCodexStopHookResult({
      id: "knowledge_trigger_stop_hook",
      script_ref: scriptRef,
    }, { codexHome, repoRoot });
    assert.equal(ok.status, "ok");
  });
});

test("Stop hook command matcher is case-insensitive and accepts script basenames", () => {
  const configText = `
[[hooks.Stop]]
[[hooks.Stop.hooks]]
command = "node GUILD_HALL\\knowledge_access\\rule_hardening_stop_guard.mjs"
`;
  assert.equal(
    hasStopHookCommand(configText, "guild_hall/knowledge_access/rule_hardening_stop_guard.mjs"),
    true,
  );
  assert.equal(
    hasStopHookCommand("command = \"rule_hardening_stop_guard.mjs\"", "guild_hall/knowledge_access/rule_hardening_stop_guard.mjs"),
    false,
  );
});

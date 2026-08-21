import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REGISTRAR_SCRIPT = path.join(SCRIPT_DIR, "register-hiworks-gmail-forwarder-task.ps1");

test("register-hiworks-gmail-forwarder-task.ps1 resolves runner and hidden launcher from OwnerRoot", async () => {
  const content = await readFile(REGISTRAR_SCRIPT, "utf8");

  // Prove $Runner and $HiddenLauncher do NOT join against $PSScriptRoot
  assert.doesNotMatch(
    content,
    /\$Runner\s*=\s*\(Resolve-Path\s*\(Join-Path\s*\$PSScriptRoot/u,
    "$Runner must not be resolved relative to $PSScriptRoot",
  );
  assert.doesNotMatch(
    content,
    /\$HiddenLauncher\s*=\s*\(Resolve-Path\s*\(Join-Path\s*\$PSScriptRoot/u,
    "$HiddenLauncher must not be resolved relative to $PSScriptRoot",
  );

  // Prove $Runner and $HiddenLauncher resolve against $OwnerRoot
  assert.match(
    content,
    /\$Runner\s*=\s*\(Resolve-Path\s*\(Join-Path\s*\$OwnerRoot\s+'guild_hall\\gateway\\mail_send\\ops\\run-hiworks-gmail-forwarder\.ps1'/u,
    "$Runner must be resolved relative to $OwnerRoot canonical path",
  );
  assert.match(
    content,
    /\$HiddenLauncher\s*=\s*\(Resolve-Path\s*\(Join-Path\s*\$OwnerRoot\s+'guild_hall\\gateway\\mail_send\\ops\\run-hiworks-gmail-forwarder-hidden\.vbs'/u,
    "$HiddenLauncher must be resolved relative to $OwnerRoot canonical path",
  );

  // Prove Git common directory derivation is preserved
  assert.match(
    content,
    /\$GitCommonDirectory\s*=\s*\(& git -C \$RepoRoot rev-parse --path-format=absolute --git-common-dir\)\.Trim\(\)/u,
    "Git common directory must be retrieved to locate canonical owner root",
  );
});

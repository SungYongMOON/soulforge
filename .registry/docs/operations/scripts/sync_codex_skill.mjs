#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "../../../..");
const skillsRoot = path.join(repoRoot, ".registry", "skills");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const installRoot = path.join(codexHome, "skills");
const retiredManifestPath = path.join(repoRoot, ".registry", "docs", "operations", "retired_codex_skills.json");
const retiredManifestSchema = "soulforge.retired_codex_skills.v0";
const safeSkillIdPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function usage() {
  console.error("usage: node .registry/docs/operations/scripts/sync_codex_skill.mjs <skill_id> [skill_id ...] | --all | --prune-retired");
  process.exit(1);
}

function installNameForSkill(skillId) {
  if (!safeSkillIdPattern.test(skillId)) {
    throw new Error(`invalid skill id: ${skillId}`);
  }
  return `soulforge-${skillId.replaceAll("_", "-")}`;
}

function assertContained(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("skill target escapes install root");
  }
}

export async function loadRetiredSkillIds(manifestPath = retiredManifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.schema_version !== retiredManifestSchema || !Array.isArray(manifest.skill_ids)) {
    throw new Error(`invalid retired skill manifest: ${manifestPath}`);
  }
  const ids = [...new Set(manifest.skill_ids)];
  for (const skillId of ids) installNameForSkill(skillId);
  return ids;
}

export async function pruneRetiredSkills(options = {}) {
  const targetRoot = path.resolve(options.installRoot || installRoot);
  const retiredIds = await loadRetiredSkillIds(options.manifestPath || retiredManifestPath);
  const results = [];

  for (const skillId of retiredIds) {
    if (await hasBridgeSkill(skillId)) {
      throw new Error(`retired skill still has an active Codex bridge: ${skillId}`);
    }
    const targetDir = path.join(targetRoot, installNameForSkill(skillId));
    assertContained(targetRoot, targetDir);
    await rm(targetDir, { recursive: true, force: true });
    results.push({ skillId, targetDir });
  }

  return results;
}

async function hasBridgeSkill(skillId) {
  try {
    const bridgeSkill = path.join(skillsRoot, skillId, "codex", "SKILL.md");
    const info = await stat(bridgeSkill);
    return info.isFile();
  } catch {
    return false;
  }
}

async function availableSkillIds() {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const available = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (await hasBridgeSkill(entry.name)) {
      available.push(entry.name);
    }
  }

  return available;
}

async function syncSkill(skillId) {
  const sourceDir = path.join(skillsRoot, skillId, "codex");
  const installName = installNameForSkill(skillId);
  const targetDir = path.join(installRoot, installName);

  if (!(await hasBridgeSkill(skillId))) {
    throw new Error(`missing codex bridge for ${skillId}`);
  }

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir)) {
    await cp(path.join(sourceDir, entry), path.join(targetDir, entry), { recursive: true });
  }

  console.log(`synced ${skillId} -> ${targetDir}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
  }

  if (args.length === 1 && args[0] === "--prune-retired") {
    for (const result of await pruneRetiredSkills()) {
      console.log(`pruned retired ${result.skillId} -> ${result.targetDir}`);
    }
    return;
  }

  const syncAll = args.length === 1 && args[0] === "--all";
  const skillIds = syncAll ? await availableSkillIds() : args;
  if (skillIds.length === 0) {
    console.error(`no syncable Soulforge skills found under ${skillsRoot}`);
    process.exit(1);
  }

  await mkdir(installRoot, { recursive: true });

  for (const skillId of skillIds) {
    await syncSkill(skillId);
  }

  if (syncAll) {
    for (const result of await pruneRetiredSkills()) {
      console.log(`pruned retired ${result.skillId} -> ${result.targetDir}`);
    }
  }
}

const invokedScriptPath = process.argv[1] ? await realpath(process.argv[1]) : undefined;
const resolvedScriptPath = await realpath(scriptPath);

if (invokedScriptPath === resolvedScriptPath) {
  await main();
}

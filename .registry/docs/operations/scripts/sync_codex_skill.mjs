#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const skillsRoot = path.join(repoRoot, ".registry", "skills");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const installRoot = path.join(codexHome, "skills");

function usage() {
  console.error("usage: node .registry/docs/operations/scripts/sync_codex_skill.mjs <skill_id> [skill_id ...] | --all");
  process.exit(1);
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
  const installName = `soulforge-${skillId.replaceAll("_", "-")}`;
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

  const skillIds = args.length === 1 && args[0] === "--all" ? await availableSkillIds() : args;
  if (skillIds.length === 0) {
    console.error(`no syncable Soulforge skills found under ${skillsRoot}`);
    process.exit(1);
  }

  await mkdir(installRoot, { recursive: true });

  for (const skillId of skillIds) {
    await syncSkill(skillId);
  }
}

await main();

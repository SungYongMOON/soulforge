#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "../../../..");
const packageFiles = ["pet.json", "spritesheet.webp"];
const safePetIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function assertSafePetId(petId) {
  if (!safePetIdPattern.test(petId)) {
    throw new Error(
      `invalid pet id ${JSON.stringify(petId)}; use 1-64 lowercase letters, digits, underscores, or hyphens`,
    );
  }
}

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its allowed root`);
  }
}

function resolvePetPaths(petId, options = {}) {
  assertSafePetId(petId);

  const repoRoot = path.resolve(options.repoRoot || defaultRepoRoot);
  const codexHome = path.resolve(options.codexHome || defaultCodexHome());
  const sourceRoot = path.join(repoRoot, ".registry", "docs", "operations", "codex_pets");
  const installRoot = path.join(codexHome, "pets");
  const sourceDir = path.join(sourceRoot, petId);
  const targetDir = path.join(installRoot, petId);

  assertContained(sourceRoot, sourceDir, "pet source");
  assertContained(installRoot, targetDir, "pet target");

  return { sourceDir, installRoot, targetDir };
}

async function pathExists(targetPath) {
  try {
    await lstat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertDirectory(targetPath, label) {
  const info = await lstat(targetPath);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${targetPath}`);
  }
}

async function assertRegularFile(targetPath, label) {
  const info = await lstat(targetPath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} must be a regular file: ${targetPath}`);
  }
}

function validateManifest(manifest, expectedId, label) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  if (manifest.id !== expectedId) {
    throw new Error(`${label} id must match ${expectedId}`);
  }
  if (typeof manifest.displayName !== "string" || manifest.displayName.trim() === "") {
    throw new Error(`${label} displayName must be a non-empty string`);
  }
  if (typeof manifest.description !== "string" || manifest.description.trim() === "") {
    throw new Error(`${label} description must be a non-empty string`);
  }
  if (manifest.spriteVersionNumber !== 2) {
    throw new Error(`${label} spriteVersionNumber must be 2`);
  }
  if (manifest.spritesheetPath !== "spritesheet.webp") {
    throw new Error(`${label} spritesheetPath must be spritesheet.webp`);
  }
}

async function inspectPackage(packageDir, expectedId, label) {
  await assertDirectory(packageDir, label);
  const entries = (await readdir(packageDir)).sort();
  if (entries.length !== packageFiles.length || entries.some((entry, index) => entry !== packageFiles[index])) {
    throw new Error(`${label} must contain exactly ${packageFiles.join(" and ")}`);
  }

  const manifestPath = path.join(packageDir, "pet.json");
  const spritesheetPath = path.join(packageDir, "spritesheet.webp");
  await assertRegularFile(manifestPath, `${label} manifest`);
  await assertRegularFile(spritesheetPath, `${label} spritesheet`);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`${label} pet.json is not valid JSON: ${error.message}`);
  }
  validateManifest(manifest, expectedId, `${label} pet.json`);

  return { manifestPath, spritesheetPath };
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function packageHashes(packageInfo) {
  return {
    "pet.json": await sha256(packageInfo.manifestPath),
    "spritesheet.webp": await sha256(packageInfo.spritesheetPath),
  };
}

function hashesMatch(left, right) {
  return packageFiles.every((name) => left[name] === right[name]);
}

async function ensureInstallRoot(installRoot) {
  await mkdir(installRoot, { recursive: true });
  await assertDirectory(installRoot, "Codex pets install root");
}

export async function verifyPet(petId, options = {}) {
  const { sourceDir, targetDir } = resolvePetPaths(petId, options);
  const source = await inspectPackage(sourceDir, petId, "tracked pet package");
  const target = await inspectPackage(targetDir, petId, "installed pet package");
  const sourceHashes = await packageHashes(source);
  const targetHashes = await packageHashes(target);

  if (!hashesMatch(sourceHashes, targetHashes)) {
    const mismatches = packageFiles.filter((name) => sourceHashes[name] !== targetHashes[name]);
    throw new Error(`installed pet hash mismatch: ${mismatches.join(", ")}`);
  }

  return { status: "verified", petId, targetDir, hashes: targetHashes };
}

export async function syncPet(petId, options = {}) {
  const { sourceDir, installRoot, targetDir } = resolvePetPaths(petId, options);
  const source = await inspectPackage(sourceDir, petId, "tracked pet package");
  const sourceHashes = await packageHashes(source);
  await ensureInstallRoot(installRoot);

  const targetExists = await pathExists(targetDir);
  if (targetExists) {
    const target = await inspectPackage(targetDir, petId, "installed pet package");
    if (hashesMatch(sourceHashes, await packageHashes(target))) {
      return { status: "unchanged", petId, targetDir, hashes: sourceHashes };
    }
  }

  const stagingDir = await mkdtemp(path.join(installRoot, `.${petId}.stage-`));
  let backupDir;
  let published = false;

  try {
    for (const fileName of packageFiles) {
      await copyFile(path.join(sourceDir, fileName), path.join(stagingDir, fileName));
    }
    const staged = await inspectPackage(stagingDir, petId, "staged pet package");
    if (!hashesMatch(sourceHashes, await packageHashes(staged))) {
      throw new Error("staged pet package hash mismatch");
    }

    if (targetExists) {
      backupDir = path.join(installRoot, `.${petId}.backup-${process.pid}-${randomUUID()}`);
      await rename(targetDir, backupDir);
    }

    try {
      await rename(stagingDir, targetDir);
      published = true;
    } catch (error) {
      if (backupDir && !(await pathExists(targetDir))) {
        await rename(backupDir, targetDir);
        backupDir = undefined;
      }
      throw error;
    }

    if (backupDir) {
      await rm(backupDir, { recursive: true });
      backupDir = undefined;
    }
  } finally {
    if (!published) {
      await rm(stagingDir, { recursive: true, force: true });
    }
  }

  return { status: targetExists ? "updated" : "synced", petId, targetDir, hashes: sourceHashes };
}

export async function removePet(petId, options = {}) {
  const { targetDir } = resolvePetPaths(petId, options);
  if (!(await pathExists(targetDir))) {
    return { status: "absent", petId, targetDir };
  }

  await inspectPackage(targetDir, petId, "installed pet package");
  await rm(targetDir, { recursive: true });
  return { status: "removed", petId, targetDir };
}

function usage() {
  return "usage: node .registry/docs/operations/scripts/sync_codex_pet.mjs <sync|verify|remove> <pet_id>";
}

async function main() {
  const [command, petId, ...extra] = process.argv.slice(2);
  if (!command || !petId || extra.length > 0 || !["sync", "verify", "remove"].includes(command)) {
    throw new Error(usage());
  }

  const operations = { sync: syncPet, verify: verifyPet, remove: removePet };
  const result = await operations[command](petId);
  console.log(`${result.status} ${petId} -> ${result.targetDir}`);
}

const invokedScriptPath = process.argv[1] ? await realpath(process.argv[1]) : undefined;
const resolvedScriptPath = await realpath(scriptPath);

if (invokedScriptPath === resolvedScriptPath) {
  try {
    await main();
  } catch (error) {
    console.error(`pet operation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

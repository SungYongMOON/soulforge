#!/usr/bin/env node

// Emits the exact-runtime copy of the Buzz collection lane
// (`install/source-lanes/buzz-collect-v1`) and its `runtime_manifest.json`.
//
//   node guild_hall/buzz_history/buzz_runtime_manifest_emitter.mjs \
//     --source-root <repository checkout> --target-root <lane directory> [--write]
//
// Without `--write` the emitter only prints the manifest digest it would
// produce. With `--write` the target must not exist yet (or be an empty
// directory); every file is copied create-only and the manifest is written
// last. The lane has zero npm dependencies, so no node_modules is copied.

import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, readdir, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  BUZZ_COLLECT_RUNTIME_ENTRYPOINT,
  BUZZ_COLLECT_RUNTIME_MANIFEST_SCHEMA_VERSION,
  validateBuzzCollectRuntimeManifest,
} from "./buzz_collect_launcher.mjs";

export const BUZZ_COLLECT_RUNTIME_MANIFEST_BASENAME = "runtime_manifest.json";
// The exporter script is a runtime member like any other module: the launcher
// hashes it before the CLI is imported, so a drifted `buzz_export.sh` cannot
// reach the relay. The synthetic exporter and its fixture are deliberately
// absent — they exist for tests, never for a live lane.
export const BUZZ_COLLECT_RUNTIME_FILES = Object.freeze([
  "guild_hall/buzz_history/buzz_collect_cli.mjs",
  "guild_hall/buzz_history/buzz_collect_launcher.mjs",
  "guild_hall/buzz_history/buzz_collect_receipt.mjs",
  "guild_hall/buzz_history/buzz_collect_runner.mjs",
  "guild_hall/buzz_history/buzz_custody.mjs",
  "guild_hall/buzz_history/buzz_export.sh",
  "guild_hall/buzz_history/buzz_wsl_exporter.mjs",
  "guild_hall/buzz_history/ops/register-buzz-collect-hpp-task.ps1",
  "guild_hall/buzz_history/ops/run-buzz-collect-hidden.vbs",
  "guild_hall/shared/project_history_envelope.mjs",
]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function buildBuzzRuntimeManifest({ root, files = BUZZ_COLLECT_RUNTIME_FILES }) {
  const entries = [];
  for (const relativePath of files) {
    const bytes = await readFile(path.resolve(root, ...relativePath.split("/")));
    entries.push({ relative_path: relativePath, sha256: sha256Bytes(bytes) });
  }
  entries.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  const manifest = {
    schema_version: BUZZ_COLLECT_RUNTIME_MANIFEST_SCHEMA_VERSION,
    entrypoint: BUZZ_COLLECT_RUNTIME_ENTRYPOINT,
    files: entries,
  };
  validateBuzzCollectRuntimeManifest(manifest);
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, bytes, sha256: sha256Bytes(bytes) };
}

async function assertWritableTarget(targetRoot) {
  let info;
  try {
    info = await stat(targetRoot);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (!info.isDirectory()) fail("target_not_directory", "Target root exists and is not a directory");
  const entries = await readdir(targetRoot);
  if (entries.length > 0) fail("target_not_empty", "Target root must be empty; runtime lanes are create-only");
}

async function writeCreateOnly(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, "wx", 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function emitBuzzRuntimeLane({
  source_root: sourceRoot,
  target_root: targetRoot,
  write = false,
  files = BUZZ_COLLECT_RUNTIME_FILES,
}) {
  if (typeof sourceRoot !== "string" || !path.isAbsolute(sourceRoot)
    || typeof targetRoot !== "string" || !path.isAbsolute(targetRoot)) {
    fail("absolute_roots_required", "Source and target roots must be absolute");
  }
  const built = await buildBuzzRuntimeManifest({ root: sourceRoot, files });
  if (!write) {
    return { mode: "plan", written: false, file_count: built.manifest.files.length, manifest_sha256: built.sha256 };
  }
  await assertWritableTarget(targetRoot);
  await mkdir(targetRoot, { recursive: true });
  for (const entry of built.manifest.files) {
    const source = path.resolve(sourceRoot, ...entry.relative_path.split("/"));
    const target = path.resolve(targetRoot, ...entry.relative_path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target, fsConstants.COPYFILE_EXCL);
    if (sha256Bytes(await readFile(target)) !== entry.sha256) {
      fail("copy_digest_mismatch", "Copied runtime file bytes differ from the manifest");
    }
  }
  await writeCreateOnly(path.join(targetRoot, BUZZ_COLLECT_RUNTIME_MANIFEST_BASENAME), built.bytes);
  return { mode: "write", written: true, file_count: built.manifest.files.length, manifest_sha256: built.sha256 };
}

function parseArguments(argv) {
  const request = { source_root: null, target_root: null, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--write") {
      request.write = true;
    } else if (flag === "--source-root" || flag === "--target-root") {
      if (index + 1 >= argv.length) fail("emitter_argument_invalid", `${flag} requires a value`);
      request[flag === "--source-root" ? "source_root" : "target_root"] = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      fail("emitter_argument_invalid", "Unknown emitter argument");
    }
  }
  if (request.source_root === null || request.target_root === null) {
    fail("emitter_argument_missing", "--source-root and --target-root are required");
  }
  return request;
}

async function main() {
  try {
    const result = await emitBuzzRuntimeLane(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = /^[a-z][a-z0-9_]{0,95}$/u.test(String(error?.code ?? "")) ? error.code : "unknown_failure";
    process.stderr.write(`buzz_runtime_emitter_rejected:${code}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  await main();
}

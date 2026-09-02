#!/usr/bin/env node

// Emits the exact-runtime copy of the Linear collection lane
// (`install/source-lanes/linear-collect-v1`) and its `runtime_manifest.json`.
//
//   node guild_hall/linear_history/linear_runtime_manifest_emitter.mjs \
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
  LINEAR_COLLECT_RUNTIME_ENTRYPOINT,
  LINEAR_COLLECT_RUNTIME_MANIFEST_SCHEMA_VERSION,
  validateLinearCollectRuntimeManifest,
} from "./linear_collect_launcher.mjs";

export const LINEAR_COLLECT_RUNTIME_MANIFEST_BASENAME = "runtime_manifest.json";
export const LINEAR_COLLECT_RUNTIME_FILES = Object.freeze([
  "guild_hall/linear_history/linear_collect_cli.mjs",
  "guild_hall/linear_history/linear_collect_launcher.mjs",
  "guild_hall/linear_history/linear_collect_receipt.mjs",
  "guild_hall/linear_history/linear_collect_runner.mjs",
  "guild_hall/linear_history/linear_custody.mjs",
  "guild_hall/linear_history/linear_graphql_client.mjs",
  "guild_hall/linear_history/ops/register-linear-collect-hpp-task.ps1",
  "guild_hall/linear_history/ops/run-linear-collect-hidden.vbs",
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

export async function buildLinearRuntimeManifest({ root, files = LINEAR_COLLECT_RUNTIME_FILES }) {
  const entries = [];
  for (const relativePath of files) {
    const bytes = await readFile(path.resolve(root, ...relativePath.split("/")));
    entries.push({ relative_path: relativePath, sha256: sha256Bytes(bytes) });
  }
  entries.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  const manifest = {
    schema_version: LINEAR_COLLECT_RUNTIME_MANIFEST_SCHEMA_VERSION,
    entrypoint: LINEAR_COLLECT_RUNTIME_ENTRYPOINT,
    files: entries,
  };
  validateLinearCollectRuntimeManifest(manifest);
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

export async function emitLinearRuntimeLane({
  source_root: sourceRoot,
  target_root: targetRoot,
  write = false,
  files = LINEAR_COLLECT_RUNTIME_FILES,
}) {
  if (typeof sourceRoot !== "string" || !path.isAbsolute(sourceRoot)
    || typeof targetRoot !== "string" || !path.isAbsolute(targetRoot)) {
    fail("absolute_roots_required", "Source and target roots must be absolute");
  }
  const built = await buildLinearRuntimeManifest({ root: sourceRoot, files });
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
  await writeCreateOnly(path.join(targetRoot, LINEAR_COLLECT_RUNTIME_MANIFEST_BASENAME), built.bytes);
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
    const result = await emitLinearRuntimeLane(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = /^[a-z][a-z0-9_]{0,95}$/u.test(String(error?.code ?? "")) ? error.code : "unknown_failure";
    process.stderr.write(`linear_runtime_emitter_rejected:${code}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  await main();
}

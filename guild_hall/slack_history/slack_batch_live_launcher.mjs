#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  open,
  readdir,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SLACK_BATCH_RUNTIME_MANIFEST_SCHEMA_VERSION = "soulforge.slack_batch_live.runtime_manifest.v1";
export const SLACK_BATCH_RUNTIME_ENTRYPOINT = "guild_hall/slack_history/slack_batch_live_cli.mjs";

const MANIFEST_FIELDS = Object.freeze(["schema_version", "entrypoint", "files"]);
const FILE_FIELDS = Object.freeze(["relative_path", "sha256"]);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+ -]+(?:\/[A-Za-z0-9._@+ -]+)*$/u;
const SECRET_BASENAME_PATTERN = /^(?:\.env(?:\..+)?|.*\.(?:pem|p12|pfx|key)|(?:secret|secrets|token|tokens|password|passwords)(?:\..+)?)$/iu;

export class SlackBatchRuntimeError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "SlackBatchRuntimeError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new SlackBatchRuntimeError(code, target, message);
}

function exactKeys(value, fields, target) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", target, "Expected a plain object");
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length
    || actual.some((entry, index) => entry !== expected[index])) {
    fail("exact_keys_required", target, `Expected exact keys: ${expected.join(",")}`);
  }
}

function assertDigest(value, target) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("digest_invalid", target, "Expected a lowercase sha256 digest");
  }
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizedPath(left) === normalizedPath(right);
}

function compareCanonicalRuntimePath(left, right) {
  return left.localeCompare(right);
}

function isPathWithin(parent, candidate, strict = false) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  if (relative === "") return !strict;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoReparseComponents(target, label) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await lstatOrNull(current);
    if (stat === null) fail("runtime_path_missing", label, "Runtime path component is missing");
    if (stat.isSymbolicLink()) {
      fail("runtime_reparse_forbidden", label, "Runtime paths must not contain links or junctions");
    }
  }
  return absolute;
}

async function canonicalDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", label, "Expected an absolute directory path");
  }
  const absolute = await assertNoReparseComponents(value, label);
  const stat = await lstat(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail("runtime_directory_required", label, "Expected an existing normal directory");
  }
  const canonical = await realpath(absolute);
  if (!samePath(canonical, absolute)) {
    fail("canonical_path_required", label, "Runtime directory must not resolve through an alias");
  }
  return canonical;
}

async function readStableNormalFile(filePath, label, maximumBytes = Number.MAX_SAFE_INTEGER) {
  const absolute = await assertNoReparseComponents(filePath, label);
  const before = await lstat(absolute);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
    || before.size < 1 || before.size > maximumBytes) {
    fail("runtime_file_invalid", label, "Expected one bounded normal file");
  }
  const canonical = await realpath(absolute);
  if (!samePath(canonical, absolute)) {
    fail("canonical_path_required", label, "Runtime file must not resolve through an alias");
  }
  const handle = await open(absolute, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1
      || String(opened.dev) !== String(before.dev)
      || String(opened.ino) !== String(before.ino)
      || opened.size !== before.size) {
      fail("runtime_file_identity_changed", label, "Runtime file changed before open");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (String(after.dev) !== String(opened.dev)
      || String(after.ino) !== String(opened.ino)
      || after.nlink !== 1
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs) {
      fail("runtime_file_identity_changed", label, "Runtime file changed while read");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function portableRelativePath(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function assertSafeRuntimeBasename(relativePath, target) {
  const basename = path.posix.basename(relativePath);
  if (SECRET_BASENAME_PATTERN.test(basename)) {
    fail("secret_file_forbidden", target, "Secret-shaped files cannot be runtime manifest members");
  }
}

async function inventoryRuntimeFiles(runtimeRoot, manifestPath) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCanonicalRuntimePath(left.name, right.name));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const relativePath = portableRelativePath(runtimeRoot, target);
      if (entry.isSymbolicLink()) {
        fail("runtime_reparse_forbidden", "$runtime_root", "Runtime tree contains a link or junction");
      }
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile()) {
        if (samePath(target, manifestPath)) continue;
        assertSafeRuntimeBasename(relativePath, "$runtime_manifest.files");
        files.push(relativePath);
      } else {
        fail("runtime_special_file_forbidden", "$runtime_root", "Runtime tree contains a special file");
      }
    }
  }
  await visit(runtimeRoot);
  return files.sort(compareCanonicalRuntimePath);
}

function validateManifest(manifest) {
  exactKeys(manifest, MANIFEST_FIELDS, "$runtime_manifest");
  if (manifest.schema_version !== SLACK_BATCH_RUNTIME_MANIFEST_SCHEMA_VERSION) {
    fail("runtime_manifest_schema_invalid", "$runtime_manifest.schema_version", "Unexpected manifest schema");
  }
  if (manifest.entrypoint !== SLACK_BATCH_RUNTIME_ENTRYPOINT) {
    fail("runtime_entrypoint_invalid", "$runtime_manifest.entrypoint", "Entrypoint is fixed");
  }
  if (!Array.isArray(manifest.files)
    || Object.keys(manifest.files).length !== manifest.files.length
    || manifest.files.length < 2
    || manifest.files.length > 100_000) {
    fail("runtime_manifest_files_invalid", "$runtime_manifest.files", "Expected a bounded dense file list");
  }
  let previous = null;
  const retained = new Set();
  manifest.files.forEach((entry, index) => {
    const target = `$runtime_manifest.files[${index}]`;
    exactKeys(entry, FILE_FIELDS, target);
    if (typeof entry.relative_path !== "string"
      || !RELATIVE_PATH_PATTERN.test(entry.relative_path)
      || path.posix.normalize(entry.relative_path) !== entry.relative_path) {
      fail("runtime_relative_path_invalid", `${target}.relative_path`, "Expected a canonical relative path");
    }
    assertSafeRuntimeBasename(entry.relative_path, `${target}.relative_path`);
    assertDigest(entry.sha256, `${target}.sha256`);
    if (retained.has(entry.relative_path)
      || (previous !== null
        && compareCanonicalRuntimePath(previous, entry.relative_path) >= 0)) {
      fail("runtime_manifest_not_canonical", target, "Manifest file paths must be unique and sorted");
    }
    retained.add(entry.relative_path);
    previous = entry.relative_path;
  });
  if (!retained.has(SLACK_BATCH_RUNTIME_ENTRYPOINT)
    || !retained.has("guild_hall/slack_history/slack_batch_live_launcher.mjs")) {
    fail("runtime_required_file_missing", "$runtime_manifest.files", "Launcher and entrypoint must be pinned");
  }
  return manifest;
}

export async function verifyExactSlackBatchRuntime({
  runtime_root: runtimeRoot,
  runtime_manifest_path: runtimeManifestPath,
  expected_runtime_manifest_sha256: expectedRuntimeManifestSha256,
  node_path: nodePath = process.execPath,
  expected_node_sha256: expectedNodeSha256,
  launcher_path: launcherPath = fileURLToPath(import.meta.url),
}) {
  assertDigest(expectedRuntimeManifestSha256, "$expected_runtime_manifest_sha256");
  assertDigest(expectedNodeSha256, "$expected_node_sha256");
  const canonicalRuntimeRoot = await canonicalDirectory(runtimeRoot, "$runtime_root");
  const canonicalManifestPath = await assertNoReparseComponents(
    runtimeManifestPath,
    "$runtime_manifest_path",
  );
  if (!isPathWithin(canonicalRuntimeRoot, canonicalManifestPath, true)) {
    fail("runtime_manifest_escape", "$runtime_manifest_path", "Manifest must be inside runtime root");
  }
  const canonicalLauncherPath = await assertNoReparseComponents(launcherPath, "$launcher_path");
  if (!isPathWithin(canonicalRuntimeRoot, canonicalLauncherPath, true)) {
    fail("runtime_launcher_escape", "$launcher_path", "Executed launcher must be inside runtime root");
  }
  const nodeBytes = await readStableNormalFile(nodePath, "$node_path");
  if (sha256Bytes(nodeBytes) !== expectedNodeSha256) {
    fail("node_digest_mismatch", "$expected_node_sha256", "Node executable bytes changed");
  }
  const manifestBytes = await readStableNormalFile(
    canonicalManifestPath,
    "$runtime_manifest_path",
    16_777_216,
  );
  if (sha256Bytes(manifestBytes) !== expectedRuntimeManifestSha256) {
    fail("runtime_manifest_digest_mismatch", "$expected_runtime_manifest_sha256", "Manifest bytes changed");
  }
  let manifest;
  try {
    manifest = validateManifest(JSON.parse(manifestBytes.toString("utf8").replace(/^\uFEFF/u, "")));
  } catch (error) {
    if (error instanceof SlackBatchRuntimeError) throw error;
    fail("runtime_manifest_invalid", "$runtime_manifest", "Manifest is not valid JSON");
  }
  const inventory = await inventoryRuntimeFiles(canonicalRuntimeRoot, canonicalManifestPath);
  const declared = manifest.files.map((entry) => entry.relative_path);
  if (inventory.length !== declared.length
    || inventory.some((entry, index) => entry !== declared[index])) {
    fail("runtime_tree_manifest_mismatch", "$runtime_root", "Runtime files do not exactly match manifest");
  }
  for (let index = 0; index < manifest.files.length; index += 1) {
    const entry = manifest.files[index];
    const bytes = await readStableNormalFile(
      path.resolve(canonicalRuntimeRoot, ...entry.relative_path.split("/")),
      `$runtime_manifest.files[${index}]`,
    );
    if (sha256Bytes(bytes) !== entry.sha256) {
      fail("runtime_file_digest_mismatch", `$runtime_manifest.files[${index}].sha256`, "Runtime file bytes changed");
    }
  }
  return {
    runtime_root: canonicalRuntimeRoot,
    manifest,
    manifest_sha256: expectedRuntimeManifestSha256,
    verified_file_count: manifest.files.length,
  };
}

function parseLauncherArguments(argv) {
  const retained = {
    runtime_root: null,
    runtime_manifest_path: null,
    expected_runtime_manifest_sha256: null,
    expected_node_sha256: null,
    verify_only: false,
    remaining: [],
  };
  const valueFlags = new Map([
    ["--runtime-root", "runtime_root"],
    ["--runtime-manifest", "runtime_manifest_path"],
    ["--expected-runtime-manifest-sha256", "expected_runtime_manifest_sha256"],
    ["--expected-node-sha256", "expected_node_sha256"],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (valueFlags.has(flag)) {
      if (seen.has(flag) || index + 1 >= argv.length) {
        fail("launcher_argument_invalid", "$argv", "Launcher flags must be unique and have values");
      }
      seen.add(flag);
      retained[valueFlags.get(flag)] = argv[index + 1];
      index += 1;
    } else if (flag === "--verify-only") {
      if (retained.verify_only) fail("launcher_argument_invalid", "$argv", "Duplicate verify-only flag");
      retained.verify_only = true;
    } else {
      retained.remaining.push(flag);
    }
  }
  for (const key of [
    "runtime_root",
    "runtime_manifest_path",
    "expected_runtime_manifest_sha256",
    "expected_node_sha256",
  ]) {
    if (retained[key] === null) fail("launcher_argument_missing", "$argv", `Missing ${key}`);
  }
  if (retained.verify_only && retained.remaining.length > 0) {
    fail("launcher_argument_invalid", "$argv", "Verify-only accepts no entrypoint arguments");
  }
  if (!retained.verify_only && retained.remaining.length === 0) {
    fail("launcher_argument_missing", "$argv", "Entrypoint mode is required");
  }
  return retained;
}

async function main() {
  try {
    const request = parseLauncherArguments(process.argv.slice(2));
    const verified = await verifyExactSlackBatchRuntime({
      ...request,
      node_path: process.execPath,
      launcher_path: fileURLToPath(import.meta.url),
    });
    if (request.verify_only) {
      process.stdout.write(`${JSON.stringify({
        mode: "runtime_verify",
        verified_file_count: verified.verified_file_count,
        repository_writes: 0,
        private_writes: 0,
        network_used: false,
      })}\n`);
      return;
    }
    globalThis[Symbol.for("soulforge.slack_batch.runtime_attestation")] = Object.freeze({
      runtime_root: verified.runtime_root,
      manifest_sha256: verified.manifest_sha256,
    });
    const entrypoint = path.resolve(
      verified.runtime_root,
      ...verified.manifest.entrypoint.split("/"),
    );
    process.argv = [
      process.execPath,
      entrypoint,
      ...request.remaining,
      "--runtime-root",
      verified.runtime_root,
    ];
    await import(pathToFileURL(entrypoint).href);
  } catch (error) {
    const code = error instanceof SlackBatchRuntimeError ? error.code : "unknown_failure";
    process.stderr.write(`slack_batch_runtime_rejected:${code}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && samePath(invokedPath, fileURLToPath(import.meta.url))) {
  await main();
}

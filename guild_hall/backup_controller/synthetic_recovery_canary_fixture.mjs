// Synthetic-only recovery-canary fixture.
//
// This module creates deterministic bytes only under the operating system temp
// directory.  It deliberately exposes a private fixture descriptor to the
// local runner, never a public receipt or source payload.

import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

export const SYNTHETIC_RECOVERY_CANARY_FIXTURE_SCHEMA =
  "soulforge.backup_controller.synthetic_recovery_canary_fixture.v0";
export const SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF =
  "fixture.synthetic-recovery-canary.v0";
export const SYNTHETIC_RECOVERY_CANARY_SOURCE_REF =
  "source.synthetic-recovery-canary";
export const SYNTHETIC_RECOVERY_CANARY_PROJECT_SCOPE_REF =
  "project.synthetic-recovery-canary";
export const SYNTHETIC_RECOVERY_CANARY_BACKUP_RESTORE_OWNER_REF =
  "owner.backup-restore.synthetic-canary";

const TEMP_PREFIX = "soulforge-synthetic-recovery-canary-";
const ITEM_SPECS = Object.freeze([
  Object.freeze({ relative_path: "catalog/fixture-index.bin", byte_length: 97 }),
  Object.freeze({ relative_path: "objects/segment-a.bin", byte_length: 211 }),
  Object.freeze({ relative_path: "objects/segment-b.bin", byte_length: 389 }),
]);
const SAFE_RELATIVE_PATH = /^[a-z0-9][a-z0-9._/-]{0,127}$/u;

export class SyntheticRecoveryCanaryFixtureError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyntheticRecoveryCanaryFixtureError";
    this.code = code;
  }
}

function fail(code) {
  throw new SyntheticRecoveryCanaryFixtureError(code);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function containedBy(parent, child) {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  const pathRelative = relative(parentPath, childPath);
  return pathRelative === "" || (!pathRelative.startsWith(`..${sep}`)
    && pathRelative !== ".." && !pathRelative.includes(`..${sep}`));
}

function assertTempDescendant(value) {
  if (typeof value !== "string" || !containedBy(tmpdir(), value)
      || resolve(value) === resolve(tmpdir())) {
    fail("synthetic_recovery_canary_fixture_temp_root_required");
  }
  return resolve(value);
}

function assertSafeRelativePath(value) {
  if (typeof value !== "string" || !SAFE_RELATIVE_PATH.test(value)
      || value.includes("\\") || value.startsWith("/") || value.includes("//")) {
    fail("synthetic_recovery_canary_fixture_path_invalid");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("synthetic_recovery_canary_fixture_path_invalid");
  }
  return value;
}

function fixtureBytes(relativePath, byteLength) {
  const output = Buffer.alloc(byteLength);
  let offset = 0;
  let block = 0;
  while (offset < output.length) {
    const digest = createHash("sha256")
      .update(`${SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF}:${relativePath}:${block}`, "utf8")
      .digest();
    digest.copy(output, offset, 0, Math.min(digest.length, output.length - offset));
    offset += digest.length;
    block += 1;
  }
  return output;
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestCanonical(value) {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

async function writeCreateOnly(path, bytes) {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertEmptyDirectory(path) {
  let directory;
  try {
    directory = await lstat(path);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      await mkdir(path, { recursive: false });
      return;
    }
    throw error;
  }
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    fail("synthetic_recovery_canary_fixture_workspace_invalid");
  }
  if ((await readdir(path)).length !== 0) {
    fail("synthetic_recovery_canary_fixture_workspace_not_empty");
  }
}

// The returned descriptor is intentionally private process state.  Public
// outputs must be produced by the runner and contain only refs/digests/counts.
export async function createSyntheticRecoveryCanaryFixture(options = undefined) {
  if (options !== undefined && (options === null || typeof options !== "object"
      || Array.isArray(options) || Object.keys(options).some((key) => key !== "workspace_root"))) {
    fail("synthetic_recovery_canary_fixture_options_invalid");
  }

  const suppliedRoot = options?.workspace_root;
  const workspaceRoot = suppliedRoot === undefined
    ? await mkdtemp(join(tmpdir(), TEMP_PREFIX))
    : assertTempDescendant(suppliedRoot);
  if (suppliedRoot !== undefined) await assertEmptyDirectory(workspaceRoot);

  const sourceRoot = join(workspaceRoot, "source");
  await mkdir(sourceRoot, { recursive: false });
  const items = [];
  for (const spec of ITEM_SPECS) {
    const relativePath = assertSafeRelativePath(spec.relative_path);
    const destination = resolve(sourceRoot, ...relativePath.split("/"));
    if (!containedBy(sourceRoot, destination)) {
      fail("synthetic_recovery_canary_fixture_path_invalid");
    }
    await mkdir(dirname(destination), { recursive: true });
    const bytes = fixtureBytes(relativePath, spec.byte_length);
    await writeCreateOnly(destination, bytes);
    items.push(Object.freeze({
      relative_path: relativePath,
      byte_length: bytes.length,
      content_digest: digestBytes(bytes),
    }));
  }
  const itemManifest = Object.freeze({
    schema_version: SYNTHETIC_RECOVERY_CANARY_FIXTURE_SCHEMA,
    fixture_ref: SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF,
    items: Object.freeze(items),
  });

  return deepFreeze({
    schema_version: SYNTHETIC_RECOVERY_CANARY_FIXTURE_SCHEMA,
    fixture_ref: SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF,
    source_ref: SYNTHETIC_RECOVERY_CANARY_SOURCE_REF,
    project_scope_ref: SYNTHETIC_RECOVERY_CANARY_PROJECT_SCOPE_REF,
    backup_restore_owner_ref: SYNTHETIC_RECOVERY_CANARY_BACKUP_RESTORE_OWNER_REF,
    workspace_root: workspaceRoot,
    source_root: sourceRoot,
    item_count: items.length,
    byte_length: items.reduce((total, item) => total + item.byte_length, 0),
    content_digest: digestCanonical(itemManifest),
    item_manifest: itemManifest,
  });
}

export async function disposeSyntheticRecoveryCanaryFixture(fixture) {
  if (fixture === null || typeof fixture !== "object"
      || fixture.fixture_ref !== SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF) {
    fail("synthetic_recovery_canary_fixture_descriptor_invalid");
  }
  const workspaceRoot = assertTempDescendant(fixture.workspace_root);
  if (!resolve(workspaceRoot).startsWith(resolve(tmpdir(), TEMP_PREFIX))) {
    fail("synthetic_recovery_canary_fixture_descriptor_invalid");
  }
  await rm(workspaceRoot, { recursive: true, force: true });
}

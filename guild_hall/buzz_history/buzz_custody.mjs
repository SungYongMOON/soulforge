// Private custody primitives for the Buzz collection lane (Tributary).
//
// Byte-for-byte the Linear lane's custody contract with one renamed error
// class: every persistent path is resolved under one absolute private root,
// reparse points are refused, state files are written atomically,
// content-addressed objects are create-only, and the writer lease is
// fail-closed (never guessed stale, never auto-deleted).

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

import { canonicalJson } from "../shared/project_history_envelope.mjs";

export class BuzzCustodyError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "BuzzCustodyError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new BuzzCustodyError(code, target, message);
}

export function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function canonicalBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

async function chmodPrivateBestEffort(target) {
  try {
    await chmod(target, 0o600);
  } catch (error) {
    if (!["EACCES", "ENOSYS", "EPERM"].includes(error?.code)) throw error;
  }
}

export async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function assertNoReparseComponents(target, label = target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await lstatOrNull(current);
    if (stat === null) break;
    if (stat.isSymbolicLink()) {
      fail("reparse_path_forbidden", label, "Symbolic links and junctions are not custody paths");
    }
  }
  return absolute;
}

export async function preparePrivateDataRoot(dataRoot) {
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) {
    fail("absolute_data_root_required", "$data_root", "Private custody requires an absolute path");
  }
  const absolute = await assertNoReparseComponents(dataRoot, "$data_root");
  await mkdir(absolute, { recursive: true });
  await assertNoReparseComponents(absolute, "$data_root");
  const canonicalRoot = await realpath(absolute);
  if (path.resolve(canonicalRoot) !== path.resolve(absolute)) {
    fail("reparse_path_forbidden", "$data_root", "Data root must not resolve through an alias");
  }
  return canonicalRoot;
}

export async function resolveGuardedPrivatePath(dataRoot, ...segments) {
  const root = await preparePrivateDataRoot(dataRoot);
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("path_escape_forbidden", "$target", "Target escapes the private data root");
  }
  await assertNoReparseComponents(path.dirname(target), "$target");
  return target;
}

export async function atomicWritePrivateJson(dataRoot, relativeSegments, value) {
  const target = await resolveGuardedPrivatePath(dataRoot, ...relativeSegments);
  await mkdir(path.dirname(target), { recursive: true });
  await assertNoReparseComponents(path.dirname(target), "$target");
  const bytes = canonicalBytes(value);
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  await chmodPrivateBestEffort(target);
  return { path: target, digest: sha256Bytes(bytes) };
}

export async function readPrivateJson(dataRoot, relativeSegments) {
  const target = await resolveGuardedPrivatePath(dataRoot, ...relativeSegments);
  const before = await lstatOrNull(target);
  if (before === null) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    fail("custody_read_target_invalid", "$target", "Persistent state must be a single-link regular file");
  }
  const canonical = await realpath(target);
  if (path.resolve(canonical) !== path.resolve(target)) {
    fail("custody_read_target_invalid", "$target", "Persistent state must not resolve through an alias");
  }
  const handle = await open(target, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1
      || String(opened.dev) !== String(before.dev)
      || String(opened.ino) !== String(before.ino)
      || opened.size !== before.size
      || opened.mtimeMs !== before.mtimeMs) {
      fail("custody_read_identity_changed", "$target", "Persistent state changed before open");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (String(after.dev) !== String(opened.dev)
      || String(after.ino) !== String(opened.ino)
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs) {
      fail("custody_read_identity_changed", "$target", "Persistent state changed while read");
    }
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("custody_state_invalid_json", "$target", "Persistent state is not valid JSON");
    }
  } finally {
    await handle.close();
  }
  return null;
}

// Create-only publication of one immutable JSON object. The relative target
// must already embed the content digest, so an existing file with identical
// bytes is an idempotent no-op and an existing file with different bytes is a
// custody conflict. Nothing is ever overwritten.
export async function writeCreateOnlyJson(dataRoot, relativeSegments, value) {
  const bytes = canonicalBytes(value);
  const digest = sha256Bytes(bytes);
  const target = await resolveGuardedPrivatePath(dataRoot, ...relativeSegments);
  const existing = await lstatOrNull(target);
  if (existing !== null) {
    if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1) {
      fail("custody_target_invalid", "$target", "Existing custody target is not a single-link regular file");
    }
    const retained = await readFile(target);
    if (retained.length !== bytes.length || sha256Bytes(retained) !== digest) {
      fail("custody_digest_conflict", "$target", "Existing custody object has different bytes");
    }
    return { created: false, path: target, digest, size_bytes: bytes.length };
  }
  await mkdir(path.dirname(target), { recursive: true });
  await assertNoReparseComponents(path.dirname(target), "$target");
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  let created = false;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      // A hard link publishes the fsynced bytes only when no object exists
      // at the target; a concurrent creator surfaces as EEXIST and is then
      // byte-compared instead of being overwritten.
      await link(temporary, target);
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const retained = await readFile(target);
      if (retained.length !== bytes.length || sha256Bytes(retained) !== digest) {
        fail("custody_digest_conflict", "$target", "Concurrent custody object has different bytes");
      }
    }
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
  await chmodPrivateBestEffort(target);
  return { created, path: target, digest, size_bytes: bytes.length };
}

export async function acquireExclusiveLease({
  state_root: stateRoot,
  lease_name: leaseName,
  payload,
}) {
  const target = await resolveGuardedPrivatePath(stateRoot, "leases", leaseName);
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(target, "wx", 0o600);
    await handle.writeFile(canonicalBytes({ ...payload, pid: process.pid }));
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code === "EEXIST") {
      fail("lease_unavailable", "$state_root", "Another writer already owns the lease");
    }
    throw error;
  }
  let released = false;
  return {
    path: target,
    async release() {
      if (released) return;
      released = true;
      await handle.close();
      await rm(target, { force: true });
    },
  };
}

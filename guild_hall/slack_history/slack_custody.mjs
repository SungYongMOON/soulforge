import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

export class SlackCustodyError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "SlackCustodyError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new SlackCustodyError(code, target, message);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoReparseComponents(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  const relative = absolute.slice(parsed.root.length);
  let current = parsed.root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await lstatOrNull(current);
    if (stat === null) break;
    if (stat.isSymbolicLink()) {
      fail("reparse_path_forbidden", current, "Symbolic links and junctions are not custody paths");
    }
  }
  return absolute;
}

export async function preparePrivateDataRoot(dataRoot) {
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) {
    fail("absolute_data_root_required", "$data_root", "Private custody requires an absolute path");
  }
  const absolute = await assertNoReparseComponents(dataRoot);
  await mkdir(absolute, { recursive: true });
  await assertNoReparseComponents(absolute);
  const canonicalRoot = await realpath(absolute);
  if (path.resolve(canonicalRoot) !== path.resolve(absolute)) {
    fail("reparse_path_forbidden", absolute, "Data root must not resolve through an alias");
  }
  return canonicalRoot;
}

export async function resolveGuardedPrivatePath(dataRoot, ...segments) {
  const root = await preparePrivateDataRoot(dataRoot);
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("path_escape_forbidden", target, "Target escapes the private data root");
  }
  await assertNoReparseComponents(path.dirname(target));
  return target;
}

export async function atomicWritePrivateJson(dataRoot, relativeSegments, value, options = {}) {
  const target = await resolveGuardedPrivatePath(dataRoot, ...relativeSegments);
  await mkdir(path.dirname(target), { recursive: true });
  await assertNoReparseComponents(path.dirname(target));
  const bytes = Buffer.from(`${canonicalize(value)}\n`, "utf8");
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (options.fail_before_rename === true) {
      fail("injected_atomic_failure", target, "Synthetic failure before atomic rename");
    }
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return { path: target, digest: sha256Bytes(bytes) };
}

export async function readPrivateJson(dataRoot, relativeSegments) {
  const target = await resolveGuardedPrivatePath(dataRoot, ...relativeSegments);
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeRawEventToCustody({ data_root: dataRoot, raw_event: rawEvent }) {
  const bytes = Buffer.from(canonicalize(rawEvent), "utf8");
  const digest = sha256Bytes(bytes);
  const hex = digest.slice("sha256:".length);
  const relative = ["raw", "sha256", hex.slice(0, 2), `${hex}.json`];
  const target = await resolveGuardedPrivatePath(dataRoot, ...relative);
  const existing = await lstatOrNull(target);
  if (existing !== null) {
    if (!existing.isFile() || existing.isSymbolicLink()) {
      fail("custody_target_invalid", target, "Existing content-addressed target is not a regular file");
    }
    const existingBytes = await readFile(target);
    if (sha256Bytes(existingBytes) !== digest) {
      fail("custody_digest_conflict", target, "Existing content-addressed object has different bytes");
    }
  } else {
    await mkdir(path.dirname(target), { recursive: true });
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
      if (error?.code !== "EEXIST") throw error;
    }
  }
  return {
    raw_digest: digest,
    raw_ref: `slack-raw:${hex}`,
  };
}

export async function acquireExclusiveLease({
  data_root: dataRoot,
  binding_digest: bindingDigest,
  authority_id: authorityId,
  epoch,
}) {
  const target = await resolveGuardedPrivatePath(dataRoot, "leases", "slack-continuous.lock");
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(target, "wx", 0o600);
    await handle.writeFile(`${canonicalize({
      binding_digest: bindingDigest,
      authority_id: authorityId,
      epoch,
      pid: process.pid,
    })}\n`);
    await handle.sync();
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code === "EEXIST") {
      fail("exclusive_lease_unavailable", target, "Another writer already owns the lease");
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

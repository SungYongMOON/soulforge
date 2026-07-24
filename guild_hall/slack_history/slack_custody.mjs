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

async function chmodPrivateBestEffort(target) {
  try {
    await chmod(target, 0o600);
  } catch (error) {
    if (!["EACCES", "ENOSYS", "EPERM"].includes(error?.code)) throw error;
  }
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
  let before;
  try {
    before = await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    fail("custody_read_target_invalid", target, "Persistent state must be a single-link regular file");
  }
  const canonical = await realpath(target);
  if (path.resolve(canonical) !== path.resolve(target)) {
    fail("custody_read_target_invalid", target, "Persistent state must not resolve through an alias");
  }
  const handle = await open(target, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1
      || String(opened.dev) !== String(before.dev)
      || String(opened.ino) !== String(before.ino)
      || opened.size !== before.size
      || opened.mtimeMs !== before.mtimeMs) {
      fail("custody_read_identity_changed", target, "Persistent state changed before open");
    }
    const bytes = await handle.readFile();
    const afterHandle = await handle.stat();
    const afterPath = await lstat(target);
    if (!afterPath.isFile() || afterPath.isSymbolicLink() || afterPath.nlink !== 1
      || String(afterHandle.dev) !== String(opened.dev)
      || String(afterHandle.ino) !== String(opened.ino)
      || afterHandle.size !== opened.size
      || afterHandle.mtimeMs !== opened.mtimeMs
      || String(afterPath.dev) !== String(opened.dev)
      || String(afterPath.ino) !== String(opened.ino)
      || afterPath.size !== opened.size
      || afterPath.mtimeMs !== opened.mtimeMs) {
      fail("custody_read_identity_changed", target, "Persistent state changed while read");
    }
    return JSON.parse(bytes.toString("utf8"));
  } finally {
    await handle.close();
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

async function installImmutableBytes(target, bytes, digest) {
  const existing = await lstatOrNull(target);
  if (existing !== null) {
    if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1) {
      fail("custody_target_invalid", target, "Existing custody target is not a single-link regular file");
    }
    const retained = await readFile(target);
    if (retained.length !== bytes.length || sha256Bytes(retained) !== digest) {
      fail("custody_digest_conflict", target, "Existing content-addressed object has different bytes");
    }
    await chmodPrivateBestEffort(target);
    return false;
  }

  await mkdir(path.dirname(target), { recursive: true });
  await assertNoReparseComponents(path.dirname(target));
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    let installed = false;
    try {
      await link(temporary, target);
      installed = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const retained = await readFile(target);
      if (retained.length !== bytes.length || sha256Bytes(retained) !== digest) {
        fail("custody_digest_conflict", target, "Concurrent content-addressed object has different bytes");
      }
    }
    await chmodPrivateBestEffort(target);
    return installed;
  } finally {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function removeExactCreatedFile(target, expectedDigest) {
  const retained = await lstatOrNull(target);
  if (retained === null) return;
  if (!retained.isFile() || retained.isSymbolicLink() || retained.nlink !== 1) {
    fail("custody_rollback_target_invalid", target, "Created custody target changed before rollback");
  }
  const bytes = await readFile(target);
  if (sha256Bytes(bytes) !== expectedDigest) {
    fail("custody_rollback_digest_mismatch", target, "Created custody target changed before rollback");
  }
  await rm(target);
}

function slackHostedFileReceipt({
  file_id: fileId,
  revision_ref: revisionRef,
  bytes,
  mime_type: mimeType,
}) {
  if (typeof fileId !== "string" || !/^F[A-Z0-9]{2,31}$/u.test(fileId)) {
    fail("slack_file_id_invalid", "$file_id", "Expected a stable Slack file ID");
  }
  if (typeof revisionRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u.test(revisionRef)) {
    fail("slack_file_revision_invalid", "$revision_ref", "Expected an opaque file revision reference");
  }
  if (typeof mimeType !== "string"
    || !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u.test(mimeType)) {
    fail("slack_file_mime_invalid", "$mime_type", "Expected a canonical MIME type");
  }
  if (!(bytes instanceof Uint8Array)) {
    fail("slack_file_bytes_invalid", "$bytes", "Expected a bounded byte buffer");
  }
  const retainedBytes = Buffer.from(bytes);
  const digest = sha256Bytes(retainedBytes);
  return {
    bytes: retainedBytes,
    receipt: {
      file_id: fileId,
      revision_ref: revisionRef,
      content_sha256: digest,
      size_bytes: retainedBytes.length,
      mime_type: mimeType,
      pointer_ref: `slack-file-sha256:${digest.slice("sha256:".length)}`,
    },
  };
}

export async function writeSlackHostedFilesToCustodyAtomically({
  custody_root: custodyRoot,
  files,
}) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 20) {
    fail("slack_file_batch_invalid", "$files", "Expected one bounded message attachment batch");
  }
  const prepared = files.map(slackHostedFileReceipt);
  const fileIds = new Set();
  for (const { receipt } of prepared) {
    if (fileIds.has(receipt.file_id)) {
      fail("slack_file_identity_conflict", "$files", "One message cannot bind a Slack file ID twice");
    }
    fileIds.add(receipt.file_id);
  }

  const planned = [];
  const plannedByTarget = new Map();
  for (const { bytes, receipt } of prepared) {
    const hex = receipt.content_sha256.slice("sha256:".length);
    const contentTarget = await resolveGuardedPrivatePath(
      custodyRoot,
      "sha256",
      hex.slice(0, 2),
      `${hex}.bin`,
    );
    const indexTarget = await resolveGuardedPrivatePath(
      custodyRoot,
      "file_ids",
      `${receipt.file_id}.json`,
    );
    const indexBytes = Buffer.from(`${canonicalize(receipt)}\n`, "utf8");
    for (const entry of [
      { target: contentTarget, bytes, digest: receipt.content_sha256 },
      { target: indexTarget, bytes: indexBytes, digest: sha256Bytes(indexBytes) },
    ]) {
      const retained = plannedByTarget.get(entry.target);
      if (retained !== undefined) {
        if (retained.digest !== entry.digest) {
          fail("slack_file_identity_conflict", entry.target, "One transaction planned different bytes for one custody path");
        }
        continue;
      }
      plannedByTarget.set(entry.target, entry);
      planned.push(entry);
    }
  }

  for (const entry of planned) {
    const existing = await lstatOrNull(entry.target);
    if (existing === null) continue;
    if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1) {
      fail("custody_target_invalid", entry.target, "Existing custody target is not a single-link regular file");
    }
    const retained = await readFile(entry.target);
    if (sha256Bytes(retained) !== entry.digest) {
      const isIndex = path.basename(path.dirname(entry.target)) === "file_ids";
      fail(
        isIndex ? "slack_file_identity_conflict" : "custody_digest_conflict",
        entry.target,
        "Existing custody object differs from the planned transaction",
      );
    }
  }

  const created = [];
  let finalized = false;
  try {
    for (const entry of planned) {
      if (await installImmutableBytes(entry.target, entry.bytes, entry.digest)) {
        created.push(entry);
      }
    }
  } catch (error) {
    for (const entry of [...created].reverse()) {
      await removeExactCreatedFile(entry.target, entry.digest);
    }
    throw error;
  }
  return {
    receipts: prepared.map(({ receipt }) => receipt),
    private_writes: created.length,
    async finalize() {
      finalized = true;
    },
    async rollback() {
      if (finalized) {
        fail("custody_transaction_finalized", "$transaction", "Finalized custody cannot be rolled back");
      }
      for (const entry of [...created].reverse()) {
        await removeExactCreatedFile(entry.target, entry.digest);
      }
      created.length = 0;
    },
  };
}

export async function writeSlackHostedFileToCustody({
  custody_root: custodyRoot,
  file_id: fileId,
  revision_ref: revisionRef,
  bytes,
  mime_type: mimeType,
}) {
  const transaction = await writeSlackHostedFilesToCustodyAtomically({
    custody_root: custodyRoot,
    files: [{
      file_id: fileId,
      revision_ref: revisionRef,
      bytes,
      mime_type: mimeType,
    }],
  });
  await transaction.finalize();
  return transaction.receipts[0];
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

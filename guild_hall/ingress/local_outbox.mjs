import { constants } from "node:fs";
import {
  copyFile,
  link,
  lstat,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const LOCAL_OUTBOX_BINDING_SCHEMA = "soulforge.ingress.local_outbox_binding.v1";
export const LOCAL_OUTBOX_RECEIPT_SCHEMA = "soulforge.ingress.local_outbox_receipt.v1";
export const LOCAL_OUTBOX_RUN_SCHEMA = "soulforge.ingress.local_outbox_run.v1";

const LANES = ["team_files", "structured_pc_work", "run_logs"];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const TOP_FIELDS = ["schema_version", "node_id", "outbox_root", "lanes"];
const LANE_FIELDS = ["enabled", "queue_root", "source_owner_ref"];
const RECEIPT_FIELDS = [
  "schema_version",
  "lane",
  "node_id",
  "source_owner_ref",
  "occurrence_id",
  "sha256",
  "size",
  "payload_ref",
  "project_state",
  "source_deleted",
  "source_overwritten",
  "server_ack_state",
];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function comparable(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function exactFields(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertNormalDirectory(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(code);
  if (comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
}

async function assertNormalFile(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail(code);
  if (comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
}

async function assertDirectoryChain(root, target) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (!inside(rootPath, targetPath)) fail("local_outbox_path_escape");
  await assertNormalDirectory(rootPath, "local_outbox_root_unsafe");
  let current = rootPath;
  for (const part of relative(rootPath, targetPath).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    await assertNormalDirectory(current, "local_outbox_directory_unsafe");
  }
}

async function readJson(path, code) {
  await assertNormalFile(path, code);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(code);
  }
}

export async function loadLocalOutboxBinding(bindingPath) {
  if (typeof bindingPath !== "string" || !isAbsolute(bindingPath)) fail("local_outbox_binding_absolute_required");
  const raw = await readJson(resolve(bindingPath), "invalid_local_outbox_binding");
  exactFields(raw, TOP_FIELDS, "invalid_local_outbox_binding");
  if (raw.schema_version !== LOCAL_OUTBOX_BINDING_SCHEMA) fail("invalid_local_outbox_binding");
  const outboxRoot = typeof raw.outbox_root === "string" && isAbsolute(raw.outbox_root)
    ? resolve(raw.outbox_root)
    : fail("invalid_local_outbox_binding");
  await assertNormalDirectory(outboxRoot, "local_outbox_root_unsafe");
  exactFields(raw.lanes, LANES, "invalid_local_outbox_binding");
  const lanes = {};
  for (const lane of LANES) {
    const value = raw.lanes[lane];
    exactFields(value, LANE_FIELDS, "invalid_local_outbox_binding");
    if (typeof value.enabled !== "boolean" || typeof value.queue_root !== "string" || !isAbsolute(value.queue_root)) {
      fail("invalid_local_outbox_binding");
    }
    const queueRoot = resolve(value.queue_root);
    if (!inside(outboxRoot, queueRoot) || queueRoot === outboxRoot) fail("invalid_local_outbox_binding");
    await assertDirectoryChain(outboxRoot, queueRoot);
    lanes[lane] = {
      enabled: value.enabled,
      queueRoot,
      sourceOwnerRef: safeId(value.source_owner_ref, "invalid_local_outbox_binding"),
    };
  }
  return {
    schemaVersion: LOCAL_OUTBOX_BINDING_SCHEMA,
    nodeId: safeId(raw.node_id, "invalid_local_outbox_binding"),
    outboxRoot,
    lanes,
  };
}

async function sourceIdentity(path) {
  const value = await stat(path, { bigint: true });
  if (!value.isFile()) fail("local_outbox_source_not_regular_file");
  return value;
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function hashFile(path) {
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function stableDigest(path) {
  const before = await sourceIdentity(path);
  const sha256 = await hashFile(path);
  const after = await sourceIdentity(path);
  if (!sameIdentity(before, after)) fail("local_outbox_source_unstable");
  if (after.size > BigInt(Number.MAX_SAFE_INTEGER)) fail("local_outbox_source_too_large");
  return { sha256, size: Number(after.size), identity: after };
}

function exactObject(value, expected, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = [...fields].sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && fields.every((field) => value[field] === expected[field]);
}

async function inspectExistingPayload(root, path, expected) {
  if (!(await exists(path))) return false;
  await assertDirectoryChain(root, dirname(path));
  await assertNormalFile(path, "local_outbox_payload_unsafe");
  const actual = await stableDigest(path);
  if (actual.sha256 !== expected.sha256 || actual.size !== expected.size) fail("local_outbox_occurrence_conflict");
  return true;
}

async function inspectExistingReceipt(root, path, expected) {
  if (!(await exists(path))) return false;
  await assertDirectoryChain(root, dirname(path));
  const actual = await readJson(path, "local_outbox_receipt_invalid");
  if (!exactObject(actual, expected, RECEIPT_FIELDS)) fail("local_outbox_receipt_conflict");
  return true;
}

async function installImmutableCopy(root, source, target, expected) {
  const before = await sourceIdentity(source);
  if (!sameIdentity(before, expected.identity)) fail("local_outbox_source_unstable");
  const temporary = `${target}.partial-${randomUUID()}`;
  try {
    await assertDirectoryChain(root, dirname(target));
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    const copied = await stableDigest(temporary);
    const after = await sourceIdentity(source);
    if (!sameIdentity(after, expected.identity)
      || copied.sha256 !== expected.sha256
      || copied.size !== expected.size) fail("local_outbox_source_unstable");
    try {
      await link(temporary, target);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await inspectExistingPayload(root, target, expected);
      return false;
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function installImmutableReceipt(root, target, receipt) {
  const temporary = `${target}.partial-${randomUUID()}`;
  try {
    await assertDirectoryChain(root, dirname(target));
    await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await link(temporary, target);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await inspectExistingReceipt(root, target, receipt);
      return false;
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function enqueueLocalOutboxFile(options = {}) {
  const binding = await loadLocalOutboxBinding(options.bindingPath);
  const lane = String(options.lane || "");
  const laneBinding = binding.lanes[lane];
  if (!laneBinding || !laneBinding.enabled) fail("local_outbox_lane_disabled");
  const occurrenceId = safeId(options.occurrenceId, "invalid_local_outbox_occurrence_id");
  if (typeof options.source !== "string" || !isAbsolute(options.source)) fail("local_outbox_source_absolute_required");
  const source = resolve(options.source);
  await assertNormalFile(source, "local_outbox_source_unsafe");
  if (inside(binding.outboxRoot, source)) fail("local_outbox_source_overlap");
  const digest = await stableDigest(source);
  const payloadRef = `${lane}/${occurrenceId}.payload`;
  const payloadPath = resolve(laneBinding.queueRoot, `${occurrenceId}.payload`);
  const receiptPath = resolve(binding.outboxRoot, "state", "receipts", lane, `${occurrenceId}.json`);
  await assertDirectoryChain(binding.outboxRoot, dirname(receiptPath));
  const receipt = {
    schema_version: LOCAL_OUTBOX_RECEIPT_SCHEMA,
    lane,
    node_id: binding.nodeId,
    source_owner_ref: laneBinding.sourceOwnerRef,
    occurrence_id: occurrenceId,
    sha256: digest.sha256,
    size: digest.size,
    payload_ref: payloadRef,
    project_state: "unclassified",
    source_deleted: false,
    source_overwritten: false,
    server_ack_state: "pending",
  };
  const payloadExists = await inspectExistingPayload(binding.outboxRoot, payloadPath, digest);
  const receiptExists = await inspectExistingReceipt(binding.outboxRoot, receiptPath, receipt);
  let writesPerformed = 0;
  if (options.apply === true) {
    if (!payloadExists && await installImmutableCopy(binding.outboxRoot, source, payloadPath, digest)) writesPerformed += 1;
    if (!receiptExists && await installImmutableReceipt(binding.outboxRoot, receiptPath, receipt)) writesPerformed += 1;
  }
  return {
    schema_version: LOCAL_OUTBOX_RUN_SCHEMA,
    mode: options.apply === true ? "apply" : "dry_run",
    status: payloadExists && receiptExists ? "unchanged" : options.apply === true ? "enqueued" : "planned",
    lane,
    sha256: digest.sha256,
    size: digest.size,
    project_state: "unclassified",
    server_ack_state: "pending",
    writes_performed: writesPerformed,
    source_deleted: false,
    source_overwritten: false,
    official_history_written: false,
  };
}

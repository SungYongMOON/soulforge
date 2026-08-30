import { createHash } from "node:crypto";
import { constants as FS_CONSTANTS } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, normalize, relative, resolve } from "node:path";

import { deserializeBackupRunV2 } from "./linear_lb1_v2.mjs";
import {
  buildLinearLb1ProjectIndex,
  verifyLinearLb1ProjectIndex,
} from "./linear_lb1_project_index.mjs";

export const LINEAR_LB1_PROJECT_INDEX_BACKFILL_RECEIPT_SCHEMA =
  "soulforge.backup_controller.linear_lb1.project_index_backfill_receipt.v0";

const HASH_REF = /^sha256:[a-f0-9]{64}$/u;
const INPUT_KEYS = Object.freeze([
  "expected_generation_digest", "expected_manifest_sha256", "restore_run_path",
  "source_generation_receipt_path", "source_run_path",
]);

export class LinearLb1ProjectIndexBackfillError extends Error {
  constructor(code) {
    super(code);
    this.name = "LinearLb1ProjectIndexBackfillError";
    this.code = code;
  }
}

function fail(code) { throw new LinearLb1ProjectIndexBackfillError(code); }
function codepointCompare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(codepointCompare)
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256Bytes(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function exactInput(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === INPUT_KEYS.length
    && INPUT_KEYS.every((key) => Object.hasOwn(value, key));
}
function safeAbsolutePath(value) {
  if (typeof value !== "string" || !isAbsolute(value) || normalize(value) !== value
      || value.includes("\0") || /^(?:\\\\|\/\/)/u.test(value)) return null;
  if (process.platform === "win32" && /:(?:[^\\/]|$)/u.test(value.slice(2))) return null;
  return resolve(value);
}
function overlaps(left, right) {
  const l = process.platform === "win32" ? left.toLowerCase() : left;
  const r = process.platform === "win32" ? right.toLowerCase() : right;
  const lr = relative(l, r);
  const rl = relative(r, l);
  return lr === "" || (!lr.startsWith("..") && !isAbsolute(lr))
    || (!rl.startsWith("..") && !isAbsolute(rl));
}
async function readPinnedRegularFile(path, expectedBaseName, code) {
  if (basename(path) !== expectedBaseName) fail(code);
  let stat;
  let real;
  try { stat = await lstat(path); real = await realpath(path); }
  catch { fail(code); }
  const expected = process.platform === "win32" ? path.toLowerCase() : path;
  const actual = process.platform === "win32" ? real.toLowerCase() : real;
  if (!stat.isFile() || stat.isSymbolicLink() || expected !== actual) fail(code);
  try { return await readFile(path); } catch { fail(code); }
}
async function createOrVerify(path, bytes) {
  let state;
  try {
    const handle = await open(path, FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    state = "created";
  } catch (error) {
    if (error?.code !== "EEXIST") fail("linear_lb1_project_index_backfill_write_failed");
    let existing;
    try { existing = await readFile(path); } catch { fail("linear_lb1_project_index_backfill_conflict"); }
    if (existing.length !== bytes.length || sha256Bytes(existing) !== sha256Bytes(bytes)) {
      fail("linear_lb1_project_index_backfill_conflict");
    }
    state = "replayed";
  }
  let readback;
  try { readback = await readFile(path); }
  catch { fail("linear_lb1_project_index_backfill_readback_failed"); }
  if (readback.length !== bytes.length || sha256Bytes(readback) !== sha256Bytes(bytes)) {
    fail("linear_lb1_project_index_backfill_readback_failed");
  }
  return state;
}

export async function backfillLinearLb1ProjectIndex(input) {
  if (!exactInput(input) || !HASH_REF.test(input.expected_generation_digest)
      || !HASH_REF.test(input.expected_manifest_sha256)) {
    fail("linear_lb1_project_index_backfill_input_invalid");
  }
  const sourceRunPath = safeAbsolutePath(input.source_run_path);
  const sourceReceiptPath = safeAbsolutePath(input.source_generation_receipt_path);
  const restoreRunPath = safeAbsolutePath(input.restore_run_path);
  if (!sourceRunPath || !sourceReceiptPath || !restoreRunPath
      || dirname(sourceRunPath) !== dirname(sourceReceiptPath)
      || overlaps(dirname(sourceRunPath), dirname(restoreRunPath))) {
    fail("linear_lb1_project_index_backfill_path_invalid");
  }
  const sourceBytes = await readPinnedRegularFile(
    sourceRunPath, "run.json", "linear_lb1_project_index_backfill_source_invalid",
  );
  const restoreBytes = await readPinnedRegularFile(
    restoreRunPath, "run.json", "linear_lb1_project_index_backfill_restore_invalid",
  );
  const receiptBytes = await readPinnedRegularFile(
    sourceReceiptPath, "receipt.json", "linear_lb1_project_index_backfill_receipt_invalid",
  );
  const generationDigest = `sha256:${sha256Bytes(sourceBytes)}`;
  if (generationDigest !== input.expected_generation_digest
      || restoreBytes.length !== sourceBytes.length
      || sha256Bytes(restoreBytes) !== sha256Bytes(sourceBytes)) {
    fail("linear_lb1_project_index_backfill_generation_mismatch");
  }
  let sourceReceipt;
  try { sourceReceipt = JSON.parse(receiptBytes.toString("utf8")); }
  catch { fail("linear_lb1_project_index_backfill_receipt_invalid"); }
  if (sourceReceipt?.generation_digest !== generationDigest
      || `sha256:${sourceReceipt?.manifest_sha256}` !== input.expected_manifest_sha256
      || sourceReceipt?.exact_byte_readback !== true
      || sourceReceipt?.overwrite_allowed !== false
      || sourceReceipt?.prune_or_delete_allowed !== false) {
    fail("linear_lb1_project_index_backfill_receipt_invalid");
  }
  let run;
  let restoredRun;
  try { run = deserializeBackupRunV2(sourceBytes); restoredRun = deserializeBackupRunV2(restoreBytes); }
  catch { fail("linear_lb1_project_index_backfill_generation_invalid"); }
  if (run.revision === null || restoredRun.revision === null
      || run.manifest.manifest_sha256 !== restoredRun.manifest.manifest_sha256
      || `sha256:${run.manifest.manifest_sha256}` !== input.expected_manifest_sha256
      || sourceReceipt.manifest_sha256 !== run.manifest.manifest_sha256) {
    fail("linear_lb1_project_index_backfill_generation_invalid");
  }
  const binding = {
    source_generation_digest: generationDigest,
    source_manifest_sha256: input.expected_manifest_sha256,
  };
  const index = buildLinearLb1ProjectIndex(run.revision.snapshot, binding);
  if (!verifyLinearLb1ProjectIndex(index, restoredRun.revision.snapshot, binding)) {
    fail("linear_lb1_project_index_backfill_restore_mismatch");
  }
  const indexBytes = Buffer.from(`${stableJson(index)}\n`, "utf8");
  const indexFileSha256 = `sha256:${sha256Bytes(indexBytes)}`;
  const receiptBody = {
    schema_version: LINEAR_LB1_PROJECT_INDEX_BACKFILL_RECEIPT_SCHEMA,
    status: "PROJECT_INDEX_TECHNICAL_RESTORE_CANDIDATE",
    source_generation_digest: generationDigest,
    source_manifest_sha256: input.expected_manifest_sha256,
    project_index_sha256: index.project_index_sha256,
    project_index_file_sha256: indexFileSha256,
    project_count: index.project_count,
    total_issue_count: index.total_issue_count,
    classified_issue_count: index.classified_issue_count,
    unassigned_issue_count: index.unassigned_issue_count,
    source_exact_byte_readback: true,
    restore_exact_byte_readback: true,
    project_index_parity_complete: true,
    source_generation_modified: false,
    official_task_done: false,
    human_acceptance: false,
    claim_ceiling: "technical_project_index_restore_candidate_only",
  };
  const outputReceipt = deepFreeze({
    ...receiptBody,
    receipt_sha256: `sha256:${sha256Bytes(Buffer.from(stableJson(receiptBody), "utf8"))}`,
  });
  const outputReceiptBytes = Buffer.from(`${stableJson(outputReceipt)}\n`, "utf8");
  const restoreIndexState = await createOrVerify(resolve(dirname(restoreRunPath), "project-index.json"), indexBytes);
  const sourceIndexState = await createOrVerify(resolve(dirname(sourceRunPath), "project-index.json"), indexBytes);
  const restoreReceiptState = await createOrVerify(
    resolve(dirname(restoreRunPath), "project-index-receipt.json"), outputReceiptBytes,
  );
  const sourceReceiptState = await createOrVerify(
    resolve(dirname(sourceRunPath), "project-index-receipt.json"), outputReceiptBytes,
  );
  return deepFreeze({
    ...outputReceipt,
    write_states: {
      source_index: sourceIndexState,
      restore_index: restoreIndexState,
      source_receipt: sourceReceiptState,
      restore_receipt: restoreReceiptState,
    },
  });
}

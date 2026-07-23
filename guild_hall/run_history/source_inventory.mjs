import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateWorkflowReceipt } from "../workflow_runner/contract.mjs";

export const RUN_HISTORY_SOURCE_INVENTORY_SCHEMA =
  "soulforge.run_history_source_inventory.query_only.v1";

const MAX_RECEIPTS = 256;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const MAX_STDIN_BYTES = 256 * 1024;

export class RunHistorySourceInventoryError extends Error {
  constructor(code) {
    super(code);
    this.name = "RunHistorySourceInventoryError";
    this.code = code;
  }
}

export async function inventoryRunHistorySource(input) {
  exactDescriptor(input);
  const runRoot = input.authorized_run_root;
  if (typeof runRoot !== "string" || !path.isAbsolute(runRoot)) {
    fail("run_root_invalid");
  }
  if (!Array.isArray(input.receipt_paths) || input.receipt_paths.length === 0) {
    fail("descriptor_missing");
  }
  if (input.receipt_paths.length > MAX_RECEIPTS) fail("receipt_limit_exceeded");

  const rootStat = await safeLstat(runRoot);
  if (rootStat === null) fail("run_root_not_materialized");
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail("run_root_unsafe");

  const seen = new Set();
  const observations = [];
  for (const receiptPath of input.receipt_paths) {
    if (typeof receiptPath !== "string" || !path.isAbsolute(receiptPath)) {
      fail("receipt_path_invalid");
    }
    const resolvedReceipt = path.resolve(receiptPath);
    const resolvedRoot = path.resolve(runRoot);
    const relativeReceipt = path.relative(resolvedRoot, resolvedReceipt);
    if (
      relativeReceipt === ""
      || relativeReceipt === ".."
      || relativeReceipt.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeReceipt)
      || path.basename(resolvedReceipt) !== "workflow_receipt.json"
    ) {
      fail("receipt_path_invalid");
    }
    const dedupeKey = process.platform === "win32"
      ? resolvedReceipt.toLocaleLowerCase("en-US")
      : resolvedReceipt;
    if (seen.has(dedupeKey)) fail("duplicate_receipt_path");
    seen.add(dedupeKey);

    await assertExactPathHasNoSymlink(resolvedRoot, relativeReceipt);
    const beforeStat = await safeLstat(resolvedReceipt);
    if (beforeStat === null) fail("receipt_not_materialized");
    if (beforeStat.isSymbolicLink() || !beforeStat.isFile()) fail("receipt_path_unsafe");
    if (beforeStat.size > MAX_RECEIPT_BYTES) fail("receipt_too_large");

    let receipt;
    try {
      const raw = await fs.readFile(resolvedReceipt, "utf8");
      if (Buffer.byteLength(raw) > MAX_RECEIPT_BYTES) fail("receipt_too_large");
      receipt = JSON.parse(raw);
    } catch (error) {
      if (error instanceof RunHistorySourceInventoryError) throw error;
      fail("receipt_invalid");
    }
    const afterStat = await safeLstat(resolvedReceipt);
    if (
      afterStat === null
      || afterStat.isSymbolicLink()
      || !afterStat.isFile()
      || beforeStat.size !== afterStat.size
      || beforeStat.mtimeMs !== afterStat.mtimeMs
    ) {
      fail("receipt_changed_during_read");
    }
    try {
      validateWorkflowReceipt(receipt);
    } catch {
      fail("receipt_invalid");
    }
    if (
      receipt.workflow_id !== "report_authoring_v0"
      || receipt.binding_revision !== "report_authoring_v0.binding.v1"
    ) {
      fail("receipt_binding_invalid");
    }
    observations.push({
      completed_at: receipt.completed_at,
      digest: digest(receipt),
    });
  }

  observations.sort((left, right) => left.digest.localeCompare(right.digest, "en"));
  const latestCompletedAt = observations.reduce(
    (latest, observation) => (
      latest === null || Date.parse(observation.completed_at) > Date.parse(latest)
        ? observation.completed_at
        : latest
    ),
    null,
  );
  return {
    schema_version: RUN_HISTORY_SOURCE_INVENTORY_SCHEMA,
    mode: "query_only_no_persistence",
    source_kind: "workflow_run_receipt",
    source_availability: "available",
    receipt_count: observations.length,
    latest_completed_at: latestCompletedAt,
    receipt_set_digest: digest(observations),
    mutation_proof: {
      before_after_lstat_equivalent: true,
      checked_receipt_count: observations.length,
    },
    safety: {
      exact_receipt_paths_only: true,
      directory_discovery_used: false,
      recursion_used: false,
      wildcard_used: false,
      paths_or_names_returned: false,
      receipt_ids_returned: false,
      receipt_content_returned: false,
      symlinks_or_reparse_points_followed: false,
      repository_writes: 0,
      temporary_files_created: 0,
    },
    claim_ceiling: "source_availability_metadata_only",
  };
}

async function assertExactPathHasNoSymlink(root, relativeReceipt) {
  let current = root;
  for (const segment of relativeReceipt.split(path.sep)) {
    current = path.join(current, segment);
    const stat = await safeLstat(current);
    if (stat === null) fail("receipt_not_materialized");
    if (stat.isSymbolicLink()) fail("receipt_path_unsafe");
  }
}

async function safeLstat(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("source_stat_failed");
  }
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactDescriptor(input) {
  if (
    input === null
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    fail("descriptor_invalid");
  }
  const keys = Object.keys(input).sort();
  if (
    keys.length !== 2
    || keys[0] !== "authorized_run_root"
    || keys[1] !== "receipt_paths"
  ) {
    fail("descriptor_invalid");
  }
}

async function runCli() {
  if (process.argv.length !== 2) fail("cli_arguments_forbidden");
  return inventoryRunHistorySource(await readStdin());
}

async function readStdin() {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_STDIN_BYTES) fail("descriptor_too_large");
  }
  if (!raw.trim()) fail("descriptor_missing");
  try {
    return JSON.parse(raw);
  } catch {
    fail("descriptor_invalid");
  }
}

function fail(code) {
  throw new RunHistorySourceInventoryError(code);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  runCli()
    .then((output) => {
      process.stdout.write(`${JSON.stringify(output)}\n`);
    })
    .catch((error) => {
      const errorCode = error instanceof RunHistorySourceInventoryError
        ? error.code
        : "source_query_failed";
      process.stdout.write(`${JSON.stringify({
        ok: false,
        error_code: errorCode,
        claim_ceiling: "source_availability_metadata_only",
      })}\n`);
      process.exitCode = 1;
    });
}

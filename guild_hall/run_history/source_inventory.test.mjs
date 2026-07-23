import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RunHistorySourceInventoryError,
  inventoryRunHistorySource,
} from "./source_inventory.mjs";

const CLI_PATH = fileURLToPath(new URL("./source_inventory.mjs", import.meta.url));
const RECEIPT_FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/report_authoring_receipt.synthetic.json", import.meta.url),
);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "run-history-inventory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function materializeReceipt(runRoot, runDirectory = "TOP_SECRET_RUN_ID") {
  const directory = path.join(runRoot, runDirectory);
  const receiptPath = path.join(directory, "workflow_receipt.json");
  await fs.mkdir(directory, { recursive: true });
  await fs.copyFile(RECEIPT_FIXTURE_PATH, receiptPath);
  return receiptPath;
}

function allStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

function assertCode(action, code) {
  return assert.rejects(action, (error) => {
    assert.equal(error instanceof RunHistorySourceInventoryError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test("exact report-authoring receipt fixture yields only count, latest time, and digest", async (t) => {
  const root = await fixture(t);
  const receiptPath = await materializeReceipt(root);
  const output = await inventoryRunHistorySource({
    authorized_run_root: root,
    receipt_paths: [receiptPath],
  });

  assert.equal(output.source_availability, "available");
  assert.equal(output.receipt_count, 1);
  assert.equal(output.latest_completed_at, "2026-07-20T00:01:00.000Z");
  assert.match(output.receipt_set_digest, /^[a-f0-9]{64}$/u);
  assert.equal(output.safety.exact_receipt_paths_only, true);
  assert.equal(output.safety.directory_discovery_used, false);
  assert.equal(output.safety.recursion_used, false);
  assert.equal(output.safety.wildcard_used, false);
  assert.equal(output.safety.receipt_ids_returned, false);
  assert.equal(output.safety.receipt_content_returned, false);
  assert.equal(output.mutation_proof.before_after_lstat_equivalent, true);
  assert.equal(output.mutation_proof.checked_receipt_count, 1);
  assert.equal(output.claim_ceiling, "source_availability_metadata_only");
  const strings = allStrings(output);
  for (const forbidden of [
    root,
    receiptPath,
    "TOP_SECRET_RUN_ID",
    "workflow_receipt.json",
    "synthetic-report-job-001",
    "payload:synthetic_draft",
    "actor:synthetic_requester",
  ]) {
    assert.equal(strings.some((value) => value.includes(forbidden)), false, forbidden);
  }
});

test("empty exact receipt descriptor fails closed as descriptor_missing", async (t) => {
  const root = await fixture(t);
  await assertCode(
    () => inventoryRunHistorySource({
      authorized_run_root: root,
      receipt_paths: [],
    }),
    "descriptor_missing",
  );
});

test("outside, wrongly named, duplicate, and invalid receipts are rejected without reflection", async (t) => {
  const parent = await fixture(t);
  const root = path.join(parent, "run-root");
  const outsideRoot = path.join(parent, "outside");
  await fs.mkdir(root);
  const outside = await materializeReceipt(outsideRoot, "outside-run");
  await assertCode(
    () => inventoryRunHistorySource({
      authorized_run_root: root,
      receipt_paths: [outside],
    }),
    "receipt_path_invalid",
  );

  const valid = await materializeReceipt(root);
  await assertCode(
    () => inventoryRunHistorySource({
      authorized_run_root: root,
      receipt_paths: [valid, valid],
    }),
    "duplicate_receipt_path",
  );

  const wrongName = path.join(root, "TOP_SECRET_RUN_ID", "TOP_SECRET_NAME.json");
  await fs.copyFile(RECEIPT_FIXTURE_PATH, wrongName);
  await assertCode(
    () => inventoryRunHistorySource({
      authorized_run_root: root,
      receipt_paths: [wrongName],
    }),
    "receipt_path_invalid",
  );

  const invalidPath = path.join(root, "invalid-run", "workflow_receipt.json");
  await fs.mkdir(path.dirname(invalidPath));
  await fs.writeFile(invalidPath, JSON.stringify({
    workflow_id: "TOP_SECRET_UNAPPROVED_WORKFLOW",
    binding_revision: "TOP_SECRET_BINDING",
  }));
  await assertCode(
    () => inventoryRunHistorySource({
      authorized_run_root: root,
      receipt_paths: [invalidPath],
    }),
    "receipt_invalid",
  );
});

test("symlinked receipt ancestry is rejected when symlinks are available", async (t) => {
  const root = await fixture(t);
  const realDirectory = path.join(root, "real-run");
  const linkedDirectory = path.join(root, "TOP_SECRET_LINKED_RUN");
  const receiptPath = await materializeReceipt(root, "real-run");
  try {
    await fs.symlink(
      realDirectory,
      linkedDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip("symlink creation is unavailable");
      return;
    }
    throw error;
  }
  const linkedReceipt = path.join(linkedDirectory, path.basename(receiptPath));
  await assertCode(
    () => inventoryRunHistorySource({
      authorized_run_root: root,
      receipt_paths: [linkedReceipt],
    }),
    "receipt_path_unsafe",
  );
});

test("CLI is stdin-only, rejects args non-reflectively, and creates no cwd files", async (t) => {
  const root = await fixture(t);
  const runRoot = path.join(root, "run-root");
  const receiptPath = await materializeReceipt(runRoot);
  const cwd = path.join(root, "empty-cwd");
  await fs.mkdir(cwd);
  const before = await fs.readdir(cwd);
  const descriptor = {
    authorized_run_root: runRoot,
    receipt_paths: [receiptPath],
  };

  const success = spawnSync(process.execPath, [CLI_PATH], {
    cwd,
    input: JSON.stringify(descriptor),
    encoding: "utf8",
  });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).receipt_count, 1);
  assert.deepEqual(await fs.readdir(cwd), before);

  const secretArg = `--receipt=${receiptPath}`;
  const rejected = spawnSync(process.execPath, [CLI_PATH, secretArg], {
    cwd,
    input: JSON.stringify(descriptor),
    encoding: "utf8",
  });
  assert.equal(rejected.status, 1);
  assert.equal(JSON.parse(rejected.stdout).error_code, "cli_arguments_forbidden");
  assert.equal(rejected.stdout.includes(receiptPath), false);
  assert.equal(rejected.stdout.includes(secretArg), false);
  assert.deepEqual(await fs.readdir(cwd), before);
});

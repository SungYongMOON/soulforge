import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FileActivitySourceInventoryError,
  inventoryFileActivitySource,
} from "./source_inventory.mjs";

const CLI_PATH = fileURLToPath(new URL("./source_inventory.mjs", import.meta.url));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "file-activity-inventory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function allStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

function assertCode(action, code) {
  return assert.rejects(action, (error) => {
    assert.equal(error instanceof FileActivitySourceInventoryError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test("fixed owner surfaces yield only aggregate stat metadata and ignore unrelated workspace-like files", async (t) => {
  const root = await fixture(t);
  const ownerRoot = path.join(root, "reports", "file_activity");
  const observations = path.join(ownerRoot, "observations", "node-secret", "2026", "07");
  const receipts = path.join(ownerRoot, "receipts", "2026-07");
  const unrelated = path.join(root, "_workspaces", "TOP_SECRET_WORKSPACE");
  await fs.mkdir(observations, { recursive: true });
  await fs.mkdir(receipts, { recursive: true });
  await fs.mkdir(unrelated, { recursive: true });
  await fs.writeFile(path.join(observations, "TOP_SECRET_OBSERVATION.json"), "PRIVATE_ALPHA");
  await fs.writeFile(path.join(receipts, "TOP_SECRET_RECEIPT.json"), "PRIVATE_BETA_LONGER");
  await fs.writeFile(path.join(unrelated, "TOP_SECRET_RAW.txt"), "PRIVATE_WORKSPACE_BODY");

  const output = await inventoryFileActivitySource({ authorized_metadata_root: ownerRoot });

  assert.equal(output.source_availability, "available");
  assert.equal(output.file_count, 2);
  assert.equal(output.total_size_bytes, Buffer.byteLength("PRIVATE_ALPHA") + Buffer.byteLength("PRIVATE_BETA_LONGER"));
  assert.match(output.metadata_tree_digest, /^[a-f0-9]{64}$/u);
  assert.equal(output.safety.fixed_owner_surfaces_only, true);
  assert.equal(output.safety.workspace_root_scanned, false);
  assert.equal(output.safety.file_content_read, false);
  assert.equal(output.safety.file_content_hashed, false);
  assert.equal(output.safety.paths_or_names_returned, false);
  assert.equal(output.claim_ceiling, "source_availability_metadata_only");
  const strings = allStrings(output);
  for (const forbidden of [
    root,
    "node-secret",
    "TOP_SECRET_OBSERVATION",
    "TOP_SECRET_RECEIPT",
    "PRIVATE_ALPHA",
    "PRIVATE_BETA_LONGER",
    "TOP_SECRET_WORKSPACE",
    "PRIVATE_WORKSPACE_BODY",
  ]) {
    assert.equal(strings.some((value) => value.includes(forbidden)), false, forbidden);
  }
});

test("absent authorized metadata root reports not_materialized and creates nothing", async (t) => {
  const parent = await fixture(t);
  const absent = path.join(parent, "reports", "file_activity");
  const output = await inventoryFileActivitySource({ authorized_metadata_root: absent });
  assert.equal(output.source_availability, "not_materialized");
  assert.equal(output.file_count, 0);
  assert.equal(output.total_size_bytes, 0);
  assert.equal(output.newest_modified_at, null);
  await assert.rejects(() => fs.lstat(absent), { code: "ENOENT" });
});

test("nested symlink or junction under a fixed owner surface is rejected", async (t) => {
  const parent = await fixture(t);
  const root = path.join(parent, "reports", "file_activity");
  const observations = path.join(root, "observations");
  const target = path.join(parent, "TOP_SECRET_EXTERNAL");
  await fs.mkdir(observations, { recursive: true });
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, "TOP_SECRET_TARGET.txt"), "PRIVATE_TARGET_BODY");
  const link = path.join(observations, "TOP_SECRET_LINK");
  try {
    await fs.symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip("symlink creation is unavailable");
      return;
    }
    throw error;
  }
  await assertCode(
    () => inventoryFileActivitySource({ authorized_metadata_root: root }),
    "owner_surface_symlink_forbidden",
  );
});

test("empty descriptor is rejected without reflecting fields", async () => {
  await assertCode(
    () => inventoryFileActivitySource({}),
    "descriptor_invalid",
  );
});

test("workspace or metadata parent roots cannot substitute for the exact owner root", async (t) => {
  const root = await fixture(t);
  await assertCode(
    () => inventoryFileActivitySource({ authorized_metadata_root: root }),
    "metadata_root_invalid",
  );
});

test("symlinked authorized root is rejected", async (t) => {
  const parent = await fixture(t);
  const target = path.join(parent, "real-root");
  const link = path.join(parent, "reports", "file_activity");
  await fs.mkdir(target);
  await fs.mkdir(path.dirname(link), { recursive: true });
  try {
    await fs.symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip("symlink creation is unavailable");
      return;
    }
    throw error;
  }
  await assertCode(
    () => inventoryFileActivitySource({ authorized_metadata_root: link }),
    "metadata_root_unsafe",
  );
});

test("CLI is stdin-only, does not reflect args, and writes nothing to cwd", async (t) => {
  const root = await fixture(t);
  const cwd = path.join(root, "empty-cwd");
  const metadataRoot = path.join(root, "metadata", "reports", "file_activity");
  const observations = path.join(metadataRoot, "observations", "node-01", "2026", "07");
  await fs.mkdir(cwd);
  await fs.mkdir(observations, { recursive: true });
  await fs.writeFile(path.join(observations, "TOP_SECRET.json"), "PRIVATE_BODY");
  const before = await fs.readdir(cwd);

  const success = spawnSync(process.execPath, [CLI_PATH], {
    cwd,
    input: JSON.stringify({ authorized_metadata_root: metadataRoot }),
    encoding: "utf8",
  });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).file_count, 1);
  assert.deepEqual(await fs.readdir(cwd), before);

  const secretArg = `--root=${metadataRoot}`;
  const rejected = spawnSync(process.execPath, [CLI_PATH, secretArg], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(rejected.status, 1);
  assert.equal(JSON.parse(rejected.stdout).error_code, "cli_arguments_forbidden");
  assert.equal(rejected.stdout.includes(metadataRoot), false);
  assert.equal(rejected.stdout.includes(secretArg), false);
  assert.deepEqual(await fs.readdir(cwd), before);
});

test("unexpected top-level and nested layouts fail closed instead of being recursively counted", async (t) => {
  const parent = await fixture(t);
  const root = path.join(parent, "reports", "file_activity");
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "TOP_SECRET_UNEXPECTED.txt"), "PRIVATE_BODY");
  await assertCode(
    () => inventoryFileActivitySource({ authorized_metadata_root: root }),
    "owner_layout_invalid",
  );

  await fs.rm(path.join(root, "TOP_SECRET_UNEXPECTED.txt"));
  const invalidDepth = path.join(root, "observations", "node-01", "2026");
  await fs.mkdir(invalidDepth, { recursive: true });
  await fs.writeFile(path.join(invalidDepth, "TOP_SECRET_WRONG_DEPTH.json"), "PRIVATE_BODY");
  await assertCode(
    () => inventoryFileActivitySource({ authorized_metadata_root: root }),
    "owner_layout_invalid",
  );
});

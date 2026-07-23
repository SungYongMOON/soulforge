import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  WorkSessionSourceInventoryError,
  inventoryWorkSessionSource,
} from "../src/work_session_source_inventory.mjs";

const CLI_PATH = fileURLToPath(
  new URL("../src/work_session_source_inventory.mjs", import.meta.url),
);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "work-session-inventory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, databasePath: path.join(root, "source.sqlite") };
}

function seedDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE erp_mcp_work_session (
      id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      knowledge TEXT,
      outputs_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const insert = database.prepare(
    "INSERT INTO erp_mcp_work_session(id, summary, knowledge, outputs_json, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  insert.run(
    "secret-row-id-001",
    "TOP_SECRET_SUMMARY_ALPHA",
    "TOP_SECRET_KNOWLEDGE_ALPHA",
    JSON.stringify(["C:\\private\\TOP_SECRET_OUTPUT_ALPHA.txt"]),
    "2026-07-20T00:00:00.000Z",
  );
  insert.run(
    "secret-row-id-002",
    "TOP_SECRET_SUMMARY_BETA",
    "TOP_SECRET_KNOWLEDGE_BETA",
    JSON.stringify(["/private/TOP_SECRET_OUTPUT_BETA.txt"]),
    "2026-07-21T00:00:00.000Z",
  );
  database.close();
}

function allStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

function assertCode(action, code) {
  return assert.rejects(action, (error) => {
    assert.equal(error instanceof WorkSessionSourceInventoryError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test("query-only WorkSession inventory returns only fixed aggregate metadata with zero mutation", async (t) => {
  const { databasePath } = await fixture(t);
  seedDatabase(databasePath);
  const before = await fs.readFile(databasePath);

  const output = await inventoryWorkSessionSource({ database_path: databasePath });

  assert.equal(output.source_availability, "available");
  assert.equal(output.table_present, true);
  assert.equal(output.record_count, 2);
  assert.equal(output.latest_created_at, "2026-07-21T00:00:00.000Z");
  assert.equal(output.mutation_proof.query_only_readback, 1);
  assert.equal(output.mutation_proof.total_changes, 0);
  assert.equal(output.mutation_proof.equivalent, true);
  assert.deepEqual(output.mutation_proof.fingerprints.before, output.mutation_proof.fingerprints.after);
  assert.equal(output.safety.summary_queried, false);
  assert.equal(output.safety.knowledge_queried, false);
  assert.equal(output.safety.outputs_queried, false);
  assert.equal(output.safety.lifecycle_or_outbox_constructed, false);
  assert.equal(output.safety.sidecar_files_read_or_hashed, false);
  assert.equal(output.claim_ceiling, "source_availability_metadata_only");
  assert.deepEqual(await fs.readFile(databasePath), before);
  const strings = allStrings(output);
  for (const forbidden of [
    databasePath,
    path.basename(databasePath),
    "secret-row-id-001",
    "TOP_SECRET_SUMMARY_ALPHA",
    "TOP_SECRET_KNOWLEDGE_ALPHA",
    "TOP_SECRET_OUTPUT_ALPHA",
    "erp_mcp_work_session",
  ]) {
    assert.equal(strings.some((value) => value.includes(forbidden)), false, forbidden);
  }
});

test("missing database is reported without materializing a file", async (t) => {
  const { databasePath } = await fixture(t);
  const output = await inventoryWorkSessionSource({ database_path: databasePath });
  assert.equal(output.source_availability, "not_materialized");
  assert.equal(output.table_present, false);
  assert.equal(output.record_count, 0);
  assert.equal(output.mutation_proof.query_only_readback, null);
  await assert.rejects(() => fs.lstat(databasePath), { code: "ENOENT" });
});

test("existing WAL or SHM is refused before the database is opened", async (t) => {
  const { databasePath } = await fixture(t);
  seedDatabase(databasePath);
  const walPath = `${databasePath}-wal`;
  await fs.writeFile(walPath, "TOP_SECRET_WAL_BYTES");
  const before = await fs.readFile(databasePath);
  const walBefore = await fs.readFile(walPath);

  await assertCode(
    () => inventoryWorkSessionSource({ database_path: databasePath }),
    "sqlite_wal_or_shm_present",
  );
  assert.deepEqual(await fs.readFile(databasePath), before);
  assert.deepEqual(await fs.readFile(walPath), walBefore);
  assert.equal(await fs.stat(`${databasePath}-shm`).then(() => true, () => false), false);
});

test("sidecar preflight wins before any unsafe main-file read or hash", async (t) => {
  const { databasePath } = await fixture(t);
  await fs.mkdir(databasePath);
  await fs.writeFile(`${databasePath}-shm`, "TOP_SECRET_SHM_BYTES");
  await assertCode(
    () => inventoryWorkSessionSource({ database_path: databasePath }),
    "sqlite_wal_or_shm_present",
  );
});

test("a late sidecar is refused before open without reading or hashing the sidecar", async (t) => {
  const { databasePath } = await fixture(t);
  const walPath = `${databasePath}-wal`;
  await fs.writeFile(databasePath, "NOT_A_SQLITE_DATABASE");

  const originalReadFile = fs.readFile;
  const reads = [];
  fs.readFile = async (...args) => {
    const target = path.resolve(String(args[0]));
    reads.push(target);
    const bytes = await originalReadFile(...args);
    if (target === path.resolve(databasePath)) {
      await fs.writeFile(walPath, "LATE_WAL_SENTINEL");
    }
    return bytes;
  };
  t.after(() => {
    fs.readFile = originalReadFile;
  });

  await assertCode(
    () => inventoryWorkSessionSource({ database_path: databasePath }),
    "sqlite_wal_or_shm_present",
  );
  assert.deepEqual(reads, [path.resolve(databasePath)]);
  assert.equal(reads.includes(path.resolve(walPath)), false);
});

test("empty descriptor is rejected without reflecting fields", async () => {
  await assertCode(
    () => inventoryWorkSessionSource({}),
    "descriptor_invalid",
  );
});

test("database symlink is rejected without exposing its target", async (t) => {
  const { root, databasePath } = await fixture(t);
  seedDatabase(databasePath);
  const linkPath = path.join(root, "TOP_SECRET_DB_LINK.sqlite");
  try {
    await fs.symlink(databasePath, linkPath, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip("symlink creation is unavailable");
      return;
    }
    throw error;
  }
  await assertCode(
    () => inventoryWorkSessionSource({ database_path: linkPath }),
    "source_file_unsafe",
  );
});

test("CLI accepts stdin only, rejects args non-reflectively, and leaves cwd unchanged", async (t) => {
  const { root, databasePath } = await fixture(t);
  seedDatabase(databasePath);
  const cwd = path.join(root, "empty-cwd");
  await fs.mkdir(cwd);
  const before = await fs.readdir(cwd);
  const success = spawnSync(process.execPath, [CLI_PATH], {
    cwd,
    input: JSON.stringify({ database_path: databasePath }),
    encoding: "utf8",
  });
  assert.equal(success.status, 0, success.stderr);
  const output = JSON.parse(success.stdout);
  assert.equal(output.record_count, 2);
  assert.deepEqual(await fs.readdir(cwd), before);

  const secretArg = `--database=${databasePath}`;
  const rejected = spawnSync(process.execPath, [CLI_PATH, secretArg], {
    cwd,
    input: JSON.stringify({ database_path: databasePath }),
    encoding: "utf8",
  });
  assert.equal(rejected.status, 1);
  const errorOutput = JSON.parse(rejected.stdout);
  assert.equal(errorOutput.error_code, "cli_arguments_forbidden");
  assert.equal(rejected.stdout.includes(databasePath), false);
  assert.equal(rejected.stdout.includes(secretArg), false);
  assert.deepEqual(await fs.readdir(cwd), before);
});

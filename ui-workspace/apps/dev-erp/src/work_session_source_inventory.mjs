import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export const WORK_SESSION_SOURCE_INVENTORY_SCHEMA =
  "dev_erp.work_session_source_inventory.query_only.v1";

const MAX_STDIN_BYTES = 64 * 1024;

export class WorkSessionSourceInventoryError extends Error {
  constructor(code) {
    super(code);
    this.name = "WorkSessionSourceInventoryError";
    this.code = code;
  }
}

export async function inventoryWorkSessionSource(input) {
  exactDescriptor(input);
  const databasePath = input.database_path;
  if (typeof databasePath !== "string" || !path.isAbsolute(databasePath)) {
    fail("database_path_invalid");
  }

  const preflight = await sqlitePresence(databasePath);
  if (preflight.wal.exists || preflight.shm.exists) fail("sqlite_wal_or_shm_present");
  if (!preflight.main.exists) {
    const before = emptyFingerprints();
    return result({
      sourceAvailability: "not_materialized",
      tablePresent: false,
      recordCount: 0,
      latestCreatedAt: null,
      before,
      after: before,
      queryOnly: null,
      totalChanges: null,
    });
  }
  if (preflight.main.symbolic_link || !preflight.main.regular_file) {
    fail("source_file_unsafe");
  }
  const before = await sqliteFingerprints(databasePath);
  const preopen = await sqlitePresence(databasePath);
  if (preopen.wal.exists || preopen.shm.exists) fail("sqlite_wal_or_shm_present");
  if (!preopen.main.exists || preopen.main.symbolic_link || !preopen.main.regular_file) {
    fail("source_changed_during_fingerprint");
  }

  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    database.exec("PRAGMA query_only=ON");
    const queryOnly = Number(database.prepare("PRAGMA query_only").get().query_only);
    const initialChanges = Number(
      database.prepare("SELECT total_changes() AS total_changes").get().total_changes,
    );
    if (queryOnly !== 1 || initialChanges !== 0) fail("query_only_guard_failed");

    const tablePresent = Number(
      database.prepare(
        "SELECT COUNT(*) AS table_count FROM sqlite_schema WHERE type='table' AND name='erp_mcp_work_session'",
      ).get().table_count,
    ) === 1;

    let recordCount = 0;
    let latestCreatedAt = null;
    if (tablePresent) {
      const aggregate = database.prepare(
        "SELECT COUNT(*) AS record_count, MAX(created_at) AS latest_created_at FROM erp_mcp_work_session",
      ).get();
      recordCount = Number(aggregate.record_count);
      if (!Number.isSafeInteger(recordCount) || recordCount < 0) {
        fail("source_metadata_invalid");
      }
      latestCreatedAt = normalizeTimestamp(aggregate.latest_created_at);
    }

    const totalChanges = Number(
      database.prepare("SELECT total_changes() AS total_changes").get().total_changes,
    );
    if (totalChanges !== 0) fail("zero_mutation_guard_failed");
    database.close();
    database = null;

    const postflight = await sqlitePresence(databasePath);
    if (postflight.wal.exists || postflight.shm.exists) fail("sqlite_wal_or_shm_present");
    const after = await sqliteFingerprints(databasePath);
    const finalPresence = await sqlitePresence(databasePath);
    if (finalPresence.wal.exists || finalPresence.shm.exists) {
      fail("sqlite_wal_or_shm_present");
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      fail("sqlite_fingerprint_changed");
    }
    return result({
      sourceAvailability: tablePresent ? "available" : "not_materialized",
      tablePresent,
      recordCount,
      latestCreatedAt,
      before,
      after,
      queryOnly,
      totalChanges,
    });
  } catch (error) {
    try {
      database?.close();
    } catch {}
    if (error instanceof WorkSessionSourceInventoryError) throw error;
    fail("source_query_failed");
  }
}

function result({
  sourceAvailability,
  tablePresent,
  recordCount,
  latestCreatedAt,
  before,
  after,
  queryOnly,
  totalChanges,
}) {
  return {
    schema_version: WORK_SESSION_SOURCE_INVENTORY_SCHEMA,
    mode: "query_only_no_persistence",
    source_kind: "structured_work_session",
    source_availability: sourceAvailability,
    table_present: tablePresent,
    record_count: recordCount,
    latest_created_at: latestCreatedAt,
    mutation_proof: {
      query_only_readback: queryOnly,
      total_changes: totalChanges,
      fingerprints: { before, after },
      equivalent: JSON.stringify(before) === JSON.stringify(after),
    },
    safety: {
      row_ids_returned: false,
      row_content_returned: false,
      summary_queried: false,
      knowledge_queried: false,
      outputs_queried: false,
      lifecycle_or_outbox_constructed: false,
      sidecar_files_read_or_hashed: false,
      repository_writes: 0,
      temporary_files_created: 0,
    },
    claim_ceiling: "source_availability_metadata_only",
  };
}

async function sqliteFingerprints(databasePath) {
  const absent = absentFingerprint();
  return {
    main: await fingerprint(databasePath),
    wal: { ...absent },
    shm: { ...absent },
  };
}

async function sqlitePresence(databasePath) {
  const [main, wal, shm] = await Promise.all([
    presence(databasePath),
    presence(`${databasePath}-wal`),
    presence(`${databasePath}-shm`),
  ]);
  return { main, wal, shm };
}

async function presence(target) {
  try {
    const stat = await fs.lstat(target);
    return {
      exists: true,
      symbolic_link: stat.isSymbolicLink(),
      regular_file: stat.isFile(),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { exists: false, symbolic_link: false, regular_file: false };
    }
    fail("source_stat_failed");
  }
}

function emptyFingerprints() {
  const absent = absentFingerprint();
  return {
    main: { ...absent },
    wal: { ...absent },
    shm: { ...absent },
  };
}

function absentFingerprint() {
  return { exists: false, size: null, modified_at: null, sha256: null };
}

async function fingerprint(target) {
  let first;
  try {
    first = await fs.lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { exists: false, size: null, modified_at: null, sha256: null };
    }
    fail("source_stat_failed");
  }
  if (first.isSymbolicLink() || !first.isFile()) fail("source_file_unsafe");
  let bytes;
  try {
    bytes = await fs.readFile(target);
  } catch {
    fail("source_read_failed");
  }
  const second = await fs.lstat(target);
  if (
    second.isSymbolicLink()
    || !second.isFile()
    || first.size !== second.size
    || first.mtimeMs !== second.mtimeMs
  ) {
    fail("source_changed_during_fingerprint");
  }
  return {
    exists: true,
    size: second.size,
    modified_at: second.mtime.toISOString(),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function normalizeTimestamp(value) {
  if (value === null) return null;
  if (typeof value !== "string") fail("source_metadata_invalid");
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) fail("source_metadata_invalid");
  return timestamp.toISOString();
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
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "database_path") fail("descriptor_invalid");
}

async function runCli() {
  if (process.argv.length !== 2) fail("cli_arguments_forbidden");
  const input = await readStdin();
  return inventoryWorkSessionSource(input);
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
  throw new WorkSessionSourceInventoryError(code);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  runCli()
    .then((output) => {
      process.stdout.write(`${JSON.stringify(output)}\n`);
    })
    .catch((error) => {
      const errorCode = error instanceof WorkSessionSourceInventoryError
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

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILE_ACTIVITY_SOURCE_INVENTORY_SCHEMA =
  "soulforge.file_activity_source_inventory.query_only.v1";

const MAX_ENTRIES = 10_000;
const MAX_STDIN_BYTES = 64 * 1024;
const TOP_LEVEL_NAMES = new Set([
  "observations",
  "receipts",
  "events",
  "checkpoints",
  "projections",
  "revision_state.json",
]);
const YEAR_PATTERN = /^\d{4}$/u;
const MONTH_PATTERN = /^(?:0[1-9]|1[0-2])$/u;
const YEAR_MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const JSON_FILE_PATTERN = /^[^./\\][^/\\]*\.json$/u;

export class FileActivitySourceInventoryError extends Error {
  constructor(code) {
    super(code);
    this.name = "FileActivitySourceInventoryError";
    this.code = code;
  }
}

export async function inventoryFileActivitySource(input) {
  exactDescriptor(input);
  const metadataRoot = input.authorized_metadata_root;
  if (
    typeof metadataRoot !== "string"
    || !path.isAbsolute(metadataRoot)
    || path.basename(path.normalize(metadataRoot)) !== "file_activity"
    || path.basename(path.dirname(path.normalize(metadataRoot))) !== "reports"
  ) {
    fail("metadata_root_invalid");
  }

  const rootState = await safeLstat(metadataRoot);
  if (rootState === null) return result([]);
  if (rootState.isSymbolicLink() || !rootState.isDirectory()) {
    fail("metadata_root_unsafe");
  }

  const entries = [];
  const topLevel = await readNames(metadataRoot);
  if (topLevel.some((name) => !TOP_LEVEL_NAMES.has(name))) fail("owner_layout_invalid");
  await scanObservationLayout(metadataRoot, entries);
  await scanMonthlyLayout(metadataRoot, "receipts", "monthly_0", entries);
  await scanMonthlyLayout(metadataRoot, "events", "monthly_1", entries);
  await scanMonthlyLayout(metadataRoot, "checkpoints", "monthly_2", entries);
  await scanExactFile(metadataRoot, ["revision_state.json"], "exact_0", entries);
  await scanProjectionLayout(metadataRoot, entries);
  return result(entries);
}

async function scanObservationLayout(root, entries) {
  const observations = await optionalDirectory(root, "observations");
  if (observations === null) return;
  for (const nodeName of await readNames(observations)) {
    const nodeDirectory = await requiredDirectory(observations, nodeName);
    for (const yearName of await readNames(nodeDirectory)) {
      if (!YEAR_PATTERN.test(yearName)) fail("owner_layout_invalid");
      const yearDirectory = await requiredDirectory(nodeDirectory, yearName);
      for (const monthName of await readNames(yearDirectory)) {
        if (!MONTH_PATTERN.test(monthName)) fail("owner_layout_invalid");
        const monthDirectory = await requiredDirectory(yearDirectory, monthName);
        await scanJsonFiles(
          monthDirectory,
          "observations",
          `${nodeName}/${yearName}/${monthName}`,
          entries,
        );
      }
    }
  }
}

async function scanMonthlyLayout(root, directoryName, surface, entries) {
  const ownerDirectory = await optionalDirectory(root, directoryName);
  if (ownerDirectory === null) return;
  for (const yearMonth of await readNames(ownerDirectory)) {
    if (!YEAR_MONTH_PATTERN.test(yearMonth)) fail("owner_layout_invalid");
    const monthDirectory = await requiredDirectory(ownerDirectory, yearMonth);
    await scanJsonFiles(monthDirectory, surface, yearMonth, entries);
  }
}

async function scanProjectionLayout(root, entries) {
  const projections = await optionalDirectory(root, "projections");
  if (projections === null) return;
  const names = await readNames(projections);
  if (names.some((name) => name !== "life_tree_events.json")) {
    fail("owner_layout_invalid");
  }
  await scanExactFile(projections, ["life_tree_events.json"], "exact_1", entries);
}

async function scanJsonFiles(directory, surface, prefix, entries) {
  for (const name of await readNames(directory)) {
    if (!JSON_FILE_PATTERN.test(name)) fail("owner_layout_invalid");
    const target = path.join(directory, name);
    const stat = await safeLstat(target);
    if (stat === null) fail("owner_surface_changed");
    if (stat.isSymbolicLink()) fail("owner_surface_symlink_forbidden");
    if (!stat.isFile()) fail("owner_layout_invalid");
    pushEntry(entries, {
      surface,
      relative_name: `${prefix}/${name}`,
      size: stat.size,
      modified_ms: stat.mtimeMs,
    });
  }
}

async function scanExactFile(root, segments, surface, entries) {
  const target = path.join(root, ...segments);
  const stat = await safeLstat(target);
  if (stat === null) return;
  if (stat.isSymbolicLink()) fail("owner_surface_symlink_forbidden");
  if (!stat.isFile()) fail("owner_layout_invalid");
  pushEntry(entries, {
    surface,
    relative_name: segments.join("/"),
    size: stat.size,
    modified_ms: stat.mtimeMs,
  });
}

async function optionalDirectory(root, name) {
  const target = path.join(root, name);
  const stat = await safeLstat(target);
  if (stat === null) return null;
  if (stat.isSymbolicLink()) fail("owner_surface_symlink_forbidden");
  if (!stat.isDirectory()) fail("owner_layout_invalid");
  return target;
}

async function requiredDirectory(root, name) {
  const target = path.join(root, name);
  const stat = await safeLstat(target);
  if (stat === null) fail("owner_surface_changed");
  if (stat.isSymbolicLink()) fail("owner_surface_symlink_forbidden");
  if (!stat.isDirectory()) fail("owner_layout_invalid");
  return target;
}

async function readNames(directory) {
  try {
    return (await fs.readdir(directory)).sort((left, right) => left.localeCompare(right, "en"));
  } catch {
    fail("owner_surface_stat_failed");
  }
}

function pushEntry(entries, entry) {
  if (entries.length >= MAX_ENTRIES) fail("entry_limit_exceeded");
  entries.push(entry);
}

function result(entries) {
  const sorted = [...entries].sort((left, right) => {
    const surfaceOrder = left.surface.localeCompare(right.surface, "en");
    return surfaceOrder || left.relative_name.localeCompare(right.relative_name, "en");
  });
  const newestMs = sorted.reduce(
    (latest, entry) => Math.max(latest, entry.modified_ms),
    Number.NEGATIVE_INFINITY,
  );
  return {
    schema_version: FILE_ACTIVITY_SOURCE_INVENTORY_SCHEMA,
    mode: "query_only_no_persistence",
    source_kind: "file_activity_metadata",
    source_availability: sorted.length === 0 ? "not_materialized" : "available",
    file_count: sorted.length,
    total_size_bytes: sorted.reduce((total, entry) => total + entry.size, 0),
    newest_modified_at: Number.isFinite(newestMs) ? new Date(newestMs).toISOString() : null,
    metadata_tree_digest: digest(sorted),
    safety: {
      fixed_owner_surfaces_only: true,
      workspace_root_scanned: false,
      file_content_read: false,
      file_content_hashed: false,
      paths_or_names_returned: false,
      symlinks_or_reparse_points_followed: false,
      repository_writes: 0,
      temporary_files_created: 0,
    },
    claim_ceiling: "source_availability_metadata_only",
  };
}

async function safeLstat(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("owner_surface_stat_failed");
  }
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
  if (keys.length !== 1 || keys[0] !== "authorized_metadata_root") {
    fail("descriptor_invalid");
  }
}

async function runCli() {
  if (process.argv.length !== 2) fail("cli_arguments_forbidden");
  return inventoryFileActivitySource(await readStdin());
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
  throw new FileActivitySourceInventoryError(code);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  runCli()
    .then((output) => {
      process.stdout.write(`${JSON.stringify(output)}\n`);
    })
    .catch((error) => {
      const errorCode = error instanceof FileActivitySourceInventoryError
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

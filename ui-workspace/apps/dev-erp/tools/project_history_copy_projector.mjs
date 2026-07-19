#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
  validateActualFiveLaneShadowGeneration,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";

export const PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION =
  "soulforge.project_history_copy_xlsx_input.v1";

export const PROJECT_HISTORY_COPY_COLUMNS = Object.freeze([
  "generation_id",
  "project_id",
  "classification_state",
  "event_count",
  "coverage_count",
  "ordered_event_digest",
  "source_attestation_digest",
  "raw_payload_copied",
  "accepted_history",
  "sort_ordinal",
  "occurrence_id",
  "lane",
  "event_at",
  "valid_at",
  "observed_at",
  "known_at",
  "recorded_at",
  "metadata_digest",
]);

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "binary");
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/u;
const URI_OR_PATH_PATTERN = /^(?:https?|ftp|file|mailto|urn|data):|^[A-Za-z][A-Za-z0-9+.-]*:\/\/|^[A-Za-z]:[\\/]|^\\\\|[/\\]/iu;
const PRODUCTION_PATH_SEGMENTS = new Set([
  "active",
  "current",
  "live",
  "prod",
  "production",
  "runtime",
]);
const PROJECTION_TABLES = Object.freeze([
  "project_history_generation",
  "project_history_event",
  "project_history_coverage",
]);
let expectedProjectionSchemaFingerprint = null;

export class ProjectHistoryCopyProjectionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ProjectHistoryCopyProjectionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectHistoryCopyProjectionError(code, message);
}

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("plain_object_required", `${label} must be a plain object`);
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("exact_fields_required", `${label} fields differ from the fixed contract`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", `${label} must be a canonical sha256 digest`);
  }
  return value;
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizePathForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function productionLookingPathReasons(filePath) {
  const resolved = path.resolve(filePath);
  const normalized = resolved.replace(/\\/gu, "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const reasons = [];
  const resolvedRoot = path.parse(resolved).root;
  const systemRoot = path.parse(process.env.SystemRoot ?? "").root;
  if (
    process.platform === "win32"
    && /^[a-z]:\\$/iu.test(resolvedRoot)
    && normalizePathForComparison(resolvedRoot) !== normalizePathForComparison(systemRoot)
  ) {
    reasons.push("live_drive");
  }
  if (normalized.startsWith("//")) reasons.push("unc_path");
  if (segments.some((segment) => PRODUCTION_PATH_SEGMENTS.has(segment))) {
    reasons.push("production_segment");
  }
  if (/(?:^|\/)ui-workspace\/apps\/dev-erp\/data(?:\/|$)/u.test(normalized)) {
    reasons.push("dev_erp_data_root");
  }
  if (/^(?:dev-erp|database)\.(?:db|sqlite|sqlite3)$/iu.test(path.basename(resolved))) {
    reasons.push("production_database_name");
  }
  return [...new Set(reasons)];
}

function assertPilotAuthorization(paths, pilotCopy, attestation, generation) {
  if (pilotCopy !== true) {
    fail("pilot_copy_flag_required", "The feature-OFF projector requires explicit --pilot-copy");
  }
  assertDigest(attestation, "attestation");
  const expected = sha256Canonical(generation);
  if (attestation !== expected) {
    fail("packet_attestation_mismatch", "Attestation does not match the canonical full generation packet");
  }
  const productionReasons = paths.flatMap(productionLookingPathReasons);
  if (productionReasons.length > 0 && (!pilotCopy || attestation !== expected)) {
    fail("production_path_refused", "A production-looking path requires pilot-copy authorization and attestation");
  }
}

function readSqliteHeader(filePath) {
  const descriptor = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    return bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    closeSync(descriptor);
  }
}

export function inspectStandaloneSqliteCopy(dbPath) {
  const resolved = path.resolve(dbPath);
  if (!existsSync(resolved)) {
    fail("sqlite_copy_missing", "The SQLite copy must already exist");
  }
  const entry = lstatSync(resolved);
  if (entry.isSymbolicLink() || !entry.isFile()) {
    fail("sqlite_copy_not_standalone_file", "The SQLite copy must be a regular, non-symlink file");
  }
  if (entry.nlink !== 1) {
    fail("sqlite_copy_hardlink_forbidden", "The SQLite copy must have exactly one filesystem link");
  }
  const real = realpathSync.native(resolved);
  if (normalizePathForComparison(real) !== normalizePathForComparison(resolved)) {
    fail("sqlite_copy_realpath_mismatch", "The SQLite copy path must resolve directly to its regular file");
  }
  const header = readSqliteHeader(resolved);
  if (!header.equals(SQLITE_HEADER)) {
    fail("sqlite_header_invalid", "The existing file is not an initialized SQLite database");
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(`${resolved}${suffix}`)) {
      fail("sqlite_sidecar_present", "A standalone copy cannot have WAL, SHM, or journal sidecars");
    }
  }

  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON");
    const queryOnly = Number(db.prepare("PRAGMA query_only").get().query_only);
    if (queryOnly !== 1) fail("query_only_guard_failed", "SQLite query_only could not be enabled");
    const databases = db.prepare("PRAGMA database_list").all();
    if (databases.length !== 1 || databases[0].name !== "main") {
      fail("attached_database_forbidden", "The copy must expose only one standalone main database");
    }
    const journalMode = String(db.prepare("PRAGMA journal_mode").get().journal_mode).toLowerCase();
    if (journalMode === "wal") {
      fail("wal_mode_copy_forbidden", "The standalone copy must not retain WAL journal mode");
    }
    const integrity = db.prepare("PRAGMA integrity_check(1)").get().integrity_check;
    if (integrity !== "ok") fail("sqlite_integrity_failed", "The copied database failed integrity_check");
    return Object.freeze({ journal_mode: journalMode, query_only: true });
  } finally {
    db.close();
  }
}

export function protectSpreadsheetFormula(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

function assertArtifactCellSafe(value, label) {
  if (typeof value !== "string") return;
  if (FORMULA_PREFIX_PATTERN.test(value)) {
    fail("formula_injection_guard_failed", `${label} retains an executable spreadsheet prefix`);
  }
  if (URI_OR_PATH_PATTERN.test(value)) {
    fail("artifact_locator_forbidden", `${label} contains a path or URI`);
  }
}

function buildProjectionRow(generation, envelope, sortOrdinal) {
  const row = {
    generation_id: protectSpreadsheetFormula(generation.generation_id),
    project_id: protectSpreadsheetFormula(generation.project_ref.entity_id),
    classification_state: generation.classification_state,
    event_count: generation.envelopes.length,
    coverage_count: generation.coverage_receipts.length,
    ordered_event_digest: generation.ordered_event_digest,
    source_attestation_digest: generation.source_attestation_digest,
    raw_payload_copied: false,
    accepted_history: false,
    sort_ordinal: sortOrdinal,
    occurrence_id: protectSpreadsheetFormula(envelope.occurrence_id),
    lane: envelope.lane,
    event_at: protectSpreadsheetFormula(envelope.event_at),
    valid_at: protectSpreadsheetFormula(envelope.valid_at),
    observed_at: protectSpreadsheetFormula(envelope.observed_at),
    known_at: protectSpreadsheetFormula(envelope.known_at),
    recorded_at: protectSpreadsheetFormula(envelope.recorded_at),
    metadata_digest: envelope.metadata_digest,
  };
  assertExactKeys(row, PROJECT_HISTORY_COPY_COLUMNS, "projection row");
  for (const [key, value] of Object.entries(row)) assertArtifactCellSafe(value, `projection row ${key}`);
  return row;
}

export function buildCanonicalProjectHistoryCopyModel(generation) {
  validateActualFiveLaneShadowGeneration(generation);
  const rows = generation.envelopes.map((envelope, index) => buildProjectionRow(generation, envelope, index));
  const model = {
    schema_version: PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION,
    generation_id: generation.generation_id,
    project_id: generation.project_ref.entity_id,
    classification_state: "shadow",
    event_count: rows.length,
    coverage_count: generation.coverage_receipts.length,
    ordered_event_digest: generation.ordered_event_digest,
    source_attestation_digest: generation.source_attestation_digest,
    raw_payload_copied: false,
    accepted_history: false,
    columns: [...PROJECT_HISTORY_COPY_COLUMNS],
    rows,
    ordered_row_digest: sha256Canonical(rows),
    hidden_sheets: false,
    external_links: false,
    formula_cells: false,
  };
  return model;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function renderProjectHistoryCopyCsv(model) {
  const lines = [
    model.columns.map(csvEscape).join(","),
    ...model.rows.map((row) => model.columns.map((column) => csvEscape(row[column])).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

export function renderProjectHistoryCopyXlsxInput(model) {
  return `${canonicalJson(model)}\n`;
}

export function createProjectHistoryProjectionSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_history_generation (
      generation_id TEXT PRIMARY KEY NOT NULL,
      schema_version TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_ref_json TEXT NOT NULL,
      classification_state TEXT NOT NULL CHECK (classification_state = 'shadow'),
      event_count INTEGER NOT NULL CHECK (event_count >= 0),
      coverage_count INTEGER NOT NULL CHECK (coverage_count >= 0),
      ordered_event_digest TEXT NOT NULL,
      source_attestation_digest TEXT NOT NULL,
      packet_digest TEXT NOT NULL,
      raw_payload_copied INTEGER NOT NULL CHECK (raw_payload_copied = 0),
      accepted_history INTEGER NOT NULL CHECK (accepted_history = 0)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_history_event (
      generation_id TEXT NOT NULL REFERENCES project_history_generation(generation_id)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      sort_ordinal INTEGER NOT NULL CHECK (sort_ordinal >= 0),
      occurrence_id TEXT NOT NULL,
      lane TEXT NOT NULL CHECK (lane IN ('mail','voice','structured_pc_work','file','run_log')),
      event_at TEXT NOT NULL,
      valid_at TEXT NOT NULL,
      observed_at TEXT,
      known_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      metadata_digest TEXT NOT NULL,
      event_ref_json TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      PRIMARY KEY (generation_id, sort_ordinal),
      UNIQUE (generation_id, metadata_digest)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS project_history_event_ref_idx
      ON project_history_event(event_ref_json);

    CREATE TABLE IF NOT EXISTS project_history_coverage (
      generation_id TEXT NOT NULL REFERENCES project_history_generation(generation_id)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      lane TEXT NOT NULL CHECK (lane IN ('mail','voice','structured_pc_work','file','run_log')),
      state TEXT NOT NULL,
      event_count INTEGER,
      gap_codes_json TEXT NOT NULL,
      ordered_event_digest TEXT NOT NULL,
      metadata_digest TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      PRIMARY KEY (generation_id, lane)
    ) STRICT;

    CREATE TRIGGER IF NOT EXISTS project_history_generation_no_update
      BEFORE UPDATE ON project_history_generation BEGIN
        SELECT RAISE(ABORT, 'project_history_generation is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_generation_no_delete
      BEFORE DELETE ON project_history_generation BEGIN
        SELECT RAISE(ABORT, 'project_history_generation is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_generation_no_replace
      BEFORE INSERT ON project_history_generation
      WHEN EXISTS (
        SELECT 1 FROM project_history_generation AS generation
        WHERE generation.generation_id = NEW.generation_id
      ) BEGIN
        SELECT RAISE(ABORT, 'project_history_generation is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_event_no_update
      BEFORE UPDATE ON project_history_event BEGIN
        SELECT RAISE(ABORT, 'project_history_event is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_event_no_delete
      BEFORE DELETE ON project_history_event BEGIN
        SELECT RAISE(ABORT, 'project_history_event is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_coverage_no_update
      BEFORE UPDATE ON project_history_coverage BEGIN
        SELECT RAISE(ABORT, 'project_history_coverage is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_coverage_no_delete
      BEFORE DELETE ON project_history_coverage BEGIN
        SELECT RAISE(ABORT, 'project_history_coverage is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_event_generation_sealed
      BEFORE INSERT ON project_history_event
      WHEN EXISTS (
        SELECT 1 FROM project_history_generation AS generation
        WHERE generation.generation_id = NEW.generation_id
          AND (NEW.sort_ordinal >= generation.event_count OR
               (SELECT COUNT(*) FROM project_history_event AS event
                WHERE event.generation_id = NEW.generation_id) >= generation.event_count)
      ) BEGIN
        SELECT RAISE(ABORT, 'project_history_generation event set is sealed');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_coverage_generation_sealed
      BEFORE INSERT ON project_history_coverage
      WHEN EXISTS (
        SELECT 1 FROM project_history_generation AS generation
        WHERE generation.generation_id = NEW.generation_id
          AND (SELECT COUNT(*) FROM project_history_coverage AS coverage
               WHERE coverage.generation_id = NEW.generation_id) >= generation.coverage_count
      ) BEGIN
        SELECT RAISE(ABORT, 'project_history_generation coverage set is sealed');
      END;
  `);
}

export function canonicalProjectHistoryProjectionSchemaFingerprint() {
  if (expectedProjectionSchemaFingerprint === null) {
    const reference = new DatabaseSync(":memory:");
    try {
      createProjectHistoryProjectionSchema(reference);
      expectedProjectionSchemaFingerprint = projectHistoryProjectionSchemaFingerprint(reference);
    } finally {
      reference.close();
    }
  }
  return expectedProjectionSchemaFingerprint;
}

export function assertCanonicalProjectHistoryProjectionSchema(db) {
  const actual = projectHistoryProjectionSchemaFingerprint(db);
  if (actual !== canonicalProjectHistoryProjectionSchemaFingerprint()) {
    fail("projection_schema_conflict", "Copied-project-history tables, keys, constraints, indexes, or triggers differ from the canonical schema");
  }
  return actual;
}

export function projectHistoryProjectionSchemaFingerprint(db) {
  const placeholders = PROJECTION_TABLES.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT type, name, tbl_name, sql
      FROM sqlite_master
     WHERE tbl_name IN (${placeholders})
       AND name NOT LIKE 'sqlite_autoindex_%'
     ORDER BY type, name
  `).all(...PROJECTION_TABLES).map((row) => ({
    type: row.type,
    name: row.name,
    table_name: row.tbl_name,
    sql: String(row.sql).replace(/\s+/gu, " ").trim(),
  }));
  return sha256Canonical(rows);
}

function assertNoEventRefConflict(db, generation) {
  const select = db.prepare(
    "SELECT metadata_digest FROM project_history_event WHERE event_ref_json = ? LIMIT 1",
  );
  for (const envelope of generation.envelopes) {
    const prior = select.get(canonicalJson(envelope.event_ref));
    if (prior !== undefined && prior.metadata_digest !== envelope.metadata_digest) {
      fail("event_ref_digest_conflict", "An immutable event ref already has a different metadata digest");
    }
  }
}

function assertGenerationReplay(db, generation, packetDigest) {
  const stored = db.prepare(
    "SELECT * FROM project_history_generation WHERE generation_id = ?",
  ).get(generation.generation_id);
  if (stored === undefined) return false;
  if (stored.schema_version !== generation.schema_version
      || stored.project_id !== generation.project_ref.entity_id
      || stored.classification_state !== generation.classification_state
      || stored.packet_digest !== packetDigest
      || stored.ordered_event_digest !== generation.ordered_event_digest
      || stored.source_attestation_digest !== generation.source_attestation_digest
      || stored.project_ref_json !== canonicalJson(generation.project_ref)
      || stored.event_count !== generation.envelopes.length
      || stored.coverage_count !== generation.coverage_receipts.length
      || stored.raw_payload_copied !== 0
      || stored.accepted_history !== 0) {
    fail("generation_digest_conflict", "The generation ID already binds different immutable metadata");
  }
  const events = db.prepare(
    "SELECT sort_ordinal, envelope_json FROM project_history_event WHERE generation_id = ? ORDER BY sort_ordinal",
  ).all(generation.generation_id);
  const coverage = db.prepare(
    "SELECT lane, receipt_json FROM project_history_coverage WHERE generation_id = ?",
  ).all(generation.generation_id);
  if (events.length !== generation.envelopes.length || coverage.length !== generation.coverage_receipts.length) {
    fail("generation_replay_incomplete", "Stored immutable generation rows are incomplete");
  }
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].sort_ordinal !== index
        || events[index].envelope_json !== canonicalJson(generation.envelopes[index])) {
      fail("generation_digest_conflict", "Stored event rows differ from the replay packet");
    }
  }
  const coverageByLane = new Map(coverage.map((row) => [row.lane, row.receipt_json]));
  for (const receipt of generation.coverage_receipts) {
    if (coverageByLane.get(receipt.lane) !== canonicalJson(receipt)) {
      fail("generation_digest_conflict", "Stored coverage rows differ from the replay packet");
    }
  }
  return true;
}

function insertGeneration(db, generation, packetDigest) {
  const insertEvent = db.prepare(`
    INSERT INTO project_history_event (
      generation_id, sort_ordinal, occurrence_id, lane, event_at, valid_at, observed_at,
      known_at, recorded_at, metadata_digest, event_ref_json, envelope_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  generation.envelopes.forEach((envelope, index) => {
    insertEvent.run(
      generation.generation_id,
      index,
      envelope.occurrence_id,
      envelope.lane,
      envelope.event_at,
      envelope.valid_at,
      envelope.observed_at,
      envelope.known_at,
      envelope.recorded_at,
      envelope.metadata_digest,
      canonicalJson(envelope.event_ref),
      canonicalJson(envelope),
    );
  });

  const insertCoverage = db.prepare(`
    INSERT INTO project_history_coverage (
      generation_id, lane, state, event_count, gap_codes_json,
      ordered_event_digest, metadata_digest, receipt_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const receipt of generation.coverage_receipts) {
    insertCoverage.run(
      generation.generation_id,
      receipt.lane,
      receipt.state,
      receipt.event_count,
      canonicalJson(receipt.gap_codes),
      receipt.ordered_event_digest,
      receipt.metadata_digest,
      canonicalJson(receipt),
    );
  }

  db.prepare(`
    INSERT INTO project_history_generation (
      generation_id, schema_version, project_id, project_ref_json, classification_state,
      event_count, coverage_count, ordered_event_digest, source_attestation_digest,
      packet_digest, raw_payload_copied, accepted_history
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `).run(
    generation.generation_id,
    generation.schema_version,
    generation.project_ref.entity_id,
    canonicalJson(generation.project_ref),
    generation.classification_state,
    generation.envelopes.length,
    generation.coverage_receipts.length,
    generation.ordered_event_digest,
    generation.source_attestation_digest,
    packetDigest,
  );
}

function writeDeterministicOutput(filePath, content) {
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  if (existsSync(filePath)) {
    const current = readFileSync(filePath);
    if (current.equals(bytes)) return Object.freeze({ changed: false, digest: sha256Bytes(bytes) });
  }
  writeFileSync(filePath, bytes);
  return Object.freeze({ changed: true, digest: sha256Bytes(bytes) });
}

export function projectCopiedErpHistory({
  dbPath,
  generation,
  csvPath,
  xlsxInputPath,
  pilotCopy = false,
  attestation = null,
}) {
  if (generation?.schema_version !== ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION) {
    fail("generation_schema_invalid", "Unexpected actual Shadow generation schema");
  }
  validateActualFiveLaneShadowGeneration(generation);
  const paths = [dbPath, csvPath, xlsxInputPath];
  if (paths.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    fail("path_required", "DB, CSV, and XLSX-input paths are required");
  }
  if (new Set(paths.map(normalizePathForComparison)).size !== paths.length) {
    fail("output_path_collision", "DB, CSV, and XLSX-input paths must be distinct");
  }
  assertPilotAuthorization(paths, pilotCopy, attestation, generation);
  inspectStandaloneSqliteCopy(dbPath);

  const model = buildCanonicalProjectHistoryCopyModel(generation);
  const csv = renderProjectHistoryCopyCsv(model);
  const xlsxInput = renderProjectHistoryCopyXlsxInput(model);
  const db = new DatabaseSync(path.resolve(dbPath));
  let replayed = false;
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("BEGIN IMMEDIATE");
    try {
      createProjectHistoryProjectionSchema(db);
      assertCanonicalProjectHistoryProjectionSchema(db);
      replayed = assertGenerationReplay(db, generation, attestation);
      if (!replayed) {
        assertNoEventRefConflict(db, generation);
        insertGeneration(db, generation, attestation);
      }
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The original error is the actionable failure.
      }
      throw error;
    }
  } finally {
    db.close();
  }

  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(`${path.resolve(dbPath)}${suffix}`)) {
      fail("sqlite_sidecar_after_projection", "Projection did not leave a standalone SQLite copy");
    }
  }
  const csvResult = writeDeterministicOutput(csvPath, csv);
  const xlsxInputResult = writeDeterministicOutput(xlsxInputPath, xlsxInput);
  return Object.freeze({
    status: replayed ? "replayed" : "inserted",
    feature_state: "off",
    generation_id: generation.generation_id,
    event_count: model.event_count,
    coverage_count: model.coverage_count,
    ordered_event_digest: model.ordered_event_digest,
    ordered_row_digest: model.ordered_row_digest,
    csv_digest: csvResult.digest,
    xlsx_input_digest: xlsxInputResult.digest,
    raw_payload_copied: false,
    accepted_history: false,
  });
}

function parseArgs(argv) {
  const options = {};
  const valueFlags = new Map([
    ["--db", "dbPath"],
    ["--packet", "packetPath"],
    ["--csv", "csvPath"],
    ["--xlsx-input", "xlsxInputPath"],
    ["--attestation", "attestation"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") options.help = true;
    else if (token === "--pilot-copy") options.pilotCopy = true;
    else if (valueFlags.has(token)) {
      if (options[valueFlags.get(token)] !== undefined) fail("duplicate_argument", `${token} was supplied twice`);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) fail("argument_value_missing", `${token} needs a value`);
      options[valueFlags.get(token)] = value;
      index += 1;
    } else {
      fail("unknown_argument", `Unknown argument ${token}`);
    }
  }
  return options;
}

function helpText() {
  return [
    "Feature-OFF copied-ERP project-history projector.",
    "",
    "Usage:",
    "  node tools/project_history_copy_projector.mjs --pilot-copy --attestation <sha256> \\",
    "    --db <existing-copy.sqlite> --packet <actual-generation.json> \\",
    "    --csv <projection.csv> --xlsx-input <projection.xlsx-input.json>",
    "",
    "The attestation is sha256Canonical(full actual-generation packet).",
    "No XLSX is authored here; xlsx-input is the deterministic artifact-tool handoff.",
  ].join("\n");
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${helpText()}\n`);
      process.exit(0);
    }
    for (const key of ["dbPath", "packetPath", "csvPath", "xlsxInputPath", "attestation"]) {
      if (typeof options[key] !== "string" || options[key].length === 0) {
        fail("argument_required", `${key} is required`);
      }
    }
    const generation = JSON.parse(readFileSync(path.resolve(options.packetPath), "utf8").replace(/^\uFEFF/u, ""));
    const result = projectCopiedErpHistory({ ...options, generation });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "projection_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exit(1);
  }
}

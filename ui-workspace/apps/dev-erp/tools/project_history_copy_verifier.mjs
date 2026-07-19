#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  validateActualFiveLaneShadowGeneration,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  PROJECT_HISTORY_COPY_COLUMNS,
  PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION,
  ProjectHistoryCopyProjectionError,
  buildCanonicalProjectHistoryCopyModel,
  inspectStandaloneSqliteCopy,
  productionLookingPathReasons,
} from "./project_history_copy_projector.mjs";

export const PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION =
  "soulforge.project_history_copy_xlsx_readback.v1";

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const INTEGER_COLUMNS = new Set(["event_count", "coverage_count", "sort_ordinal"]);
const BOOLEAN_COLUMNS = new Set(["raw_payload_copied", "accepted_history"]);
const XLSX_INPUT_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "project_id",
  "classification_state",
  "event_count",
  "coverage_count",
  "ordered_event_digest",
  "source_attestation_digest",
  "raw_payload_copied",
  "accepted_history",
  "columns",
  "rows",
  "ordered_row_digest",
  "hidden_sheets",
  "external_links",
  "formula_cells",
]);
const XLSX_READBACK_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "event_count",
  "coverage_count",
  "ordered_event_digest",
  "ordered_row_digest",
  "columns",
  "rows",
  "hidden_sheet_count",
  "external_link_count",
  "formula_cell_count",
]);

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

function assertVerifierAuthorization(dbPath, pilotCopy, attestation) {
  if (pilotCopy !== true) {
    fail("pilot_copy_flag_required", "The copy verifier requires explicit --pilot-copy");
  }
  if (typeof attestation !== "string" || !DIGEST_PATTERN.test(attestation)) {
    fail("digest_invalid", "Attestation must be a canonical sha256 digest");
  }
  if (productionLookingPathReasons(dbPath).length > 0 && (!pilotCopy || !attestation)) {
    fail("production_path_refused", "A production-looking path requires pilot-copy authorization and attestation");
  }
}

function assertRowColumnContract(row, label) {
  assertExactKeys(row, PROJECT_HISTORY_COPY_COLUMNS, label);
}

export function parseProjectHistoryCopyCsv(text) {
  const raw = text.replace(/^\uFEFF/u, "");
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (character === '"' && raw[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/u, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) fail("csv_invalid", "CSV contains an unterminated quoted cell");
  if (field !== "" || record.length > 0) {
    record.push(field.replace(/\r$/u, ""));
    records.push(record);
  }
  const nonblank = records.filter((row) => row.some((value) => value !== ""));
  const [columns, ...dataRows] = nonblank;
  if (!columns
      || columns.length !== PROJECT_HISTORY_COPY_COLUMNS.length
      || columns.some((column, index) => column !== PROJECT_HISTORY_COPY_COLUMNS[index])) {
    fail("csv_columns_mismatch", "CSV columns differ from the canonical row model");
  }
  return dataRows.map((values, rowIndex) => {
    if (values.length !== columns.length) fail("csv_row_width_mismatch", `CSV row ${rowIndex} has the wrong width`);
    const row = {};
    columns.forEach((column, columnIndex) => {
      const value = values[columnIndex];
      if (INTEGER_COLUMNS.has(column)) {
        if (!/^(?:0|[1-9]\d*)$/u.test(value)) fail("csv_integer_invalid", `${column} is not canonical`);
        row[column] = Number(value);
      } else if (BOOLEAN_COLUMNS.has(column)) {
        if (value !== "true" && value !== "false") fail("csv_boolean_invalid", `${column} is not canonical`);
        row[column] = value === "true";
      } else {
        row[column] = value;
      }
    });
    assertRowColumnContract(row, `CSV row ${rowIndex}`);
    return row;
  });
}

function assertStoredEventColumns(row, envelope, index) {
  const pairs = [
    [row.sort_ordinal, index],
    [row.occurrence_id, envelope.occurrence_id],
    [row.lane, envelope.lane],
    [row.event_at, envelope.event_at],
    [row.valid_at, envelope.valid_at],
    [row.observed_at, envelope.observed_at],
    [row.known_at, envelope.known_at],
    [row.recorded_at, envelope.recorded_at],
    [row.metadata_digest, envelope.metadata_digest],
  ];
  if (pairs.some(([left, right]) => left !== right)) {
    fail("database_event_column_mismatch", "Query-friendly event columns differ from immutable envelope JSON");
  }
}

function assertStoredCoverageColumns(row, receipt) {
  if (row.lane !== receipt.lane
      || row.state !== receipt.state
      || row.event_count !== receipt.event_count
      || row.gap_codes_json !== canonicalJson(receipt.gap_codes)
      || row.ordered_event_digest !== receipt.ordered_event_digest
      || row.metadata_digest !== receipt.metadata_digest) {
    fail("database_coverage_column_mismatch", "Query-friendly coverage columns differ from immutable receipt JSON");
  }
}

export function readValidatedProjectHistoryGenerationQueryOnly(
  db,
  generationId,
  attestation,
  { projectId = null } = {},
) {
  const generationRow = db.prepare(
    "SELECT * FROM project_history_generation WHERE generation_id = ?",
  ).get(generationId);
  if (generationRow === undefined) fail("generation_not_found", "The requested immutable generation does not exist");
  if (generationRow.packet_digest !== attestation) {
    fail("packet_attestation_mismatch", "Attestation does not match the stored full generation digest");
  }
  const eventRows = db.prepare(
    "SELECT * FROM project_history_event WHERE generation_id = ? ORDER BY sort_ordinal",
  ).all(generationId);
  const coverageRows = db.prepare(
    "SELECT * FROM project_history_coverage WHERE generation_id = ?",
  ).all(generationId);
  if (eventRows.length !== generationRow.event_count || coverageRows.length !== generationRow.coverage_count) {
    fail("database_generation_incomplete", "Generation counts differ from immutable child rows");
  }

  const envelopes = eventRows.map((row, index) => {
    const envelope = JSON.parse(row.envelope_json);
    assertStoredEventColumns(row, envelope, index);
    return envelope;
  });
  const coverageByLane = new Map(coverageRows.map((row) => [row.lane, row]));
  const coverageReceipts = PROJECT_HISTORY_LANES.map((lane) => {
    const row = coverageByLane.get(lane);
    if (row === undefined) fail("database_coverage_lane_missing", `Coverage row for ${lane} is missing`);
    const receipt = JSON.parse(row.receipt_json);
    assertStoredCoverageColumns(row, receipt);
    return receipt;
  });
  const generation = {
    schema_version: generationRow.schema_version,
    generation_id: generationRow.generation_id,
    project_ref: JSON.parse(generationRow.project_ref_json),
    classification_state: generationRow.classification_state,
    envelopes,
    coverage_receipts: coverageReceipts,
    ordered_event_digest: generationRow.ordered_event_digest,
    source_attestation_digest: generationRow.source_attestation_digest,
    raw_payload_copied: generationRow.raw_payload_copied === 1,
    accepted_history: generationRow.accepted_history === 1,
  };
  if (generationRow.project_id !== generation.project_ref.entity_id) {
    fail("database_project_id_mismatch", "project_id differs from the immutable typed project ref");
  }
  if (projectId !== null && generationRow.project_id !== projectId) {
    fail("database_project_id_mismatch", "project_id differs from the exact requested project");
  }
  validateActualFiveLaneShadowGeneration(generation);
  if (sha256Canonical(generation) !== generationRow.packet_digest) {
    fail("database_packet_digest_mismatch", "Stored immutable generation does not match packet_digest");
  }
  return generation;
}

export function validateProjectHistoryCopyXlsxInput(value, expectedModel) {
  assertExactKeys(value, XLSX_INPUT_FIELDS, "XLSX input");
  if (value.schema_version !== PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION) {
    fail("xlsx_input_schema_invalid", "Unexpected XLSX-input schema version");
  }
  if (value.hidden_sheets !== false || value.external_links !== false || value.formula_cells !== false) {
    fail("xlsx_input_boundary_invalid", "XLSX input cannot request hidden, external, or formula data");
  }
  if (canonicalJson(value) !== canonicalJson(expectedModel)) {
    fail("xlsx_input_parity_mismatch", "XLSX input differs from the canonical DB row model");
  }
}

export function verifyXlsxReadbackManifest(value, expectedModel) {
  assertExactKeys(value, XLSX_READBACK_FIELDS, "XLSX readback");
  if (value.schema_version !== PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION) {
    fail("xlsx_readback_schema_invalid", "Unexpected XLSX readback schema version");
  }
  if (value.hidden_sheet_count !== 0
      || value.external_link_count !== 0
      || value.formula_cell_count !== 0) {
    fail("xlsx_readback_boundary_invalid", "XLSX readback found hidden, external, or formula data");
  }
  if (value.generation_id !== expectedModel.generation_id
      || value.event_count !== expectedModel.event_count
      || value.coverage_count !== expectedModel.coverage_count
      || value.ordered_event_digest !== expectedModel.ordered_event_digest
      || value.ordered_row_digest !== expectedModel.ordered_row_digest
      || canonicalJson(value.columns) !== canonicalJson(expectedModel.columns)
      || canonicalJson(value.rows) !== canonicalJson(expectedModel.rows)) {
    fail("xlsx_readback_parity_mismatch", "XLSX readback differs from the canonical DB row model");
  }
  return true;
}

export function verifyCopiedProjectHistoryProjection({
  dbPath,
  generationId,
  csvPath,
  xlsxInputPath,
  xlsxReadbackPath = null,
  pilotCopy = false,
  attestation = null,
}) {
  for (const [label, value] of [["db", dbPath], ["csv", csvPath], ["xlsx-input", xlsxInputPath]]) {
    if (typeof value !== "string" || value.length === 0) fail("path_required", `${label} path is required`);
  }
  if (typeof generationId !== "string" || generationId.length === 0) {
    fail("generation_id_required", "An explicit generation ID is required; current pointers are never consulted");
  }
  assertVerifierAuthorization(dbPath, pilotCopy, attestation);
  inspectStandaloneSqliteCopy(dbPath);
  const db = new DatabaseSync(path.resolve(dbPath), { readOnly: true });
  let model;
  let totalChangesBefore;
  let totalChangesAfter;
  try {
    db.exec("PRAGMA query_only = ON");
    const queryOnly = Number(db.prepare("PRAGMA query_only").get().query_only);
    if (queryOnly !== 1) fail("query_only_guard_failed", "SQLite query_only could not be enabled");
    totalChangesBefore = Number(db.prepare("SELECT total_changes() AS count").get().count);
    const generation = readValidatedProjectHistoryGenerationQueryOnly(db, generationId, attestation);
    model = buildCanonicalProjectHistoryCopyModel(generation);
    totalChangesAfter = Number(db.prepare("SELECT total_changes() AS count").get().count);
  } finally {
    db.close();
  }
  if (totalChangesBefore !== 0 || totalChangesAfter !== 0) {
    fail("query_only_mutation_detected", "Verifier connection reported SQLite mutations");
  }

  const csvRows = parseProjectHistoryCopyCsv(readFileSync(path.resolve(csvPath), "utf8"));
  if (canonicalJson(csvRows) !== canonicalJson(model.rows)) {
    fail("csv_parity_mismatch", "CSV rows differ from the canonical DB row model");
  }
  const xlsxInput = JSON.parse(readFileSync(path.resolve(xlsxInputPath), "utf8").replace(/^\uFEFF/u, ""));
  validateProjectHistoryCopyXlsxInput(xlsxInput, model);

  let xlsxReadback = "not_supplied";
  if (xlsxReadbackPath !== null) {
    const manifest = JSON.parse(readFileSync(path.resolve(xlsxReadbackPath), "utf8").replace(/^\uFEFF/u, ""));
    verifyXlsxReadbackManifest(manifest, model);
    xlsxReadback = "verified";
  }

  return Object.freeze({
    ok: true,
    query_only: true,
    sqlite_total_changes: 0,
    generation_id: model.generation_id,
    event_count: model.event_count,
    coverage_count: model.coverage_count,
    ordered_event_digest: model.ordered_event_digest,
    ordered_row_digest: model.ordered_row_digest,
    db_csv_parity: true,
    db_xlsx_input_parity: true,
    xlsx_readback: xlsxReadback,
    raw_payload_copied: false,
    accepted_history: false,
  });
}

function parseArgs(argv) {
  const options = {};
  const valueFlags = new Map([
    ["--db", "dbPath"],
    ["--generation-id", "generationId"],
    ["--csv", "csvPath"],
    ["--xlsx-input", "xlsxInputPath"],
    ["--xlsx-readback", "xlsxReadbackPath"],
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
    "Query-only verifier for a feature-OFF copied-ERP history projection.",
    "",
    "Usage:",
    "  node tools/project_history_copy_verifier.mjs --pilot-copy --attestation <sha256> \\",
    "    --db <existing-copy.sqlite> --generation-id <id> --csv <projection.csv> \\",
    "    --xlsx-input <projection.xlsx-input.json> [--xlsx-readback <artifact-tool-readback.json>]",
    "",
    "The DB is opened readOnly and PRAGMA query_only=ON is verified before all queries.",
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
    const result = verifyCopiedProjectHistoryProjection(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "verification_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exit(1);
  }
}

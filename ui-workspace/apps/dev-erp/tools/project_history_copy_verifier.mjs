#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
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
  ProjectHistoryCopyProjectionError,
  assertCanonicalProjectHistoryProjectionSchema,
  buildCanonicalProjectHistoryCopyModel,
  createProjectHistoryCopyPublicationIntent,
  readProjectHistoryCopyPublicationState,
} from "./project_history_copy_projector.mjs";
import {
  PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES,
  artifactRecord,
  assertProjectHistoryCopyBindingTarget,
  readProjectHistoryCopyArtifactManifest,
  readProjectHistoryCopyBinding,
} from "./project_history_copy_binding.mjs";
import {
  PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION,
  readProjectHistoryCopyXlsx,
  validateProjectHistoryCopyXlsxInput as validateXlsxInput,
  verifyProjectHistoryCopyXlsxReadback,
} from "./project_history_copy_xlsx.mjs";

export { PROJECT_HISTORY_COPY_XLSX_READBACK_SCHEMA_VERSION };

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const INTEGER_COLUMNS = new Set(["event_count", "coverage_count", "sort_ordinal"]);
const BOOLEAN_COLUMNS = new Set(["raw_payload_copied", "accepted_history"]);

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

function assertVerifierAttestation(attestation) {
  if (typeof attestation !== "string" || !DIGEST_PATTERN.test(attestation)) {
    fail("digest_invalid", "Attestation must be a canonical sha256 digest");
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
  return validateXlsxInput(value, expectedModel);
}

export function verifyXlsxReadbackManifest(value, expectedModel) {
  return verifyProjectHistoryCopyXlsxReadback(value, expectedModel);
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function stableStatEqual(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readStableArtifact(filePath, filename) {
  const resolved = path.resolve(filePath);
  let before;
  let after;
  let real;
  let bytes;
  try {
    before = lstatSync(resolved, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n) {
      fail("artifact_not_standalone", `${filename} must be a direct single-link file`);
    }
    bytes = readFileSync(resolved);
    after = lstatSync(resolved, { bigint: true });
    real = realpathSync.native(resolved);
  } catch (error) {
    if (error instanceof ProjectHistoryCopyProjectionError) throw error;
    fail("artifact_unreadable", `${filename} could not be read`);
  }
  if (!stableStatEqual(before, after)
      || bytes.length !== Number(after.size)
      || normalizedPath(real) !== normalizedPath(resolved)) {
    fail("artifact_changed_during_read", `${filename} changed while it was being read`);
  }
  return Object.freeze({ bytes, record: artifactRecord(filename, bytes) });
}

function assertArtifactRecord(actual, expected, label) {
  if (actual.filename !== expected.filename
      || actual.size !== expected.size
      || actual.sha256 !== expected.sha256) {
    fail("artifact_hash_mismatch", `${label} bytes do not match the bound artifact manifest`);
  }
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("artifact_utf8_invalid", `${label} is not strict UTF-8`);
  }
}

function decodeJson(bytes, label) {
  try {
    return JSON.parse(decodeUtf8(bytes, label).replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error instanceof ProjectHistoryCopyProjectionError) throw error;
    fail("artifact_json_invalid", `${label} is not JSON`);
  }
}

export function verifyCopiedProjectHistoryProjection({
  dbPath,
  generationId,
  csvPath,
  xlsxInputPath,
  xlsxPath,
  xlsxReadbackPath,
  artifactManifestPath,
  artifactManifestDigest,
  bindingPath,
  bindingDigest,
  pilotCopy = false,
  attestation = null,
}) {
  for (const [label, value] of [
    ["db", dbPath],
    ["csv", csvPath],
    ["xlsx-input", xlsxInputPath],
    ["xlsx", xlsxPath],
    ["xlsx-readback", xlsxReadbackPath],
    ["artifact-manifest", artifactManifestPath],
    ["binding", bindingPath],
  ]) {
    if (typeof value !== "string" || value.length === 0) fail("path_required", `${label} path is required`);
  }
  if (typeof generationId !== "string" || generationId.length === 0) {
    fail("generation_id_required", "An explicit generation ID is required; current pointers are never consulted");
  }
  assertVerifierAttestation(attestation);
  if (typeof bindingDigest !== "string" || bindingDigest.length === 0) {
    fail("binding_digest_required", "An externally pinned private binding digest is required");
  }
  if (typeof artifactManifestDigest !== "string" || artifactManifestDigest.length === 0) {
    fail("artifact_manifest_digest_required", "An externally pinned artifact manifest digest is required");
  }
  const binding = readProjectHistoryCopyBinding(path.resolve(bindingPath), {
    expectedDigest: bindingDigest,
  });
  const artifactPaths = {
    csvPath,
    xlsxInputPath,
    xlsxPath,
    xlsxReadbackPath,
    artifactManifestPath,
  };
  const projectMatches = binding.allowed_project_ids.filter((projectId) => {
    try {
      assertProjectHistoryCopyBindingTarget(binding, {
        bindingDigest,
        dbPath,
        projectId,
        generationId,
        artifactPaths,
        requireDatabaseHash: false,
      });
      return true;
    } catch (error) {
      if (error?.code === "projection_root_mismatch") return false;
      throw error;
    }
  });
  if (projectMatches.length !== 1) {
    fail("projection_root_mismatch", "Artifact paths do not identify exactly one allowed project root");
  }
  const projectId = projectMatches[0];
  const bound = assertProjectHistoryCopyBindingTarget(binding, {
    bindingDigest,
    dbPath,
    projectId,
    generationId,
    artifactPaths,
    requireDatabaseHash: false,
  });
  const db = new DatabaseSync(bound.database.path, { readOnly: true });
  let model;
  let generation;
  let publicationReceipt;
  let totalChangesBefore;
  let totalChangesAfter;
  try {
    db.exec("PRAGMA query_only = ON");
    const queryOnly = Number(db.prepare("PRAGMA query_only").get().query_only);
    if (queryOnly !== 1) fail("query_only_guard_failed", "SQLite query_only could not be enabled");
    totalChangesBefore = Number(db.prepare("SELECT total_changes() AS count").get().count);
    assertCanonicalProjectHistoryProjectionSchema(db);
    const publicationState = readProjectHistoryCopyPublicationState(db, generationId);
    if (publicationState.pending !== null) {
      fail("publication_pending", "Generation has a durable pending publication intent but no published receipt");
    }
    if (publicationState.receipt === null) {
      fail("publication_receipt_missing", "Generation is not accepted without an immutable published receipt");
    }
    publicationReceipt = publicationState.receipt;
    generation = readValidatedProjectHistoryGenerationQueryOnly(
      db,
      generationId,
      attestation,
      { projectId },
    );
    model = buildCanonicalProjectHistoryCopyModel(generation);
    totalChangesAfter = Number(db.prepare("SELECT total_changes() AS count").get().count);
  } finally {
    db.close();
  }
  if (totalChangesBefore !== 0 || totalChangesAfter !== 0) {
    fail("query_only_mutation_detected", "Verifier connection reported SQLite mutations");
  }
  if (artifactManifestDigest !== publicationReceipt.artifact_manifest_digest) {
    fail("publication_receipt_manifest_mismatch", "Pinned manifest digest differs from the published receipt");
  }
  const manifest = readProjectHistoryCopyArtifactManifest(path.resolve(artifactManifestPath), {
    expectedDigest: artifactManifestDigest,
  });
  const manifestArtifact = readStableArtifact(
    artifactManifestPath,
    PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.manifest,
  );
  if (manifestArtifact.record.sha256 !== publicationReceipt.artifact_manifest_file_digest
      || manifest.project_id !== projectId
      || manifest.generation_id !== generationId
      || manifest.generation_digest !== attestation
      || manifest.binding_digest !== publicationReceipt.binding_digest
      || manifest.artifact_manifest_digest !== publicationReceipt.artifact_manifest_digest
      || manifest.ordered_event_digest !== publicationReceipt.ordered_event_digest
      || manifest.ordered_row_digest !== publicationReceipt.ordered_row_digest) {
    fail("publication_receipt_manifest_mismatch", "Published receipt and manifest do not match");
  }
  const afterRead = assertProjectHistoryCopyBindingTarget(binding, {
    bindingDigest,
    dbPath,
    projectId,
    generationId,
    artifactPaths,
    requireDatabaseHash: false,
  });
  if (manifest.ordered_event_digest !== model.ordered_event_digest
      || manifest.ordered_row_digest !== model.ordered_row_digest) {
    fail("artifact_model_digest_mismatch", "Artifact manifest row/event digests differ from the copied DB model");
  }

  const artifacts = {
    csv: readStableArtifact(csvPath, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.csv),
    xlsx_input: readStableArtifact(xlsxInputPath, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_input),
    xlsx: readStableArtifact(xlsxPath, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx),
    xlsx_readback: readStableArtifact(xlsxReadbackPath, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_readback),
  };
  for (const [key, artifact] of Object.entries(artifacts)) {
    assertArtifactRecord(artifact.record, manifest.artifacts[key], key);
  }
  const publicationIntent = createProjectHistoryCopyPublicationIntent({
    generation,
    model,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, value.record])),
  });
  if (publicationIntent.publication_intent_digest !== publicationReceipt.publication_intent_digest
      || publicationIntent.project_id !== publicationReceipt.project_id
      || publicationIntent.generation_digest !== publicationReceipt.generation_digest) {
    fail("publication_receipt_intent_mismatch", "Published receipt differs from DB/artifact parity intent");
  }

  const csvRows = parseProjectHistoryCopyCsv(decodeUtf8(artifacts.csv.bytes, "CSV"));
  if (canonicalJson(csvRows) !== canonicalJson(model.rows)) {
    fail("csv_parity_mismatch", "CSV rows differ from the canonical DB row model");
  }
  const xlsxInput = decodeJson(artifacts.xlsx_input.bytes, "XLSX input");
  validateProjectHistoryCopyXlsxInput(xlsxInput, model);
  const actualXlsxReadback = readProjectHistoryCopyXlsx(artifacts.xlsx.bytes);
  verifyProjectHistoryCopyXlsxReadback(actualXlsxReadback, model);
  const persistedXlsxReadback = decodeJson(artifacts.xlsx_readback.bytes, "XLSX readback");
  verifyXlsxReadbackManifest(persistedXlsxReadback, model);
  if (canonicalJson(persistedXlsxReadback) !== canonicalJson(actualXlsxReadback)) {
    fail("xlsx_readback_parity_mismatch", "Persisted readback differs from independently parsed workbook bytes");
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
    binding_digest: binding.binding_digest,
    artifact_manifest_digest: manifest.artifact_manifest_digest,
    publication_receipt_digest: publicationReceipt.publication_receipt_digest,
    database_digest: afterRead.database.sha256,
    db_csv_parity: true,
    db_xlsx_input_parity: true,
    db_xlsx_parity: true,
    xlsx_readback: "verified_from_workbook",
    legacy_pilot_copy_flag_seen: pilotCopy === true,
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
    ["--xlsx", "xlsxPath"],
    ["--xlsx-readback", "xlsxReadbackPath"],
    ["--artifact-manifest", "artifactManifestPath"],
    ["--artifact-manifest-digest", "artifactManifestDigest"],
    ["--binding", "bindingPath"],
    ["--binding-digest", "bindingDigest"],
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
    "Query-only verifier for a private-binding-authorized copied-ERP history projection.",
    "",
    "Usage:",
    "  node tools/project_history_copy_verifier.mjs --binding <private-binding.json> \\",
    "    --binding-digest <sha256> --attestation <sha256> \\",
    "    --db <existing-copy.sqlite> --generation-id <id> --csv <projection.csv> \\",
    "    --xlsx-input <projection.xlsx-input.json> --xlsx <projection.xlsx> \\",
    "    --xlsx-readback <projection.xlsx-readback.json> \\",
    "    --artifact-manifest <artifact-manifest.json> --artifact-manifest-digest <sha256> [--pilot-copy]",
    "",
    "The workbook is parsed directly; caller readback is only accepted when it equals that independent readback.",
    "The legacy --pilot-copy flag grants no authorization, and live/production DB paths remain refused.",
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

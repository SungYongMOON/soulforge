#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
  validateActualFiveLaneShadowGeneration,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION,
  assertProjectHistoryShadowProjectionAuthorityCurrentV1,
  getProjectHistoryShadowProjectionAuthorityPublicationLockSpecV1,
  validateProjectHistoryReceiptAdapterGenerationV2,
} from "../../../../guild_hall/shared/project_history_receipt_adapter_v2.mjs";
import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES,
  artifactRecord,
  assertProjectHistoryCopyBindingTarget,
  createProjectHistoryCopyArtifactManifest,
  inspectStandaloneProjectHistoryCopy,
  productionLookingPathReasons,
  readProjectHistoryCopyArtifactManifest,
  readProjectHistoryCopyBinding,
} from "./project_history_copy_binding.mjs";
import {
  PROJECT_HISTORY_COPY_COLUMNS,
  PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION,
  authorProjectHistoryCopyXlsx,
  readProjectHistoryCopyXlsx,
  renderProjectHistoryCopyXlsxReadback,
} from "./project_history_copy_xlsx.mjs";

export {
  PROJECT_HISTORY_COPY_COLUMNS,
  PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION,
  productionLookingPathReasons,
};

export const PROJECT_HISTORY_COPY_PROJECTION_CLAIM_CEILING = Object.freeze({
  scope: "windows_current_fixture_feature_off_shadow_pilot",
  supported_platform: "win32",
  production_ready: false,
  cross_platform_publication: false,
  accepted_history: false,
});

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/u;
const URI_OR_PATH_PATTERN = /^(?:https?|ftp|file|mailto|urn|data):|^[A-Za-z][A-Za-z0-9+.-]*:\/\/|^[A-Za-z]:[\\/]|^\\\\|[/\\]/iu;
const WINDOWS_PATH_LOCK_HELPER = fileURLToPath(
  new URL("./project_history_copy_windows_path_lock.ps1", import.meta.url),
);
const PATH_LOCK_WAIT_CELL = new Int32Array(new SharedArrayBuffer(4));
const PROJECTION_TABLES = Object.freeze([
  "project_history_generation",
  "project_history_event",
  "project_history_coverage",
  "project_history_publication_outbox",
  "project_history_publication_replay_guard",
  "project_history_publication_receipt",
]);
const PUBLICATION_ARTIFACT_KEYS = Object.freeze(["csv", "xlsx_input", "xlsx", "xlsx_readback"]);
const PUBLICATION_INTENT_FIELDS = Object.freeze([
  "schema_version",
  "project_id",
  "generation_id",
  "generation_digest",
  "ordered_event_digest",
  "ordered_row_digest",
  "artifacts",
  "publication_intent_digest",
]);
const PUBLICATION_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "project_id",
  "generation_id",
  "generation_digest",
  "publication_intent_digest",
  "binding_digest",
  "artifact_manifest_digest",
  "artifact_manifest_file_digest",
  "ordered_event_digest",
  "ordered_row_digest",
  "publication_receipt_digest",
]);
let expectedProjectionSchemaFingerprint = null;

export const PROJECT_HISTORY_COPY_PUBLICATION_INTENT_SCHEMA_VERSION =
  "soulforge.project_history_copy_publication_intent.v1";
export const PROJECT_HISTORY_COPY_PUBLICATION_RECEIPT_SCHEMA_VERSION =
  "soulforge.project_history_copy_publication_receipt.v1";
const PROJECT_HISTORY_COPY_PUBLICATION_REPLAY_GUARD_SCHEMA_VERSION =
  "soulforge.project_history_copy_publication_replay_guard.v1";

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

function assertGenerationAttestation(attestation, generation) {
  assertDigest(attestation, "attestation");
  const expected = sha256Canonical(generation);
  if (attestation !== expected) {
    fail("packet_attestation_mismatch", "Attestation does not match the canonical full generation packet");
  }
}

export function inspectStandaloneSqliteCopy(dbPath) {
  return inspectStandaloneProjectHistoryCopy(path.resolve(dbPath));
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

export function adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection(generation) {
  if (generation?.schema_version !== PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION) {
    fail("receipt_adapter_v2_schema_required", "Expected a receipt-adapter v2 generation");
  }
  validateProjectHistoryReceiptAdapterGenerationV2(generation);
  const projection = {
    schema_version: ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
    generation_id: generation.generation_id,
    project_ref: generation.project_ref,
    classification_state: "shadow",
    envelopes: generation.envelopes,
    coverage_receipts: generation.coverage_receipts,
    ordered_event_digest: generation.ordered_event_digest,
    source_attestation_digest: sha256Canonical({
      source_schema_version: generation.schema_version,
      source_generation_digest: generation.generation_digest,
      source_attestation_digest: generation.source_attestation_digest,
      authority_attestation_digest: generation.authority_attestation.attestation_digest,
      request_digest: generation.request_digest,
    }),
    raw_payload_copied: false,
    accepted_history: false,
  };
  validateActualFiveLaneShadowGeneration(projection);
  return Object.freeze(projection);
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

function assertPublicationArtifacts(value) {
  assertExactKeys(value, PUBLICATION_ARTIFACT_KEYS, "publication artifacts");
  for (const key of PUBLICATION_ARTIFACT_KEYS) {
    const record = value[key];
    assertExactKeys(record, ["filename", "size", "sha256"], `publication artifact ${key}`);
    if (record.filename !== PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES[key]
        || !Number.isSafeInteger(record.size) || record.size < 1) {
      fail("publication_artifact_invalid", `Publication artifact ${key} is invalid`);
    }
    assertDigest(record.sha256, `publication artifact ${key} sha256`);
  }
}

function publicationBody(value, fields, digestField) {
  return Object.fromEntries(fields
    .filter((field) => field !== digestField)
    .map((field) => [field, value[field]]));
}

export function createProjectHistoryCopyPublicationIntent({
  generation,
  model,
  artifacts,
}) {
  const body = {
    schema_version: PROJECT_HISTORY_COPY_PUBLICATION_INTENT_SCHEMA_VERSION,
    project_id: generation.project_ref.entity_id,
    generation_id: generation.generation_id,
    generation_digest: sha256Canonical(generation),
    ordered_event_digest: model.ordered_event_digest,
    ordered_row_digest: model.ordered_row_digest,
    artifacts,
  };
  return validateProjectHistoryCopyPublicationIntent({
    ...body,
    publication_intent_digest: sha256Canonical(body),
  });
}

export function validateProjectHistoryCopyPublicationIntent(value) {
  assertExactKeys(value, PUBLICATION_INTENT_FIELDS, "publication intent");
  if (value.schema_version !== PROJECT_HISTORY_COPY_PUBLICATION_INTENT_SCHEMA_VERSION) {
    fail("publication_intent_schema_invalid", "Unexpected publication intent schema");
  }
  for (const [label, digest] of [
    ["generation_digest", value.generation_digest],
    ["ordered_event_digest", value.ordered_event_digest],
    ["ordered_row_digest", value.ordered_row_digest],
    ["publication_intent_digest", value.publication_intent_digest],
  ]) assertDigest(digest, label);
  if (typeof value.project_id !== "string" || value.project_id.length === 0
      || typeof value.generation_id !== "string" || value.generation_id.length === 0) {
    fail("publication_intent_identity_invalid", "Publication intent identity is invalid");
  }
  assertPublicationArtifacts(value.artifacts);
  if (sha256Canonical(publicationBody(
    value,
    PUBLICATION_INTENT_FIELDS,
    "publication_intent_digest",
  )) !== value.publication_intent_digest) {
    fail("publication_intent_digest_mismatch", "Publication intent digest is invalid");
  }
  return value;
}

function createProjectHistoryCopyPublicationReceipt({
  intent,
  bindingDigest,
  artifactManifestDigest,
  artifactManifestFileDigest,
}) {
  const body = {
    schema_version: PROJECT_HISTORY_COPY_PUBLICATION_RECEIPT_SCHEMA_VERSION,
    project_id: intent.project_id,
    generation_id: intent.generation_id,
    generation_digest: intent.generation_digest,
    publication_intent_digest: intent.publication_intent_digest,
    binding_digest: bindingDigest,
    artifact_manifest_digest: artifactManifestDigest,
    artifact_manifest_file_digest: artifactManifestFileDigest,
    ordered_event_digest: intent.ordered_event_digest,
    ordered_row_digest: intent.ordered_row_digest,
  };
  return validateProjectHistoryCopyPublicationReceipt({
    ...body,
    publication_receipt_digest: sha256Canonical(body),
  });
}

export function validateProjectHistoryCopyPublicationReceipt(value) {
  assertExactKeys(value, PUBLICATION_RECEIPT_FIELDS, "publication receipt");
  if (value.schema_version !== PROJECT_HISTORY_COPY_PUBLICATION_RECEIPT_SCHEMA_VERSION) {
    fail("publication_receipt_schema_invalid", "Unexpected publication receipt schema");
  }
  for (const field of PUBLICATION_RECEIPT_FIELDS.filter((entry) => entry.endsWith("digest"))) {
    assertDigest(value[field], field);
  }
  if (typeof value.project_id !== "string" || value.project_id.length === 0
      || typeof value.generation_id !== "string" || value.generation_id.length === 0) {
    fail("publication_receipt_identity_invalid", "Publication receipt identity is invalid");
  }
  if (sha256Canonical(publicationBody(
    value,
    PUBLICATION_RECEIPT_FIELDS,
    "publication_receipt_digest",
  )) !== value.publication_receipt_digest) {
    fail("publication_receipt_digest_mismatch", "Publication receipt digest is invalid");
  }
  return value;
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

    CREATE TABLE IF NOT EXISTS project_history_publication_outbox (
      generation_id TEXT PRIMARY KEY NOT NULL REFERENCES project_history_generation(generation_id)
        ON DELETE RESTRICT,
      schema_version TEXT NOT NULL,
      project_id TEXT NOT NULL,
      generation_digest TEXT NOT NULL,
      ordered_event_digest TEXT NOT NULL,
      ordered_row_digest TEXT NOT NULL,
      artifacts_json TEXT NOT NULL,
      publication_intent_digest TEXT NOT NULL UNIQUE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_history_publication_receipt (
      generation_id TEXT PRIMARY KEY NOT NULL REFERENCES project_history_generation(generation_id)
        ON DELETE RESTRICT,
      schema_version TEXT NOT NULL,
      project_id TEXT NOT NULL,
      generation_digest TEXT NOT NULL,
      publication_intent_digest TEXT NOT NULL UNIQUE,
      binding_digest TEXT NOT NULL,
      artifact_manifest_digest TEXT NOT NULL UNIQUE,
      artifact_manifest_file_digest TEXT NOT NULL,
      ordered_event_digest TEXT NOT NULL,
      ordered_row_digest TEXT NOT NULL,
      publication_receipt_digest TEXT NOT NULL UNIQUE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_history_publication_replay_guard (
      generation_id TEXT PRIMARY KEY NOT NULL REFERENCES project_history_publication_outbox(generation_id)
        ON DELETE RESTRICT,
      schema_version TEXT NOT NULL,
      project_id TEXT NOT NULL,
      publication_intent_digest TEXT NOT NULL UNIQUE,
      binding_digest TEXT NOT NULL,
      authority_capability_digest TEXT NOT NULL,
      database_state_digest TEXT NOT NULL
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
    CREATE TRIGGER IF NOT EXISTS project_history_publication_outbox_no_update
      BEFORE UPDATE ON project_history_publication_outbox BEGIN
        SELECT RAISE(ABORT, 'project_history_publication_outbox is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_publication_outbox_guarded_delete
      BEFORE DELETE ON project_history_publication_outbox
      WHEN NOT EXISTS (
        SELECT 1 FROM project_history_publication_receipt AS receipt
        WHERE receipt.generation_id = OLD.generation_id
          AND receipt.publication_intent_digest = OLD.publication_intent_digest
      ) BEGIN
        SELECT RAISE(ABORT, 'project_history_publication_outbox requires a published receipt');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_publication_replay_guard_no_update
      BEFORE UPDATE ON project_history_publication_replay_guard BEGIN
        SELECT RAISE(ABORT, 'project_history_publication_replay_guard is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_publication_replay_guard_guarded_delete
      BEFORE DELETE ON project_history_publication_replay_guard
      WHEN NOT EXISTS (
        SELECT 1 FROM project_history_publication_receipt AS receipt
        WHERE receipt.generation_id = OLD.generation_id
          AND receipt.publication_intent_digest = OLD.publication_intent_digest
          AND receipt.binding_digest = OLD.binding_digest
      ) BEGIN
        SELECT RAISE(ABORT, 'project_history_publication_replay_guard requires a published receipt');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_publication_receipt_no_update
      BEFORE UPDATE ON project_history_publication_receipt BEGIN
        SELECT RAISE(ABORT, 'project_history_publication_receipt is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_publication_receipt_no_delete
      BEFORE DELETE ON project_history_publication_receipt BEGIN
        SELECT RAISE(ABORT, 'project_history_publication_receipt is immutable');
      END;
    CREATE TRIGGER IF NOT EXISTS project_history_publication_receipt_no_replace
      BEFORE INSERT ON project_history_publication_receipt
      WHEN EXISTS (
        SELECT 1 FROM project_history_publication_receipt AS receipt
        WHERE receipt.generation_id = NEW.generation_id
      ) BEGIN
        SELECT RAISE(ABORT, 'project_history_publication_receipt is immutable');
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

function publicationIntentFromRow(row) {
  if (row === undefined) return null;
  let artifacts;
  try {
    artifacts = JSON.parse(row.artifacts_json);
  } catch {
    fail("publication_intent_json_invalid", "Stored publication intent artifacts are invalid JSON");
  }
  return validateProjectHistoryCopyPublicationIntent({
    schema_version: row.schema_version,
    project_id: row.project_id,
    generation_id: row.generation_id,
    generation_digest: row.generation_digest,
    ordered_event_digest: row.ordered_event_digest,
    ordered_row_digest: row.ordered_row_digest,
    artifacts,
    publication_intent_digest: row.publication_intent_digest,
  });
}

function publicationReceiptFromRow(row) {
  if (row === undefined) return null;
  return validateProjectHistoryCopyPublicationReceipt({
    schema_version: row.schema_version,
    project_id: row.project_id,
    generation_id: row.generation_id,
    generation_digest: row.generation_digest,
    publication_intent_digest: row.publication_intent_digest,
    binding_digest: row.binding_digest,
    artifact_manifest_digest: row.artifact_manifest_digest,
    artifact_manifest_file_digest: row.artifact_manifest_file_digest,
    ordered_event_digest: row.ordered_event_digest,
    ordered_row_digest: row.ordered_row_digest,
    publication_receipt_digest: row.publication_receipt_digest,
  });
}

function quoteSqliteIdentifier(value) {
  return `"${String(value).replace(/"/gu, '""')}"`;
}

function projectHistoryCopyDatabaseStateDigest(db) {
  const schema = db.prepare(`
    SELECT type, name, tbl_name, sql
      FROM sqlite_schema
     WHERE name NOT LIKE 'sqlite_autoindex_%'
     ORDER BY type, name
  `).all().map((row) => ({
    type: row.type,
    name: row.name,
    table_name: row.tbl_name,
    sql: row.sql,
  }));
  const tables = db.prepare(`
    SELECT name
      FROM sqlite_schema
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name <> 'project_history_publication_replay_guard'
     ORDER BY name
  `).all().map(({ name }) => {
    const identifier = quoteSqliteIdentifier(name);
    const columns = db.prepare(`PRAGMA table_xinfo(${identifier})`).all();
    const expressions = columns.flatMap(({ name: column }, index) => {
      const quoted = quoteSqliteIdentifier(column);
      return [`typeof(${quoted}) AS type_${index}`, `quote(${quoted}) AS value_${index}`];
    });
    const orderBy = expressions.map((ignored, index) => String(index + 1)).join(", ");
    const rows = db.prepare(
      `SELECT ${expressions.join(", ")} FROM ${identifier} ORDER BY ${orderBy}`,
    ).all().map((row) => expressions.map((ignored, index) => row[
      `${index % 2 === 0 ? "type" : "value"}_${Math.floor(index / 2)}`
    ]));
    return {
      name,
      columns: columns.map((column) => ({
        cid: column.cid,
        name: column.name,
        type: column.type,
        notnull: column.notnull,
        default_value: column.dflt_value,
        primary_key: column.pk,
        hidden: column.hidden,
      })),
      rows,
    };
  });
  return sha256Canonical({
    schema,
    pragmas: {
      application_id: Number(db.prepare("PRAGMA application_id").get().application_id),
      user_version: Number(db.prepare("PRAGMA user_version").get().user_version),
    },
    tables,
  });
}

function publicationReplayGuardFromRow(row) {
  if (row === undefined) return null;
  if (row.schema_version !== PROJECT_HISTORY_COPY_PUBLICATION_REPLAY_GUARD_SCHEMA_VERSION
      || typeof row.project_id !== "string" || row.project_id.length === 0
      || typeof row.generation_id !== "string" || row.generation_id.length === 0) {
    fail("publication_replay_guard_invalid", "Stored publication replay guard is invalid");
  }
  for (const [label, digest] of [
    ["publication_intent_digest", row.publication_intent_digest],
    ["binding_digest", row.binding_digest],
    ["authority_capability_digest", row.authority_capability_digest],
    ["database_state_digest", row.database_state_digest],
  ]) assertDigest(digest, label);
  return Object.freeze({
    schema_version: row.schema_version,
    project_id: row.project_id,
    generation_id: row.generation_id,
    publication_intent_digest: row.publication_intent_digest,
    binding_digest: row.binding_digest,
    authority_capability_digest: row.authority_capability_digest,
    database_state_digest: row.database_state_digest,
  });
}

export function readProjectHistoryCopyPublicationState(db, generationId) {
  const pending = publicationIntentFromRow(db.prepare(
    "SELECT * FROM project_history_publication_outbox WHERE generation_id = ?",
  ).get(generationId));
  const receipt = publicationReceiptFromRow(db.prepare(
    "SELECT * FROM project_history_publication_receipt WHERE generation_id = ?",
  ).get(generationId));
  const replayGuard = publicationReplayGuardFromRow(db.prepare(
    "SELECT * FROM project_history_publication_replay_guard WHERE generation_id = ?",
  ).get(generationId));
  if ((pending !== null && receipt !== null)
      || (pending === null) !== (replayGuard === null)
      || (receipt !== null && replayGuard !== null)) {
    fail("publication_state_conflict", "Generation cannot be pending and published at the same time");
  }
  return Object.freeze({ pending, replay_guard: replayGuard, receipt });
}

function assertSamePublicationIntent(actual, expected) {
  if (actual === null
      || actual.publication_intent_digest !== expected.publication_intent_digest
      || canonicalJson(actual) !== canonicalJson(expected)) {
    fail("publication_intent_conflict", "Stored publication intent differs from deterministic artifacts");
  }
}

function insertPublicationIntent(db, intent) {
  validateProjectHistoryCopyPublicationIntent(intent);
  db.prepare(`
    INSERT INTO project_history_publication_outbox (
      generation_id, schema_version, project_id, generation_digest,
      ordered_event_digest, ordered_row_digest, artifacts_json,
      publication_intent_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    intent.generation_id,
    intent.schema_version,
    intent.project_id,
    intent.generation_digest,
    intent.ordered_event_digest,
    intent.ordered_row_digest,
    canonicalJson(intent.artifacts),
    intent.publication_intent_digest,
  );
}

function insertPublicationReplayGuard(
  db,
  intent,
  bindingDigest,
  authorityCapabilityDigest,
) {
  assertDigest(bindingDigest, "binding_digest");
  assertDigest(authorityCapabilityDigest, "authority_capability_digest");
  const databaseStateDigest = projectHistoryCopyDatabaseStateDigest(db);
  db.prepare(`
    INSERT INTO project_history_publication_replay_guard (
      generation_id, schema_version, project_id, publication_intent_digest,
      binding_digest, authority_capability_digest, database_state_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    intent.generation_id,
    PROJECT_HISTORY_COPY_PUBLICATION_REPLAY_GUARD_SCHEMA_VERSION,
    intent.project_id,
    intent.publication_intent_digest,
    bindingDigest,
    authorityCapabilityDigest,
    databaseStateDigest,
  );
}

function assertNoAcceptedGenerationPointer(db, generationId) {
  const candidates = db.prepare(`
    SELECT name
      FROM sqlite_schema
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT LIKE 'project_history_%'
     ORDER BY name
  `).all();
  for (const { name } of candidates) {
    const identifier = quoteSqliteIdentifier(name);
    const columns = db.prepare(`PRAGMA table_xinfo(${identifier})`).all();
    const generationColumn = columns.find((column) => column.name === "generation_id");
    if (generationColumn === undefined) continue;
    const acceptedColumn = columns.find((column) => column.name === "accepted_history");
    const tableLooksLikePointer = /(?:accepted|current)/iu.test(name);
    if (!tableLooksLikePointer && acceptedColumn === undefined) continue;
    const acceptedClause = acceptedColumn === undefined
      ? ""
      : ` AND ${quoteSqliteIdentifier(acceptedColumn.name)} = 1`;
    const found = db.prepare(`
      SELECT 1 AS found
        FROM ${identifier}
       WHERE ${quoteSqliteIdentifier(generationColumn.name)} = ?${acceptedClause}
       LIMIT 1
    `).get(generationId);
    if (found !== undefined) {
      fail("pending_replay_accepted_pointer", "Pending generation is already referenced by an accepted/current pointer");
    }
  }
}

function assertPendingPublicationReplay(
  db,
  generation,
  packetDigest,
  intent,
  bindingDigest,
  authorityCapabilityDigest,
) {
  assertCanonicalProjectHistoryProjectionSchema(db);
  if (!assertGenerationReplay(db, generation, packetDigest)) {
    fail("pending_replay_generation_missing", "Pending replay requires the exact durable generation");
  }
  const state = readProjectHistoryCopyPublicationState(db, generation.generation_id);
  if (state.pending === null || state.receipt !== null || state.replay_guard === null) {
    fail("pending_replay_not_authorized", "Only a durable pending publication can use same-binding replay");
  }
  assertSamePublicationIntent(state.pending, intent);
  if (state.replay_guard.project_id !== intent.project_id
      || state.replay_guard.publication_intent_digest !== intent.publication_intent_digest
      || state.replay_guard.binding_digest !== bindingDigest
      || state.replay_guard.authority_capability_digest !== authorityCapabilityDigest) {
    fail("pending_replay_guard_conflict", "Pending replay guard differs from the exact request or binding");
  }
  assertNoAcceptedGenerationPointer(db, generation.generation_id);
  if (projectHistoryCopyDatabaseStateDigest(db) !== state.replay_guard.database_state_digest) {
    fail("pending_replay_database_state_mismatch", "Copied database changed after the pending generation transaction");
  }
  return state;
}

function assertInitialOrPendingReplayTarget({
  binding,
  bindingDigest,
  dbPath,
  generation,
  packetDigest,
  intent,
  authorityCapabilityDigest,
  artifactPaths,
}) {
  try {
    return assertProjectHistoryCopyBindingTarget(binding, {
      bindingDigest,
      dbPath,
      projectId: generation.project_ref.entity_id,
      generationId: generation.generation_id,
      artifactPaths,
      requireDatabaseHash: true,
    });
  } catch (error) {
    if (error?.code !== "database_hash_mismatch") throw error;
  }
  const target = assertProjectHistoryCopyBindingTarget(binding, {
    bindingDigest,
    dbPath,
    projectId: generation.project_ref.entity_id,
    generationId: generation.generation_id,
    artifactPaths,
    requireDatabaseHash: false,
  });
  const db = new DatabaseSync(target.database.path, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON");
    assertPendingPublicationReplay(
      db,
      generation,
      packetDigest,
      intent,
      bindingDigest,
      authorityCapabilityDigest,
    );
  } finally {
    db.close();
  }
  return target;
}

function finalizePublicationReceipt(db, receipt, expectedIntent) {
  validateProjectHistoryCopyPublicationReceipt(receipt);
  const state = readProjectHistoryCopyPublicationState(db, receipt.generation_id);
  assertSamePublicationIntent(state.pending, expectedIntent);
  db.prepare(`
    INSERT INTO project_history_publication_receipt (
      generation_id, schema_version, project_id, generation_digest,
      publication_intent_digest, binding_digest, artifact_manifest_digest,
      artifact_manifest_file_digest, ordered_event_digest, ordered_row_digest,
      publication_receipt_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receipt.generation_id,
    receipt.schema_version,
    receipt.project_id,
    receipt.generation_digest,
    receipt.publication_intent_digest,
    receipt.binding_digest,
    receipt.artifact_manifest_digest,
    receipt.artifact_manifest_file_digest,
    receipt.ordered_event_digest,
    receipt.ordered_row_digest,
    receipt.publication_receipt_digest,
  );
  db.prepare(
    "DELETE FROM project_history_publication_replay_guard WHERE generation_id = ?",
  ).run(receipt.generation_id);
  db.prepare(
    "DELETE FROM project_history_publication_outbox WHERE generation_id = ?",
  ).run(receipt.generation_id);
}

function directoryIdentity(directory, entry, real) {
  return Object.freeze({
    path: path.resolve(directory),
    realpath: real,
    dev: entry.dev,
    ino: entry.ino,
    nlink: entry.nlink,
  });
}

function sameDirectoryIdentity(left, right, { requireSamePath = true } = {}) {
  return (!requireSamePath
      || normalizePathForComparison(left.path) === normalizePathForComparison(right.path))
    && left.dev === right.dev
    && left.ino === right.ino;
}

function inspectDirectDirectory(directory, { allowMissing = false } = {}) {
  const resolved = path.resolve(directory);
  let entry;
  try {
    entry = lstatSync(resolved, { bigint: true });
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    fail("projection_directory_missing", "Artifact directory component does not exist");
  }
  let real;
  try {
    real = realpathSync.native(resolved);
  } catch {
    fail("projection_directory_changed", "Artifact directory component changed during inspection");
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()
      || normalizePathForComparison(real) !== normalizePathForComparison(resolved)) {
    fail(
      "projection_directory_not_direct",
      "Artifact directory path contains a reparse point, symlink, or non-directory component",
    );
  }
  return directoryIdentity(resolved, entry, real);
}

function assertDirectoryIdentityCurrent(identity) {
  const current = inspectDirectDirectory(identity.path);
  if (!sameDirectoryIdentity(current, identity)) {
    fail("projection_directory_identity_changed", "Artifact directory physical identity changed");
  }
  return current;
}

function assertBoundDirectoryIdentity(identity, expectedIdentity) {
  if (expectedIdentity.platform !== process.platform
      || normalizePathForComparison(identity.realpath)
        !== normalizePathForComparison(expectedIdentity.realpath)
      || String(identity.dev) !== expectedIdentity.dev
      || String(identity.ino) !== expectedIdentity.ino) {
    fail("projection_root_identity_mismatch", "Bound projection root identity changed");
  }
}

function directDirectoryAncestorChain(directory) {
  // The binding pins this root itself. Holding its DELETE identity without
  // FILE_SHARE_DELETE prevents replacing or renaming the bound root while
  // child components are created and published.
  return [inspectDirectDirectory(path.resolve(directory))];
}

function waitForPathLockSignal(primaryPath, resultPath, code) {
  const deadline = process.hrtime.bigint() + 15_000_000_000n;
  while (!existsSync(primaryPath)) {
    if (existsSync(resultPath)) {
      const result = readFileSync(resultPath, "utf8");
      fail(code, `Windows path lock helper failed (${result})`);
    }
    if (process.hrtime.bigint() >= deadline) {
      fail(code, "Windows path lock helper timed out");
    }
    Atomics.wait(PATH_LOCK_WAIT_CELL, 0, 0, 10);
  }
}

function removePathLockControlDirectory(controlDirectory) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(controlDirectory, { recursive: true, force: true });
      return;
    } catch {
      Atomics.wait(PATH_LOCK_WAIT_CELL, 0, 0, 10);
    }
  }
}

function acquireWindowsPathLock(
  identities,
  { renameCapable = false, publicationAuthority = null } = {},
) {
  if (process.platform !== "win32") {
    fail(
      "secure_path_lock_unavailable",
      "Shadow artifact publication is fail-closed without the Windows identity-bound path lock",
    );
  }
  if (!Array.isArray(identities) || identities.length < 1) {
    fail("secure_path_lock_invalid", "At least one physical path identity must be locked");
  }
  const systemRoot = process.env.SystemRoot;
  if (typeof systemRoot !== "string" || !path.isAbsolute(systemRoot)) {
    fail("secure_path_lock_unavailable", "Windows SystemRoot is unavailable");
  }
  const controlDirectory = mkdtempSync(path.join(tmpdir(), "sf-ph-path-lock-"));
  const specPath = path.join(controlDirectory, "spec.json");
  const readyPath = path.join(controlDirectory, "ready");
  const releasePath = path.join(controlDirectory, "release");
  const resultPath = path.join(controlDirectory, "result");
  const addCommandPath = path.join(controlDirectory, "add.json");
  const addAckPath = path.join(controlDirectory, "added");
  const renameCommandPath = path.join(controlDirectory, "rename.json");
  const renameAckPath = path.join(controlDirectory, "renamed");
  const renameIndex = renameCapable ? identities.length - 1 : -1;
  writeFileSync(specPath, JSON.stringify({
    locks: identities.map((identity, index) => ({
      path: identity.path,
      dev: String(identity.dev),
      ino: String(identity.ino),
      directory: identity.directory !== false,
      rename_capable: index === renameIndex,
    })),
    authority: publicationAuthority,
  }), { flag: "wx", mode: 0o600 });
  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const child = spawn(powershell, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    WINDOWS_PATH_LOCK_HELPER,
    "-SpecPath",
    specPath,
    "-ReadyPath",
    readyPath,
    "-ReleasePath",
    releasePath,
    "-ResultPath",
    resultPath,
    "-AddCommandPath",
    addCommandPath,
    "-AddAckPath",
    addAckPath,
    "-RenameCommandPath",
    renameCommandPath,
    "-RenameAckPath",
    renameAckPath,
    "-ParentProcessId",
    String(process.pid),
  ], { windowsHide: true, stdio: "ignore" });
  child.on("error", () => {});
  let released = false;
  let added = renameCapable;
  let renamed = false;
  try {
    waitForPathLockSignal(readyPath, resultPath, "secure_path_lock_failed");
  } catch (error) {
    try {
      child.kill();
    } catch {
      // Best effort only; the helper also exits when its parent disappears.
    }
    removePathLockControlDirectory(controlDirectory);
    throw error;
  }
  return Object.freeze({
    addRenameIdentity(identity, { directory = true } = {}) {
      if (released || added) {
        fail("secure_path_lock_add_invalid", "Path lock cannot add this rename identity");
      }
      const temporaryAddPath = `${addCommandPath}.tmp`;
      writeFileSync(temporaryAddPath, JSON.stringify({
        path: identity.path,
        dev: String(identity.dev),
        ino: String(identity.ino),
        directory,
      }), { flag: "wx", mode: 0o600 });
      renameSync(temporaryAddPath, addCommandPath);
      waitForPathLockSignal(addAckPath, resultPath, "secure_path_lock_add_failed");
      added = true;
    },
    renameTo(targetPath, { replace = false } = {}) {
      const relativeName = path.relative(identities[0].path, path.resolve(targetPath));
      if (!added || released || renamed
          || relativeName === ""
          || path.isAbsolute(relativeName)
          || relativeName === ".."
          || relativeName.startsWith(`..${path.sep}`)) {
        fail("secure_handle_rename_invalid", "Path lock cannot perform this rename");
      }
      const temporaryCommandPath = `${renameCommandPath}.tmp`;
      writeFileSync(temporaryCommandPath, JSON.stringify({
        relative_name: relativeName,
        replace,
      }), { flag: "wx", mode: 0o600 });
      renameSync(temporaryCommandPath, renameCommandPath);
      waitForPathLockSignal(renameAckPath, resultPath, "secure_handle_rename_failed");
      renamed = true;
    },
    release() {
      if (released) return;
      released = true;
      try {
        writeFileSync(releasePath, "release", { flag: "wx", mode: 0o600 });
        waitForPathLockSignal(resultPath, resultPath, "secure_path_lock_release_failed");
        const result = readFileSync(resultPath, "utf8");
        if (result !== "ok") fail("secure_path_lock_release_failed", result);
      } finally {
        try {
          child.kill();
        } catch {
          // The helper normally exited after writing its result.
        }
        removePathLockControlDirectory(controlDirectory);
      }
    },
  });
}

function fileIdentity(filePath, entry, real) {
  return Object.freeze({
    path: path.resolve(filePath),
    realpath: real,
    dev: entry.dev,
    ino: entry.ino,
    nlink: entry.nlink,
    size: entry.size,
    mtime_ns: entry.mtimeNs,
    ctime_ns: entry.ctimeNs,
  });
}

function sameFileIdentity(left, right, { requireSamePath = true } = {}) {
  return (!requireSamePath
      || normalizePathForComparison(left.path) === normalizePathForComparison(right.path))
    && left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtime_ns === right.mtime_ns
    && left.ctime_ns === right.ctime_ns;
}

function inspectDirectArtifactFile(filePath, { allowMissing = false } = {}) {
  const resolved = path.resolve(filePath);
  let entry;
  try {
    entry = lstatSync(resolved, { bigint: true });
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    fail("artifact_output_missing", "Projection artifact is missing");
  }
  let real;
  try {
    real = realpathSync.native(resolved);
  } catch {
    fail("artifact_output_changed", "Projection artifact changed during inspection");
  }
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n
      || normalizePathForComparison(real) !== normalizePathForComparison(resolved)) {
    fail("artifact_output_not_standalone", "Projection artifacts must be direct single-link files");
  }
  return fileIdentity(resolved, entry, real);
}

function assertArtifactFileIdentityCurrent(identity) {
  const current = inspectDirectArtifactFile(identity.path);
  if (!sameFileIdentity(current, identity)) {
    fail("artifact_output_changed", "Projection artifact physical identity changed");
  }
  return current;
}

function readDirectArtifactBytes(filePath) {
  const before = inspectDirectArtifactFile(filePath);
  const bytes = readFileSync(before.path);
  const after = inspectDirectArtifactFile(before.path);
  if (!sameFileIdentity(before, after) || bytes.length !== Number(after.size)) {
    fail("artifact_output_changed", "Projection artifact changed during stable read");
  }
  return Object.freeze({ identity: after, bytes, digest: sha256Bytes(bytes) });
}

function assertDirectArtifactBytes(filePath, expectedBytes) {
  const current = readDirectArtifactBytes(filePath);
  if (!current.bytes.equals(expectedBytes)) {
    fail("artifact_output_conflict", "Existing immutable projection artifact bytes differ");
  }
  return current;
}

function writeExclusiveDirectArtifact(filePath, bytes) {
  const resolved = path.resolve(filePath);
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let descriptor;
  try {
    descriptor = openSync(
      resolved,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
      0o600,
    );
    writeFileSync(descriptor, bytes);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const written = inspectDirectArtifactFile(resolved);
  const readback = readDirectArtifactBytes(resolved);
  if (!sameFileIdentity(written, readback.identity)
      || readback.bytes.length !== bytes.length
      || readback.digest !== sha256Bytes(bytes)) {
    fail("artifact_output_changed", "Staged projection artifact bytes changed after write");
  }
  return written;
}

function assertBoundDatabaseIdentityCurrent(dbPath, expectedIdentity) {
  const resolved = path.resolve(dbPath);
  let entry;
  let real;
  try {
    entry = lstatSync(resolved, { bigint: true });
    real = realpathSync.native(resolved);
  } catch {
    fail("database_identity_changed", "Copied database identity changed at the commit fence");
  }
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n
      || normalizePathForComparison(real) !== normalizePathForComparison(resolved)
      || String(entry.dev) !== expectedIdentity.dev
      || String(entry.ino) !== expectedIdentity.ino
      || Number(entry.nlink) !== expectedIdentity.nlink) {
    fail("database_identity_changed", "Copied database identity changed at the commit fence");
  }
}

function validateTestHooks(testHooks) {
  if (testHooks === null) return Object.freeze({});
  if (typeof testHooks !== "object" || Array.isArray(testHooks)
      || Object.getPrototypeOf(testHooks) !== Object.prototype) {
    fail("test_hooks_invalid", "Test hooks must be a plain object");
  }
  const allowed = new Set([
    "beforeDatabaseCommit",
    "beforeDatabaseMutation",
    "beforeArtifactBundlePublish",
    "afterArtifactManifestPublish",
    "afterArtifactParentCheckBeforeMutation",
  ]);
  for (const [key, value] of Object.entries(testHooks)) {
    if (!allowed.has(key) || typeof value !== "function") {
      fail("test_hooks_invalid", "Test hooks contain an unsupported boundary");
    }
  }
  return testHooks;
}

function invokeTestHook(hooks, name, context) {
  const result = hooks[name]?.(context);
  if (result !== null && typeof result === "object" && typeof result.then === "function") {
    fail("test_hook_async_forbidden", "Projector boundary hooks must be synchronous");
  }
}

function assertExistingArtifactPathPrefixDirect(projectionRoot, directory) {
  const root = path.resolve(projectionRoot);
  const target = path.resolve(directory);
  const relative = path.relative(root, target);
  if (relative === "" || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    fail("projection_root_mismatch", "Artifact directory must be a project/generation child of the bound root");
  }
  const chain = [inspectDirectDirectory(root)];
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    for (const identity of chain) assertDirectoryIdentityCurrent(identity);
    cursor = path.join(cursor, segment);
    const identity = inspectDirectDirectory(cursor, { allowMissing: true });
    if (identity === null) break;
    chain.push(identity);
  }
  for (const identity of chain) assertDirectoryIdentityCurrent(identity);
}

function releasePathLocks(locks, { suppressErrors = false } = {}) {
  let firstError = null;
  for (const lock of [...locks].reverse()) {
    try {
      lock.release();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (!suppressErrors && firstError !== null) throw firstError;
}

function prepareDirectArtifactDirectory(
  projectionRoot,
  expectedRootIdentity,
  directory,
  publicationAuthority,
  beforeMutation,
  hooks,
) {
  const root = path.resolve(projectionRoot);
  const target = path.resolve(directory);
  const relative = path.relative(root, target);
  if (relative === "" || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    fail("projection_root_mismatch", "Artifact directory must be a project/generation child of the bound root");
  }
  const segments = relative.split(path.sep);
  const parentSegments = segments.slice(0, -1);
  const ancestorChain = directDirectoryAncestorChain(root);
  assertBoundDirectoryIdentity(ancestorChain.at(-1), expectedRootIdentity);
  const chain = [ancestorChain.at(-1)];
  const created = [];
  const locks = [];
  let publicationParentLock = null;
  let targetLock = null;
  let cursor = root;
  try {
    invokeTestHook(hooks, "afterArtifactParentCheckBeforeMutation", {
      boundary: "acquire_root_identity_lock",
      parent: path.dirname(root),
      target: root,
    });
    beforeMutation();
    invokeTestHook(hooks, "afterArtifactParentCheckBeforeMutation", {
      boundary: "acquire_publication_authority_lock",
      parent: path.dirname(root),
      target: root,
    });
    const rootLock = acquireWindowsPathLock(ancestorChain, { publicationAuthority });
    locks.push(rootLock);
    publicationParentLock = rootLock;
    for (const identity of ancestorChain) assertDirectoryIdentityCurrent(identity);
    for (const [index, segment] of parentSegments.entries()) {
      for (const identity of chain) assertDirectoryIdentityCurrent(identity);
      cursor = path.join(cursor, segment);
      let identity = inspectDirectDirectory(cursor, { allowMissing: true });
      if (identity === null) {
        beforeMutation();
        for (const prior of chain) assertDirectoryIdentityCurrent(prior);
        invokeTestHook(hooks, "afterArtifactParentCheckBeforeMutation", {
          boundary: "mkdir_component",
          parent: path.dirname(cursor),
          target: cursor,
        });
        try {
          mkdirSync(cursor, { recursive: false, mode: 0o700 });
        } catch {
          fail("projection_directory_create_failed", "Direct artifact directory component could not be created");
        }
        identity = inspectDirectDirectory(cursor);
        created.push(identity);
      }
      const componentLock = acquireWindowsPathLock([identity]);
      locks.push(componentLock);
      assertDirectoryIdentityCurrent(identity);
      chain.push(identity);
    }
  } catch (error) {
    releasePathLocks(locks, { suppressErrors: true });
    throw error;
  }
  let targetIdentity;
  try {
    targetIdentity = inspectDirectDirectory(target, { allowMissing: true });
    for (const identity of chain) assertDirectoryIdentityCurrent(identity);
    if (targetIdentity !== null) {
      targetLock = acquireWindowsPathLock([targetIdentity]);
      locks.push(targetLock);
      assertDirectoryIdentityCurrent(targetIdentity);
    }
  } catch (error) {
    releasePathLocks(locks, { suppressErrors: true });
    throw error;
  }

  return Object.freeze({
    root,
    target,
    parent: path.dirname(target),
    targetIdentity,
    assertParentCurrent() {
      for (const identity of chain) assertDirectoryIdentityCurrent(identity);
    },
    assertTargetAbsent() {
      for (const identity of chain) assertDirectoryIdentityCurrent(identity);
      if (inspectDirectDirectory(target, { allowMissing: true }) !== null) {
        fail("artifact_bundle_conflict", "Immutable artifact bundle target already exists");
      }
    },
    assertTargetCurrent() {
      for (const identity of chain) assertDirectoryIdentityCurrent(identity);
      if (targetIdentity === null) {
        fail("artifact_bundle_missing", "Expected immutable artifact bundle is missing");
      }
      assertDirectoryIdentityCurrent(targetIdentity);
    },
    cleanupCreated() {
      // Empty direct components are harmless and remain locked until release;
      // pathname cleanup would recreate the race this guard is designed to close.
      void created;
    },
    addBundleRenameIdentity(identity) {
      if (publicationParentLock === null) {
        fail("secure_path_lock_missing", "Artifact publication parent is not identity-locked");
      }
      publicationParentLock.addRenameIdentity(identity, { directory: true });
      return publicationParentLock;
    },
    addReplayManifestRenameIdentity(identity) {
      if (targetLock === null || publicationParentLock === null) {
        fail("secure_path_lock_missing", "Replay artifact directory is not identity-locked");
      }
      publicationParentLock.addRenameIdentity(identity, { directory: false });
      return publicationParentLock;
    },
    releaseLocks({ suppressErrors = false } = {}) {
      releasePathLocks(locks, { suppressErrors });
    },
  });
}

function stageArtifactBundle(pathGuard, artifacts, beforeMutation, hooks) {
  beforeMutation();
  pathGuard.assertTargetAbsent();
  const stagePath = path.join(
    pathGuard.parent,
    `.${path.basename(pathGuard.target)}.staging-${randomBytes(16).toString("hex")}`,
  );
  invokeTestHook(hooks, "afterArtifactParentCheckBeforeMutation", {
    boundary: "mkdir_staging_bundle",
    parent: pathGuard.parent,
    target: stagePath,
  });
  mkdirSync(stagePath, { recursive: false, mode: 0o700 });
  const stageIdentity = inspectDirectDirectory(stagePath);
  const stageLock = pathGuard.addBundleRenameIdentity(stageIdentity);
  assertDirectoryIdentityCurrent(stageIdentity);
  const files = [];
  try {
    for (const [filename, bytes] of artifacts) {
      beforeMutation();
      pathGuard.assertTargetAbsent();
      assertDirectoryIdentityCurrent(stageIdentity);
      files.push(writeExclusiveDirectArtifact(path.join(stagePath, filename), bytes));
    }
    pathGuard.assertTargetAbsent();
    assertDirectoryIdentityCurrent(stageIdentity);
    return Object.freeze({
      path: stagePath,
      identity: stageIdentity,
      lock: stageLock,
      files,
    });
  } catch (error) {
    cleanupStagedArtifactBundle(pathGuard, {
      path: stagePath,
      identity: stageIdentity,
      lock: stageLock,
      files,
    });
    throw error;
  }
}

function appendStagedArtifact(pathGuard, stage, filename, bytes, beforeMutation) {
  beforeMutation();
  pathGuard.assertTargetAbsent();
  assertDirectoryIdentityCurrent(stage.identity);
  stage.files.push(writeExclusiveDirectArtifact(path.join(stage.path, filename), bytes));
  assertDirectoryIdentityCurrent(stage.identity);
}

function cleanupStagedArtifactBundle(pathGuard, stage) {
  try {
    pathGuard.assertParentCurrent();
    assertDirectoryIdentityCurrent(stage.identity);
    for (const identity of [...stage.files].reverse()) {
      assertArtifactFileIdentityCurrent(identity);
      unlinkSync(identity.path);
    }
  } catch {
    // A changed parent or component must never be followed for cleanup.
  } finally {
    try {
      pathGuard.assertParentCurrent();
      if (inspectDirectDirectory(stage.path, { allowMissing: true }) !== null) {
        rmdirSync(stage.path);
      }
    } catch {
      // Leaving a hidden non-published staging directory is safer than racing cleanup.
    }
  }
}

function publishNewArtifactBundle(pathGuard, stage, assertAuthorityCurrent, hooks) {
  invokeTestHook(hooks, "beforeArtifactBundlePublish", { mode: "new_bundle" });
  assertAuthorityCurrent();
  pathGuard.assertTargetAbsent();
  assertDirectoryIdentityCurrent(stage.identity);
  invokeTestHook(hooks, "afterArtifactParentCheckBeforeMutation", {
    boundary: "publish_bundle_handle_rename",
    parent: pathGuard.parent,
    target: pathGuard.target,
  });
  // The native helper holds the exact authority identity/bytes against writes
  // and replacement, then checks trusted time immediately before this rename.
  stage.lock.renameTo(pathGuard.target);
  const published = inspectDirectDirectory(pathGuard.target);
  if (!sameDirectoryIdentity(published, stage.identity, { requireSamePath: false })) {
    fail("artifact_bundle_identity_changed", "Published artifact bundle identity differs from staging");
  }
  pathGuard.assertParentCurrent();
}

function publishReplayManifest(
  pathGuard,
  manifestPath,
  manifestBytes,
  assertAuthorityCurrent,
  hooks,
) {
  pathGuard.assertTargetCurrent();
  const current = readDirectArtifactBytes(manifestPath);
  if (current.bytes.equals(manifestBytes)) return;
  assertAuthorityCurrent();
  pathGuard.assertTargetCurrent();
  const temporaryPath = path.join(
    pathGuard.target,
    `.${path.basename(manifestPath)}.staging-${randomBytes(16).toString("hex")}`,
  );
  const temporaryIdentity = writeExclusiveDirectArtifact(temporaryPath, manifestBytes);
  const temporaryLock = pathGuard.addReplayManifestRenameIdentity(temporaryIdentity);
  try {
    invokeTestHook(hooks, "beforeArtifactBundlePublish", { mode: "replay_manifest" });
    assertAuthorityCurrent();
    pathGuard.assertTargetCurrent();
    assertArtifactFileIdentityCurrent(current.identity);
    assertArtifactFileIdentityCurrent(temporaryIdentity);
    invokeTestHook(hooks, "afterArtifactParentCheckBeforeMutation", {
      boundary: "publish_replay_manifest_handle_rename",
      parent: pathGuard.target,
      target: manifestPath,
    });
    // The target helper retains the same authority guard through replacement.
    temporaryLock.renameTo(manifestPath, { replace: true });
    pathGuard.assertTargetCurrent();
    assertDirectArtifactBytes(manifestPath, manifestBytes);
  } catch (error) {
    try {
      pathGuard.assertTargetCurrent();
      const temporary = inspectDirectArtifactFile(temporaryPath, { allowMissing: true });
      if (temporary !== null && sameFileIdentity(temporary, temporaryIdentity)) {
        unlinkSync(temporaryPath);
      }
    } catch {
      // A changed directory identity must not be followed for cleanup.
    }
    throw error;
  }
}

function validateStandaloneProjectionInputs({
  dbPath,
  generation,
  csvPath,
  xlsxInputPath,
  xlsxPath,
  xlsxReadbackPath,
  artifactManifestPath,
  bindingPath,
  bindingDigest,
  attestation,
}) {
  if (generation?.schema_version !== ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION) {
    fail("generation_schema_invalid", "Standalone validation expects an actual Shadow generation");
  }
  validateActualFiveLaneShadowGeneration(generation);
  assertGenerationAttestation(attestation, generation);
  if (typeof bindingPath !== "string" || bindingPath.length === 0) {
    fail("binding_required", "A private copied-ERP binding path is required");
  }
  if (typeof bindingDigest !== "string" || bindingDigest.length === 0) {
    fail("binding_digest_required", "An externally pinned private binding digest is required");
  }
  const requestedArtifacts = {
    csvPath,
    xlsxInputPath,
    xlsxPath,
    xlsxReadbackPath,
    artifactManifestPath,
  };
  const paths = [dbPath, ...Object.values(requestedArtifacts)];
  if (paths.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    fail("path_required", "DB, CSV, XLSX-input, XLSX, readback, and artifact-manifest paths are required");
  }
  if (new Set(paths.map(normalizePathForComparison)).size !== paths.length) {
    fail("output_path_collision", "DB and every projection artifact path must be distinct");
  }
  const binding = readProjectHistoryCopyBinding(path.resolve(bindingPath), {
    expectedDigest: bindingDigest,
  });
  assertProjectHistoryCopyBindingTarget(binding, {
    bindingDigest,
    dbPath,
    projectId: generation.project_ref.entity_id,
    generationId: generation.generation_id,
    artifactPaths: requestedArtifacts,
    requireDatabaseHash: true,
  });
  return Object.freeze({
    status: "validation_only_no_write",
    feature_state: "off",
    generation_id: generation.generation_id,
    event_count: generation.envelopes.length,
    coverage_count: generation.coverage_receipts.length,
    generation_digest: attestation,
    binding_digest: binding.binding_digest,
    live_authority_granted: false,
    mutation_authorized: false,
    raw_payload_copied: false,
    accepted_history: false,
  });
}

export function projectCopiedErpHistory({
  dbPath,
  generation,
  csvPath,
  xlsxInputPath,
  xlsxPath,
  xlsxReadbackPath,
  artifactManifestPath,
  bindingPath,
  bindingDigest,
  authoritySnapshot,
  pilotCopy = false,
  attestation = null,
  testHooks = null,
}) {
  if (generation?.schema_version === PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION) {
    fail(
      "receipt_adapter_v2_projection_adapter_required",
      "Validate and adapt v2 with adaptProjectHistoryReceiptAdapterGenerationV2ToCopyProjection first",
    );
  }
  if (generation?.schema_version !== ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION) {
    fail("generation_schema_invalid", "Unexpected actual Shadow generation schema");
  }
  validateActualFiveLaneShadowGeneration(generation);
  assertGenerationAttestation(attestation, generation);
  const hooks = validateTestHooks(testHooks);
  const assertAuthorityCurrent = () => (
    assertProjectHistoryShadowProjectionAuthorityCurrentV1(authoritySnapshot)
  );
  assertAuthorityCurrent();
  const publicationAuthority =
    getProjectHistoryShadowProjectionAuthorityPublicationLockSpecV1(authoritySnapshot);
  const authorityCapabilityDigest = sha256Canonical(publicationAuthority);
  if (typeof bindingPath !== "string" || bindingPath.length === 0) {
    fail("binding_required", "A private copied-ERP binding path is required");
  }
  if (typeof bindingDigest !== "string" || bindingDigest.length === 0) {
    fail("binding_digest_required", "An externally pinned private binding digest is required");
  }
  const binding = readProjectHistoryCopyBinding(path.resolve(bindingPath), {
    expectedDigest: bindingDigest,
  });
  const requestedArtifacts = {
    csvPath,
    xlsxInputPath,
    xlsxPath,
    xlsxReadbackPath,
    artifactManifestPath,
  };
  const paths = [dbPath, ...Object.values(requestedArtifacts)];
  if (paths.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    fail("path_required", "DB, CSV, XLSX-input, XLSX, readback, and artifact-manifest paths are required");
  }
  if (new Set(paths.map(normalizePathForComparison)).size !== paths.length) {
    fail("output_path_collision", "DB and every projection artifact path must be distinct");
  }
  const bound = assertProjectHistoryCopyBindingTarget(binding, {
    bindingDigest,
    dbPath,
    projectId: generation.project_ref.entity_id,
    generationId: generation.generation_id,
    artifactPaths: requestedArtifacts,
    requireDatabaseHash: false,
  });
  assertExistingArtifactPathPrefixDirect(
    binding.projection_root,
    bound.artifactPaths.directory,
  );

  const model = buildCanonicalProjectHistoryCopyModel(generation);
  const csv = renderProjectHistoryCopyCsv(model);
  const xlsxInput = renderProjectHistoryCopyXlsxInput(model);
  const xlsx = authorProjectHistoryCopyXlsx(model);
  const xlsxReadback = readProjectHistoryCopyXlsx(xlsx);
  const csvBytes = Buffer.from(csv, "utf8");
  const xlsxInputBytes = Buffer.from(xlsxInput, "utf8");
  const xlsxReadbackBytes = Buffer.from(renderProjectHistoryCopyXlsxReadback(xlsxReadback), "utf8");
  const artifactRecords = Object.freeze({
    csv: artifactRecord(PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.csv, csvBytes),
    xlsx_input: artifactRecord(PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_input, xlsxInputBytes),
    xlsx: artifactRecord(PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx, xlsx),
    xlsx_readback: artifactRecord(PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_readback, xlsxReadbackBytes),
  });
  const publicationIntent = createProjectHistoryCopyPublicationIntent({
    generation,
    model,
    artifacts: artifactRecords,
  });
  const deterministicArtifacts = Object.freeze([
    [PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.csv, csvBytes],
    [PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_input, xlsxInputBytes],
    [PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx, xlsx],
    [PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_readback, xlsxReadbackBytes],
  ]);

  const preOpen = assertInitialOrPendingReplayTarget({
    binding,
    bindingDigest,
    dbPath,
    generation,
    packetDigest: attestation,
    intent: publicationIntent,
    authorityCapabilityDigest,
    artifactPaths: requestedArtifacts,
  });
  assertAuthorityCurrent();
  assertBoundDatabaseIdentityCurrent(dbPath, preOpen.database.identity);
  const pathGuard = prepareDirectArtifactDirectory(
    binding.projection_root,
    binding.projection_root_identity,
    bound.artifactPaths.directory,
    publicationAuthority,
    assertAuthorityCurrent,
    hooks,
  );
  let stage = null;
  let db = null;
  let replayed = false;
  let publicationReceipt = null;
  let artifactManifest = null;
  let manifestBytes = null;
  let postCommit = null;
  let finalDatabase = null;
  let publicationError = null;
  try {
    if (pathGuard.targetIdentity === null) {
      stage = stageArtifactBundle(
        pathGuard,
        deterministicArtifacts,
        assertAuthorityCurrent,
        hooks,
      );
    } else {
      pathGuard.assertTargetCurrent();
    }

    assertAuthorityCurrent();
    assertBoundDatabaseIdentityCurrent(dbPath, preOpen.database.identity);
    invokeTestHook(hooks, "beforeDatabaseMutation", {
      staged: stage !== null,
      stagePath: stage?.path ?? null,
    });
    db = new DatabaseSync(preOpen.database.path);
    db.exec("PRAGMA foreign_keys = ON");
    assertAuthorityCurrent();
    assertBoundDatabaseIdentityCurrent(dbPath, preOpen.database.identity);
    db.exec("BEGIN IMMEDIATE");
    try {
      createProjectHistoryProjectionSchema(db);
      assertCanonicalProjectHistoryProjectionSchema(db);
      replayed = assertGenerationReplay(db, generation, attestation);
      if (!replayed) {
        assertNoEventRefConflict(db, generation);
        assertNoAcceptedGenerationPointer(db, generation.generation_id);
        insertGeneration(db, generation, attestation);
        insertPublicationIntent(db, publicationIntent);
        insertPublicationReplayGuard(
          db,
          publicationIntent,
          binding.binding_digest,
          authorityCapabilityDigest,
        );
      } else {
        const state = readProjectHistoryCopyPublicationState(db, generation.generation_id);
        if (state.pending !== null) {
          assertPendingPublicationReplay(
            db,
            generation,
            attestation,
            publicationIntent,
            binding.binding_digest,
            authorityCapabilityDigest,
          );
        } else if (state.receipt !== null) {
          if (state.receipt.project_id !== publicationIntent.project_id
              || state.receipt.generation_digest !== publicationIntent.generation_digest
              || state.receipt.publication_intent_digest !== publicationIntent.publication_intent_digest
              || state.receipt.ordered_event_digest !== publicationIntent.ordered_event_digest
              || state.receipt.ordered_row_digest !== publicationIntent.ordered_row_digest) {
            fail("publication_receipt_conflict", "Published receipt differs from deterministic generation artifacts");
          }
          publicationReceipt = state.receipt;
        } else {
          fail("publication_state_missing", "Stored generation has neither pending intent nor published receipt");
        }
      }
      invokeTestHook(hooks, "beforeDatabaseCommit", {
        generationId: generation.generation_id,
        replayed,
      });
      assertAuthorityCurrent();
      assertBoundDatabaseIdentityCurrent(dbPath, preOpen.database.identity);
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The original error is the actionable failure.
      }
      throw error;
    }

    if (stage === null) {
      pathGuard.assertTargetCurrent();
      assertDirectArtifactBytes(csvPath, csvBytes);
      assertDirectArtifactBytes(xlsxInputPath, xlsxInputBytes);
      assertDirectArtifactBytes(xlsxPath, xlsx);
      assertDirectArtifactBytes(xlsxReadbackPath, xlsxReadbackBytes);
    }

    postCommit = assertProjectHistoryCopyBindingTarget(binding, {
      bindingDigest,
      dbPath,
      projectId: generation.project_ref.entity_id,
      generationId: generation.generation_id,
      artifactPaths: requestedArtifacts,
      requireDatabaseHash: false,
    });

    if (publicationReceipt !== null) {
      if (pathGuard.targetIdentity === null) {
        fail("published_artifact_bundle_missing", "Published receipt exists without its immutable artifact bundle");
      }
      const publishedManifestBytes = readDirectArtifactBytes(artifactManifestPath);
      if (publishedManifestBytes.digest !== publicationReceipt.artifact_manifest_file_digest) {
        fail("published_manifest_file_mismatch", "Published manifest bytes differ from the immutable receipt");
      }
      artifactManifest = readProjectHistoryCopyArtifactManifest(artifactManifestPath, {
        expectedDigest: publicationReceipt.artifact_manifest_digest,
      });
      if (artifactManifest.project_id !== publicationReceipt.project_id
          || artifactManifest.generation_id !== publicationReceipt.generation_id
          || artifactManifest.generation_digest !== publicationReceipt.generation_digest
          || artifactManifest.binding_digest !== publicationReceipt.binding_digest
          || artifactManifest.ordered_event_digest !== publicationReceipt.ordered_event_digest
          || artifactManifest.ordered_row_digest !== publicationReceipt.ordered_row_digest
          || canonicalJson(artifactManifest.artifacts) !== canonicalJson(publicationIntent.artifacts)) {
        fail("published_manifest_receipt_mismatch", "Published manifest differs from the immutable receipt");
      }
      manifestBytes = publishedManifestBytes.bytes;
    } else {
      artifactManifest = createProjectHistoryCopyArtifactManifest({
        binding,
        projectId: generation.project_ref.entity_id,
        generationId: generation.generation_id,
        generationDigest: attestation,
        databaseBeforeSha256: binding.database_sha256,
        databaseAfterSha256: postCommit.database.sha256,
        orderedEventDigest: model.ordered_event_digest,
        orderedRowDigest: model.ordered_row_digest,
        artifacts: artifactRecords,
      });
      manifestBytes = Buffer.from(`${canonicalJson(artifactManifest)}\n`, "utf8");
      if (stage !== null) {
        appendStagedArtifact(
          pathGuard,
          stage,
          PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.manifest,
          manifestBytes,
          assertAuthorityCurrent,
        );
        publishNewArtifactBundle(pathGuard, stage, assertAuthorityCurrent, hooks);
      } else {
        publishReplayManifest(
          pathGuard,
          artifactManifestPath,
          manifestBytes,
          assertAuthorityCurrent,
          hooks,
        );
      }
      assertDirectArtifactBytes(artifactManifestPath, manifestBytes);
      invokeTestHook(hooks, "afterArtifactManifestPublish", {
        generationId: generation.generation_id,
        artifactManifestDigest: artifactManifest.artifact_manifest_digest,
      });
      assertAuthorityCurrent();
      assertBoundDatabaseIdentityCurrent(dbPath, preOpen.database.identity);
      publicationReceipt = createProjectHistoryCopyPublicationReceipt({
        intent: publicationIntent,
        bindingDigest: binding.binding_digest,
        artifactManifestDigest: artifactManifest.artifact_manifest_digest,
        artifactManifestFileDigest: sha256Bytes(manifestBytes),
      });
      db.exec("BEGIN IMMEDIATE");
      try {
        finalizePublicationReceipt(db, publicationReceipt, publicationIntent);
        assertAuthorityCurrent();
        assertBoundDatabaseIdentityCurrent(dbPath, preOpen.database.identity);
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // The original error is the actionable failure.
        }
        throw error;
      }
    }

    finalDatabase = assertProjectHistoryCopyBindingTarget(binding, {
      bindingDigest,
      dbPath,
      projectId: generation.project_ref.entity_id,
      generationId: generation.generation_id,
      artifactPaths: requestedArtifacts,
      requireDatabaseHash: false,
    });
  } catch (error) {
    publicationError = error;
    if (stage !== null) cleanupStagedArtifactBundle(pathGuard, stage);
    pathGuard.cleanupCreated();
    throw error;
  } finally {
    if (db !== null) db.close();
    pathGuard.releaseLocks({ suppressErrors: publicationError !== null });
  }
  return Object.freeze({
    status: replayed ? "replayed" : "inserted",
    feature_state: "off",
    legacy_pilot_copy_flag_seen: pilotCopy === true,
    binding_digest: binding.binding_digest,
    generation_id: generation.generation_id,
    event_count: model.event_count,
    coverage_count: model.coverage_count,
    ordered_event_digest: model.ordered_event_digest,
    ordered_row_digest: model.ordered_row_digest,
    csv_digest: sha256Bytes(csvBytes),
    xlsx_input_digest: sha256Bytes(xlsxInputBytes),
    xlsx_digest: sha256Bytes(xlsx),
    xlsx_readback_digest: sha256Bytes(xlsxReadbackBytes),
    database_before_digest: binding.database_sha256,
    database_generation_commit_digest: postCommit.database.sha256,
    database_after_digest: finalDatabase.database.sha256,
    publication_intent_digest: publicationIntent.publication_intent_digest,
    publication_receipt_digest: publicationReceipt.publication_receipt_digest,
    artifact_manifest_digest: artifactManifest.artifact_manifest_digest,
    artifact_manifest_file_digest: sha256Bytes(manifestBytes),
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
    ["--xlsx", "xlsxPath"],
    ["--xlsx-readback", "xlsxReadbackPath"],
    ["--artifact-manifest", "artifactManifestPath"],
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
    "Validation-only feature-OFF copied-ERP project-history projector CLI.",
    "",
    "Usage:",
    "  node tools/project_history_copy_projector.mjs --binding <private-binding.json> \\",
    "    --binding-digest <sha256> --attestation <sha256> \\",
    "    --db <existing-copy.sqlite> --packet <actual-generation.json> \\",
    "    --csv <project_history.csv> --xlsx-input <project_history.xlsx-input.json> \\",
    "    --xlsx <project_history.xlsx> --xlsx-readback <project_history.xlsx-readback.json> \\",
    "    --artifact-manifest <project_history.artifact-manifest.json> [--pilot-copy]",
    "",
    "The attestation is sha256Canonical(full actual-generation packet).",
    "Without --pilot-copy, this CLI validates the packet, binding, and exact paths without writing.",
    "The legacy --pilot-copy mutation path is refused; authorized writes use the one-shot entrypoint.",
    "Live/production paths are always refused.",
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
    if (options.pilotCopy === true) {
      fail(
        "standalone_projection_mutation_forbidden",
        "Standalone projector CLI cannot carry the opaque external authority capability",
      );
    }
    for (const key of [
      "dbPath",
      "packetPath",
      "csvPath",
      "xlsxInputPath",
      "xlsxPath",
      "xlsxReadbackPath",
      "artifactManifestPath",
      "bindingPath",
      "bindingDigest",
      "attestation",
    ]) {
      if (typeof options[key] !== "string" || options[key].length === 0) {
        fail("argument_required", `${key} is required`);
      }
    }
    const generation = JSON.parse(readFileSync(path.resolve(options.packetPath), "utf8").replace(/^\uFEFF/u, ""));
    const result = validateStandaloneProjectionInputs({ ...options, generation });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "projection_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exit(1);
  }
}

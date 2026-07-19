import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  closeSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  assertCanonicalProjectHistoryProjectionSchema,
  buildCanonicalProjectHistoryCopyModel,
  canonicalProjectHistoryProjectionSchemaFingerprint,
  renderProjectHistoryCopyCsv,
} from "../../dev-erp/tools/project_history_copy_projector.mjs";
import {
  parseProjectHistoryCopyCsv,
  readValidatedProjectHistoryGenerationQueryOnly,
  validateProjectHistoryCopyXlsxInput,
  verifyXlsxReadbackManifest,
} from "../../dev-erp/tools/project_history_copy_verifier.mjs";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "binary");
const ATTESTATION_RE = /^sha256:[0-9a-f]{64}$/u;
const TICKET_RE = /^sfphd_v1_[A-Za-z0-9_-]{43}$/u;
const PATH_ID_RE = /^(?=.{1,256}$)(?=.*[A-Za-z0-9])[A-Za-z0-9_@+.-]+$/u;
const DEFAULT_TICKET_TTL_MS = 60_000;
const DEFAULT_MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ACTIVE_TICKETS = 32;
const DEFAULT_MAX_ACTIVE_TICKET_BYTES = 128 * 1024 * 1024;
const MAX_ARTIFACT_ATTESTATION_BYTES = 1024 * 1024;
const ARTIFACT_ATTESTATION_FILENAME = "project_history.artifact-attestation.json";
const ARTIFACT_FILENAMES = Object.freeze({
  csv: "project_history.csv",
  xlsx_input: "project_history.xlsx-input.json",
  xlsx_readback: "project_history.xlsx-readback.json",
  xlsx: "project_history.xlsx",
});
const ARTIFACT_KEYS = Object.freeze(Object.keys(ARTIFACT_FILENAMES));
const ARTIFACT_ATTESTATION_FIELDS = Object.freeze([
  "schema_version",
  "project_id",
  "generation_id",
  "generation_digest",
  "projection_schema_fingerprint",
  "ordered_event_digest",
  "ordered_row_digest",
  "artifacts",
]);
const ARTIFACT_RECORD_FIELDS = Object.freeze(["filename", "size", "sha256"]);
const XLSX_REQUIRED_ZIP_ENTRIES = Object.freeze([
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/worksheets/sheet1.xml",
]);

export const PROJECT_HISTORY_MCP_ARTIFACT_ATTESTATION_SCHEMA_VERSION =
  "soulforge.project_history_mcp_artifact_attestation.v1";

export class ProjectHistoryMcpError extends Error {
  constructor(code, status = 500) {
    super(code);
    this.name = "ProjectHistoryMcpError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 500) {
  throw new ProjectHistoryMcpError(code, status);
}

function unavailable(status = 404) {
  fail("project_history_unavailable", status);
}

function assertExactKeys(value, expected, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code);
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail(code);
  }
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !ATTESTATION_RE.test(value)) fail(code);
  return value;
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function decodeUtf8(bytes, code) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(code);
  }
}

function decodeUtf8Json(bytes, code) {
  try {
    return JSON.parse(decodeUtf8(bytes, code).replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error instanceof ProjectHistoryMcpError) throw error;
    fail(code);
  }
}

function normalizedPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizedPath(left) === normalizedPath(right);
}

function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function plainExistingPath(value, { directory, code }) {
  if (typeof value !== "string" || !path.isAbsolute(value)) fail(code);
  const resolved = path.resolve(value);
  let entry;
  let real;
  try {
    entry = lstatSync(resolved);
    real = realpathSync(resolved);
  } catch {
    fail(code);
  }
  if (entry.isSymbolicLink() || !samePath(real, resolved)) fail(code);
  if (directory ? !entry.isDirectory() : !entry.isFile()) fail(code);
  return Object.freeze({ path: resolved, stat: entry });
}

function inspectStandaloneCopy(dbPath) {
  const inspected = plainExistingPath(dbPath, {
    directory: false,
    code: "project_history_copy_db_invalid",
  });
  if (inspected.stat.nlink !== 1) fail("project_history_copy_db_not_standalone");
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(`${inspected.path}${suffix}`)) fail("project_history_copy_db_not_standalone");
  }
  const header = Buffer.alloc(SQLITE_HEADER.length);
  let descriptor;
  try {
    descriptor = openSync(inspected.path, "r");
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length || !header.equals(SQLITE_HEADER)) {
      fail("project_history_copy_db_invalid");
    }
  } catch (error) {
    if (error instanceof ProjectHistoryMcpError) throw error;
    fail("project_history_copy_db_invalid");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return inspected.path;
}

function assertPathId(value) {
  if (typeof value !== "string" || !PATH_ID_RE.test(value)
      || value === "." || value === ".." || value.includes("...")
      || value.startsWith(".") || value.endsWith(".")) {
    unavailable();
  }
  return value;
}

function assertConfiguredBearer(value) {
  if (typeof value !== "string" || !/^[\x21-\x7e]{32,256}$/u.test(value)) {
    fail("project_history_bearer_required");
  }
  return value;
}

function digestToken(value) {
  return createHash("sha256").update(String(value), "utf8").digest();
}

function bearerCandidate(authorization) {
  const match = /^Bearer ([^\s]+)$/u.exec(String(authorization || ""));
  return match ? match[1] : "";
}

function totalChanges(db) {
  return Number(db.prepare("SELECT total_changes() AS count").get().count);
}

function buildHistorySnapshot(generation) {
  const events = generation.envelopes.map((envelope, sortOrdinal) => Object.freeze({
    sort_ordinal: sortOrdinal,
    occurrence_id: envelope.occurrence_id,
    lane: envelope.lane,
    event_at: envelope.event_at,
    valid_at: envelope.valid_at,
    observed_at: envelope.observed_at,
    known_at: envelope.known_at,
    recorded_at: envelope.recorded_at,
    metadata_digest: envelope.metadata_digest,
  }));
  const coverage = generation.coverage_receipts.map((receipt) => Object.freeze({
    lane: receipt.lane,
    state: receipt.state,
    event_count: receipt.event_count,
    gap_codes: Object.freeze([...receipt.gap_codes]),
    ordered_event_digest: receipt.ordered_event_digest,
    metadata_digest: receipt.metadata_digest,
  }));
  return Object.freeze({
    project_id: generation.project_ref.entity_id,
    generation_id: generation.generation_id,
    schema_version: generation.schema_version,
    classification_state: generation.classification_state,
    event_count: events.length,
    coverage_count: coverage.length,
    ordered_event_digest: generation.ordered_event_digest,
    source_attestation_digest: generation.source_attestation_digest,
    raw_payload_copied: false,
    accepted_history: false,
    events: Object.freeze(events),
    coverage: Object.freeze(coverage),
  });
}

function readBoundGenerationTransaction(db, attestation) {
  db.exec("BEGIN");
  try {
    const projectionSchemaFingerprint = assertCanonicalProjectHistoryProjectionSchema(db);
    const rows = db.prepare(`
      SELECT project_id, generation_id
        FROM project_history_generation
       WHERE packet_digest = ?
       ORDER BY project_id, generation_id
    `).all(attestation);
    if (rows.length !== 1) fail("full_generation_attestation_unbound");
    const projectId = assertPathId(rows[0].project_id);
    const generationId = assertPathId(rows[0].generation_id);
    const generation = readValidatedProjectHistoryGenerationQueryOnly(
      db,
      generationId,
      attestation,
      { projectId },
    );
    const model = buildCanonicalProjectHistoryCopyModel(generation);
    const history = buildHistorySnapshot(generation);
    if (totalChanges(db) !== 0) fail("project_history_query_only_guard_failed");
    db.exec("COMMIT");
    return Object.freeze({
      projectId,
      generationId,
      attestation,
      generation,
      model,
      history,
      projectionSchemaFingerprint,
    });
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the original read-validation failure.
    }
    throw error;
  }
}

function resolveGenerationArtifactDirectory(root, projectId, generationId) {
  const projectDirectory = path.join(root, projectId);
  const generationDirectory = path.join(projectDirectory, generationId);
  if (!containedBy(root, generationDirectory)) unavailable();
  for (const candidate of [projectDirectory, generationDirectory]) {
    let inspected;
    try {
      inspected = plainExistingPath(candidate, {
        directory: true,
        code: "project_history_unavailable",
      });
    } catch {
      unavailable();
    }
    if (!containedBy(root, inspected.path)) unavailable();
  }
  return generationDirectory;
}

function loadSealedFile(root, generationDirectory, filename, maxBytes) {
  const artifactPath = path.join(generationDirectory, filename);
  if (!containedBy(root, artifactPath)) unavailable();
  let inspected;
  try {
    inspected = plainExistingPath(artifactPath, {
      directory: false,
      code: "project_history_unavailable",
    });
  } catch {
    unavailable();
  }
  if (!containedBy(root, inspected.path) || inspected.stat.nlink !== 1) unavailable();

  let before;
  let bytes;
  let after;
  let real;
  try {
    before = lstatSync(artifactPath);
    if (!Number.isSafeInteger(before.size) || before.size < 1 || before.size > maxBytes) unavailable();
    bytes = readFileSync(artifactPath);
    after = lstatSync(artifactPath);
    real = realpathSync(artifactPath);
  } catch (error) {
    if (error instanceof ProjectHistoryMcpError) throw error;
    unavailable();
  }
  if (bytes.length !== before.size
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || after.isSymbolicLink()
      || after.nlink !== 1
      || !samePath(real, artifactPath)) {
    unavailable();
  }
  const digest = sha256Bytes(bytes);
  return Object.freeze({
    filename,
    bytes,
    size: bytes.length,
    digest,
    sha256: digest.slice("sha256:".length),
  });
}

function assertXlsxContainer(artifact) {
  const bytes = artifact.bytes;
  const localHeader = bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const endOfCentralDirectory = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const searchStart = Math.max(0, bytes.length - 65_557);
  if (!localHeader || endOfCentralDirectory < searchStart
      || XLSX_REQUIRED_ZIP_ENTRIES.some((entry) => bytes.indexOf(Buffer.from(entry, "utf8")) < 0)) {
    fail("project_history_xlsx_container_invalid");
  }
}

function validateArtifactAttestation(
  value,
  externalDigest,
  { bound, projectionSchemaFingerprint, artifacts },
) {
  assertExactKeys(value, ARTIFACT_ATTESTATION_FIELDS, "project_history_artifact_attestation_invalid");
  if (sha256Canonical(value) !== externalDigest) fail("project_history_artifact_attestation_mismatch");
  if (value.schema_version !== PROJECT_HISTORY_MCP_ARTIFACT_ATTESTATION_SCHEMA_VERSION
      || value.project_id !== bound.projectId
      || value.generation_id !== bound.generationId
      || value.generation_digest !== bound.attestation
      || value.projection_schema_fingerprint !== projectionSchemaFingerprint
      || value.projection_schema_fingerprint !== canonicalProjectHistoryProjectionSchemaFingerprint()
      || value.ordered_event_digest !== bound.generation.ordered_event_digest
      || value.ordered_row_digest !== bound.model.ordered_row_digest) {
    fail("project_history_artifact_attestation_invalid");
  }
  assertExactKeys(value.artifacts, ARTIFACT_KEYS, "project_history_artifact_attestation_invalid");
  for (const key of ARTIFACT_KEYS) {
    const record = value.artifacts[key];
    const artifact = artifacts[key];
    assertExactKeys(record, ARTIFACT_RECORD_FIELDS, "project_history_artifact_attestation_invalid");
    assertDigest(record.sha256, "project_history_artifact_attestation_invalid");
    if (record.filename !== ARTIFACT_FILENAMES[key]
        || !Number.isSafeInteger(record.size) || record.size < 1
        || record.size !== artifact.size
        || record.sha256 !== artifact.digest) {
      fail("project_history_artifact_attestation_invalid");
    }
  }
  return Object.freeze(value);
}

function loadAndValidateSealedArtifacts({
  root,
  bound,
  externalAttestationDigest,
  maxArtifactBytes,
}) {
  const generationDirectory = resolveGenerationArtifactDirectory(
    root,
    bound.projectId,
    bound.generationId,
  );
  const attestationFile = loadSealedFile(
    root,
    generationDirectory,
    ARTIFACT_ATTESTATION_FILENAME,
    Math.min(maxArtifactBytes, MAX_ARTIFACT_ATTESTATION_BYTES),
  );
  const artifacts = Object.fromEntries(ARTIFACT_KEYS.map((key) => [
    key,
    loadSealedFile(root, generationDirectory, ARTIFACT_FILENAMES[key], maxArtifactBytes),
  ]));
  assertXlsxContainer(artifacts.xlsx);

  const expectedCsv = Buffer.from(renderProjectHistoryCopyCsv(bound.model), "utf8");
  if (!artifacts.csv.bytes.equals(expectedCsv)) fail("project_history_csv_parity_invalid");
  const csvRows = parseProjectHistoryCopyCsv(
    decodeUtf8(artifacts.csv.bytes, "project_history_csv_invalid"),
  );
  if (canonicalJson(csvRows) !== canonicalJson(bound.model.rows)) {
    fail("project_history_csv_parity_invalid");
  }
  validateProjectHistoryCopyXlsxInput(
    decodeUtf8Json(artifacts.xlsx_input.bytes, "project_history_xlsx_input_invalid"),
    bound.model,
  );
  verifyXlsxReadbackManifest(
    decodeUtf8Json(artifacts.xlsx_readback.bytes, "project_history_xlsx_readback_invalid"),
    bound.model,
  );
  validateArtifactAttestation(
    decodeUtf8Json(attestationFile.bytes, "project_history_artifact_attestation_invalid"),
    externalAttestationDigest,
    { bound, projectionSchemaFingerprint: bound.projectionSchemaFingerprint, artifacts },
  );
  return Object.freeze({
    csv: artifacts.csv,
    xlsx: artifacts.xlsx,
  });
}

function parseSingleRange(value, size) {
  if (value === undefined) return Object.freeze({ start: 0, end: size - 1, partial: false });
  const text = String(value);
  if (text.includes(",")) fail("project_history_range_invalid", 416);
  let match = /^bytes=(\d+)-(\d*)$/u.exec(text);
  if (match) {
    const start = Number(match[1]);
    const requestedEnd = match[2] === "" ? size - 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)
        || start >= size || requestedEnd < start) {
      fail("project_history_range_invalid", 416);
    }
    return Object.freeze({ start, end: Math.min(requestedEnd, size - 1), partial: true });
  }
  match = /^bytes=-(\d+)$/u.exec(text);
  if (match) {
    const suffix = Number(match[1]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) fail("project_history_range_invalid", 416);
    return Object.freeze({ start: Math.max(size - suffix, 0), end: size - 1, partial: true });
  }
  fail("project_history_range_invalid", 416);
}

export function createProjectHistoryMcpService({
  dbPath,
  projectionRoot,
  attestation,
  artifactAttestation,
  bearerToken,
  pilotCopy = false,
  now = () => Date.now(),
  ticketTtlMs = DEFAULT_TICKET_TTL_MS,
  maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES,
  maxActiveTickets = DEFAULT_MAX_ACTIVE_TICKETS,
  maxActiveTicketBytes = DEFAULT_MAX_ACTIVE_TICKET_BYTES,
} = {}) {
  if (pilotCopy !== true) fail("project_history_mcp_feature_off");
  if (typeof attestation !== "string" || !ATTESTATION_RE.test(attestation)) {
    fail("full_generation_attestation_required");
  }
  if (typeof artifactAttestation !== "string" || !ATTESTATION_RE.test(artifactAttestation)) {
    fail("project_history_artifact_attestation_required");
  }
  const tokenDigest = digestToken(assertConfiguredBearer(bearerToken));
  if (!Number.isSafeInteger(ticketTtlMs) || ticketTtlMs < 1_000 || ticketTtlMs > 5 * 60_000) {
    fail("project_history_ticket_ttl_invalid");
  }
  if (!Number.isSafeInteger(maxArtifactBytes) || maxArtifactBytes < 1 || maxArtifactBytes > DEFAULT_MAX_ARTIFACT_BYTES) {
    fail("project_history_artifact_limit_invalid");
  }
  if (!Number.isSafeInteger(maxActiveTickets) || maxActiveTickets < 1 || maxActiveTickets > 128) {
    fail("project_history_ticket_limit_invalid");
  }
  if (!Number.isSafeInteger(maxActiveTicketBytes)
      || maxActiveTicketBytes < 1
      || maxActiveTicketBytes > 1024 * 1024 * 1024) {
    fail("project_history_ticket_byte_limit_invalid");
  }

  const copyPath = inspectStandaloneCopy(dbPath);
  const root = plainExistingPath(projectionRoot, {
    directory: true,
    code: "project_history_projection_root_invalid",
  }).path;
  let db;
  try {
    db = new DatabaseSync(copyPath, { readOnly: true });
    db.exec("PRAGMA query_only=ON");
    if (Number(db.prepare("PRAGMA query_only").get().query_only) !== 1) {
      fail("project_history_query_only_guard_failed");
    }
    if (totalChanges(db) !== 0) fail("project_history_query_only_guard_failed");
  } catch (error) {
    if (db) db.close();
    if (error instanceof ProjectHistoryMcpError) throw error;
    fail("project_history_copy_db_invalid");
  }

  let bound;
  let sealedArtifacts;
  try {
    bound = readBoundGenerationTransaction(db, attestation);
    sealedArtifacts = loadAndValidateSealedArtifacts({
      root,
      bound,
      externalAttestationDigest: artifactAttestation,
      maxArtifactBytes,
    });
    if (totalChanges(db) !== 0) fail("project_history_query_only_guard_failed");
  } catch (error) {
    db.close();
    if (error instanceof ProjectHistoryMcpError) throw error;
    fail("project_history_projection_or_artifact_invalid");
  }

  const tickets = new Map();
  let activeTicketBytes = 0;
  let closed = false;

  function assertOpen() {
    if (closed) fail("project_history_service_closed", 503);
  }

  function deleteTicket(ticket) {
    const record = tickets.get(ticket);
    if (record === undefined) return false;
    tickets.delete(ticket);
    activeTicketBytes -= record.artifact.size;
    return true;
  }

  function pruneTickets() {
    const current = now();
    for (const [ticket, record] of tickets) {
      if (record.expiresAt <= current) deleteTicket(ticket);
    }
  }

  function exactGeneration(projectId, generationId) {
    assertOpen();
    assertPathId(projectId);
    assertPathId(generationId);
    if (projectId !== bound.projectId || generationId !== bound.generationId) unavailable();
    if (totalChanges(db) !== 0) fail("project_history_query_only_guard_failed");
    return bound.history;
  }

  return Object.freeze({
    authenticate(authorization) {
      assertOpen();
      const candidateDigest = digestToken(bearerCandidate(authorization));
      if (!timingSafeEqual(tokenDigest, candidateDigest)) unavailable();
      return true;
    },

    getProjectHistory(projectId, generationId) {
      return exactGeneration(projectId, generationId);
    },

    prepareDownload(projectId, generationId, format) {
      exactGeneration(projectId, generationId);
      if (format !== "csv" && format !== "xlsx") unavailable();
      pruneTickets();
      if (tickets.size >= maxActiveTickets) fail("project_history_ticket_capacity", 503);
      const artifact = sealedArtifacts[format];
      if (artifact.size > maxActiveTicketBytes - activeTicketBytes) {
        fail("project_history_ticket_byte_capacity", 503);
      }
      const ticket = `sfphd_v1_${randomBytes(32).toString("base64url")}`;
      const createdAt = now();
      const expiresAt = createdAt + ticketTtlMs;
      tickets.set(ticket, Object.freeze({
        artifact,
        format,
        expiresAt,
      }));
      activeTicketBytes += artifact.size;
      return Object.freeze({
        ticket,
        filename: artifact.filename,
        size: artifact.size,
        sha256: artifact.sha256,
        expires_at: new Date(expiresAt).toISOString(),
      });
    },

    consumeDownload(ticket, rangeHeader) {
      assertOpen();
      if (typeof ticket !== "string" || !TICKET_RE.test(ticket)) unavailable();
      const record = tickets.get(ticket);
      if (record === undefined) unavailable();
      if (record.expiresAt <= now()) {
        deleteTicket(ticket);
        unavailable();
      }
      const range = parseSingleRange(rangeHeader, record.artifact.size);
      deleteTicket(ticket);
      return Object.freeze({
        filename: record.artifact.filename,
        format: record.format,
        sha256: record.artifact.sha256,
        size: record.artifact.size,
        start: range.start,
        end: range.end,
        partial: range.partial,
        bytes: record.artifact.bytes.subarray(range.start, range.end + 1),
      });
    },

    diagnostics() {
      assertOpen();
      pruneTickets();
      return Object.freeze({
        feature_state: "off",
        query_only: Number(db.prepare("PRAGMA query_only").get().query_only) === 1,
        total_changes: totalChanges(db),
        projection_schema_fingerprint: bound.projectionSchemaFingerprint,
        sealed_artifact_bytes: sealedArtifacts.csv.size + sealedArtifacts.xlsx.size,
        active_tickets: tickets.size,
        active_ticket_bytes: activeTicketBytes,
      });
    },

    close() {
      if (closed) return;
      closed = true;
      tickets.clear();
      activeTicketBytes = 0;
      db.close();
    },
  });
}

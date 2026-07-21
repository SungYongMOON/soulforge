import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalJson,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  assertCanonicalProjectHistoryProjectionSchema,
  buildCanonicalProjectHistoryCopyModel,
  createProjectHistoryCopyPublicationIntent,
  readProjectHistoryCopyPublicationState,
  renderProjectHistoryCopyCsv,
} from "../../dev-erp/tools/project_history_copy_projector.mjs";
import {
  PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES,
  assertProjectHistoryCopyBindingTarget,
  readProjectHistoryCopyArtifactManifest,
  readProjectHistoryCopyBinding,
  resolveProjectHistoryCopyArtifactPaths,
} from "../../dev-erp/tools/project_history_copy_binding.mjs";
import {
  parseProjectHistoryCopyCsv,
  readValidatedProjectHistoryGenerationQueryOnly,
  validateProjectHistoryCopyXlsxInput,
  verifyXlsxReadbackManifest,
} from "../../dev-erp/tools/project_history_copy_verifier.mjs";
import {
  readProjectHistoryCopyXlsx,
  verifyProjectHistoryCopyXlsxReadback,
} from "../../dev-erp/tools/project_history_copy_xlsx.mjs";

const ATTESTATION_RE = /^sha256:[0-9a-f]{64}$/u;
const TICKET_RE = /^sfphd_v1_[A-Za-z0-9_-]{43}$/u;
const EXACT_ID_RE = /^(?=.{1,256}$)(?=.*[A-Za-z0-9])[A-Za-z0-9_:@+.-]+$/u;
const DEFAULT_TICKET_TTL_MS = 60_000;
const DEFAULT_MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ACTIVE_TICKETS = 32;
const DEFAULT_MAX_ACTIVE_TICKET_BYTES = 128 * 1024 * 1024;
const ARTIFACT_KEYS = Object.freeze(["csv", "xlsx_input", "xlsx", "xlsx_readback"]);
const ARTIFACT_PATH_KEYS = Object.freeze({
  csv: "csvPath",
  xlsx_input: "xlsxInputPath",
  xlsx: "xlsxPath",
  xlsx_readback: "xlsxReadbackPath",
});

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

function assertPathId(value) {
  if (typeof value !== "string" || !EXACT_ID_RE.test(value)
      || value === "." || value === ".." || value.includes("...")) {
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

function readBoundGenerationTransaction(db, manifest) {
  db.exec("BEGIN");
  try {
    const projectionSchemaFingerprint = assertCanonicalProjectHistoryProjectionSchema(db);
    const publicationState = readProjectHistoryCopyPublicationState(db, manifest.generation_id);
    if (publicationState.pending !== null) fail("project_history_publication_pending");
    if (publicationState.receipt === null) fail("project_history_publication_receipt_missing");
    const publicationReceipt = publicationState.receipt;
    if (publicationReceipt.project_id !== manifest.project_id
        || publicationReceipt.generation_id !== manifest.generation_id
        || publicationReceipt.generation_digest !== manifest.generation_digest
        || publicationReceipt.binding_digest !== manifest.binding_digest
        || publicationReceipt.artifact_manifest_digest !== manifest.artifact_manifest_digest
        || publicationReceipt.ordered_event_digest !== manifest.ordered_event_digest
        || publicationReceipt.ordered_row_digest !== manifest.ordered_row_digest) {
      fail("project_history_artifact_manifest_invalid");
    }
    const rows = db.prepare(`
      SELECT project_id, generation_id
        FROM project_history_generation
       WHERE project_id = ? AND generation_id = ? AND packet_digest = ?
       ORDER BY project_id, generation_id
    `).all(manifest.project_id, manifest.generation_id, manifest.generation_digest);
    if (rows.length !== 1) fail("full_generation_attestation_unbound");
    const projectId = assertPathId(rows[0].project_id);
    const generationId = assertPathId(rows[0].generation_id);
    const generation = readValidatedProjectHistoryGenerationQueryOnly(
      db,
      generationId,
      manifest.generation_digest,
      { projectId },
    );
    const model = buildCanonicalProjectHistoryCopyModel(generation);
    const history = buildHistorySnapshot(generation);
    if (totalChanges(db) !== 0) fail("project_history_query_only_guard_failed");
    db.exec("COMMIT");
    return Object.freeze({
      projectId,
      generationId,
      attestation: manifest.generation_digest,
      generation,
      model,
      history,
      projectionSchemaFingerprint,
      publicationReceipt,
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

function loadSealedFile(root, artifactPath, filename, maxBytes) {
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

function loadAndValidateSealedArtifacts({
  root,
  bound,
  manifest,
  artifactPaths,
  maxArtifactBytes,
}) {
  const generationDirectory = plainExistingPath(artifactPaths.directory, {
    directory: true,
    code: "project_history_unavailable",
  }).path;
  if (!containedBy(root, generationDirectory)) unavailable();
  const artifacts = Object.fromEntries(ARTIFACT_KEYS.map((key) => [
    key,
    loadSealedFile(
      root,
      artifactPaths[ARTIFACT_PATH_KEYS[key]],
      PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES[key],
      maxArtifactBytes,
    ),
  ]));
  const manifestArtifact = loadSealedFile(
    root,
    artifactPaths.artifactManifestPath,
    PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.manifest,
    maxArtifactBytes,
  );
  if (manifestArtifact.digest !== bound.publicationReceipt.artifact_manifest_file_digest) {
    fail("project_history_artifact_manifest_invalid");
  }
  if (manifest.project_id !== bound.projectId
      || manifest.generation_id !== bound.generationId
      || manifest.generation_digest !== bound.attestation
      || manifest.ordered_event_digest !== bound.generation.ordered_event_digest
      || manifest.ordered_row_digest !== bound.model.ordered_row_digest) {
    fail("project_history_artifact_manifest_invalid");
  }
  for (const key of ARTIFACT_KEYS) {
    const record = manifest.artifacts[key];
    const artifact = artifacts[key];
    if (record.filename !== artifact.filename
        || record.size !== artifact.size
        || record.sha256 !== artifact.digest) {
      fail("project_history_artifact_manifest_invalid");
    }
  }
  const publicationIntent = createProjectHistoryCopyPublicationIntent({
    generation: bound.generation,
    model: bound.model,
    artifacts: manifest.artifacts,
  });
  if (publicationIntent.publication_intent_digest !== bound.publicationReceipt.publication_intent_digest
      || publicationIntent.project_id !== bound.publicationReceipt.project_id
      || publicationIntent.generation_digest !== bound.publicationReceipt.generation_digest) {
    fail("project_history_artifact_manifest_invalid");
  }

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
  const workbookReadback = readProjectHistoryCopyXlsx(artifacts.xlsx.bytes);
  verifyProjectHistoryCopyXlsxReadback(workbookReadback, bound.model);
  const persistedReadback = decodeUtf8Json(
    artifacts.xlsx_readback.bytes,
    "project_history_xlsx_readback_invalid",
  );
  if (canonicalJson(workbookReadback) !== canonicalJson(persistedReadback)) {
    fail("project_history_xlsx_readback_invalid");
  }
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
  bindingPath,
  bindingDigest,
  artifactManifestPath,
  artifactManifestDigest,
  bearerToken,
  pilotCopy = false,
  now = () => Date.now(),
  ticketTtlMs = DEFAULT_TICKET_TTL_MS,
  maxArtifactBytes = DEFAULT_MAX_ARTIFACT_BYTES,
  maxActiveTickets = DEFAULT_MAX_ACTIVE_TICKETS,
  maxActiveTicketBytes = DEFAULT_MAX_ACTIVE_TICKET_BYTES,
} = {}) {
  if (pilotCopy !== true) fail("project_history_mcp_feature_off");
  if (typeof bindingPath !== "string" || bindingPath.length === 0) {
    fail("project_history_binding_required");
  }
  if (typeof bindingDigest !== "string" || !ATTESTATION_RE.test(bindingDigest)) {
    fail("project_history_binding_digest_required");
  }
  if (typeof artifactManifestPath !== "string" || artifactManifestPath.length === 0) {
    fail("project_history_artifact_manifest_required");
  }
  if (typeof artifactManifestDigest !== "string" || !ATTESTATION_RE.test(artifactManifestDigest)) {
    fail("project_history_artifact_manifest_digest_required");
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

  let binding;
  let manifest;
  let artifactPaths;
  let initialTarget;
  try {
    binding = readProjectHistoryCopyBinding(path.resolve(bindingPath), {
      expectedDigest: bindingDigest,
    });
    manifest = readProjectHistoryCopyArtifactManifest(path.resolve(artifactManifestPath), {
      binding,
      expectedDigest: artifactManifestDigest,
    });
    artifactPaths = resolveProjectHistoryCopyArtifactPaths(binding, {
      projectId: manifest.project_id,
      generationId: manifest.generation_id,
    });
    initialTarget = assertProjectHistoryCopyBindingTarget(binding, {
      bindingDigest,
      dbPath: binding.database_path,
      projectId: manifest.project_id,
      generationId: manifest.generation_id,
      artifactPaths: {
        ...artifactPaths,
        artifactManifestPath: path.resolve(artifactManifestPath),
      },
      requireDatabaseHash: false,
    });
  } catch (error) {
    if (error instanceof ProjectHistoryMcpError) throw error;
    fail("project_history_projection_or_artifact_invalid");
  }
  const copyPath = initialTarget.database.path;
  const root = binding.projection_root;
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
    bound = readBoundGenerationTransaction(db, manifest);
    sealedArtifacts = loadAndValidateSealedArtifacts({
      root,
      bound,
      manifest,
      artifactPaths,
      maxArtifactBytes,
    });
    const finalTarget = assertProjectHistoryCopyBindingTarget(binding, {
      bindingDigest,
      dbPath: binding.database_path,
      projectId: manifest.project_id,
      generationId: manifest.generation_id,
      artifactPaths,
      requireDatabaseHash: false,
    });
    if (finalTarget.database.sha256 !== initialTarget.database.sha256) {
      fail("project_history_copy_db_invalid");
    }
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

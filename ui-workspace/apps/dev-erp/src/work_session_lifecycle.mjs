import { createHash } from "node:crypto";

export const PERSONAL_WORK_SESSION_COMMAND_SCHEMA =
  "dev_erp.personal_work_session_command.v1";
export const PERSONAL_WORK_SESSION_RECEIPT_SCHEMA =
  "dev_erp.personal_work_session_receipt.v1";

const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const OPAQUE_THREAD_RE = /^ws_thread_sha256:[a-f0-9]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FORBIDDEN_FIELD_RE =
  /(?:^|_)(?:body|conversation|full_message|keyboard|keystroke|os_activity|os_monitoring|os_process|prompt|raw|screen|task_chat|transcript)(?:_|$)/i;
export const WORK_SESSION_BOUNDED_SUMMARY_FORBIDDEN_PATTERN = String.raw`(?:[Ww][Hh][Oo][Ll][Ee][ _-]+(?:[Cc][Oo][Nn][Vv][Ee][Rr][Ss][Aa][Tt][Ii][Oo][Nn]|[Tt][Aa][Ss][Kk][ _-]*[Cc][Hh][Aa][Tt])|[Rr][Aa][Ww][ _-]+(?:[Cc][Oo][Nn][Vv][Ee][Rr][Ss][Aa][Tt][Ii][Oo][Nn]|[Tt][Aa][Ss][Kk][ _-]*[Cc][Hh][Aa][Tt]|[Cc][Oo][Mm][Pp][Ll][Ee][Tt][Ii][Oo][Nn][ _-]*[Hh][Oo][Oo][Kk])|[Bb][Ee][Gg][Ii][Nn][ _-]+(?:[Cc][Oo][Nn][Vv][Ee][Rr][Ss][Aa][Tt][Ii][Oo][Nn]|[Tt][Rr][Aa][Nn][Ss][Cc][Rr][Ii][Pp][Tt])|[Ss][Cc][Rr][Ee][Ee][Nn][ _-]*(?:[Cc][Aa][Pp][Tt][Uu][Rr][Ee]|[Rr][Ee][Cc][Oo][Rr][Dd][Ii][Nn][Gg])|[Kk][Ee][Yy][Bb][Oo][Aa][Rr][Dd][ _-]*(?:[Cc][Aa][Pp][Tt][Uu][Rr][Ee]|[Ll][Oo][Gg](?:[Gg][Ii][Nn][Gg])?)|[Kk][Ee][Yy][Ss][Tt][Rr][Oo][Kk][Ee][ _-]*(?:[Cc][Aa][Pp][Tt][Uu][Rr][Ee]|[Ll][Oo][Gg](?:[Gg][Ii][Nn][Gg])?)|(?:[Bb][Rr][Oo][Aa][Dd][ _-]+)?[Oo][Ss][ _-]*(?:[Aa][Cc][Tt][Ii][Vv][Ii][Tt][Yy]|[Mm][Oo][Nn][Ii][Tt][Oo][Rr][Ii][Nn][Gg]|[Ss][Uu][Rr][Vv][Ee][Ii][Ll][Ll][Aa][Nn][Cc][Ee])|[Tt][Aa][Ss][Kk][ _-]*[Cc][Hh][Aa][Tt][ _-]*[Cc][Oo][Mm][Pp][Ll][Ee][Tt][Ii][Oo][Nn][ _-]*[Hh][Oo][Oo][Kk]|\b[Bb][Ee][Aa][Rr][Ee][Rr]\s+[A-Za-z0-9._~-]{8,}|\b(?:[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn]|[Cc][Oo][Oo][Kk][Ii][Ee]|[Cc][Rr][Ee][Dd][Ee][Nn][Tt][Ii][Aa][Ll])\s*[:=]\s*\S+|\b[Ss][Kk]-[A-Za-z0-9_-]{12,}|[A-Za-z]:[\\/]|\\\\|/(?:[Uu][Ss][Ee][Rr][Ss]|[Hh][Oo][Mm][Ee]|[Pp][Rr][Ii][Vv][Aa][Tt][Ee]|[Rr][Oo][Oo][Tt]|[Vv][Aa][Rr]/[Ll][Ii][Bb])/|_[Ww][Oo][Rr][Kk][Ss][Pp][Aa][Cc][Ee][Ss][\\/]|[Ff][Ii][Ll][Ee]://|(?:^|\n)\s*(?:[Uu][Ss][Ee][Rr]|[Hh][Uu][Mm][Aa][Nn])\s*:\s*\S[^\n]*\n\s*(?:[Aa][Ss][Ss][Ii][Ss][Tt][Aa][Nn][Tt]|[Aa][Gg][Ee][Nn][Tt]|[Ss][Yy][Ss][Tt][Ee][Mm])\s*:\s*\S)`;
const BOUNDED_SUMMARY_FORBIDDEN_RE =
  new RegExp(WORK_SESSION_BOUNDED_SUMMARY_FORBIDDEN_PATTERN);
const START_KEYS = new Set([
  "schema_version", "command_kind", "metadata_boundary", "item_id", "project_id",
  "assignment_epoch", "node_id", "opaque_thread_ref", "idempotency_key",
  "primary_session", "started_at", "supersedes_session_id",
]);
const EVENT_KEYS = new Set([
  "schema_version", "command_kind", "metadata_boundary", "session_id", "node_id",
  "opaque_thread_ref", "idempotency_key", "sequence", "previous_event_digest",
  "occurred_at", "summary", "artifact_refs", "verification_refs",
]);
const CLOSEOUT_KEYS = new Set([
  ...EVENT_KEYS, "closeout_kind", "completion_proposal",
]);
const PROPOSAL_KEYS = new Set([
  "proposal_kind", "authority_state", "summary", "evidence_refs", "artifact_refs",
]);

export const PERSONAL_WORK_SESSION_DDL = `
CREATE TABLE IF NOT EXISTS erp_mcp_personal_work_node (
  node_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  attestation_ref TEXT,
  registration_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('registered','revoked')),
  registered_at TEXT NOT NULL,
  UNIQUE(account_id, registration_id)
);

CREATE TABLE IF NOT EXISTS erp_mcp_personal_work_session (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES core_item(id),
  project_id TEXT NOT NULL REFERENCES core_project(id),
  assignment_epoch TEXT NOT NULL,
  account_id TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES erp_mcp_personal_work_node(node_id),
  opaque_thread_ref TEXT NOT NULL,
  start_idempotency_key TEXT NOT NULL,
  start_command_digest TEXT NOT NULL,
  start_receipt_id TEXT NOT NULL UNIQUE,
  primary_session INTEGER NOT NULL DEFAULT 1 CHECK(primary_session=1),
  lifecycle_state TEXT NOT NULL CHECK(lifecycle_state IN ('active','closed','superseded')),
  previous_session_id TEXT REFERENCES erp_mcp_personal_work_session(id),
  superseded_by_session_id TEXT REFERENCES erp_mcp_personal_work_session(id),
  terminal_closeout_kind TEXT CHECK(
    terminal_closeout_kind IS NULL OR
    terminal_closeout_kind IN ('completed_candidate','blocked','handoff','abandoned')
  ),
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
  last_event_digest TEXT NOT NULL,
  started_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  terminal_at TEXT,
  UNIQUE(account_id, start_idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_mcp_personal_work_session_active_primary
  ON erp_mcp_personal_work_session(assignment_epoch, account_id)
  WHERE lifecycle_state='active' AND primary_session=1;
CREATE INDEX IF NOT EXISTS idx_erp_mcp_personal_work_session_item
  ON erp_mcp_personal_work_session(item_id, account_id, started_at DESC);

CREATE TABLE IF NOT EXISTS erp_mcp_personal_work_session_event (
  receipt_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES erp_mcp_personal_work_session(id),
  idempotency_key TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence>=1),
  event_kind TEXT NOT NULL CHECK(event_kind IN ('checkpoint','closeout')),
  previous_event_digest TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL DEFAULT '[]',
  verification_refs_json TEXT NOT NULL DEFAULT '[]',
  completion_proposal_json TEXT,
  completion_proposal_status TEXT CHECK(completion_proposal_status IS NULL OR completion_proposal_status='pending'),
  closeout_kind TEXT CHECK(
    closeout_kind IS NULL OR
    closeout_kind IN ('completed_candidate','blocked','handoff','abandoned')
  ),
  task_delta INTEGER NOT NULL DEFAULT 0 CHECK(task_delta=0),
  history_delta INTEGER NOT NULL DEFAULT 0 CHECK(history_delta=0),
  knowledge_delta INTEGER NOT NULL DEFAULT 0 CHECK(knowledge_delta=0),
  official_completion INTEGER NOT NULL DEFAULT 0 CHECK(official_completion=0),
  accepted_at TEXT NOT NULL,
  UNIQUE(session_id, idempotency_key),
  UNIQUE(session_id, sequence)
);
`;

export class WorkSessionLifecycleError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "WorkSessionLifecycleError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new WorkSessionLifecycleError(code, status);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digestObject(value) {
  return `sha256:${sha256(JSON.stringify(canonical(value)))}`;
}

function opaqueId(prefix, ...parts) {
  return `${prefix}_${sha256(parts.join("\u0000")).slice(0, 32)}`;
}

function exactKeys(value, allowed, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("work_session_unknown_field");
  }
}

function safeRef(value, code) {
  const text = String(value ?? "").trim();
  if (!SAFE_REF_RE.test(text)) fail(code);
  return text;
}

function idempotencyKey(value) {
  const text = String(value ?? "").trim();
  if (!IDEMPOTENCY_RE.test(text)) fail("work_session_invalid_idempotency_key");
  return text;
}

function timestamp(value, code) {
  const text = String(value ?? "").trim();
  const parsed = Date.parse(text);
  if (!ISO_RE.test(text) || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) {
    fail(code);
  }
  return text;
}

function text(value, { code, max = 2000 } = {}) {
  const normalized = String(value ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > max || normalized.includes("\0")) fail(code);
  return normalized;
}

function refList(value, code) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) fail(code);
  return value.map((entry) => safeRef(entry, code));
}

export function assertWorkSessionMetadataOnly(value) {
  const visit = (entry) => {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (entry && typeof entry === "object") {
      for (const [key, child] of Object.entries(entry)) {
        if (FORBIDDEN_FIELD_RE.test(key)) fail("work_session_raw_capture_forbidden");
        visit(child);
      }
      return;
    }
    if (typeof entry !== "string") return;
    if (BOUNDED_SUMMARY_FORBIDDEN_RE.test(entry)) {
      fail("work_session_raw_capture_forbidden");
    }
  };
  visit(value);
  return value;
}

function normalizeProposal(value) {
  exactKeys(value, PROPOSAL_KEYS, "work_session_invalid_completion_proposal");
  if (value.proposal_kind !== "task_completion") {
    fail("work_session_invalid_completion_proposal");
  }
  if (value.authority_state !== "proposal_only") {
    fail("work_session_completion_authority_forbidden");
  }
  return {
    proposal_kind: "task_completion",
    authority_state: "proposal_only",
    summary: text(value.summary, {
      code: "work_session_invalid_completion_proposal",
      max: 2000,
    }),
    evidence_refs: refList(value.evidence_refs, "work_session_invalid_completion_proposal"),
    artifact_refs: refList(value.artifact_refs, "work_session_invalid_completion_proposal"),
  };
}

export function normalizePersonalWorkSessionCommand(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("work_session_invalid_command");
  }
  const kind = String(input.command_kind || "");
  const allowed = kind === "start"
    ? START_KEYS
    : kind === "checkpoint"
      ? EVENT_KEYS
      : kind === "closeout"
        ? CLOSEOUT_KEYS
        : null;
  if (!allowed) fail("work_session_invalid_command_kind");
  exactKeys(input, allowed, "work_session_invalid_command");
  if (input.schema_version !== PERSONAL_WORK_SESSION_COMMAND_SCHEMA) {
    fail("work_session_invalid_schema_version");
  }
  if (input.metadata_boundary !== "metadata_only") {
    fail("work_session_metadata_only_required");
  }

  let normalized;
  if (kind === "start") {
    const opaqueThreadRef = String(input.opaque_thread_ref || "").trim();
    if (!OPAQUE_THREAD_RE.test(opaqueThreadRef)) fail("work_session_opaque_thread_required");
    if (input.primary_session !== true) fail("work_session_primary_required");
    normalized = {
      schema_version: PERSONAL_WORK_SESSION_COMMAND_SCHEMA,
      command_kind: "start",
      metadata_boundary: "metadata_only",
      item_id: safeRef(input.item_id, "work_session_invalid_item_id"),
      project_id: safeRef(input.project_id, "work_session_invalid_project_id"),
      assignment_epoch: safeRef(input.assignment_epoch, "work_session_invalid_assignment_epoch"),
      node_id: safeRef(input.node_id, "work_session_invalid_node_id"),
      opaque_thread_ref: opaqueThreadRef,
      idempotency_key: idempotencyKey(input.idempotency_key),
      primary_session: true,
      started_at: timestamp(input.started_at, "work_session_invalid_started_at"),
      ...(input.supersedes_session_id === undefined
        ? {}
        : {
          supersedes_session_id: safeRef(
            input.supersedes_session_id,
            "work_session_invalid_supersession",
          ),
        }),
    };
  } else {
    const opaqueThreadRef = String(input.opaque_thread_ref || "").trim();
    const previousEventDigest = String(input.previous_event_digest || "").trim();
    const sequence = Number(input.sequence);
    if (!OPAQUE_THREAD_RE.test(opaqueThreadRef)) fail("work_session_opaque_thread_required");
    if (!DIGEST_RE.test(previousEventDigest)) fail("work_session_invalid_previous_digest");
    if (!Number.isSafeInteger(sequence) || sequence < 1) fail("work_session_invalid_sequence");
    const closeoutKind = kind === "closeout"
      ? String(input.closeout_kind || "")
      : null;
    if (
      kind === "closeout" &&
      !["completed_candidate", "blocked", "handoff", "abandoned"].includes(closeoutKind)
    ) {
      fail("work_session_invalid_closeout_kind");
    }
    if (
      kind === "closeout" &&
      closeoutKind !== "completed_candidate" &&
      input.completion_proposal !== undefined
    ) {
      fail("work_session_completion_proposal_forbidden");
    }
    if (
      kind === "closeout" &&
      closeoutKind === "completed_candidate" &&
      input.completion_proposal === undefined
    ) {
      fail("work_session_completion_proposal_required");
    }
    normalized = {
      schema_version: PERSONAL_WORK_SESSION_COMMAND_SCHEMA,
      command_kind: kind,
      metadata_boundary: "metadata_only",
      session_id: safeRef(input.session_id, "work_session_invalid_session_id"),
      node_id: safeRef(input.node_id, "work_session_invalid_node_id"),
      opaque_thread_ref: opaqueThreadRef,
      idempotency_key: idempotencyKey(input.idempotency_key),
      sequence,
      previous_event_digest: previousEventDigest,
      occurred_at: timestamp(input.occurred_at, "work_session_invalid_occurred_at"),
      summary: text(input.summary, { code: "work_session_invalid_summary", max: 2000 }),
      artifact_refs: refList(input.artifact_refs, "work_session_invalid_artifact_refs"),
      verification_refs: refList(
        input.verification_refs,
        "work_session_invalid_verification_refs",
      ),
      ...(kind === "closeout"
        ? {
          closeout_kind: closeoutKind,
          ...(closeoutKind === "completed_candidate"
            ? { completion_proposal: normalizeProposal(input.completion_proposal) }
            : {}),
        }
        : {}),
    };
  }
  assertWorkSessionMetadataOnly(normalized);
  return normalized;
}

export function digestPersonalWorkSessionCommand(input) {
  return digestObject(normalizePersonalWorkSessionCommand(input));
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function publicSession(row) {
  return {
    session_id: row.id,
    item_id: row.item_id,
    project_id: row.project_id,
    assignment_epoch: row.assignment_epoch,
    node_id: row.node_id,
    opaque_thread_ref: row.opaque_thread_ref,
    primary_session: true,
    lifecycle_state: row.lifecycle_state,
    previous_session_id: row.previous_session_id || null,
    superseded_by_session_id: row.superseded_by_session_id || null,
    terminal_closeout_kind: row.terminal_closeout_kind || null,
    last_sequence: Number(row.last_sequence),
    last_event_digest: row.last_event_digest,
    started_at: row.started_at,
    accepted_at: row.accepted_at,
    terminal_at: row.terminal_at || null,
  };
}

function receipt({
  status,
  command,
  commandDigest,
  sessionId,
  receiptId,
  recordedAt,
  sequence = 0,
  acceptedReceiptId = null,
  acceptedEventDigest = null,
  projectionAdvanced = false,
  completionProposalStatus = null,
  reasonCode = null,
}) {
  const durable = status === "accepted" || status === "duplicate";
  return {
    schema_version: PERSONAL_WORK_SESSION_RECEIPT_SCHEMA,
    receipt_id: receiptId,
    status,
    durability: durable ? "accepted_server_durable" : "not_accepted",
    idempotency_key: command.idempotency_key,
    command_digest: commandDigest,
    session_id: sessionId,
    command_kind: command.command_kind,
    sequence,
    accepted_receipt_id: acceptedReceiptId,
    accepted_event_digest: acceptedEventDigest,
    projection_advanced: projectionAdvanced,
    task_delta: 0,
    history_delta: 0,
    knowledge_delta: 0,
    official_completion: false,
    completion_proposal_status: completionProposalStatus,
    reason_code: reasonCode,
    recorded_at: recordedAt,
  };
}

function acceptedStartReceipt(row, command, status = "accepted") {
  return receipt({
    status,
    command,
    commandDigest: row.start_command_digest,
    sessionId: row.id,
    receiptId: status === "accepted"
      ? row.start_receipt_id
      : opaqueId("pws_dup", row.start_receipt_id, row.start_command_digest),
    recordedAt: row.accepted_at,
    acceptedReceiptId: status === "duplicate" ? row.start_receipt_id : null,
    acceptedEventDigest: status === "duplicate" ? row.start_command_digest : null,
    projectionAdvanced: status === "accepted",
  });
}

function acceptedEventReceipt(row, command, status = "accepted") {
  return receipt({
    status,
    command,
    commandDigest: row.event_digest,
    sessionId: row.session_id,
    receiptId: status === "accepted"
      ? row.receipt_id
      : opaqueId("pws_dup", row.receipt_id, row.event_digest),
    recordedAt: row.accepted_at,
    sequence: Number(row.sequence),
    acceptedReceiptId: status === "duplicate" ? row.receipt_id : null,
    acceptedEventDigest: status === "duplicate" ? row.event_digest : null,
    projectionAdvanced: status === "accepted",
    completionProposalStatus: row.completion_proposal_status || null,
  });
}

function nonAcceptedReceipt(status, command, commandDigest, reasonCode, recordedAt) {
  return receipt({
    status,
    command,
    commandDigest,
    sessionId: command.session_id || null,
    receiptId: opaqueId("pws_attempt", status, command.idempotency_key, commandDigest),
    recordedAt,
    sequence: Number(command.sequence || 0),
    reasonCode,
  });
}

function transaction(db, callback) {
  try {
    db.exec("BEGIN IMMEDIATE");
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

export function createWorkSessionLifecycleStore({
  db,
  now = () => Date.now(),
  missingCloseoutAfterMs = 24 * 60 * 60 * 1000,
} = {}) {
  if (!db?.prepare || !db?.exec) throw new TypeError("work_session_db_required");
  if (
    !Number.isSafeInteger(missingCloseoutAfterMs) ||
    missingCloseoutAfterMs < 1
  ) {
    throw new TypeError("work_session_missing_closeout_sla_invalid");
  }
  db.exec(PERSONAL_WORK_SESSION_DDL);

  function currentIso() {
    return new Date(now()).toISOString();
  }

  function registerNode(accountId, input) {
    const allowed = new Set(["node_id", "registration_id", "attestation_ref"]);
    exactKeys(input, allowed, "work_session_invalid_node_registration");
    const normalized = {
      node_id: safeRef(input.node_id, "work_session_invalid_node_id"),
      registration_id: safeRef(
        input.registration_id,
        "work_session_invalid_node_registration",
      ),
      attestation_ref: input.attestation_ref === undefined
        ? null
        : safeRef(input.attestation_ref, "work_session_invalid_node_registration"),
    };
    assertWorkSessionMetadataOnly(normalized);
    const digest = digestObject(normalized);
    const existing = db.prepare(
      "SELECT * FROM erp_mcp_personal_work_node WHERE node_id=?",
    ).get(normalized.node_id);
    if (existing) {
      if (
        existing.account_id !== accountId ||
        existing.registration_digest !== digest ||
        existing.status !== "registered"
      ) {
        fail("work_session_node_registration_conflict", 409);
      }
      return {
        ok: true,
        replayed: true,
        node: {
          node_id: existing.node_id,
          registration_id: existing.registration_id,
          attestation_ref: existing.attestation_ref || null,
          status: existing.status,
          registered_at: existing.registered_at,
        },
      };
    }
    const registeredAt = currentIso();
    db.prepare(
      `INSERT INTO erp_mcp_personal_work_node
       (node_id,account_id,registration_id,attestation_ref,registration_digest,status,registered_at)
       VALUES(?,?,?,?,?,'registered',?)`,
    ).run(
      normalized.node_id,
      accountId,
      normalized.registration_id,
      normalized.attestation_ref,
      digest,
      registeredAt,
    );
    return {
      ok: true,
      replayed: false,
      node: { ...normalized, status: "registered", registered_at: registeredAt },
    };
  }

  function requireRegisteredNode(accountId, nodeId) {
    const row = db.prepare(
      `SELECT node_id FROM erp_mcp_personal_work_node
       WHERE node_id=? AND account_id=? AND status='registered'`,
    ).get(nodeId, accountId);
    if (!row) fail("work_session_registered_node_required", 403);
  }

  function getSession(accountId, sessionId) {
    const row = db.prepare(
      "SELECT * FROM erp_mcp_personal_work_session WHERE id=? AND account_id=?",
    ).get(sessionId, accountId);
    return row || null;
  }

  function start(accountId, commandInput) {
    const command = normalizePersonalWorkSessionCommand(commandInput);
    if (command.command_kind !== "start") fail("work_session_start_required");
    requireRegisteredNode(accountId, command.node_id);
    const commandDigest = digestObject(command);
    return transaction(db, () => {
      const replay = db.prepare(
        `SELECT * FROM erp_mcp_personal_work_session
         WHERE account_id=? AND start_idempotency_key=?`,
      ).get(accountId, command.idempotency_key);
      if (replay) {
        if (replay.start_command_digest !== commandDigest) {
          return {
            ok: false,
            receipt: nonAcceptedReceipt(
              "quarantined",
              command,
              commandDigest,
              "idempotency_digest_conflict",
              currentIso(),
            ),
          };
        }
        return {
          ok: true,
          replayed: true,
          session: publicSession(replay),
          receipt: acceptedStartReceipt(replay, command, "duplicate"),
        };
      }

      const active = db.prepare(
        `SELECT * FROM erp_mcp_personal_work_session
         WHERE assignment_epoch=? AND account_id=? AND lifecycle_state='active'
         LIMIT 1`,
      ).get(command.assignment_epoch, accountId);
      const supersedesId = command.supersedes_session_id || null;
      if (active) {
        return {
          ok: false,
          receipt: nonAcceptedReceipt(
            "rejected",
            command,
            commandDigest,
            "active_primary_exists",
            currentIso(),
          ),
        };
      }
      const prior = db.prepare(
        `SELECT id FROM erp_mcp_personal_work_session
         WHERE assignment_epoch=? AND account_id=?
         ORDER BY accepted_at DESC,id DESC
         LIMIT 1`,
      ).get(command.assignment_epoch, accountId);
      if (prior && !supersedesId) {
        return {
          ok: false,
          receipt: nonAcceptedReceipt(
            "rejected",
            command,
            commandDigest,
            "successor_supersedes_required",
            currentIso(),
          ),
        };
      }
      let predecessor = null;
      if (supersedesId) {
        predecessor = getSession(accountId, supersedesId);
        const exactBinding = predecessor &&
          predecessor.item_id === command.item_id &&
          predecessor.project_id === command.project_id &&
          predecessor.assignment_epoch === command.assignment_epoch &&
          predecessor.account_id === accountId;
        if (!exactBinding) {
          return {
            ok: false,
            receipt: nonAcceptedReceipt(
              "rejected",
              command,
              commandDigest,
              "handoff_predecessor_binding_mismatch",
              currentIso(),
            ),
          };
        }
        if (
          predecessor.lifecycle_state !== "closed" ||
          predecessor.terminal_closeout_kind !== "handoff" ||
          predecessor.superseded_by_session_id
        ) {
          return {
            ok: false,
            receipt: nonAcceptedReceipt(
              "rejected",
              command,
              commandDigest,
              "handoff_predecessor_not_eligible",
              currentIso(),
            ),
          };
        }
      }

      const sessionId = opaqueId("pws", accountId, command.idempotency_key);
      const startReceiptId = opaqueId("pws_receipt", sessionId, commandDigest);
      const acceptedAt = currentIso();
      db.prepare(
        `INSERT INTO erp_mcp_personal_work_session
         (id,item_id,project_id,assignment_epoch,account_id,node_id,opaque_thread_ref,
          start_idempotency_key,start_command_digest,start_receipt_id,primary_session,
          lifecycle_state,previous_session_id,last_sequence,last_event_digest,started_at,accepted_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,1,'active',?,0,?,?,?)`,
      ).run(
        sessionId,
        command.item_id,
        command.project_id,
        command.assignment_epoch,
        accountId,
        command.node_id,
        command.opaque_thread_ref,
        command.idempotency_key,
        commandDigest,
        startReceiptId,
        predecessor?.id || null,
        commandDigest,
        command.started_at,
        acceptedAt,
      );
      if (predecessor) {
        db.prepare(
          `UPDATE erp_mcp_personal_work_session
           SET lifecycle_state='superseded',superseded_by_session_id=?
           WHERE id=? AND lifecycle_state='closed' AND terminal_closeout_kind='handoff'
             AND superseded_by_session_id IS NULL`,
        ).run(sessionId, predecessor.id);
      }
      const row = getSession(accountId, sessionId);
      return {
        ok: true,
        replayed: false,
        session: publicSession(row),
        receipt: acceptedStartReceipt(row, command),
      };
    });
  }

  function append(accountId, commandInput) {
    const command = normalizePersonalWorkSessionCommand(commandInput);
    if (!["checkpoint", "closeout"].includes(command.command_kind)) {
      fail("work_session_event_required");
    }
    const commandDigest = digestObject(command);
    return transaction(db, () => {
      const session = getSession(accountId, command.session_id);
      if (!session) fail("work_session_not_found", 404);
      const duplicate = db.prepare(
        `SELECT * FROM erp_mcp_personal_work_session_event
         WHERE session_id=? AND idempotency_key=?`,
      ).get(session.id, command.idempotency_key);
      if (duplicate) {
        if (duplicate.event_digest !== commandDigest) {
          return {
            ok: false,
            receipt: nonAcceptedReceipt(
              "quarantined",
              command,
              commandDigest,
              "idempotency_digest_conflict",
              currentIso(),
            ),
          };
        }
        return {
          ok: true,
          replayed: true,
          session: publicSession(session),
          receipt: acceptedEventReceipt(duplicate, command, "duplicate"),
        };
      }
      const sequenceConflict = db.prepare(
        `SELECT * FROM erp_mcp_personal_work_session_event
         WHERE session_id=? AND sequence=?`,
      ).get(session.id, command.sequence);
      if (sequenceConflict) {
        return {
          ok: false,
          receipt: nonAcceptedReceipt(
            "quarantined",
            command,
            commandDigest,
            "sequence_digest_conflict",
            currentIso(),
          ),
        };
      }
      if (
        session.lifecycle_state !== "active" ||
        session.node_id !== command.node_id ||
        session.opaque_thread_ref !== command.opaque_thread_ref
      ) {
        return {
          ok: false,
          receipt: nonAcceptedReceipt(
            "rejected",
            command,
            commandDigest,
            session.lifecycle_state === "active"
              ? "session_binding_mismatch"
              : "session_terminal",
            currentIso(),
          ),
        };
      }
      requireRegisteredNode(accountId, command.node_id);
      const expectedSequence = Number(session.last_sequence) + 1;
      if (command.sequence !== expectedSequence) {
        return {
          ok: false,
          receipt: nonAcceptedReceipt(
            "held_gap",
            command,
            commandDigest,
            "event_sequence_gap",
            currentIso(),
          ),
        };
      }
      if (command.previous_event_digest !== session.last_event_digest) {
        return {
          ok: false,
          receipt: nonAcceptedReceipt(
            "held_gap",
            command,
            commandDigest,
            "previous_event_digest_mismatch",
            currentIso(),
          ),
        };
      }

      const acceptedAt = currentIso();
      const receiptId = opaqueId("pws_receipt", session.id, commandDigest);
      const closeoutKind = command.command_kind === "closeout"
        ? command.closeout_kind
        : null;
      const proposal = closeoutKind === "completed_candidate"
        ? command.completion_proposal
        : null;
      db.prepare(
        `INSERT INTO erp_mcp_personal_work_session_event
         (receipt_id,session_id,idempotency_key,sequence,event_kind,previous_event_digest,
           event_digest,occurred_at,summary,artifact_refs_json,verification_refs_json,
           completion_proposal_json,completion_proposal_status,closeout_kind,task_delta,history_delta,
           knowledge_delta,official_completion,accepted_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,0,?)`,
      ).run(
        receiptId,
        session.id,
        command.idempotency_key,
        command.sequence,
        command.command_kind,
        command.previous_event_digest,
        commandDigest,
        command.occurred_at,
        command.summary,
        JSON.stringify(command.artifact_refs),
        JSON.stringify(command.verification_refs),
        proposal ? JSON.stringify(proposal) : null,
        proposal ? "pending" : null,
        closeoutKind,
        acceptedAt,
      );
      db.prepare(
        `UPDATE erp_mcp_personal_work_session
         SET last_sequence=?,last_event_digest=?,
             lifecycle_state=CASE WHEN ?='closeout' THEN 'closed' ELSE lifecycle_state END,
             terminal_at=CASE WHEN ?='closeout' THEN ? ELSE terminal_at END,
             terminal_closeout_kind=CASE WHEN ?='closeout' THEN ? ELSE terminal_closeout_kind END
         WHERE id=?`,
      ).run(
        command.sequence,
        commandDigest,
        command.command_kind,
        command.command_kind,
        command.occurred_at,
        command.command_kind,
        closeoutKind,
        session.id,
      );
      const event = db.prepare(
        "SELECT * FROM erp_mcp_personal_work_session_event WHERE receipt_id=?",
      ).get(receiptId);
      const updated = getSession(accountId, session.id);
      return {
        ok: true,
        replayed: false,
        session: publicSession(updated),
        event: {
          event_kind: event.event_kind,
          sequence: Number(event.sequence),
          summary: event.summary,
          artifact_refs: parseList(event.artifact_refs_json),
          verification_refs: parseList(event.verification_refs_json),
          completion_proposal: parseObject(event.completion_proposal_json),
          completion_proposal_status: event.completion_proposal_status || null,
          closeout_kind: event.closeout_kind || null,
        },
        receipt: acceptedEventReceipt(event, command),
      };
    });
  }

  function verifyAcceptedReceipt(accountId, commandInput, receiptInput) {
    try {
      const command = normalizePersonalWorkSessionCommand(commandInput);
      const status = String(receiptInput?.status || "");
      if (!["accepted", "duplicate"].includes(status)) return false;
      const originalReceiptId = status === "accepted"
        ? String(receiptInput?.receipt_id || "")
        : String(receiptInput?.accepted_receipt_id || "");
      const commandDigest = digestObject(command);
      let expected;
      if (command.command_kind === "start") {
        const row = db.prepare(
          `SELECT * FROM erp_mcp_personal_work_session
           WHERE account_id=? AND start_receipt_id=?`,
        ).get(accountId, originalReceiptId);
        if (
          !row ||
          row.start_command_digest !== commandDigest ||
          row.start_idempotency_key !== command.idempotency_key ||
          row.item_id !== command.item_id ||
          row.project_id !== command.project_id ||
          row.assignment_epoch !== command.assignment_epoch ||
          row.node_id !== command.node_id ||
          row.opaque_thread_ref !== command.opaque_thread_ref
        ) {
          return false;
        }
        expected = acceptedStartReceipt(row, command, status);
      } else {
        const row = db.prepare(
          `SELECT e.* FROM erp_mcp_personal_work_session_event e
           JOIN erp_mcp_personal_work_session s ON s.id=e.session_id
           WHERE s.account_id=? AND e.receipt_id=?`,
        ).get(accountId, originalReceiptId);
        if (
          !row ||
          row.event_digest !== commandDigest ||
          row.idempotency_key !== command.idempotency_key ||
          row.session_id !== command.session_id ||
          row.event_kind !== command.command_kind ||
          Number(row.sequence) !== command.sequence ||
          row.previous_event_digest !== command.previous_event_digest
        ) {
          return false;
        }
        expected = acceptedEventReceipt(row, command, status);
      }
      return JSON.stringify(canonical(receiptInput)) === JSON.stringify(canonical(expected));
    } catch {
      return false;
    }
  }

  function session(accountId, sessionId) {
    const row = getSession(accountId, sessionId);
    return row ? publicSession(row) : null;
  }

  function missingCloseouts(accountId) {
    const cutoff = new Date(now() - missingCloseoutAfterMs).toISOString();
    return db.prepare(
      `SELECT * FROM erp_mcp_personal_work_session
       WHERE account_id=? AND lifecycle_state='active' AND accepted_at<=?
       ORDER BY accepted_at,id`,
    ).all(accountId, cutoff).map((row) => ({
      session_id: row.id,
      item_id: row.item_id,
      project_id: row.project_id,
      assignment_epoch: row.assignment_epoch,
      accepted_start_receipt_id: row.start_receipt_id,
      started_at: row.started_at,
      accepted_at: row.accepted_at,
      missing_closeout_after_ms: missingCloseoutAfterMs,
      candidate_state: "accepted_start_missing_closeout",
    }));
  }

  return Object.freeze({
    registerNode,
    start,
    append,
    verifyAcceptedReceipt,
    session,
    missingCloseouts,
  });
}

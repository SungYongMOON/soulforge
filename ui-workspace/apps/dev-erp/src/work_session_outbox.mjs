import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, parse, resolve } from "node:path";

import {
  assertWorkSessionMetadataOnly,
  digestPersonalWorkSessionCommand,
  normalizePersonalWorkSessionCommand,
  PERSONAL_WORK_SESSION_RECEIPT_SCHEMA,
} from "./work_session_lifecycle.mjs";

export const PERSONAL_WORK_SESSION_OUTBOX_SCHEMA =
  "dev_erp.personal_work_session_outbox_entry.v1";

const OUTBOX_FILE_RE = /^wsob_[a-f0-9]{32}\.json$/;
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const RECEIPT_STATUSES = new Set([
  "accepted", "duplicate", "held_gap", "quarantined", "rejected",
]);
const RECEIPT_KEYS = new Set([
  "schema_version", "receipt_id", "status", "durability", "idempotency_key",
  "command_digest", "session_id", "command_kind", "sequence",
  "accepted_receipt_id", "accepted_event_digest", "projection_advanced",
  "task_delta", "history_delta", "knowledge_delta", "official_completion",
  "completion_proposal_status", "reason_code", "recorded_at",
]);
const ENTRY_KEYS = new Set([
  "schema_version", "outbox_id", "state", "command", "command_digest",
  "idempotency_key", "attempt_count", "enqueued_at", "last_attempt_at",
  "updated_at", "accepted_at", "last_receipt", "accepted_ack",
]);

export class WorkSessionOutboxError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "WorkSessionOutboxError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new WorkSessionOutboxError(code, status);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, allowed, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code);
  }
}

function iso(value, code) {
  const text = String(value ?? "");
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) fail(code);
  return text;
}

function nullableRef(value, code) {
  if (value === null) return null;
  const text = String(value ?? "");
  if (!SAFE_REF_RE.test(text)) fail(code);
  return text;
}

function nullableDigest(value, code) {
  if (value === null) return null;
  const text = String(value ?? "");
  if (!DIGEST_RE.test(text)) fail(code);
  return text;
}

function validateReceipt(input) {
  exactKeys(input, RECEIPT_KEYS, "work_session_outbox_invalid_receipt");
  if (input.schema_version !== PERSONAL_WORK_SESSION_RECEIPT_SCHEMA) {
    fail("work_session_outbox_invalid_receipt");
  }
  const status = String(input.status || "");
  if (!RECEIPT_STATUSES.has(status)) fail("work_session_outbox_invalid_receipt");
  const durable = status === "accepted" || status === "duplicate";
  if (input.durability !== (durable ? "accepted_server_durable" : "not_accepted")) {
    fail("work_session_outbox_invalid_receipt");
  }
  if (!SAFE_REF_RE.test(String(input.receipt_id || ""))) {
    fail("work_session_outbox_invalid_receipt");
  }
  if (!DIGEST_RE.test(String(input.command_digest || ""))) {
    fail("work_session_outbox_invalid_receipt");
  }
  if (!["start", "checkpoint", "closeout"].includes(input.command_kind)) {
    fail("work_session_outbox_invalid_receipt");
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
    fail("work_session_outbox_invalid_receipt");
  }
  if (
    input.projection_advanced !== (status === "accepted") ||
    input.task_delta !== 0 ||
    input.history_delta !== 0 ||
    input.knowledge_delta !== 0 ||
    input.official_completion !== false
  ) {
    fail("work_session_outbox_invalid_receipt");
  }
  const acceptedReceiptId = nullableRef(
    input.accepted_receipt_id,
    "work_session_outbox_invalid_receipt",
  );
  const acceptedEventDigest = nullableDigest(
    input.accepted_event_digest,
    "work_session_outbox_invalid_receipt",
  );
  if (
    status === "duplicate" &&
    (!acceptedReceiptId || acceptedEventDigest !== input.command_digest)
  ) {
    fail("work_session_outbox_duplicate_proof_required");
  }
  if (
    status !== "duplicate" &&
    (acceptedReceiptId !== null || acceptedEventDigest !== null)
  ) {
    fail("work_session_outbox_invalid_receipt");
  }
  if (
    input.completion_proposal_status !== null &&
    input.completion_proposal_status !== "pending"
  ) {
    fail("work_session_outbox_invalid_receipt");
  }
  if (input.reason_code !== null && !SAFE_REF_RE.test(String(input.reason_code))) {
    fail("work_session_outbox_invalid_receipt");
  }
  const normalized = {
    schema_version: PERSONAL_WORK_SESSION_RECEIPT_SCHEMA,
    receipt_id: String(input.receipt_id),
    status,
    durability: input.durability,
    idempotency_key: String(input.idempotency_key || ""),
    command_digest: String(input.command_digest),
    session_id: nullableRef(input.session_id, "work_session_outbox_invalid_receipt"),
    command_kind: input.command_kind,
    sequence: input.sequence,
    accepted_receipt_id: acceptedReceiptId,
    accepted_event_digest: acceptedEventDigest,
    projection_advanced: input.projection_advanced,
    task_delta: 0,
    history_delta: 0,
    knowledge_delta: 0,
    official_completion: false,
    completion_proposal_status: input.completion_proposal_status,
    reason_code: input.reason_code === null ? null : String(input.reason_code),
    recorded_at: iso(input.recorded_at, "work_session_outbox_invalid_receipt"),
  };
  assertWorkSessionMetadataOnly(normalized);
  return normalized;
}

function validateEntry(input) {
  exactKeys(input, ENTRY_KEYS, "work_session_outbox_invalid_entry");
  if (input.schema_version !== PERSONAL_WORK_SESSION_OUTBOX_SCHEMA) {
    fail("work_session_outbox_invalid_entry");
  }
  if (!/^wsob_[a-f0-9]{32}$/.test(String(input.outbox_id || ""))) {
    fail("work_session_outbox_invalid_entry");
  }
  if (!["pending", "accepted"].includes(input.state)) {
    fail("work_session_outbox_invalid_entry");
  }
  const command = normalizePersonalWorkSessionCommand(input.command);
  const commandDigest = digestPersonalWorkSessionCommand(command);
  if (
    input.command_digest !== commandDigest ||
    input.idempotency_key !== command.idempotency_key
  ) {
    fail("work_session_outbox_entry_digest_mismatch");
  }
  if (!Number.isSafeInteger(input.attempt_count) || input.attempt_count < 0) {
    fail("work_session_outbox_invalid_entry");
  }
  const lastReceipt = input.last_receipt === null
    ? null
    : validateReceipt(input.last_receipt);
  const acceptedAck = input.accepted_ack === null
    ? null
    : validateReceipt(input.accepted_ack);
  if (
    input.state === "pending" &&
    (acceptedAck !== null || input.accepted_at !== null)
  ) {
    fail("work_session_outbox_invalid_entry");
  }
  if (
    input.state === "accepted" &&
    (
      acceptedAck === null ||
      !["accepted", "duplicate"].includes(acceptedAck.status) ||
      acceptedAck.durability !== "accepted_server_durable" ||
      acceptedAck.command_digest !== commandDigest ||
      acceptedAck.idempotency_key !== command.idempotency_key ||
      input.accepted_at === null
    )
  ) {
    fail("work_session_outbox_accepted_ack_required");
  }
  const normalized = {
    schema_version: PERSONAL_WORK_SESSION_OUTBOX_SCHEMA,
    outbox_id: input.outbox_id,
    state: input.state,
    command,
    command_digest: commandDigest,
    idempotency_key: command.idempotency_key,
    attempt_count: input.attempt_count,
    enqueued_at: iso(input.enqueued_at, "work_session_outbox_invalid_entry"),
    last_attempt_at: input.last_attempt_at === null
      ? null
      : iso(input.last_attempt_at, "work_session_outbox_invalid_entry"),
    updated_at: iso(input.updated_at, "work_session_outbox_invalid_entry"),
    accepted_at: input.accepted_at === null
      ? null
      : iso(input.accepted_at, "work_session_outbox_invalid_entry"),
    last_receipt: lastReceipt,
    accepted_ack: acceptedAck,
  };
  assertWorkSessionMetadataOnly(normalized);
  return normalized;
}

function fsyncDirectory(path) {
  let fd = null;
  try {
    fd = openSync(path, "r");
    fsyncSync(fd);
  } catch (error) {
    if (!["EINVAL", "EISDIR", "EPERM"].includes(error?.code)) throw error;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export function createWorkSessionOutbox({
  root,
  now = () => Date.now(),
  acceptedReceiptVerifier = null,
} = {}) {
  const rawRoot = String(root || "");
  if (!rawRoot || !isAbsolute(rawRoot)) throw new TypeError("work_session_outbox_absolute_root_required");
  const outboxRoot = resolve(rawRoot);
  if (outboxRoot === parse(outboxRoot).root) {
    throw new TypeError("work_session_outbox_broad_root_forbidden");
  }
  mkdirSync(outboxRoot, { recursive: true });
  const stat = lstatSync(outboxRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new TypeError("work_session_outbox_root_unsafe");
  }

  function currentIso() {
    return new Date(now()).toISOString();
  }

  function requireTrustedAcceptedReceipt(entry, serverReceipt) {
    if (typeof acceptedReceiptVerifier !== "function") {
      fail("work_session_outbox_trusted_verifier_required", 503);
    }
    let verified = false;
    try {
      verified = acceptedReceiptVerifier({
        command: entry.command,
        receipt: serverReceipt,
      }) === true;
    } catch {
      verified = false;
    }
    if (!verified) fail("work_session_outbox_untrusted_receipt", 409);
  }

  function pathFor(outboxId) {
    return join(outboxRoot, `${outboxId}.json`);
  }

  function writeEntry(entry) {
    const normalized = validateEntry(entry);
    const target = pathFor(normalized.outbox_id);
    const temporary = join(
      outboxRoot,
      `.${normalized.outbox_id}.${randomBytes(8).toString("hex")}.tmp`,
    );
    let fd = null;
    try {
      fd = openSync(temporary, "wx", 0o600);
      writeFileSync(fd, `${JSON.stringify(normalized)}\n`, "utf8");
      fsyncSync(fd);
      closeSync(fd);
      fd = null;
      renameSync(temporary, target);
      fsyncDirectory(outboxRoot);
    } catch (error) {
      if (fd !== null) closeSync(fd);
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
    return normalized;
  }

  function readEntry(outboxId) {
    if (!/^wsob_[a-f0-9]{32}$/.test(String(outboxId || ""))) {
      fail("work_session_outbox_not_found", 404);
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(pathFor(outboxId), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") fail("work_session_outbox_not_found", 404);
      fail("work_session_outbox_invalid_entry", 409);
    }
    const entry = validateEntry(parsed);
    if (entry.state === "accepted") {
      requireTrustedAcceptedReceipt(entry, entry.accepted_ack);
    }
    return entry;
  }

  function enqueue(commandInput) {
    const command = normalizePersonalWorkSessionCommand(commandInput);
    const commandDigest = digestPersonalWorkSessionCommand(command);
    const outboxId = `wsob_${sha256(command.idempotency_key).slice(0, 32)}`;
    try {
      const existing = readEntry(outboxId);
      if (existing.command_digest !== commandDigest) {
        fail("work_session_outbox_idempotency_conflict", 409);
      }
      return { ok: true, replayed: true, entry: existing };
    } catch (error) {
      if (!(error instanceof WorkSessionOutboxError) || error.code !== "work_session_outbox_not_found") {
        throw error;
      }
    }
    const recordedAt = currentIso();
    const entry = writeEntry({
      schema_version: PERSONAL_WORK_SESSION_OUTBOX_SCHEMA,
      outbox_id: outboxId,
      state: "pending",
      command,
      command_digest: commandDigest,
      idempotency_key: command.idempotency_key,
      attempt_count: 0,
      enqueued_at: recordedAt,
      last_attempt_at: null,
      updated_at: recordedAt,
      accepted_at: null,
      last_receipt: null,
      accepted_ack: null,
    });
    return { ok: true, replayed: false, entry };
  }

  function markAttempt(outboxId) {
    const entry = readEntry(outboxId);
    if (entry.state !== "pending") fail("work_session_outbox_already_accepted", 409);
    const attemptedAt = currentIso();
    return writeEntry({
      ...entry,
      attempt_count: entry.attempt_count + 1,
      last_attempt_at: attemptedAt,
      updated_at: attemptedAt,
    });
  }

  function applyServerReceipt(outboxId, receiptInput) {
    const entry = readEntry(outboxId);
    const serverReceipt = validateReceipt(receiptInput);
    if (
      serverReceipt.idempotency_key !== entry.idempotency_key ||
      serverReceipt.command_digest !== entry.command_digest ||
      serverReceipt.command_kind !== entry.command.command_kind
    ) {
      fail("work_session_outbox_receipt_mismatch", 409);
    }
    if (entry.state === "accepted") {
      if (JSON.stringify(entry.accepted_ack) !== JSON.stringify(serverReceipt)) {
        fail("work_session_outbox_receipt_conflict", 409);
      }
      requireTrustedAcceptedReceipt(entry, serverReceipt);
      return { ok: true, replayed: true, accepted: true, entry };
    }
    const accepted = serverReceipt.status === "accepted" ||
      (
        serverReceipt.status === "duplicate" &&
        serverReceipt.accepted_receipt_id !== null &&
        serverReceipt.accepted_event_digest === entry.command_digest
      );
    if (accepted) requireTrustedAcceptedReceipt(entry, serverReceipt);
    const updatedAt = currentIso();
    const updated = writeEntry({
      ...entry,
      state: accepted ? "accepted" : "pending",
      updated_at: updatedAt,
      accepted_at: accepted ? updatedAt : null,
      last_receipt: serverReceipt,
      accepted_ack: accepted ? serverReceipt : null,
    });
    return { ok: true, replayed: false, accepted, entry: updated };
  }

  function compact(outboxId) {
    const entry = readEntry(outboxId);
    if (
      entry.state !== "accepted" ||
      !entry.accepted_ack ||
      entry.accepted_ack.durability !== "accepted_server_durable" ||
      !["accepted", "duplicate"].includes(entry.accepted_ack.status)
    ) {
      fail("work_session_outbox_compact_before_accepted_ack", 409);
    }
    requireTrustedAcceptedReceipt(entry, entry.accepted_ack);
    unlinkSync(pathFor(outboxId));
    fsyncDirectory(outboxRoot);
    return {
      ok: true,
      outbox_id: outboxId,
      compacted_after_receipt_id: entry.accepted_ack.receipt_id,
    };
  }

  function list() {
    return readdirSync(outboxRoot)
      .filter((name) => OUTBOX_FILE_RE.test(name))
      .sort()
      .map((name) => readEntry(name.slice(0, -".json".length)));
  }

  function pending() {
    return list()
      .filter((entry) => entry.state === "pending")
      .sort((left, right) =>
        left.enqueued_at.localeCompare(right.enqueued_at) ||
        left.outbox_id.localeCompare(right.outbox_id));
  }

  return Object.freeze({
    enqueue,
    markAttempt,
    applyServerReceipt,
    compact,
    get: readEntry,
    list,
    pending,
  });
}

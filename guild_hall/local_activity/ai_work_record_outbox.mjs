import { createHash } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import {
  canonicalJson,
  reduceAiWorkRecordEvents,
  validateAiWorkRecordEvent,
} from "../shared/ai_work_record_event.mjs";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default;
const EVENT_SCHEMA = JSON.parse(readFileSync(
  new URL("../shared/ai_work_record_event.v1.schema.json", import.meta.url),
  "utf8",
));
const validateStrictSchema = new Ajv2020({
  allErrors: true,
  strict: true,
}).compile(EVENT_SCHEMA);

export const AI_WORK_RECORD_OUTBOX_RECEIPT_SCHEMA =
  "soulforge.ai_work_record_outbox_receipt.v1";
export const AI_WORK_RECORD_RETRY_SCHEMA =
  "soulforge.ai_work_record_outbox_retry.v1";
export const AI_WORK_RECORD_STORAGE_CLASSIFICATION = Object.freeze({
  "outbox/ai_work_record/events": "backup_recovery_included",
  "outbox/ai_work_record/pending": "backup_recovery_included",
  "outbox/ai_work_record/receipts": "backup_recovery_included",
  "state/ai_work_record/retry_index": "backup_recovery_included",
  "state/ai_work_record/lock": "regenerable_excluded",
});

const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,119}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const UTC_MILLISECONDS =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const EVENT_FILE = /^(\d{16})-(sha256-[a-f0-9]{64})\.json$/u;
const ATOMIC_TEMP_FILE =
  /^\.[A-Za-z0-9_.-]{1,220}\.json\.tmp\.[a-f0-9]{32}\.tmp$/u;
const MAX_JSON_BYTES = 1024 * 1024;
const IGNORED_DIRECTORY_SYNC_CODES = new Set([
  "EACCES",
  "EINVAL",
  "EISDIR",
  "ENOTSUP",
  "EPERM",
]);

export class AiWorkRecordOutboxError extends Error {
  constructor(code) {
    super(code);
    this.name = "AiWorkRecordOutboxError";
    this.code = code;
  }
}

function fail(code) {
  throw new AiWorkRecordOutboxError(code);
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function safeProject(value) {
  if (typeof value !== "string" || !SAFE_PROJECT.test(value)) {
    fail("project_code_invalid");
  }
  return value;
}

function safeDigest(value) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("event_digest_invalid");
  }
  return value;
}

function safeTimestamp(value, code) {
  if (
    typeof value !== "string"
    || !UTC_MILLISECONDS.test(value)
    || new Date(value).toISOString() !== value
  ) {
    fail(code);
  }
  return value;
}

function safeSequence(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail("sequence_invalid");
  return value;
}

function absoluteRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("state_root_absolute_required");
  }
  return path.resolve(value);
}

export function assertSyntheticAiWorkRecordRoot(value) {
  const root = absoluteRoot(value);
  const temporaryRoot = path.resolve(os.tmpdir());
  const relative = path.relative(temporaryRoot, root);
  if (
    relative === ""
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
    || relative.includes(path.sep)
    || !path.basename(root).startsWith("soulforge-ai-work-record-test-")
  ) {
    fail("synthetic_state_root_required");
  }
  return root;
}

function withinRoot(root, target) {
  const relative = path.relative(root, target);
  if (
    relative === ""
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    fail("outbox_path_escape");
  }
  return target;
}

async function assertSafeDirectoryAncestry(root, directory) {
  const resolvedRoot = absoluteRoot(root);
  const resolvedDirectory = withinRoot(resolvedRoot, path.resolve(directory));
  let rootStat;
  try {
    rootStat = await lstat(resolvedRoot);
  } catch (error) {
    if (error?.code === "ENOENT") fail("synthetic_state_root_missing");
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    fail("synthetic_state_root_invalid");
  }
  const relative = path.relative(resolvedRoot, resolvedDirectory);
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let currentStat;
    try {
      currentStat = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (currentStat.isSymbolicLink()) fail("outbox_symlink_forbidden");
    if (!currentStat.isDirectory()) fail("outbox_path_type_invalid");
  }
}

export function getAiWorkRecordOutboxPaths({ stateRoot, projectCode }) {
  const root = absoluteRoot(stateRoot);
  const project = safeProject(projectCode);
  const projectRoot = withinRoot(
    root,
    path.join(root, "projects", project),
  );
  const outboxRoot = withinRoot(
    root,
    path.join(projectRoot, "outbox", "ai_work_record"),
  );
  const stateArea = withinRoot(
    root,
    path.join(projectRoot, "state", "ai_work_record"),
  );
  return {
    state_root: root,
    project_root: projectRoot,
    outbox_root: outboxRoot,
    events: path.join(outboxRoot, "events"),
    pending: path.join(outboxRoot, "pending"),
    receipts_pending: path.join(outboxRoot, "receipts", "pending"),
    receipts_ack: path.join(outboxRoot, "receipts", "ack"),
    receipts_local_persisted: path.join(
      outboxRoot,
      "receipts",
      "local_persisted",
    ),
    lock: path.join(stateArea, "lock"),
    retry_index: path.join(stateArea, "retry_index"),
  };
}

function digestJson(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function sequencePrefix(sequence) {
  return String(safeSequence(sequence)).padStart(16, "0");
}

function digestFilePart(digest) {
  return safeDigest(digest).replace(":", "-");
}

function eventRelativeName(event) {
  return path.join(
    event.work_id,
    `${sequencePrefix(event.sequence)}-${digestFilePart(event.event_digest)}.json`,
  );
}

function pendingFileName(event) {
  const recorded = event.recorded_at.replace(/[-:.TZ]/gu, "");
  return [
    recorded,
    event.work_id,
    sequencePrefix(event.sequence),
    digestFilePart(event.event_digest),
  ].join("-") + ".json";
}

function receiptRelativeName(event) {
  return path.join(
    event.work_id,
    `${sequencePrefix(event.sequence)}-${digestFilePart(event.event_digest)}.json`,
  );
}

function retryRelativeName(event, attemptId) {
  return path.join(
    event.work_id,
    event.event_id,
    `${safeId(attemptId, "attempt_id_invalid")}.json`,
  );
}

function publicationToken(...parts) {
  return `tmp.${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 32)}`;
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (!IGNORED_DIRECTORY_SYNC_CODES.has(error?.code)) throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function callStep(callback, step) {
  if (callback) await callback(step);
}

async function immutablePublish(target, value, {
  temporaryToken,
  onDurableStep,
} = {}) {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const token = safeId(
    temporaryToken ?? `tmp.${process.pid}.${Date.now()}`,
    "temporary_token_invalid",
  );
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${token}.tmp`,
  );
  let published = false;
  try {
    let handle;
    try {
      handle = await open(temporary, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const orphan = await lstat(temporary);
      if (orphan.isSymbolicLink() || !orphan.isFile()) {
        fail("atomic_temporary_invalid");
      }
      await rm(temporary, { force: true });
      await syncDirectory(directory);
      handle = await open(temporary, "wx");
    }
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await callStep(onDurableStep, "temporary_synced");
    try {
      await link(temporary, target);
      published = true;
      await syncDirectory(directory);
      await callStep(onDurableStep, "target_published");
      return "written";
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(target, "utf8").catch(() => null);
      if (existing === bytes) return "replayed";
      fail("immutable_artifact_conflict");
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
    if (!published) await syncDirectory(directory).catch(() => {});
  }
}

async function readBoundedJson(target, invalidCode) {
  let before;
  try {
    before = await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (
    before.isSymbolicLink()
    || !before.isFile()
    || before.size > MAX_JSON_BYTES
  ) {
    fail(invalidCode);
  }
  let parsed;
  try {
    parsed = JSON.parse((await readFile(target, "utf8")).replace(/^\uFEFF/u, ""));
  } catch {
    fail(invalidCode);
  }
  const after = await stat(target);
  if (
    before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
  ) {
    fail(`${invalidCode}_changed`);
  }
  return parsed;
}

function validateOneEvent(event) {
  if (!validateStrictSchema(event)) {
    fail("strict_schema_validation_failed");
  }
  try {
    validateAiWorkRecordEvent(event);
  } catch {
    fail("event_validation_failed");
  }
  return event;
}

export function validateAiWorkRecordOutboxBatch(events, priorEvents = []) {
  if (!Array.isArray(events) || events.length < 1) fail("event_batch_required");
  if (!Array.isArray(priorEvents)) fail("prior_events_invalid");
  for (const event of priorEvents) validateOneEvent(event);
  for (const event of events) validateOneEvent(event);
  const reduction = reduceAiWorkRecordEvents(events, priorEvents);
  if (reduction.decision === "HOLD") {
    fail(`reducer_hold_${reduction.reason_code}`);
  }
  return reduction;
}

async function listEventFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && EVENT_FILE.test(entry.name)) {
      files.push(path.join(directory, entry.name));
    } else if (
      entry.isFile()
      && ATOMIC_TEMP_FILE.test(entry.name)
    ) {
      // A hard process crash may leave this regenerable publication artifact.
    } else {
      fail("persisted_events_entry_invalid");
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

export async function readAiWorkRecordHistory({
  stateRoot,
  projectCode,
  workId,
}) {
  const paths = getAiWorkRecordOutboxPaths({ stateRoot, projectCode });
  const safeWorkId = safeId(workId, "work_id_invalid");
  const workDirectory = path.join(paths.events, safeWorkId);
  await assertSafeDirectoryAncestry(paths.state_root, workDirectory);
  const files = await listEventFiles(workDirectory);
  const events = [];
  for (const file of files) {
    const event = await readBoundedJson(file, "persisted_event_invalid");
    validateOneEvent(event);
    if (
      event.work_id !== safeWorkId
      || event.project_ref !== projectCode
      || eventRelativeName(event) !== path.relative(paths.events, file)
    ) {
      fail("persisted_event_scope_invalid");
    }
    events.push(event);
  }
  if (events.length > 0) {
    const reduction = reduceAiWorkRecordEvents(events);
    if (reduction.decision === "HOLD") {
      fail(`persisted_history_hold_${reduction.reason_code}`);
    }
  }
  return events;
}

async function assertProjectIdentityAvailable({
  stateRoot,
  projectCode,
  event,
}) {
  const paths = getAiWorkRecordOutboxPaths({ stateRoot, projectCode });
  await assertSafeDirectoryAncestry(paths.state_root, paths.events);
  let entries;
  try {
    entries = await readdir(paths.events, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) fail("persisted_events_entry_invalid");
    if (entry.name === event.work_id) continue;
    const existingEvents = await readAiWorkRecordHistory({
      stateRoot,
      projectCode,
      workId: entry.name,
    });
    for (const existing of existingEvents) {
      if (existing.event_id === event.event_id) fail("event_id_conflict");
      if (existing.idempotency_key === event.idempotency_key) {
        fail("idempotency_key_conflict");
      }
    }
  }
}

function validateLockRecord(value) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(",")
      !== "acquired_at,fencing_token,owner_token".split(",").sort().join(",")
  ) {
    fail("lock_record_invalid");
  }
  return {
    owner_token: safeId(value.owner_token, "owner_token_invalid"),
    fencing_token: safeId(value.fencing_token, "fencing_token_invalid"),
    acquired_at: safeTimestamp(value.acquired_at, "lock_acquired_at_invalid"),
  };
}

async function assertFence(lockPath, expected) {
  const current = await readBoundedJson(lockPath, "lock_record_invalid");
  if (
    current === null
    || current.owner_token !== expected.owner_token
    || current.fencing_token !== expected.fencing_token
    || current.acquired_at !== expected.acquired_at
  ) {
    fail("fencing_token_mismatch");
  }
}

export async function withAiWorkRecordOutboxLock({
  stateRoot,
  projectCode,
  ownerToken,
  fencingToken,
  acquiredAt,
}, callback) {
  if (typeof callback !== "function") fail("lock_callback_required");
  assertSyntheticAiWorkRecordRoot(stateRoot);
  const paths = getAiWorkRecordOutboxPaths({ stateRoot, projectCode });
  const owner = validateLockRecord({
    owner_token: ownerToken,
    fencing_token: fencingToken,
    acquired_at: acquiredAt,
  });
  await assertSafeDirectoryAncestry(paths.state_root, path.dirname(paths.lock));
  await mkdir(path.dirname(paths.lock), { recursive: true });
  let handle;
  try {
    handle = await open(paths.lock, "wx");
    await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await syncDirectory(path.dirname(paths.lock));
  } catch (error) {
    await handle?.close().catch(() => {});
    if (error?.code === "EEXIST") fail("outbox_lock_busy");
    throw error;
  }
  const fence = {
    owner_token: owner.owner_token,
    fencing_token: owner.fencing_token,
    acquired_at: owner.acquired_at,
    assert: () => assertFence(paths.lock, owner),
  };
  try {
    return await callback(fence);
  } finally {
    const current = await readBoundedJson(
      paths.lock,
      "lock_record_invalid",
    ).catch(() => null);
    if (
      current?.owner_token === owner.owner_token
      && current?.fencing_token === owner.fencing_token
    ) {
      await rm(paths.lock, { force: true });
      await syncDirectory(path.dirname(paths.lock)).catch(() => {});
    }
  }
}

function requireFence(fence) {
  if (
    fence === null
    || typeof fence !== "object"
    || typeof fence.assert !== "function"
  ) {
    fail("fence_required");
  }
  safeId(fence.owner_token, "owner_token_invalid");
  safeId(fence.fencing_token, "fencing_token_invalid");
  safeTimestamp(fence.acquired_at, "lock_acquired_at_invalid");
  return fence;
}

function baseReceipt(event, receiptKind, recordedAt) {
  const core = {
    schema_version: AI_WORK_RECORD_OUTBOX_RECEIPT_SCHEMA,
    receipt_kind: receiptKind,
    project_ref: event.project_ref,
    work_id: event.work_id,
    event_id: event.event_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    recorded_at: safeTimestamp(recordedAt, "receipt_recorded_at_invalid"),
    metadata_boundary: "metadata_only",
    official_completion: false,
  };
  return {
    ...core,
    receipt_digest: digestJson(core),
  };
}

function validateReceiptRecord(value, receiptKind, event = null) {
  const requiredKeys = [
    "schema_version",
    "receipt_kind",
    "project_ref",
    "work_id",
    "event_id",
    "event_digest",
    "sequence",
    "recorded_at",
    "metadata_boundary",
    "official_completion",
    "receipt_digest",
  ];
  if (receiptKind === "ack") requiredKeys.push("ack_id");
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(",") !== requiredKeys.sort().join(",")
    || value.schema_version !== AI_WORK_RECORD_OUTBOX_RECEIPT_SCHEMA
    || value.receipt_kind !== receiptKind
    || value.metadata_boundary !== "metadata_only"
    || value.official_completion !== false
  ) {
    fail(`${receiptKind}_receipt_invalid`);
  }
  safeProject(value.project_ref);
  safeId(value.work_id, "receipt_work_id_invalid");
  safeId(value.event_id, "receipt_event_id_invalid");
  safeDigest(value.event_digest);
  safeSequence(value.sequence);
  safeTimestamp(value.recorded_at, "receipt_recorded_at_invalid");
  safeDigest(value.receipt_digest);
  if (receiptKind === "ack") safeId(value.ack_id, "ack_id_invalid");
  const { receipt_digest: actualDigest, ...digestBasis } = value;
  if (digestJson(digestBasis) !== actualDigest) {
    fail(`${receiptKind}_receipt_digest_mismatch`);
  }
  if (event !== null) {
    if (
      value.project_ref !== event.project_ref
      || value.work_id !== event.work_id
      || value.event_id !== event.event_id
      || value.event_digest !== event.event_digest
      || value.sequence !== event.sequence
    ) {
      fail(`${receiptKind}_receipt_event_mismatch`);
    }
    if (
      receiptKind !== "ack"
      && value.recorded_at !== event.recorded_at
    ) {
      fail(`${receiptKind}_receipt_time_mismatch`);
    }
    if (
      receiptKind === "ack"
      && value.recorded_at < event.recorded_at
    ) {
      fail("ack_time_before_event");
    }
  }
  return value;
}

function pendingRecord(event) {
  const core = {
    schema_version: AI_WORK_RECORD_OUTBOX_RECEIPT_SCHEMA,
    receipt_kind: "pending",
    project_ref: event.project_ref,
    work_id: event.work_id,
    event_id: event.event_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    recorded_at: event.recorded_at,
    metadata_boundary: "metadata_only",
    official_completion: false,
  };
  return {
    ...core,
    receipt_digest: digestJson(core),
  };
}

function retryRecord(event, fence, {
  attemptId,
  attemptedAt,
  disposition,
}) {
  const core = {
    schema_version: AI_WORK_RECORD_RETRY_SCHEMA,
    attempt_id: safeId(attemptId, "attempt_id_invalid"),
    attempted_at: safeTimestamp(attemptedAt, "attempted_at_invalid"),
    disposition,
    project_ref: event.project_ref,
    work_id: event.work_id,
    event_id: event.event_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    fencing_token: fence.fencing_token,
    metadata_boundary: "metadata_only",
    official_completion: false,
  };
  return {
    ...core,
    retry_digest: digestJson(core),
  };
}

export async function inspectAiWorkRecordCandidate({
  stateRoot,
  projectCode,
  event,
}) {
  validateOneEvent(event);
  if (event.project_ref !== safeProject(projectCode)) {
    fail("event_project_mismatch");
  }
  await assertProjectIdentityAvailable({ stateRoot, projectCode, event });
  const priorEvents = await readAiWorkRecordHistory({
    stateRoot,
    projectCode,
    workId: event.work_id,
  });
  const reduction = validateAiWorkRecordOutboxBatch([event], priorEvents);
  return {
    decision: reduction.decision,
    accepted_count: reduction.accepted_count,
    no_op_count: reduction.no_op_count,
    event_id: event.event_id,
    work_id: event.work_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    official_completion: false,
  };
}

export async function appendAiWorkRecordEvent({
  stateRoot,
  projectCode,
  event,
  attemptId,
  attemptedAt,
  fence,
  onDurableStep = null,
}) {
  assertSyntheticAiWorkRecordRoot(stateRoot);
  const activeFence = requireFence(fence);
  safeId(attemptId, "attempt_id_invalid");
  await activeFence.assert();
  const inspection = await inspectAiWorkRecordCandidate({
    stateRoot,
    projectCode,
    event,
  });
  safeTimestamp(attemptedAt, "attempted_at_invalid");
  if (attemptedAt < event.recorded_at) fail("attempt_time_before_event");
  const paths = getAiWorkRecordOutboxPaths({ stateRoot, projectCode });
  const eventTarget = path.join(paths.events, eventRelativeName(event));
  const pendingTarget = path.join(paths.pending, pendingFileName(event));
  const receiptName = receiptRelativeName(event);
  const pendingReceiptTarget = path.join(paths.receipts_pending, receiptName);
  const persistedReceiptTarget = path.join(
    paths.receipts_local_persisted,
    receiptName,
  );
  const retryTarget = path.join(
    paths.retry_index,
    retryRelativeName(event, attemptId),
  );
  for (const target of [
    eventTarget,
    pendingTarget,
    pendingReceiptTarget,
    persistedReceiptTarget,
    retryTarget,
  ]) {
    await assertSafeDirectoryAncestry(paths.state_root, path.dirname(target));
  }
  const publish = async (label, target, value) => {
    await activeFence.assert();
    const result = await immutablePublish(target, value, {
      temporaryToken: publicationToken(attemptId, label),
      onDurableStep: onDurableStep
        ? (step) => onDurableStep(`${label}.${step}`)
        : null,
    });
    await activeFence.assert();
    await callStep(onDurableStep, `${label}.complete`);
    return result;
  };

  const eventStatus = await publish("event", eventTarget, event);
  await publish("pending", pendingTarget, pendingRecord(event));
  await publish(
    "pending_receipt",
    pendingReceiptTarget,
    baseReceipt(event, "pending", event.recorded_at),
  );
  await publish(
    "local_persisted_receipt",
    persistedReceiptTarget,
    baseReceipt(event, "local_persisted", event.recorded_at),
  );
  const disposition = eventStatus === "written" && inspection.decision === "accept"
    ? "local_persisted"
    : "replayed_local_persisted";
  await publish(
    "retry_index",
    retryTarget,
    retryRecord(event, activeFence, {
      attemptId,
      attemptedAt,
      disposition,
    }),
  );
  return {
    ok: true,
    operation: "publish",
    disposition,
    event_id: event.event_id,
    work_id: event.work_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    pending_order_key: path.basename(pendingTarget, ".json"),
    receipt_state: "local_persisted",
    official_completion: false,
    claim_ceiling: "canon_candidate_public_synthetic_feature_off",
  };
}

async function findPersistedEvent({
  stateRoot,
  projectCode,
  workId,
  eventId,
  eventDigest,
  sequence,
}) {
  const events = await readAiWorkRecordHistory({
    stateRoot,
    projectCode,
    workId,
  });
  const event = events.find((candidate) => candidate.event_id === eventId);
  if (!event) fail("ack_event_not_found");
  if (
    event.event_digest !== eventDigest
    || event.sequence !== sequence
  ) {
    fail("ack_event_conflict");
  }
  const paths = getAiWorkRecordOutboxPaths({ stateRoot, projectCode });
  const persisted = await readBoundedJson(
    path.join(
      paths.receipts_local_persisted,
      receiptRelativeName(event),
    ),
    "local_persisted_receipt_invalid",
  );
  if (persisted === null) fail("event_not_locally_persisted");
  validateReceiptRecord(persisted, "local_persisted", event);
  return event;
}

async function loadAcknowledgementCandidate({
  stateRoot,
  projectCode,
  workId,
  eventId,
  eventDigest,
  sequence,
  ackId,
  ackedAt,
}) {
  assertSyntheticAiWorkRecordRoot(stateRoot);
  safeId(eventId, "event_id_invalid");
  safeDigest(eventDigest);
  safeSequence(sequence);
  safeId(ackId, "ack_id_invalid");
  safeTimestamp(ackedAt, "acked_at_invalid");
  const event = await findPersistedEvent({
    stateRoot,
    projectCode,
    workId: safeId(workId, "work_id_invalid"),
    eventId,
    eventDigest,
    sequence,
  });
  if (ackedAt < event.recorded_at) fail("ack_time_before_event");
  return event;
}

export async function inspectAiWorkRecordAcknowledgement(options) {
  const event = await loadAcknowledgementCandidate(options);
  return {
    ok: true,
    operation: "ack",
    mode: "dry_run",
    ack_id: options.ackId,
    event_id: event.event_id,
    work_id: event.work_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    official_completion: false,
    claim_ceiling: "canon_candidate_public_synthetic_feature_off",
  };
}

export async function acknowledgeAiWorkRecordEvent({
  stateRoot,
  projectCode,
  workId,
  eventId,
  eventDigest,
  sequence,
  ackId,
  ackedAt,
  fence,
  onDurableStep = null,
}) {
  assertSyntheticAiWorkRecordRoot(stateRoot);
  const activeFence = requireFence(fence);
  await activeFence.assert();
  const event = await loadAcknowledgementCandidate({
    stateRoot,
    projectCode,
    workId,
    eventId,
    eventDigest,
    sequence,
    ackId,
    ackedAt,
  });
  const paths = getAiWorkRecordOutboxPaths({ stateRoot, projectCode });
  const receiptCore = {
    ...baseReceipt(event, "ack", ackedAt),
    ack_id: ackId,
  };
  const { receipt_digest: ignoredDigest, ...receiptWithoutDigest } = receiptCore;
  const receipt = {
    ...receiptWithoutDigest,
    receipt_digest: digestJson(receiptWithoutDigest),
  };
  const ackTarget = path.join(
    paths.receipts_ack,
    event.work_id,
    event.event_id,
    `${ackId}.json`,
  );
  await assertSafeDirectoryAncestry(paths.state_root, path.dirname(ackTarget));
  await activeFence.assert();
  const writeStatus = await immutablePublish(ackTarget, receipt, {
    temporaryToken: publicationToken(ackId, "ack"),
    onDurableStep,
  });
  await activeFence.assert();
  return {
    ok: true,
    operation: "ack",
    disposition: writeStatus === "written" ? "acknowledged" : "ack_replayed",
    ack_id: ackId,
    event_id: event.event_id,
    work_id: event.work_id,
    event_digest: event.event_digest,
    sequence: event.sequence,
    receipt_state: "ack",
    official_completion: false,
    claim_ceiling: "canon_candidate_public_synthetic_feature_off",
  };
}

async function ackExists(paths, event) {
  const directory = path.join(
    paths.receipts_ack,
    event.work_id,
    event.event_id,
  );
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    let found = false;
    for (const entry of entries) {
      if (entry.isFile() && ATOMIC_TEMP_FILE.test(entry.name)) continue;
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        fail("ack_receipt_entry_invalid");
      }
      const receipt = await readBoundedJson(
        path.join(directory, entry.name),
        "ack_receipt_invalid",
      );
      validateReceiptRecord(receipt, "ack", event);
      if (entry.name !== `${receipt.ack_id}.json`) {
        fail("ack_receipt_path_mismatch");
      }
      found = true;
    }
    return found;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function listPendingAiWorkRecordEvents({
  stateRoot,
  projectCode,
}) {
  const paths = getAiWorkRecordOutboxPaths({ stateRoot, projectCode });
  await assertSafeDirectoryAncestry(paths.state_root, paths.pending);
  let entries;
  try {
    entries = await readdir(paths.pending, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") entries = [];
    else throw error;
  }
  const pending = [];
  const pendingEntries = [];
  for (const entry of entries) {
    if (entry.isFile() && ATOMIC_TEMP_FILE.test(entry.name)) continue;
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      fail("pending_entry_invalid");
    }
    pendingEntries.push(entry);
  }
  for (const entry of pendingEntries.sort((left, right) => (
    left.name.localeCompare(right.name, "en")
  ))) {
    const record = await readBoundedJson(
      path.join(paths.pending, entry.name),
      "pending_record_invalid",
    );
    validateReceiptRecord(record, "pending");
    if (record.project_ref !== projectCode) fail("pending_record_invalid");
    const event = (await readAiWorkRecordHistory({
      stateRoot,
      projectCode,
      workId: record.work_id,
    })).find((candidate) => candidate.event_id === record.event_id);
    if (
      !event
      || event.event_digest !== record.event_digest
      || event.sequence !== record.sequence
    ) {
      fail("pending_event_missing");
    }
    validateReceiptRecord(record, "pending", event);
    if (entry.name !== pendingFileName(event)) {
      fail("pending_record_path_mismatch");
    }
    const pendingReceipt = await readBoundedJson(
      path.join(paths.receipts_pending, receiptRelativeName(event)),
      "pending_receipt_invalid",
    );
    if (pendingReceipt === null) fail("pending_receipt_missing");
    validateReceiptRecord(pendingReceipt, "pending", event);
    const localPersistedReceipt = await readBoundedJson(
      path.join(
        paths.receipts_local_persisted,
        receiptRelativeName(event),
      ),
      "local_persisted_receipt_invalid",
    );
    if (localPersistedReceipt === null) {
      fail("event_not_locally_persisted");
    }
    validateReceiptRecord(
      localPersistedReceipt,
      "local_persisted",
      event,
    );
    if (!(await ackExists(paths, event))) {
      pending.push({
        order_key: path.basename(entry.name, ".json"),
        project_ref: event.project_ref,
        work_id: event.work_id,
        event_id: event.event_id,
        event_digest: event.event_digest,
        sequence: event.sequence,
        event_kind: event.event_kind,
        recorded_at: event.recorded_at,
        official_completion: false,
      });
    }
  }
  return {
    ok: true,
    operation: "pending",
    project_ref: projectCode,
    pending_count: pending.length,
    pending,
    official_completion: false,
    claim_ceiling: "canon_candidate_public_synthetic_feature_off",
  };
}

export async function removeAiWorkRecordTestRoot(testRoot) {
  const resolved = absoluteRoot(testRoot);
  const marker = path.basename(resolved);
  if (!marker.startsWith("soulforge-ai-work-record-test-")) {
    fail("test_root_marker_required");
  }
  await rm(resolved, { recursive: true, force: true });
}

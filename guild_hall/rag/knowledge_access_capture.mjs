import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendKnowledgeAccessEventBatch,
  prepareKnowledgeAccessEventBatch,
  resolveLedgerTarget,
  validateKnowledgeAccessEvent,
} from "../knowledge_access/ledger.mjs";
import { readJson, writeJson } from "../shared/io.mjs";

export const RAG_KNOWLEDGE_ACCESS_RECEIPT_SCHEMA_VERSION = "soulforge.rag_knowledge_access_receipt.v0";
export const RAG_OUTPUT_RESERVATION_SCHEMA_VERSION = "soulforge.rag_output_reservation.v0";

export async function reserveRagOutputOccurrence(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const owner = validateRagOutputOwner({
    outputRef: options.outputRef,
    projectCode: options.projectCode,
  });
  const target = resolveReservationTarget(repoRoot, owner.output_ref, owner.project_code);
  await fs.mkdir(path.dirname(target.path), { recursive: true });
  let handle;
  try {
    handle = await fs.open(target.path, "wx", 0o600);
    await handle.writeFile(
      `${JSON.stringify({
        schema_version: RAG_OUTPUT_RESERVATION_SCHEMA_VERSION,
        kind: "rag_output_reservation",
        project_code: owner.project_code,
        output_ref: owner.output_ref,
        output_revision_ref: options.outputRevisionRef ?? null,
        created_at_utc: normalizeTimestampUtc(options.now),
        boundary: {
          metadata_only: true,
          raw_question_included: false,
          source_or_chunk_body_included: false,
        },
      }, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("rag_output_occurrence_already_reserved");
    }
    throw error;
  } finally {
    await handle?.close();
  }
  return {
    status: "reserved",
    reservation_ref: target.ref,
  };
}

export async function releaseRagOutputOccurrence(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const reservationRef = normalizeRepoRelativeRef(
    options.reservationRef ?? options.reservation_ref,
    "reservation_ref",
  );
  if (!isRagOutputReservationRef(reservationRef)) {
    throw new Error("rag_output_reservation_ref_not_allowed");
  }
  const reservationPath = path.resolve(repoRoot, reservationRef);
  if (!isSubpath(repoRoot, reservationPath)) {
    throw new Error("rag_output_reservation_ref_not_allowed");
  }
  await fs.unlink(reservationPath).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  return { status: "released", reservation_ref: reservationRef };
}

export async function prepareRagRetrievalAccessPendingReceipt(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const owner = validateRagOutputOwner({
    outputRef: options.outputRef,
    projectCode: options.projectCode,
  });
  const applicability = classifyApplicability(options);
  if (applicability) return applicability;

  const batchOptions = buildBatchOptions({ ...options, repoRoot });
  const prepared = prepareKnowledgeAccessEventBatch(batchOptions);
  const receiptTarget = resolveReceiptTarget(repoRoot, {
    outputRef: owner.output_ref,
    projectCode: owner.project_code,
    now: options.now,
  });
  const receipt = buildReceipt({
    status: "pending",
    outputRef: owner.output_ref,
    ledgerRef: prepared.ledger_ref,
    events: prepared.events,
  });
  await writeJsonExclusive(receiptTarget.path, receipt);
  return {
    status: "pending",
    event_count: prepared.events.length,
    ledger_ref: prepared.ledger_ref,
    pending_receipt_ref: receiptTarget.ref,
    event_ids: prepared.events.map((event) => event.event_id),
  };
}

export async function recordRagRetrievalAccessEvents(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const owner = validateRagOutputOwner({
    outputRef: options.outputRef,
    projectCode: options.projectCode,
  });
  const applicability = classifyApplicability(options);
  if (applicability) return applicability;

  const pending = options.pendingReceiptRef
    ? {
        pending_receipt_ref: verifyPendingReceiptRef({
          repoRoot,
          outputRef: owner.output_ref,
          projectCode: owner.project_code,
          suppliedRef: options.pendingReceiptRef,
        }),
      }
    : await prepareRagRetrievalAccessPendingReceipt({ ...options, repoRoot });
  const pendingReceiptPath = path.resolve(repoRoot, pending.pending_receipt_ref);
  const pendingReceipt = await readJson(pendingReceiptPath);
  validatePendingReceiptForReconcile(pendingReceipt);
  assertReceiptMatchesOptions(pendingReceipt, {
    outputRef: owner.output_ref,
    outputRevisionRef: options.outputRevisionRef,
    projectCode: owner.project_code,
  });
  let result;
  try {
    result = await appendKnowledgeAccessEventBatch(buildBatchOptions({ ...options, repoRoot }));
    await assertLedgerContainsEvents(result.ledger_path, result.events);
  } catch {
    throw new Error(`rag_knowledge_access_append_failed_pending_receipt:${pending.pending_receipt_ref}`);
  }

  if (!sameStringSet(pendingReceipt.dedupe_keys, result.events.map((event) => event.dedupe_key))) {
    throw new Error(`rag_knowledge_access_append_failed_pending_receipt:${pending.pending_receipt_ref}`);
  }

  await writeJson(
    pendingReceiptPath,
    buildReceipt({
      status: "recorded",
      outputRef: owner.output_ref,
      ledgerRef: result.ledger_ref,
      events: result.events,
    }),
  );

  return {
    status: "recorded",
    event_count: result.events.length,
    ledger_ref: result.ledger_ref,
    receipt_ref: pending.pending_receipt_ref,
    event_ids: result.events.map((event) => event.event_id),
  };
}

export async function reconcileRagRetrievalAccessPendingReceipt(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const receiptRef = normalizeRepoRelativeRef(options.receiptRef ?? options.receipt_ref, "receipt_ref");
  const receiptPath = path.resolve(repoRoot, receiptRef);
  if (!isSubpath(repoRoot, receiptPath) || !isRagKnowledgeAccessReceiptRef(receiptRef)) {
    throw new Error("rag_knowledge_access_receipt_must_stay_in_repo_owner_surface");
  }
  const receipt = await readJson(receiptPath);
  const declaredProject = receipt?.events?.[0]?.work_context?.project_code ?? "system";
  const receiptOwner = validateRagOutputOwner({
    outputRef: receipt?.output_ref,
    projectCode: declaredProject,
  });
  assertReceiptOwner(receiptRef, receiptOwner.project_code);
  if (receipt?.status === "recorded") {
    validateReceipt(receipt, "recorded");
    return {
      status: "already_recorded",
      receipt_ref: receiptRef,
      ledger_ref: receipt.ledger_ref,
      event_count: receipt.events.length,
      event_ids: receipt.events.map((event) => event.event_id),
    };
  }
  validatePendingReceiptForReconcile(receipt);

  const outputRef = normalizeRepoRelativeRef(receipt.output_ref, "receipt_output_ref");
  const owner = receiptOwner;
  const outputPath = path.resolve(repoRoot, outputRef);
  const output = await readJson(outputPath);
  const observedRevisionRef = `sha256:${createHash("sha256").update(JSON.stringify(output)).digest("hex")}`;
  if (observedRevisionRef !== receipt.output_revision_ref) {
    throw new Error("rag_knowledge_access_receipt_output_revision_mismatch");
  }

  const recoveryLedger = resolveLedgerTarget({
    repoRoot,
    ledgerRoot: path.join(repoRoot, "_workmeta", owner.project_code, "reports", "knowledge_access"),
    ledgerShardId: `${buildOpaqueWriterShardId()}_recovery_${opaqueHash(receiptRef, 12)}`,
    now: receipt.events[0].timestamp_utc,
  });
  const recoveredEvents = receipt.events.map((event) => ({
    ...event,
    ledger_ref: recoveryLedger.ledger_ref,
  }));
  for (const event of recoveredEvents) {
    if (!validateKnowledgeAccessEvent(event).ok) {
      throw new Error("rag_knowledge_access_recovery_event_invalid");
    }
  }
  const existingEvents = await readValidKnowledgeAccessEvents(recoveryLedger.path);
  const existingProvenanceKeys = new Set(
    existingEvents.map((event) => `${event.dedupe_key}\u0000${event.ledger_ref}`),
  );
  const missingEvents = recoveredEvents.filter(
    (event) => !existingProvenanceKeys.has(`${event.dedupe_key}\u0000${event.ledger_ref}`),
  );
  if (missingEvents.length > 0) {
    await fs.mkdir(path.dirname(recoveryLedger.path), { recursive: true });
    await fs.appendFile(
      recoveryLedger.path,
      `\n${missingEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
  }
  await assertLedgerContainsEvents(recoveryLedger.path, recoveredEvents);

  const recordedReceipt = buildReceipt({
    status: "recorded",
    outputRef,
    ledgerRef: recoveryLedger.ledger_ref,
    events: recoveredEvents,
  });
  await writeJson(receiptPath, recordedReceipt);
  const reservationTarget = resolveReservationTarget(repoRoot, outputRef, owner.project_code);
  await releaseRagOutputOccurrence({ repoRoot, reservationRef: reservationTarget.ref });
  return {
    status: "recorded",
    receipt_ref: receiptRef,
    ledger_ref: recoveryLedger.ledger_ref,
    event_count: recoveredEvents.length,
    event_ids: recoveredEvents.map((event) => event.event_id),
  };
}

function buildBatchOptions(options) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const targets = Array.isArray(options.targets) ? options.targets : [];
  return {
    repoRoot,
    ledgerRoot: resolveKnowledgeAccessLedgerRoot({
      repoRoot,
      projectCode: options.projectCode ?? "system",
      ledgerRoot: options.ledgerRoot,
    }),
    ledgerShardId: options.ledgerShardId ?? buildOpaqueWriterShardId(),
    now: options.now,
    events: targets.map((target, index) => ({
      knowledgeRef: target.knowledgeRef,
      captureMode: "search_tool_appended",
      actorType: "tool",
      actorId: options.actorId ?? "guild_hall.rag",
      accessType: "retrieve",
      reasonUsed: options.reasonUsed ?? "rag retrieval selected evidence for answer context",
      outputRef: options.outputRef,
      outputRevisionRef: options.outputRevisionRef,
      eventSourceRef: options.outputRef,
      outcomeState: "routed",
      taskRef: options.taskRef,
      runRef: options.outputRef,
      projectCode: options.projectCode ?? "system",
      gateId: options.gateId,
      branchId: options.branchId,
      targetType: target.targetType ?? "rag_retrieval_unit",
      revisionRef: target.revisionRef,
      retrievalContext: {
        retrievalRunRef: options.outputRef,
        traceId: options.traceId,
        queryFingerprint: options.queryFingerprint,
        resultRank: target.resultRank ?? index + 1,
        selectedForContext: true,
      },
    })),
  };
}

function classifyApplicability(options) {
  if (options.enabled === false) {
    return { status: "skipped", event_count: 0, ledger_ref: null, receipt_ref: null, event_ids: [] };
  }
  if (!Array.isArray(options.targets) || options.targets.length === 0) {
    return { status: "not_applicable", event_count: 0, ledger_ref: null, receipt_ref: null, event_ids: [] };
  }
  return null;
}

function buildReceipt({ status, outputRef, ledgerRef, events }) {
  return {
    schema_version: RAG_KNOWLEDGE_ACCESS_RECEIPT_SCHEMA_VERSION,
    kind: "rag_knowledge_access_receipt",
    status,
    timestamp_utc: events[0]?.timestamp_utc ?? null,
    output_ref: outputRef,
    output_revision_ref: events[0]?.output_revision_ref ?? null,
    ledger_ref: ledgerRef,
    event_count: events.length,
    event_ids: events.map((event) => event.event_id),
    dedupe_keys: events.map((event) => event.dedupe_key),
    events,
    targets: events.map((event) => ({
      knowledge_ref: event.target.knowledge_ref,
      target_type: event.target.target_type,
      revision_ref: event.target.revision_ref,
      result_rank: event.retrieval_context?.result_rank ?? null,
    })),
    boundary: {
      metadata_only: true,
      raw_question_included: false,
      source_or_chunk_body_included: false,
      retry_may_reappend_same_dedupe_key: true,
    },
  };
}

function validatePendingReceiptForReconcile(receipt) {
  validateReceipt(receipt, "pending");
}

function validateReceipt(receipt, expectedStatus) {
  if (receipt?.schema_version !== RAG_KNOWLEDGE_ACCESS_RECEIPT_SCHEMA_VERSION) {
    throw new Error("rag_knowledge_access_receipt_schema_invalid");
  }
  if (receipt.kind !== "rag_knowledge_access_receipt" || receipt.status !== expectedStatus) {
    throw new Error(`rag_knowledge_access_receipt_not_${expectedStatus}`);
  }
  if (receipt.boundary?.metadata_only !== true || receipt.boundary?.raw_question_included !== false) {
    throw new Error("rag_knowledge_access_receipt_boundary_invalid");
  }
  if (!Array.isArray(receipt.events) || receipt.events.length === 0) {
    throw new Error("rag_knowledge_access_receipt_events_missing");
  }
  if (
    receipt.event_count !== receipt.events.length ||
    !sameStringSet(receipt.event_ids, receipt.events.map((event) => event.event_id)) ||
    !sameStringSet(receipt.dedupe_keys, receipt.events.map((event) => event.dedupe_key)) ||
    !/^sha256:[a-f0-9]{64}$/u.test(String(receipt.output_revision_ref ?? ""))
  ) {
    throw new Error("rag_knowledge_access_receipt_event_count_or_revision_invalid");
  }
  for (const event of receipt.events) {
    if (
      !validateKnowledgeAccessEvent(event).ok ||
      event.ledger_ref !== receipt.ledger_ref ||
      event.output_ref !== receipt.output_ref ||
      event.output_revision_ref !== receipt.output_revision_ref
    ) {
      throw new Error("rag_knowledge_access_receipt_event_invalid");
    }
  }
}

function assertReceiptMatchesOptions(receipt, { outputRef, outputRevisionRef, projectCode }) {
  if (
    receipt.output_ref !== outputRef ||
    receipt.output_revision_ref !== outputRevisionRef ||
    receipt.events.some((event) => event.work_context?.project_code !== projectCode)
  ) {
    throw new Error("rag_knowledge_access_pending_receipt_context_mismatch");
  }
}

function resolveReceiptTarget(repoRoot, { outputRef, projectCode, now }) {
  const owner = validateRagOutputOwner({ outputRef, projectCode });
  const timestamp = normalizeTimestampUtc(now);
  const year = timestamp.slice(0, 4);
  const yearMonth = timestamp.slice(0, 7);
  const ref = `_workmeta/${owner.project_code}/reports/knowledge_access/receipts/${year}/${yearMonth}/${opaqueHash(owner.output_ref, 24)}.json`;
  const targetPath = path.resolve(repoRoot, ref);
  if (!isSubpath(repoRoot, targetPath) || !isRagKnowledgeAccessReceiptRef(ref)) {
    throw new Error("rag_knowledge_access_receipt_must_stay_in_repo_owner_surface");
  }
  return { ref, path: targetPath };
}

function resolveReservationTarget(repoRoot, outputRef, projectCode) {
  const owner = validateRagOutputOwner({ outputRef, projectCode });
  const ref = owner.output_ref.startsWith("_workspaces/knowledge/rag/answer_runs/")
    ? `_workspaces/knowledge/rag/output_reservations/${opaqueHash(owner.output_ref, 24)}.lock`
    : `_workmeta/${owner.project_code}/reports/knowledge_access/output_reservations/${opaqueHash(owner.output_ref, 24)}.lock`;
  const targetPath = path.resolve(repoRoot, ref);
  if (!isSubpath(repoRoot, targetPath) || !isRagOutputReservationRef(ref)) {
    throw new Error("rag_output_reservation_ref_not_allowed");
  }
  return { ref, path: targetPath };
}

function validateRagOutputOwner({ outputRef, projectCode }) {
  const normalized = normalizeRepoRelativeRef(outputRef, "output_ref");
  const projectSegment = normalizeProjectSegment(projectCode ?? "system");
  if (normalized.startsWith("_workspaces/knowledge/rag/answer_runs/") && normalized.endsWith(".json")) {
    return { output_ref: normalized, project_code: projectSegment };
  }
  const match = normalized.match(
    /^_workmeta\/([A-Za-z0-9][A-Za-z0-9_.-]{0,80})\/reports\/rag\/answer_engine_runs\/.+\.json$/u,
  );
  if (!match) {
    throw new Error("rag_knowledge_access_output_ref_not_allowed");
  }
  if (match[1] !== projectSegment) {
    throw new Error("rag_knowledge_access_output_ref_project_mismatch");
  }
  return { output_ref: normalized, project_code: projectSegment };
}

function normalizeRepoRelativeRef(value, label) {
  const normalized = String(value ?? "").trim().replaceAll("\\", "/");
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new Error(`rag_knowledge_access_${label}_must_be_repo_relative`);
  }
  return normalized;
}

function verifyPendingReceiptRef({ repoRoot, outputRef, projectCode, suppliedRef }) {
  validateRagOutputOwner({ outputRef, projectCode });
  const normalized = normalizeRepoRelativeRef(suppliedRef, "pending_receipt_ref");
  if (
    !isRagKnowledgeAccessReceiptRef(normalized) ||
    path.basename(normalized, ".json") !== opaqueHash(outputRef, 24)
  ) {
    throw new Error("rag_knowledge_access_pending_receipt_ref_mismatch");
  }
  assertReceiptOwner(normalized, normalizeProjectSegment(projectCode ?? "system"));
  const targetPath = path.resolve(repoRoot, normalized);
  if (!isSubpath(repoRoot, targetPath)) {
    throw new Error("rag_knowledge_access_pending_receipt_ref_mismatch");
  }
  return normalized;
}

function assertReceiptOwner(receiptRef, projectCode) {
  const match = String(receiptRef).match(
    /^_workmeta\/([A-Za-z0-9][A-Za-z0-9_.-]{0,80})\/reports\/knowledge_access\/receipts\//u,
  );
  if (!match || match[1] !== projectCode) {
    throw new Error("rag_knowledge_access_receipt_project_mismatch");
  }
}

function isRagKnowledgeAccessReceiptRef(value) {
  return /^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/knowledge_access\/receipts\/\d{4}\/\d{4}-\d{2}\/[a-f0-9]{24}\.json$/u.test(String(value));
}

function isRagOutputReservationRef(value) {
  return (
    /^_workspaces\/knowledge\/rag\/output_reservations\/[a-f0-9]{24}\.lock$/u.test(String(value)) ||
    /^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/knowledge_access\/output_reservations\/[a-f0-9]{24}\.lock$/u.test(String(value))
  );
}

async function writeJsonExclusive(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("rag_knowledge_access_receipt_already_exists");
    }
    throw error;
  }
}

async function readValidKnowledgeAccessEvents(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const events = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (validateKnowledgeAccessEvent(event).ok) events.push(event);
    } catch {
      // Invalid/partial rows remain visible to the snapshot invalid-row counter.
    }
  }
  return events;
}

async function assertLedgerContainsEvents(filePath, expectedEvents) {
  const observed = await readValidKnowledgeAccessEvents(filePath);
  const byDedupeKey = new Map(observed.map((event) => [event.dedupe_key, event]));
  const complete = expectedEvents.every((expected) => {
    const actual = byDedupeKey.get(expected.dedupe_key);
    return (
      actual?.event_id === expected.event_id &&
      actual?.ledger_ref === expected.ledger_ref &&
      actual?.output_ref === expected.output_ref &&
      actual?.output_revision_ref === expected.output_revision_ref
    );
  });
  if (!complete) {
    throw new Error("rag_knowledge_access_ledger_post_append_verification_failed");
  }
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length || leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((value) => rightSet.has(value));
}

function opaqueHash(value, length) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function normalizeTimestampUtc(value) {
  const date = value === undefined || value === null ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("rag_knowledge_access_timestamp_invalid");
  }
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function buildOpaqueWriterShardId() {
  const fingerprint = createHash("sha256").update(os.hostname()).digest("hex").slice(0, 16);
  return `node_${fingerprint}`;
}

function resolveKnowledgeAccessLedgerRoot({ repoRoot, projectCode, ledgerRoot }) {
  const projectSegment = normalizeProjectSegment(projectCode ?? "system");
  const expectedProjectRoot = path.join(repoRoot, "_workmeta", projectSegment, "reports", "knowledge_access");
  if (ledgerRoot) {
    const resolved = path.isAbsolute(String(ledgerRoot))
      ? path.resolve(String(ledgerRoot))
      : path.resolve(repoRoot, String(ledgerRoot));
    if (isSubpath(repoRoot, resolved) && resolved !== expectedProjectRoot) {
      throw new Error("rag_knowledge_access_ledger_root_project_mismatch");
    }
    return resolved;
  }
  return expectedProjectRoot;
}

function isSubpath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeProjectSegment(value) {
  const segment = String(value ?? "system").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/u.test(segment)) {
    throw new Error("knowledge_access_project_code_must_be_safe");
  }
  return segment;
}

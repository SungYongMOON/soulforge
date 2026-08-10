import { promises as fs } from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./usage_meter.mjs";

export const LIFECYCLE_RECEIPT_SCHEMA = "soulforge.ai_usage_lifecycle_receipt.v1";
export const LIFECYCLE_SNAPSHOT_SCHEMA = "soulforge.ai_usage_lifecycle_snapshot.v1";

export const LIFECYCLE_HOOK_EVENTS = Object.freeze({
  SessionStart: "started",
  SubagentStart: "started",
  UserPromptSubmit: "input_received",
  PermissionRequest: "waiting_on_approval",
  Stop: "observed_at_stop",
  SubagentStop: "observed_at_stop",
  SessionEnd: "ended",
});

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const RECEIPT_KEYS = [
  "schema_version", "receipt_id", "source_event", "lifecycle_state", "result_state",
  "identity", "context", "observed_at", "privacy",
];
const IDENTITY_KEYS = ["session_id", "turn_id", "agent_id", "agent_type"];
const CONTEXT_KEYS = ["reason", "permission_mode", "stop_hook_active"];
const PRIVACY_KEYS = ["metadata_only", "raw_content_fields_stored", "raw_flag_fields_stored"];
const SNAPSHOT_KEYS = [
  "schema_version", "generated_at", "receipt_count", "latest_identity_count", "states",
  "result_pending_count", "raw_content_fields_stored", "raw_flag_fields_stored",
];
const IDENTITY_PROJECTION_KEYS = [
  "session_id", "turn_id", "agent_id", "agent_type", "lifecycle_state", "result_state",
  "observed_at", "source_event",
];
const LIFECYCLE_STATES = Object.freeze([...new Set(Object.values(LIFECYCLE_HOOK_EVENTS))]);
const STATE_RANK = Object.freeze({
  started: 0,
  input_received: 1,
  waiting_on_approval: 2,
  observed_at_stop: 3,
  ended: 4,
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function hasExactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort((left, right) => left.localeCompare(right, "en")).join("\u0000")
      === [...keys].sort((left, right) => left.localeCompare(right, "en")).join("\u0000");
}

function requiredSafeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function optionalSafeId(value, code) {
  if (value === undefined || value === null) return null;
  return requiredSafeId(value, code);
}

function optionalSafeCode(value, code) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !SAFE_CODE.test(value)) fail(code);
  return value;
}

function optionalBoolean(value, code) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") fail(code);
  return value;
}

function requiredTimestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(code);
  return new Date(value).toISOString();
}

function zeroOrFail(value, code) {
  if (value !== 0) fail(code);
  return value;
}

function requireLifecycleState(value, code) {
  if (!LIFECYCLE_STATES.includes(value)) fail(code);
  return value;
}

function receiptId({ source_event: sourceEvent, identity, context }) {
  return `alr_${sha256(canonicalJson({ source_event: sourceEvent, identity, context })).slice("sha256:".length)}`;
}

function sameReceiptPayload(left, right) {
  const { observed_at: leftObservedAt, ...leftPayload } = left;
  const { observed_at: rightObservedAt, ...rightPayload } = right;
  return canonicalJson(leftPayload) === canonicalJson(rightPayload);
}

function identityKey(identity) {
  const primary = identity.agent_id ? `agent:${identity.agent_id}` : `session:${identity.session_id}`;
  return `${primary}\u0000turn:${identity.turn_id ?? "session"}`;
}

function compareLatest(left, right) {
  const leftRank = STATE_RANK[left.lifecycle_state] ?? -1;
  const rightRank = STATE_RANK[right.lifecycle_state] ?? -1;
  if (leftRank !== rightRank) return leftRank - rightRank;
  const observed = left.observed_at.localeCompare(right.observed_at, "en");
  if (observed !== 0) return observed;
  return left.receipt_id.localeCompare(right.receipt_id, "en");
}

async function walkJson(root, output = []) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await walkJson(target, output);
    else if (entry.isFile() && target.endsWith(".json")) output.push(target);
  }
  return output;
}

async function writeJsonAtomic(target, payload) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

async function writeReceiptExclusive(target, receipt) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  try {
    await fs.writeFile(target, serialized, { encoding: "utf8", flag: "wx" });
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  let existing;
  try {
    existing = validateLifecycleReceipt(JSON.parse(await fs.readFile(target, "utf8")));
  } catch {
    fail("lifecycle_receipt_existing_invalid");
  }
  if (!sameReceiptPayload(existing, receipt)) fail("lifecycle_receipt_conflict");
  return "replayed";
}

export function sanitizeLifecycleHookInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("hook_input_schema_invalid");
  const sourceEvent = input.hook_event_name;
  if (typeof sourceEvent !== "string") fail("hook_event_name_missing");
  const lifecycleState = LIFECYCLE_HOOK_EVENTS[sourceEvent];
  if (!lifecycleState) fail("hook_event_unsupported");

  const identity = {
    session_id: optionalSafeId(input.session_id, "hook_session_id_invalid"),
    turn_id: optionalSafeId(input.turn_id, "hook_turn_id_invalid"),
    agent_id: optionalSafeId(input.agent_id, "hook_agent_id_invalid"),
    agent_type: optionalSafeCode(input.agent_type, "hook_agent_type_invalid"),
  };
  const context = {
    reason: optionalSafeCode(input.reason, "hook_reason_invalid"),
    permission_mode: optionalSafeCode(input.permission_mode, "hook_permission_mode_invalid"),
    stop_hook_active: optionalBoolean(input.stop_hook_active, "hook_stop_hook_active_invalid"),
  };
  if ((sourceEvent === "SubagentStart" || sourceEvent === "SubagentStop") && !identity.agent_id) {
    fail("hook_subagent_id_missing");
  }
  if (sourceEvent !== "SubagentStart" && sourceEvent !== "SubagentStop" && !identity.session_id) {
    fail("hook_session_id_missing");
  }
  return { source_event: sourceEvent, lifecycle_state: lifecycleState, identity, context };
}

export function validateLifecycleReceipt(receipt) {
  if (!hasExactKeys(receipt, RECEIPT_KEYS)) fail("lifecycle_receipt_shape_invalid");
  if (receipt.schema_version !== LIFECYCLE_RECEIPT_SCHEMA) fail("lifecycle_receipt_schema_invalid");
  requiredSafeId(receipt.receipt_id, "lifecycle_receipt_id_invalid");
  if (!Object.hasOwn(LIFECYCLE_HOOK_EVENTS, receipt.source_event)) fail("lifecycle_receipt_event_invalid");
  if (LIFECYCLE_HOOK_EVENTS[receipt.source_event] !== requireLifecycleState(receipt.lifecycle_state, "lifecycle_receipt_state_invalid")) {
    fail("lifecycle_receipt_event_state_invalid");
  }
  if (receipt.result_state !== "result_pending") fail("lifecycle_receipt_result_state_invalid");
  if (!hasExactKeys(receipt.identity, IDENTITY_KEYS)) fail("lifecycle_receipt_identity_invalid");
  optionalSafeId(receipt.identity.session_id, "lifecycle_receipt_session_id_invalid");
  optionalSafeId(receipt.identity.turn_id, "lifecycle_receipt_turn_id_invalid");
  optionalSafeId(receipt.identity.agent_id, "lifecycle_receipt_agent_id_invalid");
  optionalSafeCode(receipt.identity.agent_type, "lifecycle_receipt_agent_type_invalid");
  if (!receipt.identity.session_id && !receipt.identity.agent_id) fail("lifecycle_receipt_identity_missing");
  if (!hasExactKeys(receipt.context, CONTEXT_KEYS)) fail("lifecycle_receipt_context_invalid");
  optionalSafeCode(receipt.context.reason, "lifecycle_receipt_reason_invalid");
  optionalSafeCode(receipt.context.permission_mode, "lifecycle_receipt_permission_mode_invalid");
  optionalBoolean(receipt.context.stop_hook_active, "lifecycle_receipt_stop_hook_active_invalid");
  requiredTimestamp(receipt.observed_at, "lifecycle_receipt_observed_at_invalid");
  if (!hasExactKeys(receipt.privacy, PRIVACY_KEYS)) fail("lifecycle_receipt_privacy_invalid");
  if (receipt.privacy.metadata_only !== true
    || zeroOrFail(receipt.privacy.raw_content_fields_stored, "lifecycle_receipt_raw_content_invalid") !== 0
    || zeroOrFail(receipt.privacy.raw_flag_fields_stored, "lifecycle_receipt_raw_flag_invalid") !== 0) {
    fail("lifecycle_receipt_privacy_boundary_invalid");
  }
  const expectedId = receiptId(receipt);
  if (receipt.receipt_id !== expectedId) fail("lifecycle_receipt_id_mismatch");
  return receipt;
}

export function createLifecycleReceipt(hookInput, { observedAt = new Date().toISOString() } = {}) {
  const sanitized = sanitizeLifecycleHookInput(hookInput);
  const observed_at = requiredTimestamp(observedAt, "lifecycle_receipt_observed_at_invalid");
  const receipt = {
    schema_version: LIFECYCLE_RECEIPT_SCHEMA,
    receipt_id: receiptId(sanitized),
    source_event: sanitized.source_event,
    lifecycle_state: sanitized.lifecycle_state,
    result_state: "result_pending",
    identity: sanitized.identity,
    context: sanitized.context,
    observed_at,
    privacy: {
      metadata_only: true,
      raw_content_fields_stored: 0,
      raw_flag_fields_stored: 0,
    },
  };
  return validateLifecycleReceipt(receipt);
}

export async function loadLifecycleReceipts(stateRoot) {
  const root = path.join(path.resolve(stateRoot), "lifecycle", "receipts");
  const files = await walkJson(root);
  const receipts = [];
  for (const file of files) {
    let receipt;
    try {
      receipt = validateLifecycleReceipt(JSON.parse(await fs.readFile(file, "utf8")));
    } catch (error) {
      if (error?.code) throw error;
      fail("lifecycle_receipt_persisted_invalid");
    }
    receipts.push(receipt);
  }
  const index = new Map();
  for (const receipt of receipts) {
    const existing = index.get(receipt.receipt_id);
    if (!existing) {
      index.set(receipt.receipt_id, receipt);
      continue;
    }
    if (!sameReceiptPayload(existing, receipt)) fail("lifecycle_receipt_duplicate_persisted");
    if (receipt.observed_at < existing.observed_at) index.set(receipt.receipt_id, receipt);
  }
  return [...index.values()].sort((left, right) => (
    left.observed_at.localeCompare(right.observed_at, "en")
    || left.receipt_id.localeCompare(right.receipt_id, "en")
  ));
}

export function createLifecycleSnapshot(receipts, {
  generatedAt = new Date().toISOString(),
  includeIdentities = false,
} = {}) {
  if (!Array.isArray(receipts)) fail("lifecycle_snapshot_receipts_invalid");
  const generated_at = requiredTimestamp(generatedAt, "lifecycle_snapshot_generated_at_invalid");
  const validated = receipts.map((receipt) => validateLifecycleReceipt(receipt));
  const unique = new Map();
  for (const receipt of validated) {
    const existing = unique.get(receipt.receipt_id);
    if (existing && !sameReceiptPayload(existing, receipt)) fail("lifecycle_snapshot_receipt_conflict");
    if (!existing || receipt.observed_at < existing.observed_at) unique.set(receipt.receipt_id, receipt);
  }
  const stateCounts = Object.fromEntries(LIFECYCLE_STATES.map((state) => [state, 0]));
  const latestByIdentity = new Map();
  for (const receipt of unique.values()) {
    stateCounts[receipt.lifecycle_state] += 1;
    const key = identityKey(receipt.identity);
    const current = latestByIdentity.get(key);
    if (!current || compareLatest(receipt, current) > 0) latestByIdentity.set(key, receipt);
  }
  const snapshot = {
    schema_version: LIFECYCLE_SNAPSHOT_SCHEMA,
    generated_at,
    receipt_count: unique.size,
    latest_identity_count: latestByIdentity.size,
    states: stateCounts,
    result_pending_count: unique.size,
    raw_content_fields_stored: 0,
    raw_flag_fields_stored: 0,
  };
  if (includeIdentities) {
    snapshot.identities = [...latestByIdentity.values()]
      .map((receipt) => ({
        session_id: receipt.identity.session_id,
        turn_id: receipt.identity.turn_id,
        agent_id: receipt.identity.agent_id,
        agent_type: receipt.identity.agent_type,
        lifecycle_state: receipt.lifecycle_state,
        result_state: receipt.result_state,
        observed_at: receipt.observed_at,
        source_event: receipt.source_event,
      }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
  }
  return validateLifecycleSnapshot(snapshot);
}

export function validateLifecycleSnapshot(snapshot) {
  const allowed = snapshot?.identities === undefined ? SNAPSHOT_KEYS : [...SNAPSHOT_KEYS, "identities"];
  if (!hasExactKeys(snapshot, allowed)) fail("lifecycle_snapshot_shape_invalid");
  if (snapshot.schema_version !== LIFECYCLE_SNAPSHOT_SCHEMA) fail("lifecycle_snapshot_schema_invalid");
  requiredTimestamp(snapshot.generated_at, "lifecycle_snapshot_generated_at_invalid");
  for (const field of ["receipt_count", "latest_identity_count", "result_pending_count"]) {
    if (!Number.isSafeInteger(snapshot[field]) || snapshot[field] < 0) fail("lifecycle_snapshot_count_invalid");
  }
  if (!hasExactKeys(snapshot.states, LIFECYCLE_STATES)) fail("lifecycle_snapshot_states_invalid");
  for (const state of LIFECYCLE_STATES) {
    if (!Number.isSafeInteger(snapshot.states[state]) || snapshot.states[state] < 0) {
      fail("lifecycle_snapshot_state_count_invalid");
    }
  }
  if (snapshot.result_pending_count !== snapshot.receipt_count
    || zeroOrFail(snapshot.raw_content_fields_stored, "lifecycle_snapshot_raw_content_invalid") !== 0
    || zeroOrFail(snapshot.raw_flag_fields_stored, "lifecycle_snapshot_raw_flag_invalid") !== 0) {
    fail("lifecycle_snapshot_privacy_boundary_invalid");
  }
  if (snapshot.identities !== undefined) {
    if (!Array.isArray(snapshot.identities) || snapshot.identities.length !== snapshot.latest_identity_count) {
      fail("lifecycle_snapshot_identities_invalid");
    }
    const seen = new Set();
    for (const identity of snapshot.identities) {
      if (!hasExactKeys(identity, IDENTITY_PROJECTION_KEYS)) fail("lifecycle_snapshot_identity_shape_invalid");
      optionalSafeId(identity.session_id, "lifecycle_snapshot_session_id_invalid");
      optionalSafeId(identity.turn_id, "lifecycle_snapshot_turn_id_invalid");
      optionalSafeId(identity.agent_id, "lifecycle_snapshot_agent_id_invalid");
      optionalSafeCode(identity.agent_type, "lifecycle_snapshot_agent_type_invalid");
      if (!identity.session_id && !identity.agent_id) fail("lifecycle_snapshot_identity_missing");
      requireLifecycleState(identity.lifecycle_state, "lifecycle_snapshot_identity_state_invalid");
      if (identity.result_state !== "result_pending") fail("lifecycle_snapshot_identity_result_invalid");
      requiredTimestamp(identity.observed_at, "lifecycle_snapshot_identity_observed_at_invalid");
      if (!Object.hasOwn(LIFECYCLE_HOOK_EVENTS, identity.source_event)) fail("lifecycle_snapshot_identity_event_invalid");
      const key = identityKey(identity);
      if (seen.has(key)) fail("lifecycle_snapshot_identity_duplicate");
      seen.add(key);
    }
  }
  return snapshot;
}

export async function persistLifecycleReceipt(stateRoot, receipt) {
  const root = path.resolve(stateRoot);
  const accepted = validateLifecycleReceipt(receipt);
  const month = accepted.observed_at.slice(0, 7);
  const target = path.join(root, "lifecycle", "receipts", month, `${accepted.receipt_id}.json`);
  const before = await loadLifecycleReceipts(root);
  const existing = before.find((item) => item.receipt_id === accepted.receipt_id) ?? null;
  if (existing && !sameReceiptPayload(existing, accepted)) fail("lifecycle_receipt_conflict");
  const status = existing ? "replayed" : await writeReceiptExclusive(target, accepted);
  const all = existing ? before : await loadLifecycleReceipts(root);
  const current = createLifecycleSnapshot(all, { includeIdentities: true });
  await writeJsonAtomic(path.join(root, "lifecycle", "current.json"), current);
  return {
    status,
    receipt_id: accepted.receipt_id,
    receipt_count: all.length,
    latest_identity_count: current.latest_identity_count,
  };
}

export async function writeLifecycleSnapshot(outputPath, snapshot) {
  const accepted = validateLifecycleSnapshot(snapshot);
  await writeJsonAtomic(path.resolve(outputPath), accepted);
  return accepted;
}

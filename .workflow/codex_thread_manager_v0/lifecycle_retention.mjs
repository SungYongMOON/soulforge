import { access, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { dirname, isAbsolute, join, resolve, win32, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const execFile = promisify(execFileCallback);

export const LIFECYCLE_RETENTION_REPORT_SCHEMA = "soulforge.codex_thread_manager.lifecycle_retention_report.v1";
export const TASK_WORKTREE_BINDING_SCHEMA = "soulforge.codex_thread_manager.task_worktree_binding.v1";
export const LIFECYCLE_RETENTION_REPORT_DISABLED_ENV = "SOULFORGE_CODEX_LIFECYCLE_RETENTION_REPORT_DISABLED";
export const DEFAULT_LIFECYCLE_MAX_AGE_MS = 5 * 60 * 1_000;
export const DEFAULT_BINDING_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

const ENROLLMENT_SCHEMA = "soulforge.team_ops_board.thread_enrollment.v1";
const RESULT_GATE_SCHEMA = "soulforge.team_ops_board.thread_result_gate.v1";
const LIFECYCLE_SCHEMA = "soulforge.ai_usage_lifecycle_snapshot.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,319}$/u;
const CANDIDATE_NONCE_PATTERN = /^[0-9a-f]{32}$/u;
const WORKTREE_NONCE_PATTERN = /^[0-9a-f]{32}$/u;
const WORKTREE_ID_PATTERN = /^worktree-[0-9a-f]{12,64}$|^worktree-\d+$|^worktree-bare-\d+$/u;
const SAFE_REASON_PATTERN = /^[a-z0-9_]{1,100}$/u;
const SAFE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,191}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MAIN_REF_PATTERN = /^[a-zA-Z0-9_.\/-]{1,100}$/u;

const ENROLLMENT_LIFECYCLES = new Set(["pending", "accepted", "current", "history", "retired"]);
const RESULT_EVENT_TYPES = new Set(["started", "result_ready", "accepted", "closed"]);
const RESULT_TARGETS = new Set(["none", "parent", "owner"]);
const HEAD_STATES = new Set(["attached", "detached", "bare", "unknown"]);
const LIST_STATUS_ENUM = new Set(["available", "missing", "invalid", "stale", "disabled", "unavailable"]);

const LIFECYCLE_EVENT_STATE = Object.freeze({
  SessionStart: "started",
  SubagentStart: "started",
  UserPromptSubmit: "input_received",
  PermissionRequest: "waiting_on_approval",
  Stop: "observed_at_stop",
  SubagentStop: "observed_at_stop",
  SessionEnd: "ended"
});
const LIFECYCLE_STATES = new Set(Object.values(LIFECYCLE_EVENT_STATE));
const LIFECYCLE_RANK = Object.freeze({
  input_received: 0,
  started: 1,
  waiting_on_approval: 2,
  observed_at_stop: 3,
  ended: 4
});
const RAW_FLAG_KEYS = ["raw_preview", "raw_turns", "raw_messages", "raw_reasoning", "raw_tool_io", "raw_cwd"];
const ENROLLMENT_ROOT_KEYS = new Set(["schema_version", "registry_revision", "updated_at", "disabled", "entries"]);
const ENROLLMENT_ENTRY_KEYS = new Set([
  "thread_id", "organization_group_id", "route_id", "work_id", "thread_kind", "display_label",
  "relationship", "lifecycle", "parent_thread_id", "prior_thread_history_pointer", "metadata_only",
  "raw_preview", "raw_turns", "raw_messages", "raw_reasoning", "raw_tool_io", "raw_cwd",
  "enrolled_at", "updated_at"
]);
const RESULT_GATE_ROOT_KEYS = new Set(["schema_version", "registry_revision", "updated_at", "disabled", "events"]);
const RESULT_GATE_EVENT_KEYS = new Set([
  "event_id", "thread_id", "event_type", "target", "target_thread_id", "occurred_at",
  "metadata_only", "raw_preview", "raw_turns", "raw_messages", "raw_reasoning", "raw_tool_io", "raw_cwd"
]);
const LIFECYCLE_ROOT_KEYS = new Set([
  "schema_version", "generated_at", "receipt_count", "latest_identity_count", "states",
  "result_pending_count", "raw_content_fields_stored", "raw_flag_fields_stored", "identities"
]);
const LIFECYCLE_IDENTITY_KEYS = new Set([
  "session_id", "turn_id", "agent_id", "agent_type", "lifecycle_state", "result_state", "observed_at", "source_event"
]);
const BINDING_ROOT_KEYS = new Set(["schema_version", "registry_revision", "updated_at", "disabled", "worktree_nonce", "bindings"]);
const BINDING_ENTRY_KEYS = new Set(["task_id", "worktree_path", "candidate_nonce"]);

const GIT_OPERATION_MARKERS = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD", "rebase-merge", "rebase-apply"];
export const DESTRUCTIVE_OPTIONS = Object.freeze(new Set(["--apply", "--delete", "--archive", "--remove", "--prune", "--branch-delete"]));
export const FORBIDDEN_SUBCOMMANDS = Object.freeze(new Set(["approve", "apply", "verify", "delete", "archive", "remove", "prune"]));

function codePointCompare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function isSafeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isSafeTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function truthyEnvironmentValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function metadataOnlyBoundary(value) {
  return value?.metadata_only === true && RAW_FLAG_KEYS.every((key) => value[key] === false);
}

function safeNow(value) {
  const candidate = typeof value === "function" ? value() : value;
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

function safeAge(value, now) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? now - parsed : null;
}

function lifecycleStatusPriority(value) {
  return LIFECYCLE_RANK[value] ?? -1;
}

function emptyGateState() {
  return { stage: "none", target: "none", target_thread_id: null, occurred_at: null };
}

function sourceStatusFromRead(readResult, normalizeFn) {
  if (readResult.status !== "available") return { status: readResult.status, value: null };
  const norm = normalizeFn(readResult.value);
  if (!norm) return { status: "invalid", value: null };
  if (typeof norm.status === "string" && norm.value !== undefined) {
    return { status: norm.status, value: norm.value };
  }
  return { status: "available", value: norm };
}

function isAbsoluteSubpath(target) {
  if (typeof target !== "string" || target.includes("\0")) return false;
  const trimmed = target.trim();
  if (!trimmed) return false;

  if (/^[\/\\]{2}[^\/\\]+[\/\\]+[^\/\\]+[\/\\]+.+/u.test(trimmed)) {
    return true;
  }
  if (win32.isAbsolute(trimmed) && /^[a-zA-Z]:/u.test(trimmed)) {
    const rest = trimmed.slice(2).replace(/\\/gu, "/").replace(/\/+/gu, "/").replace(/\/$/gu, "");
    return rest.length > 1;
  }
  if (posix.isAbsolute(trimmed) && !trimmed.startsWith("//")) {
    const norm = trimmed.replace(/\/+/gu, "/").replace(/\/$/gu, "");
    return norm.length > 1;
  }
  return false;
}

function canonicalizePathKey(target) {
  if (typeof target !== "string") return "";
  const trimmed = target.trim();
  if (/^[\/\\]{2}/u.test(trimmed)) {
    const norm = trimmed.replace(/[\/\\]+/gu, "/").toLowerCase().replace(/\/$/gu, "");
    return `unc:${norm}`;
  }
  if (win32.isAbsolute(trimmed) && /^[a-zA-Z]:/u.test(trimmed)) {
    const drive = trimmed.slice(0, 2).toLowerCase();
    const rest = trimmed.slice(2).replace(/[\/\\]+/gu, "/").toLowerCase().replace(/\/$/gu, "");
    return `win:${drive}${rest}`;
  }
  const normPosix = trimmed.replace(/\/+/gu, "/").replace(/\/$/gu, "");
  return `posix:${normPosix}`;
}

export function deriveWorktreeId(path, worktreeNonce) {
  if (typeof worktreeNonce !== "string" || !WORKTREE_NONCE_PATTERN.test(worktreeNonce)) {
    return null;
  }
  const canonicalPath = canonicalizePathKey(path);
  const hash = createHash("sha256")
    .update(`soulforge:lifecycle_retention:worktree_nonce:${worktreeNonce}:${canonicalPath}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `worktree-${hash}`;
}

export function deriveCandidateId(nonce) {
  const hash = createHash("sha256")
    .update(`soulforge:lifecycle_retention:candidate_nonce:${nonce}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `cand-${hash}`;
}

export function isLifecycleRetentionReportDisabled(env = process.env) {
  return truthyEnvironmentValue(env?.[LIFECYCLE_RETENTION_REPORT_DISABLED_ENV]);
}

export function defaultRepoRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
}

export function defaultLifecycleRetentionReportPaths({ repoRoot = defaultRepoRoot() } = {}) {
  const root = resolve(repoRoot);
  return {
    repo_root: root,
    enrollment_path: join(root, "guild_hall", "state", "operations", "team_ops_board", "thread_visibility.v1.json"),
    lifecycle_path: join(root, "guild_hall", "state", "operations", "ai_usage_meter", "lifecycle", "current.json"),
    result_gate_path: join(root, "guild_hall", "state", "operations", "team_ops_board", "thread_result_gate.v1.json"),
    task_worktree_binding_path: join(root, "guild_hall", "state", "operations", "team_ops_board", "task_worktree_binding.v1.json")
  };
}

export function normalizeEnrollmentRegistry(value) {
  if (
    !hasExactKeys(value, ENROLLMENT_ROOT_KEYS)
    || value.schema_version !== ENROLLMENT_SCHEMA
    || !Number.isSafeInteger(value.registry_revision)
    || value.registry_revision < 0
    || typeof value.disabled !== "boolean"
    || !isSafeTimestamp(value.updated_at)
    || !Array.isArray(value.entries)
  ) return null;

  const ids = new Set();
  const entries = [];
  for (const entry of value.entries) {
    if (
      !hasExactKeys(entry, ENROLLMENT_ENTRY_KEYS)
      || !metadataOnlyBoundary(entry)
      || !isSafeId(entry.thread_id)
      || (entry.parent_thread_id !== null && !isSafeId(entry.parent_thread_id))
      || !ENROLLMENT_LIFECYCLES.has(entry.lifecycle)
      || !isSafeTimestamp(entry.enrolled_at)
      || !isSafeTimestamp(entry.updated_at)
      || ids.has(entry.thread_id)
    ) return null;
    ids.add(entry.thread_id);
    entries.push({
      thread_id: entry.thread_id,
      parent_thread_id: entry.parent_thread_id,
      lifecycle: entry.lifecycle
    });
  }
  for (const entry of entries) {
    if (entry.parent_thread_id !== null && !ids.has(entry.parent_thread_id)) return null;
  }
  return { disabled: value.disabled, entries };
}

export function normalizeResultGateRegistry(value) {
  if (
    !hasExactKeys(value, RESULT_GATE_ROOT_KEYS)
    || value.schema_version !== RESULT_GATE_SCHEMA
    || !Number.isSafeInteger(value.registry_revision)
    || value.registry_revision < 0
    || typeof value.disabled !== "boolean"
    || !isSafeTimestamp(value.updated_at)
    || !Array.isArray(value.events)
  ) return null;

  const eventIds = new Set();
  const events = [];
  for (const event of value.events) {
    if (
      !hasExactKeys(event, RESULT_GATE_EVENT_KEYS)
      || !metadataOnlyBoundary(event)
      || typeof event.event_id !== "string"
      || !SAFE_EVENT_ID.test(event.event_id)
      || eventIds.has(event.event_id)
      || !isSafeId(event.thread_id)
      || !RESULT_EVENT_TYPES.has(event.event_type)
      || !RESULT_TARGETS.has(event.target)
      || (event.target_thread_id !== null && !isSafeId(event.target_thread_id))
      || !isSafeTimestamp(event.occurred_at)
    ) return null;
    if (
      (event.event_type === "started" && (event.target !== "none" || event.target_thread_id !== null))
      || (event.event_type !== "started" && event.target === "none")
      || (event.target === "owner" && event.target_thread_id !== null)
      || (event.target === "parent" && event.target_thread_id === null)
    ) return null;
    eventIds.add(event.event_id);
    events.push({
      event_id: event.event_id,
      thread_id: event.thread_id,
      event_type: event.event_type,
      target: event.target,
      target_thread_id: event.target_thread_id,
      occurred_at: event.occurred_at
    });
  }
  return { disabled: value.disabled, events };
}

export function normalizeLifecycleSnapshot(value, { now = Date.now, maxAgeMs = DEFAULT_LIFECYCLE_MAX_AGE_MS } = {}) {
  if (
    !hasExactKeys(value, LIFECYCLE_ROOT_KEYS)
    || value.schema_version !== LIFECYCLE_SCHEMA
    || !isSafeTimestamp(value.generated_at)
    || !Number.isSafeInteger(value.receipt_count)
    || value.receipt_count < 0
    || !Number.isSafeInteger(value.latest_identity_count)
    || value.latest_identity_count < 0
    || !Number.isSafeInteger(value.result_pending_count)
    || value.result_pending_count !== value.receipt_count
    || !hasExactKeys(value.states, LIFECYCLE_STATES)
    || ![...LIFECYCLE_STATES].every((state) => Number.isSafeInteger(value.states[state]) && value.states[state] >= 0)
    || value.raw_content_fields_stored !== 0
    || value.raw_flag_fields_stored !== 0
    || !Array.isArray(value.identities)
    || value.identities.length !== value.latest_identity_count
  ) return null;

  const observedNow = safeNow(now);
  const safeMaxAge = Number.isSafeInteger(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : DEFAULT_LIFECYCLE_MAX_AGE_MS;
  const generatedAge = safeAge(value.generated_at, observedNow);
  if (generatedAge === null || generatedAge < -60_000) return null;

  const identities = [];
  for (const identity of value.identities) {
    if (
      !hasExactKeys(identity, LIFECYCLE_IDENTITY_KEYS)
      || (identity.session_id !== null && !isSafeId(identity.session_id))
      || (identity.turn_id !== null && !isSafeId(identity.turn_id))
      || (identity.agent_id !== null && !isSafeId(identity.agent_id))
      || (!identity.session_id && !identity.agent_id)
      || !Object.hasOwn(LIFECYCLE_EVENT_STATE, identity.source_event)
      || LIFECYCLE_EVENT_STATE[identity.source_event] !== identity.lifecycle_state
      || identity.result_state !== "result_pending"
      || !isSafeTimestamp(identity.observed_at)
    ) return null;
    identities.push({
      session_id: identity.session_id,
      agent_id: identity.agent_id,
      lifecycle_state: identity.lifecycle_state,
      observed_at: identity.observed_at,
      source_event: identity.source_event
    });
  }
  return {
    status: generatedAge > safeMaxAge ? "stale" : "available",
    identities
  };
}

export function normalizeBindingRegistry(value, { now = Date.now, maxAgeMs = DEFAULT_BINDING_MAX_AGE_MS } = {}) {
  if (
    !hasExactKeys(value, BINDING_ROOT_KEYS)
    || value.schema_version !== TASK_WORKTREE_BINDING_SCHEMA
    || !Number.isSafeInteger(value.registry_revision)
    || value.registry_revision < 0
    || typeof value.disabled !== "boolean"
    || !isSafeTimestamp(value.updated_at)
    || typeof value.worktree_nonce !== "string"
    || !WORKTREE_NONCE_PATTERN.test(value.worktree_nonce)
    || !Array.isArray(value.bindings)
  ) return null;

  if (value.disabled) {
    return { status: "disabled", value: null };
  }

  const observedNow = safeNow(now);
  const safeMaxAge = Number.isSafeInteger(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : DEFAULT_BINDING_MAX_AGE_MS;
  const updatedAge = safeAge(value.updated_at, observedNow);
  if (updatedAge === null || updatedAge < -60_000) return null;

  if (updatedAge > safeMaxAge) {
    return { status: "stale", value: null };
  }

  const taskIds = new Set();
  const worktreePathKeys = new Set();
  const candidateNonces = new Set();
  const candidateIds = new Set();
  const bindings = [];

  for (const entry of value.bindings) {
    if (
      !hasExactKeys(entry, BINDING_ENTRY_KEYS)
      || !isSafeId(entry.task_id)
      || typeof entry.worktree_path !== "string"
      || !isAbsoluteSubpath(entry.worktree_path)
      || typeof entry.candidate_nonce !== "string"
      || !CANDIDATE_NONCE_PATTERN.test(entry.candidate_nonce)
    ) return null;

    const candidateId = deriveCandidateId(entry.candidate_nonce);
    const normKey = canonicalizePathKey(entry.worktree_path);
    const worktreeId = deriveWorktreeId(entry.worktree_path, value.worktree_nonce);

    if (
      taskIds.has(entry.task_id)
      || worktreePathKeys.has(normKey)
      || candidateNonces.has(entry.candidate_nonce)
      || candidateIds.has(candidateId)
    ) return null;

    taskIds.add(entry.task_id);
    worktreePathKeys.add(normKey);
    candidateNonces.add(entry.candidate_nonce);
    candidateIds.add(candidateId);

    bindings.push({
      task_id: entry.task_id,
      worktree_path: entry.worktree_path,
      candidate_nonce: entry.candidate_nonce,
      candidate_id: candidateId,
      worktree_id: worktreeId
    });
  }

  return {
    status: "available",
    value: {
      disabled: value.disabled,
      worktree_nonce: value.worktree_nonce,
      bindings
    }
  };
}

export function deriveResultGateStates({ enrollmentRegistry, resultGateRegistry } = {}) {
  if (!enrollmentRegistry) return { status: "invalid", by_thread_id: new Map() };
  if (!resultGateRegistry) return { status: "missing", by_thread_id: new Map() };
  if (resultGateRegistry.disabled) return { status: "disabled", by_thread_id: new Map() };

  const entriesById = new Map(enrollmentRegistry.entries.map((entry) => [entry.thread_id, entry]));
  const byThreadId = new Map();
  for (const event of resultGateRegistry.events) {
    const entry = entriesById.get(event.thread_id);
    if (!entry) return { status: "invalid", by_thread_id: new Map() };
    if (
      (event.event_type === "started" && (event.target !== "none" || event.target_thread_id !== null))
      || (event.event_type !== "started" && event.target === "none")
      || (event.target === "owner" && event.target_thread_id !== null)
      || (event.target === "parent" && event.target_thread_id !== entry.parent_thread_id)
    ) return { status: "invalid", by_thread_id: new Map() };

    const prior = byThreadId.get(event.thread_id) ?? emptyGateState();
    if (prior.occurred_at !== null && Date.parse(event.occurred_at) < Date.parse(prior.occurred_at)) {
      return { status: "invalid", by_thread_id: new Map() };
    }
    if (event.event_type === "started") {
      if (prior.stage !== "none") return { status: "invalid", by_thread_id: new Map() };
      byThreadId.set(event.thread_id, { stage: "started", target: "none", target_thread_id: null, occurred_at: event.occurred_at });
      continue;
    }
    if (event.event_type === "result_ready") {
      if (prior.stage !== "started") return { status: "invalid", by_thread_id: new Map() };
      byThreadId.set(event.thread_id, {
        stage: "result_ready",
        target: event.target,
        target_thread_id: event.target_thread_id,
        occurred_at: event.occurred_at
      });
      continue;
    }
    if (event.event_type === "accepted") {
      if (prior.stage !== "result_ready" || prior.target !== event.target || prior.target_thread_id !== event.target_thread_id) {
        return { status: "invalid", by_thread_id: new Map() };
      }
      byThreadId.set(event.thread_id, { ...prior, stage: "accepted", occurred_at: event.occurred_at });
      continue;
    }
    if (prior.stage !== "accepted" || prior.target !== event.target || prior.target_thread_id !== event.target_thread_id) {
      return { status: "invalid", by_thread_id: new Map() };
    }
    byThreadId.set(event.thread_id, { ...prior, stage: "closed", occurred_at: event.occurred_at });
  }
  return { status: "available", by_thread_id: byThreadId };
}

export function selectExactLifecycleObservations({ lifecycleSnapshot, enrolledThreadIds, now = Date.now, maxAgeMs = DEFAULT_LIFECYCLE_MAX_AGE_MS } = {}) {
  if (lifecycleSnapshot?.status !== "available") return new Map();
  const observedNow = safeNow(now);
  const safeMaxAge = Number.isSafeInteger(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : DEFAULT_LIFECYCLE_MAX_AGE_MS;
  const selected = new Map();
  for (const identity of lifecycleSnapshot.identities) {
    const threadId = identity.agent_id
      ? (enrolledThreadIds.has(identity.agent_id) ? identity.agent_id : null)
      : (enrolledThreadIds.has(identity.session_id) ? identity.session_id : null);
    if (!threadId) continue;
    const ageMs = safeAge(identity.observed_at, observedNow);
    const fresh = ageMs !== null && ageMs >= -60_000 && ageMs <= safeMaxAge;
    const candidate = {
      lifecycle_state: identity.lifecycle_state,
      source_event: identity.source_event,
      observed_at: identity.observed_at,
      fresh,
      age_ms: ageMs
    };
    const prior = selected.get(threadId);
    if (
      !prior
      || (candidate.age_ms ?? Number.POSITIVE_INFINITY) < (prior.age_ms ?? Number.POSITIVE_INFINITY)
      || (
        candidate.age_ms === prior.age_ms
        && lifecycleStatusPriority(candidate.lifecycle_state) > lifecycleStatusPriority(prior.lifecycle_state)
      )
    ) selected.set(threadId, candidate);
  }
  return selected;
}

function typedReceiptMatches(receipt, type, threadId) {
  return receipt
    && receipt.type === type
    && receipt.thread_id === threadId
    && receipt.authority === "authoritative";
}

function typedDuplicateDecisionMatches(decision, threadId) {
  return decision
    && decision.type === "duplicate_decision"
    && decision.thread_id === threadId
    && decision.authority === "authoritative"
    && ["confirmed_duplicate", "candidate_hold", "not_duplicate"].includes(decision.decision)
    ? decision.decision
    : null;
}

function compareLifecycleAndResultGate(lifecycleObservation, resultGate) {
  if (
    lifecycleObservation?.fresh !== true
    || !["result_ready", "accepted", "closed"].includes(resultGate?.stage)
  ) return null;
  const lifecycleAt = Date.parse(lifecycleObservation.observed_at);
  const gateAt = Date.parse(resultGate.occurred_at);
  if (!Number.isFinite(lifecycleAt) || !Number.isFinite(gateAt)) return "conflict";
  if (lifecycleAt > gateAt) return "lifecycle";
  if (gateAt > lifecycleAt) return "result_gate";
  return "conflict";
}

function classifyResultGate(resultGate) {
  if (resultGate?.stage === "result_ready") {
    return { classification: "result_waiting", reason_code: "exact_result_gate" };
  }
  if (resultGate?.stage === "accepted" || resultGate?.stage === "closed") {
    return { classification: "unknown", reason_code: "result_gate_not_completion_authority" };
  }
  return null;
}

export function classifyLifecycleRetentionThread(entry, {
  lifecycleObservation = null,
  resultGate = null,
  completionReceipt = null,
  interruptionReceipt = null,
  duplicateDecision = null
} = {}) {
  const completion = typedReceiptMatches(completionReceipt, "authoritative_completion_receipt", entry.thread_id);
  const interruption = typedReceiptMatches(interruptionReceipt, "explicit_interruption_receipt", entry.thread_id);
  const duplicate = typedDuplicateDecisionMatches(duplicateDecision, entry.thread_id);
  const positiveRuntime = lifecycleObservation?.fresh === true
    && ["started", "waiting_on_approval"].includes(lifecycleObservation.lifecycle_state);
  const lifecycleGateOrder = compareLifecycleAndResultGate(lifecycleObservation, resultGate);

  if (completion && (positiveRuntime || interruption)) {
    return { classification: "unknown", reason_code: "authoritative_receipt_conflict" };
  }
  if (interruption && (positiveRuntime || completion)) {
    return { classification: "unknown", reason_code: "authoritative_receipt_conflict" };
  }
  if (completion) return { classification: "completed", reason_code: "authoritative_completion_receipt" };
  if (interruption) return { classification: "interrupted", reason_code: "explicit_interruption_receipt" };
  if (duplicate === "confirmed_duplicate") return { classification: "duplicate", reason_code: "authoritative_duplicate_decision" };
  if (duplicate === "candidate_hold") return { classification: "duplicate_candidate_hold", reason_code: "duplicate_decision_pending" };
  if (lifecycleGateOrder === "conflict") {
    return { classification: "unknown", reason_code: "lifecycle_result_gate_timestamp_conflict" };
  }
  if (lifecycleGateOrder === "result_gate") return classifyResultGate(resultGate);
  if (lifecycleObservation?.fresh === true && lifecycleObservation.lifecycle_state === "waiting_on_approval") {
    return { classification: "input_waiting", reason_code: "exact_permission_request" };
  }
  if (lifecycleObservation?.fresh === true && lifecycleObservation.lifecycle_state === "started") {
    return { classification: "active", reason_code: "fresh_exact_lifecycle_start" };
  }
  if (lifecycleObservation?.fresh === true && lifecycleObservation.lifecycle_state === "observed_at_stop") {
    return { classification: "result_waiting", reason_code: "exact_stop_pending_result_authority" };
  }
  const gateClassification = classifyResultGate(resultGate);
  if (gateClassification) return gateClassification;
  if (lifecycleObservation?.lifecycle_state === "input_received") {
    return { classification: "unknown", reason_code: "input_received_is_not_waiting" };
  }
  if (lifecycleObservation?.fresh === false) {
    return { classification: "unknown", reason_code: "lifecycle_observation_stale" };
  }
  return { classification: "unknown", reason_code: "no_authoritative_lifecycle_or_result_state" };
}

export function parseGitWorktreePorcelain(text) {
  const records = [];
  for (const block of String(text ?? "").split(/\r?\n\r?\n/u)) {
    const lines = block.split(/\r?\n/u).filter(Boolean);
    if (!lines.length) continue;
    let directory = null;
    let headPresent = false;
    let attached = false;
    let detached = false;
    let bare = false;
    let locked = false;
    let prunable = false;
    for (const line of lines) {
      if (line.startsWith("worktree ")) directory = line.slice("worktree ".length);
      else if (line.startsWith("HEAD ")) headPresent = true;
      else if (line.startsWith("branch ")) attached = true;
      else if (line === "detached") detached = true;
      else if (line === "bare") bare = true;
      else if (line.startsWith("locked")) locked = true;
      else if (line.startsWith("prunable")) prunable = true;
    }
    if (!directory && !bare) continue;
    records.push({ directory, head_present: headPresent, attached, detached, bare, locked, prunable });
  }
  return records;
}

async function executeGit(cwd, args, { exec = execFile } = {}) {
  try {
    const result = await exec("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1_048_576,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }
    });
    return { code: 0, stdout: String(result.stdout ?? "") };
  } catch (error) {
    return { code: Number.isInteger(error?.code) ? error.code : 2, stdout: String(error?.stdout ?? "") };
  }
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function gitPathExists(cwd, relativePath, runGit, exists) {
  const resolved = await runGit(cwd, ["rev-parse", "--git-path", relativePath]);
  if (resolved.code !== 0) return null;
  const target = resolved.stdout.trim();
  return target ? exists(isAbsolute(target) ? target : resolve(cwd, target)) : null;
}

function binaryGitDirty(result) {
  if (result.code === 0) return false;
  if (result.code === 1) return true;
  return null;
}

async function inspectOneWorktree(record, index, { mainRef, mainRefAvailable, worktreeNonce = null, runGit, exists }) {
  let worktreeId;
  if (typeof worktreeNonce === "string" && WORKTREE_NONCE_PATTERN.test(worktreeNonce)) {
    worktreeId = record.directory ? deriveWorktreeId(record.directory, worktreeNonce) : `worktree-bare-${index + 1}`;
  } else {
    worktreeId = `worktree-${index + 1}`;
  }
  if (!worktreeId) {
    worktreeId = `worktree-${index + 1}`;
  }

  const base = {
    worktree_id: worktreeId,
    head_state: record.bare ? "bare" : (record.detached ? "detached" : (record.attached ? "attached" : "unknown")),
    locked: record.locked,
    prunable: record.prunable,
    tracked_dirty: null,
    untracked: null,
    index_lock_present: null,
    operation_marker_count: null,
    unique_commit_count_vs_main: null,
    cleanup_state: "HOLD",
    hold_reasons: []
  };
  if (record.bare || !record.directory) {
    base.hold_reasons = ["worktree_location_unavailable", "pr_authority_unknown", "process_authority_unknown", "result_authority_unknown"];
    return base;
  }

  const [unstaged, staged, untracked, indexLock, operationMarkers, uniqueCommits] = await Promise.all([
    runGit(record.directory, ["diff", "--quiet"]),
    runGit(record.directory, ["diff", "--cached", "--quiet"]),
    runGit(record.directory, ["ls-files", "--others", "--exclude-standard", "-z"]),
    gitPathExists(record.directory, "index.lock", runGit, exists),
    Promise.all(GIT_OPERATION_MARKERS.map((marker) => gitPathExists(record.directory, marker, runGit, exists))),
    mainRefAvailable
      ? runGit(record.directory, ["rev-list", "--count", `${mainRef}..HEAD`])
      : Promise.resolve({ code: 2, stdout: "" })
  ]);

  const unstagedDirty = binaryGitDirty(unstaged);
  const stagedDirty = binaryGitDirty(staged);
  base.tracked_dirty = unstagedDirty === null || stagedDirty === null ? null : Boolean(unstagedDirty || stagedDirty);
  base.untracked = untracked.code === 0 ? untracked.stdout.length > 0 : null;
  base.index_lock_present = indexLock;
  base.operation_marker_count = operationMarkers.every((value) => value !== null)
    ? operationMarkers.filter(Boolean).length
    : null;
  const parsedUniqueCount = Number.parseInt(uniqueCommits.stdout.trim(), 10);
  base.unique_commit_count_vs_main = uniqueCommits.code === 0 && Number.isSafeInteger(parsedUniqueCount) && parsedUniqueCount >= 0
    ? parsedUniqueCount
    : null;

  const holdReasons = ["pr_authority_unknown", "process_authority_unknown", "result_authority_unknown"];
  if (!mainRefAvailable || base.unique_commit_count_vs_main === null) holdReasons.push("main_ancestry_unknown");
  if (base.unique_commit_count_vs_main !== null && base.unique_commit_count_vs_main > 0) holdReasons.push("unique_commits_present");
  if (base.tracked_dirty === true) holdReasons.push("tracked_changes_present");
  if (base.tracked_dirty === null) holdReasons.push("tracked_change_state_unknown");
  if (base.untracked === true) holdReasons.push("untracked_files_present");
  if (base.untracked === null) holdReasons.push("untracked_state_unknown");
  if (base.index_lock_present === true) holdReasons.push("index_lock_present");
  if (base.index_lock_present === null) holdReasons.push("index_lock_state_unknown");
  if ((base.operation_marker_count ?? 0) > 0) holdReasons.push("git_operation_marker_present");
  if (base.operation_marker_count === null) holdReasons.push("git_operation_state_unknown");
  if (record.locked) holdReasons.push("worktree_locked");
  if (record.prunable) holdReasons.push("worktree_prunable_requires_owner_decision");
  base.hold_reasons = holdReasons.sort(codePointCompare);

  return base;
}

export function summarizeWorktreePreflight(entries, { comparisonRefStatus = "unavailable", listStatus = "available" } = {}) {
  const rows = Array.isArray(entries) ? entries : [];
  const publicEntries = rows
    .map((entry) => ({ ...entry }))
    .sort((a, b) => codePointCompare(a.worktree_id, b.worktree_id));

  return {
    report_only: true,
    status: "HOLD",
    list_status: listStatus,
    comparison_ref_status: comparisonRefStatus,
    total_worktrees: publicEntries.length,
    dirty_worktrees: publicEntries.filter((entry) => entry.tracked_dirty === true || entry.untracked === true).length,
    untracked_worktrees: publicEntries.filter((entry) => entry.untracked === true).length,
    locked_worktrees: publicEntries.filter((entry) => entry.locked === true).length,
    prunable_worktrees: publicEntries.filter((entry) => entry.prunable === true).length,
    index_lock_worktrees: publicEntries.filter((entry) => entry.index_lock_present === true).length,
    operation_marker_worktrees: publicEntries.filter((entry) => (entry.operation_marker_count ?? 0) > 0).length,
    unique_commit_worktrees: publicEntries.filter((entry) => Number.isSafeInteger(entry.unique_commit_count_vs_main) && entry.unique_commit_count_vs_main > 0).length,
    sanitization_dropped_entries: 0,
    sanitized_field_count: 0,
    authority_gaps: {
      pull_request: "HOLD",
      active_process: "HOLD",
      result_handoff: "HOLD"
    },
    entries: publicEntries
  };
}

export function unavailableWorktreePreflight() {
  return summarizeWorktreePreflight([], { comparisonRefStatus: "unavailable", listStatus: "missing" });
}

export async function inspectWorktreePreflight({
  repoRoot = defaultRepoRoot(),
  mainRef = "main",
  worktreeNonce = null,
  runGit = executeGit,
  exists = pathExists
} = {}) {
  if (typeof mainRef !== "string" || !MAIN_REF_PATTERN.test(mainRef) || mainRef.startsWith("-") || mainRef.includes("..")) {
    throw new Error("invalid_main_ref");
  }
  const root = resolve(repoRoot);
  const listed = await runGit(root, ["worktree", "list", "--porcelain"]);
  if (listed.code !== 0) {
    return summarizeWorktreePreflight([], { comparisonRefStatus: "unavailable", listStatus: "unavailable" });
  }
  const mainReference = await runGit(root, ["rev-parse", "--verify", "--quiet", mainRef]);
  const records = parseGitWorktreePorcelain(listed.stdout);
  const rawEntries = await Promise.all(records.map((record, index) => inspectOneWorktree(record, index, {
    mainRef,
    mainRefAvailable: mainReference.code === 0,
    worktreeNonce,
    runGit,
    exists
  })));
  return summarizeWorktreePreflight(rawEntries, {
    comparisonRefStatus: mainReference.code === 0 ? "available" : "unavailable",
    listStatus: "available"
  });
}

export async function readJsonSource(target, { read = readFile } = {}) {
  try {
    return { status: "available", value: JSON.parse(await read(target, "utf8")) };
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "missing" : "invalid", value: null };
  }
}

function countByClassification(threads) {
  const counts = {
    active: 0,
    input_waiting: 0,
    result_waiting: 0,
    completed: 0,
    interrupted: 0,
    duplicate: 0,
    duplicate_candidate_hold: 0,
    unknown: 0
  };
  for (const thread of threads) counts[thread.classification] += 1;
  return counts;
}

export function canonicalizeJson(obj, isRoot = true) {
  if (obj === undefined) return undefined;
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => (item === undefined ? "null" : canonicalizeJson(item, false))).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort(codePointCompare);
  const parts = [];
  for (const key of sortedKeys) {
    if (isRoot && (key === "generated_at" || key === "digest" || key === "digest_matched" || key === "digest_mismatch")) {
      continue;
    }
    const val = obj[key];
    if (val !== undefined) {
      parts.push(JSON.stringify(key) + ":" + canonicalizeJson(val, false));
    }
  }
  return "{" + parts.join(",") + "}";
}

export function computeReportDigest(report) {
  const canonical = canonicalizeJson(report, true);
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function sanitizeWorktreePreflight(preflight) {
  if (!preflight || typeof preflight !== "object") return unavailableWorktreePreflight();

  const rawEntries = Array.isArray(preflight.entries) ? preflight.entries : [];
  const allowedEntries = [];
  let sanitizationDroppedEntries = 0;
  let sanitizedFieldCount = 0;

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== "object") {
      sanitizationDroppedEntries += 1;
      continue;
    }
    const worktreeId = String(entry.worktree_id ?? "");
    if (!WORKTREE_ID_PATTERN.test(worktreeId)) {
      sanitizationDroppedEntries += 1;
      continue;
    }

    let headState = "unknown";
    if (HEAD_STATES.has(String(entry.head_state))) {
      headState = String(entry.head_state);
    } else {
      sanitizedFieldCount += 1;
    }

    const cleanupState = "HOLD";

    const holdReasons = [];
    if (Array.isArray(entry.hold_reasons)) {
      for (const reason of entry.hold_reasons) {
        const rStr = String(reason);
        if (SAFE_REASON_PATTERN.test(rStr) && !rStr.includes("/") && !rStr.includes("\\") && !rStr.includes(":")) {
          if (!holdReasons.includes(rStr)) holdReasons.push(rStr);
        } else {
          sanitizedFieldCount += 1;
        }
      }
    }
    holdReasons.sort(codePointCompare);

    allowedEntries.push({
      worktree_id: worktreeId,
      head_state: headState,
      locked: typeof entry.locked === "boolean" ? entry.locked : null,
      prunable: typeof entry.prunable === "boolean" ? entry.prunable : null,
      tracked_dirty: typeof entry.tracked_dirty === "boolean" ? entry.tracked_dirty : null,
      untracked: typeof entry.untracked === "boolean" ? entry.untracked : null,
      index_lock_present: typeof entry.index_lock_present === "boolean" ? entry.index_lock_present : null,
      operation_marker_count: Number.isSafeInteger(entry.operation_marker_count) && entry.operation_marker_count >= 0 ? entry.operation_marker_count : null,
      unique_commit_count_vs_main: Number.isSafeInteger(entry.unique_commit_count_vs_main) && entry.unique_commit_count_vs_main >= 0 ? entry.unique_commit_count_vs_main : null,
      cleanup_state: cleanupState,
      hold_reasons: holdReasons
    });
  }

  allowedEntries.sort((a, b) => codePointCompare(a.worktree_id, b.worktree_id));

  const listStatus = LIST_STATUS_ENUM.has(String(preflight.list_status)) ? String(preflight.list_status) : "unavailable";
  const compStatus = LIST_STATUS_ENUM.has(String(preflight.comparison_ref_status)) ? String(preflight.comparison_ref_status) : "unavailable";

  return {
    report_only: true,
    status: "HOLD",
    list_status: listStatus,
    comparison_ref_status: compStatus,
    total_worktrees: allowedEntries.length,
    dirty_worktrees: allowedEntries.filter((e) => e.tracked_dirty === true || e.untracked === true).length,
    untracked_worktrees: allowedEntries.filter((e) => e.untracked === true).length,
    locked_worktrees: allowedEntries.filter((e) => e.locked === true).length,
    prunable_worktrees: allowedEntries.filter((e) => e.prunable === true).length,
    index_lock_worktrees: allowedEntries.filter((e) => e.index_lock_present === true).length,
    operation_marker_worktrees: allowedEntries.filter((e) => (e.operation_marker_count ?? 0) > 0).length,
    unique_commit_worktrees: allowedEntries.filter((e) => Number.isSafeInteger(e.unique_commit_count_vs_main) && e.unique_commit_count_vs_main > 0).length,
    sanitization_dropped_entries: sanitizationDroppedEntries,
    sanitized_field_count: sanitizedFieldCount,
    authority_gaps: {
      pull_request: "HOLD",
      active_process: "HOLD",
      result_handoff: "HOLD"
    },
    entries: allowedEntries
  };
}

export function buildLifecycleRetentionReport({
  enrollment = { status: "missing", value: null },
  lifecycle = { status: "missing", value: null },
  resultGate = { status: "missing", value: null },
  taskWorktreeBinding = { status: "missing", value: null },
  worktreePreflight = null,
  now = Date.now,
  maxAgeMs = DEFAULT_LIFECYCLE_MAX_AGE_MS,
  bindingMaxAgeMs = DEFAULT_BINDING_MAX_AGE_MS,
  completionReceipts = new Map(),
  interruptionReceipts = new Map(),
  duplicateDecisions = new Map(),
  expectedDigest = null,
  includeLegacyThreads = false
} = {}) {
  if (expectedDigest !== null && expectedDigest !== undefined) {
    if (typeof expectedDigest !== "string" || !DIGEST_PATTERN.test(expectedDigest)) {
      throw new Error("invalid_expected_digest_format");
    }
  }

  const normalizedEnrollment = sourceStatusFromRead(enrollment, normalizeEnrollmentRegistry);
  const normalizedLifecycle = sourceStatusFromRead(
    lifecycle,
    (val) => normalizeLifecycleSnapshot(val, { now, maxAgeMs })
  );
  const normalizedResultGate = sourceStatusFromRead(resultGate, normalizeResultGateRegistry);
  const normalizedBinding = sourceStatusFromRead(
    taskWorktreeBinding,
    (val) => normalizeBindingRegistry(val, { now, maxAgeMs: bindingMaxAgeMs })
  );

  const enrollmentRegistry = normalizedEnrollment.value;
  const lifecycleSnapshot = normalizedLifecycle.value;
  const resultRegistry = normalizedResultGate.value;
  const bindingRegistry = normalizedBinding.value;

  const enrollmentHealth = enrollmentRegistry?.disabled ? "disabled" : normalizedEnrollment.status;
  const lifecycleHealth = lifecycleSnapshot?.status ?? normalizedLifecycle.status;
  const resultGateHealth = resultRegistry?.disabled ? "disabled" : normalizedResultGate.status;
  const bindingHealth = normalizedBinding.status;

  const gateStates = enrollmentRegistry && resultRegistry && !resultRegistry.disabled
    ? deriveResultGateStates({ enrollmentRegistry, resultGateRegistry: resultRegistry })
    : { status: resultGateHealth, by_thread_id: new Map() };

  const activeEnrollment = enrollmentHealth === "available"
    ? enrollmentRegistry.entries.filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted")
    : [];
  const activeTaskIds = new Set(activeEnrollment.map((entry) => entry.thread_id));
  const observations = lifecycleHealth === "available"
    ? selectExactLifecycleObservations({ lifecycleSnapshot, enrolledThreadIds: activeTaskIds, now, maxAgeMs })
    : new Map();

  const bindingMapByTaskId = (bindingHealth === "available" && bindingRegistry)
    ? new Map(bindingRegistry.bindings.map((b) => [b.task_id, b]))
    : new Map();

  const preflightObj = sanitizeWorktreePreflight(worktreePreflight ?? unavailableWorktreePreflight());
  const preflightEntriesById = new Map(preflightObj.entries.map((entry) => [entry.worktree_id, entry]));

  const legacyThreads = [];
  const candidates = [];
  let boundCount = 0;
  let unboundCount = 0;

  activeEnrollment
    .sort((a, b) => codePointCompare(a.thread_id, b.thread_id))
    .forEach((entry) => {
      const classified = classifyLifecycleRetentionThread(entry, {
        lifecycleObservation: observations.get(entry.thread_id) ?? null,
        resultGate: gateStates.status === "available" ? gateStates.by_thread_id.get(entry.thread_id) ?? null : null,
        completionReceipt: completionReceipts.get(entry.thread_id) ?? null,
        interruptionReceipt: interruptionReceipts.get(entry.thread_id) ?? null,
        duplicateDecision: duplicateDecisions.get(entry.thread_id) ?? null
      });

      legacyThreads.push({
        thread_id: entry.thread_id,
        enrollment_lifecycle: entry.lifecycle,
        classification: classified.classification,
        reason_code: classified.reason_code
      });

      if (bindingHealth !== "available") {
        unboundCount += 1;
        return;
      }

      const binding = bindingMapByTaskId.get(entry.thread_id);

      if (!binding) {
        unboundCount += 1;
        return;
      }

      boundCount += 1;

      const holdReasons = [];
      const metaCounts = {
        tracked_dirty: null,
        untracked: null,
        index_lock: null,
        operation_markers: null,
        unique_commits_vs_main: null,
        locked: null,
        prunable: null
      };

      const wtMatch = preflightEntriesById.get(binding.worktree_id);
      if (wtMatch) {
        metaCounts.tracked_dirty = wtMatch.tracked_dirty;
        metaCounts.untracked = wtMatch.untracked;
        metaCounts.index_lock = wtMatch.index_lock_present;
        metaCounts.operation_markers = wtMatch.operation_marker_count;
        metaCounts.unique_commits_vs_main = wtMatch.unique_commit_count_vs_main;
        metaCounts.locked = wtMatch.locked;
        metaCounts.prunable = wtMatch.prunable;

        if (wtMatch.hold_reasons && Array.isArray(wtMatch.hold_reasons)) {
          for (const r of wtMatch.hold_reasons) {
            if (!holdReasons.includes(r)) holdReasons.push(r);
          }
        }
      } else {
        holdReasons.push("worktree_not_found_in_preflight");
      }

      if (classified.classification === "unknown") {
        const lifecycleReason = classified.reason_code || "no_authoritative_lifecycle_or_result_state";
        if (!holdReasons.includes(lifecycleReason)) holdReasons.push(lifecycleReason);
      }

      if (!holdReasons.includes("result_handoff_authority_unknown")) {
        holdReasons.push("result_handoff_authority_unknown");
      }

      candidates.push({
        candidate_id: binding.candidate_id,
        retention_action: "HOLD",
        classification: classified.classification,
        enrollment_lifecycle: entry.lifecycle,
        reason_codes: [classified.reason_code],
        hold_reasons: holdReasons.sort(codePointCompare),
        metadata_counts: metaCounts
      });
    });

  candidates.sort((a, b) => codePointCompare(a.candidate_id, b.candidate_id));

  if (includeLegacyThreads) {
    legacyThreads.sort((a, b) => a.thread_id.localeCompare(b.thread_id, "en"));
  }

  let bindingCoverage = "none";
  let orphanBindingCount = null;

  if (enrollmentHealth !== "available") {
    bindingCoverage = "unavailable";
    orphanBindingCount = null;
  } else if (activeEnrollment.length === 0) {
    bindingCoverage = "no_active_tasks";
    if (bindingHealth === "available" && bindingRegistry) {
      orphanBindingCount = bindingRegistry.bindings.length;
    } else {
      orphanBindingCount = null;
    }
  } else if (bindingHealth !== "available") {
    bindingCoverage = "unavailable";
    orphanBindingCount = null;
  } else {
    let orphans = 0;
    if (bindingRegistry) {
      for (const b of bindingRegistry.bindings) {
        if (!activeTaskIds.has(b.task_id)) orphans += 1;
      }
    }
    orphanBindingCount = orphans;

    if (boundCount === 0) {
      bindingCoverage = "none";
    } else if (unboundCount > 0) {
      bindingCoverage = "incomplete";
    } else {
      bindingCoverage = "complete";
    }
  }

  const report = {
    schema_version: LIFECYCLE_RETENTION_REPORT_SCHEMA,
    report_only: true,
    generated_at: new Date(safeNow(now)).toISOString(),
    scope_metadata: {
      classifications_scope: "all_current_or_accepted_enrolled_tasks",
      candidates_scope: "exact_bound_active_enrolled_tasks_only"
    },
    lifecycle_retention_action: "HOLD",
    source_health: {
      enrollment: enrollmentHealth,
      lifecycle: lifecycleHealth,
      result_gate: gateStates.status,
      task_worktree_binding: bindingHealth
    },
    thread_scope: {
      current_or_accepted_count: activeEnrollment.length,
      history_or_retired_excluded_count: enrollmentHealth === "available"
        ? enrollmentRegistry.entries.length - activeEnrollment.length
        : 0,
      bound_task_count: boundCount,
      unbound_task_count: unboundCount,
      orphan_binding_count: orphanBindingCount,
      binding_coverage: bindingCoverage
    },
    classifications: countByClassification(legacyThreads),
    candidates,
    ...(includeLegacyThreads ? { threads: legacyThreads } : {}),
    authority_gaps: {
      completion_receipt: "HOLD",
      interruption_receipt: "HOLD",
      duplicate_decision: "HOLD",
      codex_archive_delete: "OWNER_AUTHORIZATION_REQUIRED",
      pull_request: "HOLD",
      active_process: "HOLD",
      result_handoff: "HOLD"
    },
    worktree_preflight: preflightObj,
    privacy: {
      metadata_only: true,
      raw_content_fields_stored: 0,
      raw_flag_fields_stored: 0,
      sensitive_content_included: false,
      paths_omitted: true
    }
  };

  const computedDigest = computeReportDigest(report);
  report.digest = computedDigest;

  if (expectedDigest !== null && expectedDigest !== undefined) {
    const matched = (expectedDigest === computedDigest);
    report.digest_matched = matched;
    if (!matched) {
      report.digest_mismatch = true;
    }
  }

  return report;
}

export async function runLifecycleRetentionReport({
  repoRoot = defaultRepoRoot(),
  enrollmentPath = null,
  lifecyclePath = null,
  resultGatePath = null,
  taskWorktreeBindingPath = null,
  mainRef = "main",
  now = Date.now,
  maxAgeMs = DEFAULT_LIFECYCLE_MAX_AGE_MS,
  bindingMaxAgeMs = DEFAULT_BINDING_MAX_AGE_MS,
  expectedDigest = null,
  legacyMode = false,
  readJson = readJsonSource,
  inspectWorktrees = inspectWorktreePreflight
} = {}) {
  const defaults = defaultLifecycleRetentionReportPaths({ repoRoot: repoRoot ?? defaultRepoRoot() });
  const [enrollment, lifecycle, resultGate, taskWorktreeBinding] = await Promise.all([
    readJson(enrollmentPath ?? defaults.enrollment_path),
    readJson(lifecyclePath ?? defaults.lifecycle_path),
    readJson(resultGatePath ?? defaults.result_gate_path),
    readJson(taskWorktreeBindingPath ?? defaults.task_worktree_binding_path)
  ]);

  const normBindingResult = sourceStatusFromRead(
    taskWorktreeBinding,
    (val) => normalizeBindingRegistry(val, { now, maxAgeMs: bindingMaxAgeMs })
  );

  const worktreeNonce = normBindingResult.status === "available" ? normBindingResult.value.worktree_nonce : null;
  const worktreePreflight = await inspectWorktrees({ repoRoot: defaults.repo_root, mainRef, worktreeNonce });

  return buildLifecycleRetentionReport({
    enrollment,
    lifecycle,
    resultGate,
    taskWorktreeBinding,
    worktreePreflight,
    now,
    maxAgeMs,
    bindingMaxAgeMs,
    expectedDigest,
    includeLegacyThreads: legacyMode
  });
}

function forbiddenOption(argument) {
  return [...DESTRUCTIVE_OPTIONS].some((option) => argument === option || argument.startsWith(`${option}=`));
}

export function parseLifecycleRetentionReportArgs(argv = []) {
  const parsed = {
    repoRoot: null,
    enrollmentPath: null,
    lifecyclePath: null,
    resultGatePath: null,
    taskWorktreeBindingPath: null,
    expectedDigest: null,
    mainRef: "main",
    help: false,
    json: false,
    hasReportCommand: false
  };

  const needsValue = new Map([
    ["--repo", "repoRoot"],
    ["--enrollment", "enrollmentPath"],
    ["--lifecycle", "lifecyclePath"],
    ["--result-gate", "resultGatePath"],
    ["--binding", "taskWorktreeBindingPath"],
    ["--task-worktree-binding", "taskWorktreeBindingPath"],
    ["--expected-digest", "expectedDigest"],
    ["--prior-digest", "expectedDigest"],
    ["--main-ref", "mainRef"]
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (forbiddenOption(argument)) throw new Error("report_only_destructive_option_forbidden");
    if (FORBIDDEN_SUBCOMMANDS.has(argument.toLowerCase())) {
      throw new Error("report_only_destructive_option_forbidden");
    }
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "report") {
      parsed.hasReportCommand = true;
      continue;
    }
    const key = needsValue.get(argument);
    if (!key) {
      throw new Error("invalid_lifecycle_retention_report_arguments");
    }
    if (index + 1 >= argv.length || String(argv[index + 1]).startsWith("-")) {
      throw new Error("invalid_lifecycle_retention_report_arguments");
    }
    const val = argv[index + 1];
    if (key === "expectedDigest") {
      if (typeof val !== "string" || !DIGEST_PATTERN.test(val)) {
        throw new Error("invalid_expected_digest_format");
      }
    }
    if (key === "mainRef") {
      if (typeof val !== "string" || !MAIN_REF_PATTERN.test(val) || val.startsWith("-") || val.includes("..")) {
        throw new Error("invalid_main_ref");
      }
    }
    parsed[key] = val;
    index += 1;
  }
  return parsed;
}

export function lifecycleRetentionReportUsage({ wrapper = "legacy" } = {}) {
  const cmd = wrapper === "explicit"
    ? "node .workflow/codex_thread_manager_v0/lifecycle_retention_cli.mjs report --json [options]"
    : "node .workflow/codex_thread_manager_v0/lifecycle_retention_report.mjs [options]";
  return [
    `Usage: ${cmd}`,
    "  --repo <path>                  repository root (read-only)",
    "  --binding <path>               ignored-local task-worktree binding registry (read-only)",
    "  --enrollment <path>            Board enrollment registry (read-only)",
    "  --lifecycle <path>             lifecycle snapshot (read-only)",
    "  --result-gate <path>           Board result-gate registry (read-only)",
    "  --main-ref <ref>               comparison ref, default: main",
    "  --expected-digest, --prior-digest <sha256> prior/expected report digest for validation (returns exit code 3 on mismatch)",
    "  --json                         output report as JSON",
    "  --help                         show this help",
    "This module and CLI are Phase 1 report-only. --apply, --delete, --archive, --remove, --prune, approve, and verify operations are strictly rejected."
  ].join("\n");
}

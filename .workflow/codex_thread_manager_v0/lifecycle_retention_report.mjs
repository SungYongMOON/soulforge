import { access, readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const LIFECYCLE_RETENTION_REPORT_SCHEMA = "soulforge.codex_thread_manager.lifecycle_retention_report.v1";
export const LIFECYCLE_RETENTION_REPORT_DISABLED_ENV = "SOULFORGE_CODEX_LIFECYCLE_RETENTION_REPORT_DISABLED";
export const DEFAULT_LIFECYCLE_MAX_AGE_MS = 5 * 60 * 1_000;

const ENROLLMENT_SCHEMA = "soulforge.team_ops_board.thread_enrollment.v1";
const RESULT_GATE_SCHEMA = "soulforge.team_ops_board.thread_result_gate.v1";
const LIFECYCLE_SCHEMA = "soulforge.ai_usage_lifecycle_snapshot.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,319}$/u;
const SAFE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,191}$/u;
const ENROLLMENT_LIFECYCLES = new Set(["pending", "accepted", "current", "history", "retired"]);
const RESULT_EVENT_TYPES = new Set(["started", "result_ready", "accepted", "closed"]);
const RESULT_TARGETS = new Set(["none", "parent", "owner"]);
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
const GIT_OPERATION_MARKERS = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD", "rebase-merge", "rebase-apply"];
const DESTRUCTIVE_OPTIONS = new Set(["--apply", "--delete", "--archive", "--remove", "--prune", "--branch-delete"]);

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

function sourceStatusFromRead(status, normal) {
  if (status !== "available") return { status, value: null };
  return normal === null ? { status: "invalid", value: null } : { status: "available", value: normal };
}

export function isLifecycleRetentionReportDisabled(env = process.env) {
  return truthyEnvironmentValue(env?.[LIFECYCLE_RETENTION_REPORT_DISABLED_ENV]);
}

export function defaultLifecycleRetentionReportPaths({ repoRoot = defaultRepoRoot() } = {}) {
  const root = resolve(repoRoot);
  return {
    repo_root: root,
    enrollment_path: join(root, "guild_hall", "state", "operations", "team_ops_board", "thread_visibility.v1.json"),
    lifecycle_path: join(root, "guild_hall", "state", "operations", "ai_usage_meter", "lifecycle", "current.json"),
    result_gate_path: join(root, "guild_hall", "state", "operations", "team_ops_board", "thread_result_gate.v1.json")
  };
}

export function defaultRepoRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
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
    // Deliberately do not copy title-like labels, route/work values, or any cwd.
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
    // Match exactly. An agent receipt never implicitly changes its parent session.
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

export function buildLifecycleRetentionReport({
  enrollment = { status: "missing", value: null },
  lifecycle = { status: "missing", value: null },
  resultGate = { status: "missing", value: null },
  worktreePreflight = null,
  now = Date.now,
  maxAgeMs = DEFAULT_LIFECYCLE_MAX_AGE_MS,
  completionReceipts = new Map(),
  interruptionReceipts = new Map(),
  duplicateDecisions = new Map()
} = {}) {
  const normalizedEnrollment = sourceStatusFromRead(enrollment.status, normalizeEnrollmentRegistry(enrollment.value));
  const normalizedLifecycle = sourceStatusFromRead(
    lifecycle.status,
    normalizeLifecycleSnapshot(lifecycle.value, { now, maxAgeMs })
  );
  const normalizedResultGate = sourceStatusFromRead(resultGate.status, normalizeResultGateRegistry(resultGate.value));

  const enrollmentRegistry = normalizedEnrollment.value;
  const lifecycleSnapshot = normalizedLifecycle.value;
  const resultRegistry = normalizedResultGate.value;
  const enrollmentHealth = enrollmentRegistry?.disabled ? "disabled" : normalizedEnrollment.status;
  const lifecycleHealth = lifecycleSnapshot?.status ?? normalizedLifecycle.status;
  const resultGateHealth = resultRegistry?.disabled ? "disabled" : normalizedResultGate.status;
  const gateStates = enrollmentRegistry && resultRegistry && !resultRegistry.disabled
    ? deriveResultGateStates({ enrollmentRegistry, resultGateRegistry: resultRegistry })
    : { status: resultGateHealth, by_thread_id: new Map() };

  const activeEnrollment = enrollmentHealth === "available"
    ? enrollmentRegistry.entries.filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted")
    : [];
  const enrolledIds = new Set(activeEnrollment.map((entry) => entry.thread_id));
  const observations = lifecycleHealth === "available"
    ? selectExactLifecycleObservations({ lifecycleSnapshot, enrolledThreadIds: enrolledIds, now, maxAgeMs })
    : new Map();
  const threads = activeEnrollment
    .map((entry) => {
      const classified = classifyLifecycleRetentionThread(entry, {
        lifecycleObservation: observations.get(entry.thread_id) ?? null,
        resultGate: gateStates.status === "available" ? gateStates.by_thread_id.get(entry.thread_id) ?? null : null,
        completionReceipt: completionReceipts.get(entry.thread_id) ?? null,
        interruptionReceipt: interruptionReceipts.get(entry.thread_id) ?? null,
        duplicateDecision: duplicateDecisions.get(entry.thread_id) ?? null
      });
      return {
        thread_id: entry.thread_id,
        enrollment_lifecycle: entry.lifecycle,
        classification: classified.classification,
        reason_code: classified.reason_code
      };
    })
    .sort((left, right) => left.thread_id.localeCompare(right.thread_id, "en"));

  return {
    schema_version: LIFECYCLE_RETENTION_REPORT_SCHEMA,
    report_only: true,
    generated_at: new Date(safeNow(now)).toISOString(),
    lifecycle_retention_action: "HOLD",
    source_health: {
      enrollment: enrollmentHealth,
      lifecycle: lifecycleHealth,
      result_gate: gateStates.status
    },
    thread_scope: {
      current_or_accepted_count: activeEnrollment.length,
      history_or_retired_excluded_count: enrollmentHealth === "available"
        ? enrollmentRegistry.entries.length - activeEnrollment.length
        : 0
    },
    classifications: countByClassification(threads),
    threads,
    authority_gaps: {
      completion_receipt: "HOLD",
      interruption_receipt: "HOLD",
      duplicate_decision: "HOLD",
      codex_archive_delete: "OWNER_AUTHORIZATION_REQUIRED"
    },
    worktree_preflight: worktreePreflight ?? unavailableWorktreePreflight(),
    privacy: {
      metadata_only: true,
      raw_content_fields_stored: 0,
      raw_flag_fields_stored: 0,
      sensitive_content_included: false
    }
  };
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
      maxBuffer: 1_048_576
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

async function inspectOneWorktree(record, index, { mainRef, mainRefAvailable, runGit, exists }) {
  const base = {
    worktree_id: `worktree-${index + 1}`,
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
  base.hold_reasons = holdReasons;
  return base;
}

export function summarizeWorktreePreflight(entries, { comparisonRefStatus = "unavailable", listStatus = "available" } = {}) {
  const rows = Array.isArray(entries) ? entries : [];
  return {
    report_only: true,
    status: "HOLD",
    list_status: listStatus,
    comparison_ref_status: comparisonRefStatus,
    total_worktrees: rows.length,
    dirty_worktrees: rows.filter((entry) => entry.tracked_dirty === true || entry.untracked === true).length,
    untracked_worktrees: rows.filter((entry) => entry.untracked === true).length,
    locked_worktrees: rows.filter((entry) => entry.locked === true).length,
    prunable_worktrees: rows.filter((entry) => entry.prunable === true).length,
    index_lock_worktrees: rows.filter((entry) => entry.index_lock_present === true).length,
    operation_marker_worktrees: rows.filter((entry) => (entry.operation_marker_count ?? 0) > 0).length,
    unique_commit_worktrees: rows.filter((entry) => Number.isSafeInteger(entry.unique_commit_count_vs_main) && entry.unique_commit_count_vs_main > 0).length,
    authority_gaps: {
      pull_request: "HOLD",
      active_process: "HOLD",
      result_handoff: "HOLD"
    },
    entries: rows.map((entry) => ({ ...entry }))
  };
}

export function unavailableWorktreePreflight() {
  return summarizeWorktreePreflight([], { comparisonRefStatus: "unavailable", listStatus: "missing" });
}

export async function inspectWorktreePreflight({
  repoRoot = defaultRepoRoot(),
  mainRef = "main",
  runGit = executeGit,
  exists = pathExists
} = {}) {
  const root = resolve(repoRoot);
  const listed = await runGit(root, ["worktree", "list", "--porcelain"]);
  if (listed.code !== 0) {
    return summarizeWorktreePreflight([], { comparisonRefStatus: "unavailable", listStatus: "unavailable" });
  }
  const mainReference = await runGit(root, ["rev-parse", "--verify", "--quiet", mainRef]);
  const records = parseGitWorktreePorcelain(listed.stdout);
  const entries = await Promise.all(records.map((record, index) => inspectOneWorktree(record, index, {
    mainRef,
    mainRefAvailable: mainReference.code === 0,
    runGit,
    exists
  })));
  return summarizeWorktreePreflight(entries, {
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

export async function runLifecycleRetentionReport({
  repoRoot = defaultRepoRoot(),
  enrollmentPath = null,
  lifecyclePath = null,
  resultGatePath = null,
  mainRef = "main",
  now = Date.now,
  maxAgeMs = DEFAULT_LIFECYCLE_MAX_AGE_MS,
  readJson = readJsonSource,
  inspectWorktrees = inspectWorktreePreflight
} = {}) {
  const defaults = defaultLifecycleRetentionReportPaths({ repoRoot: repoRoot ?? defaultRepoRoot() });
  const [enrollment, lifecycle, resultGate, worktreePreflight] = await Promise.all([
    readJson(enrollmentPath ?? defaults.enrollment_path),
    readJson(lifecyclePath ?? defaults.lifecycle_path),
    readJson(resultGatePath ?? defaults.result_gate_path),
    inspectWorktrees({ repoRoot: defaults.repo_root, mainRef })
  ]);
  return buildLifecycleRetentionReport({ enrollment, lifecycle, resultGate, worktreePreflight, now, maxAgeMs });
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
    mainRef: "main",
    help: false
  };
  const needsValue = new Map([
    ["--repo", "repoRoot"],
    ["--enrollment", "enrollmentPath"],
    ["--lifecycle", "lifecyclePath"],
    ["--result-gate", "resultGatePath"],
    ["--main-ref", "mainRef"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (forbiddenOption(argument)) throw new Error("report_only_destructive_option_forbidden");
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }
    const key = needsValue.get(argument);
    if (!key || index + 1 >= argv.length || String(argv[index + 1]).startsWith("--")) {
      throw new Error("invalid_lifecycle_retention_report_arguments");
    }
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

export function lifecycleRetentionReportUsage() {
  return [
    "Usage: node .workflow/codex_thread_manager_v0/lifecycle_retention_report.mjs [options]",
    "  --repo <path>         repository root (read-only)",
    "  --enrollment <path>   Board enrollment registry (read-only)",
    "  --lifecycle <path>    lifecycle snapshot (read-only)",
    "  --result-gate <path>  Board result-gate registry (read-only)",
    "  --main-ref <ref>      comparison ref, default: main",
    "  --help                show this help",
    "This command is report-only. --apply, --delete, archive, remove, prune, and branch deletion are rejected."
  ].join("\n");
}

export async function main(argv = process.argv.slice(2), { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const args = parseLifecycleRetentionReportArgs(argv);
    if (args.help) {
      stdout.write(`${lifecycleRetentionReportUsage()}\n`);
      return 0;
    }
    if (isLifecycleRetentionReportDisabled(env)) {
      stdout.write(`${JSON.stringify({
        schema_version: LIFECYCLE_RETENTION_REPORT_SCHEMA,
        report_only: true,
        status: "disabled",
        reason_code: "emergency_disable_active"
      })}\n`);
      return 0;
    }
    const report = await runLifecycleRetentionReport(args);
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${String(error?.message || "lifecycle_retention_report_failed").replace(/[\r\n]+/gu, " ")}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}

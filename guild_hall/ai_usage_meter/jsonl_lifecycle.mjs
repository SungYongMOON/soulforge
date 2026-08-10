import { promises as fs } from "node:fs";
import path from "node:path";

import {
  canonicalJson,
  findCodexSessionFiles,
  parseCodexSessionFile,
  sha256,
} from "./usage_meter.mjs";

export const JSONL_LIFECYCLE_SNAPSHOT_SCHEMA = "soulforge.ai_usage_jsonl_lifecycle_snapshot.v1";
export const JSONL_LIFECYCLE_SOURCE = "jsonl_metadata";
export const DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS = 200;
export const DEFAULT_JSONL_LIFECYCLE_MAX_AGE_MS = 5 * 60 * 1_000;

export function planPendingJsonlReconcile({ canonical = [], pending = [] } = {}) {
  const byIdentity = new Map();
  let malformedExcludedCount = 0;
  const safeItem = (item) => item && typeof item === "object"
    && item.identity && typeof item.identity === "object" && Object.keys(item.identity).length > 0
    && item.payload && typeof item.payload === "object";
  for (const item of canonical) {
    if (!safeItem(item)) {
      malformedExcludedCount += 1;
      continue;
    }
    const identity = canonicalJson(item.identity);
    byIdentity.set(identity, canonicalJson(item.payload));
  }
  const actions = [];
  let conflictCount = 0;
  for (const item of pending) {
    if (!safeItem(item)) {
      malformedExcludedCount += 1;
      continue;
    }
    const identity = canonicalJson(item.identity);
    const digest = canonicalJson(item.payload);
    const existing = byIdentity.get(identity);
    if (existing === undefined) {
      byIdentity.set(identity, digest);
      actions.push({ identity_digest: sha256(identity), payload_digest: sha256(digest), action: "create" });
    } else if (existing === digest) {
      actions.push({ identity_digest: sha256(identity), payload_digest: sha256(digest), action: "noop" });
    } else {
      conflictCount += 1;
      actions.push({ identity_digest: sha256(identity), payload_digest: sha256(digest), action: "conflict" });
    }
  }
  return {
    status: conflictCount > 0 ? "hold" : "ready",
    reason_code: conflictCount > 0 ? "jsonl_pending_identity_conflict" : null,
    conflict_count: conflictCount,
    malformed_excluded_count: malformedExcludedCount,
    write_allowed: conflictCount === 0,
    actions,
  };
}

export function jsonlLifecycleCompleteness(snapshot) {
  const accepted = validateJsonlLifecycleSnapshot(snapshot);
  const turns = accepted.identities.filter((identity) => identity.identity_kind === "turn");
  const active = turns.some((identity) => identity.lifecycle_state === "active");
  const stopped = turns.some((identity) => identity.lifecycle_state === "stopped");
  const subagent = turns.some((identity) => identity.agent_id !== null || identity.parent_thread_id !== null)
    || accepted.identities.some((identity) => identity.identity_kind === "agent_link");
  return {
    completeness: !active && stopped ? "observed_stop_only" : "unknown",
    coverage: subagent ? "coverage_partial" : (accepted.coverage.complete ? "coverage_complete" : "coverage_partial"),
  };
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const SNAPSHOT_KEYS = [
  "schema_version", "source", "generated_at", "latest_observed_at", "coverage", "health",
  "identities", "raw_content_fields_stored", "raw_flag_fields_stored",
];
const COVERAGE_KEYS = [
  "scope", "complete", "candidate_session_count", "selected_session_count", "parsed_session_count",
  "malformed_session_count", "missing_exact_thread_count", "observed_projection_count",
  "projection_count", "duplicate_projection_count", "superseded_projection_count",
  "confirmed_agent_link_count", "next_after_thread_id",
];
const HEALTH_KEYS = ["status", "reason_code", "staleness"];
const IDENTITY_KEYS = [
  "identity_kind", "thread_id", "turn_id", "agent_id", "parent_thread_id", "lifecycle_state",
  "result_state", "observed_at", "activity_observed_at", "source", "source_event",
];
const LEGACY_IDENTITY_KEYS = IDENTITY_KEYS.filter((key) => key !== "activity_observed_at");
const SCOPE_VALUES = new Set(["full_sessions_root", "bounded_sessions", "exact_threads"]);
const HEALTH_VALUES = new Set(["available", "partial", "hold", "disabled"]);
const STALENESS_VALUES = new Set(["fresh", "stale", "unknown"]);
const IDENTITY_KINDS = new Set(["turn", "agent_link"]);
const LIFECYCLE_STATES = new Set(["active", "stopped", "linked"]);
const SOURCE_EVENTS = new Set(["task_started", "task_complete", "sub_agent_activity"]);
const STATE_RANK = Object.freeze({ linked: 0, active: 1, stopped: 2 });

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
  if (value === null || value === undefined) return null;
  return requiredSafeId(value, code);
}

function optionalSafeCode(value, code) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !SAFE_CODE.test(value)) fail(code);
  return value;
}

function requiredTimestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(code);
  return new Date(value).toISOString();
}

function optionalTimestamp(value, code) {
  if (value === null || value === undefined) return null;
  return requiredTimestamp(value, code);
}

function nonNegativeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function normalizeThreadIds(threadIds) {
  if (!Array.isArray(threadIds)) fail("jsonl_lifecycle_thread_ids_invalid");
  return [...new Set(threadIds.map((threadId) => requiredSafeId(threadId, "jsonl_lifecycle_thread_id_invalid")))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function maxSessions(value) {
  if (value === null || value === undefined) return DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) fail("jsonl_lifecycle_max_sessions_invalid");
  return value;
}

function candidateThreadId(file) {
  const name = path.basename(file);
  const match = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/iu.exec(name);
  return match?.[1] ?? null;
}

function groupFiles(files) {
  const groups = new Map();
  let anonymous = 0;
  for (const file of files) {
    const threadId = candidateThreadId(file);
    const key = threadId ? `known:${threadId}` : `unknown:${String(anonymous++).padStart(8, "0")}`;
    const group = groups.get(key) ?? { thread_id: threadId, files: [] };
    group.files.push(path.resolve(file));
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      files: group.files.sort((left, right) => left.localeCompare(right, "en")),
    }))
    .sort((left, right) => (
      (left.thread_id ?? "~").localeCompare(right.thread_id ?? "~", "en")
      || left.files[0].localeCompare(right.files[0], "en")
    ));
}

async function selectSessionFiles({ sessionsRoot, sessionFiles, threadIds, maxSessionCount, afterThreadId }) {
  const exactThreadIds = normalizeThreadIds(threadIds);
  const safeAfter = afterThreadId === null || afterThreadId === undefined
    ? null
    : requiredSafeId(afterThreadId, "jsonl_lifecycle_after_thread_id_invalid");

  if (exactThreadIds.length) {
    if (exactThreadIds.length > maxSessionCount) fail("jsonl_lifecycle_exact_scope_exceeds_max_sessions");
    const explicitFiles = sessionFiles
      ? [...sessionFiles].map((file) => path.resolve(file)).sort((left, right) => left.localeCompare(right, "en"))
      : null;
    // Enrollment reconciliation can cover dozens of exact IDs. Build the Codex
    // session index once, then apply the same exact filename-suffix match for
    // every enrolled ID instead of recursively walking the sessions root per ID.
    const candidateFiles = explicitFiles ?? await findCodexSessionFiles(sessionsRoot);
    const selected = [];
    let missingExactThreadCount = 0;
    for (const threadId of exactThreadIds) {
      const matching = candidateFiles.filter((file) => path.basename(file).endsWith(`-${threadId}.jsonl`));
      if (!matching.length) missingExactThreadCount += 1;
      selected.push(...matching.map((file) => path.resolve(file)));
    }
    return {
      files: [...new Set(selected)].sort((left, right) => left.localeCompare(right, "en")),
      scope: "exact_threads",
      complete: missingExactThreadCount === 0,
      candidate_session_count: selected.length,
      missing_exact_thread_count: missingExactThreadCount,
      next_after_thread_id: null,
    };
  }

  const allFiles = sessionFiles
    ? [...sessionFiles].map((file) => path.resolve(file)).sort((left, right) => left.localeCompare(right, "en"))
    : await findCodexSessionFiles(sessionsRoot);
  const groups = groupFiles(allFiles);
  const afterGroups = safeAfter
    ? groups.filter((group) => group.thread_id && group.thread_id.localeCompare(safeAfter, "en") > 0)
    : groups;
  const selectedGroups = afterGroups.slice(0, maxSessionCount);
  const remainingGroups = afterGroups.slice(maxSessionCount);
  const nextKnown = remainingGroups.length
    ? selectedGroups.at(-1)?.thread_id ?? null
    : null;
  return {
    files: selectedGroups.flatMap((group) => group.files),
    scope: (!safeAfter && remainingGroups.length === 0) ? "full_sessions_root" : "bounded_sessions",
    complete: !safeAfter && remainingGroups.length === 0,
    candidate_session_count: allFiles.length,
    missing_exact_thread_count: 0,
    next_after_thread_id: nextKnown,
  };
}

function safeSessionProjection(parsed) {
  return {
    thread_id: requiredSafeId(parsed.thread_id, "jsonl_lifecycle_parsed_thread_id_invalid"),
    parent_thread_id: optionalSafeId(parsed.parent_thread_id, "jsonl_lifecycle_parsed_parent_thread_id_invalid"),
    started_at: requiredTimestamp(parsed.started_at, "jsonl_lifecycle_parsed_started_at_invalid"),
    turns: parsed.turns.map((turn) => ({
      turn_id: requiredSafeId(turn.turn_id, "jsonl_lifecycle_parsed_turn_id_invalid"),
      status: turn.status === "active" || turn.status === "complete"
        ? turn.status
        : fail("jsonl_lifecycle_parsed_turn_status_invalid"),
      started_at: requiredTimestamp(turn.started_at, "jsonl_lifecycle_parsed_turn_started_at_invalid"),
      completed_at: optionalTimestamp(turn.completed_at, "jsonl_lifecycle_parsed_turn_completed_at_invalid"),
      activity_observed_at: optionalTimestamp(
        turn.activity_observed_at,
        "jsonl_lifecycle_parsed_turn_activity_observed_at_invalid",
      ),
    })),
    child_threads: parsed.child_threads.map((threadId) => requiredSafeId(
      threadId,
      "jsonl_lifecycle_parsed_child_thread_id_invalid",
    )),
  };
}

function compareObservation(left, right) {
  const stateRank = (STATE_RANK[left.lifecycle_state] ?? -1) - (STATE_RANK[right.lifecycle_state] ?? -1);
  if (stateRank !== 0) return stateRank;
  const observedAt = left.observed_at.localeCompare(right.observed_at, "en");
  if (observedAt !== 0) return observedAt;
  return canonicalJson(left).localeCompare(canonicalJson(right), "en");
}

function observationKey(observation) {
  if (observation.identity_kind === "agent_link") return `agent_link\u0000${observation.agent_id}`;
  return `turn\u0000${observation.thread_id}\u0000${observation.turn_id}`;
}

function observationFingerprint(observation) {
  // Continued JSONL copies may have a different file-metadata heartbeat while
  // still observing the same lifecycle event. Count that as a duplicate, then
  // retain the later activity timestamp below without creating a new identity.
  const { activity_observed_at: ignored, ...event } = observation;
  return canonicalJson(event);
}

function normalizeObservations(observations) {
  const seen = new Set();
  const latest = new Map();
  let duplicateProjectionCount = 0;
  let supersededProjectionCount = 0;
  for (const observation of observations) {
    const fingerprint = observationFingerprint(observation);
    const duplicate = seen.has(fingerprint);
    if (duplicate) {
      duplicateProjectionCount += 1;
    }
    seen.add(fingerprint);
    const key = observationKey(observation);
    const existing = latest.get(key);
    if (!existing) {
      latest.set(key, observation);
      continue;
    }
    if (!duplicate) supersededProjectionCount += 1;
    if (compareObservation(observation, existing) > 0) latest.set(key, observation);
  }
  return {
    identities: [...latest.values()].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en")),
    duplicate_projection_count: duplicateProjectionCount,
    superseded_projection_count: supersededProjectionCount,
  };
}

function buildObservations(sessions, { allowedThreadIds = null } = {}) {
  const byThread = new Map();
  for (const session of sessions) {
    const current = byThread.get(session.thread_id) ?? {
      thread_id: session.thread_id,
      parents: new Set(),
      started_at: session.started_at,
      turns: [],
      child_threads: new Set(),
    };
    if (session.parent_thread_id) current.parents.add(session.parent_thread_id);
    if (session.started_at < current.started_at) current.started_at = session.started_at;
    current.turns.push(...session.turns);
    for (const childThreadId of session.child_threads) current.child_threads.add(childThreadId);
    byThread.set(session.thread_id, current);
  }

  const parentActivityByChild = new Map();
  for (const session of byThread.values()) {
    for (const childThreadId of session.child_threads) {
      if (allowedThreadIds !== null && !allowedThreadIds.has(childThreadId)) continue;
      const parents = parentActivityByChild.get(childThreadId) ?? new Set();
      parents.add(session.thread_id);
      parentActivityByChild.set(childThreadId, parents);
    }
  }

  const observations = [];
  let confirmedAgentLinkCount = 0;
  const conflictedChildIds = new Set();
  for (const [childThreadId, parents] of parentActivityByChild) {
    if (parents.size > 1) conflictedChildIds.add(childThreadId);
  }
  for (const session of byThread.values()) {
    if (session.parents.size > 1) conflictedChildIds.add(session.thread_id);
    const parentThreadId = session.parents.size === 1 ? [...session.parents][0] : null;
    const parentActivity = parentActivityByChild.get(session.thread_id) ?? new Set();
    const agentId = parentThreadId && parentActivity.size === 1 && parentActivity.has(parentThreadId)
      ? session.thread_id
      : null;
    if (agentId) confirmedAgentLinkCount += 1;
    for (const turn of session.turns) {
      const stopped = turn.status === "complete";
      observations.push({
        identity_kind: "turn",
        thread_id: session.thread_id,
        turn_id: turn.turn_id,
        agent_id: agentId,
        parent_thread_id: parentThreadId,
        lifecycle_state: stopped ? "stopped" : "active",
        result_state: "result_pending",
        observed_at: stopped
          ? requiredTimestamp(turn.completed_at, "jsonl_lifecycle_completed_at_missing")
          : turn.started_at,
        // Keep the lifecycle event time separate from the last exact-session
        // metadata activity. The latter may refresh only a still-active turn.
        activity_observed_at: stopped
          ? null
          : requiredTimestamp(
            turn.activity_observed_at ?? turn.started_at,
            "jsonl_lifecycle_active_activity_observed_at_invalid",
          ),
        source: JSONL_LIFECYCLE_SOURCE,
        source_event: stopped ? "task_complete" : "task_started",
      });
    }
    for (const childThreadId of session.child_threads) {
      if (allowedThreadIds !== null && !allowedThreadIds.has(childThreadId)) continue;
      if (conflictedChildIds.has(childThreadId)) continue;
      observations.push({
        identity_kind: "agent_link",
        thread_id: childThreadId,
        turn_id: null,
        agent_id: childThreadId,
        parent_thread_id: session.thread_id,
        lifecycle_state: "linked",
        result_state: "result_pending",
        observed_at: session.started_at,
        activity_observed_at: null,
        source: JSONL_LIFECYCLE_SOURCE,
        source_event: "sub_agent_activity",
      });
    }
  }
  return {
    observations,
    confirmed_agent_link_count: confirmedAgentLinkCount,
    parent_lineage_conflict_count: conflictedChildIds.size,
  };
}

function healthFor({ complete, malformedSessionCount, missingExactThreadCount, parentLineageConflictCount, disabled = false }) {
  if (disabled) return { status: "disabled", reason_code: "emergency_disable_active", staleness: "unknown" };
  if (malformedSessionCount > 0) return { status: "hold", reason_code: "jsonl_session_parse_failed", staleness: "fresh" };
  if (parentLineageConflictCount > 0) return { status: "hold", reason_code: "jsonl_parent_lineage_conflict", staleness: "fresh" };
  if (missingExactThreadCount > 0) return { status: "partial", reason_code: "jsonl_exact_thread_not_found", staleness: "fresh" };
  if (!complete) return { status: "partial", reason_code: "jsonl_scan_bounded", staleness: "fresh" };
  return { status: "available", reason_code: null, staleness: "fresh" };
}

export function validateJsonlLifecycleSnapshot(snapshot) {
  if (!hasExactKeys(snapshot, SNAPSHOT_KEYS)) fail("jsonl_lifecycle_snapshot_shape_invalid");
  if (snapshot.schema_version !== JSONL_LIFECYCLE_SNAPSHOT_SCHEMA) fail("jsonl_lifecycle_snapshot_schema_invalid");
  if (snapshot.source !== JSONL_LIFECYCLE_SOURCE) fail("jsonl_lifecycle_snapshot_source_invalid");
  requiredTimestamp(snapshot.generated_at, "jsonl_lifecycle_snapshot_generated_at_invalid");
  optionalTimestamp(snapshot.latest_observed_at, "jsonl_lifecycle_snapshot_latest_observed_at_invalid");
  if (!hasExactKeys(snapshot.coverage, COVERAGE_KEYS)) fail("jsonl_lifecycle_snapshot_coverage_invalid");
  if (!SCOPE_VALUES.has(snapshot.coverage.scope) || typeof snapshot.coverage.complete !== "boolean") {
    fail("jsonl_lifecycle_snapshot_scope_invalid");
  }
  for (const field of [
    "candidate_session_count", "selected_session_count", "parsed_session_count", "malformed_session_count",
    "missing_exact_thread_count", "observed_projection_count", "projection_count",
    "duplicate_projection_count", "superseded_projection_count", "confirmed_agent_link_count",
  ]) nonNegativeInteger(snapshot.coverage[field], "jsonl_lifecycle_snapshot_coverage_count_invalid");
  optionalSafeId(snapshot.coverage.next_after_thread_id, "jsonl_lifecycle_snapshot_next_after_invalid");
  if (!hasExactKeys(snapshot.health, HEALTH_KEYS) || !HEALTH_VALUES.has(snapshot.health.status)
    || !STALENESS_VALUES.has(snapshot.health.staleness)) {
    fail("jsonl_lifecycle_snapshot_health_invalid");
  }
  optionalSafeCode(snapshot.health.reason_code, "jsonl_lifecycle_snapshot_reason_invalid");
  if (!Array.isArray(snapshot.identities) || snapshot.identities.length !== snapshot.coverage.projection_count) {
    fail("jsonl_lifecycle_snapshot_identities_invalid");
  }
  const seen = new Set();
  for (const identity of snapshot.identities) {
    const hasActivityTimestamp = Object.hasOwn(identity, "activity_observed_at");
    if (
      (!hasExactKeys(identity, IDENTITY_KEYS) && !hasExactKeys(identity, LEGACY_IDENTITY_KEYS))
      || !IDENTITY_KINDS.has(identity.identity_kind)
    ) {
      fail("jsonl_lifecycle_snapshot_identity_shape_invalid");
    }
    requiredSafeId(identity.thread_id, "jsonl_lifecycle_snapshot_thread_id_invalid");
    optionalSafeId(identity.turn_id, "jsonl_lifecycle_snapshot_turn_id_invalid");
    optionalSafeId(identity.agent_id, "jsonl_lifecycle_snapshot_agent_id_invalid");
    optionalSafeId(identity.parent_thread_id, "jsonl_lifecycle_snapshot_parent_thread_id_invalid");
    if (!LIFECYCLE_STATES.has(identity.lifecycle_state) || identity.result_state !== "result_pending"
      || identity.source !== JSONL_LIFECYCLE_SOURCE || !SOURCE_EVENTS.has(identity.source_event)) {
      fail("jsonl_lifecycle_snapshot_identity_value_invalid");
    }
    requiredTimestamp(identity.observed_at, "jsonl_lifecycle_snapshot_identity_observed_at_invalid");
    const activityObservedAt = hasActivityTimestamp
      ? optionalTimestamp(identity.activity_observed_at, "jsonl_lifecycle_snapshot_activity_observed_at_invalid")
      : null;
    if (identity.identity_kind === "turn" && (!identity.turn_id || identity.lifecycle_state === "linked")) {
      fail("jsonl_lifecycle_snapshot_turn_identity_invalid");
    }
    if (identity.identity_kind === "turn" && (
      (identity.lifecycle_state === "active" && identity.source_event !== "task_started")
      || (identity.lifecycle_state === "stopped" && identity.source_event !== "task_complete")
    )) fail("jsonl_lifecycle_snapshot_turn_event_invalid");
    if (hasActivityTimestamp && (
      (identity.identity_kind === "turn" && identity.lifecycle_state === "active" && activityObservedAt === null)
      || ((identity.identity_kind !== "turn" || identity.lifecycle_state !== "active") && activityObservedAt !== null)
    )) fail("jsonl_lifecycle_snapshot_activity_state_invalid");
    if (identity.identity_kind === "agent_link" && (
      identity.turn_id !== null || !identity.agent_id || !identity.parent_thread_id || identity.lifecycle_state !== "linked"
      || identity.source_event !== "sub_agent_activity"
    )) fail("jsonl_lifecycle_snapshot_link_identity_invalid");
    const key = observationKey(identity);
    if (seen.has(key)) fail("jsonl_lifecycle_snapshot_identity_duplicate");
    seen.add(key);
  }
  if (snapshot.raw_content_fields_stored !== 0 || snapshot.raw_flag_fields_stored !== 0) {
    fail("jsonl_lifecycle_snapshot_privacy_invalid");
  }
  return snapshot;
}

export async function reconcileJsonlLifecycle({
  sessionsRoot,
  sessionFiles = null,
  threadIds = [],
  maxSessionCount = DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS,
  afterThreadId = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (typeof sessionsRoot !== "string" || !sessionsRoot) fail("jsonl_lifecycle_sessions_root_required");
  const selected = await selectSessionFiles({
    sessionsRoot: path.resolve(sessionsRoot),
    sessionFiles,
    threadIds,
    maxSessionCount: maxSessions(maxSessionCount),
    afterThreadId,
  });
  const safeSessions = [];
  let malformedSessionCount = 0;
  for (const file of selected.files) {
    try {
      const parsed = await parseCodexSessionFile(file, { includeActive: true, sourceRoot: sessionsRoot });
      safeSessions.push(safeSessionProjection(parsed));
    } catch {
      malformedSessionCount += 1;
    }
  }
  const built = buildObservations(safeSessions, {
    allowedThreadIds: selected.scope === "exact_threads" ? new Set(normalizeThreadIds(threadIds)) : null,
  });
  const normalized = normalizeObservations(built.observations);
  const latestObservedAt = normalized.identities.reduce((latest, identity) => (
    latest === null || identity.observed_at > latest ? identity.observed_at : latest
  ), null);
  const coverage = {
    scope: selected.scope,
    complete: selected.complete && malformedSessionCount === 0,
    candidate_session_count: selected.candidate_session_count,
    selected_session_count: selected.files.length,
    parsed_session_count: safeSessions.length,
    malformed_session_count: malformedSessionCount,
    missing_exact_thread_count: selected.missing_exact_thread_count,
    observed_projection_count: built.observations.length,
    projection_count: normalized.identities.length,
    duplicate_projection_count: normalized.duplicate_projection_count,
    superseded_projection_count: normalized.superseded_projection_count,
    confirmed_agent_link_count: built.confirmed_agent_link_count,
    next_after_thread_id: selected.next_after_thread_id,
  };
  const snapshot = {
    schema_version: JSONL_LIFECYCLE_SNAPSHOT_SCHEMA,
    source: JSONL_LIFECYCLE_SOURCE,
    generated_at: requiredTimestamp(generatedAt, "jsonl_lifecycle_snapshot_generated_at_invalid"),
    latest_observed_at: latestObservedAt,
    coverage,
    health: healthFor({
      complete: coverage.complete,
      malformedSessionCount,
      missingExactThreadCount: selected.missing_exact_thread_count,
      parentLineageConflictCount: built.parent_lineage_conflict_count,
    }),
    identities: normalized.identities,
    raw_content_fields_stored: 0,
    raw_flag_fields_stored: 0,
  };
  return validateJsonlLifecycleSnapshot(snapshot);
}

export function jsonlLifecycleReceiptInputs(snapshot) {
  const accepted = validateJsonlLifecycleSnapshot(snapshot);
  return accepted.identities
    .filter((identity) => identity.identity_kind === "turn")
    .map((identity) => {
      const isChild = identity.agent_id !== null;
      const stopped = identity.lifecycle_state === "stopped";
      const activityObservedAt = stopped
        ? identity.observed_at
        : requiredTimestamp(
          identity.activity_observed_at ?? identity.observed_at,
          "jsonl_lifecycle_receipt_activity_observed_at_invalid",
        );
      // A distinct, timestamp-keyed metadata-only receipt lets the lifecycle
      // mirror renew a long active turn without treating snapshot generation as
      // activity. It carries neither row content nor flags.
      const reason = stopped
        ? JSONL_LIFECYCLE_SOURCE
        : `${JSONL_LIFECYCLE_SOURCE}_active_${activityObservedAt.replace(/[^0-9]/gu, "")}`;
      return {
        hook_event_name: isChild
          ? (stopped ? "SubagentStop" : "SubagentStart")
          : (stopped ? "Stop" : "SessionStart"),
        session_id: identity.thread_id,
        turn_id: identity.turn_id,
        agent_id: isChild ? identity.agent_id : null,
        agent_type: isChild ? "subagent" : null,
        reason,
        permission_mode: null,
        stop_hook_active: null,
        observed_at: activityObservedAt,
      };
    })
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"));
}

function comparableSnapshot(snapshot) {
  const { generated_at: generatedAt, ...rest } = snapshot;
  return rest;
}

async function writeJsonAtomic(target, payload) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export function defaultJsonlLifecycleSnapshotPath(stateRoot) {
  return path.join(path.resolve(stateRoot), "lifecycle", "jsonl", "current.json");
}

export async function persistJsonlLifecycleSnapshot(stateRoot, snapshot) {
  const accepted = validateJsonlLifecycleSnapshot(snapshot);
  const target = defaultJsonlLifecycleSnapshotPath(stateRoot);
  let status = "created";
  try {
    const existing = validateJsonlLifecycleSnapshot(JSON.parse(await fs.readFile(target, "utf8")));
    status = canonicalJson(comparableSnapshot(existing)) === canonicalJson(comparableSnapshot(accepted))
      ? "replayed"
      : "updated";
  } catch (error) {
    if (error?.code !== "ENOENT") fail("jsonl_lifecycle_existing_snapshot_invalid");
  }
  await writeJsonAtomic(target, accepted);
  return { status };
}

export function evaluateJsonlLifecycleStaleness(snapshot, {
  now = Date.now,
  maxAgeMs = DEFAULT_JSONL_LIFECYCLE_MAX_AGE_MS,
} = {}) {
  const accepted = validateJsonlLifecycleSnapshot(snapshot);
  const observedNow = typeof now === "function" ? now() : now;
  const safeNow = Number.isFinite(observedNow) ? Number(observedNow) : Date.now();
  const safeMaxAge = Number.isSafeInteger(maxAgeMs) && maxAgeMs >= 0
    ? maxAgeMs
    : DEFAULT_JSONL_LIFECYCLE_MAX_AGE_MS;
  const sourceObservedAt = accepted.latest_observed_at;
  const staleness = sourceObservedAt === null
    || safeNow - Date.parse(sourceObservedAt) > safeMaxAge ? "stale" : "fresh";
  return validateJsonlLifecycleSnapshot({
    ...accepted,
    health: { ...accepted.health, staleness },
  });
}

export async function loadJsonlLifecycleSnapshot(stateRoot, options = {}) {
  const target = defaultJsonlLifecycleSnapshotPath(stateRoot);
  return evaluateJsonlLifecycleStaleness(JSON.parse(await fs.readFile(target, "utf8")), options);
}

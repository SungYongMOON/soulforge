import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  LIFECYCLE_HOOK_EVENTS,
  validateLifecycleSnapshot
} from "../../../../../guild_hall/ai_usage_meter/lifecycle_receipt.mjs";

export const LIFECYCLE_SOURCE_HEALTH = Object.freeze([
  "available",
  "missing",
  "invalid",
  "disabled",
  "stale"
]);

export const DEFAULT_LIFECYCLE_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1_000;

const DEFAULT_LIFECYCLE_SNAPSHOT_MAX_FUTURE_MS = 60 * 1_000;
const EMERGENCY_DISABLE_SCHEMA = "soulforge.ai_usage_meter_emergency_disable.v1";
const EMERGENCY_DISABLE_KEYS = ["disabled", "schema_version", "updated_at"];
const LIFECYCLE_RUNTIME_STATUS = Object.freeze({
  started: "active",
  waiting_on_approval: "waiting",
  observed_at_stop: "stopped",
  ended: "stopped"
});
const LIFECYCLE_STATE_RANK = Object.freeze({
  input_received: 0,
  started: 1,
  waiting_on_approval: 2,
  observed_at_stop: 3,
  ended: 4
});

function hasExactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort((left, right) => left.localeCompare(right, "en")).join("\u0000")
      === [...keys].sort((left, right) => left.localeCompare(right, "en")).join("\u0000");
}

function safeIsoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function safeNowMilliseconds(value) {
  const candidate = typeof value === "function" ? value() : value;
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

function isDisabledControl(value) {
  return hasExactKeys(value, EMERGENCY_DISABLE_KEYS)
    && value.schema_version === EMERGENCY_DISABLE_SCHEMA
    && value.disabled === true
    && safeIsoTimestamp(value.updated_at) !== null;
}

function snapshotHasExactIdentityContract(snapshot) {
  if (!Array.isArray(snapshot.identities)) return false;
  return snapshot.identities.every((identity) => (
    LIFECYCLE_HOOK_EVENTS[identity.source_event] === identity.lifecycle_state
    && identity.result_state === "result_pending"
  ));
}

function sourceResult(status, snapshot = null) {
  return {
    status,
    snapshot,
    identity_count: Array.isArray(snapshot?.identities) ? snapshot.identities.length : 0
  };
}

export function defaultLifecycleSnapshotPath(stateRoot) {
  return join(resolve(stateRoot), "lifecycle", "current.json");
}

export function defaultLifecycleDisableControlPath(stateRoot) {
  return join(resolve(stateRoot), "control", "emergency-disable.v1.json");
}

// The meter owns production of this file. Board only validates and reads the
// metadata-only exact-ID projection; it never scans receipts or session files.
export async function readLifecycleSnapshotSource({
  stateRoot,
  snapshotPath = defaultLifecycleSnapshotPath(stateRoot),
  disabledControlPath = defaultLifecycleDisableControlPath(stateRoot),
  now = Date.now,
  maxAgeMs = DEFAULT_LIFECYCLE_SNAPSHOT_MAX_AGE_MS,
  maxFutureMs = DEFAULT_LIFECYCLE_SNAPSHOT_MAX_FUTURE_MS
} = {}) {
  let control;
  try {
    control = JSON.parse(await readFile(disabledControlPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") return sourceResult("invalid");
  }
  if (control !== undefined) return isDisabledControl(control) ? sourceResult("disabled") : sourceResult("invalid");

  let snapshot;
  try {
    snapshot = validateLifecycleSnapshot(JSON.parse(await readFile(snapshotPath, "utf8")));
  } catch (error) {
    return error?.code === "ENOENT" ? sourceResult("missing") : sourceResult("invalid");
  }
  if (!snapshotHasExactIdentityContract(snapshot)) return sourceResult("invalid");

  const generatedAt = Date.parse(snapshot.generated_at);
  const observedNow = safeNowMilliseconds(now);
  const safeMaxAge = Number.isSafeInteger(maxAgeMs) && maxAgeMs >= 0
    ? maxAgeMs
    : DEFAULT_LIFECYCLE_SNAPSHOT_MAX_AGE_MS;
  const safeMaxFuture = Number.isSafeInteger(maxFutureMs) && maxFutureMs >= 0
    ? maxFutureMs
    : DEFAULT_LIFECYCLE_SNAPSHOT_MAX_FUTURE_MS;
  if (generatedAt > observedNow + safeMaxFuture || observedNow - generatedAt > safeMaxAge) {
    return sourceResult("stale");
  }
  return sourceResult("available", snapshot);
}

function exactEnrolledThreadId(identity, enrolledThreadIds) {
  if (identity.agent_id && enrolledThreadIds.has(identity.agent_id)) return identity.agent_id;
  if (identity.session_id && enrolledThreadIds.has(identity.session_id)) return identity.session_id;
  return null;
}

function compareLatestIdentity(left, right) {
  const observed = left.observed_at.localeCompare(right.observed_at, "en");
  if (observed !== 0) return observed;
  const rank = (LIFECYCLE_STATE_RANK[left.lifecycle_state] ?? -1)
    - (LIFECYCLE_STATE_RANK[right.lifecycle_state] ?? -1);
  if (rank !== 0) return rank;
  const leftKey = `${left.agent_id ?? ""}\u0000${left.session_id ?? ""}\u0000${left.turn_id ?? ""}\u0000${left.source_event}`;
  const rightKey = `${right.agent_id ?? ""}\u0000${right.session_id ?? ""}\u0000${right.turn_id ?? ""}\u0000${right.source_event}`;
  return leftKey.localeCompare(rightKey, "en");
}

// Agent identity is deliberately preferred when both IDs are present: a
// subagent receipt must not also change an enrolled parent session by inference.
export function projectLifecycleSnapshotRuntime({ source, enrolledThreadIds = new Set() } = {}) {
  if (source?.status !== "available" || !Array.isArray(source.snapshot?.identities)) {
    return { runtime_threads: [], matched_enrolled_count: 0 };
  }

  const selectedByThreadId = new Map();
  const matchedThreadIds = new Set();
  for (const identity of source.snapshot.identities) {
    const threadId = exactEnrolledThreadId(identity, enrolledThreadIds);
    if (!threadId) continue;
    matchedThreadIds.add(threadId);
    const previous = selectedByThreadId.get(threadId);
    if (!previous || compareLatestIdentity(identity, previous) > 0) {
      selectedByThreadId.set(threadId, identity);
    }
  }

  const runtime_threads = [...selectedByThreadId.entries()]
    .map(([threadId, identity]) => {
      const status = LIFECYCLE_RUNTIME_STATUS[identity.lifecycle_state] ?? null;
      if (!status) return null; // UserPromptSubmit is input-only, not a running receipt.
      return {
        thread_id: threadId,
        status,
        updated_at: identity.observed_at,
        stop_observed_at: identity.lifecycle_state === "observed_at_stop" ? identity.observed_at : null
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.thread_id.localeCompare(right.thread_id, "en"));

  return {
    runtime_threads,
    matched_enrolled_count: matchedThreadIds.size
  };
}

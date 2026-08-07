// This boundary consumes the meter's already-validated, local lifecycle
// snapshot. It does not open Codex session files or retain receipt payloads.
export const TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED = "TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED";
export const DEFAULT_SUBAGENT_RECEIPT_ENROLLMENT_MAX_AGE_MS = 5 * 60 * 1_000;

const IDENTITY_KEYS = new Set([
  "session_id",
  "turn_id",
  "agent_id",
  "agent_type",
  "lifecycle_state",
  "result_state",
  "observed_at",
  "source_event"
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,239}$/u;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const STATE_RANK = Object.freeze({
  started: 1,
  waiting_on_approval: 2,
  observed_at_stop: 3,
  ended: 4
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function exactId(value) {
  return typeof value === "string" && SAFE_ID.test(value) ? value : null;
}

function optionalCode(value) {
  return value === null || (typeof value === "string" && SAFE_CODE.test(value));
}

function exactTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function isTruthyEnvironmentValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function observedNowMilliseconds(value) {
  const candidate = typeof value === "function" ? value() : value;
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

function safeMaxAge(value) {
  if (!Number.isSafeInteger(value) || value < 0) return DEFAULT_SUBAGENT_RECEIPT_ENROLLMENT_MAX_AGE_MS;
  return Math.min(value, DEFAULT_SUBAGENT_RECEIPT_ENROLLMENT_MAX_AGE_MS);
}

function hasFreshStartedReceipt(observedAt, nowMilliseconds, maxAgeMs) {
  const observed = Date.parse(observedAt);
  return Number.isFinite(observed)
    && observed <= nowMilliseconds
    && nowMilliseconds - observed <= maxAgeMs;
}

function emptyResult(status = "available") {
  return {
    status,
    candidates: [],
    malformed_count: 0,
    unsafe_thread_ids: [],
    replayed_count: 0,
    conflicted_count: 0,
    terminal_count: 0
  };
}

function knownAgentId(identity) {
  return exactId(identity?.agent_id);
}

function projectIdentity(identity) {
  const knownAgent = knownAgentId(identity);
  if (!hasExactKeys(identity, IDENTITY_KEYS)) return { kind: "malformed", agent_id: knownAgent };

  const sessionId = exactId(identity.session_id);
  const agentId = exactId(identity.agent_id);
  const turnId = identity.turn_id === null ? null : exactId(identity.turn_id);
  const observedAt = exactTimestamp(identity.observed_at);
  if (!sessionId || !agentId || agentId === sessionId || (identity.turn_id !== null && !turnId)
    || !optionalCode(identity.agent_type) || !observedAt || identity.result_state !== "result_pending") {
    return { kind: "malformed", agent_id: knownAgent };
  }

  if (identity.source_event === "SubagentStart" && identity.lifecycle_state === "started") {
    return {
      kind: "started",
      agent_id: agentId,
      parent_thread_id: sessionId,
      observed_at: observedAt
    };
  }
  if (identity.source_event === "SubagentStop" && identity.lifecycle_state === "observed_at_stop") {
    return {
      kind: "terminal",
      agent_id: agentId,
      parent_thread_id: sessionId,
      observed_at: observedAt
    };
  }
  return { kind: "unsupported", agent_id: agentId, observed_at: observedAt };
}

function compareObservation(left, right) {
  const timestamp = left.observed_at.localeCompare(right.observed_at, "en");
  if (timestamp !== 0) return timestamp;
  const leftRank = left.kind === "started" ? STATE_RANK.started : left.kind === "terminal" ? STATE_RANK.observed_at_stop : STATE_RANK.ended;
  const rightRank = right.kind === "started" ? STATE_RANK.started : right.kind === "terminal" ? STATE_RANK.observed_at_stop : STATE_RANK.ended;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.parent_thread_id.localeCompare(right.parent_thread_id, "en");
}

export function isSubagentReceiptEnrollmentDisabled({ env = process.env } = {}) {
  return isTruthyEnvironmentValue(env?.[TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED]);
}

// The snapshot is produced from persisted lifecycle receipts by the meter.
// A child is eligible only when its latest exact agent identity is a
// SubagentStart receipt. The returned shape intentionally matches the Board's
// existing single-writer auto-enrollment reconciler.
export function collectExactSubagentStartReceiptLineage({
  source = null,
  env = process.env,
  now = Date.now,
  positiveLeaseMaxAgeMs = DEFAULT_SUBAGENT_RECEIPT_ENROLLMENT_MAX_AGE_MS
} = {}) {
  if (isSubagentReceiptEnrollmentDisabled({ env })) return emptyResult("disabled");
  if (source?.status !== "available" || !Array.isArray(source?.snapshot?.identities)) return emptyResult("hold");

  const result = emptyResult();
  const latestByAgent = new Map();
  const unsafe = new Set();
  const startParentsByAgent = new Map();
  const nowMilliseconds = observedNowMilliseconds(now);
  const maxAgeMs = safeMaxAge(positiveLeaseMaxAgeMs);

  for (const identity of source.snapshot.identities) {
    const projected = projectIdentity(identity);
    if (projected.kind === "malformed") {
      result.malformed_count += 1;
      if (projected.agent_id) unsafe.add(projected.agent_id);
      continue;
    }
    if (projected.kind === "unsupported") {
      // An agent-bearing receipt with an unsupported lifecycle state cannot
      // prove that the child is currently a new SubagentStart descendant.
      unsafe.add(projected.agent_id);
      continue;
    }

    if (projected.kind === "started") {
      const parents = startParentsByAgent.get(projected.agent_id) ?? new Set();
      parents.add(projected.parent_thread_id);
      startParentsByAgent.set(projected.agent_id, parents);
      if (parents.size > 1) unsafe.add(projected.agent_id);
    }
    const previous = latestByAgent.get(projected.agent_id);
    if (!previous) {
      latestByAgent.set(projected.agent_id, projected);
      continue;
    }
    if (compareObservation(projected, previous) === 0
      && projected.kind === previous.kind
      && projected.parent_thread_id === previous.parent_thread_id) {
      result.replayed_count += 1;
      continue;
    }
    if (compareObservation(projected, previous) > 0) latestByAgent.set(projected.agent_id, projected);
  }

  // Iterate every latest exact agent, not only agents that still have a start
  // identity in the compact snapshot. The Meter projection may contain only a
  // terminal identity for an agent after it replaces the earlier start.
  for (const [agentId, latest] of latestByAgent) {
    const parents = startParentsByAgent.get(agentId) ?? new Set();
    if (parents.size > 1) result.conflicted_count += 1;
    if (latest.kind === "terminal") {
      result.terminal_count += 1;
      // Terminal receipt evidence poisons the child for the whole refresh.
      // Otherwise a simultaneous stale app-server active edge could revive
      // the same exact ID when both structural sources are merged.
      unsafe.add(agentId);
      continue;
    }
    if (unsafe.has(agentId) || latest.kind !== "started") continue;
    if (!hasFreshStartedReceipt(latest.observed_at, nowMilliseconds, maxAgeMs)) continue;
    result.candidates.push({
      thread_id: agentId,
      parent_thread_id: latest.parent_thread_id,
      status_type: "active"
    });
  }

  result.candidates.sort((left, right) => left.thread_id.localeCompare(right.thread_id, "en"));
  result.unsafe_thread_ids = [...unsafe].sort((left, right) => left.localeCompare(right, "en"));
  return result;
}

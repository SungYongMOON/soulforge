import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const CODEX_ACTIVITY_SCHEMA = "soulforge.ai_usage_codex_activity_projection.v1";
export const CODEX_ACTIVITY_PATH = join("usage_activity", "current.json");
export const MAX_CODEX_ACTIVITY_PROJECTION_BYTES = 32 * 1024 * 1024; // 32 MB bounded read limit

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;

const ROOT_KEYS = [
  "schema_version", "generated_at", "coverage", "privacy",
  "issues", "totals", "threads", "reconciliation",
];
const COVERAGE_KEYS = [
  "scope", "session_file_count", "parsed_session_count", "issue_count",
  "thread_count", "turn_count",
];
const PRIVACY_KEYS = [
  "metadata_only", "prompt_captured", "reasoning_captured", "tool_payload_captured",
];
const TOTALS_KEYS = ["total_tokens"];
const THREAD_KEYS = [
  "thread_id", "turn_id", "observations", "total_tokens",
];
const OBSERVATION_KEYS = ["observed_at", "delta_tokens"];
const RECONCILIATION_KEYS = [
  "total_tokens", "thread_count", "turn_count", "observation_count",
];
const ISSUE_KEYS = ["code", "count"];

const USAGE_KEYS = [
  "input_tokens", "cached_input_tokens", "cache_write_input_tokens",
  "output_tokens", "reasoning_output_tokens", "total_tokens",
];

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function hasExactKeys(object, requiredKeys) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return false;
  const keys = Object.keys(object);
  return keys.length === requiredKeys.length && requiredKeys.every((k) => Object.hasOwn(object, k));
}

function parseUsageBlock(raw) {
  if (!raw || typeof raw !== "object" || !hasExactKeys(raw, USAGE_KEYS)) return null;
  for (const k of USAGE_KEYS) {
    if (!Number.isSafeInteger(raw[k]) || raw[k] < 0) return null;
  }
  if (raw.cached_input_tokens + raw.cache_write_input_tokens > raw.input_tokens) return null;
  if (raw.reasoning_output_tokens > raw.output_tokens) return null;
  if (raw.total_tokens !== raw.input_tokens + raw.output_tokens) return null;
  return {
    input_tokens: raw.input_tokens,
    cached_input_tokens: raw.cached_input_tokens,
    cache_write_input_tokens: raw.cache_write_input_tokens,
    output_tokens: raw.output_tokens,
    reasoning_output_tokens: raw.reasoning_output_tokens,
    total_tokens: raw.total_tokens,
  };
}

function usageBlocksEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.input_tokens === b.input_tokens
    && a.cached_input_tokens === b.cached_input_tokens
    && a.cache_write_input_tokens === b.cache_write_input_tokens
    && a.output_tokens === b.output_tokens
    && a.reasoning_output_tokens === b.reasoning_output_tokens
    && a.total_tokens === b.total_tokens
  );
}

function internalObservationsEqual(a, b) {
  if (a.observed_at !== b.observed_at) return false;
  if (a.delta_tokens !== b.delta_tokens) return false;
  if (!usageBlocksEqual(a.delta_usage, b.delta_usage)) return false;
  if (!usageBlocksEqual(a.cumulative_usage, b.cumulative_usage)) return false;
  return true;
}

export function collapseCodexActivityTurns(activityTurns = [], { isolateConflicts = false } = {}) {
  const threadMap = new Map();
  const conflictedKeys = new Set();
  const issueCountMap = new Map();

  const recordIssue = (code) => {
    issueCountMap.set(code, (issueCountMap.get(code) ?? 0) + 1);
  };

  for (const turn of activityTurns) {
    if (!turn || typeof turn !== "object") continue;

    if (turn.has_counter_regression) {
      recordIssue("codex_activity_counter_regression");
      continue;
    }

    const threadId = turn.thread_id;
    const turnId = turn.turn_id;
    if (!threadId || !turnId || !SAFE_ID.test(threadId) || !SAFE_ID.test(turnId)) {
      recordIssue("codex_activity_identity_invalid");
      continue;
    }

    const key = `${threadId}::${turnId}`;
    if (conflictedKeys.has(key)) continue;

    const rawObs = Array.isArray(turn.observations) ? turn.observations : [];
    const validObs = [];
    let turnTotal = 0;
    let partitionValid = true;

    for (const obs of rawObs) {
      if (!obs || typeof obs !== "object") {
        partitionValid = false;
        break;
      }
      const obsTime = obs.observed_at;
      if (!obsTime || !ISO_DATE.test(obsTime)) {
        partitionValid = false;
        break;
      }

      const deltaUsage = parseUsageBlock(obs.delta_usage);
      const cumUsage = parseUsageBlock(obs.cumulative_usage);
      if (!deltaUsage || !cumUsage) {
        partitionValid = false;
        break;
      }

      const deltaTokens = obs.delta_tokens;
      if (!Number.isSafeInteger(deltaTokens) || deltaTokens < 0 || deltaTokens !== deltaUsage.total_tokens) {
        partitionValid = false;
        break;
      }

      turnTotal += deltaTokens;
      validObs.push({
        observed_at: obsTime,
        delta_tokens: deltaTokens,
        delta_usage: deltaUsage,
        cumulative_usage: cumUsage,
      });
    }

    if (!partitionValid || validObs.length === 0) {
      recordIssue("codex_activity_partition_invalid");
      conflictedKeys.add(key);
      threadMap.delete(key);
      continue;
    }

    validObs.sort((a, b) => a.observed_at.localeCompare(b.observed_at, "en"));

    const rawFinalUsage = turn.usage ?? validObs.at(-1)?.cumulative_usage;
    const finalUsage = parseUsageBlock(rawFinalUsage);
    if (!finalUsage || finalUsage.total_tokens !== turnTotal) {
      recordIssue("codex_activity_partition_invalid");
      conflictedKeys.add(key);
      threadMap.delete(key);
      continue;
    }

    // Verify observation components sum to final usage components
    const obsSum = validObs.reduce((acc, o) => ({
      input_tokens: acc.input_tokens + o.delta_usage.input_tokens,
      cached_input_tokens: acc.cached_input_tokens + o.delta_usage.cached_input_tokens,
      cache_write_input_tokens: acc.cache_write_input_tokens + o.delta_usage.cache_write_input_tokens,
      output_tokens: acc.output_tokens + o.delta_usage.output_tokens,
      reasoning_output_tokens: acc.reasoning_output_tokens + o.delta_usage.reasoning_output_tokens,
      total_tokens: acc.total_tokens + o.delta_tokens,
    }), { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 });

    if (!usageBlocksEqual(obsSum, finalUsage)) {
      recordIssue("codex_activity_partition_invalid");
      conflictedKeys.add(key);
      threadMap.delete(key);
      continue;
    }

    const candidate = {
      thread_id: threadId,
      turn_id: turnId,
      internal_observations: validObs,
      observations: validObs.map((o) => ({
        observed_at: o.observed_at,
        delta_tokens: o.delta_tokens,
      })),
      total_tokens: turnTotal,
    };

    const existing = threadMap.get(key);
    if (!existing) {
      threadMap.set(key, candidate);
      continue;
    }

    // Check conflict vs replay vs progression
    let isConflict = false;
    const existingObsMap = new Map(existing.internal_observations.map((o) => [o.observed_at, o]));

    for (const incomingObs of validObs) {
      const matchedObs = existingObsMap.get(incomingObs.observed_at);
      if (matchedObs && !internalObservationsEqual(matchedObs, incomingObs)) {
        isConflict = true;
        break;
      }
    }

    if (isConflict) {
      recordIssue("codex_activity_observation_conflict");
      conflictedKeys.add(key);
      threadMap.delete(key);
      continue;
    }

    // If candidate has strictly more observations (and all matching are identical), advance
    if (validObs.length > existing.observations.length && turnTotal >= existing.total_tokens) {
      existing.internal_observations = validObs;
      existing.observations = validObs.map((o) => ({
        observed_at: o.observed_at,
        delta_tokens: o.delta_tokens,
      }));
      existing.total_tokens = turnTotal;
    }
  }

  // Remove any conflicted keys
  for (const k of conflictedKeys) {
    threadMap.delete(k);
  }

  const threads = [...threadMap.values()]
    .map(({ thread_id, turn_id, observations, total_tokens }) => ({
      thread_id,
      turn_id,
      observations,
      total_tokens,
    }))
    .sort((a, b) => (
      a.thread_id.localeCompare(b.thread_id, "en") || a.turn_id.localeCompare(b.turn_id, "en")
    ));

  const issues = [...issueCountMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => a.code.localeCompare(b.code, "en"));

  return { threads, issues };
}

export function createCodexActivityProjection(activityTurns = [], coverage = {}, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (!ISO_DATE.test(generatedAt)) fail("codex_activity_generated_at_invalid");

  const { threads, issues } = collapseCodexActivityTurns(activityTurns, {
    isolateConflicts: options.isolateConflicts ?? true,
  });

  let totalTokens = 0;
  let observationCount = 0;

  for (const thread of threads) {
    totalTokens += thread.total_tokens;
    observationCount += thread.observations.length;
  }

  const threadCount = new Set(threads.map((t) => t.thread_id)).size;
  const turnCount = threads.length;
  const issueCount = issues.reduce((sum, item) => sum + item.count, 0);

  const sessionFileCount = Number.isSafeInteger(Number(coverage.session_file_count)) && Number(coverage.session_file_count) >= 0
    ? Number(coverage.session_file_count)
    : 0;
  const parsedSessionCount = Number.isSafeInteger(Number(coverage.parsed_session_count)) && Number(coverage.parsed_session_count) >= 0
    ? Number(coverage.parsed_session_count)
    : 0;

  const projection = {
    schema_version: CODEX_ACTIVITY_SCHEMA,
    generated_at: generatedAt,
    coverage: {
      scope: coverage.scope === "scoped_thread_selection" ? "scoped_thread_selection" : "full_sessions_root",
      session_file_count: sessionFileCount,
      parsed_session_count: parsedSessionCount,
      issue_count: issueCount,
      thread_count: threadCount,
      turn_count: turnCount,
    },
    privacy: {
      metadata_only: true,
      prompt_captured: false,
      reasoning_captured: false,
      tool_payload_captured: false,
    },
    issues,
    totals: {
      total_tokens: totalTokens,
    },
    threads,
    reconciliation: {
      total_tokens: totalTokens,
      thread_count: threadCount,
      turn_count: turnCount,
      observation_count: observationCount,
    },
  };

  return validateCodexActivityProjection(projection);
}

export function validateCodexActivityProjection(projection, { failClosed = true } = {}) {
  const invalid = (code) => {
    if (failClosed) fail(code);
    return null;
  };

  if (!hasExactKeys(projection, ROOT_KEYS)) return invalid("codex_activity_root_keys_invalid");
  if (projection.schema_version !== CODEX_ACTIVITY_SCHEMA) return invalid("codex_activity_schema_invalid");
  if (!ISO_DATE.test(projection.generated_at)) return invalid("codex_activity_generated_at_invalid");

  if (!hasExactKeys(projection.coverage, COVERAGE_KEYS)) return invalid("codex_activity_coverage_invalid");
  if (!["full_sessions_root", "scoped_thread_selection"].includes(projection.coverage.scope)) return invalid("codex_activity_scope_invalid");

  const cov = projection.coverage;
  if (!Number.isSafeInteger(cov.session_file_count) || cov.session_file_count < 0
    || !Number.isSafeInteger(cov.parsed_session_count) || cov.parsed_session_count < 0
    || !Number.isSafeInteger(cov.issue_count) || cov.issue_count < 0
    || !Number.isSafeInteger(cov.thread_count) || cov.thread_count < 0
    || !Number.isSafeInteger(cov.turn_count) || cov.turn_count < 0) {
    return invalid("codex_activity_coverage_counts_invalid");
  }

  if (!hasExactKeys(projection.privacy, PRIVACY_KEYS)
    || projection.privacy.metadata_only !== true
    || projection.privacy.prompt_captured !== false
    || projection.privacy.reasoning_captured !== false
    || projection.privacy.tool_payload_captured !== false) {
    return invalid("codex_activity_privacy_invalid");
  }

  if (!hasExactKeys(projection.totals, TOTALS_KEYS)
    || !Number.isSafeInteger(projection.totals.total_tokens)
    || projection.totals.total_tokens < 0) {
    return invalid("codex_activity_totals_invalid");
  }

  if (!Array.isArray(projection.issues) || !Array.isArray(projection.threads)) {
    return invalid("codex_activity_arrays_invalid");
  }

  const seenIssueCodes = new Set();
  let totalIssueCount = 0;
  for (const issue of projection.issues) {
    if (!hasExactKeys(issue, ISSUE_KEYS)
      || typeof issue.code !== "string"
      || !SAFE_ID.test(issue.code)
      || issue.code.length > 120
      || !Number.isSafeInteger(issue.count)
      || issue.count < 1) {
      return invalid("codex_activity_issues_invalid");
    }
    if (seenIssueCodes.has(issue.code)) return invalid("codex_activity_issues_duplicate");
    seenIssueCodes.add(issue.code);
    totalIssueCount += issue.count;
  }
  if (cov.issue_count !== totalIssueCount) return invalid("codex_activity_issue_count_mismatch");

  let threadTokensSum = 0;
  let obsCount = 0;
  const seenTurns = new Set();
  const uniqueThreads = new Set();

  for (const thread of projection.threads) {
    if (!hasExactKeys(thread, THREAD_KEYS)) return invalid("codex_activity_thread_keys_invalid");
    if (!SAFE_ID.test(thread.thread_id) || !SAFE_ID.test(thread.turn_id)) return invalid("codex_activity_thread_id_invalid");
    if (!Number.isSafeInteger(thread.total_tokens) || thread.total_tokens < 0) {
      return invalid("codex_activity_thread_total_invalid");
    }
    if (!Array.isArray(thread.observations)) return invalid("codex_activity_observations_invalid");

    const turnKey = `${thread.thread_id}::${thread.turn_id}`;
    if (seenTurns.has(turnKey)) return invalid("codex_activity_thread_duplicate");
    seenTurns.add(turnKey);
    uniqueThreads.add(thread.thread_id);

    let threadObsTotal = 0;
    let prevObsTime = "";

    for (const obs of thread.observations) {
      obsCount += 1;
      if (!hasExactKeys(obs, OBSERVATION_KEYS)
        || typeof obs.observed_at !== "string"
        || !ISO_DATE.test(obs.observed_at)
        || obs.observed_at < prevObsTime
        || !Number.isSafeInteger(obs.delta_tokens)
        || obs.delta_tokens < 0) {
        return invalid("codex_activity_observation_invalid");
      }
      prevObsTime = obs.observed_at;
      threadObsTotal += obs.delta_tokens;
    }

    if (threadObsTotal !== thread.total_tokens) {
      return invalid("codex_activity_thread_total_mismatch");
    }

    threadTokensSum += thread.total_tokens;
  }

  if (threadTokensSum !== projection.totals.total_tokens) {
    return invalid("codex_activity_reconciliation_total_mismatch");
  }

  if (cov.turn_count !== projection.threads.length || cov.thread_count !== uniqueThreads.size) {
    return invalid("codex_activity_coverage_count_mismatch");
  }

  const rec = projection.reconciliation;
  if (!rec
    || !hasExactKeys(rec, RECONCILIATION_KEYS)
    || rec.total_tokens !== projection.totals.total_tokens
    || rec.observation_count !== obsCount
    || rec.turn_count !== projection.threads.length
    || rec.thread_count !== uniqueThreads.size) {
    return invalid("codex_activity_reconciliation_block_invalid");
  }

  return projection;
}

export async function persistCodexActivityProjection(stateRoot, projection, options = {}) {
  const validated = validateCodexActivityProjection(projection);
  const targetPath = join(stateRoot, CODEX_ACTIVITY_PATH);
  const targetDir = dirname(targetPath);

  await mkdir(targetDir, { recursive: true });

  try {
    const st = await lstat(targetPath);
    if (st.isSymbolicLink() || !st.isFile()) {
      fail("codex_activity_unsafe_target");
    }
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }

  const tempPath = join(
    targetDir,
    `current.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );

  const payload = `${JSON.stringify(validated, null, 2)}\n`;

  try {
    await writeFile(tempPath, payload, "utf8");
    await rename(tempPath, targetPath);
    return validated;
  } catch (error) {
    try {
      await rm(tempPath, { force: true });
    } catch {}
    throw error;
  }
}

export async function loadCodexActivityProjection(stateRoot, { failClosed = true } = {}) {
  const targetPath = join(stateRoot, CODEX_ACTIVITY_PATH);
  try {
    const st = await lstat(targetPath);
    if (st.isSymbolicLink() || !st.isFile()) {
      fail("codex_activity_unsafe_target");
    }
    if (st.size > MAX_CODEX_ACTIVITY_PROJECTION_BYTES) {
      fail("codex_activity_oversized");
    }
    const raw = await readFile(targetPath, "utf8");
    const parsed = JSON.parse(raw);
    return validateCodexActivityProjection(parsed, { failClosed });
  } catch (error) {
    if (failClosed) {
      const err = new Error("codex_activity_projection_load_failed");
      err.code = "codex_activity_projection_load_failed";
      err.cause = error;
      throw err;
    }
    return null;
  }
}

import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { classifyBoundedHistory, planBoundedHistoryAppend } from "../src/core/bounded-observability-history.mjs";
import { findCodexSessionFiles } from "../../../../guild_hall/ai_usage_meter/usage_meter.mjs";

const execFileAsync = promisify(execFile);
export const DEFAULT_USAGE_PRODUCER_INTERVAL_MS = 5 * 60 * 1_000;
export const ACTIVE_CODEX_SESSION_MAX_AGE_MS = 15 * 60 * 1_000;
// A collector child had no bound at all, so one wedged process could hold the
// sweep's single-flight forever and every lane would silently stop aging.
//
// The bound is deliberately not tight: the Codex lane has been observed taking
// ~78s live, so a 90s bound would kill healthy work. 180s leaves real headroom
// over that observation while still terminating a wedged child.
//
// A slow sweep may therefore outrun the five-minute interval and skip one
// overlapping tick, which is correct and self-correcting: trigger() simply
// returns the in-flight sweep. What cannot happen is a permanent wedge, because
// every child is bounded, so the sweep always terminates and always releases
// single-flight for the next interval.
export const DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS = 180 * 1_000;
export const USAGE_PRODUCER_CYCLE_SCHEMA = "soulforge.ai_usage_producer_cycle.v1";
export const USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA = "soulforge.ai_usage_producer_cycle_history.v1";
export const USAGE_PRODUCER_CYCLE_HISTORY_LIMIT = 50;
// A bounded read to match the bounded write: the history is read back on every
// cycle, so an oversized, symlinked, or non-regular entry is refused before any
// byte is parsed. 50 cycle rows with eight lanes each sit well under this.
export const USAGE_PRODUCER_CYCLE_MAX_BYTES = 128 * 1024;
// Fixed lane vocabulary. A cycle receipt names lanes only from this list, so it
// can never grow a path, command line, session id, or provider payload.
export const USAGE_PRODUCER_LANES = Object.freeze([
  "lifecycle",
  "codex",
  "claude",
  "antigravity",
  "meter",
  "store_usage_ledger",
  "watchtower",
  "active_sessions",
]);
export const USAGE_PRODUCER_LANE_STATUSES = Object.freeze(["ok", "error", "skipped"]);

const SAFE_THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SAFE_ERROR_CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/u;
const HEARTBEAT_SCHEMA = "soulforge.ai_usage_producer_heartbeat.v1";
const ANTIGRAVITY_RESULT_SCHEMA = "soulforge.ai_usage_meter_collect_antigravity_result.v1";
export const CODEX_COLLECT_RESULT_SCHEMA = "soulforge.ai_usage_meter_collect_result.v1";

const EXACT_COLLECT_ROOT_KEYS = Object.freeze([
  "schema_version",
  "mode",
  "session_file_count",
  "parsed_session_count",
  "issue_count",
  "issues",
  "observed_event_count",
  "duplicate_event_observation_count",
  "event_count",
  "summary",
  "persistence",
  "coverage",
]);

const EXACT_SUMMARY_ROOT_KEYS = Object.freeze([
  "schema_version",
  "totals",
  "by_organization",
  "by_team",
  "by_project",
  "by_work",
  "by_model",
  "by_agent",
  "by_node",
  "by_role",
  "by_reasoning_effort",
  "by_attribution",
  "by_measurement",
]);

const SUMMARY_ARRAY_FIELDS = Object.freeze([
  "by_organization",
  "by_team",
  "by_project",
  "by_work",
  "by_model",
  "by_agent",
  "by_node",
  "by_role",
  "by_reasoning_effort",
  "by_attribution",
  "by_measurement",
]);

function failCollect(code = "collector_result_invalid") {
  throw Object.assign(new Error(code), { code });
}

function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function assertExactKeys(obj, expectedKeys) {
  if (!isPlainObject(obj)) failCollect();
  const keys = Object.keys(obj);
  if (keys.length !== expectedKeys.length || !expectedKeys.every((k) => Object.hasOwn(obj, k))) {
    failCollect();
  }
}

function assertNonNegativeInt(val) {
  if (!Number.isSafeInteger(val) || val < 0) failCollect();
  return val;
}

function isSafeSourceRef(ref) {
  return typeof ref === "string"
    && ref.length >= 1
    && ref.length <= 240
    && /^[\x20-\x7e]+$/u.test(ref)
    && !ref.includes("\\")
    && !/^[a-zA-Z]:/u.test(ref)
    && !ref.startsWith("/")
    && !ref.includes("..")
    && !/(?:^|\/)\.(?:\/|$)/u.test(ref)
    && !ref.includes("@")
    && !/(?:bearer|token|password|passwd|secret|api_key|credential)/iu.test(ref);
}

export function validateCodexCollectionResult(result) {
  let value;
  try {
    value = JSON.parse(String(result?.stdout ?? ""));
  } catch {
    failCollect();
  }

  assertExactKeys(value, EXACT_COLLECT_ROOT_KEYS);

  if (value.schema_version !== CODEX_COLLECT_RESULT_SCHEMA || value.mode !== "apply") {
    failCollect();
  }

  const sessionFileCount = assertNonNegativeInt(value.session_file_count);
  const parsedSessionCount = assertNonNegativeInt(value.parsed_session_count);
  const issueCount = assertNonNegativeInt(value.issue_count);
  const observedEventCount = assertNonNegativeInt(value.observed_event_count);
  assertNonNegativeInt(value.duplicate_event_observation_count);
  const eventCount = assertNonNegativeInt(value.event_count);

  if (parsedSessionCount > sessionFileCount || eventCount > observedEventCount) {
    failCollect();
  }

  if (!Array.isArray(value.issues) || value.issues.length !== issueCount || value.issues.length > 10000) {
    failCollect();
  }

  for (const issue of value.issues) {
    assertExactKeys(issue, ["source_ref", "code"]);
    if (typeof issue.code !== "string" || !SAFE_ERROR_CODE.test(issue.code) || !isSafeSourceRef(issue.source_ref)) {
      failCollect();
    }
  }

  const summary = value.summary;
  assertExactKeys(summary, EXACT_SUMMARY_ROOT_KEYS);
  if (summary.schema_version !== "soulforge.ai_usage_summary.v1" || !isPlainObject(summary.totals)) {
    failCollect();
  }
  if (assertNonNegativeInt(summary.totals.turns) !== eventCount) {
    failCollect();
  }
  for (const field of SUMMARY_ARRAY_FIELDS) {
    if (!Array.isArray(summary[field])) failCollect();
  }

  if (value.persistence !== null && !isPlainObject(value.persistence)) failCollect();
  if (value.coverage !== null && !isPlainObject(value.coverage)) failCollect();

  return value;
}

function validateAntigravityCollectionResult(result) {
  let value;
  try {
    value = JSON.parse(String(result?.stdout ?? ""));
  } catch {
    failCollect("antigravity_result_invalid");
  }
  if (value?.schema_version !== ANTIGRAVITY_RESULT_SCHEMA
    || value?.mode !== "apply"
    || !Number.isSafeInteger(value?.conversation_db_count)
    || value.conversation_db_count < 0
    || !Number.isSafeInteger(value?.issue_count)
    || value.issue_count < 0
    || !Number.isSafeInteger(value?.event_count)
    || value.event_count < 0) {
    failCollect("antigravity_result_invalid");
  }
  if (value.issue_count > 0) {
    failCollect("antigravity_collection_partial");
  }
  return value;
}

function safeErrorCode(error) {
  // A timeout kill is checked before anything else: the child was terminated by
  // us, so whatever it managed to print is not the reason it failed.
  if (error?.killed === true) return "collector_timeout";
  try {
    const childError = JSON.parse(String(error?.stderr ?? ""))?.error;
    if (typeof childError === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/u.test(childError)) return childError;
  } catch {}
  const code = error?.code;
  if (typeof code === "string" && /^[A-Za-z0-9_.:-]{1,80}$/u.test(code)) return code;
  if (Number.isSafeInteger(code) && code >= 0 && code <= 255) return `collector_exit_${code}`;
  return "collector_failed";
}

// A lane receipt channel is independent from the sweep. A failed write must not
// abort the remaining lanes or escape as a process-level rejection, so the lane
// simply stays at its prior value and ages out fail-closed.
async function persistLaneHealth(persistHeartbeat, options) {
  try {
    await persistHeartbeat(options);
  } catch {
    // Intentionally contained; only sanitized codes are ever persisted.
  }
}

// The companion runs inside the Board runtime, which deliberately exits on an
// unhandled rejection. Every collector failure must therefore terminate here as
// a fail-closed hold carrying only a sanitized code, never raw error text.
export function containSweepFailure(runSweep) {
  return Promise.resolve()
    .then(runSweep)
    .catch((error) => ({ status: "hold", error_code: safeErrorCode(error) }));
}

async function readHeartbeat(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return value?.schema_version === HEARTBEAT_SCHEMA ? value : null;
  } catch { return null; }
}

async function writeHeartbeat(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export async function persistProducerHeartbeat({ stateRoot, lane, attemptedAt, succeeded, errorCode = null, activity = null, projectionAt = null, now = () => new Date() } = {}) {
  const file = path.join(stateRoot, "producer_health", `${lane}.json`);
  const prior = await readHeartbeat(file);
  const completedAt = now().toISOString();
  const value = {
    schema_version: HEARTBEAT_SCHEMA,
    lane,
    status: succeeded ? "ok" : "error",
    attempted_at: attemptedAt,
    completed_at: completedAt,
    last_success_at: succeeded ? completedAt : prior?.last_success_at ?? null,
    error_codes: succeeded ? [] : [errorCode],
    activity_changed: typeof activity === "boolean" ? activity : null,
    projection_at: typeof projectionAt === "string" && Number.isFinite(Date.parse(projectionAt)) ? projectionAt : null,
  };
  await writeHeartbeat(file, value);
  return value;
}

// Every collector child gets the same bounded shape, so no lane can outlive the
// sweep that owns it.
function childOptions(repoRoot, childTimeoutMs) {
  const timeout = Number.isSafeInteger(childTimeoutMs) && childTimeoutMs > 0
    ? childTimeoutMs
    : DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS;
  return { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout };
}

function safeLaneStatus(value) {
  return USAGE_PRODUCER_LANE_STATUSES.includes(value) ? value : "error";
}

// A cycle receipt is the producer's own liveness evidence: it says a sweep
// started, and later how long it took and how each lane ended. The per-lane
// heartbeats stay unchanged and remain the authority for lane freshness.
export function createUsageProducerCycleRecord({
  cycleState,
  attemptedAt,
  completedAt = null,
  durationMs = null,
  lanes = [],
} = {}) {
  const state = cycleState === "started" || cycleState === "completed" ? cycleState : null;
  if (state === null || !Number.isFinite(Date.parse(attemptedAt ?? ""))) return null;
  return {
    schema_version: USAGE_PRODUCER_CYCLE_SCHEMA,
    cycle_state: state,
    attempted_at: attemptedAt,
    completed_at: state === "completed" && Number.isFinite(Date.parse(completedAt ?? "")) ? completedAt : null,
    duration_ms: state === "completed" && Number.isSafeInteger(durationMs) && durationMs >= 0 ? durationMs : null,
    lanes: state === "started" ? [] : USAGE_PRODUCER_LANES.map((lane) => {
      const row = lanes.find((candidate) => candidate?.lane === lane) ?? null;
      const status = row === null ? "skipped" : safeLaneStatus(row.status);
      const errorCode = typeof row?.error_code === "string" && SAFE_ERROR_CODE.test(row.error_code)
        ? row.error_code
        : null;
      return { lane, status, error_code: status === "error" ? errorCode ?? "collector_failed" : null };
    }),
  };
}

// A lane row is exact in itself and consistent with its own status: an error
// must carry a sanitized code, and a non-error must carry none. A row claiming
// "ok" beside an error code, or "error" with nothing to say, is not a weaker
// receipt — it is a contradictory one, so it fails the record outright.
function isUsageProducerLaneRow(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return false;
  const keys = ["lane", "status", "error_code"];
  if (Object.keys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key))) return false;
  if (!USAGE_PRODUCER_LANES.includes(row.lane) || !USAGE_PRODUCER_LANE_STATUSES.includes(row.status)) return false;
  if (row.status === "error") {
    return typeof row.error_code === "string" && SAFE_ERROR_CODE.test(row.error_code);
  }
  return row.error_code === null;
}

// The shape a cycle receipt is allowed to take depends on which half of the
// cycle it reports. A "started" row that already carries a duration, or a
// "completed" row missing lanes, would let a partial or fabricated cycle read
// as a real one, so each state is validated against its own exact contract
// rather than a permissive union of both.
export function isUsageProducerCycleRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = ["schema_version", "cycle_state", "attempted_at", "completed_at", "duration_ms", "lanes"];
  if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return false;
  if (value.schema_version !== USAGE_PRODUCER_CYCLE_SCHEMA) return false;
  if (!["started", "completed"].includes(value.cycle_state)) return false;
  const attemptedMs = Date.parse(value.attempted_at ?? "");
  if (!Number.isFinite(attemptedMs)) return false;
  if (!Array.isArray(value.lanes) || !value.lanes.every(isUsageProducerLaneRow)) return false;

  if (value.cycle_state === "started") {
    // Nothing about the outcome exists yet, so nothing about it may be claimed.
    return value.completed_at === null
      && value.duration_ms === null
      && value.lanes.length === 0;
  }

  const completedMs = Date.parse(value.completed_at ?? "");
  if (!Number.isFinite(completedMs) || completedMs < attemptedMs) return false;
  if (!Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0) return false;
  // Exactly one row per fixed lane: no duplicate, no omission, no extra.
  if (value.lanes.length !== USAGE_PRODUCER_LANES.length) return false;
  const seen = new Set(value.lanes.map((row) => row.lane));
  return seen.size === value.lanes.length
    && USAGE_PRODUCER_LANES.every((lane) => seen.has(lane));
}

// A missing history is a safe first write. A present-but-untrustworthy one is
// evidence in its own right and must survive untouched, so the two cases are
// reported apart rather than collapsed into "nothing usable".
async function probeCycleHistory(file, fsOps) {
  const readOps = { lstat, readFile, ...fsOps };
  let info;
  try {
    info = await readOps.lstat(file);
  } catch (error) {
    return error?.code === "ENOENT"
      ? { presence: "missing", value: null }
      : { presence: "unreadable", value: null };
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > USAGE_PRODUCER_CYCLE_MAX_BYTES) {
    return { presence: "unreadable", value: null };
  }
  try {
    return { presence: "present", value: JSON.parse(await readOps.readFile(file, "utf8")) };
  } catch (error) {
    return error?.code === "ENOENT"
      ? { presence: "missing", value: null }
      : { presence: "unreadable", value: null };
  }
}

// Latest plus one bounded history file. Two files total per state root, so a
// resident producer cannot grow an unbounded evidence directory.
export async function persistProducerCycleReceipt({
  stateRoot,
  record,
  historyLimit = USAGE_PRODUCER_CYCLE_HISTORY_LIMIT,
  fsOps = {},
} = {}) {
  if (!path.isAbsolute(stateRoot ?? "") || !isUsageProducerCycleRecord(record)) return null;
  const directory = path.join(stateRoot, "producer_health");
  const latestFile = path.join(directory, "cycle.json");
  const historyFile = path.join(directory, "cycle-history.json");
  // Latest and history are written independently. The sweep's current liveness
  // must stay visible even when the history cannot be safely appended, and a
  // corrupt history is never overwritten to force the write through.
  let plan;
  try {
    const probe = await probeCycleHistory(historyFile, fsOps);
    plan = planBoundedHistoryAppend({
      classified: classifyBoundedHistory({
        presence: probe.presence,
        value: probe.value,
        schemaVersion: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA,
        isEntry: isUsageProducerCycleRecord,
      }),
      entry: record,
      schemaVersion: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA,
      limit: historyLimit,
      isEntry: isUsageProducerCycleRecord,
    });
  } catch {
    plan = { outcome: "preserved", record: null, reason: "history_plan_failed" };
  }
  let latestOutcome = "written";
  try {
    await writeHeartbeat(latestFile, record);
  } catch {
    // Cycle evidence is best effort; it must never abort or delay collection.
    latestOutcome = "latest_write_failed";
  }
  let historyOutcome = plan.outcome;
  let historyReason = plan.reason;
  if (plan.record !== null) {
    try {
      await writeHeartbeat(historyFile, plan.record);
    } catch {
      historyOutcome = "preserved";
      historyReason = "history_write_failed";
    }
  }
  return {
    record,
    latest_outcome: latestOutcome,
    history_outcome: historyOutcome,
    history_reason: historyReason,
  };
}

export function activeCodexSessionIds(lifecycle, { now = Date.now } = {}) {
  if (!Array.isArray(lifecycle?.identities)) return [];
  const referenceAt = now();
  const ids = lifecycle.identities.filter((entry) => {
    const observedAt = Date.parse(entry?.observed_at);
    return entry?.lifecycle_state === "started"
      && Number.isFinite(observedAt)
      && observedAt <= referenceAt
      && referenceAt - observedAt <= ACTIVE_CODEX_SESSION_MAX_AGE_MS;
  }).map((entry) => entry?.session_id);
  return ids.every((id) => typeof id === "string" && SAFE_THREAD_ID.test(id))
    ? [...new Set(ids)].sort((left, right) => left.localeCompare(right, "en"))
    : [];
}

export async function loadActiveCodexSessionFiles({ stateRoot, sessionsRoot = path.join(process.env.CODEX_HOME || path.join(process.env.USERPROFILE || "", ".codex"), "sessions"), now = Date.now } = {}) {
  if (!path.isAbsolute(stateRoot ?? "") || !path.isAbsolute(sessionsRoot ?? "")) return [];
  const lifecycle = await readFile(path.join(stateRoot, "lifecycle", "current.json"), "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({ identities: [] }));
  const activeIds = new Set(activeCodexSessionIds(lifecycle, { now }));
  const referenceAt = now();
  const selected = [];
  for (const file of await findCodexSessionFiles(sessionsRoot)) {
    const lifecycleActive = [...activeIds].some((id) => file.endsWith(`-${id}.jsonl`));
    const recentlyWritten = await stat(file)
      .then((info) => Number.isFinite(info.mtimeMs)
        && info.mtimeMs <= referenceAt
        && referenceAt - info.mtimeMs <= ACTIVE_CODEX_SESSION_MAX_AGE_MS)
      .catch(() => false);
    if (lifecycleActive || recentlyWritten) selected.push(file);
  }
  return selected;
}

export async function loadCurrentThreadIds(registryPath) {
  if (!path.isAbsolute(registryPath ?? "")) return [];
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  if (!Array.isArray(registry?.entries)) return [];
  const ids = registry.entries
    .filter((entry) => entry?.lifecycle === "current" || entry?.lifecycle === "accepted")
    .map((entry) => entry?.thread_id);
  return ids.every((threadId) => typeof threadId === "string" && SAFE_THREAD_ID.test(threadId))
    ? [...new Set(ids)].sort((left, right) => left.localeCompare(right, "en"))
    : [];
}

export async function runClaudeQuotaSweep({
  repoRoot,
  projectRoot = repoRoot,
  run = execFileAsync,
  childTimeoutMs = DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS,
} = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(projectRoot ?? "")) {
    return { status: "hold", error_code: "quota_root_unavailable" };
  }
  const collector = path.join(repoRoot, "ui-workspace", "apps", "team-ops-board", "src", "server", "claude-oauth-usage-collector.mjs");
  const stateRoot = path.join(projectRoot, "guild_hall", "state", "operations", "provider_quota", "claude");
  try {
    await run(process.execPath, [
      collector,
      "--gate-path", path.join(stateRoot, "oauth", "enabled.v1.json"),
      "--receipt-path", path.join(stateRoot, "statusline", "provider_quota.receipt.v1.json"),
    ], childOptions(repoRoot, childTimeoutMs));
    return { status: "observed" };
  } catch (error) {
    return { status: "hold", error_code: safeErrorCode(error) };
  }
}

export async function runUsageProducerSweep({ repoRoot, projectRoot = repoRoot, stateRoot, watchtowerPointerPath, threadIds = [], run = execFileAsync, loadActiveFiles = loadActiveCodexSessionFiles, loadSnapshot = async () => JSON.parse(await readFile(path.join(stateRoot, "current.json"), "utf8")), persistHeartbeat = persistProducerHeartbeat, persistCycle = persistProducerCycleReceipt, childTimeoutMs = DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS, now = () => new Date() } = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(projectRoot ?? "") || !path.isAbsolute(stateRoot ?? "")) {
    return { status: "hold", completed: 0 };
  }
  const cli = path.join(repoRoot, "guild_hall", "ai_usage_meter", "cli.mjs");
  const watchtowerCli = path.join(repoRoot, "guild_hall", "watchtower", "cli.mjs");
  const options = childOptions(repoRoot, childTimeoutMs);
  let completed = 0;
  let projectionCommandSucceeded = false;
  const attemptedAt = now().toISOString();
  const laneRows = new Map();
  const observeLane = (lane, status, errorCode = null) => {
    laneRows.set(lane, { lane, status, error_code: errorCode });
  };
  // The started receipt is written before any child exists, so a sweep that
  // never returns still leaves proof that it was attempted and when.
  await Promise.resolve(persistCycle({
    stateRoot,
    record: createUsageProducerCycleRecord({ cycleState: "started", attemptedAt }),
  })).catch(() => null);
  let priorDigest = null;
  let priorEventCount = null;
  try {
    const priorSnapshot = await loadSnapshot();
    priorDigest = priorSnapshot?.events_digest ?? null;
    priorEventCount = Number.isSafeInteger(priorSnapshot?.event_count) ? priorSnapshot.event_count : null;
  } catch {}
  const lifecycleArgs = threadIds.length > 0
    ? [cli, "lifecycle-reconcile", ...threadIds.flatMap((threadId) => ["--thread-id", threadId]), "--state-root", stateRoot, "--apply"]
    : null;
  const commands = [
    lifecycleArgs,
    [cli, "collect", "--project-root", projectRoot, "--state-root", stateRoot, "--apply"],
    [cli, "collect-claude", "--state-root", stateRoot, "--max-age-days", "2", "--apply"],
    [cli, "collect-antigravity", "--state-root", stateRoot, "--max-age-days", "2", "--apply"],
  ].filter(Boolean);
  const commandLanes = new Map([
    ["lifecycle-reconcile", "lifecycle"],
    ["collect", "codex"],
    ["collect-claude", "claude"],
    ["collect-antigravity", "antigravity"],
  ]);
  for (const args of commands) {
    const command = args[0] === cli ? args[1] : null;
    try {
      const result = await run(process.execPath, args, options);
      if (command === "collect-antigravity") validateAntigravityCollectionResult(result);
      completed += 1;
      if (command === "collect-claude") {
        observeLane(commandLanes.get(command), "ok");
        projectionCommandSucceeded = true;
        await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "claude", attemptedAt, succeeded: true, now });
      } else if (command === "collect-antigravity") {
        observeLane(commandLanes.get(command), "ok");
        projectionCommandSucceeded = true;
        await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "antigravity", attemptedAt, succeeded: true, now });
      } else if (command === "collect") {
        let collectResult;
        try {
          collectResult = validateCodexCollectionResult(result);
        } catch {
          observeLane("codex", "error", "collector_result_invalid");
          await persistLaneHealth(persistHeartbeat, {
            stateRoot,
            lane: "codex",
            attemptedAt,
            succeeded: false,
            errorCode: "collector_result_invalid",
            now,
          });
          collectResult = null;
        }
        if (collectResult !== null) {
          const hasConflict = Array.isArray(collectResult.issues)
            && collectResult.issues.some((i) => i?.code === "usage_event_duplicate_conflict");
          if (hasConflict) {
            projectionCommandSucceeded = true;
            observeLane("codex", "error", "usage_event_duplicate_conflict");
            await persistLaneHealth(persistHeartbeat, {
              stateRoot,
              lane: "codex",
              attemptedAt,
              succeeded: false,
              errorCode: "usage_event_duplicate_conflict",
              now,
            });
          } else {
            observeLane("codex", "ok");
            projectionCommandSucceeded = true;
            await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "codex", attemptedAt, succeeded: true, now });
          }
        }
      } else {
        observeLane(commandLanes.get(command), "ok");
      }
    } catch (error) {
      // A timed-out lane fails closed with its own fixed code and leaves the
      // remaining lanes to run and report their own real result.
      observeLane(commandLanes.get(command), "error", safeErrorCode(error));
      if (command === "collect-claude") await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "claude", attemptedAt, succeeded: false, errorCode: safeErrorCode(error), now });
      if (command === "collect-antigravity") await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "antigravity", attemptedAt, succeeded: false, errorCode: safeErrorCode(error), now });
      if (command === "collect") {
        await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "codex", attemptedAt, succeeded: false, errorCode: safeErrorCode(error), now });
      }
      // Each producer remains fail-closed and the next interval retries it.
    }
  }
  let projectionResult;
  try {
    const snapshot = await loadSnapshot();
    if (!projectionCommandSucceeded || snapshot?.schema_version !== "soulforge.ai_usage_meter_snapshot.v1" || !Number.isFinite(Date.parse(snapshot.generated_at))) {
      throw Object.assign(new Error("ledger_projection_invalid"), { code: "ledger_projection_invalid" });
    }
    const activity = priorDigest !== null && typeof snapshot.events_digest === "string"
      ? snapshot.events_digest !== priorDigest
      : priorEventCount !== null && Number.isSafeInteger(snapshot.event_count)
        ? snapshot.event_count !== priorEventCount
        : null;
    projectionResult = { succeeded: true, activity, projectionAt: snapshot.generated_at };
  } catch (error) {
    projectionResult = { succeeded: false, errorCode: safeErrorCode(error) };
  }
  for (const lane of ["meter", "store_usage_ledger"]) {
    // Receipt channels are independent; one failed write must not falsify the other lane.
    await persistLaneHealth(persistHeartbeat, { stateRoot, lane, attemptedAt, ...projectionResult, now });
    // An idle window is a healthy sweep: activity=false is not an error.
    observeLane(lane, projectionResult.succeeded ? "ok" : "error", projectionResult.errorCode ?? null);
  }
  if (path.isAbsolute(watchtowerPointerPath ?? "")) {
    try {
      await run(process.execPath, [watchtowerCli, "probe", "--pointer", watchtowerPointerPath, "--json"], options);
      completed += 1;
      observeLane("watchtower", "ok");
    } catch (error) {
      // Observation failure is isolated from collection and retried next interval.
      observeLane("watchtower", "error", safeErrorCode(error));
    }
  }
  const activeFiles = await Promise.resolve(loadActiveFiles({ stateRoot })).catch(() => []);
  let activeFailures = 0;
  for (const sessionFile of activeFiles) {
    try {
      await run(process.execPath, [cli, "collect", "--project-root", projectRoot, "--session-file", sessionFile, "--state-root", stateRoot, "--include-active", "--apply"], options);
      completed += 1;
    } catch (error) {
      // One conflicting active session must not block other exact active sessions.
      activeFailures += 1;
      observeLane("active_sessions", "error", safeErrorCode(error));
    }
  }
  if (activeFiles.length > 0 && activeFailures === 0) observeLane("active_sessions", "ok");
  const expected = (lifecycleArgs === null ? 3 : 4)
    + (path.isAbsolute(watchtowerPointerPath ?? "") ? 1 : 0)
    + activeFiles.length;
  const completedAt = now().toISOString();
  const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(attemptedAt));
  await Promise.resolve(persistCycle({
    stateRoot,
    record: createUsageProducerCycleRecord({
      cycleState: "completed",
      attemptedAt,
      completedAt,
      durationMs: Number.isSafeInteger(durationMs) ? durationMs : null,
      lanes: [...laneRows.values()],
    }),
  })).catch(() => null);
  return { status: completed === expected ? "observed" : "partial", completed };
}

export function startUsageProducerCompanion({
  repoRoot,
  projectRoot = repoRoot,
  stateRoot,
  registryPath,
  watchtowerPointerPath,
  intervalMs = DEFAULT_USAGE_PRODUCER_INTERVAL_MS,
  sweep = runUsageProducerSweep,
  quotaSweep = runClaudeQuotaSweep,
  loadThreadIds = loadCurrentThreadIds,
} = {}) {
  let stopped = false;
  let inFlight = null;
  let quotaInFlight = null;
  const trigger = () => {
    if (stopped || inFlight !== null) return inFlight;
    inFlight = containSweepFailure(async () => {
      const threadIds = await Promise.resolve()
        .then(() => loadThreadIds(registryPath))
        .catch(() => []);
      return sweep({ repoRoot, projectRoot, stateRoot, watchtowerPointerPath, threadIds });
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
  const triggerQuota = () => {
    if (stopped || quotaInFlight !== null) return quotaInFlight;
    quotaInFlight = containSweepFailure(() => quotaSweep({ repoRoot, projectRoot }))
      .finally(() => { quotaInFlight = null; });
    return quotaInFlight;
  };
  void trigger();
  void triggerQuota();
  const timer = setInterval(() => { void trigger(); }, intervalMs);
  const quotaTimer = setInterval(() => { void triggerQuota(); }, intervalMs);
  timer.unref?.();
  quotaTimer.unref?.();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      clearInterval(quotaTimer);
      await Promise.all([
        inFlight?.catch(() => {}),
        quotaInFlight?.catch(() => {}),
      ]);
    },
  };
}

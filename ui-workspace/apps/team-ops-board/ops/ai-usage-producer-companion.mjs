import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { findCodexSessionFiles } from "../../../../guild_hall/ai_usage_meter/usage_meter.mjs";

const execFileAsync = promisify(execFile);
export const DEFAULT_USAGE_PRODUCER_INTERVAL_MS = 5 * 60 * 1_000;
export const ACTIVE_CODEX_SESSION_MAX_AGE_MS = 15 * 60 * 1_000;

const SAFE_THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const HEARTBEAT_SCHEMA = "soulforge.ai_usage_producer_heartbeat.v1";

function safeErrorCode(error) {
  try {
    const childError = JSON.parse(String(error?.stderr ?? ""))?.error;
    if (typeof childError === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/u.test(childError)) return childError;
  } catch {}
  const code = error?.code;
  if (typeof code === "string" && /^[A-Za-z0-9_.:-]{1,80}$/u.test(code)) return code;
  if (Number.isSafeInteger(code) && code >= 0 && code <= 255) return `collector_exit_${code}`;
  return "collector_failed";
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
  const lifecycle = JSON.parse(await readFile(path.join(stateRoot, "lifecycle", "current.json"), "utf8"));
  const activeIds = new Set(activeCodexSessionIds(lifecycle, { now }));
  return (await findCodexSessionFiles(sessionsRoot))
    .filter((file) => [...activeIds].some((id) => file.endsWith(`-${id}.jsonl`)));
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

export async function runUsageProducerSweep({ repoRoot, stateRoot, watchtowerPointerPath, threadIds = [], run = execFileAsync, loadActiveFiles = loadActiveCodexSessionFiles, loadSnapshot = async () => JSON.parse(await readFile(path.join(stateRoot, "current.json"), "utf8")), persistHeartbeat = persistProducerHeartbeat, now = () => new Date() } = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(stateRoot ?? "")) {
    return { status: "hold", completed: 0 };
  }
  const cli = path.join(repoRoot, "guild_hall", "ai_usage_meter", "cli.mjs");
  const claudeQuotaCollector = path.join(repoRoot, "ui-workspace", "apps", "team-ops-board", "src", "server", "claude-oauth-usage-collector.mjs");
  const claudeQuotaRoot = path.join(repoRoot, "guild_hall", "state", "operations", "provider_quota", "claude", "oauth");
  const watchtowerCli = path.join(repoRoot, "guild_hall", "watchtower", "cli.mjs");
  let completed = 0;
  let projectionCommandSucceeded = false;
  const attemptedAt = now().toISOString();
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
    [cli, "collect", "--state-root", stateRoot, "--apply"],
    [cli, "collect-claude", "--state-root", stateRoot, "--max-age-days", "2", "--apply"],
    [claudeQuotaCollector, "--gate-path", path.join(claudeQuotaRoot, "enabled.v1.json"), "--receipt-path", path.join(repoRoot, "guild_hall", "state", "operations", "provider_quota", "claude", "statusline", "provider_quota.receipt.v1.json")],
  ].filter(Boolean);
  for (const args of commands) {
    const command = args[0] === cli ? args[1] : null;
    try {
      await run(process.execPath, args, { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      completed += 1;
      if (command === "collect-claude") {
        projectionCommandSucceeded = true;
        await persistHeartbeat({ stateRoot, lane: "claude", attemptedAt, succeeded: true, now });
      }
      if (command === "collect") {
        projectionCommandSucceeded = true;
        await persistHeartbeat({ stateRoot, lane: "codex", attemptedAt, succeeded: true, now });
      }
    } catch (error) {
      if (command === "collect-claude") await persistHeartbeat({ stateRoot, lane: "claude", attemptedAt, succeeded: false, errorCode: safeErrorCode(error), now });
      if (command === "collect") {
        await persistHeartbeat({ stateRoot, lane: "codex", attemptedAt, succeeded: false, errorCode: safeErrorCode(error), now });
      }
      // Each producer remains fail-closed and the next interval retries it.
    }
  }
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
    await persistHeartbeat({ stateRoot, lane: "meter", attemptedAt, succeeded: true, activity, projectionAt: snapshot.generated_at, now });
  } catch (error) {
    await persistHeartbeat({ stateRoot, lane: "meter", attemptedAt, succeeded: false, errorCode: safeErrorCode(error), now });
  }
  if (path.isAbsolute(watchtowerPointerPath ?? "")) {
    try {
      await run(process.execPath, [watchtowerCli, "probe", "--pointer", watchtowerPointerPath, "--json"], { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      completed += 1;
    } catch {
      // Observation failure is isolated from collection and retried next interval.
    }
  }
  const activeFiles = await Promise.resolve(loadActiveFiles({ stateRoot })).catch(() => []);
  for (const sessionFile of activeFiles) {
    try {
      await run(process.execPath, [cli, "collect", "--session-file", sessionFile, "--state-root", stateRoot, "--include-active", "--apply"], { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      completed += 1;
    } catch {
      // One conflicting active session must not block other exact active sessions.
    }
  }
  const expected = (lifecycleArgs === null ? 3 : 4)
    + (path.isAbsolute(watchtowerPointerPath ?? "") ? 1 : 0)
    + activeFiles.length;
  return { status: completed === expected ? "observed" : "partial", completed };
}

export function startUsageProducerCompanion({
  repoRoot,
  stateRoot,
  registryPath,
  watchtowerPointerPath,
  intervalMs = DEFAULT_USAGE_PRODUCER_INTERVAL_MS,
  sweep = runUsageProducerSweep,
  loadThreadIds = loadCurrentThreadIds,
} = {}) {
  let stopped = false;
  let inFlight = null;
  const trigger = () => {
    if (stopped || inFlight !== null) return inFlight;
    inFlight = Promise.resolve(loadThreadIds(registryPath))
      .catch(() => [])
      .then((threadIds) => sweep({ repoRoot, stateRoot, watchtowerPointerPath, threadIds }))
      .finally(() => { inFlight = null; });
    return inFlight;
  };
  void trigger();
  const timer = setInterval(() => { void trigger(); }, intervalMs);
  timer.unref?.();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight?.catch(() => {});
    },
  };
}

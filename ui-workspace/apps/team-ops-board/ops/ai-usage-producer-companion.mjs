import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { findCodexSessionFiles } from "../../../../guild_hall/ai_usage_meter/usage_meter.mjs";

const execFileAsync = promisify(execFile);
export const DEFAULT_USAGE_PRODUCER_INTERVAL_MS = 5 * 60 * 1_000;
export const ACTIVE_CODEX_SESSION_MAX_AGE_MS = 15 * 60 * 1_000;

const SAFE_THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

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

export async function runUsageProducerSweep({ repoRoot, stateRoot, threadIds = [], run = execFileAsync, loadActiveFiles = loadActiveCodexSessionFiles } = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(stateRoot ?? "")) {
    return { status: "hold", completed: 0 };
  }
  const cli = path.join(repoRoot, "guild_hall", "ai_usage_meter", "cli.mjs");
  const claudeQuotaCollector = path.join(repoRoot, "ui-workspace", "apps", "team-ops-board", "src", "server", "claude-oauth-usage-collector.mjs");
  const claudeQuotaRoot = path.join(repoRoot, "guild_hall", "state", "operations", "provider_quota", "claude", "oauth");
  let completed = 0;
  const lifecycleArgs = threadIds.length > 0
    ? [cli, "lifecycle-reconcile", ...threadIds.flatMap((threadId) => ["--thread-id", threadId]), "--state-root", stateRoot, "--apply"]
    : null;
  for (const args of [
    lifecycleArgs,
    [cli, "collect", "--state-root", stateRoot, "--apply"],
    [cli, "collect-claude", "--state-root", stateRoot, "--max-age-days", "2", "--apply"],
    [claudeQuotaCollector, "--gate-path", path.join(claudeQuotaRoot, "enabled.v1.json"), "--receipt-path", path.join(repoRoot, "guild_hall", "state", "operations", "provider_quota", "claude", "statusline", "provider_quota.receipt.v1.json")],
  ].filter(Boolean)) {
    try {
      await run(process.execPath, args, { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      completed += 1;
    } catch {
      // Each producer remains fail-closed and the next interval retries it.
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
  const expected = (lifecycleArgs === null ? 3 : 4) + activeFiles.length;
  return { status: completed === expected ? "observed" : "partial", completed };
}

export function startUsageProducerCompanion({
  repoRoot,
  stateRoot,
  registryPath,
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
      .then((threadIds) => sweep({ repoRoot, stateRoot, threadIds }))
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

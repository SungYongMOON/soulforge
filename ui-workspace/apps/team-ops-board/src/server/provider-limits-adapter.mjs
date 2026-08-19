// provider-limits-adapter.mjs — loopback-only Board projection. Claude quota
// comes solely from the accepted sanitized receipt; this adapter never reads
// credentials, calls OAuth, invokes Orca, or writes the receipt cache.

import { open, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildOfficialProviderQuotaProjection } from "../core/provider-quota-snapshot.mjs";
import {
  buildProviderLimitsSnapshot,
  parseCodexRateLimitsFromJsonlText,
} from "../core/provider-limits.mjs";
import { createProviderQuotaAttemptLog } from "./provider-quota-attempt-log.mjs";
import { createProviderQuotaReceiptStore } from "./provider-quota-receipt-store.mjs";

export const PROVIDER_LIMITS_SNAPSHOT_PATH = "/provider-limits.snapshot.json";
export const DEFAULT_PROVIDER_LIMITS_TTL_MS = 60_000;
// The owned companion refreshes every five minutes; keep a small scheduling
// margin so valid evidence does not oscillate to STALE between sweeps.
export const DEFAULT_CLAUDE_QUOTA_FRESHNESS_MS = 6 * 60_000;

const CODEX_TAIL_BYTES = 262_144;
const CLAUDE_STATUSLINE_SOURCE = "claude_code_statusline_rate_limits";
const CLAUDE_COMPAT_SOURCE = "claude_orca_compat_receipt";
const CLAUDE_OAUTH_SOURCE = "claude_oauth_usage_sanitized";

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function defaultCodexSessionsRoot(env = process.env) {
  const home = typeof env.CODEX_HOME === "string" && env.CODEX_HOME.trim()
    ? env.CODEX_HOME.trim()
    : path.join(os.homedir(), ".codex");
  return path.join(home, "sessions");
}

async function latestNumericChild(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(right) - Number(left));
  return names.map((name) => path.join(root, name));
}

async function newestSessionFile(sessionsRoot, maxDays = 4) {
  let visitedDays = 0;
  for (const yearDir of await latestNumericChild(sessionsRoot)) {
    for (const monthDir of await latestNumericChild(yearDir)) {
      for (const dayDir of await latestNumericChild(monthDir)) {
        visitedDays += 1;
        const entries = await readdir(dayDir, { withFileTypes: true });
        const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
        let newest = null;
        for (const file of files) {
          const fullPath = path.join(dayDir, file.name);
          const stats = await stat(fullPath).catch(() => null);
          if (stats === null) continue;
          if (newest === null || stats.mtimeMs > newest.mtimeMs) newest = { path: fullPath, mtimeMs: stats.mtimeMs };
        }
        if (newest !== null) return newest.path;
        if (visitedDays >= maxDays) return null;
      }
    }
  }
  return null;
}

async function readTail(filePath, tailBytes) {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - tailBytes);
    const length = size - start;
    if (length <= 0) return "";
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readCodexLimits(sessionsRoot) {
  const file = await newestSessionFile(sessionsRoot);
  if (file === null) return null;
  return parseCodexRateLimitsFromJsonlText(await readTail(file, CODEX_TAIL_BYTES));
}

function emptyClaudeOfficialProjection() {
  return {
    capture_status: "hold",
    freshness: "unknown",
    source_kind: null,
    observed_at: null,
    five_hour: null,
    weekly: null,
    fable_weekly: null,
  };
}

function publicLimit(snapshot, limitId) {
  const limit = snapshot?.limits?.find((candidate) => candidate?.limit_id === limitId) ?? null;
  if (limit === null) return null;
  return {
    limit_id: limit.limit_id,
    percentage_kind: limit.percentage_kind,
    percentage: limit.percentage,
    window_minutes: limit.window_minutes,
    resets_at: limit.resets_at,
  };
}

function publicClaudeOfficialProjection(projection) {
  const snapshot = projection?.snapshot;
  if (snapshot === null || snapshot === undefined
    || ![CLAUDE_STATUSLINE_SOURCE, CLAUDE_COMPAT_SOURCE, CLAUDE_OAUTH_SOURCE].includes(snapshot.source_kind)) {
    return emptyClaudeOfficialProjection();
  }
  const publicProjection = {
    capture_status: projection.capture_status === "accepted" ? "accepted" : "hold",
    freshness: ["fresh", "stale", "unknown"].includes(projection.freshness) ? projection.freshness : "unknown",
    source_kind: snapshot.source_kind,
    observed_at: snapshot.observed_at,
    five_hour: publicLimit(snapshot, "claude_five_hour"),
    weekly: publicLimit(snapshot, "claude_weekly"),
    fable_weekly: [CLAUDE_COMPAT_SOURCE, CLAUDE_OAUTH_SOURCE].includes(snapshot.source_kind)
      ? publicLimit(snapshot, "claude_fable_weekly")
      : null,
  };
  // Partial evidence is intentionally not handed to the UI as a value.
  if (publicProjection.freshness === "unknown") return emptyClaudeOfficialProjection();
  return publicProjection;
}

function isRetainableClaudeOfficialProjection(value) {
  return value?.source_kind !== null
    && value?.observed_at !== null
    && value?.five_hour !== null
    && value?.weekly !== null
    && ["fresh", "stale"].includes(value?.freshness);
}

function asStaleClaudeOfficialProjection(value) {
  return isRetainableClaudeOfficialProjection(value)
    ? { ...value, capture_status: "hold", freshness: "stale" }
    : emptyClaudeOfficialProjection();
}

async function readClaudeOfficialProjection({ receiptStore, nowMs, freshnessMs }) {
  if (receiptStore === null) return buildOfficialProviderQuotaProjection({ snapshot: null, nowMs, freshnessMs });
  const cacheOnlyProjection = await receiptStore.readReadOnlyProjection();
  const snapshot = cacheOnlyProjection?.snapshot ?? null;
  if (![CLAUDE_STATUSLINE_SOURCE, CLAUDE_OAUTH_SOURCE].includes(snapshot?.source_kind)) return cacheOnlyProjection;
  // The only CURRENT path is a complete, digest-valid, bounded-age statusline
  // observation. It does not claim a connected or running Claude process.
  return buildOfficialProviderQuotaProjection({
    snapshot,
    sourceAvailable: true,
    nowMs,
    freshnessMs,
  });
}

export function createProviderLimitsReader({
  env = process.env,
  sessionsRoot = defaultCodexSessionsRoot(env),
  ttlMs = DEFAULT_PROVIDER_LIMITS_TTL_MS,
  claudeFreshnessMs = DEFAULT_CLAUDE_QUOTA_FRESHNESS_MS,
  providerQuotaReceiptPath = null,
  providerQuotaReceiptStore = null,
  providerQuotaAttemptLog = null,
  readCodexLimitsImpl = readCodexLimits,
  now = Date.now,
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastCodex = null;
  let lastClaudeOfficial = null;
  let lastSnapshot = null;
  const receiptStore = providerQuotaReceiptStore ?? (typeof providerQuotaReceiptPath === "string" && providerQuotaReceiptPath.length > 0
    ? createProviderQuotaReceiptStore({ receiptPath: providerQuotaReceiptPath, now })
    : null);
  // The attempt log lives beside the receipt and is read the same read-only
  // way: no directory creation, no provider call, no credential access.
  const attemptLog = providerQuotaAttemptLog ?? (typeof providerQuotaReceiptPath === "string" && providerQuotaReceiptPath.length > 0
    ? createProviderQuotaAttemptLog({ receiptDirectory: path.dirname(providerQuotaReceiptPath) })
    : null);

  async function refresh() {
    const codex = await readCodexLimitsImpl(sessionsRoot).catch(() => null);
    if (codex !== null) lastCodex = codex;
    const observedNow = now();
    let claudeOfficial;
    try {
      claudeOfficial = publicClaudeOfficialProjection(await readClaudeOfficialProjection({
        receiptStore,
        nowMs: observedNow,
        freshnessMs: claudeFreshnessMs,
      }));
    } catch {
      claudeOfficial = emptyClaudeOfficialProjection();
    }
    if (isRetainableClaudeOfficialProjection(claudeOfficial)) {
      lastClaudeOfficial = claudeOfficial;
    } else if (lastClaudeOfficial !== null) {
      claudeOfficial = asStaleClaudeOfficialProjection(lastClaudeOfficial);
    }
    // Attempt evidence is never retained across a failed read: an unreadable
    // log means the attempt state is unknown, not that the last one still holds.
    const latestAttempt = attemptLog === null
      ? null
      : await Promise.resolve(attemptLog.readLatest()).catch(() => null);
    // Only the two display fields cross this boundary. The stored result token
    // and provider id stay on the server side of the loopback endpoint.
    const claudeAttempt = latestAttempt === null
      ? null
      : { attempted_at: latestAttempt.attempted_at, result_class: latestAttempt.result_class };
    lastSnapshot = buildProviderLimitsSnapshot({
      codex: lastCodex,
      claudeOfficial,
      claudeAttempt,
      observedAtMs: observedNow,
    });
  }

  return {
    async readSnapshot() {
      const observedNow = now();
      if (lastAttemptAt !== null && observedNow - lastAttemptAt < ttlMs) return lastSnapshot;
      if (inFlight === null) {
        lastAttemptAt = observedNow;
        const operation = refresh()
          .catch(() => {})
          .finally(() => {
            if (inFlight === operation) inFlight = null;
          });
        inFlight = operation;
      }
      await inFlight;
      return lastSnapshot;
    },
  };
}

export function createProviderLimitsAdapterPlugin(options = {}) {
  const reader = createProviderLimitsReader(options);
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== PROVIDER_LIMITS_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      const respond = (snapshot) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(snapshot ?? null));
      };
      void reader.readSnapshot().then(respond, () => respond(null));
    });
  };
  return {
    name: "soulforge-provider-limits-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

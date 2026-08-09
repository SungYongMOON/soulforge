import { dirname, resolve } from "node:path";

import {
  loadReadOnlyBoardUsageProjection,
  validateReadOnlyBoardUsageProjection
} from "../../../../../guild_hall/ai_usage_meter/board_history_snapshot.mjs";

import {
  defaultThreadEnrollmentRegistryPath,
  isLiveThreadEnrollmentDisabled,
  readThreadEnrollmentRegistry
} from "../core/live-thread-enrollment.mjs";
import { AI_USAGE_PROJECTION_ENVELOPE_SCHEMA } from "../core/ai-usage-history-snapshot.mjs";

export const AI_USAGE_SNAPSHOT_PATH = "/ai-usage-meter.snapshot.json";
export const AI_USAGE_READ_ONLY_QUERY_KEY = "read_only";
// The adapter carries its own explicit diagnostics evidence-age policy to the
// Meter; it is never derived from the Board refresh/poll cadence.
export const DEFAULT_CLAUDE_FRESHNESS_THRESHOLD_SECONDS = 15 * 60;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const MAX_EXACT_THREAD_IDS = 100;

function safeNow(value) {
  const candidate = typeof value === "function" ? value() : value;
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

function exactThreadIds(threadIds) {
  if (!Array.isArray(threadIds)) return [];
  const ids = new Set();
  for (const threadId of threadIds) {
    if (typeof threadId !== "string" || !SAFE_ID.test(threadId)) return [];
    ids.add(threadId);
  }
  return [...ids].sort((left, right) => left.localeCompare(right, "en"));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function unavailableProjection(refreshState = "hold") {
  return {
    schema_version: AI_USAGE_PROJECTION_ENVELOPE_SCHEMA,
    refresh_state: refreshState,
    snapshot: null
  };
}

function claudeFreshnessThreshold(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 604_800) {
    throw new Error("ai_usage_claude_freshness_threshold_invalid");
  }
  return value;
}

// The Board may only read the existing Meter ledger projection. The returned
// value is the Meter's redacted read-only envelope, not a Board-authored copy.
export async function readExactScopedUsageProjection({
  stateRoot,
  threadIds,
  now = Date.now,
  claudeFreshnessThresholdSeconds = DEFAULT_CLAUDE_FRESHNESS_THRESHOLD_SECONDS,
  loadProjection = loadReadOnlyBoardUsageProjection
} = {}) {
  const exactIds = exactThreadIds(threadIds);
  if (!stateRoot || !exactIds.length || exactIds.length > MAX_EXACT_THREAD_IDS) {
    throw new Error("ai_usage_exact_scope_invalid");
  }
  const referenceAt = new Date(safeNow(now)).toISOString();
  const thresholdSeconds = claudeFreshnessThreshold(claudeFreshnessThresholdSeconds);
  const projection = await loadProjection(resolve(stateRoot), {
    threadIds: exactIds,
    generatedAt: referenceAt,
    referenceAt,
    claudeFreshnessThresholdSeconds: thresholdSeconds
  });
  return validateReadOnlyBoardUsageProjection(projection);
}

export function createAiUsageAdapter({
  registryPath = process.env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY || defaultThreadEnrollmentRegistryPath(),
  env = process.env,
  usageMeterStateRoot = process.env.SOULFORGE_AI_USAGE_METER_STATE_ROOT || resolve(dirname(registryPath), "..", "ai_usage_meter"),
  readUsageProjection = readExactScopedUsageProjection,
  now = Date.now,
  claudeFreshnessThresholdSeconds = DEFAULT_CLAUDE_FRESHNESS_THRESHOLD_SECONDS
} = {}) {
  async function enrolledScope() {
    const enrollment = await readThreadEnrollmentRegistry(registryPath);
    if (!enrollment.registry || enrollment.status !== "available" || isLiveThreadEnrollmentDisabled({ registry: enrollment.registry, env })) {
      return null;
    }
    const ids = exactThreadIds(enrollment.registry.entries
      .filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted")
      .map((entry) => entry.thread_id));
    return ids.length > 0 && ids.length <= MAX_EXACT_THREAD_IDS ? ids : null;
  }

  return {
    async readProjection() {
      const scope = await enrolledScope().catch(() => null);
      if (scope === null) return unavailableProjection("hold");
      try {
        return validateReadOnlyBoardUsageProjection(await readUsageProjection({
          stateRoot: usageMeterStateRoot,
          threadIds: scope,
          now,
          claudeFreshnessThresholdSeconds
        }));
      } catch {
        return unavailableProjection("hold");
      }
    }
  };
}

export function createAiUsageAdapterPlugin(options = {}) {
  const adapter = createAiUsageAdapter(options);
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
      if (url.pathname !== AI_USAGE_SNAPSHOT_PATH) {
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
      if (url.searchParams.get(AI_USAGE_READ_ONLY_QUERY_KEY) !== "1") {
        response.statusCode = 400;
        response.end();
        return;
      }
      void adapter.readProjection().then((projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      }, () => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(unavailableProjection("hold")));
      });
    });
  };
  return {
    name: "soulforge-ai-usage-adapter",
    configureServer: configure,
    configurePreviewServer: configure
  };
}

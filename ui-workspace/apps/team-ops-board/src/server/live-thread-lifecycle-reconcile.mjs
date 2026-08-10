import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  createLifecycleReceipt,
  persistLifecycleReceipts
} from "../../../../../guild_hall/ai_usage_meter/lifecycle_receipt.mjs";
import {
  DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS,
  jsonlLifecycleReceiptInputs,
  persistJsonlLifecycleSnapshot,
  reconcileJsonlLifecycle
} from "../../../../../guild_hall/ai_usage_meter/jsonl_lifecycle.mjs";

export const DEFAULT_AUTO_LIFECYCLE_RECONCILE_DEBOUNCE_MS = 15_000;
// Exact and full bounded sweeps are currently observed between two and six
// seconds on the Owner's session tree. Leave filesystem headroom while
// retaining the existing hard 10-second safety ceiling.
export const DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS = 8_000;

const MAX_AUTO_LIFECYCLE_RECONCILE_DEBOUNCE_MS = 5 * 60 * 1_000;
const MAX_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS = 10_000;

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function nonNegativeInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function safeNow(value) {
  const candidate = typeof value === "function" ? value() : value;
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

function exactThreadIds(threadIds) {
  return [...new Set([...threadIds]
    .filter((threadId) => typeof threadId === "string" && threadId.trim())
    .map((threadId) => threadId.trim()))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

export function defaultCodexSessionsRoot({ env = process.env, home = homedir } = {}) {
  const configuredHome = typeof env?.CODEX_HOME === "string" && env.CODEX_HOME.trim()
    ? env.CODEX_HOME.trim()
    : join(home(), ".codex");
  return join(resolve(configuredHome), "sessions");
}

export async function reconcileAndPersistLifecycle({
  stateRoot,
  sessionsRoot,
  threadIds,
  maxSessionCount = DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS,
  reconcile = reconcileJsonlLifecycle,
  persistJsonl = persistJsonlLifecycleSnapshot,
  persistReceipts = persistLifecycleReceipts,
  createReceipt = createLifecycleReceipt
} = {}) {
  const exactIds = exactThreadIds(threadIds ?? []);
  const safeMaxSessionCount = positiveInteger(
    maxSessionCount,
    DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS,
    DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS
  );
  if (!stateRoot || !sessionsRoot || !exactIds.length || exactIds.length > safeMaxSessionCount) {
    return { status: "hold" };
  }

  try {
    const snapshot = await reconcile({
      sessionsRoot: resolve(sessionsRoot),
      threadIds: exactIds,
      maxSessionCount: safeMaxSessionCount
    });
    const safePartial = snapshot?.health?.status === "partial"
      && snapshot?.coverage?.parsed_session_count > 0
      && snapshot?.coverage?.projection_count > 0
      && snapshot?.coverage?.malformed_session_count === 0;
    if ((snapshot?.health?.status !== "available" && !safePartial) || snapshot.health.staleness !== "fresh") {
      return { status: "hold" };
    }
    const receiptInputs = jsonlLifecycleReceiptInputs(snapshot);
    const receipts = receiptInputs.map((input) => createReceipt(input, { observedAt: input.observed_at }));
    await persistJsonl(resolve(stateRoot), snapshot);
    await persistReceipts(resolve(stateRoot), receipts);
    return { status: "available" };
  } catch {
    return { status: "hold" };
  }
}

// Each adapter owns a small coordinator. The adapter itself already de-duplicates
// concurrent HTTP refreshes; this additionally keeps future callers from starting
// overlapping JSONL scans while a bounded scan is still finishing.
export function createAutomaticLifecycleReconciler({
  stateRoot,
  sessionsRoot,
  debounceMs = DEFAULT_AUTO_LIFECYCLE_RECONCILE_DEBOUNCE_MS,
  timeoutMs = DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS,
  maxSessionCount = DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS,
  now = Date.now,
  reconcileAndPersist = reconcileAndPersistLifecycle
} = {}) {
  const safeDebounceMs = nonNegativeInteger(
    debounceMs,
    DEFAULT_AUTO_LIFECYCLE_RECONCILE_DEBOUNCE_MS,
    MAX_AUTO_LIFECYCLE_RECONCILE_DEBOUNCE_MS
  );
  const safeTimeoutMs = positiveInteger(
    timeoutMs,
    DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS,
    MAX_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS
  );
  const safeMaxSessionCount = positiveInteger(
    maxSessionCount,
    DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS,
    DEFAULT_JSONL_LIFECYCLE_MAX_SESSIONS
  );
  let inFlight = null;
  let lastAttemptAt = null;

  return {
    async reconcile({ threadIds = [], sourceHealth = "missing" } = {}) {
      if (!["available", "hold", "missing", "stale"].includes(sourceHealth)) return { status: "hold" };
      const exactIds = exactThreadIds(threadIds);
      if (!exactIds.length || exactIds.length > safeMaxSessionCount) return { status: "hold" };

      const observedNow = safeNow(now);
      if (inFlight !== null) return { status: "hold" };
      if (lastAttemptAt !== null && observedNow - lastAttemptAt < safeDebounceMs) {
        return { status: "debounced" };
      }
      lastAttemptAt = observedNow;

      let operation;
      operation = Promise.resolve().then(() => reconcileAndPersist({
        stateRoot,
        sessionsRoot,
        threadIds: exactIds,
        maxSessionCount: safeMaxSessionCount
      })).catch(() => ({ status: "hold" })).finally(() => {
        if (inFlight === operation) inFlight = null;
      });
      inFlight = operation;
      return withTimeout(operation, safeTimeoutMs);
    }
  };
}

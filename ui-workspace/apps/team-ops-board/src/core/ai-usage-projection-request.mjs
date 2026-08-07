import { normalizeAiUsageHistoryProjection } from "./ai-usage-history-snapshot.mjs";

export const AI_USAGE_SNAPSHOT_PATH = "/ai-usage-meter.snapshot.json";
export const AI_USAGE_PROJECTION_CACHE_TTL_MS = 5_000;

function createCancelledConsumerError() {
  const error = new Error("AI usage projection consumer cancelled");
  error.name = "AbortError";
  return error;
}

function attachConsumer(request, signal) {
  if (!signal) {
    return request;
  }
  if (signal.aborted) {
    return Promise.reject(createCancelledConsumerError());
  }

  return new Promise((resolve, reject) => {
    const cleanUp = () => signal.removeEventListener("abort", cancel);
    const cancel = () => {
      cleanUp();
      reject(createCancelledConsumerError());
    };

    signal.addEventListener("abort", cancel, { once: true });
    request.then(
      (projection) => {
        cleanUp();
        resolve(projection);
      },
      (error) => {
        cleanUp();
        reject(error);
      }
    );
  });
}

async function fetchAiUsageProjection(fetchImpl, { force = false } = {}) {
  try {
    const path = force ? `${AI_USAGE_SNAPSHOT_PATH}?refresh=1` : AI_USAGE_SNAPSHOT_PATH;
    const response = await fetchImpl(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      mode: "same-origin",
      redirect: "error"
    });
    if (!response.ok) {
      return normalizeAiUsageHistoryProjection(null);
    }

    try {
      return normalizeAiUsageHistoryProjection(await response.json());
    } catch {
      return normalizeAiUsageHistoryProjection({});
    }
  } catch {
    return normalizeAiUsageHistoryProjection(null);
  }
}

export function createAiUsageProjectionRequest(
  fetchImpl = globalThis.fetch,
  {
    now = Date.now,
    cacheTtlMs = AI_USAGE_PROJECTION_CACHE_TTL_MS
  } = {}
) {
  let cached = null;
  let cachedAt = null;
  let inFlight = null;

  return {
    load({ signal, force = false } = {}) {
      if (force) {
        cached = null;
        cachedAt = null;
      }
      const cacheIsFresh = cached !== null
        && cachedAt !== null
        && now() - cachedAt < cacheTtlMs;
      if (cacheIsFresh) return attachConsumer(Promise.resolve(cached), signal);
      if (inFlight === null) {
        // A consumer may leave without aborting the request shared by a StrictMode remount.
        inFlight = fetchAiUsageProjection(fetchImpl, { force }).then((projection) => {
          cached = projection;
          cachedAt = now();
          return projection;
        }).finally(() => {
          inFlight = null;
        });
      }
      return attachConsumer(inFlight, signal);
    },
    invalidate() {
      cached = null;
      cachedAt = null;
    }
  };
}

export const aiUsageProjectionRequest = createAiUsageProjectionRequest();

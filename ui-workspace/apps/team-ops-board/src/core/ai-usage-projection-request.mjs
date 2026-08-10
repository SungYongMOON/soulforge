import { normalizeAiUsageSnapshot } from "./ai-usage-snapshot.mjs";

export const AI_USAGE_SNAPSHOT_PATH = "/ai-usage-meter.snapshot.json";

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

async function fetchAiUsageProjection(fetchImpl) {
  try {
    const response = await fetchImpl(AI_USAGE_SNAPSHOT_PATH, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      mode: "same-origin",
      redirect: "error"
    });
    if (!response.ok) {
      return normalizeAiUsageSnapshot(null);
    }

    try {
      return normalizeAiUsageSnapshot(await response.json());
    } catch {
      return normalizeAiUsageSnapshot({});
    }
  } catch {
    return normalizeAiUsageSnapshot(null);
  }
}

export function createAiUsageProjectionRequest(fetchImpl = globalThis.fetch) {
  let sharedRequest = null;

  return {
    load({ signal } = {}) {
      if (sharedRequest === null) {
        // A consumer may leave without aborting the request shared by a StrictMode remount.
        sharedRequest = fetchAiUsageProjection(fetchImpl);
      }
      return attachConsumer(sharedRequest, signal);
    }
  };
}

export const aiUsageProjectionRequest = createAiUsageProjectionRequest();

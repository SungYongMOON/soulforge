import {
  createUnavailableLiveThreadProjection,
  isAcknowledgeableLiveThread,
  normalizeLiveThreadProjection
} from "./live-thread-projection.mjs";

export const LIVE_THREAD_SNAPSHOT_PATH = "/codex-threads.snapshot.json";
export const LIVE_THREAD_POLL_INTERVAL_MS = 10_000;
export const LIVE_THREAD_ACK_STORAGE_PREFIX = "soulforge.team_ops_board.thread_ack.v1";

function createCancelledConsumerError() {
  const error = new Error("live thread projection consumer cancelled");
  error.name = "AbortError";
  return error;
}

function attachConsumer(request, signal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(createCancelledConsumerError());
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(createCancelledConsumerError());
    };
    signal.addEventListener("abort", cancel, { once: true });
    request.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      }
    );
  });
}

async function fetchLiveThreadProjection(fetchImpl, { force = false } = {}) {
  try {
    const path = force ? `${LIVE_THREAD_SNAPSHOT_PATH}?refresh=1` : LIVE_THREAD_SNAPSHOT_PATH;
    const response = await fetchImpl(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      mode: "same-origin",
      redirect: "error"
    });
    if (!response.ok) return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
    try {
      return normalizeLiveThreadProjection(await response.json());
    } catch {
      return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
    }
  } catch {
    return createUnavailableLiveThreadProjection({ health: "unavailable", enrollmentHealth: "missing" });
  }
}

export function createLiveThreadProjectionRequest(fetchImpl = globalThis.fetch) {
  let inFlight = null;
  return {
    load({ signal, force = false } = {}) {
      if (inFlight === null) {
        inFlight = fetchLiveThreadProjection(fetchImpl, { force }).finally(() => {
          inFlight = null;
        });
      }
      return attachConsumer(inFlight, signal);
    }
  };
}

export const liveThreadProjectionRequest = createLiveThreadProjectionRequest();

export function liveThreadAcknowledgementKey(thread) {
  if (typeof thread?.thread_id !== "string" || typeof thread?.updated_at !== "string") return null;
  return `${LIVE_THREAD_ACK_STORAGE_PREFIX}:${thread.thread_id}:${thread.updated_at}`;
}

export function isLiveThreadAcknowledged(storage, thread) {
  const key = liveThreadAcknowledgementKey(thread);
  if (!key || !storage) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeLiveThread(storage, thread) {
  const key = liveThreadAcknowledgementKey(thread);
  if (!key || !isAcknowledgeableLiveThread(thread) || !storage) return false;
  try {
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

export function restoreLiveThread(storage, thread) {
  const key = liveThreadAcknowledgementKey(thread);
  if (!key || !storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function sortThreads(left, right) {
  return right.updated_at.localeCompare(left.updated_at) || left.thread_id.localeCompare(right.thread_id);
}

export function selectLiveThreadView(projectionInput, storage, view = "active") {
  const projection = normalizeLiveThreadProjection(projectionInput);
  const acknowledged = projection.threads.filter((thread) => isLiveThreadAcknowledged(storage, thread));
  if (view === "history") {
    return {
      projection,
      threads: [...acknowledged, ...projection.history].sort(sortThreads),
      acknowledged
    };
  }
  return {
    projection,
    threads: projection.threads.filter((thread) => !isLiveThreadAcknowledged(storage, thread)).sort(sortThreads),
    acknowledged
  };
}

export function groupLiveThreadsByOrganization(threads) {
  const groups = new Map();
  for (const thread of Array.isArray(threads) ? threads : []) {
    const group = groups.get(thread.organization_group_id) ?? [];
    group.push(thread);
    groups.set(thread.organization_group_id, group);
  }
  return [...groups.entries()]
    .map(([organization_group_id, members]) => ({ organization_group_id, threads: members.sort(sortThreads) }))
    .sort((left, right) => left.organization_group_id.localeCompare(right.organization_group_id));
}

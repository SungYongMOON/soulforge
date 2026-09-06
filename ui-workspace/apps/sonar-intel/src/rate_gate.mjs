// Minimal rate-limit gate: serializes async tasks through one queue and enforces
// a minimum gap between the START of consecutive tasks. This is the mechanism
// collectors use to obey published API terms of use (e.g. arXiv: "minimum of
// three seconds" between requests, "no simultaneous requests" — a single
// connection). No external dependency; clock/sleep are injectable so tests do
// not need to wait in real time.
//
// This module intentionally does nothing about retries, backoff, or per-host
// tracking — it is a single ordered gate per instance. A collector wanting
// per-host limits should create one gate per host.

/**
 * @param {object} [options]
 * @param {number} [options.minIntervalMs] minimum ms between the start of two
 *   consecutive scheduled tasks. Default 3000 (arXiv ToU floor).
 * @param {() => number} [options.now] clock, injectable for tests.
 * @param {(ms: number) => Promise<void>} [options.sleep] sleep implementation,
 *   injectable for tests.
 */
export function createRateGate({
  minIntervalMs = 3000,
  now = () => Date.now(),
  sleep = defaultSleep,
} = {}) {
  if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0) {
    throw new Error(`createRateGate: minIntervalMs must be a non-negative number, got ${minIntervalMs}`);
  }

  let chain = Promise.resolve();
  let lastStartedAt = -Infinity;
  let scheduledCount = 0;

  /**
   * Schedule `task` to run after any previously scheduled task on this gate
   * has started, and after at least `minIntervalMs` has passed since the
   * previous task's start. Tasks always run one at a time (single connection).
   * @template T
   * @param {() => Promise<T> | T} task
   * @returns {Promise<T>}
   */
  function schedule(task) {
    scheduledCount += 1;
    const runWhenTurnArrives = async () => {
      const waitMs = Math.max(0, lastStartedAt + minIntervalMs - now());
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      lastStartedAt = now();
      return task();
    };

    const result = chain.then(runWhenTurnArrives, runWhenTurnArrives);
    // Keep the chain alive regardless of whether this task rejected, but do not
    // swallow the rejection for the caller awaiting `result`.
    chain = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  return {
    schedule,
    get minIntervalMs() {
      return minIntervalMs;
    },
    get scheduledCount() {
      return scheduledCount;
    },
    get lastStartedAt() {
      return lastStartedAt;
    },
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  createAutomaticLifecycleReconciler,
  DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS,
  defaultCodexSessionsRoot
} from "./live-thread-lifecycle-reconcile.mjs";

test("default reconciliation timeout leaves bounded headroom for multi-second full sweeps", () => {
  assert.equal(DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS, 8_000);
});

test("automatic lifecycle reconciliation is bounded, debounced, and single-flight", async () => {
  let now = 1_000;
  let calls = 0;
  let release = null;
  const pending = new Promise((resolve) => { release = resolve; });
  const reconciler = createAutomaticLifecycleReconciler({
    stateRoot: "C:/safe/state",
    sessionsRoot: "C:/safe/codex/sessions",
    debounceMs: 1_000,
    timeoutMs: 1_000,
    now: () => now,
    reconcileAndPersist: async () => {
      calls += 1;
      await pending;
      return { status: "available" };
    }
  });

  const first = reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "missing" });
  const overlapping = await reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "missing" });
  assert.deepEqual(overlapping, { status: "hold" });
  assert.equal(calls, 1);

  release();
  assert.deepEqual(await first, { status: "available" });
  assert.deepEqual(await reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "available" }), { status: "debounced" });
  assert.equal(calls, 1);

  now += 1_000;
  const second = reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "available" });
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.deepEqual(await second, { status: "available" });
});

test("automatic lifecycle reconciliation times out fail-closed and rejects unsafe scopes", async () => {
  const reconciler = createAutomaticLifecycleReconciler({
    stateRoot: "C:/safe/state",
    sessionsRoot: "C:/safe/codex/sessions",
    timeoutMs: 10,
    maxSessionCount: 1,
    reconcileAndPersist: async () => new Promise(() => {})
  });

  assert.deepEqual(await reconciler.reconcile({ threadIds: ["thread-a", "thread-b"], sourceHealth: "missing" }), { status: "hold" });
  assert.deepEqual(await reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "disabled" }), { status: "hold" });
  assert.deepEqual(await reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "missing" }), { status: "timeout" });
});

test("default Codex sessions root uses only the configured CODEX_HOME", () => {
  assert.equal(defaultCodexSessionsRoot({
    env: { CODEX_HOME: "C:/configured/codex" },
    home: () => "C:/ignored-home"
  }), "C:\\configured\\codex\\sessions");
});

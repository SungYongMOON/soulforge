import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createAutomaticLifecycleReconciler,
  DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS,
  defaultCodexSessionsRoot
} from "./live-thread-lifecycle-reconcile.mjs";
const SYNTHETIC_SAFE_STATE_ROOT = ["C:", "/safe/state"].join("");
const SYNTHETIC_SAFE_SESSIONS_ROOT = ["C:", "/safe/codex/sessions"].join("");

test("default reconciliation timeout leaves bounded headroom for multi-second full sweeps", () => {
  assert.equal(DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS, 10_000);
});

test("automatic lifecycle reconciliation is bounded, debounced, and single-flight", async () => {
  let now = 1_000;
  let calls = 0;
  let release = null;
  const pending = new Promise((resolve) => { release = resolve; });
  const reconciler = createAutomaticLifecycleReconciler({
    stateRoot: SYNTHETIC_SAFE_STATE_ROOT,
    sessionsRoot: SYNTHETIC_SAFE_SESSIONS_ROOT,
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
    stateRoot: SYNTHETIC_SAFE_STATE_ROOT,
    sessionsRoot: SYNTHETIC_SAFE_SESSIONS_ROOT,
    timeoutMs: 10,
    maxSessionCount: 1,
    reconcileAndPersist: async () => new Promise(() => {})
  });

  assert.deepEqual(await reconciler.reconcile({ threadIds: ["thread-a", "thread-b"], sourceHealth: "missing" }), { status: "hold" });
  assert.deepEqual(await reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "disabled" }), { status: "hold" });
  assert.deepEqual(await reconciler.reconcile({ threadIds: ["thread-a"], sourceHealth: "missing" }), { status: "timeout" });
});

test("default Codex sessions root uses only the configured CODEX_HOME", () => {
  // defaultCodexSessionsRoot resolves CODEX_HOME with the host path module (it
  // is a real Codex-install directory, native to whatever OS this runs on —
  // unlike the Windows Task Scheduler paths elsewhere in this app, there is no
  // single-platform contract to pin here). A hardcoded win32 literal would
  // only round-trip through host `resolve`/`join` on an actual Windows box, so
  // this fixture is a real absolute directory built with the host `path`
  // module (via os.tmpdir()) and the expected value is computed the same way,
  // giving the same verdict on every host platform.
  const configuredHome = join(tmpdir(), "configured", "codex");
  const ignoredHome = join(tmpdir(), "ignored-home");
  assert.equal(defaultCodexSessionsRoot({
    env: { CODEX_HOME: configuredHome },
    home: () => ignoredHome
  }), join(resolve(configuredHome), "sessions"));
});

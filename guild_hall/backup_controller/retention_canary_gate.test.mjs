import test from "node:test";
import assert from "node:assert/strict";
import {
  HELD_PRODUCTION_CANARY_GATE_ADAPTER,
  HELD_PRODUCTION_REPLAY_STORE,
  createSyntheticCanaryGateAdapter,
  createSyntheticReplayStoreAdapter,
  createSyntheticBindingStoreAdapter
} from "./retention_canary_gate.mjs";

test("Backup Controller Retention Canary Gate: HELD_PRODUCTION_CANARY_GATE_ADAPTER is feature-OFF", () => {
  assert.equal(HELD_PRODUCTION_CANARY_GATE_ADAPTER.feature_state, "off");
  assert.equal(HELD_PRODUCTION_CANARY_GATE_ADAPTER.authority_state, "hold");

  const obs = HELD_PRODUCTION_CANARY_GATE_ADAPTER.observeArchive();
  assert.equal(obs.success, false);
  assert.equal(obs.error_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");

  const rem = HELD_PRODUCTION_CANARY_GATE_ADAPTER.removeWorktree();
  assert.equal(rem.success, false);
  assert.equal(rem.error_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");

  const probe = HELD_PRODUCTION_CANARY_GATE_ADAPTER.restoreProbe();
  assert.equal(probe.success, false);
  assert.equal(probe.error_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");
});

test("Backup Controller Retention Canary Gate: HELD_PRODUCTION_REPLAY_STORE is feature-OFF", () => {
  assert.equal(HELD_PRODUCTION_REPLAY_STORE.feature_state, "off");
  const res = HELD_PRODUCTION_REPLAY_STORE.consumeReplay("pkt-canary-001");
  assert.equal(res.success, false);
  assert.equal(res.error_code, "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN");
});

test("Backup Controller Retention Canary Gate: synthetic replay store tracks single-use consumption", () => {
  const store = createSyntheticReplayStoreAdapter();
  assert.equal(store.feature_state, "off");
  assert.equal(store.getConsumeCalls(), 0);

  const res1 = store.consumeReplay("pkt-canary-001");
  assert.equal(res1.success, true);
  assert.equal(res1.consumed, true);
  assert.equal(store.hasConsumed("pkt-canary-001"), true);
  assert.equal(store.getConsumeCalls(), 1);

  const res2 = store.consumeReplay("pkt-canary-001");
  assert.equal(res2.success, false);
  assert.equal(res2.error_code, "CANARY_REPLAY_CONFLICT");
  assert.equal(res2.consumed, false);
  assert.equal(store.getConsumeCalls(), 2);
});

test("Backup Controller Retention Canary Gate: synthetic adapter calls and tracking", () => {
  const adapter = createSyntheticCanaryGateAdapter();
  assert.equal(adapter.feature_state, "off");
  assert.equal(adapter.getObserveCalls(), 0);
  assert.equal(adapter.getRemoveCalls(), 0);
  assert.equal(adapter.getRestoreCalls(), 0);

  const obs = adapter.observeArchive("cand-123");
  assert.equal(obs.success, true);
  assert.equal(obs.archive_verified, true);
  assert.equal(adapter.getObserveCalls(), 1);

  const rem = adapter.removeWorktree("cand-123");
  assert.equal(rem.success, true);
  assert.equal(rem.removal_count, 1);
  assert.equal(adapter.getRemoveCalls(), 1);

  const probe = adapter.restoreProbe("cand-123");
  assert.equal(probe.success, true);
  assert.equal(probe.probe_verified, true);
  assert.equal(adapter.getRestoreCalls(), 1);
});

test("Backup Controller Retention Canary Gate: binding store resolution", () => {
  const bindingsMap = new Map([
    ["bnd-canary-001", { candidate_id: "cand-123", worktree_path: "/path/to/wt" }]
  ]);
  const store = createSyntheticBindingStoreAdapter({ bindingsMap });
  assert.equal(store.feature_state, "off");
  assert.equal(store.getResolveCalls(), 0);

  const res1 = store.resolveBinding("bnd-canary-001");
  assert.equal(res1.candidate_id, "cand-123");
  assert.equal(store.getResolveCalls(), 1);

  const res2 = store.resolveBinding("bnd-canary-unknown");
  assert.equal(res2, null);
  assert.equal(store.getResolveCalls(), 2);
});

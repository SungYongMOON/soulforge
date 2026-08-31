import test from "node:test";
import assert from "node:assert/strict";

import { UPDATE_STATUS, coordinateClientUpdate } from "../src/runtime/update_coordinator.mjs";

function input(overrides = {}) {
  return {
    service_ref: "service.universal-client",
    current_release_ref: "release.client.0_1_0",
    candidate_release_ref: "release.client.0_2_0",
    candidate_digest: `sha256:${"a".repeat(64)}`,
    rollback_release_ref: "release.client.0_1_0",
    state_ref: "state.client.device-1",
    outbox_pending_count: 2,
    reboot_policy: "forbidden",
    ...overrides,
  };
}

function adapter({ healthy = true, rebootRequired = false } = {}) {
  const calls = [];
  return {
    calls,
    verifyCandidate: async () => ({ ok: true, reboot_required: rebootRequired }),
    stopClient: async () => { calls.push("stop"); return { ok: true }; },
    switchCurrent: async (releaseRef) => { calls.push(`switch:${releaseRef}`); return { ok: true }; },
    startClient: async () => { calls.push("start"); return { ok: true }; },
    checkHealth: async () => { calls.push("health"); return { ok: healthy }; },
    verifyStatePreserved: async () => { calls.push("state"); return { ok: true }; },
  };
}

test("verified update restarts only the client, preserves state, and never requests reboot", async () => {
  const effects = adapter();
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.UPDATED);
  assert.deepEqual(effects.calls, ["stop", "switch:release.client.0_2_0", "start", "health", "state"]);
  assert.equal(result.reboot_requested, false);
  assert.equal(result.outbox_preserved, true);
});

test("candidate start and state verification failures both restore the previous release", async () => {
  for (const failAt of ["start", "state"]) {
    const effects = adapter();
    if (failAt === "start") {
      let starts = 0;
      effects.startClient = async () => {
        effects.calls.push("start");
        starts += 1;
        if (starts === 1) throw new Error("synthetic start failure");
        return { ok: true };
      };
    } else {
      effects.verifyStatePreserved = async () => {
        effects.calls.push("state");
        return { ok: false };
      };
    }
    const result = await coordinateClientUpdate(input(), effects);
    assert.equal(result.status, UPDATE_STATUS.ROLLED_BACK, failAt);
    assert.equal(result.current_release_ref, "release.client.0_1_0", failAt);
    assert.equal(result.outbox_preserved, true, failAt);
    assert.deepEqual(effects.calls.slice(-3), ["stop", "switch:release.client.0_1_0", "start"], failAt);
  }
});

test("candidate requiring reboot HOLDs before any effect", async () => {
  const effects = adapter({ rebootRequired: true });
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.HOLD);
  assert.equal(result.hold_code, "REBOOT_REQUIRED_HOLD");
  assert.deepEqual(effects.calls, []);
});

test("failed health rolls the pointer back and restarts the previous client", async () => {
  const effects = adapter({ healthy: false });
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.ROLLED_BACK);
  assert.deepEqual(effects.calls, [
    "stop",
    "switch:release.client.0_2_0",
    "start",
    "health",
    "stop",
    "switch:release.client.0_1_0",
    "start",
  ]);
  assert.equal(result.reboot_requested, false);
});

test("foreign service, wildcard release, secret-shaped input, and missing rollback are rejected", async () => {
  for (const candidate of [
    input({ service_ref: "service.erp" }),
    input({ candidate_release_ref: "*" }),
    input({ rollback_release_ref: null }),
    { ...input(), secret: "x" },
  ]) await assert.rejects(() => coordinateClientUpdate(candidate, adapter()), /update_input_invalid/u);
});

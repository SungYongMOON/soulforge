import test from "node:test";
import assert from "node:assert/strict";

import { UPDATE_STATUS, coordinateClientUpdate } from "../src/runtime/update_coordinator.mjs";

const CANDIDATE_RELEASE_REF = "release.client.0_2_0";

function input(overrides = {}) {
  return {
    service_ref: "service.universal-client",
    current_release_ref: "release.client.0_1_0",
    candidate_release_ref: CANDIDATE_RELEASE_REF,
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
    checkHealth: async ({ release_ref } = {}) => {
      calls.push("health");
      // `healthy` gates only the candidate's own check; the restored (rollback)
      // release defaults to healthy unless a test overrides checkHealth locally.
      const isCandidate = release_ref === CANDIDATE_RELEASE_REF;
      return { ok: isCandidate ? healthy : true };
    },
    verifyStatePreserved: async () => { calls.push("state"); return { ok: true }; },
  };
}

test("verified update restarts only the client, preserves state, and never requests reboot", async () => {
  const effects = adapter();
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.UPDATED);
  assert.deepEqual(effects.calls, ["stop", `switch:${CANDIDATE_RELEASE_REF}`, "start", "health", "state"]);
  assert.equal(result.reboot_requested, false);
  assert.equal(result.outbox_preserved, true);
});

test("candidate start failure restores the previous release, health and state re-verified", async () => {
  const effects = adapter();
  let starts = 0;
  effects.startClient = async () => {
    effects.calls.push("start");
    starts += 1;
    if (starts === 1) throw new Error("synthetic start failure");
    return { ok: true };
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.ROLLED_BACK);
  assert.equal(result.current_release_ref, "release.client.0_1_0");
  assert.equal(result.outbox_preserved, true);
  assert.deepEqual(effects.calls.slice(-5), ["stop", "switch:release.client.0_1_0", "start", "health", "state"]);
});

test("candidate state-preservation failure restores the previous release, itself verified preserved", async () => {
  const effects = adapter();
  let stateChecks = 0;
  effects.verifyStatePreserved = async () => {
    effects.calls.push("state");
    stateChecks += 1;
    return { ok: stateChecks !== 1 }; // fails only for the candidate's own (first) check
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.ROLLED_BACK);
  assert.equal(result.hold_code, "CLIENT_STATE_NOT_PRESERVED");
  assert.equal(result.current_release_ref, "release.client.0_1_0");
  assert.equal(result.outbox_preserved, true);
  assert.deepEqual(effects.calls.slice(-5), ["stop", "switch:release.client.0_1_0", "start", "health", "state"]);
});

test("state confirmed not preserved after rollback is HOLD, not a false ROLLED_BACK", async () => {
  const effects = adapter({ healthy: false }); // candidate health fails, triggering rollback
  effects.verifyStatePreserved = async () => {
    effects.calls.push("state");
    return { ok: false };
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.HOLD, "state confirmed not preserved must not be reported as a successful rollback");
  assert.equal(result.hold_code, "ROLLBACK_STATE_NOT_PRESERVED");
  assert.equal(result.current_release_ref, "release.client.0_1_0", "switchCurrent(rollback) itself succeeded (observed), independent of the state verdict that follows");
  assert.equal(result.outbox_preserved, false);
  assert.deepEqual(effects.calls, [
    "stop", `switch:${CANDIDATE_RELEASE_REF}`, "start", "health",
    "stop", "switch:release.client.0_1_0", "start", "health", "state",
  ]);
});

test("candidate state failure followed by a post-rollback state failure is HOLD and names the rollback verdict", async () => {
  const effects = adapter();
  effects.verifyStatePreserved = async () => {
    effects.calls.push("state");
    return { ok: false }; // fails for the candidate AND again for the restored release
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.HOLD);
  assert.equal(
    result.hold_code,
    "ROLLBACK_STATE_NOT_PRESERVED",
    "the receipt has one hold_code field, so the rollback verdict replaces the candidate's CLIENT_STATE_NOT_PRESERVED cause",
  );
  assert.equal(result.current_release_ref, "release.client.0_1_0");
  assert.equal(result.outbox_preserved, false);
  assert.deepEqual(effects.calls.slice(-5), ["stop", "switch:release.client.0_1_0", "start", "health", "state"]);
});

test("state that cannot be verified after rollback (verifyStatePreserved throws) HOLDs instead of assuming success", async () => {
  const effects = adapter({ healthy: false }); // candidate health fails, triggering rollback
  effects.verifyStatePreserved = async () => {
    effects.calls.push("state");
    throw new Error("state probe unreachable");
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.HOLD, "an unreadable post-rollback state status must not be treated as success");
  assert.equal(result.hold_code, "ROLLBACK_STATE_UNVERIFIED");
  assert.equal(result.current_release_ref, "release.client.0_1_0");
  assert.equal(result.outbox_preserved, false);
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
    `switch:${CANDIDATE_RELEASE_REF}`,
    "start",
    "health",
    "stop",
    "switch:release.client.0_1_0",
    "start",
    "health",
    "state",
  ]);
  assert.equal(result.reboot_requested, false);
  assert.equal(result.outbox_preserved, true);
});

test("a restored release that itself fails health is HOLD, not a false ROLLED_BACK", async () => {
  const effects = adapter({ healthy: false }); // candidate health fails, triggering rollback
  effects.checkHealth = async ({ release_ref }) => {
    effects.calls.push(`health:${release_ref}`);
    return { ok: false }; // unhealthy for both the candidate and the restored rollback release
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.HOLD, "an unhealthy restored release must not be reported as a successful rollback");
  assert.equal(result.hold_code, "ROLLBACK_HEALTH_FAILED");
  assert.equal(result.current_release_ref, "release.client.0_1_0", "switchCurrent(rollback) itself succeeded (observed), independent of the health verdict that follows");
  assert.equal(result.outbox_preserved, false, "state preservation was never checked, so it must not be claimed");
  assert.ok(!effects.calls.includes("state"), "state must not be checked when the restored release itself is unhealthy");
  assert.deepEqual(effects.calls, [
    "stop", `switch:${CANDIDATE_RELEASE_REF}`, "start", `health:${CANDIDATE_RELEASE_REF}`,
    "stop", "switch:release.client.0_1_0", "start", "health:release.client.0_1_0",
  ]);
});

test("an unreadable health status after rollback (checkHealth throws) HOLDs instead of assuming success", async () => {
  const effects = adapter({ healthy: false }); // candidate health fails, triggering rollback
  let healthCalls = 0;
  effects.checkHealth = async ({ release_ref }) => {
    healthCalls += 1;
    effects.calls.push(`health:${release_ref}`);
    if (healthCalls === 1) return { ok: false }; // candidate check: unhealthy, triggers rollback
    throw new Error("health probe unreachable"); // rollback check: status unknown
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(healthCalls, 2, "the restored release's health must actually be re-checked after rollback");
  assert.equal(result.status, UPDATE_STATUS.HOLD, "an unknown post-rollback health status must not be treated as success");
  assert.equal(result.hold_code, "ROLLBACK_HEALTH_FAILED");
});

test("a partial rollback (switchCurrent failure) still HOLDs as incomplete and never rechecks health or state", async () => {
  const effects = adapter({ healthy: false }); // candidate health fails, triggering rollback
  effects.switchCurrent = async (releaseRef) => {
    effects.calls.push(`switch:${releaseRef}`);
    if (releaseRef === "release.client.0_1_0") throw new Error("switch failed during rollback");
    return { ok: true };
  };
  const result = await coordinateClientUpdate(input(), effects);
  assert.equal(result.status, UPDATE_STATUS.HOLD);
  assert.equal(result.hold_code, "ROLLBACK_INCOMPLETE_HOLD");
  assert.equal(result.current_release_ref, null);
  assert.deepEqual(effects.calls, [
    "stop", `switch:${CANDIDATE_RELEASE_REF}`, "start", "health",
    "stop", "switch:release.client.0_1_0", "start",
  ], "health is checked once for the candidate and is not re-checked when the rollback itself did not complete");
  assert.ok(!effects.calls.includes("state"), "state must not be checked when the rollback itself did not complete");
});

test("foreign service, wildcard release, secret-shaped input, and missing rollback are rejected", async () => {
  for (const candidate of [
    input({ service_ref: "service.erp" }),
    input({ candidate_release_ref: "*" }),
    input({ rollback_release_ref: null }),
    { ...input(), secret: "x" },
  ]) await assert.rejects(() => coordinateClientUpdate(candidate, adapter()), /update_input_invalid/u);
});

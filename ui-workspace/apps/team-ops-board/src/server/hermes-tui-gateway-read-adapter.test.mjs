import assert from "node:assert/strict";
import test from "node:test";

import { createHermesTuiGatewayReadAdapter } from "./hermes-tui-gateway-read-adapter.mjs";

test("the Hermes Adapter requests only session.active_list metadata", async () => {
  const requests = [];
  const adapter = createHermesTuiGatewayReadAdapter({
    request: async (message) => {
      requests.push(message);
      return { id: message.id, result: { sessions: [] } };
    },
  });

  assert.deepEqual(await adapter.readActiveSessions(), { sessions: [] });
  assert.deepEqual(await adapter.readActiveSessions(), { sessions: [] });
  assert.deepEqual(requests, [
    { id: 1, method: "session.active_list", params: { metadata_only: true } },
    { id: 2, method: "session.active_list", params: { metadata_only: true } },
  ]);
  assert.doesNotMatch(
    JSON.stringify(requests),
    /session\.(?:list|history|status|usage|activate)/u,
  );
});

test("the Hermes Adapter maps timeout and disconnect without returning provider errors", async () => {
  const timeoutAdapter = createHermesTuiGatewayReadAdapter({
    request: async () => await new Promise(() => {}),
    timeoutMs: 5,
  });
  await assert.rejects(
    timeoutAdapter.readActiveSessions(),
    (error) => error.code === "AGENT_RUNTIME_TIMEOUT" && error.message === "agent runtime read timeout",
  );

  let invalidations = 0;
  const disconnectAdapter = createHermesTuiGatewayReadAdapter({
    request: async () => {
      const error = new Error("private provider detail");
      error.code = "ECONNRESET";
      throw error;
    },
  });
  disconnectAdapter.onInvalidated(() => { invalidations += 1; });
  await assert.rejects(
    disconnectAdapter.readActiveSessions(),
    (error) => error.code === "AGENT_RUNTIME_DISCONNECTED"
      && error.message === "agent runtime disconnected"
      && !error.message.includes("private provider detail"),
  );
  assert.equal(invalidations, 1);
});

test("the Hermes Adapter rejects malformed, conflicting, and oversized RPC envelopes", async () => {
  const malformed = createHermesTuiGatewayReadAdapter({
    request: async () => ({ result: { sessions: [] } }),
  });
  await assert.rejects(
    malformed.readActiveSessions(),
    (error) => error.code === "AGENT_RUNTIME_RESPONSE_MALFORMED",
  );

  const conflicting = createHermesTuiGatewayReadAdapter({
    request: async (message) => ({ id: message.id + 1, result: { sessions: [] } }),
  });
  await assert.rejects(
    conflicting.readActiveSessions(),
    (error) => error.code === "AGENT_RUNTIME_RESPONSE_MALFORMED",
  );

  const oversized = createHermesTuiGatewayReadAdapter({
    request: async (message) => ({
      id: message.id,
      result: { sessions: [], padding: "x".repeat(200) },
    }),
    maxResponseBytes: 64,
  });
  await assert.rejects(
    oversized.readActiveSessions(),
    (error) => error.code === "AGENT_RUNTIME_RESPONSE_OVERSIZE",
  );
});

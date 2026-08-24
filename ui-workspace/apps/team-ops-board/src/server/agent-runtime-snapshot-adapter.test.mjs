import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AGENT_RUNTIME_SNAPSHOT_PATH,
  createAgentRuntimeSnapshotAdapterPlugin,
  parseBoundedAgentRuntimeTransportFrame,
} from "./agent-runtime-snapshot-adapter.mjs";

function captureMiddleware(plugin, surface = "configureServer") {
  let middleware;
  plugin[surface]({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  return middleware;
}

function invoke(middleware, request) {
  return new Promise((resolve) => {
    const response = {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body = "") {
        resolve({ statusCode: this.statusCode, headers: this.headers, body });
      },
    };
    middleware(request, response, () => resolve({ next: true }));
  });
}

function loopbackRequest(overrides = {}) {
  return {
    method: "GET",
    url: `${AGENT_RUNTIME_SNAPSHOT_PATH}?read_only=1`,
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
}

test("the default loopback endpoint returns the fixed truthful HOLD envelope", async () => {
  const middleware = captureMiddleware(createAgentRuntimeSnapshotAdapterPlugin());

  const result = await invoke(middleware, loopbackRequest());

  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.headers, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  assert.deepEqual(JSON.parse(result.body), {
    schema_version: "soulforge.agent_runtime_read_projection.v1",
    read_only: 1,
    refresh_state: "hold",
    observed_at: null,
    source: { kind: "agent_runtime_gateway_active_sessions" },
    evidence_counts: {
      configured_bots: 0,
      active_sessions: 0,
      matched_bots: 0,
      unmatched_active_sessions: 0,
    },
    bots: [],
    hold_code: "AGENT_RUNTIME_CONFIGURATION_UNAVAILABLE",
  });
});

test("the endpoint allows only loopback GET with the exact read_only query on dev and preview", async () => {
  const plugin = createAgentRuntimeSnapshotAdapterPlugin();
  for (const surface of ["configureServer", "configurePreviewServer"]) {
    const middleware = captureMiddleware(plugin, surface);

    const method = await invoke(middleware, loopbackRequest({ method: "POST" }));
    assert.equal(method.statusCode, 405, surface);
    assert.equal(method.headers.Allow, "GET", surface);

    const remote = await invoke(middleware, loopbackRequest({
      socket: { remoteAddress: "192.0.2.10" },
    }));
    assert.equal(remote.statusCode, 403, surface);

    for (const url of [
      AGENT_RUNTIME_SNAPSHOT_PATH,
      `${AGENT_RUNTIME_SNAPSHOT_PATH}?read_only=0`,
      `${AGENT_RUNTIME_SNAPSHOT_PATH}?read_only=1&refresh=1`,
      `${AGENT_RUNTIME_SNAPSHOT_PATH}?read_only=1&read_only=1`,
    ]) {
      const query = await invoke(middleware, loopbackRequest({ url }));
      assert.equal(query.statusCode, 400, `${surface}: ${url}`);
    }

    const ipv6 = await invoke(middleware, loopbackRequest({
      socket: { remoteAddress: "::1" },
    }));
    assert.equal(ipv6.statusCode, 200, surface);

    const unrelated = await invoke(middleware, loopbackRequest({ url: "/other.json" }));
    assert.deepEqual(unrelated, { next: true }, surface);
  }
});

test("an explicitly injected bounded transport and exact binding flow through the deep read Module", async () => {
  const exchanges = [];
  const plugin = createAgentRuntimeSnapshotAdapterPlugin({
    bindings: [{
      bot_id: "owner-approved-bot-id",
      agent_id: "owner-approved-agent-id",
      display_label: "Synthetic Bot",
      hermes_session_key: "owner-approved-session-key",
    }],
    exchangeFrame: async (outboundFrame) => {
      exchanges.push(JSON.parse(outboundFrame));
      return JSON.stringify({
        id: 1,
        result: {
          sessions: [{
            id: "live-session-id",
            session_key: "owner-approved-session-key",
            status: "starting",
            started_at: null,
            last_active: null,
            message_count: 0,
            model: null,
          }],
        },
      });
    },
    now: () => Date.parse("2026-08-24T12:00:00.000Z"),
  });
  const result = await invoke(captureMiddleware(plugin), loopbackRequest());
  const projection = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.deepEqual(exchanges, [{
    id: 1,
    method: "session.active_list",
    params: { metadata_only: true },
  }]);
  assert.equal(projection.refresh_state, "ready");
  assert.deepEqual(projection.bots[0].state, { kind: "observed", value: "starting" });
  assert.deepEqual(projection.bots[0].usage, { kind: "unavailable" });
  assert.deepEqual(projection.bots[0].heartbeat, { kind: "unknown" });
  assert.deepEqual(projection.bots[0].result, { kind: "unknown" });
});

test("transport/read failures stay HTTP 200 HOLD and never echo raw or provider details", async () => {
  const marker = "PRIVATE-PROVIDER-ERROR-MARKER";
  const plugin = createAgentRuntimeSnapshotAdapterPlugin({
    bindings: [{
      bot_id: "synthetic-bot",
      agent_id: "synthetic-agent",
      display_label: "Synthetic Bot",
      hermes_session_key: "synthetic-session",
    }],
    exchangeFrame: async () => {
      throw new Error(marker);
    },
  });

  const result = await invoke(captureMiddleware(plugin), loopbackRequest());
  const projection = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(projection.refresh_state, "hold");
  assert.equal(projection.bots.every((row) => row.state.kind === "unknown"), true);
  assert.equal(result.body.includes(marker), false);
  assert.deepEqual(result.headers, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
});

test("raw transport ingress is byte-limited before JSON parsing", () => {
  const oversizedInvalidJson = Buffer.from("{".repeat(65), "utf8");
  assert.throws(
    () => parseBoundedAgentRuntimeTransportFrame(oversizedInvalidJson, { maxResponseBytes: 64 }),
    (error) => error.code === "AGENT_RUNTIME_RESPONSE_OVERSIZE"
      && error.message === "agent runtime response oversized",
  );
});

test("Vite registers the default fail-closed endpoint plugin without runtime configuration", () => {
  const viteSource = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  assert.match(
    viteSource,
    /import \{ createAgentRuntimeSnapshotAdapterPlugin \} from "\.\/src\/server\/agent-runtime-snapshot-adapter\.mjs";/u,
  );
  assert.match(viteSource, /createAgentRuntimeSnapshotAdapterPlugin\(\)/u);
  assert.doesNotMatch(viteSource, /AGENT_RUNTIME_(?:BINDING|TRANSPORT)|HERMES_(?:BINDING|TRANSPORT)/u);
});

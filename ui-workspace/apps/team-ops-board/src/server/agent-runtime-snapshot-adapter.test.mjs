import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AGENT_RUNTIME_SNAPSHOT_PATH,
  createAgentRuntimeSnapshotAdapterPlugin,
  createAgentRuntimeSnapshotAdapterPluginFromEnvironment,
  parseBoundedAgentRuntimeTransportFrame,
} from "./agent-runtime-snapshot-adapter.mjs";

const SYNTHETIC_BINDING_PATH = path.resolve("synthetic-agent-runtime-bindings.json");

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

test("environment wiring is all-or-nothing and never fetches for missing or invalid configuration", async () => {
  let fetches = 0;
  let bindingLoads = 0;
  const httpGet = async () => {
    fetches += 1;
    throw new Error("unexpected fetch");
  };
  const loadBindings = async () => {
    bindingLoads += 1;
    return { state: "hold", hold_code: "AGENT_RUNTIME_BINDINGS_INVALID", bindings: [] };
  };
  const validUrl = "http://127.0.0.1:42424/api/agent-runtime/active-sessions";

  for (const env of [
    {},
    { TEAM_OPS_HERMES_AGENT_RUNTIME_URL: validUrl },
    { TEAM_OPS_HERMES_AGENT_RUNTIME_BINDINGS: SYNTHETIC_BINDING_PATH },
    {
      TEAM_OPS_HERMES_AGENT_RUNTIME_URL: "https://user:secret@127.0.0.1:42424/api/agent-runtime/active-sessions?raw=1",
      TEAM_OPS_HERMES_AGENT_RUNTIME_BINDINGS: SYNTHETIC_BINDING_PATH,
    },
  ]) {
    const plugin = await createAgentRuntimeSnapshotAdapterPluginFromEnvironment({
      env,
      httpGet,
      loadBindings,
    });
    const result = await invoke(captureMiddleware(plugin), loopbackRequest());
    assert.equal(JSON.parse(result.body).hold_code, "AGENT_RUNTIME_CONFIGURATION_UNAVAILABLE");
  }
  assert.equal(fetches, 0);
  assert.equal(bindingLoads, 0);

  const invalidBindingsPlugin = await createAgentRuntimeSnapshotAdapterPluginFromEnvironment({
    env: {
      TEAM_OPS_HERMES_AGENT_RUNTIME_URL: validUrl,
      TEAM_OPS_HERMES_AGENT_RUNTIME_BINDINGS: SYNTHETIC_BINDING_PATH,
    },
    httpGet,
    loadBindings,
  });
  const invalidBindings = await invoke(captureMiddleware(invalidBindingsPlugin), loopbackRequest());
  assert.equal(JSON.parse(invalidBindings.body).hold_code, "AGENT_RUNTIME_CONFIGURATION_UNAVAILABLE");
  assert.equal(bindingLoads, 1);
  assert.equal(fetches, 0);
});

test("configured synthetic environment produces READY through the exact loader and loopback transport", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-runtime-snapshot-configured-"));
  const bindingPath = path.join(directory, "bindings.json");
  const requests = [];
  try {
    await writeFile(bindingPath, JSON.stringify({
      schema_version: "soulforge.team_ops_board.agent_runtime_bindings.v1",
      metadata_only: true,
      bindings: [{
        bot_id: "synthetic-bot",
        agent_id: "synthetic-agent",
        display_label: "Synthetic Bot",
        hermes_session_key: "synthetic-key",
      }],
    }), "utf8");
    const plugin = await createAgentRuntimeSnapshotAdapterPluginFromEnvironment({
      env: {
        TEAM_OPS_HERMES_AGENT_RUNTIME_URL: "http://127.0.0.1:42424/api/agent-runtime/active-sessions",
        TEAM_OPS_HERMES_AGENT_RUNTIME_BINDINGS: bindingPath,
      },
      httpGet: async (options) => {
        requests.push(options);
        return {
          statusCode: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          },
          body: Buffer.from(JSON.stringify({
            schema_version: "hermes.agent_runtime_active_sessions.v1",
            read_only: true,
            sessions: [{
              id: "synthetic-live-id",
              session_key: "synthetic-key",
              status: "working",
              started_at: null,
              last_active: null,
              message_count: 0,
              model: null,
            }],
            truncated: false,
          }), "utf8"),
        };
      },
      now: () => Date.parse("2026-08-24T12:00:00.000Z"),
    });

    const result = await invoke(captureMiddleware(plugin), loopbackRequest());
    const projection = JSON.parse(result.body);
    assert.equal(projection.refresh_state, "ready");
    assert.deepEqual(projection.bots[0].state, { kind: "observed", value: "working" });
    assert.equal(requests.length, 1);
    assert.deepEqual({
      method: requests[0].method,
      protocol: requests[0].protocol,
      hostname: requests[0].hostname,
      port: requests[0].port,
      path: requests[0].path,
      headers: requests[0].headers,
    }, {
      method: "GET",
      protocol: "http:",
      hostname: "127.0.0.1",
      port: 42424,
      path: "/api/agent-runtime/active-sessions",
      headers: { Accept: "application/json" },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a configured transport failure replaces prior working state with fixed HOLD", async () => {
  let reads = 0;
  const plugin = await createAgentRuntimeSnapshotAdapterPluginFromEnvironment({
    env: {
      TEAM_OPS_HERMES_AGENT_RUNTIME_URL: "http://127.0.0.1:42424/api/agent-runtime/active-sessions",
      TEAM_OPS_HERMES_AGENT_RUNTIME_BINDINGS: SYNTHETIC_BINDING_PATH,
    },
    loadBindings: async () => ({
      state: "ready",
      hold_code: null,
      bindings: [{
        bot_id: "synthetic-bot",
        agent_id: "synthetic-agent",
        display_label: "Synthetic Bot",
        hermes_session_key: "synthetic-key",
      }],
    }),
    httpGet: async () => {
      reads += 1;
      if (reads > 1) throw new Error("PRIVATE-FAILURE");
      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
        body: Buffer.from(JSON.stringify({
          schema_version: "hermes.agent_runtime_active_sessions.v1",
          read_only: true,
          sessions: [{
            id: "synthetic-live-id",
            session_key: "synthetic-key",
            status: "working",
            started_at: null,
            last_active: null,
            message_count: 0,
            model: null,
          }],
          truncated: false,
        }), "utf8"),
      };
    },
  });
  const middleware = captureMiddleware(plugin);
  const working = JSON.parse((await invoke(middleware, loopbackRequest())).body);
  const failed = JSON.parse((await invoke(middleware, loopbackRequest())).body);
  assert.deepEqual(working.bots[0].state, { kind: "observed", value: "working" });
  assert.equal(failed.refresh_state, "hold");
  assert.equal(failed.hold_code, "GATEWAY_DISCONNECTED");
  assert.equal(failed.bots.every((row) => row.state.kind === "unknown"), true);
  assert.equal(JSON.stringify(failed).includes("PRIVATE-FAILURE"), false);
});

test("Vite awaits the environment-gated plugin while preserving default fail-closed behavior", () => {
  const viteSource = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  assert.match(
    viteSource,
    /import \{ createAgentRuntimeSnapshotAdapterPluginFromEnvironment \} from "\.\/src\/server\/agent-runtime-snapshot-adapter\.mjs";/u,
  );
  assert.match(viteSource, /await createAgentRuntimeSnapshotAdapterPluginFromEnvironment\(\)/u);
});

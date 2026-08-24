import assert from "node:assert/strict";
import test from "node:test";

import { createHermesLoopbackReadTransport } from "./hermes-loopback-read-transport.mjs";

const ACTIVE_SESSIONS_PATH = "/api/agent-runtime/active-sessions";

function validEnvelope(overrides = {}) {
  return {
    schema_version: "hermes.agent_runtime_active_sessions.v1",
    read_only: true,
    sessions: [],
    truncated: false,
    ...overrides,
  };
}

function response(body, overrides = {}) {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
    body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8"),
    ...overrides,
  };
}

const REQUEST_FRAME = JSON.stringify({
  id: 1,
  method: "session.active_list",
  params: { metadata_only: true },
});

test("the transport accepts only an exact canonical loopback HTTP URL with an explicit bounded port", () => {
  const hostileValues = [
    undefined,
    "",
    " ",
    `https://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
    `http://localhost:42424${ACTIVE_SESSIONS_PATH}`,
    `http://127.0.0.2:42424${ACTIVE_SESSIONS_PATH}`,
    `http://user:secret@127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
    `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}?read_only=1`,
    `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}?`,
    `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}#fragment`,
    `http://127.0.0.1:1023${ACTIVE_SESSIONS_PATH}`,
    `http://127.0.0.1:65536${ACTIVE_SESSIONS_PATH}`,
    `http://127.0.0.1${ACTIVE_SESSIONS_PATH}`,
    "http://127.0.0.1:42424/api/agent-runtime/other",
    `http://2130706433:42424${ACTIVE_SESSIONS_PATH}`,
    `http://127.0.0.1.:42424${ACTIVE_SESSIONS_PATH}`,
    `http://127.0.0.1:042424${ACTIVE_SESSIONS_PATH}`,
    "http://127.0.0.1:42424/api/agent-runtime/%61ctive-sessions",
  ];

  for (const value of hostileValues) {
    assert.throws(
      () => createHermesLoopbackReadTransport({ url: value }),
      (error) => error.code === "AGENT_RUNTIME_TRANSPORT_CONFIGURATION_INVALID"
        && error.message === "agent runtime transport configuration invalid",
      String(value),
    );
  }

  assert.doesNotThrow(() => createHermesLoopbackReadTransport({
    url: `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
  }));
  assert.doesNotThrow(() => createHermesLoopbackReadTransport({
    url: `http://[::1]:42424${ACTIVE_SESSIONS_PATH}`,
  }));
});

test("the transport performs one credential-free GET and converts the exact read-only envelope", async () => {
  const requests = [];
  const transport = createHermesLoopbackReadTransport({
    url: `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
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
            session_key: "synthetic-durable-key",
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

  const rawFrame = await transport.exchangeFrame(JSON.stringify({
    id: 7,
    method: "session.active_list",
    params: { metadata_only: true },
  }));

  assert.deepEqual(JSON.parse(rawFrame), {
    id: 7,
    result: {
      sessions: [{
        id: "synthetic-live-id",
        session_key: "synthetic-durable-key",
        status: "working",
        started_at: null,
        last_active: null,
        message_count: 0,
        model: null,
      }],
    },
  });
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
    path: ACTIVE_SESSIONS_PATH,
    headers: { Accept: "application/json" },
  });
  for (const forbidden of ["auth", "username", "password", "credentials", "cookie", "Cookie", "authorization", "Authorization"]) {
    assert.equal(Object.hasOwn(requests[0], forbidden), false, forbidden);
    assert.equal(Object.hasOwn(requests[0].headers, forbidden), false, forbidden);
  }
});

test("unsafe headers, incomplete or malformed schemas, and raw-bearing rows fail with one fixed error", async () => {
  const marker = "PRIVATE-RAW-MARKER";
  const validRow = {
    id: "synthetic-live-id",
    session_key: "synthetic-durable-key",
    status: "idle",
    started_at: null,
    last_active: null,
    message_count: 0,
    model: null,
  };
  const cases = [
    response(validEnvelope(), { statusCode: 204 }),
    response(validEnvelope(), { headers: {
      "content-type": "text/plain",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    } }),
    response(validEnvelope(), { headers: {
      "content-type": "application/json",
      "cache-control": "private",
      "x-content-type-options": "nosniff",
    } }),
    response(validEnvelope(), { headers: {
      "content-type": "application/json; charset=utf-16",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    } }),
    response(validEnvelope(), { headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "sniff",
    } }),
    response(`{"${marker}":`),
    response(validEnvelope({ schema_version: "future.schema.v2" })),
    response(validEnvelope({ read_only: false })),
    response(validEnvelope({ truncated: true })),
    response({ ...validEnvelope(), future_field: marker }),
    response(validEnvelope({ sessions: [{ ...validRow, preview: marker }] })),
    response(validEnvelope({ sessions: [{ ...validRow, status: "done" }] })),
    response(validEnvelope({ sessions: [{ ...validRow, id: "x".repeat(513) }] })),
    response(validEnvelope({ sessions: Array.from({ length: 65 }, (_, index) => ({
      ...validRow,
      id: `synthetic-live-${index}`,
      session_key: `synthetic-key-${index}`,
    })) })),
  ];

  for (const upstreamResponse of cases) {
    const transport = createHermesLoopbackReadTransport({
      url: `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
      httpGet: async () => upstreamResponse,
    });
    await assert.rejects(
      transport.exchangeFrame(REQUEST_FRAME),
      (error) => error.code === "AGENT_RUNTIME_RESPONSE_MALFORMED"
        && error.message === "agent runtime response malformed"
        && !error.message.includes(marker),
    );
  }
});

test("raw bytes are bounded before JSON parsing", async () => {
  const transport = createHermesLoopbackReadTransport({
    url: `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
    maxResponseBytes: 64,
    httpGet: async () => response("{".repeat(65)),
  });

  await assert.rejects(
    transport.exchangeFrame(REQUEST_FRAME),
    (error) => error.code === "AGENT_RUNTIME_RESPONSE_OVERSIZE"
      && error.message === "agent runtime response oversized",
  );
});

test("timeout and request failure emit fixed errors and invalidate prior transport state", async () => {
  let invalidations = 0;
  const timeoutTransport = createHermesLoopbackReadTransport({
    url: `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
    timeoutMs: 5,
    httpGet: async () => await new Promise(() => {}),
  });
  timeoutTransport.onTransportInvalidated(() => { invalidations += 1; });

  await assert.rejects(
    timeoutTransport.exchangeFrame(REQUEST_FRAME),
    (error) => error.code === "AGENT_RUNTIME_TIMEOUT"
      && error.message === "agent runtime read timeout",
  );
  assert.equal(invalidations, 1);

  const failureTransport = createHermesLoopbackReadTransport({
    url: `http://127.0.0.1:42424${ACTIVE_SESSIONS_PATH}`,
    httpGet: async () => { throw new Error("PRIVATE-UPSTREAM-ERROR"); },
  });
  failureTransport.onTransportInvalidated(() => { invalidations += 1; });
  await assert.rejects(
    failureTransport.exchangeFrame(REQUEST_FRAME),
    (error) => error.code === "DISCONNECTED"
      && error.message === "agent runtime disconnected"
      && !error.message.includes("PRIVATE-UPSTREAM-ERROR"),
  );
  assert.equal(invalidations, 2);
});

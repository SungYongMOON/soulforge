import assert from "node:assert/strict";
import test from "node:test";

import {
  createAgentRuntimeReadModule,
  createInMemoryAgentRuntimeReadAdapter,
} from "./agent-runtime-read-module.mjs";

const NOW_MS = Date.parse("2026-08-24T12:00:00.000Z");
const OBSERVED_AT = "2026-08-24T12:00:00.000Z";

const BINDINGS = [
  {
    bot_id: "bot-alpha",
    agent_id: "agent-alpha",
    display_label: "Alpha Bot",
    hermes_session_key: "durable-alpha",
  },
  {
    bot_id: "bot-beta",
    agent_id: "agent-beta",
    display_label: "Beta Bot",
    hermes_session_key: null,
  },
];

function activeSession({
  id = "live-alpha",
  sessionKey = "durable-alpha",
  status = "working",
  model = "provider/model-alpha",
} = {}) {
  return {
    id,
    session_key: sessionKey,
    status,
    started_at: "2026-08-24T11:30:00.000Z",
    last_active: "2026-08-24T11:59:59.000Z",
    message_count: 4,
    model,
  };
}

function createModule(response, options = {}) {
  const adapter = createInMemoryAgentRuntimeReadAdapter({ response });
  return {
    adapter,
    module: createAgentRuntimeReadModule({
      adapter,
      bindings: BINDINGS,
      now: () => NOW_MS,
      ...options,
    }),
  };
}

function expectedUnknownBot(binding, holdCode) {
  return {
    bot_id: binding.bot_id,
    agent_id: binding.agent_id,
    display_label: binding.display_label,
    hermes: {
      durable_session_key: binding.hermes_session_key,
      live_session_id: null,
    },
    state: { kind: "unknown", value: null },
    model: { kind: "unknown", value: null },
    provider: { kind: "unknown", value: null },
    usage: { kind: "unavailable" },
    heartbeat: { kind: "unknown" },
    result: { kind: "unknown" },
    hold_code: holdCode,
  };
}

test("readProjection binds only the exact durable session key and retains the live id", async () => {
  const { module } = createModule({
    sessions: [
      activeSession({ id: "durable-alpha", sessionKey: "agent-alpha", status: "idle" }),
      activeSession(),
    ],
  });

  const projection = await module.readProjection();

  assert.deepEqual(projection, {
    schema_version: "soulforge.agent_runtime_read_projection.v1",
    read_only: 1,
    refresh_state: "ready",
    observed_at: OBSERVED_AT,
    source: { kind: "agent_runtime_gateway_active_sessions" },
    evidence_counts: {
      configured_bots: 2,
      active_sessions: 2,
      matched_bots: 1,
      unmatched_active_sessions: 1,
    },
    bots: [
      {
        bot_id: "bot-alpha",
        agent_id: "agent-alpha",
        display_label: "Alpha Bot",
        hermes: {
          durable_session_key: "durable-alpha",
          live_session_id: "live-alpha",
        },
        state: { kind: "observed", value: "working" },
        model: { kind: "provider_reported", value: "provider/model-alpha" },
        provider: { kind: "unknown", value: null },
        usage: { kind: "unavailable" },
        heartbeat: { kind: "unknown" },
        result: { kind: "unknown" },
        hold_code: null,
      },
      expectedUnknownBot(BINDINGS[1], "SESSION_BINDING_MISSING"),
    ],
    hold_code: null,
  });
});

test("readProjection preserves only working, starting, waiting, and idle observations", async () => {
  for (const status of ["working", "starting", "waiting", "idle"]) {
    const { module } = createModule({ sessions: [activeSession({ status, model: null })] });
    const projection = await module.readProjection();
    assert.deepEqual(projection.bots[0].state, { kind: "observed", value: status });
    assert.deepEqual(projection.bots[0].model, { kind: "unknown", value: null });
    assert.deepEqual(projection.bots[0].provider, { kind: "unknown", value: null });
    assert.deepEqual(projection.bots[0].usage, { kind: "unavailable" });
    assert.deepEqual(projection.bots[0].heartbeat, { kind: "unknown" });
    assert.deepEqual(projection.bots[0].result, { kind: "unknown" });
  }
});

test("an empty successful list is ready with zero active sessions and UNKNOWN Bots", async () => {
  const { module } = createModule({ sessions: [] });

  const projection = await module.readProjection();

  assert.equal(projection.refresh_state, "ready");
  assert.deepEqual(projection.evidence_counts, {
    configured_bots: 2,
    active_sessions: 0,
    matched_bots: 0,
    unmatched_active_sessions: 0,
  });
  assert.deepEqual(projection.bots, [
    expectedUnknownBot(BINDINGS[0], "SESSION_NOT_ACTIVE"),
    expectedUnknownBot(BINDINGS[1], "SESSION_BINDING_MISSING"),
  ]);
  assert.doesNotMatch(JSON.stringify(projection), /\b(?:done|offline)\b/u);
});

test("duplicate live ids, duplicate durable keys, and conflicting bindings poison the whole read", async () => {
  const duplicateLive = createModule({
    sessions: [
      activeSession(),
      activeSession({ id: "live-alpha", sessionKey: "durable-other" }),
    ],
  }).module;
  assert.equal((await duplicateLive.readProjection()).hold_code, "DUPLICATE_LIVE_SESSION_ID");

  const duplicateDurable = createModule({
    sessions: [
      activeSession(),
      activeSession({ id: "live-other", sessionKey: "durable-alpha" }),
    ],
  }).module;
  assert.equal((await duplicateDurable.readProjection()).hold_code, "DUPLICATE_DURABLE_SESSION_KEY");

  const adapter = createInMemoryAgentRuntimeReadAdapter({ response: { sessions: [] } });
  const conflictingBindings = createAgentRuntimeReadModule({
    adapter,
    bindings: [
      BINDINGS[0],
      { ...BINDINGS[1], hermes_session_key: "durable-alpha" },
    ],
    now: () => NOW_MS,
  });
  const conflict = await conflictingBindings.readProjection();
  assert.equal(conflict.refresh_state, "hold");
  assert.equal(conflict.hold_code, "BINDING_CONFLICT");
  assert.equal(conflict.bots.every((row) => row.state.kind === "unknown"), true);
});

test("raw-bearing or unknown fields poison the whole response without echoing payloads", async () => {
  const hostileKeys = [
    "preview",
    "title",
    "messages",
    "content",
    "reasoning",
    "prompt",
    "system_prompt",
    "tool_input",
    "tool_output",
    "cwd",
    "path",
    "credential",
    "future_field",
  ];

  for (const key of hostileKeys) {
    const secretMarker = `private-${key}-marker`;
    const row = { ...activeSession(), [key]: secretMarker };
    const { module } = createModule({ sessions: [row] });
    const projection = await module.readProjection();
    assert.equal(projection.refresh_state, "hold", key);
    assert.equal(projection.hold_code, "RAW_OR_UNKNOWN_FIELD_FORBIDDEN", key);
    assert.equal(JSON.stringify(projection).includes(secretMarker), false, key);
    assert.equal(projection.bots.every((bot) => bot.state.kind === "unknown"), true, key);
  }
});

test("malformed, oversized, and row-limit responses return fixed HOLD envelopes", async () => {
  const malformed = createModule({ sessions: "not-an-array" }).module;
  assert.equal((await malformed.readProjection()).hold_code, "GATEWAY_RESPONSE_MALFORMED");

  const invalidState = createModule({ sessions: [activeSession({ status: "done" })] }).module;
  assert.equal((await invalidState.readProjection()).hold_code, "GATEWAY_RESPONSE_MALFORMED");

  const oversized = createModule(
    { sessions: [activeSession()] },
    { limits: { max_response_bytes: 64 } },
  ).module;
  assert.equal((await oversized.readProjection()).hold_code, "GATEWAY_RESPONSE_OVERSIZE");

  const rowLimited = createModule(
    {
      sessions: [
        activeSession(),
        activeSession({ id: "live-other", sessionKey: "durable-other" }),
      ],
    },
    { limits: { max_rows: 1 } },
  ).module;
  assert.equal((await rowLimited.readProjection()).hold_code, "GATEWAY_ROW_LIMIT_EXCEEDED");
});

test("disconnect and restart invalidation clear cache so stale working is never served", async () => {
  let currentTime = NOW_MS;
  const adapter = createInMemoryAgentRuntimeReadAdapter({
    response: { sessions: [activeSession()] },
  });
  const module = createAgentRuntimeReadModule({
    adapter,
    bindings: BINDINGS,
    now: () => currentTime,
    limits: { cache_ms: 60_000 },
  });

  const working = await module.readProjection();
  assert.deepEqual(working.bots[0].state, { kind: "observed", value: "working" });

  currentTime += 1_000;
  adapter.disconnect();
  const disconnected = await module.readProjection();
  assert.equal(disconnected.hold_code, "GATEWAY_DISCONNECTED");
  assert.equal(disconnected.bots.every((row) => row.state.kind === "unknown"), true);

  currentTime += 1_000;
  adapter.restart({ sessions: [] });
  const restarted = await module.readProjection();
  assert.equal(restarted.refresh_state, "ready");
  assert.equal(restarted.evidence_counts.active_sessions, 0);
  assert.equal(restarted.bots.every((row) => row.state.kind === "unknown"), true);
});

test("concurrent reads are single-flight and callers cannot mutate cached projections", async () => {
  let reads = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const adapter = {
    async readActiveSessions() {
      reads += 1;
      await pending;
      return { sessions: [activeSession()] };
    },
  };
  const module = createAgentRuntimeReadModule({
    adapter,
    bindings: BINDINGS,
    now: () => NOW_MS,
    limits: { cache_ms: 60_000 },
  });

  const firstRead = module.readProjection();
  const secondRead = module.readProjection();
  release();
  const [first, second] = await Promise.all([firstRead, secondRead]);

  assert.equal(reads, 1);
  first.bots[0].state.value = "idle";
  assert.equal(second.bots[0].state.value, "working");
  const cached = await module.readProjection();
  assert.equal(reads, 1);
  assert.equal(cached.bots[0].state.value, "working");
});

import test from "node:test";
import assert from "node:assert/strict";

import { createAgentRuntimeReadModule, createInMemoryAgentRuntimeReadAdapter } from "./agent-runtime-read-module.mjs";

// Hermes/agent-runtime WATCH boundary (module-operability gate, leaf 2).
//
// The agent-runtime snapshot endpoint is the Watch strip's hermes_runtime
// evidence source, so its envelope is a COARSE AGGREGATE boundary: session
// rows may carry identity, status, timestamps, a message COUNT, and a model
// slug — never message/prompt/thread content. This test pins that boundary
// against the live read module with a synthetic gateway adapter.

const SESSION_ROW_ALLOWLIST = ["id", "session_key", "status", "started_at", "last_active", "message_count", "model"];
const FORBIDDEN_VOCABULARY = /message_body|message_text|\bprompt\b|\btranscript\b|\bcontent\b|raw_message|thread_text|last_message/i;

function syntheticAdapter(sessions) {
  return createInMemoryAgentRuntimeReadAdapter({ response: { sessions } });
}

const BINDING = Object.freeze([{
  bot_id: "bot.synthetic",
  agent_id: "agent.synthetic",
  display_label: "synthetic bot",
  hermes_session_key: "sess-durable-1",
}]);

const ROW = Object.freeze({
  id: "live-1",
  session_key: "sess-durable-1",
  status: "working",
  started_at: 1700000000000,
  last_active: 1700000100000,
  message_count: 3,
  model: "synthetic-model",
});

test("a session row carrying content-shaped fields is refused, never projected", async () => {
  const module = createAgentRuntimeReadModule({
    adapter: syntheticAdapter([{ ...ROW, message_text: "the actual chat content" }]),
    bindings: BINDING,
    now: () => 1700000200000,
  });
  const envelope = await module.readProjection();
  assert.equal(envelope.refresh_state, "hold", "extra fields hold the whole projection, they are not stripped");
  assert.equal(envelope.hold_code, "RAW_OR_UNKNOWN_FIELD_FORBIDDEN", "held for the FIELD boundary, not a gateway fault");
  assert.equal(JSON.stringify(envelope).includes("actual chat content"), false, "refused content never leaks into the envelope");
});

test("the coarse-aggregate envelope carries only the pinned session vocabulary", async () => {
  const module = createAgentRuntimeReadModule({
    adapter: syntheticAdapter([ROW]),
    bindings: BINDING,
    now: () => 1700000200000,
  });
  const envelope = await module.readProjection();
  assert.equal(envelope.refresh_state, "ready");
  assert.equal(Array.isArray(envelope.bots), true);
  const bot = envelope.bots[0];
  assert.equal(bot.state.kind, "observed");
  assert.equal(bot.state.value, "working");
  // The projected bot carries aggregates and identity only.
  const flattened = JSON.stringify(envelope);
  assert.equal(FORBIDDEN_VOCABULARY.test(flattened), false, "no content vocabulary anywhere in the envelope");
  // The module's own accepted row shape is exactly the coarse allowlist:
  // adding a field to SESSION_FIELDS is a deliberate boundary change that
  // must fail here first.
  const widened = await createAgentRuntimeReadModule({
    adapter: syntheticAdapter([{ ...ROW, extra_aggregate: 1 }]),
    bindings: BINDING,
    now: () => 1700000200000,
  }).readProjection();
  assert.equal(widened.refresh_state, "hold", "any row field outside the allowlist holds the projection");
  assert.deepEqual(Object.keys(ROW).sort(), [...SESSION_ROW_ALLOWLIST].sort(), "this test's pinned allowlist matches the row it feeds");
});

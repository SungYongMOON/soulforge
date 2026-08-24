import assert from "node:assert/strict";
import test from "node:test";

import { projectHermesBotsSnapshot } from "./hermes-bots-adapter.mjs";

const ROSTER = {
  bots: [
    { botId: "bot-hermes-default", botName: "제품 총괄" },
    { botId: null, botName: "Ox 제작자" },
    { botId: null, botName: "Ox 검토자" },
  ],
};

function runtimeBot({
  botId = "bot-hermes-default",
  displayLabel = "Provider-controlled label",
  state = "working",
  extra = {},
} = {}) {
  return {
    bot_id: botId,
    agent_id: "owner-approved-agent",
    display_label: displayLabel,
    hermes: { durable_session_key: "durable", live_session_id: "live" },
    state: { kind: "observed", value: state },
    model: { kind: "provider_reported", value: "provider/model" },
    provider: { kind: "unknown", value: null },
    usage: { kind: "unavailable" },
    heartbeat: { kind: "unknown" },
    result: { kind: "unknown" },
    hold_code: null,
    ...extra,
  };
}

function readySnapshot(bots) {
  return {
    schema_version: "soulforge.agent_runtime_read_projection.v1",
    read_only: 1,
    refresh_state: "ready",
    observed_at: "2026-08-24T12:00:00.000Z",
    source: { kind: "agent_runtime_gateway_active_sessions" },
    evidence_counts: {
      configured_bots: bots.length,
      active_sessions: bots.length,
      matched_bots: bots.length,
      unmatched_active_sessions: 0,
    },
    bots,
    hold_code: null,
  };
}

test("projection activates only 제품 총괄 through exact bot-hermes-default while unbound roles stay UNKNOWN/HOLD", () => {
  const snapshot = readySnapshot([
    runtimeBot({ botId: "different-id", displayLabel: "제품 총괄", state: "idle" }),
    runtimeBot({ botId: "bot-hermes-default", displayLabel: "Untrusted renamed label", state: "working" }),
  ]);

  const rows = projectHermesBotsSnapshot(snapshot, ROSTER);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].botName, "제품 총괄");
  assert.equal(rows[0].state, "working");
  assert.equal(rows[0].stateLabel, "작업 중");
  assert.equal(rows[1].botName, "Ox 제작자");
  assert.equal(rows[1].state, "hold");
  assert.equal(rows[1].stateLabel, null);
  assert.equal(rows[1].hold, "UNKNOWN_STATE_FOR_BOT_DISPLAY");
  assert.equal(rows[2].botName, "Ox 검토자");
  assert.equal(rows[2].state, "hold");
  assert.equal(rows[2].stateLabel, null);
  assert.equal(rows[2].hold, "UNKNOWN_STATE_FOR_BOT_DISPLAY");
  assert.equal(JSON.stringify(rows).includes("Untrusted renamed label"), false);
});

test("projection preserves working, starting, waiting, and idle without claiming completion", () => {
  for (const [state, label] of [
    ["working", "작업 중"],
    ["starting", "시작 중"],
    ["waiting", "대기 중"],
    ["idle", "유휴"],
  ]) {
    const rows = projectHermesBotsSnapshot(readySnapshot([runtimeBot({ state })]), ROSTER);
    assert.equal(rows[0].state, state);
    assert.equal(rows[0].stateLabel, label);
    assert.notEqual(rows[0].state, "done");
    assert.deepEqual(rows[0].usage, { kind: "unavailable" });
    assert.deepEqual(rows[0].heartbeat, { kind: "unknown", ageSeconds: null });
    assert.deepEqual(rows[0].result, { status: "unknown" });
  }
});

test("missing, invalid, held, or duplicate projections discard observations to UNKNOWN/HOLD", () => {
  const held = { ...readySnapshot([runtimeBot()]), refresh_state: "hold", hold_code: "SAFE_FIXED_CODE" };
  const duplicate = readySnapshot([runtimeBot(), runtimeBot({ state: "idle" })]);
  const invalidState = readySnapshot([runtimeBot({ state: "done" })]);

  for (const snapshot of [null, {}, held, duplicate, invalidState]) {
    const rows = projectHermesBotsSnapshot(snapshot, ROSTER);
    assert.equal(rows.length, 3);
    assert.equal(rows.every((row) => row.state === "hold" && row.stateLabel === null), true);
    assert.equal(rows.every((row) => row.hold === "UNKNOWN_STATE_FOR_BOT_DISPLAY"), true);
  }
});

test("hostile raw fields poison the matched row without exposing keys or values", () => {
  const marker = "PRIVATE-RAW-MARKER";
  for (const key of ["content", "reasoning", "transcript", "title", "preview", "path", "cwd"]) {
    const rows = projectHermesBotsSnapshot(
      readySnapshot([runtimeBot({ extra: { [key]: marker } })]),
      ROSTER,
    );
    assert.equal(rows[0].state, "hold", key);
    assert.equal(rows[0].hold, "UNKNOWN_STATE_FOR_BOT_DISPLAY", key);
    assert.equal(JSON.stringify(rows).includes(marker), false, key);
    assert.equal(JSON.stringify(rows).includes(key), false, key);
  }
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildHermesBotPanelViewModel } from "./hermes-bot-panel.mjs";

const NOW_MS = Date.parse("2026-08-23T23:30:00+09:00");

function baseBot(overrides = {}) {
  return {
    botName: "Ox 제작자",
    state: "working",
    goalLabel: "P1 관찰 UI",
    stageLabel: "구현",
    model: "stealth/ox-alpha",
    provider: "openrouter",
    lastHeartbeatAtMs: NOW_MS - 60_000,
    directUsage: { inputTokens: 20037, outputTokens: 8, cacheReadTokens: 576 },
    resultStatus: "available",
    openTargetSessionId: "20260823_214552_24ed3b",
    ...overrides,
  };
}

describe("buildHermesBotPanelViewModel", () => {
  it("non-array input fails closed with a hold, not an empty-ok panel", () => {
    const vm = buildHermesBotPanelViewModel({ bots: "nope", nowMs: NOW_MS });
    assert.equal(vm.ok, false);
    assert.equal(vm.hold, "INPUT_NOT_ARRAY");
  });

  it("sorts running attention first: working, reviewing, waiting, done, hold last", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [
        baseBot({ botName: "done-bot", state: "done" }),
        baseBot({ botName: "working-bot", state: "working" }),
        baseBot({ botName: "waiting-bot", state: "waiting" }),
        baseBot({ botName: "reviewing-bot", state: "reviewing" }),
        baseBot({ botName: "hold-bot", state: "hold" }),
      ],
    });
    assert.equal(vm.ok, true);
    assert.deepEqual(
      vm.rows.map((r) => r.botName),
      ["working-bot", "reviewing-bot", "waiting-bot", "done-bot", "hold-bot"]
    );
  });

  it("maps every contract state to a Korean display label", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [
        baseBot({ state: "working" }),
        baseBot({ state: "reviewing" }),
        baseBot({ state: "waiting" }),
        baseBot({ state: "done" }),
        baseBot({ state: "hold" }),
      ],
    });
    assert.deepEqual(
      vm.rows.map((r) => r.stateLabel),
      ["작업 중", "검토 중", "대기 중", "완료", "보류(HOLD)"]
    );
  });

  it("rejects an out-of-vocabulary state as display-held instead of guessing", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [baseBot({ state: "vibing" })],
    });
    assert.equal(vm.rows[0].hold, "UNKNOWN_STATE_FOR_BOT_DISPLAY");
    assert.equal(vm.rows[0].stateLabel, null);
  });

  it("builds the verified hermes://open deep link only for exact-shaped session ids", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [baseBot()],
    });
    assert.deepEqual(vm.rows[0].open, {
      supported: true,
      url: "hermes://open/20260823_214552_24ed3b",
    });
  });

  it("never fabricates an open path for a malformed session id", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [baseBot({ openTargetSessionId: "my-chat-title" })],
    });
    assert.deepEqual(vm.rows[0].open, {
      supported: false,
      reason: "OPEN_PATH_UNAVAILABLE",
    });
  });

  it("keeps exact direct usage numbers verbatim", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [baseBot()],
    });
    assert.deepEqual(vm.rows[0].usage, {
      kind: "exact",
      inputTokens: 20037,
      outputTokens: 8,
      cacheReadTokens: 576,
    });
  });

  it("distinguishes unavailable usage from unknown usage and never substitutes zeros", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [
        baseBot({ botName: "no-field", directUsage: undefined }),
        baseBot({ botName: "null-field", directUsage: null }),
        baseBot({ botName: "partial", directUsage: { inputTokens: 12 } }),
      ],
    });
    assert.deepEqual(vm.rows[0].usage, { kind: "unavailable" });
    assert.deepEqual(vm.rows[1].usage, { kind: "unknown" });
    assert.deepEqual(vm.rows[2].usage, { kind: "unknown" });
  });

  it("reports heartbeat freshness from the injected clock and holds unknown clocks honestly", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [
        baseBot({ botName: "fresh", lastHeartbeatAtMs: NOW_MS - 60_000 }),
        baseBot({ botName: "stale", lastHeartbeatAtMs: NOW_MS - 3_600_000 }),
        baseBot({ botName: "missing", lastHeartbeatAtMs: null }),
      ],
    });
    assert.deepEqual(vm.rows[0].heartbeat, { kind: "fresh", ageSeconds: 60 });
    assert.deepEqual(vm.rows[1].heartbeat, { kind: "stale", ageSeconds: 3600 });
    assert.deepEqual(vm.rows[2].heartbeat, { kind: "unknown", ageSeconds: null });
  });

  it("holds rows carrying forbidden raw-body keys and never surfaces their values", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [baseBot({ promptText: "SECRET-PROMPT-BODY" })],
    });
    assert.equal(vm.rows[0].hold, "RAW_OR_UNKNOWN_FIELD_FORBIDDEN");
    assert.equal(JSON.stringify(vm).includes("SECRET-PROMPT-BODY"), false);
  });

  it("labels result evidence availability without inventing results", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [
        baseBot({ botName: "a", resultStatus: "available" }),
        baseBot({ botName: "b", resultStatus: "missing" }),
        baseBot({ botName: "c", resultStatus: "unknown" }),
      ],
    });
    assert.deepEqual(vm.rows.map((r) => r.result.status), ["available", "missing", "unknown"]);
  });

  it("is dependency-free and side-effect-free by construction", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./hermes-bot-panel.mjs", import.meta.url), "utf8");
    for (const banned of ["node:fs", "node:http", "fetch(", "require(", "process.", "Date."]) {
      assert.equal(src.includes(banned), false, `source must not use ${banned}`);
    }
  });
});

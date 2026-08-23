import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HARNESS_DEFAULT_PORT, renderHermesBotHarnessHtml } from "./hermes-bot-harness.mjs";
import { buildHermesBotPanelViewModel } from "./hermes-bot-panel.mjs";

const NOW_MS = Date.parse("2026-08-23T23:30:00+09:00");

function sampleViewModel() {
  return buildHermesBotPanelViewModel({
    nowMs: NOW_MS,
    bots: [
      {
        botName: "Ox 검토자<script>",
        state: "reviewing",
        goalLabel: "P1 리뷰",
        stageLabel: "직접 UI 확인",
        model: "stealth/ox-alpha",
        provider: "openrouter",
        lastHeartbeatAtMs: NOW_MS - 45_000,
        directUsage: { inputTokens: 1500, outputTokens: 40, cacheReadTokens: 0 },
        resultStatus: "unknown",
        openTargetSessionId: "20260823_214746_9164e0",
      },
      {
        botName: "신규 봇",
        state: "waiting",
        goalLabel: null,
        stageLabel: null,
        model: "stealth/ox-alpha",
        provider: "openrouter",
        lastHeartbeatAtMs: null,
        directUsage: null,
        resultStatus: "missing",
        openTargetSessionId: "not-a-session-id",
      },
      {
        botName: "이상 입력",
        state: "hold",
        promptText: "RAW-BODY-SHOULD-NOT-RENDER",
      },
    ],
  });
}

describe("renderHermesBotHarnessHtml", () => {
  it("pins the reviewed non-production port constant away from 4192", () => {
    assert.equal(typeof HARNESS_DEFAULT_PORT, "number");
    assert.notEqual(HARNESS_DEFAULT_PORT, 4192);
  });

  it("escapes hostile-looking safe labels instead of injecting markup", () => {
    const html = renderHermesBotHarnessHtml(sampleViewModel());
    assert.equal(html.includes("<script>"), false);
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("renders the verified open action as a hermes:// link with the exact session id", () => {
    const html = renderHermesBotHarnessHtml(sampleViewModel());
    assert.ok(html.includes('href="hermes://open/20260823_214746_9164e0"'));
    assert.ok(html.includes("Hermes에서 대화 열기"));
  });

  it("shows the honest no-path label instead of a fabricated link", () => {
    const html = renderHermesBotHarnessHtml(sampleViewModel());
    assert.ok(html.includes("열기 경로 없음"));
    assert.equal(html.includes('href="hermes://open/not-a-session-id"'), false);
  });

  it("renders distinct presentations for every lifecycle state plus unknown chips", () => {
    const vm = buildHermesBotPanelViewModel({
      nowMs: NOW_MS,
      bots: [
        { botName: "w", state: "working" },
        { botName: "r", state: "reviewing" },
        { botName: "q", state: "waiting" },
        { botName: "d", state: "done" },
        { botName: "h", state: "hold" },
      ],
    });
    const html = renderHermesBotHarnessHtml(vm);
    for (const marker of [
      "data-state=\"working\"",
      "data-state=\"reviewing\"",
      "data-state=\"waiting\"",
      "data-state=\"done\"",
      "data-state=\"hold\"",
    ]) {
      assert.ok(html.includes(marker), `missing ${marker}`);
    }
  });

  it("surfaces partial truth: unknown usage and unknown heartbeat become visible chips", () => {
    const html = renderHermesBotHarnessHtml(sampleViewModel());
    assert.ok(html.includes("사용량 알 수 없음"));
    assert.ok(html.includes("사용량 정보 없음"));
    assert.ok(html.includes("마지막 신호 알 수 없음"));
  });

  it("never renders raw payload values anywhere in the document", () => {
    const html = renderHermesBotHarnessHtml(sampleViewModel());
    assert.equal(html.includes("RAW-BODY-SHOULD-NOT-RENDER"), false);
    assert.ok(html.includes("표시 보류"));
  });

  it("is readable at mobile width and keyboard-focusable for primary actions", () => {
    const html = renderHermesBotHarnessHtml(sampleViewModel());
    assert.ok(html.includes('name="viewport"'));
    assert.ok(html.includes("@media"));
    assert.ok(html.includes(":focus-visible"));
  });

  it("renders an honest empty state when nothing is observed yet", () => {
    const vm = buildHermesBotPanelViewModel({ bots: [], nowMs: NOW_MS });
    const html = renderHermesBotHarnessHtml(vm);
    assert.ok(html.includes("관찰 중인 Bot 활동 없음"));
  });
});

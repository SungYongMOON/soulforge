// Hermes Bot 관찰 하니스 정적 서버 - node:http 기반, 외부 요청 없음.
// 어댑터 출력(rows)을 renderHermesBotHarnessHtml({generatedAtMs, rows})로 넘겨 렌더한다.

import http from "node:http";

import { projectHermesBotsSnapshot } from "../core/hermes-bots-adapter.mjs";
import { HARNESS_DEFAULT_PORT, renderHermesBotHarnessHtml } from "../core/hermes-bot-harness.mjs";

const NOW_MS = Date.parse("2026-08-23T23:30:00+09:00");

const SAMPLE_SNAPSHOT = {
  generatedAtMs: NOW_MS,
  bots: [
    {
      botName: "Ox 검토자",
      state: "reviewing",
      goalLabel: "P1 리뷰",
      stageLabel: "직접 UI 확인",
      model: "stealth/ox-alpha",
      provider: "openrouter",
      lastHeartbeatAtMs: NOW_MS - 45_000,
      directUsage: { inputTokens: 1500, outputTokens: 40, cacheReadTokens: 0 },
      resultStatus: "available",
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
      openTargetSessionId: null,
    },
    {
      botName: "부분 미지원 봇",
      state: "working",
      goalLabel: "부분 관측",
      stageLabel: "스냅샷 일부 누락",
      model: "stealth/ox-alpha",
      provider: "openrouter",
      lastHeartbeatAtMs: NOW_MS - 3_600_000,
      resultStatus: "unknown",
      openTargetSessionId: "not-a-session-id",
    },
  ],
};

function buildIndexHtml() {
  const rows = projectHermesBotsSnapshot(SAMPLE_SNAPSHOT);
  return renderHermesBotHarnessHtml({ generatedAtMs: NOW_MS, rows });
}

export function startHermesBotHarnessServer({ port = HARNESS_DEFAULT_PORT } = {}) {
  const html = buildIndexHtml();
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve({ port, close: () => server.close() }));
  });
}

const isDirectRun = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isDirectRun) {
  startHermesBotHarnessServer().then(({ port }) => {
    console.log(`Hermes bot harness listening on ${port}`);
  });
}

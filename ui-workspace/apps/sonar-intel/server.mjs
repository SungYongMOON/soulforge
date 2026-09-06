#!/usr/bin/env node
// 소나 인텔 플랫폼 v1 Goal #1 서버: 외부 의존성 0 (node:http + node:sqlite 또는 JSONL fallback).
// 사용: node server.mjs [--port 4420] [--data-dir <path>]
//
// loopback 전용(127.0.0.1) — HOST는 flag/env로 바꿀 수 없다. 이 앱은 사내 단독 사용자용
// 인텔 도구이므로 팀 접속 표면을 열지 않는다(AGENTS.md 팀원 라우팅 규칙: World Tree/dev-erp만
// Owner 감독용 loopback, 다른 앱을 팀에 열지 않음 — sonar-intel도 같은 경계를 따른다).
//
// 이 서버는 읽기 전용이다: 대시보드와 /api/*는 store만 읽는다. 외부 네트워크 호출(Google
// News/Defense News/arXiv fetch)은 이 서버가 아니라 `npm run collect`(tools/collect_once.mjs)
// 에서만 일어난다 — HTTP 요청 하나가 실수로 외부 수집을 트리거하는 경로를 만들지 않기 위함.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "./src/store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

// Port: no fixed Soulforge lane uses 4420 as of this writing (checked against
// dev-erp 4300/4310, dev-erp-mcp 4311, Vigil 4192, team-ops-board 4791/3100 —
// see README "포트"). Override with --port or SONAR_INTEL_PORT for local conflicts.
const DEFAULT_PORT = 4420;
const PORT = Number(flag("port", process.env.SONAR_INTEL_PORT || DEFAULT_PORT));
const HOST = "127.0.0.1";
const DATA_DIR = path.resolve(flag("data-dir", process.env.SONAR_INTEL_DATA_DIR || path.join(HERE, "data")));
const CONFIG_DIR = path.join(HERE, "config");
const STATIC_DIR = path.join(HERE, "static");

function loadJsonConfig(fileName) {
  const filePath = path.join(CONFIG_DIR, fileName);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

function readLastRun() {
  const lastRunPath = path.join(DATA_DIR, "last_run.json");
  if (!existsSync(lastRunPath)) return null;
  try {
    return JSON.parse(readFileSync(lastRunPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const sourcesConfig = loadJsonConfig("sources.json");
  const keywordsConfig = loadJsonConfig("keywords.json");
  const store = await openStore({ dataDir: DATA_DIR });
  console.log(`[sonar-intel] store backend: ${store.backendName} (${store.path})`);

  const indexHtmlPath = path.join(STATIC_DIR, "index.html");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const p = url.pathname;

      if (req.method !== "GET") {
        sendJson(res, 405, { error: "method_not_allowed" });
        return;
      }

      if (p === "/" || p === "/index.html") {
        const html = existsSync(indexHtmlPath)
          ? readFileSync(indexHtmlPath, "utf8")
          : "<!doctype html><title>sonar-intel</title><p>static/index.html missing</p>";
        sendHtml(res, 200, html);
        return;
      }

      if (p === "/api/status") {
        const enabledSources = summarizeEnabledSources(sourcesConfig);
        sendJson(res, 200, {
          app: "sonar-intel",
          backend: store.backendName,
          storePath: store.path,
          sources: enabledSources,
          collection: store.summarize(),
          totalItems: store.countItems(),
          lastRun: readLastRun(),
        });
        return;
      }

      if (p === "/api/signals") {
        const type = url.searchParams.get("type") || undefined;
        const source = url.searchParams.get("source") || undefined;
        const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
        const items = store.listItems({ type, source, limit });
        sendJson(res, 200, { count: items.length, items });
        return;
      }

      if (p === "/api/keywords") {
        sendJson(res, 200, keywordsConfig);
        return;
      }

      sendJson(res, 404, { error: "not_found", path: p });
    } catch (error) {
      sendJson(res, 500, { error: "internal_error", message: String(error?.message ?? error) });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[sonar-intel] http://${HOST}:${PORT} (data: ${DATA_DIR})`);
  });

  const shutdown = () => {
    console.log("[sonar-intel] shutting down");
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function summarizeEnabledSources(sourcesConfig) {
  const summary = {};
  for (const [key, value] of Object.entries(sourcesConfig)) {
    if (key.startsWith("$")) continue;
    if (value && typeof value === "object" && "enabled" in value) {
      summary[key] = { enabled: value.enabled, note: value.note ?? value.cadence_note ?? null };
    }
  }
  return summary;
}

main().catch((error) => {
  console.error("[sonar-intel] fatal", error);
  process.exit(1);
});

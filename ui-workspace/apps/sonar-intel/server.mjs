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
import { existsSync, readFileSync, openSync, fstatSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "./src/store.mjs";
import { LIMITS, RULE_VERSION, isoDate, safeSourceUrl, selectRelations } from "./src/analysis/index.mjs";
import { SOURCE_IDS, sourceContract, validateProvenance } from "./src/collectors/source_contract.mjs";

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
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  });
  res.end(html);
}

function readBoundedJson(file, maximumBytes) {
  let fd;
  try {
    // One file descriptor pins an atomically published snapshot across rename.
    fd = openSync(file, "r");
    const size = fstatSync(fd).size;
    if (size > maximumBytes) return null;
    const bytes = Buffer.alloc(size + 1);
    let count = 0; let read;
    do { read = readSync(fd, bytes, count, bytes.length - count, null); count += read; } while (read && count < bytes.length);
    if (count !== size) return null;
    return JSON.parse(bytes.subarray(0, count).toString("utf8"));
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}

function lastRunMetadata(run) {
  const finishedAt = isoDate(run?.finishedAt);
  if (!finishedAt) return null;
  const fields = ["fetched", "stored", "deduped"];
  const totals = fields.every((field) => Number.isSafeInteger(run?.totals?.[field]) && run.totals[field] >= 0)
    ? Object.fromEntries(fields.map((field) => [field, run.totals[field]])) : null;
  return { finishedAt, totals };
}

function readLastRun(dataDir) {
  return lastRunMetadata(readBoundedJson(path.join(dataDir, "last_run.json"), 256 * 1024));
}

export function createSonarServer({ store, sourcesConfig, keywordsConfig, analysisReport = null, lastRun = null, dataDir = null }) {
  const indexHtmlPath = path.join(STATIC_DIR, "index.html");
  const server = createServer(async (req, res) => {
    try {
      const origin = `http://${HOST}:${server.address().port}`;
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || (req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(req.headers["sec-fetch-site"]))) {
        sendJson(res, 403, { error: "same_origin_required" }); return;
      }
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
        const currentRun = dataDir ? readLastRun(dataDir) : lastRunMetadata(lastRun);
        const currentAnalysis = dataDir ? readAnalysis(dataDir) : analysisReport;
        sendJson(res, 200, {
          app: "sonar-intel",
          backend: store.backendName,
          sources: enabledSources,
          sourceContracts: SOURCE_IDS.map((source) => sourceContract(source, sourcesConfig[source])),
          collection: store.summarize(),
          totalItems: store.countItems(),
          lastRun: currentRun,
          analysisAsOf: currentAnalysis?.asOf ?? null,
          newCollectionSinceAnalysis: currentAnalysis && currentRun ? currentRun.finishedAt > currentAnalysis.asOf : null,
        });
        return;
      }

      if (p === "/api/signals") {
        const type = url.searchParams.get("type") || undefined;
        const source = url.searchParams.get("source") || undefined;
        const limit = Number(url.searchParams.get("limit") ?? 50);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200 || (type && !["news", "arxiv", "paper"].includes(type))) { sendJson(res, 400, { error: "invalid_filter" }); return; }
        const items = store.listItems({ type, source, limit }).map((row) => ({ id: row.id, type: row.type, source: row.source, title: row.title, url: safeSourceUrl(row.url), publishedAt: row.publishedAt, fetchedAt: row.fetchedAt, provenance: validateProvenance(row) ?? { accountState: "legacy_unverified", acceptance: "not_canonical_acceptance" }, keywordsMatched: Array.isArray(row.keywordsMatched) ? row.keywordsMatched.filter((term) => typeof term === "string") : [] }));
        sendJson(res, 200, { count: items.length, items });
        return;
      }

      if (["/api/analysis", "/api/relations", "/api/evidence"].includes(p)) {
        const currentAnalysis = dataDir ? readAnalysis(dataDir) : analysisReport;
        if (!currentAnalysis) { sendJson(res, 200, { state: "unavailable", reason: "analysis_snapshot_missing_or_invalid" }); return; }
        if ((url.searchParams.has("corpus") && url.searchParams.get("corpus") !== currentAnalysis.corpusDigest) || (url.searchParams.has("asOf") && url.searchParams.get("asOf") !== currentAnalysis.asOf)) {
          sendJson(res, 409, { error: "analysis_snapshot_changed" }); return;
        }
        if (p === "/api/analysis") {
          const { graphs, evidence, ...overview } = currentAnalysis;
          sendJson(res, 200, overview); return;
        }
        if (p === "/api/relations") {
          try {
            const result = selectRelations(currentAnalysis, { keyword: url.searchParams.get("keyword"), days: Number(url.searchParams.get("days") ?? 14), min: Number(url.searchParams.get("min") ?? 1) });
            sendJson(res, 200, result);
          } catch { sendJson(res, 400, { error: "invalid_relation_filter" }); }
          return;
        }
        const ids = (url.searchParams.get("id") ?? "").split(",");
        if (ids.length > 50 || ids.some((id) => !/^event_[a-f0-9]{24}$/.test(id))) { sendJson(res, 400, { error: "invalid_evidence_id" }); return; }
        const items = currentAnalysis.evidence.filter((row) => ids.includes(row.id));
        sendJson(res, items.length === ids.length ? 200 : 404, items.length === ids.length ? { corpusDigest: currentAnalysis.corpusDigest, items } : { error: "not_found" }); return;
      }

      if (p === "/api/keywords") {
        sendJson(res, 200, keywordsConfig);
        return;
      }

      sendJson(res, 404, { error: "not_found", path: p });
    } catch (error) {
      sendJson(res, 500, { error: "internal_error" });
    }
  });
  return server;
}

function readAnalysis(dataDir) {
  try {
    const report = readBoundedJson(path.join(dataDir, "analysis.json"), LIMITS.bytes);
    if (!report || !isoDate(report.asOf) || !/^[a-f0-9]{64}$/.test(report.corpusDigest)) return null;
    if (report.schema !== "sonar-intel-limited-analysis-v1" || report.ruleVersion !== RULE_VERSION || !Array.isArray(report.evidence) || !Array.isArray(report.terms) || !report.graphs || !report.weekly || !report.coverage) return null;
    if (report.evidence.length > LIMITS.records || report.terms.length > LIMITS.terms || report.terms.some((term) => typeof term !== "string" || term.length > 120) || report.evidence.some((row) => !Array.isArray(row.references) || row.references.some((ref) => safeSourceUrl(ref.url) !== ref.url))) return null;
    if ([7, 14, 28].some((days) => !Array.isArray(report.graphs[days]?.edges) || report.graphs[days].edges.length > LIMITS.edges || !Array.isArray(report.graphs[days]?.nodes) || report.graphs[days].nodes.length > LIMITS.terms)) return null;
    return report;
  } catch { return null; }
}

async function main() {
  const sourcesConfig = loadJsonConfig("sources.json");
  const keywordsConfig = loadJsonConfig("keywords.json");
  const store = await openStore({ dataDir: DATA_DIR, readOnly: true, maxBytes: LIMITS.bytes });
  const server = createSonarServer({ store, sourcesConfig, keywordsConfig, dataDir: DATA_DIR });

  server.listen(PORT, HOST, () => {
    console.log(`[sonar-intel] http://${HOST}:${server.address().port} (read-only)`);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error("[sonar-intel] fatal", error);
  process.exit(1);
});

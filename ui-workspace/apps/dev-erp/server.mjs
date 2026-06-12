#!/usr/bin/env node
// dev-erp P1 서버: 외부 의존성 0 (node:http + node:sqlite).
// 사용: node server.mjs [--port 4300] [--db data/dev-erp.db] [--ingest <json>]
// 기본: DB 가 비어 있으면 synthetic fixture 를 자동 적재 (data_label=synthetic).
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "./src/store.mjs";
import { loadFixture } from "./src/fixture.mjs";
import { ingestFromFile } from "./src/adapter.mjs";
import { getLexicon, LEXICON } from "./src/lexicon.mjs";
import { modulesFor } from "./src/modules.mjs";
import { crossSearch } from "./src/search.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const PORT = Number(flag("port", 4300));
// 기본은 localhost 전용(안전). 같은 네트워크 공유가 필요할 때만 --host 0.0.0.0
// (합성 데이터 파일럿 한정 권장 — 실데이터+팀 공개는 P2 RBAC 이후)
const HOST = flag("host", "127.0.0.1");
const DB_PATH = flag("db", join(HERE, "data", "dev-erp.db"));
if (DB_PATH !== ":memory:") mkdirSync(dirname(DB_PATH), { recursive: true });

const store = openStore(DB_PATH);
// P1b: data/real_meta.json 이 있으면 (갱신 시각 기준) 자동 ingest.
// 최초 실데이터 도착 시 합성 표본은 제거한다 (가짜/실제 혼합 방지).
const realMetaPath = join(HERE, "data", "real_meta.json");
if (existsSync(realMetaPath)) {
  const mtime = String(statSync(realMetaPath).mtimeMs);
  if (store.getMeta("real_ingest_mtime") !== mtime) {
    const purged = store.purgeSynthetic();
    const report = ingestFromFile(store, realMetaPath, { label: "real" });
    store.setMeta("real_ingest_mtime", mtime);
    console.log("[dev-erp] real meta ingested:", JSON.stringify({ purged_synthetic: purged, ...report }));
  }
} else if (store.counts().projects === 0) {
  const ingestPath = flag("ingest", null);
  if (ingestPath) {
    const report = ingestFromFile(store, resolve(ingestPath));
    console.log("[dev-erp] ingest:", JSON.stringify(report));
  } else {
    const counts = loadFixture(store);
    console.log("[dev-erp] synthetic fixture loaded:", JSON.stringify(counts));
  }
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const todayKey = () => new Date().toISOString().slice(0, 10);

function send(res, code, body, type = "application/json") {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(code, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  res.end(payload);
}

function lastIngestAt() {
  const rows = store.db.prepare("SELECT at FROM event_log WHERE kind='ingest' ORDER BY id DESC LIMIT 1").get();
  return rows?.at ?? null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const qp = Object.fromEntries(url.searchParams.entries());
  try {
    if (path === "/api/health") return send(res, 200, { ok: true, schema: "dev_erp.v1", counts: store.counts() });
    if (path === "/api/summary") {
      const today = todayKey();
      const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
      return send(res, 200, { today, week_end: weekEnd, freshness: lastIngestAt(), projects: store.summary(today, weekEnd) });
    }
    if (path === "/api/items") return send(res, 200, store.items({ project: qp.project, status: qp.status, q: qp.q, due_before: qp.due === "soon" ? todayKey() : undefined }));
    if (path === "/api/mail") return send(res, 200, store.mail({ project: qp.project, days: qp.days ? Number(qp.days) : 90 }));
    if (path === "/api/artifacts") return send(res, 200, store.artifacts({ project: qp.project, kind: qp.kind }));
    if (path === "/api/people") return send(res, 200, store.people());
    if (path === "/api/search") return send(res, 200, crossSearch(store, qp.q));
    if (path === "/api/lexicon") return send(res, 200, { mode: qp.mode ?? "business", modes: Object.keys(LEXICON), labels: getLexicon(qp.mode) });
    if (path === "/api/modules") return send(res, 200, modulesFor(qp.mode));
    if (path === "/api/events/recent") return send(res, 200, store.recentEvents(30));
    if (path === "/api/events" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const event = JSON.parse(body || "{}");
      if (!event.kind) return send(res, 400, { error: "kind_required" });
      store.appendEvent({ ...event, actor_kind: event.actor_kind ?? "human", data_label: event.data_label ?? "real" });
      return send(res, 200, { ok: true });
    }
    if (path.startsWith("/api/")) return send(res, 404, { error: "not_found" });

    // 정적 파일 (no-build 클라이언트)
    const file = path === "/" ? "/index.html" : path;
    const full = join(HERE, "static", file);
    if (!full.startsWith(join(HERE, "static")) || !existsSync(full)) return send(res, 404, "not found", "text/plain");
    return send(res, 200, readFileSync(full, "utf-8"), MIME[extname(full)] ?? "text/plain");
  } catch (error) {
    return send(res, 500, { error: String(error?.message ?? error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dev-erp] http://${HOST}:${PORT} (db: ${DB_PATH})`);
  if (HOST !== "127.0.0.1") {
    console.log("[dev-erp] 주의: 같은 네트워크에 열려 있음 - 합성 데이터 파일럿 용도로만");
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { openStore } from "../src/store.mjs";
import { buildAnalysis } from "../src/analysis/index.mjs";
import { createSonarServer } from "../server.mjs";
import { asOf, sourcesConfig, keywordsConfig, records, record } from "./fixtures/analysis_sample.mjs";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function withServer(report, operation) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "sonar-read-api-"));
  let server; let store;
  try {
    const writer = await openStore({ dataDir, backend: "jsonl" });
    for (const row of records) writer.upsertItem(row);
    writer.upsertItem(record("unsafe", { title: '<img src=x onerror="globalThis.attack=true">', url: "javascript:alert(1)" }));
    writer.close();
    const before = readFileSync(path.join(dataDir, "intel.jsonl"), "utf8");
    store = await openStore({ dataDir, readOnly: true });
    server = createSonarServer({ store, sourcesConfig, keywordsConfig, analysisReport: report });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    await operation(`http://127.0.0.1:${server.address().port}`);
    assert.equal(readFileSync(path.join(dataDir, "intel.jsonl"), "utf8"), before);
    assert.deepEqual(readdirSync(dataDir), ["intel.jsonl"]);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    store?.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

test("local HTTP smoke: HTML, corpus, bounded relations and evidence resolve without writes", async () => {
  const report = buildAnalysis(records, { asOf, sourcesConfig, keywordsConfig });
  await withServer(report, async (base) => {
    const html = await fetch(base);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.match(await html.text(), /id="evidence-detail"/);
    const overview = await (await fetch(base + "/api/analysis")).json();
    assert.equal(overview.corpusDigest, report.corpusDigest);
    assert.equal(overview.graphs, undefined);
    const relation = await (await fetch(base + "/api/relations?keyword=sas&days=14&min=1")).json();
    const id = relation.edges[0].evidenceIds[0];
    const detail = await (await fetch(base + "/api/evidence?id=" + id)).json();
    assert.equal(detail.corpusDigest, overview.corpusDigest);
    assert.equal(detail.items[0].id, id);
    assert.ok(detail.items[0].references[0].url.startsWith("https://"));
    const signals = await (await fetch(base + "/api/signals?type=news")).json();
    assert.ok(signals.items.every((row) => row.type === "news"));
    assert.equal(signals.items.find((row) => row.id === "unsafe").url, null);
  });
});

test("HTTP denies mutations, foreign browser reads and invalid filters without echoing secrets", async () => {
  await withServer(buildAnalysis(records, { asOf, sourcesConfig, keywordsConfig }), async (base) => {
    assert.equal((await fetch(base + "/api/analysis", { method: "POST", body: "secret" })).status, 405);
    assert.equal((await fetch(base + "/api/analysis", { headers: { Origin: "https://evil.example" } })).status, 403);
    const wrongHostStatus = await new Promise((resolve, reject) => {
      const req = request(base + "/api/analysis", { headers: { Host: "evil.example", Origin: base } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject); req.end();
    });
    assert.equal(wrongHostStatus, 403);
    assert.equal((await fetch(base + "/api/analysis", { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    assert.equal((await fetch(base + "/api/analysis", { headers: { "Sec-Fetch-Site": "same-origin" } })).status, 200);
    for (const route of ["/api/relations?keyword=https://private.example/?key=secret", "/api/relations?keyword=sas&days=1000", "/api/signals?limit=-1", "/api/evidence?id=secret"]) {
      const response = await fetch(base + route); assert.equal(response.status, 400); assert.ok(!(await response.text()).includes("secret"));
    }
    assert.equal((await fetch(base + "/api/evidence?id=event_000000000000000000000000")).status, 404);
  });
});

test("HTTP missing analysis stays unavailable and does not compute a report on demand", async () => {
  await withServer(null, async (base) => {
    assert.deepEqual(await (await fetch(base + "/api/analysis")).json(), { state: "unavailable", reason: "analysis_snapshot_missing_or_invalid" });
  });
});

test("actual offline analyze CLI is deterministic and preserves CORE bytes", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "sonar-analysis-cli-"));
  try {
    const store = await openStore({ dataDir, backend: "jsonl" });
    for (const row of records) store.upsertItem(row);
    store.close();
    const core = readFileSync(path.join(dataDir, "intel.jsonl"), "utf8");
    const args = ["--max-old-space-size=192", path.join(app, "tools/analyze_once.mjs"), "--data-dir", dataDir, "--as-of", asOf];
    const result = JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8", timeout: 10000 }));
    const first = readFileSync(path.join(dataDir, "analysis.json"), "utf8");
    assert.equal(JSON.parse(first).corpusDigest, result.corpusDigest);
    execFileSync(process.execPath, args, { encoding: "utf8", timeout: 10000 });
    assert.equal(readFileSync(path.join(dataDir, "analysis.json"), "utf8"), first);
    assert.equal(readFileSync(path.join(dataDir, "intel.jsonl"), "utf8"), core);
    assert.deepEqual(readdirSync(dataDir).sort(), ["analysis.json", "intel.jsonl"]);
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

test("same running server observes rewritten collection metadata and atomic new batch without restart", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "sonar-refresh-test-"));
  let server; let reader;
  try {
    const writer = await openStore({ dataDir, backend: "jsonl" });
    for (const row of records) writer.upsertItem(row);
    writer.close();
    const coreBytes = readFileSync(path.join(dataDir, "intel.jsonl"));
    const runPath = path.join(dataDir, "last_run.json");
    const writeRun = (finishedAt) => writeFileSync(runPath, JSON.stringify({ finishedAt, totals: { fetched: 6, stored: 6, deduped: 0 }, error: "must-never-be-returned" }));
    const runBatch = (cutoff) => execFileSync(process.execPath, ["--max-old-space-size=192", path.join(app, "tools/analyze_once.mjs"), "--data-dir", dataDir, "--as-of", cutoff], { encoding: "utf8", timeout: 10000 });
    writeRun("2026-09-09T00:00:00.000Z");
    runBatch(asOf);
    reader = await openStore({ dataDir, readOnly: true });
    server = createSonarServer({ store: reader, sourcesConfig, keywordsConfig, dataDir });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const initial = await (await fetch(base + "/api/status")).json();
    assert.equal(initial.newCollectionSinceAnalysis, false);
    assert.equal(initial.analysisAsOf, asOf);
    const oldAnalysis = await (await fetch(base + "/api/analysis")).json();

    writeRun("2026-09-10T00:00:00.000Z");
    const afterCollection = await (await fetch(base + "/api/status")).json();
    assert.equal(afterCollection.lastRun.finishedAt, "2026-09-10T00:00:00.000Z");
    assert.equal(afterCollection.newCollectionSinceAnalysis, true);
    assert.ok(!JSON.stringify(afterCollection).includes("must-never-be-returned"));

    const nextCutoff = "2026-09-11T12:00:00.000Z";
    runBatch(nextCutoff);
    const afterBatch = await (await fetch(base + "/api/status")).json();
    assert.equal(afterBatch.analysisAsOf, nextCutoff);
    assert.equal(afterBatch.newCollectionSinceAnalysis, false);
    assert.equal((await (await fetch(base + "/api/analysis")).json()).asOf, nextCutoff);
    const stalePin = new URLSearchParams({ keyword: "sas", corpus: oldAnalysis.corpusDigest, asOf: oldAnalysis.asOf });
    const stale = await fetch(base + "/api/relations?" + stalePin);
    assert.equal(stale.status, 409);
    assert.deepEqual(await stale.json(), { error: "analysis_snapshot_changed" });
    const staleEvidence = await fetch(base + "/api/evidence?" + new URLSearchParams({ id: oldAnalysis.weekly.currentEvidence[0], corpus: oldAnalysis.corpusDigest, asOf: oldAnalysis.asOf }));
    assert.equal(staleEvidence.status, 409);

    const html = await (await fetch(base)).text();
    assert.match(html, /예정된 8개 관측 프로필은 아직 구현되지 않았습니다/);
    assert.doesNotMatch(html, /관측 지표 0\/8|서버 시작 시 읽은 분석본/);
    assert.match(html, /id="refresh-results"/);

    // Invalid/oversized publication never falls back to a stale success or leaks metadata.
    writeFileSync(path.join(dataDir, "invalid.tmp"), '{"schema":"broken"}');
    renameSync(path.join(dataDir, "invalid.tmp"), path.join(dataDir, "analysis.json"));
    assert.equal((await (await fetch(base + "/api/analysis")).json()).state, "unavailable");
    writeFileSync(runPath, JSON.stringify({ finishedAt: nextCutoff, padding: "x".repeat(256 * 1024) }));
    const oversized = await (await fetch(base + "/api/status")).json();
    assert.equal(oversized.lastRun, null);
    assert.equal(oversized.newCollectionSinceAnalysis, null);
    writeFileSync(runPath, JSON.stringify({ finishedAt: "2026-02-30T00:00:00.000Z", totals: { fetched: "secret", stored: -1, deduped: null } }));
    assert.equal((await (await fetch(base + "/api/status")).json()).lastRun, null);
    assert.deepEqual(readFileSync(path.join(dataDir, "intel.jsonl")), coreBytes);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    reader?.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("read-only store opens neither missing directories nor a new sqlite database", async () => {
  const parent = mkdtempSync(path.join(tmpdir(), "sonar-read-missing-"));
  const dataDir = path.join(parent, "missing");
  try {
    const store = await openStore({ dataDir, readOnly: true });
    assert.equal(store.countItems(), 0);
    assert.throws(() => store.upsertItem(record("a")), /store_read_only/);
    store.close();
    assert.equal(existsSync(dataDir), false);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("sqlite read-only adapter preserves database bytes and rejects upsert", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "sonar-read-sqlite-"));
  try {
    const writer = await openStore({ dataDir });
    writer.upsertItem(record("a")); writer.close();
    const files = readdirSync(dataDir);
    const before = files.map((file) => readFileSync(path.join(dataDir, file)));
    const reader = await openStore({ dataDir, readOnly: true });
    assert.equal(reader.countItems(), 1);
    assert.throws(() => reader.upsertItem(record("b")), /store_read_only/);
    reader.close();
    assert.deepEqual(readdirSync(dataDir), files);
    files.forEach((file, index) => assert.deepEqual(readFileSync(path.join(dataDir, file)), before[index]));
  } finally { rmSync(dataDir, { recursive: true, force: true }); }
});

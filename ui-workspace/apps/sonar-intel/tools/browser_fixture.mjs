#!/usr/bin/env node
// Synthetic manual browser proof. Uses an OS-assigned loopback port and temp
// SQLite only; stdin `replace` publishes B, `finish` verifies and stops.
import { mkdtempSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { openStore } from "../src/store.mjs";
import { sourceContract } from "../src/collectors/source_contract.mjs";
import { normalizePaper } from "../src/collectors/papers.mjs";
import { buildAnalysis } from "../src/analysis/index.mjs";
import { createSonarServer } from "../server.mjs";
import { paperConfig, paperTime, openalexPaper } from "../test/fixtures/paper_sample.mjs";

const dataDir = mkdtempSync(path.join(tmpdir(), "sonar-browser-proof-"));
const config = paperConfig("openalex");
const sourcesConfig = { openalex: config, semantic_scholar: { enabled: false }, epo_ops: { enabled: false }, kipris: { enabled: false } };
const keywordsConfig = { categories: [{ terms: ["sonar", "hydrophone", "signal"] }] };
const contract = sourceContract("openalex", config, paperTime);
const records = [normalizePaper("openalex", openalexPaper(), { contract, fetchedAt: paperTime }), normalizePaper("openalex", openalexPaper(125, { title: "Synthetic B sonar signal", doi: "https://doi.org/10.9999/synthetic-b" }), { contract, fetchedAt: "2026-09-08T12:01:00.000Z" })];
const writer = await openStore({ dataDir, backend: "sqlite" }); records.forEach((record) => writer.upsertItem(record)); writer.close();
const coreHash = () => createHash("sha256").update(readFileSync(path.join(dataDir, "intel.db"))).digest("hex");
const before = coreHash();
const a = buildAnalysis(records, { asOf: paperTime, sourcesConfig, keywordsConfig });
const b = buildAnalysis(records, { asOf: "2026-09-08T13:00:00.000Z", sourcesConfig, keywordsConfig });
const publish = (report) => { writeFileSync(path.join(dataDir, "analysis.pending"), JSON.stringify(report)); renameSync(path.join(dataDir, "analysis.pending"), path.join(dataDir, "analysis.json")); };
publish(a);
const store = await openStore({ dataDir, backend: "sqlite", readOnly: true });
const server = createSonarServer({ store, sourcesConfig, keywordsConfig, dataDir });
const requests = [];
server.on("request", (req, res) => { const url = new URL(req.url, "http://127.0.0.1"); res.once("finish", () => { if (url.pathname.startsWith("/api/")) requests.push({ route: url.pathname, status: res.statusCode, corpus: url.searchParams.get("corpus"), asOf: url.searchParams.get("asOf"), at: new Date().toISOString() }); }); });
server.listen(0, "127.0.0.1"); await once(server, "listening");
console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, dataDir, a: a.corpusDigest, b: b.corpusDigest, coreBefore: before }));
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (line.trim() === "replace") { publish(b); console.log(JSON.stringify({ replaced: "B", corpus: b.corpusDigest })); }
  if (line.trim() === "finish") {
    const receipt = { syntheticOnly: true, finishedAt: new Date().toISOString(), a: a.corpusDigest, b: b.corpusDigest, requests, coreBytesPreserved: before === coreHash() };
    writeFileSync(path.join(dataDir, "browser-proof.json"), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt)); input.close(); server.close(() => { store.close(); });
  }
});

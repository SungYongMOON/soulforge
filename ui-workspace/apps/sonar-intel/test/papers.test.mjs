import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SOURCE_IDS, sourceContract, validateProvenance } from "../src/collectors/source_contract.mjs";
import { collectPapers, normalizePaper, normalizeDoi } from "../src/collectors/papers.mjs";
import { openBudgetJournal } from "../src/collectors/budget_journal.mjs";
import { openStore } from "../src/store.mjs";
import { buildAnalysis } from "../src/analysis/index.mjs";
import { createSonarServer } from "../server.mjs";
import { buildCsvSnapshot, buildJsonSnapshot, writeSnapshot } from "../export/snapshot.mjs";
import { fetchFeedText, collectAllNews } from "../src/collectors/news_rss.mjs";
import { fetchArxivPage } from "../src/collectors/arxiv.mjs";
import { paperTime, paperConfig, budgetObservation, openalexPaper, semanticPaper } from "./fixtures/paper_sample.mjs";

function json(res, body, status = 200, headers = {}) { res.writeHead(status, { "content-type": "application/json", "x-ratelimit-remaining": "90", "x-ratelimit-reset": "43200", "x-ratelimit-credits-used": "1", ...headers }); res.end(JSON.stringify(body)); }
async function fixture(source, handler, operation) {
  const root = mkdtempSync(path.join(tmpdir(), "sonar-paper-synthetic-"));
  const requests = []; let time = Date.parse(paperTime);
  const server = createServer((req, res) => { requests.push(req.url); handler(req, res, requests.length); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const config = paperConfig(source); const observation = budgetObservation(source, config);
  const budget = openBudgetJournal(path.join(root, "usage.json"), observation);
  const options = { source, config, budget, query: "sonar", fixtureEndpoint: `http://127.0.0.1:${server.address().port}/paper`, apiKey: "SYNTHETIC_ONLY_KEY", now: () => time, wait: async (ms) => { time += ms; } };
  try { await operation({ root, options, requests, budget, observation }); }
  finally { budget.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); rmSync(root, { recursive: true, force: true }); }
}

test("four source readiness states are explicit; missing grants never reserve or fetch", async () => {
  for (const source of SOURCE_IDS) {
    const contract = sourceContract(source, { enabled: true }, paperTime);
    assert.equal(contract.account.state, "unknown"); assert.equal(contract.executable, false);
    assert.equal(contract.collector, ["epo_ops", "kipris"].includes(source) ? "not_implemented" : "implemented");
    assert.ok(contract.terms.every((ref) => ref.url.startsWith("https:") && ref.reviewedOn === "2026-09-08"));
    const result = await collectPapers({ source, config: { enabled: true }, fetchImpl: () => assert.fail("no HTTP"), budget: { reserve: () => assert.fail("no reservation") } });
    assert.equal(result.receipt.state, "off"); assert.equal(result.receipt.fetched, null); assert.equal(result.receipt.attemptedRequests, 0);
  }
  for (const field of ["evidenceDigest", "termsDigest", "budgetEvidenceDigest", "product", "metadataStorage", "internalAnalysis", "exportScope", "checkedAt", "expiresAt"]) {
    const config = paperConfig("openalex"); delete config.authorization[field];
    assert.equal(sourceContract("openalex", config, paperTime).executable, false, field);
  }
  const config = paperConfig("semantic_scholar"); delete config.authorization.expandedLicenseDigest;
  assert.equal(sourceContract("semantic_scholar", config, paperTime).executable, false);
});

test("OpenAlex actual cursor HTTP, duplicate normalization, native SQLite, analysis/API and CORE preservation", async () => {
  await fixture("openalex", (req, res, count) => {
    const url = new URL(req.url, "http://127.0.0.1");
    assert.equal(url.searchParams.get("per_page"), "100"); assert.equal(url.searchParams.has("api_key"), false);
    assert.equal(req.headers.authorization, "Bearer SYNTHETIC_ONLY_KEY");
    assert.equal(url.searchParams.get("cursor"), count === 1 ? "*" : "opaque_cursor");
    json(res, { results: [openalexPaper(), ...(count === 2 ? [openalexPaper(124, { doi: null, title: "Synthetic sonar signal" })] : [])], meta: { next_cursor: count === 1 ? "opaque_cursor" : null } });
  }, async ({ root, options, requests }) => {
    const store = await openStore({ dataDir: root, backend: "sqlite" }); let reader; let api;
    try {
      assert.equal(store.backendName, "sqlite");
      const result = await collectPapers({ ...options, store });
      assert.equal(result.receipt.state, "collected"); assert.equal(result.receipt.pages, 2); assert.equal(result.receipt.stored, 2); assert.equal(result.receipt.deduped, 1); assert.equal(requests.length, 2);
      assert.equal(store.countItems({ type: "paper" }), 2);
      const rows = store.allItems(); assert.ok(rows.every((row) => validateProvenance(row))); store.close();
      const before = readFileSync(path.join(root, "intel.db"));
      reader = await openStore({ dataDir: root, backend: "sqlite", readOnly: true });
      const sourcesConfig = { openalex: options.config }; const keywordsConfig = { categories: [{ terms: ["sonar", "hydrophone", "signal"] }] };
      const analysis = buildAnalysis(reader.allItems(), { asOf: "2026-09-08T13:00:00.000Z", sourcesConfig, keywordsConfig, lastRun: { finishedAt: result.receipt.finishedAt, sources: [{ id: "openalex", ...result.receipt }] } });
      assert.equal(analysis.scope.uniqueDocuments, 2); assert.equal(analysis.coverage.find((row) => row.source === "openalex").state, "observed_partial");
      api = createSonarServer({ store: reader, sourcesConfig, keywordsConfig, analysisReport: analysis }); api.listen(0, "127.0.0.1"); await once(api, "listening");
      const base = `http://127.0.0.1:${api.address().port}`;
      const signals = await (await fetch(base + "/api/signals?type=paper")).json(); assert.equal(signals.items.length, 2); assert.ok(signals.items.every((row) => row.provenance.contractDigest));
      const relation = await (await fetch(base + "/api/relations?keyword=sonar")).json();
      const detail = await (await fetch(base + "/api/evidence?id=" + relation.edges[0].evidenceIds[0])).json();
      assert.equal(detail.corpusDigest, analysis.corpusDigest); assert.equal(detail.items[0].references[0].provenance.acceptance, "not_canonical_acceptance");
      assert.deepEqual(readFileSync(path.join(root, "intel.db")), before);
    } finally { if (api) await new Promise((resolve) => api.close(resolve)); reader?.close(); try { store.close(); } catch {} }
  });
});

test("Semantic Scholar token pagination uses fixed bulk pages and conservative DOI cross-source dedupe", async () => {
  await fixture("semantic_scholar", (req, res, count) => {
    const url = new URL(req.url, "http://127.0.0.1"); assert.equal(url.searchParams.has("limit"), false);
    assert.equal(req.headers["x-api-key"], "SYNTHETIC_ONLY_KEY");
    assert.equal(url.searchParams.get("token"), count === 1 ? null : "pagination_only");
    json(res, { data: count === 1 ? [] : [semanticPaper()], token: count === 1 ? "pagination_only" : null });
  }, async ({ options }) => {
    const result = await collectPapers(options); assert.equal(result.receipt.pages, 2); assert.equal(result.records.length, 1);
    const oa = normalizePaper("openalex", openalexPaper(), { contract: sourceContract("openalex", paperConfig("openalex"), paperTime), fetchedAt: paperTime });
    const report = buildAnalysis([oa, ...result.records], { asOf: "2026-09-08T13:00:00.000Z", sourcesConfig: { openalex: paperConfig("openalex"), semantic_scholar: options.config }, keywordsConfig: { categories: [{ terms: ["sonar", "hydrophone"] }] } });
    assert.equal(report.scope.uniqueDocuments, 1); assert.equal(report.exclusions.duplicateRows, 1); assert.equal(report.evidence[0].references.length, 2);
    const tampered = structuredClone(oa); tampered.title = "changed"; assert.equal(validateProvenance(tampered), null);
    assert.equal(normalizeDoi("https://doi.org/10.9999/SYNTHETIC-A"), "10.9999/synthetic-a"); assert.equal(normalizeDoi("10.9999/x?api_key=SYNTHETIC"), null);
  });
});

test("429/503 backoff accounts every attempt and persists across reopened journal", async () => {
  await fixture("openalex", (_req, res, count) => json(res, count < 3 ? { error: "SYNTHETIC_ONLY_KEY" } : { results: [], meta: { next_cursor: null } }, count === 1 ? 429 : count === 2 ? 503 : 200, { "retry-after": "1" }), async ({ root, options, budget, observation }) => {
    const result = await collectPapers(options); assert.equal(result.receipt.state, "no_data"); assert.equal(result.receipt.attemptedRequests, 3);
    assert.equal(budget.state.remainingRequests, 17); assert.equal(budget.state.remaining, 88);
    assert.ok(!JSON.stringify(result).includes("SYNTHETIC_ONLY_KEY")); budget.close();
    const reopened = openBudgetJournal(path.join(root, "usage.json"), observation);
    assert.equal(reopened.state.remainingRequests, 17); reopened.close();
  });
});

test("budget expiry/exhaustion, reservation failure, and missing key stop before HTTP", async () => {
  for (const [change, expected] of [[{ resetAt: paperTime }, "budget_unconfirmed_or_expired"], [{ remaining: 0 }, "budget_exhausted"], [{ remainingRequests: 0 }, "budget_exhausted"], [{ requestCeiling: NaN }, "budget_unconfirmed_or_expired"]]) {
    await fixture("openalex", () => assert.fail("no HTTP"), async ({ options, budget, requests }) => {
      Object.assign(budget.state, change); const result = await collectPapers(options); assert.equal(result.receipt.error, expected); assert.equal(requests.length, 0);
    });
  }
  await fixture("openalex", () => assert.fail("no HTTP"), async ({ options, budget }) => {
    budget.reserve = () => { throw new Error("secret query api_key=DO_NOT_ECHO"); };
    const result = await collectPapers(options); assert.equal(result.receipt.error, "budget_reservation_failed"); assert.ok(!JSON.stringify(result).includes("DO_NOT_ECHO"));
  });
  await fixture("semantic_scholar", () => assert.fail("no HTTP"), async ({ options }) => assert.equal((await collectPapers({ ...options, apiKey: null })).receipt.error, "credential_missing"));
});

test("rights revoked during response prevents buffered data from reaching CORE", async () => {
  let revoked = false;
  await fixture("openalex", (_req, res) => { revoked = true; json(res, { results: [openalexPaper()], meta: { next_cursor: "second" } }); }, async ({ options, root, requests }) => {
    const store = await openStore({ dataDir: root, backend: "sqlite" });
    try {
      const result = await collectPapers({ ...options, store, authorizationProvider: () => revoked ? { ...options.config, authorization: { state: "revoked" } } : options.config });
      assert.equal(result.receipt.error, "authorization_revoked"); assert.equal(requests.length, 1); assert.equal(store.countItems(), 0); assert.deepEqual(result.records, []);
    } finally { store.close(); }
  });
});

test("redirects, auth errors, long retry and hostile exception diagnostics stay bounded and redacted", async () => {
  for (const [status, headers, expected] of [[302, { location: "https://evil.example/?api_key=DO_NOT_ECHO" }, "redirect_denied"], [403, {}, "authorization_denied"], [429, { "retry-after": "999999" }, "retry_later"], [429, { "x-ratelimit-remaining": "0" }, "provider_budget_exhausted"], [200, { "x-ratelimit-credits-used": "999" }, "provider_budget_headers_invalid"]]) {
    await fixture("openalex", (_req, res) => json(res, { error: "DO_NOT_ECHO" }, status, headers), async ({ options, requests }) => {
      const result = await collectPapers(options); assert.equal(result.receipt.error, expected); assert.equal(requests.length, 1); assert.ok(!JSON.stringify(result).includes("DO_NOT_ECHO"));
    });
  }
  await fixture("openalex", () => assert.fail("no HTTP"), async ({ options }) => {
    const result = await collectPapers({ ...options, fetchImpl: async () => { throw new Error("https://private.example/?token=DO_NOT_ECHO"); } });
    assert.equal(result.receipt.error, "transport_failed"); assert.ok(!JSON.stringify(result).includes("DO_NOT_ECHO"));
    assert.equal((await collectPapers({ ...options, fixtureEndpoint: "https://evil.example/" })).receipt.error, "invalid_endpoint");
    assert.equal((await collectPapers({ ...options, fixtureEndpoint: null })).receipt.error, "invalid_endpoint");
  });
});

test("real HTTP header/body timeout, response byte cap, invalid JSON and pagination loop", async () => {
  await fixture("openalex", () => {}, async ({ options }) => assert.equal((await collectPapers({ ...options, limits: { timeoutMs: 30 } })).receipt.error, "timeout"));
  await fixture("openalex", (_req, res) => { res.writeHead(200, { "x-ratelimit-remaining": "9", "x-ratelimit-reset": "99", "x-ratelimit-credits-used": "1" }); res.write('{"results":'); }, async ({ options }) => assert.equal((await collectPapers({ ...options, limits: { timeoutMs: 30 } })).receipt.error, "timeout"));
  await fixture("openalex", (_req, res) => json(res, { data: "x".repeat(1000) }), async ({ options }) => assert.equal((await collectPapers({ ...options, limits: { pageBytes: 128 } })).receipt.error, "response_byte_limit"));
  await fixture("openalex", (_req, res) => { res.writeHead(200, { "x-ratelimit-remaining": "9", "x-ratelimit-reset": "99", "x-ratelimit-credits-used": "1" }); res.end("not JSON"); }, async ({ options }) => assert.equal((await collectPapers(options)).receipt.error, "invalid_json"));
  await fixture("openalex", (_req, res) => json(res, { results: [openalexPaper()], meta: { next_cursor: "repeated" } }), async ({ options, requests }) => { assert.equal((await collectPapers(options)).receipt.error, "pagination_cycle"); assert.equal(requests.length, 2); });
});

test("page and record caps publish explicitly partial metadata without suggesting full coverage", async () => {
  await fixture("openalex", (_req, res) => json(res, { results: [openalexPaper()], meta: { next_cursor: "more" } }), async ({ options }) => {
    const result = await collectPapers({ ...options, limits: { pages: 1 } }); assert.equal(result.receipt.state, "bounded_partial"); assert.equal(result.receipt.stopReason, "page_limit"); assert.equal(result.records.length, 1);
  });
  await fixture("semantic_scholar", (_req, res) => json(res, { data: [semanticPaper(), semanticPaper("b")], token: "more" }), async ({ options }) => {
    const result = await collectPapers({ ...options, limits: { records: 1 } }); assert.equal(result.receipt.state, "bounded_partial"); assert.equal(result.receipt.stopReason, "record_limit"); assert.equal(result.records.length, 1);
  });
});

test("collection status and contract changes bind the analysis pin; missing rights are never no-data", () => {
  const config = paperConfig("openalex"); const sourcesConfig = { openalex: config }; const keywordsConfig = { categories: [] };
  const options = { asOf: paperTime, sourcesConfig, keywordsConfig };
  const empty = buildAnalysis([], { ...options, lastRun: { finishedAt: paperTime, sources: [{ id: "openalex", state: "no_data" }] } });
  assert.equal(empty.coverage.find((row) => row.source === "openalex").state, "no_data");
  assert.equal(empty.weekly.currentCount, null);
  const failed = buildAnalysis([], { ...options, lastRun: { finishedAt: paperTime, sources: [{ id: "openalex", state: "collection_failed", error: "DO_NOT_ECHO" }] } });
  assert.notEqual(empty.corpusDigest, failed.corpusDigest); assert.ok(!JSON.stringify(failed).includes("DO_NOT_ECHO"));
  assert.equal(failed.coverage.find((row) => row.source === "openalex").state, "collection_failed");
  const off = buildAnalysis([], { ...options, sourcesConfig: { openalex: { enabled: false } } });
  assert.notEqual(empty.corpusDigest, off.corpusDigest); assert.equal(off.coverage.find((row) => row.source === "openalex").observedDocuments, null);
});

test("repeat same paper is a storage duplicate; invalid dates remain unknown and exports stay blocked", async () => {
  await fixture("openalex", (_req, res) => json(res, { results: [openalexPaper(123, { publication_date: "2026-02-30" })], meta: { next_cursor: null } }), async ({ root, options }) => {
    const store = await openStore({ dataDir: root, backend: "sqlite" });
    try {
      const first = await collectPapers({ ...options, store }); const second = await collectPapers({ ...options, store });
      assert.equal(second.receipt.stored, 0); assert.equal(second.receipt.deduped, 1); assert.equal(first.records[0].publishedAt, null);
      for (const exporter of [buildCsvSnapshot, buildJsonSnapshot]) assert.throws(() => exporter(first.records), /source_export_scope_unconfirmed/);
      const files = readdirSync(root); assert.throws(() => writeSnapshot(first.records, { exportDir: root }), /source_export_scope_unconfirmed/); assert.deepEqual(readdirSync(root), files);
    } finally { store.close(); }
  });
});

test("RSS and arXiv exceptions, query credentials, redirect targets and callback logs do not leak", async () => {
  const hostile = async () => { throw new Error("https://private.example/?serviceKey=DO_NOT_ECHO"); };
  await assert.rejects(() => fetchFeedText("https://example.test/feed?serviceKey=DO_NOT_ECHO", { fetchImpl: () => assert.fail("no HTTP") }), (error) => error.message === "credential_in_request_url");
  await assert.rejects(() => fetchFeedText("https://example.test/feed", { fetchImpl: hostile }), (error) => error.message === "collection_request_failed");
  await assert.rejects(() => fetchArxivPage({ searchQuery: "sonar", fetchImpl: hostile, rateGate: { schedule: (fn) => fn() } }), (error) => error.message === "collection_request_failed");
  for (const run of [() => fetchFeedText("https://example.test/feed", { fetchImpl: async (_url, options) => { assert.equal(options.redirect, "manual"); return new Response(null, { status: 302, headers: { location: "https://evil.example/?token=DO_NOT_ECHO" } }); } }), () => fetchArxivPage({ searchQuery: "sonar", rateGate: { schedule: (fn) => fn() }, fetchImpl: async (_url, options) => { assert.equal(options.redirect, "manual"); return new Response(null, { status: 302 }); } })]) await assert.rejects(run, /redirect_denied/);
  const callback = [];
  const result = await collectAllNews({ sourcesConfig: { news_rss: { enabled: true, feeds: [{ id: "defense_news", enabled: true, url: "https://example.test/feed" }] } }, keywordsConfig: {}, fetchImpl: hostile, onFeedError: (_id, _keyword, error) => callback.push(error.message) });
  assert.ok(!JSON.stringify({ result, callback }).includes("DO_NOT_ECHO"));
});

test("usage journal rejects concurrent owners and balance replenishment", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sonar-budget-journal-")); const file = path.join(root, "usage.json");
  const observation = budgetObservation("openalex"); const journal = openBudgetJournal(file, observation);
  try {
    assert.throws(() => openBudgetJournal(file, observation), /budget_journal_busy/);
    assert.throws(() => journal.reserve({ ...observation, remaining: 101 }), /budget_must_only_decrease/);
    journal.reserve({ ...observation, remaining: 99, remainingRequests: 19 }); journal.close();
    assert.throws(() => openBudgetJournal(file, { ...observation, observedAt: "2026-09-09T00:00:00.000Z" }), /budget_observation_reconciliation_required/);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).remainingRequests, 19);
  } finally { journal.close(); rmSync(root, { recursive: true, force: true }); }
});

test("two concurrent runs cannot spend the same reservation object", async () => {
  let release; let arrived;
  const arrival = new Promise((resolve) => { arrived = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  await fixture("openalex", async (_req, res) => { arrived(); await gate; json(res, { results: [], meta: { next_cursor: null } }); }, async ({ options, requests }) => {
    const first = collectPapers(options); await arrival;
    const second = await collectPapers(options); assert.equal(second.receipt.error, "budget_in_use");
    release(); assert.equal((await first).receipt.state, "no_data"); assert.equal(requests.length, 1);
  });
});

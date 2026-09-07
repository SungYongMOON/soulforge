import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysis, selectRelations, safeSourceUrl, isoDate, LIMITS } from "../src/analysis/index.mjs";
import { asOf, keywordsConfig, sourcesConfig, records, record } from "./fixtures/analysis_sample.mjs";
const options = { asOf, keywordsConfig, sourcesConfig };

test("fixed corpus: deterministic deduped relations with traceable original references", () => {
  const report = buildAnalysis(records, options);
  assert.deepEqual(report, buildAnalysis([...records].reverse(), options));
  assert.equal(report.scope.uniqueDocuments, 5);
  assert.equal(report.exclusions.duplicateRows, 1);
  assert.equal(report.exclusions.missingPublishedAt, 1);
  const edge = selectRelations(report, { keyword: "sas" }).edges.find((row) => row.to === "sas" && row.from === "beamforming");
  assert.equal(edge.count, 2);
  const evidence = edge.evidenceIds.map((id) => report.evidence.find((row) => row.id === id));
  assert.ok(evidence.every(Boolean));
  assert.equal(evidence.find((row) => row.references.some((ref) => ref.id === "this-week")).references.length, 2);
  assert.equal(report.scope.score, "unavailable");
  assert.equal(report.scope.cluster, "unavailable");
});

test("search query history and substring acronyms never manufacture a relation", () => {
  const report = buildAnalysis([record("unrelated", { title: "Simulation wins contracts", summary: '<a href="https://example.test/SAS">unrelated</a>', keywordsMatched: ["SAS", "beamforming", "INS", "IMU"] })], options);
  assert.deepEqual(report.evidence[0].terms, []);
  assert.equal(report.graphs[14].edges.length, 0);
});

test("UTC week boundary counts publication time, not fetched time", () => {
  const weekly = buildAnalysis(records, options).weekly;
  assert.equal(weekly.currentStart, "2026-09-07T00:00:00.000Z");
  assert.equal(weekly.currentCount, 3);
  assert.equal(weekly.previousCount, 1);
  assert.equal(weekly.delta, 2);
  assert.equal(weekly.currentWeekPartial, true);
  assert.equal(weekly.terms.find((row) => row.term === "beamforming").current, 2);
});

test("empty, undated and disabled sources stay unavailable, never a zero score", () => {
  for (const rows of [[], [record("bad-date", { publishedAt: "2026-02-30T00:00:00Z" })]]) {
    const report = buildAnalysis(rows, options);
    assert.equal(report.state, "unavailable");
    assert.equal(report.weekly.currentCount, null);
    assert.equal(report.weekly.delta, null);
    assert.equal(report.graphs[7].documentCount, null);
    assert.deepEqual(report.coverage.find((row) => row.source === "openalex"), { source: "openalex", enabled: false, state: "off", observedDocuments: null, datedDocuments: null, latestFetchedAt: null, recentCollection: "unknown" });
  }
});

test("missing or future fetched date is excluded; future publication is not a weekly event", () => {
  const report = buildAnalysis([record("missing", { fetchedAt: null }), record("future", { fetchedAt: "2026-09-10T00:00:00.000Z" }), record("publication", { publishedAt: "2026-10-01T00:00:00.000Z" })], options);
  assert.equal(report.exclusions.missingFetchedAt, 1);
  assert.equal(report.exclusions.afterCutoff, 1);
  assert.equal(report.exclusions.futurePublishedAt, 1);
  assert.equal(report.weekly.delta, null);
});

test("conflicting same-event dates and reused CORE IDs exclude every ambiguous row", () => {
  const rows = [record("a", { url: "https://example.test/shared" }), record("b", { url: "https://example.test/shared", publishedAt: null }), record("reused"), record("reused", { url: "https://example.test/other" })];
  const result = buildAnalysis(rows, options);
  assert.equal(result.exclusions.conflictingRows, 4);
  assert.equal(result.scope.uniqueDocuments, 0);
  assert.deepEqual(result, buildAnalysis([...rows].reverse(), options));
});

test("arXiv versions dedupe without conflating legacy category namespaces", () => {
  const rows = [record("a", { type: "arxiv", source: "arxiv", url: "http://arxiv.org/abs/hep-th/9901001v1" }), record("b", { type: "arxiv", source: "arxiv", url: "https://arxiv.org/abs/hep-th/9901001v2" }), record("c", { type: "arxiv", source: "arxiv", url: "https://arxiv.org/abs/math/9901001v1" })];
  const report = buildAnalysis(rows, options);
  assert.equal(report.scope.uniqueDocuments, 2);
  assert.equal(report.exclusions.duplicateRows, 1);
});

test("malformed sources and unsafe links do not enter the evidence corpus", () => {
  const rows = [record("bad", { source: "invented" }), record("script", { url: "javascript:alert(1)" }), record("forged", { type: "arxiv", source: "arxiv", url: "https://example.test/abs/2609.00001" }), null];
  const report = buildAnalysis(rows, options);
  assert.equal(report.exclusions.malformed, 4);
  assert.equal(report.evidence.length, 0);
for (const url of ["https://user:secret@example.test/a", "http://127.0.0.1/a", "http://localhost/a", "http://localhost.localdomain/a", "http://localhost.localdomain./a", "http://localtest.localhost./a", "http://router.lan/a", "https://example.test/?api_key=secret", "https://example.test/a?sig=secret", "https://example.test/a?SIG=secret", "https://example.test/a?x-amz-signature=secret", "https://example.test/a?x-goog-credential=secret", "https://example.test/a?access_token=secret", "https://example.test/a?jwt=secret", "https://example.test/a?hmac=secret", ["file:", "", "", "tmp", "a"].join("/"), "https://example.test\\@evil.test/a"]) assert.equal(safeSourceUrl(url), null, url);
  assert.equal(safeSourceUrl("https://example.test/a?z=2&utm_medium=x&a=1#x"), "https://example.test/a?a=1&z=2");
  assert.equal(isoDate("2026-02-30T00:00:00Z"), null);
});

test("source failure summary never serializes raw diagnostics or request URLs", () => {
  const lastRun = { finishedAt: asOf, sources: [{ id: "news_rss", feeds: [{ id: "google_news", errors: [{ error: "private query text" }] }] }] };
  const report = buildAnalysis(records, { ...options, lastRun });
  assert.equal(report.coverage.find((row) => row.source === "google_news").state, "collection_failed");
  assert.ok(!JSON.stringify(report).includes("private query text"));
});

test("bounded neighborhood honors frequency/period and alphabetical limit", () => {
  const terms = Array.from({ length: 15 }, (_, i) => `term${String(i).padStart(2, "0")}`);
  const rows = terms.slice(1).map((term, i) => record(`r${i}`, { title: `term00 ${term}` }));
  const report = buildAnalysis(rows, { ...options, keywordsConfig: { categories: [{ terms }] } });
  const selected = selectRelations(report, { keyword: "term00", min: 1, days: 7 });
  assert.equal(selected.edges.length, LIMITS.neighbors);
  assert.equal(selected.totalMatchingNeighbors, 14);
  assert.equal(selected.truncated, true);
  assert.equal(selectRelations(report, { keyword: "term00", min: 2 }).edges.length, 0);
  assert.throws(() => selectRelations(report, { keyword: "term00", days: 8 }));
  assert.throws(() => selectRelations(report, { keyword: "term00", min: -1 }));
  assert.throws(() => selectRelations(report, { keyword: "unknown" }));
});

test("record, keyword and edge caps fail explicitly rather than truncate analysis", () => {
  assert.throws(() => buildAnalysis(Array(LIMITS.records + 1).fill(record("a")), options), /record_limit_exceeded/);
  assert.throws(() => buildAnalysis([], { ...options, asOf: undefined }), /invalid_as_of/);
  const terms = Array.from({ length: 65 }, (_, i) => `t${i}`);
  assert.throws(() => buildAnalysis([], { ...options, keywordsConfig: { categories: [{ terms }] } }), /keyword_limit_exceeded/);
  const pairs = [];
  for (let a = 0; a < 34; a++) for (let b = a + 1; b < 34; b++) pairs.push(record(`p${a}_${b}`, { title: `t${a} t${b}` }));
  assert.throws(() => buildAnalysis(pairs, { ...options, keywordsConfig: { categories: [{ terms: terms.slice(0, 34) }] } }), /edge_limit_exceeded/);
});

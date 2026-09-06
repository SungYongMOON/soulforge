import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARXIV_BASE_URL,
  ARXIV_MIN_REQUEST_INTERVAL_MS,
  ARXIV_MAX_CONCURRENT_CONNECTIONS,
  buildArxivSearchQuery,
  buildArxivUrl,
  parseArxivAtom,
  normalizeArxivId,
  arxivEntryToRecord,
  fetchArxivPage,
  collectArxiv,
  findMatchingTerms,
} from "../src/collectors/arxiv.mjs";
import { createRateGate } from "../src/rate_gate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const atomXml = readFileSync(join(HERE, "fixtures", "arxiv_sample_atom.xml"), "utf8");

function immediateGate() {
  const calls = [];
  return {
    calls,
    schedule: async (task) => {
      calls.push(Date.now());
      return task();
    },
  };
}

test("ToU constants match info.arxiv.org/help/api/tou.html as recorded in the plan (§7)", () => {
  assert.equal(ARXIV_MIN_REQUEST_INTERVAL_MS, 3000);
  assert.equal(ARXIV_MAX_CONCURRENT_CONNECTIONS, 1);
  assert.equal(ARXIV_BASE_URL, "http://export.arxiv.org/api/query");
});

test("buildArxivSearchQuery ORs terms and ANDs an optional category group", () => {
  const q = buildArxivSearchQuery(["synthetic aperture sonar", "MBES"], { categories: ["eess.SP", "cs.RO"] });
  assert.equal(q, '(cat:eess.SP OR cat:cs.RO) AND (all:"synthetic aperture sonar" OR all:"MBES")');
});

test("buildArxivSearchQuery omits the category group when none is given", () => {
  const q = buildArxivSearchQuery(["MBES"]);
  assert.equal(q, 'all:"MBES"');
});

test("buildArxivSearchQuery rejects an empty terms list", () => {
  assert.throws(() => buildArxivSearchQuery([]));
});

test("buildArxivUrl round-trips search_query/start/max_results/sort params", () => {
  const url = buildArxivUrl({ searchQuery: 'all:"MBES"', start: 10, maxResults: 25 });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, ARXIV_BASE_URL);
  assert.equal(parsed.searchParams.get("search_query"), 'all:"MBES"');
  assert.equal(parsed.searchParams.get("start"), "10");
  assert.equal(parsed.searchParams.get("max_results"), "25");
  assert.equal(parsed.searchParams.get("sortBy"), "submittedDate");
  assert.equal(parsed.searchParams.get("sortOrder"), "descending");
});

test("parseArxivAtom extracts both entries with title/summary collapsed and authors/categories/link", () => {
  const entries = parseArxivAtom(atomXml);
  assert.equal(entries.length, 2);

  const [first, second] = entries;
  assert.equal(first.id, "http://arxiv.org/abs/2501.01234v2");
  assert.equal(first.title, "Motion Compensation for Synthetic Aperture Sonar Using Learned Refraction Correction");
  assert.match(first.summary, /^We present a motion compensation method/);
  assert.deepEqual(first.authors, ["Jane Q. Researcher", "Kim Min-jun"]);
  assert.deepEqual(first.categories, ["eess.SP", "cs.RO"], "arxiv:primary_category must not be double-counted as a plain <category>");
  assert.equal(first.link, "http://arxiv.org/abs/2501.01234v2", "must pick the alternate (abstract) link, not the related pdf link");

  assert.equal(second.id, "http://arxiv.org/abs/2502.05678v1");
  assert.deepEqual(second.categories, ["cs.CV"]);
});

test("parseArxivAtom returns an empty array for empty/garbage input", () => {
  assert.deepEqual(parseArxivAtom(""), []);
  assert.deepEqual(parseArxivAtom("<feed></feed>"), []);
});

test("normalizeArxivId strips the URL prefix and version suffix", () => {
  assert.equal(normalizeArxivId("http://arxiv.org/abs/2501.01234v2"), "2501.01234");
  assert.equal(normalizeArxivId("http://arxiv.org/abs/2501.01234"), "2501.01234");
  assert.equal(normalizeArxivId("2501.01234v10"), "2501.01234");
});

test("arxivEntryToRecord ids a paper by its version-stripped arXiv id, so a new version updates rather than duplicates", () => {
  const entries = parseArxivAtom(atomXml);
  const v2 = arxivEntryToRecord(entries[0], { keywordsMatched: ["SAS"] });
  const asV3 = arxivEntryToRecord({ ...entries[0], id: "http://arxiv.org/abs/2501.01234v3" }, { keywordsMatched: ["SAS"] });
  assert.equal(v2.id, asV3.id);
  assert.equal(v2.type, "arxiv");
  assert.equal(v2.source, "arxiv");
  assert.equal(v2.meta.arxivId, "2501.01234");
  assert.deepEqual(v2.meta.authors, entries[0].authors);
});

test("fetchArxivPage sends a descriptive User-Agent and routes the request through the given rate gate", async () => {
  const gate = immediateGate();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, text: async () => atomXml };
  };

  const { entries, url } = await fetchArxivPage({
    searchQuery: 'all:"MBES"',
    fetchImpl,
    rateGate: gate,
  });

  assert.equal(entries.length, 2);
  assert.equal(gate.calls.length, 1, "must go through rateGate.schedule, not call fetch directly");
  assert.equal(calls.length, 1);
  assert.match(calls[0].opts.headers["User-Agent"], /sonar-intel-collector/);
  assert.equal(url, calls[0].url);
});

test("fetchArxivPage throws a descriptive error on a non-OK response", async () => {
  const gate = immediateGate();
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "" });
  await assert.rejects(() => fetchArxivPage({ searchQuery: 'all:"x"', fetchImpl, rateGate: gate }), /429/);
});

test("a real rate gate enforces the >=3s floor across two fetchArxivPage calls (fake clock, no real waiting)", async () => {
  let current = 0;
  const gate = createRateGate({
    minIntervalMs: 3000,
    now: () => current,
    sleep: (ms) => {
      current += ms;
      return Promise.resolve();
    },
  });
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => atomXml });

  await fetchArxivPage({ searchQuery: 'all:"a"', fetchImpl, rateGate: gate });
  current += 500; // well under 3000ms
  const beforeSecondCallClock = current;
  await fetchArxivPage({ searchQuery: 'all:"b"', fetchImpl, rateGate: gate });

  assert.ok(gate.lastStartedAt - beforeSecondCallClock >= 2500, "second call must have been delayed to respect the 3s floor");
});

test("collectArxiv builds one combined query from every arxiv-tagged keyword category and the configured categories", async () => {
  const sourcesConfig = { arxiv: { enabled: true, categories: ["eess.SP"] } };
  const keywordsConfig = {
    categories: [
      { id: "sonar_systems", used_by: ["arxiv", "news"], terms: ["SAS", "MBES"] },
      { id: "component_categories", used_by: [], terms: ["transducer"] },
    ],
  };
  const gate = immediateGate();
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => atomXml });

  const { records, searchQuery, url } = await collectArxiv({ sourcesConfig, keywordsConfig, fetchImpl, rateGate: gate });

  assert.equal(searchQuery, '(cat:eess.SP) AND (all:"SAS" OR all:"MBES")');
  assert.ok(!searchQuery.includes("transducer"), "component_categories is not used_by arxiv");
  assert.equal(records.length, 2);
  // Entry 1's summary literally says "...synthetic aperture sonar (SAS)..." but never
  // "MBES" — keywordsMatched must narrow to what is actually there, not the whole query.
  assert.deepEqual(records[0].keywordsMatched, ["SAS"]);
  // Entry 2 (side-scan sonar) contains neither literal "SAS" nor "MBES" in title/summary;
  // findMatchingTerms falls back to the full term list rather than claiming zero matches
  // for an item the query itself returned.
  assert.deepEqual(records[1].keywordsMatched, ["SAS", "MBES"]);
  assert.equal(new URL(url).searchParams.get("search_query"), searchQuery);
});

test("findMatchingTerms is case-insensitive and returns only the terms literally present", () => {
  const text = "A study of Synthetic Aperture Sonar (SAS) beamforming performance.";
  assert.deepEqual(findMatchingTerms(text, ["SAS", "beamforming", "MBES"]), ["SAS", "beamforming"]);
});

test("findMatchingTerms falls back to the full term list when none literally appear", () => {
  const text = "An unrelated paper about network routing.";
  const terms = ["SAS", "MBES"];
  assert.deepEqual(findMatchingTerms(text, terms), terms);
});

test("collectArxiv returns nothing when arxiv is disabled or no arxiv-tagged keywords exist", async () => {
  const disabled = await collectArxiv({
    sourcesConfig: { arxiv: { enabled: false } },
    keywordsConfig: { categories: [{ id: "c", used_by: ["arxiv"], terms: ["x"] }] },
  });
  assert.deepEqual(disabled, { records: [], searchQuery: null, url: null });

  const noTerms = await collectArxiv({
    sourcesConfig: { arxiv: { enabled: true, categories: [] } },
    keywordsConfig: { categories: [{ id: "c", used_by: ["news"], terms: ["x"] }] },
  });
  assert.deepEqual(noTerms, { records: [], searchQuery: null, url: null });
});

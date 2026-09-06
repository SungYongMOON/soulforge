// Live network smoke test — hits the real Google News RSS, Defense News RSS,
// and arXiv API endpoints. Skipped by default so `npm test` / `validate:sonar-intel`
// stay hermetic and offline; opt in explicitly:
//
//   SONAR_INTEL_NETWORK=1 node --test test/network_live.test.mjs
//
// This is a smoke check only (one keyword, one small arXiv page) — it is not
// the Goal #1 acceptance collection run, which tools/collect_once.mjs performs
// and records to data/last_run.json plus a receipt outside the repo.

import assert from "node:assert/strict";
import test from "node:test";

import { collectGoogleNewsForKeyword, collectDefenseNews } from "../src/collectors/news_rss.mjs";
import { collectArxiv } from "../src/collectors/arxiv.mjs";

const NETWORK_ENABLED = process.env.SONAR_INTEL_NETWORK === "1";
const skip = NETWORK_ENABLED ? false : "set SONAR_INTEL_NETWORK=1 to run live network calls";

test("live: Google News RSS returns parseable items for a real keyword", { skip }, async () => {
  const records = await collectGoogleNewsForKeyword("synthetic aperture sonar");
  assert.ok(Array.isArray(records));
  if (records.length > 0) {
    assert.equal(records[0].type, "news");
    assert.equal(records[0].source, "google_news");
    assert.ok(records[0].id);
    assert.ok(records[0].title);
  }
});

test("live: Defense News RSS returns parseable items", { skip }, async () => {
  const records = await collectDefenseNews();
  assert.ok(Array.isArray(records));
  if (records.length > 0) {
    assert.equal(records[0].source, "defense_news");
    assert.ok(records[0].id);
  }
});

test("live: arXiv API returns a parseable page for a small real query", { skip }, async () => {
  const sourcesConfig = { arxiv: { enabled: true, categories: ["eess.SP"] } };
  const keywordsConfig = { categories: [{ id: "sonar_systems", used_by: ["arxiv"], terms: ["synthetic aperture sonar"] }] };
  const { records, searchQuery } = await collectArxiv({ sourcesConfig, keywordsConfig, maxResults: 5 });
  assert.ok(searchQuery);
  assert.ok(Array.isArray(records));
  if (records.length > 0) {
    assert.equal(records[0].type, "arxiv");
    assert.ok(records[0].meta.arxivId);
  }
});

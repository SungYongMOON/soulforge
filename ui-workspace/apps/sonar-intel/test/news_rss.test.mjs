import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGoogleNewsUrl,
  parseRssItems,
  rssItemToRecord,
  collectGoogleNewsForKeyword,
  collectDefenseNews,
  collectAllNews,
} from "../src/collectors/news_rss.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const googleNewsXml = readFileSync(join(HERE, "fixtures", "google_news_sample.xml"), "utf8");
const defenseNewsXml = readFileSync(join(HERE, "fixtures", "defense_news_sample.xml"), "utf8");

function fakeFetch(responseText, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok,
      status,
      text: async () => responseText,
    };
  };
  impl.calls = calls;
  return impl;
}

test("buildGoogleNewsUrl encodes the keyword and pins hl/gl/ceid to ko/KR", () => {
  const url = buildGoogleNewsUrl("synthetic aperture sonar");
  assert.equal(
    url,
    "https://news.google.com/rss/search?q=synthetic%20aperture%20sonar&hl=ko&gl=KR&ceid=KR:ko",
  );
});

test("buildGoogleNewsUrl rejects an empty keyword", () => {
  assert.throws(() => buildGoogleNewsUrl(""));
});

test("parseRssItems extracts title/link/guid/pubDate/description/source, unwrapping CDATA", () => {
  const items = parseRssItems(googleNewsXml);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "해군, 차세대 합성개구소나(SAS) 시험평가 착수 - 방위산업뉴스");
  assert.equal(items[0].link, "https://example-news.test/articles/sas-trial-1");
  assert.equal(items[0].source, "방위산업뉴스");
  assert.ok(items[0].guid.startsWith("CBMi"));
  assert.equal(items[1].title, "Underwater sensor firm wins towed array contract - Example Wire");
});

test("parseRssItems returns an empty array for empty/garbage input", () => {
  assert.deepEqual(parseRssItems(""), []);
  assert.deepEqual(parseRssItems("<rss><channel></channel></rss>"), []);
});

test("rssItemToRecord derives a stable id from guid, independent of content changes", () => {
  const items = parseRssItems(googleNewsXml);
  const first = rssItemToRecord(items[0], { source: "google_news", keyword: "SAS" });
  const sameArticleLater = rssItemToRecord(items[2], { source: "google_news", keyword: "SAS" });
  assert.equal(first.id, sameArticleLater.id, "same guid must produce the same stable id");
  assert.notEqual(first.title, sameArticleLater.title, "fixture intentionally varies title/summary");
  assert.equal(first.type, "news");
  assert.equal(first.erpMapping, undefined, "collector output does not set erpMapping — store.mjs owns that reserved field");
});

test("rssItemToRecord falls back to link, then title, when guid is missing", () => {
  const withoutGuid = rssItemToRecord(
    { title: "T", link: "https://example.test/x", guid: null, pubDate: null, description: null, source: null },
    { source: "defense_news" },
  );
  const again = rssItemToRecord(
    { title: "T changed", link: "https://example.test/x", guid: null, pubDate: null, description: null, source: null },
    { source: "defense_news" },
  );
  assert.equal(withoutGuid.id, again.id, "same link must produce the same stable id");
});

test("rssItemToRecord normalizes pubDate to ISO 8601 and passes through null for unparseable dates", () => {
  const items = parseRssItems(googleNewsXml);
  const record = rssItemToRecord(items[0], { source: "google_news" });
  assert.equal(record.publishedAt, new Date(items[0].pubDate).toISOString());

  const bad = rssItemToRecord({ title: "t", link: "https://x.test", guid: "g", pubDate: "not a date", description: null, source: null }, { source: "google_news" });
  assert.equal(bad.publishedAt, null);
});

test("collectGoogleNewsForKeyword fetches with a descriptive User-Agent and parses the response", async () => {
  const fetchImpl = fakeFetch(googleNewsXml);
  const records = await collectGoogleNewsForKeyword("synthetic aperture sonar", { fetchImpl });
  assert.equal(records.length, 3);
  assert.equal(records[0].source, "google_news");
  assert.deepEqual(records[0].keywordsMatched, ["synthetic aperture sonar"]);
  const [, opts] = [fetchImpl.calls[0].url, fetchImpl.calls[0].opts];
  assert.match(opts.headers["User-Agent"], /sonar-intel-collector/);
});

test("collectGoogleNewsForKeyword throws a descriptive error on a non-OK response", async () => {
  const fetchImpl = fakeFetch("", { ok: false, status: 503 });
  await assert.rejects(() => collectGoogleNewsForKeyword("x", { fetchImpl }), /503/);
});

test("collectDefenseNews parses the fixed feed with no keyword attached", async () => {
  const fetchImpl = fakeFetch(defenseNewsXml);
  const records = await collectDefenseNews({ fetchImpl });
  assert.equal(records.length, 2);
  assert.equal(records[0].source, "defense_news");
  assert.deepEqual(records[0].keywordsMatched, []);
});

test("collectAllNews walks every enabled per-keyword feed once per keyword and the fixed feed once", async () => {
  const sourcesConfig = {
    news_rss: {
      enabled: true,
      feeds: [
        { id: "google_news", enabled: true, per_keyword: true },
        { id: "defense_news", enabled: true, per_keyword: false, url: "https://example-defensenews.test/rss" },
      ],
    },
  };
  const keywordsConfig = {
    categories: [
      { id: "sonar_systems", used_by: ["news"], terms: ["SAS", "MBES"] },
      { id: "component_categories", used_by: [], terms: ["transducer"] },
    ],
  };

  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    const text = call <= 2 ? googleNewsXml : defenseNewsXml;
    return { ok: true, status: 200, text: async () => text };
  };

  const { records, perFeed } = await collectAllNews({ sourcesConfig, keywordsConfig, fetchImpl, politeDelayMs: 0 });

  // 2 keywords (SAS, MBES) x 3 items from the google fixture, + 2 from defense fixture
  assert.equal(records.length, 3 + 3 + 2);
  assert.equal(perFeed.filter((f) => f.feedId === "google_news").length, 2);
  assert.equal(perFeed.filter((f) => f.feedId === "defense_news").length, 1);
  // component_categories is not used_by "news", so "transducer" must never be queried
  assert.ok(!perFeed.some((f) => f.keyword === "transducer"));
});

test("collectAllNews records a per-feed error without throwing and without aborting other feeds", async () => {
  const sourcesConfig = {
    news_rss: {
      enabled: true,
      feeds: [{ id: "google_news", enabled: true, per_keyword: true }],
    },
  };
  const keywordsConfig = { categories: [{ id: "c", used_by: ["news"], terms: ["ok", "bad"] }] };

  const fetchImpl = async (url) => {
    if (url.includes("bad")) {
      return { ok: false, status: 500, text: async () => "" };
    }
    return { ok: true, status: 200, text: async () => googleNewsXml };
  };

  const { records, perFeed } = await collectAllNews({ sourcesConfig, keywordsConfig, fetchImpl, politeDelayMs: 0 });
  assert.equal(records.length, 3); // only the "ok" keyword produced records
  const badRow = perFeed.find((f) => f.keyword === "bad");
  assert.ok(badRow.error);
});

test("collectAllNews returns nothing when news_rss is disabled", async () => {
  const result = await collectAllNews({
    sourcesConfig: { news_rss: { enabled: false, feeds: [] } },
    keywordsConfig: { categories: [] },
  });
  assert.deepEqual(result, { records: [], perFeed: [] });
});

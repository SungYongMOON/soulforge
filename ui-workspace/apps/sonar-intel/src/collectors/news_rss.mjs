// L0 news collector (SONAR_INTEL_MASTER_PLAN_V1.md §4/§6/§7). LLM calls: zero.
//
// Sources (config/sources.json):
//   - Google News RSS: one request per configured keyword.
//   - Defense News RSS: one fixed feed, no keyword parameter.
//
// Parsing is a small hand-rolled RSS 2.0 reader (regex-based) so this
// collector stays dependency-free — no `feedparser`/`fast-xml-parser`/etc.
// RSS 2.0 <item> blocks are regular enough that this is reliable for the
// fields we need (title/link/guid/pubDate/description/source).

import { computeStableId } from "../store.mjs";

export const DEFAULT_USER_AGENT =
  "sonar-intel-collector/0.1 (+Soulforge internal research pipeline; non-commercial; no public contact)";

/** Build a Google News RSS search URL for one keyword. */
export function buildGoogleNewsUrl(keyword, { hl = "ko", gl = "KR", ceid = "KR:ko" } = {}) {
  if (!keyword || typeof keyword !== "string") {
    throw new Error("buildGoogleNewsUrl: keyword must be a non-empty string");
  }
  const q = encodeURIComponent(keyword);
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(block);
  if (!match) return null;
  return decodeXmlText(stripCdata(match[1])).trim();
}

function stripCdata(value) {
  const trimmed = value.trim();
  const cdataMatch = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(trimmed);
  return cdataMatch ? cdataMatch[1] : value;
}

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parse an RSS 2.0 document's <item> entries. Pure function, no I/O. */
export function parseRssItems(xmlText) {
  if (typeof xmlText !== "string" || xmlText.length === 0) {
    return [];
  }
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xmlText)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      guid: extractTag(block, "guid"),
      pubDate: extractTag(block, "pubDate"),
      description: extractTag(block, "description"),
      source: extractTag(block, "source"),
    });
  }
  return items;
}

function normalizeDate(dateText) {
  if (!dateText) return null;
  const parsed = new Date(dateText);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Convert one parsed RSS item into a store-ready record. Pure function, no I/O. */
export function rssItemToRecord(item, { source, keyword = null, fetchedAt } = {}) {
  if (!source) throw new Error("rssItemToRecord: source is required");
  const naturalKey = item.guid || item.link || `${source}:${item.title ?? ""}`;
  return {
    id: computeStableId(`news_${source}`, naturalKey),
    type: "news",
    source,
    title: item.title ?? "",
    url: item.link ?? null,
    summary: item.description ?? null,
    publishedAt: normalizeDate(item.pubDate),
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    keywordsMatched: keyword ? [keyword] : [],
    meta: { sourceLabel: item.source ?? null },
  };
}

/** fetch() wrapper with timeout + descriptive User-Agent. No retry logic (Goal #1 scope). */
export async function fetchFeedText(url, { userAgent = DEFAULT_USER_AGENT, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`news_rss: HTTP ${response.status} for ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch + parse Google News RSS for one keyword, returning store-ready records. */
export async function collectGoogleNewsForKeyword(keyword, { fetchImpl, userAgent } = {}) {
  const url = buildGoogleNewsUrl(keyword);
  const xml = await fetchFeedText(url, { fetchImpl, userAgent });
  const fetchedAt = new Date().toISOString();
  return parseRssItems(xml).map((item) => rssItemToRecord(item, { source: "google_news", keyword, fetchedAt }));
}

/** Fetch + parse the fixed Defense News RSS feed, returning store-ready records. */
export async function collectDefenseNews({
  url = "https://www.defensenews.com/arc/outboundfeeds/rss/",
  fetchImpl,
  userAgent,
} = {}) {
  const xml = await fetchFeedText(url, { fetchImpl, userAgent });
  const fetchedAt = new Date().toISOString();
  return parseRssItems(xml).map((item) => rssItemToRecord(item, { source: "defense_news", keyword: null, fetchedAt }));
}

/**
 * Run every enabled news_rss feed from config/sources.json against every term
 * of every category in config/keywords.json whose used_by includes "news".
 * Returns { records, perFeed } where perFeed carries per-feed fetch counts for
 * receipts; it does not talk to the store — callers upsert the records.
 */
export async function collectAllNews({
  sourcesConfig,
  keywordsConfig,
  fetchImpl,
  onFeedError,
  politeDelayMs = 250,
  sleep = defaultSleep,
} = {}) {
  const newsCfg = sourcesConfig?.news_rss;
  if (!newsCfg || newsCfg.enabled === false) {
    return { records: [], perFeed: [] };
  }
  const newsTerms = (keywordsConfig?.categories ?? [])
    .filter((category) => (category.used_by ?? []).includes("news"))
    .flatMap((category) => category.terms ?? []);

  const records = [];
  const perFeed = [];

  for (const feed of newsCfg.feeds ?? []) {
    if (feed.enabled === false) continue;
    if (feed.per_keyword) {
      // Sequential (not Promise.all) by construction: this loop IS the rate limit —
      // Google News RSS has no published quota, but one request at a time with a
      // small courtesy gap is a reasonable default for an unofficial feed.
      for (let i = 0; i < newsTerms.length; i += 1) {
        const keyword = newsTerms[i];
        if (i > 0 && politeDelayMs > 0) {
          await sleep(politeDelayMs);
        }
        try {
          const feedRecords = await collectGoogleNewsForKeyword(keyword, { fetchImpl });
          records.push(...feedRecords);
          perFeed.push({ feedId: feed.id, keyword, fetched: feedRecords.length, error: null });
        } catch (error) {
          perFeed.push({ feedId: feed.id, keyword, fetched: 0, error: String(error?.message ?? error) });
          onFeedError?.(feed.id, keyword, error);
        }
      }
    } else {
      try {
        const feedRecords = await collectDefenseNews({ url: feed.url, fetchImpl });
        records.push(...feedRecords);
        perFeed.push({ feedId: feed.id, keyword: null, fetched: feedRecords.length, error: null });
      } catch (error) {
        perFeed.push({ feedId: feed.id, keyword: null, fetched: 0, error: String(error?.message ?? error) });
        onFeedError?.(feed.id, null, error);
      }
    }
  }

  return { records, perFeed };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

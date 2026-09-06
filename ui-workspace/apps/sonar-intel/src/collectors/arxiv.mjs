// L0 arXiv collector (SONAR_INTEL_MASTER_PLAN_V1.md §4/§6/§7). LLM calls: zero.
//
// ToU obligations (info.arxiv.org/help/api/tou.html, quoted in plan §7):
//   - minimum 3 seconds between requests
//   - at most one connection at a time
//   - a descriptive User-Agent
// All three are enforced here: `rate_gate.mjs` serializes requests through one
// queue with a >=3s floor between request starts, and every request carries
// DEFAULT_USER_AGENT (override only for tests).
//
// Parsing is a small hand-rolled Atom reader (regex-based) so this collector
// stays dependency-free — no `xml2js`/`fast-xml-parser`/arxiv.py-equivalent
// package. arXiv's Atom <entry> blocks are regular enough for the fields we
// need (id/title/summary/published/updated/authors/categories/link).

import { createRateGate } from "../rate_gate.mjs";
import { computeStableId } from "../store.mjs";
import { decodeXmlText } from "../xml_text.mjs";

export const ARXIV_BASE_URL = "https://export.arxiv.org/api/query";
export const ARXIV_MIN_REQUEST_INTERVAL_MS = 3000;
export const ARXIV_MAX_CONCURRENT_CONNECTIONS = 1;
export const DEFAULT_USER_AGENT =
  "sonar-intel-collector/0.1 (+Soulforge internal research pipeline; non-commercial; no public contact)";

// One module-level gate: every call to fetchArxivPage in this process shares
// it, which is what "at most one connection at a time" requires. Tests inject
// their own gate (with a fake clock) instead of touching this shared one.
const sharedGate = createRateGate({ minIntervalMs: ARXIV_MIN_REQUEST_INTERVAL_MS });

/** Build an arXiv `search_query` value: (cat:.. OR cat:..) AND (all:".." OR all:"..") */
export function buildArxivSearchQuery(terms, { categories = [] } = {}) {
  if (!Array.isArray(terms) || terms.length === 0) {
    throw new Error("buildArxivSearchQuery: terms must be a non-empty array");
  }
  const termsPart = terms.map((term) => `all:"${term}"`).join(" OR ");
  if (!categories || categories.length === 0) {
    return termsPart;
  }
  const catPart = categories.map((cat) => `cat:${cat}`).join(" OR ");
  return `(${catPart}) AND (${termsPart})`;
}

/** Build the full arXiv API query URL. */
export function buildArxivUrl({ searchQuery, start = 0, maxResults = 50, sortBy = "submittedDate", sortOrder = "descending" }) {
  if (!searchQuery) throw new Error("buildArxivUrl: searchQuery is required");
  const params = new URLSearchParams({
    search_query: searchQuery,
    start: String(start),
    max_results: String(maxResults),
    sortBy,
    sortOrder,
  });
  return `${ARXIV_BASE_URL}?${params.toString()}`;
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(block);
  return match ? decodeXmlText(match[1]).trim() : null;
}

function extractAttr(attrsText, name) {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  const match = re.exec(attrsText ?? "");
  return match ? match[1] : null;
}

function collapseWhitespace(text) {
  return text ? text.replace(/\s+/g, " ").trim() : text;
}

/** Parse an arXiv Atom feed's <entry> elements. Pure function, no I/O. */
export function parseArxivAtom(xmlText) {
  if (typeof xmlText !== "string" || xmlText.length === 0) {
    return [];
  }
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRe.exec(xmlText)) !== null) {
    const block = match[1];
    const id = extractTag(block, "id");
    const title = collapseWhitespace(extractTag(block, "title"));
    const summary = collapseWhitespace(extractTag(block, "summary"));
    const published = extractTag(block, "published");
    const updated = extractTag(block, "updated");

    const authors = [...block.matchAll(/<author>([\s\S]*?)<\/author>/g)]
      .map((authorMatch) => extractTag(authorMatch[1], "name"))
      .filter(Boolean);

    const categories = [...block.matchAll(/<category\b([^>]*)\/?>/g)]
      .map((catMatch) => extractAttr(catMatch[1], "term"))
      .filter(Boolean);

    const links = [...block.matchAll(/<link\b([^>]*?)\/?>/g)].map((linkMatch) => ({
      href: extractAttr(linkMatch[1], "href"),
      rel: extractAttr(linkMatch[1], "rel"),
      type: extractAttr(linkMatch[1], "type"),
    }));
    const alternateLink = links.find((link) => !link.rel || link.rel === "alternate");

    entries.push({
      id,
      title,
      summary,
      published,
      updated,
      authors,
      categories,
      link: alternateLink?.href ?? id,
    });
  }
  return entries;
}

/** "http://arxiv.org/abs/2501.01234v2" -> "2501.01234" (version-stripped, for dedupe-on-update). */
export function normalizeArxivId(idUrlOrString) {
  if (!idUrlOrString) return idUrlOrString;
  const lastSegment = idUrlOrString.split("/").pop() ?? idUrlOrString;
  return lastSegment.replace(/v\d+$/i, "");
}

function normalizeDate(dateText) {
  if (!dateText) return null;
  const parsed = new Date(dateText);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Convert one parsed Atom entry into a store-ready record. Pure function, no I/O. */
export function arxivEntryToRecord(entry, { keywordsMatched = [], fetchedAt } = {}) {
  const arxivId = normalizeArxivId(entry.id);
  return {
    id: computeStableId("arxiv", arxivId),
    type: "arxiv",
    source: "arxiv",
    title: entry.title ?? "",
    url: entry.link ?? entry.id ?? null,
    summary: entry.summary ?? null,
    publishedAt: normalizeDate(entry.published),
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    keywordsMatched,
    meta: {
      arxivId,
      authors: entry.authors ?? [],
      categories: entry.categories ?? [],
      updated: normalizeDate(entry.updated),
    },
  };
}

/**
 * Fetch one arXiv search page through the shared rate gate (or an injected one
 * for tests). Returns raw parsed entries, not store records.
 */
export async function fetchArxivPage({
  searchQuery,
  start = 0,
  maxResults = 50,
  sortBy,
  sortOrder,
  userAgent = DEFAULT_USER_AGENT,
  fetchImpl = fetch,
  rateGate = sharedGate,
  timeoutMs = 30000,
}) {
  const url = buildArxivUrl({ searchQuery, start, maxResults, sortBy, sortOrder });
  return rateGate.schedule(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": userAgent, Accept: "application/atom+xml, application/xml, text/xml" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`arxiv: HTTP ${response.status} for ${url}`);
      }
      const xml = await response.text();
      return { entries: parseArxivAtom(xml), url };
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * Which of `terms` literally appear (case-insensitive) in `text`. arXiv's
 * `all:` field also searches authors/comments/journal-ref, so a real match can
 * exist with none of the terms appearing in title+summary; in that edge case
 * this falls back to the full term list rather than claiming zero keywords
 * matched an item the query itself returned.
 */
export function findMatchingTerms(text, terms) {
  const haystack = (text ?? "").toLowerCase();
  const found = terms.filter((term) => haystack.includes(term.toLowerCase()));
  return found.length > 0 ? found : [...terms];
}

/**
 * Run one arXiv collection pass: build a single combined query from every
 * category in config/keywords.json whose used_by includes "arxiv", restricted
 * to config/sources.json's arxiv.categories, and fetch one page of results.
 * One combined query (rather than one query per keyword) is deliberate: it
 * keeps this collector well inside the >=3s / 1-connection ToU floor even as
 * the keyword list grows. Each returned record's `keywordsMatched` is then
 * narrowed to the terms that literally appear in that entry's title/summary —
 * without this, every entry the combined OR query returns would carry the
 * entire ~28-term vocabulary regardless of which term actually applies.
 */
export async function collectArxiv({ sourcesConfig, keywordsConfig, maxResults = 50, fetchImpl, rateGate } = {}) {
  const arxivCfg = sourcesConfig?.arxiv;
  if (!arxivCfg || arxivCfg.enabled === false) {
    return { records: [], searchQuery: null, url: null };
  }
  const terms = (keywordsConfig?.categories ?? [])
    .filter((category) => (category.used_by ?? []).includes("arxiv"))
    .flatMap((category) => category.terms ?? []);
  if (terms.length === 0) {
    return { records: [], searchQuery: null, url: null };
  }

  const searchQuery = buildArxivSearchQuery(terms, { categories: arxivCfg.categories ?? [] });
  const { entries, url } = await fetchArxivPage({ searchQuery, start: 0, maxResults, fetchImpl, rateGate });
  const fetchedAt = new Date().toISOString();
  const records = entries.map((entry) => {
    const matched = findMatchingTerms(`${entry.title ?? ""} ${entry.summary ?? ""}`, terms);
    return arxivEntryToRecord(entry, { keywordsMatched: matched, fetchedAt });
  });
  return { records, searchQuery, url };
}

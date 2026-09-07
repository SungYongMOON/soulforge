// Pure, bounded observation over CORE records. No collection, LLM, rank or cluster authority.
import { createHash } from "node:crypto";
import { SOURCE_IDS, sourceContract, validateProvenance } from "../collectors/source_contract.mjs";
import { normalizeDoi } from "../collectors/papers.mjs";

export const ANALYSIS_STATUS = "limited_observation";
export const RULE_VERSION = "literal-terms-provenance-doi-utc-weeks-v2";
export const LIMITS = Object.freeze({ records: 5000, terms: 64, termsPerRecord: 16, edges: 512, neighbors: 12, bytes: 16 * 1024 * 1024 });
const DAY = 86400000;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (value, max) => typeof value === "string" && value.length <= max ? value : null;

export function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z")
    ? new Date(parsed).toISOString() : null;
}

// Links are never fetched. Reject credentials, private hosts and secret-like query parameters.
export function safeSourceUrl(value) {
  if (!text(value, 2048) || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const hostname = url.hostname.replace(/\.$/, "");
    if (!hostname.includes(".") || /(?:^|\.)(?:localhost|localdomain|local|internal|home|lan)$/.test(hostname) || /(?:^|\.)localhost\./.test(hostname) || /^[\d.]+$/.test(hostname) || hostname.includes(":")) return null;
    for (const key of url.searchParams.keys()) if (/(?:key|token|secret|pass|auth|credential|signature)|(?:^|[_-])(?:sig|hmac|jwt)(?:$|[_-])/i.test(key)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(?:fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

function sourceDefinitions(config) {
  const rows = [];
  for (const feed of config?.news_rss?.feeds ?? []) rows.push({ source: feed.id, enabled: config.news_rss.enabled === true && feed.enabled === true });
  for (const source of ["arxiv", "openalex", "semantic_scholar", "epo_ops", "kipris"]) rows.push({ source, enabled: config?.[source]?.enabled === true });
  return rows.sort((a, b) => cmp(a.source, b.source));
}

function configuredTerms(config) {
  const terms = [...new Set((config?.categories ?? []).flatMap((row) => row.terms ?? []).map((term) => {
    if (!text(term, 120) || !term.trim()) throw new Error("invalid_keyword_config");
    return term.trim().toLowerCase();
  }))].sort(cmp);
  if (terms.length > LIMITS.terms) throw new Error("keyword_limit_exceeded");
  return terms;
}

function identity(record, url) {
  // Existing collectors have no DOI contract; do not guess DOI from arbitrary meta.
  if (record.source === "arxiv") {
    const parsed = new URL(url);
    if (!/^(?:export\.)?arxiv\.org$/.test(parsed.hostname) || !/^\/abs\/(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?$/.test(parsed.pathname)) return null;
    return `paper:${parsed.pathname.replace(/v\d+$/, "")}`;
  }
  if (record.type === "paper") {
    if (!validateProvenance(record)) return null;
    const doi = normalizeDoi(record.meta?.identifiers?.doi);
    if (doi) return `paper:doi:${doi}`;
  }
  return `${record.type}:${url}`;
}

/** Explicit cutoff is required; later/missing fetch time cannot enter this observation. */
export function buildAnalysis(records, { asOf, keywordsConfig, sourcesConfig, lastRun = null } = {}) {
  const cutoff = isoDate(asOf);
  if (!cutoff) throw new Error("invalid_as_of");
  if (!Array.isArray(records) || records.length > LIMITS.records) throw new Error("record_limit_exceeded");
  const terms = configuredTerms(keywordsConfig);
  const matchers = terms.map((term) => [term, new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu")]);
  const sources = sourceDefinitions(sourcesConfig);
  const knownSources = new Set(sources.map((row) => row.source));
  const exclusions = { malformed: 0, provenanceUnverified: 0, duplicateRows: 0, conflictingRows: 0, missingFetchedAt: 0, afterCutoff: 0, missingPublishedAt: 0, futurePublishedAt: 0, excessiveTerms: 0 };
  const candidates = [];
  for (const record of records) {
    const url = safeSourceUrl(record?.url);
    if (!record || !text(record.id, 160) || !record.id || !knownSources.has(record.source) || !["news", "arxiv", "paper"].includes(record.type) || (record.type === "arxiv") !== (record.source === "arxiv") || (record.type === "paper") !== ["openalex", "semantic_scholar"].includes(record.source) || !text(record.title, 2000) || !record.title.trim() || (record.summary != null && !text(record.summary, 20000)) || !url) { exclusions.malformed++; continue; }
    const provenance = validateProvenance(record);
    if (record.type === "paper" && !provenance) { exclusions.provenanceUnverified++; continue; }
    const key = identity(record, url);
    if (!key) { exclusions.malformed++; continue; }
    const fetchedAt = isoDate(record.fetchedAt);
    if (!fetchedAt) { exclusions.missingFetchedAt++; continue; }
    if (fetchedAt > cutoff) { exclusions.afterCutoff++; continue; }
    const publishedAt = isoDate(record.publishedAt);
    const visible = `${record.title}\n${record.summary ?? ""}`.replace(/<[^>]*>/g, " ");
    const matched = matchers.filter(([, regex]) => regex.test(visible)).map(([term]) => term);
    if (matched.length > LIMITS.termsPerRecord) { exclusions.excessiveTerms++; continue; }
    candidates.push({ key, id: record.id, type: record.type, source: record.source, title: record.title, summary: (record.summary ?? "").slice(0, 1500), url, publishedAt, fetchedAt, terms: matched, provenance });
  }
  candidates.sort((a, b) => cmp(JSON.stringify(a), JSON.stringify(b)));
  const groups = new Map(); const ids = new Map();
  for (const row of candidates) {
    if (!groups.has(row.key)) groups.set(row.key, []);
    groups.get(row.key).push(row);
    if (!ids.has(row.id)) ids.set(row.id, new Set());
    ids.get(row.id).add(row.key);
  }
  const evidence = [];
  for (const [key, rows] of groups) {
    const signatures = new Set(rows.map((row) => JSON.stringify([row.title, row.summary, row.publishedAt, row.terms])));
    if (signatures.size !== 1 || rows.some((row) => ids.get(row.id).size !== 1)) { exclusions.conflictingRows += rows.length; continue; }
    exclusions.duplicateRows += rows.length - 1;
    const first = rows[0];
    const references = [...new Map(rows.map(({ id, source, url, provenance }) => [JSON.stringify([id, source, url, provenance]), { id, source, url, provenance: provenance ?? { accountState: "legacy_unverified", acceptance: "not_canonical_acceptance" } }])).values()];
    evidence.push({ id: `event_${hash(key).slice(0, 24)}`, type: first.type, title: first.title, summary: first.summary, publishedAt: first.publishedAt, fetchedAt: rows.map((row) => row.fetchedAt).sort(cmp).at(-1), terms: first.terms, references });
  }
  evidence.sort((a, b) => cmp(a.id, b.id));
  const dated = evidence.filter((row) => {
    if (!row.publishedAt) { exclusions.missingPublishedAt++; return false; }
    if (row.publishedAt > cutoff) { exclusions.futurePublishedAt++; return false; }
    return true;
  });
  const asOfMs = Date.parse(cutoff);
  const monday = new Date(cutoff); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString();
  const previousStart = new Date(monday.getTime() - 7 * DAY).toISOString();
  const current = dated.filter((row) => row.publishedAt >= weekStart);
  const previous = dated.filter((row) => row.publishedAt >= previousStart && row.publishedAt < weekStart);
  const weekly = {
    state: dated.length ? "observed_partial" : "unavailable", currentStart: weekStart, currentEnd: cutoff,
    previousStart, previousEndExclusive: weekStart, currentWeekPartial: true,
    currentCount: dated.length ? current.length : null, previousCount: dated.length ? previous.length : null,
    delta: dated.length ? current.length - previous.length : null,
    currentEvidence: current.map((row) => row.id), previousEvidence: previous.map((row) => row.id),
    terms: terms.map((term) => {
      const currentIds = current.filter((row) => row.terms.includes(term)).map((row) => row.id);
      const previousIds = previous.filter((row) => row.terms.includes(term)).map((row) => row.id);
      return { term, current: dated.length ? currentIds.length : null, previous: dated.length ? previousIds.length : null, delta: dated.length ? currentIds.length - previousIds.length : null, currentEvidence: currentIds, previousEvidence: previousIds };
    }).filter((row) => row.current || row.previous),
  };
  const graphs = {};
  for (const days of [7, 14, 28]) {
    const start = new Date(asOfMs - days * DAY).toISOString();
    const rows = dated.filter((row) => row.publishedAt >= start);
    const nodes = new Map(); const edges = new Map();
    for (const row of rows) {
      for (const term of row.terms) nodes.set(term, (nodes.get(term) ?? 0) + 1);
      for (let i = 0; i < row.terms.length; i++) for (let j = i + 1; j < row.terms.length; j++) {
        const pair = [row.terms[i], row.terms[j]]; const key = JSON.stringify(pair);
        if (!edges.has(key)) edges.set(key, { from: pair[0], to: pair[1], count: 0, evidenceIds: [] });
        const edge = edges.get(key); edge.count++; edge.evidenceIds.push(row.id);
        if (edges.size > LIMITS.edges) throw new Error("edge_limit_exceeded");
      }
    }
    graphs[days] = { state: rows.length ? "observed_partial" : "unavailable", start, end: cutoff, documentCount: rows.length || null, nodes: [...nodes].sort(([a], [b]) => cmp(a, b)).map(([term, count]) => ({ term, count })), edges: [...edges.values()].sort((a, b) => cmp(JSON.stringify([a.from, a.to]), JSON.stringify([b.from, b.to]))) };
  }
  const run = lastRun && isoDate(lastRun.finishedAt) && lastRun.finishedAt <= cutoff ? lastRun : null;
  const coverage = sources.map(({ source, enabled }) => {
    const rows = evidence.filter((row) => row.references.some((ref) => ref.source === source));
    const report = source === "google_news" || source === "defense_news" ? run?.sources?.find((row) => row.id === "news_rss") : run?.sources?.find((row) => row.id === source);
    const feed = report?.feeds?.find((row) => row.id === source);
    const failed = !!report?.error || report?.state === "collection_failed" || !!feed?.errors?.length;
    const contract = SOURCE_IDS.includes(source) ? sourceContract(source, sourcesConfig?.[source], cutoff) : null;
    return { source, enabled, state: contract?.collector === "not_implemented" ? "not_implemented" : contract && contract.account.state !== "verified" ? "rights_unconfirmed" : !enabled ? "off" : failed ? "collection_failed" : rows.length ? "observed_partial" : report?.state === "no_data" ? "no_data" : "unobserved", observedDocuments: rows.length || null, datedDocuments: rows.length ? rows.filter((row) => row.publishedAt && row.publishedAt <= cutoff).length : null, latestFetchedAt: rows.map((row) => row.fetchedAt).sort(cmp).at(-1) ?? null, recentCollection: failed ? "failed" : report ? "recorded" : "unknown", contract };
  });
  return {
    schema: "sonar-intel-limited-analysis-v1", state: dated.length ? "observed_partial" : "unavailable", ruleVersion: RULE_VERSION,
    asOf: cutoff, corpusDigest: hash({ evidence, exclusions, terms, sources, coverage, ruleVersion: RULE_VERSION }), limits: LIMITS,
    scope: { inputRows: records.length, uniqueDocuments: evidence.length, datedDocuments: dated.length, keywordBasis: "literal_title_summary_unicode_boundaries", dedupeRule: "validated_paper_doi_or_normalized_url_or_arxiv_versionless_conflicts_excluded", timeBasis: "publication_time_utc_with_fetch_cutoff_not_historical_backtest", comparison: "current_partial_week_vs_previous_full_week_observed_corpus_only", score: "unavailable", cluster: "unavailable", historyDecomposition: "unavailable_no_prior_snapshot", provenanceMeaning: "metadata_integrity_not_account_reverification_or_canonical_acceptance" },
    exclusions, coverage, terms, weekly, graphs, evidence,
  };
}

export function selectRelations(report, { keyword, days = 14, min = 1 } = {}) {
  if (!report.terms.includes(keyword) || ![7, 14, 28].includes(days) || !Number.isInteger(min) || min < 1 || min > LIMITS.records) throw new Error("invalid_relation_filter");
  const graph = report.graphs[days];
  const matches = graph.edges.filter((edge) => (edge.from === keyword || edge.to === keyword) && edge.count >= min);
  const edges = matches.slice(0, LIMITS.neighbors);
  return { state: graph.state, keyword, days, min, start: graph.start, end: graph.end, corpusDigest: report.corpusDigest, ordering: "alphabetical_not_rank", totalMatchingNeighbors: matches.length, truncated: matches.length > edges.length, edges };
}

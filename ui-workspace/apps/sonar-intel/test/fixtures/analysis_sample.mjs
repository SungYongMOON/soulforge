// Public synthetic records only. No live source payload or account data.
export const asOf = "2026-09-09T12:00:00.000Z";
export const keywordsConfig = { categories: [{ terms: ["SAS", "beamforming", "hydrophone", "IMU", "INS"] }] };
export const sourcesConfig = { news_rss: { enabled: true, feeds: [{ id: "google_news", enabled: true }, { id: "defense_news", enabled: true }] }, arxiv: { enabled: true }, openalex: { enabled: false }, semantic_scholar: { enabled: false }, epo_ops: { enabled: false }, kipris: { enabled: false } };
export function record(id, overrides = {}) {
  return { id, type: "news", source: "google_news", title: "SAS beamforming", summary: "Synthetic observation", url: `https://example.test/${id}`, publishedAt: "2026-09-08T08:00:00.000Z", fetchedAt: "2026-09-09T00:00:00.000Z", keywordsMatched: ["IMU", "INS"], ...overrides };
}
export const records = [
  record("this-week"),
  record("previous-week", { publishedAt: "2026-09-06T23:59:59.000Z", title: "SAS hydrophone" }),
  record("boundary", { publishedAt: "2026-09-07T00:00:00.000Z", type: "arxiv", source: "arxiv", url: "https://arxiv.org/abs/2609.00001v1" }),
  record("query-only", { title: "Simulation wins contracts", summary: "Unrelated content" }),
  record("undated", { publishedAt: null }),
  record("duplicate", { source: "defense_news", url: "https://example.test/this-week?utm_source=fixture#section" }),
];

// Stub only — v1 Goal #1 scope (SONAR_INTEL_MASTER_PLAN_V1.md §4, M4 row).
//
// This module intentionally implements nothing yet. The plan's M4 pipeline
// (keyword co-occurrence graph over networkx-equivalent adjacency counting +
// Louvain-style community detection + monthly burst score) is Goal #2 scope,
// once OpenAlex/Semantic Scholar collectors widen the corpus beyond news+arXiv.
// Kept as an explicit stub (rather than omitted) so the directory layout in
// the master plan's §4 tree matches the repo, and so Goal #2 has a named
// landing spot instead of inventing a new location.
//
// LLM calls in this module: zero, and will remain zero — co-occurrence/burst
// analysis is L0-equivalent per the plan's design principle #2. The only
// planned LLM entry point for this app is a future `src/llm_station/` (M3
// tagging, M5 briefing), which does not exist yet either.

export const ANALYSIS_STATUS = "stub";

export function notImplemented(feature) {
  throw new Error(
    `sonar-intel analysis.${feature}: not implemented in v1 Goal #1 (see SONAR_INTEL_MASTER_PLAN_V1.md §9 Goal #2)`,
  );
}

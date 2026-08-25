const freeze = (value) => Object.freeze(value);

// Internal deep Module: retains workload evidence counts and refuses to elevate textual query
// plan output to a stable performance verdict, particularly for SQLite EQP.
export function analyseQueryWorkloadEvidence(workload = {}) {
  const metrics = Array.isArray(workload.metrics) ? workload.metrics : [];
  return freeze({
    metric_count: metrics.length,
    capacity_evidence_present: metrics.some((metric) => metric?.evidence_ref && metric?.observed === true),
    textual_query_plan_present: typeof workload.query_plan_text === 'string' && workload.query_plan_text.length > 0,
    textual_query_plan_used_as_verdict: false,
    advisory_only: true,
  });
}

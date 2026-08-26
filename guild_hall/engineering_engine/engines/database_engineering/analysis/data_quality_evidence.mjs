const freeze = (value) => Object.freeze(value);

// Internal deep Module: aggregates explicit quality checks; missing checks do not become a
// failure unless a project-bound requirement and contradictory observation also exist.
export function analyseDataQualityEvidence(dataQuality = {}) {
  const checks = Array.isArray(dataQuality.checks) ? dataQuality.checks : [];
  const failed = checks.filter((check) => check?.status === 'failed').map((check) => check.check_id).filter(Boolean).sort();
  return freeze({
    check_count: checks.length,
    failed_check_ids: freeze(failed),
    quality_evidence_present: checks.some((check) => check?.evidence_ref),
  });
}

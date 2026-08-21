import { DISPOSITIONS } from "./hourly_shadow_cycle_contract.mjs";
import { isProjectDecisionCapsule } from "./project_decision_ledger.mjs";

const CAPSULE_KEYS = Object.freeze([
  "project_ref", "as_of", "record_count", "next_cursor", "head_record_digest", "latest_cursor", "latest_disposition",
  "latest_cycle_id", "latest_observed_at", "active_proposals", "disposition_counts", "hold_why_code_counts",
  "source_coverage_summary", "superseded_record_count",
]);
const ACTIVE_PROPOSAL_KEYS = Object.freeze([
  "cycle_id", "task_identity", "why_code", "proposed_action", "required_authority",
]);
const SOURCE_COVERAGE_KEYS = Object.freeze(["source_read_count"]);
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

export class PortfolioProjectionError extends Error {
  constructor(code) {
    super(code);
    this.name = "PortfolioProjectionError";
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestampOrNull(value) {
  return value === null || (typeof value === "string" && ISO_8601_RE.test(value) && Number.isFinite(Date.parse(value)));
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isDigestOrNull(value) {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function makeCountMap() {
  return Object.create(null);
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function validateCapsule(capsule) {
  if (!isProjectDecisionCapsule(capsule)) return "INVALID_CAPSULE_PROVENANCE";
  if (!hasExactKeys(capsule, CAPSULE_KEYS)) return "INVALID_CAPSULE_KEYS";
  if (typeof capsule.project_ref !== "string" || capsule.project_ref.trim() === "") return "INVALID_CAPSULE_PROJECT_REF";
  if (!isTimestampOrNull(capsule.as_of) || !isTimestampOrNull(capsule.latest_observed_at)) return "INVALID_CAPSULE_TIMESTAMP";
  if (!isNonNegativeInteger(capsule.record_count) || !isNonNegativeInteger(capsule.next_cursor)
    || !isNonNegativeInteger(capsule.superseded_record_count) || !isDigestOrNull(capsule.head_record_digest)) {
    return "INVALID_CAPSULE_COUNT";
  }
  if (capsule.latest_cursor !== null && !isNonNegativeInteger(capsule.latest_cursor)) return "INVALID_CAPSULE_CURSOR";
  if (!isNullableString(capsule.latest_disposition) || !isNullableString(capsule.latest_cycle_id)) return "INVALID_CAPSULE_LATEST_FIELDS";
  if (!hasExactKeys(capsule.disposition_counts, DISPOSITIONS)) return "INVALID_CAPSULE_DISPOSITION_COUNTS";
  const dispositionTotal = DISPOSITIONS.reduce((total, disposition) => {
    const count = capsule.disposition_counts[disposition];
    return isNonNegativeInteger(count) ? total + count : Number.NaN;
  }, 0);
  if (!Number.isSafeInteger(dispositionTotal) || dispositionTotal !== capsule.record_count) return "CAPSULE_RECORD_COUNT_MISMATCH";
  if (!isRecord(capsule.hold_why_code_counts)) return "INVALID_CAPSULE_HOLD_COUNTS";
  const holdCountTotal = Object.entries(capsule.hold_why_code_counts).reduce((total, [whyCode, count]) => (
    typeof whyCode === "string" && whyCode !== "" && isNonNegativeInteger(count) ? total + count : Number.NaN
  ), 0);
  if (!Number.isSafeInteger(holdCountTotal) || holdCountTotal !== capsule.disposition_counts.HOLD) return "CAPSULE_HOLD_COUNT_MISMATCH";
  if (!hasExactKeys(capsule.source_coverage_summary, SOURCE_COVERAGE_KEYS)) return "INVALID_CAPSULE_SOURCE_COVERAGE";
  if (!SOURCE_COVERAGE_KEYS.every((key) => isNonNegativeInteger(capsule.source_coverage_summary[key]))) {
    return "INVALID_CAPSULE_SOURCE_COVERAGE_COUNT";
  }
  if (!Array.isArray(capsule.active_proposals)) return "INVALID_CAPSULE_ACTIVE_PROPOSALS";
  for (const proposal of capsule.active_proposals) {
    if (!hasExactKeys(proposal, ACTIVE_PROPOSAL_KEYS)) return "INVALID_CAPSULE_ACTIVE_PROPOSAL";
    if (typeof proposal.cycle_id !== "string" || proposal.cycle_id === "" || typeof proposal.why_code !== "string") {
      return "INVALID_CAPSULE_ACTIVE_PROPOSAL";
    }
    if (![proposal.task_identity, proposal.proposed_action].every(isNullableString) || typeof proposal.required_authority !== "string") {
      return "INVALID_CAPSULE_ACTIVE_PROPOSAL";
    }
  }
  return null;
}

function makeHold(codes) {
  return deepFreeze({ status: "HOLD", hold_codes: [...new Set(codes)], projection: null });
}

export function buildPortfolioDecisionProjection(projectCapsules) {
  // Non-array input is a caller programming error; malformed capsule data is a HOLD.
  if (!Array.isArray(projectCapsules)) throw new PortfolioProjectionError("INVALID_CAPSULES_ARRAY");

  const seenProjects = new Set();
  const portfolioDispositionCounts = Object.fromEntries(DISPOSITIONS.map((disposition) => [disposition, 0]));
  const proposalsByProject = makeCountMap();
  const holdWhyCodeCounts = makeCountMap();
  const activeProposalsSummary = [];
  let totalReads = 0;
  let asOf = undefined;

  for (const capsule of projectCapsules) {
    const capsuleError = validateCapsule(capsule);
    if (capsuleError) return makeHold([capsuleError]);
    if (seenProjects.has(capsule.project_ref)) return makeHold(["DUPLICATE_PROJECT_IN_PORTFOLIO"]);
    if (asOf === undefined) asOf = capsule.as_of;
    else if (asOf !== capsule.as_of) return makeHold(["MIXED_AS_OF_HORIZON"]);
    seenProjects.add(capsule.project_ref);
    for (const disposition of DISPOSITIONS) portfolioDispositionCounts[disposition] += capsule.disposition_counts[disposition];
    proposalsByProject[capsule.project_ref] = capsule.disposition_counts.PROPOSAL;
    for (const [whyCode, count] of Object.entries(capsule.hold_why_code_counts)) increment(holdWhyCodeCounts, whyCode, count);
    for (const proposal of capsule.active_proposals) {
      activeProposalsSummary.push({
        project_ref: capsule.project_ref,
        cycle_id: proposal.cycle_id,
        task_identity: proposal.task_identity,
        why_code: proposal.why_code,
        proposed_action: proposal.proposed_action,
        required_authority: proposal.required_authority,
      });
    }
    totalReads += capsule.source_coverage_summary.source_read_count;
  }

  const totalHolds = portfolioDispositionCounts.HOLD;
  const holdCountTotal = Object.values(holdWhyCodeCounts).reduce((total, count) => total + count, 0);
  if (holdCountTotal !== totalHolds) return makeHold(["PORTFOLIO_HOLD_COUNT_MISMATCH"]);
  const portfolioRecordCount = Object.values(portfolioDispositionCounts).reduce((total, count) => total + count, 0);
  const projection = deepFreeze({
    project_count: seenProjects.size,
    record_count: portfolioRecordCount,
    as_of: asOf ?? null,
    projects: [...seenProjects].sort(),
    portfolio_disposition_counts: portfolioDispositionCounts,
    total_proposals: portfolioDispositionCounts.PROPOSAL,
    proposals_by_project: proposalsByProject,
    total_holds: totalHolds,
    hold_why_code_counts: holdWhyCodeCounts,
    source_read_count: totalReads,
    active_proposals_summary: activeProposalsSummary,
  });
  return deepFreeze({ status: "PROJECTED", hold_codes: [], projection });
}

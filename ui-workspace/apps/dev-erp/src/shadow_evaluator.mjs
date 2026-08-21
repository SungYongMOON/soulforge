import { isValidatedHourlyShadowCycle } from "./hourly_shadow_cycle_contract.mjs";

const HUMAN_VERDICTS = new Set(["ACCEPT", "REJECT", "CORRECT", "HOLD"]);
const OBSERVED_OUTCOMES = new Set(["ACTIONABLE", "NO_ACTION"]);
const HUMAN_VERDICT_KEYS = new Set(["verdict", "ground_truth", "adjudicated_at", "correction_category"]);
const LATER_OUTCOME_KEYS = new Set(["actual_need", "task_created", "outcome_at"]);
const EVALUATION_OPTION_KEYS = new Set(["evaluated_at"]);
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestampOrNull(value) {
  return value === null || (typeof value === "string" && ISO_8601_RE.test(value) && Number.isFinite(Date.parse(value)));
}

function hasOnlyKeys(value, allowedKeys) {
  return isRecord(value) && Object.keys(value).every((key) => allowedKeys.has(key));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function makeHold(codes) {
  return deepFreeze({ status: "HOLD", hold_codes: [...new Set(codes)], quality_receipt: null });
}

function normalizeHumanVerdict(value, disposition) {
  if (value === null || value === undefined) return { valid: true, outcome: "UNKNOWN", corrected: false };
  if (!hasOnlyKeys(value, HUMAN_VERDICT_KEYS)) return { valid: false, code: "INVALID_HUMAN_VERDICT_FIELDS" };
  if (!HUMAN_VERDICTS.has(value.verdict)) return { valid: false, code: "INVALID_HUMAN_VERDICT" };
  if (value.adjudicated_at !== undefined && !isTimestampOrNull(value.adjudicated_at)) {
    return { valid: false, code: "INVALID_HUMAN_VERDICT" };
  }
  if (value.ground_truth !== undefined && value.ground_truth !== null && !OBSERVED_OUTCOMES.has(value.ground_truth)) {
    return { valid: false, code: "INVALID_HUMAN_VERDICT" };
  }
  if (value.correction_category !== undefined && value.correction_category !== null && typeof value.correction_category !== "string") {
    return { valid: false, code: "INVALID_HUMAN_VERDICT" };
  }
  let outcome = value.ground_truth ?? "UNKNOWN";
  if (outcome === "UNKNOWN") {
    if (disposition === "PROPOSAL") {
      if (value.verdict === "ACCEPT") outcome = "ACTIONABLE";
      if (value.verdict === "REJECT") outcome = "NO_ACTION";
    } else if (disposition === "NO_ACTION") {
      if (value.verdict === "ACCEPT") outcome = "NO_ACTION";
      if (value.verdict === "REJECT") outcome = "ACTIONABLE";
    }
  }
  return { valid: true, outcome, corrected: value.verdict === "CORRECT" };
}

function normalizeObservedOutcome(value) {
  if (value === null || value === undefined) return { valid: true, outcome: "UNKNOWN" };
  if (!hasOnlyKeys(value, LATER_OUTCOME_KEYS)) return { valid: false, code: "INVALID_LATER_OUTCOME_FIELDS" };
  if (value.actual_need !== undefined && value.actual_need !== null && !OBSERVED_OUTCOMES.has(value.actual_need)) {
    return { valid: false, code: "INVALID_LATER_OUTCOME" };
  }
  if (value.task_created !== undefined && typeof value.task_created !== "boolean") return { valid: false, code: "INVALID_LATER_OUTCOME" };
  if (value.outcome_at !== undefined && !isTimestampOrNull(value.outcome_at)) return { valid: false, code: "INVALID_LATER_OUTCOME" };
  return { valid: true, outcome: value.actual_need ?? "UNKNOWN" };
}

function normalizeEvaluationOptions(value) {
  if (value === undefined || value === null) return { valid: true, evaluatedAt: null };
  if (!hasOnlyKeys(value, EVALUATION_OPTION_KEYS)) return { valid: false, code: "INVALID_EVALUATION_OPTIONS_FIELDS" };
  const evaluatedAt = value.evaluated_at ?? null;
  return isTimestampOrNull(evaluatedAt)
    ? { valid: true, evaluatedAt }
    : { valid: false, code: "INVALID_EVALUATED_AT" };
}

function deriveReasoningOutcome(disposition, human) {
  if (human.corrected) return "CORRECTED";
  if (human.outcome === "UNKNOWN") return "PENDING_VERDICT";
  if (disposition === "PROPOSAL") return human.outcome === "ACTIONABLE" ? "TRUE_POSITIVE" : "FALSE_POSITIVE";
  if (disposition === "NO_ACTION") return human.outcome === "ACTIONABLE" ? "FALSE_NEGATIVE" : "TRUE_NEGATIVE";
  return "PENDING_VERDICT";
}

function canonicalDimensionTuple(...parts) {
  return JSON.stringify(parts);
}

export function evaluateShadowCycle(validatedCycle, humanVerdict = null, laterOutcome = null, options = undefined) {
  if (!isValidatedHourlyShadowCycle(validatedCycle)) return makeHold(["INVALID_VALIDATED_CYCLE"]);
  const optionState = normalizeEvaluationOptions(options);
  if (!optionState.valid) return makeHold([optionState.code]);
  const human = normalizeHumanVerdict(humanVerdict, validatedCycle.disposition);
  if (!human.valid) return makeHold([human.code]);
  const observed = normalizeObservedOutcome(laterOutcome);
  if (!observed.valid) return makeHold([observed.code]);

  const reasoningOutcome = deriveReasoningOutcome(validatedCycle.disposition, human);
  const evidenceContradictory = human.outcome !== "UNKNOWN"
    && observed.outcome !== "UNKNOWN"
    && human.outcome !== observed.outcome;
  let errorClassification = "NO_ERROR";
  if (evidenceContradictory) errorClassification = "CONTRADICTORY_EVIDENCE";
  else if (reasoningOutcome === "FALSE_POSITIVE" || reasoningOutcome === "FALSE_NEGATIVE") errorClassification = "REASONING_MISS";
  else if (reasoningOutcome === "CORRECTED") errorClassification = "POLICY_AMBIGUITY";

  const decisionScored = ["TRUE_POSITIVE", "FALSE_POSITIVE", "TRUE_NEGATIVE", "FALSE_NEGATIVE"].includes(reasoningOutcome);
  const precisionEligible = decisionScored && validatedCycle.disposition === "PROPOSAL";
  const recallEligible = decisionScored && human.outcome === "ACTIONABLE";
  const taskType = validatedCycle.task_type ?? "UNKNOWN";
  const sourceNames = [...new Set(validatedCycle.source_reads.map((sourceRead) => sourceRead.source))].sort();
  const qualityReceipt = deepFreeze({
    cycle_id: validatedCycle.cycle_id,
    project_ref: validatedCycle.project_ref,
    task_type: taskType,
    dimension_keys: {
      aggregate: canonicalDimensionTuple("aggregate", validatedCycle.project_ref, taskType),
      per_source: sourceNames.map((source) => canonicalDimensionTuple("per_source", validatedCycle.project_ref, taskType, source)),
    },
    contract_invariants: {
      required_source_manifest_held: true,
      live_only_context_held: true,
      a0_zero_effect_held: true,
      hostile_marker_free_held: true,
    },
    reasoning_outcome: reasoningOutcome,
    error_classification: errorClassification,
    human_outcome: human.outcome,
    observed_outcome: observed.outcome,
    metrics: {
      precision_eligible: precisionEligible,
      precision_hit: precisionEligible ? reasoningOutcome === "TRUE_POSITIVE" : null,
      recall_eligible: recallEligible,
      recall_hit: recallEligible ? reasoningOutcome === "TRUE_POSITIVE" : null,
      no_action_consistent: validatedCycle.disposition === "NO_ACTION" && decisionScored
        ? reasoningOutcome === "TRUE_NEGATIVE"
        : null,
    },
    evaluated_at: optionState.evaluatedAt,
  });
  return deepFreeze({ status: "EVALUATED", hold_codes: [], quality_receipt: qualityReceipt });
}

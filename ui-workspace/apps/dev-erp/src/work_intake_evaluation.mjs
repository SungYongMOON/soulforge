import { createHash } from "node:crypto";
import { isWorkIntakeResult, WORK_INTAKE_CLASSIFICATIONS } from "./work_intake_adapter.mjs";
import { isValidatedHourlyShadowCycle } from "./hourly_shadow_cycle_contract.mjs";
import { evaluateShadowCycle } from "./shadow_evaluator.mjs";

// Synthetic contract evaluation only. Declared fixture verdicts and observations
// are not human acceptance, actual model utility, or operational outcome evidence.
const REPORTS = new WeakSet();
const PROPOSALS = new Set(["NEW", "FOLLOW_UP", "EVIDENCE"]);
const STAGES = ["adopted", "executed", "verified", "used"];
const MEASUREMENTS = ["input_tokens", "output_tokens", "cost_usd", "tool_calls", "repeat_reads", "bytes_read", "latency_ms", "human_check_count", "human_correction_count", "human_time_ms"];
const READBACKS = new Set(["UNKNOWN", "NOT_ATTEMPTED", "REQUIRED", "PENDING", "PASS", "FAIL"]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const token = (v) => typeof v === "string" && TOKEN.test(v);
const timestamp = (v) => typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v));
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const only = (v, keys) => record(v) && Object.keys(v).every((key) => keys.includes(key));
const freeze = (v) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const hold = (...codes) => freeze({ status: "HOLD", hold_codes: [...new Set(codes)], report: null });
const unknownObservation = () => ({ value: "UNKNOWN", evidence_ref: null });

function validateObservation(value, enumValues) {
  return exact(value, ["value", "evidence_ref"]) && enumValues.has(value.value)
    && (value.evidence_ref === null || token(value.evidence_ref))
    && (!["YES", "NO", "PASS", "FAIL"].includes(value.value) || token(value.evidence_ref));
}

function normalizeObservations(values, eventIds) {
  if (!Array.isArray(values) || values.length > 64) return null;
  const result = new Map();
  for (const row of values) {
    if (!only(row, ["event_identity", "provenance", ...STAGES, "repeat_exposure", "receipt_self_readback", "business_effect_readback"])
      || !eventIds.has(row.event_identity) || result.has(row.event_identity) || row.provenance !== "synthetic") return null;
    const normalized = {};
    for (const stage of [...STAGES, "repeat_exposure"]) {
      const value = row[stage] ?? unknownObservation();
      if (!validateObservation(value, new Set(["YES", "NO", "UNKNOWN"]))) return null;
      normalized[stage] = { ...value };
    }
    for (const field of ["receipt_self_readback", "business_effect_readback"]) {
      const value = row[field] ?? unknownObservation();
      if (!validateObservation(value, READBACKS)) return null;
      normalized[field] = { ...value };
    }
    // Later stages need their own evidence and preceding-stage evidence. A PASS
    // receipt or a created Issue is never substituted for this chain.
    for (let i = 1; i < STAGES.length; i++) if (normalized[STAGES[i]].value === "YES" && normalized[STAGES[i - 1]].value !== "YES") return null;
    result.set(row.event_identity, normalized);
  }
  return result;
}

function normalizeMeasurements(values) {
  if (!only(values, MEASUREMENTS)) return null;
  const output = {};
  for (const key of MEASUREMENTS) {
    const measurement = values[key] ?? { value: "UNKNOWN", evidence_ref: null };
    if (!exact(measurement, ["value", "evidence_ref"])) return null;
    if (measurement.value === "UNKNOWN") {
      if (measurement.evidence_ref !== null) return null;
    } else if (typeof measurement.value !== "number" || !Number.isFinite(measurement.value) || measurement.value < 0 || !token(measurement.evidence_ref)
      || (key !== "cost_usd" && !Number.isSafeInteger(measurement.value))) return null;
    output[key] = { ...measurement };
  }
  return output;
}

export function isWorkIntakeEvaluation(value) {
  return record(value) && REPORTS.has(value);
}

export function evaluateWorkIntakeRun(run, input) {
  try {
    // Never send historical replay or unbound live input to the live-only core
    // evaluator. Its cycle brand is necessary but not sufficient here.
    if (!isWorkIntakeResult(run)) return hold("INVALID_INTAKE_RESULT");
    if (run.provenance !== "synthetic") return hold("NON_SYNTHETIC_EVALUATION_FORBIDDEN");
    if (!only(input, ["partition", "case_set_ref", "verdict_provenance", "cases", "observations", "measurements", "evaluated_at"])
      || !["development", "evaluation"].includes(input.partition) || !token(input.case_set_ref)
      || !timestamp(input.evaluated_at) || !Array.isArray(input.cases) || input.cases.length > 64) return hold("INVALID_EVALUATION_INPUT");
    const provenance = input.verdict_provenance;
    if (!exact(provenance, ["kind", "author_ref", "producer_author_ref", "frozen_at", "source_snapshot_sha256", "development_event_identities"])
      || provenance.kind !== "independent_synthetic_fixture" || !token(provenance.author_ref) || !token(provenance.producer_author_ref)
      || provenance.author_ref === provenance.producer_author_ref || !timestamp(provenance.frozen_at)
      || !HASH.test(provenance.source_snapshot_sha256) || provenance.source_snapshot_sha256 !== run.snapshot_sha256
      || !Array.isArray(provenance.development_event_identities) || provenance.development_event_identities.length > 128
      || !provenance.development_event_identities.every(token)
      || !timestamp(run.observed_at) || Date.parse(provenance.frozen_at) > Date.parse(run.observed_at)
      || Date.parse(input.evaluated_at) < Date.parse(run.observed_at)) return hold("INVALID_INDEPENDENT_VERDICT_PROVENANCE");
    const events = run.attempts.filter((attempt) => attempt.kind === "event");
    if (run.attempts.some((attempt) => attempt.kind === "input")) return hold("INPUT_NOT_EVALUABLE");
    const eventIds = new Set(events.map((attempt) => attempt.event_identity));
    if (eventIds.size !== events.length || events.some((attempt) => !token(attempt.event_identity))) return hold("AMBIGUOUS_EVENT_IDENTITY");
    const cases = new Map(), caseIds = new Set();
    for (const value of input.cases) {
      if (!exact(value, ["case_id", "partition", "event_identity", "expected_classification", "expected_project_ref", "verdict_ref"])
        || !token(value.case_id) || value.partition !== input.partition || !eventIds.has(value.event_identity)
        || !WORK_INTAKE_CLASSIFICATIONS.includes(value.expected_classification) || !token(value.expected_project_ref) || !token(value.verdict_ref)
        || cases.has(value.event_identity) || caseIds.has(value.case_id)) return hold("INVALID_OR_MIXED_CASE_SET");
      if (input.partition === "evaluation" && provenance.development_event_identities.includes(value.event_identity)) return hold("DEVELOPMENT_CASE_IN_EVALUATION");
      cases.set(value.event_identity, { ...value }); caseIds.add(value.case_id);
    }
    if (cases.size !== events.length) return hold("INDEPENDENT_VERDICT_MISSING");
    const observations = normalizeObservations(input.observations ?? [], eventIds);
    const measurements = normalizeMeasurements(input.measurements ?? {});
    if (!observations || !measurements) return hold("INVALID_SYNTHETIC_OBSERVATION");
    const rows = [];
    for (const attempt of events) {
      const expected = cases.get(attempt.event_identity);
      const observation = observations.get(attempt.event_identity) ?? Object.fromEntries([...STAGES, "repeat_exposure", "receipt_self_readback", "business_effect_readback"].map((key) => [key, unknownObservation()]));
      if (observation.adopted.value === "YES" && !PROPOSALS.has(attempt.classification)) return hold("ADOPTION_WITHOUT_PROPOSAL");
      let coreEvaluation = null;
      if (attempt.shadow_cycle !== null) {
        if (!isValidatedHourlyShadowCycle(attempt.shadow_cycle)) return hold("INVALID_SHADOW_CYCLE");
        const actionable = PROPOSALS.has(expected.expected_classification);
        const verdict = expected.expected_classification === "HOLD" ? null : {
          verdict: attempt.classification === expected.expected_classification ? "ACCEPT" : "REJECT",
          ground_truth: actionable ? "ACTIONABLE" : "NO_ACTION", adjudicated_at: provenance.frozen_at,
        };
        coreEvaluation = evaluateShadowCycle(attempt.shadow_cycle, verdict, null, { evaluated_at: input.evaluated_at });
        if (coreEvaluation.status !== "EVALUATED") return hold("CORE_EVALUATION_FAILED");
      } else if (attempt.classification !== "HOLD") return hold("DECISION_WITHOUT_VALIDATED_CYCLE");
      rows.push({ attempt_id: attempt.attempt_id, event_identity: attempt.event_identity, case_id: expected.case_id,
        classification: attempt.classification, expected_classification: expected.expected_classification,
        expected_project_ref: expected.expected_project_ref, verdict_ref: expected.verdict_ref,
        classification_match: attempt.classification === expected.expected_classification,
        missed_action: PROPOSALS.has(expected.expected_classification) && attempt.classification === "NO_ACTION",
        excess_hold: expected.expected_classification !== "HOLD" && attempt.classification === "HOLD",
        wrong_project: PROPOSALS.has(attempt.classification) && run.project_ref !== expected.expected_project_ref,
        observation, core_evaluation: coreEvaluation });
    }
    const count = (predicate) => rows.filter(predicate).length;
    const sourceAttempts = run.attempts.filter((attempt) => attempt.kind === "source_read");
    const counts = {
      attempts: run.attempts.length, event_attempts: events.length, read_attempts: sourceAttempts.length,
      read_failures: sourceAttempts.filter((attempt) => attempt.status === "HOLD").length,
      decidable: count((row) => row.classification !== "HOLD"), proposed: count((row) => PROPOSALS.has(row.classification)),
      held: count((row) => row.classification === "HOLD"), missed_actions: count((row) => row.missed_action),
      excess_holds: count((row) => row.excess_hold), wrong_project: count((row) => row.wrong_project),
      classification_matches: count((row) => row.classification_match),
    };
    const stageCounts = Object.fromEntries([...STAGES, "repeat_exposure"].map((stage) => {
      const index = STAGES.indexOf(stage);
      const eligible = (row) => stage === "repeat_exposure" || (index === 0 ? PROPOSALS.has(row.classification) : row.observation[STAGES[index - 1]].value === "YES");
      return [stage, {
        yes: count((row) => row.observation[stage].value === "YES"), no: count((row) => row.observation[stage].value === "NO"),
        unknown: count((row) => row.observation[stage].value === "UNKNOWN"), eligible: count(eligible),
        eligible_unknown: count((row) => eligible(row) && row.observation[stage].value === "UNKNOWN"),
      }];
    }));
    const ratios = {
      decidable_per_event_attempt: { numerator: counts.decidable, denominator: counts.event_attempts },
      proposed_per_decidable: { numerator: counts.proposed, denominator: counts.decidable },
      adopted_per_proposed: { numerator: stageCounts.adopted.yes, denominator: counts.proposed, unknown: stageCounts.adopted.eligible_unknown },
      executed_per_adopted: { numerator: stageCounts.executed.yes, denominator: stageCounts.adopted.yes, unknown: stageCounts.executed.eligible_unknown },
      verified_per_executed: { numerator: stageCounts.verified.yes, denominator: stageCounts.executed.yes, unknown: stageCounts.verified.eligible_unknown },
      used_per_verified: { numerator: stageCounts.used.yes, denominator: stageCounts.verified.yes, unknown: stageCounts.used.eligible_unknown },
    };
    const report = freeze({ provenance: "synthetic", claim: "contract_fixture_only", measured_model_utility: false,
      run_id: run.run_id, run_status: run.status, input_sha256: run.input_sha256, snapshot_sha256: run.snapshot_sha256,
      partition: input.partition, case_set_ref: input.case_set_ref,
      case_set_sha256: sha([...cases.values()].sort((a, b) => a.case_id.localeCompare(b.case_id))),
      verdict_provenance: { ...provenance, development_event_identities: [...provenance.development_event_identities] },
      comparison_dimensions: structuredClone(run.comparison_dimensions ?? null),
      counts, stage_counts: stageCounts, ratios, measurements, rows, evaluated_at: input.evaluated_at,
    });
    const value = freeze({ status: "EVALUATED", hold_codes: [], report }); REPORTS.add(value); return value;
  } catch {
    return hold("INVALID_EVALUATION_INPUT");
  }
}

export function compareWorkIntakeEvaluations(values, options = { vary_dimensions: [] }) {
  try {
  const dimensionKeys = ["policy_ref", "model_ref", "prompt_sha256_ref", "document_manifest_sha256", "document_evidence_sha256"];
  if (!exact(options, ["vary_dimensions"]) || !Array.isArray(options.vary_dimensions)
    || new Set(options.vary_dimensions).size !== options.vary_dimensions.length
    || options.vary_dimensions.some((key) => !dimensionKeys.includes(key))) return hold("INVALID_COMPARISON_INTERVENTIONS");
  if (!Array.isArray(values) || values.length < 2 || values.length > 8 || !values.every(isWorkIntakeEvaluation)) return hold("INVALID_COMPARISON_REPORTS");
  const first = values[0].report;
  if (values.some(({ report }) => report.snapshot_sha256 !== first.snapshot_sha256)) return hold("IMMUTABLE_INPUT_MISMATCH");
  if (values.some(({ report }) => report.partition !== first.partition || report.case_set_sha256 !== first.case_set_sha256 || report.case_set_ref !== first.case_set_ref)) return hold("COMPARISON_CASE_SET_MISMATCH");
  if (values.some(({ report }) => !exact(report.comparison_dimensions, dimensionKeys)
    || !token(report.comparison_dimensions.policy_ref) || !token(report.comparison_dimensions.model_ref)
    || report.comparison_dimensions.model_ref === "UNKNOWN"
    || !["prompt_sha256_ref", "document_manifest_sha256", "document_evidence_sha256"].every((key) => HASH.test(report.comparison_dimensions[key])))) return hold("COMPARISON_DIMENSIONS_UNKNOWN");
  const changed = dimensionKeys.filter((key) => values.some(({ report }) => report.comparison_dimensions[key] !== first.comparison_dimensions[key]));
  if (changed.some((key) => !options.vary_dimensions.includes(key))) return hold("UNDECLARED_COMPARISON_INTERVENTION");
  return freeze({ status: "COMPARABLE", hold_codes: [], provenance: "synthetic", measured_model_utility: false,
    snapshot_sha256: first.snapshot_sha256, partition: first.partition,
    varied_dimensions: changed,
    variants: values.map(({ report }) => ({ run_id: report.run_id, dimensions: structuredClone(report.comparison_dimensions), counts: report.counts, stage_counts: report.stage_counts, ratios: report.ratios, measurements: report.measurements })),
    winner: "NOT_INFERRED", token_savings: "UNKNOWN" });
  } catch {
    return hold("INVALID_COMPARISON_REPORTS");
  }
}

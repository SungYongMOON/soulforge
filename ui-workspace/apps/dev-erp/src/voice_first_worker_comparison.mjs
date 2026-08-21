import { createHash } from "node:crypto";

import {
  canonicalEvidenceJson,
  validateAiQualityResult,
  validateAiWorkRun,
} from "../../../../guild_hall/ai_usage_meter/evidence_ledger.mjs";

export const WORKER_COMPARISON_INPUT_SCHEMA = "soulforge.voice_first_worker_comparison_input.v1";
export const WORKER_COMPARISON_RECEIPT_SCHEMA = "soulforge.voice_first_worker_comparison_receipt.v1";
export const WORKER_COMPARISON_POLICY_REVISION = "soulforge.voice_first_worker_comparison_policy.v1";

export const ACCEPTED_WORKERS = Object.freeze(["codex", "gemini_flash", "grok_build"]);

const ACCEPTED_WORKER_SET = new Set(ACCEPTED_WORKERS);
const ACCEPTED_MODEL_SET_BY_WORKER = Object.freeze({
  codex: new Set(["gpt-5-codex", "codex-2026-08", "o3-mini-codex", "o1-codex", "codex-synthetic-v1"]),
  gemini_flash: new Set(["gemini-2.5-flash", "gemini-3.7-flash", "gemini-2.0-flash", "gemini-flash-2026-08", "gemini-flash-synthetic-v1"]),
  grok_build: new Set(["grok-build-v1", "grok-3-build", "grok-code-v1", "grok-build-2026-08", "grok-build-synthetic-v1"]),
});

// Public catalog data is immutable. The mutable lookup sets stay module-private.
export const ACCEPTED_MODELS_PER_WORKER = Object.freeze(Object.fromEntries(
  Object.entries(ACCEPTED_MODEL_SET_BY_WORKER).map(([workerId, models]) => [workerId, Object.freeze([...models])]),
));

export function isAcceptedModelForWorker(workerId, modelId) {
  return ACCEPTED_MODEL_SET_BY_WORKER[workerId]?.has(modelId) === true;
}

export const WORKER_COMPARISON_HOLD_CODES = Object.freeze({
  INVALID_INPUT_SHAPE: "INVALID_INPUT_SHAPE",
  INVALID_SCHEMA_VERSION: "INVALID_SCHEMA_VERSION",
  POLICY_REVISION_MISMATCH: "POLICY_REVISION_MISMATCH",
  WORK_UNIT_PIN_INVALID: "WORK_UNIT_PIN_INVALID",
  COHORT_SIZE_INVALID: "COHORT_SIZE_INVALID",
  MISSING_WORKER: "MISSING_WORKER",
  DUPLICATE_WORKER: "DUPLICATE_WORKER",
  DUPLICATE_RUN_ID: "DUPLICATE_RUN_ID",
  ACCEPTED_MODEL_MISMATCH: "ACCEPTED_MODEL_MISMATCH",
  WORK_RUN_INVALID: "WORK_RUN_INVALID",
  MEASUREMENT_INCOMPLETE: "MEASUREMENT_INCOMPLETE",
  QUALITY_RESULT_INVALID: "QUALITY_RESULT_INVALID",
  QUALITY_RESULT_NOT_ACCEPTED: "QUALITY_RESULT_NOT_ACCEPTED",
  WORK_UNIT_MISMATCH: "WORK_UNIT_MISMATCH",
  RUN_BINDING_INVALID: "RUN_BINDING_INVALID",
  RUN_BINDING_MISMATCH: "RUN_BINDING_MISMATCH",
  VALIDATOR_BINDING_INVALID: "VALIDATOR_BINDING_INVALID",
  VALIDATOR_BINDING_MISMATCH: "VALIDATOR_BINDING_MISMATCH",
  VALIDATOR_EVIDENCE_DUPLICATE: "VALIDATOR_EVIDENCE_DUPLICATE",
  DETERMINISTIC_VALIDATOR_INVALID: "DETERMINISTIC_VALIDATOR_INVALID",
  DETERMINISTIC_VALIDATOR_NOT_PASSED: "DETERMINISTIC_VALIDATOR_NOT_PASSED",
  INDEPENDENT_REVIEW_INVALID: "INDEPENDENT_REVIEW_INVALID",
  INDEPENDENT_REVIEW_NOT_ACCEPTED: "INDEPENDENT_REVIEW_NOT_ACCEPTED",
  INDEPENDENT_REVIEW_DUPLICATE: "INDEPENDENT_REVIEW_DUPLICATE",
  REVIEW_BINDING_INVALID: "REVIEW_BINDING_INVALID",
  REVIEW_BINDING_MISMATCH: "REVIEW_BINDING_MISMATCH",
  CAUSAL_TIME_ORDER_INVALID: "CAUSAL_TIME_ORDER_INVALID",
  COMPARISON_BASIS_MISMATCH: "COMPARISON_BASIS_MISMATCH",
  ELAPSED_TIME_MISMATCH: "ELAPSED_TIME_MISMATCH",
  EFFECT_COUNTERS_NON_ZERO: "EFFECT_COUNTERS_NON_ZERO",
  CORRECTION_EVIDENCE_MISMATCH: "CORRECTION_EVIDENCE_MISMATCH",
  RAW_OR_SECRET_DATA_DETECTED: "RAW_OR_SECRET_DATA_DETECTED",
});

const C = WORKER_COMPARISON_HOLD_CODES;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const SHA256_HEX = /^sha256:[a-f0-9]{64}$/u;
const UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_GRAPH_DEPTH = 10;
const MAX_GRAPH_NODES = 512;
const MAX_GRAPH_BREADTH = 64;
const MAX_STRING_LENGTH = 4096;

const CREDENTIAL_PATTERN = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const FORBIDDEN_SECRET_KEY = /(?:^|[:._-])(?:token|secret|credential|password|passwd|cookie|bearer)(?:[:._=-]|$)/iu;

const TOP_LEVEL_FIELDS = Object.freeze(["schema_version", "comparison_id", "work_unit_pin", "cohort"]);
const WORK_UNIT_PIN_FIELDS = Object.freeze(["work_unit_id", "inputs_digest", "constraints_digest", "completion_criteria_digest", "validator_digest", "policy_digest", "policy_ref"]);
const COHORT_ENTRY_FIELDS = Object.freeze(["worker_id", "work_run", "quality_result", "run_binding", "validator_binding", "deterministic_validator_result", "independent_reviewer_result", "review_binding", "metrics"]);
const RUN_BINDING_FIELDS = Object.freeze(["worker_id", "run_id", "work_unit_id", "inputs_digest", "constraints_digest", "completion_criteria_digest", "validator_digest", "policy_digest"]);
const VALIDATOR_BINDING_FIELDS = Object.freeze(["worker_id", "run_id", "work_unit_id", "validator_ref", "validator_digest", "validation_evidence_ref", "validation_evidence_digest", "execution_receipt_ref", "execution_receipt_digest"]);
const VALIDATOR_FIELDS = Object.freeze(["validator_ref", "validator_digest", "quality_policy_ref", "quality_policy_digest", "decision", "passed_checks", "total_checks", "occurred_at"]);
const REVIEW_FIELDS = Object.freeze(["reviewer_ref", "review_ref", "review_digest", "decision", "is_independent", "occurred_at"]);
const REVIEW_BINDING_FIELDS = Object.freeze(["worker_id", "run_id", "work_unit_id", "review_ref", "review_digest"]);
const EFFECT_COUNTER_FIELDS = Object.freeze(["linear_mutations", "erp_mutations", "gmail_sends", "slack_posts", "git_commits", "task_mutations", "external_calls"]);
const METRIC_FIELDS = Object.freeze(["elapsed_ms", "correction_count", "correction_evidence_ref", "effect_counters"]);

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function snapshotInput(value) {
  const seen = new WeakMap();
  const ancestors = new WeakSet();
  let nodeCount = 0;
  const invalid = (reason) => ({ ok: false, reason });

  function clone(current, depth) {
    if (depth > MAX_GRAPH_DEPTH) return invalid(C.INVALID_INPUT_SHAPE);
    if (current === null || current === undefined) return { ok: true, value: current };
    if (typeof current === "string") {
      if (current.length > MAX_STRING_LENGTH) return invalid(C.INVALID_INPUT_SHAPE);
      if (CREDENTIAL_PATTERN.test(current)) return invalid(C.RAW_OR_SECRET_DATA_DETECTED);
      return { ok: true, value: current };
    }
    if (typeof current === "number" || typeof current === "boolean") return { ok: true, value: current };
    if (typeof current !== "object") return invalid(C.INVALID_INPUT_SHAPE);
    if (++nodeCount > MAX_GRAPH_NODES || ancestors.has(current)) return invalid(C.INVALID_INPUT_SHAPE);
    if (seen.has(current)) return { ok: true, value: seen.get(current) };

    let prototype;
    let keys;
    try {
      prototype = Object.getPrototypeOf(current);
      keys = Object.keys(current);
      if (Object.getOwnPropertySymbols(current).length > 0) return invalid(C.INVALID_INPUT_SHAPE);
    } catch {
      return invalid(C.INVALID_INPUT_SHAPE);
    }
    if (!Array.isArray(current) && prototype !== null && prototype !== Object.prototype) return invalid(C.INVALID_INPUT_SHAPE);
    if (keys.length > MAX_GRAPH_BREADTH) return invalid(C.INVALID_INPUT_SHAPE);
    if (Array.isArray(current)) {
      let length;
      try {
        length = current.length;
      } catch {
        return invalid(C.INVALID_INPUT_SHAPE);
      }
      if (!Number.isSafeInteger(length) || length > MAX_GRAPH_BREADTH || keys.length !== length || keys.some((key, index) => key !== String(index))) return invalid(C.INVALID_INPUT_SHAPE);
    }

    const target = Array.isArray(current) ? [] : {};
    seen.set(current, target);
    ancestors.add(current);
    for (const key of keys) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return invalid(C.INVALID_INPUT_SHAPE);
      if (FORBIDDEN_SECRET_KEY.test(key)) return invalid(C.RAW_OR_SECRET_DATA_DETECTED);
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(current, key);
      } catch {
        return invalid(C.INVALID_INPUT_SHAPE);
      }
      if (!descriptor || !("value" in descriptor)) return invalid(C.INVALID_INPUT_SHAPE);
      const child = clone(descriptor.value, depth + 1);
      if (!child.ok) return child;
      target[key] = child.value;
    }
    ancestors.delete(current);
    return { ok: true, value: target };
  }

  return clone(value, 0);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function hasExactKeys(object, fields) {
  if (!isPlainObject(object)) return false;
  const keys = Object.keys(object);
  return keys.length === fields.length && fields.every((field) => Object.prototype.hasOwnProperty.call(object, field));
}

function isValidId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function isValidSha256(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function timestampEpoch(value) {
  if (typeof value !== "string" || !UTC_MILLIS.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : null;
}

function canonicalValidatorPass(validator, value) {
  try {
    validator(value);
    return true;
  } catch {
    return false;
  }
}

function sameJson(left, right) {
  return canonicalEvidenceJson(left) === canonicalEvidenceJson(right);
}

function hold(holdCodes) {
  return deepFreeze({ status: "HOLD", hold_codes: [...holdCodes].sort(), receipt: null });
}

function createBodyId(prefix, body) {
  return `${prefix}${createHash("sha256").update(canonicalEvidenceJson(body)).digest("hex").slice(0, 16)}`;
}

function rankEntries(entries, direction) {
  const sorted = [...entries].sort((left, right) => {
    const difference = direction * (left.value - right.value);
    return difference !== 0 ? difference : left.worker_id.localeCompare(right.worker_id);
  });
  const groups = [];
  for (const entry of sorted) {
    const last = groups.at(-1);
    if (last && last.value === entry.value) last.worker_ids.push(entry.worker_id);
    else groups.push({ value: entry.value, worker_ids: [entry.worker_id] });
  }
  return {
    rank: sorted.map((entry) => entry.worker_id),
    ties: groups.filter((group) => group.worker_ids.length > 1).map(({ worker_ids }) => worker_ids),
  };
}

function comparisonBasis(workRun, qualityResult, validator) {
  return {
    metric_id: qualityResult.metric_id,
    scale_min: qualityResult.scale_min,
    scale_max: qualityResult.scale_max,
    evaluator_kind: qualityResult.evaluator_kind,
    repo_commit: workRun.repo_commit,
    instruction_manifest_ref: workRun.instruction_manifest_ref,
    task_class: workRun.task_class,
    cost_scope: workRun.cost_scope,
    variant: workRun.variant,
    topology: workRun.topology,
    run_scope: workRun.run_scope,
    cost_role: workRun.cost_role,
    launcher_version: workRun.launcher_version,
    experiment_id: workRun.experiment_id,
    risk_class: workRun.risk_class,
    reasoning_effort: workRun.reasoning_effort,
    total_checks: validator.total_checks,
    quality_policy_ref: validator.quality_policy_ref,
    quality_policy_digest: validator.quality_policy_digest,
  };
}

export function compareWorkerCohort(input) {
  const snapshot = snapshotInput(input);
  if (!snapshot.ok || !isPlainObject(snapshot.value)) return hold(new Set([snapshot.reason ?? C.INVALID_INPUT_SHAPE]));
  const packet = snapshot.value;
  const holdCodes = new Set();

  if (!hasExactKeys(packet, TOP_LEVEL_FIELDS)) holdCodes.add(C.INVALID_INPUT_SHAPE);
  if (packet.schema_version !== WORKER_COMPARISON_INPUT_SCHEMA) holdCodes.add(C.INVALID_SCHEMA_VERSION);
  if (!isValidId(packet.comparison_id)) holdCodes.add(C.INVALID_INPUT_SHAPE);

  const pin = packet.work_unit_pin;
  if (!isPlainObject(pin) || !hasExactKeys(pin, WORK_UNIT_PIN_FIELDS) || !isValidId(pin.work_unit_id) ||
    !isValidSha256(pin.inputs_digest) || !isValidSha256(pin.constraints_digest) || !isValidSha256(pin.completion_criteria_digest) ||
    !isValidSha256(pin.validator_digest) || !isValidSha256(pin.policy_digest)) {
    holdCodes.add(C.WORK_UNIT_PIN_INVALID);
  } else if (pin.policy_ref !== WORKER_COMPARISON_POLICY_REVISION) {
    holdCodes.add(C.POLICY_REVISION_MISMATCH);
  }

  const cohort = packet.cohort;
  if (!Array.isArray(cohort) || cohort.length !== ACCEPTED_WORKERS.length) holdCodes.add(C.COHORT_SIZE_INVALID);
  if (holdCodes.size > 0) return hold(holdCodes);

  const workerMap = new Map();
  for (const entry of cohort) {
    if (!isPlainObject(entry) || !hasExactKeys(entry, COHORT_ENTRY_FIELDS)) {
      holdCodes.add(C.INVALID_INPUT_SHAPE);
      continue;
    }
    if (!ACCEPTED_WORKER_SET.has(entry.worker_id)) {
      holdCodes.add(C.ACCEPTED_MODEL_MISMATCH);
      continue;
    }
    if (workerMap.has(entry.worker_id)) {
      holdCodes.add(C.DUPLICATE_WORKER);
      continue;
    }
    workerMap.set(entry.worker_id, entry);
  }
  if (workerMap.size !== ACCEPTED_WORKERS.length && !holdCodes.has(C.DUPLICATE_WORKER) && !holdCodes.has(C.ACCEPTED_MODEL_MISMATCH)) holdCodes.add(C.MISSING_WORKER);
  if (holdCodes.size > 0) return hold(holdCodes);

  const perWorkerMetrics = {};
  const runBindings = {};
  const validatorBindings = {};
  const reviewBindings = {};
  const bases = [];
  const speedEntries = [];
  const correctionEntries = [];
  const qualityEntries = [];
  const reviewRefs = new Set();
  const reviewDigests = new Set();
  const runIds = new Set();
  const validatorEvidenceRefs = new Set();
  const validatorEvidenceDigests = new Set();
  const executionReceiptRefs = new Set();
  const executionReceiptDigests = new Set();
  let latestEpoch = -Infinity;
  let latestTimestamp = null;
  const considerTimestamp = (value) => {
    const epoch = timestampEpoch(value);
    if (epoch !== null && epoch > latestEpoch) {
      latestEpoch = epoch;
      latestTimestamp = value;
    }
  };

  for (const workerId of ACCEPTED_WORKERS) {
    const entry = workerMap.get(workerId);
    const { work_run: workRun, quality_result: qualityResult, run_binding: runBinding, validator_binding: validatorBinding, deterministic_validator_result: validator, independent_reviewer_result: reviewer, review_binding: reviewBinding, metrics } = entry;
    const workRunValid = canonicalValidatorPass(validateAiWorkRun, workRun);
    const qualityValid = canonicalValidatorPass(validateAiQualityResult, qualityResult);
    let workRunMeasurable = workRunValid;
    let validatorValid = false;
    let validatorBindingValid = false;
    let reviewerValid = false;
    let reviewBindingValid = false;
    let metricsValid = false;

    if (!workRunValid) holdCodes.add(C.WORK_RUN_INVALID);
    else {
      const startedEpoch = timestampEpoch(workRun.started_at);
      const completedEpoch = timestampEpoch(workRun.completed_at);
      if (startedEpoch === null || (workRun.completed_at !== null && completedEpoch === null) || (completedEpoch !== null && completedEpoch < startedEpoch)) {
        holdCodes.add(C.WORK_RUN_INVALID);
        workRunMeasurable = false;
      }
      if (workRun.measurement_status !== "complete" || workRun.completed_at === null) {
        holdCodes.add(C.MEASUREMENT_INCOMPLETE);
        workRunMeasurable = false;
      }
      if (workRun.work_id !== pin.work_unit_id) holdCodes.add(C.WORK_UNIT_MISMATCH);
      if (!isAcceptedModelForWorker(workerId, workRun.model_id)) holdCodes.add(C.ACCEPTED_MODEL_MISMATCH);
      if (runIds.has(workRun.run_id)) holdCodes.add(C.DUPLICATE_RUN_ID);
      runIds.add(workRun.run_id);
      considerTimestamp(workRun.started_at);
      if (workRun.completed_at !== null) considerTimestamp(workRun.completed_at);
    }

    if (!qualityValid) holdCodes.add(C.QUALITY_RESULT_INVALID);
    else {
      if (qualityResult.work_id !== pin.work_unit_id || !workRunValid || qualityResult.run_id !== workRun.run_id) holdCodes.add(C.WORK_UNIT_MISMATCH);
      if (qualityResult.decision !== "pass") holdCodes.add(C.QUALITY_RESULT_NOT_ACCEPTED);
      if (qualityResult.score === null || qualityResult.evidence_refs.length === 0) holdCodes.add(C.QUALITY_RESULT_INVALID);
      considerTimestamp(qualityResult.occurred_at);
    }

    if (!isPlainObject(runBinding) || !hasExactKeys(runBinding, RUN_BINDING_FIELDS) || !Object.values(runBinding).every((value) => typeof value === "string") ||
      !isValidId(runBinding.worker_id) || !isValidId(runBinding.run_id) || !isValidId(runBinding.work_unit_id) || !isValidSha256(runBinding.inputs_digest) ||
      !isValidSha256(runBinding.constraints_digest) || !isValidSha256(runBinding.completion_criteria_digest) || !isValidSha256(runBinding.validator_digest) || !isValidSha256(runBinding.policy_digest)) {
      holdCodes.add(C.RUN_BINDING_INVALID);
    } else if (runBinding.worker_id !== workerId || !workRunValid || runBinding.run_id !== workRun.run_id || runBinding.work_unit_id !== pin.work_unit_id ||
      runBinding.inputs_digest !== pin.inputs_digest || runBinding.constraints_digest !== pin.constraints_digest || runBinding.completion_criteria_digest !== pin.completion_criteria_digest ||
      runBinding.validator_digest !== pin.validator_digest || runBinding.policy_digest !== pin.policy_digest) {
      holdCodes.add(C.RUN_BINDING_MISMATCH);
    }

    if (!isPlainObject(validator) || !hasExactKeys(validator, VALIDATOR_FIELDS) || !isValidId(validator.validator_ref) || !isValidSha256(validator.validator_digest) ||
      !isValidId(validator.quality_policy_ref) || !isValidSha256(validator.quality_policy_digest) || !["pass", "fail", "hold"].includes(validator.decision) ||
      !Number.isSafeInteger(validator.passed_checks) || !Number.isSafeInteger(validator.total_checks) || validator.passed_checks < 0 || validator.total_checks <= 0 ||
      validator.passed_checks > validator.total_checks || timestampEpoch(validator.occurred_at) === null) {
      holdCodes.add(C.DETERMINISTIC_VALIDATOR_INVALID);
    } else {
      validatorValid = true;
      if (validator.validator_digest !== pin.validator_digest) holdCodes.add(C.WORK_UNIT_MISMATCH);
      if (validator.decision !== "pass") holdCodes.add(C.DETERMINISTIC_VALIDATOR_NOT_PASSED);
      if (validator.decision === "pass" && validator.passed_checks !== validator.total_checks) holdCodes.add(C.DETERMINISTIC_VALIDATOR_INVALID);
      considerTimestamp(validator.occurred_at);
    }

    if (!isPlainObject(validatorBinding) || !hasExactKeys(validatorBinding, VALIDATOR_BINDING_FIELDS) || !isValidId(validatorBinding.worker_id) ||
      !isValidId(validatorBinding.run_id) || !isValidId(validatorBinding.work_unit_id) || !isValidId(validatorBinding.validator_ref) ||
      !isValidSha256(validatorBinding.validator_digest) || !isValidId(validatorBinding.validation_evidence_ref) ||
      !isValidSha256(validatorBinding.validation_evidence_digest) || !isValidId(validatorBinding.execution_receipt_ref) ||
      !isValidSha256(validatorBinding.execution_receipt_digest)) {
      holdCodes.add(C.VALIDATOR_BINDING_INVALID);
    } else {
      validatorBindingValid = true;
      if (validatorBinding.worker_id !== workerId || !workRunValid || validatorBinding.run_id !== workRun.run_id || validatorBinding.work_unit_id !== pin.work_unit_id ||
        !validatorValid || validatorBinding.validator_ref !== validator.validator_ref || validatorBinding.validator_digest !== validator.validator_digest) {
        holdCodes.add(C.VALIDATOR_BINDING_MISMATCH);
      }
      if (validatorEvidenceRefs.has(validatorBinding.validation_evidence_ref) || validatorEvidenceDigests.has(validatorBinding.validation_evidence_digest) ||
        executionReceiptRefs.has(validatorBinding.execution_receipt_ref) || executionReceiptDigests.has(validatorBinding.execution_receipt_digest)) {
        holdCodes.add(C.VALIDATOR_EVIDENCE_DUPLICATE);
      }
      validatorEvidenceRefs.add(validatorBinding.validation_evidence_ref);
      validatorEvidenceDigests.add(validatorBinding.validation_evidence_digest);
      executionReceiptRefs.add(validatorBinding.execution_receipt_ref);
      executionReceiptDigests.add(validatorBinding.execution_receipt_digest);
    }

    if (!isPlainObject(reviewer) || !hasExactKeys(reviewer, REVIEW_FIELDS) || !isValidId(reviewer.reviewer_ref) || !isValidId(reviewer.review_ref) ||
      !isValidSha256(reviewer.review_digest) || !["accept", "revise", "reject", "hold"].includes(reviewer.decision) || reviewer.is_independent !== true || timestampEpoch(reviewer.occurred_at) === null) {
      holdCodes.add(C.INDEPENDENT_REVIEW_INVALID);
    } else {
      reviewerValid = true;
      if (ACCEPTED_WORKER_SET.has(reviewer.reviewer_ref)) holdCodes.add(C.INDEPENDENT_REVIEW_INVALID);
      if (reviewer.decision !== "accept") holdCodes.add(C.INDEPENDENT_REVIEW_NOT_ACCEPTED);
      if (reviewRefs.has(reviewer.review_ref) || reviewDigests.has(reviewer.review_digest)) holdCodes.add(C.INDEPENDENT_REVIEW_DUPLICATE);
      reviewRefs.add(reviewer.review_ref);
      reviewDigests.add(reviewer.review_digest);
      considerTimestamp(reviewer.occurred_at);
    }

    if (!isPlainObject(reviewBinding) || !hasExactKeys(reviewBinding, REVIEW_BINDING_FIELDS) || !isValidId(reviewBinding.worker_id) ||
      !isValidId(reviewBinding.run_id) || !isValidId(reviewBinding.work_unit_id) || !isValidId(reviewBinding.review_ref) || !isValidSha256(reviewBinding.review_digest)) {
      holdCodes.add(C.REVIEW_BINDING_INVALID);
    } else {
      reviewBindingValid = true;
      if (reviewBinding.worker_id !== workerId || !workRunValid || reviewBinding.run_id !== workRun.run_id || reviewBinding.work_unit_id !== pin.work_unit_id ||
        !reviewerValid || reviewBinding.review_ref !== reviewer.review_ref || reviewBinding.review_digest !== reviewer.review_digest) {
        holdCodes.add(C.REVIEW_BINDING_MISMATCH);
      }
    }

    if (workRunMeasurable && validatorValid && qualityValid && reviewerValid) {
      const completedEpoch = timestampEpoch(workRun.completed_at);
      const validatorEpoch = timestampEpoch(validator.occurred_at);
      const qualityEpoch = timestampEpoch(qualityResult.occurred_at);
      const reviewerEpoch = timestampEpoch(reviewer.occurred_at);
      if (completedEpoch === null || validatorEpoch === null || qualityEpoch === null || reviewerEpoch === null ||
        completedEpoch > validatorEpoch || validatorEpoch > qualityEpoch || qualityEpoch > reviewerEpoch) holdCodes.add(C.CAUSAL_TIME_ORDER_INVALID);
    }

    if (!isPlainObject(metrics) || !hasExactKeys(metrics, METRIC_FIELDS) || !Number.isSafeInteger(metrics.elapsed_ms) || metrics.elapsed_ms < 0 ||
      !Number.isSafeInteger(metrics.correction_count) || metrics.correction_count < 0 || !isPlainObject(metrics.effect_counters) || !hasExactKeys(metrics.effect_counters, EFFECT_COUNTER_FIELDS)) {
      holdCodes.add(C.INVALID_INPUT_SHAPE);
    } else {
      metricsValid = true;
      if (Object.values(metrics.effect_counters).some((value) => value !== 0)) holdCodes.add(C.EFFECT_COUNTERS_NON_ZERO);
      if (metrics.correction_count === 0 && metrics.correction_evidence_ref !== null) holdCodes.add(C.CORRECTION_EVIDENCE_MISMATCH);
      if (metrics.correction_count > 0 && ((!isValidId(metrics.correction_evidence_ref) && !isValidSha256(metrics.correction_evidence_ref)) || !qualityValid || !qualityResult.evidence_refs.includes(metrics.correction_evidence_ref))) holdCodes.add(C.CORRECTION_EVIDENCE_MISMATCH);
      if (workRunMeasurable && timestampEpoch(workRun.completed_at) - timestampEpoch(workRun.started_at) !== metrics.elapsed_ms) holdCodes.add(C.ELAPSED_TIME_MISMATCH);
    }

    if (workRunValid && qualityValid && validatorValid && validatorBindingValid && reviewerValid && reviewBindingValid && metricsValid) {
      bases.push(comparisonBasis(workRun, qualityResult, validator));
      runBindings[`${workerId}/${workRun.run_id}`] = { ...runBinding };
      validatorBindings[`${workerId}/${workRun.run_id}`] = { ...validatorBinding };
      reviewBindings[`${workerId}/${workRun.run_id}`] = { ...reviewBinding };
      perWorkerMetrics[workerId] = { worker_id: workerId, model_id: workRun.model_id, run_id: workRun.run_id, elapsed_ms: metrics.elapsed_ms, correction_count: metrics.correction_count, quality_score: qualityResult.score, validator_decision: validator.decision, reviewer_decision: reviewer.decision, effect_counters_all_zero: true };
      speedEntries.push({ worker_id: workerId, value: metrics.elapsed_ms });
      correctionEntries.push({ worker_id: workerId, value: metrics.correction_count });
      qualityEntries.push({ worker_id: workerId, value: qualityResult.score });
    }
  }

  if (bases.length === ACCEPTED_WORKERS.length && !bases.every((basis) => sameJson(basis, bases[0]))) holdCodes.add(C.COMPARISON_BASIS_MISMATCH);
  if (holdCodes.size > 0) return hold(holdCodes);

  const speed = rankEntries(speedEntries, 1);
  const correction = rankEntries(correctionEntries, 1);
  const quality = rankEntries(qualityEntries, -1);
  const tieMarkers = { speed: speed.ties, correction: correction.ties, quality: quality.ties };
  const hasTie = Object.values(tieMarkers).some((ties) => ties.length > 0);
  const sameWinner = speed.rank[0] === correction.rank[0] && correction.rank[0] === quality.rank[0];
  const selection = hasTie || !sameWinner
    ? { outcome: "NO_SELECTION", winner: null, reason: hasTie ? "TIE_IN_COMPARISON_DIMENSION" : "EVIDENCE_COMPARISON_ONLY_NO_AUTHORITY", authority_granted: false, auto_deploy: false }
    : { outcome: "DOMINANT_EVALUATED_WORKER", winner: speed.rank[0], reason: "EVIDENCE_COMPARISON_ONLY_NO_AUTHORITY", authority_granted: false, auto_deploy: false };

  const body = {
    schema_version: WORKER_COMPARISON_RECEIPT_SCHEMA,
    comparison_id: packet.comparison_id,
    work_unit_pin: { ...pin },
    cohort_size: ACCEPTED_WORKERS.length,
    evaluated_at: latestTimestamp,
    run_bindings: runBindings,
    validator_bindings: validatorBindings,
    review_bindings: reviewBindings,
    comparison_basis: bases[0],
    per_worker_metrics: perWorkerMetrics,
    comparison_dimensions: { speed_rank: speed.rank, correction_rank: correction.rank, quality_rank: quality.rank, tie_markers: tieMarkers, validation_pass_all: true },
    selection,
  };
  const receipt = { receipt_id: createBodyId("rcpt_cmp_", body), ...body };
  return deepFreeze({ status: "COMPARED", receipt, hold_codes: [] });
}

// Pure, zero-write FFCA assessment. This module evaluates public-safe references only and
// refuses fields that would turn evidence readiness into a quality disposition, technical
// change approval, release, or case-closure decision.
import types from "node:util/types";

import { canonicalise, compareCodePoints } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { validateCanonicalInstant } from "../../../core/interfaces/domain_engine_adapter.mjs";
import {
  FFCA_APPLICABILITY_STATES,
  FFCA_ASSESSMENT_STATES,
  FFCA_CHANGE_STATES,
  FFCA_FORBIDDEN_AUTHORITY_FIELDS,
  FFCA_LINK_FIELDS,
  FFCA_OBSERVATION_STATES,
  isFfcaApplicabilityState,
  isFfcaCaseKind,
  isFfcaChangeState,
  isFfcaObservationState,
} from "../rules/field_failure_corrective_action_vocabulary.mjs";
import {
  FFCA_RULE_BY_ID,
  FFCA_RULES,
  FFCA_RULESET_REF,
  FFCA_RULESET_SCHEMA,
  FFCA_SOURCE_INVENTORY,
  FFCA_SOURCE_PACKET_REF,
} from "../rules/field_failure_corrective_action_rules.mjs";

export const FFCA_REQUEST_SCHEMA = "soulforge.field_failure_corrective_action.request.v0";
export const FFCA_DOMAIN_INPUT_SCHEMA = "soulforge.field_failure_corrective_action.domain_input.v0";
export const FFCA_ASSESSMENT_SCHEMA = "soulforge.field_failure_corrective_action.assessment.v0";
export const FFCA_RECEIPT_SCHEMA = "soulforge.field_failure_corrective_action.receipt.v0";

export const FFCA_EVALUATOR_ERROR_CODES = Object.freeze({
  BINDING_REFUSED: "FFCA_BINDING_REFUSED",
  FORBIDDEN_AUTHORITY_FIELD: "FFCA_FORBIDDEN_AUTHORITY_FIELD",
  INPUT_REFUSED: "FFCA_INPUT_REFUSED",
  RULESET_UNSUPPORTED: "FFCA_RULESET_UNSUPPORTED",
});

const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const FORBIDDEN_REF = /(?:password|bearer|api[_-]?key|secret|cookie|credential)/iu;
const FLOATING_REVISION = /(?:^|[-_.:/])(latest|current|head|main|master|develop|development|trunk|stable|production)(?:$|[-_.:/])|[*^~<>]/iu;
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SOURCE_IDS = FFCA_SOURCE_INVENTORY.map((source) => source.source_id);
const RULE_IDS = FFCA_RULES.map((rule) => rule.rule_id);

const EXECUTION_EFFECTS = Object.freeze({
  approval_writes: 0,
  erp_writes: 0,
  filesystem_writes: 0,
  model_calls: 0,
  network_calls: 0,
  task_writes: 0,
});

function fail(code, message, detail = {}) {
  throw new ContractError(code, message, detail);
}

function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function snapshotPlainData(value, field = "value", depth = 0, seen = new WeakSet()) {
  if (depth > 16) fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} exceeds maximum nesting depth`);
  if (value === null || value === undefined) fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} may not be null or undefined`);
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must be a safe integer when numeric`);
    return value;
  }
  if (typeof value !== "object" || (types && types.isProxy(value))) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must contain only ordinary data`);
  }
  if (seen.has(value)) fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must be an acyclic tree`);
  seen.add(value);

  const isArray = Array.isArray(value);
  const expectedPrototype = isArray ? Array.prototype : Object.prototype;
  if (Object.getPrototypeOf(value) !== expectedPrototype) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must use ordinary ${isArray ? "Array" : "Object"} prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} may not contain symbol keys`);
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (isArray && key === "length") continue;
    if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} may not contain accessors or hidden fields`);
    }
    if (!isArray && PROTOTYPE_SENSITIVE_KEYS.has(key)) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} contains prototype-sensitive key`);
    }
  }

  if (isArray) {
    const length = descriptors.length?.value;
    const indexes = keys.filter((key) => key !== "length");
    if (!Number.isSafeInteger(length) || length < 0 || indexes.length !== length
        || indexes.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must be a dense array without named properties`);
    }
    return Array.from({ length }, (_unused, index) => snapshotPlainData(descriptors[String(index)].value, `${field}[${index}]`, depth + 1, seen));
  }

  const copy = {};
  for (const key of keys) copy[key] = snapshotPlainData(descriptors[key].value, `${field}.${key}`, depth + 1, seen);
  return copy;
}

function assertExactKeys(value, required, optional, field, code = FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  const keys = Object.keys(value);
  if (keys.length !== required.length + optional.filter((key) => Object.hasOwn(value, key)).length
      || required.some((key) => !Object.hasOwn(value, key))
      || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    fail(code, `${field} must contain only its declared fields`);
  }
}

function assertRef(value, field, { revision = false } = {}) {
  if (typeof value !== "string" || !REF.test(value) || FORBIDDEN_REF.test(value)
      || /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value) || /^\/(?:etc|home|root|tmp|var)/u.test(value)) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must be a public-safe reference token`);
  }
  if (revision && FLOATING_REVISION.test(value)) {
    fail(FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED, `${field} must be a pinned revision reference`);
  }
  return value;
}

function assertSortedRefArray(value, field, { required = false, exactLength = null } = {}) {
  if (!Array.isArray(value) || value.length > 64 || (required && value.length === 0)
      || (exactLength !== null && value.length !== exactLength)) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must be a bounded${required ? " non-empty" : ""} array`);
  }
  const copy = value.map((item, index) => assertRef(item, `${field}[${index}]`));
  for (let index = 1; index < copy.length; index += 1) {
    if (compareCodePoints(copy[index - 1], copy[index]) >= 0) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${field} must be sorted and unique`);
    }
  }
  return copy;
}

function assertStaticRef(actual, expected, field) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    fail(FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED, `${field} must be an exact reference object`);
  }
  assertExactKeys(actual, ["content_hash_alg", "content_id", "entity_id", "revision_id"], [], field,
    FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
  if (actual.content_hash_alg !== expected.content_hash_alg || actual.content_id !== expected.content_id
      || actual.entity_id !== expected.entity_id || actual.revision_id !== expected.revision_id) {
    fail(FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED, `${field} does not match the FFCA candidate binding`);
  }
  return Object.freeze({ ...expected });
}

function assertLinks(links) {
  assertExactKeys(links, FFCA_LINK_FIELDS, [], "row.links");
  const copy = {};
  for (const field of FFCA_LINK_FIELDS) copy[field] = assertSortedRefArray(links[field], `row.links.${field}`, {
    required: field === "evidence_receipt_refs",
  });
  if (copy.affected_asset_refs.length === 0 && copy.affected_lot_refs.length === 0) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
      "row.links must preserve at least one affected lot or asset reference");
  }
  return Object.freeze(copy);
}

function assertEvidence(evidence, expectedKeys) {
  assertExactKeys(evidence, expectedKeys, [], "row.evidence");
  const copy = {};
  for (const key of expectedKeys) copy[key] = assertRef(evidence[key], `row.evidence.${key}`);
  return Object.freeze(copy);
}

function assertEmptyEvidence(evidence) {
  assertExactKeys(evidence, [], [], "row.evidence");
  return Object.freeze({});
}

function arrayOrderRules(value, path = "", rules = {}) {
  if (Array.isArray(value)) {
    rules[path] = "insertion_ordered";
    for (const child of value) arrayOrderRules(child, `${path}[]`, rules);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) arrayOrderRules(child, path ? `${path}.${key}` : key, rules);
  }
  return rules;
}

function digest(label, value) {
  return sha256Hex(`${label}\n${canonicalise(value, arrayOrderRules(value))}`);
}

function assertSourceBindings(sourceBindings) {
  if (!Array.isArray(sourceBindings) || sourceBindings.length !== SOURCE_IDS.length) {
    fail(FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED, "binding.source_bindings must exactly bind the FFCA source inventory");
  }
  const copy = [];
  for (let index = 0; index < sourceBindings.length; index += 1) {
    const row = sourceBindings[index];
    assertExactKeys(row, ["access_class", "applicability_binding_ref", "source_id", "source_revision_ref"], [],
      `binding.source_bindings[${index}]`, FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
    const expected = FFCA_SOURCE_INVENTORY[index];
    if (row.source_id !== expected.source_id || row.access_class !== expected.access_class) {
      fail(FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED, "source binding does not match the current FFCA public source inventory");
    }
    const sourceRevisionRef = assertRef(row.source_revision_ref, `binding.source_bindings[${index}].source_revision_ref`, { revision: true });
    const applicabilityBindingRef = assertRef(row.applicability_binding_ref,
      `binding.source_bindings[${index}].applicability_binding_ref`);
    if (index > 0 && compareCodePoints(sourceBindings[index - 1].source_id, row.source_id) >= 0) {
      fail(FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED, "source bindings must be ordered by source_id");
    }
    copy.push(Object.freeze({
      access_class: row.access_class,
      applicability_binding_ref: applicabilityBindingRef,
      source_id: row.source_id,
      source_revision_ref: sourceRevisionRef,
    }));
  }
  return Object.freeze(copy);
}

function validateBinding(binding) {
  assertExactKeys(binding, ["project_binding_ref", "ruleset_ref", "source_bindings", "source_packet_ref"], [], "binding",
    FFCA_EVALUATOR_ERROR_CODES.BINDING_REFUSED);
  return Object.freeze({
    project_binding_ref: assertRef(binding.project_binding_ref, "binding.project_binding_ref", { revision: true }),
    ruleset_ref: assertStaticRef(binding.ruleset_ref, FFCA_RULESET_REF, "binding.ruleset_ref"),
    source_bindings: assertSourceBindings(binding.source_bindings),
    source_packet_ref: assertStaticRef(binding.source_packet_ref, FFCA_SOURCE_PACKET_REF, "binding.source_packet_ref"),
  });
}

function validateRow(raw) {
  const rule = FFCA_RULE_BY_ID.get(raw.rule_id);
  if (!rule) fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "row.rule_id is not an FFCA base rule");

  const optional = ["conflict_claim_refs", "not_applicable_basis_ref"];
  if (rule.rule_id === "FFCA-CHANGE-01") optional.push("change_state");
  assertExactKeys(raw, ["applicability_state", "case_id", "case_kind", "evidence", "links", "observation_state", "row_id", "rule_id"],
    optional, "row");

  const rowId = assertRef(raw.row_id, "row.row_id");
  const caseId = assertRef(raw.case_id, "row.case_id");
  if (!isFfcaCaseKind(raw.case_kind)) fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "row.case_kind is invalid");
  if (!isFfcaApplicabilityState(raw.applicability_state)) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `row.applicability_state must be one of ${FFCA_APPLICABILITY_STATES.join(", ")}`);
  }
  if (!isFfcaObservationState(raw.observation_state)) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `row.observation_state must be one of ${FFCA_OBSERVATION_STATES.join(", ")}`);
  }
  const links = assertLinks(raw.links);
  let changeState = null;
  if (rule.rule_id === "FFCA-CHANGE-01") {
    if (!Object.hasOwn(raw, "change_state") || !isFfcaChangeState(raw.change_state)) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `row.change_state must be one of ${FFCA_CHANGE_STATES.join(", ")}`);
    }
    changeState = raw.change_state;
  }

  let notApplicableBasisRef = null;
  if (raw.applicability_state === "not_applicable") {
    if (raw.observation_state !== "unknown" || !Object.hasOwn(raw, "not_applicable_basis_ref")) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
        "not_applicable rows require an exact basis and unknown observation state");
    }
    notApplicableBasisRef = assertRef(raw.not_applicable_basis_ref, "row.not_applicable_basis_ref");
  } else if (Object.hasOwn(raw, "not_applicable_basis_ref")) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "not_applicable_basis_ref is only allowed for not_applicable rows");
  }

  let conflictClaimRefs = null;
  if (raw.observation_state === "conflict") {
    if (!Object.hasOwn(raw, "conflict_claim_refs")) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "conflict rows require exact claim references");
    }
    conflictClaimRefs = assertSortedRefArray(raw.conflict_claim_refs, "row.conflict_claim_refs", { exactLength: 2 });
  } else if (Object.hasOwn(raw, "conflict_claim_refs")) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "conflict_claim_refs are only allowed for conflict rows");
  }

  let expectedEvidenceKeys = [];
  if (raw.applicability_state === "applicable" && raw.observation_state === "present") {
    if (changeState === "required") expectedEvidenceKeys = rule.required_evidence_keys;
    else if (changeState === "not_required") expectedEvidenceKeys = rule.not_required_evidence_keys;
    else if (changeState === "unknown") expectedEvidenceKeys = [];
    else expectedEvidenceKeys = rule.required_evidence_keys;
  }
  const evidence = expectedEvidenceKeys.length > 0
    ? assertEvidence(raw.evidence, expectedEvidenceKeys)
    : assertEmptyEvidence(raw.evidence);

  if (raw.applicability_state !== "applicable" && raw.observation_state !== "unknown") {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "non-applicable or unknown-applicability rows must not assert evidence observation state");
  }
  if (raw.observation_state !== "present" && Object.keys(evidence).length !== 0) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "non-present observations may not carry sufficiency evidence");
  }

  const row = {
    applicability_state: raw.applicability_state,
    case_id: caseId,
    case_kind: raw.case_kind,
    evidence,
    links,
    observation_state: raw.observation_state,
    row_id: rowId,
    rule_id: rule.rule_id,
  };
  if (changeState !== null) row.change_state = changeState;
  if (conflictClaimRefs !== null) row.conflict_claim_refs = conflictClaimRefs;
  if (notApplicableBasisRef !== null) row.not_applicable_basis_ref = notApplicableBasisRef;
  return Object.freeze(row);
}

function validateDomainInput(domainInput) {
  assertExactKeys(domainInput, ["rows", "schema_version"], [], "domain_input");
  if (domainInput.schema_version !== FFCA_DOMAIN_INPUT_SCHEMA) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `domain_input.schema_version must be ${FFCA_DOMAIN_INPUT_SCHEMA}`);
  }
  if (!Array.isArray(domainInput.rows) || domainInput.rows.length === 0 || domainInput.rows.length > 256) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_input.rows must be a bounded non-empty array");
  }
  const rows = domainInput.rows.map(validateRow);
  const ids = new Set();
  const caseRules = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (ids.has(row.row_id) || (index > 0 && compareCodePoints(rows[index - 1].row_id, row.row_id) >= 0)) {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_input.rows must be sorted and unique by row_id");
    }
    ids.add(row.row_id);
    const caseRule = `${row.case_id}\u0000${row.rule_id}`;
    if (caseRules.has(caseRule)) fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "only one row per case_id and rule_id is allowed");
    caseRules.add(caseRule);
  }
  return Object.freeze({ schema_version: domainInput.schema_version, rows: Object.freeze(rows) });
}

function outcomeFor(row) {
  if (row.applicability_state === "not_applicable") return "not_applicable";
  if (row.applicability_state === "unknown") return "unknown";
  if (row.observation_state === "conflict") return "conflict";
  if (row.observation_state === "unknown") return "unknown";
  if (row.observation_state === "absent") return "missing";
  if (row.change_state === "unknown") return "unknown";
  return "satisfied";
}

function reasonFor(row, outcome) {
  if (outcome === "not_applicable") return "exact_not_applicable_basis_recorded";
  if (outcome === "unknown") return row.change_state === "unknown"
    ? "related_change_need_is_unresolved"
    : "applicability_or_observation_is_unresolved";
  if (outcome === "conflict") return "conflicting_evidence_requires_external_resolution";
  if (outcome === "missing") return "confirmed_absence_of_required_evidence";
  return "required_public_safe_references_are_present";
}

function projectRow(row) {
  const rule = FFCA_RULE_BY_ID.get(row.rule_id);
  const assessmentState = outcomeFor(row);
  const result = {
    assessment_state: assessmentState,
    case_id: row.case_id,
    case_kind: row.case_kind,
    evidence_refs: row.evidence,
    evidence_receipt_refs: row.links.evidence_receipt_refs,
    links: row.links,
    reason_code: reasonFor(row, assessmentState),
    row_id: row.row_id,
    rule_id: rule.rule_id,
    source_locator: rule.source_locator,
    source_refs: rule.source_refs,
  };
  if (row.change_state !== undefined) result.change_state = row.change_state;
  if (row.conflict_claim_refs !== undefined) result.conflict_claim_refs = row.conflict_claim_refs;
  if (row.not_applicable_basis_ref !== undefined) result.not_applicable_basis_ref = row.not_applicable_basis_ref;
  return Object.freeze(result);
}

function buildCaseSummaries(results) {
  const byCase = new Map();
  for (const result of results) {
    if (!byCase.has(result.case_id)) byCase.set(result.case_id, []);
    byCase.get(result.case_id).push(result);
  }
  return Object.freeze([...byCase.entries()].map(([caseId, rows]) => {
    const states = new Map(rows.map((row) => [row.rule_id, row.assessment_state]));
    const openRuleIds = RULE_IDS.filter((ruleId) => {
      const state = states.get(ruleId);
      return state !== "satisfied" && state !== "not_applicable";
    });
    const closureState = states.get("FFCA-CLOSURE-01");
    const closureReadiness = closureState === "satisfied" && openRuleIds.length === 0
      ? "ready_for_human_decision"
      : "not_ready";
    return Object.freeze({
      case_id: caseId,
      closure_readiness: closureReadiness,
      open_rule_ids: Object.freeze(openRuleIds),
      requires_human_closure_decision: true,
    });
  }).sort((left, right) => compareCodePoints(left.case_id, right.case_id)));
}

function validateRequest(request) {
  const clean = snapshotPlainData(request, "request");
  for (const forbidden of FFCA_FORBIDDEN_AUTHORITY_FIELDS) {
    if (Object.hasOwn(clean, forbidden)) {
      fail(FFCA_EVALUATOR_ERROR_CODES.FORBIDDEN_AUTHORITY_FIELD, `${forbidden} is outside FFCA authority`);
    }
  }
  assertExactKeys(clean, ["binding", "cutoffs", "domain_input", "schema_version"], [], "request");
  if (clean.schema_version !== FFCA_REQUEST_SCHEMA) {
    fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `request.schema_version must be ${FFCA_REQUEST_SCHEMA}`);
  }
  assertExactKeys(clean.cutoffs, ["known_at", "valid_at"], [], "cutoffs");
  const validateCutoff = (value, field) => {
    try {
      return validateCanonicalInstant(value, field);
    } catch {
      fail(FFCA_EVALUATOR_ERROR_CODES.INPUT_REFUSED, field + " must be a valid canonical UTC ISO-8601 instant");
    }
  };
  const cutoffs = Object.freeze({
    known_at: validateCutoff(clean.cutoffs.known_at, "cutoffs.known_at"),
    valid_at: validateCutoff(clean.cutoffs.valid_at, "cutoffs.valid_at"),
  });
  return Object.freeze({
    binding: validateBinding(clean.binding),
    cutoffs,
    domain_input: validateDomainInput(clean.domain_input),
    schema_version: clean.schema_version,
  });
}

export function assessFieldFailureCorrectiveAction(request) {
  const input = validateRequest(request);
  const results = Object.freeze(input.domain_input.rows.map(projectRow).sort((left, right) => {
    const byCase = compareCodePoints(left.case_id, right.case_id);
    return byCase !== 0 ? byCase : compareCodePoints(left.rule_id, right.rule_id);
  }));
  const counts = Object.fromEntries(FFCA_ASSESSMENT_STATES.map((state) => [state, 0]));
  for (const result of results) counts[result.assessment_state] += 1;
  const caseSummaries = buildCaseSummaries(results);
  const inputDigest = digest("soulforge.field_failure_corrective_action.input.v0", input);
  const resultMaterial = {
    authority_boundary: {
      closure_decision: "outside_engine",
      quality_disposition: "outside_engine",
      technical_change_approval: "outside_engine",
    },
    case_summaries: caseSummaries,
    counts,
    results,
    ruleset_ref: FFCA_RULESET_REF,
    source_packet_ref: FFCA_SOURCE_PACKET_REF,
  };
  const resultDigest = digest("soulforge.field_failure_corrective_action.result.v0", resultMaterial);
  return freezeDeep({
    authority_boundary: resultMaterial.authority_boundary,
    case_summaries: caseSummaries,
    claim_ceiling: "source_supported",
    counts: Object.freeze(counts),
    domain_engine_id: "field_failure_corrective_action",
    execution_effects: { ...EXECUTION_EFFECTS },
    input_digest: inputDigest,
    results,
    ruleset_ref: FFCA_RULESET_REF,
    schema_version: FFCA_ASSESSMENT_SCHEMA,
    source_packet_ref: FFCA_SOURCE_PACKET_REF,
    receipt: {
      execution_effects: { ...EXECUTION_EFFECTS },
      input_digest: inputDigest,
      result_digest: resultDigest,
      schema_version: FFCA_RECEIPT_SCHEMA,
    },
  });
}

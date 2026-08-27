// Deterministic, read-only manufacturing build-start evidence assessment.
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import {
  MANUFACTURING_READINESS_RULES,
  MANUFACTURING_READINESS_RULESET_REF,
  MANUFACTURING_READINESS_SOURCE_INVENTORY_REF,
  MANUFACTURING_READINESS_SOURCE_PACKET_REF,
} from '../rules/manufacturing_readiness_rules.mjs';
import {
  compareCanonicalUtcInstants,
  deepFreezePublicData,
  parseCanonicalUtcInstant,
  snapshotPublicData,
} from '../validators/manufacturing_readiness_input_admission.mjs';

export const MANUFACTURING_READINESS_DOMAIN_INPUT_SCHEMA =
  'soulforge.manufacturing_readiness.domain_input.v0';
export const MANUFACTURING_READINESS_ASSESSMENT_SCHEMA =
  'soulforge.manufacturing_readiness.assessment.v0';
export const MANUFACTURING_READINESS_DOMAIN_RESULT_SCHEMA =
  'soulforge.manufacturing_readiness.domain_result.v0';
export const MANUFACTURING_READINESS_RECEIPT_SCHEMA =
  'soulforge.manufacturing_readiness.receipt.v0';

export const MR_EVALUATOR_ERROR_CODES = Object.freeze({
  INPUT_REFUSED: 'MANUFACTURING_READINESS_INPUT_REFUSED',
  FACET_UNKNOWN: 'MANUFACTURING_READINESS_FACET_UNKNOWN',
  FACET_DUPLICATE: 'MANUFACTURING_READINESS_FACET_DUPLICATE',
  FACET_INCOMPLETE: 'MANUFACTURING_READINESS_FACET_INCOMPLETE',
});

const FACET_BY_ID = new Map(MANUFACTURING_READINESS_RULES.map((entry) => [entry.facet_id, entry]));
const REQUIRED_FIELDS = Object.freeze([
  'facet_id',
  'applicability',
  'evidence_state',
  'evaluation_state',
]);
const OPTIONAL_FIELDS = Object.freeze(['not_applicable_basis_ref']);
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/u;
const PROJECT_BINDING_REQUIRED_FIELDS = Object.freeze([
  'schema_version',
  'project_id',
  'domain_engine_id',
  'binding_revision_hash',
  'source_manifest_ref',
]);
const PROJECT_BINDING_OPTIONAL_FIELDS = Object.freeze([
  'authority_family',
  'valid_at',
  'known_at',
  'document_refs',
]);
const EFFECTS = Object.freeze({
  filesystem: 0,
  network: 0,
  model: 0,
  rag: 0,
  wiki: 0,
  erp: 0,
  task: 0,
  approval: 0,
});
const FORBIDDEN_KEYS = new Set([
  'raw', 'raw_text', 'source_body', 'source_text', 'project_payload', 'payload',
  'transcript', 'raw_transcript', 'hidden_reasoning', 'prompt', 'completion',
  'private_path', 'absolute_path', 'secret', 'credential', 'password', 'cookie',
]);
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /(?:^|[^A-Za-z0-9_])_workspaces(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])_workmeta(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9_])private-state(?:[\\/]|$)/iu,
  /(?:^|[^A-Za-z0-9])[a-z]:[\\/]/iu,
  /\\\\[^\\]+\\/u,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]/iu,
]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function snapshot(value) {
  return snapshotPublicData(value, {
    code: MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
    label: 'manufacturing readiness input',
    maxDepth: 12,
    maxArrayLength: 32,
    maxStringLength: 512,
    forbiddenKeys: FORBIDDEN_KEYS,
    validateString: (entry) => !FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(entry)),
  });
}

function assertAllowedKeys(value, required, optional, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !required.every((key) => Object.hasOwn(value, key))
      || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) {
    fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${label} has missing or unsupported fields`);
  }
}

function validateFacet(row) {
  assertAllowedKeys(row, REQUIRED_FIELDS, OPTIONAL_FIELDS, 'facet');
  if (!FACET_BY_ID.has(row.facet_id)) {
    fail(MR_EVALUATOR_ERROR_CODES.FACET_UNKNOWN, `unknown manufacturing facet "${row.facet_id}"`);
  }
  if (!['applicable', 'not_applicable', 'unknown'].includes(row.applicability)
      || !['present', 'absence_confirmed', 'unknown'].includes(row.evidence_state)
      || !['criteria_met', 'criteria_not_met', 'unknown'].includes(row.evaluation_state)) {
    fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'facet state is outside the closed vocabulary');
  }
  if (row.applicability === 'not_applicable') {
    if (typeof row.not_applicable_basis_ref !== 'string' || !OPAQUE_REF.test(row.not_applicable_basis_ref)) {
      fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'not-applicable facets require a bounded basis reference');
    }
  } else if (Object.hasOwn(row, 'not_applicable_basis_ref')) {
    fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'not-applicable basis references are not valid for applicable or unknown facets');
  }
  return row;
}

function validateProjectBindingRef(projectBindingRef) {
  assertAllowedKeys(
    projectBindingRef,
    PROJECT_BINDING_REQUIRED_FIELDS,
    PROJECT_BINDING_OPTIONAL_FIELDS,
    'project_binding_ref',
  );
  if (projectBindingRef.schema_version !== 'soulforge.project_binding.v0'
      || projectBindingRef.domain_engine_id !== 'manufacturing_readiness') {
    fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'project_binding_ref domain must match manufacturing_readiness');
  }
  for (const field of ['project_id', 'domain_engine_id', 'binding_revision_hash', 'source_manifest_ref']) {
    if (typeof projectBindingRef[field] !== 'string' || projectBindingRef[field].length === 0) {
      fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `project_binding_ref.${field} must be a non-empty public-safe string`);
    }
  }
  if (Object.hasOwn(projectBindingRef, 'authority_family')
      && (typeof projectBindingRef.authority_family !== 'string' || projectBindingRef.authority_family.length === 0)) {
    fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'project_binding_ref.authority_family must be a non-empty public-safe string');
  }
  const validAt = Object.hasOwn(projectBindingRef, 'valid_at')
    ? parseCanonicalUtcInstant(projectBindingRef.valid_at)
    : null;
  const knownAt = Object.hasOwn(projectBindingRef, 'known_at')
    ? parseCanonicalUtcInstant(projectBindingRef.known_at)
    : null;
  if ((Object.hasOwn(projectBindingRef, 'valid_at') && !validAt)
      || (Object.hasOwn(projectBindingRef, 'known_at') && !knownAt)
      || (validAt && knownAt && compareCanonicalUtcInstants(knownAt, validAt) < 0)) {
    fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'project_binding_ref has an invalid temporal pin');
  }
  if (Object.hasOwn(projectBindingRef, 'document_refs')) {
    if (!Array.isArray(projectBindingRef.document_refs)
        || projectBindingRef.document_refs.some((ref) => typeof ref !== 'string' || ref.length === 0)) {
      fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'project_binding_ref.document_refs must be non-empty public-safe strings');
    }
  }
  return projectBindingRef;
}

function evaluateFacet(row) {
  const rule = FACET_BY_ID.get(row.facet_id);
  const base = {
    rule_id: rule.rule_id,
    facet_id: row.facet_id,
    source_refs: [...rule.source_refs],
    source_locators: [...rule.source_locators],
    applicability: row.applicability,
    evidence_state: row.evidence_state,
    evaluation_state: row.evaluation_state,
    canon_claim_ceiling: 'source_supported',
  };
  if (row.applicability === 'not_applicable') {
    return {
      ...base,
      not_applicable_basis_ref: row.not_applicable_basis_ref,
      state: 'not_applicable',
      reason_code: 'not_applicable',
    };
  }
  if (row.applicability === 'unknown') return { ...base, state: 'gap_unknown', reason_code: 'applicability_unknown' };
  if (row.evidence_state === 'unknown') return { ...base, state: 'gap_unknown', reason_code: 'evidence_unknown' };
  if (row.evidence_state === 'absence_confirmed') return { ...base, state: 'gap_missing', reason_code: 'evidence_absence_confirmed' };
  if (row.evaluation_state === 'unknown') return { ...base, state: 'gap_unknown', reason_code: 'evaluation_unknown' };
  if (row.evaluation_state === 'criteria_not_met') return { ...base, state: 'gap_conflict', reason_code: 'criteria_not_met' };
  return { ...base, state: 'satisfied', reason_code: 'evidence_sufficient' };
}

function countsFor(results) {
  const counts = { satisfied: 0, gap_missing: 0, gap_unknown: 0, gap_conflict: 0, not_applicable: 0, total: results.length };
  for (const result of results) counts[result.state] += 1;
  return counts;
}

function overallState(counts) {
  if (counts.gap_missing || counts.gap_unknown || counts.gap_conflict) return 'hold';
  if (counts.not_applicable === counts.total) return 'not_applicable';
  return 'build_start_evidence_ready_for_owner_review';
}

function digest(namespace, value) {
  return sha256Hex(`${namespace}\n${canonicalise(value, {
    facets: 'insertion_ordered',
    'project_binding_ref.document_refs': 'insertion_ordered',
    results: 'insertion_ordered',
    'results[].source_refs': 'insertion_ordered',
    'results[].source_locators': 'insertion_ordered',
  })}`);
}

/**
 * Evaluates only the supplied evidence states for the eight closed facets.
 * It cannot issue a build-start authorization or perform any external effect.
 */
export function assessManufacturingReadiness(request) {
  const input = snapshot(request);
  assertAllowedKeys(input, ['schema_version', 'project_binding_ref', 'facets'], [], 'request');
  if (input.schema_version !== MANUFACTURING_READINESS_DOMAIN_INPUT_SCHEMA || !Array.isArray(input.facets)) {
    fail(MR_EVALUATOR_ERROR_CODES.INPUT_REFUSED, 'request schema_version or facets is invalid');
  }
  validateProjectBindingRef(input.project_binding_ref);
  const seen = new Set();
  for (const row of input.facets) {
    validateFacet(row);
    if (seen.has(row.facet_id)) fail(MR_EVALUATOR_ERROR_CODES.FACET_DUPLICATE, `duplicate facet "${row.facet_id}"`);
    seen.add(row.facet_id);
  }
  if (seen.size !== MANUFACTURING_READINESS_RULES.length
      || MANUFACTURING_READINESS_RULES.some((rule) => !seen.has(rule.facet_id))) {
    fail(MR_EVALUATOR_ERROR_CODES.FACET_INCOMPLETE, 'every closed manufacturing facet must be supplied exactly once');
  }

  const canonicalInput = {
    schema_version: input.schema_version,
    facets: [...input.facets].sort((left, right) => (
      compareCodePoints(FACET_BY_ID.get(left.facet_id).rule_id, FACET_BY_ID.get(right.facet_id).rule_id)
    )),
  };
  canonicalInput.project_binding_ref = { ...input.project_binding_ref };
  const results = canonicalInput.facets.map(evaluateFacet);
  const counts = countsFor(results);
  const domain_result = {
    schema_version: MANUFACTURING_READINESS_DOMAIN_RESULT_SCHEMA,
    canon_claim_ceiling: 'source_supported',
    results,
    counts,
  };
  const assessment = {
    schema_version: MANUFACTURING_READINESS_ASSESSMENT_SCHEMA,
    assessment_kind: 'manufacturing_build_start_evidence_readiness',
    canon_claim_ceiling: 'source_supported',
    overall_state: overallState(counts),
    result_counts: { ...counts },
    decision_boundary: 'human_owner_review_required',
  };
  const receipt = {
    schema_version: MANUFACTURING_READINESS_RECEIPT_SCHEMA,
    digests: {
      input_sha256: digest('soulforge.manufacturing_readiness.input.v0', canonicalInput),
      assessment_sha256: digest('soulforge.manufacturing_readiness.assessment.v0', assessment),
      domain_result_sha256: digest('soulforge.manufacturing_readiness.domain_result.v0', domain_result),
    },
    bindings: {
      ruleset_ref: { ...MANUFACTURING_READINESS_RULESET_REF },
      source_packet_ref: { ...MANUFACTURING_READINESS_SOURCE_PACKET_REF },
      source_inventory_ref: { ...MANUFACTURING_READINESS_SOURCE_INVENTORY_REF },
      execution_mode: 'deterministic_only',
    },
    counts: { ...counts },
    effects: { ...EFFECTS },
  };
  receipt.bindings.project_binding_ref = { ...canonicalInput.project_binding_ref };
  return deepFreezePublicData({ assessment, domain_result, receipt });
}

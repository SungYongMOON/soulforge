// Owner-review guidance only. This projection turns deterministic E01 states into bounded next
// actions without accepting, releasing, waiving, or declaring compliance for any product.
import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { assertCanonCeiling } from '../../../core/validators/ceilings.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

export const QUALITY_READINESS_GUIDANCE_SCHEMA = 'soulforge.quality_readiness.guidance.v0';
export const QUALITY_READINESS_GUIDANCE_CODES = Object.freeze({
  INVALID: 'QUALITY_READINESS_GUIDANCE_INVALID',
  BOUNDARY: 'QUALITY_READINESS_GUIDANCE_BOUNDARY',
});

const INPUT_KEYS = Object.freeze(['assessment_run', 'observation_projection']);
const FORBIDDEN_FIELDS = new Set([
  'acceptance', 'release', 'waiver', 'disposition', 'compliance', 'task_create',
  'raw', 'source_body', 'project_payload', 'secret', 'credential',
]);
const ACTION_BY_STATE = Object.freeze({
  satisfied: 'retain_exact_evidence_for_owner_review',
  gap_missing: 'obtain_or_confirm_the_named_evidence',
  gap_unknown: 'resolve_the_missing_binding_or_observation',
  gap_conflict: 'preserve_all_sides_and_seek_authorized_resolution',
  not_applicable: 'retain_the_exact_not_applicable_basis',
});

function fail(code, message) {
  throw new ContractError(code, message);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} must be an object`);
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} has an unexpected key set`);
  }
}

function assertNoAuthorityFields(value, label, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key)) fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, `${label}.${key} is outside guidance authority`);
    assertNoAuthorityFields(child, `${label}.${key}`, seen);
  }
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function buildQualityReadinessGuidance(input) {
  exactKeys(input, INPUT_KEYS, 'guidance input');
  const assessment = input.assessment_run;
  assertNoAuthorityFields(assessment, 'assessment_run');
  if (!assessment || typeof assessment !== 'object' || !assessment.assessment || !assessment.domain_result || !assessment.receipt
      || assessment.assessment.assessment_kind !== 'quality_evidence_readiness'
      || !Array.isArray(assessment.domain_result.results)) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, 'guidance requires an E01 deterministic assessment result');
  }
  const observation = input.observation_projection;
  if (!observation || typeof observation !== 'object' || !observation.counts || !observation.receipt) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, 'guidance requires the paired observation projection');
  }
  const assessmentSha = assessment.receipt?.digests?.assessment_sha256;
  const assessmentFactsSha = assessment.receipt?.bindings?.typed_facts_sha256;
  if (typeof assessmentSha !== 'string' || typeof assessmentFactsSha !== 'string'
      || observation.receipt.assessment_sha256 !== assessmentSha
      || observation.receipt.typed_facts_sha256 !== assessmentFactsSha) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'observation projection is stale or not bound to this exact assessment receipt');
  }
  let canonClaimCeiling;
  try {
    canonClaimCeiling = assertCanonCeiling(assessment.assessment.canon_claim_ceiling);
    const domainCanonClaimCeiling = assertCanonCeiling(assessment.domain_result.canon_claim_ceiling);
    if (canonClaimCeiling !== domainCanonClaimCeiling
        || !['observed', 'source_supported'].includes(canonClaimCeiling)) {
      fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'assessment canon ceiling is mismatched or exceeds the E01 guidance boundary');
    }
  } catch (error) {
    if (error instanceof ContractError && error.code === QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY) throw error;
    fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'assessment canon ceiling is malformed or outside the E01 guidance boundary');
  }
  const cards = assessment.domain_result.results.map((result) => {
    const next_action = ACTION_BY_STATE[result.state];
    if (!next_action || typeof result.rule_id !== 'string' || typeof result.case_id !== 'string') {
      fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, 'assessment result has an unsupported state or missing bounded identity');
    }
    return {
      guide_id: `qr_guide_${sha256Hex(`${result.rule_id}\u001f${result.case_id}\u001f${result.state}`).slice(0, 24)}`,
      rule_id: result.rule_id,
      case_id: result.case_id,
      observed_state: result.state,
      next_action,
      owner_review_required: true,
      verdict_authority: false,
    };
  }).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id)
    || compareCodePoints(left.case_id, right.case_id));
  const guidance = {
    schema_version: QUALITY_READINESS_GUIDANCE_SCHEMA,
    guidance_kind: 'owner_review_only',
    claim_ceiling: canonClaimCeiling,
    verdict_authority: false,
    cards,
    receipt: {
      assessment_sha256: assessment.receipt.digests.assessment_sha256,
      observation_sha256: observation.receipt.observations_sha256,
      typed_facts_sha256: assessmentFactsSha,
      guidance_sha256: '',
      effects: {
        filesystem_reads: 0,
        filesystem_writes: 0,
        network_calls: 0,
        model_calls: 0,
        rag_calls: 0,
      },
    },
  };
  guidance.receipt.guidance_sha256 = sha256Hex(
    `soulforge.quality_readiness.guidance.v0\n${canonicalise({
      claim_ceiling: guidance.claim_ceiling,
      cards: guidance.cards,
      assessment_sha256: guidance.receipt.assessment_sha256,
      observation_sha256: guidance.receipt.observation_sha256,
      typed_facts_sha256: guidance.receipt.typed_facts_sha256,
    }, { cards: 'insertion_ordered' })}`,
  );
  return freezeDeep(guidance);
}

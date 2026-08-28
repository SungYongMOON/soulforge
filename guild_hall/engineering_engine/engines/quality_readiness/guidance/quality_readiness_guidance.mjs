// Owner-review guidance only. This projection turns deterministic E01 states into bounded next
// actions without accepting, releasing, waiving, or declaring compliance for any product.
import types from 'node:util/types';

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { assertCanonCeiling } from '../../../core/validators/ceilings.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { verifyQualityReadinessAssessmentResult } from '../evaluator/quality_readiness_evaluator_adapter.mjs';
import { verifyQualityReadinessObservationProjection } from '../observation/quality_readiness_observation.mjs';

export const QUALITY_READINESS_GUIDANCE_SCHEMA = 'soulforge.quality_readiness.guidance.v0';
export const QUALITY_READINESS_GUIDANCE_CODES = Object.freeze({
  INVALID: 'QUALITY_READINESS_GUIDANCE_INVALID',
  BOUNDARY: 'QUALITY_READINESS_GUIDANCE_BOUNDARY',
});

const INPUT_KEYS = Object.freeze(['effective_rule_set', 'typed_facts', 'assessment_run', 'observation_projection']);
const OUTPUT_KEYS = Object.freeze(['schema_version', 'guidance_kind', 'claim_ceiling', 'verdict_authority', 'cards', 'receipt']);
const RECEIPT_KEYS = Object.freeze(['assessment_sha256', 'observation_sha256', 'typed_facts_sha256', 'guidance_sha256', 'effects']);
const CARD_KEYS = Object.freeze(['guide_id', 'rule_id', 'case_id', 'observed_state', 'next_action', 'owner_review_required', 'verdict_authority']);
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
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

function snapshotData(value, label, depth = 0, seen = new WeakSet(), {
  allowCoreProvenanceMap = false,
  allowFrozenCoreTraceAliases = false,
} = {}) {
  if (depth > 16) fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} exceeds the public data depth limit`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} must use finite canonical JSON numbers`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} must be ordinary JSON-like data`);
  }
  const frozenCoreTraceAlias = allowFrozenCoreTraceAliases
    && label.includes('.effective_rule_set.compilation_trace.') && Object.isFrozen(value);
  if (seen.has(value) && !frozenCoreTraceAlias) fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} may not be circular or shared`);
  seen.add(value);
  const array = Array.isArray(value);
  const nullCoreProvenanceMap = allowCoreProvenanceMap && !array
    && label.endsWith('.effective_rule_set.profile_rule_provenance')
    && Object.getPrototypeOf(value) === null;
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) && !nullCoreProvenanceMap) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} has an unsupported prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (array) {
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1
        || keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
      fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} must be a dense standard array`);
    }
    const output = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label}[${index}] may not be accessor-backed`);
      }
      output.push(snapshotData(descriptor.value, `${label}[${index}]`, depth + 1, seen, {
        allowCoreProvenanceMap,
        allowFrozenCoreTraceAliases,
      }));
    }
    return output;
  }
  const output = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || PROTOTYPE_SENSITIVE_KEYS.has(key)
        || !descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail(QUALITY_READINESS_GUIDANCE_CODES.INVALID, `${label} may not carry symbols, prototype keys, accessors, or hidden fields`);
    }
    Object.defineProperty(output, key, {
      value: snapshotData(descriptor.value, `${label}.${key}`, depth + 1, seen, {
        allowCoreProvenanceMap,
        allowFrozenCoreTraceAliases,
      }),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return output;
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

function guidanceDigest(guidance) {
  return sha256Hex(
    `soulforge.quality_readiness.guidance.v0\n${canonicalise({
      claim_ceiling: guidance.claim_ceiling,
      cards: guidance.cards,
      assessment_sha256: guidance.receipt.assessment_sha256,
      observation_sha256: guidance.receipt.observation_sha256,
      typed_facts_sha256: guidance.receipt.typed_facts_sha256,
    }, { cards: 'insertion_ordered' })}`,
  );
}

function zeroEffects(value) {
  return value && value.filesystem_reads === 0 && value.filesystem_writes === 0
    && value.network_calls === 0 && value.model_calls === 0 && value.rag_calls === 0
    && Object.keys(value).length === 5;
}

/** Validates the complete guidance receipt before it crosses the local MCP read boundary. */
export function verifyQualityReadinessGuidance(guidance) {
  const copied = snapshotData(guidance, 'guidance');
  assertNoAuthorityFields(copied, 'guidance');
  exactKeys(copied, OUTPUT_KEYS, 'guidance');
  exactKeys(copied.receipt, RECEIPT_KEYS, 'guidance receipt');
  if (copied.schema_version !== QUALITY_READINESS_GUIDANCE_SCHEMA
      || copied.guidance_kind !== 'owner_review_only'
      || copied.verdict_authority !== false
      || !['observed', 'source_supported'].includes(copied.claim_ceiling)
      || !Array.isArray(copied.cards)
      || !/^[a-f0-9]{64}$/u.test(copied.receipt.assessment_sha256)
      || !/^[a-f0-9]{64}$/u.test(copied.receipt.observation_sha256)
      || !/^[a-f0-9]{64}$/u.test(copied.receipt.typed_facts_sha256)
      || !/^[a-f0-9]{64}$/u.test(copied.receipt.guidance_sha256)
      || !zeroEffects(copied.receipt.effects)) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'guidance is malformed or crosses its zero-write owner-review boundary');
  }
  for (const card of copied.cards) {
    exactKeys(card, CARD_KEYS, 'guidance card');
    if (typeof card.rule_id !== 'string' || typeof card.case_id !== 'string'
        || !Object.hasOwn(ACTION_BY_STATE, card.observed_state)
        || card.next_action !== ACTION_BY_STATE[card.observed_state]
        || card.owner_review_required !== true || card.verdict_authority !== false
        || card.guide_id !== `qr_guide_${sha256Hex(`${card.rule_id}\u001f${card.case_id}\u001f${card.observed_state}`).slice(0, 24)}`) {
      fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'guidance card is not an exact allowlisted owner-review projection');
    }
  }
  if (copied.receipt.guidance_sha256 !== guidanceDigest(copied)) {
    fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'guidance receipt digest is forged or stale');
  }
  return freezeDeep(copied);
}

export function buildQualityReadinessGuidance(input) {
  const admitted = snapshotData(input, 'guidance input', 0, new WeakSet(), {
    allowCoreProvenanceMap: true,
    allowFrozenCoreTraceAliases: true,
  });
  exactKeys(admitted, INPUT_KEYS, 'guidance input');
  let assessment;
  try {
    assessment = verifyQualityReadinessAssessmentResult(admitted.assessment_run, {
      effective_rule_set: admitted.effective_rule_set,
      typed_facts: admitted.typed_facts,
    });
  } catch {
    fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'guidance requires one exact canonical assessment envelope');
  }
  assertNoAuthorityFields(assessment, 'assessment_run');
  let observation;
  try {
    observation = verifyQualityReadinessObservationProjection(admitted.observation_projection);
  } catch {
    fail(QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY, 'guidance requires one exact canonical observation projection');
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
  guidance.receipt.guidance_sha256 = guidanceDigest(guidance);
  return freezeDeep(guidance);
}

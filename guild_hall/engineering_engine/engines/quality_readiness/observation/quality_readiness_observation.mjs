// Domain-local observation projection. It reads no files: callers supply already-bound Typed
// Facts, and this seam only reports whether those explicit observations are usable or unavailable.
import types from 'node:util/types';

import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { isWellFormedRef } from '../../../core/validators/identity.mjs';
import { requestFromQualityReadinessTypedFacts } from '../binding/quality_readiness_typed_facts.mjs';
import { verifyQualityReadinessAssessmentResult } from '../evaluator/quality_readiness_evaluator_adapter.mjs';

export const QUALITY_READINESS_OBSERVATION_SCHEMA = 'soulforge.quality_readiness.observation_projection.v0';
export const QUALITY_READINESS_OBSERVATION_CODES = Object.freeze({
  INVALID: 'QUALITY_READINESS_OBSERVATION_INVALID',
  BOUNDARY: 'QUALITY_READINESS_OBSERVATION_BOUNDARY',
});

const INPUT_KEYS = Object.freeze(['effective_rule_set', 'typed_facts', 'assessment_run', 'observation_run_ref', 'known_at']);
const REF_KEYS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const OUTPUT_KEYS = Object.freeze(['schema_version', 'observation_kind', 'observation_run_ref', 'known_at', 'observations', 'counts', 'receipt']);
const RECEIPT_KEYS = Object.freeze(['typed_facts_sha256', 'assessment_sha256', 'observations_sha256', 'effects']);
const COUNT_KEYS = Object.freeze(['total', 'observed_present', 'observed_absence_confirmed', 'observation_unavailable']);
const SHA256_ID = /^sha256:[a-f0-9]{64}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const PROTOTYPE_SENSITIVE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function fail(code, message) {
  throw new ContractError(code, message);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} must be an object`);
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || !actual.every((key, index) => key === expected[index])) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} has an unexpected key set`);
  }
}

function snapshotData(value, label, depth = 0, seen = new WeakSet(), {
  allowCoreProvenanceMap = false,
  allowFrozenCoreTraceAliases = false,
} = {}) {
  if (depth > 16) fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} exceeds the public data depth limit`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} must use finite canonical JSON numbers`);
    }
    return value;
  }
  if (!value || typeof value !== 'object' || (types && types.isProxy(value))) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} must be ordinary JSON-like data`);
  }
  const frozenCoreTraceAlias = allowFrozenCoreTraceAliases
    && label.includes('.effective_rule_set.compilation_trace.') && Object.isFrozen(value);
  if (seen.has(value) && !frozenCoreTraceAlias) fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} may not be circular or shared`);
  seen.add(value);
  const array = Array.isArray(value);
  const nullCoreProvenanceMap = allowCoreProvenanceMap && !array
    && label.endsWith('.effective_rule_set.profile_rule_provenance')
    && Object.getPrototypeOf(value) === null;
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) && !nullCoreProvenanceMap) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} has an unsupported prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (array) {
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1
        || keys.some((key) => typeof key === 'symbol' || (key !== 'length' && !/^(0|[1-9]\d*)$/u.test(key)))) {
      fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} must be a dense standard array`);
    }
    const output = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label}[${index}] may not be accessor-backed`);
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
      fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} may not carry symbols, prototype keys, accessors, or hidden fields`);
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

function assertExactRef(ref, label) {
  exactKeys(ref, REF_KEYS, label);
  if (!isWellFormedRef(ref) || !SHA256_ID.test(ref.content_id) || ref.content_hash_alg !== 'sha256') {
    fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, `${label} must be an exact sha256 ref`);
  }
}

function digest(value) {
  return sha256Hex(`soulforge.quality_readiness.observation_projection.v0\n${canonicalise(value, {
    observations: 'insertion_ordered',
  })}`);
}

function cloneRef(ref) {
  return {
    entity_id: ref.entity_id,
    revision_id: ref.revision_id,
    content_id: ref.content_id,
    content_hash_alg: ref.content_hash_alg,
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function zeroEffects(value) {
  return value && value.filesystem_reads === 0 && value.filesystem_writes === 0
    && value.network_calls === 0 && value.model_calls === 0 && value.rag_calls === 0
    && Object.keys(value).length === 5;
}

/** Recomputes the projection receipt before another local QR seam consumes it. */
export function verifyQualityReadinessObservationProjection(projection) {
  const copied = snapshotData(projection, 'observation projection');
  exactKeys(copied, OUTPUT_KEYS, 'observation projection');
  exactKeys(copied.receipt, RECEIPT_KEYS, 'observation projection receipt');
  exactKeys(copied.counts, COUNT_KEYS, 'observation projection counts');
  if (copied.schema_version !== QUALITY_READINESS_OBSERVATION_SCHEMA
      || copied.observation_kind !== 'typed_facts_projection_only'
      || !inspectInstant(copied.known_at).valid
      || !Array.isArray(copied.observations)
      || !SHA256_HEX.test(copied.receipt.typed_facts_sha256)
      || !SHA256_HEX.test(copied.receipt.assessment_sha256)
      || !SHA256_HEX.test(copied.receipt.observations_sha256)
      || !zeroEffects(copied.receipt.effects)) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation projection is malformed or is not zero-write');
  }
  assertExactRef(copied.observation_run_ref, 'observation projection observation_run_ref');
  for (const row of copied.observations) {
    const allowed = ['observation_id', 'rule_id', 'case_id', 'observation_state', 'presence_state', 'observation_attempted'];
    if (row?.observation_attempt_ref !== undefined) allowed.push('observation_attempt_ref');
    exactKeys(row, allowed, 'observation projection row');
    if (typeof row.observation_id !== 'string' || typeof row.rule_id !== 'string' || typeof row.case_id !== 'string'
        || !['observed_present', 'observed_absence_confirmed', 'observation_unavailable'].includes(row.observation_state)
        || typeof row.observation_attempted !== 'boolean') {
      fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation projection row is malformed');
    }
    if (row.observation_attempted) assertExactRef(row.observation_attempt_ref, 'observation projection row attempt ref');
    const expectedId = `qr_obs_${sha256Hex(`${row.rule_id}\u001f${row.case_id}\u001f${copied.known_at}`).slice(0, 24)}`;
    if (row.observation_id !== expectedId) {
      fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation projection row identity is not bound to its known_at pin');
    }
  }
  const counts = {
    total: copied.observations.length,
    observed_present: copied.observations.filter((row) => row.observation_state === 'observed_present').length,
    observed_absence_confirmed: copied.observations.filter((row) => row.observation_state === 'observed_absence_confirmed').length,
    observation_unavailable: copied.observations.filter((row) => row.observation_state === 'observation_unavailable').length,
  };
  if (digest({ counts: copied.counts }) !== digest({ counts })) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation projection counts do not match the retained rows');
  }
  const expectedDigest = digest({
    observation_run_ref: copied.observation_run_ref,
    known_at: copied.known_at,
    observations: copied.observations,
    counts: copied.counts,
    typed_facts_sha256: copied.receipt.typed_facts_sha256,
    assessment_sha256: copied.receipt.assessment_sha256,
  });
  if (copied.receipt.observations_sha256 !== expectedDigest) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation projection receipt digest is forged or stale');
  }
  return freezeDeep(copied);
}

export function projectQualityReadinessObservations(input) {
  const admitted = snapshotData(input, 'observation input', 0, new WeakSet(), {
    allowCoreProvenanceMap: true,
    allowFrozenCoreTraceAliases: true,
  });
  exactKeys(admitted, INPUT_KEYS, 'observation input');
  assertExactRef(admitted.observation_run_ref, 'observation_run_ref');
  if (!inspectInstant(admitted.known_at).valid) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, 'known_at must be a canonical instant');
  }
  const envelope = requestFromQualityReadinessTypedFacts(admitted.typed_facts);
  if (admitted.known_at !== envelope.typed_project_facts.known_at) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation must use the Typed Facts known_at exactly');
  }
  let assessment;
  try {
    assessment = verifyQualityReadinessAssessmentResult(admitted.assessment_run, {
      effective_rule_set: admitted.effective_rule_set,
      typed_facts: admitted.typed_facts,
    });
  } catch {
    fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation requires one exact canonical E01 assessment envelope');
  }
  if (typeof assessment.receipt.bindings?.typed_facts_sha256 !== 'string') {
    fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, 'observation requires the exact derived E01 assessment receipt');
  }
  if (assessment.receipt.bindings.typed_facts_sha256 !== envelope.typed_project_facts.facts_digest) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'assessment receipt is not bound to this Typed Facts envelope');
  }
  const observations = envelope.typed_project_facts.facts.map((fact) => {
    if (!fact || typeof fact !== 'object' || typeof fact.rule_id !== 'string' || typeof fact.case_id !== 'string') {
      fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, 'each Typed Fact must carry a bounded rule and case ID');
    }
    let observation_state = 'observation_unavailable';
    if (fact.observation_attempted === true && fact.presence_state === 'present') observation_state = 'observed_present';
    if (fact.observation_attempted === true && fact.presence_state === 'absence_confirmed') observation_state = 'observed_absence_confirmed';
    const row = {
      observation_id: `qr_obs_${sha256Hex(`${fact.rule_id}\u001f${fact.case_id}\u001f${admitted.known_at}`).slice(0, 24)}`,
      rule_id: fact.rule_id,
      case_id: fact.case_id,
      observation_state,
      presence_state: fact.presence_state,
      observation_attempted: fact.observation_attempted === true,
    };
    if (fact.observation_attempted === true) {
      assertExactRef(fact.observation_attempt_ref, 'Typed Fact observation_attempt_ref');
      row.observation_attempt_ref = cloneRef(fact.observation_attempt_ref);
    }
    return row;
  }).sort((left, right) => compareCodePoints(left.rule_id, right.rule_id)
    || compareCodePoints(left.case_id, right.case_id));
  const counts = {
    total: observations.length,
    observed_present: observations.filter((row) => row.observation_state === 'observed_present').length,
    observed_absence_confirmed: observations.filter((row) => row.observation_state === 'observed_absence_confirmed').length,
    observation_unavailable: observations.filter((row) => row.observation_state === 'observation_unavailable').length,
  };
  const result = {
    schema_version: QUALITY_READINESS_OBSERVATION_SCHEMA,
    observation_kind: 'typed_facts_projection_only',
    observation_run_ref: cloneRef(admitted.observation_run_ref),
    known_at: admitted.known_at,
    observations,
    counts,
    receipt: {
      typed_facts_sha256: envelope.typed_project_facts.facts_digest,
      assessment_sha256: assessment.receipt.digests.assessment_sha256,
      observations_sha256: '',
      effects: {
        filesystem_reads: 0,
        filesystem_writes: 0,
        network_calls: 0,
        model_calls: 0,
        rag_calls: 0,
      },
    },
  };
  result.receipt.observations_sha256 = digest({
    observation_run_ref: result.observation_run_ref,
    known_at: result.known_at,
    observations: result.observations,
    counts: result.counts,
    typed_facts_sha256: result.receipt.typed_facts_sha256,
    assessment_sha256: result.receipt.assessment_sha256,
  });
  return freezeDeep(result);
}

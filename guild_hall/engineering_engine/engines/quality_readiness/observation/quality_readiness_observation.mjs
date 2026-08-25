// Domain-local observation projection. It reads no files: callers supply already-bound Typed
// Facts, and this seam only reports whether those explicit observations are usable or unavailable.
import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { isWellFormedRef } from '../../../core/validators/identity.mjs';
import { requestFromQualityReadinessTypedFacts } from '../binding/quality_readiness_typed_facts.mjs';

export const QUALITY_READINESS_OBSERVATION_SCHEMA = 'soulforge.quality_readiness.observation_projection.v0';
export const QUALITY_READINESS_OBSERVATION_CODES = Object.freeze({
  INVALID: 'QUALITY_READINESS_OBSERVATION_INVALID',
  BOUNDARY: 'QUALITY_READINESS_OBSERVATION_BOUNDARY',
});

const INPUT_KEYS = Object.freeze(['typed_facts', 'assessment_run', 'observation_run_ref', 'known_at']);
const REF_KEYS = Object.freeze(['entity_id', 'revision_id', 'content_id', 'content_hash_alg']);
const SHA256_ID = /^sha256:[a-f0-9]{64}$/u;

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

export function projectQualityReadinessObservations(input) {
  exactKeys(input, INPUT_KEYS, 'observation input');
  assertExactRef(input.observation_run_ref, 'observation_run_ref');
  if (!inspectInstant(input.known_at).valid) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.INVALID, 'known_at must be a canonical instant');
  }
  const envelope = requestFromQualityReadinessTypedFacts(input.typed_facts);
  if (input.known_at !== envelope.typed_project_facts.known_at) {
    fail(QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY, 'observation must use the Typed Facts known_at exactly');
  }
  const assessment = input.assessment_run;
  if (!assessment || typeof assessment !== 'object' || assessment.assessment?.assessment_kind !== 'quality_evidence_readiness'
      || typeof assessment.receipt?.digests?.assessment_sha256 !== 'string'
      || typeof assessment.receipt?.bindings?.typed_facts_sha256 !== 'string') {
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
      observation_id: `qr_obs_${sha256Hex(`${fact.rule_id}\u001f${fact.case_id}\u001f${input.known_at}`).slice(0, 24)}`,
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
    observation_run_ref: cloneRef(input.observation_run_ref),
    known_at: input.known_at,
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

// PC-06 snapshot identity and PC-07 provenance layering.
//
// The fingerprint exists to answer one question: did this exact input, under this exact
// binding, produce this exact result. That only works if nothing which varies per run
// enters the hash. An earlier iteration hashed the whole tuple including engine_run_id,
// which made every replay produce a new fingerprint and quietly destroyed the guarantee
// the fingerprint was there to provide.

import { createHash } from 'node:crypto';
import {
  CANONICAL,
  FINGERPRINT_INPUT_KEYS,
  FINGERPRINT_EXCLUDED_LAYERS,
  RUN_OBSERVATIONAL_PROVENANCE,
  ARRAY_ORDER_RULES,
} from './contract_config.mjs';
import { canonicalise } from './canonical.mjs';
import { ContractError, CODES } from './errors.mjs';

export const sha256Hex = (input) => createHash(CANONICAL.hashAlgorithm).update(input).digest('hex');

/**
 * Reduces a run tuple to exactly the declared fingerprint inputs.
 *
 * Every declared key is mandatory. Projecting whatever happens to be present would hand
 * back a well formed hash for an input carrying none of the required state, which is
 * indistinguishable from a real fingerprint downstream.
 */
export function projectFingerprintInput(tuple) {
  if (tuple === null || typeof tuple !== 'object' || Array.isArray(tuple)) {
    throw new ContractError(CODES.FINGERPRINT_INPUT_NOT_OBJECT, 'fingerprint input must be an object');
  }
  const projection = {};
  const missing = [];
  for (const key of FINGERPRINT_INPUT_KEYS) {
    if (Object.hasOwn(tuple, key)) projection[key] = tuple[key];
    else missing.push(key);
  }
  if (missing.length) {
    throw new ContractError(CODES.FINGERPRINT_INPUT_KEY_MISSING, 'fingerprint input is missing required keys', { missing });
  }
  // structural guard: the excluded layer must not have been smuggled into the key list
  for (const layer of FINGERPRINT_EXCLUDED_LAYERS) {
    if (Object.hasOwn(projection, layer)) {
      throw new ContractError(CODES.FINGERPRINT_EXCLUDED_LAYER_PRESENT_IN_PROJECTION,
        `${layer} must never participate in the fingerprint`, { layer });
    }
  }
  return projection;
}

/**
 * Computes the deterministic replay fingerprint.
 *
 * The serialisation rule version is part of the hashed material. Without it, changing the
 * serialisation rule would silently invalidate every previously recorded fingerprint with
 * no way to detect that it had happened.
 */
export function deterministicReplayFingerprint(tuple, {
  version = CANONICAL.version,
  arrayOrderRules = ARRAY_ORDER_RULES,
} = {}) {
  const projection = projectFingerprintInput(tuple);
  const material = `${CANONICAL.domainSeparationPrefix}\n${version}\n${canonicalise(projection, arrayOrderRules)}`;
  return sha256Hex(material);
}

/**
 * Splits a flat provenance record into the two contract layers.
 *
 * Classification rule: a field is replay relevant if and only if changing it alone could
 * change the computed snapshot content. Where that is unclear the field is treated as
 * replay relevant, because the two mistakes are not symmetric. Wrongly excluding a
 * content-affecting field yields one fingerprint for two different results, which is a
 * silent false claim of reproducibility. Wrongly including an inert field only produces
 * extra churn, which is noisy but safe.
 */
export function splitProvenance(record) {
  const replayRelevant = {};
  const runObservational = {};
  const unclassified = [];
  for (const [key, value] of Object.entries(record ?? {})) {
    if (RUN_OBSERVATIONAL_PROVENANCE.includes(key)) runObservational[key] = value;
    else replayRelevant[key] = value;
    if (!RUN_OBSERVATIONAL_PROVENANCE.includes(key)) unclassified.push(key);
  }
  return { replayRelevant, runObservational, defaultedToReplayRelevant: unclassified };
}

/**
 * A rerun that reproduces the fingerprint does not materialise a new snapshot. It emits a
 * verification receipt against the existing snapshot_id, so that one accepted generation
 * keeps exactly one snapshot and P8 lineage retains a single citation key.
 */
export function classifyRerun({ priorFingerprint, priorSnapshotId, tuple }) {
  const fingerprint = deterministicReplayFingerprint(tuple);
  if (fingerprint === priorFingerprint) {
    return { action: 'emit_verification_receipt', snapshot_id: priorSnapshotId, fingerprint, materialise: false };
  }
  return { action: 'materialise_new_snapshot', prior_snapshot_ref: priorSnapshotId, fingerprint, materialise: true };
}

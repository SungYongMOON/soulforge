import { CALIBRATION_MEASUREMENT_VALIDITY_RULES } from '../rules/calibration_measurement_validity_rules.mjs';
import { calibrationMeasurementValiditySha256 } from '../shared/calibration_measurement_validity_canonical_digest.mjs';
import { validateConsumedCmvSourceClassification } from '../source/calibration_measurement_validity_source_classification.mjs';

export const CMV_SOURCE_DERIVATION_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.source_derivation.v1';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function weakestCeiling(classifications) {
  if (classifications.length === 0) return 'observed';
  return classifications.every((classification) => classification?.claim_ceiling === 'source_supported')
    ? 'source_supported'
    : 'observed';
}

export function deriveCalibrationMeasurementValiditySourceRows(sourceClassifications = []) {
  const bySourceId = new Map();
  for (const classification of sourceClassifications) {
    try {
      const canonical = validateConsumedCmvSourceClassification(classification);
      bySourceId.set(canonical.source_id, canonical);
    } catch {
      // Invalid envelopes are deliberately not eligible to support any derivation row.
    }
  }
  const rows = CALIBRATION_MEASUREMENT_VALIDITY_RULES.map((rule) => {
    const sourceIds = rule.source_refs.filter((sourceId) => sourceId !== 'ENGINE-SAFETY-BOUNDARY');
    const classifications = sourceIds.map((sourceId) => bySourceId.get(sourceId) ?? null);
    const sourceRefs = classifications
      .filter(Boolean)
      .map((classification) => ({
        source_id: classification.source_id,
        source_ref: classification.source_ref,
        classification: classification.classification,
        verdict_eligible: classification.verdict_eligible,
      }));
    const sourceBound = sourceIds.length > 0 && classifications.every((classification) => classification?.verdict_eligible === true);
    return {
      criterion_id: rule.criterion_id,
      source_ids: sourceIds,
      source_refs: sourceRefs,
      derivation_state: sourceBound ? 'direct_source_bound' : (sourceIds.length === 0 ? 'engine_safety_boundary' : 'source_hold'),
      claim_ceiling: sourceIds.length === 0 ? 'observed' : weakestCeiling(classifications),
      unsupported_applicability: sourceBound ? [] : sourceIds.filter((sourceId, index) => !classifications[index]?.verdict_eligible),
    };
  });
  return freezeDeep({
    schema_version: CMV_SOURCE_DERIVATION_SCHEMA_VERSION,
    rows,
    receipt: {
      row_count: rows.length,
      rows_digest: `sha256:${calibrationMeasurementValiditySha256(rows)}`,
      rag_is_not_derivation_authority: true,
    },
  });
}

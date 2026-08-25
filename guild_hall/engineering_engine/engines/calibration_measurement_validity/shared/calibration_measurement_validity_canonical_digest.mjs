import { createHash } from 'node:crypto';

import { compareCodePoints } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';

export const CMV_CANONICAL_DIGEST_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.canonical_digest.v1';

export function canonicalizeCalibrationMeasurementValidity(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ContractError('CMV_CANONICAL_DIGEST_INVALID', 'receipt digest input cannot contain a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeCalibrationMeasurementValidity).join(',')}]`;
  if (!value || typeof value !== 'object') {
    throw new ContractError('CMV_CANONICAL_DIGEST_INVALID', 'receipt digest input must be JSON-like data');
  }
  const keys = Object.keys(value).sort(compareCodePoints);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeCalibrationMeasurementValidity(value[key])}`).join(',')}}`;
}

export function calibrationMeasurementValiditySha256(value) {
  return createHash('sha256').update(canonicalizeCalibrationMeasurementValidity(value)).digest('hex');
}

#!/usr/bin/env node
// Public-synthetic, zero-write runner. It reads no files and emits one stable JSON result.
import { buildCalibrationMeasurementValidityPublicSyntheticRequest } from '../fixtures/calibration_measurement_validity_public_synthetic.mjs';
import { assessCalibrationMeasurementValidity } from '../evaluator/calibration_measurement_validity.mjs';

const result = assessCalibrationMeasurementValidity(buildCalibrationMeasurementValidityPublicSyntheticRequest('VALID'));
process.stdout.write(`${JSON.stringify(result)}\n`);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function ref(entityId, fill) {
  return freezeDeep({
    entity_id: `synthetic:${entityId}`,
    revision_id: 'v1',
    content_id: `sha256:${fill.repeat(64)}`,
  });
}

function baseRequest() {
  return {
    schema_version: 'soulforge.calibration_measurement_validity.domain_input.v0',
    project_binding_ref: ref('project-binding', 'a'),
    evaluation_context: {
      test_id: 'synthetic-test-valid',
      tested_at: '2026-08-26T10:00:00.000Z',
      known_at: '2026-08-26T10:05:00.000Z',
    },
    instrument: {
      instrument_id: 'synthetic-meter-001',
      identity_ref: ref('instrument-identity', 'b'),
      calibration: {
        status: 'in_calibration',
        certificate_ref: ref('calibration-certificate', 'c'),
        due_at: '2026-09-01T00:00:00.000Z',
      },
    },
    requested_measurement: {
      range: { minimum: 0, maximum: 10, unit: 'V' },
      required_accuracy_limit: { value: 0.5, unit: 'V' },
      maximum_uncertainty: { value: 0.2, unit: 'V' },
    },
    calibration_capability: {
      range: { minimum: 0, maximum: 10, unit: 'V' },
      accuracy_limit: { value: 0.1, unit: 'V' },
      uncertainty: { expanded: { value: 0.1, unit: 'V' } },
    },
    traceability: {
      status: 'documented',
      chain_ref: ref('traceability-chain', 'd'),
    },
    environment: {
      status: 'within_limit',
      record_ref: ref('environment-record', 'e'),
    },
    exception: {
      status: 'none',
    },
  };
}

export const CALIBRATION_MEASUREMENT_VALIDITY_PUBLIC_SYNTHETIC_FIXTURE = freezeDeep({
  fixture_id: 'calibration_measurement_validity_public_synthetic.v0',
  outcomes_by_case: {
    VALID: { result_status: 'valid', result_impact: 'none' },
    EXPIRED: { result_status: 'invalid', result_impact: 'invalidate' },
    OUT_OF_RANGE: { result_status: 'invalid', result_impact: 'invalidate' },
    EXCEPTION_HELD: { result_status: 'held', result_impact: 'hold' },
    UNKNOWN: { result_status: 'unknown', result_impact: 'hold' },
  },
  expected: {
    outcomes_by_case: {
      VALID: { result_status: 'valid', result_impact: 'none' },
      EXPIRED: { result_status: 'invalid', result_impact: 'invalidate' },
      OUT_OF_RANGE: { result_status: 'invalid', result_impact: 'invalidate' },
      EXCEPTION_HELD: { result_status: 'held', result_impact: 'hold' },
      UNKNOWN: { result_status: 'unknown', result_impact: 'hold' },
    },
  },
});

export function buildCalibrationMeasurementValidityPublicSyntheticRequest(caseId = 'VALID') {
  const request = structuredClone(baseRequest());
  if (caseId === 'VALID') return request;
  if (caseId === 'EXPIRED') {
    request.evaluation_context.test_id = 'synthetic-test-expired';
    request.instrument.calibration.due_at = '2026-08-25T23:59:59.000Z';
    return request;
  }
  if (caseId === 'OUT_OF_RANGE') {
    request.evaluation_context.test_id = 'synthetic-test-out-of-range';
    request.requested_measurement.range.maximum = 12;
    return request;
  }
  if (caseId === 'EXCEPTION_HELD') {
    request.evaluation_context.test_id = 'synthetic-test-exception-held';
    request.exception = {
      status: 'approved_hold',
      exception_ref: ref('exception', 'f'),
      approval_ref: ref('exception-approval', '1'),
    };
    return request;
  }
  if (caseId === 'UNKNOWN') {
    request.evaluation_context.test_id = 'synthetic-test-unknown';
    request.traceability = { status: 'unknown' };
    return request;
  }
  throw new Error(`unknown public synthetic case ${caseId}`);
}

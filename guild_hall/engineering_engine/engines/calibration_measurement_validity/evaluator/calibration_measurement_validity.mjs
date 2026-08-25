import { createHash } from 'node:crypto';
import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';
import { CALIBRATION_MEASUREMENT_VALIDITY_RULES, CMV_RULESET_REF, CMV_SOURCE_PACKET_REF } from '../rules/calibration_measurement_validity_rules.mjs';
import { calibrationMeasurementValiditySha256 } from '../shared/calibration_measurement_validity_canonical_digest.mjs';

export const CMV_ERROR_CODES = Object.freeze({
  INPUT_INVALID: 'CMV_INPUT_INVALID',
  INPUT_UNSAFE: 'CMV_INPUT_UNSAFE',
  TIME_INVALID: 'CMV_TIME_INVALID',
  UNIT_MISMATCH: 'CMV_UNIT_MISMATCH',
  PROFILE_UNSUPPORTED: 'CMV_PROFILE_UNSUPPORTED',
  EFFECTIVE_RULESET_INVALID: 'CMV_EFFECTIVE_RULESET_INVALID',
});

const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/u;
const UNIT_TOKEN = /^[A-Za-z0-9%µΩ_./-]{1,32}$/u;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /^[A-Za-z]:[\\/]/u,
  /^\\\\/u,
  /^\/(?:etc|home|root|tmp|var|usr)(?:\/|$)/u,
  /(?:^|[_-])(password|secret|api[_-]?key|bearer[_-]?token)(?:$|[_-])/iu,
]);
const RULE_BY_ID = new Map(CALIBRATION_MEASUREMENT_VALIDITY_RULES.map((rule) => [rule.criterion_id, rule]));

function refuse(code, message) {
  throw new ContractError(code, message);
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function assertPlainData(value, label = 'input', depth = 0, ancestors = new Set()) {
  if (depth > 24) refuse(CMV_ERROR_CODES.INPUT_UNSAFE, `${label} exceeds the safe depth limit`);
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      refuse(CMV_ERROR_CODES.INPUT_UNSAFE, `${label} contains a non-finite number`);
    }
    if (typeof value === 'string') {
      if (value.length > 1024 || FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
        refuse(CMV_ERROR_CODES.INPUT_UNSAFE, `${label} contains an unsafe string`);
      }
    }
    return;
  }
  if (types.isProxy(value) || ancestors.has(value)) {
    refuse(CMV_ERROR_CODES.INPUT_UNSAFE, `${label} must not be a proxy or cyclic value`);
  }
  const expectedPrototype = Array.isArray(value) ? Array.prototype : Object.prototype;
  if (Object.getPrototypeOf(value) !== expectedPrototype) {
    refuse(CMV_ERROR_CODES.INPUT_UNSAFE, `${label} must contain only plain objects and arrays`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key) || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      refuse(CMV_ERROR_CODES.INPUT_UNSAFE, `${label} contains an accessor, hidden property, symbol, or prototype-sensitive key`);
    }
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    assertPlainData(descriptor.value, `${label}.${key}`, depth + 1, nextAncestors);
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, `${label} must be an object`);
  }
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validReference(value) {
  return Boolean(value
    && typeof value === 'object'
    && !Array.isArray(value)
    && nonEmptyString(value.entity_id)
    && nonEmptyString(value.revision_id)
    && typeof value.content_id === 'string'
    && SHA256_REF.test(value.content_id));
}

function parseInstant(value, label) {
  if (typeof value !== 'string' || !CANONICAL_INSTANT.test(value)) {
    refuse(CMV_ERROR_CODES.TIME_INVALID, `${label} must be a canonical millisecond UTC instant`);
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf()) || instant.toISOString() !== value) {
    refuse(CMV_ERROR_CODES.TIME_INVALID, `${label} must name a real UTC instant`);
  }
  return instant.valueOf();
}

function quantityOrMissing(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Object.hasOwn(value, 'value') || !Object.hasOwn(value, 'unit')) return null;
  if (typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < 0) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, `${label}.value must be a non-negative finite number`);
  }
  if (typeof value.unit !== 'string' || !UNIT_TOKEN.test(value.unit)) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, `${label}.unit must be a bounded unit token`);
  }
  return { value: value.value, unit: value.unit };
}

function rangeOrMissing(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Object.hasOwn(value, 'minimum') || !Object.hasOwn(value, 'maximum') || !Object.hasOwn(value, 'unit')) return null;
  if (typeof value.minimum !== 'number' || typeof value.maximum !== 'number'
      || !Number.isFinite(value.minimum) || !Number.isFinite(value.maximum) || value.minimum > value.maximum) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, `${label} must have ordered finite numeric minimum and maximum`);
  }
  if (typeof value.unit !== 'string' || !UNIT_TOKEN.test(value.unit)) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, `${label}.unit must be a bounded unit token`);
  }
  return { minimum: value.minimum, maximum: value.maximum, unit: value.unit };
}

function requireSameUnit(left, right, label) {
  if (left.unit !== right.unit) {
    refuse(CMV_ERROR_CODES.UNIT_MISMATCH, `${label} requires like units; conversion is outside CMV v0 authority`);
  }
}

function determination(criterionId, status, reasonCode) {
  const rule = RULE_BY_ID.get(criterionId);
  return {
    criterion_id: criterionId,
    status,
    reason_code: reasonCode,
    source_refs: rule ? [...rule.source_refs] : ['ENGINE-SAFETY-BOUNDARY'],
  };
}

function identityDetermination(instrument) {
  if (!instrument || !nonEmptyString(instrument.instrument_id) || !validReference(instrument.identity_ref)) {
    return determination('CMV-INSTRUMENT-IDENTITY-01', 'missing', 'instrument_identity_missing');
  }
  return determination('CMV-INSTRUMENT-IDENTITY-01', 'valid', 'instrument_identity_supplied');
}

function calibrationDetermination(instrument, testedAt) {
  const calibration = instrument?.calibration;
  if (!calibration || typeof calibration !== 'object' || Array.isArray(calibration)) {
    return determination('CMV-CALIBRATION-STATUS-01', 'missing', 'calibration_facts_missing');
  }
  if (!['in_calibration', 'expired', 'out_of_service', 'unknown'].includes(calibration.status)) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, 'instrument.calibration.status is not a recognized upstream status');
  }
  if (calibration.status === 'expired') {
    return determination('CMV-CALIBRATION-STATUS-01', 'expired', 'upstream_calibration_expired');
  }
  if (calibration.status === 'out_of_service') {
    return determination('CMV-CALIBRATION-STATUS-01', 'not_suitable', 'upstream_calibration_out_of_service');
  }
  if (calibration.status === 'unknown') {
    return determination('CMV-CALIBRATION-STATUS-01', 'unknown', 'upstream_calibration_status_unknown');
  }
  if (!validReference(calibration.certificate_ref) || !nonEmptyString(calibration.due_at)) {
    return determination('CMV-CALIBRATION-STATUS-01', 'missing', 'calibration_certificate_or_due_time_missing');
  }
  const dueAt = parseInstant(calibration.due_at, 'instrument.calibration.due_at');
  if (nonEmptyString(calibration.valid_from) && parseInstant(calibration.valid_from, 'instrument.calibration.valid_from') > testedAt) {
    return determination('CMV-CALIBRATION-STATUS-01', 'not_suitable', 'test_precedes_calibration_validity');
  }
  if (dueAt < testedAt) {
    return determination('CMV-CALIBRATION-STATUS-01', 'expired', 'test_after_calibration_due_time');
  }
  return determination('CMV-CALIBRATION-STATUS-01', 'valid', 'calibration_valid_at_test_time');
}

function rangeDetermination(requestedMeasurement, calibrationCapability) {
  const requested = rangeOrMissing(requestedMeasurement?.range, 'requested_measurement.range');
  const capability = rangeOrMissing(calibrationCapability?.range, 'calibration_capability.range');
  if (!requested || !capability) return determination('CMV-RANGE-01', 'missing', 'range_facts_missing');
  requireSameUnit(requested, capability, 'range suitability');
  if (requested.minimum < capability.minimum || requested.maximum > capability.maximum) {
    return determination('CMV-RANGE-01', 'out_of_range', 'requested_range_outside_calibrated_range');
  }
  return determination('CMV-RANGE-01', 'valid', 'requested_range_within_calibrated_range');
}

function accuracyDetermination(requestedMeasurement, calibrationCapability) {
  const required = quantityOrMissing(requestedMeasurement?.required_accuracy_limit, 'requested_measurement.required_accuracy_limit');
  const capability = quantityOrMissing(calibrationCapability?.accuracy_limit, 'calibration_capability.accuracy_limit');
  if (!required || !capability) return determination('CMV-ACCURACY-01', 'missing', 'accuracy_facts_missing');
  requireSameUnit(required, capability, 'accuracy suitability');
  if (capability.value > required.value) {
    return determination('CMV-ACCURACY-01', 'not_suitable', 'calibrated_accuracy_exceeds_requirement');
  }
  return determination('CMV-ACCURACY-01', 'valid', 'calibrated_accuracy_within_requirement');
}

function uncertaintyDetermination(requestedMeasurement, calibrationCapability) {
  const allowed = quantityOrMissing(requestedMeasurement?.maximum_uncertainty, 'requested_measurement.maximum_uncertainty');
  const expanded = quantityOrMissing(calibrationCapability?.uncertainty?.expanded, 'calibration_capability.uncertainty.expanded');
  if (!allowed || !expanded) return determination('CMV-UNCERTAINTY-01', 'missing', 'uncertainty_facts_missing');
  requireSameUnit(allowed, expanded, 'uncertainty suitability');
  if (expanded.value > allowed.value) {
    return determination('CMV-UNCERTAINTY-01', 'not_suitable', 'expanded_uncertainty_exceeds_allowance');
  }
  return determination('CMV-UNCERTAINTY-01', 'valid', 'expanded_uncertainty_within_allowance');
}

function traceabilityDetermination(traceability) {
  if (!traceability || typeof traceability !== 'object' || Array.isArray(traceability) || !nonEmptyString(traceability.status)) {
    return determination('CMV-TRACEABILITY-01', 'missing', 'traceability_facts_missing');
  }
  if (traceability.status === 'documented') {
    return validReference(traceability.chain_ref)
      ? determination('CMV-TRACEABILITY-01', 'valid', 'documented_traceability_chain_supplied')
      : determination('CMV-TRACEABILITY-01', 'missing', 'traceability_chain_reference_missing');
  }
  if (traceability.status === 'not_documented') return determination('CMV-TRACEABILITY-01', 'missing', 'traceability_not_documented');
  if (traceability.status === 'unknown') return determination('CMV-TRACEABILITY-01', 'unknown', 'traceability_status_unknown');
  refuse(CMV_ERROR_CODES.INPUT_INVALID, 'traceability.status is not recognized');
}

function environmentDetermination(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment) || !nonEmptyString(environment.status)) {
    return determination('CMV-ENVIRONMENT-01', 'missing', 'environment_facts_missing');
  }
  if (environment.status === 'within_limit') {
    return validReference(environment.record_ref)
      ? determination('CMV-ENVIRONMENT-01', 'valid', 'environment_within_upstream_limit')
      : determination('CMV-ENVIRONMENT-01', 'missing', 'environment_record_reference_missing');
  }
  if (environment.status === 'out_of_limit') return determination('CMV-ENVIRONMENT-01', 'not_suitable', 'environment_outside_upstream_limit');
  if (environment.status === 'not_applicable') {
    return validReference(environment.not_applicable_basis_ref)
      ? determination('CMV-ENVIRONMENT-01', 'not_applicable', 'environment_not_applicable_with_basis')
      : determination('CMV-ENVIRONMENT-01', 'missing', 'environment_not_applicable_basis_missing');
  }
  if (environment.status === 'unknown') return determination('CMV-ENVIRONMENT-01', 'unknown', 'environment_status_unknown');
  refuse(CMV_ERROR_CODES.INPUT_INVALID, 'environment.status is not recognized');
}

function exceptionDetermination(exception) {
  if (!exception || typeof exception !== 'object' || Array.isArray(exception) || !nonEmptyString(exception.status)) {
    return determination('CMV-EXCEPTION-01', 'missing', 'exception_facts_missing');
  }
  if (exception.status === 'none') return determination('CMV-EXCEPTION-01', 'valid', 'no_exception_declared');
  if (exception.status === 'approved_hold') {
    return validReference(exception.exception_ref) && validReference(exception.approval_ref)
      ? determination('CMV-EXCEPTION-01', 'exception_held', 'approved_exception_requires_hold')
      : determination('CMV-EXCEPTION-01', 'missing', 'exception_or_approval_reference_missing');
  }
  if (exception.status === 'unapproved') return determination('CMV-EXCEPTION-01', 'not_suitable', 'unapproved_exception');
  if (exception.status === 'unknown') return determination('CMV-EXCEPTION-01', 'unknown', 'exception_status_unknown');
  refuse(CMV_ERROR_CODES.INPUT_INVALID, 'exception.status is not recognized');
}

function aggregateDetermination(determinations) {
  const statuses = determinations.map((entry) => entry.status);
  if (statuses.includes('exception_held')) {
    return { result_status: 'held', result_impact: 'hold', determination: determination('CMV-RESULT-IMPACT-01', 'held', 'exception_hold_prevents_validity_conclusion') };
  }
  if (statuses.some((status) => ['expired', 'out_of_range', 'not_suitable'].includes(status))) {
    return { result_status: 'invalid', result_impact: 'invalidate', determination: determination('CMV-RESULT-IMPACT-01', 'invalid', 'invalidating_measurement_validity_evidence_present') };
  }
  if (statuses.some((status) => ['missing', 'unknown'].includes(status))) {
    return { result_status: 'unknown', result_impact: 'hold', determination: determination('CMV-RESULT-IMPACT-01', 'unknown', 'insufficient_measurement_validity_evidence') };
  }
  return { result_status: 'valid', result_impact: 'none', determination: determination('CMV-RESULT-IMPACT-01', 'valid', 'all_required_measurement_validity_evidence_valid') };
}

function validateInput(input) {
  assertPlainData(input);
  const request = plainObject(input, 'input');
  const requiredTopLevel = [
    'schema_version', 'project_binding_ref', 'evaluation_context', 'instrument',
    'requested_measurement', 'calibration_capability', 'traceability', 'environment', 'exception',
  ];
  if (Object.keys(request).length !== requiredTopLevel.length || requiredTopLevel.some((key) => !Object.hasOwn(request, key))) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, 'input must contain exactly the CMV domain-input fields');
  }
  if (request.schema_version !== 'soulforge.calibration_measurement_validity.domain_input.v0') {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, 'input schema_version does not match CMV v0');
  }
  if (!validReference(request.project_binding_ref)) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, 'project_binding_ref must be a typed immutable reference');
  }
  const evaluationContext = plainObject(request.evaluation_context, 'evaluation_context');
  if (!nonEmptyString(evaluationContext.test_id)) {
    refuse(CMV_ERROR_CODES.INPUT_INVALID, 'evaluation_context.test_id is required');
  }
  const testedAt = parseInstant(evaluationContext.tested_at, 'evaluation_context.tested_at');
  parseInstant(evaluationContext.known_at, 'evaluation_context.known_at');
  return { request, testedAt };
}

export function assessCalibrationMeasurementValidity(input) {
  const { request, testedAt } = validateInput(input);
  const determinations = [
    identityDetermination(request.instrument),
    calibrationDetermination(request.instrument, testedAt),
    rangeDetermination(request.requested_measurement, request.calibration_capability),
    accuracyDetermination(request.requested_measurement, request.calibration_capability),
    uncertaintyDetermination(request.requested_measurement, request.calibration_capability),
    traceabilityDetermination(request.traceability),
    environmentDetermination(request.environment),
    exceptionDetermination(request.exception),
  ];
  const aggregate = aggregateDetermination(determinations);
  determinations.push(aggregate.determination);

  const assessment = {
    schema_version: 'soulforge.calibration_measurement_validity.assessment.v0',
    domain_engine_id: 'calibration_measurement_validity',
    claim_ceiling: 'source_supported',
    project_binding_ref: {
      entity_id: request.project_binding_ref.entity_id,
      revision_id: request.project_binding_ref.revision_id,
      content_id: request.project_binding_ref.content_id,
    },
    evaluated_at: {
      tested_at: request.evaluation_context.tested_at,
      known_at: request.evaluation_context.known_at,
    },
    result_status: aggregate.result_status,
    result_impact: aggregate.result_impact,
    determinations,
  };
  const inputDigest = calibrationMeasurementValiditySha256(request);
  const assessmentDigest = calibrationMeasurementValiditySha256(assessment);
  const receipt = {
    schema_version: 'soulforge.calibration_measurement_validity.receipt.v0',
    execution_mode: 'deterministic_only',
    source_packet_ref: {
      entity_id: CMV_SOURCE_PACKET_REF.entity_id,
      revision_id: CMV_SOURCE_PACKET_REF.revision_id,
      content_id: CMV_SOURCE_PACKET_REF.content_id,
    },
    ruleset_ref: {
      entity_id: CMV_RULESET_REF.entity_id,
      revision_id: CMV_RULESET_REF.revision_id,
      content_id: CMV_RULESET_REF.content_id,
    },
    input_sha256: inputDigest,
    assessment_sha256: assessmentDigest,
    replay_digest: createHash('sha256').update(`cmv-v0\n${inputDigest}\n${CMV_RULESET_REF.content_id}`).digest('hex'),
    effects: {
      network_calls: 0,
      file_reads: 0,
      file_writes: 0,
      external_mutations: 0,
    },
  };
  return freezeDeep({ assessment, receipt });
}

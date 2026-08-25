import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';
import {
  CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
  validateConsumedCmvSourceClassification,
} from '../source/calibration_measurement_validity_source_classification.mjs';
import { calibrationMeasurementValiditySha256 } from '../shared/calibration_measurement_validity_canonical_digest.mjs';

export const CMV_TYPED_FACTS_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.typed_facts.v1';
export const CMV_TYPED_FACT_CODES = Object.freeze({
  INVALID_INPUT: 'CMV_TYPED_FACT_INVALID_INPUT',
  SOURCE_HOLD: 'CMV_TYPED_FACT_SOURCE_HOLD',
  PROVENANCE_INVALID: 'CMV_TYPED_FACT_PROVENANCE_INVALID',
});

const FACT_KEYS = Object.freeze([
  'instrument_identity', 'calibration_status', 'measurement_suitability',
  'traceability', 'environment', 'exception',
]);
const SHA256_REF = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

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

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, `${label} must be a plain object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true
        || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, `${label} has unsafe properties`);
    }
  }
  return value;
}

function referenceEqual(left, right) {
  return left?.entity_id === right?.entity_id && left?.revision_id === right?.revision_id && left?.content_id === right?.content_id;
}

function canonicalInstant(value, label) {
  if (typeof value !== 'string' || !CANONICAL_INSTANT.test(value)) {
    refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, `${label} must be a canonical UTC instant`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, `${label} must be a real UTC instant`);
  }
  return parsed.valueOf();
}

export function adaptCalibrationMeasurementValidityTypedFacts(input) {
  const value = assertPlainObject(input, 'typed facts input');
  const expected = ['domain_input', 'fact_provenance', 'schema_version', 'source_classifications'];
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])
      || value.schema_version !== 'soulforge.calibration_measurement_validity.source_bound_typed_facts.v1') {
    refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, 'typed facts input has an unexpected shape');
  }
  const request = assertPlainObject(value.domain_input, 'domain_input');
  if (request.schema_version !== 'soulforge.calibration_measurement_validity.domain_input.v0'
      || !request.project_binding_ref || typeof request.evaluation_context?.tested_at !== 'string'
      || typeof request.evaluation_context?.known_at !== 'string') {
    refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, 'domain_input is not a CMV request');
  }
  const testedAt = canonicalInstant(request.evaluation_context.tested_at, 'domain_input.evaluation_context.tested_at');
  const knownAt = canonicalInstant(request.evaluation_context.known_at, 'domain_input.evaluation_context.known_at');
  if (knownAt < testedAt) {
    refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, 'known_at must not precede tested_at for source-bound typed facts');
  }
  if (!Array.isArray(value.source_classifications) || value.source_classifications.length === 0) {
    refuse(CMV_TYPED_FACT_CODES.SOURCE_HOLD, 'source classifications are required for typed facts');
  }
  const sourceById = new Map();
  for (const source of value.source_classifications) {
    let canonicalSource;
    try {
      canonicalSource = validateConsumedCmvSourceClassification(source, { requireDirect: true });
    } catch {
      refuse(CMV_TYPED_FACT_CODES.SOURCE_HOLD, 'RAG-only, controlled, unknown, or unverified source classifications cannot create typed CMV facts');
    }
    if (canonicalSource.schema_version !== CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION
        || !SHA256_REF.test(canonicalSource.source_ref.content_id ?? '')) {
      refuse(CMV_TYPED_FACT_CODES.SOURCE_HOLD, 'source classification is malformed');
    }
    if (sourceById.has(canonicalSource.source_id)) {
      refuse(CMV_TYPED_FACT_CODES.INVALID_INPUT, 'source classifications must have unique source IDs');
    }
    sourceById.set(canonicalSource.source_id, canonicalSource);
  }
  const provenance = assertPlainObject(value.fact_provenance, 'fact_provenance');
  const provenanceKeys = Object.keys(provenance).sort();
  const expectedProvenance = [...FACT_KEYS].sort();
  if (provenanceKeys.length !== expectedProvenance.length || !provenanceKeys.every((key, index) => key === expectedProvenance[index])) {
    refuse(CMV_TYPED_FACT_CODES.PROVENANCE_INVALID, 'typed fact provenance must bind every required CMV fact family exactly once');
  }
  const normalizedProvenance = {};
  for (const factKey of FACT_KEYS) {
    const row = assertPlainObject(provenance[factKey], `fact_provenance.${factKey}`);
    const source = sourceById.get(row.source_id);
    if (!source || !referenceEqual(row.source_ref, source.source_ref)) {
      refuse(CMV_TYPED_FACT_CODES.PROVENANCE_INVALID, 'fact provenance must bind to one supplied direct source classification');
    }
    normalizedProvenance[factKey] = {
      source_id: row.source_id,
      source_ref: {
        entity_id: row.source_ref.entity_id,
        revision_id: row.source_ref.revision_id,
        content_id: row.source_ref.content_id,
      },
    };
  }
  const normalizedSources = [...sourceById.values()]
    .map((source) => structuredClone(source))
    .sort((left, right) => left.source_id.localeCompare(right.source_id, 'en'));
  const requestCopy = structuredClone(request);
  const sourceDigest = calibrationMeasurementValiditySha256(normalizedSources);
  return freezeDeep({
    schema_version: CMV_TYPED_FACTS_SCHEMA_VERSION,
    request: requestCopy,
    source_classifications: normalizedSources,
    fact_provenance: normalizedProvenance,
    typed_fact_receipt: {
      schema_version: 'soulforge.calibration_measurement_validity.typed_fact_receipt.v1',
      project_binding_ref: structuredClone(request.project_binding_ref),
      valid_at: request.evaluation_context.tested_at,
      known_at: request.evaluation_context.known_at,
      source_classifications_digest: `sha256:${sourceDigest}`,
      provenance_count: FACT_KEYS.length,
      effects: {
        network_calls: 0,
        file_reads: 0,
        file_writes: 0,
        external_mutations: 0,
      },
    },
  });
}

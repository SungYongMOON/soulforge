import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';
import { canonicalizeCalibrationMeasurementValidity } from '../shared/calibration_measurement_validity_canonical_digest.mjs';

export const CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.source_classification.v2';
export const CMV_SOURCE_CLASSIFICATION_CODES = Object.freeze({
  INVALID_INPUT: 'CMV_SOURCE_CLASSIFICATION_INVALID_INPUT',
  UNKNOWN_SOURCE: 'CMV_SOURCE_CLASSIFICATION_UNKNOWN_SOURCE',
  UNACCEPTED_BINDING: 'CMV_SOURCE_CLASSIFICATION_UNACCEPTED_BINDING',
  CONSUMED_ENVELOPE_INVALID: 'CMV_SOURCE_CLASSIFICATION_CONSUMED_ENVELOPE_INVALID',
  CONSUMED_ENVELOPE_NOT_DIRECT: 'CMV_SOURCE_CLASSIFICATION_CONSUMED_ENVELOPE_NOT_DIRECT',
  RAG_NOT_VERDICT_AUTHORITY: 'CMV_SOURCE_CLASSIFICATION_RAG_NOT_VERDICT_AUTHORITY',
  CONTROLLED_SOURCE_HOLD: 'CMV_SOURCE_CLASSIFICATION_CONTROLLED_SOURCE_HOLD',
  DIRECT_ACCESS_UNVERIFIED: 'CMV_SOURCE_CLASSIFICATION_DIRECT_ACCESS_UNVERIFIED',
});

const SHA256_REF = /^sha256:[a-f0-9]{64}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const REQUEST_FIELDS = Object.freeze(['source_id', 'source_ref']);
const CONSUMED_FIELDS = Object.freeze([
  'access_class', 'applicability_state', 'authority', 'binding_kind', 'claim_ceiling',
  'classification', 'direct_access_verified', 'hold_code', 'retrieval_path', 'revision',
  'schema_version', 'source_id', 'source_ref', 'verdict_eligible',
]);

const ref = (entityId, revisionId, fill) => Object.freeze({
  entity_id: entityId,
  revision_id: revisionId,
  content_id: `sha256:${fill.repeat(64)}`,
});

const officialBinding = (sourceId, revision, fill) => Object.freeze({
  binding_kind: 'official_public_direct',
  source_ref: ref(`cmv-source:${sourceId}`, revision, fill),
  access_class: 'official_public',
  direct_access_verified: true,
  retrieval_path: 'direct',
  applicability_state: 'in_scope',
  classification: 'official_public_direct',
  verdict_eligible: true,
  claim_ceiling: 'source_supported',
  hold_code: null,
});

const syntheticBinding = (sourceId, fill) => Object.freeze({
  binding_kind: 'synthetic_direct',
  source_ref: ref(`synthetic:cmv-source:${sourceId}`, 'synthetic-v1', fill),
  access_class: 'official_public',
  direct_access_verified: true,
  retrieval_path: 'direct',
  applicability_state: 'in_scope',
  classification: 'official_public_direct',
  verdict_eligible: true,
  claim_ceiling: 'source_supported',
  hold_code: null,
});

const ragBinding = (sourceId, fill) => Object.freeze({
  binding_kind: 'rag_retrieval_only',
  source_ref: ref(`synthetic:cmv-rag:${sourceId}`, 'synthetic-rag-v1', fill),
  access_class: 'official_public',
  direct_access_verified: false,
  retrieval_path: 'rag',
  applicability_state: 'candidate_locator_only',
  classification: 'rag_retrieval_only',
  verdict_eligible: false,
  claim_ceiling: 'observed',
  hold_code: CMV_SOURCE_CLASSIFICATION_CODES.RAG_NOT_VERDICT_AUTHORITY,
});

const holdBinding = (sourceId, fill) => Object.freeze({
  binding_kind: 'direct_access_hold',
  source_ref: ref(`synthetic:cmv-unverified:${sourceId}`, 'synthetic-unverified-v1', fill),
  access_class: 'official_public',
  direct_access_verified: false,
  retrieval_path: 'direct',
  applicability_state: 'unknown',
  classification: 'direct_access_hold',
  verdict_eligible: false,
  claim_ceiling: 'observed',
  hold_code: CMV_SOURCE_CLASSIFICATION_CODES.DIRECT_ACCESS_UNVERIFIED,
});

const controlledBinding = (sourceId, revision, fill) => Object.freeze({
  binding_kind: 'controlled_citation_only',
  source_ref: ref(`cmv-source:${sourceId}`, revision, fill),
  access_class: 'controlled_citation_only',
  direct_access_verified: false,
  retrieval_path: 'direct',
  applicability_state: 'citation_only',
  classification: 'controlled_citation_only',
  verdict_eligible: false,
  claim_ceiling: 'observed',
  hold_code: CMV_SOURCE_CLASSIFICATION_CODES.CONTROLLED_SOURCE_HOLD,
});

function publicSource(authority, sourceId, revision, officialFill, syntheticFill, ragFill, holdFill) {
  return Object.freeze({
    authority,
    class: 'official_public',
    bindings: Object.freeze({
      official_public_direct: officialBinding(sourceId, revision, officialFill),
      synthetic_direct: syntheticBinding(sourceId, syntheticFill),
      rag_retrieval_only: ragBinding(sourceId, ragFill),
      direct_access_hold: holdBinding(sourceId, holdFill),
    }),
  });
}

export const CMV_SOURCE_AUTHORITY_CATALOG = Object.freeze({
  'NIST-METROLOGICAL-TRACEABILITY-FAQ': publicSource('National Institute of Standards and Technology', 'NIST-METROLOGICAL-TRACEABILITY-FAQ', 'public-2026-08-26', '1', 'a', 'b', 'c'),
  'NIST-TN-1297-1994': publicSource('National Institute of Standards and Technology', 'NIST-TN-1297-1994', '1994-edition', '2', 'd', 'e', 'f'),
  'NIST-RECOMMENDED-CALIBRATION-INTERVAL-2026-05-29': publicSource('National Institute of Standards and Technology Calibration Services', 'NIST-RECOMMENDED-CALIBRATION-INTERVAL-2026-05-29', 'updated-2026-05-29', '3', 'g', 'h', 'i'),
  'ILAC-G24-2022-PUBLICATION': publicSource('International Laboratory Accreditation Cooperation', 'ILAC-G24-2022-PUBLICATION', '2022-publication-index', '4', 'j', 'k', 'l'),
  'ISO-IEC-17025-2017-CITATION-ONLY': Object.freeze({
    authority: 'International Organization for Standardization',
    class: 'controlled_citation_only',
    bindings: Object.freeze({
      controlled_citation_only: controlledBinding('ISO-IEC-17025-2017-CITATION-ONLY', '2017-citation-only', '5'),
    }),
  }),
});

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

function assertPlainObject(value, label, code = CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    refuse(code, `${label} must be a plain object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true
        || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      refuse(code, `${label} carries unsafe properties`);
    }
  }
  return value;
}

function assertReference(value, code) {
  assertPlainObject(value, 'source_ref', code);
  const keys = Object.keys(value).sort();
  const expected = ['content_id', 'entity_id', 'revision_id'];
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])
      || !SAFE_TOKEN.test(value.entity_id ?? '') || !SAFE_TOKEN.test(value.revision_id ?? '')
      || !SHA256_REF.test(value.content_id ?? '')) {
    refuse(code, 'source_ref must be an exact immutable reference');
  }
  return { entity_id: value.entity_id, revision_id: value.revision_id, content_id: value.content_id };
}

function sameReference(left, right) {
  return left?.entity_id === right?.entity_id && left?.revision_id === right?.revision_id && left?.content_id === right?.content_id;
}

function lookupBinding(sourceId, sourceRef) {
  const catalog = CMV_SOURCE_AUTHORITY_CATALOG[sourceId] ?? null;
  if (!catalog) return null;
  return Object.values(catalog.bindings).find((binding) => sameReference(binding.source_ref, sourceRef)) ?? null;
}

function expectedEnvelope(sourceId, binding) {
  const catalog = CMV_SOURCE_AUTHORITY_CATALOG[sourceId];
  return {
    schema_version: CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
    source_id: sourceId,
    authority: catalog.authority,
    revision: binding.source_ref.revision_id,
    source_ref: {
      entity_id: binding.source_ref.entity_id,
      revision_id: binding.source_ref.revision_id,
      content_id: binding.source_ref.content_id,
    },
    access_class: binding.access_class,
    direct_access_verified: binding.direct_access_verified,
    classification: binding.classification,
    verdict_eligible: binding.verdict_eligible,
    claim_ceiling: binding.claim_ceiling,
    hold_code: binding.hold_code,
    retrieval_path: binding.retrieval_path,
    applicability_state: binding.applicability_state,
    binding_kind: binding.binding_kind,
  };
}

export function cmvAcceptedSourceBindingInput(sourceId, bindingKind = 'synthetic_direct') {
  const catalog = CMV_SOURCE_AUTHORITY_CATALOG[sourceId] ?? null;
  const binding = catalog?.bindings?.[bindingKind] ?? null;
  if (!binding) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.UNKNOWN_SOURCE, 'source ID or accepted binding kind is not registered');
  }
  return freezeDeep({
    source_id: sourceId,
    source_ref: {
      entity_id: binding.source_ref.entity_id,
      revision_id: binding.source_ref.revision_id,
      content_id: binding.source_ref.content_id,
    },
  });
}

export function classifyCmvSourceEvidence(input) {
  const value = assertPlainObject(input, 'source classification input');
  const keys = Object.keys(value).sort();
  if (keys.length !== REQUEST_FIELDS.length || !keys.every((key, index) => key === REQUEST_FIELDS[index])) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, 'source classification input must contain only source_id and pinned source_ref');
  }
  if (typeof value.source_id !== 'string' || !SAFE_TOKEN.test(value.source_id)) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, 'source_id must be a bounded token');
  }
  const sourceRef = assertReference(value.source_ref, CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT);
  const catalog = CMV_SOURCE_AUTHORITY_CATALOG[value.source_id] ?? null;
  if (!catalog) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.UNKNOWN_SOURCE, 'source_id is not in the closed CMV authority catalog');
  }
  const binding = lookupBinding(value.source_id, sourceRef);
  if (!binding) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.UNACCEPTED_BINDING, 'source_ref is not an accepted source-specific CMV binding');
  }
  return freezeDeep(expectedEnvelope(value.source_id, binding));
}

export function validateConsumedCmvSourceClassification(envelope, { requireDirect = false } = {}) {
  const value = assertPlainObject(envelope, 'consumed source classification', CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID);
  const keys = Object.keys(value).sort();
  if (keys.length !== CONSUMED_FIELDS.length || !keys.every((key, index) => key === CONSUMED_FIELDS[index])) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification has unexpected fields');
  }
  if (value.schema_version !== CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION || typeof value.source_id !== 'string') {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification has an unexpected schema version or source ID');
  }
  const sourceRef = assertReference(value.source_ref, CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID);
  const binding = lookupBinding(value.source_id, sourceRef);
  if (!binding) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification has no accepted source-specific binding');
  }
  const expected = expectedEnvelope(value.source_id, binding);
  if (canonicalizeCalibrationMeasurementValidity(value) !== canonicalizeCalibrationMeasurementValidity(expected)) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification contradicts its accepted binding');
  }
  if (requireDirect && binding.verdict_eligible !== true) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_NOT_DIRECT, 'consumed source classification is not accepted direct official public evidence');
  }
  return freezeDeep(expected);
}

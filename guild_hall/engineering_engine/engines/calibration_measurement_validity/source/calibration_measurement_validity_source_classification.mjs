import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';

export const CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.source_classification.v1';
export const CMV_SOURCE_CLASSIFICATION_CODES = Object.freeze({
  INVALID_INPUT: 'CMV_SOURCE_CLASSIFICATION_INVALID_INPUT',
  FLOATING_REVISION: 'CMV_SOURCE_CLASSIFICATION_FLOATING_REVISION',
  RAG_NOT_VERDICT_AUTHORITY: 'CMV_SOURCE_CLASSIFICATION_RAG_NOT_VERDICT_AUTHORITY',
  CONTROLLED_SOURCE_HOLD: 'CMV_SOURCE_CLASSIFICATION_CONTROLLED_SOURCE_HOLD',
  DIRECT_ACCESS_UNVERIFIED: 'CMV_SOURCE_CLASSIFICATION_DIRECT_ACCESS_UNVERIFIED',
  UNKNOWN_SOURCE: 'CMV_SOURCE_CLASSIFICATION_UNKNOWN_SOURCE',
  AUTHORITY_MISMATCH: 'CMV_SOURCE_CLASSIFICATION_AUTHORITY_MISMATCH',
  CONSUMED_ENVELOPE_INVALID: 'CMV_SOURCE_CLASSIFICATION_CONSUMED_ENVELOPE_INVALID',
  CONSUMED_ENVELOPE_NOT_DIRECT: 'CMV_SOURCE_CLASSIFICATION_CONSUMED_ENVELOPE_NOT_DIRECT',
});

export const CMV_SOURCE_AUTHORITY_CATALOG = Object.freeze({
  'NIST-METROLOGICAL-TRACEABILITY-FAQ': Object.freeze({ authority: 'National Institute of Standards and Technology', class: 'official_public' }),
  'NIST-TN-1297-1994': Object.freeze({ authority: 'National Institute of Standards and Technology', class: 'official_public' }),
  'NIST-RECOMMENDED-CALIBRATION-INTERVAL-2026-05-29': Object.freeze({ authority: 'National Institute of Standards and Technology Calibration Services', class: 'official_public' }),
  'ILAC-G24-2022-PUBLICATION': Object.freeze({ authority: 'International Laboratory Accreditation Cooperation', class: 'official_public' }),
  'ISO-IEC-17025-2017-CITATION-ONLY': Object.freeze({ authority: 'International Organization for Standardization', class: 'controlled_citation_only' }),
});

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/u;
const FLOATING = new Set(['latest', 'current', 'head', 'main', 'master', 'unversioned']);
const CONSUMED_FIELDS = Object.freeze([
  'access_class', 'applicability_state', 'authority', 'claim_ceiling', 'classification', 'direct_access_verified', 'hold_code',
  'retrieval_path', 'revision', 'schema_version', 'source_id', 'source_ref', 'verdict_eligible',
]);
const UNSAFE_STRING_PATTERNS = Object.freeze([
  /^[A-Za-z]:[\\/]/u,
  /^\\\\/u,
  /^\/(?:etc|home|root|tmp|var|usr)(?:\/|$)/u,
  /(?:^|[_-])(password|secret|api[_-]?key|bearer[_-]?token)(?:$|[_-])/iu,
]);

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
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, `${label} must be a plain object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true
        || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, `${label} carries unsafe properties`);
    }
  }
  return value;
}

function assertReference(value, label) {
  assertPlainObject(value, label);
  if (!SAFE_TOKEN.test(value.entity_id ?? '') || !SAFE_TOKEN.test(value.revision_id ?? '')
      || !SHA256_REF.test(value.content_id ?? '')) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, `${label} must be an immutable typed reference`);
  }
  return Object.freeze({
    entity_id: value.entity_id,
    revision_id: value.revision_id,
    content_id: value.content_id,
  });
}

function assertSourceId(value) {
  if (typeof value !== 'string' || !SAFE_TOKEN.test(value)) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, 'source_id must be a bounded token');
  }
  return value;
}

function isOfficialPublicAccess(accessClass) {
  return typeof accessClass === 'string' && /^official_public(?:_|$)/u.test(accessClass);
}

function assertConsumedString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256
      || UNSAFE_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, `${label} is not safe consumed source metadata`);
  }
  return value;
}

function assertConsumedReference(value) {
  assertPlainObject(value, 'consumed source_ref');
  const keys = Object.keys(value).sort();
  const expected = ['content_id', 'entity_id', 'revision_id'];
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])
      || !SAFE_TOKEN.test(value.entity_id ?? '') || !SAFE_TOKEN.test(value.revision_id ?? '')
      || !SHA256_REF.test(value.content_id ?? '')) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source_ref is not an exact immutable reference');
  }
  return { entity_id: value.entity_id, revision_id: value.revision_id, content_id: value.content_id };
}

export function validateConsumedCmvSourceClassification(envelope, { requireDirect = false } = {}) {
  const value = assertPlainObject(envelope, 'consumed source classification');
  const keys = Object.keys(value).sort();
  if (keys.length !== CONSUMED_FIELDS.length || !keys.every((key, index) => key === CONSUMED_FIELDS[index])) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification has unexpected fields');
  }
  if (value.schema_version !== CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification has an unexpected schema version');
  }
  const sourceId = assertSourceId(value.source_id);
  const catalog = CMV_SOURCE_AUTHORITY_CATALOG[sourceId] ?? null;
  if (catalog === null || catalog.authority !== value.authority) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification is not in the closed authority catalog');
  }
  assertConsumedString(value.authority, 'authority');
  const revision = assertConsumedString(value.revision, 'revision');
  if (FLOATING.has(revision.trim().toLowerCase())) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification has a floating revision');
  }
  const sourceRef = assertConsumedReference(value.source_ref);
  const direct = value.classification === 'official_public_direct'
    && catalog.class === 'official_public'
    && isOfficialPublicAccess(value.access_class)
    && value.retrieval_path === 'direct'
    && value.applicability_state === 'in_scope'
    && value.direct_access_verified === true
    && value.verdict_eligible === true
    && value.claim_ceiling === 'source_supported'
    && value.hold_code === null;
  const rag = value.classification === 'rag_retrieval_only'
    && catalog.class === 'official_public'
    && isOfficialPublicAccess(value.access_class)
    && value.retrieval_path === 'rag'
    && value.direct_access_verified === false
    && value.verdict_eligible === false
    && value.claim_ceiling === 'observed'
    && value.hold_code === CMV_SOURCE_CLASSIFICATION_CODES.RAG_NOT_VERDICT_AUTHORITY;
  const controlled = value.classification === 'controlled_citation_only'
    && catalog.class === 'controlled_citation_only'
    && value.access_class === 'controlled_citation_only'
    && value.verdict_eligible === false
    && value.claim_ceiling === 'observed'
    && value.hold_code === CMV_SOURCE_CLASSIFICATION_CODES.CONTROLLED_SOURCE_HOLD;
  const directHold = value.classification === 'direct_access_hold'
    && catalog.class === 'official_public'
    && isOfficialPublicAccess(value.access_class)
    && value.verdict_eligible === false
    && value.claim_ceiling === 'observed'
    && value.hold_code === CMV_SOURCE_CLASSIFICATION_CODES.DIRECT_ACCESS_UNVERIFIED;
  if (!direct && !rag && !controlled && !directHold) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_INVALID, 'consumed source classification is contradictory or unrecognized');
  }
  if (requireDirect && !direct) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.CONSUMED_ENVELOPE_NOT_DIRECT, 'consumed source classification is not exact direct official public evidence');
  }
  return freezeDeep({
    schema_version: value.schema_version,
    source_id: sourceId,
    authority: value.authority,
    revision,
    source_ref: sourceRef,
    access_class: value.access_class,
    direct_access_verified: value.direct_access_verified,
    classification: value.classification,
    verdict_eligible: value.verdict_eligible,
    claim_ceiling: value.claim_ceiling,
    hold_code: value.hold_code,
    retrieval_path: value.retrieval_path,
    applicability_state: value.applicability_state,
  });
}

export function classifyCmvSourceEvidence(input) {
  const value = assertPlainObject(input, 'source classification input');
  const sourceId = assertSourceId(value.source_id);
  if (typeof value.authority !== 'string' || value.authority.length === 0 || value.authority.length > 256
      || typeof value.revision !== 'string' || value.revision.length === 0 || value.revision.length > 256) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, 'authority and revision are required bounded strings');
  }
  if (FLOATING.has(value.revision.trim().toLowerCase())) {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.FLOATING_REVISION, 'floating source revision is not source-bound evidence');
  }
  if (typeof value.access_class !== 'string' || typeof value.retrieval_path !== 'string'
      || typeof value.applicability_state !== 'string' || typeof value.direct_access_verified !== 'boolean') {
    refuse(CMV_SOURCE_CLASSIFICATION_CODES.INVALID_INPUT, 'source classification fields are malformed');
  }
  const sourceRef = assertReference(value.source_ref, 'source_ref');
  const catalog = CMV_SOURCE_AUTHORITY_CATALOG[sourceId] ?? null;

  if (catalog === null) {
    return freezeDeep({
      schema_version: CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
      source_id: sourceId,
      authority: value.authority,
      revision: value.revision,
      source_ref: sourceRef,
      access_class: value.access_class,
      direct_access_verified: value.direct_access_verified,
      classification: 'unknown_source_hold',
      verdict_eligible: false,
      claim_ceiling: 'observed',
      hold_code: CMV_SOURCE_CLASSIFICATION_CODES.UNKNOWN_SOURCE,
      retrieval_path: value.retrieval_path,
      applicability_state: value.applicability_state,
    });
  }
  if (catalog.authority !== value.authority) {
    return freezeDeep({
      schema_version: CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
      source_id: sourceId,
      authority: value.authority,
      revision: value.revision,
      source_ref: sourceRef,
      access_class: value.access_class,
      direct_access_verified: value.direct_access_verified,
      classification: 'authority_mismatch_hold',
      verdict_eligible: false,
      claim_ceiling: 'observed',
      hold_code: CMV_SOURCE_CLASSIFICATION_CODES.AUTHORITY_MISMATCH,
      retrieval_path: value.retrieval_path,
      applicability_state: value.applicability_state,
    });
  }

  if (value.access_class === 'controlled_citation_only' || catalog?.class === 'controlled_citation_only') {
    return freezeDeep({
      schema_version: CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
      source_id: sourceId,
      authority: value.authority,
      revision: value.revision,
      source_ref: sourceRef,
      access_class: value.access_class,
      direct_access_verified: value.direct_access_verified,
      classification: 'controlled_citation_only',
      verdict_eligible: false,
      claim_ceiling: 'observed',
      hold_code: CMV_SOURCE_CLASSIFICATION_CODES.CONTROLLED_SOURCE_HOLD,
      retrieval_path: value.retrieval_path,
      applicability_state: value.applicability_state,
    });
  }

  if (value.retrieval_path === 'rag') {
    return freezeDeep({
      schema_version: CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
      source_id: sourceId,
      authority: value.authority,
      revision: value.revision,
      source_ref: sourceRef,
      access_class: value.access_class,
      direct_access_verified: value.direct_access_verified,
      classification: 'rag_retrieval_only',
      verdict_eligible: false,
      claim_ceiling: 'observed',
      hold_code: CMV_SOURCE_CLASSIFICATION_CODES.RAG_NOT_VERDICT_AUTHORITY,
      retrieval_path: 'rag',
      applicability_state: value.applicability_state,
    });
  }

  if (value.retrieval_path !== 'direct' || !isOfficialPublicAccess(value.access_class)
      || value.direct_access_verified !== true || value.applicability_state !== 'in_scope') {
    return freezeDeep({
      schema_version: CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
      source_id: sourceId,
      authority: value.authority,
      revision: value.revision,
      source_ref: sourceRef,
      access_class: value.access_class,
      direct_access_verified: value.direct_access_verified,
      classification: 'direct_access_hold',
      verdict_eligible: false,
      claim_ceiling: 'observed',
      hold_code: CMV_SOURCE_CLASSIFICATION_CODES.DIRECT_ACCESS_UNVERIFIED,
      retrieval_path: value.retrieval_path,
      applicability_state: value.applicability_state,
    });
  }

  return freezeDeep({
    schema_version: CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
    source_id: sourceId,
    authority: value.authority,
    revision: value.revision,
    source_ref: sourceRef,
    access_class: value.access_class,
    direct_access_verified: value.direct_access_verified,
    classification: 'official_public_direct',
    verdict_eligible: true,
    claim_ceiling: 'source_supported',
    hold_code: null,
    retrieval_path: 'direct',
    applicability_state: 'in_scope',
  });
}

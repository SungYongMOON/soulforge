import { createHash } from 'node:crypto';
import types from 'node:util/types';

import { ContractError } from '../../../core/validators/errors.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import {
  CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION,
  validateConsumedCmvSourceClassification,
} from '../source/calibration_measurement_validity_source_classification.mjs';
import { calibrationMeasurementValiditySha256 } from '../shared/calibration_measurement_validity_canonical_digest.mjs';

export const CMV_SOURCE_BOUND_PROFILE_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.source_bound_profile.v1';
export const CMV_SOURCE_BOUND_PROFILE_CODES = Object.freeze({
  PROFILE_BINDING_INVALID: 'CMV_PROFILE_BINDING_INVALID',
  OPERATION_UNSUPPORTED: 'CMV_PROFILE_OPERATION_UNSUPPORTED',
  OPERATION_INVALID: 'CMV_PROFILE_OPERATION_INVALID',
  SOURCE_HOLD: 'CMV_PROFILE_SOURCE_HOLD',
});

const REQUIREMENT_ID = /^cmv-[a-z0-9][a-z0-9_-]{1,80}$/u;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

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
    refuse(CMV_SOURCE_BOUND_PROFILE_CODES.OPERATION_INVALID, `${label} must be a plain object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true
        || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      refuse(CMV_SOURCE_BOUND_PROFILE_CODES.OPERATION_INVALID, `${label} contains unsafe properties`);
    }
  }
  return value;
}

export function compileCmvSourceBoundProfileRequirements(profileBindings = []) {
  if (!Array.isArray(profileBindings)) {
    refuse(CMV_SOURCE_BOUND_PROFILE_CODES.PROFILE_BINDING_INVALID, 'profile bindings must be an array');
  }
  const requirements = [];
  const provenance = {};
  const seen = new Set();

  for (const binding of profileBindings) {
    assertPlainObject(binding, 'profile binding');
    if (binding.domain_engine_id !== 'calibration_measurement_validity'
        || !['organization', 'project'].includes(binding.profile_kind)
        || typeof binding.profile_id !== 'string'
        || typeof binding.revision_or_hash !== 'string'
        || typeof binding.extends_or_base_pin !== 'string'
        || typeof binding.operation_digest !== 'string'
        || !/^[a-f0-9]{64}$/u.test(binding.operation_digest)
        || !Number.isInteger(binding.order) || binding.order < 0
        || !Array.isArray(binding.source_refs)
        || !Array.isArray(binding.operations)) {
      refuse(CMV_SOURCE_BOUND_PROFILE_CODES.PROFILE_BINDING_INVALID, 'profile binding does not preserve the Core provenance contract');
    }
    const normalizedOperations = normalizeProfileOperations(binding.operations);
    if (normalizedOperations.operation_digest !== binding.operation_digest) {
      refuse(CMV_SOURCE_BOUND_PROFILE_CODES.PROFILE_BINDING_INVALID, 'profile operation_digest does not match the Core canonical operation material');
    }
    for (const operation of normalizedOperations.operations) {
      assertPlainObject(operation, 'profile operation');
      if (operation.op !== 'source_bound_requirements') {
        refuse(CMV_SOURCE_BOUND_PROFILE_CODES.OPERATION_UNSUPPORTED, 'CMV profiles support only source_bound_requirements operations');
      }
      const keys = Object.keys(operation).sort();
      const expected = ['op', 'required_classification', 'required_source_ids', 'requirement_id'];
      if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
        refuse(CMV_SOURCE_BOUND_PROFILE_CODES.OPERATION_INVALID, 'source-bound requirement has an unexpected shape');
      }
      if (typeof operation.requirement_id !== 'string' || !REQUIREMENT_ID.test(operation.requirement_id)
          || operation.required_classification !== 'official_public_direct'
          || !Array.isArray(operation.required_source_ids) || operation.required_source_ids.length === 0) {
        refuse(CMV_SOURCE_BOUND_PROFILE_CODES.OPERATION_INVALID, 'source-bound requirement fields are invalid');
      }
      const sourceIds = [...operation.required_source_ids];
      if (sourceIds.some((sourceId) => typeof sourceId !== 'string' || !SOURCE_ID.test(sourceId))
          || sourceIds.some((sourceId, index) => index > 0 && sourceIds[index - 1] >= sourceId)
          || seen.has(operation.requirement_id)) {
        refuse(CMV_SOURCE_BOUND_PROFILE_CODES.OPERATION_INVALID, 'source-bound requirement IDs and source IDs must be sorted and unique');
      }
      for (const sourceId of sourceIds) {
        if (!binding.source_refs.includes(`source:${sourceId}`)) {
          refuse(CMV_SOURCE_BOUND_PROFILE_CODES.OPERATION_INVALID, 'profile source_refs must bind every source-bound requirement source');
        }
      }
      seen.add(operation.requirement_id);
      const requirement = {
        requirement_id: operation.requirement_id,
        required_source_ids: sourceIds,
        required_classification: operation.required_classification,
        profile_kind: binding.profile_kind,
        profile_id: binding.profile_id,
        revision_or_hash: binding.revision_or_hash,
        extends_or_base_pin: binding.extends_or_base_pin,
        operation_digest: binding.operation_digest,
        source_refs: [...binding.source_refs],
        order: binding.order,
      };
      requirements.push(requirement);
      provenance[requirement.requirement_id] = {
        profile_kind: requirement.profile_kind,
        profile_id: requirement.profile_id,
        revision_or_hash: requirement.revision_or_hash,
        extends_or_base_pin: requirement.extends_or_base_pin,
        operation_digest: requirement.operation_digest,
        operation_item_digest: `sha256:${calibrationMeasurementValiditySha256(operation)}`,
        source_refs: [...requirement.source_refs],
        order: requirement.order,
      };
    }
  }
  requirements.sort((left, right) => (left.requirement_id < right.requirement_id ? -1 : (left.requirement_id > right.requirement_id ? 1 : 0)));
  return freezeDeep({ requirements, provenance });
}

export function evaluateCmvSourceBoundProfileRequirements(requirements = [], sourceClassifications = []) {
  if (!Array.isArray(requirements) || !Array.isArray(sourceClassifications)) {
    refuse(CMV_SOURCE_BOUND_PROFILE_CODES.PROFILE_BINDING_INVALID, 'requirements and source classifications must be arrays');
  }
  if (requirements.length === 0) {
    return freezeDeep({
      schema_version: CMV_SOURCE_BOUND_PROFILE_SCHEMA_VERSION,
      status: 'not_applicable',
      claim_ceiling: 'observed',
      requirements: [],
      hold_codes: [],
    });
  }
  const bySourceId = new Map();
  for (const source of sourceClassifications) {
    try {
      const canonicalSource = validateConsumedCmvSourceClassification(source);
      if (canonicalSource.schema_version === CMV_SOURCE_CLASSIFICATION_SCHEMA_VERSION) {
        bySourceId.set(canonicalSource.source_id, canonicalSource);
      }
    } catch {
      // A forged or unknown envelope is intentionally absent from the source-bound lookup and
      // therefore yields a deterministic Profile hold rather than a false source-supported pass.
    }
  }
  const evaluated = [];
  const holdCodes = new Set();
  for (const requirement of requirements) {
    const sources = requirement.required_source_ids.map((sourceId) => bySourceId.get(sourceId) ?? null);
    const met = sources.every((source) => source?.classification === requirement.required_classification
      && source.verdict_eligible === true);
    if (!met) holdCodes.add(CMV_SOURCE_BOUND_PROFILE_CODES.SOURCE_HOLD);
    evaluated.push({
      requirement_id: requirement.requirement_id,
      status: met ? 'supported' : 'hold',
      required_source_ids: [...requirement.required_source_ids],
      required_classification: requirement.required_classification,
      profile_id: requirement.profile_id,
    });
  }
  return freezeDeep({
    schema_version: CMV_SOURCE_BOUND_PROFILE_SCHEMA_VERSION,
    status: holdCodes.size === 0 ? 'supported' : 'hold',
    claim_ceiling: holdCodes.size === 0 ? 'source_supported' : 'observed',
    requirements: evaluated,
    hold_codes: [...holdCodes].sort(),
  });
}

export function applyCmvSourceBoundProfileEvaluation(result, profileEvaluation, rulesetRef = null) {
  if (!profileEvaluation || profileEvaluation.status === 'not_applicable') return result;
  const assessment = structuredClone(result.assessment);
  assessment.profile_evaluation = profileEvaluation;
  if (profileEvaluation.status === 'hold') {
    assessment.result_status = 'unknown';
    assessment.result_impact = 'hold';
    assessment.claim_ceiling = profileEvaluation.claim_ceiling;
    assessment.determinations.push({
      criterion_id: 'CMV-SOURCE-BOUND-PROFILE-01',
      status: 'unknown',
      reason_code: 'source_bound_profile_hold',
      source_refs: profileEvaluation.requirements.flatMap((requirement) => requirement.required_source_ids).sort(),
    });
  }
  const receipt = structuredClone(result.receipt);
  if (rulesetRef !== null) {
    receipt.ruleset_ref = {
      entity_id: rulesetRef.entity_id,
      revision_id: rulesetRef.revision_id,
      content_id: rulesetRef.content_id,
    };
  }
  receipt.profile_evaluation = {
    schema_version: profileEvaluation.schema_version,
    status: profileEvaluation.status,
    digest: `sha256:${calibrationMeasurementValiditySha256(profileEvaluation)}`,
  };
  receipt.assessment_sha256 = calibrationMeasurementValiditySha256(assessment);
  receipt.replay_digest = createHash('sha256').update(
    `cmv-profile-v1\n${receipt.input_sha256}\n${receipt.ruleset_ref.content_id}\n${receipt.profile_evaluation.digest}`,
  ).digest('hex');
  return freezeDeep({ assessment, receipt });
}

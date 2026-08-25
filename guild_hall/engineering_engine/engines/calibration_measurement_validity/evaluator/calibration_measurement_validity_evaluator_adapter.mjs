import {
  arrayOrderRules,
  registerDomainEngineAdapter,
  withoutNulls,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import { canonicalizeCalibrationMeasurementValidity } from '../shared/calibration_measurement_validity_canonical_digest.mjs';
import {
  CALIBRATION_MEASUREMENT_VALIDITY_RULES,
  CMV_RULESET_REF,
  CMV_RULESET_SCHEMA_VERSION,
  CMV_SOURCE_PACKET_REF,
} from '../rules/calibration_measurement_validity_rules.mjs';
import {
  calibrationMeasurementValidityCompilerAdapter,
  deriveCalibrationMeasurementValidityRulesetReference,
} from '../compiler/calibration_measurement_validity_compiler_adapter.mjs';
import { assessCalibrationMeasurementValidity, CMV_ERROR_CODES } from './calibration_measurement_validity.mjs';
import {
  applyCmvSourceBoundProfileEvaluation,
  evaluateCmvSourceBoundProfileRequirements,
} from '../profile/calibration_measurement_validity_source_bound_profile.mjs';
import { validateAdaptedCalibrationMeasurementValidityTypedFacts } from '../typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs';

export const CMV_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.evaluator.v0';

function sameReference(left, right) {
  return Boolean(left && right
    && left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id);
}

function validateSourceBoundRequirements(requirements, provenance) {
  if (!Array.isArray(requirements) || !provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile requirements and provenance must be present');
  }
  const expectedKeys = ['extends_or_base_pin', 'operation_digest', 'order', 'profile_id', 'profile_kind', 'required_classification', 'required_source_ids', 'requirement_id', 'revision_or_hash', 'source_refs'];
  const seen = new Set();
  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile requirement must be an object');
    }
    const keys = Object.keys(requirement).sort();
    if (keys.length !== expectedKeys.length || !keys.every((key, index) => key === expectedKeys[index])
        || typeof requirement.requirement_id !== 'string' || seen.has(requirement.requirement_id)
        || requirement.required_classification !== 'official_public_direct'
        || !Array.isArray(requirement.required_source_ids) || requirement.required_source_ids.length === 0
        || !Array.isArray(requirement.source_refs) || requirement.source_refs.length === 0
        || !['organization', 'project'].includes(requirement.profile_kind)
        || !Number.isInteger(requirement.order) || requirement.order < 0
        || typeof requirement.operation_digest !== 'string' || !/^[a-f0-9]{64}$/u.test(requirement.operation_digest)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile requirement has an invalid effective-ruleset shape');
    }
    if (!Object.hasOwn(provenance, requirement.requirement_id)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile requirement has no preserved provenance');
    }
    if (requirement.required_source_ids.some((sourceId) => !requirement.source_refs.includes(`source:${sourceId}`))) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile requirement sources are not covered by its own source_refs');
    }
    const provenanceRow = provenance[requirement.requirement_id];
    if (!provenanceRow || provenanceRow.profile_kind !== requirement.profile_kind
        || provenanceRow.profile_id !== requirement.profile_id
        || provenanceRow.revision_or_hash !== requirement.revision_or_hash
        || provenanceRow.extends_or_base_pin !== requirement.extends_or_base_pin
        || provenanceRow.operation_digest !== requirement.operation_digest
        || provenanceRow.order !== requirement.order
        || canonicalizeCalibrationMeasurementValidity(provenanceRow.source_refs) !== canonicalizeCalibrationMeasurementValidity(requirement.source_refs)
        || typeof provenanceRow.operation_item_digest !== 'string'
        || !/^sha256:[a-f0-9]{64}$/u.test(provenanceRow.operation_item_digest)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile provenance does not match the effective requirement');
    }
    seen.add(requirement.requirement_id);
  }
  if (Object.keys(provenance).length !== requirements.length) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile provenance count does not match requirements');
  }
}

function validateCoreAssemblyEnvelope(outer, ruleSet, requirements) {
  if (!outer || typeof outer !== 'object' || outer.schema_version !== 'soulforge.effective_rule_set.v0'
      || outer.domain_engine_id !== 'calibration_measurement_validity'
      || outer.effective_rule_set !== ruleSet || !outer.compilation_trace || typeof outer.compilation_trace !== 'object') {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'derived CMV evaluation requires the complete Core assembly envelope');
  }
  const trace = outer.compilation_trace;
  const cleanRules = withoutNulls(ruleSet);
  const expectedDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(cleanRules, arrayOrderRules(cleanRules))}`);
  if (outer.assembly_digest !== expectedDigest || trace.effective_ruleset_digest !== expectedDigest
      || trace.domain_engine_id !== 'calibration_measurement_validity'
      || trace.domain_adapter_revision !== calibrationMeasurementValidityCompilerAdapter.revision
      || trace.rule_count !== ruleSet.rule_count
      || !Array.isArray(trace.profiles)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core assembly digest, adapter revision, or rule count is stale');
  }
  for (const requirement of requirements) {
    const profile = trace.profiles.find((candidate) => candidate.profile_kind === requirement.profile_kind
      && candidate.profile_id === requirement.profile_id);
    if (!profile || profile.domain_engine_id !== 'calibration_measurement_validity'
        || profile.revision_or_hash !== requirement.revision_or_hash
        || profile.extends_or_base_pin !== requirement.extends_or_base_pin
        || profile.operation_digest !== requirement.operation_digest
        || profile.order !== requirement.order
        || canonicalizeCalibrationMeasurementValidity(profile.source_refs) !== canonicalizeCalibrationMeasurementValidity(requirement.source_refs)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core Profile trace does not match the derived CMV requirement');
    }
  }
  for (const kind of ['organization', 'project']) {
    const profile = trace.profiles.find((candidate) => candidate.profile_kind === kind) ?? null;
    const summary = kind === 'organization' ? trace.organization_trace : trace.project_trace;
    if ((profile === null) !== (summary === null)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core Profile summary trace is inconsistent');
    }
    if (profile && (summary.profile_id !== profile.profile_id || summary.operation_digest !== profile.operation_digest)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core Profile summary trace is stale');
    }
  }
}

function verifyBaseRuleset(effectiveRuleSet) {
  if (!effectiveRuleSet || typeof effectiveRuleSet !== 'object' || Array.isArray(effectiveRuleSet)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'effective rule set must be an object');
  }
  const outer = effectiveRuleSet.effective_rule_set ? effectiveRuleSet : null;
  const ruleSet = outer ? outer.effective_rule_set : effectiveRuleSet;
  if (!ruleSet || typeof ruleSet !== 'object' || Array.isArray(ruleSet)
      || ruleSet.schema_version !== CMV_RULESET_SCHEMA_VERSION
      || ruleSet.domain_engine_id !== 'calibration_measurement_validity'
      || !sameReference(ruleSet.source_packet_ref, CMV_SOURCE_PACKET_REF)
      || !Array.isArray(ruleSet.rules)
      || ruleSet.rules.length !== CALIBRATION_MEASUREMENT_VALIDITY_RULES.length) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'effective rule set is not the CMV v0 base ruleset');
  }
  const baseRuleset = sameReference(ruleSet.ruleset_ref, CMV_RULESET_REF);
  const derivedRuleset = ruleSet.ruleset_ref?.entity_id === 'ruleset:calibration_measurement_validity:derived'
    && typeof ruleSet.ruleset_ref?.revision_id === 'string'
    && /^sha256:[a-f0-9]{64}$/u.test(ruleSet.ruleset_ref?.content_id ?? '');
  if (!baseRuleset && !derivedRuleset) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'ruleset reference is neither the CMV base nor a CMV source-bound derived ruleset');
  }
  for (let index = 0; index < CALIBRATION_MEASUREMENT_VALIDITY_RULES.length; index += 1) {
    if (canonicalizeCalibrationMeasurementValidity(ruleSet.rules[index])
        !== canonicalizeCalibrationMeasurementValidity(CALIBRATION_MEASUREMENT_VALIDITY_RULES[index])) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `CMV rule mismatch at index ${index}`);
    }
  }
  const requirements = ruleSet.source_bound_profile_requirements ?? [];
  if (!Array.isArray(requirements) || (baseRuleset && requirements.length !== 0)
      || (derivedRuleset && requirements.length === 0)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound profile requirements do not match the CMV ruleset reference');
  }
  if (derivedRuleset) {
    validateSourceBoundRequirements(requirements, ruleSet.profile_rule_provenance);
    const expectedDerivedReference = deriveCalibrationMeasurementValidityRulesetReference(requirements, ruleSet.profile_rule_provenance);
    if (!sameReference(ruleSet.ruleset_ref, expectedDerivedReference)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'derived CMV ruleset reference does not bind the requirements presented for evaluation');
    }
    validateCoreAssemblyEnvelope(outer, ruleSet, requirements);
  }
  return { requirements, ruleset_ref: ruleSet.ruleset_ref };
}

export const calibrationMeasurementValidityAdapter = Object.freeze({
  ...calibrationMeasurementValidityCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts) {
    const verified = verifyBaseRuleset(effectiveRuleSet);
    let envelope;
    if (verified.requirements.length > 0) {
      try {
        envelope = validateAdaptedCalibrationMeasurementValidityTypedFacts(typedProjectFacts);
      } catch {
        throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'derived CMV evaluation requires validated Typed Facts v1 rather than raw evidence');
      }
    } else {
      envelope = typedProjectFacts?.request ? typedProjectFacts : { request: typedProjectFacts, source_classifications: [] };
    }
    const baseResult = assessCalibrationMeasurementValidity(envelope.request);
    const profileEvaluation = evaluateCmvSourceBoundProfileRequirements(verified.requirements, envelope.source_classifications ?? []);
    return applyCmvSourceBoundProfileEvaluation(baseResult, profileEvaluation,
      verified.requirements.length > 0 ? verified.ruleset_ref : null);
  },
});

registerDomainEngineAdapter('calibration_measurement_validity', calibrationMeasurementValidityAdapter);

import types from 'node:util/types';

import {
  COMPILATION_TRACE_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  arrayOrderRules,
  registerDomainEngineAdapter,
  withoutNulls,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import { AUTHORITY_FAMILIES } from '../../../core/validators/authority.mjs';
import { canonicalise, compareCodePoints, inspectInstant } from '../../../core/validators/canonical.mjs';
import { ContractError } from '../../../core/validators/errors.mjs';
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
import {
  CMV_TYPED_FACTS_SCHEMA_VERSION,
  validateAdaptedCalibrationMeasurementValidityTypedFacts,
} from '../typed_facts/calibration_measurement_validity_typed_facts_adapter.mjs';
import { snapshotCalibrationMeasurementValidityPlainData } from '../shared/calibration_measurement_validity_safe_snapshot.mjs';

export const CMV_EVALUATOR_ADAPTER_SCHEMA_VERSION = 'soulforge.calibration_measurement_validity.evaluator.v0';

const TYPED_FACTS_SCHEMA = 'soulforge.typed_project_facts.v0';
const PROJECT_BINDING_SCHEMA = 'soulforge.project_binding.v0';
const TYPED_FACTS_FIELDS = Object.freeze([
  'facts', 'facts_digest', 'known_at', 'project_binding_ref', 'schema_version', 'valid_at',
]);
const PROJECT_BINDING_REQUIRED_FIELDS = Object.freeze([
  'binding_revision_hash', 'domain_engine_id', 'project_id', 'schema_version', 'source_manifest_ref',
]);
const PROJECT_BINDING_OPTIONAL_FIELDS = Object.freeze([
  'authority_family', 'document_refs', 'known_at', 'valid_at',
]);
const AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((family) => family.key));

const CORE_ASSEMBLY_KEYS = Object.freeze([
  'assembly_digest', 'compilation_trace', 'domain_engine_id', 'effective_rule_set', 'rule_count', 'schema_version',
]);
const CORE_TRACE_KEYS = Object.freeze([
  'compilation_scope', 'domain_adapter_revision', 'domain_engine_id', 'effective_ruleset_digest',
  'organization_trace', 'profiles', 'project_trace', 'rule_count', 'schema_version',
]);
const CORE_PROFILE_TRACE_KEYS = Object.freeze([
  'applied_operations_count', 'domain_engine_id', 'extends_or_base_pin', 'operation_digest', 'order',
  'profile_id', 'profile_kind', 'revision_or_hash', 'source_refs',
]);
const CORE_PROFILE_SUMMARY_KEYS = Object.freeze([
  'applied_operations_count', 'domain_engine_id', 'extends_or_base_pin', 'operation_digest',
  'profile_id', 'revision_or_hash', 'source_refs',
]);
const REFERENCE_KEYS = Object.freeze(['content_id', 'entity_id', 'revision_id']);
const PROFILE_PROVENANCE_KEYS = Object.freeze([
  'extends_or_base_pin', 'operation_digest', 'operation_index', 'operation_item_digest', 'order', 'profile_id',
  'profile_kind', 'revision_or_hash', 'source_refs',
]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const FORBIDDEN_STRING = /(?:^[A-Za-z]:[\\/]|^\\\\|^\/(?:etc|var|usr|home|root|tmp)\/|secret|password|bearer|api[_-]?key|token)/iu;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/#-]{0,255}$/u;

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function sameReference(left, right) {
  return hasExactKeys(left, REFERENCE_KEYS) && hasExactKeys(right, REFERENCE_KEYS)
    && typeof left.entity_id === 'string' && left.entity_id.length > 0
    && typeof left.revision_id === 'string' && left.revision_id.length > 0
    && typeof right.entity_id === 'string' && right.entity_id.length > 0
    && typeof right.revision_id === 'string' && right.revision_id.length > 0
    && /^sha256:[a-f0-9]{64}$/u.test(left.content_id)
    && /^sha256:[a-f0-9]{64}$/u.test(right.content_id)
    && left.entity_id === right.entity_id
    && left.revision_id === right.revision_id
    && left.content_id === right.content_id;
}

function assertSafeToken(value, label) {
  if (typeof value !== 'string' || !SAFE_TOKEN.test(value) || FORBIDDEN_STRING.test(value)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `${label} must be a bounded safe token`);
  }
  return value;
}

function validateSourceBoundRequirements(requirements, provenance) {
  if (!Array.isArray(requirements) || !provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound Profile requirements and provenance must be present');
  }
  const expectedKeys = [
    'extends_or_base_pin', 'operation_digest', 'operation_index', 'order', 'profile_id', 'profile_kind',
    'required_classification', 'required_source_ids', 'requirement_id', 'revision_or_hash', 'source_refs',
  ];
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
        || !Number.isInteger(requirement.operation_index) || requirement.operation_index < 0
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
    if (!hasExactKeys(provenanceRow, PROFILE_PROVENANCE_KEYS)
        || provenanceRow.profile_kind !== requirement.profile_kind
        || provenanceRow.profile_id !== requirement.profile_id
        || provenanceRow.revision_or_hash !== requirement.revision_or_hash
        || provenanceRow.extends_or_base_pin !== requirement.extends_or_base_pin
        || provenanceRow.operation_digest !== requirement.operation_digest
        || provenanceRow.order !== requirement.order
        || provenanceRow.operation_index !== requirement.operation_index
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

function validateCoreProfileTrace(profile) {
  if (!hasExactKeys(profile, CORE_PROFILE_TRACE_KEYS)
      || !['organization', 'project'].includes(profile.profile_kind)
      || typeof profile.profile_id !== 'string' || profile.profile_id.length === 0
      || profile.domain_engine_id !== 'calibration_measurement_validity'
      || typeof profile.revision_or_hash !== 'string' || profile.revision_or_hash.length === 0
      || typeof profile.extends_or_base_pin !== 'string' || profile.extends_or_base_pin.length === 0
      || typeof profile.operation_digest !== 'string' || !SHA256_HEX.test(profile.operation_digest)
      || !Number.isInteger(profile.order) || profile.order < 0
      || !Number.isInteger(profile.applied_operations_count) || profile.applied_operations_count < 0
      || !Array.isArray(profile.source_refs) || profile.source_refs.length === 0
      || profile.source_refs.some((sourceRef) => typeof sourceRef !== 'string' || sourceRef.length === 0)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core Profile trace has an unsafe or incomplete shape');
  }
}

function validateCoreProfileSummary(summary, profile) {
  if (summary === null) {
    if (profile !== null) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core Profile summary is absent for an applied Profile trace');
    }
    return;
  }
  if (!hasExactKeys(summary, CORE_PROFILE_SUMMARY_KEYS) || profile === null
      || summary.profile_id !== profile.profile_id
      || summary.domain_engine_id !== profile.domain_engine_id
      || summary.revision_or_hash !== profile.revision_or_hash
      || summary.extends_or_base_pin !== profile.extends_or_base_pin
      || summary.operation_digest !== profile.operation_digest
      || summary.applied_operations_count !== profile.applied_operations_count
      || canonicalizeCalibrationMeasurementValidity(summary.source_refs)
        !== canonicalizeCalibrationMeasurementValidity(profile.source_refs)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core Profile summary trace is stale or substituted');
  }
}

function validateCoreAssemblyEnvelope(outer, ruleSet, requirements) {
  if (!hasExactKeys(outer, CORE_ASSEMBLY_KEYS) || outer.schema_version !== EFFECTIVE_RULE_SET_SCHEMA_VERSION
      || outer.domain_engine_id !== 'calibration_measurement_validity'
      || outer.effective_rule_set !== ruleSet || !hasExactKeys(outer.compilation_trace, CORE_TRACE_KEYS)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'derived CMV evaluation requires the complete Core assembly envelope');
  }
  const trace = outer.compilation_trace;
  if (trace.schema_version !== COMPILATION_TRACE_SCHEMA_VERSION
      || trace.domain_engine_id !== 'calibration_measurement_validity'
      || trace.domain_adapter_revision !== calibrationMeasurementValidityCompilerAdapter.revision
      || !trace.compilation_scope || typeof trace.compilation_scope !== 'object' || Array.isArray(trace.compilation_scope)
      || (Object.getPrototypeOf(trace.compilation_scope) !== Object.prototype && Object.getPrototypeOf(trace.compilation_scope) !== null)
      || types.isProxy(trace.compilation_scope)
      || Object.keys(trace.compilation_scope).length !== 0
      || !Number.isInteger(trace.rule_count) || trace.rule_count < 0
      || !Array.isArray(trace.profiles) || trace.profiles.length > 2) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core compilation trace has an unsafe or incomplete shape');
  }
  const profileByKind = new Map();
  for (let index = 0; index < trace.profiles.length; index += 1) {
    const profile = trace.profiles[index];
    validateCoreProfileTrace(profile);
    if (profile.order !== index || profileByKind.has(profile.profile_kind)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'Core Profile trace ordering or uniqueness is invalid');
    }
    if (trace.profiles.length === 2 && index === 0 && profile.profile_kind !== 'organization') {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'profile sequence in compilation trace must be organization then project');
    }
    if (trace.profiles.length === 2 && index === 1 && profile.profile_kind !== 'project') {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'profile sequence in compilation trace must be organization then project');
    }
    profileByKind.set(profile.profile_kind, profile);

    const profileReqs = requirements.filter((r) => r.profile_id === profile.profile_id && r.profile_kind === profile.profile_kind && r.order === profile.order);
    if (profile.applied_operations_count !== profileReqs.length) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'applied_operations_count mismatch for profile');
    }
    const indices = profileReqs.map((r) => r.operation_index).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i += 1) {
      if (indices[i] !== i) {
        throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'operation_index gap or duplicate in profile');
      }
    }
    profileReqs.sort((a, b) => a.operation_index - b.operation_index);
    const reconstructedOps = profileReqs.map((r) => ({
      op: 'source_bound_requirements',
      requirement_id: r.requirement_id,
      required_source_ids: [...r.required_source_ids].sort(),
      required_classification: r.required_classification,
    }));
    const canon = normalizeProfileOperations(reconstructedOps);
    if (canon.operation_digest !== profile.operation_digest) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'profile operation_digest does not match reconstructed operations');
    }
  }
  validateCoreProfileSummary(trace.organization_trace, profileByKind.get('organization') ?? null);
  validateCoreProfileSummary(trace.project_trace, profileByKind.get('project') ?? null);
  const cleanRules = withoutNulls(ruleSet);
  const expectedDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(cleanRules, arrayOrderRules(cleanRules))}`);
  if (outer.assembly_digest !== expectedDigest || trace.effective_ruleset_digest !== expectedDigest
      || trace.rule_count !== ruleSet.rule_count
      || !SHA256_HEX.test(expectedDigest)) {
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
}

function verifyBaseRuleset(effectiveRuleSet) {
  let snap;
  try {
    snap = snapshotCalibrationMeasurementValidityPlainData(effectiveRuleSet, {
      code: CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      label: 'effective rule set',
      rejectAliases: false,
    });
  } catch {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'effective rule set is not a safely admitted CMV/Core data graph');
  }
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'effective rule set must be an object');
  }
  const outer = Object.hasOwn(snap, 'effective_rule_set') ? snap : null;
  const ruleSet = outer ? outer.effective_rule_set : snap;
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
  if (!Array.isArray(requirements) || (baseRuleset && requirements.length !== 0)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'source-bound profile requirements do not match the CMV ruleset reference');
  }
  if (derivedRuleset) {
    if (outer === null) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'derived CMV evaluation requires the complete Core assembly envelope');
    }
    validateSourceBoundRequirements(requirements, ruleSet.profile_rule_provenance);
    const profileBindings = outer.compilation_trace?.profiles ?? [];
    const expectedDerivedReference = deriveCalibrationMeasurementValidityRulesetReference(
      requirements,
      ruleSet.profile_rule_provenance,
      profileBindings,
    );
    if (!sameReference(ruleSet.ruleset_ref, expectedDerivedReference)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'derived CMV ruleset reference does not bind the requirements presented for evaluation');
    }
  }
  if (outer !== null) {
    validateCoreAssemblyEnvelope(outer, ruleSet, requirements);
  }
  return { requirements, ruleset_ref: ruleSet.ruleset_ref, isDerived: derivedRuleset };
}

function validateProjectBindingRef(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'project_binding_ref must be an object');
  }
  for (const key of PROJECT_BINDING_REQUIRED_FIELDS) {
    if (!Object.hasOwn(raw, key)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `project_binding_ref is missing ${key}`);
    }
  }
  for (const key of Object.keys(raw)) {
    if (!PROJECT_BINDING_REQUIRED_FIELDS.includes(key) && !PROJECT_BINDING_OPTIONAL_FIELDS.includes(key)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `project_binding_ref has unknown field ${key}`);
    }
  }
  if (raw.schema_version !== PROJECT_BINDING_SCHEMA) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'project_binding_ref schema_version is invalid');
  }
  if (raw.domain_engine_id !== 'calibration_measurement_validity') {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'project_binding_ref domain_engine_id is invalid');
  }
  const binding = {
    schema_version: raw.schema_version,
    project_id: assertSafeToken(raw.project_id, 'project_binding_ref.project_id'),
    domain_engine_id: raw.domain_engine_id,
    binding_revision_hash: assertSafeToken(raw.binding_revision_hash, 'project_binding_ref.binding_revision_hash'),
    source_manifest_ref: assertSafeToken(raw.source_manifest_ref, 'project_binding_ref.source_manifest_ref'),
  };
  if (Object.hasOwn(raw, 'authority_family')) {
    assertSafeToken(raw.authority_family, 'project_binding_ref.authority_family');
    if (!AUTHORITY_KEYS.has(raw.authority_family)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'project_binding_ref authority_family is unknown');
    }
    binding.authority_family = raw.authority_family;
  }
  if (Object.hasOwn(raw, 'document_refs')) {
    if (!Array.isArray(raw.document_refs)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'project_binding_ref.document_refs must be an array');
    }
    const refs = raw.document_refs.map((r) => assertSafeToken(r, 'document_ref'));
    for (let i = 1; i < refs.length; i += 1) {
      if (compareCodePoints(refs[i - 1], refs[i]) >= 0) {
        throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'document_refs must be sorted and unique');
      }
    }
    binding.document_refs = refs;
  }
  if (Object.hasOwn(raw, 'valid_at')) {
    if (!inspectInstant(raw.valid_at).valid) {
      throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'project_binding_ref.valid_at must be canonical UTC instant');
    }
    binding.valid_at = raw.valid_at;
  }
  if (Object.hasOwn(raw, 'known_at')) {
    if (!inspectInstant(raw.known_at).valid) {
      throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'project_binding_ref.known_at must be canonical UTC instant');
    }
    binding.known_at = raw.known_at;
  }
  return binding;
}

export function calculateCmvCoreTypedFactsDigest(facts) {
  const cleanFacts = withoutNulls(facts);
  return sha256Hex(`soulforge.project_observations.v0\n${canonicalise(cleanFacts, arrayOrderRules(cleanFacts))}`);
}

export function admitCmvCoreTypedFacts(rawTypedFacts) {
  let typedFacts;
  try {
    typedFacts = snapshotCalibrationMeasurementValidityPlainData(rawTypedFacts, {
      code: CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      label: 'CMV Core TypedProjectFacts',
      rejectAliases: true,
    });
  } catch (err) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, err.message);
  }
  if (!typedFacts || typeof typedFacts !== 'object' || Array.isArray(typedFacts)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'typed facts must be an object');
  }
  const actualKeys = Object.keys(typedFacts).sort();
  const expectedKeys = [...TYPED_FACTS_FIELDS].sort();
  if (actualKeys.length !== expectedKeys.length || !actualKeys.every((k, i) => k === expectedKeys[i])) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'typed facts has an invalid closed key set');
  }
  if (typedFacts.schema_version !== TYPED_FACTS_SCHEMA) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'typed facts schema_version is invalid');
  }
  const binding = validateProjectBindingRef(typedFacts.project_binding_ref);
  if (!inspectInstant(typedFacts.valid_at).valid) {
    throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'typed facts valid_at must be canonical UTC instant');
  }
  if (!inspectInstant(typedFacts.known_at).valid) {
    throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'typed facts known_at must be canonical UTC instant');
  }
  const validAt = typedFacts.valid_at;
  const knownAt = typedFacts.known_at;
  if (Date.parse(knownAt) < Date.parse(validAt)) {
    throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'typed facts known_at precedes valid_at');
  }
  if (binding.valid_at && binding.valid_at !== validAt) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'project_binding_ref valid_at does not match typed facts');
  }
  if (binding.known_at && binding.known_at !== knownAt) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'project_binding_ref known_at does not match typed facts');
  }
  if (!Array.isArray(typedFacts.facts) || typedFacts.facts.length === 0) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'typed facts facts array must not be empty');
  }
  const expectedDigest = calculateCmvCoreTypedFactsDigest(typedFacts.facts);
  if (typeof typedFacts.facts_digest !== 'string' || !SHA256_HEX.test(typedFacts.facts_digest) || typedFacts.facts_digest !== expectedDigest) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'typed facts digest does not match the exact facts array');
  }

  let extractedRequest = null;
  let sourceClassifications = [];
  for (const fact of typedFacts.facts) {
    if (!fact || typeof fact !== 'object') continue;
    if (fact.fact_type === 'calibration_measurement_validity_evaluation_request' && fact.request) {
      extractedRequest = fact.request;
      sourceClassifications = fact.source_classifications ?? [];
      break;
    } else if (fact.domain_input) {
      extractedRequest = fact.domain_input;
      sourceClassifications = fact.source_classifications ?? [];
      break;
    } else if (fact.schema_version === 'soulforge.calibration_measurement_validity.domain_input.v0') {
      extractedRequest = fact;
      sourceClassifications = [];
      break;
    } else if (fact.schema_version === CMV_TYPED_FACTS_SCHEMA_VERSION) {
      extractedRequest = fact.request;
      sourceClassifications = fact.source_classifications ?? [];
      break;
    }
  }
  if (!extractedRequest) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'no valid CMV request fact found in Core typed facts');
  }

  const request = structuredClone(extractedRequest);
  if (request.project_binding_ref) {
    if (request.project_binding_ref.entity_id && request.project_binding_ref.entity_id !== binding.project_id) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'request project_binding_ref entity_id does not match project_binding_ref.project_id');
    }
    if (request.project_binding_ref.revision_id && request.project_binding_ref.revision_id !== binding.binding_revision_hash) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'request project_binding_ref revision_id does not match project_binding_ref.binding_revision_hash');
    }
  }
  if (request.evaluation_context) {
    if (request.evaluation_context.tested_at && request.evaluation_context.tested_at !== validAt) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'request evaluation_context.tested_at does not match typed facts valid_at');
    }
    if (request.evaluation_context.known_at && request.evaluation_context.known_at !== knownAt) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'request evaluation_context.known_at does not match typed facts known_at');
    }
  }

  const provenance = {
    project_binding_ref: binding,
    facts_digest: expectedDigest,
    valid_at: validAt,
    known_at: knownAt,
  };
  return { request, source_classifications: sourceClassifications, provenance, valid_at: validAt, known_at: knownAt };
}

function validateEvaluatorAuthority(rawAuthority) {
  if (rawAuthority === undefined) return;
  if (rawAuthority === null) {
    throw new ContractError(CMV_ERROR_CODES.AUTHORITY_REFUSED, 'explicit null authority is refused; authority must be an empty plain object');
  }
  if (typeof rawAuthority !== 'object' || Array.isArray(rawAuthority) || types.isProxy(rawAuthority)) {
    throw new ContractError(CMV_ERROR_CODES.AUTHORITY_REFUSED, 'evaluator authority must be a plain object');
  }
  const proto = Object.getPrototypeOf(rawAuthority);
  if (proto !== Object.prototype && proto !== null) {
    throw new ContractError(CMV_ERROR_CODES.AUTHORITY_REFUSED, 'custom prototype on authority is refused');
  }
  const descriptors = Object.getOwnPropertyDescriptors(rawAuthority);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((k) => typeof k !== 'string')) {
    throw new ContractError(CMV_ERROR_CODES.AUTHORITY_REFUSED, 'symbol properties on authority are refused');
  }
  for (const k of keys) {
    const d = descriptors[k];
    if (!d || d.enumerable !== true || !Object.hasOwn(d, 'value') || typeof d.get === 'function' || typeof d.set === 'function') {
      throw new ContractError(CMV_ERROR_CODES.AUTHORITY_REFUSED, 'authority may not carry accessors');
    }
  }
  if (keys.length > 0) {
    throw new ContractError(CMV_ERROR_CODES.AUTHORITY_REFUSED, 'evaluator authority must be empty; calibration_measurement_validity accepts no execution or action authority');
  }
}

function validateEvaluatorCutoffs(rawCutoffs, validAt, knownAt) {
  if (rawCutoffs === undefined) return;
  if (rawCutoffs === null) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'explicit null cutoffs is refused; cutoffs must be a plain object');
  }
  if (typeof rawCutoffs !== 'object' || Array.isArray(rawCutoffs) || types.isProxy(rawCutoffs)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'evaluator cutoffs must be a plain object');
  }
  const proto = Object.getPrototypeOf(rawCutoffs);
  if (proto !== Object.prototype && proto !== null) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'custom prototype on cutoffs is refused');
  }
  const descriptors = Object.getOwnPropertyDescriptors(rawCutoffs);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((k) => typeof k !== 'string')) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'symbol properties on cutoffs are refused');
  }
  if (keys.length === 0) return;
  const allowed = new Set(['valid_at', 'known_at']);
  for (const k of keys) {
    if (!allowed.has(k)) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `cutoffs.${k} is not permitted`);
    }
    const d = descriptors[k];
    if (!d || d.enumerable !== true || !Object.hasOwn(d, 'value') || typeof d.get === 'function' || typeof d.set === 'function') {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `cutoffs.${k} may not carry accessors`);
    }
  }
  if (descriptors.valid_at) {
    const val = descriptors.valid_at.value;
    if (typeof val !== 'string' || !inspectInstant(val).valid) {
      throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'cutoffs.valid_at must be a canonical UTC instant');
    }
    if (validAt !== undefined && val !== validAt) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'cutoffs.valid_at does not match admitted facts valid_at');
    }
  }
  if (descriptors.known_at) {
    const val = descriptors.known_at.value;
    if (typeof val !== 'string' || !inspectInstant(val).valid) {
      throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'cutoffs.known_at must be a canonical UTC instant');
    }
    if (knownAt !== undefined && val !== knownAt) {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'cutoffs.known_at does not match admitted facts known_at');
    }
  }
  if (descriptors.valid_at && descriptors.known_at) {
    if (Date.parse(descriptors.known_at.value) < Date.parse(descriptors.valid_at.value)) {
      throw new ContractError(CMV_ERROR_CODES.TIME_INVALID, 'cutoffs.known_at must be on or after cutoffs.valid_at');
    }
  }
}

function admitBaseEvaluationInput(input) {
  let snapshot;
  try {
    snapshot = snapshotCalibrationMeasurementValidityPlainData(input, {
      code: CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
      label: 'base CMV evaluation input',
      rejectAliases: true,
    });
  } catch (err) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, err.message);
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'base CMV evaluation input must be an exact raw request or Typed Facts envelope');
  }
  if (snapshot.schema_version === TYPED_FACTS_SCHEMA) {
    return admitCmvCoreTypedFacts(snapshot);
  }
  if (snapshot.schema_version === CMV_TYPED_FACTS_SCHEMA_VERSION) {
    try {
      const validated = validateAdaptedCalibrationMeasurementValidityTypedFacts(snapshot);
      return {
        request: validated.request,
        source_classifications: validated.source_classifications,
        valid_at: validated.request.evaluation_context.tested_at,
        known_at: validated.request.evaluation_context.known_at,
      };
    } catch {
      throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'base CMV Typed Facts envelope is incomplete, stale, or source-bound incorrectly');
    }
  }
  if (Object.hasOwn(snapshot, 'request') || Object.hasOwn(snapshot, 'source_classifications')
      || Object.hasOwn(snapshot, 'fact_provenance') || Object.hasOwn(snapshot, 'typed_fact_receipt')
      || Object.hasOwn(snapshot, 'facts') || Object.hasOwn(snapshot, 'facts_digest')) {
    throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'base CMV evaluation refuses hybrid wrapper or Typed Facts-like input');
  }
  return {
    request: snapshot,
    source_classifications: [],
    valid_at: snapshot.evaluation_context?.tested_at,
    known_at: snapshot.evaluation_context?.known_at,
  };
}

export const calibrationMeasurementValidityAdapter = Object.freeze({
  ...calibrationMeasurementValidityCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    validateEvaluatorAuthority(authority);
    const verified = verifyBaseRuleset(effectiveRuleSet);
    let envelope;
    if (verified.isDerived && verified.requirements.length > 0) {
      if (typedProjectFacts && typeof typedProjectFacts === 'object' && typedProjectFacts.schema_version === TYPED_FACTS_SCHEMA) {
        envelope = admitCmvCoreTypedFacts(typedProjectFacts);
      } else {
        try {
          const validated = validateAdaptedCalibrationMeasurementValidityTypedFacts(typedProjectFacts);
          envelope = {
            request: validated.request,
            source_classifications: validated.source_classifications,
            valid_at: validated.request.evaluation_context.tested_at,
            known_at: validated.request.evaluation_context.known_at,
          };
        } catch {
          throw new ContractError(CMV_ERROR_CODES.EFFECTIVE_RULESET_INVALID, 'derived CMV evaluation requires validated Typed Facts v1 rather than raw evidence');
        }
      }
    } else {
      envelope = admitBaseEvaluationInput(typedProjectFacts);
    }
    validateEvaluatorCutoffs(cutoffs, envelope.valid_at, envelope.known_at);
    const baseResult = assessCalibrationMeasurementValidity(envelope.request);
    const profileEvaluation = evaluateCmvSourceBoundProfileRequirements(verified.requirements, envelope.source_classifications ?? []);
    return applyCmvSourceBoundProfileEvaluation(baseResult, profileEvaluation,
      verified.isDerived ? verified.ruleset_ref : null);
  },
});

registerDomainEngineAdapter('calibration_measurement_validity', calibrationMeasurementValidityAdapter);

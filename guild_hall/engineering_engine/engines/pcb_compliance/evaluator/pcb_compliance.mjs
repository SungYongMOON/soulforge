// Deterministic public-safe PCB evidence-readiness evaluator. It has no filesystem, network,
// model, RAG, standard-body, approval, disposition, or product-acceptance side effect.
import types from "node:util/types";

import { APPLICABILITY, AUTHORITY_FAMILIES, resolveApplicability } from "../../../core/validators/authority.mjs";
import { canonicalise, compareCodePoints } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import {
  PCB_COMPLIANCE_RULES,
  PCB_COMPLIANCE_RULESET_REF,
  PCB_COMPLIANCE_RULESET_SCHEMA,
  PCB_COMPLIANCE_SOURCE_PACKET_REF,
  isPcbControlledSourceRef,
  projectPcbRuleForDigest,
} from "../rules/pcb_compliance_rules.mjs";
import { calculatePcbDerivedRulesetContentId } from "../compiler/pcb_compliance_compiler_adapter.mjs";
import { isPcbControlledBodyAccessState, isPcbObservationState } from "../vocabulary/pcb_compliance_vocabulary.mjs";

const DOMAIN_INPUT_SCHEMA = "soulforge.pcb_compliance.domain_input.v0";
const ASSESSMENT_SCHEMA = "soulforge.pcb_compliance.assessment.v0";
const DOMAIN_RESULT_SCHEMA = "soulforge.pcb_compliance.domain_result.v0";
const RECEIPT_SCHEMA = "soulforge.pcb_compliance.receipt.v0";
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/#-]{0,255}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const FORBIDDEN_STRING = /(?:^[A-Za-z]:[\\/]|^\\\\|^\/(?:etc|var|usr|home|root|tmp)\/|secret|password|bearer|api[_-]?key|token)/iu;
const RULE_FIELDS = Object.freeze([
  "allowed_artifact_tokens",
  "claim_ceiling",
  "controlled_clause_hold",
  "coverage_area",
  "expected_evidence_keys",
  "required_authority_families",
  "rule_id",
  "source_locator",
  "source_modality",
  "source_ref",
]);
const EFFECTIVE_RULESET_KEYS = Object.freeze([
  "domain_engine_id",
  "profile_rule_provenance",
  "rule_count",
  "rules",
  "ruleset_ref",
  "schema_version",
  "source_packet_ref",
]);
const ROW_REQUIRED_KEYS = Object.freeze([
  "applicability",
  "authority_bindings",
  "case_id",
  "observation",
  "rule_id",
]);
const ROW_OPTIONAL_KEYS = Object.freeze(["standard_binding"]);
const AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const EFFECTS = Object.freeze({
  filesystem_writes: 0,
  network_calls: 0,
  model_calls: 0,
  rag_queries: 0,
  external_actions: 0,
});

export const PCB_EVALUATOR_ERROR_CODES = Object.freeze({
  INPUT_REFUSED: "PCB_INPUT_REFUSED",
  BINDING_REFUSED: "PCB_BINDING_REFUSED",
  EFFECTIVE_RULESET_INVALID: "PCB_EFFECTIVE_RULESET_INVALID",
});

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function fail(code, message) {
  throw new ContractError(code, message);
}

function snapshotPlainData(
  value,
  label = "input",
  code = PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
  ancestors = new Set(),
  seen = new Set(),
  options = {},
  depth = 0,
) {
  if (depth > 20) fail(code, `${label} exceeds maximum depth`);
  if (value === null || typeof value !== "object") {
    if (["string", "boolean", "number"].includes(typeof value) || value === null) return value;
    fail(code, `${label} contains an unsupported value`);
  }
  if (types.isProxy(value)) fail(code, `${label} may not be a proxy`);
  if (ancestors.has(value)) fail(code, `${label} is cyclic`);
  if (seen.has(value) && options.allowAliases !== true) fail(code, `${label} aliases another supplied object`);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype)) {
    fail(code, `${label} must have a standard prototype`);
  }
  ancestors.add(value);
  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const out = isArray ? [] : {};
    if (isArray) {
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== value.length || value.length > 128) fail(code, `${label} must be a bounded dense array`);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
          fail(code, `${label} contains an accessor or sparse item`);
        }
        out.push(snapshotPlainData(descriptor.value, `${label}[${index}]`, code, ancestors, seen, options, depth + 1));
      }
    } else {
      for (const key of Object.keys(descriptors)) {
        const descriptor = descriptors[key];
        if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
          fail(code, `${label} contains an unsafe property`);
        }
        out[key] = snapshotPlainData(descriptor.value, `${label}.${key}`, code, ancestors, seen, options, depth + 1);
      }
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

function assertSafeToken(value, label, code = PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  if (typeof value !== "string" || !SAFE_TOKEN.test(value) || FORBIDDEN_STRING.test(value)) {
    fail(code, `${label} must be a bounded public-safe token`);
  }
  return value;
}

function assertPublicText(value, label, code = PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || FORBIDDEN_STRING.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(code, `${label} must be public-safe text`);
  }
  return value;
}

function sameExactRef(actual, expected) {
  return actual && typeof actual === "object"
    && actual.entity_id === expected.entity_id
    && actual.revision_id === expected.revision_id
    && actual.content_id === expected.content_id
    && actual.content_hash_alg === expected.content_hash_alg;
}

function assertExactRef(ref, label, expected = null) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)
    || Object.keys(ref).length !== 4 || !sameExactRef(ref, expected ?? ref)
    || !SHA256_CONTENT_ID.test(ref.content_id)) {
    fail(PCB_EVALUATOR_ERROR_CODES.BINDING_REFUSED, `${label} is not an exact content-addressed reference`);
  }
  if (expected && !sameExactRef(ref, expected)) fail(PCB_EVALUATOR_ERROR_CODES.BINDING_REFUSED, `${label} does not match the pinned reference`);
}

function assertSortedUniqueTokens(values, label, { allowNullOnly = false, allowEmpty = false } = {}) {
  if (!Array.isArray(values) || (values.length === 0 && !allowEmpty)) fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `${label} must be non-empty`);
  if (allowNullOnly && values.length === 1 && values[0] === null) return;
  let previous = null;
  for (const value of values) {
    assertSafeToken(value, label, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    if (previous !== null && compareCodePoints(previous, value) >= 0) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `${label} must be sorted and unique`);
    }
    previous = value;
  }
}

function validateRuleRow(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule must be an object");
  const keys = Object.keys(rule).sort(compareCodePoints);
  if (keys.length !== RULE_FIELDS.length || !keys.every((key, index) => key === RULE_FIELDS[index])) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule has an unexpected field shape");
  }
  assertSafeToken(rule.rule_id, "rule_id", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertSafeToken(rule.source_ref, "source_ref", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertPublicText(rule.source_locator, "source_locator", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertPublicText(rule.source_modality, "source_modality", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertSafeToken(rule.coverage_area, "coverage_area", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertSortedUniqueTokens(rule.required_authority_families, "required_authority_families");
  if (!rule.required_authority_families.every((family) => AUTHORITY_KEYS.has(family))) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule has an unregistered authority family");
  }
  assertSortedUniqueTokens(rule.expected_evidence_keys, "expected_evidence_keys");
  assertSortedUniqueTokens(rule.allowed_artifact_tokens, "allowed_artifact_tokens", { allowNullOnly: true, allowEmpty: true });
  if (typeof rule.controlled_clause_hold !== "boolean" || rule.claim_ceiling !== "source_supported") {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule cannot widen PCB claim semantics");
  }
  if (isPcbControlledSourceRef(rule.source_ref) && rule.controlled_clause_hold !== true) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "controlled IPC-like source cannot bypass controlled_clause_hold");
  }
}

function canonicalRule(rule) {
  return canonicalise(projectPcbRuleForDigest(rule), {
    required_authority_families: "insertion_ordered",
    expected_evidence_keys: "insertion_ordered",
    allowed_artifact_mappings: "insertion_ordered",
  });
}

export function validatePcbEffectiveRuleSet(input) {
  const outerEnvelope = snapshotPlainData(
    input,
    "effective rule set outer envelope",
    PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID,
    new Set(),
    new Set(),
    { allowAliases: true },
  );
  const isCoreEnvelope = Object.hasOwn(outerEnvelope, "effective_rule_set");
  // The outer Core envelope legitimately reuses profile provenance arrays in its trace. Its
  // clone may therefore permit aliases, but the candidate ruleset must be re-read from the
  // original input and admitted with strict alias rejection; otherwise outer cloning could
  // silently de-alias a hostile inner ruleset before the strict pass sees it.
  const originalInnerRuleset = isCoreEnvelope
    ? Object.getOwnPropertyDescriptor(input, "effective_rule_set")?.value
    : input;
  const ruleset = snapshotPlainData(originalInnerRuleset, "effective rule set", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  if (!ruleset || typeof ruleset !== "object" || Array.isArray(ruleset)) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "PCB effective rule set is incomplete");
  }
  const expectedKeys = [...EFFECTIVE_RULESET_KEYS].sort(compareCodePoints);
  const keys = Object.keys(ruleset).sort(compareCodePoints);
  if (keys.length !== expectedKeys.length || !keys.every((key, index) => key === expectedKeys[index])
    || ruleset.schema_version !== PCB_COMPLIANCE_RULESET_SCHEMA || ruleset.domain_engine_id !== "pcb_compliance"
    || !Array.isArray(ruleset.rules)) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "PCB effective rule set has an unexpected shape");
  }
  assertExactRef(ruleset.source_packet_ref, "source_packet_ref", PCB_COMPLIANCE_SOURCE_PACKET_REF);
  assertExactRef(ruleset.ruleset_ref, "ruleset_ref");
  if (!Number.isSafeInteger(ruleset.rule_count) || ruleset.rule_count !== ruleset.rules.length) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule_count does not match rules");
  }
  const ids = new Set();
  let priorRuleId = null;
  for (const rule of ruleset.rules) {
    validateRuleRow(rule);
    if (ids.has(rule.rule_id)) fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "duplicate rule_id");
    if (priorRuleId !== null && compareCodePoints(priorRuleId, rule.rule_id) >= 0) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rules must be sorted by rule_id");
    }
    ids.add(rule.rule_id);
    priorRuleId = rule.rule_id;
  }
  if (!ruleset.profile_rule_provenance || typeof ruleset.profile_rule_provenance !== "object" || Array.isArray(ruleset.profile_rule_provenance)) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "profile_rule_provenance is required");
  }
  const baseRuleIds = new Set(PCB_COMPLIANCE_RULES.map((rule) => rule.rule_id));
  const baseRuleIdsSorted = [...baseRuleIds].sort(compareCodePoints);
  for (const baseRule of PCB_COMPLIANCE_RULES) {
    const suppliedBaseRule = ruleset.rules.find((rule) => rule.rule_id === baseRule.rule_id);
    if (!suppliedBaseRule || canonicalRule(suppliedBaseRule) !== canonicalRule(baseRule)) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `immutable base rule ${baseRule.rule_id} is missing or modified`);
    }
  }
  const profileRuleIds = [...ids].filter((ruleId) => !baseRuleIds.has(ruleId));
  const provenanceKeys = Object.keys(ruleset.profile_rule_provenance).sort(compareCodePoints);
  const rulesWithoutProvenance = ruleset.rules
    .filter((rule) => !Object.hasOwn(ruleset.profile_rule_provenance, rule.rule_id))
    .map((rule) => rule.rule_id)
    .sort(compareCodePoints);
  if (rulesWithoutProvenance.length !== baseRuleIdsSorted.length
    || !rulesWithoutProvenance.every((ruleId, index) => ruleId === baseRuleIdsSorted[index])) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "only the complete immutable base pack may omit profile provenance");
  }
  if (provenanceKeys.length !== profileRuleIds.length
    || !provenanceKeys.every((ruleId, index) => ruleId === profileRuleIds.sort(compareCodePoints)[index])) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "profile_rule_provenance must cover exactly the derived rules");
  }
  for (const ruleId of provenanceKeys) {
    const provenance = ruleset.profile_rule_provenance[ruleId];
    const provenanceExpectedKeys = ["profile_id", "profile_kind", "profile_order", "source_ref"];
    const provenanceActualKeys = provenance && typeof provenance === "object" && !Array.isArray(provenance)
      ? Object.keys(provenance).sort(compareCodePoints)
      : [];
    if (provenanceActualKeys.length !== provenanceExpectedKeys.length
      || !provenanceActualKeys.every((key, index) => key === provenanceExpectedKeys[index])) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived rule provenance has an invalid shape");
    }
    assertSafeToken(provenance.profile_id, "profile provenance profile_id", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    if (!["organization", "project"].includes(provenance.profile_kind) || !Number.isSafeInteger(provenance.profile_order)
      || provenance.profile_order < 0 || provenance.profile_order > 1) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived rule provenance is invalid");
    }
    const rule = ruleset.rules.find((candidate) => candidate.rule_id === ruleId);
    if (provenance.source_ref !== rule.source_ref) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived rule provenance source_ref does not match its rule");
    }
    assertSafeToken(provenance.source_ref, "profile provenance source_ref", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  }
  if (sameExactRef(ruleset.ruleset_ref, PCB_COMPLIANCE_RULESET_REF)) {
    if (ruleset.rules.length !== PCB_COMPLIANCE_RULES.length) fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "base ruleset count changed");
    if (provenanceKeys.length !== 0) fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "base ruleset cannot have derived provenance");
    for (let index = 0; index < PCB_COMPLIANCE_RULES.length; index += 1) {
      if (canonicalRule(ruleset.rules[index]) !== canonicalRule(PCB_COMPLIANCE_RULES[index])) {
        fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `base rule ${index} was modified`);
      }
    }
  } else {
    if (ruleset.ruleset_ref.entity_id !== "pcb-compliance-ruleset-derived-v0"
      || ruleset.ruleset_ref.revision_id !== "soulforge.pcb_compliance.ruleset.v0"
      || ruleset.ruleset_ref.content_hash_alg !== "sha256") {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived ruleset reference shape is invalid");
    }
    const derivedContentId = calculatePcbDerivedRulesetContentId(ruleset.rules, ruleset.profile_rule_provenance);
    if (ruleset.ruleset_ref.content_id !== derivedContentId) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived ruleset content_id does not match rules and provenance");
    }
  }
  return deepFreeze({
    domain_engine_id: "pcb_compliance",
    schema_version: ruleset.schema_version,
    source_packet_ref: { ...ruleset.source_packet_ref },
    ruleset_ref: { ...ruleset.ruleset_ref },
    rules: ruleset.rules.map((rule) => ({ ...rule,
      required_authority_families: [...rule.required_authority_families],
      expected_evidence_keys: [...rule.expected_evidence_keys],
      allowed_artifact_tokens: [...rule.allowed_artifact_tokens],
    })),
    profile_rule_provenance: Object.fromEntries(provenanceKeys.map((ruleId) => [ruleId, { ...ruleset.profile_rule_provenance[ruleId] }])),
    rule_count: ruleset.rule_count,
  });
}

function baseEffectiveRuleSet() {
  return validatePcbEffectiveRuleSet({
    schema_version: PCB_COMPLIANCE_RULESET_SCHEMA,
    domain_engine_id: "pcb_compliance",
    source_packet_ref: PCB_COMPLIANCE_SOURCE_PACKET_REF,
    ruleset_ref: PCB_COMPLIANCE_RULESET_REF,
    rules: PCB_COMPLIANCE_RULES,
    profile_rule_provenance: {},
    rule_count: PCB_COMPLIANCE_RULES.length,
  });
}

function assertApplicability(value) {
  const names = ["approval_scope", "document_revision", "jurisdiction", "project_binding", "time_window"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== names.length
    || !names.every((name) => Object.hasOwn(value, name))) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "applicability must contain the five explicit components");
  }
  for (const name of names) {
    if (!(value[name] === true || value[name] === false || value[name] === APPLICABILITY.UNKNOWN)) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `applicability.${name} is invalid`);
    }
  }
  return value;
}

function validateAuthorityBindings(value) {
  if (!Array.isArray(value)) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "authority_bindings must be an array");
  const families = new Set();
  const bindings = [];
  for (const binding of value) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)
      || Object.keys(binding).length !== 2 || typeof binding.family !== "string" || typeof binding.authority_ref !== "string") {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "authority binding must contain only family and authority_ref");
    }
    assertSafeToken(binding.family, "authority family");
    assertSafeToken(binding.authority_ref, "authority_ref");
    if (!AUTHORITY_KEYS.has(binding.family) || families.has(binding.family)) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "authority binding family is unknown or duplicated");
    }
    families.add(binding.family);
    bindings.push({ family: binding.family, authority_ref: binding.authority_ref });
  }
  return bindings;
}

function hasRequiredAuthority(authorityBindings, rule) {
  const families = new Set(authorityBindings.map((binding) => binding.family));
  return rule.required_authority_families.every((family) => families.has(family));
}

function validateEvidenceRefArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${label} must be a bounded non-empty array`);
  }
  const copy = [];
  let prior = null;
  for (const ref of value) {
    assertSafeToken(ref, label);
    if (prior !== null && compareCodePoints(prior, ref) >= 0) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `${label} must be sorted and unique`);
    }
    prior = ref;
    copy.push(ref);
  }
  return copy;
}

function validateObservation(observation, rule) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)
    || Object.keys(observation).length !== 3 || typeof observation.attempted !== "boolean"
    || !isPcbObservationState(observation.evidence_state) || !observation.evidence_by_key
    || typeof observation.evidence_by_key !== "object" || Array.isArray(observation.evidence_by_key)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "observation has an invalid shape");
  }
  const expected = new Set(rule.expected_evidence_keys);
  const evidenceByKey = {};
  for (const key of Object.keys(observation.evidence_by_key)) {
    if (!expected.has(key)) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "observation includes an unknown evidence key");
    evidenceByKey[key] = validateEvidenceRefArray(observation.evidence_by_key[key], `evidence_by_key.${key}`);
  }
  const missingEvidenceKeys = rule.expected_evidence_keys.filter((key) => !Object.hasOwn(evidenceByKey, key));
  return {
    attempted: observation.attempted,
    evidence_state: observation.evidence_state,
    evidence_by_key: evidenceByKey,
    missing_evidence_keys: missingEvidenceKeys,
  };
}

function validateStandardBinding(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 3 || !isPcbControlledBodyAccessState(value.body_access_state)
    || typeof value.lawful_source_ref !== "string" || typeof value.standard_revision_ref !== "string") {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "standard_binding has an invalid shape");
  }
  assertSafeToken(value.lawful_source_ref, "lawful_source_ref");
  assertSafeToken(value.standard_revision_ref, "standard_revision_ref");
  return {
    body_access_state: value.body_access_state,
    lawful_source_ref: value.lawful_source_ref,
    standard_revision_ref: value.standard_revision_ref,
  };
}

function validateRow(row, rule) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "row must be a plain object");
  }
  const expectedKeys = [...ROW_REQUIRED_KEYS, ...(Object.hasOwn(row, "standard_binding") ? ROW_OPTIONAL_KEYS : [])].sort(compareCodePoints);
  const actualKeys = Object.keys(row).sort(compareCodePoints);
  if (actualKeys.length !== expectedKeys.length || !actualKeys.every((key, index) => key === expectedKeys[index])) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "row has an unexpected field");
  }
  if (row.rule_id !== rule.rule_id) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "row rule_id does not match its effective rule");
  return {
    case_id: assertSafeToken(row.case_id, "case_id"),
    rule_id: row.rule_id,
    applicability: assertApplicability(row.applicability),
    authority_bindings: validateAuthorityBindings(row.authority_bindings),
    observation: validateObservation(row.observation, rule),
    standard_binding: validateStandardBinding(row.standard_binding),
  };
}

function controlledBodyAvailable(rule, standardBinding) {
  if (!rule.controlled_clause_hold) return true;
  if (!standardBinding) return false;
  if (standardBinding.body_access_state !== "owner_approved_lawful") return false;
  return true;
}

function evaluateRow(row, rule) {
  const applicability = resolveApplicability(row.applicability);
  const base = {
    case_id: assertSafeToken(row.case_id, "case_id"),
    rule_id: rule.rule_id,
    coverage_area: rule.coverage_area,
    source_ref: rule.source_ref,
    source_locator: rule.source_locator,
    source_modality: rule.source_modality,
    workmanship_clause_status: rule.controlled_clause_hold ? "HOLD" : "NOT_EVALUATED",
  };
  if (applicability === APPLICABILITY.NO) return { ...base, state: "NOT_APPLICABLE", reason_code: "PCB_NOT_APPLICABLE" };
  if (applicability === APPLICABILITY.UNKNOWN) return { ...base, state: "UNKNOWN", reason_code: "PCB_APPLICABILITY_HOLD" };
  if (!controlledBodyAvailable(rule, row.standard_binding)) return { ...base, state: "UNKNOWN", reason_code: "PCB_CONTROLLED_STANDARD_HOLD" };
  if (!hasRequiredAuthority(row.authority_bindings, rule)) return { ...base, state: "UNKNOWN", reason_code: "PCB_AUTHORITY_HOLD" };
  const observation = row.observation;
  if (observation.missing_evidence_keys.length > 0) return { ...base, state: "UNKNOWN", reason_code: "PCB_EVIDENCE_SUFFICIENCY_HOLD" };
  if (!observation.attempted || observation.evidence_state === "unknown") return { ...base, state: "UNKNOWN", reason_code: "PCB_EVIDENCE_UNOBSERVED" };
  if (observation.evidence_state === "conflict") return { ...base, state: "CONFLICT", reason_code: "PCB_EVIDENCE_CONFLICT" };
  if (observation.evidence_state === "absent_confirmed") return { ...base, state: "MISSING", reason_code: "PCB_EVIDENCE_ABSENT_CONFIRMED" };
  return { ...base, state: "SATISFIED", reason_code: "PCB_EVIDENCE_READY" };
}

function countsFor(results) {
  const counts = { CONFLICT: 0, MISSING: 0, NOT_APPLICABLE: 0, SATISFIED: 0, UNKNOWN: 0 };
  for (const result of results) counts[result.state] += 1;
  return counts;
}

function overallState(counts) {
  if (counts.UNKNOWN > 0) return "UNKNOWN";
  if (counts.CONFLICT > 0) return "CONFLICT";
  if (counts.MISSING > 0) return "MISSING";
  if (counts.SATISFIED > 0) return "SATISFIED";
  return "NOT_APPLICABLE";
}

function validateRequest(request, effective) {
  const snapshot = snapshotPlainData(request);
  if (!snapshot || typeof snapshot !== "object" || Object.keys(snapshot).length !== 4
    || snapshot.schema_version !== "soulforge.pcb_compliance.request.v0") {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "PCB request must contain exactly schema_version, binding, domain_input, and cutoffs");
  }
  const binding = snapshot.binding;
  if (!binding || typeof binding !== "object" || Object.keys(binding).length !== 3 || binding.domain_engine_id !== "pcb_compliance") {
    fail(PCB_EVALUATOR_ERROR_CODES.BINDING_REFUSED, "PCB binding is incomplete");
  }
  assertExactRef(binding.source_packet_ref, "binding source_packet_ref", PCB_COMPLIANCE_SOURCE_PACKET_REF);
  if (!sameExactRef(binding.ruleset_ref, effective.ruleset_ref)) {
    fail(PCB_EVALUATOR_ERROR_CODES.BINDING_REFUSED, "binding ruleset_ref does not match effective ruleset");
  }
  const input = snapshot.domain_input;
  if (!input || typeof input !== "object" || Object.keys(input).length !== 2
    || input.schema_version !== DOMAIN_INPUT_SCHEMA || !Array.isArray(input.rows)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_input is invalid");
  }
  const cutoffs = snapshot.cutoffs;
  if (!cutoffs || typeof cutoffs !== "object" || Object.keys(cutoffs).length !== 2
    || typeof cutoffs.valid_at !== "string" || typeof cutoffs.known_at !== "string") {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "cutoffs are invalid");
  }
  const rulesById = new Map(effective.rules.map((rule) => [rule.rule_id, rule]));
  const seen = new Set();
  const rows = [];
  for (const row of input.rows) {
    if (!row || typeof row !== "object" || !rulesById.has(row.rule_id) || seen.has(row.rule_id)) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "rows must identify each effective PCB rule exactly once");
    }
    seen.add(row.rule_id);
    rows.push(validateRow(row, rulesById.get(row.rule_id)));
  }
  if (seen.size !== rulesById.size) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "one or more effective PCB rules have no row");
  return {
    ...snapshot,
    binding: { ...binding, source_packet_ref: { ...binding.source_packet_ref }, ruleset_ref: { ...binding.ruleset_ref } },
    domain_input: { ...input, rows },
    cutoffs: { ...cutoffs },
  };
}

export function assessPcbCompliance(request, suppliedEffectiveRuleSet = null) {
  const effective = suppliedEffectiveRuleSet ? validatePcbEffectiveRuleSet(suppliedEffectiveRuleSet) : baseEffectiveRuleSet();
  const accepted = validateRequest(request, effective);
  const byId = new Map(effective.rules.map((rule) => [rule.rule_id, rule]));
  const results = accepted.domain_input.rows
    .map((row) => evaluateRow(row, byId.get(row.rule_id)))
    .sort((left, right) => compareCodePoints(left.rule_id, right.rule_id) || compareCodePoints(left.case_id, right.case_id));
  const counts = countsFor(results);
  const assessment = {
    schema_version: ASSESSMENT_SCHEMA,
    domain_engine_id: "pcb_compliance",
    assessment_scope: "evidence_readiness_only",
    overall_state: overallState(counts),
    counts,
    results,
  };
  const domainResult = {
    schema_version: DOMAIN_RESULT_SCHEMA,
    domain_engine_id: "pcb_compliance",
    claim_ceiling: "source_supported",
    product_acceptance: "NOT_EVALUATED",
    workmanship_compliance: "NOT_EVALUATED",
  };
  const assessmentDigest = sha256Hex(`soulforge.pcb_compliance.assessment.v0\n${canonicalise(assessment, {
    results: "sorted_by:rule_id",
  })}`);
  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    domain_engine_id: "pcb_compliance",
    ruleset_ref: { ...effective.ruleset_ref },
    source_packet_ref: { ...effective.source_packet_ref },
    assessment_digest: assessmentDigest,
    effects: { ...EFFECTS },
  };
  return deepFreeze({ assessment, domain_result: domainResult, receipt });
}

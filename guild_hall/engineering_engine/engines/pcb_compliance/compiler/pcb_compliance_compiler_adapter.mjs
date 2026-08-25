// PCB Domain Compiler Adapter. Only explicit Profile `add` operations are supported in v0.
// It never resolves project evidence, RAG retrieval, standard applicability, or compliance.
import types from "node:util/types";

import { AUTHORITY_FAMILIES } from "../../../core/validators/authority.mjs";
import { canonicalise, compareCodePoints } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import {
  PCB_COMPLIANCE_RULES,
  PCB_COMPLIANCE_RULESET_REF,
  PCB_COMPLIANCE_RULESET_REVISION,
  PCB_COMPLIANCE_RULESET_SCHEMA,
  PCB_COMPLIANCE_SOURCE_PACKET_REF,
  isPcbControlledSourceRef,
  projectPcbRuleForDigest,
} from "../rules/pcb_compliance_rules.mjs";
import { isPcbCoverageArea } from "../vocabulary/pcb_compliance_vocabulary.mjs";

export const PCB_COMPILER_ADAPTER_SCHEMA_VERSION = "soulforge.pcb_compliance.compiler.v0";
export const PCB_COMPILER_ERROR_CODES = Object.freeze({
  PROFILE_BINDING_INVALID: "PCB_PROFILE_BINDING_INVALID",
  PROFILE_OPERATION_MALFORMED: "PCB_PROFILE_OPERATION_MALFORMED",
  PROFILE_SOURCE_UNBOUND: "PCB_PROFILE_SOURCE_UNBOUND",
  PROFILE_RULE_DUPLICATE: "PCB_PROFILE_RULE_DUPLICATE",
  PROFILE_RULE_INVALID: "PCB_PROFILE_RULE_INVALID",
});

const AUTHORITY_KEYS = new Set(AUTHORITY_FAMILIES.map((family) => family.key));
const RULE_ID = /^PCB-(?:NASA|STD|PROFILE)-[A-Z0-9-]{2,64}$/u;
const SAFE_STRING = /^[A-Za-z0-9][A-Za-z0-9_.:/#-]{0,255}$/u;
const RULE_KEYS = Object.freeze([
  "allowed_artifact_tokens",
  "controlled_clause_hold",
  "coverage_area",
  "expected_evidence_keys",
  "required_authority_families",
  "rule_id",
  "source_locator",
  "source_modality",
  "source_ref",
]);
const PROFILE_BINDING_KEYS = Object.freeze([
  "domain_engine_id",
  "extends_or_base_pin",
  "operation_digest",
  "operations",
  "order",
  "profile_id",
  "profile_kind",
  "revision_or_hash",
  "schema_version",
  "source_refs",
]);
const FORBIDDEN_STRING = /(?:^[A-Za-z]:[\\/]|^\\\\|^\/(?:etc|var|usr|home|root|tmp)\/|secret|password|bearer|api[_-]?key|token)/iu;
const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

function assertPlainData(value, label, code = PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, seen = new Set(), depth = 0) {
  if (depth > 16) throw new ContractError(code, `${label} exceeds maximum depth`);
  if (value === null || typeof value !== "object") return;
  if (types.isProxy(value) || seen.has(value)) {
    throw new ContractError(code, `${label} must not be a proxy, alias, or cycle`);
  }
  const prototype = Array.isArray(value) ? Array.prototype : Object.prototype;
  if (Object.getPrototypeOf(value) !== prototype) {
    throw new ContractError(code, `${label} must have a standard prototype`);
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === "length") continue;
    if (["__proto__", "prototype", "constructor"].includes(key) || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
      throw new ContractError(code, `${label} contains an unsafe property`);
    }
    assertPlainData(descriptor.value, `${label}.${key}`, code, seen, depth + 1);
  }
}

function assertSafeString(value, label, code = PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID) {
  if (typeof value !== "string" || !SAFE_STRING.test(value) || FORBIDDEN_STRING.test(value)) {
    throw new ContractError(code, `${label} must be a bounded public-safe token`);
  }
  return value;
}

function assertPublicText(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || FORBIDDEN_STRING.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, `${label} must be public-safe text`);
  }
  return value;
}

function assertSortedUniqueStringArray(value, label, { allowNullOnly = false, allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (value.length === 0 && !allowEmpty)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, `${label} must be a non-empty array`);
  }
  if (allowNullOnly && value.length === 1 && value[0] === null) return [null];
  let previous = null;
  const copy = [];
  for (const item of value) {
    assertSafeString(item, `${label} item`);
    if (previous !== null && compareCodePoints(previous, item) >= 0) {
      throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, `${label} must be sorted and unique`);
    }
    previous = item;
    copy.push(item);
  }
  return copy;
}

function normalizeProfileRule(rawRule, bindingSourceRefs, existingRuleIds) {
  assertPlainData(rawRule, "profile rule", PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID);
  if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, "profile rule must be a plain object");
  }
  const keys = Object.keys(rawRule).sort(compareCodePoints);
  if (keys.length !== RULE_KEYS.length || !keys.every((key, index) => key === RULE_KEYS[index])) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, "profile rule must contain exactly the PCB rule fields");
  }
  if (typeof rawRule.rule_id !== "string" || !RULE_ID.test(rawRule.rule_id)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, "profile rule_id is invalid");
  }
  if (existingRuleIds.has(rawRule.rule_id)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_DUPLICATE, `duplicate rule_id ${rawRule.rule_id}`);
  }
  if (!bindingSourceRefs.includes(rawRule.source_ref)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_SOURCE_UNBOUND, "profile rule source_ref must be one of the binding source refs");
  }
  assertSafeString(rawRule.source_ref, "profile rule source_ref");
  assertPublicText(rawRule.source_locator, "profile rule source_locator");
  assertPublicText(rawRule.source_modality, "profile rule source_modality");
  if (!isPcbCoverageArea(rawRule.coverage_area)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, "profile rule coverage_area is unknown");
  }
  const authorityFamilies = assertSortedUniqueStringArray(rawRule.required_authority_families, "required_authority_families");
  if (!authorityFamilies.every((family) => AUTHORITY_KEYS.has(family))) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, "profile rule uses an unknown authority family");
  }
  const evidenceKeys = assertSortedUniqueStringArray(rawRule.expected_evidence_keys, "expected_evidence_keys");
  const artifactTokens = assertSortedUniqueStringArray(rawRule.allowed_artifact_tokens, "allowed_artifact_tokens", { allowNullOnly: true, allowEmpty: true });
  if (typeof rawRule.controlled_clause_hold !== "boolean") {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, "profile rule controlled_clause_hold must be Boolean");
  }
  if (isPcbControlledSourceRef(rawRule.source_ref) && rawRule.controlled_clause_hold !== true) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_RULE_INVALID, "controlled IPC-like source cannot bypass controlled_clause_hold");
  }
  return {
    rule_id: rawRule.rule_id,
    source_ref: rawRule.source_ref,
    source_locator: rawRule.source_locator,
    source_modality: rawRule.source_modality,
    coverage_area: rawRule.coverage_area,
    required_authority_families: authorityFamilies,
    expected_evidence_keys: evidenceKeys,
    allowed_artifact_tokens: artifactTokens,
    controlled_clause_hold: rawRule.controlled_clause_hold,
    claim_ceiling: "source_supported",
  };
}

function normalizeBindings(profileBindings) {
  if (!Array.isArray(profileBindings)) {
    throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profileBindings must be an array");
  }
  const kinds = new Set();
  return profileBindings.map((binding, index) => {
    assertPlainData(binding, `profileBindings[${index}]`, PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID);
    if (!binding || typeof binding !== "object" || Array.isArray(binding)
      || binding.domain_engine_id !== "pcb_compliance" || binding.order !== index
      || !["organization", "project"].includes(binding.profile_kind) || kinds.has(binding.profile_kind)
      || !Array.isArray(binding.source_refs) || !Array.isArray(binding.operations)) {
      throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profile binding is incomplete or out of order");
    }
    const keys = Object.keys(binding).sort(compareCodePoints);
    if (keys.length !== PROFILE_BINDING_KEYS.length || !keys.every((key, keyIndex) => key === PROFILE_BINDING_KEYS[keyIndex])) {
      throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profile binding must contain exactly the Core binding fields");
    }
    assertSafeString(binding.profile_id, "profile binding profile_id", PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID);
    assertSafeString(binding.revision_or_hash, "profile binding revision_or_hash", PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID);
    assertSafeString(binding.extends_or_base_pin, "profile binding extends_or_base_pin", PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID);
    assertSafeString(binding.operation_digest, "profile binding operation_digest", PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID);
    if (typeof binding.schema_version !== "string" || binding.schema_version !== "soulforge.engineering_profile_binding.v0") {
      throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profile binding schema_version is invalid");
    }
    if (binding.source_refs.length === 0) {
      throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID, "profile binding source_refs must be non-empty");
    }
    kinds.add(binding.profile_kind);
    for (const ref of binding.source_refs) assertSafeString(ref, "profile binding source_ref", PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID);
    return binding;
  });
}

export function calculatePcbDerivedRulesetContentId(rules, profileRuleProvenance) {
  const material = {
    schema_version: PCB_COMPLIANCE_RULESET_SCHEMA,
    revision: PCB_COMPLIANCE_RULESET_REVISION,
    source_packet_ref: PCB_COMPLIANCE_SOURCE_PACKET_REF,
    rules: rules.map(projectPcbRuleForDigest),
    profile_rule_provenance: profileRuleProvenance,
  };
  return `sha256:${sha256Hex(`soulforge.pcb_compliance.derived_ruleset.v0\n${canonicalise(material, {
    rules: "sorted_by:rule_id",
    "rules[].required_authority_families": "insertion_ordered",
    "rules[].expected_evidence_keys": "insertion_ordered",
    "rules[].allowed_artifact_mappings": "insertion_ordered",
  })}`)}`;
}

export function compilePcbComplianceRules(profileBindings = [], compilationScope = {}) {
  assertPlainData(compilationScope, "compilationScope", PCB_COMPILER_ERROR_CODES.PROFILE_BINDING_INVALID);
  const bindings = normalizeBindings(profileBindings);
  const rules = PCB_COMPLIANCE_RULES.map((rule) => ({
    ...rule,
    required_authority_families: [...rule.required_authority_families],
    expected_evidence_keys: [...rule.expected_evidence_keys],
    allowed_artifact_tokens: [...rule.allowed_artifact_tokens],
  }));
  const knownRuleIds = new Set(rules.map((rule) => rule.rule_id));
  const profileRuleProvenance = {};

  for (const binding of bindings) {
    for (const operation of binding.operations) {
      assertPlainData(operation, "profile operation", PCB_COMPILER_ERROR_CODES.PROFILE_OPERATION_MALFORMED);
      if (!operation || typeof operation !== "object" || Array.isArray(operation)
        || Object.keys(operation).length !== 2 || operation.op !== "add" || !Object.hasOwn(operation, "rule")) {
        throw new ContractError(PCB_COMPILER_ERROR_CODES.PROFILE_OPERATION_MALFORMED, "only { op: 'add', rule } operations are supported");
      }
      const rule = normalizeProfileRule(operation.rule, binding.source_refs, knownRuleIds);
      knownRuleIds.add(rule.rule_id);
      rules.push(rule);
      profileRuleProvenance[rule.rule_id] = {
        profile_id: binding.profile_id,
        profile_kind: binding.profile_kind,
        profile_order: binding.order,
        source_ref: rule.source_ref,
      };
    }
  }

  rules.sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  const contentId = calculatePcbDerivedRulesetContentId(rules, profileRuleProvenance);
  const isBase = bindings.length === 0;
  const rulesetRef = isBase ? PCB_COMPLIANCE_RULESET_REF : {
    entity_id: "pcb-compliance-ruleset-derived-v0",
    revision_id: PCB_COMPLIANCE_RULESET_REVISION,
    content_id: contentId,
    content_hash_alg: "sha256",
  };

  return deepFreeze({
    domain_engine_id: "pcb_compliance",
    schema_version: PCB_COMPLIANCE_RULESET_SCHEMA,
    source_packet_ref: { ...PCB_COMPLIANCE_SOURCE_PACKET_REF },
    ruleset_ref: { ...rulesetRef },
    rules,
    profile_rule_provenance: profileRuleProvenance,
    rule_count: rules.length,
  });
}

export const pcbComplianceCompilerAdapter = Object.freeze({
  domain_engine_id: "pcb_compliance",
  revision: PCB_COMPILER_ADAPTER_SCHEMA_VERSION,
  compile(profileBindings, compilationScope) {
    return { effective_rule_set: compilePcbComplianceRules(profileBindings, compilationScope) };
  },
});

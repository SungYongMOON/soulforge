// Deterministic public-safe PCB evidence-readiness evaluator. It has no filesystem, network,
// model, RAG, standard-body, approval, disposition, or product-acceptance side effect.
import types from "node:util/types";

import { APPLICABILITY, AUTHORITY_FAMILIES, resolveApplicability } from "../../../core/validators/authority.mjs";
import { canonicalise, compareCodePoints, inspectInstant } from "../../../core/validators/canonical.mjs";
import { ContractError } from "../../../core/validators/errors.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { arrayOrderRules, withoutNulls } from "../../../core/interfaces/domain_engine_adapter.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import {
  PCB_COMPLIANCE_RULES,
  PCB_COMPLIANCE_RULESET_REF,
  PCB_COMPLIANCE_RULESET_SCHEMA,
  PCB_COMPLIANCE_SOURCE_PACKET_REF,
  assertPublicSafeString,
  isPcbControlledSourceRef,
  isPublicSafeString,
  projectPcbRuleForDigest,
} from "../rules/pcb_compliance_rules.mjs";
import { calculatePcbDerivedRulesetContentId } from "../compiler/pcb_compliance_compiler_adapter.mjs";
import { isPcbControlledBodyAccessState, isPcbObservationState } from "../vocabulary/pcb_compliance_vocabulary.mjs";
import { admitPcbCoreTypedFacts } from "./pcb_compliance_fact_admission.mjs";

const DOMAIN_INPUT_SCHEMA = "soulforge.pcb_compliance.domain_input.v0";
const ASSESSMENT_SCHEMA = "soulforge.pcb_compliance.assessment.v0";
const DOMAIN_RESULT_SCHEMA = "soulforge.pcb_compliance.domain_result.v0";
const RECEIPT_SCHEMA = "soulforge.pcb_compliance.receipt.v0";
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:/#-]{0,255}$/u;
const SHA256_CONTENT_ID = /^sha256:[0-9a-f]{64}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const FORBIDDEN_STRING = /(?:^[A-Za-z]:[\\/]|^\\\\|^\/(?:etc|var|usr|home|root|tmp)\/|secret|password|bearer|api[_-]?key|token)/iu;
const CORE_EFFECTIVE_ENVELOPE_FIELDS = Object.freeze([
  "assembly_digest",
  "compilation_trace",
  "domain_engine_id",
  "effective_rule_set",
  "rule_count",
  "schema_version",
]);
const CORE_COMPILATION_TRACE_FIELDS = Object.freeze([
  "compilation_scope",
  "domain_adapter_revision",
  "domain_engine_id",
  "effective_ruleset_digest",
  "organization_trace",
  "profiles",
  "project_trace",
  "rule_count",
  "schema_version",
]);
const CORE_PROFILE_TRACE_FIELDS = Object.freeze([
  "applied_operations_count",
  "domain_engine_id",
  "extends_or_base_pin",
  "operation_digest",
  "order",
  "profile_id",
  "profile_kind",
  "revision_or_hash",
  "source_refs",
]);
const CORE_PROFILE_SUMMARY_TRACE_FIELDS = Object.freeze([
  "applied_operations_count",
  "domain_engine_id",
  "extends_or_base_pin",
  "operation_digest",
  "profile_id",
  "revision_or_hash",
  "source_refs",
]);
const CORE_DOMAIN_ADAPTER_REVISION = "soulforge.pcb_compliance.evaluator.v0";
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
  if (typeof value !== "string" || !SAFE_TOKEN.test(value) || FORBIDDEN_STRING.test(value) || !isPublicSafeString(value)) {
    fail(code, `${label} must be a bounded public-safe token`);
  }
  return value;
}

function assertPublicText(value, label, code = PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || FORBIDDEN_STRING.test(value) || /[\u0000-\u001f\u007f]/u.test(value) || !isPublicSafeString(value)) {
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
  const expectedKeys = [...RULE_FIELDS].sort(compareCodePoints);
  if (keys.length !== expectedKeys.length || !keys.every((key, index) => key === expectedKeys[index])) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule has an unexpected field shape");
  }
  assertSafeToken(rule.rule_id, "rule_id", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertSafeToken(rule.source_ref, "source_ref", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertPublicSafeString(rule.source_ref, "rule source_ref", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, fail);
  assertPublicText(rule.source_locator, "source_locator", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertPublicSafeString(rule.source_locator, "rule source_locator", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, fail);
  assertPublicText(rule.source_modality, "source_modality", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertPublicSafeString(rule.source_modality, "rule source_modality", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, fail);
  assertSafeToken(rule.coverage_area, "coverage_area", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  assertSortedUniqueTokens(rule.required_authority_families, "required_authority_families");
  if (!rule.required_authority_families.every((family) => AUTHORITY_KEYS.has(family))) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule has an unregistered authority family");
  }
  assertSortedUniqueTokens(rule.expected_evidence_keys, "expected_evidence_keys");
  assertSortedUniqueTokens(rule.allowed_artifact_tokens, "allowed_artifact_tokens", { allowNullOnly: true, allowEmpty: true });
  if (typeof rule.controlled_clause_hold !== "boolean") {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule controlled_clause_hold must be boolean");
  }
  const isBaseRule = PCB_COMPLIANCE_RULES.some((base) => base.rule_id === rule.rule_id);
  if (isBaseRule) {
    if (rule.claim_ceiling !== "source_supported") {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "base rule claim_ceiling must be source_supported");
    }
  } else {
    if (rule.claim_ceiling !== "observed") {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "profile-added rule cannot claim source_supported; ceiling must be observed");
    }
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

function assertExactKeys(value, expected, label, code = PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, `${label} must be a plain object`);
  const actualKeys = Object.keys(value).sort(compareCodePoints);
  const expectedKeys = [...expected].sort(compareCodePoints);
  if (actualKeys.length !== expectedKeys.length || !actualKeys.every((key, index) => key === expectedKeys[index])) {
    fail(code, `${label} has an invalid closed key set`);
  }
}

function validateCoreCompilationEnvelope(outerEnvelope, ruleset, cleanRules, canonicalRules) {
  assertExactKeys(outerEnvelope, CORE_EFFECTIVE_ENVELOPE_FIELDS, "Core compilation envelope", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  if (outerEnvelope.schema_version !== "soulforge.effective_rule_set.v0") {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation envelope schema_version is invalid");
  }
  if (outerEnvelope.domain_engine_id !== "pcb_compliance") {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation envelope domain_engine_id is invalid");
  }
  if (!Number.isSafeInteger(outerEnvelope.rule_count) || outerEnvelope.rule_count !== ruleset.rules.length) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation envelope rule_count mismatch");
  }
  const expectedAssemblyDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalRules}`);
  if (outerEnvelope.assembly_digest !== expectedAssemblyDigest) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation envelope assembly_digest does not match effective ruleset");
  }
  const trace = outerEnvelope.compilation_trace;
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation trace must be an object");
  }
  assertExactKeys(trace, CORE_COMPILATION_TRACE_FIELDS, "Core compilation trace", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
  if (trace.schema_version !== "soulforge.compilation_trace.v0") {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation trace schema_version is invalid");
  }
  if (trace.domain_engine_id !== "pcb_compliance") {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation trace domain_engine_id is invalid");
  }
  if (trace.domain_adapter_revision !== CORE_DOMAIN_ADAPTER_REVISION) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation trace domain_adapter_revision is invalid");
  }
  if (trace.effective_ruleset_digest !== expectedAssemblyDigest) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation trace effective_ruleset_digest mismatch");
  }
  if (trace.rule_count !== ruleset.rules.length) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation trace rule_count mismatch");
  }

  // PCB compliance defines no compilation-scope semantics: only exact empty plain object is admitted
  const scope = trace.compilation_scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)
      || (Object.getPrototypeOf(scope) !== Object.prototype && Object.getPrototypeOf(scope) !== null)
      || types.isProxy(scope)) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "compilation_scope must be a plain object");
  }
  const scopeDescriptors = Object.getOwnPropertyDescriptors(scope);
  for (const [key, desc] of Object.entries(scopeDescriptors)) {
    if (!desc.enumerable || typeof desc.get === "function" || typeof desc.set === "function") {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "compilation_scope contains unsafe accessor properties");
    }
  }
  if (Object.keys(scope).length !== 0) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "compilation_scope must be empty; PCB compliance defines no compilation scope");
  }

  if (!Array.isArray(trace.profiles) || trace.profiles.length > 2) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "Core compilation trace profiles is invalid");
  }
  const traceProfileKeys = new Set();
  for (let i = 0; i < trace.profiles.length; i += 1) {
    const p = trace.profiles[i];
    if (!p || typeof p !== "object" || Array.isArray(p)) fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "profile trace must be an object");
    assertExactKeys(p, CORE_PROFILE_TRACE_FIELDS, `profile trace ${i}`, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    if (p.domain_engine_id !== "pcb_compliance"
        || !["organization", "project"].includes(p.profile_kind)
        || p.order !== i
        || !Number.isSafeInteger(p.applied_operations_count)
        || p.applied_operations_count < 0
        || typeof p.operation_digest !== "string"
        || !SHA256_HEX.test(p.operation_digest)
        || !Array.isArray(p.source_refs)
        || p.source_refs.length === 0
        || p.source_refs.length > 64) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, `profile trace ${i} is malformed`);
    }
    assertSafeToken(p.profile_id, `profile trace ${i} profile_id`, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    assertSafeToken(p.revision_or_hash, `profile trace ${i} revision_or_hash`, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    assertSafeToken(p.extends_or_base_pin, `profile trace ${i} extends_or_base_pin`, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    for (const ref of p.source_refs) {
      assertSafeToken(ref, `profile trace ${i} source_ref`, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
      assertPublicText(ref, `profile trace ${i} source_ref`, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
      assertPublicSafeString(ref, `profile trace ${i} source_ref`, PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, fail);
    }
    const traceKey = `${p.profile_kind}\u0000${p.profile_id}`;
    if (traceProfileKeys.has(traceKey)) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "duplicate profile identity in compilation trace");
    }
    traceProfileKeys.add(traceKey);
  }
  if (trace.profiles.length === 2 && (trace.profiles[0].profile_kind !== "organization" || trace.profiles[1].profile_kind !== "project")) {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "profile sequence in compilation trace must be organization then project");
  }

  // Summary nullability and byte-canonical trace matching
  const orgProfile = trace.profiles.find((p) => p.profile_kind === "organization");
  const projProfile = trace.profiles.find((p) => p.profile_kind === "project");

  if (orgProfile) {
    if (trace.organization_trace === null || trace.organization_trace === undefined) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "organization_trace is required when organization profile exists");
    }
    assertExactKeys(trace.organization_trace, CORE_PROFILE_SUMMARY_TRACE_FIELDS, "organization_trace", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    if (trace.organization_trace.profile_id !== orgProfile.profile_id
        || trace.organization_trace.domain_engine_id !== orgProfile.domain_engine_id
        || trace.organization_trace.revision_or_hash !== orgProfile.revision_or_hash
        || trace.organization_trace.extends_or_base_pin !== orgProfile.extends_or_base_pin
        || trace.organization_trace.operation_digest !== orgProfile.operation_digest
        || trace.organization_trace.applied_operations_count !== orgProfile.applied_operations_count
        || canonicalise(trace.organization_trace.source_refs, { "": "insertion_ordered" }) !== canonicalise(orgProfile.source_refs, { "": "insertion_ordered" })) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "organization_trace must match organization profile trace exactly");
    }
  } else {
    if (trace.organization_trace !== null) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "organization_trace must be null when no organization profile exists");
    }
  }

  if (projProfile) {
    if (trace.project_trace === null || trace.project_trace === undefined) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "project_trace is required when project profile exists");
    }
    assertExactKeys(trace.project_trace, CORE_PROFILE_SUMMARY_TRACE_FIELDS, "project_trace", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    if (trace.project_trace.profile_id !== projProfile.profile_id
        || trace.project_trace.domain_engine_id !== projProfile.domain_engine_id
        || trace.project_trace.revision_or_hash !== projProfile.revision_or_hash
        || trace.project_trace.extends_or_base_pin !== projProfile.extends_or_base_pin
        || trace.project_trace.operation_digest !== projProfile.operation_digest
        || trace.project_trace.applied_operations_count !== projProfile.applied_operations_count
        || canonicalise(trace.project_trace.source_refs, { "": "insertion_ordered" }) !== canonicalise(projProfile.source_refs, { "": "insertion_ordered" })) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "project_trace must match project profile trace exactly");
    }
  } else {
    if (trace.project_trace !== null) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "project_trace must be null when no project profile exists");
    }
  }

  for (const profileTrace of trace.profiles) {
    const profileRulesWithProv = ruleset.rules
      .map((r) => ({ rule: r, prov: ruleset.profile_rule_provenance[r.rule_id] }))
      .filter(({ prov }) => prov && prov.profile_id === profileTrace.profile_id && prov.profile_kind === profileTrace.profile_kind && prov.profile_order === profileTrace.order);

    if (profileRulesWithProv.length !== profileTrace.applied_operations_count) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "applied_operations_count mismatch for profile");
    }

    const indices = profileRulesWithProv.map(({ prov }) => prov.operation_index).sort((a, b) => a - b);
    for (let idx = 0; idx < indices.length; idx += 1) {
      if (indices[idx] !== idx) {
        fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "operation_index gap or duplicate in profile");
      }
    }
    profileRulesWithProv.sort((a, b) => a.prov.operation_index - b.prov.operation_index);

    const reconstructedOps = [];
    for (const { rule, prov } of profileRulesWithProv) {
      if (!profileTrace.source_refs.includes(rule.source_ref)) {
        fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "rule source_ref is not in profile source_refs");
      }
      const singleOp = {
        op: "add",
        rule: {
          allowed_artifact_tokens: rule.allowed_artifact_tokens,
          controlled_clause_hold: rule.controlled_clause_hold,
          coverage_area: rule.coverage_area,
          expected_evidence_keys: rule.expected_evidence_keys,
          required_authority_families: rule.required_authority_families,
          rule_id: rule.rule_id,
          source_locator: rule.source_locator,
          source_modality: rule.source_modality,
          source_ref: rule.source_ref,
        },
      };
      const expectedItemDigest = normalizeProfileOperations([singleOp]).operation_digest;
      if (prov.operation_item_digest !== expectedItemDigest) {
        fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "operation_item_digest mismatch for rule");
      }
      reconstructedOps.push(singleOp);
    }
    const opCanon = normalizeProfileOperations(reconstructedOps);
    if (opCanon.operation_digest !== profileTrace.operation_digest) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "operation_digest mismatch for profile");
    }
  }
  for (const [ruleId, prov] of Object.entries(ruleset.profile_rule_provenance)) {
    const matchingTrace = trace.profiles.find((p) => p.profile_id === prov.profile_id && p.profile_kind === prov.profile_kind && p.order === prov.profile_order);
    if (!matchingTrace) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived rule has no matching profile in compilation trace");
    }
  }
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
    const provenanceExpectedKeys = [
      "operation_index",
      "operation_item_digest",
      "profile_id",
      "profile_kind",
      "profile_order",
      "source_ref",
    ];
    const provenanceActualKeys = provenance && typeof provenance === "object" && !Array.isArray(provenance)
      ? Object.keys(provenance).sort(compareCodePoints)
      : [];
    if (provenanceActualKeys.length !== provenanceExpectedKeys.length
      || !provenanceActualKeys.every((key, index) => key === provenanceExpectedKeys[index])) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived rule provenance has an invalid shape");
    }
    assertSafeToken(provenance.profile_id, "profile provenance profile_id", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    if (!["organization", "project"].includes(provenance.profile_kind)
      || !Number.isSafeInteger(provenance.profile_order)
      || provenance.profile_order < 0 || provenance.profile_order > 1
      || !Number.isSafeInteger(provenance.operation_index)
      || provenance.operation_index < 0
      || typeof provenance.operation_item_digest !== "string"
      || !SHA256_HEX.test(provenance.operation_item_digest)) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived rule provenance is invalid");
    }
    const rule = ruleset.rules.find((candidate) => candidate.rule_id === ruleId);
    if (provenance.source_ref !== rule.source_ref) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "derived rule provenance source_ref does not match its rule");
    }
    assertSafeToken(provenance.source_ref, "profile provenance source_ref", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID);
    assertPublicSafeString(provenance.source_ref, "profile provenance source_ref", PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, fail);
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
  const cleanRules = withoutNulls(ruleset);
  const canonicalRules = canonicalise(cleanRules, arrayOrderRules(cleanRules));
  if (isCoreEnvelope) {
    validateCoreCompilationEnvelope(outerEnvelope, ruleset, cleanRules, canonicalRules);
  } else {
    if (!sameExactRef(ruleset.ruleset_ref, PCB_COMPLIANCE_RULESET_REF)
      || provenanceKeys.length > 0
      || ruleset.rules.length !== PCB_COMPLIANCE_RULES.length) {
      fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "bare unwrapped effective ruleset is allowed only for the immutable base ruleset; derived rulesets require a complete Core compilation envelope");
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
  return {
    attempted: observation.attempted,
    evidence_state: observation.evidence_state,
    evidence_by_key: evidenceByKey,
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
  const validatedBinding = validateStandardBinding(row.standard_binding);
  const out = {
    case_id: assertSafeToken(row.case_id, "case_id"),
    rule_id: row.rule_id,
    applicability: assertApplicability(row.applicability),
    authority_bindings: validateAuthorityBindings(row.authority_bindings),
    observation: validateObservation(row.observation, rule),
  };
  if (validatedBinding !== null) out.standard_binding = validatedBinding;
  return out;
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
  const hasAllEvidenceKeys = rule.expected_evidence_keys.every((key) => Object.hasOwn(observation.evidence_by_key, key));
  if (!hasAllEvidenceKeys) return { ...base, state: "UNKNOWN", reason_code: "PCB_EVIDENCE_SUFFICIENCY_HOLD" };
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

export function validateRequest(request, effective) {
  if (!effective || typeof effective !== "object") {
    fail(PCB_EVALUATOR_ERROR_CODES.EFFECTIVE_RULESET_INVALID, "effective ruleset must be a plain object");
  }
  const effectiveRuleSet = Object.hasOwn(effective, "ruleset_ref") && Array.isArray(effective.rules)
    ? effective
    : validatePcbEffectiveRuleSet(effective);
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
  if (!sameExactRef(binding.ruleset_ref, effectiveRuleSet.ruleset_ref)) {
    fail(PCB_EVALUATOR_ERROR_CODES.BINDING_REFUSED, "binding ruleset_ref does not match effective ruleset");
  }
  const input = snapshot.domain_input;
  if (!input || typeof input !== "object" || Object.keys(input).length !== 2
    || input.schema_version !== DOMAIN_INPUT_SCHEMA || !Array.isArray(input.rows)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_input is invalid");
  }
  const cutoffs = snapshot.cutoffs;
  if (!cutoffs || typeof cutoffs !== "object" || Array.isArray(cutoffs) || Object.keys(cutoffs).length !== 2
    || typeof cutoffs.valid_at !== "string" || typeof cutoffs.known_at !== "string") {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "cutoffs are invalid");
  }
  if (!inspectInstant(cutoffs.valid_at).valid || !inspectInstant(cutoffs.known_at).valid) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "cutoffs must be canonical UTC instants with exact millisecond precision");
  }
  if (Date.parse(cutoffs.known_at) < Date.parse(cutoffs.valid_at)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "cutoffs.known_at precedes cutoffs.valid_at");
  }
  const rulesById = new Map(effectiveRuleSet.rules.map((rule) => [rule.rule_id, rule]));
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
  const sortedRows = [...rows].sort((left, right) => compareCodePoints(left.rule_id, right.rule_id));
  return {
    ...snapshot,
    binding: { ...binding, source_packet_ref: { ...binding.source_packet_ref }, ruleset_ref: { ...binding.ruleset_ref } },
    domain_input: { ...input, rows: sortedRows },
    cutoffs: { ...cutoffs },
  };
}

function validateAndCloneProjectFactsProvenance(value) {
  if (value === null || value === undefined) return null;
  const snapshot = snapshotPlainData(
    value,
    "project_facts_provenance",
    PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
  );
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_facts_provenance must be a plain object");
  }
  const PROVENANCE_KEYS = ["facts_digest", "known_at", "project_binding_ref", "valid_at"];
  const actualKeys = Object.keys(snapshot).sort(compareCodePoints);
  if (actualKeys.length !== PROVENANCE_KEYS.length || !actualKeys.every((k, i) => k === PROVENANCE_KEYS[i])) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_facts_provenance has an invalid key set");
  }
  if (typeof snapshot.facts_digest !== "string" || !SHA256_HEX.test(snapshot.facts_digest)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "facts_digest must be a 64-character sha256 hex digest");
  }
  if (!inspectInstant(snapshot.valid_at).valid || !inspectInstant(snapshot.known_at).valid) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_facts_provenance timestamps must be canonical UTC instants with millisecond precision");
  }
  if (Date.parse(snapshot.known_at) < Date.parse(snapshot.valid_at)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_facts_provenance known_at precedes valid_at");
  }
  const rawBinding = snapshot.project_binding_ref;
  if (!rawBinding || typeof rawBinding !== "object" || Array.isArray(rawBinding)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_binding_ref must be a plain object");
  }
  const REQUIRED_BINDING_KEYS = ["binding_revision_hash", "domain_engine_id", "project_id", "schema_version", "source_manifest_ref"];
  const OPTIONAL_BINDING_KEYS = ["authority_family", "document_refs", "known_at", "valid_at"];
  for (const req of REQUIRED_BINDING_KEYS) {
    if (!Object.hasOwn(rawBinding, req)) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `project_binding_ref is missing ${req}`);
  }
  for (const key of Object.keys(rawBinding)) {
    if (!REQUIRED_BINDING_KEYS.includes(key) && !OPTIONAL_BINDING_KEYS.includes(key)) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_binding_ref has an unexpected key");
    }
  }
  if (rawBinding.schema_version !== "soulforge.project_binding.v0" || rawBinding.domain_engine_id !== "pcb_compliance") {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_binding_ref schema_version or domain_engine_id is invalid");
  }
  assertSafeToken(rawBinding.project_id, "project_binding_ref.project_id");
  assertSafeToken(rawBinding.binding_revision_hash, "project_binding_ref.binding_revision_hash");
  assertSafeToken(rawBinding.source_manifest_ref, "project_binding_ref.source_manifest_ref");
  if (Object.hasOwn(rawBinding, "authority_family")) {
    assertSafeToken(rawBinding.authority_family, "project_binding_ref.authority_family");
    if (!AUTHORITY_KEYS.has(rawBinding.authority_family)) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_binding_ref authority_family is unknown");
    }
  }
  if (Object.hasOwn(rawBinding, "valid_at")) {
    if (!inspectInstant(rawBinding.valid_at).valid || rawBinding.valid_at !== snapshot.valid_at) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_binding_ref valid_at must match provenance valid_at");
    }
  }
  if (Object.hasOwn(rawBinding, "known_at")) {
    if (!inspectInstant(rawBinding.known_at).valid || rawBinding.known_at !== snapshot.known_at) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "project_binding_ref known_at must match provenance known_at");
    }
  }
  let documentRefs = undefined;
  if (Object.hasOwn(rawBinding, "document_refs")) {
    if (!Array.isArray(rawBinding.document_refs)) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "document_refs must be an array");
    documentRefs = [];
    let priorDoc = null;
    for (const doc of rawBinding.document_refs) {
      assertSafeToken(doc, "document_refs item");
      assertPublicSafeString(doc, "document_refs item", PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, fail);
      if (priorDoc !== null && compareCodePoints(priorDoc, doc) >= 0) {
        fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "document_refs must be strictly code-point sorted and duplicate-free");
      }
      priorDoc = doc;
      documentRefs.push(doc);
    }
  }
  const cleanBinding = {
    schema_version: rawBinding.schema_version,
    project_id: rawBinding.project_id,
    domain_engine_id: rawBinding.domain_engine_id,
    binding_revision_hash: rawBinding.binding_revision_hash,
    source_manifest_ref: rawBinding.source_manifest_ref,
  };
  if (rawBinding.authority_family !== undefined) cleanBinding.authority_family = rawBinding.authority_family;
  if (documentRefs !== undefined) cleanBinding.document_refs = documentRefs;
  if (rawBinding.valid_at !== undefined) cleanBinding.valid_at = rawBinding.valid_at;
  if (rawBinding.known_at !== undefined) cleanBinding.known_at = rawBinding.known_at;

  return {
    project_binding_ref: cleanBinding,
    facts_digest: snapshot.facts_digest,
    valid_at: snapshot.valid_at,
    known_at: snapshot.known_at,
  };
}

function buildPcbComplianceResultInternal(acceptedRequest, effective, validatedProvenance) {
  const byId = new Map(effective.rules.map((rule) => [rule.rule_id, rule]));
  const results = acceptedRequest.domain_input.rows
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
  const effectiveCeilings = effective.rules.map((rule) => rule.claim_ceiling);
  const aggregateClaimCeiling = effectiveCeilings.includes("observed") ? "observed" : "source_supported";
  const domainResult = {
    schema_version: DOMAIN_RESULT_SCHEMA,
    domain_engine_id: "pcb_compliance",
    claim_ceiling: aggregateClaimCeiling,
    product_acceptance: "NOT_EVALUATED",
    workmanship_compliance: "NOT_EVALUATED",
  };
  if (validatedProvenance) domainResult.project_facts_provenance = validatedProvenance;

  const canonicalInput = {
    request: acceptedRequest,
    ruleset_ref: { ...effective.ruleset_ref },
    source_packet_ref: { ...effective.source_packet_ref },
    ...(validatedProvenance ? { project_facts_provenance: validatedProvenance } : {}),
  };
  const inputOrderRules = {
    ...arrayOrderRules(canonicalInput),
    rows: "sorted_by:rule_id",
    "request.domain_input.rows": "sorted_by:rule_id",
  };
  const inputDigest = sha256Hex(`soulforge.pcb_compliance.input.v0\n${canonicalise(canonicalInput, inputOrderRules)}`);

  const assessmentMaterial = validatedProvenance
    ? { assessment, project_facts_provenance: validatedProvenance }
    : assessment;
  const assessmentOrderRules = {
    ...arrayOrderRules(assessmentMaterial),
    results: "sorted_by:rule_id",
    "assessment.results": "sorted_by:rule_id",
  };
  const assessmentDigest = sha256Hex(`soulforge.pcb_compliance.assessment.v0\n${canonicalise(assessmentMaterial, assessmentOrderRules)}`);
  const domainResultOrderRules = arrayOrderRules(domainResult);
  const domainResultDigest = sha256Hex(`soulforge.pcb_compliance.domain_result.v0\n${canonicalise(domainResult, domainResultOrderRules)}`);

  const resultMaterial = {
    assessment,
    domain_result: domainResult,
  };
  const resultOrderRules = {
    ...arrayOrderRules(resultMaterial),
    results: "sorted_by:rule_id",
    "assessment.results": "sorted_by:rule_id",
  };
  const resultDigest = sha256Hex(`soulforge.pcb_compliance.result.v0\n${canonicalise(resultMaterial, resultOrderRules)}`);

  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    domain_engine_id: "pcb_compliance",
    ruleset_ref: { ...effective.ruleset_ref },
    source_packet_ref: { ...effective.source_packet_ref },
    input_digest: inputDigest,
    assessment_digest: assessmentDigest,
    domain_result_digest: domainResultDigest,
    result_digest: resultDigest,
    effects: { ...EFFECTS },
  };
  if (validatedProvenance) receipt.project_facts_provenance = validateAndCloneProjectFactsProvenance(validatedProvenance);

  return { assessment, domain_result: domainResult, receipt };
}

export function admitTrustedInput(rawTrustedInput, effective) {
  if (rawTrustedInput === null || rawTrustedInput === undefined) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "trusted evaluation input is required for verification");
  }
  const snapshot = snapshotPlainData(
    rawTrustedInput,
    "trusted evaluation input",
    PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
    new Set(),
    new Set(),
    { allowAliases: true },
  );
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "trusted evaluation input must be a plain object");
  }

  if (snapshot.schema_version === "soulforge.typed_project_facts.v0") {
    const admittedFacts = admitPcbCoreTypedFacts(snapshot);
    const acceptedRequest = validateRequest(admittedFacts.request, effective);
    return {
      acceptedRequest,
      validatedProvenance: admittedFacts.provenance,
    };
  }

  if (Object.hasOwn(snapshot, "request")) {
    const WRAPPER_KEYS = ["project_facts_provenance", "request"];
    const actualKeys = Object.keys(snapshot).sort(compareCodePoints);
    for (const key of actualKeys) {
      if (!WRAPPER_KEYS.includes(key)) {
        fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "trusted evaluation input container has unexpected keys");
      }
    }
    const acceptedRequest = validateRequest(snapshot.request, effective);
    const validatedProvenance = validateAndCloneProjectFactsProvenance(snapshot.project_facts_provenance ?? null);
    return {
      acceptedRequest,
      validatedProvenance,
    };
  }

  if (snapshot.schema_version === "soulforge.pcb_compliance.request.v0") {
    const acceptedRequest = validateRequest(snapshot, effective);
    return {
      acceptedRequest,
      validatedProvenance: null,
    };
  }

  fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "trusted evaluation input has an unknown schema or format");
}

export function assessPcbCompliance(request, suppliedEffectiveRuleSet = null, admittedProjectFactsProvenance = null) {
  const effective = suppliedEffectiveRuleSet ? validatePcbEffectiveRuleSet(suppliedEffectiveRuleSet) : baseEffectiveRuleSet();
  const accepted = validateRequest(request, effective);
  const projectFactsProvenance = validateAndCloneProjectFactsProvenance(admittedProjectFactsProvenance);

  const emitted = buildPcbComplianceResultInternal(accepted, effective, projectFactsProvenance);

  const trustedInput = projectFactsProvenance !== null
    ? { request: accepted, project_facts_provenance: projectFactsProvenance }
    : { request: accepted };

  verifyPcbComplianceResult(emitted, suppliedEffectiveRuleSet, trustedInput);

  return deepFreeze(emitted);
}

export function verifyPcbComplianceResult(rawResult, suppliedEffectiveRuleSet = null, rawTrustedInput = null) {
  if (rawTrustedInput === null || rawTrustedInput === undefined) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "trusted evaluation input is required for verification");
  }

  const effective = suppliedEffectiveRuleSet === null
    ? baseEffectiveRuleSet()
    : validatePcbEffectiveRuleSet(suppliedEffectiveRuleSet);

  const { acceptedRequest, validatedProvenance } = admitTrustedInput(rawTrustedInput, effective);

  const expected = buildPcbComplianceResultInternal(acceptedRequest, effective, validatedProvenance);

  const result = snapshotPlainData(
    rawResult,
    "compliance result",
    PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED,
    new Set(),
    new Set(),
    { allowAliases: true },
  );
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "compliance result must be a plain object");
  }
  const RESULT_REQUIRED_KEYS = ["assessment", "domain_result", "receipt"];
  const resultKeys = Object.keys(result).sort(compareCodePoints);
  if (resultKeys.length !== RESULT_REQUIRED_KEYS.length || !resultKeys.every((k, i) => k === RESULT_REQUIRED_KEYS[i])) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "compliance result must contain exactly assessment, domain_result, and receipt");
  }

  // 1. Validate domain_result
  const dr = result.domain_result;
  if (!dr || typeof dr !== "object" || Array.isArray(dr)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_result must be a plain object");
  }
  const DOMAIN_RESULT_REQUIRED_KEYS = [
    "claim_ceiling",
    "domain_engine_id",
    "product_acceptance",
    "schema_version",
    "workmanship_compliance",
  ];
  const DOMAIN_RESULT_OPTIONAL_KEYS = ["project_facts_provenance"];
  for (const req of DOMAIN_RESULT_REQUIRED_KEYS) {
    if (!Object.hasOwn(dr, req)) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `domain_result is missing ${req}`);
  }
  for (const key of Object.keys(dr)) {
    if (!DOMAIN_RESULT_REQUIRED_KEYS.includes(key) && !DOMAIN_RESULT_OPTIONAL_KEYS.includes(key)) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_result has an unexpected key");
    }
  }
  if (dr.schema_version !== DOMAIN_RESULT_SCHEMA) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_result schema_version is invalid");
  if (dr.domain_engine_id !== "pcb_compliance") fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_result domain_engine_id is invalid");
  if (dr.product_acceptance !== "NOT_EVALUATED") fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_result product_acceptance must be NOT_EVALUATED");
  if (dr.workmanship_compliance !== "NOT_EVALUATED") fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_result workmanship_compliance must be NOT_EVALUATED");

  const effectiveCeilings = effective.rules.map((rule) => rule.claim_ceiling);
  const expectedClaimCeiling = effectiveCeilings.includes("observed") ? "observed" : "source_supported";
  if (dr.claim_ceiling !== expectedClaimCeiling) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "domain_result claim_ceiling does not match effective ruleset claim ceiling");
  }

  // 2. Validate receipt
  const rc = result.receipt;
  if (!rc || typeof rc !== "object" || Array.isArray(rc)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt must be a plain object");
  }
  const RECEIPT_REQUIRED_KEYS = [
    "assessment_digest",
    "domain_engine_id",
    "domain_result_digest",
    "effects",
    "input_digest",
    "result_digest",
    "ruleset_ref",
    "schema_version",
    "source_packet_ref",
  ];
  const RECEIPT_OPTIONAL_KEYS = ["project_facts_provenance"];
  for (const req of RECEIPT_REQUIRED_KEYS) {
    if (!Object.hasOwn(rc, req)) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `receipt is missing ${req}`);
  }
  for (const key of Object.keys(rc)) {
    if (!RECEIPT_REQUIRED_KEYS.includes(key) && !RECEIPT_OPTIONAL_KEYS.includes(key)) {
      fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt has an unexpected key");
    }
  }
  if (rc.schema_version !== RECEIPT_SCHEMA) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt schema_version is invalid");
  if (rc.domain_engine_id !== "pcb_compliance") fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt domain_engine_id is invalid");
  if (!sameExactRef(rc.ruleset_ref, effective.ruleset_ref)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt ruleset_ref does not match effective ruleset_ref");
  }
  if (!sameExactRef(rc.source_packet_ref, effective.source_packet_ref)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt source_packet_ref does not match effective source_packet_ref");
  }
  if (typeof rc.input_digest !== "string" || !SHA256_HEX.test(rc.input_digest)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt input_digest is invalid");
  }
  if (typeof rc.assessment_digest !== "string" || !SHA256_HEX.test(rc.assessment_digest)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt assessment_digest is invalid");
  }
  if (typeof rc.domain_result_digest !== "string" || !SHA256_HEX.test(rc.domain_result_digest)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt domain_result_digest is invalid");
  }
  if (typeof rc.result_digest !== "string" || !SHA256_HEX.test(rc.result_digest)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt result_digest is invalid");
  }
  if (!rc.effects || typeof rc.effects !== "object" || Array.isArray(rc.effects)) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt effects must be a plain object");
  }
  const EFFECT_KEYS = ["external_actions", "filesystem_writes", "model_calls", "network_calls", "rag_queries"];
  const effectKeys = Object.keys(rc.effects).sort(compareCodePoints);
  if (effectKeys.length !== EFFECT_KEYS.length || !effectKeys.every((k, i) => k === EFFECT_KEYS[i])) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "receipt effects contains unexpected or missing keys");
  }
  for (const k of EFFECT_KEYS) {
    if (rc.effects[k] !== 0) fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, `receipt effect ${k} must be 0`);
  }

  // 3. Complete canonical byte equality check
  const fullOrderRules = {
    ...arrayOrderRules(expected),
    results: "sorted_by:rule_id",
    "assessment.results": "sorted_by:rule_id",
  };
  const expectedCanonical = canonicalise(expected, fullOrderRules);
  const actualCanonical = canonicalise(result, fullOrderRules);

  if (actualCanonical !== expectedCanonical) {
    fail(PCB_EVALUATOR_ERROR_CODES.INPUT_REFUSED, "compliance result does not match deterministic evaluation of trusted input");
  }

  return deepFreeze({
    verified: true,
    ruleset_ref: { ...expected.receipt.ruleset_ref },
    source_packet_ref: { ...expected.receipt.source_packet_ref },
    input_digest: expected.receipt.input_digest,
    assessment_digest: expected.receipt.assessment_digest,
    domain_result_digest: expected.receipt.domain_result_digest,
    result_digest: expected.receipt.result_digest,
  });
}

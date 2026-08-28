// Core-facing FFCA evaluator adapter. It verifies the exact candidate base ruleset before
// projecting the public-safe typed-facts request into an evidence-readiness assessment.
import types from "node:util/types";

import { ContractError } from "../../../core/validators/errors.mjs";
import {
  COMPILATION_TRACE_SCHEMA_VERSION,
  EFFECTIVE_RULE_SET_SCHEMA_VERSION,
  PROFILE_BINDING_SCHEMA_VERSION,
  arrayOrderRules,
  registerDomainEngineAdapter,
  withoutNulls,
} from "../../../core/interfaces/domain_engine_adapter.mjs";
import { normalizeProfileOperations } from "../../../core/interfaces/profile_operation_canon.mjs";
import { canonicalise } from "../../../core/validators/canonical.mjs";
import { sha256Hex } from "../../../core/validators/fingerprint.mjs";
import { fieldFailureCorrectiveActionCompilerAdapter } from "../compiler/field_failure_corrective_action_compiler_adapter.mjs";
import {
  canonicalFfcaDigest,
  computeFfcaCompilationScopeDigest,
  computeFfcaProfileProvenanceDigest,
  isFfcaFloatingRevision,
} from "../rules/field_failure_corrective_action_binding_integrity.mjs";
import {
  FFCA_RULES,
  FFCA_RULESET_REF,
  FFCA_RULESET_SCHEMA,
  FFCA_SOURCE_PACKET_REF,
} from "../rules/field_failure_corrective_action_rules.mjs";
import { FFCA_FORBIDDEN_AUTHORITY_FIELDS } from "../rules/field_failure_corrective_action_vocabulary.mjs";
import { assessFieldFailureCorrectiveAction } from "./field_failure_corrective_action.mjs";
import { admitFfcaTypedProjectFacts } from "./field_failure_corrective_action_typed_facts_adapter.mjs";

export const FFCA_EVALUATOR_ADAPTER_SCHEMA_VERSION = "soulforge.field_failure_corrective_action.evaluator.v0";

const INNER_RULESET_FIELDS = Object.freeze([
  "compilation_scope_digest",
  "domain_engine_id",
  "profile_rule_provenance",
  "rules",
  "ruleset_ref",
  "schema_version",
  "source_packet_ref",
]);
const CORE_ASSEMBLY_FIELDS = Object.freeze([
  "assembly_digest",
  "compilation_trace",
  "domain_engine_id",
  "effective_rule_set",
  "rule_count",
  "schema_version",
]);
const REF_FIELDS = Object.freeze([
  "content_hash_alg",
  "content_id",
  "entity_id",
  "revision_id",
]);
const PROFILE_FIELDS = Object.freeze([
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
const TRACE_FIELDS = Object.freeze([
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
const TRACE_PROFILE_FIELDS = Object.freeze([
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
const TRACE_SHORT_PROFILE_FIELDS = Object.freeze([
  "applied_operations_count",
  "domain_engine_id",
  "extends_or_base_pin",
  "operation_digest",
  "profile_id",
  "revision_or_hash",
  "source_refs",
]);
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function fail(code, message) {
  throw new ContractError(code, message);
}

function snapshotPlainData(value, label = "effective rule set", depth = 0, ancestors = new WeakSet()) {
  if (depth > 16) fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} exceeds maximum nesting depth`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} number must be a safe integer`);
    return value;
  }
  if (!value || typeof value !== "object" || types.isProxy(value)) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} must contain plain non-proxy data`);
  }
  if (ancestors.has(value)) fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} must be acyclic`);
  ancestors.add(value);

  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype)) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} must use a standard data prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} may not contain symbol keys`);
  }
  for (const key of keys) {
    if (isArray && key === "length") continue;
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
        || (!isArray && PROTOTYPE_SENSITIVE_KEYS.has(key))) {
      fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} may not contain accessors, hidden fields, or prototype-sensitive keys`);
    }
  }
  if (isArray) {
    const length = descriptors.length?.value;
    const indexes = keys.filter((key) => key !== "length");
    if (!Number.isSafeInteger(length) || length < 0 || indexes.length !== length
        || indexes.some((key) => !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)) {
      fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} must be a dense array without named properties`);
    }
    const copy = Array.from({ length }, (_unused, index) => snapshotPlainData(
      descriptors[String(index)].value,
      `${label}[${index}]`,
      depth + 1,
      ancestors,
    ));
    ancestors.delete(value);
    return copy;
  }
  const copy = {};
  for (const key of keys) copy[key] = snapshotPlainData(descriptors[key].value, `${label}.${key}`, depth + 1, ancestors);
  ancestors.delete(value);
  return copy;
}

function assertExactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} must contain exactly its declared fields`);
  }
}

function structurallyEqual(actual, expected) {
  if (actual === expected) return true;
  if (actual === null || expected === null || typeof actual !== typeof expected) return false;
  if (typeof actual !== "object") return false;
  if (Array.isArray(actual) !== Array.isArray(expected)) return false;
  if (Array.isArray(actual)) {
    return actual.length === expected.length && actual.every((value, index) => structurallyEqual(value, expected[index]));
  }
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && structurallyEqual(actual[key], expected[key]));
}

function assertExactRef(actual, expected, label) {
  assertExactKeys(actual, REF_FIELDS, label);
  if (!structurallyEqual(actual, expected)) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} does not match the exact FFCA candidate reference`);
  }
}

function assertNonEmptyString(value, label, { rejectUnversioned = false, rejectFloating = false } = {}) {
  if (typeof value !== "string" || !value.trim() || (rejectUnversioned && value === "unversioned")
      || (rejectFloating && isFfcaFloatingRevision(value))) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", `${label} must be a non-empty string`);
  }
}

function assertProfileProvenance(profiles) {
  if (!Array.isArray(profiles) || profiles.length > 2) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "profile_rule_provenance must be a bounded array");
  }
  let priorKind = null;
  profiles.forEach((profile, index) => {
    assertExactKeys(profile, PROFILE_FIELDS, `profile_rule_provenance[${index}]`);
    if (profile.schema_version !== PROFILE_BINDING_SCHEMA_VERSION
        || profile.domain_engine_id !== "field_failure_corrective_action") {
      fail("FFCA_EFFECTIVE_RULESET_INVALID", "profile provenance schema or domain does not match FFCA");
    }
    const expectedKind = index === 0 ? profile.profile_kind : "project";
    if ((expectedKind !== "organization" && expectedKind !== "project")
        || profile.profile_kind !== expectedKind
        || (index === 1 && priorKind !== "organization")
        || !Number.isInteger(profile.order) || profile.order !== index) {
      fail("FFCA_EFFECTIVE_RULESET_INVALID", "profile provenance order or kind is invalid");
    }
    for (const field of ["profile_id", "revision_or_hash", "extends_or_base_pin", "operation_digest"]) {
      assertNonEmptyString(profile[field], `profile provenance ${field}`);
    }
    assertNonEmptyString(profile.revision_or_hash, "profile provenance revision_or_hash", { rejectUnversioned: true, rejectFloating: true });
    assertNonEmptyString(profile.extends_or_base_pin, "profile provenance extends_or_base_pin", { rejectFloating: true });
    if (!Array.isArray(profile.source_refs) || profile.source_refs.length === 0
        || profile.source_refs.some((ref) => typeof ref !== "string" || !ref.trim() || isFfcaFloatingRevision(ref))
        || !Array.isArray(profile.operations) || profile.operations.length !== 0) {
      fail("FFCA_EFFECTIVE_RULESET_INVALID", "profile provenance source_refs or operations are invalid");
    }
    const normalizedOperations = normalizeProfileOperations(profile.operations);
    if (profile.operation_digest !== normalizedOperations.operation_digest
        || !structurallyEqual(profile.operations, normalizedOperations.operations)) {
      fail("FFCA_EFFECTIVE_RULESET_INVALID", "profile provenance operation digest is not Core-canonical");
    }
    priorKind = profile.profile_kind;
  });
}

function assertCoreAssemblyShape(snapshot) {
  assertExactKeys(snapshot, CORE_ASSEMBLY_FIELDS, "Core effective-rule assembly");
  if (snapshot.schema_version !== EFFECTIVE_RULE_SET_SCHEMA_VERSION
      || snapshot.domain_engine_id !== "field_failure_corrective_action"
      || !Number.isInteger(snapshot.rule_count) || snapshot.rule_count !== FFCA_RULES.length
      || typeof snapshot.assembly_digest !== "string" || !snapshot.assembly_digest) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core effective-rule assembly is invalid");
  }
  if (!snapshot.compilation_trace || typeof snapshot.compilation_trace !== "object" || Array.isArray(snapshot.compilation_trace)) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core compilation trace is invalid");
  }
}

function traceProfile(profile) {
  return {
    order: profile.order,
    profile_kind: profile.profile_kind,
    profile_id: profile.profile_id,
    domain_engine_id: profile.domain_engine_id,
    revision_or_hash: profile.revision_or_hash,
    extends_or_base_pin: profile.extends_or_base_pin,
    operation_digest: profile.operation_digest,
    applied_operations_count: profile.operations.length,
    source_refs: profile.source_refs,
  };
}

function shortTraceProfile(profile) {
  return {
    profile_id: profile.profile_id,
    domain_engine_id: profile.domain_engine_id,
    revision_or_hash: profile.revision_or_hash,
    extends_or_base_pin: profile.extends_or_base_pin,
    operation_digest: profile.operation_digest,
    applied_operations_count: profile.operations.length,
    source_refs: profile.source_refs,
  };
}

function effectiveRulesetDigest(ruleSet) {
  const cleanRules = withoutNulls(ruleSet);
  const canonicalRules = canonicalise(cleanRules, arrayOrderRules(cleanRules));
  return sha256Hex("soulforge.effective_rule_set.v0\n" + canonicalRules);
}

function assertCoreTraceCoherence(assembly, ruleSet) {
  const trace = assembly.compilation_trace;
  assertExactKeys(trace, TRACE_FIELDS, "Core compilation trace");
  if (trace.schema_version !== COMPILATION_TRACE_SCHEMA_VERSION
      || trace.domain_engine_id !== "field_failure_corrective_action"
      || trace.domain_adapter_revision !== fieldFailureCorrectiveActionCompilerAdapter.revision
      || !Number.isInteger(trace.rule_count) || trace.rule_count !== FFCA_RULES.length) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core compilation trace identity is invalid");
  }
  const digest = effectiveRulesetDigest(ruleSet);
  if (assembly.assembly_digest !== digest || trace.effective_ruleset_digest !== digest) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core assembly and trace effective-ruleset digests are incoherent");
  }
  if (typeof ruleSet.compilation_scope_digest !== "string"
      || !/^[0-9a-f]{64}$/u.test(ruleSet.compilation_scope_digest)
      || ruleSet.compilation_scope_digest !== computeFfcaCompilationScopeDigest(trace.compilation_scope)) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core compilation scope is incoherent with the admitted FFCA rule set");
  }
  const expectedProfiles = ruleSet.profile_rule_provenance.map(traceProfile);
  if (!Array.isArray(trace.profiles) || trace.profiles.length !== expectedProfiles.length) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core trace profile count is invalid");
  }
  trace.profiles.forEach((profile, index) => {
    assertExactKeys(profile, TRACE_PROFILE_FIELDS, "Core trace profiles[" + index + "]");
    if (!structurallyEqual(profile, expectedProfiles[index])) {
      fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core trace profile provenance does not match the effective rule set");
    }
  });
  const organization = ruleSet.profile_rule_provenance.find((profile) => profile.profile_kind === "organization");
  const project = ruleSet.profile_rule_provenance.find((profile) => profile.profile_kind === "project");
  if (organization) assertExactKeys(trace.organization_trace, TRACE_SHORT_PROFILE_FIELDS, "Core organization trace");
  if (project) assertExactKeys(trace.project_trace, TRACE_SHORT_PROFILE_FIELDS, "Core project trace");
  if (!structurallyEqual(trace.organization_trace, organization ? shortTraceProfile(organization) : null)
      || !structurallyEqual(trace.project_trace, project ? shortTraceProfile(project) : null)) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "Core organization/project trace does not match effective profile provenance");
  }
  return Object.freeze({
    assembly_digest: assembly.assembly_digest,
    compilation_scope_digest: ruleSet.compilation_scope_digest,
    effective_ruleset_digest: trace.effective_ruleset_digest,
    profile_provenance_digest: computeFfcaProfileProvenanceDigest(ruleSet.profile_rule_provenance),
  });
}

function verifyEffectiveRuleSet(effectiveRuleSet) {
  const snapshot = snapshotPlainData(effectiveRuleSet);
  const hasCoreAssembly = Object.hasOwn(snapshot, "effective_rule_set");
  if (!hasCoreAssembly) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "FFCA TypedProjectFacts admission requires an exact Core effective-rule assembly");
  }
  assertCoreAssemblyShape(snapshot);
  const ruleSet = hasCoreAssembly ? snapshot.effective_rule_set : snapshot;
  assertExactKeys(ruleSet, INNER_RULESET_FIELDS, "FFCA effective rule set");
  if (ruleSet.schema_version !== FFCA_RULESET_SCHEMA
      || ruleSet.domain_engine_id !== "field_failure_corrective_action"
      || !Array.isArray(ruleSet.rules)
      || ruleSet.rules.length !== FFCA_RULES.length) {
    fail("FFCA_EFFECTIVE_RULESET_INVALID", "effective rule set is not the exact FFCA base candidate");
  }
  assertExactRef(ruleSet.ruleset_ref, FFCA_RULESET_REF, "ruleset_ref");
  assertExactRef(ruleSet.source_packet_ref, FFCA_SOURCE_PACKET_REF, "source_packet_ref");
  for (let index = 0; index < FFCA_RULES.length; index += 1) {
    if (!structurallyEqual(ruleSet.rules[index], FFCA_RULES[index])) {
      fail("FFCA_RULESET_UNSUPPORTED", "FFCA v0 does not evaluate substituted or derived rule rows");
    }
  }
  assertProfileProvenance(ruleSet.profile_rule_provenance);
  const traceBinding = assertCoreTraceCoherence(snapshot, ruleSet);
  return Object.freeze({
    ...traceBinding,
    ruleset_ref: ruleSet.ruleset_ref,
    source_packet_ref: ruleSet.source_packet_ref,
  });
}

function admissionSnapshot(value, label) {
  try {
    return snapshotPlainData(value, label);
  } catch {
    fail("FFCA_INPUT_REFUSED", label + " must be exact plain admission data");
  }
}

function admitAuthority(authority) {
  const admitted = admissionSnapshot(authority, "authority");
  if (!admitted || typeof admitted !== "object" || Array.isArray(admitted)) {
    fail("FFCA_INPUT_REFUSED", "authority must be an exact empty candidate-authority object");
  }
  const keys = Object.keys(admitted);
  if (keys.length !== 0) {
    if (keys.some((key) => FFCA_FORBIDDEN_AUTHORITY_FIELDS.includes(key)
        || /(approval|disposition|release|reporting|closure)/iu.test(key))) {
      fail("FFCA_FORBIDDEN_AUTHORITY_FIELD", "authority fields are outside FFCA authority");
    }
    fail("FFCA_INPUT_REFUSED", "authority must be empty");
  }
  return Object.freeze({});
}

function admitCutoffs(cutoffs, typedBinding) {
  const admitted = admissionSnapshot(cutoffs, "cutoffs");
  if (!admitted || typeof admitted !== "object" || Array.isArray(admitted)) {
    fail("FFCA_INPUT_REFUSED", "cutoffs must be an exact empty object or exact typed-facts cutoffs");
  }
  const keys = Object.keys(admitted).sort();
  if (keys.length === 0) {
    return Object.freeze({
      known_at: typedBinding.known_at,
      mode: "typed_facts_default",
      valid_at: typedBinding.valid_at,
    });
  }
  if (keys.length !== 2 || keys[0] !== "known_at" || keys[1] !== "valid_at"
      || admitted.valid_at !== typedBinding.valid_at || admitted.known_at !== typedBinding.known_at) {
    fail("FFCA_INPUT_REFUSED", "cutoffs must exactly match admitted typed-facts cutoffs");
  }
  return Object.freeze({
    known_at: admitted.known_at,
    mode: "explicit_exact",
    valid_at: admitted.valid_at,
  });
}

function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function semanticResultMaterial(assessment, receipt) {
  return {
    authority_boundary: assessment.authority_boundary,
    case_summaries: assessment.case_summaries,
    claim_ceiling: assessment.claim_ceiling,
    counts: assessment.counts,
    domain_engine_id: assessment.domain_engine_id,
    execution_effects: assessment.execution_effects,
    input_digest: assessment.input_digest,
    results: assessment.results,
    ruleset_ref: assessment.ruleset_ref,
    schema_version: assessment.schema_version,
    source_packet_ref: assessment.source_packet_ref,
    receipt,
  };
}

export const fieldFailureCorrectiveActionAdapter = Object.freeze({
  ...fieldFailureCorrectiveActionCompilerAdapter,
  evaluate(effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
    const effectiveBinding = verifyEffectiveRuleSet(effectiveRuleSet);
    const admittedAuthority = admitAuthority(authority);
    const admission = admitFfcaTypedProjectFacts(typedProjectFacts, effectiveBinding);
    const admittedCutoffs = admitCutoffs(cutoffs, admission.typed_facts_binding);
    const assessmentReceipt = admission.assessment.receipt;
    const receiptMaterial = {
      admitted_authority: admittedAuthority,
      admitted_cutoffs: admittedCutoffs,
      assessment_result_digest: assessmentReceipt.result_digest,
      effective_rule_set_binding: effectiveBinding,
      execution_effects: assessmentReceipt.execution_effects,
      input_digest: assessmentReceipt.input_digest,
      schema_version: assessmentReceipt.schema_version,
      typed_facts_binding: admission.typed_facts_binding,
    };
    const resultDigest = canonicalFfcaDigest(
      "soulforge.field_failure_corrective_action.semantic_result.v0",
      semanticResultMaterial(admission.assessment, receiptMaterial),
    );
    return freezeDeep({
      ...admission.assessment,
      receipt: {
        ...receiptMaterial,
        result_digest: resultDigest,
      },
    });
  },
});

registerDomainEngineAdapter("field_failure_corrective_action", fieldFailureCorrectiveActionAdapter);

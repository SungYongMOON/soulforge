// Core Domain Engine Adapter Interface
import types from "node:util/types";

import { canonicalise } from "../validators/canonical.mjs";
import { sha256Hex } from "../validators/fingerprint.mjs";
import { ContractError } from "../validators/errors.mjs";
import { normalizeProfileOperations } from "./profile_operation_canon.mjs";

export const DOMAIN_ENGINE_ADAPTER_SCHEMA_VERSION = "soulforge.domain_engine_adapter.v0";
export const PROFILE_BINDING_SCHEMA_VERSION = "soulforge.engineering_profile_binding.v0";
export const EFFECTIVE_RULE_SET_SCHEMA_VERSION = "soulforge.effective_rule_set.v0";
export const COMPILATION_TRACE_SCHEMA_VERSION = "soulforge.compilation_trace.v0";

export const CODES = Object.freeze({
  ADAPTER_INVALID: "DOMAIN_ADAPTER_INVALID",
  ADAPTER_NOT_FOUND: "DOMAIN_ADAPTER_NOT_FOUND",
  ADAPTER_CONFLICT: "DOMAIN_ADAPTER_CONFLICT",
  PROFILE_BINDING_INVALID: "PROFILE_BINDING_INVALID",
  PROFILE_PROVENANCE_MISSING: "PROFILE_PROVENANCE_MISSING",
  DOMAIN_ENGINE_MISMATCH: "DOMAIN_ENGINE_MISMATCH",
  PROFILE_ORDER_INVALID: "PROFILE_ORDER_INVALID",
  RULE_ASSEMBLY_FAILED: "RULE_ASSEMBLY_FAILED",
  EVALUATION_FAILED: "EVALUATION_FAILED",
  PROJECT_EVIDENCE_INVALID: "PROJECT_EVIDENCE_INVALID",
  INSTANT_INVALID: "INSTANT_INVALID",
  INSTANT_REQUIRED: "INSTANT_REQUIRED",
});

const ISO_UTC_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/;

const ARRAY_INDEX_KEY = /^(0|[1-9][0-9]*)$/u;
const MAX_ARRAY_INDEX = 4_294_967_294;
const PROTOTYPE_SENSITIVE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const FORBIDDEN_PROJECT_FACT_STRING_PATTERNS = Object.freeze([
  /^[A-Za-z]:[\\/]/u,
  /^\\\\[^\\]+\\[^\\]+/u,
  /^\/(?:etc|var|usr|home|root|tmp|workspace|workspaces|users|private|data|opt|srv|mnt|media)(?:\/|$)/iu,
  /^file:\/\//iu,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u,
  /\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/u,
  /(?:secret|password|passwd|bearer|api[_-]?key|access[_-]?token|refresh[_-]?token)/iu,
]);

const isArrayIndexKey = (key) => ARRAY_INDEX_KEY.test(key) && Number(key) <= MAX_ARRAY_INDEX;

function snapshotProfileRecord(value) {
  if (types.isProxy(value) || !value || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID,
      "profile binding must be a plain non-proxy object");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID,
      "profile binding may not contain symbol properties");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (PROTOTYPE_SENSITIVE_KEYS.has(key) || !Object.hasOwn(descriptor, "value")
        || descriptor.enumerable !== true) {
      throw new ContractError(CODES.PROFILE_BINDING_INVALID,
        "profile binding may contain only enumerable own data properties");
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotDenseDataArray(value, label) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID,
      `${label} must be a plain non-proxy array`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID,
      `${label} may not contain symbol properties`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = descriptors.length;
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID, `${label} length is invalid`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || (key !== "length" && !isArrayIndexKey(key))) {
      throw new ContractError(CODES.PROFILE_BINDING_INVALID,
        `${label} may contain only dense indexed values`);
    }
  }
  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      throw new ContractError(CODES.PROFILE_BINDING_INVALID,
        `${label} may not contain sparse or accessor-backed elements`);
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function snapshotPlainJsonData(value, label, code, depth = 0, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ContractError(code, `${label} may not contain non-finite numbers`);
    }
    return value;
  }
  if (types.isProxy(value) || !value || typeof value !== "object") {
    throw new ContractError(code, `${label} must contain only plain JSON data`);
  }
  if (depth >= 32) {
    throw new ContractError(code, `${label} exceeds the maximum nesting depth`);
  }
  if (ancestors.has(value)) {
    throw new ContractError(code, `${label} may not contain cycles`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype
          || Object.getOwnPropertySymbols(value).length > 0) {
        throw new ContractError(code, `${label} arrays must use the standard Array shape`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0) {
        throw new ContractError(code, `${label} array length is invalid`);
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || (key !== "length" && !isArrayIndexKey(key))) {
          throw new ContractError(code, `${label} arrays may contain only dense indexed values`);
        }
      }
      const out = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
          throw new ContractError(code, `${label} arrays may not contain sparse or accessor-backed values`);
        }
        out.push(snapshotPlainJsonData(descriptor.value, `${label}[${index}]`, code, depth + 1, ancestors));
      }
      return out;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype
        || Object.getOwnPropertySymbols(value).length > 0) {
      throw new ContractError(code, `${label} objects must use the standard Object shape`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const out = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (PROTOTYPE_SENSITIVE_KEYS.has(key) || !Object.hasOwn(descriptor, "value")
          || descriptor.enumerable !== true) {
        throw new ContractError(code, `${label} objects may contain only enumerable own data properties`);
      }
      out[key] = snapshotPlainJsonData(descriptor.value, `${label}.${key}`, code, depth + 1, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

function snapshotDomainEngineAdapter(adapter) {
  if (types.isProxy(adapter) || !adapter || typeof adapter !== "object" || Array.isArray(adapter)
      || Object.getPrototypeOf(adapter) !== Object.prototype
      || Object.getOwnPropertySymbols(adapter).length > 0) {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter must be a plain non-proxy object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(adapter);
  const snapshot = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (PROTOTYPE_SENSITIVE_KEYS.has(key) || !Object.hasOwn(descriptor, "value")
        || descriptor.enumerable !== true) {
      throw new ContractError(CODES.ADAPTER_INVALID,
        "adapter may contain only enumerable own data properties");
    }
    snapshot[key] = descriptor.value;
  }
  if (typeof snapshot.domain_engine_id !== "string" || !snapshot.domain_engine_id) {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.domain_engine_id must be a non-empty string");
  }
  if (typeof snapshot.revision !== "string" || !snapshot.revision) {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.revision must be a non-empty string");
  }
  if (typeof snapshot.compile !== "function") {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.compile must be a function");
  }
  if (typeof snapshot.evaluate !== "function") {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.evaluate must be a function");
  }
  return Object.freeze(snapshot);
}

function assertProjectFactStringsSafe(value, label) {
  if (typeof value === "string") {
    if (FORBIDDEN_PROJECT_FACT_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID,
        `${label} contains a forbidden path or secret sentinel`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertProjectFactStringsSafe(child, `${label}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertProjectFactStringsSafe(key, `${label} key`);
      assertProjectFactStringsSafe(child, `${label}.${key}`);
    }
  }
}

export function validateCanonicalInstant(instant, fieldName = "instant") {
  if (typeof instant !== "string" || !ISO_UTC_REGEX.test(instant)) {
    throw new ContractError(
      instant === undefined || instant === null ? CODES.INSTANT_REQUIRED : CODES.INSTANT_INVALID,
      `${fieldName} must be a valid canonical UTC ISO-8601 string, got "${instant}"`
    );
  }
  return instant;
}

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

// Effective-rule and observation material keeps the historical null-stripping projection:
// those consumers were accepted against it and SE compatibility is pinned to the digests it
// produces. Profile operations do not use it - `null` is a value there, and
// profile_operation_canon.mjs owns that semantics explicitly.
export function withoutNulls(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(withoutNulls);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) out[key] = withoutNulls(child);
    }
    return out;
  }
  return value;
}

export function arrayOrderRules(value) {
  const rules = {};
  const visit = (row, path = "") => {
    if (Array.isArray(row)) {
      rules[path] = "insertion_ordered";
      for (const child of row) visit(child, `${path}[]`);
    } else if (row !== null && typeof row === "object") {
      for (const [key, child] of Object.entries(row)) visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value);
  return rules;
}

const registry = new Map();

export function registerDomainEngineAdapter(domainEngineId, adapter) {
  if (typeof domainEngineId !== "string" || !domainEngineId) {
    throw new ContractError(CODES.ADAPTER_INVALID, "domainEngineId must be a non-empty string");
  }
  validateDomainEngineAdapter(adapter);
  if (registry.has(domainEngineId)) {
    const existing = registry.get(domainEngineId);
    if (existing !== adapter) {
      throw new ContractError(CODES.ADAPTER_CONFLICT, `conflicting duplicate registration for domain adapter "${domainEngineId}"`);
    }
    // Exact idempotent registration of identical object: no-op
    return;
  }
  registry.set(domainEngineId, adapter);
}

export function clearDomainEngineRegistry() {
  registry.clear();
}

export function validateDomainEngineAdapter(adapter) {
  snapshotDomainEngineAdapter(adapter);
  return true;
}

export function loadDomainEngineAdapter(domainEngineRefOrId) {
  let id;
  if (typeof domainEngineRefOrId === "string") {
    id = domainEngineRefOrId;
  } else {
    const admittedRef = snapshotPlainJsonData(
      domainEngineRefOrId,
      "domainEngineRefOrId",
      CODES.ADAPTER_INVALID,
    );
    if (!admittedRef || Array.isArray(admittedRef)) {
      throw new ContractError(CODES.ADAPTER_INVALID, "domain engine reference or id is invalid");
    }
    id = admittedRef.domain_engine_id || admittedRef.entity_id;
  }
  if (!id || typeof id !== "string") {
    throw new ContractError(CODES.ADAPTER_INVALID, "domain engine reference or id is invalid");
  }
  const adapter = registry.get(id);
  if (!adapter) {
    throw new ContractError(CODES.ADAPTER_NOT_FOUND, `domain engine adapter "${id}" is not registered`);
  }
  return adapter;
}

function validateProfileBindingWithKind(profile, expectedOrder = null, forcedKind = null) {
  const admitted = snapshotProfileRecord(profile);
  if (forcedKind !== null && admitted.profile_kind !== undefined
      && admitted.profile_kind !== forcedKind) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID,
      "declared profile_kind does not match its organization/project slot");
  }
  const kind = forcedKind ?? admitted.profile_kind;
  if (kind !== "organization" && kind !== "project") {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID, `profile_kind must be "organization" or "project", got "${kind}"`);
  }

  const profileId = admitted.profile_id;
  if (typeof profileId !== "string" || !profileId.trim()) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "profile_id must be an explicit non-empty string");
  }

  const domainEngineId = admitted.domain_engine_id;
  if (typeof domainEngineId !== "string" || !domainEngineId.trim()) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "domain_engine_id must be an explicit non-empty string");
  }

  const revisionOrHash = admitted.revision_or_hash || admitted.revision_hash;
  if (typeof revisionOrHash !== "string" || !revisionOrHash.trim() || revisionOrHash === "unversioned") {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "revision_or_hash must be an explicit valid revision/hash string");
  }

  const extendsOrBasePin = admitted.extends_or_base_pin || admitted.extends_base_pin;
  if (typeof extendsOrBasePin !== "string" || !extendsOrBasePin.trim()) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "extends_or_base_pin must be an explicit non-empty string");
  }

  if (admitted.source_refs === undefined || admitted.source_refs === null) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING,
      "source_refs must be an explicit non-empty array of source references");
  }
  const sourceRefs = snapshotDenseDataArray(admitted.source_refs, "source_refs");
  if (sourceRefs.length === 0) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "source_refs must be an explicit non-empty array of source references");
  }
  for (const ref of sourceRefs) {
    if (typeof ref !== "string" || !ref.trim()) {
      throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "every source_ref must be a non-empty string");
    }
  }

  const order = typeof admitted.order === "number" ? admitted.order : expectedOrder;
  if (typeof order !== "number" || (expectedOrder !== null && order !== expectedOrder)) {
    throw new ContractError(CODES.PROFILE_ORDER_INVALID, `profile order must be ${expectedOrder}, got ${order}`);
  }

  if (kind === "organization" && order !== 0) {
    throw new ContractError(CODES.PROFILE_ORDER_INVALID, `organization profile must have order 0, got ${order}`);
  }
  if (kind === "project" && order !== 1 && order !== 0) {
    throw new ContractError(CODES.PROFILE_ORDER_INVALID, `project profile order must be sequential (0 or 1), got ${order}`);
  }

  // Null-preserving: `[null]` and `[]` are different Profile statements and must not share a
  // digest. The clone is frozen and independent of the caller's object.
  const normalizedOperations = normalizeProfileOperations(admitted.operations);

  return deepFreeze({
    schema_version: PROFILE_BINDING_SCHEMA_VERSION,
    profile_kind: kind,
    profile_id: profileId,
    domain_engine_id: domainEngineId,
    revision_or_hash: revisionOrHash,
    extends_or_base_pin: extendsOrBasePin,
    operation_digest: normalizedOperations.operation_digest,
    source_refs: sourceRefs,
    order,
    operations: normalizedOperations.operations,
  });
}

export function validateProfileBinding(profile, expectedOrder = null) {
  return validateProfileBindingWithKind(profile, expectedOrder, null);
}

export function resolveProfileBindings(organizationProfile = null, projectProfile = null) {
  const bindings = [];
  if (organizationProfile) {
    const orgBinding = validateProfileBindingWithKind(organizationProfile, 0, "organization");
    bindings.push(orgBinding);
  }
  if (projectProfile) {
    const expectedOrder = bindings.length;
    const projBinding = validateProfileBindingWithKind(projectProfile, expectedOrder, "project");
    bindings.push(projBinding);
  }
  return deepFreeze(bindings);
}

export function assembleEffectiveRuleSet(domainAdapter, orderedProfileBindings = [], compilationScope = {}) {
  const admittedAdapter = snapshotDomainEngineAdapter(domainAdapter);
  const admittedBindingList = snapshotDenseDataArray(orderedProfileBindings, "orderedProfileBindings");
  const admittedCompilationScope = deepFreeze(snapshotPlainJsonData(
    compilationScope,
    "compilationScope",
    CODES.RULE_ASSEMBLY_FAILED,
  ));
  if (!admittedCompilationScope || typeof admittedCompilationScope !== "object"
      || Array.isArray(admittedCompilationScope)) {
    throw new ContractError(CODES.RULE_ASSEMBLY_FAILED, "compilationScope must be a plain object");
  }

  const normalizedBindings = [];
  let hasOrg = false;
  let hasProj = false;

  for (let i = 0; i < admittedBindingList.length; i += 1) {
    const raw = admittedBindingList[i];
    const normalized = validateProfileBinding(raw, i);

    if (normalized.domain_engine_id !== admittedAdapter.domain_engine_id) {
      throw new ContractError(
        CODES.DOMAIN_ENGINE_MISMATCH,
        `profile domain_engine_id "${normalized.domain_engine_id}" does not match adapter domain "${admittedAdapter.domain_engine_id}"`
      );
    }

    if (normalized.profile_kind === "organization") {
      if (hasOrg) throw new ContractError(CODES.PROFILE_ORDER_INVALID, "multiple organization profiles are not permitted");
      if (hasProj) throw new ContractError(CODES.PROFILE_ORDER_INVALID, "organization profile must precede project profile");
      hasOrg = true;
    } else if (normalized.profile_kind === "project") {
      if (hasProj) throw new ContractError(CODES.PROFILE_ORDER_INVALID, "multiple project profiles are not permitted");
      hasProj = true;
    }

    normalizedBindings.push(normalized);
  }

  deepFreeze(normalizedBindings);
  let domainCompileResult;
  try {
    domainCompileResult = admittedAdapter.compile(normalizedBindings, admittedCompilationScope);
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError(CODES.RULE_ASSEMBLY_FAILED,
      "Domain compiler failed after Core input admission");
  }

  const profileTraces = normalizedBindings.map((p) => ({
    order: p.order,
    profile_kind: p.profile_kind,
    profile_id: p.profile_id,
    domain_engine_id: p.domain_engine_id,
    revision_or_hash: p.revision_or_hash,
    extends_or_base_pin: p.extends_or_base_pin,
    operation_digest: p.operation_digest,
    applied_operations_count: p.operations.length,
    source_refs: p.source_refs,
  }));

  const orgProfile = normalizedBindings.find((p) => p.profile_kind === "organization");
  const projProfile = normalizedBindings.find((p) => p.profile_kind === "project");

  const orgTrace = orgProfile ? {
    profile_id: orgProfile.profile_id,
    domain_engine_id: orgProfile.domain_engine_id,
    revision_or_hash: orgProfile.revision_or_hash,
    extends_or_base_pin: orgProfile.extends_or_base_pin,
    operation_digest: orgProfile.operation_digest,
    applied_operations_count: orgProfile.operations.length,
    source_refs: orgProfile.source_refs,
  } : null;

  const projTrace = projProfile ? {
    profile_id: projProfile.profile_id,
    domain_engine_id: projProfile.domain_engine_id,
    revision_or_hash: projProfile.revision_or_hash,
    extends_or_base_pin: projProfile.extends_or_base_pin,
    operation_digest: projProfile.operation_digest,
    applied_operations_count: projProfile.operations.length,
    source_refs: projProfile.source_refs,
  } : null;

  const effectiveRuleSet = domainCompileResult.effective_rule_set || domainCompileResult;
  const cleanRules = withoutNulls(effectiveRuleSet);
  const canonicalRules = canonicalise(cleanRules, arrayOrderRules(cleanRules));
  const effectiveDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalRules}`);

  const compilationTrace = {
    schema_version: COMPILATION_TRACE_SCHEMA_VERSION,
    domain_engine_id: admittedAdapter.domain_engine_id,
    domain_adapter_revision: admittedAdapter.revision,
    organization_trace: orgTrace,
    project_trace: projTrace,
    profiles: profileTraces,
    compilation_scope: admittedCompilationScope,
    effective_ruleset_digest: effectiveDigest,
    rule_count: domainCompileResult.rule_count ?? (Array.isArray(effectiveRuleSet?.rules) ? effectiveRuleSet.rules.length : (Array.isArray(effectiveRuleSet?.stages) ? effectiveRuleSet.stages.length : 0)),
  };

  return deepFreeze({
    schema_version: EFFECTIVE_RULE_SET_SCHEMA_VERSION,
    domain_engine_id: admittedAdapter.domain_engine_id,
    effective_rule_set: effectiveRuleSet,
    compilation_trace: compilationTrace,
    rule_count: compilationTrace.rule_count,
    assembly_digest: effectiveDigest,
  });
}

export function evaluate(domainAdapter, effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
  const admittedAdapter = snapshotDomainEngineAdapter(domainAdapter);
  if (types.isProxy(effectiveRuleSet) || !effectiveRuleSet || typeof effectiveRuleSet !== "object"
      || Array.isArray(effectiveRuleSet) || Object.getPrototypeOf(effectiveRuleSet) !== Object.prototype) {
    throw new ContractError(CODES.EVALUATION_FAILED, "effectiveRuleSet must be a plain non-proxy object");
  }
  if (Object.getOwnPropertySymbols(effectiveRuleSet).length > 0) {
    throw new ContractError(CODES.EVALUATION_FAILED, "effectiveRuleSet may not contain symbol properties");
  }
  const descriptors = Object.getOwnPropertyDescriptors(effectiveRuleSet);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (["__proto__", "prototype", "constructor"].includes(key)
        || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      throw new ContractError(CODES.EVALUATION_FAILED,
        "effectiveRuleSet may contain only enumerable own data properties");
    }
  }
  const domainDescriptor = descriptors.domain_engine_id;
  if (domainDescriptor !== undefined) {
    if (typeof domainDescriptor.value !== "string" || domainDescriptor.value.length === 0) {
      throw new ContractError(CODES.EVALUATION_FAILED,
        "effectiveRuleSet.domain_engine_id must be a non-empty string when present");
    }
    if (domainDescriptor.value !== admittedAdapter.domain_engine_id) {
      throw new ContractError(CODES.DOMAIN_ENGINE_MISMATCH,
        "effectiveRuleSet domain does not match the selected adapter");
    }
  }
  return admittedAdapter.evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs);
}

export function adaptProjectEvidence(projectBindingRef, sourceSnapshotRefs, cutoffs = {}) {
  const admittedBinding = snapshotPlainJsonData(
    projectBindingRef,
    "projectBindingRef",
    CODES.PROJECT_EVIDENCE_INVALID,
  );
  if (!admittedBinding || Array.isArray(admittedBinding)) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef must be an object");
  }
  assertProjectFactStringsSafe(admittedBinding, "projectBindingRef");
  if (typeof admittedBinding.project_id !== "string" || !admittedBinding.project_id.trim()) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef.project_id must be a non-empty string");
  }
  if (typeof admittedBinding.domain_engine_id !== "string" || !admittedBinding.domain_engine_id.trim()) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef.domain_engine_id must be a non-empty string");
  }
  if (typeof admittedBinding.binding_revision_hash !== "string" || !admittedBinding.binding_revision_hash.trim()) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef.binding_revision_hash must be a non-empty string");
  }

  const admittedSnapshot = snapshotPlainJsonData(
    sourceSnapshotRefs,
    "sourceSnapshotRefs",
    CODES.PROJECT_EVIDENCE_INVALID,
  );
  if (!admittedSnapshot || Array.isArray(admittedSnapshot)) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "sourceSnapshotRefs must be an object");
  }
  assertProjectFactStringsSafe(admittedSnapshot, "sourceSnapshotRefs");
  if (!Array.isArray(admittedSnapshot.source_refs) || admittedSnapshot.source_refs.length === 0) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "sourceSnapshotRefs.source_refs must be a non-empty array");
  }
  for (const sourceRef of admittedSnapshot.source_refs) {
    if (typeof sourceRef !== "string" || !sourceRef.trim()) {
      throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID,
        "sourceSnapshotRefs.source_refs must contain non-empty strings");
    }
  }
  if (!Array.isArray(admittedSnapshot.observations)) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "sourceSnapshotRefs.observations must be an array");
  }

  const admittedCutoffs = snapshotPlainJsonData(cutoffs, "cutoffs", CODES.INSTANT_INVALID);
  if (!admittedCutoffs || Array.isArray(admittedCutoffs)) {
    throw new ContractError(CODES.INSTANT_REQUIRED, "cutoffs must be an object containing valid_at and known_at");
  }
  assertProjectFactStringsSafe(admittedCutoffs, "cutoffs");
  const validAt = validateCanonicalInstant(admittedCutoffs.valid_at, "cutoffs.valid_at");
  const knownAt = validateCanonicalInstant(admittedCutoffs.known_at, "cutoffs.known_at");
  const observedAt = admittedCutoffs.observed_at
    ? validateCanonicalInstant(admittedCutoffs.observed_at, "cutoffs.observed_at")
    : knownAt;

  for (const obs of admittedSnapshot.observations) {
    if (!obs || typeof obs !== "object" || Array.isArray(obs)) {
      throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "observation must be a plain object");
    }
  }

  const cleanObservations = withoutNulls(admittedSnapshot.observations);
  cleanObservations.forEach((observation, index) => {
    assertProjectFactStringsSafe(observation, `observations[${index}]`);
  });
  const canonicalObservations = canonicalise(cleanObservations, arrayOrderRules(cleanObservations));
  const observationsDigest = sha256Hex(`soulforge.project_observations.v0\n${canonicalObservations}`);

  const observationReceipt = {
    schema_version: "soulforge.project_observation_receipt.v0",
    project_binding_ref: admittedBinding,
    source_snapshot_refs: admittedSnapshot,
    cutoffs: deepFreeze({ valid_at: validAt, known_at: knownAt }),
    observed_at: observedAt,
    observations_digest: observationsDigest,
    facts_count: cleanObservations.length,
  };

  const typedProjectFacts = {
    schema_version: "soulforge.typed_project_facts.v0",
    project_binding_ref: admittedBinding,
    facts: cleanObservations,
    facts_digest: observationsDigest,
    valid_at: validAt,
    known_at: knownAt,
  };

  return deepFreeze({ typed_project_facts: typedProjectFacts, observation_receipt: observationReceipt });
}

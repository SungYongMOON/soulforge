// Core Domain Engine Adapter Interface
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
  if (!adapter || typeof adapter !== "object") {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter must be an object");
  }
  if (typeof adapter.domain_engine_id !== "string" || !adapter.domain_engine_id) {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.domain_engine_id must be a non-empty string");
  }
  if (typeof adapter.revision !== "string" || !adapter.revision) {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.revision must be a non-empty string");
  }
  if (typeof adapter.compile !== "function") {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.compile must be a function");
  }
  if (typeof adapter.evaluate !== "function") {
    throw new ContractError(CODES.ADAPTER_INVALID, "adapter.evaluate must be a function");
  }
  return true;
}

export function loadDomainEngineAdapter(domainEngineRefOrId) {
  const id = typeof domainEngineRefOrId === "string"
    ? domainEngineRefOrId
    : domainEngineRefOrId?.domain_engine_id || domainEngineRefOrId?.entity_id;
  if (!id || typeof id !== "string") {
    throw new ContractError(CODES.ADAPTER_INVALID, "domain engine reference or id is invalid");
  }
  const adapter = registry.get(id);
  if (!adapter) {
    throw new ContractError(CODES.ADAPTER_NOT_FOUND, `domain engine adapter "${id}" is not registered`);
  }
  return adapter;
}

export function validateProfileBinding(profile, expectedOrder = null) {
  if (!profile || typeof profile !== "object") {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID, "profile binding must be an object");
  }
  const kind = profile.profile_kind;
  if (kind !== "organization" && kind !== "project") {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID, `profile_kind must be "organization" or "project", got "${kind}"`);
  }

  const profileId = profile.profile_id;
  if (typeof profileId !== "string" || !profileId.trim()) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "profile_id must be an explicit non-empty string");
  }

  const domainEngineId = profile.domain_engine_id;
  if (typeof domainEngineId !== "string" || !domainEngineId.trim()) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "domain_engine_id must be an explicit non-empty string");
  }

  const revisionOrHash = profile.revision_or_hash || profile.revision_hash;
  if (typeof revisionOrHash !== "string" || !revisionOrHash.trim() || revisionOrHash === "unversioned") {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "revision_or_hash must be an explicit valid revision/hash string");
  }

  const extendsOrBasePin = profile.extends_or_base_pin || profile.extends_base_pin;
  if (typeof extendsOrBasePin !== "string" || !extendsOrBasePin.trim()) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "extends_or_base_pin must be an explicit non-empty string");
  }

  if (!Array.isArray(profile.source_refs) || profile.source_refs.length === 0) {
    throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "source_refs must be an explicit non-empty array of source references");
  }
  for (const ref of profile.source_refs) {
    if (typeof ref !== "string" || !ref.trim()) {
      throw new ContractError(CODES.PROFILE_PROVENANCE_MISSING, "every source_ref must be a non-empty string");
    }
  }

  const order = typeof profile.order === "number" ? profile.order : expectedOrder;
  if (typeof order !== "number" || (expectedOrder !== null && order !== expectedOrder)) {
    throw new ContractError(CODES.PROFILE_ORDER_INVALID, `profile order must be ${expectedOrder}, got ${order}`);
  }

  if (kind === "organization" && order !== 0) {
    throw new ContractError(CODES.PROFILE_ORDER_INVALID, `organization profile must have order 0, got ${order}`);
  }
  if (kind === "project" && order !== 1 && order !== 0) {
    throw new ContractError(CODES.PROFILE_ORDER_INVALID, `project profile order must be sequential (0 or 1), got ${order}`);
  }

  if (!Array.isArray(profile.operations)) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID, "operations must be an array");
  }
  for (const op of profile.operations) {
    if (!op || typeof op !== "object" || Array.isArray(op)) {
      throw new ContractError(CODES.PROFILE_BINDING_INVALID, "every operation must be a plain object");
    }
  }

  // Null-preserving: `[null]` and `[]` are different Profile statements and must not share a
  // digest. The clone is frozen and independent of the caller's object.
  const normalizedOperations = normalizeProfileOperations(profile.operations);

  return deepFreeze({
    schema_version: PROFILE_BINDING_SCHEMA_VERSION,
    profile_kind: kind,
    profile_id: profileId,
    domain_engine_id: domainEngineId,
    revision_or_hash: revisionOrHash,
    extends_or_base_pin: extendsOrBasePin,
    operation_digest: normalizedOperations.operation_digest,
    source_refs: [...profile.source_refs],
    order,
    operations: normalizedOperations.operations,
  });
}

export function resolveProfileBindings(organizationProfile = null, projectProfile = null) {
  const bindings = [];
  if (organizationProfile) {
    const orgBinding = validateProfileBinding({
      ...organizationProfile,
      profile_kind: "organization",
    }, 0);
    bindings.push(orgBinding);
  }
  if (projectProfile) {
    const expectedOrder = bindings.length;
    const projBinding = validateProfileBinding({
      ...projectProfile,
      profile_kind: "project",
    }, expectedOrder);
    bindings.push(projBinding);
  }
  return deepFreeze(bindings);
}

export function assembleEffectiveRuleSet(domainAdapter, orderedProfileBindings = [], compilationScope = {}) {
  validateDomainEngineAdapter(domainAdapter);
  if (!Array.isArray(orderedProfileBindings)) {
    throw new ContractError(CODES.PROFILE_BINDING_INVALID, "orderedProfileBindings must be an array");
  }

  const normalizedBindings = [];
  let hasOrg = false;
  let hasProj = false;

  for (let i = 0; i < orderedProfileBindings.length; i += 1) {
    const raw = orderedProfileBindings[i];
    const normalized = validateProfileBinding(raw, i);

    if (normalized.domain_engine_id !== domainAdapter.domain_engine_id) {
      throw new ContractError(
        CODES.DOMAIN_ENGINE_MISMATCH,
        `profile domain_engine_id "${normalized.domain_engine_id}" does not match adapter domain "${domainAdapter.domain_engine_id}"`
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

  const domainCompileResult = domainAdapter.compile(normalizedBindings, compilationScope);

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
    domain_engine_id: domainAdapter.domain_engine_id,
    domain_adapter_revision: domainAdapter.revision,
    organization_trace: orgTrace,
    project_trace: projTrace,
    profiles: profileTraces,
    compilation_scope: compilationScope,
    effective_ruleset_digest: effectiveDigest,
    rule_count: domainCompileResult.rule_count ?? (Array.isArray(effectiveRuleSet?.rules) ? effectiveRuleSet.rules.length : (Array.isArray(effectiveRuleSet?.stages) ? effectiveRuleSet.stages.length : 0)),
  };

  return deepFreeze({
    schema_version: EFFECTIVE_RULE_SET_SCHEMA_VERSION,
    domain_engine_id: domainAdapter.domain_engine_id,
    effective_rule_set: effectiveRuleSet,
    compilation_trace: compilationTrace,
    rule_count: compilationTrace.rule_count,
    assembly_digest: effectiveDigest,
  });
}

export function evaluate(domainAdapter, effectiveRuleSet, typedProjectFacts, authority = {}, cutoffs = {}) {
  validateDomainEngineAdapter(domainAdapter);
  if (!effectiveRuleSet || typeof effectiveRuleSet !== "object") {
    throw new ContractError(CODES.EVALUATION_FAILED, "effectiveRuleSet must be an object");
  }
  if (effectiveRuleSet.domain_engine_id && effectiveRuleSet.domain_engine_id !== domainAdapter.domain_engine_id) {
    throw new ContractError(CODES.DOMAIN_ENGINE_MISMATCH, `effectiveRuleSet domain "${effectiveRuleSet.domain_engine_id}" does not match adapter "${domainAdapter.domain_engine_id}"`);
  }
  return domainAdapter.evaluate(effectiveRuleSet, typedProjectFacts, authority, cutoffs);
}

export function adaptProjectEvidence(projectBindingRef, sourceSnapshotRefs, cutoffs = {}) {
  if (!projectBindingRef || typeof projectBindingRef !== "object") {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef must be an object");
  }
  if (typeof projectBindingRef.project_id !== "string" || !projectBindingRef.project_id.trim()) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef.project_id must be a non-empty string");
  }
  if (typeof projectBindingRef.domain_engine_id !== "string" || !projectBindingRef.domain_engine_id.trim()) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef.domain_engine_id must be a non-empty string");
  }
  if (typeof projectBindingRef.binding_revision_hash !== "string" || !projectBindingRef.binding_revision_hash.trim()) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "projectBindingRef.binding_revision_hash must be a non-empty string");
  }

  if (!sourceSnapshotRefs || typeof sourceSnapshotRefs !== "object") {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "sourceSnapshotRefs must be an object");
  }
  if (!Array.isArray(sourceSnapshotRefs.source_refs) || sourceSnapshotRefs.source_refs.length === 0) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "sourceSnapshotRefs.source_refs must be a non-empty array");
  }
  if (!Array.isArray(sourceSnapshotRefs.observations)) {
    throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "sourceSnapshotRefs.observations must be an array");
  }

  if (!cutoffs || typeof cutoffs !== "object") {
    throw new ContractError(CODES.INSTANT_REQUIRED, "cutoffs must be an object containing valid_at and known_at");
  }
  const validAt = validateCanonicalInstant(cutoffs.valid_at, "cutoffs.valid_at");
  const knownAt = validateCanonicalInstant(cutoffs.known_at, "cutoffs.known_at");
  const observedAt = cutoffs.observed_at ? validateCanonicalInstant(cutoffs.observed_at, "cutoffs.observed_at") : knownAt;

  // Path & secret sentinel checks on observations
  const FORBIDDEN_PATH_SECRET_PATTERNS = [
    /^[A-Za-z]:[\\/]/u,
    /^\\\\[^\\]+\\[^\\]+/u,
    /^\/(?:etc|var|usr|home|root|tmp)/u,
    /(?:secret|password|bearer|api_key|token)/i,
  ];

  for (const obs of sourceSnapshotRefs.observations) {
    if (!obs || typeof obs !== "object") {
      throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, "observation must be a plain object");
    }
    for (const [k, v] of Object.entries(obs)) {
      if (typeof v === "string") {
        for (const pattern of FORBIDDEN_PATH_SECRET_PATTERNS) {
          if (pattern.test(v)) {
            throw new ContractError(CODES.PROJECT_EVIDENCE_INVALID, `observation contains forbidden sentinel in field "${k}"`);
          }
        }
      }
    }
  }

  const cleanObservations = withoutNulls(sourceSnapshotRefs.observations);
  const canonicalObservations = canonicalise(cleanObservations, arrayOrderRules(cleanObservations));
  const observationsDigest = sha256Hex(`soulforge.project_observations.v0\n${canonicalObservations}`);

  const observationReceipt = {
    schema_version: "soulforge.project_observation_receipt.v0",
    project_binding_ref: deepFreeze({ ...projectBindingRef }),
    source_snapshot_refs: deepFreeze({ ...sourceSnapshotRefs }),
    cutoffs: deepFreeze({ valid_at: validAt, known_at: knownAt }),
    observed_at: observedAt,
    observations_digest: observationsDigest,
    facts_count: cleanObservations.length,
  };

  const typedProjectFacts = {
    schema_version: "soulforge.typed_project_facts.v0",
    project_binding_ref: deepFreeze({ ...projectBindingRef }),
    facts: cleanObservations,
    facts_digest: observationsDigest,
    valid_at: validAt,
    known_at: knownAt,
  };

  return deepFreeze({ typed_project_facts: typedProjectFacts, observation_receipt: observationReceipt });
}

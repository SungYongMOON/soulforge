// Lane 1E — module manifest, ABI compatibility, project binding, and release artifacts.
//
// One shared engine release serves many project bindings. That only works if a project can
// pin exactly what it ran and nothing can change underneath it mid-run. Four rules carry
// that weight.
//
// 1. No floating versions. A binding names exact revisions and artifact hashes, never
//    "latest", because "latest" makes a replay unreproducible by definition.
// 2. No hot swap. A new module binding loads side by side, is compared, and only applies
//    from the next accepted generation.
// 3. Compatibility is declared as a range and checked, not assumed from a version number
//    looking close enough.
// 4. Rollback re-selects a previously verified artifact. It is not a revert of a source
//    checkout, because the thing that was running was the artifact, not the checkout.

import { createHash } from 'node:crypto';
import { canonicalise, compareCodePoints, inspectInstant } from './canonical.mjs';
import { CANONICAL } from './contract_config.mjs';
import { ContractError } from './errors.mjs';

export const CODES = Object.freeze({
  MANIFEST_FIELD_MISSING: 'MODULE_MANIFEST_FIELD_MISSING',
  VERSION_NOT_EXACT: 'MODULE_VERSION_NOT_EXACT',
  FLOATING_DEPENDENCY: 'MODULE_FLOATING_DEPENDENCY',
  ARTIFACT_HASH_INVALID: 'MODULE_ARTIFACT_HASH_INVALID',
  ABI_RANGE_INVALID: 'MODULE_ABI_RANGE_INVALID',
  ABI_INCOMPATIBLE: 'MODULE_ABI_INCOMPATIBLE',
  MODE_INVALID: 'MODULE_MODE_INVALID',
  BINDING_FIELD_MISSING: 'BINDING_FIELD_MISSING',
  HOT_SWAP_FORBIDDEN: 'MODULE_HOT_SWAP_FORBIDDEN',
  PROMOTION_EVIDENCE_MISSING: 'MODULE_PROMOTION_EVIDENCE_MISSING',
  SHADOW_DIVERGENCE_UNRESOLVED: 'MODULE_SHADOW_DIVERGENCE_UNRESOLVED',
  RELEASE_NOT_IMMUTABLE: 'RELEASE_NOT_IMMUTABLE',
  ROLLBACK_TARGET_UNVERIFIED: 'ROLLBACK_TARGET_UNVERIFIED',
  ROLLBACK_IS_NOT_A_SOURCE_REVERT: 'ROLLBACK_IS_NOT_A_SOURCE_REVERT',
});

const SEMVER_EXACT = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export const EXECUTION_MODES = Object.freeze(['deterministic_only', 'ai_assisted']);

export const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  'module_id', 'module_version', 'build_commit', 'artifact_sha256',
  'engine_contract_abi_range', 'input_schema_revision', 'output_schema_revision',
  'authority_ceiling', 'claim_ceiling',
  'supported_project_classifications', 'execution_mode',
  'dependency_versions', 'configuration_hash',
  'migration_requirement', 'rollback_compatible_with', 'test_receipt_ref',
]);

const parseSemver = (v) => {
  const m = SEMVER_EXACT.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
};

const cmpSemver = (a, b) => (a.major - b.major) || (a.minor - b.minor) || (a.patch - b.patch);

/**
 * Parses an ABI compatibility range of the form ">=1.2.0 <2.0.0".
 *
 * A range is required rather than a single version because "compatible" is a claim about
 * a span, and a bare version leaves the reader to guess whether it means at-least,
 * exactly, or roughly.
 */
export function parseAbiRange(range) {
  if (typeof range !== 'string') throw new ContractError(CODES.ABI_RANGE_INVALID, 'abi range must be a string');
  const m = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (!m) {
    throw new ContractError(CODES.ABI_RANGE_INVALID, 'abi range must be exactly ">=X.Y.Z <A.B.C"', { range });
  }
  const min = parseSemver(m[1]), maxExclusive = parseSemver(m[2]);
  if (!min || !maxExclusive) throw new ContractError(CODES.ABI_RANGE_INVALID, 'abi range bounds must be exact semver', { range });
  if (cmpSemver(min, maxExclusive) >= 0) {
    throw new ContractError(CODES.ABI_RANGE_INVALID, 'abi range lower bound must be below the upper bound', { range });
  }
  return { min, maxExclusive, raw: range.trim() };
}

export function abiSatisfies(engineAbiVersion, range) {
  const v = parseSemver(engineAbiVersion);
  if (!v) throw new ContractError(CODES.VERSION_NOT_EXACT, 'engine abi version must be exact semver', { engineAbiVersion });
  const r = parseAbiRange(range);
  return cmpSemver(v, r.min) >= 0 && cmpSemver(v, r.maxExclusive) < 0;
}

/** Validates a module manifest. Every field is required; none defaults. */
export function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new ContractError(CODES.MANIFEST_FIELD_MISSING, 'manifest is not an object');
  }
  for (const f of REQUIRED_MANIFEST_FIELDS) {
    if (!Object.hasOwn(manifest, f)) {
      throw new ContractError(CODES.MANIFEST_FIELD_MISSING, `manifest field "${f}" is missing`, { module_id: manifest.module_id });
    }
  }
  if (!SEMVER_EXACT.test(manifest.module_version)) {
    throw new ContractError(CODES.VERSION_NOT_EXACT, 'module_version must be exact semver with no range or wildcard', { value: manifest.module_version });
  }
  if (typeof manifest.build_commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(manifest.build_commit)) {
    throw new ContractError(CODES.VERSION_NOT_EXACT, 'build_commit must be a hex commit id');
  }
  if (!SHA256_HEX.test(manifest.artifact_sha256)) {
    throw new ContractError(CODES.ARTIFACT_HASH_INVALID, 'artifact_sha256 must be a sha256 hex digest');
  }
  parseAbiRange(manifest.engine_contract_abi_range);
  if (!EXECUTION_MODES.includes(manifest.execution_mode)) {
    throw new ContractError(CODES.MODE_INVALID, `execution_mode must be one of ${EXECUTION_MODES.join(', ')}`);
  }
  // Dependencies are exact too. One floating dependency makes the whole artifact
  // irreproducible even when everything else is pinned.
  if (manifest.dependency_versions === null || typeof manifest.dependency_versions !== 'object') {
    throw new ContractError(CODES.MANIFEST_FIELD_MISSING, 'dependency_versions must be an object');
  }
  for (const [dep, ver] of Object.entries(manifest.dependency_versions)) {
    if (typeof ver !== 'string' || !SEMVER_EXACT.test(ver)) {
      throw new ContractError(CODES.FLOATING_DEPENDENCY,
        `dependency "${dep}" is not pinned to an exact version`, { dependency: dep, value: ver });
    }
  }
  if (!SHA256_HEX.test(manifest.configuration_hash)) {
    throw new ContractError(CODES.ARTIFACT_HASH_INVALID, 'configuration_hash must be a sha256 hex digest');
  }
  if (!Array.isArray(manifest.rollback_compatible_with)) {
    throw new ContractError(CODES.MANIFEST_FIELD_MISSING, 'rollback_compatible_with must be an array of exact versions');
  }
  for (const v of manifest.rollback_compatible_with) {
    if (!SEMVER_EXACT.test(v)) throw new ContractError(CODES.VERSION_NOT_EXACT, 'rollback_compatible_with entries must be exact semver', { value: v });
  }
  if (typeof manifest.test_receipt_ref !== 'string' || !manifest.test_receipt_ref) {
    throw new ContractError(CODES.PROMOTION_EVIDENCE_MISSING, 'test_receipt_ref is required; an unproven module is not promotable');
  }
  return { valid: true, module_id: manifest.module_id, module_version: manifest.module_version };
}

export const REQUIRED_BINDING_FIELDS = Object.freeze([
  'project_binding_ref', 'engine_release_version', 'engine_artifact_sha256',
  'engine_contract_revision', 'snapshot_schema_revision', 'module_abi_revision',
  'module_bindings', 'common_knowledge_revision', 'project_knowledge_revision',
  'policy_bundle_revision', 'ruleset_revision',
  'accepted_context_generation', 'acl_policy_revision', 'execution_mode',
]);

/**
 * Validates a project binding record.
 *
 * The binding is pointers, hashes, and version metadata. It never contains project
 * material: contracts, source bodies, and evidence payload stay where their owner holds
 * them, and the binding only names revisions.
 */
export function validateBinding(binding, { engineAbiVersion } = {}) {
  if (binding === null || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new ContractError(CODES.BINDING_FIELD_MISSING, 'binding is not an object');
  }
  for (const f of REQUIRED_BINDING_FIELDS) {
    if (!Object.hasOwn(binding, f)) {
      throw new ContractError(CODES.BINDING_FIELD_MISSING, `binding field "${f}" is missing`, { project_binding_ref: binding.project_binding_ref });
    }
  }
  if (!SEMVER_EXACT.test(binding.engine_release_version)) {
    throw new ContractError(CODES.VERSION_NOT_EXACT, 'engine_release_version must be exact semver');
  }
  if (!SHA256_HEX.test(binding.engine_artifact_sha256)) {
    throw new ContractError(CODES.ARTIFACT_HASH_INVALID, 'engine_artifact_sha256 must be a sha256 hex digest');
  }
  if (!Number.isInteger(binding.accepted_context_generation) || binding.accepted_context_generation < 0) {
    throw new ContractError(CODES.BINDING_FIELD_MISSING, 'accepted_context_generation must be a non-negative integer');
  }
  if (!EXECUTION_MODES.includes(binding.execution_mode)) {
    throw new ContractError(CODES.MODE_INVALID, `execution_mode must be one of ${EXECUTION_MODES.join(', ')}`);
  }
  if (!Array.isArray(binding.module_bindings) || binding.module_bindings.length === 0) {
    throw new ContractError(CODES.BINDING_FIELD_MISSING, 'module_bindings must be a non-empty array');
  }
  const incompatible = [];
  for (const m of binding.module_bindings) {
    validateManifest(m);
    if (engineAbiVersion && !abiSatisfies(engineAbiVersion, m.engine_contract_abi_range)) {
      incompatible.push({ module_id: m.module_id, range: m.engine_contract_abi_range });
    }
  }
  if (incompatible.length) {
    throw new ContractError(CODES.ABI_INCOMPATIBLE,
      'a bound module does not accept this engine abi version', { engineAbiVersion, incompatible });
  }
  // Two projects may legitimately pin different approved engine versions. That is the
  // point of one shared release with per-project bindings.
  return { valid: true, project_binding_ref: binding.project_binding_ref, module_count: binding.module_bindings.length };
}

export function bindingRevision(binding) {
  const material = Object.fromEntries(REQUIRED_BINDING_FIELDS
    .filter((f) => f !== 'module_bindings')
    .map((f) => [f, binding[f]]));
  material.module_bindings = [...binding.module_bindings]
    .map((m) => ({ module_id: m.module_id, module_version: m.module_version, artifact_sha256: m.artifact_sha256, configuration_hash: m.configuration_hash }))
    .sort((a, b) => compareCodePoints(a.module_id, b.module_id));
  return createHash(CANONICAL.hashAlgorithm)
    .update(`soulforge.se_engine.module_binding.v0\n${canonicalise(material, { module_bindings: 'sorted_by:module_id' })}`)
    .digest('hex');
}

/**
 * A new module binding never replaces a running one mid-flight.
 *
 * It loads side by side, is compared against the incumbent on synthetic or frozen gold
 * input, is reviewed, and applies from the next accepted generation. Swapping during a run
 * would make one run's output depend on two different module sets.
 */
export function planModuleTransition({ incumbent, candidate, runInProgress, shadowComparison, review, engineAbiVersion }) {
  if (runInProgress === true) {
    throw new ContractError(CODES.HOT_SWAP_FORBIDDEN,
      'a module binding cannot change while a run is in progress; load side by side and apply from the next generation');
  }
  validateManifest(incumbent);
  validateManifest(candidate);
  if (engineAbiVersion && !abiSatisfies(engineAbiVersion, candidate.engine_contract_abi_range)) {
    throw new ContractError(CODES.ABI_INCOMPATIBLE, 'candidate module does not accept this engine abi version');
  }
  if (!shadowComparison || shadowComparison.performed !== true) {
    throw new ContractError(CODES.PROMOTION_EVIDENCE_MISSING, 'a side-by-side shadow comparison is required before promotion');
  }
  if (shadowComparison.diverged === true && shadowComparison.divergence_accepted !== true) {
    throw new ContractError(CODES.SHADOW_DIVERGENCE_UNRESOLVED,
      'shadow comparison diverged and the divergence was not explicitly accepted', { detail: shadowComparison.detail ?? null });
  }
  if (!review || review.fresh_review_passed !== true) {
    throw new ContractError(CODES.PROMOTION_EVIDENCE_MISSING, 'a fresh independent review is required before promotion');
  }
  if (candidate.migration_requirement && candidate.migration_requirement !== 'none' && review.migration_reviewed !== true) {
    throw new ContractError(CODES.PROMOTION_EVIDENCE_MISSING, 'a module declaring a migration requirement needs that migration reviewed');
  }
  return {
    action: 'promote_from_next_generation',
    applies_at: 'next_accepted_context_generation',
    hot_swap: false,
    incumbent_version: incumbent.module_version,
    candidate_version: candidate.module_version,
    prior_binding_retained_for_rollback: true,
  };
}

/**
 * A release is an immutable artifact plus the evidence that identifies it.
 *
 * Without the hash and manifest a deployment cannot say what it deployed, which makes both
 * replay and rollback guesswork.
 */
export function validateRelease(release) {
  const required = ['release_version', 'artifact_sha256', 'manifest_sha256', 'built_from_commit', 'test_receipt_ref', 'review_receipt_ref', 'built_at'];
  for (const f of required) {
    if (!Object.hasOwn(release ?? {}, f)) {
      throw new ContractError(CODES.RELEASE_NOT_IMMUTABLE, `release field "${f}" is missing; a release without it is not identifiable`, { field: f });
    }
  }
  if (!SEMVER_EXACT.test(release.release_version)) throw new ContractError(CODES.VERSION_NOT_EXACT, 'release_version must be exact semver');
  for (const h of ['artifact_sha256', 'manifest_sha256']) {
    if (!SHA256_HEX.test(release[h])) throw new ContractError(CODES.ARTIFACT_HASH_INVALID, `${h} must be a sha256 hex digest`);
  }
  if (!inspectInstant(release.built_at).valid) throw new ContractError(CODES.RELEASE_NOT_IMMUTABLE, 'built_at is not a canonical instant');
  if (release.mutable === true || release.source_checkout_path) {
    throw new ContractError(CODES.RELEASE_NOT_IMMUTABLE, 'a release is an immutable artifact, not a mutable source checkout');
  }
  return { valid: true, release_version: release.release_version };
}

/**
 * Rollback re-selects a previously verified artifact for a binding.
 *
 * It is deliberately not a source revert: what was running was the artifact, so reverting
 * a checkout would leave the deployed thing unexplained. The target must already carry its
 * own verification evidence, because rolling back to something unproven trades one unknown
 * for another.
 */
export function planRollback({ binding, targetRelease, verifiedReleases, revertSourceCheckout }) {
  if (revertSourceCheckout === true) {
    throw new ContractError(CODES.ROLLBACK_IS_NOT_A_SOURCE_REVERT,
      'rollback re-selects a verified artifact for the binding; it does not revert a source checkout');
  }
  validateRelease(targetRelease);
  const verified = (verifiedReleases ?? []).some((r) => r.release_version === targetRelease.release_version && r.artifact_sha256 === targetRelease.artifact_sha256);
  if (!verified) {
    throw new ContractError(CODES.ROLLBACK_TARGET_UNVERIFIED,
      'the rollback target is not in the verified release set', { target: targetRelease.release_version });
  }
  const compatible = (binding.module_bindings ?? []).every((m) => (m.rollback_compatible_with ?? []).includes(targetRelease.release_version));
  return {
    action: 'reselect_verified_artifact_for_binding',
    project_binding_ref: binding.project_binding_ref,
    target_release_version: targetRelease.release_version,
    target_artifact_sha256: targetRelease.artifact_sha256,
    module_rollback_compatible: compatible,
    // If a bound module never declared compatibility with the target, say so rather than
    // assuming it will work.
    requires_module_review: !compatible,
    source_checkout_touched: false,
  };
}

// The store location and the authority that may promote or roll back a binding are owner
// decisions this lane does not take. It fixes what a release and a rollback must satisfy.
export const OPEN_OWNER_DECISIONS_FOR_THIS_LANE = Object.freeze([
  'release_artifact_store_location_and_owner',
  'binding_promotion_authority',
  'rollback_authority',
  'high_security_project_isolation_threshold',
]);

// Lane 1E conformance — module manifest, ABI range, project binding, release, rollback.
//
// Verification strength: author-written fixtures. The frozen Phase 1-0 oracle encodes no 1E
// case, so these expectations share an author with the implementation. Lane 1V owes a
// mutation-based lock over this file.

import {
  CODES, EXECUTION_MODES, REQUIRED_MANIFEST_FIELDS, REQUIRED_BINDING_FIELDS,
  parseAbiRange, abiSatisfies, validateManifest, validateBinding, bindingRevision,
  planModuleTransition, validateRelease, planRollback,
  OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
} from '../kernel/module_binding.mjs';
import { ContractError } from '../kernel/errors.mjs';

const results = [];
const record = (id, ok, note = '') => results.push({ id, ok: ok === true, note });
const rejects = (id, fn, expectedCode, note = '') => {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  const ok = err instanceof ContractError && (!expectedCode || err.code === expectedCode);
  record(id, ok, ok ? note : `expected ${expectedCode}, got ${err ? err.code : 'no error'}`);
};
const accepts = (id, fn, note = '') => {
  try { fn(); record(id, true, note); } catch (e) { record(id, false, `unexpected ${e.code ?? e.message}`); }
};

// A suite that cannot fail proves nothing, and every green count in this tree has to mean
// something. These five probes assert the helpers detect what they claim to.
{
  const probe = [];
  const rec = (ok) => probe.push(ok === true);
  const rej = (fn, code) => { let e = null; try { fn(); } catch (x) { e = x; } rec(e instanceof ContractError && (!code || e.code === code)); };
  const acc = (fn) => { try { fn(); rec(true); } catch { rec(false); } };
  rej(() => 1, 'ANY_CODE');                                            // no throw  -> must be false
  rej(() => { throw new ContractError('OTHER', 'x'); }, 'WANTED');      // wrong code -> must be false
  rej(() => { throw new ContractError('WANTED', 'x'); }, 'WANTED');     // right code -> must be true
  rej(() => { throw new TypeError('x'); }, undefined);                  // wrong class -> must be false
  acc(() => { throw new ContractError('X', 'x'); });                    // throws     -> must be false
  record('1E/harness/self_test',
    probe[0] === false && probe[1] === false && probe[2] === true && probe[3] === false && probe[4] === false,
    'the reject and accept helpers detect what they claim to');
}

const manifest = (over = {}) => ({
  module_id: 'mod.gap_finder',
  module_version: '1.2.0',
  build_commit: 'a1b2c3d4e5f6',
  artifact_sha256: 'a'.repeat(64),
  engine_contract_abi_range: '>=1.0.0 <2.0.0',
  input_schema_revision: 'in.v1',
  output_schema_revision: 'out.v1',
  authority_ceiling: 'reviewed_wiki',
  claim_ceiling: 'evidence_supported',
  supported_project_classifications: ['standard'],
  execution_mode: 'deterministic_only',
  dependency_versions: { kernel: '1.0.0' },
  configuration_hash: 'b'.repeat(64),
  migration_requirement: 'none',
  rollback_compatible_with: ['1.1.0'],
  test_receipt_ref: 'receipt-0001',
  ...over,
});

const binding = (over = {}) => ({
  project_binding_ref: 'pb-0001',
  engine_release_version: '1.4.0',
  engine_artifact_sha256: 'c'.repeat(64),
  engine_contract_revision: 'phase_1_0_contract.v0',
  snapshot_schema_revision: 'snap.v1',
  module_abi_revision: '1.0.0',
  module_bindings: [manifest()],
  common_knowledge_revision: 'ck-12',
  project_knowledge_revision: 'pk-7',
  policy_bundle_revision: 'pol-3',
  ruleset_revision: 'rs-9',
  accepted_context_generation: 4,
  acl_policy_revision: 'acl-2',
  execution_mode: 'deterministic_only',
  ...over,
});

const release = (over = {}) => ({
  release_version: '1.4.0',
  artifact_sha256: 'c'.repeat(64),
  manifest_sha256: 'd'.repeat(64),
  built_from_commit: 'f0e1d2c3b4a5',
  test_receipt_ref: 'rc-1',
  review_receipt_ref: 'rv-1',
  built_at: '2026-08-10T12:00:00.000Z',
  ...over,
});

// ---------------------------------------------------------------- abi range

accepts('1E/abi/range_parses', () => parseAbiRange('>=1.0.0 <2.0.0'), 'positive control');
for (const [label, bad] of [
  ['single_version_is_not_a_range', '1.0.0'],
  ['caret_is_not_a_range', '^1.0.0'],
  ['open_upper_bound', '>=1.0.0'],
  ['inverted_bounds', '>=2.0.0 <1.0.0'],
  ['equal_bounds', '>=1.0.0 <1.0.0'],
  ['wildcard_bound', '>=1.0.x <2.0.0'],
  ['not_a_string', 7],
]) {
  rejects(`1E/abi/${label}`, () => parseAbiRange(bad), CODES.ABI_RANGE_INVALID);
}
record('1E/abi/inside_range', abiSatisfies('1.5.9', '>=1.0.0 <2.0.0') === true);
record('1E/abi/at_lower_bound_included', abiSatisfies('1.0.0', '>=1.0.0 <2.0.0') === true);
record('1E/abi/at_upper_bound_excluded', abiSatisfies('2.0.0', '>=1.0.0 <2.0.0') === false,
  'the upper bound is exclusive, so a major bump does not silently qualify');
record('1E/abi/below_range', abiSatisfies('0.9.9', '>=1.0.0 <2.0.0') === false);
rejects('1E/abi/engine_version_must_be_exact', () => abiSatisfies('1.x', '>=1.0.0 <2.0.0'), CODES.VERSION_NOT_EXACT);

// ---------------------------------------------------------------- manifest

accepts('1E/manifest/complete_manifest_passes', () => validateManifest(manifest()), 'positive control');
for (const field of REQUIRED_MANIFEST_FIELDS) {
  const m = manifest();
  delete m[field];
  rejects(`1E/manifest/missing/${field}`, () => validateManifest(m), undefined, 'no field defaults');
}
for (const [label, bad] of [
  ['range_version', '^1.2.0'],
  ['wildcard_version', '1.2.x'],
  ['latest', 'latest'],
  ['leading_zero', '01.2.0'],
]) {
  rejects(`1E/manifest/version/${label}`, () => validateManifest(manifest({ module_version: bad })), CODES.VERSION_NOT_EXACT);
}
rejects('1E/manifest/artifact_hash_must_be_sha256',
  () => validateManifest(manifest({ artifact_sha256: 'deadbeef' })), CODES.ARTIFACT_HASH_INVALID);
rejects('1E/manifest/uppercase_hash_rejected',
  () => validateManifest(manifest({ artifact_sha256: 'A'.repeat(64) })), CODES.ARTIFACT_HASH_INVALID,
  'one spelling per digest');
rejects('1E/manifest/unknown_execution_mode',
  () => validateManifest(manifest({ execution_mode: 'ai_only' })), CODES.MODE_INVALID);
record('1E/manifest/declared_modes', EXECUTION_MODES.length === 2 && EXECUTION_MODES[0] === 'deterministic_only');
for (const [label, bad] of [['caret', '^1.0.0'], ['tilde', '~1.0.0'], ['latest', 'latest'], ['wildcard', '1.0.*']]) {
  rejects(`1E/manifest/floating_dependency/${label}`,
    () => validateManifest(manifest({ dependency_versions: { kernel: bad } })), CODES.FLOATING_DEPENDENCY,
    'one floating dependency makes the artifact irreproducible');
}
accepts('1E/manifest/exact_dependency_passes',
  () => validateManifest(manifest({ dependency_versions: { kernel: '1.0.0', yaml_reader: '0.3.1' } })), 'positive control');
rejects('1E/manifest/rollback_target_must_be_exact',
  () => validateManifest(manifest({ rollback_compatible_with: ['1.x'] })), CODES.VERSION_NOT_EXACT);
rejects('1E/manifest/unproven_module_is_not_promotable',
  () => validateManifest(manifest({ test_receipt_ref: '' })), CODES.PROMOTION_EVIDENCE_MISSING);
rejects('1E/manifest/bad_build_commit', () => validateManifest(manifest({ build_commit: 'HEAD' })), CODES.VERSION_NOT_EXACT);
rejects('1E/manifest/not_an_object', () => validateManifest(null), CODES.MANIFEST_FIELD_MISSING);

// ---------------------------------------------------------------- binding

accepts('1E/binding/complete_binding_passes', () => validateBinding(binding(), { engineAbiVersion: '1.4.0' }), 'positive control');
for (const field of REQUIRED_BINDING_FIELDS) {
  const b = binding();
  delete b[field];
  rejects(`1E/binding/missing/${field}`, () => validateBinding(b), undefined);
}
rejects('1E/binding/module_outside_abi_range',
  () => validateBinding(binding({ module_bindings: [manifest({ engine_contract_abi_range: '>=2.0.0 <3.0.0' })] }), { engineAbiVersion: '1.4.0' }),
  CODES.ABI_INCOMPATIBLE, 'compatibility is checked, not assumed from a nearby number');
rejects('1E/binding/floating_engine_version',
  () => validateBinding(binding({ engine_release_version: 'latest' })), CODES.VERSION_NOT_EXACT,
  'a binding names an exact release, never latest');
rejects('1E/binding/negative_generation',
  () => validateBinding(binding({ accepted_context_generation: -1 })), CODES.BINDING_FIELD_MISSING);
rejects('1E/binding/fractional_generation',
  () => validateBinding(binding({ accepted_context_generation: 1.5 })), CODES.BINDING_FIELD_MISSING);
rejects('1E/binding/no_modules_bound',
  () => validateBinding(binding({ module_bindings: [] })), CODES.BINDING_FIELD_MISSING);
accepts('1E/binding/two_projects_may_pin_different_releases', () => {
  validateBinding(binding({ project_binding_ref: 'pb-0001', engine_release_version: '1.4.0' }), { engineAbiVersion: '1.4.0' });
  validateBinding(binding({ project_binding_ref: 'pb-0002', engine_release_version: '1.3.0' }), { engineAbiVersion: '1.3.0' });
}, 'one shared release with per-project bindings is the point');

// ---------------------------------------------------------------- binding revision

{
  const a = manifest({ module_id: 'mod.a' });
  const b = manifest({ module_id: 'mod.b', artifact_sha256: 'e'.repeat(64) });
  const forward = bindingRevision(binding({ module_bindings: [a, b] }));
  const reversed = bindingRevision(binding({ module_bindings: [b, a] }));
  record('1E/revision/stable_under_module_order', forward === reversed,
    'the order the modules were listed in is not part of what was bound');
  const changed = bindingRevision(binding({ module_bindings: [a, manifest({ module_id: 'mod.b', artifact_sha256: 'f'.repeat(64) })] }));
  record('1E/revision/changes_when_an_artifact_changes', forward !== changed,
    'a different artifact is a different binding');
  const cfg = bindingRevision(binding({ module_bindings: [a, manifest({ module_id: 'mod.b', artifact_sha256: 'e'.repeat(64), configuration_hash: '1'.repeat(64) })] }));
  record('1E/revision/changes_when_configuration_changes', forward !== cfg,
    'same code with different configuration is a different binding');
  const gen = bindingRevision(binding({ module_bindings: [a, b], accepted_context_generation: 5 }));
  record('1E/revision/changes_with_generation', forward !== gen);
  record('1E/revision/is_a_sha256_hex', /^[0-9a-f]{64}$/.test(forward));
}

// ---------------------------------------------------------------- transition

const shadowOk = { performed: true, diverged: false };
const reviewOk = { fresh_review_passed: true, migration_reviewed: true };

rejects('1E/transition/no_hot_swap_during_a_run',
  () => planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '1.3.0' }), runInProgress: true, shadowComparison: shadowOk, review: reviewOk }),
  CODES.HOT_SWAP_FORBIDDEN, 'one run must not depend on two module sets');
rejects('1E/transition/shadow_comparison_required',
  () => planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '1.3.0' }), runInProgress: false, review: reviewOk }),
  CODES.PROMOTION_EVIDENCE_MISSING);
rejects('1E/transition/unaccepted_divergence_blocks',
  () => planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '1.3.0' }), runInProgress: false, shadowComparison: { performed: true, diverged: true }, review: reviewOk }),
  CODES.SHADOW_DIVERGENCE_UNRESOLVED);
accepts('1E/transition/accepted_divergence_proceeds',
  () => planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '1.3.0' }), runInProgress: false, shadowComparison: { performed: true, diverged: true, divergence_accepted: true }, review: reviewOk }),
  'a divergence may be intended, but it must be said out loud');
rejects('1E/transition/fresh_review_required',
  () => planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '1.3.0' }), runInProgress: false, shadowComparison: shadowOk, review: { fresh_review_passed: false } }),
  CODES.PROMOTION_EVIDENCE_MISSING);
rejects('1E/transition/declared_migration_must_be_reviewed',
  () => planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '2.0.0', migration_requirement: 'snapshot_reindex' }), runInProgress: false, shadowComparison: shadowOk, review: { fresh_review_passed: true } }),
  CODES.PROMOTION_EVIDENCE_MISSING);
rejects('1E/transition/candidate_outside_abi_range',
  () => planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '1.3.0', engine_contract_abi_range: '>=3.0.0 <4.0.0' }), runInProgress: false, shadowComparison: shadowOk, review: reviewOk, engineAbiVersion: '1.4.0' }),
  CODES.ABI_INCOMPATIBLE);
{
  const plan = planModuleTransition({ incumbent: manifest(), candidate: manifest({ module_version: '1.3.0' }), runInProgress: false, shadowComparison: shadowOk, review: reviewOk, engineAbiVersion: '1.4.0' });
  record('1E/transition/applies_from_next_generation', plan.applies_at === 'next_accepted_context_generation');
  record('1E/transition/never_reports_a_hot_swap', plan.hot_swap === false);
  record('1E/transition/prior_binding_retained', plan.prior_binding_retained_for_rollback === true,
    'rollback needs the thing it rolls back to');
}

// ---------------------------------------------------------------- release

accepts('1E/release/complete_release_passes', () => validateRelease(release()), 'positive control');
for (const field of ['release_version', 'artifact_sha256', 'manifest_sha256', 'built_from_commit', 'test_receipt_ref', 'review_receipt_ref', 'built_at']) {
  const r = release();
  delete r[field];
  rejects(`1E/release/missing/${field}`, () => validateRelease(r), CODES.RELEASE_NOT_IMMUTABLE);
}
rejects('1E/release/mutable_flag_rejected', () => validateRelease(release({ mutable: true })), CODES.RELEASE_NOT_IMMUTABLE);
rejects('1E/release/source_checkout_is_not_a_release',
  () => validateRelease(release({ source_checkout_path: 'repo/main' })), CODES.RELEASE_NOT_IMMUTABLE,
  'what runs is the artifact, not a checkout');
rejects('1E/release/built_at_must_be_canonical',
  () => validateRelease(release({ built_at: '2026-08-10T12:00:00Z' })), CODES.RELEASE_NOT_IMMUTABLE,
  'three fractional digits, per D-P10-07');
rejects('1E/release/impossible_built_at',
  () => validateRelease(release({ built_at: '2026-02-30T12:00:00.000Z' })), CODES.RELEASE_NOT_IMMUTABLE);

// ---------------------------------------------------------------- rollback

const verified = [release({ release_version: '1.3.0', artifact_sha256: '3'.repeat(64) }), release()];

rejects('1E/rollback/is_not_a_source_revert',
  () => planRollback({ binding: binding(), targetRelease: release({ release_version: '1.3.0', artifact_sha256: '3'.repeat(64) }), verifiedReleases: verified, revertSourceCheckout: true }),
  CODES.ROLLBACK_IS_NOT_A_SOURCE_REVERT);
rejects('1E/rollback/target_must_be_verified',
  () => planRollback({ binding: binding(), targetRelease: release({ release_version: '1.2.0', artifact_sha256: '2'.repeat(64) }), verifiedReleases: verified }),
  CODES.ROLLBACK_TARGET_UNVERIFIED, 'rolling back to something unproven trades one unknown for another');
rejects('1E/rollback/hash_must_match_the_verified_entry',
  () => planRollback({ binding: binding(), targetRelease: release({ release_version: '1.3.0', artifact_sha256: '9'.repeat(64) }), verifiedReleases: verified }),
  CODES.ROLLBACK_TARGET_UNVERIFIED, 'same version number, different bytes');
{
  const plan = planRollback({
    binding: binding({ module_bindings: [manifest({ rollback_compatible_with: ['1.3.0'] })] }),
    targetRelease: release({ release_version: '1.3.0', artifact_sha256: '3'.repeat(64) }),
    verifiedReleases: verified,
  });
  record('1E/rollback/reselects_an_artifact', plan.action === 'reselect_verified_artifact_for_binding');
  record('1E/rollback/leaves_the_checkout_alone', plan.source_checkout_touched === false);
  record('1E/rollback/compatible_module_needs_no_review', plan.module_rollback_compatible === true && plan.requires_module_review === false,
    'positive control');
}
{
  const plan = planRollback({
    binding: binding({ module_bindings: [manifest({ rollback_compatible_with: ['1.1.0'] })] }),
    targetRelease: release({ release_version: '1.3.0', artifact_sha256: '3'.repeat(64) }),
    verifiedReleases: verified,
  });
  record('1E/rollback/undeclared_compatibility_is_flagged_not_assumed', plan.requires_module_review === true,
    'silence about compatibility is not a claim of compatibility');
}

// ---------------------------------------------------------------- open items

record('1E/open_items_declared', OPEN_OWNER_DECISIONS_FOR_THIS_LANE.length >= 3 &&
  OPEN_OWNER_DECISIONS_FOR_THIS_LANE.includes('rollback_authority'),
  'the lane fixes what a rollback must satisfy, not who may order one');

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.ok);
for (const f of failures) console.error(`FAIL  ${f.id}  ${f.note}`);

console.log(JSON.stringify({
  slice: 'lane_1e_module_abi_binding_release_rollback',
  owns_field_group: 'module_abi_binding_artifact_and_module_binding_revision',
  result: failures.length === 0 ? 'PASS' : 'FAIL',
  pass_count: results.length - failures.length,
  failure_count: failures.length,
  failures: failures.map((f) => ({ id: f.id, note: f.note })),
  verification_strength: 'author_written_fixtures',
  independent_lock_owed_by: 'lane_1V',
  open_owner_decisions: OPEN_OWNER_DECISIONS_FOR_THIS_LANE,
  writes_performed: 0,
}, null, 2));

process.exit(failures.length === 0 ? 0 : 1);

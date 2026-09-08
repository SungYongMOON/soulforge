import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareForgeWorldPolicyCandidate } from './forge_world_policy_candidate.mjs';
import { buildRequirementCoverageInput } from './coverage_input_builder.mjs';
import { buildForgeWorldCoverage, worldCoverageDigest } from './forge_world_coverage.mjs';

const fixture = JSON.parse(readFileSync(new URL('../../docs/architecture/workspace/examples/project_requirement_trace/forge_world_policy_candidate_synthetic_v0.json', import.meta.url)));
const builderFixture = JSON.parse(readFileSync(new URL('../../docs/architecture/workspace/examples/project_requirement_trace/coverage_input_builder_synthetic_v0.json', import.meta.url)));
const request = () => {
  const value = structuredClone(fixture);
  value.policy_binding.policy_digest = worldCoverageDigest(value.expected_artifact_policy);
  return value;
};

test('inventory joins preserve number collisions, zeros and exclusions without creating coverage', () => {
  const value = request();
  const output = prepareForgeWorldPolicyCandidate(value);
  assert.equal(output.maturity, 'hold');
  assert.equal(output.world_coverage, null);
  assert.deepEqual(output.counts, { selected_categories: 1, zero_categories: 2, joined_categories: 2,
    unjoined_categories: 1, policy_slots: 2, sample_slots: 0 });
  assert.ok(output.categories.find(row => row.category_id === 'group_42_presentation').reasons.includes('category_binding_conflict'));
  assert.ok(output.categories.find(row => row.category_id === 'empty_group').reasons.includes('zero_is_scoped_inventory_only'));
  assert.ok(output.categories.every(row => row.coverage_state === 'gap_unknown'));
  value.metadata.categories[0].file_count = 9999;
  value.metadata.categories[0].helper_name_count = 9999;
  value.metadata.categories[0].excluded_count = 1;
  const changed = prepareForgeWorldPolicyCandidate(value);
  assert.equal(changed.world_coverage, null);
  assert.ok(changed.categories.find(row => row.category_id === 'group_42_presentation').reasons.includes('helper_names_only'));
});

test('deterministic independent of category/join order, input immutable and result deeply frozen', () => {
  const value = request(); const before = JSON.stringify(value);
  const first = prepareForgeWorldPolicyCandidate(value);
  assert.equal(JSON.stringify(value), before);
  value.metadata.categories.reverse(); value.category_bindings.reverse();
  assert.deepEqual(prepareForgeWorldPolicyCandidate(value), first);
  assert.ok(Object.isFrozen(first.categories[0].matched_policy_slots));
});

test('cross-project, stale snapshot, mutated policy and duplicate joins refuse', () => {
  for (const [mutate, error] of [
    [value => { value.policy_binding.project_code = 'OTHER'; }, /BINDING_INVALID/u],
    [value => { value.policy_binding.metadata_digest = `sha256:${'c'.repeat(64)}`; }, /BINDING_INVALID/u],
    [value => { value.expected_artifact_policy.stage_family_defaults[0].required_artifact_families.pop(); }, /BINDING_INVALID/u],
    [value => { value.category_bindings.push(value.category_bindings[0]); }, /JOIN_DUPLICATE/u],
    [value => { value.metadata.categories.push(value.metadata.categories[0]); }, /CATEGORY_DUPLICATE/u],
    [value => { value.category_bindings[0].stage_code = 'OTHER_STAGE'; }, /JOIN_UNBOUND/u],
    [value => { value.category_bindings[0].artifact_family_id = 'invented'; }, /JOIN_UNBOUND/u],
    [value => { value.metadata.categories[1].file_count = 1; }, /CATEGORY_INVALID/u],
    [value => { value.metadata.categories[1].error_count = 1; }, /CATEGORY_INVALID/u],
    [value => { value.policy_binding.state = 'confirmed'; }, /CONFIRMATION_INCOMPLETE/u],
  ]) { const value = request(); mutate(value); assert.throws(() => prepareForgeWorldPolicyCandidate(value), error); }
});

test('same policy identifier cannot hide an incompatible exact revision', () => {
  const value = request();
  const ref = { entity_id: 'same-policy', revision_id: 'revision-1', content_id: `sha256:${'d'.repeat(64)}`, content_hash_alg: 'sha256' };
  value.policy_binding.expected_policy_ref = ref;
  value.policy_binding.needs_extends_ref = { ...ref, revision_id: 'revision-2' };
  assert.throws(() => prepareForgeWorldPolicyCandidate(value), /POLICY_REF_MISMATCH/u);
});

function readyRequest() {
  const value = request();
  const built = buildRequirementCoverageInput(builderFixture.request);
  const input = structuredClone(built.input);
  const policy = { schema_version: 'se_stage_expected_artifact_policy_v0', stage_family_defaults: input.stages.map(stage => ({
    stage_code: stage.stage_code, required_artifact_families: [...new Set(input.needs.map(need => need.needed_artifact_type_id))]
      .map(artifact_family_id => ({ artifact_family_id, minimum_presence_rule: 'present' })),
  })) };
  value.expected_artifact_policy = policy;
  value.metadata.categories = []; value.category_bindings = [];
  value.policy_binding = { ...value.policy_binding, policy_digest: worldCoverageDigest(policy),
    expected_policy_ref: builderFixture.request.needs_policy.extends.policy_ref,
    needs_extends_ref: builderFixture.request.needs_policy.extends.policy_ref,
    needs_policy_ref: input.needs[0].policy_ref, state: 'confirmed',
    decision_ref: `sha256:${'e'.repeat(64)}`, coverage_input_revision: worldCoverageDigest(input) };
  value.coverage_request = { project_code: value.project_code, source_kind: 'observed',
    coverage_input: input, expected_artifact_policy: policy,
    source_binding: { project_code: value.project_code, input_revision: worldCoverageDigest(input), policy_digest: worldCoverageDigest(policy) } };
  return value;
}

test('exact caller binding plus real R1 input delegates directly to existing producer', () => {
  const value = readyRequest(); const before = JSON.stringify(value);
  const output = prepareForgeWorldPolicyCandidate(value);
  assert.equal(output.maturity, 'computed_observed');
  assert.deepEqual(output.world_coverage, buildForgeWorldCoverage(value.coverage_request));
  assert.equal(output.world_coverage.counts.sample_slots, 0);
  assert.equal(output.world_coverage.authority_boundary.acceptance_authority, false);
  assert.notEqual(output.source_observed_at, output.world_coverage.observed_at);
  assert.equal(JSON.stringify(value), before);
});

test('approved marker never substitutes for changed input, Needs revision or sample provenance', () => {
  for (const [mutate, error] of [
    [value => { value.coverage_request.coverage_input.cutoffs.known_at = '2026-01-01T00:00:00Z'; }, /COVERAGE_BINDING_MISMATCH/u],
    [value => { value.policy_binding.needs_policy_ref = { ...value.policy_binding.needs_policy_ref, revision_id: 'other-revision' }; }, /NEEDS_REF_MISMATCH/u],
    [value => { value.coverage_request.source_kind = 'sample'; }, /COVERAGE_BINDING_MISMATCH/u],
    [value => { value.coverage_request.source_binding.input_revision = `sha256:${'0'.repeat(64)}`; }, /WORLD_SOURCE_BINDING_MISMATCH/u],
  ]) { const value = readyRequest(); mutate(value); assert.throws(() => prepareForgeWorldPolicyCandidate(value), error); }
});

test('private paths, payload fields and caller metadata cannot pass into output', () => {
  const value = request();
  const privatePath = ['X:', 'private', 'project'].join('/');
  value.metadata.categories[0].relative_directory = privatePath;
  assert.throws(() => prepareForgeWorldPolicyCandidate(value), /CATEGORY_INVALID/u);
  delete value.metadata.categories[0].relative_directory;
  value.expected_artifact_policy.private_path = privatePath;
  value.policy_binding.policy_digest = worldCoverageDigest(value.expected_artifact_policy);
  assert.ok(!JSON.stringify(prepareForgeWorldPolicyCandidate(value)).includes(privatePath));
  const source = readFileSync(new URL('./forge_world_policy_candidate.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|http|https|net|child_process)|Date\.now|new Date|process\.|fetch\s*\(/u);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRequirementCoverageInput } from './coverage_input_builder.mjs';
import { buildForgeWorldCoverage, worldCoverageDigest } from './forge_world_coverage.mjs';

const fixture = JSON.parse(readFileSync(new URL('../../docs/architecture/workspace/examples/project_requirement_trace/coverage_input_builder_synthetic_v0.json', import.meta.url)));
function request() {
  const input = structuredClone(buildRequirementCoverageInput(fixture.request).input);
  const stageMap = new Map(input.stages.map(stage => [stage.stage_code, new Set()]));
  for (const need of input.needs) {
    const requirement = input.requirements.find(row => row.requirement_ref.entity_id === need.requirement_ref.entity_id);
    stageMap.get(requirement.stage_code).add(need.needed_artifact_type_id);
  }
  const policy = {
    schema_version: 'se_stage_expected_artifact_policy_v0',
    stage_family_defaults: [...stageMap].map(([stage_code, types]) => ({
      stage_code, required_artifact_families: [...types].map(artifact_family_id => ({ artifact_family_id, minimum_presence_rule: 'present' })),
    })),
  };
  return {
    project_code: 'SYNTHETIC-01', source_kind: 'sample', coverage_input: input, expected_artifact_policy: policy,
    source_binding: { project_code: 'SYNTHETIC-01', input_revision: worldCoverageDigest(input), policy_digest: worldCoverageDigest(policy) },
  };
}

test('world slots count unique stage/artifact identities, not requirement cells', () => {
  const input = request();
  const before = JSON.stringify(input);
  const output = buildForgeWorldCoverage(input);
  assert.ok(output.counts.cells > output.slots.length);
  assert.equal(new Set(output.slots.map(row => JSON.stringify([row.project_code, row.stage_code, row.artifact_family_id]))).size, output.slots.length);
  assert.equal(output.counts.observed_slots, 0);
  assert.equal(output.counts.sample_slots, output.slots.length);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(buildForgeWorldCoverage(input), output);
  assert.ok(Object.isFrozen(output.slots[0]));
});

test('no policy/acceptance or work authority follows from coverage presence', () => {
  const output = buildForgeWorldCoverage(request());
  assert.ok(output.slots.some(slot => slot.reason_counts.observation_inconclusive > 0));
  for (const slot of output.slots) {
    assert.equal(slot.acceptance_state, 'unknown');
    assert.equal(slot.rune.task_id, null);
    assert.equal(slot.rune.ready, null);
    assert.ok(slot.source_observed_at <= output.observed_at);
  }
  assert.deepEqual(output.authority_boundary, { read_only: true, claim_authority: false, acceptance_authority: false, runtime_authority: false });
});

test('source binding refuses cross-project and changed generation inputs', () => {
  for (const mutate of [
    value => { value.source_binding.project_code = 'OTHER-02'; },
    value => { value.coverage_input.cutoffs.known_at = '2026-09-01T00:00:00Z'; },
    value => { value.expected_artifact_policy.stage_family_defaults[0].required_artifact_families.push({artifact_family_id: 'invented', minimum_presence_rule: 'present'}); },
  ]) {
    const value = request(); mutate(value);
    assert.throws(() => buildForgeWorldCoverage(value), /WORLD_SOURCE_BINDING_MISMATCH/u);
  }
});

test('undeclared needs, orphan coverage, and absent expected slots stay visible', () => {
  const value = request();
  value.expected_artifact_policy.stage_family_defaults[0].required_artifact_families.push({artifact_family_id: 'unobserved_type', minimum_presence_rule: 'present'});
  value.source_binding.policy_digest = worldCoverageDigest(value.expected_artifact_policy);
  const output = buildForgeWorldCoverage(value);
  const slot = output.slots.find(row => row.artifact_family_id === 'unobserved_type');
  assert.equal(slot.coverage_state, 'gap_unknown');
  assert.equal(slot.coverage_reason, 'coverage_not_attempted');
  assert.ok(output.unbound_counts.needs_undeclared > 0);
});

test('duplicate policy identity rejects instead of inflating slot count', () => {
  const value = request();
  value.expected_artifact_policy.stage_family_defaults.push(structuredClone(value.expected_artifact_policy.stage_family_defaults[0]));
  value.source_binding.policy_digest = worldCoverageDigest(value.expected_artifact_policy);
  assert.throws(() => buildForgeWorldCoverage(value), /WORLD_POLICY_SLOT_DUPLICATE/u);
});

test('observations retain their original time and sample provenance is explicit', () => {
  const value = request(); value.source_kind = 'observed';
  const output = buildForgeWorldCoverage(value);
  assert.equal(output.observed_at, value.coverage_input.cutoffs.known_at);
  assert.equal(output.counts.sample_slots, 0);
  assert.equal(output.counts.observed_slots, output.slots.filter(row => row.observation_count > 0).length);
  assert.ok(!JSON.stringify(output).includes('Synthetic clause title'));
  value.source_kind = 'guessed';
  assert.throws(() => buildForgeWorldCoverage(value), /WORLD_SOURCE_KIND_INVALID/u);
});

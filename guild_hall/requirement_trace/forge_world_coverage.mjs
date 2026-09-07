// Metadata producer for the world display. Caller supplies already admitted source
// metadata; a matching digest is an integrity check, never a grant to read a project.
// Recompute with the existing coverage owner instead of trusting supplied cell states.
import { createHash } from 'node:crypto';
import { computeRequirementCoverage } from './requirement_coverage.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const STATES = ['gap_conflict', 'gap_unknown', 'gap_missing', 'satisfied', 'not_applicable'];
const PRESENCE_RULES = new Set(['present', 'present_or_not_applicable', 'optional_context']);
const fail = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeId = value => typeof value === 'string' && ID.test(value);
const stable = value => Array.isArray(value) ? value.map(stable)
  : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const worldCoverageDigest = value => `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
export const FORGE_WORLD_COVERAGE_SCHEMA = 'soulforge.forge_world.coverage.v1';

export function buildForgeWorldCoverage(request) {
  if (!object(request) || Object.keys(request).some(key => ![
    'project_code', 'source_kind', 'coverage_input', 'expected_artifact_policy', 'source_binding',
  ].includes(key))) fail('WORLD_INPUT_INVALID');
  const { project_code: project, source_kind: kind, coverage_input: input,
    expected_artifact_policy: policy, source_binding: binding } = request;
  if (!safeId(project)) fail('WORLD_PROJECT_INVALID');
  if (!['observed', 'sample'].includes(kind)) fail('WORLD_SOURCE_KIND_INVALID');
  if (!object(binding) || binding.project_code !== project
    || binding.input_revision !== worldCoverageDigest(input)
    || binding.policy_digest !== worldCoverageDigest(policy)) fail('WORLD_SOURCE_BINDING_MISMATCH');
  if (!object(policy) || policy.schema_version !== 'se_stage_expected_artifact_policy_v0'
    || !Array.isArray(policy.stage_family_defaults) || policy.stage_family_defaults.length > 100) fail('WORLD_POLICY_INVALID');

  const coverage = computeRequirementCoverage(input);
  const observations = new Map(input.observations.map(row => [row.observation_id, row]));
  const buckets = new Map();
  const key = (stage, family) => JSON.stringify([project, stage, family]);
  for (const cell of coverage.cells) {
    if (!cell.needed_artifact_type_id) continue;
    const identity = key(cell.stage_code, cell.needed_artifact_type_id);
    if (!buckets.has(identity)) buckets.set(identity, []);
    buckets.get(identity).push(cell);
  }
  const slots = [];
  const seen = new Set();
  const stages = new Set();
  for (const stage of policy.stage_family_defaults) {
    if (!object(stage) || !safeId(stage.stage_code) || !Array.isArray(stage.required_artifact_families)
      || stage.required_artifact_families.length > 1000) fail('WORLD_POLICY_INVALID');
    if (stages.has(stage.stage_code)) fail('WORLD_POLICY_SLOT_DUPLICATE');
    stages.add(stage.stage_code);
    for (const family of stage.required_artifact_families) {
      if (!object(family) || !safeId(family.artifact_family_id)
        || !PRESENCE_RULES.has(family.minimum_presence_rule)) fail('WORLD_POLICY_INVALID');
      const identity = key(stage.stage_code, family.artifact_family_id);
      if (seen.has(identity)) fail('WORLD_POLICY_SLOT_DUPLICATE');
      seen.add(identity);
      const cells = buckets.get(identity) ?? [];
      const stateCounts = Object.fromEntries(STATES.map(state => [state, 0]));
      const reasonCounts = {};
      const observationIds = new Set();
      for (const cell of cells) {
        if (!STATES.includes(cell.state)) fail('WORLD_COVERAGE_STATE_INVALID');
        stateCounts[cell.state] += 1;
        const reason = cell.reason ?? cell.state;
        reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
        cell.observation_ids.forEach(id => observationIds.add(id));
      }
      const reasons = Object.keys(reasonCounts).sort();
      // A fresh projection cannot refresh the evidence it projects. Preserve the
      // earliest used observation timestamp; the reader owns its current clock.
      const times = [coverage.cutoffs.valid_at, coverage.cutoffs.known_at];
      for (const id of observationIds) {
        const observation = observations.get(id);
        if (!observation) fail('WORLD_OBSERVATION_REFERENCE_INVALID');
        times.push(observation.valid_at, observation.known_at);
      }
      slots.push({
        project_code: project, stage_code: stage.stage_code, artifact_family_id: family.artifact_family_id,
        minimum_presence_rule: family.minimum_presence_rule,
        coverage_state: STATES.find(state => stateCounts[state] > 0) ?? 'gap_unknown',
        coverage_reason: reasons.length > 1 ? 'mixed' : reasons[0] ?? 'coverage_not_attempted',
        cell_count: cells.length, state_counts: stateCounts, reason_counts: reasonCounts,
        observation_count: observationIds.size,
        source_observed_at: times.sort((a, b) => Date.parse(a) - Date.parse(b))[0],
        evidence_refs: cells.map(cell => `sha256:${cell.cell_id}`).sort(),
        acceptance_state: 'unknown',
        rune: { task_id: null, work_order_ref: null, blueprint_ref: null, ready: null, blocked_by: [] },
      });
    }
  }
  slots.sort((a, b) => {
    const left = key(a.stage_code, a.artifact_family_id), right = key(b.stage_code, b.artifact_family_id);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const body = {
    schema_version: FORGE_WORLD_COVERAGE_SCHEMA, project_code: project, source_kind: kind,
    input_revision: binding.input_revision, observed_at: coverage.cutoffs.known_at,
    valid_at: coverage.cutoffs.valid_at, slots,
    counts: {
      slots: slots.length, cells: coverage.cells.length,
      observed_slots: kind === 'observed' ? slots.filter(slot => slot.observation_count > 0).length : 0,
      sample_slots: kind === 'sample' ? slots.length : 0,
    },
    unbound_counts: {
      needs_undeclared: coverage.cells.filter(cell => !cell.needed_artifact_type_id).length,
      policy_slot_unmapped: coverage.cells.filter(cell => cell.needed_artifact_type_id
        && !seen.has(key(cell.stage_code, cell.needed_artifact_type_id))).length,
      unexpected_observed: coverage.orphans.length,
    },
    evidence: {
      policy_digest: binding.policy_digest,
      coverage_input_digest: `sha256:${coverage.receipt.input_digest_sha256}`,
      coverage_output_digest: `sha256:${coverage.receipt.output_digest_sha256}`,
    },
    authority_boundary: { read_only: true, claim_authority: false, acceptance_authority: false, runtime_authority: false },
  };
  return freeze({ ...body, generation: worldCoverageDigest(body) });
}

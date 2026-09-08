// Caller supplies admitted metadata and explicit joins. Folder names, counts and
// matching tokens never become observations or authority in this pure helper.
import { buildForgeWorldCoverage, worldCoverageDigest } from './forge_world_coverage.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const REF_FIELDS = ['entity_id', 'revision_id', 'content_id', 'content_hash_alg'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(code); };
const id = value => typeof value === 'string' && ID.test(value);
const digest = value => typeof value === 'string' && DIGEST.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const keys = (value, fields) => object(value) && Object.keys(value).every(key => fields.includes(key))
  && fields.every(key => Object.hasOwn(value, key));
const ref = value => keys(value, REF_FIELDS) && id(value.entity_id) && id(value.revision_id)
  && digest(value.content_id) && value.content_hash_alg === 'sha256';
const refEqual = (a, b) => REF_FIELDS.every(key => a[key] === b[key]);
const slotKey = (stage, family) => JSON.stringify([stage, family]);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const clone = value => JSON.parse(JSON.stringify(value));

/** Join an admitted category inventory to existing stage/family policy slots.
 * No schema/store or writer is introduced. A supplied decision is a caller
 * attestation; this function checks its exact pins, never grants that decision.
 * Even confirmed joins do not manufacture R1 requirements, Needs or observations.
 */
export function prepareForgeWorldPolicyCandidate(request) {
  if (!keys(request, ['project_code', 'metadata', 'expected_artifact_policy', 'policy_binding',
    'category_bindings', 'coverage_request'])) fail('WORLD_CANDIDATE_INPUT_INVALID');
  const { project_code: project, metadata, expected_artifact_policy: policy,
    policy_binding: binding, category_bindings: joins, coverage_request: coverageRequest } = request;
  if (!id(project)) fail('WORLD_CANDIDATE_PROJECT_INVALID');
  if (!keys(metadata, ['source_digest', 'observed_at', 'categories']) || !digest(metadata.source_digest)
    || typeof metadata.observed_at !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,7})?Z$/u.test(metadata.observed_at)
    || !Number.isFinite(Date.parse(metadata.observed_at)) || !Array.isArray(metadata.categories)) {
    fail('WORLD_CANDIDATE_METADATA_INVALID');
  }
  if (!keys(binding, ['project_code', 'metadata_digest', 'policy_digest', 'expected_policy_ref',
    'needs_extends_ref', 'needs_policy_ref', 'state', 'decision_ref', 'coverage_input_revision'])
    || binding.project_code !== project || binding.metadata_digest !== metadata.source_digest
    || binding.policy_digest !== worldCoverageDigest(policy)
    || !['candidate', 'confirmed'].includes(binding.state)
    || (binding.needs_extends_ref !== null && !ref(binding.needs_extends_ref))
    || (binding.needs_policy_ref !== null && !ref(binding.needs_policy_ref))
    || (binding.expected_policy_ref !== null && !ref(binding.expected_policy_ref))
    || (binding.decision_ref !== null && !digest(binding.decision_ref))
    || (binding.coverage_input_revision !== null && !digest(binding.coverage_input_revision))) {
    fail('WORLD_CANDIDATE_BINDING_INVALID');
  }
  if (binding.expected_policy_ref && binding.needs_extends_ref
    && !refEqual(binding.expected_policy_ref, binding.needs_extends_ref)) {
    fail('WORLD_CANDIDATE_POLICY_REF_MISMATCH');
  }
  if (binding.state === 'confirmed' && (!binding.expected_policy_ref || !binding.needs_extends_ref
    || !binding.needs_policy_ref || !binding.decision_ref
    || !binding.coverage_input_revision)) fail('WORLD_CANDIDATE_CONFIRMATION_INCOMPLETE');
  if (!object(policy) || policy.schema_version !== 'se_stage_expected_artifact_policy_v0'
    || !Array.isArray(policy.stage_family_defaults)) fail('WORLD_CANDIDATE_POLICY_INVALID');
  const slots = new Map();
  const stages = new Set();
  for (const stage of policy.stage_family_defaults) {
    if (!object(stage) || !id(stage.stage_code) || !Array.isArray(stage.required_artifact_families)
      || stages.has(stage.stage_code)) fail('WORLD_CANDIDATE_POLICY_INVALID');
    stages.add(stage.stage_code);
    for (const family of stage.required_artifact_families) {
      if (!object(family) || !id(family.artifact_family_id)
        || !['present', 'present_or_not_applicable', 'optional_context'].includes(family.minimum_presence_rule)) {
        fail('WORLD_CANDIDATE_POLICY_INVALID');
      }
      const key = slotKey(stage.stage_code, family.artifact_family_id);
      if (slots.has(key)) fail('WORLD_CANDIDATE_POLICY_SLOT_DUPLICATE');
      slots.set(key, { stage_code: stage.stage_code, artifact_family_id: family.artifact_family_id,
        minimum_presence_rule: family.minimum_presence_rule });
    }
  }
  const categories = new Map();
  for (const category of metadata.categories) {
    if (!keys(category, ['category_id', 'stage_code', 'selection', 'file_count', 'helper_name_count',
      'excluded_count', 'error_count']) || !id(category.category_id) || !id(category.stage_code)
      || !['selected', 'zero'].includes(category.selection)
      || !['file_count', 'helper_name_count', 'excluded_count', 'error_count'].every(key => count(category[key]))
      || category.helper_name_count > category.file_count
      || (category.selection === 'zero' && (category.file_count !== 0 || category.error_count !== 0))) {
      fail('WORLD_CANDIDATE_CATEGORY_INVALID');
    }
    if (categories.has(category.category_id)) fail('WORLD_CANDIDATE_CATEGORY_DUPLICATE');
    categories.set(category.category_id, category);
  }
  if (!Array.isArray(joins)) fail('WORLD_CANDIDATE_JOIN_INVALID');
  const seenJoins = new Set();
  for (const join of joins) {
    if (!keys(join, ['category_id', 'stage_code', 'artifact_family_id', 'state', 'evidence_ref'])
      || !id(join.category_id) || !id(join.stage_code) || !id(join.artifact_family_id)
      || !['candidate', 'confirmed', 'conflict'].includes(join.state) || !digest(join.evidence_ref)) {
      fail('WORLD_CANDIDATE_JOIN_INVALID');
    }
    const category = categories.get(join.category_id);
    if (!category || category.stage_code !== join.stage_code
      || !slots.has(slotKey(join.stage_code, join.artifact_family_id))) fail('WORLD_CANDIDATE_JOIN_UNBOUND');
    const key = JSON.stringify([join.category_id, join.stage_code, join.artifact_family_id]);
    if (seenJoins.has(key)) fail('WORLD_CANDIDATE_JOIN_DUPLICATE');
    seenJoins.add(key);
  }
  const rows = [...categories.values()].map(category => {
    const matched = joins.filter(join => join.category_id === category.category_id)
      .map(join => ({ ...slots.get(slotKey(join.stage_code, join.artifact_family_id)),
        state: join.state, evidence_ref: join.evidence_ref }))
      .sort((a, b) => a.artifact_family_id < b.artifact_family_id ? -1 : a.artifact_family_id > b.artifact_family_id ? 1 : 0);
    const reasons = [];
    if (!stages.has(category.stage_code)) reasons.push('stage_outside_policy');
    else if (matched.length === 0) reasons.push('category_binding_missing');
    if (matched.some(join => join.state === 'conflict')) reasons.push('category_binding_conflict');
    if (matched.some(join => join.state === 'candidate')) reasons.push('category_binding_unconfirmed');
    if (category.error_count > 0) reasons.push('enumeration_incomplete');
    if (category.excluded_count > 0) reasons.push('excluded_subtrees');
    if (category.file_count > 0 && category.helper_name_count === category.file_count) reasons.push('helper_names_only');
    reasons.push(category.file_count === 0 ? 'zero_is_scoped_inventory_only' : 'files_are_not_artifacts');
    return { ...category, matched_policy_slots: matched, reasons, coverage_state: 'gap_unknown' };
  }).sort((a, b) => a.category_id < b.category_id ? -1 : a.category_id > b.category_id ? 1 : 0);
  const holds = [];
  if (binding.state !== 'confirmed') holds.push('policy_binding_unconfirmed');
  if (!binding.expected_policy_ref) holds.push('expected_policy_revision_unresolved');
  if (!binding.needs_policy_ref || !binding.needs_extends_ref) holds.push('needs_policy_binding_missing');
  if (joins.some(join => join.state !== 'confirmed')) holds.push('category_bindings_unconfirmed');
  if (coverageRequest === null) holds.push('coverage_input_missing');
  else {
    if (!object(coverageRequest) || coverageRequest.project_code !== project
      || coverageRequest.source_kind !== 'observed'
      || worldCoverageDigest(coverageRequest.expected_artifact_policy) !== binding.policy_digest
      || worldCoverageDigest(coverageRequest.coverage_input) !== binding.coverage_input_revision) {
      fail('WORLD_CANDIDATE_COVERAGE_BINDING_MISMATCH');
    }
    if (!binding.needs_policy_ref || !Array.isArray(coverageRequest.coverage_input?.needs)
      || coverageRequest.coverage_input.needs.some(need => !ref(need.policy_ref)
        || !refEqual(need.policy_ref, binding.needs_policy_ref))) fail('WORLD_CANDIDATE_NEEDS_REF_MISMATCH');
  }
  // Only existing R1 input can produce world states. Metadata inventory cannot
  // fill missing coverage input, and refreshed inventory time never restamps it.
  const world = holds.length === 0 ? buildForgeWorldCoverage(clone(coverageRequest)) : null;
  const body = {
    project_code: project, maturity: world ? 'computed_observed' : 'hold', hold_reasons: holds,
    source_metadata_digest: metadata.source_digest, source_observed_at: metadata.observed_at,
    policy_digest: binding.policy_digest, categories: rows,
    counts: { selected_categories: rows.filter(row => row.selection === 'selected').length,
      zero_categories: rows.filter(row => row.selection === 'zero').length,
      joined_categories: rows.filter(row => row.matched_policy_slots.length > 0).length,
      unjoined_categories: rows.filter(row => row.matched_policy_slots.length === 0).length,
      policy_slots: slots.size, sample_slots: 0 },
    world_coverage: world,
    authority_boundary: { read_only: true, claim_authority: false, acceptance_authority: false, runtime_authority: false },
  };
  return freeze({ ...body, candidate_digest: worldCoverageDigest(body) });
}

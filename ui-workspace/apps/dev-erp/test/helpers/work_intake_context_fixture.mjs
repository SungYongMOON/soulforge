// Synthetic test owner only: the accepted fixture uses the existing real acceptance gate.
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './accepted_context_read_fixture.mjs';

export const fileHash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export function writeJson(path, value) { const bytes = JSON.stringify(value); writeFileSync(path, bytes); return { path, sha256: fileHash(bytes) }; }

export async function workIntakeContextFixture({ presence = 'unknown', mutateTyped } = {}) {
  const accepted = fixture();
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'work-intake-context-')));
  const trusted = join(root, 'trusted'); const writable = join(root, 'writable');
  mkdirSync(trusted); mkdirSync(writable);
  const request = { ...accepted.request, budget: { max_units: 100 } };
  const result = await accepted.reader.query(request);
  const refs = result.hits.slice(0, 2).map(hit => hit.source_revision_ref);
  const acl = { actors: [...accepted.state.acl.actors].map(([actor_ref, grant]) => ({ actor_ref,
    grant: { ...grant, allowed_projects: [...grant.allowed_projects], allowed_scopes: [...grant.allowed_scopes],
      allowed_purposes: [...grant.allowed_purposes] } })), revoked_actors: [], revoked_generations: [] };
  const current = (name, value) => ({ ...writeJson(join(trusted, `${name}.json`), value), sha256: null });
  const files = { pointer: current('pointer', accepted.store.getCurrentPointer()),
    source_revisions: current('source-revisions', accepted.state.source), acl: current('acl', acl),
    accepted_generation: writeJson(join(trusted, 'accepted-generation.json'), {
      manifest: accepted.store.getGeneration(accepted.f.currentRef), receipt: accepted.store.getReceipt(accepted.f.currentRef) }) };
  const typed = { project_ref: accepted.binding.project_ref, accepted_generation_ref: request.accepted_generation_ref,
    source_revision_refs: refs,
    engine: { subject_id: 'work_intake_evidence', topology_digest: 'a'.repeat(64), observation_run_id: 'synthetic-observation-1',
      taken_at: request.as_of, valid_at: request.as_of,
      states: { expected: [{ element_id: 'requirement_1', axis: 'expected', requirement_ref: refs[0],
        authority_family: 'company_approved_procedure', applicability: true, valid_at: request.as_of, known_at: request.as_of }],
      observed: [{ element_id: 'obs_requirement_1', axis: 'observed', artifact_revision_ref: refs[1], presence_state: presence,
        valid_at: request.as_of, known_at: request.as_of }],
      canonical_accepted_input_set: { source_revision_refs: [refs[0]], artifact_revision_refs: [refs[1]] } } } };
  mutateTyped?.(typed);
  const typedInput = writeJson(join(trusted, 'typed-input.json'), typed);
  const config = { ...accepted.binding, files, typed_input_roots: [trusted] };
  const configFile = writeJson(join(trusted, 'context-config.json'), config);
  return { root, trusted, writable, accepted, config, typed, acl, files,
    options: { configPath: configFile.path, configSha256: configFile.sha256, writableRoots: [writable] },
    request: { ...request, typed_input: typedInput } };
}

export function repinWorkIntakeContextFixture(f) {
  f.request.typed_input = writeJson(f.request.typed_input.path, f.typed);
  f.options.configSha256 = writeJson(f.options.configPath, f.config).sha256;
  return f;
}

export async function workIntakeRuleProfileFixture({ customerId = 'customer_alpha', qualityGrade = 'grade_basic', projectRule = true } = {}) {
  const f = await workIntakeContextFixture({ presence: 'present' });
  const project = await f.accepted.reader.query({ ...f.accepted.request, budget: { max_units: 100 } });
  const common = await f.accepted.reader.query({ ...f.accepted.request, scope: 'common', budget: { max_units: 100 } });
  const commonRef = common.hits[0].source_revision_ref;
  const projectRefs = project.hits.map(hit => hit.source_revision_ref);
  f.typed.source_revision_refs = [commonRef, ...projectRefs];
  const selection = { customer_id: customerId, quality_grade: qualityGrade, project_ref: f.request.project_ref };
  const rows = [
    ['common_rule', 'common', {}, commonRef, 'company_approved_procedure'],
    ['customer_alpha_rule', 'customer', { customer_id: 'customer_alpha' }, projectRefs[0], 'project_contract_baseline'],
    ['customer_beta_rule', 'customer', { customer_id: 'customer_beta' }, projectRefs[1], 'project_contract_baseline'],
    ['grade_basic_rule', 'quality_grade', { quality_grade: 'grade_basic' }, projectRefs[2], 'company_approved_procedure'],
    ['grade_strict_rule', 'quality_grade', { quality_grade: 'grade_strict' }, projectRefs[3], 'company_approved_procedure'],
    ['project_rule', 'project', { project_ref: f.request.project_ref }, projectRefs[4], 'project_contract_baseline'],
  ];
  const expected = rows.map(([id, , , requirement_ref, authority_family]) => ({ element_id: id, axis: 'expected',
    requirement_ref, authority_family, applicability: true, valid_at: f.request.as_of, known_at: f.request.as_of }));
  const observed = expected.map(element => ({ element_id: `obs_${element.element_id}`, axis: 'observed',
    artifact_revision_ref: element.requirement_ref, presence_state: 'present', valid_at: f.request.as_of, known_at: f.request.as_of }));
  f.typed.engine.states = { expected, observed, canonical_accepted_input_set: {
    source_revision_refs: expected.map(element => element.requirement_ref), artifact_revision_refs: observed.map(element => element.artifact_revision_ref) } };
  f.typed.rule_profile = { selection, revision_ref: projectRefs[6], exceptions: [],
    layers: rows.map(([id, kind, applies_to, revision_ref, authority_family]) => ({ layer_id: `${id}_layer`, kind,
      applies_to, revision_ref, authority_family, expected_element_ids: [id], applicability: {
        project_binding: true, jurisdiction: true, time_window: true, document_revision: true,
        approval_scope: id === 'project_rule' ? projectRule : true } })) };
  f.config.rule_profile_binding = { selection: structuredClone(selection), profile_revision_ref: projectRefs[6], approved_exceptions: [] };
  f.profileRefs = { common: commonRef, project: projectRefs };
  return repinWorkIntakeContextFixture(f);
}

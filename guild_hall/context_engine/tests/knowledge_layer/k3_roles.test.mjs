import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoleGenerator, resolveModelRole, MODEL_ROLES, createBoundedGenerator, createMemoryGraph,
  createMemoryArchive, createWikiKnowledgeLayer, linkApprovedUnits, checkKnowledgeCandidates, createHttpGenerator } from '../../src/knowledge_layer/index.mjs';
import { BUDGET, extractiveFake, wikiInput, wikiFixture } from './wiki_fixture.mjs';
const configuration = () => ({ schema: 'soulforge.knowledge_layer.model_roles.v1', enabled: true,
  roles: Object.fromEntries(MODEL_ROLES.map(role => [role, 'model-a'])),
  models: Object.fromEntries(['model-a', 'model-b'].map(id => [id, { call_style: 'fake', model: id, endpoint: null,
    allowed_origins: [], budget: BUDGET, allow_company_host_egress: false }])), projects: {} });
test('all six roles resolve from one table without selecting a fixed real model', () => {
  for (const role of MODEL_ROLES) {
    const binding = resolveModelRole({ config: configuration(), project_ref: 'SYN-A', role });
    assert.equal(binding.model_id, 'model-a'); assert.equal(binding.role, role); assert.equal(binding.allow_company_host_egress, false);
  }
});
test('changing only the role table selects another model and invalidates the prior view', async () => {
  const config = configuration(), calls = [];
  const adapters = { fake: binding => createBoundedGenerator({ enabled: binding.enabled, id: binding.model, budget: binding.budget,
    generate: input => { calls.push(binding.model); return extractiveFake(input); } }) };
  const graph = createMemoryGraph(), archive = createMemoryArchive(), input = wikiInput();
  const layerA = createWikiKnowledgeLayer({ graph, archive, generator: createRoleGenerator({ config, project_ref: 'SYN-A', adapters }) });
  const a = await layerA.generate(input); config.roles.wiki_draft = 'model-b';
  const layerB = createWikiKnowledgeLayer({ graph, archive, generator: createRoleGenerator({ config, project_ref: 'SYN-A', adapters }) });
  assert.equal((await layerB.readCurrent(input)).status, 'HOLD'); input.expected_previous = a.record.generation_id;
  const b = await layerB.generate(input); assert.equal(b.status, 'READY'); assert.notEqual(a.record.generation_id, b.record.generation_id);
  assert.deepEqual(calls, ['model-a', 'model-b']);
});
test('company egress defaults off and project-role permission does not spill into other scopes', () => {
  const config = configuration(); config.models['model-a'].endpoint = 'https://model.example.invalid/chat';
  config.models['model-a'].allowed_origins = ['https://model.example.invalid'];
  let factories = 0; const adapters = { fake: () => { factories++; throw new Error('must not run'); } };
  assert.throws(() => createRoleGenerator({ config, project_ref: 'SYN-A', adapters }), /company_host_egress_denied/); assert.equal(factories, 0);
  config.projects['SYN-A'] = { roles: {}, company_host_egress: { wiki_draft: true } };
  assert.equal(resolveModelRole({ config, project_ref: 'SYN-A', role: 'wiki_draft' }).allow_company_host_egress, true);
  assert.throws(() => resolveModelRole({ config, project_ref: 'SYN-B', role: 'wiki_draft' }), /company_host_egress_denied/);
  assert.throws(() => resolveModelRole({ config, project_ref: 'SYN-A', role: 'bot_answer' }), /company_host_egress_denied/);
});
test('project model override, disabled table, unknown adapter and role-project binding fail closed', async () => {
  const config = configuration(); config.projects['SYN-B'] = { roles: { wiki_draft: 'model-b' }, company_host_egress: {} };
  assert.equal(resolveModelRole({ config, project_ref: 'SYN-B', role: 'wiki_draft' }).model_id, 'model-b');
  assert.throws(() => createRoleGenerator({ config, project_ref: 'SYN-A' }), /model_call_style_unavailable/);
  config.enabled = false; let calls = 0, factories = 0;
  const adapters = { fake: b => { factories++; return createBoundedGenerator({ enabled: true, id: b.model, budget: b.budget, generate: () => { calls++; return {}; } }); } };
  const g = createRoleGenerator({ config, project_ref: 'SYN-A', adapters }); await assert.rejects(() => g.createSession().generate({ project_ref: 'SYN-A' }), /generation_disabled/); assert.equal(calls, 0); assert.equal(factories, 0);
  config.enabled = true; const layer = createWikiKnowledgeLayer({ graph: createMemoryGraph(), archive: createMemoryArchive(), generator: createRoleGenerator({ config, project_ref: 'SYN-A', adapters }) });
  await assert.rejects(() => layer.generate(wikiInput('SYN-B')), /model_project_mismatch/);
});
test('model-level company egress preference cannot grant access to any unlisted project-role', () => {
  const config = configuration(), m = config.models['model-a']; m.endpoint = 'https://model.example.invalid/chat';
  m.allowed_origins = ['https://model.example.invalid']; m.allow_company_host_egress = true;
  assert.throws(() => resolveModelRole({ config, project_ref: 'SYN-B', role: 'bot_answer' }), /company_host_egress_denied/);
  config.projects['SYN-A'] = { roles: {}, company_host_egress: { wiki_draft: true } };
  assert.equal(resolveModelRole({ config, project_ref: 'SYN-A', role: 'wiki_draft' }).allow_company_host_egress, true);
  assert.throws(() => resolveModelRole({ config, project_ref: 'SYN-A', role: 'bot_answer' }), /company_host_egress_denied/);
});
test('explicit policy allows a configured external wire only for that project, using fake transport', async () => {
  let calls = 0; const generator = createHttpGenerator({ enabled: true, id: 'egress-fake', model: 'MODEL_PLACEHOLDER',
    endpoint: 'https://model.example.invalid/chat', allowed_origins: ['https://model.example.invalid'], budget: BUDGET,
    host_egress_policy: { project_ref: 'SYN-A', role: 'wiki_draft', data_class: 'company', allowed: true },
    fetchImpl: async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: '{"candidates":[]}' } }] })); } });
  await assert.rejects(() => generator.createSession().generate({ project_ref: 'SYN-B' }), /model_project_mismatch/); assert.equal(calls, 0);
  await assert.rejects(() => generator.createSession().generate({ project_ref: 'SYN-A', role: 'bot_answer' }), /model_role_mismatch/); assert.equal(calls, 0);
  await generator.createSession().generate({ project_ref: 'SYN-A', role: 'wiki_draft' }); assert.equal(calls, 1);
});
test('K3 accepts a cited paraphrase while K2 remains stricter and unchanged', async () => {
  const f = wikiFixture({ generate: input => { const output = extractiveFake(input); const row = output.candidates.find(r => r.unit_id === 'a-mail');
    row.text = '2026-10-09는 아직 승인되지 않은 납기다.'; return output; } });
  const input = wikiInput(), result = await f.layer.generate(input), sentence = result.record.content.statements.find(s => s.unit_id === 'a-mail');
  assert.equal(sentence.eligible_for_wiki, true); assert.equal(sentence.meaning_check, 'model_responsibility_unverified');
  const bundle = linkApprovedUnits(input.request);
  const checked = checkKnowledgeCandidates({ bundle, now: input.request.now, candidates: [{ statement_id: sentence.statement_id,
    unit_id: sentence.unit_id, text: sentence.text, quote: sentence.quote, impact_kinds: [], claim: null }] });
  assert.equal(checked.results[0].eligible_for_wiki, false);
});
test('operating rules, human correction refs and original clocks reach the model; materials are recorded', async () => {
  let seen; const f = wikiFixture({ generate: input => { seen = input; return extractiveFake(input); } });
  const input = { ...wikiInput(), human_correction_unit_ids: ['a-doc'] }, result = await f.layer.generate(input);
  assert.match(seen.operating_rules, /문서를 우선/); assert.match(seen.operating_rules, /사람 정정/); assert.match(seen.operating_rules, /늦게/);
  assert.deepEqual(seen.human_correction_unit_ids, ['a-doc']); assert.ok(seen.units.every(u => u.known_at && u.source_revision_ref));
  assert.equal(result.record.content.material_inventory.length, 3); assert.ok(result.record.content.wiki_rules_sha256.startsWith('sha256:'));
  assert.match(result.record.content.pages[0].markdown, /## 재료 목록/);
});
test('contradictions and exceptions are model reports, not inferred by K3 heuristics', async () => {
  const f = wikiFixture({ generate: input => { const out = extractiveFake(input);
    out.candidates[0].claim = { subject: '동일 대상', key: '값', value: 'A' }; out.candidates[1].claim = { subject: '동일 대상', key: '값', value: 'B' }; return out; } });
  const result = await f.layer.generate(wikiInput()); assert.equal(result.record.content.conflicts.length, 0); assert.equal(result.record.content.exceptions.length, 0);
});

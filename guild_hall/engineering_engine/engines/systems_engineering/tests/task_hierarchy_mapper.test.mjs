import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
import { compileStageRules, orderStageWork } from '../rules/stage_rule_compiler.mjs';
import { mapTaskHierarchy, taskHierarchyDataDigest } from '../rules/task_hierarchy_mapper.mjs';
import { validateTaskHierarchyNodes } from '../schemas/task_hierarchy_v1_schema_validator.mjs';

const schema = JSON.parse(readFileSync(new URL('../schemas/task_hierarchy_v1.schema.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../../../../../docs/architecture/workspace/examples/se_stage_rules/stage_work_order_synthetic_v0.json', import.meta.url), 'utf8'));
const baseFixture = JSON.parse(readFileSync(new URL('../../../../../docs/architecture/workspace/examples/se_stage_rules/compiled_variant_synthetic_v0.json', import.meta.url), 'utf8'));
const overlayFixture = JSON.parse(readFileSync(new URL('../../../../../docs/architecture/workspace/examples/se_stage_rules/stage_rule_overlay_synthetic_v0.json', import.meta.url), 'utf8'));
const scope = { project_id: 'SYN-01', product_id: 'SYN-PRODUCT-A' };
const ref = (kind, name) => ({ ref_kind: kind, exact_ref: `ref:synthetic/${name}`, sha256: 'a'.repeat(64) });
function input(mutate = () => {}, observations = []) {
  const request = structuredClone(fixture.request);
  mutate(request);
  const compiled = compileStageRules(request);
  return { scope: { ...scope }, compiled_variant: request.compiled_variant,
    compile_result: compiled, work_order: orderStageWork(compiled, observations),
    source_refs: { compiled_variant: ref('receipt', 'variant'), compile_result: ref('receipt', 'compile'), work_order: ref('receipt', 'order') } };
}
const tasksOf = (result) => result.nodes.filter((node) => node.layer === 'Task');
const firstTaskId = (request) => {
  const item = request.work_order.stages[0].work_items[0];
  return `task:${item.stage_code}:${item.artifact_type_id}`;
};
function blueprint(request) {
  const definition = { workflow_id: 'synthetic_design_v0', steps: [
    { step_id: 'inspect', title: 'Synthetic inspection', actor_slot: 'synthetic_inspector',
      next: { on_success: 'record', on_fail: 'stop', on_gap: 'stop' },
      action: { kind: 'inspect_evidence', effect_class: 'read', receipt_required: false,
        requires: ['synthetic_input'], validates: ['synthetic_check'], creates: [] } },
    { step_id: 'record', title: 'Synthetic record', actor_slot: 'synthetic_recorder',
      next: { on_success: 'stop', on_fail: null },
      action: { kind: 'record_evidence', effect_class: 'record', receipt_required: true,
        creates: ['synthetic_receipt'] } },
  ] };
  return { scope: { ...scope }, task_id: firstTaskId(request),
    blueprint_ref: { workflow_id: 'synthetic_design_v0', version: 'v0', version_source: 'id_suffix' },
    definition_ref: ref('blueprint', 'workflow'), definition_data_sha256: taskHierarchyDataDigest(definition), definition };
}
function workPackage(request, key = 'design') {
  return { scope: { ...scope }, stage_code: request.work_order.stages[0].stage_code,
    work_package_key: key, title_ko: '합성 설계 작업', owner_domain_rune: 'systems_engineering',
    task_ids: [firstTaskId(request)], basis_ref: ref('binding', `wp-${key}`) };
}

function overlayInput() {
  const request = structuredClone(baseFixture.request);
  request.overlay = structuredClone(overlayFixture.overlay);
  const compiled = compileStageRules(request);
  return { scope: { ...scope }, compiled_variant: request.compiled_variant, overlay: request.overlay,
    compile_result: compiled, work_order: orderStageWork(compiled) };
}

test('exact overlay preserves condition applicability, source alias and explicitly null added-rule conditions', () => {
  const request = overlayInput();
  const before = JSON.stringify(request);
  const result = mapTaskHierarchy(request);
  const tasks = tasksOf(result);
  const added = tasks.find((node) => node.artifact_type_id === 'spec_linkage_table');
  assert.equal(added.applicability.applies_when, null);
  assert.equal(added.provenance.evidence_level, 'prime_contract');
  assert.equal(tasks.find((node) => node.artifact_type_id === 'pci').alias, 'synthetic_slot_07_product_baseline');
  assert.ok(tasks.some((node) => node.applicability.applies_when?.includes('sw_included')));
  assert.ok(result.receipt.mapping_provenance.some((row) => row.origin === 'overlay'));
  assert.equal(JSON.stringify(request), before);
  assert.deepEqual(validateTaskHierarchyNodes(result.nodes, schema), []);
});

test('missing exact overlay explicitly holds instead of deriving absent conditions from the variant', () => {
  const request = overlayInput();
  delete request.overlay;
  assert.throws(() => mapTaskHierarchy(request), (error) => error.code === 'OVERLAY_SOURCE_REQUIRED_HOLD');
});

test('changed supplied overlay is rejected before source mapping', () => {
  const request = overlayInput();
  request.overlay.ops[0].token = 'changed';
  assert.throws(() => mapTaskHierarchy(request), (error) => error.code === 'SOURCE_DIGEST_MISMATCH');
});

test('multiple real compiler rows for one expectation are held without choosing applicability', () => {
  const request = input((source) => {
    source.compiled_variant.gates[0].tasks.push({ ...structuredClone(source.compiled_variant.gates[0].tasks[1]), id: 3099 });
  });
  assert.throws(() => mapTaskHierarchy(request), (error) => error.code === 'AMBIGUOUS_OR_MISSING_RULE');
});

test('mapper executes with filesystem, network, and clock access disabled', (t) => {
  const request = input();
  const forbidden = () => { throw new Error('forbidden side effect'); };
  t.mock.method(fs, 'readFileSync', forbidden);
  t.mock.method(fs, 'writeFileSync', forbidden);
  t.mock.method(Date, 'now', forbidden);
  t.mock.method(globalThis, 'fetch', forbidden);
  assert.ok(mapTaskHierarchy(request).nodes.length > 0);
});

test('data digest preserves null and rejects sparse arrays without coercion', () => {
  assert.notEqual(taskHierarchyDataDigest({ alias: null }), taskHierarchyDataDigest({}));
  assert.equal(taskHierarchyDataDigest({ b: 1, a: 2 }), taskHierarchyDataDigest({ a: 2, b: 1 }));
  assert.throws(() => taskHierarchyDataDigest(Array(1)), (error) => error.code === 'NON_JSON_INPUT');
});

test('non-JSON getters are refused without executing caller code', () => {
  let reads = 0;
  const value = { get data() { reads += 1; return 'synthetic'; } };
  assert.throws(() => taskHierarchyDataDigest(value), (error) => error.code === 'NON_JSON_INPUT');
  assert.equal(reads, 0);
});

test('real compiler/work order maps deterministically without source mutation or shared frozen inputs', () => {
  const request = input();
  const before = JSON.stringify(request);
  const result = mapTaskHierarchy(request);
  assert.equal(JSON.stringify(mapTaskHierarchy(request)), JSON.stringify(result));
  assert.equal(JSON.stringify(request), before);
  assert.equal(Object.isFrozen(request.scope), false);
  assert.deepEqual(validateTaskHierarchyNodes(result.nodes, schema), []);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.nodes));
  assert.equal(tasksOf(result).length, request.work_order.stages.reduce((sum, stage) => sum + stage.work_items.length, 0));
  assert.deepEqual(result.receipt.upstream_receipt, request.work_order.receipt);
  assert.deepEqual(result.receipt.effects, { filesystem_reads: 0, filesystem_writes: 0, clock_reads: 0, network_calls: 0, model_calls: 0 });
});

test('every work-item field survives exactly and absent procedures stay gaps', () => {
  const request = input();
  const result = mapTaskHierarchy(request);
  for (const stage of request.work_order.stages) for (const item of stage.work_items) {
    const node = tasksOf(result).find((candidate) => candidate.id === `task:${item.stage_code}:${item.artifact_type_id}`);
    const restored = {};
    for (const key of Object.keys(item)) {
      if (['evidence_level', 'evidence_rank', 'evidence_record', 'depends_on_origin'].includes(key)) restored[key] = node.provenance[key];
      else if (key === 'minimum_presence_rule') restored[key] = node.completion_contract.minimum_presence_rule;
      else if (/^(same_stage|earlier_stage|forward_stage|out_of_scope|unresolved)_inputs$/u.test(key)) restored[key] = node.dependency_scope[key.replace(/_inputs$/u, '')];
      else restored[key] = node[key];
    }
    assert.deepEqual(restored, item);
    assert.equal(node.procedure_state, 'WORKFLOW_GAP');
    assert.equal(node.actual_task_ref, null);
    assert.equal(node.work_package_ref, null);
    assert.deepEqual(node.steps, []);
    assert.equal(node.node_role, 'expectation');
  }
});

test('applicability is recovered from exact compiler variant task without losing null', () => {
  const request = input((source) => {
    source.compiled_variant.gates[0].tasks[1].applies_when = ['synthetic_mode'];
    source.overlay_conditions = ['synthetic_mode'];
  });
  const nodes = tasksOf(mapTaskHierarchy(request));
  assert.ok(nodes.some((node) => node.applicability.applies_when?.includes('synthetic_mode')));
  assert.ok(nodes.some((node) => node.applicability.applies_when === null));
  for (const node of nodes) for (const key of ['business_type', 'prime_contractor', 'quality_grade']) {
    assert.equal(node.applicability[key], request.compiled_variant[key]);
  }
});

test('present evidence stays SATISFIED with a null Blueprint; unknown remains distinct', () => {
  const request = input(() => {}, [{ artifact_type_id: 'conops', presence_state: 'present' }]);
  const task = tasksOf(mapTaskHierarchy(request)).find((node) => node.artifact_type_id === 'conops');
  assert.equal(task.state, 'SATISFIED');
  assert.equal(task.observation_state, 'present');
  assert.equal(task.procedure_state, 'WORKFLOW_GAP');
});

test('same local IDs in other projects and products produce separate valid identities', () => {
  const one = input();
  const two = input();
  two.scope.project_id = 'SYN-02';
  const three = input();
  three.scope.product_id = 'SYN-PRODUCT-B';
  const nodes = [one, two, three].flatMap((request) => mapTaskHierarchy(request).nodes);
  assert.deepEqual(validateTaskHierarchyNodes(nodes, schema), []);
});

test('only explicit scoped WP membership is attached', () => {
  const request = input();
  request.work_packages = [workPackage(request), { ...workPackage(request, 'other'), task_ids: [] }];
  const result = mapTaskHierarchy(request);
  const assigned = tasksOf(result).find((node) => node.id === firstTaskId(request));
  assert.deepEqual(assigned.work_package_ref, { ...scope, id: `wp:${request.work_order.stages[0].stage_code}:design` });
  assert.deepEqual(validateTaskHierarchyNodes(result.nodes, schema), []);
  assert.ok(tasksOf(result).some((node) => node.work_package_ref === null));
});

test('pinned supplied Blueprint preserves Step and Action fields, complete-source refs and byte-claim limit', () => {
  const request = input();
  request.blueprint_sources = [blueprint(request)];
  const before = JSON.stringify(request);
  const result = mapTaskHierarchy(request);
  assert.deepEqual(validateTaskHierarchyNodes(result.nodes, schema), []);
  const steps = result.nodes.filter((node) => node.layer === 'Step');
  const actions = result.nodes.filter((node) => node.layer === 'Action');
  assert.equal(steps.length, 2);
  assert.equal(steps[0].title, 'Synthetic inspection');
  assert.equal(steps[0].actor_slot, 'synthetic_inspector');
  assert.deepEqual(steps[1].next, { on_success: 'stop', on_fail: null });
  assert.deepEqual(actions[1].creates, ['synthetic_receipt']);
  assert.equal(Object.hasOwn(actions[1], 'requires'), false);
  assert.deepEqual(steps[0].definition_ref, request.blueprint_sources[0].definition_ref);
  assert.ok(result.receipt.source_provenance.every((row) => row.source_bytes_verification === 'caller_supplied_not_file_verified'));
  assert.equal(JSON.stringify(request), before);
});

const invalidCases = {
  'wrong variant digest': (request) => { request.compiled_variant.quality_grade = 'tampered'; },
  'changed work-order bytes': (request) => { request.work_order.stages[0].work_items[0].alias = 'tampered'; },
  'changed compile mapping': (request) => { request.compile_result.mapping_table[0].artifact_type_id = 'tampered'; },
  'unknown work-item field': (request) => { request.work_order.stages[0].work_items[0].new_source_field = 'must-not-drop'; },
  'wrong-project WP': (request) => { request.work_packages = [{ ...workPackage(request), scope: { ...scope, project_id: 'SYN-02' } }]; },
  'wrong-product WP': (request) => { request.work_packages = [{ ...workPackage(request), scope: { ...scope, product_id: 'SYN-PRODUCT-B' } }]; },
  'ambiguous WP membership': (request) => { request.work_packages = [workPackage(request), workPackage(request, 'other')]; },
  'unknown WP task': (request) => { request.work_packages = [{ ...workPackage(request), task_ids: ['task:090_PDR:missing'] }]; },
  'duplicate WP identity': (request) => { request.work_packages = [workPackage(request), workPackage(request)]; },
  'wrong-project Blueprint': (request) => { request.blueprint_sources = [{ ...blueprint(request), scope: { ...scope, project_id: 'SYN-02' } }]; },
  'unknown Blueprint task': (request) => { request.blueprint_sources = [{ ...blueprint(request), task_id: 'task:090_PDR:missing' }]; },
  'duplicate Blueprint binding': (request) => { request.blueprint_sources = [blueprint(request), blueprint(request)]; },
  'Blueprint data digest mismatch': (request) => { request.blueprint_sources = [blueprint(request)]; request.blueprint_sources[0].definition.steps[0].title = 'changed'; },
  'Blueprint version mismatch': (request) => { request.blueprint_sources = [blueprint(request)]; request.blueprint_sources[0].blueprint_ref.version = 'v7'; },
  'unversioned Blueprint': (request) => { request.blueprint_sources = [blueprint(request)]; request.blueprint_sources[0].blueprint_ref.workflow_id = 'unversioned'; },
  'invalid source-byte ref': (request) => { request.blueprint_sources = [blueprint(request)]; request.blueprint_sources[0].definition_ref.exact_ref = 'ref:C:/private/synthetic.txt'; },
};
for (const [name, mutate] of Object.entries(invalidCases)) {
  test(`refuses ${name} without synthesizing a task or returning partial nodes`, () => {
    const request = structuredClone(input());
    mutate(request);
    const before = JSON.stringify(request);
    assert.throws(() => mapTaskHierarchy(request), (error) => error.name === 'TaskHierarchyMapperError');
    assert.equal(JSON.stringify(request), before);
  });
}

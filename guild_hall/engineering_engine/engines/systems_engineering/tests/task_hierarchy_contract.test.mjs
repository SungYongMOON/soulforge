// T-01 and §16 candidate contract alignment: shape, scoped references, source fields,
// and independent procedure/evidence state. Mapper, invariant execution, and projection
// writers remain later slices. All ids and references below are synthetic fixtures.
//
// Placed in the systems_engineering package (contracts/ + schemas/ + tests/ siblings) because the
// only projection source today is that package's `orderStageWork`, and the legacy flat
// guild_hall/engineering_engine/contracts/ and tests/ directories are pointer/forwarder-only by
// rule (tools/validate_no_duplicate_authority.mjs; CI step engineering-engine-no-duplicate-authority
// rejected the first placement under contracts/ on 2026-09-06).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  validateJsonSchemaSubset,
  collectSchemaSelfValidityErrors,
} from '../schemas/task_hierarchy_v1_schema_validator.mjs';
import * as contract from '../schemas/task_hierarchy_v1_schema_validator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, '..', 'schemas', 'task_hierarchy_v1.schema.json');
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

function baseCommonFields(overrides = {}) {
  return {
    schema_version: 'soulforge.engineering_engine.task_hierarchy.v1',
    owner_authority: 'rune',
    scope: { project_id: 'SYN-01', product_id: 'SYN-PRODUCT-A' },
    applicability: {
      business_type: 'defense_prime',
      prime_contractor: 'synthetic_prime',
      quality_grade: 'grade_a',
      applies_when: [],
    },
    depends_on: [],
    dependency_scope: {
      same_stage: [],
      earlier_stage: [],
      forward_stage: [],
      out_of_scope: [],
      unresolved: [],
    },
    preconditions: [],
    completion_contract: {
      invariant_ids: [],
      minimum_presence_rule: 'present',
      required_evidence: [],
    },
    evidence_refs: [],
    blueprint_ref: null,
    procedure_state: 'WORKFLOW_GAP',
    state: 'UNKNOWN',
    claim_ceiling: 'observed',
    ...overrides,
  };
}

function stageInstance(overrides = {}) {
  return baseCommonFields({
    layer: 'Stage',
    id: '090_PDR',
    stage_code: '090_PDR',
    stage_sequence: 1,
    ...overrides,
  });
}

function workPackageInstance(overrides = {}) {
  return baseCommonFields({
    layer: 'WorkPackage',
    id: 'wp:090_PDR:default',
    stage_code: '090_PDR',
    work_package_key: 'default',
    title_ko: '기본 작업 묶음',
    owner_domain_rune: 'systems_engineering',
    ...overrides,
  });
}

function taskInstance(overrides = {}) {
  return baseCommonFields({
    layer: 'Task',
    id: 'task:090_PDR:act_implementation',
    stage_code: '090_PDR',
    artifact_type_id: 'act_implementation',
    node_kind: 'activity',
    gate_role: 'core',
    satisfied_inputs: [],
    blocked_by: [],
    steps: [],
    node_role: 'expectation',
    work_package_ref: null,
    work_package_basis_refs: [],
    actual_task_ref: null,
    is_virtual: true,
    gate_role_rank: 0,
    ready: true,
    order_index: 0,
    dependents_count: 0,
    engine_requirement_id: 'syn_requirement',
    alias: null,
    observation_state: 'unknown',
    provenance: { evidence_level: 'unstated', evidence_rank: 9, evidence_record: [], depends_on_origin: 'canonical' },
    state: 'READY',
    ...overrides,
  });
}

function stepInstance(overrides = {}) {
  return baseCommonFields({
    layer: 'Step',
    id: 'step:task:090_PDR:act_implementation:hw_preliminary_design_v0:fabrication',
    task_id: 'task:090_PDR:act_implementation',
    workflow_id: 'hw_preliminary_design_v0',
    step_id: 'fabrication',
    seq: 4,
    title: 'Synthetic fabrication',
    actor_slot: 'synthetic_builder',
    next: { on_success: 'stop', on_fail: 'stop' },
    definition_ref: { ref_kind: 'blueprint', exact_ref: 'ref:synthetic/workflow/step', sha256: 'a'.repeat(64) },
    procedure_state: 'READY',
    blueprint_ref: {
      workflow_id: 'hw_preliminary_design_v0',
      version: 'v0',
      version_source: 'id_suffix',
    },
    state: 'READY',
    ...overrides,
  });
}

function actionInstance(overrides = {}) {
  return baseCommonFields({
    layer: 'Action',
    id: 'action:step:task:090_PDR:act_implementation:hw_preliminary_design_v0:fabrication:record_fabrication_receipt',
    step_id: 'step:task:090_PDR:act_implementation:hw_preliminary_design_v0:fabrication',
    action_kind: 'record_fabrication_receipt',
    effect_class: 'record',
    receipt_required: true,
    blueprint_ref: { workflow_id: 'hw_preliminary_design_v0', version: 'v0', version_source: 'id_suffix' },
    definition_ref: { ref_kind: 'blueprint', exact_ref: 'ref:synthetic/workflow/action', sha256: 'a'.repeat(64) },
    requires: ['synthetic_input'],
    validates: ['synthetic_validation'],
    creates: ['synthetic_receipt'],
    procedure_state: 'READY',
    state: 'READY',
    ...overrides,
  });
}

test('T-01 schema meta fields are the expected draft 2020-12 shape', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'soulforge.engineering_engine.task_hierarchy.v1');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.ok(Array.isArray(schema.required) && schema.required.includes('layer'));
});

test('T-01 schema self-validity: only supported keywords, every pattern compiles', () => {
  assert.deepEqual(collectSchemaSelfValidityErrors(schema), []);
});

test('T-01 minimal valid instance per layer passes: Stage', () => {
  assert.deepEqual(validateJsonSchemaSubset(stageInstance(), schema), []);
});

test('T-01 minimal valid instance per layer passes: WorkPackage', () => {
  assert.deepEqual(validateJsonSchemaSubset(workPackageInstance(), schema), []);
});

test('T-01 minimal valid instance per layer passes: Task', () => {
  assert.deepEqual(validateJsonSchemaSubset(taskInstance(), schema), []);
});

test('T-01 minimal valid instance per layer passes: Step', () => {
  assert.deepEqual(validateJsonSchemaSubset(stepInstance(), schema), []);
});

test('T-01 minimal valid instance per layer passes: Action', () => {
  assert.deepEqual(validateJsonSchemaSubset(actionInstance(), schema), []);
});

test('T-01 negative: an extra property fails additionalProperties:false', () => {
  const instance = { ...taskInstance(), not_a_real_field: 'nope' };
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('unexpected property not_a_real_field')));
});

test('T-01 negative: a malformed id fails the layer id pattern', () => {
  const instance = taskInstance({ id: 'not a valid task id' });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.id') && message.includes('pattern')));
});

test('T-01 negative: non-empty steps with a null blueprint_ref fails (WORKFLOW_GAP must mint zero steps)', () => {
  const instance = taskInstance({
    blueprint_ref: null,
    steps: ['step:task:090_PDR:act_implementation:hw_preliminary_design_v0:fabrication'],
  });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.steps') && message.includes('maxItems')));
});

test('T-01 positive control: non-empty steps is allowed when blueprint_ref is not null', () => {
  const instance = taskInstance({
    blueprint_ref: { workflow_id: 'hw_preliminary_design_v0', version: 'v0', version_source: 'id_suffix' },
    procedure_state: 'READY',
    state: 'READY',
    steps: ['step:task:090_PDR:act_implementation:hw_preliminary_design_v0:fabrication'],
  });
  assert.deepEqual(validateJsonSchemaSubset(instance, schema), []);
});

test('T-01 negative: a Step node may not carry a null blueprint_ref', () => {
  const instance = stepInstance({ blueprint_ref: null });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
});

// 2026-09-06 review (B2/M5): blueprint_ref, applicability.applies_when, and
// evidence_refs[].sha256 previously had no `type`, so a schema-shaped object/array-of-string
// hole let any JS type through unnoticed. Each now carries an explicit `type` (array-form for
// the two nullable fields), and these three cases pin the hole shut.
for (const badBlueprintRef of ['garbage', 42, []]) {
  test(`T-01 negative: blueprint_ref rejects a non-object, non-null value (${JSON.stringify(badBlueprintRef)})`, () => {
    const instance = taskInstance({ blueprint_ref: badBlueprintRef });
    const errors = validateJsonSchemaSubset(instance, schema);
    assert.ok(errors.length > 0);
    assert.ok(errors.some((message) => message.includes('$.blueprint_ref') && message.includes('expected')));
  });
}

test('T-01 negative: applicability.applies_when rejects a non-array value', () => {
  const instance = taskInstance({
    applicability: {
      business_type: 'defense_prime',
      prime_contractor: 'synthetic_prime',
      quality_grade: 'grade_a',
      applies_when: 'not-an-array',
    },
  });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.applicability.applies_when') && message.includes('expected')));
});

test('T-01 negative: evidence_refs[].sha256 rejects a non-string, non-null value', () => {
  const instance = taskInstance({
    evidence_refs: [{ ref_kind: 'observation', exact_ref: 'synthetic/path.txt', sha256: 12345 }],
  });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.evidence_refs[0].sha256') && message.includes('expected')));
});

// §16 supersedes the original B3/M4 conflation: a missing Blueprint is a procedure
// gap, independent of the evidence state on every layer.
test('T-01 negative: null Blueprint requires a procedure gap independently of evidence state', () => {
  const instance = taskInstance({ procedure_state: 'READY' });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.procedure_state') && message.includes('WORKFLOW_GAP')));
});

test('T-01 positive control: a Stage node may carry a null blueprint_ref with any state (WORKFLOW_GAP rule is Task-only)', () => {
  const instance = stageInstance({ state: 'SATISFIED' });
  assert.deepEqual(validateJsonSchemaSubset(instance, schema), []);
});

// 2026-09-06 review (M6): an Action's step_id names its parent Step node, not a bare
// step_graph.yaml local key — it must be the Step's own full id (`^step:task:...`, the same
// pattern the Step layer's own `id` uses).
test('T-01 negative: an Action node step_id must be the parent Step’s full id, not a bare local key', () => {
  const instance = actionInstance({ step_id: 'fabrication' });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.step_id') && message.includes('pattern')));
});

// 2026-09-06 review (m12): Step.seq is a zero-based step_graph position, so it carries an
// integer `minimum: 0` now instead of a bare `number`.
test('T-01 negative: a Step seq below zero fails the minimum constraint', () => {
  const instance = stepInstance({ seq: -3 });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.seq') && message.includes('minimum')));
});

// 2026-09-06 review (m12): `steps` and `blocked_by` are Task-only fields (§3); a non-Task node
// carrying either is rejected via `not`/`required` (this validator gives no meaning to a bare
// `false` schema in a `properties` position, so that idiomatic JSON-Schema spelling is not
// available here — see the validator's header comment).
test('T-01 negative: a Stage node may not carry the Task-only steps field', () => {
  const instance = stageInstance({ steps: [] });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
});

function linkedNodes() {
  const step = stepInstance();
  return [stageInstance(), workPackageInstance(), taskInstance({
    blueprint_ref: step.blueprint_ref, procedure_state: 'READY', steps: [step.id],
    work_package_ref: { ...step.scope, id: 'wp:090_PDR:default' },
    work_package_basis_refs: [{ ref_kind: 'binding', exact_ref: 'ref:synthetic/wp-binding', sha256: 'b'.repeat(64) }],
  }), step, actionInstance()];
}

const validateGraph = (nodes) => contract.validateTaskHierarchyNodes(nodes, schema);

test('T-16 graph joins are scoped and validation is deterministic and non-mutating', () => {
  const nodes = linkedNodes();
  const other = structuredClone(nodes);
  for (const node of other) {
    node.scope.project_id = 'SYN-02';
    if (node.work_package_ref) node.work_package_ref.project_id = 'SYN-02';
  }
  const input = [...nodes, ...other];
  const before = JSON.stringify(input);
  assert.deepEqual(validateGraph(input), []);
  assert.deepEqual(validateGraph(input), []);
  assert.equal(JSON.stringify(input), before);
});

test('T-16 identical local IDs remain distinct across products in one project', () => {
  const first = linkedNodes();
  const second = structuredClone(first);
  for (const node of second) {
    node.scope.product_id = 'SYN-PRODUCT-B';
    if (node.work_package_ref) node.work_package_ref.product_id = 'SYN-PRODUCT-B';
  }
  assert.deepEqual(validateGraph([...first, ...second]), []);
});

test('T-16 explicit membership remains unique when another WP exists in the stage', () => {
  assert.deepEqual(validateGraph([...linkedNodes(),
    workPackageInstance({ id: 'wp:090_PDR:other', work_package_key: 'other' })]), []);
});

test('T-16 optional workflow source fields preserve missing, null, and nonempty values', () => {
  const nodes = linkedNodes();
  nodes[2].applicability.applies_when = null;
  nodes[3].next = { on_fail: null };
  delete nodes[4].requires;
  const before = structuredClone(nodes);
  assert.deepEqual(validateGraph(nodes), []);
  assert.deepEqual(nodes, before);
  assert.deepEqual(nodes[4].creates, ['synthetic_receipt']);
});

test('T-16 source observation fallback unobserved remains distinct from explicit unknown', () => {
  const node = taskInstance({ observation_state: 'unobserved' });
  assert.deepEqual(validateGraph([stageInstance(), node]), []);
  assert.equal(node.observation_state, 'unobserved');
});

test('T-16 null alias and source work-item fields survive the contract without coercion', () => {
  const node = taskInstance({ alias: null, is_virtual: false, gate_role_rank: 2, ready: false,
    state: 'BLOCKED_INPUT', blocked_by: ['synthetic_input'], observation_state: 'present' });
  const before = structuredClone(node);
  assert.deepEqual(validateJsonSchemaSubset(node, schema), []);
  assert.deepEqual(node, before);
  for (const field of ['is_virtual', 'gate_role_rank', 'ready', 'alias', 'observation_state', 'provenance']) {
    const missing = structuredClone(node);
    delete missing[field];
    assert.ok(validateJsonSchemaSubset(missing, schema).length > 0, field);
  }
});

for (const state of ['READY', 'BLOCKED_INPUT', 'BLOCKED_PRECONDITION', 'SATISFIED', 'UNKNOWN']) {
  test(`T-16 procedure gap preserves independent evidence state ${state}`, () => {
    assert.deepEqual(validateJsonSchemaSubset(taskInstance({ state }), schema), []);
  });
}

test('T-16 unknown WorkPackage membership remains unmapped when multiple WPs exist', () => {
  assert.deepEqual(validateGraph([stageInstance(), workPackageInstance(),
    workPackageInstance({ id: 'wp:090_PDR:other', work_package_key: 'other' }), taskInstance()]), []);
});

const graphCounterexamples = {
  'wrong-project WorkPackage reference': (nodes) => { nodes[2].work_package_ref.project_id = 'SYN-02'; },
  'wrong-product WorkPackage reference': (nodes) => { nodes[2].work_package_ref.product_id = 'SYN-PRODUCT-B'; },
  'duplicate scoped identity makes WP ambiguous': (nodes) => { nodes.push(structuredClone(nodes[1])); },
  'missing WorkPackage': (nodes) => { nodes[2].work_package_ref.id = 'wp:090_PDR:missing'; },
  'unproven WorkPackage binding': (nodes) => { nodes[2].work_package_basis_refs = []; },
  'unscoped legacy node': (nodes) => { delete nodes[2].scope; },
  'actual Task auto-equivalence': (nodes) => { nodes[2].actual_task_ref = nodes[2].id; },
  'Task ID differs from fields': (nodes) => { nodes[2].artifact_type_id = 'other'; },
  'Stage ID differs from fields': (nodes) => { nodes[0].stage_code = '120_CDR'; },
  'WP ID differs from fields': (nodes) => { nodes[1].work_package_key = 'other'; },
  'Step ID differs from fields': (nodes) => { nodes[3].step_id = 'other'; },
  'Action ID differs from fields': (nodes) => { nodes[4].action_kind = 'other'; },
  'missing Task parent': (nodes) => { nodes.splice(2, 1); },
  'missing Step': (nodes) => { nodes.splice(3, 1); },
  'Step omitted from parent list': (nodes) => { nodes[2].steps = []; },
  'duplicate Step edge': (nodes) => { nodes[2].steps.push(nodes[3].id); },
  'wrong Blueprint suffix version': (nodes) => { nodes[2].blueprint_ref = { ...nodes[2].blueprint_ref, version: 'v1' }; },
  'unversioned Blueprint': (nodes) => { nodes[2].blueprint_ref = { ...nodes[2].blueprint_ref, workflow_id: 'unversioned' }; },
  'Step Blueprint disagrees with parent': (nodes) => { nodes[3].blueprint_ref = { workflow_id: 'other_v0', version: 'v0', version_source: 'id_suffix' }; },
  'Action Blueprint disagrees with parent': (nodes) => { nodes[4].blueprint_ref = { workflow_id: 'other_v0', version: 'v0', version_source: 'id_suffix' }; },
  'non-finite source rank': (nodes) => { nodes[2].gate_role_rank = Infinity; },
  'fractional order index': (nodes) => { nodes[2].order_index = 0.5; },
  'unknown observation enum': (nodes) => { nodes[2].observation_state = 'approved'; },
  'raw evidence body': (nodes) => { nodes[2].evidence_refs = [{ ref_kind: 'observation', exact_ref: 'ref:synthetic/evidence', sha256: null, body: 'synthetic raw body' }]; },
  'private absolute path in public-safe reference': (nodes) => { nodes[3].definition_ref.exact_ref = ['C:', 'private', 'synthetic.txt'].join('/'); },
  'credential-shaped extra data': (nodes) => { nodes[2].credential = 'synthetic-placeholder'; },
  'malformed source token': (nodes) => { nodes[2].blocked_by = ['bad\ntoken']; },
  'legacy conflated state': (nodes) => { nodes[2].state = 'WORKFLOW_GAP'; },
  'false ready promoted': (nodes) => { nodes[2].ready = false; },
  'missing Action Blueprint': (nodes) => { nodes[4].blueprint_ref = null; nodes[4].procedure_state = 'WORKFLOW_GAP'; },
  'missing definition digest': (nodes) => { nodes[3].definition_ref.sha256 = null; },
  'reference traversal': (nodes) => { nodes[3].definition_ref.exact_ref = 'ref:synthetic/../source'; },
  'source rank NaN': (nodes) => { nodes[2].provenance.evidence_rank = NaN; },
  'malformed WorkPackage ref id': (nodes) => { nodes[2].work_package_ref.id = 'wp:bad'; },
  'malformed Action parent ref': (nodes) => { nodes[4].step_id = 'fabrication'; },
  'cross-layer source field': (nodes) => { nodes[0].alias = null; },
  'cross-layer WP field': (nodes) => { nodes[4].work_package_key = 'default'; },
  'cross-layer definition reference': (nodes) => { nodes[0].definition_ref = nodes[3].definition_ref; },
};
for (const [name, mutate] of Object.entries(graphCounterexamples)) {
  test(`T-16 counterexample: ${name}`, () => {
    const nodes = linkedNodes();
    mutate(nodes);
    assert.ok(validateGraph(nodes).length > 0, name);
  });
}

// Portable invented paths follow the path-policy test fixture convention; no
// host path is recorded in public source and the runtime rejection stays exact.
const fakeMountedPath = ['', 'mnt', 'synthetic.txt'].join('/');
const fakeFileUri = ['file:', '', '', 'private', 'synthetic.txt'].join('/');
const unsafeOpaqueRefs = [
  'ref:C:/private/synthetic.txt',
  'ref:C:\\private\\synthetic.txt',
  'ref:/mnt/synthetic.txt',
  fakeMountedPath,
  `ref:${fakeFileUri}`,
  fakeFileUri,
  'ref:https://example.invalid/synthetic',
  'https://example.invalid/synthetic',
  'ref:synthetic//absolute',
];
for (const surface of ['evidence_refs', 'work_package_basis_refs', 'definition_ref']) {
  for (const exactRef of unsafeOpaqueRefs) {
    test(`T-16 review: ${surface} rejects absolute or URL payload ${exactRef}`, () => {
      const nodes = linkedNodes();
      const node = surface === 'definition_ref' ? nodes[3] : nodes[2];
      if (surface === 'evidence_refs') {
        node.evidence_refs = [{ ref_kind: 'observation', exact_ref: exactRef, sha256: null }];
      } else if (surface === 'definition_ref') node.definition_ref.exact_ref = exactRef;
      else node.work_package_basis_refs[0].exact_ref = exactRef;
      assert.ok(validateJsonSchemaSubset(node, schema).length > 0);
      assert.ok(validateGraph(nodes).length > 0);
    });
  }
}

for (const rank of [-1, 0.5]) {
  test(`T-16 review: evidence_rank rejects ${rank}`, () => {
    const nodes = linkedNodes();
    nodes[2].provenance.evidence_rank = rank;
    assert.ok(validateJsonSchemaSubset(nodes[2], schema).length > 0);
    assert.ok(validateGraph(nodes).length > 0);
  });
}

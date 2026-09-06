// T-01 (RUNE_TASK_GRAPH_PHASE0_BRIEF_2026-09-06.md §9): task_hierarchy_v1 schema self-validity,
// one minimal valid instance per layer, and the three named negative cases. This is commit 1 of
// the Phase 0 lane — the mapper, the invariants contract, and the projection (T-02..T-10) are
// later commits and are intentionally not exercised here.
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

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, '..', 'schemas', 'task_hierarchy_v1.schema.json');
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

function baseCommonFields(overrides = {}) {
  return {
    schema_version: 'soulforge.engineering_engine.task_hierarchy.v1',
    owner_authority: 'rune',
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
    state: 'WORKFLOW_GAP',
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

// 2026-09-06 review (B3/M4): a Task's blueprint_ref is null exactly when its workflow id has no
// `_vN` suffix (7 of 71 registered workflow ids — see task_hierarchy_v1.md §6) or has no
// blueprint at all; either way the contract now requires `state: WORKFLOW_GAP` in that case.
// Stage/WorkPackage nodes are not workflow-bound at all, so a null blueprint_ref leaves their
// `state` unconstrained (see task_hierarchy_v1.md §3).
test('T-01 negative: a Task with a null blueprint_ref must be WORKFLOW_GAP, not any other state', () => {
  const instance = taskInstance({ state: 'READY' });
  const errors = validateJsonSchemaSubset(instance, schema);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((message) => message.includes('$.state') && message.includes('WORKFLOW_GAP')));
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

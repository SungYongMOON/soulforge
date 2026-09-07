// Read-only candidate projection. Inputs and opaque source-byte refs belong to the
// caller. Parsed-data digest checks never claim that a file or its approval was verified.
import { createHash } from 'node:crypto';
import schema from '../schemas/task_hierarchy_v1.schema.json' with { type: 'json' };
import { validateJsonSchemaSubset, validateTaskHierarchyNodes } from '../schemas/task_hierarchy_v1_schema_validator.mjs';
// This existing pure helper uses exactly the compiler's null-dropping canonical
// representation and domains. The mapper's own data digest below preserves nulls.
import { guidanceDigest, deepFreeze } from '../guidance/guide_cards.mjs';
import { STAGE_RULE_COMPILER_SCHEMA_VERSION, STAGE_WORK_ORDER_SCHEMA_VERSION } from './stage_rule_compiler.mjs';

export const TASK_HIERARCHY_MAPPER_VERSION = 'soulforge.engineering_engine.task_hierarchy_mapper.v1';
export class TaskHierarchyMapperError extends Error {
  constructor(code) { super(code); this.name = 'TaskHierarchyMapperError'; this.code = code; }
}
const refuse = (code) => { throw new TaskHierarchyMapperError(code); };
const copy = (value) => structuredClone(value);
const sha = (text) => createHash('sha256').update(text).digest('hex');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, required, optional = []) => {
  if (!isObject(value) || required.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => ![...required, ...optional].includes(key))) refuse('INVALID_SHAPE');
};
const array = (value) => {
  if (!Array.isArray(value) || value.length > 8192) refuse('INVALID_ARRAY');
  return value;
};
const scopeEqual = (a, b) => a.project_id === b.project_id && a.product_id === b.product_id;
const sourceDigest = (kind, value) => guidanceDigest(`${STAGE_RULE_COMPILER_SCHEMA_VERSION}.${kind}`, value);
const expectDigest = (actual, expected) => {
  if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/u.test(expected) || actual !== expected) refuse('SOURCE_DIGEST_MISMATCH');
};

// Sorted object keys, original array order, explicit null, finite JSON values only.
// This identifies parsed data; it is deliberately separate from source-byte SHA-256.
export function taskHierarchyDataDigest(value) {
  const ancestors = new Set();
  const normalize = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if ((!isObject(item) && !Array.isArray(item)) || ancestors.has(item)) refuse('NON_JSON_INPUT');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Reflect.ownKeys(item).some((key) => typeof key === 'symbol')
      || Object.values(descriptors).some((descriptor) => descriptor.get || descriptor.set)) refuse('NON_JSON_INPUT');
    if (Array.isArray(item) && (Object.keys(item).length !== item.length
      || Array.from({ length: item.length }, (_, index) => index).some((index) => !Object.hasOwn(item, index)))) refuse('NON_JSON_INPUT');
    ancestors.add(item);
    const normalized = Array.isArray(item) ? item.map(normalize)
      : Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    ancestors.delete(item);
    return normalized;
  };
  return sha(JSON.stringify(normalize(value)));
}

const common = (scope, variant, appliesWhen = null) => ({
  schema_version: schema.$id, owner_authority: 'rune', scope: copy(scope),
  applicability: { business_type: variant.business_type, prime_contractor: variant.prime_contractor,
    quality_grade: variant.quality_grade, applies_when: copy(appliesWhen) },
  depends_on: [], dependency_scope: { same_stage: [], earlier_stage: [], forward_stage: [], out_of_scope: [], unresolved: [] },
  preconditions: [], completion_contract: { invariant_ids: [], minimum_presence_rule: 'optional_context', required_evidence: [] },
  evidence_refs: [], blueprint_ref: null, procedure_state: 'WORKFLOW_GAP', state: 'UNKNOWN', claim_ceiling: 'observed',
});
const validRef = (ref, kind = null) => {
  if (validateJsonSchemaSubset(ref, schema.properties.evidence_refs.items).length
    || typeof ref?.sha256 !== 'string' || (kind !== null && ref.ref_kind !== kind)) refuse('INVALID_SOURCE_REF');
};
const SOURCE_ITEM_FIELDS = ['order_index', 'stage_code', 'artifact_type_id', 'node_kind', 'is_virtual',
  'gate_role', 'gate_role_rank', 'dependents_count', 'depends_on_origin', 'evidence_level', 'evidence_rank',
  'minimum_presence_rule', 'engine_requirement_id', 'alias', 'evidence_record', 'depends_on',
  'same_stage_inputs', 'earlier_stage_inputs', 'forward_stage_inputs', 'out_of_scope_inputs',
  'unresolved_inputs', 'satisfied_inputs', 'blocked_by', 'ready', 'observation_state'];

/**
 * mapTaskHierarchy({scope, compiled_variant, compile_result, work_order, overlay?,
 *   source_refs?, work_packages?, blueprint_sources?}) -> frozen {nodes, receipt}.
 * A nonempty upstream overlay requires exact matching overlay bytes-as-data here.
 * WP task_ids and Blueprint task_id are local expectation ids inside the explicit scope.
 * Missing membership/procedures remain null. Unknown or ambiguous bindings throw;
 * no partial projection, actual Task, invariant, or writer is produced.
 */
export function mapTaskHierarchy(request) {
  try { return map(request); } catch (error) {
    if (error instanceof TaskHierarchyMapperError) throw error;
    // Do not expose source values or private source locations through nested errors.
    return refuse('INVALID_SOURCE_DATA');
  }
}

function map(request) {
  exact(request, ['scope', 'compiled_variant', 'compile_result', 'work_order'],
    ['overlay', 'source_refs', 'work_packages', 'blueprint_sources']);
  taskHierarchyDataDigest(request); // Reject non-JSON material before using it.
  const { scope, compiled_variant: variant, compile_result: compiled, work_order: order } = request;
  if (validateJsonSchemaSubset(scope, schema.properties.scope).length) refuse('INVALID_SCOPE');
  if (compiled.receipt?.schema_version !== STAGE_RULE_COMPILER_SCHEMA_VERSION
    || order.schema_version !== STAGE_WORK_ORDER_SCHEMA_VERSION) refuse('SOURCE_VERSION_MISMATCH');
  expectDigest(sourceDigest('compiled_variant', variant), compiled.receipt.input_digests.compiled_variant);
  const overlay = request.overlay ?? null;
  if (overlay === null && sourceDigest('overlay', { present: false }) !== compiled.receipt.input_digests.overlay) {
    refuse('OVERLAY_SOURCE_REQUIRED_HOLD');
  }
  expectDigest(sourceDigest('overlay', overlay === null ? { present: false } : { present: true, overlay }), compiled.receipt.input_digests.overlay);
  const mappingDigest = sourceDigest('mapping_table', compiled.mapping_table);
  expectDigest(mappingDigest, compiled.receipt.output_digests.mapping_table);
  expectDigest(mappingDigest, order.receipt.input_digests.mapping_table);
  expectDigest(sourceDigest('stage_work_order', order.stages), order.receipt.output_digests.stages);
  const packages = array(request.work_packages ?? []);
  const blueprints = array(request.blueprint_sources ?? []);
  const sources = request.source_refs ?? {};
  exact(sources, [], ['compiled_variant', 'compile_result', 'work_order', 'overlay']);
  const sourceProvenance = Object.entries(sources).map(([input_name, source_ref]) => {
    validRef(source_ref);
    return { input_name, source_ref: copy(source_ref), source_bytes_verification: 'caller_supplied_not_file_verified' };
  });
  const nodes = [];
  const taskById = new Map();
  const stageByCode = new Map();
  const mappingProvenance = [];
  for (const stage of array(order.stages)) {
    exact(stage, ['stage_code', 'stage_sequence', 'work_items']);
    if (stageByCode.has(stage.stage_code)) refuse('DUPLICATE_STAGE');
    const declarations = array(compiled.needs_stage_declarations.stages).filter((row) => row.stage_code === stage.stage_code);
    if (declarations.length !== 1 || declarations[0].sequence !== stage.stage_sequence) refuse('STAGE_SOURCE_MISMATCH');
    stageByCode.set(stage.stage_code, stage);
    nodes.push({ ...common(scope, variant), layer: 'Stage', id: stage.stage_code,
      stage_code: stage.stage_code, stage_sequence: stage.stage_sequence });
    for (const item of array(stage.work_items)) {
      exact(item, SOURCE_ITEM_FIELDS);
      if (item.stage_code !== stage.stage_code) refuse('STAGE_SOURCE_MISMATCH');
      const matches = array(compiled.mapping_table).filter((row) => row.stage_code === item.stage_code
        && row.artifact_type_id === item.artifact_type_id && row.engine_requirement_id === item.engine_requirement_id);
      if (matches.length !== 1) refuse('AMBIGUOUS_OR_MISSING_RULE');
      const row = matches[0];
      let appliesWhen;
      if (row.origin === 'overlay') {
        const additions = array(overlay?.ops).filter((op) => op.op === 'add'
          && op.stage_code === row.stage_code && op.artifact_type_id === row.artifact_type_id);
        if (additions.length !== 1 || Object.hasOwn(additions[0], 'applies_when')) refuse('UNRESOLVED_OVERLAY_APPLICABILITY');
        // Current compiler overlayAddRow explicitly sets applies_when:null. An
        // extension of that source contract must not be silently coalesced here.
        appliesWhen = null;
      } else {
        const gates = array(variant.gates).filter((gate) => gate.code === stage.stage_sequence);
        const sourceRows = gates.flatMap((gate) => array(gate.tasks)).filter((task) => task.id === row.task_id);
        if (sourceRows.length !== 1) refuse('AMBIGUOUS_OR_MISSING_VARIANT_TASK');
        const condition = sourceRows[0].applies_when;
        appliesWhen = condition === undefined ? null
          : (Array.isArray(condition) ? copy(condition).sort() : [condition]);
      }
      const id = `task:${item.stage_code}:${item.artifact_type_id}`;
      if (taskById.has(id)) refuse('DUPLICATE_EXPECTATION');
      const node = { ...common(scope, variant, appliesWhen), layer: 'Task', id,
        ...Object.fromEntries(['stage_code', 'artifact_type_id', 'node_kind', 'is_virtual', 'gate_role', 'gate_role_rank',
          'order_index', 'dependents_count', 'engine_requirement_id', 'alias', 'observation_state', 'ready',
          'depends_on', 'satisfied_inputs', 'blocked_by'].map((key) => [key, copy(item[key])])),
        node_role: 'expectation', actual_task_ref: null, work_package_ref: null, work_package_basis_refs: [], steps: [],
        dependency_scope: Object.fromEntries(['same_stage', 'earlier_stage', 'forward_stage', 'out_of_scope', 'unresolved']
          .map((key) => [key, copy(item[`${key}_inputs`])])),
        provenance: Object.fromEntries(['evidence_level', 'evidence_rank', 'evidence_record', 'depends_on_origin'].map((key) => [key, copy(item[key])])),
        completion_contract: { invariant_ids: [], minimum_presence_rule: item.minimum_presence_rule, required_evidence: [] },
        state: item.observation_state === 'present' ? 'SATISFIED' : item.ready ? 'READY' : 'BLOCKED_INPUT' };
      nodes.push(node);
      taskById.set(id, node);
      mappingProvenance.push({ task_id: id, origin: row.origin, mapping_row_data_sha256: taskHierarchyDataDigest(row) });
    }
  }
  const wpIds = new Set();
  for (const wp of packages) {
    exact(wp, ['scope', 'stage_code', 'work_package_key', 'title_ko', 'owner_domain_rune', 'task_ids', 'basis_ref']);
    if (validateJsonSchemaSubset(wp.scope, schema.properties.scope).length || !scopeEqual(scope, wp.scope)) refuse('SCOPE_MISMATCH');
    if (!stageByCode.has(wp.stage_code)) refuse('UNKNOWN_WP_STAGE');
    validRef(wp.basis_ref, 'binding');
    const id = `wp:${wp.stage_code}:${wp.work_package_key}`;
    if (wpIds.has(id)) refuse('DUPLICATE_WORK_PACKAGE');
    wpIds.add(id);
    sourceProvenance.push({ input_name: 'work_packages', work_package_id: id, source_ref: copy(wp.basis_ref),
      source_bytes_verification: 'caller_supplied_not_file_verified' });
    nodes.push({ ...common(scope, variant), layer: 'WorkPackage', id,
      ...Object.fromEntries(['stage_code', 'work_package_key', 'title_ko', 'owner_domain_rune'].map((key) => [key, wp[key]])) });
    for (const taskId of array(wp.task_ids)) {
      const task = taskById.get(taskId);
      if (!task || task.stage_code !== wp.stage_code) refuse('UNKNOWN_OR_WRONG_STAGE_WP_TASK');
      if (task.work_package_ref !== null) refuse('AMBIGUOUS_WP_MEMBERSHIP');
      task.work_package_ref = { ...copy(scope), id };
      task.work_package_basis_refs = [copy(wp.basis_ref)];
    }
  }
  const boundBlueprints = new Set();
  for (const source of blueprints) {
    exact(source, ['scope', 'task_id', 'blueprint_ref', 'definition_ref', 'definition_data_sha256', 'definition']);
    if (validateJsonSchemaSubset(source.scope, schema.properties.scope).length || !scopeEqual(scope, source.scope)) refuse('SCOPE_MISMATCH');
    const task = taskById.get(source.task_id);
    if (!task) refuse('UNKNOWN_BLUEPRINT_TASK');
    if (boundBlueprints.has(task.id)) refuse('AMBIGUOUS_BLUEPRINT');
    boundBlueprints.add(task.id);
    validRef(source.definition_ref, 'blueprint');
    expectDigest(taskHierarchyDataDigest(source.definition), source.definition_data_sha256);
    if (!source.blueprint_ref || validateJsonSchemaSubset(source.blueprint_ref, schema.properties.blueprint_ref).length
      || source.blueprint_ref.workflow_id !== source.definition.workflow_id) refuse('UNRESOLVED_BLUEPRINT_VERSION');
    task.blueprint_ref = copy(source.blueprint_ref);
    task.procedure_state = 'READY';
    const steps = array(source.definition.steps);
    if (steps.length === 0) refuse('EMPTY_BLUEPRINT');
    for (const [seq, step] of steps.entries()) {
      if (!isObject(step) || !isObject(step.next) || !isObject(step.action)) refuse('INVALID_BLUEPRINT_STEP');
      const id = `step:${task.id}:${source.blueprint_ref.workflow_id}:${step.step_id}`;
      const blueprintFields = { blueprint_ref: copy(source.blueprint_ref), procedure_state: 'READY', definition_ref: copy(source.definition_ref) };
      const base = common(scope, variant, task.applicability.applies_when);
      nodes.push({ ...base, ...blueprintFields, layer: 'Step', id, task_id: task.id,
        workflow_id: source.blueprint_ref.workflow_id, step_id: step.step_id, seq, title: step.title, actor_slot: step.actor_slot,
        next: Object.fromEntries(['on_success', 'on_fail'].filter((key) => Object.hasOwn(step.next, key)).map((key) => [key, copy(step.next[key])])) });
      task.steps.push(id);
      nodes.push({ ...common(scope, variant, task.applicability.applies_when), ...copy(blueprintFields), layer: 'Action',
        id: `action:${id}:${step.action.kind}`, step_id: id, action_kind: step.action.kind,
        effect_class: step.action.effect_class, receipt_required: step.action.receipt_required,
        ...Object.fromEntries(['requires', 'validates', 'creates'].filter((key) => Object.hasOwn(step.action, key)).map((key) => [key, copy(step.action[key])])) });
    }
    sourceProvenance.push({ input_name: 'blueprint_sources', task_id: task.id, source_ref: copy(source.definition_ref),
      definition_data_sha256: source.definition_data_sha256, source_bytes_verification: 'caller_supplied_not_file_verified' });
  }
  if (validateTaskHierarchyNodes(nodes, schema).length) refuse('NODE_CONTRACT_INVALID');
  return deepFreeze({ nodes, receipt: {
    schema_version: TASK_HIERARCHY_MAPPER_VERSION, deterministic: true, claim_ceiling: 'observed', scope: copy(scope),
    input_data_sha256: taskHierarchyDataDigest(request), output_data_sha256: taskHierarchyDataDigest(nodes),
    input_digests: Object.fromEntries(['scope', 'compiled_variant', 'compile_result', 'work_order', 'overlay', 'source_refs', 'work_packages', 'blueprint_sources']
      .map((key) => [key, taskHierarchyDataDigest(request[key] ?? null)])),
    compiler_receipt: copy(compiled.receipt), upstream_receipt: copy(order.receipt),
    source_provenance: sourceProvenance, mapping_provenance: mappingProvenance,
    counts: { nodes: nodes.length, expectations: taskById.size, mapped_work_packages: packages.length,
      resolved_blueprints: boundBlueprints.size, procedure_gaps: taskById.size - boundBlueprints.size },
    effects: { filesystem_reads: 0, filesystem_writes: 0, clock_reads: 0, network_calls: 0, model_calls: 0 },
  } });
}

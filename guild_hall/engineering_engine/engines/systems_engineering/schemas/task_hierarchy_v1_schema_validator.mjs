// Dependency-free JSON Schema (draft 2020-12) SUBSET validator for the task_hierarchy_v1
// contract (guild_hall/engineering_engine/engines/systems_engineering/contracts/task_hierarchy_v1.md +
// task_hierarchy_v1.schema.json, sibling file). Modeled on the same dependency-free approach as
// guild_hall/engineering_engine/engines/safety_hazard/schemas/safety_hazard_schema_validator.mjs
// (same supported-keyword-or-fail discipline, same recursive shape), duplicated here rather than
// imported across an engine boundary because task_hierarchy_v1 is owned by the systems_engineering
// package (its projection source), not by the safety_hazard domain engine.
//
// Extended with `allOf` / `if` / `then` / `else` beyond the safety_hazard original because
// task_hierarchy_v1 is a polymorphic document — one schema, five node layers (Stage / WorkPackage
// / Task / Step / Action) dispatched by a `layer` enum — and expressing "this field is required
// only for layer X" or "steps must be empty when blueprint_ref is null" needs a conditional this
// contract's schema otherwise has no way to carry. Unsupported validation keywords still fail the
// check rather than being silently ignored, so a schema author cannot rely on a keyword this
// validator does not actually enforce.
//
// Further extended (2026-09-06 review) with: array-form `type` (e.g. `["object", "null"]`) and
// the `"null"` type name itself, because `blueprint_ref` and `evidence_refs[].sha256` are
// legitimately nullable and a bare string `type` cannot express that; `minimum` and the
// `"integer"` type, needed by `Step.seq`; and `not`, needed to say "this layer's node must not
// carry this Task-only field" without reaching for a boolean `false` sub-schema — this validator
// does not give a schema-position `false`/`true` any meaning (`collectSchemaSelfValidityErrors`
// would reject either as "not an object"), so the equivalent constraint is expressed as
// `{"not": {"required": [...]}}` instead.
const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', 'title', 'type', 'additionalProperties', 'required', 'properties',
  'const', 'enum', 'minLength', 'maxLength', 'pattern', 'items', 'minItems', 'maxItems',
  'minimum', 'allOf', 'if', 'then', 'else', 'not',
]);

// `type` is usually a single JSON Schema type name, but draft 2020-12 also allows an array of
// type names (e.g. `["object", "null"]`) to mean "any one of these". Recursing over the array
// keeps every other call site — which only ever sees a plain string today — unchanged.
const typeMatches = (value, type) => {
  if (Array.isArray(type)) return type.some((oneType) => typeMatches(value, oneType));
  return (
    (type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value))
    || (type === 'array' && Array.isArray(value))
    || (type === 'string' && typeof value === 'string')
    || (type === 'boolean' && typeof value === 'boolean')
    || (type === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (type === 'integer' && typeof value === 'number' && Number.isInteger(value))
    || (type === 'null' && value === null)
  );
};

export function validateJsonSchemaSubset(value, schema, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [`${path}: schema must be an object`];
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) errors.push(`${path}: unsupported schema keyword ${key}`);
  }
  if (schema.type && !typeMatches(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
    errors.push(`${path}: expected ${expected}`);
    return errors;
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: value is outside enum`);
  }
  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      errors.push(`${path}: string is shorter than minLength`);
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      errors.push(`${path}: string is longer than maxLength`);
    }
    if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern, 'u')).test(value)) {
      errors.push(`${path}: string does not match pattern`);
    }
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path}: number is below minimum`);
    }
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${path}: array is shorter than minItems`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${path}: array is longer than maxItems`);
    }
    if (schema.items) value.forEach((item, index) => validateJsonSchemaSubset(item, schema.items, `${path}[${index}]`, errors));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${path}: missing required property ${required}`);
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) errors.push(`${path}: unexpected property ${key}`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateJsonSchemaSubset(value[key], childSchema, `${path}.${key}`, errors);
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) errors.push(...validateJsonSchemaSubset(value, sub, path, []));
  }
  if (schema.not) {
    const notErrors = validateJsonSchemaSubset(value, schema.not, path, []);
    if (notErrors.length === 0) errors.push(`${path}: value must not match the "not" schema`);
  }
  if (schema.if) {
    const ifErrors = validateJsonSchemaSubset(value, schema.if, path, []);
    if (ifErrors.length === 0) {
      if (schema.then) errors.push(...validateJsonSchemaSubset(value, schema.then, path, []));
    } else if (schema.else) {
      errors.push(...validateJsonSchemaSubset(value, schema.else, path, []));
    }
  }
  return errors;
}

// Self-validity helper for T-01: walks every schema-position object reachable from the root
// (root, property schemas, array `items`, and the `allOf`/`if`/`then`/`else`/`not` branches) and
// confirms each one only uses supported keywords and that every `pattern` string compiles as a
// regular expression. This does not re-implement a JSON-Schema-of-JSON-Schema; it only guards the
// keyword vocabulary this validator itself understands, which is what T-01 needs to know before
// trusting the pass/fail calls this module makes against real instances.
export function collectSchemaSelfValidityErrors(schema, path = '$') {
  const errors = [];
  const visit = (node, at) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`${at}: schema node must be an object`);
      return;
    }
    for (const key of Object.keys(node)) {
      if (!SUPPORTED_KEYWORDS.has(key)) errors.push(`${at}: unsupported schema keyword ${key}`);
    }
    if (typeof node.pattern === 'string') {
      try { new RegExp(node.pattern, 'u'); } catch { errors.push(`${at}.pattern: does not compile as a regular expression`); }
    }
    if (node.properties && typeof node.properties === 'object') {
      for (const [key, child] of Object.entries(node.properties)) visit(child, `${at}.properties.${key}`);
    }
    if (node.items) visit(node.items, `${at}.items`);
    if (Array.isArray(node.allOf)) node.allOf.forEach((sub, index) => visit(sub, `${at}.allOf[${index}]`));
    if (node.if) visit(node.if, `${at}.if`);
    if (node.then) visit(node.then, `${at}.then`);
    if (node.else) visit(node.else, `${at}.else`);
    if (node.not) visit(node.not, `${at}.not`);
  };
  visit(schema, path);
  return errors;
}

// §16 semantic gate. JSON Schema checks shape; this pure, read-only gate checks
// reconstruction and references across a complete caller-supplied node set. Local
// ids alone are never identity. No source lookup, binding inference, or writes occur.
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u;
const scopedKey = (scope, id) => JSON.stringify([scope.project_id, scope.product_id, id]);
const sameScope = (a, b) => a.project_id === b.project_id && a.product_id === b.product_id;
const sameBlueprint = (a, b) => a !== null && b !== null
  && a.workflow_id === b.workflow_id && a.version === b.version && a.version_source === b.version_source;

export function validateTaskHierarchyNodes(nodes, schema) {
  const errors = collectSchemaSelfValidityErrors(schema);
  if (!Array.isArray(nodes)) return [...errors, '$: nodes must be an array'];
  nodes.forEach((node, index) => validateJsonSchemaSubset(node, schema, `$[${index}]`, errors));
  // Do not dereference invalid shapes, and do not silently reinterpret legacy rows.
  if (errors.length) return errors;
  const byKey = new Map();
  for (const [index, node] of nodes.entries()) {
    const key = scopedKey(node.scope, node.id);
    if (byKey.has(key)) errors.push(`$[${index}].id: duplicate scoped identity`);
    else byKey.set(key, node);
  }
  if (errors.length) return errors;
  const resolve = (scope, id, layer, at) => {
    const target = byKey.get(scopedKey(scope, id));
    if (!target || target.layer !== layer) {
      errors.push(`${at}: missing or wrong-layer scoped reference`);
      return null;
    }
    return target;
  };
  const taskOnly = ['node_role', 'actual_task_ref', 'work_package_ref', 'work_package_basis_refs',
    'steps', 'satisfied_inputs', 'blocked_by', 'ready', 'is_virtual', 'gate_role_rank',
    'order_index', 'dependents_count', 'engine_requirement_id', 'alias', 'observation_state',
    'provenance', 'artifact_type_id', 'node_kind', 'gate_role'];
  const stepOnly = ['task_id', 'workflow_id', 'seq', 'title', 'actor_slot', 'next'];
  const actionOnly = ['action_kind', 'effect_class', 'receipt_required', 'requires', 'validates', 'creates'];
  for (const [index, node] of nodes.entries()) {
    const at = `$[${index}]`;
    for (const [layer, fields] of [['Task', taskOnly], ['Step', stepOnly], ['Action', actionOnly]]) {
      if (node.layer !== layer) for (const field of fields) {
        if (Object.hasOwn(node, field)) errors.push(`${at}.${field}: field belongs to ${layer}`);
      }
    }
    for (const [layers, fields] of [
      [['WorkPackage'], ['work_package_key', 'title_ko', 'owner_domain_rune']],
      [['Stage'], ['stage_sequence']],
      [['Stage', 'WorkPackage', 'Task'], ['stage_code']],
      [['Step', 'Action'], ['step_id', 'definition_ref']],
    ]) {
      if (!layers.includes(node.layer)) for (const field of fields) {
        if (Object.hasOwn(node, field)) errors.push(`${at}.${field}: field belongs to ${layers.join('/')}`);
      }
    }
    if (node.blueprint_ref !== null) {
      const suffix = node.blueprint_ref.workflow_id.match(/_(v[0-9]+)$/u)?.[1];
      if (suffix !== node.blueprint_ref.version) errors.push(`${at}.blueprint_ref: version differs from id suffix`);
    }
    let expectedId;
    if (node.layer === 'Stage') expectedId = node.stage_code;
    if (node.layer === 'WorkPackage') expectedId = `wp:${node.stage_code}:${node.work_package_key}`;
    if (node.layer === 'Task') expectedId = `task:${node.stage_code}:${node.artifact_type_id}`;
    if (node.layer === 'Step') expectedId = `step:${node.task_id}:${node.workflow_id}:${node.step_id}`;
    if (node.layer === 'Action') expectedId = `action:${node.step_id}:${node.action_kind}`;
    if (node.id !== expectedId) errors.push(`${at}.id: differs from reconstructed fields`);
    if (['WorkPackage', 'Task'].includes(node.layer)) resolve(node.scope, node.stage_code, 'Stage', `${at}.stage_code`);
    if (node.layer === 'Task') {
      const tokens = [...node.depends_on, ...Object.values(node.dependency_scope).flat(),
        ...node.satisfied_inputs, ...node.blocked_by, ...node.provenance.evidence_record];
      if (tokens.some((token) => !TOKEN.test(token))) errors.push(`${at}: malformed source token`);
      if (node.state === 'READY' && !node.ready) errors.push(`${at}.state: cannot promote source ready:false`);
      if (node.work_package_ref !== null) {
        if (!sameScope(node.scope, node.work_package_ref)) errors.push(`${at}.work_package_ref: wrong project or product scope`);
        const wp = resolve(node.work_package_ref, node.work_package_ref.id, 'WorkPackage', `${at}.work_package_ref`);
        if (wp && wp.stage_code !== node.stage_code) errors.push(`${at}.work_package_ref: wrong stage`);
      } else if (node.work_package_basis_refs.length) {
        errors.push(`${at}.work_package_basis_refs: unmapped membership cannot claim binding evidence`);
      }
      if (new Set(node.steps).size !== node.steps.length) errors.push(`${at}.steps: duplicate reference`);
      for (const id of node.steps) {
        const step = resolve(node.scope, id, 'Step', `${at}.steps`);
        if (step && step.task_id !== node.id) errors.push(`${at}.steps: Step belongs to another Task expectation`);
      }
    }
    if (node.layer === 'Step') {
      if (!TOKEN.test(node.step_id)) errors.push(`${at}.step_id: malformed local key`);
      if (node.workflow_id !== node.blueprint_ref.workflow_id) errors.push(`${at}.workflow_id: differs from Blueprint`);
      const task = resolve(node.scope, node.task_id, 'Task', `${at}.task_id`);
      if (task) {
        if (!task.steps.includes(node.id)) errors.push(`${at}.task_id: parent does not list this Step`);
        if (!sameBlueprint(task.blueprint_ref, node.blueprint_ref)) errors.push(`${at}.blueprint_ref: differs from Task expectation`);
      }
    }
    if (node.layer === 'Action') {
      const step = resolve(node.scope, node.step_id, 'Step', `${at}.step_id`);
      if (step && !sameBlueprint(step.blueprint_ref, node.blueprint_ref)) errors.push(`${at}.blueprint_ref: differs from Step`);
    }
    // Metadata-only references deliberately use opaque ref: locators, never raw
    // bodies, absolute paths, URLs with bearer/query data, or traversal paths.
    for (const ref of [...node.evidence_refs, ...(node.work_package_basis_refs ?? []),
      ...(node.definition_ref ? [node.definition_ref] : [])]) {
      if (ref.exact_ref.split(/[/:]/u).some((part) => part === '.' || part === '..')) {
        errors.push(`${at}: reference contains traversal`);
      }
    }
  }
  return errors;
}

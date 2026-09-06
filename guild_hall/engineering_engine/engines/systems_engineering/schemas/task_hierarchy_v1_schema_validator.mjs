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
    || (type === 'number' && typeof value === 'number')
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

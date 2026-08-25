// Dependency-free subset validator used only for the package's own JSON-compatible YAML
// descriptor. Unsupported validation keywords fail the check rather than being ignored.
const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', 'title', 'type', 'additionalProperties', 'required', 'properties',
  'const', 'enum', 'minLength', 'items', 'minItems',
]);

const typeMatches = (value, type) => (
  (type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value))
  || (type === 'array' && Array.isArray(value))
  || (type === 'string' && typeof value === 'string')
  || (type === 'boolean' && typeof value === 'boolean')
  || (type === 'number' && typeof value === 'number')
);

export function validateJsonSchemaSubset(value, schema, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [`${path}: schema must be an object`];
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) errors.push(`${path}: unsupported schema keyword ${key}`);
  }
  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}`);
    return errors;
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: value is outside enum`);
  }
  if (typeof value === 'string' && Number.isInteger(schema.minLength) && value.length < schema.minLength) {
    errors.push(`${path}: string is shorter than minLength`);
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${path}: array is shorter than minItems`);
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
  return errors;
}

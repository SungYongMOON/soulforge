import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', '..');
const REPO = path.resolve(ENGINE, '..', '..');

function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  // Add ISO date-time format validator
  ajv.addFormat('date-time', /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/);
  return ajv;
}

const REG_PROFILE_SCHEMA_PATH = path.join(REPO, '.registry', 'engineering_profiles', 'schemas', 'engineering_profile_schema_v0.json');
const CORE_PROFILE_BINDING_SCHEMA_PATH = path.join(ENGINE, 'core', 'schemas', 'engineering_profile_binding_schema_v0.json');
const CORE_PROJECT_BINDING_SCHEMA_PATH = path.join(ENGINE, 'core', 'schemas', 'project_binding_schema_v0.json');
const CORE_TYPED_FACTS_SCHEMA_PATH = path.join(ENGINE, 'core', 'schemas', 'typed_project_facts_schema_v0.json');

const EXAMPLES = {
  orgProfile: path.join(REPO, 'docs', 'architecture', 'workspace', 'examples', 'engineering_profiles', 'organization_profile_synthetic_example.json'),
  projectProfile: path.join(REPO, 'docs', 'architecture', 'workspace', 'examples', 'engineering_profiles', 'project_profile_synthetic_example.json'),
  projectBinding: path.join(REPO, 'docs', 'architecture', 'workspace', 'examples', 'engineering_profiles', 'project_binding_synthetic_example.json'),
};

test('Engineering Profile Schemas: all schemas compile with AJV', () => {
  const ajv = createValidator();

  const regProfileSchema = JSON.parse(readFileSync(REG_PROFILE_SCHEMA_PATH, 'utf8'));
  const profileBindingSchema = JSON.parse(readFileSync(CORE_PROFILE_BINDING_SCHEMA_PATH, 'utf8'));
  const projectBindingSchema = JSON.parse(readFileSync(CORE_PROJECT_BINDING_SCHEMA_PATH, 'utf8'));
  const typedFactsSchema = JSON.parse(readFileSync(CORE_TYPED_FACTS_SCHEMA_PATH, 'utf8'));

  assert.doesNotThrow(() => ajv.compile(regProfileSchema), 'Registry engineering_profile_schema_v0.json must compile');
  assert.doesNotThrow(() => ajv.compile(profileBindingSchema), 'Core engineering_profile_binding_schema_v0.json must compile');
  assert.doesNotThrow(() => ajv.compile(projectBindingSchema), 'Core project_binding_schema_v0.json must compile');
  assert.doesNotThrow(() => ajv.compile(typedFactsSchema), 'Core typed_project_facts_schema_v0.json must compile');
});

test('Engineering Profile Schemas: public synthetic examples validate against schemas', () => {
  const ajv = createValidator();
  const profileValidator = ajv.compile(JSON.parse(readFileSync(REG_PROFILE_SCHEMA_PATH, 'utf8')));
  const bindingValidator = ajv.compile(JSON.parse(readFileSync(CORE_PROJECT_BINDING_SCHEMA_PATH, 'utf8')));

  const orgDoc = JSON.parse(readFileSync(EXAMPLES.orgProfile, 'utf8'));
  const validOrg = profileValidator(orgDoc);
  assert.equal(validOrg, true, `Org profile example must pass schema: ${JSON.stringify(profileValidator.errors)}`);

  const projDoc = JSON.parse(readFileSync(EXAMPLES.projectProfile, 'utf8'));
  const validProj = profileValidator(projDoc);
  assert.equal(validProj, true, `Project profile example must pass schema: ${JSON.stringify(profileValidator.errors)}`);

  const bindDoc = JSON.parse(readFileSync(EXAMPLES.projectBinding, 'utf8'));
  const validBind = bindingValidator(bindDoc);
  assert.equal(validBind, true, `Project binding example must pass schema: ${JSON.stringify(bindingValidator.errors)}`);
});

test('Engineering Profile Schemas Hostile: missing mandatory provenance fails schema validation', () => {
  const ajv = createValidator();
  const profileValidator = ajv.compile(JSON.parse(readFileSync(REG_PROFILE_SCHEMA_PATH, 'utf8')));

  const orgDoc = JSON.parse(readFileSync(EXAMPLES.orgProfile, 'utf8'));
  const missingRevision = structuredClone(orgDoc);
  delete missingRevision.revision_hash;
  assert.equal(profileValidator(missingRevision), false, 'Missing revision_hash must fail schema');

  const missingPin = structuredClone(orgDoc);
  delete missingPin.extends_base_pin;
  assert.equal(profileValidator(missingPin), false, 'Missing extends_base_pin must fail schema');

  const missingSourceRefs = structuredClone(orgDoc);
  delete missingSourceRefs.source_refs;
  assert.equal(profileValidator(missingSourceRefs), false, 'Missing source_refs must fail schema');
});

test('Engineering Profile Schemas Hostile: additional properties fail under additionalProperties=false', () => {
  const ajv = createValidator();
  const profileValidator = ajv.compile(JSON.parse(readFileSync(REG_PROFILE_SCHEMA_PATH, 'utf8')));
  const bindingValidator = ajv.compile(JSON.parse(readFileSync(CORE_PROJECT_BINDING_SCHEMA_PATH, 'utf8')));

  const orgDoc = JSON.parse(readFileSync(EXAMPLES.orgProfile, 'utf8'));
  const extraOrg = { ...orgDoc, illegal_extra_property: 'tampered' };
  assert.equal(profileValidator(extraOrg), false, 'Extra property in profile must fail');

  const bindDoc = JSON.parse(readFileSync(EXAMPLES.projectBinding, 'utf8'));
  const extraBind = { ...bindDoc, illegal_extra_property: 'tampered' };
  assert.equal(bindingValidator(extraBind), false, 'Extra property in binding must fail');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { buildManufacturingReadinessPublicSyntheticRequest } from '../fixtures/manufacturing_readiness_public_synthetic.mjs';

const schemaPath = fileURLToPath(new URL('../schemas/manufacturing_readiness_schema_v0.json', import.meta.url));
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

function validator() {
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

test('domain schema accepts both public-synthetic request shapes', () => {
  const validate = validator();
  assert.equal(validate(buildManufacturingReadinessPublicSyntheticRequest('ready')), true, JSON.stringify(validate.errors));
  assert.equal(validate(buildManufacturingReadinessPublicSyntheticRequest('hold')), true, JSON.stringify(validate.errors));
});

test('domain schema rejects an ungrounded not-applicable facet and unrecognized payload fields', () => {
  const validate = validator();
  const missingBasis = buildManufacturingReadinessPublicSyntheticRequest('ready');
  const inspections = missingBasis.facets.find((row) => row.facet_id === 'inspections');
  inspections.applicability = 'not_applicable';
  inspections.evidence_state = 'unknown';
  inspections.evaluation_state = 'unknown';
  assert.equal(validate(missingBasis), false, 'not-applicable requires a basis reference');

  const extra = buildManufacturingReadinessPublicSyntheticRequest('ready');
  extra.project_payload = 'forbidden';
  assert.equal(validate(extra), false, 'payload-bearing root fields must fail schema');

  const duplicate = buildManufacturingReadinessPublicSyntheticRequest('ready');
  duplicate.facets[7].facet_id = 'drawings';
  assert.equal(validate(duplicate), false, 'each closed facet must occur exactly once');

  const bindingExtra = buildManufacturingReadinessPublicSyntheticRequest('ready');
  bindingExtra.project_binding_ref.unexpected_public_field = 'must-not-enter-e05';
  assert.equal(validate(bindingExtra), false, 'ProjectBinding must retain additionalProperties=false closure');
});

test('domain schema requires an exact Project Binding for every direct assessment request', () => {
  const validate = validator();
  const unbound = buildManufacturingReadinessPublicSyntheticRequest('ready');
  delete unbound.project_binding_ref;
  assert.equal(validate(unbound), false, 'all-ready facts without a Project Binding cannot enter direct evaluation');
});

test('domain schema accepts the canonical Core ProjectBinding required fields and defined optionals', () => {
  const validate = validator();
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  request.project_binding_ref = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: 'synthetic-manufacturing-project',
    domain_engine_id: 'manufacturing_readiness',
    binding_revision_hash: 'synthetic-manufacturing-binding-r1',
    source_manifest_ref: 'synthetic-manufacturing-source-manifest-r1',
    authority_family: 'public_synthetic',
    valid_at: '2026-08-26T00:00:00.000Z',
    known_at: '2026-08-26T00:00:00.000Z',
    document_refs: ['synthetic-manufacturing-document-r1'],
  };
  assert.equal(validate(request), true, JSON.stringify(validate.errors));
});

test('domain schema rejects impossible canonical UTC calendar pins', () => {
  const validate = validator();
  const impossibleLeapDay = buildManufacturingReadinessPublicSyntheticRequest('ready');
  impossibleLeapDay.project_binding_ref.valid_at = '2026-02-29T00:00:00Z';
  impossibleLeapDay.project_binding_ref.known_at = '2026-02-29T00:00:00Z';
  assert.equal(validate(impossibleLeapDay), false, 'a non-leap-year February 29 must not pass schema admission');

  const realLeapDay = buildManufacturingReadinessPublicSyntheticRequest('ready');
  realLeapDay.project_binding_ref.valid_at = '2024-02-29T00:00:00.000Z';
  realLeapDay.project_binding_ref.known_at = '2024-02-29T00:00:00.000Z';
  assert.equal(validate(realLeapDay), true, JSON.stringify(validate.errors));

  const secondsOnly = buildManufacturingReadinessPublicSyntheticRequest('ready');
  secondsOnly.project_binding_ref.valid_at = '2024-02-29T00:00:00Z';
  secondsOnly.project_binding_ref.known_at = '2024-02-29T00:00:00Z';
  assert.equal(validate(secondsOnly), false, 'seconds-only pins are outside the Core millisecond contract');
});

test('domain schema preserves Core ProjectBinding public strings with spaces', () => {
  const validate = validator();
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  request.project_binding_ref = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: 'Project Alpha',
    domain_engine_id: 'manufacturing_readiness',
    binding_revision_hash: 'Binding Revision Alpha',
    source_manifest_ref: 'Source Manifest Alpha',
    authority_family: 'Manufacturing Owner',
    document_refs: ['Drawing A'],
  };
  assert.equal(validate(request), true, JSON.stringify(validate.errors));

  request.project_binding_ref.document_refs = ['_workspaces/private/Drawing A'];
  assert.equal(validate(request), false, 'private-path sentinels must remain outside the public schema');
});

test('domain schema rejects the legacy noncanonical three-field ProjectBinding shape', () => {
  const validate = validator();
  const request = buildManufacturingReadinessPublicSyntheticRequest('ready');
  request.project_binding_ref = {
    project_id: 'synthetic-manufacturing-project',
    domain_engine_id: 'manufacturing_readiness',
    binding_revision_hash: 'synthetic-manufacturing-binding-r1',
  };
  assert.equal(validate(request), false, 'legacy binding shape lacks the canonical schema and source-manifest pins');
});

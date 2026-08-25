import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptProjectEvidence, CODES } from '../interfaces/domain_engine_adapter.mjs';
import { createProjectBindingAdapter } from '../interfaces/project_binding_adapter.mjs';

const VALID_BINDING_REF = Object.freeze({
  schema_version: 'soulforge.project_binding.v0',
  project_id: 'proj_alpha',
  domain_engine_id: 'systems_engineering',
  binding_revision_hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
  source_manifest_ref: 'manifests/source_manifest.json',
});

const VALID_SNAPSHOT_REFS = Object.freeze({
  snapshot_id: 'snap_001',
  source_refs: ['docs/srr_minutes.pdf'],
  observations: [{ requirement_id: 'SRR_MINUTES', status: 'present' }],
});

const VALID_CUTOFFS = Object.freeze({
  valid_at: '2026-08-25T12:00:00.000Z',
  known_at: '2026-08-25T12:00:00.000Z',
});

test('Project Binding: rejects missing or empty binding fields', () => {
  assert.throws(
    () => adaptProjectEvidence({ ...VALID_BINDING_REF, project_id: '' }, VALID_SNAPSHOT_REFS, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );
  assert.throws(
    () => adaptProjectEvidence({ ...VALID_BINDING_REF, binding_revision_hash: '' }, VALID_SNAPSHOT_REFS, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );
});

test('Project Binding: rejects missing cutoffs and non-ISO timestamps', () => {
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, VALID_SNAPSHOT_REFS, {}),
    (err) => err.code === CODES.INSTANT_REQUIRED || err.code === CODES.INSTANT_INVALID
  );
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, VALID_SNAPSHOT_REFS, { valid_at: 'not-a-date', known_at: '2026-08-25T12:00:00.000Z' }),
    (err) => err.code === CODES.INSTANT_INVALID
  );
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, VALID_SNAPSHOT_REFS, { valid_at: '2026-08-25T12:00:00.000Z', known_at: null }),
    (err) => err.code === CODES.INSTANT_REQUIRED || err.code === CODES.INSTANT_INVALID
  );
});

test('Project Binding: rejects forbidden path and secret sentinels in observations', () => {
  const windowsPathObs = {
    snapshot_id: 'snap_001',
    source_refs: ['docs/doc.pdf'],
    observations: [{ file: ['C:', 'sentinel', 'path.pdf'].join('\\'), status: 'present' }],
  };
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, windowsPathObs, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );

  const secretObs = {
    snapshot_id: 'snap_001',
    source_refs: ['docs/doc.pdf'],
    observations: [{ token: 'api_key_bearer_secret', status: 'present' }],
  };
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, secretObs, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );
});

test('Project Binding Adapter: creates adapter and adapts evidence without side effects', () => {
  const adapter = createProjectBindingAdapter('systems_engineering', VALID_BINDING_REF);
  assert.equal(adapter.domain_engine_id, 'systems_engineering');
  const adapted = adapter.adaptEvidence(VALID_SNAPSHOT_REFS, VALID_CUTOFFS);
  assert.equal(adapted.typed_project_facts.facts.length, 1);
  assert.equal(adapted.observation_receipt.facts_count, 1);
  assert.equal(typeof adapted.observation_receipt.observations_digest, 'string');
});

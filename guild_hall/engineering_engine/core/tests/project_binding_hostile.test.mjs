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

  const nestedSecretObs = {
    snapshot_id: 'snap_001',
    source_refs: ['docs/doc.pdf'],
    observations: [{ details: { note: 'api_key=hidden' }, status: 'present' }],
  };
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, nestedSecretObs, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );

  const secretKeyObs = {
    snapshot_id: 'snap_001',
    source_refs: ['docs/doc.pdf'],
    observations: [{ details: { 'api_key=hidden': 'present' }, status: 'present' }],
  };
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, secretKeyObs, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );

  const nullSecretKeyObs = {
    snapshot_id: 'snap_001',
    source_refs: ['docs/doc.pdf'],
    observations: [{ details: { 'api_key=hidden': null }, status: 'present' }],
  };
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, nullSecretKeyObs, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );

  const nestedPathObs = {
    snapshot_id: 'snap_001',
    source_refs: ['docs/doc.pdf'],
    observations: [{ details: { source: ['C:', 'private', 'payload.json'].join('\\') } }],
  };
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, nestedPathObs, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );

  const arrayRow = {
    snapshot_id: 'snap_001',
    source_refs: ['docs/doc.pdf'],
    observations: [['array rows are not observation objects']],
  };
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, arrayRow, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID
  );
});

test('Project Binding: hostile wrappers fail before any caller property is read', () => {
  const revokedBinding = Proxy.revocable({ ...VALID_BINDING_REF }, {});
  revokedBinding.revoke();
  assert.throws(
    () => adaptProjectEvidence(revokedBinding.proxy, VALID_SNAPSHOT_REFS, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID,
  );

  let snapshotReads = 0;
  const snapshotProxy = new Proxy({ ...VALID_SNAPSHOT_REFS }, {
    get() {
      snapshotReads += 1;
      throw new Error('snapshot trap executed');
    },
    getPrototypeOf() {
      snapshotReads += 1;
      throw new Error('snapshot prototype trap executed');
    },
  });
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, snapshotProxy, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID,
  );
  assert.equal(snapshotReads, 0);

  let observationReads = 0;
  const accessorObservation = {};
  Object.defineProperty(accessorObservation, 'status', {
    enumerable: true,
    get() {
      observationReads += 1;
      return observationReads === 1 ? 'present' : 'api_key=hidden';
    },
  });
  assert.throws(
    () => adaptProjectEvidence(
      VALID_BINDING_REF,
      { ...VALID_SNAPSHOT_REFS, observations: [accessorObservation] },
      VALID_CUTOFFS,
    ),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID,
  );
  assert.equal(observationReads, 0);

  const revokedSources = Proxy.revocable(['docs/srr_minutes.pdf'], {});
  revokedSources.revoke();
  assert.throws(
    () => adaptProjectEvidence(
      VALID_BINDING_REF,
      { ...VALID_SNAPSHOT_REFS, source_refs: revokedSources.proxy },
      VALID_CUTOFFS,
    ),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID,
  );

  const namedObservations = [...VALID_SNAPSHOT_REFS.observations];
  Object.defineProperty(namedObservations, '4294967295', {
    value: { status: 'hidden' },
    enumerable: true,
  });
  assert.throws(
    () => adaptProjectEvidence(
      VALID_BINDING_REF,
      { ...VALID_SNAPSHOT_REFS, observations: namedObservations },
      VALID_CUTOFFS,
    ),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID,
  );

  let cutoffReads = 0;
  const cutoffAccessor = { known_at: VALID_CUTOFFS.known_at };
  Object.defineProperty(cutoffAccessor, 'valid_at', {
    enumerable: true,
    get() {
      cutoffReads += 1;
      return VALID_CUTOFFS.valid_at;
    },
  });
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, VALID_SNAPSHOT_REFS, cutoffAccessor),
    (err) => err.code === CODES.INSTANT_INVALID,
  );
  assert.equal(cutoffReads, 0);

  const cyclicSnapshot = { ...VALID_SNAPSHOT_REFS };
  cyclicSnapshot.self = cyclicSnapshot;
  assert.throws(
    () => adaptProjectEvidence(VALID_BINDING_REF, cyclicSnapshot, VALID_CUTOFFS),
    (err) => err.code === CODES.PROJECT_EVIDENCE_INVALID,
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

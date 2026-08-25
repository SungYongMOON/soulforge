import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateProfileBinding,
  resolveProfileBindings,
  withoutNulls,
  arrayOrderRules,
} from '../interfaces/domain_engine_adapter.mjs';
import {
  normalizeProfileOperations,
  PROFILE_OPERATION_CODES,
  PROFILE_OPERATION_CANON_VERSION,
  PROFILE_OPERATION_MAX_DEPTH,
} from '../interfaces/profile_operation_canon.mjs';
import { canonicalise } from '../validators/canonical.mjs';
import { sha256Hex } from '../validators/fingerprint.mjs';
import { CODES as CANONICAL_CODES } from '../validators/errors.mjs';

// The digest formula that was in force before the Profile operation canon existed. Null-free
// material must keep producing exactly this, or every accepted SE Profile digest moves.
function legacyNullStrippedDigest(operations) {
  const cleanOps = withoutNulls(operations);
  const canonicalOps = canonicalise(cleanOps, arrayOrderRules(cleanOps));
  return sha256Hex(`soulforge.profile_operations.v0\n${canonicalOps}`);
}

function profileWith(operations) {
  return {
    profile_kind: 'organization',
    profile_id: 'org_null_canon',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_null_canon_1',
    extends_or_base_pin: 'qr_base:v0',
    source_refs: ['contracts/qr_org.json'],
    operations,
    order: 0,
  };
}

const SOURCE_NATIVE_OPS = [
  { op: 'add', rule: { rule_id: 'QR-NULL-01', allowed_artifact_tokens: [null] } },
];
const NO_ARTIFACT_OPS = [
  { op: 'add', rule: { rule_id: 'QR-NULL-01', allowed_artifact_tokens: [] } },
];

test('Profile Operation Canon: array null is preserved, not filtered', () => {
  const normalized = normalizeProfileOperations(SOURCE_NATIVE_OPS);
  assert.deepEqual(normalized.operations[0].rule.allowed_artifact_tokens, [null]);
  assert.equal(normalized.canonical_material.includes('null'), true);
});

test('Profile Operation Canon: object null values are preserved, not dropped', () => {
  const normalized = normalizeProfileOperations([{ op: 'add', rule: { scope_ref: null } }]);
  assert.equal(Object.hasOwn(normalized.operations[0].rule, 'scope_ref'), true);
  assert.equal(normalized.operations[0].rule.scope_ref, null);
  assert.equal(normalized.canonical_material, '[{"op":"add","rule":{"scope_ref":null}}]');
});

test('Profile Operation Canon: [null] and [] produce different operation digests', () => {
  const sourceNative = normalizeProfileOperations(SOURCE_NATIVE_OPS);
  const noArtifact = normalizeProfileOperations(NO_ARTIFACT_OPS);

  assert.notEqual(sourceNative.operation_digest, noArtifact.operation_digest);
  assert.notEqual(sourceNative.canonical_material, noArtifact.canonical_material);

  // The collision this repair closes: the pre-repair formula gave both the same digest.
  assert.equal(
    legacyNullStrippedDigest(SOURCE_NATIVE_OPS),
    legacyNullStrippedDigest(NO_ARTIFACT_OPS)
  );
  assert.notEqual(sourceNative.operation_digest, legacyNullStrippedDigest(SOURCE_NATIVE_OPS));
});

test('Profile Operation Canon: null-free operations keep their historical digest', () => {
  const nullFreeFixtures = [
    [],
    [{ op: 'alias', stage_code: '030_SRR', artifact_type_id: 'srd', alias: 'System Requirements Document' }],
    [{ op: 'condition', token: 'sw_included' }],
    [
      { op: 'alias', token: 'SYSTEM_SPEC', alias: 'SYS_SPEC_ORG' },
      { op: 'condition', token: 'SW_SAFETY_CRITICAL', condition: 'IS_SAFETY_CRITICAL' },
    ],
    [{ op: 'add', rule: { rule_id: 'QR-TEST-01', allowed_artifact_tokens: ['delivery_acceptance_record'], depth: { nested: [1, 2, 3] } } }],
  ];

  for (const operations of nullFreeFixtures) {
    assert.equal(
      normalizeProfileOperations(operations).operation_digest,
      legacyNullStrippedDigest(operations),
      `null-free operations must keep the historical digest: ${JSON.stringify(operations)}`
    );
  }
});

test('Profile Operation Canon: digest domain is unchanged and material is exactly what is hashed', () => {
  const normalized = normalizeProfileOperations(SOURCE_NATIVE_OPS);
  assert.equal(PROFILE_OPERATION_CANON_VERSION, 'soulforge.profile_operations.v0');
  assert.equal(
    normalized.operation_digest,
    sha256Hex(`${PROFILE_OPERATION_CANON_VERSION}\n${normalized.canonical_material}`)
  );
});

test('Profile Operation Canon: normalisation is deterministic, deeply frozen and non-mutating', () => {
  const operations = [{ op: 'add', rule: { rule_id: 'QR-NULL-01', allowed_artifact_tokens: [null, 'delivery_acceptance_record'] } }];
  const before = JSON.parse(JSON.stringify(operations));

  const first = normalizeProfileOperations(operations);
  const second = normalizeProfileOperations(operations);

  assert.equal(first.operation_digest, second.operation_digest);
  assert.equal(first.canonical_material, second.canonical_material);
  assert.deepEqual(operations, before, 'caller operations must not be mutated');
  assert.notEqual(first.operations, operations, 'normalised operations must be an independent clone');

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.operations), true);
  assert.equal(Object.isFrozen(first.operations[0]), true);
  assert.equal(Object.isFrozen(first.operations[0].rule), true);
  assert.equal(Object.isFrozen(first.operations[0].rule.allowed_artifact_tokens), true);

  // Mutating the caller's array afterwards cannot reach the normalised material.
  operations[0].rule.allowed_artifact_tokens.push('manufacturing_process_flow');
  assert.deepEqual(first.operations[0].rule.allowed_artifact_tokens, [null, 'delivery_acceptance_record']);
});

test('Profile Binding: validateProfileBinding returns null-preserved operations and a null-aware digest', () => {
  const sourceNative = validateProfileBinding(profileWith(SOURCE_NATIVE_OPS), 0);
  const noArtifact = validateProfileBinding(profileWith(NO_ARTIFACT_OPS), 0);

  assert.deepEqual(sourceNative.operations[0].rule.allowed_artifact_tokens, [null]);
  assert.deepEqual(noArtifact.operations[0].rule.allowed_artifact_tokens, []);
  assert.notEqual(sourceNative.operation_digest, noArtifact.operation_digest);

  assert.equal(
    sourceNative.operation_digest,
    normalizeProfileOperations(SOURCE_NATIVE_OPS).operation_digest,
    'binding digest must be the Core helper digest'
  );

  assert.equal(Object.isFrozen(sourceNative), true);
  assert.equal(Object.isFrozen(sourceNative.operations[0].rule.allowed_artifact_tokens), true);
});

test('Profile Binding: resolveProfileBindings preserves null through the ordered binding list', () => {
  const orgProfile = profileWith(SOURCE_NATIVE_OPS);
  const before = JSON.parse(JSON.stringify(orgProfile));

  const bindings = resolveProfileBindings(orgProfile, null);
  assert.equal(bindings.length, 1);
  assert.deepEqual(bindings[0].operations[0].rule.allowed_artifact_tokens, [null]);
  assert.deepEqual(orgProfile, before, 'caller profile must not be mutated');

  const replay = resolveProfileBindings(orgProfile, null);
  assert.equal(bindings[0].operation_digest, replay[0].operation_digest);
});

test('Profile Operation Canon: unrelated Core withoutNulls projection is unchanged', () => {
  // Requirement boundary: effective-rule and observation consumers keep the accepted
  // null-stripping projection. Only Profile operations moved to the new contract.
  assert.deepEqual(withoutNulls([null]), []);
  assert.deepEqual(withoutNulls({ a: null, b: 1 }), { b: 1 });
  assert.deepEqual(withoutNulls({ rules: [{ allowed_artifact_tokens: [null, 'x'] }] }), {
    rules: [{ allowed_artifact_tokens: ['x'] }],
  });
});

test('Profile Operation Canon Hostile: non-array operations fail closed', () => {
  for (const bad of [null, undefined, {}, 'ops', 42, new Set()]) {
    assert.throws(
      () => normalizeProfileOperations(bad),
      (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID,
      `operations "${String(bad)}" must be rejected`
    );
  }
});

test('Profile Operation Canon Hostile: proxy-backed operation material fails closed', () => {
  const proxiedOperation = new Proxy({ op: 'add', rule: { allowed_artifact_tokens: [null] } }, {});
  assert.throws(
    () => normalizeProfileOperations([proxiedOperation]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );

  const proxiedArray = new Proxy([null], {});
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', rule: { allowed_artifact_tokens: proxiedArray } }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );

  assert.throws(
    () => normalizeProfileOperations(new Proxy([], {})),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
});

test('Profile Operation Canon Hostile: accessor-backed properties and elements fail closed', () => {
  const accessorObject = { op: 'add' };
  Object.defineProperty(accessorObject, 'rule', {
    get() { return { allowed_artifact_tokens: [null] }; },
    enumerable: true,
    configurable: true,
  });
  assert.throws(
    () => normalizeProfileOperations([accessorObject]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );

  const accessorArray = [];
  Object.defineProperty(accessorArray, '0', {
    get() { return null; },
    enumerable: true,
    configurable: true,
  });
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', rule: { allowed_artifact_tokens: accessorArray } }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );

  const nonEnumerable = { op: 'add' };
  Object.defineProperty(nonEnumerable, 'rule', { value: {}, enumerable: false, configurable: true });
  assert.throws(
    () => normalizeProfileOperations([nonEnumerable]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
});

test('Profile Operation Canon Hostile: symbol keys and symbol values fail closed', () => {
  const symbolKeyed = { op: 'add' };
  symbolKeyed[Symbol('hidden')] = 'value';
  assert.throws(
    () => normalizeProfileOperations([symbolKeyed]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );

  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', rule: { token: Symbol('token') } }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
});

test('Profile Operation Canon Hostile: cyclic operation material fails closed instead of recursing', () => {
  const cyclicRule = { allowed_artifact_tokens: [null] };
  cyclicRule.self = cyclicRule;
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', rule: cyclicRule }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );

  const cyclicArray = [null];
  cyclicArray.push(cyclicArray);
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', rule: { allowed_artifact_tokens: cyclicArray } }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
});

test('Profile Operation Canon Hostile: non-plain and prototype-sensitive shapes fail closed', () => {
  class RuleLike { constructor() { this.op = 'add'; } }

  const nonPlain = [
    ['map', new Map([['op', 'add']])],
    ['set', new Set(['add'])],
    ['class instance', new RuleLike()],
    ['null-prototype object', Object.create(null)],
    ['function', () => ({ op: 'add' })],
    ['undefined', undefined],
    ['bigint', 10n],
    ['date', new Date(0)],
  ];
  for (const [label, value] of nonPlain) {
    assert.throws(
      () => normalizeProfileOperations([value]),
      (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID,
      `non-plain operation "${label}" must be rejected`
    );
  }

  const prototypePolluting = JSON.parse('{"op":"add","__proto__":{"polluted":true}}');
  assert.throws(
    () => normalizeProfileOperations([prototypePolluting]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', constructor: 'forged' }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
  assert.equal({}.polluted, undefined, 'prototype must remain unpolluted');

  const namedArrayEntry = [null];
  namedArrayEntry.smuggled = 'value';
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', rule: { allowed_artifact_tokens: namedArrayEntry } }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
});

test('Profile Operation Canon Hostile: unbounded nesting fails closed', () => {
  let deep = { leaf: null };
  for (let i = 0; i < PROFILE_OPERATION_MAX_DEPTH + 4; i += 1) deep = { nested: deep };
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', rule: deep }]),
    (err) => err.code === PROFILE_OPERATION_CODES.OPERATIONS_INVALID
  );
});

test('Profile Operation Canon Hostile: scalar canonical rules stay with the PC-11 authority', () => {
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', ratio: 1.5 }]),
    (err) => err.code === CANONICAL_CODES.FLOAT_FORBIDDEN
  );
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', at: '2026-08-25T12:00:00Z' }]),
    (err) => err.code === CANONICAL_CODES.TIME_SHAPE_INVALID
  );
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', at: '2026-08-25T12:00:00.00Z' }]),
    (err) => err.code === CANONICAL_CODES.TIME_PRECISION_MISMATCH
  );
  assert.throws(
    () => normalizeProfileOperations([{ op: 'add', amount: '1e3' }]),
    (err) => err.code === CANONICAL_CODES.EXPONENT_IN_DECIMAL_STRING
  );

  const nfcCollision = {};
  Object.defineProperty(nfcCollision, 'é', { value: 1, enumerable: true, writable: true, configurable: true });
  Object.defineProperty(nfcCollision, 'é', { value: 2, enumerable: true, writable: true, configurable: true });
  assert.throws(
    () => normalizeProfileOperations([nfcCollision]),
    (err) => err.code === CANONICAL_CODES.NFC_KEY_COLLISION
  );
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AX_SE_PROJECT_ROLE_ROSTER_PACKET_SCHEMA,
  AX_SE_PROJECT_ROLE_ROSTER_SCHEMA,
  buildAxSeProjectRoleRoster,
} from '../evaluator/ax_se_project_role_roster.mjs';

const MODULE_URL = new URL('../evaluator/ax_se_project_role_roster.mjs', import.meta.url);
const FIXTURE_URL = new URL(
  '../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_role_roster_synthetic_v0.json',
  import.meta.url,
);
const clone = (value) => structuredClone(value);

function exactRef(entityId, revisionId, fill) {
  return {
    entity_id: entityId,
    revision_id: revisionId,
    content_id: `sha256:${fill.repeat(64)}`,
    content_hash_alg: 'sha256',
  };
}

function basePacket() {
  return {
    schema_version: AX_SE_PROJECT_ROLE_ROSTER_PACKET_SCHEMA,
    project_binding_ref: exactRef('synthetic-flight-control-project', 'synthetic-project-r1', '1'),
    role_roster_identity: {
      entity_id: 'synthetic-flight-control-role-roster',
      revision_id: 'synthetic-role-roster-r1',
    },
    capability_vocabulary_ref: exactRef(
      'synthetic-ax-se-capability-vocabulary',
      'synthetic-capability-vocabulary-r1',
      '4',
    ),
    source_revision_refs: [
      exactRef('synthetic-role-policy', 'synthetic-role-policy-r1', '2'),
      exactRef('synthetic-role-register', 'synthetic-role-register-r1', '3'),
    ],
    valid_at: '2026-08-01T00:00:00.000Z',
    known_at: '2026-08-02T00:00:00.000Z',
    coverage_state: 'complete',
    roles: [
      { role_id: 'risk_reviewer', routing_state: 'eligible', capabilities: ['risk_management'] },
      { role_id: 'systems_engineer', routing_state: 'eligible', capabilities: ['systems_engineering'] },
      { role_id: 'verification_reviewer', routing_state: 'eligible', capabilities: ['verification_review'] },
    ],
  };
}

function build(packet = basePacket(), expectedProjectBindingRef = clone(packet.project_binding_ref)) {
  return buildAxSeProjectRoleRoster({ rosterPacket: packet, expectedProjectBindingRef });
}

test('permuted logical roles, capabilities, and sources bind to one deterministic frozen roster', () => {
  const canonicalPacket = basePacket();
  const permutedPacket = clone(canonicalPacket);
  permutedPacket.source_revision_refs.reverse();
  permutedPacket.roles.reverse();
  permutedPacket.roles[0].capabilities = ['verification_review', 'risk_management'];
  canonicalPacket.roles[2].capabilities = ['risk_management', 'verification_review'];

  const canonical = build(canonicalPacket);
  const permuted = build(permutedPacket);

  assert.equal(canonical.schema_version, AX_SE_PROJECT_ROLE_ROSTER_SCHEMA);
  assert.deepEqual(permuted, canonical);
  assert.deepEqual(canonical.roles.map((role) => role.role_id), [
    'risk_reviewer',
    'systems_engineer',
    'verification_reviewer',
  ]);
  assert.deepEqual(canonical.roles[2].capabilities, ['risk_management', 'verification_review']);
  assert.match(canonical.role_roster_ref.content_id, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(canonical), true);
  assert.equal(Object.isFrozen(canonical.roles[0].capabilities), true);
});

function assertRefusedWithout(action, code, forbiddenText) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.doesNotMatch(
      JSON.stringify({ message: error?.message, detail: error?.detail }),
      new RegExp(forbiddenText, 'u'),
    );
    return true;
  });
}

test('the output is exact, caller inputs stay untouched, and every authority remains candidate-only', () => {
  const packet = basePacket();
  const expectedProjectBindingRef = clone(packet.project_binding_ref);
  const before = JSON.stringify({ packet, expectedProjectBindingRef });

  const result = buildAxSeProjectRoleRoster({ rosterPacket: packet, expectedProjectBindingRef });

  assert.equal(JSON.stringify({ packet, expectedProjectBindingRef }), before);
  assert.deepEqual(Object.keys(result), [
    'schema_version', 'project_binding_ref', 'role_roster_ref', 'capability_vocabulary_ref',
    'source_revision_refs', 'valid_at', 'known_at', 'coverage_state',
    'unknown_routing_count', 'exclusivity_supported', 'roles', 'authority',
  ]);
  assert.equal(result.unknown_routing_count, 0);
  assert.equal(result.exclusivity_supported, true);
  assert.deepEqual(result.authority, {
    candidate_only: true,
    roster_approval_claimed: false,
    human_identity_bound: false,
    live_availability_claimed: false,
    assignment_made: false,
    task_intent_created: false,
    erp_write_allowed: false,
    canon_promotion_allowed: false,
  });
  assert.equal(Object.isFrozen(result.project_binding_ref), true);
  assert.equal(Object.isFrozen(result.source_revision_refs), true);
  assert.equal(Object.isFrozen(result.roles[0]), true);
  assert.equal(Object.isFrozen(result.authority), true);
  assert.doesNotMatch(JSON.stringify(result), /"(?:person_id|assignment_id|task_intent_id)"/u);
});

test('the expected project binding must match exactly and mismatch errors do not echo caller refs', () => {
  const packet = basePacket();
  const foreign = clone(packet.project_binding_ref);
  foreign.entity_id = 'foreign-project-echo-marker';
  assertRefusedWithout(
    () => build(packet, foreign),
    'AX_SE_ROLE_ROSTER_PROJECT_BINDING_MISMATCH',
    'foreign-project-echo-marker',
  );

  const sameSubjectOtherBytes = clone(packet.project_binding_ref);
  sameSubjectOtherBytes.content_id = `sha256:${'f'.repeat(64)}`;
  assertRefusedWithout(
    () => build(packet, sameSubjectOtherBytes),
    'AX_SE_ROLE_ROSTER_PROJECT_BINDING_MISMATCH',
    'f{64}',
  );
});

test('source, vocabulary, role, routing, and capability drift each move the roster content hash', () => {
  const baseline = build();
  const digest = (packet) => build(packet).role_roster_ref.content_id;

  const sourceDrift = basePacket();
  sourceDrift.source_revision_refs[0].content_id = `sha256:${'a'.repeat(64)}`;
  const vocabularyDrift = basePacket();
  vocabularyDrift.capability_vocabulary_ref.content_id = `sha256:${'c'.repeat(64)}`;
  const roleDrift = basePacket();
  roleDrift.roles[0].role_id = 'risk_review_lead';
  const routingDrift = basePacket();
  routingDrift.roles[0].routing_state = 'unknown';
  const capabilityDrift = basePacket();
  capabilityDrift.roles[0].capabilities.push('systems_engineering');

  for (const changed of [sourceDrift, vocabularyDrift, roleDrift, routingDrift, capabilityDrift]) {
    assert.notEqual(digest(changed), baseline.role_roster_ref.content_id);
  }
});

test('duplicate sources, logical revisions, roles, and capabilities are rejected rather than deduplicated', () => {
  const duplicateSource = basePacket();
  duplicateSource.source_revision_refs.push(clone(duplicateSource.source_revision_refs[0]));
  assert.throws(
    () => build(duplicateSource),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const contradictorySource = basePacket();
  const contradiction = clone(contradictorySource.source_revision_refs[0]);
  contradiction.content_id = `sha256:${'b'.repeat(64)}`;
  contradictorySource.source_revision_refs.push(contradiction);
  assert.throws(
    () => build(contradictorySource),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const duplicateRole = basePacket();
  duplicateRole.roles.push(clone(duplicateRole.roles[0]));
  assert.throws(
    () => build(duplicateRole),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const duplicateCapability = basePacket();
  duplicateCapability.roles[0].capabilities.push('risk_management');
  assert.throws(
    () => build(duplicateCapability),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );
});

test('malformed refs, schemas, states, and chronology fail closed', () => {
  const malformedRef = basePacket();
  malformedRef.source_revision_refs[0].content_id = 'sha256:short';
  assert.throws(
    () => build(malformedRef),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_REFERENCE_INVALID',
  );

  const wrongSchema = basePacket();
  wrongSchema.schema_version = 'soulforge.ax_se_project_role_roster_packet.v9';
  assert.throws(
    () => build(wrongSchema),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const malformedTime = basePacket();
  malformedTime.known_at = '2026-08-02T00:00:00Z';
  assert.throws(
    () => build(malformedTime),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const reversedTime = basePacket();
  reversedTime.known_at = '2026-07-31T23:59:59.999Z';
  assert.throws(
    () => build(reversedTime),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const badCoverage = basePacket();
  badCoverage.coverage_state = 'approved';
  assert.throws(
    () => build(badCoverage),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const badRouting = basePacket();
  badRouting.roles[0].routing_state = 'assigned';
  assert.throws(
    () => build(badRouting),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );
});

test('closed fields and declared source, role, and capability bounds are enforced', () => {
  const extraPacketField = basePacket();
  extraPacketField.note = 'synthetic-note';
  assert.throws(
    () => build(extraPacketField),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const extraRoleField = basePacket();
  extraRoleField.roles[0].availability_state = 'available';
  assert.throws(
    () => build(extraRoleField),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_INVALID',
  );

  const emptySources = basePacket();
  emptySources.source_revision_refs = [];
  assert.throws(() => build(emptySources), (error) => /^AX_SE_ROLE_ROSTER_INPUT_/u.test(error?.code));

  const tooManySources = basePacket();
  tooManySources.source_revision_refs = Array.from({ length: 33 }, (_, index) => (
    exactRef(`synthetic-source-${index}`, `synthetic-source-r${index}`, (index % 10).toString())
  ));
  assert.throws(() => build(tooManySources), (error) => /^AX_SE_ROLE_ROSTER_INPUT_/u.test(error?.code));

  const emptyRoles = basePacket();
  emptyRoles.roles = [];
  assert.throws(() => build(emptyRoles), (error) => /^AX_SE_ROLE_ROSTER_INPUT_/u.test(error?.code));

  const tooManyRoles = basePacket();
  tooManyRoles.roles = Array.from({ length: 129 }, (_, index) => ({
    role_id: `synthetic_role_${String(index).padStart(3, '0')}`,
    routing_state: 'ineligible',
    capabilities: ['systems_engineering'],
  }));
  assert.throws(() => build(tooManyRoles), (error) => /^AX_SE_ROLE_ROSTER_INPUT_/u.test(error?.code));

  const emptyCapabilities = basePacket();
  emptyCapabilities.roles[0].capabilities = [];
  assert.throws(() => build(emptyCapabilities), (error) => /^AX_SE_ROLE_ROSTER_INPUT_/u.test(error?.code));

  const tooManyCapabilities = basePacket();
  tooManyCapabilities.roles[0].capabilities = Array.from(
    { length: 65 },
    (_, index) => `capability_${String(index).padStart(2, '0')}`,
  );
  assert.throws(() => build(tooManyCapabilities), (error) => /^AX_SE_ROLE_ROSTER_INPUT_/u.test(error?.code));
});

test('partial and unknown coverage remain explicit and never gain approval or assignment authority', () => {
  for (const coverageState of ['partial', 'unknown']) {
    const packet = basePacket();
    packet.coverage_state = coverageState;

    const result = build(packet);

    assert.equal(result.coverage_state, coverageState);
    assert.equal(result.authority.roster_approval_claimed, false);
    assert.equal(result.authority.assignment_made, false);
    assert.equal(result.authority.live_availability_claimed, false);
    assert.equal(result.exclusivity_supported, false);
  }
});

test('complete coverage supports exclusivity only when no role has unknown routing', () => {
  const known = build();
  assert.equal(known.coverage_state, 'complete');
  assert.equal(known.unknown_routing_count, 0);
  assert.equal(known.exclusivity_supported, true);

  const unresolvedPacket = basePacket();
  unresolvedPacket.roles[1].routing_state = 'unknown';
  const unresolved = build(unresolvedPacket);
  assert.equal(unresolved.roles[1].routing_state, 'unknown');
  assert.equal(unresolved.unknown_routing_count, 1);
  assert.equal(unresolved.exclusivity_supported, false);
});

test('proxies are rejected before traps and accessors are rejected without invocation', () => {
  let requestTraps = 0;
  const request = new Proxy({
    rosterPacket: basePacket(),
    expectedProjectBindingRef: clone(basePacket().project_binding_ref),
  }, {
    get(target, key, receiver) { requestTraps += 1; return Reflect.get(target, key, receiver); },
    ownKeys(target) { requestTraps += 1; return Reflect.ownKeys(target); },
  });
  assert.throws(
    () => buildAxSeProjectRoleRoster(request),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
  );
  assert.equal(requestTraps, 0);

  let packetTraps = 0;
  const packet = new Proxy(basePacket(), {
    ownKeys(target) { packetTraps += 1; return Reflect.ownKeys(target); },
  });
  assert.throws(
    () => buildAxSeProjectRoleRoster({
      rosterPacket: packet,
      expectedProjectBindingRef: clone(basePacket().project_binding_ref),
    }),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
  );
  assert.equal(packetTraps, 0);

  let getterCalls = 0;
  const accessor = basePacket();
  Object.defineProperty(accessor.roles[0], 'surprise', {
    enumerable: true,
    get() { getterCalls += 1; return 'accessor-echo-marker'; },
  });
  assertRefusedWithout(
    () => build(accessor),
    'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
    'accessor-echo-marker',
  );
  assert.equal(getterCalls, 0);
});

test('custom prototypes, aliases, cycles, sparse arrays, and named arrays are refused', () => {
  const customPrototype = basePacket();
  Object.setPrototypeOf(customPrototype.roles[0], { inherited: true });
  assert.throws(
    () => build(customPrototype),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
  );

  const alias = basePacket();
  alias.roles[1].capabilities = alias.roles[0].capabilities;
  assert.throws(
    () => build(alias),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
  );

  const cycle = basePacket();
  cycle.roles[0].self = cycle.roles[0];
  assert.throws(
    () => build(cycle),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
  );

  const sparse = basePacket();
  sparse.roles = new Array(3);
  assert.throws(
    () => build(sparse),
    (error) => error?.code === 'AX_SE_ROLE_ROSTER_INPUT_UNBOUNDED',
  );

  const named = basePacket();
  named.roles.extra = 'named-array-echo-marker';
  assertRefusedWithout(
    () => build(named),
    'AX_SE_ROLE_ROSTER_INPUT_UNBOUNDED',
    'named-array-echo-marker',
  );
});

test('raw fields, embedded local paths, and secret-shaped strings fail without echo', () => {
  const rawField = basePacket();
  rawField.roles[0].raw = 'raw-payload-echo-marker';
  assertRefusedWithout(
    () => build(rawField),
    'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
    'raw-payload-echo-marker',
  );

  const windowsPath = `${'D'}${':'}${'\\'}private${'\\'}role-roster-echo-marker.json`;
  const embeddedPath = basePacket();
  embeddedPath.project_binding_ref.entity_id = `stored at ${windowsPath}`;
  assertRefusedWithout(
    () => build(embeddedPath),
    'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
    'role-roster-echo-marker',
  );

  const secretShape = basePacket();
  secretShape.role_roster_identity.entity_id = 'api_key=secret-echo-marker';
  assertRefusedWithout(
    () => build(secretShape),
    'AX_SE_ROLE_ROSTER_INPUT_UNSAFE',
    'secret-echo-marker',
  );
});

test('the subject imports no capability-bearing adapters and produces no side effects', () => {
  const source = readFileSync(fileURLToPath(MODULE_URL), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|http|https|net|child_process)/u);
  assert.doesNotMatch(source, /(?:fetch\s*\(|ollama|composeAnswer|dev-erp|taskdriver|assignment_made\s*:\s*true)/iu);
  assert.doesNotMatch(source, /(?:writeFile|appendFile|mkdir|unlink|rename)\s*\(/u);
});

test('the public synthetic fixture binds the three current logical capability roles', () => {
  const packet = JSON.parse(readFileSync(fileURLToPath(FIXTURE_URL), 'utf8'));

  const result = build(packet, clone(packet.project_binding_ref));

  assert.deepEqual(result.roles, [
    { role_id: 'risk_reviewer', routing_state: 'eligible', capabilities: ['risk_management'] },
    { role_id: 'systems_engineer', routing_state: 'eligible', capabilities: ['systems_engineering'] },
    { role_id: 'verification_reviewer', routing_state: 'eligible', capabilities: ['verification_review'] },
  ]);
  assert.equal(result.unknown_routing_count, 0);
  assert.equal(result.exclusivity_supported, true);
});

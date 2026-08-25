import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AX_SE_PROJECT_ROLE_BOUND_ASSESSMENT_SCHEMA,
  AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA,
  assessAxSeRoleBoundProject,
} from '../evaluator/ax_se_project_role_bound_assessment.mjs';

import { buildAxSeProjectRoleRoster } from '../evaluator/ax_se_project_role_roster.mjs';
import {
  assessAxSeProject,
  buildAxSeAssessmentInput,
} from '../evaluator/ax_se_project_assessment.mjs';
import { candidateHandle, isCandidateHandle } from '../../../core/validators/minting.mjs';

const ASSESSMENT_FIXTURE_URL = new URL(
  '../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_assessment_synthetic_v0.json',
  import.meta.url,
);
const ASSESSMENT_FIXTURE = JSON.parse(readFileSync(ASSESSMENT_FIXTURE_URL, 'utf8'));
const MODULE_URL = new URL('../evaluator/ax_se_project_role_bound_assessment.mjs', import.meta.url);
const ROLE_BOUND_FIXTURE_URL = new URL(
  '../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_role_bound_assessment_synthetic_v1.json',
  import.meta.url,
);
const clone = (value) => structuredClone(value);

function contextPacket(input) {
  return {
    schema_version: 'soulforge.ax_se_project_context_packet.v0',
    project_binding_ref: clone(input.project_binding_ref),
    objective_ref: clone(input.objective_ref),
    policy_ref: clone(input.policy.policy_ref),
    project_snapshot_identity: {
      entity_id: input.snapshot.project_snapshot_ref.entity_id,
      revision_id: input.snapshot.project_snapshot_ref.revision_id,
    },
    observations: clone(input.snapshot.observations),
    risks: clone(input.snapshot.risks),
  };
}

function rosterPacket(projectBindingRef = ASSESSMENT_FIXTURE.input.project_binding_ref) {
  return {
    schema_version: 'soulforge.ax_se_project_role_roster_packet.v0',
    project_binding_ref: clone(projectBindingRef),
    role_roster_identity: {
      entity_id: 'synthetic-flight-control-role-roster-v1',
      revision_id: 'synthetic-role-roster-v1-r1',
    },
    capability_vocabulary_ref: {
      entity_id: 'synthetic-ax-se-capability-vocabulary',
      revision_id: 'synthetic-capability-vocabulary-r1',
      content_id: `sha256:${'4'.repeat(64)}`,
      content_hash_alg: 'sha256',
    },
    source_revision_refs: [
      {
        entity_id: 'synthetic-role-policy',
        revision_id: 'synthetic-role-policy-r1',
        content_id: `sha256:${'2'.repeat(64)}`,
        content_hash_alg: 'sha256',
      },
      {
        entity_id: 'synthetic-role-register',
        revision_id: 'synthetic-role-register-r1',
        content_id: `sha256:${'3'.repeat(64)}`,
        content_hash_alg: 'sha256',
      },
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

function packet() {
  const input = clone(ASSESSMENT_FIXTURE.input);
  return {
    schema_version: AX_SE_PROJECT_ROLE_BOUND_PACKET_SCHEMA,
    context_packet: contextPacket(input),
    expected_project_binding_ref: clone(input.project_binding_ref),
    policy: clone(input.policy),
    role_roster_packet: rosterPacket(input.project_binding_ref),
    policy_capability_vocabulary_ref: clone(
      rosterPacket(input.project_binding_ref).capability_vocabulary_ref,
    ),
  };
}

function expectedRosterRef(roleBoundPacket) {
  return clone(buildAxSeProjectRoleRoster({
    rosterPacket: roleBoundPacket.role_roster_packet,
    expectedProjectBindingRef: roleBoundPacket.expected_project_binding_ref,
  }).role_roster_ref);
}

function assess(roleBoundPacket = packet(), expectedRoleRosterRef = expectedRosterRef(roleBoundPacket)) {
  return assessAxSeRoleBoundProject(roleBoundPacket, expectedRoleRosterRef);
}

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

function roleDecision(result, subjectId) {
  return result.next_mission_candidates.find((row) => row.subject_id === subjectId).role_decision;
}

test('a complete exact logical roster yields bounded v1 mission role candidates', () => {
  const result = assess();

  assert.equal(result.schema_version, AX_SE_PROJECT_ROLE_BOUND_ASSESSMENT_SCHEMA);
  assert.equal(result.current_stage.stage_code, '030_SRR');
  assert.deepEqual(
    result.next_mission_candidates.map((row) => row.role_decision),
    [
      {
        state: 'CANDIDATE',
        reason_code: 'unique_logical_role_candidate',
        required_capability: 'risk_management',
        role_id: 'risk_reviewer',
      },
      {
        state: 'CANDIDATE',
        reason_code: 'unique_logical_role_candidate',
        required_capability: 'verification_review',
        role_id: 'verification_reviewer',
      },
    ],
  );
  assert.equal(result.next_mission_candidates.every((row) => !Object.hasOwn(row, 'role_candidate')), true);
});

test('a Proxy is rejected before any trap is allowed to observe the role-bound packet', () => {
  let traps = 0;
  const proxy = new Proxy(packet(), {
    get(target, key, receiver) {
      traps += 1;
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target) {
      traps += 1;
      return Reflect.ownKeys(target);
    },
  });

  assert.throws(
    () => assessAxSeRoleBoundProject(proxy, expectedRosterRef(packet())),
    (error) => error?.code === 'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
  );
  assert.equal(traps, 0);
});

test('v1 rebuilds assessment, issue, and mission handles without exposing v0 role placeholders', () => {
  const roleBoundPacket = packet();
  const result = assess(roleBoundPacket);
  const v0 = assessAxSeProject(buildAxSeAssessmentInput({
    contextPacket: roleBoundPacket.context_packet,
    expectedProjectBindingRef: roleBoundPacket.expected_project_binding_ref,
    policy: roleBoundPacket.policy,
    roles: roleBoundPacket.role_roster_packet.roles.map((role) => ({
      role_id: role.role_id,
      availability_state: role.routing_state === 'eligible' ? 'available' : 'unavailable',
      capabilities: clone(role.capabilities),
    })),
  }));

  assert.notEqual(result.assessment_handle, v0.assessment_handle);
  assert.notEqual(result.issues[0].issue_handle, v0.issues[0].issue_handle);
  assert.notEqual(
    result.next_mission_candidates[0].mission_candidate_handle,
    v0.next_mission_candidates[0].mission_candidate_handle,
  );
  assert.doesNotMatch(JSON.stringify(result.next_mission_candidates), /"role_candidate":/u);

  const v1Issues = new Map(result.issues.map((issue) => [issue.issue_handle, issue]));
  const v0Handles = new Set(v0.issues.map((issue) => issue.issue_handle));
  assert.equal(v1Issues.size, result.issues.length);
  for (const mission of result.next_mission_candidates) {
    const joined = v1Issues.get(mission.issue_handle);
    assert.notEqual(joined, undefined);
    assert.equal(v0Handles.has(mission.issue_handle), false);
    assert.equal(joined.subject_id, mission.subject_id);
    assert.equal(joined.stage_code, mission.stage_code);
  }
});

test('the separately supplied full roster ref is exact and mismatch errors never echo it', () => {
  const roleBoundPacket = packet();
  const baseline = expectedRosterRef(roleBoundPacket);
  const mutations = [
    ['entity_id', 'foreign-roster-entity-echo-marker', 'foreign-roster-entity-echo-marker'],
    ['revision_id', 'foreign-roster-revision-echo-marker', 'foreign-roster-revision-echo-marker'],
    ['content_id', `sha256:${'f'.repeat(64)}`, 'f{64}'],
  ];
  for (const [field, value, forbidden] of mutations) {
    const changed = clone(baseline);
    changed[field] = value;
    assertRefusedWithout(
      () => assessAxSeRoleBoundProject(roleBoundPacket, changed),
      'AX_SE_ROLE_BOUND_ROSTER_BINDING_MISMATCH',
      forbidden,
    );
  }

  const badAlgorithm = clone(baseline);
  badAlgorithm.content_hash_alg = 'sha512';
  assert.throws(
    () => assessAxSeRoleBoundProject(roleBoundPacket, badAlgorithm),
    (error) => error?.code === 'AX_SE_ROLE_BOUND_REFERENCE_INVALID',
  );
});

test('the closed packet refuses an embedded expected roster ref and caller-supplied roles', () => {
  for (const extra of ['expected_role_roster_ref', 'roles']) {
    const roleBoundPacket = packet();
    roleBoundPacket[extra] = extra === 'roles' ? [] : expectedRosterRef(roleBoundPacket);
    assert.throws(
      () => assessAxSeRoleBoundProject(roleBoundPacket, expectedRosterRef(packet())),
      (error) => error?.code === 'AX_SE_ROLE_BOUND_INPUT_INVALID',
    );
  }
});

test('the policy and roster must declare the same exact capability vocabulary ref', () => {
  const roleBoundPacket = packet();
  roleBoundPacket.policy_capability_vocabulary_ref.content_id = `sha256:${'d'.repeat(64)}`;
  assertRefusedWithout(
    () => assessAxSeRoleBoundProject(roleBoundPacket, expectedRosterRef(roleBoundPacket)),
    'AX_SE_ROLE_BOUND_CAPABILITY_VOCABULARY_MISMATCH',
    'd{64}',
  );
});

test('complete coverage distinguishes unique, zero, and ambiguous logical role matches', () => {
  const unique = assess();
  assert.equal(roleDecision(unique, 'srr_review_actions_closed').state, 'CANDIDATE');

  const zeroPacket = packet();
  zeroPacket.role_roster_packet.roles.find(
    (role) => role.role_id === 'verification_reviewer',
  ).routing_state = 'ineligible';
  assert.deepEqual(roleDecision(assess(zeroPacket), 'srr_review_actions_closed'), {
    state: 'HOLD',
    reason_code: 'capability_unmapped',
    required_capability: 'verification_review',
  });

  const ambiguousPacket = packet();
  ambiguousPacket.role_roster_packet.roles.push({
    role_id: 'verification_reviewer_backup',
    routing_state: 'eligible',
    capabilities: ['verification_review'],
  });
  assert.deepEqual(roleDecision(assess(ambiguousPacket), 'srr_review_actions_closed'), {
    state: 'HOLD',
    reason_code: 'capability_ambiguous',
    required_capability: 'verification_review',
    eligible_role_ids: ['verification_reviewer', 'verification_reviewer_backup'],
  });
});

test('partial, unknown, and unknown-routing rosters preserve stage gaps but hold every role decision', () => {
  const baseline = assess();
  const cases = [
    ['partial', null, 'roster_coverage_partial'],
    ['unknown', null, 'roster_coverage_unknown'],
    ['complete', 'systems_engineer', 'roster_routing_unknown'],
  ];
  for (const [coverage, unknownRoleId, reason] of cases) {
    const changed = packet();
    changed.role_roster_packet.coverage_state = coverage;
    if (unknownRoleId) {
      changed.role_roster_packet.roles.find((role) => role.role_id === unknownRoleId).routing_state = 'unknown';
    }
    const result = assess(changed);
    assert.deepEqual(result.current_stage, baseline.current_stage);
    assert.deepEqual(result.issues, baseline.issues);
    assert.equal(result.next_mission_candidates.every(
      (mission) => mission.role_decision.state === 'HOLD'
        && mission.role_decision.reason_code === reason,
    ), true);
    assert.equal(result.resolution.role_routing_state, 'HOLD');
    assert.equal(result.resolution.overall_state, 'HOLD');
    assert.equal(result.assessment_state, 'HOLD');
  }
});

test('an issue-free stage remains visible but an incomplete roster holds the overall result', () => {
  const satisfied = packet();
  const review = satisfied.context_packet.observations.find(
    (row) => row.requirement_id === 'srr_review_actions_closed',
  );
  review.presence_state = 'present';
  satisfied.context_packet.risks[0].state = 'closed';
  const functional = clone(satisfied.context_packet.observations[0]);
  functional.requirement_id = 'sfr_functional_baseline';
  functional.observation_attempt_ref = 'observation:synthetic:sfr-functional-baseline';
  functional.artifact_revision_ref.entity_id = 'synthetic-sfr-functional-artifact';
  functional.evidence_refs[0].entity_id = 'synthetic-sfr-functional-evidence';
  satisfied.context_packet.observations.push(functional);

  const complete = assess(satisfied);
  assert.equal(complete.resolution.stage_gap_state, 'READY_FOR_OWNER_REVIEW');
  assert.equal(complete.resolution.role_routing_state, 'NOT_REQUIRED');
  assert.equal(complete.resolution.overall_state, 'READY_FOR_OWNER_REVIEW');

  satisfied.role_roster_packet.coverage_state = 'partial';
  const partial = assess(satisfied);
  assert.equal(partial.current_stage.floor_status, 'active');
  assert.equal(partial.resolution.stage_gap_state, 'READY_FOR_OWNER_REVIEW');
  assert.equal(partial.resolution.role_routing_state, 'HOLD');
  assert.equal(partial.resolution.overall_state, 'HOLD');
  assert.equal(partial.assessment_state, 'HOLD');
  assert.equal(Object.hasOwn(partial.current_stage, 'assessment_resolution'), false);
});

test('a known role-routing HOLD wins overall while stage-gap UNKNOWN stays visible on its own axis', () => {
  const changed = packet();
  changed.context_packet.observations = changed.context_packet.observations.filter(
    (row) => row.requirement_id !== 'srr_review_actions_closed',
  );
  changed.role_roster_packet.coverage_state = 'partial';

  const result = assess(changed);

  assert.equal(result.resolution.stage_gap_state, 'UNKNOWN');
  assert.equal(result.resolution.role_routing_state, 'HOLD');
  assert.equal(result.resolution.overall_state, 'HOLD');
  assert.equal(result.assessment_state, 'HOLD');
  assert.equal(Object.hasOwn(result.current_stage, 'assessment_resolution'), false);
});

test('roster source, vocabulary, and routing drift each move the role-bound fingerprint', () => {
  const baseline = assess();
  const changedPackets = [packet(), packet(), packet()];
  changedPackets[0].role_roster_packet.source_revision_refs[0].content_id = `sha256:${'a'.repeat(64)}`;
  changedPackets[1].role_roster_packet.capability_vocabulary_ref.content_id = `sha256:${'c'.repeat(64)}`;
  changedPackets[1].policy_capability_vocabulary_ref.content_id = `sha256:${'c'.repeat(64)}`;
  changedPackets[2].role_roster_packet.roles[0].routing_state = 'ineligible';

  for (const changed of changedPackets) {
    const result = assess(changed);
    assert.notEqual(result.input_fingerprint_sha256, baseline.input_fingerprint_sha256);
    assert.notEqual(result.assessment_handle, baseline.assessment_handle);
  }
});

test('role decisions are explicitly scoped to emitted missions when issue selection truncates', () => {
  const changed = packet();
  const template = changed.context_packet.risks[0];
  for (const suffix of ['extra-a', 'extra-b']) {
    const extra = clone(template);
    extra.risk_id = `risk:synthetic:${suffix}`;
    extra.risk_ref.entity_id = `synthetic-${suffix}-risk`;
    extra.risk_ref.revision_id = `synthetic-${suffix}-risk-r1`;
    extra.evidence_refs[0].entity_id = `synthetic-${suffix}-risk-evidence`;
    extra.evidence_refs[0].revision_id = `synthetic-${suffix}-risk-evidence-r1`;
    changed.context_packet.risks.push(extra);
  }

  const result = assess(changed);
  const routed = new Set(result.next_mission_candidates.map((mission) => mission.issue_handle));

  assert.equal(result.candidate_truncation.eligible_count, 4);
  assert.equal(result.candidate_truncation.emitted_count, 3);
  assert.equal(result.candidate_truncation.omitted_count, 1);
  assert.equal(result.resolution.role_decisions_scope, 'emitted_mission_candidates_only');
  assert.equal(result.issues.filter((issue) => !routed.has(issue.issue_handle)).length, 1);
  assert.equal(result.resolution.overall_state, 'HOLD');
});

test('capability routing uses only exact token equality and claims no vocabulary membership validation', () => {
  const changed = packet();
  changed.role_roster_packet.roles.find(
    (role) => role.role_id === 'verification_reviewer',
  ).capabilities = ['verification_review_v2'];

  const result = assess(changed);

  assert.equal(result.role_roster_binding.vocabulary_membership_validated, false);
  assert.deepEqual(roleDecision(result, 'srr_review_actions_closed'), {
    state: 'HOLD',
    reason_code: 'capability_unmapped',
    required_capability: 'verification_review',
  });
});

test('unordered packet arrays normalize deterministically while caller values remain untouched', () => {
  const canonicalPacket = packet();
  const permuted = clone(canonicalPacket);
  permuted.context_packet.observations.reverse();
  permuted.context_packet.risks.reverse();
  permuted.role_roster_packet.roles.reverse();
  permuted.role_roster_packet.source_revision_refs.reverse();
  const before = JSON.stringify({ canonicalPacket, permuted });

  const canonicalResult = assess(canonicalPacket);
  const permutedResult = assess(permuted);

  assert.deepEqual(permutedResult, canonicalResult);
  assert.equal(JSON.stringify({ canonicalPacket, permuted }), before);
});

test('the output is deeply frozen and every authority, gate, and effect remains inert', () => {
  const result = assess();

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.role_roster_binding.role_roster_ref), true);
  assert.equal(Object.isFrozen(result.issues[0]), true);
  assert.equal(Object.isFrozen(result.next_mission_candidates[0].role_decision), true);
  assert.deepEqual(result.authority, {
    candidate_only: true,
    roster_approval_claimed: false,
    human_identity_bound: false,
    live_availability_claimed: false,
    assignment_made: false,
    stage_cleared: false,
    owner_decision_made: false,
    person_assigned: false,
    task_intent_created: false,
  });
  assert.deepEqual(result.gates, {
    stage_clear_allowed: false,
    taskdriver_activation_allowed: false,
    erp_write_allowed: false,
    canon_promotion_allowed: false,
  });
  assert.deepEqual(result.effects, {
    erp_writes: 0,
    filesystem_writes: 0,
    model_calls: 0,
    network_calls: 0,
    taskdriver_activated: false,
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /"(?:person_id|assignment_id|task_intent_id|human_identity|live_availability)":/u,
  );
});

test('every emitted handle is content-derived and the assessment handle binds the v1 fingerprint', () => {
  const result = assess();
  const handles = [
    result.assessment_handle,
    ...result.issues.map((issue) => issue.issue_handle),
    ...result.next_mission_candidates.map((mission) => mission.mission_candidate_handle),
  ];

  assert.match(result.input_fingerprint_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.assessment_handle, candidateHandle(result.input_fingerprint_sha256));
  assert.equal(handles.every(isCandidateHandle), true);
});

test('accessors, aliases, cycles, custom prototypes, sparse arrays, and named arrays are refused', () => {
  let getterCalls = 0;
  const accessor = packet();
  Object.defineProperty(accessor.policy, 'surprise', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'accessor-echo-marker';
    },
  });
  assertRefusedWithout(
    () => assessAxSeRoleBoundProject(accessor, expectedRosterRef(packet())),
    'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
    'accessor-echo-marker',
  );
  assert.equal(getterCalls, 0);

  const alias = packet();
  alias.role_roster_packet.project_binding_ref = alias.expected_project_binding_ref;
  assert.throws(
    () => assessAxSeRoleBoundProject(alias, expectedRosterRef(packet())),
    (error) => error?.code === 'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
  );

  const cycle = packet();
  cycle.context_packet.self = cycle.context_packet;
  assert.throws(
    () => assessAxSeRoleBoundProject(cycle, expectedRosterRef(packet())),
    (error) => error?.code === 'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
  );

  const customPrototype = packet();
  Object.setPrototypeOf(customPrototype.role_roster_packet, { inherited: true });
  assert.throws(
    () => assessAxSeRoleBoundProject(customPrototype, expectedRosterRef(packet())),
    (error) => error?.code === 'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
  );

  const sparse = packet();
  sparse.context_packet.observations = new Array(2);
  assert.throws(
    () => assessAxSeRoleBoundProject(sparse, expectedRosterRef(packet())),
    (error) => error?.code === 'AX_SE_ROLE_BOUND_INPUT_UNBOUNDED',
  );

  const named = packet();
  named.context_packet.observations.extra = 'named-array-echo-marker';
  assertRefusedWithout(
    () => assessAxSeRoleBoundProject(named, expectedRosterRef(packet())),
    'AX_SE_ROLE_BOUND_INPUT_UNBOUNDED',
    'named-array-echo-marker',
  );
});

test('payload keys, local paths, and secret-shaped strings fail closed without echo', () => {
  const raw = packet();
  raw.context_packet.raw = 'raw-role-bound-echo-marker';
  assertRefusedWithout(
    () => assessAxSeRoleBoundProject(raw, expectedRosterRef(packet())),
    'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
    'raw-role-bound-echo-marker',
  );

  const localPath = packet();
  localPath.role_roster_packet.role_roster_identity.entity_id = [
    'stored at D:', '\\private\\roster-echo-marker.json',
  ].join('');
  assertRefusedWithout(
    () => assessAxSeRoleBoundProject(localPath, expectedRosterRef(packet())),
    'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
    'roster-echo-marker',
  );

  const secret = packet();
  secret.role_roster_packet.role_roster_identity.entity_id = 'api_key=role-bound-secret-echo-marker';
  assertRefusedWithout(
    () => assessAxSeRoleBoundProject(secret, expectedRosterRef(packet())),
    'AX_SE_ROLE_BOUND_INPUT_UNSAFE',
    'role-bound-secret-echo-marker',
  );
});

test('a roster bound to another exact project is refused without echoing either project ref', () => {
  const changed = packet();
  changed.role_roster_packet.project_binding_ref.entity_id = 'foreign-roster-project-echo-marker';
  assertRefusedWithout(
    () => assessAxSeRoleBoundProject(changed, expectedRosterRef(packet())),
    'AX_SE_ROLE_ROSTER_PROJECT_BINDING_MISMATCH',
    'foreign-roster-project-echo-marker',
  );
});

test('the pure subject imports no execution adapter and preserves accepted v0 bytes exactly', () => {
  const source = readFileSync(MODULE_URL, 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|http|https|net|child_process)/u);
  assert.doesNotMatch(
    source,
    /(?:fetch\s*\(|ollama|composeAnswer|from\s+['"][^'"]*(?:dev-erp|taskdriver)|assignment_made\s*:\s*true)/iu,
  );
  assert.doesNotMatch(source, /(?:writeFile|appendFile|mkdir|unlink|rename)\s*\(/u);

  const digest = (url) => createHash('sha256').update(readFileSync(url)).digest('hex');
  assert.equal(
    digest(new URL('../evaluator/ax_se_project_assessment.mjs', import.meta.url)),
    '31a885b6037192021b46be9eabd4023e76042f7dbaa4f49e956e7a4026d94046',
  );
  assert.equal(
    digest(new URL('../tools/ax_se_project_assessment_runner.mjs', import.meta.url)),
    'f45ca9447d8ab8e6595cb48d12ed2f3bb225af789242891344ff2eead92f32f4',
  );
  assert.equal(
    digest(new URL('../evaluator/ax_se_project_role_roster.mjs', import.meta.url)),
    '6e7ca23148c122b9480cbab2b30e94133fcebf02a5bb0056be40da4363603284',
  );
});

test('the public v1 fixture is directly roster-bound and evaluates without test-time repair', () => {
  const fixture = JSON.parse(readFileSync(ROLE_BOUND_FIXTURE_URL, 'utf8'));
  const builtRosterRef = expectedRosterRef(fixture.packet);

  assert.deepEqual(builtRosterRef, fixture.expected_role_roster_ref);
  const result = assessAxSeRoleBoundProject(fixture.packet, fixture.expected_role_roster_ref);
  assert.equal(result.assessment_state, fixture.expected.assessment_state);
  assert.equal(result.current_stage.stage_code, fixture.expected.current_stage_code);
  assert.deepEqual(
    result.next_mission_candidates.map((mission) => mission.mission_kind),
    fixture.expected.mission_kinds,
  );
  assert.deepEqual(
    result.next_mission_candidates.map((mission) => mission.role_decision.role_id),
    fixture.expected.role_ids,
  );
});

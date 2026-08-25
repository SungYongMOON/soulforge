import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { canonicalise, compareCodePoints } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';
import {
  AX_SE_ASSESSMENT_SCHEMA,
  AX_SE_INPUT_SCHEMA,
  AX_SE_POLICY_REVISION,
  AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA,
  assessAxSeProject,
  buildAxSeAssessmentInput,
} from '../evaluator/ax_se_project_assessment.mjs';

const FIXTURE_URL = new URL('../../../../../docs/architecture/workspace/examples/ax_se_project_assessment/ax_se_project_assessment_synthetic_v0.json', import.meta.url);
const MODULE_URL = new URL('../evaluator/ax_se_project_assessment.mjs', import.meta.url);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));
const clone = (value) => structuredClone(value);

function canonicalDigest(domain, value) {
  const rules = {};
  const visit = (row, path = '') => {
    if (Array.isArray(row)) {
      rules[path] = 'insertion_ordered';
      row.forEach((child) => visit(child, `${path}[]`));
      return;
    }
    if (row !== null && typeof row === 'object') {
      Object.entries(row).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
    }
  };
  visit(value);
  return sha256Hex(`${domain}\n${canonicalise(value, rules)}`);
}

function rebind(input) {
  const policyMaterial = {
    schema_version: input.policy.schema_version,
    policy_revision: input.policy_revision,
    stages: input.policy.stages,
  };
  input.policy.policy_ref.content_id = `sha256:${canonicalDigest(AX_SE_POLICY_REVISION, policyMaterial)}`;
  input.snapshot.policy_ref = clone(input.policy.policy_ref);
  const snapshotMaterial = {
    schema_version: input.snapshot.schema_version,
    policy_ref: input.snapshot.policy_ref,
    observations: input.snapshot.observations,
    risks: input.snapshot.risks,
  };
  input.snapshot.project_snapshot_ref.content_id = `sha256:${canonicalDigest('soulforge.ax_se_project_snapshot.v0', snapshotMaterial)}`;
  return input;
}

const baseInput = () => clone(FIXTURE.input);
const exactRef = (id, fill) => ({
  entity_id: id,
  revision_id: `${id}-r1`,
  content_id: `sha256:${fill.repeat(64)}`,
  content_hash_alg: 'sha256',
});
const evidence = exactRef;

function observation(input, requirementId) {
  return input.snapshot.observations.find((row) => row.requirement_id === requirementId);
}

function requirement(input, requirementId) {
  return input.policy.stages
    .flatMap((stage) => stage.requirements)
    .find((row) => row.requirement_id === requirementId);
}

function closeFixtureRisk(input) {
  input.snapshot.risks[0].state = 'closed';
}

function assertFailureWithout(action, code, forbiddenText) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.doesNotMatch(JSON.stringify({ message: error?.message, detail: error?.detail }), new RegExp(forbiddenText, 'u'));
    return true;
  });
}

function sourceClaim({ claimId, authorityFamily, sourceId, fill, assertedValue }) {
  return {
    claim_id: claimId,
    authority_family: authorityFamily,
    source_revision_ref: exactRef(sourceId, fill),
    lineage_ref: `lineage:${sourceId}`,
    applicability: true,
    asserted_value: assertedValue,
    valid_at: '2026-08-01T00:00:00.000Z',
    known_at: '2026-08-02T00:00:00.000Z',
  };
}

test('public synthetic vertical returns a bounded stage and two evidence-bound mission candidates', () => {
  const input = baseInput();
  const before = JSON.stringify(input);
  const result = assessAxSeProject(input);

  assert.equal(result.schema_version, AX_SE_ASSESSMENT_SCHEMA);
  assert.equal(AX_SE_INPUT_SCHEMA, FIXTURE.input.schema_version);
  assert.equal(result.policy_revision, AX_SE_POLICY_REVISION);
  assert.equal(result.assessment_state, FIXTURE.expected.assessment_state);
  assert.equal(result.current_stage.stage_code, FIXTURE.expected.current_stage_code);
  assert.equal(result.current_stage.floor_status, FIXTURE.expected.floor_status);
  assert.deepEqual(result.current_stage.requirement_counts, {
    conflict: 0,
    missing: 1,
    not_applicable: 0,
    satisfied: 1,
    unknown: 0,
  });
  assert.deepEqual(
    result.next_mission_candidates.map((row) => row.mission_kind),
    FIXTURE.expected.mission_kinds,
  );
  assert.deepEqual(
    result.next_mission_candidates.map((row) => row.role_candidate.role_id),
    FIXTURE.expected.role_ids,
  );
  assert.equal(result.next_mission_candidates.length, 2);
  assert.equal(result.next_mission_candidates.every((row) => row.candidate_only === true), true);
  assert.equal(result.next_mission_candidates.every((row) => row.task_intent_created === false), true);
  assert.equal(result.next_mission_candidates.every((row) => row.done_conditions.length > 0), true);
  assert.equal(result.next_mission_candidates.every((row) => row.hold_conditions.length > 0), true);
  assert.equal(result.gates.stage_clear_allowed, false);
  assert.equal(result.gates.taskdriver_activation_allowed, false);
  assert.equal(result.gates.erp_write_allowed, false);
  assert.equal(result.gates.canon_promotion_allowed, false);
  assert.deepEqual(result.effects, {
    erp_writes: 0,
    filesystem_writes: 0,
    model_calls: 0,
    network_calls: 0,
    taskdriver_activated: false,
  });
  assert.equal(JSON.stringify(input), before, 'the input snapshot is not mutated');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.next_mission_candidates[0]), true);
});

test('the stored public fixture is directly source-bound without test-time repair', () => {
  const stored = baseInput();
  const independentlyBound = rebind(clone(stored));

  assert.equal(stored.policy.policy_ref.content_id, independentlyBound.policy.policy_ref.content_id);
  assert.equal(stored.snapshot.policy_ref.content_id, independentlyBound.snapshot.policy_ref.content_id);
  assert.equal(
    stored.snapshot.project_snapshot_ref.content_id,
    independentlyBound.snapshot.project_snapshot_ref.content_id,
  );
  assert.doesNotThrow(() => assessAxSeProject(stored));
});

test('unknown evidence remains UNKNOWN and is never promoted to a missing claim', () => {
  const input = baseInput();
  closeFixtureRisk(input);
  const row = observation(input, 'srr_review_actions_closed');
  row.presence_state = 'unknown';
  row.evidence_refs = [];
  rebind(input);

  const result = assessAxSeProject(input);

  assert.equal(result.assessment_state, 'UNKNOWN');
  assert.equal(result.current_stage.floor_status, 'blocked');
  assert.equal(result.current_stage.requirement_counts.unknown, 1);
  assert.equal(result.current_stage.requirement_counts.missing, 0);
  assert.equal(result.next_mission_candidates[0].mission_kind, 'acquire_requirement_evidence');
  assert.equal(result.next_mission_candidates[0].evidence_claim_ceiling, 'unknown');
});

test('an unobserved requirement is UNKNOWN, not absence_confirmed', () => {
  const input = baseInput();
  closeFixtureRisk(input);
  input.snapshot.observations = input.snapshot.observations.filter(
    (row) => row.requirement_id !== 'srr_review_actions_closed',
  );
  rebind(input);

  const result = assessAxSeProject(input);

  assert.equal(result.current_stage.requirement_counts.unknown, 1);
  assert.equal(result.current_stage.requirement_counts.missing, 0);
  assert.equal(result.issues[0].reason_code, 'observation_not_available');
});

test('a conflict validates its claims, retains every side, and routes a resolution candidate', () => {
  const input = baseInput();
  closeFixtureRisk(input);
  const row = observation(input, 'srr_review_actions_closed');
  row.presence_state = 'present';
  row.conflict_claims = [
    sourceClaim({
      claimId: 'claim-synthetic-project-baseline', authorityFamily: 'project_contract_baseline',
      sourceId: 'synthetic-project-baseline-claim', fill: 'd', assertedValue: 'review_actions_closed',
    }),
    sourceClaim({
      claimId: 'claim-synthetic-reviewed-reference', authorityFamily: 'reviewed_wiki',
      sourceId: 'synthetic-reviewed-reference-claim', fill: 'e', assertedValue: 'review_actions_open',
    }),
  ];
  rebind(input);

  const result = assessAxSeProject(input);
  const issue = result.issues.find((candidate) => candidate.issue_kind === 'conflict');
  const mission = result.next_mission_candidates.find((candidate) => candidate.mission_kind === 'resolve_source_conflict');

  assert.equal(result.assessment_state, 'HOLD');
  assert.equal(result.current_stage.requirement_counts.conflict, 1);
  assert.deepEqual(
    issue.source_conflict.retained_claim_refs.map((claim) => claim.claim_id),
    ['claim-synthetic-project-baseline', 'claim-synthetic-reviewed-reference'],
  );
  assert.equal(issue.source_conflict.sides_dropped, 0);
  assert.deepEqual(mission.source_conflict, issue.source_conflict);
  assert.deepEqual(mission.done_conditions, [
    'both_conflict_sides_retained',
    'authorized_precedence_decision_recorded',
    'stage_reassessment_completed',
  ]);
});

test('role selection is fail-closed and never guesses an unavailable capability', () => {
  const input = baseInput();
  input.roles = input.roles.filter((row) => row.role_id !== 'verification_reviewer');
  rebind(input);

  const result = assessAxSeProject(input);
  const mission = result.next_mission_candidates.find((row) => row.subject_id === 'srr_review_actions_closed');

  assert.deepEqual(mission.role_candidate, {
    reason_code: 'capability_unmapped',
    required_capability: 'verification_review',
    state: 'HOLD',
  });
  assert.equal(result.assessment_state, 'HOLD');
});

test('role selection remains HOLD when more than one available role matches', () => {
  const input = baseInput();
  input.roles.push({
    role_id: 'verification_reviewer_backup',
    availability_state: 'available',
    capabilities: ['verification_review'],
  });

  const result = assessAxSeProject(input);
  const mission = result.next_mission_candidates.find((row) => row.subject_id === 'srr_review_actions_closed');

  assert.deepEqual(mission.role_candidate, {
    eligible_role_ids: ['verification_reviewer', 'verification_reviewer_backup'],
    reason_code: 'capability_ambiguous',
    required_capability: 'verification_review',
    state: 'HOLD',
  });
  assert.equal(mission.task_intent_created, false);
  assert.equal(mission.erp_delta, 0);
});

test('issue and mission candidate handles are scoped to the exact project binding', () => {
  const projectA = baseInput();
  const projectB = baseInput();
  projectB.project_binding_ref = exactRef('synthetic-project-binding-b', 'c');
  projectB.objective_ref = exactRef('synthetic-objective-b', 'd');

  const resultA = assessAxSeProject(projectA);
  const resultB = assessAxSeProject(projectB);

  assert.notEqual(resultA.assessment_handle, resultB.assessment_handle);
  assert.deepEqual(
    resultA.issues.map((row) => row.subject_id),
    resultB.issues.map((row) => row.subject_id),
  );
  resultA.issues.forEach((row, index) => assert.notEqual(row.issue_handle, resultB.issues[index].issue_handle));
  resultA.next_mission_candidates.forEach((row, index) => {
    assert.notEqual(row.mission_candidate_handle, resultB.next_mission_candidates[index].mission_candidate_handle);
  });
});

test('requirement applicability is explicit: false is excluded and unknown blocks judgment', () => {
  const notApplicable = baseInput();
  requirement(notApplicable, 'srr_objective_trace').applicability = false;
  rebind(notApplicable);

  const excluded = assessAxSeProject(notApplicable);
  assert.equal(excluded.current_stage.requirement_counts.not_applicable, 1);
  assert.equal(excluded.current_stage.requirement_counts.satisfied, 0);
  assert.equal(excluded.issues.some((row) => row.subject_id === 'srr_objective_trace'), false);

  const unknownApplicability = baseInput();
  requirement(unknownApplicability, 'srr_objective_trace').applicability = 'unknown';
  rebind(unknownApplicability);

  const unresolved = assessAxSeProject(unknownApplicability);
  const issue = unresolved.issues.find((row) => row.subject_id === 'srr_objective_trace');
  assert.equal(unresolved.assessment_state, 'UNKNOWN');
  assert.equal(unresolved.current_stage.requirement_counts.unknown, 1);
  assert.equal(issue.reason_code, 'requirement_applicability_unknown');
  assert.equal(issue.evidence_claim_ceiling, 'unknown');
});

test('a stage with no applicable requirement is refused rather than presented as clearable', () => {
  const input = baseInput();
  requirement(input, 'sfr_functional_baseline').applicability = false;
  rebind(input);

  assert.throws(
    () => assessAxSeProject(input),
    (error) => error?.code === 'AX_SE_INPUT_INVALID',
  );

  const policy = clone(FIXTURE.input.policy);
  policy.stages
    .find((stage) => stage.stage_code === '060_SFR')
    .requirements[0].applicability = false;
  assert.throws(
    () => buildFrom(contextPacket(), { policy }),
    (error) => error?.code === 'AX_SE_INPUT_INVALID',
  );
});

test('stage codes are lifecycle-unique and cannot share one risk bucket', () => {
  const input = baseInput();
  input.policy.stages[1].stage_code = input.policy.stages[0].stage_code;
  rebind(input);
  assert.throws(
    () => assessAxSeProject(input),
    (error) => error?.code === 'AX_SE_INPUT_INVALID',
  );
});

test('an issue-free lifecycle stays active until the separate boss-clear gates are evidenced', () => {
  const input = baseInput();
  observation(input, 'srr_review_actions_closed').presence_state = 'present';
  input.snapshot.observations.push({
    requirement_id: 'sfr_functional_baseline',
    presence_state: 'present',
    observation_attempt_ref: 'observation:synthetic:sfr-functional-baseline',
    artifact_revision_ref: exactRef('synthetic-functional-baseline-artifact', 'f'),
    valid_at: '2026-08-01T00:00:00.000Z',
    known_at: '2026-08-02T00:00:00.000Z',
    evidence_refs: [evidence('synthetic-functional-baseline-evidence', '0')],
  });
  closeFixtureRisk(input);
  input.snapshot.observations.sort((a, b) => compareCodePoints(a.requirement_id, b.requirement_id));
  rebind(input);

  const result = assessAxSeProject(input);

  assert.equal(result.assessment_state, 'READY_FOR_OWNER_REVIEW');
  assert.equal(result.current_stage.stage_code, '060_SFR');
  assert.equal(result.current_stage.floor_status, 'active');
  assert.equal(result.next_mission_candidates.length, 0);
  assert.equal(result.gates.stage_clear_allowed, false);
  assert.equal(result.authority.stage_cleared, false);
  assert.equal(result.authority.owner_decision_made, false);
});

test('the unclassified holding floor is active and is never a boss-clear candidate', () => {
  const input = baseInput();
  observation(input, 'srr_review_actions_closed').presence_state = 'present';
  input.snapshot.observations.push({
    requirement_id: 'sfr_functional_baseline',
    presence_state: 'present',
    observation_attempt_ref: 'observation:synthetic:sfr-functional-baseline',
    artifact_revision_ref: exactRef('synthetic-functional-baseline-artifact', 'f'),
    valid_at: '2026-08-01T00:00:00.000Z',
    known_at: '2026-08-02T00:00:00.000Z',
    evidence_refs: [evidence('synthetic-functional-baseline-evidence', '0')],
  });
  closeFixtureRisk(input);
  input.policy.stages[1].stage_code = '270_UNCLASSIFIED';
  input.snapshot.observations.sort((a, b) => compareCodePoints(a.requirement_id, b.requirement_id));
  rebind(input);

  const result = assessAxSeProject(input);
  assert.equal(result.current_stage.stage_code, '270_UNCLASSIFIED');
  assert.equal(result.current_stage.floor_status, 'active');
  assert.equal(result.authority.stage_cleared, false);
});

test('candidate selection is deterministic and bounded to the next three items', () => {
  const input = baseInput();
  input.snapshot.risks.push(
    {
      risk_id: 'risk:synthetic:critical-a', risk_ref: exactRef('synthetic-critical-a-risk', '1'),
      stage_code: '030_SRR', state: 'open', severity: 'critical', required_capability: 'risk_management',
      evidence_refs: [evidence('synthetic-critical-a-evidence', '2')],
    },
    {
      risk_id: 'risk:synthetic:critical-b', risk_ref: exactRef('synthetic-critical-b-risk', '3'),
      stage_code: '030_SRR', state: 'open', severity: 'critical', required_capability: 'risk_management',
      evidence_refs: [evidence('synthetic-critical-b-evidence', '4')],
    },
    {
      risk_id: 'risk:synthetic:medium', risk_ref: exactRef('synthetic-medium-risk', '5'),
      stage_code: '030_SRR', state: 'open', severity: 'medium', required_capability: 'risk_management',
      evidence_refs: [evidence('synthetic-medium-evidence', '6')],
    },
  );
  input.snapshot.risks.sort((a, b) => compareCodePoints(a.risk_id, b.risk_id));
  rebind(input);

  const first = assessAxSeProject(input);
  const second = assessAxSeProject(clone(input));

  assert.equal(first.next_mission_candidates.length, 3);
  assert.deepEqual(first.next_mission_candidates.map((row) => row.subject_id), [
    'risk:synthetic:critical-a',
    'risk:synthetic:critical-b',
    'risk:synthetic:interface-ambiguity',
  ]);
  assert.deepEqual(first.candidate_truncation, {
    eligible_count: 5,
    emitted_count: 3,
    omitted_count: 2,
    maximum: 3,
  });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.match(first.assessment_handle, /^cand-[0-9a-f]{64}$/u);
  assert.match(first.input_fingerprint_sha256, /^[0-9a-f]{64}$/u);
});

test('closed inputs reject drift, extra fields, accessors, proxies, and unsupported missing claims', () => {
  const drift = baseInput();
  drift.policy.stages[0].stage_label = 'silently changed';
  assert.throws(() => assessAxSeProject(drift), (error) => error?.code === 'AX_SE_POLICY_HASH_MISMATCH');

  const extra = baseInput();
  extra.unexpected = true;
  assert.throws(() => assessAxSeProject(extra), (error) => error?.code === 'AX_SE_INPUT_INVALID');

  const accessor = baseInput();
  Object.defineProperty(accessor.snapshot, 'surprise', { enumerable: true, get() { return 'hidden'; } });
  assert.throws(() => assessAxSeProject(accessor), (error) => error?.code === 'AX_SE_INPUT_UNSAFE');

  let ownKeysCalls = 0;
  const proxy = new Proxy(baseInput(), { ownKeys(target) { ownKeysCalls += 1; return Reflect.ownKeys(target); } });
  assert.throws(() => assessAxSeProject(proxy), (error) => error?.code === 'AX_SE_INPUT_UNSAFE');
  assert.equal(ownKeysCalls, 0, 'proxy rejection occurs before reflective traps');

  const badMissing = baseInput();
  observation(badMissing, 'srr_review_actions_closed').evidence_refs = [];
  rebind(badMissing);
  assert.throws(() => assessAxSeProject(badMissing), (error) => error?.code === 'AX_SE_EVIDENCE_REQUIRED');

  const malformedRow = baseInput();
  malformedRow.snapshot.observations = [{}];
  rebind(malformedRow);
  assert.throws(() => assessAxSeProject(malformedRow), (error) => error?.code === 'AX_SE_INPUT_INVALID');

  const unsafeKey = baseInput();
  unsafeKey[`forbidden_key_echo_marker_${'x'.repeat(120)}`] = true;
  assertFailureWithout(() => assessAxSeProject(unsafeKey), 'AX_SE_INPUT_UNSAFE', 'forbidden_key_echo_marker');
});

test('source bindings and bounded surfaces have direct negative controls', () => {
  const snapshotDrift = baseInput();
  observation(snapshotDrift, 'srr_review_actions_closed').presence_state = 'present';
  assert.throws(
    () => assessAxSeProject(snapshotDrift),
    (error) => error?.code === 'AX_SE_SNAPSHOT_HASH_MISMATCH',
  );

  const policyBindingDrift = baseInput();
  policyBindingDrift.snapshot.policy_ref = exactRef('foreign-stage-policy', 'e');
  assert.throws(
    () => assessAxSeProject(policyBindingDrift),
    (error) => error?.code === 'AX_SE_POLICY_BINDING_MISMATCH',
  );

  const malformedRef = baseInput();
  malformedRef.objective_ref.content_id = 'sha256:short';
  assert.throws(
    () => assessAxSeProject(malformedRef),
    (error) => error?.code === 'AX_SE_REFERENCE_INVALID',
  );

  const unbounded = baseInput();
  unbounded.roles = Array.from({ length: 513 }, (_, index) => ({
    role_id: `role_${String(index).padStart(3, '0')}`,
    availability_state: 'unavailable',
    capabilities: ['systems_engineering'],
  }));
  assert.throws(
    () => assessAxSeProject(unbounded),
    (error) => error?.code === 'AX_SE_INPUT_UNBOUNDED',
  );

  const hugeSparse = baseInput();
  hugeSparse.roles = new Array(2 ** 30);
  assert.throws(
    () => assessAxSeProject(hugeSparse),
    (error) => error?.code === 'AX_SE_INPUT_UNBOUNDED',
  );
});

test('an observation valid before a requirement remains usable because valid_at has no expiry', () => {
  const input = baseInput();
  observation(input, 'srr_objective_trace').valid_at = '2026-07-01T00:00:00.000Z';
  rebind(input);

  const result = assessAxSeProject(input);

  assert.equal(result.current_stage.requirement_counts.satisfied, 1);
  assert.equal(result.issues.some((row) => row.subject_id === 'srr_objective_trace'), false);
});

test('conflict and chronology inputs fail closed without echoing rejected values', () => {
  const absenceWithClaims = baseInput();
  const absenceRow = observation(absenceWithClaims, 'srr_review_actions_closed');
  absenceRow.conflict_claims = [
    sourceClaim({
      claimId: 'claim-absence-a', authorityFamily: 'project_contract_baseline',
      sourceId: 'absence-source-a', fill: 'a', assertedValue: 'forbidden_absence_claim_a',
    }),
    sourceClaim({
      claimId: 'claim-absence-b', authorityFamily: 'reviewed_wiki',
      sourceId: 'absence-source-b', fill: 'b', assertedValue: 'forbidden_absence_claim_b',
    }),
  ];
  rebind(absenceWithClaims);
  assertFailureWithout(
    () => assessAxSeProject(absenceWithClaims),
    'AX_SE_CONFLICT_INVALID',
    'forbidden_absence_claim',
  );

  const invalidApplicability = baseInput();
  const applicabilityRow = observation(invalidApplicability, 'srr_review_actions_closed');
  applicabilityRow.presence_state = 'present';
  applicabilityRow.conflict_claims = [
    sourceClaim({
      claimId: 'claim-applicability-a', authorityFamily: 'project_contract_baseline',
      sourceId: 'applicability-source-a', fill: 'c', assertedValue: 'closed',
    }),
    sourceClaim({
      claimId: 'claim-applicability-b', authorityFamily: 'reviewed_wiki',
      sourceId: 'applicability-source-b', fill: 'd', assertedValue: 'open',
    }),
  ];
  applicabilityRow.conflict_claims[0].applicability = 'forbidden_applicability_value';
  rebind(invalidApplicability);
  assertFailureWithout(
    () => assessAxSeProject(invalidApplicability),
    'AX_SE_CONFLICT_INVALID',
    'forbidden_applicability_value',
  );

  const incoherentTime = baseInput();
  observation(incoherentTime, 'srr_review_actions_closed').known_at = '2026-07-31T00:00:00.000Z';
  rebind(incoherentTime);
  assertFailureWithout(
    () => assessAxSeProject(incoherentTime),
    'AX_SE_INPUT_INVALID',
    '2026-07-31',
  );
});

test('the subject has no LLM, network, filesystem, ERP, or TaskDriver execution dependency', () => {
  const source = readFileSync(fileURLToPath(MODULE_URL), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|http|https|net|child_process)/u);
  assert.doesNotMatch(source, /(?:fetch\s*\(|ollama|composeAnswer|dev-erp|taskdriver_activated\s*:\s*true)/iu);
});

test('all outputs remain candidate-only with no clear, TaskDriver, or ERP authority', () => {
  const result = assessAxSeProject(baseInput());
  const serialized = JSON.stringify(result);

  assert.equal(result.current_stage.floor_status === 'cleared', false);
  assert.equal(result.authority.stage_cleared, false);
  assert.equal(result.authority.task_intent_created, false);
  assert.equal(result.gates.taskdriver_activation_allowed, false);
  assert.equal(result.gates.erp_write_allowed, false);
  assert.equal(result.effects.erp_writes, 0);
  assert.equal(result.effects.taskdriver_activated, false);
  assert.doesNotMatch(serialized, /"(?:mission_id|task_intent_id|assignment_id)"/u);
});

const contextPacket = () => {
  const source = baseInput();
  return {
    schema_version: AX_SE_PROJECT_CONTEXT_PACKET_SCHEMA,
    project_binding_ref: source.project_binding_ref,
    objective_ref: source.objective_ref,
    policy_ref: source.policy.policy_ref,
    project_snapshot_identity: {
      entity_id: source.snapshot.project_snapshot_ref.entity_id,
      revision_id: source.snapshot.project_snapshot_ref.revision_id,
    },
    observations: source.snapshot.observations,
    risks: source.snapshot.risks,
  };
};

function buildFrom(packet, overrides = {}) {
  return buildAxSeAssessmentInput({
    contextPacket: packet,
    policy: clone(FIXTURE.input.policy),
    roles: clone(FIXTURE.input.roles),
    expectedProjectBindingRef: clone(FIXTURE.input.project_binding_ref),
    ...overrides,
  });
}

function assertRefusedWithout(action, forbiddenText) {
  assert.throws(action, (error) => {
    assert.match(String(error?.code), /^AX_SE_[A-Z_]+$/u);
    assert.doesNotMatch(
      JSON.stringify({ message: error?.message, detail: error?.detail }),
      new RegExp(forbiddenText, 'u'),
    );
    return true;
  });
}

test('the builder binds a permuted requirement-bound context packet into the exact assessed input', () => {
  const packet = contextPacket();
  const policy = clone(FIXTURE.input.policy);
  const roles = clone(FIXTURE.input.roles);
  const expectedProjectBindingRef = clone(FIXTURE.input.project_binding_ref);
  // Observations, risks, roles, and their nested capability arrays carry no caller meaning in
  // their order, so the packet is handed over deliberately out of order.
  packet.observations.reverse();
  packet.risks.reverse();
  roles.reverse();
  roles.forEach((role) => role.capabilities.reverse());
  const before = JSON.stringify({ packet, policy, roles, expectedProjectBindingRef });

  const input = buildAxSeAssessmentInput({ contextPacket: packet, policy, roles, expectedProjectBindingRef });

  assert.equal(input.schema_version, AX_SE_INPUT_SCHEMA);
  assert.deepEqual(input, FIXTURE.input);
  assert.equal(
    JSON.stringify({ packet, policy, roles, expectedProjectBindingRef }),
    before,
    'the caller inputs are not mutated',
  );
  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.snapshot.observations[0].evidence_refs[0]), true);
  assert.equal(Object.isFrozen(input.roles[0].capabilities), true);

  const result = assessAxSeProject(input);
  assert.equal(result.assessment_state, FIXTURE.expected.assessment_state);
  assert.equal(result.current_stage.stage_code, FIXTURE.expected.current_stage_code);
  assert.equal(result.current_stage.floor_status, FIXTURE.expected.floor_status);
  assert.deepEqual(result.next_mission_candidates.map((row) => row.mission_kind), FIXTURE.expected.mission_kinds);
  assert.deepEqual(
    result.next_mission_candidates.map((row) => row.role_candidate.role_id),
    FIXTURE.expected.role_ids,
  );

  // A requirement the packet never observed stays unobserved: the builder must not manufacture
  // a confirmed absence out of an omission.
  const omitted = contextPacket();
  omitted.observations = omitted.observations.filter((row) => row.requirement_id !== 'srr_review_actions_closed');
  omitted.risks[0].state = 'closed';
  const unresolved = assessAxSeProject(buildFrom(omitted));

  assert.equal(unresolved.current_stage.requirement_counts.unknown, 1);
  assert.equal(unresolved.current_stage.requirement_counts.missing, 0);
  assert.equal(unresolved.issues[0].reason_code, 'observation_not_available');
});

test('the builder refuses a context packet bound to another project', () => {
  assertRefusedWithout(
    () => buildFrom(contextPacket(), { expectedProjectBindingRef: exactRef('foreign-project-echo-marker', 'c') }),
    'foreign-project-echo-marker',
  );

  const sameEntityOtherRevision = clone(FIXTURE.input.project_binding_ref);
  sameEntityOtherRevision.content_id = `sha256:${'c'.repeat(64)}`;
  assertRefusedWithout(
    () => buildFrom(contextPacket(), { expectedProjectBindingRef: sameEntityOtherRevision }),
    'c{64}',
  );
});

test('the builder refuses a caller-asserted snapshot hash or an extra context packet field', () => {
  const selfAsserted = contextPacket();
  // Even the correct digest is refused: the snapshot ref is the builder's own conclusion.
  selfAsserted.project_snapshot_identity.content_id = FIXTURE.input.snapshot.project_snapshot_ref.content_id;
  selfAsserted.project_snapshot_identity.content_hash_alg = 'sha256';
  assert.throws(() => buildFrom(selfAsserted), (error) => error?.code === 'AX_SE_INPUT_INVALID');

  const extraField = contextPacket();
  extraField.project_snapshot_ref = clone(FIXTURE.input.snapshot.project_snapshot_ref);
  assert.throws(() => buildFrom(extraField), (error) => error?.code === 'AX_SE_INPUT_INVALID');
});

test('a changed evidence set moves the computed snapshot content id under a stable identity', () => {
  const changed = contextPacket();
  const row = changed.observations.find((item) => item.requirement_id === 'srr_review_actions_closed');
  row.evidence_refs.push(evidence('synthetic-review-action-log', 'c'));

  const input = buildFrom(changed);
  const bound = input.snapshot.project_snapshot_ref;
  const stored = FIXTURE.input.snapshot.project_snapshot_ref;

  assert.deepEqual(
    input.snapshot.observations
      .find((item) => item.requirement_id === 'srr_review_actions_closed')
      .evidence_refs.map((ref) => ref.entity_id),
    ['synthetic-review-action-log', 'synthetic-review-action-scan'],
  );
  assert.equal(bound.entity_id, stored.entity_id);
  assert.equal(bound.revision_id, stored.revision_id);
  assert.match(bound.content_id, /^sha256:[0-9a-f]{64}$/u);
  assert.notEqual(bound.content_id, stored.content_id);
  assert.doesNotThrow(() => assessAxSeProject(input));
});

test('the builder refuses a Proxy context packet or role list before any trap runs', () => {
  let packetTraps = 0;
  const proxiedPacket = new Proxy(contextPacket(), {
    get(target, key, receiver) { packetTraps += 1; return Reflect.get(target, key, receiver); },
    ownKeys(target) { packetTraps += 1; return Reflect.ownKeys(target); },
  });
  assert.throws(() => buildFrom(proxiedPacket), (error) => error?.code === 'AX_SE_INPUT_UNSAFE');
  assert.equal(packetTraps, 0, 'the context packet proxy is refused before reflective traps');

  let roleTraps = 0;
  const proxiedRoles = new Proxy(clone(FIXTURE.input.roles), {
    ownKeys(target) { roleTraps += 1; return Reflect.ownKeys(target); },
  });
  assert.throws(
    () => buildFrom(contextPacket(), { roles: proxiedRoles }),
    (error) => error?.code === 'AX_SE_INPUT_UNSAFE',
  );
  assert.equal(roleTraps, 0, 'the role proxy is refused before reflective traps');
});

test('uncanonical caller strings fail with the stable AX-SE code and never echo rejected text', () => {
  const packet = contextPacket();
  packet.observations[0].observation_attempt_ref = '2026-08-01Techo-marker-builder';
  assert.throws(() => buildFrom(packet), (error) => {
    assert.equal(error?.code, 'AX_SE_INPUT_INVALID');
    assert.doesNotMatch(
      JSON.stringify({ message: error?.message, detail: error?.detail }),
      /echo-marker-builder/u,
    );
    return true;
  });

  const input = baseInput();
  input.policy.stages[0].stage_label = '2026-08-01Techo-marker-assessment';
  assertFailureWithout(
    () => assessAxSeProject(input),
    'AX_SE_INPUT_INVALID',
    'echo-marker-assessment',
  );
});

test('a local absolute path is refused even when embedded inside a longer label', () => {
  // Assemble the probes at runtime so this public test never stores a machine-local path literal.
  const windowsForm = `${'D'}${':'}${'\\'}notes${'\\'}packet.txt`;
  const posixForm = `${'/'}home${'/'}owner${'/'}notes.txt`;

  for (const embedded of [
    `attachment stored at ${windowsForm}`,
    `attachment stored at ${posixForm}`,
  ]) {
    const input = baseInput();
    input.policy.stages[0].stage_label = embedded;
    rebind(input);
    assertFailureWithout(
      () => assessAxSeProject(input),
      'AX_SE_INPUT_UNSAFE',
      'notes',
    );
  }

  const url = baseInput();
  url.policy.stages[0].stage_label = `${'https'}${':'}${'//'}example.test/home/x`;
  rebind(url);
  assert.doesNotThrow(() => assessAxSeProject(url));
});

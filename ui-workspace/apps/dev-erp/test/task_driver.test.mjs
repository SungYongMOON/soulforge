import test from "node:test";
import assert from "node:assert/strict";

import {
  TASK_DRIVER_AUTHORITY_ATTESTATION_SCHEMA_VERSION,
  TASK_DRIVER_CANONICALIZATION_VERSION,
  TASK_DRIVER_LIMITS,
  TASK_DRIVER_REASON_TEMPLATES,
  TaskDriverContractError,
  assertWorkStatusTransition,
  buildTaskDriver,
  buildTaskDriverEvent,
  buildTaskDriverPolicy,
  buildTaskDriverPolicyRevocation,
  buildTaskIntent,
  canonicalDigest,
  canonicalStringify,
  createCompletionFollowupCandidate,
  isLegalWorkStatusTransition,
  replayTaskDriverContract,
  taskDriverRef,
  typedRef,
  validateTaskDriver,
  validateTaskIntent,
} from "../src/task_driver.mjs";

const T0 = "2026-07-13T00:00:00.000Z";
const T1 = "2026-07-13T00:01:00.000Z";
const T2 = "2026-07-13T00:02:00.000Z";
const T3 = "2026-07-13T00:03:00.000Z";
const T4 = "2026-07-13T00:04:00.000Z";
const T5 = "2026-07-13T00:05:00.000Z";
const T9 = "2026-07-13T00:09:00.000Z";

const PROJECT = typedRef("project", "dev_erp", "P-SYN-013");
const PROJECT_B = typedRef("project", "dev_erp", "P-SYN-013-B");
const FOREIGN_PROJECT = typedRef("project", "foreign_project_store", "P-SYN-013");
const TASK_CANDIDATE = typedRef("task_candidate", "dev_erp_task_engine", "candidate-syn-013");
const TASK_CANDIDATE_B = typedRef("task_candidate", "dev_erp_task_engine", "candidate-syn-013-b");
const FOREIGN_TASK_CANDIDATE = typedRef("task_candidate", "foreign_task_engine", "candidate-syn-013");
const TASK = typedRef("task", "dev_erp", "task-syn-013");
const FOREIGN_TASK = typedRef("task", "foreign_task_store", "task-syn-013");
const TASK_REVISION = typedRef("task_revision", "dev_erp", "task-syn-013-r1");
const TASK_REVISION_B = typedRef("task_revision", "dev_erp", "task-syn-013-r2");
const PARENT_TASK = typedRef("task", "dev_erp", "task-parent-syn-013");
const OWNER_DECISION = typedRef("owner_decision", "owner_decision_ledger", "decision-syn-013-a");
const OWNER_DECISION_B = typedRef("owner_decision", "owner_decision_ledger", "decision-syn-013-b");
const SOURCE_EVENT = typedRef("event", "source_event_ledger", "event-syn-013-source");
const SOURCE_REVISION = typedRef("source_revision", "source_revision_ledger", "source-rev-syn-013");
const COMPLETION_EVENT = typedRef("event", "dev_erp_task_events", "completion-syn-013");
const ACTOR_LLM = typedRef("actor", "dev_erp", "actor-synthetic-llm");
const ACTOR_OWNER = typedRef("actor", "dev_erp", "actor-synthetic-owner");
const ACTOR_SYSTEM = typedRef("actor", "dev_erp", "actor-synthetic-system");
const WRITER = typedRef("writer", "dev_erp_task_engine", "writer-synthetic-primary");
const WRITER_B = typedRef("writer", "dev_erp_task_engine", "writer-synthetic-secondary");
const POLICY_REF = typedRef("policy_revision", "task_policy_registry", "policy-syn-013-r1");
const POLICY_REF_B = typedRef("policy_revision", "task_policy_registry", "policy-syn-013-r2");
const POLICY_REVOCATION_REF = typedRef(
  "policy_revocation",
  "task_policy_registry",
  "policy-syn-013-r1-revocation-a",
);

function errorCode(code) {
  return (error) => error instanceof TaskDriverContractError && error.code === code;
}

function createIntent(candidate = TASK_CANDIDATE, project = PROJECT) {
  return buildTaskIntent({
    intent_kind: "task_create",
    project_ref: project,
    task_candidate_ref: candidate,
    expected_from_state_or_revision: null,
    proposed_to_state_or_patch: { initial_work_status: "not_started" },
  });
}

function ownerCreateDriver({
  intent = createIntent(),
  trigger = OWNER_DECISION,
  reasonTemplateId = TASK_DRIVER_REASON_TEMPLATES.owner_request,
  supersedes = null,
  validAt = T0,
  knownAt = T0,
  recordedAt = T0,
} = {}) {
  return {
    intent,
    driver: buildTaskDriver({
      driver_kind: "owner_request",
      intent,
      trigger_event_ref: trigger,
      why_code: "owner_request",
      reason_template_id: reasonTemplateId,
      valid_at: validAt,
      known_at: knownAt,
      recorded_at: recordedAt,
      supersedes_driver_ref: supersedes,
    }),
  };
}

function candidateEvent(driver, intent, overrides = {}) {
  return buildTaskDriverEvent({
    event_kind: "candidate",
    event_sequence: 1,
    driver,
    intent,
    actor_kind: "llm",
    actor_ref: ACTOR_LLM,
    writer_ref: WRITER,
    authority_kind: "none",
    owner_decision_ref: null,
    policy_ref: null,
    valid_at: T1,
    known_at: T1,
    recorded_at: T1,
    result_project_ref: null,
    result_task_candidate_ref: null,
    result_task_ref: null,
    work_status_transition: null,
    superseding_driver_ref: null,
    ...overrides,
  });
}

function ownerDecisionEvent(eventKind, driver, intent, overrides = {}) {
  const isApply = eventKind === "apply";
  const isCreate = intent.intent_kind === "task_create";
  const isTransition = intent.intent_kind === "work_status_transition";
  const humanDecision = ["approve", "reject", "supersede"].includes(eventKind);
  const laterEvent = ["apply", "supersede"].includes(eventKind);
  return buildTaskDriverEvent({
    event_kind: eventKind,
    event_sequence: laterEvent ? 3 : 2,
    driver,
    intent,
    actor_kind: humanDecision ? "human" : "system",
    actor_ref: humanDecision ? ACTOR_OWNER : ACTOR_SYSTEM,
    writer_ref: WRITER,
    authority_kind: "owner_decision",
    owner_decision_ref: OWNER_DECISION,
    policy_ref: null,
    valid_at: laterEvent ? T3 : T2,
    known_at: laterEvent ? T3 : T2,
    recorded_at: laterEvent ? T3 : T2,
    result_project_ref: isApply ? driver.project_ref : null,
    result_task_candidate_ref: isApply && isCreate ? intent.task_candidate_ref : null,
    result_task_ref: isApply ? (intent.task_ref ?? TASK) : null,
    work_status_transition: isApply && isCreate
      ? { from: null, to: "not_started" }
      : isApply && isTransition
        ? { from: intent.expected_from_state_or_revision, to: intent.proposed_to_state_or_patch }
        : null,
    superseding_driver_ref: null,
    ...overrides,
  });
}

function policyDecisionEvent(eventKind, driver, intent, policyRef = POLICY_REF, writerRef = WRITER, overrides = {}) {
  const isApply = eventKind === "apply";
  const isCreate = intent.intent_kind === "task_create";
  const isTransition = intent.intent_kind === "work_status_transition";
  return buildTaskDriverEvent({
    event_kind: eventKind,
    event_sequence: isApply ? 3 : 2,
    driver,
    intent,
    actor_kind: "system",
    actor_ref: ACTOR_SYSTEM,
    writer_ref: writerRef,
    authority_kind: "deterministic_policy",
    owner_decision_ref: null,
    policy_ref: policyRef,
    valid_at: isApply ? T3 : T2,
    known_at: isApply ? T3 : T2,
    recorded_at: isApply ? T3 : T2,
    result_project_ref: isApply ? driver.project_ref : null,
    result_task_candidate_ref: isApply && isCreate ? intent.task_candidate_ref : null,
    result_task_ref: isApply ? (intent.task_ref ?? TASK) : null,
    work_status_transition: isApply && isCreate
      ? { from: null, to: "not_started" }
      : isApply && isTransition
        ? { from: intent.expected_from_state_or_revision, to: intent.proposed_to_state_or_patch }
        : null,
    superseding_driver_ref: null,
    ...overrides,
  });
}

function ownerAppliedFixture() {
  const { intent, driver } = ownerCreateDriver();
  return {
    intent,
    driver,
    candidate: candidateEvent(driver, intent),
    approved: ownerDecisionEvent("approve", driver, intent),
    applied: ownerDecisionEvent("apply", driver, intent),
  };
}

function sourcePolicyFixture() {
  const intent = createIntent();
  const driver = buildTaskDriver({
    driver_kind: "source_event",
    intent,
    trigger_event_ref: SOURCE_EVENT,
    source_revision_refs: [SOURCE_REVISION],
    why_code: "source_event",
    reason_template_id: TASK_DRIVER_REASON_TEMPLATES.source_event,
    valid_at: T0,
    known_at: T0,
    recorded_at: T0,
  });
  const policy = buildTaskDriverPolicy({
    policy_ref: POLICY_REF,
    allowed_driver_kinds: ["source_event"],
    allowed_trigger_owner_surfaces: ["source_event_ledger"],
    writer_ref: WRITER,
    valid_from: T0,
    valid_until: T9,
    known_at: T0,
    recorded_at: T0,
    supersedes_policy_ref: null,
  });
  return { intent, driver, policy };
}

function authorityAttestation(request, overrides = {}) {
  const payload = {
    schema_version: TASK_DRIVER_AUTHORITY_ATTESTATION_SCHEMA_VERSION,
    project_ref: request.project_ref,
    event_ref: request.event_ref,
    event_digest: request.event_digest,
    event_sequence: request.event_sequence,
    driver_ref: request.driver_ref,
    driver_digest: request.driver_digest,
    target_intent_ref: request.target_intent_ref,
    intent_digest: request.intent_digest,
    authority_kind: request.authority_kind,
    authority_ref: request.authority_ref,
    actor_kind: request.actor_kind,
    actor_ref: request.actor_ref,
    writer_ref: request.writer_ref,
    allowed_event_kind: request.event_kind,
    event_valid_at: request.event_valid_at,
    event_known_at: request.event_known_at,
    event_recorded_at: request.event_recorded_at,
    cutoff: request.cutoff,
    policy_digest: request.policy_digest,
    policy_revocation_digest: request.policy_revocation_digest,
    ...overrides,
  };
  return {
    ...payload,
    evidence_digest: canonicalDigest(payload, "soulforge.task_driver.authority_attestation.v1"),
  };
}

function trustedAuthorityResolver(request) {
  return authorityAttestation(request);
}

function initialTask(workStatus = "blocked", projectRef = PROJECT, taskRef = TASK) {
  return {
    project_ref: projectRef,
    task_ref: taskRef,
    current_task_revision_ref: TASK_REVISION,
    work_status: workStatus,
  };
}

function replay({
  intents,
  drivers,
  policies = [],
  policyRevocations = [],
  events,
  initialTasks = [],
  cutoff = { valid_at: T9, known_at: T9 },
  authorityResolver = trustedAuthorityResolver,
}) {
  const input = {
    intents,
    drivers,
    policies,
    policy_revocations: policyRevocations,
    events,
    initial_tasks: initialTasks,
    cutoff,
  };
  return authorityResolver === null
    ? replayTaskDriverContract(input)
    : replayTaskDriverContract(input, { trusted_authority_resolver: authorityResolver });
}

test("V-01 canonical serialization is NFC, sorted-key, and metadata-only schemas are exact", () => {
  const decomposed = { z: "e\u0301", a: { omega: 2, alpha: 1 } };
  const composed = { a: { alpha: 1, omega: 2 }, z: "é" };
  assert.equal(canonicalStringify(decomposed), canonicalStringify(composed));
  assert.equal(canonicalDigest(decomposed), canonicalDigest(composed));
  assert.match(canonicalDigest(decomposed), /^sha256:[a-f0-9]{64}$/u);
  assert.equal(TASK_DRIVER_CANONICALIZATION_VERSION, "soulforge.identity_basis.cjson_nfc_utf8.v1");

  const { intent, driver } = ownerCreateDriver();
  assert.deepEqual(validateTaskIntent(structuredClone(intent)), intent);
  assert.deepEqual(validateTaskDriver(structuredClone(driver), intent), driver);
  assert.throws(
    () => typedRef(
      "event",
      "source_event_ledger",
      ["C:", "private", "payload"].join("\\"),
    ),
    errorCode("task_driver_ref_invalid"),
  );
  assert.throws(() => buildTaskIntent({
    intent_kind: "task_create",
    project_ref: PROJECT,
    task_candidate_ref: TASK_CANDIDATE,
    expected_from_state_or_revision: null,
    proposed_to_state_or_patch: { initial_work_status: "not_started" },
    raw_body: "not allowed",
  }), errorCode("task_intent_shape_invalid"));
  assert.throws(() => buildTaskDriver({
    driver_kind: "owner_request",
    intent,
    trigger_event_ref: OWNER_DECISION,
    why_code: "owner_request",
    reason_template_id: TASK_DRIVER_REASON_TEMPLATES.owner_request,
    valid_at: T0,
    known_at: T0,
    recorded_at: T0,
    chain_of_thought: "not allowed",
  }), errorCode("task_driver_build_shape_invalid"));

  const tampered = structuredClone(driver);
  tampered.recorded_at = T1;
  assert.throws(() => validateTaskDriver(tampered, intent), errorCode("task_driver_digest_mismatch"));
});

test("V-02 decision and work state axes remain distinct and only legal work transitions pass", () => {
  assert.equal(isLegalWorkStatusTransition("not_started", "in_progress"), true);
  assert.equal(isLegalWorkStatusTransition("in_progress", "blocked"), true);
  assert.equal(isLegalWorkStatusTransition("blocked", "in_progress"), true);
  assert.equal(isLegalWorkStatusTransition("done", "archived"), true);
  assert.equal(isLegalWorkStatusTransition("done", "in_progress"), false);
  assert.equal(isLegalWorkStatusTransition("candidate", "done"), false);
  assert.throws(() => assertWorkStatusTransition("archived", "in_progress"), errorCode("task_driver_work_status_transition_illegal"));

  const transition = buildTaskIntent({
    intent_kind: "work_status_transition",
    project_ref: PROJECT,
    task_ref: TASK,
    expected_from_state_or_revision: "blocked",
    proposed_to_state_or_patch: "in_progress",
  });
  const transitionDriver = ownerCreateDriver({ intent: transition });
  const transitionResult = replay({
    intents: [transition],
    drivers: [transitionDriver.driver],
    initialTasks: [initialTask("blocked")],
    events: [
      candidateEvent(transitionDriver.driver, transition),
      ownerDecisionEvent("approve", transitionDriver.driver, transition),
      ownerDecisionEvent("apply", transitionDriver.driver, transition),
    ],
  });
  assert.equal(transitionResult.tasks[0].work_status, "in_progress");
  assert.throws(() => buildTaskIntent({
    intent_kind: "work_status_transition",
    project_ref: PROJECT,
    task_ref: TASK,
    expected_from_state_or_revision: "candidate",
    proposed_to_state_or_patch: "done",
  }), errorCode("task_driver_work_status_transition_illegal"));
});

test("V-03 candidate to approve to apply produces an applied driver and task projection", () => {
  const fixture = ownerAppliedFixture();
  const result = replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [fixture.candidate, fixture.approved, fixture.applied],
  });
  assert.equal(result.drivers.length, 1);
  assert.equal(result.drivers[0].decision_application_state, "applied");
  assert.equal(result.drivers[0].work_status, "not_started");
  assert.deepEqual(result.drivers[0].approval_owner_decision_ref, OWNER_DECISION);
  assert.match(result.drivers[0].approval_authority_evidence_digest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(result.drivers[0].last_authority_evidence_digest, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(result.tasks.map(({ task_ref, work_status }) => ({ task_ref, work_status })), [{
    task_ref: TASK,
    work_status: "not_started",
  }]);
  assert.match(result.projection_digest, /^sha256:[a-f0-9]{64}$/u);
});

test("V-04 reject and supersede are append-only reducer outcomes", () => {
  const rejectedFixture = ownerCreateDriver();
  const rejectedResult = replay({
    intents: [rejectedFixture.intent],
    drivers: [rejectedFixture.driver],
    events: [
      candidateEvent(rejectedFixture.driver, rejectedFixture.intent),
      ownerDecisionEvent("reject", rejectedFixture.driver, rejectedFixture.intent),
    ],
  });
  assert.equal(rejectedResult.drivers[0].decision_application_state, "rejected");
  assert.equal(rejectedResult.tasks.length, 0);

  const original = ownerCreateDriver();
  const replacementIntent = createIntent(TASK_CANDIDATE_B);
  const replacement = ownerCreateDriver({
    intent: replacementIntent,
    trigger: OWNER_DECISION_B,
    supersedes: taskDriverRef(original.driver, original.intent),
  });
  const supersedeResult = replay({
    intents: [original.intent, replacement.intent],
    drivers: [original.driver, replacement.driver],
    events: [
      candidateEvent(original.driver, original.intent),
      candidateEvent(replacement.driver, replacement.intent, {
        event_sequence: 2,
        actor_kind: "human",
        actor_ref: ACTOR_OWNER,
        valid_at: T2,
        known_at: T2,
        recorded_at: T2,
      }),
      ownerDecisionEvent("supersede", original.driver, original.intent, {
        superseding_driver_ref: taskDriverRef(replacement.driver, replacement.intent),
      }),
    ],
  });
  const states = new Map(supersedeResult.drivers.map((row) => [row.driver_ref.entity_id, row.decision_application_state]));
  assert.equal(states.get(original.driver.driver_id), "superseded");
  assert.equal(states.get(replacement.driver.driver_id), "candidate");
});

test("V-05 exact duplicates are no-ops and conflicting idempotency payloads fail", () => {
  const fixture = ownerCreateDriver();
  const candidate = candidateEvent(fixture.driver, fixture.intent);
  const baseline = replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [candidate],
  });
  const noOp = replay({
    intents: [fixture.intent],
    drivers: [fixture.driver, structuredClone(fixture.driver)],
    events: [candidate, structuredClone(candidate)],
  });
  assert.deepEqual(noOp.receipts, {
    accepted_driver_count: 1,
    duplicate_driver_count: 1,
    accepted_event_count: 1,
    duplicate_event_count: 1,
  });
  assert.equal(noOp.projection_digest, baseline.projection_digest);

  const conflicting = ownerCreateDriver({
    intent: fixture.intent,
    recordedAt: T1,
  });
  assert.equal(conflicting.driver.idempotency_key, fixture.driver.idempotency_key);
  assert.notEqual(conflicting.driver.driver_digest, fixture.driver.driver_digest);
  assert.throws(() => replay({
    intents: [fixture.intent],
    drivers: [fixture.driver, conflicting.driver],
    events: [],
  }), errorCode("task_driver_idempotency_conflict"));
});

test("owner decisions require a human decision and apply must reuse the approved authority chain", () => {
  const fixture = ownerCreateDriver();
  assert.deepEqual(fixture.driver.owner_decision_ref, fixture.driver.trigger_event_ref);
  assert.throws(() => ownerDecisionEvent("approve", fixture.driver, fixture.intent, {
    actor_kind: "system",
    actor_ref: ACTOR_SYSTEM,
  }), errorCode("task_driver_event_owner_human_required"));

  const candidate = candidateEvent(fixture.driver, fixture.intent);
  const approved = ownerDecisionEvent("approve", fixture.driver, fixture.intent);
  assert.throws(() => replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [candidate, approved],
    authorityResolver: null,
  }), errorCode("task_driver_trusted_authority_resolver_required"));
  assert.throws(() => replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [candidate, approved],
    authorityResolver: (request) => authorityAttestation(request, { project_ref: PROJECT_B }),
  }), errorCode("task_driver_authority_attestation_binding_mismatch"));
  const forgedApply = ownerDecisionEvent("apply", fixture.driver, fixture.intent, {
    owner_decision_ref: OWNER_DECISION_B,
  });
  assert.throws(() => replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [candidate, approved, forgedApply],
  }), errorCode("task_driver_owner_decision_binding_mismatch"));

  const source = sourcePolicyFixture();
  const policyB = buildTaskDriverPolicy({
    policy_ref: POLICY_REF_B,
    allowed_driver_kinds: ["source_event"],
    allowed_trigger_owner_surfaces: ["source_event_ledger"],
    writer_ref: WRITER_B,
    valid_from: T0,
    valid_until: T9,
    known_at: T0,
    recorded_at: T0,
    supersedes_policy_ref: null,
  });
  assert.throws(() => replay({
    intents: [source.intent],
    drivers: [source.driver],
    policies: [source.policy, policyB],
    events: [
      candidateEvent(source.driver, source.intent),
      policyDecisionEvent("approve", source.driver, source.intent),
      policyDecisionEvent("apply", source.driver, source.intent, POLICY_REF_B, WRITER_B),
    ],
  }), errorCode("task_driver_apply_authority_chain_mismatch"));
});

test("V-06 LLM direct apply fails and deterministic policy passes only its exact gate", () => {
  const { intent, driver, policy } = sourcePolicyFixture();
  assert.throws(() => buildTaskDriverEvent({
    event_kind: "apply",
    event_sequence: 3,
    driver,
    intent,
    actor_kind: "llm",
    actor_ref: ACTOR_LLM,
    writer_ref: WRITER,
    authority_kind: "owner_decision",
    owner_decision_ref: OWNER_DECISION,
    policy_ref: null,
    valid_at: T3,
    known_at: T3,
    recorded_at: T3,
    result_project_ref: PROJECT,
    result_task_candidate_ref: TASK_CANDIDATE,
    result_task_ref: TASK,
    work_status_transition: { from: null, to: "not_started" },
    superseding_driver_ref: null,
  }), errorCode("task_driver_llm_direct_apply_forbidden"));

  const candidate = candidateEvent(driver, intent);
  const approved = policyDecisionEvent("approve", driver, intent);
  const applied = policyDecisionEvent("apply", driver, intent);
  const appliedResult = replay({
    intents: [intent],
    drivers: [driver],
    policies: [policy],
    events: [candidate, approved, applied],
  });
  assert.equal(appliedResult.drivers[0].decision_application_state, "applied");

  const expiredPolicy = buildTaskDriverPolicy({
    policy_ref: POLICY_REF,
    allowed_driver_kinds: ["source_event"],
    allowed_trigger_owner_surfaces: ["source_event_ledger"],
    writer_ref: WRITER,
    valid_from: T0,
    valid_until: T1,
    known_at: T0,
    recorded_at: T0,
    supersedes_policy_ref: null,
  });
  assert.throws(() => replay({
    intents: [intent],
    drivers: [driver],
    policies: [expiredPolicy],
    events: [candidate, approved],
  }), errorCode("task_driver_policy_expired"));
});

test("policy authority rejects knowledge or recording backdating and any post-revocation timestamp", () => {
  const { intent, driver } = sourcePolicyFixture();
  const narrowPolicy = buildTaskDriverPolicy({
    policy_ref: POLICY_REF,
    allowed_driver_kinds: ["source_event"],
    allowed_trigger_owner_surfaces: ["source_event_ledger"],
    writer_ref: WRITER,
    valid_from: T0,
    valid_until: T3,
    known_at: T0,
    recorded_at: T0,
    supersedes_policy_ref: null,
  });
  const backdatedApproval = policyDecisionEvent("approve", driver, intent, POLICY_REF, WRITER, {
    valid_at: T2,
    known_at: T4,
    recorded_at: T4,
  });
  assert.throws(() => replay({
    intents: [intent],
    drivers: [driver],
    policies: [narrowPolicy],
    events: [candidateEvent(driver, intent), backdatedApproval],
  }), errorCode("task_driver_policy_expired"));

  const policy = sourcePolicyFixture().policy;
  const revocation = buildTaskDriverPolicyRevocation({
    revocation_ref: POLICY_REVOCATION_REF,
    policy_ref: POLICY_REF,
    revoked_at: T3,
    known_at: T4,
    recorded_at: T4,
    owner_decision_ref: OWNER_DECISION,
  });
  const candidate = candidateEvent(driver, intent);
  const approved = policyDecisionEvent("approve", driver, intent);
  const postRevocationApply = policyDecisionEvent("apply", driver, intent, POLICY_REF, WRITER, {
    valid_at: T5,
    known_at: T5,
    recorded_at: T5,
  });
  const beforeRevocationKnowledge = replay({
    intents: [intent],
    drivers: [driver],
    policies: [policy],
    policyRevocations: [revocation],
    events: [candidate, approved, postRevocationApply],
    cutoff: { valid_at: T3, known_at: T3 },
  });
  assert.equal(beforeRevocationKnowledge.drivers[0].decision_application_state, "approved");
  assert.throws(() => replay({
    intents: [intent],
    drivers: [driver],
    policies: [policy],
    policyRevocations: [revocation],
    events: [candidate, approved, postRevocationApply],
    cutoff: { valid_at: T5, known_at: T5 },
  }), errorCode("task_driver_policy_revoked"));
});

test("V-07 completion feedback emits a follow-up candidate only", () => {
  const followup = createCompletionFollowupCandidate({
    project_ref: PROJECT,
    task_candidate_ref: typedRef("task_candidate", "dev_erp_task_engine", "candidate-followup-syn-013"),
    parent_task_ref: PARENT_TASK,
    completion_event_ref: COMPLETION_EVENT,
    actor_ref: ACTOR_LLM,
    writer_ref: WRITER,
    event_sequence: 1,
    valid_at: T1,
    known_at: T1,
    recorded_at: T1,
  });
  assert.equal(followup.driver.driver_kind, "completion_followup");
  assert.equal(followup.event.event_kind, "candidate");
  const result = replay({
    intents: [followup.intent],
    drivers: [followup.driver],
    events: [followup.event],
  });
  assert.equal(result.drivers[0].decision_application_state, "candidate");
  assert.equal(result.tasks.length, 0);

  assert.throws(() => buildTaskDriverEvent({
    event_kind: "approve",
    event_sequence: 2,
    driver: followup.driver,
    intent: followup.intent,
    actor_kind: "system",
    actor_ref: ACTOR_SYSTEM,
    writer_ref: WRITER,
    authority_kind: "deterministic_policy",
    owner_decision_ref: null,
    policy_ref: POLICY_REF,
    valid_at: T2,
    known_at: T2,
    recorded_at: T2,
    result_project_ref: null,
    result_task_candidate_ref: null,
    result_task_ref: null,
    work_status_transition: null,
    superseding_driver_ref: null,
  }), errorCode("task_driver_completion_followup_owner_review_required"));
});

test("V-08 bitemporal cutoffs are deterministic and future records have zero projection effect", () => {
  const { intent, driver } = ownerCreateDriver();
  const candidate = candidateEvent(driver, intent);
  const lateApproval = ownerDecisionEvent("approve", driver, intent, {
    valid_at: T2,
    known_at: T4,
    recorded_at: T4,
  });
  const beforeKnowledge = replay({
    intents: [intent],
    drivers: [driver],
    events: [lateApproval, candidate],
    cutoff: { valid_at: T3, known_at: T3 },
  });
  assert.equal(beforeKnowledge.drivers[0].decision_application_state, "candidate");
  const afterKnowledge = replay({
    intents: [intent],
    drivers: [driver],
    events: [lateApproval, candidate],
    cutoff: { valid_at: T3, known_at: T4 },
  });
  assert.equal(afterKnowledge.drivers[0].decision_application_state, "approved");

  const baseline = replay({
    intents: [intent],
    drivers: [driver],
    events: [candidate],
    cutoff: { valid_at: T3, known_at: T3 },
  });
  const future = ownerCreateDriver({
    intent: createIntent(TASK_CANDIDATE_B),
    trigger: OWNER_DECISION_B,
    validAt: T4,
    knownAt: T4,
    recordedAt: T4,
  });
  const futureCandidate = candidateEvent(future.driver, future.intent, {
    event_sequence: 10,
    valid_at: T5,
    known_at: T5,
    recorded_at: T5,
  });
  const withFuture = replay({
    intents: [intent, future.intent],
    drivers: [driver, future.driver, structuredClone(future.driver)],
    events: [candidate, futureCandidate, structuredClone(futureCandidate), lateApproval],
    cutoff: { valid_at: T3, known_at: T3 },
  });
  assert.equal(canonicalStringify(withFuture), canonicalStringify(baseline));
  assert.equal(withFuture.projection_digest, baseline.projection_digest);

  const fixture = ownerAppliedFixture();
  const immutableInput = {
    intents: [fixture.intent],
    drivers: [fixture.driver],
    policies: [],
    policy_revocations: [],
    events: [fixture.applied, fixture.candidate, fixture.approved],
    initial_tasks: [],
    cutoff: { valid_at: T5, known_at: T5 },
  };
  const inputBefore = canonicalStringify(immutableInput);
  const first = replayTaskDriverContract(immutableInput, {
    trusted_authority_resolver: trustedAuthorityResolver,
  });
  const second = replayTaskDriverContract({
    ...immutableInput,
    intents: [...immutableInput.intents].reverse(),
    drivers: [...immutableInput.drivers].reverse(),
    events: [...immutableInput.events].reverse(),
  }, { trusted_authority_resolver: trustedAuthorityResolver });
  assert.equal(canonicalStringify(immutableInput), inputBefore);
  assert.equal(canonicalStringify(first), canonicalStringify(second));
  assert.equal(first.projection_digest, second.projection_digest);
});

test("event sequence is unique and authoritative while recorded_at may be equal but never regress", () => {
  const fixture = ownerCreateDriver();
  assert.throws(() => candidateEvent(fixture.driver, fixture.intent, {
    event_sequence: 0,
  }), errorCode("task_driver_event_sequence_invalid"));
  assert.throws(() => candidateEvent(fixture.driver, fixture.intent, {
    event_sequence: Number.MAX_SAFE_INTEGER + 1,
  }), errorCode("task_driver_event_sequence_invalid"));
  const sameTime = T2;
  const sameTimeResult = replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [
      candidateEvent(fixture.driver, fixture.intent, {
        valid_at: sameTime,
        known_at: sameTime,
        recorded_at: sameTime,
      }),
      ownerDecisionEvent("approve", fixture.driver, fixture.intent, {
        valid_at: sameTime,
        known_at: sameTime,
        recorded_at: sameTime,
      }),
      ownerDecisionEvent("apply", fixture.driver, fixture.intent, {
        valid_at: sameTime,
        known_at: sameTime,
        recorded_at: sameTime,
      }),
    ],
  });
  assert.equal(sameTimeResult.drivers[0].decision_application_state, "applied");

  const conflictingSequence = candidateEvent(fixture.driver, fixture.intent, {
    event_kind: "review_required",
    actor_kind: "human",
    actor_ref: ACTOR_OWNER,
  });
  assert.throws(() => replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [candidateEvent(fixture.driver, fixture.intent), conflictingSequence],
  }), errorCode("task_driver_event_sequence_conflict"));

  const laterCandidate = candidateEvent(fixture.driver, fixture.intent, {
    valid_at: T2,
    known_at: T2,
    recorded_at: T2,
  });
  const earlierApproval = ownerDecisionEvent("approve", fixture.driver, fixture.intent, {
    valid_at: T1,
    known_at: T1,
    recorded_at: T1,
  });
  assert.throws(() => replay({
    intents: [fixture.intent],
    drivers: [fixture.driver],
    events: [earlierApproval, laterCandidate],
  }), errorCode("task_driver_event_recorded_at_regression"));
});

test("apply results bind exactly to project, candidate, task owner, and intent target", () => {
  assert.throws(() => createIntent(TASK_CANDIDATE, FOREIGN_PROJECT), errorCode("task_intent_project_owner_invalid"));
  assert.throws(() => createIntent(FOREIGN_TASK_CANDIDATE), errorCode("task_intent_task_candidate_owner_invalid"));
  const fixture = ownerCreateDriver();
  assert.throws(() => ownerDecisionEvent("apply", fixture.driver, fixture.intent, {
    result_project_ref: PROJECT_B,
  }), errorCode("task_driver_event_apply_result_invalid"));
  assert.throws(() => ownerDecisionEvent("apply", fixture.driver, fixture.intent, {
    result_task_candidate_ref: TASK_CANDIDATE_B,
  }), errorCode("task_driver_event_apply_transition_mismatch"));
  assert.throws(() => ownerDecisionEvent("apply", fixture.driver, fixture.intent, {
    result_task_ref: FOREIGN_TASK,
  }), errorCode("task_driver_event_result_task_owner_invalid"));

  const transition = buildTaskIntent({
    intent_kind: "work_status_transition",
    project_ref: PROJECT,
    task_ref: TASK,
    expected_from_state_or_revision: "blocked",
    proposed_to_state_or_patch: "in_progress",
  });
  const transitionDriver = ownerCreateDriver({ intent: transition });
  assert.throws(() => ownerDecisionEvent("apply", transitionDriver.driver, transition, {
    result_task_candidate_ref: TASK_CANDIDATE,
  }), errorCode("task_driver_event_apply_transition_mismatch"));
  assert.throws(() => replay({
    intents: [transition],
    drivers: [transitionDriver.driver],
    events: [
      candidateEvent(transitionDriver.driver, transition),
      ownerDecisionEvent("approve", transitionDriver.driver, transition),
      ownerDecisionEvent("apply", transitionDriver.driver, transition),
    ],
    initialTasks: [initialTask("blocked", PROJECT_B)],
  }), errorCode("task_driver_task_project_membership_mismatch"));

  const patchIntent = buildTaskIntent({
    intent_kind: "field_patch",
    project_ref: PROJECT,
    task_ref: TASK,
    expected_from_state_or_revision: TASK_REVISION,
    proposed_to_state_or_patch: TASK_REVISION_B,
  });
  const patchDriver = ownerCreateDriver({ intent: patchIntent });
  assert.throws(
    () => ownerDecisionEvent("apply", patchDriver.driver, patchIntent),
    errorCode("task_driver_field_patch_apply_unsupported"),
  );
  assert.throws(() => replay({
    intents: [],
    drivers: [],
    events: [],
    initialTasks: [initialTask("blocked", PROJECT, FOREIGN_TASK)],
  }), errorCode("task_driver_initial_task_owner_invalid"));
  assert.throws(() => replay({
    intents: [],
    drivers: [],
    events: [],
    initialTasks: [{ project_ref: PROJECT, task_ref: TASK, work_status: "blocked" }],
  }), errorCode("task_driver_initial_task_invalid"));
});

test("driver reasons accept only the exact kind-specific structured template identifier", () => {
  const invalidTemplates = [
    `${TASK_DRIVER_REASON_TEMPLATES.owner_request}\u200b`,
    TASK_DRIVER_REASON_TEMPLATES.source_event,
    "ｔａｓｋ＿ｄｒｉｖｅｒ.reason.owner_request.v1",
    "소유자 요청",
  ];
  for (const reasonTemplateId of invalidTemplates) {
    assert.throws(
      () => ownerCreateDriver({ reasonTemplateId }),
      errorCode("task_driver_reason_template_invalid"),
    );
  }
});

test("canonicalization and replay preflight reject unsafe or resource-exhausting inputs contractually", () => {
  assert.throws(() => canonicalStringify(1.25), errorCode("task_driver_canonical_safe_integer_required"));
  assert.throws(
    () => canonicalStringify(Number.MAX_SAFE_INTEGER + 1),
    errorCode("task_driver_canonical_safe_integer_required"),
  );
  assert.throws(
    () => canonicalStringify(Array(TASK_DRIVER_LIMITS.canonical_max_array_length + 1).fill(null)),
    errorCode("task_driver_canonical_array_too_large"),
  );
  const tooWide = Object.fromEntries(Array.from(
    { length: TASK_DRIVER_LIMITS.canonical_max_object_keys + 1 },
    (_, index) => [`k${index}`, null],
  ));
  assert.throws(() => canonicalStringify(tooWide), errorCode("task_driver_canonical_object_too_large"));

  const deeplyNested = {};
  let cursor = deeplyNested;
  for (let index = 0; index < 20000; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  assert.throws(() => canonicalStringify(deeplyNested), (error) => (
    error instanceof TaskDriverContractError
    && error.code === "task_driver_canonical_depth_exceeded"
    && !(error instanceof RangeError)
  ));

  assert.throws(() => replayTaskDriverContract({
    intents: Array(TASK_DRIVER_LIMITS.replay_max_records_per_collection + 1).fill(null),
    drivers: [],
    policies: [],
    policy_revocations: [],
    events: [],
    initial_tasks: [],
    cutoff: { valid_at: T9, known_at: T9 },
  }), errorCode("task_driver_replay_collection_too_large"));
});

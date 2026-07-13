import test from "node:test";
import assert from "node:assert/strict";

import { openStore } from "../src/store.mjs";
import {
  TASK_DRIVER_AUTHORITY_ATTESTATION_SCHEMA_VERSION,
  TASK_DRIVER_REASON_TEMPLATES,
  buildTaskDriver,
  buildTaskDriverEvent,
  buildTaskIntent,
  canonicalDigest,
  createCompletionFollowupCandidate,
  typedRef,
} from "../src/task_driver.mjs";
import {
  TASK_DRIVER_WRITER_ATTESTATION_SCHEMA_VERSION,
  TaskDriverPersistenceError,
  applyTaskDriverDecisionSet,
  buildTaskCandidateSpec,
  installTaskDriverPersistence,
} from "../src/task_driver_persistence.mjs";

const T0 = "2026-07-13T00:00:00.000Z";
const T1 = "2026-07-13T00:01:00.000Z";
const T2 = "2026-07-13T00:02:00.000Z";
const T3 = "2026-07-13T00:03:00.000Z";
const T4 = "2026-07-13T00:04:00.000Z";
const T5 = "2026-07-13T00:05:00.000Z";
const T6 = "2026-07-13T00:06:00.000Z";
const T7 = "2026-07-13T00:07:00.000Z";
const T8 = "2026-07-13T00:08:00.000Z";
const T9 = "2026-07-13T00:09:00.000Z";

const PROJECT = typedRef("project", "dev_erp", "P-SYN-PERSIST");
const TASK = typedRef("task", "dev_erp", "task-syn-persist-001");
const CANDIDATE = typedRef(
  "task_candidate",
  "dev_erp_task_engine",
  "candidate-syn-persist-001",
);
const FOLLOWUP_CANDIDATE = typedRef(
  "task_candidate",
  "dev_erp_task_engine",
  "candidate-syn-persist-followup",
);
const OWNER_DECISION = typedRef(
  "owner_decision",
  "owner_decision_ledger",
  "decision-syn-persist-create",
);
const OWNER_DECISION_STATUS = typedRef(
  "owner_decision",
  "owner_decision_ledger",
  "decision-syn-persist-status",
);
const SOURCE_REVISION = typedRef(
  "source_revision",
  "source_metadata",
  "sr_syn_persist",
);
const ACTOR_LLM = typedRef("actor", "dev_erp", "actor-syn-llm");
const ACTOR_OWNER = typedRef("actor", "dev_erp", "actor-syn-owner");
const ACTOR_SYSTEM = typedRef("actor", "dev_erp", "actor-syn-system");
const WRITER = typedRef("writer", "dev_erp_task_engine", "writer-syn-primary");
const AUTHORITY_BASIS_DIGEST = canonicalDigest({
  node_role: "operational_primary",
  sole_writer: true,
  source: "synthetic_test",
});

function errorCode(code) {
  return (error) => error instanceof TaskDriverPersistenceError && error.code === code;
}

function authorityAttestation(request) {
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
    policy_digest: request.policy_digest,
  };
  return {
    ...payload,
    evidence_digest: canonicalDigest(
      payload,
      "soulforge.task_driver.authority_attestation.v2",
    ),
  };
}

function writerAttestation(request, overrides = {}) {
  const payload = {
    schema_version: TASK_DRIVER_WRITER_ATTESTATION_SCHEMA_VERSION,
    project_ref: request.project_ref,
    writer_ref: request.writer_ref,
    driver_ref: request.driver_ref,
    driver_digest: request.driver_digest,
    event_digests: request.event_digests,
    candidate_digest: request.candidate_digest,
    operation: request.operation,
    node_role: "operational_primary",
    sole_writer: true,
    approved: true,
    authority_basis_digest: AUTHORITY_BASIS_DIGEST,
    ...overrides,
  };
  return {
    ...payload,
    evidence_digest: canonicalDigest(
      payload,
      "soulforge.task_driver.writer_attestation.v1",
    ),
  };
}

function trustedWriterResolver(request) {
  return writerAttestation(request);
}

function createStore() {
  const store = openStore(":memory:");
  installTaskDriverPersistence(store.db);
  store.db.prepare(
    "INSERT INTO core_project(id,title,data_label) VALUES(?,?,?)",
  ).run(PROJECT.entity_id, "Synthetic persistence project", "synthetic");
  return store;
}

function buildCreateDecisionSet() {
  const candidate = buildTaskCandidateSpec({
    candidate_ref: CANDIDATE,
    project_ref: PROJECT,
    title: "Synthetic TaskDriver persistence task",
    initial_work_status: "not_started",
    due: null,
    work_type: "verify",
    completion_criteria: "All persistence assertions pass.",
    source_revision_refs: [SOURCE_REVISION],
    created_at: T0,
  });
  const intent = buildTaskIntent({
    intent_kind: "task_create",
    project_ref: PROJECT,
    task_candidate_ref: CANDIDATE,
    expected_from_state_or_revision: null,
    proposed_to_state_or_patch: { initial_work_status: "not_started" },
  });
  const driver = buildTaskDriver({
    driver_kind: "owner_request",
    intent,
    trigger_event_ref: OWNER_DECISION,
    source_revision_refs: [SOURCE_REVISION],
    why_code: "owner_request",
    reason_template_id: TASK_DRIVER_REASON_TEMPLATES.owner_request,
    valid_at: T0,
    known_at: T0,
    recorded_at: T0,
  });
  const common = {
    driver,
    intent,
    writer_ref: WRITER,
    policy_ref: null,
    result_project_ref: null,
    result_task_candidate_ref: null,
    result_task_ref: null,
    work_status_transition: null,
    superseding_driver_ref: null,
  };
  const candidateEvent = buildTaskDriverEvent({
    ...common,
    event_kind: "candidate",
    event_sequence: 1,
    actor_kind: "llm",
    actor_ref: ACTOR_LLM,
    authority_kind: "none",
    owner_decision_ref: null,
    valid_at: T1,
    known_at: T1,
    recorded_at: T1,
  });
  const approved = buildTaskDriverEvent({
    ...common,
    event_kind: "approve",
    event_sequence: 2,
    actor_kind: "human",
    actor_ref: ACTOR_OWNER,
    authority_kind: "owner_decision",
    owner_decision_ref: OWNER_DECISION,
    valid_at: T2,
    known_at: T2,
    recorded_at: T2,
  });
  const applied = buildTaskDriverEvent({
    ...common,
    event_kind: "apply",
    event_sequence: 3,
    actor_kind: "system",
    actor_ref: ACTOR_SYSTEM,
    authority_kind: "owner_decision",
    owner_decision_ref: OWNER_DECISION,
    valid_at: T3,
    known_at: T3,
    recorded_at: T3,
    result_project_ref: PROJECT,
    result_task_candidate_ref: CANDIDATE,
    result_task_ref: TASK,
    work_status_transition: { from: null, to: "not_started" },
  });
  return {
    candidate,
    intent,
    driver,
    policies: [],
    policy_revocations: [],
    events: [candidateEvent, approved, applied],
    cutoff: { valid_at: T9, known_at: T9 },
  };
}

function buildStatusDecisionSet() {
  const intent = buildTaskIntent({
    intent_kind: "work_status_transition",
    project_ref: PROJECT,
    task_ref: TASK,
    expected_from_state_or_revision: "not_started",
    proposed_to_state_or_patch: "in_progress",
  });
  const driver = buildTaskDriver({
    driver_kind: "owner_request",
    intent,
    trigger_event_ref: OWNER_DECISION_STATUS,
    why_code: "owner_request",
    reason_template_id: TASK_DRIVER_REASON_TEMPLATES.owner_request,
    valid_at: T4,
    known_at: T4,
    recorded_at: T4,
  });
  const common = {
    driver,
    intent,
    writer_ref: WRITER,
    policy_ref: null,
    result_project_ref: null,
    result_task_candidate_ref: null,
    result_task_ref: null,
    work_status_transition: null,
    superseding_driver_ref: null,
  };
  return {
    candidate: null,
    intent,
    driver,
    policies: [],
    policy_revocations: [],
    events: [
      buildTaskDriverEvent({
        ...common,
        event_kind: "candidate",
        event_sequence: 4,
        actor_kind: "llm",
        actor_ref: ACTOR_LLM,
        authority_kind: "none",
        owner_decision_ref: null,
        valid_at: T4,
        known_at: T4,
        recorded_at: T4,
      }),
      buildTaskDriverEvent({
        ...common,
        event_kind: "approve",
        event_sequence: 5,
        actor_kind: "human",
        actor_ref: ACTOR_OWNER,
        authority_kind: "owner_decision",
        owner_decision_ref: OWNER_DECISION_STATUS,
        valid_at: T5,
        known_at: T5,
        recorded_at: T5,
      }),
      buildTaskDriverEvent({
        ...common,
        event_kind: "apply",
        event_sequence: 6,
        actor_kind: "system",
        actor_ref: ACTOR_SYSTEM,
        authority_kind: "owner_decision",
        owner_decision_ref: OWNER_DECISION_STATUS,
        valid_at: T6,
        known_at: T6,
        recorded_at: T6,
        result_project_ref: PROJECT,
        result_task_ref: TASK,
        work_status_transition: { from: "not_started", to: "in_progress" },
      }),
    ],
    cutoff: { valid_at: T9, known_at: T9 },
  };
}

const OPTIONS = Object.freeze({
  trusted_authority_resolver: authorityAttestation,
  trusted_writer_resolver: trustedWriterResolver,
});

test("explicit install creates append-only TaskDriver ledger tables", () => {
  const store = createStore();
  const fixture = buildCreateDecisionSet();
  applyTaskDriverDecisionSet(store.db, fixture, OPTIONS);
  assert.throws(
    () => store.db.prepare(
      "UPDATE task_driver_record SET driver_digest=driver_digest WHERE driver_id=?",
    ).run(fixture.driver.driver_id),
    /task_driver_append_only/u,
  );
  assert.throws(
    () => store.db.prepare("DELETE FROM task_driver_event WHERE event_id=?").run(
      fixture.events[0].event_id,
    ),
    /task_driver_append_only/u,
  );
  store.db.close();
});

test("create apply is atomic, materializes one core task, and exact retry is a no-op", () => {
  const store = createStore();
  const fixture = buildCreateDecisionSet();
  const first = applyTaskDriverDecisionSet(store.db, fixture, OPTIONS);
  assert.equal(first.apply_receipt.after_work_status, "not_started");
  const createdItem = store.db.prepare(
    "SELECT project_id,status,title,source_lineage_ref FROM core_item WHERE id=?",
  ).get(TASK.entity_id);
  assert.deepEqual(
    {
      project_id: createdItem.project_id,
      status: createdItem.status,
      title: createdItem.title,
    },
    {
      project_id: PROJECT.entity_id,
      status: "open",
      title: fixture.candidate.title,
    },
  );
  assert.deepEqual(JSON.parse(createdItem.source_lineage_ref), fixture.candidate.source_revision_refs);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_event").get().n,
    3,
  );
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='task_driver_apply'").get().n,
    1,
  );
  const second = applyTaskDriverDecisionSet(store.db, fixture, OPTIONS);
  assert.equal(second.apply_receipt.receipt_digest, first.apply_receipt.receipt_digest);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='task_driver_apply'").get().n,
    1,
  );
  store.db.close();
});

test("a later status driver replays the created task and updates the same core_item", () => {
  const store = createStore();
  applyTaskDriverDecisionSet(store.db, buildCreateDecisionSet(), OPTIONS);
  const result = applyTaskDriverDecisionSet(store.db, buildStatusDecisionSet(), OPTIONS);
  assert.equal(result.apply_receipt.before_work_status, "not_started");
  assert.equal(result.apply_receipt.after_work_status, "in_progress");
  assert.equal(
    store.db.prepare("SELECT status FROM core_item WHERE id=?").get(TASK.entity_id).status,
    "doing",
  );
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM core_item WHERE id=?").get(TASK.entity_id).n,
    1,
  );
  store.db.close();
});

test("an apply event outside the replay cutoff is rejected before ledger or core persistence", () => {
  const store = createStore();
  const fixture = buildCreateDecisionSet();
  fixture.cutoff = { valid_at: T2, known_at: T2 };
  assert.throws(
    () => applyTaskDriverDecisionSet(store.db, fixture, OPTIONS),
    errorCode("task_driver_persistence_apply_not_visible_at_cutoff"),
  );
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_event").get().n, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM core_item").get().n, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_apply_receipt").get().n, 0);
  store.db.close();
});

test("the same immutable event can be replayed at a later cutoff", () => {
  const store = createStore();
  const early = buildCreateDecisionSet();
  early.cutoff = { valid_at: T3, known_at: T3 };
  const first = applyTaskDriverDecisionSet(store.db, early, OPTIONS);
  const later = buildCreateDecisionSet();
  later.cutoff = { valid_at: T9, known_at: T9 };
  const second = applyTaskDriverDecisionSet(store.db, later, OPTIONS);
  assert.equal(second.apply_receipt.receipt_digest, first.apply_receipt.receipt_digest);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_event").get().n, 3);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM core_item").get().n, 1);
  store.db.close();
});

test("current core_item drift blocks a stale ledger projection instead of overwriting task truth", () => {
  const store = createStore();
  applyTaskDriverDecisionSet(store.db, buildCreateDecisionSet(), OPTIONS);
  store.db.prepare("UPDATE core_item SET status='done' WHERE id=?").run(TASK.entity_id);
  assert.throws(
    () => applyTaskDriverDecisionSet(store.db, buildStatusDecisionSet(), OPTIONS),
    errorCode("task_driver_persistence_core_state_drift"),
  );
  assert.equal(
    store.db.prepare("SELECT status FROM core_item WHERE id=?").get(TASK.entity_id).status,
    "done",
  );
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_event").get().n, 3);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_apply_receipt").get().n, 1);
  store.db.close();
});

test("completion feedback persists a candidate and ledger only, never a core task", () => {
  const store = createStore();
  const parentTask = typedRef("task", "dev_erp", "task-parent-syn-persist");
  const completionEvent = typedRef(
    "event",
    "dev_erp_task_events",
    "completion-syn-persist",
  );
  const followup = createCompletionFollowupCandidate({
    project_ref: PROJECT,
    task_candidate_ref: FOLLOWUP_CANDIDATE,
    parent_task_ref: parentTask,
    completion_event_ref: completionEvent,
    actor_ref: ACTOR_LLM,
    writer_ref: WRITER,
    event_sequence: 1,
    valid_at: T7,
    known_at: T7,
    recorded_at: T7,
  });
  const candidate = buildTaskCandidateSpec({
    candidate_ref: FOLLOWUP_CANDIDATE,
    project_ref: PROJECT,
    title: "Synthetic completion follow-up candidate",
    initial_work_status: "not_started",
    due: null,
    work_type: "verify",
    completion_criteria: "Owner reviews the follow-up candidate.",
    source_revision_refs: [],
    created_at: T7,
  });
  const result = applyTaskDriverDecisionSet(store.db, {
    candidate,
    intent: followup.intent,
    driver: followup.driver,
    policies: [],
    policy_revocations: [],
    events: [followup.event],
    cutoff: { valid_at: T9, known_at: T9 },
  }, OPTIONS);
  assert.equal(result.apply_receipt, null);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_candidate").get().n,
    1,
  );
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM core_item").get().n, 0);
  store.db.close();
});

test("missing or non-primary writer authority rolls back every ledger and core change", () => {
  const store = createStore();
  const fixture = buildCreateDecisionSet();
  assert.throws(() => applyTaskDriverDecisionSet(store.db, fixture, {
    trusted_authority_resolver: authorityAttestation,
    trusted_writer_resolver: null,
  }), errorCode("task_driver_trusted_writer_resolver_required"));
  assert.throws(() => applyTaskDriverDecisionSet(store.db, fixture, {
    trusted_authority_resolver: authorityAttestation,
    trusted_writer_resolver: (request) => writerAttestation(request, {
      node_role: "public_only",
    }),
  }), errorCode("task_driver_writer_attestation_binding_mismatch"));
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM task_driver_event").get().n, 0);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM core_item").get().n, 0);
  store.db.close();
});

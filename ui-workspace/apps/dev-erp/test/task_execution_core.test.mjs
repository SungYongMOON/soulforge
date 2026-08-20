import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTaskExecutionCore } from "../src/task_execution_core.mjs";
import { SqliteEventStore } from "../src/task_execution_sqlite_event_store.mjs";
import {
  FixtureLinearTaskProvider,
  MockExecutor,
} from "../src/task_execution_fixture_adapters.mjs";

const fixture = JSON.parse(readFileSync(
  new URL("../../../../docs/architecture/workspace/examples/task_execution_core_poc/task_execution_core.synthetic.json", import.meta.url),
  "utf8",
));

test("the feature-OFF SQLite EventStore refuses every persistent filename", () => {
  assert.throws(
    () => new SqliteEventStore({ filename: "fixture.db" }),
    (error) => error?.name === "TaskExecutionStoreError"
      && error?.code === "TASK_EXECUTION_PERSISTENCE_FORBIDDEN"
      && !String(error?.message).includes("fixture.db"),
  );
});

test("an eligible Official Todo produces a succeeded immutable receipt without completing or mutating the Official Task", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [fixture.task] });
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });

  const dispatch = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });

  assert.deepEqual({
    dispatch_status: dispatch.status,
    agent_run_status: dispatch.agent_run.status,
    receipt_outcome: dispatch.execution_receipt.outcome,
    completion_criteria_met: dispatch.execution_receipt.completion_criteria_met,
    official_task_done: dispatch.execution_receipt.official_task_done,
    official_task_mutated: dispatch.execution_receipt.official_task_mutated,
  }, {
    dispatch_status: "succeeded",
    agent_run_status: "succeeded",
    receipt_outcome: "succeeded",
    completion_criteria_met: true,
    official_task_done: false,
    official_task_mutated: false,
  });
  assert.equal(Object.isFrozen(dispatch.execution_receipt), true);
  assert.throws(() => {
    dispatch.execution_receipt.official_task_mutated = true;
  }, TypeError);
});

test("an eligible Official Todo with missing input stops in Waiting with an explicit next action owner", async (t) => {
  const waitingCase = fixture.waiting_case;
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [waitingCase.task] });
  const executor = new MockExecutor({ outcome: waitingCase.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[waitingCase.executor.executor_ref, executor]]),
    clock: () => waitingCase.clock.instant,
  });

  const dispatch = await core.dispatch({
    task_ref: waitingCase.task.task_ref,
    idempotency_key: waitingCase.dispatch.idempotency_key,
  });
  const receipt = dispatch.execution_receipt;
  const waitingInfo = receipt.waiting_info;

  assert.deepEqual({
    dispatch_status: dispatch.status,
    agent_run_status: dispatch.agent_run.status,
    receipt_outcome: receipt.outcome,
    completion_criteria_met: receipt.completion_criteria_met,
    official_task_done: receipt.official_task_done,
    official_task_mutated: receipt.official_task_mutated,
  }, {
    dispatch_status: "waiting",
    agent_run_status: "waiting",
    receipt_outcome: "waiting",
    completion_criteria_met: false,
    official_task_done: false,
    official_task_mutated: false,
  });
  assert.equal(typeof waitingInfo.reason, "string");
  assert.ok(waitingInfo.reason.trim().length > 0);
  assert.equal(typeof waitingInfo.required_input, "string");
  assert.ok(waitingInfo.required_input.trim().length > 0);
  assert.equal(typeof waitingInfo.next_action_owner, "string");
  assert.ok(waitingInfo.next_action_owner.trim().length > 0);
  assert.equal(waitingInfo.reply_or_due_date, "2026-08-21");
  assert.equal(typeof waitingInfo.manager_decision_required, "boolean");
});

test("an active Waiting AgentRun blocks a second claim without invoking the Executor or creating another receipt", async (t) => {
  const waitingCase = fixture.waiting_case;
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [waitingCase.task] });
  const executor = new MockExecutor({ outcome: waitingCase.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[waitingCase.executor.executor_ref, executor]]),
    clock: () => waitingCase.clock.instant,
  });

  const first = await core.dispatch({
    task_ref: waitingCase.task.task_ref,
    idempotency_key: waitingCase.dispatch.idempotency_key,
  });
  const second = await core.dispatch({
    task_ref: waitingCase.task.task_ref,
    idempotency_key: waitingCase.dispatch.second_idempotency_key,
  });
  const observed = await core.readExecution({ task_ref: waitingCase.task.task_ref });

  assert.deepEqual({
    status: second.status,
    reason_code: second.reason_code,
    active_run_id: second.agent_run.run_id,
    second_receipt: second.execution_receipt,
    observed_receipt_id: observed.execution_receipt.receipt_id,
    executor_call_count: executor.call_count,
  }, {
    status: "not_dispatched",
    reason_code: "ACTIVE_AGENT_RUN_EXISTS",
    active_run_id: first.agent_run.run_id,
    second_receipt: null,
    observed_receipt_id: first.execution_receipt.receipt_id,
    executor_call_count: 1,
  });
});

test("an executor crash leaves one running AgentRun and holds the same-idempotency retry for explicit recovery", async (t) => {
  const crashCase = fixture.crash_case;
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [crashCase.task] });
  const executor = new MockExecutor({ outcome: crashCase.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[crashCase.executor.executor_ref, executor]]),
    clock: () => crashCase.clock.instant,
  });

  let crashError = null;
  try {
    await core.dispatch({
      task_ref: crashCase.task.task_ref,
      idempotency_key: crashCase.dispatch.idempotency_key,
    });
  } catch (error) {
    crashError = error;
  }
  const afterCrash = await core.readExecution({ task_ref: crashCase.task.task_ref });

  let retry = null;
  let retryError = null;
  try {
    retry = await core.dispatch({
      task_ref: crashCase.task.task_ref,
      idempotency_key: crashCase.dispatch.idempotency_key,
    });
  } catch (error) {
    retryError = error;
  }
  const afterRetry = await core.readExecution({ task_ref: crashCase.task.task_ref });

  assert.deepEqual({
    crash_error_name: crashError?.name ?? null,
    crash_error_code: crashError?.code ?? null,
    raw_message_exposed: String(crashError?.message ?? "").includes(crashCase.executor.outcome.raw_message),
    after_crash_status: afterCrash.agent_run.status,
    after_crash_receipt: afterCrash.execution_receipt,
    retry_error: retryError,
    retry_status: retry?.status ?? null,
    retry_reason_code: retry?.reason_code ?? null,
    retry_run_id: retry?.agent_run?.run_id ?? null,
    retry_receipt: retry?.execution_receipt ?? null,
    after_retry_receipt: afterRetry.execution_receipt,
    executor_call_count: executor.call_count,
  }, {
    crash_error_name: "TaskExecutionCoreError",
    crash_error_code: "EXECUTOR_CRASHED",
    raw_message_exposed: false,
    after_crash_status: "running",
    after_crash_receipt: null,
    retry_error: null,
    retry_status: "held",
    retry_reason_code: "RUN_RECOVERY_REQUIRED",
    retry_run_id: afterCrash.agent_run.run_id,
    retry_receipt: null,
    after_retry_receipt: null,
    executor_call_count: 1,
  });
});

test("a provider event is appended once, preserves all source clocks, and rejects an identity conflict", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [fixture.task] });
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });

  const first = await core.ingestEvent(fixture.provider_event);
  const duplicate = await core.ingestEvent(fixture.provider_event);
  const observed = await core.readExecution({ task_ref: fixture.task.task_ref });

  let conflictError = null;
  try {
    await core.ingestEvent(fixture.provider_event_conflict);
  } catch (error) {
    conflictError = error;
  }

  assert.deepEqual({
    first_status: first.status,
    duplicate_status: duplicate.status,
    same_event_id: duplicate.event_id === first.event_id,
    same_digest: duplicate.payload_digest === first.payload_digest,
    task_event_count: observed.task_events.length,
    task_event_id: observed.task_events[0].event_id,
    task_event_digest: observed.task_events[0].payload_digest,
    occurred_at: observed.task_events[0].occurred_at,
    received_at: observed.task_events[0].received_at,
    ingested_at: observed.task_events[0].ingested_at,
    distinct_clock_count: new Set([
      observed.task_events[0].occurred_at,
      observed.task_events[0].received_at,
      observed.task_events[0].ingested_at,
    ]).size,
    raw_payload_exposed: Object.hasOwn(observed.task_events[0], "payload")
      || Object.hasOwn(observed.task_events[0], "raw_payload"),
    conflict_error_name: conflictError?.name ?? null,
    conflict_error_code: conflictError?.code ?? null,
  }, {
    first_status: "accepted",
    duplicate_status: "duplicate",
    same_event_id: true,
    same_digest: true,
    task_event_count: 1,
    task_event_id: first.event_id,
    task_event_digest: fixture.provider_event.payload_digest,
    occurred_at: fixture.provider_event.occurred_at,
    received_at: fixture.provider_event.received_at,
    ingested_at: fixture.provider_event.ingested_at,
    distinct_clock_count: 3,
    raw_payload_exposed: false,
    conflict_error_name: "TaskExecutionCoreError",
    conflict_error_code: "PROVIDER_EVENT_CONFLICT",
  });
});

test("a Candidate TaskRef is rejected before provider read, claim, or Executor invocation", async (t) => {
  const candidateCase = fixture.candidate_case;
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [candidateCase.task] });
  const executor = new MockExecutor({ outcome: candidateCase.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[candidateCase.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });

  const dispatch = await core.dispatch({
    task_ref: candidateCase.task.task_ref,
    idempotency_key: candidateCase.dispatch.idempotency_key,
  });
  const observed = await core.readExecution({ task_ref: candidateCase.task.task_ref });

  assert.deepEqual({
    status: dispatch.status,
    reason_code: dispatch.reason_code,
    agent_run: dispatch.agent_run,
    execution_receipt: dispatch.execution_receipt,
    official_task_mutated: dispatch.official_task_mutated,
    provider_read_count: taskProvider.read_count,
    executor_call_count: executor.call_count,
    observed_agent_run: observed.agent_run,
    observed_execution_receipt: observed.execution_receipt,
    observed_task_events: observed.task_events,
  }, {
    status: "not_dispatched",
    reason_code: "CANDIDATE_NOT_EXECUTABLE",
    agent_run: null,
    execution_receipt: null,
    official_task_mutated: false,
    provider_read_count: 0,
    executor_call_count: 0,
    observed_agent_run: null,
    observed_execution_receipt: null,
    observed_task_events: [],
  });
});

test("the same idempotency key replays one terminal success without invoking the Executor again", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [fixture.task] });
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });

  const first = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });
  const replay = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });
  const observed = await core.readExecution({ task_ref: fixture.task.task_ref });

  assert.deepEqual({
    first_status: first.status,
    replay_status: replay.status,
    replayed: replay.replayed,
    same_run_id: replay.agent_run.run_id === first.agent_run.run_id,
    same_receipt_id: replay.execution_receipt?.receipt_id === first.execution_receipt.receipt_id,
    executor_call_count: executor.call_count,
    observed_run_id: observed.agent_run.run_id,
    observed_receipt_id: observed.execution_receipt.receipt_id,
  }, {
    first_status: "succeeded",
    replay_status: "succeeded",
    replayed: true,
    same_run_id: true,
    same_receipt_id: true,
    executor_call_count: 1,
    observed_run_id: first.agent_run.run_id,
    observed_receipt_id: first.execution_receipt.receipt_id,
  });
});

test("ineligible Official Tasks return stable guard reasons without claim or Executor work", async (t) => {
  const cases = [
    {
      label: "status is not Todo",
      reason_code: "TASK_STATUS_NOT_TODO",
      mutate(task) { task.status = "In Progress"; },
    },
    {
      label: "Work Brief is missing",
      reason_code: "WORK_BRIEF_MISSING",
      mutate(task) { task.work_brief = null; },
    },
    {
      label: "Executor is not assigned",
      reason_code: "EXECUTOR_NOT_ASSIGNED",
      mutate(task) { task.executor_ref = null; },
    },
    {
      label: "policy gate is pending",
      reason_code: "POLICY_GATE_NOT_PASSED",
      mutate(task) { task.policy_gate.status = "pending"; },
    },
  ];

  for (const guardCase of cases) {
    const task = structuredClone(fixture.task);
    guardCase.mutate(task);
    const eventStore = new SqliteEventStore({ filename: ":memory:" });
    t.after(() => eventStore.close());
    const taskProvider = new FixtureLinearTaskProvider({ tasks: [task] });
    const executor = new MockExecutor({ outcome: fixture.executor.outcome });
    const core = createTaskExecutionCore({
      taskProvider,
      eventStore,
      executors: new Map([[fixture.executor.executor_ref, executor]]),
      clock: () => fixture.clock.instant,
    });

    const dispatch = await core.dispatch({
      task_ref: task.task_ref,
      idempotency_key: `${fixture.dispatch.idempotency_key}:guard:${guardCase.reason_code}`,
    });
    const observed = await core.readExecution({ task_ref: task.task_ref });

    assert.deepEqual({
      status: dispatch.status,
      reason_code: dispatch.reason_code,
      agent_run: dispatch.agent_run,
      execution_receipt: dispatch.execution_receipt,
      official_task_mutated: dispatch.official_task_mutated,
      executor_call_count: executor.call_count,
      observed_agent_run: observed.agent_run,
      observed_execution_receipt: observed.execution_receipt,
      observed_task_events: observed.task_events,
    }, {
      status: "not_dispatched",
      reason_code: guardCase.reason_code,
      agent_run: null,
      execution_receipt: null,
      official_task_mutated: false,
      executor_call_count: 0,
      observed_agent_run: null,
      observed_execution_receipt: null,
      observed_task_events: [],
    }, guardCase.label);
  }
});

test("a successful AgentRun exposes a stable append-ordered state event history without raw payload", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());

  const taskProvider = new FixtureLinearTaskProvider({ tasks: [fixture.task] });
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });

  const dispatch = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });
  const firstRead = await core.readExecution({ task_ref: fixture.task.task_ref });
  const secondRead = await core.readExecution({ task_ref: fixture.task.task_ref });
  const events = firstRead.agent_run_events ?? [];
  const forbiddenPayloadKeys = ["task", "work_brief", "provider_payload", "payload", "raw_payload"];

  assert.deepEqual({
    states: events.map((event) => event.state),
    event_count: events.length,
    unique_event_id_count: new Set(events.map((event) => event.event_id)).size,
    unique_idempotency_key_count: new Set(events.map((event) => event.idempotency_key)).size,
    all_event_ids_nonempty: events.every((event) => typeof event.event_id === "string" && event.event_id.length > 0),
    all_idempotency_keys_nonempty: events.every((event) => typeof event.idempotency_key === "string" && event.idempotency_key.length > 0),
    same_run_id: events.every((event) => event.run_id === dispatch.agent_run.run_id),
    same_task_ref: events.every((event) => JSON.stringify(event.task_ref) === JSON.stringify(fixture.task.task_ref)),
    canonical_clocks: events.every((event) => ["occurred_at", "received_at", "ingested_at"].every((field) => (
      typeof event[field] === "string"
      && !Number.isNaN(Date.parse(event[field]))
      && new Date(event[field]).toISOString() === event[field]
    ))),
    raw_payload_exposed: events.some((event) => forbiddenPayloadKeys.some((key) => Object.hasOwn(event, key))),
    repeated_read_byte_identical: JSON.stringify(firstRead.agent_run_events)
      === JSON.stringify(secondRead.agent_run_events),
  }, {
    states: ["claimed", "running", "succeeded"],
    event_count: 3,
    unique_event_id_count: 3,
    unique_idempotency_key_count: 3,
    all_event_ids_nonempty: true,
    all_idempotency_keys_nonempty: true,
    same_run_id: true,
    same_task_ref: true,
    canonical_clocks: true,
    raw_payload_exposed: false,
    repeated_read_byte_identical: true,
  });
});

test("failed and cancelled executor outcomes close as terminal receipts without completing the Official Task", async (t) => {
  const cases = [
    {
      status: "failed",
      task_id: "SYN-104",
      executor_ref: "mock:public-failed",
      idempotency_key: "dispatch:linear:SYN-104:wb-rev-001",
      digest_digit: "6",
      reason_code: "SYNTHETIC_EXECUTION_FAILED",
      summary: "Synthetic execution reported a bounded failure.",
    },
    {
      status: "cancelled",
      task_id: "SYN-105",
      executor_ref: "mock:public-cancelled",
      idempotency_key: "dispatch:linear:SYN-105:wb-rev-001",
      digest_digit: "7",
      reason_code: "SYNTHETIC_EXECUTION_CANCELLED",
      summary: "Synthetic execution was cancelled before external effects.",
    },
  ];
  const actual = [];

  for (const terminalCase of cases) {
    const task = structuredClone(fixture.task);
    task.task_ref.task_id = terminalCase.task_id;
    task.work_brief.revision_ref.task_id = terminalCase.task_id;
    task.work_brief.revision_ref.revision_id = `${terminalCase.status}-wb-rev-001`;
    task.work_brief.revision_ref.digest = `sha256:${terminalCase.digest_digit.repeat(64)}`;
    task.executor_ref = terminalCase.executor_ref;
    const outcome = {
      status: terminalCase.status,
      result: { summary: terminalCase.summary },
      reason_code: terminalCase.reason_code,
      artifact_refs: [],
      evidence_refs: [],
      completion_criteria_met: false,
    };

    const eventStore = new SqliteEventStore({ filename: ":memory:" });
    t.after(() => eventStore.close());
    const taskProvider = new FixtureLinearTaskProvider({ tasks: [task] });
    const executor = new MockExecutor({ outcome });
    const core = createTaskExecutionCore({
      taskProvider,
      eventStore,
      executors: new Map([[terminalCase.executor_ref, executor]]),
      clock: () => fixture.clock.instant,
    });

    let dispatch = null;
    let dispatchError = null;
    try {
      dispatch = await core.dispatch({
        task_ref: task.task_ref,
        idempotency_key: terminalCase.idempotency_key,
      });
    } catch (error) {
      dispatchError = error;
    }
    const observed = await core.readExecution({ task_ref: task.task_ref });
    const receipt = dispatch?.execution_receipt ?? null;
    const receiptText = JSON.stringify(receipt);
    actual.push({
      status: terminalCase.status,
      dispatch_error: dispatchError,
      dispatch_status: dispatch?.status ?? null,
      agent_run_status: dispatch?.agent_run?.status ?? null,
      receipt_outcome: receipt?.outcome ?? null,
      completion_criteria_met: receipt?.completion_criteria_met ?? null,
      official_task_done: receipt?.official_task_done ?? null,
      official_task_mutated: receipt?.official_task_mutated ?? null,
      dispatch_official_task_mutated: dispatch?.official_task_mutated ?? null,
      executor_call_count: executor.call_count,
      agent_run_event_states: observed.agent_run_events.map((event) => event.state),
      raw_exception_exposed: ["error", "exception", "stack", "raw_message"]
        .some((key) => receiptText.includes(`\"${key}\"`)),
    });
  }

  assert.deepEqual(actual, cases.map((terminalCase) => ({
    status: terminalCase.status,
    dispatch_error: null,
    dispatch_status: terminalCase.status,
    agent_run_status: terminalCase.status,
    receipt_outcome: terminalCase.status,
    completion_criteria_met: false,
    official_task_done: false,
    official_task_mutated: false,
    dispatch_official_task_mutated: false,
    executor_call_count: 1,
    agent_run_event_states: ["claimed", "running", terminalCase.status],
    raw_exception_exposed: false,
  })));
});

test("one dispatch idempotency key cannot replay a receipt onto a different Official Task", async (t) => {
  const sharedIdempotencyKey = "dispatch:shared:public-conflict-001";
  const secondTask = structuredClone(fixture.task);
  secondTask.task_ref.task_id = "SYN-106";
  secondTask.work_brief.revision_ref.task_id = "SYN-106";
  secondTask.work_brief.revision_ref.revision_id = "wb-rev-002";
  secondTask.work_brief.revision_ref.digest = `sha256:${"8".repeat(64)}`;
  secondTask.work_brief.purpose = "Validate that dispatch identity cannot cross Official Task boundaries.";
  secondTask.executor_ref = "mock:public-second-success";
  const secondOutcome = structuredClone(fixture.executor.outcome);
  secondOutcome.result.summary = "A second synthetic task completed.";

  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const taskProvider = new FixtureLinearTaskProvider({ tasks: [fixture.task, secondTask] });
  const firstExecutor = new MockExecutor({ outcome: fixture.executor.outcome });
  const secondExecutor = new MockExecutor({ outcome: secondOutcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([
      [fixture.executor.executor_ref, firstExecutor],
      [secondTask.executor_ref, secondExecutor],
    ]),
    clock: () => fixture.clock.instant,
  });

  const first = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: sharedIdempotencyKey,
  });
  let secondDispatch = null;
  let conflictError = null;
  try {
    secondDispatch = await core.dispatch({
      task_ref: secondTask.task_ref,
      idempotency_key: sharedIdempotencyKey,
    });
  } catch (error) {
    conflictError = error;
  }
  const firstObserved = await core.readExecution({ task_ref: fixture.task.task_ref });
  const secondObserved = await core.readExecution({ task_ref: secondTask.task_ref });
  const errorSurface = [
    conflictError?.name,
    conflictError?.code,
    conflictError?.message,
    JSON.stringify(conflictError),
  ].join(" ");
  const privateIdentityTokens = [
    secondTask.task_ref.task_id,
    secondTask.work_brief.purpose,
    secondTask.work_brief.revision_ref.digest,
  ];

  assert.deepEqual({
    conflict_error_name: conflictError?.name ?? null,
    conflict_error_code: conflictError?.code ?? null,
    conflicting_dispatch_result: secondDispatch,
    raw_task_or_brief_exposed: privateIdentityTokens.some((token) => errorSurface.includes(token)),
    first_executor_call_count: firstExecutor.call_count,
    second_executor_call_count: secondExecutor.call_count,
    first_run_unchanged: firstObserved.agent_run.run_id === first.agent_run.run_id,
    first_receipt_unchanged: firstObserved.execution_receipt.receipt_id === first.execution_receipt.receipt_id,
    second_agent_run: secondObserved.agent_run,
    second_execution_receipt: secondObserved.execution_receipt,
    second_task_events: secondObserved.task_events,
    second_agent_run_events: secondObserved.agent_run_events,
  }, {
    conflict_error_name: "TaskExecutionCoreError",
    conflict_error_code: "IDEMPOTENCY_CONFLICT",
    conflicting_dispatch_result: null,
    raw_task_or_brief_exposed: false,
    first_executor_call_count: 1,
    second_executor_call_count: 0,
    first_run_unchanged: true,
    first_receipt_unchanged: true,
    second_agent_run: null,
    second_execution_receipt: null,
    second_task_events: [],
    second_agent_run_events: [],
  });
});

test("AgentRun and ExecutionReceipt expose immutable execution-basis domain references", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const taskProvider = new FixtureLinearTaskProvider({ tasks: [fixture.task] });
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });

  const dispatch = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });
  const observed = await core.readExecution({ task_ref: fixture.task.task_ref });
  const isFrozenObject = (value) => value !== null
    && typeof value === "object"
    && Object.isFrozen(value);
  const runDomain = (run) => ({
    task_ref: run?.task_ref ?? null,
    project_ref: run?.project_ref ?? null,
    work_brief_revision_ref: run?.work_brief_revision_ref ?? null,
    executor_ref: run?.executor_ref ?? null,
    dispatch_idempotency_key: run?.dispatch_idempotency_key ?? null,
    execution_key: run?.execution_key ?? null,
    attempt_no: run?.attempt_no ?? null,
  });

  assert.deepEqual({
    dispatch_run_domain: runDomain(dispatch.agent_run),
    execution_key_is_sha256: /^sha256:[a-f0-9]{64}$/u.test(dispatch.agent_run.execution_key ?? ""),
    receipt_task_ref: dispatch.execution_receipt.task_ref,
    receipt_work_brief_revision_ref: dispatch.execution_receipt.work_brief_revision_ref,
    receipt_executor_ref: dispatch.execution_receipt.executor_ref,
    receipt_evidence_refs: dispatch.execution_receipt.evidence_refs,
    observed_run_domain: runDomain(observed.agent_run),
    observed_receipt_task_ref: observed.execution_receipt.task_ref,
    observed_receipt_work_brief_revision_ref: observed.execution_receipt.work_brief_revision_ref,
    observed_receipt_executor_ref: observed.execution_receipt.executor_ref,
    observed_receipt_evidence_refs: observed.execution_receipt.evidence_refs,
    frozen: {
      dispatch_agent_run: isFrozenObject(dispatch.agent_run),
      dispatch_run_task_ref: isFrozenObject(dispatch.agent_run.task_ref),
      dispatch_run_project_ref: isFrozenObject(dispatch.agent_run.project_ref),
      dispatch_run_work_brief_revision_ref: isFrozenObject(dispatch.agent_run.work_brief_revision_ref),
      dispatch_receipt: isFrozenObject(dispatch.execution_receipt),
      dispatch_receipt_task_ref: isFrozenObject(dispatch.execution_receipt.task_ref),
      dispatch_receipt_work_brief_revision_ref: isFrozenObject(dispatch.execution_receipt.work_brief_revision_ref),
      dispatch_receipt_artifact_refs: isFrozenObject(dispatch.execution_receipt.artifact_refs),
      dispatch_receipt_evidence_refs: isFrozenObject(dispatch.execution_receipt.evidence_refs),
      dispatch_receipt_evidence_ref: isFrozenObject(dispatch.execution_receipt.evidence_refs[0]),
      observed_agent_run: isFrozenObject(observed.agent_run),
      observed_run_task_ref: isFrozenObject(observed.agent_run.task_ref),
      observed_run_project_ref: isFrozenObject(observed.agent_run.project_ref),
      observed_run_work_brief_revision_ref: isFrozenObject(observed.agent_run.work_brief_revision_ref),
      observed_receipt: isFrozenObject(observed.execution_receipt),
      observed_receipt_task_ref: isFrozenObject(observed.execution_receipt.task_ref),
      observed_receipt_work_brief_revision_ref: isFrozenObject(observed.execution_receipt.work_brief_revision_ref),
      observed_receipt_artifact_refs: isFrozenObject(observed.execution_receipt.artifact_refs),
      observed_receipt_evidence_refs: isFrozenObject(observed.execution_receipt.evidence_refs),
      observed_receipt_evidence_ref: isFrozenObject(observed.execution_receipt.evidence_refs[0]),
      observed_task_events: isFrozenObject(observed.task_events),
      observed_agent_run_events: isFrozenObject(observed.agent_run_events),
      observed_agent_run_event: isFrozenObject(observed.agent_run_events[0]),
      observed_agent_run_event_task_ref: isFrozenObject(observed.agent_run_events[0].task_ref),
    },
  }, {
    dispatch_run_domain: {
      task_ref: fixture.task.task_ref,
      project_ref: fixture.task.project_ref,
      work_brief_revision_ref: fixture.task.work_brief.revision_ref,
      executor_ref: fixture.task.executor_ref,
      dispatch_idempotency_key: fixture.dispatch.idempotency_key,
      execution_key: dispatch.agent_run.execution_key ?? null,
      attempt_no: 1,
    },
    execution_key_is_sha256: true,
    receipt_task_ref: fixture.task.task_ref,
    receipt_work_brief_revision_ref: fixture.task.work_brief.revision_ref,
    receipt_executor_ref: fixture.task.executor_ref,
    receipt_evidence_refs: fixture.executor.outcome.evidence_refs,
    observed_run_domain: runDomain(dispatch.agent_run),
    observed_receipt_task_ref: fixture.task.task_ref,
    observed_receipt_work_brief_revision_ref: fixture.task.work_brief.revision_ref,
    observed_receipt_executor_ref: fixture.task.executor_ref,
    observed_receipt_evidence_refs: fixture.executor.outcome.evidence_refs,
    frozen: {
      dispatch_agent_run: true,
      dispatch_run_task_ref: true,
      dispatch_run_project_ref: true,
      dispatch_run_work_brief_revision_ref: true,
      dispatch_receipt: true,
      dispatch_receipt_task_ref: true,
      dispatch_receipt_work_brief_revision_ref: true,
      dispatch_receipt_artifact_refs: true,
      dispatch_receipt_evidence_refs: true,
      dispatch_receipt_evidence_ref: true,
      observed_agent_run: true,
      observed_run_task_ref: true,
      observed_run_project_ref: true,
      observed_run_work_brief_revision_ref: true,
      observed_receipt: true,
      observed_receipt_task_ref: true,
      observed_receipt_work_brief_revision_ref: true,
      observed_receipt_artifact_refs: true,
      observed_receipt_evidence_refs: true,
      observed_receipt_evidence_ref: true,
      observed_task_events: true,
      observed_agent_run_events: true,
      observed_agent_run_event: true,
      observed_agent_run_event_task_ref: true,
    },
  });
});

test("provider and Work Brief task bindings are verified before claim or Executor invocation", async (t) => {
  const requestedTaskRef = fixture.task.task_ref;
  const misboundTask = structuredClone(fixture.task);
  misboundTask.task_ref.task_id = "SYN-MISBOUND-107";
  misboundTask.work_brief.revision_ref.task_id = "SYN-MISBOUND-107";
  misboundTask.work_brief.revision_ref.digest = `sha256:${"9".repeat(64)}`;
  misboundTask.executor_ref = "mock:provider-misbound";

  const invalidBriefTask = structuredClone(fixture.task);
  invalidBriefTask.work_brief.revision_ref.task_id = "SYN-OTHER-108";
  invalidBriefTask.work_brief.revision_ref.digest = `sha256:${"a".repeat(64)}`;
  invalidBriefTask.executor_ref = "mock:invalid-brief-binding";

  const cases = [
    {
      reason_code: "PROVIDER_TASK_REF_MISMATCH",
      task: misboundTask,
      idempotency_key: "dispatch:linear:SYN-101:provider-misbound",
      raw_identity_tokens: [misboundTask.task_ref.task_id],
      createProvider() {
        return {
          async readTask() {
            return structuredClone(misboundTask);
          },
        };
      },
    },
    {
      reason_code: "WORK_BRIEF_INVALID",
      task: invalidBriefTask,
      idempotency_key: "dispatch:linear:SYN-101:invalid-brief-binding",
      raw_identity_tokens: [invalidBriefTask.work_brief.revision_ref.task_id],
      createProvider() {
        return new FixtureLinearTaskProvider({ tasks: [invalidBriefTask] });
      },
    },
  ];
  const actual = [];

  for (const bindingCase of cases) {
    const eventStore = new SqliteEventStore({ filename: ":memory:" });
    t.after(() => eventStore.close());
    const executor = new MockExecutor({ outcome: fixture.executor.outcome });
    const core = createTaskExecutionCore({
      taskProvider: bindingCase.createProvider(),
      eventStore,
      executors: new Map([[bindingCase.task.executor_ref, executor]]),
      clock: () => fixture.clock.instant,
    });

    let dispatch = null;
    let dispatchError = null;
    try {
      dispatch = await core.dispatch({
        task_ref: requestedTaskRef,
        idempotency_key: bindingCase.idempotency_key,
      });
    } catch (error) {
      dispatchError = error;
    }
    const observed = await core.readExecution({ task_ref: requestedTaskRef });
    const errorSurface = [
      dispatchError?.name,
      dispatchError?.code,
      dispatchError?.message,
      JSON.stringify(dispatchError),
    ].join(" ");
    actual.push({
      reason_code: bindingCase.reason_code,
      dispatch_error: dispatchError,
      raw_identity_exposed: bindingCase.raw_identity_tokens
        .some((token) => errorSurface.includes(token)),
      status: dispatch?.status ?? null,
      actual_reason_code: dispatch?.reason_code ?? null,
      agent_run: dispatch?.agent_run ?? null,
      execution_receipt: dispatch?.execution_receipt ?? null,
      official_task_mutated: dispatch?.official_task_mutated ?? null,
      executor_call_count: executor.call_count,
      observed_agent_run: observed.agent_run,
      observed_execution_receipt: observed.execution_receipt,
      observed_task_events: observed.task_events,
      observed_agent_run_events: observed.agent_run_events,
    });
  }

  assert.deepEqual(actual, cases.map((bindingCase) => ({
    reason_code: bindingCase.reason_code,
    dispatch_error: null,
    raw_identity_exposed: false,
    status: "not_dispatched",
    actual_reason_code: bindingCase.reason_code,
    agent_run: null,
    execution_receipt: null,
    official_task_mutated: false,
    executor_call_count: 0,
    observed_agent_run: null,
    observed_execution_receipt: null,
    observed_task_events: [],
    observed_agent_run_events: [],
  })));
});

test("provider event idempotency cannot alias a different provider event or Task identity", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const core = createTaskExecutionCore({
    taskProvider: new FixtureLinearTaskProvider({ tasks: [fixture.task] }),
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, new MockExecutor({
      outcome: fixture.executor.outcome,
    })]]),
    clock: () => fixture.clock.instant,
  });

  await core.ingestEvent(fixture.provider_event);
  const collisions = [
    {
      ...structuredClone(fixture.provider_event),
      provider_event_id: "linear-event-public-other",
    },
    {
      ...structuredClone(fixture.provider_event),
      task_ref: { provider: "linear", task_id: "SYN-OTHER-109" },
    },
  ];
  const errors = [];
  for (const collision of collisions) {
    try {
      await core.ingestEvent(collision);
      errors.push(null);
    } catch (error) {
      errors.push({ name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? "" });
    }
  }
  const original = await core.readExecution({ task_ref: fixture.task.task_ref });
  const foreign = await core.readExecution({
    task_ref: { provider: "linear", task_id: "SYN-OTHER-109" },
  });

  assert.deepEqual({
    errors: errors.map((error) => ({ name: error?.name ?? null, code: error?.code ?? null })),
    raw_identity_exposed: errors.some((error) => /linear-event-public-other|SYN-OTHER-109/u.test(error?.message ?? "")),
    original_events: original.task_events.length,
    foreign_events: foreign.task_events.length,
  }, {
    errors: [
      { name: "TaskExecutionCoreError", code: "PROVIDER_EVENT_CONFLICT" },
      { name: "TaskExecutionCoreError", code: "PROVIDER_EVENT_CONFLICT" },
    ],
    raw_identity_exposed: false,
    original_events: 1,
    foreign_events: 0,
  });
});

test("SqliteEventStore rolls back zero-row AgentRun transitions before appending events or receipts", (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const taskRef = fixture.task.task_ref;
  const run = {
    run_id: "agent_run_transition_guard_001",
    task_key: `${taskRef.provider}:${taskRef.task_id}`,
    task_ref: taskRef,
    project_ref: fixture.task.project_ref,
    work_brief_revision_ref: fixture.task.work_brief.revision_ref,
    executor_ref: fixture.executor.executor_ref,
    authority_ref: fixture.task.policy_gate.authority_ref,
    attempt_no: 1,
    dispatch_idempotency_key: "dispatch:transition-guard:001",
    execution_key: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    claimed_at: fixture.clock.instant,
  };
  const event = (sequence, state, task_ref = taskRef) => ({
    event_id: `agent_run_event_transition_guard_${sequence}`,
    run_id: run.run_id,
    task_key: `${task_ref.provider}:${task_ref.task_id}`,
    task_ref,
    sequence,
    state,
    idempotency_key: `${run.dispatch_idempotency_key}:${state}`,
    occurred_at: fixture.clock.instant,
    received_at: fixture.clock.instant,
    ingested_at: fixture.clock.instant,
    event_digest: `sha256:${String(sequence).repeat(64)}`,
  });
  eventStore.claim(run, event(1, "claimed"));

  let prematureComplete = null;
  try {
    eventStore.complete(run.run_id, "succeeded", {
      receipt_id: "execution_receipt_transition_guard_001",
      outcome: "succeeded",
    }, fixture.clock.instant, event(2, "succeeded"));
  } catch (error) {
    prematureComplete = error;
  }
  eventStore.markRunning(run.run_id, fixture.clock.instant, event(2, "running"));
  let duplicateRunning = null;
  try {
    eventStore.markRunning(run.run_id, fixture.clock.instant, event(3, "running"));
  } catch (error) {
    duplicateRunning = error;
  }
  const observed = eventStore.readTaskExecution(run.task_key);

  assert.deepEqual({
    premature_code: prematureComplete?.code ?? null,
    duplicate_running_code: duplicateRunning?.code ?? null,
    current_status: observed.agent_run.status,
    receipt: observed.execution_receipt,
    event_states: observed.agent_run_events.map((row) => row.state),
  }, {
    premature_code: "INVALID_RUN_TRANSITION",
    duplicate_running_code: "INVALID_RUN_TRANSITION",
    current_status: "running",
    receipt: null,
    event_states: ["claimed", "running"],
  });
});

test("SqliteEventStore refuses a run event whose TaskRef does not match its parent AgentRun", (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const taskRef = fixture.task.task_ref;
  const taskKey = `${taskRef.provider}:${taskRef.task_id}`;
  const run = {
    run_id: "agent_run_binding_guard_001",
    task_key: taskKey,
    task_ref: taskRef,
    project_ref: fixture.task.project_ref,
    work_brief_revision_ref: fixture.task.work_brief.revision_ref,
    executor_ref: fixture.executor.executor_ref,
    authority_ref: fixture.task.policy_gate.authority_ref,
    attempt_no: 1,
    dispatch_idempotency_key: "dispatch:binding-guard:001",
    execution_key: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    claimed_at: fixture.clock.instant,
  };
  const claimed = {
    event_id: "agent_run_event_binding_guard_001",
    run_id: run.run_id,
    task_key: taskKey,
    task_ref: taskRef,
    sequence: 1,
    state: "claimed",
    idempotency_key: `${run.dispatch_idempotency_key}:claimed`,
    occurred_at: fixture.clock.instant,
    received_at: fixture.clock.instant,
    ingested_at: fixture.clock.instant,
    event_digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  };
  eventStore.claim(run, claimed);
  const foreignRef = { provider: "linear", task_id: "SYN-FOREIGN-110" };
  let error = null;
  try {
    eventStore.markRunning(run.run_id, fixture.clock.instant, {
      ...claimed,
      event_id: "agent_run_event_binding_guard_002",
      task_key: `${foreignRef.provider}:${foreignRef.task_id}`,
      task_ref: foreignRef,
      sequence: 2,
      state: "running",
      idempotency_key: `${run.dispatch_idempotency_key}:running`,
    });
  } catch (caught) {
    error = caught;
  }
  const own = eventStore.readTaskExecution(taskKey);
  const foreign = eventStore.readTaskExecution(`${foreignRef.provider}:${foreignRef.task_id}`);

  assert.deepEqual({
    error_code: error?.code ?? null,
    current_status: own.agent_run.status,
    own_events: own.agent_run_events.map((row) => row.state),
    foreign_events: foreign.agent_run_events,
  }, {
    error_code: "RUN_EVENT_TASK_MISMATCH",
    current_status: "claimed",
    own_events: ["claimed"],
    foreign_events: [],
  });
});

test("a provider-returned Candidate marker cannot be disguised as an Official Task", async (t) => {
  const task = structuredClone(fixture.task);
  task.task_ref.task_class = "candidate";
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const provider = { read_count: 0, async readTask() { this.read_count += 1; return structuredClone(task); } };
  const core = createTaskExecutionCore({
    taskProvider: provider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });

  const result = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: `${fixture.dispatch.idempotency_key}:provider-candidate`,
  });
  const observed = await core.readExecution({ task_ref: fixture.task.task_ref });

  assert.deepEqual({
    status: result.status,
    reason_code: result.reason_code,
    provider_reads: provider.read_count,
    executor_calls: executor.call_count,
    agent_run: observed.agent_run,
  }, {
    status: "not_dispatched",
    reason_code: "CANDIDATE_NOT_EXECUTABLE",
    provider_reads: 1,
    executor_calls: 0,
    agent_run: null,
  });
});

test("Work Brief collection fields validate every item before claim", async (t) => {
  const cases = [
    ["inputs", [null]],
    ["instructions", [""]],
    ["constraints", [null]],
    ["completion_conditions", [{}]],
    ["expected_artifacts", [null]],
    ["source_refs", [null]],
  ];
  const observed = [];
  for (const [field, value] of cases) {
    const task = structuredClone(fixture.task);
    task.work_brief[field] = value;
    const eventStore = new SqliteEventStore({ filename: ":memory:" });
    t.after(() => eventStore.close());
    const executor = new MockExecutor({ outcome: fixture.executor.outcome });
    const core = createTaskExecutionCore({
      taskProvider: new FixtureLinearTaskProvider({ tasks: [task] }),
      eventStore,
      executors: new Map([[fixture.executor.executor_ref, executor]]),
      clock: () => fixture.clock.instant,
    });
    const result = await core.dispatch({
      task_ref: task.task_ref,
      idempotency_key: `${fixture.dispatch.idempotency_key}:brief-item:${field}`,
    });
    const execution = await core.readExecution({ task_ref: task.task_ref });
    observed.push({
      field,
      status: result.status,
      reason_code: result.reason_code,
      executor_calls: executor.call_count,
      agent_run: execution.agent_run,
    });
  }

  assert.deepEqual(observed, cases.map(([field]) => ({
    field,
    status: "not_dispatched",
    reason_code: "WORK_BRIEF_INVALID",
    executor_calls: 0,
    agent_run: null,
  })));
});

test("provider and store seam failures return stable payload-free Core errors", async (t) => {
  const marker = "RAW_SEAM_SENTINEL_SHOULD_NOT_ESCAPE";
  const makeCore = (overrides = {}) => {
    const eventStore = new SqliteEventStore({ filename: ":memory:" });
    t.after(() => eventStore.close());
    const wrappedStore = {
      appendProviderEvent: (...args) => eventStore.appendProviderEvent(...args),
      claim: (...args) => eventStore.claim(...args),
      markRunning: (...args) => eventStore.markRunning(...args),
      complete: (...args) => eventStore.complete(...args),
      readTaskExecution: (...args) => eventStore.readTaskExecution(...args),
      findDispatch: (...args) => eventStore.findDispatch(...args),
      ...(overrides.store ?? {}),
    };
    return createTaskExecutionCore({
      taskProvider: overrides.provider ?? new FixtureLinearTaskProvider({ tasks: [fixture.task] }),
      eventStore: wrappedStore,
      executors: new Map([[fixture.executor.executor_ref, new MockExecutor({
        outcome: fixture.executor.outcome,
      })]]),
      clock: () => fixture.clock.instant,
    });
  };
  const cases = [
    {
      code: "PROVIDER_READ_FAILED",
      core: makeCore({ provider: { async readTask() { throw new Error(marker); } } }),
      action(core) {
        return core.dispatch({
          task_ref: fixture.task.task_ref,
          idempotency_key: `${fixture.dispatch.idempotency_key}:provider-error`,
        });
      },
    },
    {
      code: "EVENT_STORE_WRITE_FAILED",
      core: makeCore({ store: { markRunning() { throw new Error(marker); } } }),
      action(core) {
        return core.dispatch({
          task_ref: fixture.task.task_ref,
          idempotency_key: `${fixture.dispatch.idempotency_key}:store-error`,
        });
      },
    },
    {
      code: "EVENT_STORE_READ_FAILED",
      core: makeCore({ store: { readTaskExecution() { throw new Error(marker); } } }),
      action(core) { return core.readExecution({ task_ref: fixture.task.task_ref }); },
    },
  ];
  const errors = [];
  for (const seamCase of cases) {
    try {
      await seamCase.action(seamCase.core);
      errors.push(null);
    } catch (error) {
      errors.push({ name: error?.name ?? null, code: error?.code ?? null, message: error?.message ?? "" });
    }
  }

  assert.deepEqual({
    codes: errors.map((error) => error?.code ?? null),
    names: errors.map((error) => error?.name ?? null),
    marker_exposed: errors.some((error) => error?.message.includes(marker)),
  }, {
    codes: cases.map((seamCase) => seamCase.code),
    names: cases.map(() => "TaskExecutionCoreError"),
    marker_exposed: false,
  });
});

test("executor reason codes are bounded tokens rather than arbitrary payload", async (t) => {
  const task = structuredClone(fixture.task);
  task.task_ref.task_id = "SYN-REASON-111";
  task.work_brief.revision_ref.task_id = task.task_ref.task_id;
  task.executor_ref = "mock:reason-invalid";
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const core = createTaskExecutionCore({
    taskProvider: new FixtureLinearTaskProvider({ tasks: [task] }),
    eventStore,
    executors: new Map([[task.executor_ref, new MockExecutor({ outcome: {
      status: "failed",
      result: { summary: "Synthetic bounded failure." },
      reason_code: "RAW REASON WITH SPACES AND PAYLOAD",
      artifact_refs: [],
      evidence_refs: [],
      completion_criteria_met: false,
    } })]]),
    clock: () => fixture.clock.instant,
  });
  let error = null;
  try {
    await core.dispatch({
      task_ref: task.task_ref,
      idempotency_key: "dispatch:reason-invalid:111",
    });
  } catch (caught) {
    error = caught;
  }
  assert.deepEqual({
    name: error?.name ?? null,
    code: error?.code ?? null,
    raw_exposed: error?.message.includes("RAW REASON") ?? false,
  }, {
    name: "TaskExecutionCoreError",
    code: "EXECUTOR_OUTCOME_INVALID",
    raw_exposed: false,
  });
});

test("AgentRun and ExecutionReceipt retain the exact authority and idempotency execution basis", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const core = createTaskExecutionCore({
    taskProvider: new FixtureLinearTaskProvider({ tasks: [fixture.task] }),
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, new MockExecutor({
      outcome: fixture.executor.outcome,
    })]]),
    clock: () => fixture.clock.instant,
  });
  const dispatch = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });
  const observed = await core.readExecution({ task_ref: fixture.task.task_ref });

  assert.deepEqual({
    run_authority_ref: dispatch.agent_run.authority_ref,
    run_dispatch_key: dispatch.agent_run.dispatch_idempotency_key,
    receipt_authority_ref: dispatch.execution_receipt.authority_ref,
    receipt_dispatch_key: dispatch.execution_receipt.dispatch_idempotency_key,
    receipt_execution_key: dispatch.execution_receipt.execution_key,
    read_authority_ref: observed.agent_run.authority_ref,
    read_execution_key: observed.execution_receipt.execution_key,
  }, {
    run_authority_ref: fixture.task.policy_gate.authority_ref,
    run_dispatch_key: fixture.dispatch.idempotency_key,
    receipt_authority_ref: fixture.task.policy_gate.authority_ref,
    receipt_dispatch_key: fixture.dispatch.idempotency_key,
    receipt_execution_key: dispatch.agent_run.execution_key,
    read_authority_ref: fixture.task.policy_gate.authority_ref,
    read_execution_key: dispatch.agent_run.execution_key,
  });
});

test("a succeeded executor outcome must report completion criteria met", async (t) => {
  const task = structuredClone(fixture.task);
  task.task_ref.task_id = "SYN-SUCCESS-FALSE-112";
  task.work_brief.revision_ref.task_id = task.task_ref.task_id;
  task.executor_ref = "mock:success-false";
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const core = createTaskExecutionCore({
    taskProvider: new FixtureLinearTaskProvider({ tasks: [task] }),
    eventStore,
    executors: new Map([[task.executor_ref, new MockExecutor({ outcome: {
      ...structuredClone(fixture.executor.outcome),
      completion_criteria_met: false,
    } })]]),
    clock: () => fixture.clock.instant,
  });
  let error = null;
  try {
    await core.dispatch({
      task_ref: task.task_ref,
      idempotency_key: "dispatch:success-false:112",
    });
  } catch (caught) {
    error = caught;
  }
  const execution = await core.readExecution({ task_ref: task.task_ref });

  assert.deepEqual({
    error_name: error?.name ?? null,
    error_code: error?.code ?? null,
    run_status: execution.agent_run.status,
    receipt: execution.execution_receipt,
  }, {
    error_name: "TaskExecutionCoreError",
    error_code: "EXECUTOR_OUTCOME_INVALID",
    run_status: "running",
    receipt: null,
  });
});

test("a stored terminal receipt replays even when the mutable provider status later changes", async (t) => {
  let status = "Todo";
  let providerReads = 0;
  let revisionId = fixture.task.work_brief.revision_ref.revision_id;
  let authorityRef = fixture.task.policy_gate.authority_ref;
  const provider = {
    async readTask() {
      providerReads += 1;
      const task = structuredClone(fixture.task);
      task.status = status;
      task.work_brief.revision_ref.revision_id = revisionId;
      task.policy_gate.authority_ref = authorityRef;
      return task;
    },
  };
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider: provider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });
  const first = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });
  status = "In Progress";
  revisionId = "wb-rev-mutated-after-terminal";
  authorityRef = "policy:mutated-after-terminal";
  const replay = await core.dispatch({
    task_ref: fixture.task.task_ref,
    idempotency_key: fixture.dispatch.idempotency_key,
  });

  assert.deepEqual({
    status: replay.status,
    replayed: replay.replayed,
    same_run: replay.agent_run.run_id === first.agent_run.run_id,
    same_receipt: replay.execution_receipt.receipt_id === first.execution_receipt.receipt_id,
    executor_calls: executor.call_count,
    provider_reads: providerReads,
    stored_brief_revision: replay.execution_receipt.work_brief_revision_ref.revision_id,
    stored_authority_ref: replay.execution_receipt.authority_ref,
    current_provider_status_claimed: replay.official_task_status_observed,
  }, {
    status: "succeeded",
    replayed: true,
    same_run: true,
    same_receipt: true,
    executor_calls: 1,
    provider_reads: 1,
    stored_brief_revision: fixture.task.work_brief.revision_ref.revision_id,
    stored_authority_ref: fixture.task.policy_gate.authority_ref,
    current_provider_status_claimed: "Todo",
  });
});

test("a provider event cannot claim a TaskRef owned by another provider", async (t) => {
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const core = createTaskExecutionCore({
    taskProvider: new FixtureLinearTaskProvider({ tasks: [fixture.task] }),
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, new MockExecutor({
      outcome: fixture.executor.outcome,
    })]]),
    clock: () => fixture.clock.instant,
  });
  const event = {
    ...structuredClone(fixture.provider_event),
    provider_event_id: "linear-event-cross-provider-113",
    idempotency_key: "linear:linear-event-cross-provider-113",
    task_ref: { provider: "candidate", task_id: "CAND-CROSS-113" },
  };
  let error = null;
  try { await core.ingestEvent(event); } catch (caught) { error = caught; }

  assert.deepEqual({
    name: error?.name ?? null,
    code: error?.code ?? null,
    raw_exposed: /CAND-CROSS-113/u.test(error?.message ?? ""),
  }, {
    name: "TaskExecutionCoreError",
    code: "PROVIDER_EVENT_INVALID",
    raw_exposed: false,
  });
});

test("equal-clock multi-run readback selects the latest claim and only that run's ordered events", async (t) => {
  let currentTask = structuredClone(fixture.task);
  const provider = { async readTask() { return structuredClone(currentTask); } };
  const eventStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => eventStore.close());
  const executor = new MockExecutor({ outcome: fixture.executor.outcome });
  const core = createTaskExecutionCore({
    taskProvider: provider,
    eventStore,
    executors: new Map([[fixture.executor.executor_ref, executor]]),
    clock: () => fixture.clock.instant,
  });
  const runs = [];
  for (let index = 1; index <= 6; index += 1) {
    currentTask = structuredClone(fixture.task);
    currentTask.work_brief.revision_ref.revision_id = `wb-rev-multi-${index}`;
    currentTask.work_brief.revision_ref.digest = `sha256:${String(index).repeat(64)}`;
    const result = await core.dispatch({
      task_ref: fixture.task.task_ref,
      idempotency_key: `dispatch:multi-run:${index}`,
    });
    runs.push(result.agent_run.run_id);
  }
  const observed = await core.readExecution({ task_ref: fixture.task.task_ref });

  assert.deepEqual({
    latest_run_id: observed.agent_run.run_id,
    expected_run_id: runs.at(-1),
    latest_receipt_run_id: observed.execution_receipt.run_id,
    event_run_ids: [...new Set(observed.agent_run_events.map((event) => event.run_id))],
    event_states: observed.agent_run_events.map((event) => event.state),
    executor_calls: executor.call_count,
  }, {
    latest_run_id: runs.at(-1),
    expected_run_id: runs.at(-1),
    latest_receipt_run_id: runs.at(-1),
    event_run_ids: [runs.at(-1)],
    event_states: ["claimed", "running", "succeeded"],
    executor_calls: 6,
  });
});

test("clock failures and non-cloneable Executor results are stable payload-free Core errors", async (t) => {
  const marker = "RAW_CLOCK_OR_CLONE_SENTINEL";
  const clockStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => clockStore.close());
  const clockCore = createTaskExecutionCore({
    taskProvider: new FixtureLinearTaskProvider({ tasks: [fixture.task] }),
    eventStore: clockStore,
    executors: new Map([[fixture.executor.executor_ref, new MockExecutor({
      outcome: fixture.executor.outcome,
    })]]),
    clock: () => { throw new Error(marker); },
  });
  let clockError = null;
  try {
    await clockCore.dispatch({
      task_ref: fixture.task.task_ref,
      idempotency_key: `${fixture.dispatch.idempotency_key}:clock-error`,
    });
  } catch (error) { clockError = error; }

  const task = structuredClone(fixture.task);
  task.task_ref.task_id = "SYN-NONCLONE-114";
  task.work_brief.revision_ref.task_id = task.task_ref.task_id;
  task.executor_ref = "mock:noncloneable";
  const cloneStore = new SqliteEventStore({ filename: ":memory:" });
  t.after(() => cloneStore.close());
  const cloneCore = createTaskExecutionCore({
    taskProvider: new FixtureLinearTaskProvider({ tasks: [task] }),
    eventStore: cloneStore,
    executors: new Map([[task.executor_ref, {
      async execute() {
        return {
          status: "succeeded",
          result: { summary: "Synthetic non-cloneable result.", unsafe: () => marker },
          artifact_refs: [],
          evidence_refs: [],
          completion_criteria_met: true,
        };
      },
    }]]),
    clock: () => fixture.clock.instant,
  });
  let cloneError = null;
  try {
    await cloneCore.dispatch({
      task_ref: task.task_ref,
      idempotency_key: "dispatch:noncloneable:114",
    });
  } catch (error) { cloneError = error; }
  const cloneExecution = await cloneCore.readExecution({ task_ref: task.task_ref });

  assert.deepEqual({
    clock_name: clockError?.name ?? null,
    clock_code: clockError?.code ?? null,
    clock_raw_exposed: clockError?.message.includes(marker) ?? false,
    clone_name: cloneError?.name ?? null,
    clone_code: cloneError?.code ?? null,
    clone_raw_exposed: cloneError?.message.includes(marker) ?? false,
    clone_run_status: cloneExecution.agent_run.status,
    clone_receipt: cloneExecution.execution_receipt,
  }, {
    clock_name: "TaskExecutionCoreError",
    clock_code: "CLOCK_INVALID",
    clock_raw_exposed: false,
    clone_name: "TaskExecutionCoreError",
    clone_code: "EXECUTOR_OUTCOME_INVALID",
    clone_raw_exposed: false,
    clone_run_status: "running",
    clone_receipt: null,
  });
});

test("Executor outcomes reject unused accessors and extra non-JSON values before receipt digest", async (t) => {
  const marker = "RAW_UNUSED_OUTCOME_GETTER_SENTINEL";
  const cases = [
    {
      suffix: "getter",
      build() {
        const outcome = structuredClone(fixture.executor.outcome);
        Object.defineProperty(outcome, "unused_extra", {
          enumerable: true,
          get() { throw new Error(marker); },
        });
        return outcome;
      },
    },
    {
      suffix: "bigint",
      build() {
        return { ...structuredClone(fixture.executor.outcome), unused_extra: 1n };
      },
    },
  ];
  const results = [];
  for (const attack of cases) {
    const task = structuredClone(fixture.task);
    task.task_ref.task_id = `SYN-OUTCOME-${attack.suffix.toUpperCase()}-115`;
    task.work_brief.revision_ref.task_id = task.task_ref.task_id;
    task.executor_ref = `mock:outcome-${attack.suffix}`;
    const eventStore = new SqliteEventStore({ filename: ":memory:" });
    t.after(() => eventStore.close());
    const core = createTaskExecutionCore({
      taskProvider: new FixtureLinearTaskProvider({ tasks: [task] }),
      eventStore,
      executors: new Map([[task.executor_ref, { async execute() { return attack.build(); } }]]),
      clock: () => fixture.clock.instant,
    });
    let error = null;
    try {
      await core.dispatch({
        task_ref: task.task_ref,
        idempotency_key: `dispatch:outcome-${attack.suffix}:115`,
      });
    } catch (caught) { error = caught; }
    const execution = await core.readExecution({ task_ref: task.task_ref });
    results.push({
      suffix: attack.suffix,
      name: error?.name ?? null,
      code: error?.code ?? null,
      raw_exposed: error?.message.includes(marker) ?? false,
      run_status: execution.agent_run.status,
      receipt: execution.execution_receipt,
    });
  }

  assert.deepEqual(results, cases.map(({ suffix }) => ({
    suffix,
    name: "TaskExecutionCoreError",
    code: "EXECUTOR_OUTCOME_INVALID",
    raw_exposed: false,
    run_status: "running",
    receipt: null,
  })));
});

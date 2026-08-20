import { createHash } from "node:crypto";

export const TASK_EXECUTION_RECEIPT_SCHEMA =
  "soulforge.task_execution_receipt.poc.v0";

export class TaskExecutionCoreError extends Error {
  constructor(code) {
    super(code);
    this.name = "TaskExecutionCoreError";
    this.code = code;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function opaqueId(prefix, value) {
  return `${prefix}_${digest(value).slice("sha256:".length, "sha256:".length + 32)}`;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function taskKey(ref) {
  if (!ref || !["linear", "candidate"].includes(ref.provider)
    || !nonEmptyString(ref.task_id)) {
    throw new TypeError("task_execution_task_ref_invalid");
  }
  return `${ref.provider}:${ref.task_id}`;
}

function sameTaskRef(left, right) {
  return left?.provider === right?.provider && left?.task_id === right?.task_id;
}

function isCandidateRef(ref) {
  return ref?.provider === "candidate" || ref?.task_class === "candidate";
}

function assertWorkBrief(brief) {
  const textFields = ["purpose", "background", "reporting", "handoff"];
  const listFields = [
    "inputs", "instructions", "constraints", "completion_conditions",
    "expected_artifacts", "source_refs",
  ];
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    throw new TypeError("task_execution_work_brief_invalid");
  }
  if (!brief.revision_ref || !nonEmptyString(brief.revision_ref.revision_id)
    || !/^sha256:[a-f0-9]{64}$/u.test(brief.revision_ref.digest ?? "")) {
    throw new TypeError("task_execution_work_brief_invalid");
  }
  if (textFields.some((field) => !nonEmptyString(brief[field]))) {
    throw new TypeError("task_execution_work_brief_invalid");
  }
  if (listFields.some((field) => !Array.isArray(brief[field]) || brief[field].length === 0)) {
    throw new TypeError("task_execution_work_brief_invalid");
  }
  const validSourceRef = (ref) => ref && typeof ref === "object" && !Array.isArray(ref)
    && nonEmptyString(ref.source_type)
    && nonEmptyString(ref.source_id)
    && nonEmptyString(ref.revision_id);
  if (!brief.inputs.every((entry) => entry && typeof entry === "object"
      && !Array.isArray(entry) && validSourceRef(entry.source_ref))
    || !brief.source_refs.every(validSourceRef)
    || !["instructions", "constraints", "completion_conditions", "expected_artifacts"]
      .every((field) => brief[field].every(nonEmptyString))) {
    throw new TypeError("task_execution_work_brief_invalid");
  }
}

function assertInstant(value) {
  let normalized = null;
  try { normalized = new Date(value).toISOString(); } catch {}
  if (typeof value !== "string" || normalized !== value) {
    throw new TypeError("task_execution_clock_invalid");
  }
  return value;
}

function readClock(clock) {
  try {
    return assertInstant(clock());
  } catch {
    throw new TaskExecutionCoreError("CLOCK_INVALID");
  }
}

function normalizeProviderEvent(input) {
  const required = [
    "provider", "provider_event_id", "idempotency_key", "event_type", "task_ref",
    "occurred_at", "received_at", "ingested_at", "payload_digest",
  ];
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).length !== required.length
    || required.some((field) => !Object.hasOwn(input, field))) {
    throw new TypeError("task_execution_provider_event_invalid");
  }
  if (input.provider !== "linear"
    || !nonEmptyString(input.provider_event_id)
    || !nonEmptyString(input.idempotency_key)
    || !nonEmptyString(input.event_type)
    || !/^sha256:[a-f0-9]{64}$/u.test(input.payload_digest)) {
    throw new TypeError("task_execution_provider_event_invalid");
  }
  const key = taskKey(input.task_ref);
  if (input.task_ref.provider !== input.provider) {
    throw new TypeError("task_execution_provider_event_invalid");
  }
  const event = {
    event_id: opaqueId("task_event", {
      provider: input.provider,
      provider_event_id: input.provider_event_id,
    }),
    task_key: key,
    provider: input.provider,
    provider_event_id: input.provider_event_id,
    idempotency_key: input.idempotency_key,
    event_type: input.event_type,
    task_ref: structuredClone(input.task_ref),
    occurred_at: assertInstant(input.occurred_at),
    received_at: assertInstant(input.received_at),
    ingested_at: assertInstant(input.ingested_at),
    payload_digest: input.payload_digest,
  };
  return event;
}

function notDispatched(reasonCode, taskStatus = null) {
  return deepFreeze({
    status: "not_dispatched",
    reason_code: reasonCode,
    replayed: false,
    agent_run: null,
    execution_receipt: null,
    official_task_status_observed: taskStatus,
    official_task_mutated: false,
  });
}

function buildRunEvent({ runId, taskKey: key, taskRef, sequence, state, at, dispatchKey }) {
  const material = {
    run_id: runId,
    task_ref: taskRef,
    sequence,
    state,
    occurred_at: at,
    received_at: at,
    ingested_at: at,
  };
  return {
    event_id: opaqueId("agent_run_event", material),
    run_id: runId,
    task_key: key,
    task_ref: structuredClone(taskRef),
    sequence,
    state,
    idempotency_key: `${dispatchKey}:${state}`,
    occurred_at: at,
    received_at: at,
    ingested_at: at,
    event_digest: digest(material),
  };
}

function normalizeWaitingInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !nonEmptyString(value.reason)
    || !nonEmptyString(value.required_input)
    || !nonEmptyString(value.next_action_owner)
    || typeof value.manager_decision_required !== "boolean") {
    throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
  }
  const replyOrDueDate = value.reply_or_due_date ?? null;
  if (replyOrDueDate !== null
    && !/^\d{4}-\d{2}-\d{2}$/u.test(replyOrDueDate)
    && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(replyOrDueDate)) {
    throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
  }
  return {
    reason: value.reason.trim(),
    required_input: value.required_input.trim(),
    next_action_owner: value.next_action_owner.trim(),
    reply_or_due_date: replyOrDueDate,
    manager_decision_required: value.manager_decision_required,
  };
}

function assertJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || seen.has(value)) {
    throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
  }
  seen.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    assertJsonValue(child, seen);
  }
  seen.delete(value);
}

function normalizeExecutorOutcome(input) {
  let value;
  try { value = structuredClone(input); } catch {
    throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
  }
  const fields = {
    succeeded: ["status", "result", "artifact_refs", "evidence_refs", "completion_criteria_met"],
    waiting: ["status", "waiting_info", "artifact_refs", "evidence_refs", "completion_criteria_met"],
    failed: ["status", "result", "reason_code", "artifact_refs", "evidence_refs", "completion_criteria_met"],
    cancelled: ["status", "result", "reason_code", "artifact_refs", "evidence_refs", "completion_criteria_met"],
  }[value.status];
  if (!fields || Object.keys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
  }
  assertJsonValue(value);
  return value;
}

export function createTaskExecutionCore({ taskProvider, eventStore, executors, clock } = {}) {
  if (typeof taskProvider?.readTask !== "function") {
    throw new TypeError("task_execution_provider_required");
  }
  if (typeof eventStore?.claim !== "function"
    || typeof eventStore?.markRunning !== "function"
    || typeof eventStore?.complete !== "function"
    || typeof eventStore?.appendProviderEvent !== "function"
    || typeof eventStore?.readTaskExecution !== "function"
    || typeof eventStore?.findDispatch !== "function") {
    throw new TypeError("task_execution_event_store_required");
  }
  if (!(executors instanceof Map) || typeof clock !== "function") {
    throw new TypeError("task_execution_dependencies_invalid");
  }

  return Object.freeze({
    async ingestEvent(input) {
      let event;
      try {
        event = normalizeProviderEvent(input);
      } catch {
        throw new TaskExecutionCoreError("PROVIDER_EVENT_INVALID");
      }
      let appended;
      try {
        appended = eventStore.appendProviderEvent(event);
      } catch (error) {
        if (error?.code === "PROVIDER_EVENT_CONFLICT") {
          throw new TaskExecutionCoreError("PROVIDER_EVENT_CONFLICT");
        }
        throw new TaskExecutionCoreError("EVENT_STORE_WRITE_FAILED");
      }
      return deepFreeze({
        status: appended.status,
        ...appended.event,
      });
    },

    async dispatch({ task_ref: taskRef, idempotency_key: idempotencyKey } = {}) {
      const key = taskKey(taskRef);
      if (!nonEmptyString(idempotencyKey)) {
        throw new TypeError("task_execution_idempotency_key_invalid");
      }
      if (isCandidateRef(taskRef)) {
        return notDispatched("CANDIDATE_NOT_EXECUTABLE");
      }
      // A dispatch key is the durable identity of the first accepted same-Task execution basis.
      // Replay therefore happens before mutable provider reads. A changed brief/authority needs a
      // new key; reusing this key for another Task remains an idempotency conflict in EventStore.
      let prior;
      try {
        prior = eventStore.findDispatch(idempotencyKey, key);
      } catch (error) {
        if (error?.code === "IDEMPOTENCY_CONFLICT") {
          throw new TaskExecutionCoreError("IDEMPOTENCY_CONFLICT");
        }
        throw new TaskExecutionCoreError("EVENT_STORE_READ_FAILED");
      }
      if (prior !== null) {
        if (prior.receipt !== null) {
          return deepFreeze({
            status: prior.receipt.outcome,
            reason_code: null,
            replayed: true,
            agent_run: prior.run,
            execution_receipt: prior.receipt,
            official_task_status_observed:
              prior.receipt.official_task_status_observed ?? "Todo",
            official_task_mutated: false,
          });
        }
        return deepFreeze({
          status: "held",
          reason_code: "RUN_RECOVERY_REQUIRED",
          replayed: true,
          agent_run: prior.run,
          execution_receipt: null,
          official_task_status_observed: "Todo",
          official_task_mutated: false,
        });
      }
      let task;
      try {
        task = await taskProvider.readTask(taskRef);
      } catch {
        throw new TaskExecutionCoreError("PROVIDER_READ_FAILED");
      }
      if (task?.task_class === "candidate" || isCandidateRef(task?.task_ref)) {
        return notDispatched("CANDIDATE_NOT_EXECUTABLE", task?.status ?? null);
      }
      if (task !== null && task !== undefined && !sameTaskRef(task.task_ref, taskRef)) {
        return notDispatched("PROVIDER_TASK_REF_MISMATCH");
      }
      if (!task || task.task_class !== "official") {
        return notDispatched("TASK_NOT_OFFICIAL", task?.status ?? null);
      }
      if (task.status !== "Todo") {
        return notDispatched("TASK_STATUS_NOT_TODO", task.status ?? null);
      }
      if (task.work_brief === null || task.work_brief === undefined) {
        return notDispatched("WORK_BRIEF_MISSING", task.status);
      }
      try {
        assertWorkBrief(task.work_brief);
      } catch {
        return notDispatched("WORK_BRIEF_INVALID", task.status);
      }
      if (!sameTaskRef(task.work_brief.revision_ref, taskRef)) {
        return notDispatched("WORK_BRIEF_INVALID", task.status);
      }
      if (task.policy_gate?.status !== "approved"
        || !nonEmptyString(task.policy_gate?.authority_ref)) {
        return notDispatched("POLICY_GATE_NOT_PASSED", task.status);
      }
      if (!nonEmptyString(task.executor_ref)) {
        return notDispatched("EXECUTOR_NOT_ASSIGNED", task.status);
      }
      const executor = executors.get(task.executor_ref);
      if (typeof executor?.execute !== "function") {
        return notDispatched("EXECUTOR_UNAVAILABLE", task.status);
      }

      const basis = {
        task_ref: task.task_ref,
        project_ref: task.project_ref,
        work_brief_revision_ref: task.work_brief.revision_ref,
        executor_ref: task.executor_ref,
        authority_ref: task.policy_gate.authority_ref,
      };
      const executionKey = digest(basis);
      const runId = opaqueId("agent_run", { execution_key: executionKey, idempotency_key: idempotencyKey });
      const claimedAt = readClock(clock);
      const claimEvent = buildRunEvent({
        runId,
        taskKey: key,
        taskRef,
        sequence: 1,
        state: "claimed",
        at: claimedAt,
        dispatchKey: idempotencyKey,
      });
      let claim;
      try {
        claim = eventStore.claim({
          run_id: runId,
          task_key: key,
          task_ref: taskRef,
          project_ref: task.project_ref,
          work_brief_revision_ref: task.work_brief.revision_ref,
          executor_ref: task.executor_ref,
          authority_ref: task.policy_gate.authority_ref,
          attempt_no: 1,
          dispatch_idempotency_key: idempotencyKey,
          execution_key: executionKey,
          claimed_at: claimedAt,
        }, claimEvent);
      } catch (error) {
        if (error?.code === "IDEMPOTENCY_CONFLICT") {
          throw new TaskExecutionCoreError("IDEMPOTENCY_CONFLICT");
        }
        throw new TaskExecutionCoreError("EVENT_STORE_WRITE_FAILED");
      }
      if (claim.status === "active_exists") {
        return deepFreeze({
          status: "not_dispatched",
          reason_code: "ACTIVE_AGENT_RUN_EXISTS",
          replayed: false,
          agent_run: claim.run,
          execution_receipt: null,
          official_task_status_observed: task.status,
          official_task_mutated: false,
        });
      }
      if (claim.status === "existing") {
        if (claim.receipt !== null) {
          return deepFreeze({
            status: claim.receipt.outcome,
            reason_code: null,
            replayed: true,
            agent_run: claim.run,
            execution_receipt: claim.receipt,
            official_task_status_observed: task.status,
            official_task_mutated: false,
          });
        }
        return deepFreeze({
          status: "held",
          reason_code: "RUN_RECOVERY_REQUIRED",
          replayed: true,
          agent_run: claim.run,
          execution_receipt: null,
          official_task_status_observed: task.status,
          official_task_mutated: false,
        });
      }
      const startedAt = readClock(clock);
      try {
        eventStore.markRunning(runId, startedAt, buildRunEvent({
          runId,
          taskKey: key,
          taskRef,
          sequence: 2,
          state: "running",
          at: startedAt,
          dispatchKey: idempotencyKey,
        }));
      } catch {
        throw new TaskExecutionCoreError("EVENT_STORE_WRITE_FAILED");
      }

      let outcome;
      try {
        const executorInput = deepFreeze(structuredClone({
          operation_id: runId,
          task,
          work_brief: task.work_brief,
        }));
        outcome = await executor.execute(executorInput);
      } catch {
        throw new TaskExecutionCoreError("EXECUTOR_CRASHED");
      }
      outcome = normalizeExecutorOutcome(outcome);
      if (!Array.isArray(outcome?.artifact_refs)
        || !Array.isArray(outcome.evidence_refs)
        || typeof outcome.completion_criteria_met !== "boolean") {
        throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
      }
      const outcomeStatus = outcome.status;
      if (outcomeStatus === "succeeded") {
        if (!nonEmptyString(outcome.result?.summary)
          || outcome.completion_criteria_met !== true) {
          throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
        }
      } else if (outcomeStatus === "waiting") {
        if (outcome.completion_criteria_met !== false) {
          throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
        }
      } else if (["failed", "cancelled"].includes(outcomeStatus)) {
        if (outcome.completion_criteria_met !== false
          || !nonEmptyString(outcome.result?.summary)
          || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(outcome.reason_code ?? "")) {
          throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
        }
      } else {
        throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
      }
      const waitingInfo = outcomeStatus === "waiting"
        ? normalizeWaitingInfo(outcome.waiting_info)
        : null;
      let resultForReceipt = null;
      let artifactRefsForReceipt;
      let evidenceRefsForReceipt;
      try {
        resultForReceipt = outcomeStatus === "waiting" ? null : structuredClone(outcome.result);
        artifactRefsForReceipt = structuredClone(outcome.artifact_refs);
        evidenceRefsForReceipt = structuredClone(outcome.evidence_refs);
      } catch {
        throw new TaskExecutionCoreError("EXECUTOR_OUTCOME_INVALID");
      }
      const endedAt = readClock(clock);
      const receipt = {
        schema_version: TASK_EXECUTION_RECEIPT_SCHEMA,
        receipt_id: opaqueId("execution_receipt", { run_id: runId, outcome }),
        run_id: runId,
        task_ref: structuredClone(taskRef),
        work_brief_revision_ref: structuredClone(task.work_brief.revision_ref),
        executor_ref: task.executor_ref,
        authority_ref: task.policy_gate.authority_ref,
        dispatch_idempotency_key: idempotencyKey,
        execution_key: executionKey,
        outcome: outcomeStatus,
        result: resultForReceipt,
        reason_code: ["failed", "cancelled"].includes(outcomeStatus)
          ? outcome.reason_code.trim()
          : null,
        waiting_info: waitingInfo,
        artifact_refs: artifactRefsForReceipt,
        evidence_refs: evidenceRefsForReceipt,
        completion_criteria_met: outcome.completion_criteria_met,
        official_task_done: false,
        official_task_mutated: false,
        official_task_status_observed: task.status,
        external_effects: {
          linear_writes: 0,
          gmail_sends: 0,
          slack_posts: 0,
          sharing_changes: 0,
        },
        recorded_at: endedAt,
      };
      let completed;
      try {
        completed = eventStore.complete(
          runId,
          outcomeStatus,
          receipt,
          endedAt,
          buildRunEvent({
            runId,
            taskKey: key,
            taskRef,
            sequence: 3,
            state: outcomeStatus,
            at: endedAt,
            dispatchKey: idempotencyKey,
          }),
        );
      } catch {
        throw new TaskExecutionCoreError("EVENT_STORE_WRITE_FAILED");
      }
      const dispatch = {
        status: outcomeStatus,
        replayed: false,
        agent_run: completed.run,
        execution_receipt: completed.receipt,
        official_task_status_observed: task.status,
        official_task_mutated: false,
      };
      return deepFreeze(dispatch);
    },

    async readExecution({ task_ref: taskRef } = {}) {
      try {
        return deepFreeze(eventStore.readTaskExecution(taskKey(taskRef)));
      } catch {
        throw new TaskExecutionCoreError("EVENT_STORE_READ_FAILED");
      }
    },
  });
}

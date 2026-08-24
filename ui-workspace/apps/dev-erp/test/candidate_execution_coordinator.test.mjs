import assert from "node:assert/strict";
import test from "node:test";

import { assignCandidate } from "../src/assignment_policy.mjs";
import {
  CANDIDATE_EXECUTION_RECEIPT_SCHEMA,
  createCandidateExecutionCoordinator,
} from "../src/candidate_execution_coordinator.mjs";
import { matchRoleCapabilities } from "../src/role_capability_matcher.mjs";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

function taskRef(taskId) {
  return { provider: "linear", task_id: taskId };
}

function revisionRef(taskId, revisionId = "brief-r1") {
  return {
    provider: "linear",
    task_id: taskId,
    revision_id: revisionId,
    content_sha256: SHA_A,
  };
}

function taskPacket(taskId, {
  revisionId = "brief-r1",
  actionRef = "prepare.synthetic.review",
  authorityRef = "authority.synthetic.r1",
  parentTaskRef = null,
  coverageRefs = [`coverage.${taskId.toLowerCase()}`],
} = {}) {
  return {
    schema_version: "soulforge.candidate_execution.task_packet.v1",
    validation_state: "prevalidated",
    task_class: "official",
    task_status: "Todo",
    task_ref: taskRef(taskId),
    parent_task_ref: parentTaskRef,
    work_brief_revision_ref: revisionRef(taskId, revisionId),
    action_ref: actionRef,
    authority_ref: authorityRef,
    coverage_refs: coverageRefs,
  };
}

function candidatePacket(task, { candidateRef = `candidate.${task.task_ref.task_id.toLowerCase()}` } = {}) {
  return {
    schema_version: "soulforge.candidate_execution.candidate_packet.v1",
    validation_state: "prevalidated",
    selection_state: "candidate",
    candidate_ref: candidateRef,
    label_prefilter_passed: true,
    task_ref: structuredClone(task.task_ref),
    work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
    action_ref: task.action_ref,
    authority_ref: task.authority_ref,
  };
}

function assignmentPacket(task, {
  actorRef = "actor.product.ceo",
  agentId = "agent.product.ceo",
  botRef = "bot.product.ceo",
  executorRef = "executor.product.ceo",
} = {}) {
  return {
    schema_version: "soulforge.assignment_policy.assignment_packet.v1",
    validation_state: "prevalidated",
    assignment_state: "assigned",
    policy_mode: "responsible_ceo_triage",
    policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: SHA_B },
    task_ref: structuredClone(task.task_ref),
    work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
    action_ref: task.action_ref,
    authority_ref: task.authority_ref,
    responsible_role_ref: "role.product.ceo",
    performer_binding: {
      actor_ref: actorRef,
      performing_agent_id: agentId,
      bot_ref: botRef,
      executor_ref: executorRef,
      capability_snapshot_ref: { revision_id: "capabilities-r1", content_sha256: SHA_B },
    },
  };
}

function bundle(task, options = {}) {
  return {
    candidate_packet: candidatePacket(task, options),
    task_packet: task,
    assignment_packet: assignmentPacket(task, options),
    idempotency_key: options.idempotencyKey ?? `dispatch.${task.task_ref.task_id.toLowerCase()}.1`,
    successor_of_receipt_id: options.successorReceiptId ?? null,
  };
}

function outcome(status, overrides = {}) {
  return {
    status,
    reason_code: status === "succeeded" ? null : "SYNTHETIC_REASON",
    result_ref: status === "succeeded" ? "result.synthetic.ok" : null,
    artifact_refs: status === "succeeded" ? ["artifact.synthetic.output"] : [],
    evidence_refs: ["evidence.synthetic.validator"],
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("feature-OFF and label-prefilter-only requests never reach an Executor", async () => {
  let calls = 0;
  const executors = new Map([["executor.product.ceo", {
    async execute() { calls += 1; return outcome("succeeded"); },
  }]]);
  const task = taskPacket("TASK-OFF-001");

  const disabled = createCandidateExecutionCoordinator({ executors });
  assert.equal((await disabled.dispatch(bundle(task))).hold_code, "FEATURE_OFF");

  const enabled = createCandidateExecutionCoordinator({ executors, feature_enabled: true });
  const labelOnly = await enabled.dispatch({
    candidate_packet: candidatePacket(task),
    idempotency_key: "dispatch.label.only",
  });
  assert.equal(labelOnly.hold_code, "PACKET_SET_INCOMPLETE");

  const matcherHold = {
    schema_version: "soulforge.role_capability.match_result.v1",
    state: "hold",
    hold_code: "CAPABILITY_REQUIREMENT_UNMET",
    task_ref: task.task_ref,
    work_brief_revision_ref: task.work_brief_revision_ref,
    action_ref: task.action_ref,
    authority_ref: task.authority_ref,
    role_snapshot_ref: { revision_id: "roles-r1", content_sha256: SHA_A },
    capability_snapshot_ref: { revision_id: "caps-r1", content_sha256: SHA_B },
    responsible_role_ref: "role.product.ceo",
    responsible_actor_ref: "actor.product.ceo",
    required_capability_refs: ["cap.review"],
    missing_capability_refs: ["cap.review"],
    candidates: [],
  };
  const heldAssignment = assignCandidate({
    matcher_result: matcherHold,
    policy: {
      schema_version: "soulforge.assignment_policy.snapshot.v1",
      validation_state: "prevalidated",
      mode: "responsible_ceo_triage",
      policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: SHA_A },
    },
  });
  const held = await enabled.dispatch({ ...bundle(task), assignment_packet: heldAssignment });
  assert.equal(held.hold_code, "ASSIGNMENT_NOT_READY");
  assert.equal(calls, 0);
});

test("only literal true enables candidate execution and inspect reports a boolean", async () => {
  let calls = 0;
  const task = taskPacket("TASK-FLAG-001");
  const results = await Promise.all(["false", 1, {}].map(async (featureEnabled) => {
    const coordinator = createCandidateExecutionCoordinator({
      feature_enabled: featureEnabled,
      executors: new Map([["executor.product.ceo", {
        async execute() { calls += 1; return outcome("succeeded"); },
      }]]),
    });
    return {
      dispatch_result: await coordinator.dispatch(bundle(task)),
      inspect_state: coordinator.inspect().feature_enabled,
    };
  }));

  assert.equal(calls, 0);
  assert.deepEqual(results.map((row) => row.dispatch_result.hold_code), [
    "FEATURE_OFF",
    "FEATURE_OFF",
    "FEATURE_OFF",
  ]);
  assert.deepEqual(results.map((row) => row.inspect_state), [false, false, false]);
});

test("Matcher to Assignment to Coordinator executes one exact positive binding", async () => {
  let calls = 0;
  const task = taskPacket("TASK-INTEGRATION-001");
  const matcherResult = matchRoleCapabilities({
    work_task_contract: {
      schema_version: "soulforge.role_capability.work_task_contract.v1",
      validation_state: "prevalidated",
      task_ref: structuredClone(task.task_ref),
      work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
      action_ref: task.action_ref,
      authority_ref: task.authority_ref,
      required_role_ref: "role.product.ceo",
      required_capability_refs: ["cap.triage", "cap.review"],
    },
    role_snapshot: {
      schema_version: "soulforge.organization.role_snapshot.v1",
      snapshot_ref: { revision_id: "roles-r1", content_sha256: SHA_A },
      roles: [{
        role_ref: "role.product.ceo",
        status: "active",
        responsible_action_refs: [task.action_ref],
        responsible_actor_ref: "actor.product.ceo",
        candidate_actor_refs: ["actor.product.ceo"],
      }],
    },
    capability_snapshot: {
      schema_version: "soulforge.organization.capability_snapshot.v1",
      snapshot_ref: { revision_id: "capabilities-r1", content_sha256: SHA_B },
      actor_bindings: [{
        actor_ref: "actor.product.ceo",
        performing_agent_id: "agent.product.ceo",
        bot_ref: "bot.product.ceo",
        executor_ref: "executor.product.ceo",
        status: "active",
        capability_refs: ["cap.review", "cap.triage"],
      }],
    },
  });
  const assignment = assignCandidate({
    matcher_result: matcherResult,
    policy: {
      schema_version: "soulforge.assignment_policy.snapshot.v1",
      validation_state: "prevalidated",
      mode: "responsible_ceo_triage",
      policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: SHA_A },
    },
  });
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([["executor.product.ceo", {
      async execute(input) {
        calls += 1;
        assert.deepEqual(input.assignment_packet, assignment);
        return outcome("succeeded");
      },
    }]]),
  });

  assert.equal(matcherResult.state, "candidate");
  assert.equal(assignment.assignment_state, "assigned");
  const result = await coordinator.dispatch({
    ...bundle(task),
    assignment_packet: assignment,
  });
  assert.equal(result.status, "succeeded");
  assert.equal(calls, 1);
});

test("only exact prevalidated candidate/task/assignment bindings dispatch and receipts preserve exact Bot attribution", async () => {
  let calls = 0;
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([["executor.product.ceo", {
      async execute(input) {
        calls += 1;
        assert.equal(input.claim.task_ref.task_id, "TASK-EXACT-001");
        assert.equal(input.assignment_packet.performer_binding.bot_ref, "bot.product.ceo");
        assert.equal(Object.isFrozen(input), true);
        return outcome("succeeded");
      },
    }]]),
  });
  const task = taskPacket("TASK-EXACT-001");

  const notValidated = bundle(task);
  notValidated.candidate_packet.validation_state = "observed";
  assert.equal((await coordinator.dispatch(notValidated)).hold_code, "CANDIDATE_PACKET_INVALID");

  const mismatchedTask = bundle(task);
  mismatchedTask.candidate_packet.action_ref = "prepare.other.review";
  assert.equal((await coordinator.dispatch(mismatchedTask)).hold_code, "EXECUTION_BASIS_MISMATCH");

  const mismatchedAuthority = bundle(task);
  mismatchedAuthority.assignment_packet.authority_ref = "authority.other.r1";
  assert.equal((await coordinator.dispatch(mismatchedAuthority)).hold_code, "EXECUTION_BASIS_MISMATCH");

  const ambiguousBinding = bundle(task);
  ambiguousBinding.assignment_packet.performer_binding.agent_id = "agent.alias";
  assert.equal((await coordinator.dispatch(ambiguousBinding)).hold_code, "ASSIGNMENT_PACKET_INVALID");
  assert.equal(calls, 0);

  const completed = await coordinator.dispatch(bundle(task));
  assert.equal(completed.status, "succeeded");
  assert.equal(calls, 1);
  assert.equal(completed.execution_receipt.schema_version, CANDIDATE_EXECUTION_RECEIPT_SCHEMA);
  assert.deepEqual(completed.execution_receipt.attribution, {
    responsible_role_ref: "role.product.ceo",
    actor_ref: "actor.product.ceo",
    performing_agent_id: "agent.product.ceo",
    bot_ref: "bot.product.ceo",
    executor_ref: "executor.product.ceo",
  });
  assert.equal(completed.execution_receipt.official_task_done, false);
  assert.equal(completed.execution_receipt.official_task_mutated, false);
  assert.deepEqual(completed.execution_receipt.external_effects, {
    linear_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    shell_commands: 0,
  });
});

test("decomposition receipts transfer exact parent-child-grandchild coverage without sibling overlap or parent re-execution", async () => {
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([["executor.product.ceo", {
      async execute() { return outcome("succeeded"); },
    }]]),
  });
  const root = taskPacket("TASK-ROOT", { coverageRefs: ["coverage.alpha", "coverage.beta"] });
  const childA = taskPacket("TASK-CHILD-A", {
    parentTaskRef: root.task_ref,
    coverageRefs: ["coverage.alpha"],
  });
  const childB = taskPacket("TASK-CHILD-B", {
    parentTaskRef: root.task_ref,
    coverageRefs: ["coverage.beta"],
  });
  const grandchild = taskPacket("TASK-GRANDCHILD", {
    parentTaskRef: childA.task_ref,
    coverageRefs: ["coverage.alpha"],
  });

  const overlapCoordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map(),
  });
  const overlapping = await overlapCoordinator.recordDecomposition({
    schema_version: "soulforge.candidate_execution.decomposition_packet.v1",
    validation_state: "prevalidated",
    decomposition_ref: "decomposition.overlap",
    parent_task_packet: root,
    assignment_packet: assignmentPacket(root),
    children_task_packets: [childA, { ...structuredClone(childB), coverage_refs: ["coverage.alpha"] }],
  });
  assert.equal(overlapping.hold_code, "SIBLING_COVERAGE_OVERLAP");

  const rootReceipt = await coordinator.recordDecomposition({
    schema_version: "soulforge.candidate_execution.decomposition_packet.v1",
    validation_state: "prevalidated",
    decomposition_ref: "decomposition.root.r1",
    parent_task_packet: root,
    assignment_packet: assignmentPacket(root),
    children_task_packets: [childA, childB],
  });
  assert.equal(rootReceipt.status, "RECORDED");
  assert.equal(rootReceipt.decomposition_receipt.official_task_done, false);

  const grandchildReceipt = await coordinator.recordDecomposition({
    schema_version: "soulforge.candidate_execution.decomposition_packet.v1",
    validation_state: "prevalidated",
    decomposition_ref: "decomposition.child-a.r1",
    parent_task_packet: childA,
    assignment_packet: assignmentPacket(childA),
    children_task_packets: [grandchild],
  });
  assert.equal(grandchildReceipt.status, "RECORDED");

  assert.equal((await coordinator.dispatch(bundle(root))).hold_code, "PARENT_COVERAGE_DECOMPOSED");
  assert.equal((await coordinator.dispatch(bundle(childA))).hold_code, "PARENT_COVERAGE_DECOMPOSED");
  assert.equal((await coordinator.dispatch(bundle(childB))).status, "succeeded");
  assert.equal((await coordinator.dispatch(bundle(grandchild))).status, "succeeded");

  const foreign = taskPacket("TASK-FOREIGN-CHILD", {
    parentTaskRef: taskRef("TASK-UNKNOWN-PARENT"),
    coverageRefs: ["coverage.gamma"],
  });
  assert.equal((await coordinator.dispatch(bundle(foreign))).hold_code, "UNKNOWN_ANCESTRY");

  const snapshot = coordinator.inspect();
  assert.deepEqual(snapshot.coverage_custody, [
    { coverage_ref: "coverage.alpha", task_id: "TASK-GRANDCHILD" },
    { coverage_ref: "coverage.beta", task_id: "TASK-CHILD-B" },
  ]);
});

test("nested custody rejects immutable child, lineage, and assignment drift before dispatch or decomposition", async () => {
  async function fixture() {
    let executorCalls = 0;
    const coordinator = createCandidateExecutionCoordinator({
      feature_enabled: true,
      executors: new Map([
        ["executor.product.ceo", {
          async execute() { executorCalls += 1; return outcome("succeeded"); },
        }],
        ["executor.reviewer", {
          async execute() { executorCalls += 1; return outcome("succeeded"); },
        }],
      ]),
    });
    const root = taskPacket("TASK-CUSTODY-ROOT", {
      coverageRefs: ["coverage.custody.alpha", "coverage.custody.beta"],
    });
    const child = taskPacket("TASK-CUSTODY-CHILD", {
      parentTaskRef: root.task_ref,
      coverageRefs: ["coverage.custody.alpha", "coverage.custody.beta"],
    });
    const grandchild = taskPacket("TASK-CUSTODY-GRANDCHILD", {
      parentTaskRef: child.task_ref,
      coverageRefs: ["coverage.custody.alpha", "coverage.custody.beta"],
    });
    const rootPacket = {
      schema_version: "soulforge.candidate_execution.decomposition_packet.v1",
      validation_state: "prevalidated",
      decomposition_ref: "decomposition.custody.root.r1",
      parent_task_packet: root,
      assignment_packet: assignmentPacket(root),
      children_task_packets: [child],
    };
    assert.equal((await coordinator.recordDecomposition(rootPacket)).status, "RECORDED");
    return {
      coordinator,
      rootPacket,
      child,
      grandchild,
      executorCalls: () => executorCalls,
    };
  }

  const dispatchDrifts = [
    {
      label: "authority",
      mutate(task) { task.authority_ref = "authority.synthetic.r2"; },
    },
    {
      label: "parent",
      mutate(task) { task.parent_task_ref = taskRef("TASK-FOREIGN-PARENT"); },
    },
    {
      label: "immutable coverage packet",
      mutate(task) { task.coverage_refs = ["coverage.custody.alpha"]; },
    },
  ];
  for (const drift of dispatchDrifts) {
    const current = await fixture();
    const child = structuredClone(current.child);
    drift.mutate(child);
    const rejected = await current.coordinator.dispatch(bundle(child, {
      idempotencyKey: `dispatch.custody.${drift.label.replaceAll(" ", "-")}`,
    }));
    assert.equal(rejected.status, "HOLD", `${drift.label} dispatch must HOLD`);
    assert.equal(current.executorCalls(), 0, `${drift.label} dispatch must not call an executor`);
    assert.equal(current.coordinator.inspect().decomposition_receipts.length, 1);
  }

  {
    const current = await fixture();
    const rejected = await current.coordinator.dispatch(bundle(current.child, {
      idempotencyKey: "dispatch.custody.assignment-drift",
      actorRef: "actor.reviewer",
      agentId: "agent.reviewer",
      botRef: "bot.reviewer",
      executorRef: "executor.reviewer",
    }));
    assert.equal(rejected.status, "HOLD", "assignment drift dispatch must HOLD");
    assert.equal(current.executorCalls(), 0, "assignment drift must not call an executor");
    assert.equal(current.coordinator.inspect().decomposition_receipts.length, 1);
  }

  const decompositionDrifts = [
    {
      label: "authority",
      mutate(parent, grandchild) {
        parent.authority_ref = "authority.synthetic.r2";
        grandchild.authority_ref = "authority.synthetic.r2";
      },
    },
    {
      label: "parent",
      mutate(parent) { parent.parent_task_ref = taskRef("TASK-FOREIGN-PARENT"); },
    },
    {
      label: "immutable coverage packet",
      mutate(parent, grandchild) {
        parent.coverage_refs = ["coverage.custody.alpha"];
        grandchild.coverage_refs = ["coverage.custody.alpha"];
      },
    },
  ];
  for (const drift of decompositionDrifts) {
    const current = await fixture();
    const parent = structuredClone(current.child);
    const grandchild = structuredClone(current.grandchild);
    drift.mutate(parent, grandchild);
    const rejected = await current.coordinator.recordDecomposition({
      schema_version: "soulforge.candidate_execution.decomposition_packet.v1",
      validation_state: "prevalidated",
      decomposition_ref: `decomposition.custody.${drift.label.replaceAll(" ", "-")}`,
      parent_task_packet: parent,
      assignment_packet: assignmentPacket(parent),
      children_task_packets: [grandchild],
    });
    assert.equal(rejected.status, "HOLD", `${drift.label} decomposition must HOLD`);
    assert.equal(current.executorCalls(), 0);
    assert.equal(current.coordinator.inspect().decomposition_receipts.length, 1);
  }

  {
    const current = await fixture();
    const rejected = await current.coordinator.recordDecomposition({
      schema_version: "soulforge.candidate_execution.decomposition_packet.v1",
      validation_state: "prevalidated",
      decomposition_ref: "decomposition.custody.assignment-drift",
      parent_task_packet: current.child,
      assignment_packet: assignmentPacket(current.child, {
        actorRef: "actor.reviewer",
        agentId: "agent.reviewer",
        botRef: "bot.reviewer",
        executorRef: "executor.reviewer",
      }),
      children_task_packets: [current.grandchild],
    });
    assert.equal(rejected.status, "HOLD", "assignment drift decomposition must HOLD");
    assert.equal(current.executorCalls(), 0);
    assert.equal(current.coordinator.inspect().decomposition_receipts.length, 1);
  }

  const valid = await fixture();
  assert.equal((await valid.coordinator.recordDecomposition(valid.rootPacket)).status, "NO_OP");
  const nestedPacket = {
    schema_version: "soulforge.candidate_execution.decomposition_packet.v1",
    validation_state: "prevalidated",
    decomposition_ref: "decomposition.custody.child.r1",
    parent_task_packet: valid.child,
    assignment_packet: assignmentPacket(valid.child),
    children_task_packets: [valid.grandchild],
  };
  assert.equal((await valid.coordinator.recordDecomposition(nestedPacket)).status, "RECORDED");
  assert.equal((await valid.coordinator.recordDecomposition(nestedPacket)).status, "NO_OP");
  const divergentLineage = structuredClone(nestedPacket);
  divergentLineage.decomposition_ref = "decomposition.custody.child.r2";
  assert.equal((await valid.coordinator.recordDecomposition(divergentLineage)).status, "HOLD");
  assert.equal(valid.coordinator.inspect().decomposition_receipts.length, 2);
  assert.equal((await valid.coordinator.dispatch(bundle(valid.grandchild))).status, "succeeded");
  assert.equal((await valid.coordinator.dispatch(bundle(valid.grandchild))).status, "NO_OP");
  assert.equal(valid.executorCalls(), 1);
});

test("one active slot per performing agent allows other agents in parallel and releases on waiting while retaining coverage", async () => {
  const first = deferred();
  let agentOneCalls = 0;
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([
      ["executor.product.ceo", {
        async execute(input) {
          agentOneCalls += 1;
          if (input.claim.task_ref.task_id === "TASK-SLOT-1" && input.attempt_no === 1) return first.promise;
          return outcome("succeeded");
        },
      }],
      ["executor.reviewer", { async execute() { return outcome("succeeded"); } }],
    ]),
  });
  const firstTask = taskPacket("TASK-SLOT-1", { coverageRefs: ["coverage.slot.one"] });
  const sameAgentTask = taskPacket("TASK-SLOT-2", { coverageRefs: ["coverage.slot.two"] });
  const otherAgentTask = taskPacket("TASK-SLOT-3", { coverageRefs: ["coverage.slot.three"] });

  const pending = coordinator.dispatch(bundle(firstTask));
  await Promise.resolve();
  assert.equal(coordinator.inspect().active_slots.length, 1);

  const busy = await coordinator.dispatch(bundle(sameAgentTask));
  assert.equal(busy.hold_code, "PERFORMING_AGENT_SLOT_BUSY");
  assert.equal(agentOneCalls, 1);

  const parallel = await coordinator.dispatch(bundle(otherAgentTask, {
    actorRef: "actor.reviewer",
    agentId: "agent.reviewer",
    botRef: "bot.reviewer",
    executorRef: "executor.reviewer",
  }));
  assert.equal(parallel.status, "succeeded");

  first.resolve(outcome("waiting", {
    reason_code: "INPUT_REQUIRED",
    result_ref: null,
    artifact_refs: [],
  }));
  const waiting = await pending;
  assert.equal(waiting.status, "waiting");
  assert.equal(coordinator.inspect().active_slots.length, 0);

  const divergentSuccessor = await coordinator.dispatch(bundle(firstTask, {
    idempotencyKey: "dispatch.task-slot-1.divergent",
    successorReceiptId: waiting.execution_receipt.receipt_id,
    actorRef: "actor.reviewer",
    agentId: "agent.reviewer",
    botRef: "bot.reviewer",
    executorRef: "executor.reviewer",
  }));
  assert.equal(divergentSuccessor.hold_code, "CLAIM_REPLAY_CONFLICT");

  const successor = await coordinator.dispatch(bundle(firstTask, {
    idempotencyKey: "dispatch.task-slot-1.2",
    successorReceiptId: waiting.execution_receipt.receipt_id,
  }));
  assert.equal(successor.status, "succeeded");
  assert.equal(successor.agent_run.attempt_no, 2);
  assert.notEqual(successor.agent_run.run_id, waiting.agent_run.run_id);

  const coverageIntruder = taskPacket("TASK-SLOT-INTRUDER", { coverageRefs: ["coverage.slot.one"] });
  assert.equal((await coordinator.dispatch(bundle(coverageIntruder))).hold_code, "COVERAGE_CUSTODY_CONFLICT");
});

test("claim replay is a natural-key NO_OP across idempotency keys and divergent replay is HOLD", async () => {
  let calls = 0;
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([
      ["executor.product.ceo", { async execute() { calls += 1; return outcome("succeeded"); } }],
      ["executor.reviewer", { async execute() { calls += 1; return outcome("succeeded"); } }],
    ]),
  });
  const task = taskPacket("TASK-REPLAY-001");
  const first = await coordinator.dispatch(bundle(task));
  assert.equal(first.status, "succeeded");

  const replay = await coordinator.dispatch(bundle(task, { idempotencyKey: "dispatch.replay.new-key" }));
  assert.equal(replay.status, "NO_OP");
  assert.equal(replay.execution_receipt.receipt_id, first.execution_receipt.receipt_id);
  assert.equal(calls, 1);

  const divergent = await coordinator.dispatch(bundle(task, {
    idempotencyKey: "dispatch.replay.divergent",
    actorRef: "actor.reviewer",
    agentId: "agent.reviewer",
    botRef: "bot.reviewer",
    executorRef: "executor.reviewer",
  }));
  assert.equal(divergent.hold_code, "CLAIM_REPLAY_CONFLICT");
  assert.equal(calls, 1);

  const otherTask = taskPacket("TASK-REPLAY-OTHER");
  const keyConflict = await coordinator.dispatch(bundle(otherTask, {
    idempotencyKey: "dispatch.replay.new-key",
  }));
  assert.equal(keyConflict.hold_code, "IDEMPOTENCY_KEY_CONFLICT");

  const successorAfterSuccess = await coordinator.dispatch(bundle(task, {
    idempotencyKey: "dispatch.replay.successor",
    successorReceiptId: first.execution_receipt.receipt_id,
  }));
  assert.equal(successorAfterSuccess.hold_code, "SUCCESSOR_NOT_ALLOWED");
});

test("adapter crash and a manually held timed-out run release the slot and fence late completion", async () => {
  const late = deferred();
  let calls = 0;
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([["executor.product.ceo", {
      async execute(input) {
        calls += 1;
        if (input.claim.task_ref.task_id === "TASK-LATE-001" && input.attempt_no === 1) return late.promise;
        if (input.claim.task_ref.task_id === "TASK-CRASH-001") throw new Error("synthetic adapter crash");
        return outcome("succeeded");
      },
    }]]),
  });
  const task = taskPacket("TASK-LATE-001", { coverageRefs: ["coverage.late"] });
  const pending = coordinator.dispatch(bundle(task));
  await Promise.resolve();
  const [active] = coordinator.inspect().active_slots;

  const held = coordinator.holdRun({
    run_id: active.run_id,
    fencing_epoch: active.fencing_epoch,
    reason_code: "ADAPTER_TIMEOUT",
    evidence_refs: ["evidence.synthetic.timeout"],
  });
  assert.equal(held.status, "hold");
  assert.equal(coordinator.inspect().active_slots.length, 0);

  const successor = await coordinator.dispatch(bundle(task, {
    idempotencyKey: "dispatch.task-late-001.2",
    successorReceiptId: held.execution_receipt.receipt_id,
  }));
  assert.equal(successor.status, "succeeded");
  assert.equal(successor.agent_run.attempt_no, 2);

  late.resolve(outcome("succeeded"));
  const lateResult = await pending;
  assert.equal(lateResult.hold_code, "RUN_FENCED_OUT");
  assert.equal(coordinator.inspect().execution_receipts.length, 2);

  const crashedTask = taskPacket("TASK-CRASH-001", { coverageRefs: ["coverage.crash"] });
  const crashed = await coordinator.dispatch(bundle(crashedTask));
  assert.equal(crashed.status, "hold");
  assert.equal(crashed.execution_receipt.reason_code, "ADAPTER_CRASHED");
  assert.equal(coordinator.inspect().active_slots.length, 0);

  const failedTask = taskPacket("TASK-FAILED-001", { coverageRefs: ["coverage.failed"] });
  const failedCoordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([["executor.product.ceo", {
      async execute() { return outcome("failed", { reason_code: "VALIDATION_FAILED" }); },
    }]]),
  });
  const failed = await failedCoordinator.dispatch(bundle(failedTask));
  assert.equal(failed.status, "failed");
  assert.equal(failedCoordinator.inspect().active_slots.length, 0);
  const failedCoverageIntruder = taskPacket("TASK-FAILED-INTRUDER", {
    coverageRefs: ["coverage.failed"],
  });
  assert.equal(
    (await failedCoordinator.dispatch(bundle(failedCoverageIntruder))).hold_code,
    "COVERAGE_CUSTODY_CONFLICT",
  );
  assert.equal(calls, 3);
});

test("invalid adapter payloads become metadata-only post-dispatch HOLD receipts and never leak raw, paths, or secrets", async () => {
  const forbiddenBody = "forbidden synthetic body";
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([["executor.product.ceo", {
      async execute() {
        return { ...outcome("succeeded"), raw_output: forbiddenBody };
      },
    }]]),
  });
  const task = taskPacket("TASK-PRIVACY-001");
  const held = await coordinator.dispatch(bundle(task));
  assert.equal(held.status, "hold");
  assert.equal(held.execution_receipt.reason_code, "EXECUTOR_OUTCOME_INVALID");
  assert.equal(coordinator.inspect().active_slots.length, 0);

  const serialized = JSON.stringify(coordinator.inspect());
  assert.equal(serialized.includes(forbiddenBody), false);
  assert.equal(serialized.includes("raw_output"), false);
  assert.equal(serialized.includes("official_task_done\":true"), false);

  const secretPacket = bundle(taskPacket("TASK-PRIVACY-SECRET"));
  secretPacket.assignment_packet.performer_binding.bot_ref = `sk-${"x".repeat(20)}`;
  assert.equal((await coordinator.dispatch(secretPacket)).hold_code, "PACKET_METADATA_ONLY_REQUIRED");

  const pathPacket = bundle(taskPacket("TASK-PRIVACY-PATH"));
  pathPacket.task_packet.coverage_refs = [["C:", "private", "artifact"].join("\\")];
  assert.equal((await coordinator.dispatch(pathPacket)).hold_code, "PACKET_METADATA_ONLY_REQUIRED");
});

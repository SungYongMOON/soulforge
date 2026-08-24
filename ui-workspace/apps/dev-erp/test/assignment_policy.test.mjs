import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSIGNMENT_PACKET_SCHEMA,
  assignCandidate,
} from "../src/assignment_policy.mjs";

const SHA_A = `sha256:${"a".repeat(64)}`;

function matcherResult(overrides = {}) {
  return {
    schema_version: "soulforge.role_capability.match_result.v1",
    state: "candidate",
    hold_code: null,
    task_ref: { provider: "linear", task_id: "TASK-AP-001" },
    work_brief_revision_ref: {
      provider: "linear",
      task_id: "TASK-AP-001",
      revision_id: "brief-r1",
      content_sha256: SHA_A,
    },
    action_ref: "prepare.synthetic.review",
    authority_ref: "authority.synthetic.r1",
    role_snapshot_ref: { revision_id: "roles-r1", content_sha256: SHA_A },
    capability_snapshot_ref: { revision_id: "capabilities-r1", content_sha256: SHA_A },
    responsible_role_ref: "role.product.ceo",
    responsible_actor_ref: "actor.product.ceo",
    required_capability_refs: ["cap.review", "cap.triage"],
    missing_capability_refs: [],
    candidates: [
      {
        actor_ref: "actor.reviewer",
        performing_agent_id: "agent.reviewer",
        bot_ref: "bot.reviewer",
        executor_ref: "executor.reviewer",
        match_reason_refs: ["cap.review", "cap.triage"],
      },
      {
        actor_ref: "actor.product.ceo",
        performing_agent_id: "agent.product.ceo",
        bot_ref: "bot.product.ceo",
        executor_ref: "executor.product.ceo",
        match_reason_refs: ["cap.review", "cap.triage"],
      },
    ],
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    matcher_result: matcherResult(),
    policy: {
      schema_version: "soulforge.assignment_policy.snapshot.v1",
      validation_state: "prevalidated",
      mode: "responsible_ceo_triage",
      policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: SHA_A },
    },
    ...overrides,
  };
}

test("responsible_ceo_triage chooses only the exact responsible actor binding", () => {
  const result = assignCandidate(request());

  assert.equal(result.schema_version, ASSIGNMENT_PACKET_SCHEMA);
  assert.equal(result.validation_state, "prevalidated");
  assert.equal(result.assignment_state, "assigned");
  assert.equal(result.policy_mode, "responsible_ceo_triage");
  assert.deepEqual(result.task_ref, { provider: "linear", task_id: "TASK-AP-001" });
  assert.equal(result.responsible_role_ref, "role.product.ceo");
  assert.deepEqual(result.performer_binding, {
    actor_ref: "actor.product.ceo",
    performing_agent_id: "agent.product.ceo",
    bot_ref: "bot.product.ceo",
    executor_ref: "executor.product.ceo",
    capability_snapshot_ref: { revision_id: "capabilities-r1", content_sha256: SHA_A },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.performer_binding), true);
});

test("a Role/Capability HOLD remains HOLD and cannot become an assignment", () => {
  const heldMatcher = matcherResult({
    state: "hold",
    hold_code: "CAPABILITY_REQUIREMENT_UNMET",
    candidates: [],
    missing_capability_refs: ["cap.review"],
  });
  const result = assignCandidate(request({ matcher_result: heldMatcher }));

  assert.equal(result.status, "HOLD");
  assert.equal(result.hold_code, "ROLE_CAPABILITY_HOLD");
  assert.equal(result.assignment_packet, null);
});

test("missing or ambiguous responsible actor bindings fail closed", () => {
  const absent = matcherResult({
    candidates: matcherResult().candidates.filter((row) => row.actor_ref !== "actor.product.ceo"),
  });
  assert.equal(
    assignCandidate(request({ matcher_result: absent })).hold_code,
    "RESPONSIBLE_ACTOR_CANDIDATE_MISSING",
  );

  const ambiguous = matcherResult();
  ambiguous.candidates.push({
    ...structuredClone(ambiguous.candidates[1]),
    performing_agent_id: "agent.product.ceo.other",
  });
  assert.equal(
    assignCandidate(request({ matcher_result: ambiguous })).hold_code,
    "RESPONSIBLE_ACTOR_CANDIDATE_AMBIGUOUS",
  );
});

test("candidate match reasons must be the exact unique required capability set", () => {
  const invalidReasonSets = [
    ["cap.review", "cap.other"],
    ["cap.review", "cap.review"],
    ["cap.review"],
    ["cap.review", "cap.triage", "cap.extra"],
  ];
  const results = invalidReasonSets.map((matchReasonRefs) => {
    const matcher = matcherResult();
    matcher.candidates[1].match_reason_refs = matchReasonRefs;
    return assignCandidate(request({ matcher_result: matcher }));
  });

  assert.deepEqual(results.map((result) => result.status), [
    "HOLD",
    "HOLD",
    "HOLD",
    "HOLD",
  ]);
  assert.deepEqual(results.map((result) => result.hold_code), [
    "MATCHER_RESULT_INVALID",
    "MATCHER_RESULT_INVALID",
    "MATCHER_RESULT_INVALID",
    "MATCHER_RESULT_INVALID",
  ]);
});

test("policy and matcher packets require exact schemas, prevalidation, and metadata-only fields", () => {
  const invalidMode = request();
  invalidMode.policy.mode = "auto_assign";
  assert.equal(assignCandidate(invalidMode).hold_code, "POLICY_MODE_NOT_ENABLED");

  const notValidated = request();
  notValidated.policy.validation_state = "observed";
  assert.equal(assignCandidate(notValidated).hold_code, "ASSIGNMENT_POLICY_INVALID");

  const taskMismatch = request();
  taskMismatch.matcher_result.work_brief_revision_ref.task_id = "TASK-OTHER";
  assert.equal(assignCandidate(taskMismatch).hold_code, "MATCHER_RESULT_INVALID");

  const raw = request();
  raw.matcher_result.candidates[0].raw_message = "forbidden";
  assert.equal(assignCandidate(raw).hold_code, "PACKET_METADATA_ONLY_REQUIRED");

  const secret = request();
  secret.policy.policy_revision_ref.revision_id = `sk-${"x".repeat(20)}`;
  assert.equal(assignCandidate(secret).hold_code, "PACKET_METADATA_ONLY_REQUIRED");

  const path = request();
  path.matcher_result.candidates[0].executor_ref = ["C:", "private", "executor"].join("\\");
  assert.equal(assignCandidate(path).hold_code, "PACKET_METADATA_ONLY_REQUIRED");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  ROLE_CAPABILITY_MATCH_SCHEMA,
  matchRoleCapabilities,
} from "../src/role_capability_matcher.mjs";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

function request(overrides = {}) {
  return {
    work_task_contract: {
      schema_version: "soulforge.role_capability.work_task_contract.v1",
      validation_state: "prevalidated",
      task_ref: { provider: "linear", task_id: "TASK-RC-001" },
      work_brief_revision_ref: {
        provider: "linear",
        task_id: "TASK-RC-001",
        revision_id: "brief-r1",
        content_sha256: SHA_A,
      },
      action_ref: "prepare.synthetic.review",
      authority_ref: "authority.synthetic.r1",
      required_role_ref: "role.product.ceo",
      required_capability_refs: ["cap.triage", "cap.review"],
    },
    role_snapshot: {
      schema_version: "soulforge.organization.role_snapshot.v1",
      snapshot_ref: { revision_id: "roles-r1", content_sha256: SHA_A },
      roles: [{
        role_ref: "role.product.ceo",
        status: "active",
        responsible_action_refs: ["prepare.synthetic.review"],
        responsible_actor_ref: "actor.product.ceo",
        candidate_actor_refs: ["actor.product.ceo", "actor.reviewer"],
      }],
    },
    capability_snapshot: {
      schema_version: "soulforge.organization.capability_snapshot.v1",
      snapshot_ref: { revision_id: "capabilities-r1", content_sha256: SHA_B },
      actor_bindings: [
        {
          actor_ref: "actor.product.ceo",
          performing_agent_id: "agent.product.ceo",
          bot_ref: "bot.product.ceo",
          executor_ref: "executor.product.ceo",
          status: "active",
          capability_refs: ["cap.review", "cap.triage"],
        },
        {
          actor_ref: "actor.reviewer",
          performing_agent_id: "agent.reviewer",
          bot_ref: "bot.reviewer",
          executor_ref: "executor.reviewer",
          status: "active",
          capability_refs: ["cap.review"],
        },
      ],
    },
    ...overrides,
  };
}

test("an exact versioned Role/Capability match returns bounded explicit actor-agent-bot candidates", () => {
  const result = matchRoleCapabilities(request());

  assert.equal(result.schema_version, ROLE_CAPABILITY_MATCH_SCHEMA);
  assert.equal(result.state, "candidate");
  assert.equal(result.responsible_role_ref, "role.product.ceo");
  assert.equal(result.responsible_actor_ref, "actor.product.ceo");
  assert.deepEqual(result.missing_capability_refs, []);
  assert.deepEqual(result.candidates, [{
    actor_ref: "actor.product.ceo",
    performing_agent_id: "agent.product.ceo",
    bot_ref: "bot.product.ceo",
    executor_ref: "executor.product.ceo",
    match_reason_refs: ["cap.review", "cap.triage"],
  }]);
  assert.deepEqual(result.task_ref, { provider: "linear", task_id: "TASK-RC-001" });
  assert.equal(result.authority_ref, "authority.synthetic.r1");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candidates[0]), true);
});

test("missing capabilities and an inactive responsible Role fail closed without a candidate", () => {
  const missing = request();
  missing.capability_snapshot.actor_bindings[0].capability_refs = ["cap.triage"];
  const missingResult = matchRoleCapabilities(missing);
  assert.equal(missingResult.state, "hold");
  assert.equal(missingResult.hold_code, "CAPABILITY_REQUIREMENT_UNMET");
  assert.deepEqual(missingResult.missing_capability_refs, ["cap.review"]);
  assert.deepEqual(missingResult.candidates, []);

  const inactive = request();
  inactive.role_snapshot.roles[0].status = "disabled";
  const inactiveResult = matchRoleCapabilities(inactive);
  assert.equal(inactiveResult.state, "hold");
  assert.equal(inactiveResult.hold_code, "RESPONSIBLE_ROLE_NOT_ACTIVE");
});

test("the matcher rejects non-prevalidated, mismatched, duplicate, raw, path, and secret-bearing packets", () => {
  const cases = [];

  const notValidated = request();
  notValidated.work_task_contract.validation_state = "observed";
  cases.push([notValidated, "WORK_TASK_CONTRACT_INVALID"]);

  const revisionMismatch = request();
  revisionMismatch.work_task_contract.work_brief_revision_ref.task_id = "TASK-OTHER";
  cases.push([revisionMismatch, "WORK_TASK_CONTRACT_INVALID"]);

  const duplicateRole = request();
  duplicateRole.role_snapshot.roles.push(structuredClone(duplicateRole.role_snapshot.roles[0]));
  cases.push([duplicateRole, "ROLE_SNAPSHOT_INVALID"]);

  const ambiguousBinding = request();
  ambiguousBinding.capability_snapshot.actor_bindings.push({
    ...structuredClone(ambiguousBinding.capability_snapshot.actor_bindings[0]),
    performing_agent_id: "agent.product.ceo.duplicate",
  });
  cases.push([ambiguousBinding, "CAPABILITY_SNAPSHOT_INVALID"]);

  const raw = request();
  raw.work_task_contract.raw_prompt = "forbidden";
  cases.push([raw, "PACKET_METADATA_ONLY_REQUIRED"]);

  const path = request();
  path.work_task_contract.authority_ref = ["C:", "private", "authority.json"].join("\\");
  cases.push([path, "PACKET_METADATA_ONLY_REQUIRED"]);

  const secret = request();
  secret.capability_snapshot.actor_bindings[0].bot_ref = `sk-${"x".repeat(20)}`;
  cases.push([secret, "PACKET_METADATA_ONLY_REQUIRED"]);

  for (const [input, expected] of cases) {
    const result = matchRoleCapabilities(input);
    assert.equal(result.state, "hold");
    assert.equal(result.hold_code, expected);
    assert.deepEqual(result.candidates, []);
  }
});

test("the required Role and action are exact and are never inferred from labels or nearby candidates", () => {
  const wrongAction = request();
  wrongAction.role_snapshot.roles[0].responsible_action_refs = ["prepare.other.review"];
  assert.equal(matchRoleCapabilities(wrongAction).hold_code, "ROLE_ACTION_MISMATCH");

  const absentRole = request();
  absentRole.work_task_contract.required_role_ref = "role.absent";
  assert.equal(matchRoleCapabilities(absentRole).hold_code, "RESPONSIBLE_ROLE_NOT_FOUND");

  const labelOnly = request();
  labelOnly.work_task_contract.label_ref = "AI 실행 후보";
  assert.equal(matchRoleCapabilities(labelOnly).hold_code, "WORK_TASK_CONTRACT_INVALID");
});

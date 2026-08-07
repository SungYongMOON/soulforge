import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateRoleProfileBinding } from "../role_profile_guard.mjs";
import { findLocalAbsolutePathViolations } from
  "../../../guild_hall/validate/local_absolute_path_policy.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const workflowDir = path.resolve(testDir, "..");
const repoRoot = path.resolve(workflowDir, "..", "..");

const createCase = (profileClass, model, thinking, extra = {}) => ({
  profileClass,
  requestedModel: model,
  requestedReasoningEffort: thinking,
  createModel: model,
  createThinking: thinking,
  operation: "create",
  fallbackDecision: "none",
  ...extra,
});

for (const [profileClass, model, thinking] of [
  ["development1_company_ceo", "gpt-5.6-sol", "xhigh"],
  ["technical_direction_acceptance_responsibility", "gpt-5.6-sol", "high"],
  ["operations_control_responsibility", "gpt-5.6-terra", "high"],
  ["operations_control_responsibility", "gpt-5.6-terra", "xhigh"],
  ["deliverable_task", "gpt-5.6-terra", "max"],
  ["simple_collection_formatting", "gpt-5.6-luna", "medium"],
]) {
  const result = evaluateRoleProfileBinding(createCase(profileClass, model, thinking));
  assert.equal(result.status, "PASS", `${profileClass} ${model}/${thinking}`);
  assert.deepEqual(result.errors, []);
}

const omittedModelAndThinking = evaluateRoleProfileBinding({
  profileClass: "technical_direction_acceptance_responsibility",
  operation: "create",
});
assert.equal(omittedModelAndThinking.status, "HOLD");
assert.ok(omittedModelAndThinking.errors.includes("create_thread_model_missing"));
assert.ok(omittedModelAndThinking.errors.includes("create_thread_thinking_missing"));

const parentUltraLeak = evaluateRoleProfileBinding(
  createCase(
    "technical_direction_acceptance_responsibility",
    "gpt-5.6-sol",
    "ultra",
  ),
);
assert.equal(parentUltraLeak.status, "HOLD");
assert.ok(parentUltraLeak.errors.includes("ultra_forbidden_outside_major_gate_review"));

const authorizedUltra = evaluateRoleProfileBinding(
  createCase("major_gate_review", "gpt-5.6-sol", "ultra", {
    ultraGateAuthorization: "owner_directive:synthetic-major-gate",
  }),
);
assert.equal(authorizedUltra.status, "PASS");

const unauthorizedUltra = evaluateRoleProfileBinding(
  createCase("major_gate_review", "gpt-5.6-sol", "ultra"),
);
assert.equal(unauthorizedUltra.status, "HOLD");
assert.ok(unauthorizedUltra.errors.includes("ultra_gate_authorization_missing"));

const unresolvedRange = evaluateRoleProfileBinding({
  profileClass: "operations_control_responsibility",
  requestedModel: "gpt-5.6-terra",
  createModel: "gpt-5.6-terra",
  operation: "create",
});
assert.equal(unresolvedRange.status, "HOLD");
assert.ok(
  unresolvedRange.errors.includes(
    "requested_reasoning_effort_missing_or_range_unresolved",
  ),
);

const wrongWorkflowPlannerProfile = evaluateRoleProfileBinding(
  createCase("technical_direction_acceptance_responsibility", "gpt-5.4", "low"),
);
assert.equal(wrongWorkflowPlannerProfile.status, "HOLD");
assert.ok(
  wrongWorkflowPlannerProfile.errors.includes(
    "requested_model_not_allowed_for_profile_class",
  ),
);

const roleChangingFork = evaluateRoleProfileBinding({
  profileClass: "technical_direction_acceptance_responsibility",
  requestedModel: "gpt-5.6-sol",
  requestedReasoningEffort: "high",
  operation: "fork",
  sourceProfileClass: "project_manager",
  sourceModel: "gpt-5.6-sol",
  sourceThinking: "xhigh",
});
assert.equal(roleChangingFork.status, "HOLD");
assert.ok(
  roleChangingFork.errors.includes("fork_role_or_profile_class_change_forbidden"),
);

const sameRoleFork = evaluateRoleProfileBinding({
  profileClass: "project_manager",
  requestedModel: "gpt-5.6-sol",
  requestedReasoningEffort: "xhigh",
  operation: "fork",
  sourceProfileClass: "project_manager",
  sourceModel: "gpt-5.6-sol",
  sourceThinking: "xhigh",
});
assert.equal(sameRoleFork.status, "PASS");

for (const [profileClass, model, thinking, ultraGateAuthorization] of [
  ["independent_technical_review", "gpt-5.6-sol", "high", null],
  ["independent_operations_review", "gpt-5.6-terra", "xhigh", null],
  [
    "major_gate_review",
    "gpt-5.6-sol",
    "ultra",
    "owner_directive:synthetic-major-gate",
  ],
]) {
  const result = evaluateRoleProfileBinding({
    profileClass,
    requestedModel: model,
    requestedReasoningEffort: thinking,
    operation: "fork",
    sourceProfileClass: profileClass,
    sourceModel: model,
    sourceThinking: thinking,
    ultraGateAuthorization,
  });
  assert.equal(result.status, "HOLD", `${profileClass} fork must HOLD`);
  assert.ok(result.errors.includes("fork_fresh_context_profile_forbidden"));
}

const observedMatch = evaluateRoleProfileBinding(
  createCase("deliverable_task", "gpt-5.6-terra", "max", {
    observedModel: "gpt-5.6-terra",
    observedReasoningEffort: "max",
  }),
);
assert.equal(observedMatch.status, "PASS");
assert.equal(observedMatch.profile_mismatch_state, "MATCH");

const observedMismatch = evaluateRoleProfileBinding(
  createCase("deliverable_task", "gpt-5.6-terra", "max", {
    observedModel: "gpt-5.6-sol",
    observedReasoningEffort: "ultra",
  }),
);
assert.equal(observedMismatch.status, "HOLD");
assert.equal(observedMismatch.profile_mismatch_state, "profile_mismatch");
assert.ok(observedMismatch.errors.includes("observed_profile_mismatch"));

const observedUnknown = evaluateRoleProfileBinding(
  createCase("deliverable_task", "gpt-5.6-terra", "max"),
);
assert.equal(observedUnknown.status, "PASS");
assert.equal(observedUnknown.observed_model, "UNKNOWN");
assert.equal(observedUnknown.profile_mismatch_state, "UNKNOWN");

const partialObservedMismatch = evaluateRoleProfileBinding(
  createCase("deliverable_task", "gpt-5.6-terra", "max", {
    observedReasoningEffort: "ultra",
  }),
);
assert.equal(partialObservedMismatch.status, "HOLD");
assert.equal(partialObservedMismatch.observed_model, "UNKNOWN");
assert.equal(partialObservedMismatch.profile_mismatch_state, "profile_mismatch");

const literalUnknownRoundTrip = evaluateRoleProfileBinding(
  createCase("deliverable_task", "gpt-5.6-terra", "max", {
    observedModel: "UNKNOWN",
    observedReasoningEffort: "UNKNOWN",
  }),
);
assert.equal(literalUnknownRoundTrip.status, "PASS");
assert.equal(literalUnknownRoundTrip.observed_model, "UNKNOWN");
assert.equal(literalUnknownRoundTrip.profile_mismatch_state, "UNKNOWN");

const policy = await readFile(
  path.join(
    repoRoot,
    "docs",
    "architecture",
    "guild_hall",
    "AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md",
  ),
  "utf8",
);
for (const canonicalRow of [
  "| 개발1팀 회사 CEO | `Sol/xhigh` |",
  "| 기술 방향·수락 책임자 | `Sol/high` |",
  "| 운영·통제 책임자 | `Terra/high~xhigh` |",
  "| 실제 결과물 TASK | `Terra/max` |",
  "| 단순 수집·형식화 | `Luna/medium` |",
  "| 중대 Gate 심의 | `Ultra` |",
]) {
  assert.ok(policy.includes(canonicalRow), `missing canonical row: ${canonicalRow}`);
}

for (const relativePath of [
  [".registry", "skills", "codex_thread_manager", "codex", "SKILL.md"],
  [".registry", "skills", "codex_thread_manager", "skill.yaml"],
  [".workflow", "codex_thread_manager_v0", "workflow.yaml"],
  [".workflow", "codex_thread_manager_v0", "step_graph.yaml"],
]) {
  const source = await readFile(path.join(repoRoot, ...relativePath), "utf8");
  assert.match(source, /requested_model/);
  assert.match(source, /requested_reasoning_effort/);
  assert.match(source, /role_profile_guard\.mjs/);
  assert.match(source, /profile_mismatch/);
}

for (const relativePath of [
  [".workflow", "codex_thread_manager_v0", "role_profile_guard.mjs"],
  [".workflow", "codex_thread_manager_v0", "tests", "role_profile_guard.test.mjs"],
]) {
  const label = relativePath.join("/");
  const source = await readFile(path.join(repoRoot, ...relativePath), "utf8");
  assert.deepEqual(findLocalAbsolutePathViolations(source, label), []);
}

console.log("PASS role profile binding guard: 21 cases");

import test from "node:test";
import assert from "node:assert/strict";

import {
  ENGINEERING_MCP_CONTRACT_SCHEMA,
  ENGINEERING_MCP_NAMESPACES,
  FORBIDDEN_FIELD_NAMES,
  UNIFORM_DENIAL_CODE,
  getContractTool,
  listContractTools,
} from "../src/contract.mjs";
import {
  CONTRACT_GAPS,
  COMPATIBILITY_ROWS,
  CURRENT_INGRESS_TOOLS,
  CURRENT_PERSONAL_ERP_TOOLS,
  CURRENT_PROJECT_HISTORY_TOOLS,
  EXCLUDED_SURFACES,
} from "../src/compatibility.mjs";
import {
  validateCandidateToolDescription,
  validateContract,
  validateDenialEnvelope,
  validateNoCompletionAuthority,
} from "../src/validators.mjs";

const PLANNED_NAMESPACES = [
  "identity", "task", "work", "bundle", "artifact",
  "submission", "review", "context", "agent", "ops",
];

const PLAN_05_MINIMUM_TOOLS = [
  "identity.get_effective_actor", "identity.get_device_policy", "identity.get_capabilities",
  "task.get_official", "task.get_assignment", "task.list_assigned",
  "work.get_brief", "work.start_session", "work.append_checkpoint",
  "work.declare_blocker", "work.closeout", "work.propose_completion",
  "bundle.get_manifest", "bundle.prepare_download", "bundle.get_download_status",
  "artifact.list_visible", "artifact.get_revision_metadata", "artifact.get_candidate_status",
  "submission.prepare_upload", "submission.get_upload_status", "submission.finalize", "submission.get_custody_receipt",
  "review.list_pending", "review.get_packet", "review.submit_review", "review.request_human_acceptance",
  "context.get_accepted_generation", "context.submit_candidate_feedback",
  "agent.get_assignment_binding", "agent.get_run_status",
  "ops.get_client_release_policy", "ops.get_health_projection", "ops.request_approved_action",
];

test("contract is structurally valid and pinned to the planned namespace/tool minimum", () => {
  assert.equal(ENGINEERING_MCP_CONTRACT_SCHEMA, "soulforge.engineering_mcp_contract.v0");
  const verdict = validateContract();
  assert.deepEqual(verdict, { ok: true, problems: [] });
  assert.deepEqual(ENGINEERING_MCP_NAMESPACES.map((entry) => entry.namespace), PLANNED_NAMESPACES);
  const names = listContractTools().map((tool) => tool.name).sort();
  assert.deepEqual(names, [...PLAN_05_MINIMUM_TOOLS].sort());
  assert.equal(Object.isFrozen(ENGINEERING_MCP_NAMESPACES), true);
  for (const entry of ENGINEERING_MCP_NAMESPACES) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.tools), true);
  }
});

test("every mutating tool demands an idempotency key and returns an opaque receipt reference", () => {
  for (const tool of listContractTools()) {
    if (tool.kind === "mutate") {
      assert.equal(tool.requires_idempotency_key, true, tool.name);
      assert.equal(tool.request_fields.includes("idempotency_key"), true, tool.name);
      assert.equal(tool.response_fields.some((field) => field.endsWith("_ref")), true, tool.name);
    } else {
      assert.equal(tool.requires_idempotency_key, false, tool.name);
      assert.equal(tool.request_fields.includes("idempotency_key"), false, tool.name);
    }
  }
});

test("the named byte/transcript/secret exclusions are enforced across contract and candidates", () => {
  for (const tool of listContractTools()) {
    for (const field of [...tool.request_fields, ...tool.response_fields]) {
      const lowered = field.toLowerCase();
      for (const forbidden of FORBIDDEN_FIELD_NAMES) {
        assert.equal(
          lowered === forbidden || lowered.endsWith(`_${forbidden}`) || lowered.startsWith(`${forbidden}_`),
          false,
          `${tool.name} carries forbidden field ${field}`,
        );
      }
    }
  }

  const poisoned = [
    { name: "vault.read_file", kind: "read", request_fields: ["path"], response_fields: ["content_base64"], authority_ceiling: "poisoned candidate" },
    { name: "work.record", kind: "mutate", request_fields: ["transcript", "idempotency_key"], response_fields: ["receipt_ref"], authority_ceiling: "poisoned candidate" },
    { name: "identity.reveal", kind: "read", request_fields: [], response_fields: ["token_value"], authority_ceiling: "poisoned candidate" },
    { name: "agent.capture", kind: "read", request_fields: [], response_fields: ["screen_capture"], authority_ceiling: "poisoned candidate" },
  ];
  for (const candidate of poisoned) {
    const verdict = validateCandidateToolDescription(candidate);
    assert.equal(verdict.ok, false, candidate.name);
    assert.equal(verdict.problems.some((code) => code.startsWith("forbidden_field_")), true, candidate.name);
  }
});

test("candidate tool descriptions fail closed on shape, ceiling, and idempotency gaps", () => {
  assert.equal(validateCandidateToolDescription(null).ok, false);
  assert.equal(validateCandidateToolDescription({ name: "BadName", kind: "read", request_fields: [], response_fields: [], authority_ceiling: "long enough ceiling" }).ok, false);
  assert.equal(validateCandidateToolDescription({ name: "task.peek", kind: "browse", request_fields: [], response_fields: [], authority_ceiling: "long enough ceiling" }).ok, false);
  assert.equal(validateCandidateToolDescription({ name: "task.peek", kind: "read", request_fields: [], response_fields: [], authority_ceiling: "short" }).ok, false);
  const mutateWithoutKey = validateCandidateToolDescription({
    name: "review.submit_review", kind: "mutate",
    request_fields: ["packet_ref"], response_fields: ["review_ref"],
    authority_ceiling: "a review record never changes a task",
  });
  assert.equal(mutateWithoutKey.ok, false);
  assert.equal(mutateWithoutKey.problems.includes("mutate_missing_idempotency_field"), true);
  const good = validateCandidateToolDescription({
    name: "review.submit_review", kind: "mutate",
    request_fields: ["packet_ref", "idempotency_key"], response_fields: ["review_ref"],
    authority_ceiling: "a review record never changes a task",
  });
  assert.deepEqual(good, { ok: true, problems: [] });
});

test("denied objects answer with one uniform envelope and no existence detail", () => {
  assert.deepEqual(validateDenialEnvelope({ code: UNIFORM_DENIAL_CODE, request_id: "req-1" }), { ok: true, problems: [] });
  assert.equal(validateDenialEnvelope({ code: "forbidden", request_id: "req-1" }).ok, false);
  const leaking = validateDenialEnvelope({ code: UNIFORM_DENIAL_CODE, request_id: "req-1", exists: true, owner: "someone" });
  assert.equal(leaking.ok, false);
  assert.equal(leaking.problems.includes("denial_leaks_field_exists"), true);
  assert.equal(leaking.problems.includes("denial_leaks_field_owner"), true);
});

test("no tool shape can be mistaken for completion, acceptance, or promotion authority", () => {
  assert.deepEqual(validateNoCompletionAuthority(), { ok: true, problems: [] });
  assert.equal(getContractTool("task.complete"), null);
  assert.equal(getContractTool("artifact.accept"), null);
  assert.equal(getContractTool("review.approve"), null);
  const proposal = getContractTool("work.propose_completion");
  assert.match(proposal.authority_ceiling, /proposal only/i);
});

test("bundle manifests are exact-revision pinned with no latest mode", () => {
  const manifest = getContractTool("bundle.get_manifest");
  assert.equal(manifest.request_fields.includes("manifest_revision"), true);
  for (const tool of listContractTools()) {
    for (const field of [...tool.request_fields, ...tool.response_fields]) {
      assert.notEqual(field, "latest", tool.name);
    }
  }
});

test("compatibility crosswalk covers every current tool exactly once with real targets", () => {
  const currentTools = [...CURRENT_PERSONAL_ERP_TOOLS, ...CURRENT_PROJECT_HISTORY_TOOLS, ...CURRENT_INGRESS_TOOLS];
  assert.equal(currentTools.length, new Set(currentTools).size);
  assert.deepEqual(
    COMPATIBILITY_ROWS.map((row) => row.current_tool).sort(),
    [...currentTools].sort(),
  );
  for (const row of COMPATIBILITY_ROWS) {
    assert.equal(["map", "keep_legacy_facade", "keep_source_query"].includes(row.disposition), true, row.current_tool);
    assert.equal(typeof row.guard === "string" && row.guard.length > 0, true, row.current_tool);
    if (row.disposition === "map") {
      assert.notEqual(getContractTool(row.target), null, `${row.current_tool} -> ${row.target}`);
    } else if (row.target !== null) {
      assert.notEqual(getContractTool(row.target), null, `${row.current_tool} -> ${row.target}`);
    }
  }
});

test("excluded surfaces are named with reasons and never overlap the crosswalk", () => {
  assert.equal(EXCLUDED_SURFACES.length >= 1, true);
  const crosswalked = new Set(COMPATIBILITY_ROWS.map((row) => row.current_tool));
  for (const excluded of EXCLUDED_SURFACES) {
    assert.equal(typeof excluded.reason === "string" && excluded.reason.length > 10, true, excluded.surface);
    for (const tool of excluded.tools) {
      assert.equal(crosswalked.has(tool), false, `${tool} is both excluded and crosswalked`);
    }
  }
});

test("the recorded gap register equals the contract minus mapped targets, so it cannot rot", () => {
  const mapped = new Set(COMPATIBILITY_ROWS.filter((row) => row.disposition === "map").map((row) => row.target));
  const expectedGaps = listContractTools().map((tool) => tool.name).filter((name) => !mapped.has(name)).sort();
  assert.deepEqual([...CONTRACT_GAPS].sort(), expectedGaps);
});

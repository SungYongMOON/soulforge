// Public synthetic metadata only. Shared by intake and world-slot contract tests.
export const syntheticDigest = (hex = "a") => `sha256:${hex.repeat(64)}`;

export function makeWorkBindingFixture() {
  const scope = {
    project_code: "SYN-001",
    product_ref: "product.synthetic",
    work_package_ref: "wp.synthetic",
    stage_code: "120_CDR",
    artifact_family_id: "test_report",
  };
  const blueprint = { workflow_id: "synthetic_report_v0", version: "v0", version_source: "id_suffix" };
  const order = { receipt_digest: syntheticDigest("b"), order_index: 0 };
  const request = {
    requester: "member.0123456789abcdef",
    ...scope,
    kind: "report",
    idempotency_key: "synthetic-request-001",
    rune_task_id: "task:120_CDR:test_report",
    work_order_ref: order,
    input_revision: syntheticDigest(),
    blueprint_ref: blueprint,
    policy_refs: {
      stage_policy_ref: "policy.synthetic.v1",
      coverage_ref: "coverage.synthetic.v1",
      recipe_id: "R1-07",
      task_ref: null,
    },
    directives: ["TIGHTEN", "ADD_EVIDENCE_REFS"],
    instruction_ref: null,
    revision_of: null,
    revision_no: 1,
  };
  const evidence = {
    evaluation_ref: "evaluation.synthetic.1",
    authenticated_requester: request.requester,
    acl: { requester: request.requester, ...scope, state: "current", epoch: 1, receipt_ref: "acl.synthetic.1" },
    policy_slots: [{ ...scope, stage_policy_ref: request.policy_refs.stage_policy_ref }],
    mapping_phase: "phase0",
    mappings: [{ ...scope, rune_task_id: request.rune_task_id, work_order_ref: order, task_ref: null }],
    current_input_revision: request.input_revision,
    historical_input_approval: null,
    allowed_blueprints: [blueprint],
    approved_instruction_refs: [],
    linear_applicability: "synthetic_sfx",
    linear_task: null,
  };
  return structuredClone({ scope, request, evidence });
}

export function workBindingCounterexamples() {
  const base = makeWorkBindingFixture();
  const conflictingRequests = [
    { ...base.request, directives: ["SHORTEN"] },
    { ...base.request, input_revision: syntheticDigest("c") },
    { ...base.request, blueprint_ref: { workflow_id: "synthetic_report_v1", version: "v1", version_source: "id_suffix" } },
  ];
  const foreign = structuredClone(base.evidence);
  foreign.mappings[0].project_code = "SYN-002";
  const unmappedRequest = { ...base.request, rune_task_id: null, work_order_ref: null };
  const unmappedEvidence = { ...base.evidence, mapping_phase: "pre_phase0", mappings: [] };
  return { ...base, conflictingRequests, foreign, unmappedRequest, unmappedEvidence };
}

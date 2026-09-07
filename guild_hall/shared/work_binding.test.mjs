import assert from "node:assert/strict";
import test from "node:test";
import {
  createScopedWorkKey, normalizeWorkBindingRequest, evaluateWorkBinding, evaluateWorkClaimEligibility,
} from "./work_binding.mjs";
import { makeWorkBindingFixture, syntheticDigest, workBindingCounterexamples } from "../../docs/architecture/workspace/examples/work_binding/synthetic.mjs";

test("normalized whole request digest preserves requester, revisions, directives and payload identity", () => {
  const { request } = makeWorkBindingFixture();
  const normalized = normalizeWorkBindingRequest(request);
  assert.equal(normalized.status, "NORMALIZED");
  assert.equal(normalizeWorkBindingRequest({ ...request, directives: [...request.directives].reverse() }).request_digest, normalized.request_digest);
  for (const change of [
    { requester: "owner.local" }, { input_revision: syntheticDigest("d") }, { directives: ["SHORTEN"] },
    { blueprint_ref: { workflow_id: "synthetic_report_v1", version: "v1", version_source: "id_suffix" } },
    { instruction_ref: { payload_ref: "payload.synthetic", content_sha256: syntheticDigest("e"), byte_length: 20 } },
    { policy_refs: { ...request.policy_refs, coverage_ref: "coverage.synthetic.v2" } },
  ]) {
    const result = normalizeWorkBindingRequest({ ...request, ...change });
    assert.equal(result.status, "NORMALIZED");
    assert.notEqual(result.request_digest, normalized.request_digest);
  }
  assert.equal(Object.isFrozen(normalized.request.directives), true);
});

test("closed typed metadata request refuses text, paths, secrets, accessors and sparse arrays", () => {
  const { request } = makeWorkBindingFixture();
  for (const change of [
    { instruction: "free prose" }, { directives: ["please write this"] }, { allowed_scope: [] },
    { requester: "person@example.invalid" }, { input_revision: "latest" }, { revision_no: "1" },
    { policy_refs: { ...request.policy_refs, coverage_ref: ["C:", "private", "example"].join("/") } },
    { instruction_ref: { payload_ref: "payload.synthetic", content_sha256: syntheticDigest(), byte_length: 2001 } },
    { blueprint_ref: { workflow_id: "synthetic_report_v0", version: "v1", version_source: "id_suffix" } },
    { directives: ["SHORTEN", "SHORTEN"] }, { directives: new Array(1) },
  ]) assert.equal(normalizeWorkBindingRequest({ ...request, ...change }).status, "HOLD");
  const accessor = { ...request };
  Object.defineProperty(accessor, "requester", { get() { throw new Error("must not read"); } });
  assert.equal(normalizeWorkBindingRequest(accessor).status, "HOLD");
  assert.equal(normalizeWorkBindingRequest(null).status, "HOLD");
});

test("scoped work key never joins the same local ID across project, product or work package", () => {
  const { scope } = makeWorkBindingFixture();
  const key = createScopedWorkKey(scope);
  assert.equal(typeof key, "string");
  for (const field of ["project_code", "product_ref", "work_package_ref"]) {
    assert.notEqual(createScopedWorkKey({ ...scope, [field]: field === "project_code" ? "SYN-002" : "other.synthetic" }), key);
  }
  assert.equal(createScopedWorkKey({ ...scope, work_package_ref: null }), null);
});

test("binding requires authenticated current scoped evidence and compiled policy", () => {
  const { request, evidence } = makeWorkBindingFixture();
  assert.equal(evaluateWorkBinding(request, evidence).status, "MAPPED");
  for (const [change, code] of [
    [{ authenticated_requester: null }, "AUTH_REQUIRED"],
    [{ authenticated_requester: "owner.local" }, "AUTH_REQUIRED"],
    [{ acl: { ...evidence.acl, state: "revoked" } }, "SCOPE_VIOLATION"],
    [{ acl: { ...evidence.acl, project_code: "SYN-002" } }, "SCOPE_VIOLATION"],
    [{ policy_slots: [] }, "POLICY_SLOT_UNKNOWN"],
  ]) assert.equal(evaluateWorkBinding(request, { ...evidence, ...change }).hold_code, code);
  assert.equal(evaluateWorkBinding(request, undefined).status, "HOLD");
});

test("foreign and ambiguous mappings cannot authorize a local slot", () => {
  const { request, evidence, foreign } = workBindingCounterexamples();
  assert.equal(evaluateWorkBinding(request, foreign).hold_code, "SCOPE_VIOLATION");
  const duplicate = { ...evidence, mappings: [...evidence.mappings, { ...evidence.mappings[0], rune_task_id: "task:120_CDR:another_report" }] };
  assert.equal(evaluateWorkBinding(request, duplicate).status, "UNMAPPED_WORK_CANDIDATE");
  assert.equal(evaluateWorkBinding(request, duplicate).hold_code, "WORK_BINDING_AMBIGUOUS");
  for (const field of ["product_ref", "work_package_ref"]) {
    const foreignScope = structuredClone(evidence);
    foreignScope.mappings[0][field] = "other.synthetic";
    assert.equal(evaluateWorkBinding(request, foreignScope).hold_code, "SCOPE_VIOLATION");
  }
  // The same local ID in another project is legitimate when the exact local mapping exists.
  const scoped = { ...evidence, mappings: [...evidence.mappings, foreign.mappings[0]] };
  assert.equal(evaluateWorkBinding(request, scoped).status, "MAPPED");
});

test("prephase mapping requires exact order digest and index; unmapped never becomes claim eligible", () => {
  const { request, evidence, unmappedRequest, unmappedEvidence } = workBindingCounterexamples();
  const unmapped = evaluateWorkBinding(unmappedRequest, unmappedEvidence);
  assert.equal(unmapped.status, "UNMAPPED_WORK_CANDIDATE");
  assert.notEqual(evaluateWorkClaimEligibility(unmappedRequest, { recorded_binding: unmapped, current_evidence: unmappedEvidence }).status, "CLAIM_ELIGIBLE");
  const preRequest = { ...request, rune_task_id: null };
  const preEvidence = { ...evidence, mapping_phase: "pre_phase0", mappings: [{ ...evidence.mappings[0], rune_task_id: null }] };
  assert.equal(evaluateWorkBinding(preRequest, preEvidence).status, "MAPPED");
  assert.equal(evaluateWorkBinding({ ...preRequest, work_order_ref: { ...request.work_order_ref, order_index: 1 } }, preEvidence).status, "UNMAPPED_WORK_CANDIDATE");
});

test("claim rechecks ACL epoch, exact mapping, input revision, historical approval and Blueprint", () => {
  const { request, evidence } = makeWorkBindingFixture();
  const recorded = evaluateWorkBinding(request, evidence);
  const current = { ...evidence, evaluation_ref: "evaluation.synthetic.2" };
  const claim = (r, e) => evaluateWorkClaimEligibility(r, { recorded_binding: recorded, current_evidence: e });
  assert.equal(claim(request, current).status, "CLAIM_ELIGIBLE");
  assert.equal(claim(request, evidence).hold_code, "CURRENT_RECHECK_REQUIRED");
  assert.equal(claim(request, { ...current, acl: { ...current.acl, state: "revoked" } }).status, "HOLD");
  assert.equal(claim(request, { ...current, acl: { ...current.acl, epoch: 2 } }).hold_code, "AUTHORITY_EPOCH_STALE");
  assert.equal(claim({ ...request, directives: ["SHORTEN"] }, current).hold_code, "REQUEST_BINDING_MISMATCH");
  assert.equal(claim(request, { ...current, allowed_blueprints: [] }).hold_code, "BLUEPRINT_NOT_ALLOWED");
  assert.equal(claim(request, { ...current, acl: { ...current.acl, receipt_ref: "acl.synthetic.2" } }).hold_code, "ACL_BINDING_CHANGED");
  assert.equal(claim(request, { ...current, mappings: [{ ...current.mappings[0], work_order_ref: null }] }).hold_code, "WORK_ORDER_MISMATCH");
  const stale = { ...current, current_input_revision: syntheticDigest("f") };
  assert.equal(claim(request, stale).hold_code, "INPUT_REVISION_STALE");
  stale.historical_input_approval = { request_digest: recorded.request_digest, input_revision: request.input_revision, approval_ref: "approval.synthetic.1", state: "current" };
  assert.equal(claim(request, stale).status, "CLAIM_ELIGIBLE");
  stale.historical_input_approval.request_digest = syntheticDigest("f");
  assert.equal(claim(request, stale).hold_code, "INPUT_REVISION_STALE");
});

test("approved private instruction references bind digest and size and remain revocable", () => {
  const { request, evidence } = makeWorkBindingFixture();
  request.instruction_ref = { payload_ref: "payload.synthetic", content_sha256: syntheticDigest("c"), byte_length: 30 };
  assert.equal(evaluateWorkBinding(request, evidence).hold_code, "INSTRUCTION_REF_NOT_APPROVED");
  evidence.approved_instruction_refs = [request.instruction_ref];
  const recorded = evaluateWorkBinding(request, evidence);
  assert.equal(recorded.status, "MAPPED");
  const current = { ...evidence, evaluation_ref: "evaluation.synthetic.2", approved_instruction_refs: [] };
  assert.equal(evaluateWorkClaimEligibility(request, { recorded_binding: recorded, current_evidence: current }).hold_code, "INSTRUCTION_REF_NOT_APPROVED");
  evidence.approved_instruction_refs = [{ ...request.instruction_ref, byte_length: 31 }];
  assert.equal(evaluateWorkBinding(request, evidence).hold_code, "INSTRUCTION_REF_NOT_APPROVED");
});

test("null Blueprint and revoked historical revision are recordable gaps, never execution gates", () => {
  const { request, evidence } = makeWorkBindingFixture();
  assert.equal(evaluateWorkBinding({ ...request, blueprint_ref: null }, evidence).hold_code, "WORKFLOW_GAP");
  evidence.current_input_revision = syntheticDigest("e");
  evidence.historical_input_approval = { request_digest: normalizeWorkBindingRequest(request).request_digest, input_revision: request.input_revision, approval_ref: "approval.synthetic.1", state: "revoked" };
  assert.equal(evaluateWorkBinding(request, evidence).hold_code, "INPUT_REVISION_STALE");
});

test("real work requires current exact Linear task evidence; only explicit synthetic sfx is exempt", () => {
  const { request, evidence } = makeWorkBindingFixture();
  const real = { ...evidence, linear_applicability: "real_work" };
  assert.equal(evaluateWorkBinding(request, real).hold_code, "TASK_REF_REQUIRED");
  const task = { provider: "linear", task_id: "SYN-101" };
  request.policy_refs.task_ref = task;
  real.mappings[0].task_ref = task;
  real.linear_task = { task_ref: task, project_code: request.project_code, state: "current", task_status: "Todo", read_receipt_ref: "linear.synthetic.1" };
  assert.equal(evaluateWorkBinding(request, real).status, "MAPPED");
  real.linear_task.task_ref = { ...task, task_id: "SYN-102" };
  assert.equal(evaluateWorkBinding(request, real).hold_code, "TASK_BINDING_MISMATCH");
});

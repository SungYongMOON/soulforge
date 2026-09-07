import assert from "node:assert/strict";
import test from "node:test";
import { evaluateWorkbenchIntakeRecord } from "./workbench-intake-record.mjs";
import { digestOf } from "../../../../../guild_hall/agent_observation/guard_primitives.mjs";
import { workBindingCounterexamples, makeWorkBindingFixture } from "../../../../../docs/architecture/workspace/examples/work_binding/synthetic.mjs";

const options = (evidence, records = []) => ({
  trusted_evidence: evidence, existing_records: records,
  request_id: `w_${"1".repeat(32)}`, created_at: "2026-09-07T00:00:00.000Z",
});

test("RECORDED means metadata-only intake with no claim, write, acceptance or execution authority", () => {
  const { request, evidence } = makeWorkBindingFixture();
  const result = evaluateWorkbenchIntakeRecord(request, options(evidence));
  assert.equal(result.status, "RECORDED");
  assert.equal(result.append_required, true);
  assert.equal(result.record.status, "RECORDED");
  assert.equal(result.record.binding.status, "MAPPED");
  assert.ok(Object.values(result.record.boundary).every(value => value === false));
  assert.equal(Object.isFrozen(result.record), true);
});

test("whole normalized replay returns original record; changed request under same key yields zero append", () => {
  const { request, evidence, conflictingRequests } = workBindingCounterexamples();
  const first = evaluateWorkbenchIntakeRecord(request, options(evidence));
  const input = options(evidence, [first.record]);
  input.request_id = `w_${"2".repeat(32)}`;
  const replay = evaluateWorkbenchIntakeRecord({ ...request, directives: [...request.directives].reverse() }, input);
  assert.equal(replay.status, "RECORDED");
  assert.equal(replay.replayed, true);
  assert.equal(replay.append_required, false);
  assert.equal(replay.record.request_id, first.record.request_id);
  for (const conflicting of conflictingRequests) {
    const result = evaluateWorkbenchIntakeRecord(conflicting, input);
    assert.equal(result.hold_code, "IDEMPOTENCY_KEY_CONFLICT");
    assert.equal(result.append_required, false);
    assert.equal(result.record, undefined);
  }
  assert.equal(input.existing_records.length, 1);
});

test("different requester reusing an idempotency key conflicts without exposing the stored record", () => {
  const { request, evidence } = makeWorkBindingFixture();
  const first = evaluateWorkbenchIntakeRecord(request, options(evidence));
  const next = { ...request, requester: "owner.local" };
  const current = { ...evidence, authenticated_requester: next.requester, acl: { ...evidence.acl, requester: next.requester } };
  const result = evaluateWorkbenchIntakeRecord(next, options(current, [first.record]));
  assert.equal(result.hold_code, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(result.record, undefined);
});

test("shared prephase unmapped case records a candidate with zero claim and execution effects", () => {
  const { unmappedRequest, unmappedEvidence } = workBindingCounterexamples();
  const result = evaluateWorkbenchIntakeRecord(unmappedRequest, options(unmappedEvidence));
  assert.equal(result.status, "RECORDED");
  assert.equal(result.record.binding.status, "UNMAPPED_WORK_CANDIDATE");
  assert.ok(Object.values(result.record.boundary).every(value => value === false));
});

test("invalid auth, policy, metadata and corrupt duplicate receipts cannot append", () => {
  const { request, evidence } = makeWorkBindingFixture();
  for (const input of [options({ ...evidence, authenticated_requester: null }), options({ ...evidence, policy_slots: [] }), { ...options(evidence), request_id: "client-text" }, { ...options(evidence), created_at: "2026-02-30T00:00:00.000Z" }]) {
    assert.equal(evaluateWorkbenchIntakeRecord(request, input).append_required, false);
  }
  const first = evaluateWorkbenchIntakeRecord(request, options(evidence));
  const bad = structuredClone(first.record);
  bad.request.directives = ["SHORTEN"];
  assert.equal(evaluateWorkbenchIntakeRecord(request, options(evidence, [bad])).hold_code, "EXISTING_RECORD_INVALID");
  assert.equal(evaluateWorkbenchIntakeRecord(request, options(evidence, [first.record, first.record])).hold_code, "EXISTING_RECORD_AMBIGUOUS");
});

test("a self-rehashed stored receipt cannot introduce arbitrary binding prose", () => {
  const { request, evidence } = makeWorkBindingFixture();
  const first = evaluateWorkbenchIntakeRecord(request, options(evidence));
  const altered = structuredClone(first.record);
  altered.binding.notes = "This field must never be present in the metadata record.";
  const { binding_digest: ignoredBindingDigest, ...bindingBody } = altered.binding;
  altered.binding.binding_digest = digestOf(bindingBody);
  const { record_digest: ignoredRecordDigest, ...recordBody } = altered;
  altered.record_digest = digestOf(recordBody);
  assert.equal(evaluateWorkbenchIntakeRecord(request, options(evidence, [altered])).hold_code, "EXISTING_RECORD_INVALID");
});

test("matching work with a different retry key remains a separate record, never LINKED_EXISTING", () => {
  const { request, evidence } = makeWorkBindingFixture();
  const first = evaluateWorkbenchIntakeRecord(request, options(evidence));
  const next = options(evidence, [first.record]);
  next.request_id = `w_${"2".repeat(32)}`;
  const second = evaluateWorkbenchIntakeRecord({ ...request, idempotency_key: "synthetic-request-002" }, next);
  assert.equal(second.status, "RECORDED");
  assert.equal(second.replayed, false);
  assert.equal(second.append_required, true);
  assert.equal(second.record.binding.scoped_work_key, first.record.binding.scoped_work_key);
  assert.notEqual(second.record.request_digest, first.record.request_digest);
});

test("revision requires its exact same-scope parent and a consecutive unique successor", () => {
  const {request,evidence}=makeWorkBindingFixture();
  const first=evaluateWorkbenchIntakeRecord(request,options(evidence)).record;
  const revision={...request,idempotency_key:'synthetic-revision-002',revision_of:first.request_id,revision_no:2};
  const secondOptions={...options(evidence,[first]),request_id:`w_${'2'.repeat(32)}`};
  assert.equal(evaluateWorkbenchIntakeRecord(revision,{...secondOptions,existing_records:[]}).hold_code,'REVISION_PARENT_UNAVAILABLE');
  assert.equal(evaluateWorkbenchIntakeRecord({...revision,revision_no:3},secondOptions).hold_code,'REVISION_SEQUENCE_CONFLICT');
  const second=evaluateWorkbenchIntakeRecord(revision,secondOptions);
  assert.equal(second.status,'RECORDED');
  const replay=evaluateWorkbenchIntakeRecord(revision,{...secondOptions,existing_records:[first,second.record]});
  assert.equal(replay.replayed,true);
  const competitor=evaluateWorkbenchIntakeRecord({...revision,idempotency_key:'synthetic-revision-other'},
    {...secondOptions,request_id:`w_${'3'.repeat(32)}`,existing_records:[first,second.record]});
  assert.equal(competitor.hold_code,'REVISION_ALREADY_EXISTS');assert.equal(competitor.append_required,false);
});

test("missing, foreign-requester, different-scope and different-kind parents are equally unavailable", () => {
  const {request,evidence}=makeWorkBindingFixture();
  const original=evaluateWorkbenchIntakeRecord(request,options(evidence)).record;
  const revision={...request,idempotency_key:'synthetic-revision-002',revision_of:original.request_id,revision_no:2};
  for(const change of [{requester:'owner.local'},{project_code:'SYN-002'},{product_ref:'product.other'},{work_package_ref:'wp.other'},{stage_code:'090_PDR'},{artifact_family_id:'design'},{kind:'minutes'}]){
    const parentRequest={...request,...change};
    const parentEvidence=structuredClone(evidence);
    const scopeKeys=['project_code','product_ref','work_package_ref','stage_code','artifact_family_id'];
    parentEvidence.authenticated_requester=parentRequest.requester;parentEvidence.acl.requester=parentRequest.requester;
    for(const key of scopeKeys){parentEvidence.acl[key]=parentRequest[key];parentEvidence.policy_slots[0][key]=parentRequest[key];parentEvidence.mappings[0][key]=parentRequest[key];}
    const foreign=evaluateWorkbenchIntakeRecord(parentRequest,options(parentEvidence));
    assert.equal(foreign.status,'RECORDED');
    const result=evaluateWorkbenchIntakeRecord(revision,{...options(evidence,[foreign.record]),request_id:`w_${'2'.repeat(32)}`});
    assert.equal(result.hold_code,'REVISION_PARENT_UNAVAILABLE');assert.equal(result.record,undefined);
  }
});

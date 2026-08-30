import test from "node:test";
import assert from "node:assert/strict";

import {
  DOCUMENT_WORKSHOP_PROFILE,
  JOB_STATES,
  TOOL_WORKSHOP_SCHEMA,
  WORKSHOP_CLASSES,
  createToolWorkshopCore,
} from "../src/tool_workshop_core.mjs";

const DIGEST_IN = "a".repeat(64);
const DIGEST_OUT = "b".repeat(64);
const T0 = "2026-08-30T12:00:00Z";
const T_LATER = "2026-08-30T12:30:00Z";

function seedWorkshop(core) {
  return core.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE);
}

function jobInput(id, overrides = {}) {
  return {
    job_id: id,
    workshop_id: "workshop.document",
    task_ref: "linear.synthetic:1",
    work_brief_ref: "brief.1",
    project_ref: "demo_project",
    priority: 2,
    required_tool_version: "tool.docx_renderer:v1",
    input_bundle_manifest_digest: DIGEST_IN,
    timeout_seconds: 600,
    max_retries: 1,
    ...overrides,
  };
}

test("document-workshop vertical: submit -> exclusive lease -> bounded run -> candidate custody receipt", () => {
  const core = createToolWorkshopCore();
  assert.equal(core.schema, TOOL_WORKSHOP_SCHEMA);
  assert.equal(WORKSHOP_CLASSES.includes("hwpx"), true);
  assert.equal(JOB_STATES.includes("done_candidate"), true);
  seedWorkshop(core);
  core.submitJob(jobInput("job.1"));
  const lease = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.1" });
  assert.equal(lease.job_id, "job.1");
  assert.equal(lease.fencing_token, 1);
  const receipt = core.completeRun({
    lease_id: "lease.1", fencing_token: 1, validator_result: "pass",
    output_bundle_manifest_digest: DIGEST_OUT, evidence_refs: ["evidence.render_readback:1"],
  });
  assert.equal(receipt.claim, "workshop_output_candidate_only");
  assert.equal(receipt.output_bundle_manifest_digest, DIGEST_OUT);
  assert.equal(core.getJob("job.1").state, "done_candidate");
  assert.deepEqual(core.eventLog().map((event) => event.kind), [
    "workshop_registered", "job_submitted", "lease_acquired", "run_completed_candidate",
  ]);
});

test("capacity is exactly one: a busy resource never double-leases and idle UI is not a release", () => {
  const core = createToolWorkshopCore();
  seedWorkshop(core);
  core.submitJob(jobInput("job.1"));
  core.submitJob(jobInput("job.2"));
  const first = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.1" });
  assert.equal(first.job_id, "job.1");
  const denied = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.2" });
  assert.equal(denied, null, "second acquire while active must wait");
  // only an explicit release frees the resource without consuming a retry
  core.releaseLease({ lease_id: "lease.1", fencing_token: 1 });
  assert.equal(core.getJob("job.1").state, "queued");
  assert.equal(core.getJob("job.1").retries_remaining, 1);
  const next = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.3" });
  assert.equal(next.job_id, "job.1", "released job keeps its queue standing");
});

test("priority then submission order drives the queue", () => {
  const core = createToolWorkshopCore();
  seedWorkshop(core);
  core.submitJob(jobInput("job.low", { priority: 3 }));
  core.submitJob(jobInput("job.high", { priority: 1 }));
  core.submitJob(jobInput("job.high2", { priority: 1 }));
  const lease = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.1" });
  assert.equal(lease.job_id, "job.high", "priority first, then submission order");
});

test("expiry takeover bumps the fencing token and a late writer with the old token is rejected", () => {
  const core = createToolWorkshopCore();
  seedWorkshop(core);
  core.submitJob(jobInput("job.1", { timeout_seconds: 60 }));
  core.submitJob(jobInput("job.2"));
  const stale = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.1" });
  assert.equal(stale.fencing_token, 1);
  // the run overruns; a takeover acquire supersedes it
  const takeover = core.acquireLease("workshop.document", { now: T_LATER, lease_id: "lease.2" });
  assert.equal(takeover.job_id, "job.2");
  assert.equal(takeover.fencing_token, 2);
  assert.equal(core.getJob("job.1").state, "failed_terminal");
  assert.equal(core.getJob("job.1").failure_code, "lease_expired_takeover");
  // the zombie runner comes back with its dead token: nothing is promoted
  assert.throws(() => core.completeRun({
    lease_id: "lease.1", fencing_token: 1, validator_result: "pass",
    output_bundle_manifest_digest: DIGEST_OUT, evidence_refs: [],
  }), (error) => error.code === "fence_stale");
  assert.equal(core.getCustodyReceipt("job.1"), null);
});

test("validator failure consumes a retry, re-queues, then fails terminally with no custody", () => {
  const core = createToolWorkshopCore();
  seedWorkshop(core);
  core.submitJob(jobInput("job.1", { max_retries: 1 }));
  const first = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.1" });
  const requeued = core.completeRun({ lease_id: first.lease_id, fencing_token: first.fencing_token, validator_result: "fail" });
  assert.deepEqual([requeued.state, requeued.retries_remaining], ["queued", 0]);
  const second = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.2" });
  assert.equal(second.fencing_token, 2);
  const terminal = core.completeRun({ lease_id: second.lease_id, fencing_token: second.fencing_token, validator_result: "fail" });
  assert.equal(terminal.state, "failed_terminal");
  assert.equal(core.getCustodyReceipt("job.1"), null, "a failed run promotes nothing");
  assert.equal(core.getJob("job.1").failure_code, "validator_failed_retries_exhausted");
});

test("capability and shape gates fail closed before any queue mutation", () => {
  const core = createToolWorkshopCore();
  seedWorkshop(core);
  assert.throws(() => core.submitJob(jobInput("job.x", { required_tool_version: "tool.allegro:v17" })),
    (error) => error.code === "tool_version_unsupported");
  assert.throws(() => core.submitJob(jobInput("job.x", { priority: 0 })), (error) => error.code === "priority_invalid");
  assert.throws(() => core.submitJob(jobInput("job.x", { input_bundle_manifest_digest: "nope" })),
    (error) => error.code === "digest_invalid");
  assert.throws(() => core.registerWorkshop({ ...DOCUMENT_WORKSHOP_PROFILE, workshop_id: "workshop.bad", workshop_class: "espresso" }),
    (error) => error.code === "workshop_class_invalid");
  assert.equal(core.getJob("job.x"), null, "rejected submissions leave no job behind");
});

test("a malformed completion never frees the resource or wedges the job", () => {
  const core = createToolWorkshopCore();
  seedWorkshop(core);
  core.submitJob(jobInput("job.1"));
  const lease = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.1" });
  // pass with a malformed output digest: validation precedes every mutation
  assert.throws(() => core.completeRun({
    lease_id: "lease.1", fencing_token: lease.fencing_token, validator_result: "pass",
    output_bundle_manifest_digest: "nope", evidence_refs: [],
  }), (error) => error.code === "digest_invalid");
  assert.equal(core.getJob("job.1").state, "leased", "the job stays leased");
  // pass with a malformed evidence ref: same guarantee
  assert.throws(() => core.completeRun({
    lease_id: "lease.1", fencing_token: lease.fencing_token, validator_result: "pass",
    output_bundle_manifest_digest: DIGEST_OUT, evidence_refs: ["BAD REF"],
  }), (error) => error.code === "ref_invalid");
  assert.equal(core.getCustodyReceipt("job.1"), null);
  // the SAME lease and token still complete cleanly afterwards
  const receipt = core.completeRun({
    lease_id: "lease.1", fencing_token: lease.fencing_token, validator_result: "pass",
    output_bundle_manifest_digest: DIGEST_OUT, evidence_refs: [],
  });
  assert.equal(receipt.claim, "workshop_output_candidate_only");
  assert.equal(core.getJob("job.1").state, "done_candidate");
  // and an invalid max_retries submission fails closed instead of coercing
  assert.throws(() => core.submitJob(jobInput("job.retry", { max_retries: 99 })),
    (error) => error.code === "max_retries_invalid");
});

test("the workshop owns no acceptance, promotion, or completion surface and its log is deterministic", () => {
  const run = () => {
    const core = createToolWorkshopCore();
    seedWorkshop(core);
    core.submitJob(jobInput("job.1"));
    const lease = core.acquireLease("workshop.document", { now: T0, lease_id: "lease.1" });
    core.completeRun({
      lease_id: lease.lease_id, fencing_token: lease.fencing_token, validator_result: "pass",
      output_bundle_manifest_digest: DIGEST_OUT, evidence_refs: [],
    });
    return core;
  };
  const core = run();
  for (const forbidden of ["acceptOutput", "promoteOutput", "completeTask", "markDone", "approve"]) {
    assert.equal(forbidden in core, false, forbidden);
  }
  const receipt = core.getCustodyReceipt("job.1");
  assert.equal(receipt.claim, "workshop_output_candidate_only");
  assert.throws(() => { receipt.evidence_refs.push("evil"); }, TypeError);
  assert.deepEqual(run().eventLog(), core.eventLog(), "identical call sequences yield identical logs");
});

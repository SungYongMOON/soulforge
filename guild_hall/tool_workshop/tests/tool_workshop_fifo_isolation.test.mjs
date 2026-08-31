import test from "node:test";
import assert from "node:assert/strict";

import { createToolWorkshopCore } from "../src/tool_workshop_core.mjs";

const DIGEST_IN = "a".repeat(64);
const DIGEST_OUT = "b".repeat(64);
const T0 = "2026-08-31T06:00:00Z";

function submit(core, jobId, projectRef) {
  core.submitJob({
    job_id: jobId,
    workshop_id: "workshop.presentation",
    task_ref: `task.${jobId}`,
    work_brief_ref: `brief.${jobId}`,
    project_ref: projectRef,
    priority: 2,
    required_tool_version: "tool.powerpoint:v1",
    input_bundle_manifest_digest: DIGEST_IN,
    timeout_seconds: 600,
    max_retries: 0,
  });
}

test("same-priority multi-project jobs remain global FIFO and receipts keep project isolation", () => {
  const core = createToolWorkshopCore();
  core.registerWorkshop({
    workshop_id: "workshop.presentation",
    workshop_class: "presentation",
    resource_id: "resource.synthetic:powerpoint",
    tool_versions: ["tool.powerpoint:v1"],
  });

  submit(core, "job.a1", "project-a");
  submit(core, "job.b1", "project-b");
  submit(core, "job.a2", "project-a");
  submit(core, "job.b2", "project-b");

  const observed = [];
  for (let index = 1; index <= 4; index += 1) {
    const lease = core.acquireLease("workshop.presentation", {
      now: T0,
      lease_id: `lease.${index}`,
    });
    observed.push(lease.job_id);
    const receipt = core.completeRun({
      lease_id: lease.lease_id,
      fencing_token: lease.fencing_token,
      validator_result: "pass",
      output_bundle_manifest_digest: DIGEST_OUT,
      evidence_refs: [],
    });
    assert.equal(receipt.project_ref, lease.job_id.includes(".a") ? "project-a" : "project-b");
    assert.equal(receipt.claim, "workshop_output_candidate_only");
  }

  assert.deepEqual(observed, ["job.a1", "job.b1", "job.a2", "job.b2"]);
});

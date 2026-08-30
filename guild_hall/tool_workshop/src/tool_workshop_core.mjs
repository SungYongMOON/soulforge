// Tool Workshop core — capacity-one lease/fence/validator vertical (plan 11).
//
// Specialist tools (PowerPoint, Excel, HWPX, CAD/EDA, sonar analysis, …) are
// constrained shared resources: one active job per resource, an exclusive
// lease with a monotonic fencing token, bounded runs, a validator verdict, and
// a custody receipt that is a CANDIDATE — never acceptance. This core is pure
// and in-memory: no process, file, license, or tool is touched; the "tool run"
// itself happens outside and reports back through the typed API, and in this
// repository only synthetic runs exist. Wiring a physical Tool PC is a
// separately Owner-gated leaf.
//
// Invariants pinned here:
// - capacity is exactly one active lease per workshop resource;
// - a UI-idle or crashed runner is NOT a release: only an explicit release or
//   an expiry takeover frees the resource, and the takeover bumps the fencing
//   token so a late writer with the old token is rejected;
// - a validator failure consumes a retry and re-queues (or terminally fails);
// - workshop success produces a done_candidate + custody receipt only; there
//   is no acceptance, promotion, or task-completion surface.

export const TOOL_WORKSHOP_SCHEMA = "soulforge.tool_workshop_core.v0";

export const WORKSHOP_CLASSES = Object.freeze([
  "document", "data_excel", "hwpx", "presentation",
  "cad_eda", "sonar_test", "archive", "recovery",
]);

export const JOB_STATES = Object.freeze([
  "queued", "leased", "done_candidate", "failed_terminal",
]);

const REF = /^[a-z][a-z0-9_.:-]{1,120}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function assertRef(value, field) {
  if (typeof value !== "string" || !REF.test(value)) fail("ref_invalid", field);
  return value;
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !HEX64.test(value)) fail("digest_invalid", field);
  return value;
}

function assertClock(value, field) {
  if (typeof value !== "string" || !ISO.test(value)) fail("clock_invalid", field);
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

export function createToolWorkshopCore() {
  const workshops = new Map();  // workshop_id -> workshop record
  const jobs = new Map();       // job_id -> mutable job state (exposed frozen)
  const leases = new Map();     // lease_id -> lease record
  const custody = new Map();    // job_id -> custody receipt
  const events = [];

  function append(kind, payload) {
    events.push(deepFreeze({ seq: events.length + 1, kind, ...payload }));
  }

  function view(job) {
    return deepFreeze({ ...job });
  }

  return Object.freeze({
    schema: TOOL_WORKSHOP_SCHEMA,

    registerWorkshop(input) {
      const id = assertRef(input?.workshop_id, "workshop_id");
      if (workshops.has(id)) fail("workshop_duplicate", id);
      if (!WORKSHOP_CLASSES.includes(input.workshop_class)) fail("workshop_class_invalid", input.workshop_class);
      const record = {
        workshop_id: id,
        workshop_class: input.workshop_class,
        resource_id: assertRef(input.resource_id, "resource_id"),
        // Capacity-one is the v0 contract; a larger pool is a different model.
        capacity: 1,
        tool_versions: (Array.isArray(input.tool_versions) && input.tool_versions.length > 0
          ? input.tool_versions.map((entry, index) => assertRef(entry, `tool_versions[${index}]`))
          : fail("tool_versions_required", id)),
        active_lease_id: null,
        fencing_counter: 0,
      };
      workshops.set(id, record);
      append("workshop_registered", { workshop_id: id });
      return deepFreeze({ ...record });
    },

    submitJob(input) {
      const id = assertRef(input?.job_id, "job_id");
      if (jobs.has(id)) fail("job_duplicate", id);
      const workshop = workshops.get(assertRef(input.workshop_id, "workshop_id"));
      if (!workshop) fail("workshop_unknown", input.workshop_id);
      const toolVersion = assertRef(input.required_tool_version, "required_tool_version");
      if (!workshop.tool_versions.includes(toolVersion)) fail("tool_version_unsupported", toolVersion);
      const priority = Number.isSafeInteger(input.priority) && input.priority >= 1 && input.priority <= 3
        ? input.priority : fail("priority_invalid", "priority");
      const retries = input.max_retries === undefined ? 0
        : (Number.isSafeInteger(input.max_retries) && input.max_retries >= 0 && input.max_retries <= 3
          ? input.max_retries : fail("max_retries_invalid", "max_retries"));
      const timeout = Number.isSafeInteger(input.timeout_seconds) && input.timeout_seconds > 0
        ? input.timeout_seconds : fail("timeout_invalid", "timeout_seconds");
      const job = {
        job_id: id,
        workshop_id: workshop.workshop_id,
        task_ref: assertRef(input.task_ref, "task_ref"),
        work_brief_ref: assertRef(input.work_brief_ref, "work_brief_ref"),
        project_ref: assertRef(input.project_ref, "project_ref"),
        priority,
        required_tool_version: toolVersion,
        input_bundle_manifest_digest: assertDigest(input.input_bundle_manifest_digest, "input_bundle_manifest_digest"),
        timeout_seconds: timeout,
        retries_remaining: retries,
        submitted_seq: events.length + 1,
        state: "queued",
      };
      jobs.set(id, job);
      append("job_submitted", { job_id: id, workshop_id: workshop.workshop_id, priority });
      return view(job);
    },

    // Exclusive lease: highest priority first, then submission order. Returns
    // null when the resource is busy (callers wait; idle UIs never release).
    acquireLease(workshopId, { now, lease_id } = {}) {
      const workshop = workshops.get(assertRef(workshopId, "workshop_id"));
      if (!workshop) fail("workshop_unknown", workshopId);
      const nowClock = assertClock(now, "now");
      const leaseId = assertRef(lease_id, "lease_id");
      if (leases.has(leaseId)) fail("lease_duplicate", leaseId);
      if (workshop.active_lease_id !== null) {
        const active = leases.get(workshop.active_lease_id);
        if (Date.parse(nowClock) < Date.parse(active.expires_at)) {
          return null; // capacity-one: busy resources queue, never double-lease
        }
        // Expiry takeover: the stale lease is superseded; its fencing token
        // dies with it and its job fails terminally (bounded run overran).
        const staleJob = jobs.get(active.job_id);
        staleJob.state = "failed_terminal";
        staleJob.failure_code = "lease_expired_takeover";
        workshop.active_lease_id = null;
        append("lease_expired", { lease_id: active.lease_id, job_id: active.job_id });
      }
      const next = [...jobs.values()]
        .filter((job) => job.workshop_id === workshop.workshop_id && job.state === "queued")
        .sort((left, right) => left.priority - right.priority || left.submitted_seq - right.submitted_seq)[0];
      if (!next) return null;
      workshop.fencing_counter += 1;
      const lease = deepFreeze({
        lease_id: leaseId,
        workshop_id: workshop.workshop_id,
        job_id: next.job_id,
        fencing_token: workshop.fencing_counter,
        acquired_at: nowClock,
        expires_at: new Date(Date.parse(nowClock) + next.timeout_seconds * 1000).toISOString(),
      });
      leases.set(leaseId, lease);
      workshop.active_lease_id = leaseId;
      next.state = "leased";
      append("lease_acquired", { lease_id: leaseId, job_id: next.job_id, fencing_token: lease.fencing_token });
      return lease;
    },

    // Bounded run completion. The fencing token must be the CURRENT one for
    // the workshop; a superseded runner is rejected and promotes nothing.
    completeRun(input) {
      const lease = leases.get(assertRef(input?.lease_id, "lease_id"));
      if (!lease) fail("lease_unknown", input?.lease_id);
      const workshop = workshops.get(lease.workshop_id);
      if (workshop.fencing_counter !== input.fencing_token || workshop.active_lease_id !== lease.lease_id) {
        fail("fence_stale", `${input.fencing_token}`);
      }
      const job = jobs.get(lease.job_id);
      if (job.state !== "leased") fail("job_not_leased", job.job_id);
      if (!["pass", "fail"].includes(input.validator_result)) fail("validator_result_invalid", input.validator_result);

      // Every input is validated BEFORE any mutation, so a malformed
      // completion leaves the lease active and the job leased - never a
      // freed resource with a wedged job.
      let outputDigest = null;
      let evidenceRefs = [];
      if (input.validator_result === "pass") {
        outputDigest = assertDigest(input.output_bundle_manifest_digest, "output_bundle_manifest_digest");
        evidenceRefs = (Array.isArray(input.evidence_refs) ? input.evidence_refs : [])
          .map((entry, index) => assertRef(entry, `evidence_refs[${index}]`));
      }

      workshop.active_lease_id = null;
      if (input.validator_result === "pass") {
        job.state = "done_candidate";
        const receipt = deepFreeze({
          custody_receipt_ref: `workshop.custody:${job.job_id}`,
          job_id: job.job_id,
          project_ref: job.project_ref,
          task_ref: job.task_ref,
          tool_version: job.required_tool_version,
          input_bundle_manifest_digest: job.input_bundle_manifest_digest,
          output_bundle_manifest_digest: outputDigest,
          evidence_refs: evidenceRefs,
          claim: "workshop_output_candidate_only",
        });
        custody.set(job.job_id, receipt);
        append("run_completed_candidate", { job_id: job.job_id, lease_id: lease.lease_id });
        return receipt;
      }

      append("run_validator_failed", { job_id: job.job_id, lease_id: lease.lease_id });
      if (job.retries_remaining > 0) {
        job.retries_remaining -= 1;
        job.state = "queued";
        append("job_requeued", { job_id: job.job_id, retries_remaining: job.retries_remaining });
        return deepFreeze({ job_id: job.job_id, state: "queued", retries_remaining: job.retries_remaining });
      }
      job.state = "failed_terminal";
      job.failure_code = "validator_failed_retries_exhausted";
      append("job_failed_terminal", { job_id: job.job_id });
      return deepFreeze({ job_id: job.job_id, state: "failed_terminal" });
    },

    releaseLease(input) {
      const lease = leases.get(assertRef(input?.lease_id, "lease_id"));
      if (!lease) fail("lease_unknown", input?.lease_id);
      const workshop = workshops.get(lease.workshop_id);
      if (workshop.fencing_counter !== input.fencing_token || workshop.active_lease_id !== lease.lease_id) {
        fail("fence_stale", `${input.fencing_token}`);
      }
      const job = jobs.get(lease.job_id);
      job.state = "queued"; // explicit surrender re-queues without consuming a retry
      workshop.active_lease_id = null;
      append("lease_released", { lease_id: lease.lease_id, job_id: job.job_id });
      return deepFreeze({ released: true, job_id: job.job_id });
    },

    getJob(jobId) {
      const job = jobs.get(assertRef(jobId, "job_id"));
      return job ? view(job) : null;
    },

    getCustodyReceipt(jobId) {
      return custody.get(assertRef(jobId, "job_id")) ?? null;
    },

    eventLog() {
      return events.slice();
    },
  });
}

// First vertical profile: the Document workshop (plan 11 first choice), as a
// registration fixture — real renderer/HWPX tooling stays outside this core.
export const DOCUMENT_WORKSHOP_PROFILE = Object.freeze({
  workshop_id: "workshop.document",
  workshop_class: "document",
  resource_id: "resource.tool_pc_1:office",
  tool_versions: ["tool.docx_renderer:v1", "tool.pdf_readback:v1"],
});

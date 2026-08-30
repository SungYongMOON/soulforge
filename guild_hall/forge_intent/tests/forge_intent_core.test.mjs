import test from "node:test";
import assert from "node:assert/strict";

import {
  FORGE_INTENT_SCHEMA,
  HOLDS,
  createForgeIntentCore,
  intentDigest,
} from "../src/forge_intent_core.mjs";

const DIGEST_OK = "a".repeat(64);

function syntheticWriter() {
  const calls = [];
  return {
    calls,
    createOfficialTask: async (packet) => {
      calls.push(packet);
      return { task_ref: `linear.synthetic:${calls.length}`, writer_ref: "writer.synthetic" };
    },
  };
}

function seedThroughApproval(core) {
  core.createWorkCandidate({
    candidate_id: "cand.1",
    accepted_context_ref: "context.gen:demo_project:g1",
    engine_finding_refs: ["finding.gap:hrs_missing"],
    rationale: "HRS final revision is missing for the CDR gate.",
    confidence: "high",
    stop_conditions: ["stop when the source revision is disputed"],
  });
  const intent = core.createTaskIntent({
    intent_id: "intent.1",
    candidate_id: "cand.1",
    requested_change: "Create one official task to draft the HRS final revision.",
    expected_prior_state: "no open official task for this gap",
  });
  core.recordApproval({
    approval_ref: "approval.1",
    intent_id: "intent.1",
    intent_digest: intent.intent_digest,
    authority_ref: "human.owner_delegate",
    decision: "approve",
  });
  return intent;
}

test("full default-OFF vertical: candidate -> intent -> approval -> writer port -> assignment -> issued brief", async () => {
  const writer = syntheticWriter();
  const core = createForgeIntentCore({ taskWriter: writer });
  assert.equal(core.schema, FORGE_INTENT_SCHEMA);
  const intent = seedThroughApproval(core);
  const task = await core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest });
  assert.equal(task.task_ref, "linear.synthetic:1");
  assert.equal(writer.calls.length, 1);
  core.createAssignment({
    assignment_id: "assign.1", intent_id: "intent.1",
    primary_role: "role.sw_engineer", actor_ref: "member.alice",
    authority_ref: "authority.assignment_board", assignment_epoch: 1, expires_at: "2026-09-15",
  });
  const brief = core.issueWorkBrief({
    brief_id: "brief.1", assignment_id: "assign.1",
    problem: "HRS final revision missing", requested_outcome: "reviewed HRS draft",
    allowed_write_scope: ["workspace:demo_project/hrs_draft"],
    required_evidence: ["source revision refs"],
    stop_conditions: ["stop on disputed source"],
    escalation_path: "escalate to systems engineering lead",
    required_review_role: "role.se_reviewer",
    input_bundle_manifest_digest: DIGEST_OK,
  });
  assert.equal(brief.task_ref, "linear.synthetic:1");
  assert.equal(brief.primary_role, "role.sw_engineer");
  assert.deepEqual(core.eventLog().map((event) => event.kind), [
    "work_candidate_created", "task_intent_created", "approval_recorded",
    "official_task_registered", "assignment_created", "work_brief_issued",
  ]);
});

test("missing accepted context or findings never synthesizes facts", () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  assert.throws(() => core.createWorkCandidate({
    candidate_id: "cand.x", accepted_context_ref: "",
    engine_finding_refs: ["finding.a:b"], rationale: "r", confidence: "low", stop_conditions: [],
  }), (error) => error.code === HOLDS.INPUT_UNAVAILABLE);
  assert.throws(() => core.createWorkCandidate({
    candidate_id: "cand.x", accepted_context_ref: "context.gen:demo_project:g1",
    engine_finding_refs: [], rationale: "r", confidence: "low", stop_conditions: [],
  }), (error) => error.code === HOLDS.INPUT_UNAVAILABLE);
});

test("the writer port is unreachable without an approve decision, and reject/hold block permanently", async () => {
  for (const decision of ["reject", "hold"]) {
    const writer = syntheticWriter();
    const core = createForgeIntentCore({ taskWriter: writer });
    core.createWorkCandidate({
      candidate_id: "cand.1", accepted_context_ref: "context.gen:demo_project:g1",
      engine_finding_refs: ["finding.gap:x"], rationale: "r", confidence: "medium", stop_conditions: [],
    });
    const intent = core.createTaskIntent({
      intent_id: "intent.1", candidate_id: "cand.1",
      requested_change: "create task", expected_prior_state: "none",
    });
    // before any approval record
    await assert.rejects(core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest }),
      (error) => error.code === HOLDS.APPROVAL_REQUIRED);
    core.recordApproval({
      approval_ref: "approval.1", intent_id: "intent.1", intent_digest: intent.intent_digest,
      authority_ref: "human.owner_delegate", decision,
    });
    await assert.rejects(core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest }),
      (error) => error.code === HOLDS.APPROVAL_REQUIRED);
    assert.equal(writer.calls.length, 0, "the writer port must never be touched");
    // a second approval cannot flip the decision
    assert.throws(() => core.recordApproval({
      approval_ref: "approval.2", intent_id: "intent.1", intent_digest: intent.intent_digest,
      authority_ref: "human.owner_delegate", decision: "approve",
    }), (error) => error.code === "approval_duplicate");
  }
});

test("intent digests are deterministic, order-independent, and stale digests hold", async () => {
  const bodyA = { candidate_id: "c", accepted_context_ref: "x.y", requested_change: "r", expected_prior_state: "s" };
  const bodyB = { expected_prior_state: "s", requested_change: "r", accepted_context_ref: "x.y", candidate_id: "c" };
  assert.equal(intentDigest(bodyA), intentDigest(bodyB));
  assert.notEqual(intentDigest(bodyA), intentDigest({ ...bodyA, requested_change: "r2" }));

  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  const intent = seedThroughApproval(core);
  assert.throws(() => core.recordApproval({
    approval_ref: "approval.dup", intent_id: "intent.1", intent_digest: "f".repeat(64),
    authority_ref: "human.owner_delegate", decision: "approve",
  }), (error) => error.code === "approval_duplicate", "an existing approval stays put");
  await assert.rejects(core.registerOfficialTask({ intent_id: "intent.1", intent_digest: "f".repeat(64) }),
    (error) => error.code === HOLDS.STALE_TASK_INTENT);
  const ok = await core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest });
  assert.equal(ok.task_ref, "linear.synthetic:1");
});

test("approved intent maps to exactly one official task: replay is idempotent, never a second write", async () => {
  const writer = syntheticWriter();
  const core = createForgeIntentCore({ taskWriter: writer });
  const intent = seedThroughApproval(core);
  const first = await core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest });
  const second = await core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest });
  assert.equal(writer.calls.length, 1);
  assert.equal(second.replay, true);
  assert.equal(second.task_ref, first.task_ref);
  // replay with a stale digest is refused instead of silently reading back
  await assert.rejects(core.registerOfficialTask({ intent_id: "intent.1", intent_digest: "f".repeat(64) }),
    (error) => error.code === HOLDS.STALE_TASK_INTENT);
});

test("a Work Brief with any missing critical binding is not issued", async () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  const intent = seedThroughApproval(core);
  await core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest });
  core.createAssignment({
    assignment_id: "assign.1", intent_id: "intent.1",
    primary_role: "role.sw_engineer", actor_ref: "member.alice",
    authority_ref: "authority.assignment_board", assignment_epoch: 1, expires_at: "2026-09-15",
  });
  const complete = {
    brief_id: "brief.1", assignment_id: "assign.1",
    problem: "p", requested_outcome: "o",
    allowed_write_scope: ["scope"], required_evidence: ["evidence"],
    stop_conditions: ["stop"], escalation_path: "lead",
    required_review_role: "role.se_reviewer", input_bundle_manifest_digest: DIGEST_OK,
  };
  for (const field of ["problem", "requested_outcome", "allowed_write_scope", "required_evidence",
    "stop_conditions", "escalation_path", "required_review_role", "input_bundle_manifest_digest"]) {
    const broken = { ...complete, [field]: Array.isArray(complete[field]) ? [] : "" };
    assert.throws(() => core.issueWorkBrief(broken), (error) => error.code === HOLDS.BRIEF_INCOMPLETE, field);
  }
  assert.equal(core.getIssuedBrief("brief.1"), null, "no partial brief may exist");
  // brief without an assignment is unreachable
  assert.throws(() => core.issueWorkBrief({ ...complete, assignment_id: "assign.ghost" }),
    (error) => error.code === HOLDS.ASSIGNMENT_REQUIRED);
  const brief = core.issueWorkBrief(complete);
  assert.equal(brief.brief_id, "brief.1");
  // exactly one issued brief per assignment, and issued briefs are deeply immutable
  assert.throws(() => core.issueWorkBrief({ ...complete, brief_id: "brief.2" }),
    (error) => error.code === "assignment_brief_exists");
  assert.throws(() => { core.getIssuedBrief("brief.1").allowed_write_scope.push("evil"); }, TypeError);
});

test("assignments require a registered official task and a named assignment authority", () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  seedThroughApproval(core);
  assert.throws(() => core.createAssignment({
    assignment_id: "assign.1", intent_id: "intent.1",
    primary_role: "role.sw_engineer", actor_ref: "member.alice",
    authority_ref: "authority.assignment_board", assignment_epoch: 1, expires_at: "2026-09-15",
  }), (error) => error.code === HOLDS.ASSIGNMENT_REQUIRED, "no assignment before the official task exists");
});

test("the factory refuses to exist without a writer port and exposes no completion surface", () => {
  assert.throws(() => createForgeIntentCore({}), (error) => error.code === "task_writer_port_required");
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  for (const forbidden of ["completeTask", "markDone", "acceptArtifact", "approveTask", "setTaskStatus"]) {
    assert.equal(forbidden in core, false, forbidden);
  }
});

// ---- Work Brief draft state: gaps are visible data; only the latest ----
// ---- complete draft issues, and only by the assignment's authority.  ----

async function seedThroughAssignment(core) {
  const intent = seedThroughApproval(core);
  await core.registerOfficialTask({ intent_id: "intent.1", intent_digest: intent.intent_digest });
  return core.createAssignment({
    assignment_id: "assign.1", intent_id: "intent.1",
    primary_role: "role.sw_engineer", actor_ref: "member.alice",
    authority_ref: "authority.assignment_board", assignment_epoch: 1, expires_at: "2026-09-15",
  });
}

const COMPLETE_BINDINGS = Object.freeze({
  problem: "HRS final revision missing",
  requested_outcome: "reviewed HRS draft",
  allowed_write_scope: ["workspace:demo_project/hrs_draft"],
  required_evidence: ["source revision refs"],
  stop_conditions: ["stop on disputed source"],
  escalation_path: "escalate to systems engineering lead",
  required_review_role: "role.se_reviewer",
  input_bundle_manifest_digest: DIGEST_OK,
});

test("a draft records its gaps as data, is immutable, and an incomplete draft never issues", async () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  await seedThroughAssignment(core);
  const draft = core.draftWorkBrief({
    draft_ref: "draft.1", assignment_id: "assign.1",
    problem: "HRS final revision missing",
    requested_outcome: "reviewed HRS draft",
    allowed_write_scope: ["workspace:demo_project/hrs_draft"],
    // required_evidence, stop_conditions, escalation_path, review role,
    // and the bundle digest are deliberately still open.
  });
  assert.equal(draft.complete, false);
  assert.equal(draft.draft_revision, 1);
  assert.equal(draft.claim, "draft_not_issuable_material");
  assert.deepEqual(draft.missing_bindings, [
    "escalation_path", "input_bundle_manifest_digest", "required_evidence",
    "required_review_role", "stop_conditions",
  ], "every open binding is visible, sorted, in one place");
  assert.throws(() => { draft.missing_bindings.push("forged"); }, TypeError);
  assert.throws(() => { draft.bindings.problem = "tampered"; }, TypeError);
  const failure = (() => { try {
    core.issueWorkBriefFromDraft({ brief_id: "brief.1", assignment_id: "assign.1", draft_ref: "draft.1", issuer_ref: "authority.assignment_board" });
  } catch (error) { return error; } })();
  assert.equal(failure.code, HOLDS.BRIEF_INCOMPLETE);
  assert.equal(failure.message.includes("required_evidence") && failure.message.includes("escalation_path"), true,
    "the hold names ALL missing bindings, not just the first");
  assert.equal(core.getIssuedBrief("brief.1"), null);
  // Junk in a PRESENT field fails at draft time with issuance's own rules.
  assert.throws(() => core.draftWorkBrief({
    draft_ref: "draft.junk", assignment_id: "assign.1",
    input_bundle_manifest_digest: "not-a-digest",
  }), (error) => error.code === "digest_invalid");
  assert.throws(() => core.draftWorkBrief({ draft_ref: "draft.ghost", assignment_id: "assign.ghost" }),
    (error) => error.code === HOLDS.ASSIGNMENT_REQUIRED);
});

test("only the LATEST complete draft issues, only by the assignment authority, and exactly once", async () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  await seedThroughAssignment(core);
  core.draftWorkBrief({ draft_ref: "draft.1", assignment_id: "assign.1", ...COMPLETE_BINDINGS, problem: "first wording" });
  const second = core.draftWorkBrief({ draft_ref: "draft.2", assignment_id: "assign.1", ...COMPLETE_BINDINGS });
  assert.equal(second.draft_revision, 2);
  assert.equal(core.getLatestDraft("assign.1").draft_ref, "draft.2");
  // A superseded draft cannot issue: its corrections were replaced.
  assert.throws(() => core.issueWorkBriefFromDraft({
    brief_id: "brief.stale", assignment_id: "assign.1", draft_ref: "draft.1", issuer_ref: "authority.assignment_board",
  }), (error) => error.code === HOLDS.STALE_DRAFT);
  // Only the assignment's own authority issues.
  assert.throws(() => core.issueWorkBriefFromDraft({
    brief_id: "brief.rogue", assignment_id: "assign.1", draft_ref: "draft.2", issuer_ref: "member.alice",
  }), (error) => error.code === "issuer_not_assignment_authority");
  const brief = core.issueWorkBriefFromDraft({
    brief_id: "brief.1", assignment_id: "assign.1", draft_ref: "draft.2", issuer_ref: "authority.assignment_board",
  });
  assert.equal(brief.source_draft_ref, "draft.2");
  assert.equal(brief.problem, COMPLETE_BINDINGS.problem);
  assert.equal(brief.input_bundle_manifest_digest, DIGEST_OK);
  // One brief per assignment: both further drafting and both issue paths close.
  assert.throws(() => core.draftWorkBrief({ draft_ref: "draft.3", assignment_id: "assign.1", ...COMPLETE_BINDINGS }),
    (error) => error.code === "assignment_brief_exists");
  assert.throws(() => core.issueWorkBriefFromDraft({
    brief_id: "brief.again", assignment_id: "assign.1", draft_ref: "draft.2", issuer_ref: "authority.assignment_board",
  }), (error) => error.code === "assignment_brief_exists");
  assert.throws(() => core.issueWorkBrief({ brief_id: "brief.direct", assignment_id: "assign.1", ...COMPLETE_BINDINGS }),
    (error) => error.code === "assignment_brief_exists");
});

test("drafts never appear on the issued-brief surface and the event log records the draft trail without content", async () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  await seedThroughAssignment(core);
  core.draftWorkBrief({ draft_ref: "draft.1", assignment_id: "assign.1", problem: "only the problem so far" });
  core.draftWorkBrief({ draft_ref: "draft.2", assignment_id: "assign.1", ...COMPLETE_BINDINGS });
  core.issueWorkBriefFromDraft({ brief_id: "brief.1", assignment_id: "assign.1", draft_ref: "draft.2", issuer_ref: "authority.assignment_board" });
  assert.equal(core.getIssuedBrief("draft.1"), null, "a draft ref is not an issued brief");
  const draftEvents = core.eventLog().filter((event) => event.kind === "work_brief_drafted");
  assert.deepEqual(draftEvents.map((event) => [event.draft_revision, event.missing_count]), [[1, 7], [2, 0]]);
  for (const event of draftEvents) {
    assert.equal("problem" in event, false, "draft events carry counts and refs, never binding content");
  }
  // A nonexistent assignment holds before anything else.
  assert.throws(() => core.issueWorkBriefFromDraft({
    brief_id: "brief.x", assignment_id: "assign.ghost", draft_ref: "draft.2", issuer_ref: "authority.assignment_board",
  }), (error) => error.code === HOLDS.ASSIGNMENT_REQUIRED);
});

test("a draft of one assignment can never issue against another existing assignment", async () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  await seedThroughAssignment(core);
  // Second full chain: its own candidate, intent, approval, task, assignment.
  core.createWorkCandidate({
    candidate_id: "cand.2", accepted_context_ref: "context.gen:demo_project:g1",
    engine_finding_refs: ["finding.gap:sds_missing"], rationale: "SDS draft is missing for the same gate.",
    confidence: "medium", stop_conditions: [],
  });
  const intent2 = core.createTaskIntent({
    intent_id: "intent.2", candidate_id: "cand.2",
    requested_change: "Create one official task to draft the SDS.",
    expected_prior_state: "no open official task for this gap",
  });
  core.recordApproval({
    approval_ref: "approval.2", intent_id: "intent.2", intent_digest: intent2.intent_digest,
    authority_ref: "human.owner_delegate", decision: "approve",
  });
  await core.registerOfficialTask({ intent_id: "intent.2", intent_digest: intent2.intent_digest });
  core.createAssignment({
    assignment_id: "assign.2", intent_id: "intent.2",
    primary_role: "role.sw_engineer", actor_ref: "member.carol",
    authority_ref: "authority.assignment_board", assignment_epoch: 1, expires_at: "2026-09-15",
  });
  core.draftWorkBrief({ draft_ref: "draft.a1", assignment_id: "assign.1", ...COMPLETE_BINDINGS });
  // The draft belongs to assign.1; issuing it against assign.2 is refused
  // even though assign.2 exists and the issuer holds its authority.
  assert.throws(() => core.issueWorkBriefFromDraft({
    brief_id: "brief.cross", assignment_id: "assign.2", draft_ref: "draft.a1", issuer_ref: "authority.assignment_board",
  }), (error) => error.code === HOLDS.INPUT_UNAVAILABLE);
  assert.equal(core.getIssuedBrief("brief.cross"), null);
});

test("wrong-TYPE critical fields fail with coded errors on both paths; the digest coercion hole is closed", async () => {
  const core = createForgeIntentCore({ taskWriter: syntheticWriter() });
  await seedThroughAssignment(core);
  // A string where a list belongs: typed rejection at draft time...
  assert.throws(() => core.draftWorkBrief({
    draft_ref: "draft.badtype", assignment_id: "assign.1", allowed_write_scope: "workspace:oops",
  }), (error) => error.code === "text_invalid");
  // ...and on the direct issue path (previously a raw TypeError).
  assert.throws(() => core.issueWorkBrief({
    brief_id: "brief.badtype", assignment_id: "assign.1",
    ...COMPLETE_BINDINGS, allowed_write_scope: "workspace:oops",
  }), (error) => error.code === "text_invalid");
  // An array-wrapped digest passes the legacy regex via string coercion but
  // must never land in an issued brief (declared tightening of the direct
  // path: it now fails digest_invalid instead of issuing).
  assert.throws(() => core.issueWorkBrief({
    brief_id: "brief.coerced", assignment_id: "assign.1",
    ...COMPLETE_BINDINGS, input_bundle_manifest_digest: [DIGEST_OK],
  }), (error) => error.code === "digest_invalid");
  // A non-string non-array value is not presence: it shows up as missing.
  const numeric = core.draftWorkBrief({ draft_ref: "draft.numeric", assignment_id: "assign.1", problem: 42 });
  assert.equal(numeric.missing_bindings.includes("problem"), true, "a malformed scalar is visible as a gap, never silently stored");
  assert.equal(core.getIssuedBrief("brief.coerced"), null);
});

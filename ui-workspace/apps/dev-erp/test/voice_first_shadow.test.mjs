import assert from "node:assert/strict";
import test from "node:test";

import {
  validateHourlyShadowCycle,
  HOURLY_SHADOW_CYCLE_SCHEMA,
  HOURLY_SHADOW_POLICY_REVISION,
  EFFECT_COUNTER_KEYS,
  CONTEXT_MODES,
  UNKNOWN_HOSTILE_MARKER,
  REQUIRED_SOURCE_MANIFEST,
} from "../src/hourly_shadow_cycle_contract.mjs";

import {
  createInMemoryProjectDecisionLedger,
} from "../src/project_decision_ledger.mjs";

import {
  buildPortfolioDecisionProjection,
} from "../src/portfolio_decision_projection.mjs";

import {
  evaluateShadowCycle,
} from "../src/shadow_evaluator.mjs";

function createSyntheticCycle(overrides = {}) {
  return {
    cycle_id: "cyc_01912a7e2b1070008000000000000001",
    project_ref: "P01-001",
    occurred_at: "2026-08-21T21:00:00.000+09:00",
    observed_at: "2026-08-21T21:01:00.000+09:00",
    kst_cutoff: "2026-08-21T21:00:00.000+09:00",
    model_ref: "gpt-4o-2026-08-01",
    prompt_sha256_ref: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    policy_ref: HOURLY_SHADOW_POLICY_REVISION,
    output_schema_ref: HOURLY_SHADOW_CYCLE_SCHEMA,
    permission_refs: ["gmail:read", "slack:read", "linear:read"],
    context_mode: "live_only",
    trigger_identity: "trg_gmail_thread_98124",
    trigger_digest: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    source_reads: [
      {
        source: "gmail",
        status: "read",
        cursor_before: "msg_100",
        cursor_after: "msg_105",
        count: 5,
        latest_time: "2026-08-21T20:55:00.000+09:00",
        coverage_gap: false,
        source_refs: ["msg_101", "msg_102", "msg_103", "msg_104", "msg_105"],
        required: true,
      },
      {
        source: "linear",
        status: "read",
        cursor_before: "iss_200",
        cursor_after: "iss_202",
        count: 2,
        latest_time: "2026-08-21T20:50:00.000+09:00",
        coverage_gap: false,
        source_refs: ["iss_201", "iss_202"],
        required: true,
      },
      {
        source: "slack",
        status: "empty",
        cursor_before: "slk_300",
        cursor_after: "slk_300",
        count: 0,
        latest_time: null,
        coverage_gap: false,
        source_refs: [],
        required: false,
      },
    ],
    disposition: "PROPOSAL",
    why_code: "NEW_DELIVERABLE_REQUESTED",
    short_summary: "Draft proposal for deliverable review",
    missing_context: [],
    evidence_refs: ["ev_gmail_105", "ev_linear_202"],
    candidate_task_refs: ["tsk_cand_901"],
    task_identity: "tsk_ident_cdr_review",
    task_type: "artifact_draft",
    proposed_action: "CREATE_TASK_CANDIDATE",
    required_authority: "A0",
    effect_counters: {
      linear_mutations: 0,
      gmail_sends: 0,
      slack_posts: 0,
      calendar_mutations: 0,
      drive_mutations: 0,
      external_calls: 0,
    },
    hostile_markers: [],
    supersedes_ref: null,
    correction_category: null,
    is_bot_echo: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Hourly Shadow Cycle Contract (B0, B1, B2, A0)
// ---------------------------------------------------------------------------

test("validateHourlyShadowCycle accepts a valid body-free shadow cycle packet", () => {
  const packet = createSyntheticCycle();
  const result = validateHourlyShadowCycle(packet);
  assert.equal(result.status, "VALIDATED");
  assert.ok(result.cycle);
  assert.equal(result.cycle.cycle_id, packet.cycle_id);
  assert.equal(result.cycle.disposition, "PROPOSAL");
  assert.equal(Object.isFrozen(result.cycle), true);
  assert.equal(Object.isFrozen(result.cycle.effect_counters), true);
});

test("validateHourlyShadowCycle fails-close on malformed non-object inputs", () => {
  const malformedInputs = [null, undefined, "string", 12345, true, [1, 2, 3]];
  for (const input of malformedInputs) {
    const res = validateHourlyShadowCycle(input);
    assert.equal(res.status, "HOLD");
    assert.ok(res.hold_codes.includes("MALFORMED_PACKET"));
  }
});

test("validateHourlyShadowCycle accepts UNKNOWN model_ref but rejects empty or missing model_ref", () => {
  const unknownModelPacket = createSyntheticCycle({ model_ref: "UNKNOWN" });
  const res1 = validateHourlyShadowCycle(unknownModelPacket);
  assert.equal(res1.status, "VALIDATED");

  const emptyModelPacket = createSyntheticCycle({ model_ref: "" });
  const res2 = validateHourlyShadowCycle(emptyModelPacket);
  assert.equal(res2.status, "HOLD");
  assert.ok(res2.hold_codes.includes("INVALID_MODEL_REF"));
});

test("validateHourlyShadowCycle rejects invalid prompt sha256 ref", () => {
  const badPromptPacket = createSyntheticCycle({ prompt_sha256_ref: "not_a_sha256" });
  const result = validateHourlyShadowCycle(badPromptPacket);
  assert.equal(result.status, "HOLD");
  assert.ok(result.hold_codes.includes("INVALID_PROMPT_DIGEST"));
});

test("validateHourlyShadowCycle rejects unknown dispositions", () => {
  const badDispPacket = createSyntheticCycle({ disposition: "AUTO_EXECUTE" });
  const result = validateHourlyShadowCycle(badDispPacket);
  assert.equal(result.status, "HOLD");
  assert.ok(result.hold_codes.includes("INVALID_DISPOSITION"));
});

test("validateHourlyShadowCycle recursively rejects forbidden raw payload fields", () => {
  const forbiddenKeys = [
    { body: "raw email content here" },
    { prompt_body: "system prompt text" },
    { transcript: "speaker: hello" },
    { chain_of_thought: "first I should check..." },
    { password: "secret_password" },
    { api_key: "sk-123456789" },
    { file_path: "C:\\Users\\user\\secret.txt" },
    { nested: { deeply: { credential: "raw_cred" } } },
    { source_reads: [{ source: "gmail", status: "read", raw_source: "bad_content" }] },
  ];

  for (const extra of forbiddenKeys) {
    const packet = createSyntheticCycle(extra);
    const result = validateHourlyShadowCycle(packet);
    assert.equal(result.status, "HOLD", `Failed for key: ${JSON.stringify(extra)}`);
    assert.ok(
      result.hold_codes.includes("FORBIDDEN_PAYLOAD_FIELD") ||
      result.hold_codes.includes("RAW_PAYLOAD_FORBIDDEN"),
      `Expected hold code for: ${JSON.stringify(extra)}`,
    );
  }
});

test("validateHourlyShadowCycle forces HOLD and blocks PROPOSAL when required source is partial or unavailable", () => {
  const partialSourcePacket = createSyntheticCycle({
    source_reads: [
      {
        source: "gmail",
        status: "partial",
        cursor_before: "msg_100",
        cursor_after: "msg_102",
        count: 2,
        latest_time: "2026-08-21T20:55:00.000+09:00",
        coverage_gap: true,
        source_refs: ["msg_101"],
        required: true,
      },
    ],
    disposition: "PROPOSAL",
  });

  const result = validateHourlyShadowCycle(partialSourcePacket);
  assert.equal(result.status, "HOLD");
  assert.ok(result.hold_codes.includes("COVERAGE_GAP"));
  assert.ok(result.hold_codes.includes("PROPOSAL_FORBIDDEN_ON_COVERAGE_GAP"));
});

test("validateHourlyShadowCycle enforces A0 effect invariant: all external effect counts must be 0", () => {
  const effectViolations = [
    { effect_counters: { linear_mutations: 1, gmail_sends: 0, slack_posts: 0, calendar_mutations: 0, drive_mutations: 0, external_calls: 0 } },
    { effect_counters: { linear_mutations: 0, gmail_sends: 1, slack_posts: 0, calendar_mutations: 0, drive_mutations: 0, external_calls: 0 } },
    { effect_counters: { linear_mutations: 0, gmail_sends: 0, slack_posts: 1, calendar_mutations: 0, drive_mutations: 0, external_calls: 0 } },
    { effect_counters: { linear_mutations: 0, gmail_sends: 0, slack_posts: 0, calendar_mutations: 1, drive_mutations: 0, external_calls: 0 } },
    { effect_counters: { linear_mutations: 0, gmail_sends: 0, slack_posts: 0, calendar_mutations: 0, drive_mutations: 1, external_calls: 0 } },
    { effect_counters: { linear_mutations: 0, gmail_sends: 0, slack_posts: 0, calendar_mutations: 0, drive_mutations: 0, external_calls: 1 } },
  ];

  for (const extra of effectViolations) {
    const packet = createSyntheticCycle(extra);
    const result = validateHourlyShadowCycle(packet);
    assert.equal(result.status, "HOLD");
    assert.ok(result.hold_codes.includes("A0_EFFECT_INVARIANT_VIOLATED"));
  }
});

test("validateHourlyShadowCycle classifies B2 hostile markers into typed HOLD codes", () => {
  const hostileCases = [
    { marker: "prompt_injection", expectedCode: "PROMPT_INJECTION_DETECTED" },
    { marker: "cross_project_contamination", expectedCode: "CROSS_PROJECT_CONTAMINATION" },
    { marker: "contradiction", expectedCode: "CONTRADICTION_DETECTED" },
    { marker: "stale_generation", expectedCode: "STALE_GENERATION" },
    { marker: "ambiguous_owner", expectedCode: "AMBIGUOUS_OWNER" },
    { marker: "noise_duplicate", expectedCode: "NOISE_DUPLICATE_DETECTED" },
  ];

  for (const { marker, expectedCode } of hostileCases) {
    const packet = createSyntheticCycle({ hostile_markers: [marker] });
    const result = validateHourlyShadowCycle(packet);
    assert.equal(result.status, "HOLD");
    assert.ok(result.hold_codes.includes(expectedCode), `Expected ${expectedCode} for marker ${marker}`);
  }
});

test("validateHourlyShadowCycle holds when context_mode is not live_only", () => {
  const packet = createSyntheticCycle({ context_mode: "accepted_context" });
  const result = validateHourlyShadowCycle(packet);
  assert.equal(result.status, "HOLD");
  assert.ok(result.hold_codes.includes("ACCEPTED_CONTEXT_NOT_SUPPORTED"));
});

// ---------------------------------------------------------------------------
// 2. In-Memory Project Decision Ledger
// ---------------------------------------------------------------------------

test("in-memory ledger appends a valid cycle and tracks project-isolated cursor", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const packet = createSyntheticCycle();
  const validation = validateHourlyShadowCycle(packet);
  assert.equal(validation.status, "VALIDATED");

  const appendRes = ledger.appendCycle(validation.cycle, 0);
  assert.equal(appendRes.status, "APPENDED");
  assert.ok(appendRes.receipt);
  assert.equal(appendRes.receipt.cursor, 0);
  assert.equal(appendRes.receipt.next_cursor, 1);
  assert.equal(appendRes.receipt.project_ref, "P01-001");
  assert.equal(appendRes.receipt.disposition, "PROPOSAL");
});

test("in-memory ledger exact cycle replay returns original receipt without appending duplicate", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const packet = createSyntheticCycle();
  const validation = validateHourlyShadowCycle(packet);

  const first = ledger.appendCycle(validation.cycle, 0);
  assert.equal(first.status, "APPENDED");

  const replay = ledger.appendCycle(validation.cycle, 1);
  assert.equal(replay.status, "REPLAY");
  assert.equal(replay.receipt.record_id, first.receipt.record_id);
  assert.equal(replay.receipt.cursor, first.receipt.cursor);

  const capsule = ledger.inspectProject("P01-001").capsule;
  assert.equal(capsule.record_count, 1);
});

test("in-memory ledger same trigger identity + same digest yields NO_OP", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const packet1 = createSyntheticCycle({ cycle_id: "cyc_001" });
  const val1 = validateHourlyShadowCycle(packet1);
  ledger.appendCycle(val1.cycle, 0);

  // Different cycle_id, but identical trigger_identity + trigger_digest
  const packet2 = createSyntheticCycle({
    cycle_id: "cyc_002",
    disposition: "NO_ACTION",
    why_code: "NO_NEW_EVENT",
  });
  const val2 = validateHourlyShadowCycle(packet2);
  const res2 = ledger.appendCycle(val2.cycle, 1);

  assert.equal(res2.status, "NO_OP");
  assert.equal(res2.receipt.disposition, "NO_OP");
  assert.equal(res2.receipt.reason, "IDENTICAL_TRIGGER_DIGEST");

  const capsule = ledger.inspectProject("P01-001").capsule;
  assert.equal(capsule.record_count, 1);
});

test("in-memory ledger handles application echo as NO_OP without mutating state", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const packet = createSyntheticCycle({ is_bot_echo: true });
  const val = validateHourlyShadowCycle(packet);

  const res = ledger.appendCycle(val.cycle, 0);
  assert.equal(res.status, "NO_OP");
  assert.equal(res.receipt.disposition, "APPLICATION_ECHO");

  const capsule = ledger.inspectProject("P01-001").capsule;
  assert.equal(capsule.record_count, 0);
});

test("in-memory ledger same trigger identity + changed digest creates new evaluation event", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const packet1 = createSyntheticCycle({
    cycle_id: "cyc_001",
    trigger_digest: "1111111111111111111111111111111111111111111111111111111111111111",
  });
  const val1 = validateHourlyShadowCycle(packet1);
  ledger.appendCycle(val1.cycle, 0);

  const packet2 = createSyntheticCycle({
    cycle_id: "cyc_002",
    trigger_digest: "2222222222222222222222222222222222222222222222222222222222222222",
  });
  const val2 = validateHourlyShadowCycle(packet2);
  const res2 = ledger.appendCycle(val2.cycle, 1);

  assert.equal(res2.status, "APPENDED");
  assert.equal(res2.receipt.cursor, 1);

  const capsule = ledger.inspectProject("P01-001").capsule;
  assert.equal(capsule.record_count, 2);
});

test("in-memory ledger rejects cursor mismatch without writing", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const packet = createSyntheticCycle();
  const val = validateHourlyShadowCycle(packet);

  const res = ledger.appendCycle(val.cycle, 5); // Expected 0, given 5
  assert.equal(res.status, "HOLD");
  assert.ok(res.hold_codes.includes("CURSOR_MISMATCH"));

  const capsule = ledger.inspectProject("P01-001").capsule;
  assert.equal(capsule.record_count, 0);
});

test("in-memory ledger enforces project isolation across different projects", () => {
  const ledger = createInMemoryProjectDecisionLedger();

  const p1Packet = createSyntheticCycle({ project_ref: "P01-001", cycle_id: "cyc_p1" });
  const p2Packet = createSyntheticCycle({ project_ref: "P02-002", cycle_id: "cyc_p2" });

  const val1 = validateHourlyShadowCycle(p1Packet);
  const val2 = validateHourlyShadowCycle(p2Packet);

  const res1 = ledger.appendCycle(val1.cycle, 0);
  const res2 = ledger.appendCycle(val2.cycle, 0);

  assert.equal(res1.status, "APPENDED");
  assert.equal(res2.status, "APPENDED");

  const cap1 = ledger.inspectProject("P01-001").capsule;
  const cap2 = ledger.inspectProject("P02-002").capsule;

  assert.equal(cap1.record_count, 1);
  assert.equal(cap2.record_count, 1);
  assert.equal(cap1.project_ref, "P01-001");
  assert.equal(cap2.project_ref, "P02-002");
});

test("in-memory ledger handles supersession as a new record without mutating history", () => {
  const ledger = createInMemoryProjectDecisionLedger();

  const initialPacket = createSyntheticCycle({ cycle_id: "cyc_orig", disposition: "PROPOSAL" });
  const val1 = validateHourlyShadowCycle(initialPacket);
  const res1 = ledger.appendCycle(val1.cycle, 0);
  assert.equal(res1.status, "APPENDED");

  // Correction cycle superseding cyc_orig
  const correctionPacket = createSyntheticCycle({
    cycle_id: "cyc_corr",
    disposition: "HOLD",
    supersedes_ref: "cyc_orig",
    correction_category: "TAXONOMY_CORRECTION",
    why_code: "EVIDENCE_INSUFFICIENT",
  });
  const val2 = validateHourlyShadowCycle(correctionPacket);
  const res2 = ledger.appendCycle(val2.cycle, 1);
  assert.equal(res2.status, "APPENDED");
  assert.equal(res2.receipt.supersedes_ref, "cyc_orig");

  const capsule = ledger.inspectProject("P01-001").capsule;
  assert.equal(capsule.record_count, 2);
  assert.equal(capsule.superseded_record_count, 1);
});

test("in-memory ledger rejects supersession if target cycle does not exist", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const correctionPacket = createSyntheticCycle({
    cycle_id: "cyc_corr",
    supersedes_ref: "non_existent_cycle",
    correction_category: "TAXONOMY_CORRECTION",
  });
  const val = validateHourlyShadowCycle(correctionPacket);
  const res = ledger.appendCycle(val.cycle, 0);
  assert.equal(res.status, "HOLD");
  assert.ok(res.hold_codes.includes("SUPERSEDES_TARGET_NOT_FOUND"));
});

test("in-memory ledger rejects supersession if correction_category is missing", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const initialPacket = createSyntheticCycle({ cycle_id: "cyc_orig", disposition: "PROPOSAL" });
  ledger.appendCycle(validateHourlyShadowCycle(initialPacket).cycle, 0);

  const correctionPacket = createSyntheticCycle({
    cycle_id: "cyc_corr",
    supersedes_ref: "cyc_orig",
    correction_category: null,
  });
  const val = validateHourlyShadowCycle(correctionPacket);
  const res = ledger.appendCycle(val.cycle, 1);
  assert.equal(res.status, "HOLD");
  assert.ok(res.hold_codes.includes("CORRECTION_CATEGORY_REQUIRED"));
});

test("in-memory ledger filters inspectProject by asOf timestamp", () => {
  const ledger = createInMemoryProjectDecisionLedger();

  const p1 = createSyntheticCycle({
    cycle_id: "cyc_1",
    occurred_at: "2026-08-21T10:00:00.000+09:00",
    observed_at: "2026-08-21T10:01:00.000+09:00",
    kst_cutoff: "2026-08-21T10:00:00.000+09:00",
  });
  const p2 = createSyntheticCycle({
    cycle_id: "cyc_2",
    occurred_at: "2026-08-21T12:00:00.000+09:00",
    observed_at: "2026-08-21T12:01:00.000+09:00",
    kst_cutoff: "2026-08-21T12:00:00.000+09:00",
    trigger_identity: "trg_2",
  });

  ledger.appendCycle(validateHourlyShadowCycle(p1).cycle, 0);
  ledger.appendCycle(validateHourlyShadowCycle(p2).cycle, 1);

  const full = ledger.inspectProject("P01-001").capsule;
  assert.equal(full.record_count, 2);

  const asOf11 = ledger.inspectProject("P01-001", "2026-08-21T11:00:00.000+09:00").capsule;
  assert.equal(asOf11.record_count, 1);
  assert.equal(asOf11.latest_cycle_id, "cyc_1");
});

// ---------------------------------------------------------------------------
// 3. Portfolio Decision Projection
// ---------------------------------------------------------------------------

test("buildPortfolioDecisionProjection creates typed summary from project capsules", () => {
  const ledger = createInMemoryProjectDecisionLedger();

  const p1 = createSyntheticCycle({ project_ref: "P01-001", cycle_id: "cyc_1", disposition: "PROPOSAL" });
  const p2 = createSyntheticCycle({ project_ref: "P02-002", cycle_id: "cyc_2", disposition: "NO_ACTION" });

  ledger.appendCycle(validateHourlyShadowCycle(p1).cycle, 0);
  ledger.appendCycle(validateHourlyShadowCycle(p2).cycle, 0);

  const cap1 = ledger.inspectProject("P01-001", null).capsule;
  const cap2 = ledger.inspectProject("P02-002", null).capsule;

  const result = buildPortfolioDecisionProjection([cap1, cap2]);
  assert.equal(result.status, "PROJECTED");
  assert.deepEqual(result.hold_codes, []);
  const projection = result.projection;
  assert.equal(projection.project_count, 2);
  assert.equal(projection.as_of, null);
  assert.deepEqual(projection.projects, ["P01-001", "P02-002"]);
  assert.equal(projection.portfolio_disposition_counts.PROPOSAL, 1);
  assert.equal(projection.portfolio_disposition_counts.NO_ACTION, 1);
  assert.equal(projection.total_proposals, 1);
  assert.equal(Object.hasOwn(projection, "coverage_health"), false);
});

test("buildPortfolioDecisionProjection handles empty capsule array", () => {
  const result = buildPortfolioDecisionProjection([]);
  assert.equal(result.status, "PROJECTED");
  assert.deepEqual(result.hold_codes, []);
  const projection = result.projection;
  assert.equal(projection.as_of, null);
  assert.equal(projection.project_count, 0);
  assert.deepEqual(projection.projects, []);
  assert.equal(projection.total_proposals, 0);
  assert.equal(projection.total_holds, 0);
});

test("buildPortfolioDecisionProjection rejects duplicate projects in input capsules", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const p1 = createSyntheticCycle({ project_ref: "P01-001" });
  ledger.appendCycle(validateHourlyShadowCycle(p1).cycle, 0);
  const cap1 = ledger.inspectProject("P01-001").capsule;
  const duplicate = buildPortfolioDecisionProjection([cap1, cap1]);
  assert.deepEqual(duplicate, { status: "HOLD", hold_codes: ["DUPLICATE_PROJECT_IN_PORTFOLIO"], projection: null });
});

// ---------------------------------------------------------------------------
// 4. ShadowEvaluator
// ---------------------------------------------------------------------------

test("evaluateShadowCycle evaluates live-only cycle and separates outcomes", () => {
  const packet = createSyntheticCycle();
  const val = validateHourlyShadowCycle(packet);

  const humanVerdict = {
    verdict: "ACCEPT",
    adjudicated_at: "2026-08-21T21:30:00.000+09:00",
  };
  const laterOutcome = {
    actual_need: "ACTIONABLE",
    task_created: true,
    outcome_at: "2026-08-21T22:00:00.000+09:00",
  };

  const evaluation = evaluateShadowCycle(val.cycle, humanVerdict, laterOutcome);
  assert.equal(evaluation.status, "EVALUATED");
  assert.deepEqual(evaluation.hold_codes, []);
  assert.equal(evaluation.quality_receipt.reasoning_outcome, "TRUE_POSITIVE");
  assert.equal(evaluation.quality_receipt.error_classification, "NO_ERROR");
  assert.deepEqual(evaluation.quality_receipt.contract_invariants, {
    required_source_manifest_held: true,
    live_only_context_held: true,
    a0_zero_effect_held: true,
    hostile_marker_free_held: true,
  });
  assert.equal(evaluation.quality_receipt.metrics.precision_eligible, true);
  assert.equal(evaluation.quality_receipt.metrics.precision_hit, true);
  assert.equal(evaluation.quality_receipt.metrics.recall_eligible, true);
  assert.equal(evaluation.quality_receipt.metrics.recall_hit, true);
});

test("contract blocks required-source retrieval gaps before evaluator scoring", () => {
  const coverageGapPacket = createSyntheticCycle({
    source_reads: createSyntheticCycle().source_reads.map((sourceRead) => (
      sourceRead.source === "gmail"
        ? { ...sourceRead, status: "partial", cursor_before: "1", cursor_after: "2", count: 1, coverage_gap: true, source_refs: [] }
        : sourceRead
    )),
    disposition: "HOLD",
    why_code: "COVERAGE_GAP",
  });
  const valA = validateHourlyShadowCycle(coverageGapPacket);
  assert.equal(valA.status, "HOLD");
  assert.ok(valA.hold_codes.includes("COVERAGE_GAP"));

  const wrongReasoningPacket = createSyntheticCycle({ disposition: "NO_ACTION", why_code: "IGNORE" });
  const valB = validateHourlyShadowCycle(wrongReasoningPacket);
  const evalB = evaluateShadowCycle(
    valB.cycle,
    { verdict: "REJECT" },
    { actual_need: "ACTIONABLE" },
    { evaluated_at: null },
  );
  assert.equal(evalB.quality_receipt.reasoning_outcome, "FALSE_NEGATIVE");
  assert.equal(evalB.quality_receipt.error_classification, "REASONING_MISS");
});

test("evaluateShadowCycle classifies correction verdicts as POLICY_AMBIGUITY", () => {
  const packet = createSyntheticCycle({ disposition: "PROPOSAL" });
  const val = validateHourlyShadowCycle(packet);
  const evaluation = evaluateShadowCycle(
    val.cycle,
    { verdict: "CORRECT", correction_category: "TAXONOMY_CORRECTION" },
    null,
  );
  assert.equal(evaluation.quality_receipt.reasoning_outcome, "CORRECTED");
  assert.equal(evaluation.quality_receipt.error_classification, "POLICY_AMBIGUITY");
});

test("contract rejects non-live context before evaluator receives a branded cycle", () => {
  const result = validateHourlyShadowCycle(createSyntheticCycle({ context_mode: "accepted_context" }));
  assert.deepEqual(result, { status: "HOLD", hold_codes: ["ACCEPTED_CONTEXT_NOT_SUPPORTED"], cycle: null });
});

test("contract rejects a nonzero A0 effect before evaluator receives a branded cycle", () => {
  const result = validateHourlyShadowCycle(createSyntheticCycle({
    effect_counters: {
      linear_mutations: 1,
      gmail_sends: 0,
      slack_posts: 0,
      calendar_mutations: 0,
      drive_mutations: 0,
      external_calls: 0,
    },
  }));
  assert.deepEqual(result, { status: "HOLD", hold_codes: ["A0_EFFECT_INVARIANT_VIOLATED"], cycle: null });
});

test("contract rejects cross-project contamination before evaluator receives a branded cycle", () => {
  const result = validateHourlyShadowCycle(createSyntheticCycle({
    hostile_markers: ["cross_project_contamination"],
  }));
  assert.deepEqual(result, { status: "HOLD", hold_codes: ["CROSS_PROJECT_CONTAMINATION"], cycle: null });
});

// ---------------------------------------------------------------------------
// 5. VF-2/VF-3 repair regressions
// ---------------------------------------------------------------------------

test("contract requires the exact A0 effect counter shape and safe integer values", () => {
  const invalidCounters = [
    { linear_mutations: 0, gmail_sends: 0, slack_posts: 0, calendar_mutations: 0, drive_mutations: 0 },
    { linear_mutations: 0, gmail_sends: 0, slack_posts: 0, calendar_mutations: 0, drive_mutations: 0, external_calls: 0, surprise: 0 },
    { linear_mutations: Number.NaN, gmail_sends: 0, slack_posts: 0, calendar_mutations: 0, drive_mutations: 0, external_calls: 0 },
    { linear_mutations: 0.5, gmail_sends: 0, slack_posts: 0, calendar_mutations: 0, drive_mutations: 0, external_calls: 0 },
  ];

  for (const effect_counters of invalidCounters) {
    const result = validateHourlyShadowCycle(createSyntheticCycle({ effect_counters }));
    assert.equal(result.status, "HOLD");
    assert.ok(result.hold_codes.includes("INVALID_EFFECT_COUNTERS"));
  }
  assert.deepEqual(EFFECT_COUNTER_KEYS, [
    "linear_mutations", "gmail_sends", "slack_posts", "calendar_mutations", "drive_mutations", "external_calls",
  ]);
});

test("contract closes packet and nested object shapes before cloning inputs", () => {
  const packet = createSyntheticCycle({ unknown_field: "not allowed" });
  const result = validateHourlyShadowCycle(packet);
  assert.equal(result.status, "HOLD");
  assert.ok(result.hold_codes.includes("UNKNOWN_PACKET_FIELD"));

  const sourceReadPacket = createSyntheticCycle({
    source_reads: [{ ...createSyntheticCycle().source_reads[0], subject: "not allowed" }],
  });
  const sourceReadResult = validateHourlyShadowCycle(sourceReadPacket);
  assert.equal(sourceReadResult.status, "HOLD");
  assert.ok(sourceReadResult.hold_codes.includes("FORBIDDEN_PAYLOAD_FIELD"));
  assert.ok(sourceReadResult.hold_codes.includes("UNKNOWN_SOURCE_READ_FIELD"));

  const cyclicPacket = createSyntheticCycle();
  cyclicPacket.untrusted = cyclicPacket;
  const cyclicResult = validateHourlyShadowCycle(cyclicPacket);
  assert.equal(cyclicResult.status, "HOLD");
  assert.ok(cyclicResult.hold_codes.includes("MALFORMED_PACKET_GRAPH"));
});

test("contract validates nullable scalar references, string arrays, timestamps, constants, and context modes", () => {
  const cases = [
    createSyntheticCycle({ task_identity: 1 }),
    createSyntheticCycle({ supersedes_ref: 1 }),
    createSyntheticCycle({ missing_context: ["missing", 1] }),
    createSyntheticCycle({ evidence_refs: ["evidence", 1] }),
    createSyntheticCycle({ hostile_markers: [1] }),
    createSyntheticCycle({ occurred_at: "not-a-timestamp" }),
    createSyntheticCycle({ policy_ref: "another-policy" }),
    createSyntheticCycle({ output_schema_ref: "another-schema" }),
    createSyntheticCycle({ context_mode: "accepted_context" }),
  ];

  for (const packet of cases) {
    assert.equal(validateHourlyShadowCycle(packet).status, "HOLD");
  }
  assert.deepEqual(CONTEXT_MODES, ["live_only"]);
});

test("source-read validators fail independently while pinned required sources remain valid", () => {
  const mutateOptionalSource = (mutate) => createSyntheticCycle().source_reads.map((sourceRead) => (
    sourceRead.source === "slack" ? mutate(sourceRead) : sourceRead
  ));
  const cases = [
    ["INVALID_SOURCE_CURSOR", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, cursor_before: 1 }))],
    ["INVALID_SOURCE_READ_COUNT", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, count: 1.5 }))],
    ["INVALID_SOURCE_REFS", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, source_refs: ["ok", 1] }))],
    ["INVALID_SOURCE_NAME", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, source: "" }))],
    ["INVALID_SOURCE_STATUS", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, status: "unknown" }))],
    ["INVALID_SOURCE_LATEST_TIME", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, latest_time: "not-a-timestamp" }))],
    ["INVALID_SOURCE_COVERAGE_GAP", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, coverage_gap: 1 }))],
    ["INVALID_SOURCE_REQUIRED", () => mutateOptionalSource((sourceRead) => ({ ...sourceRead, required: "false" }))],
    ["INVALID_SOURCE_READ_ENTRY", () => mutateOptionalSource(() => null)],
  ];

  for (const [expectedCode, makeSourceReads] of cases) {
    const result = validateHourlyShadowCycle(createSyntheticCycle({ source_reads: makeSourceReads() }));
    assert.deepEqual(result, { status: "HOLD", hold_codes: [expectedCode], cycle: null });
  }
});

test("contract has a closed hostile-marker vocabulary and does not freeze or alias caller input", () => {
  const unknown = validateHourlyShadowCycle(createSyntheticCycle({ hostile_markers: ["future_marker"] }));
  assert.equal(unknown.status, "HOLD");
  assert.ok(unknown.hold_codes.includes(UNKNOWN_HOSTILE_MARKER));

  const malformed = validateHourlyShadowCycle(createSyntheticCycle({ hostile_markers: [""] }));
  assert.equal(malformed.status, "HOLD");
  assert.ok(malformed.hold_codes.includes("MALFORMED_HOSTILE_MARKER"));

  const input = createSyntheticCycle();
  const valid = validateHourlyShadowCycle(input);
  assert.equal(valid.status, "VALIDATED");
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.source_reads[0]), false);
  input.source_reads[0].source_refs.push("later-input-change");
  assert.equal(valid.cycle.source_reads[0].source_refs.includes("later-input-change"), false);
});

test("coverage gaps only apply to required sources and MANAGER_DECISION remains valid with full coverage", () => {
  const optionalUnavailable = validateHourlyShadowCycle(createSyntheticCycle({
    source_reads: createSyntheticCycle().source_reads.map((sourceRead) => (
      sourceRead.source === "slack" ? { ...sourceRead, status: "unavailable", coverage_gap: true } : sourceRead
    )),
    disposition: "PROPOSAL",
  }));
  assert.equal(optionalUnavailable.status, "VALIDATED");

  const managerDecision = validateHourlyShadowCycle(createSyntheticCycle({
    disposition: "MANAGER_DECISION",
    why_code: "OWNER_DECISION_REQUIRED",
  }));
  assert.equal(managerDecision.status, "VALIDATED");

  const blockedManagerDecision = validateHourlyShadowCycle(createSyntheticCycle({
    source_reads: createSyntheticCycle().source_reads.map((sourceRead) => (
      sourceRead.source === "gmail" ? { ...sourceRead, status: "unavailable", coverage_gap: true } : sourceRead
    )),
    disposition: "MANAGER_DECISION",
  }));
  assert.equal(blockedManagerDecision.status, "HOLD");
  assert.ok(blockedManagerDecision.hold_codes.includes("COVERAGE_REQUIRES_HOLD"));
});

test("contract rejects a non-manifest source declared as required", () => {
  const result = validateHourlyShadowCycle(createSyntheticCycle({
    source_reads: createSyntheticCycle().source_reads.map((sourceRead) => (
      sourceRead.source === "slack" ? { ...sourceRead, required: true } : sourceRead
    )),
  }));
  assert.equal(result.status, "HOLD");
  assert.ok(result.hold_codes.includes("SOURCE_REQUIRED_MISMATCH"));
});

test("ledger only accepts contract-branded cycles and exposes chained cycle digests", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const validation = validateHourlyShadowCycle(createSyntheticCycle());
  assert.equal(ledger.appendCycle({ ...validation.cycle }, 0).status, "HOLD");

  const first = ledger.appendCycle(validation.cycle, 0);
  const secondValidation = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_digest_2",
    trigger_identity: "trg_digest_2",
    trigger_digest: "2222222222222222222222222222222222222222222222222222222222222222",
  }));
  const second = ledger.appendCycle(secondValidation.cycle, 1);
  assert.equal(first.status, "APPENDED");
  assert.equal(second.status, "APPENDED");
  assert.match(first.receipt.cycle_sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.receipt.prev_record_digest, null);
  assert.equal(second.receipt.prev_record_digest, first.receipt.record_digest);
  assert.notEqual(second.receipt.record_digest, first.receipt.record_digest);
  assert.deepEqual(second.hold_codes, []);
  assert.equal(second.receipt.next_cursor, 2);
});

test("ledger isolates cycle identifiers by project, rejects project duplicates, and removes superseded proposals", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const first = validateHourlyShadowCycle(createSyntheticCycle({ cycle_id: "cyc_shared" }));
  const otherProject = validateHourlyShadowCycle(createSyntheticCycle({
    project_ref: "P02-002",
    cycle_id: "cyc_shared",
    trigger_identity: "trg_other_project",
    trigger_digest: "3333333333333333333333333333333333333333333333333333333333333333",
  }));
  assert.equal(ledger.appendCycle(first.cycle, 0).status, "APPENDED");
  assert.equal(ledger.appendCycle(otherProject.cycle, 0).status, "APPENDED");

  const duplicate = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_shared",
    trigger_identity: "trg_duplicate",
    trigger_digest: "4444444444444444444444444444444444444444444444444444444444444444",
  }));
  const duplicateResult = ledger.appendCycle(duplicate.cycle, 1);
  assert.equal(duplicateResult.status, "HOLD");
  assert.ok(duplicateResult.hold_codes.includes("DUPLICATE_CYCLE_ID"));

  const correction = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_shared_correction",
    trigger_identity: "trg_correction",
    trigger_digest: "5555555555555555555555555555555555555555555555555555555555555555",
    disposition: "HOLD",
    why_code: "EVIDENCE_INSUFFICIENT",
    supersedes_ref: "cyc_shared",
    correction_category: "TAXONOMY_CORRECTION",
  }));
  assert.equal(ledger.appendCycle(correction.cycle, 1).status, "APPENDED");
  const capsule = ledger.inspectProject("P01-001", "2026-08-21T23:00:00.000+09:00").capsule;
  assert.equal(capsule.active_proposals.length, 0);
  assert.equal(capsule.superseded_record_count, 1);
  assert.equal(Object.values(capsule.hold_why_code_counts).reduce((sum, count) => sum + count, 0), capsule.disposition_counts.HOLD);
});

test("ledger is deterministic without a clock and chooses latest records by observed_at then cursor", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const later = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_later",
    observed_at: "2026-08-21T23:00:00.000+09:00",
  }));
  const earlier = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_earlier",
    trigger_identity: "trg_earlier",
    trigger_digest: "6666666666666666666666666666666666666666666666666666666666666666",
    observed_at: "2026-08-21T22:00:00.000+09:00",
  }));
  ledger.appendCycle(later.cycle, 0);
  ledger.appendCycle(earlier.cycle, 1);
  const withoutAsOf = ledger.inspectProject("P01-001").capsule;
  assert.equal(withoutAsOf.as_of, null);
  assert.equal(withoutAsOf.latest_cycle_id, "cyc_later");
  assert.deepEqual(
    ledger.inspectProject("P01-001", "not-a-timestamp"),
    { status: "HOLD", hold_codes: ["INVALID_AS_OF"], capsule: null },
  );
});

test("portfolio consumes only exact typed capsules, uses null-prototype grouping, and reconciles holds", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const proposal = validateHourlyShadowCycle(createSyntheticCycle({ project_ref: "P01-001", cycle_id: "cyc_portfolio_1" }));
  const held = validateHourlyShadowCycle(createSyntheticCycle({
    project_ref: "constructor",
    cycle_id: "cyc_portfolio_2",
    trigger_identity: "trg_portfolio_2",
    trigger_digest: "7777777777777777777777777777777777777777777777777777777777777777",
    disposition: "HOLD",
    why_code: "MISSING_EVIDENCE",
  }));
  ledger.appendCycle(proposal.cycle, 0);
  ledger.appendCycle(held.cycle, 0);
  const result = buildPortfolioDecisionProjection([
    ledger.inspectProject("P01-001", "2026-08-21T23:00:00.000+09:00").capsule,
    ledger.inspectProject("constructor", "2026-08-21T23:00:00.000+09:00").capsule,
  ]);
  assert.equal(result.status, "PROJECTED");
  const projection = result.projection;
  assert.equal(Object.getPrototypeOf(projection.proposals_by_project), null);
  assert.equal(projection.proposals_by_project.constructor, 0);
  assert.equal(Object.values(projection.hold_why_code_counts).reduce((sum, count) => sum + count, 0), projection.total_holds);
  assert.equal(Object.isFrozen(projection.active_proposals_summary), true);
  assert.deepEqual(
    buildPortfolioDecisionProjection([{ project_ref: "P01-001" }]),
    { status: "HOLD", hold_codes: ["INVALID_CAPSULE_PROVENANCE"], projection: null },
  );
});

test("evaluator requires a branded cycle and reports pending verdicts with contract invariants", () => {
  const validation = validateHourlyShadowCycle(createSyntheticCycle());
  const bare = evaluateShadowCycle({ ...validation.cycle });
  assert.equal(bare.status, "HOLD");
  assert.ok(bare.hold_codes.includes("INVALID_VALIDATED_CYCLE"));

  const pending = evaluateShadowCycle(validation.cycle, null, { actual_need: "NO_ACTION" }, { evaluated_at: null });
  assert.equal(pending.status, "EVALUATED");
  assert.equal(pending.quality_receipt.reasoning_outcome, "PENDING_VERDICT");
  assert.equal(pending.quality_receipt.metrics.precision_eligible, false);
  assert.equal(pending.quality_receipt.metrics.recall_eligible, false);
  assert.equal(pending.quality_receipt.contract_invariants.a0_zero_effect_held, true);
  assert.equal(pending.quality_receipt.contract_invariants.required_source_manifest_held, true);
});

test("evaluator uses human ground truth for recall, separates observed outcomes, and reports contradictions", () => {
  const proposal = validateHourlyShadowCycle(createSyntheticCycle());
  const contradiction = evaluateShadowCycle(
    proposal.cycle,
    { verdict: "ACCEPT", adjudicated_at: "2026-08-21T21:30:00.000+09:00" },
    { actual_need: "NO_ACTION", outcome_at: "2026-08-21T22:00:00.000+09:00" },
    { evaluated_at: "2026-08-21T23:00:00.000+09:00" },
  );
  assert.equal(contradiction.quality_receipt.reasoning_outcome, "TRUE_POSITIVE");
  assert.equal(contradiction.quality_receipt.error_classification, "CONTRADICTORY_EVIDENCE");
  assert.equal(contradiction.quality_receipt.human_outcome, "ACTIONABLE");
  assert.equal(contradiction.quality_receipt.observed_outcome, "NO_ACTION");

  const noAction = validateHourlyShadowCycle(createSyntheticCycle({ disposition: "NO_ACTION", why_code: "IGNORE" }));
  const falseNegative = evaluateShadowCycle(
    noAction.cycle,
    { verdict: "REJECT", adjudicated_at: "2026-08-21T21:30:00.000+09:00" },
    { actual_need: "NO_ACTION" },
    { evaluated_at: null },
  );
  assert.equal(falseNegative.quality_receipt.reasoning_outcome, "FALSE_NEGATIVE");
  assert.equal(falseNegative.quality_receipt.metrics.recall_eligible, true);
  assert.equal(falseNegative.quality_receipt.metrics.recall_hit, false);
  assert.equal(falseNegative.quality_receipt.dimension_keys.per_source.length, 3);
  assert.equal(falseNegative.quality_receipt.dimension_keys.aggregate, JSON.stringify(["aggregate", "P01-001", "artifact_draft"]));
  assert.equal(Object.isFrozen(falseNegative.quality_receipt), true);
});

test("returned receipts and capsules are deeply immutable, with false-positive and NO_ACTION pending semantics", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const proposal = validateHourlyShadowCycle(createSyntheticCycle());
  const append = ledger.appendCycle(proposal.cycle, 0);
  const capsule = ledger.inspectProject("P01-001", "2026-08-21T23:00:00.000+09:00").capsule;
  const result = buildPortfolioDecisionProjection([capsule]);
  const projection = result.projection;
  assert.equal(Object.isFrozen(append), true);
  assert.equal(Object.isFrozen(append.receipt), true);
  assert.equal(Object.isFrozen(capsule), true);
  assert.equal(Object.isFrozen(capsule.source_coverage_summary), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(projection), true);

  const falsePositive = evaluateShadowCycle(
    proposal.cycle,
    { verdict: "REJECT", adjudicated_at: "2026-08-21T21:30:00.000+09:00" },
    null,
    { evaluated_at: null },
  );
  assert.equal(falsePositive.quality_receipt.reasoning_outcome, "FALSE_POSITIVE");
  assert.equal(falsePositive.quality_receipt.metrics.precision_eligible, true);
  assert.equal(falsePositive.quality_receipt.metrics.precision_hit, false);

  const noAction = validateHourlyShadowCycle(createSyntheticCycle({ disposition: "NO_ACTION", why_code: "IGNORE" }));
  const pendingNoAction = evaluateShadowCycle(noAction.cycle, null, { actual_need: "ACTIONABLE" }, { evaluated_at: null });
  assert.equal(pendingNoAction.quality_receipt.reasoning_outcome, "PENDING_VERDICT");
  assert.equal(pendingNoAction.quality_receipt.metrics.recall_eligible, false);
});

// ---------------------------------------------------------------------------
// 6. Second-review regressions: cursor, manifest, bounded values, envelopes
// ---------------------------------------------------------------------------

test("ledger NO_OP and REPLAY receipts return the current append cursor", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const firstCycle = validateHourlyShadowCycle(createSyntheticCycle({ cycle_id: "cyc_cursor_1" }));
  const first = ledger.appendCycle(firstCycle.cycle, 0);
  const noOpCycle = validateHourlyShadowCycle(createSyntheticCycle({ cycle_id: "cyc_cursor_noop" }));
  const noOp = ledger.appendCycle(noOpCycle.cycle, first.receipt.next_cursor);
  assert.equal(noOp.status, "NO_OP");
  assert.deepEqual(noOp.hold_codes, []);
  assert.equal(noOp.receipt.next_cursor, 1);

  const nextCycle = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_cursor_2",
    trigger_identity: "trg_cursor_2",
    trigger_digest: "8888888888888888888888888888888888888888888888888888888888888888",
  }));
  const appended = ledger.appendCycle(nextCycle.cycle, noOp.receipt.next_cursor);
  assert.equal(appended.status, "APPENDED");
  assert.equal(appended.receipt.cursor, 1);

  const replay = ledger.appendCycle(firstCycle.cycle, appended.receipt.next_cursor);
  assert.equal(replay.status, "REPLAY");
  assert.equal(replay.receipt.cursor, 0);
  assert.equal(replay.receipt.next_cursor, 2);
});

test("contract pins its policy-versioned required source manifest and rejects omissions, optional declarations, and duplicates", () => {
  assert.equal(REQUIRED_SOURCE_MANIFEST.policy_ref, HOURLY_SHADOW_POLICY_REVISION);
  assert.deepEqual(REQUIRED_SOURCE_MANIFEST.required_sources, ["gmail", "linear"]);

  const missing = validateHourlyShadowCycle(createSyntheticCycle({
    source_reads: createSyntheticCycle().source_reads.filter((sourceRead) => sourceRead.source !== "linear"),
  }));
  assert.equal(missing.status, "HOLD");
  assert.ok(missing.hold_codes.includes("MISSING_REQUIRED_SOURCE"));

  const optionalRequiredSource = validateHourlyShadowCycle(createSyntheticCycle({
    source_reads: createSyntheticCycle().source_reads.map((sourceRead) => (
      sourceRead.source === "gmail" ? { ...sourceRead, required: false } : sourceRead
    )),
  }));
  assert.equal(optionalRequiredSource.status, "HOLD");
  assert.ok(optionalRequiredSource.hold_codes.includes("MISSING_REQUIRED_SOURCE"));

  const duplicate = validateHourlyShadowCycle(createSyntheticCycle({
    source_reads: [...createSyntheticCycle().source_reads, { ...createSyntheticCycle().source_reads[0] }],
  }));
  assert.equal(duplicate.status, "HOLD");
  assert.ok(duplicate.hold_codes.includes("DUPLICATE_SOURCE_READ"));
});

test("contract bounds and closes public tokens, refs, arrays, and summaries", () => {
  const cases = [
    [createSyntheticCycle({ why_code: "free form rationale" }), "INVALID_WHY_CODE"],
    [createSyntheticCycle({ task_type: "unknown_task_type" }), "INVALID_TASK_TYPE"],
    [createSyntheticCycle({ correction_category: "OTHER" }), "INVALID_CORRECTION_CATEGORY"],
    [createSyntheticCycle({ task_identity: "not a safe identity" }), "INVALID_TASK_IDENTITY"],
    [createSyntheticCycle({ evidence_refs: ["x".repeat(129)] }), "INVALID_EVIDENCE_REFS"],
    [createSyntheticCycle({ missing_context: Array.from({ length: 33 }, (_, index) => `ctx_${index}`) }), "INVALID_MISSING_CONTEXT"],
    [createSyntheticCycle({ short_summary: "x".repeat(241) }), "INVALID_SHORT_SUMMARY"],
  ];
  for (const [packet, expectedCode] of cases) {
    const result = validateHourlyShadowCycle(packet);
    assert.equal(result.status, "HOLD");
    assert.ok(result.hold_codes.includes(expectedCode));
  }
});

test("contract uses strict ISO timestamps and rejects invalid temporal ordering", () => {
  const noZone = validateHourlyShadowCycle(createSyntheticCycle({ occurred_at: "2026-08-21T21:00:00" }));
  assert.equal(noZone.status, "HOLD");
  assert.deepEqual(noZone.hold_codes, ["INVALID_OCCURRED_AT"]);

  const occurredAfterObserved = validateHourlyShadowCycle(createSyntheticCycle({
    occurred_at: "2026-08-21T22:00:00.000+09:00",
  }));
  assert.equal(occurredAfterObserved.status, "HOLD");
  assert.deepEqual(occurredAfterObserved.hold_codes, ["OCCURRED_AFTER_OBSERVED", "KST_CUTOFF_BEFORE_OCCURRED"]);

  const cutoffAfterObserved = validateHourlyShadowCycle(createSyntheticCycle({
    kst_cutoff: "2026-08-21T22:00:00.000+09:00",
  }));
  assert.equal(cutoffAfterObserved.status, "HOLD");
  assert.deepEqual(cutoffAfterObserved.hold_codes, ["KST_CUTOFF_AFTER_OBSERVED"]);
});

test("evaluator reports contract invariants rather than unreachable coverage or effect quality", () => {
  const cycle = validateHourlyShadowCycle(createSyntheticCycle());
  const evaluation = evaluateShadowCycle(
    cycle.cycle,
    { verdict: "ACCEPT", adjudicated_at: "2026-08-21T21:30:00.000+09:00" },
    null,
    { evaluated_at: null },
  );
  assert.equal(evaluation.status, "EVALUATED");
  assert.deepEqual(evaluation.hold_codes, []);
  assert.deepEqual(evaluation.quality_receipt.contract_invariants, {
    required_source_manifest_held: true,
    live_only_context_held: true,
    a0_zero_effect_held: true,
    hostile_marker_free_held: true,
  });
  assert.equal(Object.hasOwn(evaluation.quality_receipt, "retrieval_outcome"), false);
  assert.equal(Object.hasOwn(evaluation.quality_receipt.metrics, "zero_effect_clean"), false);
  assert.equal(Object.hasOwn(evaluation, "reasoning_outcome"), false);
});

test("dimension keys are canonical tuples with explicit aggregate and per-source scopes", () => {
  const cycle = validateHourlyShadowCycle(createSyntheticCycle());
  const evaluation = evaluateShadowCycle(cycle.cycle, { verdict: "ACCEPT" });
  assert.equal(evaluation.quality_receipt.dimension_keys.aggregate, JSON.stringify(["aggregate", "P01-001", "artifact_draft"]));
  assert.deepEqual(evaluation.quality_receipt.dimension_keys.per_source, [
    JSON.stringify(["per_source", "P01-001", "artifact_draft", "gmail"]),
    JSON.stringify(["per_source", "P01-001", "artifact_draft", "linear"]),
    JSON.stringify(["per_source", "P01-001", "artifact_draft", "slack"]),
  ]);
});

test("inspection and portfolio data faults use HOLD envelopes and require one shared as_of horizon", () => {
  const ledger = createInMemoryProjectDecisionLedger();
  const cycleOne = validateHourlyShadowCycle(createSyntheticCycle({ cycle_id: "cyc_horizon_1" }));
  const cycleTwo = validateHourlyShadowCycle(createSyntheticCycle({
    project_ref: "P02-002",
    cycle_id: "cyc_horizon_2",
    trigger_identity: "trg_horizon_2",
    trigger_digest: "9999999999999999999999999999999999999999999999999999999999999999",
  }));
  ledger.appendCycle(cycleOne.cycle, 0);
  ledger.appendCycle(cycleTwo.cycle, 0);
  const invalidInspection = ledger.inspectProject("", null);
  assert.deepEqual(invalidInspection, { status: "HOLD", hold_codes: ["INVALID_PROJECT_REF"], capsule: null });

  const first = ledger.inspectProject("P01-001", "2026-08-21T22:00:00.000+09:00");
  const second = ledger.inspectProject("P02-002", "2026-08-21T23:00:00.000+09:00");
  const mixed = buildPortfolioDecisionProjection([first.capsule, second.capsule]);
  assert.equal(mixed.status, "HOLD");
  assert.deepEqual(mixed.hold_codes, ["MIXED_AS_OF_HORIZON"]);
  assert.equal(mixed.projection, null);
  assert.throws(() => buildPortfolioDecisionProjection(null), /INVALID_CAPSULES_ARRAY/);
});

test("scanner is bounded, cycle-safe, and still scans unknown top-level graphs before rejecting them", () => {
  const unknownGraph = createSyntheticCycle({ untrusted: { body: "forbidden nested payload" } });
  const unknownResult = validateHourlyShadowCycle(unknownGraph);
  assert.equal(unknownResult.status, "HOLD");
  assert.ok(unknownResult.hold_codes.includes("UNKNOWN_PACKET_FIELD"));
  assert.ok(unknownResult.hold_codes.includes("FORBIDDEN_PAYLOAD_FIELD"));

  const deepRef = [];
  let current = deepRef;
  for (let index = 0; index < 14; index += 1) {
    const next = [];
    current.push(next);
    current = next;
  }
  const deepPacket = createSyntheticCycle({
    source_reads: [{ ...createSyntheticCycle().source_reads[0], source_refs: deepRef }],
  });
  const deepResult = validateHourlyShadowCycle(deepPacket);
  assert.equal(deepResult.status, "HOLD");
  assert.ok(deepResult.hold_codes.includes("MALFORMED_PACKET_GRAPH"));

  const widePacket = createSyntheticCycle({
    source_reads: [{ ...createSyntheticCycle().source_reads[0], source_refs: Array.from({ length: 300 }, () => ({})) }],
  });
  const wideResult = validateHourlyShadowCycle(widePacket);
  assert.equal(wideResult.status, "HOLD");
  assert.ok(wideResult.hold_codes.includes("MALFORMED_PACKET_GRAPH"));
});

test("evaluator input envelopes are closed and ledger capsules carry a three-record head digest", () => {
  const cycle = validateHourlyShadowCycle(createSyntheticCycle());
  const malformedHuman = evaluateShadowCycle(cycle.cycle, { verdict: "ACCEPT", typo: true });
  assert.deepEqual(malformedHuman, { status: "HOLD", hold_codes: ["INVALID_HUMAN_VERDICT_FIELDS"], quality_receipt: null });
  const malformedOutcome = evaluateShadowCycle(cycle.cycle, null, { actualNeed: "ACTIONABLE" });
  assert.deepEqual(malformedOutcome, { status: "HOLD", hold_codes: ["INVALID_LATER_OUTCOME_FIELDS"], quality_receipt: null });
  const malformedOptions = evaluateShadowCycle(cycle.cycle, null, null, { evaluatedAt: null });
  assert.deepEqual(malformedOptions, { status: "HOLD", hold_codes: ["INVALID_EVALUATION_OPTIONS_FIELDS"], quality_receipt: null });

  const ledger = createInMemoryProjectDecisionLedger();
  const first = ledger.appendCycle(cycle.cycle, 0);
  const secondCycle = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_chain_2",
    trigger_identity: "trg_chain_2",
    trigger_digest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }));
  const second = ledger.appendCycle(secondCycle.cycle, first.receipt.next_cursor);
  const thirdCycle = validateHourlyShadowCycle(createSyntheticCycle({
    cycle_id: "cyc_chain_3",
    trigger_identity: "trg_chain_3",
    trigger_digest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  }));
  const third = ledger.appendCycle(thirdCycle.cycle, second.receipt.next_cursor);
  const inspection = ledger.inspectProject("P01-001", null);
  assert.equal(inspection.status, "INSPECTED");
  assert.equal(inspection.capsule.next_cursor, 3);
  assert.equal(inspection.capsule.head_record_digest, third.receipt.record_digest);
  assert.equal(third.receipt.prev_record_digest, second.receipt.record_digest);
});

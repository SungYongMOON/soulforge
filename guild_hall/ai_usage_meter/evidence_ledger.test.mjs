import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  AI_QUALITY_RESULT_SCHEMA,
  AI_TOOL_EVENT_SCHEMA,
  AI_USAGE_REPLAY_RECEIPT_SCHEMA,
  AI_WORK_RUN_SCHEMA,
  loadAiUsageReplayReceipts,
  loadEvidenceEvents,
  persistAiQualityResult,
  persistAiToolEvent,
  persistAiUsageReplayReceipt,
  persistAiWorkRun,
  validateAiQualityResult,
  validateAiToolEvent,
  validateAiUsageReplayReceipt,
  validateAiWorkRun,
} from "./evidence_ledger.mjs";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function workRun(extra = {}) {
  return {
    schema_version: AI_WORK_RUN_SCHEMA,
    event_id: "awr.event.001",
    run_id: "run.001",
    work_id: "work.001",
    run_scope: "experiment",
    cost_role: "execution",
    variant: "candidate",
    task_class: "implementation",
    risk_class: "medium",
    experiment_id: "experiment.001",
    repo_commit: "0123456789abcdef0123456789abcdef01234567",
    launcher_version: "launcher.1.0.0",
    topology: {
      expected_max_depth: 2,
      expected_max_children: 3,
      reviewer_policy: "required",
      preflight_policy: "required",
    },
    cost_scope: {
      controller_included: true,
      executor_included: true,
      reviewer_included: true,
      offline_oracle_included: false,
    },
    work_record_ref: "work.record.event.001",
    started_at: "2026-08-03T00:00:00.000Z",
    completed_at: "2026-08-03T00:01:00.000Z",
    model_id: "gpt-5.6-sol",
    reasoning_effort: "high",
    usage_event_ids: ["aue.001"],
    instruction_manifest_ref: "aim.001",
    measurement_status: "complete",
    authority: "non_authoritative_measurement_projection",
    metadata_only: true,
    raw_prompt_copied: false,
    raw_reasoning_copied: false,
    raw_tool_payload_copied: false,
    ...extra,
  };
}

function qualityResult(extra = {}) {
  return {
    schema_version: AI_QUALITY_RESULT_SCHEMA,
    event_id: "aqr.event.001",
    result_id: "quality.001",
    run_id: "run.001",
    work_id: "work.001",
    evaluator_kind: "deterministic",
    metric_id: "tests.pass_ratio",
    score: 1,
    scale_min: 0,
    scale_max: 1,
    decision: "pass",
    evidence_refs: ["test.receipt.001", HASH_A],
    occurred_at: "2026-08-03T00:01:01.000Z",
    metadata_only: true,
    raw_prompt_copied: false,
    raw_reasoning_copied: false,
    raw_tool_payload_copied: false,
    ...extra,
  };
}

function toolEvent(extra = {}) {
  return {
    schema_version: AI_TOOL_EVENT_SCHEMA,
    event_id: "ate.event.001",
    run_id: "run.001",
    work_id: "work.001",
    tool_name: "shell_command",
    tool_class: "local_process",
    tool_call_id: "call.001",
    attempt: 1,
    timeout: false,
    retry_reason_code: null,
    preflight_receipt_id: "preflight.001",
    phase: "completed",
    occurred_at: "2026-08-03T00:00:30.000Z",
    duration_ms: 250,
    outcome: "succeeded",
    input_digest: HASH_A,
    output_digest: HASH_B,
    metadata_only: true,
    raw_prompt_copied: false,
    raw_reasoning_copied: false,
    raw_tool_payload_copied: false,
    ...extra,
  };
}

function replayReceipt(extra = {}) {
  return {
    schema_version: AI_USAGE_REPLAY_RECEIPT_SCHEMA,
    receipt_id: "replay.001",
    observed_at: "2026-08-03T00:02:00.000Z",
    parser_digest: HASH_A,
    rate_card_digest: HASH_A,
    config_digest: HASH_A,
    source_manifest_digest: HASH_A,
    source_manifest_count: 3,
    parsed_turn_count: 6,
    excluded_or_held_session_count: 1,
    explicit_work_binding_count: 2,
    lineage_edge_count: 2,
    role_binding_count: 3,
    calculated_total: 1.25,
    rate_unknown_turn_count: 0,
    ledger_content_digest_before: HASH_A,
    ledger_content_digest_after: HASH_B,
    created_count: 2,
    updated_count: 0,
    replayed_count: 4,
    pending_count: 0,
    conflict_count: 0,
    coverage: { source_count: 4, parsed_count: 4, issue_count: 0, complete: true },
    event_id_set_digest: HASH_B,
    raw_payload_copied: false,
    ...extra,
  };
}

test("Pro measurement schemas and strict validators accept only metadata projections", async () => {
  const fixtures = [
    ["ai_work_run.v1.schema.json", workRun(), validateAiWorkRun],
    ["ai_quality_result.v1.schema.json", qualityResult(), validateAiQualityResult],
    ["ai_tool_event.v1.schema.json", toolEvent(), validateAiToolEvent],
    ["ai_usage_replay_receipt.v1.schema.json", replayReceipt(), validateAiUsageReplayReceipt],
  ];
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, formats: { "date-time": true } });
  for (const [schemaName, fixture, validator] of fixtures) {
    const schema = JSON.parse(await readFile(new URL(`./${schemaName}`, import.meta.url), "utf8"));
    const validateSchema = ajv.compile(schema);
    assert.equal(validateSchema(fixture), true, JSON.stringify(validateSchema.errors));
    assert.equal(validator(fixture), fixture);
    assert.throws(() => validator({ ...fixture, raw_prompt: "forbidden" }));
  }
  assert.throws(() => validateAiWorkRun(workRun({ authority: "lifecycle_authority" })), { code: "ai_work_run_authority_invalid" });
  assert.throws(() => validateAiWorkRun(workRun({ repo_commit: "branch-name" })), { code: "ai_work_run_repo_commit_invalid" });
  assert.throws(() => validateAiToolEvent(toolEvent({ timeout: "false" })), { code: "ai_tool_event_timeout_invalid" });
  assert.throws(() => validateAiUsageReplayReceipt(replayReceipt({ raw_payload_copied: true })), { code: "ai_usage_replay_receipt_raw_payload_forbidden" });
  assert.throws(() => validateAiUsageReplayReceipt(replayReceipt({ calculated_total: -0.01 })), { code: "ai_usage_replay_receipt_calculated_total_invalid" });
  assert.throws(() => validateAiUsageReplayReceipt(replayReceipt({ coverage: { source_count: 4, parsed_count: 3, issue_count: 0, complete: true } })), { code: "ai_usage_replay_receipt_coverage_complete_invalid" });
  assert.throws(() => validateAiUsageReplayReceipt(replayReceipt({ coverage: { source_count: 3, parsed_count: 3, issue_count: 0, complete: true } })), { code: "ai_usage_replay_receipt_source_reconciliation_invalid" });
  assert.throws(() => validateAiUsageReplayReceipt(replayReceipt({ parsed_turn_count: 7 })), { code: "ai_usage_replay_receipt_turn_reconciliation_invalid" });
  assert.throws(() => validateAiUsageReplayReceipt(replayReceipt({ explicit_work_binding_count: 7 })), { code: "ai_usage_replay_receipt_turn_relation_invalid" });
  assert.throws(() => validateAiUsageReplayReceipt(replayReceipt({ ledger_content_digest_after: HASH_A })), { code: "ai_usage_replay_receipt_ledger_reconciliation_invalid" });
});

test("monthly evidence persistence is replay-safe and rejects event-id conflicts", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-ai-evidence-ledger-"));
  try {
    const concurrent = await Promise.all([
      persistAiWorkRun(state, workRun()),
      persistAiWorkRun(state, workRun()),
    ]);
    assert.deepEqual(concurrent.map((receipt) => receipt.status).sort(), ["created", "replayed"]);
    assert.equal((await persistAiQualityResult(state, qualityResult())).status, "created");
    assert.equal((await persistAiToolEvent(state, toolEvent())).status, "created");
    const replayConcurrent = await Promise.all([
      persistAiUsageReplayReceipt(state, replayReceipt()),
      persistAiUsageReplayReceipt(state, replayReceipt()),
    ]);
    assert.deepEqual(replayConcurrent.map((receipt) => receipt.status).sort(), ["created", "replayed"]);
    await assert.rejects(
      persistAiWorkRun(state, workRun({ cost_role: "rework" })),
      { code: "evidence_event_id_conflict" },
    );
    assert.equal((await loadEvidenceEvents(state, "work_run")).length, 1);
    assert.equal((await loadEvidenceEvents(state, "quality_result")).length, 1);
    assert.equal((await loadEvidenceEvents(state, "tool_event")).length, 1);
    assert.equal((await loadAiUsageReplayReceipts(state)).length, 1);
    const workReceipt = await persistAiWorkRun(state, workRun());
    assert.equal(workReceipt.path_ref, "work_runs/2026-08/awr.event.001.json");
    const replayPersistenceReceipt = await persistAiUsageReplayReceipt(state, replayReceipt());
    assert.equal(replayPersistenceReceipt.event_id, "replay.001");
    assert.equal(replayPersistenceReceipt.path_ref, "receipts/2026-08/replay.001.json");
    await assert.rejects(
      persistAiUsageReplayReceipt(state, replayReceipt({ calculated_total: 1.5 })),
      { code: "evidence_event_id_conflict" },
    );
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("evidence ledger never auto-steals an existing stale lock", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-ai-evidence-stale-lock-"));
  const lockPath = path.join(state, "evidence-ledger.lock");
  const stale = `${JSON.stringify({ pid: 2147483647, token: "stale-owner", started_at: "2000-01-01T00:00:00.000Z" })}\n`;
  try {
    await writeFile(lockPath, stale, "utf8");
    await assert.rejects(persistAiWorkRun(state, workRun()), { code: "evidence_ledger_busy" });
    assert.equal(await readFile(lockPath, "utf8"), stale);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

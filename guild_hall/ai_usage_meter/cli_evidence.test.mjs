import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "./cli.mjs";
import { loadEvidenceEvents } from "./evidence_ledger.mjs";

function workRun() {
  return {
    schema_version: "soulforge.ai_work_run.v1",
    event_id: "awr.cli.001",
    run_id: "run.cli.001",
    work_id: "work.cli.001",
    run_scope: "experiment",
    cost_role: "execution",
    variant: "control",
    task_class: "routine_file_lookup",
    risk_class: "synthetic_low",
    experiment_id: "agents_lean_01",
    repo_commit: "0123456789abcdef0123456789abcdef01234567",
    launcher_version: "cli.test.1",
    topology: {
      expected_max_depth: 1,
      expected_max_children: 1,
      reviewer_policy: "exception_only",
      preflight_policy: "required",
    },
    cost_scope: {
      controller_included: false,
      executor_included: true,
      reviewer_included: true,
      offline_oracle_included: false,
    },
    work_record_ref: null,
    started_at: "2026-08-03T00:00:00.000Z",
    completed_at: "2026-08-03T00:01:00.000Z",
    model_id: "gpt-5.6-sol",
    reasoning_effort: "xhigh",
    usage_event_ids: [],
    instruction_manifest_ref: null,
    measurement_status: "complete",
    authority: "non_authoritative_measurement_projection",
    metadata_only: true,
    raw_prompt_copied: false,
    raw_reasoning_copied: false,
    raw_tool_payload_copied: false,
  };
}

test("evidence-record validates before apply and persists only with apply", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-ai-evidence-cli-"));
  try {
    const input = path.join(root, "work-run.json");
    const state = path.join(root, "state");
    await writeFile(input, `${JSON.stringify(workRun())}\n`, "utf8");
    const dry = await runCli(["evidence-record", "--kind", "work_run", "--input", input]);
    assert.equal(dry.mode, "dry_run");
    assert.equal(dry.valid, true);
    assert.equal(dry.persistence, null);
    const applied = await runCli([
      "evidence-record", "--kind", "work_run", "--input", input,
      "--state-root", state, "--apply",
    ]);
    assert.equal(applied.persistence.status, "created");
    assert.equal((await loadEvidenceEvents(state, "work_run")).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("instruction-manifest rejects unsafe probe options before launching Codex", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-ai-manifest-cli-"));
  try {
    await writeFile(path.join(root, "AGENTS.md"), "public test instruction\n", "utf8");
    await assert.rejects(
      runCli([
        "instruction-manifest", "--cwd", root, "--repo-root", root,
        "--approved-root", root, "--model-id", "gpt-5.6-sol&unsafe",
      ]),
      { code: "instruction_probe_option_invalid" },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

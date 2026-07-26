import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOUNDED_WORK_SNAPSHOT_SCHEMA,
  HPP_LOCAL_ACTIVITY_BINDING_SCHEMA,
  collectAllProjectLocalActivity,
  normalizeHppLocalActivityBinding,
} from "./local_activity.mjs";

function fiveField(overrides = {}) {
  return {
    schema_version: "soulforge.five_field_capture.v0",
    id: "codex_demo:abc123def456",
    at: "2026-07-26T03:00:00.000Z",
    worker: "codex_gpt-5.6",
    session_ref: "codex_demo",
    project_code: "demo_project",
    request_kind: "development/local_activity",
    input_refs: ["task:demo"],
    judgment: "bounded decision",
    output: "implemented one bounded change",
    verification: "tests passed",
    stop_conditions: ["stop before live writer"],
    needs_backfill: 0,
    data_label: "ai_draft",
    ...overrides,
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-local-activity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspaces", "demo_project");
  const workmeta = path.join(root, "workmeta", "demo_project");
  const ledger = path.join(
    workmeta,
    "reports",
    "procedure_capture",
    "five_field_log.jsonl",
  );
  const state = path.join(root, "state");
  await mkdir(workspace, { recursive: true });
  await mkdir(path.dirname(ledger), { recursive: true });
  await writeFile(path.join(workspace, "design.txt"), "alpha\n", "utf8");
  await writeFile(ledger, `${JSON.stringify(fiveField())}\n`, "utf8");
  const binding = {
    schema_version: HPP_LOCAL_ACTIVITY_BINDING_SCHEMA,
    binding_id: "demo_local_activity_v1",
    node_id: "demo_tool_01",
    node_role: "tool_pc",
    state_root: state,
    projects: [{
      project_code: "demo_project",
      workspace_root: workspace,
      workmeta_root: workmeta,
      workspace_binding_id: "demo_workspace_v1",
      file_activity: {
        enabled: true,
        max_entries: 100,
        immediate_hash_bytes: 1024 * 1024,
        byte_budget: 1024 * 1024,
        cache_ttl_ms: 60_000,
      },
      bounded_work: {
        enabled: true,
        five_field_log: ledger,
      },
    }],
  };
  return { root, workspace, workmeta, ledger, state, binding };
}

test("normalization rejects duplicate projects and non-tool writer identity", async (t) => {
  const fx = await fixture(t);
  assert.throws(
    () => normalizeHppLocalActivityBinding({
      ...fx.binding,
      projects: [...fx.binding.projects, fx.binding.projects[0]],
    }),
    /binding_project_duplicate/u,
  );
  assert.throws(
    () => normalizeHppLocalActivityBinding({
      ...fx.binding,
      node_role: "always_on_node",
    }),
    /binding_node_role_invalid/u,
  );
});

test("dry-run joins one bounded work occurrence to a relation-only Codex view", async (t) => {
  const fx = await fixture(t);
  const before = await readFile(fx.ledger, "utf8");
  const result = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "0".repeat(64),
    observedAt: "2026-07-26T04:00:00.000Z",
    apply: false,
  });
  assert.equal(result.project_count, 1);
  assert.equal(result.totals.observed_file_count, 1);
  assert.equal(result.totals.exact_content_count, 1);
  assert.equal(result.totals.bounded_work_occurrence_count, 1);
  assert.equal(result.totals.codex_run_relation_count, 1);
  assert.equal(result.totals.held_project_count, 0);
  assert.equal(result.projects[0].status, "collected");
  assert.equal(result.projects[0].bounded_work.native_occurrence_count, 1);
  assert.equal(result.boundaries.workmeta_canon_mutated, false);
  assert.equal(await readFile(fx.ledger, "utf8"), before);
  await assert.rejects(readFile(path.join(fx.state, "collector.lock")));
});

test("apply writes local outbox and reuses the same bounded snapshot without double count", async (t) => {
  const fx = await fixture(t);
  const result = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "1".repeat(64),
    observedAt: "2026-07-26T04:00:00.000Z",
    apply: true,
  });
  const projectRoot = path.join(fx.state, "projects", "demo_project");
  const current = JSON.parse(
    await readFile(path.join(projectRoot, "current.json"), "utf8"),
  );
  const snapshot = JSON.parse(await readFile(
    path.join(
      projectRoot,
      "outbox",
      "bounded_work",
      `${current.bounded_work_snapshot_digest}.json`,
    ),
    "utf8",
  ));
  assert.equal(snapshot.schema_version, BOUNDED_WORK_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.native_occurrence_count, 1);
  assert.equal(snapshot.codex_run_relation_count, 1);
  assert.equal(snapshot.boundaries.same_record_double_counted, false);
  assert.equal(result.boundaries.project_timeline_mutated, false);
  const replay = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "1".repeat(64),
    observedAt: "2026-07-26T04:01:00.000Z",
    apply: true,
  });
  assert.equal(replay.totals.bounded_work_occurrence_count, 1);
});

test("same five-field id with a different full record is held", async (t) => {
  const fx = await fixture(t);
  const conflicting = fiveField({ output: "different output" });
  await writeFile(
    fx.ledger,
    `${JSON.stringify(fiveField())}\n${JSON.stringify(conflicting)}\n`,
    "utf8",
  );
  const result = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "2".repeat(64),
    observedAt: "2026-07-26T04:00:00.000Z",
    apply: false,
  });
  assert.equal(result.totals.bounded_work_occurrence_count, 0);
  assert.equal(result.totals.held_conflict_count, 1);
});

test("one held project does not prevent another exact project from collecting", async (t) => {
  const fx = await fixture(t);
  const secondWorkspace = path.join(fx.root, "workspaces", "second_project");
  const secondWorkmeta = path.join(fx.root, "workmeta", "second_project");
  const secondLedger = path.join(
    secondWorkmeta,
    "reports",
    "procedure_capture",
    "five_field_log.jsonl",
  );
  await mkdir(secondWorkspace, { recursive: true });
  await mkdir(path.dirname(secondLedger), { recursive: true });
  await writeFile(path.join(secondWorkspace, "ok.txt"), "ok\n", "utf8");
  await writeFile(secondLedger, "{broken-json}\n", "utf8");
  const result = await collectAllProjectLocalActivity({
    binding: {
      ...fx.binding,
      projects: [
        ...fx.binding.projects,
        {
          ...fx.binding.projects[0],
          project_code: "second_project",
          workspace_root: secondWorkspace,
          workmeta_root: secondWorkmeta,
          workspace_binding_id: "second_workspace_v1",
          bounded_work: {
            enabled: true,
            five_field_log: secondLedger,
          },
        },
      ],
    },
    bindingSha256: "3".repeat(64),
    observedAt: "2026-07-26T04:00:00.000Z",
    apply: false,
  });
  assert.equal(result.project_count, 2);
  assert.equal(result.totals.held_project_count, 1);
  assert.equal(result.projects.find((row) => row.project_code === "demo_project").status, "collected");
  assert.equal(result.projects.find((row) => row.project_code === "second_project").status, "held");
});

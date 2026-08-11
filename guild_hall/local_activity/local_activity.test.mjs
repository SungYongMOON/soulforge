import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOUNDED_WORK_SNAPSHOT_SCHEMA,
  FILE_ACTIVITY_DELTA_SCHEMA,
  FILE_INVENTORY_STATE_SCHEMA,
  HPP_LOCAL_ACTIVITY_BINDING_SCHEMA,
  collectAllProjectLocalActivity,
  normalizeHppLocalActivityBinding,
  validateActivityOutboxStore,
} from "./local_activity.mjs";

test("activity outbox validation is stable when only observation clocks advance", async (t) => {
  const fx = await fixture(t);
  await collectAllProjectLocalActivity({ binding: fx.binding, bindingSha256: "sha256:test", observedAt: "2026-08-11T10:00:00.000Z", apply: true });
  const first = await validateActivityOutboxStore(fx.binding);
  await collectAllProjectLocalActivity({ binding: fx.binding, bindingSha256: "sha256:test", observedAt: "2026-08-11T10:30:00.000Z", apply: true });
  const second = await validateActivityOutboxStore(fx.binding);
  assert.equal(first.lane, "store_activity_outbox");
  assert.equal(first.validation_scope, "local_activity_current_packet_index_validity");
  assert.equal(first.validation_digest, second.validation_digest);
  assert.equal(second.validated_count, 4);
});

test("activity outbox validation rejects a corrupt referenced immutable packet", async (t) => {
  const fx = await fixture(t);
  await collectAllProjectLocalActivity({ binding: fx.binding, bindingSha256: "sha256:test", observedAt: "2026-08-11T10:00:00.000Z", apply: true });
  const current = JSON.parse(await readFile(path.join(fx.state, "projects", "demo_project", "current.json"), "utf8"));
  const deltaPath = path.join(fx.state, "projects", "demo_project", "outbox", "file_activity_delta", "2026-08", `${current.file_activity_delta_digest}.json`);
  const delta = JSON.parse(await readFile(deltaPath, "utf8"));
  delta.changed_observation_count += 1;
  await writeFile(deltaPath, `${JSON.stringify(delta)}\n`, "utf8");
  await assert.rejects(() => validateActivityOutboxStore(fx.binding), { code: "activity_outbox_delta_digest_invalid" });
});

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

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
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
  assert.equal(
    snapshot.pc_work_projection[0].source_record_digest,
    "6124aebe5c18284446ea565baf7c07c99edd8e4a56b4f97fae99c1cc62736f98",
  );
  assert.equal(snapshot.pc_work_projection[0].occurred_at, "2026-07-26T03:00:00.000Z");
  assert.equal(snapshot.pc_work_projection[0].recorded_at, "2026-07-26T03:00:00.000Z");
  const inventory = JSON.parse(await readFile(
    path.join(projectRoot, "state", "file_inventory_state.json"),
    "utf8",
  ));
  assert.equal(inventory.schema_version, FILE_INVENTORY_STATE_SCHEMA);
  assert.equal(inventory.entry_count, 1);
  const firstDelta = JSON.parse(await readFile(
    path.join(
      projectRoot,
      "outbox",
      "file_activity_delta",
      "2026-07",
      `${current.file_activity_delta_digest}.json`,
    ),
    "utf8",
  ));
  assert.equal(firstDelta.schema_version, FILE_ACTIVITY_DELTA_SCHEMA);
  assert.equal(firstDelta.baseline, true);
  assert.equal(firstDelta.changed_observation_count, 1);
  assert.equal(firstDelta.unchanged_observation_count, 0);
  assert.equal(result.boundaries.project_timeline_mutated, false);
  const replay = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "1".repeat(64),
    observedAt: "2026-07-26T04:01:00.000Z",
    apply: true,
  });
  assert.equal(replay.totals.bounded_work_occurrence_count, 1);
  assert.equal(replay.totals.changed_file_observation_count, 0);
  assert.equal(replay.totals.unchanged_file_observation_count, 1);
});

test("additive five-field clocks preserve source occurrence and first record time", async (t) => {
  const fx = await fixture(t);
  await writeFile(fx.ledger, `${JSON.stringify(fiveField({
    at: "2026-07-30T03:00:00.000Z",
    occurred_at: "2026-07-27T01:00:00.000Z",
    recorded_at: "2026-07-30T03:00:00.000Z",
  }))}\n`, "utf8");
  await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "2".repeat(64),
    observedAt: "2026-07-30T04:00:00.000Z",
    apply: true,
  });
  const projectRoot = path.join(fx.state, "projects", "demo_project");
  const current = JSON.parse(await readFile(path.join(projectRoot, "current.json"), "utf8"));
  const snapshot = JSON.parse(await readFile(path.join(
    projectRoot,
    "outbox",
    "bounded_work",
    `${current.bounded_work_snapshot_digest}.json`,
  ), "utf8"));
  assert.equal(snapshot.pc_work_projection[0].occurred_at, "2026-07-27T01:00:00.000Z");
  assert.equal(snapshot.pc_work_projection[0].recorded_at, "2026-07-30T03:00:00.000Z");
});

test("additive five-field clocks reject partial pairs and legacy alias mismatch", async (t) => {
  const fx = await fixture(t);
  await writeFile(fx.ledger, `${JSON.stringify(fiveField({
    occurred_at: "2026-07-27T01:00:00.000Z",
  }))}\n`, "utf8");
  const partial = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "3".repeat(64),
    observedAt: "2026-07-30T04:00:00.000Z",
    apply: false,
  });
  assert.equal(partial.projects[0].status, "held");
  assert.equal(partial.projects[0].error_code, "five_field_clock_pair_invalid");
  await writeFile(fx.ledger, `${JSON.stringify(fiveField({
    occurred_at: "2026-07-27T01:00:00.000Z",
    recorded_at: "2026-07-30T03:00:00.000Z",
  }))}\n`, "utf8");
  const mismatch = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "3".repeat(64),
    observedAt: "2026-07-30T04:00:00.000Z",
    apply: false,
  });
  assert.equal(mismatch.projects[0].status, "held");
  assert.equal(mismatch.projects[0].error_code, "five_field_clock_contract_invalid");
});

test("file delta records changes and treats disappearance only as a candidate", async (t) => {
  const fx = await fixture(t);
  await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "4".repeat(64),
    observedAt: "2026-07-26T04:00:00.000Z",
    apply: true,
  });
  await writeFile(path.join(fx.workspace, "design.txt"), "beta\n", "utf8");
  const changed = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "4".repeat(64),
    observedAt: "2026-07-26T04:02:00.000Z",
    apply: true,
  });
  assert.equal(changed.totals.changed_file_observation_count, 1);
  const changedDigest = changed.projects[0].file_activity.delta_digest;
  const changedDelta = JSON.parse(await readFile(
    path.join(
      fx.state,
      "projects",
      "demo_project",
      "outbox",
      "file_activity_delta",
      "2026-07",
      `${changedDigest}.json`,
    ),
    "utf8",
  ));
  assert.equal(changedDelta.changed_observations[0].change_kind, "content_changed");

  await rm(path.join(fx.workspace, "design.txt"));
  const missing = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "4".repeat(64),
    observedAt: "2026-07-26T04:03:00.000Z",
    apply: true,
  });
  assert.equal(missing.totals.absence_candidate_count, 1);
  const missingDigest = missing.projects[0].file_activity.delta_digest;
  const missingDelta = JSON.parse(await readFile(
    path.join(
      fx.state,
      "projects",
      "demo_project",
      "outbox",
      "file_activity_delta",
      "2026-07",
      `${missingDigest}.json`,
    ),
    "utf8",
  ));
  assert.equal(missingDelta.absence_candidates[0].deletion_confirmed, false);
  assert.equal(missingDelta.boundaries.absence_is_deletion, false);
});

test("pending hash queue reasons do not create file-history churn", async (t) => {
  const fx = await fixture(t);
  fx.binding.projects[0].file_activity.immediate_hash_bytes = 1;
  fx.binding.projects[0].file_activity.byte_budget = 1;
  const first = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "5".repeat(64),
    observedAt: "2026-07-26T04:00:00.000Z",
    apply: true,
  });
  assert.equal(first.totals.changed_file_observation_count, 1);
  const inventory = JSON.parse(await readFile(
    path.join(
      fx.state,
      "projects",
      "demo_project",
      "state",
      "file_inventory_state.json",
    ),
    "utf8",
  ));
  assert.equal(inventory.entries[0].hash_state, "pending");

  fx.binding.projects[0].file_activity.immediate_hash_bytes = 1024;
  const replay = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "5".repeat(64),
    observedAt: "2026-07-26T04:01:00.000Z",
    apply: true,
  });
  assert.equal(replay.totals.changed_file_observation_count, 0);
  assert.equal(replay.totals.unchanged_file_observation_count, 1);

  fx.binding.projects[0].file_activity.byte_budget = 1024;
  const hashed = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "5".repeat(64),
    observedAt: "2026-07-26T04:02:00.000Z",
    apply: true,
  });
  assert.equal(hashed.totals.changed_file_observation_count, 1);
  assert.equal(hashed.projects[0].file_activity.counts.exact_content_count, 1);

  fx.binding.projects[0].file_activity.immediate_hash_bytes = 1;
  fx.binding.projects[0].file_activity.byte_budget = 1;
  const cached = await collectAllProjectLocalActivity({
    binding: fx.binding,
    bindingSha256: "5".repeat(64),
    observedAt: "2026-07-26T04:03:00.000Z",
    apply: true,
  });
  assert.equal(cached.totals.changed_file_observation_count, 0);
  assert.equal(cached.projects[0].file_activity.counts.exact_content_count, 1);
});

test("CLI recovers a stale legacy lock despite PID reuse and blocks a fresh active lock", async (t) => {
  const fx = await fixture(t);
  const bindingPath = path.join(fx.root, "binding.json");
  const bindingBytes = `${JSON.stringify(fx.binding, null, 2)}\n`;
  await writeFile(bindingPath, bindingBytes, "utf8");
  const bindingDigest = createHash("sha256").update(bindingBytes).digest("hex");
  await mkdir(fx.state, { recursive: true });
  await writeFile(
    path.join(fx.state, "collector.lock"),
    `${JSON.stringify({
      pid: process.pid,
      started_at: "2000-01-01T00:00:00.000Z",
    })}\n`,
    "utf8",
  );
  const cliPath = path.resolve("guild_hall", "local_activity", "cli.mjs");
  const recovered = await runNode([
    cliPath,
    "--binding",
    bindingPath,
    "--binding-sha256",
    `sha256:${bindingDigest}`,
    "--apply",
  ], process.cwd());
  assert.equal(recovered.code, 0, recovered.stderr);
  await assert.rejects(readFile(path.join(fx.state, "collector.lock")));
  assert.equal(
    (await readdir(fx.state)).filter((name) => name.startsWith("collector.lock.stale-")).length,
    0,
  );

  await writeFile(
    path.join(fx.state, "collector.lock"),
    `${JSON.stringify({
      pid: process.pid,
      started_at: new Date().toISOString(),
    })}\n`,
    "utf8",
  );
  const held = await runNode([
    cliPath,
    "--binding",
    bindingPath,
    "--binding-sha256",
    `sha256:${bindingDigest}`,
    "--apply",
  ], process.cwd());
  assert.equal(held.code, 1);
  assert.match(held.stderr, /collector_already_running/u);

  await writeFile(
    path.join(fx.state, "collector.lock"),
    `${JSON.stringify({
      pid: process.pid,
      started_at: "2000-01-01T00:00:00.000Z",
      owner_token: "current-format-owner",
    })}\n`,
    "utf8",
  );
  const currentFormatHeld = await runNode([
    cliPath,
    "--binding",
    bindingPath,
    "--binding-sha256",
    `sha256:${bindingDigest}`,
    "--apply",
  ], process.cwd());
  assert.equal(currentFormatHeld.code, 1);
  assert.match(currentFormatHeld.stderr, /collector_already_running/u);

  await writeFile(path.join(fx.state, "collector.lock"), "", "utf8");
  const freshPartialHeld = await runNode([
    cliPath,
    "--binding",
    bindingPath,
    "--binding-sha256",
    `sha256:${bindingDigest}`,
    "--apply",
  ], process.cwd());
  assert.equal(freshPartialHeld.code, 1);
  assert.match(freshPartialHeld.stderr, /collector_lock_invalid/u);

  const staleTime = new Date("2000-01-01T00:00:00.000Z");
  await utimes(path.join(fx.state, "collector.lock"), staleTime, staleTime);
  const recoveredPartial = await runNode([
    cliPath,
    "--binding",
    bindingPath,
    "--binding-sha256",
    `sha256:${bindingDigest}`,
    "--apply",
  ], process.cwd());
  assert.equal(recoveredPartial.code, 0, recoveredPartial.stderr);
  await assert.rejects(readFile(path.join(fx.state, "collector.lock")));
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

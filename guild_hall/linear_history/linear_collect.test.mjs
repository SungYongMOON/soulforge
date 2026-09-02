import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { digestOf } from "../agent_observation/guard_primitives.mjs";
import { createForgeIntentCore } from "../forge_intent/src/forge_intent_core.mjs";
import { adaptAcceptedLinearCaptureToLaneRecord } from "../path_registry/src/linear_source_lane_adapter.mjs";
import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import { admitForgeLinearExecutionPacket } from "../../ui-workspace/apps/dev-erp/src/forge_linear_execution_packet_admission.mjs";

import {
  LINEAR_COLLECT_RUNTIME_ENTRYPOINT,
  LINEAR_COLLECT_RUNTIME_MANIFEST_SCHEMA_VERSION,
  LinearCollectRuntimeError,
  verifyExactLinearCollectRuntime,
} from "./linear_collect_launcher.mjs";
import {
  LINEAR_COLLECT_COVERAGE_GAPS,
  validateLinearCollectRunReceipt,
} from "./linear_collect_receipt.mjs";
import {
  LINEAR_COLLECT_BINDING_SCHEMA_VERSION,
  LINEAR_COLLECT_DEFAULT_RUN_DEADLINE_MS,
  LINEAR_COLLECT_MAX_RUN_DEADLINE_MS,
  LinearCollectError,
  advanceCursor,
  laneRecordFromReceipt,
  observeOrder,
  preflightLinearCollect,
  readEvidenceDigest,
  readEvidenceRecordForIssue,
  runDeadlineMsFor,
  runLinearCollect,
  validateLinearCollectBinding,
} from "./linear_collect_runner.mjs";
import { writeCreateOnlyJson } from "./linear_custody.mjs";
import {
  LINEAR_QUERY_DOCUMENTS,
  LINEAR_READ_OPERATIONS,
  LinearClientError,
  assertReadOnlyDocument,
  commentsWindowDocument,
  createLinearGraphqlCall,
  normalizeIssue,
  issuesWindowDocument,
  loadLinearApiKey,
} from "./linear_graphql_client.mjs";
import {
  LINEAR_COLLECT_RUNTIME_FILES,
  emitLinearRuntimeLane,
} from "./linear_runtime_manifest_emitter.mjs";
import {
  createSyntheticLinearTransport,
  loadSyntheticLinearFixture,
} from "./linear_synthetic_transport.mjs";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_ROOT, "..", "..");
const FIXTURE_PATH = path.join(MODULE_ROOT, "fixtures", "synthetic_linear_workspace.json");
const TASK_REGISTRAR_PATH = path.join(MODULE_ROOT, "ops", "register-linear-collect-hpp-task.ps1");
const EXAMPLE_BINDING_PATH = path.join(
  REPOSITORY_ROOT,
  "docs",
  "architecture",
  "workspace",
  "examples",
  "linear_collect_lane",
  "linear_collect.binding.example.json",
);
const SYNTHETIC_API_KEY = `lin_api_${"a1b2c3d4".repeat(5)}`;
const ALPHA_PROJECT_ID = "5e6f7081-92a3-4ebf-80d1-4c5d6e7f8091";
const execFileAsync = promisify(execFile);

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function writePinnedJson(target, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return sha256Bytes(bytes);
}

function fixedClock(iso) {
  const holder = { current: iso };
  return {
    clock: { now: () => new Date(holder.current) },
    set(next) {
      holder.current = next;
    },
  };
}

function laneBinding({ privateRoot, runtimeRoot, overrides = {}, cursor = {} }) {
  return {
    schema_version: LINEAR_COLLECT_BINDING_SCHEMA_VERSION,
    feature_enabled: true,
    lane_id: "hpp-linear-collect",
    private_root: privateRoot,
    data_root: path.join(privateRoot, "ingress", "linear"),
    state_root: path.join(privateRoot, "linear_history", "state"),
    forbidden_roots: [REPOSITORY_ROOT, runtimeRoot],
    writer: { authority_id: "hpp-linear-collect-writer", epoch: 1 },
    credentials: {
      api_key_env: null,
      api_key_file: path.join(privateRoot, "config", "linear_history", "credentials", "linear_api_key.txt"),
    },
    workspace: {
      url_key: "synthetic-forge",
      organization_id: null,
      project_scope_map: [
        { linear_project_id: ALPHA_PROJECT_ID, project_scope_ref: "project:syn-alpha" },
      ],
    },
    cursor: {
      overlap_seconds: 300,
      initial_updated_at: null,
      page_size: 50,
      max_pages_per_run: 10,
      timeout_ms: 15_000,
      ...cursor,
    },
    ...overrides,
  };
}

async function createLaneFixture({ overrides = {}, cursor = {}, mutateBinding = null, writeKey = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-linear-collect-"));
  const runtimeRoot = path.join(root, "runtime");
  const privateRoot = path.join(root, "private");
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(privateRoot, { recursive: true });
  const binding = laneBinding({ privateRoot, runtimeRoot, overrides, cursor });
  if (mutateBinding !== null) mutateBinding(binding);
  if (writeKey) {
    await mkdir(path.dirname(binding.credentials.api_key_file), { recursive: true });
    await writeFile(binding.credentials.api_key_file, `${SYNTHETIC_API_KEY}\n`, "utf8");
  }
  const bindingPath = path.join(privateRoot, "config", "linear_history", "linear_collect.binding.json");
  const bindingSha256 = await writePinnedJson(bindingPath, binding);
  const stateRoot = path.join(privateRoot, "linear_history", "state");
  return {
    root,
    runtimeRoot,
    privateRoot,
    stateRoot,
    custodyRoot: path.join(privateRoot, "ingress", "linear", "synthetic-forge"),
    binding,
    bindingPath,
    bindingSha256,
    options: {
      binding_path: bindingPath,
      expected_binding_sha256: bindingSha256,
      repository_root: REPOSITORY_ROOT,
      runtime_root: runtimeRoot,
      state_root: stateRoot,
    },
  };
}

async function listFilesRecursively(root) {
  const output = [];
  async function visit(directory, prefix) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
      else output.push(relative);
    }
  }
  await visit(root, "");
  return output.sort();
}

async function readJson(target) {
  return JSON.parse(await readFile(target, "utf8"));
}

function syntheticFactory(fixture, options = {}) {
  return async () => createSyntheticLinearTransport(fixture, { page_size: 50, ...options });
}

async function healthOf(fixture) {
  return readJson(path.join(fixture.stateRoot, "health", "linear_collect.json"));
}

// ---------------------------------------------------------------------------
// Binding fail-closed matrix and health-before-reject.
// ---------------------------------------------------------------------------

test("preflight attests the exact private binding without network or private writes", async () => {
  const lane = await createLaneFixture();
  const result = await preflightLinearCollect(lane.options);
  assert.deepEqual(result, {
    mode: "preflight",
    feature_status: "ON",
    configured_count: 1,
    succeeded_count: 1,
    failed_count: 0,
    repository_writes: 0,
    private_writes: 0,
    network_used: false,
    error_code_counts: [],
  });
  assert.deepEqual(await listFilesRecursively(lane.stateRoot), []);
});

test("binding validation fails closed on schema, feature, roots, writer, secret and cursor drift", async () => {
  const base = await createLaneFixture();
  const cases = [
    ["schema", (b) => { b.schema_version = "soulforge.linear_collect.binding.v0"; }, "binding_schema_invalid"],
    ["feature off", (b) => { b.feature_enabled = false; }, "binding_feature_must_be_on"],
    ["state outside private", (b) => { b.state_root = path.join(base.root, "elsewhere"); }, "state_root_not_strict_private_child"],
    ["one forbidden root", (b) => { b.forbidden_roots = [REPOSITORY_ROOT]; }, "forbidden_roots_required"],
    ["duplicate forbidden root", (b) => { b.forbidden_roots = [REPOSITORY_ROOT, REPOSITORY_ROOT]; }, "duplicate_forbidden_root"],
    ["forbidden overlaps private", (b) => { b.forbidden_roots = [REPOSITORY_ROOT, base.privateRoot]; }, "private_forbidden_overlap"],
    ["writer epoch", (b) => { b.writer.epoch = 0; }, "writer_epoch_invalid"],
    ["credential inside state", (b) => { b.credentials.api_key_file = path.join(b.state_root, "linear_api_key.txt"); }, "credential_file_state_overlap"],
    ["credential inside data root", (b) => { b.credentials.api_key_file = path.join(b.data_root, "synthetic-forge", "k.txt"); }, "credential_file_data_root_overlap"],
    ["credential inside forbidden root", (b) => { b.credentials.api_key_file = path.join(b.forbidden_roots[1], "linear_api_key.txt"); }, "credential_file_not_strict_private_child"],
    ["credential outside private", (b) => { b.credentials.api_key_file = path.join(base.root, "linear_api_key.txt"); }, "credential_file_not_strict_private_child"],
    ["credential env name", (b) => { b.credentials.api_key_env = "lowercase name"; }, "credential_env_name_invalid"],
    ["data root outside private", (b) => { b.data_root = path.join(base.root, "elsewhere"); }, "data_root_not_strict_private_child"],
    ["data root overlaps forbidden", (b) => { b.forbidden_roots = [REPOSITORY_ROOT, b.data_root]; }, "private_forbidden_overlap"],
    ["embedded token", (b) => { b.lane_id = SYNTHETIC_API_KEY; }, "secret_value_forbidden"],
    ["secret field", (b) => { b.credentials = { ...b.credentials, api_key_value: "x" }; }, "exact_keys_required"],
    ["url key", (b) => { b.workspace.url_key = "Synthetic Forge"; }, "workspace_url_key_invalid"],
    ["scope map unsorted", (b) => {
      b.workspace.project_scope_map = [
        { linear_project_id: "6f708192-a3b4-4fc0-91e2-5d6e7f809102", project_scope_ref: "project:b" },
        { linear_project_id: ALPHA_PROJECT_ID, project_scope_ref: "project:a" },
      ];
    }, "project_scope_map_not_canonical"],
    ["scope ref hold", (b) => { b.workspace.project_scope_map[0].project_scope_ref = "hold:unmapped"; }, "project_scope_map_invalid"],
    ["overlap too large", (b) => { b.cursor.overlap_seconds = 86_401; }, "cursor_policy_invalid"],
    ["page size", (b) => { b.cursor.page_size = 101; }, "cursor_policy_invalid"],
    ["run deadline below one second", (b) => { b.cursor.run_deadline_ms = 999; }, "cursor_policy_invalid"],
    ["run deadline at the task limit", (b) => { b.cursor.run_deadline_ms = LINEAR_COLLECT_MAX_RUN_DEADLINE_MS + 1; }, "cursor_policy_invalid"],
    ["run deadline not an integer", (b) => { b.cursor.run_deadline_ms = "480000"; }, "cursor_policy_invalid"],
    ["unknown cursor key", (b) => { b.cursor.deadline_ms = 480_000; }, "exact_keys_required"],
    ["state inside data root", (b) => { b.state_root = path.join(b.data_root, "state"); }, "data_root_state_overlap"],
  ];
  for (const [name, mutate, expected] of cases) {
    const binding = structuredClone(base.binding);
    mutate(binding);
    assert.throws(
      () => validateLinearCollectBinding(binding),
      (error) => error instanceof LinearCollectError && error.code === expected,
      name,
    );
  }
});

test("a binding without the exact repository and runtime forbidden roots is rejected after the health receipt is written", async () => {
  const lane = await createLaneFixture({
    mutateBinding: (binding) => {
      binding.forbidden_roots = [path.join(REPOSITORY_ROOT, "guild_hall"), binding.forbidden_roots[1]];
    },
  });
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  await assert.rejects(
    runLinearCollect({ ...lane.options, transport_factory: syntheticFactory(fixture) }),
    (error) => error instanceof LinearCollectError && error.code === "required_forbidden_root_missing",
  );
  const health = await healthOf(lane);
  assert.equal(health.status, "error");
  assert.deepEqual(health.error_codes, ["required_forbidden_root_missing"]);
  assert.equal(health.last_success_at, null);
  assert.deepEqual(await listFilesRecursively(lane.custodyRoot), []);
});

test("binding byte drift is rejected before parsing and still leaves a machine-readable health receipt", async () => {
  const lane = await createLaneFixture();
  await writeFile(lane.bindingPath, `${JSON.stringify(lane.binding)} \n`, "utf8");
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  await assert.rejects(
    runLinearCollect({ ...lane.options, transport_factory: syntheticFactory(fixture) }),
    (error) => error instanceof LinearCollectError && error.code === "private_json_digest_mismatch",
  );
  const health = await healthOf(lane);
  assert.equal(health.status, "error");
  assert.deepEqual(health.error_codes, ["private_json_digest_mismatch"]);
});

test("a registered state root that differs from the binding fails closed", async () => {
  const lane = await createLaneFixture();
  await assert.rejects(
    preflightLinearCollect({ ...lane.options, state_root: path.join(lane.privateRoot, "other-state") }),
    (error) => error instanceof LinearCollectError && error.code === "state_root_mismatch",
  );
});

test("a state root overlapping the repository cannot even receive a health receipt", async () => {
  const lane = await createLaneFixture();
  await assert.rejects(
    runLinearCollect({ ...lane.options, state_root: path.join(REPOSITORY_ROOT, "guild_hall", "state", "linear") }),
    (error) => error instanceof LinearCollectError && error.code === "state_root_forbidden_overlap",
  );
});

test("a held lease publishes lease_unavailable to health before rethrowing", async () => {
  const lane = await createLaneFixture();
  const leasePath = path.join(lane.stateRoot, "leases", "linear-collect.lock");
  await mkdir(path.dirname(leasePath), { recursive: true });
  await writeFile(leasePath, "{}\n", "utf8");
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  await assert.rejects(
    runLinearCollect({ ...lane.options, transport_factory: syntheticFactory(fixture) }),
    (error) => error.code === "lease_unavailable",
  );
  const health = await healthOf(lane);
  assert.deepEqual(health.error_codes, ["lease_unavailable"]);
  assert.equal(health.status, "error");
});

test("a credential bound to another workspace fails closed with health and an error receipt", async () => {
  const lane = await createLaneFixture({
    mutateBinding: (binding) => { binding.workspace.url_key = "other-workspace"; },
  });
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  await assert.rejects(
    runLinearCollect({ ...lane.options, transport_factory: syntheticFactory(fixture), run_id: "run-mismatch" }),
    (error) => error instanceof LinearCollectError && error.code === "workspace_mismatch",
  );
  const health = await healthOf(lane);
  assert.deepEqual(health.error_codes, ["workspace_mismatch"]);
  const receipt = await readJson(path.join(lane.stateRoot, "receipts", "run-mismatch.json"));
  validateLinearCollectRunReceipt(receipt);
  assert.equal(receipt.status, "error");
  assert.deepEqual(receipt.error_codes, ["workspace_mismatch"]);
  assert.deepEqual(await listFilesRecursively(path.join(lane.privateRoot, "ingress")), []);
});

// ---------------------------------------------------------------------------
// Delta capture, idempotent re-run, custody create-only.
// ---------------------------------------------------------------------------

test("apply captures the synthetic workspace, re-runs idempotently, and only new revisions create files", async () => {
  const lane = await createLaneFixture();
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  const clock = fixedClock("2026-09-01T02:00:00.000Z");
  const first = await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(fixture),
    clock: clock.clock,
    run_id: "run-0001",
  });
  assert.equal(first.status, "ok");
  assert.equal(first.window_phase, "delta");
  assert.equal(first.generation_seq, 1);
  assert.equal(first.backfill_pending, false);
  assert.equal(first.network_used, false);
  assert.equal(first.repository_writes, 0);
  assert.deepEqual(first.objects.issues, { observed: 6, created: 6, unchanged: 0 });
  assert.deepEqual(first.objects.comments, { observed: 5, created: 5, unchanged: 0 });
  assert.deepEqual(first.objects.read_evidence, { observed: 6, created: 6, unchanged: 0 });
  assert.deepEqual(first.objects.workspace, { observed: 1, created: 1, unchanged: 0 });
  assert.deepEqual(first.objects.projects, { observed: 3, created: 3, unchanged: 0 });
  assert.deepEqual(first.coverage_gaps, ["polling_cannot_prove_hard_deletes"]);
  const custodyFiles = await listFilesRecursively(lane.custodyRoot);
  assert.equal(custodyFiles.length, 1 + 2 + 3 + 3 + 2 + 4 + 1 + 6 + 5 + 6);
  assert.ok(custodyFiles.every((entry) => /^[a-z_]+\/[0-9a-f-]{36}\/[0-9a-f]{64}\.json$/u.test(entry)), custodyFiles.join("\n"));
  const serialized = JSON.stringify(first);
  for (const forbidden of [lane.privateRoot, lane.runtimeRoot, SYNTHETIC_API_KEY, "Synthetic issue one"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }

  const receipt = await readJson(path.join(lane.stateRoot, "receipts", "run-0001.json"));
  validateLinearCollectRunReceipt(receipt);
  assert.equal(receipt.window.lower, "1970-01-01T00:00:00.000Z");
  assert.equal(receipt.window.upper, "2026-09-01T02:00:00.000Z");
  assert.equal(receipt.window.order_observed, "descending");
  assert.equal(receipt.cursor_before.watermark, null);
  assert.equal(receipt.cursor_after.watermark, "2026-09-01T02:00:00.000Z");
  assert.equal(receipt.cursor_after.backfill, null);
  assert.equal(receipt.read_calls.total, 1 + 6 + 1 + 1);
  assert.equal(receipt.organization_id, "8f0a2c1e-4b6d-4c2a-9e3f-1a2b3c4d5e6f");
  const receiptText = JSON.stringify(receipt);
  for (const forbidden of ["Synthetic issue", "example.invalid", lane.privateRoot, SYNTHETIC_API_KEY]) {
    assert.equal(receiptText.includes(forbidden), false, forbidden);
  }
  const health = await healthOf(lane);
  assert.equal(health.status, "ok");
  assert.equal(health.cursor_watermark, "2026-09-01T02:00:00.000Z");
  assert.equal(health.objects_created, 33);

  clock.set("2026-09-01T02:15:00.000Z");
  const second = await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(fixture),
    clock: clock.clock,
    run_id: "run-0002",
  });
  assert.equal(second.objects_created, 0);
  assert.deepEqual(second.objects.issues, { observed: 0, created: 0, unchanged: 0 });
  assert.deepEqual(second.objects.projects, { observed: 3, created: 0, unchanged: 3 });
  assert.deepEqual(await listFilesRecursively(lane.custodyRoot), custodyFiles);
  const secondReceipt = await readJson(path.join(lane.stateRoot, "receipts", "run-0002.json"));
  assert.equal(secondReceipt.window.lower, "2026-09-01T01:55:00.000Z");
  assert.equal(secondReceipt.window.upper, "2026-09-01T02:15:00.000Z");
  assert.equal(secondReceipt.generation_seq, 2);

  const changed = structuredClone(fixture);
  changed.issues[0].title = "Synthetic issue one (edited)";
  changed.issues[0].updatedAt = "2026-09-01T02:27:00.000Z";
  clock.set("2026-09-01T02:30:00.000Z");
  const third = await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(changed),
    clock: clock.clock,
    run_id: "run-0003",
  });
  assert.deepEqual(third.objects.issues, { observed: 1, created: 1, unchanged: 0 });
  assert.deepEqual(third.objects.read_evidence, { observed: 1, created: 1, unchanged: 0 });
  assert.equal(third.objects_created, 2);
  const afterEdit = await listFilesRecursively(lane.custodyRoot);
  assert.equal(afterEdit.length, custodyFiles.length + 2);
  const issueDirectory = path.join(lane.custodyRoot, "issues", fixture.issues[0].id);
  assert.equal((await readdir(issueDirectory)).length, 2);
  const state = await readJson(path.join(lane.stateRoot, "state", "linear-collect.json"));
  assert.equal(state.cursor.watermark, "2026-09-01T02:30:00.000Z");
  assert.equal(state.last_run_id, "run-0003");
  assert.equal(Object.keys(state.object_index).length, 33);

  clock.set("2026-09-01T02:45:00.000Z");
  const fourth = await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(changed),
    clock: clock.clock,
    run_id: "run-0004",
  });
  assert.equal(fourth.objects_created, 0);
  assert.deepEqual(fourth.objects.issues, { observed: 1, created: 0, unchanged: 1 });
  assert.deepEqual(await listFilesRecursively(lane.custodyRoot), afterEdit);
});

test("custody objects are create-only: identical bytes are a no-op and different bytes conflict", async () => {
  const lane = await createLaneFixture();
  const object = { id: "aa11bb22-cc33-4d44-8e55-ff6677889900", updated_at: "2026-09-01T00:00:00.000Z", title: "x" };
  const digest = sha256Canonical(object).slice("sha256:".length);
  const first = await writeCreateOnlyJson(lane.custodyRoot, ["issues", object.id, `${digest}.json`], object);
  const second = await writeCreateOnlyJson(lane.custodyRoot, ["issues", object.id, `${digest}.json`], object);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.digest, second.digest);
  await writeFile(first.path, "{\"tampered\":true}\n", "utf8");
  await assert.rejects(
    writeCreateOnlyJson(lane.custodyRoot, ["issues", object.id, `${digest}.json`], object),
    (error) => error.code === "custody_digest_conflict",
  );
  await assert.rejects(
    writeCreateOnlyJson(lane.custodyRoot, ["..", "escape.json"], object),
    (error) => error.code === "path_escape_forbidden",
  );
});

test("a tampered existing custody object fails the run closed and leaves a health error", async () => {
  const lane = await createLaneFixture();
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  const clock = fixedClock("2026-09-01T02:00:00.000Z");
  await runLinearCollect({ ...lane.options, transport_factory: syntheticFactory(fixture), clock: clock.clock, run_id: "run-a" });
  const projectDirectory = path.join(lane.custodyRoot, "projects", ALPHA_PROJECT_ID);
  const [projectFile] = await readdir(projectDirectory);
  await writeFile(path.join(projectDirectory, projectFile), "{\"tampered\":true}\n", "utf8");
  clock.set("2026-09-01T02:15:00.000Z");
  await assert.rejects(
    runLinearCollect({ ...lane.options, transport_factory: syntheticFactory(fixture), clock: clock.clock, run_id: "run-b" }),
    (error) => error.code === "custody_digest_conflict",
  );
  const health = await healthOf(lane);
  assert.equal(health.status, "error");
  assert.deepEqual(health.error_codes, ["custody_digest_conflict"]);
  assert.equal(health.last_success_at !== null, true);
});

// ---------------------------------------------------------------------------
// Bounded pages, backfill continuation, order detection.
// ---------------------------------------------------------------------------

test("max-pages exhaustion opens an explicit backfill window that converges without skipping revisions", async () => {
  const lane = await createLaneFixture({ cursor: { page_size: 2, max_pages_per_run: 1 } });
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  const clock = fixedClock("2026-09-01T02:00:00.000Z");
  const results = [];
  for (let index = 0; index < 8; index += 1) {
    clock.set(`2026-09-01T0${2 + Math.floor(index / 4)}:${String((index % 4) * 15).padStart(2, "0")}:00.000Z`);
    const result = await runLinearCollect({
      ...lane.options,
      transport_factory: syntheticFactory(fixture, { page_size: 2, order: "descending" }),
      clock: clock.clock,
      run_id: `run-backfill-${index}`,
    });
    results.push(result);
    if (!result.backfill_pending && index > 0) break;
  }
  assert.ok(results.length >= 3 && results.length < 8, `converged in ${results.length} runs`);
  assert.equal(results[0].window_phase, "delta");
  assert.equal(results[0].backfill_pending, true);
  assert.ok(results[0].coverage_gaps.includes("max_pages_continuation_pending"));
  assert.ok(results[0].coverage_gaps.includes("catalog_continuation_pending"));
  assert.equal(results[1].window_phase, "backfill");
  const last = results.at(-1);
  assert.equal(last.backfill_pending, false);
  const issueDirectories = await readdir(path.join(lane.custodyRoot, "issues"));
  assert.equal(issueDirectories.length, 6);
  const commentDirectories = await readdir(path.join(lane.custodyRoot, "comments"));
  assert.equal(commentDirectories.length, 5);
  const state = await readJson(path.join(lane.stateRoot, "state", "linear-collect.json"));
  assert.equal(state.cursor.backfill, null);
  assert.equal(state.cursor.watermark, "2026-09-01T02:00:00.000Z");
  const firstReceipt = await readJson(path.join(lane.stateRoot, "receipts", "run-backfill-0.json"));
  assert.equal(firstReceipt.cursor_after.backfill.resume_watermark, "2026-09-01T02:00:00.000Z");
  assert.equal(firstReceipt.cursor_after.backfill.upper, "2026-09-01T00:50:00.000Z");
});

test("the in-process run deadline caps a run under a fake clock, records run_deadline_reached, releases the lease, and the next run continues", async () => {
  const lane = await createLaneFixture({ cursor: { page_size: 2, max_pages_per_run: 50, run_deadline_ms: 1_000 } });
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  const clock = fixedClock("2026-09-01T02:00:00.000Z");
  // Every provider read advances the fake clock by 300 ms, so the workspace
  // read and the first catalog pages consume the 1 s deadline before the issue
  // and comment windows are opened: those collections are capped by the
  // deadline (0 pages) rather than by max_pages_per_run (50).
  const advancingFactory = () => async () => {
    const inner = await createSyntheticLinearTransport(fixture, { page_size: 2, order: "descending" });
    const tick = () => clock.set(new Date(clock.clock.now().getTime() + 300).toISOString());
    return {
      kind: inner.kind,
      async readWorkspace() { tick(); return inner.readWorkspace(); },
      async readCatalogPage(kind, after) { tick(); return inner.readCatalogPage(kind, after); },
      async readIssuesPage(request) { tick(); return inner.readIssuesPage(request); },
      async readCommentsPage(request) { tick(); return inner.readCommentsPage(request); },
    };
  };
  const first = await runLinearCollect({
    ...lane.options,
    transport_factory: advancingFactory(),
    clock: clock.clock,
    run_id: "run-deadline-0",
  });
  assert.equal(first.status, "ok");
  assert.equal(first.window_phase, "delta");
  assert.equal(first.backfill_pending, true);
  for (const gap of ["run_deadline_reached", "max_pages_continuation_pending", "catalog_continuation_pending"]) {
    assert.ok(first.coverage_gaps.includes(gap), gap);
  }
  assert.ok(first.read_calls < 1 + 6 + 1 + 1, `stopped early after ${first.read_calls} reads`);
  assert.equal(first.objects.issues.observed, 0);
  assert.equal(first.objects.comments.observed, 0);
  assert.ok(first.objects_created > 0, "objects read before the deadline are kept");
  const firstReceipt = await readJson(path.join(lane.stateRoot, "receipts", "run-deadline-0.json"));
  validateLinearCollectRunReceipt(firstReceipt);
  assert.equal(firstReceipt.status, "ok");
  assert.ok(firstReceipt.coverage_gaps.includes("run_deadline_reached"));
  assert.equal(firstReceipt.cursor_after.watermark, null);
  // A deadline cap with no progress keeps the whole window and is not a stall.
  assert.deepEqual(firstReceipt.cursor_after.backfill, {
    lower: "1970-01-01T00:00:00.000Z",
    upper: "2026-09-01T02:00:00.000Z",
    resume_watermark: "2026-09-01T02:00:00.000Z",
    stall_count: 0,
  });
  const health = await healthOf(lane);
  assert.equal(health.status, "ok");
  assert.equal(health.backfill_pending, true);
  assert.ok(health.coverage_gaps.includes("run_deadline_reached"));

  // The lease was released in `finally`: the continuation run acquires it and
  // finishes the backfill without the deadline (no clock advance per read).
  clock.set("2026-09-01T02:15:00.000Z");
  const second = await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(fixture, { page_size: 2, order: "descending" }),
    clock: clock.clock,
    run_id: "run-deadline-1",
  });
  assert.equal(second.status, "ok");
  assert.equal(second.window_phase, "backfill");
  assert.equal(second.backfill_pending, false);
  assert.equal(second.coverage_gaps.includes("run_deadline_reached"), false);
  assert.equal((await readdir(path.join(lane.custodyRoot, "issues"))).length, 6);
  assert.equal((await readdir(path.join(lane.custodyRoot, "comments"))).length, 5);
  const state = await readJson(path.join(lane.stateRoot, "state", "linear-collect.json"));
  assert.equal(state.cursor.backfill, null);
  assert.equal(state.cursor.watermark, "2026-09-01T02:00:00.000Z");
  const secondHealth = await healthOf(lane);
  assert.deepEqual(secondHealth.coverage_gaps, ["polling_cannot_prove_hard_deletes"]);

  // Default and bounds: 8 minutes unless the binding narrows/widens it, and the
  // widest value stays below the registrar's PT10M ExecutionTimeLimit.
  assert.equal(runDeadlineMsFor({}), LINEAR_COLLECT_DEFAULT_RUN_DEADLINE_MS);
  assert.equal(LINEAR_COLLECT_DEFAULT_RUN_DEADLINE_MS, 8 * 60 * 1000);
  assert.equal(runDeadlineMsFor({ run_deadline_ms: 120_000 }), 120_000);
  assert.ok(LINEAR_COLLECT_MAX_RUN_DEADLINE_MS + 60_000 <= 10 * 60 * 1000, "max deadline plus one request timeout fits the task limit");
  assert.doesNotThrow(() => validateLinearCollectBinding({ ...lane.binding, cursor: { ...lane.binding.cursor, run_deadline_ms: 480_000 } }));
});

test("order detection and cursor advancement are deterministic", () => {
  assert.equal(observeOrder([]), "unknown");
  assert.equal(observeOrder(["2026-01-01T00:00:00.000Z"]), "unknown");
  assert.equal(observeOrder(["2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z"]), "descending");
  assert.equal(observeOrder(["2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z"]), "ascending");
  assert.equal(observeOrder(["2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z"]), "unknown");

  const cursor = { schema_version: "soulforge.linear_collect.cursor.v1", watermark: null, backfill: null, generation_seq: 4 };
  const window = { lower: "2026-01-01T00:00:00.000Z", upper: "2026-02-01T00:00:00.000Z", phase: "delta", resume_watermark: "2026-02-01T00:00:00.000Z" };
  const complete = advanceCursor({ cursor, window, collections: [{ capped: false, timestamps: [], order: "unknown" }], gaps: new Set() });
  assert.deepEqual(complete.cursor, { ...cursor, watermark: window.upper, generation_seq: 5 });

  const gaps = new Set();
  const ascending = advanceCursor({
    cursor,
    window,
    collections: [
      { capped: true, timestamps: ["2026-01-05T00:00:00.000Z", "2026-01-10T00:00:00.000Z"], order: "ascending" },
      { capped: false, timestamps: ["2026-01-20T00:00:00.000Z"], order: "unknown" },
    ],
    gaps,
  });
  assert.deepEqual(ascending.cursor.backfill, {
    lower: "2026-01-10T00:00:00.000Z",
    upper: window.upper,
    resume_watermark: window.resume_watermark,
    stall_count: 0,
  });
  assert.equal(ascending.cursor.watermark, null);
  assert.ok(gaps.has("max_pages_continuation_pending"));

  const stalledCursor = { ...cursor, backfill: { lower: window.lower, upper: window.upper, resume_watermark: window.resume_watermark, stall_count: 1 } };
  const stallGaps = new Set();
  const stalled = advanceCursor({
    cursor: stalledCursor,
    window: { ...window, phase: "backfill" },
    collections: [{ capped: true, timestamps: ["2026-01-05T00:00:00.000Z", "2026-01-05T00:00:00.000Z"], order: "unknown" }],
    gaps: stallGaps,
  });
  assert.equal(stalled.cursor.backfill, null);
  assert.equal(stalled.cursor.watermark, window.resume_watermark);
  assert.ok(stallGaps.has("backfill_stalled_window_advanced"));

  // A deadline-capped collection that could not narrow keeps the window and
  // leaves the stall count untouched instead of advancing past revisions.
  const deadlineGaps = new Set();
  const deadlineStalled = advanceCursor({
    cursor: stalledCursor,
    window: { ...window, phase: "backfill" },
    collections: [{ capped: true, deadline: true, timestamps: [], order: "unknown" }],
    gaps: deadlineGaps,
  });
  assert.deepEqual(deadlineStalled.cursor.backfill, {
    lower: window.lower,
    upper: window.upper,
    resume_watermark: window.resume_watermark,
    stall_count: 1,
  });
  assert.equal(deadlineStalled.cursor.watermark, null);
  assert.equal(deadlineGaps.has("backfill_stalled_window_advanced"), false);
  assert.ok(deadlineGaps.has("max_pages_continuation_pending"));
  for (const gap of [...gaps, ...stallGaps, ...deadlineGaps]) assert.ok(LINEAR_COLLECT_COVERAGE_GAPS.includes(gap), gap);
});

// ---------------------------------------------------------------------------
// Read evidence compatibility with Forge/ERP admission.
// ---------------------------------------------------------------------------

async function forgeOutputsFor(taskRef) {
  const core = createForgeIntentCore({
    taskWriter: {
      async createOfficialTask() {
        return { task_ref: taskRef, writer_ref: "writer.linear.owner-gated" };
      },
    },
  });
  core.createWorkCandidate({
    candidate_id: "candidate.syn-001",
    accepted_context_ref: "context.syn:g1",
    engine_finding_refs: ["finding.syn:gap-001"],
    rationale: "One accepted synthetic gap requires a bounded review.",
    confidence: "high",
    stop_conditions: ["stop if the accepted source generation changes"],
  });
  const intent = core.createTaskIntent({
    intent_id: "intent.syn-001",
    candidate_id: "candidate.syn-001",
    requested_change: "Register one bounded official review task.",
    expected_prior_state: "no equivalent open official task",
  });
  core.recordApproval({
    approval_ref: "approval.syn-001",
    intent_id: intent.intent_id,
    intent_digest: intent.intent_digest,
    authority_ref: "authority.human-owner",
    decision: "approve",
  });
  const officialTask = await core.registerOfficialTask({ intent_id: intent.intent_id, intent_digest: intent.intent_digest });
  const assignment = core.createAssignment({
    assignment_id: "assignment.syn-001",
    intent_id: intent.intent_id,
    primary_role: "role.syn-se",
    actor_ref: "actor:syn-se",
    authority_ref: "authority.syn-task.v1",
    assignment_epoch: 3,
    expires_at: "2026-09-30",
  });
  const brief = core.issueWorkBrief({
    brief_id: "brief.syn-001",
    assignment_id: assignment.assignment_id,
    problem: "A synthetic systems-engineering gap remains open.",
    requested_outcome: "Produce one review-ready synthetic artifact.",
    allowed_write_scope: ["workspace.syn:review-artifact"],
    required_evidence: ["source-receipt:accepted-context-g1"],
    stop_conditions: ["stop on source or project ambiguity"],
    escalation_path: "role.syn-pm",
    input_bundle_manifest_digest: "a".repeat(64),
    required_review_role: "role.syn-reviewer",
  });
  return { officialTask, assignment, brief };
}

function admissionRequest(outputs, evidence) {
  return {
    forge_official_task: outputs.officialTask,
    forge_assignment: outputs.assignment,
    forge_issued_work_brief: outputs.brief,
    linear_official_task_read_evidence: evidence,
    execution_binding: {
      schema_version: "soulforge.forge_linear.execution_binding.v0",
      candidate_ref: "candidate:syn-001",
      project_scope_ref: evidence.project_scope_ref,
      action_ref: "action:prepare-syn-review",
      authority_ref: "authority.syn-task.v1",
      required_role_ref: "role.syn-se",
      responsible_actor_ref: "actor:syn-se",
      required_capability_refs: ["cap:artifact-review"],
      source_receipt_refs: [...evidence.source_receipt_refs],
      assignment_id: "assignment.syn-001",
      assignment_authority_ref: "authority.syn-task.v1",
      assignment_epoch: 3,
      assignment_state: "current",
      work_brief_revision_id: "brief.syn-001",
      work_brief_content_sha256: digestOf(outputs.brief),
      parent_task_ref: null,
    },
  };
}

test("emitted read-evidence envelopes are consumable by the Forge/Linear execution packet admission seam", async () => {
  const lane = await createLaneFixture();
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(fixture),
    clock: fixedClock("2026-09-01T02:00:00.000Z").clock,
    run_id: "run-evidence",
  });
  const todoIssue = fixture.issues[0];
  const inProgressIssue = fixture.issues[1];
  const unassignedIssue = fixture.issues[3];
  const envelopeOf = async (issue) => {
    const directory = path.join(lane.custodyRoot, "read_evidence", issue.id);
    const [file] = await readdir(directory);
    const custody = await readJson(path.join(directory, file));
    assert.equal(custody.kind, "read_evidence");
    assert.equal(custody.object.schema_version, "soulforge.linear_collect.read_evidence_envelope.v1");
    assert.equal(custody.object.issue_identifier, issue.identifier);
    return custody.object;
  };

  const todo = await envelopeOf(todoIssue);
  assert.equal(todo.evidence.schema_version, "soulforge.linear.official_task_read_evidence.v0");
  assert.equal(todo.evidence.task_status, "Todo");
  assert.equal(todo.evidence.project_scope_ref, "project:syn-alpha");
  assert.equal(todo.evidence.forge_task_ref, "linear.task:syn-1");
  assert.deepEqual(Object.keys(todo.evidence).sort(), [
    "evidence_state", "forge_task_ref", "project_scope_ref", "provider", "read_receipt_digest",
    "read_receipt_ref", "schema_version", "source_receipt_refs", "task_id", "task_status",
  ]);
  const admitted = admitForgeLinearExecutionPacket(admissionRequest(await forgeOutputsFor("linear.task:syn-1"), todo.evidence));
  assert.equal(admitted.status, "ADMITTED", JSON.stringify(admitted));
  assert.deepEqual(admitted.task_ref, { provider: "linear", task_id: "SYN-1" });
  assert.equal(admitted.forge_binding_refs.linear_read_receipt_ref, todo.evidence.read_receipt_ref);

  const inProgress = await envelopeOf(inProgressIssue);
  assert.equal(inProgress.evidence.task_status, "InProgress");
  assert.deepEqual(
    admitForgeLinearExecutionPacket(admissionRequest(await forgeOutputsFor("linear.task:syn-2"), inProgress.evidence)),
    { status: "HOLD", hold_code: "LINEAR_OFFICIAL_TASK_NOT_TODO" },
  );

  const unassigned = await envelopeOf(unassignedIssue);
  assert.equal(unassigned.evidence.project_scope_ref, "linear.project:unassigned");
  assert.equal(unassigned.evidence.task_status, "Backlog");

  const tampered = { ...todo.evidence, task_status: "Todo", evidence_state: "current", task_id: "SYN-9" };
  assert.deepEqual(
    admitForgeLinearExecutionPacket(admissionRequest(await forgeOutputsFor("linear.task:syn-1"), tampered)),
    { status: "HOLD", hold_code: "LINEAR_OFFICIAL_TASK_READ_EVIDENCE_DIGEST_MISMATCH" },
  );
});

test("read evidence is a pure function of the issue snapshot and the binding scope map", () => {
  const binding = laneBinding({ privateRoot: path.join(os.tmpdir(), "p"), runtimeRoot: path.join(os.tmpdir(), "r") });
  const issue = {
    id: "f8091a2b-3c4d-4859-aa6b-465768798a9b",
    identifier: "SYN-1",
    state_name: "In Review ✅",
    project_id: ALPHA_PROJECT_ID,
    updated_at: "2026-09-01T00:10:00.000Z",
  };
  const first = readEvidenceRecordForIssue(binding, issue);
  const second = readEvidenceRecordForIssue(binding, structuredClone(issue));
  assert.deepEqual(first, second);
  assert.equal(first.envelope.evidence.task_status, "InReview");
  assert.equal(first.envelope.evidence.read_receipt_digest, digestOf((({ read_receipt_digest, ...body }) => body)(first.envelope.evidence)));
  for (const sample of [
    null, 1, "x", [1, "a", null, { z: 1, a: [true] }], { b: { d: 2, c: [1, 2] }, a: "é😀" },
    (({ read_receipt_digest, ...body }) => body)(first.envelope.evidence),
  ]) assert.equal(readEvidenceDigest(sample), digestOf(sample));
  assert.throws(
    () => readEvidenceRecordForIssue(binding, { ...issue, identifier: "SYN 1" }),
    (error) => error.code === "issue_identifier_unsafe",
  );
});

// ---------------------------------------------------------------------------
// Lane record parity with the path_registry adapter.
// ---------------------------------------------------------------------------

test("the run-time capture_generation record equals the path_registry adapter derivation", async () => {
  const lane = await createLaneFixture();
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  const result = await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(fixture),
    clock: fixedClock("2026-09-01T02:00:00.000Z").clock,
    run_id: "run-lane",
  });
  const receipt = await readJson(path.join(lane.stateRoot, "receipts", "run-lane.json"));
  const persisted = await readJson(path.join(lane.stateRoot, "receipts", "run-lane.lane_record.json"));
  const derived = adaptAcceptedLinearCaptureToLaneRecord({
    source_ref: "source.linear",
    expected_lane_id: "hpp-linear-collect",
    expected_workspace_url_key: "synthetic-forge",
    generation_seq: 1,
    run_receipt: receipt,
    run_receipt_digest: sha256Canonical(receipt),
    evaluation_time: "2026-09-01T02:05:00.000Z",
    max_receipt_age_seconds: 3600,
  });
  assert.deepEqual(persisted, { ...derived });
  assert.deepEqual(result.lane_record, { ...derived });
  assert.deepEqual(laneRecordFromReceipt(receipt, sha256Canonical(receipt)), { ...derived });
  assert.equal(derived.item_count, 27);
  assert.equal(derived.captured_at, "2026-09-01T02:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Read-only guard.
// ---------------------------------------------------------------------------

test("the lane has no mutation document, no write capability name, and only read operations", async () => {
  const documents = [
    ...Object.values(LINEAR_QUERY_DOCUMENTS),
    issuesWindowDocument({ lower: "2026-01-01T00:00:00.000Z", upper: "2026-01-02T00:00:00.000Z" }),
    commentsWindowDocument({ lower: "2026-01-01T00:00:00.000Z", upper: "2026-01-02T00:00:00.000Z" }),
  ];
  for (const document of documents) {
    assert.doesNotThrow(() => assertReadOnlyDocument(document));
    assert.match(document, /^query Soulforge/u);
  }
  assert.throws(
    () => assertReadOnlyDocument("mutation IssueUpdate { issueUpdate(id: \"x\", input: {}) { success } }"),
    (error) => error instanceof LinearClientError && error.code === "read_only_document_required",
  );
  assert.throws(
    () => assertReadOnlyDocument("query Q { viewer { id } } mutation M { issueDelete(id: \"x\") { success } }"),
    (error) => error instanceof LinearClientError && error.code === "mutation_document_forbidden",
  );
  assert.ok(LINEAR_READ_OPERATIONS.every((operation) => operation.startsWith("linear.read.")));

  const mutationDefinition = /(?:^|[\s`])mutation\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*)?[({]/u;
  const writeCapabilities = [
    "issueCreate", "issueUpdate", "issueDelete", "issueArchive", "issueUnarchive", "issueBatchUpdate",
    "commentCreate", "commentUpdate", "commentDelete", "projectCreate", "projectUpdate", "projectDelete",
    "attachmentCreate", "attachmentDelete", "issueLabelCreate", "issueLabelUpdate", "workflowStateCreate",
    "teamCreate", "teamUpdate", "cycleCreate", "cycleUpdate", "issueRelationCreate", "documentCreate",
    "reactionCreate", "issueSubscribe", "save_issue", "save_comment", "save_project",
  ];
  for (const file of [
    "linear_graphql_client.mjs", "linear_collect_runner.mjs", "linear_collect_cli.mjs",
    "linear_collect_launcher.mjs", "linear_custody.mjs", "linear_collect_receipt.mjs",
    "linear_synthetic_transport.mjs", "linear_runtime_manifest_emitter.mjs",
  ]) {
    const source = await readFile(path.join(MODULE_ROOT, file), "utf8");
    assert.equal(mutationDefinition.test(source), false, `${file} defines a mutation`);
    for (const capability of writeCapabilities) {
      assert.equal(source.includes(capability), false, `${file} names ${capability}`);
    }
    assert.equal(source.includes("process.env."), false, `${file} reads process.env`);
  }
});

// ---------------------------------------------------------------------------
// Secret loading and GraphQL call boundaries.
// ---------------------------------------------------------------------------

test("the API key is read only from the fenced private file and never appears in errors", async () => {
  const lane = await createLaneFixture();
  const boundary = {
    private_root: lane.privateRoot,
    data_root: path.join(lane.privateRoot, "ingress", "linear"),
    forbidden_roots: [REPOSITORY_ROOT, lane.runtimeRoot],
  };
  const environment = {};
  assert.equal(await loadLinearApiKey(lane.binding.credentials, environment, boundary), SYNTHETIC_API_KEY);
  const envKey = `lin_api_${"e5f6a7b8".repeat(5)}`;
  assert.equal(
    await loadLinearApiKey({ api_key_env: "LINEAR_TEST_KEY", api_key_file: lane.binding.credentials.api_key_file }, { LINEAR_TEST_KEY: envKey }, boundary),
    envKey,
    "a configured environment name wins over the file, like the Slack lane",
  );
  assert.equal(
    await loadLinearApiKey({ api_key_env: "LINEAR_TEST_KEY", api_key_file: lane.binding.credentials.api_key_file }, {}, boundary),
    SYNTHETIC_API_KEY,
    "an unset environment name falls back to the fenced file",
  );

  const outside = path.join(lane.root, "linear_api_key.txt");
  await writeFile(outside, SYNTHETIC_API_KEY, "utf8");
  await assert.rejects(
    loadLinearApiKey({ api_key_env: null, api_key_file: outside }, environment, boundary),
    (error) => error instanceof LinearClientError && error.code === "credential_file_outside_owner",
  );
  const inData = path.join(boundary.data_root, "linear_api_key.txt");
  await mkdir(boundary.data_root, { recursive: true });
  await writeFile(inData, SYNTHETIC_API_KEY, "utf8");
  await assert.rejects(
    loadLinearApiKey({ api_key_env: null, api_key_file: inData }, environment, boundary),
    (error) => error.code === "credential_file_outside_owner",
  );
  const inRuntime = path.join(lane.runtimeRoot, "linear_api_key.txt");
  await writeFile(inRuntime, SYNTHETIC_API_KEY, "utf8");
  await assert.rejects(
    loadLinearApiKey({ api_key_env: null, api_key_file: inRuntime }, environment, boundary),
    (error) => error.code === "credential_file_outside_owner",
  );
  const malformed = path.join(lane.privateRoot, "config", "linear_history", "credentials", "malformed.txt");
  await writeFile(malformed, "not-a-linear-key-value\n", "utf8");
  await assert.rejects(
    loadLinearApiKey({ api_key_env: null, api_key_file: malformed }, environment, boundary),
    (error) => error.code === "api_key_unavailable" && !error.message.includes("not-a-linear-key-value"),
  );
  const oversized = path.join(lane.privateRoot, "config", "linear_history", "credentials", "oversized.txt");
  await writeFile(oversized, `${SYNTHETIC_API_KEY}${"x".repeat(4096)}`, "utf8");
  await assert.rejects(
    loadLinearApiKey({ api_key_env: null, api_key_file: oversized }, environment, boundary),
    (error) => error.code === "credential_file_unsafe",
  );
  await assert.rejects(
    loadLinearApiKey({ api_key_env: null, api_key_file: path.join(lane.privateRoot, "config", "linear_history", "credentials", "missing.txt") }, environment, boundary),
    (error) => error?.code === "ENOENT",
  );
  await assert.rejects(
    loadLinearApiKey({ api_key_env: null, api_key_file: null }, environment, boundary),
    (error) => error.code === "api_key_unavailable",
  );
  await assert.rejects(
    loadLinearApiKey({ api_key_env: "LINEAR_TEST_KEY", api_key_file: null }, { LINEAR_TEST_KEY: "not-a-key" }, boundary),
    (error) => error.code === "api_key_unavailable" && !error.message.includes("not-a-key"),
  );
});

test("provider text is stored in NFC so custody digests stay canonical", () => {
  const node = {
    id: "11111111-1111-4111-8111-111111111111", identifier: "SYN-1", number: 1,
    title: "Cafe\u0301", description: "Cafe\u0301 body", priority: 0, priorityLabel: null, estimate: null,
    url: null, branchName: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null, startedAt: null, completedAt: null, canceledAt: null, dueDate: null,
    team: { id: "22222222-2222-4222-8222-222222222222", key: "SYN" },
    state: { id: "33333333-3333-4333-8333-333333333333", name: "Todo", type: "unstarted" },
    assignee: null, creator: null, project: null, cycle: null, parent: null,
    labels: { nodes: [] }, relations: { nodes: [] },
  };
  const issue = normalizeIssue(node);
  assert.equal(issue.title, "Caf\u00e9");
  assert.equal(issue.description, "Caf\u00e9 body");
  assert.equal(issue.title.normalize("NFC"), issue.title);
});

test("the GraphQL call is read-only, bounded, and redacts the credential in every failure", async () => {
  const requests = [];
  const respond = (status, body) => async (url, init) => {
    requests.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        if (body === "invalid") throw new Error("bad json");
        return body;
      },
    };
  };
  const call = createLinearGraphqlCall({ api_key: SYNTHETIC_API_KEY, fetch_impl: respond(200, { data: { viewer: { id: "x" } } }), timeout_ms: 1_000 });
  const data = await call("linear.read.viewer_organization", LINEAR_QUERY_DOCUMENTS["linear.read.viewer_organization"], {});
  assert.deepEqual(data, { viewer: { id: "x" } });
  assert.equal(requests[0].url, "https://api.linear.app/graphql");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.authorization, SYNTHETIC_API_KEY);
  assert.equal(requests[0].init.redirect, "error");
  assert.equal(JSON.parse(requests[0].init.body).operationName, "SoulforgeLinearViewerOrganization");
  const oauthCall = createLinearGraphqlCall({ api_key: `lin_oauth_${"z9".repeat(12)}`, fetch_impl: respond(200, { data: {} }), timeout_ms: 1_000 });
  await oauthCall("linear.read.viewer_organization", LINEAR_QUERY_DOCUMENTS["linear.read.viewer_organization"], {});
  assert.equal(requests[1].init.headers.authorization, `Bearer lin_oauth_${"z9".repeat(12)}`);

  for (const [status, body, expected] of [
    [401, {}, "linear_auth_failed"],
    [403, {}, "linear_auth_failed"],
    [429, {}, "linear_rate_limited"],
    [500, {}, "linear_http_failed"],
    [400, {}, "linear_http_failed"],
    [400, "invalid", "linear_http_failed"],
    [400, { errors: [{ message: "operation does not exist", extensions: { code: "INPUT_ERROR", type: "invalid input" } }] }, "linear_graphql_input_error"],
    [400, { errors: [{ message: "Cannot query field", extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }] }, "linear_graphql_graphql_validation_failed"],
    [200, "invalid", "linear_response_invalid"],
    [200, { errors: [{ message: "Authentication required", extensions: { code: "AUTHENTICATION_ERROR" } }] }, "linear_graphql_authentication_error"],
    [200, { errors: [{ message: "x" }] }, "linear_graphql_error"],
    [200, { data: null }, "linear_response_invalid"],
  ]) {
    const failing = createLinearGraphqlCall({ api_key: SYNTHETIC_API_KEY, fetch_impl: respond(status, body), timeout_ms: 1_000 });
    await assert.rejects(
      failing("linear.read.teams", LINEAR_QUERY_DOCUMENTS["linear.read.teams"], { first: 1, after: null }),
      (error) => error instanceof LinearClientError && error.code === expected
        && !error.message.includes(SYNTHETIC_API_KEY) && !error.message.includes("Authentication required"),
      `${status}:${expected}`,
    );
  }
  await assert.rejects(
    call("linear.read.teams", "mutation X { issueDelete(id: \"1\") { success } }", {}),
    (error) => error.code === "read_only_document_required",
  );
  assert.throws(
    () => createLinearGraphqlCall({ api_key: SYNTHETIC_API_KEY, endpoint: "https://example.invalid/graphql" }),
    (error) => error.code === "linear_endpoint_fixed",
  );
});

// ---------------------------------------------------------------------------
// Receipt contract.
// ---------------------------------------------------------------------------

test("run receipts are body-free and path-free", async () => {
  const lane = await createLaneFixture();
  const fixture = await loadSyntheticLinearFixture(FIXTURE_PATH);
  await runLinearCollect({
    ...lane.options,
    transport_factory: syntheticFactory(fixture),
    clock: fixedClock("2026-09-01T02:00:00.000Z").clock,
    run_id: "run-receipt",
  });
  const receipt = await readJson(path.join(lane.stateRoot, "receipts", "run-receipt.json"));
  assert.doesNotThrow(() => validateLinearCollectRunReceipt(receipt));
  for (const [name, mutate, expected] of [
    ["title field", (r) => { r.title = "leak"; }, "receipt_exact_keys_required"],
    ["absolute path", (r) => { r.coverage_gaps = [lane.privateRoot]; }, "receipt_absolute_path_forbidden"],
    ["token value", (r) => { r.lane_id = SYNTHETIC_API_KEY; }, "receipt_secret_value_forbidden"],
    ["count drift", (r) => { r.objects.issues.created += 1; }, "receipt_object_counts_inconsistent"],
    ["operation drift", (r) => { r.read_calls.total += 1; }, "receipt_read_calls_inconsistent"],
    ["unknown gap", (r) => { r.coverage_gaps = ["made_up_gap"]; }, "receipt_code_list_invalid"],
    ["repository write", (r) => { r.repository_writes = 1; }, "receipt_repository_writes_forbidden"],
    ["window order", (r) => { r.window.lower = "2027-01-01T00:00:00.000Z"; }, "receipt_window_invalid"],
  ]) {
    const mutated = structuredClone(receipt);
    mutate(mutated);
    assert.throws(() => validateLinearCollectRunReceipt(mutated), (error) => error.code === expected, name);
  }
});

// ---------------------------------------------------------------------------
// Public-safe example binding.
// ---------------------------------------------------------------------------

test("the tracked example binding validates once its placeholders are bound to private roots", async () => {
  const text = await readFile(EXAMPLE_BINDING_PATH, "utf8");
  assert.equal(/[A-Za-z]:[\\/]/u.test(text), false, "example must not contain a concrete local absolute path");
  assert.equal(/lin_(?:api|oauth)_/u.test(text), false, "example must not contain a token-like value");
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-linear-example-"));
  const privateRoot = path.join(root, "private");
  const runtimeRoot = path.join(root, "runtime");
  const bound = JSON.parse(text
    .replaceAll("<PRIVATE_ROOT>", privateRoot.split(path.sep).join("/"))
    .replaceAll("<REPOSITORY_ROOT>", REPOSITORY_ROOT.split(path.sep).join("/"))
    .replaceAll("<RUNTIME_ROOT>", runtimeRoot.split(path.sep).join("/")));
  assert.doesNotThrow(() => validateLinearCollectBinding(bound));
  assert.equal(bound.workspace.url_key, "example-workspace");
});

// ---------------------------------------------------------------------------
// Exact runtime: launcher, emitter, CLI.
// ---------------------------------------------------------------------------

async function createRuntimeFixture(entrypointSource = "export const fixture = true;\n") {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-linear-runtime-"));
  const runtimeRoot = path.join(root, "runtime");
  const launcherPath = path.join(runtimeRoot, "guild_hall", "linear_history", "linear_collect_launcher.mjs");
  const entrypointPath = path.join(runtimeRoot, ...LINEAR_COLLECT_RUNTIME_ENTRYPOINT.split("/"));
  await mkdir(path.dirname(launcherPath), { recursive: true });
  await writeFile(launcherPath, await readFile(path.join(MODULE_ROOT, "linear_collect_launcher.mjs")));
  await writeFile(entrypointPath, entrypointSource, "utf8");
  const files = [];
  for (const [relativePath, target] of [
    [LINEAR_COLLECT_RUNTIME_ENTRYPOINT, entrypointPath],
    ["guild_hall/linear_history/linear_collect_launcher.mjs", launcherPath],
  ]) {
    files.push({ relative_path: relativePath, sha256: sha256Bytes(await readFile(target)) });
  }
  files.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  const manifest = { schema_version: LINEAR_COLLECT_RUNTIME_MANIFEST_SCHEMA_VERSION, entrypoint: LINEAR_COLLECT_RUNTIME_ENTRYPOINT, files };
  const manifestPath = path.join(runtimeRoot, "runtime_manifest.json");
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
  await writeFile(manifestPath, manifestBytes);
  return {
    root,
    runtimeRoot,
    launcherPath,
    entrypointPath,
    manifestPath,
    manifestSha256: sha256Bytes(manifestBytes),
    nodeSha256: sha256Bytes(await readFile(process.execPath)),
  };
}

test("the exact runtime verifier pins manifest, Node, launcher, entrypoint, and the entire tree", async (t) => {
  const fixture = await createRuntimeFixture();
  const verify = (overrides = {}) => verifyExactLinearCollectRuntime({
    runtime_root: fixture.runtimeRoot,
    runtime_manifest_path: fixture.manifestPath,
    expected_runtime_manifest_sha256: fixture.manifestSha256,
    node_path: process.execPath,
    expected_node_sha256: fixture.nodeSha256,
    launcher_path: fixture.launcherPath,
    ...overrides,
  });
  assert.equal((await verify()).verified_file_count, 2);
  await assert.rejects(verify({ expected_node_sha256: `sha256:${"0".repeat(64)}` }), (error) => error.code === "node_digest_mismatch");
  await assert.rejects(verify({ expected_runtime_manifest_sha256: `sha256:${"0".repeat(64)}` }), (error) => error.code === "runtime_manifest_digest_mismatch");
  await writeFile(path.join(fixture.runtimeRoot, "unmanifested.mjs"), "export {};\n", "utf8");
  await assert.rejects(verify(), (error) => error instanceof LinearCollectRuntimeError && error.code === "runtime_tree_manifest_mismatch");

  const drift = await createRuntimeFixture();
  await writeFile(drift.entrypointPath, "export const fixture = false;\n", "utf8");
  await assert.rejects(
    verifyExactLinearCollectRuntime({
      runtime_root: drift.runtimeRoot,
      runtime_manifest_path: drift.manifestPath,
      expected_runtime_manifest_sha256: drift.manifestSha256,
      node_path: process.execPath,
      expected_node_sha256: drift.nodeSha256,
      launcher_path: drift.launcherPath,
    }),
    (error) => error.code === "runtime_file_digest_mismatch",
  );

  const secret = await createRuntimeFixture();
  await writeFile(path.join(secret.runtimeRoot, "linear_api_key.txt"), "DO_NOT_READ\n", "utf8");
  await assert.rejects(
    verifyExactLinearCollectRuntime({
      runtime_root: secret.runtimeRoot,
      runtime_manifest_path: secret.manifestPath,
      expected_runtime_manifest_sha256: secret.manifestSha256,
      node_path: process.execPath,
      expected_node_sha256: secret.nodeSha256,
      launcher_path: secret.launcherPath,
    }),
    (error) => error.code === "secret_file_forbidden",
  );

  const reparse = await createRuntimeFixture();
  const linkPath = path.join(reparse.runtimeRoot, "linked-runtime");
  try {
    await symlink(path.dirname(reparse.entrypointPath), linkPath, "junction");
  } catch (error) {
    if (error?.code === "EPERM") {
      t.diagnostic("junction creation unavailable; reparse assertion skipped");
      return;
    }
    throw error;
  }
  await assert.rejects(
    verifyExactLinearCollectRuntime({
      runtime_root: reparse.runtimeRoot,
      runtime_manifest_path: reparse.manifestPath,
      expected_runtime_manifest_sha256: reparse.manifestSha256,
      node_path: process.execPath,
      expected_node_sha256: reparse.nodeSha256,
      launcher_path: reparse.launcherPath,
    }),
    (error) => error.code === "runtime_reparse_forbidden",
  );
});

test("the emitter produces a verifiable source-lane copy and the launcher runs preflight through it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-linear-lane-emit-"));
  const laneRoot = path.join(root, "linear-collect-v1");
  const planned = await emitLinearRuntimeLane({ source_root: REPOSITORY_ROOT, target_root: laneRoot });
  assert.equal(planned.written, false);
  assert.equal(planned.file_count, LINEAR_COLLECT_RUNTIME_FILES.length);
  const written = await emitLinearRuntimeLane({ source_root: REPOSITORY_ROOT, target_root: laneRoot, write: true });
  assert.equal(written.written, true);
  assert.equal(written.manifest_sha256, planned.manifest_sha256);
  await assert.rejects(
    emitLinearRuntimeLane({ source_root: REPOSITORY_ROOT, target_root: laneRoot, write: true }),
    (error) => error.code === "target_not_empty",
  );
  const manifestPath = path.join(laneRoot, "runtime_manifest.json");
  const manifestSha256 = sha256Bytes(await readFile(manifestPath));
  assert.equal(manifestSha256, written.manifest_sha256);
  const nodeSha256 = sha256Bytes(await readFile(process.execPath));
  const launcherPath = path.join(laneRoot, "guild_hall", "linear_history", "linear_collect_launcher.mjs");
  const common = [
    launcherPath,
    "--runtime-root", laneRoot,
    "--runtime-manifest", manifestPath,
    "--expected-runtime-manifest-sha256", manifestSha256,
    "--expected-node-sha256", nodeSha256,
  ];
  const verify = await execFileAsync(process.execPath, [...common, "--verify-only"], { encoding: "utf8", windowsHide: true });
  assert.equal(verify.stderr, "");
  assert.deepEqual(JSON.parse(verify.stdout), {
    mode: "runtime_verify",
    verified_file_count: LINEAR_COLLECT_RUNTIME_FILES.length,
    repository_writes: 0,
    private_writes: 0,
    network_used: false,
  });

  const lane = await createLaneFixture({ mutateBinding: (binding) => { binding.forbidden_roots = [REPOSITORY_ROOT, laneRoot]; } });
  const preflight = await execFileAsync(process.execPath, [
    ...common,
    "--preflight",
    "--repository-root", REPOSITORY_ROOT,
    "--binding", lane.bindingPath,
    "--expected-binding-sha256", lane.bindingSha256,
    "--state-root", lane.stateRoot,
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(preflight.stderr, "");
  const aggregate = JSON.parse(preflight.stdout);
  assert.equal(aggregate.mode, "preflight");
  assert.equal(aggregate.failed_count, 0);
  assert.equal(aggregate.private_writes, 0);
  assert.equal(aggregate.network_used, false);

  const direct = await execFileAsync(process.execPath, [
    path.join(laneRoot, ...LINEAR_COLLECT_RUNTIME_ENTRYPOINT.split("/")),
    "--preflight",
    "--repository-root", REPOSITORY_ROOT,
    "--runtime-root", laneRoot,
    "--binding", lane.bindingPath,
    "--expected-binding-sha256", lane.bindingSha256,
    "--state-root", lane.stateRoot,
  ], { encoding: "utf8", windowsHide: true }).catch((error) => error);
  assert.equal(direct.code, 1);
  assert.match(direct.stderr, /linear_collect_rejected:runtime_attestation_missing/u);
});

// ---------------------------------------------------------------------------
// PowerShell registrar (Windows only).
// ---------------------------------------------------------------------------

function powershellPath() {
  return path.join(
    process.env.SystemRoot ?? path.win32.join("C:", path.win32.sep, "Windows"),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

async function registrarFixture(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const runtimeRoot = path.join(root, "runtime");
  const privateRoot = path.join(root, "private");
  const stateRoot = path.join(privateRoot, "state");
  const bindingPath = path.join(privateRoot, "config", "linear_collect.binding.json");
  const manifestPath = path.join(runtimeRoot, "runtime_manifest.json");
  const launcherPath = path.join(runtimeRoot, "guild_hall", "linear_history", "linear_collect_launcher.mjs");
  const hiddenLauncherPath = path.join(runtimeRoot, "guild_hall", "linear_history", "ops", "run-linear-collect-hidden.vbs");
  await Promise.all([
    mkdir(path.dirname(bindingPath), { recursive: true }),
    mkdir(path.dirname(launcherPath), { recursive: true }),
    mkdir(path.dirname(hiddenLauncherPath), { recursive: true }),
  ]);
  const bindingSha256 = await writePinnedJson(bindingPath, {
    schema_version: "soulforge.linear_collect.binding.v1",
    feature_enabled: true,
    private_root: privateRoot,
    state_root: stateRoot,
  });
  const manifestSha256 = await writePinnedJson(manifestPath, { fixture: "registrar-only" });
  await writeFile(launcherPath, [
    "process.stdout.write(`${JSON.stringify({",
    '  mode: "preflight", feature_status: "ON", configured_count: 1, succeeded_count: 1, failed_count: 0,',
    "  repository_writes: 0, private_writes: 0, network_used: false, error_code_counts: [],",
    "})}\\n`);",
    "",
  ].join("\n"), "utf8");
  await writeFile(hiddenLauncherPath, "' synthetic hidden launcher fixture\r\n", "utf8");
  return {
    root,
    env: {
      ...process.env,
      LINEAR_TASK_REGISTRAR: TASK_REGISTRAR_PATH,
      LINEAR_TASK_RUNTIME: runtimeRoot,
      LINEAR_TASK_REPO: REPOSITORY_ROOT,
      LINEAR_TASK_PRIVATE: privateRoot,
      LINEAR_TASK_STATE: stateRoot,
      LINEAR_TASK_BINDING: bindingPath,
      LINEAR_TASK_BINDING_SHA: bindingSha256,
      LINEAR_TASK_MANIFEST: manifestPath,
      LINEAR_TASK_MANIFEST_SHA: manifestSha256,
      LINEAR_TASK_NODE: process.execPath,
      LINEAR_TASK_NODE_SHA: sha256Bytes(await readFile(process.execPath)),
    },
  };
}

const COMMON_SPLAT = [
  "$Common = @{",
  "  RuntimeRoot = $env:LINEAR_TASK_RUNTIME; RepoRoot = $env:LINEAR_TASK_REPO;",
  "  PrivateRoot = $env:LINEAR_TASK_PRIVATE; StateRoot = $env:LINEAR_TASK_STATE;",
  "  BindingPath = $env:LINEAR_TASK_BINDING; BindingSha256 = $env:LINEAR_TASK_BINDING_SHA;",
  "  RuntimeManifestPath = $env:LINEAR_TASK_MANIFEST; RuntimeManifestSha256 = $env:LINEAR_TASK_MANIFEST_SHA;",
  "  NodePath = $env:LINEAR_TASK_NODE; NodeSha256 = $env:LINEAR_TASK_NODE_SHA",
  "}",
];

test("importing the CLI module performs no work: main runs only when the CLI is the invoked entrypoint", async () => {
  // This test file is process.argv[1] here, so the CLI's invoked-path guard
  // must keep main() from parsing the runner's argv, printing a rejection,
  // or setting the exit code.
  const exitCodeBefore = process.exitCode;
  const cli = await import("./linear_collect_cli.mjs");
  assert.equal(process.exitCode, exitCodeBefore);
  assert.equal(typeof cli.parseLinearCollectArguments, "function");
  assert.throws(
    () => cli.parseLinearCollectArguments(["--apply"]),
    (error) => error?.code === "cli_argument_missing",
  );
  assert.throws(
    () => cli.parseLinearCollectArguments(["--apply", "--preflight"]),
    (error) => error?.code === "cli_mode_invalid",
  );
  assert.deepEqual(
    cli.parseLinearCollectArguments([
      "--preflight",
      "--repository-root", "r",
      "--runtime-root", "t",
      "--binding", "b",
      "--expected-binding-sha256", "s",
      "--state-root", "x",
    ]),
    {
      mode: "preflight",
      repository_root: "r",
      runtime_root: "t",
      binding_path: "b",
      expected_binding_sha256: "s",
      state_root: "x",
    },
  );
});

test("PowerShell registrar dry-run is deterministic and performs no task mutation", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await registrarFixture("soulforge-linear-task-dry-run-");
  const harnessPath = path.join(fixture.root, "registrar-harness.ps1");
  await writeFile(harnessPath, [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    "$global:LinearRegisterCount = 0",
    "function Get-ScheduledTask { [CmdletBinding()] param([string]$TaskName) return $null }",
    "function Register-ScheduledTask { [CmdletBinding()] param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description,[switch]$Force,$Xml) $global:LinearRegisterCount += 1 }",
    ...COMMON_SPLAT,
    "$First = & $env:LINEAR_TASK_REGISTRAR @Common",
    "$Second = & $env:LINEAR_TASK_REGISTRAR @Common",
    "Write-Output ($First -join \"`n\")",
    "Write-Output ($Second -join \"`n\")",
    "Write-Output \"register_count=$global:LinearRegisterCount\"",
    "",
  ].join("\r\n"), "utf8");
  const { stdout, stderr } = await execFileAsync(powershellPath(), [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", harnessPath,
  ], { encoding: "utf8", windowsHide: true, env: fixture.env });
  assert.equal(stderr, "");
  const lines = stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 3, stdout);
  assert.match(lines[0], /^linear collect task dry-run attested: plan_digest=sha256:[0-9a-f]{64} interval=PT15M mutation=false$/u);
  assert.equal(lines[0], lines[1]);
  assert.equal(lines[2], "register_count=0");
});

test("PowerShell registrar removes a newly registered task when XML attestation fails", {
  skip: process.platform !== "win32",
}, async () => {
  const fixture = await registrarFixture("soulforge-linear-task-rollback-");
  const harnessPath = path.join(fixture.root, "registrar-rollback-harness.ps1");
  await writeFile(harnessPath, [
    "Set-StrictMode -Version Latest",
    '$ErrorActionPreference = "Stop"',
    "$global:LinearTaskExists = $false",
    "$global:LinearTaskRegisterCount = 0",
    "$global:LinearTaskDisableCount = 0",
    "$global:LinearTaskUnregisterCount = 0",
    "$global:LinearTaskTriggerStopAtDurationEnd = $null",
    "function Get-ScheduledTask { [CmdletBinding()] param([string]$TaskName) if ($global:LinearTaskExists) { return [pscustomobject]@{ State = 'Ready' } } return $null }",
    "function New-ScheduledTaskAction { [CmdletBinding()] param($Execute,$Argument,$WorkingDirectory) return [pscustomobject]@{} }",
    "function New-ScheduledTaskTrigger { [CmdletBinding()] param([switch]$Once,$At,$RepetitionInterval) return [pscustomobject]@{ Repetition = [pscustomobject]@{ Interval = 'PT15M'; Duration = $null; StopAtDurationEnd = $true } } }",
    "function New-ScheduledTaskPrincipal { [CmdletBinding()] param($UserId,$LogonType,$RunLevel) return [pscustomobject]@{} }",
    "function New-ScheduledTaskSettingsSet { [CmdletBinding()] param($MultipleInstances,$RestartCount,$RestartInterval,$ExecutionTimeLimit,[switch]$StartWhenAvailable,[switch]$Hidden,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries) return [pscustomobject]@{} }",
    "function Register-ScheduledTask { [CmdletBinding()] param($TaskName,$Action,$Trigger,$Principal,$Settings,$Description,[switch]$Force,$Xml) if ($null -ne $Trigger) { $global:LinearTaskTriggerStopAtDurationEnd = @($Trigger)[0].Repetition.StopAtDurationEnd }; $global:LinearTaskRegisterCount += 1; $global:LinearTaskExists = $true; return [pscustomobject]@{} }",
    "function Export-ScheduledTask { [CmdletBinding()] param($TaskName) return '<Task><Triggers /></Task>' }",
    "function Disable-ScheduledTask { [CmdletBinding()] param($TaskName) $global:LinearTaskDisableCount += 1; return [pscustomobject]@{} }",
    "function Unregister-ScheduledTask { [CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='High')] param($TaskName) $global:LinearTaskUnregisterCount += 1; $global:LinearTaskExists = $false }",
    ...COMMON_SPLAT,
    "$Dry = & $env:LINEAR_TASK_REGISTRAR @Common",
    "$Match = [regex]::Match(($Dry -join \"`n\"), 'plan_digest=(sha256:[0-9a-f]{64})')",
    "if (-not $Match.Success) { throw 'dry-run digest unavailable' }",
    "$Caught = $false",
    "$CaughtMessage = $null",
    "try { & $env:LINEAR_TASK_REGISTRAR @Common -Register -ExpectedDryRunDigest $Match.Groups[1].Value -Confirm:$false } catch { $Caught = $true; $CaughtMessage = $_.Exception.Message }",
    "$WrongDigest = $false",
    "try { & $env:LINEAR_TASK_REGISTRAR @Common -Register -ExpectedDryRunDigest ('sha256:' + ('0' * 64)) -Confirm:$false } catch { $WrongDigest = $true }",
    "[ordered]@{ caught=$Caught; caught_message=$CaughtMessage; wrong_digest_refused=$WrongDigest; register_count=$global:LinearTaskRegisterCount; disable_count=$global:LinearTaskDisableCount; unregister_count=$global:LinearTaskUnregisterCount; exists=$global:LinearTaskExists; trigger_stop_at_duration_end=$global:LinearTaskTriggerStopAtDurationEnd } | ConvertTo-Json -Compress",
    "",
  ].join("\r\n"), "utf8");
  const { stdout, stderr } = await execFileAsync(powershellPath(), [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", harnessPath,
  ], { encoding: "utf8", windowsHide: true, env: fixture.env });
  assert.equal(stderr, "");
  const result = JSON.parse(stdout.trim());
  assert.equal(result.caught, true, result.caught_message);
  assert.equal(result.wrong_digest_refused, true);
  assert.equal(result.register_count, 1, result.caught_message);
  assert.equal(result.disable_count, 1, result.caught_message);
  assert.equal(result.unregister_count, 1, result.caught_message);
  assert.equal(result.exists, false, result.caught_message);
  assert.equal(result.trigger_stop_at_duration_end, false, result.caught_message);
});

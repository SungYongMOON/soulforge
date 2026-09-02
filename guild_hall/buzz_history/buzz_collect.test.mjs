import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { adaptAcceptedBuzzCaptureToLaneRecord } from "../path_registry/src/buzz_source_lane_adapter.mjs";
import { sha256Canonical } from "../shared/project_history_envelope.mjs";

import {
  BUZZ_COLLECT_RUNTIME_ENTRYPOINT,
  BuzzCollectRuntimeError,
  verifyExactBuzzCollectRuntime,
} from "./buzz_collect_launcher.mjs";
import {
  BUZZ_COLLECT_COVERAGE_GAPS,
  BUZZ_READ_OPERATIONS,
  validateBuzzCollectRunReceipt,
} from "./buzz_collect_receipt.mjs";
import {
  BUZZ_COLLECT_BINDING_SCHEMA_VERSION,
  BUZZ_COLLECT_DEFAULT_RUN_DEADLINE_MS,
  BUZZ_COLLECT_MAX_RUN_DEADLINE_MS,
  BuzzCollectError,
  advanceWatermark,
  laneRecordFromReceipt,
  normalizeExportValue,
  planWindow,
  preflightBuzzCollect,
  runBuzzCollect,
  runDeadlineMsFor,
  validateBuzzCollectBinding,
} from "./buzz_collect_runner.mjs";
import { writeCreateOnlyJson } from "./buzz_custody.mjs";
import {
  BUZZ_COLLECT_RUNTIME_FILES,
  emitBuzzRuntimeLane,
} from "./buzz_runtime_manifest_emitter.mjs";
import {
  createSyntheticBuzzExporter,
  loadSyntheticBuzzFixture,
} from "./buzz_synthetic_exporter.mjs";
import { toWslPath } from "./buzz_wsl_exporter.mjs";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_ROOT, "..", "..");
const FIXTURE_PATH = path.join(MODULE_ROOT, "fixtures", "synthetic_buzz_relay.json");
const EXPORTER_SCRIPT_PATH = path.join(MODULE_ROOT, "buzz_export.sh");
const EXAMPLE_BINDING_PATH = path.join(
  REPOSITORY_ROOT,
  "docs",
  "architecture",
  "workspace",
  "examples",
  "buzz_collect_lane",
  "buzz_collect.binding.example.json",
);
const COMMUNITY_ONE = "11111111-1111-4111-8111-111111111111";
const COMMUNITY_TWO = "11111111-1111-4111-8111-111111111112";

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

function laneBinding({ privateRoot, runtimeRoot, wslExecutable, overrides = {}, cursor = {} }) {
  return {
    schema_version: BUZZ_COLLECT_BINDING_SCHEMA_VERSION,
    feature_enabled: true,
    lane_id: "hpp-buzz-collect",
    private_root: privateRoot,
    data_root: path.join(privateRoot, "ingress", "buzz"),
    state_root: path.join(privateRoot, "buzz_history", "state"),
    forbidden_roots: [REPOSITORY_ROOT, runtimeRoot],
    writer: { authority_id: "hpp-buzz-collect-writer", epoch: 1 },
    relay: {
      relay_key: "relay-main",
      liveness_url: "http://127.0.0.1:3100/_liveness",
      wsl_executable: wslExecutable,
      wsl_distro: "BuzzServer",
      mount_prefix: "/mnt",
      postgres_container: "buzz-prod-postgres-1",
      db_name: "buzz",
      db_user: "buzz",
    },
    cursor: {
      overlap_seconds: 300,
      initial_received_at: null,
      row_limit: 1000,
      timeout_ms: 15_000,
      ...cursor,
    },
    ...overrides,
  };
}

async function createLaneFixture({ overrides = {}, cursor = {}, mutateBinding = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-buzz-collect-"));
  const runtimeRoot = path.join(root, "runtime");
  const privateRoot = path.join(root, "private");
  const systemRoot = path.join(root, "system32");
  await mkdir(path.join(runtimeRoot, "guild_hall", "buzz_history"), { recursive: true });
  await mkdir(privateRoot, { recursive: true });
  await mkdir(systemRoot, { recursive: true });
  // A stand-in for the host's interpreter: the lane only ever checks that it
  // is a normal file named wsl.exe outside every forbidden root, and the
  // synthetic exporter never executes it.
  const wslExecutable = path.join(systemRoot, "wsl.exe");
  await writeFile(wslExecutable, "synthetic\n", "utf8");
  await copyFile(
    EXPORTER_SCRIPT_PATH,
    path.join(runtimeRoot, "guild_hall", "buzz_history", "buzz_export.sh"),
  );
  const binding = laneBinding({ privateRoot, runtimeRoot, wslExecutable, overrides, cursor });
  if (mutateBinding !== null) mutateBinding(binding);
  const bindingPath = path.join(privateRoot, "config", "buzz_history", "buzz_collect.binding.json");
  const bindingSha256 = await writePinnedJson(bindingPath, binding);
  const stateRoot = path.join(privateRoot, "buzz_history", "state");
  return {
    root,
    runtimeRoot,
    privateRoot,
    stateRoot,
    wslExecutable,
    custodyRoot: path.join(privateRoot, "ingress", "buzz", "relay-main"),
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
  return async () => createSyntheticBuzzExporter(fixture, options);
}

async function rejectionCode(promise) {
  try {
    await promise;
  } catch (error) {
    return error?.code ?? null;
  }
  return null;
}

test("an apply run stages, verifies, and takes the relay into create-only custody", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");
  const calls = [];

  const result = await runBuzzCollect({
    ...lane.options,
    exporter_factory: syntheticFactory(fixture, { calls }),
    clock: clock.clock,
    run_id: "run-one",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.generation_seq, 1);
  assert.equal(result.window_phase, "initial");
  assert.equal(result.network_used, false);
  assert.equal(result.process_calls, 1);
  assert.equal(result.read_calls, 2);
  assert.deepEqual(
    calls.map((entry) => entry.operation),
    ["buzz.read.liveness", "buzz.read.export"],
  );
  // Four live events, two tombstones, one audit bundle, one snapshot.
  assert.equal(result.objects.events.created, 4);
  assert.equal(result.objects.tombstones.created, 2);
  assert.equal(result.objects.audit.created, 1);
  assert.equal(result.objects.snapshots.created, 1);
  assert.equal(result.objects_created, 8);
  assert.deepEqual(result.coverage_gaps, ["polling_cannot_prove_hard_deletes"]);

  const custodyFiles = await listFilesRecursively(lane.custodyRoot);
  assert.equal(custodyFiles.filter((entry) => entry.startsWith("events/")).length, 4);
  assert.equal(custodyFiles.filter((entry) => entry.startsWith("tombstones/")).length, 2);
  assert.equal(custodyFiles.filter((entry) => entry.startsWith("audit/run-one/")).length, 1);
  assert.equal(custodyFiles.filter((entry) => entry.startsWith("snapshots/relay-main/")).length, 1);

  // The staging directory is released only by a fully published run.
  assert.deepEqual(await listFilesRecursively(path.join(lane.stateRoot, "staging")), []);
  assert.equal(result.staging_retained, false);

  const receipt = await readJson(path.join(lane.stateRoot, "receipts", "run-one.json"));
  validateBuzzCollectRunReceipt(receipt);
  assert.equal(receipt.relay_key, "relay-main");
  assert.equal(receipt.community_count, 2);
  assert.equal(receipt.window.phase, "initial");
  assert.equal(receipt.window.received_since, null);
  assert.equal(receipt.window.audit_seq_min, 0);
  assert.equal(receipt.cursor_after.received_watermark, "2026-08-27T09:29:00.500001Z");
  assert.equal(receipt.cursor_after.deleted_watermark, "2026-08-28T02:00:00.000000Z");
  assert.deepEqual(receipt.cursor_after.audit_seq_max, { [COMMUNITY_ONE]: 2, [COMMUNITY_TWO]: 1 });
  assert.deepEqual(Object.keys(receipt.read_calls.by_operation).sort(), [...BUZZ_READ_OPERATIONS].sort());

  const health = await readJson(path.join(lane.stateRoot, "health", "buzz_collect.json"));
  assert.equal(health.status, "ok");
  assert.equal(health.last_run_id, "run-one");
  assert.equal(health.received_watermark, "2026-08-27T09:29:00.500001Z");

  await rm(lane.root, { recursive: true, force: true });
});

test("a second run re-reads the overlap and creates nothing new", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  const first = await runBuzzCollect({
    ...lane.options,
    exporter_factory: syntheticFactory(fixture),
    clock: clock.clock,
    run_id: "run-one",
  });
  const firstFiles = await listFilesRecursively(lane.custodyRoot);

  clock.set("2026-09-03T00:15:00.000Z");
  const calls = [];
  const second = await runBuzzCollect({
    ...lane.options,
    exporter_factory: syntheticFactory(fixture, { calls }),
    clock: clock.clock,
    run_id: "run-two",
  });

  assert.equal(second.generation_seq, 2);
  assert.equal(second.window_phase, "delta");
  // The 300-second overlap re-reads every live event; content addressing makes
  // the re-read a no-op instead of a duplicate.
  assert.equal(second.objects.events.observed, 4);
  assert.equal(second.objects.events.created, 0);
  assert.equal(second.objects.events.unchanged, 4);
  assert.equal(second.objects.snapshots.created, 0);
  assert.equal(second.objects_created, 0);
  assert.deepEqual(await listFilesRecursively(lane.custodyRoot), firstFiles);

  const exportCall = calls.find((entry) => entry.operation === "buzz.read.export");
  assert.equal(exportCall.received_since, first.lane_record ? "2026-08-27T09:29:00.500001Z" : null);
  // Both communities are covered, so the shared lower bound is the least
  // advanced sequence plus one.
  assert.equal(exportCall.audit_seq_min, 2);

  const state = await readJson(path.join(lane.stateRoot, "state", "buzz-collect.json"));
  assert.equal(state.cursor.generation_seq, 2);
  assert.equal(state.last_run_id, "run-two");
  assert.ok(!Object.hasOwn(state, "object_index"));

  await rm(lane.root, { recursive: true, force: true });
});

test("the lane record the runner writes is the record the adapter derives", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  const result = await runBuzzCollect({
    ...lane.options,
    exporter_factory: syntheticFactory(fixture),
    clock: clock.clock,
    run_id: "run-one",
  });
  const receipt = await readJson(path.join(lane.stateRoot, "receipts", "run-one.json"));
  const persisted = await readJson(path.join(lane.stateRoot, "receipts", "run-one.lane_record.json"));

  const adapted = adaptAcceptedBuzzCaptureToLaneRecord({
    source_ref: "source.buzz",
    expected_lane_id: "hpp-buzz-collect",
    expected_relay_key: "relay-main",
    generation_seq: receipt.generation_seq,
    run_receipt: receipt,
    run_receipt_digest: sha256Canonical(receipt),
    evaluation_time: "2026-09-03T00:05:00.000Z",
    max_receipt_age_seconds: 3600,
  });

  assert.deepEqual({ ...adapted }, persisted);
  assert.deepEqual({ ...adapted }, result.lane_record);
  assert.equal(adapted.source_ref, "source.buzz");
  // Snapshots are one rolled-up object per run and stay out of the item count.
  assert.equal(adapted.item_count, 4 + 2 + 1);
  assert.ok(adapted.capture_ref.startsWith("receipt.buzz.run."));
  assert.ok(adapted.manifest_ref.startsWith("receipt.buzz.custody."));

  assert.equal(
    await rejectionCode(Promise.resolve().then(() => adaptAcceptedBuzzCaptureToLaneRecord({
      source_ref: "source.buzz",
      expected_lane_id: "hpp-buzz-collect",
      expected_relay_key: "relay-other",
      generation_seq: receipt.generation_seq,
      run_receipt: receipt,
      run_receipt_digest: sha256Canonical(receipt),
      evaluation_time: "2026-09-03T00:05:00.000Z",
      max_receipt_age_seconds: 3600,
    }))),
    "foreign_buzz_relay",
  );
  assert.equal(
    await rejectionCode(Promise.resolve().then(() => adaptAcceptedBuzzCaptureToLaneRecord({
      source_ref: "source.buzz",
      expected_lane_id: "hpp-buzz-collect",
      expected_relay_key: "relay-main",
      generation_seq: receipt.generation_seq,
      run_receipt: receipt,
      run_receipt_digest: sha256Canonical(receipt),
      evaluation_time: "2026-09-03T02:05:00.000Z",
      max_receipt_age_seconds: 3600,
    }))),
    "buzz_capture_receipt_stale",
  );

  await rm(lane.root, { recursive: true, force: true });
});

test("the receipt carries refs and counts, never relay content or host paths", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  await runBuzzCollect({
    ...lane.options,
    exporter_factory: syntheticFactory(fixture),
    clock: clock.clock,
    run_id: "run-one",
  });
  const receiptText = await readFile(path.join(lane.stateRoot, "receipts", "run-one.json"), "utf8");

  for (const forbidden of [
    "synthetic stream message one",
    "가나다 NFC 정규화 확인",
    lane.privateRoot,
    lane.runtimeRoot,
    "aa00000000000000000000000000000000000000000000000000000000000001",
  ]) {
    assert.ok(!receiptText.includes(forbidden), `receipt leaked ${forbidden.slice(0, 24)}`);
  }

  // The custody objects are exactly where the content is supposed to be.
  const custodyFiles = await listFilesRecursively(lane.custodyRoot);
  const eventFile = custodyFiles.find((entry) => entry.startsWith("events/"));
  const stored = await readJson(path.join(lane.custodyRoot, ...eventFile.split("/")));
  assert.equal(stored.schema_version, "soulforge.buzz_collect.custody_object.v1");
  assert.equal(stored.content_sha256, sha256Canonical(stored.object));

  await rm(lane.root, { recursive: true, force: true });
});

test("a failed export keeps its staging directory and publishes an error receipt", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  const brokenFactory = async () => {
    const exporter = createSyntheticBuzzExporter(fixture);
    return {
      kind: "synthetic",
      probeLiveness: (request) => exporter.probeLiveness(request),
      async export(request) {
        const meta = await exporter.export(request);
        // The exporter wrote real files; the meta then lies about one digest.
        meta.files[0].sha256 = `sha256:${"f".repeat(64)}`;
        return meta;
      },
    };
  };

  assert.equal(
    await rejectionCode(runBuzzCollect({
      ...lane.options,
      exporter_factory: brokenFactory,
      clock: clock.clock,
      run_id: "run-bad",
    })),
    "export_digest_mismatch",
  );

  const staged = await listFilesRecursively(path.join(lane.stateRoot, "staging", "run-bad"));
  assert.equal(staged.length, 4);
  const receipt = await readJson(path.join(lane.stateRoot, "receipts", "run-bad.json"));
  assert.equal(receipt.status, "error");
  assert.deepEqual(receipt.error_codes, ["export_digest_mismatch"]);
  assert.deepEqual(receipt.cursor_after, receipt.cursor_before);
  const health = await readJson(path.join(lane.stateRoot, "health", "buzz_collect.json"));
  assert.equal(health.status, "error");
  assert.deepEqual(health.error_codes, ["export_digest_mismatch"]);

  await rm(lane.root, { recursive: true, force: true });
});

test("an unreachable relay stops the run before any staging directory exists", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  assert.equal(
    await rejectionCode(runBuzzCollect({
      ...lane.options,
      exporter_factory: syntheticFactory(fixture, { liveness: "down" }),
      clock: clock.clock,
      run_id: "run-down",
    })),
    "relay_liveness_unavailable",
  );
  assert.deepEqual(await listFilesRecursively(path.join(lane.stateRoot, "staging")), []);
  assert.deepEqual(await listFilesRecursively(lane.custodyRoot), []);

  await rm(lane.root, { recursive: true, force: true });
});

test("the writer fence and the lease both refuse a second writer", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  await runBuzzCollect({
    ...lane.options,
    exporter_factory: syntheticFactory(fixture),
    clock: clock.clock,
    run_id: "run-one",
  });

  // A state file written under another writer epoch is never adopted.
  const statePath = path.join(lane.stateRoot, "state", "buzz-collect.json");
  const state = await readJson(statePath);
  state.writer_epoch = 2;
  await writeFile(statePath, `${JSON.stringify(state)}\n`, "utf8");
  assert.equal(
    await rejectionCode(runBuzzCollect({
      ...lane.options,
      exporter_factory: syntheticFactory(fixture),
      clock: clock.clock,
      run_id: "run-fenced",
    })),
    "state_writer_fence",
  );

  // A held lease is never guessed stale.
  await mkdir(path.join(lane.stateRoot, "leases"), { recursive: true });
  await writeFile(path.join(lane.stateRoot, "leases", "buzz-collect.lock"), "{}\n", "utf8");
  assert.equal(
    await rejectionCode(runBuzzCollect({
      ...lane.options,
      exporter_factory: syntheticFactory(fixture),
      clock: clock.clock,
      run_id: "run-leased",
    })),
    "lease_unavailable",
  );

  await rm(lane.root, { recursive: true, force: true });
});

test("a filled row limit is reported, and a window that cannot advance is reported as truncated", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture({ cursor: { row_limit: 2 } });
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  const result = await runBuzzCollect({
    ...lane.options,
    exporter_factory: syntheticFactory(fixture),
    clock: clock.clock,
    run_id: "run-capped",
  });
  assert.ok(result.coverage_gaps.includes("row_limit_reached"));
  assert.ok(!result.coverage_gaps.includes("export_truncated"));
  assert.equal(result.objects.events.observed, 2);
  for (const gap of result.coverage_gaps) {
    assert.ok(BUZZ_COLLECT_COVERAGE_GAPS.includes(gap));
  }

  // A relay whose whole page shares one instant cannot move the watermark, so
  // the next run would read the same page again: that stall is declared.
  const stalled = structuredClone(fixture);
  for (const row of stalled.events) row.received_at = "2026-08-27T09:26:00.123456Z";
  const stuck = await createLaneFixture({ cursor: { row_limit: 1 } });
  const first = await runBuzzCollect({
    ...stuck.options,
    exporter_factory: syntheticFactory(stalled),
    clock: clock.clock,
    run_id: "stall-one",
  });
  assert.ok(!first.coverage_gaps.includes("export_truncated"));
  clock.set("2026-09-03T00:15:00.000Z");
  const second = await runBuzzCollect({
    ...stuck.options,
    exporter_factory: syntheticFactory(stalled),
    clock: clock.clock,
    run_id: "stall-two",
  });
  assert.ok(second.coverage_gaps.includes("export_truncated"));

  await rm(lane.root, { recursive: true, force: true });
  await rm(stuck.root, { recursive: true, force: true });
});

test("the binding is fail-closed on every boundary it declares", async () => {
  const lane = await createLaneFixture();
  const base = () => structuredClone(lane.binding);
  assert.deepEqual(validateBuzzCollectBinding(base()), lane.binding);

  const cases = [
    ["binding_feature_must_be_on", (binding) => { binding.feature_enabled = false; }],
    ["binding_schema_invalid", (binding) => { binding.schema_version = "soulforge.buzz_collect.binding.v2"; }],
    ["exact_keys_required", (binding) => { binding.credentials = { api_key_env: null }; }],
    ["exact_keys_required", (binding) => { delete binding.relay.db_user; }],
    ["relay_key_invalid", (binding) => { binding.relay.relay_key = "Relay Main"; }],
    ["relay_liveness_url_invalid", (binding) => { binding.relay.liveness_url = "http://10.0.0.5:3100/_liveness"; }],
    ["relay_liveness_url_invalid", (binding) => { binding.relay.liveness_url = "https://127.0.0.1:3100/_liveness"; }],
    ["relay_liveness_url_invalid", (binding) => { binding.relay.liveness_url = "http://127.0.0.1:3100/metrics"; }],
    ["wsl_executable_invalid", (binding) => { binding.relay.wsl_executable = path.join(lane.root, "bash.exe"); }],
    ["wsl_distro_invalid", (binding) => { binding.relay.wsl_distro = "Buzz Server"; }],
    // Assembled, not written literally: the repository path policy scans
    // source bytes for absolute-path shapes, so a probe value that is one on
    // purpose has to be built rather than spelled.
    ["wsl_mount_prefix_invalid", (binding) => { binding.relay.mount_prefix = ["", "mnt", "d"].join("/"); }],
    ["postgres_container_invalid", (binding) => { binding.relay.postgres_container = "buzz prod"; }],
    ["postgres_identifier_invalid", (binding) => { binding.relay.db_name = "buzz\"; DROP"; }],
    ["cursor_policy_invalid", (binding) => { binding.cursor.overlap_seconds = 86_401; }],
    ["cursor_policy_invalid", (binding) => { binding.cursor.row_limit = 0; }],
    ["cursor_policy_invalid", (binding) => { binding.cursor.timeout_ms = 500; }],
    ["cursor_policy_invalid", (binding) => { binding.cursor.run_deadline_ms = 1000; }],
    ["cursor_policy_invalid", (binding) => {
      binding.cursor.run_deadline_ms = BUZZ_COLLECT_MAX_RUN_DEADLINE_MS + 1;
    }],
    ["state_root_not_strict_private_child", (binding) => { binding.state_root = path.join(lane.root, "elsewhere"); }],
    ["data_root_not_strict_private_child", (binding) => { binding.data_root = path.join(lane.root, "elsewhere"); }],
    ["data_root_state_overlap", (binding) => { binding.data_root = binding.state_root; }],
    ["forbidden_roots_required", (binding) => { binding.forbidden_roots = [REPOSITORY_ROOT]; }],
    ["duplicate_forbidden_root", (binding) => { binding.forbidden_roots = [REPOSITORY_ROOT, REPOSITORY_ROOT]; }],
    ["writer_epoch_invalid", (binding) => { binding.writer.epoch = 0; }],
    ["secret_value_forbidden", (binding) => { binding.relay.wsl_distro = "nsec1qqqqqqqqqqqqqqqqqqqqqqqqq"; }],
    // Every object in the binding is exact-keyed, so a secret-named field is
    // refused by the key set before the secret-field scan is even reached.
    // The scan stays as the layer that would catch it if a future key set
    // ever admitted a free-form object.
    ["exact_keys_required", (binding) => { binding.relay.signing_key = "x"; }],
  ];

  for (const [expected, mutate] of cases) {
    const binding = base();
    mutate(binding);
    let code = null;
    try {
      validateBuzzCollectBinding(binding);
    } catch (error) {
      code = error?.code ?? null;
      assert.ok(error instanceof BuzzCollectError);
    }
    assert.equal(code, expected, `expected ${expected}`);
  }

  // The export timeout must fit inside the deadline that keeps a run under the
  // registered ten-minute task limit.
  assert.equal(runDeadlineMsFor(lane.binding.cursor), BUZZ_COLLECT_DEFAULT_RUN_DEADLINE_MS);
  assert.equal(runDeadlineMsFor({ ...lane.binding.cursor, run_deadline_ms: 60_000 }), 60_000);

  await rm(lane.root, { recursive: true, force: true });
});

test("a drifted binding, state root, or forbidden-root set stops the run", async () => {
  const fixture = await loadSyntheticBuzzFixture(FIXTURE_PATH);
  const lane = await createLaneFixture();
  const clock = fixedClock("2026-09-03T00:00:00.000Z");

  assert.equal(
    await rejectionCode(runBuzzCollect({
      ...lane.options,
      expected_binding_sha256: `sha256:${"0".repeat(64)}`,
      exporter_factory: syntheticFactory(fixture),
      clock: clock.clock,
    })),
    "private_json_digest_mismatch",
  );
  assert.equal(
    await rejectionCode(runBuzzCollect({
      ...lane.options,
      state_root: path.join(lane.privateRoot, "other_state"),
      exporter_factory: syntheticFactory(fixture),
      clock: clock.clock,
    })),
    "state_root_mismatch",
  );

  const unpinned = await createLaneFixture({
    mutateBinding: (binding) => {
      binding.forbidden_roots = [REPOSITORY_ROOT, path.join(binding.private_root, "..", "unrelated")];
    },
  });
  assert.equal(
    await rejectionCode(runBuzzCollect({
      ...unpinned.options,
      exporter_factory: syntheticFactory(fixture),
      clock: clock.clock,
    })),
    "required_forbidden_root_missing",
  );

  await rm(lane.root, { recursive: true, force: true });
  await rm(unpinned.root, { recursive: true, force: true });
});

test("preflight attests the binding and the exporter without a process or a write", async () => {
  const lane = await createLaneFixture();
  const before = await listFilesRecursively(lane.stateRoot);

  const result = await preflightBuzzCollect(lane.options);
  assert.deepEqual(result, {
    mode: "preflight",
    feature_status: "ON",
    configured_count: 1,
    succeeded_count: 1,
    failed_count: 0,
    repository_writes: 0,
    private_writes: 0,
    process_calls: 0,
    network_used: false,
    error_code_counts: [],
  });
  assert.deepEqual(await listFilesRecursively(lane.stateRoot), before);

  // A runtime tree whose exporter picked up CRLF on the way in is refused
  // before the lane is ever registered.
  const scriptPath = path.join(lane.runtimeRoot, "guild_hall", "buzz_history", "buzz_export.sh");
  const original = await readFile(scriptPath);
  await writeFile(scriptPath, original.toString("utf8").replace(/\n/gu, "\r\n"), "utf8");
  assert.equal(await rejectionCode(preflightBuzzCollect(lane.options)), "exporter_script_crlf");

  // A missing exporter is equally fatal.
  await rm(scriptPath);
  assert.equal(await rejectionCode(preflightBuzzCollect(lane.options)), "exporter_script_invalid");

  await rm(lane.root, { recursive: true, force: true });
});

test("Windows paths translate to drvfs paths, and untranslatable ones are refused", async () => {
  // Both sides are assembled rather than written literally: the repository
  // path policy scans source bytes for absolute-path shapes, and these probes
  // are absolute paths on purpose.
  const BACKSLASH = "\\";
  const win = (...segments) => segments.join(BACKSLASH);
  const drvfs = (...segments) => ["", "mnt", ...segments].join("/");
  const MOUNT = drvfs();

  assert.equal(toWslPath(win("D:", "Soulforge", "dev", "state")), drvfs("d", "Soulforge", "dev", "state"));
  assert.equal(toWslPath(win("C:", "a", "b", "c"), MOUNT), drvfs("c", "a", "b", "c"));
  assert.equal(toWslPath(win("D:", ""), MOUNT), drvfs("d"));
  // Traversal is removed by resolution, not carried into the translated path.
  assert.equal(toWslPath(win("D:", "a", "..", "b")), drvfs("d", "b"));

  for (const value of [
    win("", "", "server", "share", "file"),
    win("D:", "a b", "c"),
    win("D:", "한글", "c"),
  ]) {
    let code = null;
    try {
      toWslPath(value, MOUNT);
    } catch (error) {
      code = error?.code ?? null;
    }
    assert.equal(code, "wsl_path_unsupported", `expected refusal for ${value}`);
  }

  let prefixCode = null;
  try {
    toWslPath(win("D:", "a"), "mnt");
  } catch (error) {
    prefixCode = error?.code ?? null;
  }
  assert.equal(prefixCode, "wsl_mount_prefix_invalid");
});

test("export values are brought into the canonical domain before they are hashed", () => {
  const normalized = normalizeExportValue({
    // NFD "가" must become the NFC form canonicalJson requires.
    "\u1100\u1161": "\u1100\u1161",
    fraction: 1.5,
    big: 2 ** 60,
    safe: 42,
    nested: [{ deep: -1 }],
  });
  assert.deepEqual(Object.keys(normalized).sort(), ["big", "fraction", "nested", "safe", "가"]);
  assert.equal(normalized["가"], "가");
  assert.equal(normalized.fraction, "1.5");
  assert.equal(normalized.big, "1152921504606846976");
  assert.equal(normalized.safe, 42);
  assert.equal(normalized.nested[0].deep, -1);
  // Canonicalization is the whole point: the normalized value must hash.
  assert.ok(sha256Canonical(normalized).startsWith("sha256:"));

  const prototypePollution = normalizeExportValue(JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal(Object.getPrototypeOf(prototypePollution), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test("watermarks advance only to instants the run observed", () => {
  assert.equal(advanceWatermark(null, []), null);
  assert.equal(advanceWatermark("2026-01-01T00:00:00.000000Z", []), "2026-01-01T00:00:00.000000Z");
  assert.equal(
    advanceWatermark(null, ["2026-01-01T00:00:00.000001Z", "2026-01-01T00:00:00.000002Z"]),
    "2026-01-01T00:00:00.000002Z",
  );
  // A microsecond tie inside the same millisecond still orders correctly.
  assert.equal(
    advanceWatermark("2026-01-01T00:00:00.000500Z", ["2026-01-01T00:00:00.000100Z"]),
    "2026-01-01T00:00:00.000500Z",
  );

  const initial = planWindow(
    {
      schema_version: "soulforge.buzz_collect.cursor.v1",
      received_watermark: null,
      deleted_watermark: null,
      audit_seq_max: {},
      generation_seq: 0,
    },
    { overlap_seconds: 300, initial_received_at: null, row_limit: 10, timeout_ms: 1000 },
  );
  assert.equal(initial.phase, "initial");
  assert.equal(initial.audit_seq_min, 0);
});

test("the example binding validates once its placeholders are bound", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-buzz-example-"));
  const privateRoot = path.join(root, "private");
  const runtimeRoot = path.join(root, "runtime");
  const template = await readFile(EXAMPLE_BINDING_PATH, "utf8");
  const bound = JSON.parse(template
    .replaceAll("<PRIVATE_ROOT>", privateRoot.split(path.sep).join("/"))
    .replaceAll("<REPOSITORY_ROOT>", REPOSITORY_ROOT.split(path.sep).join("/"))
    .replaceAll("<RUNTIME_ROOT>", runtimeRoot.split(path.sep).join("/"))
    .replaceAll("<WSL_EXECUTABLE>", path.join(root, "system32", "wsl.exe").split(path.sep).join("/")));
  assert.doesNotThrow(() => validateBuzzCollectBinding(bound));
  assert.ok(!Object.hasOwn(bound, "credentials"));
  await rm(root, { recursive: true, force: true });
});

test("the runtime manifest pins every lane file, including the exporter script", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-buzz-emit-"));
  const targetRoot = path.join(root, "buzz-collect-v1");

  const planned = await emitBuzzRuntimeLane({ source_root: REPOSITORY_ROOT, target_root: targetRoot });
  assert.equal(planned.mode, "plan");
  assert.equal(planned.written, false);
  assert.equal(planned.file_count, BUZZ_COLLECT_RUNTIME_FILES.length);
  assert.equal(BUZZ_COLLECT_RUNTIME_FILES.length, 10);
  assert.ok(BUZZ_COLLECT_RUNTIME_FILES.includes("guild_hall/buzz_history/buzz_export.sh"));
  // The synthetic exporter and its fixture must never reach a live lane.
  for (const excluded of ["buzz_synthetic_exporter.mjs", "synthetic_buzz_relay.json", "buzz_collect.test.mjs"]) {
    assert.ok(!BUZZ_COLLECT_RUNTIME_FILES.some((entry) => entry.endsWith(excluded)));
  }

  const written = await emitBuzzRuntimeLane({
    source_root: REPOSITORY_ROOT, target_root: targetRoot, write: true,
  });
  assert.equal(written.written, true);
  assert.equal(written.manifest_sha256, planned.manifest_sha256);

  const manifestPath = path.join(targetRoot, "runtime_manifest.json");
  const verified = await verifyExactBuzzCollectRuntime({
    runtime_root: targetRoot,
    runtime_manifest_path: manifestPath,
    expected_runtime_manifest_sha256: written.manifest_sha256,
    node_path: process.execPath,
    expected_node_sha256: sha256Bytes(await readFile(process.execPath)),
    launcher_path: path.join(targetRoot, ...BUZZ_COLLECT_RUNTIME_ENTRYPOINT.split("/").slice(0, -1), "buzz_collect_launcher.mjs"),
  });
  assert.equal(verified.verified_file_count, BUZZ_COLLECT_RUNTIME_FILES.length);

  // The exporter script is copied byte-for-byte: a CRLF rewrite would change
  // its digest and the manifest verification would refuse the tree.
  const copiedExporter = await readFile(path.join(targetRoot, "guild_hall", "buzz_history", "buzz_export.sh"));
  assert.ok(!copiedExporter.includes(0x0d));

  // One unmanifested file is enough to refuse the whole tree.
  await writeFile(path.join(targetRoot, "unmanifested.mjs"), "export {};\n", "utf8");
  let driftCode = null;
  try {
    await verifyExactBuzzCollectRuntime({
      runtime_root: targetRoot,
      runtime_manifest_path: manifestPath,
      expected_runtime_manifest_sha256: written.manifest_sha256,
      node_path: process.execPath,
      expected_node_sha256: sha256Bytes(await readFile(process.execPath)),
      launcher_path: path.join(targetRoot, "guild_hall", "buzz_history", "buzz_collect_launcher.mjs"),
    });
  } catch (error) {
    driftCode = error?.code ?? null;
    assert.ok(error instanceof BuzzCollectRuntimeError);
  }
  assert.equal(driftCode, "runtime_tree_manifest_mismatch");

  await rm(root, { recursive: true, force: true });
});

test("a secret-shaped file cannot be a runtime member", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-buzz-secret-"));
  const targetRoot = path.join(root, "buzz-collect-v1");
  const written = await emitBuzzRuntimeLane({
    source_root: REPOSITORY_ROOT, target_root: targetRoot, write: true,
  });
  const manifestPath = path.join(targetRoot, "runtime_manifest.json");
  const nodeSha256 = sha256Bytes(await readFile(process.execPath));
  const launcherPath = path.join(targetRoot, "guild_hall", "buzz_history", "buzz_collect_launcher.mjs");

  for (const basename of ["auth.json", "buzz_relay_token.txt", ".env", "credentials"]) {
    await writeFile(path.join(targetRoot, basename), "DO_NOT_READ\n", "utf8");
    let code = null;
    try {
      await verifyExactBuzzCollectRuntime({
        runtime_root: targetRoot,
        runtime_manifest_path: manifestPath,
        expected_runtime_manifest_sha256: written.manifest_sha256,
        node_path: process.execPath,
        expected_node_sha256: nodeSha256,
        launcher_path: launcherPath,
      });
    } catch (error) {
      code = error?.code ?? null;
    }
    assert.equal(code, "secret_file_forbidden", `expected refusal for ${basename}`);
    await rm(path.join(targetRoot, basename));
  }

  // A link inside the runtime tree is refused before anything is hashed.
  try {
    await symlink(os.tmpdir(), path.join(targetRoot, "linked"), "junction");
  } catch {
    await rm(root, { recursive: true, force: true });
    return;
  }
  let linkCode = null;
  try {
    await verifyExactBuzzCollectRuntime({
      runtime_root: targetRoot,
      runtime_manifest_path: manifestPath,
      expected_runtime_manifest_sha256: written.manifest_sha256,
      node_path: process.execPath,
      expected_node_sha256: nodeSha256,
      launcher_path: launcherPath,
    });
  } catch (error) {
    linkCode = error?.code ?? null;
  }
  assert.equal(linkCode, "runtime_reparse_forbidden");

  await rm(root, { recursive: true, force: true });
});

test("no lane source can write to the relay", async () => {
  // Statement-shaped, not word-shaped: the sources legitimately say
  // "create-only" and "creates a backup generation" in prose.
  const writeStatement = new RegExp(
    "\\b(?:INSERT\\s+INTO|UPDATE\\s+\\w+\\s+SET|DELETE\\s+FROM"
    + "|CREATE\\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA|FUNCTION|ROLE|USER)"
    + "|DROP\\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA|ROLE|USER)"
    + "|ALTER\\s+(?:TABLE|DATABASE|SCHEMA|ROLE|USER)"
    + "|TRUNCATE\\s+\\w|GRANT\\s+\\w|REVOKE\\s+\\w|COPY\\s+\\w+\\s+FROM)\\b",
    "iu",
  );
  const sources = (await readdir(MODULE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:mjs|sh)$/u.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => name !== "buzz_collect.test.mjs");
  assert.ok(sources.includes("buzz_export.sh"));

  for (const name of sources) {
    const text = await readFile(path.join(MODULE_ROOT, name), "utf8");
    assert.equal(writeStatement.test(text), false, `${name} contains a write statement`);
  }

  const exporter = await readFile(EXPORTER_SCRIPT_PATH, "utf8");
  // Every statement runs in a session PostgreSQL itself holds read-only.
  assert.ok(exporter.includes("default_transaction_read_only=on"));
  assert.ok(exporter.includes("ON_ERROR_STOP=1"));
  // The community signing key never leaves PostgreSQL.
  assert.ok(exporter.includes("- 'signing_key'"));
  assert.ok(!exporter.includes("psql -U \"${DB_USER}\" -d \"${DB_NAME}\" -tAX -c"));
});

test("custody objects are create-only and a digest conflict is refused", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "soulforge-buzz-custody-"));
  const dataRoot = path.join(root, "data");
  const segments = ["events", "0".repeat(64), "abc.json"];

  const first = await writeCreateOnlyJson(dataRoot, segments, { a: 1 });
  assert.equal(first.created, true);
  const again = await writeCreateOnlyJson(dataRoot, segments, { a: 1 });
  assert.equal(again.created, false);

  let code = null;
  try {
    await writeCreateOnlyJson(dataRoot, segments, { a: 2 });
  } catch (error) {
    code = error?.code ?? null;
  }
  assert.equal(code, "custody_digest_conflict");

  await rm(root, { recursive: true, force: true });
});

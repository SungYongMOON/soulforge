import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  HELD_LINEAR_LB1_V2_PROVIDER_ADAPTER,
  HELD_LINEAR_LB1_V2_STORAGE_ADAPTER,
  LINEAR_LB1_V2_COLLECTION_SCHEMA_VERSION,
  LINEAR_LB1_V2_DIMENSIONS,
  LINEAR_LB1_ZERO_EFFECTS,
  LinearLb1V2Error,
  buildImmutableLinearLb1BackupRunV2,
  collectFeatureOffLinearLb1V2Fixture,
  serializeBackupRunV2,
} from "./linear_lb1_v2.mjs";
import {
  LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION,
  createLinearLb1OneShotRunner,
} from "./linear_lb1_one_shot_runner.mjs";
import {
  LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
  evaluateLinearLb1OwnerGateV2,
} from "./linear_lb1_owner_gate_v2.mjs";
import {
  HELD_LINEAR_LB1_V2_CLAIM_ADAPTER,
  createInMemoryClaimStore,
  createInMemoryStorageAdapter,
  createSyntheticLinearReaderAdapter,
} from "./linear_lb1_synthetic_adapters.mjs";
import {
  makeCompleteLinearLb1V2Fixture,
} from "./linear_lb1_v2_fixture.mjs";

function hexSeed(seed) {
  return createHash("sha256").update(String(seed)).digest("hex");
}

function ref(seed, contentId) {
  const h = hexSeed(seed);
  const actualContentId = contentId ?? `sha256:${h}`;
  return {
    entity_id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`,
    revision_id: `${h.slice(32, 40)}-${h.slice(40, 44)}-4${h.slice(45, 48)}-9${h.slice(49, 52)}-${h.slice(52, 64)}`,
    content_id: actualContentId,
    content_hash_alg: "sha256",
  };
}

const CLAIM_REF = ref("claim_store_runner_01");
const READER_REF = ref("linear_reader_runner_01");
const STORAGE_REF = ref("storage_adapter_runner_01");

function makeTestClock(nowIso = "2026-08-20T00:30:00.000Z") {
  let currentMs = Date.parse(nowIso);
  return {
    nowIso() {
      return new Date(currentMs).toISOString();
    },
    nowMs() {
      return currentMs;
    },
    advance(ms) {
      currentMs += ms;
    },
  };
}

function makeClosedRequest(token = "single-use-token-001", targetId = "target-revision-001") {
  return {
    schema_version: LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    owner_decision: {
      state: "approved",
      decision_ref: ref("decision_runner_01"),
      approved_at_utc: "2026-08-20T00:00:00.000Z",
      expires_at_utc: "2026-08-21T00:00:00.000Z",
    },
    writer_identity: {
      writer_id: "soulforge-main-node-01",
      hostname: "soulforge-hpp-host",
      platform: "win32",
      epoch: 1,
    },
    source: {
      provider: "linear",
      scope_mode: "entire_workspace",
      workspace_ref: ref("workspace_runner_01"),
      team_ids: [],
      project_ids: [],
      credential_ref: ref("credential_runner_01"),
      credential_scope: "read_only",
      dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
    },
    target: {
      kind: "google_drive_folder",
      target_ref: ref(targetId),
      display_label: "Soulforge Linear LB1 v2 Backup Target",
      storage_write_authority_ref: ref("storage_authority_runner_01"),
      create_only: true,
      overwrite_allowed: false,
      public_share_allowed: false,
    },
    claim_store: {
      claim_store_ref: CLAIM_REF,
      single_use_token: token,
    },
    adapters: {
      linear_reader_adapter_ref: READER_REF,
      storage_adapter_ref: STORAGE_REF,
    },
    artifact_layout: {
      snapshot_schema_version: "soulforge.backup_controller.linear_lb1.snapshot.v2",
      manifest_schema_version: "soulforge.backup_controller.linear_lb1.manifest.v2",
      revision_schema_version: "soulforge.backup_controller.linear_lb1.revision.v2",
      layout_kind: "canonical_sealed_envelope_v2",
    },
    resource_limits: {
      max_issues: 10000,
      max_total_bytes: 104857600,
      max_runtime_ms: 600000,
    },
    retention: {
      daily_generations: 30,
      monthly_generations: 12,
      rpo_hours: 24,
    },
    failure_policy: {
      partial_result: "HOLD",
      retry_policy: "fresh_owner_gate_required",
      target_cleanup_allowed: false,
      source_mutation_allowed: false,
    },
    restore_acceptance: {
      human_reviewer_ref: ref("human_reviewer_runner_01"),
      required_dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
      restore_check_required: true,
      tabular_only_accepted: false,
    },
    one_shot: {
      run_limit: 1,
      writer_kind: "append_only_revision",
      linear_mutation: false,
      webhook_registration: false,
      scheduler_activation: false,
    },
  };
}

function trustedPinFor(packet) {
  const preview = evaluateLinearLb1OwnerGateV2(packet, null);
  const packetSha256 = preview.receipt.packet_sha256;
  return {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2",
    gate_ref: ref("runner_pin_gate_ref", packetSha256),
    expected_packet_sha256: packetSha256,
    valid_at: "2026-08-20T00:00:00.000Z",
    known_at: "2026-08-20T01:00:00.000Z",
    expires_at: "2026-08-21T00:00:00.000Z",
  };
}

test("successful async one-shot execution follows gate -> claim -> read -> seal -> write -> readback -> restore -> RESTORE_REVIEW_CANDIDATE", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF, async: true });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({
    adapter_ref: READER_REF,
    fixture: makeCompleteLinearLb1V2Fixture(),
    async: true,
  });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF, async: true });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-success-001", "run-target-001");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);

  assert.equal(result.schema_version, LINEAR_LB1_ONE_SHOT_RUNNER_SCHEMA_VERSION);
  assert.equal(result.status, "RESTORE_REVIEW_CANDIDATE");
  assert.equal(result.reason, "SUCCESS");
  assert.equal(result.claim_consumed, true);
  assert.equal(result.claim_result.success, true);
  assert.equal(result.claim_result.claim_consumed, true);
  assert.equal(result.run.run_status, "complete");
  assert.equal(result.restore_check.complete, true);
  assert.equal(result.restore_check.human_accepted, false);
  assert.equal(result.candidate_state.human_accepted, false);
  assert.equal(result.candidate_state.claim_ceiling, "RESTORE_REVIEW_CANDIDATE");
  assert.deepEqual(result.external_effects, LINEAR_LB1_ZERO_EFFECTS);

  // Deterministic unique run key from packet digest + writer epoch (not target folder ID)
  const expectedKeyPrefix = `linear-lb1-v2-run-${pin.expected_packet_sha256.replace(/^sha256:/, "")}-e1`;
  assert.equal(result.run.run_key, expectedKeyPrefix);
  assert.notEqual(result.run.run_key, request.target.target_ref.entity_id);

  // Public result is body-free and omits snapshot / full bytes
  assert.equal(result.run.revision.snapshot, undefined);
  assert.equal(Object.hasOwn(result, "bytes"), false);
  assert.equal(Object.hasOwn(result, "sealedBytes"), false);

  assert.deepEqual(result.synthetic_effects, {
    claim_attempts: 1,
    provider_reads: 1,
    storage_writes: 1,
    storage_reads: 1,
    restore_checks: 1,
  });

  assert.equal(claimStore.isConsumed("token-success-001"), true);
  assert.equal(storageAdapter.hasRevision(expectedKeyPrefix), true);
  assert.equal(Object.isFrozen(result), true);
});
test("synchronous adapters are safely supported by async execute", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF, async: false });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({
    adapter_ref: READER_REF,
    fixture: makeCompleteLinearLb1V2Fixture(),
    async: false,
  });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF, async: false });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-sync-001", "run-target-sync");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "RESTORE_REVIEW_CANDIDATE");
  assert.equal(result.claim_consumed, true);
});

test("gate failure halts immediately before claim store mutation (claim_consumed: false)", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-gate-fail-001", "run-target-002");
  request.owner_decision.state = "pending"; // Blocks gate
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);

  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "OWNER_GATE_BLOCKED");
  assert.equal(result.claim_consumed, false);
  assert.equal(result.claim_result, null);
  assert.equal(result.run, null);
  assert.equal(result.synthetic_effects.claim_attempts, 0);
  assert.equal(result.synthetic_effects.provider_reads, 0);
  assert.equal(result.synthetic_effects.storage_writes, 0);
  assert.equal(claimStore.isConsumed("token-gate-fail-001"), false);
});

test("unpinned adapter refs return HOLD before claim with claim_consumed: false", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: ref("mismatched_claim_ref") });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-unpinned-001", "run-target-unpinned");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "ADAPTER_REF_MISMATCH");
  assert.equal(result.claim_consumed, false);
  assert.equal(result.synthetic_effects.claim_attempts, 0);
  assert.equal(claimStore.isConsumed("token-unpinned-001"), false);
});

test("execution time owner decision expiry or pin expiry at runner start produces HOLD with claim_consumed: false", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const expiredClock = makeTestClock("2026-08-22T00:00:00.000Z"); // After decision & pin expires_at (2026-08-21T00:00:00.000Z)

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock: expiredClock,
  });

  const request = makeClosedRequest("token-expired-001", "run-target-expired");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "OWNER_DECISION_EXPIRED");
  assert.equal(result.claim_consumed, false);
  assert.equal(result.synthetic_effects.claim_attempts, 0);
  assert.equal(claimStore.isConsumed("token-expired-001"), false);
});

test("replaying same single-use claim token returns HOLD_CONSUMED with claim_consumed: true and no reader calls", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-replay-001", "run-target-003");
  const pin = trustedPinFor(request);

  const firstRun = await runner.execute(request, pin);
  assert.equal(firstRun.status, "RESTORE_REVIEW_CANDIDATE");
  assert.equal(linearReaderAdapter.getCallCount(), 1);

  // Replay attempt with same token
  const secondRun = await runner.execute(request, pin);
  assert.equal(secondRun.status, "HOLD_CONSUMED");
  assert.equal(secondRun.reason, "CLAIM_CONSUMED_OR_FAILED");
  assert.equal(secondRun.claim_consumed, true);
  assert.equal(secondRun.claim_result.success, false);
  assert.equal(secondRun.run, null);
  assert.equal(linearReaderAdapter.getCallCount(), 1); // No second read!
  assert.deepEqual(secondRun.external_effects, LINEAR_LB1_ZERO_EFFECTS);
});

test("adapter rejection or throw is normalized to stable fixed code without exposing raw error object or message", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({
    adapter_ref: READER_REF,
    async: true,
    failWith: new Error("raw_secret_database_stack_trace_leak"),
  });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-async-reject-001", "run-target-reject");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "READ_FAILED");
  assert.equal(result.claim_consumed, true);
  assert.equal(Object.hasOwn(result, "error"), false);
  assert.equal(JSON.stringify(result).includes("raw_secret_database_stack_trace_leak"), false);
});

test("resource limit max_issues violation halts before store with HOLD_CONSUMED and claim_consumed: true", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-low-issues-001", "run-target-issues");
  request.resource_limits.max_issues = 1; // Fixture has 2 issues!
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "MAX_ISSUES_EXCEEDED");
  assert.equal(result.claim_consumed, true);
  assert.equal(result.synthetic_effects.storage_writes, 0);
});

function makeOneIssueSnapshot() {
  const base = makeCompleteLinearLb1V2Fixture();
  base.cutoff.total_issues = 1;
  const issue1 = { ...base.issues[0] };
  issue1.relations = [];
  base.issues = [issue1];
  return base;
}

test("regression: reader return with own snapshot getter (decoy 1 issue on precheck, real 2 issues on build) under max_issues=1 halts before store", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const decoySnapshot = makeOneIssueSnapshot();
  const realFixture = makeCompleteLinearLb1V2Fixture();

  const hostileReaderAdapter = {
    adapter_kind: "synthetic_linear_reader",
    feature_state: "off",
    adapter_ref: READER_REF,
    collectSnapshot() {
      const collection = {
        schema_version: LINEAR_LB1_V2_COLLECTION_SCHEMA_VERSION,
        collector: {
          kind: "public_synthetic_fixture",
          feature_state: "off",
          provider_calls: 0,
          storage_writes: 0,
        },
        collection_status: "complete",
        declared_missing_dimensions: [],
        errors: [],
        effects: { ...LINEAR_LB1_ZERO_EFFECTS },
      };
      Object.defineProperty(collection, "snapshot", {
        get() {
          const stack = new Error().stack ?? "";
          const isBuild = stack.includes("buildImmutableLinearLb1BackupRunV2") || stack.includes("normalizeFeatureOffCollection");
          if (isBuild) {
            return realFixture;
          }
          return decoySnapshot;
        },
        enumerable: true,
        configurable: true,
      });
      return collection;
    },
  };

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter: hostileReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-getter-regression-001", "run-target-getter-regression");
  request.resource_limits.max_issues = 1;
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "MAX_ISSUES_EXCEEDED");
  assert.equal(result.claim_consumed, true);
  assert.equal(result.synthetic_effects.storage_writes, 0);
});

test("resource limit max_total_bytes violation halts before store with HOLD_CONSUMED and claim_consumed: true", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-low-bytes-001", "run-target-bytes");
  request.resource_limits.max_total_bytes = 100; // Too small for sealed envelope
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "MAX_TOTAL_BYTES_EXCEEDED");
  assert.equal(result.claim_consumed, true);
  assert.equal(result.synthetic_effects.storage_writes, 0);
});

test("resource limit max_runtime_ms exceeded halts with HOLD_CONSUMED and claim_consumed: true", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  // Reader that advances clock past max_runtime_ms
  const linearReaderAdapter = {
    adapter_kind: "synthetic_linear_reader",
    feature_state: "off",
    adapter_ref: READER_REF,
    collectSnapshot() {
      clock.advance(700000); // Exceeds 600000ms limit
      return makeCompleteLinearLb1V2Fixture();
    },
  };
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-runtime-001", "run-target-runtime");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "MAX_RUNTIME_EXCEEDED");
  assert.equal(result.claim_consumed, true);
});

test("storage write collision on pre-existing revision returns HOLD_CONSUMED with claim_consumed: true and overwrite=0", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const request = makeClosedRequest("token-collision-001", "colliding-target-001");
  const pin = trustedPinFor(request);

  const runKey = `linear-lb1-v2-run-${pin.expected_packet_sha256.replace(/^sha256:/, "")}-e1`;
  storageAdapter.writeRevisionCreateOnly(runKey, Buffer.from("existing"));

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "STORAGE_WRITE_FAILED");
  assert.equal(result.claim_consumed, true);
  assert.equal(result.write_result.code, "COLLISION");
  assert.equal(result.restore_check, null);
  assert.equal(storageAdapter.overwrite_allowed, false);
  assert.equal(storageAdapter.delete_allowed, false);
  assert.equal(storageAdapter.public_share_allowed, false);
});

test("storage readback corruption produces HOLD_CONSUMED and STORAGE_READBACK_FAILED", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");
  const corruptStorageAdapter = {
    adapter_kind: "corrupt_storage",
    feature_state: "off",
    adapter_ref: STORAGE_REF,
    writeRevisionCreateOnly(runKey, bytes) {
      return { success: true, run_key: runKey, bytes_written: bytes.length };
    },
    readRevision(runKey) {
      return { run_key: runKey, bytes: Buffer.from("{ invalid_corrupt_json") };
    },
  };

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter: corruptStorageAdapter,
    clock,
  });

  const request = makeClosedRequest("token-corrupt-001", "run-target-corrupt");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "STORAGE_READBACK_FAILED");
  assert.equal(result.claim_consumed, true);
});

test("runner initialization rejects invalid or non-closed bindings", () => {
  const validClock = makeTestClock();
  assert.throws(() => createLinearLb1OneShotRunner(null), (e) => e instanceof LinearLb1V2Error);
  assert.throws(() => createLinearLb1OneShotRunner({}), (e) => e instanceof LinearLb1V2Error);
  // Extra unexpected keys rejected (exact closed shape)
  assert.throws(
    () => createLinearLb1OneShotRunner({
      claimStore: createInMemoryClaimStore({ claim_store_ref: CLAIM_REF }),
      linearReaderAdapter: createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF }),
      storageAdapter: createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF }),
      clock: validClock,
      extra_unexpected_key: "forbidden",
    }),
    (e) => e instanceof LinearLb1V2Error && e.code === "linear_lb1_runner_binding_invalid",
  );
});

test("held claim adapter throws LinearLb1V2Error and has exact descriptor", () => {
  assert.equal(typeof HELD_LINEAR_LB1_V2_CLAIM_ADAPTER.claim_store_ref, "object");
  assert.throws(() => HELD_LINEAR_LB1_V2_CLAIM_ADAPTER.consumeOnce(), (e) => e instanceof LinearLb1V2Error && e.code === "linear_lb1_v2_claim_hold");
});

test("B1: post-claim clock.nowMs throwing or returning NaN/non-safe integer is normalized to HOLD_CONSUMED with receipt", async () => {
  let callCount = 0;
  const throwingClock = {
    nowIso() {
      return "2026-08-20T00:30:00.000Z";
    },
    nowMs() {
      callCount += 1;
      if (callCount === 1) return Date.parse("2026-08-20T00:30:00.000Z");
      throw new Error("post_claim_clock_crash");
    },
  };

  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });

  const runner = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock: throwingClock,
  });

  const request = makeClosedRequest("token-b1-throw-001", "run-target-b1-throw");
  const pin = trustedPinFor(request);

  const result = await runner.execute(request, pin);
  assert.equal(result.status, "HOLD_CONSUMED");
  assert.equal(result.reason, "CLOCK_INVALID");
  assert.equal(result.claim_consumed, true);
  assert.equal(result.claim_result.success, true);
  assert.equal(claimStore.isConsumed("token-b1-throw-001"), true);

  // NaN return on second call
  let nanCallCount = 0;
  const nanClock = {
    nowIso() {
      return "2026-08-20T00:30:00.000Z";
    },
    nowMs() {
      nanCallCount += 1;
      if (nanCallCount === 1) return Date.parse("2026-08-20T00:30:00.000Z");
      return NaN;
    },
  };

  const runnerNan = createLinearLb1OneShotRunner({
    claimStore: createInMemoryClaimStore({ claim_store_ref: CLAIM_REF }),
    linearReaderAdapter,
    storageAdapter,
    clock: nanClock,
  });

  const reqNan = makeClosedRequest("token-b1-nan-001", "run-target-b1-nan");
  const pinNan = trustedPinFor(reqNan);
  const resultNan = await runnerNan.execute(reqNan, pinNan);
  assert.equal(resultNan.status, "HOLD_CONSUMED");
  assert.equal(resultNan.reason, "CLOCK_INVALID");
  assert.equal(resultNan.claim_consumed, true);
});

test("B2: adapter results with throwing getters, proxies, or truthy non-boolean claim success cannot escape", async () => {
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  // 2a. Throwing getter on claim result
  const throwingClaimStore = {
    adapter_kind: "throwing_claim_store",
    feature_state: "off",
    claim_store_ref: CLAIM_REF,
    consumeOnce() {
      const obj = {};
      Object.defineProperty(obj, "success", {
        get() {
          throw new Error("claim_result_getter_explosion");
        },
      });
      return obj;
    },
  };

  const runner2a = createLinearLb1OneShotRunner({
    claimStore: throwingClaimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });
  const req2a = makeClosedRequest("token-b2-getter-001", "run-target-b2-getter");
  const pin2a = trustedPinFor(req2a);
  const res2a = await runner2a.execute(req2a, pin2a);
  assert.equal(res2a.status, "HOLD_CONSUMED");
  assert.equal(res2a.reason, "CLAIM_CONSUMED_OR_FAILED");
  assert.equal(res2a.claim_consumed, true);
  assert.equal(res2a.claim_result.success, false);

  // 2a-2. Throwing proxy trap on consumeOnce
  const throwingProxyClaimStore = {
    adapter_kind: "proxy_claim_store",
    feature_state: "off",
    claim_store_ref: CLAIM_REF,
    consumeOnce() {
      return new Proxy({}, {
        getOwnPropertyDescriptor() {
          throw new Error("proxy_trap_explosion");
        },
      });
    },
  };
  const runner2a2 = createLinearLb1OneShotRunner({
    claimStore: throwingProxyClaimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });
  const res2a2 = await runner2a2.execute(req2a, pin2a);
  assert.equal(res2a2.status, "HOLD_CONSUMED");
  assert.equal(res2a2.reason, "CLAIM_CONSUMED_OR_FAILED");
  assert.equal(res2a2.claim_consumed, true);
  assert.equal(res2a2.claim_result.success, false);

  // 2a-3. Rejected promise / error throw in consumeOnce
  const rejectingClaimStore = {
    adapter_kind: "rejecting_claim_store",
    feature_state: "off",
    claim_store_ref: CLAIM_REF,
    async consumeOnce() {
      throw new Error("claim_async_rejected");
    },
  };
  const runner2a3 = createLinearLb1OneShotRunner({
    claimStore: rejectingClaimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });
  const res2a3 = await runner2a3.execute(req2a, pin2a);
  assert.equal(res2a3.status, "HOLD_CONSUMED");
  assert.equal(res2a3.reason, "CLAIM_FAILED");
  assert.equal(res2a3.claim_consumed, true);

  // 2b. Truthy non-boolean claim success
  const truthyClaimStore = {
    adapter_kind: "truthy_claim_store",
    feature_state: "off",
    claim_store_ref: CLAIM_REF,
    consumeOnce() {
      return { success: 1, token: "truthy" };
    },
  };
  const runner2b = createLinearLb1OneShotRunner({
    claimStore: truthyClaimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });
  const req2b = makeClosedRequest("token-b2-truthy-001", "run-target-b2-truthy");
  const pin2b = trustedPinFor(req2b);
  const res2b = await runner2b.execute(req2b, pin2b);
  assert.equal(res2b.status, "HOLD_CONSUMED");
  assert.equal(res2b.reason, "CLAIM_CONSUMED_OR_FAILED");
  assert.equal(res2b.claim_consumed, true);
  assert.equal(res2b.claim_result.success, false);

  // 2c. Throwing getter on write result
  const throwingWriteStorage = {
    adapter_kind: "throwing_write_storage",
    feature_state: "off",
    adapter_ref: STORAGE_REF,
    writeRevisionCreateOnly() {
      const obj = {};
      Object.defineProperty(obj, "success", {
        get() {
          throw new Error("write_result_getter_explosion");
        },
      });
      return obj;
    },
    readRevision() {
      return { run_key: "k", bytes: Buffer.from("b") };
    },
  };
  const runner2c = createLinearLb1OneShotRunner({
    claimStore: createInMemoryClaimStore({ claim_store_ref: CLAIM_REF }),
    linearReaderAdapter,
    storageAdapter: throwingWriteStorage,
    clock,
  });
  const req2c = makeClosedRequest("token-b2-write-001", "run-target-b2-write");
  const pin2c = trustedPinFor(req2c);
  const res2c = await runner2c.execute(req2c, pin2c);
  assert.equal(res2c.status, "HOLD_CONSUMED");
  assert.equal(res2c.reason, "STORAGE_WRITE_FAILED");
  assert.equal(res2c.claim_consumed, true);
  assert.equal(res2c.write_result.success, false);

  // 2d. Throwing getter on readback bytes
  const throwingReadStorage = {
    adapter_kind: "throwing_read_storage",
    feature_state: "off",
    adapter_ref: STORAGE_REF,
    writeRevisionCreateOnly(runKey, bytes) {
      return { success: true, run_key: runKey, bytes_written: bytes.length };
    },
    readRevision() {
      const obj = {};
      Object.defineProperty(obj, "bytes", {
        get() {
          throw new Error("read_bytes_getter_explosion");
        },
      });
      return obj;
    },
  };
  const runner2d = createLinearLb1OneShotRunner({
    claimStore: createInMemoryClaimStore({ claim_store_ref: CLAIM_REF }),
    linearReaderAdapter,
    storageAdapter: throwingReadStorage,
    clock,
  });
  const req2d = makeClosedRequest("token-b2-read-001", "run-target-b2-read");
  const pin2d = trustedPinFor(req2d);
  const res2d = await runner2d.execute(req2d, pin2d);
  assert.equal(res2d.status, "HOLD_CONSUMED");
  assert.equal(res2d.reason, "STORAGE_READBACK_FAILED");
  assert.equal(res2d.claim_consumed, true);
});

test("B3: clock start requires canonical UTC ISO string matching nowMs and exact expiry boundaries", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF });

  // 3a. Non-canonical UTC string (no ms)
  const noMsClock = {
    nowIso() {
      return "2026-08-20T00:30:00Z";
    },
    nowMs() {
      return Date.parse("2026-08-20T00:30:00.000Z");
    },
  };
  const runner3a = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock: noMsClock,
  });
  const req3a = makeClosedRequest("token-b3-noms", "target-b3-noms");
  const pin3a = trustedPinFor(req3a);
  const res3a = await runner3a.execute(req3a, pin3a);
  assert.equal(res3a.status, "HOLD");
  assert.equal(res3a.reason, "CLOCK_INVALID");
  assert.equal(res3a.claim_consumed, false);

  // 3b. Mismatch between nowIso and nowMs
  const mismatchClock = {
    nowIso() {
      return "2026-08-20T00:30:00.000Z";
    },
    nowMs() {
      return Date.parse("2026-08-20T00:30:00.000Z") + 1000;
    },
  };
  const runner3b = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock: mismatchClock,
  });
  const res3b = await runner3b.execute(req3a, pin3a);
  assert.equal(res3b.status, "HOLD");
  assert.equal(res3b.reason, "CLOCK_INVALID");
  assert.equal(res3b.claim_consumed, false);

  // 3c. Exact boundary: nowIso === owner_decision.expires_at_utc -> OWNER_DECISION_EXPIRED
  const decisionExpiryClock = makeTestClock("2026-08-21T00:00:00.000Z"); // Exactly equal to expires_at_utc
  const runner3c = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock: decisionExpiryClock,
  });
  const req3c = makeClosedRequest("token-b3-dec-exp", "target-b3-dec-exp");
  const pin3c = trustedPinFor(req3c);
  const res3c = await runner3c.execute(req3c, pin3c);
  assert.equal(res3c.status, "HOLD");
  assert.equal(res3c.reason, "OWNER_DECISION_EXPIRED");
  assert.equal(res3c.claim_consumed, false);

  // 3d. Exact boundary: nowIso === trustedExpectedRequestPin.expires_at -> TRUSTED_PIN_EXPIRED
  const pinExpiryClock = makeTestClock("2026-08-21T00:00:00.000Z");
  const req3d = makeClosedRequest("token-b3-pin-exp", "target-b3-pin-exp");
  req3d.owner_decision.expires_at_utc = "2026-08-22T00:00:00.000Z";
  const pin3d = trustedPinFor(req3d);
  pin3d.expires_at = "2026-08-21T00:00:00.000Z"; // Exactly equal to nowIso
  const runner3d = createLinearLb1OneShotRunner({
    claimStore,
    linearReaderAdapter,
    storageAdapter,
    clock: pinExpiryClock,
  });
  const res3d = await runner3d.execute(req3d, pin3d);
  assert.equal(res3d.status, "HOLD");
  assert.equal(res3d.reason, "TRUSTED_PIN_EXPIRED");
  assert.equal(res3d.claim_consumed, false);

  // 3e. Exact boundary: nowIso === approved_at_utc and valid_at -> passes start check
  const startExactClock = makeTestClock("2026-08-20T00:00:00.000Z");
  const req3e = makeClosedRequest("token-b3-start-exact", "target-b3-start-exact");
  const pin3e = trustedPinFor(req3e);
  const runner3e = createLinearLb1OneShotRunner({
    claimStore: createInMemoryClaimStore({ claim_store_ref: CLAIM_REF }),
    linearReaderAdapter,
    storageAdapter: createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF }),
    clock: startExactClock,
  });
  const res3e = await runner3e.execute(req3e, pin3e);
  assert.equal(res3e.status, "RESTORE_REVIEW_CANDIDATE");
});

test("B4: async request mutation during claim await does not alter frozen owned request snapshot", async () => {
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF, async: true });
  const storageAdapter = createInMemoryStorageAdapter({ adapter_ref: STORAGE_REF, async: true });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  const request = makeClosedRequest("token-b4-mutate", "target-b4-mutate");
  const originalReviewerRef = JSON.parse(JSON.stringify(request.restore_acceptance.human_reviewer_ref));

  const mutatingClaimStore = {
    adapter_kind: "mutating_claim_store",
    feature_state: "off",
    claim_store_ref: CLAIM_REF,
    async consumeOnce(token) {
      // Maliciously mutate the caller's request object during await
      request.writer_identity.epoch = 999;
      request.resource_limits.max_total_bytes = 10;
      request.restore_acceptance.human_reviewer_ref = ref("tampered_reviewer_ref");
      request.source.scope_mode = "allowlist";
      return { success: true, token };
    },
  };

  const runner = createLinearLb1OneShotRunner({
    claimStore: mutatingClaimStore,
    linearReaderAdapter,
    storageAdapter,
    clock,
  });

  const pin = trustedPinFor(request);
  const result = await runner.execute(request, pin);

  assert.equal(result.status, "RESTORE_REVIEW_CANDIDATE");
  assert.equal(result.claim_consumed, true);

  // Run key must use snapshot epoch 1, not mutated 999
  const expectedKey = `linear-lb1-v2-run-${pin.expected_packet_sha256.replace(/^sha256:/, "")}-e1`;
  assert.equal(result.run.run_key, expectedKey);
  assert.equal(result.candidate_state.run_key, expectedKey);

  // Reviewer ref must remain the frozen original snapshot ref, not tampered
  assert.deepEqual(result.candidate_state.reviewer_ref, originalReviewerRef);
});

test("B5: storage readback detects substituted self-consistent envelope or byte tampering and returns HOLD_CONSUMED", async () => {
  const claimStore = createInMemoryClaimStore({ claim_store_ref: CLAIM_REF });
  const linearReaderAdapter = createSyntheticLinearReaderAdapter({ adapter_ref: READER_REF });
  const clock = makeTestClock("2026-08-20T00:30:00.000Z");

  // 5a. Substituted self-consistent envelope
  const foreignRun = buildImmutableLinearLb1BackupRunV2({
    run_key: "linear-lb1-v2-run-foreign",
    collection: collectFeatureOffLinearLb1V2Fixture(makeCompleteLinearLb1V2Fixture()),
  });
  const foreignBytes = serializeBackupRunV2(foreignRun);

  const substitutedStorageAdapter = {
    adapter_kind: "substituted_storage",
    feature_state: "off",
    adapter_ref: STORAGE_REF,
    writeRevisionCreateOnly(runKey, bytes) {
      return { success: true, run_key: runKey, bytes_written: bytes.length };
    },
    readRevision(runKey) {
      return { run_key: runKey, bytes: foreignBytes };
    },
  };

  const runner5a = createLinearLb1OneShotRunner({
    claimStore: createInMemoryClaimStore({ claim_store_ref: CLAIM_REF }),
    linearReaderAdapter,
    storageAdapter: substitutedStorageAdapter,
    clock,
  });

  const req5a = makeClosedRequest("token-b5-subst", "target-b5-subst");
  const pin5a = trustedPinFor(req5a);
  const res5a = await runner5a.execute(req5a, pin5a);

  assert.equal(res5a.status, "HOLD_CONSUMED");
  assert.equal(res5a.reason, "STORAGE_READBACK_FAILED");
  assert.equal(res5a.claim_consumed, true);
  assert.equal(res5a.restore_check, null);

  // 5b. Tampered / corrupted bytes (single byte altered)
  const tamperedStorageAdapter = {
    adapter_kind: "tampered_storage",
    feature_state: "off",
    adapter_ref: STORAGE_REF,
    writtenBytes: null,
    writeRevisionCreateOnly(runKey, bytes) {
      this.writtenBytes = Buffer.from(bytes);
      return { success: true, run_key: runKey, bytes_written: bytes.length };
    },
    readRevision(runKey) {
      const copy = Buffer.from(this.writtenBytes);
      copy[copy.length - 1] = copy[copy.length - 1] ^ 0xff; // Flip bits
      return { run_key: runKey, bytes: copy };
    },
  };

  const runner5b = createLinearLb1OneShotRunner({
    claimStore: createInMemoryClaimStore({ claim_store_ref: CLAIM_REF }),
    linearReaderAdapter,
    storageAdapter: tamperedStorageAdapter,
    clock,
  });

  const req5b = makeClosedRequest("token-b5-tamper", "target-b5-tamper");
  const pin5b = trustedPinFor(req5b);
  const res5b = await runner5b.execute(req5b, pin5b);

  assert.equal(res5b.status, "HOLD_CONSUMED");
  assert.equal(res5b.reason, "STORAGE_READBACK_FAILED");
  assert.equal(res5b.claim_consumed, true);
  assert.equal(res5b.restore_check, null);
});

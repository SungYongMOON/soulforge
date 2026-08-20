import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { LINEAR_LB1_V2_DIMENSIONS } from "./linear_lb1_v2.mjs";
import {
  LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
  evaluateLinearLb1OwnerGateV2,
} from "./linear_lb1_owner_gate_v2.mjs";

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

export function approvedV2Packet() {
  return {
    schema_version: LINEAR_LB1_OWNER_GATE_V2_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    owner_decision: {
      state: "approved",
      decision_ref: ref("decision_01"),
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
      workspace_ref: ref("workspace_01"),
      team_ids: [],
      project_ids: [],
      credential_ref: ref("credential_01"),
      credential_scope: "read_only",
      dimensions: [...LINEAR_LB1_V2_DIMENSIONS],
    },
    target: {
      kind: "google_drive_folder",
      target_ref: ref("target_01"),
      display_label: "Soulforge Linear LB1 v2 Backup",
      storage_write_authority_ref: ref("storage_authority_01"),
      create_only: true,
      overwrite_allowed: false,
      public_share_allowed: false,
    },
    claim_store: {
      claim_store_ref: ref("claim_store_01"),
      single_use_token: "single-use-claim-token-uuid-001",
    },
    adapters: {
      linear_reader_adapter_ref: ref("linear_reader_01"),
      storage_adapter_ref: ref("storage_adapter_01"),
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
      human_reviewer_ref: ref("human_reviewer_01"),
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

export function trustedPinFor(packet) {
  const preview = evaluateLinearLb1OwnerGateV2(packet, null);
  const packetSha256 = preview.receipt.packet_sha256;
  return {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2",
    gate_ref: ref("pin_gate_ref", packetSha256),
    expected_packet_sha256: packetSha256,
    valid_at: "2026-08-20T00:00:00.000Z",
    known_at: "2026-08-20T01:00:00.000Z",
    expires_at: "2026-08-21T00:00:00.000Z",
  };
}

test("an exact approved LB1 v2 policy and runtime binding opens one read-only backup attempt", () => {
  const packet = approvedV2Packet();
  const pin = trustedPinFor(packet);
  const result = evaluateLinearLb1OwnerGateV2(packet, pin);

  assert.equal(result.gate.status, "READY_FOR_ONE_SHOT");
  assert.deepEqual(result.gate.blocker_codes, []);
  assert.equal(result.receipt.authority.linear_read_allowed, true);
  assert.equal(result.receipt.authority.storage_write_allowed, true);
  assert.equal(result.receipt.authority.linear_write_allowed, false);
  assert.equal(result.receipt.authority.scheduler_allowed, false);
  assert.equal(result.receipt.binding.run_limit, 1);
  assert.equal(result.receipt.binding.create_only, true);
  assert.equal(result.receipt.binding.overwrite_allowed, false);
  assert.equal(result.receipt.binding.restore_check_required, true);
  assert.equal(result.receipt.binding.technical_single_use_enforced, false);
  assert.equal(result.receipt.binding.consumption_state, "not_consumed_by_gate");
  assert.equal(result.receipt.binding.trusted_pin_expires_at, "2026-08-21T00:00:00.000Z");
  assert.deepEqual(result.receipt.effects, {
    provider_calls: 0,
    storage_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });

  // Gate receipt MUST NOT expose raw single_use_token or writer hostname
  assert.equal(Object.hasOwn(result.receipt, "single_use_token"), false);
  assert.equal(result.receipt.single_use_token_present, true);
  assert.equal(typeof result.receipt.single_use_token_sha256, "string");
  assert.equal(result.receipt.single_use_token_sha256.length, 64);
  assert.deepEqual(result.receipt.writer_identity, {
    writer_id: "soulforge-main-node-01",
    epoch: 1,
  });
  assert.deepEqual(result.gate.writer_identity, {
    writer_id: "soulforge-main-node-01",
    epoch: 1,
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.gate), true);
  assert.equal(Object.isFrozen(result.receipt), true);
});

test("default packet remains HOLD until owner decision, refs, adapters, layout, and limits are bound", () => {
  const packet = approvedV2Packet();
  packet.owner_decision = {
    state: "pending",
    decision_ref: null,
    approved_at_utc: null,
    expires_at_utc: null,
  };
  packet.source.workspace_ref = null;
  packet.source.credential_ref = null;
  packet.target.target_ref = null;
  packet.target.storage_write_authority_ref = null;
  packet.claim_store.claim_store_ref = null;
  packet.adapters.linear_reader_adapter_ref = null;
  packet.adapters.storage_adapter_ref = null;
  packet.restore_acceptance.human_reviewer_ref = null;

  const result = evaluateLinearLb1OwnerGateV2(packet, trustedPinFor(packet));

  assert.equal(result.gate.status, "HOLD");
  assert.deepEqual(result.gate.blocker_codes, [
    "LINEAR_LB1_GATE_V2_ADAPTER_REFS_REQUIRED",
    "LINEAR_LB1_GATE_V2_CLAIM_STORE_REQUIRED",
    "LINEAR_LB1_GATE_V2_CREDENTIAL_REQUIRED",
    "LINEAR_LB1_GATE_V2_OWNER_APPROVAL_REQUIRED",
    "LINEAR_LB1_GATE_V2_RESTORE_ACCEPTANCE_REQUIRED",
    "LINEAR_LB1_GATE_V2_SOURCE_SCOPE_REQUIRED",
    "LINEAR_LB1_GATE_V2_STORAGE_AUTHORITY_REQUIRED",
    "LINEAR_LB1_GATE_V2_TARGET_REQUIRED",
  ]);
  assert.equal(result.receipt.authority.linear_read_allowed, false);
  assert.equal(result.receipt.authority.storage_write_allowed, false);
});

test("changing any approved v2 material requires a fresh externally trusted pin", () => {
  const packet = approvedV2Packet();
  const initialPin = trustedPinFor(packet);

  packet.retention.daily_generations = 45;
  const stalePinResult = evaluateLinearLb1OwnerGateV2(packet, initialPin);
  assert.equal(stalePinResult.gate.status, "HOLD");
  assert.deepEqual(stalePinResult.gate.blocker_codes, [
    "LINEAR_LB1_GATE_V2_TRUSTED_PIN_MISMATCH",
  ]);

  const freshPinResult = evaluateLinearLb1OwnerGateV2(packet, trustedPinFor(packet));
  assert.equal(freshPinResult.gate.status, "READY_FOR_ONE_SHOT");
});

test("hostile object graphs, proxies, accessors, aliased arrays, prototype pollution, path-like and secret-like strings fail", () => {
  let getterCalls = 0;
  const accessor = approvedV2Packet();
  Object.defineProperty(accessor, "writer_identity", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return approvedV2Packet().writer_identity;
    },
  });
  const accessorResult = evaluateLinearLb1OwnerGateV2(accessor, trustedPinFor(approvedV2Packet()));
  assert.equal(getterCalls, 0);
  assert.deepEqual(accessorResult.gate.blocker_codes, ["LINEAR_LB1_GATE_V2_INPUT_INVALID"]);

  let proxyTraps = 0;
  const proxied = new Proxy(approvedV2Packet(), {
    ownKeys() {
      proxyTraps += 1;
      return [];
    },
  });
  const proxyResult = evaluateLinearLb1OwnerGateV2(proxied, trustedPinFor(approvedV2Packet()));
  assert.equal(proxyTraps, 0);
  assert.deepEqual(proxyResult.gate.blocker_codes, ["LINEAR_LB1_GATE_V2_INPUT_INVALID"]);

  const aliased = approvedV2Packet();
  aliased.source.project_ids = aliased.source.team_ids;
  assert.deepEqual(
    evaluateLinearLb1OwnerGateV2(aliased, trustedPinFor(approvedV2Packet())).gate.blocker_codes,
    ["LINEAR_LB1_GATE_V2_INPUT_INVALID"],
  );

  const secretString = approvedV2Packet();
  secretString.target.display_label = "Bearer ghp_secretkey123456789";
  assert.deepEqual(
    evaluateLinearLb1OwnerGateV2(secretString, trustedPinFor(approvedV2Packet())).gate.blocker_codes,
    ["LINEAR_LB1_GATE_V2_INPUT_INVALID"],
  );

  const pathString = approvedV2Packet();
  pathString.target.display_label = `C:${"\\"}${["Users", "admin", "backups"].join("\\")}`;
  assert.deepEqual(
    evaluateLinearLb1OwnerGateV2(pathString, trustedPinFor(approvedV2Packet())).gate.blocker_codes,
    ["LINEAR_LB1_GATE_V2_INPUT_INVALID"],
  );
});

test("each v2 start policy fails at its own stable gate code", () => {
  const cases = [
    {
      code: "LINEAR_LB1_GATE_V2_WRITER_IDENTITY_REQUIRED",
      mutate(packet) { packet.writer_identity.platform = "android"; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_CREDENTIAL_REQUIRED",
      mutate(packet) { packet.source.credential_scope = "read_write"; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_SOURCE_SCOPE_REQUIRED",
      mutate(packet) { packet.source.scope_mode = "allowlist"; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_TARGET_REQUIRED",
      mutate(packet) { packet.target.overwrite_allowed = true; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_CLAIM_STORE_REQUIRED",
      mutate(packet) { packet.claim_store.single_use_token = "short"; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_ADAPTER_REFS_REQUIRED",
      mutate(packet) { packet.adapters.linear_reader_adapter_ref = null; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_ARTIFACT_LAYOUT_REQUIRED",
      mutate(packet) { packet.artifact_layout.layout_kind = "unsealed_raw_json"; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_RESOURCE_LIMITS_REQUIRED",
      mutate(packet) { packet.resource_limits.max_issues = 0; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_RETENTION_POLICY_REQUIRED",
      mutate(packet) { packet.retention.daily_generations = 0; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_FAILURE_POLICY_REQUIRED",
      mutate(packet) { packet.failure_policy.partial_result = "PASS"; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_RESTORE_ACCEPTANCE_REQUIRED",
      mutate(packet) { packet.restore_acceptance.tabular_only_accepted = true; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_ONE_SHOT_POLICY_REQUIRED",
      mutate(packet) { packet.one_shot.scheduler_activation = true; },
    },
    {
      code: "LINEAR_LB1_GATE_V2_OWNER_APPROVAL_INVALID",
      mutate(packet) { packet.owner_decision.expires_at_utc = "2026-08-20T00:30:00.000Z"; },
    },
  ];

  for (const { code, mutate } of cases) {
    const packet = approvedV2Packet();
    mutate(packet);
    const result = evaluateLinearLb1OwnerGateV2(packet, trustedPinFor(packet));
    assert.equal(result.gate.status, "HOLD", code);
    assert.deepEqual(result.gate.blocker_codes, [code]);
    assert.equal(result.receipt.authority.linear_read_allowed, false);
    assert.equal(result.receipt.authority.storage_write_allowed, false);
  }
});

test("trusted pin schema requires expires_at and validates chronology", () => {
  const packet = approvedV2Packet();

  // Pin missing expires_at
  const missingExpires = {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2",
    gate_ref: ref("pin_gate_ref"),
    expected_packet_sha256: "sha256:" + "0".repeat(64),
    valid_at: "2026-08-20T00:00:00.000Z",
    known_at: "2026-08-20T01:00:00.000Z",
  };
  const res1 = evaluateLinearLb1OwnerGateV2(packet, missingExpires);
  assert.deepEqual(res1.gate.blocker_codes, ["LINEAR_LB1_GATE_V2_TRUSTED_PIN_INVALID"]);

  // Pin with invalid expires_at before known_at
  const badOrder = {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2",
    gate_ref: ref("pin_gate_ref"),
    expected_packet_sha256: "sha256:" + "0".repeat(64),
    valid_at: "2026-08-20T00:00:00.000Z",
    known_at: "2026-08-20T02:00:00.000Z",
    expires_at: "2026-08-20T01:00:00.000Z",
  };
  const res2 = evaluateLinearLb1OwnerGateV2(packet, badOrder);
  assert.deepEqual(res2.gate.blocker_codes, ["LINEAR_LB1_GATE_V2_TRUSTED_PIN_INVALID"]);
});

test("a missing trusted pin and a rejected trusted pin remain distinct", () => {
  const missing = evaluateLinearLb1OwnerGateV2(approvedV2Packet(), null);
  assert.deepEqual(missing.gate.blocker_codes, ["LINEAR_LB1_GATE_V2_TRUSTED_PIN_REQUIRED"]);

  const invalidPin = {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v2",
    gate_ref: ref("invalid_pin_gate_ref"),
    expected_packet_sha256: "not-a-sha256",
    valid_at: "2026-08-20T00:00:00.000Z",
    known_at: "2026-08-20T01:00:00.000Z",
    expires_at: "2026-08-21T00:00:00.000Z",
  };
  const rejected = evaluateLinearLb1OwnerGateV2(approvedV2Packet(), invalidPin);
  assert.deepEqual(rejected.gate.blocker_codes, ["LINEAR_LB1_GATE_V2_TRUSTED_PIN_INVALID"]);
});

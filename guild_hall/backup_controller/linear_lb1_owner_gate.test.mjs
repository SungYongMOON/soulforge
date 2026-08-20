import assert from "node:assert/strict";
import test from "node:test";

import {
  LINEAR_LB1_OWNER_GATE_PACKET_SCHEMA_VERSION,
  evaluateLinearLb1OwnerGate,
} from "./linear_lb1_owner_gate.mjs";

const EXPECTED_PACKET_SHA256 =
  "sha256:b7667f7413a30fa4ab831da382e5a0ae4f398230238857547adc8efbb7edc627";
const DIMENSIONS = [
  "issue", "project", "assignee", "status", "timestamps", "due", "relations",
  "description_revision", "comments", "state_history", "waiting_refs",
  "completion_refs", "evidence_refs",
];

function ref(seed, contentId = `sha256:${seed.repeat(64).slice(0, 64)}`) {
  return {
    entity_id: `${seed.repeat(8).slice(0, 8)}-${seed.repeat(4).slice(0, 4)}-4${seed.repeat(3).slice(0, 3)}-8${seed.repeat(3).slice(0, 3)}-${seed.repeat(12).slice(0, 12)}`,
    revision_id: `${seed.repeat(8).slice(0, 8)}-${seed.repeat(4).slice(0, 4)}-4${seed.repeat(3).slice(0, 3)}-9${seed.repeat(3).slice(0, 3)}-${seed.repeat(12).slice(0, 12)}`,
    content_id: contentId,
    content_hash_alg: "sha256",
  };
}

function approvedPacket() {
  return {
    schema_version: LINEAR_LB1_OWNER_GATE_PACKET_SCHEMA_VERSION,
    feature_state: "off",
    owner_decision: {
      state: "approved",
      decision_ref: ref("a"),
      approved_at_utc: "2026-08-20T00:00:00.000Z",
      expires_at_utc: "2026-08-21T00:00:00.000Z",
    },
    source: {
      provider: "linear",
      scope_mode: "entire_workspace",
      workspace_ref: ref("b"),
      team_ids: [],
      project_ids: [],
      credential_ref: ref("c"),
      credential_scope: "read_only",
      dimensions: [...DIMENSIONS],
    },
    target: {
      kind: "google_drive_folder",
      target_ref: ref("d"),
      display_label: "Soulforge Linear Backup",
      storage_write_authority_ref: ref("e"),
      create_only: true,
      overwrite_allowed: false,
      public_share_allowed: false,
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
      human_reviewer_ref: ref("f"),
      required_dimensions: [...DIMENSIONS],
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

function trustedPin(expectedPacketSha256 = EXPECTED_PACKET_SHA256) {
  return {
    schema_version: "soulforge.backup_controller.linear_lb1.owner_gate_pin.v1",
    gate_ref: ref("1", expectedPacketSha256),
    expected_packet_sha256: expectedPacketSha256,
    valid_at: "2026-08-20T00:00:00.000Z",
    known_at: "2026-08-20T01:00:00.000Z",
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pinObservedPacket(packet) {
  const preview = evaluateLinearLb1OwnerGate(packet, null);
  return trustedPin(preview.receipt.packet_sha256);
}

test("an exact approved LB1 policy and runtime binding opens one read-only backup attempt", () => {
  const result = evaluateLinearLb1OwnerGate(approvedPacket(), trustedPin());

  assert.equal(result.gate.status, "READY_FOR_ONE_SHOT", JSON.stringify(result.receipt));
  assert.deepEqual(result.gate.blocker_codes, []);
  assert.equal(result.receipt.packet_sha256, EXPECTED_PACKET_SHA256);
  assert.equal(result.receipt.authority.linear_read_allowed, true);
  assert.equal(result.receipt.authority.storage_write_allowed, true);
  assert.equal(result.receipt.authority.linear_write_allowed, false);
  assert.equal(result.receipt.authority.scheduler_allowed, false);
  assert.deepEqual(result.receipt.binding, {
    trusted_pin_content_id: EXPECTED_PACKET_SHA256,
    trusted_pin_valid_at: "2026-08-20T00:00:00.000Z",
    trusted_pin_known_at: "2026-08-20T01:00:00.000Z",
    owner_decision_expires_at: "2026-08-21T00:00:00.000Z",
    run_limit: 1,
    create_only: true,
    overwrite_allowed: false,
    restore_check_required: true,
    technical_single_use_enforced: false,
    consumption_state: "not_consumed_by_gate",
  });
  assert.deepEqual(result.receipt.effects, {
    provider_calls: 0,
    storage_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.gate), true);
  assert.equal(Object.isFrozen(result.receipt), true);
});

test("the proposed default remains HOLD until Owner, Linear, Drive, and restore refs are bound", () => {
  const packet = approvedPacket();
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
  packet.restore_acceptance.human_reviewer_ref = null;

  const result = evaluateLinearLb1OwnerGate(packet, pinObservedPacket(packet));

  assert.equal(result.gate.status, "HOLD");
  assert.deepEqual(result.gate.blocker_codes, [
    "LINEAR_LB1_GATE_CREDENTIAL_REQUIRED",
    "LINEAR_LB1_GATE_OWNER_APPROVAL_REQUIRED",
    "LINEAR_LB1_GATE_RESTORE_ACCEPTANCE_REQUIRED",
    "LINEAR_LB1_GATE_SOURCE_SCOPE_REQUIRED",
    "LINEAR_LB1_GATE_STORAGE_AUTHORITY_REQUIRED",
    "LINEAR_LB1_GATE_TARGET_REQUIRED",
  ]);
  assert.equal(result.receipt.authority.linear_read_allowed, false);
  assert.equal(result.receipt.authority.storage_write_allowed, false);
  assert.deepEqual(result.receipt.effects, {
    provider_calls: 0,
    storage_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });
  assert.equal(Object.isFrozen(result), true);
});

test("changing any approved policy material requires a fresh externally trusted pin", () => {
  const packet = approvedPacket();
  packet.retention.daily_generations = 31;

  const stalePin = evaluateLinearLb1OwnerGate(packet, trustedPin());
  assert.equal(stalePin.gate.status, "HOLD");
  assert.deepEqual(stalePin.gate.blocker_codes, [
    "LINEAR_LB1_GATE_TRUSTED_PIN_MISMATCH",
  ]);

  const separatelyRepinned = evaluateLinearLb1OwnerGate(packet, pinObservedPacket(packet));
  assert.equal(separatelyRepinned.gate.status, "READY_FOR_ONE_SHOT");
  assert.equal(separatelyRepinned.receipt.authority.linear_write_allowed, false);
  assert.equal(separatelyRepinned.receipt.authority.scheduler_allowed, false);
});

test("hostile object graphs and secret-shaped metadata fail before any authority opens", () => {
  let getterCalls = 0;
  const accessor = approvedPacket();
  Object.defineProperty(accessor, "source", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return approvedPacket().source;
    },
  });
  const accessorResult = evaluateLinearLb1OwnerGate(accessor, trustedPin());
  assert.equal(getterCalls, 0);
  assert.deepEqual(accessorResult.gate.blocker_codes, [
    "LINEAR_LB1_GATE_INPUT_INVALID",
  ]);

  let proxyTraps = 0;
  const proxied = new Proxy(approvedPacket(), {
    ownKeys() {
      proxyTraps += 1;
      return [];
    },
  });
  const proxyResult = evaluateLinearLb1OwnerGate(proxied, trustedPin());
  assert.equal(proxyTraps, 0);
  assert.deepEqual(proxyResult.gate.blocker_codes, [
    "LINEAR_LB1_GATE_INPUT_INVALID",
  ]);

  const aliased = approvedPacket();
  aliased.source.project_ids = aliased.source.team_ids;
  assert.deepEqual(
    evaluateLinearLb1OwnerGate(aliased, trustedPin()).gate.blocker_codes,
    ["LINEAR_LB1_GATE_INPUT_INVALID"],
  );

  const secretPath = approvedPacket();
  secretPath.target.display_label = "C:\\Users\\owner\\secret";
  const secretResult = evaluateLinearLb1OwnerGate(secretPath, trustedPin());
  assert.deepEqual(secretResult.gate.blocker_codes, [
    "LINEAR_LB1_GATE_INPUT_INVALID",
  ]);
  assert.equal(secretResult.receipt.packet_sha256, null);
  assert.deepEqual(secretResult.receipt.effects, {
    provider_calls: 0,
    storage_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });

  const uncPath = approvedPacket();
  uncPath.target.display_label = "\\\\server\\share";
  const uncResult = evaluateLinearLb1OwnerGate(uncPath, trustedPin());
  assert.deepEqual(uncResult.gate.blocker_codes, [
    "LINEAR_LB1_GATE_INPUT_INVALID",
  ]);
  assert.equal(uncResult.receipt.packet_sha256, null);
});

test("each LB1 start policy fails at its own stable gate", () => {
  const cases = [
    {
      code: "LINEAR_LB1_GATE_CREDENTIAL_REQUIRED",
      mutate(packet) { packet.source.credential_scope = "read_write"; },
    },
    {
      code: "LINEAR_LB1_GATE_SOURCE_SCOPE_REQUIRED",
      mutate(packet) { packet.source.scope_mode = "allowlist"; },
    },
    {
      code: "LINEAR_LB1_GATE_TARGET_REQUIRED",
      mutate(packet) { packet.target.overwrite_allowed = true; },
    },
    {
      code: "LINEAR_LB1_GATE_RETENTION_POLICY_REQUIRED",
      mutate(packet) { packet.retention.daily_generations = 0; },
    },
    {
      code: "LINEAR_LB1_GATE_FAILURE_POLICY_REQUIRED",
      mutate(packet) { packet.failure_policy.partial_result = "PASS"; },
    },
    {
      code: "LINEAR_LB1_GATE_RESTORE_ACCEPTANCE_REQUIRED",
      mutate(packet) { packet.restore_acceptance.tabular_only_accepted = true; },
    },
    {
      code: "LINEAR_LB1_GATE_ONE_SHOT_POLICY_REQUIRED",
      mutate(packet) { packet.one_shot.scheduler_activation = true; },
    },
    {
      code: "LINEAR_LB1_GATE_OWNER_APPROVAL_INVALID",
      mutate(packet) { packet.owner_decision.expires_at_utc = "2026-08-20T01:00:00.000Z"; },
    },
  ];

  for (const { code, mutate } of cases) {
    const packet = approvedPacket();
    mutate(packet);
    const result = evaluateLinearLb1OwnerGate(packet, pinObservedPacket(packet));
    assert.equal(result.gate.status, "HOLD", code);
    assert.deepEqual(result.gate.blocker_codes, [code]);
    assert.equal(result.receipt.authority.linear_read_allowed, false);
    assert.equal(result.receipt.authority.storage_write_allowed, false);
  }
});

test("an unbound retention object returns a stable HOLD instead of throwing", () => {
  const packet = approvedPacket();
  packet.retention = null;

  const result = evaluateLinearLb1OwnerGate(packet, pinObservedPacket(packet));

  assert.equal(result.gate.status, "HOLD");
  assert.deepEqual(result.gate.blocker_codes, [
    "LINEAR_LB1_GATE_RETENTION_POLICY_REQUIRED",
  ]);
  assert.equal(result.gate.retention, null);
  assert.deepEqual(result.receipt.effects, {
    provider_calls: 0,
    storage_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    scheduler_changes: 0,
  });
});

test("an own __proto__ key cannot disappear from the full-packet pin", () => {
  const packet = approvedPacket();
  Object.defineProperty(packet, "__proto__", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: "smuggled-unpinned-field",
  });

  const result = evaluateLinearLb1OwnerGate(packet, trustedPin());

  assert.equal(result.gate.status, "HOLD");
  assert.deepEqual(result.gate.blocker_codes, [
    "LINEAR_LB1_GATE_INPUT_INVALID",
    "LINEAR_LB1_GATE_TRUSTED_PIN_MISMATCH",
  ]);
  assert.notEqual(result.receipt.packet_sha256, EXPECTED_PACKET_SHA256);
});

test("a missing trusted pin and a rejected trusted pin remain distinct", () => {
  const missing = evaluateLinearLb1OwnerGate(approvedPacket(), null);
  assert.deepEqual(missing.gate.blocker_codes, [
    "LINEAR_LB1_GATE_TRUSTED_PIN_REQUIRED",
  ]);

  let traps = 0;
  const proxiedPin = new Proxy(trustedPin(), {
    ownKeys() {
      traps += 1;
      return [];
    },
  });
  const rejected = evaluateLinearLb1OwnerGate(approvedPacket(), proxiedPin);
  assert.equal(traps, 0);
  assert.deepEqual(rejected.gate.blocker_codes, [
    "LINEAR_LB1_GATE_TRUSTED_PIN_INVALID",
  ]);
  assert.equal(rejected.receipt.binding.trusted_pin_content_id, null);
});

// Public seam tests for the private target-binding control-store adapter.
// The only persistent fixtures use temporary roots. No test names or exposes
// a host-local production target.

import assert from "node:assert/strict";
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync,
  rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { seedRows } from "../data/registry_seed_v0.mjs";
import { TARGET_SIBLING_BINDING_MAP } from "../src/path_registry_core.mjs";

import {
  PRIVATE_TARGET_BINDING_TARGET_MAP,
  PRIVATE_TARGET_BINDING_TARGET_IDS,
  computePrivateTargetBindingPacketDigest,
  computePrivateTargetBindingLockBreakRequestDigest,
  computePrivateTargetBindingAclAdmissionPacketDigest,
  computePrivateTargetBindingReactivationRequestDigest,
  computePrivateTargetControlRootIdentityCommitment,
  registerPrivateTargetBindingSet as productionRegisterPrivateTargetBindingSet,
  revokeOrRollbackPrivateTargetBindingSet as productionRevokeOrRollbackPrivateTargetBindingSet,
} from "../src/private_target_binding_control_store.mjs";
import * as productionControlStore from "../src/private_target_binding_control_store.mjs";

function assertPublicOutcome(outcome, input) {
  const privateValues = [
    input.containment_root,
    input.target_suite_root ?? (input.control_root ? dirname(input.control_root) : null),
    input.control_root,
    ...(input.binding_set_packet?.entries?.map((entry) => entry.physical_path) ?? []),
  ].filter((value) => typeof value === "string");
  const inspectValues = (value) => {
    if (typeof value === "string") {
      for (const privateValue of privateValues) {
        assert.equal(value.includes(privateValue), false);
      }
      assert.equal(/^(?:[A-Za-z]:[\\/]|\\\\|\/)/u.test(value), false);
      return;
    }
    if (Array.isArray(value)) return value.forEach(inspectValues);
    if (value === null || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(/(?:^|_)(?:physical_path|control_root|target_suite_root|raw|secret|payload)(?:_|$)/iu.test(key), false);
      inspectValues(nested);
    }
  };
  inspectValues(outcome);
  if (outcome.status === "hold") assert.match(outcome.hold_code, /^[a-z][a-z0-9_]*$/u);
}

async function registerPrivateTargetBindingSet(input) {
  const request = { ...input };
  const observedAt = new Date().toISOString();
  const acl = input.enabled === true && request.acl_admission_packet === undefined
    ? aclAdmissionFor(input.control_root, input.writer_ref, observedAt)
    : null;
  const outcome = await productionRegisterPrivateTargetBindingSet({
    target_suite_root: input.target_suite_root ?? dirname(input.control_root),
    ...(acl ?? {}),
    ...request,
  });
  assertPublicOutcome(outcome, input);
  return outcome;
}

async function revokeOrRollbackPrivateTargetBindingSet(input) {
  const request = { ...input };
  const observedAt = new Date().toISOString();
  const acl = input.enabled === true && request.acl_admission_packet === undefined
    ? aclAdmissionFor(input.control_root, input.writer_ref, observedAt)
    : null;
  const outcome = await productionRevokeOrRollbackPrivateTargetBindingSet({
    target_suite_root: input.target_suite_root ?? dirname(input.control_root),
    ...(acl ?? {}),
    ...request,
  });
  assertPublicOutcome(outcome, input);
  return outcome;
}

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function aclAdmissionFor(controlRoot, writerRef, observedAt) {
  const stat = lstatSync(controlRoot);
  const identityCommitment = computePrivateTargetControlRootIdentityCommitment({
    realpath: realpathSync.native(controlRoot),
    dev: String(stat.dev),
    ino: String(stat.ino),
  });
  const observedMs = Date.parse(observedAt);
  const packet = {
    schema: "soulforge.private_target_binding_acl_admission.v0",
    status: "closed",
    control_root_ref: "target.control",
    control_root_identity_commitment: identityCommitment,
    acl_readback_ref: "acl-readback:target.control/writer-exclusive",
    acl_readback_digest: digest("d"),
    sole_writer_ref: writerRef,
    wrong_writer_denied_ref: "acl-denial:target.control/wrong-writer",
    authority_ref: "authority:owner/target-control-acl",
    not_before: new Date(observedMs - 60_000).toISOString(),
    expires_at: new Date(observedMs + 60_000).toISOString(),
  };
  return {
    acl_admission_packet: packet,
    trusted_acl_admission_packet_digest:
      computePrivateTargetBindingAclAdmissionPacketDigest(packet),
  };
}

function closedPacket({ targetRoot, revision = "v1", bindingEpoch = 1 } = {}) {
  return {
    schema: "soulforge.private_target_binding_set.v0",
    status: "closed",
    binding_set_ref: `binding-set:target-suite/${revision}`,
    activation_ref: "activation:physical-spine-n2",
    writer_ref: "writer:private-control-store",
    lock_break_authority_ref: "authority:owner/lock-break",
    reactivation_authority_ref: "authority:owner/reactivation",
    entries: PRIVATE_TARGET_BINDING_TARGET_MAP.map((target) => {
      return {
        target_id: target.target_id,
        logical_path_id: target.logical_path_id,
        binding_ref: `binding:target/${target.target_id}/${revision}`,
        parent_binding_ref: "binding.target-suite-root",
        binding_epoch: bindingEpoch,
        physical_path: join(targetRoot, target.physical_basename),
      };
    }),
  };
}

function tempRoots() {
  const containmentRoot = mkdtempSync(join(tmpdir(), "sf-private-binding-"));
  const targetSuiteRoot = join(containmentRoot, "target-suite");
  const controlRoot = join(targetSuiteRoot, "control");
  return {
    containmentRoot,
    targetSuiteRoot,
    controlRoot,
    cleanup() {
      rmSync(containmentRoot, { recursive: true, force: true });
    },
  };
}

function materializeTargetSuite(roots) {
  mkdirSync(roots.targetSuiteRoot);
  for (const target of PRIVATE_TARGET_BINDING_TARGET_MAP) {
    mkdirSync(join(roots.targetSuiteRoot, target.physical_basename));
  }
}

function activeLockPath(roots) {
  return join(
    roots.controlRoot,
    "private-target-binding-control-store-v0",
    "locks",
    "active.lock",
  );
}

function writeLockFixture(roots, { acquiredAt, expiresAt }) {
  writeFileSync(activeLockPath(roots), `${JSON.stringify({
    schema: "soulforge.private_target_binding_control_store.v0",
    record_type: "active_lock",
    lock_owner_ref: "writer:private-control-store",
    activation_ref: "activation:physical-spine-n2",
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  })}\n`, "utf8");
}

test("the exported private target map stays exact with the public target-row source", () => {
  assert.deepEqual(
    PRIVATE_TARGET_BINDING_TARGET_MAP,
    Object.entries(TARGET_SIBLING_BINDING_MAP).map(([logicalPathId, target]) => ({
      target_id: logicalPathId.slice("target.".length),
      logical_path_id: logicalPathId,
      physical_basename: target.physical_basename,
      physical_root_class: target.physical_root_class,
      parent_binding_ref: target.parent_binding_ref,
    })),
  );
  assert.equal(seedRows().filter((row) => row.logical_path_id.startsWith("target.")).length, 9);
});

test("no Path Registry production source exports a test adapter, factory, or hook", async () => {
  const sourceRoot = new URL("../src/", import.meta.url);
  for (const name of readdirSync(sourceRoot).filter((entry) => entry.endsWith(".mjs"))) {
    const productionModule = await import(new URL(name, sourceRoot));
    for (const exportedName of Object.keys(productionModule)) {
      assert.doesNotMatch(exportedName, /(?:test.*adapter|factory|hook)/iu, `${name}:${exportedName}`);
    }
  }
});

test("registration is default-OFF and does not create a private control-store", async () => {
  const roots = tempRoots();
  try {
    const result = await registerPrivateTargetBindingSet({
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });

    assert.deepEqual(result, {
      status: "hold",
      schema: "soulforge.private_target_binding_control_store.v0",
      hold_code: "adapter_default_off",
    });
    assert.equal(existsSync(roots.controlRoot), false);
    assert.deepEqual(readdirSync(roots.containmentRoot), []);
  } finally {
    roots.cleanup();
  }
});

test("a closed, independently pinned nine-target packet creates only a private control generation", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const targetRoot = roots.targetSuiteRoot;
    const packet = closedPacket({ targetRoot });
    const trustedPacketDigest = computePrivateTargetBindingPacketDigest(packet);

    const result = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: trustedPacketDigest,
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });

    assert.equal(result.status, "applied");
    assert.equal(result.schema, "soulforge.private_target_binding_control_store.v0");
    assert.equal(result.binding_set_ref, packet.binding_set_ref);
    assert.equal(result.packet_digest, trustedPacketDigest);
    assert.match(result.generation_ref, /^generation:private-target-binding\/[0-9a-f]{64}$/u);
    assert.match(result.generation_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(result.active_generation_ref, result.generation_ref);
    assert.equal(result.previous_generation_ref, null);
    assert.equal(result.binding_count, 9);
    assert.equal(result.activation_ref, packet.activation_ref);
    assert.equal(result.writer_ref, packet.writer_ref);
    assert.equal(JSON.stringify(result).includes(roots.containmentRoot), false);
    assert.equal(JSON.stringify(result).includes(targetRoot), false);
    for (const entry of packet.entries) {
      assert.equal(existsSync(entry.physical_path), true);
      if (entry.target_id !== "control") assert.deepEqual(readdirSync(entry.physical_path), []);
    }
    assert.equal(readdirSync(roots.controlRoot).length, 1);
  } finally {
    roots.cleanup();
  }
});

test("the explicit target map is bound to one admitted Suite root and its exact control child", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const wrongSuiteRoot = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      target_suite_root: roots.containmentRoot,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(wrongSuiteRoot.hold_code, "target_suite_root_invalid");

    const wrongLogicalId = closedPacket({ targetRoot: roots.targetSuiteRoot });
    wrongLogicalId.entries.find((entry) => entry.target_id === "workspaces").logical_path_id =
      "target._workspaces";
    const wrongLogicalIdResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: wrongLogicalId,
      trusted_packet_digest: digest("a"),
      activation_ref: wrongLogicalId.activation_ref,
      writer_ref: wrongLogicalId.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(wrongLogicalIdResult.hold_code, "logical_path_id_target_mismatch");

    const wrongParent = closedPacket({ targetRoot: roots.targetSuiteRoot });
    wrongParent.entries[0].parent_binding_ref = "binding.other-root";
    const wrongParentResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: wrongParent,
      trusted_packet_digest: digest("b"),
      activation_ref: wrongParent.activation_ref,
      writer_ref: wrongParent.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(wrongParentResult.hold_code, "parent_binding_ref_target_suite_mismatch");
  } finally {
    roots.cleanup();
  }
});

test("a copied control store cannot transplant Suite A lineage into Suite B", async () => {
  const suiteA = tempRoots();
  const suiteB = tempRoots();
  try {
    materializeTargetSuite(suiteA);
    materializeTargetSuite(suiteB);
    const packetA = closedPacket({ targetRoot: suiteA.targetSuiteRoot });
    const activeA = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packetA,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packetA),
      activation_ref: packetA.activation_ref,
      writer_ref: packetA.writer_ref,
      expected_active_generation_ref: null,
      control_root: suiteA.controlRoot,
      containment_root: suiteA.containmentRoot,
    });
    cpSync(
      join(suiteA.controlRoot, "private-target-binding-control-store-v0"),
      join(suiteB.controlRoot, "private-target-binding-control-store-v0"),
      { recursive: true, errorOnExist: true },
    );
    const packetB = closedPacket({
      targetRoot: suiteB.targetSuiteRoot, revision: "v2", bindingEpoch: 2,
    });
    const transplanted = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packetB,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packetB),
      activation_ref: packetB.activation_ref,
      writer_ref: packetB.writer_ref,
      expected_active_generation_ref: activeA.generation_ref,
      control_root: suiteB.controlRoot,
      containment_root: suiteB.containmentRoot,
    });
    assert.equal(transplanted.hold_code, "target_suite_identity_mismatch");
  } finally {
    suiteA.cleanup();
    suiteB.cleanup();
  }
});

test("the exact same generation is a NO_OP, while stale CAS and ref reuse hold", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const targetRoot = roots.targetSuiteRoot;
    const firstPacket = closedPacket({ targetRoot, revision: "v1" });
    const first = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: firstPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(firstPacket),
      activation_ref: firstPacket.activation_ref,
      writer_ref: firstPacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(first.status, "applied");

    const replay = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: firstPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(firstPacket),
      activation_ref: firstPacket.activation_ref,
      writer_ref: firstPacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(replay.status, "no_op");
    assert.equal(replay.generation_ref, first.generation_ref);
    assert.equal(replay.active_pointer_digest, first.active_pointer_digest);

    const nextPacket = closedPacket({ targetRoot, revision: "v2", bindingEpoch: 2 });
    const stale = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: nextPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(nextPacket),
      activation_ref: nextPacket.activation_ref,
      writer_ref: nextPacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(stale.hold_code, "active_pointer_compare_failed");

    const sameEpochPacket = closedPacket({ targetRoot, revision: "v5", bindingEpoch: 1 });
    const sameEpochResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: sameEpochPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(sameEpochPacket),
      activation_ref: sameEpochPacket.activation_ref,
      writer_ref: sameEpochPacket.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(sameEpochResult.hold_code, "binding_epoch_not_monotonic");

    const bindingSetReuse = closedPacket({ targetRoot, revision: "v3", bindingEpoch: 2 });
    bindingSetReuse.binding_set_ref = firstPacket.binding_set_ref;
    const bindingSetReuseResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: bindingSetReuse,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(bindingSetReuse),
      activation_ref: bindingSetReuse.activation_ref,
      writer_ref: bindingSetReuse.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(bindingSetReuseResult.hold_code, "binding_set_ref_reuse");

    const bindingRefReuse = closedPacket({ targetRoot, revision: "v4", bindingEpoch: 2 });
    bindingRefReuse.entries[0].binding_ref = firstPacket.entries[0].binding_ref;
    const bindingRefReuseResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: bindingRefReuse,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(bindingRefReuse),
      activation_ref: bindingRefReuse.activation_ref,
      writer_ref: bindingRefReuse.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(bindingRefReuseResult.hold_code, "binding_ref_reuse");
    assert.equal(JSON.stringify(bindingRefReuseResult).includes(roots.containmentRoot), false);
  } finally {
    roots.cleanup();
  }
});

test("an existing store rejects caller-coordinated lock and reactivation authority rotation", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const firstPacket = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const first = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: firstPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(firstPacket),
      activation_ref: firstPacket.activation_ref,
      writer_ref: firstPacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    const attackerPacket = closedPacket({
      targetRoot: roots.targetSuiteRoot, revision: "v2", bindingEpoch: 2,
    });
    attackerPacket.lock_break_authority_ref = "authority:attacker/lock-break";
    attackerPacket.reactivation_authority_ref = "authority:attacker/reactivation";
    const held = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: attackerPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(attackerPacket),
      activation_ref: attackerPacket.activation_ref,
      writer_ref: attackerPacket.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(held.hold_code, "stored_authority_lineage_mismatch");
    const storeRoot = join(roots.controlRoot, "private-target-binding-control-store-v0");
    assert.deepEqual(readdirSync(join(storeRoot, "lock-break-receipts")), []);
    assert.deepEqual(readdirSync(join(storeRoot, "locks")), []);
  } finally {
    roots.cleanup();
  }
});

test("NO_OP is forbidden when the active pointer references a missing generation file", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const first = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(first.status, "applied");
    const generationFile = join(
      roots.controlRoot,
      "private-target-binding-control-store-v0",
      "generations",
      `${first.generation_digest.slice("sha256:".length)}.json`,
    );
    rmSync(generationFile);

    const replay = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(replay.hold_code, "active_generation_unrecognized");
  } finally {
    roots.cleanup();
  }
});

test("existing generations require an active pointer and every revocation-head receipt", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const v1Packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const v1 = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v1Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v1Packet),
      activation_ref: v1Packet.activation_ref,
      writer_ref: v1Packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    const storeRoot = join(roots.controlRoot, "private-target-binding-control-store-v0");
    rmSync(join(storeRoot, "active.json"));
    const noPointerPacket = closedPacket({
      targetRoot: roots.targetSuiteRoot, revision: "v2", bindingEpoch: 2,
    });
    const noPointer = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: noPointerPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(noPointerPacket),
      activation_ref: noPointerPacket.activation_ref,
      writer_ref: noPointerPacket.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(noPointer.hold_code, "active_pointer_missing_for_existing_records");
  } finally {
    roots.cleanup();
  }

  const chainRoots = tempRoots();
  try {
    materializeTargetSuite(chainRoots);
    const v1Packet = closedPacket({ targetRoot: chainRoots.targetSuiteRoot });
    const v1 = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v1Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v1Packet),
      activation_ref: v1Packet.activation_ref,
      writer_ref: v1Packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: chainRoots.controlRoot,
      containment_root: chainRoots.containmentRoot,
    });
    const v2Packet = closedPacket({
      targetRoot: chainRoots.targetSuiteRoot, revision: "v2", bindingEpoch: 2,
    });
    const v2 = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v2Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v2Packet),
      activation_ref: v2Packet.activation_ref,
      writer_ref: v2Packet.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: chainRoots.controlRoot,
      containment_root: chainRoots.containmentRoot,
    });
    const rollback = await revokeOrRollbackPrivateTargetBindingSet({
      enabled: true,
      activation_ref: v2Packet.activation_ref,
      writer_ref: v2Packet.writer_ref,
      revoke_ref: "revoke:target-suite/chain-test",
      expected_active_generation_ref: v2.generation_ref,
      rollback_to_generation_ref: v1.generation_ref,
      control_root: chainRoots.controlRoot,
      containment_root: chainRoots.containmentRoot,
    });
    const receiptFile = join(
      chainRoots.controlRoot,
      "private-target-binding-control-store-v0",
      "receipts",
      `${rollback.revocation_digest.slice("sha256:".length)}.json`,
    );
    rmSync(receiptFile);
    const v3Packet = closedPacket({
      targetRoot: chainRoots.targetSuiteRoot, revision: "v3", bindingEpoch: 3,
    });
    const missingHead = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v3Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v3Packet),
      activation_ref: v3Packet.activation_ref,
      writer_ref: v3Packet.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: chainRoots.controlRoot,
      containment_root: chainRoots.containmentRoot,
    });
    assert.equal(missingHead.hold_code, "revocation_head_unrecognized");
  } finally {
    chainRoots.cleanup();
  }
});

test("stale locks require a separately pinned authorized break receipt; fresh locks stay busy", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const firstPacket = closedPacket({ targetRoot: roots.targetSuiteRoot, revision: "v1" });
    const first = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: firstPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(firstPacket),
      activation_ref: firstPacket.activation_ref,
      writer_ref: firstPacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(first.status, "applied");

    const nowMs = Date.now();
    const staleAcquiredAt = new Date(nowMs - 10 * 60_000).toISOString();
    const staleExpiresAt = new Date(nowMs - 5 * 60_000).toISOString();

    writeLockFixture(roots, {
      acquiredAt: staleAcquiredAt,
      expiresAt: staleExpiresAt,
    });
    const nextPacket = closedPacket({
      targetRoot: roots.targetSuiteRoot, revision: "v2", bindingEpoch: 2,
    });
    const noBreak = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: nextPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(nextPacket),
      activation_ref: nextPacket.activation_ref,
      writer_ref: nextPacket.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(noBreak.hold_code, "stale_lock_break_required");

    const breakRequest = {
      schema: "soulforge.private_target_binding_lock_break.v0",
      status: "authorized",
      break_ref: "lock-break:target-suite/stale-1",
      stale_lock_owner_ref: firstPacket.writer_ref,
      stale_lock_activation_ref: firstPacket.activation_ref,
      stale_lock_acquired_at: staleAcquiredAt,
      stale_lock_expires_at: staleExpiresAt,
      breaker_writer_ref: nextPacket.writer_ref,
      breaker_activation_ref: nextPacket.activation_ref,
      authorized_by_ref: "authority:owner/lock-break",
      not_before: new Date(nowMs - 60_000).toISOString(),
      expires_at: new Date(nowMs + 60_000).toISOString(),
    };
    const badPin = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: nextPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(nextPacket),
      activation_ref: nextPacket.activation_ref,
      writer_ref: nextPacket.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      lock_break_request: breakRequest,
      trusted_lock_break_request_digest: digest("c"),
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(badPin.hold_code, "trusted_lock_break_digest_mismatch");

    for (const invalidWindow of [
      {
        not_before: new Date(nowMs - 3 * 60_000).toISOString(),
        expires_at: new Date(nowMs - 2 * 60_000).toISOString(),
      },
      {
        not_before: new Date(nowMs + 2 * 60_000).toISOString(),
        expires_at: new Date(nowMs + 3 * 60_000).toISOString(),
      },
    ]) {
      const invalidRequest = { ...breakRequest, ...invalidWindow };
      const invalidResult = await registerPrivateTargetBindingSet({
        enabled: true,
        binding_set_packet: nextPacket,
        trusted_packet_digest: computePrivateTargetBindingPacketDigest(nextPacket),
        activation_ref: nextPacket.activation_ref,
        writer_ref: nextPacket.writer_ref,
        expected_active_generation_ref: first.generation_ref,
        lock_break_request: invalidRequest,
        trusted_lock_break_request_digest:
          computePrivateTargetBindingLockBreakRequestDigest(invalidRequest),
        control_root: roots.controlRoot,
        containment_root: roots.containmentRoot,
      });
      assert.equal(invalidResult.hold_code, "lock_break_request_mismatch");
      assert.equal(existsSync(activeLockPath(roots)), true);
    }

    const wrongAuthorityRequest = {
      ...breakRequest,
      authorized_by_ref: "authority:other/lock-break",
    };
    const wrongAuthority = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: nextPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(nextPacket),
      activation_ref: nextPacket.activation_ref,
      writer_ref: nextPacket.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      lock_break_request: wrongAuthorityRequest,
      trusted_lock_break_request_digest:
        computePrivateTargetBindingLockBreakRequestDigest(wrongAuthorityRequest),
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(wrongAuthority.hold_code, "lock_break_request_mismatch");
    const storeRoot = join(roots.controlRoot, "private-target-binding-control-store-v0");
    assert.deepEqual(readdirSync(join(storeRoot, "lock-break-receipts")), []);
    assert.deepEqual(readdirSync(join(storeRoot, "locks")), ["active.lock"]);

    const recovered = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: nextPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(nextPacket),
      activation_ref: nextPacket.activation_ref,
      writer_ref: nextPacket.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      lock_break_request: breakRequest,
      trusted_lock_break_request_digest: computePrivateTargetBindingLockBreakRequestDigest(breakRequest),
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(recovered.status, "applied");
    assert.match(recovered.lock_break_ref, /^lock-break:private-target-binding\/[0-9a-f]{64}$/u);
    assert.match(recovered.lock_break_digest, /^sha256:[0-9a-f]{64}$/u);

    writeLockFixture(roots, {
      acquiredAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + 5 * 60_000).toISOString(),
    });
    const freshBusy = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: nextPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(nextPacket),
      activation_ref: nextPacket.activation_ref,
      writer_ref: nextPacket.writer_ref,
      expected_active_generation_ref: first.generation_ref,
      lock_break_request: breakRequest,
      trusted_lock_break_request_digest: computePrivateTargetBindingLockBreakRequestDigest(breakRequest),
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(freshBusy.hold_code, "active_pointer_busy");
  } finally {
    roots.cleanup();
  }
});

test("an approved target occupied by a junction is rejected before control-state mutation", async (t) => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const devTarget = join(roots.targetSuiteRoot, "dev");
    const junctionTarget = join(roots.containmentRoot, "junction-target");
    rmSync(devTarget, { recursive: true, force: true });
    mkdirSync(junctionTarget);
    let linked = false;
    try {
      symlinkSync(junctionTarget, devTarget, "junction");
      linked = true;
    } catch {
      // Junction creation is host-gated. The runtime guard remains shared with
      // the materializer resolver and is exercised when this host permits it.
    }
    if (!linked) {
      t.skip("junction creation unavailable");
      return;
    }
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const result = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(result.hold_code, "target_directory_unsafe");
    assert.deepEqual(readdirSync(roots.controlRoot), []);
  } finally {
    roots.cleanup();
  }
});

test("rollback and revoke append receipts, CAS the active pointer, and retain generations", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const targetRoot = roots.targetSuiteRoot;
    const v1Packet = closedPacket({ targetRoot, revision: "v1" });
    const v1 = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v1Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v1Packet),
      activation_ref: v1Packet.activation_ref,
      writer_ref: v1Packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    const v2Packet = closedPacket({ targetRoot, revision: "v2", bindingEpoch: 2 });
    const v2 = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v2Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v2Packet),
      activation_ref: v2Packet.activation_ref,
      writer_ref: v2Packet.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(v2.status, "applied");

    const rollback = await revokeOrRollbackPrivateTargetBindingSet({
      enabled: true,
      activation_ref: v2Packet.activation_ref,
      writer_ref: v2Packet.writer_ref,
      revoke_ref: "revoke:target-suite/v2",
      expected_active_generation_ref: v2.generation_ref,
      rollback_to_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(rollback.status, "rolled_back", JSON.stringify(rollback));
    assert.equal(rollback.previous_generation_ref, v2.generation_ref);
    assert.equal(rollback.active_generation_ref, v1.generation_ref);
    assert.match(rollback.revocation_ref, /^revocation:private-target-binding\/[0-9a-f]{64}$/u);
    assert.match(rollback.revocation_digest, /^sha256:[0-9a-f]{64}$/u);

    const rollbackReplay = await revokeOrRollbackPrivateTargetBindingSet({
      enabled: true,
      activation_ref: v2Packet.activation_ref,
      writer_ref: v2Packet.writer_ref,
      revoke_ref: "revoke:target-suite/v2",
      expected_active_generation_ref: v2.generation_ref,
      rollback_to_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(rollbackReplay.status, "no_op");
    assert.equal(rollbackReplay.revocation_ref, rollback.revocation_ref);

    const revokedGenerationReplay = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v2Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v2Packet),
      activation_ref: v2Packet.activation_ref,
      writer_ref: v2Packet.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(revokedGenerationReplay.hold_code, "binding_identity_revoked");

    const revokedBindingSet = closedPacket({ targetRoot, revision: "v3", bindingEpoch: 3 });
    revokedBindingSet.binding_set_ref = v2Packet.binding_set_ref;
    const revokedBindingSetResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: revokedBindingSet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(revokedBindingSet),
      activation_ref: revokedBindingSet.activation_ref,
      writer_ref: revokedBindingSet.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(revokedBindingSetResult.hold_code, "binding_identity_revoked");

    const revokedBindingRef = closedPacket({ targetRoot, revision: "v4", bindingEpoch: 3 });
    revokedBindingRef.entries[0].binding_ref = v2Packet.entries[0].binding_ref;
    const revokedBindingRefResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: revokedBindingRef,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(revokedBindingRef),
      activation_ref: revokedBindingRef.activation_ref,
      writer_ref: revokedBindingRef.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(revokedBindingRefResult.hold_code, "binding_identity_revoked");

    const historicalMaxEpoch = closedPacket({ targetRoot, revision: "v6", bindingEpoch: 2 });
    const historicalMaxEpochResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: historicalMaxEpoch,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(historicalMaxEpoch),
      activation_ref: historicalMaxEpoch.activation_ref,
      writer_ref: historicalMaxEpoch.writer_ref,
      expected_active_generation_ref: v1.generation_ref,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(historicalMaxEpochResult.hold_code, "binding_epoch_not_monotonic");

    const divergentRevokeRef = await revokeOrRollbackPrivateTargetBindingSet({
      enabled: true,
      activation_ref: v1Packet.activation_ref,
      writer_ref: v1Packet.writer_ref,
      revoke_ref: "revoke:target-suite/v2",
      expected_active_generation_ref: v1.generation_ref,
      rollback_to_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(divergentRevokeRef.hold_code, "revoke_ref_reuse");

    const staleOriginal = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: v1Packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(v1Packet),
      activation_ref: v1Packet.activation_ref,
      writer_ref: v1Packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(staleOriginal.hold_code, "active_pointer_compare_failed");

    const revoked = await revokeOrRollbackPrivateTargetBindingSet({
      enabled: true,
      activation_ref: v1Packet.activation_ref,
      writer_ref: v1Packet.writer_ref,
      revoke_ref: "revoke:target-suite/v1",
      expected_active_generation_ref: v1.generation_ref,
      rollback_to_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(revoked.status, "revoked");
    assert.equal(revoked.previous_generation_ref, v1.generation_ref);
    assert.equal(revoked.active_generation_ref, null);
    assert.equal(revoked.binding_count, 0);
    assert.equal(JSON.stringify(revoked).includes(roots.containmentRoot), false);
    assert.equal(existsSync(v1Packet.entries[0].physical_path), true);
    assert.deepEqual(readdirSync(v1Packet.entries[0].physical_path), []);

    const attackerPacket = closedPacket({ targetRoot, revision: "v7", bindingEpoch: 3 });
    attackerPacket.lock_break_authority_ref = "authority:attacker/lock-break";
    attackerPacket.reactivation_authority_ref = "authority:attacker/reactivation";
    const attackerNow = Date.now();
    const attackerRequest = {
      schema: "soulforge.private_target_binding_reactivation.v0",
      status: "authorized",
      reactivation_ref: "reactivation:attacker/v7",
      revoked_generation_ref: v1.generation_ref,
      revocation_head_ref: revoked.revocation_ref,
      new_binding_set_ref: attackerPacket.binding_set_ref,
      new_packet_digest: computePrivateTargetBindingPacketDigest(attackerPacket),
      authorized_by_ref: attackerPacket.reactivation_authority_ref,
      not_before: new Date(attackerNow - 60_000).toISOString(),
      expires_at: new Date(attackerNow + 60_000).toISOString(),
    };
    const attackerHeld = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: attackerPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(attackerPacket),
      activation_ref: attackerPacket.activation_ref,
      writer_ref: attackerPacket.writer_ref,
      expected_active_generation_ref: null,
      reactivation_request: attackerRequest,
      trusted_reactivation_request_digest:
        computePrivateTargetBindingReactivationRequestDigest(attackerRequest),
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(attackerHeld.hold_code, "stored_authority_lineage_mismatch");

    const freshPacket = closedPacket({ targetRoot, revision: "v5", bindingEpoch: 3 });
    const reactivationNow = Date.now();
    const reactivationRequest = {
      schema: "soulforge.private_target_binding_reactivation.v0",
      status: "authorized",
      reactivation_ref: "reactivation:target-suite/v5",
      revoked_generation_ref: v1.generation_ref,
      revocation_head_ref: revoked.revocation_ref,
      new_binding_set_ref: freshPacket.binding_set_ref,
      new_packet_digest: computePrivateTargetBindingPacketDigest(freshPacket),
      authorized_by_ref: freshPacket.reactivation_authority_ref,
      not_before: new Date(reactivationNow - 60_000).toISOString(),
      expires_at: new Date(reactivationNow + 60_000).toISOString(),
    };
    for (const invalidWindow of [
      {
        not_before: new Date(reactivationNow - 3 * 60_000).toISOString(),
        expires_at: new Date(reactivationNow - 2 * 60_000).toISOString(),
      },
      {
        not_before: new Date(reactivationNow + 2 * 60_000).toISOString(),
        expires_at: new Date(reactivationNow + 3 * 60_000).toISOString(),
      },
    ]) {
      const invalidRequest = { ...reactivationRequest, ...invalidWindow };
      const invalid = await registerPrivateTargetBindingSet({
        enabled: true,
        binding_set_packet: freshPacket,
        trusted_packet_digest: computePrivateTargetBindingPacketDigest(freshPacket),
        activation_ref: freshPacket.activation_ref,
        writer_ref: freshPacket.writer_ref,
        expected_active_generation_ref: null,
        reactivation_request: invalidRequest,
        trusted_reactivation_request_digest:
          computePrivateTargetBindingReactivationRequestDigest(invalidRequest),
        control_root: roots.controlRoot,
        containment_root: roots.containmentRoot,
      });
      assert.equal(invalid.hold_code, "reactivation_request_mismatch");
    }
    const reactivated = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: freshPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(freshPacket),
      activation_ref: freshPacket.activation_ref,
      writer_ref: freshPacket.writer_ref,
      expected_active_generation_ref: null,
      reactivation_request: reactivationRequest,
      trusted_reactivation_request_digest:
        computePrivateTargetBindingReactivationRequestDigest(reactivationRequest),
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(reactivated.status, "reactivated");
    assert.equal(reactivated.reactivation_ref, reactivationRequest.reactivation_ref);
  } finally {
    roots.cleanup();
  }
});

test("a closed packet requires all nine distinct target bindings and excludes raw or secret fields", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const targetRoot = roots.targetSuiteRoot;
    const duplicateTarget = closedPacket({ targetRoot });
    duplicateTarget.entries[8].target_id = "data";
    duplicateTarget.entries[8].logical_path_id = "target.data";
    const duplicateResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: duplicateTarget,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(duplicateTarget),
      activation_ref: duplicateTarget.activation_ref,
      writer_ref: duplicateTarget.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(duplicateResult.hold_code, "binding_target_id_invalid");

    const duplicateBinding = closedPacket({ targetRoot });
    duplicateBinding.entries[8].binding_ref = duplicateBinding.entries[0].binding_ref;
    const duplicateBindingResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: duplicateBinding,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(duplicateBinding),
      activation_ref: duplicateBinding.activation_ref,
      writer_ref: duplicateBinding.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(duplicateBindingResult.hold_code, "binding_set_entries_not_distinct");

    const splitEpoch = closedPacket({ targetRoot });
    splitEpoch.entries[8].binding_epoch = 2;
    const splitEpochResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: splitEpoch,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(splitEpoch),
      activation_ref: splitEpoch.activation_ref,
      writer_ref: splitEpoch.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(splitEpochResult.hold_code, "binding_epoch_not_shared");

    const splitParent = closedPacket({ targetRoot });
    splitParent.entries[8].physical_path = join(roots.containmentRoot, "other-target", "local-recovery");
    const splitParentResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: splitParent,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(splitParent),
      activation_ref: splitParent.activation_ref,
      writer_ref: splitParent.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(splitParentResult.hold_code, "binding_target_parent_mismatch");

    const forbidden = closedPacket({ targetRoot });
    forbidden.entries[0].raw_note = "must never enter private binding storage";
    const forbiddenResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: forbidden,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(forbidden),
      activation_ref: forbidden.activation_ref,
      writer_ref: forbidden.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(forbiddenResult.hold_code, "forbidden_private_packet_field");
  } finally {
    roots.cleanup();
  }
});

test("the external packet digest and activation/writer refs must exactly bind the closed packet", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const wrongDigest = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: digest("f"),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(wrongDigest.hold_code, "trusted_packet_digest_mismatch");
    assert.deepEqual(readdirSync(roots.controlRoot), []);

    const wrongActivation = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: "activation:other",
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(wrongActivation.hold_code, "activation_or_writer_ref_mismatch");
    assert.deepEqual(readdirSync(roots.controlRoot), []);
  } finally {
    roots.cleanup();
  }
});

test("writer-exclusive ACL admission is mandatory, exact, and current before any store creation", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const baseRequest = {
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      target_suite_root: roots.targetSuiteRoot,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    };
    const missing = await productionRegisterPrivateTargetBindingSet(baseRequest);
    assert.equal(missing.hold_code, "request_envelope_field_missing");
    assert.deepEqual(readdirSync(roots.controlRoot), []);

    const aclNow = Date.now();
    const baseAcl = aclAdmissionFor(
      roots.controlRoot, packet.writer_ref, new Date(aclNow).toISOString(),
    ).acl_admission_packet;
    const invalidPackets = [
      { ...baseAcl, control_root_ref: "pathref:target.control" },
      { ...baseAcl, sole_writer_ref: "writer:other" },
      { ...baseAcl, control_root_identity_commitment: digest("e") },
      {
        ...baseAcl,
        not_before: new Date(aclNow - 3 * 60_000).toISOString(),
        expires_at: new Date(aclNow - 2 * 60_000).toISOString(),
      },
    ];
    for (const aclPacket of invalidPackets) {
      const held = await registerPrivateTargetBindingSet({
        ...baseRequest,
        acl_admission_packet: aclPacket,
        trusted_acl_admission_packet_digest:
          computePrivateTargetBindingAclAdmissionPacketDigest(aclPacket),
      });
      assert.equal(held.hold_code, "acl_admission_mismatch");
      assert.deepEqual(readdirSync(roots.controlRoot), []);
    }
  } finally {
    roots.cleanup();
  }
});

test("revoke validates the exact control child before any admitted-store creation", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const active = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    const wrongControl = join(roots.targetSuiteRoot, "_workspaces");
    const result = await revokeOrRollbackPrivateTargetBindingSet({
      enabled: true,
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      revoke_ref: "revoke:wrong-control",
      expected_active_generation_ref: active.generation_ref,
      rollback_to_generation_ref: null,
      target_suite_root: roots.targetSuiteRoot,
      control_root: wrongControl,
      containment_root: roots.containmentRoot,
    });
    assert.equal(result.hold_code, "control_root_target_mismatch");
    assert.deepEqual(readdirSync(wrongControl), []);
  } finally {
    roots.cleanup();
  }
});

test("revoke stale-lock authority is anchored from the active generation before breaking", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const active = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    const nowMs = Date.now();
    const staleAcquiredAt = new Date(nowMs - 10 * 60_000).toISOString();
    const staleExpiresAt = new Date(nowMs - 5 * 60_000).toISOString();
    writeLockFixture(roots, {
      acquiredAt: staleAcquiredAt,
      expiresAt: staleExpiresAt,
    });
    const breakRequest = {
      schema: "soulforge.private_target_binding_lock_break.v0",
      status: "authorized",
      break_ref: "lock-break:revoke/wrong-authority",
      stale_lock_owner_ref: packet.writer_ref,
      stale_lock_activation_ref: packet.activation_ref,
      stale_lock_acquired_at: staleAcquiredAt,
      stale_lock_expires_at: staleExpiresAt,
      breaker_writer_ref: packet.writer_ref,
      breaker_activation_ref: packet.activation_ref,
      authorized_by_ref: "authority:other/lock-break",
      not_before: new Date(nowMs - 60_000).toISOString(),
      expires_at: new Date(nowMs + 60_000).toISOString(),
    };
    const held = await revokeOrRollbackPrivateTargetBindingSet({
      enabled: true,
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      revoke_ref: "revoke:wrong-stale-lock-authority",
      expected_active_generation_ref: active.generation_ref,
      rollback_to_generation_ref: null,
      lock_break_request: breakRequest,
      trusted_lock_break_request_digest:
        computePrivateTargetBindingLockBreakRequestDigest(breakRequest),
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(held.hold_code, "lock_break_request_mismatch");
    const storeRoot = join(roots.controlRoot, "private-target-binding-control-store-v0");
    assert.deepEqual(readdirSync(join(storeRoot, "lock-break-receipts")), []);
    assert.deepEqual(readdirSync(join(storeRoot, "locks")), ["active.lock"]);
  } finally {
    roots.cleanup();
  }
});

test("the production request envelope rejects unknown fields, including the test-only hook", async () => {
  assert.equal(Object.hasOwn(productionControlStore, "createPrivateTargetBindingControlStoreTestAdapter"), false);
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
    const result = await productionRegisterPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      target_suite_root: roots.targetSuiteRoot,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
      before_critical_write_hook: async () => {},
    });
    assert.deepEqual(result, {
      status: "hold",
      schema: "soulforge.private_target_binding_control_store.v0",
      hold_code: "request_envelope_field_unrecognized",
    });
    assert.deepEqual(readdirSync(roots.controlRoot), []);
  } finally {
    roots.cleanup();
  }
});

test("noncanonical trailing, mixed-separator, and case-variant physical paths fail before digest storage", async () => {
  const roots = tempRoots();
  try {
    materializeTargetSuite(roots);
    const variants = [
      (packet) => { packet.entries[0].physical_path += "\\"; },
    ];
    if (process.platform === "win32") {
      variants.push(
        (packet) => { packet.entries[0].physical_path = packet.entries[0].physical_path.replace("\\", "/"); },
        (packet) => { packet.entries[0].physical_path = packet.entries[0].physical_path.toLowerCase(); },
      );
    } else {
      variants.push((packet) => {
        packet.entries[0].physical_path = packet.entries[0].physical_path.replace("/", "//");
      });
    }
    for (const mutate of variants) {
      const packet = closedPacket({ targetRoot: roots.targetSuiteRoot });
      mutate(packet);
      const result = await registerPrivateTargetBindingSet({
        enabled: true,
        binding_set_packet: packet,
        trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
        activation_ref: packet.activation_ref,
        writer_ref: packet.writer_ref,
        expected_active_generation_ref: null,
        control_root: roots.controlRoot,
        containment_root: roots.containmentRoot,
      });
      assert.equal(result.hold_code, "physical_path_invalid");
      assert.deepEqual(readdirSync(roots.controlRoot), []);
    }
  } finally {
    roots.cleanup();
  }
});

test("missing and file-occupied target children always fail without control-state writes", async () => {
  const missingRoots = tempRoots();
  try {
    materializeTargetSuite(missingRoots);
    rmSync(join(missingRoots.targetSuiteRoot, "dev"), { recursive: true, force: true });
    const packet = closedPacket({ targetRoot: missingRoots.targetSuiteRoot });
    const missing = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: missingRoots.controlRoot,
      containment_root: missingRoots.containmentRoot,
    });
    assert.equal(missing.hold_code, "target_directory_unavailable");
    assert.deepEqual(readdirSync(missingRoots.controlRoot), []);
  } finally {
    missingRoots.cleanup();
  }

  const fileRoots = tempRoots();
  try {
    materializeTargetSuite(fileRoots);
    const dev = join(fileRoots.targetSuiteRoot, "dev");
    rmSync(dev, { recursive: true, force: true });
    writeFileSync(dev, "not-a-directory", "utf8");
    const packet = closedPacket({ targetRoot: fileRoots.targetSuiteRoot });
    const occupied = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: packet,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(packet),
      activation_ref: packet.activation_ref,
      writer_ref: packet.writer_ref,
      expected_active_generation_ref: null,
      control_root: fileRoots.controlRoot,
      containment_root: fileRoots.containmentRoot,
    });
    assert.equal(occupied.hold_code, "target_directory_unsafe");
    assert.deepEqual(readdirSync(fileRoots.controlRoot), []);
  } finally {
    fileRoots.cleanup();
  }
});

test("hostile control and physical path forms hold before any target path is touched", async (t) => {
  const roots = tempRoots();
  const outside = mkdtempSync(join(tmpdir(), "sf-private-binding-outside-"));
  try {
    materializeTargetSuite(roots);
    const targetRoot = roots.targetSuiteRoot;
    const outsidePacket = closedPacket({ targetRoot });
    const outsideResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: outsidePacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(outsidePacket),
      activation_ref: outsidePacket.activation_ref,
      writer_ref: outsidePacket.writer_ref,
      expected_active_generation_ref: null,
      target_suite_root: roots.targetSuiteRoot,
      control_root: outside,
      containment_root: roots.containmentRoot,
    });
    assert.equal(outsideResult.hold_code, "control_root_target_mismatch");

    const adsPacket = closedPacket({ targetRoot });
    adsPacket.entries[0].physical_path = `${adsPacket.entries[0].physical_path}:alternate`;
    const adsResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: adsPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(adsPacket),
      activation_ref: adsPacket.activation_ref,
      writer_ref: adsPacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(adsResult.hold_code, "physical_path_invalid");

    const uncPacket = closedPacket({ targetRoot });
    uncPacket.entries[0].physical_path = "\\\\server\\share\\dev";
    const uncResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: uncPacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(uncPacket),
      activation_ref: uncPacket.activation_ref,
      writer_ref: uncPacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: roots.controlRoot,
      containment_root: roots.containmentRoot,
    });
    assert.equal(uncResult.hold_code, "physical_path_unc_forbidden");

    const actualControl = join(roots.containmentRoot, "actual-control");
    const linkedControl = roots.controlRoot;
    mkdirSync(actualControl);
    rmSync(linkedControl, { recursive: true, force: true });
    let linked = false;
    try {
      symlinkSync(actualControl, linkedControl, "junction");
      linked = true;
    } catch {
      // The resolver's junction branch is exercised on hosts that permit it;
      // ADS/UNC/outside-root branches above remain mandatory everywhere.
    }
    if (!linked) {
      t.skip("junction creation unavailable");
      return;
    }
    const reparsePacket = closedPacket({ targetRoot });
    const reparseResult = await registerPrivateTargetBindingSet({
      enabled: true,
      binding_set_packet: reparsePacket,
      trusted_packet_digest: computePrivateTargetBindingPacketDigest(reparsePacket),
      activation_ref: reparsePacket.activation_ref,
      writer_ref: reparsePacket.writer_ref,
      expected_active_generation_ref: null,
      control_root: linkedControl,
      containment_root: roots.containmentRoot,
    });
    assert.equal(reparseResult.hold_code, "control_root_invalid");
  } finally {
    roots.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

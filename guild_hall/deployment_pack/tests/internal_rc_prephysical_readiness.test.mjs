import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PREPHYSICAL_READINESS_HOLD_CODES as H,
  PREPHYSICAL_READINESS_INPUT_SCHEMA,
  PREPHYSICAL_READINESS_RESULT_SCHEMA,
  PREPHYSICAL_READINESS_STATUS,
  evaluateInternalRcPrephysicalReadiness,
} from "../src/internal_rc_prephysical_readiness.mjs";

const PROJECT = "project:owner-pc-one-seat";
const EVALUATED_AT = "2026-09-01T00:00:00.000Z";
const OBSERVED_AT = "2026-08-31T23:00:00.000Z";
const EXPIRES_AT = "2026-09-01T04:00:00.000Z";

const digest = (character) => `sha256:${character.repeat(64)}`;

function packs() {
  return [
    ["hpp_server_pack", "pack:hpp-server-v1", "a", "b", "c"],
    ["team_client_pack", "pack:team-client-v1", "d", "e", "f"],
    ["backup_recovery_extension", "pack:backup-recovery-v1", "1", "2", "3"],
  ].map(([pack_id, pack_ref, pack, manifest, validation]) => ({
    pack_id,
    pack_ref,
    pack_version: "0.1.0",
    pack_digest: digest(pack),
    release_manifest_ref: `manifest:${pack_id}-v1`,
    release_manifest_digest: digest(manifest),
    validation_receipt_ref: `receipt:${pack_id}-prephysical-v1`,
    validation_receipt_digest: digest(validation),
    project_scope_ref: PROJECT,
    observed_at: OBSERVED_AT,
    expires_at: EXPIRES_AT,
    freshness: "fresh",
    state: "prephysical_validated",
  }));
}

function pins(packRows = packs()) {
  return packRows.map((pack) => ({
    pack_id: pack.pack_id,
    pack_ref: pack.pack_ref,
    pack_digest: pack.pack_digest,
    release_manifest_digest: pack.release_manifest_digest,
  }));
}

function rollbackPins(packRows = packs()) {
  return packRows.map((pack, index) => ({
    ...pins(packRows)[index],
    rollback_ref: `rollback:${pack.pack_id}-v0`,
    rollback_digest: digest(String(index + 7)),
  }));
}

function bindingTuple(packRows = packs()) {
  return {
    project_scope_ref: PROJECT,
    device_ref: "device:owner-pc-one-seat",
    credential_handle_ref: "credential:owner-pc-one-seat",
    pack_pins: pins(packRows),
  };
}

function readyPacket() {
  const packRows = packs();
  const tuple = bindingTuple(packRows);
  const exercise = {
    exercise_ref: "exercise:owner-pc-one-seat-manuals-v1",
    exercise_digest: digest("4"),
    ...tuple,
    exercise_kind: "actual_owner_pc_one_seat",
    state: "completed",
    operator_ref: "human:owner",
    completed_at: "2026-08-31T23:30:00.000Z",
    manual_roles: [
      "hpp_server_operator",
      "team_client_install_use_revoke_recovery",
      "external_connector_backup_restore",
    ],
    revocation_recovery_exercised: true,
  };
  return {
    schema_version: PREPHYSICAL_READINESS_INPUT_SCHEMA,
    evaluation_ref: "evaluation:owner-pc-one-seat-v1",
    evaluated_at: EVALUATED_AT,
    project_scope_ref: PROJECT,
    pack_evidence: packRows,
    product_composition_receipt: {
      schema_version: "soulforge.module_operability.product_composition_receipt.v0",
      receipt_ref: "receipt:product-composition-v1",
      receipt_digest: digest("5"),
      project_scope_ref: PROJECT,
      pack_pins: pins(packRows),
      observed_at: OBSERVED_AT,
      expires_at: EXPIRES_AT,
      freshness: "fresh",
      composition_state: "verified_no_move",
      source_relocation_performed: false,
      effects_performed: 0,
      unresolved_interface_count: 0,
    },
    manual_resolution_receipt: {
      schema_version: "soulforge.deployment_pack.manual_resolution_receipt.v0",
      receipt_ref: "receipt:manual-resolution-v1",
      receipt_digest: digest("6"),
      project_scope_ref: PROJECT,
      pack_pins: pins(packRows),
      observed_at: OBSERVED_AT,
      expires_at: EXPIRES_AT,
      freshness: "fresh",
      resolution_state: "ready",
      catalog_state: "ready",
      manual_exercise: exercise,
    },
    support_rollback_receipt: {
      schema_version: "soulforge.deployment_pack.support_rollback_receipt.v0",
      receipt_ref: "receipt:support-rollback-v1",
      receipt_digest: digest("7"),
      project_scope_ref: PROJECT,
      pack_pins: pins(packRows),
      known_issues_ref: "known-issues:owner-pc-one-seat-v1",
      support_owner_ref: "owner:platform-support",
      support_escalation_ref: "support:escalation-v1",
      rollback_ref: "rollback:owner-pc-one-seat-v1",
      rollback_digest: digest("8"),
      rollback_pins: rollbackPins(packRows),
      observed_at: OBSERVED_AT,
      expires_at: EXPIRES_AT,
      freshness: "fresh",
      state: "ready_for_gate",
    },
    authority_taxonomy_receipt: {
      schema_version: "soulforge.authority_taxonomy.prephysical_receipt.v0",
      receipt_ref: "receipt:authority-taxonomy-v1",
      receipt_digest: digest("9"),
      project_scope_ref: PROJECT,
      pack_pins: pins(packRows),
      observed_at: OBSERVED_AT,
      expires_at: EXPIRES_AT,
      freshness: "fresh",
      status: "ADMISSION_CANDIDATE",
      action_id: "read_projection",
      risk_class: "R0",
      evidence_class: "EV1",
      effect_count: 0,
      authority_granted: false,
      effects_performed: 0,
      claim_ceiling: "prephysical_gate_evidence",
    },
    synthetic_recovery_receipts: {
      technical_receipt: {
        schema_version: "soulforge.backup_controller.synthetic_recovery_canary_technical_receipt.v0",
        receipt_ref: "receipt:synthetic-recovery-technical-v1",
        receipt_digest: digest("b"),
        project_scope_ref: PROJECT,
        pack_pins: pins(packRows),
        verified_at: OBSERVED_AT,
        expires_at: EXPIRES_AT,
        freshness: "fresh",
        technical_state: "synthetic_technical_restore_candidate",
        isolated_restore: true,
        item_parity: true,
        byte_parity: true,
        manifest_readback: true,
        backup_readback: true,
        restore_readback: true,
      },
      acceptance_receipt: {
        schema_version: "soulforge.backup_controller.synthetic_recovery_canary_acceptance_receipt.v0",
        receipt_ref: "receipt:synthetic-recovery-acceptance-v1",
        receipt_digest: digest("c"),
        project_scope_ref: PROJECT,
        technical_receipt_digest: digest("b"),
        accepted_at: "2026-08-31T23:15:00.000Z",
        expires_at: EXPIRES_AT,
        freshness: "fresh",
        decision: "accepted",
        accepted_by_human: true,
        acceptance_owner_ref: "human:owner",
        backup_restore_owner_ref: "owner:backup-operator",
        revoked: false,
        claim_ceiling: "synthetic_human_acceptance_verified",
      },
    },
    device_project_credential_binding: {
      schema_version: "soulforge.deployment_pack.device_project_credential_binding_attestation.v0",
      attestation_ref: "attestation:owner-pc-one-seat-v1",
      attestation_digest: digest("d"),
      ...tuple,
      attested_at: OBSERVED_AT,
      expires_at: EXPIRES_AT,
      freshness: "fresh",
      revoked: false,
      fallback_used: false,
      device_enrollment: {
        enrollment_ref: "enrollment:owner-pc-one-seat-v1",
        enrollment_digest: digest("e"),
        project_scope_ref: PROJECT,
        device_ref: tuple.device_ref,
        credential_handle_ref: tuple.credential_handle_ref,
        state: "enrolled",
        enrolled_at: OBSERVED_AT,
        expires_at: EXPIRES_AT,
        freshness: "fresh",
      },
      device_revoke_exercise: {
        exercise_ref: "exercise:owner-pc-one-seat-revoke-v1",
        exercise_digest: digest("f"),
        project_scope_ref: PROJECT,
        device_ref: tuple.device_ref,
        credential_handle_ref: tuple.credential_handle_ref,
        state: "verified_revoke",
        verified_at: OBSERVED_AT,
        expires_at: EXPIRES_AT,
        freshness: "fresh",
      },
      device_recovery_exercise: {
        exercise_ref: "exercise:owner-pc-one-seat-recovery-v1",
        exercise_digest: digest("0"),
        project_scope_ref: PROJECT,
        device_ref: tuple.device_ref,
        credential_handle_ref: tuple.credential_handle_ref,
        state: "verified_recovery",
        verified_at: OBSERVED_AT,
        expires_at: EXPIRES_AT,
        freshness: "fresh",
      },
    },
  };
}

test("the current public evidence remains HOLD: catalog manuals are not release-ready and physical acceptance/binding proofs are not public facts", () => {
  const catalog = JSON.parse(readFileSync(
    new URL("../manuals/manual_release_catalog.v0.json", import.meta.url),
    "utf8",
  ));
  assert.equal(catalog.catalog_state, "release_hold");
  assert.equal(catalog.manuals.some((manual) => manual.state !== "ready"), true);

  const publicHold = readyPacket();
  publicHold.manual_resolution_receipt.catalog_state = catalog.catalog_state;
  publicHold.manual_resolution_receipt.resolution_state = "hold";
  publicHold.manual_resolution_receipt.manual_exercise = null;
  publicHold.synthetic_recovery_receipts.acceptance_receipt = null;
  publicHold.device_project_credential_binding = null;

  const result = evaluateInternalRcPrephysicalReadiness(publicHold);
  assert.equal(result.status, PREPHYSICAL_READINESS_STATUS.HOLD);
  for (const expected of [
    H.MANUAL_RESOLUTION_NOT_READY,
    H.ACTUAL_MANUAL_EXERCISE_MISSING,
    H.SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_MISSING,
    H.HUMAN_ACCEPTANCE_MISSING,
    H.DEVICE_PROJECT_CREDENTIAL_BINDING_MISSING,
    H.DEVICE_ENROLLMENT_MISSING,
    H.DEVICE_REVOKE_PROOF_MISSING,
    H.DEVICE_RECOVERY_PROOF_MISSING,
  ]) assert.equal(result.blockers.includes(expected), true, expected);
});

test("a fully supplied synthetic exact packet can reach only the one-physical-seat readiness gate", () => {
  const packet = readyPacket();
  const before = structuredClone(packet);
  const first = evaluateInternalRcPrephysicalReadiness(packet);
  const replay = evaluateInternalRcPrephysicalReadiness(packet);

  assert.deepEqual(packet, before, "the check-only binder must not mutate injected evidence");
  assert.deepEqual(first, replay, "identical injected evidence replays deterministically");
  assert.equal(first.schema_version, PREPHYSICAL_READINESS_RESULT_SCHEMA);
  assert.equal(first.status, PREPHYSICAL_READINESS_STATUS.READY_FOR_ONE_PHYSICAL_SEAT_GATE);
  assert.equal(first.gate, "one_physical_seat");
  assert.equal(first.effect, "check_only");
  assert.deepEqual(first.blockers, []);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.blockers), true);
});

test("missing and mismatched evidence fails closed for the complete physical gate set", () => {
  const absent = evaluateInternalRcPrephysicalReadiness(undefined);
  assert.equal(absent.status, PREPHYSICAL_READINESS_STATUS.HOLD);
  for (const expected of [
    H.PACK_EVIDENCE_MISSING,
    H.PACK_DIGEST_MISSING,
    H.MANUAL_RESOLUTION_RECEIPT_MISSING,
    H.ACTUAL_MANUAL_EXERCISE_MISSING,
    H.KNOWN_ISSUES_REF_MISSING,
    H.SUPPORT_REF_MISSING,
    H.ROLLBACK_REF_MISSING,
    H.AUTHORITY_TAXONOMY_RECEIPT_MISSING,
    H.SYNTHETIC_RECOVERY_TECHNICAL_RECEIPT_MISSING,
    H.SYNTHETIC_RECOVERY_ACCEPTANCE_RECEIPT_MISSING,
    H.HUMAN_ACCEPTANCE_MISSING,
    H.DEVICE_PROJECT_CREDENTIAL_BINDING_MISSING,
    H.DEVICE_ENROLLMENT_MISSING,
    H.DEVICE_REVOKE_PROOF_MISSING,
    H.DEVICE_RECOVERY_PROOF_MISSING,
    H.FRESHNESS_MISSING,
  ]) assert.equal(absent.blockers.includes(expected), true, expected);

  const mismatched = readyPacket();
  mismatched.device_project_credential_binding.device_recovery_exercise.project_scope_ref = "project:other";
  mismatched.manual_resolution_receipt.manual_exercise.credential_handle_ref = "credential:other";
  mismatched.pack_evidence[1].pack_digest = digest("a");
  mismatched.support_rollback_receipt.rollback_ref = "c" + ":/not-a-ref";
  mismatched.authority_taxonomy_receipt.expires_at = EVALUATED_AT;
  const result = evaluateInternalRcPrephysicalReadiness(mismatched);
  assert.equal(result.status, PREPHYSICAL_READINESS_STATUS.HOLD);
  for (const expected of [
    H.PROJECT_SCOPE_MISMATCH,
    H.EXACT_BINDING_MISMATCH,
    H.PACK_DIGEST_MISMATCH,
    H.ROLLBACK_REF_MISSING,
    H.FRESHNESS_INVALID,
  ]) assert.equal(result.blockers.includes(expected), true, expected);
});

test("hostile accessors and proxies are refused without executing user-provided getters", () => {
  const accessor = readyPacket();
  Object.defineProperty(accessor, "pack_evidence", {
    enumerable: true,
    get() { throw new Error("getter must not run"); },
  });
  assert.doesNotThrow(() => evaluateInternalRcPrephysicalReadiness(accessor));
  assert.equal(
    evaluateInternalRcPrephysicalReadiness(accessor).blockers.includes(H.INPUT_SHAPE_INVALID),
    true,
  );

  const proxy = new Proxy(readyPacket(), {});
  assert.doesNotThrow(() => evaluateInternalRcPrephysicalReadiness(proxy));
  assert.equal(
    evaluateInternalRcPrephysicalReadiness(proxy).blockers.includes(H.INPUT_SHAPE_INVALID),
    true,
  );
});

test("the binder itself has no filesystem, network, clock, process, or writer surface", () => {
  const source = readFileSync(new URL("../src/internal_rc_prephysical_readiness.mjs", import.meta.url), "utf8");
  for (const forbidden of [
    "node:fs", "node:http", "node:https", "node:net", "fetch(", "Date.now(", "new Date(",
    "process.env", "writeFile", "appendFile", "mkdir", "spawn(", "exec(", "localStorage",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});

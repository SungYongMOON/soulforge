import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { validateLaneRecord } from "../path_registry/src/source_lane_index.mjs";
import {
  SOURCE_BACKUP_GENERATION_HOLD_CODES as H,
  bindSourceBackupGeneration,
} from "./source_backup_generation_contract.mjs";

const DIGEST = `sha256:${"ab".repeat(32)}`;
const OTHER_DIGEST = `sha256:${"cd".repeat(32)}`;

function validInput(overrides = {}) {
  return {
    capture_record: {
      record_kind: "capture_generation",
      source_ref: "source.slack",
      generation_seq: 7,
      capture_ref: "capture.slack.gen-7",
      manifest_ref: "manifest.slack.capture.gen-7",
      item_count: 42,
      content_digest: DIGEST,
      captured_at: "2026-08-31T01:00:00Z",
      immutable: true,
    },
    byte_owner_manifest: {
      schema_version: "soulforge.source_backup.byte_owner_manifest.v0",
      source_ref: "source.slack",
      project_scope_ref: "project.shared-services",
      generation_seq: 7,
      capture_ref: "capture.slack.gen-7",
      capture_manifest_ref: "manifest.slack.capture.gen-7",
      content_digest: DIGEST,
      item_count: 42,
      byte_length: 8192,
      byte_owner_ref: "owner.source-bytes",
      backup_manifest_ref: "manifest.slack.backup.gen-7",
      immutable: true,
    },
    backup_evidence: {
      schema_version: "soulforge.source_backup.generation_evidence.v0",
      source_ref: "source.slack",
      project_scope_ref: "project.shared-services",
      generation_seq: 7,
      capture_ref: "capture.slack.gen-7",
      capture_content_digest: DIGEST,
      backup_generation_ref: "backup.slack.gen-7",
      backup_manifest_ref: "manifest.slack.backup.gen-7",
      backup_content_digest: DIGEST,
      backed_up_at: "2026-08-31T02:00:00Z",
      create_only: true,
      overwrite_allowed: false,
      exact_byte_readback: true,
      readback_digest: DIGEST,
      byte_owner_ref: "owner.source-bytes",
    },
    restore_evidence: {
      schema_version: "soulforge.source_backup.restore_evidence.v0",
      source_ref: "source.slack",
      project_scope_ref: "project.shared-services",
      backup_generation_ref: "backup.slack.gen-7",
      backup_manifest_ref: "manifest.slack.backup.gen-7",
      restore_test_ref: "restore_test.slack.gen-7",
      isolated_root_ref: "recovery.test_root.slack",
      restored_at: "2026-08-31T03:00:00Z",
      exact_byte_readback: true,
      readback_digest: DIGEST,
    },
    owners: {
      logical_owner_ref: "owner.source-logical",
      byte_owner_ref: "owner.source-bytes",
      revision_owner_ref: "owner.source-revision",
      acceptance_owner_ref: "owner.source-acceptance",
      backup_restore_owner_ref: "owner.backup-restore",
    },
    retention_policy_ref: "policy.retention.source.v0",
    rpo_policy_ref: "policy.rpo.source.v0",
    ...overrides,
  };
}

function verifiedAcceptance(overrides = {}) {
  return {
    schema_version: "soulforge.source_backup.human_acceptance_evidence.v0",
    source_ref: "source.slack",
    project_scope_ref: "project.shared-services",
    backup_generation_ref: "backup.slack.gen-7",
    restore_test_ref: "restore_test.slack.gen-7",
    restore_readback_digest: DIGEST,
    decision: "accepted",
    verified: true,
    verifier_ref: "verifier.owner-gate",
    acceptance_owner_ref: "owner.source-acceptance",
    authority_receipt_ref: "receipt.owner.acceptance.slack.gen-7",
    authority_receipt_digest: DIGEST,
    verified_at: "2026-08-31T04:00:00Z",
    claim_ceiling: "human_acceptance_verified",
    ...overrides,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function trustedPin(evidence, overrides = {}) {
  return {
    schema_version: "soulforge.source_backup.trusted_acceptance_pin.v0",
    pin_ref: "pin.owner.acceptance.slack.gen-7",
    trusted_authority_ref: "authority.owner.acceptance-gate",
    acceptance_envelope_digest: `sha256:${createHash("sha256").update(canonical(evidence)).digest("hex")}`,
    claim_ceiling: "acceptance_envelope_digest_verified",
    ...overrides,
  };
}

test("exact source backup and isolated restore evidence produces only compatible lane records", () => {
  const acceptance = verifiedAcceptance();
  const result = bindSourceBackupGeneration(
    validInput({ human_acceptance_evidence: acceptance }),
    trustedPin(acceptance),
  );
  assert.equal(result.status, "BOUND");
  assert.equal(result.receipt.source_ref, "source.slack");
  assert.equal(result.receipt.project_scope_ref, "project.shared-services");
  assert.equal(result.receipt.capture_generation_seq, 7);
  assert.equal(result.receipt.backup_content_digest, DIGEST);
  assert.equal(result.receipt.human_acceptance_state, "accepted");
  assert.equal(result.receipt.human_acceptance_trusted_pin.pin_ref, "pin.owner.acceptance.slack.gen-7");
  assert.deepEqual(result.receipt.owners, validInput().owners);
  assert.equal(result.receipt.retention_policy_ref, "policy.retention.source.v0");
  assert.equal(result.receipt.rpo_policy_ref, "policy.rpo.source.v0");

  const backup = validateLaneRecord(result.receipt.backup_generation_pointer);
  const restore = validateLaneRecord(result.receipt.restore_test);
  assert.deepEqual(backup, {
    record_kind: "backup_generation_pointer",
    source_ref: "source.slack",
    generation_seq: 7,
    backup_generation_ref: "backup.slack.gen-7",
    content_digest: DIGEST,
    backed_up_at: "2026-08-31T02:00:00Z",
  });
  assert.deepEqual(restore, {
    record_kind: "restore_test",
    source_ref: "source.slack",
    restore_test_ref: "restore_test.slack.gen-7",
    backup_generation_ref: "backup.slack.gen-7",
    isolated_root_ref: "recovery.test_root.slack",
    readback_digest: DIGEST,
    restored_at: "2026-08-31T03:00:00Z",
    human_acceptance_state: "accepted",
  });
  assert.equal(JSON.stringify(result).includes("raw bytes"), false);
  assert.equal(Object.isFrozen(result.receipt.owners), true);
});

test("pending human acceptance stays pending and is never fabricated as accepted", () => {
  const input = validInput();
  const result = bindSourceBackupGeneration(input);
  assert.equal(result.status, "BOUND");
  assert.equal(result.receipt.human_acceptance_state, "pending");
  assert.equal(result.receipt.technical_restore_state, "technical_restore_candidate");
  assert.equal(result.receipt.backup_generation_pointer.record_kind, "backup_generation_pointer");
  assert.equal(result.receipt.restore_test, null);
  assert.equal(result.receipt.human_acceptance_evidence, null);

  // A caller-provided label is not evidence and cannot be accepted.
  const invalid = validInput();
  invalid.restore_evidence.human_acceptance_state = "accepted";
  assert.deepEqual(bindSourceBackupGeneration(invalid), {
    status: "HOLD", hold_code: H.RESTORE_EVIDENCE_INVALID,
  });

  for (const evidence of [
    verifiedAcceptance({ verified: false }),
    verifiedAcceptance({ decision: "pending" }),
    verifiedAcceptance({ claim_ceiling: "technical_restore_candidate" }),
    verifiedAcceptance({ authority_receipt_digest: "sha256:bad" }),
    verifiedAcceptance({ verified_at: "2026-08-31T02:59:59Z" }),
  ]) {
    assert.deepEqual(bindSourceBackupGeneration(validInput({
      human_acceptance_evidence: evidence,
    })), { status: "HOLD", hold_code: H.ACCEPTANCE_EVIDENCE_INVALID });
  }

  const validButUnpinned = verifiedAcceptance();
  assert.deepEqual(bindSourceBackupGeneration(validInput({
    human_acceptance_evidence: validButUnpinned,
  })), { status: "HOLD", hold_code: H.ACCEPTANCE_PIN_REQUIRED });

  assert.deepEqual(bindSourceBackupGeneration(
    validInput({ human_acceptance_evidence: validButUnpinned }),
    trustedPin(validButUnpinned, { acceptance_envelope_digest: OTHER_DIGEST }),
  ), { status: "HOLD", hold_code: H.ACCEPTANCE_PIN_MISMATCH });

  assert.deepEqual(bindSourceBackupGeneration(
    validInput({ human_acceptance_evidence: validButUnpinned }),
    { ...trustedPin(validButUnpinned), trusted_authority_ref: "" },
  ), { status: "HOLD", hold_code: H.ACCEPTANCE_PIN_INVALID });

  // A digest field smuggled into the envelope or raw input is not an
  // independent pin and cannot open acceptance.
  const selfPinned = validInput();
  selfPinned.human_acceptance_evidence = {
    ...validButUnpinned,
    acceptance_envelope_digest: trustedPin(validButUnpinned).acceptance_envelope_digest,
  };
  assert.equal(bindSourceBackupGeneration(selfPinned).hold_code, H.ACCEPTANCE_EVIDENCE_INVALID);
  const inBandPin = validInput({
    human_acceptance_evidence: validButUnpinned,
    trusted_acceptance_pin: trustedPin(validButUnpinned),
  });
  assert.equal(bindSourceBackupGeneration(inBandPin).hold_code, H.INPUT_INVALID);
});

test("create-only and exact readback evidence are mandatory", () => {
  for (const [field, value, expected] of [
    ["create_only", false, H.CREATE_ONLY_REQUIRED],
    ["overwrite_allowed", true, H.CREATE_ONLY_REQUIRED],
    ["exact_byte_readback", false, H.EXACT_READBACK_REQUIRED],
  ]) {
    const input = validInput();
    input.backup_evidence[field] = value;
    assert.deepEqual(bindSourceBackupGeneration(input), { status: "HOLD", hold_code: expected });
  }
  const restore = validInput();
  restore.restore_evidence.exact_byte_readback = false;
  assert.deepEqual(bindSourceBackupGeneration(restore), {
    status: "HOLD", hold_code: H.EXACT_READBACK_REQUIRED,
  });
});

test("source, project, generation, manifest and owner scope cannot widen", () => {
  const mutations = [
    ["backup_evidence", "source_ref", "source.mail"],
    ["restore_evidence", "project_scope_ref", "project.foreign"],
    ["byte_owner_manifest", "generation_seq", 8],
    ["backup_evidence", "capture_ref", "capture.slack.gen-6"],
    ["restore_evidence", "backup_manifest_ref", "manifest.slack.backup.foreign"],
    ["backup_evidence", "byte_owner_ref", "owner.foreign-bytes"],
  ];
  for (const [section, field, value] of mutations) {
    const input = validInput();
    input[section][field] = value;
    assert.equal(bindSourceBackupGeneration(input).status, "HOLD", `${section}.${field}`);
  }
});

test("every digest must round-trip capture to backup to isolated restore", () => {
  for (const [section, field] of [
    ["byte_owner_manifest", "content_digest"],
    ["backup_evidence", "capture_content_digest"],
    ["backup_evidence", "backup_content_digest"],
    ["backup_evidence", "readback_digest"],
    ["restore_evidence", "readback_digest"],
  ]) {
    const input = validInput();
    input[section][field] = OTHER_DIGEST;
    assert.deepEqual(bindSourceBackupGeneration(input), {
      status: "HOLD", hold_code: H.DIGEST_MISMATCH,
    });
  }
});

test("invalid or regressing evidence clocks HOLD without consulting a clock", () => {
  const fractional = validInput();
  fractional.capture_record.captured_at = "2026-08-31T01:00:00.1Z";
  assert.equal(bindSourceBackupGeneration(fractional).status, "BOUND");

  const earlyBackup = validInput();
  earlyBackup.backup_evidence.backed_up_at = "2026-08-31T00:59:59Z";
  assert.deepEqual(bindSourceBackupGeneration(earlyBackup), {
    status: "HOLD", hold_code: H.TIME_ORDER_INVALID,
  });

  const earlyRestore = validInput();
  earlyRestore.restore_evidence.restored_at = "2026-08-31T01:59:59Z";
  assert.deepEqual(bindSourceBackupGeneration(earlyRestore), {
    status: "HOLD", hold_code: H.TIME_ORDER_INVALID,
  });

  const invalidClock = validInput();
  invalidClock.restore_evidence.restored_at = "2026-02-30T03:00:00Z";
  assert.equal(bindSourceBackupGeneration(invalidClock).hold_code, H.RESTORE_EVIDENCE_INVALID);
});

test("replay is deterministic NO_OP and a divergent natural identity HOLDs", () => {
  const first = bindSourceBackupGeneration(validInput());
  const replay = bindSourceBackupGeneration({ ...validInput(), prior_receipt: first.receipt });
  assert.equal(replay.status, "NO_OP");
  assert.deepEqual(replay.receipt, first.receipt);

  // The pending technical candidate can advance once, without persisting a
  // pending source-lane restore record that would block the accepted record.
  const acceptance = verifiedAcceptance();
  const advanced = bindSourceBackupGeneration(validInput({
    prior_receipt: first.receipt,
    human_acceptance_evidence: acceptance,
  }), trustedPin(acceptance));
  assert.equal(advanced.status, "ADVANCED");
  assert.equal(advanced.receipt.human_acceptance_state, "accepted");
  assert.equal(advanced.receipt.restore_test.human_acceptance_state, "accepted");
  assert.equal(validateLaneRecord(advanced.receipt.restore_test).record_kind, "restore_test");

  const acceptedReplay = bindSourceBackupGeneration(validInput({
    prior_receipt: advanced.receipt,
    human_acceptance_evidence: acceptance,
  }), trustedPin(acceptance));
  assert.equal(acceptedReplay.status, "NO_OP");

  const divergent = validInput({ prior_receipt: first.receipt });
  divergent.backup_evidence.backup_generation_ref = "backup.slack.gen-7-divergent";
  divergent.restore_evidence.backup_generation_ref = "backup.slack.gen-7-divergent";
  assert.deepEqual(bindSourceBackupGeneration(divergent), {
    status: "HOLD", hold_code: H.REPLAY_CONFLICT,
  });
});

test("raw payload, secrets, absolute paths, proxies, getters and unknown fields reject", () => {
  const payload = validInput();
  payload.backup_evidence.payload = "raw bytes";
  assert.equal(bindSourceBackupGeneration(payload).hold_code, H.SECRET_OR_PAYLOAD_FORBIDDEN);

  const secret = validInput();
  secret.owners.token_value = "not-a-real-token";
  assert.equal(bindSourceBackupGeneration(secret).hold_code, H.SECRET_OR_PAYLOAD_FORBIDDEN);

  const path = validInput();
  path.restore_evidence.isolated_root_ref = [["C:", "recovery"].join("/"), "slack"].join("/");
  assert.equal(bindSourceBackupGeneration(path).hold_code, H.ABSOLUTE_PATH_FORBIDDEN);

  const proxied = validInput();
  proxied.owners = new Proxy(proxied.owners, {});
  assert.equal(bindSourceBackupGeneration(proxied).hold_code, H.OWNER_INVALID);

  const getter = validInput();
  Object.defineProperty(getter.backup_evidence, "surprise", { get() { throw new Error("must-not-run"); } });
  assert.equal(bindSourceBackupGeneration(getter).hold_code, H.INPUT_INVALID);

  const unknown = validInput();
  unknown.unapproved_field = true;
  assert.equal(bindSourceBackupGeneration(unknown).hold_code, H.INPUT_INVALID);
});

test("malformed capture and policy refs never produce backup or restore records", () => {
  const mutableCapture = validInput();
  mutableCapture.capture_record.immutable = false;
  assert.deepEqual(bindSourceBackupGeneration(mutableCapture), {
    status: "HOLD", hold_code: H.CAPTURE_RECORD_INVALID,
  });

  const missingPolicy = validInput();
  missingPolicy.rpo_policy_ref = "";
  const held = bindSourceBackupGeneration(missingPolicy);
  assert.equal(held.status, "HOLD");
  assert.equal(held.hold_code, H.POLICY_REF_INVALID);
  assert.equal("backup_generation_pointer" in held, false);
  assert.equal("restore_test" in held, false);
});

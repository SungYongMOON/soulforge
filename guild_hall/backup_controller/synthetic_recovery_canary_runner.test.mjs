import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  SYNTHETIC_RECOVERY_CANARY_HOLD_CODES as H,
  runSyntheticRecoveryCanary,
  validateSyntheticRecoveryCanaryTechnicalReceipt,
} from "./synthetic_recovery_canary_runner.mjs";

test("synthetic canary creates an exact readback and isolated restore candidate without payload", async () => {
  const result = await runSyntheticRecoveryCanary();
  assert.equal(result.status, "SYNTHETIC_TECHNICAL_RESTORE_CANDIDATE");
  assert.equal(validateSyntheticRecoveryCanaryTechnicalReceipt(result.receipt).valid, true);
  assert.equal(result.receipt.create_only, true);
  assert.equal(result.receipt.overwrite_allowed, false);
  assert.equal(result.receipt.manifest_hash_readback, true);
  assert.equal(result.receipt.backup_hash_readback, true);
  assert.equal(result.receipt.restore_manifest_hash_readback, true);
  assert.equal(result.receipt.restore_hash_readback, true);
  assert.equal(result.receipt.isolated_restore, true);
  assert.equal(result.receipt.item_parity, true);
  assert.equal(result.receipt.byte_parity, true);
  assert.equal(result.receipt.recoverable_item_gap, 0);
  assert.equal(result.receipt.recoverable_byte_gap, 0);
  assert.equal(result.receipt.human_acceptance_state, "pending");

  const serialized = JSON.stringify(result.receipt);
  assert.equal(serialized.includes(tmpdir()), false);
  assert.equal(serialized.includes("fixture-index.bin"), false);
  assert.equal(/nas|recovery-ready|rpo|rto|internal rc/iu.test(serialized), false);
  assert.equal("acceptance_owner_ref" in result.receipt, false);
});

test("synthetic canary holds on corrupt backup, occupied target, traversal, and partial restore", async () => {
  const cases = [
    ["backup_corruption", H.BACKUP_READBACK_MISMATCH],
    ["occupied_backup_target", H.TARGET_OCCUPIED],
    ["manifest_traversal", H.PATH_TRAVERSAL_REJECTED],
    ["partial_restore", H.RESTORE_PARITY_MISMATCH],
  ];
  for (const [testFault, expectedHold] of cases) {
    const result = await runSyntheticRecoveryCanary({ test_fault: testFault });
    assert.equal(result.status, "HOLD", testFault);
    assert.equal(result.hold_code, expectedHold, testFault);
    assert.equal(result.receipt.technical_state, "hold", testFault);
    assert.equal(result.receipt.human_acceptance_state, "pending", testFault);
  }

  const partial = await runSyntheticRecoveryCanary({ test_fault: "partial_restore" });
  assert.equal(partial.receipt.isolated_restore, true);
  assert.equal(partial.receipt.restored_item_count < partial.receipt.source_item_count, true);
  assert.equal(partial.receipt.recoverable_item_gap > 0, true);
  assert.equal(partial.receipt.recoverable_byte_gap > 0, true);
});

test("synthetic canary refuses unrecognized fault inputs before temporary capture", async () => {
  const result = await runSyntheticRecoveryCanary({ test_fault: "not-a-test-fault" });
  assert.equal(result.status, "HOLD");
  assert.equal(result.hold_code, H.OPTIONS_INVALID);
});

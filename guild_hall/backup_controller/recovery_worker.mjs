import { parentPort, workerData } from "node:worker_threads";

const recovery = await import("../ingress/recovery.mjs");
if (typeof recovery.HPP_INGRESS_RECOVERY_POLICY_SCHEMA !== "string"
  || typeof recovery.planIngressRecoverySnapshot !== "function"
  || typeof recovery.createIngressRecoverySnapshot !== "function"
  || typeof recovery.verifyIngressRecoveryRestore !== "function") {
  throw new Error("hpp_recovery_policy_api_unavailable");
}

const SHA256 = /^[a-f0-9]{64}$/;

function assertPinnedPolicy(options, actualSha256) {
  if (!SHA256.test(options.expected_policy_sha256 ?? "")) {
    throw new Error("hpp_recovery_policy_pin_required");
  }
  if (actualSha256 !== options.expected_policy_sha256) {
    throw new Error("hpp_recovery_policy_pin_mismatch");
  }
}

let result;
if (workerData.operation === "snapshot") {
  const options = workerData.options;
  const plan = await recovery.planIngressRecoverySnapshot({
    sourceRoot: options.source_root,
    backupRoot: options.backup_root,
    recoveryPolicyPath: options.recovery_policy_path,
  });
  assertPinnedPolicy(options, plan.recoveryPolicy.sha256);
  result = await recovery.createIngressRecoverySnapshot({
    sourceRoot: options.source_root,
    backupRoot: options.backup_root,
    recoveryPolicyPath: options.recovery_policy_path,
    apply: true,
    generationId: `bc-${options.operation_key.slice(-32)}`,
    expectedSourceIdentity: plan.sourceIdentityDigest,
    expectedSourceDigest: plan.sourceDigest,
    approvalRef: options.approval_ref,
    now: new Date(options.now),
  });
  assertPinnedPolicy(options, result.recovery_policy_sha256);
} else if (workerData.operation === "verify_anchored") {
  const options = workerData.options;
  result = await recovery.verifyIngressRecoveryRestore({
    backupRoot: options.backup_root,
    generationId: options.generation_id,
    restoreRoot: options.restore_root,
    recoveryPolicyPath: options.recovery_policy_path,
    expectedManifestSha256: options.expected_manifest_sha256,
  });
  assertPinnedPolicy(options, result.recovery_policy_sha256);
} else {
  throw new Error("recovery_worker_operation_invalid");
}
parentPort.postMessage(result);

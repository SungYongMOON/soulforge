import {
  RETENTION_CANARY_APPROVAL_SCHEMA,
  RETENTION_CANARY_PACKET_SCHEMA,
  RETENTION_CANARY_RECEIPT_SCHEMA,
  RETENTION_CANARY_RESULT_SCHEMA,
  RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
  CANARY_MANAGER_PROTOCOL_SCHEMA,
  ALLOWED_CANARY_ACTIONS,
  ALLOWED_CANARY_STRATEGIES,
  REAL_EVIDENCE_TOKENS,
  SYNTHETIC_EVIDENCE_TOKENS,
  SAFE_EVIDENCE_TOKENS,
  SAFE_CANARY_ERROR_CODES,
  validateRetentionCanaryApprovalInternal,
  planRetentionCanaryInternal,
  executeRetentionCanaryProductionInternal,
  computePacketDigest
} from "./lifecycle_retention_canary_internal.mjs";

export {
  RETENTION_CANARY_APPROVAL_SCHEMA,
  RETENTION_CANARY_PACKET_SCHEMA,
  RETENTION_CANARY_RECEIPT_SCHEMA,
  RETENTION_CANARY_RESULT_SCHEMA,
  RETENTION_ARCHIVE_OBSERVATION_SCHEMA,
  CANARY_MANAGER_PROTOCOL_SCHEMA,
  ALLOWED_CANARY_ACTIONS,
  ALLOWED_CANARY_STRATEGIES,
  REAL_EVIDENCE_TOKENS,
  SYNTHETIC_EVIDENCE_TOKENS,
  SAFE_EVIDENCE_TOKENS,
  SAFE_CANARY_ERROR_CODES,
  computePacketDigest
};

export function validateRetentionCanaryApproval(approvalInput, options = {}) {
  const safeOptions = { now: options?.now };
  return validateRetentionCanaryApprovalInternal(approvalInput, safeOptions);
}

export function planRetentionCanary(reportInput, approvalInput, preservationReceiptInput, options = {}) {
  const safeOptions = {
    now: options?.now,
    target_commit_sha: options?.target_commit_sha || options?.targetCommitSha,
    approved_main_sha: options?.approved_main_sha || options?.approvedMainSha,
    approved_main_ref: options?.approved_main_ref || options?.approvedMainRef
  };
  return planRetentionCanaryInternal(reportInput, approvalInput, preservationReceiptInput, safeOptions);
}

export function executeRetentionCanary(reportInput, approvalInput, preservationReceiptInput, archiveObservationInput, options = {}) {
  const safeOptions = { now: options?.now };
  return executeRetentionCanaryProductionInternal(reportInput, approvalInput, preservationReceiptInput, archiveObservationInput, safeOptions);
}

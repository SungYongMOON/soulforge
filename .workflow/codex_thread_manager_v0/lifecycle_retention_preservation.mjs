import {
  RETENTION_APPROVAL_RECEIPT_SCHEMA,
  RETENTION_PRESERVATION_MANIFEST_SCHEMA,
  RETENTION_PRESERVATION_RECEIPT_SCHEMA,
  RETENTION_PRESERVATION_RESULT_SCHEMA,
  ALLOWED_RETENTION_ACTIONS,
  ALLOWED_PRESERVATION_STRATEGIES,
  validateRetentionApprovalReceiptInternal,
  planRetentionPreservationInternal,
  executeRetentionPreservationProductionInternal,
  verifyRetentionPreservationInternal,
  computeManifestDigest
} from "./lifecycle_retention_preservation_internal.mjs";

export {
  RETENTION_APPROVAL_RECEIPT_SCHEMA,
  RETENTION_PRESERVATION_MANIFEST_SCHEMA,
  RETENTION_PRESERVATION_RECEIPT_SCHEMA,
  RETENTION_PRESERVATION_RESULT_SCHEMA,
  ALLOWED_RETENTION_ACTIONS,
  ALLOWED_PRESERVATION_STRATEGIES,
  computeManifestDigest
};

export function validateRetentionApprovalReceipt(approvalInput, options = {}) {
  const safeOptions = { now: options?.now };
  return validateRetentionApprovalReceiptInternal(approvalInput, safeOptions);
}

export function planRetentionPreservation(reportInput, approvalInput, options = {}) {
  const safeOptions = { now: options?.now };
  return planRetentionPreservationInternal(reportInput, approvalInput, safeOptions);
}

export function executeRetentionPreservation(reportInput, approvalInput, options = {}) {
  const safeOptions = { now: options?.now };
  return executeRetentionPreservationProductionInternal(reportInput, approvalInput, safeOptions);
}

export function verifyRetentionPreservation(expectedManifest, readbackResult) {
  return verifyRetentionPreservationInternal(expectedManifest, readbackResult);
}

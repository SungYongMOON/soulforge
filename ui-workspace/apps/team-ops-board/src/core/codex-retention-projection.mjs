import {
  readCodexRetentionProjectionInternal,
  CODEX_RETENTION_PROJECTION_ENVELOPE_SCHEMA,
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA,
  CODEX_RETENTION_ENDPOINT_PATH,
  DEFAULT_PERIOD_SECONDS,
  DEFAULT_GRACE_SECONDS,
  computeAutomationReportDigest,
  validateCodexRetentionAutomationReport,
  unavailableProjection,
  evaluateCodexRetentionProjection
} from "./codex-retention-projection-internal.mjs";

export {
  CODEX_RETENTION_PROJECTION_ENVELOPE_SCHEMA,
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA,
  CODEX_RETENTION_ENDPOINT_PATH,
  DEFAULT_PERIOD_SECONDS,
  DEFAULT_GRACE_SECONDS,
  computeAutomationReportDigest,
  validateCodexRetentionAutomationReport,
  unavailableProjection,
  evaluateCodexRetentionProjection
};

export async function readCodexRetentionProjection(options = {}) {
  const safeOptions = {
    ownerRoot: options.ownerRoot,
    reportPath: options.reportPath,
    now: options.now,
    periodSeconds: options.periodSeconds,
    graceSeconds: options.graceSeconds
  };
  return readCodexRetentionProjectionInternal(safeOptions, {});
}

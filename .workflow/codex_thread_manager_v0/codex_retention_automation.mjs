import {
  runCodexRetentionAutomationInternal,
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA,
  FEATURE_CATALOG_SCHEMA,
  RELATIVE_REPORT_PATH,
  DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
  computeAutomationReportDigest,
  validateFeatureCatalogInput
} from "./codex_retention_automation_internal.mjs";

export {
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA,
  FEATURE_CATALOG_SCHEMA,
  RELATIVE_REPORT_PATH,
  DEFAULT_LIFECYCLE_RETENTION_FEATURE_CATALOG,
  computeAutomationReportDigest,
  validateFeatureCatalogInput
};

export async function runCodexRetentionAutomation(options = {}) {
  const safeOptions = {
    repoRoot: options.repoRoot,
    activityRoot: options.activityRoot,
    catalog: options.catalog,
    now: options.now,
    expectedDigest: options.expectedDigest
  };
  return runCodexRetentionAutomationInternal(safeOptions, {});
}

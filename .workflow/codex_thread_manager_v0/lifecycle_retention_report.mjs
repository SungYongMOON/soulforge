import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  DEFAULT_LIFECYCLE_MAX_AGE_MS,
  LIFECYCLE_RETENTION_REPORT_DISABLED_ENV,
  LIFECYCLE_RETENTION_REPORT_SCHEMA,
  TASK_WORKTREE_BINDING_SCHEMA,
  buildLifecycleRetentionReport as buildLifecycleRetentionReportCore,
  canonicalizeJson,
  classifyLifecycleRetentionThread,
  computeReportDigest,
  defaultLifecycleRetentionReportPaths,
  defaultRepoRoot,
  deriveResultGateStates,
  inspectWorktreePreflight,
  isLifecycleRetentionReportDisabled,
  lifecycleRetentionReportUsage,
  normalizeBindingRegistry,
  normalizeEnrollmentRegistry,
  normalizeLifecycleSnapshot,
  normalizeResultGateRegistry,
  parseGitWorktreePorcelain,
  parseLifecycleRetentionReportArgs,
  readJsonSource,
  runLifecycleRetentionReport as runLifecycleRetentionReportCore,
  selectExactLifecycleObservations,
  summarizeWorktreePreflight,
  unavailableWorktreePreflight
} from "./lifecycle_retention.mjs";

const ALLOWLISTED_ERRORS = new Set([
  "report_only_destructive_option_forbidden",
  "invalid_lifecycle_retention_report_arguments",
  "invalid_expected_digest_format",
  "invalid_main_ref"
]);

export {
  DEFAULT_LIFECYCLE_MAX_AGE_MS,
  LIFECYCLE_RETENTION_REPORT_DISABLED_ENV,
  LIFECYCLE_RETENTION_REPORT_SCHEMA,
  TASK_WORKTREE_BINDING_SCHEMA,
  canonicalizeJson,
  classifyLifecycleRetentionThread,
  computeReportDigest,
  defaultLifecycleRetentionReportPaths,
  defaultRepoRoot,
  deriveResultGateStates,
  inspectWorktreePreflight,
  isLifecycleRetentionReportDisabled,
  lifecycleRetentionReportUsage,
  normalizeBindingRegistry,
  normalizeEnrollmentRegistry,
  normalizeLifecycleSnapshot,
  normalizeResultGateRegistry,
  parseGitWorktreePorcelain,
  parseLifecycleRetentionReportArgs,
  readJsonSource,
  selectExactLifecycleObservations,
  summarizeWorktreePreflight,
  unavailableWorktreePreflight
};

export function buildLifecycleRetentionReport(options = {}) {
  return buildLifecycleRetentionReportCore({ legacyMode: true, includeLegacyThreads: true, ...options });
}

export async function runLifecycleRetentionReport(options = {}) {
  return runLifecycleRetentionReportCore({ legacyMode: true, ...options });
}

export async function main(argv = process.argv.slice(2), { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const args = parseLifecycleRetentionReportArgs(argv);
    if (args.help) {
      stdout.write(`${lifecycleRetentionReportUsage({ wrapper: "legacy" })}\n`);
      return 0;
    }
    if (isLifecycleRetentionReportDisabled(env)) {
      stdout.write(`${JSON.stringify({
        schema_version: LIFECYCLE_RETENTION_REPORT_SCHEMA,
        report_only: true,
        status: "disabled",
        reason_code: "emergency_disable_active"
      })}\n`);
      return 0;
    }
    const report = await runLifecycleRetentionReport(args);
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.digest_mismatch === true) {
      return 3;
    }
    return 0;
  } catch (error) {
    const errCode = ALLOWLISTED_ERRORS.has(error?.message) ? error.message : "lifecycle_retention_report_failed";
    stderr.write(`${errCode}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => {
    process.exitCode = code;
  }).catch(() => {
    process.exitCode = 2;
  });
}

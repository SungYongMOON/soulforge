import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  LIFECYCLE_RETENTION_REPORT_SCHEMA,
  isLifecycleRetentionReportDisabled,
  lifecycleRetentionReportUsage,
  parseLifecycleRetentionReportArgs,
  runLifecycleRetentionReport
} from "./lifecycle_retention.mjs";

const ALLOWLISTED_ERRORS = new Set([
  "report_only_destructive_option_forbidden",
  "invalid_lifecycle_retention_report_arguments",
  "invalid_expected_digest_format",
  "invalid_main_ref"
]);

export async function main(argv = process.argv.slice(2), { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const args = parseLifecycleRetentionReportArgs(argv);
    if (args.help) {
      stdout.write(`${lifecycleRetentionReportUsage({ wrapper: "explicit" })}\n`);
      return 0;
    }
    if (!args.hasReportCommand || !args.json) {
      throw new Error("invalid_lifecycle_retention_report_arguments");
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
    const report = await runLifecycleRetentionReport({ ...args, legacyMode: false });
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.digest_mismatch === true) {
      return 3;
    }
    return 0;
  } catch (error) {
    const errCode = ALLOWLISTED_ERRORS.has(error?.message) ? error.message : "lifecycle_retention_cli_failed";
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

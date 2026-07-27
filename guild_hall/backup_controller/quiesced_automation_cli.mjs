#!/usr/bin/env node
import { BackupControllerError } from "./controller.mjs";
import { runQuiescedDailyAutomation } from "./writer_quiesce.mjs";

function parseArgs(argv) {
  if (
    argv.length !== 6 ||
    argv[0] !== "--activation-sidecar" ||
    argv[2] !== "--quiesce-sidecar" ||
    argv[4] !== "--expected-quiesce-sha256"
  ) {
    throw new BackupControllerError("quiesced_automation_cli_usage_invalid");
  }
  return {
    activationSidecarRef: argv[1],
    quiesceSidecarRef: argv[3],
    expectedQuiesceSha256: argv[5],
  };
}

try {
  const output = await runQuiescedDailyAutomation(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  const errorCode = error instanceof BackupControllerError ? error.code : "quiesced_backup_automation_failed";
  process.stdout.write(`${JSON.stringify({
    schema_version: "soulforge.backup_controller.quiesced_automation_result.v1",
    operation: "quiesced_daily_automation",
    status: "rejected",
    error_code: errorCode,
  })}\n`);
  process.exitCode = 1;
}

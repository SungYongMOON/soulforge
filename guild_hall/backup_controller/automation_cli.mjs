#!/usr/bin/env node
import { runDailyAutomation } from "./automation.mjs";
import { BackupControllerError } from "./controller.mjs";

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--activation-sidecar") throw new BackupControllerError("automation_cli_usage_invalid");
  return { activationSidecarRef: argv[1] };
}

try {
  const output = await runDailyAutomation(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  const errorCode = error instanceof BackupControllerError ? error.code : "backup_automation_failed";
  process.stdout.write(`${JSON.stringify({ schema_version: "soulforge.backup_controller.automation_result.v1", operation: "daily_automation", status: "rejected", error_code: errorCode })}\n`);
  process.exitCode = 1;
}

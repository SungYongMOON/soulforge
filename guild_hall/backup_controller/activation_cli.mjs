#!/usr/bin/env node
import { BackupControllerError } from "./controller.mjs";
import { resolveActivation } from "./activation.mjs";

function parseArgs(argv) {
  if (argv[0] !== "verify" || argv.length !== 3 || argv[1] !== "--activation-sidecar") throw new BackupControllerError("activation_cli_usage_invalid");
  return { sidecarRef: argv[2] };
}

try {
  const resolved = await resolveActivation(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ schema_version: "soulforge.backup_controller.activation_result.v1", status: resolved.feature_enabled ? "enabled" : "feature_off", sidecar_sha256: resolved.sidecar_sha256, binding_sha256: resolved.binding_sha256, observed_at: resolved.observed_at })}\n`);
} catch (error) {
  const errorCode = error instanceof BackupControllerError ? error.code : "activation_verify_failed";
  process.stdout.write(`${JSON.stringify({ schema_version: "soulforge.backup_controller.activation_result.v1", status: "rejected", error_code: errorCode })}\n`);
  process.exitCode = 1;
}

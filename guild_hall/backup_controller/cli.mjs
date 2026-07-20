#!/usr/bin/env node

import { BackupControllerError, seedController, tickController } from "./controller.mjs";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = { operation: "tick", apply: false };
  let index = 0;
  if (argv[0] === "tick" || argv[0] === "seed") {
    options.operation = argv[0];
    index = 1;
  }
  while (index < argv.length) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
      index += 1;
      continue;
    }
    if (new Set(["--binding", "--expected-binding-sha256", "--approval-ref", "--now"]).has(token)) {
      if (index + 1 >= argv.length) throw new BackupControllerError("cli_argument_missing");
      const key = token.slice(2).replaceAll("-", "_");
      options[key] = argv[index + 1];
      index += 2;
      continue;
    }
    throw new BackupControllerError("cli_argument_invalid");
  }
  if (!options.binding) throw new BackupControllerError("binding_ref_required");
  if (options.apply && options.now !== undefined) throw new BackupControllerError("now_override_apply_forbidden");
  return options;
}

export async function runCli(argv, { executors = {} } = {}) {
  const options = parseArgs(argv);
  const common = {
    bindingRef: options.binding,
    apply: options.apply,
    expectedBindingSha256: options.expected_binding_sha256,
    approvalRef: options.approval_ref,
    now: options.now,
  };
  return options.operation === "seed"
    ? seedController(common)
    : tickController({ ...common, executors });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const output = await runCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    const errorCode = error instanceof BackupControllerError ? error.code : "backup_controller_failed";
    process.stdout.write(`${JSON.stringify({ schema_version: "soulforge.backup_controller.result.v1", status: "rejected", error_code: errorCode })}\n`);
    process.exitCode = 2;
  }
}

#!/usr/bin/env node

import {
  LinearLb1PhysicalError,
  beginLinearLb1PhysicalSession,
  readLinearLb1PhysicalConfig,
} from "./linear_lb1_physical_one_shot.mjs";

function hold(code) {
  process.stdout.write(`${JSON.stringify({
    schema_version: "soulforge.backup_controller.linear_lb1.physical_cli_result.v0",
    status: "HOLD",
    code,
    body_free: true,
  })}\n`);
  process.exitCode = 2;
}

function configArg(argv) {
  if (argv.length !== 2 || argv[0] !== "--config" || typeof argv[1] !== "string" || argv[1].length < 1) {
    return null;
  }
  return argv[1];
}

async function readStdin(maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxBytes) throw new LinearLb1PhysicalError("linear_lb1_physical_capture_too_large");
    chunks.push(chunk);
  }
  if (size < 2) throw new LinearLb1PhysicalError("linear_lb1_physical_capture_invalid");
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new LinearLb1PhysicalError("linear_lb1_physical_capture_invalid"); }
}

const path = configArg(process.argv.slice(2));
if (path === null) {
  hold("linear_lb1_physical_cli_args_invalid");
} else {
  try {
    const config = await readLinearLb1PhysicalConfig(path);
    const session = await beginLinearLb1PhysicalSession(config);
    process.stdout.write(`${JSON.stringify(session.ready_receipt)}\n`);
    const maxBytes = Math.min(1_073_741_824, config.reader_binding.resource_limits.max_total_bytes + 104_857_600);
    const capture = await readStdin(maxBytes);
    const result = await session.complete(capture);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    hold(error instanceof LinearLb1PhysicalError ? error.code : "linear_lb1_physical_cli_failed");
  }
}

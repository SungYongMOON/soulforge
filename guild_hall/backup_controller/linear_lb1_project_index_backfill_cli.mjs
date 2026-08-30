#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import {
  LinearLb1ProjectIndexBackfillError,
  backfillLinearLb1ProjectIndex,
} from "./linear_lb1_project_index_backfill.mjs";

function hold(code) {
  process.stdout.write(`${JSON.stringify({
    schema_version: "soulforge.backup_controller.linear_lb1.project_index_backfill_cli_result.v0",
    status: "HOLD",
    code,
    body_free: true,
  })}\n`);
  process.exitCode = 2;
}

const argv = process.argv.slice(2);
if (argv.length !== 2 || argv[0] !== "--input" || !isAbsolute(argv[1])) {
  hold("linear_lb1_project_index_backfill_cli_args_invalid");
} else {
  try {
    const bytes = await readFile(resolve(argv[1]));
    if (bytes.length < 2 || bytes.length > 64 * 1024) throw new Error("input_size");
    const result = await backfillLinearLb1ProjectIndex(JSON.parse(bytes.toString("utf8")));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    hold(error instanceof LinearLb1ProjectIndexBackfillError
      ? error.code : "linear_lb1_project_index_backfill_cli_failed");
  }
}

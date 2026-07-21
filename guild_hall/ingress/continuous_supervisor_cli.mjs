#!/usr/bin/env node

import process from "node:process";
import {
  CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
  runContinuousSupervisor,
  safeSupervisorErrorCode,
} from "./continuous_supervisor.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArgs(tokens) {
  const result = {};
  const seen = new Set();
  const values = new Set(["config", "config-digest"]);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) fail("continuous_supervisor_unexpected_argument");
    const key = token.slice(2);
    if (seen.has(key) || (key !== "apply" && !values.has(key))) {
      fail("continuous_supervisor_unknown_or_duplicate_argument");
    }
    seen.add(key);
    if (key === "apply") {
      result.apply = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) fail(`continuous_supervisor_${key}_required`);
    result[key] = value;
    index += 1;
  }
  return result;
}

const controller = new AbortController();
for (const name of ["SIGINT", "SIGTERM"]) {
  process.once(name, () => controller.abort());
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply !== true) fail("continuous_supervisor_apply_required");
  if (!args.config) fail("continuous_supervisor_config_required");
  if (!args["config-digest"]) fail("continuous_supervisor_config_digest_required");

  await runContinuousSupervisor({
    bindingPath: args.config,
    bindingDigest: args["config-digest"],
    apply: true,
    signal: controller.signal,
    emit: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
  });
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schema_version: CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
    event: "supervisor_failed",
    code: safeSupervisorErrorCode(error),
  })}\n`);
  process.exitCode = 2;
}

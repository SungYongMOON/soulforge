#!/usr/bin/env node

import process from "node:process";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadContinuousBinding } from "./continuous_runner.mjs";
import {
  CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
  assertRunnableBinding,
  createSupervisorHeartbeatRecorder,
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
    if (seen.has(key) || (!["apply", "preflight"].includes(key) && !values.has(key))) {
      fail("continuous_supervisor_unknown_or_duplicate_argument");
    }
    seen.add(key);
    if (key === "apply" || key === "preflight") {
      result[key] = true;
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
  if (args.preflight && args.apply) fail("continuous_supervisor_preflight_apply_conflict");
  if (!args.preflight && args.apply !== true) fail("continuous_supervisor_apply_required");
  if (!args.config) fail("continuous_supervisor_config_required");
  if (!args["config-digest"]) fail("continuous_supervisor_config_digest_required");
  if (args.preflight) {
    const binding = await loadContinuousBinding(args.config, { bindingDigest: args["config-digest"] });
    assertRunnableBinding(binding);
    process.stdout.write(`${JSON.stringify({ schema_version: CONTINUOUS_SUPERVISOR_EVENT_SCHEMA, event: "preflight_passed", writes_performed: 0 })}\n`);
    process.exit(0);
  }
  const pauseRef = path.resolve(path.dirname(args.config), "continuous-supervisor.pause");
  if (existsSync(pauseRef)) controller.abort();
  const pauseMonitor = setInterval(() => {
    if (existsSync(pauseRef)) controller.abort();
  }, 1000);
  pauseMonitor.unref();

  try {
    const recordHeartbeat = createSupervisorHeartbeatRecorder({
      bindingPath: args.config,
    });
    await runContinuousSupervisor({
      bindingPath: args.config,
      bindingDigest: args["config-digest"],
      apply: true,
      signal: controller.signal,
      emit: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
      recordHeartbeat,
    });
  } finally {
    clearInterval(pauseMonitor);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schema_version: CONTINUOUS_SUPERVISOR_EVENT_SCHEMA,
    event: "supervisor_failed",
    code: safeSupervisorErrorCode(error),
  })}\n`);
  process.exitCode = 2;
}

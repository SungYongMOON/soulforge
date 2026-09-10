#!/usr/bin/env node

import process from "node:process";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  continuousVoiceLabelSupervisorEventSchemaVersion,
  runContinuousVoiceLabelSupervisor,
  safeVoiceLabelSupervisorErrorCode,
} from "./continuous_label_supervisor.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArgs(tokens) {
  const result = {};
  const values = new Set([
    "repo-root",
    "voice-root",
    "profile",
    "profile-sha256",
    "asr-sha256",
    "state-root",
    "max-asr-sessions",
    "max-label-sessions",
    "poll-seconds",
  ]);
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) fail("voice_label_supervisor_unexpected_argument");
    const key = token.slice(2);
    if (seen.has(key) || (!["apply", "preflight"].includes(key) && !values.has(key))) {
      fail("voice_label_supervisor_unknown_or_duplicate_argument");
    }
    seen.add(key);
    if (key === "apply" || key === "preflight") {
      result[key] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) fail(`voice_label_supervisor_${key}_required`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function required(args, key) {
  if (!args[key]) fail(`voice_label_supervisor_${key}_required`);
  return args[key];
}

const controller = new AbortController();
for (const signalName of ["SIGINT", "SIGTERM"]) {
  process.once(signalName, () => controller.abort());
}

let pauseMonitor;
try {
  const args = parseArgs(process.argv.slice(2));
  if (args.preflight && args.apply) fail("voice_label_supervisor_preflight_apply_conflict");
  if (!args.preflight && args.apply !== true) fail("voice_label_supervisor_apply_required");
  const options = {
    repoRoot: required(args, "repo-root"),
    voiceRoot: required(args, "voice-root"),
    profileRef: required(args, "profile"),
    expectedProfileSha256: required(args, "profile-sha256"),
    expectedAsrSha256: required(args, "asr-sha256"),
    stateRoot: required(args, "state-root"),
    maxAsrSessions: args["max-asr-sessions"],
    maxLabelSessions: args["max-label-sessions"],
    pollSeconds: args["poll-seconds"],
    apply: true,
    signal: controller.signal,
    emit: (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
  };
  if (args.preflight) {
    const poll = Number(args["poll-seconds"] ?? 900);
    if (!Number.isSafeInteger(poll) || poll < 60 || poll > 86400) fail("voice_label_supervisor_poll_seconds_invalid");
    const { runContinuousVoiceLabelWorker } = await import("./continuous_label_worker.mjs");
    const result = await runContinuousVoiceLabelWorker({ ...options, apply: false, preflightOnly: true });
    process.stdout.write(`${JSON.stringify({ schema_version: result.schema_version, status: result.status, preflight_ok: result.preflight_ok, writes_performed: 0 })}\n`);
    if (result.status !== "preflight_passed") process.exitCode = 2;
  } else {
    const pauseRef = path.resolve(options.stateRoot, "continuous-label-supervisor.pause");
    if (existsSync(pauseRef)) controller.abort();
    pauseMonitor = setInterval(() => { if (existsSync(pauseRef)) controller.abort(); }, 1000);
    pauseMonitor.unref();
    await runContinuousVoiceLabelSupervisor(options);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schema_version: continuousVoiceLabelSupervisorEventSchemaVersion,
    event: "supervisor_failed",
    code: safeVoiceLabelSupervisorErrorCode(error),
  })}\n`);
  process.exitCode = 2;
} finally {
  if (pauseMonitor) clearInterval(pauseMonitor);
}

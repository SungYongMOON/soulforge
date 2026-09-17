#!/usr/bin/env node

import process from "node:process";

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
    if (seen.has(key) || (key !== "apply" && !values.has(key))) {
      fail("voice_label_supervisor_unknown_or_duplicate_argument");
    }
    seen.add(key);
    if (key === "apply") {
      result.apply = true;
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

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply !== true) fail("voice_label_supervisor_apply_required");
  await runContinuousVoiceLabelSupervisor({
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
  });
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schema_version: continuousVoiceLabelSupervisorEventSchemaVersion,
    event: "supervisor_failed",
    code: safeVoiceLabelSupervisorErrorCode(error),
  })}\n`);
  process.exitCode = 2;
}

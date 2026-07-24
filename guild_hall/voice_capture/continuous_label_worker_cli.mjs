#!/usr/bin/env node

import process from "node:process";

import { runContinuousVoiceLabelWorker } from "./continuous_label_worker.mjs";

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
  ]);
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) fail("voice_label_worker_unexpected_argument");
    const key = token.slice(2);
    if (seen.has(key) || (key !== "apply" && !values.has(key))) {
      fail("voice_label_worker_unknown_or_duplicate_argument");
    }
    seen.add(key);
    if (key === "apply") {
      result.apply = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) fail(`voice_label_worker_${key}_required`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function required(args, key) {
  if (!args[key]) fail(`voice_label_worker_${key}_required`);
  return args[key];
}

function safeErrorCode(error) {
  const candidate = String(error?.code ?? error?.message ?? "voice_label_worker_failed");
  return /^[a-z0-9_]{1,128}$/u.test(candidate) ? candidate : "voice_label_worker_failed";
}

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await runContinuousVoiceLabelWorker({
    repoRoot: required(args, "repo-root"),
    voiceRoot: required(args, "voice-root"),
    profileRef: required(args, "profile"),
    expectedProfileSha256: required(args, "profile-sha256"),
    expectedAsrSha256: required(args, "asr-sha256"),
    stateRoot: args["state-root"],
    maxAsrSessions: args["max-asr-sessions"],
    maxLabelSessions: args["max-label-sessions"],
    apply: args.apply === true,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (["blocked", "degraded"].includes(result.status)) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    schema_version: "soulforge.voice.continuous_label_worker_error.v1",
    status: "failed",
    code: safeErrorCode(error),
  })}\n`);
  process.exitCode = 2;
}
